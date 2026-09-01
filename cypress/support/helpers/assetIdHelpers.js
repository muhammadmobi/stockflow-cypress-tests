// cypress/support/helpers/assetIdHelpers.js
//
// API wrappers + read-only oracles for the Asset ID module (Generate Asset ID /
// Disassembly / Assembly / Search Life Cycle).
//
// Test plan: cypress/qa/testPlans/assetId/plan.md
//
// Two kinds of function live here, and they are deliberately kept apart:
//
//   (1) THIN WRAPPERS (`aid*`) — one cy.request per backend route, no
//       assertions. Specs assert on them, so a wrapper must never decide
//       whether a response is "good"; that is the test's job. Every one uses
//       `failOnStatusCode: false` so a negative TC can inspect a 4xx.
//
//   (2) SEEDERS + ORACLES (`seed*` / `read*`) — these DO assert, because a
//       broken seed must fail loudly at the hook rather than silently produce
//       an empty assertion later (CTAL-TAE §7: failure analysis).
//
// Backend reference: Backend/src/modules/product/product-asset-id.service.ts
//                    Backend/src/modules/product/product.controller.ts:1504-1864
//
// Routes wrapped here (12 — the module's complete surface):
//   POST /products/asset-id/scan
//   POST /products/asset-id/generate
//   POST /products/asset-id/generate-from-po
//   POST /products/asset-id/preview-from-po
//   POST /products/asset-id/disassembly/create-and-generate
//   POST /products/asset-id/disassembly/preview
//   POST /products/asset-id/reassembly/link-and-stockout
//   GET  /products/asset-id/category/:categoryId/products
//   GET  /products/asset-id/disassembly/category/:categoryId/products
//   GET  /products/asset-id/disassembly/generated-labels/:serialNumber
//   GET  /products/asset-id/disassembly/assembled-items/:serialNumber
//   GET  /products/asset-id/lifecycle/:assetId
//
// Sections (4)-(6) wrap routes OUTSIDE the module — stock-out, restock,
// mark-status, container and location assignment, work orders. They exist
// because the Search Life Cycle screen is a READ of what those operations did,
// so its suite has to perform them for real before it can assert the lifecycle
// reports them. They are fixtures for that suite, never the subject: each of
// those routes has its own owning spec.

import { apiCall, buildLaptopRow, buildRamRow, createExcelFile } from './allPosHelpers';
import { importExcel } from './incomingInventoryHelpers';
import { apiGetProductIdForPO, apiScanSerial } from './poCloseHelpers';

// ── Envelope helpers ─────────────────────────────────────────────────────────
//
// Every asset-id controller method returns the repo-wide envelope
// `{ statusCode, success, error, data }` (product.controller.ts). The FE reads
// `response?.data?.data || response?.data` because the envelope is not
// guaranteed on error paths — the same tolerance is mirrored here.

/** Unwrap `{ data: … }`, tolerating a bare body. */
export const aidData = (res) => res?.body?.data ?? res?.body ?? {};

/** `createdItems` from a generate/disassembly response (always an array). */
export const createdItemsOf = (res) => {
  const items = aidData(res)?.createdItems;
  return Array.isArray(items) ? items : [];
};

/** `previewItems` from a preview response (always an array). */
export const previewItemsOf = (res) => {
  const items = aidData(res)?.previewItems;
  return Array.isArray(items) ? items : [];
};

/** The asset-id strings from a generate/disassembly response. */
export const assetIdsOf = (res) => createdItemsOf(res).map((i) => i.assetId);

/**
 * Assert a successful POST to an asset-id route.
 *
 * Every asset-id controller method returns `statusCode: HttpStatus.OK` INSIDE
 * the envelope but does not override Nest's default HTTP status for a POST, so
 * the wire status is 201 while the body says 200 (confirmed live on QA — see
 * plan.md §1 point 9). Asserting a bare 200 would fail on every POST here, and
 * asserting only `< 300` would let a 204/redirect through. The pair is the
 * honest contract, so it lives in ONE helper instead of being re-derived per
 * spec.
 */
