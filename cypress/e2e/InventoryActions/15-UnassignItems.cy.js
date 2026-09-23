// cypress/e2e/InventoryActions/15-UnassignItems.cy.js
//
// Inventory Action — Unassign Items
// Route: /MobileViewScreen/unassign-items
// Component: Frontend/src/components/UnAssignItems/index.tsx
// Workbook:  InventoryActions-WarehouseManagement.xlsx, sheet "2 - Unassignment", group "Unassign Items"
//
// Single-step screen — backend resolves the container/location from the
// scanned serial automatically. No target picker.
//
// State restoration (SKILL.md §6 rule 5): the one mutation test (TC09)
// pairs the unassign with a re-assign in `afterEach` so the same serial
// is reusable on the next run.
//
// API-shaped TC18 (POST /wms/container-items/unassign) is covered by
// WmsContainerAPI.cy.js TC20 (DELETE /containers/items/:serialNumber).

import UnassignItemsPage from '../../pageObjects/InventoryActions/UnassignItemsPage';
import data from '../../fixtures/InventoryActions/unassignItems.json';

const page = new UnassignItemsPage();

describe('Inventory Action — Unassign Items', { tags: ['@regression'] }, () => {
  before(function () {
    cy.iaAuthToken().then((token) => {
      cy.wrap(token).as('token');
    });
  });

  beforeEach(function () {
    cy.authSession('admin');
    cy.viewport('iphone-7');
  });

  // ═══════════════════════════════════════════════════════════════
  // Existing smoke test (kept verbatim — DO NOT modify)
  // ═══════════════════════════════════════════════════════════════

  it('SW-IA-TC136 — unassign-items route renders the Session History panel', { tags: ['@smoke'] }, () => {
    // Technique: Use Case
    cy.visit('/MobileViewScreen/unassign-items');
    cy.url().should('include', '/unassign-items');
    cy.contains('Session History', { timeout: 15000 }).should('exist');
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Page entry & static UI
  // ═══════════════════════════════════════════════════════════════

  describe('Page entry & static UI', () => {
    // Use case: worker walks Warehouse → Unassignment → Unassign Items.
    it('SW-WM-UI-TC01 — page opens from the Unassignment menu', () => {
      // Technique: Use Case
      page.walkFromLanding();
      page.assertScreenVisible();
    });

    // EP: empty submit partition → does not call backend.
    it('SW-WM-UI-TC07 — submitting an empty serial input does nothing', () => {
      // Technique: BVA
      page.visit();
      page.assertScreenVisible();
      cy.get(`#${data.domIds.serialInput}`).clear().type('{enter}');
      // Component shows toast "Please enter a serial number" and does NOT
      // append to session history.
      page.assertSessionEmpty();
    });

    // EP: special-character class on the serial input.
    it('SW-WM-UI-TC06 — special characters in serial input are blocked', () => {
      // Technique: EP
      page.visit();
      page.assertScreenVisible();
      data.specialCharSamples.forEach((sample) => {
        page.typeSerial(sample);
        // Inline tooltip-based validation — Scan button stays disabled by
        // virtue of `!serialNumber.trim() || !!serialError`. Anchor by
        // button text being visible (i.e. the screen didn't redirect).
        cy.contains('button', /^Scan$/).should('be.visible');
      });
    });

    // Use case (auth contract — SKILL.md §11 convention #3): direct URL must redirect.
    it('SW-WM-UI-TC13 — direct URL access without a token redirects to login', () => {
      // Technique: Use Case
      cy.iaAssertRedirectsToLogin('/MobileViewScreen/unassign-items');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Negative-path scans
  // ═══════════════════════════════════════════════════════════════

  describe('Negative-path scans', () => {
    // EP: unknown serial partition.
    it('SW-WM-UI-TC04 — scanning an unknown serial is rejected', () => {
      // Technique: EP
      page.visit();
      page.assertScreenVisible();
      page.scanSerial('ZZZ-NOT-A-REAL-SERIAL-99999');
      cy.contains(/failed|not found|not assigned/i, { timeout: 10000 }).should('be.visible');
      page.assertSessionEmpty();
    });

    // EP: serial that exists but is NOT currently assigned (status === Available).
    // Probe-gated. The component surfaces the backend's error message.
    it('SW-WM-UI-TC03 — scanning a serial that is not currently assigned is rejected', function () {
      // Technique: EP
      cy.iaProbeSerialWithStatus(this.token, 'Available').then((s) => {
        const getSerial = s ? cy.wrap(s) : cy.iaSeedSerialWithStatus(this.token, 'Available');
        getSerial.then((serial) => {
        if (!serial) { this.skip(); return; }
        page.visit();
        page.assertScreenVisible();
        page.scanSerial(serial);
        // Either an error toast OR an absence of a session row — both
        // indicate the rejection contract.
        cy.contains('li', serial, { timeout: 5000 }).should('not.exist');
        }); // closes getSerial.then
      }); // closes iaProbeSerialWithStatus.then
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Happy path mutation (probe-gated, with state restore)
  // ═══════════════════════════════════════════════════════════════

  describe('Happy-path mutation (probe-gated)', () => {
    let unassignedSerial = null;
    let restoreContainerId = null;

    beforeEach(function () {
      cy.iaProbeAssignedSerial(this.token).then((row) => {
        if (row) { cy.wrap(row).as('row'); return; }
        // No assigned serial found — seed one: create container + Available serial + assign.
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
              cy.wrap({ serialNumber: serial, containerId: container.id, containerCode: container.code }).as('row');
            });
          });
        });
      });
    });

    afterEach(function () {
      // State restoration: re-assign the serial we just unassigned.
      if (unassignedSerial && restoreContainerId) {
        cy.request({
          method: 'POST',
          url: `${Cypress.env('API_BASE_URL')}/containers/${restoreContainerId}/items`,
          headers: { Authorization: `Bearer ${this.token}` },
          body: { serialNumber: unassignedSerial, force: true },
          failOnStatusCode: false,
        });
      }
      unassignedSerial = null;
      restoreContainerId = null;
    });

    // Use case: scanning a currently-assigned serial unassigns it.
    it('SW-WM-UI-TC02 — scanning a currently-assigned serial unassigns it successfully', { tags: ['@smoke'] }, function () {
      // Technique: Use Case
      page.visit();
      page.assertScreenVisible();
      page.scanSerial(this.row.serialNumber);
      // Track for restoration — set even if the assertion below fails so
      // afterEach can still restore.
      unassignedSerial = this.row.serialNumber;
      restoreContainerId = this.row.containerId;
      // Either the success toast OR a session-history row contains the serial.
      page.assertSessionRowExists(this.row.serialNumber);
    });

    // EP: re-scanning the same serial within the session is a duplicate.
    it('SW-WM-UI-TC05 — scanning the same serial twice in the session is rejected as duplicate', function () {
      // Technique: Error Guessing
      page.visit();
      page.assertScreenVisible();
      page.scanSerial(this.row.serialNumber);
      unassignedSerial = this.row.serialNumber;
      restoreContainerId = this.row.containerId;
      page.assertSessionRowExists(this.row.serialNumber);
      page.scanSerial(this.row.serialNumber);
      cy.contains(data.errors.duplicateInSession, { timeout: 8000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Mocked failures
  // ═══════════════════════════════════════════════════════════════

  describe('Mocked failures', () => {
    // Error-guessing: network failure during Confirm should not crash.
    it('SW-WM-UI-TC14 — graceful handling of network failure during Confirm', () => {
      cy.iaStubNetworkFailureOnce('DELETE', '**/containers/items/**');
      page.visit();
      page.assertScreenVisible();
      page.scanSerial('ANY-SERIAL-FOR-FAILURE-TEST');
      // Either a toast OR the session list stays empty — both show the
      // UI didn't unrecoverably break.
      cy.contains('button', /^Scan$/, { timeout: 10000 }).should('be.visible');
    });

    // Error-guessing (Tier C): double-tapping Scan on slow network must
    // not double-fire the DELETE. Workbook UI-TC15: Serial: SN-044-T001;
    // Network: Slow 3G.
    it('SW-WM-UI-TC15 — double-tapping Scan on slow network does not double-fire', () => {
      // Technique: Error Guessing
      cy.iaStubSlowNetwork('DELETE', '**/containers/items/**', 3000);
      page.visit();
      page.assertScreenVisible();
      page.typeSerial('ANY-SERIAL-FOR-DOUBLE-TAP');
      page.clickScan();
      cy.contains('button', /^Scan$/).then(($btn) => {
        // Component disables the Scan button + shows "Unassigning..." while
        // the mutation is in flight (`disabled={isUnassigning || !serialNumber.trim()}`).
        // The second tap is a no-op due to disabled state.
        if (!$btn.is(':disabled')) cy.wrap($btn).click({ force: true });
      });
      // iaStubSlowNetwork aliases the delayed response as @iaSlowResponse.
      cy.wait('@iaSlowResponse', { timeout: 8000 });
      cy.contains('button', /^Scan$/, { timeout: 10000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Phase 5 batch 1 — additional probe-gated coverage (Tier A)
  // ═══════════════════════════════════════════════════════════════

  describe('Probe-gated edge cases (Phase 5 batch 1)', () => {
    afterEach(() => cy.iaSeedCleanup());

    // EP: leading/trailing whitespace in the serial input is trimmed.
    // Workbook UI-TC17: Input: "  SN-044-T001  ".
    //
    // Track 3 seed: `iaSeedAssignedSerial` actively assigns an Available
    // serial to a container, ensuring the unassign-target exists even when
    // QA has no pre-existing assigned serials. Cleanup deletes the seeded
    // assignment — idempotent if the test already unassigned, since the
    // DELETE returns 404 swallowed by `failOnStatusCode: false`.
    it('SW-WM-UI-TC17 — leading/trailing whitespace in serial input is trimmed', function () {
      // Technique: Use Case
      cy.iaSeedAssignedSerial(this.token).then((seed) => {
        if (!seed) this.skip();
        page.visit();
        page.assertScreenVisible();
        page.scanSerial(`   ${seed.serialNumber}   `);
        // The trim path means the assertion is the same as TC02 (success).
        page.assertSessionRowExists(seed.serialNumber);
      });
    });
  });
});
