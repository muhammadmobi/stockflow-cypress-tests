// cypress/e2e/InventoryActions/12-StockOutByProductScanning.cy.js
//
// Smoke spec for the Stock Out by Product Scanning mobile screen
// (route /MobileViewScreen/sku-stock-out).
// Component: Frontend/src/components/ScanProduct/index.tsx.
//
// Coverage: render check + form-presence verification. Full destination
// behaviour (scan loop + actual stock-out mutation) is intentionally
// deferred to a v3 follow-up — see cypress/qa/testPlans/inventoryActions/action-plan.md.

import StockOutByProductScanningPage from '../../pageObjects/InventoryActions/StockOutByProductScanningPage';

describe('Inventory Action — Stock Out by Product Scanning', { tags: ['@regression'] }, () => {
  const page = new StockOutByProductScanningPage();

  beforeEach(() => {
    cy.authSession('admin');
    cy.viewport('iphone-7');
  });

  // ------------------------------------------------------------------------
  // Use Case — TC130 smoke: route loads and renders the screen heading.
  // ------------------------------------------------------------------------
  it('SW-IA-TC130 — sku-stock-out route renders the Stock Out by <attr> heading', { tags: ['@smoke'] }, () => {
    page.visit();
    page.assertHeadingVisible();
  });

  // ------------------------------------------------------------------------
  // EP — TC131: the screen renders either the PO-picker (step 0, when
  // requirePoForStockOut config flag is on) OR the scan form (step 1).
  // We assert the route is reachable and one of the two is in the DOM,
  // without hard-coding the config state.
  // ------------------------------------------------------------------------
  it('SW-IA-TC131 — screen reaches step 0 (PO search) or step 1 (reason form)', () => {
    page.visit();
    cy.get('body').should(($body) => {
      const text = $body.text();
      const isStep0 = text.includes('Search PO') || text.includes('Search by PO number');
      const isStep1 = text.includes('Select reason') || text.includes('Reference Number');
      expect(isStep0 || isStep1, 'either step 0 or step 1 visible').to.be.true;
    });
  });
});