export const expectPostOk = (res, message) => {
  expect(res.status, message).to.be.oneOf([200, 201]);
  return res;
};

// ── (1) Thin route wrappers — no assertions ──────────────────────────────────

/** POST /products/asset-id/scan */
export const aidScan = (serialNumber) =>
  apiCall('POST', '/products/asset-id/scan', { serialNumber });

/** POST /products/asset-id/generate — single-item asset ID on an existing serial. */
export const aidGenerateSingle = ({ serialNumber, parentSerialNumber }) =>
  apiCall('POST', '/products/asset-id/generate', { serialNumber, parentSerialNumber });

/** POST /products/asset-id/preview-from-po — never mutates, never burns a sequence. */
export const aidPreviewFromPo = (body) =>
  apiCall('POST', '/products/asset-id/preview-from-po', body);

/** POST /products/asset-id/generate-from-po — creates `quantity` brand-new items. */
export const aidGenerateFromPo = (body) =>
  apiCall('POST', '/products/asset-id/generate-from-po', body);

/** POST /products/asset-id/disassembly/preview */
export const aidDisassemblyPreview = (body) =>
  apiCall('POST', '/products/asset-id/disassembly/preview', body);

/** POST /products/asset-id/disassembly/create-and-generate */
export const aidDisassemblyCreate = (body) =>
  apiCall('POST', '/products/asset-id/disassembly/create-and-generate', body);

/** POST /products/asset-id/reassembly/link-and-stockout */
export const aidReassemblyLink = (body) =>
  apiCall('POST', '/products/asset-id/reassembly/link-and-stockout', body);

/** GET /products/asset-id/category/:categoryId/products (optional ?poNumber=). */
export const aidCategoryProducts = (categoryId, poNumber) =>
  apiCall(
    'GET',
    `/products/asset-id/category/${encodeURIComponent(categoryId)}/products` +
      (poNumber ? `?poNumber=${encodeURIComponent(poNumber)}` : ''),
  );

/** GET /products/asset-id/disassembly/category/:categoryId/products */
export const aidDisassemblyCategoryProducts = (categoryId) =>
  apiCall(
    'GET',
    `/products/asset-id/disassembly/category/${encodeURIComponent(categoryId)}/products`,
  );

/** GET /products/asset-id/disassembly/generated-labels/:serialNumber */
export const aidGeneratedLabels = (serialNumber) =>
  apiCall(
    'GET',
    `/products/asset-id/disassembly/generated-labels/${encodeURIComponent(serialNumber)}`,
  );

/** GET /products/asset-id/disassembly/assembled-items/:serialNumber */
export const aidAssembledItems = (serialNumber) =>
  apiCall(
    'GET',
    `/products/asset-id/disassembly/assembled-items/${encodeURIComponent(serialNumber)}`,
  );

/** GET /products/asset-id/lifecycle/:assetId — accepts an assetId OR a serial. */
export const aidLifecycle = (assetIdOrSerial) =>
  apiCall(
    'GET',
    `/products/asset-id/lifecycle/${encodeURIComponent(assetIdOrSerial)}`,
  );

/**
 * The same request with NO Authorization header — used by the `@Public()`-
 * contract inversion: every asset-id route is behind `@UseGuards(AuthGuard)`,
 * so a regression that drops the guard must be caught.
 */
export const aidUnauthenticated = (method, path, body) =>
  cy.request({
    method,
    url: `${Cypress.env('API_BASE_URL')}${path}`,
    headers: { 'Content-Type': 'application/json' },
    body,
    failOnStatusCode: false,
  });

// ── (2) Oracles — read state back independently of the API that wrote it ─────

/**
 * The `quantities` row for a product on a PO, as the Incoming Inventory
 * listing exposes it: `{ expectedQuantity, receivedQuantity, availableQuantity, cost }`.
 * This is the oracle for every "quantity moved by N" assertion — asset-id
 * generation writes `quantities` directly in raw SQL, so reading it back
 * through a different endpoint is a genuine independent check.
 *
 * Returns zeros (not null) when the product is not on the PO yet, so a caller
 * can diff a before/after pair without null-guarding.
 */
