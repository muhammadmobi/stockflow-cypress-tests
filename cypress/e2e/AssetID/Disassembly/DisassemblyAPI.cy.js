/**
 * Asset ID → Disassembly — API Tests (SW-AIDD-API-TC01..TC29)
 * =============================================================================
 * Mirrors:  cypress/e2e/AssetID/Disassembly/01-DisassemblyTests.cy.js
 * Backend:  Backend/src/modules/product/product.controller.ts:1504-1751
 *           Backend/src/modules/product/product-asset-id.service.ts
 *             (scanItemsForAssetId, getDisassemblyGeneratedLabels,
 *              getAssembledItems, previewDisassemblyAssetIds,
 *              createDisassemblyItemsAndGenerateAssetIds)
 * Plan:     cypress/qa/testPlans/assetId/sub/disassembly-plan.md
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST /products/asset-id/scan                                      AuthGuard
 *   GET  /products/asset-id/disassembly/category/:categoryId/products AuthGuard
 *   GET  /products/asset-id/disassembly/generated-labels/:serialNumber AuthGuard
 *   GET  /products/asset-id/disassembly/assembled-items/:serialNumber  AuthGuard
 *   POST /products/asset-id/disassembly/preview                       AuthGuard
 *   POST /products/asset-id/disassembly/create-and-generate           AuthGuard
 *
 * -----------------------------------------------------------------------------
 *   Confirmed code facts this suite is designed around (read from the service)
 * -----------------------------------------------------------------------------
 *   1. Disassembly does NOT consume or mutate the parent item. The service only
 *      READS the parent (to gate on status and to inherit its PO) and then
 *      INSERTs `quantity` brand-new child rows. The parent stays Available.
 *      TC17 pins this, because the UI copy ("Disassembly consumes the parent
 *      item") says the opposite and a future change to match the copy must be
 *      a deliberate, reviewed one.
 *   2. The child items inherit the PARENT's poNumber — never the child
 *      product's own PO. TC15 proves it by deliberately sourcing the child
 *      product from a DIFFERENT purchase order.
 *   3. Child cost and price are HARD-CODED to 0 (service line 1649-1650),
 *      regardless of the parent's cost or the child product's PO cost. That is
 *      load-bearing for the value reports, so TC16 asserts the zero explicitly
 *      rather than letting it pass unnoticed.
 *   4. Both the parent AND the selected item must be `Available`; each has its
 *      own guard and its own message (TC12, TC13).
 *   5. Unlike generate-from-po, this route THROWS on a half-specified location
 *      assignment: `locationPath` without `assignTo: 'location'` is a 400
 *      (line 1839), and `assignTo: 'location'` without a path/id is a 400
 *      (line 1842). TC27/TC28 pin both — and TC27 also pins that the first of
 *      those guards fires AFTER the transaction commits (confirmed defect).
 *   6. `assetId` uses the PARENT SERIAL as its middle token here (vs the PO
 *      number for generate-from-po), so a disassembly label is traceable to the
 *      machine it came out of (TC14).
 *   7. Every asset-id POST answers with HTTP 201 while the envelope's own
 *      `statusCode` says 200 — see expectPostOk() in assetIdHelpers.
 *   8. `previewDisassemblyAssetIds` validates that both items EXIST but never
 *      checks their STATUS, while create does — so preview is not a faithful
 *      dry run of create. Not user-reachable (the screen disables Preview for a
 *      non-Available selection), so TC29 records the asymmetry rather than
 *      reporting it as a defect.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/AssetID/assetIdData.json';
import { apiDeletePO, apiResolveCategoryIdByName } from '../../../support/helpers/poCloseHelpers';
import {
  createContainerTypeViaApi,
  deleteContainerTypeViaApi,
  deleteContainerViaApi,
  disposableTypeName,
  emptyContainerViaApi,
} from '../../../support/helpers/wmsContainerHelpers';
import {
  createContainerWithCapacity,
  getContainerSerials,
  getLocationSerials,
} from '../../../support/helpers/containerLocationHelpers';
import {
  aidAssembledItems,
  aidData,
  aidDisassemblyCategoryProducts,
  aidDisassemblyCreate,
  aidDisassemblyPreview,
  aidGeneratedLabels,
  aidLifecycle,
  aidMarkStatus,
  aidScan,
  aidUnauthenticated,
  assetIdsOf,
  createdItemsOf,
  expectPostOk,
  previewItemsOf,
  readAssetLifecycleRow,
  readItemStatus,
  readPoQuantities,
  seedAssetIdPo,
  seedDisassemblyChildren,
} from '../../../support/helpers/assetIdHelpers';

const {
  createDisposableBinChain,
  deleteLocationViaApi,
} = require('../../../support/helpers/wmsLocationHelpers');

const UNIQUE_CODE_RE = new RegExp(data.assetIdFormat.uniqueCodePattern);

// ════════════════════════════════════════════════════════════════════════════
// TWO disposable POs, on purpose:
//
//   parentPo — carries the machine being disassembled (2 Available serials).
//   childPo  — carries a SECOND, distinct product in the same allowItems
//              category. Sourcing the child product from a different PO is what
//              makes the "children inherit the PARENT's PO" contract (TC15) and
//              the "a fresh quantities row is created" branch (TC18) provable;
//              with both products on one PO neither could be distinguished from
//              a coincidence.
// ════════════════════════════════════════════════════════════════════════════
describe('Asset ID Disassembly API', () => {
  const stamp = `AIDD-${Date.now()}`;
  const childStamp = `AIDDC-${Date.now()}`;
  const parentPo = `PO-AIDD-${Date.now()}`;
  const childPo = `PO-AIDDC-${Date.now()}`;

  // The run stamp comes BEFORE the role letter so the prefix these three share
  // is itself run-unique. With `SN-AIDD-P-<ts>` the shared prefix was the bare
  // `SN-AIDD-`, which TC07's substring scan then matched against every leftover
  // serial from every previous run — tolerable while `include.members` ignores
  // extras, but not once enough stale rows accumulate to truncate the response.
  const serialPrefix = `SN-AIDD-${Date.now()}-`;
  const parentSerial = `${serialPrefix}P`;
  const selectedSerial = `${serialPrefix}S`;
  const blockedSerial = `${serialPrefix}B`; // driven to Damaged for the status-gate TCs

  let laptopCategoryId;
  let ramCategoryId;
  let parentProductId;
  let ramProductId;
  let childProductId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    apiResolveCategoryIdByName(td.categories.laptop)
      .then((id) => {
        laptopCategoryId = id;
        return apiResolveCategoryIdByName(td.categories.ram);
      })
      .then((id) => {
        ramCategoryId = id;
      });

    seedAssetIdPo({
      td,
      poNumber: parentPo,
      stamp,
      serials: [parentSerial, selectedSerial, blockedSerial],
    })
      .then((seed) => {
        parentProductId = seed.laptopProductId;
        ramProductId = seed.ramProductId;
        return seedAssetIdPo({
          td,
          poNumber: childPo,
          stamp: childStamp,
          serials: [`SN-AIDDC-${Date.now()}`],
        });
      })
      .then((seed) => {
        childProductId = seed.laptopProductId;
        // Drive one serial out of Available so the two status gates (TC12/TC13)
        // have a real blocked item instead of an invented one. Seeding lives in
        // the hook, never in an it(), so a tag-filtered run cannot leave a later
        // test depending on an earlier test's side effect.
        return aidMarkStatus({
          poNumber: parentPo,
          serialNumbers: [blockedSerial],
          status: data.statuses.damaged,
          damageReason: 'Asset ID automation — status gate fixture',
        });
      });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => {
    apiDeletePO(parentPo);
    apiDeletePO(childPo);
  });

  // ── Auth contract (EP — the no-auth partition) ──────────────────────────

  // EP — no-auth partition
  it('SW-AIDD-API-TC01: POST /products/asset-id/scan without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('POST', '/products/asset-id/scan', { serialNumber: parentSerial }).then((res) => {
      expect(res.status, 'the AuthGuard must reject an unauthenticated scan').to.equal(401);
    });
  });

  // EP — no-auth partition
  it('SW-AIDD-API-TC02: POST /products/asset-id/disassembly/create-and-generate without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('POST', '/products/asset-id/disassembly/create-and-generate', {
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'an unauthenticated caller must never be able to mint inventory').to.equal(401);
    });
  });

  // EP — no-auth partition
  it('SW-AIDD-API-TC03: the disassembly read routes reject an unauthenticated caller', { tags: ['@regression'] }, () => {
    aidUnauthenticated('POST', '/products/asset-id/disassembly/preview', {
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => expect(res.status, 'preview is guarded').to.equal(401));
    aidUnauthenticated(
      'GET',
      `/products/asset-id/disassembly/generated-labels/${encodeURIComponent(parentSerial)}`,
    ).then((res) => expect(res.status, 'generated-labels is guarded').to.equal(401));
    aidUnauthenticated(
      'GET',
      `/products/asset-id/disassembly/assembled-items/${encodeURIComponent(parentSerial)}`,
    ).then((res) => expect(res.status, 'assembled-items is guarded').to.equal(401));
    aidUnauthenticated(
      'GET',
      `/products/asset-id/disassembly/category/${laptopCategoryId}/products`,
    ).then((res) => expect(res.status, 'the category product lookup is guarded').to.equal(401));
  });

  // ── The scan that opens the screen ──────────────────────────────────────

  // Use case — main flow: scan a known serial, get the item back
  it('SW-AIDD-API-TC04: scanning a known serial returns it as the parent with its status and product', { tags: ['@smoke'] }, () => {
    aidScan(parentSerial).then((res) => {
      expectPostOk(res, 'scanning a real serial must succeed');
      const payload = aidData(res);
      expect(payload.parentSerialNumber, 'the exact match becomes the parent serial').to.equal(parentSerial);
      const found = payload.foundItems.find((i) => i.serialNumber === parentSerial);
      expect(found, 'the scanned serial must be among the found items').to.exist;
      expect(found.status, 'a scanned-in serial is Available and therefore disassemblable').to.equal(
        data.statuses.available,
      );
      expect(Number(found.productId), 'the found item resolves to the seeded product').to.equal(Number(parentProductId));
      expect(found.category, 'the found item carries its category name for the table').to.equal(td.categories.laptop);
    });
  });

  // EP — invalid partition (blank input)
  it('SW-AIDD-API-TC05: scanning a blank serial is rejected', { tags: ['@regression'] }, () => {
    aidScan(data.serialNumber.epEmpty).then((res) => {
      expect(res.status, 'a whitespace-only serial must not reach the item query').to.be.within(400, 499);
    });
  });

  // EP — invalid partition (no such serial anywhere)
  it('SW-AIDD-API-TC06: scanning an unknown serial returns a semantic not-found', { tags: ['@regression'] }, () => {
    aidScan(data.serialNumber.epUnknown).then((res) => {
      expect(res.status, 'an unknown serial must not 5xx').to.be.lessThan(500);
      expect(res.status === 404 || res.body?.success === false, 'an unknown serial must fail semantically').to.be.ok;
    });
  });

  // Error guessing — the scan query is `= serial OR ILIKE %serial%`, so a
  // partial serial matches. That is deliberate (a worker may scan a shortened
  // label) but it means the caller can get back MORE than one row, which is
  // exactly why the screen renders a radio list rather than auto-selecting.
  it('SW-AIDD-API-TC07: a partial serial matches by substring and can return several items', { tags: ['@regression'] }, () => {
    // Run-scoped, so the substring match can only return THIS run's siblings.
    const commonPrefix = serialPrefix;
    aidScan(commonPrefix).then((res) => {
      expectPostOk(res, 'a partial serial is a supported scan input, not an error');
      const serials = aidData(res).foundItems.map((i) => i.serialNumber);
      expect(serials, 'the substring match must return every seeded sibling').to.include.members([
        parentSerial,
        selectedSerial,
      ]);
    });
  });

  // ── Category → product lookup ───────────────────────────────────────────

  // EP — valid partition
  it('SW-AIDD-API-TC08: the disassembly category lookup lists the target products', { tags: ['@regression'] }, () => {
    aidDisassemblyCategoryProducts(laptopCategoryId).then((res) => {
      expect(res.status, 'the lookup that fills the target-product dropdown must succeed').to.equal(200);
      const ids = (aidData(res).products || []).map((p) => Number(p.id));
      expect(ids, 'the child product must be selectable as a disassembly target').to.include(Number(childProductId));
    });
  });

  // EP — invalid partition
  it('SW-AIDD-API-TC09: the disassembly category lookup rejects categoryId=0', { tags: ['@regression'] }, () => {
    aidDisassemblyCategoryProducts(data.categoryFilter.epZero).then((res) => {
      expect(res.status, 'categoryId=0 fails the positive-integer guard').to.be.within(400, 499);
    });
  });

  // ── preview — same ladder, no writes ────────────────────────────────────

  // EP — happy path, and the format contract
  it('SW-AIDD-API-TC10: preview returns `quantity` asset IDs keyed to the parent serial', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.epTypical;
    aidDisassemblyPreview({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity,
    }).then((res) => {
      expectPostOk(res, 'a fully valid disassembly preview must succeed');
      const items = previewItemsOf(res);
      expect(items, 'preview returns exactly `quantity` entries').to.have.length(quantity);
      items.forEach((item) => {
        expect(item.uniqueCode).to.match(UNIQUE_CODE_RE);
        expect(
          item.assetId,
          'a disassembly label embeds the PARENT SERIAL, not the PO — that is what makes the child traceable to the machine',
        ).to.include(parentSerial.toUpperCase());
      });
    });
  });

  // Metamorphic — preview must not burn a sequence number
  it('SW-AIDD-API-TC11: two consecutive disassembly previews return identical asset IDs', { tags: ['@regression'] }, () => {
    const body = {
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.epTypical,
    };
    let first;
    aidDisassemblyPreview(body)
      .then((res) => {
        first = previewItemsOf(res).map((i) => i.assetId);
        return aidDisassemblyPreview(body);
      })
      .then((res) => {
        expect(
          previewItemsOf(res).map((i) => i.assetId),
          'preview reads assetIdSequences without incrementing it',
        ).to.deep.equal(first);
      });
  });

  // ── Status gates — the two guards, separately ───────────────────────────

  // Decision table — parent status × selected status. Column: parent blocked.
  it('SW-AIDD-API-TC12: a parent that is not Available cannot be disassembled', { tags: ['@regression'] }, () => {
    aidDisassemblyCreate({
      parentSerialNumber: blockedSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'a Damaged machine must not be strippable for parts').to.be.lessThan(500);
      expect(res.status >= 400 || res.body?.success === false, 'the parent status guard must fire').to.be.ok;
    });
  });

  // Decision table — same table, column: selected item blocked.
  it('SW-AIDD-API-TC13: a selected item that is not Available cannot be disassembled', { tags: ['@regression'] }, () => {
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: blockedSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'the selected item has its own status guard, distinct from the parent one').to.be.lessThan(500);
      expect(res.status >= 400 || res.body?.success === false, 'the selected-item status guard must fire').to.be.ok;
    });
  });

  // ── create-and-generate — the real mutation ─────────────────────────────

  // Use case — main flow, plus the field contract of a child item
  it('SW-AIDD-API-TC14: disassembly creates Available child items whose asset ID carries the parent serial', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.bvaLowerValidPlusOne;
    let created;
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity,
    })
      .then((res) => {
        expectPostOk(res, 'a fully valid disassembly must succeed');
        const payload = aidData(res);
        expect(payload.parentSerialNumber, 'the response echoes the parent').to.equal(parentSerial);
        expect(payload.quantity).to.equal(quantity);
        created = createdItemsOf(res);
        expect(created, 'exactly `quantity` children must be created').to.have.length(quantity);
        created.forEach((item) => {
          expect(item.serialNumber, 'a child item IS its own asset ID, same as a generated one').to.equal(item.assetId);
          expect(item.assetId).to.include(parentSerial.toUpperCase());
        });
        return readItemStatus(created[0].assetId);
      })
      .then((status) => {
        expect(status, 'a freshly extracted component is immediately on-hand stock').to.equal(data.statuses.available);
        return aidLifecycle(created[0].assetId);
      })
      .then((res) => {
        const item = aidData(res).item;
        expect(item.flow, 'the child must be attributed to the Disassembly screen, not to a PO generate').to.equal(
          data.lineage.flowDisassembly,
        );
        expect(item.lineage?.sourceType, 'a disassembly child is minted FROM an item, not from a PO').to.equal(
          data.lineage.sourceTypeItem,
        );
        expect(item.lineage?.parentSerialNumber, 'the lineage names the machine it came out of').to.equal(parentSerial);
      });
  });

  // Use case — the PO-inheritance contract (the child product lives on a
  // DIFFERENT PO, so an inherited value cannot be a coincidence)
  it('SW-AIDD-API-TC15: child items inherit the PARENT item PO, not the child product own PO', { tags: ['@regression'] }, () => {
    let assetId;
    seedDisassemblyChildren({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [assetId] = ids;
        return readAssetLifecycleRow(assetId);
      })
      .then(function (row) {
        if (!row) this.skip();
        expect(
          row.poNumber,
          `the child must belong to the parent PO (${parentPo}) — the child PRODUCT was seeded on ${childPo}`,
        ).to.equal(parentPo);
      });
  });

  // Error guessing — cost is hard-coded to 0 here, unlike generate-from-po
  // which inherits the PO cost. Pinning it makes any future change visible to
  // whoever owns the Inventory Value / Cost reports.
  it('SW-AIDD-API-TC16: a disassembly child is created with zero cost', { tags: ['@regression'] }, () => {
    let assetId;
    seedDisassemblyChildren({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [assetId] = ids;
        return readAssetLifecycleRow(assetId);
      })
      .then(function (row) {
        if (!row) this.skip();
        expect(
          parseFloat(row.cost ?? 0),
          'the service hard-codes itemCost = 0 for a disassembly child — it does NOT split the parent cost',
        ).to.equal(0);
      });
  });

  // State transition — the parent is READ, never written
  it('SW-AIDD-API-TC17: disassembly leaves the parent item Available and untouched', { tags: ['@regression'] }, () => {
    let statusBefore;
    readItemStatus(parentSerial)
      .then((status) => {
        statusBefore = status;
        expect(statusBefore, 'precondition: the parent starts Available').to.equal(data.statuses.available);
        return seedDisassemblyChildren({
          parentSerialNumber: parentSerial,
          selectedItemSerialNumber: parentSerial,
          categoryId: laptopCategoryId,
          productId: childProductId,
          quantity: data.labelQuantity.bvaLowerValid,
        });
      })
      .then(() => readItemStatus(parentSerial))
      .then((statusAfter) => {
        expect(
          statusAfter,
          'the service never UPDATEs the parent row — the UI copy about "consuming" the parent describes the Assembly step, not this one',
        ).to.equal(data.statuses.available);
      });
  });

  // Use case — disassembly is a stock-IN for the child product, on the
  // parent's PO. Covers BOTH branches of the quantities write: the row is
  // created on the first disassembly and incremented on the second.
  it('SW-AIDD-API-TC18: disassembly opens a quantities row on the parent PO and increments it thereafter', { tags: ['@regression'] }, () => {
    const quantity = data.labelQuantity.bvaLowerValidPlusOne;
    let before;
    readPoQuantities(parentPo, childProductId)
      .then((snapshot) => {
        before = snapshot;
        return seedDisassemblyChildren({
          parentSerialNumber: parentSerial,
          selectedItemSerialNumber: parentSerial,
          categoryId: laptopCategoryId,
          productId: childProductId,
          quantity,
        });
      })
      .then(() => readPoQuantities(parentPo, childProductId))
      .then((after) => {
        expect(
          after.found,
          `the child product must now appear on ${parentPo} even though it was imported on ${childPo}`,
        ).to.be.true;
        expect(after.expectedQuantity - before.expectedQuantity, 'expectedQuantity rises by the child count').to.equal(
          quantity,
        );
        expect(after.receivedQuantity - before.receivedQuantity, 'receivedQuantity rises by the child count').to.equal(
          quantity,
        );
        expect(
          after.availableQuantity - before.availableQuantity,
          'the extracted components are immediately on hand',
        ).to.equal(quantity);
      });
  });

  // Use case — the "Previously Generated Labels" panel's data source
  it('SW-AIDD-API-TC19: generated-labels lists every child created under that parent', { tags: ['@regression'] }, () => {
    let created;
    seedDisassemblyChildren({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        created = ids;
        return aidGeneratedLabels(parentSerial);
      })
      .then((res) => {
        expect(res.status, 'the generated-labels lookup must succeed').to.equal(200);
        const labels = aidData(res).generatedLabels || [];
        const serials = labels.map((l) => l.serialNumber);
        expect(serials, 'the child just created must be listed under its parent').to.include(created[0]);
        const row = labels.find((l) => l.serialNumber === created[0]);
        expect(row.status, 'a not-yet-assembled child reads as Available').to.equal(data.statuses.available);
        expect(
          row.reassembledToSerialNumber,
          'nothing has been assembled yet, so the "Assembled To" column must be empty',
        ).to.be.null;
      });
  });

  // EP — the empty partition of the same panel
  it('SW-AIDD-API-TC20: generated-labels returns an empty list for a serial that has never been disassembled', { tags: ['@regression'] }, () => {
    aidGeneratedLabels(selectedSerial).then((res) => {
      expect(res.status, 'an empty result is a success, not an error').to.equal(200);
      expect(
        aidData(res).generatedLabels,
        'a serial nothing was extracted from must report zero labels rather than 404',
      ).to.be.an('array').that.is.empty;
    });
  });

  // EP — the "Assembled Items" panel before any assembly has happened
  it('SW-AIDD-API-TC21: assembled-items is empty until something is assembled into the serial', { tags: ['@regression'] }, () => {
    aidAssembledItems(parentSerial).then((res) => {
      expect(res.status, 'the assembled-items lookup must succeed').to.equal(200);
      expect(
        aidData(res).assembledItems,
        'disassembly creates children FROM a parent; it never assembles anything INTO it',
      ).to.be.an('array').that.is.empty;
    });
  });

  // ── Validation ladder — the partitions that differ from generate-from-po ──

  // BVA — the two quantity boundaries
  it('SW-AIDD-API-TC22: quantity 0 and 201 are both rejected', { tags: ['@regression'] }, () => {
    const bodyFor = (quantity) => ({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity,
    });
    aidDisassemblyCreate(bodyFor(data.labelQuantity.bvaLowerInvalid)).then((res) => {
      expect(res.status, 'quantity=0 is one below the valid range').to.be.within(400, 499);
    });
    aidDisassemblyCreate(bodyFor(data.labelQuantity.bvaUpperInvalid)).then((res) => {
      expect(res.status, 'quantity=201 is one above the 200-label maximum').to.be.within(400, 499);
    });
  });

  // Decision table — category.allowItems and product ∈ category, same two
  // gates as generate-from-po but reached through a different service method
  it('SW-AIDD-API-TC23: a non-item category and a mismatched product are both refused', { tags: ['@regression'] }, function () {
    if (!ramCategoryId || !ramProductId) this.skip();
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: ramCategoryId,
      productId: ramProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'a quantity-only category cannot receive serialized children').to.be.within(400, 499);
    });
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: ramProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'the product must belong to the selected category').to.be.within(400, 499);
    });
  });

  // EP — invalid partition, both serial slots
  it('SW-AIDD-API-TC24: an unknown parent or selected serial is rejected', { tags: ['@regression'] }, () => {
    aidDisassemblyCreate({
      parentSerialNumber: data.serialNumber.epUnknown,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'an unknown parent must not 5xx').to.be.lessThan(500);
      expect(res.status >= 400 || res.body?.success === false, 'an unknown parent must fail semantically').to.be.ok;
    });
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: data.serialNumber.epUnknown,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'an unknown selected item must not 5xx').to.be.lessThan(500);
      expect(res.status >= 400 || res.body?.success === false, 'an unknown selected item must fail semantically').to.be.ok;
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Container / location assignment. Its own describe so the disposable WMS
// resources unwind even when a test in the block fails — and because THIS
// route's half-specified-assignment contract differs from generate-from-po's.
// ════════════════════════════════════════════════════════════════════════════
describe('Asset ID Disassembly API — container & location assignment (SW-AIDD-API-TC25..TC28)', () => {
  const stamp = `AIDDW-${Date.now()}`;
  const childStamp = `AIDDWC-${Date.now()}`;
  const parentPo = `PO-AIDDW-${Date.now()}`;
  const childPo = `PO-AIDDWC-${Date.now()}`;
  const parentSerial = `SN-AIDDW-P-${Date.now()}`;

  let laptopCategoryId;
  let childProductId;
  let containerTypeId;
  let container;
  let binChain;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });
    seedAssetIdPo({ td, poNumber: parentPo, stamp, serials: [parentSerial] })
      .then(() =>
        seedAssetIdPo({ td, poNumber: childPo, stamp: childStamp, serials: [`SN-AIDDWC-${Date.now()}`] }),
      )
      .then((seed) => {
        childProductId = seed.laptopProductId;
        return createContainerTypeViaApi(disposableTypeName('AiddType'));
      })
      .then((type) => {
        containerTypeId = type?.id;
        return createContainerWithCapacity(containerTypeId, data.container.maxItemsRoomy);
      })
      .then((c) => {
        container = c;
        return createDisposableBinChain();
      })
      .then((chain) => {
        binChain = chain;
      });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => {
    if (container?.id) emptyContainerViaApi(container.id).then(() => deleteContainerViaApi(container.id));
    if (containerTypeId) deleteContainerTypeViaApi(containerTypeId);
    if (binChain?.facility?.id) deleteLocationViaApi(binChain.facility.id);
    apiDeletePO(parentPo);
    apiDeletePO(childPo);
  });

  // Use case — extract straight into a tote
  it('SW-AIDD-API-TC25: children created with a containerCode land inside that container', { tags: ['@regression'] }, function () {
    if (!container?.code) this.skip();
    let created;
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValidPlusOne,
      containerCode: container.code,
      assignTo: 'container',
    })
      .then((res) => {
        expectPostOk(res, 'disassembly with a container target must succeed');
        expect(aidData(res).containerAssigned, 'the response must report the assignment as done').to.be.true;
        created = assetIdsOf(res);
        return getContainerSerials(container.id);
      })
      .then((serials) => {
        created.forEach((assetId) => {
          expect(serials, `${assetId} must physically be in container ${container.code}`).to.include(assetId);
        });
      });
  });

  // Use case — extract straight onto a shelf
  it('SW-AIDD-API-TC26: children created with a locationPath land at that bin', { tags: ['@regression'] }, function () {
    if (!binChain?.bin?.id) this.skip();
    let created;
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
      locationPath: binChain.bin.path,
      locationId: binChain.bin.id,
      assignTo: 'location',
    })
      .then((res) => {
        expectPostOk(res, 'disassembly with a location target must succeed');
        expect(aidData(res).locationAssigned, 'the response must report the location assignment as done').to.be.true;
        created = assetIdsOf(res);
        return getLocationSerials(binChain.bin.id);
      })
      .then((serials) => {
        created.forEach((assetId) => {
          expect(serials, `${assetId} must be assigned to bin ${binChain.bin.path}`).to.include(assetId);
        });
      });
  });

  // Decision table — locationPath present × assignTo absent. THIS route
  // rejects; generate-from-po silently skips (SW-AIDG-API-TC31). The pair
  // documents a real inconsistency between two sibling screens.
  it('SW-AIDD-API-TC27: a locationPath without assignTo="location" is rejected AFTER the items are already committed (confirmed defect)', { tags: ['@regression'] }, function () {
    if (!binChain?.bin?.path) this.skip();
    const quantity = data.labelQuantity.bvaLowerValid;
    let labelsBefore;
    aidGeneratedLabels(parentSerial)
      .then((res) => {
        labelsBefore = (aidData(res).generatedLabels || []).length;
        return aidDisassemblyCreate({
          parentSerialNumber: parentSerial,
          selectedItemSerialNumber: parentSerial,
          categoryId: laptopCategoryId,
          productId: childProductId,
          quantity,
          locationPath: binChain.bin.path,
        });
      })
      .then((res) => {
        expect(res.status, 'a half-specified assignment must not 5xx').to.be.lessThan(500);
        expect(
          res.status >= 400 || res.body?.success === false,
          'this route throws on locationPath-without-assignTo, where generate-from-po ignores it (SW-AIDG-API-TC31)',
        ).to.be.ok;
        return aidGeneratedLabels(parentSerial);
      })
      .then((res) => {
        // CONFIRMED DEFECT (verified live on QA, not predicted): the two
        // location-payload guards sit at product-asset-id.service.ts:1839-1844,
        // which is AFTER `await queryRunner.commitTransaction()` at :1754. So
        // the caller is told the request failed while the child items, their
        // scannedItems rows and the quantities increment are already durable.
        // A user who "fixes" the payload and retries silently double-creates.
        // Asserted rather than merely noted, so the day the guard moves in
        // front of the transaction this test turns red and the fix is visible.
        // Tracked in cypress/qa/testPlans/assetId/pending.md.
        expect(
          (aidData(res).generatedLabels || []).length,
          'the 400 is raised post-commit, so the children exist despite the error — retrying would duplicate them',
        ).to.equal(labelsBefore + quantity);
      });
  });

  // Decision table — preview vs create, status column. Deliberately placed in
  // the assignment describe because it needs no WMS fixture but does need the
  // same parent; it is a genuine asymmetry, not a bug the UI can reach (the
  // screen disables Preview for a non-Available item), so it is recorded rather
  // than reported.
  it('SW-AIDD-API-TC29: preview accepts a non-Available item that create would refuse', { tags: ['@regression'] }, () => {
    const blocked = `SN-AIDDW-BLK-${Date.now()}`;
    let target;
    seedDisassemblyChildren({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [target] = ids;
        return aidMarkStatus({
          poNumber: parentPo,
          serialNumbers: [target],
          status: data.statuses.damaged,
          damageReason: `Asset ID automation — preview guard probe ${blocked}`,
        });
      })
      .then(() => readItemStatus(target))
      .then((status) => {
        expect(status, 'precondition: the probe item really is out of Available').to.equal(data.statuses.damaged);
        return aidDisassemblyPreview({
          parentSerialNumber: target,
          selectedItemSerialNumber: target,
          categoryId: laptopCategoryId,
          productId: childProductId,
          quantity: data.labelQuantity.bvaLowerValid,
        });
      })
      .then((res) => {
        // previewDisassemblyAssetIds (:1228-1362) validates the parent EXISTS
        // but never checks its status, while createDisassemblyItemsAndGenerate
        // (:1564-1586) does. Harmless today because the screen disables the
        // Preview button for a non-Available selection — but a caller that
        // trusted preview as a dry run of create would be misled.
        expectPostOk(res, 'preview has no status guard, so a Damaged item still previews');
        expect(previewItemsOf(res), 'and it returns real asset IDs').to.have.length(
          data.labelQuantity.bvaLowerValid,
        );
        return aidDisassemblyCreate({
          parentSerialNumber: target,
          selectedItemSerialNumber: target,
          categoryId: laptopCategoryId,
          productId: childProductId,
          quantity: data.labelQuantity.bvaLowerValid,
        });
      })
      .then((res) => {
        expect(res.status, 'the create for the same payload must not 5xx').to.be.lessThan(500);
        expect(
          res.status >= 400 || res.body?.success === false,
          'create DOES gate on status — preview is therefore not a faithful dry run of it',
        ).to.be.ok;
      });
  });

  // Decision table — the mirrored column: assignTo present × target absent
  it('SW-AIDD-API-TC28: assignTo="location" with no path or id is rejected', { tags: ['@regression'] }, () => {
    aidDisassemblyCreate({
      parentSerialNumber: parentSerial,
      selectedItemSerialNumber: parentSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
      assignTo: 'location',
    }).then((res) => {
      expect(res.status, 'an assignment with no destination must not 5xx').to.be.lessThan(500);
      expect(
        res.status >= 400 || res.body?.success === false,
        'asking for a location assignment without naming a location must fail loudly',
      ).to.be.ok;
    });
  });
});
