// cypress/support/InventoryAudit/auditFixtures.js
//
// Reversible PRECONDITION STAGERS for the Inventory Audit specs.
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §6.2 (seeding)
//
// WHY THIS FILE EXISTS
// --------------------
// 23 `it()` blocks in this module used to be bare `this.skip()` placeholders,
// each waiting for QA to happen to hold a state the Audits surface cannot create:
// a never-placed serial, a serial recorded in another bin, a stocked-out unit
// still sitting on a shelf, a product a bin does not expect. Those tests never ran
// ANYWHERE — not on QA, not on stage, not locally — so they were coverage on paper
// only, and no amount of environment seeding would have changed that on its own,
// because the next run's data drifts again.
//
// Every state in that list is reachable through a warehouse write the API already
// exposes. So the specs stage it themselves and put it back, exactly the way the
// existing mutation tests pair `scan-damaged` with `mark-available`.
//
// THE THREE RULES EVERY STAGER HERE FOLLOWS
// -----------------------------------------
//  1. **Nothing asserts.** A stager yields its descriptor or `null`. Whether an
//     unstageable precondition is a skip or a failure is the caller's decision —
//     the same contract the probes in auditLifecycle.js follow.
//  2. **Every stager has an inverse, and the inverse tolerates `null`** so a
//     caller can register the restore before knowing whether staging worked.
//  3. **Stage BEFORE the audit is created.** Count-task generation snapshots what
//     a bin is expected to hold; mutating placement afterwards changes the
//     warehouse under a live count, which the bin freeze is there to prevent —
//     the write would simply 409. Every stager below is a pre-generation step.
//
// A stager that cannot do its job yields `null` rather than throwing, so a test
// degrades to a conditional skip (visible, explained) instead of a hard failure on
// an environment that will not cooperate.

import {
    assignItemToLocation,
    listLocationItems,
    restockBySerial,
    stockOutBySerial,
    unassignItem,
    unwrap,
} from './auditLifecycle';

const api = () => Cypress.env('API_BASE_URL');
const H = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

/** Serial numbers held at a location, from either casing the read route returns. */
export function serialsOf(res) {
    const body = unwrap(res);
    const rows = Array.isArray(body) ? body : (body && body.items) || [];
    return rows.map((i) => i.serial_number || i.serialNumber).filter(Boolean);
}

// ---------------------------------------------------------------------------
// A restore queue — so a test can register an inverse the moment it stages
// ---------------------------------------------------------------------------

/**
 * Collects inverse operations and runs them once, in REVERSE order.
 *
 * Reverse because stagers compose: a test that unassigns a serial and then parks
 * it in a sibling bin has to undo the park before the unassign's restore can put
 * it home. Registering at stage time (not at assert time) means a failed
 * assertion mid-test still leaves the queue complete.
 */
export function createRestoreQueue() {
    const queue = [];
    return {
        add(fn) {
            queue.push(fn);
            return fn;
        },
        /** Run and clear. Safe to call when empty; never throws. */
        drain() {
            const pending = queue.splice(0, queue.length).reverse();
            pending.forEach((fn) => {
                try {
                    fn();
                } catch (e) {
                    Cypress.log({ name: 'audit-fixture', message: `restore step failed (continuing): ${e && e.message}` });
                }
            });
        },
        get size() {
            return queue.length;
        },
    };
}

/**
 * Put every named serial back into one bin, whatever state the run left it in.
 *
 * The last line of defence for teardown, and deliberately NOT part of the restore
 * queue. Every call in this file goes through `cy.request` with
 * `failOnStatusCode: false`, so a restore refused mid-run (usually by a bin freeze
 * that had not lifted yet) resolves normally and the queue counts it as done — the
 * serial then ends the run unplaced. That is not cosmetic: the specs pick their
 * scope by which bin holds the most serials, so a serial left behind thins the
 * audited bin and makes the two-serial cases (E2E-TC56/TC57, MOB-TC12..TC14) skip
 * on the NEXT run, for a reason that looks like a thin environment.
 *
 * Idempotent and best-effort: a serial already filed in `binLocationId` is
 * re-filed harmlessly, and nothing here asserts.
 */
export function reconcileSerialsIntoBin(token, binLocationId, serialNumbers) {
    const wanted = (serialNumbers || []).filter(Boolean);
    if (!binLocationId || !wanted.length) return cy.wrap(null, { log: false });
    return listLocationItems(token, binLocationId).then((res) => {
        const present = new Set(serialsOf(res));
        const missing = wanted.filter((s) => !present.has(s));
        if (!missing.length) return null;
        Cypress.log({
            name: 'audit-fixture',
            message: `reconcileSerialsIntoBin: re-filing ${missing.length} serial(s) the run left elsewhere`,
        });
        return missing.reduce(
            (acc, serial) =>
                acc.then(() => assignItemToLocation(token, binLocationId, serial, { force: true })),
            cy.wrap(null, { log: false })
        );
    });
}

// ---------------------------------------------------------------------------
// Never-placed stock
// ---------------------------------------------------------------------------

/**
 * Make a serial NEVER-PLACED: still on hand, but the WMS records no location.
 *
 * This is the precondition behind the whole "never-placed stock" group (E2E-TC22
 * ..TC25, TC30, MOB-TC13). Unassigning is the one operation that produces it
 * without touching the unit's status — the serial stays `Available`, so it is
 * genuinely "stock the system holds but has filed nowhere", which is exactly what
 * `GET /:id/unplaced` reports on.
 *
 * Yields `null` when the unassign is refused — most likely because a bin freeze
 * from a leaked audit still covers the location.
 */
