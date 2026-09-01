// cypress/support/helpers/poCloseHelpers.js
//
// API-only seeding helpers for the PO Close spec suite.
//
// Endpoints used:
//   POST /excel/upload-inventory                — bulk seed via Excel (serialized + product-only)
//   POST /incoming-items/check-in               — product-only stock-in (field: productID capital)
//   POST /incoming-items/scan                   — Incoming → Available (serialized)
//   POST /incoming-items/mark-status            — change status (Damaged, Disputed, Missing)
//   GET  /incoming-items?poNumber=…             — look up productId
//   GET  /purchase-orders/checkStatus/:poNumber — fetch reconciliation data (oracle)
//   DELETE /purchase-orders/:poNumber           — teardown
//   PATCH /purchase-orders/reopenPurchaseOrder  — reopen a closed PO (cleanup)

import { apiCall, buildRamRow, buildLaptopRow, createExcelFile } from './allPosHelpers';
import { importExcel } from './incomingInventoryHelpers';

// ── Low-level wrappers ────────────────────────────────────────────────────────

function apiBase() {
  const env = Cypress.env('API_BASE_URL');
  if (typeof env === 'string' && env.length > 0) return env;
  return Cypress.config('baseUrl').replace(/\/$/, '').replace('://', '://api.');
}

/**
 * Look up productId for a PO + free-text search.
 */
export function apiGetProductIdForPO(poNumber, search) {
  const url =
    `/incoming-items?poNumber=${encodeURIComponent(poNumber)}` +
    `&search=${encodeURIComponent(search)}&page=1&page_size=20`;
  return apiCall('GET', url).then((res) => {
    const list = res.body?.data?.list || res.body?.list || res.body?.data || [];
    const arr = Array.isArray(list) ? list : list.list || [];
    const first = arr.find((row) => row && (row.id || row.productId));
    expect(first, `apiGetProductIdForPO: no product matched search='${search}' po='${poNumber}'`).to.exist;
    return first.id || first.productId;
  });
}

/**
 * POST /incoming-items/check-in — product-only stock-in.
 * NOTE: backend field is `productID` (capital ID).
 */
export function apiCheckIn({ poNumber, productId, quantity }) {
  return apiCall('POST', '/incoming-items/check-in', {
    productID: productId,
    poNumber,
    quantity: Number(quantity),
    sourceLocation: '',
  }).then((res) => {
    expect(res.status, `check-in pid=${productId} qty=${quantity}: HTTP`).to.be.lessThan(500);
    expect(res.body?.success !== false, `check-in pid=${productId}: success`).to.eq(true);
  });
}

/**
 * POST /incoming-items/scan — single serial Incoming → Available.
 */
export function apiScanSerial(poNumber, serialNumber) {
  return apiCall('POST', '/incoming-items/scan', { poNumber, serialNumber }).then((res) => {
    expect(res.status, `scan ${serialNumber}: HTTP`).to.be.lessThan(500);
    expect(res.body?.success !== false, `scan ${serialNumber}: success`).to.eq(true);
  });
}

/**
 * POST /incoming-items/mark-status — serialized items.
 */
export function apiMarkSerialStatus({ poNumber, serialNumbers, status, damageReason }) {
  const body = { poNumber, status, serialNumbers };
  if (damageReason) body.damageReason = damageReason;
  return apiCall('POST', '/incoming-items/mark-status', body).then((res) => {
    expect(res.status, `mark-status ${status}: HTTP`).to.be.lessThan(500);
    expect(res.body?.success !== false, `mark-status ${status}: success`).to.eq(true);
  });
}

/**
 * GET /categories — resolve a category's numeric id by its exact name.
 * Used by the asset-id disassembly/reassembly seeding chain, which needs a
 * concrete categoryId (the report/product APIs only surface category *name*).
 */
export function apiResolveCategoryIdByName(name) {
  return apiCall('GET', '/categories?page=1&page_size=500').then((res) => {
    const list = res.body?.data?.list || res.body?.data || [];
    const match = (Array.isArray(list) ? list : []).find((c) => c.name === name);
    expect(match, `category "${name}" must exist`).to.exist;
    return match.id;
  });
}

