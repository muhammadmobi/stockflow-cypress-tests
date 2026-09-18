/**
 * Asset ID → Search Life Cycle — API Tests (SW-AIDL-API-TC01..TC31)
 * =============================================================================
 * Mirrors:  cypress/e2e/AssetID/SearchLifecycle/01-SearchLifecycleTests.cy.js
 * Backend:  Backend/src/modules/product/product.controller.ts:1850-1864
 *           Backend/src/modules/product/product-asset-id.service.ts
 *             getAssetIdLifecycle (:2552-3227)
 * Plan:     cypress/qa/testPlans/assetId/sub/search-lifecycle-plan.md
 *
 * -----------------------------------------------------------------------------
 *   Endpoint exercised
 * -----------------------------------------------------------------------------
 *   GET /products/asset-id/lifecycle/:assetId                          AuthGuard
 *
 * Only one route — but this is the module's READ screen, so a spec that only
 * drove that route would be nearly worthless. Every other route in this file is
 * driven as a FIXTURE: the suite performs a real inventory operation and then
 * asserts the lifecycle reports it. The operations covered are import, stock-in
 * (scan), asset-ID generation, disassembly, assembly, status change, work-order
 * reservation, stock-out, restock, work-order stock-out, container assignment
 * and direct location assignment.
 *
 * -----------------------------------------------------------------------------
 *   Confirmed code facts this suite is designed around (read from the service)
 * -----------------------------------------------------------------------------
 *   1. `timeline` is a UNION of exactly THREE queries, and which one an
 *      operation lands in is the whole game:
 *        AUDIT            auditTrail  entityType='Item'      entityID = serial (EXACT)
 *        WAREHOUSE_AUDIT  auditTrail  entityType='Container' diff.serialNumber = serial
 *        MOVEMENT         inventoryMovements  serialNumber = serial
 *      Anything written under any other entityType is invisible here.
 *   2. CONFIRMED DEFECT — a direct-to-bin assignment is invisible twice over.
 *      `currentPlacement` INNER JOINs `containers` on `ci.container_id`, but a
 *      location assignment writes `container_items` with container_id = NULL,
 *      so the join drops it; and its audit row is entityType='Location', which
 *      neither timeline query reads. TC22 and TC23 pin both halves. A container
 *      assignment (TC20) is the passing column of the same decision table, so
 *      the pair proves the defect is in the LOCATION path specifically.
 *   3. A stock-out's MOVEMENT action is the REASON ('Sold'), not 'STOCKOUT' —
 *      `movementType: reason`. 'STOCKOUT' appears only on the AUDIT entry.
 *   4. CONFIRMED DEFECT — `generate-from-po` writes NO inventoryMovement, so a
 *      generated asset's cost never reaches the Timeline tab. `recordMovement` is
 *      called only in the single-serial `asset-id/generate` route (:776); the
 *      batch route performs a real stock-in (all three quantity counters move,
 *      the PO cost is copied onto the item) and records nothing. Verified live: a
 *      fresh asset's whole timeline is one entry, AUDIT / ASSET_ID_ITEM_CREATE.
 *      The UI is BUILT to show cost here — AssetIdSearch.tsx :72 renders
 *      `Cost: X.XX` from a movement's `details.cost` — so that line is dead code
 *      today. TC09 pins the missing movement, TC29 the cost consequence.
 *   5. The fix needs TWO changes. Adding the movement is not enough:
 *      `AuditService.recordMovement` defaults `cost = 0` and never looks the
 *      value up (audit.service.ts :137, :163) — the caller must pass it, and no
 *      asset-id caller does, so even the single-serial route records a zero-cost
 *      movement. TC29 verifies the cost IS correctly inherited by reading it back
 *      from the Asset Lifecycle Report, then pins that the lifecycle exposes none.
 *      Child cost IS exposed here, on disassembledComponents[].cost — 0 by design.
 *   6. The per-item audit action is ASSET_ID_ITEM_CREATE. Its sibling
 *      ASSET_ID_BATCH_GENERATE is written with entityID = the PO NUMBER, so it
 *      lands on the PO and never reaches an item's timeline.
 *   7. Lookup folds case on both key columns and, when one string matches one
 *      row's assetId AND a different row's serialNumber, prefers the assetId hit
 *      via `ORDER BY CASE WHEN LOWER(assetId)=LOWER($1) THEN 0 ELSE 1 END`.
 *      That tie-break is NOT reachable through the public API — no route lets a
 *      caller choose an asset ID, so no seed can make one row's assetId equal
 *      another row's serial. TC07 covers the branch that IS reachable and says
 *      so; the tie-break itself is recorded as out of scope in the sub-plan.
 *   8. This route does NOT use the `200 + success:false` envelope-failure
 *      convention that the rest of the module uses — it throws NotFound /
 *      BadRequest, so the wire status IS the contract. Hence expectLifecycleOk()
 *      asserts 200 exactly rather than `< 300`.
 *   9. Work-order linkage is REGEX-SCRAPED out of audit actionType and movement
 *      description (`/WORK ORDER\s+([A-Z0-9-]+)/i`), not joined. TC15/TC19 drive
 *      a real work order end to end because that is the only thing that would
 *      catch an upstream wording change.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/AssetID/assetIdData.json';
import {
  apiDeletePO,
  apiResolveCategoryIdByName,
} from '../../../support/helpers/poCloseHelpers';
import {
  createContainerTypeViaApi,
  deleteContainerTypeViaApi,
  deleteContainerViaApi,
  disposableTypeName,
  emptyContainerViaApi,
} from '../../../support/helpers/wmsContainerHelpers';
import { createContainerWithCapacity } from '../../../support/helpers/containerLocationHelpers';
import {
  aidAssignSerialToContainer,
  aidAssignSerialToLocation,
  aidCancelWorkOrder,
  aidData,
  aidGenerateSingle,
  aidLifecycle,
  aidMarkStatus,
  aidParkContainerAtLocation,
  aidReassemblyLink,
  aidRestockSerial,
  aidScanIntoWorkOrder,
  aidStockOutSerial,
  aidUnassignSerialFromLocation,
  aidUnauthenticated,
  aidWorkOrderStockOut,
  disassembledOf,
  expectLifecycleOk,
  placementOf,
  reassembledOf,
  reassemblyTargetsOf,
  readAssetLifecycleRow,
  readPoQuantities,
  seedAssetIdPo,
  seedDisassemblyChildren,
  seedGeneratedAssetIds,
  seedWorkOrder,
  timelineEntries,
  timelineOf,
  workOrdersOf,
} from '../../../support/helpers/assetIdHelpers';

const {
  createDisposableBinChain,
  deleteLocationViaApi,
} = require('../../../support/helpers/wmsLocationHelpers');

const LC = data.lifecycle;

describe('Asset ID Search Life Cycle API', () => {
  const stamp = `AIDL-${Date.now()}`;
  const po = `PO-AIDL-${Date.now()}`;

  // Serials imported through Excel and scanned to Available. They carry NO
  // asset ID, which is what makes them the "imported, not generated" partition
  // (TC11) and the disassembly / assembly parents for the lineage TCs.
  const importedSerial = `SN-AIDL-I-${Date.now()}`;
  const disassemblyParent = `SN-AIDL-DP-${Date.now()}`;
  const assemblyParent = `SN-AIDL-AP-${Date.now()}`;
  const stampTargetSerial = `SN-AIDL-ST-${Date.now()}`;

  let laptopCategoryId;
  let laptopProductId;
  let ramProductId;
  let poUnitCost;

  // Read-only asset IDs, generated once. Only tests that do NOT mutate state
  // may use these; everything else mints its own inside the test body.
  let readOnlyAssetId;

  // Disposables, torn down in after().
  const createdWorkOrderIds = [];
  const createdLocationIds = [];
  let containerTypeId;
  let containerId;
  let containerCode;
  let binId;
  let binPath;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');

    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });

    seedAssetIdPo({
      td,
      poNumber: po,
      stamp,
      serials: [importedSerial, disassemblyParent, assemblyParent, stampTargetSerial],
    })
      .then((seed) => {
        laptopProductId = seed.laptopProductId;
        ramProductId = seed.ramProductId;
        // The PO's unit cost is the oracle for TC29. Reading it from the
        // incoming-inventory listing rather than from the fixture is what makes
        // the assertion independent of the Excel builder's defaults.
        return readPoQuantities(po, laptopProductId);
      })
      .then((q) => {
        poUnitCost = q.cost;
        return seedGeneratedAssetIds({
          poNumber: po,
          categoryId: laptopCategoryId,
          productId: laptopProductId,
          quantity: 1,
        });
      })
      .then((ids) => {
        [readOnlyAssetId] = ids;
      });

    // One disposable container, PARKED in one disposable bin. Parking matters:
    // currentPlacement reads locationPath off the CONTAINER's location, so an
    // unparked container yields `locationPath: null` and TC20's location
    // assertion would pass for the wrong reason. The bin chain is therefore
    // built FIRST, so the container can be parked as soon as it exists.
    createDisposableBinChain()
      .then((chain) => {
        binId = chain.bin.id;
        binPath = chain.bin.path;
        Object.values(chain).forEach((loc) => createdLocationIds.push(loc.id));
        return createContainerTypeViaApi(disposableTypeName('AIDL'));
      })
      .then((type) => {
        containerTypeId = type?.id ?? type;
        return createContainerWithCapacity(containerTypeId, data.container.maxItemsRoomy);
      })
      .then((container) => {
        containerId = container?.id;
        containerCode = container?.code;
        return aidParkContainerAtLocation({ containerId, locationId: binId });
      })
      .then((res) => {
        expect(res.status, 'seeding: the container must be parked at the bin').to.be.lessThan(300);
      });
  });

  beforeEach(() => {
    cy.authSession('admin');
    // The visit is not decoration: apiCall() reads the bearer out of the app
    // origin's sessionStorage via cy.getAuthToken(), and cy.session alone does
    // not repopulate it. Without this, every request after the first test 401s.
    cy.visit('/');
  });

  after(() => {
    // Order matters: work orders release their reservations, the container must
    // be emptied before it can be deleted, and locations cannot be deleted
    // while a container still points at them. The PO goes last.
    createdWorkOrderIds.forEach((id) => aidCancelWorkOrder(id));
    if (containerId) {
      emptyContainerViaApi(containerId);
      deleteContainerViaApi(containerId);
    }
    if (containerTypeId) deleteContainerTypeViaApi(containerTypeId);
    createdLocationIds
      .slice()
      .reverse()
      .forEach((id) => deleteLocationViaApi(id));
    apiDeletePO(po);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. The lookup contract
  // ══════════════════════════════════════════════════════════════════════════

  // EP — no-auth partition
  it('SW-AIDL-API-TC01: GET /products/asset-id/lifecycle/:assetId without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated(
      'GET',
      `/products/asset-id/lifecycle/${encodeURIComponent(readOnlyAssetId)}`,
    ).then((res) => {
      expect(
        res.status,
        'the lifecycle exposes an item\'s whole history, so an unauthenticated caller must never reach it',
      ).to.equal(401);
    });
  });

  // Use case — main flow: the identifier a worker scans off a printed label
  it('SW-AIDL-API-TC02: a generated asset resolves by its asset ID', { tags: ['@smoke'] }, () => {
    aidLifecycle(readOnlyAssetId).then((res) => {
      const payload = expectLifecycleOk(res, 'a freshly generated asset ID must resolve');
      expect(payload.searchTerm, 'the response echoes the trimmed search term').to.equal(readOnlyAssetId);
      expect(payload.item.assetId, 'the resolved item is the one that was asked for').to.equal(readOnlyAssetId);
      expect(payload.item.status, 'generation stocks the item in as Available').to.equal(
        data.statuses.available,
      );
    });
  });

  // EP — the OTHER key column the same query matches on
  it('SW-AIDL-API-TC03: a serial number with no asset ID resolves through the serial branch', { tags: ['@regression'] }, () => {
    // generate-from-po writes the asset ID into BOTH columns, so this asset's
    // serial IS its asset ID. `importedSerial` is the honest serial-only case:
    // it has no asset ID at all, so resolving it can only have gone through the
    // serialNumber branch of the OR.
    aidLifecycle(importedSerial).then((res) => {
      const payload = expectLifecycleOk(res, 'a serial with no asset ID must still resolve');
      expect(payload.item.serialNumber, 'the serial branch of the lookup returns the right row').to.equal(
        importedSerial,
      );
    });
  });

  // Error guessing — both sides of the comparison are LOWER()-folded, so a
  // label scanned in the wrong case must still resolve. A worker retyping an ID
  // by hand is the realistic failure mode.
  it('SW-AIDL-API-TC04: the lookup is case-insensitive', { tags: ['@regression'] }, () => {
    aidLifecycle(readOnlyAssetId.toLowerCase()).then((lower) => {
      const lowerPayload = expectLifecycleOk(lower, 'a lower-cased asset ID must resolve');
      return aidLifecycle(readOnlyAssetId.toUpperCase()).then((upper) => {
        const upperPayload = expectLifecycleOk(upper, 'an upper-cased asset ID must resolve');
        expect(
          lowerPayload.item.serialNumber,
          'case folding must land both spellings on the same physical unit',
        ).to.equal(upperPayload.item.serialNumber);
      });
    });
  });

  // EP — invalid partition (nothing matches either column)
  it('SW-AIDL-API-TC05: an unknown identifier returns 404, not an empty envelope', { tags: ['@regression'] }, () => {
    aidLifecycle(LC.identifier.epUnknown).then((res) => {
      expect(
        res.status,
        'unlike the rest of the module this route throws, so an unknown id is a real 404',
      ).to.equal(404);
      const message = JSON.stringify(res.body || {});
      expect(message, 'the error names the term that was searched for').to.contain(
        LC.identifier.epUnknown,
      );
    });
  });

  // BVA — lower boundary of the trimmed-length partition. The service trims
  // BEFORE the empty check, so whitespace is the boundary value, not merely
  // another invalid string.
  it('SW-AIDL-API-TC06: a whitespace-only identifier is rejected as blank', { tags: ['@regression'] }, () => {
    aidLifecycle(LC.identifier.epBlank).then((res) => {
      expect(res.status, 'a blank identifier must be refused before any query runs').to.equal(400);
      expect(aidData(res)?.item, 'no item may be returned for a blank identifier').to.be.undefined;
    });
  });

  // Decision table — the two branches of the lookup's OR, on a row where the
  // two key columns DISAGREE:
  //   column A: the string is this row's assetId       → matches, row returned
  //   column B: the string is this row's serialNumber  → covered by TC03
  //
  // NOT the ORDER BY tie-break. That fires only when one string is one row's
  // assetId AND a DIFFERENT row's serialNumber, and no public route lets a
  // caller choose an asset ID — so no seed can construct it. Recorded as out of
  // scope in the sub-plan §3.2 rather than left as a title that overstates what
  // this test proves.
  it('SW-AIDL-API-TC07: a stamped asset ID resolves to the serial it was stamped onto', { tags: ['@regression'] }, () => {
    // Stamping an existing serial keeps the SERIAL and adds a DIFFERENT asset
    // ID — the only route in the module that produces a row where the two key
    // columns disagree, which is what makes the assetId branch observable at all.
    aidGenerateSingle({
      serialNumber: stampTargetSerial,
      parentSerialNumber: `PARENT-AIDL-${Date.now()}`,
    }).then((stampRes) => {
      expect(stampRes.status, 'stamping an Available serial must succeed').to.be.lessThan(300);
      const stampedAssetId = aidData(stampRes)?.assetId;
      expect(stampedAssetId, 'the stamp must return the asset ID it wrote').to.be.a('string').and.not.be.empty;

      // Asking for the asset ID must return the row it was stamped onto, not
      // some other row that happens to carry it as a serial.
      return aidLifecycle(stampedAssetId).then((res) => {
        const payload = expectLifecycleOk(res, 'the stamped asset ID must resolve');
        expect(payload.item.assetId, 'the assetId branch is the one that matched').to.equal(stampedAssetId);
        expect(
          payload.item.serialNumber,
          'the row returned is the one the asset ID was stamped onto — the two columns differ here, so a lookup that only searched serialNumber would have 404d',
        ).to.equal(stampTargetSerial);
      });
    });
  });

  // Use case — the payload contract every consumer of this route depends on
  it('SW-AIDL-API-TC08: the payload carries all ten sections, with arrays never null', { tags: ['@regression'] }, () => {
    aidLifecycle(readOnlyAssetId).then((res) => {
      const payload = expectLifecycleOk(res, 'the shape contract needs a resolving lookup');
      LC.sections.all.forEach((key) => {
        expect(payload, `the response must always carry the "${key}" section`).to.have.property(key);
      });
      LC.sections.alwaysArrays.forEach((key) => {
        expect(
          Array.isArray(payload[key]),
          `"${key}" must be an array even when empty — the FE maps over it without a null guard`,
        ).to.eq(true);
      });
      expect(payload.warehouse, 'the warehouse section is an object, not an array').to.be.an('object');
      expect(payload.warehouse, 'the warehouse section always exposes currentPlacement').to.have.property(
        'currentPlacement',
      );
      expect(payload.reassembly, 'the reassembly section always exposes targets').to.have.property('targets');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Stock-in — how an item comes into existence
  // ══════════════════════════════════════════════════════════════════════════

  // Use case — generation is a stock-in, and the lifecycle is where that shows
  it('SW-AIDL-API-TC09: a new asset shows which PO it came from, but its arrival is missing from the stock-movement log (confirmed defect)', { tags: ['@smoke'] }, () => {
    aidLifecycle(readOnlyAssetId).then((res) => {
      const payload = expectLifecycleOk(res, 'the generated asset must resolve');
      expect(payload.item.flow, 'generation stamps a GENERATE_ASSET_ID flow onto the lineage').to.equal(
        data.lineage.flowGenerateFromPo,
      );
      expect(payload.item.poNumber, 'the item is stocked in against the PO it was generated on').to.equal(po);

      expect(
        timelineEntries(res, LC.actions.auditItemCreate, LC.timelineTypes.audit).length,
        'the per-item ASSET_ID_ITEM_CREATE audit row is what reaches an item timeline — the sibling ASSET_ID_BATCH_GENERATE row is written with entityID = the PO NUMBER and deliberately never appears here',
      ).to.be.greaterThan(0);
      expect(
        timelineOf(res).filter((e) => e.type === LC.timelineTypes.movement).length,
        'DEFECT: generation IS a stock-in — it raises all three quantity counters and copies the PO cost onto the item — yet generate-from-po writes no inventoryMovement at all. The Timeline tab is built to render a movement’s cost (AssetIdSearch.tsx :72) so that line is dead code today, and the single-serial asset-id/generate route DOES record a movement (:776), which makes this an asymmetry rather than a design choice. See pending.md D3. Add the recordMovement call and this expectation becomes greaterThan(0)',
      ).to.equal(0);
    });
  });

  // Use case — the PO block is the provenance half of the screen
  it('SW-AIDL-API-TC10: the purchase-order block matches the PO the asset was generated on', { tags: ['@regression'] }, () => {
    aidLifecycle(readOnlyAssetId).then((res) => {
      const payload = expectLifecycleOk(res, 'the generated asset must resolve');
      expect(payload.purchaseOrder, 'an item with a PO must carry a purchaseOrder block').to.not.be.null;
      expect(payload.purchaseOrder.poNumber, 'the block names the seeded PO').to.equal(po);
      expect(payload.purchaseOrder.status, 'an open PO reports its status').to.be.a('string');
      // vendorName / poType come from AccountWise over HTTP. Asserting their
      // VALUES would make this suite fail on someone else's outage, so only
      // their presence is contractual here (plan §3.2).
      expect(payload.purchaseOrder, 'the vendor key is part of the contract').to.have.property('vendorName');
      expect(payload.purchaseOrder, 'the PO-type key is part of the contract').to.have.property('poType');
    });
  });

  // EP — the "imported and scanned, never generated" partition. Most items in a
  // real warehouse look like this, and they must still have a history.
  it('SW-AIDL-API-TC11: an imported-and-scanned serial with no asset ID still has a lifecycle', { tags: ['@regression'] }, () => {
    aidLifecycle(importedSerial).then((res) => {
      const payload = expectLifecycleOk(res, 'an imported serial must resolve');
      expect(payload.item.assetId, 'this unit was never labelled, so it has no asset ID').to.be.null;
      expect(payload.item.status, 'it was scanned in, so it is Available').to.equal(data.statuses.available);
      expect(payload.item.poNumber, 'it belongs to the PO it was imported against').to.equal(po);
      expect(
        timelineOf(res).length,
        'import + scan alone must already produce a history — an item is never a blank slate',
      ).to.be.greaterThan(0);
    });
  });

  // Decision table — hasItems true vs false. The quantity-only column is not a
  // gap in the screen, it is the screen's scope: no items row, no lifecycle.
  it('SW-AIDL-API-TC12: a quantity-only product has no lifecycle, by design', { tags: ['@regression'] }, () => {
    expect(ramProductId, 'the seed must have created the quantity-only product').to.be.ok;
    // The RAM group was imported with a quantity and no serials, so nothing in
    // `items` can carry its model number. Searching for it is the honest test
    // of "this screen is item-scoped".
    aidLifecycle(`${td.products.ram.memoryGeneration}-${stamp}`).then((res) => {
      expect(
        res.status,
        'a quantity-only product has no serialized unit, so it has no lifecycle to show',
      ).to.equal(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Status changes
  // ══════════════════════════════════════════════════════════════════════════

  // State transition — Available → Damaged, reported through BOTH of the
  // timeline's item-scoped sources: the audit row (which carries the acting
  // user) and the movement row (which carries the ledger effect).
  it('SW-AIDL-API-TC13: a single-serial status change is reported with both its audit and its movement', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      aidMarkStatus({
        poNumber: po,
        serialNumbers: [assetId],
        status: data.statuses.damaged,
        damageReason: 'Search lifecycle automation — single-serial status change',
      })
        .then((markRes) => {
          expect(markRes.status, 'marking one serial Damaged must succeed').to.be.lessThan(300);
          return aidLifecycle(assetId);
        })
        .then((res) => {
          const payload = expectLifecycleOk(res, 'the damaged asset must still resolve');
          expect(payload.item.status, 'the item now reads Damaged').to.equal(data.statuses.damaged);
          expect(
            timelineEntries(res, LC.actions.auditMarkedDamaged, LC.timelineTypes.audit).length,
            'the AUDIT entry is what carries the acting user, so a status change must reach the timeline through it',
          ).to.be.greaterThan(0);
          expect(
            timelineEntries(res, LC.actions.movementChangeStatus, LC.timelineTypes.movement).length,
            'the per-serial CHANGE_STATUS movement is the ledger side and must also be there',
          ).to.be.greaterThan(0);
        });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Reservation and stock-out
  // ══════════════════════════════════════════════════════════════════════════

  // Use case — reserving against a work order. The linkage is regex-scraped out
  // of the audit action, so only a real work order proves it still works.
  it('SW-AIDL-API-TC15: reserving the asset against a work order links that work order', { tags: ['@regression'] }, () => {
    let assetId;
    let workOrderNumber;
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    })
      .then(([id]) => {
        assetId = id;
        // The ASSIGNED number, not a requested one — the backend ignores the
        // workOrderNumber in the request body and allocates its own.
        return seedWorkOrder({
          productId: laptopProductId,
          productName: `AIDL ${stamp}`,
          quantity: 1,
        });
      })
      .then((wo) => {
        workOrderNumber = wo.workOrderNumber;
        if (wo.id) createdWorkOrderIds.push(wo.id);
        return aidScanIntoWorkOrder({
          workOrderNumber,
          productId: laptopProductId,
          serialNumber: assetId,
        });
      })
      .then((scanRes) => {
        expect(scanRes.status, 'scanning the asset into the work order must succeed').to.be.lessThan(300);
        return aidLifecycle(assetId);
      })
      .then((res) => {
        const payload = expectLifecycleOk(res, 'a reserved asset must still resolve');
        expect(payload.item.status, 'scanning into a work order reserves the asset').to.equal(
          data.statuses.reserved,
        );
        const linked = workOrdersOf(res).find((w) => w.workOrderNumber === workOrderNumber);
        expect(
          linked,
          `the work order must be scraped out of the "RESERVED FOR WORK ORDER ${workOrderNumber}" audit action and listed`,
        ).to.exist;
        expect(linked.scannedInWorkOrder, 'the asset is recorded against that work order').to.eq(true);
        expect(
          timelineEntries(res, LC.actions.auditReservedForWo, LC.timelineTypes.audit).length,
          'the reservation is the audit entry the work-order scrape depends on, so it must be on the timeline too',
        ).to.be.greaterThan(0);
      });
  });

  // State transition — Available → StockedOut, with the reason on the movement
  it('SW-AIDL-API-TC16: stocking the asset out is reported as a stock-out under its reason', { tags: ['@smoke'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      aidStockOutSerial({
        serialNumber: assetId,
        reason: LC.stockOutReason.sold,
        description: 'Search lifecycle automation — stock-out',
      })
        .then((soRes) => {
          expect(soRes.status, 'stocking out an Available asset must succeed').to.be.lessThan(300);
          return aidLifecycle(assetId);
        })
        .then((res) => {
          const payload = expectLifecycleOk(res, 'a stocked-out asset must still resolve');
          expect(payload.item.status, 'the item now reads StockedOut').to.equal(data.statuses.stockedOut);
          expect(
            timelineEntries(res, LC.actions.auditStockOut, LC.timelineTypes.audit).length,
            'the STOCKOUT string lives on the AUDIT entry',
          ).to.be.greaterThan(0);
          expect(
            timelineEntries(res, LC.actions.movementStockOut, LC.timelineTypes.movement).length,
            'the movement records the REASON as its type, not the literal "STOCKOUT" — so a reason change would be visible here',
          ).to.be.greaterThan(0);
        })
        // State restoration: pair the mutation with its inverse in-body, so the
        // asset is reusable even if a later assertion fails.
        .then(() => aidRestockSerial({ serialNumber: assetId }));
    });
  });

  // State transition — StockedOut → Available, and the timeline is append-only
  it('SW-AIDL-API-TC17: restocking returns the asset to Available and only appends to the timeline', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      let lengthAfterStockOut;
      aidStockOutSerial({ serialNumber: assetId, reason: LC.stockOutReason.sold })
        .then(() => aidLifecycle(assetId))
        .then((res) => {
          lengthAfterStockOut = timelineOf(res).length;
          return aidRestockSerial({ serialNumber: assetId });
        })
        .then((restockRes) => {
          expect(restockRes.status, 'restocking a stocked-out asset must succeed').to.be.lessThan(300);
          return aidLifecycle(assetId);
        })
        .then((res) => {
          const payload = expectLifecycleOk(res, 'a restocked asset must still resolve');
          expect(payload.item.status, 'the item is back to Available').to.equal(data.statuses.available);
          expect(
            timelineEntries(res, LC.actions.auditRestock, LC.timelineTypes.audit).length,
            'the restock is recorded as its own audit entry',
          ).to.be.greaterThan(0);
          expect(
            timelineEntries(res, LC.actions.movementRestock, LC.timelineTypes.movement).length,
            'and as its own movement — restock writes to BOTH sources, so asserting only one would be half a test',
          ).to.be.greaterThan(0);
          expect(
            timelineEntries(res, LC.actions.movementStockOut, LC.timelineTypes.movement).length,
            'the earlier stock-out must still be there — a lifecycle that rewrites history is worse than none',
          ).to.be.greaterThan(0);
          expect(
            timelineOf(res).length,
            'restocking appends, it never replaces',
          ).to.be.greaterThan(lengthAfterStockOut);
        });
    });
  });

  // Use case — the ledger, read through an INDEPENDENT oracle. The lifecycle
  // exposes no quantities at all, so a round trip that silently leaked stock
  // would be invisible on this screen; the incoming-inventory listing is what
  // catches it.
  it('SW-AIDL-API-TC18: a stock-out / restock round trip leaves the PO quantity ledger unchanged', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      let before;
      readPoQuantities(po, laptopProductId)
        .then((q) => {
          before = q;
          return aidStockOutSerial({ serialNumber: assetId, reason: LC.stockOutReason.sold });
        })
        .then(() => aidRestockSerial({ serialNumber: assetId }))
        .then(() => readPoQuantities(po, laptopProductId))
        .then((after) => {
          expect(
            after.availableQuantity,
            'stock out then restock is a no-op on available stock — any drift is a real inventory leak',
          ).to.equal(before.availableQuantity);
          expect(
            after.receivedQuantity,
            'received stock is unaffected by a stock-out / restock pair',
          ).to.equal(before.receivedQuantity);
        });
    });
  });

  // Use case — stock-out through a work order, which is a different code path
  // from the plain serial stock-out and scrapes its linkage from the MOVEMENT
  // description rather than the audit action.
  it('SW-AIDL-API-TC19: shipping via a work order names that work order, but leaves the ship time blank (confirmed defect)', { tags: ['@regression'] }, () => {
    let assetId;
    let workOrderNumber;
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    })
      .then(([id]) => {
        assetId = id;
        return seedWorkOrder({
          productId: laptopProductId,
          productName: `AIDL ${stamp}`,
          quantity: 1,
        });
      })
      .then((wo) => {
        workOrderNumber = wo.workOrderNumber;
        if (wo.id) createdWorkOrderIds.push(wo.id);
        return aidScanIntoWorkOrder({
          workOrderNumber,
          productId: laptopProductId,
          serialNumber: assetId,
        });
      })
      .then(() => aidWorkOrderStockOut({ workOrderNumber, productId: laptopProductId }))
      .then((soRes) => {
        expect(soRes.status, 'stocking the work order out must succeed').to.be.lessThan(300);
        return aidLifecycle(assetId);
      })
      .then((res) => {
        const payload = expectLifecycleOk(res, 'a work-order-shipped asset must still resolve');
        expect(payload.item.status, 'shipping through a work order stocks the item out').to.equal(
          data.statuses.stockedOut,
        );

        const linked = workOrdersOf(res).find((w) => w.workOrderNumber === workOrderNumber);
        expect(linked, 'the shipping work order must be listed against the asset').to.exist;

        // The shipment is scraped out of the MOVEMENT description here (the
        // reservation used the audit action), so this is the branch of
        // extractWorkOrderNumberFromText that only a real ship exercises.
        const shipMovements = timelineEntries(res, LC.actions.movementStockOut, LC.timelineTypes.movement)
          .filter((e) => String(e.details?.description || '').includes(`${LC.actions.workOrderTextMarker} ${workOrderNumber}`));
        expect(
          shipMovements.length,
          'the stock-out movement must name the work order in its description — that text IS the linkage mechanism, so a wording change upstream silently unlinks every shipped asset',
        ).to.be.greaterThan(0);

        expect(
          linked.stockedOutAt,
          'DEFECT: the "Stocked Out At" column is blank for this path. stockoutProduct() only stamps productsItems[].stockOutAt on the random-fill branch (workOrder.service :1395) — an item that was SCANNED in keeps its original entry untouched. Only bulk-stockout back-fills it (:1692). Stamp it in stockoutProduct and this becomes not.be.null',
        ).to.be.null;
      });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Warehouse placement — the container column and the location column
  // ══════════════════════════════════════════════════════════════════════════

  // Decision table, column A: assignment_type = 'CONTAINER'
  it('SW-AIDL-API-TC20: assigning the asset to a container reports the container and its bin', { tags: ['@smoke'] }, () => {
    expect(containerCode, 'the disposable container must have been created').to.be.ok;
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      aidAssignSerialToContainer({ containerCode, serialNumber: assetId })
        .then((assignRes) => {
          expect(assignRes.status, 'assigning the asset into the container must succeed').to.be.lessThan(300);
          return aidLifecycle(assetId);
        })
        .then((res) => {
          expectLifecycleOk(res, 'a contained asset must still resolve');
          const placement = placementOf(res);
          expect(placement, 'a contained item must report a current placement').to.not.be.null;
          expect(placement.containerCode, 'the placement names the container holding it').to.equal(
            containerCode,
          );
          expect(
            placement.locationPath,
            'the placement resolves through to the bin the container is parked in',
          ).to.equal(binPath);
          expect(
            timelineEntries(res, LC.actions.warehouseAssign, LC.timelineTypes.warehouseAudit).length,
            'the container audit row reaches the timeline as a WAREHOUSE_AUDIT entry',
          ).to.be.greaterThan(0);
        });
    });
  });

  // State transition — a stock-out checks the item out of its container, so the
  // placement must clear while the history of having been there must not.
  it('SW-AIDL-API-TC21: stocking out an asset that sits in a container clears its placement', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      aidAssignSerialToContainer({ containerCode, serialNumber: assetId })
        .then(() =>
          aidStockOutSerial({ serialNumber: assetId, reason: LC.stockOutReason.sold }),
        )
        .then((soRes) => {
          expect(soRes.status, 'stocking out a contained asset must succeed').to.be.lessThan(300);
          return aidLifecycle(assetId);
        })
        .then((res) => {
          expectLifecycleOk(res, 'a shipped asset must still resolve');
          expect(
            placementOf(res),
            'stocking out checks the item out of its container, so it is no longer anywhere in the warehouse',
          ).to.be.null;
          expect(
            timelineEntries(res, LC.actions.warehouseAssign, LC.timelineTypes.warehouseAudit).length,
            'the record of having BEEN in that container must survive the stock-out',
          ).to.be.greaterThan(0);
        });
    });
  });

  // Decision table, column B: assignment_type = 'LOCATION' — CONFIRMED DEFECT.
  // The identical operation against a bin instead of a container produces no
  // placement, because currentPlacement INNER JOINs `containers` on a column
  // that is NULL for a location assignment. TC20 passing is what makes this a
  // defect rather than an unimplemented feature.
  it('SW-AIDL-API-TC22: assigning the asset straight to a bin reports no placement (confirmed defect)', { tags: ['@regression'] }, () => {
    expect(binId, 'the disposable bin must have been created').to.be.ok;
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      aidAssignSerialToLocation({
        locationId: binId,
        serialNumber: assetId,
        productId: laptopProductId,
      })
        .then((assignRes) => {
          expect(
            assignRes.status,
            'the direct location assignment itself must succeed — the defect is in the READ, not the write',
          ).to.be.lessThan(300);
          return aidLifecycle(assetId);
        })
        .then((res) => {
          expectLifecycleOk(res, 'a bin-assigned asset must still resolve');
          expect(
            placementOf(res),
            'DEFECT: the item IS in the bin, but currentPlacement INNER JOINs containers on ci.container_id, which is NULL for a LOCATION assignment. Change that to a LEFT JOIN and this expectation becomes not.be.null',
          ).to.be.null;
        })
        // Restore: leave the bin empty so after() can delete the location chain.
        .then(() => aidUnassignSerialFromLocation(assetId));
    });
  });

  // Error guessing — the second half of the same defect. Even the EVENT is
  // lost, because the assignment audits under entityType='Location' and the
  // timeline reads only 'Item' and 'Container'.
  it('SW-AIDL-API-TC23: a bin assignment produces no timeline entry either (confirmed defect)', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      let lengthBefore;
      aidLifecycle(assetId)
        .then((res) => {
          lengthBefore = timelineOf(res).length;
          return aidAssignSerialToLocation({
            locationId: binId,
            serialNumber: assetId,
            productId: laptopProductId,
          });
        })
        .then((assignRes) => {
          expect(assignRes.status, 'the direct location assignment must succeed').to.be.lessThan(300);
          return aidLifecycle(assetId);
        })
        .then((res) => {
          expectLifecycleOk(res, 'a bin-assigned asset must still resolve');
          expect(
            timelineOf(res).length,
            'DEFECT: putting an item away is a real warehouse event, but the audit row is written under entityType="Location" and the timeline queries only "Item" and "Container". Add Location to the union and this becomes greaterThan(lengthBefore)',
          ).to.equal(lengthBefore);
          expect(
            timelineOf(res).filter((e) => JSON.stringify(e.details || {}).includes(binPath)).length,
            'and nothing in the timeline names the bin the item was put into',
          ).to.equal(0);
        })
        .then(() => aidUnassignSerialFromLocation(assetId));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Lineage — disassembly down, assembly up
  // ══════════════════════════════════════════════════════════════════════════

  // Use case — the parent's view of its own teardown, including the cost the
  // children were minted at (0 by design — see the Disassembly sub-plan)
  it('SW-AIDL-API-TC24: a disassembled parent lists its children, each at cost zero', { tags: ['@regression'] }, () => {
    seedDisassemblyChildren({
      parentSerialNumber: disassemblyParent,
      selectedItemSerialNumber: disassemblyParent,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 2,
    }).then((childAssetIds) => {
      aidLifecycle(disassemblyParent).then((res) => {
        expectLifecycleOk(res, 'the disassembled parent must resolve');
        const children = disassembledOf(res);
        // Assert the seeded children are present rather than asserting a total.
        // A total would be wrong the moment this test is retried, and would also
        // couple TC24 to whether TC25 (which disassembles the same machine
        // again) has already run.
        childAssetIds.forEach((assetId) => {
          const child = children.find((c) => c.assetId === assetId || c.serialNumber === assetId);
          expect(child, `child ${assetId} minted from this machine must be listed under it`).to.exist;
          expect(
            Number(child.cost),
            'disassembly hard-codes child cost to 0, and the lifecycle is where a regression in that would first be seen',
          ).to.equal(0);
          expect(child.flow, 'each child is stamped with the DISASSEMBLY flow').to.equal(
            data.lineage.flowDisassembly,
          );
        });
        expect(
          timelineEntries(res, LC.actions.auditDisassemblyCreate, LC.timelineTypes.audit).length,
          'the teardown is an event in the MACHINE own history, not merely a list of what came out of it',
        ).to.be.greaterThan(0);
      });
    });
  });

  // Use case — the child's view of where it came from
  it('SW-AIDL-API-TC25: a disassembly child names its parent and inherits the parent\'s PO', { tags: ['@regression'] }, () => {
    seedDisassemblyChildren({
      parentSerialNumber: disassemblyParent,
      selectedItemSerialNumber: disassemblyParent,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([childAssetId]) => {
      aidLifecycle(childAssetId).then((res) => {
        const payload = expectLifecycleOk(res, 'the disassembly child must resolve');
        expect(payload.parentItem, 'a child must carry a parentItem block').to.not.be.null;
        expect(payload.parentItem.serialNumber, 'the parent block names the machine it came out of').to.equal(
          disassemblyParent,
        );
        expect(
          payload.item.poNumber,
          'children inherit the PARENT\'s PO, never the child product\'s own — that is what keeps a teardown traceable to the receipt',
        ).to.equal(po);
        expect(payload.item.flow, 'the child is stamped DISASSEMBLY').to.equal(data.lineage.flowDisassembly);
      });
    });
  });

  // State transition — Available → Consumed, plus the upward lineage link
  it('SW-AIDL-API-TC26: an assembled component reads Consumed and names the machine it went into', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([componentAssetId]) => {
      aidReassemblyLink({
        parentSerialNumber: assemblyParent,
        assetCodes: [componentAssetId],
      })
        .then((linkRes) => {
          expect(linkRes.status, 'assembling the component into the machine must succeed').to.be.lessThan(300);
          return aidLifecycle(componentAssetId);
        })
        .then((res) => {
          const payload = expectLifecycleOk(res, 'a consumed component must still resolve');
          expect(
            payload.item.status,
            'assembly is the only writer of Consumed anywhere in the app',
          ).to.equal(data.statuses.consumed);
          const targets = reassemblyTargetsOf(res).map((t) => t.parentSerialNumber);
          expect(
            targets,
            'the component must name the machine it was built into',
          ).to.include(assemblyParent);
        });
    });
  });

  // Use case — the machine's view of its own bill of materials
  it('SW-AIDL-API-TC27: the machine lists the component it consumed', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([componentAssetId]) => {
      aidReassemblyLink({
        parentSerialNumber: assemblyParent,
        assetCodes: [componentAssetId],
      })
        .then(() => aidLifecycle(assemblyParent))
        .then((res) => {
          expectLifecycleOk(res, 'the assembled machine must resolve');
          const consumed = reassembledOf(res).find(
            (c) => c.assetId === componentAssetId || c.serialNumber === componentAssetId,
          );
          expect(consumed, 'the machine must list the part that went into it').to.exist;
          expect(consumed.status, 'that part reads Consumed from the machine side too').to.equal(
            data.statuses.consumed,
          );
          expect(
            timelineEntries(res, LC.actions.auditReassemblyLink, LC.timelineTypes.audit).length,
            'the build is an event in the machine own history — the assembly audit row is written against the PARENT, never against the part',
          ).to.be.greaterThan(0);
        });
    });
  });

  // State transition — the cascade. Consumed is not terminal: shipping the
  // machine ships its parts, and that has to be traceable on the PART.
  it('SW-AIDL-API-TC28: stocking out the machine cascades to its consumed component', { tags: ['@regression'] }, () => {
    // Two fresh assets: one plays the machine, one plays the part. A dedicated
    // machine is needed because this test drives it to StockedOut, and the
    // shared assemblyParent is still required by TC26/TC27.
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 2,
    }).then((assetIds) => {
      const [parentAssetId, componentAssetId] = assetIds;
      aidReassemblyLink({
        parentSerialNumber: parentAssetId,
        assetCodes: [componentAssetId],
      })
        .then((linkRes) => {
          expect(linkRes.status, 'building the machine must succeed').to.be.lessThan(300);
          return aidStockOutSerial({
            serialNumber: parentAssetId,
            reason: LC.stockOutReason.sold,
          });
        })
        .then((soRes) => {
          expect(soRes.status, 'shipping the machine must succeed').to.be.lessThan(300);
          return aidLifecycle(componentAssetId);
        })
        .then((res) => {
          const payload = expectLifecycleOk(res, 'the cascaded component must still resolve');
          expect(
            payload.item.status,
            'a part inside a shipped machine has left the building too',
          ).to.equal(data.statuses.stockedOut);
          expect(
            timelineEntries(res, LC.actions.auditCascade, LC.timelineTypes.audit).length,
            'the cascade is recorded on the PART, which is the only place an auditor would look for it',
          ).to.be.greaterThan(0);
        });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. Cost and timeline integrity
  // ══════════════════════════════════════════════════════════════════════════

  // Use case — cost. The asset inherits the PO's unit cost, and that number feeds
  // every value report, so it has to be verified. The lifecycle route cannot
  // verify it (that is the defect, see the second half), so the check runs against
  // the Asset Lifecycle Report — an independent read of the item's persisted
  // `cost` column. Proving the inheritance is correct FIRST is what separates
  // "the cost is wrong" from "the cost is right but this screen cannot see it".
  //
  // `function ()` rather than an arrow, because `this.skip()` needs the Mocha
  // context — an arrow would throw "cannot read skip of undefined" and report
  // the environment probe as a test error.
  it('SW-AIDL-API-TC29: the asset inherits the PO unit cost, but no cost is reachable from the lifecycle (confirmed defect)', { tags: ['@regression'] }, function () {
    if (poUnitCost == null) {
      // Probe-then-skip: the PO-cost oracle reads the incoming-inventory
      // listing, and an environment that does not expose cost there cannot
      // support this assertion. Failing would report an environment gap as a
      // product defect.
      this.skip();
    }

    readAssetLifecycleRow(readOnlyAssetId)
      .then((row) => {
        expect(row, 'the Asset Lifecycle Report must carry a row for the generated asset').to.not.be.null;
        expect(
          Number(row.cost),
          `generation copies the PO's unit cost onto the item, so the persisted cost must be ${poUnitCost}`,
        ).to.equal(Number(poUnitCost));
        return aidLifecycle(readOnlyAssetId);
      })
      .then((res) => {
        const payload = expectLifecycleOk(res, 'the generated asset must resolve');

        // Two independent ways cost could have surfaced here, and neither does.
        expect(
          payload.item,
          'the item block exposes no cost field at all — that is the shape of the response, not the defect',
        ).to.not.have.property('cost');
        expect(
          timelineOf(res).filter((e) => e.details?.cost != null && Number(e.details.cost) !== 0).length,
          'DEFECT: the Timeline tab renders `Cost: X.XX` from a movement’s details.cost (AssetIdSearch.tsx :72), but that line is dead for every generated asset. TWO changes are needed and the first alone is not enough: (1) generate-from-po writes no inventoryMovement (TC09), and (2) AuditService.recordMovement defaults cost = 0 and never looks it up — the caller must pass it, and no asset-id caller does. Add the movement AND pass the unit cost already copied onto the item. See pending.md D3',
        ).to.equal(0);
      });
  });

  // Use case — every entry is renderable. The FE maps over the timeline without
  // null guards on `action`, so a malformed entry is a blank row for the user.
  it('SW-AIDL-API-TC30: every timeline entry carries a timestamp, an action and a known type', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      aidMarkStatus({
        poNumber: po,
        serialNumbers: [assetId],
        status: data.statuses.damaged,
        damageReason: 'Search lifecycle automation — timeline shape',
      })
        .then(() => aidLifecycle(assetId))
        .then((res) => {
          expectLifecycleOk(res, 'the asset must resolve');
          const entries = timelineOf(res);
          expect(entries.length, 'the asset has been generated and status-changed, so it has events').to.be.greaterThan(0);
          entries.forEach((entry, i) => {
            expect(
              Number.isNaN(new Date(entry.timestamp).getTime()),
              `timeline[${i}] must carry a parseable timestamp — the UI formats it with new Date()`,
            ).to.eq(false);
            expect(
              String(entry.action || '').trim(),
              `timeline[${i}] must carry a non-empty action — an empty one renders as a blank chip`,
            ).to.not.equal('');
            expect(
              LC.timelineTypes.all,
              `timeline[${i}] must come from one of the three declared sources`,
            ).to.include(entry.type);
          });
        });
    });
  });

  // Use case — the merge itself. Three independently-sorted queries are unioned
  // and re-sorted, so an item touched by all three sources is the only thing
  // that proves the merge works.
  it('SW-AIDL-API-TC31: a full operation history is reported in non-decreasing time order', { tags: ['@regression'] }, () => {
    seedGeneratedAssetIds({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: 1,
    }).then(([assetId]) => {
      // Generate (AUDIT + MOVEMENT) → contain (WAREHOUSE_AUDIT) → damage
      // (MOVEMENT) → available → ship (AUDIT + MOVEMENT) → restock.
      aidAssignSerialToContainer({ containerCode, serialNumber: assetId })
        .then(() => aidStockOutSerial({ serialNumber: assetId, reason: LC.stockOutReason.sold }))
        .then(() => aidRestockSerial({ serialNumber: assetId }))
        .then(() => aidLifecycle(assetId))
        .then((res) => {
          expectLifecycleOk(res, 'the fully-exercised asset must resolve');
          const entries = timelineOf(res);
          const types = [...new Set(entries.map((e) => e.type))];
          // Assert the three sources BY NAME, not by count. `types.size > 1`
          // passed with only two of them while the message claimed three, so a
          // regression that dropped the WAREHOUSE_AUDIT arm of the union still
          // went green. Naming them also survives the service adding a fourth
          // type later, which a bare `=== 3` would turn into a false failure.
          expect(
            types,
            'this asset was touched through the item audit, the container audit and the movement ledger, so all three sources must be represented',
          ).to.include.members(LC.timelineTypes.all);

          const times = entries.map((e) => new Date(e.timestamp).getTime());
          // Non-decreasing, not strictly increasing: audit and movement rows
          // are written in the same transaction and can share a timestamp to
          // the second, so a strict check would be flaky by construction.
          times.forEach((t, i) => {
            if (i === 0) return;
            expect(
              t,
              `timeline[${i}] must not predate timeline[${i - 1}] — the merge re-sorts three separately-ordered queries`,
            ).to.be.at.least(times[i - 1]);
          });
        });
    });
  });
});
