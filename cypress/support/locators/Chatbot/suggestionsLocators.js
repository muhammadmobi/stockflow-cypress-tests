// cypress/support/locators/Chatbot/suggestionsLocators.js
//
// Locators for empty-conversation suggestion-chip specs
// (cypress/e2e/Chatbot/03-Suggestions.cy.js). Outlined clickable
// chips render only when messages.length === 0.

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const suggestionsLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  suggestionChips: () => cy.get(`${DRAWER_PAPER} .MuiChip-clickable`),
  suggestionChipByIndex: (i) =>
    cy.get(`${DRAWER_PAPER} .MuiChip-clickable`).eq(i),
};

export default suggestionsLocators;
