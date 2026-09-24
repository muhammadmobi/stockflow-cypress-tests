/**
 * POAssignment.cy.js
 * ============================================================
 * Spec: Purchase Order Assignment tab (worker ↔ PO assignment)
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (Spec N5 — SW-POASGN)
 *
 * Reality check (verified by reading Frontend/src/components/PO_Assignment/*.tsx):
 * the assign dialog's PO-number select (workerPoList.tsx) always calls
 * GET /purchase-orders/po-numbers?close=false regardless of any "close" prop
 * passed to it — so Closed POs are excluded from the dropdown unconditionally
 * (TC07 below verifies this). Workers come from an external identity-service
 * call (GET /configs/po-assignment/workers) — the spec selects "the first
 * worker in the list" rather than hard-coding a name, to avoid depending on
 * QA-environment-specific identity data.
 *
 */

import POAssignmentPage from '../../pageObjects/PurchaseOrder/POAssignmentPage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import { seedProductOnlyPO, apiClosePO, apiDeletePO } from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';
import { apiCall } from '../../support/helpers/allPosHelpers';

const suiteStamp = `POASGN-${Date.now()}`;
const assignPO = `PO-POASGN-A-${suiteStamp}`;
const reassignPO = `PO-POASGN-RA-${suiteStamp}`;
const closedPO = `PO-POASGN-CLS-${suiteStamp}`;
// TC03 assigns `assignPO` to the first worker and does not unassign it — the
// select's options exclude any PO already assigned to that worker
// (workerPoList.tsx filters `!selectedWorkerPOS.includes(po)`), so TC06 needs
// its OWN disposable PO to avoid finding an empty dropdown.
const roundTripPO = `PO-POASGN-RT-${suiteStamp}`;

const page = new POAssignmentPage();

// TC08 flips the shared/global general-config "enableSinglePoAssignment"
// toggle — captured here so after() can restore it unconditionally even if
// TC08's own assertions fail (cy chainables don't support .finally()).
let singlePoAssignmentRestore = null;

// GET /configs/po-assignment/workers responds with a bare array (verified
// live: `[{id,username,email,name,status,roleId}, ...]`), NOT `{data:[...]}`
// — the earlier `res.body?.data || []` unwrapping silently returned []
// on every environment, which is why TC08 always hit its "fewer than 2
// workers" skip branch regardless of how many workers actually existed.
function apiGetWorkers() {
  return apiCall('GET', '/configs/po-assignment/workers').then((res) => res.body || []);
}

function apiAssignPO(userId, poNumber) {
  return apiCall('POST', '/configs/po-assignment', { userId, purchaseOrderIds: [poNumber] });
}

function apiUnassignPO(userId, poNumber) {
  return apiCall('DELETE', `/configs/po-assignment/${encodeURIComponent(poNumber)}?userId=${userId}`);
}

function apiGetAssignedPOs(userId) {
  return apiCall('GET', `/purchase-orders/assigned-po/${userId}`).then((res) => res.body?.data || []);
}

// TC08 needs the "reject a conflicting second assignment" behavior gated
// behind the general config's enableSinglePoAssignment flag (configs.
// service.ts assignPoToWorker ~line 287) — with it OFF (the default), a
// worker can hold multiple different POs at once and no conflict is ever
// raised (verified live). Toggle it on for TC08 only and restore the
// original value afterward — same PATCH shape as
// cypress/e2e/api/GeneralConfigAPI.cy.js's patchGeneralConfig.
function apiGetGeneralConfigRow() {
  return apiCall('GET', '/configs?type=general&name=general').then((res) => {
    const row = res.body?.data?.list?.find((c) => c.name === 'general');
    expect(row, 'general config row must exist').to.exist;
    return row;
  });
}

function apiSetSinglePoAssignment(row, value) {
  const currentData = row.configJson?.data || {};
  return apiCall('PATCH', `/configs/${row.id}`, {
    type: 'general',
    configJson: { data: { ...currentData, enableSinglePoAssignment: value } },
  });
}

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  seedProductOnlyPO({ td, poNumber: assignPO, stamp: `${suiteStamp}-a`, quantity: 1 });
  seedProductOnlyPO({ td, poNumber: reassignPO, stamp: `${suiteStamp}-r`, quantity: 1 });
  seedProductOnlyPO({ td, poNumber: roundTripPO, stamp: `${suiteStamp}-rt`, quantity: 1 });
  seedProductOnlyPO({ td, poNumber: closedPO, stamp: `${suiteStamp}-c`, quantity: 1 }).then(() =>
    apiClosePO(closedPO)
  );
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [assignPO, reassignPO, closedPO, roundTripPO].forEach((po) => apiDeletePO(po));
    // Safety net: restore the shared enableSinglePoAssignment toggle if
    // TC08 changed it, regardless of whether TC08 itself passed or failed.
    if (singlePoAssignmentRestore) {
      apiSetSinglePoAssignment(singlePoAssignmentRestore.row, singlePoAssignmentRestore.originalValue);
    }
  });
});

