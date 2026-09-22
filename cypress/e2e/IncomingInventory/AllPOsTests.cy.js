// cypress/e2e/IncomingInventory/AllPOsTests.cy.js
//
// Test scripts for the Incoming Inventory "All POs" page.
// Source spec: cypress/Test scripts Instruction for All POs.txt
//
// Authoring conventions (Test Automation Skill):
//   • Page Object Model — all UI interactions in cypress/pageObjects/AllPOsPage.js
//                         (which composes IncomingInvPage for navigation/import)
//   • Fixtures — every test data value comes from cypress/fixtures/allPosData.json
//   • Helpers — API calls, Excel-row builders, and cleanup live in
//               cypress/support/helpers/allPosHelpers.js
//   • Comment block — every it() has a @testCaseId / @description / @testData /
//                     @steps / @expectedResult block
//   • No explicit waits — only network-driven cy.wait('@alias') waits
//
// ISTQB techniques applied:
//   Use case + state-transition  — All-POs page actions
//   Decision table               — visibility/enable matrix per row category

import 'cypress-file-upload';
import AllPOsPage from '../../pageObjects/AllPOsPage';
import {
  importAttributesAndCategories,
  deleteCategories,
} from '../../support/helpers/attributeHelpers';
import { importExcel } from '../../support/helpers/incomingInventoryHelpers';
import {
  ts,
  buildRamRow,
  buildLaptopRow,
  createExcelFile,
  apiGetAllPOsListing,
  cleanupCreatedPOs,
} from '../../support/helpers/allPosHelpers';

