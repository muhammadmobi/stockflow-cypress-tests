// cypress/support/InventoryAudit/auditWarehouse.js
//
// Prerequisite BUILDERS for the Inventory Audit specs — the layer that turns
// "skip, QA has nothing suitable" into "create it, use it, delete it".
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §6.2, §7
// Authoring rules: cypress/qa/SKILL.md §6 (convention 4, disposable resources)
//                  and §7 (test-data management — never depend on yesterday's data)
//
// WHY THIS EXISTS, AND WHERE IT STOPS
// -----------------------------------
// SKILL.md §6 convention 8 sanctions probe-then-skip so an ENVIRONMENT gap never
// reads as a product failure. That is right, and it stays. What it does not
// sanction is skipping a condition the suite can simply create: §7 says
// "disposable, uniquely-named resources per spec — never depend on data that
// should be there from yesterday". Everything in this file is the second case.
//
// So the pattern throughout is **probe, then build, then always tear down**:
//
//     ensureX(token) -> { ...descriptor, created: boolean, cleanup(): chain }
//
// `created: false` means the probe found something real and NOTHING will be torn
// down. `created: true` means this suite made it and owns removing it. A caller
// registers `cleanup` and stops caring which happened.
//
// WHAT IT DELIBERATELY DOES NOT BUILD
// -----------------------------------
//  - **Identity.** No Keycloak account can be created from a test. `resolveCountActor`
//    below works around the common case instead — see its note.
//  - **Stock.** Serials and quantities come from receiving, which is a different
//    module's flow entirely. Locations and containers are cheap and reversible;
//    inventory is neither, so the specs still probe for it.

import { listAllBins, unwrap } from './auditLifecycle';

const api = () => Cypress.env('API_BASE_URL');
const H = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const req = (method, token, path, body) =>
    cy.request({ method, url: `${api()}${path}`, headers: H(token), body, failOnStatusCode: false });

/** Unique across runs AND across parallel specs. `Cypress._.uniqueId()` is neither. */
const stamp = () => `${Date.now()}${Cypress._.random(1000, 9999)}`;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The `sub` claim of a bearer token — the id the backend knows the caller by.
 *
 * `normalizeKeycloakUser` (Backend/src/auth/keycloak-public.guard.ts) sets
 * `request.user.id = user.sub`, and `WorkerCountController.actor()` reads
 * `user.id` first. So `sub` IS the identity the count routes compare a bin's
 * `assignedUserId` against. Decoded locally rather than fetched: no endpoint
 * returns "who am I", and the claim is right there.
 *
 * Reads ONLY `sub`. Never log the token or any other claim.
 */
export function jwtSub(token) {
    try {
        const payload = String(token).split('.')[1];
        const json = decodeURIComponent(
            atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
                .split('')
                .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
                .join('')
        );
        return JSON.parse(json).sub || null;
    } catch (e) {
        return null;
    }
}

/**
 * Every role name a token carries, resolved the way the BACKEND resolves it.
 *
 * This is a deliberate mirror of `resolveTokenRoles`
 * (Backend/src/auth/keycloak-public.guard.ts:69) — realm roles PLUS the roles of
 * EVERY client in `resource_access`, flattened into one list — because that is
 * what `mapRolesToId` then reduces to a single `roleId`, and `AdminGuard` reads
 * only that. Reading the claims any other way would let a test disagree with the
 * guard it is testing.
 *
 * Reads role claims only; never logs the token.
 */
export function rolesInToken(token) {
    try {
        const payload = JSON.parse(atob(String(token).split('.')[1]));
        if (Array.isArray(payload.roles) && payload.roles.length) return payload.roles.map(String);
        const realm = (payload.realm_access && payload.realm_access.roles) || [];
        const client = Object.values(payload.resource_access || {}).flatMap((c) => (c && c.roles) || []);
        return [...realm, ...client].map(String);
    } catch (e) {
        return [];
    }
}

/**
 * Does this token resolve to the ADMIN role id, the way `AdminGuard` decides it?
 *
 * `mapRolesToId` (Backend/src/general/utils/role-utils.ts) PRIORITISES `admin`:
 * one client granting Admin makes the whole token an admin, whatever the other
 * clients say. That is not hypothetical here — the QA `user` account holds
 * `stockwise-app: User` but also `account-wise: Admin`, and the second one wins,
 * which is why it sails through StockWise's admin-only routes.
 */
