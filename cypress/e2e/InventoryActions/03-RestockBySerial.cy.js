// cypress/e2e/InventoryActions/03-RestockBySerial.cy.js
//
// Specs for the Restock-by-serial mobile screen (route /restock, reached via
// Inventory Actions → Inventory Management → Restock).
//
// Scope: 7-row InventoryStatus decision-table:
//   Damaged / Disputed / StockedOut / Missing → success (item flips to Available).
//   Incoming / Available / Reserved → error.
//   (Backend allows Missing to be restocked and updates receivedQuantity accordingly.)
//
// SW-IA-TC110 (Damaged → success) is marked Augment in the coverage map —
// the existing 15-InvActionRestock.cy.js exercises the same path but does
// not assert the source-status precondition. Here we probe the source
// status before scanning so the precondition is in-spec.
//
// State restoration (per cypress/qa/SKILL.md §6 rule 5): success-path tests
// flip an item from source-status → Available, which would deplete QA's
// pool of probe-able source-status serials over repeated runs. To keep the
// matrix evergreen, each success-path test rolls the serial BACK to its
// source status in `after()` via /products/mark-status (see
// cy.iaSetSerialStatus). The error-path tests don't need restoration
// because their action does not change the underlying serial's status.
//
// The rollback is fire-and-forget on a best-effort basis — if it fails
// (e.g. transient API error) the next run's probe simply finds a
// different candidate.

import RestockBySerialPage from '../../pageObjects/InventoryActions/RestockBySerialPage';
import data from '../../fixtures/InventoryActions/restockBySerial.json';

describe('Inventory Action — Restock by serial number', { tags: ['@regression'] }, () => {
  const page = new RestockBySerialPage();
  let authToken;
  // Populated in before() — keyed by status string.
  const serialsByStatus = {};

  before(function () {
    cy.iaAuthToken().then((token) => {
      authToken = token;
      expect(authToken, 'identity server returned a bearer token').to.exist;

      // Collect all unique statuses needed by both success and error paths.
      const needed = [
        ...data.successPaths.map((r) => r.sourceStatus),
        ...data.errorPaths.map((r) => r.sourceStatus),
      ];

      needed.forEach((status) => {
        cy.iaProbeSerialWithStatus(token, status).then((found) => {
          if (found) {
            serialsByStatus[status] = found;
            cy.log(`[before] ${status}: found ${found}`);
            return;
          }
          cy.iaSeedSerialWithStatus(token, status).then((seeded) => {
            if (seeded) {
              serialsByStatus[status] = seeded;
              cy.log(`[before] ${status}: seeded ${seeded}`);
            } else {
              cy.log(`[before] ${status}: probe and seed both failed`);
            }
          });
        });
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
  });

  // Single afterEach for the describe — only the success-path tests
  // populate `this.scannedSerial`/`this.sourceStatusForRollback`, so this
  // hook is a no-op for the error-path tests.
  afterEach(function () {
    if (this.scannedSerial && this.sourceStatusForRollback) {
      cy.iaSetSerialStatus(authToken, this.scannedSerial, this.sourceStatusForRollback);
      this.scannedSerial = null;
      this.sourceStatusForRollback = null;
    }
  });

  // ------------------------------------------------------------------------
  // Decision Table — successful restock paths (3 partitions).
  // For each source status, scanning should:
  //   - Show a success toast.
  //   - Push the serial into the SessionScannedList with status "Scanned".
  //   - Flip the underlying item to Available (asserted via the toast copy
  //     "Item <serial> restocked successfully").
  // After the test, the afterEach hook above rolls the serial back to its
  // source status via /products/mark-status so the QA pool isn't depleted.
  // ------------------------------------------------------------------------
  // SKILL §5: @smoke representative — TC110 (Damaged → Available) is the
  // most-trafficked happy path of the restock flow.
  data.successPaths.forEach(({ tcId, sourceStatus, expectedSessionStatus }) => {
    const tags = tcId === 'SW-IA-TC110' ? { tags: ['@smoke'] } : {};
    it(`${tcId} — restocking a serial in status ${sourceStatus} succeeds`, tags, function () {
      // Technique: State Transition
      const serial = serialsByStatus[sourceStatus];
      if (!serial) {
        cy.log(`No serial available for status ${sourceStatus} — skipping ${tcId}`);
        this.skip();
      }
      // Stash for the afterEach rollback.
      this.scannedSerial = serial;
      this.sourceStatusForRollback = sourceStatus;

      page.openFromSideNav();
      page.scanSerial(serial);
      page.assertSuccessToast(serial);
      page.assertSessionItemStatus(serial, expectedSessionStatus);
    });
  });

  // ------------------------------------------------------------------------
  // Decision Table — error paths (4 partitions).
  // For each source status the component:
  //   - Calls addError(...) so an error toast/banner appears.
  //   - Pushes the serial into the SessionScannedList with the *server-side*
  //     scanStatus value (i.e. the source status itself).
  // The underlying item's status does NOT change, so no state restoration
  // is needed.
  // ------------------------------------------------------------------------
  data.errorPaths.forEach(({ tcId, sourceStatus }) => {
    it(`${tcId} — restocking a serial in status ${sourceStatus} shows an error`, function () {
      // Technique: EP
      const serial = serialsByStatus[sourceStatus];
      if (!serial) {
        cy.log(`No serial available for status ${sourceStatus} — skipping ${tcId}`);
        this.skip();
      }
      page.openFromSideNav();
      page.scanSerial(serial);
      page.assertErrorToastVisible();
      page.assertSessionItemStatus(serial, sourceStatus);
    });
  });
});
