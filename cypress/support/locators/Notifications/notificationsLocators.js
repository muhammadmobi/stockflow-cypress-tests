// cypress/support/locators/Notifications/notificationsLocators.js
//
// Locators for the Low-Stock Notifications Bell component
// (Frontend/src/components/notifications/NotificationsBell.tsx).
//
// The bell IconButton carries aria-label="Notifications" (set directly on
// the IconButton in NotificationsBell.tsx). The popover that opens on click
// is rooted at .MuiPopover-paper — selectors that read popover-internal state
// are scoped via popoverRoot() to avoid collisions with the bell trigger.

const POPOVER_ROOT = '.MuiPopover-paper';

const notificationsLocators = {
  // ── Bell (trigger) ───────────────────────────────────────────────────────
  bellButton: () => cy.findByRole('button', { name: /^notifications$/i }),

  // MUI Badge sub-element scoped to the bell IconButton. When count = 0 and
  // showZero is unset (default), it carries class MuiBadge-invisible and is
  // rendered empty.
  //
  // `hidden: true` is required because MUI Popover/Modal wraps the rest of
  // the DOM in `aria-hidden="true"` for focus-trap while the popover is
  // open. @testing-library's findByRole filters out aria-hidden nodes by
  // default — without this option, the bell badge becomes unreachable
  // immediately after openBell() (TC15, TC17).
  bellBadge: () =>
    cy
      .findByRole('button', { name: /^notifications$/i, hidden: true })
      .find('.MuiBadge-badge'),

  // ── Popover (root) ───────────────────────────────────────────────────────
  popover: () => cy.get(POPOVER_ROOT),
  popoverRoot: () => cy.get(POPOVER_ROOT),

  // Header inside popover. Header text is "Notifications" — scoping to
  // POPOVER_ROOT prevents collisions with the bell button itself.
  popoverHeader: () =>
    cy.get(POPOVER_ROOT).findByText(/^notifications$/i),

  // Header chip showing unread count (only rendered when unreadCount > 0).
  // Scoped to the title Stack so list-item chips are not matched.
  popoverHeaderChip: () =>
    cy
      .get(POPOVER_ROOT)
      .findByText(/^notifications$/i)
      .parent()
      .find('.MuiChip-root'),

  // ── Action buttons ───────────────────────────────────────────────────────
  markAllReadButton: () =>
    cy.get(POPOVER_ROOT).findByRole('button', { name: /mark all read|clearing/i }),

  // MUI v7 renders <Switch> with role="switch" (the underlying input is
  // type=checkbox but the ARIA role is switch).
  unreadOnlySwitch: () =>
    cy.get(POPOVER_ROOT).findByRole('switch', { name: /unread only/i }),

  // ── List ─────────────────────────────────────────────────────────────────
  listItems: () => cy.get(`${POPOVER_ROOT} .MuiListItem-root`),
  listItemByIndex: (i) => cy.get(`${POPOVER_ROOT} .MuiListItem-root`).eq(i),

  // The scrollable Box wrapping the virtual List. Component renders it as
  // <Box sx={{ height: 380, overflowY: 'auto' }}> with .MuiList-root inside.
  // We target the parent of .MuiList-root so cy.scrollTo + onScroll fire on
  // the same element React listens to.
  scrollContainer: () =>
    cy.get(POPOVER_ROOT).find('.MuiList-root').parent(),

  // Per-item "Mark as read" check IconButton (only on unread rows).
  markReadButtonForItem: (i) =>
    cy
      .get(`${POPOVER_ROOT} .MuiListItem-root`)
      .eq(i)
      .findByRole('button', { name: /mark as read/i }),

  // Category Chip inside a list item (only rendered when categoryName !== null).
  categoryChipForItem: (i) =>
    cy.get(`${POPOVER_ROOT} .MuiListItem-root`).eq(i).find('.MuiChip-root'),

  // ── States ───────────────────────────────────────────────────────────────
  // The component renders 3 Skeleton bars in the loading state. They use
  // MUI's class .MuiSkeleton-root.
  skeletons: () => cy.get(`${POPOVER_ROOT} .MuiSkeleton-root`),

  emptyStateText: (text) =>
    cy.get(POPOVER_ROOT).findByText(new RegExp(`^${text}$`, 'i')),
};

export default notificationsLocators;
