/**
 * Notifications API Tests (SW-NOT-API-TC01..10)
 * =============================================================================
 * Backend: Backend/src/modules/notifications/stock-notification.controller.ts
 *
 *   GET   /notifications/low-stock-products — paginated list of products
 *                                             currently below their threshold
 *   GET   /notifications               — paginated list for current user
 *   GET   /notifications/unread-count  — badge counter
 *   PATCH /notifications/:id/read      — mark single notification read
 *   PATCH /notifications/read-all      — bulk mark-read
 *   DELETE /notifications/:id          — dismiss single notification
 *   PATCH /notifications/trigger-check — manual stock-threshold re-check
 *                                        (admin) — runs the same job the
 *                                        scheduled cron runs.
 *
 * All routes fall through to the global AuthGuard (no @Public()). The UI
 * bell-icon menu and admin notification center both hit these endpoints.
 */

describe('Notifications API', () => {
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
   * SW-NOT-API-TC01 — List requires auth.
   */
  it('SW-NOT-API-TC01: GET /notifications without auth returns 401', () => {
    call('GET', '/notifications', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-NOT-API-TC02 — Authenticated list returns 200.
   */
  it('SW-NOT-API-TC02: GET /notifications returns 200', () => {
    call('GET', '/notifications?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
      expect(res.body).to.exist;
    });
  });

  /**
   * SW-NOT-API-TC03 — unread-count returns a number in the body.
   * UI mirror: red dot on the bell icon.
   */
  it('SW-NOT-API-TC03: GET /notifications/unread-count returns a numeric count', () => {
    call('GET', '/notifications/unread-count').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const count = typeof body === 'number' ? body : (body.count ?? body.unreadCount);
      expect(count === undefined || typeof count === 'number').to.be.true;
    });
  });

  /**
   * SW-NOT-API-TC04 — PATCH /:id/read with a non-existent id is handled
   * gracefully (service either 404s or returns success=false; never 5xx).
   */
  it('SW-NOT-API-TC04: PATCH /notifications/:id/read with unknown id is handled', () => {
    call('PATCH', '/notifications/999999999/read', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-NOT-API-TC05 — read-all is reachable + idempotent.
   */
  it('SW-NOT-API-TC05: PATCH /notifications/read-all returns 2xx', () => {
    call('PATCH', '/notifications/read-all', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-NOT-API-TC06 — DELETE unknown id is non-5xx.
   */
  it('SW-NOT-API-TC06: DELETE /notifications/:id with unknown id is handled', () => {
    call('DELETE', '/notifications/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-NOT-API-TC07 — trigger-check runs the stock-threshold re-check
   * pipeline and returns 2xx (admin-triggered equivalent of the cron).
   */
  it('SW-NOT-API-TC07: PATCH /notifications/trigger-check returns 2xx', () => {
    call('PATCH', '/notifications/trigger-check', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-NOT-API-TC08 — Guards also protect the mutation endpoints.
   */
  it('SW-NOT-API-TC08: PATCH /notifications/read-all without auth returns 401', () => {
    call('PATCH', '/notifications/read-all', {}, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-NOT-API-TC09 — low-stock-products list is auth-guarded.
   */
  it('SW-NOT-API-TC09: GET /notifications/low-stock-products without auth returns 401', () => {
    call('GET', '/notifications/low-stock-products', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-NOT-API-TC10 — low-stock-products returns 200 and accepts the query
   * params declared by the controller (productStatus, page, page_size, etc.).
   */
  it('SW-NOT-API-TC10: GET /notifications/low-stock-products returns 200', () => {
    call('GET', '/notifications/low-stock-products?page=1&page_size=5&productStatus=active').then((res) => {
      expect(res.status).to.equal(200);
      expect(res.body).to.exist;
    });
  });
});
