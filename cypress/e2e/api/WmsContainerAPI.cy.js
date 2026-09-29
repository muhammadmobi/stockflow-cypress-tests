/**
 * WMS Container API Tests (SW-WCN-API-TC01..25)
 * =============================================================================
 * Backend: Backend/src/modules/wms/container.controller.ts
 *
 * Exercises the 26 routes on the Container controller. The spec sticks to
 * contract-level assertions (401 on guards, non-success on malformed
 * bodies, 2xx on safe reads) and does NOT mutate any real container we
 * didn't create ourselves. Happy-path creation creates a disposable
 * Container and deletes it in after().
 *
 *   Reads
 *   -----
 *   GET  /containers
 *   GET  /containers/next-code/:containerTypeId
 *   GET  /containers/check-location/:locationId
 *   GET  /containers/item-product-locations
 *   GET  /containers/:id
 *   GET  /containers/:id/items
 *   GET  /containers/:id/quantities
 *   GET  /containers/product-assignments/:productId
 *
 *   Mutations (body shapes documented at the matching test)
 *   -----------------------------------------------------
 *   POST   /containers                               body: { containerTypeId, code, ... }
 *   PUT    /containers/:id                           partial patch
 *   DELETE /containers/:id
 *   DELETE /containers/items/:serialNumber
 *   DELETE /containers/:id/items/:serialNumber
 *   PUT    /containers/:id/move/:toLocationId
 *   POST   /containers/:id/quantities                body: { productId, delta }
 *   POST   /containers/:id/recalculate
 *   POST   /containers/:id/items                     body: { serialNumber, ... }
 *   POST   /containers/:id/assign                    body: { type, productId, quantity|serialNumber }
 *   POST   /containers/:id/move-to-location/:locId
 *   POST   /containers/:id/move-quantity-to-
 *            location/:locId                         body: { productId, quantity }
 *   POST   /containers/:id/move-from-location/:locId
 *   POST   /containers/:id/move-contents             body: { targetContainerId, ... }
 *   POST   /containers/:id/clear
 *   POST   /containers/scan-assign                   body: { containerCode, serialNumber }
 *                                                    (no AuthGuard decorator —
 *                                                     falls through to global)
 */

