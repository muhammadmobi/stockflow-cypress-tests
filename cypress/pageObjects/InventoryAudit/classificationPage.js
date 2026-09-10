// cypress/pageObjects/InventoryAudit/classificationPage.js
//
// Page object for /abc/classification — the module shell, the summary cards, and
// both grids (cypress/e2e/InventoryAudit/07-* and 08-*).
// Components: Frontend/src/components/ABC/{index,AbcSummaryCards,ByCategoryTab,ByProductTab}.tsx
// Test plan: cypress/qa/testPlans/inventoryAudit/sub/classification-plan.md
//
// ONE page object for the whole screen rather than one per tab: the tabs are two
// panels of a single component that share the summary cards, the category query and
// the filter state, so splitting them would mean two objects reaching into the same
// shell. Methods are grouped by surface below.

import L, {
  CATEGORY_COLUMNS,
  CLASS_OPTION,
  FILTER_INDEX,
  INHERIT_OPTION,
  PRODUCT_COLUMNS,
  SOURCE_LABEL,
  SUMMARY_CLASSES,
} from '../../support/locators/InventoryAudit/classificationLocators';
import T from '../../support/locators/InventoryAudit/auditToastLocators';

const ROUTE = '/abc/classification';

class ClassificationPage {
  // ── Shell ───────────────────────────────────────────────────────────────

  visit() {
    cy.visit(ROUTE);
    return this;
  }

  visitAndWait(alias = 'abcCategories') {
    cy.visit(ROUTE);
    cy.wait(`@${alias}`);
    return this;
  }

  assertOnRoute() {
    cy.location('pathname').should('eq', ROUTE);
    return this;
  }

  assertTabsOffered(labels) {
    labels.forEach((label) => L.tab(label).should('exist'));
    return this;
  }

  /**
   * The Automatic tab must stay absent — it is commented out in index.tsx and its
   * component is unreachable. If this starts failing, the tab was re-enabled and
   * needs its own UI coverage (plan §3.2), not a deleted assertion.
   */
  assertTabAbsent(label) {
    cy.findAllByRole('tab').each(($tab) => {
      expect($tab.text().trim().toLowerCase(), 'no tab may carry this label').to.not.eq(
        label.toLowerCase()
      );
    });
    return this;
  }

  assertSelectedTab(label) {
    L.selectedTab().should('contain.text', label);
    return this;
  }

  openTab(label) {
    L.tab(label).click();
    return this;
  }

  // ── Summary cards ───────────────────────────────────────────────────────

  assertSummaryCardPerClass() {
    SUMMARY_CLASSES.forEach((c) => L.summaryCard(c).should('exist'));
    return this;
  }

  assertSummaryCardShows(abcClass, text) {
    L.summaryCard(abcClass).should('contain.text', text);
    return this;
  }

  /**
   * The share string a card renders — "<1%", "42%", …
   *
   * `.should('match', …)` FIRST, deliberately. While the summary query is in flight
   * the card renders a Skeleton and its text is just "AClass A" — no share at all —
   * and `invoke('text')` does NOT retry, so a bare read returns '' whenever it lands
   * in that window. `cy.wait('@abcSummary')` does not help: it resolves when the
   * response is sent, one React commit before the figures appear. Asserting on the
   * text is what makes Cypress retry the invoke. Same trap, same fix, as
   * `auditsListPage.readStatCardValue`.
   */
  readSummaryShare(abcClass) {
    return L.summaryCard(abcClass)
      .invoke('text')
      .should('match', /<1%|\d+%/)
      .then((t) => {
        const m = String(t).match(/<1%|\d+%/);
        return m ? m[0] : '';
      });
  }

  /** Every card's rendered text, for reconciliation assertions. */
  readSummaryText() {
    return L.summaryCards().then(($cards) =>
      Cypress._.map($cards.toArray(), (el) => Cypress.$(el).text())
    );
  }

  // ── Grid basics (shared by both tabs) ───────────────────────────────────

  assertCategoryColumns() {
    CATEGORY_COLUMNS.forEach((name, i) => L.columnHeaders().eq(i).should('contain.text', name));
    return this;
  }

  assertProductColumns() {
    PRODUCT_COLUMNS.forEach((name) => {
      L.columnHeaders().should('contain.text', name);
    });
    return this;
  }

  assertRowCount(count) {
    L.rows().should('have.length', count);
    return this;
  }

  assertRowCountAtLeast(count) {
    L.rows().should('have.length.at.least', count);
    return this;
  }

  /** Column values top-to-bottom, trimmed. */
  readColumn(columnName, columns) {
    const index = columns.indexOf(columnName);
    return L.rows().then(($rows) =>
      Cypress._.map($rows.toArray(), (tr) => Cypress.$(tr).find('td').eq(index).text().trim())
    );
  }

  // ── By Category ─────────────────────────────────────────────────────────

  assertCategoryHint() {
    L.categoryHint().should('be.visible');
    return this;
  }

  assertCategoryLoadError() {
    L.categoryLoadError().should('be.visible');
    L.table().should('not.exist');
    return this;
  }

  assertCategoryFooter(pattern) {
    L.categoryFooter().invoke('text').should('match', pattern);
    return this;
  }

  assertOverridesCell(rowIndex, text) {
    L.overridesCell(rowIndex).should('contain.text', text);
    return this;
  }

