// cypress/support/InventoryAudit/auditLifecycle.js
//
// The API surface the multi-actor Inventory Audit specs drive: admin audit
// management, the worker count routes, the WMS write paths used as the freeze
// instrument, the review/close routes, and the audit trail.
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §6.6 (harness), §9.3–§9.5
//
// WHY these flows run over the API rather than through two UIs: one audit
// lifecycle is 10+ steps across an admin desktop and a worker handheld. Driving
// both browsers would be slow and flaky, and the assertions that matter are
// outcomes, not clicks. The UI is asserted at the points a human actually looks —
// see each spec's own UI checkpoints.
//
// Every helper yields the raw cy.request result (`failOnStatusCode: false`) so a
// caller can assert on a refusal as easily as on a success. None of them assert.

const api = () => Cypress.env('API_BASE_URL');

const H = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const req = (method, token, path, body) =>
  cy.request({ method, url: `${api()}${path}`, headers: H(token), body, failOnStatusCode: false });

/** Unwrap the standard envelope; tolerate an unwrapped body (e.g. /locations). */
export const unwrap = (res) => (res && res.body && 'data' in res.body ? res.body.data : res && res.body);

// ---------------------------------------------------------------------------
// Admin — audit management
// ---------------------------------------------------------------------------

export const createAudit = (token, body) => req('POST', token, '/inventory-audits', body);
export const getAudit = (token, id) => req('GET', token, `/inventory-audits/${id}`);
export const listAudits = (token, qs = '') => req('GET', token, `/inventory-audits${qs}`);
export const cancelAuditApi = (token, id) => req('POST', token, `/inventory-audits/${id}/cancel`, {});
export const getBins = (token, id) => req('GET', token, `/inventory-audits/${id}/bins`);
export const assignBins = (token, id, assignments) =>
  req('POST', token, `/inventory-audits/${id}/assignments`, { assignments });
export const getWorkers = (token) => req('GET', token, '/inventory-audits/workers');
export const getPreview = (token, scopeLocationId, abcClass) =>
  req(
    'GET',
    token,
    `/inventory-audits/preview?scopeLocationId=${scopeLocationId}${abcClass ? `&abcClass=${abcClass}` : ''}`
  );
export const getSettings = (token) => req('GET', token, '/inventory-audits/settings');
export const putSettings = (token, body) => req('PUT', token, '/inventory-audits/settings', body);

/**
 * Poll the audit header until count-task generation finishes.
 *
 * Gate on `binsGeneratedAt`, NEVER on "bins.length > 0": a scope with no matching
 * inventory finishes generation with zero bins, and waiting for a non-empty list
 * there would hang to the timeout and then fail for the wrong reason. This is the
 * same signal AuditDetail.tsx polls on.
 */
export function waitForGeneration(token, auditId, options = {}) {
  const attempts = options.attempts || 30;
  const intervalMs = options.intervalMs || 2000;
  const attempt = (n) =>
    getAudit(token, auditId).then((res) => {
      const audit = unwrap(res);
      if (audit && audit.binsGeneratedAt) return audit;
      if (n >= attempts) {
        throw new Error(
          `count-task generation did not finish for audit ${auditId} within ` +
            `${(attempts * intervalMs) / 1000}s — the worker process (PROCESS_ROLE) may not be ` +
            'consuming the audit-count queue on this environment'
        );
      }
      return cy.wait(intervalMs, { log: false }).then(() => attempt(n + 1));
    });
  return attempt(0);
}

// ---------------------------------------------------------------------------
// Worker — count routes (each 403s unless the bin is assigned to the caller)
// ---------------------------------------------------------------------------

export const getAssignedAudits = (token) => req('GET', token, '/inventory-audits/assigned');
export const getWorkerTasks = (token, auditId) => req('GET', token, `/inventory-audits/${auditId}/tasks`);
export const startBin = (token, binId) => req('POST', token, `/inventory-audits/bins/${binId}/start`, {});
export const scanSerial = (token, binId, serialNumber, extra = {}) =>
  req('POST', token, `/inventory-audits/bins/${binId}/scan`, Object.assign({ serialNumber }, extra));
export const removeScan = (token, binId, serial) =>
  req('DELETE', token, `/inventory-audits/bins/${binId}/scan/${encodeURIComponent(serial)}`);
