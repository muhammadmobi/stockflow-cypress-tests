/**
 * Warehouse Location Report API Tests — SW-WLR-API-TC01..29
 * =============================================================================
 * Backend:  Backend/src/modules/reports/reports.controller.ts (lines 693–841)
 *           Backend/src/modules/reports/warehouse-asset-report.service.ts
 *
 *   GET /reports/warehouse-location-report                AuthGuard  (list + summary + pagination)
 *   GET /reports/warehouse-location-report/product-items  AuthGuard  (expandable detail panel)
 *   GET /reports/warehouse-location-report/export         AuthGuard  (binary xlsx, token-in-query)
 *
 * Plan:     cypress/qa/testPlans/Reports/warehouseLocationReport/plan.md
 * Coverage: cypress/qa/testPlans/Reports/warehouseLocationReport/coverage.md
 *
 * =============================================================================
 *   Key contracts
 * =============================================================================
 *   1. Envelope: { statusCode, success, data } — data.list / data.summary / data.pagination
 *   2. Summary keys: totalProducts, serializedProducts, nonSerializedProducts,
 *      totalItems, assignedItems, unassignedItems, distinctContainers, distinctLocations
 *   3. List row keys (serialized): product_id, has_items=true, total_items, assigned_count,
 *      unassigned_count, in_containers, distinct_locations
 *   4. List row keys (non-serialized): product_id, has_items=false, total_quantity,
 *      ns_assigned_qty, ns_in_containers, ns_distinct_locations
 *   5. Product-items response: { hasItems, serializedItems[], nonSerializedLocations[], pagination }
 *   6. Invalid productId → HTTP 400 (BadRequestException, not 200+success:false)
 *   7. Invalid categoryId → HTTP 400
 *   8. itemType=asset forces has_items=true regardless of hasItems param
 *   9. Export: binary content-type; also accepts ?token=<jwt> in lieu of Bearer header
 *
 * =============================================================================
 *   Lifecycle seeding (TC18-TC25)
 * =============================================================================
 *   A mixed PO is seeded per-run with a unique stamp so WLR searches isolate
 *   exactly the test's own products.  Both product types are seeded:
 *     Serialized (laptop): 2 serials — SN_A, SN_B
 *     Non-serialized (RAM): 5 qty
 *   State progression across the lifecycle TCs:
 *     TC18: both serials scanned → Available; WLR shows product, unassigned_count=2
 *     TC19: SN_A assigned to location; assigned_count=1, product-items shows location_path
 *     TC20: RAM product qty assigned to container; distinctContainers increases, ns_assigned_qty>0
 *     TC21: SN_A unassigned from location; assigned_count reverts to 0 (unassigned_count=2)
 *     TC22: SN_A marked Damaged; item still appears in product-items (no status filter)
 *     TC23: SN_A stocked out; item still appears in product-items (report shows full inventory)
 *     TC24: Work-order not tested via API (creates live reservations affecting QA state);
 *           instead this TC verifies the report still shows SN_B after all mutations above
 *     TC25: assignedOnly=true excludes the laptop product (0 assignments after TC21's unassign)
 *   All lifecycle teardown happens in after(): delete PO, sweep disposable locations/containers.
 *
 * =============================================================================
 *   Corrections vs. initial plan
 * =============================================================================
 *   TC24 (Work Order reserve): the plan called for seeding a real WO via API.
 *   POST /work-orders requires real productId + partNumber combinations that
 *   map to QA stock — injecting a disposable serialized product into a WO and
 *   having the WO show "Reserved" status cannot be done safely without
 *   polluting QA WO state.  TC24 is therefore narrowed to a "report still
 *   shows remaining item SN_B after all prior mutations" assertion — which
 *   confirms the report is not filtered by serial status.
 */

import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedMixedPO,
  apiCheckIn,
  apiScanSerial,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import {
  createDisposableBinChain,
  sweepDisposableLocations,
} from '../../support/helpers/wmsLocationHelpers';
import {
  createContainerTypeViaApi,
  createContainerViaApi,
  deleteContainerTypeViaApi,
  emptyContainerViaApi,
  deleteContainerViaApi,
  disposableTypeName,
} from '../../support/helpers/wmsContainerHelpers';

// ── Shared state ──────────────────────────────────────────────────────────────
let authToken;
let baseUrl;

// Lifecycle seed data (TC18-TC25)
let seedPoNumber;
let seedStamp;
let seedSerialProductId;
let seedNsProductId;
let seedSN_A;
let seedSN_B;
let seedBinId;
let seedFacilityId;
let seedContainerId;
let seedContainerTypeId;

// ── Auth helpers ──────────────────────────────────────────────────────────────

const headers = () => ({
  Authorization: `Bearer ${authToken}`,
  'Content-Type': 'application/json',
});

const getJson = (path, opts = {}) =>
  cy.request({
    method: 'GET',
    url: `${baseUrl}${path}`,
    headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
    failOnStatusCode: false,
    timeout: 180000,
  });

