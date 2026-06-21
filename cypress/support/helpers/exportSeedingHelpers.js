// cypress/support/helpers/exportSeedingHelpers.js
//
// API-only seeding helpers for the Incoming Inventory Export spec.
//
// Each helper authenticates via cy.getAuthToken() + cy.request and uses
// failOnStatusCode:false so callers can keep assertion control. They all
// return a Cypress chainable so they compose with normal .then() chains.
//
// Endpoints used (verified against Backend/src/modules):
//   POST /excel/upload-inventory                — bulk seed via Excel
//   POST /incoming-items/mark-status            — set status for items / product-only qty
//   POST /incoming-items/scan                   — Incoming → Available (one item)
//   POST /work-orders                           — create + reserve qty per product
//   POST /products/stockout-by-serial-number    — stock-out serialized item with reason
//   GET  /incoming-items?poNumber=&search=      — look up productId for a PO
//   DELETE /purchase-orders/:poNumber           — teardown
//
// The Excel-upload route can take a long time; we pass a 12-minute

import { apiCall, ts, buildRamRow, buildLaptopRow, createExcelFile } from './allPosHelpers';
import { importExcel } from './incomingInventoryHelpers';
import IncomingInvPage from '../../pageObjects/IncomingInvPage';

const TWELVE_MIN = 12 * 60 * 1000;

function apiBase() {
  const env = Cypress.env('API_BASE_URL');
  if (typeof env === 'string' && env.length > 0) return env;
  return Cypress.config('baseUrl').replace(/\/$/, '').replace('://', '://api.');
}

// ─── Low-level API wrappers ──────────────────────────────────────────────────