  /** Hover the override-count chip and read its explanatory tooltip. */
  assertOverridesTooltip(rowIndex, pattern) {
    L.overridesCell(rowIndex).find('.MuiChip-root').trigger('mouseover');
    cy.findByRole('tooltip').invoke('text').should('match', pattern);
    return this;
  }

  /** The option labels a category's class control offers, menu closed after. */
  readCategoryClassOptions(rowIndex) {
    L.categoryClassSelect(rowIndex).click();
    return L.openOptionList()
      .find('[role="option"]')
      .then(($o) => Cypress._.map($o.toArray(), (el) => Cypress.$(el).text().trim()))
      .then((labels) => {
        cy.get('body').type('{esc}');
        L.openOptionList().should('not.exist');
        // cy.wrap, not a bare return — queueing commands then returning a value
        // synchronously is the "mixing async and sync code" error.
        return cy.wrap(labels, { log: false });
      });
  }

  setCategoryClass(rowIndex, abcClass) {
    L.categoryClassSelect(rowIndex).click();
    L.option(CLASS_OPTION(abcClass)).click();
    return this;
  }

  /**
   * Set the class on the row for a named category — the live-round-trip form of
   * `setCategoryClass`, which addresses by index.
   */
  setCategoryClassByName(name, abcClass) {
    L.categoryClassSelectByName(name).click();
    L.option(CLASS_OPTION(abcClass)).click();
    return this;
  }

  assertCategoryClass(rowIndex, abcClass) {
    L.categoryClassSelect(rowIndex).should('contain.text', `Class ${abcClass}`);
    return this;
  }

  // ── By Product ──────────────────────────────────────────────────────────

  /**
   * Choose one of the By-Product filter selects by NAME, not by index.
   *
   * The three filters (category, class, source) are unlabelled MUI selects, so
   * their position is the only handle the DOM offers — but that index belongs in
   * the locator layer, not in a spec. `FILTER_INDEX` keeps the mapping in one
   * place, so a fourth filter added to the row is a one-line change here rather
   * than a hunt through `.eq(1)` / `.eq(2)` calls across two spec files.
   */
  selectProductFilter(filter, optionName) {
    L.productFilter(FILTER_INDEX[filter]).click();
    L.option(optionName).click();
    return this;
  }

  searchProducts(term) {
    L.productSearchInput().clear().type(term, { delay: 0 });
    // The search commits on submit, like the audits list.
    L.productSearchInput().type('{enter}');
    return this;
  }

  assertProductCell(rowIndex, columnName, text) {
    L.productCell(rowIndex, columnName).should('contain.text', text);
    return this;
  }

  assertSourceChip(rowIndex, source) {
    L.productCell(rowIndex, 'Effective class').should('contain.text', SOURCE_LABEL[source]);
    return this;
  }

  /** The override control's options, including the inherit option. */
  readOverrideOptions(rowIndex) {
    L.overrideSelect(rowIndex).click();
    return L.openOptionList()
      .find('[role="option"]')
      .then(($o) => Cypress._.map($o.toArray(), (el) => Cypress.$(el).text().trim()))
      .then((labels) => {
        cy.get('body').type('{esc}');
        L.openOptionList().should('not.exist');
        return cy.wrap(labels, { log: false });
      });
  }

  setOverride(rowIndex, abcClass) {
    L.overrideSelect(rowIndex).click();
    L.option(CLASS_OPTION(abcClass)).click();
    return this;
  }

  clearOverride(rowIndex) {
    L.overrideSelect(rowIndex).click();
    L.option(INHERIT_OPTION).click();
    return this;
  }

  /**
   * Wait until the grid has rendered exactly `count` rows.
   *
   * Needed before select-all on a large page: MRT's select-all acts on its row
   * MODEL, so clicking while the body is still rendering selects nothing at all
   * and the bulk bar never appears — which reads as a select-all failure. This
   * grid is not virtualised, so a 1001-row page legitimately exceeds the default
   * command timeout; the caller passes its own.
   */
  assertProductRowsRendered(count, options = {}) {
    L.rows(options).should('have.length', count);
    return this;
  }

  /** Check MRT's header select-all box. */
  selectAllRows() {
    L.selectAllCheckbox().check({ force: true });
    return this;
  }

  selectRow(rowIndex) {
    L.rowCheckbox(rowIndex).check({ force: true });
    return this;
  }

  assertBulkBarSelected(count, options) {
    L.bulkSelectedCount(options).should('contain.text', `${count} selected`);
    return this;
  }

  assertBulkBarAbsent() {
    cy.contains(/^\d+ selected$/).should('not.exist');
    return this;
  }

  /** `options` reaches the locator — see the note on `bulkClassSelect`. */
  chooseBulkClass(abcClass, options = {}) {
    L.bulkClassSelect(options).click();
    L.option(CLASS_OPTION(abcClass)).click();
    return this;
  }

  assertBulkApplyDisabled() {
    L.bulkApplyButton().should('be.disabled');
    return this;
  }

  assertBulkApplyEnabled() {
    L.bulkApplyButton().should('not.be.disabled');
    return this;
  }

  applyBulk() {
    L.bulkApplyButton().click();
    return this;
  }

  clearBulkOverrides() {
    L.bulkClearButton().click();
    return this;
  }

  // ── Toasts ──────────────────────────────────────────────────────────────

  assertToast(pattern) {
    T.toastText().should('match', pattern);
    return this;
  }
}

export default ClassificationPage;