export function stageUnplacedSerial(token, serialNumber, homeLocationId) {
    return unassignItem(token, serialNumber).then((res) => {
        if (res.status >= 400) {
            // ALREADY UNPLACED IS THE STATE WE WANTED. The route refuses a second
            // unassign with 400 'Item "…" is not directly assigned to any location',
            // and treating that as a staging failure is what made TC30 skip: an
            // earlier test in the same file had filed this serial into a different
            // bin, so by the time TC30 asked for it, the serial was already exactly
            // as required. Restoring still works — the inverse force-files it home.
            const message = String(res.body?.error?.message ?? '');
            if (/not directly assigned to any location/i.test(message)) {
                Cypress.log({
                    name: 'audit-fixture',
                    message: `stageUnplacedSerial: ${serialNumber} was already unplaced — using it as staged`,
                });
                return { serialNumber, homeLocationId };
            }
            Cypress.log({ name: 'audit-fixture', message: `stageUnplacedSerial: unassign refused (${res.status}) for ${serialNumber}` });
            return null;
        }
        return { serialNumber, homeLocationId };
    });
}

/**
 * Put a staged never-placed serial back where it was found.
 *
 * `force` is deliberate: the count under test may itself have filed the serial
 * somewhere (that IS the assertion in E2E-TC22), so the restore has to be able to
 * overwrite a placement rather than assume there is none.
 */
export function restoreUnplacedSerial(token, staged) {
    if (!staged || !staged.homeLocationId) return cy.wrap(null, { log: false });
    return assignItemToLocation(token, staged.homeLocationId, staged.serialNumber, { force: true });
}

// ---------------------------------------------------------------------------
// Stock recorded somewhere else
// ---------------------------------------------------------------------------

/**
 * Park a serial in a DIFFERENT bin, so scanning it elsewhere reads as misplaced.
 *
 * Behind E2E-TC26/TC27 and MOB-TC12/TC14. The serial keeps its status; only the
 * placement moves, which is the whole distinction the Misplaced result draws —
 * "the system has this somewhere else" versus "the system has this nowhere".
 */
export function stageSerialInOtherBin(token, serialNumber, otherLocationId, homeLocationId) {
    return assignItemToLocation(token, otherLocationId, serialNumber, { force: true }).then((res) => {
        if (res.status >= 400) {
            Cypress.log({ name: 'audit-fixture', message: `stageSerialInOtherBin: assign refused (${res.status}) for ${serialNumber}` });
            return null;
        }
        return { serialNumber, otherLocationId, homeLocationId };
    });
}

/** Move a staged serial back to its home bin. */
export function restoreSerialHome(token, staged) {
    if (!staged || !staged.homeLocationId) return cy.wrap(null, { log: false });
    return assignItemToLocation(token, staged.homeLocationId, staged.serialNumber, { force: true });
}


// ---------------------------------------------------------------------------
// Stock that is not on hand
// ---------------------------------------------------------------------------

/**
 * Stock a serial OUT while leaving it filed in its bin — a physical unit on the
 * shelf that the system says is gone (E2E-TC28, MOB-TC16).
 *
 * Whether stock-out clears the WMS placement is a product decision this suite does
 * not get to make, so the stager READS THE PLACEMENT BACK and yields `null` when
 * it is gone. A caller then skips with an honest reason instead of asserting
 * against a state that does not exist on this build.
 */
export function stageStockedOutSerialInBin(token, serialNumber, locationId) {
    return stockOutBySerial(token, serialNumber).then((res) => {
        const body = res.body || {};
        const ok = res.status < 400 && body.success !== false;
        if (!ok) {
            Cypress.log({ name: 'audit-fixture', message: `stageStockedOutSerialInBin: stock-out refused (${res.status}) for ${serialNumber}` });
            return null;
        }
        return listLocationItems(token, locationId).then((after) => {
            if (!serialsOf(after).includes(serialNumber)) {
                // The placement went with it — this build cannot hold the state.
                // Undo immediately so the environment is left as found.
                return restockBySerial(token, serialNumber).then(() => null);
            }
            return { serialNumber, locationId };
        });
    });
}

/** Put a stocked-out serial back on hand. */
export function restoreStockedOutSerial(token, staged) {
    if (!staged) return cy.wrap(null, { log: false });
    return restockBySerial(token, staged.serialNumber);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * Any product the given bin does NOT already expect (E2E-TC54).
 *
 * Read through the ABC classification list because it is the one admin product
 * route in this module's own surface that pages deterministically and carries
 * `id` + `name` + `isSerialized` — everything the "add a product the bin did not
 * expect" flow needs, without reaching into the wider inventory suite's helpers.
 */
export function probeProductNotInBin(token, excludedProductIds, { serialized = false } = {}) {
    const excluded = new Set((excludedProductIds || []).map(Number));
    return cy
        .request({
            method: 'GET',
            url: `${api()}/abc-classification/products?page=1&page_size=100`,
            headers: H(token),
            failOnStatusCode: false,
        })
        .then((res) => {
            if (res.status !== 200) return null;
            const rows = ((unwrap(res) || {}).list) || [];
            const match = rows.find(
                (r) => !excluded.has(Number(r.id)) && Boolean(r.isSerialized) === Boolean(serialized)
            );
            return match ? { id: match.id, name: match.name } : null;
        });
}
