// cypress/support/locators/Chatbot/feedbackLocators.js
//
// Locators for thumbs up/down feedback specs
// (cypress/e2e/Chatbot/08-Feedback.cy.js).
//
// Each thumb IconButton is wrapped in <Tooltip title="Good response">
// / <Tooltip title="Bad response">; MUI v7 propagates the title as
// aria-label on the child, so role+name lookup is reliable. Multiple
// assistant messages each contribute one thumbs-up + one thumbs-down,
// so callers chain `.last()` for the most-recent reply.

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const feedbackLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  feedbackUpButtons: () =>
    cy.get(DRAWER_PAPER).findAllByRole('button', { name: /good response/i }),
  feedbackDownButtons: () =>
    cy.get(DRAWER_PAPER).findAllByRole('button', { name: /bad response/i }),
};

export default feedbackLocators;