export const enterQuantity = (token, binId, body) =>
  req('POST', token, `/inventory-audits/bins/${binId}/quantity`, body);
export const addLine = (token, binId, productId) =>
  req('POST', token, `/inventory-audits/bins/${binId}/line`, { productId });
export const moveMisplaced = (token, binId, body) =>
  req('POST', token, `/inventory-audits/bins/${binId}/move-misplaced`, body);
export const submitBin = (token, binId, confirmUncounted = false) =>
  req('POST', token, `/inventory-audits/bins/${binId}/submit`, confirmUncounted ? { confirmUncounted } : {});

// ---------------------------------------------------------------------------
// Review / close / report
// ---------------------------------------------------------------------------

export const getDiscrepancies = (token, id) => req('GET', token, `/inventory-audits/${id}/discrepancies`);
export const setLineReason = (token, id, lineId, reason) =>
  req('PUT', token, `/inventory-audits/${id}/lines/${lineId}/reason`, { reason });
export const approveLine = (token, id, lineId, reason) =>
  req('POST', token, `/inventory-audits/${id}/lines/${lineId}/approve`, reason ? { reason } : {});
export const rejectLine = (token, id, lineId) =>
  req('POST', token, `/inventory-audits/${id}/lines/${lineId}/reject`, {});
export const requestRecount = (token, id, lineId) =>
  req('POST', token, `/inventory-audits/${id}/lines/${lineId}/recount`, {});
export const closeAuditApi = (token, id) => req('POST', token, `/inventory-audits/${id}/close`, {});
export const getUnplaced = (token, id, qs = '') => req('GET', token, `/inventory-audits/${id}/unplaced${qs}`);
export const getReport = (token, id) => req('GET', token, `/inventory-audits/${id}/report`);
export const getCountLines = (token, id, qs = '') =>
  req('GET', token, `/inventory-audits/${id}/count-lines${qs}`);

/**
 * The serials behind ONE count line — what the review screen's expand chevron opens.
 *
 * This is where an `Unexpected` scan actually surfaces to the admin. It does NOT
 * appear in `unresolvedScans`, which holds `NotFound` reads only
 * (`listUnresolvedScans`, discrepancy-review.service.ts:239); an extra unit the
 * system had filed nowhere is still a real serial, so it lands on the line it was
 * scanned against and is read back through here.
 *
 * `filter` is one of `all` | `scanned` | `notScanned` (LineSerialFilter).
 */
export const getLineSerials = (token, auditId, lineId, qs = '') =>
  req('GET', token, `/inventory-audits/${auditId}/lines/${lineId}/serials${qs}`);

// ---------------------------------------------------------------------------
// The freeze instrument — real WMS writes, so a refusal means something
// ---------------------------------------------------------------------------
//
// The guard lives in these write paths, not in the audit module, so a test that
// only checks "the bin row says InProgress" proves the flag and not the
// enforcement. Each helper below is a genuine warehouse operation.

export const getFrozenBins = (token) => req('GET', token, '/bin-locks');
export const assignItemToLocation = (token, locationId, serialNumber, extra = {}) =>
  req('POST', token, `/location-assignments/${locationId}/items`, Object.assign({ serialNumber }, extra));
export const addQuantityToLocation = (token, locationId, productId, delta) =>
  req('POST', token, `/location-assignments/${locationId}/quantities`, { productId, delta });
export const unassignItem = (token, serialNumber) =>
  req('DELETE', token, `/location-assignments/items/${encodeURIComponent(serialNumber)}`);
export const moveItemBetweenLocations = (token, fromLocationId, toLocationId, serialNumber) =>
  req('PUT', token, `/location-assignments/${fromLocationId}/move-item/${toLocationId}`, { serialNumber });
export const listLocationItems = (token, locationId) =>
  req('GET', token, `/location-assignments/${locationId}/items`);
export const listLocationQuantities = (token, locationId) =>
  req('GET', token, `/location-assignments/${locationId}/quantities`);
export const listLocationContainers = (token, locationId) =>
  req('GET', token, `/location-assignments/${locationId}/containers`);
export const moveContainerToLocation = (token, containerId, locationId) =>
  req('POST', token, `/containers/${containerId}/move-to-location/${locationId}`, {});
export const addItemToContainer = (token, containerId, serialNumber) =>
  req('POST', token, `/containers/${containerId}/items`, { serialNumbers: [serialNumber] });
