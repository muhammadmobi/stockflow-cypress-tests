/**
 * Asset Lifecycle Report UI Tests — SW-ALR-TC01..18 (+ 2 manual, TC19-20)
 * =============================================================================
 * Mirrors:  cypress/e2e/reports/AssetLifecycleReport/AssetLifecycleReportAPI.cy.js
 * Frontend: Frontend/src/components/Reports/AssetLifecycleReport/index.tsx +
 *           AssetLifecycleMobileCardList.tsx
 * Plan:     cypress/qa/testPlans/Reports/assetLifecycleReport/plan.md
 *
 * Scope note (read directly from source, not carried over from a sibling
 * report screen — see plan.md §6.1): every arithmetic/cost/status-transition
 * claim (asset-id generation gate, cost invariance, WMS location/container
 * parity, the sold/stockedout decision, the work-order Reserved/sold flow)
 * is proven by AssetLifecycleReportAPI.cy.js. This UI suite stays at the
 * wiring layer: do the filters reach that proven backend, does the Status
 * chip relabel a Sold row correctly, does the Flow column map to a human
 * label, does the Lifecycle link target the right URL, and does Column
 * Customization / sorting / the mobile card list work. It therefore seeds a
 * lighter chain than the API suite (asset-id generation + one regular
 * reason=Sold stock-out) — no WMS/work-order seeding is needed here, since
 * those are already proven state transitions on the API side.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/assetLifecycleReportData.json';
import AssetLifecycleReportPage from '../../../pageObjects/AssetLifecycleReportPage';
import { apiCall, buildLaptopRow, createExcelFile } from '../../../support/helpers/allPosHelpers';
import { importExcel } from '../../../support/helpers/incomingInventoryHelpers';
import { apiGetProductIdForPO, apiScanSerial, apiDeletePO } from '../../../support/helpers/poCloseHelpers';
import { borrowGeneralConfigFlag, restoreGeneralConfigFlag } from '../../../support/helpers/generalConfigApiHelpers';

describe('Asset Lifecycle Report Tests', () => {
  let page;

  // One disposable PO with 2 serials on the repo's standard `laptop` category:
  // serialA stays Available (used by every filter/search/sort/export/mobile
  // TC below); serialB is stocked out with reason=Sold and serialC with
  // reason=Lost — the contrasting pair TC16 needs to prove the chip
  // relabeling is conditional on reason=Sold specifically, not on
  // status=StockedOut alone.
  const poNumber = `PO-ALR-UI-${Date.now()}`;
  const stamp = `ALR-UI-${Date.now()}`;
  const serialA = `SN-ALR-UI-A-${Date.now()}`;
  const serialB = `SN-ALR-UI-B-${Date.now()}`;
  const serialC = `SN-ALR-UI-C-${Date.now()}`;
  const parentSerialA = `PARENT-UI-${Date.now()}`;
  const search = `${td.products.laptop.modelNumber}-${stamp}`;

  let productId;
  let assetIdA;
  let categoryId;

  // Deletes the persistent per-user Customize Columns config row so the
  // report always starts from index.tsx's own hardcoded defaultColumns —
  // called in BOTH before() and after() so a prior run's un-cleaned-up
  // state (e.g. an earlier aborted run, or a version of this file that
  // predates this cleanup) can't leak into the current one either.
  function deleteColumnConfig() {
    apiCall('GET', '/configs?type=assetLifecycleReportCustomizeColumn&name=assetLifecycleReportCustomizeColumn').then((res) => {
      const rows = res.body?.data?.list || [];
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (row?.id) apiCall('DELETE', `/configs/${row.id}`);
      });
    });
  }

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    deleteColumnConfig();
    // General config `requireWorkOrderForStockOut` (confirmed ON on Dev, off
    // on QA) makes stockout-by-serial-number reject any call with no
    // `orderNumber` — off for the duration of this seed so the regular
    // reason=Sold stock-out below succeeds regardless of environment.
    // Borrowed, not just set: after() restores whatever the environment had
    // and asserts it landed, so this suite cannot leave General Config altered
    // for every other suite sharing the stack.
    borrowGeneralConfigFlag('requireWorkOrderForStockOut', false);
    createExcelFile(`${stamp}.xlsx`, [
      buildLaptopRow({ categories: { laptop: td.categories.laptop }, laptop: td.products.laptop }, stamp, serialA),
      buildLaptopRow({ categories: { laptop: td.categories.laptop }, laptop: td.products.laptop }, stamp, serialB),
      buildLaptopRow({ categories: { laptop: td.categories.laptop }, laptop: td.products.laptop }, stamp, serialC),
    ]);
    importExcel(`${stamp}.xlsx`, poNumber);
    apiGetProductIdForPO(poNumber, search)
      .then((id) => {
        productId = id;
        return apiScanSerial(poNumber, serialA);
      })
      .then(() => apiScanSerial(poNumber, serialB))
      .then(() => apiScanSerial(poNumber, serialC))
      .then(() => apiCall('POST', '/products/asset-id/generate', { serialNumber: serialA, parentSerialNumber: parentSerialA }))
      .then((res) => {
        expect(res.status, 'asset-id/generate serialA: HTTP').to.be.lessThan(300);
        assetIdA = res.body?.data?.assetId ?? res.body?.assetId;
      })
      .then(() => apiCall('POST', '/products/asset-id/generate', { serialNumber: serialB, parentSerialNumber: `PARENT-UI-B-${Date.now()}` }))
      .then((res) => {
        expect(res.status, 'asset-id/generate serialB: HTTP').to.be.lessThan(300);
      })
      .then(() => apiCall('POST', '/products/asset-id/generate', { serialNumber: serialC, parentSerialNumber: `PARENT-UI-C-${Date.now()}` }))
      .then((res) => {
        expect(res.status, 'asset-id/generate serialC: HTTP').to.be.lessThan(300);
      })
      .then(() =>
        apiCall('POST', '/products/stockout-by-serial-number', {
          serialNumber: serialB,
          reason: data.reasons.sold,
          description: 'Seeded by 36-AssetLifecycleReportTests.cy.js',
          status: 'StockedOut',
        })
      )
      .then((res) => {
        expect(res.status, 'stockout serialB (reason=Sold): HTTP').to.be.lessThan(300);
      })
      .then(() =>
        // Contrast for SW-ALR-TC16: same status=StockedOut, but reason=Lost —
        // must NOT relabel to "Sold".
        apiCall('POST', '/products/stockout-by-serial-number', {
          serialNumber: serialC,
          reason: data.reasons.lost,
          description: 'Seeded by 36-AssetLifecycleReportTests.cy.js',
          status: 'StockedOut',
        })
      )
      .then((res) => {
        expect(res.status, 'stockout serialC (reason=Lost): HTTP').to.be.lessThan(300);
      })
      .then(() => apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`))
      .then((res) => {
        categoryId = res.body?.data?.list?.[0]?.categoryId;
      });
  });

  after(() => {
    // Shared state first: a throwing cleanup call aborts the rest of the hook,
    // and a General Config flag left flipped affects every other suite on the
    // environment, whereas an undeleted PO only clutters our own footprint.
    restoreGeneralConfigFlag('requireWorkOrderForStockOut');
    apiDeletePO(poNumber);
    // SW-ALR-TC10 removes the "Flow" column via Customize Columns, which
    // PATCHes a persistent per-user config row (assetLifecycleReportCustomizeColumn)
    // — without cleanup here, that removal survives past this spec run and
    // silently breaks any other test/run that assumes the default column set
    // (observed: SW-ALR-TC18 failing because "Flow" no longer rendered at
    // all). Deleting the row restores index.tsx's own hardcoded defaultColumns.
    deleteColumnConfig();
  });

  beforeEach(() => {
    page = new AssetLifecycleReportPage();
    cy.authSession('admin');
  });

  // ── Page load, core layout (SW-ALR-TC01-02) ─────────────────────────────────

  describe('Page load and core layout', () => {
    // EP — happy-path representative: every core control renders
    it('SW-ALR-TC01: Verify the report page renders its core layout', { tags: ['@smoke'] }, () => {
      page.visit();
      page.loc.searchInput().should('be.visible');
      page.loc.categorySelect().should('be.visible');
      page.loc.statusSelect().should('be.visible');
      page.loc.poDropdownValue().should('be.visible');
      page.loc.exportButton().should('be.visible');
      page.loc.tableContainer().should('be.visible');
    });

    // Use Case — KPI/header wiring, not re-deriving report arithmetic
    it('SW-ALR-TC02: The asset count text matches the API pagination count', { tags: ['@regression'] }, () => {
      // Read from page.visit()'s own returned interception, not a fresh
      // cy.get('@alias') — a live run showed a background revalidation
      // request can follow shortly after mount, so re-querying the alias a
      // moment later can catch that second, still-in-flight interception
      // and read an undefined response body instead of the initial load's.
      page.visit().then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const expectedCount = body?.data?.pagination?.count;
        expect(expectedCount, 'API must return a numeric pagination.count').to.be.a('number');
        page.loc.assetCountText().invoke('text').should('include', String(expectedCount));
      });
    });
  });

  // ── Filters (SW-ALR-TC03-07) ─────────────────────────────────────────────────

  describe('Filters', () => {
    // Use Case — real containment assertion, not a tautology
    it('SW-ALR-TC03: Search narrows the table to the seeded item', { tags: ['@regression'] }, () => {
      page.visit();
      page.search(serialA).then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const list = body?.data?.list || [];
        expect(list, `search="${serialA}" must return exactly the seeded item`).to.have.length(1);
        page.getTableRows().should('have.length', 1);
      });
    });

    // Decision Table — category filter narrows the table to match the API
    it('SW-ALR-TC04: Selecting a category narrows the table to match the API', { tags: ['@regression'] }, function () {
      if (!categoryId) this.skip();
      page.visit();
      page.selectCategory(categoryId).then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const apiCount = (body?.data?.list || []).length;
        page.getTableRows().should('have.length', apiCount);
      });
    });

    // Decision Table — status filter narrows the table to match the API
    it('SW-ALR-TC05: Selecting the Sold status narrows the table to match the API', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectStatus(data.statuses.find((s) => s.label === 'Sold').value).then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const apiCount = (body?.data?.list || []).length;
        page.getTableRows().should('have.length', apiCount);
      });
    });

    // State Transition — reverting to "All Categories" clears the categoryId param
    it('SW-ALR-TC06: Reverting to "All Categories" restores the unfiltered list', { tags: ['@regression'] }, function () {
      if (!categoryId) this.skip();
      page.visit();
      page.selectCategory(categoryId);
      page.selectAllCategories().then((interception) => {
        const url = new URL(interception.request.url);
        expect(url.searchParams.get('categoryId'), 'reverting to All Categories must carry no categoryId param').to.satisfy(
          (v) => v === null || v === ''
        );
      });
    });

    // Use Case — PO filter wiring
    it('SW-ALR-TC07: Selecting the seeded PO narrows every row to that PO', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poNumber).then(() => {
        page.assertColumnContains(data.columns.po, poNumber);
      });
    });
  });

  // ── Lifecycle link, export, column customization, sort (SW-ALR-TC08-11) ────

  describe('Lifecycle link, export, column customization, sorting', () => {
    // Use Case — Lifecycle link is a real, visible UI element AND targets the correct destination URL
    it('SW-ALR-TC08: The "View Report" link opens the asset-id search page for that row', { tags: ['@regression'] }, function () {
      if (!assetIdA) this.skip();
      page.visit();
      page.search(serialA);
      // page.search() only waits for the network request to settle, not for
      // React to re-render the table with the filtered data — a live run
      // showed clicking row 0 immediately after could still hit the PREVIOUS
      // (unfiltered) render's first row. Force Cypress's retry-ability to
      // wait for the DOM to actually reflect exactly 1 row before clicking.
      page.getTableRows().should('have.length', 1);
      // UI-element check (not just the stubbed function call below): the
      // link must be a real element carrying the documented label — MuiLink
      // renders as a <button> here (no href to assert on). NOT
      // `.should('be.visible')`: a live run showed Cypress's visibility
      // algorithm flags this element as clipped by the narrow (120px)
      // Lifecycle column's `overflow`/`white-space: nowrap` styling, even
      // though it remains genuinely clickable (proven by the click below
      // succeeding reliably) — `exist` + content is the honest UI-observable
      // claim here, not a stricter visibility check this element can't meet.
      page.loc.lifecycleLinkInRow(0).should('exist').and('contain.text', 'View Report');
      page.clickLifecycleLink(0);
      cy.get('@lifecycleWindowOpen').should('have.been.calledWithMatch', new RegExp(`/asset-id/search\\?assetId=${encodeURIComponent(assetIdA)}`));
      // Harden further: window.open('_blank') must open a SEPARATE tab, not
      // navigate the current one — confirm the current tab's own URL is
      // unaffected by the click (a regression that swapped window.open for
      // a same-tab navigation would still satisfy the stub-call assertion
      // above if it also happened to call window.open, but this catches an
      // unwanted same-tab redirect that assertion alone would miss).
      cy.url().should('include', '/reports/asset-lifecycle-report');
    });

    // Use Case — export button wiring
    it('SW-ALR-TC09: Clicking Export enqueues the deferred export job', { tags: ['@regression'] }, () => {
      // The export is DEFERRED now (index.tsx handleExport): the button POSTs
      // to enqueue a background job and returns immediately — the .xlsx is
      // streamed server-side and announced later by ExportCompletionListener.
      // It no longer performs a blocking GET download, so this TC used to time
      // out with "No request ever occurred" while waiting on the old GET. The
      // GET route still exists on the controller and is covered API-side by
      // SW-ALR-API-TC30..34; the UI's contract is the enqueue POST plus the
      // confirmation toast, which is what the user actually observes.
      page.visit();
      cy.intercept('POST', `**${data.apis.export}`).as(data.aliases.export);
      page.clickExportButton();
      cy.wait(`@${data.aliases.export}`).then(({ response }) => {
        expect(response.statusCode, 'the enqueue request must be accepted').to.be.oneOf([200, 201]);
      });
      cy.contains(data.messages.exportQueued, { matchCase: false }).should('be.visible');
    });

    // Decision Table — core (chip-only) vs. attribute-backed (checkbox) column removal
    it('SW-ALR-TC10: Removing the Flow column (a core column, chip-delete only) removes it from the table', { tags: ['@regression'] }, () => {
      // Flow is a hardcoded core report column (like Asset ID/Product/Category/
      // Cost/...), confirmed via a live run to have NO checkbox in the
      // Customize Columns attribute grid — only attribute-backed columns
      // (Brand, Model, Location, ...) appear there. Core columns are removed
      // via their "Selected Columns" chip instead (removeCoreColumnAndSave).
      page.visit();
      page.loc.tableHeaderCell(data.columns.flow).should('exist');
      page.openCustomizeColumns();
      page.removeCoreColumnAndSave(data.columns.flow);
      page.loc.tableContainer().find('thead th').contains(data.columns.flow).should('not.exist');
      // Self-cleaning: removing a core column has no UI "undo" (no checkbox
      // to re-check once its chip is deleted — see removeCoreColumnAndSave's
      // own comment), so restore the default column set via API immediately
      // rather than deferring to the describe's after() — a live run showed
      // that leaves every LATER test in this same run (e.g. SW-ALR-TC18)
      // seeing "Flow" still missing, since after() only fires once, at the
      // very end of the whole spec.
      deleteColumnConfig();
    });

    // State Transition — sort header click toggles the API's sortBy param AND the rendered table re-sorts
    it('SW-ALR-TC11: Clicking the Cost column header sends sortBy=cost AND the rendered rows are genuinely re-sorted', { tags: ['@regression'] }, function () {
      page.visit();
      page.getTableRows().then(($rowsBefore) => {
        if ($rowsBefore.length < 2) this.skip();
      });
      page.clickColumnHeader(data.columns.cost).then((interception) => {
        const url = new URL(interception.request.url);
        const sortOrder = url.searchParams.get('sortOrder');
        expect(url.searchParams.get('sortBy'), 'the triggered request must carry sortBy=cost').to.equal('cost');
        expect(sortOrder, 'the triggered request must carry a sortOrder').to.be.oneOf(['ASC', 'DESC']);
        // API-level proof (the request asked for the right sort) is not the
        // same claim as "the screen re-rendered accordingly". A single
        // .then() read of the Cost cells right after the request settles
        // can catch the PREVIOUS render (a live run caught exactly this:
        // the request reported DESC while the still-stale DOM read back
        // ascending order) — .should() on the row collection re-queries the
        // DOM fresh on every retry, so it only passes once React has
        // actually re-rendered to match the settled request.
        page.loc.tableContainer().find('thead th').then(($headers) => {
          const colIndex = [...$headers].findIndex((th) => th.textContent.trim().toLowerCase().includes(data.columns.cost.toLowerCase()));
          expect(colIndex, 'Cost column must be visible').to.be.gte(0);
          page.loc.tableContainer().find('tbody tr').should(($rows) => {
            const numbers = [...$rows].map((row) => parseFloat(row.cells[colIndex]?.textContent || '0'));
            for (let i = 1; i < numbers.length; i++) {
              if (sortOrder === 'DESC') {
                expect(numbers[i], `row ${i} Cost must be <= row ${i - 1} (DESC)`).to.be.at.most(numbers[i - 1]);
              } else {
                expect(numbers[i], `row ${i} Cost must be >= row ${i - 1} (ASC)`).to.be.at.least(numbers[i - 1]);
              }
            }
          });
        });
      });
    });
  });

  // ── Pagination, mobile (SW-ALR-TC12-15) ──────────────────────────────────────

  describe('Pagination and mobile', () => {
    // BVA — pagination boundary (page 1 / page 2 disjoint)
    it('SW-ALR-TC12: Pagination boundary — page 2 is disjoint from page 1', { tags: ['@regression'] }, function () {
      page.visit().then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const total = body?.data?.pagination?.count ?? 0;
        if (total <= data.pagination.defaultPageSize) this.skip();
        page.getTableRows().then(($page1Rows) => {
          const page1Text = [...$page1Rows].map((r) => r.innerText);
          page.goToNextPage();
          // .should() (not .then()) re-queries tbody tr and re-evaluates the
          // whole comparison on every retry until it passes or times out —
          // page.goToNextPage() only waits for the network request to
          // settle, not for React to finish re-rendering with page 2's rows,
          // so a bare .then() snapshot can read page 1's still-rendered DOM
          // (a live run caught exactly that: all 25 "page 2" rows identical
          // to page 1).
          page.loc.tableContainer().find('tbody tr').should(($page2Rows) => {
            const page2Text = [...$page2Rows].map((r) => r.innerText);
            const overlap = page2Text.filter((t) => page1Text.includes(t));
            expect(overlap, 'page 2 should not repeat page 1 rows').to.have.length(0);
          });
        });
      });
    });

    describe('Mobile viewport', () => {
      beforeEach(() => cy.viewport('iphone-x'));

      // Decision Table — mobile viewport swaps the table for the bespoke card list
      it('SW-ALR-TC13: Mobile viewport renders the card list instead of the table', { tags: ['@regression'] }, () => {
        page.visit();
        // NOT page.loc.tableContainer() here: that locator chains .first(),
        // which forces cy.get() to wait for at least one match before
        // .first().should('not.exist') can even run — on a viewport with
        // truly zero matches this times out instead of passing. Assert
        // directly on the bare selector instead.
        page.loc.tableContainerAny().should('not.exist');
        page.getMobileCards().should('have.length.greaterThan', 0);
      });

      // Use Case — View More/View Less toggle
      it('SW-ALR-TC14: A mobile card\'s "View More" toggle expands its secondary fields', { tags: ['@regression'] }, () => {
        page.visit();
        page.loc.mobileViewMoreLink().should('be.visible').click();
        page.loc.mobileViewLessLink().should('be.visible');
      });

      // Error Guessing — guaranteed-zero-match search hits the mobile empty state
      it('SW-ALR-TC15: A guaranteed-no-match search shows the mobile empty-state message', { tags: ['@regression'] }, () => {
        page.visit();
        page.search(`NOMATCH-${Date.now()}`);
        page.loc.mobileEmptyState().should('be.visible');
      });
    });
  });

  // ── Frontend rendering — Status / Flow / Cost (SW-ALR-TC16-18) ──────────────

  describe('Status chip, Cost, Flow rendering', () => {
    // Decision Table — displayStatus relabels StockedOut+reason=Sold as "Sold",
    // but a StockedOut+reason=Lost row (same raw status) keeps "Stocked Out" —
    // both columns of the decision are asserted, not just the positive case.
    it('SW-ALR-TC16: The Status chip relabels a Sold item as "Sold", but a Lost-reason StockedOut item keeps "Stocked Out"', { tags: ['@regression'] }, () => {
      page.visit();
      page.search(serialB);
      page.loc.statusChipInRow(0).should('have.text', data.reasons.sold);

      page.visit();
      page.search(serialC);
      // NOT "Stocked Out" (with a space) — displayStatus falls through to the
      // raw `value` when the reason isn't "Sold", and the raw InventoryStatus
      // enum string is "StockedOut" (no humanization applied in this branch,
      // confirmed by reading the Cell renderer directly).
      page.loc.statusChipInRow(0).should('have.text', data.statuses.find((s) => s.label === 'Stocked Out').value);
    });

    // Use Case — Cost column rendering contract
    it('SW-ALR-TC17: The Cost column renders a fixed 2-decimal numeric value', { tags: ['@regression'] }, () => {
      // AmountCell renders a plain fixed-point number here (confirmed via a
      // live run: "1799.99", no currency symbol or thousands separator) —
      // not the Intl.NumberFormat currency string other screens' stat cards
      // use. Assert the actual contract, not an assumed one.
      page.visit();
      page.search(serialA);
      page.getCellText(data.columns.cost, 0).should('match', /^\s*\d+\.\d{2}\s*$/);
    });

    // Decision Table — FLOW_LABELS maps the raw enum to a human label
    it('SW-ALR-TC18: The Flow column renders "Single Asset ID Update", not the raw enum', { tags: ['@regression'] }, () => {
      page.visit();
      page.search(serialA);
      page.getCellText(data.columns.flow, 0)
        .should('match', new RegExp(`^${Cypress._.escapeRegExp(data.flowLabels.SINGLE_GENERATE_ASSET_ID)}$`, 'i'));
    });
  });
});
