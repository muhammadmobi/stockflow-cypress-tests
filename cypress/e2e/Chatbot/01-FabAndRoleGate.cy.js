// cypress/e2e/Chatbot/01-FabAndRoleGate.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatbotFAB.tsx
// API mirror: cypress/e2e/api/ChatbotAPI.cy.js (SW-CB-API-TC01..08)
//
// Role-gate decision-table partition: admin (TC01) sees the FAB on the
// dashboard; worker (TC02) does not see it on any route. UI-only —
// backend rules (auth gate, payload contract, rate limiting,
// analytics) are covered by the API spec and are NOT duplicated here.
// See §3 of cypress/qa/SKILL.md (UI vs API).

import FabAndRoleGatePage from '../../pageObjects/Chatbot/FabAndRoleGatePage';
import urls from '../../fixtures/urls.json';

describe('StockWise AI Chatbot — FAB visibility & role gate', { tags: ['@regression'] }, () => {
  const page = new FabAndRoleGatePage();

  // Use case — feature is alive (live, no stub)
  it('SW-CB-TC01: FAB renders for admin role on dashboard', { tags: ['@smoke'] }, () => {
    cy.authSession('admin');
    cy.visit(urls.dashboard);
    page.assertFabVisible();
  });

  // Decision table — role gate (non-admin must NOT see the FAB)
  it('SW-CB-TC02: FAB is not rendered for worker role', { tags: ['@smoke'] }, () => {
    cy.authSession('user');
    cy.visit('/');
    page.assertFabAbsent();
  });
});
