// cypress/support/InventoryAudit/auditSeed.js
//
// SELF-CONTAINED test data for the Inventory Audit suite.
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §6.2 (seeding)
// Authoring rules: cypress/qa/SKILL.md §6 convention 4 (disposable resources),
//                  §7 "Test-data management — never depend on data that should be
//                  there from yesterday".
//
// WHY THIS EXISTS
// ---------------
// The suite used to PROBE for an auditable bin: walk the tenant, find whichever bin
// happened to hold stock, and skip when none did. That is the pattern SKILL.md §6
// convention 8 sanctions — and it was the right call while nothing here could create
// inventory. But it made the suite hostage to whatever else lived on the tenant:
//
//   * a long-lived manual audit holding the only stocked bin took ~10 TCs out
//     (a live audit refuses a second one over the same scope — 409, the feature
//     working, and `liveAuditScopeFilter` correctly drops those bins);
//   * a bin holding ONE serial silently skipped every case needing two;
//   * a tenant with no non-serial stock skipped the whole pure-product family;
//   * and a WMS placement wipe skipped all 63 lifecycle TCs at once.
//
// None of those are defects, and none of them should be reported as coverage.
//
// So this module BUILDS what the suite needs, end to end, and removes it again:
//
//     PO  ->  receive  ->  bin  ->  place  ->  [tests run]  ->  unplace/delete
//
// Every step is an API call. Nothing here reads the tenant hoping to find something.
//
// WHAT IT OWNS, AND WHAT IT STILL CANNOT DO
// -----------------------------------------
// Owns: the PO, its products, the serialized units, the non-serial quantity, the
// warehouse branch, and every placement it makes. All of it is uniquely named per
// run and all of it is deleted in `after()`.
//
// Cannot: create a Category. `buildRamRow`/`buildLaptopRow` import against the two
// automation categories the tenant already carries ("RAM Automation Cat", "Laptop
// Automation Cat"), the same ones the PurchaseOrder suite depends on. If those are
// missing the seed reports it plainly rather than skipping silently — that is a
// tenant-setup problem, not a test outcome.
//
// COST: one Excel import + N scans + one check-in + ~7 location creates, about
// 20-30s per spec. That is the price of never again reporting a green run that was
// really an empty one.

import { apiCall, buildLaptopRow, buildRamRow, createExcelFile } from '../helpers/allPosHelpers';
import { importExcel } from '../helpers/incomingInventoryHelpers';
import { apiCheckIn, apiDeletePO, apiGetProductIdForPO, apiScanSerial } from '../helpers/poCloseHelpers';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  addQuantityToLocation,
  assignItemToLocation,
  listLocationItems,
  listLocationQuantities,
  unassignItem,
  unwrap,
} from './auditLifecycle';
import { deleteLocation, quickCreateBin } from './auditWarehouse';

/** Unique across runs AND across parallel specs. `Cypress._.uniqueId()` is neither. */
const stamp = () => `${Date.now()}${Cypress._.random(1000, 9999)}`;

/** How much of each family the audit suite needs to exercise every case. */
export const SEED_DEFAULTS = {
  /**
   * FOUR serials, not two. Several cases consume one for the duration of a test —
   * a serial is unplaced (`stageUnplacedSerial`), parked in a sibling
   * (`stageSerialInOtherBin`), or marked `Missing` by an approved shortage — and
   * their restores only drain in `afterEach`. Two would leave the next test with
   * one, which is exactly the starvation this module exists to end.
   */
  serials: 4,
  /**
   * TWENTY units of the non-serial product. Approving a shortage genuinely consumes
   * stock — that is the feature — and the inverse can only RE-ASSIGN, never
   * re-create. Twenty absorbs a whole run's shortage/overage approvals without the
   * pure-product family starving itself part-way through.
   */
  quantity: 20,
};

/**
 * Build the whole fixture: a PO carrying both product families, received into
 * stock, placed in a bin this module created.
 *
 * Yields a descriptor shaped like `probeStockedBin`'s, so a spec can swap one for
 * the other without touching its assertions:
 *
 *     { id, code, name, path, serials: string[], quantities: [...],
 *       productIds: { serialized, nonSerial }, poNumber, cleanup() }
 *
 * plus `siblingBin` — a second bin under the same parent, which the misplacement
 * and narrow-freeze cases need and which the tenant may not otherwise offer.
 *
 * Never throws for an environment reason: yields `null` when the tenant lacks the
 * automation categories, so a caller can report that specifically.
 */
