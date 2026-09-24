// cypress/e2e/InventoryActions/23-Disassembly.cy.js
//
// Smoke spec for the Disassembly screen
// (route /asset-id/disassembly).
// Page: Frontend/src/pages/AssetIdDisassembly.tsx.
//
// Coverage: route reachability + "Scan Serial Number" form section
// renders. Full disassembly flow (scan asset -> preview components ->
// stock-out + emit child labels) is deferred.

describe('Inventory Action — Disassembly', { tags: ['@regression'] }, () => {
  beforeEach(() => {
    cy.authSession('admin');
  });

  it('SW-IA-TC147 — /asset-id/disassembly route renders the Scan Serial Number section', { tags: ['@smoke'] }, () => {
    cy.visit('/asset-id/disassembly');
    cy.url().should('include', '/asset-id/disassembly');
    cy.contains(/Scan Serial Number/i, { timeout: 15000 }).should('be.visible');
  });
});
