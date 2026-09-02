// cypress/support/locators/Chatbot/errorAndRetryLocators.js
//
// Locators for the 5xx error + retry affordance spec
// (cypress/e2e/Chatbot/10-ErrorAndRetry.cy.js).
//
// The Retry IconButton lives inside `.msg-actions` (opacity:0 by
// default, fades in on hover) and is wrapped in <Tooltip title="Retry">.
// The Tooltip title yields aria-label="Retry", so role+name is the
// stable hook. `.msg-actions` opacity:0 means we cannot
// `should('be.visible')` here — callers verify existence + click with
// { force: true }.

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const errorAndRetryLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  retryButtons: () =>
    cy.get(DRAWER_PAPER).findAllByRole('button', { name: /^retry$/i }),

  // Drawer-scoped substring matcher for assistant-bubble text. Used by
  // the recovery assertion in TC19 to confirm the second (200) response
  // surfaced after the retry click. Uses cy.contains under the drawer
  // paper anchor so it does not collide with similarly-worded text on
  // the underlying page.
  drawerContainsText: (text) => cy.get(DRAWER_PAPER).contains(text),
};

export default errorAndRetryLocators;
