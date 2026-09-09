// cypress/pageObjects/InventoryActions/ViewContentsPage.js
//
// Page object for the View Contents mobile screen
// (route /MobileViewScreen/view-contents).
// Component: Frontend/src/components/ViewContents/index.tsx.
//
// Inner-menu screen with three options. Each option lands on its own
// sub-step (item-select / product-select / wms-select). Read-only — no
// state restoration needed in tests.

import L from '../../support/locators/InventoryActions/viewContentsLocators';

class ViewContentsPage {
  visit() {
    cy.visit('/MobileViewScreen/view-contents');
    cy.url().should('include', '/view-contents');
  }

  walkFromLanding() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.viewContentsTile}$`)).click();
    cy.url().should('include', '/view-contents');
  }

  // ---- Inner menu -------------------------------------------------------

  assertMenuVisible() {
    cy.contains('button', new RegExp(`^${L.searchByItemTile}$`), { timeout: 15000 }).should('be.visible');
    cy.contains('button', new RegExp(`^${L.searchByProductsTile}$`)).should('be.visible');
    cy.contains('button', new RegExp(`^${L.searchByStorageTile}$`)).should('be.visible');
  }

  openSearchByItem() {
    cy.contains('button', new RegExp(`^${L.searchByItemTile}$`)).click();
  }

  openSearchByProducts() {
    cy.contains('button', new RegExp(`^${L.searchByProductsTile}$`)).click();
  }

  openSearchByStorage() {
    cy.contains('button', new RegExp(`^${L.searchByStorageTile}$`)).click();
  }

  // ---- Search By Item --------------------------------------------------

  assertItemStepVisible() {
    cy.get(`#${L.itemSerialInputId}`, { timeout: 15000 }).should('be.visible');
  }

  scanItemSerial(serial) {
    cy.get(`#${L.itemSerialInputId}`).clear().type(`${serial}{enter}`);
  }

  // ---- Search By Storage -----------------------------------------------

  assertStorageStepVisible() {
    cy.contains(L.scanQrToggle, { timeout: 15000 }).should('be.visible');
    cy.contains(L.selectContainerToggle).should('be.visible');
    cy.contains(L.selectLocationToggle).should('be.visible');
    cy.get(`#${L.wmsQrInputId}`).should('be.visible');
  }

  scanStorageCode(code) {
    cy.get(`#${L.wmsQrInputId}`).clear().type(`${code}{enter}`);
  }

  // ---- Search By Products ----------------------------------------------

  assertProductStepVisible() {
    cy.get(L.productSearchPlaceholder, { timeout: 15000 }).should('be.visible');
  }

  typeProductSearch(query) {
    cy.get(L.productSearchPlaceholder).clear().type(query);
  }

  // ---- Back navigation -------------------------------------------------

  goBack() {
    cy.contains('button', /^← Back$/).first().click();
  }
}

export default ViewContentsPage;
