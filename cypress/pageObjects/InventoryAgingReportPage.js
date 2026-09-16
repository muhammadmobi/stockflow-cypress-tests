import data from '../fixtures/inventoryAgingReportData.json';
import inventoryAgingReportLocators from '../support/locators/inventoryAgingReportLocators';
import urls from '../fixtures/urls.json';

class InventoryAgingReportPage {
  constructor() {
    this.loc = inventoryAgingReportLocators;
  }

  // ── API interception ────────────────────────────────────────────────────────

  interceptApis() {
    cy.intercept('GET', data.apis.tableItems).as(data.aliases.tableItems);
    cy.intercept('GET', data.apis.categories).as(data.aliases.categories);
  }

  // Registered separately from interceptApis() because the export request only
  // fires on an explicit user action — the export TCs arm this after visit(),
  // so the alias never sits unused on the pages that don't export.
  //
  // `delayMs` delays the REAL response via res.setDelay inside a route
  // handler. This is NOT a stub: the request still reaches the server and the
  // body/headers that come back are the server's own, so the plan's §6.5
  // no-stubbing stance holds. It exists so a caller can observe the transient
  // 'Exporting…' label, which is otherwise gone before an assertion can retry
  // — the alternative (asserting only the end state) would leave the middle
  // of a documented three-state cycle unverified.
  interceptExport({ delayMs = 0 } = {}) {
    if (delayMs > 0) {
      cy.intercept('GET', data.apis.export, (req) => {
        req.on('response', (res) => res.setDelay(delayMs));
      }).as(data.aliases.export);
    } else {
      cy.intercept('GET', data.apis.export).as(data.aliases.export);
    }
  }

