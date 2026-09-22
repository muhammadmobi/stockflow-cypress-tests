// cypress/e2e/IncomingInventory/ProductDetailsStatsClickableTests.cy.js
//
// Stats-clickable feature on the Product Details page for product-item
// (hasItems=true — Laptop) products.
//
// Feature under test
// ──────────────────
//   Each quantity / status badge on the Product Details page
//   (Frontend/src/components/Item/ProductDetailStats.tsx, rendered inside
//   itemViewItemList.tsx) is wrapped in an onClick handler that calls
//   `setSelectedStatusFilter(filter)`. Setting the filter re-runs the
//   `singleProductItems` query with `?status=<filter>`, so the items table
//   below rerenders showing only items with that status.
//
// Navigation flow (from Steps for Product display stats click tests.txt)
// ──────────────────────────────────────────────────────────────────────
//   1. Go to Incoming Inventory
//   2. Select PO from the dropdown
//   3. Click first product from the table row (td[data-index="0"])
//   4. App navigates to Product Details page
//   5. Click each badge and verify the items list shows the correct count
//
// Authoring conventions (cypress/Test Automation Skill.txt)
// ────────────────────────────────────────────────────────
//   • Page Object Model — selectors / actions in ProductDetailsPage.js
//   • Fixtures — all test data from statsClickableTestData.json
//   • Helpers — API seeding via scanAllTestHelpers.js (createScanAllSuite)
//   • Comment block — every it() has @testCaseId / @description / @steps / @expectedResult
//   • No explicit waits — only cy.wait('@alias') on network intercepts
//
// ISTQB techniques
// ────────────────
//   Decision table         — badge × expected list-status pairs
//   Equivalence partitioning — non-zero badges vs zero-count badge (Sold)
//   State-transition       — toggling a selected badge clears the filter
//   Error guessing         — zero-count badge click returns empty list

import { createScanAllSuite } from '../../support/helpers/scanAllTestHelpers';
import { apiSetGeneralConfigFlags } from '../../support/helpers/generalConfigApiHelpers';
import ProductDetailsPage from '../../pageObjects/ProductDetailsPage';

// ─── Seeding helper ──────────────────────────────────────────────────────────
// Seeds 8 laptop items into `po` with the following statuses:
//   sns[0] → Missing
//   sns[1] → Damaged
//   sns[2] → Disputed
//   sns[3] → Incoming (untouched)
//   sns[4] → Available (scanned)
//   sns[5] → StockedOut (scanned then stocked out)
//   sns[6] → Reserved (scanned then reserved via work-order)
//   sns[7] → Incoming (untouched)
//
// Final badge counts: Expected=8, Incoming=2, Available=1, Received=5,
//   Missing=1, Damaged=1, Disputed=1, StockedOut=1, Reserved=1, Sold=0
function seedItemStatuses(suite, po, sns, stamp) {
  const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
  const searchTerm = `${suite.scanAllData.products.laptop.brand} ${modelNumber}`;
  cy.log(`[SEED] Seeding item statuses for PO: ${po}`);

  return suite
    .apiMarkStatusItem(po, sns[0], suite.scanAllData.status.missing)
    .then(() =>
      suite.apiMarkStatusItem(
        po,
        sns[1],
        suite.scanAllData.status.damaged,
        suite.scanAllData.defaults.damageReason,
      ),
    )
    .then(() => suite.apiMarkStatusItem(po, sns[2], suite.scanAllData.status.disputed))
    .then(() => suite.apiScanItem(po, sns[4]))
    .then(() => suite.apiScanItem(po, sns[5]))
    .then(() =>
      suite.apiStockOutBySerial(
        sns[5],
        suite.scanAllData.status.otherStockOutReason,
        `Automation-${stamp}-s5`,
      ),
    )
    .then(() => suite.apiScanItem(po, sns[6]))
    .then(() => suite.apiReserveViaWorkOrder(po, searchTerm, 1, sns[6]))
    .then(() => cy.wrap(searchTerm));
}

