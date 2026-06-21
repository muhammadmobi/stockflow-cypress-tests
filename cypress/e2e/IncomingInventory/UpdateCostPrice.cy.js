import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories } from "../../support/helpers/attributeHelpers";
import {
  makeRamRow,
  makeLaptopRowWithSerial,
  importExcel,
  searchProduct,
  createExcelFile,
} from "../../support/helpers/incomingInventoryHelpers";

/**
 * Update Cost & Price Tests — Incoming Inventory
 * Covers: SW_INC_CP_001 – SW_INC_CP_021
 *
 * Product Only (RAM) Tests    — SW_INC_CP_001 – SW_INC_CP_004
 * Multiple Products in PO     — SW_INC_CP_005
 * Product Item (Laptop) Tests — SW_INC_CP_006 – SW_INC_CP_007
 * Mixed PO Tests              — SW_INC_CP_008 – SW_INC_CP_009
 * Validation (negative)       — SW_INC_CP_010 – SW_INC_CP_015
 * Validation (zero)           — SW_INC_CP_016 – SW_INC_CP_021
 *
 * Setup (before): Import POs, enable Cost/Price columns via Customize Column.
 * The "Update Cost & Price" menu item is in the row action (long-button) menu.
 * Requires a specific PO to be selected (not "All POs") for Product Only rows.
 * For Product Item, cost/price update is at individual item level (via ItemActionMenu).
 */
const LOG_FILE = "cypress/logs/UpdateCostPrice-debug.log";

function log(msg) {
  cy.task("writeLog", { filePath: LOG_FILE, message: msg });
  cy.log(msg);
}

