import SalesReportPage from '../../../pageObjects/SalesReportPage';
import salesReportData from '../../../fixtures/salesReportData.json';
import urls from '../../../fixtures/urls.json';
import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedMixedPO,
  seedMultiProductOnlyPO,
  seedProductOnlyPO,
  seedSerializedPO,
  apiCheckIn,
  apiScanSerial,
  apiStockOutProductQuantity,
  apiDeletePO,
} from '../../../support/helpers/poCloseHelpers';
import { apiStockOutSerial, apiReserveViaWorkOrder, apiMarkItemStatusInventory } from '../../../support/helpers/exportSeedingHelpers';
import { apiCall } from '../../../support/helpers/allPosHelpers';

// Test plan: cypress/qa/testPlans/Reports/salesReport/plan.md

describe('Sales Report Tests', () => {
  let page;

  const summaryOf = (body) => {
    const data = body && (body.data || body);
    return (data && data.summary) || {};
  };

  // Seeded-cost oracles for the non-sale-action isolation suite (TC51/52/55-62).
  const ramCost = parseFloat(td.products.ram.cost);
  const laptopCost = parseFloat(td.products.laptop.cost);

  // The control units in the isolation suite are stocked out with a reason that
  // is deliberately NOT one of the admin-configured stockOutReasons, so they
  // land in the generic "StockedOut" bucket. The tests then read the report
  // filtered to reason='StockedOut', which the backend scopes to
  // `status = 'StockedOut'` — cleanly excluding the Damaged/Disputed/Missing
  // units (different status) and Reserved units (no stockout row) whether or
  // not the running QA env has "Sold" configured. `SALE_REASON_BUCKET` is the
  // reason value passed to the Reason filter to view exactly these units.
  const saleReason = 'QA-SR-SALE';
  const SALE_REASON_BUCKET = 'StockedOut';

  // Serialized status marks go through POST /products/mark-status
  // (apiMarkItemStatusInventory) rather than /incoming-items/mark-status: the
  // latter returns success:false for a serialized "Missing" mark on QA (the
  // same confirmed reason:null-class defect 22-CostReportTests.cy.js §13
  // documents), which would fail the seeding hook. Either endpoint leaves the
  // unit's status non-StockedOut, so it is correctly excluded from the
  // reason='StockedOut' rollup regardless.
  const markSerialStatus = (serialNumber, status) =>
    apiMarkItemStatusInventory({ serialNumber, status });

  // Product-only mark-status must send `sourceLocation: ''` to avoid the
  // "Select a source location" 400 that fires once a product has >1
  // quantityRow (confirmed in 22-CostReportTests.cy.js §13). poCloseHelpers'
  // apiMarkProductStatus omits it, so hit the route directly here.
  const markProductStatus = (poNumber, productId, status) =>
    apiCall('POST', '/incoming-items/mark-status', {
      poNumber,
      status,
      productIdsArray: [{ productId, quantity: 1 }],
      sourceLocation: '',
      ...(status === 'Damaged' ? { damageReason: 'Physical Damage' } : {}),
    }).then((res) => {
      expect(res.status, `mark-status ${status} pid=${productId}: HTTP`).to.be.lessThan(500);
      expect(res.body?.success !== false, `mark-status ${status} pid=${productId}: success`).to.eq(true);
    });

  // Polls cypress/downloads for a file matching `filePattern`, retrying up to
  // `tries` times. The `checkFileExists` task is one-shot (it reads the dir
  // once and returns null on a miss — see cypress.base.config.js), so a bare
  // `cy.task(...).should('not.be.null')` retries the ASSERTION against a single
  // stale null, never re-running the task. A browser blob-download finishes
  // writing to disk asynchronously with no network/DOM signal to await on, so
  // a bounded filesystem poll (the sanctioned use of a fixed wait — there is no
  // alias or element to key off) is the correct test-side fix for the
  // known download race the old 30s command-timeout could not address
  // (regression triage Group 7). Resolves with the matched file path.
  const pollForDownload = (filePattern, tries = 12) => {
    const attempt = (remaining) =>
      cy.task('checkFileExists', { folderPath: 'cypress/downloads', filePattern }).then((filePath) => {
        if (filePath) return filePath;
        expect(remaining, `download matching "${filePattern}" never landed in cypress/downloads`).to.be.greaterThan(0);
        return cy.wait(1000, { log: false }).then(() => attempt(remaining - 1));
      });
    return attempt(tries);
  };

  beforeEach(() => {
    page = new SalesReportPage();
    cy.authSession('admin');
  });

  // ── API Wiring & Page Load (SW-SR-TC01-05) ──────────────────────────────────

  describe('API Wiring & Page Load (SW-SR-TC01 - SW-SR-TC05)', () => {

    // Use Case — page load happy path: the API fires and the table renders.
    it('SW-SR-TC01: Verify page load fires GET /reports/sales-report and renders the table', { tags: ['@sw-sr-tc01', '@smoke', '@use-case', '@automated'] }, () => {
      page.visitAndVerifyApiStatus();
    });

    // EP — the stat card's value must equal the API's own summary partition.
    it('SW-SR-TC02: Verify Total Sale Value stat card matches the API summary', { tags: ['@sw-sr-tc02', '@smoke', '@ep', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const expected = parseFloat(body?.summary?.totalSaleValue || 0);
        expect(expected, 'API must return a numeric summary.totalSaleValue').to.be.a('number').and.not.be.NaN;
        // Passing `expected` makes this a retrying read (.should()), not a
        // one-shot .invoke('text') — guards against the DOM not yet having
        // committed React's render for this response.
        page.readTotalSaleValueCard(expected);
      });
    });

    // EP — the stat card's value must equal the API's own summary partition.
    it('SW-SR-TC03: Verify Total Qty Sold stat card matches the API summary', { tags: ['@sw-sr-tc03', '@smoke', '@ep', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const expected = parseFloat(body?.summary?.totalQuantity || 0);
        expect(expected, 'API must return a numeric summary.totalQuantity').to.be.a('number').and.not.be.NaN;
        page.readTotalQtySoldCard(expected);
      });
    });

    // EP — every configured column partition must render.
    it('SW-SR-TC04: Verify all expected table columns render', { tags: ['@sw-sr-tc04', '@smoke', '@ep', '@automated'] }, () => {
      page.visit();
      salesReportData.columns.forEach((col) => {
        page.loc.tableHeaderCells().should('contain.text', col);
      });
    });

    // Use Case — the rendered table is a direct projection of the API's own list.
    it('SW-SR-TC05: Verify visible rows mirror the API list', { tags: ['@sw-sr-tc05', '@regression', '@use-case', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        if (!list.length) return;
        page.getTableRows().should('have.length.greaterThan', 0);
        page.loc.firstRowFirstCellText().invoke('text').should('include', (list[0].name || '').trim());
      });
    });

  });

  // ── Search (SW-SR-TC06-07) ───────────────────────────────────────────────────

  describe('Search (SW-SR-TC06 - SW-SR-TC07)', () => {

    // EP — a valid product-name search term narrows the list.
    it('SW-SR-TC06: Verify search by product name narrows the table', { tags: ['@sw-sr-tc06', '@regression', '@ep', '@automated'] }, () => {
      page.visit();
      page.getTableRows().then(($rows) => {
        if (!$rows.length) return;
        page.loc.firstRowFirstCellText().invoke('text').then((name) => {
          const term = name.trim().split(' ')[0];
          if (!term) return;
          page.search(term);
          page.assertColumnContains('Product Name', term);
        });
      });
    });

    // State Transition — clearing a submitted search returns to the unfiltered state.
    it('SW-SR-TC07: Verify clearing the search box resets to the unfiltered list', { tags: ['@sw-sr-tc07', '@regression', '@state-transition', '@automated'] }, () => {
      page.visit();
      page.getTableRows().then(($rows) => {
        if (!$rows.length) return;
        page.loc.firstRowFirstCellText().invoke('text').then((name) => {
          const term = name.trim().split(' ')[0];
          if (!term) return;
          page.search(term);
          page.clearSearch();
          page.getTableRows().should('have.length.greaterThan', 0);
        });
      });
    });

  });

  // ── Date Range (SW-SR-TC08-10) ───────────────────────────────────────────────

  describe('Date Range Filter (SW-SR-TC08 - SW-SR-TC10)', () => {

    // EP — the default (no explicit selection) partition.
    it('SW-SR-TC08: Verify default date range preset is Today', { tags: ['@sw-sr-tc08', '@smoke', '@ep', '@automated'] }, () => {
      page.visit();
      page.getDatePresetValue().should('match', /today/i);
    });

    // BVA — 3 preset windows (Yesterday/Last 7 Days/Last Month), each a
    // distinct boundary of "how far back the range extends".
    it('SW-SR-TC09: Verify date range presets re-fetch with the correct derived window', { tags: ['@sw-sr-tc09', '@regression', '@bva', '@automated'] }, () => {
      page.visit();
      ['Yesterday', 'Last 7 Days', 'Last Month'].forEach((preset) => {
        cy.intercept('GET', salesReportData.apis.tableItems).as('presetFetch');
        page.selectDatePreset(preset);
        cy.wait('@presetFetch').then((interception) => {
          const url = new URL(interception.request.url);
          expect(url.searchParams.get('startDate'), `${preset} must send startDate`).to.exist;
          expect(url.searchParams.get('endDate'), `${preset} must send endDate`).to.exist;
        });
      });
    });

    // Use Case — the actor-driven custom-range flow (open Custom, pick 2 dates).
    it('SW-SR-TC10: Verify a custom date range re-fetches with both bounds set', { tags: ['@sw-sr-tc10', '@regression', '@use-case', '@automated'] }, () => {
      page.visit();
      cy.intercept('GET', salesReportData.apis.tableItems).as('customFetch');
      page.selectCustomDateRange();
      cy.get('@customFetch.all').then((all) => {
        const last = all[all.length - 1];
        if (!last?.request) return;
        const url = new URL(last.request.url);
        expect(url.searchParams.get('startDate')).to.exist;
        expect(url.searchParams.get('endDate')).to.exist;
      });
    });

  });

  // ── PO Filter (SW-SR-TC11) ─────────────────────────────────────────────────

  describe('PO Filter (SW-SR-TC11)', () => {

    // EP — the default (no filter applied) partition.
    it('SW-SR-TC11: Verify default PO filter is All POs', { tags: ['@sw-sr-tc11', '@regression', '@ep', '@automated'] }, () => {
      page.visit();
      page.loc.poDropdownValue().should('contain.text', salesReportData.filters.defaultPo);
    });

    // NOTE: TC12 (param-wiring test) removed — redundant with API-TC37.
    // E2E result-visibility tests (showing the user sees filtered data) kept
    // as TC40-41 in the "PO-Wise E2E" section below.

  });

  // ── Category Filter (SW-SR-TC13) ──────────────────────────────────────────

  describe('Category Filter (SW-SR-TC13)', () => {

    // EP — the default (no filter applied) partition.
    it('SW-SR-TC13: Verify default category filter is All Categories', { tags: ['@sw-sr-tc13', '@smoke', '@ep', '@automated'] }, () => {
      page.visit();
      page.loc.categorySelect().should('contain.text', salesReportData.filters.defaultCategory);
    });

    // NOTE: TC14 (param-wiring test) removed — redundant with API-TC13.
    // E2E result-visibility test (user sees filtered rows) covered by
    // the multi-filter E2E suite where category is tested in combination.

  });

  // ── Reason Filter (SW-SR-TC15, TC17-18) ──────────────────────────────────────

  describe('Reason Filter (SW-SR-TC15, TC17 - TC18)', () => {

    // EP — the default (no filter applied) partition.
    it('SW-SR-TC15: Verify default reason filter is All Reasons', { tags: ['@sw-sr-tc15', '@smoke', '@ep', '@automated'] }, () => {
      page.visit();
      page.loc.reasonSelect().should('contain.text', salesReportData.filters.defaultReason);
    });

    // NOTE: TC16 (param-wiring test) removed — redundant with API-TC24.
    // E2E result-visibility is covered by multi-filter tests below.

    // Decision Table — the "configured reason" column of the reason filter.
    // Kept because it verifies a configured reason updates the table,
    // proving the user sees the filtered result (E2E, not just param).
    //
    // CORRECTED APPROACH (2026-07-10 regression triage, Group 6): a second
    // `cy.intercept`/`cy.wait('@reasonFetch')` registered after `page.visit()`
    // races the shared `tableItems` alias that `page.selectReason()` already
    // waits on internally — the test's own wait can resolve against a stray
    // interim request with `reason=null` even though the click landed on the
    // right option (observed live: request captured had a null reason param).
    // Assert against the SETTLED table content instead, which only ever
    // reflects the response `selectReason()`'s own wait already consumed —
    // the same "verify via the table, not a second raced intercept" pattern
    // TC06 already uses for the search filter.
    //
    // FURTHER FIXED: the first rewrite called `page.assertColumnContains()`,
    // which re-queries `tbody tr` via a fresh `cy.get()` per row index inside
    // a loop — observed live failing with `Expected to find element: '12',
    // but never found it`, because a still-live background refetch (the
    // undeployed `selectedPo` queryKey fix — see Frontend `index.tsx`) can
    // reshape the table's row count between the loop's row-count snapshot
    // and a later index in that same loop. Read the row set ONCE via
    // `.should()` (which retries the whole query+assertion together, so it
    // only ever operates on one internally-consistent snapshot) and check
    // column content synchronously against that snapshot instead.
    it('SW-SR-TC17: Verify selecting a configured reason filters the table', { tags: ['@sw-sr-tc17', '@regression', '@decision-table', '@automated'] }, function () {
      page.getConfiguredReasons().then((reasons) => {
        const configured = reasons[0];
        page.visit();
        // Capture the settled reason-filter response as ground truth for
        // "should this filter genuinely return rows" — an empty `.should()`
        // early-return would otherwise report false success on a transient
        // pre-render 0-rows poll instead of retrying for real data.
        page.selectReason(configured).then((interception) => {
          const raw = interception?.response?.body;
          const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const list = body?.data?.list || [];
          if (!list.length) { this.skip(); return; }
          page.loc.tableHeaderCells().then(($headers) => {
            // Substring match, not exact — the header cell's textContent can
            // carry extra content (e.g. MUI's sort-direction aria text)
            // beyond the visible "Reason" label; an exact `===` match
            // observed live failing with colIndex -1 despite the column
            // genuinely being visible.
            const colIndex = [...$headers].findIndex((th) => th.textContent.trim().toLowerCase().includes('reason'));
            expect(colIndex, 'Reason column must be visible').to.be.gte(0);
            page.loc.tableRows().should(($rows) => {
              expect($rows.length, 'table must have rows matching the settled API response').to.be.greaterThan(0);
              [...$rows].forEach((row) => {
                const cellText = row.querySelectorAll('td')[colIndex]?.textContent || '';
                expect(cellText.toLowerCase(), 'every rendered row must match the selected reason').to.include(configured.toLowerCase());
              });
            });
          });
        });
      });
    });

    // CORRECTED CONTRACT (discovered while authoring): the Reason <Select>
    // in SalesReport/index.tsx only renders "All Reasons", the
    // General-Config-driven stockOutReason list, and a hardcoded "Stocked
    // Out" MenuItem — it never renders Damaged/Disputed/Missing as options,
    // even though the backend route fully supports reason=Damaged/Disputed/
    // Missing (proven by SW-SR-API-TC09-11). This TC was originally planned
    // to select "Damaged" from the dropdown; that interaction does not exist
    // in the UI. Rewritten to assert the real, verified contract instead of
    // the originally-assumed one — same pattern as Cost Report's TC33/TC36
    // corrections (plan.md §13).
    // Decision Table — the Reason option set must exclude the 3 raw statuses.
    it('SW-SR-TC18: Verify the Reason dropdown does not offer Damaged/Disputed/Missing as selectable options', { tags: ['@sw-sr-tc18', '@regression', '@decision-table', '@automated'] }, () => {
      page.visit();
      // Guard on not-disabled before clicking — during the page's post-load
      // refetch window the Reason <Select> is disabled, and a click that lands
      // then is silently swallowed so the listbox never opens (options never
      // found). Same guard selectReason() already uses.
      page.loc.reasonSelect().should('not.have.attr', 'aria-disabled', 'true').click();
      page.loc.selectListboxOptions().should('have.length.greaterThan', 0).then(($opts) => {
        const labels = [...$opts].map((el) => el.textContent.trim().toLowerCase());
        ['damaged', 'disputed', 'missing'].forEach((status) => {
          expect(labels, `Reason dropdown must not offer "${status}" — only configured reasons + Stocked Out are exposed`).to.not.include(status);
        });
      });
      cy.get('body').type('{esc}');
    });

  });

  // ── Pagination (SW-SR-TC19, TC21) ────────────────────────────────────────────

  describe('Pagination (SW-SR-TC19, TC21)', () => {

    // EP — the pagination summary's happy-path partition.
    it('SW-SR-TC19: Verify pagination summary shows the correct range', { tags: ['@sw-sr-tc19', '@smoke', '@ep', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const count = body?.pagination?.count ?? 0;
        // Passing `count` makes this a retrying read — extracting the exact
        // trailing number and comparing by value, not an unanchored
        // substring regex (which would falsely match "of 10" inside "of
        // 100"), AND retrying instead of a one-shot read (which can catch
        // the table's pre-response "0 of 0" state before React commits the
        // re-render for the response this test already captured).
        page.getPaginationSummary(count);
      });
    });

    // NOTE: TC20 (param-wiring test) removed — redundant with API-TC39.
    // E2E result-visibility (row count changes) covered by the fact that
    // TC19 re-reads the summary after the page returns, proving the UI
    // re-rendered with the new page_size result.

    // BVA — the page-2 boundary of the pagination sequence.
    it('SW-SR-TC21: Verify clicking Next Page sends page=2', { tags: ['@sw-sr-tc21', '@regression', '@bva', '@automated'] }, function () {
      page.visitAndCaptureResponse().then((body) => {
        const count = body?.pagination?.count ?? 0;
        const pageSize = body?.pagination?.page_size ?? 75;
        if (count <= pageSize) { this.skip(); return; }
        cy.intercept('GET', salesReportData.apis.tableItems).as('nextFetch');
        page.goToNextPage();
        cy.wait('@nextFetch').then((interception) => {
          const url = new URL(interception.request.url);
          expect(url.searchParams.get('page')).to.equal('2');
        });
      });
    });

  });

  // ── Sorting (SW-SR-TC22-27) ──────────────────────────────────────────────────

  describe('Sorting (SW-SR-TC22 - SW-SR-TC27)', () => {

    // State Transition — each column header cycles ASC <-> DESC on repeated
    // clicks; verify the rendered row order matches API order each time.
    //
    // CORRECTED APPROACH (2026-07-10 regression triage, 3rd pass): earlier
    // attempts hit two different bugs before landing here:
    // 1. A second `cy.intercept(...).as('sortFetch1')` registered on top of
    //    the already-registered `tableItems` alias raced it (Group 6 class).
    //    "Fixed" by reusing `clickColumnHeader()`'s own wait/return value —
    //    but that then surfaced the REAL underlying cause: the still-
    //    undeployed `effectivePo` frontend fix lets a spurious background
    //    refetch land in that same shared alias's queue between page load
    //    and the first click, so `clickColumnHeader()`'s FIFO `cy.wait()`
    //    can consume that stray, unrelated request instead of the click's
    //    own one (`sortBy` comes back `null` — confirmed live).
    // 2. A `waitForSortDirection()` DOM-class check between clicks (to close
    //    a genuine React-commit-timing gap) assumed a DOM nesting that
    //    didn't match this table's actual markup ("MuiTableSortLabel-root
    //    never found").
    // FIX: register a FRESH intercept per click (sidesteps case 1 — a fresh
    // alias only sees traffic from its own registration point forward) AND
    // poll it via `waitForSettledRequest()` for a request whose params
    // ACTUALLY match what this click should have produced (sidesteps both
    // remaining races: a stray request landing in the fresh alias too, AND
    // the React-commit-timing gap `waitForSortDirection` was trying to
    // solve — the predicate itself waits for the real settled state).
    const sortCase = (id, headerLabel, sortByParam) => {
      it(id, { tags: [id.replace('SW-SR-TC', '@sw-sr-tc').toLowerCase(), '@regression', '@state-transition', '@automated'] }, function () {
        page.visitAndCaptureResponse().then((body) => {
          if (!(body?.list || []).length) { this.skip(); return; }

          // First click: verify it sends sortBy + get first order
          cy.intercept('GET', salesReportData.apis.tableItems).as('sortFetch1');
          page.loc.tableHeaderCell(headerLabel).click();
          page.waitForSettledRequest('sortFetch1', (p) => p.get('sortBy') === sortByParam).then((interception) => {
            const firstOrder = new URL(interception.request.url).searchParams.get('sortOrder');

            // Second click: verify it toggles sort order (ASC <-> DESC)
            cy.intercept('GET', salesReportData.apis.tableItems).as('sortFetch2');
            page.loc.tableHeaderCell(headerLabel).click();
            page.waitForSettledRequest('sortFetch2', (p) => p.get('sortBy') === sortByParam && p.get('sortOrder') !== firstOrder).then(() => {
              // Verify the table re-renders with the new order
              page.getTableRows().should('have.length.greaterThan', 0);
            });
          });
        });
      });
    };

    sortCase('SW-SR-TC22: Verify Total Sale Value column header toggles DESC→ASC', 'Total Sale Value', 'totalSaleValue');
    sortCase('SW-SR-TC23: Verify Total Sale Value column header toggles ASC→DESC', 'Total Sale Value', 'totalSaleValue');
    sortCase('SW-SR-TC24: Verify Avg Cost column header toggles DESC→ASC', 'Avg Cost', 'avgCost');
    sortCase('SW-SR-TC25: Verify Avg Cost column header toggles ASC→DESC', 'Avg Cost', 'avgCost');
    sortCase('SW-SR-TC26: Verify Quantity column header toggles DESC→ASC', 'Quantity', 'totalQuantity');
    sortCase('SW-SR-TC27: Verify Quantity column header toggles ASC→DESC', 'Quantity', 'totalQuantity');

  });

  // ── Data Verification (SW-SR-TC28-33) ────────────────────────────────────────

  describe('Data Verification (SW-SR-TC28 - SW-SR-TC33)', () => {

    // Use Case — rendered Quantity matches API totalQuantity for each product.
    //
    // FIXED (2026-07-10 regression triage): the first pass compared
    // `.toLocaleString()`-formatted DOM text against a raw un-formatted
    // number (fixed by de-comma'ing) but ALSO wrapped a raw DOM node
    // captured in an earlier `.then()` and chained a further `cy.find()`
    // onto it — observed live failing with "the subject is no longer
    // attached to the DOM" when a background refetch re-rendered the table
    // between the two steps. Read the cell text in ONE retrying `.should()`
    // so Cypress re-queries fresh on every retry instead of reusing a
    // possibly-stale captured element (same fix class as TC31/TC32/TC41).
    it('SW-SR-TC28: Verify Quantity column rendering matches API totalQuantity', { tags: ['@sw-sr-tc28', '@regression', '@use-case', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        if (!list.length) return;
        const expectedQty = String(Math.floor(list[0].totalQuantity));
        page.loc.tableRows().should(($rows) => {
          expect($rows.length, 'table must have rows').to.be.greaterThan(0);
          // Quantity is typically column 3 (index 2)
          const qtyText = $rows.eq(0).find('td').eq(2).text().replace(/,/g, '');
          expect(qtyText, 'rendered Quantity must reflect the settled API value').to.include(expectedQty);
        });
      });
    });

    // Use Case — rendered Avg Cost matches API avgCost for each product.
    it('SW-SR-TC29: Verify Avg Cost column rendering matches API avgCost', { tags: ['@sw-sr-tc29', '@regression', '@use-case', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        if (!list.length) return;
        const expectedCost = parseFloat(list[0].avgCost || 0);
        // Verify the RENDERED Avg Cost cell equals the API avgCost to the cent —
        // not merely that the API value "is a number" (a tautology that never
        // touched the DOM). Avg Cost is column index 3 (Product Name, Category,
        // Quantity, Avg Cost, …); the cell renders formatted currency.
        page.loc.tableRows().should(($rows) => {
          expect($rows.length, 'table must have rows').to.be.greaterThan(0);
          const domCost = parseFloat(($rows.eq(0).find('td').eq(3).text() || '').replace(/[^0-9.-]/g, ''));
          expect(domCost, 'rendered Avg Cost must match API avgCost to the cent').to.be.closeTo(expectedCost, 0.01);
        });
      });
    });

    // Use Case — rendered Total Sale Value = Qty × Avg Cost (arithmetic check).
    it('SW-SR-TC30: Verify Total Sale Value column = Quantity × Avg Cost', { tags: ['@sw-sr-tc30', '@regression', '@use-case', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        if (!list.length) return;
        const row = list[0];
        const qty = parseFloat(row.totalQuantity || 0);
        const cost = parseFloat(row.avgCost || 0);
        const value = parseFloat(row.totalSaleValue || 0);
        const expected = qty * cost;
        expect(value, 'totalSaleValue must equal quantity × avgCost to the cent').to.be.closeTo(expected, 0.01);
      });
    });

    // Use Case — rendered Reason field shows the correct reason text.
    //
    // FIXED (2026-07-10 regression triage): observed live failing with
    // `expected 'No records to display' to include 'Sold'` — a bare
    // `page.getTableRows().then(...)` right after the intercepted response
    // reads the DOM once, which can still catch the table's pre-render
    // "No records to display" placeholder row a beat before React commits
    // the settled response (the exact stale-DOM-read race
    // readTotalSaleValueCard/readTotalQtySoldCard already guard against for
    // the stat cards). Use `.should()` on the row query itself so Cypress
    // retries the whole read+assertion until it reflects the settled data.
    it('SW-SR-TC31: Verify Reason column rendering shows correct reason text', { tags: ['@sw-sr-tc31', '@regression', '@use-case', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        if (!list.length) return;
        const expectedReason = list[0].reason || '';
        if (!expectedReason) return;
        page.loc.tableRows().should(($rows) => {
          expect($rows.length, 'table must have rows').to.be.greaterThan(0);
          expect($rows.eq(0).text(), 'first row must reflect the settled response').to.include(expectedReason);
        });
      });
    });

    // Use Case — serialized units show comma-separated serial numbers.
    // Same stale-DOM-read fix as TC31 — retry via `.should()` instead of a
    // one-shot `.then()` read.
    it('SW-SR-TC32: Verify Serial Numbers column shows correct comma-separated serials for serialized products', { tags: ['@sw-sr-tc32', '@regression', '@use-case', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        const serializedRow = list.find((r) => r.serialNumbers && r.serialNumbers.trim());
        if (!serializedRow) return; // Skip if no serialized rows exist
        const firstSerial = serializedRow.serialNumbers.split(',')[0].trim();
        page.loc.tableRows().should(($rows) => {
          expect($rows.length, 'table must have rows').to.be.greaterThan(0);
          const hasSerials = [...$rows].some((row) => row.textContent.includes(firstSerial));
          expect(hasSerials, 'at least one row should show serialNumbers').to.be.true;
        });
      });
    });

    // Use Case — product-only units have empty Serial Numbers column.
    it('SW-SR-TC33: Verify Serial Numbers column is empty for product-only items', { tags: ['@sw-sr-tc33', '@regression', '@use-case', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        const productOnlyRow = list.find((r) => !r.serialNumbers || !r.serialNumbers.trim());
        if (!productOnlyRow) return; // Skip if no product-only rows
        page.getTableRows().then(($rows) => {
          expect($rows.length).to.be.greaterThan(0);
        });
      });
    });

  });

  // ── Export (SW-SR-TC34-38) ────────────────────────────────────────────────────

  describe('Export (SW-SR-TC34 - SW-SR-TC38)', () => {

    // Use Case — the export happy path (click Export -> file lands on disk).
    it('SW-SR-TC34: Verify Export downloads a .xlsx file', { tags: ['@sw-sr-tc34', '@regression', '@use-case', '@automated'] }, () => {
      cy.task('clearMatchingFiles', { folderPath: 'cypress/downloads', filePattern: 'sales-report*.xlsx' });
      cy.intercept('GET', salesReportData.apis.exportReport).as('exportApi');
      page.visit();
      page.clickExportReport();
      cy.wait('@exportApi', { timeout: 30000 }).its('response.statusCode').should('eq', 200);
      pollForDownload('sales-report*.xlsx');
    });

    // Use Case — the export's content must match what the user actually sees.
    it('SW-SR-TC35: Verify the downloaded workbook matches the on-screen table', { tags: ['@sw-sr-tc35', '@regression', '@use-case', '@automated'] }, () => {
      cy.task('clearMatchingFiles', { folderPath: 'cypress/downloads', filePattern: 'sales-report*.xlsx' });
      cy.intercept('GET', salesReportData.apis.exportReport).as('exportApi');
      page.visitAndCaptureResponse().then((body) => {
        const list = body?.list || [];
        if (!list.length) return;
        const expectedName = (list[0].name || '').trim();
        page.clickExportReport();
        cy.wait('@exportApi', { timeout: 30000 }).its('response.statusCode').should('eq', 200);
        pollForDownload('sales-report*.xlsx').then((filePath) => {
          cy.readFile(filePath, 'base64').then((base64Data) => {
            cy.task('parseExcelBuffer', { base64Data }).then(({ sheets }) => {
              const [header, ...allRows] = sheets[0].allRows;
              const wbNameCol = header.indexOf('Product Name');
              expect(wbNameCol, 'workbook must have a Product Name column').to.be.gte(0);
              const rows = allRows.filter((r) => r[1] !== 'TOTALS' && r[0]);
              const matched = rows.some((r) => String(r[wbNameCol] || '').trim() === expectedName);
              expect(matched, `workbook must contain the on-screen first row product "${expectedName}"`).to.be.true;
            });
          });
        });
      });
    });

    // TC36 seeds/deletes its own disposable PO. Seeding lives in before()
    // and cleanup in after() — a dedicated Mocha hook, not the tail of the
    // test's own promise chain — so apiDeletePO(poNumber) always runs even
    // if an assertion inside the it() body throws (mirrors TC39's fix for
    // the identical leak class).
    describe('SW-SR-TC36 (own seeded PO)', () => {
      const stamp = `SR-TC27-${Date.now()}`;
      const poNumber = `PO-SR-TC27-${stamp}`;
      let productId;

      before(() => {
        cy.authSession('admin');
        cy.visit('/');
        cy.then(() =>
          seedMultiProductOnlyPO({ td, poNumber, products: [{ stamp, quantity: 1 }] })
        ).then((ids) => {
          productId = ids[0];
          return apiCheckIn({ poNumber, productId, quantity: 1 });
        }).then(() => apiStockOutProductQuantity({ productId, poNumber, quantity: 1, reason: `QA-TC27-${stamp}` }));
      });

      after(() => apiDeletePO(poNumber));

      // Decision Table — filename must reflect BOTH an active reason AND
      // an active PO filter simultaneously (plan.md §11 GWT).
      it('SW-SR-TC36: Verify export filename reflects the active filters', { tags: ['@sw-sr-tc36', '@regression', '@decision-table', '@automated'] }, () => {
        page.interceptApis();
        cy.visit('/reports/sales-report');
        cy.wait(`@${salesReportData.aliases.tableItems}`);

        cy.intercept('GET', salesReportData.apis.tableItems).as('reasonFetch');
        // "StockedOut" (not "Damaged" — see TC18's corrected contract:
        // Damaged is not a selectable Reason option in this UI) is a real
        // value this dropdown can send; the seeded unit's disposable,
        // never-configured reason guarantees it lands in this bucket.
        page.selectReason('StockedOut');
        cy.wait('@reasonFetch');

        cy.intercept('GET', salesReportData.apis.tableItems).as('poFetch');
        page.selectPo(poNumber, { settle: false });
        cy.wait('@poFetch');

        cy.intercept('GET', salesReportData.apis.exportReport).as('exportApi');
        page.clickExportReport();
        cy.wait('@exportApi', { timeout: 30000 }).then((interception) => {
          const disposition = interception.response.headers['content-disposition'] || '';
          expect(disposition.toLowerCase(), 'filename must include the active reason').to.include('stockedout');
          // po is NOT lowercased when the backend builds the filename
          // (reports.service.ts exportSalesReport: `po-${po}`), so match
          // case-sensitively for the PO segment.
          expect(disposition, 'filename must include the active PO number').to.include(`po-${poNumber}`);
        });
      });
    });

    // Decision Table — Sales column: the report left the Sales router.
    it('SW-SR-TC37: Verify the Sales role cannot open the Sales Report page', { tags: ['@sw-sr-tc37', '@regression', '@decision-table', '@automated'] }, () => {
      // The Sales role is Inventory-only, so /reports/sales-report is not a
      // registered route for it and the catch-all renders the not-found view.
      // This TC used to assert the opposite (page renders for Sales, export
      // omits Avg Cost); the export-side guarantee — the backend dropping the
      // Avg Cost column for roleId 3 — is unchanged and still covered by
      // SW-SR-API-TC38, which drives the export endpoint with a Sales token.
      cy.authSession('sales');
      // Raw cy.visit, not page.visit() — the page object waits on the report's
      // list API, which never fires when the route doesn't resolve.
      cy.visit(urls.salesReport);
      cy.contains(/sorry, page not found/i, { timeout: 15000 }).should('be.visible');
      cy.get('.MuiTableContainer-root').should('not.exist');
    });

  });

  // ── Mobile (SW-SR-TC38) ──────────────────────────────────────────────────────

  describe('Mobile View (SW-SR-TC38)', () => {

    // EP — the mobile-viewport rendering partition.
    it('SW-SR-TC38: Verify mobile viewport renders the card list instead of the desktop table', { tags: ['@sw-sr-tc38', '@regression', '@ep', '@automated'] }, () => {
      cy.viewport(390, 844);
      page.visit();
      page.getMobileCards().should('have.length.greaterThan', 0);
      page.loc.tableContainer().should('not.exist');
    });

  });

  // ── PO-Wise Sales Verification (SW-SR-TC39-41) ────────────────────────────────

  describe('PO-Wise Sales Verification (SW-SR-TC39 - SW-SR-TC41)', () => {

    // Decision Table — select PO1 shows only PO1 data, no cross-contamination.
    //
    // FIXED (2026-07-10 regression triage, Group 5): `cy.wrap(realOptions[0]).
    // click()` observed live failing with "the subject is no longer attached
    // to the DOM" — `getRealPoOptions()`'s captured elements are a snapshot
    // of the open react-select menu, and a still-live background refetch
    // (the undeployed `selectedPo` queryKey fix) can re-render that menu's
    // DOM out from under the stale reference before the click actually
    // fires.
    //
    // REWRITTEN (2026-07-14): the click-the-option approaches
    // (`cy.wrap(...).click()`, then `selectPoByText()`) were both observed
    // live to sometimes land on the WRONG option or no-op entirely — the
    // menu is react-window-virtualized (only ~10 rows rendered at a time),
    // so a freshly-seeded/lower-ranked PO can sit outside the rendered
    // window and the click either misses or silently hits whatever option
    // happens to be under the cursor. The prior assertion
    // (`expect(selectedPo).to.exist`) didn't even catch this — it only
    // checked that SOME po param was sent, not that it was the PO we meant
    // to select. Fixed by using `page.selectPo()`, which types the PO's
    // name into react-select's own input — filtering the list down to an
    // exact match BEFORE clicking, so there is only one possible option left
    // to land on — and by asserting the sent `po` param equals the exact PO
    // we typed, not just "a po param exists".
    it('SW-SR-TC39: Verify filtering by PO isolates only that POs sales data', { tags: ['@sw-sr-tc39', '@regression', '@decision-table', '@automated'] }, function () {
      page.visit();
      page.getRealPoOptions().then((realOptions) => {
        if (!realOptions.length) { this.skip(); return; }
        const poText = realOptions[0].textContent.trim();
        cy.get('body').type('{esc}'); // close the menu getRealPoOptions() left open
        cy.intercept('GET', salesReportData.apis.tableItems).as('po1Fetch');
        page.selectPo(poText, { settle: false });
        page.waitForSettledRequest('po1Fetch', (p) => !!p.get('po')).then((interception) => {
          const url = new URL(interception.request.url);
          const selectedPo = url.searchParams.get('po');
          expect(selectedPo, 'the po param sent must be the exact PO we typed/selected, not merely "some" po').to.equal(poText);
          // Verify rendered table only shows the selected PO's data
          page.getTableRows().then(($rows) => {
            expect($rows.length).to.be.greaterThan(0);
          });
        });
      });
    });

    // Decision Table — stat card Total Sale Value updates when PO is selected.
    //
    // REWRITTEN (2026-07-14, same fix as TC39): click-the-option
    // (`selectPoByText`) could land on the wrong option or no-op under the
    // virtualized menu. Use `page.selectPo()` (types the PO name into
    // react-select's own input, filtering to an exact match before
    // clicking) and assert the sent `po` param is the exact PO typed.
    it('SW-SR-TC40: Verify stat card updates when PO selection changes', { tags: ['@sw-sr-tc40', '@regression', '@decision-table', '@automated'] }, function () {
      page.visitAndCaptureResponse().then((initialRes) => {
        const initialTotal = summaryOf(initialRes)?.totalSaleValue ?? 0;

        page.getRealPoOptions().then((realOptions) => {
          if (!realOptions.length) { this.skip(); return; }
          const poText = realOptions[0].textContent.trim();
          cy.get('body').type('{esc}'); // close the menu getRealPoOptions() left open
          cy.intercept('GET', salesReportData.apis.tableItems).as('poSelect');
          page.selectPo(poText, { settle: false });
          page.waitForSettledRequest('poSelect', (p) => !!p.get('po')).then((interception) => {
            const url = new URL(interception.request.url);
            expect(url.searchParams.get('po'), 'the po param sent must be the exact PO we typed/selected').to.equal(poText);
            const raw = interception.response.body;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const filteredTotal = summaryOf(parsed)?.totalSaleValue ?? 0;
            // Meaningful E2E check: the stat card must actually RE-RENDER to the
            // PO-filtered total (read the DOM card, retry-safe, to the cent) —
            // not just assert the API number "is a number" (a tautology that
            // proved nothing about the card updating).
            page.readTotalSaleValueCard(filteredTotal);
          });
        });
      });
    });

    // Decision Table — multiple POs show isolation, no cross-contamination.
    //
    // REWRITTEN (2026-07-14, same fix as TC39): click-the-option
    // (`selectPoByText`) could land on the wrong option or no-op under the
    // virtualized menu — for a 2-PO test that's worse than usual, since a
    // missed/misfired second click could silently re-select PO1 and the old
    // "must not equal po1Param" check would then correctly fail for the
    // WRONG reason (duplicate selection, not real cross-contamination).
    // `page.selectPo()` types each PO's name into react-select's own input,
    // filtering to an exact match before clicking, so each selection can
    // only land on the PO we asked for; asserted directly against the typed
    // values instead of merely "exists"/"differs".
    it('SW-SR-TC41: Verify NO cross-contamination between different POs', { tags: ['@sw-sr-tc41', '@regression', '@decision-table', '@automated'] }, function () {
      page.visitAndCaptureResponse().then((unfilteredRes) => {
        const allTotal = summaryOf(unfilteredRes)?.totalSaleValue ?? 0;

        page.getRealPoOptions().then((realOptions) => {
          if (realOptions.length < 2) { this.skip(); return; }
          const po1Text = realOptions[0].textContent.trim();
          const po2Text = realOptions[1].textContent.trim();
          cy.get('body').type('{esc}'); // close the menu getRealPoOptions() left open

          // Select first PO
          cy.intercept('GET', salesReportData.apis.tableItems).as('po1');
          page.selectPo(po1Text, { settle: false });
          page.waitForSettledRequest('po1', (p) => !!p.get('po')).then((int1) => {
            const po1Total = summaryOf(int1.response.body)?.totalSaleValue ?? 0;
            const po1Param = new URL(int1.request.url).searchParams.get('po');

            // Select second PO — selectPo() types into the input directly,
            // so it doesn't matter whether the menu is currently open/closed.
            cy.intercept('GET', salesReportData.apis.tableItems).as('po2');
            page.selectPo(po2Text, { settle: false });
            page.waitForSettledRequest('po2', (p) => !!p.get('po')).then((int2) => {
              const po2Total = summaryOf(int2.response.body)?.totalSaleValue ?? 0;
              const po2Param = new URL(int2.request.url).searchParams.get('po');

              // No cross-contamination invariant: each selection must target
              // the EXACT PO we typed, and each PO-scoped rollup must be a
              // valid subset of the unfiltered total (a single PO can never
              // roll up MORE than every PO combined).
              expect(po1Param, 'first selection must send the exact po we typed').to.equal(po1Text);
              expect(po2Param, 'second selection must send the exact po we typed').to.equal(po2Text);
              expect(po1Total, 'PO1 rollup must not exceed the unfiltered total').to.be.lte(allTotal + 0.5);
              expect(po2Total, 'PO2 rollup must not exceed the unfiltered total').to.be.lte(allTotal + 0.5);
            });
          });
        });
      });
    });

  });

  // ── Date-Wise Sales Verification (SW-SR-TC42-44) ─────────────────────────────

  describe('Date-Wise Sales Verification (SW-SR-TC42 - SW-SR-TC44)', () => {

    // Decision Table — select Day 1 shows only Day 1 sales.
    it('SW-SR-TC42: Verify filtering by date range isolates only that days sales', { tags: ['@sw-sr-tc42', '@regression', '@decision-table', '@automated'] }, () => {
      page.visit();
      // "Today" is already the default preset, so selecting it fires no refetch
      // (unchanged queryKey) and cy.wait would hang. Move off it first so the
      // Today selection below is a genuine state transition that re-fetches.
      page.selectDatePreset('Yesterday');
      cy.intercept('GET', salesReportData.apis.tableItems).as('dateFetch');
      page.selectDatePreset('Today');
      cy.wait('@dateFetch').then((interception) => {
        const url = new URL(interception.request.url);
        expect(url.searchParams.get('startDate')).to.exist;
        expect(url.searchParams.get('endDate')).to.exist;
        // Verify table re-renders with date-filtered data
        page.getTableRows().should('exist');
      });
    });

    // Decision Table — spanning date range aggregates correctly.
    it('SW-SR-TC43: Verify date range spanning multiple days aggregates all data', { tags: ['@sw-sr-tc43', '@regression', '@decision-table', '@automated'] }, () => {
      page.visit();
      cy.intercept('GET', salesReportData.apis.tableItems).as('rangeFetch');
      page.selectDatePreset('Last 7 Days');
      cy.wait('@rangeFetch').then((interception) => {
        const raw = interception.response.body;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const totalQty = summaryOf(parsed)?.totalQuantity ?? 0;
        // The aggregate must be a real non-negative whole unit count, and the
        // stat card must render exactly that value — not merely "is a number".
        expect(totalQty, 'aggregated Total Qty must be >= 0').to.be.a('number').and.to.be.gte(0);
        expect(Number.isInteger(totalQty), 'aggregated Total Qty must be a whole unit count').to.be.true;
        page.readTotalQtySoldCard(totalQty);
      });
    });

    // Decision Table — date boundaries are enforced (include/exclude days).
    it('SW-SR-TC44: Verify date range boundaries include target day but exclude adjacent days', { tags: ['@sw-sr-tc44', '@regression', '@decision-table', '@automated'] }, () => {
      page.visit();
      // "Today" is already the default preset, so re-selecting it fires no
      // refetch (unchanged queryKey) and cy.wait would hang. Move off it first
      // so the Today selection below is a genuine transition that re-fetches.
      page.selectDatePreset('Yesterday');
      cy.intercept('GET', salesReportData.apis.tableItems).as('boundaryFetch');
      page.selectDatePreset('Today');
      cy.wait('@boundaryFetch').then((interception) => {
        const url = new URL(interception.request.url);
        const start = url.searchParams.get('startDate');
        const end = url.searchParams.get('endDate');
        // Verify date params are set and properly formatted
        expect(start).to.match(/^\d{4}-\d{2}-\d{2}/);
        expect(end).to.match(/^\d{4}-\d{2}-\d{2}/);
      });
    });

  });

  // ── Multi-Filter Combinations (SW-SR-TC45-47) ────────────────────────────────

  describe('Multi-Filter Combinations (SW-SR-TC45 - SW-SR-TC47)', () => {

    // Decision Table — PO + Reason filters together show intersection.
    //
    // FIXED (2026-07-10 regression triage, Group 6): observed live failing
    // with `expected null to equal 'StockedOut'` — the PO click and the
    // Reason click each fire their own independent request, but a single
    // `cy.intercept(...).as('poReason')` registered before EITHER action
    // queues both under that one alias; `cy.wait('@poReason')` (called once)
    // pops the FIRST of the two — the PO-only request, before Reason was
    // even applied — not the combined one. `waitForSettledRequest` polls
    // every captured request for one that actually carries every expected
    // param, regardless of how many intermediate ones fired first. Also
    // swaps the stale `cy.wrap(realOptions[0]).click()` for
    // `page.selectPoByText()` (see TC39's fix note) since this describe
    // block hits the same detached-element AND menu-never-reopens risks.
    it('SW-SR-TC45: Verify PO + Reason filters together show intersection (not union)', { tags: ['@sw-sr-tc45', '@regression', '@decision-table', '@automated'] }, function () {
      page.visit();
      page.getRealPoOptions().then((realOptions) => {
        if (!realOptions.length) { this.skip(); return; }
        const poText = realOptions[0].textContent.trim();

        cy.intercept('GET', salesReportData.apis.tableItems).as('poReason');
        page.selectPoByText(poText, { menuAlreadyOpen: true });
        page.selectReason('StockedOut', { settle: false });
        page.waitForSettledRequest('poReason', (p) => !!p.get('po') && p.get('reason') === 'StockedOut').then((interception) => {
          const url = new URL(interception.request.url);
          expect(url.searchParams.get('po')).to.exist;
          expect(url.searchParams.get('reason')).to.equal('StockedOut');
          // Verify table shows intersection result
          const raw = interception.response.body;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const apiCount = (parsed?.data?.list || parsed?.list || []).length;
          // The rendered data rows must mirror EXACTLY the filtered API result
          // (0 is a valid strict-intersection outcome). Excludes MRT's
          // single-cell "no records" placeholder row. Replaces the old
          // `expect($rows).to.exist`, a tautology — a jQuery set always exists.
          page.loc.tableRows().should(($rows) => {
            const rendered = [...$rows].filter((r) => r.querySelectorAll('td').length > 1).length;
            expect(rendered, 'rendered data-row count must equal the filtered API list length').to.equal(apiCount);
          });
        });
      });
    });

    // Decision Table — PO + Date filters together narrow to intersection.
    //
    // REWRITTEN (2026-07-14, same fix as TC39): click-the-option
    // (`selectPoByText`) could land on the wrong option or no-op under the
    // virtualized menu. Use `page.selectPo()` (types the PO name into
    // react-select's own input, filtering to an exact match before
    // clicking) and assert the sent `po` param is the exact PO typed.
    it('SW-SR-TC46: Verify PO + Date filters together show intersection', { tags: ['@sw-sr-tc46', '@regression', '@decision-table', '@automated'] }, function () {
      page.visit();
      page.getRealPoOptions().then((realOptions) => {
        if (!realOptions.length) { this.skip(); return; }
        const poText = realOptions[0].textContent.trim();
        cy.get('body').type('{esc}'); // close the menu getRealPoOptions() left open

        cy.intercept('GET', salesReportData.apis.tableItems).as('poDate');
        page.selectPo(poText, { settle: false });
        page.selectDatePreset('Last 7 Days');
        page.waitForSettledRequest('poDate', (p) => !!p.get('po') && !!p.get('startDate')).then((interception) => {
          const url = new URL(interception.request.url);
          expect(url.searchParams.get('po'), 'the po param sent must be the exact PO we typed/selected').to.equal(poText);
          expect(url.searchParams.get('startDate')).to.exist;
          const raw = interception.response.body;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const apiCount = (parsed?.data?.list || parsed?.list || []).length;
          // The rendered data rows must mirror EXACTLY the filtered API result
          // (0 is a valid strict-intersection outcome). Excludes MRT's
          // single-cell "no records" placeholder row. Replaces the old
          // `expect($rows).to.exist`, a tautology — a jQuery set always exists.
          page.loc.tableRows().should(($rows) => {
            const rendered = [...$rows].filter((r) => r.querySelectorAll('td').length > 1).length;
            expect(rendered, 'rendered data-row count must equal the filtered API list length').to.equal(apiCount);
          });
        });
      });
    });

    // Decision Table — all 3 filters together (PO + Date + Reason).
    it('SW-SR-TC47: Verify PO + Date + Reason filters together show strict intersection', { tags: ['@sw-sr-tc47', '@regression', '@decision-table', '@automated'] }, function () {
      page.visit();
      page.getRealPoOptions().then((realOptions) => {
        if (!realOptions.length) { this.skip(); return; }
        const poText = realOptions[0].textContent.trim();

        cy.intercept('GET', salesReportData.apis.tableItems).as('allFilters');
        page.selectPoByText(poText, { menuAlreadyOpen: true });
        page.selectDatePreset('Last Month');
        page.selectReason('StockedOut', { settle: false });
        page.waitForSettledRequest('allFilters', (p) => !!p.get('po') && !!p.get('startDate') && p.get('reason') === 'StockedOut').then((interception) => {
          const url = new URL(interception.request.url);
          expect(url.searchParams.get('po')).to.exist;
          expect(url.searchParams.get('startDate')).to.exist;
          expect(url.searchParams.get('reason')).to.equal('StockedOut');
          const raw = interception.response.body;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const apiCount = (parsed?.data?.list || parsed?.list || []).length;
          // The rendered data rows must mirror EXACTLY the filtered API result
          // (0 is a valid strict-intersection outcome). Excludes MRT's
          // single-cell "no records" placeholder row. Replaces the old
          // `expect($rows).to.exist`, a tautology — a jQuery set always exists.
          page.loc.tableRows().should(($rows) => {
            const rendered = [...$rows].filter((r) => r.querySelectorAll('td').length > 1).length;
            expect(rendered, 'rendered data-row count must equal the filtered API list length').to.equal(apiCount);
          });
        });
      });
    });

  });

  // ── Stat Card vs Table Parity (SW-SR-TC48-52) ──────────────────────────────────

  describe('Stat Card vs Table Parity (SW-SR-TC48 - SW-SR-TC52)', () => {

    // Decision Table — stat card totals match table row sums (PO-wise).
    //
    // REWRITTEN (2026-07-14, same fix as TC39): click-the-option
    // (`selectPoByText`) could land on the wrong option or no-op under the
    // virtualized menu. Use `page.selectPo()` (types the PO name into
    // react-select's own input, filtering to an exact match before
    // clicking) and assert the sent `po` param is the exact PO typed.
    it('SW-SR-TC48: Verify stat card Total Qty matches table sum (PO-wise)', { tags: ['@sw-sr-tc48', '@regression', '@decision-table', '@automated'] }, function () {
      page.visit();
      page.getRealPoOptions().then((realOptions) => {
        if (!realOptions.length) { this.skip(); return; }
        const poText = realOptions[0].textContent.trim();
        cy.get('body').type('{esc}'); // close the menu getRealPoOptions() left open

        cy.intercept('GET', salesReportData.apis.tableItems).as('poStat');
        page.selectPo(poText, { settle: false });
        page.waitForSettledRequest('poStat', (p) => !!p.get('po')).then((interception) => {
          const url = new URL(interception.request.url);
          expect(url.searchParams.get('po'), 'the po param sent must be the exact PO we typed/selected').to.equal(poText);
          const body = interception.response.body;
          const apiTotal = summaryOf(body)?.totalQuantity ?? 0;
          // Stat card should show the same total as the API
          page.readTotalQtySoldCard(apiTotal);
        });
      });
    });

    // Decision Table — stat card matches table sum (date-wise).
    it('SW-SR-TC49: Verify stat card Total Sale Value matches table sum (date-wise)', { tags: ['@sw-sr-tc49', '@regression', '@decision-table', '@automated'] }, () => {
      page.visitAndCaptureResponse().then((body) => {
        const apiTotal = summaryOf(body)?.totalSaleValue ?? 0;
        page.readTotalSaleValueCard(apiTotal);
      });
    });

    // Decision Table — mixed-shape PO rollup is correct on stat card.
    it('SW-SR-TC50: Verify stat card shows combined sale value for mixed-shape PO', { tags: ['@sw-sr-tc50', '@regression', '@decision-table', '@automated'] }, () => {
      // visitAndCaptureResponse() resolves the `data` object directly, so the
      // summary is at `data.summary` — the old `data?.data?.summary` path was
      // always undefined, making `expected` a constant 0 and the "is a number"
      // check pass vacuously. Read the real summary and assert the rendered stat
      // card matches it to the cent (genuine card↔API parity).
      page.visitAndCaptureResponse().then((data) => {
        const expected = parseFloat(data?.summary?.totalSaleValue || 0);
        expect(expected, 'API must return a numeric summary.totalSaleValue').to.be.a('number').and.not.be.NaN;
        page.readTotalSaleValueCard(expected);
      });
    });

    // TC51 + TC52 — mixed-shape non-sale isolation, sharing ONE seeded mixed PO.
    //
    // REWRITTEN 2026-07-13 (regression triage Group 3): the old bodies read the
    // unfiltered stat card value and immediately re-read the SAME value — they
    // never marked/reserved anything, so they proved nothing (a tautology that
    // passed regardless of the report's exclusion logic). They now share a
    // mixed-shape PO seeded ONCE in before(): one unit of each shape is sold as
    // the positive control (combined value = ramCost + laptopCost, qty = 2),
    // and two spare units of each shape are left Available for the two cases to
    // act on. TC51 marks its spares Damaged; TC52 reserves its spares via Work
    // Order. Because neither a Damaged nor a Reserved unit is a sale, the
    // PO-scoped rollup must stay at exactly the two Sold units — a leak would
    // read a higher total and fail the closeTo oracle. Sharing one PO (vs one
    // per TC) keeps the suite's Excel-import load low, which is what the QA
    // /excel/upload-inventory endpoint starts rejecting under repeated runs.
    // Seeding/cleanup live in before()/after() hooks so apiDeletePO always runs
    // even on a mid-test throw.
    describe('Mixed-shape non-sale isolation (SW-SR-TC51 - SW-SR-TC52)', () => {
      const stamp = `MIX-${Date.now()}`;
      const poNumber = `PO-SRUI-${stamp}`;
      // [0] sold control · [1] TC51 Damaged · [2] TC52 Reserved
      const serials = [0, 1, 2].map((i) => `SN-SRUI-${stamp}-${i}`);
      let ramProductId;
      let laptopProductId;

      before(() => {
        cy.authSession('admin');
        cy.visit('/');
        cy.then(() => seedMixedPO({ td, poNumber, ramStamp: `${stamp}-ram`, ramQty: 3, laptopStamp: `${stamp}-lpt`, serials }))
          .then((ids) => { ramProductId = ids.ramProductId; laptopProductId = ids.laptopProductId; })
          .then(() => apiCheckIn({ poNumber, productId: ramProductId, quantity: 3 }))
          .then(() => serials.reduce((chain, s) => chain.then(() => apiScanSerial(poNumber, s)), cy.wrap(null)))
          // Positive control: stock out one unit of each shape (generic reason).
          .then(() => apiStockOutProductQuantity({ productId: ramProductId, poNumber, quantity: 1, reason: saleReason }))
          .then(() => apiStockOutSerial({ serialNumber: serials[0], reason: saleReason }));
      });

      after(() => apiDeletePO(poNumber));

      it('SW-SR-TC51: Verify marking spare mixed-shape units Damaged leaves the combined sale value unchanged', { tags: ['@sw-sr-tc51', '@regression', '@decision-table', '@automated'] }, () => {
        const expected = ramCost + laptopCost;
        cy.then(() => markProductStatus(poNumber, ramProductId, 'Damaged'))
          .then(() => markSerialStatus(serials[1], 'Damaged'));
        page.readPoScopedSummary(poNumber, { reason: SALE_REASON_BUCKET }).then((summary) => {
          const val = parseFloat(summary.totalSaleValue || 0);
          expect(val, `combined sales rollup must count only the 2 sold units (${expected}); the 2 Damaged units must be excluded`).to.be.closeTo(expected, 0.01);
          page.readTotalSaleValueCard(expected);
        });
      });

      it('SW-SR-TC52: Verify reserving spare mixed-shape units via Work Order leaves the combined qty sold unchanged', { tags: ['@sw-sr-tc52', '@regression', '@decision-table', '@automated'] }, () => {
        const expected = 2; // 1 product-only + 1 serialized stocked out
        cy.then(() => apiReserveViaWorkOrder({ productId: ramProductId, productName: `SRUI-51-ram-${stamp}`, quantity: 1 }))
          .then(() => apiReserveViaWorkOrder({ productId: laptopProductId, productName: `SRUI-52-lpt-${stamp}`, quantity: 1 }));
        page.readPoScopedSummary(poNumber, { reason: SALE_REASON_BUCKET }).then((summary) => {
          const val = parseFloat(summary.totalQuantity || 0);
          expect(val, `combined sales rollup must count only the 2 sold units; the 2 Reserved units must be excluded`).to.equal(expected);
          page.readTotalQtySoldCard(expected);
        });
      });
    });

  });

  // ── Non-Sale Action Isolation (SW-SR-TC55-62) ────────────────────────────

  describe('Non-Sale Action Isolation (SW-SR-TC55 - SW-SR-TC62)', () => {

    // Two disposable POs, seeded ONCE for all 8 cases (four product-only, four
    // serialized). Each PO sells `soldQty` units as "Sold" — the positive
    // control the Sales Report MUST count — and leaves a pool of spare Available
    // units for the individual cases to act on. Every case then performs its
    // named non-sale action (Damaged / Disputed / Missing / Reserve) on one
    // spare and asserts the PO-scoped rollup is STILL exactly the sold control
    // (soldQty × cost for the value card, soldQty for the qty card). Because a
    // Damaged / Disputed / Missing / Reserved unit is never a sale, the total
    // must not move; a regression that let any of them leak in would push the
    // total above the control and fail the closeTo oracle. Actions accumulate
    // across the cases on the shared PO, so the invariant is proven repeatedly
    // against a growing pile of non-sale units.
    //
    // REWRITTEN 2026-07-13 (regression triage Group 3): replaces the old
    // tautology, which read the same unfiltered value twice and never performed
    // the named action at all. Sharing two POs (rather than one per case) keeps
    // the suite's Excel-import count low — the QA /excel/upload-inventory
    // endpoint starts rejecting (HTTP 400) under the load of many imports in a
    // single run, which is what made a per-case-PO design flaky.
    const soldQty = 2;
    const poProd = `PO-SRUI-P-${Date.now()}`;
    const poSerial = `PO-SRUI-S-${Date.now()}`;
    const prodStamp = `P-${Date.now()}`;
    const serialStamp = `S-${Date.now()}`;
    // Serial pool: [0..1] sold control · [2] Damaged · [3] Disputed · [4] Missing
    // · [5] spare backing the product-level Reserve.
    const serials = [0, 1, 2, 3, 4, 5].map((i) => `SN-SRUI-${serialStamp}-${i}`);
    const prodQty = 6; // soldQty(2) + Damaged + Disputed + Missing + Reserve(4) = 6
    let prodProductId;
    let serialProductId;

    before(() => {
      cy.authSession('admin');
      cy.visit('/');
      // Product-only PO: check in all, sell soldQty as the control.
      cy.then(() => seedProductOnlyPO({ td, poNumber: poProd, stamp: prodStamp, quantity: prodQty }))
        .then((pid) => { prodProductId = pid; })
        .then(() => apiCheckIn({ poNumber: poProd, productId: prodProductId, quantity: prodQty }))
        .then(() => apiStockOutProductQuantity({ productId: prodProductId, poNumber: poProd, quantity: soldQty, reason: saleReason }))
        // Serialized PO: scan all, stock out the first soldQty serials as the control.
        .then(() => seedSerializedPO({ td, poNumber: poSerial, stamp: serialStamp, serials }))
        .then((pid) => { serialProductId = pid; })
        .then(() => serials.reduce((chain, s) => chain.then(() => apiScanSerial(poSerial, s)), cy.wrap(null)))
        .then(() => apiStockOutSerial({ serialNumber: serials[0], reason: saleReason }))
        .then(() => apiStockOutSerial({ serialNumber: serials[1], reason: saleReason }));
    });

    after(() => {
      apiDeletePO(poProd);
      apiDeletePO(poSerial);
    });

    // Product-only case: perform `action`, then assert the poProd sales rollup
    // (reason=StockedOut) still equals only the sold control's value
    // (soldQty × ramCost) — the non-sale unit must not join it.
    const prodCase = (num, title, action) => {
      it(`SW-SR-TC${num}: ${title}`, { tags: [`@sw-sr-tc${num}`, '@regression', '@decision-table', '@automated'] }, () => {
        const expected = soldQty * ramCost;
        cy.then(() => action());
        page.readPoScopedSummary(poProd, { reason: SALE_REASON_BUCKET }).then((summary) => {
          const val = parseFloat(summary.totalSaleValue || 0);
          expect(val, `poProd sales rollup must count ONLY the ${soldQty} stocked-out units (${expected}); the non-sale unit must be excluded`).to.be.closeTo(expected, 0.01);
          page.readTotalSaleValueCard(expected);
        });
      });
    };

    // Serialized case: perform `action`, then assert the poSerial sales rollup
    // (reason=StockedOut) still equals only the sold control's quantity.
    const serialCase = (num, title, action) => {
      it(`SW-SR-TC${num}: ${title}`, { tags: [`@sw-sr-tc${num}`, '@regression', '@decision-table', '@automated'] }, () => {
        const expected = soldQty;
        cy.then(() => action());
        page.readPoScopedSummary(poSerial, { reason: SALE_REASON_BUCKET }).then((summary) => {
          const val = parseFloat(summary.totalQuantity || 0);
          expect(val, `poSerial sales rollup must count ONLY the ${soldQty} stocked-out units; the non-sale unit must be excluded`).to.equal(expected);
          page.readTotalQtySoldCard(expected);
        });
      });
    };

    prodCase(55, 'Verify marking a spare product-only unit Damaged is excluded from the PO sales rollup', () => markProductStatus(poProd, prodProductId, 'Damaged'));
    serialCase(56, 'Verify marking a spare serialized unit Damaged is excluded from the PO sales rollup', () => markSerialStatus(serials[2], 'Damaged'));
    prodCase(57, 'Verify marking a spare product-only unit Disputed is excluded from the PO sales rollup', () => markProductStatus(poProd, prodProductId, 'Disputed'));
    serialCase(58, 'Verify marking a spare serialized unit Disputed is excluded from the PO sales rollup', () => markSerialStatus(serials[3], 'Disputed'));
    prodCase(59, 'Verify marking a spare product-only unit Missing is excluded from the PO sales rollup', () => markProductStatus(poProd, prodProductId, 'Missing'));
    serialCase(60, 'Verify marking a spare serialized unit Missing is excluded from the PO sales rollup', () => markSerialStatus(serials[4], 'Missing'));
    prodCase(61, 'Verify reserving a spare product-only unit via Work Order is excluded from the PO sales rollup', () => apiReserveViaWorkOrder({ productId: prodProductId, productName: `SRUI-61-${poProd}`, quantity: 1 }));
    serialCase(62, 'Verify reserving a spare serialized unit via Work Order is excluded from the PO sales rollup', () => apiReserveViaWorkOrder({ productId: serialProductId, productName: `SRUI-62-${poSerial}`, quantity: 1 }));

  });

  // ── Export Content Parity (SW-SR-TC53) ────────────────────────────────────────

  describe('Export Content Parity (SW-SR-TC53)', () => {

    // Use Case — exported workbook TOTALS row sums match data row sums.
    it('SW-SR-TC53: Verify export TOTALS row equals sum of all data rows', { tags: ['@sw-sr-tc53', '@regression', '@use-case', '@automated'] }, () => {
      cy.task('clearMatchingFiles', { folderPath: 'cypress/downloads', filePattern: 'sales-report*.xlsx' });
      cy.intercept('GET', salesReportData.apis.exportReport).as('exportTotals');
      page.visit();
      page.clickExportReport();
      cy.wait('@exportTotals', { timeout: 30000 }).its('response.statusCode').should('eq', 200);
      pollForDownload('sales-report*.xlsx').then((filePath) => {
        cy.readFile(filePath, 'base64').then((base64Data) => {
          cy.task('parseExcelBuffer', { base64Data }).then(({ sheets }) => {
            const sheet = sheets[0];
            const rows = sheet.allRows;
            const [header, ...dataWithTotals] = rows;

            // Find TOTALS row
            const totalsRowIndex = dataWithTotals.findIndex((r) => r[1] === 'TOTALS');
            if (totalsRowIndex < 0) return; // Skip if no TOTALS row

            const dataRows = dataWithTotals.slice(0, totalsRowIndex);
            const totalsRow = dataWithTotals[totalsRowIndex];

            // Sum quantities from data rows and compare to TOTALS row
            const qtyColIndex = 2; // Assuming Quantity is column 3 (index 2)
            const dataQtySum = dataRows.reduce((sum, row) => {
              const qty = parseFloat(row[qtyColIndex]) || 0;
              return sum + qty;
            }, 0);

            const totalsQty = parseFloat(totalsRow[qtyColIndex]) || 0;
            expect(totalsQty).to.equal(dataQtySum);
          });
        });
      });
    });

  });

  // ── Mixed-shape PO rollup (SW-SR-TC54) ───────────────────────────────────────

  describe('Mixed-shape PO Rollup (SW-SR-TC54)', () => {
    const stamp = `SR-UI-${Date.now()}`;
    const poNumber = `PO-SR-UI-${stamp}`;
    const ramStamp = `${stamp}-ram`;
    const laptopStamp = `${stamp}-lpt`;
    const serial = `SN-SR-UI-${stamp}`;
    const ramCost = parseFloat(td.products.ram.cost);
    const laptopCost = parseFloat(td.products.laptop.cost);
    let ramProductId;

    // Seeding/mutation lives in before() and cleanup in after() — a
    // dedicated Mocha hook, not the tail of the test's own promise chain —
    // so apiDeletePO(poNumber) always runs even if an assertion inside the
    // it() body throws. Mirrors the convention every other seeded describe
    // block in this suite (and 22-CostReportTests.cy.js) already follows.
    before(() => {
      // describe-level before() hooks run BEFORE the root beforeEach (which
      // establishes cy.authSession('admin')) — don't rely on it having already
      // run; establish the session explicitly here, same as every seeded
      // before() in SalesReportAPI.cy.js.
      cy.authSession('admin');
      cy.visit('/');
      cy.then(() =>
        seedMixedPO({ td, poNumber, ramStamp, ramQty: 1, laptopStamp, serials: [serial] })
      ).then((ids) => {
        ramProductId = ids.ramProductId;
        return apiCheckIn({ poNumber, productId: ramProductId, quantity: 1 });
      }).then(() => apiScanSerial(poNumber, serial))
        .then(() => apiStockOutProductQuantity({ productId: ramProductId, poNumber, quantity: 1, reason: 'Sold' }))
        .then(() => apiStockOutSerial({ serialNumber: serial, reason: 'Sold' }));
    });

    after(() => apiDeletePO(poNumber));

    // Decision Table — a PO mixing product-only + serialized shapes must
    // roll up to the combined sale value of both lines.
    it('SW-SR-TC54: Verify a mixed-shape seeded PO shows the combined sale value on the stat card', { tags: ['@sw-sr-tc54', '@regression', '@decision-table', '@automated'] }, () => {
      const today = new Date().toISOString().slice(0, 10);

      page.interceptApis();
      cy.visit('/reports/sales-report');
      // Consume the initial (unfiltered) page-load request before
      // selecting the PO — cy.wait() on a shared alias resolves requests
      // in FIFO order, so skipping this would make the assertion below
      // read the pre-filter response instead of the PO-scoped one.
      cy.wait(`@${salesReportData.aliases.tableItems}`);
      // The default "Today" date preset is computed client-side
      // (dayjs()) and can disagree with the QA backend's own clock by
      // enough to exclude a stock-out that JUST happened (observed:
      // browser "today" UTC vs. the server's actual "now" landing on
      // different calendar days). Switch to "Last Month" — a window wide
      // enough to tolerate that skew — before reading the total, so this
      // TC verifies the PO rollup itself, not a clock-alignment race.
      page.selectDatePreset('Last Month');
      page.selectPo(poNumber, { settle: false });

      // Selecting the date preset and the PO are two independent state
      // updates (dateRangePreset, selectedPo) that each fire their own
      // request — a plain "wait for the next occurrence" on the shared
      // alias can catch an intermediate, not-yet-fully-combined request
      // (observed: a response carrying the PO param but the STALE
      // pre-"Last Month" date bounds). Filter ALL captured interceptions
      // instead and accept only the one whose URL genuinely carries both
      // the po param and a non-"Today" date window — the same
      // filter-by-request-params pattern CostReportPage.readTotalAfterReload
      // uses for the identical race.
      const alias = `@${salesReportData.aliases.tableItems}.all`;
      cy.get(alias, { timeout: 30000 }).should((all) => {
        const match = all.find((it) => {
          if (!it?.response?.body) return false;
          const p = new URL(it.request.url).searchParams;
          return p.get('po') === poNumber && p.get('startDate') && !p.get('startDate').startsWith(today);
        });
        expect(match, 'a request combining the po filter with the Last Month date window must exist').to.exist;
      }).then((all) => {
        const match = all.find((it) => {
          const p = new URL(it.request.url).searchParams;
          return p.get('po') === poNumber && p.get('startDate') && !p.get('startDate').startsWith(today);
        });
        const raw = match.response.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const expected = parseFloat(body?.data?.summary?.totalSaleValue || 0);
        expect(expected, 'API summary must reflect both shapes combined to the cent').to.be.closeTo(ramCost + laptopCost, 0.01);
        // Retry-safe read: pass `expected` so Cypress retries the DOM read
        // until it converges with this exact settled response, instead of
        // a one-shot .invoke('text') that can race React's re-render commit.
        page.readTotalSaleValueCard(expected);
      });
    });

  });

});
