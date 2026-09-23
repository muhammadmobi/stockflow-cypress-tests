import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import { borrowGeneralConfigFlag, restoreGeneralConfigFlag } from "../../support/helpers/generalConfigApiHelpers";

describe("Stock-In Product Item by Quantity Tests (SW_INC_044 – SW_INC_048)", () => {
  let incomingInvPage, invViewPage, purchaseOrderPage;
  let td;

  // ── Shared PO state ────────────────────────────────────────────
  let sharedPO = null;
  let poCreated = false;
  // Per-run suffix so serial numbers are unique across runs (item serial is a
  // global PK — hardcoded serials collided on re-runs → duplicate-serial 400).
  const runId = `${Date.now()}`;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  function createExcelFile(fileName, data) {
    cy.task("createExcelFile", {
      filePath: `cypress/fixtures/${fileName}`,
      data,
    }).then((msg) => cy.log(msg));
  }

  /**
   * Builds laptop rows WITH serial numbers
   * One row per serial number — qty 2 = 2 rows
   */
  function laptopRows(laptopData) {
    // Use the seeded "Laptop Automation Cat" (which has Model Number / Brand
    // attributes + product-name config). The fixture's "Laptop" category and
    // Model/Make columns don't exist on QA, so the import was rejected (400).
    return laptopData.serials.map((serial) => ({
      Category: "Laptop Automation Cat",
      "Model Number": laptopData.model,
      Brand: laptopData.make,
      Cost: laptopData.cost,
      Price: laptopData.price,
      "Support Contact": laptopData.supportContact,
      "Serial Number": `${serial}-${runId}`, // stamped → unique per run
    }));
  }

  /** Import Excel into given PO, ends on /incoming-inventory */
  function importExcel(fileName, poNumber) {
    cy.getAuthToken().then((token) => {
      expect(token, "auth token for import seeding").to.be.a("string").and.not.be.empty;
      cy.task("uploadExcelToApi", {
        filePath: `cypress/fixtures/${fileName}`,
        poNumber,
        authToken: token,
        baseUrl: Cypress.env("API_BASE_URL"),
      }).then((res) => {
        cy.log(`importExcel API seed → ${poNumber}: HTTP ${res.status}, success=${res.body?.success}`);
        expect(res.status, `Excel import seed status for ${poNumber}`).to.be.oneOf([200, 201]);
        expect(
          res.body?.success,
          `Excel import seed success for ${poNumber} (error=${JSON.stringify(res.body?.error || res.body?.message)})`
        ).to.eq(true);
      });
    });
  }

  /** Search for a product in the incoming inventory table */
  function searchProduct(productName) {
    cy.intercept("GET", "**/incoming-items**").as("searchResult");
    cy.get("#searchInputRef", { timeout: 10000 })
      .should("be.visible")
      .clear()
      .type(productName);
    cy.contains("button", "Search").click();
    cy.wait("@searchResult", { timeout: 15000 });
  }

  /** Clear search to show all products */
  function clearSearch() {
    cy.get("#searchInputRef").clear();
    cy.contains("button", "Search").click();
  }

  // ---------------------------------------------------------------------------
  // Setup & Teardown
  // ---------------------------------------------------------------------------

  before(() => {
    // ── Load fixture ──
    cy.fixture("stockInByQtyData").then((data) => {
      td = data;
    });

    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();

    // Make all required attrs optional so import rows aren't rejected by
    // attrs left required=true by other specs (e.g. ImportTests).
    ensureCommonAttributesOptional();

    // SW_INC_046 verifies the over-quantity REJECT path ("exceeds the expected
    // quantity"), so the flag must be off for this spec. General Config is GLOBAL
    // state on a shared stack — borrow it through the helper, which captures the
    // prior value (collapsing "absent" to false, exactly as the backend reads it)
    // and asserts the restore landed in after().
    // Backend gate: incoming-item.service.ts checkInPreprocess.
    borrowGeneralConfigFlag("allowExceedExpectedQuantity", false);

    // ── Create shared PO with 5 products (one per test) ──
    cy.then(() => {
      const stamp = ts();
      sharedPO = `PO-StockInItem044-${stamp}`;
      const fileName = `StockInShared-044-048-${stamp}.xlsx`;

      // ✅ Build all rows — 2 serial rows per product = 10 rows total
      const allRows = [
        ...laptopRows(td.laptops.laptopA), // 044 — full stock in
        ...laptopRows(td.laptops.laptopB), // 045 — partial stock in
        ...laptopRows(td.laptops.laptopC), // 046 — exceeds qty
        ...laptopRows(td.laptops.laptopD), // 047 — negative qty
        ...laptopRows(td.laptops.laptopE), // 048 — zero qty
      ];

      createExcelFile(fileName, allRows);
      importExcel(fileName, sharedPO);

      // ✅ Verify PO loaded. API-based importExcel no longer navigates, so go to
      // Incoming Inventory before selecting the PO.
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      incomingInvPage.validateExpectedQty(19);
      incomingInvPage.validateIncomingQty(19);

      cy.then(() => {
        poCreated = true;
        cy.log(`✅ Shared PO created: ${sharedPO}`);
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  after(() => {
    // Return the borrowed flag FIRST — before the early-return below — so a
    // before() that aborted mid-seed still hands global config back untouched.
    restoreGeneralConfigFlag("allowExceedExpectedQuantity");

    if (!poCreated || !sharedPO) {
      cy.log("Shared PO was never created — skipping cleanup");
      return;
    }
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    purchaseOrderPage.deletePurchaseOrder(sharedPO);
  });

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  describe("Stock In — Shared PO (SW_INC_044 – SW_INC_048)", () => {
    // =========================================================================
    // SW_INC_044 – Full qty stock-in for Laptop A (ThinkPad)
    // =========================================================================
    it(
      "SW_INC_044 – Stock-In product-item Laptop using qty equal to expected (5). Received = 5, Available = 5, Incoming = 0",
      { tags: ["@smoke", "@regression"] },
      () => {
        if (!poCreated)
          throw new Error("⛔ Shared PO not created — before() failed");

        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);

        // ✅ Search for specific product
        searchProduct(td.laptops.laptopA.displayName);

        cy.wait("@searchResult");
        cy.get("button").contains("Search").click();
        // Verify pre-conditions for this product
        incomingInvPage.validateExpectedQty(td.laptops.laptopA.serials.length);
        incomingInvPage.validateIncomingQty(td.laptops.laptopA.serials.length);

        // Stock In full qty
        incomingInvPage.enterStockInQty(td.laptops.laptopA.serials.length);
        incomingInvPage.clickStockInSubmit();

        // Verify success toast
        cy.contains(td.successMessages.laptopStockIn, {
          timeout: 10000,
        }).should("exist");

        // Navigate back and verify product quantities
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);
        searchProduct(td.laptops.laptopA.displayName);
        cy.wait("@searchResult");
        cy.get("button").contains("Search").click();

        incomingInvPage.validateExpectedQty(td.laptops.laptopA.serials.length);
        incomingInvPage.validateReceivedQty(td.laptops.laptopA.serials.length);
        incomingInvPage.validateAvailableQty(td.laptops.laptopA.serials.length);
        incomingInvPage.validateIncomingQty(0);
      },
    );

    // =========================================================================
    // SW_INC_045 – Partial qty stock-in for Laptop B (Dell XPS)
    // =========================================================================
    it(
      "SW_INC_045 – Stock-In product-item Laptop using qty less than expected (1 of 5). Received = 1, Available = 1, Incoming = 4",
      { tags: ["@regression"] },
      () => {
        if (!poCreated)
          throw new Error("⛔ Shared PO not created — before() failed");

        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);

        // ✅ Search for Laptop B — untouched product
        searchProduct(td.laptops.laptopB.displayName);
        cy.wait("@searchResult");
        cy.get("button").contains("Search").click();

        incomingInvPage.validateExpectedQty(td.laptops.laptopB.serials.length);
        incomingInvPage.validateIncomingQty(td.laptops.laptopB.serials.length);

        // Stock In partial qty (1)
        incomingInvPage.enterStockInQty(td.stockIn.laptopPartialQty);
        incomingInvPage.clickStockInSubmit();

        cy.contains(td.successMessages.laptopStockIn, {
          timeout: 10000,
        }).should("exist");

        // Verify quantities
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);
        searchProduct(td.laptops.laptopB.displayName);
        cy.wait("@searchResult");
        cy.get("button").contains("Search").click();

        incomingInvPage.validateExpectedQty(td.laptops.laptopB.serials.length);
        incomingInvPage.validateReceivedQty(td.stockIn.laptopPartialQty);
        incomingInvPage.validateAvailableQty(td.stockIn.laptopPartialQty);
        incomingInvPage.validateIncomingQty(
          td.laptops.laptopB.serials.length - td.stockIn.laptopPartialQty,
        );
      },
    );

    // =========================================================================
    // SW_INC_046 – Exceeds qty for Laptop C (HP Pavilion)
    // =========================================================================
    it(
      "SW_INC_046 – Stock-In product-item Laptop using qty more than expected (3 vs 2) shows 'exceeds expected quantity' error",
      { tags: ["@regression"] },
      () => {
        if (!poCreated)
          throw new Error("⛔ Shared PO not created — before() failed");

        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);

        // ✅ Search for Laptop C — untouched product
        searchProduct(td.laptops.laptopC.displayName);
        cy.wait("@searchResult");
        cy.get("button").contains("Search").click();

        incomingInvPage.validateExpectedQty(td.laptops.laptopC.serials.length);
        incomingInvPage.validateIncomingQty(td.laptops.laptopC.serials.length);

        // Stock In exceeding qty
        incomingInvPage.enterStockInQty(td.stockIn.laptopExceedsQty);
        incomingInvPage.clickStockInSubmit();

        // Verify error toast
        cy.contains(td.errorMessages.exceedsExpected, {
          timeout: 10000,
        }).should("exist");

        // Verify quantities unchanged
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);
        searchProduct(td.laptops.laptopC.displayName);
        cy.wait("@searchResult");
        cy.get("button").contains("Search").click();

        incomingInvPage.validateExpectedQty(td.laptops.laptopC.serials.length);
        incomingInvPage.validateReceivedQty(0);
        incomingInvPage.validateIncomingQty(td.laptops.laptopC.serials.length);
      },
    );

    // =========================================================================
    // SW_INC_047 – Negative qty for Laptop D (MacBook)
    // =========================================================================
    it(
      "SW_INC_047 – Stock-In product-item Laptop using negative qty (-1) shows tooltip 'Value must be greater or equal to 1'",
      { tags: ["@regression"] },
      () => {
        if (!poCreated)
          throw new Error("⛔ Shared PO not created — before() failed");

        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);

        // ✅ Search for Laptop D
        searchProduct(td.laptops.laptopD.displayName);

        // Enter negative qty
        incomingInvPage.enterStockInQty(td.stockIn.negativeQty);
        incomingInvPage.clickStockInSubmit();
        // BEST - Verify text exists in DOM (visible or hidden)
        // cy.get("body").then(($body) => {
        //   expect($body.text()).to.include(td.errorMessages.qtyValidation);
        // });

        // Cypress code
        incomingInvPage.verifyQtyValidationError(td.errorMessages.qtyValidation);

        // ✅ Quantities should be unchanged — no nav needed for validation test
      },
    );

    // =========================================================================
    // SW_INC_048 – Zero qty for Laptop E (Asus)
    // =========================================================================
    it(
      "SW_INC_048 – Stock-In product-item Laptop using qty 0 shows tooltip 'Value must be greater or equal to 1'",
      { tags: ["@regression"] },
      () => {
        if (!poCreated)
          throw new Error("⛔ Shared PO not created — before() failed");

        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(sharedPO);

        // ✅ Search for Laptop E
        searchProduct(td.laptops.laptopE.displayName);
        cy.wait("@searchResult");
        cy.get("button").contains("Search").click();

        // Enter zero qty
        incomingInvPage.enterStockInQty(td.stockIn.zeroQty);
        incomingInvPage.clickStockInSubmit();
        incomingInvPage.verifyQtyValidationError(
          td.errorMessages.qtyValidation,
        );
      },
    );
  });
});
