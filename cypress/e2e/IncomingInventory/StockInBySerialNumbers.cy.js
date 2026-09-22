import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import poData from "../../fixtures/PurchaseOrder/poCloseData.json";
import { seedSerializedPO, apiDeletePO } from "../../support/helpers/poCloseHelpers";
import {
  readContainerLocationAssignment,
  setContainerLocationAssignment,
  createContainerWithCapacity,
  getContainerCurItems,
  getContainerSerials,
  getLocationSerials,
} from "../../support/helpers/containerLocationHelpers";
import {
  createContainerTypeViaApi,
  deleteContainerTypeViaApi,
  deleteContainerViaApi,
  emptyContainerViaApi,
  disposableTypeName,
} from "../../support/helpers/wmsContainerHelpers";
import {
  createDisposableBinChain,
  deleteLocationViaApi,
} from "../../support/helpers/wmsLocationHelpers";

// Remember QA's pre-run value of the container/location toggle so every phase
// restores it. Captured once by whichever describe's before() runs first.
let originalContainerLocationConfig;
function captureOriginalClaConfigOnce() {
  return readContainerLocationAssignment().then((v) => {
    if (originalContainerLocationConfig === undefined) originalContainerLocationConfig = v;
    return v;
  });
}

// Test IDs below use the SW-<AREA>-TC<NN> convention (AREA=SISN, Stock In
// by Serial Number). The legacy SW_INC_0NN numbers named in each section
// comment are the original pre-consolidation IDs, kept for history.
describe("Stock In by Serial Number Scanning Tests — Container/Location config DISABLED (SW-SISN-TC01 – SW-SISN-TC12)", () => {
  let incomingInvPage, invViewPage, purchaseOrderPage;
  let testData;

  // Track POs created during tests for cleanup
  const createdPOs = [];

  // -- Helpers ----------------------------------------------------------------

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  function createExcelFile(fileName, data) {
    const filePath = `cypress/fixtures/${fileName}`;
    cy.task("createExcelFile", { filePath, data }).then((msg) => cy.log(msg));
  }

  function laptopRow(serialNumber, overrides = {}) {
    return {
      Category: testData.categories.productItem,
      "Model Number": testData.laptop.modelNumber,
      Brand: testData.laptop.brand,
      Cost: testData.laptop.cost,
      Price: testData.laptop.price,
      "Support Contact": testData.laptop.supportContact,
      "Serial Number": serialNumber,
      "Asset Tag ID": `ASSET-${serialNumber}`,
      "Asset Security Code": `ASC-${serialNumber}`,
      ...overrides,
    };
  }

  // API-based seed (uploadExcelToApi) — the standalone UI "Import" button was
  // removed from the incoming-inventory header; seeding via the backend import
  // endpoint is deterministic (skill principle #3 — API for setup).
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

  // Mark an imported (serialized) item to a target status via the backend
  // mark-status endpoint. Used for setup so the test doesn't depend on the
  // Change-Status UI dialog — the Damage-Reason react-select has NO options for
  // categories without configured damage reasons (Laptop Automation Cat), which
  // makes the *required* reason field unfillable via UI. The API accepts a free
  // damageReason string regardless of UI config (skill principle #3 — API setup).
  // Endpoint is /incoming-items/mark-status, NOT /products/mark-status. Both routes
  // exist, but they are different implementations: the product one returns
  // `success: false` + an error_list for this payload, which is why SW-SISN-TC09's
  // seed asserted "mark-status Damaged success: expected false to equal true" and
  // the item was never actually marked Damaged. /incoming-items/mark-status takes
  // this exact { poNumber, serialNumbers, status, damageReason } shape and is what
  // the rest of the suite already uses to seed a Damaged item.
  function apiMarkItemStatus(poNumber, serialNumber, status, damageReason) {
    cy.getAuthToken().then((token) => {
      const body = { poNumber, status, serialNumbers: [serialNumber] };
      if (damageReason) body.damageReason = damageReason;
      cy.request({
        method: "POST",
        url: `${Cypress.env("API_BASE_URL")}/incoming-items/mark-status`,
        headers: { Authorization: `Bearer ${token}` },
        body,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, `mark-status ${status} ${serialNumber}`).to.be.lessThan(500);
        expect(res.body?.success !== false, `mark-status ${status} success`).to.eq(true);
      });
    });
  }

  function navigateToScanPage(poNumber) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(poNumber);
    incomingInvPage.clickScanButton();
    cy.url().should("include", "scan-items");
  }

  function scanAndWait(serialNumber) {
    // Intercept the POST scan endpoint — waiting for the GET reports can
    // match an earlier polling request before the scan POST has completed,
    // leaving the item in "Incoming" status in the DB.
    cy.intercept("POST", "**/incoming-items/scan").as("scanPost");
    incomingInvPage.scanSerialNumber(serialNumber);
    cy.wait("@scanPost", { timeout: 15000 });
  }

  function selectPOAndSearch(poNumber, searchTerm) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(poNumber);
    invViewPage.searchProduct(searchTerm);
    invViewPage.clickSubmitSearch();
  }

  // -- Setup & Teardown -------------------------------------------------------

  before(() => {
    cy.fixture("stockInTestData").then((data) => {
      testData = data;
    });
    cy.authSession('admin');
    cy.visit("/");
    // Existing serial-scan flows assume no container/location gate. Force the
    // toggle OFF (remembering QA's original value). Must run after cy.authSession +
    // visit — getAuthToken reads the app's localStorage.
    captureOriginalClaConfigOnce().then(() => setContainerLocationAssignment(false));
    ensureCommonAttributesOptional();
  });

  beforeEach(() => {
    cy.on("uncaught:exception", (err) => {
      if (err.message.includes("Request failed with status code")) {
        return false;
      }
    });
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  after(() => {
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
    // Restore QA's original toggle (idempotent — the ENABLED describe restores too).
    if (originalContainerLocationConfig !== undefined) {
      setContainerLocationAssignment(originalContainerLocationConfig);
    }
  });

  // =========================================================================
  //  SECTION 1 – VALID SCAN (SW_INC_036)
  // =========================================================================

  it(
    "SW-SISN-TC01 – Scan a valid serial number and verify Available increases, Incoming decreases",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Technique: Use Case
      const stamp = ts();
      const po = `PO-Scan036-${stamp}`;
      createdPOs.push(po);
      const sn = `SNScan036-${stamp}`;
      const fileName = `StockIn-036-${stamp}.xlsx`;

      // Import a product with one serial number into a dedicated PO
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, po);

      // Verify PO badges before scan: Expected=1, Incoming=1
      incomingInvPage.selectPoNumber(po);
      incomingInvPage.validateExpectedQty(1);
      incomingInvPage.validateIncomingQty(1);

      // Navigate to scan page and scan the serial
      navigateToScanPage(po);
      scanAndWait(sn);

      // Verify the scanned serial appears in the Scanned Items table, and the
      // toast shows the exact backend message (incoming-item.service.ts
      // `Item ${serialNumber} is scanned successfully.`) for THIS serial —
      // not just a generic "is scanned" substring that any row could match.
      cy.contains(sn, { timeout: 10000 }).should("exist");
      cy.contains(`Item ${sn} is scanned successfully.`, {
        timeout: 10000,
      }).should("exist");

      // Go back and verify PO quantities after scan
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(po);
      incomingInvPage.validateExpectedQty(1);
      incomingInvPage.validateReceivedQty(1);
      incomingInvPage.validateAvailableQty(1);
      incomingInvPage.validateIncomingQty(0);
    },
  );

  //   // =========================================================================
  //   //  SECTION 2 – DUPLICATE SCAN (SW_INC_037)
  //   // =========================================================================

  it(
    "SW-SISN-TC02 – Scanning the same serial number a second time returns an 'already scanned' error",
    { tags: ["@regression"] },
    () => {
      // Technique: Error Guessing
      const stamp = ts();
      // Unique PO per run — the build enforces one import file per PO, so the
      // shared static PO (testData.po) rejects re-imports with HTTP 400.
      const po = `PO-Scan037-${stamp}`;
      createdPOs.push(po);
      const sn = `SNScan037-${stamp}`;
      const fileName = `StockIn-037-${stamp}.xlsx`;

      // Import and scan once
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, po);
      navigateToScanPage(po);
      scanAndWait(sn);

      // Scan same SN again — expect error
      incomingInvPage.scanSerialNumber(sn);
      cy.contains(testData.errorMessages.alreadyScanned, {
        timeout: 10000,
      }).should("exist");
    },
  );

  //   // =========================================================================
  //   //  SECTION 3 – NON-EXISTENT SERIAL (SW_INC_038)
  //   // =========================================================================

  it(
    "SW-SISN-TC03 – Scanning a serial number that does not exist returns a 'not found' error",
    { tags: ["@regression"] },
    () => {
      // Technique: EP
      const stamp = ts();
      // Seed a real open PO (one item) so the scan page has a valid PO context,
      // then scan a serial that does not exist.
      const po = `PO-Scan038-${stamp}`;
      createdPOs.push(po);
      const fileName = `StockIn-038-${stamp}.xlsx`;
      createExcelFile(fileName, [laptopRow(`SNSeed038-${stamp}`)]);
      importExcel(fileName, po);

      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber("SN-NOTEXIST-9999");
      cy.contains(testData.errorMessages.notFound, { timeout: 10000 }).should(
        "exist",
      );
    },
  );

  //   // =========================================================================
  //   //  SECTION 4 – STATUS-BASED SCAN ERRORS (SW_INC_039, SW_INC_040, SW_INC_073)
  //   // =========================================================================

  it(
    "SW-SISN-TC09 – Scanning a Damaged serial number returns an error",
    { tags: ["@regression"] },
    () => {
      // Technique: Error Guessing
      const stamp = ts();
      const po = `PO-Scan039-${stamp}`;
      createdPOs.push(po);
      const sn = `SNDmg039-${stamp}`;
      const fileName = `StockIn-039-${stamp}.xlsx`;

      // Import product
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, po);

      // Mark the item Damaged via API. The Change-Status UI dialog can't be used
      // here: the *required* Damage-Reason react-select has no options for
      // categories without configured damage reasons (Laptop Automation Cat), so
      // the field is unfillable and the dialog can't be submitted in the UI.
      apiMarkItemStatus(po, sn, "Damaged", "Physical Damage");

      // Now try to scan damaged item
      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber(sn);
      cy.contains(testData.errorMessages.isDamaged, { timeout: 10000 }).should(
        "exist",
      );
    },
  );

  it(
    "SW-SISN-TC04 – Scanning a Missing serial number returns an error",
    { tags: ["@regression"] },
    () => {
      // Technique: State Transition
      const stamp = ts();
      const po = `PO-Scan040-${stamp}`;
      createdPOs.push(po);
      const sn = `SNMis040-${stamp}`;
      const fileName = `StockIn-040-${stamp}.xlsx`;

      // Import product
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, po);

      // Change status to Damaged via three-dot menu
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(po);
      invViewPage.searchProduct(testData.laptop.brand);
      invViewPage.clickSubmitSearch();

      // Click three-dot menu on product row and open Change Status dialog
      cy.get("tbody tr")
        .first()
        .find('button[id="long-button"]')
        .click({ force: true });
      cy.contains("Change Status").click({ force: true });

      // Wait for the Change Status dialog to appear
      cy.get('[role="dialog"]').should("be.visible");

      // react-select v5 uses emotion hashed classes (no classNamePrefix set).
      // Target by placeholder text; portal options have role="option".

      // Click the Status placeholder to open the status dropdown
      cy.get('[role="dialog"]')
        .contains("Choose Status")
        .first()
        .click({ force: true });

      // Portal options render at body level with role="option"
      cy.get('[role="option"]').contains("Missing").click({ force: true });

      // The serial number input id is "serialNumberForReport"
      cy.get("#serialNumberForReport")
        .should("be.visible")
        .clear()
        .type(sn, { delay: 50 });

      cy.get('[role="dialog"]')
        .contains("button", /^Update$/i)
        .should("be.visible")
        .click({ force: true });
      // Toast message from API: "Item(s) marked as Damaged successfully"
      cy.contains("successfully", { timeout: 10000 }).should("exist");

      // Dialog stays open when item=false — close it before navigating
      cy.get('[role="dialog"]')
        .contains("button", /^Cancel$/i)
        .click({ force: true });
      cy.get('[role="dialog"]').should("not.exist");

      // Now try to scan missing item
      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber(sn);
      cy.contains(testData.errorMessages.isMissing, { timeout: 10000 }).should(
        "exist",
      );
    },
  );

  it(
    "SW-SISN-TC10 – Scanning a Disputed serial number returns an error",
    { tags: ["@regression"] },
    () => {
      // Technique: State Transition
      const stamp = ts();
      const po = `PO-Scan073-${stamp}`;
      createdPOs.push(po);
      const sn = `SNDis073-${stamp}`;
      const fileName = `StockIn-073-${stamp}.xlsx`;

      // Import product
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, po);

      // Change status to Damaged via three-dot menu
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(po);
      invViewPage.searchProduct(testData.laptop.brand);
      invViewPage.clickSubmitSearch();

      // Click three-dot menu on product row and open Change Status dialog
      cy.get("tbody tr")
        .first()
        .find('button[id="long-button"]')
        .click({ force: true });
      cy.contains("Change Status").click({ force: true });

      // Wait for the Change Status dialog to appear
      cy.get('[role="dialog"]').should("be.visible");

      // react-select v5 uses emotion hashed classes (no classNamePrefix set).
      // Target by placeholder text; portal options have role="option".

      // Click the Status placeholder to open the status dropdown
      cy.get('[role="dialog"]')
        .contains("Choose Status")
        .first()
        .click({ force: true });

      // Portal options render at body level with role="option"
      cy.get('[role="option"]').contains("Disputed").click({ force: true });

      // The serial number input id is "serialNumberForReport"
      cy.get("#serialNumberForReport")
        .should("be.visible")
        .clear()
        .type(sn, { delay: 50 });

      cy.get('[role="dialog"]')
        .contains("button", /^Update$/i)
        .should("be.visible")
        .click({ force: true });
      // Toast message from API: "Item(s) marked as Damaged successfully"
      cy.contains("successfully", { timeout: 10000 }).should("exist");

      // Dialog stays open when item=false — close it before navigating
      cy.get('[role="dialog"]')
        .contains("button", /^Cancel$/i)
        .click({ force: true });
      cy.get('[role="dialog"]').should("not.exist");

      // Now try to scan disputed item
      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber(sn);
      cy.contains(testData.errorMessages.isDisputed, {
        timeout: 10000,
      }).should("exist");
    },
  );

  // =========================================================================
  //  SECTION 5 – CLOSED PO (SW_INC_041)
  // =========================================================================

  it(
    "SW-SISN-TC05 – Scanning any serial number against a Closed PO returns an error",
    { tags: ["@regression"] },
    () => {
      // Technique: EP
      const stamp = ts();
      const closedPo = `PO-Closed041-${stamp}`;
      createdPOs.push(closedPo);
      const sn = `SNClosed041-${stamp}`;
      const fileName = `StockIn-041-${stamp}.xlsx`;

      // Import product into PO
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, closedPo);

      // Navigate to scan page while PO is still open
      navigateToScanPage(closedPo);

      // Close the PO via API
      cy.getAuthToken().then((token) => {
        const apiUrl =
          Cypress.env("API_BASE_URL") ||
          "https://api.qa.example.com";
        cy.request({
          method: "PATCH",
          url: `${apiUrl}/purchase-orders/closePurchaseOrder`,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            poNumber: closedPo,
            status: "Closed",
            creditMemoNumber: null,
          },
        }).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 201]);
        });
      });

      // Now try to scan item on the closed PO
      incomingInvPage.scanSerialNumber(sn);
      cy.contains(testData.errorMessages.poIsClosed, { timeout: 10000 }).should(
        "exist",
      );
    },
  );

  //   // =========================================================================
  //   //  SECTION 6 – MULTIPLE MATCHES (SW_INC_043, SW_INC_044)
  //   // =========================================================================

  it(
    "SW-SISN-TC06 – Partial serial number matching multiple items triggers Multiple Matches dialog",
    { tags: ["@regression"] },
    () => {
      // Technique: Error Guessing
      const stamp = ts();
      const po = `PO-Scan043-${stamp}`;
      createdPOs.push(po);
      const prefix = `snTest101N`;
      const serials = [
        `${prefix}1-${stamp}`,
        `${prefix}2-${stamp}`,
        `${prefix}3-${stamp}`,
        `${prefix}4-${stamp}`,
      ];
      const fileName = `StockIn-043-${stamp}.xlsx`;

      // Import 4 items with similar serial numbers
      createExcelFile(
        fileName,
        serials.map((sn) => laptopRow(sn)),
      );
      importExcel(fileName, po);

      // Navigate to scan page and enter partial serial
      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber(`${prefix}`);

      // Verify Multiple Matches Found dialog
      cy.contains("Multiple Matches Found", { timeout: 10000 }).should(
        "be.visible",
      );
      cy.contains("Multiple matching Serial Numbers were found").should(
        "be.visible",
      );

      // Verify all matching serials are listed
      serials.forEach((sn) => {
        cy.contains(sn).should("exist");
      });

      // Select first serial and click Select
      cy.contains(serials[0]).click({ force: true });
      cy.contains("button", /^Select$/i)
        .should("be.visible")
        .click({ force: true });

      // Verify scan completes successfully
      cy.contains(testData.successMessages.scannedSuccessfully, {
        timeout: 10000,
      }).should("exist");
    },
  );

  it(
    "SW-SISN-TC07 – Trailing partial serial number matching multiple items triggers Multiple Matches dialog",
    { tags: ["@regression"] },
    () => {
      // Technique: Error Guessing
      const stamp = ts();
      const po = `PO-Scan044-${stamp}`;
      createdPOs.push(po);
      const suffix = `401222${stamp}`;
      const serials = [`3023${suffix}`, `3024${suffix}`, `3025${suffix}`];
      const fileName = `StockIn-044-${stamp}.xlsx`;

      // Import 3 items with similar trailing serial numbers
      createExcelFile(
        fileName,
        serials.map((sn) => laptopRow(sn)),
      );
      importExcel(fileName, po);

      // Navigate to scan page and enter trailing partial serial
      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber(suffix);

      // Verify Multiple Matches Found dialog
      cy.contains("Multiple Matches Found", { timeout: 10000 }).should(
        "be.visible",
      );
      cy.contains("Multiple matching Serial Numbers were found").should(
        "be.visible",
      );

      // Verify all matching serials are listed
      serials.forEach((sn) => {
        cy.contains(sn).should("exist");
      });

      // Select first serial and click Select
      cy.contains(serials[0]).click({ force: true });
      cy.contains("button", /^Select$/i)
        .should("be.visible")
        .click({ force: true });

      // Verify scan completes successfully
      cy.contains(testData.successMessages.scannedSuccessfully, {
        timeout: 10000,
      }).should("exist");
    },
  );

  // =========================================================================
  //  SECTION 7 – CROSS-PO SCAN (SW_INC_072)
  // =========================================================================

  it(
    "SW-SISN-TC08 – Scanning a serial number that belongs to a different PO returns an error",
    { tags: ["@regression"] },
    () => {
      // Technique: Error Guessing
      const stamp = ts();
      const po1 = `PO-CrossScan-01-${stamp}`;
      const po2 = `PO-CrossScan-02-${stamp}`;
      createdPOs.push(po1);
      createdPOs.push(po2);

      const sn1 = `SN-CROSS-01-${stamp}`;
      const sn2 = `SN-CROSS-02-${stamp}`;

      // Import SN1 into PO1
      const file1 = `StockIn-072-PO1-${stamp}.xlsx`;
      createExcelFile(file1, [laptopRow(sn1)]);
      importExcel(file1, po1);

      // Import SN2 into PO2
      const file2 = `StockIn-072-PO2-${stamp}.xlsx`;
      createExcelFile(file2, [laptopRow(sn2)]);
      importExcel(file2, po2);

      // Navigate to PO2 scan page and try to scan SN1 (from PO1)
      navigateToScanPage(po2);
      incomingInvPage.scanSerialNumber(sn1);
      cy.contains(testData.errorMessages.notFound, { timeout: 10000 }).should(
        "exist",
      );
    },
  );

  // =========================================================================
  //  SECTION 8 – STOCKED OUT SCAN ERRORS (SW_INC_074, SW_INC_075)
  // =========================================================================

  it(
    "SW-SISN-TC11 – Scanning a StockedOut (Sold) serial number returns an error",
    { tags: ["@regression"] },
    () => {
      // Technique: Error Guessing
      const stamp = ts();
      const po = `PO-Scan074-${stamp}`;
      createdPOs.push(po);
      const sn = `SNSold074-${stamp}`;
      const fileName = `StockIn-074-${stamp}.xlsx`;

      // Import and scan to make Available
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, po);
      navigateToScanPage(po);
      scanAndWait(sn);

      // Stock Out via API with reason Sold
      cy.getAuthToken().then((token) => {
        const apiUrl =
          Cypress.env("API_BASE_URL") ||
          "https://api.qa.example.com";
        cy.request({
          method: "POST",
          url: `${apiUrl}/products/stockout-by-serial-number`,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            serialNumber: sn,
            reason: testData.stockOutReasons.sold,
            status: "StockedOut",
            description: "Automation test stock-out",
            orderNumber: `WO-AUTO-074-${stamp}`,
          },
          failOnStatusCode: false,
        }).then((resp) => {
          cy.log("Stock-out response: " + JSON.stringify(resp.body));
          expect(resp.status).to.be.oneOf([200, 201]);
        });
      });

      // Now try to scan the stocked-out item
      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber(sn);
      cy.contains(testData.errorMessages.isStockedOut, {
        timeout: 10000,
      }).should("exist");
    },
  );

  it(
    "SW-SISN-TC12 – Scanning a StockedOut (Shipped) serial number returns an error",
    { tags: ["@regression"] },
    () => {
      // Technique: EP
      const stamp = ts();
      const po = `PO-Scan075-${stamp}`;
      createdPOs.push(po);
      const sn = `SNShip075-${stamp}`;
      const fileName = `StockIn-075-${stamp}.xlsx`;

      // Import and scan to make Available
      createExcelFile(fileName, [laptopRow(sn)]);
      importExcel(fileName, po);
      navigateToScanPage(po);
      scanAndWait(sn);

      // Stock Out via API with reason Shipped
      cy.getAuthToken().then((token) => {
        const apiUrl =
          Cypress.env("API_BASE_URL") ||
          "https://api.qa.example.com";
        cy.request({
          method: "POST",
          url: `${apiUrl}/products/stockout-by-serial-number`,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            serialNumber: sn,
            reason: testData.stockOutReasons.shipped,
            status: "StockedOut",
            description: "Automation test stock-out",
            orderNumber: `WO-AUTO-075-${stamp}`,
          },
          failOnStatusCode: false,
        }).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 201]);
        });
      });

      // Now try to scan the stocked-out item
      navigateToScanPage(po);
      incomingInvPage.scanSerialNumber(sn);
      cy.contains(testData.errorMessages.isStockedOut, {
        timeout: 10000,
      }).should("exist");
    },
  );
});

