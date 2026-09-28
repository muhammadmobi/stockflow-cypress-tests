/**
 * Audit Management API Tests — Inventory Audit → Audits
 * =============================================================================
 * Test plan: cypress/qa/testPlans/inventoryAudit/plan.md  (§9.2.1)
 *
 * Backend:
 *   - Backend/src/modules/inventory-audit/audit-management.controller.ts
 *   - Backend/src/modules/inventory-audit/audit-management.service.ts
 *   - Backend/src/modules/inventory-audit/schema/audit-management.schema.ts
 *   - Backend/src/modules/inventory-audit/audit-admin.access.ts   (inline admin gate)
 *
 * Endpoints exercised
 * -------------------
 *   GET  /inventory-audits                 list (status / auditType filters)
 *   GET  /inventory-audits/:id             header + roster + bin roll-up
 *   GET  /inventory-audits/workers         assignable workers (role `user`)
 *   GET  /inventory-audits/preview         live scope preview
 *   POST /inventory-audits                 create + enqueue count-task generation
 *   POST /inventory-audits/:id/cancel      non-destructive terminal transition
 *   GET  /inventory-audits/settings        audit-wide settings
 *   PUT  /inventory-audits/settings        update settings
 *   GET  /inventory-audits/:id/report/export   close-out report as an xlsx workbook
 *                                          (audit-report.controller.ts — kept here
 *                                          rather than in a spec of its own because
 *                                          it is the only audit-report route with an
 *                                          auth contract worth asserting twice:
 *                                          bearer header AND ?token= fallback,
 *                                          per SKILL §6 convention 7)
 *
 * Filter asymmetries that shape the assertions (plan §6.8 — do NOT "simplify"):
 *   - Joi 400  → `error.message` is a JSON-STRINGIFIED array of {field,message};
 *                `error.details` is []. Assert on `error.message`.
 *   - plain 400 → `error.message` verbatim, `error.details` [].
 *   - 409       → `error.message` is the generic "Resource conflicts"; the useful
 *                sentence is in `error.details[0].message` (+ field / code).
 *   - 403       → error.code 'FORBIDDEN', error.message 'Access denied'.
 *   - 404       → error.message verbatim ("Audit 999999999 not found").
 *
 * Seeding / skips
 * ---------------
 * A creatable audit needs a real WMS location holding binned inventory. before()
 * probes /locations then /inventory-audits/preview to find (a) a scope with bins
 * at all and (b) a scope with binned inventory of a given ABC class. When QA has
 * neither, the create/cancel blocks this.skip() rather than failing — environment
 * absence is not a product defect (SKILL §6 convention 8).
 *
 * Test ID convention: SW-IAUD-API-TC01..TC60
 *
 * Cleanup: after() cancels every audit created here (cancel is the only terminal
 * state reachable without counting, and it frees the name for the next run) and
 * restores the audit settings captured in before().
 */

import {
  forceReleaseAudit,
  listAllBins,
  liveAuditScopeFilter,
  waitForGeneration,
} from '../../support/InventoryAudit/auditLifecycle';
import {
  ensureDeletedLocation,
  ensurePrefixSiblingLocations,
  ensureQuantityInBin,
  resolveCountActor,
  resolveNonAdminActor,
} from '../../support/InventoryAudit/auditWarehouse';

const MISSING_ID = 999999999; // guaranteed-missing: destructive routes target this

