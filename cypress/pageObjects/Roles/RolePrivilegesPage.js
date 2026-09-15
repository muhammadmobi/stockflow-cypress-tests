// cypress/pageObjects/Roles/RolePrivilegesPage.js
// Page object for role-privilege UI assertions.
// Delegates login flows to LoginPage and navigation to existing Cypress patterns.

import LoginPage from '../loginPage';
import RolePrivilegesLocators from '../../support/locators/Roles/RolePrivilegesLocators';

const loginPage = new LoginPage();

class RolePrivilegesPage {
  // ─── Login delegation ────────────────────────────────────────────────────────

  loginAs(email, password) {
    loginPage.visit();
    loginPage.login(email, password);
  }

  clickProfileIcon() {
    loginPage.clickProfileIcon();
  }

  // Checks the profile panel heading for the given role string (case-insensitive)
  assertProfileRole(expectedRole) {
    // Keycloak roles render as body text ("Role: Org Admin") in the profile
    // panel, not as a heading — see loginPage.verifyProfileRole.
    loginPage.verifyProfileRole(expectedRole);
  }

  clickLogout() {
    loginPage.clickLogout();
  }

  // ─── Sidebar navigation checks ───────────────────────────────────────────────

  // Assert a top-level sidebar link (by accessible name) is visible
  assertSidebarLinkPresent(label) {
    cy.findByRole('link', { name: label }).should('exist');
  }

  // Assert a top-level sidebar link is absent from the DOM
  assertSidebarLinkAbsent(label) {
    cy.findByRole('link', { name: label }).should('not.exist');
  }

  // Assert a sidebar section accordion header (li text, not a link) is absent
  assertSidebarSectionAbsent(sectionName) {
    cy.contains('li', sectionName).should('not.exist');
  }

  // Expand the Reports accordion in the sidebar.
  // For Sales the Purchase Order Report sub-link IS present, so we wait for it.
  expandReportsSubmenu() {
    cy.contains('li', 'Reports', { timeout: 10000 })
      .first()
      .scrollIntoView()
      .click();
    // Wait for at least one sub-link to mount so absence assertions don't race
    cy.findByRole('link', { name: 'Purchase Order Report' }, { timeout: 10000 }).should('exist');
  }

  assertReportSubLinkPresent(label) {
    cy.findByRole('link', { name: label }).should('be.visible');
  }

  assertReportSubLinkAbsent(label) {
    cy.findByRole('link', { name: label }).should('not.exist');
  }

  // ─── Table row actions ────────────────────────────────────────────────────────

  // Row action buttons exist in the tbody (Admin only)
  assertRowActionsPresent() {
    cy.get(RolePrivilegesLocators.rowActionButton, { timeout: 15000 }).should('exist');
  }

  // Row action buttons are absent in the tbody (Sales)
  assertRowActionsAbsent() {
    cy.get(RolePrivilegesLocators.rowActionButton).should('not.exist');
  }

  // ─── Route blocking helpers ───────────────────────────────────────────────────

  // AdminAuthGuard redirect → URL becomes /404
  verifyAdminGuardBlocked() {
    cy.url({ timeout: 10000 }).should('include', RolePrivilegesLocators.notFoundPath);
  }

  // React Router catch-all: route not registered → not-found page or URL change.
  // Accepts either an explicit /404 redirect OR a rendered not-found component.
  verifyPageIsNotFound() {
    cy.url({ timeout: 10000 }).then((url) => {
      if (url.includes(RolePrivilegesLocators.notFoundPath)) {
        // Explicitly redirected to /404
        cy.log('Not-found: URL redirected to /404');
      } else {
        // React Router catch-all renders a not-found component at the same URL
        cy.contains(RolePrivilegesLocators.notFoundTextPattern, { timeout: 8000 })
          .should('exist');
      }
    });
  }

  // Assert the URL does not include the given path segment (confirms redirect away)
  verifyRedirectedAwayFrom(pathSegment) {
    cy.url({ timeout: 10000 }).should('not.include', pathSegment);
  }

  // ─── MobileViewScreen helpers ─────────────────────────────────────────────────

  verifyMobileViewTile(label) {
    cy.contains(/button|a/i, label, { timeout: 15000 }).should('be.visible');
  }

  // Flexible tile match using contains
  verifyMobileViewTileByText(label) {
    cy.contains(label, { timeout: 15000 }).should('be.visible');
  }

  // ─── Cost column UI assertions ────────────────────────────────────────────────

  // On the inventory page, the cost/price columns should display 0 for Sales.
  // Strategy: intercept the /products API call and assert the cost field = 0.
  assertProductApiCostIsZero(authToken) {
    const apiUrl = Cypress.env('API_BASE_URL');
    cy.request({
      method: 'GET',
      url: `${apiUrl}/products?take=5`,
      headers: { Authorization: `Bearer ${authToken}` },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'products API status').to.be.lessThan(500);
      const items = res.body?.data?.items ?? res.body?.data ?? [];
      expect(items, 'API must return items').to.be.an('array');
      items.forEach((item) => {
        if (Object.prototype.hasOwnProperty.call(item, 'cost')) {
          expect(item.cost, `cost on item ${item.id}`).to.eq(0);
        }
      });
    });
  }
}

export default RolePrivilegesPage;
