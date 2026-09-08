// cypress/pageObjects/InventoryActions/AssignItemsPage.js
//
// Page object for the Assign Items mobile screen
// (route /MobileViewScreen/assign-items).
// Component: Frontend/src/components/AssignItems/index.tsx.
//
// Walks Inventory Actions → Warehouse Management → Assignment → Assign
// Items. Two-step flow:
//   Step 1 (target): scan/select a container or location.
//   Step 2 (items):  scan a serial; on Available it stages / assigns.
//
// Convention #5 (state restoration): tests that successfully assign a
// serial must pair the call with an unassign in `after()` — this page
// object exposes intent methods only; cleanup belongs in the spec.

import L from '../../support/locators/InventoryActions/assignItemsLocators';

class AssignItemsPage {
  // ---- Navigation -------------------------------------------------------

  /**
   * Visit the route directly. Use this when the spec doesn't need to
   * exercise the landing-screen navigation (saves ~3 hops). For specs
   * that DO need to test the nav contract (e.g. SW-WM-AI-TC01), use
   * `walkFromLanding()` instead.
   */
  visit() {
    cy.visit(L.targetQrInputId
      ? '/MobileViewScreen/assign-items'
      : '/MobileViewScreen/assign-items'
    );
    cy.url().should('include', '/assign-items');
  }

  walkFromLanding() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.assignmentTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.assignItemsTile}$`)).click();
    cy.url().should('include', '/assign-items');
  }

  // ---- Step 1: target ---------------------------------------------------

  assertTargetStepVisible() {
    cy.contains(L.scanQrToggle, { timeout: 15000 }).should('be.visible');
    cy.contains(L.selectContainerToggle).should('be.visible');
    cy.contains(L.selectLocationToggle).should('be.visible');
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

  /**
   * Type a code into the universal-scan input on step 1 and press Enter.
   * Use {force:true} only when the input is intermittently disabled
   * (during in-flight scan response).
   */
  scanTargetCode(code) {
    cy.get(`#${L.targetQrInputId}`).clear().type(`${code}{enter}`);
  }

  typeTargetCode(code) {
    cy.get(`#${L.targetQrInputId}`).clear().type(code);
  }

  // ---- Step 2: items ----------------------------------------------------

  assertItemsStepVisible() {
    cy.get(`#${L.serialInputId}`, { timeout: 15000 }).should('be.visible');
    cy.contains('button', new RegExp(`^${L.scanButtonText}$`)).should('be.visible');
  }

  scanSerial(serial) {
    cy.get(`#${L.serialInputId}`).clear().type(`${serial}{enter}`);
  }

  typeSerial(serial) {
    cy.get(`#${L.serialInputId}`).clear().type(serial);
  }

  clickScanButton() {
    cy.contains('button', new RegExp(`^${L.scanButtonText}$`)).click();
  }

  goBackToTarget() {
    cy.contains('button', /^← Back$/).first().click();
  }

  // ---- Confirm dialog (move-to-this-target) ----------------------------

  assertConfirmDialogVisible() {
    cy.contains(L.confirmDialogTitle, { timeout: 10000 }).should('be.visible');
  }

  confirmDialogYes() {
    cy.contains('button', L.confirmYesButtonText).click();
  }

  confirmDialogCancel() {
    cy.contains('button', new RegExp(`^${L.confirmCancelButtonText}$`)).click();
  }

  // ---- Session history --------------------------------------------------

  assertSessionRowExists(serial) {
    cy.contains('li', serial, { timeout: 15000 }).should('be.visible');
  }

  assertSessionEmpty() {
    cy.contains(L.noItemsAssignedText).should('be.visible');
  }
}

export default AssignItemsPage;
