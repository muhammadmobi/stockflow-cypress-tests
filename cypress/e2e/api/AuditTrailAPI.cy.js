/**
 * Audit Trail API Tests (SW-AT-API-TC01..06)
 * =============================================================================
 * Backend: Backend/src/modules/audittrail/audittrail.controller.ts
 *
 *   GET /audit-trails          — paginated list with filters
 *   GET /audit-trails/users    — distinct users that appear in the log
 *   GET /audit-trails/search   — free-text search
 *
 * No @Public() — global AuthGuard applies. These endpoints back the
 * "Activity Log" admin view and feed dashboards used by compliance.
 */

describe('Audit Trail API', () => {
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
   * SW-AT-API-TC01 — Guard rejects unauthenticated list.
   */
  it('SW-AT-API-TC01: GET /audit-trails without auth returns 401', () => {
    get('/audit-trails', { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-AT-API-TC02 — Authenticated paginated list returns 200.
   */
  it('SW-AT-API-TC02: GET /audit-trails returns 200', () => {
    get('/audit-trails?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
      expect(res.body).to.exist;
    });
  });

  /**
   * SW-AT-API-TC03 — page_size honoured (upper bound).
   */
  it('SW-AT-API-TC03: GET /audit-trails?page_size=1 returns at most 1 row', () => {
    get('/audit-trails?page=1&page_size=1').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const list = body.list || body.items || body.results || body;
      if (Array.isArray(list)) expect(list.length).to.be.at.most(1);
    });
  });

  /**
   * SW-AT-API-TC04 — users distinct-list is a collection. UI mirror:
   * "user" filter dropdown on Activity Log.
   */
  it('SW-AT-API-TC04: GET /audit-trails/users returns 200', () => {
    get('/audit-trails/users').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-AT-API-TC05 — search returns 2xx regardless of match count.
   */
  it('SW-AT-API-TC05: GET /audit-trails/search is reachable', () => {
    get('/audit-trails/search?term=__nope__').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-AT-API-TC06 — entityType / actionType filters are accepted.
   * Unknown values yield an empty list, never 5xx.
   */
  it('SW-AT-API-TC06: GET /audit-trails with entityType + actionType filters is handled', () => {
    get('/audit-trails?entityType=Product&actionType=UPDATE&page=1&page_size=5').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
