import data from '../fixtures/warehouseLocationReportData.json';
import warehouseLocationReportLocators from '../support/locators/warehouseLocationReportLocators';
import urls from '../fixtures/urls.json';

// Page object for the Warehouse Location Report screen.
//
// The three report routes share the `warehouse-location-report` prefix, so the
// list intercept must NOT also swallow the /product-items and /export requests.
// RegExp matchers keep them distinct: the list matcher anchors on the prefix
// being immediately followed by `?` (query) or end-of-string, which the two
// sub-routes (`/product-items`, `/export`) never satisfy.
const RE_LIST = /\/reports\/warehouse-location-report(\?|$)/;
const RE_ITEMS = /\/reports\/warehouse-location-report\/product-items/;
const RE_EXPORT = /\/reports\/warehouse-location-report\/export/;

class WarehouseLocationReportPage {
  constructor() {
    this.loc = warehouseLocationReportLocators;
    this.alias = data.aliases;
  }

  // ── API interception ────────────────────────────────────────────────────────
  interceptApis() {
    cy.intercept({ method: 'GET', url: RE_ITEMS }).as(this.alias.productItems);
    cy.intercept({ method: 'GET', url: RE_EXPORT }).as(this.alias.export);
    cy.intercept({ method: 'GET', url: RE_LIST }).as(this.alias.list);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  // Visit the report and drain the initial list request. index.tsx disables the
  // search box + all three Selects while isLoading||isRefetching||isDownloading,
  // and a background revalidation can re-flip those flags a tick after the first
  // request settles (same pattern the Asset Lifecycle Report page object
  // documents), so a short settle buffer AFTER the real network wait gives React
  // time to re-enable the controls before a test's first interaction.
  visit() {
    this.interceptApis();
    cy.visit(urls.warehouseLocationReport);
    return cy.wait(`@${this.alias.list}`, { timeout: 60000 }).then((interception) => {
      cy.wait(300, { log: false });
      return cy.wrap(interception, { log: false });
    });
  }

  waitForList() {
    return cy.wait(`@${this.alias.list}`, { timeout: 60000 });
  }

  // Race-proof param assertion. index.tsx's useQuery can fire several list
  // requests around one interaction (pagination reset + refetch + a background
  // revalidation), so a bare cy.wait().its('request.url') can read a stale one.
  // Assert on the LATEST captured request instead — cy.get('@alias.all') inside
  // a retrying .should() re-reads until the most recent request satisfies the
  // matcher, which is the one produced by the action just performed.
  assertLastListUrl(matcher) {
    return cy.get(`@${this.alias.list}.all`).should((calls) => {
      expect(calls.length, 'at least one list request was made').to.be.greaterThan(0);
      matcher(calls[calls.length - 1].request.url);
    });
  }

  // ── Search ──────────────────────────────────────────────────────────────────
  // index.tsx disables the search box (like the Selects) while
  // isLoading||isRefetching||isDownloading, and a React-Query background refetch
  // can hold it disabled for several seconds after mount. Give clear()/type()
  // (and the Search button) a generous actionability timeout so Cypress waits
  // the disabled window out instead of failing at the 8s default.
  search(term) {
    this.loc.searchInput().clear({ timeout: 30000 }).type(term, { timeout: 30000, delay: 0 });
    this.loc.searchButton().should('not.be.disabled').click({ timeout: 30000 });
    return this.waitForList();
  }

  clearSearchViaBackspace() {
    // Emptying the box while a search is applied triggers index.tsx's onChange
    // reset (refetch to the unfiltered set) — no Search-button click needed.
    this.loc.searchInput().clear({ timeout: 30000 });
    return this.waitForList();
  }

  // ── Filter Selects ────────────────────────────────────────────────────────────
  // index.tsx disables all three Selects (Mui-disabled / aria-disabled) whenever
  // isLoading||isRefetching||isDownloading is true, and React Query flickers
  // isRefetching around mount. Cypress fires clicks on an aria-disabled <div>
  // but MUI swallows them, so the menu never opens. Wait for the Select to be
  // enabled, click, then verify the listbox actually appeared — retry if a
  // background refetch re-disabled it in the gap.
  // The click is issued exactly once, then a retrying assertion waits for the
  // portalled listbox. The earlier version re-CLICKED on each retry, which could
  // oscillate: if the first click had in fact opened the menu but the portal had
  // not painted by the time the synchronous `.then` inspected the DOM, the retry
  // clicked again and closed it — and so on. `.should('exist')` retries the
  // *query*, not the action, so a slow paint resolves instead of toggling.
  openSelect(locFn) {
    locFn().should('not.have.class', 'Mui-disabled').click();
    return cy.get('[role="listbox"]', { timeout: 30000 }).should('exist');
  }

  selectProductType(value) {
    this.openSelect(this.loc.productTypeSelect);
    this.loc.option(value).click();
    return this.waitForList();
  }

  selectAssignment(value) {
    this.openSelect(this.loc.assignmentSelect);
    this.loc.option(value).click();
    return this.waitForList();
  }

  // Open the Category select and choose the first concrete category (skips the
  // "all" option). Yields the chosen category id so the caller can assert the
  // request carried it.
  selectFirstConcreteCategory() {
    this.openSelect(this.loc.categorySelect);
    return cy
      .get('[role="listbox"] [data-value]')
      .not('[data-value="all"]')
      .first()
      .then(($opt) => {
        const id = $opt.attr('data-value');
        cy.wrap($opt).click();
        return this.waitForList().then(() => id);
      });
  }

  // ── Expand / detail panel ─────────────────────────────────────────────────────
  expandRowContaining(text) {
    this.loc.expandButtonInRow(text).click();
    return cy.wait(`@${this.alias.productItems}`, { timeout: 60000 });
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  triggerExport() {
    this.loc.exportButton().should('not.be.disabled').click();
    return cy.wait(`@${this.alias.export}`, { timeout: 120000 });
  }

  // ── Assertions ────────────────────────────────────────────────────────────────
  assertLoaded() {
    this.loc.tableContainer().should('be.visible');
  }

  assertStatCardsVisible() {
    data.labels.statCards.forEach((title) => {
      this.loc.statCard(title).should('exist');
    });
  }

  assertRowVisible(text) {
    this.loc.rowContaining(text).should('exist');
  }

  assertRowAbsent(text) {
    // Empty/narrowed result — MRT still renders a "no records" placeholder row,
    // so assert the specific seeded stamp text is absent rather than a 0-row set.
    this.loc.tableContainer().find('tbody').should('not.contain.text', text);
  }
}

export default WarehouseLocationReportPage;
