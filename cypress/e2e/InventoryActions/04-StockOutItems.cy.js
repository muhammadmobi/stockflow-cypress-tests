// cypress/e2e/InventoryActions/04-StockOutItems.cy.js
//
// Specs for the Stock Out Items mobile screen
// (route /StockOutBySerialNumber). Reached via Inventory Actions →
// Stock Out → Stock Out Items.
//
// Component: Frontend/src/components/Item/MobileViewSeperateStockOut.tsx.
//
// Scope: form-input UI behaviour and validation guards before the user
// reaches step 1 (the scan view). The Available + Sold happy path
// (SW-IA-TC85) is owned by `cypress/e2e/12-InventoryActionStockOut.cy.js`
// — see cypress/qa/testPlans/inventoryActions/coverage.md.

import StockOutItemsPage from '../../pageObjects/InventoryActions/StockOutItemsPage';
import data from '../../fixtures/InventoryActions/stockOutItems.json';

describe('Inventory Action — Stock Out Items', { tags: ['@regression'] }, () => {
  const page = new StockOutItemsPage();
  let authToken;
  let configId;
  let originalConfigJson;
  let seededStockOutReason = false;

  before(() => {
    cy.iaAuthToken().then((token) => {
      authToken = token;
      expect(authToken, 'identity server returned a bearer token').to.exist;
      // Ensure at least one stockOutReason is configured; seed one if absent.
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
        const existing = config.configJson?.data?.stockOutReason || [];
        if ((Array.isArray(existing) ? existing : [existing]).filter(Boolean).length > 0) return;
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
        }).then(() => { seededStockOutReason = true; });
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
  });

  // ------------------------------------------------------------------------
  // EP — Equivalence Partitioning on the configured reasons list.
  // The reasons dropdown is populated from /configs?type=general
  // (configJson.data.stockOutReason). We probe the live list and assert
  // every configured reason renders as an option.
  // ------------------------------------------------------------------------
  it('SW-IA-TC80 — configured reasons list appears in the Stock Out Items dropdown', function () {
    // Technique: EP
    cy.iaProbeStockOutReasons(authToken).then((reasons) => {
      if (!reasons || reasons.length === 0) {
        cy.log('[TC80] before() seed did not produce reasons — skipping');
        this.skip();
      }
      page.openFromSideNav();
      page.assertReasonOptionsContain(reasons);
    });
  });

  // ------------------------------------------------------------------------
  // Use Case — typing description text is preserved in the textarea.
  // Augments existing 12-InventoryActionStockOut coverage (which types but
  // does not assert the resulting field value).
  // ------------------------------------------------------------------------
  it('SW-IA-TC82 — description text is accepted and reflected in the textarea', () => {
    page.openFromSideNav();
    page.typeDescription(data.sampleDescription);
    page.assertDescriptionValue(data.sampleDescription);
  });

  // ------------------------------------------------------------------------
  // EP — Reference Number field accepts a numeric value.
  // ------------------------------------------------------------------------
  it('SW-IA-TC83 — reference number field accepts a numeric value', () => {
    page.openFromSideNav();
    page.typeReferenceNumber(data.sampleReferenceNumber);
    page.assertReferenceNumberValue(data.sampleReferenceNumber);
  });

  // ------------------------------------------------------------------------
  // Decision Table — clicking Next without a reason triggers either the
  // toast 'Select a reason before continuing to scan.' or the field
  // helper text 'Reason is required' (or both — RHF rule + addError).
  // ------------------------------------------------------------------------
  // SKILL §5: @smoke representative — TC84 guards the form before the scan
  // step; a regression here breaks the entire stock-out flow.
  it('SW-IA-TC84 — clicking Next without selecting a reason shows the validation error', { tags: ['@smoke'] }, () => {
    page.openFromSideNav();
    page.clickNext();
    page.assertReasonRequiredError();
  });
});
