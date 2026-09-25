/**
 * RolePrivileges-Nav.cy.js — Navigation Menu per Role (14 TCs)
 * =========================================================================
 * Plan:    cypress/qa/testPlans/roles/plan.md §8.2
 * Feature: Sidebar nav items rendered (or suppressed) per role by nav-config-dashboard.tsx
 *
 * ISTQB techniques applied:
 *   Decision Table: Role × nav-item matrix from §3 of the plan.
 *                   Each TC is one cell from that table.
 *   TC01–TC07: Admin column — links present
 *   TC08–TC12, TC14–TC15: Sales column — links absent (negative)
 *   TC17:      Sales column — Inventory present (positive confirmation)
 *   TC13, TC16 retired: the Sales role became Inventory-only, so the Reports
 *                       sub-links they asserted have no section to live in.
 */

import RolePrivilegesPage from '../../pageObjects/Roles/RolePrivilegesPage';
import roleData from '../../fixtures/Roles/rolePrivilegesData.json';

describe('SW-ROLE-NAV — Navigation Menu per Role', { tags: ['@regression'] }, () => {
  const page = new RolePrivilegesPage();

  // ── Admin navigation ───────────────────────────────────────────────────────

  describe('Admin navigation — privileged items', () => {
    beforeEach(() => {
      cy.authSession('admin');
      cy.visit('/dashboard');
    });

    // Decision Table — Admin column: Work Orders link exists
    it('SW-ROLE-NAV-TC01: Admin nav contains Work Orders', { tags: ['@smoke'] }, () => {
      page.assertSidebarLinkPresent('Work Orders');
    });

    // Decision Table — Admin column: Asset Id accordion exists
    it('SW-ROLE-NAV-TC02: Admin nav contains Asset Id', () => {
      cy.contains('li', 'Asset Id', { timeout: 10000 }).should('exist');
    });

    // Decision Table — Admin column: Inventory Actions (mobile) link
    it('SW-ROLE-NAV-TC03: Admin nav contains Inventory Actions', () => {
      page.assertSidebarLinkPresent('Inventory Actions');
    });

    // Decision Table — Admin column: Configuration accordion (AdminAuthGuard-guarded)
    it('SW-ROLE-NAV-TC04: Admin nav contains Configurations section', { tags: ['@smoke'] }, () => {
      cy.contains('li', 'Configuration', { timeout: 10000 }).should('exist');
    });

    // Decision Table — Admin column: Cost Report sub-link in expanded Reports menu
    it('SW-ROLE-NAV-TC05: Admin Reports submenu contains Cost Report', () => {
      page.expandReportsSubmenu();
      page.assertReportSubLinkPresent('Cost Report');
    });

    // Decision Table — Admin column: Inventory Report sub-link present
    it('SW-ROLE-NAV-TC06: Admin Reports submenu contains Inventory Report', () => {
      page.expandReportsSubmenu();
      page.assertReportSubLinkPresent('Inventory Report');
    });

    // Decision Table — Admin column: Asset Lifecycle Report sub-link present
    it('SW-ROLE-NAV-TC07: Admin Reports submenu contains Asset Lifecycle Report', () => {
      page.expandReportsSubmenu();
      page.assertReportSubLinkPresent('Asset Lifecycle Report');
    });
  });

  // ── Sales navigation ───────────────────────────────────────────────────────

  describe('Sales navigation — Inventory is the only item', () => {
    beforeEach(() => {
      cy.authSession('sales');
      // /dashboard is mounted for Sales only as a redirect to /inventory, so
      // this lands on the role's single page.
      cy.visit('/dashboard');
    });

    // Decision Table (negative) — Sales column: Work Orders excluded by !isSales()
    it('SW-ROLE-NAV-TC08: Sales nav does NOT contain Work Orders', { tags: ['@smoke'] }, () => {
      page.assertSidebarLinkAbsent('Work Orders');
    });

    // Decision Table (negative) — Sales column: Asset Id excluded by !isSales()
    it('SW-ROLE-NAV-TC09: Sales nav does NOT contain Asset Id', () => {
      cy.contains('li', 'Asset Id').should('not.exist');
    });

    // Decision Table (negative) — Sales column: Inventory Actions excluded by !isSales()
    it('SW-ROLE-NAV-TC10: Sales nav does NOT contain Inventory Actions', () => {
      page.assertSidebarLinkAbsent('Inventory Actions');
    });

    // Decision Table (negative) — Sales column: Configuration section excluded (AdminAuthGuard)
    it('SW-ROLE-NAV-TC11: Sales nav does NOT contain Configurations section', { tags: ['@smoke'] }, () => {
      page.assertSidebarSectionAbsent('Configuration');
    });

    // Decision Table (negative) — Sales column: the whole Reports accordion is
    // gone now, so no report sub-link (Cost, Inventory, PO, Sales, …) can be
    // reached from the nav. Supersedes the per-sub-link checks that used to be
    // TC13 and TC16.
    it('SW-ROLE-NAV-TC12: Sales nav does NOT contain the Reports section', () => {
      page.assertSidebarSectionAbsent('Reports');
    });

    // TC13 and TC16 retired — they asserted individual Reports sub-links for a
    // role that no longer has the Reports section at all (TC12).

    // Decision Table (negative) — Sales column: Dashboard is not part of the
    // Inventory-only nav (the route survives only as a redirect to /inventory)
    it('SW-ROLE-NAV-TC14: Sales nav does NOT contain Dashboard', { tags: ['@smoke'] }, () => {
      page.assertSidebarLinkAbsent('Dashboard');
    });

    // Decision Table (negative) — Sales column: Purchase Orders removed
    it('SW-ROLE-NAV-TC15: Sales nav does NOT contain Purchase Orders', () => {
      page.assertSidebarLinkAbsent('Purchase Orders');
      page.assertSidebarLinkAbsent('Incoming Inventory');
    });

    // Decision Table (positive) — Sales column: Inventory is the one item left,
    // so the negative TCs above can't pass merely because the nav failed to render
    it('SW-ROLE-NAV-TC17: Sales nav contains Inventory', { tags: ['@smoke'] }, () => {
      page.assertSidebarLinkPresent('Inventory');
    });
  });
});
