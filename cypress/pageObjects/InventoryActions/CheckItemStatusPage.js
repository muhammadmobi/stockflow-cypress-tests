// cypress/pageObjects/InventoryActions/CheckItemStatusPage.js
//
// Page object for the Check Item Status mobile screen
// (route /MobileViewScreen/scan-item-status). Navigation reaches it via the
// landing screen → Product Operations → Check Item Status tile.
//
// This page object is owned by the InventoryActions/ module and does not
// depend on the existing `InventoryActionCheckItemStatusPage`.

import L from '../../support/locators/InventoryActions/checkItemStatusLocators';

class CheckItemStatusPage {
  // -- Navigation -----------------------------------------------------------

  openFromSideNav() {
    cy.visit('/dashboard');
    cy.get(L.sideNavLink).should('be.visible').click({ force: true });
    cy.url().should('include', '/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.productOperationsTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.checkItemStatusTile}$`)).click();
    cy.url().should('include', '/scan-item-status');
  }

  visitDirect() {
    cy.visit('/MobileViewScreen/scan-item-status');
    cy.url().should('include', '/scan-item-status');
  }

  // -- Actions --------------------------------------------------------------

  scanSerial(serialNumber) {
    cy.get(L.serialInput).first().clear().type(serialNumber);
    cy.contains('button', new RegExp(`^${L.scanButton}$`)).click();
  }

  // -- Assertions -----------------------------------------------------------

  /**
   * Asserts the rendered Status row shows the given status value.
   * The Status row is a MuiStack containing the "Status:" label and a
   * trailing <p> with the value.
   */
  assertDisplayedStatus(expectedStatus) {
    cy.get(L.statusRowSelector)
      .contains(L.statusLabel)
      .parent()
      .within(() => {
        cy.get('p').last().should('contain.text', expectedStatus);
      });
  }
}

export default CheckItemStatusPage;
