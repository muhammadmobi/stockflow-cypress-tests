// cypress/e2e/Notifications/04-FilterAndEmptyState.cy.js
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
  'Low-Stock Notifications Bell — "Unread only" filter & empty states',
  { tags: ['@regression'] },
  () => {
    const page = new NotificationsBellPage();

    beforeEach(() => {
      cy.authSession('admin');
    });

    // Decision table — col C2: filter ON, no unread but read items exist
    it('SW-NOT-TC08: Empty state "No unread alerts" — filter ON, only read items', () => {
      page.stubNotifications(data.stub.epAllRead);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.assertEmptyState(data.expectedCopy.emptyUnread);
    });

    // Decision table — col C4: filter OFF, list completely empty
    it('SW-NOT-TC09: Empty state "No low-stock alerts" — empty list, filter OFF', () => {
      page.stubNotifications(data.stub.epEmpty);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.toggleUnreadOnly(); // turn filter OFF
      page.assertEmptyState(data.expectedCopy.emptyAll);
    });

    // Decision table — col C3: turning filter OFF reveals previously-hidden read items
    it('SW-NOT-TC18: Toggling "Unread only" OFF reveals read items', () => {
      page.stubNotifications(data.stub.epMixed); // 3 unread, 2 read
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.assertItemCount(3); // filter ON by default → unread only
      page.toggleUnreadOnly();
      page.assertItemCount(5); // filter OFF → all items
    });

    // Error guessing — malformed envelope must not crash the popover; the
    // component falls back to [] via `data?.data?.data ?? []`.
    it('SW-NOT-TC19: Popover renders empty state when API returns malformed shape', () => {
      page.stubMalformedNotifications();
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      // With filter ON (default) and zero items the empty copy is "No unread alerts"
      page.assertEmptyState(data.expectedCopy.emptyUnread);
    });

  }
);
