// cypress/e2e/InventoryAudit/06-WorkerCountMobileTests.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md  (§9.1.5, SW-IAUD-MOB-TC01..30)
// Component:  Frontend/src/components/ABC/worker/  (index.tsx, mergeScan.ts)
// Backend:    worker-count.controller.ts / worker-count.service.ts
//
// The handheld surface — the actor the whole feature exists to serve. Runs as the
// `user` role at a mobile viewport (set inside the page object, not the runner
// config: the screen branches on an `md` breakpoint, so a full-suite run at
// desktop width would silently test a different layout).
//
// TWO MECHANICS ARE INVISIBLE FROM THE API and are where this screen's real bugs
// live, so they get dedicated tests written to fail if the guard is removed:
//
//   MOB-TC07 — a barcode wedge delivers the value and its Enter back-to-back, so
//     the component reads the DOM input at submit time (React state may not have
//     committed) and clears both together. The test writes the value straight onto
//     the node and dispatches the events; typing with a per-character delay would
//     pass without exercising anything.
//   MOB-TC08 — each scan response is folded into the task tree the screen already
//     holds instead of re-reading every scan in every bin (that refetch took a
//     shift from ~0.1s to 1–4.5s per scan on 2026-08-07). The client re-derives the
//     per-bin numbers, so the test blocks the refetch, reads the on-screen tally,
//     then compares it against a fresh server fetch.
//
// Seeding is admin-side: a worker cannot create its own work. `before()` creates a
// Location audit over a stocked bin, assigns it to the worker, and the specs act
// as the worker from there.

