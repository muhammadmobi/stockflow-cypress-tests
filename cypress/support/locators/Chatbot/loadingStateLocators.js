// cypress/support/locators/Chatbot/loadingStateLocators.js
//
// Locators for the in-flight thinking-indicator spec
// (cypress/e2e/Chatbot/06-LoadingState.cy.js).
//
// The loading bubble is a Box containing a CircularProgress + a
// Typography.body2 with the thinking text ("Classifying your
// question...", "Thinking...", or whatever the SSE stream emitted).

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const loadingStateLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  thinkingIndicator: () =>
    cy.get(`${DRAWER_PAPER} .MuiCircularProgress-root`),
};

export default loadingStateLocators;