export const tokenIsAdmin = (token) => rolesInToken(token).some((r) => String(r).toLowerCase() === 'admin');

/**
 * A token that the admin gate genuinely REFUSES — for the 403 columns.
 *
 * Tries `user` first (the natural choice), then `sales`. Either is fine: the
 * guard maps both to a non-ADMIN `roleId` and the assertion is about the refusal,
 * not about which non-admin role produced it. The fallback matters because a
 * "user" account can carry an Admin role on a DIFFERENT client and still be
 * admitted here (see `tokenIsAdmin`) — which is exactly the state this tenant is
 * in, and what made the 403 tests skip while a perfectly good `sales` account sat
 * unused in `cypress.env.json`.
 *
 * Yields `{ token, role }` or `null`, and never asserts — an environment with no
 * non-admin account at all is a skip, not a failure.
 */
export function resolveNonAdminActor(roles = ['user', 'sales']) {
    const next = (i) => {
        if (i >= roles.length) {
            Cypress.log({
                name: 'audit-fixture',
                message:
                    `resolveNonAdminActor: none of [${roles.join(', ')}] resolves to a non-admin token — ` +
                    'the 403 columns will skip. Declare an account whose roles map to USER or SALES.',
            });
            return null;
        }
        return cy.credentials(roles[i]).then(({ username, password }) => {
            if (!username || !password) return next(i + 1);
            return cy.login(username, password, { optional: true }).then((token) => {
                if (!token) return next(i + 1);
                if (tokenIsAdmin(token)) {
                    Cypress.log({
                        name: 'audit-fixture',
                        message:
                            `resolveNonAdminActor: the "${roles[i]}" account resolves to ADMIN ` +
                            `(roles: ${rolesInToken(token).join(', ')}) — trying the next role`,
                    });
                    return next(i + 1);
                }
                Cypress.log({ name: 'audit-fixture', message: `resolveNonAdminActor: using the "${roles[i]}" account` });
                return { token, role: roles[i] };
            });
        });
    };
    return next(0);
}

/**
 * An identity that can actually drive the worker count routes.
 *
 * THE PROBLEM: `04` and `06` skipped ENTIRELY — 93 tests — whenever no `user`-role
 * account resolved, because every count route needs a caller whose id matches the
 * bin's `assignedUserId`. On a checkout without a second credential that is the
 * whole of the bin-freeze, log-completeness and both product-family groups gone.
 *
 * THE OBSERVATION: `WorkerCountService.assertOwnBin` compares ids and NOTHING else
 * — there is no role check on the worker routes (verified against
 * worker-count.controller.ts / worker-count.service.ts on 2026-08-20). Bin
 * assignment validates against the AUDIT's own roster, which is whatever the create
 * call passed, and `inventory_audit_assignments` has no FK to the identity server.
 * So an audit can legitimately name the admin as its own worker.
 *
 * THE TRADE, STATED PLAINLY: driving the count as the admin proves the count FLOW,
 * not that a `user`-role account is permitted to perform it. Those are different
 * claims. So a real worker is always preferred when one resolves, and `isRealWorker`
 * is reported so the handful of tests that genuinely need a SECOND, non-admin
 * identity (ownership refusals, role gating) can still skip rather than pass
 * vacuously against a self-assignment.
 */
