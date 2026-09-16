// cypress/support/helpers/inventoryReportHelpers.js
//
// New helpers this suite introduces — see
// cypress/qa/testPlans/inventoryReport/plan.md §6.2. Everything else (PO
// seeding, check-in, scan, mark-status) is reused as-is from
// poCloseHelpers.js / exportSeedingHelpers.js / the cy.iaSetSerialStatus
// command; InventoryReportAPI.cy.js composes them with the wrappers below.
//
// The core idea: a disposable PO seeded "today" has, by construction, no
// inventoryMovements/stockoutItems history before today, so reading the
// Ending Inventory Report "As-of Yesterday" (or any earlier preset) for
// that PO is GUARANTEED to be $0/0 units, and "As-of Today" is GUARANTEED
// to reflect exactly what the test just did against it. This makes
// buildEndingInventoryQuery's As-of-Date engine fully deterministic and
// testable without any pre-existing QA history.

import { apiCall } from './allPosHelpers';

/** 'YYYY-MM-DD' for `daysAgo` days before today (0 = today). */
export function isoDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// As-of Date preset -> {startDate, endDate}, mirroring the FE's
// handlePresetChange (InventoryReport/index.tsx) — every preset resolves to
// the SAME single day for both bounds. 'today' resolves to {} (no date
// params at all), which is the "Today" no-date short-circuit
// (getEndingInventoryReport: `if (!startDate || !endDate) return
// this.getInventoryValueReport(options);`).
export const AS_OF_PRESETS = {
  today: () => ({}),
  yesterday: () => ({ startDate: isoDate(1), endDate: isoDate(1) }),
  oneWeekAgo: () => ({ startDate: isoDate(7), endDate: isoDate(7) }),
  oneMonthAgo: () => ({ startDate: isoDate(30), endDate: isoDate(30) }),
};

/**
 * GET /reports/ending-inventory-report scoped by po/search/status/As-of
 * Date. Returns the raw cy.request response — callers assert status/shape
 * themselves. Uses apiCall() (poCloseHelpers/exportSeedingHelpers'
 * convention), which reads its bearer token via cy.getAuthToken() from the
 * app's own localStorage — callers need a real logged-in session
 * (cy.authSession('admin'); cy.visit('/');) before using this.
 */
export function endingInventoryReport({ po, search, status, categoryId, startDate, endDate, page = 1, pageSize = 5 } = {}) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (po) params.set('po', po);
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (categoryId != null) params.set('categoryId', String(categoryId));
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return apiCall('GET', `/reports/ending-inventory-report?${params.toString()}`);
}

/** Same as endingInventoryReport(), pre-resolved to { total, qty, status }. */
export function endingInventoryTotal(filter = {}) {
  return endingInventoryReport(filter).then((res) => {
    const body = res.body?.data || res.body;
    return {
      total: parseFloat(body?.summary?.totalInventoryValue || 0),
      qty: parseFloat(body?.summary?.totalAvailableQty || 0),
      status: res.status,
      raw: res,
    };
  });
}

/** endingInventoryTotal(), pre-filled with an As-of Date preset's date params. */
export function endingInventoryTotalAsOf(preset, filter = {}) {
  const dateOpts = (AS_OF_PRESETS[preset] || AS_OF_PRESETS.today)();
  return endingInventoryTotal({ ...filter, ...dateOpts });
}

/** GET /reports/ending-inventory-report/grouped. */
export function groupedEndingInventoryReport({
  groupBy,
  po,
  search,
  status,
  categoryId,
  startDate,
  endDate,
  page = 1,
  pageSize = 25,
} = {}) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (groupBy) params.set('groupBy', Array.isArray(groupBy) ? groupBy.join(',') : groupBy);
  if (po) params.set('po', po);
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (categoryId != null) params.set('categoryId', String(categoryId));
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return apiCall('GET', `/reports/ending-inventory-report/grouped?${params.toString()}`);
}

/**
 * GET /reports/ending-inventory-report/export — returns the parsed workbook
 * ({ sheets }) via the parseExcelBuffer task, using a real bearer token read
 * from the app's own localStorage (cy.getAuthToken()) — same auth path
 * apiCall() uses, so callers need a real logged-in session first.
 */
export function exportEndingInventoryReport({ po, search, status, categoryId, startDate, endDate, groupBy } = {}) {
  const params = new URLSearchParams();
  if (po) params.set('po', po);
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (categoryId != null) params.set('categoryId', String(categoryId));
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const path = groupBy
    ? `/reports/ending-inventory-report/grouped/export?groupBy=${encodeURIComponent(
        Array.isArray(groupBy) ? groupBy.join(',') : groupBy
      )}&${params.toString()}`
    : `/reports/ending-inventory-report/export?${params.toString()}`;
  // Re-validate the session immediately before reading the token — a raw
  // cy.request() bypasses the app's own axios refresh-token interceptor, so
  // an admin-session token that was fresh when this describe's before() ran
  // can have expired by the time a later it() in a long-running suite fires
  // this export (see commands.js's validateFreshSession — the exact 401
  // failure mode it exists to prevent). cy.session() is a no-op when the
  // cached session is still fresh, so this is cheap in the common case.
  cy.authSession('admin');
  return cy.getAuthToken().then((token) =>
    cy
      .request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}${path}`,
        headers: { Authorization: `Bearer ${token}` },
        encoding: 'base64',
        failOnStatusCode: false,
        timeout: 12 * 60 * 1000,
      })
      .then((res) => {
        expect(res.status, `export ${path}: HTTP`).to.equal(200);
        return cy.task('parseExcelBuffer', { base64Data: res.body });
      })
  );
}

/** Normalise a report's { list } out of whatever wrapper the response uses. */
export function listOf(body) {
  const data = body && (body.data || body);
  return (data && (data.list || data.items || data.results)) || [];
}

/** Read a single row's PO Cost for a po+search scope, or undefined if no row matched. */
export function poCostFor({ po, search, status, startDate, endDate } = {}) {
  return endingInventoryReport({ po, search, status, startDate, endDate, pageSize: 5 }).then((res) => {
    const list = listOf(res.body);
    const row = list.find((r) => r.poCost !== undefined);
    return row ? parseFloat(row.poCost) : undefined;
  });
}
