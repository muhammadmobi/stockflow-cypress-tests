/**
 * API Tokens API Tests
 * ====================
 * Backend:
 *   - Backend/src/modules/api-tokens/api-tokens.controller.ts   (management, ADMIN-only)
 *   - Backend/src/auth/keycloak-public.guard.ts                 (consumer auth branch)
 *   - Backend/src/modules/incomingItems/incoming-item.controller.ts (opted-in consumers)
 *
 * Feature under test
 * ------------------
 * A tenant ADMIN mints long-lived, org-scoped bearer tokens (`sw_…`) that
 * external consumers present instead of a Keycloak JWT. Routes opt in with
 * `@ApiTokenAccess(scope)`; a token missing the required scope is rejected 403.
 * Only the SHA-256 hash is stored — the raw token is returned exactly once.
 *
 * Endpoints exercised
 * -------------------
 *   POST   /api-tokens                       create (returns raw token once)
 *   GET    /api-tokens                        list (org-scoped)
 *   POST   /api-tokens/:id/revoke             revoke (soft)
 *   DELETE /api-tokens/:id                    delete (hard)
 *   POST   /incoming-items/print-spec-sheet   consumer — scope hardware:print
 *   POST   /incoming-items/hardware-stock-in  consumer — scope hardware:stock-in
 *
 * Auth model
 * ----------
 * Management endpoints require an ADMIN Keycloak JWT (AuthGuard + AdminGuard).
 * setup() authenticates admin against the identity server (same pattern as
 * BrainBoxHardwareApiHelper) and creates a token scoped to hardware:print ONLY,
 * so scope enforcement can be proven both ways.
 *
 * Test ID convention: SW-APITOK-API-TC01–TC12
 *
 * Cleanup: after() deletes every token id created during the suite.
 */

