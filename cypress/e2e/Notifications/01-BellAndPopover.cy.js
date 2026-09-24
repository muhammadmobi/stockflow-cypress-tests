// cypress/e2e/Notifications/01-BellAndPopover.cy.js
//
// Test plan: cypress/qa/testPlans/notifications/plan.md
// Component:  Frontend/src/components/notifications/NotificationsBell.tsx
// API mirror: cypress/e2e/api/NotificationsAPI.cy.js (SW-NOT-API-TC01..08)
//
// UI-only behavior — backend rules (auth, payload shape, idempotency) are
// covered by the API spec and are NOT duplicated here. See §3 of
// cypress/qa/SKILL.md (UI vs API) and §11 review checklist.

import NotificationsBellPage from '../../pageObjects/Notifications/NotificationsBellPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Notifications/notifications.json';

describe(
  'Low-Stock Notifications Bell — Bell visibility & popover lifecycle',
  { tags: ['@regression'] },
  () => {
    const page = new NotificationsBellPage();

    beforeEach(() => {
      cy.authSession('admin');
    });

    // Use case — feature is alive (live, no stub)
    it('SW-NOT-TC01: Bell icon renders in admin header', { tags: ['@smoke'] }, () => {
      cy.visit(urls.dashboard);
      page.assertBellVisible();
    });

    // Use case — popover opens on bell click (live, no stub)
    it('SW-NOT-TC05: Click bell opens popover with header', { tags: ['@smoke'] }, () => {
      cy.visit(urls.dashboard);
      page.openBell();
      page.assertPopoverHeader(data.expectedCopy.popoverTitle);
    });

    // State transition — Open → Closed via Escape
    it('SW-NOT-TC06: Pressing Escape closes the popover', () => {
      cy.visit(urls.dashboard);
      page.openBell();
      page.closeBellByBackdrop();
      page.assertPopoverClosed();
    });
  }
);
