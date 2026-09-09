// cypress/pageObjects/InventoryActions/PrintLabelsPage.js
//
// Page object for the Print Labels (Print Asset) mobile screen
// (route /MobileViewScreen/print-asset).
// Component: Frontend/src/components/PrintAsset/index.tsx.
//
// Two tabs (Containers / Locations). Tapping a card opens a QrCodeDialog;
// the dialog's Print button opens a new browser window via window.open(...)
// then calls printWindow.print() in the new doc — Cypress can't follow the
// new window, so tests use cy.iaStubWindowOpen() (wmsHelpers) to stub
// window.open and assert it was invoked.

import L from '../../support/locators/InventoryActions/printLabelsLocators';

class PrintLabelsPage {
  visit() {
    cy.visit('/MobileViewScreen/print-asset');
    cy.url().should('include', '/print-asset');
  }

  walkFromLanding() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.printLabelsTile}$`)).click();
    cy.url().should('include', '/print-asset');
  }

  // ---- Page-level assertions -------------------------------------------

  assertPageVisible() {
    cy.contains('h6', L.pageHeading, { timeout: 15000 }).should('be.visible');
    cy.contains('[role="tab"]', L.containersTabText).should('be.visible');
    cy.contains('[role="tab"]', L.locationsTabText).should('be.visible');
  }

  // ---- Tab switching ----------------------------------------------------

  selectContainersTab() {
    cy.contains('[role="tab"]', L.containersTabText).click();
  }

  selectLocationsTab() {
    cy.contains('[role="tab"]', L.locationsTabText).click();
  }

  /**
   * Assert which tab is currently selected by checking aria-selected.
   * MUI Tabs set aria-selected="true" on the active <button role="tab">.
   */
  assertActiveTab(tabName) {
    cy.contains('[role="tab"]', tabName)
      .should('have.attr', 'aria-selected', 'true');
  }

  // ---- Search ----------------------------------------------------------

  typeContainersSearch(query) {
    cy.get(L.containersSearchPlaceholder).clear().type(query);
  }

  typeLocationsSearch(query) {
    cy.get(L.locationsSearchPlaceholder).clear().type(query);
  }

  // ---- Empty / loading states -----------------------------------------

  assertNoContainersFound() {
    cy.contains(L.noContainersFoundText, { timeout: 10000 }).should('be.visible');
  }

  assertNoLocationsFound() {
    cy.contains(L.noLocationsFoundText, { timeout: 10000 }).should('be.visible');
  }

  // ---- QR dialog -------------------------------------------------------

  /**
   * Click the first card in the active tab. Cards use MUI <CardActionArea>
   * which renders as a button-like element with role="button".
   */
  clickFirstCard() {
    cy.get('.MuiCardActionArea-root').first().click();
  }

  assertQrDialogVisible() {
    cy.contains('button', new RegExp(`^${L.qrPrintButtonText}$`), { timeout: 10000 })
      .should('be.visible');
  }

  clickPrint() {
    cy.contains('button', new RegExp(`^${L.qrPrintButtonText}$`)).click();
  }
}

export default PrintLabelsPage;
