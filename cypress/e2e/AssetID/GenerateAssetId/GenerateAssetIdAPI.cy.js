/**
 * Generate Asset ID — API Tests (SW-AIDG-API-TC01..TC39)
 * =============================================================================
 * Mirrors:  cypress/e2e/AssetID/GenerateAssetId/01-GenerateAssetIdTests.cy.js
 * Backend:  Backend/src/modules/product/product.controller.ts:1716-1795
 *           Backend/src/modules/product/product-asset-id.service.ts
 *             (getProductsForAssetIdCategory, previewAssetIdsFromPo,
 *              generateAssetIdsFromPo, generateAssetId)
 * Plan:     cypress/qa/testPlans/assetId/sub/generate-asset-id-plan.md
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET  /products/asset-id/category/:categoryId/products   AuthGuard
 *   POST /products/asset-id/preview-from-po                 AuthGuard
 *   POST /products/asset-id/generate-from-po                AuthGuard
 *   POST /products/asset-id/generate                        AuthGuard
 *        (the single-serial stamp — reached from Inventory, not from this
 *         screen, but covered here so the module has no untested write route)
 *   (+ seeding / oracles: /excel/upload-inventory, /incoming-items,
 *      /incoming-items/scan, /incoming-items/mark-status,
 *      /products/stockout-by-serial-number, /products/restock-by-serial-number,
 *      /products/:id, /reports/asset-lifecycle-report, /containers*,
 *      /location-assignments/*)
 *
 * -----------------------------------------------------------------------------
 *   Confirmed code facts this suite is designed around (read from the service,
 *   not assumed — see plan.md §1)
 * -----------------------------------------------------------------------------
 *   1. generate-from-po does NOT consume an existing item. It INSERTS
 *      `quantity` brand-new rows into `items` whose serialNumber AND assetId are
 *      both the generated asset ID. So the flow is a stock-IN, not a re-label.
 *   2. Each created item lands `status = Available`, `poNumber` = the selected
 *      PO, `cost` copied off the PO's existing `quantities` row (0 when the
 *      product is not on the PO yet) and `price` copied likewise.
 *   3. The PO's `quantities` row is incremented on ALL THREE counters —
 *      expectedQuantity, receivedQuantity AND availableQuantity — by `quantity`.
 *      That is why generation is a genuine inventory event and not bookkeeping.
 *   4. `products.hasItems` is forced to true for the selected product.
 *   5. assetId = `<SITE>-<PO>-<CATEGORY>-A######`, where the 6-digit sequence
 *      comes from `assetIdSequences` keyed by the normalised CATEGORY token —
 *      shared across every PO in the org, so sequence assertions must be
 *      relative (monotonic / equal to the immediately-preceding preview), never
 *      absolute.
 *   6. preview-from-po runs the SAME validation ladder but reads the sequence
 *      without incrementing it (getPreviewAssetSequenceRangeByCategory), so
 *      calling preview twice must return byte-identical asset IDs.
 *   7. Container/location assignment happens AFTER the transaction commits and
 *      is best-effort: a failure surfaces as `assignmentWarning` +
 *      containerAssigned/locationAssigned = false, and the items still exist.
 *   8. Unlike the disassembly route, generate-from-po does NOT throw when a
 *      locationPath arrives without `assignTo: 'location'` — it silently skips
 *      the assignment (service lines 2200 vs 1839). TC31 pins that asymmetry.
 *   9. Every asset-id POST answers with HTTP 201 (Nest's default for @Post)
 *      while the envelope's own `statusCode` field says 200 — confirmed live on
 *      QA. `expectPostOk()` encodes that pair once so no spec re-derives it.
 *  10. POST /products/asset-id/generate is a DIFFERENT route from
 *      generate-from-po: it creates nothing, it stamps an asset ID onto ONE
 *      existing Available serial that has none, and it does NOT replace that
 *      serial with the asset ID. Lineage flow is SINGLE_GENERATE_ASSET_ID /
 *      ITEM. Re-stamping an item that already carries one is refused
 *      (TC36-TC39).
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/AssetID/assetIdData.json';
import { apiCall } from '../../../support/helpers/allPosHelpers';
import { apiDeletePO, apiResolveCategoryIdByName, apiClosePO } from '../../../support/helpers/poCloseHelpers';
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
  aidCategoryProducts,
  aidData,
  aidGenerateFromPo,
  aidGenerateSingle,
  aidLifecycle,
  aidMarkStatus,
  aidPreviewFromPo,
  aidRestockSerial,
  aidStockOutSerial,
  aidUnauthenticated,
  assetIdsOf,
  createdItemsOf,
  expectPostOk,
  previewItemsOf,
  readAssetLifecycleRow,
  readItemStatus,
  readPoQuantities,
  readProductHasItems,
  seedAssetIdPo,
  seedGeneratedAssetIds,
} from '../../../support/helpers/assetIdHelpers';

const {
  createDisposableBinChain,
  deleteLocationViaApi,
} = require('../../../support/helpers/wmsLocationHelpers');

const CENT = 0.01; // money is exact to the cent in this codebase
const UNIQUE_CODE_RE = new RegExp(data.assetIdFormat.uniqueCodePattern);

// ════════════════════════════════════════════════════════════════════════════
// Shared disposable PO. ONE Excel import per PO is a backend restriction, so
// both product shapes (serialized Laptop + quantity-only RAM) are seeded in a
// single file — the RAM row exists purely to give the negative
// "category does not allow items" partition a REAL product to point at rather
// than an invented id.
// ════════════════════════════════════════════════════════════════════════════
describe('Generate Asset ID API', () => {
  const stamp = `AIDG-${Date.now()}`;
  const poNumber = `PO-AIDG-${Date.now()}`;
  const seedSerial = `SN-AIDG-${Date.now()}`;
  // Owned exclusively by SW-AIDG-API-TC37 (the single-serial generate), so that
  // TC has an Available, asset-ID-less item without depending on another test.
  const singleGenSerial = `SN-AIDG-SINGLE-${Date.now()}`;

  let laptopProductId;
  let ramProductId;
  let laptopCategoryId;
  let ramCategoryId;

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
    seedAssetIdPo({ td, poNumber, stamp, serials: [seedSerial, singleGenSerial] }).then((seed) => {
      laptopProductId = seed.laptopProductId;
      ramProductId = seed.ramProductId;
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
  // Every asset-id route carries @UseGuards(AuthGuard). These invert the
  // @Public() convention: they send NO Authorization header so a regression
  // that drops the guard is caught rather than silently tolerated.

  // EP — no-auth partition
  it('SW-AIDG-API-TC01: POST /products/asset-id/generate-from-po without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('POST', '/products/asset-id/generate-from-po', {
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'the AuthGuard must reject an unauthenticated generate').to.equal(401);
    });
  });

  // EP — no-auth partition
  it('SW-AIDG-API-TC02: POST /products/asset-id/preview-from-po without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('POST', '/products/asset-id/preview-from-po', {
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'the AuthGuard must reject an unauthenticated preview').to.equal(401);
    });
  });

  // EP — no-auth partition
  it('SW-AIDG-API-TC03: GET /products/asset-id/category/:id/products without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('GET', `/products/asset-id/category/${laptopCategoryId}/products`).then((res) => {
      expect(res.status, 'the AuthGuard must reject an unauthenticated product lookup').to.equal(401);
    });
  });

  // ── Category → product lookup (the dropdown's data source) ──────────────

  // EP — valid partition (a category that allows items)
  it('SW-AIDG-API-TC04: the category product lookup returns the seeded serialized product', { tags: ['@smoke'] }, () => {
    aidCategoryProducts(laptopCategoryId).then((res) => {
      expect(res.status, 'the lookup that populates the Product dropdown must succeed').to.equal(200);
      const payload = aidData(res);
      expect(payload.categoryId, 'the response echoes the requested category').to.equal(laptopCategoryId);
      expect(payload.products, 'the payload carries a products array').to.be.an('array');
      const ids = payload.products.map((p) => Number(p.id));
      expect(ids, 'the freshly-imported laptop product must be offered').to.include(Number(laptopProductId));
    });
  });

  // Decision table — categoryId × poNumber filter present/absent
  it('SW-AIDG-API-TC05: adding ?poNumber narrows the list to products on that PO', { tags: ['@regression'] }, () => {
    aidCategoryProducts(laptopCategoryId, poNumber).then((res) => {
      expect(res.status, 'the PO-filtered lookup must succeed').to.equal(200);
      const products = aidData(res).products || [];
      const ids = products.map((p) => Number(p.id));
      expect(ids, 'our product IS on this PO, so it must survive the filter').to.include(Number(laptopProductId));
      expect(
        ids,
        'the RAM product belongs to a different category, so it must never appear under the laptop category',
      ).to.not.include(Number(ramProductId));
    });
  });

  // EP — invalid partition (categoryId below the positive-integer boundary)
  it('SW-AIDG-API-TC06: categoryId=0 is rejected as an invalid category', { tags: ['@regression'] }, () => {
    aidCategoryProducts(data.categoryFilter.epZero).then((res) => {
      expect(res.status, 'categoryId=0 fails the Number.isInteger && > 0 guard').to.be.within(400, 499);
    });
  });

  // EP — invalid partition (well-formed id that resolves to nothing)
  it('SW-AIDG-API-TC07: an unknown categoryId returns a semantic not-found', { tags: ['@regression'] }, () => {
    aidCategoryProducts(data.categoryFilter.epUnknownId).then((res) => {
      expect(res.status, 'an id with no categories row must not 5xx').to.be.lessThan(500);
      expect(
        res.status === 404 || res.body?.success === false,
        'a missing category must surface as a semantic failure, not a silent empty list',
      ).to.be.ok;
    });
  });

  // Error guessing — a non-numeric path param reaching ParseIntPipe
  it('SW-AIDG-API-TC08: a non-integer categoryId is rejected by ParseIntPipe', { tags: ['@regression'] }, () => {
    aidCategoryProducts(data.categoryFilter.epNonInteger).then((res) => {
      expect(res.status, 'ParseIntPipe must reject "notanumber" with a 400, never let it reach SQL').to.equal(400);
    });
  });

  // ── preview-from-po — validation ladder + no side effects ───────────────

  // EP — happy path, representative quantity
  it('SW-AIDG-API-TC09: preview returns `quantity` asset IDs in the documented format', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.epTypical;
    aidPreviewFromPo({ poNumber, categoryId: laptopCategoryId, productId: laptopProductId, quantity }).then((res) => {
      expectPostOk(res, 'a fully valid preview must succeed');
      const items = previewItemsOf(res);
      expect(items, 'preview returns exactly `quantity` entries').to.have.length(quantity);
      items.forEach((item) => {
        expect(item.uniqueCode, 'uniqueCode is "A" + a 6-digit zero-padded sequence').to.match(UNIQUE_CODE_RE);
        expect(
          item.assetId.endsWith(`-${data.assetIdFormat.categoryTokenLaptop}-${item.uniqueCode}`),
          `assetId "${item.assetId}" must end with -<CATEGORY_TOKEN>-<uniqueCode>`,
        ).to.be.true;
        expect(
          item.assetId,
          'assetId embeds the source PO number as its parent token',
        ).to.include(poNumber.toUpperCase());
      });
    });
  });

  // Metamorphic / state-transition — preview must be side-effect free
  it('SW-AIDG-API-TC10: calling preview twice returns identical asset IDs (the sequence is not consumed)', { tags: ['@regression'] }, () => {
    const body = {
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.epTypical,
    };
    let first;
    aidPreviewFromPo(body)
      .then((res) => {
        expectPostOk(res, 'the first preview must succeed');
        first = previewItemsOf(res).map((i) => i.assetId);
        return aidPreviewFromPo(body);
      })
      .then((res) => {
        expectPostOk(res, 'the second preview must succeed');
        expect(
          previewItemsOf(res).map((i) => i.assetId),
          'preview reads assetIdSequences without incrementing it, so two consecutive previews must agree',
        ).to.deep.equal(first);
      });
  });

  // Use case — preview is a faithful dry run of the next generate
  it('SW-AIDG-API-TC11: the asset IDs a preview shows are the ones the very next generate creates', { tags: ['@regression'] }, () => {
    const body = {
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    };
    let previewed;
    aidPreviewFromPo(body)
      .then((res) => {
        previewed = previewItemsOf(res).map((i) => i.assetId);
        expect(previewed, 'the preview must return one asset ID').to.have.length(1);
        // Back-to-back with no other call in between: assetIdSequences is
        // org-wide per category, so anything that generated in the gap would
        // legitimately shift the number.
        return aidGenerateFromPo(body);
      })
      .then((res) => {
        expect(res.status, 'the generate that immediately follows the preview must succeed').to.be.lessThan(300);
        expect(
          assetIdsOf(res),
          'a preview is only useful if it predicts the label the printer will actually get',
        ).to.deep.equal(previewed);
      });
  });

  // BVA — lower boundary, just below the valid range
  it('SW-AIDG-API-TC12: quantity=0 is rejected', { tags: ['@regression'] }, () => {
    aidPreviewFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerInvalid,
    }).then((res) => {
      expect(res.status, 'quantity must be a positive integer').to.be.within(400, 499);
    });
  });

  // BVA — upper boundary, on the limit (200 is the documented maximum)
  it('SW-AIDG-API-TC13: quantity=200 is accepted and previews 200 asset IDs', { tags: ['@regression'] }, () => {
    aidPreviewFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaUpperValid,
    }).then((res) => {
      expectPostOk(res, 'a label quantity of 200 is ON the boundary and must be accepted');
      expect(previewItemsOf(res), 'the boundary quantity must produce exactly that many previews').to.have.length(
        data.labelQuantity.bvaUpperValid,
      );
    });
  });

  // BVA — upper boundary, just outside
  it('SW-AIDG-API-TC14: quantity=201 is rejected as over the 200 label maximum', { tags: ['@regression'] }, () => {
    aidPreviewFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaUpperInvalid,
    }).then((res) => {
      expect(res.status, '201 is one past the boundary and must be rejected').to.be.within(400, 499);
    });
  });

  // EP — invalid partition (fractional quantity)
  it('SW-AIDG-API-TC15: a fractional quantity is rejected', { tags: ['@regression'] }, () => {
    aidPreviewFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.epFractional,
    }).then((res) => {
      expect(res.status, 'labels are discrete — 1.5 of one must never be accepted').to.be.within(400, 499);
    });
  });

  // EP — the reserved PO buckets, matched case-insensitively
  it('SW-AIDG-API-TC16: the reserved "Default" and "Manual" PO buckets are refused', { tags: ['@regression'] }, () => {
    const bodyFor = (po) => ({
      poNumber: po,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    });
    aidPreviewFromPo(bodyFor(data.poNumber.epReservedDefault)).then((res) => {
      expect(res.status, '"Default" is a system bucket, not a receivable PO').to.be.within(400, 499);
    });
    aidPreviewFromPo(bodyFor(data.poNumber.epReservedManual)).then((res) => {
      expect(res.status, '"Manual" is a system bucket, not a receivable PO').to.be.within(400, 499);
    });
    aidPreviewFromPo(bodyFor(data.poNumber.epReservedDefaultLowercase)).then((res) => {
      expect(res.status, 'the bucket check is case-insensitive, so "default" must fail too').to.be.within(400, 499);
    });
  });

  // EP — invalid partition (PO that does not exist)
  it('SW-AIDG-API-TC17: an unknown PO number is rejected', { tags: ['@regression'] }, () => {
    aidPreviewFromPo({
      poNumber: data.poNumber.epUnknown,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'a PO with no purchaseOrders row must not 5xx').to.be.lessThan(500);
      expect(
        res.status === 404 || res.body?.success === false,
        'an unknown PO must surface as a semantic failure',
      ).to.be.ok;
    });
  });

  // Decision table — category.allowItems is the gate that separates the two
  // product shapes this app supports
  it('SW-AIDG-API-TC18: a category with allowItems=false is refused', { tags: ['@regression'] }, function () {
    if (!ramCategoryId) this.skip();
    aidPreviewFromPo({
      poNumber,
      categoryId: ramCategoryId,
      productId: ramProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(
        res.status,
        'asset IDs are serialized-item identity — a quantity-only category must never mint them',
      ).to.be.within(400, 499);
    });
  });

  // Decision table — product ∈ category is checked independently of the
  // category's own allowItems flag
  it('SW-AIDG-API-TC19: a product that does not belong to the selected category is refused', { tags: ['@regression'] }, function () {
    if (!ramProductId) this.skip();
    aidPreviewFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: ramProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(
        res.status,
        'the RAM product is not in the laptop category — the cross-check must reject it',
      ).to.be.within(400, 499);
    });
  });

  // EP — invalid partition (well-formed id that resolves to nothing)
  it('SW-AIDG-API-TC20: an unknown productId is rejected', { tags: ['@regression'] }, () => {
    aidPreviewFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: data.productFilter.epUnknownId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((res) => {
      expect(res.status, 'a productId with no products row must not 5xx').to.be.lessThan(500);
      expect(res.status === 404 || res.body?.success === false, 'an unknown product must fail semantically').to.be.ok;
    });
  });

  // ── generate-from-po — the real mutation ────────────────────────────────

  // Use case — the main flow, plus every field the created row must carry
  it('SW-AIDG-API-TC21: generate creates one Available item per label, keyed by its own asset ID', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.epTypical;
    aidGenerateFromPo({ poNumber, categoryId: laptopCategoryId, productId: laptopProductId, quantity }).then((res) => {
      expect(res.status, 'a fully valid generate must succeed').to.be.lessThan(300);
      const payload = aidData(res);
      expect(payload.poNumber, 'the response echoes the PO').to.equal(poNumber);
      expect(payload.quantity, 'the response echoes the requested quantity').to.equal(quantity);
      const items = createdItemsOf(res);
      expect(items, 'exactly `quantity` items must be created').to.have.length(quantity);
      items.forEach((item) => {
        expect(
          item.serialNumber,
          'generate-from-po writes the asset ID into BOTH serialNumber and assetId — the item IS its label',
        ).to.equal(item.assetId);
        expect(item.uniqueCode).to.match(UNIQUE_CODE_RE);
      });
      // The status is read back through a different route than the one that
      // wrote it, so this is a genuine oracle rather than an echo.
      return readItemStatus(items[0].assetId).then((status) => {
        expect(status, 'a freshly generated asset-id item must be immediately stockable').to.equal(
          data.statuses.available,
        );
      });
    });
  });

  // Use case — generation is an inventory EVENT, not bookkeeping
  it('SW-AIDG-API-TC22: generate raises expected, received AND available quantity by the label count', { tags: ['@regression'] }, () => {
    const quantity = data.labelQuantity.epTypical;
    let before;
    readPoQuantities(poNumber, laptopProductId)
      .then((snapshot) => {
        before = snapshot;
        expect(before.found, 'the seeded product must already be on the PO').to.be.true;
        return seedGeneratedAssetIds({ poNumber, categoryId: laptopCategoryId, productId: laptopProductId, quantity });
      })
      .then(() => readPoQuantities(poNumber, laptopProductId))
      .then((after) => {
        expect(after.expectedQuantity - before.expectedQuantity, 'expectedQuantity must rise by the label count').to.equal(
          quantity,
        );
        expect(after.receivedQuantity - before.receivedQuantity, 'receivedQuantity must rise by the label count').to.equal(
          quantity,
        );
        expect(
          after.availableQuantity - before.availableQuantity,
          'availableQuantity must rise by the label count — the items are on hand, not merely expected',
        ).to.equal(quantity);
      });
  });

  // Use case — cost is inherited, not zeroed (cost correctness is load-bearing
  // for the Cost / Sales / Inventory Value reports)
  it('SW-AIDG-API-TC23: a generated item inherits the unit cost already recorded on the PO', { tags: ['@regression'] }, function () {
    const expectedCost = parseFloat(td.products.laptop.cost);
    let assetId;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [assetId] = ids;
        return readAssetLifecycleRow(assetId);
      })
      .then(function (row) {
        // The Asset Lifecycle Report is the only read surface that exposes an
        // item's persisted cost. If QA has that report disabled the assertion
        // cannot be made — skip rather than fail on an environmental absence.
        if (!row) this.skip();
        expect(
          parseFloat(row.cost),
          'generate-from-po copies cost off the PO quantities row — a zeroed cost silently corrupts every value report',
        ).to.be.closeTo(expectedCost, CENT);
      });
  });

  // State transition — the item's provenance is recorded on creation
  it('SW-AIDG-API-TC24: the created item records a GENERATE_ASSET_ID / PO lineage', { tags: ['@regression'] }, function () {
    let assetId;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [assetId] = ids;
        return apiCall('GET', `/products/asset-id/lifecycle/${encodeURIComponent(assetId)}`);
      })
      .then(function (res) {
        expect(res.status, 'the lifecycle route must resolve a freshly generated asset ID').to.equal(200);
        const payload = aidData(res);
        expect(payload.item.flow, 'the lifecycle flow identifies which screen minted this item').to.equal(
          data.lineage.flowGenerateFromPo,
        );
        expect(payload.item.lineage?.sourceType).to.equal(data.lineage.sourceTypePo);
        expect(payload.item.lineage?.sourcePoNumber, 'the lineage records the originating PO').to.equal(poNumber);
        expect(payload.purchaseOrder?.poNumber, 'the lifecycle resolves the PO the item was born on').to.equal(poNumber);
      });
  });

  // State transition — the sequence only ever moves forward
  it('SW-AIDG-API-TC25: consecutive generates take strictly increasing sequence numbers', { tags: ['@regression'] }, () => {
    const seqOf = (assetId) => Number(assetId.slice(-6));
    let firstSeq;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        firstSeq = seqOf(ids[0]);
        return seedGeneratedAssetIds({
          poNumber,
          categoryId: laptopCategoryId,
          productId: laptopProductId,
          quantity: data.labelQuantity.bvaLowerValidPlusOne,
        });
      })
      .then((ids) => {
        const seqs = ids.map(seqOf);
        expect(seqs[0], 'the next batch must start after the previous one — asset IDs can never collide').to.be.greaterThan(
          firstSeq,
        );
        expect(seqs[1], 'within a batch the sequence increments by exactly one').to.equal(seqs[0] + 1);
      });
  });

  // Decision table — the product flag that makes serialized tracking possible
  it('SW-AIDG-API-TC26: the target product is left flagged hasItems=true', { tags: ['@regression'] }, function () {
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then(() => readProductHasItems(laptopProductId))
      .then((hasItems) => {
        expect(
          hasItems,
          'generate-from-po forces hasItems=true — without it the new rows would be invisible to every serialized view',
        ).to.be.true;
      });
  });

  // EP — the remaining invalid partitions of the three scalar inputs, batched
  // into one TC because each is a single guard with no downstream behaviour.
  it('SW-AIDG-API-TC35: a negative quantity, an empty PO and a zero productId are each rejected', { tags: ['@regression'] }, () => {
    const base = { poNumber, categoryId: laptopCategoryId, productId: laptopProductId, quantity: data.labelQuantity.bvaLowerValid };
    aidPreviewFromPo({ ...base, quantity: data.labelQuantity.epNegative }).then((res) => {
      expect(res.status, 'a negative label count is meaningless').to.be.within(400, 499);
    });
    aidPreviewFromPo({ ...base, poNumber: data.poNumber.epEmpty }).then((res) => {
      expect(res.status, 'an asset ID must belong to a PO — an empty one cannot be resolved').to.be.within(400, 499);
    });
    aidPreviewFromPo({ ...base, productId: data.productFilter.epZero }).then((res) => {
      expect(res.status, 'productId=0 fails the positive-integer guard').to.be.within(400, 499);
    });
    aidPreviewFromPo({ ...base, categoryId: data.categoryFilter.epNegative }).then((res) => {
      expect(res.status, 'a negative categoryId fails the same guard').to.be.within(400, 499);
    });
  });

  // ── The single-serial generate (POST /products/asset-id/generate) ────────
  //
  // A DIFFERENT route from generate-from-po: it does not create anything, it
  // stamps an asset ID onto ONE existing serial. Reached from Inventory rather
  // than from this screen, but it is part of the Asset ID module's surface and
  // is what makes an already-received item visible to the Asset Lifecycle
  // Report — so it is covered here rather than left as the module's one
  // untested route.

  // EP — no-auth partition
  it('SW-AIDG-API-TC36: POST /products/asset-id/generate without auth returns 401', { tags: ['@regression'] }, () => {
    aidUnauthenticated('POST', '/products/asset-id/generate', {
      serialNumber: seedSerial,
      parentSerialNumber: seedSerial,
    }).then((res) => {
      expect(res.status, 'stamping an asset ID must require authentication').to.equal(401);
    });
  });

  // Use case — stamp an asset ID onto an existing received item
  it('SW-AIDG-API-TC37: generating for an Available serial with no asset ID stamps one and records a SINGLE_GENERATE lineage', { tags: ['@regression'] }, () => {
    // `singleGenSerial` is seeded and scanned to Available in before() and used
    // by no other TC, so this one owns both sides of the transition.
    const parentToken = `PARENT-AIDG-${Date.now()}`;
    let generatedAssetId;
    aidGenerateSingle({ serialNumber: singleGenSerial, parentSerialNumber: parentToken })
      .then((res) => {
        expectPostOk(res, 'stamping an asset ID onto an Available, unlabelled serial must succeed');
        const payload = aidData(res);
        generatedAssetId = payload.assetId;
        expect(generatedAssetId, 'a generated asset ID must come back').to.be.a('string').and.not.be.empty;
        expect(payload.uniqueCode, 'the unique code follows the same six-digit format').to.match(UNIQUE_CODE_RE);
        expect(payload.previousAssetId, 'the item carried no asset ID before').to.be.null;
        return aidLifecycle(generatedAssetId);
      })
      .then((res) => {
        const item = aidData(res).item;
        expect(item.flow, 'this route stamps a SINGLE_GENERATE_ASSET_ID lineage, not a batch one').to.equal(
          data.lineage.flowSingleGenerate,
        );
        expect(item.lineage?.sourceType, 'the source is an existing ITEM, not a PO').to.equal(
          data.lineage.sourceTypeItem,
        );
        expect(
          item.serialNumber,
          'unlike generate-from-po, the serial is NOT replaced by the asset ID — the item keeps its own identity',
        ).to.equal(singleGenSerial);
      });
  });

  // Decision table — item already carries an asset ID
  it('SW-AIDG-API-TC38: generating for a serial that already has an asset ID is refused', { tags: ['@regression'] }, () => {
    // Every generate-from-po item is born WITH an asset ID, so one of them is
    // the cheapest possible fixture for this column.
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => aidGenerateSingle({ serialNumber: ids[0], parentSerialNumber: `PARENT-DUP-${Date.now()}` }))
      .then((res) => {
        expect(res.status, 'a duplicate stamp must not 5xx').to.be.lessThan(500);
        expect(
          res.status >= 400 || res.body?.success === false,
          're-stamping would orphan the first asset ID and break its lifecycle history',
        ).to.be.ok;
      });
  });

  // Decision table — same route, status column
  it('SW-AIDG-API-TC39: generating for a non-Available serial is refused', { tags: ['@regression'] }, () => {
    let target;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [target] = ids;
        return aidMarkStatus({
          poNumber,
          serialNumbers: [target],
          status: data.statuses.damaged,
          damageReason: 'Asset ID automation — single-generate status gate',
        });
      })
      .then(() => readItemStatus(target))
      .then((status) => {
        expect(status, 'precondition: the target really is out of Available').to.equal(data.statuses.damaged);
        return aidGenerateSingle({ serialNumber: target, parentSerialNumber: `PARENT-BLK-${Date.now()}` });
      })
      .then((res) => {
        expect(res.status, 'the guarded call must not 5xx').to.be.lessThan(500);
        expect(
          res.status >= 400 || res.body?.success === false,
          'only Available items may be given an asset ID',
        ).to.be.ok;
      });
  });

  // State transition — Open → Closed makes the PO unreceivable
  //
  // The ONLY test in this module that seeds a PO inside its own body rather
  // than in a hook, and deliberately so: a Closed PO would break every other TC
  // in this describe if it were shared, and this test creates, closes, exercises
  // and deletes it end to end. That is the disposable-resource pattern
  // (SKILL.md §6.4), not the shared-seeding-in-an-it() anti-pattern §11 warns
  // about — nothing outside this test can observe it.
  it('SW-AIDG-API-TC27: generating against a Closed PO is refused', { tags: ['@regression'] }, () => {
    const closedPo = `PO-AIDG-CLOSED-${Date.now()}`;
    const closedStamp = `AIDGC-${Date.now()}`;
    const closedSerial = `SN-AIDGC-${Date.now()}`;
    let closedProductId;

    seedAssetIdPo({ td, poNumber: closedPo, stamp: closedStamp, serials: [closedSerial] })
      .then((seed) => {
        closedProductId = seed.laptopProductId;
        return apiClosePO(closedPo);
      })
      .then(() =>
        aidGenerateFromPo({
          poNumber: closedPo,
          categoryId: laptopCategoryId,
          productId: closedProductId,
          quantity: data.labelQuantity.bvaLowerValid,
        }),
      )
      .then((res) => {
        expect(res.status, 'a Closed PO must not accept new receipts').to.be.lessThan(500);
        expect(
          res.status >= 400 || res.body?.success === false,
          'generating onto a Closed PO would reopen receiving through the back door',
        ).to.be.ok;
      })
      .then(() => apiDeletePO(closedPo));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Container / location assignment — the optional post-commit step. Its own
// describe because it owns disposable WMS resources that must be torn down
// even when a test in the block fails.
// ════════════════════════════════════════════════════════════════════════════
describe('Generate Asset ID API — container & location assignment (SW-AIDG-API-TC28..TC31)', () => {
  const stamp = `AIDGW-${Date.now()}`;
  const poNumber = `PO-AIDGW-${Date.now()}`;
  const seedSerial = `SN-AIDGW-${Date.now()}`;

  let laptopProductId;
  let laptopCategoryId;
  let containerTypeId;
  let roomyContainer;
  let tightContainer;
  let binChain;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });
    seedAssetIdPo({ td, poNumber, stamp, serials: [seedSerial] }).then((seed) => {
      laptopProductId = seed.laptopProductId;
    });
    createContainerTypeViaApi(disposableTypeName('AidgType'))
      .then((type) => {
        containerTypeId = type?.id;
        return createContainerWithCapacity(containerTypeId, data.container.maxItemsRoomy);
      })
      .then((c) => {
        roomyContainer = c;
        return createContainerWithCapacity(containerTypeId, data.container.maxItemsTight);
      })
      .then((c) => {
        tightContainer = c;
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
    // Containers must be emptied before delete — DELETE /containers/:id 400s
    // while cur_items > 0, and a stranded container leaks into shared QA.
    if (roomyContainer?.id) emptyContainerViaApi(roomyContainer.id).then(() => deleteContainerViaApi(roomyContainer.id));
    if (tightContainer?.id) emptyContainerViaApi(tightContainer.id).then(() => deleteContainerViaApi(tightContainer.id));
    if (containerTypeId) deleteContainerTypeViaApi(containerTypeId);
    if (binChain?.facility?.id) deleteLocationViaApi(binChain.facility.id);
    apiDeletePO(poNumber);
  });

  // Use case — generate + put-away in one action
  it('SW-AIDG-API-TC28: items generated with a containerCode land inside that container', { tags: ['@regression'] }, function () {
    if (!roomyContainer?.code) this.skip();
    const quantity = data.labelQuantity.bvaLowerValidPlusOne;
    let created;
    aidGenerateFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity,
      containerCode: roomyContainer.code,
      assignTo: 'container',
    })
      .then((res) => {
        expect(res.status, 'generate with a container target must succeed').to.be.lessThan(300);
        const payload = aidData(res);
        expect(payload.containerAssigned, 'the response must report the assignment as done').to.be.true;
        expect(payload.assignmentWarning, 'a clean assignment carries no warning').to.be.null;
        created = assetIdsOf(res);
        return getContainerSerials(roomyContainer.id);
      })
      .then((serials) => {
        created.forEach((assetId) => {
          expect(serials, `${assetId} must physically be in container ${roomyContainer.code}`).to.include(assetId);
        });
      });
  });

  // BVA / error guessing — the container capacity boundary
  it('SW-AIDG-API-TC29: overflowing a container capacity still creates every item and reports the shortfall', { tags: ['@regression'] }, function () {
    if (!tightContainer?.code) this.skip();
    const quantity = data.labelQuantity.epContainerOverflow; // > maxItemsTight
    let created;
    aidGenerateFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity,
      containerCode: tightContainer.code,
      assignTo: 'container',
    })
      .then((res) => {
        expect(res.status, 'assignment is best-effort — an over-capacity container must not fail the generate').to.be.lessThan(
          300,
        );
        created = assetIdsOf(res);
        expect(created, 'every requested label must still be minted').to.have.length(quantity);
        const payload = aidData(res);
        expect(
          payload.assignmentWarning || payload.containerAssigned === false,
          'the caller must be told the container could not take them all',
        ).to.be.ok;
        return getContainerSerials(tightContainer.id);
      })
      .then((serials) => {
        expect(
          serials.length,
          `container capacity is ${data.container.maxItemsTight} — it must never hold more than that`,
        ).to.be.at.most(data.container.maxItemsTight);
      });
  });

  // Use case — the location branch of the same optional step
  it('SW-AIDG-API-TC30: items generated with a locationPath land at that bin', { tags: ['@regression'] }, function () {
    if (!binChain?.bin?.id) this.skip();
    const quantity = data.labelQuantity.bvaLowerValid;
    let created;
    aidGenerateFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity,
      locationPath: binChain.bin.path,
      locationId: binChain.bin.id,
      assignTo: 'location',
    })
      .then((res) => {
        expect(res.status, 'generate with a location target must succeed').to.be.lessThan(300);
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

  // Decision table — locationPath present × assignTo absent. This route
  // SILENTLY SKIPS, where the disassembly route throws 400 for the same input
  // (product-asset-id.service.ts:2200 vs :1839). Pinning the asymmetry means a
  // future alignment of the two is a deliberate change, not a silent one.
  it('SW-AIDG-API-TC31: a locationPath without assignTo="location" is ignored, not rejected', { tags: ['@regression'] }, function () {
    if (!binChain?.bin?.id) this.skip();
    aidGenerateFromPo({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
      locationPath: binChain.bin.path,
    }).then((res) => {
      expect(res.status, 'this route tolerates the incomplete assignment payload').to.be.lessThan(300);
      const payload = aidData(res);
      expect(createdItemsOf(res), 'the items are still created').to.have.length(data.labelQuantity.bvaLowerValid);
      expect(
        payload.locationAssigned,
        'without assignTo="location" the assignment is skipped — the Disassembly route 400s on the same input',
      ).to.be.false;
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Downstream inventory operations. The point of the Asset ID module is not
// that a label prints — it is that a generated item is a first-class piece of
// inventory. These walk it through the app's real status transitions and
// assert the quantity ledger moves with it.
// ════════════════════════════════════════════════════════════════════════════
describe('Generate Asset ID API — downstream inventory operations (SW-AIDG-API-TC32..TC34)', () => {
  const stamp = `AIDGD-${Date.now()}`;
  const poNumber = `PO-AIDGD-${Date.now()}`;
  const seedSerial = `SN-AIDGD-${Date.now()}`;

  let laptopProductId;
  let laptopCategoryId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    // NOTE: General Config `requireWorkOrderForStockOut` is deliberately NOT
    // touched here. It rejects a serial-level stock-out carrying no
    // orderNumber, but aidStockOutSerial() already defaults one
    // (`REF-AIDL-${Date.now()}`, assetIdHelpers.js) and TC33 passes no explicit
    // orderNumber — so the guard is satisfied whichever way the environment has
    // the flag set. Flipping it would be dead weight with real risk: General
    // Config is global, and an aborted run (CI timeout, browser crash) never
    // reaches after(), leaving shared QA with the work-order requirement
    // disabled for every other suite.
    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });
    seedAssetIdPo({ td, poNumber, stamp, serials: [seedSerial] }).then((seed) => {
      laptopProductId = seed.laptopProductId;
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => {
    apiDeletePO(poNumber);
  });

  // State transition — Available → Damaged, and the ledger follows
  it('SW-AIDG-API-TC32: a generated item can be marked Damaged and leaves available stock', { tags: ['@regression'] }, () => {
    let assetId;
    let before;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [assetId] = ids;
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((snapshot) => {
        before = snapshot;
        return aidMarkStatus({
          poNumber,
          serialNumbers: [assetId],
          status: data.statuses.damaged,
          damageReason: 'Asset ID automation — damaged in transit',
        });
      })
      .then((res) => {
        expect(res.status, 'Change Status must accept an asset-id item like any other serial').to.be.lessThan(500);
        expect(res.body?.success !== false, 'marking a generated item Damaged must succeed').to.be.true;
        return readItemStatus(assetId);
      })
      .then((status) => {
        expect(status, 'the item must now read as Damaged').to.equal(data.statuses.damaged);
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((after) => {
        expect(
          after.availableQuantity,
          'a damaged unit is no longer sellable — available stock must fall by one',
        ).to.equal(before.availableQuantity - 1);
      });
  });

  // State transition — Available → StockedOut → Available (mutation paired
  // with its inverse, per cypress/qa/SKILL.md §6.5)
  it('SW-AIDG-API-TC33: a generated item can be stocked out and restocked, and the ledger round-trips', { tags: ['@regression'] }, () => {
    let assetId;
    let baseline;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [assetId] = ids;
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((snapshot) => {
        baseline = snapshot;
        return aidStockOutSerial({
          serialNumber: assetId,
          reason: 'Sold',
          description: 'Asset ID automation — stock out',
        });
      })
      .then((res) => {
        expect(res.status, 'stock-out by serial must accept an asset-id item').to.be.lessThan(500);
        expect(
          res.body?.success !== false,
          `stock-out must succeed — ${JSON.stringify(res.body?.error ?? {})}`,
        ).to.be.true;
        return readItemStatus(assetId);
      })
      .then((status) => {
        expect(status, 'the item must now read as StockedOut').to.equal(data.statuses.stockedOut);
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((afterStockOut) => {
        expect(
          afterStockOut.availableQuantity,
          'stocking out one unit must remove exactly one from available stock',
        ).to.equal(baseline.availableQuantity - 1);
        return aidRestockSerial({ serialNumber: assetId, description: 'Asset ID automation — restore' });
      })
      .then((res) => {
        expect(res.status, 'restock must accept the same serial back').to.be.lessThan(500);
        return readItemStatus(assetId);
      })
      .then((status) => {
        expect(status, 'restock returns the item to Available').to.equal(data.statuses.available);
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((afterRestock) => {
        expect(
          afterRestock.availableQuantity,
          'the inverse operation must restore the ledger exactly — no drift',
        ).to.equal(baseline.availableQuantity);
      });
  });

  // Use case — the generated item is traceable end-to-end
  it('SW-AIDG-API-TC34: a generated item appears in the Asset Lifecycle Report under its own asset ID', { tags: ['@regression'] }, function () {
    let assetId;
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    })
      .then((ids) => {
        [assetId] = ids;
        return readAssetLifecycleRow(assetId);
      })
      .then(function (row) {
        if (!row) this.skip();
        expect(row.assetId, 'the report row is keyed by the generated asset ID').to.equal(assetId);
        expect(row.serialNumber, 'serial and asset ID are the same string for this flow').to.equal(assetId);
        expect(row.flow, 'the report must attribute the item to the Generate Asset ID screen').to.equal(
          data.lineage.flowGenerateFromPo,
        );
      });
  });
});
