// cypress/support/InventoryAudit/auditHelpers.js
//
// Shared intercepts, seeding and probes for the Inventory Audit → Audits specs.
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md (§6.2 seeding, §6.5 stubbing)
//
// WHY the list specs are largely stub-driven (plan §6.5): the conditional cells
// cannot be arranged on a live environment. No QA tenant can be made to hold, at
// once, one audit mid-generation, one that generated zero bins, one with exactly
// one discrepancy and one with three assigned workers — and none can be made to
// fail a request on cue. Each stub body below is shaped to `AuditListItemDto`
// (Backend/src/modules/inventory-audit/dto/audit-management.dto.ts) so a DTO
// change is caught by the live API spec (SW-IAUD-API-TC05) rather than silently
// diverging here.
//
// Register every intercept BEFORE the action that triggers it, or cy.wait hangs
// (feedback_cypress_intercept_before_click).

/** Route matchers — kept in one place so a base-path change is a one-line fix. */
export const ROUTES = {
  list: '**/inventory-audits',
  listAny: '**/inventory-audits?*',
  settings: '**/inventory-audits/settings',
  preview: '**/inventory-audits/preview*',
  workers: '**/inventory-audits/workers',
  create: '**/inventory-audits',
  cancel: (id) => `**/inventory-audits/${id}/cancel`,
  locations: '**/locations*',
};

/** The standard success envelope every audit route returns. */
export const envelope = (data) => ({ statusCode: 200, success: true, error: null, data });

/**
 * A minimally-complete list row. Every field `AuditListItemDto` declares is
 * present, so a spec can override just the one under test and the rest still
 * render the way the component expects.
 */
export const auditRow = (overrides = {}) => ({
  id: 1,
  name: 'Seeded audit',
  auditType: 'Abc',
  abcClass: 'A',
  assignOnScan: true,
  status: 'Open',
  scopeLocationId: 10,
  scopeLocationLabel: 'Facility 02 (Facility)',
  scopeLocationCode: 'F-02',
  workerCount: 1,
  assignedWorkers: [{ userId: 'w-1', name: 'Worker One' }],
  binCount: 12,
  variance: null,
  createdByName: 'QA Admin',
  createdAt: '2026-08-01T10:00:00.000Z',
  binsGeneratedAt: '2026-08-01T10:00:30.000Z',
  ...overrides,
});

/** Stub the audits list with an explicit set of rows. */
export function stubAuditList(rows, alias = 'auditList') {
  cy.intercept('GET', ROUTES.list, { body: envelope(rows) }).as(alias);
  // The screen fetches without query params, but tolerate a params variant so a
  // future server-side filter cannot silently fall through to the live backend.
  cy.intercept('GET', ROUTES.listAny, { body: envelope(rows) });
  return alias;
}

/** Stub the audits list as empty — the "no audits yet" partition. */
export function stubEmptyAuditList(alias = 'emptyList') {
  return stubAuditList([], alias);
}

/** Stub the settings read. */
export function stubSettings(settings, alias = 'settingsGet') {
  cy.intercept('GET', ROUTES.settings, {
    body: envelope({ enableWorkerLocationCorrection: true, staleBinFreezeMinutes: null, ...settings }),
  }).as(alias);
  return alias;
}

