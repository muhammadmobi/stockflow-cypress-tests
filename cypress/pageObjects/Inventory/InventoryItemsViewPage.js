// Page object for the Inventory Items View selection toolbar (/inventory).
// Switching to the "Items View" tab renders InventoryItemsList (a serial-row MRT).
// On the Inventory page (fillParent) the selection actions render inline near the
// tabs: "{n} selected" + Stock Out Selected / Print Asset IDs / Select all / Clear.
// Select-all-matching hits GET /items/serial-numbers (not just the visible page).

import L from '../../support/locators/Inventory/itemsViewLocators';

class InventoryItemsViewPage {
  switchToItemsView() {
    cy.contains(L.TAB_ITEMS_VIEW, { timeout: 15000 }).click({ force: true });
    cy.get('[role="progressbar"]', { timeout: 20000 }).should('not.exist');
    return this;
  }

  assertItemsTableRendered() {
    cy.get('tbody tr', { timeout: 20000 }).should('have.length.greaterThan', 0);
    cy.get(L.ROW_CHECKBOX, { timeout: 10000 }).should('exist');
    return this;
  }

  // MRT row-select checkbox (mirrors InvViewPage.SelectFirstRecord — a plain
  // click on the input, no force, so React's onChange fires and the row selects).
  selectRow(index = 0) {
    cy.get('tbody tr').eq(index).find('input[type="checkbox"]').click();
    cy.get('tbody tr').eq(index).find('input[type="checkbox"]').should('be.checked');
    return this;
  }

  // The selection count renders either as the inline "N selected" (portaled near
  // the tabs) or the MRT alert-banner `Selected  "N" Row(s).` — match either.
  assertSelectedCount(n) {
    cy.contains(new RegExp(`(\\b${n} selected\\b|Selected\\s+"?${n}"?\\s+Row)`), { timeout: 10000 }).should('be.visible');
    return this;
  }

  assertSelectionCleared() {
    cy.contains(/(\d+ selected|Selected\s+"?\d+"?\s+Row)/).should('not.exist');
    return this;
  }

  assertBulkButtonsVisible() {
    cy.contains('button', L.PRINT_ASSET_IDS, { timeout: 8000 }).should('be.visible');
    return this;
  }

  // Select every row on the current page via the header checkbox.
  selectAllOnPage() {
    cy.get(L.HEADER_CHECKBOX).first().click();
    return this;
  }

  interceptSelectAll(alias = 'serialNumbers') {
    cy.intercept('GET', L.SERIAL_NUMBERS_ENDPOINT).as(alias);
    return this;
  }

  clickSelectAll() {
    cy.contains('button', L.SELECT_ALL, { timeout: 8000 }).should('be.visible').click({ force: true });
    return this;
  }

  // After "Select all" succeeds, every matching row is selected so the affordance
  // is no longer offered (isAllSelected / selectedCount === totalCount).
  assertAllSelected() {
    cy.contains('button', L.SELECT_ALL).should('not.exist');
    cy.contains(/(\d+ selected|Selected\s+"?\d+"?\s+Row)/).should('exist'); // a selection is still active
    return this;
  }

  // Inline variant labels the button "Clear"; the MRT alert banner labels it
  // "Clear Selection" — match either.
  clickClear() {
    cy.contains('button', /^Clear$|Clear Selection/, { timeout: 8000 }).should('be.visible').click({ force: true });
    return this;
  }
}

export default InventoryItemsViewPage;
