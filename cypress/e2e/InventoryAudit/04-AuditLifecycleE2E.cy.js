// cypress/e2e/InventoryAudit/04-AuditLifecycleE2E.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md  (§9.1.6, SW-IAUD-E2E-TC01..63)
//
// The outcomes the feature exists for, driven across BOTH actors. Not screen
// coverage — the guarantees the epic states, which no single screen owns:
//
//   A. Log completeness            E2E-TC01..07
//   B. Bin-freeze enforcement      E2E-TC08..20
//   C. Never-placed stock          E2E-TC21..30
//   D. A clean Location audit      E2E-TC31..34
//   E. A clean container audit     E2E-TC35..38
//   F. A discrepancy, end to end   E2E-TC39..46
//   G. The two product families    E2E-TC47..63
//
// TWO RULES THIS SPEC LIVES BY:
//
//  1. **A refusal alone proves nothing.** Every freeze test asserts the operation
//     is refused while frozen AND that the identical call succeeds once released
//     (E2E-TC19). Otherwise a write path broken for an unrelated reason would make
//     the whole group pass vacuously.
//  2. **The freeze guard lives in the WMS write paths, not in the audit module.**
//     So the instrument is a REAL warehouse operation — assign, move, unassign,
//     stock-out, container load — never a stubbed call. Asserting that a bin row
//     says `InProgress` tests the flag, not the enforcement.
//
// This spec MOVES REAL STOCK (it files never-placed serials and applies
// adjustments). It claims a bin under whatever stocked location the probe finds and
// restores what it changed; it must not be pointed at production-like data.

import AuditDetailPage from '../../pageObjects/InventoryAudit/auditDetailPage';
import { uniqueAuditName } from '../../support/InventoryAudit/auditHelpers';
import {
  ensureContainerInBin,
  ensureQuantityInBin,
  ensureSiblingBins,
  resolveCountActor,
} from '../../support/InventoryAudit/auditWarehouse';
import {
  createRestoreQueue,
  probeProductNotInBin,
  restoreSerialHome,
  restoreStockedOutSerial,
  reconcileSerialsIntoBin,
  restoreUnplacedSerial,
  serialsOf,
  stageSerialInOtherBin,
  stageStockedOutSerialInBin,
  stageUnplacedSerial,
} from '../../support/InventoryAudit/auditFixtures';
import {
  addLine,
  addQuantityToLocation,
  approveLine,
  assignBins,
  assignItemToLocation,
  cancelAuditApi,
  closeAuditApi,
  createAudit,
  enterQuantity,
  forceReleaseAudit,
  getAudit,
  getBins,
  getDiscrepancies,
  getLineSerials,
  getItemStatus,
  getFrozenBins,
  getPreview,
  getReport,
  getSettings,
  getTrail,
  getUnplaced,
  getWorkerTasks,
  listLocationItems,
  listLocationQuantities,
  moveItemBetweenLocations,
  moveMisplaced,
  probeContainerInBin,
  probeSiblingBins,
  probeStockedBin,
  putSettings,
  rejectLine,
  removeScan,
  requestRecount,
  restockBySerial,
  scanSerial,
  startBin,
  stockOutBySerial,
  submitBin,
  sweepLeftoverAudits,
  trailActions,
  trailRowsForAudit,
  unassignItem,
  unwrap,
  waitForGeneration,
} from '../../support/InventoryAudit/auditLifecycle';


/**
 * How many quantity-tracked units the audited bin must hold before the
 * pure-product group can run without starving itself.
 *
 * Each APPROVED shortage permanently consumes a unit — that is the feature — and the
 * suite's inverse only re-assigns stock, it cannot re-create it. One unit is
 * therefore exhausted by the first approval, taking every later TC's
 * `expectedQuantity > 0` guard with it.
 */
const MIN_QUANTITY_UNITS = 5;

