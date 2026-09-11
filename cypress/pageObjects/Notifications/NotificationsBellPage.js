// cypress/pageObjects/Notifications/NotificationsBellPage.js
//
// Page object for the Low-Stock Notifications Bell
// (Frontend/src/components/notifications/NotificationsBell.tsx).
//
// Stub strategy:
//   The bell mounts inside the dashboard layout and immediately calls
//   GET /notifications via @tanstack/react-query. To deterministically
//   drive UI state (badge count, empty states, read transitions, virtual
//   scroll) we stub that endpoint with cy.intercept BEFORE cy.visit().
//   apiService.get returns the full AxiosResponse, so the component reads
//   data.data.data — meaning our stub body must be { data: [...notifications] }
//   (the StockWise envelope; axios wraps it into response.data automatically).

import notificationsLocators from '../../support/locators/Notifications/notificationsLocators';

// Match GET /notifications (list) but NOT /notifications/unread-count,
// /notifications/:id/read, or /notifications/read-all.
const NOTIFICATIONS_LIST_PATH = /\/notifications(?:\?|$)/;
const MARK_READ_PATH = /\/notifications\/\d+\/read$/;
const MARK_ALL_PATH = /\/notifications\/read-all$/;

class NotificationsBellPage {
  // ── Stub setup ───────────────────────────────────────────────────────────

  // Stub GET /notifications to return the supplied notification array.
  // Optional opts.delay (ms) lets a test exercise the loading-skeleton path.
  stubNotifications(notifications, opts = {}) {
    const handler = (req) => {
      const reply = { body: { data: notifications } };
      if (opts.delay) reply.delay = opts.delay;
      req.reply(reply);
    };
    cy.intercept('GET', NOTIFICATIONS_LIST_PATH, handler).as('getNotifications');
  }

  // Stub GET /notifications with a malformed envelope so we can verify the
  // component degrades gracefully (error-guessing — JSON shape).
  stubMalformedNotifications() {
    cy.intercept('GET', NOTIFICATIONS_LIST_PATH, {
      body: { data: null },
    }).as('getNotifications');
  }

  // Mutable-state stub: the GET handler reads from a shared `state` array,
  // and the PATCH handlers mutate it. After invalidateQueries fires a
  // refetch, the next GET reflects the mutation — this lets us drive the
  // Unread → Read state transition deterministically without touching the
  // real backend.
  //
  // opts.markAllDelay (ms) lets a test assert the in-flight disabled state
  // on the "Mark all read" button before the PATCH settles (TC25).
  stubMutableNotifications(initialNotifications, opts = {}) {
    const state = { items: [...initialNotifications] };

    cy.intercept('GET', NOTIFICATIONS_LIST_PATH, (req) => {
      req.reply({ body: { data: state.items } });
    }).as('getNotifications');

    cy.intercept('PATCH', MARK_READ_PATH, (req) => {
      const match = req.url.match(/\/notifications\/(\d+)\/read/);
      const id = match ? Number(match[1]) : null;
      state.items = state.items.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      );
      req.reply({ body: { data: { id, isRead: true } } });
    }).as('markRead');

