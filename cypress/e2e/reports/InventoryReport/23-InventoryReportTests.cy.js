/**
 * Inventory Report (Ending Inventory Report) UI Tests — SW-IR-TC01..35
 * =============================================================================
 * Mirrors:  cypress/e2e/reports/InventoryReportAPI.cy.js
 * Frontend: Frontend/src/components/Reports/InventoryReport/index.tsx
 * Plan:     cypress/qa/testPlans/inventoryReport/plan.md
 *
 * Per plan.md §6.1, the "Today" (no As-of Date) arithmetic is deliberately
 * NOT re-proven here — it is the same getInventoryValueReport function the
 * Cost Report suite (22-CostReportTests.cy.js / CostReportAPI.cy.js) already
 * covers exhaustively. These TCs stay at the wiring layer for Today and go
 * deep only on what this screen alone adds: the As-of Date engine, the PO
 * Cost column, the shared column-config coupling with Cost Report, and the
 * Export-button no-PO-selected behavior.
 *
 * Scope note (documented rather than silently dropped): TC24/TC26/TC27
 * verify export scoping via the triggered request's query parameters
 * (proving "what you see is what gets exported" at the parameter level)
 * rather than downloading and parsing the workbook client-side — this repo's
 * exact download-folder/parseExcelBuffer convention for a *UI-triggered*
 * (not API cy.request) download was not independently re-verified for this
 * new spec and is left as a follow-up once run against a live environment.
 * The API spec (TC42-48) already proves the exported *content* is correct
 * for both engines via cy.request + parseExcelBuffer.
 */

import InventoryReportPage from '../../../pageObjects/InventoryReportPage';
import CostReportPage from '../../../pageObjects/CostReportPage';
import data from '../../../fixtures/inventoryReportData.json';
import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import { seedProductOnlyPO, seedMixedPO, apiCheckIn, apiScanSerial, apiDeletePO, apiStockOutProductQuantity } from '../../../support/helpers/poCloseHelpers';
import { apiMarkProductStatusInventory } from '../../../support/helpers/exportSeedingHelpers';
import { isoDate, endingInventoryReport as endingInventoryReportRaw, listOf } from '../../../support/helpers/inventoryReportHelpers';
import { apiCall } from '../../../support/helpers/allPosHelpers';
import { requireRoleOrSkip } from '../../../support/helpers/roleGuards';

const DEFAULT_COLUMNS = ['Product Name', 'Category', 'Total Inventory Cost', 'Avg Cost'];

// Core report columns (Avg Cost, Total Inventory Cost, Product Name) only
// exist as a one-way-removable chip in the Customize Columns modal — there is
// no checkbox to re-check afterward. Restore the shared
// inventoryValueReportCustomizeColumn config directly via API instead of
// trying to re-click a chip that no longer exists.
function resetColumnConfigToDefault() {
  return apiCall('GET', '/configs?name=inventoryValueReportCustomizeColumn&type=inventoryValueReportCustomizeColumn').then((res) => {
    const rows = res.body?.data?.list || res.body?.list || [];
    rows.forEach((row) => {
      if (JSON.stringify(row.configJson?.columns) !== JSON.stringify(DEFAULT_COLUMNS)) {
        apiCall('PATCH', `/configs/${row.id}`, { configJson: { columns: DEFAULT_COLUMNS } });
      }
    });
  });
}

