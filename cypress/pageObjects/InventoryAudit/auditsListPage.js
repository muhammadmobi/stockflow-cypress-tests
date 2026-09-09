// cypress/pageObjects/InventoryAudit/auditsListPage.js
//
// Page object for the audits list at /abc/audits
// (cypress/e2e/InventoryAudit/01-AuditsListTests.cy.js).
// Component: Frontend/src/components/ABC/AuditsList.tsx
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §9.1
//
// Every method returns a chainable or nothing; nothing here asserts on behalf of
// a test that did not ask for it. Method names say intent, not mechanics
// (CTAL-TAE maintainability).

import L, { COLUMNS, FILTER, STAT_CARDS } from '../../support/locators/InventoryAudit/auditsListLocators';
import T from '../../support/locators/InventoryAudit/auditToastLocators';

const AUDITS_ROUTE = '/abc/audits';

class AuditsListPage {
  // ── Navigation ──────────────────────────────────────────────────────────

  visit() {
    cy.visit(AUDITS_ROUTE);
    return this;
  }

  /** Visit and wait for the stubbed/live list to land, so no assertion races the fetch. */
  visitAndWait(alias = 'auditList') {
    cy.visit(AUDITS_ROUTE);
    cy.wait(`@${alias}`);
    return this;
  }

  /** No audits table is rendered at all — the RBAC not-found assertion. */
  assertNoTable() {
    L.table().should('not.exist');
    return this;
  }

  assertOnAuditsRoute() {
    cy.location('pathname').should('eq', AUDITS_ROUTE);
    return this;
  }

  assertPageChrome() {
    L.pageHeading().should('be.visible');
    L.pageSubtitle().should('be.visible');
    L.settingsButton().should('be.visible');
    L.createAuditButton().should('be.visible');
    return this;
  }

  clickCreateAudit() {
    L.createAuditButton().click();
    return this;
  }

  openSettings() {
    L.settingsButton().click();
    return this;
  }

  // ── Summary cards ───────────────────────────────────────────────────────

  assertAllStatCardsRendered() {
    STAT_CARDS.forEach((label) => L.statCard(label).should('exist'));
    return this;
  }

  /** Accuracy is a review/adjustment metric with no data source yet — it must read "—". */
  assertAccuracyNotComputed() {
    L.statCardValue('Accuracy').should('have.text', '—');
    return this;
  }

  assertStatCardValue(label, expected) {
    L.statCardValue(label).should('have.text', String(expected));
    return this;
  }

  /**
   * Yields the card's numeric value so a test can compare it before/after.
   *
   * `.should()` first, deliberately: while the list query is in flight the card
   * renders the ellipsis placeholder, and `invoke('text')` does NOT retry — so a
   * bare read yields NaN whenever it lands in that window. Waiting for a digit is
   * what makes the before/after comparison trustworthy.
   */
  readStatCardValue(label) {
    // `.invoke('text').should('match', …)` — NOT `element.should('match', …)`:
    // on an element that assertion is chai-jquery's selector match (`.is()`), so
    // a regex silently never matches. Asserting on the text also makes Cypress
    // retry the invoke, which is what waits out the loading ellipsis.
    return L.statCardValue(label)
      .invoke('text')
      .should('match', /^[0-9,]+$/)
      .then((t) => Number(String(t).trim().replace(/,/g, '')));
  }

  // ── Columns ─────────────────────────────────────────────────────────────

  assertColumnOrder() {
    L.columnHeaders().should('have.length.at.least', COLUMNS.length);
    COLUMNS.forEach((name, index) => {
      L.columnHeaders().eq(index).should('contain.text', name);
    });
    return this;
  }

  assertColumnNotSortable(name) {
    // Assert the ABSENCE of the very control sortBy() clicks — checking for a
    // `<button>` would pass on every column, sortable or not, because MRT's sort
    // toggle is a span with role=button.
    L.columnHeader(name).find('.MuiTableSortLabel-root').should('not.exist');
    return this;
  }

  sortBy(name) {
    L.sortControl(name).click();
    return this;
  }

  /**
   * Sort a column and yield BOTH directions: `{ first, second }`.
   *
   * Direction-agnostic on purpose. MRT renders every header with
   * `MuiTableSortLabel-directionAsc` + `Mui-active` regardless of state, and the
   * FIRST click on these columns sorts DESCENDING — verified on 2026-08-18. A test
   * that assumed ascending was asserting the component's default, not the sort
   * itself. Callers assert that the two reads are exact reverses and that the
   * ascending one has the expected order, which holds whichever way it toggles.
   */
  sortColumnBothWays(name, columnToRead = name) {
    const reads = {};
    this.sortBy(name);
    return this.readColumn(columnToRead)
      .then((first) => {
        reads.first = first;
        this.sortBy(name);
        return this.readColumn(columnToRead);
      })
      .then((second) => {
        reads.second = second;
        return reads;
      });
  }

