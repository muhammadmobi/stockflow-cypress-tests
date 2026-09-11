// cypress/pageObjects/PurchaseOrder/POListPage.js
//
// Page Object for the Purchase Orders list page — browse/filter columns,
// Reopen, and Delete row actions. Complements POClosePage.js (which owns the
// Close-PO modal flow) so the two specs don't duplicate modal logic.

import POListLocators from '../../support/locators/PurchaseOrder/POListLocators';

const L = POListLocators;

export default class POListPage {
  visit() {
    cy.visit('/purchase-orders');
  }

  visitAssignmentTab() {
    cy.visit('/purchase-orders');
    cy.contains(L.PAGE.TAB_ASSIGNMENT.replace('[role="tab"]:contains("', '').replace('")', ''), { timeout: 15000 })
      .should('be.visible')
      .click();
  }

  search(term) {
    cy.intercept('GET', '**/purchase-orders*').as('poListSearch');
    cy.get(L.PAGE.SEARCH_INPUT, { timeout: 20000 }).should('be.visible').clear().type(term);
    cy.get(L.PAGE.SEARCH_SUBMIT).click();
    cy.wait('@poListSearch', { timeout: 20000 });
  }

  row(poNumber) {
    return cy.contains('td', poNumber).closest('tr');
  }

  assertRowVisible(poNumber) {
    cy.contains('td', poNumber, { timeout: 15000 }).should('be.visible');
  }

  assertNoResults() {
    cy.contains(/No Result/i, { timeout: 15000 }).should('be.visible');
  }

  assertResultCount(n) {
    cy.contains(new RegExp(`${n} Result`, 'i'), { timeout: 15000 }).should('be.visible');
  }

  // ── Column readers ───────────────────────────────────────────────────────

  sourceChipText(poNumber) {
    return this.row(poNumber).find(L.ROW.SOURCE_CELL).find(L.ROW.SOURCE_CHIP);
  }

  cell(poNumber, cellSelector) {
    return this.row(poNumber).find(cellSelector);
  }

  assertStatus(poNumber, status) {
    this.row(poNumber).find(L.ROW.STATUS_CELL).should('contain.text', status);
  }

  assertQuantities(poNumber, { expected, available, incoming }) {
    const c = () => this.row(poNumber).find(L.ROW.QUANTITIES_CELL);
    if (expected !== undefined) c().contains('Expected:').next().should('have.text', String(expected));
    if (available !== undefined) c().contains('Available:').next().should('have.text', String(available));
    if (incoming !== undefined) c().contains('Incoming:').next().should('have.text', String(incoming));
  }

  // Adjustment cell (`Extra:`/`Damaged:`/`--`). `expectedValue` may be a
  // literal string (e.g. `'--'`) or any substring passed straight to
  // `.should('contain.text', …)` for the populated-after-Close cases.
  assertAdjustment(poNumber, expectedValue) {
    this.row(poNumber).find(L.ROW.ADJUSTMENT_CELL).should('contain.text', expectedValue);
  }

  // ── Reopen ────────────────────────────────────────────────────────────────

  clickReopen(poNumber) {
    this.row(poNumber).contains('button', /^Reopen$/i).click({ force: true });
  }

  // Reopen is ALWAYS rendered (List.tsx has no conditional wrapper around it,
  // unlike Delete) — it's disabled via `disabled={... || status !== 'Closed'}`.
  // So the correct assertion for an Open PO is "disabled", not "absent".
  assertReopenButtonDisabled(poNumber) {
    this.row(poNumber).contains('button', /^Reopen$/i).should('be.disabled');
  }

  confirmYes() {
    cy.contains('button', /^Yes$/i).click({ force: true });
  }

  confirmNo() {
    cy.contains('button', /^No$/i).click({ force: true });
  }

  // Asserts the confirmation dialog's Yes/No buttons are both visible without
  // clicking either — used by TCs that only verify the guard dialog appears.
  assertDialogButtonsVisible() {
    cy.contains('button', /^Yes$/i).should('be.visible');
    cy.contains('button', /^No$/i).should('be.visible');
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  // The Delete action is an icon-only button (svg child, no text label) with
  // no data-testid — it's also CONDITIONALLY UNRENDERED (not just disabled)
  // for canDelete===false or non-admin users, so find it by "has an svg and
  // no text content" rather than a fixed testid.

  deleteIconButton(poNumber) {
    // Use jQuery's own .find()/.filter() inside .then() (single-pass, no
    // Cypress command retry semantics) — chaining Cypress's .find('button')
    // directly throws a "never found it" timeout for sales rows, which have
    // ZERO buttons at all (List.tsx sets `enableRowActions: isSales() ?
    // false : true`, hiding the whole Actions column, not just Delete) — so
    // Cypress's built-in "must find at least one" retry never succeeds.
    return this.row(poNumber)
      .then(($row) => {
        const $buttons = $row.find('button');
        const matches = $buttons.filter(
          (_, el) => Cypress.$(el).text().trim() === '' && Cypress.$(el).find('svg').length > 0
        );
        return cy.wrap(matches);
      });
  }

  clickDeleteIcon(poNumber) {
    this.deleteIconButton(poNumber).should('have.length', 1).click({ force: true });
  }

  assertDeleteIconAbsent(poNumber) {
    this.deleteIconButton(poNumber).should('have.length', 0);
  }

  fillDeleteConfirmText(text) {
    cy.get(L.DELETE_DIALOG.CONFIRM_INPUT).clear().type(text);
  }

  assertDeleteHeading() {
    cy.contains(/Confirm Purchase Order Deletion/i).should('be.visible');
  }

  assertRowAbsent(poNumber) {
    cy.contains('td', poNumber).should('not.exist');
  }
}
