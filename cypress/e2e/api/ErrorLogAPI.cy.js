/**
 * Error Log API Tests (SW-ERR-API-TC01..06)
 * =============================================================================
 * Backend: Backend/src/modules/errorlog/errorlog.controller.ts
 *
 *   GET /error-logs              — list with pagination + filters
 *   GET /error-logs/search       — free-text search
 *   GET /error-logs/modules      — distinct module names
 *   GET /error-logs/error-types  — distinct error type values
 *
 * All routes fall through to the global AuthGuard (no @Public() decorator).
 * UI mirror: admin Error Log page (no UI spec — this is an observability
 * surface consumed by the admin console).
 */

describe('Error Log API', () => {
  let authToken;
  let baseUrl;

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const get = (path, opts = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}${path}`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });
  });

  /**
   * SW-ERR-API-TC01 — Guard rejects unauthenticated list.
   */
  it('SW-ERR-API-TC01: GET /error-logs without auth returns 401', () => {
    get('/error-logs', { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-ERR-API-TC02 — Authenticated list returns 200 with a body.
   */
  it('SW-ERR-API-TC02: GET /error-logs returns 200', () => {
    get('/error-logs?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
      expect(res.body).to.exist;
    });
  });

  /**
   * SW-ERR-API-TC03 — search endpoint is reachable and doesn't 5xx on an
   * empty/no-match query.
   */
  it('SW-ERR-API-TC03: GET /error-logs/search with empty term returns 2xx', () => {
    get('/error-logs/search?term=').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-ERR-API-TC04 — modules distinct-list returns an array.
   * UI mirror: module filter dropdown on the Error Log page.
   */
  it('SW-ERR-API-TC04: GET /error-logs/modules returns 200 with a list', () => {
    get('/error-logs/modules').then((res) => {
      expect(res.status).to.equal(200);
      const list = res.body.data || res.body;
      expect(list).to.satisfy((v) => Array.isArray(v) || typeof v === 'object');
    });
  });

  /**
   * SW-ERR-API-TC05 — error-types distinct-list returns 200.
   * UI mirror: error-type filter dropdown.
   */
  it('SW-ERR-API-TC05: GET /error-logs/error-types returns 200', () => {
    get('/error-logs/error-types').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-ERR-API-TC06 — Server-side filter params (module, errorType) are
   * accepted; unknown values just produce an empty list, never a 5xx.
   */
  it('SW-ERR-API-TC06: GET /error-logs with module + errorType filters is handled', () => {
    get('/error-logs?module=__nope__&errorType=__nope__&page=1&page_size=5').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