describe("Update Cost & Price Tests (SW_INC_CP_001 – SW_INC_CP_021)", () => {
  let incomingInvPage, invViewPage, purchaseOrderPage;
  let td;

  const createdPOs = [];

  // Shared PO state across tests (POs created once in before())
  let ramSharedPO;   // product-only (RAM): SW_INC_CP_001–004
  let ramMultiPO;    // 2 products (Kingston + Corsair): SW_INC_CP_005
  let laptopSharedPO; // product-item (Laptop): SW_INC_CP_006–007
  let mixedPO;       // RAM + Laptop: SW_INC_CP_008–009

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  // ─── before() ─────────────────────────────────────────────────────────────
  before(() => {
    cy.task("writeLog", { filePath: LOG_FILE, message: "=== UpdateCostPrice Suite START ===" });
    cy.fixture("updateCostPriceData").then((data) => {
      td = data;
      const ramRow = makeRamRow(td);
      const laptopRowWithSerial = makeLaptopRowWithSerial(td);
      const runId = ts();

      cy.adminSession();
      cy.visit("/");

      cy.getAuthToken().then((token) => {
        const rawBase = Cypress.config("baseUrl").replace(/\/$/, "");
        const apiBase = rawBase.replace("://", "://api.");
        [
          { name: td.ram.category, allowItems: false },
          { name: td.laptop.category, allowItems: true },
        ].forEach(({ name, allowItems }) => {
          cy.request({
            method: "POST",
            url: `${apiBase}/categories`,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: {
              name,
              description: "...",
              allowItems,
              allowVariants: false,
              allowVariantItems: false,
            },
            failOnStatusCode: false,
          }).then((res) => cy.log(`Ensure category '${name}': ${res.status}`));
        });
      });

      importAttributesAndCategories();

      incomingInvPage = new IncomingInvPage();
      invViewPage = new InvViewPage();
      purchaseOrderPage = new PurchaseOrderPage();

      cy.task("writeLog", { filePath: LOG_FILE, message: `fixture loaded: ramKingston=${JSON.stringify(td.ramKingston)}, ram.category=${td.ram.category}` });

      // ── RAM shared PO (product only) — SW_INC_CP_001–004 ─────────────────
      const ramStamp = ts();
      ramSharedPO = `PO-CostPriceRam-${ramStamp}`;
      createdPOs.push(ramSharedPO);
      const ramFileName = `CostPriceRam-${ramStamp}.xlsx`;
      createExcelFile(ramFileName, [
        ramRow(td.ramKingston.brand, td.ramKingston.memoryGeneration, td.defaults.qty),
      ]);
      importExcel(ramFileName, ramSharedPO);

      // ── RAM multi-product PO — SW_INC_CP_005 ─────────────────────────────
      const multiStamp = ts();
      ramMultiPO = `PO-CostPriceMulti-${multiStamp}`;
      createdPOs.push(ramMultiPO);
      const ramMultiFileName = `CostPriceMulti-${multiStamp}.xlsx`;
      createExcelFile(ramMultiFileName, [
        ramRow(td.ramKingston.brand, td.ramKingston.memoryGeneration, td.defaults.qty),
        ramRow(td.ram.RAMbrand, td.ram.memoryGeneration, td.defaults.qty),
      ]);
      importExcel(ramMultiFileName, ramMultiPO);

      // ── Laptop shared PO (product item) — SW_INC_CP_006–007 ──────────────
      const lapStamp = ts();
      laptopSharedPO = `PO-CostPriceLap-${lapStamp}`;
      createdPOs.push(laptopSharedPO);
      const lapFileName = `CostPriceLap-${lapStamp}.xlsx`;
      const laptopSerials = td.laptop.sharedSerials.map((s) => `${s}-${runId}`);
      createExcelFile(lapFileName, laptopSerials.map(laptopRowWithSerial));
      importExcel(lapFileName, laptopSharedPO);

      // ── Mixed PO (RAM + Laptop) — SW_INC_CP_008–009 ──────────────────────
      const mixedStamp = ts();
      mixedPO = `PO-CostPriceMixed-${mixedStamp}`;
      createdPOs.push(mixedPO);
      const mixedFileName = `CostPriceMixed-${mixedStamp}.xlsx`;
      const mixedSerials = td.mixedPOSerials.map((s) => `${s}-${runId}`);
      createExcelFile(mixedFileName, [
        ramRow(td.ramKingston.brand, td.ramKingston.memoryGeneration, td.defaults.qty),
        ...mixedSerials.map(laptopRowWithSerial),
      ]);
      importExcel(mixedFileName, mixedPO);

      // ── Enable Cost/Price columns ─────────────────────────────────────────
      incomingInvPage.clickIncomingInventoryNav();
      [ramSharedPO, ramMultiPO, laptopSharedPO].forEach((poNumber) => {
        incomingInvPage.selectPoNumber(poNumber);
        incomingInvPage.verifyTableHasRows();
        incomingInvPage.enableCostPriceColumns(td.successMessages.columnsUpdated);
      });

      incomingInvPage.selectPoNumber(mixedPO);
      incomingInvPage.searchProduct(td.ramKingston.displayName);
      cy.get("button").contains("Search").click();
      incomingInvPage.verifyTableHasRows();
      incomingInvPage.enableCostPriceColumns(td.successMessages.columnsUpdated);

      incomingInvPage.selectPoNumber(mixedPO);
      incomingInvPage.searchProduct(td.laptop.displayName);
      cy.get("button").contains("Search").click();
      incomingInvPage.verifyTableHasRows();
      incomingInvPage.enableCostPriceColumns(td.successMessages.columnsUpdated);
    });
  });

  // ─── beforeEach() ─────────────────────────────────────────────────────────
  beforeEach(() => {
    cy.adminSession();
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // ===========================================================================
  // ██████████  PRODUCT ONLY (RAM) TESTS  █████████████████████████████████████
  // ===========================================================================
  describe("Product Only (RAM) Tests", () => {
    // =========================================================================
    // SW_INC_CP_001
    // Scenario       : Update both cost and price for a product-only (RAM) row.
    // Precondition   : ramSharedPO imported with Kingston DDR4 (cost=45, price=75).
    //                  Cost and Price columns enabled in the table.
    // Test Steps     : 1. Navigate to Incoming Inventory, select ramSharedPO,
    //                     search for DDR4.
    //                  2. Open row action menu → click "Update Cost & Price".
    //                  3. Enter cost=250, price=450 → click Update.
    // Expected Result: Success toast appears. Table row reflects cost=250, price=450.
    // =========================================================================
    it.only(
      "SW_INC_CP_001 – Product Only: Update both cost and price, verify new values in table row",
      { tags: ["@smoke", "@regression"] },
      () => {
        log(`SW_INC_CP_001: poNumber=${ramSharedPO}, product=${td.ramKingston.displayName}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.costPriceUpdates.newCost, td.costPriceUpdates.newPrice);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);
        incomingInvPage.verifyCostPriceInRow(td.costPriceUpdates.newCost, td.costPriceUpdates.newPrice);
        log("SW_INC_CP_001: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_002
    // Scenario       : Update cost only; price remains at its pre-filled value.
    // Precondition   : ramSharedPO – cost=250, price=450 (set by SW_INC_CP_001).
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open "Update Cost & Price" dialog.
    //                  3. Change cost to 310, leave price field unchanged → click Update.
    // Expected Result: Success toast. Table row shows cost=310, price=450 (unchanged).
    // =========================================================================
    it(
      "SW_INC_CP_002 – Product Only: Update cost only (price kept as pre-filled), verify cost changed price same",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_002: poNumber=${ramSharedPO}, product=${td.ramKingston.displayName}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostOnly(td.costPriceUpdates.updatedCostOnly);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);
        incomingInvPage.verifyCostPriceInRow(td.costPriceUpdates.updatedCostOnly, td.costPriceUpdates.newPrice);
        log("SW_INC_CP_002: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_003
    // Scenario       : Update price only; cost remains at its pre-filled value.
    // Precondition   : ramSharedPO – cost=310, price=450 (set by SW_INC_CP_002).
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open "Update Cost & Price" dialog.
    //                  3. Leave cost field unchanged, change price to 560 → click Update.
    // Expected Result: Success toast. Table row shows cost=310 (unchanged), price=560.
    // =========================================================================
    it(
      "SW_INC_CP_003 – Product Only: Update price only (cost kept as pre-filled), verify price changed cost same",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_003: poNumber=${ramSharedPO}, product=${td.ramKingston.displayName}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitPriceOnly(td.costPriceUpdates.updatedPriceOnly);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);
        incomingInvPage.verifyCostPriceInRow(td.costPriceUpdates.updatedCostOnly, td.costPriceUpdates.updatedPriceOnly);
        log("SW_INC_CP_003: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_004
    // Scenario       : Cancel the dialog without saving; values stay unchanged.
    // Precondition   : ramSharedPO – cost=310, price=560 (set by SW_INC_CP_003).
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open "Update Cost & Price" dialog.
    //                  3. Enter cost=9999, price=9999.
    //                  4. Click Cancel.
    // Expected Result: Dialog closes. Table row still shows cost=310, price=560.
    // =========================================================================
    it(
      "SW_INC_CP_004 – Product Only: Cancel dialog leaves cost and price unchanged",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_004: poNumber=${ramSharedPO}, product=${td.ramKingston.displayName}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.fillCostPrice(9999, 9999);
        incomingInvPage.closeDialogViaCancel();
        incomingInvPage.verifyCostPriceInRow(td.costPriceUpdates.updatedCostOnly, td.costPriceUpdates.updatedPriceOnly);
        log("SW_INC_CP_004: PASS");
      },
    );
  });

  // ===========================================================================
  // ██████████  MULTIPLE PRODUCTS IN ONE PO  ██████████████████████████████████
  // ===========================================================================
  describe("Multiple Products in PO Tests", () => {
    // =========================================================================
    // SW_INC_CP_005
    // Scenario       : Updating one product's cost/price in a multi-product PO
    //                  must not affect the other product's cost/price.
    // Precondition   : ramMultiPO imported with Kingston DDR4 and Corsair DDR5,
    //                  both at cost=45, price=75.
    // Test Steps     : 1. Search for Kingston DDR4 in ramMultiPO.
    //                  2. Open "Update Cost & Price" → enter cost=250, price=450 → Update.
    //                  3. Verify Kingston row shows cost=250, price=450.
    //                  4. Search for Corsair DDR5 in the same PO.
    //                  5. Verify Corsair row still shows cost=45, price=75.
    // Expected Result: Kingston updated. Corsair values unchanged.
    // =========================================================================
    it(
      "SW_INC_CP_005 – Multiple Products in PO: Update one product cost/price; other product remains unchanged",
      { tags: ["@smoke", "@regression"] },
      () => {
        log(`SW_INC_CP_005: ramMultiPO=${ramMultiPO}`);
        searchProduct(ramMultiPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.costPriceUpdates.newCost, td.costPriceUpdates.newPrice);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);
        incomingInvPage.verifyCostPriceInRow(td.costPriceUpdates.newCost, td.costPriceUpdates.newPrice);

        log(`SW_INC_CP_005: verifying Corsair cost=${td.ram.cost}, price=${td.ram.price} unchanged`);
        searchProduct(ramMultiPO, td.ram.displayName);
        incomingInvPage.verifyCostPriceInRow(td.ram.cost, td.ram.price);
        log("SW_INC_CP_005: PASS");
      },
    );
  });

  // ===========================================================================
  // ██████████  PRODUCT ITEM (LAPTOP) TESTS  ██████████████████████████████████
  // ===========================================================================
  describe("Product Item (Laptop) Tests", () => {
    // =========================================================================
    // SW_INC_CP_006
    // Scenario       : Update cost and price for a serialized item via the item
    //                  action menu inside the product's item list view.
    // Precondition   : laptopSharedPO imported with Lenovo laptop serial items.
    //                  Cost and Price columns enabled.
    // Test Steps     : 1. Navigate to Incoming Inventory, search for laptop in laptopSharedPO.
    //                  2. Click the product row to open the item list.
    //                  3. Open the first item's action menu → "Update Cost & Price".
    //                  4. Enter cost=250, price=450 → click Update.
    // Expected Result: Toast: "Cost and price of item '<serialNumber>' updated successfully".
    // =========================================================================
    it(
      "SW_INC_CP_006 – Product Item: Update item cost and price via item action menu, verify toast",
      { tags: ["@smoke", "@regression"] },
      () => {
        log(`SW_INC_CP_006: laptopSharedPO=${laptopSharedPO}, displayName=${td.laptop.displayName}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);

        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.submitCostPrice(td.costPriceUpdates.newCost, td.costPriceUpdates.newPrice);
        incomingInvPage.verifyItemSuccessMessage();
        log("SW_INC_CP_006: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_007
    // Scenario       : Cancel the item dialog without saving; no change occurs.
    // Precondition   : laptopSharedPO with laptop serial items accessible.
    // Test Steps     : 1. Navigate to the laptop item list in laptopSharedPO.
    //                  2. Open first item's action menu → "Update Cost & Price".
    //                  3. Enter cost=9999, price=9999.
    //                  4. Click Cancel.
    // Expected Result: Dialog closes. No success toast. Item cost/price unchanged.
    // =========================================================================
    it(
      "SW_INC_CP_007 – Product Item: Cancel dialog in item action menu leaves cost/price unchanged",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_007: laptopSharedPO=${laptopSharedPO}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);

        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.fillCostPrice(9999, 9999);
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_007: PASS");
      },
    );
  });

  // ===========================================================================
  // ██████████  MIXED PO (RAM + LAPTOP) TESTS  ████████████████████████████████
  // ===========================================================================
  describe("Mixed PO Tests", () => {
    // =========================================================================
    // SW_INC_CP_008
    // Scenario       : Update cost and price for the RAM (product-only) row
    //                  inside a PO that also contains laptop (product-item) rows.
    // Precondition   : mixedPO imported with Kingston DDR4 RAM and Lenovo laptop
    //                  items. Cost and Price columns enabled for both product types.
    // Test Steps     : 1. Search for Kingston DDR4 in mixedPO.
    //                  2. Open row action menu → "Update Cost & Price".
    //                  3. Enter cost=250, price=450 → click Update.
    // Expected Result: Success toast. RAM row shows cost=250, price=450.
    // =========================================================================
    it(
      "SW_INC_CP_008 – Mixed PO: Update RAM (Product Only) cost and price, verify RAM row updated",
      { tags: ["@smoke", "@regression"] },
      () => {
        log(`SW_INC_CP_008: poNumber=${mixedPO}, product=${td.ramKingston.displayName}`);
        searchProduct(mixedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.costPriceUpdates.newCost, td.costPriceUpdates.newPrice);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);
        incomingInvPage.verifyCostPriceInRow(td.costPriceUpdates.newCost, td.costPriceUpdates.newPrice);
        log("SW_INC_CP_008: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_009
    // Scenario       : After updating RAM cost/price in a mixed PO, the Laptop
    //                  product row must still display its original imported values.
    // Precondition   : mixedPO – RAM updated to cost=250, price=450 (SW_INC_CP_008).
    //                  Laptop items imported with cost=1500, price=2500.
    // Test Steps     : 1. Search for laptop in mixedPO.
    //                  2. Verify the laptop product row is visible.
    //                  3. Check cost and price values in the laptop row.
    // Expected Result: Laptop row shows original cost=1500, price=2500 (unchanged).
    // =========================================================================
    it(
      "SW_INC_CP_009 – Mixed PO: Laptop (Product Item) cost/price unaffected after RAM update",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_009: mixedPO=${mixedPO}, laptop.displayName=${td.laptop.displayName}`);
        searchProduct(mixedPO, td.laptop.displayName);

        incomingInvPage.verifyTableHasRows();
        incomingInvPage.verifyCostPriceInRow(td.laptop.cost, td.laptop.price);
        log("SW_INC_CP_009: PASS");
      },
    );
  });

  // ===========================================================================
  // ██████████  COST/PRICE VALIDATION — NEGATIVE VALUES  ██████████████████████
  // SW_INC_CP_010 – SW_INC_CP_015
  // React Hook Form rule: min:0 → submit blocked, inline error rendered,
  // dialog stays open. No state change in these tests.
  // ===========================================================================
  describe("Validation Tests — Negative Cost/Price", () => {
    // =========================================================================
    // SW_INC_CP_010
    // Scenario       : Submitting a negative cost with a valid price is blocked
    //                  by form validation; the dialog stays open with an error.
    // Precondition   : ramSharedPO accessible. "Update Cost & Price" dialog works.
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open "Update Cost & Price" dialog.
    //                  3. Enter cost=-50, price=200 → click Update.
    // Expected Result: Dialog remains open. Inline error: "Cost must greater than or equal to 0".
    // =========================================================================
    it(
      "SW_INC_CP_010 – Product Only: Negative cost + positive price shows cost validation error",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_010: ramSharedPO=${ramSharedPO}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.negativeCost, td.validation.positivePrice);
        incomingInvPage.verifyDialogError(td.errorMessages.costNegative);
        incomingInvPage.verifyDialogIsOpen();
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_010: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_011
    // Scenario       : Submitting a negative price with a valid cost is blocked
    //                  by form validation; the dialog stays open with an error.
    // Precondition   : ramSharedPO accessible. "Update Cost & Price" dialog works.
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open "Update Cost & Price" dialog.
    //                  3. Enter cost=100, price=-100 → click Update.
    // Expected Result: Dialog remains open. Inline error: "Price must greater than or equal to 0".
    // =========================================================================
    it(
      "SW_INC_CP_011 – Product Only: Positive cost + negative price shows price validation error",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_011: ramSharedPO=${ramSharedPO}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.positiveCost, td.validation.negativePrice);
        incomingInvPage.verifyDialogError(td.errorMessages.priceNegative);
        incomingInvPage.verifyDialogIsOpen();
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_011: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_012
    // Scenario       : Submitting both negative cost and price is blocked; both
    //                  inline errors appear simultaneously.
    // Precondition   : ramSharedPO accessible. "Update Cost & Price" dialog works.
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open "Update Cost & Price" dialog.
    //                  3. Enter cost=-50, price=-100 → click Update.
    // Expected Result: Dialog remains open. Both inline errors are displayed.
    // =========================================================================
    it(
      "SW_INC_CP_012 – Product Only: Both negative shows both cost and price validation errors",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_012: ramSharedPO=${ramSharedPO}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);

        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.negativeCost, td.validation.negativePrice);
        incomingInvPage.verifyDialogError(td.errorMessages.costNegative);
        incomingInvPage.verifyDialogError(td.errorMessages.priceNegative);
        incomingInvPage.verifyDialogIsOpen();
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_012: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_013
    // Scenario       : Negative cost + positive price on the item-level dialog
    //                  is blocked by form validation.
    // Precondition   : laptopSharedPO with serial items. Item "Update Cost & Price"
    //                  dialog accessible from the item list view.
    // Test Steps     : 1. Search for laptop in laptopSharedPO.
    //                  2. Drill into item list → open first item's action menu
    //                     → "Update Cost & Price".
    //                  3. Enter cost=-50, price=200 → click Update.
    // Expected Result: Dialog remains open. Inline error: "Cost must greater than or equal to 0".
    // =========================================================================
    it(
      "SW_INC_CP_013 – Product Item: Negative cost + positive price shows cost validation error",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_013: laptopSharedPO=${laptopSharedPO}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);

        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.negativeCost, td.validation.positivePrice);
        incomingInvPage.verifyDialogError(td.errorMessages.costNegative);
        incomingInvPage.verifyDialogIsOpen();
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_013: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_014
    // Scenario       : Positive cost + negative price on the item-level dialog
    //                  is blocked by form validation.
    // Precondition   : laptopSharedPO with serial items. Item dialog accessible.
    // Test Steps     : 1. Search for laptop in laptopSharedPO.
    //                  2. Drill into item list → open first item's "Update Cost & Price".
    //                  3. Enter cost=100, price=-100 → click Update.
    // Expected Result: Dialog remains open. Inline error: "Price must greater than or equal to 0".
    // =========================================================================
    it(
      "SW_INC_CP_014 – Product Item: Positive cost + negative price shows price validation error",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_014: laptopSharedPO=${laptopSharedPO}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);

        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.positiveCost, td.validation.negativePrice);
        incomingInvPage.verifyDialogError(td.errorMessages.priceNegative);
        incomingInvPage.verifyDialogIsOpen();
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_014: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_015
    // Scenario       : Both negative on the item-level dialog; both errors appear.
    // Precondition   : laptopSharedPO with serial items. Item dialog accessible.
    // Test Steps     : 1. Search for laptop in laptopSharedPO.
    //                  2. Drill into item list → open first item's "Update Cost & Price".
    //                  3. Enter cost=-50, price=-100 → click Update.
    // Expected Result: Dialog remains open. Both cost and price inline errors displayed.
    // =========================================================================
    it(
      "SW_INC_CP_015 – Product Item: Both negative shows both cost and price validation errors",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_015: laptopSharedPO=${laptopSharedPO}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);

        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.negativeCost, td.validation.negativePrice);
        incomingInvPage.verifyDialogError(td.errorMessages.costNegative);
        incomingInvPage.verifyDialogError(td.errorMessages.priceNegative);
        incomingInvPage.verifyDialogIsOpen();
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_015: PASS");
      },
    );
  });

  // ===========================================================================
  // ██████████  COST/PRICE VALIDATION — ZERO VALUES  ██████████████████████████
  // SW_INC_CP_016 – SW_INC_CP_021
  // min:0 means zero IS allowed. Tests confirm save succeeds, then re-open the
  // dialog to verify persisted values (row-text substring on "0" is unreliable).
  // ===========================================================================
  describe("Validation Tests — Zero Cost/Price", () => {
    // =========================================================================
    // SW_INC_CP_016
    // Scenario       : cost=0 with a positive price is a valid combination and
    //                  saves successfully for a product-only row.
    // Precondition   : ramSharedPO accessible. "Update Cost & Price" dialog works.
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open dialog → enter cost=0, price=200 → click Update.
    //                  3. Re-open the dialog and inspect the persisted input values.
    // Expected Result: Success toast. Reopened dialog shows cost=0, price=200.
    // =========================================================================
    it(
      "SW_INC_CP_016 – Product Only: cost=0 + positive price saves successfully",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_016: ramSharedPO=${ramSharedPO}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);
        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.zeroValue, td.validation.positivePrice);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);

        searchProduct(ramSharedPO, td.ramKingston.displayName);
        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.verifyDialogInputValues(td.validation.zeroValue, td.validation.positivePrice);
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_016: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_017
    // Scenario       : Positive cost with price=0 is a valid combination and
    //                  saves successfully for a product-only row.
    // Precondition   : ramSharedPO – cost=0, price=200 (set by SW_INC_CP_016).
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open dialog → enter cost=100, price=0 → click Update.
    //                  3. Re-open the dialog and inspect persisted values.
    // Expected Result: Success toast. Reopened dialog shows cost=100, price=0.
    // =========================================================================
    it(
      "SW_INC_CP_017 – Product Only: positive cost + price=0 saves successfully",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_017: ramSharedPO=${ramSharedPO}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);
        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.positiveCost, td.validation.zeroValue);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);

        searchProduct(ramSharedPO, td.ramKingston.displayName);
        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.verifyDialogInputValues(td.validation.positiveCost, td.validation.zeroValue);
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_017: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_018
    // Scenario       : Both cost=0 and price=0 is a valid combination and saves
    //                  successfully for a product-only row.
    // Precondition   : ramSharedPO accessible. "Update Cost & Price" dialog works.
    // Test Steps     : 1. Search for DDR4 in ramSharedPO.
    //                  2. Open dialog → enter cost=0, price=0 → click Update.
    //                  3. Re-open the dialog and inspect persisted values.
    // Expected Result: Success toast. Reopened dialog shows cost=0, price=0.
    // =========================================================================
    it(
      "SW_INC_CP_018 – Product Only: cost=0 + price=0 saves successfully",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_018: ramSharedPO=${ramSharedPO}`);
        searchProduct(ramSharedPO, td.ramKingston.displayName);
        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.zeroValue, td.validation.zeroValue);
        incomingInvPage.verifySuccessMessage(td.successMessages.costPriceUpdated);

        searchProduct(ramSharedPO, td.ramKingston.displayName);
        incomingInvPage.openUpdateCostPriceDialog();
        incomingInvPage.verifyDialogInputValues(td.validation.zeroValue, td.validation.zeroValue);
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_018: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_019
    // Scenario       : cost=0 with a positive price saves successfully for a
    //                  serialized item; persisted values are verified by reopening.
    // Precondition   : laptopSharedPO with serial items. Item dialog accessible.
    // Test Steps     : 1. Search for laptop in laptopSharedPO.
    //                  2. Drill into item list → open first item's "Update Cost & Price".
    //                  3. Enter cost=0, price=200 → click Update.
    //                  4. Re-navigate, reopen item dialog and check input values.
    // Expected Result: Item success toast. Reopened dialog shows cost=0, price=200.
    // =========================================================================
    it(
      "SW_INC_CP_019 – Product Item: cost=0 + positive price saves successfully",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_019: laptopSharedPO=${laptopSharedPO}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);
        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.zeroValue, td.validation.positivePrice);
        incomingInvPage.verifyItemSuccessMessage();

        searchProduct(laptopSharedPO, td.laptop.displayName);
        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.verifyDialogInputValues(td.validation.zeroValue, td.validation.positivePrice);
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_019: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_020
    // Scenario       : Positive cost with price=0 saves successfully for a
    //                  serialized item; persisted values are verified by reopening.
    // Precondition   : laptopSharedPO with serial items. Item dialog accessible.
    // Test Steps     : 1. Search for laptop in laptopSharedPO.
    //                  2. Drill into item list → open first item's "Update Cost & Price".
    //                  3. Enter cost=100, price=0 → click Update.
    //                  4. Re-navigate, reopen item dialog and check input values.
    // Expected Result: Item success toast. Reopened dialog shows cost=100, price=0.
    // =========================================================================
    it(
      "SW_INC_CP_020 – Product Item: positive cost + price=0 saves successfully",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_020: laptopSharedPO=${laptopSharedPO}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);
        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.positiveCost, td.validation.zeroValue);
        incomingInvPage.verifyItemSuccessMessage();

        searchProduct(laptopSharedPO, td.laptop.displayName);
        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.verifyDialogInputValues(td.validation.positiveCost, td.validation.zeroValue);
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_020: PASS");
      },
    );

    // =========================================================================
    // SW_INC_CP_021
    // Scenario       : Both cost=0 and price=0 saves successfully for a serialized
    //                  item; persisted values are verified by reopening the dialog.
    // Precondition   : laptopSharedPO with serial items. Item dialog accessible.
    // Test Steps     : 1. Search for laptop in laptopSharedPO.
    //                  2. Drill into item list → open first item's "Update Cost & Price".
    //                  3. Enter cost=0, price=0 → click Update.
    //                  4. Re-navigate, reopen item dialog and check input values.
    // Expected Result: Item success toast. Reopened dialog shows cost=0, price=0.
    // =========================================================================
    it(
      "SW_INC_CP_021 – Product Item: cost=0 + price=0 saves successfully",
      { tags: ["@regression"] },
      () => {
        log(`SW_INC_CP_021: laptopSharedPO=${laptopSharedPO}`);
        searchProduct(laptopSharedPO, td.laptop.displayName);
        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.submitCostPrice(td.validation.zeroValue, td.validation.zeroValue);
        incomingInvPage.verifyItemSuccessMessage();

        searchProduct(laptopSharedPO, td.laptop.displayName);
        incomingInvPage.openItemCostPriceDialog();
        incomingInvPage.verifyDialogInputValues(td.validation.zeroValue, td.validation.zeroValue);
        incomingInvPage.closeDialogViaCancel();
        log("SW_INC_CP_021: PASS");
      },
    );
  });

  // ─── after() — cleanup created POs ────────────────────────────────────────
  after(() => {
    if (createdPOs.length === 0) return;
    cy.adminSession();
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });
});
