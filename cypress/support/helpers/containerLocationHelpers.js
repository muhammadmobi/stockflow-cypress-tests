// cypress/support/helpers/containerLocationHelpers.js
//
// Helpers for the config-gated "Allow Container Location Assignment" feature
// (general config `enableContainerLocationAssignment`). Used by:
//   • cypress/e2e/IncomingInventory/StockInBySerialNumbers.cy.js
//   • cypress/e2e/InventoryActions/05-SmartStockIn.cy.js
//
// Test plan: cypress/qa/testPlans/incomingInventory/sub/container-location-assignment-plan.md
//
// Two concerns:
//   1. Toggle the general-config flag via API (and restore the pre-run value).
//   2. Seed disposable containers WITH a capacity (max_items) — the existing
//      createContainerViaApi() in wmsContainerHelpers can't set max_items — plus
//      read-only ORACLES for verifying container/location quantities independently
//      of the DOM that produced them (CTAL-TAE §7: SUT observability).
//
// Cleanup of the seeded WMS resources reuses wmsContainerHelpers /
// wmsLocationHelpers (emptyContainerViaApi → deleteContainerViaApi, etc.).

const CONFIG_KEY = 'enableContainerLocationAssignment';

const api = () => Cypress.env('API_BASE_URL');
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Unwrap the standard `{ data: … }` envelope, tolerating a bare body.
const unwrap = (res) => res.body && (res.body.data || res.body);

// ── General-config toggle ──────────────────────────────────────────────────

/**
 * Fetch the "general" config row (id + configJson) via API.
 * Returns a Cypress chain yielding the row.
 */
export function getGeneralConfigRow() {
  return cy.getAuthToken().then((token) =>
    cy
      .request({
        method: 'GET',
        url: `${api()}/configs`,
        qs: { type: 'general', name: 'general' },
        headers: auth(token),
        failOnStatusCode: false,
      })
      .then((res) => {
        expect(res.status, 'GET /configs (general)').to.eq(200);
        const list = res.body?.data?.list || res.body?.data || [];
        const row = (Array.isArray(list) ? list : []).find((c) => c.name === 'general');
        expect(row, 'general config row must exist').to.exist;
        return row;
      })
  );
}

/**
 * Read the current boolean value of enableContainerLocationAssignment.
 * Returns a Cypress chain yielding a boolean.
 */
export function readContainerLocationAssignment() {
  return getGeneralConfigRow().then((row) => row?.configJson?.data?.[CONFIG_KEY] === true);
}

/**
 * PATCH enableContainerLocationAssignment to `enabled`, merging into the
 * existing configJson.data so no other toggle is disturbed. Returns a Cypress
 * chain yielding the previous boolean value (so a caller can restore it later).
 */
export function setContainerLocationAssignment(enabled) {
  return getGeneralConfigRow().then((row) => {
    const currentData = (row.configJson && row.configJson.data) || {};
    const previous = currentData[CONFIG_KEY] === true;
    if (previous === enabled) return cy.wrap(previous);
    const merged = { ...currentData, [CONFIG_KEY]: enabled };
    return cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'PATCH',
          url: `${api()}/configs/${row.id}`,
          headers: { ...auth(token), 'Content-Type': 'application/json' },
          body: { type: 'general', configJson: { data: merged } },
          failOnStatusCode: false,
        })
        .then((res) => {
          expect(res.status, `PATCH /configs/${row.id} ${CONFIG_KEY}=${enabled}`).to.be.lessThan(400);
          return previous;
        })
    );
  });
}

// ── Container seeding WITH capacity ────────────────────────────────────────

/**
 * Create a disposable container under `containerTypeId` with an optional
 * `maxItems` capacity. Uses an explicit high-entropy code rather than the
 * server's `next-code` — next-code isn't collision-safe when several containers
 * are created under the same type in quick succession (and an orphan from a
 * crashed run can make the first suggested code already-taken). Returns a Cypress
 * chain yielding the created container record (incl. id, code, max_items) or null.
 */