export function readPoQuantities(poNumber, productId) {
  return apiCall(
    'GET',
    `/incoming-items?poNumber=${encodeURIComponent(poNumber)}&page=1&page_size=100`,
  ).then((res) => {
    const body = res.body?.data?.list || res.body?.list || res.body?.data || [];
    const rows = Array.isArray(body) ? body : body.list || [];
    const row = rows.find((r) => Number(r.id ?? r.productId) === Number(productId));
    return {
      found: Boolean(row),
      expectedQuantity: Number(row?.expectedQuantity ?? 0),
      receivedQuantity: Number(row?.receivedQuantity ?? 0),
      availableQuantity: Number(row?.availableQuantity ?? 0),
      cost: row?.cost != null ? Number(row.cost) : null,
    };
  });
}

/**
 * The Asset Lifecycle Report row for one asset ID — the only read-side surface
 * that exposes an ITEM's persisted `cost`, which is what the asset-id create
 * paths copy off the PO's `quantities` row (generate-from-po) or hard-code to 0
 * (disassembly). Returns null when the report has no row for that asset ID.
 */
export function readAssetLifecycleRow(assetId) {
  return apiCall(
    'GET',
    `/reports/asset-lifecycle-report?page=1&page_size=10&search=${encodeURIComponent(assetId)}`,
  ).then((res) => {
    const list = res.body?.data?.list ?? res.body?.list ?? [];
    return (Array.isArray(list) ? list : []).find((r) => r.assetId === assetId) || null;
  });
}

/** An item's current status, read back through the asset-id lifecycle route. */
export function readItemStatus(assetIdOrSerial) {
  return aidLifecycle(assetIdOrSerial).then((res) => aidData(res)?.item?.status ?? null);
}

/** `products.hasItems` for one product, via GET /products/:id. */
export function readProductHasItems(productId) {
  return apiCall('GET', `/products/${productId}`).then((res) => {
    const p = res.body?.data ?? res.body ?? {};
    const product = Array.isArray(p) ? p[0] : (p.product ?? p);
    return product?.hasItems === true;
  });
}

// ── (3) Seeders — assert loudly, so a broken hook never fakes a green test ───

/**
 * Seed one disposable PO carrying BOTH product shapes the app supports:
 *   • a SERIALIZED laptop group (category allowItems = true) with `serials`
 *     already scanned to Available — the substrate every asset-id flow needs;
 *   • a QUANTITY-ONLY RAM group (category allowItems = false) — the negative
 *     partition for "Selected category does not allow items" and the reason the
 *     Category dropdown must not offer it.
 *
 * One Excel import per PO is a backend restriction, so both groups go in the
 * same file (same convention as seedMultiMixedPO in poCloseHelpers).
 *
 * Yields `{ poNumber, laptopProductId, ramProductId, laptopSearch, ramSearch }`.
 *
 * @param {object} p
 * @param {object} p.td      poCloseData.json
 * @param {string} p.poNumber
 * @param {string} p.stamp   unique-per-run suffix (keeps productIds disposable)
 * @param {string[]} p.serials serialized items to create AND scan to Available
 * @param {number} [p.ramQuantity=5]
 */
export function seedAssetIdPo({ td, poNumber, stamp, serials, ramQuantity = 5 }) {
  const laptopSearch = `${td.products.laptop.modelNumber}-${stamp}`;
  const ramSearch = `${td.products.ram.memoryGeneration}-${stamp}`;
  const laptopFixture = { categories: { laptop: td.categories.laptop }, laptop: td.products.laptop };
  const ramFixture = { categories: { ram: td.categories.ram }, ram: td.products.ram };

  const rows = [
    ...serials.map((sn) => buildLaptopRow(laptopFixture, stamp, sn)),
    buildRamRow(ramFixture, stamp, ramQuantity),
  ];

  const out = { poNumber, laptopSearch, ramSearch, laptopProductId: null, ramProductId: null };

  createExcelFile(`AID-${stamp}.xlsx`, rows);
  importExcel(`AID-${stamp}.xlsx`, poNumber);

  return apiGetProductIdForPO(poNumber, laptopSearch)
    .then((id) => {
      out.laptopProductId = id;
      return apiGetProductIdForPO(poNumber, ramSearch);
    })
    .then((id) => {
      out.ramProductId = id;
      // Scan every serial Incoming -> Available. Asset-id generation, disassembly
      // and reassembly ALL gate on status === 'Available', so an unscanned
      // serial would make every downstream TC fail with a misleading 400.
      return serials.reduce(
        (chain, sn) => chain.then(() => apiScanSerial(poNumber, sn)),
        cy.wrap(null, { log: false }),
      );
    })
    .then(() => cy.wrap(out, { log: false }));
}

