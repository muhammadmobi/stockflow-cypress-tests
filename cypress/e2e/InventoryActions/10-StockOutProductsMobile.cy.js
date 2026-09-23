// cypress/e2e/InventoryActions/10-StockOutProductsMobile.cy.js
//
// Spec for the Stock Out Products mobile screen
// (route /MobileViewScreen/stock-out-products).
// Component: Frontend/src/components/StockOutProducts/index.tsx.
//
// 11-StockOutTests.cy.js (legacy desktop) covers the legacy Stock Out
// flow at the desktop Inventory page; this spec is specifically for the
// mobile route reached from Inventory Actions → Stock Out → Stock Out
// Products tile.

import StockOutProductsMobilePage from '../../pageObjects/InventoryActions/StockOutProductsMobilePage';
import data from '../../fixtures/InventoryActions/stockOutProducts.json';

describe('Inventory Action — Stock Out Products (mobile)', { tags: ['@regression'] }, () => {
  const page = new StockOutProductsMobilePage();
  let authToken;
  let reason;
  let configId;
  let originalConfigJson;
  let seededStockOutReason = false;

  before(() => {
    cy.iaAuthToken().then((token) => {
      authToken = token;
      expect(authToken, 'identity server returned a bearer token').to.exist;
      // Read config; use existing reasons or seed one so TC95 can run.
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/configs?type=general&name=general`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        failOnStatusCode: false,
        timeout: 60000,
      }).then((res) => {
        const list = res.body?.data?.list || res.body?.list || [];
        const config = list[0];
        if (!config) return;
        configId = config.id;
        originalConfigJson = JSON.parse(JSON.stringify(config.configJson));
        const existing = Array.isArray(config.configJson?.data?.stockOutReason)
          ? config.configJson.data.stockOutReason
          : config.configJson?.data?.stockOutReason
            ? [config.configJson.data.stockOutReason]
            : [];
        if (existing.filter(Boolean).length > 0) {
          reason = existing[0];
          return;
        }
        const updated = {
          ...config.configJson,
          data: { ...(config.configJson?.data || {}), stockOutReason: ['Sold'] },
        };
        cy.request({
          method: 'PATCH',
          url: `${Cypress.env('API_BASE_URL')}/configs/${configId}`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: { configJson: updated },
          failOnStatusCode: false,
          timeout: 60000,
        }).then(() => {
          reason = 'Sold';
          seededStockOutReason = true;
        });
      });
    });
  });

  after(() => {
    if (!seededStockOutReason || !configId || !originalConfigJson) return;
    cy.iaAuthToken().then((token) => {
      cy.request({
        method: 'PATCH',
        url: `${Cypress.env('API_BASE_URL')}/configs/${configId}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { configJson: originalConfigJson },
        failOnStatusCode: false,
        timeout: 60000,
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.viewport('iphone-7');
    // Alias the container-assignments call so selectFirstAvailableProduct
    // can wait for it deterministically (the source dropdown only renders
    // after this fetch settles).
    cy.intercept('GET', '**/containers/product-assignments/**').as('productAssignments');
  });

  // ------------------------------------------------------------------------
  // Use Case — TC95 happy: stock out reduces available quantity.
  // State note: this MUTATES QA inventory by -1 against a backend-chosen
  // product. We do not roll back — matches the existing API spec convention.
  // ------------------------------------------------------------------------
  // SKILL §5: @smoke representative — TC95 happy path exercises the full
  // stock-out flow (product select + reason + ref + qty + source + submit).
  it('SW-IA-TC95 — stock out a product with valid qty, reason, and reference reduces available quantity', { tags: ['@smoke'] }, function () {
    if (!reason) {
      cy.log('No configured stock-out reasons on QA — skipping TC95 happy');
      this.skip();
    }
    page.visit();
    page.selectFirstAvailableProduct();
    page.selectReason(reason);
    page.typeReferenceNumber(data.sampleReferenceNumber);
    page.enterQuantity(data.smallStockOutQty);
    // If the product has container assignment enabled, the Source
    // dropdown is required — pick the first option.
    page.selectFirstSourceIfPresent();
    page.clickStockOut();
    page.assertSuccess();
  });

  // ------------------------------------------------------------------------
  // BVA — TC95 overflow: qty > available shows the boundary error.
  // The component validates client-side at handleSubmit() before any
  // network call (StockOutProducts/index.tsx:798-803).
  // ------------------------------------------------------------------------
  it('SW-IA-TC95 (overflow) — quantity larger than available shows "cannot exceed available" error', function () {
    if (!reason) {
      cy.log('No configured stock-out reasons on QA — skipping TC95 overflow');
      this.skip();
    }
    page.visit();
    page.selectFirstAvailableProduct();
    page.selectReason(reason);
    page.typeReferenceNumber(data.sampleReferenceNumber);
    page.enterQuantity(data.overflowStockOutQty);
    page.clickStockOut();
    page.assertExceedsAvailableError();
  });
});
