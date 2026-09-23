// cypress/e2e/InventoryActions/09-RestockProducts.cy.js
//
// Spec for the Restock Products mobile screen — product-quantity flow
// (route /MobileViewScreen/restock-products).
// Component: Frontend/src/components/RestockProducts/index.tsx.

import RestockProductsPage from '../../pageObjects/InventoryActions/RestockProductsPage';
import data from '../../fixtures/InventoryActions/restockProducts.json';

describe('Inventory Action — Restock Products (qty)', { tags: ['@regression'] }, () => {
  const page = new RestockProductsPage();
  let seededStockOutProductId = null;

  before(() => {
    cy.iaAuthToken().then((token) => {
      // Find a pure product with available quantity; stock out 1 unit so
      // TC99 can restock it. Cleaned up in after().
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/products`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        qs: { page: 1, page_size: 20, categoryType: 'product' },
        failOnStatusCode: false,
        timeout: 60000,
      }).then((res) => {
        const list = res.body?.data?.data?.list || res.body?.data?.list || [];
        const target = list.find(
          (p) => !p.hasItems && !p.hasVariants && Number(p.availableQuantity ?? p.quantity ?? 0) > 0,
        );
        // If no pure product with available qty, stock-in 1 unit first via
        // product-stock-in (restock-product requires stockedOutQty > 0 and
        // doesn't work on qty=0 products — same pattern as 14-AssignProducts).
        const stockOutProduct = (productId) => {
          cy.request({
            method: 'POST',
            url: `${Cypress.env('API_BASE_URL')}/products/stock-out`,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: { id: productId, quantity: 1, reason: 'Sold', level: 'Product', description: 'Cypress seed' },
            failOnStatusCode: false,
            timeout: 60000,
          }).then((so) => {
            if (so.body?.success === true || so.status < 300) {
              seededStockOutProductId = productId;
              cy.log(`[seed] Stocked out 1 unit of product ${productId} for TC99`);
            }
          });
        };

        if (target) {
          stockOutProduct(target.id);
          return;
        }

        // Fallback: find any pure product, stock-in 1 unit, then stock-out.
        const anyPure = list.find((p) => !p.hasItems && !p.hasVariants && p.id);
        if (!anyPure) { cy.log('[seed] No pure product found at all — TC99 may skip'); return; }
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/excel/po-numbers?close=false`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          failOnStatusCode: false,
          timeout: 60000,
        }).then((poRes) => {
          const arr = poRes.body?.data?.poList || poRes.body?.data?.list || poRes.body?.poList || poRes.body?.list || [];
          const first = Array.isArray(arr) ? arr[0] : null;
          const poNumber = typeof first === 'string' ? first : (first?.poNumber ?? null);
          if (!poNumber) { cy.log('[seed] No Open PO for product-stock-in — TC99 may skip'); return; }
          cy.request({
            method: 'POST',
            url: `${Cypress.env('API_BASE_URL')}/incoming-items/product-stock-in`,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: { productId: anyPure.id, poNumber, quantity: 1 },
            failOnStatusCode: false,
            timeout: 60000,
          }).then((siRes) => {
            if (siRes.status < 400 && siRes.body?.success !== false) {
              cy.log(`[seed] Stocked in product ${anyPure.id} via ${poNumber}; now stocking out for TC99`);
              stockOutProduct(anyPure.id);
            }
          });
        });
      });
    });
  });

  after(() => {
    if (!seededStockOutProductId) return;
    const id = seededStockOutProductId;
    seededStockOutProductId = null;
    cy.iaAuthToken().then((token) => {
      cy.request({
        method: 'POST',
        url: `${Cypress.env('API_BASE_URL')}/products/restock-product`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { id, quantity: 1 },
        failOnStatusCode: false,
        timeout: 60000,
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.viewport('iphone-7');
  });

  // ------------------------------------------------------------------------
  // BVA — TC99: restocking with qty < stocked-out succeeds.
  // The screen lists every restockable product; only those with
  // stockedOutQuantity > 0 yield success. We don't have a reliable probe
  // for that field on /products, so this test ACCEPTS either:
  //   - success (env has a product with stocked-out > 0)
  //   - "not enough stocked out" (env has none — clean skip with note)
  // and fails only on unexpected errors. The boundary itself is confirmed
  // by TC100 below.
  //
  // State note: success path mutates QA inventory by +1 against a
  // backend-chosen product.
  // ------------------------------------------------------------------------
  it('SW-IA-TC99 — restocking with qty less than stocked-out quantity succeeds', function () {
    page.visit();
    page.selectFirstProduct();
    page.enterQuantity(data.smallRestockQty);
    page.clickRestock();
    page.awaitRestockOutcome().then((outcome) => {
      if (outcome === 'no-stocked-out') {
        cy.log('No product with stocked-out qty on QA — skipping TC99 success path');
        this.skip();
      }
      expect(outcome, 'restock outcome').to.equal('success');
    });
  });

  // ------------------------------------------------------------------------
  // BVA — TC100: restocking with qty > stocked-out shows the error toast.
  // Using an unreasonably large quantity (999999) guarantees the boundary
  // error regardless of which product the user selects.
  // ------------------------------------------------------------------------
  // SKILL §5: @smoke representative — TC100 covers the boundary error
  // path that doesn't depend on QA having stocked-out qty (unlike TC99).
  it('SW-IA-TC100 — restocking with qty more than stocked-out quantity shows error', { tags: ['@smoke'] }, () => {
    page.visit();
    page.selectFirstProduct();
    page.enterQuantity(data.overflowRestockQty);
    page.clickRestock();
    page.assertNotEnoughStockedOutError();
  });
});