/** Stub the settings read as a failure — the load-error partition. */
export function stubSettingsFailure(alias = 'settingsFail') {
  cy.intercept('GET', ROUTES.settings, {
    statusCode: 500,
    body: { statusCode: 500, success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom', details: [] }, data: null },
  }).as(alias);
  return alias;
}

/** Capture the settings write so the spec can assert the exact body sent. */
export function stubSettingsSave(alias = 'settingsPut') {
  cy.intercept('PUT', ROUTES.settings, (req) => {
    req.reply({ body: envelope({ enableWorkerLocationCorrection: req.body.enableWorkerLocationCorrection, staleBinFreezeMinutes: null }) });
  }).as(alias);
  return alias;
}

/** Stub a successful cancel with a chosen result shape. */
export function stubCancelSuccess(id, result = {}, alias = 'cancelOk') {
  cy.intercept('POST', ROUTES.cancel(id), {
    body: envelope({ id, status: 'Cancelled', cancelledBins: 3, preservedScanCount: 7, interruptedBins: 1, ...result }),
  }).as(alias);
  return alias;
}

/**
 * Stub a REFUSED cancel — the applied-adjustment guard. A plain
 * BadRequestException, so the message is verbatim in `error.message` and
 * `error.details` is empty (plan §6.8).
 */
export function stubCancelRefused(id, message, alias = 'cancelRefused') {
  cy.intercept('POST', ROUTES.cancel(id), {
    statusCode: 400,
    body: {
      statusCode: 400,
      success: false,
      error: { code: 'INVALID_REQUEST', message, details: [] },
      data: null,
    },
  }).as(alias);
  return alias;
}

/**
 * Stub a create conflict (duplicate name / scope overlap). The Conflict filter
 * parses the service's stringified payload into `details[0]` and leaves a GENERIC
 * `error.message`, which is exactly why `auditErrorMessage` prefers details —
 * a stub that put the sentence in `message` would not exercise that preference.
 */
export function stubCreateConflict(detail, alias = 'createConflict') {
  cy.intercept('POST', ROUTES.create, {
    statusCode: 409,
    body: {
      statusCode: 409,
      success: false,
      error: { code: 'CONFLICT_IN_REQUEST', message: 'Resource conflicts', details: [detail] },
      data: null,
    },
  }).as(alias);
  return alias;
}

/** Stub a successful create, capturing the request body for assertion. */
export function stubCreateSuccess(created = {}, alias = 'createOk') {
  cy.intercept('POST', ROUTES.create, (req) => {
    req.reply({
      body: envelope({
        id: 4242,
        name: req.body?.name,
        auditType: req.body?.auditType ?? 'Abc',
        abcClass: req.body?.abcClass ?? null,
        assignOnScan: req.body?.assignOnScan ?? true,
        status: 'Open',
        scopeLocationId: req.body?.scopeLocationId ?? null,
        scopeLocationPath: 'F-02.Z-01',
        scopeLocationLabel: 'Zone 01 (Zone)',
        workerCount: (req.body?.workers ?? []).length,
        generationQueued: true,
        createdAt: '2026-08-18T09:00:00.000Z',
        ...created,
      }),
    });
  }).as(alias);
  return alias;
}

/** Stub the assignable-worker list. */
export function stubWorkers(workers, alias = 'workers') {
  cy.intercept('GET', ROUTES.workers, { body: envelope(workers) }).as(alias);
  return alias;
}

/** Stub the scope preview with a chosen shape. */
export function stubPreview(preview, alias = 'preview') {
  cy.intercept('GET', ROUTES.preview, {
    body: envelope({
      binCount: 5,
      lineCount: 9,
      serializedUnits: 4,
      nonSerialUnits: 6,
      totalExpectedUnits: 10,
      scopeBinCount: 8,
      scopeLabel: 'Zone 01 (Zone)',
      scopePath: 'F-02.Z-01',
      ...preview,
    }),
  }).as(alias);
  return alias;
}

/** Stub the preview as a failure — the "could not compute" partition. */
export function stubPreviewFailure(alias = 'previewFail') {
  cy.intercept('GET', ROUTES.preview, { statusCode: 500, body: {} }).as(alias);
  return alias;
}

/** Stub the WMS location tree for the scope picker. */
export function stubLocations(byParent, alias = 'locations') {
  cy.intercept('GET', ROUTES.locations, (req) => {
    const parentId = req.query.parentId ? Number(req.query.parentId) : 'root';
    req.reply({ body: { items: byParent[parentId] ?? [], total: (byParent[parentId] ?? []).length } });
  }).as(alias);
  return alias;
}

/** A scope-picker node. `childCount: 0` makes it a leaf ("this is a bin"). */
export const locationNode = (overrides = {}) => ({
  id: 10,
  name: 'Facility 02',
  code: 'F-02',
  type: 'Facility',
  path: 'F-02',
  childCount: 1,
  isDeleted: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Live seeding + probes (used by the specs that must not be stubbed)
// ---------------------------------------------------------------------------

const apiBase = () => Cypress.env('API_BASE_URL');

/** Unique across runs — Cypress._.uniqueId() is NOT. */
export const uniqueAuditName = (tag) => `cy-aud-${tag}-${Date.now()}-${Cypress._.random(1e6)}`;

/** Create an audit over the API so a UI spec can act on a known row. */
export function seedAudit(token, body) {
  return cy.request({
    method: 'POST',
    url: `${apiBase()}/inventory-audits`,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
    failOnStatusCode: false,
  });
}

/** Cancel an audit — the inverse of seedAudit, and the only terminal state
 *  reachable without counting. Best-effort: never fails a teardown. */
export function cancelAudit(token, id) {
  if (!id) return cy.wrap(null, { log: false });
  return cy.request({
    method: 'POST',
    url: `${apiBase()}/inventory-audits/${id}/cancel`,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: {},
    failOnStatusCode: false,
  });
}

/**
 * Probe for a scope that can actually be audited. Yields null when none.
 *
 * Reads BINS from `/locations/dashboard/summary` — the only endpoint that returns
 * them. `GET /locations` is root-only, so the previous walk could only ever pick a
 * Facility, and a facility scope silently includes every bin under it — including
 * ones a live audit already holds, which then 409s the create.
 *
 * Yields `path` alongside the id, and that is load-bearing for the UI caller: the
 * scope sits seven levels deep, while `LocationScopePicker` only ever offers the
 * CURRENT level's children. A caller that picked a nested node's label straight from
 * the root list found nothing and timed out on "Expected to find [role=option]".
 * The path is the dot-joined chain of location CODES — exactly the drill-down order.
 */
export function probeAuditableScope(token) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const get = (path) =>
    cy.request({ method: 'GET', url: `${apiBase()}${path}`, headers, failOnStatusCode: false });

  return get('/inventory-audits').then((auditsRes) => {
    const live = ((auditsRes.body && auditsRes.body.data) || []).filter((a) =>
      ['Open', 'InProgress', 'PendingReview'].includes(a.status)
    );
    const busyIds = new Set(live.map((a) => Number(a.scopeLocationId)).filter(Boolean));
    const busyCodes = live
      .map((a) => String(a.scopeLocationLabel || '').split(' ')[0].trim())
      .filter(Boolean);

    return get('/locations/dashboard/summary').then((res) => {
      const body = (res.body && res.body.data) || res.body;
      const bins = ((body && body.bins) || []).filter((b) => {
        if (!b || !b.id || busyIds.has(Number(b.id))) return false;
        const segments = String(b.path || '').split('.');
        return !busyCodes.some((code) => segments.includes(code));
      });
      const candidates = bins
        .slice()
        .sort((a, b) => Number(b.cur_items || 0) - Number(a.cur_items || 0))
        .slice(0, 12);

      const next = (i) => {
        if (i >= candidates.length) return null;
        const bin = candidates[i];
        return get(`/inventory-audits/preview?scopeLocationId=${bin.id}`).then((p) =>
          p.status === 200 && Number(p.body && p.body.data && p.body.data.scopeBinCount) > 0
            ? { id: bin.id, name: bin.code, code: bin.code, type: 'Bin', path: bin.path }
            : next(i + 1)
        );
      };
      return next(0);
    });
  });
}
