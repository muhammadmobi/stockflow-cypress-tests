/**
 * InventoryEditProductTests.cy.js
 * ============================================================
 * Spec: Inventory → Edit Product (product-only + product-items)
 * Test Plan: cypress/qa/testPlans/inventory/InventoryAddEditStockOutTP.md
 * Page Objects: InvViewPage.js, NewProductPage.js
 *
 * Implementation notes (mapped to actual FE behavior):
 *   - Inventory list row → 3-dot icon (id="long-button") → "Edit" MenuItem
 *     navigates to /inventory/edit-product/:id (ItemForm with edit=true).
 *   - Edit form id is `item-form`. Submit button text is "Update".
 *   - Success: toast "Product Updated." (or "Item Updated." for items), then
 *     navigate back to /inventory.
 *   - Attribute inputs use name={fieldName} from testDataAttributes.json
 *     (e.g. memoryGeneration, modelNumber, assetTagId).
 *   - Item edit: from product detail items table, each row has its own
 *     3-dot menu (aria-label="more") → Edit MenuItem → navigates to
 *     EDIT_ITEM_ROUTE. The serial number is rendered as a Typography
 *     (display-only), not an input — so TC18 asserts no editable input.
 *
 */

import 'cypress-file-upload';
import InvViewPage    from '../../pageObjects/InvViewPage';
import NewProductPage from '../../pageObjects/NewProductPage';
import td             from '../../fixtures/exportTestData.json';
import urls           from '../../fixtures/urls.json';
import {
  seedProductOnlyPO,
  seedProductItemPO,
  apiScanSerial,
  apiCheckInProductOnly,
  deletePO,
  waitForInventorySearchable,
} from '../../support/helpers/exportSeedingHelpers';
import { ensureStandardProductNameConfigs, ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import { apiSetGeneralConfigFlags } from '../../support/helpers/generalConfigApiHelpers';

const baseStamp    = `EP-${Date.now()}`;
const ramStamp     = `${baseStamp}-r`;
const laptopStamp  = `${baseStamp}-l`;

const ramPo    = `PO-EP-RAM-${baseStamp}`;
const laptopPo = `PO-EP-LPT-${baseStamp}`;
const editSerial = `SN-EP-${baseStamp}`;

// Each row is uniquely identifiable by its per-suite stamp. The inventory
// search is a substring match against the product's attribute values, so the
// stamp alone reliably finds the row whether or not its Model Number /
// Memory Generation has been mutated by a previous test in the suite. This
// makes the tests retry-safe (no test mutates a shared search term).
const ramSearchTerm    = ramStamp;
const laptopSearchTerm = laptopStamp;

// Original/expected attribute values (used to derive the post-edit value).
const ramOriginalMemGen   = `${td.products.ram.memoryGeneration}-${ramStamp}`;
const laptopOriginalModel = `${td.products.laptop.modelNumber}-${laptopStamp}`;
const ramEditedMemGen     = `${ramOriginalMemGen}-EDIT`;
const laptopEditedModel   = `${laptopOriginalModel}-EDIT`;

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('Inventory Edit Product', { tags: ['@regression'] }, () => {
  const invPage     = new InvViewPage();
  const productPage = new NewProductPage();

  before(() => {
    cy.authSession('admin');
    cy.visit(urls.dashboard);
    // allowEditing must be true for the Edit menu item to render in ProductListActionMenu.tsx.
    apiSetGeneralConfigFlags({ allowEditing: true, allowManualEntries: true });
    // Attributes/categories are pre-seeded on stage (the API-only Inventory
    // specs rely on this too). Skip the heavy, flaky UI attribute re-import and
    // configure only the product-name templates we need, via API.
    ensureStandardProductNameConfigs();
    // Make other required attributes optional (incl. otherInfo.controlRules.required,
    // which the edit form honours) so a product edit isn't silently blocked by a
    // required attribute the seeded product/edit doesn't populate. Keep the
    // identifying attrs (memoryGeneration/modelNumber) required — EP-TC14's
    // negative "clear Memory Generation → form blocked" depends on it.
    ensureCommonAttributesOptional({
      clearControlRules: true,
      keepRequired: ['memoryGeneration', 'modelNumber'],
    });

    // Seed RAM product (qty=5, checked in → available=5)
    seedProductOnlyPO({ td, poNumber: ramPo, stamp: ramStamp, quantity: 5 }).then((id) => {
      apiCheckInProductOnly({ poNumber: ramPo, productId: id, quantity: 5 });
    });

    // Seed Laptop product with one serial → scan to Available so it shows in inventory items
    seedProductItemPO({ td, poNumber: laptopPo, stamp: laptopStamp, serials: [editSerial] }).then(() => {
      apiScanSerial(laptopPo, editSerial);
    });

    // Ensure both seeded products are actually searchable before the tests run —
    // freshly-created products lag the inventory search index on shared QA.
    waitForInventorySearchable(ramSearchTerm);
    waitForInventorySearchable(laptopSearchTerm);
  });

  after(() => {
    cy.then(() => {
      deletePO(ramPo);
      deletePO(laptopPo);
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit(urls.inventory);
    // Wait for the inventory list to have rendered at least one row.
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // Area 3 — Edit Product — Product-Only (RAM)
  // ==========================================================================
  describe('Area 3 — Edit Product — Product-Only (RAM)', () => {

    // Select the RAM category so its attribute columns (Memory Generation) are
    // visible — on the unfiltered "All" view the row shows only the (null on QA)
    // product name, so a row can't be located by its Memory Generation value.
    beforeEach(() => {
      invPage.selectCategory(td.categories.ram);
    });

    // Use Case — happy path
    it('SW-INV-EP-TC13 — Edit RAM product: valid field change → product updated', { tags: ['@smoke'] }, () => {
      invPage.searchInventory(ramSearchTerm);
      invPage.openEditForSearchedRow(ramSearchTerm);

      productPage.enterAttributeByLabel('Memory Generation', ramEditedMemGen);
      productPage.clickUpdateBtn();
      productPage.verifyUpdateToast();

      // After successful update we navigate back to /inventory
      cy.url({ timeout: 10000 }).should('match', /\/inventory($|\?|\/)/).and('not.include', '/edit-product');

      // Load /inventory fresh — the SPA transition from Update leaves the list
      // search unmounted so the Search click does not filter; a clean visit fixes it.
      cy.visit('/inventory');
      // cy.visit resets the category filter to "All"; re-select RAM so the
      // Memory Generation column (holding the edited value) is visible.
      invPage.selectCategory(td.categories.ram);
      invPage.searchInventory(ramEditedMemGen);
      cy.get('tbody', { timeout: 10000 }).should('contain.text', ramEditedMemGen);
    });

    // EP — valid (partial edit: change a single non-required text attribute)
    // NOTE: ItemForm.tsx hides `cost` and `price` fields on product-only edits
    // (the `item.fieldName === 'cost' && !isItem return` guard at line ~1169).
    // RAMbrand is a List (react-select) attribute, so it's not a plain input.
    // We pick supportContact (Email Text) which renders as a normal <input>.
    // Runs BEFORE TC14 (clear memGen) so the destructive clear can't strip the
    // search anchor this test relies on.
    it('SW-INV-EP-TC15 — RAM: partial edit (Support Contact only) → success', { tags: ['@regression'] }, () => {
      // TC13 mutated this product's Memory Generation to `ramEditedMemGen`, and
      // stage's inventory search does not match the bare stamp as a mid-substring
      // after that append — so search by the product's current value.
      invPage.searchInventory(ramEditedMemGen);
      invPage.openEditForSearchedRow(ramEditedMemGen);

      productPage.enterAttributeByLabel('supportContact', `partial-${baseStamp}@test.com`);
      productPage.clickUpdateBtn();
      productPage.verifyUpdateToast();
      cy.url({ timeout: 10000 }).should('not.include', '/edit-product');
    });

    // EP — invalid (clear Memory Generation → FE form validation blocks submit).
    // Runs LAST in this block: clearing memGen is destructive to the shared RAM
    // product's search anchor, so no later test may depend on it.
    it('SW-INV-EP-TC14 — RAM: clear Memory Generation → form blocked', { tags: ['@regression'] }, () => {
      invPage.searchInventory(ramEditedMemGen);
      invPage.openEditForSearchedRow(ramEditedMemGen);

      productPage.clearAttributeByLabel('Memory Generation');
      productPage.clickUpdateBtn();

      // Form must not submit — URL stays on edit page
      cy.url().should('include', '/edit-product');
    });
  });

  // ==========================================================================
  // Area 4 — Edit Product — Product-Items (Laptop)
  // ==========================================================================
  describe('Area 4 — Edit Product — Product-Items (Laptop)', () => {

    // Select the Laptop category so Model Number column is visible for row-finding.
    beforeEach(() => {
      invPage.selectCategory(td.categories.laptop);
    });

    // Use Case — happy path
    it('SW-INV-EP-TC16 — Edit Laptop product: valid field change → product updated', { tags: ['@smoke'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.openEditForSearchedRow(laptopSearchTerm);

      productPage.enterAttributeByLabel('Model Number', laptopEditedModel);
      productPage.clickUpdateBtn();
      productPage.verifyUpdateToast();
      cy.url({ timeout: 10000 }).should('not.include', '/edit-product');

      // Load /inventory fresh — the SPA transition from Update leaves the list
      // search unmounted so the Search click does not filter; a clean visit fixes it.
      cy.visit('/inventory');
      // Re-select Laptop after the fresh visit so Model Number column is shown.
      invPage.selectCategory(td.categories.laptop);
      invPage.searchInventory(laptopEditedModel);
      cy.get('tbody', { timeout: 10000 }).should('contain.text', laptopEditedModel);
    });

    // Use Case — item attribute edit (Asset Tag ID)
    // Item edits (unlike PRODUCT edits, TC16) surface NO success toast and do
    // NOT auto-navigate back — so this asserts the *persisted result* rather
    // than UI feedback: the PATCH /products/item/:serial succeeds, and the new
    // Asset Tag ID is reflected back on the items list. This validates the real
    // outcome of the edit without depending on the absent toast/navigation.
    it('SW-INV-EP-TC17 — Edit item attribute (Asset Tag ID) → item attribute updated', { tags: ['@regression'] }, () => {
      const newTagId = `TAG-EP-${baseStamp}`;

      invPage.searchInventory(laptopSearchTerm);
      invPage.openItemList(laptopSearchTerm);

      // Open item edit via 3-dot menu on the item row
      invPage.openEditForItemRow(editSerial);

      cy.intercept('PATCH', '**/products/item/**').as('patchItem');
      productPage.enterAttributeByLabel('Asset Tag ID', newTagId);
      productPage.clickUpdateBtn();
      // The PATCH must land successfully (envelope success or 2xx).
      cy.wait('@patchItem', { timeout: 15000 }).then(({ response }) => {
        expect(response.statusCode, 'PATCH item status').to.be.lessThan(400);
      });

      // Reload the items list and confirm the new tag is persisted for the serial.
      cy.visit('/inventory');
      invPage.selectCategory(td.categories.laptop);
      invPage.searchInventory(laptopSearchTerm);
      invPage.openItemList(laptopSearchTerm);
      cy.contains('td', editSerial, { timeout: 10000 })
        .closest('tr')
        .should('contain.text', newTagId);
    });

    // Error Guessing — serial number is display-only (Typography) in edit-item form
    it('SW-INV-EP-TC18 — Error Guessing: serial number not editable in item edit form', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.openItemList(laptopSearchTerm);
      invPage.openEditForItemRow(editSerial);

      // ItemForm renders serial in edit mode as Typography (display block), NOT input
      cy.get('input[name="serialNumber"]').should('not.exist');
      // The serial value is still visible on the form as plain text
      cy.contains(editSerial, { timeout: 10000 }).should('be.visible');
    });
  });
});