/**
 * Generate `quantity` asset-id items on a seeded PO and assert the create
 * succeeded. Yields the array of created asset IDs (each is also the item's
 * serialNumber — generate-from-po writes assetId into BOTH columns).
 */
export function seedGeneratedAssetIds({ poNumber, categoryId, productId, quantity = 1 }) {
  return aidGenerateFromPo({ poNumber, categoryId, productId, quantity }).then((res) => {
    expect(res.status, `seeding: generate-from-po qty=${quantity} must succeed`).to.be.lessThan(300);
    const ids = assetIdsOf(res);
    expect(ids.length, 'seeding: generate-from-po must return `quantity` created items').to.eq(quantity);
    return cy.wrap(ids, { log: false });
  });
}

/**
 * Disassemble `selectedItemSerialNumber` into `quantity` fresh child items and
 * assert the create succeeded. Yields the array of child asset IDs.
 */
export function seedDisassemblyChildren({
  parentSerialNumber,
  selectedItemSerialNumber,
  categoryId,
  productId,
  quantity = 1,
}) {
  return aidDisassemblyCreate({
    parentSerialNumber,
    selectedItemSerialNumber,
    categoryId,
    productId,
    quantity,
  }).then((res) => {
    expect(res.status, 'seeding: disassembly create-and-generate must succeed').to.be.lessThan(300);
    const ids = assetIdsOf(res);
    expect(ids.length, 'seeding: disassembly must return `quantity` child items').to.eq(quantity);
    return cy.wrap(ids, { log: false });
  });
}

// ── (4) Inventory-operation wrappers used by the cross-flow TCs ──────────────
//
// The point of the Asset ID suite is not that a label prints — it is that an
// asset-id item behaves like any other serialized item across the app's real
// inventory operations. These are the operations the specs exercise against a
// generated item.

/**
 * POST /products/stockout-by-serial-number
 *
 * `orderNumber` is NOT optional in practice. General Config carries
 * `requireWorkOrderForStockOut`, and it is ON in QA — with it on, a stock-out
 * with no `orderNumber` is refused with
 * "Work Order is required for stock out operations" (product-stock-out.service
 * :640-644). The guard is a bare non-empty-string check, so supplying a
 * reference satisfies it without inventing a work order, and — because the
 * lifecycle scrapes work-order linkage out of audit/movement TEXT, not out of
 * this field — it cannot fabricate a false work-order link either.
 *
 * Callers pass one so the spec behaves the same whether or not the environment
 * has the config on; flipping a global config from a test would leak into every
 * other spec sharing QA.
 */
export const aidStockOutSerial = ({ serialNumber, reason, description, orderNumber }) =>
  apiCall('POST', '/products/stockout-by-serial-number', {
    serialNumber,
    reason,
    ...(description ? { description } : {}),
    orderNumber: orderNumber || `REF-AIDL-${Date.now()}`,
  });

/** POST /products/restock-by-serial-number */
export const aidRestockSerial = ({ serialNumber, description }) =>
  apiCall('POST', '/products/restock-by-serial-number', {
    serialNumber,
    ...(description ? { description } : {}),
  });

/** POST /incoming-items/mark-status — the Change Status flow, serial level. */
export const aidMarkStatus = ({ poNumber, serialNumbers, status, damageReason }) =>
  apiCall('POST', '/incoming-items/mark-status', {
    poNumber,
    status,
    serialNumbers,
    ...(damageReason ? { damageReason } : {}),
  });

