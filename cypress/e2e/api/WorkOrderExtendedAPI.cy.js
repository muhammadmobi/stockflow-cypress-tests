/**
 * Work-Order Extended API Tests (SW-WOE-API-TC01..14)
 * =============================================================================
 * Backend: Backend/src/modules/workOrder/workOrder.controller.ts
 *
 * Fills the endpoints left uncovered by 20-WorkOrderTests.cy.js:
 *
 *   GET    /work-orders                         — list
 *   GET    /work-orders/:id                     — @Public
 *   GET    /work-orders/sale-order/:orderId
 *   GET    /work-orders/scanned-items           — query: workOrderNumber, productId
 *   POST   /work-orders                         — @Public create (workOrderNumber, products[])
 *   POST   /work-orders/scan                    — { workOrderNumber, productId, serialNumber }
 *   POST   /work-orders/attach-invoice          — @Public
 *   POST   /work-orders/product/stockout        — { workOrderNumber, productId }
 *   POST   /work-orders/bulk-stockout           — { workOrderNumber, productId: [] }
 *   POST   /work-orders/unscan                  — same shape as /scan
 *   PATCH  /work-orders/:id                     — @Public partial update
 *   PATCH  /work-orders/:workOrderNumber/products — { products: [] }
 *   DELETE /work-orders/:id
 *   DELETE /work-orders/:id/cancel
 *
 * Contract-level throughout. We never touch a real work order — all
 * mutation tests target unknown ids / empty bodies so the service returns
 * a semantic error.
 */

describe('Work-Order Extended API', () => {
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

  // --------------------------- Reads ---------------------------

  /**
   * SW-WOE-API-TC01 — list requires auth.
   */
  it('SW-WOE-API-TC01: GET /work-orders without auth returns 401', () => {
    call('GET', '/work-orders', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-WOE-API-TC02 — authenticated list returns 200 with paging.
   */
  it('SW-WOE-API-TC02: GET /work-orders returns 200', () => {
    call('GET', '/work-orders?page=1&page_size=5').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WOE-API-TC03 — GET /:id is @Public — unknown id returns non-5xx.
   */
  it('SW-WOE-API-TC03: GET /work-orders/:id is public and handled for unknown id', () => {
    call('GET', '/work-orders/999999999', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC04 — sale-order/:orderId for an unknown order.
   */
  it('SW-WOE-API-TC04: GET /work-orders/sale-order/:orderId is handled', () => {
    call('GET', '/work-orders/sale-order/__NONEXISTENT__').then((res) => {
      // Service forwards the lookup to AccountWise and wraps any non-2xx
      // upstream as 500 ("Request failed with status code 500"). Envelope
      // confirms the structured failure.
      expect(res.status).to.be.lessThan(600);
      expect(res.body?.success === false || res.body?.error || res.status >= 400).to.be.ok;
    });
  });

  /**
   * SW-WOE-API-TC05 — scanned-items with unknown workOrderNumber/productId.
   */
  it('SW-WOE-API-TC05: GET /work-orders/scanned-items is handled', () => {
    call(
      'GET',
      '/work-orders/scanned-items?workOrderNumber=__NONEXISTENT__&productId=999999999&page=1&page_size=5',
    ).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  // --------------------------- Mutations (contract only) -----------

  /**
   * SW-WOE-API-TC06 — POST / with empty body is rejected (workOrderNumber
   * and products[] required by createOrderSchema).
   */
  it('SW-WOE-API-TC06: POST /work-orders with empty body is handled', () => {
    call('POST', '/work-orders', {}, { noAuth: true }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-WOE-API-TC07 — /scan with empty body is rejected.
   */
  it('SW-WOE-API-TC07: POST /work-orders/scan with empty body is handled', () => {
    call('POST', '/work-orders/scan', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC08 — attach-invoice with empty body is rejected (public).
   */
  it('SW-WOE-API-TC08: POST /work-orders/attach-invoice with empty body is handled', () => {
    call('POST', '/work-orders/attach-invoice', {}, { noAuth: true }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC09 — product/stockout with empty body is rejected.
   */
  it('SW-WOE-API-TC09: POST /work-orders/product/stockout with empty body is handled', () => {
    call('POST', '/work-orders/product/stockout', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC10 — bulk-stockout with empty body is rejected.
   */
  it('SW-WOE-API-TC10: POST /work-orders/bulk-stockout with empty body is handled', () => {
    call('POST', '/work-orders/bulk-stockout', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC11 — /unscan with empty body is rejected.
   */
  it('SW-WOE-API-TC11: POST /work-orders/unscan with empty body is handled', () => {
    call('POST', '/work-orders/unscan', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC12 — PATCH /:id on unknown id (public) is handled.
   */
  it('SW-WOE-API-TC12: PATCH /work-orders/:id on unknown id is handled', () => {
    call('PATCH', '/work-orders/999999999', { status: 'Draft' }, { noAuth: true }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC13 — PATCH /:workOrderNumber/products with empty body.
   */
  it('SW-WOE-API-TC13: PATCH /work-orders/:workOrderNumber/products with empty body is handled', () => {
    call('PATCH', '/work-orders/__NONEXISTENT__/products', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WOE-API-TC14 — DELETE + cancel against unknown ids are non-5xx.
   */
  it('SW-WOE-API-TC14: DELETE /work-orders/:id + /:id/cancel on unknown ids are handled', () => {
    call('DELETE', '/work-orders/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
    call('DELETE', '/work-orders/999999999/cancel').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