describe(
  'Incoming Inventory — All POs page',
  { tags: ['@regression', '@allpos'] },
  () => {
    /** @type {AllPOsPage} */
    let page;

    // PO context shared across the spec — assigned in `before`.
    const ctx = {
      stamp: null,
      laptopPO: null,
      ramPO: null,
      ramPOSecondary: null,
      createdPOs: [],
    };

    before(function () {
      cy.fixture('allPosData').as('data');

      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      importAttributesAndCategories();

      cy.get('@data').then((td) => {
        ctx.stamp = ts();
        ctx.laptopPO = `${td.poPrefixes.laptop}${ctx.stamp}`;
        ctx.ramPO = `${td.poPrefixes.ram}${ctx.stamp}`;
        ctx.ramPOSecondary = `${td.poPrefixes.ramSecondary}${ctx.stamp}`;
        ctx.createdPOs.push(ctx.laptopPO, ctx.ramPO, ctx.ramPOSecondary);

        const lapFile = `AllPOs-Lap-${ctx.stamp}.xlsx`;
        const ramFile = `AllPOs-Ram-${ctx.stamp}.xlsx`;
        const ram2File = `AllPOs-Ram2-${ctx.stamp}.xlsx`;

        const sn = `AllPOsLap-${ctx.stamp}`;
        createExcelFile(lapFile, [buildLaptopRow(td, ctx.stamp, sn)]);
        createExcelFile(ramFile, [buildRamRow(td, ctx.stamp, td.ram.defaultQuantity)]);
        createExcelFile(ram2File, [buildRamRow(td, ctx.stamp, td.ram.secondaryQuantity)]);

        importExcel(lapFile, ctx.laptopPO);
        importExcel(ramFile, ctx.ramPO);
        importExcel(ram2File, ctx.ramPOSecondary);
      });
    });

    beforeEach(function () {
      cy.fixture('allPosData').as('data');
      cy.on('uncaught:exception', (err) => {
        if (err?.message?.includes('Request failed with status code')) return false;
      });
      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      page = new AllPOsPage();
    });

    after(function () {
      cy.fixture('allPosData').as('data');
      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      cleanupCreatedPOs(ctx.createdPOs);
      // The RAM/Laptop automation categories are durable, shared fixtures reused
      // across the suite and across runs (re-seeding is idempotent via
      // importAttributesAndCategories). They cannot be deleted while any PO
      // still references their products, so deleting them here only produced a
      // spurious after-hook failure. PO teardown above is the real cleanup.
    });

    // ─────────────────────────────────────────────────────────────────────
    // FUNCTIONAL — All POs page
    // ─────────────────────────────────────────────────────────────────────
    describe('All POs page', () => {
      /**
       * @testCaseId    SW_INC_ALLPO_001
       * @description   Header 3-dots menu in All-POs view exposes only the
       *                "Download Template" and "Customize Column" actions.
       *                Per-PO actions (Import / Scan / Export) belong to
       *                a single-PO context and must not appear when "All
       *                POs" is selected.
       * @testData      fixtures/allPosData.json → headerMenuItems
       * @steps
       *   1. Open /incoming-inventory and select "All POs"
       *   2. Click the page-level 3-dots button
       *   3. Read every visible menu item label
       * @expectedResult  Menu contains every entry in headerMenuItems.allPosVisible
       *                  and none of the entries in headerMenuItems.allPosForbidden.
       */
      it(
        'SW_INC_ALLPO_001 — header 3-dots menu shows only Download Template and Customize Column',
        function () {
          // Technique: Use Case
          page.selectAllPOs();
          page.openHeaderActionMenu();
          page.readMenuItems().then((items) => {
            const labels = items.map((i) => i.text);
            this.data.headerMenuItems.allPosVisible.forEach((expected) => {
              expect(labels, `header menu contains "${expected}"`).to.include(expected);
            });
            this.data.headerMenuItems.allPosForbidden.forEach((forbidden) => {
              expect(
                labels.some((l) => l.includes(forbidden)),
                `header menu must NOT contain "${forbidden}" in All-POs view`,
              ).to.eq(false);
            });
          });
        },
      );

      /**
       * @testCaseId    SW_INC_ALLPO_002
       * @description   The row-level 3-dots menu on a product-only row in
       *                All-POs view enables only the global, PO-agnostic
       *                actions ("View Details" + "Set Alert Threshold"),
       *                while every per-PO action is hidden.
       * @testData      fixtures/allPosData.json → rowMenu, categories.ram,
       *                searchTerms.ram
       * @steps
       *   1. Open /incoming-inventory in All-POs view
       *   2. Search by the seeded RAM brand to surface the product-only row
       *   3. Open that row's 3-dots menu and read every visible item
       * @expectedResult  Enabled items match rowMenu.productOnlyAllPosEnabled.
       *                  None of rowMenu.productOnlyAllPosForbidden appear.
       */
      it(
        'SW_INC_ALLPO_002 — product-only row menu in All-POs view enables only the global actions',
        function () {
          // Technique: EP
          page.selectAllPOs();
          page.searchInPage(this.data.searchTerms.ram);
          page.shouldHaveRowWithCategory(this.data.categories.ram);
          page.openRowActionMenuByCategory(this.data.categories.ram);

          page.readMenuItems().then((items) => {
            const enabled = items.filter((i) => !i.disabled).map((i) => i.text);
            const all = items.map((i) => i.text);

            this.data.rowMenu.productOnlyAllPosEnabled.forEach((expected) => {
              expect(
                enabled,
                `enabled menu items include "${expected}". Saw enabled=${JSON.stringify(enabled)}`,
              ).to.include(expected);
            });
            this.data.rowMenu.productOnlyAllPosForbidden.forEach((forbidden) => {
              expect(
                all,
                `row menu must NOT include "${forbidden}" in All-POs view`,
              ).to.not.include(forbidden);
            });
          });
        },
      );

      /**
       * @testCaseId    SW_INC_ALLPO_003
       * @description   Clicking into a product-only product from the
       *                All-POs listing navigates to the product details
       *                page; rows on that page must NOT carry a row-level
       *                long-button because the All-POs context disables
       *                per-PO actions.
       * @testData      fixtures/allPosData.json → searchTerms.ram, categories.ram
       * @steps
       *   1. Open /incoming-inventory in All-POs view
       *   2. Search by the seeded RAM brand and click the first product cell
       *   3. Inspect every visible row on the resulting details page
       * @expectedResult  No row in the details table contains a button#long-button.
       */
      it(
        'SW_INC_ALLPO_003 — product details page rows have no row-level long-button when reached from All-POs',
        function () {
          // Technique: Use Case
          page.selectAllPOs();
          page.searchInPage(this.data.searchTerms.ram);
          page.shouldHaveRowWithCategory(this.data.categories.ram);
          // Intercept BEFORE clicking so we catch the details fetch the
          // SPA fires post-navigation. Without this, the assertion can
          // race against the brief listing-render that precedes the
          // details mount.
          cy.intercept('GET', '**/incoming-items/**').as('detailsFetch');
          page.drillIntoRowByCategory(this.data.categories.ram);
          cy.url({ timeout: 15000 }).should(
            'not.eq',
            `${Cypress.config('baseUrl')}incoming-inventory`,
          );
          cy.wait('@detailsFetch', { timeout: 20000 });
          page.shouldHaveNoRowLongButtons();
        },
      );

      /**
       * @testCaseId    SW_INC_ALLPO_004
       * @description   Each stat-card value shown in the All-POs view
       *                exactly matches the /incoming-items/reports
       *                ?poNumber=allPO API response for every label.
       * @testData      Live API + fixtures/allPosData.json → statLabelToApiField
       * @steps
       *   1. GET /incoming-items/reports?poNumber=allPO → capture report map
       *   2. Open /incoming-inventory in All-POs view
       *   3. Read every badge h6 value from the DOM and compare to API
       * @expectedResult  Every badge value (parsed as a number) equals the
       *                  matching API field on data.reports.
       */
      it(
        'SW_INC_ALLPO_004 — every stat card matches the All-POs reports API',
        function () {
          // Technique: Decision Table
          // Intercept BEFORE navigating so we capture the page's own reports
          // API call. Using the intercepted response (not a separate pre-fetch)
          // guarantees the values we assert against are the exact ones the page
          // received — eliminating any race between our probe and the UI data.
          cy.intercept('GET', '**/incoming-items/reports*').as('pageReportsAPI');
          page.selectAllPOs();
          cy.wait('@pageReportsAPI', { timeout: 30000 }).then((interception) => {
            const reports = interception.response?.body?.data?.reports;
            expect(reports, 'response body has data.reports').to.exist;

            // assertBadgeMatchesValue retries until the badge renders the SPECIFIC
            // value — it will not pass on the React 19 concurrent-mode loading "0"
            // (unlike readBadgeValue which passes on the first matching pattern).
            Object.entries(this.data.statLabelToApiField).forEach(([label, key]) => {
              const apiVal = Number(reports[key] ?? 0);
              page.assertBadgeMatchesValue(label, apiVal);
            });
          });
        },
      );

      /**
       * @testCaseId    SW_INC_ALLPO_005
       * @description   The pagination footer ("Record: from-to of total")
       *                is consistent with the listing API: total ==
       *                pagination.count, window matches page=1 +
       *                page_size=<fixture defaultPageSize>.
       * @testData      Live API + fixtures/allPosData.json → pagination
       * @steps
       *   1. GET /incoming-items?poNumber=allPO&page=1&page_size=<default> →
       *      capture data.pagination.count and data.list.length
       *   2. Open /incoming-inventory in All-POs view (waiting on the
       *      listing fetch + at least one row rendering)
       *   3. Parse the "Record: 1 - X of Y" footer
       * @expectedResult  footer.from = 1
       *                  footer.to   = min(returned, page_size)
       *                  footer.total = api pagination.count
       */
      it(
        'SW_INC_ALLPO_005 — pagination footer reflects the All-POs listing API',
        function () {
          // Technique: Use Case
          const { defaultPage, defaultPageSize } = this.data.pagination;
          apiGetAllPOsListing(defaultPage, defaultPageSize).then((res) => {
            expect(res.status, 'listing API status').to.be.lessThan(400);
            const data = res.body?.data || {};
            const apiTotal = Number(
              data?.pagination?.count ??
                data.count ??
                data.total ??
                data.totalCount ??
                0,
            );
            const apiList = Array.isArray(data.list) ? data.list : [];
            expect(apiTotal, 'apiTotal > 0 (suite seeds at least 3 POs)').to.be
              .greaterThan(0);

            page.selectAllPOsAndWaitForListing('allPosListFetch');
            page.readPaginationFooter().then((footer) => {
              expect(footer.from, 'pagination "from"').to.eq(1);
              expect(
                footer.to,
                'pagination "to" matches min(returned, page_size)',
              ).to.eq(Math.min(apiList.length || apiTotal, defaultPageSize));
              expect(
                footer.total,
                'pagination "total" matches API pagination.count',
              ).to.eq(apiTotal);
            });
          });
        },
      );
    });

  },
);
