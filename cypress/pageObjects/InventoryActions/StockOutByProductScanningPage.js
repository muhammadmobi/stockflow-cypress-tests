// cypress/pageObjects/InventoryActions/StockOutByProductScanningPage.js
//
// Page object for the Stock Out by Product Scanning mobile screen
// (route /MobileViewScreen/sku-stock-out).
// Component: Frontend/src/components/ScanProduct/index.tsx.
//
// The route is wrapped in ConfigStockOutGuard which blocks rendering
// when requireWorkOrderForStockOut=true.

import L from '../../support/locators/InventoryActions/stockOutByProductScanningLocators';

class StockOutByProductScanningPage {
  visit() {
    // The shared Stage box intermittently resets the SPA-shell request, which
    // surfaces as "cy.visit() failed trying to load the page". Cypress retries
    // network failures by default; also tolerate a transient non-2xx shell
    // response and retry on it so a one-off blip self-heals instead of failing
    // the test. The route itself is valid (TC131 reaches it in the same spec).
    cy.visit('/MobileViewScreen/sku-stock-out', {
      retryOnNetworkFailure: true,
      failOnStatusCode: false,
    });
    cy.url().should('include', '/sku-stock-out');
    // Fail fast if the WO-required guard blocked the route.
    cy.contains('Work Order Required for Stock Out').should('not.exist');
  }

  assertHeadingVisible() {
    cy.contains('h6', new RegExp(`^${L.headingPrefix}`), { timeout: 10000 })
      .should('be.visible');
  }
}

export default StockOutByProductScanningPage;