// Intercepts the items listing endpoint (both incoming-inventory and inventory paths).
function aliasItemsListing(alias) {
  cy.intercept(
    'GET',
    /\/(?:incoming-items\/[^/]+\/[^/]+|products\/[^/]+)\/items(?:\?|$)/,
  ).as(alias);
}

// Reads pagination count, status param, and list from the latest intercept.
function readLatestListingResponse(alias) {
  return cy.get('@' + alias).then((interception) => {
    const data = interception.response?.body?.data || {};
    return {
      count: Number(data?.pagination?.count ?? 0),
      statusParam: new URL(interception.request.url).searchParams.get('status'),
      list: Array.isArray(data?.list) ? data.list : [],
    };
  });
}

describe(
  'Product Details — Stats-Clickable badges (Product-Item)',
  { tags: ['@regression', '@statsClickable'] },
  () => {
    const suite = createScanAllSuite();
    let page;

    // ctx holds the seeded state shared across all tests in this spec.
    // seeded=false causes the first beforeEach to run the full seed flow;
    // subsequent beforeEach calls skip seeding and go straight to navigation.
    const ctx = {
      stamp: null,
      po: null,
      sns: [],
      productId: null,
      productName: null,
      seeded: false,
    };

    beforeEach(function () {
      cy.fixture('statsClickableTestData').as('clickData');
      if (!page) page = new ProductDetailsPage();

      cy.get('@clickData').then((d) => {
        // ── One-time seeding ─────────────────────────────────────────────
        if (!ctx.seeded) {
          ctx.stamp = suite.ts();
          ctx.po = `${d.po.prefix}${ctx.stamp}`;
          const fileName = `${d.fileNamePrefix}${ctx.stamp}.xlsx`;
          const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${ctx.stamp}`;
          ctx.productName = `${suite.scanAllData.products.laptop.brand} ${modelNumber}`;

          ctx.sns = Array.from(
            { length: d.totalItems },
            (_, i) => `${d.snPrefix}-${String(i + 1).padStart(2, '0')}-${ctx.stamp}`,
          );
          suite.createdPOs.push(ctx.po);

          suite.createExcelFile(
            fileName,
            ctx.sns.map((sn) => suite.laptopRow(sn, { 'Model Number': modelNumber })),
          );
          suite.importExcel(fileName, ctx.po);
          // QA General Config has requireWorkOrderForStockOut / enablePoForStockOut
          // ON (persisted by a gen-config toggle test), which 400s the
          // stockout-by-serial seeding below. Force the gates open first.
          apiSetGeneralConfigFlags({
            requireWorkOrderForStockOut: false,
            enablePoForStockOut: false,
            enableInventoryStockOut: true,
          });
          seedItemStatuses(suite, ctx.po, ctx.sns, ctx.stamp);

          cy.wrap(null).then(() =>
            suite.apiGetProductIdByPo(ctx.po, ctx.productName).then((pid) => {
              ctx.productId = pid;
              ctx.seeded = true;
              cy.log(`[SEED] Done. PO: ${ctx.po}, ProductId: ${ctx.productId}`);
            }),
          );
        } else {
          cy.log(`[SEED] Already seeded. PO: ${ctx.po}, ProductId: ${ctx.productId}`);
        }

        // ── Per-test navigation ────────────────────────────────────────
        // Runs INSIDE .then() so ctx.po / ctx.productName are always set
        // before Cypress enqueues the navigation commands.

        cy.intercept('GET', '**/incoming-items**').as('incListLoad');
        suite.incomingInvPage.clickIncomingInventoryNav();
        suite.incomingInvPage.selectPoNumber(ctx.po);
        suite.incomingInvPage.searchProduct(ctx.productName);
        suite.incomingInvPage.clickSubmitSearch();
        cy.wait('@incListLoad', { timeout: 20000 });

        cy.get('tbody tr', { timeout: 20000 }).should('have.length.at.least', 1);

        // Enhancement (frontend f2a0e3b5c): clicking a product-item row now opens
        // the quick-view pop-up instead of navigating to the product-details page.
        // Reach the details page via the row's ⋮ long-button menu → "View Items"
        // (same pattern as SerialAndPONavigation TC05/06). The seeded laptop is the
        // only product matched by the unique-model search, so the first row is it.
        aliasItemsListing('pageLoad');
        suite.incomingInvPage.openFirstRowLongButtonMenu();
        suite.incomingInvPage.clickViewItemsMenuItem();
        cy.wait('@pageLoad', { timeout: 20000 });

        cy.url().should('match', /\/incoming-inventory\/[^/]+\/\d+/);
      });
    });

    // ─── FUNCTIONAL: Badge counts match seeded baseline ───────────────────────

    /**
     * @testCaseId    SW_INC_PDSC_001
     * @description   Badge counts on the Product Details page match the seeded
     *                baseline after navigating via Incoming Inventory → PO → product row click.
     * @testData      fixtures/statsClickableTestData.json → expectedCounts
     * @steps
     *   1. Seed 8 laptop items with 7 different statuses via API
     *   2. Navigate to Incoming Inventory, select PO, search product
     *   3. Click the first product row (td[data-index="0"])
     *   4. Read each badge value on the Product Details page
     * @expectedResult  Each badge value equals the count in fixture.expectedCounts.
     */
    it(
      'SW_INC_PDSC_001 — initial badge counts match seeded baseline',
      { tags: ['@smoke'] },
      function () {
        const expected = this.clickData.expectedCounts;
        Object.entries(expected).forEach(([label, count]) => {
          page.readBadgeValue(label).should((actual) => {
            expect(actual, `badge "${label}"`).to.eq(count);
          });
        });
      },
    );

    // ─── FUNCTIONAL: Each non-zero badge filters the items list ──────────────

    /**
     * @testCaseId    SW_INC_PDSC_002 – SW_INC_PDSC_009
     * @description   Clicking each non-zero status badge filters the items list
     *                to only items of that status. The DOM row count, the API
     *                pagination.count, and the badge value must all match.
     * @testData      fixtures/statsClickableTestData.json → filterableBadge
     * @steps
     *   1. Navigate to Product Details page (beforeEach)
     *   2. Set up intercept on items listing endpoint
     *   3. Click the badge for <label>
     *   4. Wait for the listing API response carrying ?status=<expectedStatus>
     *   5. Compare badge value, API count, and DOM row count
     * @expectedResult  badgeValue === api.count === domRowCount; request carries correct status param.
     */
    Object.entries({
      Available:              { status: 'Available' },
      Received:               { status: 'Received' },
      Reserved:               { status: 'Reserved' },
      Incoming:               { status: 'Incoming' },
      Damaged:                { status: 'Damaged' },
      Disputed:               { status: 'Disputed' },
      Missing:                { status: 'Missing' },
      'Stocked out (others)': { status: 'StockedOut' },
    }).forEach(([badgeLabel, { status }], idx) => {
      const tcId = `SW_INC_PDSC_${String(idx + 2).padStart(3, '0')}`;

      it(
        `${tcId} — clicking "${badgeLabel}" filters list to status=${status}`,
        function () {
          aliasItemsListing('filterCall');
          page.clickBadge(badgeLabel);
          cy.wait('@filterCall', { timeout: 15000 });

          readLatestListingResponse('filterCall').then((res) => {
            expect(res.statusParam, `request status param for "${badgeLabel}"`).to.eq(status);

            page.readBadgeValue(badgeLabel).should((badgeVal) => {
              expect(badgeVal, `badge "${badgeLabel}" value === API count`).to.eq(res.count);
            });

            page.shouldHaveDataRowCount(
              res.count,
              `DOM rows match API count for "${badgeLabel}"`,
            );

            page.shouldHaveBadgeSelected(badgeLabel);
          });
        },
      );
    });

    // ─── STATE-TRANSITION: Toggle badge off clears the filter ────────────────

    /**
     * @testCaseId    SW_INC_PDSC_010
     * @description   Clicking an already-selected badge toggles the filter off.
     *                The listing call must drop the status param and the row
     *                count returns to the full unfiltered total.
     * @testData      fixtures/statsClickableTestData.json → expectedCounts.Received
     * @steps
     *   1. Navigate to Product Details page (beforeEach)
     *   2. Click "Received" badge — filter ON
     *   3. Wait for filtered listing call
     *   4. Click "Received" badge again — filter OFF
     *   5. Wait for unfiltered listing call
     * @expectedResult  Second call has no status param; row count equals unfiltered baseline.
     */
    it('SW_INC_PDSC_010 — clicking selected badge again clears the filter', function () {
      readLatestListingResponse('pageLoad').then((baseline) => {
        const unfilteredCount = baseline.count;

        aliasItemsListing('filterOn');
        page.clickBadge('Received');
        cy.wait('@filterOn', { timeout: 15000 });
        page.shouldHaveBadgeSelected('Received');

        // Toggling the filter OFF does NOT issue a second request, so do not wait for
        // one. The items listing runs with `staleTime: Infinity`
        // (itemViewItemList.tsx), so clearing the status returns the query key to the
        // one already fetched on page load and React Query serves it straight from
        // cache. Waiting on a "filterOff" call could only ever time out.
        //
        // Assert the observable contract instead: the badge deselects and the full
        // unfiltered list comes back. That the status param is SENT when the filter is
        // on is already covered by the filterOn wait above and by SW_INC_PDSC_003-009.
        aliasItemsListing('filterOff');
        page.clickBadge('Received');

        page.shouldHaveBadgeNotSelected('Received');
        page.shouldHaveDataRowCount(unfilteredCount, 'DOM rows match unfiltered baseline');

        // And if a request ever IS made on toggle-off, it must not carry a status.
        cy.get('@filterOff.all').then((calls) => {
          calls.forEach((call) => {
            const statusParam = new URL(call.request.url).searchParams.get('status');
            expect(statusParam, 'status param removed on toggle-off').to.be.null;
          });
        });
      });
    });

    // ─── EDGE CASE: Zero-count badge click returns empty list ────────────────

    /**
     * @testCaseId    SW_INC_PDSC_011
     * @description   The "Sold" badge shows 0 (no items sold during setup).
     *                Clicking it must still fire the listing API with status=Sold
     *                and the table must show zero data rows.
     * @testData      fixtures/statsClickableTestData.json → negativeFilterBadge
     * @steps
     *   1. Navigate to Product Details page (beforeEach)
     *   2. Verify "Sold" badge shows 0
     *   3. Set up intercept and click "Sold" badge
     *   4. Wait for the listing call
     * @expectedResult  API count = 0; DOM data rows = 0; badge selected highlight shown.
     */
    it('SW_INC_PDSC_011 — clicking zero-count "Sold" badge returns no rows', function () {
      const { label, expectedRowCount } = this.clickData.negativeFilterBadge;

      page.readBadgeValue(label).should('eq', expectedRowCount);

      aliasItemsListing('soldFilter');
      page.clickBadge(label);
      cy.wait('@soldFilter', { timeout: 15000 });

      readLatestListingResponse('soldFilter').then((res) => {
        expect(res.statusParam, 'status param for Sold').to.eq('Sold');
        expect(res.count, 'API pagination.count for Sold').to.eq(0);
      });

      page.shouldHaveDataRowCount(0, 'DOM rows for Sold filter = 0');
      page.shouldHaveBadgeSelected(label);
    });
  },
);
