/**
 * Login API Tests (SW-AUTH-API-TC01..06)
 * =============================================================================
 * Mirrors:  cypress/e2e/00-loginPageTest.cy.js
 * Auth:     Keycloak / IAM
 *
 * REWRITTEN for the Keycloak migration. The legacy identity server
 * (`POST {IDENTITY}/auth/login` + `/auth/refresh`) is retired: the host returns
 * 502 and the Backend route was deleted — only `POST /auth/logout` survives.
 * There is no JSON login endpoint to test any more.
 *
 * Plan: cypress/qa/testPlans/auth/plan.md
 *
 * Scope: what StockWise actually owns. The suite authenticates the one way the
 * product does — the real IAM login — and these tests assert the parts our
 * Backend depends on:
 *
 *   • the token is accepted by a protected StockWise route, and forged/absent
 *     tokens are rejected  (our guard)
 *   • the token carries the identity, roles and organization claim that
 *     KeycloakPublicGuard + TenantInterceptor read  (the realm contract we rely on)
 *   • the public client still refuses the direct-access grant  (security posture)
 *
 * Deliberately NOT covered: that Keycloak's own login flow issues tokens, rejects
 * bad passwords, or honours a refresh grant. That is third-party behaviour, and
 * if it broke, every spec in the suite would fail at `before()` anyway.
 * Credential-rejection at the UI level is covered by
 * cypress/e2e/Roles/RolePrivileges-Login.cy.js (SW-ROLE-LGN-TC11).
 */


describe('Login API (Keycloak / IAM)', () => {
  let apiBaseUrl;
  let realmBase; // {idpOrigin}/realms/{realm}/protocol/openid-connect
  let clientId;
  let token;
  let admin; // { username, password } for the active tenant

  /** Decode a JWT payload without verifying the signature. */
  const decodeJwt = (jwt) => {
    const part = jwt.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  };

  before(() => {
    apiBaseUrl = Cypress.env('API_BASE_URL');
    cy.keycloakConfig().then((cfg) => {
      realmBase = `${cfg.idpOrigin}/realms/${cfg.realm}/protocol/openid-connect`;
      clientId = cfg.clientId;
    });
    cy.credentials('admin').then((c) => {
      admin = c;
    });
    cy.login().then((t) => {
      token = t;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // The token the suite actually runs on
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Technique: Use Case — smoke: the one auth path the whole suite depends on.
   * SW-AUTH-API-TC01 — The login produces a usable JWT. Smoke test for the one
   * auth path the whole suite depends on: if this fails, every other spec's
   * before() hook is about to fail for the same reason.
   */
  it('SW-AUTH-API-TC01: the IAM login yields a JWT access token', { tags: ['@smoke'] }, () => {
    expect(token, 'access token').to.be.a('string').and.not.empty;
    expect(token.split('.'), 'token is a three-part JWT').to.have.length(3);
    const claims = decodeJwt(token);
    expect(claims.exp, 'expiry claim').to.be.a('number');
    expect(claims.exp * 1000, 'token is not already expired').to.be.greaterThan(Date.now());
  });

  /**
   * Technique: Decision Table — identity + role claims the Backend authorises on.
   * SW-AUTH-API-TC02 — The token identifies the authenticated user and carries
   * realm roles. Replaces the old `role=admin` response-body assertion — roles
   * live in the JWT claims now, which is what the Backend reads.
   * UI mirror: SW-AUTH-TC07 profile panel shows the role.
   */
  it('SW-AUTH-API-TC02: access token carries the expected username and realm roles', { tags: ['@regression'] }, () => {
    const claims = decodeJwt(token);
    expect(String(claims.preferred_username).toLowerCase()).to.equal(
      String(admin.username).toLowerCase(),
    );
    expect(claims.realm_access, 'realm_access claim').to.exist;
    expect(claims.realm_access.roles, 'realm roles').to.be.an('array').and.not.empty;
  });

  /**
   * Technique: Use Case — the org claim TenantInterceptor resolves the tenant from.
   * SW-AUTH-API-TC03 — Multi-tenancy: the token carries the organization claim
   * the Backend's TenantInterceptor resolves the org context from. Without it
   * every request would land in the wrong tenant (or none).
   */
  it('SW-AUTH-API-TC03: access token carries an organization claim for tenant resolution', { tags: ['@regression'] }, () => {
    const claims = decodeJwt(token);
    expect(claims.organization, 'organization claim').to.be.an('object');
    expect(Object.keys(claims.organization), 'at least one org').to.have.length.greaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // StockWise's own guard
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Technique: Use Case — the token is accepted by a protected route, not merely well-formed.
   * SW-AUTH-API-TC04 — The token is actually accepted by StockWise, not merely
   * well-formed. UI mirror: successful dashboard load after login.
   */
  it('SW-AUTH-API-TC04: access token is accepted by a protected StockWise endpoint', { tags: ['@smoke'] }, () => {
    cy.request({
      method: 'GET',
      url: `${apiBaseUrl}/products/searchable-fields`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  /**
   * Technique: Error Guessing — forged and absent bearer tokens must both be rejected.
   * SW-AUTH-API-TC05 — A protected endpoint rejects a forged bearer token, and
   * rejects an absent one. Guards against the guard being removed or weakened.
   */
  it('SW-AUTH-API-TC05: protected endpoint rejects forged and absent bearer tokens', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${apiBaseUrl}/products/searchable-fields`,
      headers: { Authorization: 'Bearer not-a-real-token' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'forged token').to.equal(401);
    });

    cy.request({
      method: 'GET',
      url: `${apiBaseUrl}/products/searchable-fields`,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'no Authorization header').to.equal(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Client security posture
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Technique: Error Guessing — a misconfigured client would allow credential-for-token exchange.
   * SW-AUTH-API-TC06 — Contract guard. `stockwise-app` is a PUBLIC client and
   * MUST NOT accept the direct-access (password) grant; if this ever starts
   * succeeding, credentials could be exchanged for tokens outside the
   * authorization-code flow.
   */
  it('SW-AUTH-API-TC06: direct access grant is disabled for the public client', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'POST',
      url: `${realmBase}/token`,
      form: true,
      body: {
        grant_type: 'password',
        client_id: clientId,
        username: admin.username,
        password: admin.password,
        scope: 'openid',
      },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'direct grant must be refused').to.be.within(400, 499);
      expect(res.body?.error).to.equal('unauthorized_client');
    });
  });

  // UI-only (not asserted here):
  //   - Sign-in page heading / "Login with IAM Identity" button caption.
  //   - Realm form field labels and show/hide password toggle.
  //   - Profile panel role display and Logout redirect.
});
