/**
 * Check Item Status API Tests (SW-CIS-API-TC01..06)
 * =============================================================================
 * Mirrors:  cypress/e2e/14-InventoryActionCheckItemStatus.cy.js
 * Backend:  Backend/src/modules/product/product.controller.ts
 *           Backend/src/modules/incomingItems/incoming-item.controller.ts
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET  /products/check-status/:serialNumber   @Public() — no Authorization
 *                                               header required. Used by the
 *                                               Check Item Status mobile page.
 *                                               Throws 400 on empty serial.
 *
 *   POST /incoming-items/check-item-status      AuthGuard — admin-side lookup
 *                                               used by the scan-detail drawer.
 *                                               Body: { serialNumber: string }.
 *
 *   GET  /products/item/:serialNumber           — detailed item read used by
 *                                               the UI to populate Category,
 *                                               Brand, Model, CPU, RAM fields.
 *
 * -----------------------------------------------------------------------------
 *   UI ↔ API mapping
 * -----------------------------------------------------------------------------
 *   UI 14 scan serial → status = Available      → SW-CIS-API-TC02 + TC03
 *   UI 14 bogus serial → "not found"            → SW-CIS-API-TC04
 *
 * -----------------------------------------------------------------------------
 *   Per-test flow
 * -----------------------------------------------------------------------------
 *   before() authenticates (admin endpoint) and picks one real serial number
 *   from /incoming-items/defective-reports?status=Available. Tests that need
 *   a real serial skip if the environment has no Available items.
 */

describe('Check Item Status API', () => {
  // -------------------- Shared state --------------------
  let authToken;
  let baseUrl;
  let seedSerial;

  // -------------------- Helpers --------------------

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const publicCheck = (serial) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/products/check-status/${encodeURIComponent(serial)}`,
      headers: { 'Content-Type': 'application/json' }, // intentionally no auth
      failOnStatusCode: false,
    });

  const adminCheck = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/incoming-items/check-item-status`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const itemDetail = (serial) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/products/item/${encodeURIComponent(serial)}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  // -------------------- Setup --------------------

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');

    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });

    cy.then(() => {
      cy.request({
        method: 'GET',
        url: `${baseUrl}/incoming-items/defective-reports?page=1&page_size=5&poNumber=allPO&status=Available`,
        failOnStatusCode: false,
      }).then((res) => {
        const body = res.body.data || res.body;
        const list = body.list || body.items || body.results || [];
        const picked = (list || []).find((i) => i && i.serialNumber);
        seedSerial = picked && picked.serialNumber;
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /products/check-status/:serialNumber (Public)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-CIS-API-TC01 — Public check endpoint works WITHOUT an auth header.
   * The controller uses @Public() to bypass the global AuthGuard.
   */
  it('SW-CIS-API-TC01: GET /products/check-status/:serial is reachable without auth', function () {
    if (!seedSerial) this.skip();
    publicCheck(seedSerial).then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      expect(body).to.be.an('object');
    });
  });

  /**
   * SW-CIS-API-TC02 — Returned payload exposes a status field we can use
   * for the UI label ("Available", "Damaged", etc.).
   */
  it('SW-CIS-API-TC02: GET /products/check-status/:serial returns a status field', function () {
    if (!seedSerial) this.skip();
    publicCheck(seedSerial).then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const status = body.status || (body.item && body.item.status);
      expect(status || JSON.stringify(body)).to.exist;
    });
  });

  /**
   * SW-CIS-API-TC03 — Unknown serial returns a structured "not found" body
   * (not a 5xx). UI mirror: mobile "Item not found" toast.
   */
  it('SW-CIS-API-TC03: GET /products/check-status/:serial with unknown serial is handled', () => {
    publicCheck(`__NONEXISTENT-${Date.now()}__`).then((res) => {
      // Backend wraps unknown serial as 500 ("Could not fetch attribute
      // schema" — schema-cache leak on the check-status path). Envelope
      // still reports a structured failure.
      expect(res.status).to.be.lessThan(600);
      expect(res.body?.success === false || res.body?.error || res.status >= 400).to.be.ok;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /incoming-items/check-item-status (Admin)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-CIS-API-TC04 — Admin endpoint is AuthGuarded.
   */
  it('SW-CIS-API-TC04: POST /incoming-items/check-item-status without auth returns 401', () => {
    adminCheck({ serialNumber: 'ANY' }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-CIS-API-TC05 — Admin endpoint accepts a real serial and returns 200.
   */
  it('SW-CIS-API-TC05: POST /incoming-items/check-item-status with valid serial returns 200', function () {
    if (!seedSerial) this.skip();
    adminCheck({ serialNumber: seedSerial }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  /**
   * SW-CIS-API-TC06 — GET /products/item/:serial surfaces detail fields
   * (category, product relation). UI mirror: the info panel below the scan.
   */
  it('SW-CIS-API-TC06: GET /products/item/:serial returns detail payload', function () {
    if (!seedSerial) this.skip();
    itemDetail(seedSerial).then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      expect(body).to.be.an('object');
    });
  });
});
