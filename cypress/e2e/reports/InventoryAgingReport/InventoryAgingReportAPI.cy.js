/**
 * Inventory Aging Report API Tests — SW-IAR-API-TC01..38
 * =============================================================================
 * TC ORDER IS NOT MONOTONIC IN THIS FILE, deliberately. TC34-TC38 were added
 * during the review pass and are placed next to the TCs they extend rather
 * than appended at the end: TC35-TC38 (page_size cap boundaries, page past
 * the end) sit with the other pagination clamps at TC07/TC08, and TC34 (the
 * no-match search partition) sits with the search coverage note. TC14 sits in
 * the seeded-PO describe because it needs two seeded products. Read the file
 * against plan.md §9's matrix, which is ordered by TC id.
 *
 * Mirrors:  cypress/e2e/reports/InventoryAgingReport/37-InventoryAgingReportTests.cy.js
 * Backend:  Backend/src/modules/reports/reports.controller.ts
 *           (getInventoryAgingReport, exportInventoryAgingReport) +
 *           inventory-aging-report.service.ts (buildInventoryAgingQuery,
 *           getInventoryAgingReport, exportInventoryAgingReport)
 * Plan:     cypress/qa/testPlans/inventoryAgingReport/plan.md
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET /reports/inventory-aging-report          AuthGuard
 *   GET /reports/inventory-aging-report/export    AuthGuard (xlsx)
 *
 * -----------------------------------------------------------------------------
 *   Confirmed code facts driving this suite (read directly from source —
 *   inventory-aging-report.service.ts / reports.controller.ts lines noted
 *   inline at each assertion; NOT carried over from any sibling report's
 *   assumptions, since this service duplicates rather than shares helpers)
 * -----------------------------------------------------------------------------
 *   1. sanitizeCategoryId() returns `undefined` for any non-integer value —
 *      an invalid categoryId is SILENTLY DROPPED (no 400), unlike the
 *      Inventory/Cost Report services' own categoryId handling. Do not assume
 *      the same contract as those sibling suites.
 *   2. validateDateParam() throws a plain Error for a malformed asOfDate,
 *      which the JSON controller wraps as `InternalServerErrorException` —
 *      i.e. a bad date returns HTTP 500, not 400. Documented as a real (if
 *      minor) status-code defect in plan.md Objective 3, not silently assumed
 *      correct.
 *   3. agingSortFields is a fixed allow-list; unknown sortBy silently falls
 *      back to `categoryName` (no error) — same pattern for sortOrder, which
 *      falls back to ASC for anything other than a case-insensitive 'DESC'.
 *   4. page/page_size are clamped server-side: page >= 1, 1 <= page_size <= 500 —
 *      EXCEPT page_size=0, which the `parseInt(...) || 25` fallback treats as
 *      falsy and resolves to the 25 default rather than the intended 1 floor
 *      (a negative page_size, being truthy, does reach the floor). Confirmed
 *      code quirk, not a test assumption — see TC08.
 *   5. exportInventoryAgingReport() strips every *_cost column (and Total
 *      Cost) from the Excel workbook when the caller's roleId === 3 (Sales).
 *      getInventoryAgingReport (the JSON endpoint) is NOT redaction-free,
 *      though: the global RoleBasedSanitizationInterceptor
 *      (app.module.ts + data-sanitizer.util.ts) zeroes any response field
 *      whose key is an EXACT match in SENSITIVE_FIELDS_CONFIG — which
 *      includes 'cost' and 'total_cost' but NOT 'bucket_0_30_cost' and
 *      siblings. Net effect: total_cost/cost come back zeroed for Sales, but
 *      the full per-bucket cost breakdown (from which total_cost is
 *      trivially re-derivable) still leaks. A real, if narrower, gap than
 *      "no redaction at all" — see TC22.
 *   6. checkInItemsWithoutVariants() (incoming-item.service.ts) inserts the
 *      STOCK_IN "inventoryMovements" row for a pure product via
 *      auditService.recordMovement({...}) WITHOUT a `cost` field, so the
 *      aging report's pure-product FIFO cost simulation
 *      (COALESCE(im.cost, 0)) always reads $0 for a product checked in via
 *      /incoming-items/check-in, even though its `quantities` row carries the
 *      real PO cost. Confirmed app defect, not a seeding mistake — see TC15
 *      and pending.md.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import { seedMixedPO, apiCheckIn, apiScanSerial, apiDeletePO } from '../../../support/helpers/poCloseHelpers';
// listOf is imported, not re-implemented: inventoryReportHelpers already
// exports an equivalent normaliser (it additionally falls back to
// data.items/data.results, which this report never returns, so the behaviour
// is identical here) and this spec already depends on the same module for
// isoDate.
import { isoDate, listOf } from '../../../support/helpers/inventoryReportHelpers';
import { apiCall } from '../../../support/helpers/allPosHelpers';

// Money is exact to the cent in this codebase, so cost assertions use a
// one-cent tolerance (never a scaled/loose one) while quantities stay exact.
const CENT = 0.01;
const summaryOf = (body) => (body?.data?.summary ?? body?.summary ?? {});

// ════════════════════════════════════════════════════════════════════════════
// Thin wiring / contract TCs — read-only against live QA data, no seeding.
// ════════════════════════════════════════════════════════════════════════════
describe('Inventory Aging Report API', () => {
  let authToken;
  let baseUrl;

  const headers = () => ({ Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' });

  const agingReport = (qs = '?page=1&page_size=10') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/inventory-aging-report${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  const exportFlat = (qs = '', extraOpts = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/inventory-aging-report/export${qs}`,
      headers: headers(),
      encoding: 'base64',
      failOnStatusCode: false,
      timeout: 12 * 60 * 1000,
      ...extraOpts,
    }).then((res) => {
      expect(res.status, 'export HTTP status').to.equal(200);
      return cy.task('parseExcelBuffer', { base64Data: res.body }).then((parsed) => ({ res, parsed }));
    });

  // Auth is Keycloak-only: the legacy POST {IDENTITY_SERVER_BASE_URL}/auth/login
  // is retired (the host 502s and the Backend route was deleted), and the
  // `stockwise-app` client refuses the direct-access grant, so a real browser
  // login is the ONLY way to mint a token. cy.login() drives the realm form
  // inside cy.origin() and yields the access token; cy.session caches it, so
  // this runs once for the whole spec file.
  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
      expect(authToken, 'a Keycloak bearer token must be obtained').to.exist;
    });
  });

  // ── Auth contract (EP) ──────────────────────────────────────────────────────

  // EP — no-auth partition on the JSON route
  it('SW-IAR-API-TC01: GET /reports/inventory-aging-report without auth returns 401', { tags: ['@smoke'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/inventory-aging-report?page=1&page_size=5`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  // EP — no-auth partition on the export route
  it('SW-IAR-API-TC02: GET /reports/inventory-aging-report/export without auth returns 401', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/inventory-aging-report/export`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  // ── Param validation / clamps (EP / BVA / Error Guessing) ───────────────────

  // Error Guessing — malformed date input
  it(
    'SW-IAR-API-TC03: a malformed asOfDate returns HTTP 500 (documented status-code gap — ideally 400)',
    { tags: ['@regression'] },
    () => {
      agingReport('?page=1&page_size=5&asOfDate=not-a-date').then((res) => {
        // validateDateParam() throws a plain Error, which the controller
        // wraps as InternalServerErrorException — this asserts the CURRENT
        // (imperfect) contract, not an idealized one; see plan.md Objective 3.
        expect(res.status, 'malformed asOfDate currently surfaces as a 500, not a 400').to.equal(500);
      });
    }
  );

  // EP — invalid (unparseable) categoryId partition
  it(
    'SW-IAR-API-TC04: a non-integer categoryId is silently dropped, not rejected',
    { tags: ['@regression'] },
    () => {
      agingReport('?page=1&page_size=25').then((baseline) => {
        agingReport('?page=1&page_size=25&categoryId=notanumber').then((withBadCategory) => {
          expect(withBadCategory.status, 'a non-integer categoryId must not error').to.equal(200);
          const baselineTotal = baseline.body?.data?.pagination?.count ?? baseline.body?.pagination?.count;
          const badTotal = withBadCategory.body?.data?.pagination?.count ?? withBadCategory.body?.pagination?.count;
          expect(badTotal, 'sanitizeCategoryId() drops an unparseable categoryId, so the result must match the unfiltered baseline').to.equal(
            baselineTotal
          );
        });
      });
    }
  );

  // EP — invalid sortBy partition (outside the allow-list).
  //
  // The fallback is asserted, not just the 200: an unknown sortBy must produce
  // the SAME ordering as an explicit sortBy=categoryName. Asserting only
  // "status 200 and the list is an array" would pass against a backend that
  // ignored the allow-list entirely and sorted by something else, so it would
  // not test the behaviour named in this test's title.
  // Sequences are compared by VALUE, never by row id. Rows tied on the sort
  // column have no guaranteed relative order between two separate queries (the
  // ORDER BY carries no tiebreaker — the confirmed defect SW-IAR-TC14 tracks),
  // so an id-sequence comparison would flake on tied data. Tied rows share the
  // same sort VALUE by definition, so the value sequence is stable even when
  // the row order is not.
  it('SW-IAR-API-TC05: an unknown sortBy field falls back to categoryName, not an error', { tags: ['@regression'] }, function () {
    agingReport('?page=1&page_size=50&sortBy=categoryName&sortOrder=ASC').then((baseline) => {
      const baselineCategories = listOf(baseline.body).map((r) => r.categoryName);
      if (baselineCategories.length < 2) this.skip();
      agingReport('?page=1&page_size=50&sortBy=maliciousUnknownField123&sortOrder=ASC').then((res) => {
        expect(res.status, 'unknown sortBy must not error — agingSortFields falls back to categoryName').to.equal(200);
        expect(
          listOf(res.body).map((r) => r.categoryName),
          'an unknown sortBy must produce the same categoryName ordering as an explicit sortBy=categoryName'
        ).to.deep.equal(baselineCategories);
      });
    });
  });

  // EP — invalid sortOrder partition.
  //
  // Same reasoning as TC05: the fallback itself is asserted by comparing
  // against an explicit sortOrder=ASC, not merely by checking for a 200.
  it('SW-IAR-API-TC06: a garbage sortOrder falls back to ASC, not an error', { tags: ['@regression'] }, function () {
    const costs = (body) => listOf(body).map((r) => parseFloat(r.total_cost ?? 0));
    agingReport('?page=1&page_size=50&sortBy=total_cost&sortOrder=ASC').then((ascending) => {
      const ascendingCosts = costs(ascending.body);
      if (ascendingCosts.length < 2) this.skip();
      agingReport('?page=1&page_size=50&sortBy=total_cost&sortOrder=notASortOrder').then((res) => {
        expect(res.status, 'garbage sortOrder must not error — falls back to ASC').to.equal(200);
        expect(
          costs(res.body),
          'a garbage sortOrder must produce the same total_cost ordering as an explicit sortOrder=ASC'
        ).to.deep.equal(ascendingCosts);
      });
    });
  });

  // BVA — page_size just above the 500 upper bound
  it('SW-IAR-API-TC07: page_size above 500 clamps to the 500 hard cap', { tags: ['@regression'] }, () => {
    agingReport('?page=1&page_size=999').then((res) => {
      expect(res.status).to.equal(200);
      const pagination = res.body?.data?.pagination ?? res.body?.pagination;
      expect(pagination.pageSize, 'page_size=999 must clamp to the documented 500 max').to.equal(500);
    });
  });

  // BVA — page_size at the lower boundary (0)
  it('SW-IAR-API-TC08: page_size=0 falls back to the 25 default, not the 1 floor (confirmed code quirk)', { tags: ['@regression'] }, () => {
    // CONFIRMED CODE FACT: pageSize = Math.min(500, Math.max(1, parseInt(...) || 25))
    // (inventory-aging-report.service.ts). `parseInt('0', 10) || 25` treats 0 as
    // falsy, so page_size=0 never reaches the Math.max(1, ...) floor — it takes
    // the `|| 25` default instead. A negative page_size (e.g. -5) is truthy and
    // WOULD reach the floor and clamp to 1. Documented here rather than asserted
    // as an idealized "clamps to 1", per plan.md §6.6.
    agingReport('?page=1&page_size=0').then((res) => {
      expect(res.status).to.equal(200);
      const pagination = res.body?.data?.pagination ?? res.body?.pagination;
      expect(pagination.pageSize, 'page_size=0 falls back to the 25 default (falsy-zero quirk), not the 1 floor').to.equal(25);
    });
  });

  // BVA — page_size at the exact upper bound (500). TC07 covers well above the
  // cap and TC36 just above it; this is the boundary value itself, which must
  // be ACCEPTED rather than clamped. Without it the suite only proves the cap
  // rejects, never that the largest legal value is honoured.
  it('SW-IAR-API-TC35: page_size=500 (the exact cap) is accepted, not clamped down', { tags: ['@regression'] }, () => {
    agingReport('?page=1&page_size=500').then((res) => {
      expect(res.status).to.equal(200);
      const pagination = res.body?.data?.pagination ?? res.body?.pagination;
      expect(pagination.pageSize, 'the cap itself is a legal value and must be honoured exactly').to.equal(500);
    });
  });

  // BVA — page_size just above the upper bound (501)
  it('SW-IAR-API-TC36: page_size=501 (just above the cap) clamps to 500', { tags: ['@regression'] }, () => {
    agingReport('?page=1&page_size=501').then((res) => {
      expect(res.status).to.equal(200);
      const pagination = res.body?.data?.pagination ?? res.body?.pagination;
      expect(pagination.pageSize, 'one above the cap must clamp to the cap').to.equal(500);
    });
  });

  // BVA — page_size at the lower valid bound (1). TC08 covers the falsy-zero
  // quirk below it; this proves the smallest legal value is honoured and
  // actually limits the payload.
  it('SW-IAR-API-TC37: page_size=1 (the lower valid bound) returns a single row', { tags: ['@regression'] }, function () {
    agingReport('?page=1&page_size=1').then((res) => {
      expect(res.status).to.equal(200);
      const pagination = res.body?.data?.pagination ?? res.body?.pagination;
      expect(pagination.pageSize, 'page_size=1 is legal and must not fall back to the 25 default').to.equal(1);
      if (!pagination.count) this.skip();
      expect(listOf(res.body), 'page_size=1 must actually limit the payload to one row').to.have.length(1);
    });
  });

  // BVA / Error Guessing — a page far past the last one is a valid request that
  // simply has nothing to return; it must be an empty list, not an error and
  // not a silent wrap back to page 1.
  it('SW-IAR-API-TC38: a page beyond the last page returns an empty list, not an error', { tags: ['@regression'] }, () => {
    agingReport('?page=999999&page_size=25').then((res) => {
      expect(res.status, 'a page past the end is a valid query, not an error').to.equal(200);
      expect(listOf(res.body), 'there is nothing to return that far past the end').to.have.length(0);
    });
  });

  // BVA — page at the lower boundary (0)
  it('SW-IAR-API-TC09: page=0 clamps to the 1 floor', { tags: ['@regression'] }, function () {
    agingReport('?page=0&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (!list.length) this.skip();
      const pagination = res.body?.data?.pagination ?? res.body?.pagination;
      expect(pagination.page, 'page=0 must clamp to page 1').to.equal(1);
    });
  });

  // EP — valid default partition (no params)
  it('SW-IAR-API-TC10: default request (no params) returns the documented envelope shape', { tags: ['@smoke'] }, () => {
    agingReport('').then((res) => {
      expect(res.status).to.equal(200);
      const data = res.body?.data ?? res.body;
      expect(data).to.have.all.keys('list', 'pagination', 'summary');
      expect(data.list).to.be.an('array');
      expect(data.pagination).to.include.keys('count', 'pages', 'page', 'pageSize');
      expect(data.summary).to.include.keys('totalProducts', 'totalQty', 'totalCost');
    });
  });

  // ── Sorting (BVA) ────────────────────────────────────────────────────────────

  // BVA — ordering boundary between adjacent rows, DESC
  it('SW-IAR-API-TC11: sortBy=total_cost&sortOrder=DESC is genuinely ordered', { tags: ['@regression'] }, function () {
    agingReport('?page=1&page_size=50&sortBy=total_cost&sortOrder=DESC').then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length < 2) this.skip();
      const values = list.map((r) => parseFloat(r.total_cost ?? 0));
      for (let i = 1; i < values.length; i++) expect(values[i]).to.be.at.most(values[i - 1]);
    });
  });

  // BVA — ordering boundary between adjacent rows, ASC, on a bucket field
  it('SW-IAR-API-TC12: sortBy=bucket_181_plus_cost&sortOrder=ASC is genuinely ordered', { tags: ['@regression'] }, function () {
    agingReport('?page=1&page_size=50&sortBy=bucket_181_plus_cost&sortOrder=ASC').then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length < 2) this.skip();
      const values = list.map((r) => parseFloat(r.bucket_181_plus_cost ?? 0));
      for (let i = 1; i < values.length; i++) expect(values[i]).to.be.at.least(values[i - 1]);
    });
  });

  // ── Filters (Decision Table / Use Case) ─────────────────────────────────────

  // Decision Table — categoryId supplied x rows returned
  it('SW-IAR-API-TC13: categoryId filter narrows every row to that category', { tags: ['@regression'] }, function () {
    agingReport('?page=1&page_size=5').then((probe) => {
      const row = listOf(probe.body).find((r) => r.category);
      if (!row) this.skip();
      agingReport(`?page=1&page_size=50&categoryId=${row.category}`).then((res) => {
        expect(res.status).to.equal(200);
        const list = listOf(res.body);
        list.forEach((r) => expect(r.category, `row ${r.id} must belong to categoryId=${row.category}`).to.equal(row.category));
      });
    });
  });

  // NOTE ON SEARCH COVERAGE — why the positive case (SW-IAR-API-TC14) lives in
  // the seeded-PO describe below rather than here.
  //
  // `search` is matched with ILIKE against `coalescedSearchProductFields` — the
  // concatenation of the PRODUCT ATTRIBUTE columns (generateSearchConditions()
  // -> prepareSearchFields()). It is NOT matched against the response's `name`,
  // which is generated afterwards in JS by generateProductName() from a
  // per-category template. That means a term derived from `name` cannot be
  // relied on to match anything, and two live runs proved it:
  //   1. A row that genuinely matched came back with name '    ' (a template
  //      whose placeholders were all empty), failing an "every row's name
  //      contains the term" assertion against CORRECT application behaviour.
  //   2. The derived term was then "Product", taken from the fallback string
  //      'Product name not defined' — a value that exists only in JS and is
  //      stored in no column, so no search can ever match it.
  // Deriving a search term from live data's rendered `name` is therefore
  // unworkable in principle, not just unlucky. TC14 instead uses the seeded
  // PO, whose search terms ARE real stored attribute values.

  // EP — invalid (guaranteed-no-match) search partition. This is what proves the
  // filter is genuinely applied rather than silently ignored: if `search` were
  // dropped, this would come back with the full unfiltered set instead of 0.
  it('SW-IAR-API-TC34: a guaranteed-no-match search term returns zero rows', { tags: ['@regression'] }, () => {
    const nonsense = `NOMATCH-${Date.now()}`;
    agingReport(`?page=1&page_size=25&search=${encodeURIComponent(nonsense)}`).then((res) => {
      expect(res.status).to.equal(200);
      expect(listOf(res.body), 'a term matching no product must return an empty list').to.have.length(0);
      const pagination = res.body?.data?.pagination ?? res.body?.pagination;
      expect(pagination.count, 'the total count must be 0, proving search is applied server-side').to.equal(0);
    });
  });

  // ── Export structural contract (Decision Table / Use Case) — no seeding required ──

  // Use Case — actor exports the unfiltered report
  it('SW-IAR-API-TC25: export succeeds with the correct content-type and default filename', { tags: ['@regression'] }, () => {
    exportFlat().then(({ res }) => {
      expect(res.headers['content-type']).to.match(/spreadsheet|octet-stream/);
      expect(res.headers['content-disposition'], 'no asOfDate → filename must be inventory-aging-report.xlsx').to.include(
        'inventory-aging-report.xlsx'
      );
    });
  });

  // Use Case — actor exports an as-of-dated report
  it('SW-IAR-API-TC26: export filename includes the asOfDate when one is provided', { tags: ['@regression'] }, () => {
    const today = isoDate(0);
    exportFlat(`?asOfDate=${today}`).then(({ res }) => {
      expect(res.headers['content-disposition'], `filename must embed asOfDate=${today}`).to.include(
        `inventory-aging-report-${today}.xlsx`
      );
    });
  });

  // Decision Table — admin role x full column set
  it('SW-IAR-API-TC27: "Aging Report" sheet header row matches the documented column order (admin, unfiltered)', { tags: ['@regression'] }, () => {
    exportFlat().then(({ parsed }) => {
      const header = parsed.sheets[0].allRows[0];
      const expectedOrder = [
        'Product Name', 'Category',
        '0-30 Days Qty', '0-30 Days Cost',
        '31-60 Days Qty', '31-60 Days Cost',
        '61-90 Days Qty', '61-90 Days Cost',
        '91-180 Days Qty', '91-180 Days Cost',
        '181+ Days Qty', '181+ Days Cost',
        'Total Qty', 'Total Cost',
      ];
      const indices = expectedOrder.map((col) => header.indexOf(col));
      indices.forEach((idx, i) => expect(idx, `header must contain "${expectedOrder[i]}"`).to.be.gte(0));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i], `"${expectedOrder[i]}" must come after "${expectedOrder[i - 1]}"`).to.be.greaterThan(indices[i - 1]);
      }
    });
  });

  // Use Case — actor audits which filters produced the workbook
  it('SW-IAR-API-TC28: "Filter Information" sheet lists the expected filter rows', { tags: ['@regression'] }, function () {
    agingReport('?page=1&page_size=5').then((probe) => {
      const row = listOf(probe.body).find((r) => r.name);
      if (!row) this.skip();
      const term = String(row.name).split(' ')[0];
      exportFlat(`?search=${encodeURIComponent(term)}`).then(({ parsed }) => {
        expect(parsed.sheets, 'export must contain a second "Filter Information" sheet').to.have.length.greaterThan(1);
        const filterRows = parsed.sheets[1].allRows;
        const labels = filterRows.map((r) => r[0]);
        ['Report Type', 'Generated Date', 'Generated By', 'As of Date', 'Category', 'Search Term', 'Total Records'].forEach((label) =>
          expect(labels, `Filter Information sheet must contain a "${label}" row`).to.include(label)
        );
      });
    });
  });

  // ── Export categoryId contract (silent-ignore mirror of TC04) ───────────────

  // Decision Table — invalid categoryId x export route (mirror of TC04)
  // exportFlat() already asserts the 200 before parsing, so this body asserts
  // the thing that is actually specific to TC33: the workbook still comes back
  // with its normal data sheet rather than the filter being applied or erroring.
  it('SW-IAR-API-TC33: export with a non-integer categoryId silently ignores the filter (mirrors TC04)', { tags: ['@regression'] }, () => {
    exportFlat('?categoryId=notanumber').then(({ parsed }) => {
      const header = parsed.sheets[0].allRows[0];
      expect(header, 'an ignored categoryId must still produce the normal Aging Report sheet').to.include('Product Name');
      expect(parsed.sheets, 'the Filter Information sheet must still be present').to.have.length.greaterThan(1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Seeded-PO family — deterministic aging-bucket arithmetic + Sales cost-leak
// (SW-IAR-API-TC15-24, TC29-32)
//
// A disposable PO seeded "today" via seedMixedPO (pure ram line + serialized
// laptop line, per poCloseHelpers.js — the same helper the Cost/Inventory
// Report suites already prove reliable) has NO inventoryMovements/items
// history before today, so its aging is fully deterministic: the whole
// checked-in/scanned quantity must land in the 0-30 bucket, and it must
// disappear entirely (all buckets 0) when read As-of yesterday.
// ════════════════════════════════════════════════════════════════════════════
describe('Inventory Aging Report API — seeded PO family (SW-IAR-API-TC15-24,29-32)', () => {
  const poNumber = `PO-IAR-${Date.now()}`;
  const ramStamp = `IAR-r-${Date.now()}`;
  const laptopStamp = `IAR-l-${Date.now()}`;
  const serial = `SN-IAR-${Date.now()}`;
  const ramSearch = `${td.products.ram.memoryGeneration}-${ramStamp}`;
  const laptopSearch = `${td.products.laptop.modelNumber}-${laptopStamp}`;
  const ramQty = 3;
  const ramCost = parseFloat(td.products.ram.cost);
  const laptopCost = parseFloat(td.products.laptop.cost);
  const yesterday = isoDate(1);
  const today = isoDate(0);

  let ramCategoryId, ramCategoryName;

  // seedMixedPO (poCloseHelpers.js) creates the ram (pure) + laptop
  // (serialized) product rows via one Excel import but does not resolve
  // their productIds back to this describe's scope in the same call this
  // suite makes — look the ram productId up via search, then check in the
  // ram line and scan the laptop's serial, exactly as
  // InventoryReportAPI.cy.js's identical mixed-PO seeding does.
  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedMixedPO({ td, poNumber, ramStamp, ramQty, laptopStamp, serials: [serial] })
      .then(({ ramProductId }) => apiCheckIn({ poNumber, productId: ramProductId, quantity: ramQty }))
      .then(() => apiScanSerial(poNumber, serial))
      // Resolve the seeded ram row's category HERE, in the seeding hook, not
      // as a side effect of TC15's body. Assigning it inside a test made
      // TC20/TC21/TC30 silently skip whenever TC15 failed or was filtered out
      // by a tag run — an ordering dependency between it() blocks, which the
      // authoring rules forbid. Reading it once during setup makes every
      // consumer independent of which tests actually ran.
      .then(() =>
        apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(ramSearch)}`).then((res) => {
          const row = listOf(res.body)[0];
          ramCategoryId = row?.category;
          ramCategoryName = row?.categoryName;
        }),
      );
  });

  // Cypress resets the page between it()s — apiCall()'s cy.getAuthToken()
  // reads the token the app mirrored into sessionStorage on whatever page is
  // currently loaded, so re-visit before every it() (cheap once cy.session's
  // cache is warm) — same convention InventoryReportAPI.cy.js documents for
  // the identical reason.
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => apiDeletePO(poNumber));

  // Decision Table — pure product (hasItems=false) x checked-in today
  it('SW-IAR-API-TC15: a today-checked-in pure product lands entirely in the 0-30 bucket by qty (bucket cost is a confirmed $0 defect)', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(ramSearch)}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      expect(list, `seeded ram product must be findable via search=${ramSearch}`).to.have.length(1);
      const row = list[0];
      expect(Number(row.bucket_0_30_qty), '0-30 qty must equal the checked-in quantity').to.equal(ramQty);
      // CONFIRMED DEFECT (app bug, not a test-authoring issue): checkInItemsWithoutVariants()
      // (Backend/src/modules/incomingItems/incoming-item.service.ts) inserts the STOCK_IN
      // "inventoryMovements" row via auditService.recordMovement({...}) WITHOUT a `cost` field.
      // buildInventoryAgingQuery's pure-product FIFO CTE reads unit_cost as
      // COALESCE(im.cost, 0), so ANY pure product checked in via /incoming-items/check-in
      // ages into its bucket at $0 cost, even though its `quantities` row carries the real
      // PO cost (seeded here as ramQty * ramCost) — the movement row itself never recorded
      // a cost. See pending.md.
      expect(parseFloat(row.bucket_0_30_cost), '0-30 cost is $0 — confirmed app defect, see pending.md').to.equal(0);
      ['bucket_31_60_qty', 'bucket_61_90_qty', 'bucket_91_180_qty', 'bucket_181_plus_qty'].forEach((k) =>
        expect(Number(row[k]), `${k} must be 0 for a product checked in today`).to.equal(0)
      );
    });
  });

  // Use Case — actor filters the report by a product's real attribute value.
  //
  // Both terms here ARE stored attribute values (the ram's stamped Memory
  // Generation and the laptop's stamped Model Number), unlike anything
  // derivable from the response's computed `name` — see the SEARCH COVERAGE
  // note in the first describe for why that distinction matters.
  //
  // The discriminating assertion is the CROSS-EXCLUSION: two products seeded
  // into the SAME PO must resolve to different single rows. A backend that
  // ignored `search` entirely would return both rows to both queries and fail
  // here, which a one-sided "the row I searched for is present" check would not
  // catch.
  it('SW-IAR-API-TC14: search discriminates between two products seeded in the same PO', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=500&search=${encodeURIComponent(ramSearch)}`).then((ramRes) => {
      expect(ramRes.status).to.equal(200);
      const ramList = listOf(ramRes.body);
      expect(ramList, `search=${ramSearch} must return exactly the seeded ram row`).to.have.length(1);

      apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=500&search=${encodeURIComponent(laptopSearch)}`).then((laptopRes) => {
        expect(laptopRes.status).to.equal(200);
        const laptopList = listOf(laptopRes.body);
        expect(laptopList, `search=${laptopSearch} must return exactly the seeded laptop row`).to.have.length(1);
        expect(
          laptopList[0].id,
          'the two searches must resolve to different products — search discriminates, it does not return everything'
        ).to.not.equal(ramList[0].id);
      });
    });
  });

  // Decision Table — serialized product (hasItems=true) x scanned today
  it('SW-IAR-API-TC16: a today-scanned serialized product lands entirely in the 0-30 bucket', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(laptopSearch)}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      expect(list, `seeded laptop product must be findable via search=${laptopSearch}`).to.have.length(1);
      const row = list[0];
      expect(Number(row.bucket_0_30_qty), '0-30 qty must equal the 1 scanned serial').to.equal(1);
      expect(parseFloat(row.bucket_0_30_cost), '0-30 cost must equal the scanned serial cost').to.be.closeTo(laptopCost, CENT);
    });
  });

  // BVA — asOfDate one day below the movement's own date
  it(
    'SW-IAR-API-TC17: As-of Yesterday shows all-zero buckets for a product whose only movement happened today',
    { tags: ['@regression'] },
    () => {
      apiCall(
        'GET',
        `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(ramSearch)}&asOfDate=${yesterday}`
      ).then((res) => {
        expect(res.status).to.equal(200);
        const list = listOf(res.body);
        expect(list, 'the product row must still appear (category/search filters are date-independent)').to.have.length(1);
        const row = list[0];
        expect(Number(row.total_qty), 'total_qty must be 0 — the movement is excluded by the As-of Yesterday cutoff').to.equal(0);
        expect(parseFloat(row.total_cost), 'total_cost must be 0.00').to.be.closeTo(0, CENT);
      });
    }
  );

  // State Transition — explicit as-of-today equals the implicit default
  it('SW-IAR-API-TC18: As-of Today (explicit) equals the no-asOfDate default', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(ramSearch)}`).then((defaultRes) => {
      apiCall(
        'GET',
        `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(ramSearch)}&asOfDate=${today}`
      ).then((asOfRes) => {
        const defaultCost = parseFloat(listOf(defaultRes.body)[0]?.total_cost ?? NaN);
        const asOfCost = parseFloat(listOf(asOfRes.body)[0]?.total_cost ?? NaN);
        expect(asOfCost, 'explicit As-of Today must equal the CURRENT_DATE default').to.be.closeTo(defaultCost, CENT);
      });
    });
  });

  // Use Case — per-row arithmetic invariant
  it('SW-IAR-API-TC19: total_qty/total_cost equal the sum of the 5 buckets', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(ramSearch)}`).then((res) => {
      const row = listOf(res.body)[0];
      const qtySum = ['bucket_0_30_qty', 'bucket_31_60_qty', 'bucket_61_90_qty', 'bucket_91_180_qty', 'bucket_181_plus_qty'].reduce(
        (s, k) => s + Number(row[k] || 0),
        0
      );
      const costSum = ['bucket_0_30_cost', 'bucket_31_60_cost', 'bucket_61_90_cost', 'bucket_91_180_cost', 'bucket_181_plus_cost'].reduce(
        (s, k) => s + parseFloat(row[k] || 0),
        0
      );
      expect(Number(row.total_qty)).to.equal(qtySum);
      expect(parseFloat(row.total_cost)).to.be.closeTo(costSum, CENT);
    });
  });

  // Use Case — category-scoped summary arithmetic invariant
  it('SW-IAR-API-TC20: category-scoped summary totals equal the sum of every row in that category', { tags: ['@regression'] }, function () {
    if (!ramCategoryId) this.skip();
    apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=500&categoryId=${ramCategoryId}`).then((res) => {
      const list = listOf(res.body);
      const summary = summaryOf(res.body);
      const listCostSum = list.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0);
      const listQtySum = list.reduce((s, r) => s + Number(r.total_qty || 0), 0);
      expect(parseFloat(summary.totalCost), 'summary.totalCost must equal SUM(list.total_cost)').to.be.closeTo(listCostSum, CENT);
      expect(Number(summary.totalQty), 'summary.totalQty must equal SUM(list.total_qty)').to.equal(listQtySum);
    });
  });

  // Use Case — summary is independent of the pagination window
  it(
    'SW-IAR-API-TC21: summary totals are identical across different page_size values (charts are pagination-independent)',
    { tags: ['@regression'] },
    function () {
      if (!ramCategoryId) this.skip();
      apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=5&categoryId=${ramCategoryId}`).then((smallPage) => {
        apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=500&categoryId=${ramCategoryId}`).then((bigPage) => {
          const a = summaryOf(smallPage.body);
          const b = summaryOf(bigPage.body);
          expect(parseFloat(b.totalCost), 'summary must be computed over the whole filtered set, not the current page').to.be.closeTo(
            parseFloat(a.totalCost),
            CENT
          );
        });
      });
    }
  );

  // ── Sales role cost-visibility gap (Decision Table) ─────────────────────────

  // Decision Table — Sales role x JSON route (contrast to TC23/TC24's export)
  //
  // PROBE-THEN-SKIP, not it.skip(): no Sales account exists in the IAM realm
  // today (the app provides no way to create one — see pending.md), so
  // cy.credentials('sales') resolves an empty username and this TC skips
  // itself. Written this way rather than as a hard it.skip() so it self-enables
  // the moment the account is provisioned in cypress.env.json /
  // CYPRESS_QA_SALES_* — a hard skip would silently stay dead forever.
  it(
    'SW-IAR-API-TC22: the Sales role still receives the per-bucket cost breakdown from the JSON endpoint, though total_cost is blanket-zeroed (confirmed gap)',
    { tags: ['@regression'] },
    function () {
      // Everything runs INSIDE the credentials callback so the skip decision is
      // made before any further command is queued — same shape as the UI spec's
      // TC12/TC13, rather than queueing commands after the probe.
      cy.credentials('sales').then(({ username }) => {
        if (!username) this.skip();
        cy.authSession('sales');
        cy.visit('/');
        // Scoped to the scanned laptop, not the checked-in ram — its items.cost is
        // unaffected by the TC15 check-in-cost defect, so a non-zero result here can
        // only come from the JSON endpoint failing to redact it.
        apiCall('GET', `/reports/inventory-aging-report?page=1&page_size=10&search=${encodeURIComponent(laptopSearch)}`).then((res) => {
          expect(res.status).to.equal(200);
          const row = listOf(res.body)[0];
          expect(row, 'seeded row must still be visible to Sales').to.exist;
          // CONFIRMED GAP: RoleBasedSanitizationInterceptor (global, app.module.ts) zeroes
          // response fields by EXACT key name (data-sanitizer.util.ts SENSITIVE_FIELDS_CONFIG) —
          // it includes 'cost' and 'total_cost' (both present on this row) but NOT
          // 'bucket_0_30_cost'/etc. So the aggregate total_cost is zeroed for Sales, but the
          // per-bucket cost breakdown — from which total_cost is trivially re-derivable — still
          // leaks in full. This is a real gap distinct from (and more precise than) "no
          // redaction at all". See plan.md §6.6 and pending.md.
          expect(parseFloat(row.bucket_0_30_cost), 'bucket_0_30_cost leaks to Sales despite total_cost being redacted').to.be.closeTo(
            laptopCost,
            CENT
          );
          expect(parseFloat(row.total_cost), 'total_cost IS blanket-zeroed for Sales by the global sanitizer').to.equal(0);
        });
      });
    }
  );

  // Decision Table — Sales role x export cost columns
  // Same probe-then-skip as TC22 — no Sales account exists yet (pending.md).
  it('SW-IAR-API-TC23: the Sales role export omits every cost column', { tags: ['@regression'] }, function () {
    cy.credentials('sales').then(({ username }) => {
      if (!username) this.skip();
      cy.authSession('sales');
      cy.visit('/');
      cy.getAuthToken().then((salesToken) =>
        cy
          .request({
            method: 'GET',
            url: `${Cypress.env('API_BASE_URL')}/reports/inventory-aging-report/export?search=${encodeURIComponent(ramSearch)}`,
            headers: { Authorization: `Bearer ${salesToken}` },
            encoding: 'base64',
            failOnStatusCode: false,
            timeout: 12 * 60 * 1000,
          })
          .then((res) => {
            expect(res.status).to.equal(200);
            return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
              const header = sheets[0].allRows[0];
              ['0-30 Days Cost', '31-60 Days Cost', '61-90 Days Cost', '91-180 Days Cost', '181+ Days Cost', 'Total Cost'].forEach((col) =>
                expect(header, `Sales export must NOT contain "${col}"`).to.not.include(col)
              );
              ['Product Name', 'Category', '0-30 Days Qty', 'Total Qty'].forEach((col) =>
                expect(header, `Sales export must still contain "${col}"`).to.include(col)
              );
            });
          })
      );
    });
  });

  // Decision Table — admin role x export cost columns (contrast to TC23)
  it('SW-IAR-API-TC24: the Admin export includes every cost column (contrast to TC23)', { tags: ['@regression'] }, () => {
    cy.authSession('admin');
    cy.visit('/');
    cy.getAuthToken().then((adminToken) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/inventory-aging-report/export?search=${encodeURIComponent(ramSearch)}`,
          headers: { Authorization: `Bearer ${adminToken}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
            const header = sheets[0].allRows[0];
            ['0-30 Days Cost', 'Total Cost'].forEach((col) => expect(header, `Admin export must contain "${col}"`).to.include(col));
          });
        })
    );
  });

  // ── Export content verification, scoped to the seeded PO (Use Case / Decision Table) ──

  // Use Case — actor reconciles the workbook TOTALS row
  it('SW-IAR-API-TC29: export TOTALS row equals the sum of the (single) matching data row', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/inventory-aging-report/export?search=${encodeURIComponent(ramSearch)}`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
            const [header, ...rows] = sheets[0].allRows;
            const costCol = header.indexOf('Total Cost');
            const totalsRow = rows.find((r) => r[0] === 'TOTALS');
            const dataRows = rows.filter((r) => r !== totalsRow && r[0]);
            expect(totalsRow, 'a scoped export must still include a TOTALS row').to.exist;
            expect(dataRows, 'search must scope the export to exactly the seeded ram row').to.have.length(1);
            expect(parseFloat(totalsRow[costCol]), 'TOTALS cost must equal the single data row').to.be.closeTo(
              parseFloat(dataRows[0][costCol]),
              CENT
            );
          });
        })
    );
  });

  // Decision Table — categoryId supplied x exported rows
  it('SW-IAR-API-TC30: export honors the categoryId filter', { tags: ['@regression'] }, function () {
    if (!ramCategoryId || !ramCategoryName) this.skip();
    cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/inventory-aging-report/export?categoryId=${ramCategoryId}`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
            const [header, ...rows] = sheets[0].allRows;
            const catCol = header.indexOf('Category');
            const dataRows = rows.filter((r) => r[0] && r[0] !== 'TOTALS');
            expect(dataRows.length, 'category-filtered export must contain at least the seeded ram row').to.be.at.least(1);
            dataRows.forEach((r) => expect(r[catCol], 'every row must belong to the filtered category').to.equal(ramCategoryName));
          });
        })
    );
  });

  // Use Case — actor exports a search-scoped report
  it('SW-IAR-API-TC31: export honors the search filter', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/inventory-aging-report/export?search=${encodeURIComponent(laptopSearch)}`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
            const [, ...rows] = sheets[0].allRows;
            const dataRows = rows.filter((r) => r[0] && r[0] !== 'TOTALS');
            expect(dataRows, `search=${laptopSearch} export must return exactly the 1 seeded laptop row`).to.have.length(1);
          });
        })
    );
  });

  // ── Token-in-query fallback (Use Case) ───────────────────────────────────────

  // Use Case — browser <a href> download path (no Authorization header)
  it('SW-IAR-API-TC32: token-in-query fallback succeeds for the export endpoint with no Authorization header', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) => {
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/reports/inventory-aging-report/export?token=${encodeURIComponent(token)}`,
        encoding: 'binary',
        failOnStatusCode: false,
        timeout: 12 * 60 * 1000,
      }).then((res) => {
        expect(res.status).to.equal(200);
        expect(res.headers['content-type']).to.match(/spreadsheet|octet-stream/);
      });
    });
  });
});
