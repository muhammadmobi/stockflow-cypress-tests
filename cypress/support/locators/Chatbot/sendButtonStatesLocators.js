// cypress/support/locators/Chatbot/sendButtonStatesLocators.js
//
// Locators for send-button BVA specs (cypress/e2e/Chatbot/
// 05-SendButtonStates.cy.js). Covers empty-input disable (TC10),
// whitespace-only disable (TC11), and 5000-char paste (TC12).
//
// The input footer Box wraps the TextField and a single IconButton.
// The textarea's nearest `.MuiBox-root` ancestor is that footer (the
// intermediate MUI form-control wrappers do NOT carry .MuiBox-root),
// so .closest('.MuiBox-root').find('button') resolves to the send
// IconButton.

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const sendButtonStatesLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  sendButton: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i)
      .closest('.MuiBox-root')
      .find('button'),
};

export default sendButtonStatesLocators;
