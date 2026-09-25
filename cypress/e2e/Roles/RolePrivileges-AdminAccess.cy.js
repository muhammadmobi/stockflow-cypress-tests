/**
 * RolePrivileges-AdminAccess.cy.js — Admin Route & Feature Access (12 TCs)
 * =========================================================================
 * Plan:    cypress/qa/testPlans/roles/plan.md §8.3
 * Feature: Admin can access all guarded routes + row actions
 *
 * ISTQB techniques applied:
 *   Use Case:       Admin happy-path per protected route (TC01–TC12)
 *   Decision Table: Admin sees row action buttons (TC09–TC10)
 *   Error Guessing: Add Product toolbar menu (TC11)
 */

import RolePrivilegesPage from '../../pageObjects/Roles/RolePrivilegesPage';
import roleData from '../../fixtures/Roles/rolePrivilegesData.json';

describe('SW-ROLE-ADM — Admin Route & Feature Access', { tags: ['@regression'] }, () => {
  const page = new RolePrivilegesPage();

  // ── UI route access (TC01–TC12) ────────────────────────────────────────────

  describe('Admin route access — all protected routes load', () => {
    beforeEach(() => {
      cy.authSession('admin');
    });

    // Use Case — AdminAuthGuard passes for Admin → Attributes page renders
    it('SW-ROLE-ADM-TC01: Admin accesses /configurations/attributes', { tags: ['@smoke'] }, () => {
      cy.visit('/configurations/attributes');
      cy.url().should('include', '/configurations/attributes');
      // Page content confirms the route rendered (not redirected to /404 or sign-in)
      cy.get('body').should('not.contain', '404');
    });

    // Use Case — AdminAuthGuard passes for Admin → Category page renders
    it('SW-ROLE-ADM-TC02: Admin accesses /configurations/category', () => {
      cy.visit('/configurations/category');
      cy.url().should('include', '/configurations/category');
      cy.get('body').should('not.contain', '404');
    });

    // Use Case — AdminAuthGuard passes for Admin → Scan Config renders
    it('SW-ROLE-ADM-TC03: Admin accesses /configurations/scan-config', () => {
      cy.visit('/configurations/scan-config');
      cy.url().should('include', '/configurations/scan-config');
      cy.get('body').should('not.contain', '404');
    });

    // Use Case — AdminAuthGuard passes for Admin → General Config renders
    it('SW-ROLE-ADM-TC04: Admin accesses /configurations/general-config', () => {
      cy.visit('/configurations/general-config');
      cy.url().should('include', '/configurations/general-config');
      cy.get('body').should('not.contain', '404');
    });

    // Use Case — Admin can access mobileViewRoutes (spread included for Admin)
    it('SW-ROLE-ADM-TC05: Admin accesses /MobileViewScreen', { tags: ['@smoke'] }, () => {
      cy.visit('/MobileViewScreen');
      cy.url().should('include', '/MobileViewScreen');
      cy.get('body').should('not.contain', '404');
    });

    // Use Case — Admin can access /work-order (in restrictedForSalesRoutes, accessible to Admin)
    it('SW-ROLE-ADM-TC06: Admin accesses /work-order', () => {
      cy.visit('/work-order');
      cy.url().should('include', '/work-order');
      cy.get('body').should('not.contain', '404');
    });

    // Use Case — AdminAuthGuard passes → WMS Locations page renders
    it('SW-ROLE-ADM-TC07: Admin accesses /warehouse-management/locations', () => {
      cy.visit('/warehouse-management/locations');
      cy.url().should('include', '/warehouse-management/locations');
      cy.get('body').should('not.contain', '404');
    });

    // Use Case — Admin sees Cost Report page with real (non-zero) cost data
    // Also covers BVA: Admin is the "not-sanitized" side of the roleId===3 boundary
    it('SW-ROLE-ADM-TC08: Admin accesses Cost Report page and sees real cost values', () => {
      cy.intercept('GET', '/reports/inventory-value-report*').as('costReportApi');
      cy.visit(roleData.routes.costReport);
      cy.wait('@costReportApi', { timeout: 20000 }).then((interception) => {
        const body = interception.response.body;
        const list = body?.data?.list ?? body?.data?.items ?? [];
        const hasCost = list.some((item) => {
          const val = item.cost ?? item.costPrice ?? item.totalCost;
          return val !== null && val !== 0 && val !== '0';
        });
        expect(hasCost, 'Admin cost report must contain at least one non-zero cost value').to.be.true;
      });
    });

    // Decision Table — Admin sees row action buttons in inventory tbody
    it('SW-ROLE-ADM-TC09: Admin inventory table shows row action buttons', { tags: ['@smoke'] }, () => {
      cy.intercept('GET', '/products*').as('productsApi');
      cy.visit('/inventory');
      cy.wait('@productsApi', { timeout: 20000 });
      cy.get('tbody tr', { timeout: 15000 }).should('have.length.greaterThan', 0);
      page.assertRowActionsPresent();
    });

    // Decision Table — Admin sees row action buttons in incoming-inventory
    it('SW-ROLE-ADM-TC10: Admin incoming-inventory shows row action buttons', () => {
      cy.intercept('GET', '/incoming-items/reports*').as('incomingApi');
      cy.visit('/incoming-inventory');
      cy.wait('@incomingApi', { timeout: 20000 });
      cy.get('tbody tr', { timeout: 15000 }).should('have.length.greaterThan', 0);
      page.assertRowActionsPresent();
    });

    // Error Guessing — Add Product is a toolbar menu item, not a direct button
    it('SW-ROLE-ADM-TC11: Admin can open Add Product form from inventory toolbar', () => {
      cy.intercept('GET', '/products*').as('productsApi');
      cy.visit('/inventory');
      cy.wait('@productsApi', { timeout: 20000 });
      // Toolbar #long-button (NOT in tbody — see feedback_cypress_add_product_menu.md)
      cy.get('button#long-button').not('tbody *').first().click();
      cy.get('[role="menu"]').contains(/^Add Product$/i).click();
      // Confirm the Add Product form rendered (URL changed or form is mounted)
      cy.url().then((url) => {
        if (!url.includes('new-product')) {
          cy.get('form', { timeout: 10000 }).should('exist');
        }
      });
    });

    // Use Case — /asset-id is in restrictedForSalesRoutes; Admin can access it
    it('SW-ROLE-ADM-TC12: Admin accesses /asset-id', () => {
      cy.visit(roleData.routes.assetId);
      cy.url().should('include', '/asset-id');
      cy.get('body').should('not.contain', '404');
    });
  });
});