/**
 * POST /products/mark-available — the OTHER route back to Available.
 * It is not a synonym for restock-by-serial-number: markAvailable() calls
 * removeConsumedItemFromParent() while restockBySerialNumber() does not, which
 * is the divergence SW-AIDA-API-TC20/TC23 pin.
 */
export const aidMarkAvailable = ({ serialNumber, poNumber }) =>
  apiCall('POST', '/products/mark-available', {
    serialNumber,
    ...(poNumber ? { poNumber } : {}),
  });

/** POST /containers/scan-assign — assign one serial into a container by code. */
export const aidAssignSerialToContainer = ({ containerCode, serialNumber }) =>
  apiCall('POST', '/containers/scan-assign', { containerCode, serialNumber });

/**
 * PUT /containers/:id — park a container AT a Bin by setting its `locationId`.
 *
 * The lifecycle's `warehouse.currentPlacement` reads `locationPath` off the
 * CONTAINER's location (`JOIN locations l ON l.id = c.location_id`), not off the
 * item, so a container that was never parked yields a placement with a null path
 * and the location assertion would pass for the wrong reason.
 *
 * NOT `POST /containers/:id/move-to-location/:locationId` — despite the name that
 * route moves the container's CONTENTS into the location (its response is
 * `{ itemsMoved, quantitiesMoved }`) and leaves `containers.location_id` alone.
 * Confirmed on QA: after calling it, currentPlacement still returned
 * `locationId: null`.
 */
export const aidParkContainerAtLocation = ({ containerId, locationId }) =>
  apiCall('PUT', `/containers/${containerId}`, { locationId });

/**
 * POST /location-assignments/:locationId/items — assign a serial DIRECTLY to a
 * Bin, with no container involved.
 *
 * This is the write side of the confirmed defect the suite pins: the row lands
 * in `container_items` with `container_id = NULL, assignment_type = 'LOCATION'`,
 * which the lifecycle's INNER `JOIN containers` drops, and its audit row is
 * written under `entityType: 'Location'`, which neither timeline query reads.
 * See search-lifecycle-plan.md §1.3 fact 2.
 */
export const aidAssignSerialToLocation = ({ locationId, serialNumber, productId }) =>
  apiCall('POST', `/location-assignments/${locationId}/items`, {
    serialNumber,
    ...(productId ? { productId } : {}),
  });

/** DELETE /location-assignments/items/:serialNumber — the inverse of the above. */
export const aidUnassignSerialFromLocation = (serialNumber) =>
  apiCall('DELETE', `/location-assignments/items/${encodeURIComponent(serialNumber)}`);

// ── (5) Work-order wrappers ─────────────────────────────────────────────────
//
// The lifecycle does not JOIN work orders — it regex-scrapes `WORK ORDER <n>`
// out of audit `actionType` and movement `description` (asset-id service :76-80).
// The only way to prove that linkage still works is to drive a real work order
// end to end, so these three wrappers exist purely as fixtures for TC15/TC19.

/**
 * POST /work-orders — an Open work order reserving `quantity` of one product.
 *
 * Yields `{ id, workOrderNumber }` read back OUT OF THE RESPONSE, and asserts
 * the create succeeded.
 *
 * The read-back is not defensive padding: the backend IGNORES the
 * `workOrderNumber` in the request body and assigns its own sequential number
 * (confirmed on QA — posting `WO-DIAG-1785730190330` produced `WO-9`). Every
 * later call that names the work order must therefore use the ASSIGNED number,
 * or it fails with "Work order with number … was not found."
 */
export function seedWorkOrder({ productId, productName, quantity = 1 }) {
  const requested = `WO-AIDL-${Date.now()}`;
  return apiCall('POST', '/work-orders', {
    workOrderNumber: requested,
    saleOrderNumber: `SO-${requested}`,
    status: 'Open',
    products: [{ productId, name: productName || requested, partNumber: null, quantity }],
  }).then((res) => {
    expect(res.status, 'seeding: creating the work order must succeed').to.be.lessThan(300);
    const wo = res.body?.data ?? res.body ?? {};
    expect(
      wo.workOrderNumber,
      'seeding: the work order must come back with the number the SERVER assigned',
    ).to.be.a('string').and.not.be.empty;
    return cy.wrap({ id: wo.id, workOrderNumber: wo.workOrderNumber }, { log: false });
  });
}

