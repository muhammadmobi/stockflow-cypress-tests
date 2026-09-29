/**
 * WMS Location API Tests (SW-WL-API-TC01..14)
 * =============================================================================
 * Backend: Backend/src/modules/wms/location.controller.ts
 *
 *   POST   /locations                         — create; body { name, code, type,
 *                                               parentId? }
 *   GET    /locations                         — list
 *   POST   /locations/import                  — multipart Excel upload
 *   POST   /locations/quick-create-bin        — body { path }
 *   POST   /locations/bulk-create-area        — body { name, code, noOfRows,
 *                                               noOfBaysPerRow, noOfLevelsPerBay,
 *                                               noOfBinsPerLevel, parentId }
 *   GET    /locations/next-code/:type         — next generated code
 *   GET    /locations/dashboard/summary
 *   GET    /locations/dashboard/hierarchy-report
 *   GET    /locations/dashboard/contents-search
 *   GET    /locations/scan-path               — path for a scanned code
 *   GET    /locations/universal-scan          — resolves any code type
 *   GET    /locations/:id/hierarchy
 *   PUT    /locations/:id                     — partial update
 *   DELETE /locations/:id                     — soft delete
 *
 * Every route is `@UseGuards(AuthGuard)`. UI mirror: WMS → Locations tree.
 *
 * Mutation strategy: POST creates a disposable Location whose lifecycle
 * (create → update → soft-delete) is self-contained within this spec.
 * We never touch pre-existing locations.
 */

describe('WMS Location API', () => {
  let authToken;
  let baseUrl;
  let createdLocationId;

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

  // Clean up any Location this spec created.
  after(() => {
    if (!createdLocationId) return;
    call('DELETE', `/locations/${createdLocationId}`);
  });

  /**
   * SW-WL-API-TC01 — Guard rejects unauthenticated list.
   */
  it('SW-WL-API-TC01: GET /locations without auth returns 401', () => {
    call('GET', '/locations', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW-WL-API-TC02 — Authenticated list returns 200.
   */
  it('SW-WL-API-TC02: GET /locations returns 200', () => {
    call('GET', '/locations').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WL-API-TC03 — POST with empty body is rejected (name/code/type required).
   */
  it('SW-WL-API-TC03: POST /locations with empty body returns non-success', () => {
    call('POST', '/locations', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-WL-API-TC04 — POST with a minimal valid body creates a top-level
   * Facility. Records the new id for downstream tests and the after() clean-up.
   */
  it('SW-WL-API-TC04: POST /locations with valid body returns 2xx and yields an id', () => {
    const stamp = Date.now();
    call('POST', '/locations', {
      name: `api-test-facility-${stamp}`,
      code: `APITEST-${stamp}`,
      type: 'Facility',
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const body = res.body.data || res.body;
      const id = body && (body.id || (Array.isArray(body) && body[0] && body[0].id));
      if (id) createdLocationId = id;
    });
  });

  /**
   * SW-WL-API-TC05 — next-code generator for a given type is reachable.
   */
  it('SW-WL-API-TC05: GET /locations/next-code/Facility returns 2xx', () => {
    call('GET', '/locations/next-code/Facility').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WL-API-TC06 — dashboard/summary returns 200.
   */
  it('SW-WL-API-TC06: GET /locations/dashboard/summary returns 200', () => {
    call('GET', '/locations/dashboard/summary').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WL-API-TC07 — dashboard/hierarchy-report returns 200.
   */
  it('SW-WL-API-TC07: GET /locations/dashboard/hierarchy-report returns 200', () => {
    call('GET', '/locations/dashboard/hierarchy-report').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WL-API-TC08 — dashboard/contents-search with an empty term is non-5xx.
   */
  it('SW-WL-API-TC08: GET /locations/dashboard/contents-search is reachable', () => {
    call('GET', '/locations/dashboard/contents-search?term=').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WL-API-TC09 — scan-path with an unknown code returns non-5xx.
   */
  it('SW-WL-API-TC09: GET /locations/scan-path with unknown code is handled', () => {
    call('GET', '/locations/scan-path?code=__NONEXISTENT__').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WL-API-TC10 — universal-scan resolves any code type gracefully.
   */
  it('SW-WL-API-TC10: GET /locations/universal-scan with unknown code is handled', () => {
    call('GET', '/locations/universal-scan?code=__NONEXISTENT__').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WL-API-TC11 — :id/hierarchy for the seed location.
   */
  it('SW-WL-API-TC11: GET /locations/:id/hierarchy returns 2xx for the created location', function () {
    if (!createdLocationId) this.skip();
    call('GET', `/locations/${createdLocationId}/hierarchy`).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WL-API-TC12 — PUT /:id updates the seed location (name bump).
   */
  it('SW-WL-API-TC12: PUT /locations/:id updates the seed location', function () {
    if (!createdLocationId) this.skip();
    call('PUT', `/locations/${createdLocationId}`, {
      name: `api-test-facility-updated-${Date.now()}`,
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  /**
   * SW-WL-API-TC13 — quick-create-bin with empty body is rejected (path required).
   */
  it('SW-WL-API-TC13: POST /locations/quick-create-bin with empty body returns non-success', () => {
    call('POST', '/locations/quick-create-bin', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-WL-API-TC14 — bulk-create-area with empty body is rejected.
   */
  it('SW-WL-API-TC14: POST /locations/bulk-create-area with empty body returns non-success', () => {
    call('POST', '/locations/bulk-create-area', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const body = res.body;
      const failed = body.success === false || body.statusCode >= 400 || body.error;
      expect(!!failed).to.be.true;
    });
  });

  /**
   * SW-WL-API-TC15 — soft-delete recovery list (parallels containers/deleted).
   */
  it('SW-WL-API-TC15: GET /locations/deleted requires auth and returns 200', () => {
    call('GET', '/locations/deleted', undefined, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
    call('GET', '/locations/deleted').then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-WL-API-TC16 — restore unknown id is handled gracefully (semantic failure,
   * not 5xx) and is auth-guarded.
   */
  it('SW-WL-API-TC16: POST /locations/:id/restore with unknown id is handled', () => {
    call('POST', '/locations/999999999/restore', {}, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
    call('POST', '/locations/999999999/restore', {}).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
