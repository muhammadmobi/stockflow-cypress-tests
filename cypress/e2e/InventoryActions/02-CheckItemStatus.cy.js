// cypress/e2e/InventoryActions/02-CheckItemStatus.cy.js
//
// Specs for the Check Item Status mobile screen
// (route /MobileViewScreen/scan-item-status, reached via Inventory Actions
// → Product Operations → Check Item Status).
//
// Scope: status-display matrix (5 InventoryStatus partitions). Read-only —
// no state mutation, no `after()` restoration needed. Tests probe live QA
// data via cy.iaProbeSerialWithStatus and `this.skip()` when the env has
// no item in the requested status (per project probe-and-skip pattern,
// matching cypress/e2e/api/CheckItemStatusAPI.cy.js).
//
// SW-IA-TC102 (Available) is intentionally NOT re-asserted here — owned by
// `cypress/e2e/14-InventoryActionCheckItemStatus.cy.js` (see
// cypress/qa/testPlans/inventoryActions/coverage.md).

import CheckItemStatusPage from '../../pageObjects/InventoryActions/CheckItemStatusPage';
import data from '../../fixtures/InventoryActions/checkItemStatus.json';

describe('Inventory Action — Check Item Status', { tags: ['@regression'] }, () => {
  const page = new CheckItemStatusPage();
  let authToken;
  // Populated in before() — keyed by status string.
  const serialsByStatus = {};

  before(function () {
    cy.iaAuthToken().then((token) => {
      authToken = token;
      expect(authToken, 'identity server returned a bearer token').to.exist;

      // Probe each required status; seed any that are missing so the
      // it() blocks can run instead of skipping.
      data.statusMatrix.forEach(({ status }) => {
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

  // ------------------------------------------------------------------------
  // EP — Equivalence Partitioning on InventoryStatus.
  // One representative test per non-Available partition (Available is owned
  // by 14-InventoryActionCheckItemStatus.cy.js, see Coverage Map).
  // Serials are resolved in before() via probe-then-seed so tests run
  // on environments without pre-existing data.
  // ------------------------------------------------------------------------
  // SKILL §5: @smoke = critical-path subset, one representative per spec.
  // TC104 (Damaged) is the most common status query in real use.
  data.statusMatrix.forEach(({ tcId, status }) => {
    const tags = tcId === 'SW-IA-TC104' ? { tags: ['@smoke'] } : {};
    it(`${tcId} — scanning a serial with status ${status} renders the status correctly`, tags, function () {
      // Technique: EP
      const serial = serialsByStatus[status];
      if (!serial) {
        cy.log(`No serial available for status ${status} — skipping ${tcId}`);
        this.skip();
      }
      page.openFromSideNav();
      page.scanSerial(serial);
      page.assertDisplayedStatus(status);
    });
  });
});
