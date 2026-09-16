import data from '../fixtures/inventoryReportData.json';
import inventoryReportLocators from '../support/locators/inventoryReportLocators';
import urls from '../fixtures/urls.json';

class InventoryReportPage {
  constructor() {
    this.loc = inventoryReportLocators;
  }

  // ── API interception ────────────────────────────────────────────────────────

  interceptApis() {
    cy.intercept('GET', data.apis.poList).as(data.aliases.poList);
    cy.intercept('GET', data.apis.columnConfig).as(data.aliases.columnConfig);
    cy.intercept('GET', data.apis.tableItems).as(data.aliases.tableItems);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  // Waits for the three independent queries the page fires on mount
  // (tableItems, poList, columnConfig) each exactly once — unlike Cost
  // Report's PoList, this screen's PoList is not given `selectDefaultValue`,
  // so no PO auto-selects and no second tableItems refetch is triggered by
  // it (see plan.md §6.6.3 — selectedPo stays null until the user acts).
  visit() {
    this.interceptApis();
    cy.visit(urls.inventoryReport);
    cy.wait(`@${data.aliases.tableItems}`);
    cy.wait(`@${data.aliases.poList}`);
    cy.wait(`@${data.aliases.columnConfig}`);
    // The 3 mount queries resolving doesn't mean the filter controls are
    // interactive yet — MUI keeps them aria-disabled for a beat afterward
    // while the grid finishes its own render pass. A click that lands during
    // that window is silently swallowed (no listbox opens, no error), so
    // callers that click a filter control immediately after visit() need this
    // settled before they can rely on the click actually doing anything.
    this.loc.statusSelect().should('not.have.attr', 'aria-disabled', 'true');
  }

  // ── As-of Date ───────────────────────────────────────────────────────────────

  selectAsOfPreset(label) {
    this.loc.asOfPresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.asOfPresetOption(label).click();
    if (label.toLowerCase() !== 'custom') return cy.wait(`@${data.aliases.tableItems}`);
    return cy.wrap(null, { log: false });
  }

  // Opens Custom, then picks `dayNumber` in the current month's calendar for
  // the single "As-of Date" picker.
  selectCustomAsOfDate(dayNumber) {
    this.selectAsOfPreset('Custom');
    this.loc.asOfDatePickerGroup().find('button[aria-label="Choose date"]').should('not.be.disabled').click();
    cy.get('button.MuiPickersDay-root').should('have.length.greaterThan', 0);
    cy.get('button.MuiPickersDay-root').not('[disabled]').contains(new RegExp(`^${dayNumber}$`)).click();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  clearAsOfDate() {
    this.loc.asOfClearButton().first().click();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  getAsOfPresetValue() {
    return this.loc.asOfPresetSelect().invoke('text');
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  selectCategory(categoryId) {
    this.loc.categorySelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.categoryOption(String(categoryId)).click();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  selectPo(poValue, { settle = true } = {}) {
    // react-select keeps its <input> at opacity:0; type on the container
    // itself (matches CostReportPage.js / IncomingInvPage.js convention).
    cy.get('#Incomming-inventory-P-O-1').click().type(poValue);
    this.loc.poDropdownOption(poValue).click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  selectStatus(value, { settle = true } = {}) {
    this.loc.statusSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.statusOption(value).click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  search(term, { settle = true } = {}) {
    this.loc.searchInput().should('not.be.disabled').clear().type(term);
    this.loc.searchButton().click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  // Clearing the box (not a second Search click) auto-resets once a search
  // has previously been submitted — same auto-reset contract Cost Report's
  // TC33 documents; this screen implements its own handler so it is
  // verified independently (plan.md §9.2 SW-IR-TC31).
  clearSearch() {
    this.loc.searchInput().clear();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Table ───────────────────────────────────────────────────────────────────

  getTableRows() {
    return this.loc.tableRows();
  }

  // Same markup/locator as the ungrouped table — grouping swaps columns, not
  // the container (matches CostReportPage.js's identical convention).
  getGroupedTableRows() {
    return this.loc.tableRows();
  }

  clickColumnHeader(headerText) {
    this.loc.tableHeaderCell(headerText).click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  clickFirstProductNameLink() {
    this.loc.tableRows().first().find('td').first().find('span').click();
  }

  // ── Pagination ──────────────────────────────────────────────────────────────

  getPaginationSummary() {
    return this.loc.paginationSummary().invoke('text');
  }

  goToNextPage() {
    this.loc.nextPageButton().click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  changePageSize(value) {
    this.loc.pageSizeDropdown().click();
    this.loc.pageSizeOption(value).click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  // Left half of the split-button — directly triggers handleInventoryReportDownload
  // (a no-op when selectedPo has never been touched — plan.md §6.6.3).
  clickExportButton() {
    this.loc.exportButton().should('not.be.disabled').click();
  }

  openExportMenu() {
    this.loc.exportMenuChevron().should('not.be.disabled').click();
  }

  clickExportReportMenuItem() {
    this.openExportMenu();
    this.loc.exportReportMenuItem().click();
  }

  clickExportGroupedMenuItem() {
    this.openExportMenu();
    this.loc.exportGroupedMenuItem().click();
  }

  // ── Group By ────────────────────────────────────────────────────────────────

  // NOTE: once the listbox is open, MUI's aria-labelledby wiring makes the
  // listbox itself also match "Group By" — close via an unrelated stable
  // element (the stat card) instead of re-querying the label (same gotcha
  // documented in CostReportPage.js).
  selectGroupByField(fieldLabel) {
    cy.intercept('GET', data.apis.groupedTableItems).as(data.aliases.groupedTableItems);
    this.loc.groupByInput().click();
    this.loc.groupByOption(fieldLabel).click();
    this.loc.totalEndingInventoryCostCard().click();
    return cy.wait(`@${data.aliases.groupedTableItems}`);
  }

  getGroupingChips() {
    return cy.get('[class*="MuiChip-root"]');
  }

  // ── Column Customization ───────────────────────────────────────────────────

  openCustomizeColumns() {
    this.loc.customizeColumnsButton().click();
  }

  deselectColumnAndSave(columnName) {
    this.loc.columnLabel(columnName).find('input[type="checkbox"]').click({ force: true });
    this.loc.customizeColumnsSaveButton().click();
    cy.contains(/Columns setting for category/i).should('not.exist');
  }

  // Core report columns (Product Name, Total Inventory Cost, Avg Cost, PO
  // Cost) have no checkbox in the attribute grid — they only exist as a
  // deletable chip in the "Selected Columns" row, and removing the chip is
  // one-way (no checkbox to re-check afterward). Use this for those columns;
  // use deselectColumnAndSave (checkbox toggle) for attribute-backed columns
  // like Category, which can be re-checked to restore.
  removeCoreColumnAndSave(columnName) {
    this.loc.selectedColumnChip(columnName).find('.MuiChip-deleteIcon').click({ force: true });
    this.loc.customizeColumnsSaveButton().click();
    cy.contains(/Columns setting for category/i).should('not.exist');
  }

  // Downloads a file matching `filePattern` from cypress/downloads (clearing
  // any stale match first, since Cypress only wipes that folder once per
  // whole run — see CostReportTests.cy.js's identical convention) and
  // returns the parsed workbook ({ sheets }) via parseExcelBuffer. Callers
  // must trigger the download themselves inside `triggerDownload` — this
  // only owns the clear -> wait-for-file -> read -> parse plumbing, shared
  // across every export-content-verification TC (flat + grouped).
  downloadAndParseWorkbook(filePattern, triggerDownload) {
    cy.task('clearMatchingFiles', { folderPath: 'cypress/downloads', filePattern });
    triggerDownload();
    // cy.task() isn't re-invoked by a chained .should() retry — the task runs
    // once and .should() just keeps re-asserting on that same resolved value
    // (this is why a plain checkFileExists + .should('not.be.null') always
    // failed after ~40s regardless of the timeout passed to cy.task(), even
    // though the file reliably lands a few seconds later on this QA env's
    // slower export generation). waitForMatchingFile polls internally.
    return cy
      .task('waitForMatchingFile', { folderPath: 'cypress/downloads', filePattern, timeoutMs: 90000 }, { timeout: 95000 })
      .should('not.be.null')
      .then((filePath) => cy.readFile(filePath, 'base64'))
      .then((base64Data) => cy.task('parseExcelBuffer', { base64Data }));
  }

  // ── Mobile ────────────────────────────────────────────────────────────────

  getMobileCards() {
    return this.loc.mobileCards();
  }

  // ── Assertion helpers ───────────────────────────────────────────────────────

  verifyStatCard(totalInventoryValue) {
    if (totalInventoryValue == null) return;
    const numeric = parseFloat(totalInventoryValue);
    if (isNaN(numeric)) return;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
    this.loc.totalEndingInventoryCostValue().should('contain.text', formatted);
  }

  readStatCardValue() {
    return this.loc.totalEndingInventoryCostValue().invoke('text').then((text) => this._parseCurrency(text));
  }

  // Authoritative on-screen "Total Ending Inventory Cost" read for a given
  // filter combination. Waits for the specific tableItems interception whose
  // REQUEST URL carries every applied filter (po/search/status/startDate/
  // endDate — a filter left null/undefined is "don't care"), then
  // .should()-retries until the rendered card catches up to that response's
  // summary — mirrors CostReportPage.js's readSettledTotal, generalized for
  // this screen's extra As-of Date params.
  readSettledTotal({ po, search, status, startDate, endDate } = {}) {
    const want = {
      po: po != null ? String(po) : null,
      search: search != null ? String(search).trim().toLowerCase() : null,
      status: status != null ? String(status) : null,
      startDate: startDate != null ? String(startDate) : null,
      endDate: endDate != null ? String(endDate) : null,
    };

    const matches = (all) => {
      for (let i = all.length - 1; i >= 0; i--) {
        const it = all[i];
        if (!it || !it.response || it.response.body == null) continue;
        const p = new URL(it.request.url).searchParams;
        if (want.po != null && p.get('po') !== want.po) continue;
        if (want.search != null && (p.get('search') || '').trim().toLowerCase() !== want.search) continue;
        if (want.status != null && p.get('status') !== want.status) continue;
        // The FE sends full-day ISO bounds (startDate=YYYY-MM-DDT00:00:00.000Z,
        // endDate=YYYY-MM-DDT23:59:59.999Z), not the bare YYYY-MM-DD callers
        // pass in — compare only the date portion.
        if (want.startDate != null && (p.get('startDate') || '').slice(0, 10) !== want.startDate) continue;
        if (want.endDate != null && (p.get('endDate') || '').slice(0, 10) !== want.endDate) continue;
        return it;
      }
      return undefined;
    };

    const alias = `@${data.aliases.tableItems}.all`;
    return cy
      .get(alias)
      .should((all) => {
        expect(
          matches(all),
          `a settled tableItems response matching po=${want.po} search=${want.search} status=${want.status} startDate=${want.startDate} endDate=${want.endDate} must exist`
        ).to.exist;
      })
      .then((all) => {
        const settled = matches(all);
        const raw = settled.response.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const expected = parseFloat(body?.data?.summary?.totalInventoryValue ?? NaN);
        expect(expected, 'API must return a numeric data.summary.totalInventoryValue').to.be.a('number').and.not.be.NaN;

        this.loc.totalEndingInventoryCostValue().should(($el) => {
          const domVal = this._parseCurrency($el.text());
          expect(domVal, `rendered card must equal the settled API summary (${expected})`).to.be.closeTo(expected, 0.5);
        });
        return cy.wrap(expected, { log: false });
      });
  }

  _parseCurrency(text) {
    const match = String(text).replace(/,/g, '').match(/-?\$?\d+(\.\d+)?/);
    return match ? parseFloat(match[0].replace('$', '')) : NaN;
  }
}

export default InventoryReportPage;
