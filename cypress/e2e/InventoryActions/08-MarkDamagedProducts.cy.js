// cypress/e2e/InventoryActions/08-MarkDamagedProducts.cy.js
//
// Spec for the Mark Damaged Products mobile screen — product-quantity
// flow (route /MobileViewScreen/mark-damaged-products?poId=...).
//
// Note: 13-InventoryActionScanDamaged.cy.js covers the *serial-scan*
// damage flow on /scanDamaged. This spec covers the distinct
// product-quantity flow that's reached from the Inventory Management →
// Mark Damaged Products tile.

import MarkDamagedProductsPage from '../../pageObjects/InventoryActions/MarkDamagedProductsPage';
import data from '../../fixtures/InventoryActions/markDamaged.json';

describe('Inventory Action — Mark Damaged Products (qty)', { tags: ['@regression'] }, () => {
  const page = new MarkDamagedProductsPage();
  let authToken;
  let purePo;
  let purePoProductName;
  let damageReason;
  let configId;
  let originalConfigJson;
  let seededDamageReason = false;

  before(() => {
    cy.iaAuthToken().then((token) => {
      authToken = token;
      expect(authToken, 'identity server returned a bearer token').to.exist;

      // Probe for a PO with a pure product that has AVAILABLE stock
      // (mark-damaged rejects a qty exceeding available). The probe now
      // returns { poNumber, productName } for a stocked product.
      cy.iaProbePoForMarkDamaged(token).then((probe) => {
        if (probe) {
          purePo = probe.poNumber;
          purePoProductName = probe.productName;
        }
      });

      // Read config; use existing damage reasons or seed one so TC116 can run.
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
        const existing = Array.isArray(config.configJson?.data?.damageReason)
          ? config.configJson.data.damageReason
          : config.configJson?.data?.damageReason
            ? [config.configJson.data.damageReason]
            : [];
        const found = existing.find((r) => r && String(r).toLowerCase() !== 'other');
        if (found) {
          damageReason = found;
          return;
        }
        const updated = {
          ...config.configJson,
          data: { ...(config.configJson?.data || {}), damageReason: ['Physical Damage'] },
        };
        cy.request({
          method: 'PATCH',
          url: `${Cypress.env('API_BASE_URL')}/configs/${configId}`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: { configJson: updated },
          failOnStatusCode: false,
          timeout: 60000,
        }).then(() => {
          damageReason = 'Physical Damage';
          seededDamageReason = true;
        });
      });
    });
  });

  after(() => {
    if (!seededDamageReason || !configId || !originalConfigJson) return;
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
    // Alias the container-assignments call so selectFirstProduct can wait
    // for it deterministically (the source dropdown only renders after
    // this fetch settles).
    cy.intercept('GET', '**/containers/product-assignments/**').as('productAssignments');
  });

  // ------------------------------------------------------------------------
  // Use Case — TC116: user marks a product as damaged with qty + reason.
  // The component (MarkDamagedProducts/index.tsx) requires a `poId` URL
  // param — without it, mounting redirects back to /MobileViewScreen.
  //
  // State note: this MUTATES QA inventory by reporting 1 unit damaged
  // against the seed product. We do not roll back — matches the existing
  // API spec convention.
  // ------------------------------------------------------------------------
  // SKILL §5: @smoke representative — only test in this file; covers the
  // full happy path of the product-qty mark-damage flow.
  it('SW-IA-TC116 — user can mark a product as damaged with qty + reason', { tags: ['@smoke'] }, function () {
    if (!purePo) {
      cy.log('No probe-able PO with pure products on QA — skipping TC116');
      this.skip();
    }
    if (!damageReason) {
      cy.log('No configured damage reasons on QA — skipping TC116');
      this.skip();
    }

    page.visit(purePo);
    // Search for the specifically-probed product that HAS available stock —
    // the first card on screen is not necessarily stocked, and mark-damage
    // rejects a qty exceeding available. Fall back to the first card only if
    // the probe couldn't name the product.
    if (purePoProductName) {
      page.searchProducts(purePoProductName);
    }
    page.selectFirstProduct();
    page.selectDamageReason(damageReason);
    page.enterQuantity(data.damageQty);
    // If the product has container assignment enabled, the Source
    // dropdown is required (MarkDamagedProducts/index.tsx:710-712).
    page.selectFirstSourceIfPresent();
    page.clickMarkDamage();
    page.assertMarkDamageSuccess();
  });
});
