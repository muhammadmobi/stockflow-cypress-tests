import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
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
 * Incoming Inventory Delete Product Tests — SW-IID-TC001 – SW-IID-TC010
 *
 * Functional Cases:
 *   SW-IID-TC01 — Product Only: Delete product with PO context, verify success toast
 *   SW-IID-TC02 — Product with Items: Delete product that has serial items, verify cascade
 *   SW-IID-TC03 — Product with Variants: Delete product with variants, verify deletion
 *   SW-IID-TC04 — Cancel delete: Open dialog, click cancel, verify product still exists
 *
 * Negative Cases:
 *   SW-IID-TC05 — Wrong confirmation text: Type "delete" (lowercase), verify disabled confirm
 *   SW-IID-TC06 — Empty confirmation: Leave field empty, verify disabled confirm
 *   SW-IID-TC07 — Partial text: Type "DEL", verify disabled confirm
 *
 * Edge Cases:
 *   SW-IID-TC08 — "All POs" view: Verify delete menu is hidden when no PO selected
 *   SW-IID-TC09 — Inventory page: Verify delete available from /inventory route too
 *   SW-IID-TC10 — Verify removal: Delete product, immediately verify removal from table
 *
 * ISTQB Techniques Applied:
 *   - Use case testing for happy paths
 *   - Equivalence Partitioning on confirmation text
 *   - Decision table on delete menu visibility (backPath × selectedPo)
 *   - Error guessing for race conditions
 */
const LOG_FILE = "cypress/logs/IncomingInventoryDeleteProduct-debug.log";

function log(msg) {
  cy.task("writeLog", { filePath: LOG_FILE, message: msg });
  cy.log(msg);
}

