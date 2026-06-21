import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import GeneralConfigPage from "../../pageObjects/GeneralConfigPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import InventoryActionStockOutPage from "../../pageObjects/InventoryActionStockOutPage";
import WorkOrderPage from "../../pageObjects/WorkOrderPage";
import "cypress-file-upload";
import{ importAttributesAndCategories ,deleteCategories ,deleteAllCommonAttributes} from "./attributeHelpers";
/**
 * Standalone export: create a work-order via UI and optionally scan one serial into it.
 * @param {object} workOrderPage - WorkOrderPage page-object instance
 * @param {object} incomingInvPage - IncomingInvPage page-object instance
 * @param {string} woApiPath - API path for work-orders (e.g. "/work-orders")
 * @param {string} searchTerm - product display name to search in the WO modal
 * @param {number} quantity - quantity to reserve
 * @param {string} stamp - unique stamp used for the intercept alias
 * @param {string} [serialNumber] - if provided, scan this serial into the created WO
 */
export function reserveViaWorkOrderUI(workOrderPage, incomingInvPage, woApiPath, searchTerm, quantity, stamp, serialNumber) {
  workOrderPage.visit();
  cy.intercept("POST", `**${woApiPath}`).as(`createWorkOrder${stamp}`);
  workOrderPage.clickCreateWorkOrderBtn();
  workOrderPage.clickProductField();
  workOrderPage.verifyAddProductModalVisible();
  cy.findByLabelText(/Search Product/i)
    .clear()
    .type(searchTerm);
  cy.findByRole("button", { name: /^search$/i }).click();
  workOrderPage.verifyAddProductModalListVisible();

  cy.findByRole("dialog")
    .contains(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
    .first()
    .should("be.visible");

  workOrderPage.clickProductInModal();
  workOrderPage.clickAddProductModalAddBtn();
  workOrderPage.verifyAddProductModalNotVisible();
  workOrderPage.typeQuantity(quantity.toString());
  workOrderPage.clickCreateSubmitBtn();

  cy.wait(`@createWorkOrder${stamp}`, { timeout: 20000 }).then(({ response }) => {
    expect(response?.statusCode).to.be.oneOf([200, 201]);
    if (!serialNumber) {
      incomingInvPage.clickIncomingInventoryNav();
      return;
    }

    const woNum = response?.body?.data?.workOrderNumber;
    const woId = response?.body?.data?.id;
    expect(woNum).to.exist;
    expect(woId).to.exist;

    workOrderPage.visitDetail(woNum, woId);
    Cypress.once("uncaught:exception", () => false);
    workOrderPage.clickScanBtn();
    cy.get('input[name="serialNumber"]', { timeout: 10000 })
      .should("be.visible")
      .type(`${serialNumber}{enter}`);
    cy.contains(serialNumber, { timeout: 10000 }).should("exist");
    cy.contains("button", /^DONE$/i).click({ force: true });
    incomingInvPage.clickIncomingInventoryNav();
  });
}

export function createScanAllSuite() {
  let incomingInvPage;
  let invViewPage;
  let generalConfigPage;
  let purchaseOrderPage;
  let inventoryActionStockOutPage;
  let workOrderPage;
  let scanAllMissingData;
  let scanAllData;

  const createdPOs = [];

  function ramRow(overrides = {}, stamp = null) {
    // Header `RAMbrand` (no space) matches the attribute name in
    // testDataAttributes.json (id 1290, fieldName "rambrand"). Using
    // "RAM Brand" silently drops the column on import so the product is
    // never created, leaving the PO empty and breaking every product-only
    // test that follows.
    //
    // Optional `stamp` is appended to "Memory Generation" (free-text
    // attribute) to give each test a unique productId — required for
    // setups that depend on stockOut / WO-reserve applying to *this* PO.
    // `adjustAcrossPOs` (product.service.ts) globally picks the oldest PO
    // with available quantity for the productId, ignoring any user-supplied
    // poNumber, so without per-test product isolation a previous test's PO
    // with leftover availability gets drained first and this test's
    // badges stay wrong.
    //
    // RAMbrand is a list-typed attribute (allowed values: Corsair / GSkill
    // / Kingston / ADATA), so we cannot stamp the brand — we'd be rejected
    // at import as "invalid list value".
    return {
      Category: scanAllData.categories.ram,
      RAMbrand: scanAllData.products.ram.brand,
      "Memory Generation": stamp
        ? `${scanAllData.products.ram.memoryGeneration}-${stamp}`
        : scanAllData.products.ram.memoryGeneration,
      Cost: scanAllData.products.ram.cost,
      Price: scanAllData.products.ram.price,
      "Support Contact": scanAllData.products.ram.supportContact,
      Quantity: scanAllData.products.ram.defaultQuantity,
      ...overrides,
    };
  }

  function laptopRow(serialNumber, overrides = {}, stamp = null) {
    return {
      Category: scanAllData.categories.laptop,
      "Model Number": stamp
        ? `${scanAllData.products.laptop.modelNumber}-${stamp}`
        : scanAllData.products.laptop.modelNumber,
      Brand: scanAllData.products.laptop.brand,
      Cost: scanAllData.products.laptop.cost,
      Price: scanAllData.products.laptop.price,
      "Support Contact": scanAllData.products.laptop.supportContact,
      "Serial Number": serialNumber,
      "Asset Tag ID": `ASSET-${serialNumber}`,
      "Asset Security Code": `ASC-${serialNumber}`,
      ...overrides,
    };
  }

  function getApiBaseUrl() {
    const apiBaseUrl = Cypress.env("API_BASE_URL");
    expect(apiBaseUrl, "Cypress env API_BASE_URL must be configured").to.be.a(
      "string",
    ).and.not.empty;
    return apiBaseUrl;
  }

  function apiRequest({
    method,
    endpoint,
    body,
    qs,
    failOnStatusCode = false,
  }) {
    return cy.getAuthToken().then((token) => {
      return cy.request({
        method,
        url: `${getApiBaseUrl()}${endpoint}`,
        headers: { Authorization: `Bearer ${token}` },
        body,
        qs,
        failOnStatusCode,
      });
    });
  }

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  // ───── API seeding helpers ─────────────────────────────────────────────────
  // Used by regression setups so we don't drive the slow / occasionally-buggy
  // UI flow (notably work-order scan) just to put items into a baseline state.

  // Common assertion: every API seed step MUST succeed (HTTP 2xx + envelope
  // success !== false). Test data is meaningless if seeding silently failed.
  // Also appends to cypress/logs/api_seed.log so we can see what happened in
  // headless runs (cy.log is suppressed there).
  function assertSeedSuccess(res, label) {
    const entry = {
      label,
      status: res.status,
      success: res.body?.success,
      error: res.body?.error ?? null,
      message:
        res.body?.data?.[0]?.message ??
        res.body?.data?.message ??
        null,
    };
    cy.task(
      "writeLog",
      {
        filePath: "cypress/logs/api_seed.log",
        message: JSON.stringify(entry),
      },
      { log: false },
    );
    expect(res.status, `${label} HTTP status`).to.be.lessThan(400);
    if (res.body && Object.prototype.hasOwnProperty.call(res.body, "success")) {
      expect(
        res.body.success,
        `${label} envelope success (error=${JSON.stringify(res.body?.error)})`,
      ).to.not.equal(false);
    }
  }

  function apiMarkStatusItem(poNumber, serialNumber, status, damageReason) {
    const body = { poNumber, serialNumbers: [serialNumber], status };
    if (status === "Damaged") {
      body.damageReason =
        damageReason || scanAllData.defaults.damageReason || "Physical Damage";
    }
    return apiRequest({
      method: "POST",
      endpoint: "/incoming-items/mark-status",
      body,
    }).then((res) => assertSeedSuccess(res, `mark-status ${status} ${serialNumber}`));
  }

  function apiMarkStatusProduct(poNumber, productId, quantity, status, damageReason) {
    const body = {
      poNumber,
      productIdsArray: [{ productId: Number(productId), quantity }],
      status,
    };
    if (status === "Damaged") {
      body.damageReason =
        damageReason || scanAllData.defaults.damageReason || "Physical Damage";
    }
    return apiRequest({
      method: "POST",
      endpoint: "/incoming-items/mark-status",
      body,
    }).then((res) =>
      assertSeedSuccess(res, `product mark-status ${status} pid=${productId} qty=${quantity}`),
    );
  }

  function apiScanItem(poNumber, serialNumber) {
    return apiRequest({
      method: "POST",
      endpoint: "/incoming-items/scan",
      body: { poNumber, serialNumber },
    }).then((res) => assertSeedSuccess(res, `scan ${serialNumber}`));
  }

  function apiCheckInProduct(poNumber, productId, quantity) {
    return apiRequest({
      method: "POST",
      endpoint: "/incoming-items/check-in",
      body: {
        poNumber,
        productID: Number(productId),
        quantity: Number(quantity),
      },
    }).then((res) => assertSeedSuccess(res, `check-in pid=${productId} qty=${quantity}`));
  }

  function apiStockOutBySerial(serialNumber, reason, description) {
    return apiRequest({
      method: "POST",
      endpoint: "/products/stockout-by-serial-number",
      body: {
        serialNumber,
        reason,
        description: description || "Automation API stock-out",
      },
    }).then((res) => assertSeedSuccess(res, `stockout-by-serial ${serialNumber} reason=${reason}`));
  }

  function apiStockOutProduct(poNumber, productId, quantity, reason, referenceNumber) {
    return apiRequest({
      method: "POST",
      endpoint: "/products/stock-out",
      body: {
        id: Number(productId),
        poNumber,
        quantity: Number(quantity),
        reason,
        description: scanAllData.defaults.stockOutDescription,
        level: "Product",
        referenceNumber: referenceNumber || `SW-API-${ts()}`,
      },
    }).then((res) =>
      assertSeedSuccess(res, `stock-out product pid=${productId} qty=${quantity} reason=${reason}`),
    );
  }

  // Look up a product (and its DB id) for the given PO + search term. Used
  // when seeding a Reserved state via API which needs a productId.
  function apiGetProductIdByPo(poNumber, search) {
    return apiRequest({
      method: "GET",
      endpoint: "/incoming-items",
      qs: { poNumber, search, page: 1, page_size: 5 },
    }).then((res) => {
      const list =
        res.body?.data?.list ||
        res.body?.data?.data?.list ||
        res.body?.data ||
        [];
      const arr = Array.isArray(list) ? list : list.list || [];
      const first = arr?.[0];
      const id = first?.id ?? first?.productId;
      expect(id, `productId for po=${poNumber} search=${search}`).to.exist;
      return cy.wrap(Number(id));
    });
  }

  function apiCreateWorkOrder(productId, productName, quantity) {
    return apiRequest({
      method: "POST",
      endpoint: "/work-orders",
      body: {
        status: "Open",
        products: [
          {
            productId: Number(productId),
            name: productName || scanAllData.defaults.fallbackProductName,
            partNumber: scanAllData.defaults.fallbackPartNumber,
            quantity: Number(quantity),
          },
        ],
      },
    }).then((res) => {
      assertSeedSuccess(res, `create work-order pid=${productId} qty=${quantity}`);
      const wo = res.body?.data || res.body?.data?.data;
      expect(wo, "work-order create response").to.exist;
      return cy.wrap(wo);
    });
  }

  function apiScanWorkOrder(workOrderNumber, productId, serialNumber) {
    return apiRequest({
      method: "POST",
      endpoint: "/work-orders/scan",
      body: {
        workOrderNumber,
        productId: Number(productId),
        serialNumber,
      },
    }).then((res) => assertSeedSuccess(res, `wo-scan WO=${workOrderNumber} sn=${serialNumber}`));
  }

  // Reserve via API: create WO + (optionally) scan a serial into it.
  // Replaces reserveViaWorkOrderUI for setup paths to avoid the buggy
  // bundle error in the WO-scan UI.
  function apiReserveViaWorkOrder(poNumber, searchTerm, quantity, serialNumber) {
    return apiGetProductIdByPo(poNumber, searchTerm).then((productId) => {
      return apiCreateWorkOrder(productId, searchTerm, quantity).then((wo) => {
        const woNum = wo?.workOrderNumber || wo?.data?.workOrderNumber;
        expect(woNum, "workOrderNumber").to.exist;
        if (!serialNumber) return cy.wrap(null);
        return apiScanWorkOrder(woNum, productId, serialNumber);
      });
    });
  }

  // Snapshot the BE order-report counts for a PO to help debug seeding.
  // Logs to cypress/logs/api_seed.log, does NOT assert anything.
  function apiDumpOrderReports(poNumber, label) {
    return apiRequest({
      method: "GET",
      endpoint: "/incoming-items/reports",
      qs: { poNumber },
    }).then((res) => {
      cy.task(
        "writeLog",
        {
          filePath: "cypress/logs/api_seed.log",
          message: JSON.stringify({
            label: `[ORDER-REPORTS:${label}] po=${poNumber}`,
            status: res.status,
            body: res.body,
          }).slice(0, 2000),
        },
        { log: false },
      );
    });
  }

  function createExcelFile(fileName, data) {
    const filePath = `cypress/fixtures/${fileName}`;
    cy.task("createExcelFile", { filePath, data }).then((msg) => cy.log(msg));
  }

  function importExcel(fileName, poNumber) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.clickImport();
    incomingInvPage.enterPONumber(poNumber);
    incomingInvPage.uploadFile(fileName);
    incomingInvPage.clickUpload();
    cy.contains("button", /^OK$/, { timeout: 30000 })
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    incomingInvPage.validateRedirectedURL();
  }

  function interceptConfigScanAll(alias = "configLoad") {
    cy.intercept("GET", "**/configs*type=general*", (req) => {
      req.continue((res) => {
        try {
          const body = JSON.parse(JSON.stringify(res.body));
          const list = body?.data?.list || [];
          if (list[0]?.configJson?.data) {
            list[0].configJson.data.enableScanAll = true;
            // Disable enablePoForDamaging so the Change Status dialog
            // doesn't ask for a PO selection on product-only categories.
            // The dialog's PoList only fetches POs with availableQuantity>0
            // (poDetail.service.ts:3349), but our test PO has only Incoming
            // quantity at the moment of the mark-status call — so the
            // dropdown comes back empty and there's no way to satisfy the
            // FE "PO required" check.
            list[0].configJson.data.enablePoForDamaging = false;
            // Guarantee at least one damage reason so applyStatusViaDialog's
            // fallback cy.get('[role="option"]').first() always finds an option.
            // QA environment currently returns an empty list from the configs API.
            if (!list[0].configJson.data.damageReason?.length) {
              list[0].configJson.data.damageReason = ["Physical Damage"];
            }
          }
          res.body = body;
        } catch (e) {
          /* ignore */
        }
      });
    }).as(alias);
  }

  function forceEnableScanAllInStorage(win) {
    try {
      const raw = win.localStorage.getItem("stock-wise");
      const stored = raw ? JSON.parse(raw) : {};
      if (!stored.config) stored.config = {};
      if (!stored.config.config) stored.config.config = {};
      stored.config.config.enableScanAll = true;
      win.localStorage.setItem("stock-wise", JSON.stringify(stored));
    } catch (e) {
      /* ignore */
    }
  }

  function selectPO(poNumber) {
    cy.get("body").type("{esc}", { force: true });
    cy.get(
      'a[aria-label="Incoming Inventory"][href="/incoming-inventory"]',
    ).click({ force: true });
    incomingInvPage.selectPoNumber(poNumber);
  }

  // Same as selectPO but force-remounts the page so the React-Query cache is
  // discarded. Use after API-based seeding (apiMarkStatusItem etc.) — the
  // FE's `incomingReports` cache holds the post-import state and only the
  // dialog mutations invalidate it; mixing API mutations and a single UI
  // mutation leaves stale Damaged/Disputed/StockedOut counts in the badges
  // until the page is remounted.
  function selectPOFresh(poNumber) {
    selectPO(poNumber);
    cy.reload();
    incomingInvPage.selectPoNumber(poNumber);
  }

  function stockInProduct(searchTerm, quantity) {
    invViewPage.searchProduct(searchTerm);
    invViewPage.clickSubmitSearch();
    incomingInvPage.performCheckIn(quantity.toString());
  }

  function scanSerialNumbers(poNumber, serialNumbers) {
    incomingInvPage.clickScanButton();
    cy.url().should("include", "scan-items");
    serialNumbers.forEach((sn) => {
      cy.intercept("GET", "**/incoming-items/reports**").as("scanReport");
      incomingInvPage.scanSerialNumber(sn);
      cy.wait("@scanReport", { timeout: 15000 });
    });
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(poNumber);
  }

  function openChangeStatusDialog(poNumber, searchTerm) {
    selectPO(poNumber);
    invViewPage.searchProduct(searchTerm);
    invViewPage.clickSubmitSearch();

    cy.get("tbody tr")
      .first()
      .find('button[id="long-button"]')
      .click({ force: true });
    cy.contains("Change Status").click({ force: true });
    cy.get('[role="dialog"]').should("be.visible");
  }

  function applyStatusViaDialog({
    status,
    serialNumber,
    quantity,
    damageReason,
    poNumber,
  }) {
    cy.get('[role="dialog"]')
      .contains("Choose Status")
      .first()
      .click({ force: true });
    cy.get('[role="option"]').contains(status).click({ force: true });

    if (status === scanAllData.status.damaged) {
      cy.get('[role="dialog"]')
        .contains("Select damage reason")
        .should("exist");
      cy.get('[role="dialog"]')
        .contains("Select damage reason")
        .first()
        .click({ force: true });
      if (damageReason) {
        cy.get('[role="option"]').contains(damageReason).click({ force: true });
      } else {
        cy.get('[role="option"]').first().click({ force: true });
      }
    }

    // Defensive: if the "Select Purchase Order" dropdown still shows up
    // (config intercept slipped through, etc.), pick the first option.
    cy.get("body").then(($body) => {
      if ($body.find('[role="dialog"]:contains("Select Purchase Order")').length > 0) {
        cy.get('[role="dialog"]')
          .find('[id^="react-select-"][id$="-input"]')
          .filter(":visible")
          .first()
          .click({ force: true });
        cy.get('[role="dialog"] [class*="-menu"]', { timeout: 10000 })
          .should("be.visible")
          .find('[class*="-option"]')
          .first()
          .click({ force: true });
      }
    });

    if (serialNumber) {
      cy.get("#serialNumberForReport")
        .should("be.visible")
        .clear()
        .type(serialNumber, { delay: 50 });
    }

    if (quantity !== undefined && quantity !== null) {
      cy.get("#quantity")
        .should("be.visible")
        .clear()
        .type(quantity.toString());
    }

    cy.get("body").then(($body) => {
      if ($body.find('[role="dialog"]:contains("Choose Source")').length > 0) {
        cy.get('[role="dialog"]')
          .contains("Choose Source")
          .click({ force: true });
        cy.get('[role="option"]').first().click({ force: true });
      }
    });

    cy.intercept("POST", "**/incoming-items/mark-status**").as("markStatusUI");
    cy.get('[role="dialog"]')
      .contains("button", /^Update$/i)
      .should("be.visible")
      .click({ force: true });
    cy.wait("@markStatusUI", { timeout: 15000 }).then(({ request, response }) => {
      cy.task(
        "writeLog",
        {
          filePath: "cypress/logs/api_seed.log",
          message: JSON.stringify({
            label: `[DIALOG-MARK-STATUS] status=${status}`,
            requestBody: request?.body,
            statusCode: response?.statusCode,
            responseBody: response?.body,
          }).slice(0, 2000),
        },
        { log: false },
      );
      expect(response?.statusCode).to.be.oneOf([200, 201]);
    });
    cy.contains("successfully", { timeout: 10000 }).should("exist");

    cy.get("body").then(($body) => {
      if ($body.find('[role="dialog"]').length > 0) {
        cy.get('[role="dialog"]')
          .contains("button", /^Cancel$/i)
          .click({ force: true });
      }
    });
  }

  function stockOutItemViaUI(serialNumber, reason, stamp) {
    cy.visit("/MobileViewScreen");
    inventoryActionStockOutPage.clickStockOutButton();
    inventoryActionStockOutPage.clickStockOutItems();
    inventoryActionStockOutPage.selectReason(reason);
    inventoryActionStockOutPage.typeDescription(
      scanAllData.defaults.stockOutDescription,
    );
    cy.get("body").then(($body) => {
      if ($body.find('input[name="referenceNumber"]').length > 0) {
        cy.get('input[name="referenceNumber"]').type(`WO-SCAN-ALL-${stamp}`);
      }
    });
    cy.contains("button", /^Next$/i, { timeout: 10000 }).click({ force: true });

    cy.get("body").then(($body) => {
      if ($body.find("input#sn").length > 0) {
        cy.get("input#sn").type(serialNumber);
      } else {
        cy.get('input[name="serialNumber"]', { timeout: 10000 }).type(
          serialNumber,
        );
      }
    });
    cy.intercept("POST", `**${scanAllData.api.stockOutBySerial}`).as(
      `stockOutBySerial${stamp}`,
    );
    inventoryActionStockOutPage.clickStockOutButton();
    cy.wait(`@stockOutBySerial${stamp}`, { timeout: 15000 }).then(
      ({ response }) => {
        expect(response?.statusCode).to.be.oneOf([200, 201]);
      },
    );
    incomingInvPage.clickIncomingInventoryNav();
  }

  function stockOutProductViaUI(poNumber, quantity, reason, stamp) {
    cy.visit(
      `/MobileViewScreen/stock-out-products?poId=${encodeURIComponent(poNumber)}`,
    );
    cy.get('input[type="number"]:visible', { timeout: 15000 })
      .first()
      .clear()
      .type(quantity.toString());
    cy.contains("button", /^Next$/i, { timeout: 10000 }).click({ force: true });
    cy.get('input[id^="react-select-"]', { timeout: 10000 })
      .first()
      .type(`${reason}{enter}`, { force: true });
    cy.get("textarea", { timeout: 10000 })
      .first()
      .clear()
      .type(scanAllData.defaults.stockOutDescription);
    cy.get("#stockout-products-reference-number", { timeout: 10000 })
      .clear()
      .type(`SW-${stamp}`);
    cy.get("input#quantity:visible", { timeout: 10000 })
      .first()
      .clear()
      .type(quantity.toString());
    cy.intercept("POST", `**${scanAllData.api.stockOutProduct}`).as(
      `stockOutProduct${stamp}`,
    );
    cy.contains("button", /^Stock Out$/i, { timeout: 10000 }).click({
      force: true,
    });
    cy.wait(`@stockOutProduct${stamp}`, { timeout: 15000 }).then(
      ({ response }) => {
        expect(response?.statusCode).to.be.oneOf([200, 201]);
      },
    );
    incomingInvPage.clickIncomingInventoryNav();
  }

  function reserveViaWorkOrderUI(searchTerm, quantity, stamp, serialNumber) {
    workOrderPage.visit();
    cy.intercept("POST", `**${scanAllData.api.workOrders}`).as(
      `createWorkOrder${stamp}`,
    );
    workOrderPage.clickCreateWorkOrderBtn();
    workOrderPage.clickProductField();
    workOrderPage.verifyAddProductModalVisible();
    cy.findByLabelText(/Search Product/i)
      .clear()
      .type(searchTerm);
    cy.findByRole("button", { name: /^search$/i }).click();
    workOrderPage.verifyAddProductModalListVisible();

    cy.findByRole("dialog")
      .contains(
        new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      )
      .first()
      .should("be.visible");

    workOrderPage.clickProductInModal();
    workOrderPage.clickAddProductModalAddBtn();
    workOrderPage.verifyAddProductModalNotVisible();
    workOrderPage.typeQuantity(quantity.toString());
    workOrderPage.clickCreateSubmitBtn();

    cy.wait(`@createWorkOrder${stamp}`, { timeout: 20000 }).then(
      ({ response }) => {
        expect(response?.statusCode).to.be.oneOf([200, 201]);
        if (!serialNumber) {
          incomingInvPage.clickIncomingInventoryNav();
          return;
        }

        const woNum = response?.body?.data?.workOrderNumber;
        const woId = response?.body?.data?.id;
        expect(woNum).to.exist;
        expect(woId).to.exist;

        workOrderPage.visitDetail(woNum, woId);
        Cypress.once("uncaught:exception", () => false);
        workOrderPage.clickScanBtn();
        cy.get('input[name="serialNumber"]', { timeout: 10000 })
          .should("be.visible")
          .type(`${serialNumber}{enter}`);
        cy.contains(serialNumber, { timeout: 10000 }).should("exist");
        cy.contains("button", /^DONE$/i).click({ force: true });
        incomingInvPage.clickIncomingInventoryNav();
      },
    );
  }

  function clickScanAll(expectError = false) {
    cy.intercept("POST", `**${scanAllData.api.scanAll}`).as("scanAllRequest");
    cy.get(".MuiIconButton-root#basic-button", { timeout: 10000 })
      .should("be.visible")
      .click({ force: true });
    cy.get("#basic-menu", { timeout: 5000 }).should("be.visible");
    cy.get("#basic-menu")
      .contains("Scan All", { timeout: 10000 })
      .should("be.visible")
      .click({ force: true });
    cy.wait("@scanAllRequest", { timeout: 20000 }).then(({ response }) => {
      if (expectError) {
        expect(response?.statusCode).to.eq(400);
      } else {
        expect(response?.statusCode).to.be.oneOf([200, 201]);
      }
    });
  }

  function verifyScanAllSuccess(poNumber) {
    cy.contains(`All item scanned against ${poNumber} purchase order.`).should(
      "exist",
    );
    cy.get("body").then(($body) => {
      if ($body.find("button").filter(':contains("OK")').length > 0) {
        cy.contains("button", /^OK$/i).click({ force: true });
      }
    });
  }

  function verifyScanAllError(expectedMessage) {
    cy.contains(expectedMessage).should("exist");
  }

  function validateBadgeCount(label, expectedValue) {
    cy.contains("span.MuiTypography-caption", label)
      .parent()
      .find("h6.MuiTypography-h6")
      .should("have.text", expectedValue.toString());
  }

  function validateAllBadges(badges) {
    Object.entries(badges).forEach(([label, value]) => {
      validateBadgeCount(label, value);
    });
  }

  function getCase(tcId) {
    const found = scanAllMissingData?.cases?.find((c) => c.id === tcId);
    expect(found, `${tcId} must exist in scanAllMissingTestData.json`).to.exist;
    return found;
  }

  function validateZeroBadges() {
    scanAllData.badgeLabels.alwaysZero.forEach((label) =>
      validateBadgeCount(label, 0),
    );
  }

  before(() => {
    cy.fixture("scanAllTestData").then((data) => {
      scanAllData = data;
    });
    cy.fixture("scanAllMissingTestData").then((data) => {
      scanAllMissingData = data;
    });
    cy.session("user-session", () => {
      cy.visit("/");
      cy.login();
    });
    cy.visit("/");
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    cy.get('input[name="enableScanAll"]').then(($el) => {
      if ($el.is(":checked")) {
        cy.wrap($el).click({ force: true });
        cy.contains(scanAllData.messages.settingsUpdated, {
          timeout: 5000,
        }).should("exist");
        cy.contains(scanAllData.messages.settingsUpdated, {
          timeout: 10000,
        }).should("not.exist");
      }
      cy.get('input[name="enableScanAll"]').click({ force: true });
      cy.contains(scanAllData.messages.settingsUpdated, {
        timeout: 5000,
      }).should("exist");
    });
    gcPage.assertToggleEnabled("enableScanAll");

      importAttributesAndCategories();
  });

  beforeEach(() => {
    cy.on("uncaught:exception", (err) => {
      if (err?.message?.includes("Request failed with status code")) {
        return false;
      }
      // Known minified bundle error fired by the work-order scan flow after
      // a serial-number {enter}; only swallow when the stack points at the
      // built bundle so legitimate test errors still surface.
      const stack = typeof err?.stack === "string" ? err.stack : "";
      if (
        err?.message === "e is not a function" &&
        /(?:\/assets\/.*\.js|bundle\.js|chunk[-\w]*\.js)/.test(stack)
      ) {
        return false;
      }
    });
    cy.session("user-session", () => {
      cy.visit("/");
      cy.login();
    });
    interceptConfigScanAll("configLoad");
    cy.visit("/", { onBeforeLoad: forceEnableScanAllInStorage });
    cy.wait("@configLoad", { timeout: 15000 });
    cy.window({ timeout: 5000 }).should((win) => {
      const stored = JSON.parse(win.localStorage.getItem("stock-wise") || "{}");
      expect(stored?.config?.config?.enableScanAll).to.eq(true);
    });
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    generalConfigPage = new GeneralConfigPage();
    purchaseOrderPage = new PurchaseOrderPage();
    inventoryActionStockOutPage = new InventoryActionStockOutPage();
    workOrderPage = new WorkOrderPage();
  });

  after(() => {
    cy.session("user-session", () => {
      cy.visit("/");
      cy.login();
    });
    cy.visit("/");

    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("enableScanAll");

    if (createdPOs.length > 0) {
      const incPage = new IncomingInvPage();
      createdPOs.forEach((po) => {
        incPage.navigateToPOTab();
        cy.intercept("GET", "**/purchase-orders*").as("poSearch");
        cy.get("#searchInputRef", { timeout: 20000 })
          .should("be.visible")
          .clear()
          .type(po);
        cy.wait("@poSearch", { timeout: 15000 });
        cy.get("body").then(($body) => {
          if ($body.find(`td:contains("${po}")`).length === 0) return;

          cy.contains("td", po)
            .closest("tr")
            .find("button")
            .last()
            .click({ force: true });

          cy.get("body").then(($b) => {
            if (
              $b.find('input[placeholder="Type DELETE to confirm"]').length > 0
            ) {
              cy.get('input[placeholder="Type DELETE to confirm"]')
                .clear()
                .type("DELETE");
              cy.contains("button", /^Yes$/i).click();
            }
          });
        });
      });
    }
    deleteCategories([scanAllData.categories.ram, scanAllData.categories.laptop]);
    deleteAllCommonAttributes();

  });

  return {
    createdPOs,
    get incomingInvPage() {
      return incomingInvPage;
    },
    get invViewPage() {
      return invViewPage;
    },
    get generalConfigPage() {
      return generalConfigPage;
    },
    get purchaseOrderPage() {
      return purchaseOrderPage;
    },
    get scanAllData() {
      return scanAllData;
    },
    applyStatusViaDialog,
    clickScanAll,
    createExcelFile,
    getCase,
    importExcel,
    laptopRow,
    openChangeStatusDialog,
    ramRow,
    reserveViaWorkOrderUI,
    scanSerialNumbers,
    selectPO,
    selectPOFresh,
    stockInProduct,
    stockOutItemViaUI,
    stockOutProductViaUI,
    ts,
    validateAllBadges,
    validateZeroBadges,
    verifyScanAllError,
    verifyScanAllSuccess,
    apiRequest,
    apiMarkStatusItem,
    apiMarkStatusProduct,
    apiScanItem,
    apiCheckInProduct,
    apiStockOutBySerial,
    apiStockOutProduct,
    apiGetProductIdByPo,
    apiCreateWorkOrder,
    apiScanWorkOrder,
    apiReserveViaWorkOrder,
    apiDumpOrderReports,
  };
}