export function resolveCountActor(adminJwt) {
    return cy.credentials('user').then(({ username, password }) => {
        const fallback = () => {
            const id = jwtSub(adminJwt);
            if (!id) Cypress.log({ name: 'audit-fixture', message: 'resolveCountActor: no sub claim on the admin token — count cases will skip' });
            return {
                token: adminJwt,
                userId: id,
                userName: 'Cypress Admin (acting as worker)',
                isRealWorker: false,
                // `mobileViewRoutes` is registered under BOTH dashboardRoutes and
                // userDashboardRoutes (Frontend/src/routes/sections/dashboard.tsx),
                // so the handheld screen is reachable by an admin too — which is what
                // lets spec 06 run its UI against this fallback.
                sessionRole: 'admin',
                usable: Boolean(id),
            };
        };
        if (!username || !password) return fallback();
        return cy.login(username, password, { optional: true }).then((token) => {
            if (!token) return fallback();
            const id = jwtSub(token);
            if (!id) return fallback();
            return {
                token,
                userId: id,
                userName: String(username),
                isRealWorker: true,
                sessionRole: 'user',
                usable: true,
            };
        });
    });
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export const createLocation = (token, body) => req('POST', token, '/locations', body);
export const deleteLocation = (token, id) => req('DELETE', token, `/locations/${id}`);
export const listLocations = (token, qs = '?page=1&pageSize=500') => req('GET', token, `/locations${qs}`);

/** The id out of whichever envelope shape `POST /locations` answers with. */
const newLocationId = (res) => {
    const d = unwrap(res);
    return d && (d.id ?? (d.data && d.data.id));
};

/**
 * Create a full Facility→Zone→Area→Row→Bay→Level→Bin chain in one call.
 *
 * `POST /locations` enforces `isValidChain`: each child must be EXACTLY one step
 * below its parent, so `Zone -> Bin` is a 400 ("Invalid parent type: Zone -> Bin",
 * observed on QA 2026-08-20) and a bin needs all seven levels. `quick-create-bin`
 * builds the whole chain from a 7-segment path and prefixes each segment for its
 * type (`F-`, `Z-`, `A-`, `R-`, `B-`, `L-`, `BN-`), so the resulting bin path is
 * `F-a.Z-b.A-c.R-d.B-e.L-f.BN-g`.
 *
 * Segments must match `[A-Z0-9_-]+`.
 */
export function quickCreateBin(token, segments) {
    return req('POST', token, '/locations/quick-create-bin', { path: segments.join('.') });
}

/** The created bin `{ id, code, path }`, or null when the call was refused. */
const binFromQuickCreate = (res) => {
    if (res.status >= 400) return null;
    const body = unwrap(res);
    const bin = body && (body.binLocation || body.bin);
    if (!bin) return null;
    return { id: bin.id, code: bin.code, path: bin.path, parent: bin.parent };
};

/**
 * The created chain, root first: `[Facility, Zone, Area, Row, Bay, Level, Bin]`.
 *
 * `quick-create-bin` answers with the bin and its `parent` nested all the way up, so
 * every level is already in the response — no extra reads to find the Zone.
 */
const chainOf = (bin) => {
    const nodes = [];
    let node = bin;
    while (node) {
        nodes.unshift(node);
        node = node.parent;
    }
    return nodes;
};

/**
 * A disposable scope that can grow a NEW bin while an audit over it is live.
 *
 * The mid-audit fold-in (`AuditCountGenerationService.syncNewBinsIntoRunningAudits`,
 * called from `LocationService` on every location create) is the rule behind
 * ASG-TC20/TC21, and it can only be observed on a scope this suite may safely add
 * a bin to afterwards. Adding one to a bin the tenant already owns would leave
 * warehouse structure behind; building the whole branch means the teardown is a
 * single delete of the root facility, and QA is exactly as it was.
 *
 * Yields `{ facility, firstBin, addBin(), cleanup() }`, or `null` if the tenant
 * refuses the create — never asserts.
 *
 *   addBin()  -> creates a SECOND bin under the same Level and yields it. This is
 *                the step that must happen while the audit is live: the audit is
 *                scoped to the FACILITY, so the new bin is inside its scope and the
 *                sync folds it in.
 */
export function ensureGrowableScope(token) {
    const tag = stamp();
    const base = [`CYG${tag}`, `CYG${tag}Z`, `CYG${tag}A`, `CYG${tag}R`, `CYG${tag}B`, `CYG${tag}L`];
    return quickCreateBin(token, base.concat([`CYG${tag}N1`])).then((res) => {
        const first = binFromQuickCreate(res);
        if (!first) {
            Cypress.log({
                name: 'audit-fixture',
                message: `ensureGrowableScope: quick-create-bin returned ${res.status} — the late-bin cases will skip`,
            });
            return null;
        }
        const facility = chainOf(first)[0];
        if (!facility || !facility.id) {
            Cypress.log({ name: 'audit-fixture', message: 'ensureGrowableScope: no facility in the created chain' });
            return null;
        }
        let seq = 1;
        return {
            facility: { id: facility.id, code: facility.code, path: facility.path },
            firstBin: first,
            /** A further bin under the SAME Level — the "created mid-audit" one. */
            addBin() {
                seq += 1;
                return quickCreateBin(token, base.concat([`CYG${tag}N${seq}`])).then(binFromQuickCreate);
            },
            created: true,
            // One delete removes the whole branch this suite added.
            cleanup: () => deleteLocation(token, facility.id),
        };
    });
}

/**
 * Two sibling BINS under one parent Level, created if the tenant has none.
 *
 * The "freeze is narrow" assertion (E2E-TC18) and every misplacement column need a
 * second bin that is NOT the one being counted. Two `quick-create-bin` calls sharing
 * their first six segments put both bins under the same Level, so they are siblings
 * by construction rather than by luck.
 */
export function ensureSiblingBins(token, existing) {
    if (existing && existing.first && existing.second) {
        return cy.wrap(
            { ...existing, created: false, cleanup: () => cy.wrap(null, { log: false }) },
            { log: false }
        );
    }
    const tag = stamp();
    const base = [`CY${tag}`, `CY${tag}Z`, `CY${tag}A`, `CY${tag}R`, `CY${tag}B`, `CY${tag}L`];
    return quickCreateBin(token, base.concat([`CY${tag}N1`])).then((r1) => {
        const first = binFromQuickCreate(r1);
        if (!first) {
            Cypress.log({ name: 'audit-fixture', message: `ensureSiblingBins: quick-create-bin returned ${r1.status} — sibling cases will skip` });
            return null;
        }
        return quickCreateBin(token, base.concat([`CY${tag}N2`])).then((r2) => {
            const second = binFromQuickCreate(r2);
            if (!second) {
                Cypress.log({ name: 'audit-fixture', message: `ensureSiblingBins: second bin returned ${r2.status} — sibling cases will skip` });
                return null;
            }
            const facilityId = chainOf(first)[0] && chainOf(first)[0].id;
            return {
                parent: String(first.path).split('.').slice(0, -1).join('.'),
                first: { id: first.id, code: first.code, path: first.path },
                second: { id: second.id, code: second.code, path: second.path },
                created: true,
                // Deleting the root facility removes the branch this suite added.
                cleanup: () =>
                    facilityId ? deleteLocation(token, facilityId) : cy.wrap(null, { log: false }),
            };
        });
    });
}

/**
 * Two locations whose PATHS share a string prefix without being ancestor and
 * descendant — `…Z-CYP1` beside `…Z-CYP12` (SW-IAUD-API-TC24).
 *
 * The regression guard for the dot-separated WMS path: a `/` separator once made
 * every non-bin scope resolve zero bins, and the original verification passed only
 * because the seed used the bug's own separator. Waiting for a tenant to happen to
 * hold such a pair is why the guard had never run.
 *
 * Built so the EXPECTED ANSWER IS KNOWN, which a probed pair could never give:
 * the LONGER zone owns a bin (via the full chain), the SHORTER one owns none. So a
 * prefix match that ignores the separator reports 1 where the answer is 0.
 */
export function ensurePrefixSiblingLocations(token) {
    const tag = stamp();
    // The longer zone code is the shorter one plus a trailing character.
    const shortCode = `CYP${tag}`;
    return quickCreateBin(token, [
        `CYF${tag}`,
        `${shortCode}2`,
        `CYA${tag}`,
        `CYR${tag}`,
        `CYB${tag}`,
        `CYL${tag}`,
        `CYN${tag}`,
    ]).then((res) => {
        const bin = binFromQuickCreate(res);
        if (!bin) {
            Cypress.log({ name: 'audit-fixture', message: `ensurePrefixSiblingLocations: quick-create-bin returned ${res.status}` });
            return null;
        }
        const chain = chainOf(bin);
        const facility = chain[0];
        const longerZone = chain[1];
        if (!facility || !longerZone) {
            Cypress.log({ name: 'audit-fixture', message: 'ensurePrefixSiblingLocations: could not resolve the created chain' });
            return null;
        }
        // The SHORTER zone is created on its own so it stays childless — a plain
        // Facility -> Zone create, which `isValidChain` allows.
        return createLocation(token, {
            name: `CY Prefix Zone ${tag}`,
            code: `Z-${shortCode}`,
            type: 'Zone',
            parentId: facility.id,
        }).then((z) => {
            const shortId = newLocationId(z);
            if (!shortId) {
                Cypress.log({ name: 'audit-fixture', message: `ensurePrefixSiblingLocations: short zone returned ${z.status}` });
                return null;
            }
            return {
                shorter: {
                    id: shortId,
                    code: `Z-${shortCode}`,
                    path: `${facility.path}.Z-${shortCode}`,
                },
                longer: { id: longerZone.id, code: longerZone.code, path: longerZone.path },
                longerBinId: bin.id,
                created: true,
                cleanup: () => deleteLocation(token, facility.id),
            };
        });
    });
}

/**
 * A soft-deleted location id (SW-IAUD-API-TC22 / TC39).
 *
 * Created and deleted in one step: the state under test IS "deleted", so there is
 * nothing to tear down afterwards — the row is already in the recycle bin, which is
 * exactly where `GET /locations/deleted` expects to find things.
 */
export function ensureDeletedLocation(token) {
    const tag = stamp();
    return createLocation(token, {
        name: `CY Deleted Scope ${tag}`,
        code: `CYDEL-${tag}`,
        type: 'Facility',
    }).then((res) => {
        const id = newLocationId(res);
        if (!id) {
            Cypress.log({ name: 'audit-fixture', message: `ensureDeletedLocation: create returned ${res.status}` });
            return null;
        }
        return deleteLocation(token, id).then((del) => {
            if (del.status >= 400) {
                Cypress.log({ name: 'audit-fixture', message: `ensureDeletedLocation: delete returned ${del.status}` });
                return null;
            }
            return { id, code: `CYDEL-${tag}`, created: true };
        });
    });
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export const createContainer = (token, body) => req('POST', token, '/containers', body);
export const deleteContainer = (token, id) => req('DELETE', token, `/containers/${id}`);
export const listContainerTypes = (token) => req('GET', token, '/container-types');

/**
 * A container parked in the given bin, created if none is.
 *
 * Needs a container TYPE, which this suite does not own — if the tenant has none,
 * yield null and let the caller skip rather than inventing warehouse taxonomy.
 */
export function ensureContainerInBin(token, binLocationId, existing) {
    if (existing && existing.container) {
        return cy.wrap({ ...existing, created: false, cleanup: () => cy.wrap(null, { log: false }) }, { log: false });
    }
    return listContainerTypes(token).then((types) => {
        const body = unwrap(types);
        const rows = Array.isArray(body) ? body : (body && (body.items || body.list)) || [];
        const type = rows.find((t) => !t.isDeleted);
        if (!type) {
            Cypress.log({ name: 'audit-fixture', message: 'ensureContainerInBin: tenant has no container type — container cases will skip' });
            return null;
        }
        const tag = stamp();
        return createContainer(token, {
            code: `CYC-${tag}`,
            containerTypeId: type.id,
            locationId: binLocationId,
        }).then((res) => {
            const d = unwrap(res);
            const id = d && (d.id ?? (d.data && d.data.id));
            if (!id) {
                Cypress.log({ name: 'audit-fixture', message: `ensureContainerInBin: create returned ${res.status}` });
                return null;
            }
            return {
                bin: { id: binLocationId },
                container: { id, code: `CYC-${tag}` },
                created: true,
                cleanup: () => deleteContainer(token, id),
            };
        });
    });
}

// ---------------------------------------------------------------------------
// Quantity-tracked (non-serial) stock
// ---------------------------------------------------------------------------

/**
 * A non-serial product holding at least `units` on hand.
 *
 * Pages the catalogue rather than reading the first screenful: on this tenant only
 * THREE of 8,878 products are non-serial with any stock at all, and none of them is
 * in the first 50 rows alphabetically. Bounded to `maxPages` so a cold `before()`
 * cannot walk 30 pages.
 */
export function probeNonSerialProduct(token, units = 1, maxPages = 8) {
    const best = { row: null };
    const page = (n) => {
        if (n > maxPages) return best.row;
        return req('GET', token, `/abc-classification/products?page=${n}&page_size=300`).then((res) => {
            const payload = unwrap(res) || {};
            const list = payload.list || [];
            list
                .filter((p) => !p.isSerialized && Number(p.onHandQuantity) >= units)
                .forEach((p) => {
                    if (!best.row || Number(p.onHandQuantity) > Number(best.row.onHandQuantity)) {
                        best.row = { id: p.id, name: p.name, onHandQuantity: Number(p.onHandQuantity) };
                    }
                });
            const pages = (payload.pagination && payload.pagination.pages) || 1;
            if (!list.length || n >= pages) return best.row;
            return page(n + 1);
        });
    };
    return page(1);
}

/**
 * Put non-serial stock INTO a bin, so the pure-product half of the plan has a line
 * to count.
 *
 * This is the single largest unblocker in the module: 22 TCs across `04`, `06` and
 * the audit API skip for want of one quantity-tracked line in the audited bin.
 *
 * `POST /location-assignments/:id/quantities` ASSIGNS existing unassigned stock — it
 * does not create any — so the request is capped at what the product actually holds
 * and refuses with "Cannot assign N — only M unassigned" otherwise. The stager asks
 * for `units`, and on refusal falls back to 1 rather than giving up, because one line
 * is all most of these TCs need.
 *
 * ⚠️ READ BEFORE RAISING THE COUNT. Approving a SHORTAGE genuinely consumes a unit —
 * that is the feature — and the suite's inverse (`addQuantityToLocation(+1)`) only
 * RE-ASSIGNS stock, it cannot re-create it. So a run of the shortage-approval cases
 * lowers the product's on-hand by one for good. With ~6 units that is a handful of
 * runs before the group starves again; seeding ~20 units is what makes it durable.
 */
/**
 * Pull a product's quantity units back out of OTHER bins, so they can be assigned
 * to the one under test. Yields what was reclaimed, for restoration.
 *
 * `POST /location-assignments/:id/quantities` can only assign stock that is
 * currently UNASSIGNED — "Cannot assign N — only M unassigned"
 * (direct-location-assignment.services.ts:719). So a product whose whole on-hand
 * count is already parked in some bin cannot be staged anywhere, however much of
 * it exists. On this tenant the one non-serial product with stock holds 6 units,
 * of which an earlier run had left 3 sitting in a bin — which is why staging kept
 * degrading to a single unit and the pure-product group skipped.
 *
 * Only bins OTHER than the target are touched, and every reclaim is paired with
 * the assignment that puts it back.
 */
function reclaimQuantityFromOtherBins(token, productId, binLocationId, needed) {
    return listAllBins(token).then((bins) => {
        const others = bins.filter((b) => Number(b.id) !== Number(binLocationId));
        const taken = [];
        const step = (i) => {
            const got = taken.reduce((n, t) => n + t.units, 0);
            if (i >= others.length || got >= needed) return taken;
            const loc = others[i];
            return req('GET', token, `/location-assignments/${loc.id}/quantities`).then((res) => {
                const body = unwrap(res);
                const rows = Array.isArray(body) ? body : (body && body.items) || [];
                const row = rows.find((q) => Number(q.productId) === Number(productId) && Number(q.quantity) > 0);
                if (!row) return step(i + 1);
                const want = Math.min(Number(row.quantity), needed - got);
                return req('POST', token, `/location-assignments/${loc.id}/quantities`, {
                    productId,
                    delta: -want,
                }).then((r) => {
                    if (r.status < 400) taken.push({ locationId: loc.id, units: want });
                    return step(i + 1);
                });
            });
        };
        return cy.wrap(null, { log: false }).then(() => step(0));
    });
}

export function ensureQuantityInBin(token, binLocationId, units = 5) {
    return probeNonSerialProduct(token, 1).then((product) => {
        if (!product) {
            Cypress.log({
                name: 'audit-fixture',
                message: 'ensureQuantityInBin: no non-serial product holds stock — pure-product cases will skip',
            });
            return null;
        }
        const assign = (delta) =>
            req('POST', token, `/location-assignments/${binLocationId}/quantities`, {
                productId: product.id,
                delta,
            });
        // What the bin ALREADY holds counts toward the target. Asking for the full
        // `units` on top of an existing line over-reaches the product's on-hand
        // count, the assign is refused, and the fallback then drops the bin to a
        // single unit — worse than doing nothing. Verified on QA 2026-08-20: BN-4
        // held 3 of the product's 6 units, so a request for 5 more could not be met.
        return req('GET', token, `/location-assignments/${binLocationId}/quantities`).then((existingRes) => {
        const existingBody = unwrap(existingRes);
        const existingRows = Array.isArray(existingBody) ? existingBody : (existingBody && existingBody.items) || [];
        const alreadyHere = existingRows
            .filter((q) => Number(q.productId) === Number(product.id))
            .reduce((n, q) => n + Number(q.quantity || 0), 0);
        const target = Math.max(1, Math.min(units, Number(product.onHandQuantity)));
        const wanted = Math.max(0, target - alreadyHere);
        if (wanted === 0) {
            // Already at or above the target — nothing to stage, nothing to undo.
            Cypress.log({
                name: 'audit-fixture',
                message: `ensureQuantityInBin: bin already holds ${alreadyHere} unit(s) of ${product.name} — no staging needed`,
            });
            return {
                productId: product.id,
                productName: product.name,
                units: alreadyHere,
                locationId: binLocationId,
                created: false,
                cleanup: () => cy.wrap(null, { log: false }),
            };
        }
        // Free up enough of this product FIRST. Units stranded in another bin by an
        // earlier run are the usual reason a full-size assign is refused, and
        // degrading to one unit is what starved the pure-product group: the first
        // approved shortage consumes that unit, and every later case then meets an
        // `expectedQuantity: 0` line and skips.
        return reclaimQuantityFromOtherBins(token, product.id, binLocationId, wanted).then((reclaimed) => {
        const putBack = () =>
            (reclaimed || []).reduce(
                (acc, t) =>
                    acc.then(() =>
                        req('POST', token, `/location-assignments/${t.locationId}/quantities`, {
                            productId: product.id,
                            delta: t.units,
                        })
                    ),
                cy.wrap(null, { log: false })
            );
        return assign(wanted).then((res) => {
            if (res.status < 400) {
                return {
                    productId: product.id,
                    productName: product.name,
                    units: wanted,
                    locationId: binLocationId,
                    created: true,
                    // Unassign what we assigned, THEN return whatever was reclaimed
                    // to the bin it came from, so the tenant ends where it started.
                    cleanup: () => assign(-wanted).then(() => putBack()),
                };
            }
            // "Cannot assign N — only M unassigned": take M rather than dropping to
            // one. The message carries the number, so the retry is exact instead of
            // minimal — one unit is the amount that starves the shortage cases.
            const free = Number(
                (String(res.body?.error?.message ?? '').match(/only\s+(-?\d+)\s+unassigned/i) || [])[1]
            );
            if (Number.isFinite(free) && free >= 1 && free < wanted) {
                return assign(free).then((some) => {
                    if (some.status >= 400) return putBack().then(() => null);
                    return {
                        productId: product.id,
                        productName: product.name,
                        units: free,
                        locationId: binLocationId,
                        created: true,
                        cleanup: () => assign(-free).then(() => putBack()),
                    };
                });
            }
            if (wanted === 1) {
                Cypress.log({
                    name: 'audit-fixture',
                    message: `ensureQuantityInBin: assign refused (${res.status}) — pure-product cases will skip`,
                });
                return putBack().then(() => null);
            }
            return assign(1).then((one) => {
                if (one.status >= 400) {
                    Cypress.log({
                        name: 'audit-fixture',
                        message: `ensureQuantityInBin: assign refused (${one.status}) — pure-product cases will skip`,
                    });
                    return putBack().then(() => null);
                }
                return {
                    productId: product.id,
                    productName: product.name,
                    units: 1,
                    locationId: binLocationId,
                    created: true,
                    cleanup: () => assign(-1).then(() => putBack()),
                };
            });
        });
        });
        });
    });
}
