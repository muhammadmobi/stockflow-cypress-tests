/**
 * Auth & Security API
 * -------------------
 * Endpoints:
 *   POST /auth/login            (identity server) - issues a Bearer JWT
 *   GET  /categories            (API server)      - representative protected route
 *
 * Purpose: guard the authentication contract - valid credentials issue a token,
 * bad credentials are rejected, and protected routes refuse missing / malformed
 * tokens. No resources are created, so there is nothing to clean up.
 *
 * All request data is generated at runtime (faker) - no real accounts are hardcoded.
 */

import { faker } from '@faker-js/faker';

describe('Auth & Security API', () => {
  let baseUrl;
  let identityUrl;

  const login = (username, password) =>
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: { username, password },
      failOnStatusCode: false,
    });

  // A protected GET used to probe token handling.
  const protectedGet = (headers = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/categories`,
      qs: { page: 1, page_size: 1 },
      headers,
      failOnStatusCode: false,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');
  });

  it('SW_AUTH_API_001 - valid credentials return a Bearer token @smoke', () => {
    login(Cypress.env('email'), Cypress.env('pass')).then((res) => {
      expect(res.status).to.equal(200);
      const token = res.body.accessToken || res.body.token;
      expect(token, 'access token').to.be.a('string').and.not.be.empty;
    });
  });

  it('SW_AUTH_API_002 - wrong password is rejected', () => {
    login(Cypress.env('email'), faker.internet.password({ length: 12 })).then((res) => {
      expect(res.status).to.be.oneOf([400, 401]);
    });
  });

  it('SW_AUTH_API_003 - unknown username is rejected', () => {
    login(faker.internet.username(), faker.internet.password({ length: 12 })).then((res) => {
      expect(res.status).to.be.oneOf([400, 401]);
    });
  });

  it('SW_AUTH_API_004 - login with an empty body is rejected', () => {
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: {},
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 401]);
    });
  });

  it('SW_AUTH_API_005 - protected route without a token returns 401', () => {
    protectedGet().then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  it('SW_AUTH_API_006 - protected route with a malformed token returns 401', () => {
    protectedGet({ Authorization: `Bearer ${faker.string.alphanumeric(40)}` }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  it('SW_AUTH_API_007 - protected route with a valid token succeeds @smoke', () => {
    login(Cypress.env('email'), Cypress.env('pass')).then((res) => {
      const token = res.body.accessToken || res.body.token;
      protectedGet({ Authorization: `Bearer ${token}` }).then((getRes) => {
        expect(getRes.status).to.equal(200);
      });
    });
  });

  it('SW_AUTH_API_008 - "Bearer" prefix without a token value is rejected', () => {
    protectedGet({ Authorization: 'Bearer ' }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });
});
