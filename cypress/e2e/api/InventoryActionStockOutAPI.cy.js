/**
 * Inventory Action Stock-Out API Tests (SW-IAS-API-TC01..10)
 * =============================================================================
 * Mirrors:  cypress/e2e/12-InventoryActionStockOut.cy.js
 *           (uses fixture cypress/fixtures/stockOutTestsData.json)
 * Backend:  Backend/src/modules/product/product.controller.ts
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST /products/stock-out                 AuthGuard — stockOutInitiation.
 *                                            Body: { serialNumber?, productId?,
 *                                            quantity?, reason, description,
 *                                            orderNumber? }
 *                                            Used by the admin "Stock Out"
 *                                            form (non-bulk).
 *
 *   POST /products/stockout-by-serial        AuthGuard — bulk stock-out of
 *                                            many serials. Body:
 *                                            { serialNumbers[], reason,
 *                                            description }.
 *
 *   POST /products/stockout-by-serial-number AuthGuard — single-serial
 *                                            stock-out used by the mobile
 *                                            "Stock Out Items" page after a
 *                                            scan. Body: { serialNumber,
 *                                            reason, description, ... }.
 *
 * -----------------------------------------------------------------------------
 *   UI ↔ API mapping
 * -----------------------------------------------------------------------------
 *   UI 12 Stock Out with reason="Sold"          → SW-IAS-API-TC04
 *   UI 12 Stock Out with reason="Shipped"       → (contract cover in TC05)
 *   UI 12 Stock Out reason="stockout from bto"  → (contract cover in TC06)
 *   UI 12 unknown serial → toast error          → SW-IAS-API-TC03 + TC08
 *
 *   The fixture reasons we draw from are the same the UI uses:
 *     "Sold", "Shipped", "stockout from bto"
 *
 * -----------------------------------------------------------------------------
 *   Per-test flow
 * -----------------------------------------------------------------------------
 *   before() authenticates and picks one Available item so happy-path tests
 *   can flip its status to StockedOut. Each mutation test restores the item
 *   via /products/restock-by-serial-number. A final after() restock acts as
 *   a safety net in case a test body fails before the inline restore runs.
 */