export const stockOutBySerial = (token, serialNumber, reason = 'Sold') =>
  req('POST', token, '/products/stockout-by-serial-number', { serialNumber, reason });
export const restockBySerial = (token, serialNumber) =>
  req('POST', token, '/products/restock-by-serial-number', { serialNumber });

/**
 * The `status` of one item, read straight from the item record.
 *
 * Read per-serial rather than from a bin listing on purpose: the statuses that
 * matter to the audit specs (`Missing`, `StockedOut`) are exactly the ones that
 * can REMOVE the placement, so a bin read would answer "not there" without saying
 * why. Yields null when the serial is unknown.
 */
export const getItemStatus = (token, serialNumber) =>
  req('GET', token, `/products/item/${encodeURIComponent(serialNumber)}`).then((res) => {
    const body = unwrap(res) || {};
    const row = (body.list || [])[0];
    return row ? row.status : null;
  });

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const getTrail = (token, entityType, entityID, pageSize = 50) =>
  req(
    'GET',
    token,
    `/audit-trails?entityType=${entityType}&entityID=${encodeURIComponent(entityID)}` +
      `&page=1&page_size=${pageSize}`
  );

/** Trail rows out of whichever envelope/pagination shape comes back. */
export function trailRows(res) {
  const body = unwrap(res);
  if (Array.isArray(body)) return body;
  return (body && (body.items || body.list || body.data)) || [];
}

/** The distinct actionType values present in a trail response. */
export const trailActions = (res) => [...new Set(trailRows(res).map((r) => String(r.actionType)))];

/** Every trail row whose diff mentions this audit id — count rows are filed
 *  against the LOCATION, so the audit id only appears inside `diff`. */
