// cypress/e2e/InventoryActions/21-AssetGeneration.cy.js
//
// Smoke spec for the Asset Generation screen
// (route /asset-id, reached via Inventory Actions -> Asset -> Asset Generation).
// Page: Frontend/src/pages/AssetId.tsx.
//
// Coverage: route reachability + "Generate Asset IDs" heading renders.
// Full bulk-generate flow (PO + product + qty + container -> asset
// labels) is deferred to a v3 follow-up.

describe('Inventory Action — Asset Generation', { tags: ['@regression'] }, () => {
  beforeEach(() => {
    cy.authSession('admin');
  });

  it('SW-IA-TC143 — /asset-id route renders the Generate Asset IDs heading', { tags: ['@smoke'] }, () => {
    cy.visit('/asset-id');
    cy.url().should('include', '/asset-id');
    cy.contains('h6', 'Generate Asset IDs', { timeout: 15000 }).should('be.visible');
  });

  it('SW-IA-TC144 — Search PO and Search Product inputs are present', () => {
    cy.visit('/asset-id');
    cy.get('input[placeholder="Search PO"]', { timeout: 15000 }).should('exist');
    cy.get('input[placeholder="Search Product"]').should('exist');
  });
});
