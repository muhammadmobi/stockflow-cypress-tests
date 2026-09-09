// cypress/pageObjects/InventoryActions/UnassignItemsPage.js
//
// Page object for the Unassign Items mobile screen
// (route /MobileViewScreen/unassign-items).
// Component: Frontend/src/components/UnAssignItems/index.tsx.
//
// Single-step screen: scan a serial → DELETE /containers/items/:serial
// (backend resolves the source container/location). No target step.

import L from '../../support/locators/InventoryActions/unassignItemsLocators';

class UnassignItemsPage {
  visit() {
    cy.visit('/MobileViewScreen/unassign-items');
    cy.url().should('include', '/unassign-items');
  }

  walkFromLanding() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.unassignmentTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.unassignItemsTile}$`)).click();
    cy.url().should('include', '/unassign-items');
  }

  assertScreenVisible() {
    cy.get(`#${L.serialInputId}`, { timeout: 15000 }).should('be.visible');
    cy.contains('button', new RegExp(`^${L.scanButtonText}$`)).should('be.visible');
  }

  scanSerial(serial) {
    cy.get(`#${L.serialInputId}`).clear().type(`${serial}{enter}`);
  }

  typeSerial(serial) {
    cy.get(`#${L.serialInputId}`).clear().type(serial);
  }

  clickScan() {
    cy.contains('button', new RegExp(`^${L.scanButtonText}$`)).click();
  }

  assertSessionRowExists(serial) {
    cy.contains('li', serial, { timeout: 15000 }).should('be.visible');
  }

  assertSessionEmpty() {
    // The "No items unassigned in this session." copy lives in the desktop-style
    // right column which renders at all viewports but is clipped by an
    // overflow:hidden ancestor at iphone-7. Cypress treats clipped elements as
    // not-visible; assert-exists is sufficient for the empty-state contract.
    cy.contains(L.noUnassignedItemsText).should('exist');
  }
}

export default UnassignItemsPage;