  waitForExport() {
    return cy.wait(`@${data.aliases.export}`);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  // Waits for the main data request AND the independent categories query
  // (useCategories(), which populates the Category <Select>) that fires in
  // parallel on mount. Returns the settled interception of the INITIAL
  // tableItems request — not a bare cy.get('@alias'), which yields whichever
  // interception is most recent at read time (see AssetLifecycleReportPage's
  // identical rationale: a background revalidation request can follow shortly
  // after mount, so a caller reading the alias fresh a moment later can catch
  // that second, still-in-flight one instead).
  visit() {
    this.interceptApis();
    cy.visit(urls.inventoryAgingReport);
    // 60s, not the config's default 30s requestTimeout: a live run measured a
    // cold first page load on QA at 63s, after which the very next visit()
    // failed with "No request ever occurred" — the app simply had not booted
    // far enough to issue its first query inside 30s. This is an upper bound on
    // a real wait-for-network, not a fixed sleep: a fast load still proceeds
    // immediately. Same rationale the shared config documents for raising
    // responseTimeout to 60s.
    return cy.wait(`@${data.aliases.tableItems}`, { timeout: 60000 }).then((initialInterception) => {
      cy.wait(`@${data.aliases.categories}`, { timeout: 15000 });
      // Even after both queries settle, a live run intermittently caught a
      // caller reading table row COUNT during a transitional MRT render
      // (React flips isLoading/isRefetching again once the categories query
      // resolves and the component re-renders). Assert the CONDITION that a
      // fixed 500ms buffer used to stand in for, exactly as
      // AssetLifecycleReportPage.visit() does (SKILL.md §10 — never
      // synchronize on cy.wait(<ms>)): these assertions are retried, so they
      // absorb a late re-render instead of racing it, and they fail with a
      // real message if the controls never enable.
      // Both controls render on every viewport — index.tsx's `isMobile` only
      // changes their width/layout; only the table/card list swaps — so this
      // is safe for the mobile-viewport TCs that also call visit().
      this.loc.searchInput().should('not.be.disabled');
      this.loc.categorySelect().should('not.have.attr', 'aria-disabled', 'true');
      // Return a cy chain (not the bare object) — this callback already
      // issued cy commands above, and returning a plain sync value from such
      // a callback trips Cypress's "mixing async and sync code" guard.
      return cy.wrap(initialInterception, { log: false });
    });
  }

  // ── Request-param matching (race-proof waits) ───────────────────────────────
  //
  // Mirrors AssetLifecycleReportPage's proven pattern: snapshot how many
  // matching requests exist BEFORE the action, then retry until a FRESH one
  // whose own request params satisfy `paramMatcher` has settled — a bare
  // `cy.wait('@alias')` can resolve on an earlier, unrelated interception
  // instead of the one the action under test actually triggered.
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
  // Returns the settled interception whose own request carries the full term.
  search(term) {
    const want = term.trim().toLowerCase();
    return this._baselineCount().then((baseline) => {
      // One retried guard, then act on the same resolved element. The guard was
      // previously repeated before each of clear() and type(); the retry on the
      // first .should() already absorbs a late re-enable, so the repeats added
      // nothing but noise.
      this.loc.searchInput().should('not.be.disabled').clear().type(term);
      this.loc.searchButton().should('not.be.disabled').click();
      return this._waitForMatchingRequest((p) => (p.get('search') || '').trim().toLowerCase() === want, baseline);
    });
  }

  // Clears the search box by deleting its text. index.tsx's onChange handler
  // auto-resets (reset() + refetch()) once the input becomes empty AND a
  // search was previously submitted — no second Search click needed.
  clearSearchByTyping() {
    return this._baselineCount().then((baseline) => {
      this.loc.searchInput().clear();
      return this._waitForMatchingRequest((p) => !p.get('search'), baseline);
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  // The Category <Select> carries no `disabled` prop in index.tsx (unlike the
  // search Input), so no per-action readiness guard is needed here — visit()
  // has already waited for the select to settle before any caller reaches this
  // method.
  selectCategory(name) {
    return this._baselineCount().then((baseline) => {
      this.loc.categorySelect().click();
      this.loc.categoryOption(name).click();
      // The UI never exposes the category's numeric id to a caller that only
      // knows its name, so "a categoryId param is present at all" is the
      // strongest match obtainable without a second source of truth for the id.
      return this._waitForMatchingRequest((p) => !!p.get('categoryId'), baseline);
    });
  }

  selectAllCategories() {
    return this._baselineCount().then((baseline) => {
      this.loc.categorySelect().click();
      this.loc.allCategoriesOption().click();
      return this._waitForMatchingRequest((p) => !p.get('categoryId'), baseline);
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

  // Clicks the (only) sortable column header and returns the settled request
  // the click triggered.
  //
  // `expectedSortOrder` matters: index.tsx's buildParams() already sends
  // `sortBy=categoryName&sortOrder=ASC` on EVERY request (that is the default
  // when MRT's `sorting` state is empty), so matching on `sortBy` alone would
  // be satisfied by the initial page-load request too and prove nothing about
  // the click. MRT's toggle cycle on an unsorted column is asc -> desc, so a
  // request carrying sortOrder=DESC can ONLY have come from a real second
  // click — that is the discriminating assertion.
  // Clicks a column header that index.tsx marks `enableSorting: false`. It
  // returns nothing to wait on by design — the whole point is that no request
  // follows, so the caller proves absence by counting requests around it.
  clickNonSortableHeader(label) {
    this.loc.tableHeaderCell(label).click();
  }

  clickCategoryHeader(expectedSortOrder = 'ASC') {
    return this._baselineCount().then((baseline) => {
      this.loc.tableHeaderCell('Category').click();
      return this._waitForMatchingRequest(
        (p) => p.get('sortBy') === 'categoryName' && (p.get('sortOrder') || 'ASC') === expectedSortOrder,
        baseline,
      );
    });
  }

  // ── KPI tiles ───────────────────────────────────────────────────────────────

  getKpiTileValue(label) {
    return this.loc.kpiTileValue(label);
  }

  // ── Aging Overview collapse toggle ───────────────────────────────────────────

  toggleCharts() {
    this.loc.chartsToggleButton().click();
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  clickExportButton() {
    this.loc.exportButton().should('not.be.disabled').click();
  }

  // ── Mobile ────────────────────────────────────────────────────────────────────

  getMobileCards() {
    return this.loc.mobileCards();
  }
}

export default InventoryAgingReportPage;
