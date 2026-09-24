// cypress/e2e/InventoryActions/22-Assembly.cy.js
//
// Smoke spec for the Assembly screen
// (route /asset-id/assembly).
// Page: Frontend/src/pages/AssetIdReassembly.tsx.
//
// Coverage: route reachability + "Assembly" heading renders. Full
// reassembly flow (scan parent serial -> scan component asset codes
// -> link & generate label) is deferred.

describe('Inventory Action — Assembly', { tags: ['@regression'] }, () => {
  beforeEach(() => {
    cy.authSession('admin');
  });

  it('SW-IA-TC145 — /asset-id/assembly route renders the Assembly heading', { tags: ['@smoke'] }, () => {
    cy.visit('/asset-id/assembly');
    cy.url().should('include', '/asset-id/assembly');
    cy.contains('h6', 'Assembly', { timeout: 15000 }).should('be.visible');
  });

  it('SW-IA-TC146 — serial-number scan input is present', () => {
    cy.visit('/asset-id/assembly');
    cy.get('input[placeholder="Scan or enter serial number"]', { timeout: 15000 }).should('exist');
  });
});