/** Same shape as apiCall in allPosHelpers but allows a custom timeout. */
function apiCallTimed(method, path, body, timeoutMs = 15000) {
  return cy.getAuthToken().then((token) =>
    cy.request({
      method,
      url: `${apiBase()}${path}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      failOnStatusCode: false,
      timeout: timeoutMs,
    })
  );
}

/**
 * Resolve a productId for a given PO + free-text search. The mark-status
 * and work-order endpoints need numeric productIds.
 */
export function apiGetProductIdForPo(poNumber, search) {
  const url =
    `/incoming-items?poNumber=${encodeURIComponent(poNumber)}` +
    `&search=${encodeURIComponent(search)}&page=1&page_size=10`;
  return apiCall('GET', url).then((res) => {
    const list = res.body?.data?.list || res.body?.list || res.body?.data || [];
    const arr = Array.isArray(list) ? list : list.list || [];
    const first = arr.find((row) => row && (row.id || row.productId));
    expect(
      first,
      `apiGetProductIdForPo: no product matched search='${search}' on PO='${poNumber}'`
    ).to.exist;
    return first.id || first.productId;
  });
}

/**
 * POST /incoming-items/scan — single Incoming → Available transition.
 */
export function apiScanSerial(poNumber, serialNumber) {
  return apiCall('POST', '/incoming-items/scan', { poNumber, serialNumber }).then((res) => {
    expect(res.status, `scan ${serialNumber}: status`).to.be.lessThan(500);
    expect(
      res.body?.success !== false,
      `scan ${serialNumber}: success envelope`
    ).to.eq(true);
  });
}

/**
 * POST /incoming-items/mark-status — for a serialized item.
 *
 * Mirrors the ReportDescrepancy.tsx payload for the
 * categoryExists?.allowItems=true branch (serialized rows).
 */
export function apiMarkItemStatus({ poNumber, serialNumber, status, damageReason }) {
  const body = {
    poNumber,
    status,
    serialNumbers: [serialNumber],
  };
  if (damageReason) body.damageReason = damageReason;
  return apiCall('POST', '/incoming-items/mark-status', body).then((res) => {
    expect(res.status, `mark-status ${status} ${serialNumber}: HTTP`).to.be.lessThan(500);
    expect(
      res.body?.success !== false,
      `mark-status ${status} ${serialNumber}: success envelope`
    ).to.eq(true);
  });
}

/**
 * POST /incoming-items/mark-status — for product-only (quantity-based) rows.
 *
 * Mirrors the ReportDescrepancy.tsx payload for the
 * categoryExists?.allowItems=false branch.
 */
export function apiMarkProductOnlyStatus({ poNumber, productId, quantity, status, damageReason }) {
  const body = {
    poNumber,
    status,
    productIdsArray: [{ productId, quantity: Number(quantity) }],
  };
  if (damageReason) body.damageReason = damageReason;
  return apiCall('POST', '/incoming-items/mark-status', body).then((res) => {
    expect(res.status, `mark-status (qty) ${status} pid=${productId}: HTTP`).to.be.lessThan(500);
    expect(
      res.body?.success !== false,
      `mark-status (qty) ${status} pid=${productId}: success envelope`
    ).to.eq(true);
  });
}

/**
 * POST /products/stockout-by-serial-number — sells / loses / etc. a single
 * serialized item with a reason. Used for the StockedOut and Sold partitions.
 */
export function apiStockOutSerial({ serialNumber, reason, description }) {
  const body = {
    serialNumber,
    reason,
    description: description || 'auto-seeded by Export spec',
  };
  return apiCall('POST', '/products/stockout-by-serial-number', body).then((res) => {
    expect(res.status, `stockout ${serialNumber} reason=${reason}: HTTP`).to.be.lessThan(500);
    expect(
      res.body?.success !== false,
      `stockout ${serialNumber} reason=${reason}: success envelope`
    ).to.eq(true);
  });
}

/**
 * POST /incoming-items/check-in — product-only stock-in.
 *
 * NOTE the BE expects `productID` (capital ID), not `productId`. The FE
 * works around this in StockInProducts/index.tsx:428.
 */
export function apiCheckInProductOnly({ poNumber, productId, quantity, sourceLocation }) {
  const body = {
    productID: productId,
    poNumber,
    quantity: Number(quantity),
    sourceLocation: sourceLocation || '',
  };
  return apiCall('POST', '/incoming-items/check-in', body).then((res) => {
    expect(res.status, `check-in qty=${quantity}: HTTP`).to.be.lessThan(500);
    expect(
      res.body?.success !== false,
      `check-in qty=${quantity}: success envelope`
    ).to.eq(true);
  });
}

/**
 * GET /incoming-items?poNumber=…&page=1&page_size=10 — returns the BE's
 * canonical quantity breakdown for each product on the PO. Used as the
 * source of truth for Excel-cell assertions: rather than recompute the
 * BE's mark-status arithmetic in the spec, we compare cells to whatever
 * this endpoint reports.
 */
export function apiGetPoListing(poNumber) {
  const url =
    `/incoming-items?poNumber=${encodeURIComponent(poNumber)}` +
    `&page=1&page_size=10`;
  return apiCall('GET', url).then((res) => {
    const list = res.body?.data?.list || res.body?.list || res.body?.data || [];
    return Array.isArray(list) ? list : list.list || [];
  });
}

/**
 * POST /work-orders — creates a work order that reserves `quantity` of
 * `productId`. Reservation is the side-effect that puts the product /
 * its items into Reserved state.
 */
export function apiReserveViaWorkOrder({ productId, productName, quantity }) {
  const stamp = ts();
  const body = {
    workOrderNumber: `WO-EXP-${stamp}`,
    saleOrderNumber: `SO-EXP-${stamp}`,
    status: 'Open',
    products: [
      {
        productId,
        name: productName || `EXP-${stamp}`,
        partNumber: null,
        quantity: Number(quantity),
      },
    ],
  };
  return apiCall('POST', '/work-orders', body).then((res) => {
    expect(res.status, `create WO: HTTP`).to.be.lessThan(500);
    return res.body?.data || res.body;
  });
}

// ─── High-level PO seeders ───────────────────────────────────────────────────

/**
 * Seed a product-only (RAM) PO via Excel import using the same simple
 * pattern as ImportTests.cy.js — navigate → import dialog → enter PO →
 * upload file → click Upload → wait for OK → click OK → validate URL.
 * No cy.intercept or response inspection; avoids the conditional-OK logic
 * in incomingInventoryHelpers.importExcel that can silently skip the OK
 * click when called sequentially for multiple POs.
 *
 * @param {object} opts
 * @param {object} opts.td            — fixture object (exportTestData.json)
 * @param {string} opts.poNumber      — disposable PO number
 * @param {string} opts.stamp         — unique-per-run stamp for memoryGeneration
 * @param {number} opts.quantity      — qty for the RAM line
 *
 * Returns the productId of the seeded RAM row.
 */
export function seedProductOnlyPOSimple({ td, poNumber, stamp, quantity }) {
  const ramQty = quantity || td.products.ram.defaultQuantity;
  const ramFixture = {
    categories: { ram: td.categories.ram },
    ram: td.products.ram,
  };
  const row = buildRamRow(ramFixture, stamp, ramQty);
  const fileName = `ImpTestProductOnly-${stamp}.xlsx`;
  createExcelFile(fileName, [row]);

  const invPage = new IncomingInvPage();
  invPage.clickIncomingInventoryNav();
  invPage.clickImport();
  invPage.enterPONumber(poNumber);
  invPage.uploadFile(fileName);
  invPage.clickUpload();
  cy.contains('button', /^OK$/, { timeout: 30000 })
    .should('be.visible')
    .and('not.be.disabled')
    .click({ force: true });
  cy.location('pathname', { timeout: 30000 }).should('match', /\/incoming-inventory/);

  return apiGetProductIdForPo(poNumber, `${td.products.ram.memoryGeneration}-${stamp}`);
}

/**
 * Seed a product-only PO via Excel import.
 *
 * @param {object} opts
 * @param {object} opts.td            — fixture object (exportTestData.json)
 * @param {string} opts.poNumber      — disposable PO number
 * @param {string} opts.stamp         — unique-per-test stamp (per-PO product
 *                                       isolation; see scanAllTestHelpers note
 *                                       about adjustAcrossPOs)
 * @param {number} opts.quantity      — qty for the RAM line
 *
 * Returns the productId of the seeded RAM row.
 */
export function seedProductOnlyPO({ td, poNumber, stamp, quantity }) {
  const ramQty = quantity || td.products.ram.defaultQuantity;
  const ramFixture = {
    categories: { ram: td.categories.ram },
    ram: td.products.ram,
  };
  const row = buildRamRow(ramFixture, stamp, ramQty);
  const fileName = `ImpTestProductOnly-${stamp}.xlsx`;
  createExcelFile(fileName, [row]);
  importExcel(fileName, poNumber);
  return apiGetProductIdForPo(poNumber, `${td.products.ram.memoryGeneration}-${stamp}`);
}

/**
 * Seed a product-item (serialized) PO via Excel import.
 *
 * @param {object} opts
 * @param {object} opts.td
 * @param {string} opts.poNumber
 * @param {string} opts.stamp
 * @param {string[]} opts.serials   — one row per serial
 *
 * Returns the productId of the seeded Laptop row.
 */
export function seedProductItemPO({ td, poNumber, stamp, serials }) {
  const laptopFixture = {
    categories: { laptop: td.categories.laptop },
    laptop: td.products.laptop,
  };
  const rows = serials.map((s) => buildLaptopRow(laptopFixture, stamp, s));
  const fileName = `ImpTest-${stamp}.xlsx`;
  createExcelFile(fileName, rows);
  importExcel(fileName, poNumber);
  return apiGetProductIdForPo(poNumber, `${td.products.laptop.modelNumber}-${stamp}`);
}

/**
 * Seed a mixed PO (RAM product-only + Laptop product-item rows).
 *
 * Uses two separate category-pure imports so each product's attribute
 * columns are correctly mapped. A single mixed-category file causes the
 * backend's attribute mapper to skip attribute values for non-primary rows,
 * which removes columns like RAMbrand from the exported sheet.
 *
 * Returns { ramProductId, laptopProductId }.
 */
export function seedMixedPO({ td, poNumber, stamp, ramQty, serials }) {
  const ramFixture = {
    categories: { ram: td.categories.ram },
    ram: td.products.ram,
  };
  const laptopFixture = {
    categories: { laptop: td.categories.laptop },
    laptop: td.products.laptop,
  };

  // First import: RAM product-only rows (category-pure)
  const ramRow = buildRamRow(ramFixture, stamp, ramQty || td.products.ram.defaultQuantity);
  const ramFileName = `ImpTestProductOnly-${stamp}.xlsx`;
  createExcelFile(ramFileName, [ramRow]);
  importExcel(ramFileName, poNumber);

  // Second import: Laptop product-item rows (category-pure)
  const laptopRows = serials.map((s) => buildLaptopRow(laptopFixture, stamp, s));
  const laptopFileName = `ImpTest-${stamp}.xlsx`;
  createExcelFile(laptopFileName, laptopRows);
  importExcel(laptopFileName, poNumber);

  return apiGetProductIdForPo(poNumber, `${td.products.ram.memoryGeneration}-${stamp}`).then(
    (ramProductId) =>
      apiGetProductIdForPo(poNumber, `${td.products.laptop.modelNumber}-${stamp}`).then(
        (laptopProductId) => ({ ramProductId, laptopProductId })
      )
  );
}

/**
 * Best-effort DELETE /purchase-orders/:poNumber. Swallows non-2xx so an
 * after() hook never masks a real test failure.
 */
export function deletePO(poNumber) {
  if (!poNumber) return cy.wrap(null);
  return apiCallTimed(
    'DELETE',
    `/purchase-orders/${encodeURIComponent(poNumber)}`,
    undefined,
    TWELVE_MIN
  ).then((res) => cy.log(`DELETE ${poNumber}: ${res.status}`));
}