describe('Inventory Audit — lifecycle end to end', { tags: ['@regression'] }, () => {
  /** Only for the warehouse-indicator read in E2E-TC20; this spec is otherwise API-driven. */
  const auditDetail = new AuditDetailPage();

  /**
   * The status a successful POST in this module returns.
   *
   * NONE of the inventory-audit controllers declare `@HttpCode(200)` — they carry
   * only `@ApiOkResponse`, which is Swagger metadata and does not change the
   * response — so NestJS applies its POST default and every one of these routes
   * actually answers **201**. `ApiResponseInterceptor` echoes `response.statusCode`,
   * so the envelope reports 201 as well. Verified against worker-count.controller.ts,
   * discrepancy-review.controller.ts and audit-management.controller.ts, and against
   * QA by the sibling specs (05-AuditAssignmentTests `expectAssigned`,
   * AuditManagementAPI `expectCancelled`).
   *
   * Accepting both keeps the suite honest about the observable contract; the
   * annotation being wrong is a documentation defect to raise, not a reason to sit
   * red. Do NOT narrow this to 200 — a strict 200 here failed every POST-driven
   * test in this file while the feature worked.
   */
  const expectAccepted = (res, why = 'the call must succeed') => {
    expect(res.status, why).to.be.oneOf([200, 201]);
    return res;
  };

  /** Whether a response succeeded at all — for "must NOT have succeeded" checks. */
  const isAccepted = (res) => res.status === 200 || res.status === 201;

  /**
   * Inverses for every warehouse state a test stages.
   *
   * Registered at STAGE time, not at assert time, so a failed assertion halfway
   * through still leaves the environment restorable — this suite moves real stock,
   * and a leaked placement silently changes what every later audit expects.
   */
  const restores = createRestoreQueue();

  /**
   * Teardown for warehouse structure THIS spec created.
   *
   * Only populated when a probe found nothing and a builder stepped in; when the
   * tenant already had what was needed, nothing is registered and nothing is
   * removed. Locations soft-delete, so a failed teardown is recoverable rather
   * than destructive — but it still runs, because a leftover empty bin is one more
   * thing for the next run's probe to walk past.
   */
  const warehouseCleanup = [];

  /**
   * The identity that drives the count routes.
   *
   * A real `user`-role account when one resolves; otherwise the ADMIN acting as its
   * own worker. `WorkerCountService.assertOwnBin` compares `bin.assignedUserId`
   * against the caller's `sub` and applies no role check, and an audit's roster is
   * whatever its create call passed — so an admin can legitimately be named as the
   * worker on an audit it created. Without this fallback the whole spec skipped on
   * any checkout with one credential, which is where its highest-value coverage
   * (bin freeze, log completeness, both product families) lived.
   *
   * `countActor.isRealWorker` stays available for the cases that genuinely need a
   * SECOND, non-admin identity — those still skip rather than pass vacuously.
   */
  let countActor = null;

  let adminJwt;
  let workerJwt;
  let workerId;
  let scopeBin = null; // a bin holding countable stock
  /**
   * An ABC class the scope actually holds, resolved once in before().
   *
   * PER-LINE REVIEW IS AN ABC-ONLY WORKFLOW. `discrepancy-review.service.ts` refuses
   * approve / reject / recount / set-reason on a Location audit outright —
   * "Location audits do not support per-line review yet — use Close." (line 1328).
   * The review group used to seed a LOCATION audit and then call those routes, so
   * every one of them 400'd on a rule the suite already documents elsewhere
   * (E2E-TC31: "a Location audit closes with no per-line review").
   *
   * Null when the scope holds no ABC-classed stock, in which case the review group
   * skips with that reason instead of failing.
   */
  let reviewClass = null;
  let siblings = null; // two bins under one parent — for the narrow-freeze test
  let containerBin = null; // a container parked in a bin
  const created = [];

  /** Create a Location audit over a bin, generate, and assign every bin to the worker. */
  const seedCountableAudit = (overrides = {}) => {
    const name = overrides.name || uniqueAuditName('e2e');
    const locationId = overrides.scopeLocationId || scopeBin.id;
    return createAudit(
      adminJwt,
      Object.assign(
        {
          name,
          auditType: 'Location',
          assignOnScan: true,
          scopeLocationId: locationId,
          assignmentStrategy: 'Manual',
          workers: [{ userId: workerId, userName: 'Cypress Worker' }],
        },
        overrides,
        { name, scopeLocationId: locationId }
      )
    ).then((res) => {
      if (res.status === 409) return null; // an overlapping live audit — caller skips
      expect(res.status, `seed create for ${name}`).to.be.oneOf([200, 201]);
      const id = unwrap(res).id;
      created.push(id);
      return waitForGeneration(adminJwt, id).then(() =>
        getBins(adminJwt, id).then((binsRes) => {
          const bins = unwrap(binsRes);
          if (!bins.length) return { auditId: id, auditName: name, bins: [] };
          return assignBins(
            adminJwt,
            id,
            bins.map((b) => ({ binId: b.id, userId: workerId }))
          ).then(() => ({ auditId: id, auditName: name, bins }));
        })
      );
    });
  };

  /** Seed an audit and open its first bin for counting (the freeze is now held). */
  const seedFrozenBin = (overrides = {}) =>
    seedCountableAudit(overrides).then((seed) => {
      if (!seed || !seed.bins.length) return null;
      const bin = seed.bins[0];
      return startBin(workerJwt, bin.id).then((res) => {
        expectAccepted(res, 'the worker must be able to open their own bin');
        return Object.assign({}, seed, { bin });
      });
    });

  before(() => {
    cy.login().then((t) => {
      adminJwt = t;
    });
    cy.then(() =>
      resolveCountActor(adminJwt).then((a) => {
        countActor = a;
        workerJwt = a.usable ? a.token : null;
        workerId = a.usable ? a.userId : null;
        cy.log(
          `count actor: ${a.isRealWorker ? 'real `user` account' : 'admin acting as worker'}`
        );
      })
    );
    // Probe for the bin to audit.
    //
    // NOTE: `support/InventoryAudit/auditSeed.js` can SEED this instead — PO, import,
    // receive, bin, ABC class — and its stock chain is verified working (4 serials +
    // 40 units received on QA 2026-08-20). It is not wired in yet because the placing
    // step still yields a thinner bin than probing does; see pending.md §1.
    cy.then(() =>
      probeStockedBin(adminJwt).then((b) => {
        scopeBin = b;
      })
    );
    // Two sibling bins: probe first, BUILD if the tenant has none. The narrow-freeze
    // and misplacement columns only need a bin that is not the counted one, and a
    // Facility → Zone → two Bins chain is four cheap, soft-deletable rows — far
    // better than skipping a third of this spec because no such pair happens to exist.
    cy.then(() =>
      probeSiblingBins(adminJwt).then((found) =>
        ensureSiblingBins(adminJwt, found).then((s) => {
          siblings = s;
          if (s && s.created) warehouseCleanup.push(() => s.cleanup());
        })
      )
    );

    // A container parked in the counted bin. An EMPTY container adds no expected
    // units, so parking one in the probed scope does not change what any other test
    // in this file counts.
    cy.then(() =>
      probeContainerInBin(adminJwt).then((found) => {
        if (found) {
          containerBin = found;
          return null;
        }
        if (!scopeBin) return null;
        return ensureContainerInBin(adminJwt, scopeBin.id, null).then((c) => {
          containerBin = c;
          if (c && c.created) warehouseCleanup.push(() => c.cleanup());
        });
      })
    );

    // Make sure the audited bin holds a QUANTITY-TRACKED line.
    //
    // The single largest unblocker in this module: without one, the whole
    // pure-product half of the plan skips. This tenant has only three non-serial
    // products with any stock at all — none of them in the first page of the
    // catalogue — so probing the bin and giving up was always going to lose.
    //
    // Staged BEFORE any audit exists, because count-task generation snapshots what
    // the bin is expected to hold. Removed again in after().
    cy.then(() => {
      if (!scopeBin) return null;
      // Enough units, not merely "a line". The bin this tenant offers holds ONE unit
      // of one non-serial product, and the first approved shortage consumes it — so
      // every later pure-product TC then found a line with `expectedQuantity: 0` and
      // skipped. Top up whenever the bin is thin, so a run can absorb several
      // shortage/overage approvals without starving itself.
      const units = scopeBin.quantities.reduce((n, q) => n + Number(q.quantity || 0), 0);
      if (units >= MIN_QUANTITY_UNITS) return null;
      return ensureQuantityInBin(adminJwt, scopeBin.id, MIN_QUANTITY_UNITS).then((staged) => {
        if (!staged) return null;
        warehouseCleanup.push(() => staged.cleanup());
        // Re-read so the `scopeBin.quantities.length` guards see it.
        return listLocationQuantities(adminJwt, scopeBin.id).then((res) => {
          const body = unwrap(res);
          scopeBin.quantities = (Array.isArray(body) ? body : (body && body.items) || []).filter(
            (q) => Number(q.quantity) > 0
          );
        });
      });
    });

    // Which ABC class does the scope hold? The review group needs an Abc audit.
    cy.then(() => {
      if (!scopeBin) return null;
      const probe = (classes) => {
        if (!classes.length) return null;
        return getPreview(adminJwt, scopeBin.id, classes[0]).then((r) =>
          Number((unwrap(r) || {}).binCount) > 0 ? classes[0] : probe(classes.slice(1))
        );
      };
      return probe(['A', 'B', 'C']).then((cls) => {
        reviewClass = cls;
      });
    });

    cy.then(() => sweepLeftoverAudits(adminJwt, 'cy-e2e-'));
  });

  beforeEach(function () {
    // Only fires if the admin token itself carries no `sub` — a broken realm, not
    // a missing second credential.
    if (!workerJwt || !workerId) this.skip(); // see pending.md §2
    if (!scopeBin) this.skip(); // no stocked bin — pending.md §1
  });


  /**
   * Release whatever THIS test created before the next one runs.
   *
   * "One bin, one live audit of the same expected set" is a real product rule, so a
   * second create over the same scope with the same type is refused with 409
   * AUDIT_SCOPE_OVERLAP. These specs probe ONE scope, so leaving audits live makes
   * every later create fail against the feature working exactly as designed.
   */
  afterEach(() => {
    // AUDITS FIRST, warehouse state second.
    //
    // The order matters and used to be the other way round, with a comment claiming
    // the opposite of what the code did. `BinLockService.assertBinNotFrozen` throws
    // 409 for every write to a bin under a live count
    // (bin-lock.service.ts:94), so a restore drained while the audit was still open
    // was refused — silently, because the restore queue swallows failures by design
    // so one bad restore cannot fail a passing test. The serial then stayed where
    // the test had put it. Observed on QA: `StatsThink013` was left unplaced after a
    // run, which took the bin from two serials to one and made TC25, TC30 and TC56
    // skip on the NEXT run for want of stock the suite itself had moved.
    //
    // Releasing the audit lifts the freeze, so the restores that follow succeed.
    //
    // Take a SNAPSHOT and drop each id only once its release has actually run.
    // Draining the array synchronously (`while (created.length) created.pop()`)
    // emptied it before a single queued command executed, so the after() net below
    // always iterated nothing and a release aborted mid-run left the audit live —
    // which then blocks the next run with 409 AUDIT_SCOPE_OVERLAP.
    created.slice().forEach((id) => {
      if (!id) return;
      forceReleaseAudit(adminJwt, workerJwt, id).then(() => {
        const at = created.indexOf(id);
        if (at >= 0) created.splice(at, 1);
      });
    });

    // Queued behind the releases above, so every freeze is lifted by the time a
    // restore runs.
    cy.then(() => restores.drain());
  });

  after(() => {
    // Genuine safety net: whatever is still here failed to release above.
    created.slice().forEach((id) => forceReleaseAudit(adminJwt, workerJwt, id));
    // Warehouse RESTORES, then warehouse structure.
    //
    // The restore queue needs a net of its own: `afterEach` drains it behind that
    // test's audit releases, but a restore that was refused there (a freeze not yet
    // lifted, a transient) is simply logged and dropped, and nothing ever retried
    // it. Draining again here — with every audit released — is what stops a serial
    // ending the run unplaced, which is how this spec kept thinning its own bin and
    // skipping TC56/TC57 on the NEXT run.
    cy.then(() => restores.drain());
    // Deterministic net: whatever the queue could not put back, put back now. Every
    // restore goes through `cy.request({ failOnStatusCode: false })`, so one refused
    // mid-run resolves normally and the queue counts it as done — and the serial
    // ends the run unplaced, thinning the bin the next run probes.
    cy.then(() => reconcileSerialsIntoBin(adminJwt, scopeBin && scopeBin.id, scopeBin && scopeBin.serials));
    // Then remove any warehouse structure this spec built. Audits first — a
    // location still under a live audit is exactly what the freeze protects.
    cy.then(() => warehouseCleanup.splice(0, warehouseCleanup.length).forEach((fn) => fn()));
  });

  // ==========================================================================
  // A. Audit-trail / log completeness
  // ==========================================================================

  // Use case — the admin half of the log
  it('SW-IAUD-E2E-TC01: every admin action in a lifecycle leaves its own trail row', () => {
    seedCountableAudit({ name: uniqueAuditName('e2e-trailadmin') }).then((seed) => {
      if (!seed) return;
      cancelAuditApi(adminJwt, seed.auditId).then(() => {
        getTrail(adminJwt, 'InventoryAudit', String(seed.auditId)).then((res) => {
          const actions = trailActions(res);
          expect(actions.join(','), 'a CREATE row exists').to.match(/CREATE/i);
          expect(actions.join(','), 'an ASSIGN_BINS row exists').to.match(/ASSIGN_BINS/i);
          expect(actions.join(','), 'a CANCEL row exists').to.match(/CANCEL/i);
          trailRowsForAudit(res, seed.auditId);
          const rows = res.body.data ? res.body.data.items || res.body.data : [];
          (Array.isArray(rows) ? rows : []).forEach((r) => {
            expect(r.userName, 'every row names the acting user').to.be.a('string').and.not.be.empty;
          });
        });
      });
    });
  });

  // Use case — the worker half, filed where the warehouse looks
  it('SW-IAUD-E2E-TC02: every count action is recorded against the bin it happened in', { tags: ['@smoke'] }, function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-trailwork') }).then((seed) => {
      if (!seed) this.skip();
      const serial = scopeBin.serials[0];
      scanSerial(workerJwt, seed.bin.id, serial)
        .then(() => removeScan(workerJwt, seed.bin.id, serial))
        .then(() => scanSerial(workerJwt, seed.bin.id, serial))
        .then(() => submitBin(workerJwt, seed.bin.id, true))
        .then(() => getTrail(adminJwt, 'Location', String(seed.bin.locationId), 200))
        .then((res) => {
          const mine = trailRowsForAudit(res, seed.auditId).map((r) => String(r.actionType));
          expect(mine.join(','), 'the bin was opened').to.match(/START_BIN/i);
          expect(mine.join(','), 'a serial was recorded').to.match(/SCAN/i);
          expect(mine.join(','), 'a scan was removed').to.match(/REMOVE_SCAN/i);
          expect(mine.join(','), 'the count was submitted').to.match(/SUBMIT_BIN/i);
        });
    });
  });

  // Decision table — a container action is filed against the container too
  it('SW-IAUD-E2E-TC03: a count action targeting a container is filed against the container', function () {
    if (!containerBin) this.skip(); // no container parked in a bin — pending.md §3
    seedFrozenBin({ name: uniqueAuditName('e2e-trailcont'), scopeLocationId: containerBin.bin.id }).then((seed) => {
      if (!seed) this.skip();
      if (!scopeBin.serials.length) this.skip();
      scanSerial(workerJwt, seed.bin.id, scopeBin.serials[0], {
        containerId: containerBin.container.id,
      }).then(() =>
        getTrail(adminJwt, 'Container', String(containerBin.container.id), 200).then((res) => {
          expect(
            trailRowsForAudit(res, seed.auditId).length,
            'the container carries its own record of the count activity'
          ).to.be.at.least(1);
        })
      );
    });
  });

  // Error guessing — the cancel row must describe what SURVIVED
  it('SW-IAUD-E2E-TC04: a cancellation records the scans it kept', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-keep') }).then((seed) => {
      if (!seed) this.skip();
      scanSerial(workerJwt, seed.bin.id, scopeBin.serials[0]).then(() =>
        cancelAuditApi(adminJwt, seed.auditId).then((c) => {
          expectAccepted(c, 'the cancel must succeed');
          expect(unwrap(c).preservedScanCount, 'the response reports the kept scans').to.be.at.least(1);
          getTrail(adminJwt, 'Location', String(seed.bin.locationId), 200).then((res) => {
            const row = trailRowsForAudit(res, seed.auditId).find((r) =>
              /CANCELLED/i.test(String(r.actionType))
            );
            expect(row, 'a cancel row is filed against the bin').to.exist;
            const diff = typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff;
            expect(diff.placementsReversed, 'placements are not reversed by a cancel').to.eq(false);
            expect(diff.frozen, 'the freeze was released').to.eq(false);
            expect(
              diff.preservedScanCount,
              'the row names what was preserved, not what was discarded'
            ).to.be.at.least(1);
          });
        })
      );
    });
  });

  // Error guessing — the path that DOES discard must say so.
  // The cancel path (TC04) keeps what was scanned; the RECOUNT path throws it
  // away, and the two must not be recorded the same way.
  it('SW-IAUD-E2E-TC05: a recount reset records the serials it discarded', function () {
    if (!scopeBin.quantities.length || !scopeBin.serials.length) this.skip();
    seedDiscrepancy(uniqueAuditName('e2e-discard')).then((seed) => {
      if (!seed) this.skip();
      const serial = scopeBin.serials[0];
      // `seedDiscrepancy` leaves the bin SUBMITTED, and a submitted bin cannot be
      // reopened — `startBin` answers 400. The recount request is what returns it to
      // the worker, so it has to come FIRST, both times.
      requestRecount(adminJwt, seed.auditId, seed.dLine.lineId).then((firstRecount) => {
        expectAccepted(firstRecount, 'the recount request reopens the bin');
        // Put something discardable into the reopened count, or the reset below has
        // nothing to discard and the assertion means nothing.
        startBin(workerJwt, seed.bin.id)
          .then((restart) => {
            expectAccepted(restart, 'the bin reopens for the scan');
            return scanSerial(workerJwt, seed.bin.id, serial);
          })
          .then(() => submitBin(workerJwt, seed.bin.id, true))
          .then(() => requestRecount(adminJwt, seed.auditId, seed.dLine.lineId))
          .then((rec) => {
            expectAccepted(rec, 'the second recount request must succeed');
            // Restarting after a recount request is what performs the reset.
            return startBin(workerJwt, seed.bin.id);
          })
          .then((again) => {
            expectAccepted(again, 'the worker reopens the bin for the recount');
            return getWorkerTasks(workerJwt, seed.auditId);
          })
          .then((tRes) => {
            const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
            const kept = (bin.lines || []).some((l) =>
              (l.scans || []).some((s) => s.serialNumber === serial)
            );
            expect(kept, 'the prior count is discarded, not carried into the recount').to.eq(false);
            return getTrail(adminJwt, 'Location', String(seed.bin.locationId), 200);
          })
          .then((res) => {
            const rows = trailRowsForAudit(res, seed.auditId);
            const reset = rows.find((r) => /RECOUNT|CLEAR|RESET/i.test(String(r.actionType)));
            expect(
              reset,
              'discarding a count is a recorded event — a silent reset is how a worker loses a shift'
            ).to.exist;
          });
      });
    });
  });

  // Use case — the epic traceability criterion
  it('SW-IAUD-E2E-TC06: an approved adjustment is fully traceable', function () {
    if (!scopeBin.quantities.length) this.skip();
    // An **Abc** audit: this TC approves, and approve is refused outright on a
    // Location audit ("Location audits do not support per-line review yet — use
    // Close", discrepancy-review.service.ts:1328). Same reason as `seedDiscrepancy`.
    if (!reviewClass) this.skip();
    seedFrozenBin({
      name: uniqueAuditName('e2e-trace'),
      auditType: 'Abc',
      abcClass: reviewClass,
    }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tasksRes) => {
        const bin = (unwrap(tasksRes).bins || []).find((b) => b.id === seed.bin.id);
        const line = (bin.lines || []).find((l) => !l.isSerialized && l.expectedQuantity > 0);
        if (!line) this.skip();
        // Count one short, submit, then approve with a reason.
        enterQuantity(workerJwt, seed.bin.id, {
          lineId: line.id,
          countedQuantity: line.expectedQuantity - 1,
        })
          .then(() => submitBin(workerJwt, seed.bin.id, true))
          .then(() => getDiscrepancies(adminJwt, seed.auditId))
          .then((dRes) => {
            // The line for the product this test counted, and NON-SERIAL only:
            // approving a serialized shortage marks real units `Missing`, which is a
            // destructive side effect this TC does not need (E2E-TC57 owns that case).
            const dLine = (unwrap(dRes).lines || []).find(
              (l) => Number(l.productId) === Number(line.productId) && !l.isSerialized
            );
            expect(dLine, 'counting short produced a discrepancy line').to.exist;
            return approveLine(adminJwt, seed.auditId, dLine.lineId, 'Miscount');
          })
          .then((aRes) => {
            expectAccepted(aRes, 'the approval must succeed');
            return getTrail(adminJwt, 'InventoryAudit', String(seed.auditId), 200);
          })
          .then((res) => {
            const rows = trailRowsForAudit(res, seed.auditId).concat(
              (res.body.data && (res.body.data.items || res.body.data)) || []
            );
            // The action is recorded as `AUDIT ADJUSTMENT`, not `APPROVE` — verified
            // against a real row on 2026-08-20 (serial 16FL082, entityType Item).
            // The epic's criterion is that the applied adjustment is TRACEABLE, so
            // match the name the product actually writes rather than the one the
            // plan's prose happens to use.
            const approved = (Array.isArray(rows) ? rows : []).find((r) =>
              /APPROVE|ADJUST/i.test(String(r.actionType))
            );
            expect(approved, 'an approval / adjustment row exists').to.exist;
            const diff =
              typeof approved.diff === 'string' ? JSON.parse(approved.diff) : approved.diff || {};
            expect(JSON.stringify(diff), 'the row records the reason').to.match(/Miscount/i);
            expect(approved.userName, 'and who approved it').to.be.a('string').and.not.be.empty;
            expect(approved.createdAt, 'and when').to.exist;
          });
      });
    });
  });

  // Error guessing — secrets must never reach the trail
  it('SW-IAUD-E2E-TC07: no audit trail entry carries a secret', () => {
    seedCountableAudit({ name: uniqueAuditName('e2e-secret') }).then((seed) => {
      if (!seed) return;
      getTrail(adminJwt, 'InventoryAudit', String(seed.auditId), 200).then((res) => {
        const text = JSON.stringify(res.body);
        expect(text, 'no bearer token in the trail').to.not.match(/eyJ[A-Za-z0-9_-]{20,}/);
        expect(text, 'no api token in the trail').to.not.match(/sw_[A-Za-z0-9_-]{20,}/);
        expect(text.toLowerCase(), 'no password field').to.not.contain('"password"');
      });
    });
  });

  // ==========================================================================
  // B. Bin-freeze enforcement
  // ==========================================================================

  // State transition — the freeze starts at counting, not before
  it('SW-IAUD-E2E-TC08: a bin freezes only when counting starts', () => {
    seedCountableAudit({ name: uniqueAuditName('e2e-freeze-when') }).then((seed) => {
      if (!seed || !seed.bins.length) return;
      const bin = seed.bins[0];
      // Created and assigned — still not frozen.
      getFrozenBins(adminJwt).then((res) => {
        const frozenIds = (unwrap(res) || []).map((f) => Number(f.locationId));
        expect(frozenIds, 'creation and assignment do not freeze anything').to.not.include(
          Number(bin.locationId)
        );
      });
      startBin(workerJwt, bin.id).then(() =>
        getFrozenBins(adminJwt).then((res) => {
          const frozenIds = (unwrap(res) || []).map((f) => Number(f.locationId));
          expect(frozenIds, 'starting the count is what freezes it').to.include(Number(bin.locationId));
        })
      );
    });
  });

  /**
   * The freeze columns share one shape: perform a REAL warehouse write against the
   * frozen bin, assert the 409 and its payload, and confirm nothing moved.
   */
  const assertRefusedWhileFrozen = (label, operation) =>
    operation().then((res) => {
      expect(res.status, `${label} must be refused while the bin is being counted`).to.eq(409);
      const payload = JSON.stringify(res.body.error || {});
      expect(payload, 'the refusal names the audit freeze').to.match(/BIN_FROZEN_FOR_AUDIT|being counted/i);
    });

  // Decision table — assign an item into the frozen bin
  it('SW-IAUD-E2E-TC09: assigning an item into a frozen bin is refused', { tags: ['@smoke'] }, function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-item') }).then((seed) => {
      if (!seed) this.skip();
      assertRefusedWhileFrozen('assigning an item', () =>
        assignItemToLocation(adminJwt, seed.bin.locationId, scopeBin.serials[0])
      );
    });
  });

  // Decision table — change a non-serial quantity in the frozen bin
  it('SW-IAUD-E2E-TC10: changing a non-serial quantity in a frozen bin is refused', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-qty') }).then((seed) => {
      if (!seed) this.skip();
      const productId = scopeBin.quantities[0].product_id || scopeBin.quantities[0].productId;
      assertRefusedWhileFrozen('adding a quantity', () =>
        addQuantityToLocation(adminJwt, seed.bin.locationId, productId, 1)
      );
    });
  });

  // Decision table — move stock into and out of the frozen bin
  it('SW-IAUD-E2E-TC11: moving stock into or out of a frozen bin is refused', function () {
    if (!siblings || !scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-move') }).then((seed) => {
      if (!seed) this.skip();
      // Out of the frozen bin...
      assertRefusedWhileFrozen('moving stock out', () =>
        moveItemBetweenLocations(adminJwt, seed.bin.locationId, siblings.second.id, scopeBin.serials[0])
      );
      // ...and into it.
      assertRefusedWhileFrozen('moving stock in', () =>
        moveItemBetweenLocations(adminJwt, siblings.second.id, seed.bin.locationId, scopeBin.serials[0])
      );
    });
  });

  // Decision table — unassign stock from the frozen bin
  it('SW-IAUD-E2E-TC12: unassigning stock from a frozen bin is refused', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-unassign') }).then((seed) => {
      if (!seed) this.skip();
      assertRefusedWhileFrozen('unassigning an item', () =>
        unassignItem(adminJwt, scopeBin.serials[0])
      );
    });
  });

  // Decision table — a container parked in the frozen bin
  it('SW-IAUD-E2E-TC13: a container parked in a frozen bin cannot be moved', function () {
    if (!containerBin) this.skip();
    seedFrozenBin({
      name: uniqueAuditName('e2e-fz-cont'),
      scopeLocationId: containerBin.bin.id,
    }).then((seed) => {
      if (!seed) this.skip();
      if (!siblings) this.skip();
      assertRefusedWhileFrozen('moving a parked container', () =>
        cy
          .request({
            method: 'POST',
            url: `${Cypress.env('API_BASE_URL')}/containers/${containerBin.container.id}/move-to-location/${siblings.second.id}`,
            headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
            body: {},
            failOnStatusCode: false,
          })
          .then((r) => r)
      );
    });
  });

  // Decision table — stock out a serial that LIVES in the frozen bin.
  // The caller names a serial and never mentions the location, which is exactly
  // why this guard exists separately from the location-keyed ones.
  // Decision table — the ONE deliberate hole in the freeze
  //
  // The serial-keyed stock-out is allowed through on purpose, at customer request:
  // a unit that has physically left the building must be recordable as gone even
  // while its shelf is mid-count, because refusing it would force the operator to
  // either abandon the count or knowingly file a number they know is wrong.
  // Confirmed with the team 2026-08-24 — this is a REQUIREMENT, not the gap it
  // first looked like.
  //
  // So this asserts the exception rather than the rule, and it is a real assertion:
  // the location-keyed writes in TC09..TC13 are all still refused with 409, and the
  // moment somebody "fixes" this route by adding the lock, this test fails and asks
  // why. The pairing is the point — TC14 is what stops the freeze being tightened
  // past what the customer asked for.
  it('SW-IAUD-E2E-TC14: stocking out a serial is allowed even while its bin is frozen', { tags: ['@smoke'] }, function () {
    if (!scopeBin.serials.length) this.skip();
    const serial = scopeBin.serials[0];
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-out') }).then((seed) => {
      if (!seed) this.skip();
      // Registered BEFORE the stock-out, so the unit comes back whatever happens
      // next — this really does remove stock from a shared tenant.
      restores.add(() => restockBySerial(adminJwt, serial));

      stockOutBySerial(adminJwt, serial).then((res) => {
        expectAccepted(
          res,
          'the serial-keyed stock-out is deliberately exempt from the bin freeze — ' +
            'a unit that has left the building is recordable mid-count (customer requirement)'
        );

        // And the exemption is NARROW: the same bin still refuses a location-keyed
        // write. Without this half, a freeze that had stopped working entirely would
        // also pass the assertion above.
        assertRefusedWhileFrozen('assigning an item into the same frozen bin', () =>
          assignItemToLocation(adminJwt, seed.bin.locationId, serial)
        );
      });
    });
  });

  // Decision table — a receiving path targeting a serial in the frozen bin
  it('SW-IAUD-E2E-TC15: a receiving action on a serial in a frozen bin is refused', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-recv') }).then((seed) => {
      if (!seed) this.skip();
      // restock-by-serial-number goes through the same serial-keyed guard.
      restockBySerial(adminJwt, scopeBin.serials[0]).then((res) => {
        // An available serial may be refused for its own reasons; the freeze must
        // be the reason when it is the binding one.
        if (res.status === 409) {
          expect(JSON.stringify(res.body.error || {})).to.match(/BIN_FROZEN_FOR_AUDIT|being counted/i);
        } else {
          expect(
            isAccepted(res),
            'a non-freeze refusal is still a refusal, not a success'
          ).to.eq(false);
        }
      });
    });
  });

  // Use case — a refusal has to be actionable
  it('SW-IAUD-E2E-TC16: the refusal names the bin, the audit and who is counting', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-msg') }).then((seed) => {
      if (!seed) this.skip();
      assignItemToLocation(adminJwt, seed.bin.locationId, scopeBin.serials[0]).then((res) => {
        expect(res.status, 'the freeze refuses this write while the bin is counted').to.eq(409);
        const detail = (res.body.error.details && res.body.error.details[0]) || {};
        expect(detail.reason, 'a machine-readable reason the client can branch on').to.eq(
          'BIN_FROZEN_FOR_AUDIT'
        );
        expect(Number(detail.locationId), 'the bin').to.eq(Number(seed.bin.locationId));
        expect(detail.auditName, 'the blocking audit').to.eq(seed.auditName);
        expect(detail, 'and who holds it').to.have.property('countedByName');
      });
    });
  });

  // Use case — the collision is visible to a warehouse lead
  it('SW-IAUD-E2E-TC17: a blocked operation is recorded against the bin', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-log') }).then((seed) => {
      if (!seed) this.skip();
      assignItemToLocation(adminJwt, seed.bin.locationId, scopeBin.serials[0]).then(() =>
        getTrail(adminJwt, 'Location', String(seed.bin.locationId), 200).then((res) => {
          const blocked = trailActions(res).find((a) => /AUDIT_FREEZE_BLOCKED/i.test(a));
          expect(blocked, 'the turned-away attempt is on the record').to.exist;
        })
      );
    });
  });

  // Decision table — the freeze must be NARROW (the epic's own criterion)
  it('SW-IAUD-E2E-TC18: only the counted bin is frozen', { tags: ['@smoke'] }, function () {
    if (!siblings || !scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-narrow') }).then((seed) => {
      if (!seed) this.skip();
      if (Number(seed.bin.locationId) === Number(siblings.second.id)) this.skip();
      // The sibling bin must remain fully operable.
      //
      // Staged and RESTORED: this write really does move the serial when it
      // succeeds, and leaving it in the sibling thins the audited bin for every
      // later test in the file. The claim under test is only "not 409" — the freeze
      // is narrow — so where the serial ends up afterwards is incidental, and the
      // restore keeps it that way.
      stageSerialInOtherBin(adminJwt, scopeBin.serials[0], siblings.second.id, scopeBin.id).then(
        (staged) => {
          if (staged) restores.add(() => restoreSerialHome(adminJwt, staged));
          // A refusal is only interesting if it is the FREEZE refusing. The stager
          // reports null for any 4xx, so re-read the raw status when it declines.
          assignItemToLocation(adminJwt, siblings.second.id, scopeBin.serials[0], {
            force: true,
          }).then((res) => {
            expect(
              res.status,
              'a sibling bin in the same audit must accept writes — only the counted bin is frozen'
            ).to.not.eq(409);
          });
        }
      );
      getFrozenBins(adminJwt).then((res) => {
        const frozen = (unwrap(res) || []).map((f) => Number(f.locationId));
        expect(frozen, 'the counted bin is frozen').to.include(Number(seed.bin.locationId));
        expect(frozen, 'the sibling is not').to.not.include(Number(siblings.second.id));
      });
    });
  });

  // State transition — release, proved by the operation succeeding afterwards.
  // This is what stops the whole freeze group passing vacuously.
  it('SW-IAUD-E2E-TC19: submitting or cancelling releases the freeze', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-release') }).then((seed) => {
      if (!seed) this.skip();
      const serial = scopeBin.serials[0];
      // Refused now...
      assignItemToLocation(adminJwt, seed.bin.locationId, serial).then((before) => {
        expect(before.status, 'refused while frozen').to.eq(409);
        // ...released on submit, and the IDENTICAL call now goes through.
        submitBin(workerJwt, seed.bin.id, true).then((sub) => {
          expectAccepted(sub, 'the submit must succeed for the release to mean anything');
          getFrozenBins(adminJwt).then((res) => {
            const frozen = (unwrap(res) || []).map((f) => Number(f.locationId));
            expect(frozen, 'submit released the freeze').to.not.include(Number(seed.bin.locationId));
          });
          assignItemToLocation(adminJwt, seed.bin.locationId, serial).then((after) => {
            expect(
              after.status,
              'the same operation succeeds once released — this is what proves the refusal was the freeze'
            ).to.not.eq(409);
          });
        });
      });
    });
  });

  // Use case — the WMS indicator, the one UI checkpoint in this group
  it('SW-IAUD-E2E-TC20: the warehouse screen marks a bin that is being counted', function () {
    seedFrozenBin({ name: uniqueAuditName('e2e-fz-ui') }).then((seed) => {
      if (!seed) this.skip();
      cy.authSession('admin');
      cy.visit('/warehouse-management/locations/bins', { failOnStatusCode: false });
      auditDetail.warehouseShowsCountingIndicator().then((shown) => {
        if (!shown) this.skip(); // this build does not surface the indicator on this route
        cy.contains(/under audit|counting/i).should('be.visible');
      });
    });
  });

  // ==========================================================================
  // C. Never-placed stock
  // ==========================================================================

  // EP — the unplaced report
  it('SW-IAUD-E2E-TC21: the unplaced report lists on-hand stock filed in no bin', () => {
    seedCountableAudit({ name: uniqueAuditName('e2e-unplaced') }).then((seed) => {
      if (!seed) return;
      getUnplaced(adminJwt, seed.auditId, '?page=1&limit=25').then((res) => {
        expect(res.status).to.eq(200);
        const d = unwrap(res);
        expect(d, 'both halves are reported so two tabs can be labelled from one call').to.be.an('object');
        expect(JSON.stringify(d)).to.match(/serial|quantit/i);
      });
    });
  });

  /**
   * Stage a never-placed serial and register its restore.
   *
   * Unassigning is what produces the state: the unit stays on hand and keeps its
   * status, only its WMS placement is gone — which is precisely the stock
   * `GET /:id/unplaced` reports and the stock a Location count can file. Staged
   * BEFORE the audit exists, so generation does not expect the serial and the
   * scan genuinely lands on the never-placed branch.
   */
  /**
   * The serials the audited bin holds RIGHT NOW, as opposed to when `before()` ran.
   *
   * `scopeBin.serials` is a snapshot, and this file legitimately moves serials
   * around — TC22 files one, TC26 parks one in a sibling, TC58 unplaces one. Their
   * restores are queued on the `restores` queue and run in `afterEach`, so within a
   * test the bin can hold fewer serials than the snapshot claims. The two cases
   * that need TWO serials in one bin (TC56's "scan all but one" and TC57's approval)
   * were reading the snapshot, seeing 2, and then counting against a bin that held
   * 1 — which is why they skipped on their own guard in 0.0s.
   *
   * Reads Available units only, matching what count-task generation puts on a
   * serialized line.
   */
  const liveSerialsInScope = () =>
    listLocationItems(adminJwt, scopeBin.id).then((res) => {
      const body = unwrap(res);
      const rows = Array.isArray(body) ? body : (body && body.items) || [];
      return rows
        .filter((i) => String(i.itemStatus ?? i.status ?? 'Available') === 'Available')
        .map((i) => i.serial_number || i.serialNumber)
        .filter(Boolean);
    });

  const withUnplacedSerial = (ctx, run) => {
    const serial = scopeBin.serials[0];
    return stageUnplacedSerial(adminJwt, serial, scopeBin.id).then((staged) => {
      if (!staged) {
        ctx.skip(); // the unassign was refused — see pending.md §3
        return null;
      }
      restores.add(() => restoreUnplacedSerial(adminJwt, staged));
      return run(serial);
    });
  };

  // Decision table — assign-on-scan ON files a never-placed serial
  it('SW-IAUD-E2E-TC22: a Location count files a never-placed serial into the bin', { tags: ['@smoke'] }, function () {
    if (!scopeBin.serials.length) this.skip();
    withUnplacedSerial(this, (serial) =>
      seedFrozenBin({ name: uniqueAuditName('e2e-file-on'), assignOnScan: true }).then((seed) => {
        if (!seed) this.skip();
        scanSerial(workerJwt, seed.bin.id, serial).then((res) => {
          expectAccepted(res, 'the scan must be recorded');
          expect(
            unwrap(res).scanResult,
            'a never-placed serial found during a Location walk is filed by the scan'
          ).to.eq('Assigned');
          // The WMS write is the claim — read it back rather than trusting the label.
          listLocationItems(adminJwt, seed.bin.locationId).then((after) => {
            expect(
              serialsOf(after),
              'the scan actually wrote the placement, it did not merely report one'
            ).to.include(serial);
          });
        });
      })
    );
  });

  // Decision table — the same never-placed serial, filed into a CONTAINER in the bin
  it('SW-IAUD-E2E-TC23: a never-placed serial can be filed into a container in the bin', function () {
    if (!containerBin) this.skip(); // no container parked in a bin — pending.md §3
    if (!scopeBin.serials.length) this.skip();
    withUnplacedSerial(this, (serial) =>
      seedFrozenBin({
        name: uniqueAuditName('e2e-file-cont'),
        assignOnScan: true,
        scopeLocationId: containerBin.bin.id,
      }).then((seed) => {
        if (!seed) this.skip();
        scanSerial(workerJwt, seed.bin.id, serial, {
          containerId: containerBin.container.id,
        }).then((res) => {
          expectAccepted(res, 'the scan must be recorded');
          expect(
            unwrap(res).scanResult,
            'naming a container files the serial into it rather than loose in the bin'
          ).to.eq('Assigned');
        });
      })
    );
  });

  // Decision table — assign-on-scan OFF: the count records, but writes no placement
  it('SW-IAUD-E2E-TC24: with assign-on-scan off the count writes nothing to the warehouse model', function () {
    if (!scopeBin.serials.length) this.skip();
    withUnplacedSerial(this, (serial) =>
      seedFrozenBin({ name: uniqueAuditName('e2e-file-off'), assignOnScan: false }).then((seed) => {
        if (!seed) this.skip();
        scanSerial(workerJwt, seed.bin.id, serial).then((res) => {
          expectAccepted(res, 'the read is still recorded — counting is not the same as filing');
          expect(
            unwrap(res).scanResult,
            'with assign-on-scan off the count must not claim to have filed anything'
          ).to.not.eq('Assigned');
          listLocationItems(adminJwt, seed.bin.locationId).then((after) => {
            expect(
              serialsOf(after),
              'nothing was written to the warehouse model — that is what the toggle is for'
            ).to.not.include(serial);
          });
        });
      })
    );
  });

  // Decision table — an ABC count never files, whatever assign-on-scan says
  it('SW-IAUD-E2E-TC25: an ABC count never files a never-placed serial', function () {
    if (!scopeBin.serials.length) this.skip();
    // Filing is a Location-walk behaviour. An ABC count answers "how much of class
    // X is here", never "where does this belong", so it must not write placement
    // whatever the assign-on-scan default happens to be.
    const probe = (classes) => {
      if (!classes.length) return null;
      return getPreview(adminJwt, scopeBin.id, classes[0]).then((r) =>
        Number((unwrap(r) || {}).binCount) > 0 ? classes[0] : probe(classes.slice(1))
      );
    };
    probe(['A', 'B', 'C']).then((cls) => {
      if (!cls) this.skip(); // no ABC-classed stock in this scope — pending.md §1
      withUnplacedSerial(this, (serial) =>
        seedFrozenBin({
          name: uniqueAuditName('e2e-abc-nofile'),
          auditType: 'Abc',
          abcClass: cls,
        }).then((seed) => {
          if (!seed) this.skip();
          scanSerial(workerJwt, seed.bin.id, serial).then((res) => {
            if (!isAccepted(res)) {
              // An ABC count may refuse an off-class serial outright; either way it
              // must not have filed it, which the placement read below settles.
              cy.log(`ABC scan refused with ${res.status} — checking placement anyway`);
            }
            listLocationItems(adminJwt, seed.bin.locationId).then((after) => {
              expect(
                serialsOf(after),
                'an ABC count never writes a placement — only a Location walk does'
              ).to.not.include(serial);
            });
          });
        })
      );
    });
  });

  // Use case — stock recorded elsewhere is never moved silently
  it('SW-IAUD-E2E-TC26: a serial recorded in another bin is reported, not moved', function () {
    if (!siblings || !scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-misplaced') }).then((seed) => {
      if (!seed) this.skip();
      if (Number(seed.bin.locationId) === Number(siblings.second.id)) this.skip();
      // Park a serial in the SIBLING, then scan it into the counted bin.
      //
      // Through `stageSerialInOtherBin`, not a bare `assignItemToLocation`: the
      // serial is ALREADY filed in the counted bin (that is why the probe chose that
      // bin), and re-filing a placed serial elsewhere without `force` is refused, so
      // this staged nothing and the test skipped on its own guard. The stager also
      // pairs the move with `restoreSerialHome` — the bare call left the serial in
      // the sibling, which thinned the audited bin for every later test.
      stageSerialInOtherBin(adminJwt, scopeBin.serials[0], siblings.second.id, scopeBin.id).then((staged) => {
        if (!staged) this.skip(); // could not stage the precondition
        restores.add(() => restoreSerialHome(adminJwt, staged));
        scanSerial(workerJwt, seed.bin.id, scopeBin.serials[0]).then((res) => {
          expectAccepted(res, 'the scan must be recorded');
          const d = unwrap(res);
          expect(d.scanResult, 'the scan reports a misplacement').to.eq('Misplaced');
          // `correctionAllowed`, not `needsPlacement`: the latter is a field of the
          // scan ROW in the task tree (WorkerScanDto), not of the scan RESPONSE
          // (ScanResultDto). Asserting it here read `undefined` every time.
          // TC27 asserts the same field is FALSE once the admin disables correction.
          expect(d.correctionAllowed, 'and offers the worker a decision').to.eq(true);
          // Nothing moved without confirmation.
          listLocationItems(adminJwt, siblings.second.id).then((items) => {
            const body = unwrap(items);
            const serials = (Array.isArray(body) ? body : body.items || []).map(
              (i) => i.serial_number || i.serialNumber
            );
            expect(serials, 'the serial is still where the system had it').to.include(scopeBin.serials[0]);
          });
        });
      });
    });
  });

  // State transition — the offered move is TAKEN, and the placement follows
  it('SW-IAUD-E2E-TC27: confirming a misplacement relocates the serial, unless correction is disabled', function () {
    if (!siblings || !scopeBin.serials.length) this.skip();
    const serial = scopeBin.serials[0];
    // Park it in the sibling first, so the counted bin genuinely does not hold it.
    stageSerialInOtherBin(adminJwt, serial, siblings.second.id, scopeBin.id).then((staged) => {
      if (!staged) this.skip(); // could not stage the precondition
      restores.add(() => restoreSerialHome(adminJwt, staged));
      seedFrozenBin({ name: uniqueAuditName('e2e-confirm-move') }).then((seed) => {
        if (!seed) this.skip();
        if (Number(seed.bin.locationId) === Number(siblings.second.id)) this.skip();
        scanSerial(workerJwt, seed.bin.id, serial).then((scan) => {
          expectAccepted(scan, 'the scan must be recorded');
          expect(unwrap(scan).scanResult, 'the system has it somewhere else').to.eq('Misplaced');
          // Confirming is a SEPARATE call — the scan alone never moves stock.
          moveMisplaced(workerJwt, seed.bin.id, { serialNumber: serial }).then((moved) => {
            expectAccepted(moved, 'confirming the move must succeed');
            listLocationItems(adminJwt, seed.bin.locationId).then((here) => {
              expect(serialsOf(here), 'the serial moved to the counted bin').to.include(serial);
            });
            listLocationItems(adminJwt, siblings.second.id).then((there) => {
              expect(serialsOf(there), 'and left the bin it was recorded in').to.not.include(serial);
            });
          });
        });
      });
    });

    // ---- Column 2: the same scan with worker correction turned OFF ----------
    // Part of the same decision table, so it lives in the same TC: the plan's
    // TC27 is "confirming relocates the serial, UNLESS correction is disabled".
    //
    // Release column 1's audit FIRST. One live audit per scope is a real product
    // rule, so the create below would be refused with 409 AUDIT_SCOPE_OVERLAP,
    // `seedFrozenBin` would yield null, and this column would quietly assert
    // nothing at all while still reporting green.
    cy.then(() => {
      const held = created.splice(0, created.length);
      held.forEach((id) => forceReleaseAudit(adminJwt, workerJwt, id));
    });

    getSettings(adminJwt).then((before) => {
      const original = unwrap(before) || {};
      // Tenant-global setting — capture and restore, or every worker in the tenant
      // keeps the flag this test flipped.
      restores.add(() =>
        putSettings(adminJwt, {
          enableWorkerLocationCorrection: original.enableWorkerLocationCorrection !== false,
        })
      );
      putSettings(adminJwt, { enableWorkerLocationCorrection: false }).then((set) => {
        if (!isAccepted(set)) {
          cy.log('could not flip enableWorkerLocationCorrection — column 2 not exercised');
          return;
        }
        stageSerialInOtherBin(adminJwt, serial, siblings.second.id, scopeBin.id).then((again) => {
          if (!again) {
            cy.log('could not re-park the serial — column 2 not exercised');
            return;
          }
          restores.add(() => restoreSerialHome(adminJwt, again));
          seedFrozenBin({ name: uniqueAuditName('e2e-nocorrect') }).then((seed2) => {
            if (!seed2 || Number(seed2.bin.locationId) === Number(siblings.second.id)) {
              cy.log('no usable second audit — column 2 not exercised');
              return;
            }
            scanSerial(workerJwt, seed2.bin.id, serial).then((scan2) => {
              expectAccepted(scan2, 'the scan is still recorded');
              const d2 = unwrap(scan2);
              expect(d2.scanResult, 'the misplacement is still REPORTED').to.eq('Misplaced');
              expect(
                d2.correctionAllowed,
                'but the worker is not offered the move — the admin turned that off'
              ).to.eq(false);
            });
          });
        });
      });
    });
  });


  // Decision table — a serial that is not on-hand.
  // The physical unit is on the shelf; the system says it is gone. The count has to
  // say so rather than quietly counting it, because that gap is the whole point of
  // auditing.
  it('SW-IAUD-E2E-TC28: a serial that is not on-hand is reported as a status conflict', function () {
    if (!scopeBin.serials.length) this.skip();
    const serial = scopeBin.serials[0];
    stageStockedOutSerialInBin(adminJwt, serial, scopeBin.id).then((staged) => {
      // `null` means this build clears the placement on stock-out, so the state
      // under test ("stocked out but still filed here") cannot exist — the stager
      // has already restocked, so nothing is left behind.
      if (!staged) this.skip(); // see pending.md §3
      restores.add(() => restoreStockedOutSerial(adminJwt, staged));
      seedFrozenBin({ name: uniqueAuditName('e2e-notonhand') }).then((seed) => {
        if (!seed) this.skip();
        scanSerial(workerJwt, seed.bin.id, serial).then((res) => {
          expectAccepted(res, 'the read is recorded — the worker did find it');
          expect(
            unwrap(res).scanResult,
            'the serial is physically here but the system does not hold it as on-hand stock'
          ).to.eq('StatusConflict');
        });
      });
    });
  });

  // EP — a serial unknown to the system
  it('SW-IAUD-E2E-TC29: a serial unknown to the system is reported as unregistered', function () {
    seedFrozenBin({ name: uniqueAuditName('e2e-unknown') }).then((seed) => {
      if (!seed) this.skip();
      const unknown = `CY-UNKNOWN-${Date.now()}`;
      scanSerial(workerJwt, seed.bin.id, unknown).then((res) => {
        expectAccepted(res, 'a Location audit records it rather than refusing');
        expect(unwrap(res).scanResult, 'an unregistered read is recorded, not refused').to.eq('NotFound');
        // It surfaces to the admin as an unregistered serial.
        submitBin(workerJwt, seed.bin.id, true).then(() =>
          getDiscrepancies(adminJwt, seed.auditId).then((d) => {
            const scans = unwrap(d).unresolvedScans || [];
            expect(
              scans.map((s) => s.serialNumber),
              'unregistered reads reach the review screen'
            ).to.include(unknown);
          })
        );
      });
    });
  });

  // Use case — the unplaced report is a worklist, so filing must clear the row
  it('SW-IAUD-E2E-TC30: filing a serial removes it from the unplaced report', function () {
    if (!scopeBin.serials.length) this.skip();
    withUnplacedSerial(this, (serial) =>
      seedFrozenBin({ name: uniqueAuditName('e2e-unplaced-drop'), assignOnScan: true }).then((seed) => {
        if (!seed) this.skip();
        const unplacedSerials = (res) =>
          ((unwrap(res) || {}).serials || (unwrap(res) || {}).list || []).map((r) => r.serialNumber);
        // Search by the serial so the answer cannot depend on which page it is on.
        getUnplaced(adminJwt, seed.auditId, `?kind=serials&search=${encodeURIComponent(serial)}&page=1&limit=25`)
          .then((before) => {
            expect(
              unplacedSerials(before),
              'the staged serial starts out as stock the count could not have found'
            ).to.include(serial);
            return scanSerial(workerJwt, seed.bin.id, serial);
          })
          .then((scan) => {
            expectAccepted(scan, 'the scan files it');
            return getUnplaced(
              adminJwt,
              seed.auditId,
              `?kind=serials&search=${encodeURIComponent(serial)}&page=1&limit=25`
            );
          })
          .then((after) => {
            expect(
              unplacedSerials(after),
              'once the count files it, it is no longer stock the count could not have found'
            ).to.not.include(serial);
          });
      })
    );
  });

  // ==========================================================================
  // D. A clean Location audit, end to end
  // ==========================================================================

  // Use case — the whole clean walk
  it('SW-IAUD-E2E-TC31: a clean Location audit runs from creation to completion', { tags: ['@smoke'] }, function () {
    seedCountableAudit({ name: uniqueAuditName('e2e-clean') }).then((seed) => {
      if (!seed || !seed.bins.length) this.skip();
      // Count every bin to match, exactly.
      const countBin = (bin) =>
        startBin(workerJwt, bin.id).then(() =>
          getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
            const wBin = (unwrap(tRes).bins || []).find((b) => b.id === bin.id);
            const lines = wBin.lines || [];
            const serialScans = lines
              .filter((l) => l.isSerialized)
              .reduce((acc, l) => acc.concat((l.expectedSerials || []).slice(0)), []);
            // Serialized lines: scan what the bin is known to hold.
            const scanChain = (scopeBin.serials || []).reduce(
              (acc, s) => acc.then(() => scanSerial(workerJwt, bin.id, s)),
              cy.wrap(null, { log: false })
            );
            void serialScans;
            // Non-serial lines: enter exactly the expected figure.
            return scanChain
              .then(() =>
                lines
                  .filter((l) => !l.isSerialized)
                  .reduce(
                    (acc, l) =>
                      acc.then(() =>
                        enterQuantity(workerJwt, bin.id, {
                          lineId: l.id,
                          countedQuantity: l.expectedQuantity,
                        })
                      ),
                    cy.wrap(null, { log: false })
                  )
              )
              .then(() => submitBin(workerJwt, bin.id, true));
          })
        );

      seed.bins
        .reduce((acc, bin) => acc.then(() => countBin(bin)), cy.wrap(null, { log: false }))
        .then(() =>
          getAudit(adminJwt, seed.auditId).then((res) => {
            expect(unwrap(res).status, 'every bin submitted sends the audit to review').to.eq(
              'PendingReview'
            );
            // A Location audit closes with no per-line review.
            return closeAuditApi(adminJwt, seed.auditId).then((c) => {
              expectAccepted(c, 'a Location audit closes directly');
              expect(unwrap(c).status).to.eq('Completed');
            });
          })
        );
    });
  });

  // Use case — a clean audit changes nothing
  it('SW-IAUD-E2E-TC32: a clean audit changes no inventory', { tags: ['@smoke'] }, function () {
    getPreview(adminJwt, scopeBin.id).then((before) => {
      const unitsBefore = Number(unwrap(before).totalExpectedUnits);
      seedCountableAudit({ name: uniqueAuditName('e2e-nochange') }).then((seed) => {
        if (!seed || !seed.bins.length) this.skip();
        const bin = seed.bins[0];
        startBin(workerJwt, bin.id)
          .then(() => submitBin(workerJwt, bin.id, true))
          .then(() => getPreview(adminJwt, scopeBin.id))
          .then((after) => {
            expect(
              Number(unwrap(after).totalExpectedUnits),
              'counting without approving an adjustment must not move stock'
            ).to.eq(unitsBefore);
          });
      });
    });
  });

  // Use case — the close-out report of a clean audit
  it('SW-IAUD-E2E-TC33: the close-out report of a clean audit reports a clean count', function () {
    seedCountableAudit({ name: uniqueAuditName('e2e-report') }).then((seed) => {
      if (!seed || !seed.bins.length) this.skip();
      const bin = seed.bins[0];
      startBin(workerJwt, bin.id)
        .then(() => submitBin(workerJwt, bin.id, true))
        .then(() => getReport(adminJwt, seed.auditId))
        .then((res) => {
          expect(res.status).to.eq(200);
          const report = unwrap(res);
          expect(report, 'the report names who counted what').to.be.an('object');
          expect(JSON.stringify(report)).to.match(/count|bin|serial/i);
        });
    });
  });

  // State transition — Completed is terminal and releases the name
  it('SW-IAUD-E2E-TC34: a completed audit is terminal and releases its name', function () {
    const name = uniqueAuditName('e2e-terminal');
    seedCountableAudit({ name }).then((seed) => {
      if (!seed || !seed.bins.length) this.skip();
      const bin = seed.bins[0];
      startBin(workerJwt, bin.id)
        .then(() => submitBin(workerJwt, bin.id, true))
        .then(() => closeAuditApi(adminJwt, seed.auditId))
        .then((c) => {
          if (!isAccepted(c)) this.skip(); // could not reach Completed on this data
          // Cancel is refused...
          return cancelAuditApi(adminJwt, seed.auditId).then((cancel) => {
            expect(cancel.status, 'a Completed audit cannot be cancelled').to.eq(400);
            // ...and the name is reusable.
            return createAudit(adminJwt, {
              name,
              auditType: 'Location',
              scopeLocationId: scopeBin.id,
              workers: [{ userId: workerId }],
            }).then((again) => {
              if (again.status === 409) {
                const detail = (again.body.error.details && again.body.error.details[0]) || {};
                expect(
                  detail.code,
                  'the only legitimate 409 here is a scope overlap, not a name clash'
                ).to.eq('AUDIT_SCOPE_OVERLAP');
              } else {
                expect(again.status, 'a Completed audit no longer holds its name').to.be.oneOf([200, 201]);
                created.push(unwrap(again).id);
              }
            });
          });
        });
    });
  });

  // ==========================================================================
  // E. A clean audit over container-held stock
  // ==========================================================================

  // Use case — the whole clean-count journey, over container-held stock
  it('SW-IAUD-E2E-TC35: a clean audit of container-held stock runs to completion', function () {
    if (!containerBin) this.skip(); // no container parked in a bin — pending.md §3
    seedCountableAudit({
      name: uniqueAuditName('e2e-cont-clean'),
      scopeLocationId: containerBin.bin.id,
    }).then((seed) => {
      if (!seed || !seed.bins.length) this.skip();
      const bin = seed.bins[0];
      startBin(workerJwt, bin.id)
        .then(() => submitBin(workerJwt, bin.id, true))
        .then(() => closeAuditApi(adminJwt, seed.auditId))
        .then((c) => {
          expectAccepted(c, 'a container-held Location audit closes like any other');
          expect(unwrap(c).status).to.eq('Completed');
        });
    });
  });

  // Decision table — expected units include the parked container, exclude damaged
  it('SW-IAUD-E2E-TC36: expected units include a parked container and exclude damaged stock', function () {
    if (!containerBin) this.skip();
    getPreview(adminJwt, containerBin.bin.id).then((res) => {
      expect(res.status).to.eq(200);
      const d = unwrap(res);
      // `at.least(0)` would be true of every possible count, including the zero
      // this assertion exists to rule out. Skip when the probed container genuinely
      // holds nothing (a fixture gap, not a defect) and assert a real floor otherwise.
      if (Number(d.totalExpectedUnits) === 0) {
        this.skip(); // the parked container holds no stock here — see pending.md §3
      }
      expect(
        Number(d.totalExpectedUnits),
        'a bin whose stock lives in a parked container still has expected units'
      ).to.be.at.least(1);
      expect(
        Number(d.totalExpectedUnits),
        'totals stay internally consistent'
      ).to.eq(Number(d.serializedUnits) + Number(d.nonSerialUnits));
    });
  });

  // Use case — a clean count is non-destructive to the container it walked
  it('SW-IAUD-E2E-TC37: a clean container count leaves the container exactly as it was', function () {
    if (!containerBin) this.skip();
    cy.request({
      method: 'GET',
      url: `${Cypress.env('API_BASE_URL')}/location-assignments/${containerBin.bin.id}/containers`,
      headers: { Authorization: `Bearer ${adminJwt}` },
      failOnStatusCode: false,
    }).then((before) => {
      const snapshot = JSON.stringify(unwrap(before));
      seedCountableAudit({
        name: uniqueAuditName('e2e-cont-same'),
        scopeLocationId: containerBin.bin.id,
      }).then((seed) => {
        if (!seed || !seed.bins.length) this.skip();
        startBin(workerJwt, seed.bins[0].id)
          .then(() => submitBin(workerJwt, seed.bins[0].id, true))
          .then(() =>
            cy.request({
              method: 'GET',
              url: `${Cypress.env('API_BASE_URL')}/location-assignments/${containerBin.bin.id}/containers`,
              headers: { Authorization: `Bearer ${adminJwt}` },
              failOnStatusCode: false,
            })
          )
          .then((after) => {
            expect(
              JSON.stringify(unwrap(after)),
              'counting a container changes neither its contents nor where it is parked'
            ).to.eq(snapshot);
          });
      });
    });
  });

  // Use case — the container history is how a lead reconstructs who walked it
  it('SW-IAUD-E2E-TC38: a container history shows the count that walked it', function () {
    if (!containerBin) this.skip(); // no container parked in a bin — pending.md §3
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({
      name: uniqueAuditName('e2e-cont-history'),
      scopeLocationId: containerBin.bin.id,
    }).then((seed) => {
      if (!seed) this.skip();
      scanSerial(workerJwt, seed.bin.id, scopeBin.serials[0], {
        containerId: containerBin.container.id,
      })
        .then(() => submitBin(workerJwt, seed.bin.id, true))
        .then(() => getTrail(adminJwt, 'Container', String(containerBin.container.id), 200))
        .then((res) => {
          const rows = trailRowsForAudit(res, seed.auditId);
          expect(
            rows.length,
            'a warehouse lead reading the container history can see the count that walked it'
          ).to.be.at.least(1);
          expect(
            rows.map((r) => String(r.actionType)).join(','),
            'and what the count did to it'
          ).to.match(/SCAN|COUNT|SUBMIT/i);
        });
    });
  });

  // ==========================================================================
  // F. A discrepancy, end to end
  // ==========================================================================

  /**
   * Count one short on a non-serial line and submit — the discrepancy fixture.
   *
   * An **Abc** audit, deliberately: per-line review is refused outright on a
   * Location audit (see `reviewClass`). Yields null when the scope holds no
   * ABC-classed stock, so callers skip rather than fail.
   */
  const seedDiscrepancy = (name) =>
    (!reviewClass
      ? cy.wrap(null, { log: false })
      : seedFrozenBin({ name, auditType: 'Abc', abcClass: reviewClass })
    ).then((seed) => {
      if (!seed) return null;
      return getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const line = (bin.lines || []).find((l) => !l.isSerialized && l.expectedQuantity > 0);
        if (!line) return null;
        return enterQuantity(workerJwt, seed.bin.id, {
          lineId: line.id,
          countedQuantity: line.expectedQuantity - 1,
        })
          .then(() => submitBin(workerJwt, seed.bin.id, true))
          .then(() => getDiscrepancies(adminJwt, seed.auditId))
          .then((dRes) => {
            // MATCH THE PRODUCT WE COUNTED — never `lines[0]`.
            //
            // Submitting with `confirmUncounted` records a full shortage on every
            // uncounted line, INCLUDING the serialized ones, and the review list is
            // not ordered by anything this test controls. Taking the first row
            // therefore handed a SERIALIZED line to the approvals below, and
            // approving one of those marks real units `Missing` — it did exactly
            // that to serial 16FL082 on 2026-08-20 before this guard existed.
            const dLine = (unwrap(dRes).lines || []).find(
              (l) => Number(l.productId) === Number(line.productId) && !l.isSerialized
            );
            return dLine ? Object.assign({}, seed, { line, dLine }) : null;
          });
      });
    });

  // Use case — counting short produces the exact difference
  it('SW-IAUD-E2E-TC39: counting short produces a discrepancy carrying the exact difference', { tags: ['@smoke'] }, function () {
    if (!scopeBin.quantities.length) this.skip();
    seedDiscrepancy(uniqueAuditName('e2e-short')).then((seed) => {
      if (!seed) this.skip();
      expect(Number(seed.dLine.differenceQuantity), 'one unit short is a difference of -1').to.eq(-1);
      getAudit(adminJwt, seed.auditId).then((res) => {
        expect(unwrap(res).status).to.eq('PendingReview');
      });
    });
  });

  // State transition — approving applies the adjustment
  it('SW-IAUD-E2E-TC40: approving a discrepancy applies the adjustment', { tags: ['@smoke'] }, function () {
    if (!scopeBin.quantities.length) this.skip();
    seedDiscrepancy(uniqueAuditName('e2e-approve')).then((seed) => {
      if (!seed) this.skip();
      getPreview(adminJwt, scopeBin.id).then((before) => {
        const unitsBefore = Number(unwrap(before).nonSerialUnits);
        approveLine(adminJwt, seed.auditId, seed.dLine.lineId, 'Miscount').then((res) => {
          expectAccepted(res, 'the approval must succeed');
          const d = unwrap(res);
          expect(d.reviewStatus, 'the line is approved').to.eq('Approved');
          expect(d.adjustment, 'an approve reports what it moved').to.exist;
          expect(Number(d.adjustment.netUnits), 'the adjustment matches the counted difference').to.eq(-1);
          // The report is not the proof — read the on-hand figure back.
          getPreview(adminJwt, scopeBin.id).then((after) => {
            expect(
              Number(unwrap(after).nonSerialUnits),
              'the approval actually moved stock, it did not merely claim to'
            ).to.eq(unitsBefore - 1);
            // Restore the unit the adjustment removed.
            addQuantityToLocation(adminJwt, seed.bin.locationId, seed.line.productId, 1);
          });
        });
      });
    });
  });

  // State transition — rejecting changes nothing
  it('SW-IAUD-E2E-TC41: rejecting a discrepancy changes no inventory', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedDiscrepancy(uniqueAuditName('e2e-reject')).then((seed) => {
      if (!seed) this.skip();
      getPreview(adminJwt, scopeBin.id).then((before) => {
        const unitsBefore = Number(unwrap(before).totalExpectedUnits);
        rejectLine(adminJwt, seed.auditId, seed.dLine.lineId).then((res) => {
          expectAccepted(res, 'the rejection must succeed');
          expect(unwrap(res).reviewStatus).to.eq('Rejected');
          getPreview(adminJwt, scopeBin.id).then((after) => {
            expect(
              Number(unwrap(after).totalExpectedUnits),
              'a rejected discrepancy moves no stock'
            ).to.eq(unitsBefore);
          });
        });
      });
    });
  });

  // Decision table — a reason is required to approve
  it('SW-IAUD-E2E-TC42: a discrepancy cannot be approved without a reason', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedDiscrepancy(uniqueAuditName('e2e-noreason')).then((seed) => {
      if (!seed) this.skip();
      approveLine(adminJwt, seed.auditId, seed.dLine.lineId).then((res) => {
        expect(res.status, 'approving with no reason is refused').to.be.oneOf([400, 409]);
        getDiscrepancies(adminJwt, seed.auditId).then((d) => {
          const line = (unwrap(d).lines || []).find((l) => l.lineId === seed.dLine.lineId);
          expect(line.reviewStatus, 'the line is still awaiting a decision').to.not.eq('Approved');
        });
      });
    });
  });

  // State transition — the recount round trip
  it('SW-IAUD-E2E-TC43: a recount returns the bin to the worker and clears the prior count', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedDiscrepancy(uniqueAuditName('e2e-recount')).then((seed) => {
      if (!seed) this.skip();
      requestRecount(adminJwt, seed.auditId, seed.dLine.lineId).then((res) => {
        expectAccepted(res, 'the recount request must succeed');
        getBins(adminJwt, seed.auditId).then((b) => {
          const bin = unwrap(b).find((x) => x.id === seed.bin.id);
          expect(bin.status, 'the bin goes back to the worker for a recount').to.eq('RecountRequested');
        });
        // Restarting it discards the prior count and records what was thrown away.
        startBin(workerJwt, seed.bin.id).then((s) => {
          expectAccepted(s, 'the worker can restart their own bin');
          getTrail(adminJwt, 'Location', String(seed.bin.locationId), 200).then((t) => {
            const actions = trailActions(t).join(',');
            expect(actions, 'the discarded count is on the record').to.match(/CLEARED|START_BIN/i);
          });
          // ...and resubmitting brings it back for review.
          submitBin(workerJwt, seed.bin.id, true).then((sub) => {
            expectAccepted(sub, 'the resubmit brings it back for review');
          });
        });
      });
    });
  });

  // State transition — an ABC audit completes once every line is resolved.
  // The counterpart to the TC46 defect probe: an ABC audit that HAS a discrepancy
  // does have a route out, because resolving the last line runs finalizeReview.
  it('SW-IAUD-E2E-TC44: an ABC audit completes once every discrepancy is resolved', function () {
    if (!scopeBin.quantities.length) this.skip();
    const probe = (classes) => {
      if (!classes.length) return null;
      return getPreview(adminJwt, scopeBin.id, classes[0]).then((r) =>
        Number((unwrap(r) || {}).binCount) > 0 ? classes[0] : probe(classes.slice(1))
      );
    };
    probe(['A', 'B', 'C']).then((cls) => {
      if (!cls) this.skip(); // no ABC-classed stock in this scope — pending.md §1
      seedFrozenBin({
        name: uniqueAuditName('e2e-abc-complete'),
        auditType: 'Abc',
        abcClass: cls,
      }).then((seed) => {
        if (!seed) this.skip();
        getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
          const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
          const line = (bin.lines || []).find((l) => !l.isSerialized && l.expectedQuantity > 0);
          if (!line) this.skip(); // this class holds no countable non-serial line here
          enterQuantity(workerJwt, seed.bin.id, {
            lineId: line.id,
            countedQuantity: line.expectedQuantity - 1,
          })
            .then(() => submitBin(workerJwt, seed.bin.id, true))
            .then(() => getDiscrepancies(adminJwt, seed.auditId))
            .then((dRes) => {
              const lines = unwrap(dRes).lines || [];
              expect(lines.length, 'the short count produced a line to resolve').to.be.at.least(1);
              // Resolve every open line — the gate is "none left", not "one done".
              // Serialized lines are REJECTED rather than approved: approving one
              // marks its units `Missing` for real, and this TC is about the
              // completion gate, not about writing off stock. A rejection resolves
              // the line just as well and moves nothing.
              return lines.reduce(
                (acc, l) =>
                  acc.then(() =>
                    l.isSerialized
                      ? rejectLine(adminJwt, seed.auditId, l.lineId)
                      : approveLine(adminJwt, seed.auditId, l.lineId, 'Miscount')
                  ),
                cy.wrap(null, { log: false })
              );
            })
            .then(() => getAudit(adminJwt, seed.auditId))
            .then((res) => {
              expect(
                unwrap(res).status,
                'resolving the last discrepancy is what completes an ABC audit'
              ).to.eq('Completed');
              // Put back the unit the approval removed.
              addQuantityToLocation(adminJwt, seed.bin.locationId, line.productId, 1);
            });
        });
      });
    });
  });

  // State transition — the completion gate holds while a line is open
  it('SW-IAUD-E2E-TC45: an audit with an unresolved discrepancy cannot complete', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedDiscrepancy(uniqueAuditName('e2e-gate')).then((seed) => {
      if (!seed) this.skip();
      getAudit(adminJwt, seed.auditId).then((res) => {
        expect(
          unwrap(res).status,
          'an audit with an open discrepancy stays in review, it does not complete'
        ).to.eq('PendingReview');
      });
    });
  });

  // Error guessing — THE DEFECT PROBE. Expected to fail on today's code.
  //
  // A clean ABC audit has no route to Completed: submitBin only ever writes
  // PendingReview, closeAudit refuses a non-Location audit, and finalizeReview runs
  // only from a review action — which a zero-discrepancy audit has none of. Read
  // the callout under plan §9.3 group F before "fixing" this.
  it('SW-IAUD-E2E-TC46: a perfectly clean ABC audit can reach a terminal state', function () {
    // Find a class the scope actually holds, so the audit generates bins.
    const probe = (classes) => {
      if (!classes.length) return null;
      return getPreview(adminJwt, scopeBin.id, classes[0]).then((r) =>
        Number((unwrap(r) || {}).binCount) > 0 ? classes[0] : probe(classes.slice(1))
      );
    };
    probe(['A', 'B', 'C']).then((cls) => {
      if (!cls) this.skip(); // no ABC-classed stock in this scope — pending.md §1
      seedCountableAudit({
        name: uniqueAuditName('e2e-cleanabc'),
        auditType: 'Abc',
        abcClass: cls,
        assignOnScan: undefined,
      }).then((seed) => {
        if (!seed || !seed.bins.length) this.skip();
        const bin = seed.bins[0];
        startBin(workerJwt, bin.id)
          .then(() =>
            getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
              const wBin = (unwrap(tRes).bins || []).find((b) => b.id === bin.id);
              // Count every line EXACTLY — a genuinely clean count.
              return (wBin.lines || [])
                .filter((l) => !l.isSerialized)
                .reduce(
                  (acc, l) =>
                    acc.then(() =>
                      enterQuantity(workerJwt, bin.id, {
                        lineId: l.id,
                        countedQuantity: l.expectedQuantity,
                      })
                    ),
                  (scopeBin.serials || []).reduce(
                    (acc, s) => acc.then(() => scanSerial(workerJwt, bin.id, s)),
                    cy.wrap(null, { log: false })
                  )
                );
            })
          )
          .then(() => submitBin(workerJwt, bin.id, true))
          .then(() => getDiscrepancies(adminJwt, seed.auditId))
          .then((d) => {
            const summary = unwrap(d).summary || {};
            expect(
              Number(summary.totalDiscrepancies),
              'the fixture must be a genuinely clean count for this probe to mean anything'
            ).to.eq(0);
            return getAudit(adminJwt, seed.auditId);
          })
          .then((res) => {
            const status = unwrap(res).status;
            if (status === 'Completed') return null;
            // Not complete — is there ANY route out? Close refuses an ABC audit.
            return closeAuditApi(adminJwt, seed.auditId).then((c) => {
              expect(
                c.status,
                'KNOWN DEFECT: a clean ABC audit is stranded in PendingReview — no line to approve, ' +
                  'and close refuses a non-Location audit. It keeps holding its name and its only exit ' +
                  'is Cancel, which files a successful count as abandoned. See plan §9.3 group F.'
              ).to.be.oneOf([200, 201]);
            });
          });
      });
    });
  });

  // ==========================================================================
  // G. The two product families
  // ==========================================================================

  // Use case — a pure product counted by quantity
  it('SW-IAUD-E2E-TC47: a pure product is counted clean by entering its quantity', { tags: ['@smoke'] }, function () {
    if (!scopeBin.quantities.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-pure') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const line = (bin.lines || []).find((l) => !l.isSerialized && l.expectedQuantity > 0);
        if (!line) this.skip();
        enterQuantity(workerJwt, seed.bin.id, {
          lineId: line.id,
          countedQuantity: line.expectedQuantity,
        })
          .then((res) => {
            expectAccepted(res, 'the counted quantity must be recorded');
            return submitBin(workerJwt, seed.bin.id, true);
          })
          .then((sub) => {
            const result = (unwrap(sub).lineResults || []).find((r) => r.lineId === line.id);
            expect(result.lineType, 'counting exactly the expected figure is a Match').to.eq('Match');
            expect(Number(result.differenceQuantity)).to.eq(0);
          });
      });
    });
  });

  // Decision table — shortage and overage on a non-serial line
  /**
   * Count a non-serial line off by `delta`, submit, then APPROVE and verify the
   * inventory actually moved by exactly that much.
   *
   * The line type alone is not the assertion the plan asks for: a Shortage that
   * approves into a no-op, or into the wrong magnitude, would still report
   * `lineType: 'Shortage'`. What matters is that the approval MOVES STOCK, by the
   * counted difference and no more — so the product's on-hand figure is read
   * before and after, and the reported `adjustment.netUnits` is cross-checked
   * against it. Reading only one of the two would miss a service that reports an
   * adjustment it never applied (or applies one it never reports).
   */
  const pureProductDifferenceApplied = (name, delta, expectedType) =>
    // Abc, not Location: this helper APPROVES the difference, and approve is refused
    // on a Location audit ("use Close").
    (!reviewClass
      ? cy.wrap(null, { log: false })
      : seedFrozenBin({ name, auditType: 'Abc', abcClass: reviewClass })
    ).then((seed) => {
      if (!seed) return null;
      return getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        // An overage needs headroom; a shortage needs at least one unit to lose.
        const line = (bin.lines || []).find((l) => !l.isSerialized && l.expectedQuantity > 0);
        if (!line) return null;
        return getPreview(adminJwt, scopeBin.id).then((beforeRes) => {
          const unitsBefore = Number(unwrap(beforeRes).nonSerialUnits);
          return enterQuantity(workerJwt, seed.bin.id, {
            lineId: line.id,
            countedQuantity: line.expectedQuantity + delta,
          })
            .then(() => submitBin(workerJwt, seed.bin.id, true))
            .then((sub) => {
              const result = (unwrap(sub).lineResults || []).find((r) => r.lineId === line.id);
              expect(result.lineType, `${delta > 0 ? 'over' : 'under'}-counting is a ${expectedType}`).to.eq(
                expectedType
              );
              expect(Number(result.differenceQuantity), 'the recorded difference is exact').to.eq(delta);
              return getDiscrepancies(adminJwt, seed.auditId);
            })
            .then((dRes) => {
              const dLine = (unwrap(dRes).lines || []).find(
                (l) => Number(l.productId) === Number(line.productId) && !l.isSerialized
              );
              expect(dLine, 'the difference reached the review screen as a discrepancy').to.exist;
              return approveLine(adminJwt, seed.auditId, dLine.lineId, 'Miscount');
            })
            .then((aRes) => {
              expectAccepted(aRes, 'the approval is accepted');
              const adj = unwrap(aRes).adjustment;
              expect(adj, 'an approve reports what it moved').to.exist;
              expect(
                Number(adj.netUnits),
                'the reported adjustment equals the counted difference'
              ).to.eq(delta);
              return getPreview(adminJwt, scopeBin.id);
            })
            .then((afterRes) => {
              expect(
                Number(unwrap(afterRes).nonSerialUnits),
                `approving a ${expectedType} must move the on-hand figure by exactly ${delta} — ` +
                  'an adjustment that is reported but not applied looks identical without this check'
              ).to.eq(unitsBefore + delta);
              return Object.assign({}, seed, { line, unitsBefore });
            });
        });
      });
    });

  // Decision table + adjustment verification — a shortage lowers stock by the difference
  it('SW-IAUD-E2E-TC48: counting a pure product short produces a shortage that applies', function () {
    if (!scopeBin.quantities.length) this.skip();
    if (!reviewClass) this.skip(); // approve needs an Abc audit — see `reviewClass`
    pureProductDifferenceApplied(uniqueAuditName('e2e-pure-short'), -1, 'Shortage').then((r) => {
      if (!r) this.skip();
      // Put the unit back so the next run starts where this one did.
      cy.log('restoring the approved shortage');
      addQuantityToLocation(adminJwt, r.bin.locationId, r.line.productId, 1);
    });
  });

  // Decision table + adjustment verification — an overage raises stock by the difference
  it('SW-IAUD-E2E-TC49: counting a pure product long produces an overage that applies', function () {
    if (!scopeBin.quantities.length) this.skip();
    if (!reviewClass) this.skip(); // approve needs an Abc audit — see `reviewClass`
    pureProductDifferenceApplied(uniqueAuditName('e2e-pure-over'), 1, 'Overage').then((r) => {
      if (!r) this.skip();
      // Remove the unit the approval added.
      addQuantityToLocation(adminJwt, r.bin.locationId, r.line.productId, -1);
    });
  });

  // BVA — a counted zero is a real count, not an uncounted line
  it('SW-IAUD-E2E-TC50: a counted zero on a pure-product line is a real count', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-pure-zero') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const line = (bin.lines || []).find((l) => !l.isSerialized && l.expectedQuantity > 0);
        if (!line) this.skip();
        // Read the BEFORE figure: `uncountedLineCount` can never exceed the line
        // count, so comparing against `lines.length + 1` would hold even if the
        // counted zero left the line uncounted — the exact regression under test.
        const uncountedBefore = Number(bin.uncountedLineCount);
        enterQuantity(workerJwt, seed.bin.id, { lineId: line.id, countedQuantity: 0 }).then(() =>
          getWorkerTasks(workerJwt, seed.auditId).then((after) => {
            const b = (unwrap(after).bins || []).find((x) => x.id === seed.bin.id);
            const l = (b.lines || []).find((x) => x.id === line.id);
            expect(l.countedQuantity, 'a counted zero is recorded as 0, not left null').to.eq(0);
            expect(
              Number(b.uncountedLineCount),
              'and the line no longer counts as uncounted — 0 and never-counted are different'
            ).to.eq(uncountedBefore - 1);
          })
        );
      });
    });
  });

  // Decision table — not-found forces zero AND spares the placement
  it('SW-IAUD-E2E-TC51: declaring a line not found forces zero and spares the placement', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-notfound') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const line = (bin.lines || []).find((l) => !l.isSerialized && l.expectedQuantity > 0);
        if (!line) this.skip();
        // Send a non-zero quantity alongside notFound — the flag must win.
        enterQuantity(workerJwt, seed.bin.id, {
          lineId: line.id,
          countedQuantity: 99,
          notFound: true,
        }).then((res) => {
          expectAccepted(res, 'the not-found entry must be recorded');
          getWorkerTasks(workerJwt, seed.auditId).then((after) => {
            const b = (unwrap(after).bins || []).find((x) => x.id === seed.bin.id);
            const l = (b.lines || []).find((x) => x.id === line.id);
            expect(l.countedQuantity, 'notFound forces the count to zero whatever accompanied it').to.eq(0);
            expect(l.notFound).to.eq(true);
          });
        });
      });
    });
  });

  // BVA — the lower bound of a physical count
  it('SW-IAUD-E2E-TC52: a negative counted quantity is refused and zero accepted', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-neg') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const line = (bin.lines || []).find((l) => !l.isSerialized);
        if (!line) this.skip();
        enterQuantity(workerJwt, seed.bin.id, { lineId: line.id, countedQuantity: -1 }).then((res) => {
          expect(res.status, 'a physical count can be zero but never negative').to.eq(400);
        });
        enterQuantity(workerJwt, seed.bin.id, { lineId: line.id, countedQuantity: 0 }).then((res) => {
          expectAccepted(res, 'a counted zero is a valid physical count');
        });
      });
    });
  });

  // Error guessing — counting the wrong family the wrong way
  it('SW-IAUD-E2E-TC53: a serialized line cannot be counted by entering a quantity', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-wrongway') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const line = (bin.lines || []).find((l) => l.isSerialized);
        if (!line) this.skip();
        enterQuantity(workerJwt, seed.bin.id, { lineId: line.id, countedQuantity: 1 }).then((res) => {
          expect(res.status).to.eq(400);
          expect(String(res.body.error.message)).to.match(/serialized line|count it by scanning/i);
        });
      });
    });
  });

  // Use case — an unexpected pure product found on the shelf.
  // A count that can only record what it was told to expect is not a count; the
  // worker has to be able to add what is actually there.
  it('SW-IAUD-E2E-TC54: a pure product found in a bin that did not expect it can be counted', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-extra-product') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const expected = (bin.lines || []).map((l) => l.productId);
        probeProductNotInBin(adminJwt, expected, { serialized: false }).then((product) => {
          if (!product) this.skip(); // every non-serial product is already on a line
          addLine(workerJwt, seed.bin.id, product.id).then((added) => {
            expectAccepted(added, 'the worker can add a product the bin did not expect');
            getWorkerTasks(workerJwt, seed.auditId).then((after) => {
              const b = (unwrap(after).bins || []).find((x) => x.id === seed.bin.id);
              const line = (b.lines || []).find((l) => Number(l.productId) === Number(product.id));
              expect(line, 'the added product now has a countable line').to.exist;
              expect(
                Number(line.expectedQuantity),
                'a product the bin never expected is expected to hold zero of it'
              ).to.eq(0);
              // Counting it is what makes it an overage rather than a note.
              enterQuantity(workerJwt, seed.bin.id, { lineId: line.id, countedQuantity: 1 })
                .then((q) => {
                  expectAccepted(q, 'the found quantity is recorded');
                  return submitBin(workerJwt, seed.bin.id, true);
                })
                .then((sub) => {
                  const result = (unwrap(sub).lineResults || []).find(
                    (r) => r.lineId === line.id
                  );
                  expect(result, 'the added line reconciled with the rest').to.exist;
                  expect(
                    result.lineType,
                    'found where none was expected is an Overage'
                  ).to.eq('Overage');
                });
            });
          });
        });
      });
    });
  });

  // Use case — the product-with-items family
  it('SW-IAUD-E2E-TC55: a product with items is counted clean by scanning every serial', { tags: ['@smoke'] }, function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-items') }).then((seed) => {
      if (!seed) this.skip();
      // `scopeBin.serials` is what the PROBED location holds. It is the counted
      // bin's contents only when generation produced that same location as the bin;
      // a generated child bin holds something else, and then "every serial the bin
      // held was scanned" is simply not the situation under test.
      if (Number(seed.bin.locationId) !== Number(scopeBin.id)) {
        this.skip(); // the audit generated a child bin — see pending.md §1
      }
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const wBin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        // Only the SERIALIZED lines are satisfied by scanning. A non-serial line
        // left uncounted is recorded as a full shortage by `confirmUncounted`, so
        // including it would fail the check below for a reason this test is not about.
        const serialLineIds = new Set((wBin.lines || []).filter((l) => l.isSerialized).map((l) => l.id));
        if (!serialLineIds.size) this.skip(); // no serialized line in this bin

        (scopeBin.serials || [])
          .reduce((acc, s) => acc.then(() => scanSerial(workerJwt, seed.bin.id, s)), cy.wrap(null, { log: false }))
          .then(() => submitBin(workerJwt, seed.bin.id, true))
          .then((sub) => {
            const serialLines = (unwrap(sub).lineResults || []).filter((r) => serialLineIds.has(r.lineId));
            expect(serialLines.length, 'the bin had serialized lines to reconcile').to.be.at.least(1);
            // Every serial the bin held was scanned, so nothing should be short.
            serialLines.forEach((r) => {
              // Compare against ZERO, not against itself: `x >= x` is true of every
              // response, so a regression reporting a shortage on a clean count used
              // to pass this loop silently.
              expect(
                Number(r.differenceQuantity),
                `line ${r.lineId} counted every serial the bin held, so it cannot be short`
              ).to.be.at.least(0);
            });
          })
          .then(() =>
            listLocationItems(adminJwt, seed.bin.locationId).then((res) => {
              const body = unwrap(res);
              const serials = (Array.isArray(body) ? body : body.items || []).map(
                (i) => i.serial_number || i.serialNumber
              );
              scopeBin.serials.forEach((s) => {
                expect(serials, `serial ${s} is still filed in the bin after a clean count`).to.include(s);
              });
            })
          );
      });
    });
  });

  // BVA — the serialized shortage boundary: every serial but one
  it('SW-IAUD-E2E-TC56: an expected serial never scanned becomes a shortage of one', function () {
    // The LIVE contents, not the `before()` snapshot — earlier tests in this file
    // move serials and their restores only run in afterEach.
    liveSerialsInScope().then((serials) => {
      if (serials.length < 2) this.skip(); // need one to scan and one to leave
      const missing = serials[serials.length - 1];
      seedFrozenBin({ name: uniqueAuditName('e2e-items-short') }).then((seed) => {
        if (!seed) this.skip();
        // Scan all but one.
        serials
          .slice(0, -1)
          .reduce((acc, s) => acc.then(() => scanSerial(workerJwt, seed.bin.id, s)), cy.wrap(null, { log: false }))
          .then(() => submitBin(workerJwt, seed.bin.id, true))
          .then((sub) => {
            const short = (unwrap(sub).lineResults || []).find((r) => Number(r.differenceQuantity) < 0);
            expect(short, 'an unscanned expected serial is a shortage').to.exist;
            expect(short.lineType).to.eq('Shortage');
          })
          .then(() => getReport(adminJwt, seed.auditId))
          .then((res) => {
            expect(
              JSON.stringify(unwrap(res)),
              'the close-out report names what was never scanned'
            ).to.contain(missing);
          });
      });
    });
  });

  // Use case — the pair to TC56: what APPROVING a serialized shortage actually does
  //
  // Approval is the destructive half, and it is precise: the unscanned serial is
  // marked `Missing` and dropped from the bin, while every serial the worker DID
  // scan is left exactly as it was (discrepancy-review.service.ts:793-806). A bug
  // that marked the whole line would take the scanned units with it, which no
  // report would show as wrong — hence the "only" in the title.
  //
  // Fully reversible, which is why it no longer skips: `restock-by-serial-number`
  // accepts a `Missing` unit (product-stock-out.service.ts refuses only Incoming,
  // Available and Reserved) and returns it to `Available`, and the placement is
  // re-filed from the same restore. Both inverses are registered BEFORE the
  // approval, so an assertion failing mid-test still puts the unit back.
  it('SW-IAUD-E2E-TC57: approving a serialized shortage marks only the missing serial', function () {
    if (!reviewClass) this.skip(); // approve is refused on a Location audit
    liveSerialsInScope().then((serials) => {
      if (serials.length < 2) this.skip();
      const scanned = serials.slice(0, -1);
      const missing = serials[serials.length - 1];

      seedFrozenBin({
        name: uniqueAuditName('e2e-items-approve'),
        auditType: 'Abc',
        abcClass: reviewClass,
      }).then((seed) => {
        if (!seed) this.skip();
        // Registered up front: the approval marks the serial Missing and removes its
        // placement, so both have to come back whatever happens next.
        restores.add(() => restockBySerial(adminJwt, missing));
        restores.add(() =>
          assignItemToLocation(adminJwt, scopeBin.id, missing, { force: true })
        );

        scanned
          .reduce((acc, serial) => acc.then(() => scanSerial(workerJwt, seed.bin.id, serial)), cy.wrap(null, { log: false }))
          .then(() => submitBin(workerJwt, seed.bin.id, true))
          .then(() => getDiscrepancies(adminJwt, seed.auditId))
          .then((d) => {
            const line = ((unwrap(d) || {}).lines || []).find(
              (l) => l.isSerialized && Number(l.differenceQuantity) < 0
            );
            if (!line) this.skip(); // no serialized shortage to approve on this run
            return approveLine(adminJwt, seed.auditId, line.lineId, 'Miscount');
          })
          .then((res) => {
            if (!res) return null;
            expectAccepted(res, 'the serialized shortage is approved');
            // The claim: exactly the unscanned serial changed.
            return getItemStatus(adminJwt, missing).then((after) => {
              expect(after, `the serial nobody scanned is marked Missing`).to.eq('Missing');
              return scanned.reduce(
                (acc, serial) =>
                  acc.then(() =>
                    getItemStatus(adminJwt, serial).then((st) => {
                      expect(
                        st,
                        `the scanned serial ${serial} is untouched — approval must not sweep the whole line`
                      ).to.eq('Available');
                    })
                  ),
                cy.wrap(null, { log: false })
              );
            });
          });
      });
    });
  });

  // Decision table — the overage half of the serialized family
  //
  // `Unexpected` has one precise meaning in this build: the WMS holds NO placement
  // row for the serial at all (`neverPlaced`, worker-count.service.ts:977-1006).
  // It is NOT "recorded in another bin" — that is `Misplaced`, and TC26 owns it —
  // and it is not an off-class or status-conflicting unit either, both of which are
  // classified ahead of it. The plan's original wording ("a serial of the same
  // product filed elsewhere") described the Misplaced column, which is why this sat
  // unwritten; the state the title actually names is the one `stageUnplacedSerial`
  // creates, and TC22/TC24 already drive that stager on every run.
  //
  // Assign-on-scan is turned OFF so the scan classifies without also filing: with
  // it on, a Location walk answers `Assigned` (TC22's claim), which is a different
  // column of the same table.
  it('SW-IAUD-E2E-TC58: a serial the bin did not expect is recorded as unexpected', function () {
    if (!scopeBin.serials.length) this.skip();
    withUnplacedSerial(this, (serial) =>
      seedFrozenBin({ name: uniqueAuditName('e2e-unexpected'), assignOnScan: false }).then((seed) => {
        if (!seed) this.skip();
        scanSerial(workerJwt, seed.bin.id, serial).then((res) => {
          expectAccepted(res, 'the scan must be recorded — ground truth is ground truth');
          expect(
            unwrap(res).scanResult,
            'a serial the WMS has filed nowhere is an extra found here, not a miscount'
          ).to.eq('Unexpected');
          // The overage has to reach the admin, or "recorded" means nothing.
          //
          // WHERE it reaches them is the part this test originally got wrong. An
          // `Unexpected` scan does NOT appear in `unresolvedScans` — that list holds
          // `NotFound` reads only (`listUnresolvedScans`,
          // discrepancy-review.service.ts:239). An extra unit is a real serial, so it
          // lands on the line it was scanned against and the admin opens it with the
          // expand chevron on that product row, which calls
          // `GET /:id/lines/:lineId/serials`. Asserting on `unresolvedScans` was
          // looking in the one place it could never be. Verified against the rendered
          // review screen 2026-08-24.
          submitBin(workerJwt, seed.bin.id, true)
            .then(() => getDiscrepancies(adminJwt, seed.auditId))
            .then((d) => {
              const body = unwrap(d) || {};
              const lines = body.lines || [];
              expect(lines.length, 'the count produced at least one reviewable line').to.be.at.least(
                1
              );

              // Open each line the way the chevron does, and find the serial. Which
              // line it lands on is the product's business, not this test's — the
              // claim is that an admin can reach it from the review screen at all.
              const findOnLine = (i) => {
                if (i >= lines.length) return null;
                return getLineSerials(
                  adminJwt,
                  seed.auditId,
                  lines[i].lineId,
                  '?filter=scanned&limit=200'
                ).then((r) => {
                  // `serials`, not `list` — AuditLineSerialsDto:336. Each row carries
                  // `serialNumber` and `scanResult` as real fields, so both are read
                  // directly rather than by stringifying the row.
                  const rows = (unwrap(r) || {}).serials || [];
                  const hit = rows.find((x) => x.serialNumber === serial);
                  return hit ? { line: lines[i], row: hit } : findOnLine(i + 1);
                });
              };

              return findOnLine(0).then((found) => {
                expect(
                  found,
                  'the extra unit is reachable from the review screen — expand the product row'
                ).to.not.eq(null);
                // And it is presented as an extra, not as an ordinary counted unit.
                expect(
                  found.row.scanResult,
                  'the row says the count found it unexpectedly'
                ).to.eq('Unexpected');
                expect(
                  found.row.state,
                  'and that a worker actually read it, rather than it merely being expected'
                ).to.eq('Scanned');
              });
            });
        });
      })
    );
  });

  // Error guessing — the double scan
  it('SW-IAUD-E2E-TC59: scanning the same serial twice does not double-count it', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-double') }).then((seed) => {
      if (!seed) this.skip();
      const serial = scopeBin.serials[0];
      scanSerial(workerJwt, seed.bin.id, serial).then((first) => {
        expectAccepted(first, 'the first read must be recorded');
        expect(unwrap(first).alreadyScanned, 'the first read is new').to.eq(false);
        scanSerial(workerJwt, seed.bin.id, serial).then((second) => {
          expectAccepted(second, 'a rescan is not an error');
          expect(unwrap(second).alreadyScanned, 'it is reported as a rescan').to.eq(true);
          getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
            const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
            const count = (bin.lines || []).reduce(
              (n, l) => n + ((l.scans || []).filter((s) => s.serialNumber === serial).length),
              0
            );
            expect(count, 'the serial is recorded exactly once').to.eq(1);
          });
        });
      });
    });
  });

  // Use case — undoing a mis-scan
  it('SW-IAUD-E2E-TC60: removing a mis-scan lowers the tally', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-unscan') }).then((seed) => {
      if (!seed) this.skip();
      const serial = scopeBin.serials[0];
      scanSerial(workerJwt, seed.bin.id, serial)
        .then(() => removeScan(workerJwt, seed.bin.id, serial))
        .then((res) => {
          // DELETE, not POST — 200 really is this route's status.
          expect(res.status, 'the scan is removed').to.eq(200);
          return getWorkerTasks(workerJwt, seed.auditId);
        })
        .then((tRes) => {
          const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
          const still = (bin.lines || []).some((l) =>
            (l.scans || []).some((s) => s.serialNumber === serial)
          );
          expect(still, 'the removed scan is gone from the count').to.eq(false);
        });
    });
  });

  // Decision table — both families in one bin, one submit
  // Decision table — the two stock families produce two DIFFERENT line kinds
  //
  // A count line is one row per (bin, product, kind), and `isSerialized` is decided
  // by which table the stock came from: `container_items` yields serialized lines,
  // `container_quantities` non-serial ones (`buildAuditLineRowsSql`,
  // shared/audit-inventory.ts:307). So a bin holding a serialized product AND a
  // quantity-tracked product produces one line of each — which is exactly what the
  // review screen shows as two product rows.
  //
  // The guard reads the LIVE bin, not the `before()` snapshot: this file moves
  // serials around and their restores only run in afterEach, so the snapshot can
  // claim stock the bin no longer holds by the time this test runs.
  it('SW-IAUD-E2E-TC61: a bin holding both families produces one line of each kind', { tags: ['@smoke'] }, function () {
    seedFrozenBin({ name: uniqueAuditName('e2e-mixed') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        const lines = bin.lines || [];
        const serialized = lines.filter((l) => l.isSerialized);
        const nonSerial = lines.filter((l) => !l.isSerialized);
        // Both families must be present for the claim to mean anything. When the
        // audited bin holds only one of them this is an environment gap, not a
        // failure — say so and skip rather than asserting against stock that is not
        // there (see pending.md §1).
        if (!serialized.length || !nonSerial.length) {
          this.skip();
        }
        // Satisfy each its own way, then reconcile both in ONE submit.
        //
        // Scan what the BIN currently holds, read live — not `scopeBin.serials`,
        // which is the before() snapshot and can name a serial another test in this
        // file has since moved (its restore only runs in afterEach).
        const scanChain = liveSerialsInScope().then((serials) =>
          serials.reduce(
            (acc, sn) => acc.then(() => scanSerial(workerJwt, seed.bin.id, sn)),
            cy.wrap(null, { log: false })
          )
        );
        scanChain
          .then(() =>
            lines
              .filter((l) => !l.isSerialized)
              .reduce(
                (acc, l) =>
                  acc.then(() =>
                    enterQuantity(workerJwt, seed.bin.id, {
                      lineId: l.id,
                      countedQuantity: l.expectedQuantity,
                    })
                  ),
                cy.wrap(null, { log: false })
              )
          )
          .then(() => submitBin(workerJwt, seed.bin.id))
          .then((sub) => {
            expectAccepted(sub, 'one submit reconciles both families');
            // ONE submit settles every line the bin holds — the claim is that the two
            // families are reconciled together, not that any particular number of
            // lines came back. A bin holding two serialized products and one
            // quantity-tracked product legitimately returns three.
            const results = unwrap(sub).lineResults || [];
            const ids = results.map((r) => r.lineId);
            expect(
              ids,
              'the serialized line was reconciled by the same submit'
            ).to.include(serialized[0].id);
            expect(
              ids,
              'and so was the non-serial line — one submit, both families'
            ).to.include(nonSerial[0].id);
          });
      });
    });
  });

  // Error guessing — the uncounted-line guard
  it('SW-IAUD-E2E-TC62: submitting with an uncounted line needs an explicit confirmation', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-uncounted') }).then((seed) => {
      if (!seed) this.skip();
      // Nothing counted at all — every line is uncounted.
      submitBin(workerJwt, seed.bin.id).then((res) => {
        expect(res.status, 'an uncounted bin is refused without the acknowledgement').to.eq(400);
        submitBin(workerJwt, seed.bin.id, true).then((forced) => {
          expectAccepted(forced, 'and accepted with it');
          const shortages = (unwrap(forced).lineResults || []).filter((r) => r.lineType === 'Shortage');
          expect(
            shortages.length,
            'confirming records a full shortage on each uncounted line'
          ).to.be.at.least(1);
        });
      });
    });
  });

  // BVA — never-counted is not zero, on the serialized side too
  it('SW-IAUD-E2E-TC63: a serialized line with no scans is reported as never counted', function () {
    if (!scopeBin.serials.length) this.skip();
    seedFrozenBin({ name: uniqueAuditName('e2e-noscans') }).then((seed) => {
      if (!seed) this.skip();
      getWorkerTasks(workerJwt, seed.auditId).then((tRes) => {
        const bin = (unwrap(tRes).bins || []).find((b) => b.id === seed.bin.id);
        expect(
          bin.uncountedLineCount,
          'a serialized line with no scans counts as uncounted, not as a counted zero'
        ).to.be.at.least(1);
        submitBin(workerJwt, seed.bin.id, true).then((sub) => {
          const serialResult = (unwrap(sub).lineResults || []).find((r) => r.expectedQuantity > 0);
          expect(serialResult, 'the line reconciled').to.exist;
          expect(
            Number(serialResult.differenceQuantity),
            'its shortage is the whole expected quantity'
          ).to.eq(-Number(serialResult.expectedQuantity));
        });
      });
    });
  });
});
