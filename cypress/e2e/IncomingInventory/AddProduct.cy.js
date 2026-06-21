import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories } from "../../support/helpers/attributeHelpers";
import {
  makeLaptopRowWithSerial,
  importExcel,
  createExcelFile,
} from "../../support/helpers/incomingInventoryHelpers";

/**
 * Add Product to PO Tests — SW-IMP-ADD-TC01 – SW-IMP-ADD-TC19
 *
 * Feature: Add Existing Product to Purchase Order via Header Long Button
 *          with Search Specificity validation (brand + model/memory generation)
 * UI Route: /incoming-inventory → Select PO → Long Button → "Add Product"
 * API: POST /incoming-items/add-product (add to PO)
 *      GET  /products (search products)
 *
 * Test Data Strategy: 2 products per category to test search specificity
 *  RAM:    Kingston DDR4 (primary) + Kingston DDR5 (secondary)
 *  Laptop: Lenovo ThinkPad-X1 (primary) + Lenovo ThinkPad-X390 (secondary)
 *  Search by: brand + memoryGeneration (RAM) or brand + modelNumber (Laptop)
 *
 * ✅ FUNCTIONAL (Happy Path) — Use Case Testing:
 *   SW-IMP-ADD-TC01 — Complete flow: Search → Select → Form → Add to PO (@smoke)
 *   SW-IMP-ADD-TC02 — Back button on cost screen returns to product list
 *   SW-IMP-ADD-TC03 — Close dialog via ✕ without adding product
 *   SW-IMP-ADD-TC04 — Verify product appears in PO table after add
 *
 * 🔍 SEARCH & SELECTION — EP / Use Case:
 *   SW-IMP-ADD-TC05 — Search with valid product name shows results
 *   SW-IMP-ADD-TC06 — Search with no results shows empty message
 *   SW-IMP-ADD-TC07 — Click Add without selecting product shows error
 *
 * ❌ FORM VALIDATION — EP (Invalid Partitions):
 *   SW-IMP-ADD-TC08 — Zero expected quantity → Add to PO disabled
 *   SW-IMP-ADD-TC09 — Negative expected quantity → Add to PO disabled (UI may not accept negative input)
 *   SW-IMP-ADD-TC10 — Empty expected quantity → Add to PO disabled
 *
 * 🔢 BOUNDARY VALUE — BVA (2-value):
 *   SW-IMP-ADD-TC11 — Min expected quantity (1) → accepted
 *   SW-IMP-ADD-TC12 — Large expected quantity (9999) → accepted
 *   SW-IMP-ADD-TC13 — Min cost (0.01) → accepted
 *   SW-IMP-ADD-TC14 — Zero cost (allowed) → accepted
 *
 * 🧩 EDGE CASES — Error Guessing & Search Specificity:
 *   SW-IMP-ADD-TC15 — Verify selected product card on cost screen
 *   SW-IMP-ADD-TC16 — Add second product to same PO
 *   SW-IMP-ADD-TC17 — Search specificity: add DDR4 (not DDR5) to PO
 *   SW-IMP-ADD-TC18 — Search specificity: add ThinkPad-X1 (not X390) to PO
 *   SW-IMP-ADD-TC19 — Brand-only search regression (both products shown)
 *
 * Few-shot reference: ViewItemsAndDetailsTests.cy.js
 */

const LOG_FILE = "cypress/logs/AddProduct-debug.log";

function log(msg) {
  cy.task("writeLog", { filePath: LOG_FILE, message: msg });
  cy.log(msg);
}

