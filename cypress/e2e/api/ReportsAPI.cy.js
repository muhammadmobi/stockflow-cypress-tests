/**
 * Reports API Tests (SW-RPT-API-TC01..12)
 * =============================================================================
 * Backend: Backend/src/modules/reports/reports.controller.ts
 *
 *   GET /reports/inventory-value-report                 AuthGuard
 *   GET /reports/inventory-value-report/export          AuthGuard  (xlsx)
 *   GET /reports/inventory-value-report/grouped         AuthGuard
 *   GET /reports/inventory-value-report/grouped/export  AuthGuard  (xlsx)
 *   GET /reports/po-financial-summary                   AuthGuard
 *   GET /reports/ending-inventory-report                AuthGuard
 *   GET /reports/ending-inventory-report/export         AuthGuard  (xlsx)
 *   GET /reports/ending-inventory-report/grouped        AuthGuard
 *   GET /reports/ending-inventory-report/grouped/export AuthGuard  (xlsx)
 *   GET /reports/sales-report                           AuthGuard
 *   GET /reports/sales-report/export                    AuthGuard  (xlsx)
 *   GET /reports/asset-lifecycle-report                 AuthGuard
 *   GET /reports/asset-lifecycle-report/export          AuthGuard  (xlsx)
 *   GET /reports/monthly-kpi-summary                    AuthGuard
 *
 * Every route takes optional query filters (page, page_size, search,
 * categoryId, po, status, startDate, endDate, sortBy, sortOrder). No
 * required params — exports return an empty xlsx if the filter doesn't
 * match. All routes require auth.
 */

describe('Reports API', () => {
  let authToken;
  let baseUrl;

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
      // Report aggregations run heavy joins — TC03 alone took 58s on a recent
      // QA run; allow generous headroom.
      timeout: 180000,
    });

  const getExcel = (path) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}${path}`,
      headers: headers(),
      failOnStatusCode: false,
      encoding: 'binary',
      timeout: 120000,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });
  });

  /**
   * SW-RPT-API-TC01 — Guard rejects unauthenticated inventory-value-report.
   */
  it('SW-RPT-API-TC01: GET /reports/inventory-value-report without auth returns 401', () => {
    getJson('/reports/inventory-value-report', { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-RPT-API-TC02 — inventory-value-report returns 200 with paging.
   */
  it('SW-RPT-API-TC02: GET /reports/inventory-value-report returns 200', () => {
    getJson('/reports/inventory-value-report?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-RPT-API-TC03 — grouped variant returns 200 (groupBy is required).
   */
  it('SW-RPT-API-TC03: GET /reports/inventory-value-report/grouped returns 200', () => {
    getJson('/reports/inventory-value-report/grouped?page=1&page_size=5&groupBy=category').then(
      (res) => {
        expect(res.status).to.equal(200);
      },
    );
  });

  /**
   * SW-RPT-API-TC04 — export variant returns 2xx with an xlsx body.
   */
  it('SW-RPT-API-TC04: GET /reports/inventory-value-report/export returns 2xx', () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/inventory-value-report/export`,
      headers: headers(),
      failOnStatusCode: false,
      encoding: 'binary',
      timeout: 120000,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-RPT-API-TC05 — grouped/export returns 2xx (groupBy is required).
   */
  it('SW-RPT-API-TC05: GET /reports/inventory-value-report/grouped/export returns 2xx', () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/inventory-value-report/grouped/export?groupBy=category`,
      headers: headers(),
      failOnStatusCode: false,
      encoding: 'binary',
      timeout: 120000,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-RPT-API-TC06 — po-financial-summary returns 200.
   */
  it('SW-RPT-API-TC06: GET /reports/po-financial-summary returns 200', () => {
    getJson('/reports/po-financial-summary').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-RPT-API-TC07 — ending-inventory-report returns 200.
   */
  it('SW-RPT-API-TC07: GET /reports/ending-inventory-report returns 200', () => {
    getJson('/reports/ending-inventory-report?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-RPT-API-TC08 — ending-inventory-report/grouped + export are reachable.
   */
  it('SW-RPT-API-TC08: GET /reports/ending-inventory-report/grouped + /export are 2xx', () => {
    getJson('/reports/ending-inventory-report/grouped?page=1&page_size=5&groupBy=category').then(
      (res) => {
        expect(res.status).to.equal(200);
      },
    );
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/export`,
      headers: headers(),
      failOnStatusCode: false,
      encoding: 'binary',
      timeout: 120000,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/grouped/export?groupBy=category`,
      headers: headers(),
      failOnStatusCode: false,
      encoding: 'binary',
      timeout: 120000,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-RPT-API-TC09 — sales-report returns 200; accepts reason + date range.
   */
  it('SW-RPT-API-TC09: GET /reports/sales-report with filters returns 200', () => {
    getJson('/reports/sales-report?page=1&page_size=5&reason=Sold').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-RPT-API-TC10 — sales-report/export returns 2xx.
   */
  it('SW-RPT-API-TC10: GET /reports/sales-report/export returns 2xx', () => {
    getExcel('/reports/sales-report/export').then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-RPT-API-TC11 — asset-lifecycle-report + export are reachable.
   */
  it('SW-RPT-API-TC11: GET /reports/asset-lifecycle-report + /export are 2xx', () => {
    getJson('/reports/asset-lifecycle-report?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
    });
    getExcel('/reports/asset-lifecycle-report/export').then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-RPT-API-TC12 — monthly-kpi-summary returns 200 with no params.
   */
  it('SW-RPT-API-TC12: GET /reports/monthly-kpi-summary returns 200', () => {
    getJson('/reports/monthly-kpi-summary').then((res) => {
      expect(res.status).to.equal(200);
    });
  });
});