describe('Audit Management API', { tags: ['@regression'] }, () => {
  const baseUrl = Cypress.env('API_BASE_URL');

  let adminJwt;
  let workerJwt; // a genuinely NON-ADMIN token — for the 403 decision-table columns; may stay null
  let nonAdminRole; // which account provided it (`user` or `sales`), for the skip message
  let workers = []; // GET /workers result
  let abcScope = null; // { id, abcClass } with binCount > 0
  let anyScope = null; // { id } with scopeBinCount > 0
  // A scope that holds QUANTITY-tracked stock. Kept apart from anyScope because
  // `driveAudit('applied')` counts a non-serial line short, and approving that is
  // the only non-destructive route to an audit that has moved stock: the serialized
  // equivalent would mark real units Missing on a shared tenant.
  let nonSerialScope = null;
  let deletedLocationId = null; // a soft-deleted location — probed, else built
  let originalSettings = null;
  /**
   * The identity that can drive the count routes — a real `user` account when one
   * resolves, otherwise the admin acting as its own worker (see `resolveCountActor`
   * for why that is legitimate and what it does not prove). It is what makes the
   * three lifecycle-state cases below reachable from an API spec at all, instead of
   * waiting for QA to happen to hold an audit in the right state.
   */
  let countActor = null;

  const createdAuditIds = [];
  /** Teardown for warehouse structure this spec built. Empty when it built none. */
  const warehouseCleanup = [];

  const headers = (token = adminJwt) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const call = (method, path, body, opts = {}) =>
    cy.request({
      method,
      url: `${baseUrl}${path}`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(opts.token),
      body,
      qs: opts.qs,
      failOnStatusCode: false,
    });

  /**
   * The status a successful cancel returns.
   *
   * `POST /:id/cancel` is annotated `@ApiOkResponse` (which documents 200) but has
   * no `@HttpCode(200)`, so NestJS applies its POST default and the route actually
   * answers **201**. Verified against QA on 2026-08-19. Accepting both keeps the
   * suite honest about the observable contract; the Swagger annotation being wrong
   * is a documentation defect to raise separately, not a reason to sit red.
   */
  const expectCancelled = (res, why = 'the cancel must succeed') => {
    expect(res.status, why).to.be.oneOf([200, 201]);
    return res;
  };

  /** A name that is unique across runs. Cypress._.uniqueId() is NOT. */
  const auditName = (tag) => `cy-aud-${tag}-${Date.now()}-${Cypress._.random(1e6)}`;

  /** Create an audit and remember its id for cleanup. */
  const createAudit = (overrides = {}, opts = {}) => {
    const body = {
      name: auditName('gen'),
      auditType: 'Abc',
      abcClass: abcScope?.abcClass ?? 'A',
      scopeLocationId: abcScope?.id ?? anyScope?.id,
      assignmentStrategy: 'RoundRobin',
      workers: [{ userId: workers[0]?.userId ?? 'cy-w-1', userName: 'Cypress Worker' }],
      ...overrides,
    };
    return call('POST', '/inventory-audits', body, opts).then((res) => {
      const id = res.body?.data?.id;
      if (id) createdAuditIds.push(id);
      return res;
    });
  };

  /** The Joi 400 contract: status 400 and the field named inside error.message. */
  const expectJoiRejection = (res, field) => {
    expect(res.status, 'Joi validation must reject with 400').to.eq(400);
    expect(res.body.success, 'envelope reports failure').to.eq(false);
    expect(
      String(res.body?.error?.message ?? ''),
      `Joi error.message must name the "${field}" field (it carries the stringified detail array)`
    ).to.contain(field);
  };

  before(() => {
    cy.login().then((token) => {
      adminJwt = token;
      expect(adminJwt, 'admin bearer token').to.be.a('string');
    });

    // Cancel audits a crashed earlier run left live.
    //
    // Load-bearing: a live audit holds its scope under the "one bin, one live audit
    // of the same expected set" rule, so a leftover makes the FIRST create in this
    // spec fail with 409 before the spec has done anything wrong. It also holds its
    // name in the active-name unique window.
    cy.then(() =>
      call('GET', '/inventory-audits').then((res) => {
        const stale = (res.body?.data ?? []).filter(
          (a) =>
            String(a.name).startsWith('cy-aud-') &&
            ['Open', 'InProgress', 'PendingReview'].includes(a.status)
        );
        stale.forEach((a) => call('POST', `/inventory-audits/${a.id}/cancel`, {}));
        if (stale.length) cy.log(`swept ${stale.length} leftover cy-aud-* audit(s)`);
      })
    );

    // Assignable workers (may legitimately be empty on a bare tenant).
    cy.then(() =>
      call('GET', '/inventory-audits/workers').then((res) => {
        workers = Array.isArray(res.body?.data) ? res.body.data : [];
      })
    );

    cy.then(() =>
      resolveCountActor(adminJwt).then((a) => {
        countActor = a;
      })
    );

    // No bin holds quantity-tracked stock? Put some in one, so TC52 can drive an
    // audit to an APPLIED adjustment. Removed again in after().
    cy.then(() => {
      if (nonSerialScope || !anyScope) return null;
      return ensureQuantityInBin(adminJwt, anyScope.id).then((staged) => {
        if (!staged) return null;
        warehouseCleanup.push(() => staged.cleanup());
        nonSerialScope = { id: anyScope.id };
      });
    });

    // Capture the settings so after() can put them back exactly.
    cy.then(() =>
      call('GET', '/inventory-audits/settings').then((res) => {
        if (res.status === 200) originalSettings = res.body?.data ?? null;
      })
    );

    // Probe for an auditable scope — a BIN, and one no live audit already holds.
    //
    // Two corrections, both of which were costing whole tests:
    //
    //  1. `GET /locations` is ROOT-ONLY. It answers with facilities and never with
    //     bins (verified on QA 2026-08-20: 3 rows for a tenant holding 7 bins), so
    //     the old walk could only ever pick a Facility. A facility previews as
    //     auditable — it has bins somewhere underneath — which is why this looked
    //     like it worked.
    //  2. Picking a facility means picking EVERY bin under it, including any bin a
    //     live audit already holds. QA carries long-lived manual audits (`Test Audit
    //     05`/`06` on BN-5 and BN-6), so `POST /inventory-audits` for a Location
    //     audit over that facility answers 409 AUDIT_SCOPE_OVERLAP — the feature
    //     working exactly as designed, failing TC27 and TC44 for a reason that has
    //     nothing to do with what they test.
    //
    // So: take bins from the summary (the only read that returns them), drop the
    // ones under a live audit, and preview those.
    cy.then(() =>
      liveAuditScopeFilter(adminJwt).then(({ isFree }) =>
        listAllBins(adminJwt).then((bins) => {
          const candidates = bins
            .filter(isFree)
            .sort((a, b) => Number(b.cur_items || 0) - Number(a.cur_items || 0))
            .slice(0, 12);
          if (!candidates.length) return null;

          const tryNext = (index) => {
            if (index >= candidates.length) return null;
            const locationId = candidates[index].id;
            return call('GET', '/inventory-audits/preview', undefined, {
              qs: { scopeLocationId: locationId },
            }).then((p) => {
              const data = p.body?.data;
              if (p.status === 200 && data) {
                if (!anyScope && Number(data.scopeBinCount) > 0) anyScope = { id: locationId };
                if (!nonSerialScope && Number(data.nonSerialUnits) > 0) {
                  nonSerialScope = { id: locationId };
                }
                if (!abcScope && Number(data.binCount) > 0) {
                  // Which class actually sits there — ask per class, cheapest last.
                  return ['A', 'B', 'C'].reduce(
                    (chain, cls) =>
                      chain.then((found) => {
                        if (found) return found;
                        return call('GET', '/inventory-audits/preview', undefined, {
                          qs: { abcClass: cls, scopeLocationId: locationId },
                        }).then((c) =>
                          c.status === 200 && Number(c.body?.data?.binCount) > 0
                            ? (abcScope = { id: locationId, abcClass: cls })
                            : null
                        );
                      }),
                    cy.wrap(null, { log: false })
                  ).then(() =>
                    anyScope && abcScope && nonSerialScope ? null : tryNext(index + 1)
                  );
                }
              }
              return anyScope && abcScope && nonSerialScope ? null : tryNext(index + 1);
            });
          };
          return tryNext(0);
        })
      )
    );

    // A soft-deleted location for the deleted-scope columns (TC22, TC39).
    cy.then(() =>
      call('GET', '/locations/deleted').then((res) => {
        const body = res.body?.data ?? res.body;
        const rows = Array.isArray(body) ? body : body?.items ?? [];
        if (rows.length) deletedLocationId = rows[0].id;
      })
    );
    // ...and BUILT when the tenant's recycle bin is empty. Waiting for someone to
    // have deleted a location is not a strategy — creating one and deleting it is
    // two calls, and the state under test IS "deleted", so nothing is left behind.
    cy.then(() => {
      if (deletedLocationId) return null;
      return ensureDeletedLocation(adminJwt).then((made) => {
        if (made) deletedLocationId = made.id;
      });
    });

    // A token the admin gate genuinely REFUSES, for the 403 columns.
    //
    // Optional twice over: a tenant may declare no non-admin account at all, AND
    // an account NAMED `user` may still resolve to ADMIN — `mapRolesToId`
    // prioritises an `admin` role held on ANY client, so this tenant's `user`
    // account (stockwise-app: User, account-wise: Admin) is admitted to these very
    // routes. That made TC03/TC04 skip against a guard that was working.
    //
    // `resolveNonAdminActor` decides with the backend's own rule and falls back to
    // the `sales` account, which carries stockwise-app: Sales and nothing else.
    cy.then(() =>
      resolveNonAdminActor().then((actor) => {
        workerJwt = actor ? actor.token : null;
        nonAdminRole = actor ? actor.role : null;
      })
    );
  });

  /**
   * Cancel whatever THIS test created, before the next one runs.
   *
   * Not tidiness — correctness. "One bin, one live audit of the same expected set"
   * is a real product rule, so a second create over the same scope with the same
   * type and class is refused with 409 AUDIT_SCOPE_OVERLAP. The spec probes ONE
   * scope, so leaving audits live made every later create fail against the feature
   * working exactly as designed. Draining here gives each test a free scope.
   *
   * Tests that legitimately need two concurrent audits (TC34's duplicate name,
   * TC42/TC43/TC44's overlap matrix) create both inside their own body, so they are
   * unaffected by this.
   */
  afterEach(() => {
    // Take a SNAPSHOT and release through `forceReleaseAudit`, not a bare cancel.
    //
    // A bare cancel is REFUSED once an audit has applied an adjustment — that is
    // the very rule TC52 asserts — so the audit it drives could never be released
    // here and sat in PendingReview holding its bin against "one live audit per
    // scope". One such leak took the richest bin out of circulation on QA and made
    // 23 tests in 04-AuditLifecycleE2E skip for want of an auditable scope, which
    // looked like a thin environment and was in fact this hook.
    //
    // `forceReleaseAudit` finishes the review instead of abandoning it (reject the
    // still-open lines — a rejection moves no stock — and the audit finalises
    // itself), so every audit created here is genuinely released whatever state it
    // reached.
    createdAuditIds.splice(0, createdAuditIds.length).forEach((id) => {
      if (id) forceReleaseAudit(adminJwt, countActor?.token, id);
    });
  });

  after(() => {
    // Warehouse structure this spec built, if any. Runs first: a location is only
    // removable once nothing live is scoped to it.
    warehouseCleanup.splice(0, warehouseCleanup.length).forEach((fn) => fn());
    // Safety net: anything a crashed test left behind.
    createdAuditIds.forEach((id) => {
      if (!id) return;
      call('POST', `/inventory-audits/${id}/cancel`, {});
    });

    // Restore the tenant-global settings. The key must be SENT to put back a
    // null: omitting it preserves whatever the last test left (ABSENT ≠ null).
    if (originalSettings) {
      call('PUT', '/inventory-audits/settings', {
        enableWorkerLocationCorrection: originalSettings.enableWorkerLocationCorrection,
        staleBinFreezeMinutes: originalSettings.staleBinFreezeMinutes ?? null,
      });
    }
  });

  // ===========================================================================
  // Auth & RBAC
  // ===========================================================================

  // EP — the authorised partition
  it('SW-IAUD-API-TC01: lists audits for an admin bearer with the standard envelope', { tags: ['@smoke'] }, () => {
    call('GET', '/inventory-audits').then((res) => {
      expect(res.status, 'lists audits for an admin bearer with the standard envelope').to.eq(200);
      expect(res.body.success, 'envelope reports success').to.eq(true);
      expect(res.body.data, 'data is the audit array').to.be.an('array');
    });
  });

  // EP — the unauthenticated partition (the guard-regression check)
  it('SW-IAUD-API-TC02: rejects a list request that carries no Authorization header', () => {
    call('GET', '/inventory-audits', undefined, { noAuth: true }).then((res) => {
      expect(res.status, 'no token must be 401, not 200').to.eq(401);
      expect(res.body?.error?.code, 'the envelope names the reason, not just the status').to.eq(
        'UNAUTHORIZED'
      );
    });
  });

  // Decision table — authenticated but not an admin, read
  it('SW-IAUD-API-TC03: refuses a list request from a non-admin role', function () {
    if (!workerJwt) this.skip(); // no account resolves to a non-admin token — see before()
    call('GET', '/inventory-audits', undefined, { token: workerJwt }).then((res) => {
      expect(res.status, 'the inline admin gate must 403, not 401 or 200').to.eq(403);
      expect(res.body?.error?.code, 'refused for being non-admin, not for being unauthenticated').to.eq(
        'FORBIDDEN'
      );
      expect(
        res.body?.error?.message,
        'every 403 body is normalised to EXCEPTION_MESSAGES.FORBIDDEN'
      ).to.eq('Access denied');
    });
  });

  // Decision table — authenticated but not an admin, write (and nothing created)
  it('SW-IAUD-API-TC04: refuses a create from a non-admin role and creates nothing', function () {
    if (!workerJwt) this.skip(); // see TC03
    const name = auditName('rbac');
    call(
      'POST',
      '/inventory-audits',
      {
        name,
        auditType: 'Location',
        scopeLocationId: anyScope?.id ?? abcScope?.id ?? 1,
        workers: [{ userId: 'cy-w-1' }],
      },
      { token: workerJwt }
    ).then((res) => {
      expect(res.status, 'refuses a create from a non-admin role and creates nothing').to.eq(403);
      // Prove the refusal was not merely cosmetic.
      call('GET', '/inventory-audits').then((list) => {
        const names = (list.body?.data ?? []).map((a) => a.name);
        expect(names, 'a refused create must not have persisted').to.not.include(name);
      });
    });
  });

  // ===========================================================================
  // GET /inventory-audits — list
  // ===========================================================================

  // EP — the documented row contract
  it('SW-IAUD-API-TC05: every list row carries the documented fields and types', function () {
    call('GET', '/inventory-audits').then((res) => {
      const rows = res.body?.data ?? [];
      if (!rows.length) this.skip(); // nothing on this tenant yet
      const r = rows[0];
      expect(r).to.include.all.keys(
        'id',
        'name',
        'auditType',
        'abcClass',
        'assignOnScan',
        'status',
        'scopeLocationId',
        'scopeLocationLabel',
        'scopeLocationCode',
        'workerCount',
        'assignedWorkers',
        'binCount',
        'variance',
        'createdByName',
        'createdAt',
        'binsGeneratedAt'
      );
      expect(r.assignedWorkers, 'assignedWorkers is an array (json_agg, never null)').to.be.an('array');
      expect(r.workerCount, 'workerCount is numeric').to.be.a('number');
      expect(r.binCount, 'binCount is numeric').to.be.a('number');
      expect(['Abc', 'Location'], 'auditType is one of the two enum values').to.include(r.auditType);
    });
  });

  // EP — status filter, valid partition
  it('SW-IAUD-API-TC06: ?status=Open returns only Open audits', () => {
    call('GET', '/inventory-audits', undefined, { qs: { status: 'Open' } }).then((res) => {
      expect(res.status, '?status=Open returns only Open audits').to.eq(200);
      (res.body?.data ?? []).forEach((a) => {
        expect(a.status, `audit ${a.id} must match the requested status`).to.eq('Open');
      });
    });
  });

  // EP — status filter, invalid partition
  it('SW-IAUD-API-TC07: rejects an unrecognised status value', () => {
    call('GET', '/inventory-audits', undefined, { qs: { status: 'NotAStatus' } }).then((res) => {
      expectJoiRejection(res, 'status');
    });
  });

  // EP — auditType filter, both partitions
  it('SW-IAUD-API-TC08: ?auditType filters to that type only', () => {
    call('GET', '/inventory-audits', undefined, { qs: { auditType: 'Location' } }).then((res) => {
      expect(res.status, '?auditType filters to that type only').to.eq(200);
      (res.body?.data ?? []).forEach((a) =>
      expect(a.auditType, 'the filter must EXCLUDE, not merely include').to.eq('Location')
    );
    });
    call('GET', '/inventory-audits', undefined, { qs: { auditType: 'Abc' } }).then((res) => {
      expect(res.status, '?auditType filters to that type only').to.eq(200);
      (res.body?.data ?? []).forEach((a) => expect(a.auditType).to.eq('Abc'));
    });
  });

  // Error guessing — the request surface is closed (allowUnknown: false)
  it('SW-IAUD-API-TC09: rejects an unknown query parameter instead of ignoring it', () => {
    call('GET', '/inventory-audits', undefined, { qs: { notAParameter: 1 } }).then((res) => {
      expect(res.status, 'an unknown query key must not be silently dropped').to.eq(400);
    });
  });

  // EP — the ordering contract (createdAt DESC)
  it('SW-IAUD-API-TC10: returns the list newest-first', function () {
    call('GET', '/inventory-audits').then((res) => {
      const rows = res.body?.data ?? [];
      if (rows.length < 2) this.skip();
      for (let i = 1; i < rows.length; i += 1) {
        const prev = new Date(rows[i - 1].createdAt).getTime();
        const curr = new Date(rows[i].createdAt).getTime();
        expect(curr, `row ${i} must not be newer than row ${i - 1}`).to.be.at.most(prev);
      }
    });
  });

  // BVA — the zero-counted-lines boundary
  it('SW-IAUD-API-TC11: a freshly created audit reports a null variance', function () {
    if (!abcScope && !anyScope) this.skip();
    createAudit({ name: auditName('variance') }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const id = res.body?.data?.id;
      call('GET', `/inventory-audits/${id}`).then((one) => {
        expect(
          one.body?.data?.variance,
          'variance stays null until a line is counted ("empty until counting produces results")'
        ).to.eq(null);
      });
    });
  });

  // ===========================================================================
  // GET /inventory-audits/:id — detail
  // ===========================================================================

  // EP — the detail contract
  it('SW-IAUD-API-TC12: returns the list row plus the roster and the bin roll-up', function () {
    if (!abcScope && !anyScope) this.skip();
    createAudit({ name: auditName('detail') }).then((res) => {
      const id = res.body?.data?.id;
      expect(id, 'created audit id').to.be.a('number');
      call('GET', `/inventory-audits/${id}`).then((one) => {
        expect(one.status).to.eq(200);
        const d = one.body?.data;
        expect(d).to.include.all.keys('id', 'name', 'status', 'workers', 'binStatusCounts');
        expect(d.workers, 'the roster comes back as an array').to.be.an('array');
        expect(d.workers.length, 'the worker we assigned is on the roster').to.be.at.least(1);
        expect(d.binStatusCounts, 'bin roll-up is an object, keyed by bin status').to.be.an('object');
      });
    });
  });

  // EP — invalid input partition (unknown id)
  it('SW-IAUD-API-TC13: reports not found for an audit id that does not exist', () => {
    call('GET', `/inventory-audits/${MISSING_ID}`).then((res) => {
      expect(res.status, 'reports not found for an audit id that does not exist').to.eq(404);
      expect(String(res.body?.error?.message ?? '')).to.match(/not found/i);
    });
  });

  // BVA — just below the minimum valid id
  it('SW-IAUD-API-TC14: rejects an audit id of 0', () => {
    call('GET', '/inventory-audits/0').then((res) => {
      expect(res.status, 'id 0 is invalid, not missing').to.eq(400);
      expect(String(res.body?.error?.message ?? '')).to.match(/invalid audit id/i);
    });
  });

  // Error guessing — the literal-vs-param route-order trap
  it('SW-IAUD-API-TC15: rejects a non-numeric audit id rather than misrouting it', () => {
    call('GET', '/inventory-audits/not-a-number').then((res) => {
      expect(res.status, 'must be a 400 from parseId, not a 404 and not a 500').to.eq(400);
      expect(res.status).to.be.lessThan(500);
    });
  });

  // ===========================================================================
  // GET /inventory-audits/workers
  // ===========================================================================

  // EP — the roster source
  it('SW-IAUD-API-TC16: returns assignable workers with id, name and email', function () {
    call('GET', '/inventory-audits/workers').then((res) => {
      expect(res.status, 'returns assignable workers with id, name and email').to.eq(200);
      expect(res.body?.data).to.be.an('array');
      if (!res.body.data.length) this.skip(); // no `user`-role accounts on this tenant
      res.body.data.forEach((w) => {
        expect(w).to.include.all.keys('userId', 'name', 'email');
        expect(w.userId, 'userId is a non-empty string').to.be.a('string').and.not.be.empty;
      });
    });
  });

  // ===========================================================================
  // GET /inventory-audits/preview
  // ===========================================================================

  // EP — happy path + the arithmetic invariant
  it('SW-IAUD-API-TC17: previews a class and scope, and the unit totals add up', { tags: ['@smoke'] }, function () {
    if (!abcScope) this.skip();
    call('GET', '/inventory-audits/preview', undefined, {
      qs: { abcClass: abcScope.abcClass, scopeLocationId: abcScope.id },
    }).then((res) => {
      expect(res.status, 'previews a class and scope, and the unit totals add up').to.eq(200);
      const d = res.body?.data;
      expect(d).to.include.all.keys(
        'binCount',
        'lineCount',
        'serializedUnits',
        'nonSerialUnits',
        'totalExpectedUnits',
        'scopeBinCount',
        'scopeLabel',
        'scopePath'
      );
      expect(
        d.totalExpectedUnits,
        'totalExpectedUnits must be exactly serializedUnits + nonSerialUnits'
      ).to.eq(Number(d.serializedUnits) + Number(d.nonSerialUnits));
    });
  });

  // EP — the no-class-filter partition (Location semantics)
  it('SW-IAUD-API-TC18: previews with no class filter and reports scope bins at least as high as inventory bins', function () {
    if (!anyScope && !abcScope) this.skip();
    const scopeLocationId = (anyScope ?? abcScope).id;
    call('GET', '/inventory-audits/preview', undefined, { qs: { scopeLocationId } }).then((res) => {
      expect(res.status, 'the request must succeed').to.eq(200);
      const d = res.body?.data;
      expect(
        Number(d.scopeBinCount),
        'every bin holding inventory is also a bin under the scope'
      ).to.be.at.least(Number(d.binCount));
    });
  });

  // EP — required field missing
  it('SW-IAUD-API-TC19: rejects a preview with no scope location', () => {
    call('GET', '/inventory-audits/preview', undefined, { qs: { abcClass: 'A' } }).then((res) => {
      expectJoiRejection(res, 'scopeLocationId');
    });
  });

  // BVA — just below the minimum valid id, both invalid values
  it('SW-IAUD-API-TC20: rejects a scope location id of 0 and of -1', () => {
    [0, -1].forEach((scopeLocationId) => {
      call('GET', '/inventory-audits/preview', undefined, { qs: { scopeLocationId } }).then((res) => {
        expect(res.status, `scopeLocationId=${scopeLocationId} must be rejected`).to.eq(400);
      });
    });
  });

  // EP — unknown location
  it('SW-IAUD-API-TC21: reports not found when the scope location does not exist', () => {
    call('GET', '/inventory-audits/preview', undefined, { qs: { scopeLocationId: MISSING_ID } }).then((res) => {
      expect(res.status, 'reports not found when the scope location does not exist').to.eq(404);
    });
  });

  // EP — soft-deleted location partition
  it('SW-IAUD-API-TC22: rejects a soft-deleted scope location', function () {
    if (!deletedLocationId) this.skip(); // QA holds no soft-deleted location — see pending.md
    call('GET', '/inventory-audits/preview', undefined, { qs: { scopeLocationId: deletedLocationId } }).then(
      (res) => {
        expect(res.status, 'rejects a soft-deleted scope location').to.eq(400);
        expect(String(res.body?.error?.message ?? '')).to.match(/deleted/i);
      }
    );
  });

  // EP — invalid enum partition
  it('SW-IAUD-API-TC23: rejects an ABC class outside A, B and C', function () {
    if (!anyScope && !abcScope) this.skip();
    call('GET', '/inventory-audits/preview', undefined, {
      qs: { abcClass: 'D', scopeLocationId: (anyScope ?? abcScope).id },
    }).then((res) => {
      expectJoiRejection(res, 'abcClass');
    });
  });

  // Error guessing — the dot-separated WMS path regression (a `/` separator
  // silently resolved zero bins for every non-bin scope; a sibling whose code
  // shares a prefix must NOT be captured).
  it('SW-IAUD-API-TC24: a scope does not capture a sibling location sharing its path prefix', function () {
    // BUILT, not probed. This guard had never actually run: it waited for a tenant
    // to happen to hold two locations whose codes share a prefix without being
    // ancestor and descendant. Two creates produce exactly that shape — and building
    // it means the EXPECTED ANSWER IS KNOWN, which the probed version could never
    // say. The shorter scope owns no bins at all, so a `LIKE 'CYP1-123%'` match that
    // wrongly swallowed `CYP1-1232`'s subtree reports 1 where the answer is 0.
    ensurePrefixSiblingLocations(adminJwt).then((pair) => {
      if (!pair) this.skip(); // could not create locations on this tenant
      warehouseCleanup.push(() => pair.cleanup());
      if (!pair.longerBinId) this.skip(); // the bin that makes the two distinguishable

      call('GET', '/inventory-audits/preview', undefined, {
        qs: { scopeLocationId: pair.shorter.id },
      }).then((shorter) => {
        expect(shorter.status).to.eq(200);
        expect(
          Number(shorter.body.data.scopeBinCount),
          `scope ${pair.shorter.code} owns no bins — a prefix match without the dot separator ` +
            `would fold in the bin under sibling ${pair.longer.code} and report 1`
        ).to.eq(0);

        call('GET', '/inventory-audits/preview', undefined, {
          qs: { scopeLocationId: pair.longer.id },
        }).then((longer) => {
          expect(longer.status).to.eq(200);
          expect(
            Number(longer.body.data.scopeBinCount),
            'and the sibling that really does own the bin still reports it'
          ).to.eq(1);
        });
      });
    });
  });

  // ===========================================================================
  // POST /inventory-audits — create
  // ===========================================================================

  // Decision table, column 1 — Abc + class → accepted
  it('SW-IAUD-API-TC25: creates an ABC audit with a class', { tags: ['@smoke'] }, function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('abc'), auditType: 'Abc', abcClass: abcScope.abcClass }).then((res) => {
      expect(res.status, 'a valid create must be accepted').to.be.oneOf([200, 201]);
      const d = res.body?.data;
      expect(d.status, 'a new audit starts Open').to.eq('Open');
      expect(d.auditType).to.eq('Abc');
      expect(d.abcClass).to.eq(abcScope.abcClass);
      expect(d.generationQueued, 'count-task generation is enqueued off the request path').to.eq(true);
      expect(d.workerCount).to.eq(1);
      expect(d.scopeLocationId).to.eq(abcScope.id);
    });
  });

  // Decision table, column 2 — Abc without class → rejected
  it('SW-IAUD-API-TC26: rejects an ABC audit that supplies no class', function () {
    if (!abcScope && !anyScope) this.skip();
    createAudit({ name: auditName('noclass'), auditType: 'Abc', abcClass: undefined }).then((res) => {
      expectJoiRejection(res, 'abcClass');
    });
  });

  // Decision table, column 3 — Location without class → accepted, class null
  it('SW-IAUD-API-TC27: creates a Location audit with no class', function () {
    if (!anyScope && !abcScope) this.skip();
    createAudit({
      name: auditName('loc'),
      auditType: 'Location',
      abcClass: undefined,
      scopeLocationId: (anyScope ?? abcScope).id,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      expect(res.body?.data?.auditType).to.eq('Location');
      expect(res.body?.data?.abcClass, 'a Location audit never carries a class').to.eq(null);
    });
  });

  // Decision table, column 4 — Location WITH class → rejected (forbidden)
  it('SW-IAUD-API-TC28: rejects a Location audit that supplies a class', function () {
    if (!anyScope && !abcScope) this.skip();
    createAudit({
      name: auditName('locclass'),
      auditType: 'Location',
      abcClass: 'A',
      scopeLocationId: (anyScope ?? abcScope).id,
    }).then((res) => {
      expectJoiRejection(res, 'abcClass');
    });
  });

  // EP — the auditType default
  it('SW-IAUD-API-TC29: defaults a missing audit type to ABC, so a missing class is then rejected', function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('deftype'), auditType: undefined, abcClass: undefined }).then((res) => {
      expectJoiRejection(res, 'abcClass');
      // ...and the same body WITH a class is accepted as an Abc audit.
      createAudit({ name: auditName('deftype2'), auditType: undefined, abcClass: abcScope.abcClass }).then(
        (ok) => {
          expect(ok.status).to.be.oneOf([200, 201]);
          expect(ok.body?.data?.auditType, 'the default type is Abc').to.eq('Abc');
        }
      );
    });
  });

  // BVA — name length: minimum valid
  it('SW-IAUD-API-TC30: accepts a 1-character name', function () {
    if (!abcScope) this.skip();
    createAudit({ name: 'x' }).then((res) => {
      // A single character may collide with a live audit of the same name; a 409
      // still proves the LENGTH was accepted, which is what this boundary tests.
      expect(res.status, 'a 1-char name is within the valid partition').to.be.oneOf([200, 201, 409]);
      if (res.status === 409) {
        expect(res.body?.error?.details?.[0]?.field, 'the only legitimate refusal here is a name clash').to.eq(
          'name'
        );
      }
    });
  });

  // BVA — name length: maximum valid
  it('SW-IAUD-API-TC31: accepts a 150-character name', function () {
    if (!abcScope) this.skip();
    const name = `cy${'a'.repeat(148)}`;
    expect(name.length, 'fixture is exactly at the boundary').to.eq(150);
    createAudit({ name }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      expect(res.body?.data?.name).to.have.length(150);
    });
  });

  // BVA — name length: just above the maximum
  it('SW-IAUD-API-TC32: rejects a 151-character name', function () {
    if (!abcScope) this.skip();
    const name = `cy${'a'.repeat(149)}`;
    expect(name.length).to.eq(151);
    createAudit({ name }).then((res) => expectJoiRejection(res, 'name'));
  });

  // EP — blank-name partition (trim then min(1))
  it('SW-IAUD-API-TC33: rejects an empty name and a whitespace-only name', function () {
    if (!abcScope) this.skip();
    createAudit({ name: '' }).then((res) => expectJoiRejection(res, 'name'));
    createAudit({ name: '   ' }).then((res) => expectJoiRejection(res, 'name'));
  });

  // State transition — the active-name unique window
  it('SW-IAUD-API-TC34: refuses to reuse the name of a live audit', function () {
    if (!abcScope) this.skip();
    const name = auditName('dup');
    createAudit({ name }).then((first) => {
      expect(first.status).to.be.oneOf([200, 201]);
      createAudit({ name }).then((second) => {
        expect(second.status, 'a duplicate active name is a conflict').to.eq(409);
        // The Conflict filter parses the stringified payload into details[0].
        expect(second.body?.error?.details?.[0]?.field).to.eq('name');
        expect(String(second.body?.error?.details?.[0]?.message ?? '')).to.match(/already exists/i);
      });
    });
  });

  // State transition — uniqueness covers ACTIVE audits only
  it('SW-IAUD-API-TC35: releases the name once the audit is cancelled', function () {
    if (!abcScope) this.skip();
    const name = auditName('reuse');
    createAudit({ name }).then((first) => {
      expect(first.status).to.be.oneOf([200, 201]);
      call('POST', `/inventory-audits/${first.body.data.id}/cancel`, {}).then((cancelled) => {
        expectCancelled(cancelled, 'the cancel must succeed for the reuse to mean anything');
        createAudit({ name }).then((second) => {
          expect(
            second.status,
            'the name leaves the active-name window on cancel, so it is reusable'
          ).to.be.oneOf([200, 201]);
        });
      });
    });
  });

  // BVA — worker list: below minimum, and the minimum
  it('SW-IAUD-API-TC36: rejects an empty worker list and accepts exactly one worker', function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('now'), workers: [] }).then((res) => expectJoiRejection(res, 'workers'));
    createAudit({ name: auditName('onew'), workers: [{ userId: 'cy-w-solo' }] }).then((res) => {
      expect(res.status, 'one worker is the minimum valid partition').to.be.oneOf([200, 201]);
      expect(res.body?.data?.workerCount).to.eq(1);
    });
  });

  // BVA — worker list: the cap and just above it
  it('SW-IAUD-API-TC37: accepts 100 workers and rejects 101', function () {
    if (!abcScope) this.skip();
    const roster = (n) => Array.from({ length: n }, (_, i) => ({ userId: `cy-w-${i + 1}` }));
    createAudit({ name: auditName('w100'), workers: roster(100) }).then((res) => {
      expect(res.status, '100 workers is the documented cap').to.be.oneOf([200, 201]);
      expect(res.body?.data?.workerCount).to.eq(100);
    });
    createAudit({ name: auditName('w101'), workers: roster(101) }).then((res) =>
      expectJoiRejection(res, 'workers')
    );
  });

  // EP — duplicate roster entry
  it('SW-IAUD-API-TC38: rejects the same worker listed twice', function () {
    if (!abcScope) this.skip();
    createAudit({
      name: auditName('dupw'),
      workers: [{ userId: 'cy-w-same' }, { userId: 'cy-w-same' }],
    }).then((res) => expectJoiRejection(res, 'workers'));
  });

  // EP — unusable scope prevents the create
  it('SW-IAUD-API-TC39: refuses a create against an unknown or deleted scope, and persists nothing', function () {
    if (!abcScope && !anyScope) this.skip();
    const missingName = auditName('badscope');
    createAudit({ name: missingName, scopeLocationId: MISSING_ID }).then((res) => {
      expect(res.status, 'an unknown location is a 404').to.eq(404);
      call('GET', '/inventory-audits').then((list) => {
        expect((list.body?.data ?? []).map((a) => a.name)).to.not.include(missingName);
      });
    });
    if (deletedLocationId) {
      createAudit({ name: auditName('delscope'), scopeLocationId: deletedLocationId }).then((res) => {
        expect(res.status, 'a soft-deleted location is a 400').to.eq(400);
      });
    }
  });

  // EP — the assignment strategy enum
  it('SW-IAUD-API-TC40: accepts the Manual strategy and rejects an unrecognised one', function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('manual'), assignmentStrategy: 'Manual' }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    createAudit({ name: auditName('badstrat'), assignmentStrategy: 'Whatever' }).then((res) =>
      expectJoiRejection(res, 'assignmentStrategy')
    );
  });

  // Error guessing — the create surface is closed
  it('SW-IAUD-API-TC41: rejects an unknown field in the create body', function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('unknown'), notAField: true }).then((res) => {
      expect(res.status, 'allowUnknown:false must reject, not ignore').to.eq(400);
    });
  });

  // Decision table — scope overlap: same type + same class → refused
  it('SW-IAUD-API-TC42: refuses a second live audit counting the same expected set', function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('ovl1'), auditType: 'Abc', abcClass: abcScope.abcClass }).then((first) => {
      expect(first.status).to.be.oneOf([200, 201]);
      createAudit({ name: auditName('ovl2'), auditType: 'Abc', abcClass: abcScope.abcClass }).then((second) => {
        expect(second.status, 'one bin, one live audit of the same expected set').to.eq(409);
        const detail = second.body?.error?.details?.[0] ?? {};
        expect(detail.code, 'the client branches on this code').to.eq('AUDIT_SCOPE_OVERLAP');
        expect(detail.auditId, 'the refusal names the blocking audit').to.eq(first.body.data.id);
        expect(detail.auditStatus, 'and its status').to.be.a('string');
      });
    });
  });

  // Decision table — scope overlap: different class → allowed (disjoint sets)
  it('SW-IAUD-API-TC43: allows a second live audit over the same scope for a different class', function () {
    if (!abcScope) this.skip();
    const other = ['A', 'B', 'C'].find((c) => c !== abcScope.abcClass);
    createAudit({ name: auditName('cls1'), auditType: 'Abc', abcClass: abcScope.abcClass }).then((first) => {
      expect(first.status).to.be.oneOf([200, 201]);
      createAudit({ name: auditName('cls2'), auditType: 'Abc', abcClass: other }).then((second) => {
        expect(
          second.status,
          `class ${other} counts a disjoint expected set from class ${abcScope.abcClass}, so it is allowed`
        ).to.be.oneOf([200, 201]);
      });
    });
  });

  // Decision table — scope overlap: Location beside Abc → allowed
  it('SW-IAUD-API-TC44: allows a Location audit alongside an ABC audit on the same scope', function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('mix1'), auditType: 'Abc', abcClass: abcScope.abcClass }).then((first) => {
      expect(first.status).to.be.oneOf([200, 201]);
      createAudit({
        name: auditName('mix2'),
        auditType: 'Location',
        abcClass: undefined,
        scopeLocationId: abcScope.id,
      }).then((second) => {
        expect(second.status, 'a Location walk and an ABC count are a normal concurrent pattern').to.be.oneOf([
          200,
          201,
        ]);
      });
    });
  });

  // Use case — the mandatory audit trail (project hard requirement)
  it('SW-IAUD-API-TC45: writes an audit-trail CREATE entry for the new audit', function () {
    if (!abcScope) this.skip();
    createAudit({ name: auditName('trail') }).then((res) => {
      const id = res.body?.data?.id;
      expect(id).to.be.a('number');
      // `createAuditTrail` is fire-and-forget by design (it must never fail the
      // operation it records), so reading the trail immediately races the insert.
      // Poll a few times rather than asserting on the first read.
      const readTrail = (attempt) =>
        call('GET', '/audit-trails', undefined, {
          qs: { entityType: 'InventoryAudit', entityID: String(id), page: 1, page_size: 25 },
        }).then((trail) => {
          expect(trail.status, 'the trail must be queryable').to.be.lessThan(500);
          const body = trail.body?.data ?? trail.body;
          const rows = body?.items ?? body?.list ?? (Array.isArray(body) ? body : []);
          if (rows.length || attempt >= 5) return rows;
          return cy.wait(1000, { log: false }).then(() => readTrail(attempt + 1));
        });

      readTrail(0).then((rows) => {
        expect(rows, 'a state-changing endpoint must leave a trail row').to.be.an('array').and.not.be
          .empty;
        const created = rows.find((r) => String(r.actionType).toUpperCase().includes('CREATE'));
        expect(created, 'a CREATE entry exists for this audit').to.exist;
        expect(created.userName, 'the entry names the acting user').to.be.a('string').and.not.be.empty;
      });
    });
  });

  // ===========================================================================
  // POST /inventory-audits/:id/cancel
  // ===========================================================================

  // State transition — Open → Cancelled
  it('SW-IAUD-API-TC46: cancels an Open audit and reports what it closed and kept', { tags: ['@smoke'] }, function () {
    if (!abcScope && !anyScope) this.skip();
    createAudit({ name: auditName('cancel') }).then((res) => {
      const id = res.body?.data?.id;
      call('POST', `/inventory-audits/${id}/cancel`, {}).then((c) => {
        expectCancelled(c);
        const d = c.body?.data;
        expect(d.status).to.eq('Cancelled');
        expect(d).to.include.all.keys('cancelledBins', 'preservedScanCount', 'interruptedBins');
        expect(d.preservedScanCount, 'cancelling never deletes a recorded count').to.be.a('number');
      });
    });
  });

  // State transition — invalid transition out of a terminal state
  it('SW-IAUD-API-TC47: refuses to cancel an already-cancelled audit', function () {
    if (!abcScope && !anyScope) this.skip();
    createAudit({ name: auditName('twice') }).then((res) => {
      const id = res.body?.data?.id;
      call('POST', `/inventory-audits/${id}/cancel`, {}).then((first) => {
        expectCancelled(first);
        call('POST', `/inventory-audits/${id}/cancel`, {}).then((second) => {
          expect(second.status, 'cancel is deliberately not idempotent').to.eq(400);
          expect(String(second.body?.error?.message ?? '')).to.match(/cannot cancel a cancelled audit/i);
        });
      });
    });
  });

  // State transition — Completed is terminal
  /**
   * Drive a fresh Location audit through the count flow to a chosen state.
   *
   * `stopAt`:
   *   'scanned'   — InProgress, with one serial recorded (something a cancel must keep)
   *   'completed' — every bin counted clean, submitted and closed
   *   'applied'   — one line counted SHORT, submitted, and the discrepancy approved
   *
   * Yields `{ id, scannedSerial }` or `null` when the environment cannot get there.
   * Nothing here asserts: this is a precondition builder, so a failure to reach the
   * state must read as a skip in the caller, never as a product failure.
   *
   * Why it exists: TC48/TC51/TC52 each need an audit in a state only the COUNT flow
   * produces, and they used to hunt the tenant for one and skip when they found
   * none — which on a quiet environment is always. Driving it is deterministic.
   */
  const driveAudit = (tag, stopAt) => {
    if (!countActor?.usable || !(anyScope || abcScope)) return cy.wrap(null, { log: false });
    const asWorker = { token: countActor.token };

    // 'applied' must be an **Abc** audit, and the other two need only a scope.
    //
    // Per-line approve is refused outright on a Location audit — "Location audits
    // do not support per-line review yet — use Close or Recount"
    // (discrepancy-review.service.ts). Driving 'applied' as a Location audit
    // therefore reached a real discrepancy and then died on the approve with a 400,
    // yielded null, and TC52 skipped for a reason that had nothing to do with the
    // environment. Verified on QA 2026-08-20.
    //
    // It also needs a non-serial line inside that class, because counting short is
    // what makes an adjustment to apply. `abcScope` already carries the class that
    // actually holds stock in its scope, so the two requirements are the same scope.
    const applied = stopAt === 'applied';
    const scope = applied ? abcScope ?? anyScope : anyScope ?? abcScope;
    if (applied && !abcScope) return cy.wrap(null, { log: false });

    return createAudit({
      name: auditName(tag),
      auditType: applied ? 'Abc' : 'Location',
      abcClass: applied ? abcScope.abcClass : undefined,
      scopeLocationId: scope.id,
      assignmentStrategy: 'Manual',
      workers: [{ userId: countActor.userId, userName: countActor.userName }],
    }).then((res) => {
      if (![200, 201].includes(res.status)) return null;
      const id = res.body?.data?.id;

      const tasks = () => call('GET', `/inventory-audits/${id}/tasks`, undefined, asWorker);
      const start = (binId) =>
        call('POST', `/inventory-audits/bins/${binId}/start`, {}, asWorker);
      const quantity = (binId, body) =>
        call('POST', `/inventory-audits/bins/${binId}/quantity`, body, asWorker);
      const submit = (binId) =>
        call('POST', `/inventory-audits/bins/${binId}/submit`, { confirmUncounted: true }, asWorker);

      // The SHARED poll (support/InventoryAudit/auditLifecycle.js), not a local copy:
      // the rule it encodes — gate on `binsGeneratedAt`, never on "bins are
      // non-empty", because a zero-bin scope finishes generation legitimately —
      // must not be able to drift between this spec and the UI suite.
      return waitForGeneration(adminJwt, id)
        .then(() => call('GET', `/inventory-audits/${id}/bins`))
        .then((b) => {
          const bins = b.body?.data ?? [];
          if (!bins.length) return null;
          return call('POST', `/inventory-audits/${id}/assignments`, {
            assignments: bins.map((x) => ({ binId: x.id, userId: countActor.userId })),
          }).then(() => {
            const first = bins[0];

            if (stopAt === 'scanned') {
              // Record a real SERIAL: `preservedScanCount` counts scans, so a
              // quantity entry alone would leave nothing for TC51 to observe.
              //
              // The serial comes from what the BIN actually holds, read through the
              // WMS. `line.expectedSerials` is not part of the worker tasks DTO on
              // this build, and depending on it made this yield null every time.
              return start(first.id)
                .then(() =>
                  call('GET', `/location-assignments/${first.locationId}/items`)
                )
                .then((itemsRes) => {
                  const body = itemsRes.body?.data ?? itemsRes.body;
                  const rows = Array.isArray(body) ? body : body?.items ?? [];
                  const serial = rows
                    .map((i) => i.serial_number || i.serialNumber)
                    .filter(Boolean)[0];
                  if (!serial) return null;
                  return call(
                    'POST',
                    `/inventory-audits/bins/${first.id}/scan`,
                    { serialNumber: serial },
                    asWorker
                  ).then((sc) => ([200, 201].includes(sc.status) ? { id, scannedSerial: serial } : null));
                });
            }

            if (stopAt === 'applied') {
              // One line counted SHORT, then approved — the only route to an audit
              // that has actually moved stock, which is what the cancel guard checks.
              return start(first.id)
                .then(() => tasks())
                .then((t) => {
                  const wBin = (t.body?.data?.bins ?? []).find((x) => x.id === first.id);
                  const line = (wBin?.lines ?? []).find(
                    (l) => !l.isSerialized && l.expectedQuantity > 0
                  );
                  if (!line) return null;
                  return quantity(first.id, {
                    lineId: line.id,
                    countedQuantity: line.expectedQuantity - 1,
                  })
                    .then(() => submit(first.id))
                    .then(() => call('GET', `/inventory-audits/${id}/discrepancies`))
                    .then((d) => {
                      const dLine = (d.body?.data?.lines ?? [])[0];
                      if (!dLine) return null;
                      return call('POST', `/inventory-audits/${id}/lines/${dLine.lineId}/approve`, {
                        reason: 'Miscount',
                      }).then((a) =>
                        [200, 201].includes(a.status)
                          ? { id, adjustedLine: line, locationId: first.locationId }
                          : null
                      );
                    });
                });
            }

            // 'completed' — count every bin exactly, submit all, then close.
            const countClean = (bin) =>
              start(bin.id)
                .then(() => tasks())
                .then((t) => {
                  const wBin = (t.body?.data?.bins ?? []).find((x) => x.id === bin.id);
                  return (wBin?.lines ?? [])
                    .filter((l) => !l.isSerialized)
                    .reduce(
                      (acc, l) =>
                        acc.then(() =>
                          quantity(bin.id, { lineId: l.id, countedQuantity: l.expectedQuantity })
                        ),
                      cy.wrap(null, { log: false })
                    );
                })
                .then(() => submit(bin.id));

            return bins
              .reduce((acc, bin) => acc.then(() => countClean(bin)), cy.wrap(null, { log: false }))
              .then(() => call('POST', `/inventory-audits/${id}/close`, {}))
              .then((c) => (c.body?.data?.status === 'Completed' ? { id } : null));
          });
        });
    });
  };

  // State transition — invalid transition out of the Completed terminal state
  it('SW-IAUD-API-TC48: refuses to cancel a Completed audit', function () {
    const assertRefused = (auditId) =>
      call('POST', `/inventory-audits/${auditId}/cancel`, {}).then((c) => {
        expect(c.status).to.eq(400);
        expect(String(c.body?.error?.message ?? '')).to.match(/cannot cancel a completed audit/i);
        call('GET', `/inventory-audits/${auditId}`).then((after) => {
          expect(after.body?.data?.status, 'the refusal must not have mutated it').to.eq('Completed');
        });
      });

    // Drive one to Completed rather than hunting for one; fall back to an existing
    // Completed audit if the count flow could not run here.
    driveAudit('completed', 'completed').then((built) => {
      if (built) return assertRefused(built.id);
      return call('GET', '/inventory-audits', undefined, { qs: { status: 'Completed' } }).then(
        (res) => {
          const done = (res.body?.data ?? [])[0];
          if (!done) this.skip(); // could not reach Completed on this environment
          return assertRefused(done.id);
        }
      );
    });
  });

  // EP — unknown-id contract on a destructive route
  it('SW-IAUD-API-TC49: reports not found when cancelling an audit that does not exist', () => {
    call('POST', `/inventory-audits/${MISSING_ID}/cancel`, {}).then((res) => {
      expect(res.status, 'reports not found when cancelling an audit that does not exist').to.eq(404);
    });
  });

  // Use case — cancel is non-destructive to inventory
  it('SW-IAUD-API-TC50: a cancel changes no inventory in the audited scope', function () {
    if (!abcScope) this.skip();
    const previewQs = { abcClass: abcScope.abcClass, scopeLocationId: abcScope.id };
    call('GET', '/inventory-audits/preview', undefined, { qs: previewQs }).then((before) => {
      const expectedBefore = Number(before.body?.data?.totalExpectedUnits);
      createAudit({ name: auditName('noinv') }).then((res) => {
        call('POST', `/inventory-audits/${res.body.data.id}/cancel`, {}).then(() => {
          call('GET', '/inventory-audits/preview', undefined, { qs: previewQs }).then((after) => {
            expect(
              Number(after.body?.data?.totalExpectedUnits),
              'create + cancel must leave the on-hand units untouched'
            ).to.eq(expectedBefore);
          });
        });
      });
    });
  });

  // Use case — cancel preserves recorded scans
  it('SW-IAUD-API-TC51: a cancel preserves the scans already recorded', function () {
    // Drive an audit to "counting has started and a serial is recorded", then
    // cancel it — the scan has to survive, because it is the record of what was
    // physically on the shelf when the count was abandoned.
    driveAudit('preserve', 'scanned').then((built) => {
      if (!built) this.skip(); // no serialized stock to scan on this environment
      call('POST', `/inventory-audits/${built.id}/cancel`, {}).then((c) => {
        expectCancelled(c);
        expect(
          Number(c.body?.data?.preservedScanCount),
          'a cancelled count keeps its scans — they are the record of what was on the shelf'
        ).to.be.greaterThan(0);
      });
    });
  });

  // Decision table — an applied adjustment forbids cancellation
  it('SW-IAUD-API-TC52: refuses to cancel an audit that has already applied an adjustment', function () {
    // Drive an audit all the way to an APPLIED adjustment: counted short, submitted,
    // approved. Once stock has actually moved, cancelling would file a count that
    // changed inventory as though it had been abandoned — hence the guard.
    driveAudit('applied', 'applied').then((built) => {
      if (!built) this.skip(); // no countable non-serial line on this environment
      call('POST', `/inventory-audits/${built.id}/cancel`, {}).then((c) => {
        expect(c.status, 'an audit that moved stock cannot be abandoned').to.eq(400);
        expect(String(c.body?.error?.message ?? '')).to.match(/applied an inventory adjustment/i);
        expect(String(c.body?.error?.message ?? '')).to.match(/resolve the remaining discrepancies/i);
      });
      // Put back the unit the approval removed — into the bin it was taken FROM.
      // `built.locationId` is the audited bin itself; the old code guessed at
      // `nonSerialScope ?? …`, which is a different location whenever the applied
      // audit ran over the ABC scope, so the restore silently re-assigned the unit
      // somewhere else.
      if (built.adjustedLine && built.locationId) {
        call('POST', `/location-assignments/${built.locationId}/quantities`, {
          productId: built.adjustedLine.productId,
          delta: 1,
        });
      }
    });
  });

  // ===========================================================================
  // Settings
  // ===========================================================================

  // EP — the settings contract and its defaults
  it('SW-IAUD-API-TC53: reads the audit settings with both documented fields', () => {
    call('GET', '/inventory-audits/settings').then((res) => {
      expect(res.status, 'reads the audit settings with both documented fields').to.eq(200);
      const d = res.body?.data;
      expect(d.enableWorkerLocationCorrection, 'defaults to true when unset').to.be.a('boolean');
      if (d.staleBinFreezeMinutes !== null) {
        expect(d.staleBinFreezeMinutes, 'a stored window is numeric').to.be.a('number');
      }
    });
  });

  // State transition — the settings round trip, restored in-test
  it('SW-IAUD-API-TC54: updates the worker-correction toggle and reads it back', { tags: ['@smoke'] }, function () {
    if (!originalSettings) this.skip();
    const flipped = !originalSettings.enableWorkerLocationCorrection;
    call('PUT', '/inventory-audits/settings', { enableWorkerLocationCorrection: flipped }).then((res) => {
      expect(res.status, 'updates the worker-correction toggle and reads it back').to.eq(200);
      call('GET', '/inventory-audits/settings').then((read) => {
        expect(read.body?.data?.enableWorkerLocationCorrection, 'the new value persisted').to.eq(flipped);
        // Restore inside the test as well as in after() — this toggle is
        // tenant-global and gates a worker feature for everyone.
        call('PUT', '/inventory-audits/settings', {
          enableWorkerLocationCorrection: originalSettings.enableWorkerLocationCorrection,
        }).then(() => {
          call('GET', '/inventory-audits/settings').then((back) => {
            expect(back.body?.data?.enableWorkerLocationCorrection).to.eq(
              originalSettings.enableWorkerLocationCorrection
            );
          });
        });
      });
    });
  });

  // EP — the required field
  it('SW-IAUD-API-TC55: rejects a settings update with no correction flag', () => {
    call('PUT', '/inventory-audits/settings', { staleBinFreezeMinutes: 120 }).then((res) => {
      expectJoiRejection(res, 'enableWorkerLocationCorrection');
    });
  });

  // BVA — the abandoned-count release window, 0 is the documented opt-out
  it('SW-IAUD-API-TC56: accepts 0, 1440 and null for the release window and rejects -1 and 1441', function () {
    if (!originalSettings) this.skip();
    const keep = originalSettings.enableWorkerLocationCorrection;
    const cases = [
      { value: -1, ok: false },
      { value: 0, ok: true }, // the documented opt-out — min(1) used to make it unreachable
      { value: 1440, ok: true },
      { value: 1441, ok: false },
      { value: null, ok: true },
    ];
    cases.forEach(({ value, ok }) => {
      call('PUT', '/inventory-audits/settings', {
        enableWorkerLocationCorrection: keep,
        staleBinFreezeMinutes: value,
      }).then((res) => {
        if (ok) {
          expect(res.status, `staleBinFreezeMinutes=${value} is inside the valid range`).to.eq(200);
        } else {
          expect(res.status, `staleBinFreezeMinutes=${value} is outside the valid range`).to.eq(400);
        }
      });
    });
  });

  // Error guessing — ABSENT ≠ null (an unrelated save used to reset the window)
  it('SW-IAUD-API-TC57: omitting the release window preserves the stored value', function () {
    if (!originalSettings) this.skip();
    const keep = originalSettings.enableWorkerLocationCorrection;
    // Park a known, non-default value first.
    call('PUT', '/inventory-audits/settings', {
      enableWorkerLocationCorrection: keep,
      staleBinFreezeMinutes: 0,
    }).then(() => {
      // A save that does not mention the window must not reset it to null.
      call('PUT', '/inventory-audits/settings', { enableWorkerLocationCorrection: keep }).then((res) => {
        expect(res.status, 'omitting the release window preserves the stored value').to.eq(200);
        call('GET', '/inventory-audits/settings').then((read) => {
          expect(
            read.body?.data?.staleBinFreezeMinutes,
            'an omitted key preserves the stored value; only an explicit null clears it'
          ).to.eq(0);
        });
      });
    });
  });

  // Error guessing — the settings surface is closed
  it('SW-IAUD-API-TC58: rejects an unknown field in the settings body', function () {
    if (!originalSettings) this.skip();
    call('PUT', '/inventory-audits/settings', {
      enableWorkerLocationCorrection: originalSettings.enableWorkerLocationCorrection,
      notAField: 1,
    }).then((res) => {
      expect(res.status, 'rejects an unknown field in the settings body').to.eq(400);
    });
  });

  // ===========================================================================
  // Close-out report export  (audit-report.controller.ts)
  // ===========================================================================
  //
  // The legacy `InventoryAuditAPI.cy.js` covered `GET /:id/report/export`; deleting
  // that spec together with its controller dropped the route's only coverage.
  // Restored here rather than dropped silently — a migration never loses coverage.
  //
  // Binary body, so `encoding: 'binary'` and no envelope assertions: the route uses
  // `@Res()` and streams the workbook past the response interceptor.

  /** Any audit on the tenant is a valid report subject — the export has no status gate. */
  const anyAuditId = () =>
    call('GET', '/inventory-audits').then((res) => {
      const rows = res.body?.data ?? [];
      return rows.length ? rows[0].id : null;
    });

  const exportUrl = (id) => `${baseUrl}/inventory-audits/${id}/report/export`;

  // EP — the workbook partition (valid id + admin bearer) and its two invalid
  // neighbours: no token at all, and an id no audit has.
  it('SW-IAUD-API-TC59: exports the close-out report as a workbook for an admin bearer', function () {
    anyAuditId().then((id) => {
      if (!id) this.skip(); // no audit on this tenant to report on — see pending.md
      cy.request({
        method: 'GET',
        url: exportUrl(id),
        headers: headers(),
        encoding: 'binary',
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, 'exports the close-out report as a workbook').to.eq(200);
        expect(
          String(res.headers['content-type'] ?? ''),
          'the body is a spreadsheet, not the JSON envelope'
        ).to.match(/spreadsheetml\.sheet|application\/octet-stream/);
        expect(
          String(res.headers['content-disposition'] ?? ''),
          'served as a download, named for the audit'
        ).to.match(new RegExp(`attachment;.*audit-${id}-report`));
        expect(res.body?.length, 'a workbook is never empty').to.be.greaterThan(0);
      });
      // The unauthenticated partition — the guard-regression check. It matters more
      // on this route than most: it deliberately accepts a token in the URL (TC60),
      // which makes an accidental @Public() easy to miss.
      cy.request({
        method: 'GET',
        url: exportUrl(id),
        headers: { 'Content-Type': 'application/json' }, // intentionally no Authorization
        encoding: 'binary',
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, 'no token must be 401, not a workbook').to.eq(401);
      });
      // Unknown id — the report is derived, so a missing audit must 404 rather than
      // stream an empty workbook that reads as a clean count.
      cy.request({
        method: 'GET',
        url: exportUrl(MISSING_ID),
        headers: headers(),
        encoding: 'binary',
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, 'an id no audit has must not produce a workbook').to.eq(404);
      });
    });
  });

  // Decision table — the two ways this download may be authenticated. The header
  // column is TC59; this is the `?token=` column the guard opens for download routes
  // (QUERY_TOKEN_PATH_MARKERS, keycloak-public.guard.ts). The ABC screen itself
  // downloads via XHR with the header (Frontend ABC/auditApi.ts), so this asserts the
  // guard's contract rather than a UI dependency — the pair SKILL §6 convention 7 asks
  // for on every export.
  it('SW-IAUD-API-TC60: exports the report with the token in the query and no Authorization header', function () {
    anyAuditId().then((id) => {
      if (!id) this.skip(); // see TC59
      cy.request({
        method: 'GET',
        url: `${exportUrl(id)}?token=${encodeURIComponent(adminJwt)}`,
        headers: { 'Content-Type': 'application/json' }, // intentionally no Authorization
        encoding: 'binary',
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, 'the token query fallback authenticates the download').to.eq(200);
        expect(res.body?.length, 'and returns the same non-empty workbook').to.be.greaterThan(0);
      });
    });
  });
});
