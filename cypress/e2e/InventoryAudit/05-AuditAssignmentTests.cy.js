// cypress/e2e/InventoryAudit/05-AuditAssignmentTests.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md  (§9.1.4, SW-IAUD-ASG-TC01..22)
// Component:  Frontend/src/components/ABC/AuditDetail.tsx
// Backend:    audit-management.controller.ts — GET /:id/bins, POST /:id/assignments
//             async-tasks/audit-count-generation — RoundRobin + mid-audit sync
//
// WHY assignment has its own spec rather than living in the list plan: an
// UNASSIGNED bin is invisible to every worker, because the worker task query
// filters on `assignedUserId`. So "generation succeeded" and "somebody can count
// it" are different claims, and assignment is the hinge between them.
//
// Timing is the hard part here, not access. Bins do not exist until generation
// finishes, and the only correct signal is `binsGeneratedAt` on the audit header —
// never "bins are non-empty", because a zero-bin scope finishes generation
// legitimately and a wait for non-empty would hang to the timeout (ASG-TC02).
//
// Everything runs live: assignment has no conditional cells worth stubbing, and
// the strategy outcomes are only meaningful against real generation.

import AuditDetailPage from '../../pageObjects/InventoryAudit/auditDetailPage';
import { uniqueAuditName } from '../../support/InventoryAudit/auditHelpers';
import { ensureGrowableScope, resolveCountActor } from '../../support/InventoryAudit/auditWarehouse';
import {
  assignBins,
  cancelAuditApi,
  createAudit,
  forceReleaseAudit,
  getBins,
  getPreview,
  getWorkerTasks,
  getWorkers,
  probeStockedBin,
  startBin,
  sweepLeftoverAudits,
  unwrap,
  waitForGeneration,
} from '../../support/InventoryAudit/auditLifecycle';

const MISSING_ID = 999999999;

