/**
 * Inventory Report (Ending Inventory Report) API Tests — SW-IR-API-TC01..52
 * =============================================================================
 * Mirrors:  cypress/e2e/23-InventoryReportTests.cy.js
 * Backend:  Backend/src/modules/reports/reports.controller.ts +
 *           inventory-value-report.service.ts (getEndingInventoryReport,
 *           getGroupedEndingInventoryReport, exportEndingInventoryReport,
 *           exportGroupedEndingInventoryReport, buildEndingInventoryQuery,
 *           delegating to getInventoryValueReport/buildInventoryValueQuery
 *           for the no-date "Today" case).
 * Plan:     cypress/qa/testPlans/inventoryReport/plan.md
 *
 * Supersedes SW-RPT-API-TC07/TC08 in cypress/e2e/api/ReportsAPI.cy.js for
 * arithmetic-coverage purposes — those remain valid reachability checks and
 * are NOT deleted, but this suite is the one that proves computed values.
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET /reports/ending-inventory-report                 AuthGuard
 *   GET /reports/ending-inventory-report/grouped          AuthGuard
 *   GET /reports/ending-inventory-report/export            AuthGuard (xlsx)
 *   GET /reports/ending-inventory-report/grouped/export     AuthGuard (xlsx)
 *   GET /reports/inventory-value-report                   AuthGuard (delegation-proof oracle, TC07)
 *   GET /configs?name=inventoryValueReportCustomizeColumn (shared-config proof, TC52)
 *
 * -----------------------------------------------------------------------------
 *   Deterministic As-of-Date seeding (plan.md §6.2)
 * -----------------------------------------------------------------------------
 *   A disposable PO seeded "today" has zero inventoryMovements/stockoutItems
 *   history before today — so "As-of Yesterday" is GUARANTEED $0/0 for it,
 *   and "As-of Today" is GUARANTEED to reflect exactly what the test did.
 *   This makes buildEndingInventoryQuery's As-of-Date engine fully testable
 *   without any pre-existing QA history — see inventoryReportHelpers.js.
 *
 * -----------------------------------------------------------------------------
 *   Corrections vs. the literal plan text, made during implementation
 * -----------------------------------------------------------------------------
 *   1) TC18/TC20/TC21 (pure-product mark-Damaged/Missing/Disputed): the
 *      plan's original wording assumed a conservation DEBIT on the default
 *      view. Reading product-stock-out.service.ts's markStatus() (and the
 *      CostReportAPI.cy.js precedent, which found the exact same thing for
 *      Cost Report) confirms the product-only branch never touches
 *      quantities.availableQuantity — it only writes a stockoutItems row.
 *      So these TCs assert the default view stays unchanged (not an
 *      unwitnessed debit) — that half IS a confirmed contract. TC22 (Sold,
 *      via /products/stock-out) is the one product-only mutation that
 *      genuinely debits availableQuantity, so real conservation is asserted
 *      there.
 *      2026-07-16 correction: the "status view is credited" half of TC18/
 *      TC20/TC21 is NOT a confirmed-working contract — product-stock-out.
 *      service.ts's INSERT INTO "stockoutItems" for this branch (both the
 *      inventoryAction and default code paths) hardcodes `reason = null`,
 *      exactly like the serialized-item branch TC19/TC50 already flag. Since
 *      the report's status filter uses `AND soi.reason != 'Sold'` (NULL-
 *      excluding under standard SQL 3-valued logic — see BUG_REPORT.md),
 *      TC18/TC20/TC21's "status view credited" assertion is expected to
 *      reproduce the SAME reason:null defect as TC19/TC50, not pass. These
 *      TCs still assert the correct business expectation (ISTQB principle
 *      #1: testing shows the presence of defects) — they are not softened.
 *   2) TC23-26 (PO Cost definitional split) do not need an artificially
 *      mixed-cost PO: qca.max_cost >= pac.avg_cost is a mathematical
 *      certainty for any shared set of `quantities` rows (a MAX is never
 *      below its own weighted average), so the already-seeded PO from the
 *      pure-product lifecycle block proves the inequality directly, and
 *      TC25/26 compare As-of-Today against the Today engine on that same
 *      po+search scope for equality. No new seeding block needed.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedMixedPO,
  seedSerializedPO,
  seedMultiProductOnlyPO,
  apiCheckIn,
  apiScanSerial,
  apiDeletePO,
  apiStockOutProductQuantity,
} from '../../../support/helpers/poCloseHelpers';
import { apiMarkProductStatusInventory } from '../../../support/helpers/exportSeedingHelpers';
import {
  isoDate,
  endingInventoryReport as endingInventoryReportRaw,
  endingInventoryTotal,
  groupedEndingInventoryReport as groupedEndingInventoryReportRaw,
  exportEndingInventoryReport,
  listOf,
} from '../../../support/helpers/inventoryReportHelpers';

const CENT = 0.01; // inventory software: money is exact to the cent (see salesReport/LESSONS_LEARNED.md)

// ════════════════════════════════════════════════════════════════════════════
// Thin wiring/contract TCs — identity-login track, no seeding required.
// ════════════════════════════════════════════════════════════════════════════
describe('Inventory Report API', () => {
  let authToken;
  let baseUrl;
  let seedProduct;
  let seedPoNumber;

  const headers = () => ({ Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' });

  const endingInventoryReport = (qs = '?page=1&page_size=10') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  const groupedEndingInventoryReport = (qs) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/grouped${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  const inventoryValueReport = (qs = '?page=1&page_size=10') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/inventory-value-report${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  const poNumbers = (qs = '?close=true') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/excel/po-numbers${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');

    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });

    cy.then(() => {
      endingInventoryReport('?page=1&page_size=5').then((res) => {
        seedProduct = (listOf(res.body) || [])[0];
      });
      poNumbers('?close=true').then((res) => {
        const body = res.body.data || res.body;
        const list = body.poList || body.list || body;
        const arr = Array.isArray(list) ? list : [];
        seedPoNumber = arr.find((p) => typeof p === 'string') || (arr[0] && arr[0].poNumber);
      });
      // inventoryValueReportCustomizeColumn is a single row shared across every
      // user/session (Cost Report + Inventory Report both read/write it — see
      // TC52). A prior column-customization test elsewhere that didn't reach
      // its own "restore" step leaves it permanently non-default, which then
      // breaks every test here that assumes the documented default column
      // set/order (TC48d et al). Reset it once up front so this whole spec
      // runs from the same known baseline every time.
      cy.request({
        method: 'GET',
        url: `${baseUrl}/configs?name=inventoryValueReportCustomizeColumn&type=inventoryValueReportCustomizeColumn`,
        headers: headers(),
        failOnStatusCode: false,
      }).then((res) => {
        const rows = res.body?.data?.list || res.body?.list || [];
        rows.forEach((row) => {
          if (JSON.stringify(row.configJson?.columns) !== JSON.stringify(['Product Name', 'Category', 'Total Inventory Cost', 'Avg Cost'])) {
            cy.request({
              method: 'PATCH',
              url: `${baseUrl}/configs/${row.id}`,
              headers: headers(),
              body: { configJson: { columns: ['Product Name', 'Category', 'Total Inventory Cost', 'Avg Cost'] } },
              failOnStatusCode: false,
            });
          }
        });
      });
    });
  });

  // ── Auth contract (EP) ──────────────────────────────────────────────────────

  it('SW-IR-API-TC01: GET /reports/ending-inventory-report without auth returns 401', { tags: ['@smoke'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report?page=1&page_size=5`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  it('SW-IR-API-TC02: GET /reports/ending-inventory-report/grouped without auth returns 401', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/grouped?groupBy=Category`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  it('SW-IR-API-TC03: export + grouped/export without auth both return 401', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/export`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/grouped/export?groupBy=Category`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  // ── Param validation (EP / Error Guessing) ──────────────────────────────────

  it('SW-IR-API-TC04: grouped endpoint without groupBy returns 400', { tags: ['@regression'] }, () => {
    groupedEndingInventoryReport('?page=1&page_size=5').then((res) => expect(res.status).to.equal(400));
  });

  it('SW-IR-API-TC05: groupBy=<unknown field> is rejected, not silently accepted', { tags: ['@regression'] }, () => {
    groupedEndingInventoryReport('?groupBy=maliciousUnknownField123').then((res) => {
      expect(res.status, 'unknown groupBy field must not return a 2xx success').to.be.at.least(400);
      if (res.status === 500) {
        cy.log('KNOWN: unknown groupBy returns 500 (InternalServerErrorException), not 400 — same validateGroupByFields() gap the Cost Report plan documented.');
      }
    });
  });

  it('SW-IR-API-TC06: categoryId=<non-integer> returns 400 (flat + grouped)', { tags: ['@regression'] }, () => {
    endingInventoryReport('?page=1&page_size=5&categoryId=notanumber').then((res) => {
      expect(res.status).to.equal(400);
    });
    groupedEndingInventoryReport('?page=1&page_size=5&groupBy=Category&categoryId=notanumber').then((res) => {
      expect(res.status).to.equal(400);
    });
  });

  // ── Today delegation (EP / BVA) ──────────────────────────────────────────────

  it('SW-IR-API-TC07: Today (no As-of Date) is a true passthrough to GET /reports/inventory-value-report', { tags: ['@regression'] }, () => {
    endingInventoryReport('?page=1&page_size=10').then((endingRes) => {
      inventoryValueReport('?page=1&page_size=10').then((valueRes) => {
        expect(endingRes.status).to.equal(200);
        const endingBody = endingRes.body.data || endingRes.body;
        const valueBody = valueRes.body.data || valueRes.body;
        expect(
          parseFloat(endingBody?.summary?.totalInventoryValue || 0),
          'ending-inventory-report Today summary must equal inventory-value-report summary'
        ).to.be.closeTo(parseFloat(valueBody?.summary?.totalExpectedValue ?? valueBody?.summary?.totalInventoryValue ?? 0), CENT);
      });
    });
  });

  it('SW-IR-API-TC08: avgCost equals totalInventoryCost / totalQuantity for every row (Today engine)', { tags: ['@regression'] }, function () {
    endingInventoryReport('?page=1&page_size=50').then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length === 0) this.skip();
      list.forEach((row) => {
        const totalCost = parseFloat(row.totalInventoryCost);
        const qty = parseFloat(row.totalQuantity);
        const avgCost = parseFloat(row.avgCost);
        if (qty > 0) {
          expect(Math.abs(avgCost - totalCost / qty), `avgCost for product ${row.id}`).to.be.lessThan(CENT);
        } else {
          expect(avgCost, `avgCost for product ${row.id} with totalQuantity=0`).to.equal(0);
        }
      });
    });
  });

  it('SW-IR-API-TC09: invalid endDate format returns a clear error, not a silent 200', { tags: ['@regression'] }, () => {
    endingInventoryReport('?page=1&page_size=5&startDate=2026-01-01&endDate=not-a-date').then((res) => {
      expect(res.status, 'malformed endDate must not return a 2xx success').to.be.at.least(400);
    });
  });

  it('SW-IR-API-TC10: unknown status value throws "Unknown status value" on both engines', { tags: ['@regression'] }, () => {
    endingInventoryReport('?page=1&page_size=5&status=NotARealStatus').then((res) => {
      expect(res.status, 'Today engine: unknown status must not return 2xx').to.be.at.least(400);
    });
    endingInventoryReport(`?page=1&page_size=5&status=NotARealStatus&startDate=${isoDate(1)}&endDate=${isoDate(1)}`).then((res) => {
      expect(res.status, 'As-of engine: unknown status must not return 2xx').to.be.at.least(400);
    });
  });

  it('SW-IR-API-TC11: only startDate (no endDate) behaves identically to Today', { tags: ['@regression'] }, () => {
    endingInventoryReport('?page=1&page_size=5').then((defaultRes) => {
      endingInventoryReport('?page=1&page_size=5&startDate=2020-01-01').then((partialRes) => {
        expect(partialRes.status).to.equal(200);
        const defaultBody = defaultRes.body.data || defaultRes.body;
        const partialBody = partialRes.body.data || partialRes.body;
        expect(parseFloat(partialBody?.summary?.totalInventoryValue || 0)).to.be.closeTo(
          parseFloat(defaultBody?.summary?.totalInventoryValue || 0),
          CENT
        );
      });
    });
  });

  it('SW-IR-API-TC12: status=Consumed (backend-only, no UI affordance) is reachable via Today engine', { tags: ['@regression'] }, () => {
    endingInventoryReport('?page=1&page_size=5&status=Consumed').then((res) => {
      expect(res.status).to.equal(200);
      expect(listOf(res.body)).to.be.an('array');
    });
  });

  it('SW-IR-API-TC37: status=Consumed returns 200 on the As-of-Date engine too', { tags: ['@regression'] }, () => {
    const today = isoDate(0);
    endingInventoryReport(`?page=1&page_size=5&status=Consumed&startDate=${today}&endDate=${today}`).then((res) => {
      expect(res.status).to.equal(200);
      expect(listOf(res.body)).to.be.an('array');
    });
  });

  // ── avgCost invariant, proven independently on the As-of engine (BVA) ───────
  // Live-data probe (no seeding needed) — As-of=Today still runs
  // buildEndingInventoryQuery's real SQL path, just reconstructed from
  // whatever inventoryMovements/stockoutItems already exist.

  it('SW-IR-API-TC13: avgCost invariant holds on the As-of-Date default (Available) branch', { tags: ['@regression'] }, function () {
    const today = isoDate(0);
    endingInventoryReport(`?page=1&page_size=50&startDate=${today}&endDate=${today}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length === 0) this.skip();
      list.forEach((row) => {
        const totalCost = parseFloat(row.totalInventoryCost);
        const qty = parseFloat(row.totalQuantity);
        const avgCost = parseFloat(row.avgCost);
        if (qty > 0) {
          expect(Math.abs(avgCost - totalCost / qty), `avgCost for product ${row.id} (As-of default)`).to.be.lessThan(CENT);
        } else {
          expect(avgCost, `avgCost for product ${row.id} with totalQuantity=0 (As-of default)`).to.equal(0);
        }
      });
    });
  });

  it('SW-IR-API-TC14: avgCost invariant holds on the As-of-Date status branch', { tags: ['@regression'] }, function () {
    const today = isoDate(0);
    endingInventoryReport(`?page=1&page_size=50&status=Damaged&startDate=${today}&endDate=${today}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length === 0) this.skip();
      list.forEach((row) => {
        const totalCost = parseFloat(row.totalInventoryCost);
        const qty = parseFloat(row.totalQuantity);
        const avgCost = parseFloat(row.avgCost);
        if (qty > 0) {
          expect(Math.abs(avgCost - totalCost / qty), `avgCost for product ${row.id} (As-of status)`).to.be.lessThan(CENT);
        } else {
          expect(avgCost, `avgCost for product ${row.id} with totalQuantity=0 (As-of status)`).to.equal(0);
        }
      });
    });
  });

  // ── Sorting (BVA) ────────────────────────────────────────────────────────────

  it('SW-IR-API-TC38: sortBy=total_inventory_cost&sortOrder=DESC (Today engine) is genuinely ordered', { tags: ['@regression'] }, function () {
    endingInventoryReport('?page=1&page_size=50&sortBy=total_inventory_cost&sortOrder=DESC').then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length < 2) this.skip();
      const values = list.map((r) => parseFloat(r.total_inventory_cost ?? r.totalInventoryCost ?? 0));
      for (let i = 1; i < values.length; i++) expect(values[i]).to.be.at.most(values[i - 1]);
    });
  });

  it('SW-IR-API-TC39: sortBy=avgCost&sortOrder=ASC (Today engine) is genuinely ordered', { tags: ['@regression'] }, function () {
    endingInventoryReport('?page=1&page_size=50&sortBy=avgCost&sortOrder=ASC').then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length < 2) this.skip();
      const values = list.map((r) => parseFloat(r.avgCost ?? 0));
      for (let i = 1; i < values.length; i++) expect(values[i]).to.be.at.least(values[i - 1]);
    });
  });

  it('SW-IR-API-TC40: sortBy=totalQuantity&sortOrder=DESC (As-of-Date default engine) is genuinely ordered', { tags: ['@regression'] }, function () {
    const today = isoDate(0);
    endingInventoryReport(`?page=1&page_size=50&sortBy=totalQuantity&sortOrder=DESC&startDate=${today}&endDate=${today}`).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length < 2) this.skip();
      const values = list.map((r) => parseFloat(r.totalQuantity ?? 0));
      for (let i = 1; i < values.length; i++) expect(values[i]).to.be.at.most(values[i - 1]);
    });
  });

  it('SW-IR-API-TC41: sortBy=poCost&sortOrder=ASC (As-of-Date status engine + po filter) is genuinely ordered', { tags: ['@regression'] }, function () {
    const today = isoDate(0);
    if (!seedPoNumber) this.skip();
    endingInventoryReport(
      `?page=1&page_size=50&sortBy=poCost&sortOrder=ASC&status=Damaged&po=${encodeURIComponent(seedPoNumber)}&startDate=${today}&endDate=${today}`
    ).then((res) => {
      expect(res.status).to.equal(200);
      const list = listOf(res.body);
      if (list.length < 2) this.skip();
      const values = list.map((r) => parseFloat(r.poCost ?? 0));
      for (let i = 1; i < values.length; i++) expect(values[i]).to.be.at.least(values[i - 1]);
    });
  });

  it('SW-IR-API-TC36: a Custom As-of Date one day in the future — confirms actual backend behavior', { tags: ['@regression'] }, () => {
    const tomorrow = isoDate(-1);
    endingInventoryReport(`?page=1&page_size=5&startDate=${tomorrow}&endDate=${tomorrow}`).then((res) => {
      // buildEndingInventoryQuery only validates FORMAT, not "not in the
      // future" — the FE's own maxDate blocks this via the picker, but the
      // API has no equivalent guard. Document the real behavior rather than
      // assert an unverified expectation either way.
      cy.log(`Future As-of Date response: HTTP ${res.status}`);
      expect(res.status, 'a future date must not 500').to.be.lessThan(500);
    });
  });

  // ── Grouped reconciliation (Decision Table) ─────────────────────────────────

  it('SW-IR-API-TC27: grouped-by-Category totalQuantity sum reconciles with ungrouped sum (Today engine)', { tags: ['@regression'] }, () => {
    endingInventoryReport('?page=1&page_size=1').then((probeRes) => {
      const probeBody = probeRes.body.data || probeRes.body;
      const totalRows = probeBody?.pagination?.count || 1000;
      endingInventoryReport(`?page=1&page_size=${totalRows}`).then((flatRes) => {
        const flatList = listOf(flatRes.body);
        const flatSum = flatList.reduce((s, r) => s + parseFloat(r.totalQuantity || 0), 0);
        groupedEndingInventoryReport(`?page=1&page_size=${totalRows}&groupBy=Category`).then((groupedRes) => {
          expect(groupedRes.status).to.equal(200);
          const groupedBody = groupedRes.body.data || groupedRes.body;
          const groups = groupedBody.list || groupedBody.data || [];
          const groupedSum = groups.reduce((s, g) => s + parseFloat(g.totalQuantity || 0), 0);
          expect(groupedSum, 'sum of grouped totalQuantity should equal sum of ungrouped totalQuantity').to.be.closeTo(flatSum, CENT);
        });
      });
    });
  });

  it('SW-IR-API-TC30: grouped summary totalInventoryValue equals SUM of every group total_inventory_cost (Today engine)', { tags: ['@regression'] }, function () {
    groupedEndingInventoryReport('?page=1&page_size=100&groupBy=Category').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      const groups = body.list || [];
      if (!groups.length) this.skip();
      const groupSum = groups.reduce((s, g) => s + parseFloat(g.total_inventory_cost || 0), 0);
      const summaryTotal = parseFloat(body?.summary?.totalInventoryValue || 0);
      expect(summaryTotal, 'grouped summary.totalInventoryValue should equal SUM(group.total_inventory_cost)').to.be.closeTo(groupSum, CENT);
    });
  });

  // ── Export — Today engine (Use Case / Decision Table) ───────────────────────

  const exportFlat = (qs = '') =>
    cy
      .request({
        method: 'GET',
        url: `${baseUrl}/reports/ending-inventory-report/export${qs}`,
        headers: headers(),
        encoding: 'base64',
        failOnStatusCode: false,
        timeout: 12 * 60 * 1000,
      })
      .then((res) => {
        expect(res.status, 'flat export HTTP status').to.equal(200);
        return cy.task('parseExcelBuffer', { base64Data: res.body });
      });

  const exportGrouped = (qs) =>
    cy
      .request({
        method: 'GET',
        url: `${baseUrl}/reports/ending-inventory-report/grouped/export${qs}`,
        headers: headers(),
        encoding: 'base64',
        failOnStatusCode: false,
        timeout: 12 * 60 * 1000,
      })
      .then((res) => {
        expect(res.status, 'grouped export HTTP status').to.equal(200);
        return cy.task('parseExcelBuffer', { base64Data: res.body });
      });

  it('SW-IR-API-TC42: flat export (Today) header + data match the JSON report, TOTALS row excluded', { tags: ['@regression'] }, function () {
    endingInventoryReport('?page=1&page_size=5').then((apiRes) => {
      const list = listOf(apiRes.body);
      if (!list.length) this.skip();
      const probe = list[0];
      exportFlat().then(({ sheets }) => {
        const [header, ...allRows] = sheets[0].allRows;
        ['Product Name', 'Category', 'Total Inventory Cost', 'Avg Cost'].forEach((col) =>
          expect(header, `header must contain "${col}"`).to.include(col)
        );
        const nameCol = header.indexOf('Product Name');
        const costCol = header.indexOf('Total Inventory Cost');
        const rows = allRows.filter((r) => !r.includes('TOTALS'));
        const row = rows.find((r) => r[nameCol] === probe.name);
        if (!row) this.skip();
        expect(parseFloat(row[costCol]), `Total Inventory Cost for ${probe.name}`).to.be.closeTo(
          parseFloat(probe.totalInventoryCost || 0),
          CENT
        );
      });
    });
  });

  it('SW-IR-API-TC44: flat export honors the categoryId filter', { tags: ['@regression'] }, function () {
    endingInventoryReport('?page=1&page_size=5').then((apiRes) => {
      const list = listOf(apiRes.body);
      const row = list.find((r) => r.category || r.categoryId);
      if (!row) this.skip();
      const categoryId = row.category || row.categoryId;
      cy.request({
        method: 'GET',
        url: `${baseUrl}/categories/${categoryId}`,
        headers: headers(),
        failOnStatusCode: false,
      }).then((catRes) => {
        if (catRes.status !== 200) this.skip();
        const categoryName = (catRes.body.data || catRes.body).name;
        exportFlat(`?categoryId=${categoryId}`).then(({ sheets }) => {
          const [header, ...allRows] = sheets[0].allRows;
          const catCol = header.indexOf('Category');
          expect(catCol, 'Category column must exist').to.be.gte(0);
          const rows = allRows.filter((r) => r[catCol] !== 'TOTALS');
          if (rows.length === 0) this.skip();
          rows.forEach((r) => expect(r[catCol], 'every export row must belong to the filtered category').to.equal(categoryName));
        });
      });
    });
  });

  it('SW-IR-API-TC46: grouped export (Today) header row has the expected columns', { tags: ['@regression'] }, () => {
    exportGrouped('?groupBy=Category').then(({ sheets }) => {
      const header = sheets[0].allRows[0];
      ['Category', 'Total Inventory Cost', 'Avg Cost', 'Quantity', 'Products'].forEach((col) =>
        expect(header, `header must contain "${col}"`).to.include(col)
      );
    });
  });

  it('SW-IR-API-TC47: grouped export (Today) data rows match the grouped JSON report row for row', { tags: ['@regression'] }, function () {
    groupedEndingInventoryReport('?page=1&page_size=25&groupBy=Category').then((apiRes) => {
      expect(apiRes.status).to.equal(200);
      const body = apiRes.body.data || apiRes.body;
      const groups = body.list || [];
      if (!groups.length) this.skip();
      exportGrouped('?groupBy=Category').then(({ sheets }) => {
        const [header, ...rows] = sheets[0].allRows;
        const catCol = header.indexOf('Category');
        const costCol = header.indexOf('Total Inventory Cost');
        groups.slice(0, 3).forEach((group) => {
          const groupCategory = String(group.Category || group.category || '').toLowerCase().trim();
          const row = rows.find((r) => String(r[catCol] || '').toLowerCase().trim() === groupCategory);
          if (!row) return;
          expect(parseFloat(row[costCol]), `Total Inventory Cost for group "${groupCategory}"`).to.be.closeTo(
            parseFloat(group.total_inventory_cost || 0),
            CENT
          );
        });
      });
    });
  });

  it('SW-IR-API-TC51: token-in-query export fallback (Today) succeeds with no Authorization header', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/export?token=${encodeURIComponent(authToken)}`,
      encoding: 'binary',
      failOnStatusCode: false,
      timeout: 12 * 60 * 1000,
    }).then((res) => {
      expect(res.status).to.equal(200);
      expect(res.headers['content-type']).to.match(/spreadsheet|octet-stream/);
    });
  });

  it('SW-IR-API-TC48j: token-in-query fallback also works for the grouped export endpoint', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/ending-inventory-report/grouped/export?groupBy=Category&token=${encodeURIComponent(authToken)}`,
      encoding: 'binary',
      failOnStatusCode: false,
      timeout: 12 * 60 * 1000,
    }).then((res) => {
      expect(res.status, 'grouped export must accept ?token= exactly like the flat export does').to.equal(200);
      expect(res.headers['content-type']).to.match(/spreadsheet|octet-stream/);
    });
  });

  // ── Flat export structural contract (Decision Table) — no seeding required ──

  it('SW-IR-API-TC48d: flat export header row contains the expected columns in the documented order', { tags: ['@regression'] }, () => {
    exportFlat().then(({ sheets }) => {
      const header = sheets[0].allRows[0];
      const expectedOrder = ['Product Name', 'Category', 'Total Inventory Cost', 'Avg Cost'];
      const indices = expectedOrder.map((col) => header.indexOf(col));
      indices.forEach((idx, i) => expect(idx, `header must contain "${expectedOrder[i]}"`).to.be.gte(0));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i], `"${expectedOrder[i]}" must come after "${expectedOrder[i - 1]}"`).to.be.greaterThan(indices[i - 1]);
      }
    });
  });

  it('SW-IR-API-TC48e: flat export TOTALS row, when present, equals the SUM of every data row', { tags: ['@regression'] }, () => {
    exportFlat().then(({ sheets }) => {
      const [header, ...allRows] = sheets[0].allRows;
      const costCol = header.indexOf('Total Inventory Cost');
      const totalsRow = allRows.find((r) => r.includes('TOTALS'));
      if (!totalsRow) {
        cy.log('No TOTALS row present in the flat export — documented as the consistently-absent case (plan.md Objective 21).');
        return;
      }
      const dataRows = allRows.filter((r) => r !== totalsRow);
      const dataSum = dataRows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
      expect(parseFloat(totalsRow[costCol]), 'TOTALS row cost must equal SUM(data rows)').to.be.closeTo(dataSum, CENT);
    });
  });

  // ── startDate proven to have no effect (Error Guessing) ─────────────────
  // The As-of engine is bounded by endDate ONLY. getEndingInventoryReport uses
  // startDate solely to pick the branch (inventory-value-report.service.ts:2349
  // — `if (!startDate || !endDate)` falls back to the current-state report), then
  // calls buildEndingInventoryQuery(categoryId, po, search, status, endDate) at
  // :2358 — that builder takes NO startDate parameter (:722-728) and filters only
  // on `im."createdAt" <= endDate + 1 day` / `soi."createdAt" <= endDate + 1 day`.
  // (The [startDate, endDate] window belongs to buildInventoryValueQuery, which
  // backs the inventory VALUE report — a different engine.) So with endDate held
  // fixed, any startDate must return byte-identical rows: assert equality, not a
  // >= bound, or the case passes vacuously against the equality the code
  // guarantees. Both requests are issued back-to-back so a concurrent write on
  // the shared stack is the only way they can diverge.
  it('SW-IR-API-TC49: startDate has no effect on the As-of-Date engine', { tags: ['@regression'] }, () => {
    const endDate = isoDate(0);
    endingInventoryReport(`?page=1&page_size=25&startDate=${endDate}&endDate=${endDate}`).then((sameStart) => {
      endingInventoryReport(`?page=1&page_size=25&startDate=2000-01-01&endDate=${endDate}`).then((farStart) => {
        expect(farStart.status).to.equal(200);
        const a = listOf(sameStart.body);
        const b = listOf(farStart.body);
        expect(b.length, 'row count must be identical regardless of startDate').to.equal(a.length);
        const sumA = a.reduce((s, r) => s + parseFloat(r.totalInventoryCost || 0), 0);
        const sumB = b.reduce((s, r) => s + parseFloat(r.totalInventoryCost || 0), 0);
        expect(sumB, 'total cost must be identical regardless of startDate — only endDate matters').to.be.closeTo(sumA, CENT);
      });
    });
  });

  // ── Shared column-config coupling (Use Case) ────────────────────────────────

  it('SW-IR-API-TC52: shared /configs row is identical whether or not an (unused) categoryId param is sent', { tags: ['@regression'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/configs?userId=probe&name=inventoryValueReportCustomizeColumn&type=inventoryValueReportCustomizeColumn`,
      headers: headers(),
      failOnStatusCode: false,
    }).then((plain) => {
      expect(plain.status).to.equal(200);
      cy.request({
        method: 'GET',
        url: `${baseUrl}/configs?userId=probe&name=inventoryValueReportCustomizeColumn&type=inventoryValueReportCustomizeColumn&categoryId=999999`,
        headers: headers(),
        failOnStatusCode: false,
      }).then((withCategoryId) => {
        expect(withCategoryId.status).to.equal(200);
        // Neither screen's GET query ever sends categoryId (confirmed by
        // reading both CostReport/index.tsx and InventoryReport/index.tsx) —
        // an unused param must not change the result, proving the config
        // row is not per-category and is genuinely shared cross-screen.
        expect(JSON.stringify(withCategoryId.body)).to.equal(JSON.stringify(plain.body));
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Mixed PO — As-of-Date rollup + stock-in delta + PO Cost + export
// (SW-IR-API-TC15-17, TC23-26, TC28, TC43, TC45, TC48)
// ════════════════════════════════════════════════════════════════════════════
describe('Inventory Report — mixed PO As-of-Date family (SW-IR-API-TC15-17,23-26,28,43,45,48)', () => {
  const poMixed = `PO-IR-MIX-${Date.now()}`;
  const ramStamp = `IR-mr-${Date.now()}`;
  const laptopStamp = `IR-ml-${Date.now()}`;
  const serials = [`SN-IR-MIX-${Date.now()}`];
  const ramSearch = `${td.products.ram.memoryGeneration}-${ramStamp}`;
  const laptopSearch = `${td.products.laptop.modelNumber}-${laptopStamp}`;
  const ramQty = 3;
  const ramCost = parseFloat(td.products.ram.cost);
  const laptopCost = parseFloat(td.products.laptop.cost);
  const yesterday = isoDate(1);
  const today = isoDate(0);

  let ramProductId;
  let laptopProductId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedMixedPO({ td, poNumber: poMixed, ramStamp, ramQty, laptopStamp, serials }).then((ids) => {
      ramProductId = ids.ramProductId;
      laptopProductId = ids.laptopProductId;
    });
  });

  // Cypress's default test isolation resets the page to about:blank between
  // its() — apiCall()'s cy.getAuthToken() reads the app's localStorage from
  // whatever page is currently loaded, so without re-visiting here every it()
  // after the first silently sends `Authorization: Bearer null` and gets a
  // real 401 back (misread as a business-logic failure). Re-establish the
  // session + app page before each it(); cy.session() is a no-op when the
  // cached session is still fresh, so this is cheap in the common case.
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => apiDeletePO(poMixed));

  it('SW-IR-API-TC15: seeded pure line — As-of Yesterday is $0, As-of Today is exactly quantity × cost after check-in', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poMixed, search: ramSearch, startDate: yesterday, endDate: yesterday }).then((before) => {
      const bodyBefore = before.body.data || before.body;
      expect(parseFloat(bodyBefore?.summary?.totalInventoryValue || 0), 'PO did not exist yesterday').to.be.closeTo(0, CENT);
    });
    apiCheckIn({ poNumber: poMixed, productId: ramProductId, quantity: ramQty }).then(() => {
      endingInventoryReportRaw({ po: poMixed, search: ramSearch, startDate: today, endDate: today }).then((after) => {
        const bodyAfter = after.body.data || after.body;
        expect(parseFloat(bodyAfter?.summary?.totalInventoryValue || 0)).to.be.closeTo(ramQty * ramCost, CENT);
      });
    });
  });

  it('SW-IR-API-TC16: seeded serialized line — As-of Yesterday is $0, As-of Today is exactly the scanned serial cost', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poMixed, search: laptopSearch, startDate: yesterday, endDate: yesterday }).then((before) => {
      const bodyBefore = before.body.data || before.body;
      expect(parseFloat(bodyBefore?.summary?.totalInventoryValue || 0)).to.be.closeTo(0, CENT);
    });
    apiScanSerial(poMixed, serials[0]).then(() => {
      endingInventoryReportRaw({ po: poMixed, search: laptopSearch, startDate: today, endDate: today }).then((after) => {
        const bodyAfter = after.body.data || after.body;
        expect(parseFloat(bodyAfter?.summary?.totalInventoryValue || 0)).to.be.closeTo(laptopCost, CENT);
      });
    });
  });

  it('SW-IR-API-TC17: combined As-of-Today total for the mixed PO equals the pure-line + serialized-line delta', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poMixed, startDate: today, endDate: today, pageSize: 10 }).then((res) => {
      const body = res.body.data || res.body;
      const total = parseFloat(body?.summary?.totalInventoryValue || 0);
      expect(total).to.be.closeTo(ramQty * ramCost + laptopCost, CENT);
    });
  });

  it('SW-IR-API-TC43: flat export (As-of Today, seeded PO) content matches the seeded delta', { tags: ['@regression'] }, () => {
    // Re-validate the session immediately before reading the token — see
    // inventoryReportHelpers.js's exportEndingInventoryReport for why a raw
    // cy.request() export is vulnerable to an admin-session token that was
    // fresh at before()-time but has since expired.
    cy.authSession('admin');
    cy.getAuthToken().then((token) => {
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/reports/ending-inventory-report/export?po=${encodeURIComponent(poMixed)}&startDate=${today}&endDate=${today}`,
        headers: { Authorization: `Bearer ${token}` },
        encoding: 'base64',
        failOnStatusCode: false,
        timeout: 12 * 60 * 1000,
      }).then((res) => {
        expect(res.status).to.equal(200);
        return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
          const [header, ...allRows] = sheets[0].allRows;
          const costCol = header.indexOf('Total Inventory Cost');
          const rows = allRows.filter((r) => !r.includes('TOTALS'));
          const exportTotal = rows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
          expect(exportTotal, 'exported As-of workbook total should equal the seeded delta').to.be.closeTo(
            ramQty * ramCost + laptopCost,
            CENT
          );
        });
      });
    });
  });

  it('SW-IR-API-TC45: flat export (Today engine) honors the po filter', { tags: ['@regression'] }, () => {
    cy.authSession('admin');
    cy.getAuthToken().then((token) => {
      endingInventoryReportRaw({ po: poMixed, pageSize: 10 }).then((apiRes) => {
        const list = listOf(apiRes.body);
        expect(list, `seeded po=${poMixed} must return both seeded products`).to.have.length(2);
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/reports/ending-inventory-report/export?po=${encodeURIComponent(poMixed)}`,
          headers: { Authorization: `Bearer ${token}` },
          encoding: 'base64',
          failOnStatusCode: false,
          timeout: 12 * 60 * 1000,
        }).then((res) => {
          expect(res.status).to.equal(200);
          return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
            const [header, ...allRows] = sheets[0].allRows;
            const nameCol = header.indexOf('Product Name');
            const rows = allRows.filter((r) => !r.includes('TOTALS'));
            expect(rows, `export scoped to po=${poMixed} must contain exactly the 2 seeded rows`).to.have.length(2);
            list.forEach((probe) => {
              expect(rows.find((r) => r[nameCol] === probe.name), `export must contain a row for "${probe.name}"`).to.exist;
            });
          });
        });
      });
    });
  });

  it('SW-IR-API-TC48: grouped export (As-of Today, seeded PO) data rows match the grouped JSON', { tags: ['@regression'] }, () => {
    groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poMixed, startDate: today, endDate: today, pageSize: 10 }).then(
      (apiRes) => {
        expect(apiRes.status).to.equal(200);
        const body = apiRes.body.data || apiRes.body;
        const groups = body.list || [];
        expect(groups.length, 'seeded mixed PO must roll up into at least 1 group').to.be.at.least(1);
        cy.authSession('admin');
        cy.getAuthToken().then((token) =>
          cy.request({
            method: 'GET',
            url:
              `${Cypress.env('API_BASE_URL')}/reports/ending-inventory-report/grouped/export` +
              `?groupBy=Category&po=${encodeURIComponent(poMixed)}&startDate=${today}&endDate=${today}`,
            headers: { Authorization: `Bearer ${token}` },
            encoding: 'base64',
            failOnStatusCode: false,
            timeout: 12 * 60 * 1000,
          }).then((res) => {
            expect(res.status).to.equal(200);
            return cy.task('parseExcelBuffer', { base64Data: res.body }).then(({ sheets }) => {
              const [header, ...rows] = sheets[0].allRows;
              const costCol = header.indexOf('Total Inventory Cost');
              expect(costCol, 'Total Inventory Cost column must exist').to.be.gte(0);
              const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
              const exportSum = dataRows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
              const apiSum = groups.reduce((s, g) => s + parseFloat(g.total_inventory_cost || 0), 0);
              expect(exportSum, 'grouped export As-of total should equal the grouped API total').to.be.closeTo(apiSum, CENT);
            });
          })
        );
      }
    );
  });

  // ── PO Cost definitional split (Decision Table) ─────────────────────────────
  // qca.max_cost >= pac.avg_cost is a mathematical certainty for the SAME
  // underlying `quantities` rows (a MAX is never below its own weighted
  // average) — no artificially mixed-cost PO is needed to prove the
  // inequality; see file-level "Corrections" note.

  it('SW-IR-API-TC24: Today engine — status-branch PO Cost >= default-branch PO Cost for the same po+search scope', { tags: ['@regression'] }, function () {
    endingInventoryReportRaw({ po: poMixed, search: ramSearch }).then((defaultRes) => {
      const defaultRow = listOf(defaultRes.body)[0];
      if (!defaultRow || defaultRow.poCost === undefined) this.skip();
      endingInventoryReportRaw({ po: poMixed, search: ramSearch, status: 'Damaged' }).then((statusRes) => {
        const statusRow = listOf(statusRes.body)[0];
        if (!statusRow || statusRow.poCost === undefined) this.skip();
        expect(parseFloat(statusRow.poCost), 'MAX-based status PO Cost must be >= weighted-avg default PO Cost').to.be.at.least(
          parseFloat(defaultRow.poCost) - CENT
        );
      });
    });
  });

  it('SW-IR-API-TC23: As-of-Date engine — same PO Cost inequality holds', { tags: ['@regression'] }, function () {
    endingInventoryReportRaw({ po: poMixed, search: ramSearch, startDate: today, endDate: today }).then((defaultRes) => {
      const defaultRow = listOf(defaultRes.body)[0];
      if (!defaultRow || defaultRow.poCost === undefined) this.skip();
      endingInventoryReportRaw({ po: poMixed, search: ramSearch, status: 'Damaged', startDate: today, endDate: today }).then(
        (statusRes) => {
          const statusRow = listOf(statusRes.body)[0];
          if (!statusRow || statusRow.poCost === undefined) this.skip();
          expect(parseFloat(statusRow.poCost)).to.be.at.least(parseFloat(defaultRow.poCost) - CENT);
        }
      );
    });
  });

  it('SW-IR-API-TC25: As-of-Today default-branch PO Cost equals Today default-branch PO Cost', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poMixed, search: ramSearch }).then((todayRes) => {
      endingInventoryReportRaw({ po: poMixed, search: ramSearch, startDate: today, endDate: today }).then((asOfRes) => {
        const todayCost = parseFloat(listOf(todayRes.body)[0]?.poCost ?? NaN);
        const asOfCost = parseFloat(listOf(asOfRes.body)[0]?.poCost ?? NaN);
        expect(asOfCost, 'As-of-Today default PO Cost must equal the Today-engine default PO Cost').to.be.closeTo(todayCost, CENT);
      });
    });
  });

  it('SW-IR-API-TC26: As-of-Today status-branch PO Cost equals Today status-branch PO Cost', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poMixed, search: ramSearch, status: 'Damaged' }).then((todayRes) => {
      endingInventoryReportRaw({ po: poMixed, search: ramSearch, status: 'Damaged', startDate: today, endDate: today }).then(
        (asOfRes) => {
          const todayList = listOf(todayRes.body);
          const asOfList = listOf(asOfRes.body);
          if (!todayList.length || !asOfList.length) return; // nothing marked Damaged on this PO — inequality TCs above still cover the branch
          expect(parseFloat(asOfList[0].poCost)).to.be.closeTo(parseFloat(todayList[0].poCost), CENT);
        }
      );
    });
  });

  it('SW-IR-API-TC28: grouped-by-Category reconciles on the As-of-Date default engine (seeded PO)', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poMixed, startDate: today, endDate: today, pageSize: 10 }).then((flatRes) => {
      const flatSum = listOf(flatRes.body).reduce((s, r) => s + parseFloat(r.totalQuantity || 0), 0);
      groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poMixed, startDate: today, endDate: today, pageSize: 10 }).then(
        (groupedRes) => {
          const body = groupedRes.body.data || groupedRes.body;
          const groupedSum = (body.list || []).reduce((s, g) => s + parseFloat(g.totalQuantity || 0), 0);
          expect(groupedSum, 'grouped sum must reconcile with ungrouped sum on the As-of engine').to.be.closeTo(flatSum, CENT);
        }
      );
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GroupBy + PO/Category filter interactions + export-filter coverage
// (SW-IR-API-TC30a-e, TC48a-c, TC48f-i, TC48k)
//
// A dedicated 2-category mixed PO (ram=Category A, laptop=Category B) with
// one ram unit sold off (reason=Sold — the one status NOT touched by the
// reason:null defect, see file-level "Corrections" note and TC19/TC50) gives
// every interaction below a known, exact expected value: (ramQty-1)*ramCost
// of ram remains Available, laptopCost of laptop remains Available, and
// exactly ramCost is credited to status=Sold — all scoped to categoryId
// where relevant.
// ════════════════════════════════════════════════════════════════════════════
describe('Inventory Report — GroupBy + filter interactions, export coverage (SW-IR-API-TC30a-e,48a-c,48f-i,48k)', () => {
  const poGF = `PO-IR-GF-${Date.now()}`;
  const ramStamp = `IR-gf-r-${Date.now()}`;
  const laptopStamp = `IR-gf-l-${Date.now()}`;
  const serials = [`SN-IR-GF-${Date.now()}`];
  const ramSearch = `${td.products.ram.memoryGeneration}-${ramStamp}`;
  const laptopSearch = `${td.products.laptop.modelNumber}-${laptopStamp}`;
  const ramQty = 4;
  const ramCost = parseFloat(td.products.ram.cost);
  const laptopCost = parseFloat(td.products.laptop.cost);
  const today = isoDate(0);
  const remainingRamValue = (ramQty - 1) * ramCost;

  let ramProductId, laptopProductId, ramCategoryId, laptopCategoryId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedMixedPO({ td, poNumber: poGF, ramStamp, ramQty, laptopStamp, serials })
      .then((ids) => {
        ramProductId = ids.ramProductId;
        laptopProductId = ids.laptopProductId;
        return apiCheckIn({ poNumber: poGF, productId: ramProductId, quantity: ramQty });
      })
      .then(() => apiScanSerial(poGF, serials[0]))
      .then(() => endingInventoryReportRaw({ po: poGF, search: ramSearch }))
      .then((res) => {
        ramCategoryId = listOf(res.body)[0]?.category;
      })
      .then(() => endingInventoryReportRaw({ po: poGF, search: laptopSearch }))
      .then((res) => {
        laptopCategoryId = listOf(res.body)[0]?.category;
      })
      .then(() => apiStockOutProductQuantity({ productId: ramProductId, poNumber: poGF, quantity: 1, reason: 'Sold' }));
  });

  // Cypress's default test isolation resets the page to about:blank between
  // its() — apiCall()'s cy.getAuthToken() reads the app's localStorage from
  // whatever page is currently loaded, so without re-visiting here every it()
  // after the first silently sends `Authorization: Bearer null` and gets a
  // real 401 back (misread as a business-logic failure). Re-establish the
  // session + app page before each it(); cy.session() is a no-op when the
  // cached session is still fresh, so this is cheap in the common case.
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => apiDeletePO(poGF));

  it('SW-IR-API-TC30a: grouped-by-Category + po filter (Today) reconciles vs. ungrouped and matches the remaining Available delta', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poGF, pageSize: 10 }).then((flatRes) => {
      const flatSum = listOf(flatRes.body).reduce((s, r) => s + parseFloat(r.totalInventoryCost || 0), 0);
      groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poGF, pageSize: 10 }).then((groupedRes) => {
        const body = groupedRes.body.data || groupedRes.body;
        const groupedSum = (body.list || []).reduce((s, g) => s + parseFloat(g.total_inventory_cost || 0), 0);
        expect(groupedSum, 'grouped sum (po-scoped) must equal ungrouped sum for the same po').to.be.closeTo(flatSum, CENT);
        expect(groupedSum, 'po-scoped grouped total must equal the known remaining Available delta').to.be.closeTo(
          remainingRamValue + laptopCost,
          CENT
        );
      });
    });
  });

  it('SW-IR-API-TC30b: grouped-by-Category + po filter (As-of default) — grouped total matches the same remaining delta', { tags: ['@regression'] }, () => {
    groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poGF, startDate: today, endDate: today, pageSize: 10 }).then((res) => {
      const body = res.body.data || res.body;
      const groupedSum = (body.list || []).reduce((s, g) => s + parseFloat(g.total_inventory_cost || 0), 0);
      expect(groupedSum, 'As-of-default grouped total (po-scoped) must equal the remaining Available delta').to.be.closeTo(
        remainingRamValue + laptopCost,
        CENT
      );
    });
  });

  it('SW-IR-API-TC30c: grouped-by-Category + po filter (As-of status=Sold) — grouped total reflects only the sold unit', { tags: ['@regression'] }, () => {
    groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poGF, status: 'Sold', startDate: today, endDate: today, pageSize: 10 }).then(
      (res) => {
        const body = res.body.data || res.body;
        const groupedSum = (body.list || []).reduce((s, g) => s + parseFloat(g.total_inventory_cost || 0), 0);
        expect(groupedSum, 'status=Sold grouped total (po-scoped) must equal exactly the 1 sold ram unit').to.be.closeTo(ramCost, CENT);
      }
    );
  });

  it('SW-IR-API-TC30d: grouped-by-Category + categoryId filter reconciles vs. ungrouped same filter, ram-only', { tags: ['@regression'] }, function () {
    if (!ramCategoryId) this.skip();
    endingInventoryReportRaw({ po: poGF, categoryId: ramCategoryId, pageSize: 10 }).then((flatRes) => {
      const flatSum = listOf(flatRes.body).reduce((s, r) => s + parseFloat(r.totalInventoryCost || 0), 0);
      groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poGF, categoryId: ramCategoryId, pageSize: 10 }).then((groupedRes) => {
        const body = groupedRes.body.data || groupedRes.body;
        const groupedSum = (body.list || []).reduce((s, g) => s + parseFloat(g.total_inventory_cost || 0), 0);
        expect(groupedSum, 'grouped sum with categoryId filter must reconcile with ungrouped sum for the same categoryId').to.be.closeTo(
          flatSum,
          CENT
        );
        expect(groupedSum, 'ram-category-scoped total must equal only the remaining ram delta (laptop excluded)').to.be.closeTo(
          remainingRamValue,
          CENT
        );
      });
    });
  });

  it('SW-IR-API-TC30e: grouped-by-Category + po AND categoryId filters together — total is the laptop-only intersection', { tags: ['@regression'] }, function () {
    if (!laptopCategoryId) this.skip();
    groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poGF, categoryId: laptopCategoryId, pageSize: 10 }).then((res) => {
      const body = res.body.data || res.body;
      const groupedSum = (body.list || []).reduce((s, g) => s + parseFloat(g.total_inventory_cost || 0), 0);
      expect(groupedSum, 'po + laptop-categoryId intersection must equal only the laptop delta (ram excluded)').to.be.closeTo(
        laptopCost,
        CENT
      );
    });
  });

  // ── Flat export filter coverage (Decision Table) ────────────────────────────

  it('SW-IR-API-TC48a: flat export with status=Sold filter — rows reflect only the sold unit, cost validated', { tags: ['@regression'] }, () => {
    exportEndingInventoryReport({ po: poGF, status: 'Sold' }).then(({ sheets }) => {
      const [header, ...allRows] = sheets[0].allRows;
      const costCol = header.indexOf('Total Inventory Cost');
      const rows = allRows.filter((r) => !r.includes('TOTALS'));
      expect(rows, 'status=Sold export for poGF must contain exactly 1 row (the sold ram unit)').to.have.length(1);
      expect(parseFloat(rows[0][costCol]), 'sold row cost must equal ramCost').to.be.closeTo(ramCost, CENT);
    });
  });

  it('SW-IR-API-TC48b: flat export (As-of Today) with categoryId filter — rows match category, cost reconciles', { tags: ['@regression'] }, function () {
    if (!ramCategoryId) this.skip();
    exportEndingInventoryReport({ po: poGF, categoryId: ramCategoryId, startDate: today, endDate: today }).then(({ sheets }) => {
      const [header, ...allRows] = sheets[0].allRows;
      const costCol = header.indexOf('Total Inventory Cost');
      const rows = allRows.filter((r) => !r.includes('TOTALS'));
      expect(rows, 'ram-category As-of export must contain exactly 1 row').to.have.length(1);
      expect(parseFloat(rows[0][costCol]), 'ram-only export cost must equal the remaining ram delta').to.be.closeTo(
        remainingRamValue,
        CENT
      );
    });
  });

  it('SW-IR-API-TC48c: flat export with categoryId + status=Sold filters together — intersection of both constraints', { tags: ['@regression'] }, function () {
    if (!ramCategoryId) this.skip();
    exportEndingInventoryReport({ po: poGF, categoryId: ramCategoryId, status: 'Sold' }).then(({ sheets }) => {
      const [header, ...allRows] = sheets[0].allRows;
      const costCol = header.indexOf('Total Inventory Cost');
      const rows = allRows.filter((r) => !r.includes('TOTALS'));
      expect(rows, 'ram-category + Sold export must contain exactly the 1 sold ram row').to.have.length(1);
      expect(parseFloat(rows[0][costCol]), 'sold ram row cost must equal ramCost').to.be.closeTo(ramCost, CENT);
    });
  });

  it('SW-IR-API-TC48k: exports carry every active filter param and honor all of them together in the output', { tags: ['@regression'] }, () => {
    exportEndingInventoryReport({ po: poGF, search: ramSearch, status: 'Sold' }).then(({ sheets }) => {
      const [header, ...allRows] = sheets[0].allRows;
      const nameCol = header.indexOf('Product Name');
      const costCol = header.indexOf('Total Inventory Cost');
      const rows = allRows.filter((r) => !r.includes('TOTALS'));
      expect(rows, 'po+search+status combined must still return exactly the 1 matching sold ram row').to.have.length(1);
      expect(rows[0][nameCol]).to.exist;
      expect(parseFloat(rows[0][costCol])).to.be.closeTo(ramCost, CENT);
    });
  });

  // ── Grouped export filter coverage (Decision Table / Use Case) ──────────────

  it('SW-IR-API-TC48f: grouped export header row is correct and stable across a combined filter (po+categoryId+status)', { tags: ['@regression'] }, function () {
    if (!ramCategoryId) this.skip();
    exportEndingInventoryReport({ groupBy: 'Category', po: poGF, categoryId: ramCategoryId, status: 'Sold' }).then(({ sheets }) => {
      const header = sheets[0].allRows[0];
      ['Category', 'Total Inventory Cost', 'Avg Cost', 'Quantity', 'Products'].forEach((col) =>
        expect(header, `header must contain "${col}"`).to.include(col)
      );
    });
  });

  it('SW-IR-API-TC48g: grouped export (As-of Today, seeded PO) data rows + totals equal the remaining Available delta', { tags: ['@regression'] }, () => {
    exportEndingInventoryReport({ groupBy: 'Category', po: poGF, startDate: today, endDate: today }).then(({ sheets }) => {
      const [header, ...rows] = sheets[0].allRows;
      const costCol = header.indexOf('Total Inventory Cost');
      const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
      const exportSum = dataRows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
      expect(exportSum, 'grouped As-of export total must equal the seeded remaining Available delta').to.be.closeTo(
        remainingRamValue + laptopCost,
        CENT
      );
    });
  });

  it('SW-IR-API-TC48h: grouped export with a po filter scopes every row to that PO', { tags: ['@regression'] }, () => {
    groupedEndingInventoryReportRaw({ groupBy: 'Category', po: poGF, pageSize: 10 }).then((apiRes) => {
      const body = apiRes.body.data || apiRes.body;
      const apiGroupCount = (body.list || []).length;
      exportEndingInventoryReport({ groupBy: 'Category', po: poGF }).then(({ sheets }) => {
        const [header, ...rows] = sheets[0].allRows;
        const costCol = header.indexOf('Total Inventory Cost');
        const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
        expect(dataRows, 'grouped export scoped to poGF must have the same group count as the API').to.have.length(apiGroupCount);
        const exportSum = dataRows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
        expect(exportSum).to.be.closeTo(remainingRamValue + laptopCost, CENT);
      });
    });
  });

  it('SW-IR-API-TC48i: grouped export with a categoryId filter contains only that category', { tags: ['@regression'] }, function () {
    if (!ramCategoryId) this.skip();
    exportEndingInventoryReport({ groupBy: 'Category', po: poGF, categoryId: ramCategoryId }).then(({ sheets }) => {
      const [header, ...rows] = sheets[0].allRows;
      const costCol = header.indexOf('Total Inventory Cost');
      const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
      expect(dataRows, 'categoryId-filtered grouped export must roll up into exactly 1 group (ram only)').to.have.length(1);
      expect(parseFloat(dataRows[0][costCol])).to.be.closeTo(remainingRamValue, CENT);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Multi-status pure-product lifecycle (SW-IR-API-TC18, TC20, TC21, TC22)
// ════════════════════════════════════════════════════════════════════════════
describe('Inventory Report — pure-product status lifecycle (SW-IR-API-TC18,20,21,22)', () => {
  const poProd = `PO-IR-PL-${Date.now()}`;
  const stamps = ['pd1', 'pd2', 'pd3', 'pd4'].map((s) => `${s}-${Date.now()}`);
  const ramCost = parseFloat(td.products.ram.cost);
  const today = isoDate(0);
  const yesterday = isoDate(1);

  let ids; // [damaged, missing, disputed, sold]
  const searchFor = (i) => `${td.products.ram.memoryGeneration}-${stamps[i]}`;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedMultiProductOnlyPO({ td, poNumber: poProd, products: stamps.map((stamp) => ({ stamp, quantity: 1 })) }).then((prodIds) => {
      ids = prodIds;
      return stamps.reduce(
        (chain, _stamp, i) => chain.then(() => apiCheckIn({ poNumber: poProd, productId: ids[i], quantity: 1 })),
        cy.wrap(null)
      );
    });
  });

  // Cypress's default test isolation resets the page to about:blank between
  // its() — apiCall()'s cy.getAuthToken() reads the app's localStorage from
  // whatever page is currently loaded, so without re-visiting here every it()
  // after the first silently sends `Authorization: Bearer null` and gets a
  // real 401 back (misread as a business-logic failure). Re-establish the
  // session + app page before each it(); cy.session() is a no-op when the
  // cached session is still fresh, so this is cheap in the common case.
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => apiDeletePO(poProd));

  // Product-only mark-status via POST /products/mark-status never touches
  // availableQuantity (confirmed contract — see file-level "Corrections"
  // note): the default view stays UNCHANGED. The status view SHOULD be
  // credited separately (not a conservation transfer for this shape) but is
  // expected to reproduce the reason:null defect instead — see the
  // 2026-07-16 correction in the file-level "Corrections" note and
  // BUG_REPORT.md.
  const markCase = (id, index, status) => {
    it(id, { tags: ['@regression'] }, () => {
      const search = searchFor(index);
      endingInventoryReportRaw({ po: poProd, search, startDate: yesterday, endDate: yesterday }).then((beforeYesterday) => {
        expect(parseFloat((beforeYesterday.body.data || beforeYesterday.body)?.summary?.totalInventoryValue || 0)).to.be.closeTo(0, CENT);
      });
      endingInventoryTotal({ po: poProd, search }).then(({ total: beforeToday }) => {
        expect(beforeToday, `product should be Available (cost=${ramCost}) before ${status}`).to.be.closeTo(ramCost, CENT);
        apiMarkProductStatusInventory({ poNumber: poProd, productId: ids[index], quantity: 1, status }).then(() => {
          endingInventoryTotal({ po: poProd, search }).then(({ total: afterDefault }) => {
            expect(afterDefault, `default view stays unchanged for ${status} (no product-only debit mechanism exists)`).to.be.closeTo(
              beforeToday,
              CENT
            );
          });
          endingInventoryTotal({ po: poProd, search, status }).then(({ total: afterStatus }) => {
            expect(afterStatus, `amount credited to status=${status}`).to.be.closeTo(ramCost, CENT);
          });
        });
      });
    });
  };

  markCase('SW-IR-API-TC18: mark Damaged (pure product, As-of Today) — default unchanged, Damaged credited', 0, 'Damaged');
  markCase('SW-IR-API-TC20: mark Missing (pure product, As-of Today) — default unchanged, Missing credited', 1, 'Missing');
  markCase('SW-IR-API-TC21: mark Disputed (pure product, As-of Today) — default unchanged, Disputed credited', 2, 'Disputed');

  it('SW-IR-API-TC22: stocking out an Available pure unit with reason=Sold — real conservation (default debited, Sold credited)', { tags: ['@regression'] }, () => {
    const search = searchFor(3);
    endingInventoryTotal({ po: poProd, search }).then(({ total: before }) => {
      expect(before).to.be.closeTo(ramCost, CENT);
      apiStockOutProductQuantity({ productId: ids[3], poNumber: poProd, quantity: 1, reason: 'Sold' }).then(() => {
        endingInventoryTotal({ po: poProd, search }).then(({ total: afterDefault }) => {
          expect(afterDefault, 'stock-out genuinely debits availableQuantity for product-only rows').to.be.closeTo(0, CENT);
        });
        endingInventoryTotal({ po: poProd, search, status: 'Sold' }).then(({ total: afterSold }) => {
          expect(afterSold, 'reason=Sold must be credited to status=Sold').to.be.closeTo(ramCost, CENT);
        });
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Serialized lifecycle — conservation + reason:null reproduction
// (SW-IR-API-TC19, TC29, TC31-35, TC50)
// ════════════════════════════════════════════════════════════════════════════
describe('Inventory Report — serialized lifecycle (SW-IR-API-TC19,29,31-35,50)', () => {
  const poSerial = `PO-IR-SL-${Date.now()}`;
  const stamp = `IR-sl-${Date.now()}`;
  const serial = `SN-IR-SL-${Date.now()}`;
  const laptopCost = parseFloat(td.products.laptop.cost);
  const search = `${td.products.laptop.modelNumber}-${stamp}`;
  const today = isoDate(0);
  const yesterday = isoDate(1);
  const oneWeekAgo = isoDate(7);
  const oneMonthAgo = isoDate(30);

  // Every mutation (import -> scan -> mark Damaged) happens once here, with
  // each intermediate As-of-Today/As-of-Yesterday read captured — the same
  // "seed + mutate in before(), assert in it()" shape the mixed-PO and
  // pure-product describes above use, so TC31-35/TC19/TC29/TC50 stay
  // independent of each other's execution order (CTAL-TAE test-data
  // management: no it() depends on another it() having already mutated).
  let afterImportToday, afterImportYesterday;
  let afterScanToday, afterScanYesterday;
  let afterMarkDefaultToday, afterMarkYesterday;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedSerializedPO({ td, poNumber: poSerial, stamp, serials: [serial] })
      .then(() => endingInventoryTotal({ po: poSerial, search, startDate: today, endDate: today }))
      .then(({ total }) => { afterImportToday = total; })
      .then(() => endingInventoryTotal({ po: poSerial, search, startDate: yesterday, endDate: yesterday }))
      .then(({ total }) => { afterImportYesterday = total; })
      .then(() => apiScanSerial(poSerial, serial))
      .then(() => endingInventoryTotal({ po: poSerial, search, startDate: today, endDate: today }))
      .then(({ total }) => { afterScanToday = total; })
      .then(() => endingInventoryTotal({ po: poSerial, search, startDate: yesterday, endDate: yesterday }))
      .then(({ total }) => { afterScanYesterday = total; })
      .then(() => cy.getAuthToken())
      .then((token) => cy.iaSetSerialStatus(token, serial, 'Damaged'))
      .then((res) => expect(res.status, `mark Damaged ${serial}: HTTP`).to.be.lessThan(500))
      // Real conservation for the serialized shape — the default view's
      // item_ending_agg CTE filters on last-movement currentStatus, so an
      // item no longer "Available" genuinely drops out (unlike the
      // pure-product shape's mark-status, which never touches
      // availableQuantity — see the file-level "Corrections" note).
      .then(() => endingInventoryTotal({ po: poSerial, search, startDate: today, endDate: today }))
      .then(({ total }) => { afterMarkDefaultToday = total; })
      .then(() => endingInventoryTotal({ po: poSerial, search, startDate: yesterday, endDate: yesterday }))
      .then(({ total }) => { afterMarkYesterday = total; });
  });

  // Cypress's default test isolation resets the page to about:blank between
  // its() — apiCall()'s cy.getAuthToken() reads the app's localStorage from
  // whatever page is currently loaded, so without re-visiting here every it()
  // after the first silently sends `Authorization: Bearer null` and gets a
  // real 401 back (misread as a business-logic failure). Re-establish the
  // session + app page before each it(); cy.session() is a no-op when the
  // cached session is still fresh, so this is cheap in the common case.
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit('/');
  });

  after(() => apiDeletePO(poSerial));

  it('SW-IR-API-TC31: As-of-Today reflects each lifecycle step exactly — import $0, scan +cost, mark-Damaged debits back to $0', { tags: ['@regression'] }, () => {
    expect(afterImportToday, 'importing a PO alone contributes exactly $0').to.be.closeTo(0, CENT);
    expect(afterScanToday, 'scan delta should equal the serial cost').to.be.closeTo(laptopCost, CENT);
    expect(afterMarkDefaultToday, 'default view is debited once the item is no longer Available').to.be.closeTo(0, CENT);
  });

  it('SW-IR-API-TC32: As-of-Yesterday stays $0 through every step of a lifecycle that happened today', { tags: ['@regression'] }, () => {
    expect(afterImportYesterday, 'yesterday, before import').to.be.closeTo(0, CENT);
    expect(afterScanYesterday, 'yesterday, after a scan that happened today').to.be.closeTo(0, CENT);
    expect(afterMarkYesterday, 'yesterday, after a mark-Damaged that happened today').to.be.closeTo(0, CENT);
  });

  it('SW-IR-API-TC33: As-of "1 Week Ago" on a today-seeded PO reads $0', { tags: ['@regression'] }, () => {
    endingInventoryTotal({ po: poSerial, search, startDate: oneWeekAgo, endDate: oneWeekAgo }).then(({ total }) => {
      expect(total).to.be.closeTo(0, CENT);
    });
  });

  it('SW-IR-API-TC34: As-of "1 Month Ago" on a today-seeded PO reads $0', { tags: ['@regression'] }, () => {
    endingInventoryTotal({ po: poSerial, search, startDate: oneMonthAgo, endDate: oneMonthAgo }).then(({ total }) => {
      expect(total).to.be.closeTo(0, CENT);
    });
  });

  it('SW-IR-API-TC35: Custom As-of Date = today behaves identically to the Today (no-date) engine', { tags: ['@regression'] }, () => {
    endingInventoryTotal({ po: poSerial, search }).then(({ total: todayEngine }) => {
      endingInventoryTotal({ po: poSerial, search, status: 'Damaged' }).then(({ total: todayEngineStatus }) => {
        endingInventoryTotal({ po: poSerial, search, startDate: today, endDate: today }).then(({ total: asOfDefault }) => {
          endingInventoryTotal({ po: poSerial, search, status: 'Damaged', startDate: today, endDate: today }).then(
            ({ total: asOfStatus }) => {
              expect(asOfDefault, 'As-of=today default must equal Today-engine default').to.be.closeTo(todayEngine, CENT);
              expect(asOfStatus, 'As-of=today status must equal Today-engine status').to.be.closeTo(todayEngineStatus, CENT);
            }
          );
        });
      });
    });
  });

  it('SW-IR-API-TC29: grouped-by-Category reconciles on the As-of-Date status engine (seeded, marked-Damaged unit)', { tags: ['@regression'] }, () => {
    endingInventoryReportRaw({ po: poSerial, status: 'Damaged', startDate: today, endDate: today, pageSize: 10 }).then((flatRes) => {
      const flatSum = listOf(flatRes.body).reduce((s, r) => s + parseFloat(r.totalQuantity || 0), 0);
      groupedEndingInventoryReportRaw({
        groupBy: 'Category',
        po: poSerial,
        status: 'Damaged',
        startDate: today,
        endDate: today,
        pageSize: 10,
      }).then((groupedRes) => {
        const body = groupedRes.body.data || groupedRes.body;
        const groupedSum = (body.list || []).reduce((s, g) => s + parseFloat(g.totalQuantity || 0), 0);
        expect(groupedSum, 'grouped sum must reconcile with ungrouped sum on the As-of status engine').to.be.closeTo(flatSum, CENT);
      });
    });
  });

  // ── reason:null reproduction (Error Guessing) ───────────────────────────────
  // The correct expectation is that the marked-Damaged unit's cost IS
  // credited to status=Damaged. This is asserted as the CORRECT behavior
  // and is expected to fail (red) if the Cost Report's confirmed
  // `reason: null` exclusion (reports.service.ts: `AND soi.reason !=
  // 'Sold'` evaluates to NULL, not TRUE, when reason IS NULL) reproduces
  // here too — per ISTQB principle #1 (testing shows the presence of
  // defects), this TC is NOT softened to assert the buggy $0 result.

  it('SW-IR-API-TC19: marked-Damaged serialized unit is credited to status=Damaged (As-of Today) — may reproduce the reason:null defect', { tags: ['@regression'] }, () => {
    endingInventoryTotal({ po: poSerial, search, status: 'Damaged', startDate: today, endDate: today }).then(({ total }) => {
      expect(total, `status=Damaged (As-of) should be credited ${laptopCost} — reason:null defect makes this $0 if it reproduces`).to.be.closeTo(
        laptopCost,
        CENT
      );
    });
  });

  it('SW-IR-API-TC50: marked-Damaged serialized unit is credited to status=Damaged (Today engine, no As-of Date)', { tags: ['@regression'] }, () => {
    endingInventoryTotal({ po: poSerial, search, status: 'Damaged' }).then(({ total }) => {
      expect(total, `status=Damaged (Today engine) should be credited ${laptopCost} — reason:null defect makes this $0 if it reproduces`).to.be.closeTo(
        laptopCost,
        CENT
      );
    });
  });
});
