/**
 * Import-Mapping-Templates API Tests (SW-IMT-API-TC01..07)
 * =============================================================================
 * Backend: Backend/src/modules/import-mapping/import-mapping.controller.ts
 *
 *   GET    /import-mapping-templates             query: categoryId?
 *   GET    /import-mapping-templates/:id
 *   POST   /import-mapping-templates             body: CreateMappingTemplateDto
 *   PUT    /import-mapping-templates/:id         body: UpdateMappingTemplateDto
 *   DELETE /import-mapping-templates/:id
 *   POST   /import-mapping-templates/detect      body: DetectTemplateDto
 *
 * Every route is AuthGuarded. All tests are contract-level — we never
 * create, modify, or delete a real mapping template.
 */

describe('Import-Mapping-Templates API', () => {
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
   * SW-IMT-API-TC01 — list requires auth.
   */
  it('SW-IMT-API-TC01: GET /import-mapping-templates without auth returns 401', () => {
    call('GET', '/import-mapping-templates', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-IMT-API-TC02 — list returns 200.
   */
  it('SW-IMT-API-TC02: GET /import-mapping-templates returns 200', () => {
    call('GET', '/import-mapping-templates').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-IMT-API-TC03 — GET /:id for unknown id.
   */
  it('SW-IMT-API-TC03: GET /import-mapping-templates/:id for unknown id is handled', () => {
    call('GET', '/import-mapping-templates/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-IMT-API-TC04 — POST with empty body is rejected.
   */
  it('SW-IMT-API-TC04: POST /import-mapping-templates with empty body is handled', () => {
    call('POST', '/import-mapping-templates', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-IMT-API-TC05 — PUT /:id on unknown id with empty body.
   */
  it('SW-IMT-API-TC05: PUT /import-mapping-templates/:id on unknown id is handled', () => {
    call('PUT', '/import-mapping-templates/999999999', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-IMT-API-TC06 — DELETE /:id on unknown id.
   */
  it('SW-IMT-API-TC06: DELETE /import-mapping-templates/:id on unknown id is handled', () => {
    call('DELETE', '/import-mapping-templates/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-IMT-API-TC07 — POST /detect with empty body is rejected.
   */
  it('SW-IMT-API-TC07: POST /import-mapping-templates/detect with empty body is handled', () => {
    call('POST', '/import-mapping-templates/detect', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
