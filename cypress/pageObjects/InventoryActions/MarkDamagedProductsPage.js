// cypress/pageObjects/InventoryActions/MarkDamagedProductsPage.js
//
// Page object for the Mark Damaged Products mobile screen
// (route /MobileViewScreen/mark-damaged-products?poId=...).
// Component: Frontend/src/components/MarkDamagedProducts/index.tsx.
//
// Behaviour highlights from the component (lines 85-93, 439, 645-655):
//   - Without a `poId` query param the screen redirects to /MobileViewScreen.
//     Tests must always visit with `?poId=<po>`.
//   - Selecting a product flips a heading from "Select Product" to
//     "Mark Damaged Product".
//   - Submit calls /products/report-discrepancy and on success fires
//     showSuccessToast with the API message (defaults to "Stock Out Success").

import L from '../../support/locators/InventoryActions/markDamagedLocators';

class MarkDamagedProductsPage {
  visit(poNumber) {
    cy.visit(`/MobileViewScreen/mark-damaged-products?poId=${encodeURIComponent(poNumber)}`);
    cy.url().should('include', '/mark-damaged-products');
    cy.url().should('include', 'poId=');
  }

  searchProducts(text) {
    cy.get(`input[placeholder="${L.searchProductsPlaceholder}"]`)
      .first()
      .clear()
      .type(text);
  }

  /**
   * Click the first rendered product card. Waits for the heading to flip
   * AND for the container-assignments API call to settle (the source
   * dropdown only renders after this resolves; without the wait,
   * selectFirstSourceIfPresent below races the async render).
   *
   * Visibility check uses `exist` rather than `be.visible` because the
   * heading sits inside a Stack with overflow:hidden, which Cypress
   * conservatively reports as "not visible". `exist` + scrollIntoView is
   * sufficient proof the form transitioned to the Mark-Damaged step.
   *
   * Caller must set up the alias in beforeEach:
   *   cy.intercept('GET', '**\/containers/product-assignments/**').as('productAssignments');
   */
  selectFirstProduct() {
    cy.get('ul.MuiList-root li, [role="listitem"]', { timeout: 15000 })
      .first()
      .click({ force: true });
    cy.contains(L.markDamagedHeading, { timeout: 8000 })
      .should('exist')
      .scrollIntoView();
    // Deterministic gate: the call always fires for the selected product
    // (component line 199 useEffect → fetchContainerAssignments); whether
    // the source dropdown renders depends on the response payload.
    cy.wait('@productAssignments', { timeout: 15000 });
  }

  selectDamageReason(reason) {
    cy.get(L.damageReasonInput).first().focus().type(`${reason}{enter}`, { delay: 100 });
  }

  enterQuantity(qty) {
    cy.get(L.quantityInput).clear().type(String(qty));
  }

  /**
   * If the screen shows a "Select Source" dropdown, open it and pick the
   * first option. The component validates submission with
   * `if (!containerSource) showErrorToast('Please select a source')`
   * (MarkDamagedProducts/index.tsx:710-712), so this call is required
   * when container assignment is enabled for the selected product.
   * No-op when the dropdown isn't present.
   */
  selectFirstSourceIfPresent() {
    cy.get('body').then(($body) => {
      if ($body.text().includes(L.sourceSelectPlaceholder)) {
        // The Source dropdown is the LAST react-select on the screen
        // (Damage Reason is the first). Use last() to disambiguate.
        cy.get(L.damageReasonInput).last().focus().type('{downarrow}', { force: true });
        cy.get('[class*="option"]', { timeout: 8000 }).first().click({ force: true });
      }
    });
  }

  clickMarkDamage() {
    cy.contains('button', new RegExp(`^${L.markDamageButton}$`)).click();
  }

  /**
   * Assert a success toast appeared. The component routes mark-damage
   * through showSuccessToast with the API message
   * (data?.data?.data?.[0]?.message || 'Stock Out Success').
   *
   * Pattern is tight on purpose:
   *   - "Mark Damaged Product" is the static page heading — so generic
   *     words like "damaged" or "marked" alone false-positive.
   *   - A configured damage reason MIGHT be named "Stocked out" — it
   *     would render in the dropdown selection on screen — so we don't
   *     match `/stocked\s+out/`.
   *   - Toast fallback text always contains "Success" (case-insensitive)
   *     and API messages typically include "successfully" / "reported"
   *     / "recorded". We anchor on those.
   */
  assertMarkDamageSuccess() {
    cy.contains(/success(fully)?|reported|recorded/i, { timeout: 15000 })
      .should('be.visible');
  }
}

export default MarkDamagedProductsPage;