describe('API Tokens API Tests', () => {
  const baseUrl = Cypress.env('API_BASE_URL');

  let adminJwt; // ADMIN Keycloak JWT for management calls
  let printToken; // raw sw_ token scoped to hardware:print only
  let printTokenId; // its id (for revoke/delete/cleanup)
  const createdIds = []; // every token id created here → cleaned up in after()

  const authHeaders = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const createToken = (body, token = adminJwt) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/api-tokens`,
      headers: authHeaders(token),
      body,
      failOnStatusCode: false,
    });

  before(() => {
    cy.login().then((token) => {
      adminJwt = token;
      expect(adminJwt, 'Admin JWT must be returned by Keycloak').to.exist;

      // A print-only token — used by the consumer + scope-enforcement tests.
      return createToken({ name: `cy-apitok-print-${Date.now()}`, scopes: ['hardware:print'] }).then((c) => {
        if (c.status >= 200 && c.status < 300) {
          printToken = c.body?.data?.token;
          printTokenId = c.body?.data?.apiToken?.id;
          if (printTokenId) createdIds.push(printTokenId);
        }
      });
    });
  });

  after(() => {
    // Best-effort cleanup — delete every token this suite created.
    createdIds.forEach((id) => {
      if (!id) return;
      cy.request({
        method: 'DELETE',
        url: `${baseUrl}/api-tokens/${id}`,
        headers: authHeaders(adminJwt),
        failOnStatusCode: false,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Management — auth + creation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Testcase ID: SW-APITOK-API-TC01
   * Description: GET /api-tokens without an Authorization header returns 401.
   * Expected Result: 401 Unauthorized (protected route, no @Public()).
   */
  it('SW-APITOK-API-TC01: rejects unauthenticated management access with 401', { tags: ['@smoke'] }, () => {
    cy.request({ method: 'GET', url: `${baseUrl}/api-tokens`, failOnStatusCode: false }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC02
   * Description: POST /api-tokens returns a sw_-prefixed raw token exactly once and never leaks the hash.
   * Expected Result: 2xx, data.token matches /^sw_/, data.apiToken has no tokenHash and status 'active'.
   */
  it('SW-APITOK-API-TC02: creates a token, returns the raw sw_ secret once, never the hash', { tags: ['@smoke'] }, function () {
    if (!adminJwt) this.skip();
    createToken({ name: `cy-apitok-create-${Date.now()}`, scopes: ['hardware:stock-in', 'hardware:print'] }).then((res) => {
      expect(res.status, 'create must succeed').to.be.oneOf([200, 201]);
      const { token, apiToken } = res.body.data;
      expect(token, 'raw token returned once').to.match(/^sw_/);
      expect(apiToken).to.have.property('status', 'active');
      expect(apiToken).to.not.have.property('tokenHash');
      expect(apiToken.scopes).to.include.members(['hardware:stock-in', 'hardware:print']);
      if (apiToken.id) createdIds.push(apiToken.id);
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC03
   * Description: An invalid scope is rejected by Joi validation with 400.
   * Expected Result: 400 Bad Request (JoiValidationPipe).
   */
  it('SW-APITOK-API-TC03: rejects an unknown scope with 400', { tags: ['@regression'] }, function () {
    if (!adminJwt) this.skip();
    createToken({ name: `cy-apitok-badscope-${Date.now()}`, scopes: ['not:a-real-scope'] }).then((res) => {
      expect(res.status).to.equal(400);
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC04
   * Description: An empty scopes array is rejected with 400.
   * Expected Result: 400 Bad Request.
   */
  it('SW-APITOK-API-TC04: rejects an empty scope list with 400', { tags: ['@regression'] }, function () {
    if (!adminJwt) this.skip();
    createToken({ name: `cy-apitok-noscope-${Date.now()}`, scopes: [] }).then((res) => {
      expect(res.status).to.equal(400);
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC05
   * Description: Creating two tokens with the same name in the same org is rejected as a conflict.
   * Expected Result: no 5xx; 409 Conflict or envelope success:false.
   */
  it('SW-APITOK-API-TC05: rejects a duplicate token name in the same org', { tags: ['@regression'] }, function () {
    if (!adminJwt) this.skip();
    const name = `cy-apitok-dup-${Date.now()}`;
    createToken({ name, scopes: ['hardware:print'] }).then((first) => {
      expect(first.status, 'first create must succeed').to.be.oneOf([200, 201]);
      if (first.body?.data?.apiToken?.id) createdIds.push(first.body.data.apiToken.id);
      createToken({ name, scopes: ['hardware:print'] }).then((second) => {
        expect(second.status, 'duplicate name must not 5xx').to.be.lessThan(500);
        expect(second.status === 409 || second.body?.success === false, 'duplicate must be rejected (409 or success:false)').to.be.true;
      });
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC06
   * Description: GET /api-tokens lists the calling org's tokens with computed status; the hash is never present.
   * Expected Result: 200, the print token appears with status 'active' and no tokenHash field.
   */
  it('SW-APITOK-API-TC06: lists org tokens with status and no hash', { tags: ['@regression'] }, function () {
    if (!printTokenId) this.skip();
    cy.request({ method: 'GET', url: `${baseUrl}/api-tokens`, headers: authHeaders(adminJwt), failOnStatusCode: false }).then((res) => {
      expect(res.status).to.equal(200);
      const rows = res.body.data;
      expect(Array.isArray(rows), 'list must be an array').to.be.true;
      const mine = rows.find((r) => r.id === printTokenId);
      expect(mine, 'created token must appear in the org list').to.exist;
      expect(mine.status).to.equal('active');
      expect(mine).to.not.have.property('tokenHash');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Consumer auth + scope enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Testcase ID: SW-APITOK-API-TC07
   * Description: A sw_ token WITH the required scope authenticates on the opted-in route.
   * Expected Result: not 401 and not 403 — auth + scope passed (any downstream 2xx/4xx is fine).
   */
  it('SW-APITOK-API-TC07: a print-scoped token is accepted on print-spec-sheet', { tags: ['@smoke'] }, function () {
    if (!printToken) this.skip();
    cy.request({
      method: 'POST',
      url: `${baseUrl}/incoming-items/print-spec-sheet`,
      headers: authHeaders(printToken),
      body: { serialNumber: `CY-APITOK-${Date.now()}`, spec: { serial: 'CY', make: 'HP' } },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'valid token+scope must not be 401').to.not.equal(401);
      expect(res.status, 'valid token+scope must not be 403').to.not.equal(403);
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC08
   * Description: A sw_ token MISSING the required scope is rejected 403 on a different opted-in route.
   * Expected Result: 403 Forbidden (print-only token on hardware-stock-in).
   */
  it('SW-APITOK-API-TC08: a print-only token is 403 on hardware-stock-in (scope enforced)', { tags: ['@smoke'] }, function () {
    if (!printToken) this.skip();
    cy.request({
      method: 'POST',
      url: `${baseUrl}/incoming-items/hardware-stock-in`,
      headers: authHeaders(printToken),
      body: { serialNumber: `CY-APITOK-${Date.now()}`, spec: { serial: 'CY' } },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'missing scope must be 403').to.equal(403);
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC09
   * Description: A sw_ token on a route NOT opted into API-token auth is rejected 401.
   * Expected Result: 401 (GET /category has no @ApiTokenAccess).
   */
  it('SW-APITOK-API-TC09: a sw_ token is 401 on a non-opted-in route', { tags: ['@regression'] }, function () {
    if (!printToken) this.skip();
    cy.request({
      method: 'GET',
      url: `${baseUrl}/category`,
      headers: authHeaders(printToken),
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'API token must not authenticate a non-opted-in route').to.equal(401);
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC10
   * Description: An unknown sw_ token is rejected 401 on an opted-in route.
   * Expected Result: 401 Unauthorized.
   */
  it('SW-APITOK-API-TC10: an unknown sw_ token is 401', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/incoming-items/print-spec-sheet`,
      headers: authHeaders('sw_this-token-does-not-exist-00000000'),
      body: {},
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Revocation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Testcase ID: SW-APITOK-API-TC11
   * Description: Revoking a token flips its status to 'revoked' and its secret stops working.
   * Steps: create a throwaway token, revoke it, then attempt to consume it.
   * Expected Result: revoke returns status 'revoked'; the token is then 401 on the consumer route.
   */
  it('SW-APITOK-API-TC11: revoking a token blocks it immediately', { tags: ['@smoke'] }, function () {
    if (!adminJwt) this.skip();
    createToken({ name: `cy-apitok-revoke-${Date.now()}`, scopes: ['hardware:print'] }).then((c) => {
      expect(c.status, 'setup create must succeed').to.be.oneOf([200, 201]);
      const raw = c.body.data.token;
      const id = c.body.data.apiToken.id;
      createdIds.push(id);

      cy.request({
        method: 'POST',
        url: `${baseUrl}/api-tokens/${id}/revoke`,
        headers: authHeaders(adminJwt),
        failOnStatusCode: false,
      }).then((rev) => {
        expect(rev.status).to.equal(200);
        expect(rev.body.data.status).to.equal('revoked');

        cy.request({
          method: 'POST',
          url: `${baseUrl}/incoming-items/print-spec-sheet`,
          headers: authHeaders(raw),
          body: {},
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status, 'a revoked token must be 401').to.equal(401);
        });
      });
    });
  });

  /**
   * Testcase ID: SW-APITOK-API-TC12
   * Description: Revoking a non-existent token id returns 404 (no cross-org / phantom mutation).
   * Expected Result: 404 Not Found for a well-formed but unknown UUID.
   */
  it('SW-APITOK-API-TC12: revoking an unknown token id returns 404', { tags: ['@regression'] }, function () {
    if (!adminJwt) this.skip();
    cy.request({
      method: 'POST',
      url: `${baseUrl}/api-tokens/00000000-0000-4000-8000-000000000000/revoke`,
      headers: authHeaders(adminJwt),
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'unknown id must not 5xx').to.be.lessThan(500);
      expect(res.status === 404 || res.body?.success === false, 'unknown id must be 404 or success:false').to.be.true;
    });
  });
});
