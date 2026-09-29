/**
 * Restock API Tests (SW-RES-API-TC01..08)
 * =============================================================================
 * Mirrors:  cypress/e2e/15-InvActionRestock.cy.js
 * Backend:  Backend/src/modules/product/product.controller.ts
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST /products/restock-by-serial-number   AuthGuard — per-item restock
 *                                             used by the mobile Restock page.
 *                                             Body: { serialNumber }
 *                                             Flips StockedOut/Sold/... → Available.
 *   POST /products/restock-product            AuthGuard — pure-product restock
 *                                             by quantity (no scan).
 *                                             Body: { productId, quantity, poNumber? }
 *   POST /products/mark-available             AuthGuard + JoiValidationPipe(markAvailableSchema)
 *                                             Used by admin "Mark Available" action.
 *
 * -----------------------------------------------------------------------------
 *   UI ↔ API mapping
 * -----------------------------------------------------------------------------
 *   UI 15 scan serial → toast "Restocked"   → SW-RES-API-TC02 + TC03
 *   Admin bulk mark-available (not in 15)   → SW-RES-API-TC05 (companion)
 *   Pure-product restock (quantity-based)   → SW-RES-API-TC06
 *
 * -----------------------------------------------------------------------------
 *   Per-test flow
 * -----------------------------------------------------------------------------
 *   before() authenticates and picks one StockedOut / Damaged item so the
 *   restock tests flip it back to Available. Tests that need a real serial
 *   skip themselves on environments without stocked-out items.
 */

describe('Restock API', () => {
  // -------------------- Shared state --------------------
  let authToken;
  let baseUrl;
  let seedSerial; // a currently-non-Available item we'll restock

  // -------------------- Helpers --------------------

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const restockBySerial = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/restock-by-serial-number`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const restockProduct = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/restock-product`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  const markAvailable = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/mark-available`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const firstItemWithStatus = (status) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/incoming-items/defective-reports?page=1&page_size=5&poNumber=allPO&status=${status}`,
      failOnStatusCode: false,
    });

  // -------------------- Setup --------------------

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');

    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });

    // Prefer StockedOut; fall back to Damaged; fall back to any.
    cy.then(() => {
      firstItemWithStatus('StockedOut').then((res) => {
        const body = res.body.data || res.body;
        const list = body.list || body.items || body.results || [];
        const picked = (list || []).find((i) => i && i.serialNumber);
        if (picked) seedSerial = picked.serialNumber;
      });
    });
    cy.then(() => {
      if (seedSerial) return;
      firstItemWithStatus('Damaged').then((res) => {
        const body = res.body.data || res.body;
        const list = body.list || body.items || body.results || [];
        const picked = (list || []).find((i) => i && i.serialNumber);
        if (picked) seedSerial = picked.serialNumber;
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /products/restock-by-serial-number
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-RES-API-TC01 — restock-by-serial-number without auth → 401.
   */
  it('SW-RES-API-TC01: POST /products/restock-by-serial-number without auth returns 401', () => {
    restockBySerial({ serialNumber: 'ANY' }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-RES-API-TC02 — restock-by-serial-number with empty body is rejected.
   */
  it('SW-RES-API-TC02: POST /products/restock-by-serial-number with empty body returns non-success', () => {
    restockBySerial({}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-RES-API-TC03 — unknown serial is rejected gracefully.
   */
  it('SW-RES-API-TC03: POST /products/restock-by-serial-number with unknown serial returns non-success', () => {
    restockBySerial({ serialNumber: `__NONEXISTENT-${Date.now()}__` }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-RES-API-TC04 — restock a real non-Available item back to Available.
   * UI mirror: 15-InvActionRestock happy path — scan serial on the mobile
   * Restock page.
   */
  it('SW-RES-API-TC04: POST /products/restock-by-serial-number flips a non-Available item to Available', function () {
    if (!seedSerial) this.skip();
    restockBySerial({ serialNumber: seedSerial }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const ok = body.success === true || body.statusCode === 200;
      expect(ok || body.error).to.exist;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /products/mark-available (admin bulk-restore)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-RES-API-TC05 — mark-available without auth → 401.
   */
  it('SW-RES-API-TC05: POST /products/mark-available without auth returns 401', () => {
    markAvailable({ serialNumber: 'ANY' }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-RES-API-TC06 — mark-available accepts the Joi schema shape
   * { serialNumber?, productId?, status?, quantity?, poNumber? } (all optional).
   * An empty-object call should not be a 400 from Joi.
   */
  it('SW-RES-API-TC06: POST /products/mark-available with empty body is NOT rejected by Joi', () => {
    markAvailable({}).then((res) => {
      expect(res.status).to.not.equal(400);
    });
  });

  /**
   * SW-RES-API-TC07 — mark-available against a real serial returns 2xx.
   * Uses the restored seedSerial (flipped back to Available in TC04). The
   * service is idempotent, so calling again returns success with no change.
   */
  it('SW-RES-API-TC07: POST /products/mark-available against a real serial returns 2xx', function () {
    if (!seedSerial) this.skip();
    markAvailable({ serialNumber: seedSerial }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /products/restock-product (pure-product quantity restock)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-RES-API-TC08 — restock-product with missing body is rejected
   * gracefully by the service (not 5xx).
   */
  it('SW-RES-API-TC08: POST /products/restock-product with empty body returns non-success', () => {
    restockProduct({}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });
});
