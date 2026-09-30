/**
 * Asset Lifecycle Report API Tests — SW-ALR-API-TC01..34
 * =============================================================================
 * Mirrors:  cypress/e2e/reports/AssetLifecycleReport/36-AssetLifecycleReportTests.cy.js
 * Backend:  Backend/src/modules/reports/reports.controller.ts
 *           (getAssetLifecycleReport, exportAssetLifecycleReport) +
 *           warehouse-asset-report.service.ts (getAssetLifecycleReport,
 *           exportAssetLifecycleReport, getAssetLifecycleSortField)
 * Plan:     cypress/qa/testPlans/Reports/assetLifecycleReport/plan.md
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET /reports/asset-lifecycle-report          AuthGuard
 *   GET /reports/asset-lifecycle-report/export    AuthGuard (xlsx)
 *   POST /products/asset-id/generate              (seeding)
 *   POST /products/mark-status                    (seeding — status change)
 *   POST /products/restock-by-serial-number        (seeding — restock)
 *   POST /products/stockout-by-serial-number        (seeding — stock-out)
 *   POST /location-assignments/:locationId/items    (seeding — WMS location)
 *   DELETE /location-assignments/items/:serialNumber (seeding — WMS unassign)
 *   POST /containers/:id/items                       (seeding — WMS container)
 *   POST /work-orders, /work-orders/scan,
 *        /work-orders/product/stockout                (seeding — WO flow)
 *
 * -----------------------------------------------------------------------------
 *   Confirmed code facts driving this suite (read directly from source —
 *   see plan.md §1/§6.6 for full citations)
 * -----------------------------------------------------------------------------
 *   1. getAssetLifecycleReport's base query hard-requires i."assetId" IS NOT
 *      NULL — a serialized item is invisible here until
 *      POST /products/asset-id/generate succeeds (requires status='Available',
 *      no prior assetId). A pure (non-serialized) product can NEVER appear.
 *   2. No pagination clamp exists on this endpoint (unlike every sibling
 *      report) — page=0 computes a negative SQL OFFSET, which Postgres
 *      rejects, surfacing as HTTP 500 (TC09, confirmed defect). There is also
 *      no upper page_size bound (TC08).
 *   3. A non-integer categoryId is NOT silently dropped — unlike the Inventory
 *      Aging Report, this controller passes it through unparsed and the
 *      service interpolates parseInt(categoryId, 10) into raw SQL, so "NaN"
 *      reaches Postgres and the request 500s (TC05, confirmed defect on QA).
 *   4. status=sold vs status=stockedout is a decision on the LATEST
 *      stockoutItems.reason for that serial, not on items.status alone
 *      (TC15).
 *   5. A serial-level stock-out (stockout-by-serial-number) deletes the
 *      item's container_items row as a side effect — there is no separate
 *      "stock out from container" endpoint (TC24).
 *   6. Work-order stock-out (workOrder.service.ts stockoutProduct())
 *      hardcodes stockoutItems.reason = REASONS.SOLD unconditionally, so
 *      every WO-driven stock-out reports status=sold here, never
 *      status=stockedout (TC26).
 *   7. Reserved is set in exactly one code path:
 *      WorkOrderService.addOrderItems() (POST /work-orders/scan) (TC25).
 *   8. The repo's standard `ram` fixture category cannot appear in this
 *      report (point 1) — this suite seeds a SECOND, disposable serialized
 *      category via Excel import rather than reusing any shared fixture
 *      (TC28-29).
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/assetLifecycleReportData.json';
import { apiCall, buildLaptopRow, createExcelFile } from '../../../support/helpers/allPosHelpers';
import { importExcel } from '../../../support/helpers/incomingInventoryHelpers';
import { apiGetProductIdForPO, apiScanSerial, apiDeletePO } from '../../../support/helpers/poCloseHelpers';
import { createDisposableBinChain, deleteLocationViaApi } from '../../../support/helpers/wmsLocationHelpers';
import {
  createContainerTypeViaApi,
  createContainerViaApi,
  deleteContainerViaApi,
  deleteContainerTypeViaApi,
  disposableTypeName,
} from '../../../support/helpers/wmsContainerHelpers';
import { borrowGeneralConfigFlag, restoreGeneralConfigFlag } from '../../../support/helpers/generalConfigApiHelpers';

const CENT = 0.01; // money is exact to the cent in this codebase

const listOf = (body) => body?.data?.list ?? body?.list ?? [];

// ── General-config toggle: requireWorkOrderForStockOut ──────────────────────
// A live run on Dev (not reproduced on QA) surfaced a General Config flag,
// `requireWorkOrderForStockOut`, that Dev has ON — stockOutBySerialNumber()
// (product-stock-out.service.ts) rejects any serial-level stock-out with no
// `orderNumber` when this flag is true. This plan's regular (non-WO)
// stock-out TCs (TC15/TC24) specifically need to prove the reason-based
// stock-out contract in isolation from the work-order flow (TC25/26 already
// covers that), so this toggles the flag OFF for the duration of the
// Category 1 chain and restores whatever value the environment had. Uses the
// borrow/restore pair in generalConfigApiHelpers.js rather than a bespoke
// PATCH — those already handle the userId-scoped + exact-name-row patching
// this backend needs, and the restore is unconditional + asserted, so a
// borrowed flag cannot leak into the rest of a shared environment.

// ════════════════════════════════════════════════════════════════════════════
// Thin wiring / contract TCs — identity-login track, no seeding required.
// ════════════════════════════════════════════════════════════════════════════
describe('Asset Lifecycle Report API', () => {
  let authToken;
  let baseUrl;

  const headers = () => ({ Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' });

  const alrReport = (qs = '?page=1&page_size=10') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/asset-lifecycle-report${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  const alrExport = (qs = '', extraOpts = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/asset-lifecycle-report/export${qs}`,
      headers: headers(),
      encoding: 'base64',
      failOnStatusCode: false,
      timeout: 12 * 60 * 1000,
      ...extraOpts,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    // Auth is Keycloak-only: the legacy POST {IDENTITY_SERVER_BASE_URL}/auth/login
    // is retired (the host 502s and the Backend route was deleted), and the
    // `stockwise-app` client refuses the direct-access grant, so a real browser
    // login is the ONLY way to mint a token. cy.login() drives the realm form
    // inside cy.origin() and yields the access token; cy.session caches it, so
    // this runs once for the whole spec file.
    cy.login().then((token) => {
      authToken = token;
      expect(authToken, 'a Keycloak bearer token must be obtained').to.exist;
    });
  });

  // ── Auth contract (EP) ──────────────────────────────────────────────────────

  // EP — no-auth partition
  it('SW-ALR-API-TC02: GET /reports/asset-lifecycle-report without auth returns 401', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/asset-lifecycle-report?page=1&page_size=5`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  // EP — no-auth partition
  it('SW-ALR-API-TC03: GET /reports/asset-lifecycle-report/export without auth returns 401', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/asset-lifecycle-report/export`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  // EP — happy-path representative
  it('SW-ALR-API-TC04: default request returns the documented envelope shape', { tags: ['@smoke'] }, () => {
    alrReport('').then((res) => {
      expect(res.status, 'the default report request must succeed').to.equal(200);
      // The route is wrapped in ApiResponseInterceptor
      // (reports.controller.ts:616), which emits the repo-wide envelope
      // { statusCode, success: true, error: null, data } — assert it directly
      // rather than falling back to res.body, so a regression that drops the
      // interceptor is caught instead of silently tolerated.
      expect(res.body, 'response carries the standard envelope').to.include({ success: true, error: null });
      expect(res.body.statusCode, 'envelope statusCode mirrors the HTTP status').to.equal(200);
      const payload = res.body.data;
      expect(payload, 'envelope data holds the report payload').to.have.all.keys('list', 'pagination');
      expect(payload.list).to.be.an('array');
      expect(payload.pagination).to.include.keys('page', 'page_size', 'count');
    });
  });

  // ── Invalid-input leniency (EP) ─────────────────────────────────────────────

  // Error Guessing — invalid-type input reaching raw SQL
  it('SW-ALR-API-TC05: a non-integer categoryId must not crash the server — expected red: currently HTTP 500 (confirmed defect)', { tags: ['@regression'] }, () => {
    // CONFIRMED DEFECT (found via a live run, not predicted from a source read):
    // unlike the Inventory Aging Report's own categoryId handling, this
    // controller's getAssetLifecycleReport handler passes `query.categoryId`
    // straight through UNPARSED (no parseInt at the controller layer). The
    // service then builds `categoryCondition` as
    // `AND p."category" = ${parseInt(categoryId, 10)}` INLINE inside a raw SQL
    // template string — parseInt('notanumber', 10) is NaN, which stringifies
    // to the literal text "NaN" in the query, and PostgreSQL rejects that as
    // invalid input syntax for an integer, surfacing as HTTP 500. See plan.md
    // §1 point 10 / §6.6 point 2.
    //
    // Per SKILL.md §6 rule 1 this asserts the INVARIANT (bad input is handled,
    // never a 5xx) rather than pinning status===500. Pinning the defect would
    // make the obvious parseInt/Joi guard turn this test red on an improvement.
    // Both plausible fixes satisfy the assertion below — a 400 rejection, or
    // the Aging Report's lenient silent-drop 200 — so it goes green on its own
    // once the guard lands, with no test edit needed.
    alrReport(`?page=${data.pagination.bvaPageFirstValid}&page_size=${data.pagination.epPageSizeTypical}&categoryId=${data.categoryFilter.epNonInteger}`).then((res) => {
      expect(res.status, 'invalid categoryId must be handled, never surface as a 5xx').to.be.lessThan(500);
      if (res.status !== 200) {
        expect(
          res.body?.success === false || Boolean(res.body?.error),
          'a rejection must be reported through the standard envelope',
        ).to.equal(true);
      }
    });
  });

  // EP — invalid sortBy partition
  it('SW-ALR-API-TC06: an unknown sortBy field falls back to assetId, not an error', { tags: ['@regression'] }, () => {
    alrReport(`?page=${data.pagination.bvaPageFirstValid}&page_size=5&sortBy=${data.sorting.epSortByUnknown}`).then((res) => {
      expect(res.status, 'unknown sortBy must not error — getAssetLifecycleSortField falls back to assetId').to.equal(200);
      expect(listOf(res.body)).to.be.an('array');
    });
  });

  // EP — invalid sortOrder partition
  it('SW-ALR-API-TC07: a garbage sortOrder falls back to ASC, not an error', { tags: ['@regression'] }, () => {
    alrReport(`?page=${data.pagination.bvaPageFirstValid}&page_size=5&sortOrder=${data.sorting.epSortOrderGarbage}`).then((res) => {
      expect(res.status, 'garbage sortOrder must not error — falls back to ASC').to.equal(200);
    });
  });

  // ── Pagination gaps (Error Guessing) — confirmed code facts, not idealized ──

  // Error Guessing — no upper page_size bound
  it('SW-ALR-API-TC08: no upper page_size bound exists (documented gap)', { tags: ['@regression'] }, () => {
    // Unlike every sibling report (Inventory/Cost/Aging), this service applies
    // no Math.min cap — { page: query.page || 1, page_size: query.page_size || 25 }
    // is passed straight through. A large page_size must still succeed.
    alrReport(`?page=${data.pagination.bvaPageFirstValid}&page_size=${data.pagination.bvaPageSizeNoUpperBound}`, { timeout: 30000 }).then((res) => {
      expect(res.status, 'a very large page_size must not be rejected — no upper bound exists in this service').to.equal(200);
    });
  });

  // Error Guessing — page=0 boundary with no floor clamp
  it('SW-ALR-API-TC09: page=0 must not crash the server — expected red: currently HTTP 500, no floor clamp (confirmed defect)', { tags: ['@regression'] }, () => {
    // CONFIRMED DEFECT: offset = (page - 1) * pageSize = -pageSize when
    // page=0, and PostgreSQL rejects a negative OFFSET, which the service's
    // catch-all `throw error` surfaces as InternalServerErrorException (500)
    // at the controller. Every sibling report clamps page to a 1 floor
    // before this can happen; this service has no such clamp. See plan.md
    // §1 point 9 / §6.6 point 1.
    //
    // Asserted as the invariant, not as status===500 (SKILL.md §6 rule 1):
    // the sibling reports' floor clamp would answer 200, and a Joi bound would
    // answer 400 — both pass here, so adding the missing clamp greens this
    // test instead of breaking it.
    alrReport(`?page=${data.pagination.bvaPageFloorInvalid}&page_size=10`).then((res) => {
      expect(res.status, 'page=0 must be clamped or rejected, never surface as a 5xx').to.be.lessThan(500);
      if (res.status !== 200) {
        expect(
          res.body?.success === false || Boolean(res.body?.error),
          'a rejection must be reported through the standard envelope',
        ).to.equal(true);
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Category 1 — full item lifecycle chain (check-in → asset-id → status →
// restock → WMS location → WMS container → stock-out) on ONE disposable PO,
// reusing the repo's standard `laptop` category (still a fresh product/PO/
// serials per run — never touching real QA inventory). A second serial on
// the SAME product is reserved for the work-order family below.
// ════════════════════════════════════════════════════════════════════════════
describe('Asset Lifecycle Report API — Category 1 lifecycle chain (SW-ALR-API-TC01,10-24,30-34)', () => {
  const poNumber = `PO-ALR-${Date.now()}`;
  const stamp = `ALR-${Date.now()}`;
  const serialA = `SN-ALR-A-${Date.now()}`; // walks the full status/WMS/stock-out chain
  const serialB = `SN-ALR-B-${Date.now()}`; // reserved for the work-order family
  // TC01 proves the visibility gate on a serial it OWNS, so the gate test does
  // not double as the chain's seeding step (see the before() note below).
  const serialGate = `SN-ALR-GATE-${Date.now()}`;
  const laptopSearch = `${td.products.laptop.modelNumber}-${stamp}`;
  const laptopCost = parseFloat(td.products.laptop.cost);
  const parentSerial = `PARENT-${Date.now()}`;
  // Deliberately NOT `parentSerial`: SW-ALR-API-TC14 asserts that searching by
  // parentSerial returns exactly ONE row, so the gate serial must carry its own
  // parent or it would become a second match and break that assertion.
  const parentSerialGate = `PARENT-GATE-${Date.now()}`;
  // Same reasoning as parentSerialGate: serialB carries its OWN parent so it
  // cannot become a second match for TC14's exactly-one-row assertion.
  const parentSerialB = `PARENT-B-${Date.now()}`;

  let productId;
  let assetIdA;
  let categoryId;
  let categoryName;
  let binChain;
  // EVERY disposable chain created during the run, so after() can delete them
  // all. `binChain` alone used to be reassigned by TC23, which orphaned the
  // chain TC21/TC22 had created — it leaked a facility subtree per run.
  const binChains = [];
  let containerTypeId;
  let containerId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    // See the requireWorkOrderForStockOut note above — off for this chain so
    // TC15/TC24's regular (non-WO) stock-out calls are not rejected on an
    // environment (confirmed: Dev) that has this flag on by default.
    // Borrowed, not just set: after() puts it back whatever it was and asserts
    // the restore landed, so this suite cannot leave a shared environment
    // altered for everyone else.
    borrowGeneralConfigFlag('requireWorkOrderForStockOut', false);
    createExcelFile(`ALR-CAT1-${stamp}.xlsx`, [
      buildLaptopRow({ categories: { laptop: td.categories.laptop }, laptop: td.products.laptop }, stamp, serialA),
      buildLaptopRow({ categories: { laptop: td.categories.laptop }, laptop: td.products.laptop }, stamp, serialB),
      buildLaptopRow({ categories: { laptop: td.categories.laptop }, laptop: td.products.laptop }, stamp, serialGate),
    ]);
    importExcel(`ALR-CAT1-${stamp}.xlsx`, poNumber);
    apiGetProductIdForPO(poNumber, laptopSearch)
      .then((id) => {
        productId = id;
        // SEEDING, not a test. The report's base query requires
        // i."assetId" IS NOT NULL, so serialA is invisible until asset-id
        // generation runs — every TC below depends on it. This used to live in
        // SW-ALR-API-TC01's body, which made 15 tests depend on another test's
        // side effects: a tag-filtered run that excluded TC01 (it is @smoke,
        // the rest are @regression) left the whole chain querying a report
        // where the seeded item did not exist yet, and 12 TCs failed with
        // empty result sets. Seeding belongs in the hook; TC01 keeps proving
        // the gate itself on its own serialGate.
        return apiScanSerial(poNumber, serialA);
      })
      .then(() => apiScanSerial(poNumber, serialB))
      .then(() =>
        apiCall('POST', '/products/asset-id/generate', {
          serialNumber: serialA,
          parentSerialNumber: parentSerial,
        })
      )
      .then((res) => {
        expect(res.status, 'seeding: asset-id/generate for serialA must succeed').to.be.lessThan(300);
        assetIdA = res.body?.data?.assetId ?? res.body?.assetId;
        expect(assetIdA, 'seeding: a generated assetId for serialA').to.be.a('string').and.not.be.empty;
        return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`);
      })
      .then((res) => {
        const list = listOf(res.body);
        expect(list, 'seeding: serialA must be visible in the report after generation').to.have.length(1);
        // categoryId/categoryName drive TC10/TC28/TC29 — captured here so they
        // are available no matter which subset of TCs a tag filter selects.
        categoryId = list[0].categoryId;
        categoryName = list[0].categoryName;
        // A GUARANTEED SECOND visible row. TC17/TC18 compare an ordering across
        // the report and are meaningless with a single row, so they used to
        // this.skip() below two — which on a clean stack silently no-op'd the
        // only sort coverage there is. serialA was the sole row this hook could
        // guarantee: serialGate only becomes visible inside TC01 (@smoke, so a
        // @regression run filters it out) and serialB was scanned but never
        // asset-id'd, leaving it permanently invisible to this report. Giving
        // serialB its own assetId here makes two rows a property of the seed
        // rather than of the environment. It carries parentSerialB so TC14's
        // exactly-one-row parentSerial search is unaffected.
        return apiCall('POST', '/products/asset-id/generate', {
          serialNumber: serialB,
          parentSerialNumber: parentSerialB,
        });
      })
      .then((res) => {
        expect(res.status, 'seeding: asset-id/generate for serialB must succeed').to.be.lessThan(300);
      });
  });

  after(() => {
    // SHARED state first, disposable state second. A throwing cleanup call
    // aborts the rest of the hook, so anything that affects OTHER suites has to
    // be put back before this suite's own leftovers: an undeleted PO or bin
    // chain only clutters our own footprint, whereas a General Config flag left
    // flipped changes stock-out behaviour for every suite on the environment.
    restoreGeneralConfigFlag('requireWorkOrderForStockOut');
    apiDeletePO(poNumber);
    binChains.forEach((chain) => {
      if (chain?.facility?.id) deleteLocationViaApi(chain.facility.id);
    });
    if (containerId) deleteContainerViaApi(containerId);
    if (containerTypeId) deleteContainerTypeViaApi(containerTypeId);
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  // ── State preconditions (SKILL.md §6 rule 5) ────────────────────────────────
  // Each mutating TC below ESTABLISHES the state it needs instead of inheriting
  // it from the test before it. Mocha guarantees only file ORDER — not that the
  // predecessor actually ran — so a tag filter, an `.only`, a retry, or any
  // mid-chain failure used to leave serialA in the wrong state and cascade
  // false failures through every later TC (e.g. TC15's "status=sold returns 0"
  // held only because TC24 happened to stock the item out first).
  //
  // Every helper is idempotent and a no-op when the item is already in the
  // wanted state, so an in-order run pays one extra report GET per test while
  // an out-of-order or partial run now self-corrects.

  const rowFor = (serial) =>
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serial)}`).then(
      (res) => listOf(res.body)[0],
    );

  /** Available is the chain's neutral state: restock reverses both Damaged and StockedOut. */
  const ensureAvailable = (serial) =>
    rowFor(serial).then((row) => {
      if (row?.status === 'Available') return cy.wrap(null, { log: false });
      return apiCall('POST', '/products/restock-by-serial-number', {
        serialNumber: serial,
        reason: 'Automated test restock',
        description: 'Precondition: return serial to Available',
      });
    });

  const ensureDamaged = (serial) =>
    rowFor(serial).then((row) => {
      if (row?.status === 'Damaged') return cy.wrap(null, { log: false });
      return ensureAvailable(serial).then(() =>
        apiCall('POST', '/products/mark-status', {
          serialNumbers: [serial],
          status: 'Damaged',
          damageReason: 'Automated test damage',
          damageComment: 'Precondition: mark serial Damaged',
        }),
      );
    });

  /** Tolerates "not assigned" — apiCall never throws on a non-2xx. */
  const ensureLocationUnassigned = (serial) =>
    apiCall('DELETE', `/location-assignments/items/${encodeURIComponent(serial)}`);

  const ensureBinChain = () =>
    binChain
      ? cy.wrap(binChain, { log: false })
      : createDisposableBinChain().then((chain) => {
          binChains.push(chain);
          binChain = chain;
          return chain;
        });

  const ensureLocationAssigned = (serial) =>
    ensureAvailable(serial)
      .then(() => ensureBinChain())
      .then((chain) => rowFor(serial).then((row) => ({ chain, row })))
      .then(({ chain, row }) =>
        row?.locationId === chain.bin.id
          ? cy.wrap(null, { log: false })
          : apiCall('POST', `/location-assignments/${chain.bin.id}/items`, { serialNumber: serial }),
      );

  /** Container + its own location, created once and reused by TC23/TC24. */
  const ensureContainer = () => {
    if (containerId) return cy.wrap(containerId, { log: false });
    return ensureBinChain()
      .then((chain) =>
        createContainerTypeViaApi(disposableTypeName('ALRType')).then((type) => {
          containerTypeId = type?.id;
          return createContainerViaApi(containerTypeId).then((container) => ({ chain, container }));
        }),
      )
      .then(({ chain, container }) => {
        containerId = container?.id;
        // Placing a container AT a location is PUT /containers/:id { locationId }
        // — see the TC23 note on move-to-location.
        return apiCall('PUT', `/containers/${containerId}`, { locationId: chain.bin.id });
      })
      .then(() => containerId);
  };

  const ensureContainerAssigned = (serial) =>
    ensureAvailable(serial)
      .then(() => ensureLocationUnassigned(serial))
      .then(() => ensureContainer())
      .then((id) => apiCall('POST', `/containers/${id}/items`, { serialNumber: serial }));

  const ensureStockedOut = (serial, reason) =>
    rowFor(serial).then((row) => {
      if (row?.status === 'StockedOut') return cy.wrap(null, { log: false });
      return apiCall('POST', '/products/stockout-by-serial-number', {
        serialNumber: serial,
        reason,
        description: 'Precondition: stock serial out',
        status: 'StockedOut',
      });
    });

  // ── Feature gate: invisible until asset-id/generate (Use Case) ──────────────

  // Use Case — the report's entire visibility gate (main flow: scan → generate → visible)
  // Runs entirely on serialGate, which no other TC touches, so this test owns
  // both sides of the gate (before + after generation) and nothing downstream
  // depends on it having run.
  it('SW-ALR-API-TC01: an item is invisible until asset-id/generate, then appears with flow=SINGLE_GENERATE_ASSET_ID', { tags: ['@smoke'] }, () => {
    apiScanSerial(poNumber, serialGate);

    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialGate)}`).then((res) => {
      expect(res.status).to.equal(200);
      expect(listOf(res.body), 'a scanned-but-not-asset-id-generated serial must not appear').to.have.length(0);
    });

    apiCall('POST', '/products/asset-id/generate', { serialNumber: serialGate, parentSerialNumber: parentSerialGate }).then((res) => {
      expect(res.status, 'asset-id/generate for an Available, assetId-less item must succeed').to.be.lessThan(300);
      const gateAssetId = res.body?.data?.assetId ?? res.body?.assetId;
      expect(gateAssetId, 'a generated assetId must be returned').to.be.a('string').and.not.be.empty;
    }).then(() => {
      apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialGate)}`).then((res) => {
        expect(res.status).to.equal(200);
        const list = listOf(res.body);
        expect(list, 'the item must appear immediately after asset-id generation').to.have.length(1);
        expect(list[0].flow, 'flow must be SINGLE_GENERATE_ASSET_ID for a single-generate seed').to.equal('SINGLE_GENERATE_ASSET_ID');
      });
    });
  });

  // ── Search partitions (Use Case) ─────────────────────────────────────────────

  // Use Case — search partition: assetId
  it('SW-ALR-API-TC12: searching by assetId returns exactly that item', { tags: ['@regression'] }, function () {
    if (!assetIdA) this.skip();
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(assetIdA)}`).then((res) => {
      expect(res.status).to.equal(200);
      expect(listOf(res.body), `search=${assetIdA} must return exactly the seeded item`).to.have.length(1);
    });
  });

  // Use Case — search partition: serialNumber
  it('SW-ALR-API-TC13: searching by serialNumber returns exactly that item', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`).then((res) => {
      expect(res.status).to.equal(200);
      expect(listOf(res.body), `search=${serialA} must return exactly the seeded item`).to.have.length(1);
    });
  });

  // Use Case — search partition: parentSerial
  it('SW-ALR-API-TC14: searching by parentSerial returns exactly that item', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(parentSerial)}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      expect(list, `search=${parentSerial} must return exactly the seeded item`).to.have.length(1);
      expect(list[0].parentSerial, 'parentSerial must be the verbatim string supplied at generation (SW-ALR-API-TC20)').to.equal(
        parentSerial
      );
    });
  });

  // ── Cost invariance / sort (Use Case / BVA) ──────────────────────────────────

  // Use Case — cost invariance across a subsequent status transition
  it('SW-ALR-API-TC19: report cost equals the checked-in cost', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`).then((res) => {
      const row = listOf(res.body)[0];
      expect(row, 'seeded row must exist').to.exist;
      expect(parseFloat(row.cost), 'cost must equal the checked-in laptop cost').to.be.closeTo(laptopCost, CENT);
    });
  });

  // BVA — sort ordering genuinely honored
  it('SW-ALR-API-TC17: sortBy=cost&sortOrder=DESC is genuinely ordered', { tags: ['@regression'] }, function () {
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=50&sortBy=${data.sorting.epSortByValid}&sortOrder=${data.sorting.epSortOrderValidDesc}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      // Asserted, not skipped: before() now guarantees two asset-id'd rows
      // (serialA + serialB), so "fewer than two" is a broken seed, not a thin
      // environment. The old this.skip() made the only sort coverage vanish
      // silently on a clean stack.
      expect(list.length, 'the seeded pair must give at least two rows to order').to.be.at.least(2);
      const values = list.map((r) => parseFloat(r.cost ?? 0));
      for (let i = 1; i < values.length; i++) expect(values[i]).to.be.at.most(values[i - 1]);
    });
  });

  // State Transition — default state equals an explicit, named state
  it('SW-ALR-API-TC18: the default (no sortBy) request matches an explicit sortBy=assetId&sortOrder=ASC', { tags: ['@regression'] }, function () {
    // NOT a naive JS string '>=' comparison across the returned assetIds: a
    // live run on Dev's larger/older dataset showed Postgres's default
    // collation orders hyphens/punctuation differently from a byte-wise JS
    // comparison (e.g. "SJ-PARENT-..." sorts before "SJC-MJ..." in Postgres —
    // treating '-' as near-zero weight — but AFTER it under JS's '>='). That
    // is a valid collation difference, not a defect, and this TC has no
    // business asserting a specific collation's behavior. Instead, prove the
    // claim that actually matters: the default (no sortBy) request produces
    // the SAME order Postgres itself returns for an explicit
    // sortBy=assetId&sortOrder=ASC — i.e. default really is "assetId ASC",
    // whatever this database's collation says that means.
    apiCall('GET', '/reports/asset-lifecycle-report?page=1&page_size=50').then((defaultRes) => {
      expect(defaultRes.status).to.equal(200);
      const defaultIds = listOf(defaultRes.body).map((r) => r.assetId);
      // See TC17: the seeded pair guarantees two rows, so a one-row report is
      // a seeding failure rather than a reason to skip the comparison.
      expect(defaultIds.length, 'the seeded pair must give at least two rows to compare order').to.be.at.least(2);
      apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=50&sortBy=${data.sorting.defaultSortBy}&sortOrder=${data.sorting.defaultSortOrder}`).then((ascRes) => {
        expect(ascRes.status).to.equal(200);
        const ascIds = listOf(ascRes.body).map((r) => r.assetId);
        expect(defaultIds, 'default order must equal an explicit sortBy=assetId&sortOrder=ASC').to.deep.equal(ascIds);
      });
    });
  });

  // ── Status change / restock (State Transition / Decision Table) ─────────────

  // Decision Table — status change reflected in the report + cost unchanged
  it('SW-ALR-API-TC16 (part 1): marking the item Damaged is reflected as status=Damaged', { tags: ['@regression'] }, () => {
    // Precondition, not inheritance: mark-status needs a non-Damaged item.
    ensureAvailable(serialA);

    apiCall('POST', '/products/mark-status', {
      serialNumbers: [serialA],
      status: 'Damaged',
      damageReason: 'Automated test damage',
      damageComment: 'Seeded by AssetLifecycleReportAPI.cy.js',
    }).then((res) => {
      expect(res.status, 'mark-status Damaged: HTTP').to.be.lessThan(300);
    });

    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&status=Damaged&search=${encodeURIComponent(serialA)}`).then(
      (res) => {
        expect(res.status).to.equal(200);
        const list = listOf(res.body);
        expect(list, 'status=Damaged must find the item at this state').to.have.length(1);
        expect(parseFloat(list[0].cost), 'cost must be unchanged after a status change').to.be.closeTo(laptopCost, CENT);
      }
    );
  });

  // State Transition — Damaged → Available via restock
  it('SW-ALR-API-TC27 + TC16 (part 2): restock-by-serial-number returns the item to Available', { tags: ['@regression'] }, () => {
    // The transition under test is Damaged → Available, so own the "from" side
    // rather than depending on TC16 part 1 having run.
    ensureDamaged(serialA);

    apiCall('POST', '/products/restock-by-serial-number', {
      serialNumber: serialA,
      reason: 'Automated test restock',
      description: 'Seeded by AssetLifecycleReportAPI.cy.js',
    }).then((res) => {
      expect(res.status, 'restock-by-serial-number: HTTP').to.be.lessThan(300);
    });

    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&status=Available&search=${encodeURIComponent(serialA)}`).then(
      (res) => {
        expect(res.status).to.equal(200);
        expect(listOf(res.body), 'status=Available must find the restocked item').to.have.length(1);
      }
    );
  });

  // ── WMS location / container parity (State Transition / Decision Table) ────

  // State Transition — unassigned → assigned to a Location
  it('SW-ALR-API-TC21: assigning to a WMS Location populates locationPath', { tags: ['@regression'] }, () => {
    // Assigning needs a live, unassigned item — true after TC27, but not after
    // a stock-out (TC24) or a partial run, so establish it explicitly.
    ensureAvailable(serialA);
    ensureLocationUnassigned(serialA);

    createDisposableBinChain().then((chain) => {
      binChains.push(chain);
      binChain = chain;
      return apiCall('POST', `/location-assignments/${chain.bin.id}/items`, { serialNumber: serialA });
    }).then((res) => {
      expect(res.status, 'assign to location: HTTP').to.be.lessThan(300);
      return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`);
    }).then((res) => {
      const row = listOf(res.body)[0];
      expect(row, 'seeded row must exist').to.exist;
      expect(row.locationId, 'locationId must equal the bin id').to.equal(binChain.bin.id);
      expect(row.locationPath, 'locationPath must be non-empty once assigned').to.be.a('string').and.not.be.empty;
    });
  });

  // State Transition — assigned → unassigned from a Location
  it('SW-ALR-API-TC22: unassigning from the Location clears locationPath', { tags: ['@regression'] }, () => {
    // Own the "from" side of the transition: the item must BE assigned before
    // unassigning proves anything.
    ensureLocationAssigned(serialA);

    apiCall('DELETE', `/location-assignments/items/${encodeURIComponent(serialA)}`).then((res) => {
      expect(res.status, 'unassign from location: HTTP').to.be.lessThan(300);
      return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`);
    }).then((res) => {
      const row = listOf(res.body)[0];
      expect(row.locationPath ?? '', 'locationPath must be empty once unassigned').to.equal('');
    });
  });

  // Decision Table — Container-assignment branch of the locationPath resolution vs. direct Location
  it('SW-ALR-API-TC23: a Container assignment resolves locationPath through the container\'s own location', { tags: ['@regression'] }, () => {
    // A stocked-out or already-located item would make the container branch
    // unprovable, so normalise first.
    ensureAvailable(serialA);
    ensureLocationUnassigned(serialA);

    createDisposableBinChain().then((chain) => {
      // A SECOND chain, dedicated to housing the container. Both it and the
      // TC21/TC22 chain are tracked in binChains so after() deletes each one.
      binChains.push(chain);
      binChain = chain;
      return createContainerTypeViaApi(disposableTypeName('ALRType'));
    }).then((type) => {
      containerTypeId = type?.id;
      expect(containerTypeId, 'container type must be created').to.be.a('number');
      return createContainerViaApi(containerTypeId);
    }).then((container) => {
      containerId = container?.id;
      expect(containerId, 'container must be created').to.be.a('number');
      // NOTE: POST /containers/:id/move-to-location/:locationId moves the
      // container's CONTENTS out to a location — it does not relocate the
      // container itself (confirmed via a live probe: itemsMoved/quantitiesMoved
      // stayed 0 and the container's own `location` field stayed null). Placing
      // a container AT a location is done via PUT /containers/:id { locationId }.
      return apiCall('PUT', `/containers/${containerId}`, { locationId: binChain.bin.id });
    }).then((res) => {
      expect(res.status, 'PUT container locationId: HTTP').to.be.lessThan(300);
      return apiCall('POST', `/containers/${containerId}/items`, { serialNumber: serialA });
    })
      .then((res) => {
        expect(res.status, 'assign item to container: HTTP').to.be.lessThan(300);
        return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`);
      })
      .then((res) => {
        const row = listOf(res.body)[0];
        expect(row.locationPath, 'locationPath must resolve through the container\'s own location (cloc fallback)').to.be.a('string').and
          .not.be.empty;
      });
  });

  // State Transition — container-assigned → stocked-out (container_items row dropped)
  it('SW-ALR-API-TC24: stocking out a container-assigned item clears its location columns', { tags: ['@regression'] }, () => {
    // The whole point is that stock-out drops the container_items row, so the
    // item must actually be container-assigned first — TC23's side effect
    // otherwise, which a filtered run would not have produced.
    ensureContainerAssigned(serialA);

    apiCall('POST', '/products/stockout-by-serial-number', {
      serialNumber: serialA,
      reason: 'Lost',
      description: 'Seeded by AssetLifecycleReportAPI.cy.js',
      status: 'StockedOut',
    }).then((res) => {
      expect(res.status, `stockout-by-serial-number: HTTP (body=${JSON.stringify(res.body)})`).to.be.lessThan(300);
      return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serialA)}`);
    }).then((res) => {
      const row = listOf(res.body)[0];
      expect(row.status, 'status must be StockedOut').to.equal('StockedOut');
      expect(row.locationPath ?? '', 'locationPath must be cleared — stock-out drops the container_items row').to.equal('');
    });
  });

  // ── Status decision table: sold vs stockedout (Decision Table) ──────────────

  // Decision Table — status=sold vs status=stockedout, keyed on stockoutItems.reason
  it('SW-ALR-API-TC15: status=stockedout finds a reason=Lost item, status=sold does not', { tags: ['@regression'] }, () => {
    // This decision is keyed on the LATEST stockoutItems.reason, so the item
    // must be stocked out with reason=Lost for either branch to mean anything.
    // Previously that was TC24's side effect: run this TC alone and BOTH
    // assertions passed vacuously against an item that was never stocked out.
    ensureStockedOut(serialA, 'Lost');

    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&status=${data.statusFilter.epStockedOut}&search=${encodeURIComponent(serialA)}`).then(
      (res) => {
        expect(listOf(res.body), 'status=stockedout must find a reason=Lost stock-out').to.have.length(1);
      }
    );
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&status=${data.statusFilter.epSold}&search=${encodeURIComponent(serialA)}`).then(
      (res) => {
        expect(listOf(res.body), 'status=sold must NOT find a reason=Lost stock-out').to.have.length(0);
      }
    );
  });

  // ── Filters — categoryId, po (Decision Table) ────────────────────────────────

  // Decision Table — categoryId filter
  it('SW-ALR-API-TC10: categoryId filter narrows every row to that category', { tags: ['@regression'] }, function () {
    if (!categoryId) this.skip();
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=50&categoryId=${categoryId}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      // Gate on a non-empty result BEFORE the per-row loop: a filter that
      // silently returns zero rows would otherwise iterate nothing and pass
      // green — the exact regression this TC exists to catch. The seeded
      // serialA belongs to this category, so at least one row must come back.
      expect(list.length, `categoryId=${categoryId} must match at least the seeded item`).to.be.at.least(1);
      list.forEach((r) => expect(r.categoryId, `row must belong to categoryId=${categoryId}`).to.equal(categoryId));
    });
  });

  // Decision Table — po filter
  it('SW-ALR-API-TC11: po filter narrows every row to that PO', { tags: ['@regression'] }, () => {
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=50&po=${encodeURIComponent(poNumber)}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      expect(list.length, 'the seeded PO must have at least the 2 seeded serials').to.be.at.least(1);
      list.forEach((r) => expect(r.poNumber, `row must belong to po=${poNumber}`).to.equal(poNumber));
    });
  });

  // ── Export content (Use Case / Decision Table) — scoped to this PO ─────────

  // Use Case — export happy path
  it('SW-ALR-API-TC30: export succeeds with the correct content-type and default filename', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/asset-lifecycle-report/export`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          expect(res.headers['content-type']).to.match(/spreadsheet|octet-stream/);
          expect(res.headers['content-disposition'], 'default filename must start with asset-lifecycle-report-').to.include(
            'asset-lifecycle-report-'
          );
        })
    );
  });

  // Decision Table — export header column order
  it('SW-ALR-API-TC31: the Asset Lifecycle Report sheet header matches the documented column order', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/asset-lifecycle-report/export`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then((parsed) => {
            const header = parsed.sheets[0].allRows[0];
            const expectedOrder = [
              'Asset ID', 'Product', 'Category', 'Parent Serial',
              'Status', 'Cost', 'Location', 'Flow', 'PO #', 'Check-In', 'Check-Out',
            ];
            const indices = expectedOrder.map((col) => header.indexOf(col));
            indices.forEach((idx, i) => expect(idx, `header must contain "${expectedOrder[i]}"`).to.be.gte(0));
            for (let i = 1; i < indices.length; i++) {
              expect(indices[i], `"${expectedOrder[i]}" must come after "${expectedOrder[i - 1]}"`).to.be.greaterThan(indices[i - 1]);
            }
          });
        })
    );
  });

  // Use Case — export Filter Info sheet content
  it('SW-ALR-API-TC32: the Filter Info sheet lists the expected filter rows', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/asset-lifecycle-report/export?search=${encodeURIComponent(serialA)}`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
            expect(sheets, 'export must contain a second "Filter Info" sheet').to.have.length.greaterThan(1);
            const labels = sheets[1].allRows.map((r) => r[0]);
            ['Search', 'Exported At', 'Exported By', 'Total Records'].forEach((label) =>
              expect(labels, `Filter Info sheet must contain a "${label}" row`).to.include(label)
            );
          });
        })
    );
  });

  // Use Case — export honors the search filter
  it('SW-ALR-API-TC33: export honors the search filter', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/asset-lifecycle-report/export?search=${encodeURIComponent(serialA)}`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        })
        .then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
            const [, ...rows] = sheets[0].allRows;
            const dataRows = rows.filter((r) => r[0]);
            expect(dataRows, `search=${serialA} export must return exactly 1 data row`).to.have.length(1);
          });
        })
    );
  });

  // Use Case — token-in-query fallback (Frontend download-link convention)
  it('SW-ALR-API-TC34: token-in-query fallback succeeds for the export endpoint', { tags: ['@regression'] }, () => {
    cy.getAuthToken().then((token) => {
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/reports/asset-lifecycle-report/export?token=${encodeURIComponent(token)}`,
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

// ════════════════════════════════════════════════════════════════════════════
// Second, independently-seeded serialized category — the report structurally
// excludes pure (non-serialized) products (plan.md §1 point 1), so the repo's
// standard `ram` fixture cannot supply this report's "2 categories"
// requirement. This category is auto-created by Excel import from an
// unrecognized `Category` column value.
// ════════════════════════════════════════════════════════════════════════════
describe('Asset Lifecycle Report API — second serialized category (SW-ALR-API-TC28-29)', () => {
  const poNumber = `PO-ALR-CAT2-${Date.now()}`;
  const stamp = `ALR-CAT2-${Date.now()}`;
  const serial = `SN-ALR-CAT2-${Date.now()}`;
  const categoryName2 = `ALR Automation Cat 2 ${Date.now()}`;
  const search = `DEBUG-MODEL-${stamp}`;

  let productId;
  let categoryId2;

  // CORRECTED SEEDING (from an assumed "Excel import auto-creates unknown
  // categories" that a live run disproved): POST /excel/upload-inventory
  // validates the Category column against an ALLOW-LIST of already-existing
  // category names and returns 400 "Invalid category ... Available
  // categories: ..." for anything unrecognized — it does NOT create new
  // categories. The category must be created first via POST /categories
  // (allowItems: true), and the import row must drop the "Asset Tag ID" /
  // "Asset Security Code" columns (category-specific required attributes on
  // the pre-configured Laptop category, not recognized/required elsewhere)
  // and use a valid "Brand" list value ("Lenovo" — Brand is a shared
  // attribute with a fixed value list; an arbitrary brand string 400s with
  // "Column: Brand contains invalid list value.").
  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    apiCall('POST', '/categories', { name: categoryName2, allowItems: true, allowVariants: false, allowVariantItems: false }).then(
      (res) => {
        expect(res.status, 'create disposable category 2: HTTP').to.be.lessThan(300);
        categoryId2 = res.body?.data?.id;
        expect(categoryId2, 'created category must return an id').to.be.a('number');
      }
    );
    createExcelFile(`${stamp}.xlsx`, [
      {
        Category: categoryName2,
        'Model Number': search,
        Brand: 'Lenovo',
        Cost: td.products.laptop.cost,
        Price: td.products.laptop.price,
        'Support Contact': td.products.laptop.supportContact,
        'Serial Number': serial,
        // Confirmed via a live run on Dev: "Asset Security Code" is a
        // shared/common required attribute for any serialized (allowItems)
        // category on that environment (QA didn't enforce it for a brand-new
        // category, but accepting it there too as an ignored-if-unneeded
        // extra column is harmless) — include both asset columns so the
        // import succeeds on either environment.
        'Asset Tag ID': `ASSET-${serial}`,
        'Asset Security Code': `ASC-${serial}`,
      },
    ]);
    // NOT apiGetProductIdForPO()/importExcel() here: a freshly-created
    // category has no "Manage Product Name" config, so products.name stays
    // NULL until the nightly product-name worker runs (see project) —
    // /incoming-items's search-by-name lookup finds nothing for this
    // category (confirmed via a live run). Read the productId straight off
    // the upload response's `affectedProductIds` instead, exactly as
    // /excel/upload-inventory already returns it.
    cy.getAuthToken().then((token) =>
      cy
        .task('uploadExcelToApi', {
          filePath: `cypress/fixtures/${stamp}.xlsx`,
          poNumber,
          authToken: token,
          baseUrl: Cypress.env('API_BASE_URL'),
        })
        .then((res) => {
          expect(res.status, `category 2 Excel import: HTTP (body=${JSON.stringify(res.body)})`).to.be.oneOf([200, 201]);
          expect(res.body?.success, `category 2 Excel import success (error=${JSON.stringify(res.body?.error)})`).to.eq(true);
          // affectedProductIds lives under data.importSummary, not data directly.
          productId = res.body?.data?.importSummary?.affectedProductIds?.[0];
          expect(productId, 'category 2 import must return an affected productId').to.be.a('number');
        })
    );
  });

  after(() => {
    apiDeletePO(poNumber);
    // Best-effort: the backend rejects deleting a category that still has
    // associated data (products/items) — matches apiDeletePO's own
    // established "never assert on cleanup status" convention.
    if (categoryId2) apiCall('DELETE', `/categories/${categoryId2}`);
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  // Decision Table — a second, independent category is a valid partition of this report
  it('SW-ALR-API-TC28: the second disposable category appears with its own categoryName once asset-id is generated', { tags: ['@regression'] }, () => {
    apiScanSerial(poNumber, serial);
    apiCall('POST', '/products/asset-id/generate', { serialNumber: serial, parentSerialNumber: `PARENT-CAT2-${Date.now()}` }).then(
      (res) => {
        expect(res.status, 'asset-id/generate for the second category: HTTP').to.be.lessThan(300);
        return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(serial)}`);
      }
    ).then((res) => {
      const row = listOf(res.body)[0];
      expect(row, 'the second-category item must be visible').to.exist;
      expect(row.categoryName, 'categoryName must equal the second category name').to.equal(categoryName2);
      categoryId2 = row.categoryId;
    });
  });

  // Decision Table — categoryId filter isolates category 1 vs category 2
  it('SW-ALR-API-TC29: categoryId filter fully isolates category 1 from category 2', { tags: ['@regression'] }, function () {
    if (!categoryId2) this.skip();
    apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=50&categoryId=${categoryId2}`).then((res) => {
      const list = listOf(res.body);
      expect(list.length, 'category 2 must have at least the seeded item').to.be.at.least(1);
      list.forEach((r) => expect(r.categoryName, 'every row must belong to category 2').to.equal(categoryName2));
      const anyCategory1 = list.some((r) => r.categoryName === td.categories.laptop);
      expect(anyCategory1, 'category 2\'s filtered result must not include any category 1 (Laptop Automation Cat) row').to.be.false;
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Work-order flow — Reserved (via /work-orders/scan) then stocked out via
// /work-orders/product/stockout, which unconditionally writes
// stockoutItems.reason=Sold. Seeds its OWN disposable product/PO so the WO
// creation never touches real QA inventory (see plan.md §8 risk 3 — this is
// the first API-driven work-order creation in this Cypress suite).
// ════════════════════════════════════════════════════════════════════════════
describe('Asset Lifecycle Report API — work-order flow (SW-ALR-API-TC25-26)', () => {
  const poNumber = `PO-ALR-WO-${Date.now()}`;
  const stamp = `ALR-WO-${Date.now()}`;
  const serial = `SN-ALR-WO-${Date.now()}`;
  const search = `${td.products.laptop.modelNumber}-${stamp}`;
  const laptopCost = parseFloat(td.products.laptop.cost);

  let productId;
  let workOrderId;
  let workOrderNumber; // NOT the value sent at creation — see note below.

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    createExcelFile(`${stamp}.xlsx`, [
      buildLaptopRow({ categories: { laptop: td.categories.laptop }, laptop: td.products.laptop }, stamp, serial),
    ]);
    importExcel(`${stamp}.xlsx`, poNumber);
    apiGetProductIdForPO(poNumber, search)
      .then((id) => {
        productId = id;
        return apiScanSerial(poNumber, serial);
      })
      .then(() => apiCall('POST', '/products/asset-id/generate', { serialNumber: serial, parentSerialNumber: `PARENT-WO-${Date.now()}` }))
      .then((res) => {
        expect(res.status, 'asset-id/generate for the WO item: HTTP').to.be.lessThan(300);
      })
      .then(() =>
        apiCall('POST', '/work-orders', {
          workOrderNumber: `WO-ALR-${Date.now()}`,
          status: 'Open',
          products: [{ productId, name: 'ALR WO Test Product', partNumber: null, quantity: 1 }],
        })
      )
      .then((res) => {
        expect(res.status, 'work order creation: HTTP').to.be.lessThan(300);
        workOrderId = res.body?.data?.id;
        // CONFIRMED CODE FACT (found via a live run): the backend IGNORES the
        // caller-supplied workOrderNumber and always auto-generates its own
        // sequential "WO-<n>" number — createOrderSchema's workOrderNumber
        // being `.optional()` does not mean it's honored when present. Every
        // subsequent call in this describe block must use the SERVER's
        // returned number, not the one this test sent.
        workOrderNumber = res.body?.data?.workOrderNumber;
        expect(workOrderNumber, 'work order creation must return the server-assigned workOrderNumber').to.be.a('string').and.not.be
          .empty;
      });
  });

  after(() => {
    apiDeletePO(poNumber);
    if (workOrderId) apiCall('DELETE', `/work-orders/${workOrderId}`);
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  // State Transition — Available → Reserved via work-order scan
  it('SW-ALR-API-TC25: a work-order scan sets status=Reserved (the only code path that sets it)', { tags: ['@regression'] }, () => {
    apiCall('POST', '/work-orders/scan', { workOrderNumber, productId, serialNumber: serial }).then((res) => {
      expect(res.status, 'work-order scan: HTTP').to.be.lessThan(300);
      return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&status=Reserved&search=${encodeURIComponent(serial)}`);
    }).then((res) => {
      expect(listOf(res.body), 'status=Reserved must find the item immediately after the WO scan').to.have.length(1);
    });
  });

  // Use Case — work-order stock-out's reported semantics + invariant cost/po
  it('SW-ALR-API-TC26: a work-order stock-out reports status=sold, with cost and PO unchanged', { tags: ['@regression'] }, () => {
    apiCall('POST', '/work-orders/product/stockout', { workOrderNumber, productId }).then((res) => {
      expect(res.status, 'work-order stock-out: HTTP').to.be.lessThan(300);
      return apiCall('GET', `/reports/asset-lifecycle-report?page=1&page_size=10&status=sold&search=${encodeURIComponent(serial)}`);
    }).then((res) => {
      const row = listOf(res.body)[0];
      // CONFIRMED CODE FACT: stockoutProduct() (workOrder.service.ts) hardcodes
      // stockoutItems.reason = REASONS.SOLD unconditionally — every WO stock-out
      // reports status=sold here, regardless of the order's own disposition.
      expect(row, 'status=sold must find the WO-stocked-out item — WO stockout always writes reason=Sold').to.exist;
      expect(parseFloat(row.cost), 'cost must be unchanged by the WO stock-out').to.be.closeTo(laptopCost, CENT);
      expect(row.poNumber, 'poNumber must remain the original check-in PO, not the work-order number').to.equal(poNumber);
    });
  });
});
