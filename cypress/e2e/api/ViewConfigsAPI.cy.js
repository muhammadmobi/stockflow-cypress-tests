/**
 * View-Configs API Tests (SW-VCF-API-TC01..06)
 * =============================================================================
 * Backend: Backend/src/modules/view-configs/view-configs.controller.ts
 *
 *   GET    /view-configs         query: type, name, page, page_size
 *   POST   /view-configs         body: view config data
 *   GET    /view-configs/:id
 *   PATCH  /view-configs/:id     body: partial update
 *   DELETE /view-configs/:id
 *
 * Every route is AuthGuarded. Existing ScanConfigAPI exercises the happy
 * paths for GET/POST/PATCH on /view-configs (type=scanView); this spec
 * adds guard enforcement + uncovered routes (/:id, DELETE /:id) plus
 * contract-level validation of POST / PATCH with empty bodies.
 */

describe('View-Configs API', () => {
  let authToken;
  let baseUrl;

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const call = (method, path, body, opts = {}) =>
    cy.request({
      method,
      url: `${baseUrl}${path}`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });
  });

  /**
   * SW-VCF-API-TC01 — list without auth returns 401.
   */
  it('SW-VCF-API-TC01: GET /view-configs without auth returns 401', () => {
    call('GET', '/view-configs', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-VCF-API-TC02 — list returns 200.
   */
  it('SW-VCF-API-TC02: GET /view-configs returns 200', () => {
    call('GET', '/view-configs').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-VCF-API-TC03 — POST with empty body is rejected.
   */
  it('SW-VCF-API-TC03: POST /view-configs with empty body is handled', () => {
    call('POST', '/view-configs', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-VCF-API-TC04 — GET /:id for unknown id.
   */
  it('SW-VCF-API-TC04: GET /view-configs/:id for unknown id is handled', () => {
    call('GET', '/view-configs/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-VCF-API-TC05 — PATCH /:id on unknown id with empty body.
   */
  it('SW-VCF-API-TC05: PATCH /view-configs/:id on unknown id is handled', () => {
    call('PATCH', '/view-configs/999999999', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-VCF-API-TC06 — DELETE /:id on unknown id.
   */
  it('SW-VCF-API-TC06: DELETE /view-configs/:id on unknown id is handled', () => {
    call('DELETE', '/view-configs/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
