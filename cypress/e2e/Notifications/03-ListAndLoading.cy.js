// cypress/e2e/Notifications/03-ListAndLoading.cy.js
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
  'Low-Stock Notifications Bell — List rendering & loading state',
  { tags: ['@regression'] },
  () => {
    const page = new NotificationsBellPage();

    beforeEach(() => {
      cy.authSession('admin');
    });

    // Use case — loading alternate path: skeleton bars during in-flight fetch
    it('SW-NOT-TC07: Skeleton loaders render while notifications are loading', () => {
      page.stubNotifications(data.stub.epOneUnread, { delay: 1500 });
      cy.visit(urls.dashboard);
      page.openBell();
      page.assertSkeletonsVisible();
    });

    // EP — representative valid row renders productName, stock, threshold
    it('SW-NOT-TC10: List item displays productName, current stock and threshold', () => {
      page.stubNotifications(data.stub.epOneUnread);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      const item = data.stub.epOneUnread[0];
      page.assertListItemContains(0, item.productName);
      page.assertListItemContains(0, String(item.currentStock));
      page.assertListItemContains(0, String(item.threshold));
    });

    // Decision table — categoryName null → chip hidden
    it('SW-NOT-TC12: Category chip is hidden when categoryName is null', () => {
      page.stubNotifications(data.stub.epNullCategory);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.assertCategoryChipMissingForItem(0);
    });

    // State transition (visual) — unread vs read row backgrounds differ
    it('SW-NOT-TC13: Unread row has warning background; read row is transparent', () => {
      page.stubNotifications(data.stub.epOneUnreadOneRead);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.toggleUnreadOnly(); // show all so both rows are visible
      page.assertItemUnreadStyle(0); // unread row first by createdAt order
      page.assertItemReadStyle(1);
    });

    // EP — representative valid value in the "minutes ago" partition.
    // relativeTime() (NotificationsBell.tsx:34-42) buckets diff into
    // {just now, Nm ago, Nh ago, Nd ago}. We pick a 30-min offset so the
    // assertion stays stable across slow runners (next bucket boundary is
    // 60 min away — 30 min of head-room).
    it('SW-NOT-TC20: List item secondary line shows relative time ("Nm ago")', () => {
      const minutesAgo = 30;
      const recent = {
        ...data.stub.epOneUnread[0],
        createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      };
      page.stubNotifications([recent]);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.assertListItemContains(0, `${minutesAgo}m ago`);
    });
  }
);
