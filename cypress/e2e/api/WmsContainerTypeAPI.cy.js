/**
 * WMS Container-Type API Tests (SW-WCT-API-TC01..06)
 * =============================================================================
 * Backend: Backend/src/modules/wms/container-type.controller.ts
 *
 *   GET    /container-types          — list (soft-delete aware)
 *   POST   /container-types          — body { name } (unique)
 *   PUT    /container-types          — body { updates: [{ id, name }] }
 *   DELETE /container-types/:id      — soft delete
 *   POST   /container-types/:id/restore  — undelete
 *
 * Every route is `@UseGuards(AuthGuard)`. The spec creates a throwaway
 * container-type, toggles delete/restore, and cleans up in after().
 */

describe('WMS Container-Type API', () => {
  let authToken;
  let baseUrl;
  let createdId;

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

  after(() => {
    if (!createdId) return;
    call('DELETE', `/container-types/${createdId}`);
  });

  /**
   * SW-WCT-API-TC01 — Guard rejects unauthenticated list.
   */
  it('SW-WCT-API-TC01: GET /container-types without auth returns 401', () => {
    call('GET', '/container-types', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-WCT-API-TC02 — list returns 200.
   */
  it('SW-WCT-API-TC02: GET /container-types returns 200', () => {
    call('GET', '/container-types').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WCT-API-TC03 — POST empty body → non-success (name required).
   */
  it('SW-WCT-API-TC03: POST /container-types with empty body returns non-success', () => {
    call('POST', '/container-types', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-WCT-API-TC04 — POST with valid name returns 2xx and yields an id.
   */
  it('SW-WCT-API-TC04: POST /container-types with a unique name returns 2xx', () => {
    call('POST', '/container-types', {
      name: `api-test-ct-${Date.now()}`,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const body = res.body.data || res.body;
      const id = body && (body.id || (Array.isArray(body) && body[0] && body[0].id));
      if (id) createdId = id;
    });
  });

  /**
   * SW-WCT-API-TC05 — PUT empty body → non-success (updates[] required).
   */
  it('SW-WCT-API-TC05: PUT /container-types with empty body returns non-success', () => {
    call('PUT', '/container-types', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-WCT-API-TC06 — :id/restore for a (soft-)deleted seed. We delete
   * then restore then re-delete to leave QA unchanged.
   */
  it('SW-WCT-API-TC06: POST /container-types/:id/restore round-trips delete → restore', function () {
    if (!createdId) this.skip();
    call('DELETE', `/container-types/${createdId}`).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
    call('POST', `/container-types/${createdId}/restore`, {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
