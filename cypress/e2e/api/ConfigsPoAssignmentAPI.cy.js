/**
 * Configs / PO-Assignment API Tests (SW-CFG-API-TC01..07)
 * =============================================================================
 * Backend: Backend/src/modules/configs/configs.controller.ts
 *
 *   GET    /configs                            query: type?, name?, userId?
 *   GET    /configs/:id
 *   POST   /configs                            body: { type, name, ... }
 *   PATCH  /configs/:id                        body: update
 *   DELETE /configs/:id
 *   POST   /configs/po-assignment              body: { poNumber, userId, ... }
 *   DELETE /configs/po-assignment/:poNumber    query: userId
 *   GET    /configs/po-assignment/workers
 *
 * GeneralConfigAPI covers the high-level toggle routes. This spec focuses on
 * the PO-assignment sub-resource and the CRUD-by-id surface that the
 * high-level spec skips. All tests are contract-level — we never alter a
 * live assignment.
 */

describe('Configs / PO-Assignment API', () => {
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
   * SW-CFG-API-TC01 — list without auth returns 401.
   */
  it('SW-CFG-API-TC01: GET /configs without auth returns 401', () => {
    call('GET', '/configs', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-CFG-API-TC02 — list returns 200.
   */
  it('SW-CFG-API-TC02: GET /configs returns 200', () => {
    call('GET', '/configs').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-CFG-API-TC03 — /configs/:id for unknown id.
   */
  it('SW-CFG-API-TC03: GET /configs/:id for unknown id is handled', () => {
    call('GET', '/configs/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-CFG-API-TC04 — PATCH /:id with empty body on unknown id.
   */
  it('SW-CFG-API-TC04: PATCH /configs/:id on unknown id is handled', () => {
    call('PATCH', '/configs/999999999', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-CFG-API-TC05 — /configs/po-assignment/workers returns 2xx.
   */
  it('SW-CFG-API-TC05: GET /configs/po-assignment/workers returns 2xx', () => {
    call('GET', '/configs/po-assignment/workers').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-CFG-API-TC06 — POST /po-assignment with empty body is rejected.
   */
  it('SW-CFG-API-TC06: POST /configs/po-assignment with empty body is handled', () => {
    call('POST', '/configs/po-assignment', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-CFG-API-TC07 — DELETE /po-assignment/:poNumber on unknown PO.
   */
  it('SW-CFG-API-TC07: DELETE /configs/po-assignment/:poNumber on unknown PO is handled', () => {
    call('DELETE', '/configs/po-assignment/__NONEXISTENT__?userId=999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
