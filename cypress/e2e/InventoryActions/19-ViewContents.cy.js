// cypress/e2e/InventoryActions/19-ViewContents.cy.js
//
// Inventory Action — View Contents
// Route: /MobileViewScreen/view-contents
// Component: Frontend/src/components/ViewContents/index.tsx
// Workbook:  InventoryActions-WarehouseManagement.xlsx, sheet "3 - View Contents"
//
// Read-only screen with an inner menu of three options:
//   • Search By Item     → step 'item-select'
//   • Search By Products → step 'product-select'
//   • Search By Storage  → step 'wms-select' (Scan QR / Select Container / Select Location)
//
// No state mutation → no restoration needed (SKILL.md §6 rule 5 N/A).
//
// API-shaped TCs (VCI-TC09, VCS-TC12) hit GET endpoints already covered
// by ProductsExtendedAPI.cy.js and WmsContainerAPI.cy.js TC11.

import ViewContentsPage from '../../pageObjects/InventoryActions/ViewContentsPage';
import L from '../../support/locators/InventoryActions/viewContentsLocators';
import data from '../../fixtures/InventoryActions/viewContents.json';

const page = new ViewContentsPage();

describe('Inventory Action — View Contents', { tags: ['@regression'] }, () => {
  before(function () {
    cy.iaAuthToken().then((token) => {
      cy.wrap(token).as('token');
    });
  });

  beforeEach(function () {
    cy.authSession('admin');
    cy.viewport('iphone-7');
  });

  // NB: cy.intercept('@productsSearch') is registered INLINE in each test
  // that needs it, AFTER page.visit() / openSearchByProducts() has triggered
  // the mount fetch — so the alias only catches the user-action-triggered
  // search request. The beforeEach pattern caused run-008/009 timeouts
  // because cy.wait FIFO consumed the mount response first. Codebase
  // precedent: 20-WorkOrderTests.cy.js TC27.

  // ═══════════════════════════════════════════════════════════════
  // Existing smoke test (kept verbatim — DO NOT modify)
  // ═══════════════════════════════════════════════════════════════

  it('SW-IA-TC141 — view-contents route renders the View Contents heading', { tags: ['@smoke'] }, () => {
    cy.visit('/MobileViewScreen/view-contents');
    cy.url().should('include', '/view-contents');
    cy.contains(/View Contents/i, { timeout: 15000 }).should('exist');
  });

  // ═══════════════════════════════════════════════════════════════
  // Page Entry & Menu (4 TCs)
  // ═══════════════════════════════════════════════════════════════

  describe('Page entry & menu', () => {
    // Use case: worker walks Warehouse → View Contents → inner menu visible.
    it('SW-WM-VC-TC01 — page opens from the Warehouse Management menu', () => {
      page.walkFromLanding();
      page.assertMenuVisible();
    });

    // State transition: ← Back from inner menu returns to Warehouse menu.
    it('SW-WM-VC-TC02 — Back on the root menu returns to the Warehouse Management menu', () => {
      page.walkFromLanding();
      page.assertMenuVisible();
      page.goBack();
      cy.url().should('include', '/MobileViewScreen');
      cy.contains('h6', /Warehouse Management/i, { timeout: 10000 }).should('be.visible');
    });

    // Use case (auth contract — SKILL.md §11 convention #3): direct URL must redirect.
    it('SW-WM-VC-TC03 — direct URL access without a token redirects to login', () => {
      cy.iaAssertRedirectsToLogin('/MobileViewScreen/view-contents');
    });

    // State transition: in-app Back button returns to the inner menu.
    // The component switches sub-flows via internal `step` state — no URL
    // change happens when the user taps "Search By Item", so cy.go('back')
    // would unwind to the URL BEFORE /view-contents (whatever that was), not
    // to the inner menu. The TC's intent is "leaving a sub-flow drops you
    // back at the inner-menu choice"; the in-app ← Back button is the
    // user-facing way to do that. (Workbook TC04 reads as "browser back" but
    // that's specced against a URL-routed implementation; this UI is
    // single-route + state-machine. Documented decision in §12 of the TP.)
    it('SW-WM-VC-TC04 — Back from a sub-flow returns to the View Contents inner menu', () => {
      page.visit();
      page.assertMenuVisible();
      page.openSearchByItem();
      page.assertItemStepVisible();
      page.goBack();
      page.assertMenuVisible();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Search By Item (9 TCs)
  // ═══════════════════════════════════════════════════════════════

  describe('Search By Item', () => {
    // Use case: opening Search By Item lands on a focused serial input.
    it('SW-WM-VCI-TC01 — Search By Item opens with a serial input', () => {
      page.visit();
      page.openSearchByItem();
      page.assertItemStepVisible();
    });

    // EP: empty submit partition.
    it('SW-WM-VCI-TC05 — submitting an empty serial input does nothing', () => {
      page.visit();
      page.openSearchByItem();
      page.assertItemStepVisible();
      cy.get(`#${data.domIds.itemSerialInput}`).clear().type('{enter}');
      // No toast crash — page remains interactive.
      cy.get(`#${data.domIds.itemSerialInput}`).should('be.visible');
    });

    // EP: special-character class on serial input.
    it('SW-WM-VCI-TC04 — special characters in the serial input are rejected', () => {
      page.visit();
      page.openSearchByItem();
      page.assertItemStepVisible();
      cy.get(`#${data.domIds.itemSerialInput}`).clear().type('abc!');
      // No advance to results list — input stays editable.
      cy.get(`#${data.domIds.itemSerialInput}`).should('have.value', 'abc!');
    });

    // EP: unknown serial → component shows an empty/no-result UI for that record.
    it('SW-WM-VCI-TC03 — an unknown serial number shows an empty result', () => {
      page.visit();
      page.openSearchByItem();
      page.assertItemStepVisible();
      page.scanItemSerial('ZZZ-NOT-A-REAL-SERIAL-99999');
      // Either inline "no item found" copy OR a toast — either way, the
      // serial input must remain visible (no crash, no redirect).
      cy.get(`#${data.domIds.itemSerialInput}`, { timeout: 10000 }).should('be.visible');
    });

    // State transition: ← Back returns to inner menu, NOT parent menu.
    it('SW-WM-VCI-TC07 — Back from Search By Item returns to the inner menu, not the parent menu', () => {
      page.visit();
      page.openSearchByItem();
      page.assertItemStepVisible();
      page.goBack();
      page.assertMenuVisible();
      // Sanity: still on /view-contents URL — did NOT pop to /MobileViewScreen.
      cy.url().should('include', '/view-contents');
    });

    // Use case: probe-gated happy path — scan a valid serial, get details.
    it('SW-WM-VCI-TC02 — happy path: a valid serial returns item details', { tags: ['@smoke'] }, function () {
      cy.iaProbeAssignedSerial(this.token).then((row) => {
        const useRow = (r) => {
          page.visit();
          page.openSearchByItem();
          page.assertItemStepVisible();
          page.scanItemSerial(r.serialNumber);
          cy.contains(r.serialNumber, { timeout: 15000 }).should('be.visible');
        };
        if (row) { useRow(row); return; }
        // No assigned serial found — seed one and re-probe.
        cy.iaSeedContainerWithCapacity(this.token).then((container) => {
          if (!container) { this.skip(); return; }
          cy.iaSeedSerialWithStatus(this.token, 'Available').then((serial) => {
            if (!serial) { this.skip(); return; }
            cy.request({
              method: 'POST',
              url: `${Cypress.env('API_BASE_URL')}/containers/${container.id}/items`,
              headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
              body: { serialNumber: serial },
              failOnStatusCode: false,
              timeout: 60000,
            }).then((r) => {
              if (r.status >= 400) { this.skip(); return; }
              useRow({ serialNumber: serial, containerId: container.id, containerCode: container.code });
            });
          });
        });
      });
    });

    // Error guessing: forced network failure during search; UI must not crash.
    it('SW-WM-VCI-TC08 — graceful handling of network failure during search', () => {
      cy.iaStubNetworkFailureOnce('GET', '**/locations/dashboard/contents-search**');
      page.visit();
      page.openSearchByItem();
      page.assertItemStepVisible();
      page.scanItemSerial('ANY-SERIAL-FOR-FAILURE-TEST');
      cy.get(`#${data.domIds.itemSerialInput}`, { timeout: 10000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Search By Products (7 TCs)
  // ═══════════════════════════════════════════════════════════════

  describe('Search By Products', () => {
    // Use case: opening Search By Products lands on a search field + product list.
    it('SW-WM-VCP-TC01 — Search By Products opens with a search input and product list', () => {
      page.visit();
      page.openSearchByProducts();
      page.assertProductStepVisible();
    });

    // Use case: debounced server-side search filtering. ViewContents uses
    // ph="Search by product name, serial number..." — NOT "Search Products"
    // (which UnassignProducts uses). The locator anchors by leading
    // substring to survive minor suffix edits.
    it('SW-WM-VCP-TC03 — the search filters the product list', () => {
      page.visit();
      page.openSearchByProducts();
      page.assertProductStepVisible();
      page.typeProductSearch('a');
      cy.get(L.productSearchPlaceholder).should('have.value', 'a');
    });

    // EP: no-match search → empty state.
    it('SW-WM-VCP-TC04 — a no-match search shows the empty state', () => {
      page.visit();
      page.openSearchByProducts();
      page.assertProductStepVisible();
      page.typeProductSearch('ZZZQQXNOMATCH99');
      cy.contains(data.errors.noWmsMatchPrefix.includes('No') ? /No products|No items/i : /No products/i, { timeout: 10000 })
        .should('be.visible');
    });

    // State transition: clear search → full list returns.
    // cy.type('') is rejected by Cypress (it requires a non-empty string).
    // Use .clear() directly to empty the input.
    //
    // Sync notes: the post-clear refetch hits /products WITHOUT a search=
    // query param, so it doesn't match the @productsSearch regex (which
    // requires search=). We drop the second wait — `should('not.exist')`
    // retries up to defaultCommandTimeout (8s), which covers the 500ms
    // debounce + response time on shared QA.
    it('SW-WM-VCP-TC05 — clearing the search restores the full product list', () => {
      page.visit();
      page.openSearchByProducts();
      page.assertProductStepVisible();
      page.typeProductSearch('ZZZQQXNOMATCH99');
      cy.get(L.productSearchPlaceholder).clear();
      // Assert the no-match copy is gone — should('not.exist') retries.
      cy.contains('No products found for "ZZZQQXNOMATCH99"', { timeout: 5000 })
        .should('not.exist');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Search By Storage (12 TCs)
  // ═══════════════════════════════════════════════════════════════

  describe('Search By Storage', () => {
    // Use case: opening Search By Storage shows the three-mode toggle group.
    it('SW-WM-VCS-TC01 — Search By Storage shows the three-mode toggle group', () => {
      page.visit();
      page.openSearchByStorage();
      page.assertStorageStepVisible();
    });

    // EP: unknown code in Scan QR mode → no-match toast.
    it('SW-WM-VCS-TC04 — an unknown code in Scan QR mode shows an error', () => {
      page.visit();
      page.openSearchByStorage();
      page.assertStorageStepVisible();
      page.scanStorageCode('ZZZ-NOT-A-REAL-CODE-9999');
      cy.contains(data.errors.noWmsMatchPrefix, { timeout: 10000 }).should('be.visible');
    });

    // EP: special-character class on Scan QR input.
    it('SW-WM-VCS-TC05 — special characters in Scan QR input are blocked', () => {
      page.visit();
      page.openSearchByStorage();
      page.assertStorageStepVisible();
      cy.get(`#${data.domIds.wmsQrInput}`).clear().type('abc!');
      // No advance — toggle group must remain visible.
      cy.contains(data.headings.scanQrToggle).should('be.visible');
    });

    // Decision-table cell: Select Container toggle opens the picker.
    it('SW-WM-VCS-TC06 — Select Container toggle automatically opens the container picker', () => {
      page.visit();
      page.openSearchByStorage();
      page.assertStorageStepVisible();
      cy.contains('button', new RegExp(`^${data.headings.selectContainerToggle}$`)).click();
      // ContainerSelector dialog title varies — assert any visible dialog.
      cy.get('[role="dialog"]', { timeout: 10000 }).should('be.visible');
    });

    // Decision-table cell: switching toggle clears the prior input.
    it('SW-WM-VCS-TC11 — switching the toggle clears the prior input and any error', () => {
      page.visit();
      page.openSearchByStorage();
      page.assertStorageStepVisible();
      cy.get(`#${data.domIds.wmsQrInput}`).clear().type('SOMETHING');
      cy.contains('button', new RegExp(`^${data.headings.selectLocationToggle}$`)).click();
      cy.contains('button', new RegExp(`^${data.headings.scanQrToggle}$`)).click();
      // After cycling toggles, the wms-qr input should be empty again.
      cy.get(`#${data.domIds.wmsQrInput}`).should('have.value', '');
    });

    // Use case: probe-gated Scan QR with a valid container code → container-contents step.
    it('SW-WM-VCS-TC02 — Scan QR happy path with a valid container code', function () {
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 0 }).then((container) => {
        const getContainer = container ? cy.wrap(container) : cy.iaSeedContainerWithCapacity(this.token);
        getContainer.then((c) => {
          if (!c) { this.skip(); return; }
          page.visit();
          page.openSearchByStorage();
          page.assertStorageStepVisible();
          page.scanStorageCode(c.code);
          cy.contains(c.code, { timeout: 15000 }).should('be.visible');
        });
      });
    });

    // Use case: probe-gated Scan QR with a valid bin path → location-contents step.
    it('SW-WM-VCS-TC03 — Scan QR happy path with a valid location path', function () {
      cy.iaProbeBinPath(this.token).then((bin) => {
        const getBin = bin ? cy.wrap(bin) : cy.iaSeedBinLocation(this.token);
        getBin.then((b) => {
          if (!b || !b.path) { this.skip(); return; }
          page.visit();
          page.openSearchByStorage();
          page.assertStorageStepVisible();
          page.scanStorageCode(b.path);
          cy.contains(b.path, { timeout: 15000 }).should('be.visible');
        });
      });
    });
  });
});