/** POST /work-orders/scan — reserve one serial against a work order. */
export const aidScanIntoWorkOrder = ({ workOrderNumber, productId, serialNumber }) =>
  apiCall('POST', '/work-orders/scan', { workOrderNumber, productId, serialNumber });

/** POST /work-orders/product/stockout — ship everything scanned for one product. */
export const aidWorkOrderStockOut = ({ workOrderNumber, productId }) =>
  apiCall('POST', '/work-orders/product/stockout', { workOrderNumber, productId });

/** DELETE /work-orders/:id/cancel — used only for `after()` cleanup. */
export const aidCancelWorkOrder = (id) => apiCall('DELETE', `/work-orders/${id}/cancel`);

// ── (6) Lifecycle-specific oracles ──────────────────────────────────────────
//
// Every one of these reads the SAME response the specs assert on, so they are
// projections rather than independent oracles. They exist because the timeline
// is a three-source union (search-lifecycle-plan.md §1.2) and "did operation X
// show up?" is otherwise re-derived, slightly differently, in twenty tests.

/** The `timeline` array from a lifecycle response (always an array). */
export const timelineOf = (res) => {
  const t = aidData(res)?.timeline;
  return Array.isArray(t) ? t : [];
};

/**
 * Timeline entries whose `action` contains `needle`, case-insensitively.
 *
 * Substring, not equality, on purpose: audit actions are built by string
 * interpolation (`MARKED AS DAMAGED`, `RESERVED FOR WORK ORDER WO-123`), so an
 * equality match would need the test to re-derive the exact upstream wording.
 * Pass `type` to restrict to one of the three sources — that distinction is the
 * whole point of TC17, where the movement survives and the audit does not.
 * (Previously cited "TC13/TC14": SW-AIDL-API-TC14 does not exist — coverage.md
 * jumps TC13 to TC15 by design — so the reference was stale, not the gap.)
 */
export const timelineEntries = (res, needle, type) =>
  timelineOf(res).filter(
    (e) =>
      String(e?.action || '')
        .toLowerCase()
        .includes(String(needle).toLowerCase()) &&
      (type ? e?.type === type : true),
  );

/** `warehouse.currentPlacement`, or null. */
export const placementOf = (res) => aidData(res)?.warehouse?.currentPlacement ?? null;

/** `workOrders` from a lifecycle response (always an array). */
export const workOrdersOf = (res) => {
  const w = aidData(res)?.workOrders;
  return Array.isArray(w) ? w : [];
};

/** `disassembledComponents` from a lifecycle response (always an array). */
export const disassembledOf = (res) => {
  const d = aidData(res)?.disassembledComponents;
  return Array.isArray(d) ? d : [];
};

/** `reassembledComponents` from a lifecycle response (always an array). */
export const reassembledOf = (res) => {
  const r = aidData(res)?.reassembledComponents;
  return Array.isArray(r) ? r : [];
};

/** `reassembly.targets` from a lifecycle response (always an array). */
export const reassemblyTargetsOf = (res) => {
  const t = aidData(res)?.reassembly?.targets;
  return Array.isArray(t) ? t : [];
};

/**
 * Assert a lifecycle GET resolved, and yield its `data`.
 *
 * GET /asset-id/lifecycle is the one asset-id route that does NOT use the
 * `200 + success:false` envelope-failure convention — it throws NotFound /
 * BadRequest, so the wire status is the contract (plan §1.3 fact 8). Asserting
 * a bare `< 300` here would let a 204 through and would not distinguish the 404
 * that half the negative TCs are about, so the positive path asserts 200 exactly.
 */
export const expectLifecycleOk = (res, message) => {
  expect(res.status, message || 'lifecycle lookup must resolve').to.eq(200);
  return aidData(res);
};
