// cypress/pageObjects/PurchaseOrder/PODetailPage.js
//
// Page Object for the single-PO detail page (`/purchase-orders/:poNumber`).
// This route renders the same IncomingList component as Incoming Inventory,
// bound to a fixed PO (closePo=true, read-only) — so stat-card and table
// reading logic is delegated to AllPOsPage, which already implements it
// against the identical DOM.

import AllPOsPage from '../AllPOsPage';

export default class PODetailPage {
  constructor() {
    this.allPos = new AllPOsPage();
  }

  visit(poNumber) {
    cy.visit(`/purchase-orders/${encodeURIComponent(poNumber)}`);
  }

  visitViaWindowOpenStub(poNumber) {
    // Row navigation uses window.open(url, '_blank') — stub it so the click
    // doesn't spawn a real second tab, then assert the intended URL.
    return cy.window().then((win) => cy.stub(win, 'open').as('windowOpen'));
  }

  assertWindowOpenedOnce() {
    cy.get('@windowOpen').should('have.been.calledOnce');
  }

  assertWindowOpenedWith(poNumber) {
    cy.get('@windowOpen').should('have.been.calledWith', `/purchase-orders/${poNumber}`, '_blank');
  }

  tableRows() {
    return cy.get('tbody tr');
  }

  // MRT header. Existence + column-count are asserted rather than
  // `.should('be.visible')` — the sticky header fails Cypress's viewport-
  // visibility heuristic even though it renders correctly on screen.
  tableHeader() {
    return cy.get('thead', { timeout: 15000 });
  }

  headerRows() {
    return cy.get('thead tr', { timeout: 15000 });
  }

  headerCells() {
    return cy.get('thead th', { timeout: 15000 });
  }

  firstRow() {
    return cy.get('tbody tr:first', { timeout: 15000 });
  }

  firstRowCells() {
    return cy.get('tbody tr:first td', { timeout: 15000 });
  }

  // Serial-number/expand-drill-down markers on the first row — used to
  // confirm a product-only row omits serialized-item affordances.
  firstRowExpandOrSerialIndicator() {
    return cy.get('tbody tr:first [class*="expand"], tbody tr:first [class*="serial"]');
  }

  navPurchaseOrdersLink() {
    return cy.get('a[aria-label="Purchase Orders"][href="/purchase-orders"]', { timeout: 15000 });
  }

  assertRowWithText(text) {
    cy.contains('tbody tr', text, { timeout: 20000 }).should('be.visible');
  }

  // The backend's column/fieldMapping builder for this route
  // (Backend/src/modules/incomingItems/incoming-item.service.ts,
  // searchProductsVariantsItems ~line 2439) only includes a category-specific
  // attribute column when the request's categoryId matches the attribute's
  // categoryId. The single-PO detail view never sends a categoryId (there is
  // no per-category filter on this page), so for a PO spanning MULTIPLE
  // categories (e.g. mixedPO: RAM + Laptop) every category-specific attribute
  // column (Memory Generation, Model Number, ...) is dropped entirely from
  // both `columns` and `fieldMapping` — only category-agnostic (categoryId
  // null) attributes render. That raw attribute text therefore never appears
  // in ANY cell, regardless of pagination/timing/column-customization state.
  // The backend's free-text search (raw ILIKE across all product/variant
  // columns) is NOT restricted the same way, so filtering the table via the
  // UI search box is a column-agnostic way to prove a specific product is
  // individually discoverable in this table.
  searchInTable(term) {
    return this.allPos.searchInPage(term);
  }

  clearTableSearch() {
    return this.allPos.invPage.clearSearch();
  }

  assertNoRows() {
    cy.contains(/No records to display/i, { timeout: 15000 }).should('be.visible');
  }

  badgeValue(label) {
    return this.allPos.readBadgeValue(label);
  }

  assertBadgeMatchesValue(label, value) {
    return this.allPos.assertBadgeMatchesValue(label, value);
  }
}