const getExcel = (path, opts = {}) =>
  cy.request({
    method: 'GET',
    url: `${baseUrl}${path}`,
    headers: opts.noAuth
      ? { 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${authToken}` },
    failOnStatusCode: false,
    encoding: 'binary',
    timeout: 120000,
  });

const postJson = (path, body) =>
  cy.request({
    method: 'POST',
    url: `${baseUrl}${path}`,
    headers: headers(),
    body,
    failOnStatusCode: false,
    timeout: 60000,
  });

const deleteReq = (path) =>
  cy.request({
    method: 'DELETE',
    url: `${baseUrl}${path}`,
    headers: headers(),
    failOnStatusCode: false,
    timeout: 30000,
  });

// ── Route helpers ─────────────────────────────────────────────────────────────

const wlr = (qs = '') => getJson(`/reports/warehouse-location-report${qs}`);
const wlrItems = (qs) => getJson(`/reports/warehouse-location-report/product-items${qs}`);
const wlrExport = (qs = '', opts = {}) => getExcel(`/reports/warehouse-location-report/export${qs}`, opts);

// An xlsx is a ZIP container, so a real workbook always starts with the ZIP
// local-file-header magic "PK\x03\x04". Content-Type alone is not evidence of a
// workbook — a JSON error page or an empty 0-byte stream can carry the same
// header — so every export assertion pairs the header check with the first two
// magic bytes plus a non-trivial length. Requests use `encoding: 'binary'`, so
// res.body is a byte-per-char string and charCodeAt is exact.
const expectXlsxBody = (res) => {
  const body = res.body || '';
  expect(body.length, 'export body should not be empty or a stub').to.be.greaterThan(1000);
  expect(
    `${body.charCodeAt(0)},${body.charCodeAt(1)}`,
    'body should start with the ZIP magic bytes PK (0x50,0x4B) that every xlsx begins with',
  ).to.eq('80,75');
};

// ════════════════════════════════════════════════════════════════════════════
describe('Warehouse Location Report API', () => {
  // ── Global before: auth ───────────────────────────────────────────────────
  before(function () {
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

  // ── Lifecycle seed (TC18-TC25) ────────────────────────────────────────────
  before(function () {
    // cy.authSession() restores the cached Keycloak session and cy.visit('/')
    // mounts the app so IamReduxBridge mirrors the token into the window —
    // cy.getAuthToken() (used by every seeding helper: seedMixedPO/importExcel,
    // apiScanSerial, the WMS bin/container helpers) reads it from there.
    cy.authSession('admin');
    cy.visit('/');

    seedStamp = `WLR${Date.now()}`;
    seedPoNumber = `PO-WLR-${seedStamp}`;
    seedSN_A = `SNA-${seedStamp}`;
    seedSN_B = `SNB-${seedStamp}`;

    // Seed a mixed PO: 1 laptop product (serialized) + 1 RAM product (non-serialized qty=5)
    // seedMixedPO requires separate ramStamp/laptopStamp to allow distinct product names per row
    seedMixedPO({
      td,
      poNumber: seedPoNumber,
      ramStamp: `${seedStamp}R`,
      ramQty: 5,
      laptopStamp: seedStamp,
      serials: [seedSN_A, seedSN_B],
    }).then(({ laptopProductId, ramProductId }) => {
      seedSerialProductId = laptopProductId;
      seedNsProductId = ramProductId;

      // Scan both serials → Available, then check-in NS product
      return apiScanSerial(seedPoNumber, seedSN_A)
        .then(() => apiScanSerial(seedPoNumber, seedSN_B))
        .then(() => apiCheckIn({ poNumber: seedPoNumber, productId: ramProductId, quantity: 5 }));
    });

    // Create a disposable bin hierarchy for serial assignment
    createDisposableBinChain().then(({ facility, bin }) => {
      seedFacilityId = facility.id;
      seedBinId = bin.id;
    });

    // Create a disposable container for NS assignment
    const typeName = disposableTypeName('WlrType');
    createContainerTypeViaApi(typeName).then((type) => {
      seedContainerTypeId = type.id;
      createContainerViaApi(type.id).then((container) => {
        seedContainerId = container.id;
      });
    });
  });

  // ── Lifecycle teardown ────────────────────────────────────────────────────
  after(function () {
    // The teardown helpers (apiDeletePO, sweepDisposableLocations, the container
    // helpers) authenticate through cy.getAuthToken(), which reads the token
    // IamReduxBridge mirrors onto `window` — so teardown, unlike the tests, does
    // need a mounted app. testIsolation defaults to true in Cypress 15, so the
    // page is blank by the time this hook runs; re-mount it here.
    cy.authSession('admin');
    cy.visit('/');

    if (seedPoNumber) apiDeletePO(seedPoNumber);
    sweepDisposableLocations();
    if (seedContainerId) {
      emptyContainerViaApi(seedContainerId).then(() => deleteContainerViaApi(seedContainerId));
    }
    if (seedContainerTypeId) deleteContainerTypeViaApi(seedContainerTypeId);
  });

  // NOTE: there is deliberately no `beforeEach`. The previous version ran
  // `cy.authSession('admin'); cy.visit('/')` before all 29 tests, costing a full
  // app boot per test — the bulk of the suite's runtime. It was never needed:
  // every `it()` body in this file talks to the API through the local
  // getJson/postJson/deleteReq/getExcel helpers, which sign requests with the
  // module-level `authToken` captured once in the first `before()`. Only the
  // seeding `before()` and the teardown `after()` use window-sourced helpers,
  // and both mount the app themselves. If you add a test here that calls a
  // helper backed by `cy.getAuthToken()`, give that test its own visit rather
  // than reinstating a suite-wide hook.

  // ════════════════════════════════════════════════════════════════════════
  // TC01-TC03  Auth guard — all 3 routes reject unauthenticated requests
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC01: GET /reports/warehouse-location-report without auth returns 401', { tags: ['@smoke'] }, function () {
    // Technique: Error Guessing — missing token triggers global AuthGuard
    getJson('/reports/warehouse-location-report?page=1&page_size=5', { noAuth: true }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });

  it('SW-WLR-API-TC02: GET /reports/warehouse-location-report/product-items without auth returns 401', { tags: ['@smoke'] }, function () {
    // Technique: Error Guessing — missing token triggers global AuthGuard on detail route
    getJson('/reports/warehouse-location-report/product-items?productId=1', { noAuth: true }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });

  it('SW-WLR-API-TC03: GET /reports/warehouse-location-report/export without auth returns 401', { tags: ['@smoke'] }, function () {
    // Technique: Error Guessing — missing token on export route; token-in-query absent too
    getExcel('/reports/warehouse-location-report/export', { noAuth: true }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC04-TC05  Baseline shape verification
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC04: GET /reports/warehouse-location-report returns list + summary + pagination envelope', { tags: ['@smoke'] }, function () {
    // Technique: Use Case — happy path baseline; confirms the three payload sections exist
    wlr('?page=1&page_size=5').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.success).to.eq(true);
      const d = res.body.data;
      expect(d).to.have.all.keys('list', 'summary', 'pagination');

      // Summary keys
      const s = d.summary;
      expect(s).to.include.keys(
        'totalProducts', 'serializedProducts', 'nonSerializedProducts',
        'totalItems', 'assignedItems', 'unassignedItems',
        'distinctContainers', 'distinctLocations',
      );
      for (const value of Object.values(s)) {
        expect(value).to.be.a('number').and.to.be.at.least(0);
      }

      // Pagination keys
      const p = d.pagination;
      expect(p).to.include.keys('page', 'page_size', 'count', 'totalPages');
      expect(p.page).to.eq(1);
      expect(p.page_size).to.eq(5);
    });
  });

  it('SW-WLR-API-TC05: each list row has the expected structural keys', { tags: ['@regression'] }, function () {
    // Technique: Use Case — structural validation of list row shape
    wlr('?page=1&page_size=10').then((res) => {
      expect(res.status).to.eq(200);
      const list = res.body.data.list;
      // Probe-then-skip (SKILL.md §"Probe-then-skip"): an empty QA list leaves
      // nothing to structurally validate. this.skip() surfaces that as Pending in
      // the run summary; the previous cy.log()+return reported a green test that
      // had asserted nothing.
      if (list.length === 0) { this.skip(); return; }
      const row = list[0];
      expect(row).to.include.keys(
        'product_id', 'product_name', 'category_id', 'category_name', 'has_items',
      );
      if (row.has_items) {
        expect(row).to.include.keys('total_items', 'assigned_count', 'unassigned_count');
      } else {
        expect(row).to.include.keys('total_quantity', 'ns_assigned_qty');
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC06-TC07  product-items endpoint: validation + happy path
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC06: /product-items with non-integer productId returns 400', { tags: ['@regression'] }, function () {
    // Technique: BVA / Error Guessing — controller throws BadRequestException for NaN productId
    wlrItems('?productId=banana').then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  it('SW-WLR-API-TC07: /product-items with valid productId returns hasItems + arrays + pagination', { tags: ['@regression'] }, function () {
    // Technique: Use Case — happy path for detail panel; probes live data for a real productId
    wlr('?page=1&page_size=1').then((res) => {
      expect(res.status).to.eq(200);
      const list = res.body.data.list;
      if (!list || list.length === 0) {
        this.skip();
        return;
      }
      const pid = list[0].product_id;
      wlrItems(`?productId=${pid}&page=1&page_size=5`).then((detail) => {
        expect(detail.status).to.eq(200);
        expect(detail.body.success).to.eq(true);
        const d = detail.body.data;
        expect(d).to.have.all.keys('hasItems', 'serializedItems', 'nonSerializedLocations', 'pagination');
        expect(d.hasItems).to.be.a('boolean');
        expect(d.serializedItems).to.be.an('array');
        expect(d.nonSerializedLocations).to.be.an('array');
        expect(d.pagination).to.include.keys('page', 'page_size', 'count', 'totalPages');
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC08-TC09  hasItems filter
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC08: hasItems=true returns only serialized products (has_items=true)', { tags: ['@regression'] }, function () {
    // Technique: Equivalence Partitioning — true branch of Boolean filter
    wlr('?hasItems=true&page=1&page_size=25').then((res) => {
      expect(res.status).to.eq(200);
      const { list, summary } = res.body.data;
      if (list.length === 0) { this.skip(); return; }
      list.forEach((row) => expect(row.has_items).to.eq(true));
      expect(summary.nonSerializedProducts).to.eq(0);
    });
  });

  it('SW-WLR-API-TC09: hasItems=false returns only non-serialized products (has_items=false)', { tags: ['@regression'] }, function () {
    // Technique: Equivalence Partitioning — false branch of Boolean filter
    wlr('?hasItems=false&page=1&page_size=25').then((res) => {
      expect(res.status).to.eq(200);
      const { list, summary } = res.body.data;
      if (list.length === 0) { this.skip(); return; }
      list.forEach((row) => expect(row.has_items).to.eq(false));
      expect(summary.serializedProducts).to.eq(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC10-TC11  categoryId filter + validation
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC10: categoryId filter narrows results to the specified category', { tags: ['@regression'] }, function () {
    // Technique: Decision Table — categoryId supplied; only rows matching cat are returned
    // Probe live categories first
    cy.request({
      method: 'GET',
      url: `${baseUrl}/categories`,
      headers: headers(),
      failOnStatusCode: false,
      timeout: 30000,
    }).then((catRes) => {
      const cats = catRes.body?.data?.list || catRes.body?.data || catRes.body?.list || [];
      const arr = Array.isArray(cats) ? cats : [];
      if (arr.length === 0) { this.skip(); return; }
      const cat = arr[0];
      wlr(`?categoryId=${cat.id}&page=1&page_size=25`).then((res) => {
        expect(res.status).to.eq(200);
        const list = res.body.data.list;
        if (list.length === 0) { this.skip(); return; }
        list.forEach((row) => expect(row.category_id).to.eq(cat.id));
      });
    });
  });

  it('SW-WLR-API-TC11: non-integer categoryId returns 400', { tags: ['@regression'] }, function () {
    // Technique: BVA / Error Guessing — controller parseInt check throws BadRequestException
    wlr('?categoryId=abc').then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC12  itemType=asset forces serialized-only
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC12: itemType=asset returns only serialized products regardless of hasItems param', { tags: ['@regression'] }, function () {
    // Technique: Decision Table — itemType=asset overrides hasItems; effectiveHasItems forced to true
    wlr('?itemType=asset&page=1&page_size=25').then((res) => {
      expect(res.status).to.eq(200);
      const { list, summary } = res.body.data;
      if (list.length === 0) { this.skip(); return; }
      list.forEach((row) => expect(row.has_items).to.eq(true));
      expect(summary.nonSerializedProducts).to.eq(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC13  assignedOnly excludes products with zero WMS assignments
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC13: assignedOnly=true — all returned rows have at least one WMS assignment', { tags: ['@regression'] }, function () {
    // Technique: Decision Table — assignedOnly=true; INNER JOIN path in CTE; rows with 0 assignments excluded
    wlr('?assignedOnly=true&page=1&page_size=25').then((res) => {
      expect(res.status).to.eq(200);
      const { list } = res.body.data;
      if (list.length === 0) { this.skip(); return; }
      list.forEach((row) => {
        const hasSerialAssignment = row.has_items && Number(row.assigned_count) > 0;
        const hasNsAssignment = !row.has_items && Number(row.ns_assigned_qty) > 0;
        expect(hasSerialAssignment || hasNsAssignment, `product_id=${row.product_id} should have ≥1 assignment`).to.eq(true);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC14  search narrows result set
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC14: search param narrows result set — rows match the search term', { tags: ['@regression'] }, function () {
    // Technique: Use Case — free-text search applied across product_name, category_name, serial, assetId
    // Use a search term that would match at least something in QA, probing first
    // Probe a real product to search FOR, so the search has a known-correct answer.
    wlr('?page=1&page_size=1').then((res) => {
      if (!res.body.data?.list?.length) { this.skip(); return; }
      const probe = res.body.data.list[0];
      const term = (probe.product_name || '').split(' ')[0];
      if (!term) { this.skip(); return; }
      const unfilteredCount = res.body.data.pagination.count;

      wlr(`?search=${encodeURIComponent(term)}&page=1&page_size=20`).then((searchRes) => {
        expect(searchRes.status).to.eq(200);
        const list = searchRes.body.data.list;
        const searchedCount = searchRes.body.data.pagination.count;

        // Three assertions, each independently able to fail. The previous version
        // had none of these: its forEach body only called cy.log() when a row did
        // NOT match, so the test could not go red for any search behaviour at all
        // — including the backend ignoring `search` outright.
        //
        // 1. The term came from a real row, so that row MUST come back. This is
        //    what catches a search that silently matches nothing.
        expect(searchedCount, `search="${term}" must return at least the row it was taken from`).to.be.greaterThan(0);
        expect(
          list.some((r) => r.product_id === probe.product_id),
          `the probed product_id=${probe.product_id} must appear in its own search results`,
        ).to.eq(true);

        // 2. Narrowing: a filtered count must not exceed the unfiltered count.
        //    Catches `search` being dropped on the floor when QA holds more
        //    products than the term matches.
        expect(searchedCount, 'search must narrow (or at worst equal) the unfiltered count').to.be.at.most(unfilteredCount);

        // 3. Structural sanity on every returned row.
        list.forEach((row) => {
          expect(row, 'each search hit is a well-formed list row').to.include.keys('product_id', 'product_name', 'has_items');
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC15-TC16  sortBy
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC15: sortBy=totalItems sortOrder=DESC orders serialized products by total_items descending', { tags: ['@regression'] }, function () {
    // Technique: Decision Table — whitelist sortBy field: totalItems maps to pr.total_items
    wlr('?hasItems=true&sortBy=totalItems&sortOrder=DESC&page=1&page_size=10').then((res) => {
      expect(res.status).to.eq(200);
      const list = res.body.data.list;
      if (list.length < 2) { this.skip(); return; }
      for (let i = 1; i < list.length; i++) {
        expect(Number(list[i].total_items)).to.be.lte(Number(list[i - 1].total_items));
      }
    });
  });

  it('SW-WLR-API-TC16: sortBy=totalQuantity sortOrder=ASC orders non-serialized products ascending', { tags: ['@regression'] }, function () {
    // Technique: Decision Table — whitelist sortBy field: totalQuantity maps to pr.total_quantity
    wlr('?hasItems=false&sortBy=totalQuantity&sortOrder=ASC&page=1&page_size=10').then((res) => {
      expect(res.status).to.eq(200);
      const list = res.body.data.list;
      if (list.length < 2) { this.skip(); return; }
      for (let i = 1; i < list.length; i++) {
        expect(Number(list[i].total_quantity)).to.be.gte(Number(list[i - 1].total_quantity));
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC17  pagination — page 2 is disjoint from page 1
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC17: page 2 results are disjoint from page 1', { tags: ['@regression'] }, function () {
    // Technique: BVA — boundary between page 1 and page 2; no row appears on both
    wlr('?page=1&page_size=5').then((p1) => {
      expect(p1.status).to.eq(200);
      const total = p1.body.data.pagination.count;
      if (total <= 5) { this.skip(); return; }
      const page1Ids = new Set(p1.body.data.list.map((r) => r.product_id));
      wlr('?page=2&page_size=5').then((p2) => {
        expect(p2.status).to.eq(200);
        p2.body.data.list.forEach((row) => {
          expect(page1Ids.has(row.product_id), `product_id=${row.product_id} should not appear on page 1`).to.eq(false);
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC18  After stock-in: product appears in WLR with unassigned items
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC18: after scan, seeded serialized product appears in WLR with unassigned_count=2', { tags: ['@regression'] }, function () {
    // Technique: State Transition — Incoming → Available via scan; WLR captures unassigned state
    if (!seedSerialProductId) { this.skip(); return; }
    wlr(`?search=${encodeURIComponent(seedStamp)}&hasItems=true&page=1&page_size=10`).then((res) => {
      expect(res.status).to.eq(200);
      const list = res.body.data.list;
      const row = list.find((r) => r.product_id === seedSerialProductId);
      expect(row, 'seeded serialized product should appear in WLR after scan').to.exist;
      expect(Number(row.total_items), 'total_items').to.eq(2);
      expect(Number(row.unassigned_count), 'unassigned_count').to.eq(2);
      expect(Number(row.assigned_count), 'assigned_count').to.eq(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC19  After assign serialized to location: assigned_count increases, product-items shows location
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC19: after assigning SN_A to a location, assigned_count=1 and product-items shows location_path', { tags: ['@regression'] }, function () {
    // Technique: State Transition — Available (unassigned) → Available (assigned to location)
    if (!seedSerialProductId || !seedBinId) { this.skip(); return; }
    postJson(`/location-assignments/${seedBinId}/items`, { serialNumber: seedSN_A }).then((assignRes) => {
      expect(assignRes.status, 'location-assignment POST').to.be.lessThan(500);
      expect(assignRes.body?.success !== false, 'location-assignment success').to.eq(true);

      // Main report: assigned_count should now be 1
      wlr(`?search=${encodeURIComponent(seedStamp)}&hasItems=true&page=1&page_size=10`).then((res) => {
        const row = res.body.data.list.find((r) => r.product_id === seedSerialProductId);
        expect(row, 'product still in WLR').to.exist;
        expect(Number(row.assigned_count), 'assigned_count after location assign').to.eq(1);
        expect(Number(row.unassigned_count), 'unassigned_count after location assign').to.eq(1);
      });

      // Detail panel: SN_A should show a non-empty location_path
      wlrItems(`?productId=${seedSerialProductId}&page=1&page_size=10`).then((detail) => {
        expect(detail.status).to.eq(200);
        const items = detail.body.data.serializedItems;
        const snARow = items.find((i) => i.serial_number === seedSN_A);
        expect(snARow, 'SN_A in product-items').to.exist;
        expect(snARow.location_path, 'location_path should be non-empty after assign').to.be.a('string').and.not.eq('');
        expect(snARow.assignment_type, 'assignment_type').to.eq('LOCATION');
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC20  After assign NS qty to container: ns_assigned_qty > 0
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC20: after assigning NS product qty to container, ns_assigned_qty > 0', { tags: ['@regression'] }, function () {
    // Technique: State Transition — NS product (pure quantity) gets WMS container assignment
    if (!seedNsProductId || !seedContainerId) { this.skip(); return; }
    postJson(`/containers/${seedContainerId}/quantities`, { productId: seedNsProductId, delta: 3 }).then((assignRes) => {
      expect(assignRes.status, 'container qty POST').to.be.lessThan(500);
      expect(assignRes.body?.success !== false, 'container qty success').to.eq(true);

      // NS product was seeded with ramStamp=`${seedStamp}R`
      wlr(`?search=${encodeURIComponent(seedStamp + 'R')}&hasItems=false&page=1&page_size=10`).then((res) => {
        const list = res.body.data.list;
        const row = list.find((r) => r.product_id === seedNsProductId);
        expect(row, 'seeded NS product appears in WLR').to.exist;
        expect(Number(row.ns_assigned_qty), 'ns_assigned_qty after container assign').to.be.gt(0);
        expect(Number(row.ns_in_containers), 'ns_in_containers').to.be.gt(0);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC21  After unassign serialized from location: assigned_count reverts
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC21: after unassigning SN_A from location, assigned_count reverts to 0', { tags: ['@regression'] }, function () {
    // Technique: State Transition — assigned → unassigned; verifies inverse of TC19
    if (!seedSerialProductId) { this.skip(); return; }
    deleteReq(`/location-assignments/items/${encodeURIComponent(seedSN_A)}`).then((unassignRes) => {
      expect(unassignRes.status, 'location-assignment DELETE').to.be.lessThan(500);

      wlr(`?search=${encodeURIComponent(seedStamp)}&hasItems=true&page=1&page_size=10`).then((res) => {
        const row = res.body.data.list.find((r) => r.product_id === seedSerialProductId);
        expect(row, 'product still in WLR after unassign').to.exist;
        expect(Number(row.assigned_count), 'assigned_count after unassign').to.eq(0);
        expect(Number(row.unassigned_count), 'unassigned_count after unassign').to.eq(2);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC22  After marking Damaged: item still visible in product-items
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC22: after marking SN_A Damaged, item still appears in product-items (no status filter)', { tags: ['@regression'] }, function () {
    // Technique: State Transition — Available → Damaged; WLR does not filter by item status.
    // Uses POST /products/mark-status (admin flow) — available items cannot use /incoming-items/mark-status.
    if (!seedSerialProductId) { this.skip(); return; }
    postJson('/products/mark-status', {
      serialNumbers: [seedSN_A],
      status: 'Damaged',
      damageReason: 'WLR TC22 test damage',
    }).then((markRes) => {
      expect(markRes.status, 'mark-status HTTP').to.be.lessThan(500);
      expect(markRes.body?.success !== false, 'mark-status Damaged success').to.eq(true);

      wlrItems(`?productId=${seedSerialProductId}&page=1&page_size=10`).then((detail) => {
        expect(detail.status).to.eq(200);
        const items = detail.body.data.serializedItems;
        const snARow = items.find((i) => i.serial_number === seedSN_A);
        expect(snARow, 'SN_A still appears in product-items even after Damaged mark').to.exist;
        expect(snARow.item_status, 'item_status reflects Damaged').to.eq('Damaged');
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC23  After stocking out: item still visible in product-items
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC23: after stocking out SN_A, item still appears in product-items', { tags: ['@regression'] }, function () {
    // Technique: State Transition — Damaged → Available → StockedOut; WLR is not a "live inventory" view.
    // State dependency: SN_A was marked Damaged in TC22. If TC22 failed mid-assertion (after the
    // mutation but before the assertion returned), SN_A may still be Damaged here — mark-available
    // handles that correctly (Damaged → Available). The postJson path avoids cy.getAuthToken().
    if (!seedSerialProductId) { this.skip(); return; }
    postJson('/products/mark-available', { serialNumber: seedSN_A }).then((restoreRes) => {
      expect(restoreRes.status, 'mark-available HTTP').to.be.lessThan(500);
      expect(restoreRes.body?.success !== false, 'mark-available success').to.eq(true);

      // Use postJson (captured authToken) rather than apiStockOutSerial (cy.getAuthToken)
      // to avoid a LocalStorage-unavailable 401 mid-test.
      postJson('/products/stockout-by-serial-number', {
        serialNumber: seedSN_A,
        reason: 'Sold',
        description: 'WLR TC23',
      }).then((soRes) => {
        expect(soRes.status, 'stockout HTTP').to.be.lessThan(500);
        expect(soRes.body?.success !== false, 'stockout success').to.eq(true);

        wlrItems(`?productId=${seedSerialProductId}&page=1&page_size=10`).then((detail) => {
          expect(detail.status).to.eq(200);
          const items = detail.body.data.serializedItems;
          const snARow = items.find((i) => i.serial_number === seedSN_A);
          expect(snARow, 'SN_A still appears in product-items after stock-out').to.exist;
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC24  Report shows remaining available item SN_B after all mutations
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC24: SN_B (Available, unassigned) still visible in product-items after all mutations on SN_A', { tags: ['@regression'] }, function () {
    // Technique: State Transition / Use Case — report is additive; SN_B unaffected by SN_A mutations
    if (!seedSerialProductId) { this.skip(); return; }
    wlrItems(`?productId=${seedSerialProductId}&page=1&page_size=10`).then((detail) => {
      expect(detail.status).to.eq(200);
      const items = detail.body.data.serializedItems;
      const snBRow = items.find((i) => i.serial_number === seedSN_B);
      expect(snBRow, 'SN_B (Available) still visible in product-items').to.exist;
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC25  assignedOnly=true excludes seeded product (no current assignments)
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC25: assignedOnly=true excludes seeded serialized product (has 0 assignments after unassign)', { tags: ['@regression'] }, function () {
    // Technique: Decision Table — product with 0 assignments must not appear when assignedOnly=true
    if (!seedSerialProductId) { this.skip(); return; }
    wlr(`?assignedOnly=true&search=${encodeURIComponent(seedStamp)}&page=1&page_size=25`).then((res) => {
      expect(res.status).to.eq(200);
      const row = res.body.data.list.find((r) => r.product_id === seedSerialProductId);
      expect(row, 'product with 0 serial assignments should NOT appear when assignedOnly=true').to.be.undefined;
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC26-TC29  Export: auth, binary, token-in-query, hasItems filter
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC26: export with a non-integer categoryId returns 400', { tags: ['@regression'] }, function () {
    // Technique: BVA / Error Guessing — the export route validates categoryId
    // independently of the list route, and does it differently: the list route
    // throws BadRequestException (Nest exception filter), whereas the export
    // route hand-rolls `response.status(400).json({ message })` because it writes
    // to the raw Response stream. TC11 covers the list route; without this the
    // export branch is unguarded.
    //
    // (TC26 previously re-ran TC03's no-auth 401 verbatim — same route, same
    // noAuth flag, same assertion — so it added no coverage. Retargeted here
    // rather than deleted so the ID keeps its external references.)
    wlrExport('?categoryId=abc').then((res) => {
      expect(res.status, 'export must reject a non-integer categoryId').to.eq(400);
    });
  });

  it('SW-WLR-API-TC27: GET /reports/warehouse-location-report/export with auth returns binary xlsx', { tags: ['@regression'] }, function () {
    // Technique: Use Case — export returns xlsx content; Content-Type indicates spreadsheet
    wlrExport().then((res) => {
      expect(res.status).to.eq(200);
      const ct = res.headers['content-type'] || '';
      expect(ct).to.satisfy(
        (t) => t.includes('spreadsheetml') || t.includes('octet-stream') || t.includes('xlsx'),
        `Content-Type "${ct}" should indicate Excel binary`,
      );
      expectXlsxBody(res);
    });
  });

  it('SW-WLR-API-TC28: export accepts ?token=<jwt> in lieu of Bearer header', { tags: ['@regression'] }, function () {
    // Technique: Use Case — token-in-query fallback for <a href> browser downloads.
    // `{ noAuth: true }` is LOAD-BEARING, not cosmetic: KeycloakPublicGuard only
    // promotes req.query.token when the Authorization header is ABSENT
    // (`!request.headers?.authorization` — keycloak-public.guard.ts). Sending both
    // credentials would make this test pass on the header alone, i.e. it would
    // stay green even if the ?token= fallback were deleted outright. Withholding
    // the header is what makes the query token the only thing under test.
    wlrExport(`?token=${encodeURIComponent(authToken)}`, { noAuth: true }).then((res) => {
      expect(res.status, 'query token alone must authenticate the download').to.eq(200);
      const ct = res.headers['content-type'] || '';
      expect(ct).to.satisfy(
        (t) => t.includes('spreadsheetml') || t.includes('octet-stream') || t.includes('xlsx'),
        `Content-Type "${ct}" should indicate Excel binary`,
      );
      expectXlsxBody(res);
    });
  });

  it('SW-WLR-API-TC29: export with hasItems=false returns a valid xlsx whose payload differs from the unfiltered export', { tags: ['@regression'] }, function () {
    // Technique: Equivalence Partitioning — export honours the hasItems filter
    // (non-serialized partition). Cypress cannot parse xlsx, so row-level content
    // is out of scope (plan §3.2) — but asserting only "200 + Content-Type" made
    // this byte-for-byte identical to TC27 and green even if the exporter ignored
    // hasItems entirely. Comparing the filtered payload against the unfiltered one
    // is the strongest in-Cypress evidence that the filter reached the writer: a
    // non-serialized-only workbook cannot serialize to the same bytes as one
    // covering every product unless the parameter was dropped.
    //
    // The size comparison is only valid while QA holds BOTH partitions: on an
    // environment with zero serialized products, `hasItems=false` legitimately
    // equals the unfiltered set and the two payloads would match byte-for-byte.
    // Probe the summary first and skip only the differential assertion in that
    // case — the workbook-validity assertions still run.
    wlr('?page=1&page_size=1').then((probe) => {
      const serializedCount = Number(probe.body.data.summary.serializedProducts);

      wlrExport().then((unfiltered) => {
        expect(unfiltered.status).to.eq(200);
        expectXlsxBody(unfiltered);

        wlrExport('?hasItems=false').then((res) => {
          expect(res.status).to.eq(200);
          const ct = res.headers['content-type'] || '';
          expect(ct).to.satisfy(
            (t) => t.includes('spreadsheetml') || t.includes('octet-stream') || t.includes('xlsx'),
            `Content-Type "${ct}" should indicate Excel binary`,
          );
          expectXlsxBody(res);

          // Assert BOTH directions rather than skipping one — a conditional
          // `return` here would be the same silent-pass pattern the rest of this
          // spec was cleaned of. With serialized products present the payloads
          // must differ; with none present they must match, because the filter
          // then selects the whole set. Either way the test asserts.
          if (serializedCount > 0) {
            expect(
              res.body.length,
              `QA holds ${serializedCount} serialized products, so hasItems=false must produce a different payload size to the unfiltered export`,
            ).to.not.eq(unfiltered.body.length);
          } else {
            expect(
              res.body.length,
              'QA holds no serialized products, so hasItems=false selects the whole set and must match the unfiltered export',
            ).to.eq(unfiltered.body.length);
          }
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC30-TC32  Parameter-safety and boundary coverage
  // ════════════════════════════════════════════════════════════════════════

  it('SW-WLR-API-TC30: a non-whitelisted / injection-shaped sortBy is neutralised, not interpolated', { tags: ['@regression'] }, function () {
    // Technique: Error Guessing (SQL-safety) — sortBy reaches raw SQL as an ORDER BY
    // fragment. The controller passes `query.sortBy` straight through
    // (reports.controller.ts), and the service resolves it via a whitelist map with
    // a safe default: `allowedSortFields[options.sortBy || ''] || 'pr.product_name'`
    // (warehouse-asset-report.service.ts:608). This asserts that contract holds from
    // the outside: an unknown key must fall back silently rather than reach the DB.
    const payloads = ['id; DROP TABLE products--', "pr.product_name'; SELECT 1--", 'not_a_column'];

    payloads.forEach((payload) => {
      wlr(`?sortBy=${encodeURIComponent(payload)}&page=1&page_size=5`).then((res) => {
        // A 500 here means the fragment reached the query planner — the exact
        // failure this test exists to catch.
        expect(res.status, `sortBy="${payload}" must not reach SQL (500 = interpolated)`).to.eq(200);
        expect(res.body.success, `sortBy="${payload}" should resolve to the default sort`).to.eq(true);
        expect(res.body.data.list, 'list survives an unknown sort key').to.be.an('array');
      });
    });
  });

  it('SW-WLR-API-TC31: page_size boundaries — the list route is unclamped, /product-items clamps at 200', { tags: ['@regression'] }, function () {
    // Technique: BVA — the two routes handle page_size asymmetrically and neither
    // boundary was covered:
    //   list route:     `query.page_size ? parseInt(...) : 75`            → NO upper clamp
    //   /product-items: `Math.min(200, Math.max(1, parseInt(...))) : 20`  → clamped to 200
    // Asserting both in one TC documents the asymmetry and fails if either route
    // silently gains or loses a clamp.
    wlr('?page=1&page_size=1').then((lower) => {
      expect(lower.status).to.eq(200);
      expect(lower.body.data.pagination.page_size, 'lower boundary page_size=1 is honoured').to.eq(1);
      expect(lower.body.data.list.length, 'page_size=1 returns at most one row').to.be.at.most(1);

      // The /product-items clamp does NOT depend on how many products QA holds,
      // so it is asserted BEFORE the row-count guard below. Putting it after the
      // guard would let a thin environment skip a check that was always runnable.
      const pid = lower.body.data.list[0].product_id;
      wlrItems(`?productId=${pid}&page=1&page_size=100000`).then((items) => {
        expect(items.status).to.eq(200);
        expect(items.body.data.pagination.page_size, '/product-items clamps page_size to 200').to.eq(200);
      });

      // The list-route half needs enough rows to distinguish "unclamped" from
      // "ran out of data". 201 sits just past /product-items' clamp, so it proves
      // the list route does not share it — without pulling the whole table over
      // the wire. Only this half is conditional.
      const total = lower.body.data.pagination.count;
      if (total < 201) { this.skip(); return; }
      wlr('?page=1&page_size=201').then((upper) => {
        expect(upper.status).to.eq(200);
        expect(upper.body.data.pagination.page_size, 'list route does not clamp page_size at 200').to.eq(201);
        expect(upper.body.data.list.length, 'list route actually returns the 201 requested rows').to.eq(201);
      });
    });
  });

  it('SW-WLR-API-TC32: search terms containing SQL/LIKE metacharacters are handled safely', { tags: ['@regression'] }, function () {
    // Technique: Error Guessing (SQL-safety) — `search` is interpolated into an
    // ILIKE across product_name / category_name / serial / assetId. A bare quote
    // must not break out of the literal, and the LIKE metacharacters % and _ must
    // not error. Non-500 + a well-formed envelope is the contract; whether % is
    // treated as a literal or a wildcard is deliberately not asserted (the backend
    // does not document an escaping policy — see pending.md GAP-2).
    const payloads = ["'", "%", "_", "'; DROP TABLE products--", "100%'"];

    payloads.forEach((payload) => {
      wlr(`?search=${encodeURIComponent(payload)}&page=1&page_size=5`).then((res) => {
        expect(res.status, `search="${payload}" must not 500`).to.eq(200);
        expect(res.body.success, `search="${payload}" returns a success envelope`).to.eq(true);
        expect(res.body.data.list, `search="${payload}" returns a list array`).to.be.an('array');
        expect(res.body.data.pagination, `search="${payload}" returns pagination`).to.include.keys('page', 'page_size', 'count');
      });
    });
  });
});