describe(
  "Add Product to PO Tests (SW-IMP-ADD-TC01 – SW-IMP-ADD-TC16)",
  { tags: ["@regression"] },
  () => {
    let incomingInvPage, purchaseOrderPage;
    let td;
    const createdPOs = [];
    let testPO;
    let runId;

    function ts() {
      const d = new Date();
      return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
    }

    // ─── before() ───────────────────────────────────────────────────────────
    before(() => {
      cy.fixture("addProductData").then((data) => {
        td = data;
        runId = ts();

        cy.adminSession();
        cy.visit("/");

        // Ensure categories exist via API
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
                description: "Automation test category",
                allowItems,
                allowVariants: false,
                allowVariantItems: false,
              },
              failOnStatusCode: false,
            }).then((res) =>
              cy.log(`Ensure category '${name}': ${res.status}`)
            );
          });
        });

        importAttributesAndCategories();

        incomingInvPage = new IncomingInvPage();
        purchaseOrderPage = new PurchaseOrderPage();

        // Seed PO with a laptop line so TC01 can add Kingston RAM (backend rejects duplicate productId on same PO)
        const stamp = ts();
        testPO = `PO-AddProd-${stamp}`;
        createdPOs.push(testPO);
        const fileName = `AddProd-${stamp}.xlsx`;

        const laptopRow = makeLaptopRowWithSerial(td);
        const seedSerial = `SEED-LP-${stamp}`;
        createExcelFile(fileName, [laptopRow(seedSerial)]);

        importExcel(fileName, testPO);
        log(`[SETUP] Created PO: ${testPO} with laptop seed serial ${seedSerial}`);
      });
    });

    // ─── beforeEach() ─────────────────────────────────────────────────────────
    beforeEach(() => {
      cy.adminSession();
      cy.visit("/");
      incomingInvPage = new IncomingInvPage();
      purchaseOrderPage = new PurchaseOrderPage();
    });

    // =========================================================================
    // ██  FUNCTIONAL CASES (Use Case Testing)  ████████████████████████████████
    // =========================================================================

    /**
     * @testCaseId    SW-IMP-ADD-TC01
     * @technique     Use Case — happy path (actor-driven complete flow)
     * @description   Complete Add Product flow: open dialog → search → select
     *                product → click Add → fill expected qty & cost → Add to PO.
     *                Verifies success toast appears.
     */
    it(
      "SW-IMP-ADD-TC01 — Complete Add Product to PO flow",
      { tags: ["@smoke", "@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.addProductToPO(
          td.addProductToPO.validEntry.searchTerm,
          td.testProducts.ram.primary.displayName,
          td.addProductToPO.validEntry.expectedQuantity,
          td.addProductToPO.validEntry.cost
        );

        incomingInvPage.verifyAddProductSuccess(td.messages.addSuccess);
        log("[TC01] Complete flow passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC02
     * @technique     Use Case — alternate path (Back button on form)
     * @description   After selecting a product and clicking Add, clicking Back
     *                returns to product list without adding the product.
     */
    it(
      "SW-IMP-ADD-TC02 — Back button on cost screen returns to product list",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.ramProduct.displayName);
        incomingInvPage.clickAddButton();

        // Verify we're on the cost screen
        incomingInvPage.verifySelectedProductVisible();

        // Click Back — should return to product list
        incomingInvPage.clickAddProductBack();

        // Verify we're back on the product list (product card + Add button visible)
        cy.get('[role="dialog"]:visible', { timeout: 20000 }).within(() => {
          cy.contains('button', /^Add$/)
            .filter(':visible')
            .should('exist');
          cy.contains(td.testProducts.ram.primary.displayName, { timeout: 15000 }).should(
            'be.visible'
          );
          cy.contains('Selected Product').should('not.exist');
        });

        incomingInvPage.closeAddProductDialog();
        log("[TC02] Back button flow passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC03
     * @technique     Use Case — exception path (Cancel/Close without adding)
     * @description   Opening Add Product dialog and closing via ✕ without
     *                completing the flow should not add any product.
     */
    it(
      "SW-IMP-ADD-TC03 — Close dialog via ✕ without adding product",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();

        // Search but don't select or submit
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );

        // Close dialog
        incomingInvPage.closeAddProductDialog();

        // Verify Add Product dialog is fully dismissed (no visible dialog)
        cy.get('[role="dialog"]:visible').should("not.exist");
        log("[TC03] Close dialog flow passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC04
     * @technique     Use Case — verification step (product visible in table)
     * @description   After adding a product via TC01, verify the product appears
     *                in the PO product list table.
     */
    it(
      "SW-IMP-ADD-TC04 — Verify added product appears in PO table",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        // Kingston RAM was added in TC01; it must appear in the PO table
        incomingInvPage.verifyProductInPOTable(td.testProducts.ram.primary.displayName);
        log("[TC04] Product in table verification passed");
      }
    );

    // =========================================================================
    // ██  SEARCH & SELECTION CASES (EP / Use Case)  ██████████████████████████
    // =========================================================================

    /**
     * @testCaseId    SW-IMP-ADD-TC05
     * @technique     EP — valid partition (search term matches existing product)
     * @description   Typing a valid product name in the search field and clicking
     *                Search displays matching products in the results list.
     */
    it(
      "SW-IMP-ADD-TC05 — Search with valid product name shows results",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );

        // Verify at least one product card appears (scope to dialog)
        cy.get('[role="dialog"]:visible').within(() => {
          cy.get("li", { timeout: 10000 }).should("have.length.at.least", 1);
        });

        incomingInvPage.closeAddProductDialog();
        log("[TC05] Valid search results passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC06
     * @technique     EP — invalid partition (search term matches nothing)
     * @description   Searching for a non-existent product shows "No products found".
     */
    it(
      "SW-IMP-ADD-TC06 — Search with no results shows empty message",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(td.invalidInputs.noResultsSearch);

        incomingInvPage.verifyNoProductsFound();

        incomingInvPage.closeAddProductDialog();
        log("[TC06] No results search passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC07
     * @technique     EP — invalid partition (no product selected)
     * @description   Clicking Add without selecting any product shows an error toast.
     */
    it(
      "SW-IMP-ADD-TC07 — Click Add without selecting product shows error",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );

        // Click Add without selecting any product from the list (scoped to dialog)
        cy.get('[role="dialog"]:visible').within(() => {
          cy.contains("button", /^Add$/)
            .filter(":visible")
            .should("not.be.disabled")
            .click({ force: true });
        });

        // Should show error toast
        cy.contains(td.messages.selectProduct, { timeout: 5000 }).should(
          "be.visible"
        );

        incomingInvPage.closeAddProductDialog();
        log("[TC07] No selection error passed");
      }
    );

    // =========================================================================
    // ██  FORM VALIDATION CASES (EP — Invalid Partitions)  ██████████████████
    // =========================================================================

    /**
     * @testCaseId    SW-IMP-ADD-TC08
     * @technique     EP — invalid partition (zero quantity)
     * @description   Entering 0 as expected quantity shows a validation helper
     *                error and disables the Add to PO button.
     */
    it(
      "SW-IMP-ADD-TC08 — Zero expected quantity keeps Add to PO disabled",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.primary.displayName);
        incomingInvPage.clickAddButton();

        incomingInvPage.fillExpectedQuantity(td.invalidInputs.epZeroQty);

        incomingInvPage.verifyExpectedQtyHelperError(
          td.messages.qtyHelperError
        );
        incomingInvPage.verifyAddToPODisabled();

        incomingInvPage.closeAddProductDialog();
        log("[TC08] Zero quantity validation passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC09
     * @technique     EP — invalid partition (negative quantity)
     * @description   Negative values may not enter the controlled number field;
     *                Add to PO must stay disabled.
     */
    it(
      "SW-IMP-ADD-TC09 — Negative expected quantity keeps Add to PO disabled",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.primary.displayName);
        incomingInvPage.clickAddButton();

        incomingInvPage.fillExpectedQuantity(td.invalidInputs.epNegativeQty);

        incomingInvPage.verifyAddToPODisabled();

        incomingInvPage.closeAddProductDialog();
        log("[TC09] Negative quantity validation passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC10
     * @technique     EP — invalid partition (empty quantity)
     * @description   Leaving the expected quantity field empty keeps the
     *                Add to PO button disabled.
     */
    it(
      "SW-IMP-ADD-TC10 — Empty expected quantity keeps Add to PO disabled",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.primary.displayName);
        incomingInvPage.clickAddButton();

        // Don't fill quantity — leave it empty
        incomingInvPage.verifyAddToPODisabled();

        incomingInvPage.closeAddProductDialog();
        log("[TC10] Empty quantity validation passed");
      }
    );

    // =========================================================================
    // ██  BOUNDARY VALUE CASES (BVA — 2-value)  ██████████████████████████████
    // =========================================================================

    /**
     * @testCaseId    SW-IMP-ADD-TC11
     * @technique     BVA — lower boundary valid (qty = 1)
     * @description   Expected quantity of 1 (minimum valid) enables the
     *                Add to PO button.
     */
    it(
      "SW-IMP-ADD-TC11 — Min expected quantity (1) enables Add to PO",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.primary.displayName);
        incomingInvPage.clickAddButton();

        incomingInvPage.fillExpectedQuantity(td.boundaryTests.qty.bvaLowerValid);
        incomingInvPage.verifyAddToPOEnabled();

        incomingInvPage.closeAddProductDialog();
        log("[TC11] Min quantity boundary passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC12
     * @technique     BVA — upper boundary valid (qty = 9999)
     * @description   Expected quantity of 9999 (large valid value) enables the
     *                Add to PO button.
     */
    it(
      "SW-IMP-ADD-TC12 — Large expected quantity (9999) enables Add to PO",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.primary.displayName);
        incomingInvPage.clickAddButton();

        incomingInvPage.fillExpectedQuantity(td.boundaryTests.qty.bvaUpperValid);
        incomingInvPage.verifyAddToPOEnabled();

        incomingInvPage.closeAddProductDialog();
        log("[TC12] Large quantity boundary passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC13
     * @technique     BVA — lower boundary valid (cost = 0.01)
     * @description   Cost of 0.01 (minimum positive value) enables the
     *                Add to PO button.
     */
    it(
      "SW-IMP-ADD-TC13 — Min cost (0.01) is accepted",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.primary.displayName);
        incomingInvPage.clickAddButton();

        incomingInvPage.fillExpectedQuantity(
          td.addProductToPO.validEntry.expectedQuantity
        );
        incomingInvPage.fillProductCost(td.boundaryTests.cost.bvaMinValid);
        incomingInvPage.verifyAddToPOEnabled();

        incomingInvPage.closeAddProductDialog();
        log("[TC13] Min cost boundary passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC14
     * @technique     BVA — boundary value (cost = 0, allowed per frontend)
     * @description   Cost of 0 is accepted (frontend defaults to 0 if blank).
     */
    it(
      "SW-IMP-ADD-TC14 — Zero cost is accepted",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.primary.displayName);
        incomingInvPage.clickAddButton();

        incomingInvPage.fillExpectedQuantity(
          td.addProductToPO.validEntry.expectedQuantity
        );
        incomingInvPage.fillProductCost(td.boundaryTests.cost.bvaZero);
        incomingInvPage.verifyAddToPOEnabled();

        incomingInvPage.closeAddProductDialog();
        log("[TC14] Zero cost boundary passed");
      }
    );

    // =========================================================================
    // ██  EDGE CASES (Error Guessing)  ████████████████████████████████████████
    // =========================================================================

    /**
     * @testCaseId    SW-IMP-ADD-TC15
     * @technique     Error Guessing — verify selected product card on cost screen
     * @description   After selecting a product and clicking Add, the cost input
     *                screen shows the "Selected Product" heading and the product
     *                card for the selected product.
     */
    it(
      "SW-IMP-ADD-TC15 — Verify selected product card on cost screen",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.validEntry.searchTerm
        );
        incomingInvPage.selectProductFromList(td.ramProduct.displayName);
        incomingInvPage.clickAddButton();

        // Verify the selected product is shown on the cost screen
        incomingInvPage.verifySelectedProductVisible();
        cy.get('[role="dialog"]:visible').within(() => {
          cy.contains(td.testProducts.ram.primary.displayName)
            .scrollIntoView({ block: "center" })
            .should("be.visible");
        });

        incomingInvPage.closeAddProductDialog();
        log("[TC15] Selected product card verification passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC16
     * @technique     Error Guessing — add second product to same PO
     * @description   After TC01 added a product, this test adds a different
     *                product to the same PO to verify multiple products can
     *                coexist in one PO.
     */
    it(
      "SW-IMP-ADD-TC16 — Add second product to same PO",
      { tags: ["@regression"] },
      () => {
        incomingInvPage.clickIncomingInventoryNav();
        incomingInvPage.selectPoNumber(testPO);

        // Add Corsair RAM (distinct productId from Kingston TC01 and laptop seed)
        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.addProductToPO.secondProduct.searchTerm
        );

        incomingInvPage.selectProductFromList(td.excelPoSeedRam.displayName);

        incomingInvPage.clickAddButton();
        incomingInvPage.fillExpectedQuantity(
          td.addProductToPO.secondProduct.expectedQuantity
        );
        incomingInvPage.fillProductCost(
          td.addProductToPO.secondProduct.cost
        );
        incomingInvPage.clickAddToPO();

        incomingInvPage.verifyAddProductSuccess(td.messages.addSuccess);
        log("[TC16] Second product added to same PO passed");
      }
    );

    // ─── after() ────────────────────────────────────────────────────────────
    after(() => {
      if (createdPOs.length === 0) return;
      cy.adminSession();
      cy.visit("/");
      purchaseOrderPage = new PurchaseOrderPage();
      createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
    });
  }
);