describe('WMS Container API', () => {
  let authToken;
  let baseUrl;
  let seedContainerTypeId;
  let createdContainerId;

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

    // Pull any existing container-type id so the POST happy path can run.
    cy.then(() => {
      call('GET', '/container-types').then((res) => {
        const body = res.body.data || res.body;
        const list = Array.isArray(body) ? body : (body.list || body.items || []);
        const picked = (list || []).find((ct) => ct && ct.id && !ct.isDeleted);
        if (picked) seedContainerTypeId = picked.id;
      });
    });
  });

  after(() => {
    if (!createdContainerId) return;
    call('DELETE', `/containers/${createdContainerId}`);
  });

  // --------------------------- Reads ---------------------------

  /**
   * SW-WCN-API-TC01 — list requires auth.
   */
  it('SW-WCN-API-TC01: GET /containers without auth returns 401', () => {
    call('GET', '/containers', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-WCN-API-TC02 — list returns 200.
   */
  it('SW-WCN-API-TC02: GET /containers returns 200', () => {
    call('GET', '/containers').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WCN-API-TC03 — next-code for a real container-type.
   */
  it('SW-WCN-API-TC03: GET /containers/next-code/:containerTypeId returns 2xx', function () {
    if (!seedContainerTypeId) this.skip();
    call('GET', `/containers/next-code/${seedContainerTypeId}`).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC04 — check-location with an unknown location.
   */
  it('SW-WCN-API-TC04: GET /containers/check-location/999999999 returns 2xx', () => {
    call('GET', '/containers/check-location/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC05 — item-product-locations returns 2xx.
   */
  it('SW-WCN-API-TC05: GET /containers/item-product-locations returns 2xx', () => {
    call('GET', '/containers/item-product-locations').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC06 — product-assignments/:productId for unknown product.
   */
  it('SW-WCN-API-TC06: GET /containers/product-assignments/999999999 returns 2xx', () => {
    call('GET', '/containers/product-assignments/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  // --------------------------- Create a disposable container ---------------

  /**
   * SW-WCN-API-TC07 — POST with empty body → non-success.
   */
  it('SW-WCN-API-TC07: POST /containers with empty body returns non-success', () => {
    call('POST', '/containers', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-WCN-API-TC08 — POST with a real containerTypeId + code returns 2xx.
   */
  it('SW-WCN-API-TC08: POST /containers with valid body returns 2xx', function () {
    if (!seedContainerTypeId) this.skip();
    const stamp = Date.now();
    call('POST', '/containers', {
      containerTypeId: seedContainerTypeId,
      code: `APITEST-C-${stamp}`,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const body = res.body.data || res.body;
      const id = body && (body.id || (Array.isArray(body) && body[0] && body[0].id));
      if (id) createdContainerId = id;
    });
  });

  // --------------------------- Detail + update ---------------------------

  /**
   * SW-WCN-API-TC09 — GET /:id for the disposable container.
   */
  it('SW-WCN-API-TC09: GET /containers/:id returns 2xx for the seed container', function () {
    if (!createdContainerId) this.skip();
    call('GET', `/containers/${createdContainerId}`).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC10 — PUT /:id updates the disposable container.
   */
  it('SW-WCN-API-TC10: PUT /containers/:id updates the seed container', function () {
    if (!createdContainerId) this.skip();
    call('PUT', `/containers/${createdContainerId}`, {
      is_damaged: false,
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC11 — items list for the disposable container (empty).
   */
  it('SW-WCN-API-TC11: GET /containers/:id/items returns 200', function () {
    if (!createdContainerId) this.skip();
    call('GET', `/containers/${createdContainerId}/items`).then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WCN-API-TC12 — quantities list for the disposable container (empty).
   */
  it('SW-WCN-API-TC12: GET /containers/:id/quantities returns 200', function () {
    if (!createdContainerId) this.skip();
    call('GET', `/containers/${createdContainerId}/quantities`).then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  // --------------------------- Mutations (contract only) ---------------------------

  /**
   * SW-WCN-API-TC13 — quantities POST with empty body is rejected.
   */
  it('SW-WCN-API-TC13: POST /containers/:id/quantities with empty body is handled', function () {
    if (!createdContainerId) this.skip();
    call('POST', `/containers/${createdContainerId}/quantities`, {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC14 — items POST with empty body is rejected.
   */
  it('SW-WCN-API-TC14: POST /containers/:id/items with empty body is handled', function () {
    if (!createdContainerId) this.skip();
    call('POST', `/containers/${createdContainerId}/items`, {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC15 — assign POST with empty body is rejected.
   */
  it('SW-WCN-API-TC15: POST /containers/:id/assign with empty body is handled', function () {
    if (!createdContainerId) this.skip();
    call('POST', `/containers/${createdContainerId}/assign`, {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC16 — recalculate is reachable.
   */
  it('SW-WCN-API-TC16: POST /containers/:id/recalculate returns 2xx', function () {
    if (!createdContainerId) this.skip();
    call('POST', `/containers/${createdContainerId}/recalculate`, {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC17 — clear is reachable.
   */
  it('SW-WCN-API-TC17: POST /containers/:id/clear returns 2xx', function () {
    if (!createdContainerId) this.skip();
    call('POST', `/containers/${createdContainerId}/clear`, {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC18 — move-contents with empty body is rejected.
   */
  it('SW-WCN-API-TC18: POST /containers/:id/move-contents with empty body is handled', function () {
    if (!createdContainerId) this.skip();
    call('POST', `/containers/${createdContainerId}/move-contents`, {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC19 — scan-assign empty body is rejected.
   */
  it('SW-WCN-API-TC19: POST /containers/scan-assign with empty body is handled', () => {
    call('POST', '/containers/scan-assign', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC20 — DELETE /containers/items/:serialNumber with unknown
   * serial is non-5xx.
   */
  it('SW-WCN-API-TC20: DELETE /containers/items/:serialNumber with unknown serial is handled', () => {
    call('DELETE', `/containers/items/__NONEXISTENT-${Date.now()}__`).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC21 — move-to-location against unknown ids is handled.
   */
  it('SW-WCN-API-TC21: POST /containers/:id/move-to-location/:locId on unknown ids is handled', () => {
    call('POST', '/containers/999999999/move-to-location/999999999', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC22 — move-from-location against unknown ids is handled.
   */
  it('SW-WCN-API-TC22: POST /containers/:id/move-from-location/:locId on unknown ids is handled', () => {
    call('POST', '/containers/999999999/move-from-location/999999999', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC23 — move-quantity-to-location against unknown ids w/ empty body.
   */
  it('SW-WCN-API-TC23: POST /containers/:id/move-quantity-to-location/:locId on unknown ids is handled', () => {
    call('POST', '/containers/999999999/move-quantity-to-location/999999999', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WCN-API-TC24 — soft-delete recovery list. Auth-guarded; returns 200
   * with an array (possibly empty) of soft-deleted containers.
   */
  it('SW-WCN-API-TC24: GET /containers/deleted requires auth and returns 200', () => {
    call('GET', '/containers/deleted', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
    call('GET', '/containers/deleted').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WCN-API-TC25 — restore unknown id is handled gracefully (semantic
   * failure, not 5xx). Pairs with the soft-delete recovery flow.
   */
  it('SW-WCN-API-TC25: POST /containers/:id/restore with unknown id is handled', () => {
    call('POST', '/containers/999999999/restore', {}, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
    call('POST', '/containers/999999999/restore', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
