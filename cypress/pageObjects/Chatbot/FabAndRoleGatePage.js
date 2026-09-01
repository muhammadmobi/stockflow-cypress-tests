// cypress/pageObjects/Chatbot/FabAndRoleGatePage.js
//
// Page object for the chatbot FAB + role-gate specs
// (cypress/e2e/Chatbot/01-FabAndRoleGate.cy.js).
//
// Component: Frontend/src/components/Chatbot/ChatbotFAB.tsx — globally
// mounted floating action button. The entire FAB tree is conditional
// on `isAdmin`; for non-admin users the component returns null.

import L from '../../support/locators/Chatbot/fabAndRoleGateLocators';

class FabAndRoleGatePage {
  assertFabVisible() {
    L.fab().should('be.visible').and('not.be.disabled');
  }

  // Tooltip-derived role/name lookup: the entire FAB tree is conditional
  // on `isAdmin`. For non-admin users the component returns `null`, so
  // no element with that accessible name should exist anywhere.
  assertFabAbsent() {
    cy.findByRole('button', { name: /stockwise ai/i }).should('not.exist');
  }
}

export default FabAndRoleGatePage;
