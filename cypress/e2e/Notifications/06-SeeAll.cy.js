// cypress/e2e/Notifications/06-SeeAll.cy.js
//
// Test plan: cypress/qa/testPlans/notifications/plan.md
// Component:  Frontend/src/components/notifications/NotificationsBell.tsx
// API mirror: cypress/e2e/api/NotificationsAPI.cy.js (SW-NOT-API-TC01..08)
//
// UI-only behavior — backend rules (auth, payload shape, idempotency) are
// covered by the API spec and are NOT duplicated here. See §3 of
// cypress/qa/SKILL.md (UI vs API) and §11 review checklist.
//
// History: 06-VirtualScroll.cy.js (TC21) was retired on 2026-07-11 because
// the stage component replaced the virtualiser with a "See all" link that
// navigates to a full notifications list. TC28 replaces TC21 here.

import NotificationsBellPage from '../../pageObjects/Notifications/NotificationsBellPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Notifications/notifications.json';

describe(
  'Low-Stock Notifications Bell — "See all" link',
  { tags: ['@regression'] },
  () => {
    const page = new NotificationsBellPage();

    beforeEach(() => {
      cy.authSession('admin');
    });

    // Use case — "See all" link renders at the bottom of the popover when
    // notifications are present. The stage component replaced virtual scrolling
    // with a "See all" anchor; this test confirms the link is visible for a
    // representative non-empty list (EP mid-partition).
    it('SW-NOT-TC28: "See all" link renders when the notification list is non-empty', () => {
      page.stubNotifications(data.stub.epOneUnread);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      cy.get('.MuiPopover-paper').findByText(/^see all$/i).should('be.visible');
    });
  }
);
