// cypress/pageObjects/InventoryActions/RestockBySerialPage.js
//
// Page object for the Restock-by-serial mobile screen
// (route /restock). Reached via Inventory Actions → Inventory Management
// → Restock.
//
// Component: Frontend/src/components/ScanByProduct/Restock.tsx.
// Behaviour highlights from the component:
//   - Successful scan pushes { serialNumber, status: 'Scanned' } into the
//     SessionScannedList and shows showSuccessToast.
//   - Failed scan pushes { serialNumber, status: <scanStatus from server> }
//     and calls addError(message). The status reflects the source state
//     (e.g. 'Incoming', 'Available', 'Missing', 'Reserved').

import L from '../../support/locators/InventoryActions/restockBySerialLocators';

class RestockBySerialPage {
  // -- Navigation -----------------------------------------------------------

  openFromSideNav() {
    cy.visit('/dashboard');
    cy.get(L.sideNavLink).should('be.visible').click({ force: true });
    cy.url().should('include', '/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.inventoryManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.restockTile}$`)).click();
    cy.url().should('include', '/restock');
    // Switch to mobile AFTER navigation so the side nav (visible only at desktop)
    // can be clicked, but useMediaQuery(down('md')) evaluates true at /restock
    // so SessionScannedList renders for session-list assertions.
    cy.viewport('iphone-7');
  }

  visitDirect() {
    cy.visit('/restock');
    cy.url().should('include', '/restock');
  }

  // -- Actions --------------------------------------------------------------

  scanSerial(serial) {
    // The component submits the form on Enter; using {enter} matches the
    // existing InvActionRestockPage helper.
    cy.get(L.serialInput).first().clear().type(`${serial}{enter}`);
  }

  // -- Assertions -----------------------------------------------------------

  /**
   * Asserts the serial appears in the SessionScannedList with the given
   * status text (e.g. "Scanned" on success, or the source status on error).
   */
  assertSessionItemStatus(serial, expectedStatus) {
    cy.get(L.sessionItemBySerial(serial), { timeout: 10000 })
      .should('be.visible')
      .parent()
      .within(() => {
        cy.contains('p', expectedStatus).should('be.visible');
      });
  }

  assertSuccessToast(serial) {
    cy.contains(`Item ${serial} restocked successfully`, { timeout: 10000 }).should('be.visible');
  }

  /**
   * Asserts an error toast is visible. The component routes server errors
   * through addError(getApiError(error) || 'Unable to scan the product').
   *
   * The matcher is tightened to specific server-message fragments (and the
   * client fallback) rather than loose substrings like "error" or "already"
   * that could match unrelated page chrome and cause false-positive passes.
   * Uses Cypress retry semantics via `should()` so an async toast still
   * resolves within the timeout.
   *
   * The companion `assertSessionItemStatus` call in each test does the
   * heavy lifting (it asserts the failed serial appears in the session
   * list with its source-status text) — this method is a supplementary
   * check for the toast surface.
   */
  assertErrorToastVisible(timeout = 10000) {
    // Backend error messages: "Unable to Restock, item X is Incoming/already available./reserved."
    // Client fallback: "Unable to scan the product"
    const ERROR_RE = /Unable\s+to\s+Restock|Unable\s+to\s+scan\s+the\s+product/i;
    cy.get('body', { timeout }).should(($body) => {
      expect(ERROR_RE.test($body.text()), 'restock error toast visible').to.be.true;
    });
  }
}

export default RestockBySerialPage;