// ===========================================================================
// Container / Location Assignment — config ENABLED (serial scan form)
// Plan: cypress/qa/testPlans/incomingInventory/sub/container-location-assignment-plan.md §9.B
// All WMS + PO test data is seeded per-run so no TC is ever skipped; torn down in
// after(); the original config value is restored.
// ===========================================================================
describe("Stock In by Serial Number — Container/Location config ENABLED (SW-SISN-CLA-TC01 – TC06)", { tags: ["@regression", "@cla"] }, () => {
  let incomingInvPage;
  let sisnData; // stockInTestData fixture (this describe's own copy)
  const stamp = `SISNCLA-${Date.now()}`;

  let typeId;
  let contScan, contAccum, contCap1, contDup; // disposable containers
  let bin, binFacilityId;                      // disposable bin-location chain
  let claPo;                                    // serialized PO with Incoming serials
  // Serial allocation (10 seeded): gate / container / location / accumx3 / cap / dup
  const sn = (i) => `SN-${stamp}-${i}`;

  before(() => {
    cy.fixture("stockInTestData").then((data) => { sisnData = data; });
    cy.authSession('admin');
    cy.visit("/");
    captureOriginalClaConfigOnce().then(() => setContainerLocationAssignment(true));
    ensureCommonAttributesOptional();

    // Disposable container-type + four containers (three "open", one capped at 1).
    cy.then(() => createContainerTypeViaApi(disposableTypeName("SisnCla")))
      .then((t) => {
        typeId = t && t.id;
        expect(typeId, "seed container-type id").to.exist;
      });
    cy.then(() => createContainerWithCapacity(typeId, null)).then((c) => { contScan = c; });
    cy.then(() => createContainerWithCapacity(typeId, null)).then((c) => { contAccum = c; });
    cy.then(() => createContainerWithCapacity(typeId, 1)).then((c) => { contCap1 = c; });
    cy.then(() => createContainerWithCapacity(typeId, null)).then((c) => { contDup = c; });

    // Disposable bin-location chain (Facility->...->Bin); a Bin is required for
    // location assignment (validateBinLocation).
    cy.then(() => createDisposableBinChain()).then((chain) => {
      bin = chain.bin;
      binFacilityId = chain.facility && chain.facility.id;
      expect(bin && bin.path, "seed bin location path").to.exist;
    });

    // One serialized PO with 10 Incoming serials — comfortably more than the
    // 8 the tests consume, so nothing is skipped and no ceiling is hit.
    claPo = `PO-${stamp}`;
    const serials = Array.from({ length: 10 }, (_, i) => sn(i));
    cy.then(() => seedSerializedPO({ td: poData, poNumber: claPo, stamp, serials }));

    // Pre-fill the capacity-1 container to capacity via one API scan so TC05 can
    // exercise the selection-time "at maximum capacity" guard on a FRESH scan page
    // (once a container is selected in the UI, #container-qr-input is hidden).
    cy.then(() => {
      cy.getAuthToken().then((token) => {
        cy.request({
          method: "POST",
          url: `${Cypress.env("API_BASE_URL")}/incoming-items/scan`,
          headers: { Authorization: `Bearer ${token}` },
          body: { poNumber: claPo, serialNumber: sn(8), containerId: contCap1.id },
          failOnStatusCode: false,
        }).then((r) => {
          expect(r.status, "pre-fill scan into contCap1").to.be.lessThan(500);
        });
      });
    });
  });

  after(() => {
    [contScan, contAccum, contCap1, contDup].forEach((c) => {
      if (c && c.id) {
        emptyContainerViaApi(c.id);
        deleteContainerViaApi(c.id);
      }
    });
    if (typeId) deleteContainerTypeViaApi(typeId);
    if (binFacilityId) deleteLocationViaApi(binFacilityId);
    if (claPo) apiDeletePO(claPo);
    if (originalContainerLocationConfig !== undefined) {
      setContainerLocationAssignment(originalContainerLocationConfig);
    }
  });

  beforeEach(() => {
    cy.on("uncaught:exception", (err) => {
      if (err.message.includes("Request failed with status code")) return false;
    });
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
  });

  function navigateToScanPage(poNumber) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(poNumber);
    incomingInvPage.clickScanButton();
    cy.url().should("include", "scan-items");
  }

  function scanAndWait(serialNumber) {
    cy.intercept("POST", "**/incoming-items/scan").as("scanPost");
    incomingInvPage.scanSerialNumber(serialNumber);
    cy.wait("@scanPost").its("response.statusCode").should("be.lessThan", 500);
  }

  // Decision Table / Error Guessing — enabled + no selection → scan is blocked,
  // no /incoming-items/scan call fires, and the serial stays Incoming.
  it("SW-SISN-CLA-TC01 — scanning with no container/location selected is blocked and fires no scan", { tags: ["@smoke"] }, () => {
    navigateToScanPage(claPo);
    cy.intercept("POST", "**/incoming-items/scan").as("scan");
    incomingInvPage.scanSerialNumber(sn(0));
    incomingInvPage.assertScanNoSelectionError();
    cy.wait(600);
    cy.get("@scan.all").should("have.length", 0);
  });

  // Use Case / Decision Table — scan a serial into a selected container.
  it("SW-SISN-CLA-TC02 — scanning a serial into a container assigns it and increments cur_items", { tags: ["@smoke"] }, () => {
    navigateToScanPage(claPo);
    incomingInvPage.selectContainerByCode(contScan.code);
    scanAndWait(sn(1));
    cy.contains(`Item ${sn(1)} is scanned successfully.`, { timeout: 10000 }).should("exist");
    getContainerCurItems(contScan.id).should("eq", 1);
    getContainerSerials(contScan.id).should("include", sn(1));
  });

  // Use Case / Decision Table — scan a serial into a selected bin location.
  // universal-scan resolves a LOCATION by its `path` (containers by `code`).
  it("SW-SISN-CLA-TC03 — scanning a serial into a bin location assigns it", { tags: ["@regression"] }, () => {
    navigateToScanPage(claPo);
    incomingInvPage.selectLocationByCode(bin.path);
    scanAndWait(sn(2));
    cy.contains(`Item ${sn(2)} is scanned successfully.`, { timeout: 10000 }).should("exist");
    getLocationSerials(bin.id).should("include", sn(2));
  });

  // State Transition — successive scans accumulate exactly in the container.
  it("SW-SISN-CLA-TC04 — successive serial scans accumulate exactly in the container", { tags: ["@regression"] }, () => {
    navigateToScanPage(claPo);
    incomingInvPage.selectContainerByCode(contAccum.code);
    // Assert each scan's own success toast before the next so a receipt fully
    // commits (incl. its atomic container assignment) before the following scan.
    scanAndWait(sn(3));
    cy.contains(`Item ${sn(3)} is scanned successfully.`, { timeout: 10000 }).should("exist");
    scanAndWait(sn(4));
    cy.contains(`Item ${sn(4)} is scanned successfully.`, { timeout: 10000 }).should("exist");
    scanAndWait(sn(5));
    cy.contains(`Item ${sn(5)} is scanned successfully.`, { timeout: 10000 }).should("exist");
    getContainerCurItems(contAccum.id).should("eq", 3);
    getContainerSerials(contAccum.id).should((serials) => {
      [sn(3), sn(4), sn(5)].forEach((s) => expect(serials).to.include(s));
    });
  });

  // BVA (capacity, selection-time) — a container at capacity cannot be re-selected.
  it("SW-SISN-CLA-TC05 — a container at capacity cannot be re-selected", { tags: ["@regression"] }, () => {
    // contCap1 (max_items=1) was pre-filled to capacity in before() via an API scan,
    // so on a fresh scan page (#container-qr-input present) selecting it is refused.
    getContainerCurItems(contCap1.id).should("eq", 1);
    navigateToScanPage(claPo);
    incomingInvPage.selectContainerExpectFull(contCap1.code);
    getContainerCurItems(contCap1.id).should("eq", 1);
  });

  // Error Guessing — a rejected duplicate scan must not change the container qty.
  it("SW-SISN-CLA-TC06 — a rejected duplicate scan does not change the container quantity", { tags: ["@regression"] }, () => {
    navigateToScanPage(claPo);
    incomingInvPage.selectContainerByCode(contDup.code);
    scanAndWait(sn(7));
    cy.contains(`Item ${sn(7)} is scanned successfully.`, { timeout: 10000 }).should("exist");
    getContainerCurItems(contDup.id).should("eq", 1);
    // Duplicate scan → "already scanned" error, no second assignment.
    incomingInvPage.scanSerialNumber(sn(7));
    cy.contains(sisnData.errorMessages.alreadyScanned, { timeout: 10000 }).should("exist");
    getContainerCurItems(contDup.id).should("eq", 1);
  });
});