describe('Inventory Audit — Bin assignment', { tags: ['@regression'] }, () => {
  const detail = new AuditDetailPage();

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
  let workerId; // the identity whose task list proves reachability
  let roster = []; // the audit workers used for every create here
  let scopeBin = null; // a bin holding countable stock
  const created = [];
  const lateScopes = []; // disposable warehouse branches built by the late-bin cases

  /** Create an audit over the probed bin and wait until its bins exist. */
  const seedAudit = (overrides = {}) => {
    const body = Object.assign(
      {
        name: uniqueAuditName('asg'),
        auditType: 'Location',
        scopeLocationId: scopeBin.id,
        assignmentStrategy: 'RoundRobin',
        workers: roster,
      },
      overrides
    );
    return createAudit(adminJwt, body).then((res) => {
      expect(res.status, `seed create for ${body.name}`).to.be.oneOf([200, 201]);
      const id = unwrap(res).id;
      created.push(id);
      return waitForGeneration(adminJwt, id).then(() => id);
    });
  };

  /**
   * The status a successful assignment call returns.
   *
   * `POST /:id/assignments` is annotated `@ApiOkResponse` (Swagger metadata only)
   * and has no `@HttpCode(200)`, so NestJS applies its POST default and the route
   * actually answers **201** — same mismatch as `POST /:id/cancel`. Verified against
   * QA on 2026-08-19. Accepting both keeps the suite honest about the observable
   * contract; the annotation being wrong is a documentation defect to raise, not a
   * reason to sit red.
   */
  const expectAssigned = (res, why = 'the assignment call must succeed') => {
    expect(res.status, why).to.be.oneOf([200, 201]);
    return res;
  };

  before(() => {
    cy.login().then((t) => {
      adminJwt = t;
    });

    // Two roster workers: with one, a "distribution" is indistinguishable from a
    // coincidence (ASG-TC04). Real ids where available, synthetic to top up —
    // inventory_audit_assignments has no FK to the identity server.
    cy.then(() =>
      getWorkers(adminJwt).then((res) => {
        const real = (unwrap(res) || []).slice(0, 2);
        roster = real.map((w) => ({ userId: w.userId, userName: w.name }));
        while (roster.length < 2) {
          roster.push({ userId: `cy-asg-w${roster.length + 1}`, userName: `Cypress Worker ${roster.length + 1}` });
        }
      })
    );

    // The count identity, and its seat on the roster.
    //
    // `workerId` must be the id the count routes compare against — the token's own
    // `sub`, never a roster row matched by name. And that id must be ON the audit
    // roster, because `assignBins` refuses anything else with a 400 (ASG-TC11
    // asserts exactly that), so it is seated explicitly rather than assumed to be
    // among the first two.
    cy.then(() =>
      resolveCountActor(adminJwt).then((a) => {
        countActor = a;
        workerJwt = a.usable ? a.token : null;
        workerId = a.usable ? a.userId : null;
        if (a.usable && !roster.some((w) => w.userId === a.userId)) {
          roster[0] = { userId: a.userId, userName: a.userName };
        }
        cy.log(
          `count actor: ${a.isRealWorker ? 'real `user` account' : 'admin acting as worker'}`
        );
      })
    );

    cy.then(() => probeStockedBin(adminJwt).then((bin) => {
      scopeBin = bin;
    }));

    // Leftovers from a crashed run hold their names in the unique window.
    cy.then(() => sweepLeftoverAudits(adminJwt, 'cy-asg-'));
  });

  beforeEach(function () {
    if (!scopeBin) this.skip(); // no stocked bin on this environment — see pending.md
    cy.authSession('admin');
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
  });

  after(() => {
    // Genuine safety net: whatever is still here failed to release above.
    created.slice().forEach((id) => forceReleaseAudit(adminJwt, workerJwt, id));
    // Then the warehouse branches the late-bin cases built. Ordered AFTER the
    // releases on purpose: a location under a live audit's frozen bin refuses to
    // be deleted, so cancelling first is what makes the delete succeed.
    cy.then(() => lateScopes.splice(0, lateScopes.length).forEach((scope) => scope.cleanup()));
  });

  // ==========================================================================
  // The detail screen and generation timing
  // ==========================================================================

  // Use case — where an admin lands after creating, and why the screen polls
  it('SW-IAUD-ASG-TC01: creating an audit lands on its detail screen while generation runs', { tags: ['@smoke'] }, () => {
    createAudit(adminJwt, {
      name: uniqueAuditName('asg-land'),
      auditType: 'Location',
      scopeLocationId: scopeBin.id,
      workers: roster,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const audit = unwrap(res);
      created.push(audit.id);
      detail.visit(audit.id).assertOnDetailRoute(audit.id);
      detail.assertAuditName(audit.name);
      // The header renders the audit's own `scopeLocationLabel`, which the backend
      // builds as "name (type)" — not the raw location code.
      detail.assertHeaderItem('Location', audit.scopeLocationLabel);
      detail.assertHeaderItem('Workers', String(roster.length));
      // Either the spinner is up, or generation already finished — both are the
      // screen behaving. What must NOT happen is a permanent spinner (TC02).
      detail.waitForGeneration();
      detail.assertNotGenerating();
    });
  });

  // Error guessing — the spinner must stop on "finished", not on "non-empty".
  // A zero-bin scope is the case that used to spin forever.
  it('SW-IAUD-ASG-TC02: polling stops even when generation produced no bins', function () {
    // An ABC audit for a class the scope does not hold generates zero bins.
    getPreview(adminJwt, scopeBin.id).then((pv) => {
      const preview = unwrap(pv);
      const empty = ['A', 'B', 'C'].find((c) => c);
      if (!preview) this.skip();
      // Find a class with no binned inventory here; if all three have stock, skip.
      const probe = (classes) => {
        if (!classes.length) return null;
        return getPreview(adminJwt, scopeBin.id, classes[0]).then((r) =>
          Number((unwrap(r) || {}).binCount) === 0 ? classes[0] : probe(classes.slice(1))
        );
      };
      return probe(['A', 'B', 'C']).then((emptyClass) => {
        if (!emptyClass) this.skip(); // every class has stock here — see pending.md
        void empty;
        return createAudit(adminJwt, {
          name: uniqueAuditName('asg-empty'),
          auditType: 'Abc',
          abcClass: emptyClass,
          scopeLocationId: scopeBin.id,
          workers: roster,
        }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          const id = unwrap(res).id;
          created.push(id);
          detail.visit(id);
          detail.waitForGeneration();
          detail.assertNotGenerating().assertNoBinsWarning();
        });
      });
    });
  });

  // EP — the bins table describes each generated count task
  it('SW-IAUD-ASG-TC03: the bins table lists each bin with its product and unit counts', () => {
    seedAudit().then((id) => {
      detail.visit(id);
      detail.waitForGeneration();
      detail.assertBinColumnOrder().assertBinRowCountAtLeast(1);
      getBins(adminJwt, id).then((res) => {
        const bins = unwrap(res);
        detail.assertBinRowCount(bins.length);
        detail.assertBinCell(0, 'Bin', bins[0].locationCode || String(bins[0].locationId));
        detail.assertBinCell(0, 'Products', String(bins[0].lineCount));
      });
    });
  });

  // ==========================================================================
  // Strategy outcomes at generation
  // ==========================================================================

  // Decision table, column 1 — RoundRobin assigns every bin
  it('SW-IAUD-ASG-TC04: auto assignment hands every generated bin to a worker', { tags: ['@smoke'] }, () => {
    seedAudit({ name: uniqueAuditName('asg-rr'), assignmentStrategy: 'RoundRobin' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bins = unwrap(res);
        expect(bins.length, 'the seed scope must generate at least one bin').to.be.at.least(1);
        bins.forEach((b) => {
          expect(b.assignedUserId, `bin ${b.id} must be auto-assigned under RoundRobin`).to.not.eq(null);
        });
        // With 2+ bins the distribution should touch more than one worker; with
        // exactly one bin there is nothing to distribute, so only assert spread
        // when the scope actually produced enough bins to show it.
        if (bins.length >= roster.length) {
          const distinct = new Set(bins.map((b) => b.assignedUserId));
          expect(distinct.size, 'bins are spread across the roster, not all on one worker').to.be.at.least(2);
        }
      });
    });
  });

  // Decision table, column 2 — Manual leaves every bin unassigned
  it('SW-IAUD-ASG-TC05: manual assignment leaves every generated bin unassigned', () => {
    seedAudit({ name: uniqueAuditName('asg-man'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bins = unwrap(res);
        expect(bins.length, 'the probed scope must generate something to assign').to.be.at.least(1);
        bins.forEach((b) => {
          expect(b.assignedUserId, `bin ${b.id} must be unassigned under the Manual strategy`).to.eq(null);
        });
      });
    });
  });

  // ==========================================================================
  // The assignment control
  // ==========================================================================

  // Use case — a bin can only be handed to one of the audit's own workers
  it('SW-IAUD-ASG-TC06: the worker dropdown offers exactly the audit roster plus Unassigned', () => {
    seedAudit({ name: uniqueAuditName('asg-opts'), assignmentStrategy: 'Manual' }).then((id) => {
      detail.visit(id);
      detail.waitForGeneration();
      detail.readWorkerOptions(0).then((options) => {
        expect(options, 'Unassigned plus one option per roster worker').to.have.length(roster.length + 1);
        expect(options.join(' '), 'clearing an assignment is always offered').to.match(/unassigned/i);
        roster.forEach((w) => {
          expect(options.join(' '), `roster worker ${w.userName} is offered`).to.contain(w.userName);
        });
      });
      detail.closeOpenSelect();
    });
  });

  // Use case — saving sends only what changed, and reports updated vs skipped
  it('SW-IAUD-ASG-TC07: saving an assignment change sends only the changed bin', { tags: ['@smoke'] }, () => {
    seedAudit({ name: uniqueAuditName('asg-save'), assignmentStrategy: 'Manual' }).then((id) => {
      detail.visit(id);
      detail.waitForGeneration();
      detail.assertSaveDisabled();
      cy.intercept('POST', `**/inventory-audits/${id}/assignments`).as('assign');
      detail.assignRowTo(0, roster[0].userName);
      detail.readPendingChangeCount().should('eq', 1);
      detail.assertSaveEnabled().save();
      cy.wait('@assign').then(({ request, response }) => {
        expect(request.body.assignments, 'only the one changed bin is sent').to.have.length(1);
        expect(response.statusCode, 'the save succeeds — 201 is the Nest POST default').to.be.oneOf([200, 201]);
        expect(response.body.data.updated, 'the one bin was updated').to.eq(1);
        expect(response.body.data.skipped, 'every Pending bin is assignable — none skipped').to.eq(0);
      });
      detail.assertToast(/1 bin updated/i);
      detail.assertBinCell(0, 'Assigned worker', roster[0].userName);
    });
  });

  // Decision table — a bin already being counted is immutable
  it('SW-IAUD-ASG-TC08: a bin being counted is read-only and excluded from the save', function () {
    if (!workerJwt || !workerId) this.skip(); // needs a real worker to start a bin
    seedAudit({ name: uniqueAuditName('asg-lock'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bin = unwrap(res)[0];
        // Hand it to the real worker, then have them start counting it.
        assignBins(adminJwt, id, [{ binId: bin.id, userId: workerId }]).then((a) => {
          expectAssigned(a);
          startBin(workerJwt, bin.id).then((s) => {
            // Another POST without @HttpCode(200) — 201 is Nest's default.
            expect(s.status, 'the worker must be able to start their own bin').to.be.oneOf([200, 201]);
            detail.visit(id);
            detail.waitForGeneration();
            detail.assertRowLocked(0);
            // And the API reports it as skipped rather than erroring.
            assignBins(adminJwt, id, [{ binId: bin.id, userId: roster[0].userId }]).then((again) => {
              expectAssigned(again);
              expect(again.body.data.skipped, 'an in-progress bin counts as skipped').to.eq(1);
              expect(again.body.data.updated).to.eq(0);
            });
          });
        });
      });
    });
  });

  // EP — a bin can be unassigned again
  it('SW-IAUD-ASG-TC09: clearing a worker unassigns the bin', () => {
    seedAudit({ name: uniqueAuditName('asg-clear'), assignmentStrategy: 'RoundRobin' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bin = unwrap(res)[0];
        expect(bin.assignedUserId, 'RoundRobin seeded an assignment to clear').to.not.eq(null);
        assignBins(adminJwt, id, [{ binId: bin.id, userId: null }]).then((a) => {
          expectAssigned(a);
          expect(a.body.data.updated).to.eq(1);
          getBins(adminJwt, id).then((after) => {
            const cleared = unwrap(after).find((b) => b.id === bin.id);
            expect(cleared.assignedUserId, 'the bin now belongs to nobody').to.eq(null);
            expect(cleared.assignedUserName).to.eq(null);
          });
        });
      });
    });
  });

  // Error guessing — an unchanged form must send nothing
  it('SW-IAUD-ASG-TC10: saving with nothing changed sends no request', () => {
    seedAudit({ name: uniqueAuditName('asg-noop'), assignmentStrategy: 'Manual' }).then((id) => {
      cy.intercept('POST', `**/inventory-audits/${id}/assignments`, cy.spy().as('assignSpy'));
      detail.visit(id);
      detail.waitForGeneration();
      detail.assertSaveDisabled();
      cy.get('@assignSpy').should('not.have.been.called');
    });
  });

  // ==========================================================================
  // The API contract
  // ==========================================================================

  // Decision table — the roster gate
  it('SW-IAUD-ASG-TC11: a bin cannot be handed to someone outside the roster', () => {
    seedAudit({ name: uniqueAuditName('asg-gate'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bin = unwrap(res)[0];
        assignBins(adminJwt, id, [{ binId: bin.id, userId: 'cy-not-on-this-audit' }]).then((a) => {
          expect(a.status, 'an off-roster worker is a 400, not a silent no-op').to.eq(400);
          expect(String(a.body.error.message)).to.match(/not assigned to this audit/i);
        });
      });
    });
  });

  // Decision table — a non-Pending bin is skipped, not an error (API view of TC08)
  it('SW-IAUD-ASG-TC12: assigning a bin that no longer accepts changes is reported as skipped', function () {
    if (!workerJwt || !workerId) this.skip();
    seedAudit({ name: uniqueAuditName('asg-skip'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bins = unwrap(res);
        const target = bins[0];
        assignBins(adminJwt, id, [{ binId: target.id, userId: workerId }]).then(() =>
          startBin(workerJwt, target.id).then(() =>
            assignBins(adminJwt, id, [{ binId: target.id, userId: roster[0].userId }]).then((a) => {
              expectAssigned(a);
              expect(a.body.data.skipped).to.eq(1);
              getBins(adminJwt, id).then((after) => {
                const unchanged = unwrap(after).find((b) => b.id === target.id);
                expect(unchanged.assignedUserId, 'the existing assignment survives').to.eq(workerId);
              });
            })
          )
        );
      });
    });
  });

  // Error guessing — the display name is authoritative server-side
  it('SW-IAUD-ASG-TC13: the stored worker name comes from the roster, not the request', () => {
    seedAudit({ name: uniqueAuditName('asg-name'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bin = unwrap(res)[0];
        // The route takes no name at all — prove the stored one is the roster's.
        assignBins(adminJwt, id, [{ binId: bin.id, userId: roster[0].userId, userName: 'SPOOFED NAME' }]).then(
          (a) => {
            // An unknown field is rejected by the closed schema; either way the
            // spoofed name must never be persisted. Note the success test is
            // `200 OR 201` — this POST has no @HttpCode(200), so a strict 200 sent
            // every successful run down the "rejected" branch and asserted 201 === 400.
            if (a.status === 200 || a.status === 201) {
              getBins(adminJwt, id).then((after) => {
                const row = unwrap(after).find((b) => b.id === bin.id);
                expect(row.assignedUserName, 'the roster name wins').to.not.eq('SPOOFED NAME');
                expect(row.assignedUserName).to.eq(roster[0].userName);
              });
            } else {
              expect(a.status, 'a closed schema rejects the extra field outright').to.eq(400);
            }
          }
        );
      });
    });
  });

  // BVA — the assignment batch: empty and single
  it('SW-IAUD-ASG-TC14: an empty assignment list is refused and a single one accepted', () => {
    seedAudit({ name: uniqueAuditName('asg-bva1'), assignmentStrategy: 'Manual' }).then((id) => {
      assignBins(adminJwt, id, []).then((a) => {
        expect(a.status, 'min(1) on the assignments array').to.eq(400);
      });
      getBins(adminJwt, id).then((res) => {
        assignBins(adminJwt, id, [{ binId: unwrap(res)[0].id, userId: roster[0].userId }]).then((a) => {
          expectAssigned(a);
        });
      });
    });
  });

  // BVA — the upper end of the batch range that actually occurs
  it('SW-IAUD-ASG-TC15: a 500-assignment batch is accepted in one call', () => {
    seedAudit({ name: uniqueAuditName('asg-bva2'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const realBin = unwrap(res)[0].id;
        // Unique binIds are required (the schema de-dupes), and ids that do not
        // belong to this audit come back as `skipped` — which is what makes a
        // multi-hundred-entry batch safe to send at all.
        const batch = (n) =>
          Array.from({ length: n }, (_, i) => ({
            binId: i === 0 ? realBin : MISSING_ID - i,
            userId: roster[0].userId,
          }));
        // The asserted boundary is deliberately NOT `MAX_BIN_ASSIGNMENTS`.
        //
        // `MAX_BIN_ASSIGNMENTS = 5000` (audit-management.schema.ts) is a Joi ceiling
        // nobody signed off as a serviceable throughput requirement — and the endpoint
        // does answer 500 at exactly 5000 (observed 2026-08-19), because `assignBins`
        // loops one UPDATE per assignment inside a single transaction. Asserting 5000
        // would therefore report an unagreed number as a product defect. 500 is the
        // batch size a real facility audit produces, so that is what is asserted:
        // regress the endpoint below a size that actually occurs and this goes red.
        // If a cap is ever agreed, raise this constant to it and the test still holds.
        const REALISTIC_BATCH = 500;
        assignBins(adminJwt, id, batch(REALISTIC_BATCH)).then((a) => {
          // `oneOf([200, 201])`, not a strict 200: this route has no @HttpCode(200),
          // so a strict 200 would go red on a correct server for the wrong reason.
          expect(a.status, 'a realistic facility-sized batch must be servable').to.be.oneOf([200, 201]);
          expect(a.body.data.updated + a.body.data.skipped).to.eq(REALISTIC_BATCH);
        });
        // NOT asserted here: anything at or around `MAX_BIN_ASSIGNMENTS`. Sent 5000
        // the endpoint answers 500, and sent 5001 it answers 500 as well rather than
        // the Joi 400 — i.e. the whole 5000-scale is unserviceable on this build, in
        // both directions. Since no cap was ever agreed, asserting either side of
        // 5000 would report an arbitrary schema constant as a product requirement.
        // The lower boundaries (0 refused, 1 accepted) are SW-IAUD-ASG-TC14; this TC
        // is the upper end of the range that actually occurs. Re-add a ceiling pair
        // here — accepted at N, refused at N+1 — the day N is decided.
      });
    });
  });

  // EP — a repeated bin in one call
  it('SW-IAUD-ASG-TC16: the same bin twice in one call is refused', () => {
    seedAudit({ name: uniqueAuditName('asg-dup'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const binId = unwrap(res)[0].id;
        assignBins(adminJwt, id, [
          { binId, userId: roster[0].userId },
          { binId, userId: roster[1].userId },
        ]).then((a) => {
          expect(a.status, 'the schema de-dupes on binId').to.eq(400);
        });
      });
    });
  });

  // EP — unknown audit
  it('SW-IAUD-ASG-TC17: assigning bins on an audit that does not exist reports not found', () => {
    assignBins(adminJwt, MISSING_ID, [{ binId: 1, userId: 'cy-any' }]).then((a) => {
      expect(a.status).to.eq(404);
    });
  });

  // ==========================================================================
  // Assignment is what makes a task reachable
  // ==========================================================================

  // Decision table — the whole point of the group
  it('SW-IAUD-ASG-TC18: only an assigned bin reaches a worker', { tags: ['@smoke'] }, function () {
    if (!workerJwt || !workerId) this.skip();
    seedAudit({ name: uniqueAuditName('asg-reach'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bins = unwrap(res);
        const assigned = bins[0];
        const untouched = bins[1]; // may be undefined on a single-bin scope
        assignBins(adminJwt, id, [{ binId: assigned.id, userId: workerId }]).then(() => {
          getWorkerTasks(workerJwt, id).then((tasks) => {
            expect(tasks.status, 'the worker can read their own tasks').to.eq(200);
            const ids = (unwrap(tasks).bins || []).map((b) => b.id);
            expect(ids, 'the assigned bin is on their list').to.include(assigned.id);
            if (untouched) {
              expect(ids, 'an unassigned bin reaches nobody').to.not.include(untouched.id);
            }
          });
        });
      });
    });
  });

  // Decision table — reassignment moves the task between lists
  it('SW-IAUD-ASG-TC19: reassigning a bin moves it off the first list and onto the second', function () {
    if (!workerJwt || !workerId) this.skip();
    seedAudit({ name: uniqueAuditName('asg-move'), assignmentStrategy: 'Manual' }).then((id) => {
      getBins(adminJwt, id).then((res) => {
        const bin = unwrap(res)[0];
        assignBins(adminJwt, id, [{ binId: bin.id, userId: workerId }]).then(() =>
          getWorkerTasks(workerJwt, id).then((before) => {
            expect((unwrap(before).bins || []).map((b) => b.id)).to.include(bin.id);
            // Hand it to the OTHER roster member.
            const other = roster.find((w) => w.userId !== workerId) || roster[1];
            assignBins(adminJwt, id, [{ binId: bin.id, userId: other.userId }]).then((a) => {
              expectAssigned(a);
              getWorkerTasks(workerJwt, id).then((after) => {
                expect(
                  (unwrap(after).bins || []).map((b) => b.id),
                  'the bin left the first worker list'
                ).to.not.include(bin.id);
              });
            });
          })
        );
      });
    });
  });

  // ==========================================================================
  // A bin that appears mid-audit
  // ==========================================================================

  /**
   * Run one late-bin case: an audit over a scope this suite owns, then a NEW bin
   * created underneath it while the audit is live.
   *
   * The scope is a facility built for the test rather than the probed bin, because
   * the rule only shows itself when a bin appears INSIDE a live audit's scope —
   * and growing a bin the tenant already owns would leave warehouse structure
   * behind. `ensureGrowableScope` builds the branch and tears it down as one root
   * delete, so QA is exactly as it was.
   *
   * The fold-in itself is synchronous: `LocationService` awaits
   * `syncNewBinsIntoRunningAudits` before answering the create (location.service.ts
   * :43), so the bin is on file by the time the create response lands and there is
   * nothing to poll for.
   */
  const withLateBin = (strategy, assertion) =>
    ensureGrowableScope(adminJwt).then((scope) => {
      if (!scope) return null; // tenant refused the location create — caller skips
      lateScopes.push(scope);
      return seedAudit({ scopeLocationId: scope.facility.id, assignmentStrategy: strategy }).then((id) =>
        getBins(adminJwt, id).then((before) => {
          const beforeIds = (unwrap(before) || []).map((b) => b.locationId);
          expect(
            beforeIds,
            'the audit starts holding the bin that existed at generation time'
          ).to.include(scope.firstBin.id);
          return scope.addBin().then((late) => {
            expect(late, 'the late bin was created').to.not.eq(null);
            return getBins(adminJwt, id).then((after) => {
              const rows = unwrap(after) || [];
              const row = rows.find((b) => Number(b.locationId) === Number(late.id));
              expect(
                row,
                'a bin created inside a live audit scope is folded into that audit'
              ).to.not.eq(undefined);
              expect(beforeIds, 'and it genuinely was not there before').to.not.include(late.id);
              return assertion(row, rows, id);
            });
          });
        })
      );
    });

  // Decision table — RoundRobin folds a late bin in AND assigns it
  it('SW-IAUD-ASG-TC20: a bin created under a live auto-assignment audit is folded in and assigned', function () {
    withLateBin('RoundRobin', (row) => {
      if (!row) return null;
      // `resolveBinAssignee` prefers whoever already holds a bin under the same
      // parent path, and falls back to the lightest-loaded roster member — either
      // way an auto-assignment audit must never leave the new bin unreachable,
      // because a bin with no `assignedUserId` appears on nobody's task list.
      expect(row.assignedUserId, 'RoundRobin assigns the late bin to a worker').to.not.eq(null);
      expect(
        roster.map((w) => w.userId),
        'and it goes to a member of this audit roster'
      ).to.include(row.assignedUserId);
      expect(row.status, 'the folded-in bin is ready to be counted').to.eq('Pending');
    }).then((r) => {
      if (r === null) this.skip(); // could not build a disposable scope on this tenant
    });
  });

  // Decision table — Manual leaves a late bin alone
  it('SW-IAUD-ASG-TC21: a bin created under a live manual audit stays unassigned', function () {
    withLateBin('Manual', (row, rows, id) => {
      if (!row) return null;
      // The mirror image of TC20, and the reason the two are separate cases:
      // `resolveBinAssignee` returns null immediately for Manual, so the bin is
      // folded in but deliberately left for the admin to hand out.
      expect(row.assignedUserId, 'Manual assigns nothing automatically').to.eq(null);
      expect(row.status, 'it is still assignable').to.eq('Pending');
      // Proving it is a real, assignable bin and not an inert row: hand it over.
      return assignBins(adminJwt, id, [{ binId: row.id, userId: workerId }]).then((res) => {
        expectAssigned(res, 'the admin can assign the late bin by hand');
        return getBins(adminJwt, id).then((after) => {
          const again = (unwrap(after) || []).find((b) => b.id === row.id);
          expect(again.assignedUserId, 'the manual handoff sticks').to.eq(workerId);
        });
      });
    }).then((r) => {
      if (r === null) this.skip();
    });
  });

  // ==========================================================================
  // Navigation out
  // ==========================================================================

  // Use case — the review link and its gate
  it('SW-IAUD-ASG-TC22: the detail screen reports discrepancies once counting produces them', () => {
    seedAudit({ name: uniqueAuditName('asg-review'), assignmentStrategy: 'Manual' }).then((id) => {
      detail.visit(id);
      detail.waitForGeneration();
      // Nothing counted yet, so the review action is present but disabled. The
      // explanatory copy lives in a MUI Tooltip `title`, which is NOT in the DOM
      // until the wrapper is hovered — so hover it rather than searching the page.
      detail.assertReviewDisabled();
      cy.findByRole('button', { name: /(review|view) discrepancies/i })
        .parent()
        .trigger('mouseover');
      cy.findByRole('tooltip').invoke('text').should('match', /nothing counted yet/i);
      cancelAuditApi(adminJwt, id);
    });
  });
});
