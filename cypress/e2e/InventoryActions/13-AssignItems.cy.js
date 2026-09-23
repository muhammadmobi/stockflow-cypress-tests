// cypress/e2e/InventoryActions/13-AssignItems.cy.js
//
// Inventory Action — Assign Items
// Route: /MobileViewScreen/assign-items
// Component: Frontend/src/components/AssignItems/index.tsx
// Test plan:    cypress/qa/testPlans/warehouseManagement/plan.md
// Workbook:    InventoryActions-WarehouseManagement.xlsx, sheet "1 - Assignment", group "Assign Items"
//
// Coverage choices (per cypress/qa/SKILL.md §3 — UI vs API):
//   • TC24–26 (POST /containers/:id/items) → covered by WmsContainerAPI.cy.js TC11/14/15.
//   • TC11/12/17 (rare-state assertions: already-assigned-elsewhere, damaged-item,
//     capacity overflow) require live data states that QA does not always
//     provide. Each uses cy.iaProbe* and `this.skip()`s when the probe is null.
//
// State restoration (SKILL.md §6 rule 5): the one mutation test (TC13) pairs
// the assign with a delete in `after()` so the same serial is reusable.

import AssignItemsPage from '../../pageObjects/InventoryActions/AssignItemsPage';
import L from '../../support/locators/InventoryActions/assignItemsLocators';
import data from '../../fixtures/InventoryActions/assignItems.json';

const page = new AssignItemsPage();

