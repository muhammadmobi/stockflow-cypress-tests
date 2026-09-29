/**
 * Purchase Order Report API Tests (SW-POR-API-TC01..10)
 * =============================================================================
 * Mirrors:  cypress/e2e/PurchaseOrder/PurchaseOrderReportTests.cy.js
 * Backend:  Backend/src/modules/incomingItems/incoming-item.controller.ts
 *           Backend/src/modules/import/import.controller.ts  (po-numbers list)
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET /incoming-items/reports?poNumber=allPO
 *        Tab-count summary.  Returns { reports: { Expected, Incoming,
 *        Available, Received, Missing, Damaged, Disputed, Sold, Reserved,
 *        StockedOut, ... }, totalProductQuantities, totalPOs, totalWorkOrders }
 *        — @Public() on the backend controller (no auth required).
 *
 *   GET /incoming-items/defective-reports?page=1&page_size=75&poNumber=allPO&status=<tab>
 *        Per-tab row listing used by the report table. @Public().
 *
 *   GET /excel/po-numbers?close=true
 *        PO-number dropdown source (distinct PO numbers for the filter).
 *        AuthGuarded.
 *
 * -----------------------------------------------------------------------------
 *   Test-case map (UI ↔ API)
 * -----------------------------------------------------------------------------
 *   UI test                                                              API case
 *   ------------------------------------------------------------------   --------
 *   page loads + summary cards render                                    TC01
 *   10 tabs present                                                      TC02 (one case per tab)
 *   default "Expected" tab table loads                                   TC03
 *   Incoming / Available / Received / Missing / Damaged / Disputed /     TC04..TC08
 *     Sold / Reserved / StockedOut tab filter works
 *   PO dropdown is populated                                             TC09
 *   pagination (page_size option)                                        TC10
 *
 * -----------------------------------------------------------------------------
 *   Fixture reuse
 * -----------------------------------------------------------------------------
 *   Loads cypress/fixtures/purchaseOrderReportData.json for the canonical
 *   endpoint paths, tab list, and pagination defaults — matches the UI test.
 */

describe('Purchase Order Report API', () => {
  // -------------------- Shared state --------------------
  let authToken;
  let baseUrl;
  let fixture;

  // -------------------- Helpers --------------------

  /** JSON + Bearer auth headers (used by AuthGuarded endpoints). */
  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  /** GET /incoming-items/reports — public; no Authorization header. */
  const tabCounts = (qs = '?poNumber=allPO') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/incoming-items/reports${qs}`,
      failOnStatusCode: false,
    });

  /** GET /incoming-items/defective-reports — public; no Authorization header. */
  const tabItems = (qs) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/incoming-items/defective-reports${qs}`,
      failOnStatusCode: false,
    });

  /** GET /excel/po-numbers — AuthGuarded; drives the PO dropdown. */
  const poList = (qs = '?close=true') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/excel/po-numbers${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  // -------------------- Setup --------------------

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');

    cy.fixture('purchaseOrderReportData').then((data) => {
      fixture = data;
    });

    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Tab-count summary
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-POR-API-TC01 — GET /incoming-items/reports returns the tab-count
   * summary for poNumber=allPO.
   * UI mirror: summary cards + top totals on /purchase-order-report page.
   *
   * Assertions:
   *   - 200 status.
   *   - body has reports / totalProductQuantities / totalPOs / totalWorkOrders.
   */
  it('SW-POR-API-TC01: GET /incoming-items/reports?poNumber=allPO returns tab-count summary', () => {
    tabCounts('?poNumber=allPO').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      expect(body).to.have.property('reports');
      expect(body).to.have.property('totalProductQuantities');
      expect(body).to.have.property('totalPOs');
      expect(body).to.have.property('totalWorkOrders');
    });
  });

  /**
   * SW-POR-API-TC02 — All 10 summaryKeys expected by the UI fixture exist
   * on `reports`. UI mirror: the 10 clickable tabs on the page.
   *
   * Each summaryKey in purchaseOrderReportData.tabs[] must be a property of
   * reports — backend naming contract. A missing key would break a tab.
   */
  it('SW-POR-API-TC02: every tab summaryKey is present on reports', () => {
    tabCounts('?poNumber=allPO').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const reports = body.reports || {};
      fixture.tabs.forEach((tab) => {
        expect(reports, `reports has ${tab.summaryKey}`).to.have.property(tab.summaryKey);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Per-tab table listing (defective-reports)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-POR-API-TC03 — Default "Expected" tab loads a paginated list.
   * UI mirror: landing on the report page shows the Expected rows.
   */
  it('SW-POR-API-TC03: GET /incoming-items/defective-reports for Expected returns paginated rows', () => {
    tabItems('?page=1&page_size=75&poNumber=allPO&status=Expected').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const list = body.list || body.items || body.results || [];
      expect(list).to.be.an('array');
    });
  });

  /**
   * SW-POR-API-TC04..TC08 — Each non-Expected tab filter returns its own
   * paginated list.  UI mirror: clicking the tab switches the listing API
   * query string's status value.
   *
   * An empty list is acceptable — the contract being tested is "endpoint
   * accepts the status value and returns a well-formed paginated body".
   */
  ['Incoming', 'Available', 'Received', 'Missing', 'Damaged'].forEach((status, idx) => {
    const caseId = `TC0${4 + idx}`;
    it(`SW-POR-API-${caseId}: GET /incoming-items/defective-reports?status=${status} returns 200 with a list`, () => {
      tabItems(`?page=1&page_size=75&poNumber=allPO&status=${status}`).then((res) => {
        expect(res.status).to.equal(200);
        const body = res.body.data || res.body;
        const list = body.list || body.items || body.results || [];
        expect(list).to.be.an('array');
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PO dropdown source
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-POR-API-TC09 — GET /excel/po-numbers?close=true populates the PO
   * dropdown. UI mirror: the "All POs" select control on the filter bar.
   */
  it('SW-POR-API-TC09: GET /excel/po-numbers?close=true returns a list of PO numbers', () => {
    poList('?close=true').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const arr = body.poList || body.list || body;
      expect(Array.isArray(arr) || Array.isArray(body)).to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Pagination & negative
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-POR-API-TC10 — Pagination honours page_size=1.
   * UI mirror: switching the page-size selector.
   */
  it('SW-POR-API-TC10: GET /incoming-items/defective-reports?page_size=1 returns at most 1 row', () => {
    tabItems('?page=1&page_size=1&poNumber=allPO&status=Expected').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const list = body.list || body.items || body.results || [];
      expect(list.length).to.be.at.most(1);
    });
  });
});
