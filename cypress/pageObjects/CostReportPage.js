import data from '../fixtures/costReportData.json';
import costReportLocators from '../support/locators/costReportLocators';
import urls from '../fixtures/urls.json';

class CostReportPage {
  constructor() {
    this.loc = costReportLocators;
  }

  // ── API interception ────────────────────────────────────────────────────────

  interceptApis() {
    cy.intercept('GET', data.apis.poList).as(data.aliases.poList);
    cy.intercept('GET', data.apis.columnConfig).as(data.aliases.columnConfig);
    cy.intercept('GET', data.apis.tableItems).as(data.aliases.tableItems);
  }

  interceptApisAndVerifyStatus() {
    cy.intercept('GET', data.apis.poList, (req) => {
      req.continue((res) => {
        expect(res.statusCode).to.eq(200);
      });
    }).as(data.aliases.poList);

    cy.intercept('GET', data.apis.columnConfig, (req) => {
      req.continue((res) => {
        expect(res.statusCode).to.eq(200);
      });
    }).as(data.aliases.columnConfig);

    cy.intercept('GET', data.apis.tableItems, (req) => {
      req.continue((res) => {
        expect(res.statusCode).to.eq(200);
      });
    }).as(data.aliases.tableItems);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  visit() {
    this.interceptApis();
    cy.visit(urls.costReport);
    cy.wait(`@${data.aliases.tableItems}`);
    cy.wait(`@${data.aliases.poList}`);
    // The page fires a second tableItems request after the PO list resolves;
    // wait for it so the search input is enabled before any interaction.
    cy.wait(`@${data.aliases.tableItems}`);
  }

  visitAndVerifyApiStatus() {
    // Use plain intercepts (no req.continue response handler) to avoid a known
    // Cypress aliasing edge case: with req.continue((res) => {...}), the alias
    // may not be released to cy.wait() predictably when multiple requests are
    // in-flight simultaneously. Status codes are asserted in .its() instead.
    this.interceptApis();
    cy.visit(urls.costReport);
    cy.wait(`@${data.aliases.tableItems}`).its('response.statusCode').should('eq', 200);   // 1st
    cy.wait(`@${data.aliases.poList}`).its('response.statusCode').should('eq', 200);
    cy.wait(`@${data.aliases.columnConfig}`).its('response.statusCode').should('eq', 200);
    // The page fires a second tableItems request after the PO list resolves;
    // this is the call that actually drives the rendered UI, so assert it too.
    cy.wait(`@${data.aliases.tableItems}`).its('response.statusCode').should('eq', 200);   // 2nd
  }

  // Visits the page and captures the first product from the settled tableItems
  // response. Waits for: 1st tableItems → poList → 2nd tableItems (captures here).
  // The 2nd response fires after column-config resolves and is the one the UI
  // actually renders; the search input is also enabled at this point.
  visitAndCaptureFirstProduct() {
    this.interceptApis();
    cy.visit(urls.costReport);
    cy.wait(`@${data.aliases.tableItems}`);   // 1st – discard, page still initialising
    cy.wait(`@${data.aliases.poList}`);
    cy.wait(`@${data.aliases.tableItems}`).then((interception) => {
      const raw = interception?.response?.body;
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const list = body?.data?.list;
      this._firstProduct = list && list.length ? list[0] : null;
    });
  }

  // Asserts that every row in the named column contains `expectedText`
  // (case-insensitive). Finds the column index dynamically from the header row
  // so the assertion survives column reordering.
  // maxRows — optional cap on how many rows to check. Defaults to all rows.
  //            Pass list.length from the API response to avoid asserting rows
  //            that may have re-rendered or never existed in the snapshot.
  assertColumnContains(headerText, expectedText, maxRows) {
    cy.get('.MuiTableContainer-root').first().find('thead th').then(($headers) => {
      const colIndex = [...$headers].findIndex((th) =>
        th.textContent.trim().toLowerCase().includes(headerText.toLowerCase())
      );
      expect(colIndex, `Column "${headerText}" must be visible in the table`).to.be.gte(0);

      // Re-query tbody rows by index on every iteration so we never hold a
      // stale DOM reference across React re-renders.
      cy.get('.MuiTableContainer-root').first().find('tbody tr').then(($rows) => {
        const limit = maxRows != null ? Math.min($rows.length, maxRows) : $rows.length;
        for (let i = 0; i < limit; i++) {
          cy.get('.MuiTableContainer-root').first()
            .find('tbody tr').eq(i)
            .find('td').eq(colIndex)
            .invoke('text')
            .should('match', new RegExp(Cypress._.escapeRegExp(expectedText), 'i'));
        }
      });
    });
  }

  // Token-aware column assertion for free-text search results. The backend
  // search is tokenized (splits on spaces, each token must ILIKE-match the row;
  // see reports.service.ts generateSearchConditions), so a returned row need not
  // contain the contiguous search phrase in the named column. This asserts that
  // every checked row's cell in `headerText` contains AT LEAST ONE token of the
  // search term — the strongest per-column claim that holds for tokenized AND
  // search (the full per-row token coverage is asserted on the API body in the
  // body-shape tests). Re-queries DOM by index to avoid stale refs.
  assertColumnContainsAnyToken(headerText, term, maxRows) {
    const tokens = term.toLowerCase().split(/\s+/).filter(Boolean);
    cy.get('.MuiTableContainer-root').first().find('thead th').then(($headers) => {
      const colIndex = [...$headers].findIndex((th) =>
        th.textContent.trim().toLowerCase().includes(headerText.toLowerCase())
      );
      expect(colIndex, `Column "${headerText}" must be visible in the table`).to.be.gte(0);
      cy.get('.MuiTableContainer-root').first().find('tbody tr').then(($rows) => {
        const limit = maxRows != null ? Math.min($rows.length, maxRows) : $rows.length;
        for (let i = 0; i < limit; i++) {
          cy.get('.MuiTableContainer-root').first()
            .find('tbody tr').eq(i)
            .find('td').eq(colIndex)
            .invoke('text')
            .should((cellText) => {
              const lc = cellText.toLowerCase();
              const matched = tokens.some((tok) => lc.includes(tok));
              expect(matched, `Row ${i} "${headerText}" cell "${cellText.trim()}" must contain at least one token of "${term}"`).to.be.true;
            });
        }
      });
    });
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  // Types the term, clicks Search, and resolves with the SETTLED tableItems
  // interception from the wait itself. Callers that need the response body must
  // use this return value rather than a separate cy.get('@alias') — the page
  // fires the search request more than once, so a re-fetched alias can resolve
  // to a later, still-in-flight interception whose `response` is undefined
  // (observed as a flaky `data.list === undefined` in the body-shape tests).
  // settle:false skips the internal cy.wait on the broad tableItems alias — used
  // by readTotalAfterReload for the LAST filter action, whose request is instead
  // captured by a params-scoped intercept (see readTotalAfterReload).
  search(term, { settle = true } = {}) {
    this.loc.searchInput().should('not.be.disabled').clear().type(term);
    this.loc.searchButton().click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }


  // ── Date Range ──────────────────────────────────────────────────────────────

  selectDatePreset(label) {
    this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.dateRangePresetOption(label).click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  getDatePresetValue() {
    return this.loc.dateRangePresetSelect().invoke('text');
  }

  // Custom valid range: (today − 1) → today. Both days are guaranteed to be
  // within the current calendar month and not blocked by maxDate=today.
  // Guard: on the 1st of the month there are no two distinct available days
  // in the current month — logs and returns without selecting.
  selectCustomDateRange() {
    const today    = new Date();
    const todayDay = today.getDate();
    if (todayDay === 1) {
      cy.log('⚠  selectCustomDateRange: today is the 1st — no two available days in the current month; skipping date selection');
      return;
    }
    this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.dateRangePresetOption('Custom').click();
    this._pickDay(this.loc.startDatePickerGroup(), todayDay - 1);
    // Wait for the API triggered by the start date selection to settle,
    // then the end picker's calendar icon becomes enabled.
    cy.wait(`@${data.aliases.tableItems}`);
    this._pickDay(this.loc.endDatePickerGroup(), todayDay);
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // Same-day range: both pickers set to the same day (yesterday, or today on
  // the 1st of the month). Using yesterday keeps the day safely in the past;
  // on the 1st, today (day 1) is the only available option.
  selectSameDayRange() {
    const today = new Date();
    const day   = today.getDate() > 1 ? today.getDate() - 1 : 1;
    this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.dateRangePresetOption('Custom').click();
    this._pickDay(this.loc.startDatePickerGroup(), day);
    cy.wait(`@${data.aliases.tableItems}`);
    this._pickDay(this.loc.endDatePickerGroup(), day);
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // Opens the calendar for the given picker group, waits for it to render,
  // and clicks the day whose visible text matches dayNumber.
  _pickDay(group, dayNumber) {
    // Ensure the calendar icon is enabled before clicking
    group.find('button[aria-label="Choose date"]').should('not.be.disabled').click();
    cy.get('button.MuiPickersDay-root').should('have.length.greaterThan', 0);
    cy.get('button.MuiPickersDay-root')
      .not('[disabled]')
      .contains(new RegExp(`^${dayNumber}$`))
      .click();
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  // All three filter setters RETURN the settled tableItems interception so a
  // caller (readTotalAfterReload) can read the authoritative summary from the
  // LAST-applied filter's response rather than a re-fetched, possibly-stale
  // `cy.get('@alias')`.
  selectCategory(categoryId) {
    this.loc.categorySelect().click();
    this.loc.categoryOption(String(categoryId)).click();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  selectPo(poValue, { settle = true } = {}) {
    // Click the container to open the react-select menu, then type directly on
    // the container element. react-select keeps its inner <input> at opacity:0
    // at all times, so targeting it requires force:true which masks real
    // interactability problems. Typing on the container itself works without
    // force and matches the pattern used in IncomingInvPage.js.
    cy.get('#Incomming-inventory-P-O-1').click().type(poValue);
    this.loc.poDropdownOption(poValue).click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  selectStatus(value, { settle = true } = {}) {
    // The MUI Status <Select> is `disabled` while any query is in flight
    // (isLoading||isRefetching||isDownloading). Clicking it while disabled
    // silently no-ops and the option never opens — the cause of the
    // "Unable to find option /Missing/i" timeouts in the lifecycle TCs. Wait
    // for it to be enabled (aria-disabled absent) before opening it.
    this.loc.statusSelect()
      .should('not.have.attr', 'aria-disabled', 'true')
      .click();
    this.loc.statusOption(value).click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  // ── Table ───────────────────────────────────────────────────────────────────

  getTableRows() {
    return this.loc.tableRows();
  }

  // ── Pagination ──────────────────────────────────────────────────────────────

  getPaginationSummary() {
    return this.loc.paginationSummary().invoke('text');
  }

  getNextPageButton() {
    return this.loc.nextPageButton();
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

  getPageSizeDropdownValue() {
    return this.loc.pageSizeDropdown().invoke('text');
  }


  // ── Export ──────────────────────────────────────────────────────────────────

  // Clicks the main Export button which directly triggers the report download.
  clickExportReport() {
    this.loc.exportMenuButton().should('not.be.disabled').click();
  }

  // ── Group By ────────────────────────────────────────────────────────────────

  // Opens the Group By Autocomplete, clicks `fieldLabel`, then closes the
  // dropdown and waits for the grouped endpoint to settle.
  // NOTE: once the listbox is open, MUI's aria-labelledby wiring makes the
  // listbox itself ALSO match the "Group By" accessible-name query (both the
  // <input> and the open <ul role="listbox"> resolve to the same label) —
  // re-querying groupByInput() at that point throws "multiple elements
  // found". Close via a stable, unambiguous element instead (the stat card).
  selectGroupByField(fieldLabel) {
    cy.intercept('GET', data.apis.groupedTableItems).as(data.aliases.groupedTableItems);
    this.loc.groupByInput().click();
    this.loc.groupByOption(fieldLabel).click();
    this.loc.totalInventoryCostCard().click();
    return cy.wait(`@${data.aliases.groupedTableItems}`);
  }

  getGroupedTableRows() {
    return this.loc.tableRows();
  }

  // ── Column Customization ───────────────────────────────────────────────────

  openCustomizeColumns() {
    this.loc.customizeColumnsButton().click();
  }

  // Unchecks `columnName` in the open Customize Columns modal and saves.
  // Saving POSTs/PATCHes /configs and calls configRefetch() — it does NOT
  // re-fetch the table's row data (only which columns render changes), so
  // there is no tableItems request to wait on here. The modal closes itself
  // (onSave -> customColumnRef.current.closeModal()) once the save mutation
  // resolves — that's the reliable completion signal; the caller's own
  // `should()` on the header row retries for the resulting DOM update.
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

  // ── Sorting ─────────────────────────────────────────────────────────────────

  clickColumnHeader(headerText) {
    this.loc.tableHeaderCell(headerText).click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Assertion helpers ───────────────────────────────────────────────────────

  // Formats `totalExpectedValue` as USD currency and asserts the stat card
  // contains that text. Skips gracefully when the value is absent.
  // Coerces string values (PostgreSQL pg driver returns aggregates as strings).
  verifyStatCard(totalExpectedValue) {
    if (totalExpectedValue == null) return;
    const numeric = parseFloat(totalExpectedValue);
    if (isNaN(numeric)) return;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numeric);
    this.loc.totalInventoryCostCard().should('contain.text', formatted);
  }

  // ── Cost value verification (DOM read) ──────────────────────────────────────
  // Added for SW-CR-TC39-76 (plan.md §9.1/§9.2): these TCs migrate the former
  // API-oracle assertions onto the rendered page — every "actual" value below
  // is read from the DOM, never from an intercepted response body.

  // Parses the Total Inventory Cost stat card's rendered currency text into a
  // float — the inverse of verifyStatCard()'s Intl.NumberFormat formatting.
  readStatCardValue() {
    return this.loc.totalInventoryCostCard().invoke('text').then((text) => this._parseCurrency(text));
  }

  // Fresh page load, then applies (in order) a PO filter, a search term, and
  // a status filter — whichever are supplied — and resolves with the
  // on-screen Total Inventory Cost as a float. The Cost Report has no
  // auto-poll and doesn't sync filters to the URL (no useSearchParams), so
  // every "before"/"after" snapshot in the migrated oracle/lifecycle TCs goes
  // through a real reload + filter reapplication, exactly like a user
  // refreshing the page after performing an action elsewhere.
  //
  // CRITICAL — deterministic read (fixes the "base inventory cost already
  // shown" defect). The stat card renders `data.summary.totalInventoryValue`,
  // which the backend DOES scope by search/po/status. The failure was purely a
  // read RACE: after search() the FE fires the isolated request but the card
  // still shows the previous PO-level total ($375 for a 5-product PO) while it
  // is in flight (screenshot-confirmed). Reading then captured 375 instead of
  // 75 — non-deterministically. This method pins the read to the EXACT request
  // the final filter action triggers: it fires that action without an internal
  // wait, then accepts only a fresh (post-baseline) interception whose URL
  // carries every applied param, and finally .should()-retries the rendered
  // card to that request's summary — proving the DOM mirrors the server for the
  // very state under test.
  readTotalAfterReload({ po, search, status } = {}) {
    this.visit();

    const wantPo = po != null ? String(po) : null;
    const wantSearch = search != null ? String(search).trim().toLowerCase() : null;
    const wantStatus = status != null ? String(status) : null;
    const lastKey = status != null ? 'status' : search != null ? 'search' : po != null ? 'po' : null;
    if (!lastKey) return this.readSettledTotal();

    // Apply every filter EXCEPT the last, settling each on the broad tableItems
    // alias so the UI (e.g. the Search button's disabled gate) is ready for the
    // next interaction.
    if (po != null && lastKey !== 'po') this.selectPo(po);
    if (search != null && lastKey !== 'search') this.search(search);

    const alias = data.aliases.tableItems;
    const matchParams = (it) => {
      if (!it || !it.response || it.response.body == null) return false;
      const p = new URL(it.request.url).searchParams;
      if (wantPo != null && p.get('po') !== wantPo) return false;
      if (wantSearch != null && (p.get('search') || '').trim().toLowerCase() !== wantSearch) return false;
      if (wantStatus != null && p.get('status') !== wantStatus) return false;
      return true;
    };

    // Snapshot how many tableItems interceptions exist BEFORE firing the last
    // filter action. The broad alias accumulates across every read in the test,
    // so a stale same-params interception from an earlier before/after read is
    // present — this baseline index lets us ignore all of them and only accept
    // the request THIS action triggers (settle:false routes it here, not to an
    // internal wait). That stale-match-against-a-caught-up-DOM was exactly why a
    // $0 render was compared to a previous read's 1799.99.
    return cy.get(`@${alias}.all`).then((allBefore) => {
      const baseline = allBefore.length;

      if (lastKey === 'po') this.selectPo(po, { settle: false });
      else if (lastKey === 'search') this.search(search, { settle: false });
      else if (lastKey === 'status') this.selectStatus(status, { settle: false });

      return cy.get(`@${alias}.all`, { timeout: 30000 }).should((all) => {
        const fresh = all.slice(baseline).filter(matchParams);
        expect(fresh.length, 'the final filtered request must settle with a response').to.be.gte(1);
      }).then((all) => {
        const settled = all.slice(baseline).filter(matchParams).pop();
        const raw = settled.response.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const expected = parseFloat(body?.data?.summary?.totalInventoryValue ?? NaN);
        expect(expected, 'API must return a numeric data.summary.totalInventoryValue').to.be.a('number').and.not.be.NaN;

        // Confirm the rendered card caught up to THIS request's summary. Because
        // we accepted only the fresh (post-baseline) request, the DOM and this
        // value describe the same state, so it converges instead of timing out
        // against a stale snapshot.
        this.loc.totalInventoryCostCard().should(($el) => {
          const domVal = this._parseCurrency($el.text());
          expect(domVal, `rendered Total Inventory Cost must equal the settled API summary (${expected})`).to.be.closeTo(expected, 0.5);
        });
        return cy.wrap(expected, { log: false });
      });
    });
  }

  // Authoritative on-screen Total Inventory Cost read.
  //
  // The naive "last cy.wait interception" / "most recent settled" approaches
  // both failed the SAME way: after search() the FE fires the search request but
  // the table/stat card still shows the PREVIOUS (PO-level, un-searched) data
  // while the new request is in flight (confirmed by a TC59 failure screenshot:
  // search box populated, spinner spinning, table still 5 rows / $375). Reading
  // then snapshots 375 instead of the isolated 75 — and it's a RACE, so the same
  // filter reads 75 one call and 375 the next.
  //
  // Fix: wait for the specific interception whose REQUEST URL actually carries
  // every applied filter (po/search/status), retrying until it has settled, and
  // read the summary from THAT response. A filter passed as null/undefined is
  // "don't care" (so the date-range/no-filter reads still match the latest
  // load). Then .should()-retry until the rendered stat card equals that summary
  // — proving the DOM caught up to the exact request we care about. The summary
  // is already scoped server-side, so it is 0 for an isolated product with no
  // Available stock and exactly that product's cost when it has stock.
  readSettledTotal({ po, search, status } = {}) {
    const wantSearch = search != null ? String(search).trim().toLowerCase() : null;
    const wantPo = po != null ? String(po) : null;
    const wantStatus = status != null ? String(status) : null;

    const matches = (all) => {
      for (let i = all.length - 1; i >= 0; i--) {
        const it = all[i];
        if (!it || !it.response || it.response.body == null) continue;
        const params = new URL(it.request.url).searchParams;
        if (wantPo != null && params.get('po') !== wantPo) continue;
        if (wantSearch != null && (params.get('search') || '').trim().toLowerCase() !== wantSearch) continue;
        if (wantStatus != null && params.get('status') !== wantStatus) continue;
        return it;
      }
      return undefined;
    };

    const alias = `@${data.aliases.tableItems}.all`;
    // Retry cy.get('@alias.all') until an interception matching every applied
    // filter has actually settled (kills the in-flight/stale race).
    return cy.get(alias).should((all) => {
      expect(
        matches(all),
        `a settled tableItems response matching the applied filters (po=${wantPo}, search=${wantSearch}, status=${wantStatus}) must exist`
      ).to.exist;
    }).then((all) => {
      const settled = matches(all);
      const raw = settled.response.body;
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const expected = parseFloat(body?.data?.summary?.totalInventoryValue ?? NaN);
      expect(expected, 'API must return a numeric data.summary.totalInventoryValue').to.be.a('number').and.not.be.NaN;

      this.loc.totalInventoryCostCard().should(($el) => {
        const domVal = this._parseCurrency($el.text());
        expect(domVal, `rendered Total Inventory Cost must equal the settled API summary (${expected})`).to.be.closeTo(expected, 0.5);
      });
      return cy.wrap(expected, { log: false });
    });
  }

  // Shared currency-text → float parser (comma-stripping + first $-number match).
  _parseCurrency(text) {
    const match = String(text).replace(/,/g, '').match(/-?\$?\d+(\.\d+)?/);
    return match ? parseFloat(match[0].replace('$', '')) : NaN;
  }

  // Selects a custom date range with BOTH start and end set to TODAY — the UI
  // equivalent of the API's startDate=<today>&endDate=<today>. This switches
  // the backend to the inventoryMovements/historical branch even though the
  // window is "today", which the default (no-date) view never reaches.
  selectTodayRange() {
    const day = new Date().getDate();
    this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.dateRangePresetOption('Custom').click();
    this._pickDay(this.loc.startDatePickerGroup(), day);
    cy.wait(`@${data.aliases.tableItems}`);
    this._pickDay(this.loc.endDatePickerGroup(), day);
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // Opens the Custom date range but only sets the Start Date side, leaving
  // End Date empty — the EP "only one boundary set" partition (SW-CR-TC50,
  // mirrors SW-CR-API-TC26). getInventoryValueReport only switches to the
  // historical branch when BOTH startDate AND endDate are present, so this
  // must render identically to the default view.
  selectPartialDateRange() {
    const today = new Date();
    const day = today.getDate() > 1 ? today.getDate() - 1 : 1;
    this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.dateRangePresetOption('Custom').click();
    this._pickDay(this.loc.startDatePickerGroup(), day);
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // Sums a numeric column across every currently-rendered row (works for both
  // the grouped and ungrouped table — same markup, different column set).
  // Matches by substring (case-insensitive), like assertColumnContains, since
  // header text can carry extra qualifiers (e.g. "Available" vs "Available Qty").
  sumColumn(headerText) {
    return cy.get('.MuiTableContainer-root').first().find('thead th').then(($headers) => {
      const colIndex = [...$headers].findIndex((th) =>
        th.textContent.trim().toLowerCase().includes(headerText.toLowerCase())
      );
      expect(colIndex, `Column "${headerText}" must be visible in the table`).to.be.gte(0);
      return cy.get('.MuiTableContainer-root').first().find('tbody tr').then(($rows) => {
        let sum = 0;
        [...$rows].forEach((row) => {
          const cellText = row.cells[colIndex]?.textContent || '';
          sum += parseFloat(cellText.replace(/[^0-9.-]/g, '')) || 0;
        });
        return sum;
      });
    });
  }

  // Spot-checks the first `count` table rows against `list` by Product Name.
  // Re-queries DOM by index on every row to avoid stale references after React re-renders.
  verifyTableRows(list, count = 3) {
    if (!list?.length) return;
    cy.get('.MuiTableContainer-root').first().find('thead th').then(($headers) => {
      const colIndex = [...$headers].findIndex((th) =>
        th.textContent.trim().toLowerCase().includes('product name')
      );
      expect(colIndex, 'Product Name column must be visible in the table').to.be.gte(0);
      list.slice(0, count).forEach((item, idx) => {
        cy.get('.MuiTableContainer-root').first()
          .find('tbody tr').eq(idx)
          .find('td').eq(colIndex)
          .invoke('text')
          .should('include', item.productName ?? item.name);
      });
    });
  }
}

export default CostReportPage;
