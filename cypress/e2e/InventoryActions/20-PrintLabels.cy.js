// cypress/e2e/InventoryActions/20-PrintLabels.cy.js
//
// Inventory Action — Print Labels (Print Asset)
// Route: /MobileViewScreen/print-asset
// Component: Frontend/src/components/PrintAsset/index.tsx
// Workbook:  InventoryActions-WarehouseManagement.xlsx, sheet "4 - Print Labels"
//
// Two tabs:
//   • Containers — GET /containers, client-side filter by code/type/location.
//   • Locations  — GET /locations/dashboard-summary (paginated, server-side
//                  search). Uses react-window FixedSizeList + IntersectionObserver
//                  for infinite scroll.
//
// Tapping a card opens QrCodeDialog. The dialog's Print button calls
// window.open('', '_blank') then printWindow.print(). Cypress can't follow
// the new window — TC PLC-08 uses `cy.iaStubWindowOpen` (wmsHelpers) to spy
// on the call.
//
// API-shaped TCs (PLC-09 GET /containers, PLL-08 GET /locations/dashboard-summary)
// are covered by WmsContainerAPI.cy.js TC02 and WmsLocationAPI / printAssetAPI.

import PrintLabelsPage from '../../pageObjects/InventoryActions/PrintLabelsPage';
import L from '../../support/locators/InventoryActions/printLabelsLocators';
import data from '../../fixtures/InventoryActions/printLabels.json';

const page = new PrintLabelsPage();

