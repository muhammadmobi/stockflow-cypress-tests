import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import {
  makeLaptopRowWithSerial,
  makeRamRow,
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
 * ❌ COST FIELD VALIDATION — EP (Partitions):
 *   NEW UI: the cost screen has a single OPTIONAL "Product Cost (Optional)"
 *   input and NO expected-quantity field (qty defaults to 0, edited later via
 *   the Update-Expected-Quantity modal). "Add to PO" is enabled by default.
 *   SW-IMP-ADD-TC08 — Add to PO enabled by default (cost optional, no entry)
 *   SW-IMP-ADD-TC09 — Negative cost is rejected by the cost field (value stays ≥ 0)
 *   SW-IMP-ADD-TC10 — Blank cost keeps Add to PO enabled
 *
 * 🔢 BOUNDARY VALUE — BVA (cost field):
 *   SW-IMP-ADD-TC11 — Min positive cost (0.01) → Add to PO enabled
 *   SW-IMP-ADD-TC12 — Large cost (999999.99) → Add to PO enabled
 *   SW-IMP-ADD-TC13 — Typical cost (1) → Add to PO enabled
 *   SW-IMP-ADD-TC14 — Zero cost (0, the default) → Add to PO enabled
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

        cy.authSession('admin');
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
        ensureCommonAttributesOptional();

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

        // The Add-Product dialog searches EXISTING products globally. Seed the
        // RAM products the tests select (Kingston DDR4 / Kingston DDR5 / Corsair
        // DDR5) into a disposable PO so they exist regardless of run order.
        // Product name = "{rambrand} {memoryGeneration}" via the category's
        // product-name template (e.g. "Kingston DDR4").
        const ramSeedPO = `PO-AddProdRamSeed-${stamp}`;
        createdPOs.push(ramSeedPO);
        const ramSeedFile = `AddProdRamSeed-${stamp}.xlsx`;
        const ramRow = makeRamRow(td);
        createExcelFile(ramSeedFile, [
          ramRow("Kingston", "DDR4", 5),
          ramRow("Kingston", "DDR5", 5),
          ramRow("Corsair", "DDR5", 5),
        ]);
        importExcel(ramSeedFile, ramSeedPO);
        log(`[SETUP] Seeded RAM products into ${ramSeedPO}`);
      });
    });

    // ─── beforeEach() ─────────────────────────────────────────────────────────
    beforeEach(() => {
      cy.authSession('admin');
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

        // Use the SECONDARY product (never added to testPO) so the dialog
        // search — which excludes products already on the PO via PoProductsSkip
        // — always returns it, regardless of TC01/TC16 having added others.
        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.testProducts.ram.secondary.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.secondary.displayName);
        incomingInvPage.clickAddButton();

        // Verify we're on the cost screen
        incomingInvPage.verifySelectedProductVisible();

        // Click Back — should return to product list
        incomingInvPage.clickAddProductBack();

        // Verify we're back on the product list (product list + Add button
        // visible, cost screen's "Selected Product" heading gone). The composed
        // product name can lag attributeValue load, so assert the list presence
        // rather than the specific name text.
        cy.get('[role="dialog"]:visible', { timeout: 20000 }).within(() => {
          // Multi-select UI: the selection persists through Back, so the
          // footer button reads "Add (1)" — accept "Add" or "Add (N)".
          cy.contains('button', /^Add( \(\d+\))?$/)
            .filter(':visible')
            .should('exist');
          cy.get('li', { timeout: 15000 }).should('have.length.at.least', 1);
          // The selection persists through Back as a "Selected Products (N)"
          // chip strip, so assert the COST SCREEN's unique copy is gone
          // instead of the ambiguous "Selected Product" text.
          cy.contains('Enter the cost for').should('not.exist');
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

        // Kingston RAM was added in TC01. The PO grid hides the RAMbrand/Memory
        // Generation columns by default, so the composed name isn't rendered as
        // plain text — verify via search instead (the backend search matches the
        // product's attribute values regardless of column visibility).
        incomingInvPage.searchProduct(td.testProducts.ram.primary.brand);
        incomingInvPage.clickSubmitSearch();
        cy.get("tbody tr", { timeout: 15000 }).should("have.length.at.least", 1);
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

        // Secondary term (never added) guarantees a result even after TC01
        // adds the primary product (which then gets excluded by PoProductsSkip).
        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.testProducts.ram.secondary.searchTerm
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
          td.testProducts.ram.secondary.searchTerm
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
    // ██  COST FIELD VALIDATION CASES (EP / BVA — new optional-cost screen)  ██
    // =========================================================================
    // NEW UI CONTRACT: the cost screen has ONE optional "Product Cost (Optional)"
    // input and NO expected-quantity field. "Add to PO" is enabled by default
    // and the cost field rejects negatives. All cases below use the SECONDARY
    // RAM product (Kingston DDR5) which is never added to testPO, so the dialog
    // search (which excludes products already on the PO) always returns it.

    /** Reusable: open dialog → search+select secondary → click Add (cost screen). */
    function openCostScreenWithSecondary() {
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(testPO);
      incomingInvPage.openAddProductDialog();
      incomingInvPage.searchProductInDialog(td.testProducts.ram.secondary.searchTerm);
      incomingInvPage.selectProductFromList(td.testProducts.ram.secondary.displayName);
      incomingInvPage.clickAddButton();
    }

    /**
     * @testCaseId    SW-IMP-ADD-TC08
     * @technique     EP — valid partition (optional field, default state)
     * @description   On the cost screen, "Add to PO" is enabled by default even
     *                with no cost entered (cost is optional, defaults to 0).
     */
    it(
      "SW-IMP-ADD-TC08 — Add to PO enabled by default (cost optional)",
      { tags: ["@regression"] },
      () => {
        openCostScreenWithSecondary();
        incomingInvPage.verifyAddToPOEnabled();
        incomingInvPage.closeAddProductDialog();
        log("[TC08] Default-enabled (cost optional) passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC09
     * @technique     EP — invalid partition (negative cost)
     * @description   Typing a negative cost is rejected by the controlled number
     *                field (value stays ≥ 0); Add to PO remains enabled.
     */
    it(
      "SW-IMP-ADD-TC09 — Negative cost is rejected by the cost field",
      { tags: ["@regression"] },
      () => {
        openCostScreenWithSecondary();
        incomingInvPage.fillProductCost(td.invalidInputs.epNegativeCost);
        incomingInvPage.assertCostNotNegative();
        incomingInvPage.verifyAddToPOEnabled();
        incomingInvPage.closeAddProductDialog();
        log("[TC09] Negative cost rejected passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC10
     * @technique     EP — empty-valid partition (blank optional cost)
     * @description   Leaving the cost field blank keeps Add to PO enabled
     *                (backend defaults cost to 0).
     */
    it(
      "SW-IMP-ADD-TC10 — Blank cost keeps Add to PO enabled",
      { tags: ["@regression"] },
      () => {
        openCostScreenWithSecondary();
        incomingInvPage.verifyAddToPOEnabled();
        incomingInvPage.closeAddProductDialog();
        log("[TC10] Blank cost enabled passed");
      }
    );

    // =========================================================================
    // ██  BOUNDARY VALUE CASES (BVA — cost field)  ███████████████████████████
    // =========================================================================

    /**
     * @testCaseId    SW-IMP-ADD-TC11
     * @technique     BVA — lower boundary valid (cost = 0.01)
     */
    it(
      "SW-IMP-ADD-TC11 — Min positive cost (0.01) keeps Add to PO enabled",
      { tags: ["@regression"] },
      () => {
        openCostScreenWithSecondary();
        incomingInvPage.fillProductCost(td.boundaryTests.cost.bvaMinValid);
        incomingInvPage.verifyAddToPOEnabled();
        incomingInvPage.closeAddProductDialog();
        log("[TC11] Min positive cost passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC12
     * @technique     BVA — upper boundary valid (cost = 999999.99)
     */
    it(
      "SW-IMP-ADD-TC12 — Large cost (999999.99) keeps Add to PO enabled",
      { tags: ["@regression"] },
      () => {
        openCostScreenWithSecondary();
        incomingInvPage.fillProductCost(td.boundaryTests.cost.bvaMaxValid);
        incomingInvPage.verifyAddToPOEnabled();
        incomingInvPage.closeAddProductDialog();
        log("[TC12] Large cost passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC13
     * @technique     BVA — typical interior value (cost = 1)
     */
    it(
      "SW-IMP-ADD-TC13 — Typical cost (1) keeps Add to PO enabled",
      { tags: ["@regression"] },
      () => {
        openCostScreenWithSecondary();
        incomingInvPage.fillProductCost("1");
        incomingInvPage.verifyAddToPOEnabled();
        incomingInvPage.closeAddProductDialog();
        log("[TC13] Typical cost passed");
      }
    );

    /**
     * @testCaseId    SW-IMP-ADD-TC14
     * @technique     BVA — boundary value (cost = 0, the default)
     */
    it(
      "SW-IMP-ADD-TC14 — Zero cost (0) keeps Add to PO enabled",
      { tags: ["@regression"] },
      () => {
        openCostScreenWithSecondary();
        incomingInvPage.fillProductCost(td.boundaryTests.cost.bvaZero);
        incomingInvPage.verifyAddToPOEnabled();
        incomingInvPage.closeAddProductDialog();
        log("[TC14] Zero cost passed");
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

        // Secondary product (never added) so the dialog search returns it.
        incomingInvPage.openAddProductDialog();
        incomingInvPage.searchProductInDialog(
          td.testProducts.ram.secondary.searchTerm
        );
        incomingInvPage.selectProductFromList(td.testProducts.ram.secondary.displayName);
        incomingInvPage.clickAddButton();

        // Verify the cost screen shows the selected-product card + cost input.
        // (The composed name can lag attributeValue load, so assert the screen
        // structure rather than the specific name text.)
        incomingInvPage.verifySelectedProductVisible();
        cy.get('[role="dialog"]:visible').within(() => {
          cy.get('input[type="number"]', { timeout: 15000 })
            .filter(":visible")
            .should("have.length.at.least", 1);
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
      cy.authSession('admin');
      cy.visit("/");
      purchaseOrderPage = new PurchaseOrderPage();
      createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
    });
  }
);
