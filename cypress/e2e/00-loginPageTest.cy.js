/**
 * Login Page UI Tests (SW-AUTH-TC01..)
 * =============================================================================
 * REWRITTEN for the Keycloak / IAM migration.
 *
 * The app's sign-in page no longer renders an email/password form, and since
 * the automatic hand-off it is not shown at all: the sign-in route starts the
 * Keycloak PKCE redirect by itself, and credentials are entered on the realm's
 * own page (a different superdomain, so cy.origin is required). The screen with
 * the "Login with IAM Identity" button survives only for the cases that must
 * be read before the hand-off (a ?message=, the legacy ?token= flow, a hand-off
 * that bounced straight back) — covered here via cy.visitSignInScreen().
 *
 * Cases retired by the migration (their pre-Keycloak subjects no longer exist,
 * so the IDs were renumbered rather than left dangling):
 *   email + password field labels   — no local form
 *   "Sign in" button caption        — replaced by the IAM button
 *   inline "required" field errors  — the client-side form is gone
 *   show/hide password toggle       — realm-owned UI, not ours
 *
 * Credential rejection is now realm behaviour, asserted in
 * cypress/e2e/Roles/RolePrivileges-Login.cy.js (SW-ROLE-LGN-TC11); the token
 * contract is asserted in cypress/e2e/api/LoginAPI.cy.js.
 *
 * Plan: cypress/qa/testPlans/auth/plan.md
 */

import LoginPage from '../pageObjects/loginPage'
import loginLocators from '../support/locators/loginLocators'

