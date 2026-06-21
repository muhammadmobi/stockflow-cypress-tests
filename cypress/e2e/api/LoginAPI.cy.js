/**
 * Login API Tests (SW-AUTH-API-TC01..10)
 * =============================================================================
 * Mirrors:  cypress/e2e/00-loginPageTest.cy.js
 * Backend:  Identity server —
 *   POST {IDENTITY_SERVER_BASE_URL}/auth/login
 *   POST {IDENTITY_SERVER_BASE_URL}/auth/refresh   (exchange refreshToken → accessToken)
 *
 * Endpoint behaviour (verified against QA):
 *   200 — { accessToken, refreshToken, name, username, role }
 *   401 — { message: "Invalid credentials", error: "Unauthorized", statusCode: 401 }
 *   400 — missing required fields (validated by the identity service)
 *
 * Scope: pure authentication API. UI-only cases (page heading, field labels,
 * Sign-in button text, inline "required" errors, show/hide password toggle,
 * profile panel role display, logout redirect) are covered in the UI suite.
 *
 * Per-case flow:
 *   1. POST /auth/login with the payload under test.
 *   2. Assert status + body shape.
 *   3. For successful admin/worker logins, assert tokens, username, role.
 *   4. Optionally exchange the access token against a protected StockWise API
 *      to verify the token is actually usable (smoke proof).
 */

