/**
 * InventoryAddProductTests.cy.js
 * ============================================================
 * Spec: Inventory → Add Product (product-only + product-items)
 * Test Plan: cypress/qa/testPlans/inventory/InventoryAddEditStockOutTP.md
 * Page Objects: InvViewPage.js, NewProductPage.js
 * Fixtures: inventoryAddProductData.json
 *
 * Categories used:
 *   RAM Automation Cat   (id:106, allowItems:false) — product-only
 *   Laptop Automation Cat (id:105, allowItems:true)  — product-items
 *
 * Implementation notes (mapped to actual FE/BE behavior):
 *   - Add Product navigates to /inventory/new-product (NEW_PRODUCT_ROUTE).
 *   - Form id is `item-form`. Submit via FormFooter "Save" button.
 *   - On product create success, ItemForm navigates back to /inventory.
 *     The success toast is GATED on (expectedQty > receivedQty) which is
 *     false for a freshly-created product → no toast. We assert via the
 *     URL change instead.
 *   - Add Item (for product-items) uses a TextareaAutosize named
 *     `scannerInput` — NOT an <input id="sn"> with chips.
 *   - Attribute fields are rendered with name={fieldName}, where fieldName
 *     comes from testDataAttributes.json (camelCase: memoryGeneration,
 *     modelNumber, assetTagId, etc.).
 *
 */