describe('Login Page (Keycloak / IAM)', () => {

  const loginPage = new LoginPage()
  let loginData
  let worker // credentials for the active tenant's user role

  before(() => {
    cy.fixture('loginPageData').then((data) => {
      loginData = data
    })
    cy.credentials('user').then((c) => {
      worker = c
    })
  })

  describe('Sign-in page UI', () => {
    // State Transition — Unauthenticated (app) to Realm sign-in, with no app
    // sign-in screen in between. The sign-in route hands off by itself, so
    // landing on the realm's username field is the whole observable behaviour.
    // cy.keycloakConfig() reads the app's own /config.json, so this resolves the
    // same IdP the app actually redirects to — per environment, no hard-coded origin.
    it('SW-AUTH-TC01: Verify the sign-in route hands off to the Keycloak realm', { tags: ['@smoke'] }, () => {
      cy.keycloakConfig().then(({ idpOrigin }) => {
        loginPage.visit()
        // cy.origin serialises its callback — the realm selectors are passed in
        // through `args` rather than re-inlined here.
        cy.origin(idpOrigin, { args: { sel: loginLocators.realm } }, ({ sel }) => {
          cy.get(sel.username, { timeout: 30000 }).should('be.visible')
        })
      })
    })

    // The fallback screen: rendered only when the app has something to say
    // first (here a ?message=, as the force-logout path sends). It is the one
    // remaining place the app's own sign-in UI is shown.
    describe('Fallback screen (hand-off suppressed)', () => {
      beforeEach(() => {
        loginPage.visitScreen('Please sign in to continue.')
      })

      // Use Case — the sign-in screen renders its identifying heading
      it('SW-AUTH-TC02: Verify page heading', { tags: ['@regression'] }, () => {
        loginPage.verifyPageHeading(loginData.pageHeading)
      })

      // Use Case — the only credential entry point is present and actionable
      it('SW-AUTH-TC03: Verify the IAM login button is shown and enabled', { tags: ['@smoke'] }, () => {
        loginPage.verifyIamLoginButton()
      })

      // Error Guessing — a regression to the retired local form would reintroduce these inputs
      it('SW-AUTH-TC04: Verify no local email/password form is rendered', { tags: ['@regression'] }, () => {
        // The credential fields must live on the realm, not the app. If these ever
        // reappear the app has regressed to the retired local identity flow.
        cy.get('body').then(($b) => {
          expect($b.find('input[name="email"]').length, 'local email input').to.equal(0)
          expect($b.find('input[name="password"]').length, 'local password input').to.equal(0)
        })
      })

      // State Transition — the button performs the same hand-off as the automatic one
      it('SW-AUTH-TC12: Verify the IAM button redirects to the Keycloak realm', { tags: ['@regression'] }, () => {
        cy.keycloakConfig().then(({ idpOrigin }) => {
          loginPage.clickIamLogin()
          cy.origin(idpOrigin, { args: { sel: loginLocators.realm } }, ({ sel }) => {
            cy.get(sel.username, { timeout: 30000 }).should('be.visible')
          })
        })
      })
    })
  })

  describe('Authenticated flows', () => {
    afterEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
    })

    // Use Case — happy-path admin sign-in lands on the dashboard
    it('SW-AUTH-TC05: Verify successful admin login', { tags: ['@smoke'] }, () => {
      cy.login()
      cy.url().should('include', loginData.routes.dashboard)
      // The "Inventory Dashboard" heading was removed from the Frontend (confirmed
      // with user 2026-05-15 — see cypress/qa/testPlans/navigation/plan.md). The
      // dashboard now renders a "Welcome back, {firstName}." header. Assert only the
      // stable "Welcome back" prefix so it stays account-agnostic across envs.
      cy.contains(loginData.landingPage.title).should('be.visible')
    })

    // Use Case — the session carries a well-formed JWT the app can use
    it('SW-AUTH-TC06: Verify the access token is mirrored into sessionStorage', { tags: ['@regression'] }, () => {
      cy.login()
      cy.getAuthToken().then((token) => {
        expect(token, 'Keycloak access token').to.be.a('string')
        expect(token.split('.'), 'token is a JWT').to.have.length(3)
      })
    })

    // Decision Table — role claim drives the profile-panel role label
    it('SW-AUTH-TC07: Verify admin profile panel shows Admin role', { tags: ['@regression'] }, () => {
      cy.login()
      cy.url().should('include', loginData.routes.dashboard)
      loginPage.clickProfileIcon()
      loginPage.verifyProfileRole(loginData.profile.adminRole)
    })

    // State Transition — Authenticated to Unauthenticated via logout
    it('SW-AUTH-TC08: Verify logout ends the session', { tags: ['@regression'] }, () => {
      cy.login()
      cy.url().should('include', loginData.routes.dashboard)
      loginPage.clickProfileIcon()
      loginPage.clickLogout()
      // Logout lands on the sign-in route, which hands off to the realm on its
      // own — assert "signed out" rather than racing that redirect.
      cy.expectSignedOut()
    })

    // Worker-role cases require a provisioned IAM worker account in users.json.
    // EP — User/worker role partition lands on the mobile view
    it('SW-AUTH-TC09: Verify successful user login', { tags: ['@smoke'] }, () => {
      // No pre-visit: loginPage.login() visits the app itself, and landing on
      // the sign-in route first would only start a hand-off this test abandons.
      loginPage.login(worker.username, worker.password)
      cy.url().should('include', loginData.routes.userview)
      cy.contains(loginData.landingPage.heading).should('be.visible')
    })

    // Decision Table — role claim drives the profile-panel role label (User)
    it('SW-AUTH-TC10: Verify user profile panel shows User role', { tags: ['@regression'] }, () => {
      // Uses the cached worker session, NOT a second `fresh` form login. TC09
      // leaves a live IAM SSO session behind, and with one active the IdP
      // redirects straight through without ever rendering the realm form — so a
      // fresh login here died on "cy.filter() failed because it requires a DOM
      // element" while passing when run alone. TC09 already owns the form flow;
      // this TC only needs an authenticated worker, and cy.session clears
      // session state before its setup so it establishes one deterministically.
      cy.authSession('user')
      cy.visit('/')
      cy.url().should('include', loginData.routes.userview)
      loginPage.clickProfileIcon()
      loginPage.verifyProfileRole(loginData.profile.userRole)
    })

    // State Transition — Authenticated to Unauthenticated when the SSO session dies
    it('SW-AUTH-TC11: Verify a dead SSO session redirects a protected route to sign-in', { tags: ['@regression'] }, () => {
      // Precondition must be a clean, LIVE admin session. The preceding worker
      // cases (TC09 fresh-form login, TC10 authSession('user')) leave a worker
      // SSO session at the realm that afterEach's plain cy.clearCookies() does
      // NOT reach (only clearAllCookies touches the IdP superdomain). Restoring
      // the cached admin cy.session over that polluted cookie jar left the app
      // unauthenticated, so the setup below bounced to sign-in. Wipe everything
      // (incl. the IdP cookie + saved sessions) and drive a guaranteed-fresh
      // admin sign-in so this case tests the dead-SSO redirect, not the fallout
      // of cross-test session bleed.
      cy.clearAllCookies()
      cy.clearAllSessionStorage()
      cy.clearAllLocalStorage()
      Cypress.session.clearAllSavedSessions()
      cy.login(undefined, undefined, { fresh: true })
      cy.url().should('include', loginData.routes.dashboard)

      // Clearing the ACCESS TOKEN alone proves nothing — the app boots keycloak-js
      // with onLoad:'check-sso' and silently mints a new one from the realm SSO
      // cookie (that renewal is the app's job and is specified in plan.md §6, not
      // asserted here). Only killing the SSO session too drops the app back to
      // Unauthenticated. clearAllCookies reaches the IdP's superdomain, which the
      // plain cy.clearCookies() in afterEach does not.
      cy.clearAllCookies()
      cy.clearAllSessionStorage()
      cy.clearAllLocalStorage()

      cy.visit(loginData.routes.dashboard)
      // check-sso runs a silent iframe round-trip to the IdP before AuthGuard can
      // decide, so allow for it rather than asserting on the first paint. The
      // sign-in route then hands off to the realm, so either URL means "no session".
      cy.expectSignedOut()

      // The server-side SSO session was never logged out — only the browser's
      // cookie jar was emptied — so the cached admin-session stays restorable and
      // later specs are unaffected.
    })
  })
})
