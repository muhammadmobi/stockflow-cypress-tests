/**
 * Work Order API Tests (SW-WO-API-TC01..15)
 * =============================================================================
 * Mirrors:  cypress/e2e/20-WorkOrderTests.cy.js
 * Backend:  Backend/src/modules/workOrder/workOrder.controller.ts
 *           Backend/src/modules/workOrder/workOrder.schema.ts
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET    /work-orders                      List / search / filter by status
 *   GET    /work-orders/:id                  Read single work order
 *   GET    /work-orders/status-counts        Counts grouped by status + total
 *
 *   Creation (POST /work-orders) is NOT asserted here:
 *     - UI seeds work orders over many days against real inventory.
 *     - createOrderSchema requires a products[] array of real productId +
 *       partNumber + quantity that match existing StockWise inventory, and
 *       reservation side-effects would mutate QA data. The UI suite is the
 *       authoritative coverage for the creation path.
 *
 * -----------------------------------------------------------------------------
 *   What UI cases map to what API cases
 * -----------------------------------------------------------------------------
 *   UI → API
 *   SW-WO-TC01 (empty search)           → SW-WO-API-TC02 (list baseline)
 *   SW-WO-TC02 (search by WO#)          → SW-WO-API-TC03
 *   SW-WO-TC03 (search by SO#)          → SW-WO-API-TC04
 *   SW-WO-TC04 (search by invoice#)     → SW-WO-API-TC05
 *   SW-WO-TC05..08 (filter by status)   → SW-WO-API-TC06..09
 *   SW-WO-TC09 (invalid search → empty) → SW-WO-API-TC10
 *   SW-WO-TC10+ (list columns)          → SW-WO-API-TC02 body-shape checks
 *
 * -----------------------------------------------------------------------------
 *   Per-test flow
 * -----------------------------------------------------------------------------
 *     1. before() fetches an admin token + a small seed of live work-orders
 *        via GET /work-orders?page_size=5 so the search / status / id tests
 *        can pin their assertions to a value the backend actually has.
 *     2. Each test hits /work-orders with the query under test and validates
 *        the response shape and the filter the controller claims to honour
 *        (Open|Ready|Draft|Closed|Cancelled for status).
 *
 *   UI-only (not asserted here):
 *     - Result-count label copy.
 *     - Breadcrumb rendering + sort column behaviour.
 *     - Toasts (cancelSuccess, createSuccess, etc.).
 */