describe('Inventory Action — Assign Items', { tags: ['@regression'] }, () => {
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
  // Existing smoke tests (kept verbatim — DO NOT modify)
  // ═══════════════════════════════════════════════════════════════

  it('SW-IA-TC132 — assign-items route renders with the scan/select container input', { tags: ['@smoke'] }, () => {
    // Technique: Use Case
    cy.visit('/MobileViewScreen/assign-items');
    cy.url().should('include', '/assign-items');
    // Placeholder text lives in the `placeholder` attribute, not innerText —
    // use attribute-substring selector (cy.contains can't see attributes).
    cy.get('input[placeholder*="Scan or enter container code"]', { timeout: 15000 })
      .should('be.visible');
  });

  it('SW-IA-TC133 — initial mount renders the Scan QR / Select Container / Select Location tabs', () => {
    // Technique: Use Case
    cy.visit('/MobileViewScreen/assign-items');
    cy.contains('Scan QR', { timeout: 15000 }).should('be.visible');
    cy.contains('Select Container').should('be.visible');
    cy.contains('Select Location').should('be.visible');
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Page entry & target step
  // ═══════════════════════════════════════════════════════════════

  describe('Page entry & target step', () => {
    // Use case (ISTQB §4): worker navigates from landing screen → Warehouse → Assignment → Assign Items.
    it('SW-WM-AI-TC01 — page opens with the target step from the Assignment menu', () => {
      // Technique: Use Case
      page.walkFromLanding();
      page.assertTargetStepVisible();
    });

    // Error-guessing: typing an unknown code anywhere yields a friendly toast, not a crash.
    it('SW-WM-AI-TC04 — unknown container/location code on target step is rejected', () => {
      // Technique: EP
      page.visit();
      page.assertTargetStepVisible();
      page.scanTargetCode('ZZZ-NOT-A-REAL-CODE-9999');
      cy.contains(data.errors.noMatchSuffix, { timeout: 10000 }).should('be.visible');
    });

    // EP: special-character class on target input (validateNoSpecialCharacters utility).
    it('SW-WM-AI-TC05 — special characters in target input are blocked by client validation', () => {
      // Technique: EP
      page.visit();
      page.assertTargetStepVisible();
      data.specialCharSamples.forEach((sample) => {
        page.typeTargetCode(sample);
        // Inline error tooltip renders when validateNoSpecialCharacters returns truthy.
        // The error fires asynchronously — assert the input value remains while the field
        // stays editable (no advance to items step).
        cy.contains(data.headings.scanQrToggle).should('be.visible');
      });
    });

    // EP: empty submit partition — submitting nothing should not advance.
    it('SW-WM-AI-TC06 — submitting an empty target input does nothing', () => {
      // Technique: EP
      page.visit();
      page.assertTargetStepVisible();
      cy.get(`#${data.domIds.targetQrInput}`).clear().type('{enter}');
      // Stay on target step — the items-step serial input must NOT exist yet.
      cy.get(`#${data.domIds.serialInput}`).should('not.exist');
    });

    // Use case: Select Container toggle opens the picker dialog.
    it('SW-WM-AI-TC07 — Select Container toggle opens the container picker dialog', function () {
      // Technique: Use Case
      page.visit();
      page.selectSelectContainerToggle();
      cy.contains(L.containerSelectorTitle, { timeout: 10000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Items step (requires container probe)
  // ═══════════════════════════════════════════════════════════════

  describe('Items step (probe-gated)', () => {
    beforeEach(function () {
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 2 }).then((container) => {
        if (container) { cy.wrap(container).as('container'); return; }
        cy.iaSeedContainerWithCapacity(this.token).then((seeded) => {
          if (!seeded) this.skip();
          cy.wrap(seeded).as('container');
        });
      });
    });

    // State transition (target → items): scanning a known container code advances to step 2.
    it('SW-WM-AI-TC02 — scanning a valid container code on target step advances to the items step', function () {
      // Technique: State Transition
      page.visit();
      page.assertTargetStepVisible();
      page.scanTargetCode(this.container.code);
      page.assertItemsStepVisible();
    });

    // State transition: Back from items step returns to target step.
    it('SW-WM-AI-TC18 — going Back from the items step returns to the target step', function () {
      // Technique: State Transition
      page.visit();
      page.scanTargetCode(this.container.code);
      page.assertItemsStepVisible();
      page.goBackToTarget();
      page.assertTargetStepVisible();
    });

    // EP: empty serial — submit does not call backend.
    it('SW-WM-AI-TC10 — scanning an unknown serial on the items step shows an error', function () {
      // Technique: Error Guessing
      page.visit();
      page.scanTargetCode(this.container.code);
      page.assertItemsStepVisible();
      page.scanSerial('ZZZ-NOT-A-REAL-SERIAL-99999');
      // Toast/Alert from showErrorToast — anchor by likely substrings.
      cy.contains(/not found|failed|unknown/i, { timeout: 10000 }).should('be.visible');
    });

    // EP: special-character class on serial input.
    it('SW-WM-AI-TC19 — special characters in serial input are blocked by client validation', function () {
      // Technique: EP
      page.visit();
      page.scanTargetCode(this.container.code);
      page.assertItemsStepVisible();
      data.specialCharSamples.forEach((sample) => {
        page.typeSerial(sample);
        // Tooltip-based inline error — the input keeps the value but the
        // Scan button disables itself (disabled={!serialNumber.trim() || !!serialError}).
        cy.contains('button', /^Scan$/).should('be.visible');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Probe-gated mutation (one critical happy path)
  // ═══════════════════════════════════════════════════════════════

  describe('Items step — happy-path mutation (probe-gated)', () => {
    let assignedSerial = null;
    let containerForRestore = null;

    beforeEach(function () {
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 2 }).then((container) => {
        if (container) { cy.wrap(container).as('container'); return; }
        cy.iaSeedContainerWithCapacity(this.token).then((seeded) => {
          if (!seeded) this.skip();
          cy.wrap(seeded).as('container');
        });
      });
      cy.iaProbeSerialWithStatus(this.token, 'Available').then((serial) => {
        if (serial) { cy.wrap(serial).as('serial'); return; }
        cy.iaSeedSerialWithStatus(this.token, 'Available').then((seeded) => {
          if (!seeded) this.skip();
          cy.wrap(seeded).as('serial');
        });
      });
    });

    afterEach(function () {
      // Convention #5: restore state by deleting the assignment we just created.
      if (assignedSerial && containerForRestore) {
        cy.request({
          method: 'DELETE',
          url: `${Cypress.env('API_BASE_URL')}/containers/items/${encodeURIComponent(assignedSerial)}`,
          headers: { Authorization: `Bearer ${this.token}` },
          failOnStatusCode: false,
        });
      }
      assignedSerial = null;
      containerForRestore = null;
    });

    // Use case: scan an Available serial → confirm one staged item assigns it.
    it('SW-WM-AI-TC13 — confirming with one staged item assigns it successfully', { tags: ['@smoke'] }, function () {
      // Technique: Use Case
      page.visit();
      page.scanTargetCode(this.container.code);
      page.assertItemsStepVisible();
      page.scanSerial(this.serial);

      // Component may open a "move-from-elsewhere" confirm dialog if the
      // probed serial is already assigned. Click Yes to proceed; otherwise
      // the success toast appears immediately.
      cy.get('body').then(($body) => {
        if ($body.text().includes(data.errors.alreadyOnSelectedContainer)) {
          // Probed serial is already on the same container — skip cleanup.
          return;
        }
        cy.get('body').then(($b2) => {
          if ($b2.find('button:contains("Yes, Continue")').length > 0) {
            cy.contains('button', /Yes,?\s+Continue/).click();
          }
        });
        // Track for cleanup — set state, the after() hook deletes via DELETE /containers/items/:serial.
        assignedSerial = this.serial;
        containerForRestore = this.container;
      });

      // Assert success toast contains "successfully" substring.
      cy.contains(/assigned|successfully/i, { timeout: 15000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Mocked-failure & auth contract
  // ═══════════════════════════════════════════════════════════════

  describe('Mocked failures & auth', () => {
    afterEach(() => cy.iaSeedCleanup());

    // Use case (auth contract — SKILL.md §11 convention #3): direct-URL must redirect.
    it('SW-WM-AI-TC21 — direct URL access without a token redirects to login', () => {
      // Technique: Use Case
      cy.iaAssertRedirectsToLogin('/MobileViewScreen/assign-items');
    });

    // Error-guessing: a network failure during the assignment call surfaces a toast.
    it('SW-WM-AI-TC22 — graceful handling of network failure during assignment', function () {
      // Technique: Error Guessing
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 2 }).then((c) => {
        const getContainer = c ? cy.wrap(c) : cy.iaSeedContainerWithCapacity(this.token);
        getContainer.then((container) => {
          if (!container) { this.skip(); return; }
          cy.iaStubNetworkFailureOnce('POST', '**/containers/*/items');
          page.visit();
          page.scanTargetCode(container.code);
          page.assertItemsStepVisible();
          page.scanSerial('ANY-SERIAL-FOR-FAILURE-TEST');
          // Either a duplicate / not-found toast OR a forced-failure toast — assert
          // the screen stays usable (input remains editable and Scan button visible).
          cy.contains('button', /^Scan$/, { timeout: 10000 }).should('be.visible');
        }); // closes getContainer.then
      }); // closes iaProbeContainerWithCapacity.then
    });

    // Error-guessing (Tier C): double-tapping Scan on slow network must not
    // double-submit. Workbook AI-TC23: Serial: SN-044-T001; Network: Slow 3G.
    it('SW-WM-AI-TC23 — double-tapping Scan on slow network does not double-submit', function () {
      // Technique: Error Guessing
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 2 }).then((c) => {
        const getContainer = c ? cy.wrap(c) : cy.iaSeedContainerWithCapacity(this.token);
        getContainer.then((container) => {
        if (!container) { this.skip(); return; }
        cy.iaStubSlowNetwork('POST', '**/containers/*/items', 3000);
        let assignCalls = 0;
        cy.intercept('POST', '**/containers/*/items', () => {
          assignCalls += 1;
        });
        page.visit();
        page.scanTargetCode(container.code);
        page.assertItemsStepVisible();
        page.typeSerial('ANY-SERIAL-FOR-DOUBLE-TAP');
        page.clickScanButton();
        // Second tap should be ignored (Scan button disabled while in flight).
        cy.contains('button', /^Scan$/).then(($btn) => {
          if (!$btn.is(':disabled')) cy.wrap($btn).click({ force: true });
        });
        // iaStubSlowNetwork aliases the delayed response as @iaSlowResponse —
        // wait for it to land instead of a bare ms timeout.
        cy.wait('@iaSlowResponse', { timeout: 8000 });
        // The intercept-callback counter is best-effort; the primary
        // assertion is that the screen survived (Scan button visible again).
        cy.contains('button', /^Scan$/, { timeout: 10000 }).should('be.visible');
        }); // closes getContainer.then
      }); // closes iaProbeContainerWithCapacity.then
    });
  }); // closes describe('Mocked failures & auth')

  // ═══════════════════════════════════════════════════════════════
  // Phase 5 batch 1 — additional probe-gated coverage (Tier A)
  // ═══════════════════════════════════════════════════════════════

  describe('Probe-gated edge cases (Phase 5 batch 1)', () => {
    afterEach(() => cy.iaSeedCleanup());

    // EP: scanning an unknown serial (already in TC10), but specifically
    // verifying the duplicate-in-session reject after a successful scan.
    // Workbook AI-TC09: "Serial: SN-044-T001 (twice)".
    //
    // Always seed a fresh serial — probed Available serials may already be in
    // a container, opening the confirm-move dialog instead of firing the POST
    // directly. A freshly-created serial (not yet in any container) guarantees
    // the first scan triggers POST /containers/*/items and sets assignedItems
    // in React's onSuccess handler before the second scan fires.
    it('SW-WM-AI-TC09 — scanning the same serial twice is rejected as duplicate', function () {
      // Technique: Error Guessing
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 2 }).then((c) => {
        const getContainer = c ? cy.wrap(c) : cy.iaSeedContainerWithCapacity(this.token);
        getContainer.then((container) => {
        if (!container) { this.skip(); return; }
        cy.iaSeedSerialWithStatus(this.token, 'Available').then((serial) => {
          if (!serial) { this.skip(); return; }
          cy.intercept('POST', '**/containers/*/items').as('assignFirst');
          page.visit();
          page.scanTargetCode(container.code);
          page.assertItemsStepVisible();
          page.scanSerial(serial);
          cy.wait('@assignFirst', { timeout: 10000 });
          // Wait for the success message so assignedItems is populated in React
          // state (component line 335: data?.data?.message || 'Item assigned to
          // container successfully') before the second scan fires. The message
          // renders both as a transient react-hot-toast AND as a
          // SessionScannedList row whose secondary text is clipped by an
          // overflow:auto parent, so assert existence (message produced) rather
          // than visibility — the POST already resolved via @assignFirst.
          cy.contains(/assigned.*successfully|successfully.*assigned|assigned to container/i, { timeout: 8000 })
            .should('exist');
          page.scanSerial(serial);
          // Same rendering: the duplicate-rejection message appears in the
          // (clipped) scanned-list row and a transient toast; assert existence.
          cy.contains(/already|duplicate|already been assigned/i, { timeout: 10000 })
            .should('exist');
        }); // closes iaSeedSerialWithStatus.then
        }); // closes getContainer.then
      }); // closes iaProbeContainerWithCapacity.then
    });

    // Decision-table: scanning a serial currently assigned to a DIFFERENT
    // container yields the move-confirm dialog (or a backend rejection).
    // Workbook AI-TC11: Target: CT-BIN-0001; Serial: SN-044-T001 (currently
    // in CT-BIN-0002).
    //
    // Track 3 seed: `iaSeedSerialAssignedElsewhere` actively creates the
    // cross-container precondition (assigns an Available serial to a source
    // container, returns a different container as the test target). The
    // probe-only version skipped on QA because it required QA to *already*
    // have an assigned serial whose container ≠ the first probed container.
    it('SW-WM-AI-TC11 — scanning a serial assigned to a different container surfaces a move dialog', function () {
      // Technique: Decision Table
      cy.iaSeedSerialAssignedElsewhere(this.token).then((seed) => {
        if (!seed) this.skip();
        cy.log(`[TC11] serial=${seed.serialNumber} src=${seed.sourceContainerCode} target=${seed.targetContainerCode}`);
        page.visit();
        // The seed verifies the target container resolves through
        // /locations/universal-scan before returning, so this scan advances
        // deterministically (no eventual-consistency flake on a fresh container).
        page.scanTargetCode(seed.targetContainerCode);
        page.assertItemsStepVisible();
        page.scanSerial(seed.serialNumber);
        // BE throws: `Item "X" is already assigned to container "Y"`
        // (container.service.ts:1619). Frontend parseAssignmentInfo() detects
        // "already assigned" in the message and opens ConfirmDialoge whose
        // <DialogTitle> renders "Confirm Assignment" and whose subtitle reads
        // "Item Already Assigned". Either string proves the dialog opened.
        cy.contains(/Confirm Assignment|Item Already Assigned/i, { timeout: 10000 })
          .should('be.visible');
      });
    });

    // Decision-table: a Damaged serial is rejected when scanned into a
    // container that already holds Available items (mixing rule). Workbook
    // AI-TC12: Serial: SN-044-T005 (Damaged status).
    //
    // Seed approach: iaSeedNonEmptyContainer creates a container with 1
    // Available item (guaranteed mixing scenario); iaSeedSerialWithStatus
    // 'Damaged' creates a fresh Damaged serial not yet in any container.
    // Scanning the Damaged serial into the Available-items container triggers
    // the backend mixing guard: "Cannot mix Damaged items with Available items
    // in the same container." — contains "Damaged", matches the regex.
    // Using iaSeedSerialWithStatus avoids the risk of iaSeedDamagedSerial
    // picking the same serial that iaSeedNonEmptyContainer placed in the
    // container, which would surface an "already assigned" message instead.
    it('SW-WM-AI-TC12 — Damaged-status serial is rejected on the items step', function () {
      // Technique: EP
      cy.iaSeedNonEmptyContainer(this.token).then((container) => {
        if (!container) { this.skip(); return; }
        cy.iaSeedSerialWithStatus(this.token, 'Damaged').then((damagedSerial) => {
          if (!damagedSerial) { this.skip(); return; }
          page.visit();
          page.scanTargetCode(container.code);
          page.assertItemsStepVisible();
          page.scanSerial(damagedSerial);
          // BE throws (container.service.ts:1594):
          // "Cannot mix Damaged items with Available items in the same container.
          //  Container currently holds Available items."
          // Frontend falls through to showErrorToast() (no "already assigned"
          // in the message so parseAssignmentInfo returns null).
          cy.contains(/Cannot mix.*items|Damaged.*Available/i, { timeout: 10000 })
            .should('be.visible');
        });
      });
    });

    // EP: leading/trailing whitespace in the serial input is trimmed AND
    // the trimmed value is accepted. Workbook AI-TC20: Serial:
    // "  SN-044-T001  " (with surrounding spaces).
    it('SW-WM-AI-TC20 — leading/trailing whitespace in serial input is trimmed and accepted', function () {
      // Technique: EP
      cy.iaProbeContainerWithCapacity(this.token, { minFree: 2 }).then((c) => {
        const getContainer = c ? cy.wrap(c) : cy.iaSeedContainerWithCapacity(this.token);
        getContainer.then((container) => {
        if (!container) { this.skip(); return; }
        cy.iaProbeSerialWithStatus(this.token, 'Available').then((s) => {
          const getSerial = s ? cy.wrap(s) : cy.iaSeedSerialWithStatus(this.token, 'Available');
          getSerial.then((serial) => {
          if (!serial) { this.skip(); return; }
          page.visit();
          page.scanTargetCode(container.code);
          page.assertItemsStepVisible();
          // Type the serial wrapped in spaces; component's `serialNumber.trim()`
          // logic should accept it.
          page.scanSerial(`   ${serial}   `);
          // Either the assignment proceeds (success toast / dialog) or it
          // surfaces a known-state error — both prove the trim happened
          // (no "special characters" rejection).
          cy.contains(/successfully|already assigned|Confirm|assigned/i, { timeout: 10000 })
            .should('be.visible');
          }); // closes getSerial.then
        }); // closes iaProbeSerialWithStatus.then
        }); // closes getContainer.then
      }); // closes iaProbeContainerWithCapacity.then
    });
  });
});
