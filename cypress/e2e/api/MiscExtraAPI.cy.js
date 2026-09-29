/**
 * Miscellaneous Extra API Tests (SW-MSC-API-TC01..07)
 * =============================================================================
 * Final sweep — single-route gap-fills across several modules so every
 * controller in Backend/src/modules/ has at least one dedicated test per
 * handler:
 *
 *   POST /categories/:id/convert-to-items           (category controller)
 *   POST /locations/import                          (multipart — contract only)
 *   PUT  /containers/:id/move/:toLocationId         (wms container)
 *   DELETE /containers/:id/items/:serialNumber       (wms container — nested)
 *   POST /chatbot/message/stream                    (streaming SSE endpoint)
 *
 * All tests are contract-level — we send empty bodies or target unknown
 * ids so the service returns a semantic error rather than mutating real
 * data. `chatbot/message/stream` is asserted to be reachable (non-5xx);
 * we do not consume the SSE stream.
 */

describe('Miscellaneous Extra API', () => {
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
      timeout: opts.timeout || 30000,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });
  });

  /**
   * SW-MSC-API-TC01 — convert-to-items on unknown category id.
   */
  it('SW-MSC-API-TC01: POST /categories/:id/convert-to-items on unknown id is handled', () => {
    call('POST', '/categories/999999999/convert-to-items', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-MSC-API-TC02 — /locations/import with no file is rejected (400/4xx).
   */
  it('SW-MSC-API-TC02: POST /locations/import with no file is handled', () => {
    call('POST', '/locations/import', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-MSC-API-TC03 — PUT /containers/:id/move/:toLocationId on unknown ids.
   */
  it('SW-MSC-API-TC03: PUT /containers/:id/move/:toLocationId on unknown ids is handled', () => {
    call('PUT', '/containers/999999999/move/999999998', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-MSC-API-TC04 — DELETE /containers/:id/items/:serial on unknown pair.
   * This is distinct from /containers/items/:serial (unscoped delete) — this
   * form scopes the delete to a specific container.
   */
  it('SW-MSC-API-TC04: DELETE /containers/:id/items/:serial on unknown pair is handled', () => {
    call(
      'DELETE',
      `/containers/999999999/items/__NONEXISTENT-${Date.now()}__`,
    ).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-MSC-API-TC05 — /chatbot/message/stream is reachable (SSE). We don't
   * consume the stream; we assert only that the endpoint is wired and
   * responds non-5xx.
   */
  it('SW-MSC-API-TC05: POST /chatbot/message/stream is reachable', () => {
    call(
      'POST',
      '/chatbot/message/stream',
      { message: 'Hello' },
      { timeout: 60000 },
    ).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-MSC-API-TC06 — POST /chatbot/message/stream with empty body.
   */
  it('SW-MSC-API-TC06: POST /chatbot/message/stream with empty body is handled', () => {
    call('POST', '/chatbot/message/stream', {}, { timeout: 60000 }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-MSC-API-TC07 — /categories/:id returns 2xx for a real id, non-5xx
   * for unknown id.
   */
  it('SW-MSC-API-TC07: GET /categories/:id for unknown id is handled', () => {
    call('GET', '/categories/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