/**
 * Seed a serialized item into the `Consumed` state — the only status reachable
 * through the asset-id disassembly→reassembly flow (no mark-status path allows
 * it; see incoming-item.service.ts markStatus()). Chain (verified live):
 *   1. POST /products/asset-id/disassembly/create-and-generate — generates
 *      `quantity` brand-new Available child items under `parentSerialNumber`,
 *      inheriting the parent's PO; returns their generated assetIds.
 *   2. POST /products/asset-id/reassembly/link-and-stockout — links those
 *      asset codes back into the parent and flips each to `Consumed`.
 * The parent + selected serials must already be Available (scan them first).
 * Returns the array of consumed child assetIds (each is also its serialNumber).
 *
 * @param {object} p
 * @param {string} p.parentSerialNumber  an Available serialized item
 * @param {string} p.selectedItemSerialNumber  a second Available serialized item
 * @param {number} p.categoryId  the product's category (allowItems must be true)
 * @param {number} p.productId
 * @param {number} [p.quantity=1]  how many child items to create+consume
 */
export function apiSeedConsumedItem({ parentSerialNumber, selectedItemSerialNumber, categoryId, productId, quantity = 1 }) {
  return apiCall('POST', '/products/asset-id/disassembly/create-and-generate', {
    parentSerialNumber,
    selectedItemSerialNumber,
    categoryId,
    productId,
    quantity: Number(quantity),
  }).then((disRes) => {
    expect(disRes.status, 'disassembly create-and-generate: HTTP').to.be.lessThan(400);
    const createdItems = disRes.body?.data?.createdItems || [];
    expect(createdItems.length, 'disassembly must generate child items').to.be.greaterThan(0);
    const assetCodes = createdItems.map((c) => c.assetId);
    return apiCall('POST', '/products/asset-id/reassembly/link-and-stockout', {
      parentSerialNumber,
      assetCodes,
    }).then((reaRes) => {
      expect(reaRes.status, 'reassembly link-and-stockout: HTTP').to.be.lessThan(400);
      return assetCodes;
    });
  });
}

/**
 * POST /incoming-items/mark-status — product-only (quantity-based).
 */
export function apiMarkProductStatus({ poNumber, productId, quantity, status, damageReason }) {
  const body = {
    poNumber,
    status,
    productIdsArray: [{ productId, quantity: Number(quantity) }],
  };
  if (damageReason) body.damageReason = damageReason;
  return apiCall('POST', '/incoming-items/mark-status', body).then((res) => {
    expect(res.status, `mark-status (qty) ${status} pid=${productId}: HTTP`).to.be.lessThan(500);
    expect(res.body?.success !== false, `mark-status (qty) ${status}: success`).to.eq(true);
  });
}

/**
 * POST /products/stock-out — product-only (quantity-based) stock-out.
 * product.service.ts's stockOutInitiation() requires `id` (the product id,
 * despite the DTO calling it `id` not `productId`), `quantity` (> 0),
 * `reason`, and `level` (the row's granularity — 'Product' for a
 * quantity-tracked row, matching the container bulk-stockout convention
 * documented in wmsContainerHelpers.js). `poNumber` is optional unless the
 * `enablePoForStockOut` config is on, in which case it is required.
 */
export function apiStockOutProductQuantity({ productId, poNumber, quantity, reason, description }) {
  const body = {
    id: productId,
    poNumber,
    quantity: Number(quantity),
    reason,
    level: 'Product',
    description: description || 'auto-seeded by Cost Report spec',
  };
  return apiCall('POST', '/products/stock-out', body).then((res) => {
    expect(res.status, `stock-out (qty) pid=${productId} reason=${reason}: HTTP`).to.be.lessThan(500);
    expect(res.body?.success !== false, `stock-out (qty) pid=${productId} reason=${reason}: success`).to.eq(true);
  });
}

/**
 * PATCH /purchase-orders/closePurchaseOrder — close a PO via API.
 * Uses minimal required fields; closureReason / creditMemoNumber optional.
 */
export function apiClosePO(poNumber) {
  return apiCall('PATCH', '/purchase-orders/closePurchaseOrder', {
    poNumber,
    status: 'Closed',
    creditMemoNumber: null,
    closureNote: null,
    closureReason: null,
    reconciliation: [],
  }).then((res) => {
    expect(res.status, `closePO ${poNumber}: HTTP`).to.be.lessThan(500);
    expect(res.body?.success !== false, `closePO ${poNumber}: success`).to.eq(true);
  });
}

