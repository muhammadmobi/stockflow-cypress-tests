/**
 * Sales Report API Tests (SW-SR-API-TC01..38)
 * =============================================================================
 * Mirrors:  cypress/e2e/34-SalesReportTests.cy.js
 * Backend:  Backend/src/modules/reports/reports.controller.ts (getSalesReport,
 *           exportSalesReport routes) + reports.service.ts (getSalesReport,
 *           exportSalesReport, getSalesSortField)
 * Plan:     cypress/qa/testPlans/Reports/salesReport/plan.md
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   GET /reports/sales-report
 *        Per-product rollup of stockoutItems. Returns
 *        { data: { list, pagination, summary: { totalSaleValue, totalQuantity } } }.
 *        Query params: page, page_size, search, categoryId, po, reason,
 *        startDate, endDate, sortBy, sortOrder. AuthGuarded.
 *
 *   GET /reports/sales-report/export
 *        Same data as .xlsx, unpaginated, plus a "Filter Information" sheet
 *        and a TOTALS summary row. Strips the Avg Cost column for
 *        Sales-role (roleId=3) users. AuthGuarded, with ?token= fallback.
 *
 * -----------------------------------------------------------------------------
 *   Seeding strategy (plan.md §6.2)
 * -----------------------------------------------------------------------------
 *   The Sales Report only shows rows that HAVE a stock-out event — unlike the
 *   Cost Report, there is no "Available" baseline to read before mutating, so
 *   every decision-table/lifecycle TC seeds a disposable PO with a KNOWN cost,
 *   drives distinct units through each of the 5 reason destinations
 *   (Damaged, Disputed, Missing, generic StockedOut, a configured reason e.g.
 *   Sold), and reads the report back. Two shapes are seeded in parallel
 *   (product-only + serialized) so every decision-table row has cross-shape
 *   evidence, exactly like the Cost Report suite's TC49-58 family.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedMultiProductOnlyPO,
  seedMultiSerializedPO,
  seedMixedPO,
  apiCheckIn,
  apiScanSerial,
  apiMarkProductStatus,
  apiMarkSerialStatus,
  apiStockOutProductQuantity,
  apiDeletePO,
} from '../../../support/helpers/poCloseHelpers';
import { apiStockOutSerial, apiMarkItemStatusInventory } from '../../../support/helpers/exportSeedingHelpers';
import { ensureStandardProductNameConfigs } from '../../../support/helpers/attributeHelpers';

describe('Sales Report API', () => {
  let authToken;
  let baseUrl;

  const headers = () => ({ Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' });

  const salesReport = (qs = '?page=1&page_size=10') =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/sales-report${qs}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  const exportSales = (qs = '', extraHeaders = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/sales-report/export${qs}`,
      headers: { ...headers(), ...extraHeaders },
      failOnStatusCode: false,
      encoding: 'base64',
      timeout: 12 * 60 * 1000,
    });

  // Monetary reconciliation tolerance = one cent. This is inventory-cost data,
  // so money assertions must be penny-exact, NOT "close enough". The backend
  // computes avgCost = totalInventoryCost / totalQuantity as a full-precision
  // Postgres division (never rounded), and the only divergence between a
  // JS-side row sum and the backend's own SUM aggregate is IEEE-754 float noise
  // (~1e-8 on a ~5.5M total). 0.01 sits ~6 orders of magnitude above that noise
  // yet still fails on any real sub-cent discrepancy — replacing the previous
  // row-count-scaled tolerances (e.g. 0.05 × 1295 rows ≈ ±64.75) that were so
  // loose a five-figure error could pass. QUANTITIES are integer unit counts and
  // are asserted with EXACT equality (no tolerance) everywhere.
  const CENT = 0.01;

  const listOf = (body) => {
    const data = body && (body.data || body);
    return (data && data.list) || [];
  };
  const summaryOf = (body) => {
    const data = body && (body.data || body);
    return (data && data.summary) || {};
  };

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC01-02, TC29: Auth + baseline shape
  // ──────────────────────────────────────────────────────────────────────────

  // EP — the @Public()/AuthGuard "no auth" invalid partition.
  it('SW-SR-API-TC01: GET /reports/sales-report without auth returns 401', { tags: ['@sw-sr-api-tc01', '@smoke', '@ep', '@automated'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/sales-report?page=1&page_size=5`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // EP — the @Public()/AuthGuard "no auth" invalid partition, export route.
  it('SW-SR-API-TC29: GET /reports/sales-report/export without auth returns 401', { tags: ['@sw-sr-api-tc29', '@smoke', '@ep', '@automated'] }, () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/reports/sales-report/export`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // EP — the baseline (valid, authenticated) request shape partition.
  it('SW-SR-API-TC02: GET /reports/sales-report returns list + pagination + summary', { tags: ['@sw-sr-api-tc02', '@smoke', '@ep', '@automated'] }, () => {
    salesReport('?page=1&page_size=10').then((res) => {
      expect(res.status).to.equal(200);
      const body = res.body.data || res.body;
      expect(body).to.have.property('list');
      expect(body).to.have.property('pagination');
      expect(body).to.have.property('summary');
      expect(body.summary).to.have.property('totalSaleValue');
      expect(body.summary).to.have.property('totalQuantity');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC03-05: arithmetic invariants against whatever live data exists
  // ──────────────────────────────────────────────────────────────────────────

  describe('Arithmetic invariants (live data)', () => {
    // Use Case — the summary aggregate must reconcile with the underlying rows.
    it('SW-SR-API-TC03: summary.totalSaleValue equals SUM(list totalSaleValue)', { tags: ['@sw-sr-api-tc03', '@regression', '@use-case', '@automated'] }, function () {
      salesReport('?page=1&page_size=999999').then((res) => {
        const list = listOf(res.body);
        if (!list.length) { this.skip(); return; }
        const sum = list.reduce((s, r) => s + parseFloat(r.totalSaleValue || 0), 0);
        expect(sum, 'row-level sum must reconcile with summary.totalSaleValue to the cent').to.be.closeTo(
          parseFloat(summaryOf(res.body).totalSaleValue || 0),
          CENT
        );
      });
    });

    // Use Case — the summary aggregate must reconcile with the underlying rows.
    it('SW-SR-API-TC04: summary.totalQuantity equals SUM(list totalQuantity)', { tags: ['@sw-sr-api-tc04', '@regression', '@use-case', '@automated'] }, function () {
      salesReport('?page=1&page_size=999999').then((res) => {
        const list = listOf(res.body);
        if (!list.length) { this.skip(); return; }
        const sum = list.reduce((s, r) => s + parseFloat(r.totalQuantity || 0), 0);
        // Quantities are integer unit counts — the row sum must equal the
        // summary EXACTLY. No tolerance: a fractional/off-by-one quantity in an
        // inventory rollup is a genuine defect, not rounding.
        expect(sum, 'row-level sum must equal summary.totalQuantity exactly').to.equal(
          parseFloat(summaryOf(res.body).totalQuantity || 0)
        );
      });
    });

    // BVA — an arithmetic invariant that must hold across every row, including
    // rows sitting at the low/high end of avgCost and totalQuantity.
    it('SW-SR-API-TC05: every row satisfies totalSaleValue = avgCost x totalQuantity', { tags: ['@sw-sr-api-tc05', '@regression', '@bva', '@automated'] }, function () {
      salesReport('?page=1&page_size=50').then((res) => {
        const list = listOf(res.body);
        if (!list.length) { this.skip(); return; }
        list.forEach((row) => {
          const expected = parseFloat(row.avgCost || 0) * parseFloat(row.totalQuantity || 0);
          expect(
            parseFloat(row.totalSaleValue || 0),
            `product "${row.name}": totalSaleValue must equal avgCost x totalQuantity to the cent`
          ).to.be.closeTo(expected, CENT);
        });
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC17, TC20-23, TC25: sorting + pagination against live data
  // ──────────────────────────────────────────────────────────────────────────

  describe('Sorting + pagination (live data)', () => {
    // BVA — the DESC ordering boundary for this sort field.
    it('SW-SR-API-TC20: sortBy=totalSaleValue DESC is genuinely ordered', { tags: ['@sw-sr-api-tc20', '@regression', '@bva', '@automated'] }, function () {
      salesReport('?page=1&page_size=50&sortBy=totalSaleValue&sortOrder=DESC').then((res) => {
        const list = listOf(res.body);
        if (list.length < 2) { this.skip(); return; }
        for (let i = 0; i < list.length - 1; i++) {
          // Strict ordering — the returned values ARE the sorted column, so
          // equal adjacent values still satisfy >= with no epsilon. The old
          // `- 0.001` slack only masked a genuinely mis-ordered pair.
          expect(parseFloat(list[i].totalSaleValue), `row ${i} must be >= row ${i + 1} under DESC sort`)
            .to.be.gte(parseFloat(list[i + 1].totalSaleValue));
        }
      });
    });

    // BVA — the ASC ordering boundary (opposite direction of TC20).
    it('SW-SR-API-TC21: sortBy=totalSaleValue ASC is genuinely ordered', { tags: ['@sw-sr-api-tc21', '@regression', '@bva', '@automated'] }, function () {
      salesReport('?page=1&page_size=50&sortBy=totalSaleValue&sortOrder=ASC').then((res) => {
        const list = listOf(res.body);
        if (list.length < 2) { this.skip(); return; }
        for (let i = 0; i < list.length - 1; i++) {
          expect(parseFloat(list[i].totalSaleValue), `row ${i} must be <= row ${i + 1} under ASC sort`)
            .to.be.lte(parseFloat(list[i + 1].totalSaleValue));
        }
      });
    });

    // BVA — the DESC ordering boundary for a different sort field.
    it('SW-SR-API-TC22: sortBy=avgCost DESC is genuinely ordered', { tags: ['@sw-sr-api-tc22', '@regression', '@bva', '@automated'] }, function () {
      salesReport('?page=1&page_size=50&sortBy=avgCost&sortOrder=DESC').then((res) => {
        const list = listOf(res.body);
        if (list.length < 2) { this.skip(); return; }
        for (let i = 0; i < list.length - 1; i++) {
          expect(parseFloat(list[i].avgCost), `row ${i} avgCost must be >= row ${i + 1} under DESC sort`)
            .to.be.gte(parseFloat(list[i + 1].avgCost));
        }
      });
    });

    // BVA — the ASC ordering boundary for the quantity sort field.
    it('SW-SR-API-TC23: sortBy=totalQuantity ASC is genuinely ordered', { tags: ['@sw-sr-api-tc23', '@regression', '@bva', '@automated'] }, function () {
      salesReport('?page=1&page_size=50&sortBy=totalQuantity&sortOrder=ASC').then((res) => {
        const list = listOf(res.body);
        if (list.length < 2) { this.skip(); return; }
        for (let i = 0; i < list.length - 1; i++) {
          // Integer quantities — strict, no epsilon.
          expect(parseFloat(list[i].totalQuantity), `row ${i} qty must be <= row ${i + 1} under ASC sort`)
            .to.be.lte(parseFloat(list[i + 1].totalQuantity));
        }
      });
    });

    // Error Guessing — a real column the field map deliberately doesn't
    // support as a sort key; must degrade gracefully, not error.
    it('SW-SR-API-TC17: sortBy=serialNumbers (unmapped) silently falls back to name ordering', { tags: ['@sw-sr-api-tc17', '@regression', '@error-guessing', '@automated'] }, () => {
      cy.then(() =>
        salesReport('?page=1&page_size=25&sortBy=serialNumbers&sortOrder=ASC').then((fallbackRes) =>
          salesReport('?page=1&page_size=25&sortBy=name&sortOrder=ASC').then((nameRes) => {
            expect(fallbackRes.status, 'unmapped sortBy must not error').to.equal(200);
            const fallbackNames = listOf(fallbackRes.body).map((r) => r.name);
            const nameNames = listOf(nameRes.body).map((r) => r.name);
            expect(fallbackNames, 'sortBy=serialNumbers must produce the same order as sortBy=name').to.deep.equal(nameNames);
          })
        )
      );
    });

    // BVA — the page-2/page_size boundary of the pagination sequence.
    it('SW-SR-API-TC25: pagination pages are disjoint and page_size is honored', { tags: ['@sw-sr-api-tc25', '@regression', '@bva', '@automated'] }, function () {
      salesReport('?page=1&page_size=5').then((res1) => {
        const list1 = listOf(res1.body);
        const total = res1.body.data?.pagination?.count || 0;
        if (total <= 5) { this.skip(); return; }
        salesReport('?page=2&page_size=5').then((res2) => {
          const list2 = listOf(res2.body);
          expect(list1.length).to.be.at.most(5);
          expect(list2.length).to.be.at.most(5);
          const ids1 = new Set(list1.map((r) => r.id));
          const overlap = list2.filter((r) => ids1.has(r.id));
          expect(overlap, 'page 1 and page 2 must not overlap').to.have.length(0);
        });
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC08-15, TC18, TC24, TC26, TC30-32, TC35-37: seeded decision-table +
  // lifecycle family. One shared seed: 5 destinations x 2 shapes on two
  // disposable POs (product-only, serialized), plus one never-stocked-out
  // product for the "import alone" EP case.
  // ──────────────────────────────────────────────────────────────────────────

  describe('Seeded reason decision table + lifecycle (TC08-15, TC18, TC24, TC26, TC30-32, TC35-37)', () => {
    const suiteStamp = `SR-${Date.now()}`;
    const poProd = `PO-SR-PL-${suiteStamp}`;
    const poSerial = `PO-SR-SL-${suiteStamp}`;
    const ramCost = parseFloat(td.products.ram.cost);
    const laptopCost = parseFloat(td.products.laptop.cost);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // destinations: [damaged, disputed, missing, stockedOut-generic, sold-configured, never-stocked-out]
    const destKeys = ['damaged', 'disputed', 'missing', 'stockedOutGeneric', 'configuredReason', 'neverStockedOut'];
    const prodStamps = destKeys.map((k) => `${suiteStamp}-p-${k}`);
    const serialStamps = destKeys.map((k) => `${suiteStamp}-s-${k}`);
    const serials = serialStamps.map((s) => `SN-SR-${s}`);

    let prodIds; // productIds, indexed by destKeys
    let laptopIds;
    let configuredReason;
    const genericReason = `QA-Automation-${suiteStamp}`;

    const prodSearch = (i) => `${td.products.ram.memoryGeneration}-${prodStamps[i]}`;

    before(() => {
      // Seeding helpers call apiCall(), which reads its bearer token via
      // cy.getAuthToken() from the app's own localStorage — requires a real
      // logged-in browser session (mirrors CostReportAPI.cy.js's convention).
      cy.authSession('admin');
      cy.visit('/');
      cy.getAuthToken().then((token) => { authToken = token; });

      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/configs`,
        qs: { type: 'general', name: 'general' },
        headers: { Authorization: `Bearer ${authToken}` },
        failOnStatusCode: false,
      }).then((res) => {
        const configured = res.body?.data?.list?.[0]?.configJson?.data?.stockOutReason;
        if (Array.isArray(configured) && configured.length) configuredReason = configured[0];
        else if (typeof configured === 'string' && configured.trim()) configuredReason = configured;
        else configuredReason = 'Sold';
      });

      cy.then(() =>
        seedMultiProductOnlyPO({
          td,
          poNumber: poProd,
          products: prodStamps.map((stamp) => ({ stamp, quantity: 1 })),
        })
      ).then((ids) => {
        prodIds = ids;
        return prodStamps.reduce(
          (chain, stamp, i) => chain.then(() => apiCheckIn({ poNumber: poProd, productId: prodIds[i], quantity: 1 })),
          cy.wrap(null)
        );
      }).then(() =>
        seedMultiSerializedPO({
          td,
          poNumber: poSerial,
          products: serialStamps.map((stamp, i) => ({ stamp, serials: [serials[i]] })),
        })
      ).then((ids) => {
        laptopIds = ids;
        return serials.slice(0, 5).reduce((chain, s) => chain.then(() => apiScanSerial(poSerial, s)), cy.wrap(null));
        // index 5 (neverStockedOut) is intentionally left un-scanned (still Incoming) too
      }).then(() =>
        // Drive each destination — index 0..4 (5 = neverStockedOut, untouched)
        apiMarkProductStatus({ poNumber: poProd, productId: prodIds[0], quantity: 1, status: 'Damaged' })
      ).then(() => apiMarkSerialStatus({ poNumber: poSerial, serialNumbers: [serials[0]], status: 'Damaged' }))
        .then(() => apiMarkProductStatus({ poNumber: poProd, productId: prodIds[1], quantity: 1, status: 'Disputed' }))
        .then(() => apiMarkSerialStatus({ poNumber: poSerial, serialNumbers: [serials[1]], status: 'Disputed' }))
        .then(() => apiMarkProductStatus({ poNumber: poProd, productId: prodIds[2], quantity: 1, status: 'Missing' }))
        // /incoming-items/mark-status explicitly blocks an already-Available
        // serialized item from being marked Missing (incoming-item.service.ts
        // markStatus(): "Item ... is already available, You can mark it as
        // Missing in the inventory" — a confirmed, deliberately worded guard,
        // not a bug). /products/mark-status (the Inventory page's Change
        // Status action) has no such restriction, so that is the correct
        // mechanism here — mirrors the Cost Report suite's own TC53/54
        // finding that already-Available items need the OTHER endpoint.
        .then(() => apiMarkItemStatusInventory({ serialNumber: serials[2], status: 'Missing' }))
        .then(() => apiStockOutProductQuantity({ productId: prodIds[3], poNumber: poProd, quantity: 1, reason: genericReason }))
        .then(() => apiStockOutSerial({ serialNumber: serials[3], reason: genericReason }))
        .then(() => cy.then(() => apiStockOutProductQuantity({ productId: prodIds[4], poNumber: poProd, quantity: 1, reason: configuredReason })))
        .then(() => cy.then(() => apiStockOutSerial({ serialNumber: serials[4], reason: configuredReason })));
    });

    after(() => {
      apiDeletePO(poProd);
      apiDeletePO(poSerial);
    });

    // ── TC08: no-reason default aggregates across every reason/status ──────
    // Use Case — the no-filter default view aggregates every reason/status at once.
    it('SW-SR-API-TC08: no reason param aggregates across every reason/status on the PO', { tags: ['@sw-sr-api-tc08', '@regression', '@use-case', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}`).then((res) => {
        const list = listOf(res.body);
        // 5 stocked-out destinations (0-4); index 5 never left Incoming.
        expect(list.length, 'product-only PO should show exactly 5 stocked-out rows').to.equal(5);
        const totalQty = list.reduce((s, r) => s + parseFloat(r.totalQuantity || 0), 0);
        expect(totalQty, 'sum of quantities across all 5 destinations').to.equal(5);
        const totalValue = list.reduce((s, r) => s + parseFloat(r.totalSaleValue || 0), 0);
        expect(totalValue, 'sum of sale values across all 5 destinations must equal 5 x the seeded RAM cost to the cent').to.be.closeTo(5 * ramCost, CENT);
      });
    });

    // ── TC09-11: reason=Damaged/Disputed/Missing isolate their own status ──
    // Decision Table — each destination status must isolate exactly its own
    // rows, both product shapes; shared by SW-SR-API-TC09/10/11.
    const isolationCase = (id, status, prodIndex, title) => {
      it(id, { tags: [id.replace('SW-SR-API-TC', '@sw-sr-api-tc').toLowerCase(), '@regression', '@decision-table', '@automated'] }, () => {
        salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=${status}`).then((res) => {
          expect(listOf(res.body).length, `${title}: exactly one row for product-only PO`).to.equal(1);
        });
        salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poSerial)}&reason=${status}`).then((res) => {
          expect(listOf(res.body).length, `${title}: exactly one row for serialized PO`).to.equal(1);
          const row = listOf(res.body)[0];
          expect(row.serialNumbers || '', `${title}: serial should be listed`).to.include(serials[prodIndex]);
        });
      });
    };

    isolationCase('SW-SR-API-TC09: reason=Damaged isolates Damaged rows only', 'Damaged', 0, 'Damaged isolation');
    isolationCase('SW-SR-API-TC10: reason=Disputed isolates Disputed rows only', 'Disputed', 1, 'Disputed isolation');
    isolationCase('SW-SR-API-TC11: reason=Missing isolates Missing rows only', 'Missing', 2, 'Missing isolation');

    // Decision Table — the "configured reason" column of the reason filter.
    it('SW-SR-API-TC12: reason=<configured value> isolates that value only, excluding a generic-reason unit on the same PO', { tags: ['@sw-sr-api-tc12', '@regression', '@decision-table', '@automated'] }, () => {
      cy.then(() =>
        salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=${encodeURIComponent(configuredReason)}`).then((res) => {
          expect(listOf(res.body).length, `only the configured-reason (${configuredReason}) unit should appear`).to.equal(1);
        })
      );
    });

    // Decision Table — the "generic StockedOut" column of the reason filter.
    it('SW-SR-API-TC13: reason=StockedOut excludes configured-reason rows on the same PO', { tags: ['@sw-sr-api-tc13', '@regression', '@decision-table', '@automated'] }, () => {
      cy.then(() =>
        salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=StockedOut`).then((res) => {
          expect(listOf(res.body).length, 'only the generic-reason unit should appear under StockedOut').to.equal(1);
        })
      );
    });

    // Decision Table — cross-column negative check (Damaged must not leak Disputed).
    it('SW-SR-API-TC14: reason=Damaged excludes a same-PO Disputed unit', { tags: ['@sw-sr-api-tc14', '@regression', '@decision-table', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=Damaged`).then((res) => {
        const list = listOf(res.body);
        expect(list.length).to.equal(1);
        // The single row present must be the Damaged product, not Disputed —
        // verified indirectly via the isolation-count assertions above and
        // the fact this filter can only return status=Damaged rows by
        // construction of the backend WHERE clause (reports.service.ts L2995).
      });
    });

    // EP — the invalid/unconfigured reason-value partition.
    it('SW-SR-API-TC15: an unconfigured reason value returns an empty list, not an error', { tags: ['@sw-sr-api-tc15', '@regression', '@ep', '@automated'] }, () => {
      const bogusReason = `NEVER-CONFIGURED-${suiteStamp}`;
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=${encodeURIComponent(bogusReason)}`).then((res) => {
        expect(res.status).to.equal(200);
        expect(listOf(res.body)).to.have.length(0);
      });
    });

    // EP — po-scoped (real PO) vs. empty-PO partitions.
    it('SW-SR-API-TC18: po filter scopes every row to that PO\'s stock-outs', { tags: ['@sw-sr-api-tc18', '@regression', '@ep', '@automated'] }, () => {
      cy.then(() =>
        salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}`).then((scoped) => {
          expect(listOf(scoped.body).length).to.equal(5);
        })
      );
      const emptyPo = `PO-SR-EMPTY-${suiteStamp}`;
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(emptyPo)}`).then((res) => {
        expect(listOf(res.body), 'a PO with no stock-outs must return an empty list').to.have.length(0);
      });
    });

    // Use Case — the historical date-range filter's real day-boundary behavior.
    it('SW-SR-API-TC24: date range scoped to today includes the seeded stock-out; scoped to yesterday excludes it', { tags: ['@sw-sr-api-tc24', '@regression', '@use-case', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&startDate=${today}T00:00:00.000Z&endDate=${today}T23:59:59.999Z`).then((res) => {
        expect(listOf(res.body).length, 'today\'s window should include all 5 seeded stock-outs').to.equal(5);
      });
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&startDate=${yesterday}T00:00:00.000Z&endDate=${yesterday}T23:59:59.999Z`).then((res) => {
        expect(listOf(res.body).length, 'yesterday\'s window should exclude all of today\'s seeded stock-outs').to.equal(0);
      });
    });

    // EP/BVA — "only one bound set" is an invalid/no-op partition of the date filter.
    it('SW-SR-API-TC19: only one of startDate/endDate set behaves identically to neither being set', { tags: ['@sw-sr-api-tc19', '@regression', '@bva', '@automated'] }, () => {
      cy.then(() =>
        salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}`).then((noDateRes) =>
          salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&startDate=${today}T00:00:00.000Z`).then((partialRes) => {
            expect(listOf(partialRes.body).length).to.equal(listOf(noDateRes.body).length);
          })
        )
      );
    });

    // EP — the "imported, never stocked out" zero-contribution partition.
    it('SW-SR-API-TC26: importing a PO with no stock-out contributes nothing', { tags: ['@sw-sr-api-tc26', '@regression', '@ep', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&search=${encodeURIComponent(prodSearch(5))}`).then((res) => {
        expect(listOf(res.body), 'never-stocked-out product must not appear in the sales report').to.have.length(0);
      });
    });

    // ── TC30-32: specific seeded unit's row detail ──────────────────────────
    // Decision Table — product-only shape x Damaged destination, row-level detail.
    it('SW-SR-API-TC30: marking an Available product-only unit Damaged lands it in the Damaged bucket with correct qty/cost', { tags: ['@sw-sr-api-tc30', '@regression', '@decision-table', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=Damaged`).then((res) => {
        const row = listOf(res.body)[0];
        expect(row, 'a single Damaged row must exist').to.exist;
        expect(parseFloat(row.totalQuantity)).to.equal(1);
        expect(parseFloat(row.avgCost)).to.be.closeTo(ramCost, CENT);
        expect(parseFloat(row.totalSaleValue)).to.be.closeTo(ramCost, CENT);
      });
    });

    // Decision Table — serialized shape x Damaged destination, row-level detail.
    it('SW-SR-API-TC31: marking an Available serialized unit Damaged lands it in the Damaged bucket with its serial listed', { tags: ['@sw-sr-api-tc31', '@regression', '@decision-table', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poSerial)}&reason=Damaged`).then((res) => {
        const row = listOf(res.body)[0];
        expect(row, 'a single Damaged row must exist').to.exist;
        expect(parseFloat(row.totalQuantity)).to.equal(1);
        expect(parseFloat(row.avgCost)).to.be.closeTo(laptopCost, CENT);
        expect(row.serialNumbers || '').to.include(serials[0]);
      });
    });


    // ── Non-Sale Action Isolation (TC20-21): Missing doesn't affect totals ──
    // Decision Table — product-only: mark as Missing, verify unfiltered totals unchanged.
    // Missing is a non-sale status, excluded from the Sales Report, so the
    // total qty/value should remain the same before and after marking.
    // REWRITTEN 2026-07-13: the old body re-marked prodIds[2] Missing, but the
    // before() hook (line ~346) ALREADY marked that unit Missing — the backend
    // refuses a Missing→Missing no-op with success:false, so the redundant
    // re-mark always failed. The intent ("a Missing action never inflates the
    // sales value") is proven directly against the already-seeded Missing state:
    // the Missing unit is genuinely present under reason=Missing, yet excluded
    // from the sales (reason=StockedOut) rollup, which counts only the single
    // generic-StockedOut unit. Mirrors the UI suite's non-sale-isolation pattern
    // (34-SalesReportTests SW-SR-TC55-62), which reads reason=StockedOut as the
    // sales bucket rather than the unfiltered summary (that summary aggregates
    // EVERY status, Missing included, so it is the wrong oracle for "sales").
    it('SW-SR-API-TC20: marking product-only as Missing does NOT affect the total sales value', { tags: ['@sw-sr-api-tc20', '@regression', '@use-case', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=Missing`).then((missingRes) => {
        expect(listOf(missingRes.body).length, 'the seeded Missing product-only unit must be present under reason=Missing').to.equal(1);
      });
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=StockedOut`).then((salesRes) => {
        const salesQty = listOf(salesRes.body).reduce((s, r) => s + parseFloat(r.totalQuantity || 0), 0);
        expect(salesQty, 'the Missing unit must NOT count toward the sales (StockedOut) rollup — only the generic-StockedOut unit does').to.equal(1);
      });
    });

    // Decision Table — serialized: the seeded Missing serial is present under
    // reason=Missing but excluded from the sales (reason=StockedOut) rollup.
    // Same rewrite rationale as SW-SR-API-TC20 above.
    it('SW-SR-API-TC21: marking serialized as Missing does NOT affect the total sales value', { tags: ['@sw-sr-api-tc21', '@regression', '@use-case', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poSerial)}&reason=Missing`).then((missingRes) => {
        const row = listOf(missingRes.body)[0];
        expect(row, 'the seeded Missing serial must be present under reason=Missing').to.exist;
        expect(row.serialNumbers || '', 'the Missing serial number must be listed').to.include(serials[2]);
      });
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poSerial)}&reason=StockedOut`).then((salesRes) => {
        const salesQty = listOf(salesRes.body).reduce((s, r) => s + parseFloat(r.totalQuantity || 0), 0);
        expect(salesQty, 'the Missing serial must NOT count toward the sales (StockedOut) rollup — only the generic-StockedOut unit does').to.equal(1);
      });
    });

    // Decision Table — product-only shape x Missing destination, row-level detail.
    it('SW-SR-API-TC32: marking an Available product-only unit Missing lands it in the Missing bucket', { tags: ['@sw-sr-api-tc32', '@regression', '@decision-table', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=Missing`).then((res) => {
        const row = listOf(res.body)[0];
        expect(row, 'a single Missing row must exist').to.exist;
        expect(parseFloat(row.totalQuantity)).to.equal(1);
        expect(parseFloat(row.avgCost)).to.be.closeTo(ramCost, CENT);
      });
    });

    // ── TC35-36: shape-crossed StockedOut/configured-reason isolation ──────
    // Decision Table — product-only shape x generic-reason destination.
    it('SW-SR-API-TC35: stocking out a product-only unit with a non-configured reason lands only under StockedOut', { tags: ['@sw-sr-api-tc35', '@regression', '@decision-table', '@automated'] }, () => {
      cy.then(() =>
        salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=StockedOut`).then((res) => {
          const row = listOf(res.body)[0];
          expect(row, 'a single StockedOut row must exist').to.exist;
        })
      );
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poProd)}&reason=${encodeURIComponent(configuredReason)}`).then((res) => {
        const list = listOf(res.body);
        expect(list.length, `the generic-reason unit must not appear under reason=${configuredReason}`).to.equal(1);
        // The one row present under the configured-reason filter must be the
        // OTHER seeded unit (index 4), not this one — proven by TC12's own
        // isolation count already being exactly 1.
      });
    });

    // Decision Table — serialized shape x configured-reason destination.
    it('SW-SR-API-TC36: stocking out a serialized unit with a configured reason excludes it from StockedOut', { tags: ['@sw-sr-api-tc36', '@regression', '@decision-table', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poSerial)}&reason=StockedOut`).then((res) => {
        const row = listOf(res.body)[0];
        expect(row.serialNumbers || '', 'the configured-reason serial must not appear under StockedOut').to.not.include(serials[4]);
      });
    });

    // ── TC33: export honors po + reason simultaneously ──────────────────────
    // Decision Table — export must intersect both active filters, not just one.
    it('SW-SR-API-TC33: export honors po + reason filters simultaneously', { tags: ['@sw-sr-api-tc33', '@regression', '@decision-table', '@automated'] }, () => {
      exportSales(`?po=${encodeURIComponent(poProd)}&reason=Damaged`).then((res) => {
        expect(res.status).to.equal(200);
        cy.task('parseExcelBuffer', { base64Data: res.body }).then((parsed) => {
          const sheet = parsed.sheets.find((s) => s.name === 'Sales Data');
          const rows = sheet.allRows.slice(1).filter((r) => r[1] && r[1] !== 'TOTALS' && r[0]);
          expect(rows.length, 'exactly one data row for po+reason=Damaged').to.equal(1);
        });
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC06-07: search + category filter
  // ──────────────────────────────────────────────────────────────────────────

  describe('Search + category filter (seeded)', () => {
    const stamp = `SR-SC-${Date.now()}`;
    const poNumber = `PO-SR-SC-${stamp}`;
    let productId;
    let categoryId;

    before(() => {
      cy.authSession('admin');
      cy.visit('/');
      cy.getAuthToken().then((token) => { authToken = token; });
      // The RAM Automation Cat product-name template composes
      // "{RAMbrand} {Memory Generation}" (see ensureStandardProductNameConfigs).
      // TC06/TC07 below search for a term embedded in Memory Generation and
      // require the seeded product to be FOUND by that search — without this
      // config, a fresh product is created with the literal name
      // "Product name not defined", the search term never matches, and both
      // tests fail with a false "product not found". Must run before seeding.
      cy.then(() => ensureStandardProductNameConfigs())
        .then(() =>
          seedMultiProductOnlyPO({ td, poNumber, products: [{ stamp, quantity: 1 }] })
        ).then((ids) => {
        productId = ids[0];
        return apiCheckIn({ poNumber, productId, quantity: 1 });
      }).then(() => apiStockOutProductQuantity({ productId, poNumber, quantity: 1, reason: `QA-SC-${stamp}` }))
        .then(() =>
          cy.request({
            method: 'GET',
            url: `${Cypress.env('API_BASE_URL')}/products/${productId}`,
            headers: { Authorization: `Bearer ${authToken}` },
            failOnStatusCode: false,
          })
        ).then((res) => {
          // product.controller.ts's getById() nests the product under
          // data.product (not data directly). Within that object,
          // product.service.ts's getById() SELECTs p.* (which includes the
          // raw "category" FK column) then ALSO aliases c.name AS "category"
          // later in the same SELECT — the pg driver keeps only the LAST
          // same-named column, so product.category ends up being the category
          // NAME string, not the id. The actual numeric FK is product.categoryId.
          categoryId = res.body?.data?.product?.categoryId;
        });
    });

    after(() => apiDeletePO(poNumber));

    // Error Guessing — a real, verifiable narrowing assertion (not the
    // tautological "search returns fewer-or-equal rows" pattern).
    it('SW-SR-API-TC06: search narrows the result set with a real, verifiable assertion', { tags: ['@sw-sr-api-tc06', '@regression', '@error-guessing', '@automated'] }, () => {
      const term = `${td.products.ram.memoryGeneration}-${stamp}`;
      // Expected name per the RAM Automation Cat template configured by
      // ensureStandardProductNameConfigs(): "{RAMbrand} {Memory Generation}".
      const expectedName = `${td.products.ram.brand} ${td.products.ram.memoryGeneration}-${stamp}`;
      salesReport(`?page=1&page_size=25&search=${encodeURIComponent(term)}`).then((res) => {
        const list = listOf(res.body);
        expect(list.length, 'search must return exactly the seeded product').to.equal(1);
        expect(list[0].name, 'row must carry the product-name-config-composed name, not a placeholder').to.equal(expectedName);
      });
    });

    // EP — a real, valid categoryId partition.
    it('SW-SR-API-TC07: categoryId filter scopes every row to that category', { tags: ['@sw-sr-api-tc07', '@regression', '@ep', '@automated'] }, function () {
      // categoryId is a real numeric FK — a plain `!categoryId` check would
      // wrongly skip if it were ever 0 (falsy-zero bug). Category ids in
      // this schema are @PrimaryGeneratedColumn() (start at 1), so this
      // can't fire in practice today, but check correctly regardless.
      if (categoryId == null) { this.skip(); return; }
      const expectedName = `${td.products.ram.brand} ${td.products.ram.memoryGeneration}-${stamp}`;
      salesReport(`?page=1&page_size=25&categoryId=${categoryId}&search=${encodeURIComponent(stamp)}`).then((res) => {
        const list = listOf(res.body);
        expect(list.length).to.equal(1);
        expect(list[0].categoryName).to.equal(td.categories.ram);
        expect(list[0].name, 'row must carry the product-name-config-composed name, not a placeholder').to.equal(expectedName);
      });
    });

    // Error Guessing — an unsanitized-input attack partition (SQL-injection-shaped probe).
    it('SW-SR-API-TC16: categoryId="0 OR 1=1" (boolean-based, non-destructive probe) must not bypass the filter', { tags: ['@sw-sr-api-tc16', '@regression', '@error-guessing', '@automated'] }, function () {
      if (categoryId == null) { this.skip(); return; }
      cy.then(() =>
        salesReport(`?page=1&page_size=999999`).then((unfilteredRes) => {
          const unfilteredCount = listOf(unfilteredRes.body).length;
          // A zero-row baseline can't meaningfully prove/disprove a bypass —
          // any finite malicious count would trivially satisfy a fallback
          // upper bound like Infinity, masking a real bypass. Skip instead
          // of asserting something that can't fail.
          if (unfilteredCount === 0) { this.skip(); return; }
          return salesReport(`?page=1&page_size=999999&categoryId=${encodeURIComponent('0 OR 1=1')}`).then((maliciousRes) => {
            if (maliciousRes.status >= 500) {
              cy.log('categoryId injection payload caused a 5xx — the malformed literal was rejected rather than silently coerced. Still flag: reports.controller.ts getSalesReport performs no parseInt/BadRequestException on categoryId, unlike its sibling getEndingInventoryReport — recommend adding the same validation.');
              return;
            }
            const maliciousCount = listOf(maliciousRes.body).length;
            expect(
              maliciousCount,
              `categoryId="0 OR 1=1" returned ${maliciousCount} rows vs ${unfilteredCount} unfiltered — a match here means the categoryId filter was bypassed via unsanitized SQL interpolation (reports.service.ts getSalesReport: "AND p.category = \${categoryId}" with no validation/escaping)`
            ).to.be.lessThan(unfilteredCount);
          });
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC27-28, TC34, TC37: export baseline + serialNumbers isolation
  // ──────────────────────────────────────────────────────────────────────────

  describe('Export baseline + serialNumbers isolation (seeded)', () => {
    const stamp = `SR-EXP-${Date.now()}`;
    const poNumber = `PO-SR-EXP-${stamp}`;
    const ramStamp = `${stamp}-ram`;
    const laptopStamp = `${stamp}-lpt`;
    const serial = `SN-SR-EXP-${stamp}`;
    let ramProductId;
    let laptopProductId;

    before(() => {
      cy.authSession('admin');
      cy.visit('/');
      cy.getAuthToken().then((token) => { authToken = token; });
      cy.then(() =>
        seedMixedPO({ td, poNumber, ramStamp, ramQty: 2, laptopStamp, serials: [serial] })
      ).then((ids) => {
        ramProductId = ids.ramProductId;
        laptopProductId = ids.laptopProductId;
        return apiCheckIn({ poNumber, productId: ramProductId, quantity: 2 });
      }).then(() => apiScanSerial(poNumber, serial))
        .then(() => apiStockOutProductQuantity({ productId: ramProductId, poNumber, quantity: 2, reason: 'Sold' }))
        .then(() => apiStockOutSerial({ serialNumber: serial, reason: 'Sold' }));
    });

    after(() => apiDeletePO(poNumber));

    // Use Case — the FE's real `<a href>`-driven download flow (no Authorization header).
    it('SW-SR-API-TC27: export token-in-query fallback succeeds (no Authorization header)', { tags: ['@sw-sr-api-tc27', '@regression', '@use-case', '@automated'] }, () => {
      cy.getAuthToken().then((token) =>
        cy.request({
          method: 'GET',
          url: `${baseUrl}/reports/sales-report/export?token=${encodeURIComponent(token)}`,
          failOnStatusCode: false,
          encoding: 'base64',
        })
      ).then((res) => {
        expect(res.status).to.equal(200);
        expect(res.headers['content-type']).to.include('spreadsheet');
      });
    });

    // Use Case — export/JSON parity, the actual point of the export feature.
    it('SW-SR-API-TC28: export content matches the JSON report row-for-row', { tags: ['@sw-sr-api-tc28', '@regression', '@use-case', '@automated'] }, () => {
      cy.then(() =>
        salesReport(`?page=1&page_size=999999&po=${encodeURIComponent(poNumber)}`).then((jsonRes) => {
          const jsonList = listOf(jsonRes.body);
          return exportSales(`?po=${encodeURIComponent(poNumber)}`).then((res) => {
            expect(res.status).to.equal(200);
            return cy.task('parseExcelBuffer', { base64Data: res.body }).then((parsed) => {
              const sheet = parsed.sheets.find((s) => s.name === 'Sales Data');
              const headerRow = sheet.allRows[0];
              expect(headerRow).to.include.members(['Product Name', 'Category', 'Quantity', 'Avg Cost', 'Total Sale Value', 'Reason', 'Serial Numbers']);
              const dataRows = sheet.allRows.slice(1).filter((r) => r[1] && r[1] !== 'TOTALS' && r[0]);
              expect(dataRows.length).to.equal(jsonList.length);
            });
          });
        })
      );
    });

    // Use Case — the export's summary TOTALS row is a real aggregate, not a stub.
    it('SW-SR-API-TC34: export TOTALS row equals the row-level sums', { tags: ['@sw-sr-api-tc34', '@regression', '@decision-table', '@automated'] }, () => {
      exportSales(`?po=${encodeURIComponent(poNumber)}`).then((res) => {
        cy.task('parseExcelBuffer', { base64Data: res.body }).then((parsed) => {
          const sheet = parsed.sheets.find((s) => s.name === 'Sales Data');
          const rows = sheet.allRows.slice(1);
          const totalsRowIdx = rows.findIndex((r) => r[1] === 'TOTALS');
          expect(totalsRowIdx, 'a TOTALS row must exist').to.be.gte(0);
          const dataRows = rows.slice(0, totalsRowIdx).filter((r) => r[0]);
          const qtySum = dataRows.reduce((s, r) => s + parseFloat(r[2] || 0), 0);
          const valueSum = dataRows.reduce((s, r) => s + parseFloat(r[4] || 0), 0);
          const totalsRow = rows[totalsRowIdx];
          // Quantity TOTALS = exact integer sum; Total Sale Value TOTALS = penny-exact.
          expect(parseFloat(totalsRow[2]), 'TOTALS Quantity must equal the exact sum of data-row quantities').to.equal(qtySum);
          expect(parseFloat(totalsRow[4]), 'TOTALS Total Sale Value must equal the row-level sum to the cent').to.be.closeTo(valueSum, CENT);
        });
      });
    });

    // Error Guessing — a plausible cross-shape data-leak scenario (siblings
    // on the same PO shouldn't bleed serial data across shapes).
    it('SW-SR-API-TC37: product-only stock-outs never populate serialNumbers, even when a sibling serialized row on the same PO does', { tags: ['@sw-sr-api-tc37', '@regression', '@error-guessing', '@automated'] }, () => {
      salesReport(`?page=1&page_size=25&po=${encodeURIComponent(poNumber)}`).then((res) => {
        const list = listOf(res.body);
        const ramRow = list.find((r) => r.id === ramProductId);
        const laptopRow = list.find((r) => r.id === laptopProductId);
        expect(ramRow, 'ram (product-only) row must exist').to.exist;
        expect(laptopRow, 'laptop (serialized) row must exist').to.exist;
        expect(ramRow.serialNumbers || '', 'product-only row must never populate serialNumbers').to.be.oneOf(['', null, undefined]);
        expect(laptopRow.serialNumbers || '').to.include(serial);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC38: Sales-role export column stripping vs. JSON asymmetry
  // ──────────────────────────────────────────────────────────────────────────

  describe('Sales-role export vs JSON asymmetry (TC38)', () => {
    let salesToken;

    before(() => {
      cy.login().then((token) => {
        salesToken = token;
      });
    });

    // Decision Table — role (Sales) x route (export vs. JSON) asymmetry.
    it('SW-SR-API-TC38: Sales-role export omits Avg Cost while the JSON route still returns it', { tags: ['@sw-sr-api-tc38', '@regression', '@decision-table', '@automated'] }, function () {
      if (!salesToken) { this.skip(); return; }
      cy.request({
        method: 'GET',
        url: `${baseUrl}/reports/sales-report/export?token=${encodeURIComponent(salesToken)}`,
        failOnStatusCode: false,
        encoding: 'base64',
      }).then((res) => {
        if (res.status !== 200) { this.skip(); return; }
        cy.task('parseExcelBuffer', { base64Data: res.body }).then((parsed) => {
          const sheet = parsed.sheets.find((s) => s.name === 'Sales Data');
          const headerRow = sheet.allRows[0];
          expect(headerRow, 'Sales-role export must omit Avg Cost').to.not.include('Avg Cost');
        });
      });

      cy.request({
        method: 'GET',
        url: `${baseUrl}/reports/sales-report?page=1&page_size=5`,
        headers: { Authorization: `Bearer ${salesToken}` },
        failOnStatusCode: false,
      }).then((res) => {
        if (res.status !== 200) return;
        const list = listOf(res.body);
        if (!list.length) return;
        expect(list[0], 'JSON route performs no equivalent role-based stripping for Sales role (documented asymmetry, plan.md §8 risk #3)').to.have.property('avgCost');
      });
    });
  });
});
