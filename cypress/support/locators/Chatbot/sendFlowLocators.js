// cypress/support/locators/Chatbot/sendFlowLocators.js
//
// Locators for the golden-path send specs (cypress/e2e/Chatbot/
// 04-SendFlow.cy.js). Covers Type+Enter (TC08) and Shift+Enter
// newline-no-submit (TC09).
//
// ChatMessage's bubble Typography is rendered with `component="div"`
// (Frontend/src/components/Chatbot/ChatMessage.tsx). The empty-state
// intro Typography and the loading "Thinking..." Typography are
// default `<p>`. Selecting `div.MuiTypography-body2` therefore matches
// actual message bubbles only.

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const sendFlowLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  // TextField placeholder is the stable hook. Returns the inner <textarea>.
  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  messageBubbleByIndex: (i) =>
    cy.get(`${DRAWER_PAPER} div.MuiTypography-body2`).eq(i),
};

export default sendFlowLocators;