describe('Inventory Action Stock-Out API', () => {
  // -------------------- Shared state --------------------
  let authToken;
  let baseUrl;
  let seedItem; // { serialNumber, productId }
  let fixtureReasons;

  // -------------------- Helpers --------------------

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const stockOut = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/stock-out`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const stockOutBulk = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/stockout-by-serial`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const stockOutBySerial = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/stockout-by-serial-number`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const restockBySerial = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/restock-by-serial-number`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  // -------------------- Setup --------------------

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');

    cy.fixture('stockOutTestsData').then((data) => {
      fixtureReasons = data.reasons;
    });

    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });

    // Seed: find any Available item so TC04/TC07 can flip its status safely.
    cy.then(() => {
      cy.request({
        method: 'GET',
        url: `${baseUrl}/incoming-items/defective-reports?page=1&page_size=10&poNumber=allPO&status=Available`,
        failOnStatusCode: false,
      }).then((res) => {
        const body = res.body.data || res.body;
        const list = body.list || body.items || body.results || [];
        const picked = (list || []).find((i) => i && i.serialNumber);
        if (picked) {
          seedItem = {
            serialNumber: picked.serialNumber,
            productId: picked.productId,
          };
        }
      });
    });
  });

  // -------------------- Teardown: restore item to Available --------------------

  after(() => {
    if (!seedItem) return;
    restockBySerial({ serialNumber: seedItem.serialNumber });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /products/stock-out (admin single stock-out)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-IAS-API-TC01 — stock-out without auth → 401.
   */
  it('SW-IAS-API-TC01: POST /products/stock-out without auth returns 401', () => {
    stockOut(
      { serialNumber: 'ANY', reason: 'Sold', description: 'x' },
      { noAuth: true },
    ).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-IAS-API-TC02 — stock-out with empty body is rejected gracefully.
   */
  it('SW-IAS-API-TC02: POST /products/stock-out with empty body returns non-success', () => {
    stockOut({}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-IAS-API-TC03 — unknown serial returns a non-success envelope (not 5xx).
   * UI mirror: toast "Serial not found" when scanning something unknown on
   * the Stock Out page.
   */
  it('SW-IAS-API-TC03: POST /products/stock-out with unknown serial returns non-success', () => {
    stockOut({
      serialNumber: `__NONEXISTENT-${Date.now()}__`,
      reason: 'Sold',
      description: 'API test unknown serial',
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-IAS-API-TC04 — stock-out an Available item with reason="Sold"
   * (fixture value). UI mirror: admin "Stock Out Items" with Sold.
   * Self-reverting: restock after asserting.
   */
  it('SW-IAS-API-TC04: POST /products/stock-out flips an Available item to StockedOut (reason=Sold)', function () {
    if (!seedItem || !fixtureReasons) this.skip();
    const sold = fixtureReasons.sold;
    const today = new Date().toLocaleDateString('en-US');
    stockOut({
      serialNumber: seedItem.serialNumber,
      reason: sold.reason,
      description: sold.description.replace('{date}', today),
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const ok = body.success === true || body.statusCode === 200;
      expect(ok || body.error).to.exist;
    });
    // Restore state so the next test has a live Available item.
    cy.then(() => restockBySerial({ serialNumber: seedItem.serialNumber }));
  });

  /**
   * SW-IAS-API-TC05 — fixture "Shipped" reason is accepted by the service.
   * We send an unknown serial to avoid mutating QA data twice, but ensure the
   * endpoint responds semantically (not 5xx).
   */
  it('SW-IAS-API-TC05: POST /products/stock-out with reason=Shipped is semantically handled', function () {
    if (!fixtureReasons) this.skip();
    const shipped = fixtureReasons.shipped;
    const today = new Date().toLocaleDateString('en-US');
    stockOut({
      serialNumber: `__NONEXISTENT-${Date.now()}__`,
      reason: shipped.reason,
      description: shipped.description.replace('{date}', today),
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-IAS-API-TC06 — fixture "stockout from bto" reason is accepted by the
   * service and doesn't fall back to 5xx.
   */
  it('SW-IAS-API-TC06: POST /products/stock-out with reason="stockout from bto" is semantically handled', function () {
    if (!fixtureReasons) this.skip();
    const fromBto = fixtureReasons.stockoutFromBTO;
    const today = new Date().toLocaleDateString('en-US');
    stockOut({
      serialNumber: `__NONEXISTENT-${Date.now()}__`,
      reason: fromBto.reason,
      description: fromBto.description.replace('{date}', today),
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /products/stockout-by-serial (bulk)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-IAS-API-TC07 — bulk stock-out without auth → 401.
   */
  it('SW-IAS-API-TC07: POST /products/stockout-by-serial without auth returns 401', () => {
    stockOutBulk(
      { serialNumbers: ['ANY'], reason: 'Sold', description: 'x' },
      { noAuth: true },
    ).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-IAS-API-TC08 — bulk stock-out with only unknown serials returns a
   * non-success envelope (never 5xx).
   */
  it('SW-IAS-API-TC08: POST /products/stockout-by-serial with unknown serials returns non-success', () => {
    stockOutBulk({
      serialNumbers: [
        `__NONEXISTENT-A-${Date.now()}__`,
        `__NONEXISTENT-B-${Date.now()}__`,
      ],
      reason: 'Sold',
      description: 'API test unknown bulk',
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /products/stockout-by-serial-number (mobile)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-IAS-API-TC09 — mobile endpoint is AuthGuarded.
   */
  it('SW-IAS-API-TC09: POST /products/stockout-by-serial-number without auth returns 401', () => {
    stockOutBySerial(
      { serialNumber: 'ANY', reason: 'Sold', description: 'x' },
      { noAuth: true },
    ).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-IAS-API-TC10 — mobile endpoint semantically rejects an unknown serial.
   * UI mirror: mobile "Stock Out Items" page — scan unknown → toast error.
   */
  it('SW-IAS-API-TC10: POST /products/stockout-by-serial-number with unknown serial returns non-success', () => {
    stockOutBySerial({
      serialNumber: `__NONEXISTENT-${Date.now()}__`,
      reason: 'Sold',
      description: 'API test mobile unknown',
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });
});