export function trailRowsForAudit(res, auditId) {
  return trailRows(res).filter((r) => {
    try {
      const diff = typeof r.diff === 'string' ? JSON.parse(r.diff) : r.diff;
      return diff && Number(diff.auditId) === Number(auditId);
    } catch (e) {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/**
 * Every bin in the warehouse, with what it currently holds.
 *
 * `GET /locations/dashboard/summary` is the ONLY read that returns bins at all.
 * `GET /locations` is root-only — it answers with facilities and nothing else
 * (verified against QA on 2026-08-20: 3 rows on a tenant holding seven bins), and
 * `GET /locations/:id/hierarchy` returns just the node you asked for. The previous
 * probes walked `/locations` looking for `type === 'Bin'`, found none by
 * construction, and every serial-, sibling- and container-dependent test in this
 * module skipped for an environment reason that was never true.
 *
 * The summary rows carry `id`, `code`, `path`, `parentId` and `cur_items` — the
 * contents AND the sibling grouping, in one call.
 */
export function listAllBins(token) {
  return req('GET', token, '/locations/dashboard/summary').then((res) => {
    const body = unwrap(res);
    return ((body && body.bins) || []).filter((b) => b && b.id);
  });
}

/**
 * A predicate: is this bin free of any LIVE audit?
 *
 * "One bin, one live audit of the same expected set" is a real product rule, so a
 * bin already under a live audit refuses a second one with 409 AUDIT_SCOPE_OVERLAP.
 * That is the feature working — but a probe that hands such a bin to a spec turns it
 * into a cascade of failures that read like regressions. QA carries long-lived
 * manually-created audits (`Test Audit 05` / `06` held BN-5 and BN-6 on 2026-08-20),
 * so this is the normal case, not an edge one.
 *
 * Matched two ways, because an audit row exposes an id and a LABEL, never a path:
 * by exact `scopeLocationId`, and by the label's location code appearing as a
 * segment of the bin's path — which is what catches an audit scoped to an ancestor.
 */
export function liveAuditScopeFilter(token) {
  return listAudits(token).then((res) => {
    const live = (unwrap(res) || []).filter((a) =>
      ['Open', 'InProgress', 'PendingReview'].includes(a.status)
    );
    const ids = new Set(live.map((a) => Number(a.scopeLocationId)).filter(Boolean));
    // "BN-5 (Bin)" -> "BN-5"
    const codes = live
      .map((a) => String(a.scopeLocationLabel || '').split(' ')[0].trim())
      .filter(Boolean);
    // Wrapped in an object, not returned bare: Cypress special-cases a function
    // returned from `.then()`, and an accidental invocation here would silently
    // yield `undefined` instead of the predicate.
    return {
      isFree: (bin) => {
        if (ids.has(Number(bin.id))) return false;
        const segments = String(bin.path || '').split('.');
        return !codes.some((code) => segments.includes(code));
      },
    };
  });
}

/**
 * A bin that holds countable stock and is not already being counted.
 *
 * Prefers a bin holding BOTH families — serialized items and quantity lines —
 * because the plan's two product-family groups each need one and a bin holding only
 * one silently halves the coverage. Yields null when the environment genuinely has
 * nothing auditable, so callers can skip rather than fail.
 */
export function probeStockedBin(token) {
  return liveAuditScopeFilter(token).then(({ isFree }) =>
    listAllBins(token).then((bins) => {
      // Richest first: `cur_items` is a cheap proxy for "has something to count", so
      // the enrich calls below start where they are most likely to pay off.
      const candidates = bins
        .filter(isFree)
        .sort((a, b) => Number(b.cur_items || 0) - Number(a.cur_items || 0))
        .slice(0, 12);

      if (!candidates.length) {
        Cypress.log({ name: 'audit-fixture', message: 
          'probeStockedBin: every bin is either empty or already under a live audit — ' +
            'cancel the leftovers, or add stock (see pending.md §1)'
         });
        return null;
      }

      const enrich = (loc) =>
        listLocationItems(token, loc.id).then((itemsRes) => {
          const items = unwrap(itemsRes);
          // AVAILABLE only. A `Missing`, `Damaged` or `StockedOut` unit is still
          // filed in the bin and still comes back from this route, but generation
          // does not put it on a serialized count line — so counting it as "this bin
          // has serials" picked bins whose serialized half could never run, and the
          // scan cases skipped or failed for a reason that was not about them.
          const serials = (Array.isArray(items) ? items : (items && items.items) || [])
            .filter((it) => {
              const status = String(it.itemStatus ?? it.status ?? 'Available');
              return status === 'Available';
            })
            .map((it) => it.serial_number || it.serialNumber)
            .filter(Boolean);
          return listLocationQuantities(token, loc.id).then((qtyRes) => {
            const qtyBody = unwrap(qtyRes);
            const quantities = (
              Array.isArray(qtyBody) ? qtyBody : (qtyBody && qtyBody.items) || []
            ).filter((q) => Number(q.quantity) > 0);
            return Object.assign({}, loc, { name: loc.code, serials, quantities });
          });
        });

      // Holding BOTH families still wins, but the number of SERIALS is the
      // tiebreak — a bin with two serials can run the cases that consume one
      // (E2E-TC12/TC13 need the bin to survive losing a serial) while a one-serial
      // bin makes them skip. Quantity stock is now staged by `ensureQuantityInBin`
      // wherever it is needed, so a missing quantity line is worth far less than a
      // missing serial, which nothing in this suite can create.
      // Holding BOTH families still wins, but a SECOND serial outranks a quantity
      // line — because the suite can stage quantity stock into any bin
      // (`ensureQuantityInBin`) and cannot create serials at all. A bin with one
      // serial and one quantity line therefore looks richer than it is: the cases
      // that need two serials in one bin (MOB-TC07/TC08/TC10, and every case that
      // consumes one via `binSurvivesLosingOneSerial`) skip against it, and no
      // amount of staging rescues them.
      //
      // Observed on QA 2026-08-25: BN-5 (1 serial + 1 quantity) scored 3.1 and beat
      // BN-1 (7 serials, no quantity) at 2.7, which skipped five tests that BN-1
      // would have run — with the quantity line then staged in.
      const score = (s) =>
          (s.serials.length ? 2 : 0) +
          (s.serials.length > 1 ? 2 : 0) +
          (s.quantities.length ? 1 : 0) +
          Math.min(s.serials.length, 9) / 10;
      const announce = (b) => {
        Cypress.log({ name: 'audit-fixture', message: 
          `probeStockedBin: ${b.code} — ${b.serials.length} serial(s), ` +
            `${b.quantities.length} quantity line(s)`
         });
        return b;
      };

      const next = (i, best) => {
        if (i >= candidates.length) {
          if (!best || !score(best)) {
            Cypress.log({ name: 'audit-fixture', message: 'probeStockedBin: no free bin holds countable stock — see pending.md §1' });
            return null;
          }
          return announce(best);
        }
        return enrich(candidates[i]).then((enriched) =>
          // The audit module must also agree the scope is countable.
          req('GET', token, `/inventory-audits/preview?scopeLocationId=${enriched.id}`).then((p) => {
            const d = unwrap(p);
            const usable = p.status === 200 && d && Number(d.scopeBinCount) > 0;
            const better = usable && (!best || score(enriched) > score(best)) ? enriched : best;
            // 3 == holds both families; nothing further can beat it.
            // The ceiling is now 2 (has serials) + 2 (has a SECOND serial) + 1 (has a
            // quantity line) = 5, plus the fractional serial-count tiebreak. Stop as
            // soon as a candidate can no longer be beaten.
            if (better && score(better) >= 5) return announce(better);
            return next(i + 1, better);
          })
        );
      };
      return next(0, null);
    })
  );
}

/**
 * Two sibling bins under one parent — for the "freeze is narrow" assertion and
 * every misplacement column.
 *
 * Grouped by `parentId` straight off the summary, so no path arithmetic and no
 * assumption about the separator. Both members are filtered to bins no live audit
 * holds: the sibling gets WRITTEN to (a serial is parked in it), and a frozen one
 * would refuse.
 */
export function probeSiblingBins(token) {
  return liveAuditScopeFilter(token).then(({ isFree }) =>
    listAllBins(token).then((bins) => {
      const byParent = new Map();
      bins.filter(isFree).forEach((b) => {
        const key = String(b.parentId == null ? '' : b.parentId);
        if (!key) return;
        byParent.set(key, (byParent.get(key) || []).concat([b]));
      });
      const groups = [...byParent].filter(([, group]) => group.length >= 2);
      if (!groups.length) {
        Cypress.log({ name: 'audit-fixture', message: 'probeSiblingBins: no two free bins share a parent — sibling cases will skip' });
        return null;
      }

      // `second` gets WRITTEN to — every misplacement case parks an Available serial
      // in it — and a location refuses to hold two item statuses at once ("Cannot
      // mix Available items with Damaged items at this location",
      // direct-location-assignment.services.ts:276). So a sibling holding a Damaged
      // unit can never accept the staging, and picking one purely by `cur_items`
      // chose exactly that on QA: BN-1 is the richest sibling and its one item is
      // Damaged, which made TC26/TC27 skip for a reason that was never about them.
      //
      // Prefer a sibling that is EMPTY (no status to clash with) or already holding
      // Available stock; fall back to the old ordering so a tenant whose bins are
      // all occupied still gets a pair rather than a skip.
      const acceptsAvailable = (bin) =>
        listLocationItems(token, bin.id).then((res) => {
          const body = unwrap(res);
          const rows = Array.isArray(body) ? body : (body && body.items) || [];
          if (!rows.length) return true;
          return rows.every((i) => String(i.itemStatus ?? i.status ?? 'Available') === 'Available');
        });

      const pickFrom = (index) => {
        if (index >= groups.length) {
          // Nothing ideal — take the first pair anyway; the stagers yield null and
          // the affected tests skip with their own explanation.
          const [parent, group] = groups[0];
          const sorted = group.slice().sort((a, b) => Number(b.cur_items || 0) - Number(a.cur_items || 0));
          Cypress.log({
            name: 'audit-fixture',
            message: 'probeSiblingBins: no sibling can accept an Available serial — misplacement cases may skip',
          });
          return { parent, first: sorted[0], second: sorted[1] };
        }
        const [parent, group] = groups[index];
        // Richest first, so `first` is the more useful one to count.
        const sorted = group.slice().sort((a, b) => Number(b.cur_items || 0) - Number(a.cur_items || 0));
        const candidates = sorted.slice(1);
        const tryCandidate = (i) => {
          if (i >= candidates.length) return pickFrom(index + 1);
          return acceptsAvailable(candidates[i]).then((ok) =>
            ok ? { parent, first: sorted[0], second: candidates[i] } : tryCandidate(i + 1)
          );
        };
        return tryCandidate(0);
      };
      return pickFrom(0);
    })
  );
}

/**
 * A container parked in a bin, with what it holds. Null when none exists.
 *
 * Reads bins from the summary for the same reason the other probes do — the
 * previous version filtered `/locations` on `type === 'Bin'`, which that endpoint
 * never returns, so this probe could only ever yield null.
 */
export function probeContainerInBin(token) {
  return liveAuditScopeFilter(token).then(({ isFree }) =>
    listAllBins(token).then((bins) => {
      const candidates = bins
        .filter(isFree)
        .sort((a, b) => Number(b.cur_items || 0) - Number(a.cur_items || 0))
        .slice(0, 12);
      const next = (i) => {
        if (i >= candidates.length) {
          Cypress.log({ name: 'audit-fixture', message: 'probeContainerInBin: no free bin holds a container — container cases will skip' });
          return null;
        }
        return listLocationContainers(token, candidates[i].id).then((cRes) => {
          const cBody = unwrap(cRes);
          const containers = Array.isArray(cBody) ? cBody : (cBody && cBody.items) || [];
          if (containers.length) return { bin: candidates[i], container: containers[0] };
          return next(i + 1);
        });
      };
      return next(0);
    })
  );
}

/**
 * Teardown that always leaves the environment usable.
 *
 * A crashed run can leave a bin `InProgress`, which then blocks unrelated WMS
 * suites with a 409 — so submit anything still being counted (the status
 * transition IS the freeze release) and then cancel the audit. Best-effort
 * throughout: teardown must never be the thing that fails a run.
 */
export function forceReleaseAudit(adminToken, workerToken, auditId) {
  if (!auditId) return cy.wrap(null, { log: false });
  return getBins(adminToken, auditId).then((res) => {
    const bins = unwrap(res) || [];
    // Anything not already Submitted still holds its freeze. `InProgress` is the
    // common case, but a UI test can leave a bin in any non-terminal state — TC19
    // opens the ambiguous-scan picker and never resolves it, so its bin stayed
    // open, the cancel below was refused, and the audit sat on BN-4 holding the
    // richest bin out of the next run's probe. That single leak turned 6 skips
    // into 10.
    const open = bins.filter((b) => b.status !== 'Submitted' && b.status !== 'Pending');
    const chain = open.reduce(
      (acc, bin) => acc.then(() => (workerToken ? submitBin(workerToken, bin.id, true) : null)),
      cy.wrap(null, { log: false })
    );
    return chain
      .then(() => cancelAuditApi(adminToken, auditId))
      .then((cancelled) => {
        if (cancelled.status < 400) return null;

        // CANCEL IS REFUSED ONCE AN ADJUSTMENT HAS BEEN APPLIED — that is a real
        // product rule (SW-IAUD-API-TC52: "Cannot cancel an audit that has already
        // applied an inventory adjustment"). Without this branch every test that
        // approves a discrepancy left an unreleasable audit sitting in PendingReview,
        // holding its bin against the "one live audit per scope" ruleForever. Three
        // of them accumulated on QA on 2026-08-20 and took BN-2, BN-3 and BN-4 out of
        // circulation, which made the whole spec skip for want of an auditable bin.
        //
        // The way out is to FINISH the review rather than abandon it: reject every
        // still-open line — a rejection moves no stock — and the audit finalises
        // itself once none are left.
        return getDiscrepancies(adminToken, auditId).then((d) => {
          const lines = ((unwrap(d) || {}).lines || []).filter(
            (l) => !l.reviewStatus || l.reviewStatus === 'PendingReview'
          );
          return lines
            .reduce(
              (acc, l) => acc.then(() => rejectLine(adminToken, auditId, l.lineId)),
              cy.wrap(null, { log: false })
            )
            .then(() => getAudit(adminToken, auditId))
            .then((after) =>
              (unwrap(after) || {}).status === 'Completed'
                ? null
                : closeAuditApi(adminToken, auditId)
            );
        });
      });
  });
}

/** Cancel every leftover audit whose name carries the suite prefix. */
export function sweepLeftoverAudits(adminToken, prefix = 'cy-') {
  return listAudits(adminToken).then((res) => {
    const stale = (unwrap(res) || []).filter(
      (a) =>
        String(a.name).indexOf(prefix) === 0 &&
        ['Open', 'InProgress', 'PendingReview'].indexOf(a.status) >= 0
    );
    return stale.reduce(
      (acc, a) => acc.then(() => cancelAuditApi(adminToken, a.id)),
      cy.wrap(null, { log: false })
    );
  });
}