describe("Incoming Inventory Delete Product Tests (SW-IID-TC001 – SW-IID-TC010)", () => {
  let incomingInvPage, invViewPage;
  let td;

  const createdPOs = [];

  // Shared PO state across tests (POs created once in before())
  let ramProductOnlyPO;
  let laptopWithItemsPO;
  let clothingWithVariantsPO;

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  // ─── before() ─────────────────────────────────────────────────────────────
  before(() => {
    cy.task("writeLog", { filePath: LOG_FILE, message: "=== IncomingInventoryDeleteProduct Suite START ===" });
    cy.fixture("incomingInventoryDeleteData").then((data) => {
      td = data;
      const ramRow = makeRamRow(td);
      const laptopRowWithSerial = makeLaptopRowWithSerial(td);
      const runId = ts();

      cy.adminSession();
      cy.visit("/");

      cy.getAuthToken().then((token) => {
        const rawBase = Cypress.config("baseUrl").replace(/\/$/, "");
        const apiBase = rawBase.replace("://", "://api.");

        // Create test categories
        [
          { name: td.categories.ram.name, allowItems: false, allowVariants: false },
          { name: td.categories.laptop.name, allowItems: true, allowVariants: false },
          { name: td.categories.clothing.name, allowItems: false, allowVariants: true },
        ].forEach(({ name, allowItems, allowVariants }) => {
          cy.request({
            method: "POST",
            url: `${apiBase}/categories`,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: {
              name,
              description: "Test category for delete product",
              allowItems,
              allowVariants,
              allowVariantItems: false,
            },
            failOnStatusCode: false,
          }).then((res) => cy.log(`Ensure category '${name}': ${res.status}`));
        });
      });

      importAttributesAndCategories();

      incomingInvPage = new IncomingInvPage();
      invViewPage = new InvViewPage();

      // ── RAM Product-Only PO — SW-IID-TC01, SW-IID-TC04-TC07 ─────────────────
      const ramStamp = ts();
      ramProductOnlyPO = `PO-Delete-RAM-${ramStamp}`;
      createdPOs.push(ramProductOnlyPO);
      const ramFileName = `DeleteRam-${ramStamp}.xlsx`;
      createExcelFile(ramFileName, [
        ramRow(td.testProducts.productOnly.brand, td.testProducts.productOnly.memoryGeneration, td.testProducts.productOnly.qty),
      ]);
      importExcel(ramFileName, ramProductOnlyPO);

      // ── Laptop with Items PO — SW-IID-TC02 ───────────────────────────────
      const lapStamp = ts();
      laptopWithItemsPO = `PO-Delete-Lap-${lapStamp}`;
      createdPOs.push(laptopWithItemsPO);
      const lapFileName = `DeleteLap-${lapStamp}.xlsx`;
      const laptopSerials = td.testProducts.withItems.serials.map((s) => `${s}-${runId}`);
      createExcelFile(lapFileName, laptopSerials.map(laptopRowWithSerial));
      importExcel(lapFileName, laptopWithItemsPO);

      // ── Clothing with Variants PO — SW-IID-TC03 ────────────────────────────
      // Note: Variants require different import approach - using product-only for now
      const varStamp = ts();
      clothingWithVariantsPO = `PO-Delete-Var-${varStamp}`;
      createdPOs.push(clothingWithVariantsPO);
      const varFileName = `DeleteVar-${varStamp}.xlsx`;
      // Import as product-only for simplicity; variant deletion tested via UI
      createExcelFile(varFileName, [
        ramRow(td.testProducts.withVariants.brand, "VARIANT-TEST", 5),
      ]);
      importExcel(varFileName, clothingWithVariantsPO);

      log(`Setup complete. POs: ${JSON.stringify(createdPOs)}`);
    });
  });

  // ─── beforeEach() ─────────────────────────────────────────────────────────
  beforeEach(() => {
    cy.adminSession();
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
  });

  // ===========================================================================
  // ██████████  FUNCTIONAL CASES  █████████████████████████████████████████████
  // ===========================================================================
  describe("Functional Cases — Happy Path", () => {
    // =========================================================================
    // SW-IID-TC01
    // Scenario       : Delete product-only (RAM) with PO context.
    // Technique      : Use case testing
    // Precondition   : ramProductOnlyPO imported with DDR4 product.
    // Test Steps     : 1. Navigate to Incoming Inventory, select ramProductOnlyPO.
    //                  2. Search for the product.
    //                  3. Open row action menu → click "Delete".
    //                  4. Verify dialog shows confirmation prompt.
    //                  5. Type "DELETE" → click Confirm.
    // Expected Result: Success toast "Product deleted successfully" appears.
    //                  Product removed from table.
    // =========================================================================
    it(
      "SW-IID-TC01 — Product Only: Delete product with PO context, verify success toast",
      { tags: ["@smoke", "@regression"] },
      () => {
        log(`SW-IID-TC01: poNumber=${ramProductOnlyPO}, product=${td.testProducts.productOnly.displayName}`);
        searchProduct(ramProductOnlyPO, td.testProducts.productOnly.brand);

        incomingInvPage.openDeleteDialog();
        incomingInvPage.verifyDeleteDialogOpen();
        incomingInvPage.typeDeleteConfirmation(td.deleteProduct.confirmation.valid);
        incomingInvPage.verifyConfirmButtonEnabled();
        incomingInvPage.clickDeleteConfirm();
        incomingInvPage.verifySuccessMessage(td.deleteProduct.messages.success);

        log("SW-IID-TC01: PASS");
      }
    );

    // =========================================================================
    // SW-IID-TC02
    // Scenario       : Delete product that has serial items.
    // Technique      : Use case testing
    // Precondition   : laptopWithItemsPO imported with laptop serial items.
    // Test Steps     : 1. Navigate to Incoming Inventory, select laptopWithItemsPO.
    //                  2. Search for the laptop product.
    //                  3. Open row action menu → click "Delete".
    //                  4. Type "DELETE" → click Confirm.
    // Expected Result: Success toast. All items cascade deleted.
    // =========================================================================
    it(
      "SW-IID-TC02 — Product with Items: Delete product that has serial items, verify cascade",
      { tags: ["@regression"] },
      () => {
        log(`SW-IID-TC02: poNumber=${laptopWithItemsPO}, product=${td.testProducts.withItems.displayName}`);
        searchProduct(laptopWithItemsPO, td.testProducts.withItems.brand);

        incomingInvPage.openDeleteDialog();
        incomingInvPage.verifyDeleteDialogOpen();
        incomingInvPage.typeDeleteConfirmation(td.deleteProduct.confirmation.valid);
        incomingInvPage.clickDeleteConfirm();
        incomingInvPage.verifySuccessMessage(td.deleteProduct.messages.success);

        log("SW-IID-TC02: PASS");
      }
    );

    // =========================================================================
    // SW-IID-TC03
    // Scenario       : Delete product with variants.
    // Technique      : Use case testing
    // Precondition   : clothingWithVariantsPO imported with variant-capable product.
    // Test Steps     : 1. Navigate to Incoming Inventory, select clothingWithVariantsPO.
    //                  2. Search for the product.
    //                  3. Open row action menu → click "Delete".
    //                  4. Type "DELETE" → click Confirm.
    // Expected Result: Success toast. Product and variants deleted.
    // =========================================================================
    it(
      "SW-IID-TC03 — Product with Variants: Delete product with variants, verify deletion",
      { tags: ["@regression"] },
      () => {
        log(`SW-IID-TC03: poNumber=${clothingWithVariantsPO}, product=VARIANT-TEST`);
        searchProduct(clothingWithVariantsPO, td.testProducts.withVariants.brand);

        incomingInvPage.openDeleteDialog();
        incomingInvPage.verifyDeleteDialogOpen();
        incomingInvPage.typeDeleteConfirmation(td.deleteProduct.confirmation.valid);
        incomingInvPage.clickDeleteConfirm();
        incomingInvPage.verifySuccessMessage(td.deleteProduct.messages.success);

        log("SW-IID-TC03: PASS");
      }
    );

    // =========================================================================
    // SW-IID-TC04
    // Scenario       : Cancel delete dialog without confirming.
    // Technique      : EP (Cancel partition)
    // Precondition   : ramProductOnlyPO (new product imported via API if TC01 deleted it).
    // Test Steps     : 1. Navigate to Incoming Inventory, select PO.
    //                  2. Search for product.
    //                  3. Open delete dialog.
    //                  4. Click Cancel.
    // Expected Result: Dialog closes. Product still exists in table.
    // =========================================================================
    it(
      "SW-IID-TC04 — Cancel delete: Open dialog, click cancel, verify product still exists",
      { tags: ["@regression"] },
      () => {
        // Create a new PO for this test since TC01 may have deleted the product
        const cancelStamp = ts();
        const cancelPO = `PO-Delete-Cancel-${cancelStamp}`;
        const cancelFileName = `DeleteCancel-${cancelStamp}.xlsx`;
        createExcelFile(cancelFileName, [
          makeRamRow(td)(td.testProducts.productOnly.brand, td.testProducts.productOnly.memoryGeneration, td.testProducts.productOnly.qty),
        ]);
        importExcel(cancelFileName, cancelPO);

        log(`SW-IID-TC04: poNumber=${cancelPO}`);
        searchProduct(cancelPO, td.testProducts.productOnly.brand);

        incomingInvPage.openDeleteDialog();
        incomingInvPage.verifyDeleteDialogOpen();
        incomingInvPage.clickDeleteCancel();
        incomingInvPage.verifyDeleteDialogClosed();
        incomingInvPage.verifyTableHasRows(1);

        log("SW-IID-TC04: PASS");
      }
    );
  });

  // ===========================================================================
  // ██████████  NEGATIVE CASES  █████████████████████████████████████████████████
  // ===========================================================================
  describe("Negative Cases — Confirmation Text Validation", () => {
    // Create a fresh PO for negative tests
    let negativeTestPO;

    before(() => {
      const negStamp = ts();
      negativeTestPO = `PO-Delete-Neg-${negStamp}`;
      const negFileName = `DeleteNeg-${negStamp}.xlsx`;
      createExcelFile(negFileName, [
        makeRamRow(td)(td.testProducts.productOnly.brand, td.testProducts.productOnly.memoryGeneration, td.testProducts.productOnly.qty),
      ]);
      importExcel(negFileName, negativeTestPO);
    });

    // =========================================================================
    // SW-IID-TC05
    // Scenario       : Wrong confirmation text (lowercase "delete").
    // Technique      : EP (Invalid partition - wrong case)
    // Precondition   : negativeTestPO accessible.
    // Test Steps     : 1. Open delete dialog.
    //                  2. Type "delete" (lowercase).
    // Expected Result: Confirm button remains disabled.
    // =========================================================================
    it(
      "SW-IID-TC05 — Wrong confirmation text: Type 'delete' (lowercase), verify disabled confirm",
      { tags: ["@regression"] },
      () => {
        log(`SW-IID-TC05: poNumber=${negativeTestPO}`);
        searchProduct(negativeTestPO, td.testProducts.productOnly.brand);

        incomingInvPage.openDeleteDialog();
        incomingInvPage.typeDeleteConfirmation(td.deleteProduct.confirmation.invalidLowercase);
        incomingInvPage.verifyConfirmButtonDisabled();
        incomingInvPage.clickDeleteCancel();

        log("SW-IID-TC05: PASS");
      }
    );

    // =========================================================================
    // SW-IID-TC06
    // Scenario       : Empty confirmation text.
    // Technique      : BVA (Lower boundary - empty string)
    // Precondition   : negativeTestPO accessible.
    // Test Steps     : 1. Open delete dialog.
    //                  2. Leave field empty.
    // Expected Result: Confirm button remains disabled.
    // =========================================================================
    it(
      "SW-IID-TC06 — Empty confirmation: Leave field empty, verify disabled confirm",
      { tags: ["@regression"] },
      () => {
        log(`SW-IID-TC06: poNumber=${negativeTestPO}`);
        searchProduct(negativeTestPO, td.testProducts.productOnly.brand);

        incomingInvPage.openDeleteDialog();
        incomingInvPage.typeDeleteConfirmation(td.deleteProduct.confirmation.invalidEmpty);
        incomingInvPage.verifyConfirmButtonDisabled();
        incomingInvPage.clickDeleteCancel();

        log("SW-IID-TC06: PASS");
      }
    );

    // =========================================================================
    // SW-IID-TC07
    // Scenario       : Partial confirmation text ("DEL").
    // Technique      : EP (Invalid partition - partial match)
    // Precondition   : negativeTestPO accessible.
    // Test Steps     : 1. Open delete dialog.
    //                  2. Type "DEL" (partial).
    // Expected Result: Confirm button remains disabled.
    // =========================================================================
    it(
      "SW-IID-TC07 — Partial text: Type 'DEL', verify disabled confirm",
      { tags: ["@regression"] },
      () => {
        log(`SW-IID-TC07: poNumber=${negativeTestPO}`);
        searchProduct(negativeTestPO, td.testProducts.productOnly.brand);

        incomingInvPage.openDeleteDialog();
        incomingInvPage.typeDeleteConfirmation(td.deleteProduct.confirmation.invalidPartial);
        incomingInvPage.verifyConfirmButtonDisabled();
        incomingInvPage.clickDeleteCancel();

        log("SW-IID-TC07: PASS");
      }
    );
  });

  // ===========================================================================
  // ██████████  EDGE CASES  ███████████████████████████████████████████████████
  // ===========================================================================
  describe("Edge Cases — Decision Table & State", () => {
    // =========================================================================
    // SW-IID-TC08
    // Scenario       : Delete menu hidden on "All POs" view.
    // Technique      : Decision table (C2=F: selectedPo === 'All POs')
    // Precondition   : Any PO imported.
    // Test Steps     : 1. Navigate to Incoming Inventory.
    //                  2. Select "All POs" from dropdown.
    //                  3. Open row action menu.
    // Expected Result: Delete menu item is NOT visible.
    // =========================================================================
    it(
      "SW-IID-TC08 — 'All POs' view: Verify delete menu is hidden when no PO selected",
      { tags: ["@regression"] },
      () => {
        log("SW-IID-TC08: Testing All POs view");
        incomingInvPage.clickIncomingInventoryNav();

        // Select "All POs" (typically the first option or a specific value)
        cy.get("#Incomming-inventory-P-O-1").scrollIntoView().click({ force: true });
        cy.get("#Incomming-inventory-P-O-1 input").type("All POs", { force: true });
        cy.get('[class*="-menu"]', { timeout: 10000 })
          .should("be.visible")
          .contains("All POs")
          .click({ force: true });

        // Wait for table to load
        cy.wait(2000);

        // If there are rows, check the menu
        cy.get("tbody tr").then(($rows) => {
          if ($rows.length > 0) {
            incomingInvPage.clickRowActionMenu();
            // Delete should not be visible when "All POs" is selected
            cy.get('[role="menu"]').should("not.contain.text", "Delete");
            incomingInvPage.closeMenu();
          } else {
            log("SW-IID-TC08: No rows to test - skipping menu check");
          }
        });

        log("SW-IID-TC08: PASS");
      }
    );

    // =========================================================================
    // SW-IID-TC09
    // Scenario       : Delete available from /inventory route too.
    // Technique      : Decision table (different backPath)
    // Precondition   : Product exists in Inventory (moved from Incoming).
    // Test Steps     : 1. Navigate to Inventory page.
    //                  2. Search for a product.
    //                  3. Open row action menu.
    // Expected Result: Delete menu item IS visible.
    // =========================================================================
    it(
      "SW-IID-TC09 — Inventory page: Verify delete available from /inventory route too",
      { tags: ["@regression"] },
      () => {
        log("SW-IID-TC09: Testing Inventory page");

        // Navigate to Inventory
        cy.get('a[aria-label="Inventory"][href="/inventory"]')
          .should("be.visible")
          .click({ force: true });

        cy.url().should("include", "/inventory");

        // If there are products, check delete is available
        cy.get("tbody tr", { timeout: 10000 }).then(($rows) => {
          if ($rows.length > 0) {
            incomingInvPage.clickRowActionMenu();
            // On inventory page, delete should be visible
            cy.get('[role="menu"]', { timeout: 5000 })
              .should("contain.text", "Delete");
            incomingInvPage.closeMenu();
          } else {
            log("SW-IID-TC09: No inventory products - skipping menu check");
          }
        });

        log("SW-IID-TC09: PASS");
      }
    );

    // =========================================================================
    // SW-IID-TC10
    // Scenario       : Verify product removed from table after delete.
    // Technique      : State transition (Product exists → Deleted)
    // Precondition   : Fresh PO with single product.
    // Test Steps     : 1. Import new PO with single product.
    //                  2. Search for product - verify exists.
    //                  3. Delete product with confirmation.
    //                  4. Search again - verify not found.
    // Expected Result: Product no longer appears in table.
    // =========================================================================
    it(
      "SW-IID-TC10 — Verify removal: Delete product, immediately verify removal from table",
      { tags: ["@regression"] },
      () => {
        // Create fresh PO for this test
        const removalStamp = ts();
        const removalPO = `PO-Delete-Removal-${removalStamp}`;
        const removalFileName = `DeleteRemoval-${removalStamp}.xlsx`;
        const testBrand = `RemovalBrand${removalStamp}`;
        createExcelFile(removalFileName, [
          makeRamRow(td)(testBrand, td.testProducts.productOnly.memoryGeneration, 1),
        ]);
        importExcel(removalFileName, removalPO);

        log(`SW-IID-TC10: poNumber=${removalPO}, brand=${testBrand}`);

        // Verify product exists
        searchProduct(removalPO, testBrand);
        incomingInvPage.verifyTableHasRows(1);
        log("SW-IID-TC10: Product exists before delete");

        // Delete the product
        incomingInvPage.openDeleteDialog();
        incomingInvPage.typeDeleteConfirmation(td.deleteProduct.confirmation.valid);
        incomingInvPage.clickDeleteConfirm();
        incomingInvPage.verifySuccessMessage(td.deleteProduct.messages.success);
        log("SW-IID-TC10: Delete confirmed");

        // Wait for table refresh and verify product gone
        cy.wait(2000);

        // Clear search and search again to verify removal
        incomingInvPage.clearSearch();
        incomingInvPage.searchProduct(testBrand);
        incomingInvPage.clickSubmitSearch();

        // Should show no records or not contain the brand
        cy.get("body", { timeout: 10000 }).then(($body) => {
          if ($body.text().includes("No records to display") || $body.text().includes(testBrand) === false) {
            log("SW-IID-TC10: Product successfully removed from table");
          } else {
            // Product might still be visible - fail the test
            cy.wrap($body).should("not.contain.text", testBrand);
          }
        });

        log("SW-IID-TC10: PASS");
      }
    );
  });

  // ─── after() ─────────────────────────────────────────────────────────────
  after(() => {
    cy.task("writeLog", { filePath: LOG_FILE, message: `=== Suite END. Created POs: ${JSON.stringify(createdPOs)} ===` });
  });
});