describe('Work Order API', () => {
  // -------------------- Shared state --------------------
  let authToken;
  let baseUrl;
  let seedOrder; // a work-order plucked from the first page, used as a known value

  // -------------------- Helpers --------------------

  /** JSON + Bearer auth headers. */
  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  /** GET /work-orders with an optional query string. */
  const listWorkOrders = (qs = '') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/work-orders${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  /** GET /work-orders/:id — single work order read. */
  const getWorkOrderById = (id) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/work-orders/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  /** GET /work-orders/status-counts — counts grouped by status. */
  const getStatusCounts = (opts = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/work-orders/status-counts`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
    });

  /** Pull the `.data.list` (paginated) array out of either response wrapper. */
  const extractList = (body) => {
    const data = body && (body.data || body);
    return (data && (data.list || data.items || data.results)) || [];
  };

  // -------------------- Setup --------------------

  /**
   * before(): authenticate, then fetch a small page of live work-orders to
   * pick a seedOrder for id / search tests. If QA has no work-orders at all,
   * seedOrder stays undefined and dependent tests skip themselves.
   */
  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');

    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });

    cy.then(() => {
      listWorkOrders('?page=1&page_size=5').then((res) => {
        const list = extractList(res.body);
        seedOrder = list.find((o) => o && o.workOrderNumber) || list[0];
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Authentication & baseline list
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-WO-API-TC01 — Unauthenticated request is rejected.
   * Backend workOrder controller is AuthGuarded globally.
   */
  it('SW-WO-API-TC01: GET /work-orders without auth returns 401', () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/work-orders?page=1&page_size=5`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-WO-API-TC02 — Baseline list returns paginated rows with the expected
   * column shape. UI mirror: SW-WO-TC01 (empty-query search) + SW-WO-TC10
   * (list-view columns).
   */
  it('SW-WO-API-TC02: GET /work-orders returns a paginated list with workOrderNumber', () => {
    listWorkOrders('?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      expect(list).to.be.an('array');
      if (list.length > 0) {
        expect(list[0]).to.have.property('workOrderNumber');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Search by identifier columns
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-WO-API-TC03 — Search by workOrderNumber narrows the list.
   * UI mirror: SW-WO-TC02.
   */
  it('SW-WO-API-TC03: GET /work-orders?search=<workOrderNumber> returns the matching row', function () {
    if (!seedOrder || !seedOrder.workOrderNumber) this.skip();
    const term = seedOrder.workOrderNumber;
    listWorkOrders(`?search=${encodeURIComponent(term)}&page=1&page_size=10`).then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      const hit = list.some((o) => o.workOrderNumber === term);
      expect(hit, 'seed WO is present in filtered list').to.be.true;
    });
  });

  /**
   * SW-WO-API-TC04 — Search by saleOrderNumber narrows the list.
   * UI mirror: SW-WO-TC03. Skips if QA has no WO with a sales-order number.
   */
  it('SW-WO-API-TC04: GET /work-orders?search=<saleOrderNumber> returns rows with that SO', function () {
    if (!seedOrder || !seedOrder.saleOrderNumber) this.skip();
    const term = seedOrder.saleOrderNumber;
    listWorkOrders(`?search=${encodeURIComponent(term)}&page=1&page_size=10`).then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      const hit = list.some((o) => o.saleOrderNumber === term);
      expect(hit).to.be.true;
    });
  });

  /**
   * SW-WO-API-TC05 — Search by invoiceNumber narrows the list.
   * UI mirror: SW-WO-TC04. Skips if QA has no WO with an invoice number.
   */
  it('SW-WO-API-TC05: GET /work-orders?search=<invoiceNumber> returns rows with that invoice', function () {
    if (!seedOrder || !seedOrder.invoiceNumber) this.skip();
    const term = seedOrder.invoiceNumber;
    listWorkOrders(`?search=${encodeURIComponent(term)}&page=1&page_size=10`).then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      const hit = list.some((o) => o.invoiceNumber === term);
      expect(hit).to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Status filtering (backend whitelist: Open, Ready, Draft, Closed, Cancelled)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-WO-API-TC06 — status=Open filter returns only Open rows.
   * UI mirror: SW-WO-TC05. An empty list is acceptable — the contract is
   * "only rows with status=Open are returned".
   */
  it('SW-WO-API-TC06: GET /work-orders?status=Open returns Open work orders only', () => {
    listWorkOrders('?status=Open&page=1&page_size=20').then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      list.forEach((o) => expect(o.status).to.equal('Open'));
    });
  });

  /** SW-WO-API-TC07 — status=Draft. UI mirror: SW-WO-TC06. */
  it('SW-WO-API-TC07: GET /work-orders?status=Draft returns Draft work orders only', () => {
    listWorkOrders('?status=Draft&page=1&page_size=20').then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      list.forEach((o) => expect(o.status).to.equal('Draft'));
    });
  });

  /** SW-WO-API-TC08 — status=Closed. UI mirror: SW-WO-TC07. */
  it('SW-WO-API-TC08: GET /work-orders?status=Closed returns Closed work orders only', () => {
    listWorkOrders('?status=Closed&page=1&page_size=20').then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      list.forEach((o) => expect(o.status).to.equal('Closed'));
    });
  });

  /** SW-WO-API-TC09 — status=Cancelled. UI mirror: SW-WO-TC08. */
  it('SW-WO-API-TC09: GET /work-orders?status=Cancelled returns Cancelled work orders only', () => {
    listWorkOrders('?status=Cancelled&page=1&page_size=20').then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      list.forEach((o) => expect(o.status).to.equal('Cancelled'));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Negative / validation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-WO-API-TC10 — Invalid search text yields an empty (or very small)
   * result set. UI mirror: SW-WO-TC09 "No Result" copy.
   */
  it('SW-WO-API-TC10: GET /work-orders with a garbage search term returns no rows', () => {
    listWorkOrders('?search=__INVALID_XXXXXXXXXXXXXX__&page=1&page_size=10').then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      expect(list.length).to.equal(0);
    });
  });

  /**
   * SW-WO-API-TC11 — Invalid status value returns 400 per controller
   * whitelist `['Open','Ready','Draft','Closed','Cancelled']`.
   */
  it('SW-WO-API-TC11: GET /work-orders?status=Bogus returns 400', () => {
    listWorkOrders('?status=Bogus').then((res) => {
      expect(res.status).to.equal(400);
    });
  });

  /**
   * SW-WO-API-TC12 — GET /work-orders/:id returns the same row we fetched
   * by id. UI mirror: clicking a WO row opens its detail page.
   */
  it('SW-WO-API-TC12: GET /work-orders/:id returns the work order by id', function () {
    if (!seedOrder || !seedOrder.id) this.skip();
    getWorkOrderById(seedOrder.id).then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const wo = Array.isArray(body) ? body[0] : body;
      expect(wo).to.have.property('id', seedOrder.id);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Status counts (GET /work-orders/status-counts)
  // ──────────────────────────────────────────────────────────────────────────
  // Single-call dashboard aggregation. The route is @UseGuards(AuthGuard) and
  // its service returns lowercase keys { open, ready, draft, closed, cancelled,
  // total } (workOrder.service.ts getStatusCounts) — NOT the capitalised status
  // strings the Swagger summary implies. Assertions below match the service.

  /**
   * SW-WO-API-TC13 — @Public() contract / @UseGuards(AuthGuard) regression.
   * status-counts is auth-guarded (not @Public), so an unauthenticated request
   * must be rejected with 401. Sends no Authorization header (SKILL §6.3).
   */
  // EP — invalid partition: missing credentials is the unauthenticated partition
  it('SW-WO-API-TC13: GET /work-orders/status-counts without auth returns 401', () => {
    getStatusCounts({ noAuth: true }).then((res) => {
      expect(res.status, 'auth-guarded route must reject anonymous access').to.equal(401);
    });
  });

  /**
   * SW-WO-API-TC14 — Authenticated request returns the documented payload:
   * a number for each of the five status buckets plus a numeric total.
   * Asserts the lowercase key contract the service actually emits.
   */
  // EP — valid partition: an authenticated caller gets the aggregation payload
  it('SW-WO-API-TC14: GET /work-orders/status-counts returns numeric counts per status and a total', () => {
    getStatusCounts().then((res) => {
      expect(res.status).to.equal(200);
      const data = res.body.data || res.body;
      ['open', 'ready', 'draft', 'closed', 'cancelled', 'total'].forEach((key) => {
        expect(data, `status-counts payload must include "${key}"`).to.have.property(key);
        expect(data[key], `"${key}" count must be a number`).to.be.a('number');
        expect(data[key], `"${key}" count must be non-negative`).to.be.at.least(0);
      });
    });
  });

  /**
   * SW-WO-API-TC15 — Internal consistency: total must equal the sum of the five
   * status buckets (the service computes total as open+ready+draft+closed+
   * cancelled). Guards against an aggregation regression where total drifts
   * from its components.
   */
  // Error guessing: aggregation arithmetic is a known defect cluster — total ≠ Σ parts
  it('SW-WO-API-TC15: GET /work-orders/status-counts total equals the sum of the five status counts', () => {
    getStatusCounts().then((res) => {
      expect(res.status).to.equal(200);
      const data = res.body.data || res.body;
      const sum = data.open + data.ready + data.draft + data.closed + data.cancelled;
      expect(data.total, 'total must equal open+ready+draft+closed+cancelled').to.equal(sum);
    });
  });
});
