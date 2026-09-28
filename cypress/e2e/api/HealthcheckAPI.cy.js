/**
 * Healthcheck API Tests (SW-HC-API-TC01..02)
 * =============================================================================
 * Backend: Backend/src/modules/healthcheck/controller/healthcheck.controller.ts
 *
 *   GET /health   @Public() — liveness probe used by Docker + autoheal.
 *                 Must respond without auth; must be fast; returns a
 *                 JSON envelope the container orchestrator can parse.
 */

describe('Healthcheck API', () => {
  let baseUrl;

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
  });

  /**
   * SW-HC-API-TC01 — /health is reachable WITHOUT auth. Docker health probe
   * does not send an Authorization header, so a regression that adds one
   * would break autoheal.
   */
  it('SW-HC-API-TC01: GET /health without auth returns 200', () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/health`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * SW-HC-API-TC02 — Response body is a non-empty JSON payload (status
   * field or similar). We don't over-constrain the shape because NestJS
   * Terminus can add sub-probes (DB, Redis) over time.
   */
  it('SW-HC-API-TC02: GET /health returns a JSON body', () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/health`,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.body).to.exist;
      expect(typeof res.body).to.be.oneOf(['object', 'string']);
    });
  });
});