export function seedAuditableBin(token, options = {}) {
  const serialCount = options.serials ?? SEED_DEFAULTS.serials;
  const quantity = options.quantity ?? SEED_DEFAULTS.quantity;
  const tag = stamp();
  const poNumber = `CY-AUD-${tag}`;
  const serials = Array.from({ length: serialCount }, (_, i) => `CYAUD${tag}S${i + 1}`);

  // Everything this run creates, newest first — see `teardown()`.
  const created = { poNumber, facilityId: null, binIds: [], serials: [], productIds: {} };

  Cypress.log({ name: 'audit-seed', message: `seeding PO ${poNumber}: ${serialCount} serial(s) + ${quantity} unit(s)` });

  // 1. One Excel import carrying BOTH families, so a single PO yields a bin that
  //    holds a serialized line and a non-serial line — the mixed-bin shape.
  const rows = [buildRamRow(toRamFixture(), tag, quantity)].concat(
    serials.map((s) => buildLaptopRow(toLaptopFixture(), tag, s))
  );
  const fileName = `CYAUD-${tag}.xlsx`;

  return createExcelFile(fileName, rows)
    .then(() => importExcel(fileName, poNumber))
    .then(() => apiGetProductIdForPO(poNumber, `${td.products.ram.memoryGeneration}-${tag}`))
    .then((nonSerialProductId) => {
      created.productIds.nonSerial = nonSerialProductId;
      return apiGetProductIdForPO(poNumber, `${td.products.laptop.modelNumber}-${tag}`).then(
        (serializedProductId) => {
          created.productIds.serialized = serializedProductId;
        }
      );
    })
    .then(() => {
      // 2. Receive both families. `check-in` moves the non-serial quantity
      //    Incoming -> Available; `scan` does the same per serial.
      apiCheckIn({ poNumber, productId: created.productIds.nonSerial, quantity });
      return serials.reduce(
        (chain, s) => chain.then(() => apiScanSerial(poNumber, s).then(() => created.serials.push(s))),
        cy.wrap(null, { log: false })
      );
    })
    .then(() => {
      // 3. A warehouse branch of our own: Facility -> ... -> two sibling Bins.
      //    Two, because the misplacement cases (E2E-TC26/TC27, MOB-TC14/TC17) and
      //    the narrow-freeze case (E2E-TC18) need a bin that is NOT the counted one,
      //    and one root delete removes the whole branch.
      const base = [`CYA${tag}`, `CYA${tag}Z`, `CYA${tag}A`, `CYA${tag}R`, `CYA${tag}B`, `CYA${tag}L`];
      return quickCreateBin(token, base.concat([`CYA${tag}N1`]))
        .then((r1) => {
          const primary = binFromQuickCreate(r1);
          if (!primary) return null;
          created.facilityId = rootIdOf(primary);
          created.binIds.push(primary.id);
          return quickCreateBin(token, base.concat([`CYA${tag}N2`])).then((r2) => {
            const sibling = binFromQuickCreate(r2);
            if (sibling) created.binIds.push(sibling.id);
            return { primary, sibling };
          });
        });
    })
    .then((bins) => {
      if (!bins || !bins.primary) {
        Cypress.log({ name: 'audit-seed', message: 'quick-create-bin refused — cannot build a scope' });
        return teardown(token, created).then(() => null);
      }
      // 4. Place the received stock into the primary bin.
      const place = created.serials.reduce(
        (chain, s) => chain.then(() => assignItemToLocation(token, bins.primary.id, s, { force: true })),
        cy.wrap(null, { log: false })
      );
      return place
        .then(() => addQuantityToLocation(token, bins.primary.id, created.productIds.nonSerial, quantity))
        .then((qtyRes) => {
          if (qtyRes.status >= 400) {
            // The quantity did not land. Serials still did, so the bin is usable for
            // the serialized half — say which half is missing rather than failing.
            Cypress.log({
              name: 'audit-seed',
              message: `quantity assign refused (${qtyRes.status}) — pure-product cases will skip`,
            });
          }
          return readBackFixture(token, bins, created, poNumber);
        });
    });
}

/**
 * Read the placed bin back through the same routes the probes use, so the
 * descriptor reflects what the WAREHOUSE holds rather than what we asked it to.
 * A seed that reports success on stock the WMS silently refused is worse than one
 * that fails.
 */
function readBackFixture(token, bins, created, poNumber) {
  return listLocationItems(token, bins.primary.id).then((itemsRes) => {
    const body = unwrap(itemsRes);
    const rows = Array.isArray(body) ? body : (body && body.items) || [];
    const placed = rows
      .filter((i) => String(i.itemStatus ?? i.status ?? 'Available') === 'Available')
      .map((i) => i.serial_number || i.serialNumber)
      .filter((s) => created.serials.includes(s));

    return req(token, `/location-assignments/${bins.primary.id}/quantities`).then((qRes) => {
      const qBody = unwrap(qRes);
      const quantities = (Array.isArray(qBody) ? qBody : (qBody && qBody.items) || []).filter(
        (q) => Number(q.quantity) > 0
      );
      Cypress.log({
        name: 'audit-seed',
        message: `seeded ${bins.primary.code}: ${placed.length} serial(s), ${quantities.length} quantity line(s)`,
      });
      return {
        id: bins.primary.id,
        code: bins.primary.code,
        name: bins.primary.code,
        path: bins.primary.path,
        serials: placed,
        quantities,
        productIds: created.productIds,
        poNumber,
        siblingBin: bins.sibling ? { id: bins.sibling.id, code: bins.sibling.code, path: bins.sibling.path } : null,
        created: true,
        cleanup: () => teardown(token, created),
      };
    });
  });
}