  /** Column values top-to-bottom, trimmed — the input to every ordering assertion. */
  readColumn(name) {
    return L.rows().then(($rows) =>
      Cypress._.map($rows.toArray(), (tr) =>
        Cypress.$(tr).find('td').eq(COLUMNS.indexOf(name)).text().trim()
      )
    );
  }

  // ── Cells ───────────────────────────────────────────────────────────────

  assertCellContains(rowIndex, columnName, text) {
    L.cell(rowIndex, columnName).should('contain.text', text);
    return this;
  }

  assertCellText(rowIndex, columnName, text) {
    L.cell(rowIndex, columnName).invoke('text').then((t) => expect(t.trim()).to.eq(text));
    return this;
  }

  /** The "+N" overflow chip in the Assigned Worker cell, with its tooltip. */
  assertWorkerOverflowChip(rowIndex, chipLabel, tooltipNames) {
    L.cell(rowIndex, 'Assigned Worker').contains(chipLabel).trigger('mouseover');
    cy.findByRole('tooltip').should('contain.text', tooltipNames);
    return this;
  }

  // ── Search ──────────────────────────────────────────────────────────────

  typeSearch(term) {
    L.searchInput().clear().type(term);
    return this;
  }

  /**
   * Commit the search. The button is required — `{enter}` in this field is
   * unreliable in this suite (feedback_cypress_inv_search_enter_unreliable),
   * and the component only commits on form submit anyway.
   */
  submitSearch() {
    L.searchSubmit().click();
    return this;
  }

  searchFor(term) {
    return this.typeSearch(term).submitSearch();
  }

  // ── Filters ─────────────────────────────────────────────────────────────

  /**
   * Choose a filter option. MUI renders the option list in a portal, so the
   * option is queried globally and never under the trigger
   * (feedback_cypress_mui_select_combobox).
   */
  selectFilter(filterName, optionLabel) {
    L.filterByIndex(FILTER[filterName]).click();
    L.option(optionLabel).click();
    return this;
  }

  /** The option labels a filter currently offers (proves options are derived). */
  readFilterOptions(filterName) {
    L.filterByIndex(FILTER[filterName]).click();
    return L.openOptionList()
      .find('[role="option"]')
      .then(($o) => Cypress._.map($o.toArray(), (el) => Cypress.$(el).text().trim()));
  }

  closeOpenFilter() {
    cy.get('body').type('{esc}');
    return this;
  }

  // ── Rows ────────────────────────────────────────────────────────────────

  assertRowCount(count) {
    L.rows().should('have.length', count);
    return this;
  }

  assertEveryRowCellEquals(columnName, expected) {
    L.rows().each(($row) => {
      cy.wrap($row)
        .find('td')
        .eq(COLUMNS.indexOf(columnName))
        .should('contain.text', expected);
    });
    return this;
  }

  clickRow(index) {
    L.row(index).click();
    return this;
  }

  assertEmptyMessageText(text) {
    L.emptyFallback().should('contain.text', text);
    return this;
  }

  assertRecordCounter(pattern) {
    L.recordCounter().invoke('text').should('match', pattern);
    return this;
  }

  // ── Row actions menu ────────────────────────────────────────────────────

  openActionsMenu(rowIndex) {
    L.actionsButton(rowIndex).click();
    L.menu().should('be.visible');
    return this;
  }

  closeActionsMenu() {
    cy.get('body').type('{esc}');
    L.menu().should('not.exist');
    return this;
  }

  // MUI marks a disabled MenuItem with the `Mui-disabled` class, which has been
  // stable across v5-v7; the `aria-disabled` attribute has NOT been (it is absent
  // on some versions/variants), so the class is what these two assert on. A click
  // on a disabled item is a no-op either way, so the class is the observable fact.
  assertMenuItemEnabled(name) {
    L.menuItem(name).should('not.have.class', 'Mui-disabled');
    return this;
  }

  assertMenuItemDisabled(name) {
    L.menuItem(name).should('have.class', 'Mui-disabled');
    return this;
  }

  clickMenuItem(name) {
    L.menuItem(name).click();
    return this;
  }

  assertNoEditAction() {
    L.menu().should('not.contain.text', 'Edit');
    return this;
  }

  // ── Cancel dialog ───────────────────────────────────────────────────────

  assertCancelDialogCopy() {
    L.cancelDialogTitle().should('be.visible');
    L.cancelDialog()
      .should('contain.text', 'Anything workers have already scanned is kept')
      .and('contain.text', 'No inventory is changed');
    return this;
  }

  keepAudit() {
    L.keepAuditButton().click();
    L.cancelDialog().should('not.exist');
    return this;
  }

  confirmCancel() {
    L.confirmCancelButton().click();
    return this;
  }

  // ── Toasts ──────────────────────────────────────────────────────────────
  // Selector rationale (two roles, MUI Alerts excluded) lives in
  // support/locators/InventoryAudit/auditToastLocators.js.

  assertToast(pattern) {
    T.toastText().should('match', pattern);
    return this;
  }

  assertNoToastMatching(pattern) {
    T.toastText().should('not.match', pattern);
    return this;
  }
}

export default AuditsListPage;
