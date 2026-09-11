// cypress/pageObjects/PurchaseOrder/POCostBreakdownPage.js
//
// Page Object for the Cost Breakdown pane. Composes POClosePage to open the
// PO Close modal first (the only entry point for this feature), then slides
// to the "Product level breakdown" wizard page rendered inside the SAME
// dialog (see POCostBreakdownLocators.js for the full ground-truth writeup —
// there is no second nested dialog).

import POClosePage from './POClosePage';
import L from '../../support/locators/PurchaseOrder/POCostBreakdownLocators';

export default class POCostBreakdownPage {
  constructor() {
    this.closePage = new POClosePage();
  }

  // Opens the PO Close modal for `poNumber` then slides to the breakdown page.
  // Observes (never stubs) the pane's own data fetch under a page-object-owned
  // alias so assertTitleContainsPO() can prove *which* PO's data loaded —
  // registered before the click so the request is guaranteed to be caught.
  open(poNumber) {
    cy.intercept('GET', '**/cost-breakdown*').as('costBreakdownPaneLoad');
    this.closePage.searchPO(poNumber);
    this.closePage.clickClosePOButton(poNumber);
    this.closePage.waitForModalReady();
    cy.get(L.TRIGGER_BTN).should('be.visible').click({ force: true });
    cy.get(L.MODAL, { timeout: 15000 }).should('be.visible');
  }

  modal() {
    return cy.get(L.MODAL);
  }

  // No standalone-Dialog title exists in the live embedded flow (that string
  // — "Product Level Breakdown - PO {poNumber}" — only lives in
  // CostBreakdownModal.tsx's dead Dialog branch, and the poNumber is never
  // otherwise interpolated into the embedded pane's visible text). The real,
  // DOM-independent signal that the right PO's breakdown loaded is the fetch
  // itself: `GET /purchase-orders/{poNumber}/cost-breakdown`.
  assertTitleContainsPO(poNumber) {
    cy.wait('@costBreakdownPaneLoad', { timeout: 15000 }).then((interception) => {
      expect(interception.request.url, 'the breakdown fetch targets this PO').to.include(
        `/purchase-orders/${poNumber}/cost-breakdown`
      );
    });
  }

  // Real reconciling columns (CostBreakdownModal.tsx RECON_COLUMNS, verified
  // against source 2026-07-05) — there is no "Manual" or single "Credit"
  // column; "Excess" replaced "Manual", and the cost side is three separate
  // columns (Expected/Received(PO)/Excess Credit).
  assertColumnsVisible() {
    [
      'Expected',
      'Received(PO)',
      'Excess',
      'Incoming',
      'Missing',
      'Damaged',
      'Available',
      'Expected Credit',
      'Received(PO) Credit',
      'Excess Credit',
    ].forEach((col) => this.modal().should('contain.text', col));
  }

  toggleManualOnly() {
    this.modal().find(L.FILTER_MANUAL_ONLY).find('input[type="checkbox"]').click({ force: true });
  }

  toggleMismatchesOnly() {
    this.modal().find(L.FILTER_MISMATCHES_ONLY).find('input[type="checkbox"]').click({ force: true });
  }

  // APP GAP (see L.SEARCH_INPUT / SW-POCB-TC09 / plan.md §3.2) — no on-screen
  // search control exists (enableTopToolbar:false, no custom TextField bound
  // to globalFilter). This method has no reachable UI to drive; it is kept
  // only so TC09's permanently-skipped body has something to call without
  // inventing a locator that resolves.
  searchProduct(term) {
    this.modal().find(L.SEARCH_INPUT).first().clear().type(term);
  }

  assertProductRowVisible(text) {
    this.modal().contains(text).should('be.visible');
  }

  assertProductRowAbsent(text) {
    this.modal().should('not.contain.text', text);
  }

  clickCostHistory() {
    this.modal().find(L.COST_HISTORY_BTN).click({ force: true });
  }

  clickDeletedItems() {
    this.modal().find(L.DELETED_ITEMS_BTN).click({ force: true });
  }

  clickMovements() {
    this.modal().find(L.MOVEMENTS_BTN).first().click({ force: true });
  }

  assertCostHistoryTitleVisible() {
    cy.get(L.COST_HISTORY_TITLE).should('be.visible');
  }

  assertDeletedItemsTitleVisible() {
    cy.get(L.DELETED_ITEMS_TITLE).should('be.visible');
  }

  assertPaginationVisible() {
    this.modal().find(L.PAGINATION_FOOTER).should('exist');
  }

  // Column-aware readers for the reconciling-quantity table (Expected/
  // Received(PO)/Excess/Incoming/Missing/Damaged/Available/Expected Credit/
  // Received(PO) Credit/Excess Credit + the MRT Footer "Total" row) — used to
  // verify aggregate/Total values actually equal the sum of the per-product
  // rows, instead of just asserting a digit or a column name appears
  // somewhere in the pane (which is true regardless of the real data).
  headerLabels() {
    return this.modal()
      .find('table thead tr')
      .last()
      .find('th')
      .then(($ths) => [...$ths].map((el) => el.innerText.trim()));
  }

  footerRowValues() {
    return this.modal()
      .find('table tfoot tr')
      .first()
      .find('td, th')
      .then(($cells) => [...$cells].map((el) => el.innerText.trim()));
  }

  bodyRowsValues() {
    return this.modal()
      .find('table tbody tr')
      .then(($rows) =>
        [...$rows].map((tr) => [...tr.querySelectorAll('td, th')].map((el) => el.innerText.trim()))
      );
  }

  // Resolves to { footerText, bodyTexts } for the given column header label —
  // bodyTexts is one entry per product row, in table order. Exact-match
  // lookup (not substring) is deliberate: several real headers are prefixes
  // of one another ("Excess" / "Excess Credit", "Received(PO)" /
  // "Received(PO) Credit") and a substring match would be ambiguous between
  // them — callers must pass the exact header string.
  columnValues(columnLabel) {
    return this.headerLabels().then((headers) => {
      const idx = headers.indexOf(columnLabel);
      expect(idx, `column "${columnLabel}" should exist in headers: ${JSON.stringify(headers)}`).to.be.at.least(0);
      return this.footerRowValues().then((footer) =>
        this.bodyRowsValues().then((bodyRows) => ({
          footerText: footer[idx],
          bodyTexts: bodyRows.map((r) => r[idx]),
        }))
      );
    });
  }
}