export function createContainerWithCapacity(containerTypeId, maxItems) {
  if (!containerTypeId) return cy.wrap(null);
  const code = `CLA-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const body = { containerTypeId, code };
  if (maxItems != null) body.max_items = maxItems;
  return cy.getAuthToken().then((token) =>
    cy
      .request({
        method: 'POST',
        url: `${api()}/containers`,
        headers: auth(token),
        body,
        failOnStatusCode: false,
      })
      .then((res) => {
        expect(
          res.status,
          `POST /containers (code ${code}) → ${JSON.stringify(res.body)}`
        ).to.be.lessThan(400);
        return unwrap(res) || null;
      })
  );
}

// ── Oracles — containers ───────────────────────────────────────────────────

/** GET /containers/:id → cur_items (Number). */
export function getContainerCurItems(id) {
  return cy.getAuthToken().then((token) =>
    cy
      .request({ method: 'GET', url: `${api()}/containers/${id}`, headers: auth(token), failOnStatusCode: false })
      .then((res) => {
        expect(res.status, `GET /containers/${id}`).to.eq(200);
        return Number(unwrap(res)?.cur_items ?? 0);
      })
  );
}

/** GET /containers/:id/quantities → quantity for a given productId (Number, 0 if absent). */
export function getContainerQuantityForProduct(id, productId) {
  return cy.getAuthToken().then((token) =>
    cy
      .request({ method: 'GET', url: `${api()}/containers/${id}/quantities`, headers: auth(token), failOnStatusCode: false })
      .then((res) => {
        expect(res.status, `GET /containers/${id}/quantities`).to.eq(200);
        const body = unwrap(res);
        const rows = Array.isArray(body) ? body : body?.list || body?.items || [];
        const row = rows.find((r) => Number(r.productId ?? r.product_id) === Number(productId));
        return Number(row?.quantity ?? 0);
      })
  );
}

/** GET /containers/:id/items → array of serial strings currently in the container. */
export function getContainerSerials(id) {
  return cy.getAuthToken().then((token) =>
    cy
      .request({ method: 'GET', url: `${api()}/containers/${id}/items`, headers: auth(token), failOnStatusCode: false })
      .then((res) => {
        expect(res.status, `GET /containers/${id}/items`).to.eq(200);
        const body = unwrap(res);
        const rows = Array.isArray(body) ? body : body?.list || body?.items || [];
        return rows.map((r) => r.serialNumber || r.serial_number).filter(Boolean);
      })
  );
}

// ── Oracles — bin locations ────────────────────────────────────────────────

/** GET /location-assignments/:locationId/quantities → quantity for a productId. */
export function getLocationQuantityForProduct(locationId, productId) {
  return cy.getAuthToken().then((token) =>
    cy
      .request({
        method: 'GET',
        url: `${api()}/location-assignments/${locationId}/quantities`,
        headers: auth(token),
        failOnStatusCode: false,
      })
      .then((res) => {
        expect(res.status, `GET /location-assignments/${locationId}/quantities`).to.eq(200);
        const body = unwrap(res);
        const rows = Array.isArray(body) ? body : body?.list || body?.items || [];
        const row = rows.find((r) => Number(r.productId ?? r.product_id) === Number(productId));
        return Number(row?.quantity ?? 0);
      })
  );
}

/** GET /location-assignments/:locationId/items → array of serial strings. */
export function getLocationSerials(locationId) {
  return cy.getAuthToken().then((token) =>
    cy
      .request({
        method: 'GET',
        url: `${api()}/location-assignments/${locationId}/items`,
        headers: auth(token),
        failOnStatusCode: false,
      })
      .then((res) => {
        expect(res.status, `GET /location-assignments/${locationId}/items`).to.eq(200);
        const body = unwrap(res);
        const rows = Array.isArray(body) ? body : body?.list || body?.items || [];
        return rows.map((r) => r.serialNumber || r.serial_number).filter(Boolean);
      })
  );
}