    cy.intercept('PATCH', MARK_ALL_PATH, (req) => {
      state.items = state.items.map((n) => ({ ...n, isRead: true }));
      const reply = { body: { data: { ok: true } } };
      if (opts.markAllDelay) reply.delay = opts.markAllDelay;
      req.reply(reply);
    }).as('markAllRead');
  }

  // Wait for the initial bell fetch to land before assertions.
  waitForInitialFetch() {
    cy.wait('@getNotifications');
  }

  // ── Trigger interactions ─────────────────────────────────────────────────

  openBell() {
    notificationsLocators.bellButton().click();
    notificationsLocators.popover().should('be.visible');
  }

  closeBellByBackdrop() {
    // MUI Popover backdrop sits behind the paper; pressing Escape is the
    // most stable cross-browser way to dismiss it.
    cy.get('body').type('{esc}');
  }

  toggleUnreadOnly() {
    notificationsLocators.unreadOnlySwitch().click();
  }

  markItemReadByIndex(index) {
    notificationsLocators.markReadButtonForItem(index).click();
    cy.wait('@markRead');
    // react-query invalidates and refetches via GET /notifications after the
    // PATCH settles. Wait for that refetch so the bell badge re-renders with
    // the new unread count before we assert on it.
    cy.wait('@getNotifications');
  }

  markAllAsRead() {
    notificationsLocators.markAllReadButton().click();
    cy.wait('@markAllRead');
    cy.wait('@getNotifications');
  }

  // Click "Mark all read" without waiting for the PATCH to settle. Used by
  // TC25 to assert the in-flight disabled state before the request returns.
  // Caller is responsible for waiting on @markAllRead afterwards.
  clickMarkAllReadButton() {
    notificationsLocators.markAllReadButton().click();
  }

  // Drive the virtual-scroll Box's scroll position. cy.scrollTo dispatches a
  // native scroll event; React's onScroll synthetic handler picks it up and
  // calls setScrollTop, which re-runs the visibleStart/End slice math.
  scrollListBy(scrollTop) {
    notificationsLocators.scrollContainer().scrollTo(0, scrollTop, { ensureScrollable: true });
  }

  // ── Assertions ───────────────────────────────────────────────────────────

  assertBellVisible() {
    notificationsLocators
      .bellButton()
      .should('be.visible')
      .and('not.be.disabled');
  }

  // When unreadCount = 0 the badge has class MuiBadge-invisible.
  assertBadgeHidden() {
    notificationsLocators
      .bellBadge()
      .should('have.class', 'MuiBadge-invisible');
  }

  // For values 1..99 the badge text is the number; for >99 it is "99+".
  // We assert via DOM-level text + the absence of MuiBadge-invisible rather
  // than `should('be.visible')` because MUI's Badge applies short-lived CSS
  // transforms during reflow that intermittently fail Cypress's geometric
  // visibility check (seen on TC15 after a refetch-driven re-render).
  assertBadgeText(expected) {
    notificationsLocators
      .bellBadge()
      .should('exist')
      .and('not.have.class', 'MuiBadge-invisible')
      .invoke('text')
      .invoke('trim')
      .should('eq', String(expected));
  }

  assertPopoverHeader(expectedText) {
    notificationsLocators
      .popoverHeader()
      .should('be.visible')
      .and('contain.text', expectedText);
  }

  assertPopoverClosed() {
    notificationsLocators.popover().should('not.exist');
  }

  assertSkeletonsVisible() {
    notificationsLocators.skeletons().should('have.length.greaterThan', 0);
  }

  assertEmptyState(expectedText) {
    notificationsLocators.emptyStateText(expectedText).should('be.visible');
  }

  assertItemCount(expected) {
    notificationsLocators.listItems().should('have.length', expected);
  }

  assertListItemContains(index, text) {
    notificationsLocators
      .listItemByIndex(index)
      .should('contain.text', text);
  }

  assertCategoryChipVisibleForItem(index, expectedLabel) {
    notificationsLocators
      .categoryChipForItem(index)
      .should('be.visible')
      .and('contain.text', expectedLabel);
  }

  assertCategoryChipMissingForItem(index) {
    notificationsLocators
      .listItemByIndex(index)
      .find('.MuiChip-root')
      .should('not.exist');
  }

  // Unread rows render with bgcolor: 'warning.lighter'. Read rows are
  // transparent. We assert the resolved background-color is non-transparent
  // (unread) or rgba(0,0,0,0) (read) — the exact warning.lighter color
  // value depends on the MUI theme palette and would be brittle to hardcode.
  assertItemUnreadStyle(index) {
    notificationsLocators
      .listItemByIndex(index)
      .should('have.css', 'background-color')
      .and('not.eq', 'rgba(0, 0, 0, 0)')
      .and('not.eq', 'transparent');
  }

  assertItemReadStyle(index) {
    notificationsLocators
      .listItemByIndex(index)
      .should('have.css', 'background-color', 'rgba(0, 0, 0, 0)');
  }

  assertMarkAllReadVisible() {
    notificationsLocators.markAllReadButton().should('be.visible');
  }

  assertMarkAllReadHidden() {
    notificationsLocators.markAllReadButton().should('not.exist');
  }

  // While the read-all PATCH is in flight the button text becomes "Clearing…"
  // and `disabled={isMarkingAll}` is applied (NotificationsBell.tsx:219, 222).
  // We assert both signals so a regression that drops either is caught.
  assertMarkAllReadInFlight(label) {
    notificationsLocators
      .markAllReadButton()
      .should('be.disabled')
      .and('contain.text', label);
  }

  // TC27 — header chip shows the unread count when > 0; not rendered at 0.
  // The bell badge (TC02–TC04) is a separate DOM element; both must be
  // covered because either can break independently.
  assertHeaderChipText(expected) {
    notificationsLocators
      .popoverHeaderChip()
      .should('be.visible')
      .and('contain.text', String(expected));
  }

  assertHeaderChipMissing() {
    notificationsLocators.popoverHeaderChip().should('not.exist');
  }

  // TC21 — virtual scroll renders only the visible window (+ overscan).
  // With LIST_HEIGHT=380, ITEM_HEIGHT=76, OVERSCAN=2 the worst case is
  // ceil(380/76) + 2*OVERSCAN + 1 ≈ 11 rendered ListItems, regardless of
  // total count. A regression that removes virtualization renders all rows.
  assertRenderedItemCountAtMost(max) {
    notificationsLocators.listItems().should('have.length.at.most', max);
  }

  assertMarkReadVisibleForItem(index) {
    notificationsLocators.markReadButtonForItem(index).should('be.visible');
  }

  assertMarkReadHiddenForItem(index) {
    notificationsLocators
      .listItemByIndex(index)
      .findByRole('button', { name: /mark as read/i })
      .should('not.exist');
  }
}

export default NotificationsBellPage;