describe('Login API', () => {
  let userData;
  let identityUrl;
  let apiBaseUrl;

  const loginRequest = (body, headersOverride) =>
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      headers: headersOverride || { 'Content-Type': 'application/json' },
      body,
      failOnStatusCode: false,
    });

  before(() => {
    identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');
    apiBaseUrl = Cypress.env('API_BASE_URL');
    cy.fixture('users').then((data) => {
      userData = data;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Positive login flows
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-AUTH-API-TC01 — Admin login returns 200 with access + refresh tokens.
   * UI mirror: SW-AUTH-TC11 successful admin login.
   */
  it('SW-AUTH-API-TC01: POST /auth/login with admin credentials returns 200 and tokens', () => {
    loginRequest({ username: userData.admin.email, password: userData.admin.password }).then((res) => {
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('accessToken').that.is.a('string').and.not.empty;
      expect(res.body).to.have.property('refreshToken').that.is.a('string').and.not.empty;
      expect(res.body).to.have.property('username', userData.admin.email);
    });
  });

  /**
   * SW-AUTH-API-TC02 — Admin token carries role=admin.
   * UI mirror: SW-AUTH-TC12 profile panel shows Admin role.
   */
  it('SW-AUTH-API-TC02: Admin login response exposes role=admin', () => {
    loginRequest({ username: userData.admin.email, password: userData.admin.password }).then((res) => {
      expect(res.status).to.equal(200);
      expect(String(res.body.role).toLowerCase()).to.equal('admin');
    });
  });

  /**
   * SW-AUTH-API-TC03 — Worker login returns 200 and role=user/admin (role label
   * varies per environment — we assert it is NOT empty).
   * UI mirror: SW-AUTH-TC14 successful user login.
   */
  it('SW-AUTH-API-TC03: POST /auth/login with worker credentials returns 200 and tokens', () => {
    loginRequest({ username: userData.worker.email, password: userData.worker.password }).then((res) => {
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('accessToken').that.is.a('string').and.not.empty;
      expect(res.body).to.have.property('refreshToken').that.is.a('string').and.not.empty;
      expect(res.body).to.have.property('role').that.is.a('string').and.not.empty;
    });
  });

  /**
   * SW-AUTH-API-TC04 — Admin access token is actually accepted by StockWise
   * API. Exchanges the token against a lightweight protected endpoint to
   * prove the token is usable, not just well-formed.
   * UI mirror: successful dashboard load after login (SW-AUTH-TC11).
   */
  it('SW-AUTH-API-TC04: Admin access token is accepted by a protected StockWise endpoint', () => {
    loginRequest({ username: userData.admin.email, password: userData.admin.password }).then((res) => {
      const token = res.body.accessToken;
      expect(token).to.exist;
      cy.request({
        method: 'GET',
        url: `${apiBaseUrl}/products/searchable-fields`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      }).then((protectedRes) => {
        expect(protectedRes.status).to.equal(200);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Negative login flows
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-AUTH-API-TC05 — Invalid email (valid password) → 401.
   * UI mirror: SW-AUTH-TC07 invalid email credentials toast.
   */
  it('SW-AUTH-API-TC05: POST /auth/login with unknown username returns 401', () => {
    loginRequest({ username: userData.invalid.email, password: userData.admin.password }).then((res) => {
      expect(res.status).to.equal(401);
      expect(String(res.body.message || '').toLowerCase()).to.contain('invalid');
    });
  });

  /**
   * SW-AUTH-API-TC06 — Valid email, wrong password → 401.
   * UI mirror: SW-AUTH-TC08 invalid password toast.
   */
  it('SW-AUTH-API-TC06: POST /auth/login with wrong password returns 401', () => {
    loginRequest({ username: userData.admin.email, password: userData.invalid.password }).then((res) => {
      expect(res.status).to.equal(401);
      expect(String(res.body.message || '').toLowerCase()).to.contain('invalid');
    });
  });

  /**
   * SW-AUTH-API-TC07 — Missing password is rejected (4xx).
   * UI mirror: SW-AUTH-TC06 "password required" inline error.
   */
  it('SW-AUTH-API-TC07: POST /auth/login with missing password returns 4xx', () => {
    loginRequest({ username: userData.admin.email }).then((res) => {
      expect(res.status).to.be.oneOf([400, 401, 422]);
    });
  });

  /**
   * SW-AUTH-API-TC08 — Missing username is rejected (4xx).
   * UI mirror: SW-AUTH-TC05 "email required" inline error.
   */
  it('SW-AUTH-API-TC08: POST /auth/login with missing username returns 4xx', () => {
    loginRequest({ password: userData.admin.password }).then((res) => {
      expect(res.status).to.be.oneOf([400, 401, 422]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Refresh-token flow (apiService.ts uses POST /auth/refresh to swap an
  // expired access token for a fresh one without bouncing the user back to
  // the login screen).
  // ──────────────────────────────────────────────────────────────────────────

  const refreshRequest = (body) =>
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/refresh`,
      headers: { 'Content-Type': 'application/json' },
      body,
      failOnStatusCode: false,
    });

  /**
   * SW-AUTH-API-TC09 — Happy path. Login, then exchange the refreshToken
   * for a new accessToken via POST /auth/refresh.
   */
  it('SW-AUTH-API-TC09: POST /auth/refresh with a valid refreshToken returns a new accessToken', () => {
    loginRequest({ username: userData.admin.email, password: userData.admin.password }).then((res) => {
      expect(res.status).to.equal(200);
      const refreshToken = res.body.refreshToken;
      expect(refreshToken).to.be.a('string').and.not.empty;
      refreshRequest({ refreshToken }).then((refreshRes) => {
        expect(refreshRes.status).to.be.oneOf([200, 201]);
        const newAccess = refreshRes.body.accessToken || refreshRes.body.token;
        expect(newAccess).to.be.a('string').and.not.empty;
      });
    });
  });

  /**
   * SW-AUTH-API-TC10 — Negative. An invalid / forged refreshToken is
   * rejected (4xx, never a 5xx).
   */
  it('SW-AUTH-API-TC10: POST /auth/refresh with an invalid refreshToken is rejected', () => {
    refreshRequest({ refreshToken: 'not-a-real-token' }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      expect(res.status).to.not.equal(200);
    });
  });

  // UI-only (not asserted here):
  //   - Page heading / field labels / Sign In button caption.
  //   - Show/hide password eye-icon toggle.
  //   - Profile panel role display and Logout redirect to /auth/jwt/sign-in.
});
