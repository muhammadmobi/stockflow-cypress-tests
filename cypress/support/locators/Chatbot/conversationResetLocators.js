// cypress/support/locators/Chatbot/conversationResetLocators.js
//
// Locators for the "New chat" reset spec (cypress/e2e/Chatbot/
// 09-ConversationReset.cy.js).
//
// The new-chat IconButton uses Tooltip title="New chat" → aria-label.
// Message bubbles are scoped to `div.MuiTypography-body2` so the
// empty-state intro Typography (default <p>) does not count as a bubble
// when asserting "conversation cleared".

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const conversationResetLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  newChatButton: () =>
    cy.get(DRAWER_PAPER).findByRole('button', { name: /new chat/i }),

  messageBubbles: () =>
    cy.get(`${DRAWER_PAPER} div.MuiTypography-body2`),
};

export default conversationResetLocators;