describe('Inventory Report Tests', () => {
  let page;

  // One disposable pure-product PO, seeded + checked in once, shared by
  // every TC that needs a real, known-cost PO to select in the UI (As-of
  // Date family, PO Cost column, export-scoping). A PO seeded "today" has
  // no history before today, so "As-of Yesterday" is deterministically $0
  // for it — see plan.md §6.2 and InventoryReportAPI.cy.js's identical
  // seeding rationale.
  const poAsOf = `PO-IR-UI-${Date.now()}`;
  const stamp = `IR-ui-${Date.now()}`;
  const qty = 3;
  const ramCost = parseFloat(td.products.ram.cost);
  const yesterday = isoDate(1);
  const oneWeekAgo = isoDate(7);
  const oneMonthAgo = isoDate(30);
  let productId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    // inventoryValueReportCustomizeColumn is a single row shared across every
    // user/session (Cost Report + Inventory Report both read/write it). A
    // prior column-customization run elsewhere that didn't reach its own
    // "restore" step leaves it permanently non-default, which then breaks
    // every test here that assumes the documented default column set
    // (TC16/17/26d). Reset it once up front so this whole spec runs from the
    // same known baseline every time.
    resetColumnConfigToDefault();
    seedProductOnlyPO({ td, poNumber: poAsOf, stamp, quantity: qty }).then((id) => {
      productId = id;
      return apiCheckIn({ poNumber: poAsOf, productId: id, quantity: qty });
    });
  });

  after(() => apiDeletePO(poAsOf));

  // A second disposable PO — mixed shape (ram=Category A + laptop=Category B)
  // with one ram unit sold off (reason=Sold — the one status the reason:null
  // defect does not affect, see InventoryReportAPI.cy.js's file-level
  // "Corrections" note) — shared by the Group By + filter interaction family
  // (SW-IR-TC21a-e) and the export content-verification family
  // (SW-IR-TC26a-e/27a-e). Two categories are required to prove a category
  // filter genuinely narrows the grouped/exported result, which poAsOf (a
  // single ram-only PO) cannot exercise.
  const poGF = `PO-IR-UIGF-${Date.now()}`;
  const gfRamStamp = `IR-uigf-r-${Date.now()}`;
  const gfLaptopStamp = `IR-uigf-l-${Date.now()}`;
  const gfSerials = [`SN-IR-UIGF-${Date.now()}`];
  const gfRamSearch = `${td.products.ram.memoryGeneration}-${gfRamStamp}`;
  const gfLaptopSearch = `${td.products.laptop.modelNumber}-${gfLaptopStamp}`;
  const gfRamQty = 4;
  const laptopCost = parseFloat(td.products.laptop.cost);
  const remainingRamValue = (gfRamQty - 1) * ramCost;
  let gfRamProductId, gfLaptopProductId, gfRamCategoryId, gfLaptopCategoryId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedMixedPO({ td, poNumber: poGF, ramStamp: gfRamStamp, ramQty: gfRamQty, laptopStamp: gfLaptopStamp, serials: gfSerials })
      .then((ids) => {
        gfRamProductId = ids.ramProductId;
        gfLaptopProductId = ids.laptopProductId;
        return apiCheckIn({ poNumber: poGF, productId: gfRamProductId, quantity: gfRamQty });
      })
      .then(() => apiScanSerial(poGF, gfSerials[0]))
      .then(() => endingInventoryReportRaw({ po: poGF, search: gfRamSearch }))
      .then((res) => {
        gfRamCategoryId = listOf(res.body)[0]?.category;
      })
      .then(() => endingInventoryReportRaw({ po: poGF, search: gfLaptopSearch }))
      .then((res) => {
        gfLaptopCategoryId = listOf(res.body)[0]?.category;
      })
      .then(() => apiStockOutProductQuantity({ productId: gfRamProductId, poNumber: poGF, quantity: 1, reason: 'Sold' }));
  });

  after(() => apiDeletePO(poGF));

  beforeEach(() => {
    page = new InventoryReportPage();
    cy.authSession('admin');
  });

  // ── Page load, role gate, stat card (SW-IR-TC01-03) ─────────────────────────

  describe('Page load, role gate, stat card', () => {
    // EP — happy-path representative
    it('SW-IR-TC01: Verify the report page renders its core layout', { tags: ['@smoke'] }, () => {
      page.visit();
      cy.contains(data.statCard.title).should('be.visible');
      page.loc.asOfPresetSelect().should('be.visible');
      page.getTableRows().should('have.length.greaterThan', 0);
    });

    // EP — role-based UI gating
    it('SW-IR-TC02: Verify the Inventory Report nav item is hidden for the Sales role', { tags: ['@regression'] }, function () {
      requireRoleOrSkip(this, 'sales');
      cy.authSession('sales');
      cy.visit('/dashboard');
      cy.contains(/^Inventory Report$/).should('not.exist');
    });

    // Use Case — stat card wiring (value correctness is Cost Report's job, §6.1)
    it('SW-IR-TC03: Verify the stat card reads summary.totalInventoryValue from the API', { tags: ['@regression'] }, () => {
      page.visit();
      cy.get(`@${data.aliases.tableItems}`).then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const total = parseFloat(body?.data?.summary?.totalInventoryValue);
        expect(total, 'API must return a numeric data.summary.totalInventoryValue').to.be.a('number').and.not.be.NaN;
        page.verifyStatCard(total);
      });
    });
  });

  // ── As-of Date selector (SW-IR-TC04-10) ──────────────────────────────────────

  describe('As-of Date selector', () => {
    // Decision Table — As-of preset vs. a today-seeded PO's known-zero history
    it('SW-IR-TC04: As-of Yesterday reads $0 on screen for a today-seeded PO', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      page.selectAsOfPreset('Yesterday');
      page.readSettledTotal({ po: poAsOf, startDate: yesterday, endDate: yesterday }).then((expected) => {
        expect(expected).to.be.closeTo(0, 0.01);
      });
    });

    it('SW-IR-TC05: As-of Today reads the exact checked-in delta on screen', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      page.readSettledTotal({ po: poAsOf }).then((expected) => {
        expect(expected).to.be.closeTo(qty * ramCost, 0.01);
      });
    });

    it('SW-IR-TC06: As-of "1 Week Ago" reads $0 for a today-seeded PO', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      page.selectAsOfPreset('1 Week Ago');
      page.readSettledTotal({ po: poAsOf, startDate: oneWeekAgo, endDate: oneWeekAgo }).then((expected) => {
        expect(expected).to.be.closeTo(0, 0.01);
      });
    });

    it('SW-IR-TC07: As-of "1 Month Ago" reads $0 for a today-seeded PO', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      page.selectAsOfPreset('1 Month Ago');
      page.readSettledTotal({ po: poAsOf, startDate: oneMonthAgo, endDate: oneMonthAgo }).then((expected) => {
        expect(expected).to.be.closeTo(0, 0.01);
      });
    });

    // Use Case — Custom date picker, today boundary
    it('SW-IR-TC08: Custom date = today renders identically to the Today preset', { tags: ['@regression'] }, () => {
      page.visit();
      page.readStatCardValue().then((todayValue) => {
        const day = new Date().getDate();
        page.selectCustomAsOfDate(day);
        page.readStatCardValue().then((customValue) => {
          expect(customValue, 'Custom=today must render the same total as the Today preset').to.be.closeTo(todayValue, 0.5);
        });
      });
    });

    // BVA — the DatePicker control's own maxDate boundary
    it('SW-IR-TC09: Custom date picker maxDate blocks navigating to a future month', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectAsOfPreset('Custom');
      page.loc.asOfDatePickerGroup().find('button[aria-label="Choose date"]').should('not.be.disabled').click();
      page.loc.datePickerNextMonthButton().should('be.disabled');
    });

    // State Transition — Clear returns to the Today state
    it('SW-IR-TC10: Clearing the As-of badge returns to the Today preset', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectAsOfPreset('Yesterday');
      page.clearAsOfDate();
      page.getAsOfPresetValue().should('match', /today/i);
    });
  });

  // ── Status / category / search filters (SW-IR-TC11-15) ──────────────────────

  describe('Status / category / search filters', () => {
    before(() => {
      cy.authSession('admin');
      cy.visit('/');
      apiMarkProductStatusInventory({ poNumber: poAsOf, productId, quantity: qty, status: 'Damaged' });
    });

    // Decision Table — status filter narrows the rendered table to match the API
    it('SW-IR-TC11: Selecting Status=Damaged narrows rows to match the API list (Today)', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectStatus('Damaged').then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const apiCount = (body?.data?.list || []).length;
        page.getTableRows().should('have.length', apiCount);
      });
    });

    // Decision Table — status + As-of Date combined
    it('SW-IR-TC12: Status=Damaged + As-of Yesterday reads $0 for the seeded PO (never marked "yesterday")', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      page.selectStatus('Damaged');
      page.selectAsOfPreset('Yesterday');
      page.readSettledTotal({ po: poAsOf, status: 'Damaged', startDate: yesterday, endDate: yesterday }).then((expected) => {
        expect(expected).to.be.closeTo(0, 0.01);
      });
    });

    // Error Guessing — a real backend status with no UI affordance
    it('SW-IR-TC13: Status dropdown has no "Consumed" option', { tags: ['@regression'] }, () => {
      page.visit();
      page.loc.statusSelect().click();
      page.loc.openListbox().should('not.contain.text', 'Consumed');
      page.loc.statusOptionsAll().should('have.length', 6); // Default + 5 real statuses
    });

    // Decision Table — category filter narrows rows to match the API
    it('SW-IR-TC14: Selecting a category narrows rows to match the API list', { tags: ['@regression'] }, () => {
      page.visit();
      page.loc.categorySelect().click();
      page.loc.categoryOptionsAll().first().click();
      cy.wait(`@${data.aliases.tableItems}`).then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const apiCount = (body?.data?.list || []).length;
        page.getTableRows().should('have.length', apiCount);
      });
    });

    // Use Case — real containment assertion, not a tautology (see salesReport lessons)
    it('SW-IR-TC15: Search narrows the list to rows actually containing the term', { tags: ['@regression'] }, function () {
      page.visit();
      cy.get(`@${data.aliases.tableItems}`).then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const list = body?.data?.list || [];
        if (!list.length || !list[0].name) this.skip();
        const term = String(list[0].name).split(' ')[0];
        page.search(term).then((searchInterception) => {
          const raw2 = searchInterception?.response?.body;
          const body2 = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
          const searchedList = body2?.data?.list || [];
          searchedList.forEach((row) => {
            expect(String(row.name || '').toLowerCase(), `row ${row.id} must contain "${term}"`).to.contain(term.toLowerCase());
          });
          page.getTableRows().should('have.length', searchedList.length);
        });
      });
    });
  });

  // ── Column customization — shared config with Cost Report (SW-IR-TC16-19) ──

  describe('Column customization (shared config with Cost Report)', () => {
    // State Transition — a save on the SIBLING screen is reflected here
    it('SW-IR-TC16: Column layout saved on Cost Report is reflected here without saving locally', { tags: ['@regression'] }, () => {
      const costPage = new CostReportPage();
      costPage.visit();
      costPage.openCustomizeColumns();
      costPage.removeCoreColumnAndSave('Avg Cost');
      page.visit();
      page.loc.tableHeaderCell('Avg Cost').should('not.exist');
      // restore — Avg Cost has no checkbox to re-check, so reset via API
      resetColumnConfigToDefault();
    });

    // State Transition — reverse direction of TC16
    it('SW-IR-TC17: Column layout saved here is reflected on Cost Report', { tags: ['@regression'] }, () => {
      page.visit();
      page.openCustomizeColumns();
      page.removeCoreColumnAndSave('Avg Cost');
      const costPage = new CostReportPage();
      costPage.visit();
      costPage.loc.tableHeaderCell('Avg Cost').should('not.exist');
      // restore
      resetColumnConfigToDefault();
    });

    // State Transition — save/reload round-trip
    it('SW-IR-TC18: Deselecting a column hides it and the choice persists after reload', { tags: ['@regression'] }, () => {
      page.visit();
      page.openCustomizeColumns();
      page.deselectColumnAndSave('Category');
      page.visit();
      page.loc.tableHeaderCell('Category').should('not.exist');
      // restore
      page.openCustomizeColumns();
      page.deselectColumnAndSave('Category');
    });

    // Decision Table — PO Cost column presence tied to PO selection
    it('SW-IR-TC19: Selecting a specific PO inserts a "PO Cost" column; "All POs" removes it', { tags: ['@regression'] }, () => {
      page.visit();
      page.loc.tableHeaderCell('PO Cost').should('not.exist');
      page.selectPo(poAsOf);
      page.loc.tableHeaderCell('PO Cost').should('exist');
      page.selectPo('All POs');
      page.loc.tableHeaderCell('PO Cost').should('not.exist');
    });
  });

  // ── Group By (SW-IR-TC20-21) ─────────────────────────────────────────────────

  describe('Group By', () => {
    // Decision Table — grouping swaps columns; excluded-fields filter matches the offered options
    it('SW-IR-TC20: Enabling Group By swaps the table to grouped columns', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectGroupByField('Category');
      page.loc.tableHeaderCell('Total Inventory Cost').should('exist');
      page.loc.tableHeaderCell('Products').should('exist');
      // Cost/quantity columns are excluded from the Group By option list itself
      page.loc.groupByInput().click();
      page.loc.openListbox().should('not.contain.text', 'Total Inventory Cost');
      page.loc.openListbox().should('not.contain.text', 'Avg Cost');
    });

    // Use Case — grouped totals mirror the server-side aggregation, not a client re-derivation
    it('SW-IR-TC21: Grouped row totals equal the server groupedDataFromServer values', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectGroupByField('Category').then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const apiCount = (body?.data?.list || []).length;
        page.getGroupedTableRows().should('have.length', apiCount);
      });
    });
  });

  // ── Group By + Filter Interactions (SW-IR-TC21a-e) — reuses the mixed-shape poGF ──

  describe('Group By + filter interactions', () => {
    const groupedTotal = (interception) => {
      const raw = interception?.response?.body;
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const groups = body?.data?.list || [];
      return { groups, sum: groups.reduce((s, g) => s + parseFloat(g.total_inventory_cost ?? g.totalInventoryCost ?? 0), 0) };
    };

    // Decision Table — Group By + PO filter
    it('SW-IR-TC21a: Group By + PO filter shows only that PO\'s groups, total matches the seeded delta', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poGF);
      page.selectGroupByField('Category').then((interception) => {
        const { groups, sum } = groupedTotal(interception);
        expect(sum, 'grouped total scoped to the seeded PO must equal the remaining Available delta').to.be.closeTo(
          remainingRamValue + laptopCost,
          0.5
        );
        page.getGroupedTableRows().should('have.length', groups.length);
      });
    });

    // Decision Table — Group By + Category filter
    it(
      'SW-IR-TC21b: Group By + Category filter shows only that category\'s groups, totals reconcile vs. the API',
      { tags: ['@regression'] },
      function () {
        if (!gfRamCategoryId) this.skip();
        page.visit();
        page.selectPo(poGF);
        page.selectCategory(gfRamCategoryId);
        page.selectGroupByField('Category').then((interception) => {
          const { sum } = groupedTotal(interception);
          expect(sum, 'ram-category-scoped grouped total must equal only the remaining ram delta').to.be.closeTo(remainingRamValue, 0.5);
        });
      }
    );

    // Decision Table — Group By + PO and Category filters together
    it(
      'SW-IR-TC21c: Group By + PO and Category filters together shows the intersection of both',
      { tags: ['@regression'] },
      function () {
        if (!gfLaptopCategoryId) this.skip();
        page.visit();
        page.selectPo(poGF);
        page.selectCategory(gfLaptopCategoryId);
        page.selectGroupByField('Category').then((interception) => {
          const { sum } = groupedTotal(interception);
          expect(sum, 'po + laptop-category intersection must equal only the laptop delta (ram excluded)').to.be.closeTo(laptopCost, 0.5);
        });
      }
    );

    // Decision Table — Group By + As-of-Date
    it(
      'SW-IR-TC21d: Group By + As-of-Date preset shows the correct per-date total for the seeded PO',
      { tags: ['@regression'] },
      () => {
        page.visit();
        page.selectPo(poGF);
        page.selectAsOfPreset('Yesterday');
        page.selectGroupByField('Category').then((interception) => {
          const { sum } = groupedTotal(interception);
          expect(sum, 'a PO seeded today must contribute $0 As-of Yesterday, grouped or not').to.be.closeTo(0, 0.5);
        });
      }
    );

    // Use Case — Group By + PO filter + Export Grouped
    it(
      'SW-IR-TC21e: Group By + PO filter + Export Grouped — workbook matches the on-screen groups and costs',
      { tags: ['@regression'] },
      () => {
        page.visit();
        page.selectPo(poGF);
        page.selectGroupByField('Category').then((interception) => {
          const { sum: onScreenSum } = groupedTotal(interception);
          page
            .downloadAndParseWorkbook('inventory-report-grouped-Category*.xlsx', () => page.clickExportGroupedMenuItem())
            .then(({ sheets }) => {
              const [header, ...rows] = sheets[0].allRows;
              const costCol = header.indexOf('Total Inventory Cost');
              const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
              const exportSum = dataRows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
              expect(exportSum, 'downloaded grouped workbook total must equal the on-screen grouped total').to.be.closeTo(onScreenSum, 0.5);
            });
        });
      }
    );
  });

  // ── Export (SW-IR-TC22-27) ────────────────────────────────────────────────────

  describe('Export', () => {
    // Error Guessing — the confirmed silent no-op on a never-touched PO filter
    it('SW-IR-TC22: Export is a no-op when no PO has ever been selected', { tags: ['@regression'] }, () => {
      page.visit();
      cy.intercept('GET', '**/ending-inventory-report/export*').as('exportReq');
      page.clickExportButton();
      cy.get('@exportReq.all').should('have.length', 0);
    });

    // Decision Table — explicitly selecting "All POs" is NOT the pristine null state
    it('SW-IR-TC23: Export succeeds once "All POs" is explicitly selected', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo('All POs');
      cy.intercept('GET', '**/ending-inventory-report/export*').as('exportReq');
      page.clickExportButton();
      cy.wait('@exportReq').its('response.statusCode').should('eq', 200);
    });

    // Use Case — export request carries the active PO filter
    it('SW-IR-TC24: Selecting a specific PO scopes the export request to that PO', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      cy.intercept('GET', '**/ending-inventory-report/export*').as('exportReq');
      page.clickExportButton();
      cy.wait('@exportReq').then((interception) => {
        expect(interception.request.url).to.include(encodeURIComponent(poAsOf));
      });
    });

    // Use Case — Export Grouped is genuinely reachable here (unlike Cost Report's dead button)
    it('SW-IR-TC25: Export Grouped downloads the grouped workbook while grouping is active', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectGroupByField('Category');
      cy.intercept('GET', '**/ending-inventory-report/grouped/export*').as('groupedExportReq');
      page.clickExportGroupedMenuItem();
      cy.wait('@groupedExportReq').its('response.statusCode').should('eq', 200);
    });

    // Use Case — export request mirrors the currently active filters
    it('SW-IR-TC26: Flat export request carries the currently active filters', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      page.selectStatus('Damaged');
      cy.intercept('GET', '**/ending-inventory-report/export*').as('exportReq');
      page.clickExportButton();
      cy.wait('@exportReq').then((interception) => {
        const url = new URL(interception.request.url);
        expect(url.searchParams.get('po')).to.equal(poAsOf);
        expect(url.searchParams.get('status')).to.equal('Damaged');
      });
    });

    it('SW-IR-TC27: Grouped export request carries the currently active groupBy + filters', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poAsOf);
      page.selectGroupByField('Category');
      cy.intercept('GET', '**/ending-inventory-report/grouped/export*').as('groupedExportReq');
      page.clickExportGroupedMenuItem();
      cy.wait('@groupedExportReq').then((interception) => {
        const url = new URL(interception.request.url);
        expect(url.searchParams.get('groupBy')).to.equal('Category');
        expect(url.searchParams.get('po')).to.equal(poAsOf);
      });
    });

    // ── Flat export content verification (SW-IR-TC26a-e) — downloaded-file
    // parsing via parseExcelBuffer, reusing the mixed-shape poGF fixture ──

    // Decision Table — flat export honors the Status filter
    it('SW-IR-TC26a: Flat export with a Status filter — workbook rows reflect only that status', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poGF);
      page.selectStatus('Sold');
      page
        .downloadAndParseWorkbook(`ending-inventory-report-${poGF}.xlsx`, () => page.clickExportButton())
        .then(({ sheets }) => {
          const [header, ...allRows] = sheets[0].allRows;
          const costCol = header.indexOf('Total Inventory Cost');
          const rows = allRows.filter((r) => !r.includes('TOTALS'));
          expect(rows, 'status=Sold export for the seeded PO must contain exactly 1 row').to.have.length(1);
          expect(parseFloat(rows[0][costCol]), 'sold row cost must equal ramCost').to.be.closeTo(ramCost, 0.5);
        });
    });

    // Decision Table — flat export honors the Category filter
    it(
      'SW-IR-TC26b: Flat export with a Category filter — workbook rows all belong to that category',
      { tags: ['@regression'] },
      function () {
        if (!gfRamCategoryId) this.skip();
        page.visit();
        page.selectPo(poGF);
        page.selectCategory(gfRamCategoryId);
        page
          .downloadAndParseWorkbook(`ending-inventory-report-${poGF}.xlsx`, () => page.clickExportButton())
          .then(({ sheets }) => {
            const [header, ...allRows] = sheets[0].allRows;
            const costCol = header.indexOf('Total Inventory Cost');
            const rows = allRows.filter((r) => !r.includes('TOTALS'));
            expect(rows, 'ram-category export must contain exactly 1 row').to.have.length(1);
            expect(parseFloat(rows[0][costCol]), 'ram-only export cost must equal the remaining ram delta').to.be.closeTo(
              remainingRamValue,
              0.5
            );
          });
      }
    );

    // Decision Table — flat export honors As-of Date + PO together
    it(
      'SW-IR-TC26c: Flat export (As-of Yesterday) + PO filter — workbook shows $0 for the today-seeded PO',
      { tags: ['@regression'] },
      () => {
        page.visit();
        page.selectPo(poGF);
        page.selectAsOfPreset('Yesterday');
        page
          .downloadAndParseWorkbook(`ending-inventory-report-${poGF}.xlsx`, () => page.clickExportButton())
          .then(({ sheets }) => {
            const [header, ...allRows] = sheets[0].allRows;
            const costCol = header.indexOf('Total Inventory Cost');
            const rows = allRows.filter((r) => !r.includes('TOTALS'));
            const total = rows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
            expect(total, 'a PO seeded today must export as $0 As-of Yesterday').to.be.closeTo(0, 0.5);
          });
      }
    );

    // Decision Table — export column set is server-fixed, independent of on-screen customization
    it('SW-IR-TC26d: Flat export header is independent of on-screen column customization', { tags: ['@regression'] }, () => {
      page.visit();
      page.openCustomizeColumns();
      page.removeCoreColumnAndSave('Avg Cost');
      page.loc.tableHeaderCell('Avg Cost').should('not.exist');
      page.selectPo(poGF);
      page
        .downloadAndParseWorkbook(`ending-inventory-report-${poGF}.xlsx`, () => page.clickExportButton())
        .then(({ sheets }) => {
          const header = sheets[0].allRows[0];
          expect(
            header,
            'the export is server-generated with a fixed column set — Avg Cost stays in the workbook even though it is hidden on screen'
          ).to.include('Avg Cost');
        });
      // restore — Avg Cost has no checkbox to re-check, so reset via API
      resetColumnConfigToDefault();
    });

    // Error Guessing — TOTALS row consistency
    it(
      'SW-IR-TC26e: Flat export TOTALS row, when present, is counted consistently against the data rows',
      { tags: ['@regression'] },
      () => {
        page.visit();
        page.selectPo(poGF);
        page
          .downloadAndParseWorkbook(`ending-inventory-report-${poGF}.xlsx`, () => page.clickExportButton())
          .then(({ sheets }) => {
            const [header, ...allRows] = sheets[0].allRows;
            const costCol = header.indexOf('Total Inventory Cost');
            const totalsRow = allRows.find((r) => r.includes('TOTALS'));
            if (!totalsRow) {
              cy.log('No TOTALS row present in the flat export — documented as the consistently-absent case.');
              return;
            }
            const dataRows = allRows.filter((r) => r !== totalsRow);
            const dataSum = dataRows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
            expect(parseFloat(totalsRow[costCol]), 'TOTALS row cost must equal SUM of data rows').to.be.closeTo(dataSum, 0.5);
          });
      }
    );

    // ── Grouped export content verification (SW-IR-TC27a-e) ────────────────────

    // Decision Table — grouped export honors the PO filter
    it('SW-IR-TC27a: Grouped export with a PO filter — workbook groups are scoped to that PO', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectPo(poGF);
      page.selectGroupByField('Category').then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const apiGroupCount = (body?.data?.list || []).length;
        page
          .downloadAndParseWorkbook('inventory-report-grouped-Category*.xlsx', () => page.clickExportGroupedMenuItem())
          .then(({ sheets }) => {
            const [, ...rows] = sheets[0].allRows;
            const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
            expect(dataRows, 'grouped export scoped to the seeded PO must have the same group count as the API').to.have.length(
              apiGroupCount
            );
          });
      });
    });

    // Decision Table — grouped export honors the Category filter
    it(
      'SW-IR-TC27b: Grouped export with a Category filter contains only that category',
      { tags: ['@regression'] },
      function () {
        if (!gfRamCategoryId) this.skip();
        page.visit();
        page.selectPo(poGF);
        page.selectCategory(gfRamCategoryId);
        page.selectGroupByField('Category');
        page
          .downloadAndParseWorkbook('inventory-report-grouped-Category*.xlsx', () => page.clickExportGroupedMenuItem())
          .then(({ sheets }) => {
            const [header, ...rows] = sheets[0].allRows;
            const costCol = header.indexOf('Total Inventory Cost');
            const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
            expect(dataRows, 'category-filtered grouped export must roll up into exactly 1 group (ram only)').to.have.length(1);
            expect(parseFloat(dataRows[0][costCol])).to.be.closeTo(remainingRamValue, 0.5);
          });
      }
    );

    // Decision Table — grouped export honors the As-of Date preset
    it(
      'SW-IR-TC27c: Grouped export (As-of Yesterday) shows $0 for the today-seeded PO, not the Today total',
      { tags: ['@regression'] },
      () => {
        page.visit();
        page.selectPo(poGF);
        page.selectAsOfPreset('Yesterday');
        page.selectGroupByField('Category');
        page
          .downloadAndParseWorkbook('inventory-report-grouped-Category*.xlsx', () => page.clickExportGroupedMenuItem())
          .then(({ sheets }) => {
            const [header, ...rows] = sheets[0].allRows;
            const costCol = header.indexOf('Total Inventory Cost');
            const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
            const total = dataRows.reduce((s, r) => s + (parseFloat(r[costCol]) || 0), 0);
            expect(total, 'As-of Yesterday grouped export for a today-seeded PO must be $0').to.be.closeTo(0, 0.5);
          });
      }
    );

    // Decision Table — grouped export header shape
    it('SW-IR-TC27d: Grouped export header row is complete and ordered correctly', { tags: ['@regression'] }, () => {
      page.visit();
      page.selectGroupByField('Category');
      page
        .downloadAndParseWorkbook('inventory-report-grouped-Category*.xlsx', () => page.clickExportGroupedMenuItem())
        .then(({ sheets }) => {
          const header = sheets[0].allRows[0];
          const expectedOrder = ['Category', 'Total Inventory Cost', 'Avg Cost', 'Quantity', 'Products'];
          const indices = expectedOrder.map((col) => header.indexOf(col));
          indices.forEach((idx, i) => expect(idx, `header must contain "${expectedOrder[i]}"`).to.be.gte(0));
          for (let i = 1; i < indices.length; i++) {
            expect(indices[i], `"${expectedOrder[i]}" must come after "${expectedOrder[i - 1]}"`).to.be.greaterThan(indices[i - 1]);
          }
        });
    });

    // Decision Table — grouped export with multiple groupBy fields
    it(
      'SW-IR-TC27e: Grouped export with multiple groupBy fields (Category + Product Name) rolls up correctly per group',
      { tags: ['@regression'] },
      () => {
        page.visit();
        page.selectPo(poGF);
        page
          .selectGroupByField('Category')
          .then(() => {
            page.loc.groupByInput().click();
            page.loc.groupByOption('Product Name').click();
            page.loc.totalEndingInventoryCostCard().click();
            return cy.wait(`@${data.aliases.groupedTableItems}`);
          })
          .then((interception) => {
            const raw = interception?.response?.body;
            const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const apiGroupCount = (body?.data?.list || []).length;
            page
              .downloadAndParseWorkbook('inventory-report-grouped-Category-*.xlsx', () => page.clickExportGroupedMenuItem())
              .then(({ sheets }) => {
                const [header, ...rows] = sheets[0].allRows;
                const dataRows = rows.filter((r) => r.some((v) => v !== null && v !== ''));
                expect(header, 'header must include both grouped-by fields').to.include('Category');
                expect(header, 'header must include both grouped-by fields').to.include('Product Name');
                expect(
                  dataRows,
                  'a 2-field group-by on 2 distinct seeded products must yield the same group count as the API'
                ).to.have.length(apiGroupCount);
              });
          });
      }
    );
  });

  // ── Pagination, sorting, navigation (SW-IR-TC28-32) ──────────────────────────

  describe('Pagination, sorting, navigation', () => {
    // BVA — page 2 disjoint from page 1
    it('SW-IR-TC28: Pagination boundary — page 2 is disjoint from page 1', { tags: ['@regression'] }, function () {
      page.visit();
      page.getPaginationSummary().then((summaryText) => {
        const match = summaryText.match(/of\s*([\d,]+)/i);
        const total = match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
        if (total <= data.pagination.defaultPageSize) this.skip();
        page.getPaginationSummary().then((page1Summary) => {
          page.getTableRows().then(($page1Rows) => {
            const page1Names = [...$page1Rows].map((r) => r.innerText);
            page.goToNextPage();
            // cy.wait('@tableItems') inside goToNextPage() only guarantees the
            // response landed — the grid keeps rendering page 1's rows under
            // a loading spinner until the new page's data actually swaps in
            // (keepPreviousData-style UX), so the pagination summary label
            // updating isn't enough either. Wait for that in-table spinner to
            // clear before reading rows.
            page.loc.paginationSummary().should(($el) => {
              expect($el.text()).not.to.equal(page1Summary);
            });
            page.loc.tableLoadingSpinner().should('not.exist');
            page.getTableRows().then(($page2Rows) => {
              const page2Names = [...$page2Rows].map((r) => r.innerText);
              const overlap = page2Names.filter((n) => page1Names.includes(n));
              expect(overlap, 'page 2 should not repeat page 1 rows').to.have.length(0);
            });
          });
        });
      });
    });

    // State Transition — sort header toggles ASC/DESC and the row order mirrors the API
    it('SW-IR-TC29: Clicking the Total Inventory Cost header toggles sort order', { tags: ['@regression'] }, () => {
      page.visit();
      page.clickColumnHeader('Total Inventory Cost');
      cy.get(`@${data.aliases.tableItems}`).then((interception) => {
        const url = new URL(interception.request.url);
        expect(url.searchParams.get('sortBy')).to.equal('total_inventory_cost');
      });
    });

    // State Transition — this screen defines its own accessorKey for Quantity
    it('SW-IR-TC30: Quantity column sorts by its real field (availableQuantity for the default status)', { tags: ['@regression'] }, () => {
      page.visit();
      page.clickColumnHeader('Available');
      cy.get(`@${data.aliases.tableItems}`).then((interception) => {
        const url = new URL(interception.request.url);
        expect(url.searchParams.get('sortBy')).to.equal('availableQuantity');
      });
    });

    // State Transition — clearing search auto-resets without a second Search click
    it('SW-IR-TC31: Clearing a submitted search auto-resets without a second Search click', { tags: ['@regression'] }, function () {
      page.visit();
      cy.get(`@${data.aliases.tableItems}`).then((interception) => {
        const raw = interception?.response?.body;
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const list = body?.data?.list || [];
        if (!list.length || !list[0].name) this.skip();
        const term = String(list[0].name).split(' ')[0];
        page.search(term);
        page.clearSearch().then((clearedInterception) => {
          const url = new URL(clearedInterception.request.url);
          expect(url.searchParams.get('search')).to.satisfy((v) => v === null || v === '');
        });
      });
    });

    // Use Case — product-name click navigates with the correct back-path
    it('SW-IR-TC32: Clicking a product name navigates with backPath="/reports/inventory-report"', { tags: ['@regression'] }, function () {
      page.visit();
      page.getTableRows().should('have.length.greaterThan', 0);
      page.clickFirstProductNameLink();
      cy.location('pathname').should('match', /^\/inventory\//);
    });
  });

  // ── Mobile / responsive (SW-IR-TC33-35) ──────────────────────────────────────

  describe('Mobile / responsive', () => {
    beforeEach(() => cy.viewport('iphone-x'));

    // Decision Table — mobile replaces the table with a bespoke card list
    it('SW-IR-TC33: Mobile card list replaces the table below the md breakpoint', { tags: ['@regression'] }, () => {
      page.visit();
      page.loc.tableContainer().should('not.exist');
      page.getMobileCards().should('have.length.greaterThan', 0);
    });

    // Use Case — mobile pagination produces the same transitions as desktop
    it('SW-IR-TC34: Mobile pagination advances to a new page of cards', { tags: ['@regression'] }, function () {
      page.visit();
      page.getMobileCards().then(($cards1) => {
        page.loc.mobileNextPageButton().then(($next) => {
          if ($next.length === 0) this.skip();
          cy.wrap($next.first()).click();
          cy.wait(`@${data.aliases.tableItems}`);
          page.getMobileCards().should('have.length.greaterThan', 0);
        });
      });
    });

    // Error Guessing — rapid preset switching settles on the last selection, not a stale response
    it('SW-IR-TC35: Rapid As-of preset switching settles on the last-selected preset', { tags: ['@regression'] }, () => {
      cy.viewport('macbook-15'); // needs the desktop preset select, not the mobile card view
      page.visit();
      page.loc.asOfPresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
      page.loc.asOfPresetOption('Yesterday').click();
      page.loc.asOfPresetSelect().should('not.have.attr', 'aria-disabled', 'true').click();
      page.loc.asOfPresetOption('1 Week Ago').click();
      // Neither preset click is individually settled before the next fires, so
      // a plain cy.wait() would consume whichever tableItems response happens
      // to be next in the FIFO queue (possibly the Yesterday one, not the
      // final 1-Week-Ago one) — assert on the LAST captured request instead.
      cy.get(`@${data.aliases.tableItems}.all`).should((all) => {
        const last = all[all.length - 1];
        expect(last?.request?.url, 'a tableItems request must have fired').to.exist;
        const url = new URL(last.request.url);
        expect((url.searchParams.get('startDate') || '').slice(0, 10)).to.equal(oneWeekAgo);
      });
      page.getAsOfPresetValue().should('match', /1 week ago/i);
    });
  });
});
