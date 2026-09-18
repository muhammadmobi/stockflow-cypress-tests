/**
 * Asset ID → Assembly — API Tests (SW-AIDA-API-TC01..TC23)
 * =============================================================================
 * Mirrors:  cypress/e2e/AssetID/Assembly/01-AssemblyTests.cy.js
 * Backend:  Backend/src/modules/product/product.controller.ts:1823-1864
 *           Backend/src/modules/product/product-asset-id.service.ts
 *             (reassembleAssetIdsAndStockout, getAssetIdLifecycle,
 *              getAssembledItems)
 *           Backend/src/modules/product/product-stock-out.service.ts
 *             (cascadeConsumedToStockedOut, removeConsumedItemFromParent)
 * Plan:     cypress/qa/testPlans/assetId/sub/assembly-plan.md
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST /products/asset-id/scan                             AuthGuard
 *   GET  /products/asset-id/lifecycle/:assetId               AuthGuard
 *   POST /products/asset-id/reassembly/link-and-stockout     AuthGuard
 *   GET  /products/asset-id/disassembly/assembled-items/:sn  AuthGuard
 *   GET  /products/asset-id/disassembly/generated-labels/:sn AuthGuard
 *
 * -----------------------------------------------------------------------------
 *   Confirmed code facts this suite is designed around (read from the service)
 * -----------------------------------------------------------------------------
 *   1. Assembly is the step that CONSUMES stock. Every linked component moves
 *      Available -> `Consumed` (NOT StockedOut), gets checkOutAt stamped, has
 *      its availableQuantity decremented by 1, and is checked out of whatever
 *      container held it.
 *   2. `Consumed` is reachable ONLY through this route — incoming-items
 *      mark-status has no path to it. That makes this suite the sole owner of
 *      the Consumed state transitions.
 *   3. The parent is NOT consumed and NOT stocked out. It only gains a
 *      `lineage.reassemblyIn[]` entry per linked child, which is what the
 *      Disassembly screen's "Assembled Items" panel reads.
 *   4. Consumed -> StockedOut is a CASCADE: it happens when the PARENT is
 *      stocked out (product-stock-out.service.ts cascadeConsumedToStockedOut).
 *      TC19 walks that chain end to end.
 *   5. There are TWO routes back to Available and they DISAGREE:
 *      `markAvailable` calls removeConsumedItemFromParent() and cleans the
 *      parent's `lineage.reassemblyIn` (TC23), while `restockBySerialNumber`
 *      clears only the component's own lineage and leaves the parent listing a
 *      part it no longer contains (TC20 — confirmed defect, found live).
 *   6. Guards, in order: parent required -> >=1 code -> <=200 codes -> parent
 *      exists -> parent Available -> per code: exists, not the parent itself,
 *      Available. Duplicated codes are de-duplicated case-insensitively BEFORE
 *      the loop (TC13).
 *   7. Every asset-id POST answers with HTTP 201 while the envelope's own
 *      `statusCode` says 200 — see expectPostOk() in assetIdHelpers.
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
} from '../../../support/helpers/containerLocationHelpers';
import {
  aidAssembledItems,
  aidAssignSerialToContainer,
  aidData,
  aidGeneratedLabels,
  aidLifecycle,
  aidMarkAvailable,
  aidMarkStatus,
  aidReassemblyLink,
  aidRestockSerial,
  aidScan,
  aidStockOutSerial,
  aidUnauthenticated,
  expectPostOk,
  readItemStatus,
  readPoQuantities,
  seedAssetIdPo,
  seedDisassemblyChildren,
  seedGeneratedAssetIds,
} from '../../../support/helpers/assetIdHelpers';

// ════════════════════════════════════════════════════════════════════════════
// One disposable PO. Components are minted fresh inside each test that
// consumes one, because `Consumed` is terminal for that item — a shared
// component could only be linked once, so reusing one across tests would make
// every test after the first depend on run order.
// ════════════════════════════════════════════════════════════════════════════
describe('Asset ID Assembly API', () => {
  const stamp = `AIDA-${Date.now()}`;
  const poNumber = `PO-AIDA-${Date.now()}`;
  const parentSerial = `SN-AIDA-P-${Date.now()}`;
  const blockedSerial = `SN-AIDA-B-${Date.now()}`;

  let laptopCategoryId;
  let laptopProductId;

  /** Mint one fresh Available component and yield its asset code. */
  const freshComponent = () =>
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((ids) => ids[0]);

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });
    seedAssetIdPo({ td, poNumber, stamp, serials: [parentSerial, blockedSerial] }).then((seed) => {
      laptopProductId = seed.laptopProductId;
      // Fixture for the parent-status gate (TC16). Seeding lives here, never in
      // an it(), so no test inherits another test's side effect.
      return aidMarkStatus({
        poNumber,
        serialNumbers: [blockedSerial],
        status: data.statuses.damaged,
        damageReason: 'Asset ID automation — parent status gate fixture',
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => {
    apiDeletePO(poNumber);
  });

  // ── Auth contract (EP — the no-auth partition) ──────────────────────────

  // EP — no-auth partition
  it('SW-AIDA-API-TC01: POST /products/asset-id/reassembly/link-and-stockout without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('POST', '/products/asset-id/reassembly/link-and-stockout', {
      parentSerialNumber: parentSerial,
      assetCodes: [data.assetCode.epUnknown],
    }).then((res) => {
      expect(res.status, 'an unauthenticated caller must never be able to consume stock').to.equal(401);
    });
  });

  // EP — no-auth partition
  it('SW-AIDA-API-TC02: GET /products/asset-id/lifecycle/:assetId without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('GET', `/products/asset-id/lifecycle/${encodeURIComponent(parentSerial)}`).then((res) => {
      expect(res.status, 'the asset-code lookup is guarded').to.equal(401);
    });
  });

  // ── Step 1 — the parent fetch ───────────────────────────────────────────

  // Use case — main flow step 1: fetch the machine being built
  it('SW-AIDA-API-TC03: fetching the parent serial returns its product, category and status', { tags: ['@smoke'] }, () => {
    aidScan(parentSerial).then((res) => {
      expectPostOk(res, 'the Assembly screen fetches its parent through the same scan route as Disassembly');
      const found = aidData(res).foundItems.find((i) => i.serialNumber === parentSerial);
      expect(found, 'the parent must be resolvable by its exact serial').to.exist;
      expect(found.status, 'only an Available parent can receive components').to.equal(data.statuses.available);
      expect(found.category, 'the parent card shows the category name').to.equal(td.categories.laptop);
    });
  });

  // ── Step 2 — the asset-code lookup that fills the scan table ────────────

  // Use case — main flow step 2: look up a component by its asset code
  it('SW-AIDA-API-TC04: the lifecycle lookup resolves a component asset code to its item', { tags: ['@smoke'] }, () => {
    freshComponent().then((assetCode) => {
      aidLifecycle(assetCode).then((res) => {
        expect(res.status, 'the lookup behind "Add Scan" must succeed').to.equal(200);
        const item = aidData(res).item;
        expect(item.serialNumber, 'the scanned row is keyed by the resolved serial').to.equal(assetCode);
        expect(item.assetId).to.equal(assetCode);
        expect(item.status, 'an unconsumed component reads Available').to.equal(data.statuses.available);
        expect(item.poNumber, 'the scan table shows which PO the component came from').to.equal(poNumber);
      });
    });
  });

  // EP — invalid partition (an asset code nothing carries)
  it('SW-AIDA-API-TC05: an unknown asset code returns a semantic not-found', { tags: ['@regression'] }, () => {
    aidLifecycle(data.assetCode.epUnknown).then((res) => {
      expect(res.status, 'an unknown asset code must not 5xx').to.be.lessThan(500);
      expect(res.status === 404 || res.body?.success === false, 'an unknown asset code must fail semantically').to.be.ok;
    });
  });

  // ── The commit — link and consume ───────────────────────────────────────

  // Use case — main flow: one component into one parent
  it('SW-AIDA-API-TC06: assembling moves the component from Available to Consumed', { tags: ['@smoke'] }, () => {
    let assetCode;
    freshComponent()
      .then((code) => {
        assetCode = code;
        return aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: [assetCode] });
      })
      .then((res) => {
        expectPostOk(res, 'a valid assembly must succeed');
        const payload = aidData(res);
        expect(payload.parentSerialNumber, 'the response echoes the parent').to.equal(parentSerial);
        expect(payload.linkedItems, 'exactly one component was linked').to.have.length(1);
        expect(payload.linkedItems[0].oldStatus, 'the component was Available before the link').to.equal(
          data.statuses.available,
        );
        expect(
          payload.linkedItems[0].newStatus,
          'Consumed — not StockedOut. The component only becomes StockedOut when the PARENT is stocked out',
        ).to.equal(data.statuses.consumed);
        return readItemStatus(assetCode);
      })
      .then((status) => {
        expect(status, 'read back through the lifecycle route, the component must now be Consumed').to.equal(
          data.statuses.consumed,
        );
      });
  });

  // Use case — assembly is a stock-OUT for the component's product
  it('SW-AIDA-API-TC07: assembling decrements available stock by one per component', { tags: ['@regression'] }, () => {
    const componentCount = 2;
    let codes;
    let before;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: componentCount,
    })
      .then((ids) => {
        codes = ids;
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((snapshot) => {
        before = snapshot;
        return aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: codes });
      })
      .then((res) => {
        expectPostOk(res, 'assembling two components at once must succeed');
        expect(aidData(res).linkedItems, 'both components must be linked in one call').to.have.length(componentCount);
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((after) => {
        expect(
          before.availableQuantity - after.availableQuantity,
          'each consumed component leaves available stock — otherwise the parts would be counted twice',
        ).to.equal(componentCount);
        expect(
          after.receivedQuantity,
          'consumption does not un-receive anything — receivedQuantity must be untouched',
        ).to.equal(before.receivedQuantity);
      });
  });

  // State transition — the parent gains a bill of materials but no status change
  it('SW-AIDA-API-TC08: the parent records the assembled component and stays Available', { tags: ['@regression'] }, () => {
    let assetCode;
    freshComponent()
      .then((code) => {
        assetCode = code;
        return aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: [assetCode] });
      })
      .then(() => readItemStatus(parentSerial))
      .then((status) => {
        expect(status, 'the machine being built stays on hand — only its parts are consumed').to.equal(
          data.statuses.available,
        );
        return aidAssembledItems(parentSerial);
      })
      .then((res) => {
        expect(res.status, 'the assembled-items lookup must succeed').to.equal(200);
        const serials = (aidData(res).assembledItems || []).map((i) => i.serialNumber);
        expect(serials, 'the linked component must now be listed under the parent').to.include(assetCode);
      });
  });

  // Use case — the two Disassembly panels stay consistent after an assembly
  it('SW-AIDA-API-TC09: a disassembly child that is later assembled reports its new parent', { tags: ['@regression'] }, () => {
    const donorSerial = parentSerial;
    let childCode;
    seedDisassemblyChildren({
      parentSerialNumber: donorSerial,
      selectedItemSerialNumber: donorSerial,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [childCode] = ids;
        return aidReassemblyLink({ parentSerialNumber: donorSerial, assetCodes: [childCode] });
      })
      .then((res) => {
        expectPostOk(res, 'a disassembly child must be assemblable like any other component');
        return aidGeneratedLabels(donorSerial);
      })
      .then((res) => {
        const row = (aidData(res).generatedLabels || []).find((l) => l.serialNumber === childCode);
        expect(row, 'the child is still listed among the labels generated from this serial').to.exist;
        expect(row.status, 'its status column now reads Consumed').to.equal(data.statuses.consumed);
        expect(
          row.reassembledToSerialNumber,
          'the "Assembled To" column must name the serial it went back into',
        ).to.equal(donorSerial);
      });
  });

  // ── Guards ──────────────────────────────────────────────────────────────

  // EP — invalid partition (no codes at all)
  it('SW-AIDA-API-TC10: an empty asset-code list is rejected', { tags: ['@regression'] }, () => {
    aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: [] }).then((res) => {
      expect(res.status, 'assembling nothing is not a valid operation').to.be.within(400, 499);
    });
  });

  // BVA — upper boundary, just outside the 200-code batch limit
  it('SW-AIDA-API-TC11: more than 200 asset codes in one call is rejected', { tags: ['@regression'] }, () => {
    const tooMany = Array.from(
      { length: data.assetCode.bvaMaxCodesInvalid },
      (_, i) => `${data.assetCode.epUnknown}-${i}`,
    );
    aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: tooMany }).then((res) => {
      expect(
        res.status,
        'the 201-code batch must be refused on size BEFORE any code is looked up',
      ).to.be.within(400, 499);
    });
  });

  // EP — invalid partition (parent that does not exist)
  it('SW-AIDA-API-TC12: an unknown parent serial is rejected', { tags: ['@regression'] }, () => {
    aidReassemblyLink({
      parentSerialNumber: data.serialNumber.epUnknown,
      assetCodes: [data.assetCode.epUnknown],
    }).then((res) => {
      expect(res.status, 'an unknown parent must not 5xx').to.be.lessThan(500);
      expect(res.status >= 400 || res.body?.success === false, 'an unknown parent must fail semantically').to.be.ok;
    });
  });

  // Error guessing — the same code twice in one payload
  it('SW-AIDA-API-TC13: duplicate asset codes are de-duplicated, not double-consumed', { tags: ['@regression'] }, () => {
    let assetCode;
    freshComponent()
      .then((code) => {
        assetCode = code;
        return aidReassemblyLink({
          parentSerialNumber: parentSerial,
          assetCodes: [assetCode, assetCode.toLowerCase()],
        });
      })
      .then((res) => {
        expectPostOk(res, 'a payload carrying the same code twice must still succeed');
        expect(
          aidData(res).linkedItems,
          'the service de-duplicates case-insensitively — a double entry must consume one unit, not two',
        ).to.have.length(1);
      });
  });

  // Error guessing — linking a parent into itself
  it('SW-AIDA-API-TC14: linking the parent serial to itself is rejected', { tags: ['@regression'] }, () => {
    aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: [parentSerial] }).then((res) => {
      expect(res.status, 'a self-link must not 5xx').to.be.lessThan(500);
      expect(
        res.status >= 400 || res.body?.success === false,
        'an item cannot be a component of itself — that would consume the machine being built',
      ).to.be.ok;
    });
  });

  // State transition — an already-Consumed component cannot be consumed again
  it('SW-AIDA-API-TC15: a component that is already Consumed cannot be assembled again', { tags: ['@regression'] }, () => {
    let assetCode;
    freshComponent()
      .then((code) => {
        assetCode = code;
        return aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: [assetCode] });
      })
      .then((res) => {
        expectPostOk(res, 'the first assembly must succeed');
        return aidReassemblyLink({ parentSerialNumber: parentSerial, assetCodes: [assetCode] });
      })
      .then((res) => {
        expect(res.status, 'a repeat link must not 5xx').to.be.lessThan(500);
        expect(
          res.status >= 400 || res.body?.success === false,
          'only Available items may be consumed — re-linking a Consumed part would double-count the consumption',
        ).to.be.ok;
      });
  });

  // Decision table — parent Available × component Available. Column: parent
  // blocked. `blockedSerial` is driven to Damaged in before() (never in an
  // it()), so a tag-filtered run cannot leave this test depending on another
  // test's side effect.
  //
  // Damaged, not StockedOut: driving it out of Available with mark-status needs
  // no General Config flag, whereas a serial-level stock-out is refused when
  // requireWorkOrderForStockOut is on. An earlier revision of this test used
  // stock-out and passed the guard vacuously on QA (the seed silently failed
  // and left the parent Available) — the assertion below now cannot pass unless
  // the parent really is blocked, because the precondition is asserted first.
  it('SW-AIDA-API-TC16: a parent that is not Available cannot receive components', { tags: ['@regression'] }, () => {
    let assetCode;
    freshComponent()
      .then((code) => {
        assetCode = code;
        return readItemStatus(blockedSerial);
      })
      .then((status) => {
        expect(status, 'precondition: the fixture parent really is out of Available').to.equal(data.statuses.damaged);
        return aidReassemblyLink({ parentSerialNumber: blockedSerial, assetCodes: [assetCode] });
      })
      .then((res) => {
        expect(res.status, 'the guarded call must not 5xx').to.be.lessThan(500);
        expect(
          res.status >= 400 || res.body?.success === false,
          'a Damaged machine is not buildable — nothing may be assembled into it',
        ).to.be.ok;
        return readItemStatus(assetCode);
      })
      .then((status) => {
        expect(
          status,
          'the rejected batch must leave the component untouched and still assemblable elsewhere',
        ).to.equal(data.statuses.available);
      });
  });

  // EP — invalid partition (a code that resolves to nothing) rolls the WHOLE
  // batch back, because the loop runs inside one transaction
  it('SW-AIDA-API-TC17: one unknown code in a batch rolls back the entire assembly', { tags: ['@regression'] }, () => {
    let goodCode;
    freshComponent()
      .then((code) => {
        goodCode = code;
        return aidReassemblyLink({
          parentSerialNumber: parentSerial,
          assetCodes: [goodCode, data.assetCode.epUnknown],
        });
      })
      .then((res) => {
        expect(res.status, 'the batch must not 5xx').to.be.lessThan(500);
        expect(res.status >= 400 || res.body?.success === false, 'an unknown code must fail the batch').to.be.ok;
        return readItemStatus(goodCode);
      })
      .then((status) => {
        expect(
          status,
          'the valid component must be untouched — a partial assembly would strand stock in Consumed with no parent',
        ).to.equal(data.statuses.available);
      });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Downstream: what a Consumed component does under the app's other inventory
// operations. Separate describe because it flips a General Config flag and
// must restore it even if a test in the block fails.
// ════════════════════════════════════════════════════════════════════════════
describe('Asset ID Assembly API — consumed-component lifecycle (SW-AIDA-API-TC18..TC22)', () => {
  const stamp = `AIDAD-${Date.now()}`;
  const poNumber = `PO-AIDAD-${Date.now()}`;
  const seedSerial = `SN-AIDAD-${Date.now()}`;

  let laptopCategoryId;
  let laptopProductId;
  let containerTypeId;
  let container;

  const freshParent = () =>
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((ids) => ids[0]);

  // Same factory, second name. A parent and a component are minted identically
  // — a freshly generated asset ID on this PO/category — and only become one or
  // the other by the role they are passed into. The alias keeps each call site
  // reading as the role it needs rather than making the reader infer it.
  const freshComponent = freshParent;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    // NOTE: General Config `requireWorkOrderForStockOut` is deliberately NOT
    // touched here. The cascade and detach TCs need a plain serial-level
    // stock-out, and aidStockOutSerial() already defaults an orderNumber
    // (`REF-AIDL-${Date.now()}`, assetIdHelpers.js) which neither passes
    // explicitly — so the policy is satisfied either way. Flipping a global
    // config from a spec would leak into every other suite sharing QA if the
    // run aborted before after().
    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });
    seedAssetIdPo({ td, poNumber, stamp, serials: [seedSerial] })
      .then((seed) => {
        laptopProductId = seed.laptopProductId;
        return createContainerTypeViaApi(disposableTypeName('AidaType'));
      })
      .then((type) => {
        containerTypeId = type?.id;
        return createContainerWithCapacity(containerTypeId, data.container.maxItemsRoomy);
      })
      .then((c) => {
        container = c;
      });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => {
    if (container?.id) emptyContainerViaApi(container.id).then(() => deleteContainerViaApi(container.id));
    if (containerTypeId) deleteContainerTypeViaApi(containerTypeId);
    apiDeletePO(poNumber);
  });

  // Use case — consuming a component takes it out of its physical container
  it('SW-AIDA-API-TC18: assembling a component checks it out of the container holding it', { tags: ['@regression'] }, function () {
    if (!container?.code) this.skip();
    let parent;
    let component;
    freshParent()
      .then((p) => {
        parent = p;
        return freshComponent();
      })
      .then((c) => {
        component = c;
        return aidAssignSerialToContainer({ containerCode: container.code, serialNumber: component });
      })
      .then((res) => {
        expect(res.status, 'seeding the component into a container must succeed').to.be.lessThan(400);
        return getContainerSerials(container.id);
      })
      .then((serials) => {
        expect(serials, 'precondition: the component is physically in the container').to.include(component);
        return aidReassemblyLink({ parentSerialNumber: parent, assetCodes: [component] });
      })
      .then((res) => {
        expectPostOk(res, 'assembling a container-held component must succeed');
        return getContainerSerials(container.id);
      })
      .then((serials) => {
        expect(
          serials,
          'a part that is now inside a machine cannot still be sitting in a tote — the container must release it',
        ).to.not.include(component);
      });
  });

  // State transition — the Consumed -> StockedOut CASCADE
  it('SW-AIDA-API-TC19: stocking out the parent cascades its Consumed components to StockedOut', { tags: ['@regression'] }, () => {
    let parent;
    let component;
    freshParent()
      .then((p) => {
        parent = p;
        return freshComponent();
      })
      .then((c) => {
        component = c;
        return aidReassemblyLink({ parentSerialNumber: parent, assetCodes: [component] });
      })
      .then((res) => {
        expectPostOk(res, 'the assembly that sets up the cascade must succeed');
        return readItemStatus(component);
      })
      .then((status) => {
        expect(status, 'precondition: the component is Consumed, not yet StockedOut').to.equal(data.statuses.consumed);
        return aidStockOutSerial({
          serialNumber: parent,
          reason: 'Sold',
          description: 'Asset ID automation — cascade',
        });
      })
      .then((res) => {
        expect(res.status, 'stocking out the assembled machine must not 5xx').to.be.lessThan(500);
        expect(res.body?.success !== false, `parent stock-out must succeed — ${JSON.stringify(res.body?.error ?? {})}`)
          .to.be.true;
        return readItemStatus(parent);
      })
      .then((status) => {
        expect(status, 'the parent itself is now StockedOut').to.equal(data.statuses.stockedOut);
        return readItemStatus(component);
      })
      .then((status) => {
        expect(
          status,
          'the component shipped inside the machine — it must follow the parent from Consumed to StockedOut',
        ).to.equal(data.statuses.stockedOut);
      });
  });

  // State transition — the inverse of an assembly, via restock-by-serial-number.
  //
  // CONFIRMED DEFECT (found by a live run, not predicted from the source):
  // `restockBySerialNumber` (product-stock-out.service.ts:1203) clears the
  // COMPONENT's own `lineage.reassembledToSerialNumber`, but it never calls
  // `removeConsumedItemFromParent`. Its sibling `markAvailable` (:3556) DOES —
  // see TC23, which proves the other route behaves correctly. So after a
  // restock the part is back on the shelf and freely assemblable into a second
  // machine, while the FIRST machine still lists it in "Assembled Items". The
  // parent's bill of materials silently over-reports.
  //
  // The current, wrong behaviour is asserted deliberately (repo convention for
  // a confirmed defect) so the suite stays green AND this test flips red the
  // day the two routes are aligned. Tracked in
  // cypress/qa/testPlans/assetId/pending.md.
  it('SW-AIDA-API-TC20: restocking a Consumed component frees the part but leaves it on the parent bill of materials (confirmed defect)', { tags: ['@regression'] }, () => {
    let parent;
    let component;
    freshParent()
      .then((p) => {
        parent = p;
        return freshComponent();
      })
      .then((c) => {
        component = c;
        return aidReassemblyLink({ parentSerialNumber: parent, assetCodes: [component] });
      })
      .then((res) => {
        expectPostOk(res, 'the assembly being undone must succeed first');
        return aidRestockSerial({ serialNumber: component, description: 'Asset ID automation — detach' });
      })
      .then((res) => {
        expect(res.status, 'restocking a Consumed component must not 5xx').to.be.lessThan(500);
        return readItemStatus(component);
      })
      .then((status) => {
        expect(status, 'the part itself is correctly returned to Available').to.equal(data.statuses.available);
        return aidLifecycle(component);
      })
      .then((res) => {
        expect(
          aidData(res).item?.lineage?.reassembledToSerialNumber,
          'the component side IS cleaned up — its own lineage no longer points at a parent',
        ).to.be.null;
        return aidAssembledItems(parent);
      })
      .then((res) => {
        const serials = (aidData(res).assembledItems || []).map((i) => i.serialNumber);
        expect(
          serials,
          'DEFECT: the parent still lists a part that is back on the shelf — restock skips removeConsumedItemFromParent, unlike mark-available (TC23)',
        ).to.include(component);
      });
  });

  // Use case — the ledger round-trips across consume + restock
  it('SW-AIDA-API-TC21: consuming then restocking a component leaves available stock unchanged', { tags: ['@regression'] }, () => {
    let parent;
    let component;
    let baseline;
    freshParent()
      .then((p) => {
        parent = p;
        return freshComponent();
      })
      .then((c) => {
        component = c;
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((snapshot) => {
        baseline = snapshot;
        return aidReassemblyLink({ parentSerialNumber: parent, assetCodes: [component] });
      })
      .then(() => readPoQuantities(poNumber, laptopProductId))
      .then((afterConsume) => {
        expect(
          baseline.availableQuantity - afterConsume.availableQuantity,
          'consuming one component removes exactly one unit',
        ).to.equal(1);
        return aidRestockSerial({ serialNumber: component, description: 'Asset ID automation — ledger restore' });
      })
      .then(() => readPoQuantities(poNumber, laptopProductId))
      .then((afterRestock) => {
        expect(
          afterRestock.availableQuantity,
          'the inverse operation must restore the ledger exactly — no drift across the consume/restock pair',
        ).to.equal(baseline.availableQuantity);
      });
  });

  // Use case — end-to-end traceability of an assembled machine
  it('SW-AIDA-API-TC22: the lifecycle of an assembled component names the parent it went into', { tags: ['@regression'] }, () => {
    let parent;
    let component;
    freshParent()
      .then((p) => {
        parent = p;
        return freshComponent();
      })
      .then((c) => {
        component = c;
        return aidReassemblyLink({ parentSerialNumber: parent, assetCodes: [component] });
      })
      .then(() => aidLifecycle(component))
      .then((res) => {
        expect(res.status, 'the lifecycle route must resolve a Consumed component').to.equal(200);
        const payload = aidData(res);
        expect(payload.item.status, 'the component reads Consumed').to.equal(data.statuses.consumed);
        expect(
          payload.item.lineage?.reassembledToSerialNumber,
          'the lineage must name the machine this part went into',
        ).to.equal(parent);
        const targets = (payload.reassembly?.targets || []).map((t) => t.parentSerialNumber);
        expect(targets, 'the reassembly history must carry the same parent').to.include(parent);
      });
  });

  // Decision table — the two routes back to Available, side by side. This is
  // the CORRECT column: markAvailable() calls removeConsumedItemFromParent(),
  // so the parent's bill of materials is cleaned up. TC20 is the same scenario
  // through restock-by-serial-number, where it is not. Running both is what
  // turns "restock looks wrong" into "the two routes disagree".
  it('SW-AIDA-API-TC23: mark-available on a Consumed component detaches it from the parent bill of materials', { tags: ['@regression'] }, () => {
    let parent;
    let component;
    freshParent()
      .then((p) => {
        parent = p;
        return freshComponent();
      })
      .then((c) => {
        component = c;
        return aidReassemblyLink({ parentSerialNumber: parent, assetCodes: [component] });
      })
      .then((res) => {
        expectPostOk(res, 'the assembly being undone must succeed first');
        return aidAssembledItems(parent);
      })
      .then((res) => {
        const serials = (aidData(res).assembledItems || []).map((i) => i.serialNumber);
        expect(serials, 'precondition: the parent lists the component').to.include(component);
        return aidMarkAvailable({ serialNumber: component, poNumber });
      })
      .then((res) => {
        expect(res.status, 'mark-available must not 5xx on a Consumed component').to.be.lessThan(500);
        expect(
          res.body?.success !== false,
          `mark-available must succeed — ${JSON.stringify(res.body?.error ?? {})}`,
        ).to.be.true;
        return readItemStatus(component);
      })
      .then((status) => {
        expect(status, 'the part is back on the shelf').to.equal(data.statuses.available);
        return aidAssembledItems(parent);
      })
      .then((res) => {
        const serials = (aidData(res).assembledItems || []).map((i) => i.serialNumber);
        expect(
          serials,
          'this route removes the entry from the parent lineage — the behaviour restock-by-serial-number is missing (TC20)',
        ).to.not.include(component);
      });
  });
});