/**
 * DELETE /purchase-orders/:poNumber
 * Best-effort cleanup — never asserts on the status so a closed PO (400) or
 * already-deleted PO (404) does not fail the after() hook.
 */
export function apiDeletePO(poNumber) {
  return apiCall('DELETE', `/purchase-orders/${encodeURIComponent(poNumber)}`).then((res) => {
    cy.log(`Delete PO ${poNumber}: HTTP ${res.status}`);
  });
}

/**
 * PATCH /purchase-orders/reopenPurchaseOrder — reopen a closed PO.
 * NOTE: `status: 'Open'` is REQUIRED in the body — poDetail.service.ts
 * reopenPurchaseOrder() throws a 400 BadRequestException without it
 * (`!status || status != 'Open'`), which a bare `< 500` HTTP check won't
 * catch since 400 passes that assertion while silently no-op'ing the reopen.
 */
export function apiReopenPO(poNumber) {
  return apiCall('PATCH', '/purchase-orders/reopenPurchaseOrder', { poNumber, status: 'Open' }).then((res) => {
    expect(res.status, `reopen PO ${poNumber}: HTTP`).to.be.lessThan(500);
  });
}

/**
 * GET /purchase-orders/checkStatus/:poNumber — fetch the reconciliation oracle.
 */
export function apiGetCheckStatus(poNumber) {
  return apiCall('GET', `/purchase-orders/checkStatus/${encodeURIComponent(poNumber)}`).then((res) => {
    expect(res.status, `checkStatus ${poNumber}: HTTP`).to.be.lessThan(500);
    return res.body?.data || res.body;
  });
}

// ── High-level PO seeders ─────────────────────────────────────────────────────

// ── Fixture normalizers ────────────────────────────────────────────────────────
// poCloseData.json uses { products: { ram, laptop } } but buildRamRow/buildLaptopRow
// expect the flat shape used by exportTestData.json: { ram, laptop, categories }.

function toRamFixture(td) {
  return {
    categories: { ram: td.categories.ram },
    ram: td.products.ram,
  };
}

function toLaptopFixture(td) {
  return {
    categories: { laptop: td.categories.laptop },
    laptop: td.products.laptop,
  };
}

// ── High-level PO seeders ─────────────────────────────────────────────────────

/**
 * Seed a product-only PO via Excel import.
 * Returns the productId of the seeded RAM row.
 */
export function seedProductOnlyPO({ td, poNumber, stamp, quantity }) {
  const ramQty = quantity !== undefined && quantity !== null ? quantity : td.products.ram.defaultQuantity;
  const row = buildRamRow(toRamFixture(td), stamp, ramQty);
  const fileName = `POC-RAM-${stamp}.xlsx`;
  createExcelFile(fileName, [row]);
  importExcel(fileName, poNumber);
  return apiGetProductIdForPO(poNumber, `${td.products.ram.memoryGeneration}-${stamp}`);
}

/**
 * Seed multiple RAM products on one PO (multi-product scenario).
 * Each stamp must be unique per product. Returns array of productIds.
 */
export function seedMultiProductOnlyPO({ td, poNumber, products }) {
  // products = [{ stamp, quantity }, ...]
  const rows = products.map(({ stamp, quantity }) =>
    buildRamRow(toRamFixture(td), stamp, quantity || td.products.ram.defaultQuantity)
  );
  const fileName = `POC-MULTI-RAM-${poNumber}.xlsx`;
  createExcelFile(fileName, rows);
  importExcel(fileName, poNumber);
  // Look up all productIds in sequence
  return products.reduce((chain, { stamp }) => {
    return chain.then((ids) =>
      apiGetProductIdForPO(poNumber, `${td.products.ram.memoryGeneration}-${stamp}`).then((id) => [
        ...ids,
        id,
      ])
    );
  }, cy.wrap([]));
}

/**
 * Seed a serialized (Laptop) PO via Excel import.
 * Returns the productId of the seeded Laptop row.
 */
