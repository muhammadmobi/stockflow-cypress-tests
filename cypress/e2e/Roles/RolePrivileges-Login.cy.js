/**
 * RolePrivileges-Login.cy.js — Login, Redirect & Session State (13 TCs)
 * =========================================================================
 * Plan:    cypress/qa/testPlans/roles/plan.md §8.1
 * Feature: Role-based login redirect, profile role labels, logout, session expiry
 *
 * ISTQB techniques applied:
 *   EP:               Three role partitions (Admin / User / Sales) — one login per partition
 *   State Transition: Unauthenticated ↔ Authenticated ↔ Unauthenticated (valid transitions)
 *                     Authenticated → Expired → Protected route (invalid transition — TC13)
 *   BVA:              Empty form = zero-length input (lower boundary) — TC12
 *   Error Guessing:   Wrong credentials, role-escalation mismatch (TC08), session expiry (TC13)
 *   Use Case:         Happy-path login + profile + logout per role (TC01–TC10)
 */

import LoginPage from '../../pageObjects/loginPage';
import RolePrivilegesPage from '../../pageObjects/Roles/RolePrivilegesPage';
import roleData from '../../fixtures/Roles/rolePrivilegesData.json';
import loginLocators from '../../support/locators/loginLocators';

describe('SW-ROLE-LGN — Login, Redirect & Session State', { tags: ['@regression'] }, () => {
  const loginPage = new LoginPage();
  const page = new RolePrivilegesPage();

  // Credentials come from the one place (cypress/fixtures/users.json, via
  // cy.credentials) rather than being read out of the fixture here.
  let admin;
  let worker;
  let sales;

  before(() => {
    cy.credentials('admin').then((c) => { admin = c; });
    cy.credentials('user').then((c) => { worker = c; });
    cy.credentials('sales').then((c) => { sales = c; });
  });

  // No pre-visit: the sign-in route hands off to the realm on its own now, and
  // cy.login() (via loginPage.login) visits the app itself. Landing on sign-in
  // here first would only start a hand-off the test then abandons.

  afterEach(() => {
    cy.clearLocalStorage();
    cy.clearCookies();
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  // EP — Admin partition: valid admin credentials → /dashboard
  it('SW-ROLE-LGN-TC01: Admin login redirects to /dashboard', { tags: ['@smoke'] }, () => {
    loginPage.login(admin.username, admin.password);
    cy.url().should('include', roleData.postLoginUrls.epAdminPartition);
  });

  // Use Case — admin profile panel displays "admin" role label
  it('SW-ROLE-LGN-TC02: Admin profile panel shows "admin" role label', () => {
    loginPage.login(admin.username, admin.password);
    cy.url().should('include', roleData.postLoginUrls.epAdminPartition);
    page.clickProfileIcon();
    page.assertProfileRole(roleData.profileRoles.admin);
  });

  // State Transition — Admin-Auth → Unauthenticated (valid transition via logout)
  it('SW-ROLE-LGN-TC03: Admin logout redirects to sign-in page', () => {
    loginPage.login(admin.username, admin.password);
    cy.url().should('include', roleData.postLoginUrls.epAdminPartition);
    page.clickProfileIcon();
    page.clickLogout();
    // Logout lands on the sign-in route, which hands off to the realm on its
    // own — assert "signed out" rather than racing that redirect.
    cy.expectSignedOut();
  });

  // ── User ───────────────────────────────────────────────────────────────────

  // EP — User partition: user credentials → /MobileViewScreen
  it('SW-ROLE-LGN-TC04: User login redirects to /MobileViewScreen', { tags: ['@smoke'] }, () => {
    cy.then(() => {
      loginPage.login(worker.username, worker.password);
      cy.url().should('include', roleData.postLoginUrls.epUserPartition);
    });
  });

  // Use Case — user profile panel displays "User" role label
  it('SW-ROLE-LGN-TC05: User profile panel shows "User" role label', () => {
    cy.then(() => {
      loginPage.login(worker.username, worker.password);
      cy.url().should('include', roleData.postLoginUrls.epUserPartition);
      page.clickProfileIcon();
      page.assertProfileRole(roleData.profileRoles.user);
    });
  });

  // State Transition — User-Auth → Unauthenticated (valid)
  it('SW-ROLE-LGN-TC06: User logout redirects to sign-in page', () => {
    cy.then(() => {
      loginPage.login(worker.username, worker.password);
      cy.url().should('include', roleData.postLoginUrls.epUserPartition);
      page.clickProfileIcon();
      page.clickLogout();
      cy.expectSignedOut();
    });
  });

  // ── Sales ──────────────────────────────────────────────────────────────────

  // EP — Sales partition: sales credentials → /dashboard (NOT /MobileViewScreen)
  it('SW-ROLE-LGN-TC07: Sales login redirects to /dashboard', { tags: ['@smoke'] }, () => {
    cy.then(() => {
      loginPage.login(sales.username, sales.password);
      cy.url().should('include', roleData.postLoginUrls.epSalesPartition);
    });
  });

  // Error Guessing — role escalation: Sales must NOT land on /configurations after login
  // (Sales is not isAdmin() — AdminAuthGuard would block it; this confirms the redirect target)
  it('SW-ROLE-LGN-TC08: Sales login does NOT redirect to /configurations', () => {
    cy.then(() => {
      loginPage.login(sales.username, sales.password);
      cy.url().should('include', '/dashboard');
      cy.url().should('not.include', '/configurations');
    });
  });

  // Use Case — sales profile panel displays "sales" role label
  it('SW-ROLE-LGN-TC09: Sales profile panel shows "sales" role label', () => {
    cy.then(() => {
      loginPage.login(sales.username, sales.password);
      cy.url().should('include', roleData.postLoginUrls.epSalesPartition);
      page.clickProfileIcon();
      page.assertProfileRole(roleData.profileRoles.sales);
    });
  });

  // State Transition — Sales-Auth → Unauthenticated (valid)
  it('SW-ROLE-LGN-TC10: Sales logout redirects to sign-in page', () => {
    cy.then(() => {
      loginPage.login(sales.username, sales.password);
      cy.url().should('include', roleData.postLoginUrls.epSalesPartition);
      page.clickProfileIcon();
      page.clickLogout();
      cy.expectSignedOut();
    });
  });

  // ── Negative / Error cases ─────────────────────────────────────────────────

  // EP (invalid credentials partition) + Error Guessing.
  // Credentials are now rejected by the Keycloak realm, not by the app — the
  // realm re-renders its own page with an error and never returns to the app.
  it('SW-ROLE-LGN-TC11: Invalid credentials are rejected by the realm', () => {
    cy.invalidCredentials().then((u) => {
      // cy.keycloakConfig() reads the app's own /config.json, so this targets
      // the IdP the app actually redirects to — per environment.
      cy.keycloakConfig().then(({ idpOrigin }) => {
        // Landing on the sign-in route is enough — it hands off to the realm.
        loginPage.visit();
        // cy.origin serialises its callback — the realm selectors are passed in
        // through `args` rather than re-inlined here.
        cy.origin(
          idpOrigin,
          { args: { email: u.username, password: u.password, sel: loginLocators.realm } },
          ({ email, password, sel }) => {
            const { username: USER_SEL, password: PASS_SEL, submit: SUBMIT_SEL } = sel;

            cy.get(USER_SEL, { timeout: 30000 }).should('be.visible').clear().type(email);
            cy.get('body').then(($b) => {
              if ($b.find(PASS_SEL).filter(':visible').length) {
                cy.get(PASS_SEL).clear().type(password, { log: false });
              }
              cy.get(SUBMIT_SEL).first().click();
            });
            // Rejected: the realm keeps us on its own page rather than redirecting back.
            cy.location('origin', { timeout: 30000 }).should('not.contain', 'stockwise');
          },
        );
        // And the app never received a token.
        cy.url().should('not.include', '/dashboard');
      });
    });
  });

  // BVA — zero-length input (lower boundary: empty = invalid partition).
  // The empty-field contract is now owned by the Keycloak realm's own form
  // validation, not by the app, so it is asserted at the protocol level in
  // cypress/e2e/api/LoginAPI.cy.js (SW-AUTH-API-TC07: missing password yields no
  // authorization code). No app-level assertion remains to make here.

  // State Transition (invalid) — Authenticated → Expired → Protected route → sign-in redirect
  // Simulates session expiry by killing the whole browser-side session mid-run.
  it('SW-ROLE-LGN-TC13: Expired session redirects to sign-in on next navigation', () => {
    loginPage.login(admin.username, admin.password);
    cy.url().should('include', '/dashboard');

    // Simulate session expiry. Clearing the ACCESS TOKEN alone is not enough: the
    // app boots keycloak-js with onLoad:'check-sso'
    // (Frontend/src/auth/keycloak/keycloak-instance.ts), so it silently mints a
    // fresh token from the realm SSO cookie and stays on /dashboard — the test
    // would then pass only when that silent round-trip happens to fail. Kill the
    // SSO cookie too. cy.clearAllCookies() reaches the IdP's superdomain, which
    // the plain cy.clearCookies() in afterEach does not. Storage is cleared as
    // well so the guard cannot fall back to the legacy ?token= deep-link path.
    // Mirrors SW-AUTH-TC11 in cypress/e2e/00-loginPageTest.cy.js.
    cy.clearAllCookies();
    cy.clearAllSessionStorage();
    cy.clearAllLocalStorage();

    // AuthGuard detects the missing token on next navigation and redirects to sign-in.
    // Use /dashboard (AuthGuard-protected, not AdminAuthGuard) so expiry → sign-in, not → 404.
    // check-sso runs a silent iframe round-trip to the IdP before AuthGuard can
    // decide, so allow for it rather than asserting on the first paint.
    cy.visit('/dashboard');
    // The sign-in route then hands off to the realm, so either URL means "no session".
    cy.expectSignedOut();

    // Only the browser's cookie jar was emptied — the server-side SSO session was
    // never logged out — so cached role sessions stay restorable for later specs.
  });
});
