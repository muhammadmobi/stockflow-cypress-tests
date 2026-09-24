// cypress/e2e/Notifications/05-MarkAsRead.cy.js
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
  'Low-Stock Notifications Bell — Mark-as-read state transitions',
  { tags: ['@regression'] },
  () => {
    const page = new NotificationsBellPage();

    beforeEach(() => {
      cy.authSession('admin');
    });

    // Decision table — per-item check button visible only on unread rows
    it('SW-NOT-TC14: "Mark as read" check appears only on unread rows', () => {
      page.stubNotifications(data.stub.epOneUnreadOneRead);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.toggleUnreadOnly();
      page.assertMarkReadVisibleForItem(0);
      page.assertMarkReadHiddenForItem(1);
    });

    // State transition — Unread → Read for a single item; badge decrements
    it(
      'SW-NOT-TC15: Click per-item check marks the row read and decrements the badge',
      { tags: ['@smoke'] },
      () => {
        page.stubMutableNotifications(data.stub.epMixed); // 3 unread, 2 read
        cy.visit(urls.dashboard);
        page.waitForInitialFetch();
        page.assertBadgeText('3');
        page.openBell();
        page.markItemReadByIndex(0);
        page.assertBadgeText('2');
      }
    );

    // State transition (visibility) — "Mark all read" hidden when no unread
    it('SW-NOT-TC16: "Mark all read" button is hidden when unread count = 0', () => {
      page.stubNotifications(data.stub.epAllRead);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.assertMarkAllReadHidden();
    });

    // State transition (bulk) — all unread → read; badge clears; button hides
    it('SW-NOT-TC17: "Mark all read" clears the badge and hides the button', () => {
      page.stubMutableNotifications(data.stub.epMixed);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.assertBadgeText('3');
      page.openBell();
      page.markAllAsRead();
      page.assertBadgeHidden();
      page.assertMarkAllReadHidden();
    });

    // State transition — Idle → InFlight → Idle on the "Mark all read"
    // button. Component sets `disabled={isMarkingAll}` and swaps the label
    // to "Clearing…" while the PATCH is pending (NotificationsBell.tsx:219,
    // 222). A regression that drops either signal allows double-clicks on
    // slow networks. Stubbed PATCH delay is the only way to deterministically
    // observe the in-flight frame.
    it('SW-NOT-TC25: "Mark all read" button disables and shows "Clearing…" while in flight', () => {
      page.stubMutableNotifications(data.stub.epMixed, { markAllDelay: 1500 });
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.clickMarkAllReadButton();
      page.assertMarkAllReadInFlight(data.expectedCopy.markAllInFlight);
      // Drain the in-flight PATCH + invalidate refetch so the test exits
      // with a clean intercept queue (CTAL-TAE state restoration).
      cy.wait('@markAllRead');
      cy.wait('@getNotifications');
    });
  }
);
