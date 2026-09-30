/**
 * Inventory Aging Report UI Tests — SW-IAR-TC01..18 (+ 2 manual, TC19-20)
 * =============================================================================
 * Mirrors:  cypress/e2e/reports/InventoryAgingReport/InventoryAgingReportAPI.cy.js
 * Frontend: Frontend/src/components/Reports/InventoryAgingReport/index.tsx +
 *           AgingCharts.tsx + AgingMobileCardList.tsx
 * Plan:     cypress/qa/testPlans/inventoryAgingReport/plan.md
 *
 * Scope note (read directly from source, not assumed from sibling report
 * screens — see plan.md §6.6): this screen has NO PO filter, NO Group By, NO
 * Customize Columns, NO Status filter, and its `asOfDate` state is never set
 * by any rendered control (the LocalizationProvider/AdapterDayjs imports are
 * dead code today) — so there is no UI path to exercise As-of Date; that
 * arithmetic is fully covered by InventoryAgingReportAPI.cy.js instead
 * (TC15-21). Only the Category column is sortable (every bucket column and
 * Product Name explicitly set `enableSorting: false`) — TC15/TC16 confirm
 * both halves of that contract.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/inventoryAgingReportData.json';
import urls from '../../../fixtures/urls.json';
import InventoryAgingReportPage from '../../../pageObjects/InventoryAgingReportPage';
import { seedProductOnlyPO, apiCheckIn, apiDeletePO } from '../../../support/helpers/poCloseHelpers';

// An intercepted response body arrives as an object or as a raw JSON string
// depending on how the app issued the request — normalise both.
const responseBodyOf = (interception) => {
  const raw = interception?.response?.body;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};

describe('Inventory Aging Report Tests', () => {
  let page;

  // One disposable pure-product PO, shared by every TC that needs a real,
  // known-category row to search or filter for. A PO seeded "today" and
  // checked in has no prior history, so it lands deterministically in the
  // 0-30 bucket.
  //
  // Deliberately seedProductOnlyPO, NOT the mixed (ram + serialized laptop)
  // seeder the API suite uses: no UI test asserts on a serialized product, so
  // importing a laptop row and scanning its serial would cost an extra import
  // + scan round-trip per run and leave data behind for nothing. The
  // serialized aging path is proven in InventoryAgingReportAPI.cy.js (TC16).
  const poNumber = `PO-IAR-UI-${Date.now()}`;
  const ramStamp = `IAR-ui-r-${Date.now()}`;
  const ramSearch = `${td.products.ram.memoryGeneration}-${ramStamp}`;
  const ramQty = 3;
  const ramCategoryName = td.categories.ram;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedProductOnlyPO({ td, poNumber, stamp: ramStamp, quantity: ramQty }).then((ramProductId) =>
      apiCheckIn({ poNumber, productId: ramProductId, quantity: ramQty })
    );
  });

  after(() => apiDeletePO(poNumber));

  beforeEach(() => {
    page = new InventoryAgingReportPage();
    cy.authSession('admin');
  });

  // ── Page load, KPI tiles, charts (SW-IAR-TC01-03) ───────────────────────────

  describe('Page load, KPI tiles, charts', () => {
    // EP — happy-path representative
    it('SW-IAR-TC01: Verify the report page renders its core layout', { tags: ['@smoke'] }, () => {
      page.visit();
      page.loc.searchInput().should('be.visible');
      page.loc.categorySelect().should('be.visible');
      page.loc.exportButton().should('be.visible');
      page.loc.tableContainer().should('be.visible');
      page.getTableRows().should('have.length.greaterThan', 0);
    });

    // EP — all 4 KPI tiles are present
    it('SW-IAR-TC02: All four KPI tile labels are visible', { tags: ['@regression'] }, () => {
      page.visit();
      Object.values(data.kpiTiles).forEach((label) => page.loc.kpiTile(label).should('be.visible'));
    });

    // EP — both charts render with their documented titles
    it('SW-IAR-TC03: Both chart cards render with the documented titles', { tags: ['@regression'] }, () => {
      page.visit();
      page.loc.chartCard(data.charts.donutTitle).should('be.visible');
      page.loc.chartCard(data.charts.barTitle).should('be.visible');
    });
  });

  // ── Search / category filters (SW-IAR-TC04-07) ──────────────────────────────

  describe('Search / category filters', () => {
    // Use Case — real containment assertion, not a tautology
    it('SW-IAR-TC04: Search narrows the table to rows containing the seeded product', { tags: ['@regression'] }, () => {
      page.visit();
      page.search(ramSearch).then((interception) => {
        const list = responseBodyOf(interception)?.data?.list || [];
        expect(list, `search="${ramSearch}" must return exactly the seeded ram row`).to.have.length(1);
        page.getTableRows().should('have.length', 1);
      });
    });

    // State Transition — clearing the box (not a second Search click) auto-resets.
    // The "search returned exactly 1 row" assertion belongs to TC04 and is not
    // repeated here; this TC's subject is the reset transition alone.
    it('SW-IAR-TC05: Clearing the search box auto-resets without a second Search click', { tags: ['@regression'] }, () => {
      page.visit();
      page.search(ramSearch);
      page.clearSearchByTyping().then((interception) => {
        const url = new URL(interception.request.url);
        expect(url.searchParams.get('search'), 'the follow-up request must carry no search param').to.satisfy((v) => v === null || v === '');
      });
    });

    // Decision Table — category filter narrows the table to match the API
    it('SW-IAR-TC06: Selecting a category narrows the table to match the API response', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectCategory(ramCategoryName).then((interception) => {
        const apiCount = (responseBodyOf(interception)?.data?.list || []).length;
        page.getTableRows().should('have.length', apiCount);
      });
    });

    // State Transition — reverting to "All Categories" restores the full list
    it('SW-IAR-TC07: Reverting to "All Categories" restores the unfiltered list', { tags: ['@regression'] }, () => {
      page.visit();
      page.getTableRows().then(($unfilteredRows) => {
        const unfilteredCount = $unfilteredRows.length;
        page.selectCategory(ramCategoryName);
        page.selectAllCategories().then((interception) => {
          const apiCount = (responseBodyOf(interception)?.data?.list || []).length;
          expect(apiCount, 'reverting to All Categories must not still be scoped to a category').to.equal(unfilteredCount);
        });
      });
    });
  });

  // ── KPI correctness, collapse toggle (SW-IAR-TC08-09) ───────────────────────

  describe('KPI correctness and the collapse toggle', () => {
    // Use Case — KPI tile wiring, not re-deriving report arithmetic (that's the API suite's job)
    it('SW-IAR-TC08: The "Total Quantity" KPI tile matches the API summary.totalQty', { tags: ['@regression'] }, () => {
      // Chains off visit()'s returned INITIAL interception rather than
      // re-reading the alias: a background revalidation can follow shortly
      // after mount, so a fresh cy.get('@alias') can yield that second,
      // still-in-flight request instead (see InventoryAgingReportPage.visit()).
      page.visit().then((interception) => {
        const expectedQty = Math.round(parseFloat(responseBodyOf(interception)?.data?.summary?.totalQty ?? NaN));
        expect(expectedQty, 'API must return a numeric summary.totalQty').to.be.a('number').and.not.be.NaN;
        page.getKpiTileValue(data.kpiTiles.totalQuantity).should(($el) => {
          const domQty = parseInt($el.text().replace(/,/g, ''), 10);
          expect(domQty, `KPI tile must render ${expectedQty}`).to.equal(expectedQty);
        });
      });
    });

    // State Transition — toggle hides then restores the Aging Overview panel
    it('SW-IAR-TC09: The collapse toggle hides and restores the Aging Overview panel', { tags: ['@regression'] }, () => {
      page.visit();
      page.loc.kpiTile(data.kpiTiles.totalInventoryCost).should('be.visible');
      page.toggleCharts();
      page.loc.kpiTile(data.kpiTiles.totalInventoryCost).should('not.exist');
      page.toggleCharts();
      page.loc.kpiTile(data.kpiTiles.totalInventoryCost).should('be.visible');
    });
  });

  // ── Export (SW-IAR-TC10-11) ──────────────────────────────────────────────────

  describe('Export', () => {
    // Use Case — export request fires and the response names the file the
    // screen then saves. The filename is asserted from the response's own
    // content-disposition rather than from the downloads folder: index.tsx's
    // handleExport builds the download from an in-memory Blob + a synthetic
    // <a download> click, so nothing about the saved name is observable to
    // Cypress — the server header is the real, assertable contract.
    it('SW-IAR-TC10: Clicking Export requests the report and is served a correctly-named .xlsx', { tags: ['@regression'] }, () => {
      page.visit();
      page.interceptExport();
      page.clickExportButton();
      page.waitForExport().then((interception) => {
        expect(interception.response.statusCode, 'the export request must succeed').to.equal(200);
        expect(
          interception.response.headers['content-disposition'],
          `an unfiltered export must be served as ${data.export.filenamePattern}`
        ).to.include(data.export.filenamePattern);
      });
    });

    // State Transition — button label cycles Export → Exporting… → Done.
    //
    // All THREE states are asserted, including the transient middle one. An
    // earlier version checked only Export → Done, so the title named a state
    // the body never observed (SKILL.md §8.1 Coherence): the test would have
    // passed against a button that never rendered 'Exporting…' at all.
    // Observing it requires slowing the response — the real export returns
    // faster than an assertion can catch the intermediate render — so the
    // intercept delays the SERVER's own response rather than stubbing one
    // (see interceptExport's rationale). Labels come from the fixture because
    // the ellipsis is a single U+2026 character, not three dots.
    it('SW-IAR-TC11: The Export button label transitions Export → Exporting… → Done', { tags: ['@regression'] }, () => {
      const label = data.export.buttonLabels;
      page.visit();
      page.interceptExport({ delayMs: data.export.observeBusyDelayMs });
      page.loc.exportButton().should('have.text', label.idle);
      page.clickExportButton();
      page.loc.exportButton().should('have.text', label.busy);
      page.waitForExport();
      page.loc.exportButton().should('have.text', label.done);
    });
  });

  // ── Role gating (SW-IAR-TC12-13) — the confirmed nav-hide vs. route-reachable gap ──

  describe('Role gating', () => {
    // EP — nav item is hidden for Sales (nav-config-dashboard.tsx: !isSales())
    //
    // PROBE-THEN-SKIP, not it.skip(): no Sales account exists in the IAM
    // realm today (the app provides no way to create one — see pending.md), so
    // cy.credentials('sales') resolves an empty username and this TC skips
    // itself. Written this way rather than as a hard it.skip() so it
    // self-enables the moment the account is provisioned in cypress.env.json /
    // CYPRESS_QA_SALES_* — a hard skip would silently stay dead forever.
    it('SW-IAR-TC12: The nav item is hidden for the Sales role', { tags: ['@regression'] }, function () {
      cy.credentials('sales').then(({ username }) => {
        if (!username) this.skip();
        cy.authSession('sales');
        cy.visit('/dashboard');
        cy.contains(/^Inventory Aging Report$/).should('not.exist');
      });
    });

    // Decision Table / Error Guessing — the reachability gap this TC used to
    // document is closed: the Sales role now mounts an Inventory-only route set
    // (`salesDashboardRoutes`), so the report has no route to fall through to
    // and the catch-all renders the not-found view. The nav hide in TC12 is no
    // longer the only thing standing between Sales and the page.
    // Same probe-then-skip as TC12 — no Sales account exists yet (pending.md).
    it('SW-IAR-TC13: A Sales user cannot reach the report via a direct URL', { tags: ['@regression'] }, function () {
      cy.credentials('sales').then(({ username }) => {
        if (!username) this.skip();
        cy.authSession('sales');
        // Raw cy.visit — page.visit() waits on the report API, which never
        // fires when the route doesn't resolve for this role.
        cy.visit(urls.inventoryAgingReport);
        cy.contains(/sorry, page not found/i, { timeout: 15000 }).should('be.visible');
        page.loc.tableContainer().should('not.exist');
      });
    });
  });

  // ── Pagination, sorting (SW-IAR-TC14-16) ─────────────────────────────────────

  describe('Pagination and sorting', () => {
    // BVA — page 2 disjoint from page 1.
    //
    // Rows are compared by PRODUCT ID from each page's own response, not by the
    // rendered row text. A live run proved row text is not an identity on this
    // screen: many products render a blank or fallback ("Product name not
    // defined") Product Name and all-zero bucket cells, so genuinely different
    // products produce byte-identical `innerText`. The earlier text-based
    // version reported all 25 of page 2's rows as repeats of page 1 — an
    // artefact of that collision, not evidence of a backend paging bug. The id
    // comparison is a true identity and still catches a real ORDER BY
    // tiebreaker defect if one exists.
    it('SW-IAR-TC14: Pagination boundary — page 2 is disjoint from page 1', { tags: ['@regression'] }, function () {
      page.visit().then((firstInterception) => {
        const firstBody = responseBodyOf(firstInterception);
        const total = firstBody?.data?.pagination?.count ?? 0;
        if (total <= data.pagination.defaultPageSize) this.skip();
        const page1Ids = (firstBody?.data?.list || []).map((r) => r.id);
        expect(page1Ids, 'page 1 must return rows to compare against').to.have.length.greaterThan(0);

        page.goToNextPage().then((secondInterception) => {
          const page2Ids = (responseBodyOf(secondInterception)?.data?.list || []).map((r) => r.id);
          const overlap = page2Ids.filter((id) => page1Ids.includes(id));
          expect(overlap, `page 2 must not repeat any product id from page 1 (repeated: ${overlap.join(', ')})`).to.have.length(0);
        });
      });
    });

    // State Transition — Category is the ONLY sortable column; its header
    // cycles the sort state unsorted -> ASC -> DESC. Asserting on the DESC
    // request (not the ASC one) is what makes this discriminating: index.tsx's
    // buildParams() already sends sortBy=categoryName&sortOrder=ASC on every
    // request by default, so an ASC assertion would hold even if the click did
    // nothing at all. Only a real second click can produce sortOrder=DESC.
    it('SW-IAR-TC15: Clicking the Category header drives sortBy=categoryName through its ASC → DESC cycle', { tags: ['@regression'] }, () => {
      page.visit();
      page.clickCategoryHeader('ASC');
      page.clickCategoryHeader('DESC').then((interception) => {
        const params = new URL(interception.request.url).searchParams;
        expect(params.get('sortBy'), 'Category is the only sortable column, so it must sort by categoryName').to.equal('categoryName');
        expect(params.get('sortOrder'), 'a second header click must flip the order to DESC, proving the click drove the sort').to.equal(
          'DESC'
        );
      });
    });

    // Error Guessing — every bucket column sets enableSorting:false in
    // index.tsx, so clicking its header must fire NO request. Absence is
    // proven deterministically rather than by sleeping: bracket the bucket
    // click with actions that DO fire, then count.
    //
    // The count is read only after a DESC request has provably settled, and
    // that detail is what makes this discriminating. An earlier version
    // clicked the bucket header, then Category once (ASC), and asserted the
    // total grew by exactly 1 — which the defect could satisfy. buildParams()
    // sends sortBy=categoryName&sortOrder=ASC on EVERY request, so a request
    // fired by the bucket click matches the ASC matcher; clickCategoryHeader
    // would resolve on that request rather than on its own, and the trailing
    // .should() could observe the count at +1 (bucket request registered,
    // Category request still in flight) and pass on the first retry, since
    // should() stops at first satisfaction instead of waiting for the count
    // to stabilise. The one failure mode this TC exists to catch was the one
    // it could miss.
    //
    // Only a real second Category click can produce sortOrder=DESC, so
    // waiting on DESC removes the in-flight ambiguity: by then both Category
    // requests are registered, and a bucket request — if one existed — would
    // make the total 3 rather than 2.
    it('SW-IAR-TC16: Clicking a bucket column header does not trigger a sort request', { tags: ['@regression'] }, () => {
      page.visit();
      cy.get(`@${data.aliases.tableItems}.all`).then((before) => {
        const beforeCount = before.length;
        page.clickNonSortableHeader(data.nonSortableColumnHeader);
        page.clickCategoryHeader('ASC');
        page.clickCategoryHeader('DESC').then(() => {
          cy.get(`@${data.aliases.tableItems}.all`).then((after) => {
            const fresh = after.slice(beforeCount);
            expect(
              fresh,
              'only the two Category clicks may fire requests — a non-sortable bucket header must fire none'
            ).to.have.length(2);
          });
        });
      });
    });
  });

  // ── Mobile / responsive (SW-IAR-TC17-18) ─────────────────────────────────────

  describe('Mobile / responsive', () => {
    beforeEach(() => cy.viewport('iphone-x'));

    // Decision Table — mobile replaces the table with the bespoke card list
    it('SW-IAR-TC17: Mobile viewport renders the card list instead of the table', { tags: ['@regression'] }, () => {
      page.visit();
      page.loc.tableContainer().should('not.exist');
      page.getMobileCards().should('have.length.greaterThan', 0);
    });

    // Error Guessing / BVA — a guaranteed-zero-match search hits the mobile empty state
    it('SW-IAR-TC18: A guaranteed-no-match search shows the mobile empty-state message', { tags: ['@regression'] }, () => {
      page.visit();
      page.search(`NOMATCH-${Date.now()}`);
      page.loc.mobileEmptyState().should('be.visible');
    });
  });
});