beforeEach(() => {
  cy.authSession('admin');
});

describe('SW-POASGN — Purchase Order Assignment', () => {
  it('SW-POASGN-TC01 — The Assignment tab renders the Workers panel @smoke', () => {
    // Use Case: navigation — tab is visible and its content loads
    page.visit();
    page.assertTabRendered();
  });

  it('SW-POASGN-TC02 — Selecting a worker shows their assigned-POs panel (possibly empty) @regression', () => {
    // EP — empty/non-empty partitions both render the "Assigned Purchase
    // Orders" panel header; the empty-state text only asserts when count is 0.
    page.visit();
    page.selectFirstWorker();
    cy.contains(/Assigned Purchase Orders/i, { timeout: 15000 }).should('be.visible');
  });

  it('SW-POASGN-TC03 — Assigning a PO to the selected worker makes it appear in their assigned list @smoke', () => {
    // Use Case: main assignment flow
    page.visit();
    page.selectFirstWorker();
    page.openAssignDialog();
    page.typePoInSelect(assignPO);
    page.selectPoOption(assignPO);
    page.clickSave();
    page.assertAssignedPoVisible(assignPO);
  });

  it('SW-POASGN-TC04 — An assigned PO appears in GET /purchase-orders/assigned-po/:userId @regression', () => {
    // EP — side effect: API state matches the UI action from TC03
    apiGetWorkers().then((workers) => {
      const worker = workers[0];
      if (!worker?.id) return cy.log('No workers available on this env — skipping API cross-check');
      apiGetAssignedPOs(worker.id).then((pos) => {
        expect(pos, `assigned POs for worker ${worker.id} should include ${assignPO}`).to.include(assignPO);
      });
    });
  });

  it('SW-POASGN-TC05 — Unassigning a worker from a PO removes it from their assigned list @regression', () => {
    // Use Case: alternate flow — inverse of TC03
    page.visit();
    page.selectFirstWorker();
    page.openAssignDialog();
    page.typePoInSelect(reassignPO);
    page.selectPoOption(reassignPO);
    page.clickSave();
    page.assertAssignedPoVisible(reassignPO);

    page.unassignPo(reassignPO);
    page.assertAssignedPoAbsent(reassignPO);
  });

  it('SW-POASGN-TC06 — Assign then unassign returns the worker to their prior (unassigned) state @regression', () => {
    // State Transition: unassigned → assigned → unassigned (round trip).
    // Uses its own disposable PO — assignPO/reassignPO are already assigned
    // by earlier TCs in this run, which would filter them out of the dropdown.
    page.visit();
    page.selectFirstWorker();
    page.openAssignDialog();
    page.typePoInSelect(roundTripPO);
    page.selectPoOption(roundTripPO);
    page.clickSave();
    page.assertAssignedPoVisible(roundTripPO);

    page.unassignPo(roundTripPO);
    page.assertAssignedPoAbsent(roundTripPO);
  });

  it('SW-POASGN-TC07 — A Closed PO is excluded from the assignable PO dropdown @regression', () => {
    // Decision Table: the PO-select always queries close=false — Closed POs
    // never appear regardless of props passed to the select component.
    page.visit();
    page.selectFirstWorker();
    page.openAssignDialog();
    page.typePoInSelect(closedPO);
    page.assertPoOptionAbsent(closedPO);
  });

  it('SW-POASGN-TC08 — Assigning a second, different PO to a worker is rejected when enableSinglePoAssignment is on @regression', function () {
    const ctx = this;
    // EP / Error Guessing (not State Transition — the service never moves a
    // PO between workers). Per configs.service.ts assignPoToWorker (~lines
    // 285-314): when enableSinglePoAssignment is on, the guard only inspects
    // the REQUEST's OWN userId's existing assignments
    // (`workerExistingAssignments` is queried with `where: { userId:
    // poAssignmentDto.userId }`) — if that worker already holds a
    // DIFFERENT PO, the request throws BadRequestException. It never reads
    // or mutates another worker's rows, so re-assigning a PO already held
    // by worker A to worker B does NOT move it off worker A; it only
    // succeeds/fails based on worker B's own existing state. This TC forces
    // that conflict deterministically (worker B is given a different PO
    // first) and confirms the request is rejected and worker A's
    // assignment is left untouched.
    //
    // Worker B is pinned to the dedicated "worker" account defined in
    // cypress/fixtures/users.json, looked up by username in the live
    // workers list, instead of `apiGetWorkers()[1]` — this guarantees a
    // second, distinct worker id deterministically rather than depending on
    // array order. Worker A is any OTHER worker in the list.
    //
    // By default (enableSinglePoAssignment=false) this guard doesn't run at
    // all. Enable it for this TC, and register the restore in the
    // module-level `singlePoAssignmentRestore` BEFORE running any
    // assertions — the suite's after() hook applies it unconditionally, so
    // the shared config is restored even if an assertion below throws (cy
    // chainables have no .finally()).
    apiGetGeneralConfigRow()
      .then((row) => {
        singlePoAssignmentRestore = {
          row,
          originalValue: row.configJson?.data?.enableSinglePoAssignment ?? false,
        };
        return apiSetSinglePoAssignment(row, true);
      })
      .then(() => apiGetWorkers())
      .then((workers) => {
        const workerB = workers.find((w) => w.username === 'worker');
        const workerA = workerB && workers.find((w) => w.id !== workerB.id);
        // This TC needs a dedicated provisioned "worker" identity plus a second
        // distinct worker in the PO-assignment workers list. When the env hasn't
        // provisioned them, skip (env-data gap) rather than hard-fail.
        if (!workerB?.id || !workerA?.id) {
          cy.log('dedicated "worker" account (or a 2nd worker) not provisioned — skipping');
          ctx.skip();
          return;
        }

        // Clean slate: clear any leftover assignment from an earlier TC/run
        // so the two setup assignments below are guaranteed to succeed.
        return apiUnassignPO(workerA.id, assignPO)
          .then(() => apiUnassignPO(workerB.id, reassignPO))
          .then(() => apiAssignPO(workerA.id, assignPO))
          .then((res) => {
            expect(res.status, 'setup: worker A holds assignPO').to.be.lessThan(300);
          })
          .then(() => apiAssignPO(workerB.id, reassignPO))
          .then((res) => {
            expect(res.status, 'setup: worker B holds a different PO (reassignPO)').to.be.lessThan(300);
          })
          .then(() => apiAssignPO(workerB.id, assignPO))
          .then((res) => {
            expect(
              res.status,
              'assigning a second, different PO (assignPO) to worker B must be rejected while worker B already holds reassignPO'
            ).to.eq(400);
          })
          .then(() => apiGetAssignedPOs(workerA.id))
          .then((pos) => {
            expect(
              pos,
              "worker A's assignment must be untouched by worker B's rejected request"
            ).to.include(assignPO);
          })
          .then(() =>
            // Restore immediately rather than waiting for the suite's after()
            // — TC10 (and any other TC that runs later in this file) needs
            // enableSinglePoAssignment back at its original value to make
            // multi-worker assignments in its own setup.
            apiSetSinglePoAssignment(singlePoAssignmentRestore.row, singlePoAssignmentRestore.originalValue)
          );
      });
  });

  it('SW-POASGN-TC09 — Assigning to a non-existent userId is handled without a server error @regression', () => {
    // Error Guessing: invalid/unknown identity id
    apiAssignPO('__NONEXISTENT_USER_ID__', assignPO).then((res) => {
      expect(res.status, 'assign with unknown userId: HTTP').to.be.lessThan(500);
    });
  });

  it('SW-POASGN-TC10 — GET /purchase-orders/assigned-po/:userId scopes results to that single worker @regression', () => {
    // EP — role scope: the assigned-po endpoint is per-userId. Assign a
    // distinct PO to each of two workers and prove each worker's list
    // contains only their own PO, not the other worker's.
    apiGetWorkers().then((workers) => {
      const workerB = workers.find((w) => w.username === 'worker');
      const workerA = workers.find((w) => w.id !== workerB?.id);
      if (!workerA?.id || !workerB?.id) {
        return cy.log('Fewer than 2 distinct workers available on this env — skipping scope check');
      }

      apiAssignPO(workerA.id, assignPO)
        .then(() => apiAssignPO(workerB.id, roundTripPO))
        .then(() => apiGetAssignedPOs(workerA.id))
        .then((posA) => {
          expect(posA, "worker A's list should contain worker A's PO").to.include(assignPO);
          expect(posA, "worker A's list should NOT contain worker B's PO").to.not.include(roundTripPO);
        })
        .then(() => apiGetAssignedPOs(workerB.id))
        .then((posB) => {
          expect(posB, "worker B's list should contain worker B's PO").to.include(roundTripPO);
          expect(posB, "worker B's list should NOT contain worker A's PO").to.not.include(assignPO);
        });
    });
  });
});
