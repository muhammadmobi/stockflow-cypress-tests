// cypress/pageObjects/InventoryActions/StockOutProductsMobilePage.js
//
// Page object for the Stock Out Products mobile screen
// (route /MobileViewScreen/stock-out-products).
// Component: Frontend/src/components/StockOutProducts/index.tsx.
//
// Behaviour highlights:
//   - The route is wrapped in ConfigStockOutGuard which blocks rendering
//     when requireWorkOrderForStockOut=true. We assert the screen mounts
//     before continuing, so tests fail clearly if QA flips the flag on.
//   - Submit validates: product selected → reason → reference number →
//     qty>0 → qty<=available → optional container source. The relevant
//     boundary error for TC95 is "Quantity cannot exceed available
//     quantity" (StockOutProducts/index.tsx:801).

import L from '../../support/locators/InventoryActions/stockOutProductsLocators';

class StockOutProductsMobilePage {
  visit() {
    cy.visit('/MobileViewScreen/stock-out-products');
    cy.url().should('include', '/stock-out-products');
    // Confirm the guard didn't block — fails fast if requireWorkOrderForStockOut flipped.
    cy.contains(L.workOrderRequiredHeading).should('not.exist');
  }

  /**
   * Click the first product card with availableQuantity > 0. The
   * "available qty == 0" disable rule on the Stock Out button means we
   * must pick a product with stock; we walk the rendered cards looking
   * for one whose visible "Available" text is greater than 0.
   *
   * After click, waits for the container-assignments API to settle —
   * the source dropdown only renders after this resolves; without the
   * wait, selectFirstSourceIfPresent below races the async render.
   *
   * Caller must set up the alias in beforeEach:
   *   cy.intercept('GET', '**\/containers/product-assignments/**').as('productAssignments');
   */
  selectFirstAvailableProduct() {
    // The product list (GET /products, 10 at a time + per-category attribute
    // fetches) can take well over the default command timeout to paint on QA;
    // until then the screen shows a <CircularProgress> and renders zero <li>.
    // Earlier this raced the list query and failed with "ul.MuiList-root li …
    // never found". Wait for the initial loading spinner to clear and the
    // list to actually have rows before selecting — the list renders as
    // <ul class="MuiList-root"> with one <li class="MuiListItem-root"> per
    // product (StockOutProducts/index.tsx:1008-1034).
    cy.get('[role="progressbar"]', { timeout: 30000 }).should('not.exist');
    cy.get('ul.MuiList-root li, [role="listitem"]', { timeout: 30000 })
      .should('have.length.greaterThan', 0);
    cy.get('ul.MuiList-root li, [role="listitem"]').then(($cards) => {
      const $available = $cards.filter(function () {
        const text = Cypress.$(this).text();
        const m = text.match(/Available[^0-9]*(\d+)/i);
        return m && parseInt(m[1], 10) > 0;
      });
      if ($available.length === 0) {
        throw new Error('No product with availableQuantity > 0 visible');
      }
      cy.wrap($available.first()).click({ force: true });
    });
    cy.contains(L.stockOutProductHeading, { timeout: 15000 }).should('be.visible');
    // Deterministic gate for the source-dropdown race.
    cy.wait('@productAssignments', { timeout: 15000 });
  }

  selectReason(reason) {
    cy.get(L.reasonSelectInput).first().focus().type(`${reason}{enter}`, { delay: 100 });
  }

  typeReferenceNumber(value) {
    cy.get(`input[placeholder="${L.referenceNumberPlaceholder}"]`).clear().type(String(value));
  }

  enterQuantity(qty) {
    cy.get(L.quantityInput).clear().type(String(qty));
  }

  /**
   * If the screen renders a "Select Source" dropdown (container assignment
   * enabled for this product), open it and pick the first option. The
   * component validates submission with `if (showContainerSource &&
   * !containerSource) showErrorToast('Please select a source')`, so this
   * call is a no-op safe to invoke unconditionally.
   *
   * The "Select Source" label (not placeholder) is always present when the
   * dropdown renders, so we anchor on that instead of checking for placeholder
   * text (which is hidden when react-select shows the first option).
   */
  selectFirstSourceIfPresent() {
    cy.get('body').then(($body) => {
      // Detect by the "Select Source" label (always rendered when showContainerSource=true).
      if ($body.text().includes('Select Source')) {
        // The Source dropdown is the LAST react-select on the screen
        // (Reason is the first). Use last() to disambiguate.
        cy.get(L.reasonSelectInput).last().focus().type('{downarrow}', { force: true });
        cy.get('[class*="option"]', { timeout: 8000 }).first().click({ force: true });
      }
    });
  }

  clickStockOut() {
    cy.contains('button', new RegExp(`^${L.stockOutButton}$`)).click();
  }

  /**
   * Assert a success toast. Matches "Success" / "successfully" only —
   * we deliberately do NOT match `/stocked\s+out/` because:
   *   - The page heading is "Stock Out Product" (static).
   *   - Per-product breakdown labels can include phrases like "Stocked
   *     out: N" in the location/container summaries.
   * The component's onSuccess handler always produces a message
   * containing "Success" or "successfully" (api message or fallback
   * "Stock Out Success" / "Product stocked out successfully").
   */
  assertSuccess() {
    cy.contains(/success(fully)?/i, { timeout: 15000 }).should('be.visible');
  }

  assertExceedsAvailableError() {
    cy.contains(new RegExp(L.qtyExceedsAvailableFragment, 'i'), { timeout: 12000 })
      .should('be.visible');
  }
}

export default StockOutProductsMobilePage;