/**
 * Remove everything the seed created, in reverse dependency order.
 *
 * Best-effort throughout: teardown must never be the thing that fails a run, and a
 * half-removed fixture is still better than none. Order matters — a location cannot
 * be deleted while stock is filed in it, so the serials are unassigned first.
 */
export function teardown(token, created) {
  if (!created) return cy.wrap(null, { log: false });
  Cypress.log({ name: 'audit-seed', message: `tearing down ${created.poNumber}` });
  cy.log(`[audit-seed] teardown ${created.poNumber}: bins=${JSON.stringify(created.binIds)}`);

  // Unassign every serial this seed MINTED, then sweep each bin for anything else
  // filed there. The sweep matters because a test may have moved a serial between
  // the seeded bins, and a location refuses deletion while stock is in it — so a
  // single stray placement is enough to leave the whole branch behind.
  const unplace = (created.serials || []).reduce(
    (chain, s) => chain.then(() => unassignItem(token, s)),
    cy.wrap(null, { log: false })
  );

  const sweepBins = (created.binIds || []).reduce(
    (chain, binId) =>
      chain.then(() =>
        listLocationItems(token, binId).then((res) => {
          const body = unwrap(res);
          const rows = Array.isArray(body) ? body : (body && body.items) || [];
          const unplaceItems = rows
            .map((i) => i.serial_number || i.serialNumber)
            .filter(Boolean)
            .reduce((inner, s) => inner.then(() => unassignItem(token, s)), cy.wrap(null, { log: false }));

          // QUANTITIES TOO, not just items.
          //
          // `DELETE /locations/:id` refuses with 400 "Cannot delete this location
          // because items or quantities are directly assigned to it or its child
          // locations" — and the non-serial line counts. Sweeping only the serials
          // left the primary bin undeletable every run while the sibling (which
          // never held quantity) vanished cleanly, which is exactly the asymmetry
          // observed on QA 2026-08-25.
          return unplaceItems
            .then(() => listLocationQuantities(token, binId))
            .then((qRes) => {
              const qBody = unwrap(qRes);
              const lines = (Array.isArray(qBody) ? qBody : (qBody && qBody.items) || []).filter(
                (q) => Number(q.quantity) > 0
              );
              return lines.reduce(
                (inner, q) =>
                  inner.then(() =>
                    // A NEGATIVE delta unassigns; there is no dedicated remove route.
                    addQuantityToLocation(
                      token,
                      binId,
                      q.productId ?? q.product_id,
                      -Number(q.quantity)
                    )
                  ),
                cy.wrap(null, { log: false })
              );
            });
        })
      ),
    unplace
  );

  return sweepBins
    .then(() =>
      // Delete the BINS explicitly, then the root Facility.
      //
      // Deleting the facility alone does NOT cascade to its bins on this build —
      // verified on QA 2026-08-25, where four seeded bins survived a facility delete
      // and had to be removed one by one. Bins are what `listAllBins` surfaces and
      // what the probes trip over, so they are the ones that must go; the facility
      // delete that follows is best-effort tidying of the empty branch above them.
      (created.binIds || []).reduce(
        (chain, id) => chain.then(() => deleteLocation(token, id)),
        cy.wrap(null, { log: false })
      )
    )
    .then(() => (created.facilityId ? deleteLocation(token, created.facilityId) : null))
    .then(() => {
      // Deleting the PO removes its products and their items with it, so the serials
      // this run minted do not accumulate on the tenant run after run.
      if (created.poNumber) apiDeletePO(created.poNumber);
      return null;
    })
    .then(() => {
      // And the .xlsx the import was built from. It is gitignored so it never reaches
      // a commit, but without this it accumulates on disk one file per run — the
      // seeder should leave the working tree as it found it, not just the tenant.
      cy.task('deleteTestExcelFiles', null, { log: false });
      return null;
    });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const api = () => Cypress.env('API_BASE_URL');
const req = (token, path) =>
  cy.request({
    method: 'GET',
    url: `${api()}${path}`,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });

/** `buildRamRow` wants a flattened fixture; poCloseData nests under `products`. */
function toRamFixture() {
  return { categories: { ram: td.categories.ram }, ram: td.products.ram };
}
function toLaptopFixture() {
  return { categories: { laptop: td.categories.laptop }, laptop: td.products.laptop };
}

const binFromQuickCreate = (res) => {
  if (!res || res.status >= 400) return null;
  const body = unwrap(res);
  const bin = body && (body.binLocation || body.bin);
  if (!bin) return null;
  return { id: bin.id, code: bin.code, path: bin.path, parent: bin.parent };
};

/** The root Facility of a quick-created chain — deleting it removes the branch. */
function rootIdOf(bin) {
  let node = bin;
  while (node && node.parent) node = node.parent;
  return node ? node.id : null;
}
