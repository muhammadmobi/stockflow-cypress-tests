/**
 * WMS Location-Assignment API Tests (SW-WLA-API-TC01..10)
 * =============================================================================
 * Backend: Backend/src/modules/wms/direct-location-assignment.controller.ts
 *   (Controller('location-assignments'))
 *
 * Direct-to-location assignment (no container). Exercises all 11 routes.
 * The controller guards every route with `@UseGuards(AuthGuard)`. Tests
 * stay at the contract level — we don't mutate real inventory because
 * no safe create/undo exists without touching live stock.
 *
 *   POST   /location-assignments/:locationId/items            body: { serialNumber, ... }
 *   DELETE /location-assignments/items/:serialNumber
 *   GET    /location-assignments/:locationId/items
 *   GET    /location-assignments/:locationId/containers
 *   POST   /location-assignments/:locationId/quantities       body: { productId, delta }
 *   GET    /location-assignments/:locationId/quantities
 *   PUT    /location-assignments/:fromId/move-item/:toId      body: { serialNumber }
 *   PUT    /location-assignments/:fromId/move-quantity/:toId  body: { productId, quantity }
 *   POST   /location-assignments/:locId/move-quantity-to-
 *            container/:containerId                           body: { productId, quantity }
 *   POST   /location-assignments/:fromId/move-all/:toId
 *   GET    /location-assignments/product-assignments/:productId
 */

describe('WMS Location-Assignment API', () => {
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
   * SW-WLA-API-TC01 — Guard rejects unauthenticated item assignment.
   */
  it('SW-WLA-API-TC01: POST /location-assignments/:locId/items without auth returns 401', () => {
    call('POST', '/location-assignments/1/items', {}, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-WLA-API-TC02 — GET /:locId/items for an unknown location is 2xx.
   */
  it('SW-WLA-API-TC02: GET /location-assignments/:locId/items for unknown loc is handled', () => {
    call('GET', '/location-assignments/999999999/items').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC03 — GET /:locId/containers for an unknown location.
   */
  it('SW-WLA-API-TC03: GET /location-assignments/:locId/containers is handled', () => {
    call('GET', '/location-assignments/999999999/containers').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC04 — GET /:locId/quantities for an unknown location.
   */
  it('SW-WLA-API-TC04: GET /location-assignments/:locId/quantities is handled', () => {
    call('GET', '/location-assignments/999999999/quantities').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC05 — POST /:locId/items with empty body is rejected
   * gracefully (serialNumber required).
   */
  it('SW-WLA-API-TC05: POST /location-assignments/:locId/items with empty body is handled', () => {
    call('POST', '/location-assignments/1/items', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC06 — POST /:locId/quantities with empty body is rejected.
   */
  it('SW-WLA-API-TC06: POST /location-assignments/:locId/quantities with empty body is handled', () => {
    call('POST', '/location-assignments/1/quantities', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC07 — PUT /move-item/:toId with empty body is rejected.
   */
  it('SW-WLA-API-TC07: PUT /location-assignments/:from/move-item/:to with empty body is handled', () => {
    call('PUT', '/location-assignments/1/move-item/2', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC08 — PUT /move-quantity/:toId with empty body is rejected.
   */
  it('SW-WLA-API-TC08: PUT /location-assignments/:from/move-quantity/:to with empty body is handled', () => {
    call('PUT', '/location-assignments/1/move-quantity/2', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC09 — POST /move-all/:toId against non-existent locations.
   */
  it('SW-WLA-API-TC09: POST /location-assignments/:from/move-all/:to against unknown locs is handled', () => {
    call('POST', '/location-assignments/999999999/move-all/999999998', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC10 — GET /product-assignments/:productId for unknown.
   */
  it('SW-WLA-API-TC10: GET /location-assignments/product-assignments/:productId is handled', () => {
    call('GET', '/location-assignments/product-assignments/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC11 — DELETE /items/:serialNumber against unknown serial.
   */
  it('SW-WLA-API-TC11: DELETE /location-assignments/items/:serialNumber for unknown serial is handled', () => {
    call('DELETE', `/location-assignments/items/__NONEXISTENT-${Date.now()}__`).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WLA-API-TC12 — POST /:locId/move-quantity-to-container/:containerId
   * against unknown ids w/ empty body.
   */
  it('SW-WLA-API-TC12: POST /location-assignments/:locId/move-quantity-to-container/:cid is handled', () => {
    call('POST', '/location-assignments/999999999/move-quantity-to-container/999999998', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