export function seedSerializedPO({ td, poNumber, stamp, serials }) {
  const rows = serials.map((s) => buildLaptopRow(toLaptopFixture(td), stamp, s));
  const fileName = `POC-LPT-${stamp}.xlsx`;
  createExcelFile(fileName, rows);
  importExcel(fileName, poNumber);
  return apiGetProductIdForPO(poNumber, `${td.products.laptop.modelNumber}-${stamp}`);
}

/**
 * Seed multiple serialized Laptop product groups on one PO (multi-product serialized).
 * products = [{ stamp, serials: [] }, ...]
 * Returns array of productIds.
 */
export function seedMultiSerializedPO({ td, poNumber, products }) {
  // products = [{ stamp, serials: [], cost?: string }, ...]
  // Optional cost per product — passed to buildLaptopRow; omit to use fixture default.
  const rows = products.flatMap(({ stamp, serials, cost }) =>
    serials.map((s) => buildLaptopRow(toLaptopFixture(td), stamp, s, cost))
  );
  const fileName = `POC-MULTI-LPT-${poNumber}.xlsx`;
  createExcelFile(fileName, rows);
  importExcel(fileName, poNumber);
  return products.reduce((chain, { stamp }) => {
    return chain.then((ids) =>
      apiGetProductIdForPO(poNumber, `${td.products.laptop.modelNumber}-${stamp}`).then((id) => [
        ...ids,
        id,
      ])
    );
  }, cy.wrap([]));
}

/**
 * Seed a mixed PO with MULTIPLE RAM products + MULTIPLE Laptop product groups in ONE Excel import.
 * Required to avoid the one-import-per-PO backend restriction.
 * ramProducts  = [{ stamp, quantity }, ...]
 * laptopProducts = [{ stamp, serials: [] }, ...]
 * Returns { ramProductIds: [], laptopProductIds: [] }
 */
export function seedMultiMixedPO({ td, poNumber, ramProducts, laptopProducts }) {
  const ramRows = ramProducts.map(({ stamp, quantity }) =>
    buildRamRow(toRamFixture(td), stamp, quantity || td.products.ram.defaultQuantity)
  );
  const laptopRows = laptopProducts.flatMap(({ stamp, serials }) =>
    serials.map((s) => buildLaptopRow(toLaptopFixture(td), stamp, s))
  );
  const fileName = `POC-MULTIMIX-${poNumber}.xlsx`;
  createExcelFile(fileName, [...ramRows, ...laptopRows]);
  importExcel(fileName, poNumber);

  const ramIdsChain = ramProducts.reduce(
    (chain, { stamp }) =>
      chain.then((ids) =>
        apiGetProductIdForPO(poNumber, `${td.products.ram.memoryGeneration}-${stamp}`).then((id) => [
          ...ids,
          id,
        ])
      ),
    cy.wrap([])
  );

  return ramIdsChain.then((ramIds) =>
    laptopProducts
      .reduce(
        (chain, { stamp }) =>
          chain.then((ids) =>
            apiGetProductIdForPO(poNumber, `${td.products.laptop.modelNumber}-${stamp}`).then((id) => [
              ...ids,
              id,
            ])
          ),
        cy.wrap([])
      )
      .then((laptopIds) => ({ ramProductIds: ramIds, laptopProductIds: laptopIds }))
  );
}

/**
 * Seed a mixed PO with both RAM (product-only) and Laptop (serialized) rows.
 * Returns { ramProductId, laptopProductId }.
 */
export function seedMixedPO({ td, poNumber, ramStamp, ramQty, laptopStamp, serials }) {
  const ramRow = buildRamRow(toRamFixture(td), ramStamp, ramQty);
  const laptopRows = serials.map((s) => buildLaptopRow(toLaptopFixture(td), laptopStamp, s));

  const fileName = `POC-MIXED-${poNumber}.xlsx`;
  createExcelFile(fileName, [ramRow, ...laptopRows]);
  importExcel(fileName, poNumber);

  let ramId, laptopId;
  return apiGetProductIdForPO(poNumber, `${td.products.ram.memoryGeneration}-${ramStamp}`)
    .then((id) => {
      ramId = id;
      return apiGetProductIdForPO(poNumber, `${td.products.laptop.modelNumber}-${laptopStamp}`);
    })
    .then((id) => {
      laptopId = id;
      return { ramProductId: ramId, laptopProductId: laptopId };
    });
}