import WorkerCountPage from '../../pageObjects/InventoryAudit/workerCountPage';
import { uniqueAuditName } from '../../support/InventoryAudit/auditHelpers';
import { seedAuditableBin } from '../../support/InventoryAudit/auditSeed';
import {
  ensureContainerInBin,
  ensureQuantityInBin,
  ensureSiblingBins,
  resolveCountActor,
} from '../../support/InventoryAudit/auditWarehouse';
import {
  createRestoreQueue,
  restoreSerialHome,
  restoreStockedOutSerial,
  restoreUnplacedSerial,
  stageSerialInOtherBin,
  stageStockedOutSerialInBin,
  stageUnplacedSerial,
} from '../../support/InventoryAudit/auditFixtures';
import {
  assignBins,
  cancelAuditApi,
  createAudit,
  forceReleaseAudit,
  getBins,
  getWorkerTasks,
  listLocationItems,
  listLocationQuantities,
  probeSiblingBins,
  probeStockedBin,
  scanSerial,
  startBin,
  submitBin,
  sweepLeftoverAudits,
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

describe('Inventory Audit — Mobile worker count', { tags: ['@regression'] }, () => {
  const page = new WorkerCountPage();

  /**
   * The status a successful POST on the worker/audit routes returns.
   *
   * None of these controllers declare `@HttpCode(200)` — only `@ApiOkResponse`,
   * which is Swagger metadata — so NestJS applies its POST default and they answer
   * **201**. Same fact the assignment assertion below already relies on; it is
   * hoisted here so start / submit / cancel cannot drift back to a strict 200.
   */
  const expectAccepted = (res, why = 'the call must succeed') => {
    expect(res.status, why).to.be.oneOf([200, 201]);
    return res;
  };

  /**
   * Inverses for every warehouse state a test stages, run before the audits are
   * released — see the note on the drain order in `afterEach`.
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
  let scopeBin = null;
  let siblings = null;
  let seededFixture = null; // this spec's own PO + bin + stock; removed in after()
  let containerInBin = null; // a container parked in the audited bin (MOB-TC24) // two bins under one parent — for the "wrong bin" column
  const created = [];

  /**
   * Whether removing ONE serial still leaves the bin something to generate a count
   * task from. The never-placed columns below unassign a serial before the audit
   * exists, and a bin that then holds nothing generates no bins at all — which
   * would fail the seed rather than exercise the scan result under test.
   */
  const binSurvivesLosingOneSerial = () => scopeBin.serials.length > 1 || scopeBin.quantities.length > 0;

  /**
   * The serials the audited bin holds RIGHT NOW, read live.
   *
   * `scopeBin.serials` is the `before()` snapshot, and this file legitimately moves
   * serials around — MOB-TC12/TC13 unplace one, MOB-TC14/TC17 park one in a sibling
   * — with their restores only draining in `afterEach`. A test that indexes into the
   * snapshot can therefore scan a serial the bin no longer holds, which is how
   * MOB-TC10 came to assert on a serial that was never the newest scan.
   *
   * Available only, matching what generation puts on a serialized count line.
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

  /** A Location audit over the stocked bin, assigned to the worker. */
  const seedAssignedAudit = (overrides = {}) => {
    const name = overrides.name || uniqueAuditName('mob');
    return createAudit(
      adminJwt,
      Object.assign(
        {
          name,
          auditType: 'Location',
          assignOnScan: true,
          scopeLocationId: scopeBin.id,
          assignmentStrategy: 'Manual',
          workers: [{ userId: workerId, userName: 'Cypress Worker' }],
        },
        overrides
      )
    ).then((res) => {
      expect(res.status, `seed create for ${name}`).to.be.oneOf([200, 201]);
      const id = unwrap(res).id;
      created.push(id);
      return waitForGeneration(adminJwt, id).then(() =>
        getBins(adminJwt, id).then((binsRes) => {
          const bins = unwrap(binsRes);
          expect(bins.length, 'the seed scope must generate at least one bin').to.be.at.least(1);
          return assignBins(
            adminJwt,
            id,
            bins.map((b) => ({ binId: b.id, userId: workerId }))
          ).then(() => ({ auditId: id, auditName: name, bins }));
        })
      );
    });
  };

  before(function () {
    cy.login().then((t) => {
      adminJwt = t;
    });

    // The identity the audit hands bins to must be the SAME identity the browser
    // session authenticates as, or every count route 403s — so both come from one
    // resolved actor rather than being matched up by e-mail after the fact.
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

    // SEED the fixture — do not go looking for one.
    //
    // This module used to probe the tenant for a bin that happened to hold stock,
    // then patch whatever was missing. That made the suite hostage to data it did
    // not own: a manual audit holding the only stocked bin, a bin with one serial,
    // a tenant with no non-serial stock, or a WMS placement wipe each took whole
    // groups of TCs out as "skips" that reported nothing about the product.
    //
    // `seedAuditableBin` builds PO -> receive -> bin -> place over the API and
    // removes all of it in after(). Four serials and twenty units, because several
    // cases consume one for the duration of a test and their restores only drain in
    // afterEach — see SEED_DEFAULTS for why those numbers.
    cy.then(() =>
      seedAuditableBin(adminJwt).then((seeded) => {
        seededFixture = seeded;
        if (!seeded) return null;
        scopeBin = seeded;
        // The sibling comes from the same branch, so the "wrong bin" and
        // narrow-freeze columns no longer depend on the tenant offering a pair.
        siblings = seeded.siblingBin
          ? { parent: null, first: { id: seeded.id, code: seeded.code }, second: seeded.siblingBin }
          : null;
        return null;
      })
    );

    // A container parked IN the audited bin, for the container-filing case.
    //
    // An EMPTY container adds no expected units, so parking one in the probed scope
    // changes nothing any other test in this file counts. Built when the tenant has
    // none and removed in after().
    cy.then(() => {
      if (!scopeBin) return null;
      return ensureContainerInBin(adminJwt, scopeBin.id, null).then((c) => {
        containerInBin = c;
        if (c && c.created) warehouseCleanup.push(() => c.cleanup());
      });
    });

    cy.then(() => sweepLeftoverAudits(adminJwt, 'cy-mob-'));
  });

  beforeEach(function () {
    // Only fires if the admin token itself carries no `sub` — a broken realm, not
    // a missing second credential.
    if (!workerJwt || !workerId) this.skip(); // see pending.md §2
    // The fixture is SEEDED by this spec (see before()), so reaching here without one
    // means the seed itself failed — a real problem, not the environment being thin.
    // Fail loudly rather than skipping, or a broken seeder reports as green coverage.
    expect(
      scopeBin,
      'the seeded fixture must exist — if this is null the seed failed; check the audit-seed log lines above'
    ).to.not.eq(null);
    // The BROWSER session has to be the same identity the bins were assigned to.
    cy.authSession(countActor.sessionRole);
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
    // `BinLockService.assertBinNotFrozen` throws 409 for every write to a bin under
    // a live count (bin-lock.service.ts:94), so a restore drained BEFORE the audit
    // was released was refused — silently, because the restore queue swallows
    // failures by design so one bad restore cannot fail a passing test. The serial
    // then stayed where the test had put it, and the next run found a thinner bin.
    // Same fix as 04-AuditLifecycleE2E; the two hooks must stay in step.
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
    // The restore queue needs a net of its own: `afterEach` drains it behind that
    // test's audit releases, but a restore refused there is logged and dropped and
    // never retried. Draining again with every audit released is what stops a
    // serial ending the run unplaced. Same net as 04-AuditLifecycleE2E.
    cy.then(() => restores.drain());
    // NO `reconcileSerialsIntoBin` here any more.
    //
    // That net existed to protect a bin the tenant OWNED: a serial left unplaced
    // thinned the shared bin the next run would probe. This spec now seeds its own
    // bin and deletes it below, so putting stock back into it is pointless — and
    // worse, it races the delete. A location refuses deletion while stock is filed
    // in it, so re-filing serials milliseconds before removing the bin is how a
    // seeded bin survived teardown on 2026-08-25. The fixture's own cleanup
    // unassigns every serial it placed, which is the only unplacing that matters
    // when the bin itself is about to go.
    // Then remove any warehouse structure this spec built.
    cy.then(() => warehouseCleanup.splice(0, warehouseCleanup.length).forEach((fn) => fn()));
    // And finally the seeded fixture itself — PO, products, items, and the whole
    // warehouse branch. LAST, because the reconcile above re-files serials into the
    // very bin this removes, and a location refuses deletion while stock is in it.
    cy.then(() => {
      if (seededFixture) seededFixture.cleanup();
      seededFixture = null;
    });
  });

  // ==========================================================================
  // The worker's entry point
  // ==========================================================================

  // Use case — the audits assigned to me, with progress
  it('SW-IAUD-MOB-TC01: the worker sees the audits assigned to them', { tags: ['@smoke'] }, () => {
    seedAssignedAudit().then(({ auditName }) => {
      page.visit().assertOnAuditsStep();
      page.assertAuditListed(auditName);
    });
  });

  // EP — an audit holding none of MY bins says so rather than showing an empty list
  it('SW-IAUD-MOB-TC02: an audit with nothing assigned to this worker says so', () => {
    seedAssignedAudit().then(({ auditId, auditName, bins }) => {
      // Take every bin back off the worker.
      assignBins(adminJwt, auditId, bins.map((b) => ({ binId: b.id, userId: null }))).then(() => {
        page.visit();
        // The audit may drop off the list entirely once nothing is assigned; if it
        // is still listed, opening it must explain the emptiness.
        page.auditIsListed(auditName).then((listed) => {
          if (listed) page.openAuditBins(auditName).assertNoBinsAssigned();
          else page.assertAuditNotListed(auditName);
        });
      });
    });
  });

  // Decision table — the worker list hides finished audits
  it('SW-IAUD-MOB-TC03: the worker list hides a cancelled audit', () => {
    seedAssignedAudit().then(({ auditId, auditName }) => {
      page.visit().assertAuditListed(auditName);
      cancelAuditApi(adminJwt, auditId).then((res) => {
        expectAccepted(res, 'the cancel must succeed');
        page.visit();
        page.assertAuditNotListed(auditName);
      });
    });
  });

  // EP — each bin row says what the worker is walking into
  it('SW-IAUD-MOB-TC04: each bin row shows its product count, expected units and action', () => {
    seedAssignedAudit().then(({ auditName, bins }) => {
      const bin = bins[0];
      const code = bin.locationCode || String(bin.locationId);
      page.visit().openAuditBins(auditName);
      page.assertBinListed(code);
      page.assertBinSummary(code, { products: bin.lineCount, expected: bin.expectedUnits });
      page.assertBinOffersStart(code);
    });
  });

  // ==========================================================================
  // Starting a count — and the freeze it creates
  // ==========================================================================

  // State transition — starting is what freezes the bin
  it('SW-IAUD-MOB-TC05: starting a bin count freezes it against warehouse writes', { tags: ['@smoke'] }, () => {
    seedAssignedAudit().then(({ auditId, auditName, bins }) => {
      const bin = bins[0];
      const code = bin.locationCode || String(bin.locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      // The freeze is the bin row being InProgress — confirm through the admin view.
      getBins(adminJwt, auditId).then((res) => {
        const row = unwrap(res).find((b) => b.id === bin.id);
        expect(row.status, 'starting a count freezes the bin').to.eq('InProgress');
      });
    });
  });

  // ==========================================================================
  // Scanning
  // ==========================================================================

  // Use case — the barcode wedge: value + Enter, field clears
  it('SW-IAUD-MOB-TC06: a scanned barcode is recorded and the field clears', { tags: ['@smoke'] }, function () {
    if (!scopeBin.serials.length) this.skip(); // bin holds no serials — see pending.md §1
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      const serial = scopeBin.serials[0];
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      page.scanWithWedge(serial);
      page.assertScanRowPresent(serial);
      page.assertScanFieldEmpty();
      page.assertTally(1);
    });
  });

  // Error guessing — the reason the component reads the DOM, not React state.
  // Two barcodes with NO pause: the second must not re-submit the first.
  it('SW-IAUD-MOB-TC07: two barcodes in quick succession record two distinct serials', function () {
    // Live contents — see `liveSerialsInScope`. Scanning a snapshot serial the bin no
    // longer holds would classify as Unexpected and prove nothing about the race.
    liveSerialsInScope().then((serials) => {
    if (serials.length < 2) this.skip(); // needs two serials in one bin
    const [first, second] = serials;
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      page.scanTwoWithoutPause(first, second);
      page.assertScanRowPresent(first);
      page.assertScanRowPresent(second);
      page.assertTally(2);
    });
    });
  });

  // Error guessing — the client-side tally merge must agree with the server.
  // The refetch is blocked so it cannot mask a divergence.
  it('SW-IAUD-MOB-TC08: the on-screen tally matches the server after a burst of scans', function () {
    liveSerialsInScope().then((serials) => {
    if (serials.length < 2) this.skip();
    seedAssignedAudit().then(({ auditId, auditName, bins }) => {
      const bin = bins[0];
      const code = bin.locationCode || String(bin.locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();

      // Block the tasks refetch: from here the tally on screen can only come from
      // the client-side merge. Without this the refetch would repair any
      // divergence and the test would prove nothing.
      cy.intercept('GET', `**/inventory-audits/${auditId}/tasks`, { statusCode: 304, body: {} }).as('blocked');

      serials.slice(0, 2).forEach((sn) => page.scanWithWedge(sn));
      page.readTally().then((onScreen) => {
        // Now ask the server what it actually holds.
        getWorkerTasks(workerJwt, auditId).then((res) => {
          const serverBin = (unwrap(res).bins || []).find((b) => b.id === bin.id);
          const serverScans = (serverBin.lines || []).reduce(
            (n, line) => n + (line.scans ? line.scans.length : 0),
            (serverBin.unattachedScans || []).length
          );
          expect(
            onScreen,
            'the merged tally on screen must equal what the server recorded — a divergence here is invisible in normal use'
          ).to.eq(serverScans);
        });
      });
    });
    });
  });

  // Error guessing — an unmergeable response must fall back to a full refresh
  it('SW-IAUD-MOB-TC09: an unmergeable scan response triggers a full refresh', function () {
    if (!scopeBin.serials.length) this.skip();
    seedAssignedAudit().then(({ auditId, auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      // Strip the stored row from the scan response: mergeScanIntoTasks returns
      // null without it, and the screen must re-read the tasks instead.
      cy.intercept('POST', '**/inventory-audits/bins/*/scan', (req) => {
        req.continue((res) => {
          if (res.body && res.body.data) delete res.body.data.scan;
        });
      }).as('scanStripped');
      cy.intercept('GET', `**/inventory-audits/${auditId}/tasks`).as('tasksRefetch');
      page.scanWithWedge(scopeBin.serials[0]);
      cy.wait('@scanStripped');
      cy.wait('@tasksRefetch'); // the fallback fired
      page.assertTally(1);
    });
  });

  // EP — the scan log is newest-first and paged
  it('SW-IAUD-MOB-TC10: the scan log shows the most recent scan first', function () {
    // Assert on the serial this test scanned SECOND — captured from the scan calls
    // themselves, not from the order a read happened to return them in.
    //
    // The earlier version took `[first, second]` off a WMS read and asserted the
    // newest row was `second`. That coupled the assertion to the READ's ordering,
    // which is not the scan order and is not stable: with the seeded fixture it
    // scanned S3 then S4 and failed expecting S3, because the read had listed S4
    // first. The claim here is purely "the log is newest-first", so the only two
    // facts it needs are which serial went in last and which row is on top.
    liveSerialsInScope().then((serials) => {
      if (serials.length < 2) this.skip(); // needs two serials in one bin
      seedAssignedAudit().then(({ auditName, bins }) => {
        const code = bins[0].locationCode || String(bins[0].locationId);
        page.visit().openAuditBins(auditName).startCounting(code);
        page.assertOnCountStep();

        const [earlier, latest] = serials;
        page.scanWithWedge(earlier);
        page.assertScanRowPresent(earlier);
        page.scanWithWedge(latest);
        page.assertScanRowPresent(latest);

        // Newest-first: the serial scanned LAST sits above the one scanned first.
        page.assertScanOrder(latest, earlier);
      });
    });
  });

  // ==========================================================================
  // The scan-result vocabulary — one column per outcome
  // ==========================================================================

  // Decision table — a serial the bin expects
  it('SW-IAUD-MOB-TC11: an expected serial is marked as counted', function () {
    if (!scopeBin.serials.length) this.skip();
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.scanWithWedge(scopeBin.serials[0]);
      page.assertScanChip(/^counted$/i);
    });
  });

  /**
   * Stage a serial the WMS has filed NOWHERE, and register its restore.
   *
   * "Extra" and "Placed here" are the same warehouse state read through opposite
   * settings of assign-on-scan, so both columns start here. Unassigning happens
   * before the audit exists so generation does not expect the serial.
   */
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

  // Decision table — a serial the WMS records nowhere, with filing turned OFF.
  // "Extra" is specifically *no placement anywhere*; a serial recorded in another
  // bin is "Wrong bin" (MOB-TC14), which is a different column.
  it('SW-IAUD-MOB-TC12: a serial the bin did not expect is marked as extra', function () {
    if (!scopeBin.serials.length || !binSurvivesLosingOneSerial()) this.skip();
    withUnplacedSerial(this, (serial) =>
      seedAssignedAudit({ name: uniqueAuditName('mob-extra'), assignOnScan: false }).then(
        ({ auditName, bins }) => {
          const code = bins[0].locationCode || String(bins[0].locationId);
          page.visit().openAuditBins(auditName).startCounting(code);
          page.assertOnCountStep();
          page.scanWithWedge(serial);
          page.assertScanChip(/^extra$/i);
        }
      )
    );
  });

  // Decision table — the same serial with filing turned ON
  it('SW-IAUD-MOB-TC13: a never-placed serial filed by the scan is marked as filed here', function () {
    if (!scopeBin.serials.length || !binSurvivesLosingOneSerial()) this.skip();
    withUnplacedSerial(this, (serial) =>
      seedAssignedAudit({ name: uniqueAuditName('mob-placed'), assignOnScan: true }).then(
        ({ auditName, bins }) => {
          const code = bins[0].locationCode || String(bins[0].locationId);
          page.visit().openAuditBins(auditName).startCounting(code);
          page.assertOnCountStep();
          page.scanWithWedge(serial);
          // `ScanRowChips` labels an Assigned scan "Filed here". (The banner's
          // `ScanResultChip` says "Placed here" — a different component, different
          // vocabulary; the row is what this asserts on.)
          page.assertScanChip(/^filed here$/i);
        }
      )
    );
  });

  // Decision table — a serial recorded in another bin, before confirming the move
  it('SW-IAUD-MOB-TC14: a misplaced serial is flagged until the worker confirms the move', function () {
    if (!siblings || !scopeBin.serials.length || !binSurvivesLosingOneSerial()) this.skip();
    const serial = scopeBin.serials[0];
    stageSerialInOtherBin(adminJwt, serial, siblings.second.id, scopeBin.id).then((staged) => {
      if (!staged) this.skip(); // could not stage the precondition
      restores.add(() => restoreSerialHome(adminJwt, staged));
      seedAssignedAudit({ name: uniqueAuditName('mob-wrongbin') }).then(({ auditName, bins }) => {
        const bin = bins[0];
        if (Number(bin.locationId) === Number(siblings.second.id)) this.skip();
        const code = bin.locationCode || String(bin.locationId);
        page.visit().openAuditBins(auditName).startCounting(code);
        page.assertOnCountStep();
        page.scanWithWedge(serial);
        // The row chip names WHERE the system had it: `Recorded in BN-x`.
        // "Wrong bin" is `ScanResultChip`'s wording, used by the banner.
        page.assertScanChip(/^recorded in /i);
        // Flagged, not moved: the worker is OFFERED the correction and nothing has
        // happened to the warehouse until they take it.
        page.assertPlacementOffered('move');
        listLocationItems(adminJwt, siblings.second.id).then((res) => {
          const body = unwrap(res);
          const held = (Array.isArray(body) ? body : body.items || []).map(
            (i) => i.serial_number || i.serialNumber
          );
          expect(held, 'the scan alone moves nothing — the system still has it where it was').to.include(
            serial
          );
        });
      });
    });
  });

  // Decision table — a serial unknown to the system
  it('SW-IAUD-MOB-TC15: a serial unknown to the system is marked as not in the system', () => {
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      const unknown = `CY-NO-SUCH-SERIAL-${Date.now()}`;
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      page.scanWithWedge(unknown);
      // A Location audit records it as an unregistered read rather than refusing.
      //
      // The row chip reads "Not in system". There are TWO chip vocabularies in this
      // screen and they do not agree: `ScanResultChip.SCAN_RESULT_META` (used by the
      // last-scan banner) calls this "Unregistered", while `ScanRowChips` — the chips
      // ON THE ROW, which is what this test reads — calls it "Not in system". Verified
      // against both components on 2026-08-20.
      page.assertScanChip(/^not in system$/i);
    });
  });

  // Decision table — a serial that is not on-hand names its ACTUAL status.
  // The worker is holding the unit; the system says it is gone. Reading that as a
  // plain "counted" is how a real discrepancy disappears.
  it('SW-IAUD-MOB-TC16: a serial that is not on-hand names its actual status', function () {
    if (!scopeBin.serials.length) this.skip();
    stageStockedOutSerialInBin(adminJwt, scopeBin.serials[0], scopeBin.id).then((staged) => {
      // `null` means this build drops the placement on stock-out, so the state
      // cannot exist here; the stager has already restocked.
      if (!staged) this.skip(); // see pending.md §3
      restores.add(() => restoreStockedOutSerial(adminJwt, staged));
      seedAssignedAudit({ name: uniqueAuditName('mob-notstock') }).then(({ auditName, bins }) => {
        const code = bins[0].locationCode || String(bins[0].locationId);
        page.visit().openAuditBins(auditName).startCounting(code);
        page.assertOnCountStep();
        page.scanWithWedge(staged.serialNumber);
        // The chip shows the unit's ACTUAL status when the API supplies one
        // (`itemStatusLabel ?? itemStatus ?? 'Not in stock'`) — which is the
        // point of the TC: it must NAME the status, not just say "missing".
        page.assertScanChip(/not in stock|stocked out|missing|not found|consumed|incoming/i);
      });
    });
  });

  // Decision table — a serial whose CURRENT bin belongs to another live audit
  //
  // The rule is per-BIN, not per-serial (`otherAuditHolding`,
  // worker-count.service.ts:3144): a serial recorded in a bin some other live audit
  // holds must not be offered for relocation, because moving it would turn that
  // audit's count into an unexplainable shortage. So this is the misplacement case
  // of MOB-TC14 with one thing changed — the bin the serial sits in is itself under
  // a second audit — and the expected outcome inverts: still flagged as misplaced,
  // but the "Move here" offer is withheld and the message names the audit holding
  // it (worker/index.tsx path, service line 1025).
  //
  // The plan called this "two concurrent audits over disjoint scopes sharing a
  // serial", which read as unstageable. It is not: two audits over the two SIBLING
  // bins are disjoint, and staging the serial into the second bin is what makes it
  // shared. Both audits are registered for release like any other.
  it('SW-IAUD-MOB-TC17: a serial held by another audit is refused', function () {
    if (!siblings || !scopeBin.serials.length || !binSurvivesLosingOneSerial()) this.skip();
    const serial = scopeBin.serials[0];
    stageSerialInOtherBin(adminJwt, serial, siblings.second.id, scopeBin.id).then((staged) => {
      if (!staged) this.skip(); // could not stage the precondition
      restores.add(() => restoreSerialHome(adminJwt, staged));
      // The SECOND audit — over the sibling bin the serial now sits in. It only has
      // to be live; it does not need to be started.
      createAudit(adminJwt, {
        name: uniqueAuditName('mob-holder'),
        auditType: 'Location',
        assignOnScan: true,
        scopeLocationId: siblings.second.id,
        assignmentStrategy: 'Manual',
        workers: [{ userId: workerId, userName: 'Cypress Worker' }],
      }).then((res) => {
        if (res.status === 409) this.skip(); // the sibling is already under a live audit
        expect(res.status, 'the holding audit is created').to.be.oneOf([200, 201]);
        const holderId = unwrap(res).id;
        created.push(holderId);

        return waitForGeneration(adminJwt, holderId).then(() =>
          seedAssignedAudit({ name: uniqueAuditName('mob-blocked') }).then(({ auditName, bins }) => {
            const bin = bins[0];
            if (Number(bin.locationId) === Number(siblings.second.id)) this.skip();
            const code = bin.locationCode || String(bin.locationId);
            page.visit().openAuditBins(auditName).startCounting(code);
            page.assertOnCountStep();
            page.scanWithWedge(serial);
            // Still reported as recorded elsewhere...
            page.assertScanChip(/^recorded in /i);
            // ...but the correction is WITHHELD, and the reason names the audit.
            page.assertPlacementWithheld(/part of the open audit/i);
            // And nothing moved.
            listLocationItems(adminJwt, siblings.second.id).then((items) => {
              const body = unwrap(items);
              const held = (Array.isArray(body) ? body : body.items || []).map(
                (i) => i.serial_number || i.serialNumber
              );
              expect(held, 'the serial stays with the audit that is counting it').to.include(serial);
            });
          })
        );
      });
    });
  });

  // ==========================================================================
  // The multiple-match chooser
  // ==========================================================================

  // Use case — a read the matcher will not resolve unattended
  //
  // The chooser does NOT require two prefix-sharing serials, which is what kept
  // this unwritten. `resolveScannedSerial` ranks matches on five rungs and asks the
  // worker whenever the winner came from a rung it will not apply on its own —
  // `best.length === 1 && priority < CONFIRM_MATCH_PRIORITY` is the ONLY silent
  // path (worker-count.service.ts:3037, CONFIRM_MATCH_PRIORITY = 4). Priority 5 is
  // "stored serial CONTAINS the scanned value", so scanning a substring of a serial
  // the bin already holds reaches the picker with the stock this tenant has. One
  // candidate renders as "Confirm Match" — the same dialog, worded for one.
  it('SW-IAUD-MOB-TC18: an ambiguous scan opens a chooser and picking one records it', function () {
    if (!scopeBin.serials.length) this.skip();
    const serial = scopeBin.serials[0];
    // A middle slice, so it cannot match on the exact / ends-with rungs (1-3).
    const partial = serial.slice(2, Math.max(6, Math.floor(serial.length / 2)));
    if (partial.length < 3) this.skip(); // serial too short to slice unambiguously
    seedAssignedAudit({ name: uniqueAuditName('mob-ambiguous') }).then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      page.scanWithWedge(partial);
      // Nothing is counted until the worker decides.
      page.assertMatchChooserOpen();
      page.chooseMatch(serial);
      // Picking the candidate records THAT serial, not the partial read.
      page.assertScanRowPresent(serial);
    });
  });

  // Use case — the picker must not force one of the system's guesses
  //
  // "Use as-is" is Location-audit only and is what lets a worker say "this is what
  // the label reads, file it as unregistered" instead of accepting a guess
  // (worker/index.tsx:2131). Offering only the candidates would quietly turn a
  // genuine unknown into whichever stored serial looked closest — the exact
  // silent-substitution this rung exists to prevent.
  it('SW-IAUD-MOB-TC19: the chooser offers keeping exactly what was scanned', function () {
    if (!scopeBin.serials.length) this.skip();
    const serial = scopeBin.serials[0];
    const partial = serial.slice(2, Math.max(6, Math.floor(serial.length / 2)));
    if (partial.length < 3) this.skip();
    seedAssignedAudit({ name: uniqueAuditName('mob-asis') }).then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      page.scanWithWedge(partial);
      page.assertMatchChooserOpen();
      page.assertMatchChooserOffersUseAsIs();
    });
  });

  // ==========================================================================
  // Undoing, quantities, and adding a product
  // ==========================================================================

  // Use case — removing a mis-scan lowers the tally
  it('SW-IAUD-MOB-TC20: removing a scan lowers the tally', function () {
    if (!scopeBin.serials.length) this.skip();
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      const serial = scopeBin.serials[0];
      page.visit().openAuditBins(auditName).startCounting(code);
      page.scanWithWedge(serial);
      page.assertTally(1);
      page.removeScan(serial);
      page.assertTally(0);
      page.assertScanRowAbsent(serial);
    });
  });

  // EP — a non-serial product is counted by entering a quantity (commits on blur)
  it('SW-IAUD-MOB-TC21: a non-serial product is counted by entering a quantity', { tags: ['@smoke'] }, function () {
    if (!scopeBin.quantities.length) this.skip(); // bin holds no non-serial stock
    seedAssignedAudit().then(({ auditId, auditName, bins }) => {
      const bin = bins[0];
      const code = bin.locationCode || String(bin.locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      getWorkerTasks(workerJwt, auditId).then((res) => {
        const serverBin = (unwrap(res).bins || []).find((b) => b.id === bin.id);
        const line = (serverBin.lines || []).find((l) => !l.isSerialized);
        if (!line) this.skip();
        const productName = line.productName || `Product ${line.productId}`;
        page.assertExpectedQuantity(productName, line.expectedQuantity);
        page.enterQuantity(productName, line.expectedQuantity);
        page.assertQuantityValue(productName, line.expectedQuantity);
      });
    });
  });

  // Decision table — "I looked, it is not here" counts the line as zero
  it('SW-IAUD-MOB-TC22: a non-serial product can be declared not found', function () {
    if (!scopeBin.quantities.length) this.skip();
    seedAssignedAudit().then(({ auditId, auditName, bins }) => {
      const bin = bins[0];
      const code = bin.locationCode || String(bin.locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      getWorkerTasks(workerJwt, auditId).then((res) => {
        const serverBin = (unwrap(res).bins || []).find((b) => b.id === bin.id);
        const line = (serverBin.lines || []).find((l) => !l.isSerialized);
        if (!line) this.skip();
        page.markNotFound(line.productName || `Product ${line.productId}`);
        page.assertNotFoundChip();
      });
    });
  });

  // Use case — adding a product the bin did not expect
  it('SW-IAUD-MOB-TC23: the worker can add a product the bin did not expect', () => {
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      page.openProductPicker();
      page.searchProduct('a');
      // The picker lists inventory products; the search itself is the assertion
      // here — adding one would mutate the count, which MOB-TC21 already covers.
      cy.findByRole('dialog').should('contain.text', 'Add a product');
    });
  });

  // Use case — filing into a container in the bin
  // Use case — filing into a container in the bin
  //
  // The filing TARGET is chosen at the locate step, not on the count screen: what
  // the worker scanned there decides it. Scanning a container QR carries that tote
  // through as `pendingContainer`, and `startBin` promotes it to `selectedContainer`
  // — but only when the container is parked in THIS bin and the audit assigns on
  // scan (worker/index.tsx:546-553). The screen then says "Found items are filed
  // into container <code>" instead of "…into location <bin>", which is the whole
  // claim.
  it('SW-IAUD-MOB-TC24: the worker can file scans into a container in the bin', function () {
    if (!containerInBin || !containerInBin.container) this.skip(); // no container could be parked here
    const code = containerInBin.container.code;
    if (!code) this.skip();
    seedAssignedAudit({ name: uniqueAuditName('mob-container'), assignOnScan: true }).then(
      ({ auditName, bins }) => {
        if (!bins.length) this.skip();
        page.visit().openAudit(auditName);
        page.locateByScanningContainer(code);
        page.startCounting(scopeBin.code);
        page.assertFilingTarget('container', code);
      }
    );
  });

  // Use case — finding the bin by its label
  // Use case — finding the bin by its label
  //
  // The locate step is where opening an audit LANDS, not somewhere reachable from
  // the bin list: three cards — "Scan a location", "Scan a container", "Choose from
  // the list" — and the scan field only exists once one of the scan cards is
  // tapped (`locateMode`, worker/index.tsx:307). The old version called
  // `openAuditBins()`, which walks past this step via "Choose from the list", then
  // looked for a placeholder that by then could not be on the page, and skipped
  // itself with "this build does not surface the locate step" — describing its own
  // navigation rather than the build.
  it('SW-IAUD-MOB-TC25: the worker can find their bin by scanning its location code', function () {
    seedAssignedAudit({ name: uniqueAuditName('mob-locate') }).then(({ auditName, bins }) => {
      // SCAN THE PATH, ASSERT THE CODE.
      //
      // `GET /locations/universal-scan` resolves a location by its full dotted
      // PATH (`LOWER(path) = LOWER($1)`, location.service.ts:668) — a bare bin code
      // like "BN-4" matches nothing and comes back 400 "No container or location
      // found" (verified on QA 2026-08-20). So the QR label a worker scans carries
      // the path, and a test that typed the code was asserting against a request
      // that could only ever fail. The bin CARD still renders the short code, which
      // is what the assertion reads.
      const path = bins[0].locationPath;
      const code = bins[0].locationCode || String(bins[0].locationId);
      if (!path) this.skip(); // this bin carries no scannable label
      page.visit().openAudit(auditName);
      page.locateByScanningLocation(path);
      page.assertBinListed(code);
    });
  });

  // ==========================================================================
  // Submitting
  // ==========================================================================

  // Decision table — uncounted products need an explicit confirmation
  it('SW-IAUD-MOB-TC26: submitting with uncounted products asks for confirmation', () => {
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      // Nothing counted at all, so every line is uncounted.
      page.submitCount();
      page.assertUncountedConfirmation();
    });
  });

  // State transition — the last bin sends the audit to review
  it('SW-IAUD-MOB-TC27: submitting the last assigned bin sends the audit to review', { tags: ['@smoke'] }, () => {
    seedAssignedAudit().then(({ auditId, bins }) => {
      // Submit every bin but the last over the API, then do the last one in the UI.
      const rest = bins.slice(0, -1);
      const last = bins[bins.length - 1];
      const chain = rest.reduce(
        (acc, b) => acc.then(() => startBin(workerJwt, b.id).then(() => submitBin(workerJwt, b.id, true))),
        cy.wrap(null, { log: false })
      );
      chain.then(() =>
        startBin(workerJwt, last.id).then(() =>
          submitBin(workerJwt, last.id, true).then((res) => {
            expectAccepted(res, 'the last bin must submit');
            expect(unwrap(res).status, 'the bin is submitted').to.eq('Submitted');
            expect(
              unwrap(res).auditStatus,
              'the last bin drives the audit to PendingReview'
            ).to.eq('PendingReview');
          })
        )
      );
    });
  });

  // ==========================================================================
  // Ownership and cancellation
  // ==========================================================================

  // Decision table — a worker may only touch their own tasks
  it('SW-IAUD-MOB-TC28: a worker cannot act on a bin assigned to somebody else', { tags: ['@smoke'] }, () => {
    // BOTH identities go on the roster at create time. `assignBins` refuses any id
    // that is not on the audit's own roster with a 400 (ASG-TC11 asserts exactly
    // that), so handing the bin to a stranger afterwards could never work — the
    // earlier form failed on the setup, not on the guard under test.
    const OTHER = 'cy-other-worker';
    seedAssignedAudit({
      name: uniqueAuditName('mob-own'),
      workers: [
        { userId: workerId, userName: 'Cypress Worker' },
        { userId: OTHER, userName: 'Someone Else' },
      ],
    }).then(({ auditId, bins }) => {
      const bin = bins[0];
      // Hand it to the OTHER identity, then try every count action as this one.
      assignBins(adminJwt, auditId, [{ binId: bin.id, userId: OTHER }]).then((a) => {
        expectAccepted(a, 'the reassignment must succeed');
        startBin(workerJwt, bin.id).then((s) => {
          expect(s.status, "starting somebody else's bin is forbidden").to.eq(403);
          // The platform NORMALISES every 403 body: `EXCEPTION_MESSAGES.FORBIDDEN`
          // ('Access denied', Backend/src/constant.ts) replaces the service's own
          // "This count task is not assigned to you." So the observable contract is
          // the code plus the generic message — asserting the service's wording here
          // could never pass. The off-roster 400 in ASG-TC11 is NOT normalised, which
          // is why that one can still assert its sentence.
          expect(s.body.error.code, 'refused as forbidden, not as a bad request').to.eq('FORBIDDEN');
          expect(
          String(s.body.error.message),
          'every 403 body is normalised to EXCEPTION_MESSAGES.FORBIDDEN'
        ).to.eq('Access denied');
        });
        scanSerial(workerJwt, bin.id, 'CY-ANY').then((sc) => {
          expect(sc.status, 'scanning into it is forbidden too').to.eq(403);
        });
        submitBin(workerJwt, bin.id).then((sb) => {
          expect(sb.status, 'and submitting it').to.eq(403);
        });
      });
    });
  });

  // Decision table — a cancelled audit refuses counting AND says why
  it('SW-IAUD-MOB-TC29: a cancelled audit refuses counting with the cancellation as the reason', () => {
    seedAssignedAudit().then(({ auditId, bins }) => {
      const bin = bins[0];
      startBin(workerJwt, bin.id).then((s) => {
        expectAccepted(s, 'the worker opens their own bin');
        cancelAuditApi(adminJwt, auditId).then((c) => {
          expectAccepted(c, 'the admin cancels underneath them');
          scanSerial(workerJwt, bin.id, 'CY-AFTER-CANCEL').then((res) => {
            expect(res.status, 'a cancelled count is a 409, not a bare 404').to.eq(409);
            const detail = res.body.error || {};
            const payload = (detail.details && detail.details[0]) || detail;
            expect(
              JSON.stringify(payload),
              'the refusal carries a machine-readable cancellation code so the handheld can leave the screen'
            ).to.match(/AUDIT_CANCELLED|cancel/i);
          });
        });
      });
    });
  });

  // Error guessing — a scan must never vanish quietly
  it('SW-IAUD-MOB-TC30: a scan that fails in transit is reported, not dropped', function () {
    if (!scopeBin.serials.length) this.skip();
    seedAssignedAudit().then(({ auditName, bins }) => {
      const code = bins[0].locationCode || String(bins[0].locationId);
      page.visit().openAuditBins(auditName).startCounting(code);
      page.assertOnCountStep();
      cy.intercept('POST', '**/inventory-audits/bins/*/scan', { forceNetworkError: true }).as('scanDied');
      page.scanWithWedge(scopeBin.serials[0]);
      // The worker must be told; the tally must not claim the serial was counted.
      page.assertSnackbar(/.+/);
      page.assertTally(0);
    });
  });
});
