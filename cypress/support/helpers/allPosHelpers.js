// cypress/support/helpers/allPosHelpers.js
//
// Reusable, side-effect-free helpers for AllPOsTests.cy.js. Extracted out
// of the spec per the test conventions (no inline logic in the spec
// beyond orchestration + assertion). All functions accept their data
// instead of reading from a closure, so they're easy to unit-test and
// reason about.
//
// Two flavors:
//   (1) API helpers — wrap cy.request with auth + JSON headers
//   (2) Excel-row builders — pure functions that produce row objects for
//       the createExcelFile task

// ─── Time stamp + Excel rows ─────────────────────────────────────────────────

export function ts() {
  const d = new Date();
  return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
}

/**
 * Build a RAM Excel row. Memory Generation is stamped per run so each suite
 * run creates a unique productId — required to keep stockOut / WO-reserve
 * scoped to the test's PO (see prior memory note re. adjustAcrossPOs being
 * cross-PO).
 *
 * @param {object} td      — fixture data (allPosData.json)
 * @param {string} stamp   — unique-per-test stamp, typically ts()
 * @param {string} qty     — Excel "Quantity" column value
 */
export function buildRamRow(td, stamp, qty) {
  return {
    Category: td.categories.ram,
    RAMbrand: td.ram.brand,
    'Memory Generation': `${td.ram.memoryGeneration}-${stamp}`,
    Cost: td.ram.cost,
    Price: td.ram.price,
    'Support Contact': td.ram.supportContact,
    Quantity: qty || td.ram.defaultQuantity,
  };
}

/**
 * Build a Laptop Excel row.
 *
 * @param {object} td      — fixture data
 * @param {string} stamp   — unique-per-test stamp
 * @param {string} serial  — serial number to assign to the item
 */
export function buildLaptopRow(td, stamp, serial) {
  return {
    Category: td.categories.laptop,
    'Model Number': `${td.laptop.modelNumber}-${stamp}`,
    Brand: td.laptop.brand,
    Cost: td.laptop.cost,
    Price: td.laptop.price,
    'Support Contact': td.laptop.supportContact,
    'Serial Number': serial,
    'Asset Tag ID': `ASSET-${serial}`,
    'Asset Security Code': `ASC-${serial}`,
  };
}

/**
 * Write rows to cypress/fixtures/<fileName>.xlsx via the createExcelFile
 * task registered in cypress.config.js.
 */
export function createExcelFile(fileName, data) {
  return cy.task('createExcelFile', {
    filePath: `cypress/fixtures/${fileName}`,
    data,
  });
}

// ─── API helpers ─────────────────────────────────────────────────────────────

function apiBase() {
  const env = Cypress.env('API_BASE_URL');
  if (typeof env === 'string' && env.length > 0) return env;
  return Cypress.config('baseUrl').replace(/\/$/, '').replace('://', '://api.');
}

/**
 * Authenticated cy.request with JSON headers. Returns a Cypress chain.
 * `failOnStatusCode: false` so callers can assert on negative responses
 * (e.g. the duplicate-product test) without Cypress aborting the test
 * before assertion.
 */
export function apiCall(method, path, body) {
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
    }),
  );
}

/**
 * Look up the productId for a given PO + free-text search term. Used both
 * to seed Add-Product flows and as a sanity check that an Excel import
 * succeeded.
 */
export function apiGetProductId(poNumber, search) {
  const url =
    `/incoming-items?poNumber=${encodeURIComponent(poNumber)}` +
    `&search=${encodeURIComponent(search)}&page=1&page_size=10`;
  return apiCall('GET', url).then((res) => {
    const list =
      res.body?.data?.list || res.body?.list || res.body?.data || [];
    const arr = Array.isArray(list) ? list : list.list || [];
    const first = arr.find((row) => row && (row.id || row.productId));
    expect(
      first,
      `apiGetProductId: no product matched search='${search}' poNumber='${poNumber}'`,
    ).to.exist;
    return first.id || first.productId;
  });
}

/**
 * POST /incoming-items/add-product — same call the Add-Product dialog uses.
 *
 * @param {object} body
 * @param {number} body.productId
 * @param {string} body.poNumber
 * @param {number} body.expectedQuantity
 * @param {string} [body.cost]
 */
export function apiAddProductToPO({
  productId,
  poNumber,
  expectedQuantity,
  cost,
}) {
  return apiCall('POST', '/incoming-items/add-product', {
    productId,
    poNumber,
    expectedQuantity: Number(expectedQuantity),
    cost: cost != null ? String(cost) : undefined,
  });
}

/**
 * GET /incoming-items/reports?poNumber=allPO — the same query the FE
 * issues when "All POs" is selected. The badge labels in the UI map to
 * fields on `data.reports`.
 */
export function apiGetAllPOsReports() {
  return apiCall('GET', '/incoming-items/reports?poNumber=allPO');
}

/**
 * GET /incoming-items?poNumber=allPO&page=1&page_size=75 — the listing
 * endpoint used by the All-POs view. Total record count lives at
 * `data.pagination.count` (incoming-item.service.ts:2454-2458).
 */
export function apiGetAllPOsListing(page = 1, pageSize = 75) {
  return apiCall(
    'GET',
    `/incoming-items?poNumber=allPO&page=${page}&page_size=${pageSize}`,
  );
}

/**
 * Verify a productId is present in a given PO's listing — convenience
 * assertion used by the Add-Product happy-path tests.
 */
export function apiAssertProductInPO(poNumber, productId) {
  return apiCall(
    'GET',
    `/incoming-items?poNumber=${encodeURIComponent(
      poNumber,
    )}&page=1&page_size=10`,
  ).then((res) => {
    const list =
      res.body?.data?.list || res.body?.list || res.body?.data || [];
    const arr = Array.isArray(list) ? list : list.list || [];
    const found = arr.some((p) => Number(p.id) === Number(productId));
    expect(found, `productId ${productId} present in PO ${poNumber}`).to.eq(true);
  });
}

// ─── Cleanup helper ──────────────────────────────────────────────────────────

import IncomingInvPage from '../../pageObjects/IncomingInvPage';

/**
 * Iterate `pos` and delete any that the QA env still has, using the
 * Purchase Orders page UI flow (mirrors the cleanup in scanAllTestHelpers
 * `after()` hook so we stay consistent with the rest of the suite).
 */
export function cleanupCreatedPOs(pos) {
  if (!pos || pos.length === 0) return;
  const incPage = new IncomingInvPage();
  pos.forEach((po) => {
    incPage.navigateToPOTab();
    cy.intercept('GET', '**/purchase-orders*').as('poSearch');
    cy.get('#searchInputRef', { timeout: 20000 })
      .should('be.visible')
      .clear()
      .type(po);
    cy.wait('@poSearch', { timeout: 15000 });
    cy.get('body').then(($b) => {
      if ($b.find(`td:contains("${po}")`).length === 0) return;
      cy.contains('td', po)
        .closest('tr')
        .find('button')
        .last()
        .click({ force: true });
      cy.get('body').then(($b2) => {
        if (
          $b2.find('input[placeholder="Type DELETE to confirm"]').length > 0
        ) {
          cy.get('input[placeholder="Type DELETE to confirm"]')
            .clear()
            .type('DELETE');
          cy.contains('button', /^Yes$/i).click();
        }
      });
    });
  });
}
