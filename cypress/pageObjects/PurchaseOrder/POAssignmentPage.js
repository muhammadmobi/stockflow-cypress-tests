// cypress/pageObjects/PurchaseOrder/POAssignmentPage.js
//
// Page Object for the "Purchase Order Assignment" tab.

import POAssignmentLocators from '../../support/locators/PurchaseOrder/POAssignmentLocators';

const L = POAssignmentLocators;

export default class POAssignmentPage {
  visit() {
    cy.visit('/purchase-orders');
    cy.contains('[role="tab"]', /Purchase Order Assignment/i, { timeout: 15000 })
      .should('be.visible')
      .click();
  }

  assertTabRendered() {
    cy.contains(L.WORKERS_HEADER.replace(':contains("', '').replace('")', ''), { timeout: 15000 }).should('be.visible');
  }

  selectFirstWorker() {
    // worker-list.tsx renders 5 disabled skeleton ListItemButtons while
    // isLoading — clicking one of those does nothing (selectedWorker stays
    // unset), so the "Assign Purchase Order" button never mounts downstream.
    // Wait for a real, non-disabled row before clicking.
    cy.get('ul li [class*="MuiListItemButton"]:not(.Mui-disabled)', { timeout: 20000 })
      .first()
      .click({ force: true });
    cy.contains(/Selected Worker:/i, { timeout: 15000 }).should('be.visible');
  }

  openAssignDialog() {
    cy.contains('button', /Assign Purchase Order/i).click({ force: true });
    cy.get(L.DIALOG).should('be.visible');
  }

  typePoInSelect(poNumber) {
    cy.get(L.PO_SELECT_INPUT).filter(':visible').first().type(poNumber, { force: true });
  }

  selectPoOption(poNumber) {
    cy.get(L.PO_SELECT_MENU, { timeout: 15000 }).should('be.visible').contains(poNumber).click({ force: true });
  }

  assertPoOptionAbsent(poNumber) {
    cy.get(L.PO_SELECT_MENU, { timeout: 10000 }).should(($menu) => {
      expect($menu.text()).to.not.include(poNumber);
    });
  }

  clickSave() {
    cy.contains('[role="dialog"] button', /^Save$|^Assigning\.\.\.$/).click({ force: true });
    cy.get(L.DIALOG, { timeout: 15000 }).should('not.exist');
  }

  assertAssignedPoVisible(poNumber) {
    cy.contains('li', `PO: ${poNumber}`, { timeout: 15000 }).should('be.visible');
  }

  assertAssignedPoAbsent(poNumber) {
    cy.contains('li', `PO: ${poNumber}`).should('not.exist');
  }

  unassignPo(poNumber) {
    cy.contains('li', `PO: ${poNumber}`).find('button').click({ force: true });
  }
}
