// cypress/pageObjects/InventoryActions/AssignProductsPage.js
//
// Page object for the Assign Products mobile screen
// (route /MobileViewScreen/assign-products).
// Component: Frontend/src/components/AssignProducts/index.tsx.
//
// Two-step flow:
//   Step 1 (target):   scan/select container or location.
//   Step 2 (products): debounced server-side product search; each row has
//                      its own qty input + inline Assign button.

import L from '../../support/locators/InventoryActions/assignProductsLocators';

class AssignProductsPage {
  // ---- Navigation -------------------------------------------------------

  visit() {
    cy.visit('/MobileViewScreen/assign-products');
    cy.url().should('include', '/assign-products');
  }

  walkFromLanding() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.assignmentTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.assignProductsTile}$`)).click();
    cy.url().should('include', '/assign-products');
  }

  // ---- Step 1: target ---------------------------------------------------

  assertTargetStepVisible() {
    cy.contains(L.scanQrToggle, { timeout: 15000 }).should('be.visible');
    cy.get(`#${L.targetQrInputId}`).should('be.visible');
  }

  selectScanQrToggle() {
    cy.contains('button', new RegExp(`^${L.scanQrToggle}$`)).click();
  }

  selectSelectContainerToggle() {
    cy.contains('button', new RegExp(`^${L.selectContainerToggle}$`)).click();
  }

  selectSelectLocationToggle() {
    cy.contains('button', new RegExp(`^${L.selectLocationToggle}$`)).click();
  }

  scanTargetCode(code) {
    cy.get(`#${L.targetQrInputId}`).clear().type(`${code}{enter}`);
  }

  // ---- Step 2: products list -------------------------------------------

  assertProductsStepVisible() {
    cy.contains('label', L.searchProductLabel, { timeout: 15000 }).should('be.visible');
    cy.get(L.searchProductPlaceholder).should('be.visible');
  }

  // The products list is an async infinite-query (`enabled: step==='products'`)
  // that fires only AFTER the container is selected, so a `$body.find(Qty)`
  // check run immediately after assertProductsStepVisible() races the fetch and
  // reports zero rows even when the environment has assignable products. Wait
  // until the list settles into one of its two terminal states — at least one
  // Qty input (rows rendered) OR the "no products" empty-state copy — before
  // any probe-then-skip decision.
  waitForProductsSettled() {
    cy.get('body', { timeout: 20000 }).should(($b) => {
      const hasQty = $b.find(L.qtyInputByPlaceholder).length > 0;
      const hasEmpty = /No products with available quantity|No products found/i.test($b.text());
      expect(hasQty || hasEmpty, 'products list settled (rows or empty-state)').to.eq(true);
    });
  }

  /**
   * Type into the search box. Component debounces 500ms before firing
   * the API call — caller may need a `cy.wait(700)` afterwards if asserting
   * the filtered list.
   */
  typeProductSearch(query) {
    cy.get(L.searchProductPlaceholder).clear().type(query);
  }

  assertEmptySearchState(query) {
    cy.contains(`${L.noResultsTextPrefix} "${query}"`, { timeout: 10000 })
      .should('be.visible');
  }

  /**
   * Type a quantity into the inline Qty input on the first product row
   * matching the given attribute snippet, then click the row's Assign
   * button.
   */
  enterQtyAndAssignFirstRow(qty) {
    // The qty input is `Box component="input" placeholder="Qty"`.
    cy.get(L.qtyInputByPlaceholder).first().clear().type(String(qty));
    cy.get(L.qtyInputByPlaceholder)
      .first()
      .closest('li, div')
      .contains(new RegExp(`^${L.assignButtonInRowText}$`))
      .click();
  }

  // Read the first product row's displayed "Available" count and enter one
  // more than that, then click Assign — guaranteeing the component's
  // `val > available` guard fires regardless of the (large, data-dependent)
  // stock level. Returns nothing; assert the reject message afterwards.
  enterQtyExceedingAvailableAndAssign() {
    cy.get(L.qtyInputByPlaceholder)
      .first()
      .parents()
      .filter(':contains("Available")')
      .first()
      .then(($row) => {
        const m = $row.text().match(/Available\s*([\d,]+)/i);
        const available = m ? parseInt(m[1].replace(/,/g, ''), 10) : 1;
        const over = String(available + 1);
        cy.wrap($row).find(L.qtyInputByPlaceholder).first().clear().type(over);
        cy.wrap($row).contains(new RegExp(`^${L.assignButtonInRowText}$`)).click();
      });
  }

  goBack() {
    cy.contains('button', /^← Back$/).first().click();
  }
}

export default AssignProductsPage;
