import data from '../fixtures/salesReportData.json';
import salesReportLocators from '../support/locators/salesReportLocators';
import urls from '../fixtures/urls.json';

class SalesReportPage {
  constructor() {
    this.loc = salesReportLocators;
  }

  // ── API interception ────────────────────────────────────────────────────────

  interceptApis() {
    cy.intercept('GET', data.apis.tableItems).as(data.aliases.tableItems);
    cy.intercept('GET', data.apis.poList).as(data.aliases.poList);
    cy.intercept('GET', data.apis.categories).as(data.aliases.categories);
    cy.intercept('GET', data.apis.generalConfig).as(data.aliases.generalConfig);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  visit() {
    this.interceptApis();
    cy.visit(urls.salesReport);
    cy.wait(`@${data.aliases.tableItems}`);
  }

  visitAndVerifyApiStatus() {
    this.interceptApis();
    cy.visit(urls.salesReport);
    cy.wait(`@${data.aliases.tableItems}`).its('response.statusCode').should('eq', 200);
  }

  // Visits and captures the settled tableItems response body for downstream assertions.
  visitAndCaptureResponse() {
    this.interceptApis();
    cy.visit(urls.salesReport);
    return cy.wait(`@${data.aliases.tableItems}`).then((interception) => {
      const raw = interception?.response?.body;
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return body?.data;
    });
  }

  // Opens the PO dropdown and resolves with its list of real (non-"All POs")
  // option elements, retrying up to `timeoutMs` — unlike a one-shot
  // `cy.get('body').then(...)` snapshot, this keeps re-reading the menu
  // until either a real option appears or the timeout elapses, so a
  // still-in-flight /excel/po-numbers request doesn't get misread as "no
  // PO available on this environment" (the race a synchronous snapshot
  // right after visit() is exposed to).
  //
  // Raised from 10000 -> 30000 (2026-07-10 regression triage, Group 5): the
  // select's own click can briefly no-op while every filter control is
  // disabled during the page's post-load refetch window (see the
  // `selectedPo` queryKey fix in SalesReport/index.tsx), and 10s was already
  // shorter than every other wait in this spec (50s default command
  // timeout) — TC39/TC41 observed the menu never opening within 10s under
  // that condition. 30s gives the click room to land after the window
  // closes without masking a genuine "PO dropdown broken" defect.
  //
  // ROOT-CAUSED (same triage pass): raising the timeout alone did not fix
  // it — `PoList` passes `isDisabled={isLoading || isRefetching ||
  // isDownloading}` to the underlying react-select (`Frontend/src/
  // components/IncommingInventory/PoList.tsx`), which silently swallows
  // clicks while disabled (no menu ever opens, no error thrown) — so
  // retrying the MENU QUERY forever can't help if the CLICK itself landed
  // during that disabled window and never opened anything. Assert the
  // control isn't disabled — same `aria-disabled` pattern already used for
  // `dateRangePresetSelect`/`reasonSelect` — so Cypress retries the click
  // itself until it lands on an enabled control, not just the query after it.
  getRealPoOptions(timeoutMs = 45000) {
    cy.get('#Incomming-inventory-P-O-1', { timeout: timeoutMs }).should('not.have.attr', 'aria-disabled', 'true').click();
    return cy.get('[class*="-menu"]', { timeout: timeoutMs }).should(($menu) => {
      // Retry until the menu has settled on more than just a loading/empty
      // placeholder — react-select renders a "-menu" container immediately,
      // so we specifically wait for actual "-option" children to exist.
      expect($menu.find('[class*="-option"]').length, 'PO dropdown must render at least one option (even if only "All POs")').to.be.greaterThan(0);
    }).then(($menu) => [...$menu.find('[class*="-option"]')].filter((el) => !/all pos/i.test(el.textContent)));
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  search(term, { settle = true } = {}) {
    this.loc.searchInput().should('not.be.disabled').clear().type(term);
    this.loc.searchButton().click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  clearSearch() {
    this.loc.searchInput().clear();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Date Range ──────────────────────────────────────────────────────────────

  selectDatePreset(label) {
    this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.dateRangePresetOption(label).click();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  getDatePresetValue() {
    return this.loc.dateRangePresetSelect().invoke('text');
  }

  // Always fires a real Custom-range request — never silently no-ops. On the
  // 1st of the month there is no "yesterday" within the same calendar month
  // (MUI's day-grid navigation isn't driven here), so this falls back to a
  // same-day range (today, today) instead of skipping outright; a same-day
  // custom range is still a genuine two-bounds request, just with equal
  // bounds, so the caller never has to detect/skip a no-op.
  selectCustomDateRange() {
    const today = new Date();
    const todayDay = today.getDate();
    const startDay = todayDay > 1 ? todayDay - 1 : todayDay;
    this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    this.loc.dateRangePresetOption('Custom').click();
    this._pickDay(this.loc.startDatePickerGroup(), startDay);
    cy.wait(`@${data.aliases.tableItems}`);
    this._pickDay(this.loc.endDatePickerGroup(), todayDay);
    cy.wait(`@${data.aliases.tableItems}`);
  }

  _pickDay(group, dayNumber) {
    group.find('button[aria-label="Choose date"]').should('not.be.disabled').click();
    cy.get('button.MuiPickersDay-root').should('have.length.greaterThan', 0);
    cy.get('button.MuiPickersDay-root')
      .not('[disabled]')
      .contains(new RegExp(`^${dayNumber}$`))
      .click();
  }

  // Polls every interception captured so far under `alias` until one
  // satisfies `predicate(searchParams)`, then resolves with it. Needed
  // whenever a test applies more than one filter in sequence (e.g. PO then
  // Reason) — each selection fires its own independent request, so a single
  // `cy.wait('@alias')` can resolve against an intermediate, not-yet-combined
  // request instead of the final one carrying every filter (2026-07-10
  // regression triage, Group 6 — the same alias race documented for TC17,
  // generalized here for the multi-filter E2E tests). Mirrors the
  // filter-by-request-params pattern SW-SR-TC54 already uses for the
  // identical race.
  waitForSettledRequest(alias, predicate) {
    return cy.get(`@${alias}.all`, { timeout: 30000 }).should((all) => {
      const match = all.find((it) => it?.response && predicate(new URL(it.request.url).searchParams));
      expect(match, `a request matching the expected combined filters must exist on @${alias}`).to.exist;
    }).then((all) => all.find((it) => predicate(new URL(it.request.url).searchParams)));
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  // Selects a PO by its exact value. Hardened to match getRealPoOptions/
  // selectPoByText (2026-07-13): the old body did `.click().type(poValue)` on
  // the react-select CONTAINER div (`#Incomming-inventory-P-O-1`) — but that id
  // sits on the SelectContainer, not the text input, so the `.type()` never
  // reached an input and no filtering happened. Combined with the react-window
  // virtualized menu (only ~10 rows rendered), a freshly-seeded PO sat past the
  // rendered rows and `poDropdownOption()` never found it. Fix: type into
  // react-select's OWN input (a descendant of the container) — which both
  // opens the menu and filters the option list down to the target so it's
  // guaranteed rendered. `.should('not.be.disabled')` gates on the input's real
  // `disabled` attribute (react-select sets it while the page's post-load
  // refetch window disables every filter control), and `.type()` auto-retries
  // until the control is enabled — so the click can't be swallowed mid-window.
  selectPo(poValue, { settle = true } = {}) {
    cy.get('#Incomming-inventory-P-O-1 input', { timeout: 45000 })
      .should('not.be.disabled')
      .type(poValue, { force: true });
    this.loc.poDropdownOption(poValue).click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  // Clicks a PO option by its exact visible label, re-querying the menu
  // fresh at click time rather than reusing a DOM reference captured
  // earlier (e.g. from `getRealPoOptions()`) — safe even if a background
  // refetch re-rendered the menu between capture and click (2026-07-10
  // regression triage). Pass `menuAlreadyOpen: true` when the caller already
  // has the dropdown open (e.g. right after `getRealPoOptions()`); closing
  // it (Escape) and reopening via `selectPo()`'s own click was observed live
  // to frequently never reopen the menu at all, so this deliberately avoids
  // that close/reopen roundtrip on the first selection of a sequence. The
  // reopen click asserts not-disabled first — same root cause as
  // `getRealPoOptions()` (react-select silently swallows clicks while
  // `isDisabled`).
  selectPoByText(poText, { menuAlreadyOpen = false } = {}) {
    if (!menuAlreadyOpen) cy.get('#Incomming-inventory-P-O-1', { timeout: 45000 }).should('not.have.attr', 'aria-disabled', 'true').click();
    return cy.get('[class*="-menu"]', { timeout: 45000 }).contains('[class*="-option"]', poText).click();
  }

  selectReason(value, { settle = true } = {}) {
    this.loc.reasonSelect()
      .should('not.have.attr', 'aria-disabled', 'true')
      .click();
    this.loc.reasonOption(value).click();
    return settle ? cy.wait(`@${data.aliases.tableItems}`) : cy.wrap(null, { log: false });
  }

  getConfiguredReasons() {
    // Reads General Config's stockOutReason list live so the suite adapts to
    // whatever the running environment is configured with instead of assuming
    // a hardcoded value (see plan.md §6.2).
    return cy.getAuthToken().then((token) =>
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/configs`,
        qs: { type: 'general', name: 'general' },
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      })
    ).then((res) => {
      const configured = res.body?.data?.list?.[0]?.configJson?.data?.stockOutReason;
      if (Array.isArray(configured) && configured.length) return configured.filter((r) => typeof r === 'string' && r.trim());
      if (typeof configured === 'string' && configured.trim()) return [configured];
      return data.filters.fallbackConfiguredReasons;
    });
  }

  // Visits the report, applies the "Last Month" window, the given PO filter,
  // and (optionally) a Reason filter, then resolves with the settled `summary`
  // object for the request that carries every applied filter. Used by the
  // non-sale-action isolation tests (SW-SR-TC51/52/55-62), which seed a
  // disposable PO and need to read that PO's *sales-only* rollup as ground
  // truth.
  //
  // The Reason filter matters: the Sales Report's data source is the
  // `stockoutItems` table, and with NO reason param the backend aggregates
  // EVERY status (Sold, StockedOut, Damaged, Disputed, Missing) — so marking a
  // unit Damaged genuinely DOES add a row to the unfiltered report. To isolate
  // actual sales, the caller passes `reason: 'StockedOut'`; the backend then
  // keeps only rows with `status = 'StockedOut'` (the seeded control units,
  // stocked out with an unconfigured reason) and drops Damaged/Disputed/Missing
  // rows (different status) — which is exactly the exclusion the isolation
  // tests assert.
  //
  // "Last Month" (not the default "Today") for the same reason SW-SR-TC54
  // uses it: a stock-out that JUST happened can land on a different calendar
  // day under the browser's clock than the QA server's, and "Today" would then
  // exclude it. `waitForSettledRequest` (not a bare cy.wait) is required
  // because each filter change fires its own request; only the one carrying
  // every applied filter is the fully-combined response.
  readPoScopedSummary(poNumber, { reason } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    this.interceptApis();
    cy.visit(urls.salesReport);
    cy.wait(`@${data.aliases.tableItems}`);
    // cy.wait() resolves on the network layer, not React's commit — interacting
    // with the date/PO/reason dropdowns before the SPA has painted is what
    // surfaces the intermittent "option not found, near-empty a11y tree" flake
    // (regression triage Group 8). Gate on a stable rendered anchor (the stat
    // card) so every filter click below lands on a fully-mounted page.
    this.loc.totalSaleValueCard().should('be.visible');
    this._selectDatePresetRobust('Last Month');
    this.selectPo(poNumber, { settle: false });
    if (reason) this.selectReason(reason, { settle: false });
    return this.waitForSettledRequest(
      data.aliases.tableItems,
      (p) =>
        p.get('po') === poNumber &&
        p.get('startDate') && !p.get('startDate').startsWith(today) &&
        (!reason || p.get('reason') === reason)
    ).then((interception) => {
      const raw = interception.response.body;
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return body?.data?.summary || {};
    });
  }

  // Opens the Date-Range preset menu and clicks `label`, retrying the OPEN
  // itself when the menu fails to appear. The shared selectDatePreset() clicks
  // once and then waits for the option — but under the QA refetch-disabled
  // window (regression triage Group 4) that first click is silently swallowed,
  // so the option never renders and the wait times out. Here, after each click
  // we give the menu a beat to paint and check for the option in the live DOM;
  // if it isn't there the click was swallowed, so we click again. The fixed
  // wait is a deliberate render-settle poll (there is no network/element signal
  // that a swallowed click produced), bounded by `tries`. Used only by
  // readPoScopedSummary so the shared selectDatePreset() stays untouched.
  _selectDatePresetRobust(label, tries = 6) {
    const rx = new RegExp(`^${label}$`, 'i');
    const attempt = (left) => {
      this.loc.dateRangePresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
      cy.wait(400, { log: false });
      cy.document({ log: false }).then((doc) => {
        const opt = [...doc.querySelectorAll('[role="option"]')].find((o) => rx.test((o.textContent || '').trim()));
        if (opt) {
          cy.wrap(opt, { log: false }).click();
        } else if (left > 0) {
          attempt(left - 1);
        } else {
          // Exhausted: fall through to the canonical locator so the failure
          // reads as the familiar "option not found" rather than a silent no-op.
          this.loc.dateRangePresetOption(label).click();
        }
      });
    };
    attempt(tries);
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Table ───────────────────────────────────────────────────────────────────

  getTableRows() {
    return this.loc.tableRows();
  }

  assertColumnContains(headerText, expectedText, maxRows) {
    cy.get('.MuiTableContainer-root').first().find('thead th').then(($headers) => {
      const colIndex = [...$headers].findIndex((th) =>
        th.textContent.trim().toLowerCase().includes(headerText.toLowerCase())
      );
      expect(colIndex, `Column "${headerText}" must be visible in the table`).to.be.gte(0);
      const rx = new RegExp(Cypress._.escapeRegExp(expectedText), 'i');
      // Read the row set ONCE inside a retrying .should() so Cypress re-queries
      // the WHOLE set together on each retry and checks the cells synchronously
      // against that single, internally-consistent snapshot. The old code looped
      // `cy.get(...).find('tbody tr').eq(i)` per index — when a background
      // refetch shrank the row count mid-loop, a later `.eq(i)` outran the
      // re-rendered rows and failed with "Expected to find element: <i>" (e.g.
      // the observed "69"). Same stale-index race the TC17 fix already
      // eliminated for the Reason column.
      this.loc.tableRows().should(($rows) => {
        expect($rows.length, 'search must return at least one matching row').to.be.greaterThan(0);
        const limit = maxRows != null ? Math.min($rows.length, maxRows) : $rows.length;
        for (let i = 0; i < limit; i++) {
          const cellText = $rows.eq(i).find('td').eq(colIndex).text();
          expect(cellText, `row ${i} "${headerText}" must contain "${expectedText}"`).to.match(rx);
        }
      });
    });
  }

  // ── Pagination ──────────────────────────────────────────────────────────────

  // With no `expectedCount`, a single unretried read. With `expectedCount`,
  // retries (via .should()) until the DOM's "of <N>" total converges with
  // it — the same stale-DOM-read race the stat cards had (a bare
  // .invoke('text') right after an intercepted response can read the
  // table's PRE-response state, e.g. "Record: 0-0 of 0" while the captured
  // response body already carries the real, non-zero pagination.count).
  getPaginationSummary(expectedCount) {
    if (expectedCount == null) {
      return this.loc.paginationSummary().invoke('text');
    }
    return this.loc.paginationSummary().should(($el) => {
      const match = $el.text().match(/of\s+(\d+)\b/i);
      expect(match, `pagination summary "${$el.text()}" must contain "of <number>"`).to.not.be.null;
      expect(Number(match[1]), `rendered pagination total must equal the settled API pagination.count (${expectedCount})`).to.equal(expectedCount);
    }).invoke('text');
  }

  goToNextPage() {
    this.loc.nextPageButton().click();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  changePageSize(value) {
    this.loc.pageSizeDropdown().click();
    this.loc.pageSizeOption(value).click();
    return cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  clickExportReport() {
    this.loc.exportButton().should('not.be.disabled').click();
  }

  // ── Stat card reads ──────────────────────────────────────────────────────────

  // With no `expected` arg, does a single unretried DOM read (fine right
  // after a page load with no filter change in flight). When `expected` is
  // given, uses .should() so Cypress RETRIES the DOM read until it converges
  // — required whenever the read follows a filter change, because cy.wait()
  // resolving on the network layer does not guarantee React has committed
  // the corresponding re-render yet (the exact "stale stat card" race
  // CostReportPage.readTotalAfterReload/readSettledTotal already guard
  // against for the sibling Cost Report suite).
  // The card renders currency via formatCurrency (rounded to 2 decimals), so the
  // rendered value can differ from the full-precision API value by at most half
  // a cent. Assert to ONE cent — tight enough to catch any real monetary
  // discrepancy, loose enough to absorb only display rounding. The previous ±0.5
  // (fifty-cent) tolerance was financially meaningless for inventory-cost data.
  readTotalSaleValueCard(expected) {
    if (expected == null) {
      return this.loc.totalSaleValueCard().invoke('text').then((text) => this._parseCurrency(text));
    }
    return this.loc.totalSaleValueCard().should(($el) => {
      const domVal = this._parseCurrency($el.text());
      expect(domVal, `rendered Total Sale Value must equal the settled value (${expected}) to the cent`).to.be.closeTo(expected, 0.01);
    }).then(($el) => this._parseCurrency($el.text()));
  }

  // Total Qty Sold is an integer unit count — the card must match the settled
  // value EXACTLY. No tolerance: an off-by-fraction quantity is a real defect.
  readTotalQtySoldCard(expected) {
    if (expected == null) {
      return this.loc.totalQtySoldCard().invoke('text').then((text) => this._parseNumber(text));
    }
    return this.loc.totalQtySoldCard().should(($el) => {
      const domVal = this._parseNumber($el.text());
      expect(domVal, `rendered Total Qty Sold must equal the settled value (${expected}) exactly`).to.equal(expected);
    }).then(($el) => this._parseNumber($el.text()));
  }

  _parseCurrency(text) {
    const match = String(text).replace(/,/g, '').match(/-?\$?\d+(\.\d+)?/);
    return match ? parseFloat(match[0].replace('$', '')) : NaN;
  }

  _parseNumber(text) {
    const match = String(text).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : NaN;
  }

  // ── Mobile ────────────────────────────────────────────────────────────────────

  getMobileCards() {
    return this.loc.mobileCards();
  }
}

export default SalesReportPage;
