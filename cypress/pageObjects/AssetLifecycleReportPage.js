import data from '../fixtures/assetLifecycleReportData.json';
import assetLifecycleReportLocators from '../support/locators/assetLifecycleReportLocators';
import urls from '../fixtures/urls.json';

class AssetLifecycleReportPage {
  constructor() {
    this.loc = assetLifecycleReportLocators;
  }

  // ── API interception ────────────────────────────────────────────────────────

  interceptApis() {
    cy.intercept('GET', data.apis.tableItems).as(data.aliases.tableItems);
    cy.intercept('GET', data.apis.poList).as(data.aliases.poList);
    cy.intercept('GET', data.apis.columnConfig).as(data.aliases.columnConfig);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  // Waits for the main data request AND the two independent queries
  // (PO list, column config) that fire in parallel on mount. A live run
  // showed the Category/Status <Select>s stay `disabled` (tied to
  // isLoading||isRefetching||isDownloading) for a short tail after the main
  // request settles — draining every initial query first, mirroring
  // CostReportPage.visit()'s established multi-wait convention, gives React
  // time to flip those flags before a test's first interaction.
  // Returns the settled interception of the INITIAL tableItems request (not
  // a bare cy.get('@alias'), which yields whichever interception is most
  // recent at read time — a live run showed a background revalidation
  // request can follow shortly after mount, so a caller reading the alias
  // fresh a moment later can catch that second, still-in-flight one instead
  // and read an undefined response body). Callers that need "the data this
  // page first loaded" should chain off this return value, not re-query the
  // alias themselves.
  visit() {
    this.interceptApis();
    cy.visit(urls.assetLifecycleReport);
    return cy.wait(`@${data.aliases.tableItems}`).then((initialInterception) => {
      cy.wait(`@${data.aliases.poList}`, { timeout: 15000 });
      cy.wait(`@${data.aliases.columnConfig}`, { timeout: 15000 });
      // Even after all three queries settle, a live run intermittently caught
      // the search input/Selects still `disabled` a moment later
      // (isLoading/isRefetching flickers again once categories/config resolve
      // and the component re-renders). Assert the CONDITION that buffer stood
      // in for rather than sleeping a fixed 500ms (SKILL.md §10): these are
      // retried, so they absorb a late re-render instead of racing it, and
      // they fail with a real message if the controls never enable.
      // All three render on every viewport — index.tsx's `isMobile` only
      // changes their width/layout; only the table/card list swaps — so this
      // is safe for the mobile-viewport TCs that also call visit().
      this.loc.searchInput().should('not.be.disabled');
      this.loc.categorySelect().should('not.have.attr', 'aria-disabled', 'true');
      this.loc.statusSelect().should('not.have.attr', 'aria-disabled', 'true');
      // Return a cy chain (not the bare object) — this callback already
      // issued cy commands above, and returning a plain sync value from such
      // a callback trips Cypress's "mixing async and sync code" guard.
      return cy.wrap(initialInterception, { log: false });
    });
  }

  // ── Request-param matching (race-proof waits) ───────────────────────────────
  //
  // CONFIRMED CODE FACT (found via a live run): index.tsx's useQuery queryKey
  // includes `searchRef.current` directly, and the search Input's onChange
  // updates that ref AND calls RHF's field.onChange on every keystroke — so
  // a fetch fires per keystroke, not just on Search-button submit. A bare
  // `cy.wait('@alias')` right after typing can therefore resolve on an
  // earlier, partial-term keystroke request instead of the final submitted
  // one (observed: search for a full serial number returned 75 unfiltered
  // rows because the settled interception belonged to a 1-character partial
  // match). The fix — snapshot how many matching requests exist BEFORE the
  // action, then retry until a FRESH one whose own request params satisfy
  // `paramMatcher` has settled — mirrors CostReportPage's proven
  // readSettledTotal/readTotalAfterReload pattern.
  _baselineCount() {
    return cy.get(`@${data.aliases.tableItems}.all`).then((all) => all.length);
  }

  _waitForMatchingRequest(paramMatcher, baseline) {
    const alias = `@${data.aliases.tableItems}.all`;
    return cy
      .get(alias, { timeout: 30000 })
      .should((all) => {
        const fresh = all.slice(baseline);
        const match = fresh.find((it) => it?.response && paramMatcher(new URL(it.request.url).searchParams));
        expect(match, 'a settled tableItems request matching the expected params must exist').to.exist;
      })
      .then((all) => all.slice(baseline).find((it) => paramMatcher(new URL(it.request.url).searchParams)));
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  // Types the term and clicks Search (the button is disabled while the input
  // is empty — SearchPresenceGate — so a real value must be typed first).
  // Returns the settled interception whose OWN request carries the full term
  // (see _waitForMatchingRequest's note — a naive single cy.wait can catch an
  // earlier per-keystroke partial-match request instead).
  search(term) {
    const want = term.trim().toLowerCase();
    return this._baselineCount().then((baseline) => {
      // Each call below re-queries the input fresh and re-checks
      // not-disabled immediately before acting — a single
      // `.should(...).clear().type(...)` chain only verifies the flag once,
      // then reuses that same yielded element for both actions; a live run
      // showed the element could flip back to disabled in the gap between.
      this.loc.searchInput().should('not.be.disabled');
      this.loc.searchInput().should('not.be.disabled').clear();
      this.loc.searchInput().should('not.be.disabled').type(term);
      this.loc.searchButton().click();
      return this._waitForMatchingRequest((p) => (p.get('search') || '').trim().toLowerCase() === want, baseline);
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  // Opens a MUI Select reliably: a live run showed the disabled-attribute
  // guard can pass a moment before React re-disables the element again
  // (isLoading/isRefetching flicker), silently no-oping the click and never
  // opening the listbox. Retries the click up to 3 times if the listbox
  // hasn't appeared yet, rather than trusting a single guarded click.
  _openSelectReliably(getSelect) {
    const tryOpen = (attempt) => {
      getSelect().should('not.have.attr', 'aria-disabled', 'true').click();
      return cy.get('body').then(($body) => {
        if ($body.find('[role="listbox"]').length > 0) return;
        if (attempt >= 3) return;
        // Between attempts, wait on the REAL condition rather than a fixed
        // backoff (SKILL.md §10): the click no-ops because a background
        // refetch briefly re-disables the control, and the search input is
        // disabled by that same isLoading||isRefetching state. Asserting it is
        // enabled therefore blocks precisely as long as the flicker lasts —
        // returning immediately when the page is already settled, and waiting
        // it out when it is not, which a blind 300ms could neither guarantee
        // nor adapt to.
        return this.loc.searchInput().should('not.be.disabled').then(() => tryOpen(attempt + 1));
      });
    };
    return tryOpen(1);
  }

  // Both Selects are `disabled` while isLoading||isRefetching||isDownloading
  // (index.tsx) — guard on aria-disabled before opening, matching
  // CostReportPage's own established convention for its Status select.
  selectCategory(categoryId) {
    return this._baselineCount().then((baseline) => {
      this._openSelectReliably(() => this.loc.categorySelect());
      this.loc.categoryOption(categoryId).click();
      return this._waitForMatchingRequest((p) => p.get('categoryId') === String(categoryId), baseline);
    });
  }

  selectAllCategories() {
    return this._baselineCount().then((baseline) => {
      this._openSelectReliably(() => this.loc.categorySelect());
      this.loc.allCategoriesOption().click();
      return this._waitForMatchingRequest((p) => !p.get('categoryId'), baseline);
    });
  }

  selectStatus(value) {
    return this._baselineCount().then((baseline) => {
      this._openSelectReliably(() => this.loc.statusSelect());
      this.loc.statusOption(value).click();
      return this._waitForMatchingRequest((p) => p.get('status') === value, baseline);
    });
  }

  selectPo(poValue) {
    return this._baselineCount().then((baseline) => {
      this.loc.poDropdownInput().click().type(poValue);
      this.loc.poDropdownOption(poValue).click();
      return this._waitForMatchingRequest((p) => p.get('po') === poValue, baseline);
    });
  }

  // ── Table ───────────────────────────────────────────────────────────────────

  getTableRows() {
    return this.loc.tableRows();
  }

  goToNextPage() {
    return this._baselineCount().then((baseline) => {
      cy.findByRole('button', { name: /next page/i }).click();
      return this._waitForMatchingRequest((p) => p.get('page') === '2', baseline);
    });
  }

  clickColumnHeader(headerText) {
    return this._baselineCount().then((baseline) => {
      this.loc.tableHeaderCell(headerText).click();
      return this._waitForMatchingRequest((p) => !!p.get('sortBy'), baseline);
    });
  }

  // ── Lifecycle link ────────────────────────────────────────────────────────────

  // The "View Report" link opens window.open(...) in a new tab, which Cypress
  // cannot follow directly — stub window.open before the click and assert on
  // the URL it was called with instead (alias: @lifecycleWindowOpen).
  clickLifecycleLink(rowIndex) {
    return cy.window().then((win) => {
      cy.stub(win, 'open').as('lifecycleWindowOpen');
      this.loc.lifecycleLinkInRow(rowIndex).click();
    });
  }

  // ── Column read helpers ─────────────────────────────────────────────────────

  // Finds `headerText`'s column index dynamically (survives reordering) and
  // returns the text of that column's cell in row `rowIndex`.
  getCellText(headerText, rowIndex = 0) {
    return this.loc.tableContainer().find('thead th').then(($headers) => {
      const colIndex = [...$headers].findIndex((th) => th.textContent.trim().toLowerCase().includes(headerText.toLowerCase()));
      expect(colIndex, `Column "${headerText}" must be visible in the table`).to.be.gte(0);
      return this.loc
        .tableContainer()
        .find('tbody tr')
        .eq(rowIndex)
        .find('td')
        .eq(colIndex)
        .invoke('text');
    });
  }

  // Asserts every row in the named column contains `expectedText`
  // (case-insensitive). Reads the whole `tbody tr` collection through a
  // single `.should()` snapshot (not a `.then()` + per-row re-query loop) so
  // Cypress retries the ENTIRE read-and-check as one atomic unit until the
  // DOM settles — a live run showed the two-step version could snapshot a
  // transitional row count (e.g. 3, mid-re-render) then fail on `.eq(2)`
  // once the settled DOM only had 2 rows.
  assertColumnContains(headerText, expectedText, maxRows) {
    this.loc.tableContainer().find('thead th').then(($headers) => {
      const colIndex = [...$headers].findIndex((th) => th.textContent.trim().toLowerCase().includes(headerText.toLowerCase()));
      expect(colIndex, `Column "${headerText}" must be visible in the table`).to.be.gte(0);
      this.loc.tableContainer().find('tbody tr').should(($rows) => {
        // Gate on a non-empty table BEFORE the per-row loop. With zero rows the
        // loop body never executes and the assertion passes vacuously — so a
        // filter regression that returns NOTHING would read as a pass, which is
        // precisely what callers use this method to catch. Inside .should() the
        // check is retried, so a slow re-render still settles rather than
        // failing spuriously. A caller that wants to assert emptiness must use
        // an explicit empty-state assertion, not this method.
        expect($rows.length, `the filtered table must show at least one row for "${expectedText}"`).to.be.at.least(1);
        const limit = maxRows != null ? Math.min($rows.length, maxRows) : $rows.length;
        for (let i = 0; i < limit; i++) {
          const cellText = $rows.eq(i).find('td').eq(colIndex).text();
          expect(cellText, `Row ${i} "${headerText}" cell must match "${expectedText}"`).to.match(
            new RegExp(Cypress._.escapeRegExp(expectedText), 'i')
          );
        }
      });
    });
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  clickExportButton() {
    this.loc.exportButton().should('not.be.disabled').click();
  }

  // ── Column Customization ─────────────────────────────────────────────────────

  openCustomizeColumns() {
    this.loc.customizeColumnsButton().click();
  }

  // Core report columns (Asset ID, Product, Category, Parent Serial, Status,
  // Cost, Location, Flow, PO #) have NO checkbox in the attribute grid — a
  // live run confirmed this: the grid only lists attribute-backed columns
  // (Brand, Model, Location, Market Price, ...), never the hardcoded ones.
  // Core columns only exist as a deletable chip in the "Selected Columns"
  // row, which is what this method clicks. Attribute-backed columns are the
  // other half of that decision and are removed via their checkbox instead —
  // out of scope for this plan (see pending.md), so no method for them lives
  // here rather than shipping an untested one.
  removeCoreColumnAndSave(columnName) {
    this.loc.selectedColumnChip(columnName).find('.MuiChip-deleteIcon').click({ force: true });
    this.loc.customizeColumnsSaveButton().click();
    cy.contains(/Columns setting for category/i).should('not.exist');
  }

  // ── Mobile ────────────────────────────────────────────────────────────────────

  getMobileCards() {
    return this.loc.mobileCards();
  }
}

export default AssetLifecycleReportPage;