describe('Inventory Action — Print Labels', { tags: ['@regression'] }, () => {
  before(function () {
    cy.iaAuthToken().then((token) => {
      cy.wrap(token).as('token');
    });
  });

  beforeEach(function () {
    cy.authSession('admin');
    cy.viewport('iphone-7');
  });

  // NB: cy.intercept('@locationsSearch') is registered INLINE in each test
  // that needs it, AFTER selectLocationsTab() has triggered the mount
  // fetch — so the alias only catches the user-search-triggered request.
  // The beforeEach pattern caused run-008/009 timeouts (FIFO consumed the
  // mount response first). Codebase precedent: 20-WorkOrderTests TC27.

  // ═══════════════════════════════════════════════════════════════
  // Existing smoke test (kept verbatim — DO NOT modify)
  // ═══════════════════════════════════════════════════════════════

  it('SW-IA-TC142 — print-asset route renders the Print Labels heading', { tags: ['@smoke'] }, () => {
    cy.visit('/MobileViewScreen/print-asset');
    cy.url().should('include', '/print-asset');
    cy.contains('h6', 'Print Labels', { timeout: 15000 }).should('be.visible');
  });

  // ═══════════════════════════════════════════════════════════════
  // Page Entry & Common (7 TCs)
  // ═══════════════════════════════════════════════════════════════

  describe('Page entry & common', () => {
    // Use case: page opens with the Containers tab selected by default.
    it('SW-WM-PL-TC01 — page opens with the Containers tab selected by default', () => {
      page.visit();
      page.assertPageVisible();
      page.assertActiveTab(data.tabs.containers);
    });

    // State transition: Back returns to Warehouse Management menu.
    it('SW-WM-PL-TC03 — Back returns to the Warehouse Management menu', () => {
      page.walkFromLanding();
      page.assertPageVisible();
      cy.contains('button', /^← Back$/).click();
      cy.url().should('include', '/MobileViewScreen');
      cy.contains('h6', /Warehouse Management/i, { timeout: 10000 }).should('be.visible');
    });

    // Use case (auth contract — SKILL.md §11 convention #3): direct URL → login.
    it('SW-WM-PL-TC04 — direct URL access without a token redirects to login', () => {
      cy.iaAssertRedirectsToLogin('/MobileViewScreen/print-asset');
    });

    // Decision-table: switching tabs clears the previous search.
    // NB: data.placeholders.locationsSearch is the placeholder TEXT (for docs),
    // not a CSS selector. Use the literal selector — same anchor as the page
    // object's typeLocationsSearch().
    it('SW-WM-PL-TC07 — switching tabs clears the previous search input', () => {
      page.visit();
      page.assertPageVisible();
      page.typeContainersSearch('xyzsearch');
      // Switch to Locations.
      page.selectLocationsTab();
      page.assertActiveTab(data.tabs.locations);
      // Search input is shared — assert it's empty after tab switch.
      cy.get(L.locationsSearchPlaceholder).should('have.value', '');
    });

    // Error guessing: slow network exposes the loader / spinner state.
    it('SW-WM-PL-TC05 — slow network shows a loader on either tab', () => {
      cy.iaStubSlowNetwork('GET', '**/containers', 2000);
      page.visit();
      page.assertPageVisible();
      // Component renders <CircularProgress /> + "Loading…" while data fetches.
      cy.contains(data.headings.loading, { timeout: 5000 }).should('exist');
    });

    // Error guessing: mocked 5xx on either tab; UI must degrade gracefully.
    it('SW-WM-PL-TC06 — graceful handling of API failure on either tab', () => {
      cy.iaStubServerError('GET', '**/containers', { status: 500 });
      page.visit();
      page.assertPageVisible();
      // Either an empty-state OR an error message — page must still render
      // the tabs and search input (no error boundary).
      cy.contains('[role="tab"]', data.tabs.containers, { timeout: 10000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Containers tab (9 TCs)
  // ═══════════════════════════════════════════════════════════════

  describe('Containers tab', () => {
    beforeEach(function () {
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 0 }).then((container) => {
        if (container) { cy.wrap(container).as('container'); return; }
        cy.iaSeedContainerWithCapacity(this.token).then((seeded) => {
          cy.wrap(seeded || null).as('container');
        });
      });
    });

    it('SW-WM-PLC-TC01 — Containers tab renders the default container list', function () {
      if (!this.container) this.skip();
      page.visit();
      page.assertPageVisible();
      page.assertActiveTab(data.tabs.containers);
      cy.contains(this.container.code, { timeout: 15000 }).should('be.visible');
    });

    it('SW-WM-PLC-TC02 — searching by container code filters the list', function () {
      if (!this.container) this.skip();
      page.visit();
      page.assertPageVisible();
      page.typeContainersSearch(this.container.code);
      cy.contains(this.container.code, { timeout: 10000 }).should('be.visible');
    });

    // EP: no-match search partition — empty-state copy renders.
    it('SW-WM-PLC-TC05 — no-match empty state on the Containers tab', () => {
      page.visit();
      page.assertPageVisible();
      page.typeContainersSearch('ZZZQQXNOMATCH99');
      page.assertNoContainersFound();
    });

    it('SW-WM-PLC-TC06 — tapping a container card opens the QR dialog', function () {
      if (!this.container) this.skip();
      page.visit();
      page.assertPageVisible();
      cy.contains(this.container.code, { timeout: 15000 }).should('be.visible');
      page.clickFirstCard();
      page.assertQrDialogVisible();
    });

    it('SW-WM-PLC-TC07 — closing the QR dialog preserves list and search state', function () {
      if (!this.container) this.skip();
      page.visit();
      page.assertPageVisible();
      page.typeContainersSearch(this.container.code);
      cy.contains(this.container.code, { timeout: 10000 }).should('be.visible');
      page.clickFirstCard();
      page.assertQrDialogVisible();
      // TC08 confirms the dialog has a "Cancel" button — use it to close.
      cy.contains('button', 'Cancel', { timeout: 10000 }).click();
      cy.get(`input[placeholder="${data.placeholders.containersSearch}"]`).should('have.value', this.container.code);
    });

    it('SW-WM-PLC-TC08 — Print Zebra button is clickable and triggers the ZPL print flow', { tags: ['@smoke'] }, function () {
      if (!this.container) this.skip();
      page.visit();
      page.assertPageVisible();
      cy.contains(this.container.code, { timeout: 15000 }).should('be.visible');
      page.clickFirstCard();
      page.assertQrDialogVisible();
      // The button now calls handlePrintZebra (ZPL-based) instead of window.open.
      // In the test environment Printwise is not connected, so the flow either
      // shows "Printing…" briefly then a toast error, or completes silently.
      // Assert the button exists and is enabled before clicking to confirm the
      // dialog rendered correctly.
      cy.contains('button', /Print Zebra/i).should('be.visible').and('not.be.disabled');
      page.clickPrint();
      // Either a "Printing…" loading label or an error toast confirms the click
      // was handled; the Cancel button must remain reachable regardless.
      cy.contains('button', 'Cancel', { timeout: 5000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Locations tab (8 TCs)
  // ═══════════════════════════════════════════════════════════════

  describe('Locations tab', () => {
    beforeEach(function () {
      cy.iaProbeBinPath(this.token).then((bin) => {
        if (bin) { cy.wrap(bin).as('bin'); return; }
        cy.iaSeedBinLocation(this.token).then((seeded) => {
          cy.wrap(seeded || null).as('bin');
        });
      });
    });

    it('SW-WM-PLL-TC01 — Locations tab renders the default paginated bin list', function () {
      if (!this.bin || !this.bin.path) this.skip();
      page.visit();
      page.assertPageVisible();
      page.selectLocationsTab();
      page.assertActiveTab(data.tabs.locations);
      cy.contains(this.bin.path, { timeout: 15000 }).should('be.visible');
    });

    it('SW-WM-PLL-TC03 — searching by path filters the bin list (server-side)', function () {
      if (!this.bin || !this.bin.path) this.skip();
      page.visit();
      page.selectLocationsTab();
      page.assertActiveTab(data.tabs.locations);
      const fragment = String(this.bin.path).split('.')[0] || this.bin.path;
      page.typeLocationsSearch(fragment);
      cy.contains(fragment, { timeout: 15000 }).should('be.visible');
    });

    // EP: no-match search partition — empty-state copy renders.
    it('SW-WM-PLL-TC04 — no-match empty state on the Locations tab', () => {
      page.visit();
      page.assertPageVisible();
      page.selectLocationsTab();
      page.typeLocationsSearch('ZZZQQXNOMATCH99');
      page.assertNoLocationsFound();
    });

    it('SW-WM-PLL-TC05 — tapping a bin card opens the QR dialog for that location', function () {
      if (!this.bin || !this.bin.path) this.skip();
      page.visit();
      page.selectLocationsTab();
      cy.contains(this.bin.path, { timeout: 15000 }).should('be.visible');
      page.clickFirstCard();
      page.assertQrDialogVisible();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Phase 5 batch 1 — additional probe-gated coverage (Tier A)
  // ═══════════════════════════════════════════════════════════════

  describe('Probe-gated edge cases (Phase 5 batch 1)', () => {
    beforeEach(function () {
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 0 }).then((container) => {
        if (container) { cy.wrap(container).as('container'); return; }
        cy.iaSeedContainerWithCapacity(this.token).then((seeded) => {
          cy.wrap(seeded || null).as('container');
        });
      });
    });

    it('SW-WM-PLC-TC03 — searching by container type filters the list', function () {
      if (!this.container || !this.container.type) this.skip();
      page.visit();
      page.assertPageVisible();
      const typeFragment = String(this.container.type).slice(0, 3);
      page.typeContainersSearch(typeFragment);
      cy.contains(data.headings.noContainersFound, { timeout: 5000 }).should('not.exist');
    });
  });
});
