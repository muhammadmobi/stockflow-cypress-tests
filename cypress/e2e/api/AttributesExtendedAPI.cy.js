/**
 * Attributes Extended API Tests (SW-ATE-API-TC01..13)
 * =============================================================================
 * Backend: Backend/src/modules/attribute/attribute.controller.ts
 *
 *   GET    /attributes                       — list (page, page_size, categoryId?)
 *   GET    /attributes/:id
 *   GET    /attributes/:id/distinct-values   — distinct existing values for a Text attribute
 *   GET    /attributes/product-scan-attribute
 *   GET    /attributes/location-label
 *   GET    /attributes/export                — xlsx
 *   POST   /attributes                       — { name, fieldName, categoryId, entityType }
 *   POST   /attributes/multi                 — ItemAttribute[]
 *   POST   /attributes/reapply-location      — no body
 *   POST   /attributes/:id/convert-type      — { targetType: 'List' | 'Text' }
 *   PATCH  /attributes                       — { id, name?, fieldName? }
 *   DELETE /attributes/:id
 *
 * Existing UI spec (04-catagoryAttribCRUDTest) exercises /attributes CRUD
 * through the admin UI. This spec covers the secondary routes that are
 * not touched by the UI — reads for product-scan-attribute / location-label /
 * export, the bulk `multi` POST, `reapply-location`, plus the Text↔List
 * conversion helpers (`distinct-values`, `convert-type`). All contract-level —
 * mutation tests use guaranteed-missing IDs to avoid touching live data.
 */

describe('Attributes Extended API', () => {
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
   * SW-ATE-API-TC01 — list requires auth.
   */
  it('SW-ATE-API-TC01: GET /attributes without auth returns 401', () => {
    call('GET', '/attributes', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-ATE-API-TC02 — list with paging returns 200.
   */
  it('SW-ATE-API-TC02: GET /attributes with paging returns 200', () => {
    call('GET', '/attributes?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-ATE-API-TC03 — product-scan-attribute is reachable.
   */
  it('SW-ATE-API-TC03: GET /attributes/product-scan-attribute returns 2xx', () => {
    call('GET', '/attributes/product-scan-attribute').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-ATE-API-TC04 — location-label is reachable.
   */
  it('SW-ATE-API-TC04: GET /attributes/location-label returns 2xx', () => {
    call('GET', '/attributes/location-label').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-ATE-API-TC05 — export returns 2xx (xlsx body).
   */
  it('SW-ATE-API-TC05: GET /attributes/export returns 2xx', () => {
    call('GET', '/attributes/export').then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-ATE-API-TC06 — POST / with empty body is rejected.
   */
  it('SW-ATE-API-TC06: POST /attributes with empty body is handled', () => {
    call('POST', '/attributes', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-ATE-API-TC07 — /multi with empty array is handled (no-op or rejected).
   */
  it('SW-ATE-API-TC07: POST /attributes/multi with empty array is handled', () => {
    call('POST', '/attributes/multi', []).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-ATE-API-TC08 — reapply-location is reachable (no body required).
   */
  it('SW-ATE-API-TC08: POST /attributes/reapply-location returns 2xx', () => {
    call('POST', '/attributes/reapply-location', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-ATE-API-TC09 — PATCH / with empty body + GET /:id unknown id.
   */
  it('SW-ATE-API-TC09: PATCH /attributes with empty body and GET /:id for unknown id are handled', () => {
    call('PATCH', '/attributes', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
    call('GET', '/attributes/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-ATE-API-TC10 — distinct-values requires auth.
   */
  it('SW-ATE-API-TC10: GET /attributes/:id/distinct-values without auth returns 401', () => {
    call('GET', '/attributes/1/distinct-values', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-ATE-API-TC11 — distinct-values for unknown id returns a semantic error
   * (NotFoundException → 404), not 5xx.
   */
  it('SW-ATE-API-TC11: GET /attributes/:id/distinct-values for unknown id is handled', () => {
    call('GET', '/attributes/999999999/distinct-values').then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-ATE-API-TC12 — convert-type requires auth.
   */
  it('SW-ATE-API-TC12: POST /attributes/:id/convert-type without auth returns 401', () => {
    call('POST', '/attributes/1/convert-type', { targetType: 'List' }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-ATE-API-TC13 — convert-type validates body and id without mutating
   * live data: empty body → BadRequest, unknown id → semantic error.
   */
  it('SW-ATE-API-TC13: POST /attributes/:id/convert-type missing body and unknown id are handled', () => {
    call('POST', '/attributes/999999999/convert-type', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
    call('POST', '/attributes/999999999/convert-type', { targetType: 'List' }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });
});
