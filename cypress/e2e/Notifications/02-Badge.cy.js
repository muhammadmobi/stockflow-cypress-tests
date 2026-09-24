// cypress/e2e/Notifications/02-Badge.cy.js
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

// Build a synthetic unread-notification array for BVA tests on the badge.
// Keeps the fixture compact while still letting the spec exercise 99/100/101.
const buildUnreadList = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    ...data.bvaTemplate,
    productName: `${data.bvaTemplate.productName} ${i + 1}`,
  }));

describe(
  'Low-Stock Notifications Bell — Badge (EP & BVA on unread count)',
  { tags: ['@regression'] },
  () => {
    const page = new NotificationsBellPage();

    beforeEach(() => {
      cy.authSession('admin');
    });

    // EP — representative valid value (mid partition: 3 unread items in mixed list)
    it('SW-NOT-TC02: Badge shows exact unread count from API', () => {
      page.stubNotifications(data.stub.epMixed);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.assertBadgeText('3');
    });

    // BVA — upper boundary, just-below max (99)
    it('SW-NOT-TC03a: Badge shows "99" at MUI max boundary', () => {
      page.stubNotifications(buildUnreadList(data.bvaBadgeCounts.upperJustBelow));
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.assertBadgeText('99');
    });

    // BVA — upper boundary, at max+1 (100) → MUI clamps to "99+"
    it('SW-NOT-TC03b: Badge shows "99+" when unread = 100', () => {
      page.stubNotifications(buildUnreadList(data.bvaBadgeCounts.upperBoundary));
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.assertBadgeText('99+');
    });

    // BVA — upper boundary, just-above (101) → still "99+"
    it('SW-NOT-TC03c: Badge shows "99+" when unread > 100', () => {
      page.stubNotifications(buildUnreadList(data.bvaBadgeCounts.upperJustAbove));
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.assertBadgeText('99+');
    });

    // BVA — lower boundary (0 unread) → MUI hides the badge (.MuiBadge-invisible)
    it('SW-NOT-TC04: Badge is hidden when unread count = 0', () => {
      page.stubNotifications(data.stub.epAllRead);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.assertBadgeHidden();
    });

    // Decision table — popover-header chip mirrors the bell badge but is a
    // separate DOM element (NotificationsBell.tsx:200-207). Either can break
    // independently of the other, so both are covered.
    //
    // | Condition           | C1 (chip shown) | C2 (chip hidden) |
    // | unreadCount > 0     | T               | F                |
    // | Action: chip render | ✓               | –                |

    // C1 — chip rendered with unread count
    it('SW-NOT-TC27a: Popover header chip shows unread count when > 0', () => {
      page.stubNotifications(data.stub.epMixed); // 3 unread
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.assertHeaderChipText('3');
    });

    // C2 — chip absent when unread = 0
    it('SW-NOT-TC27b: Popover header chip is not rendered when unread = 0', () => {
      page.stubNotifications(data.stub.epAllRead);
      cy.visit(urls.dashboard);
      page.waitForInitialFetch();
      page.openBell();
      page.assertHeaderChipMissing();
    });
  }
);
