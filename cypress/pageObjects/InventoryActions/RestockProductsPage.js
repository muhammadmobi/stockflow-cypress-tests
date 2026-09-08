// cypress/pageObjects/InventoryActions/RestockProductsPage.js
//
// Page object for the Restock Products mobile screen — product-quantity
// flow (route /MobileViewScreen/restock-products).
// Component: Frontend/src/components/RestockProducts/index.tsx.

import L from '../../support/locators/InventoryActions/restockProductsLocators';

class RestockProductsPage {
  visit() {
    cy.visit('/MobileViewScreen/restock-products');
    cy.url().should('include', '/restock-products');
  }

  searchProducts(text) {
    cy.get(`input[placeholder="${L.searchProductsPlaceholder}"]`)
      .first()
      .clear()
      .type(text);
  }

  selectFirstProduct() {
    // The product list (GET /products with available stock, 10 at a time +
    // per-category attribute fetches) can take longer than the default
    // command timeout to paint on QA; until then the screen shows a
    // <CircularProgress> and renders zero <li>. Wait for the initial spinner
    // to clear and for the list to actually have rows before clicking — this
    // is the real cause of the TC100 cascade (a slow/empty list left the
    // restock submit — and therefore the error toast — never reached). The
    // list renders as <ul class="MuiList-root"> with one
    // <li class="MuiListItem-root"> per product (RestockProducts/index.tsx).
    cy.get('[role="progressbar"]', { timeout: 30000 }).should('not.exist');
    cy.get('ul.MuiList-root li, [role="listitem"]', { timeout: 30000 })
      .should('have.length.greaterThan', 0)
      .first()
      .click({ force: true });
    cy.contains(L.restockProductHeading, { timeout: 15000 }).should('be.visible');
  }

  enterQuantity(qty) {
    cy.get(L.quantityInput).clear().type(String(qty));
  }

  clickRestock() {
    cy.contains('button', new RegExp(`^${L.restockButton}$`)).click();
  }

  /**
   * Wait for either a success toast OR an "enough stocked out" error toast,
   * then resolve to which arrived. Useful for tests that accept either
   * outcome based on QA seed data (TC99 — success requires stocked-out qty
   * which we can't reliably probe).
   *
   * The component sets the success message from the API response
   * (data?.data?.message || 'Restock Success'). The patterns below are
   * tight enough to NOT match the static page heading "Restock Product"
   * or the "Restock" submit button:
   *   - SUCCESS:   "restocked" (verb form, -ed) OR the literal "Restock Success"
   *                — neither appears in "Restock Product" / "Restock" button.
   *   - NO-STOCKED-OUT: the explicit error fragments only.
   *
   * The poll uses Cypress's retry semantics via `should` so we wait for a
   * definitive outcome (not a stale page that already contains "restock"
   * in the heading).
   *
   * Returns 'success' | 'no-stocked-out' | 'other-error'.
   */
  awaitRestockOutcome(timeout = 30000) {
    const SUCCESS_RE = /restocked|Restock\s+Success/;
    const NO_STOCK_RE = new RegExp(`${L.notEnoughStockedOutFragment}|cannot\\s+restock`, 'i');
    return cy
      .get('body', { timeout })
      .should(($body) => {
        const text = $body.text();
        const hit = SUCCESS_RE.test(text) || NO_STOCK_RE.test(text);
        expect(hit, 'restock success or no-stocked-out toast visible').to.be.true;
      })
      .then(($body) => {
        const text = $body.text();
        if (NO_STOCK_RE.test(text)) return 'no-stocked-out';
        if (SUCCESS_RE.test(text)) return 'success';
        return 'other-error';
      });
  }

  assertNotEnoughStockedOutError() {
    cy.contains(new RegExp(`(${L.notEnoughStockedOutFragment}|cannot\\s+restock)`, 'i'), { timeout: 12000 })
      .should('be.visible');
  }
}

export default RestockProductsPage;
