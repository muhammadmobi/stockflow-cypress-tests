// cypress/support/locators/Chatbot/fabAndRoleGateLocators.js
//
// Locators for FAB visibility & role-gate specs (cypress/e2e/Chatbot/
// 01-FabAndRoleGate.cy.js).
//
// Tooltip title="StockWise AI (Ctrl+/)" provides the accessible name
// (MUI Tooltip applies `aria-label` to the wrapped Fab). For non-admin
// users the FAB component returns null so the role+name lookup yields
// `not.exist` — see assertFabAbsent in the page object.

const fabAndRoleGateLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),
};

export default fabAndRoleGateLocators;