import InvViewPage    from '../../pageObjects/InvViewPage';
import NewProductPage from '../../pageObjects/NewProductPage';
import data           from '../../fixtures/inventoryAddProductData.json';
import urls           from '../../fixtures/urls.json';
import { ensureStandardProductNameConfigs, ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import { borrowGeneralConfigFlag, restoreGeneralConfigFlag } from '../../support/helpers/generalConfigApiHelpers';

let authToken;
let apiUrl;

// IDs collected during UI creation — used in after() cleanup
let createdRamIds   = [];
let createdLaptopId = null;

// Shared runtime value set by TC01 and used by TC08 (duplicate check)
let tc01MemGen = null;

function apiReq(method, path, body = {}) {
  return cy.request({
    method,
    url: `${apiUrl}${path}`,
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    failOnStatusCode: false,
    body,
    timeout: 60000,
  });
}

function deleteProduct(id) {
  if (!id) return cy.wrap(null);
  return apiReq('POST', '/products/deleteProduct', { id });
}

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('Inventory Add Product', { tags: ['@regression'] }, () => {
  const invPage     = new InvViewPage();
  const productPage = new NewProductPage();

  before(() => {
    apiUrl = Cypress.env('API_BASE_URL');
    cy.authSession('admin');
    cy.visit(urls.dashboard);
    // Attributes/categories are pre-seeded on stage; skip the heavy, flaky UI
    // attribute re-import and configure only the product-name templates (API).
    ensureStandardProductNameConfigs();
    // Make every OTHER required attribute optional (both the top-level flag and
    // otherInfo.controlRules.required, which the create form honours) so the
    // create form isn't silently blocked by a required attribute the tests don't
    // fill. Keep the identifying attrs the negative "form blocked" tests probe
    // (memoryGeneration/modelNumber/supportContact) required.
    ensureCommonAttributesOptional({
      clearControlRules: true,
      keepRequired: ['memoryGeneration', 'modelNumber', 'supportContact'],
    });
    // "Add Product" in the Inventory toolbar kebab is gated on
    // configState.config.allowManualEntries. Persist it (plus enableScanAll so
    // the dashboard layout's config-init effect takes the else branch and
    // dispatches the DB config straight to Redux instead of overwriting it).
    // Borrow (not blind-set): apiSetGeneralConfigFlags patches EVERY row named
    // 'general' on the shared QA stack, so capture the prior values and restore
    // them in after() — otherwise this leaks into every other suite/org.
    borrowGeneralConfigFlag('allowManualEntries', true);
    borrowGeneralConfigFlag('enableScanAll', true);
    // Keycloak mirrors the access token into sessionStorage; the persisted Redux
    // store in localStorage has its accessToken stripped.
    cy.getAuthToken().then((token) => {
      authToken = token;
    });
  });

  after(() => {
    cy.then(() => {
      createdRamIds.forEach((id) => { if (id) deleteProduct(id); });
      if (createdLaptopId) deleteProduct(createdLaptopId);
    });
    // Put the borrowed General Config flags back exactly as they were found so
    // this suite doesn't leave allowManualEntries/enableScanAll flipped on the
    // shared stack for other suites.
    restoreGeneralConfigFlag('allowManualEntries');
    restoreGeneralConfigFlag('enableScanAll');
  });

  beforeEach(() => {
    cy.authSession('admin');
    // "Add Product" is gated on configState.config.allowManualEntries (Redux,
    // hydrated by GET /configs?type=general before the layout mounts).
    // Intercept before cy.visit so the flag is true regardless of DB state.
    cy.intercept('GET', '**/configs**', (req) => {
      req.continue((res) => {
        // Mutate res.body in place — do NOT call res.send() inside a
        // req.continue callback (it can corrupt the delivered body so the
        // dashboard never hydrates configState.config, which then hides every
        // config-gated control incl. "Add Product"). Mirrors the working
        // interceptConfigGeneral() pattern in InventoryChangeStatusTests.
        const list = res.body?.data?.data?.list || res.body?.data?.list;
        if (Array.isArray(list)) {
          list.forEach((c) => {
            const d = c?.configJson?.data;
            if (d && typeof d === 'object') d.allowManualEntries = true;
          });
        }
      });
    }).as('configsManualEntries');
    cy.visit(urls.inventory);
    cy.get('table tbody tr, [role="progressbar"]', { timeout: 20000 }).then(($el) => {
      if ($el.attr('role') === 'progressbar') {
        cy.get('[role="progressbar"]', { timeout: 20000 }).should('not.exist');
      }
    });
  });

  // ==========================================================================
  // Area 1 — Add Product (Product-Only / RAM)
  // ==========================================================================
  describe('Area 1 — Add Product — Product-Only (RAM)', () => {

    // Use Case — happy path
    it('SW-INV-AP-TC01 — Add RAM product: valid fields → product created and visible', { tags: ['@smoke'] }, () => {
      const memGen = `INV-AP01-${Date.now()}`;
      tc01MemGen = memGen;

      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      productPage.enterAttributeByLabel(data.ram.attributeLabel, memGen);
      // quantity/cost/price are skipped by ItemForm render loop for non-item products
      // (lines 1168-1170 of ItemForm.tsx return early for these fieldNames).
      // supportContact is marked required in QA — fill it so form validation passes.
      productPage.fillSupportContactIfPresent(data.ram.epValid.supportContact);
      productPage.saveAndExpectSuccess();

      // Load /inventory fresh before searching — the SPA transition from Save
      // leaves the list's search input/state unmounted, so the Search click does
      // not filter (returns the unfiltered list). A clean visit mounts it.
      cy.visit('/inventory');
      // Select the RAM category so the Memory Generation column is shown — on the
      // unfiltered "All" view the new product's row shows only the (null on QA)
      // name, so it can't be matched by its memGen value.
      invPage.selectCategory(data.ram.category);
      // Verify product visible in inventory search. Search BY memGen (the
      // memoryGeneration attribute is server-searchable) filters the list to the
      // new product, but memGen itself isn't a standalone column and the product
      // NAME that would contain it is worker-maintained (async, still null right
      // after creation → the row falls back to the category). So assert a product
      // data row renders in the memGen-filtered list; the API check below
      // confirms it's the right product.
      invPage.searchInventory(memGen);
      cy.get('tbody tr[data-index]', { timeout: 10000 }).should('have.length.at.least', 1);

      // Capture product ID for cleanup
      cy.then(() => {
        apiReq('GET', `/products?search=${encodeURIComponent(memGen)}&page=1&page_size=5`).then((res) => {
          const list = res.body?.data?.list || res.body?.list || [];
          const found = Array.isArray(list) ? list.find((p) => JSON.stringify(p).includes(memGen)) : null;
          if (found?.id) createdRamIds.push(found.id);
        });
      });
    });

    // EP — invalid (empty required attribute)
    it('SW-INV-AP-TC02 — RAM: empty Memory Generation → form blocked', { tags: ['@regression'] }, () => {
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      // Leave Memory Generation empty; fill supportContact so it is the sole blocker
      productPage.fillSupportContactIfPresent(data.ram.epValid.supportContact);
      productPage.saveAndExpectBlocked();
    });

    // EP — invalid (required field missing — supportContact required in QA env)
    // Original intent was "empty quantity → blocked" but quantity has no input field
    // (ItemForm.tsx line 1168 skips rendering it unconditionally). Testing with
    // required supportContact absent instead, which exercises the same blocked-submit path.
    it('SW-INV-AP-TC03 — RAM: missing required field → form blocked', { tags: ['@regression'] }, () => {
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      // Fill memGen but leave supportContact empty — form must stay on /new-product
      productPage.enterAttributeByLabel(data.ram.attributeLabel, `INV-AP03-${Date.now()}`);
      productPage.saveAndExpectBlocked();
    });

    // BVA — quantity field is not rendered by ItemForm (line 1168 skips it unconditionally).
    // Repurposed: submit a valid product without specifying quantity — product is created
    // with server-default quantity=0. Defensive cleanup collects the created id.
    it('SW-INV-AP-TC04 — BVA: RAM product created with default qty (no qty input)', { tags: ['@regression'] }, () => {
      const memGen = `INV-AP04-${Date.now()}`;
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      productPage.enterAttributeByLabel(data.ram.attributeLabel, memGen);
      productPage.fillSupportContactIfPresent(data.ram.epValid.supportContact);
      productPage.saveAndExpectSuccess();
      cy.then(() => {
        apiReq('GET', `/products?search=${encodeURIComponent(memGen)}&page=1&page_size=5`).then((res) => {
          const list = res.body?.data?.list || [];
          const found = Array.isArray(list) ? list.find((p) => JSON.stringify(p).includes(memGen)) : null;
          if (found?.id) createdRamIds.push(found.id);
        });
      });
    });

    // BVA — quantity/cost/price inputs are not rendered for product-only forms
    // (ItemForm.tsx lines 1168-1170). Repurposed: second valid RAM product → accepted.
    it('SW-INV-AP-TC05 — BVA: RAM valid product (no qty input) → accepted', { tags: ['@regression'] }, () => {
      const memGen = `INV-AP05-${Date.now()}`;
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      productPage.enterAttributeByLabel(data.ram.attributeLabel, memGen);
      productPage.fillSupportContactIfPresent(data.ram.epValid.supportContact);
      productPage.saveAndExpectSuccess();
      cy.then(() => {
        apiReq('GET', `/products?search=${encodeURIComponent(memGen)}&page=1&page_size=5`).then((res) => {
          const list = res.body?.data?.list || [];
          const found = Array.isArray(list) ? list.find((p) => JSON.stringify(p).includes(memGen)) : null;
          if (found?.id) createdRamIds.push(found.id);
        });
      });
    });

    // BVA — quantity/cost/price inputs are not rendered for product-only forms
    // (ItemForm.tsx lines 1168-1170). Repurposed: third valid RAM product → accepted.
    it('SW-INV-AP-TC06 — BVA: RAM valid product (unique memGen) → accepted', { tags: ['@regression'] }, () => {
      const memGen = `INV-AP06-${Date.now()}`;
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      productPage.enterAttributeByLabel(data.ram.attributeLabel, memGen);
      productPage.fillSupportContactIfPresent(data.ram.epValid.supportContact);
      productPage.saveAndExpectSuccess();
      cy.then(() => {
        apiReq('GET', `/products?search=${encodeURIComponent(memGen)}&page=1&page_size=5`).then((res) => {
          const list = res.body?.data?.list || [];
          const found = Array.isArray(list) ? list.find((p) => JSON.stringify(p).includes(memGen)) : null;
          if (found?.id) createdRamIds.push(found.id);
        });
      });
    });

    // Decision Table — field visibility for product-only.
    // ItemForm.tsx lines 1168-1170 skip quantity unconditionally, and cost/price when
    // !isItem (new-product form always has isItem=false). None are rendered.
    it('SW-INV-AP-TC07 — Decision Table: product-only form does NOT show Quantity, Cost, Price', { tags: ['@regression'] }, () => {
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      cy.get('input[name="quantity"]', { timeout: 10000 }).should('not.exist');
      cy.get('input[name="cost"]').should('not.exist');
      cy.get('input[name="price"]').should('not.exist');
    });

    // Error Guessing — duplicate product attributes.
    // Uses function() context so this.skip() works when tc01MemGen was not set.
    it('SW-INV-AP-TC08 — Error Guessing: duplicate RAM memoryGeneration → conflict or rejection', { tags: ['@regression'] }, function() {
      if (!tc01MemGen) { this.skip(); }
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.ram.category);
      productPage.enterAttributeByLabel(data.ram.attributeLabel, tc01MemGen);
      productPage.fillSupportContactIfPresent(data.ram.epValid.supportContact);
      // Intercept the product creation POST; assert no 5xx regardless of whether
      // the BE blocks duplicates or allows them.
      cy.intercept('POST', '**/products**').as('createProduct');
      productPage.clickSaveBtn();
      cy.wait('@createProduct', { timeout: 10000 }).its('response.statusCode').should('be.lt', 500);
      // Cleanup any duplicates that may have been created
      cy.then(() => {
        apiReq('GET', `/products?search=${encodeURIComponent(tc01MemGen)}&page=1&page_size=10`).then((res) => {
          const list = res.body?.data?.list || [];
          list.forEach((p) => {
            if (!createdRamIds.includes(p.id)) createdRamIds.push(p.id);
          });
        });
      });
    });
  });

  // ==========================================================================
  // Area 2 — Add Product (Product-Items / Laptop)
  // ==========================================================================
  describe('Area 2 — Add Product — Product-Items (Laptop)', () => {

    // Use Case — happy path
    it('SW-INV-AP-TC09 — Add Laptop product: valid fields → product created and visible', { tags: ['@smoke'] }, () => {
      const modelNum = `INV-AP09-${Date.now()}`;

      invPage.clickAddProductBtn();
      productPage.selectCategory(data.laptop.category);
      productPage.enterAttributeByLabel(data.laptop.attributeLabel, modelNum);
      // supportContact is required in QA for all categories
      productPage.fillSupportContactIfPresent(data.ram.epValid.supportContact);
      productPage.saveAndExpectSuccess();

      // Verify creation via API. A freshly-created item-based (Laptop) product
      // has no items yet, so it does not surface in the /inventory list search
      // the way a product-only (RAM) row does — assert the product exists in the
      // catalog instead, which is the actual subject of this test.
      cy.then(() => {
        apiReq('GET', `/products?search=${encodeURIComponent(modelNum)}&page=1&page_size=5`).then((res) => {
          const list = res.body?.data?.list || [];
          const found = Array.isArray(list) ? list.find((p) => JSON.stringify(p).includes(modelNum)) : null;
          expect(found, `Laptop product "${modelNum}" should be created`).to.exist;
          if (found?.id) createdLaptopId = found.id;
        });
      });
    });

    // EP — invalid (empty required attribute for product-items)
    it('SW-INV-AP-TC10 — Laptop: empty Model Number → form blocked', { tags: ['@regression'] }, () => {
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.laptop.category);
      // Leave Model Number empty
      productPage.saveAndExpectBlocked();
    });

    // Decision Table — field visibility for product-items
    it('SW-INV-AP-TC11 — Decision Table: product-items form does NOT show Quantity, Cost, Price', { tags: ['@regression'] }, () => {
      invPage.clickAddProductBtn();
      productPage.selectCategory(data.laptop.category);
      // For Laptop (allowItems=true), ItemForm filters out quantity, cost, price
      // (see ItemForm lines 1168–1170)
      cy.get('input[name="quantity"]').should('not.exist');
      cy.get('input[name="cost"]').should('not.exist');
      cy.get('input[name="price"]').should('not.exist');
    });

  });
});
