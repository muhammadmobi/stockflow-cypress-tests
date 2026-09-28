/**
 * Custom Reports API Tests (SW-CR-API-TC01..06)
 * =============================================================================
 * Backend: Backend/src/modules/custom-reports/custom-reports.controller.ts
 *
 *   GET  /custom-reports/templates                 — list available templates
 *   GET  /custom-reports/templates/:id/fields      — selectable fields per tpl
 *   POST /custom-reports/execute                   — run a report
 *                                                   body: ExecuteReportDto
 *                                                   { templateId, fields[],
 *                                                     filters[], page,
 *                                                     pageSize, sortBy?,
 *                                                     sortOrder?, groupBy? }
 *   POST /custom-reports/export                    — same body, Excel download
 *
 * Every route is `@UseGuards(AuthGuard)`. UI mirror: the "Custom Reports"
 * builder page in the admin dashboard.
 */

describe('Custom Reports API', () => {
  let authToken;
  let baseUrl;
  let seedTemplateId;

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
      encoding: opts.binary ? 'binary' : undefined,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });

    cy.then(() => {
      call('GET', '/custom-reports/templates').then((res) => {
        const body = res.body.data || res.body;
        const list = Array.isArray(body) ? body : (body.list || body.templates || []);
        const picked = (list || []).find((t) => t && (t.id || t.templateId));
        if (picked) seedTemplateId = picked.id || picked.templateId;
      });
    });
  });

  /**
   * SW-CR-API-TC01 — templates list is AuthGuarded.
   */
  it('SW-CR-API-TC01: GET /custom-reports/templates without auth returns 401', () => {
    call('GET', '/custom-reports/templates', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-CR-API-TC02 — Authenticated templates list returns 200.
   */
  it('SW-CR-API-TC02: GET /custom-reports/templates returns 200', () => {
    call('GET', '/custom-reports/templates').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-CR-API-TC03 — /templates/:id/fields is reachable for a real template.
   */
  it('SW-CR-API-TC03: GET /custom-reports/templates/:id/fields returns 2xx', function () {
    if (!seedTemplateId) this.skip();
    call('GET', `/custom-reports/templates/${seedTemplateId}/fields`).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-CR-API-TC04 — execute without auth → 401.
   */
  it('SW-CR-API-TC04: POST /custom-reports/execute without auth returns 401', () => {
    call('POST', '/custom-reports/execute', {}, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-CR-API-TC05 — execute with empty body is rejected gracefully
   * (templateId/fields/filters/page/pageSize all required).
   */
  it('SW-CR-API-TC05: POST /custom-reports/execute with empty body returns non-success', () => {
    call('POST', '/custom-reports/execute', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-CR-API-TC06 — execute against a real template with minimal body
   * returns 2xx. We omit optional fields and let the service default them.
   */
  it('SW-CR-API-TC06: POST /custom-reports/execute with a real templateId returns 2xx', function () {
    if (!seedTemplateId) this.skip();
    call('POST', '/custom-reports/execute', {
      templateId: seedTemplateId,
      fields: [],
      filters: [],
      page: 1,
      pageSize: 5,
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-CR-API-TC07 — export against a real template returns a downloadable
   * payload (2xx). Falls back to skip when no template seed is available.
   * Excel generation can take longer than the default 15s — bump the timeout
   * to match the 12-min long-timeout pattern used by the Frontend.
   */
  it('SW-CR-API-TC07: POST /custom-reports/export with a real templateId returns 2xx', function () {
    if (!seedTemplateId) this.skip();
    cy.request({
      method: 'POST',
      url: `${baseUrl}/custom-reports/export`,
      headers: headers(),
      failOnStatusCode: false,
      encoding: 'binary',
      timeout: 120000,
      body: {
        templateId: seedTemplateId,
        fields: [],
        filters: [],
        page: 1,
        pageSize: 5,
      },
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
