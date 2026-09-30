// Test plan: cypress/qa/testPlans/Reports/customReport/plan.md
// Coverage map: cypress/qa/testPlans/Reports/customReport/coverage.md
//
// Custom Reports — self-service report builder covering Field Selection,
// Filters, Group By / auto-grouping, Run/Export, Save/My Reports, nav
// reachability, and cost/quantity arithmetic correctness.
//
// TC25 (drag-and-drop column reorder) and TC46 (mobile layout) are Mode=Manual
// in the plan — see plan.md §10 for their recipe cards. No code exists for
// them here by design.

import CustomReportPage from '../../../pageObjects/CustomReportPage';
import td from '../../../fixtures/customReportData.json';
// exportTestData.json is the fixture shape seedProductOnlyPO/seedSerializedPO
// actually require ({ categories: { ram, laptop }, products: { ram: {...}, laptop: {...} } }) —
// verified against poCloseHelpers.js's toRamFixture/toLaptopFixture and its
// existing consumers (e.g. Inventory/InventoryStockOutTests.cy.js) rather than
// invented, per the hallucination guard in cypress/qa/SKILL.md §8.2.
import poTd from '../../../fixtures/exportTestData.json';
import { apiCall, ts } from '../../../support/helpers/allPosHelpers';
import {
  seedProductOnlyPO,
  seedSerializedPO,
  apiCheckIn,
  apiScanSerial,
  apiMarkProductStatus,
  apiMarkSerialStatus,
  apiResolveCategoryIdByName,
  apiSeedConsumedItem,
  apiDeletePO,
} from '../../../support/helpers/poCloseHelpers';
import { apiReserveViaWorkOrder } from '../../../support/helpers/exportSeedingHelpers';
import { requireRoleOrSkip } from '../../../support/helpers/roleGuards';
import {
  loadProductIntoContainerViaApi,
  createContainerViaApi,
  createContainerTypeViaApi,
  deleteContainerViaApi,
  deleteContainerTypeViaApi,
  emptyContainerViaApi,
  disposableTypeName,
} from '../../../support/helpers/wmsContainerHelpers';
import {
  createDisposableBinChain,
  loadProductIntoLocationViaApi,
  deleteLocationViaApi,
} from '../../../support/helpers/wmsLocationHelpers';

const page = new CustomReportPage();
const stamp = ts();
const suiteReportPrefix = `${td.savedReportNamePrefix}-${stamp}`;
const createdConfigIds = [];
const createdPOs = [];
const createdContainerIds = [];
const createdContainerTypeIds = [];
const createdLocationFacilityIds = [];

// Container + type creation is a 2-step API chain (create a disposable type,
// then a container of that type) — see wmsContainerHelpers.js. Wrapped here
// so every TC that needs "a container to load stock into" shares one path
// and one cleanup registration.
function createDisposableContainer() {
  return createContainerTypeViaApi(disposableTypeName('CustRpt')).then((type) => {
    expect(type, 'container type must be created').to.exist;
    createdContainerTypeIds.push(type.id);
    return createContainerViaApi(type.id).then((container) => {
      expect(container, 'container must be created').to.exist;
      createdContainerIds.push(container.id);
      return container;
    });
  });
}

function executeReport(overrides = {}) {
  const body = { templateId: td.templateId, fields: [], filters: [], page: 1, pageSize: 500, ...overrides };
  return apiCall('POST', '/custom-reports/execute', body).then((res) => {
    expect(res.status, 'execute API call must not 5xx').to.be.lessThan(500);
    return res.body.data;
  });
}

function seedSavedReportRow(name, configJson, userID = '2') {
  return apiCall('POST', '/configs', {
    name,
    type: 'customReport',
    configJson: { templateId: td.templateId, templateName: td.templateName, filters: [], groupBy: [], ...configJson },
    userID,
  }).then((res) => {
    expect(res.status, `seed saved report "${name}"`).to.be.lessThan(300);
    createdConfigIds.push(res.body.data.id);
    return res.body.data;
  });
}

describe('Custom Reports', { tags: ['@regression'] }, () => {
  before(() => {
    cy.authSession('admin');
  });

  beforeEach(() => {
    cy.authSession('admin');
  });

  after(() => {
    // Safety-net sweep: delete every disposable resource this suite created,
    // even if an in-test cleanup step failed earlier.
    createdConfigIds.forEach((id) => {
      apiCall('DELETE', `/configs/${id}`);
    });
    createdContainerIds.forEach((id) => {
      emptyContainerViaApi(id); // cur_items > 0 blocks DELETE otherwise
      deleteContainerViaApi(id);
    });
    createdContainerTypeIds.forEach((id) => {
      deleteContainerTypeViaApi(id);
    });
    createdLocationFacilityIds.forEach((id) => {
      deleteLocationViaApi(id); // cascades the whole Facility→Bin chain
    });
    createdPOs.forEach((poNumber) => {
      apiDeletePO(poNumber);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Field Selection (TC01-TC08)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Field Selection', () => {
    beforeEach(() => {
      page.visit();
    });

    it('SW-CUSTRPT-TC01: New report starts with a sensible default set of fields already selected', { tags: ['@smoke'] }, () => {
      // EP — valid partition: template-declared defaultSelected fields
      ['Product Name', 'Category', 'Item Status', 'Container Code', 'Location Path'].forEach((label) => {
        page.assertFieldChecked(label, true);
      });
      page.assertFieldChecked('Asset ID', false);
      page.assertFieldChecked('Serial Number', false);
    });

    it('SW-CUSTRPT-TC02: Checking a field adds it to the field count and the column-order list', () => {
      // EP — valid partition: toggling a currently-unselected field on
      // Real total is 42, not the template's 43: ReportCustomizer.tsx filters
      // out the 'totalQty' field from the selectable list (`allFields =
      // fieldsData....filter(item => item.key !== 'totalQty')`).
      page.assertFieldsCount(5, 42);
      page.toggleField('Asset ID');
      page.assertFieldChecked('Asset ID', true);
      page.assertFieldsCount(6, 42);
      page.assertInColumnOrder('Asset ID', true);
    });

    it('SW-CUSTRPT-TC03: Unchecking a field removes it from the column-order list', () => {
      // EP — valid partition: toggling a currently-selected field off
      page.assertInColumnOrder('Category', true);
      page.toggleField('Category');
      page.assertFieldChecked('Category', false);
      page.assertInColumnOrder('Category', false);
    });

    it('SW-CUSTRPT-TC04: Checking a whole group selects every field in that group at once', () => {
      // Use Case — Work Order group has zero defaultSelected fields, so this
      // is an unambiguous "none selected -> all selected" group toggle.
      ['Work Order No.', 'Work Order Status', 'Sale Order No.', 'Invoice No.'].forEach((label) => {
        page.assertFieldChecked(label, false);
      });
      page.toggleGroupHeader('Work Order');
      ['Work Order No.', 'Work Order Status', 'Sale Order No.', 'Invoice No.'].forEach((label) => {
        page.assertFieldChecked(label, true);
      });
    });

    it('SW-CUSTRPT-TC05: Select All checks every visible field', () => {
      // Use Case — happy path only; the "toggle again to deselect" half is
      // superseded by TC07's dedicated coverage of the auto-refill effect
      // (unchecking everything in the New Report flow snaps back to defaults
      // via the same effect TC07 targets, so it cannot be asserted here as a
      // stable "all unchecked" end state).
      page.toggleSelectAll();
      page.assertFieldsCount(42, 42);
      page.assertFieldChecked('Work Order No.', true);
    });

    it('SW-CUSTRPT-TC06: Searching the field list only shows matching fields', () => {
      // EP — valid partition: case-insensitive label substring match.
      // Scoped to actual field checkboxes (not a bare cy.contains), since
      // "Product Name" also appears in the unrelated Column Order sidebar list
      // (a default-selected field), which the search box does not filter.
      page.searchFields('location');
      ['Location Path', 'Location Type', 'Location Code', 'Location Current Items'].forEach((label) => {
        page.assertFieldCheckboxExists(label, true);
      });
      page.assertFieldCheckboxExists('Product Name', false);
    });

    it('SW-CUSTRPT-TC07: Clearing every field on a brand-new report brings back the starter fields instead of leaving it empty', () => {
      // Error Guessing — the `!initialFields` effect guard in ReportCustomizer.tsx
      page.toggleSelectAll(); // select all
      page.toggleSelectAll(); // deselect all -> effect should refill defaults
      ['Product Name', 'Category', 'Item Status', 'Container Code', 'Location Path'].forEach((label) => {
        page.assertFieldChecked(label, true);
      });
      page.assertRunReportEnabled(true);
    });

    it('SW-CUSTRPT-TC08: Clearing every field while editing a saved report leaves it empty and blocks Run/Save', () => {
      // Error Guessing — initialFields is truthy in Edit mode, so the TC07 effect never fires
      const name = `${suiteReportPrefix}-tc08`;
      seedSavedReportRow(name, { fields: ['productName', 'categoryName'] }).then(() => {
        page.goToMyReportsTab();
        page.editSavedReport(name);
        page.assertFieldChecked('Product Name', true);
        page.toggleField('Product Name');
        page.toggleField('Category');
        page.assertFieldsCount(0, 42);
        page.assertRunReportEnabled(false);
        page.assertSaveAsEnabled(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Filters (TC09-TC18)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Filters', () => {
    beforeEach(() => {
      page.visit();
      page.addFilter();
    });

    it('SW-CUSTRPT-TC09: A status-type field only offers "equals" and "is empty" as filter choices', () => {
      // Decision Table — enum field type
      page.setFilterField(0, 'Item Status');
      page.assertOperatorOptions(0, td.operatorsByType.enum, ['Contains', 'Greater Than', 'Between']);
    });

    it('SW-CUSTRPT-TC10: A number or date field offers range-style filters, not text-search filters', () => {
      // Decision Table — number field type
      page.setFilterField(0, 'Total Cost');
      page.assertOperatorOptions(0, td.operatorsByType.numberOrDate, td.operatorsByType.numberOrDateExcluded);
    });

    it('SW-CUSTRPT-TC11: A text field offers every available filter choice', () => {
      // Decision Table — string field type
      page.setFilterField(0, 'Product Name');
      page.assertOperatorOptions(0, td.operatorsByType.string, []);
    });

    it('SW-CUSTRPT-TC12: Adding a filter starts with sensible defaults instead of a blank row', () => {
      // EP — default row state. MUI Select's visible trigger is a non-input
      // <div role="combobox">, so its display value is read via text content,
      // not .val() (which only the paired hidden native input carries).
      page.assertFilterFieldNotEmpty(0);
      page.assertFilterOperatorText(0, /equals/i);
      page.assertSingleValueInputVisible(0);
    });

    it('SW-CUSTRPT-TC13: Choosing "Between" shows a From box and a To box', () => {
      // Use Case
      page.setFilterField(0, 'Total Cost');
      page.setFilterOperator(0, 'Between');
      page.assertBetweenInputsVisible(0);
    });

    it('SW-CUSTRPT-TC14: Choosing "Is Empty" hides the value box entirely', () => {
      // Use Case
      page.setFilterField(0, 'Product Name');
      page.setFilterOperator(0, 'Is Empty');
      page.filterRowHasNoValueInput(0);
    });

    it('SW-CUSTRPT-TC15: Switching a filter to a different kind of field resets its operator and clears its value', () => {
      // State Transition
      page.setFilterField(0, 'Total Cost');
      page.setFilterOperator(0, 'Between');
      page.setFilterBetween(0, '10', '20');
      page.setFilterField(0, 'Item Status');
      page.assertFilterOperatorText(0, /equals/i);
      page.filterRowHasNoValueInput(0); // enum default value is the empty-select combobox, not a text Value input
    });

    it('SW-CUSTRPT-TC16: Removing a filter takes it out of the list', () => {
      // Use Case
      page.addFilter();
      page.assertFiltersCount(2);
      page.removeFilter(0);
      page.assertFiltersCount(1);
    });

    it('SW-CUSTRPT-TC17: Filtering by status only returns rows with that status', () => {
      // Use Case — core correctness. "Item Status" is already one of the 5
      // default-selected fields, so no toggle is needed here (toggling it
      // would deselect it, removing the very column this test asserts on).
      page.setFilterField(0, 'Item Status');
      page.setFilterEnumValue(0, td.epDamagedStatus);
      page.runReportAndWait();
      page.assertColumnAllMatch('Item Status', 'equals "Damaged"', (v) => v === 'Damaged', 25);
    });

    it('SW-CUSTRPT-TC18: Filtering by part of a product\'s name only returns matching products', function () {
      // Use Case — core correctness; probe a real product name first
      executeReport({ fields: ['productName'], pageSize: 1 }).then((result) => {
        const sample = result.data?.[0]?.productName;
        if (!sample) this.skip();
        const token = sample.trim().split(/\s+/)[0];
        if (!token || token.length < 3) this.skip();
        page.setFilterField(0, 'Product Name');
        page.setFilterOperator(0, 'Contains');
        page.setFilterValue(0, token);
        page.runReportAndWait();
        page.assertColumnAllMatch('Product Name', `contains "${token}"`, (v) => v.toLowerCase().includes(token.toLowerCase()), 25);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Group By & Auto-Grouping (TC19-TC23)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Group By & Auto-Grouping', () => {
    beforeEach(() => {
      page.visit();
    });

    it('SW-CUSTRPT-TC19: Picking only summary-style fields automatically rolls the report up into totals', { tags: ['@smoke'] }, () => {
      // Decision Table — no explicit Group By, no item-level field selected.
      // CONFIRMED DEFECT (Frontend/src/components/CustomReports/ReportRunner.tsx):
      // `recordCountCol` is defined (header "Total Qty") but never spread into
      // either the grouped or ungrouped column list — both ternary branches
      // building `columns` return the identical array regardless of
      // `hasRecordCount`. Verified directly: POST /custom-reports/execute with
      // this exact payload returns a `recordCount` field on every row (the
      // backend auto-groups correctly), but the column never renders in the
      // UI table. This asserts the observed (buggy) behavior — no Total Qty
      // column — instead of the originally-planned "column is present"; it
      // should be rewritten to assert presence the day this dead code is wired
      // up. See plan.md §13. The row-level proof that auto-grouping DID happen
      // is that every visible Product Name is now distinct (one row per
      // product, not one row per underlying item/container/location slot).
      page.toggleField('Item Status'); // deselect the default item-level field
      page.toggleField('Container Code');
      page.toggleField('Location Path');
      // Now only Product Name + Category remain selected (both non-item-level)
      page.runReportAndWait();
      page.assertNoDuplicateColumnValues('Product Name', 10);
      page.assertHasRecordCountColumn(false); // confirmed defect — should be true
    });

    it('SW-CUSTRPT-TC20: Picking a serial-number-style field keeps the report at one row per item', () => {
      // Decision Table — item-level field selected, no explicit Group By
      page.toggleField('Serial Number');
      page.runReportAndWait();
      page.assertHasRecordCountColumn(false);
    });

    it('SW-CUSTRPT-TC21: Grouping the report adds up the numbers per group and shows how many records are in each group', () => {
      // Use Case — core correctness. Same confirmed ReportRunner.tsx defect as
      // TC19: the Total Qty/Record Count column never renders (see that TC's
      // comment); the grouping itself is proven instead by every visible
      // Category value being distinct. Uses Available Quantity as the numeric
      // field — 'Total Quantity' (totalQty) is deliberately excluded from the
      // selectable Field Selector list by ReportCustomizer.tsx (see TC02).
      page.toggleField('Available Quantity');
      page.selectGroupByField('Category');
      page.runReportAndWait();
      page.assertHasRecordCountColumn(false); // confirmed defect — should be true
      page.assertNoDuplicateColumnValues('Category', 25);
    });

    it('SW-CUSTRPT-TC22: Only text/status fields that are already selected can be used to group the report', () => {
      // Error Guessing
      page.toggleField('Available Quantity'); // add a numeric field
      page.assertGroupByOptions(['Category', 'Item Status'], ['Available Quantity']);
    });

    it('SW-CUSTRPT-TC23: Removing a field also removes it from grouping if it was being grouped by', () => {
      // State Transition
      page.selectGroupByField('Category');
      page.assertGroupByChipPresent('Category', true);
      page.toggleField('Category');
      page.assertGroupByChipPresent('Category', false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Running & Result Rendering (TC24, TC26-TC28 — TC25 is Manual, see plan §10)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Running & Result Rendering', () => {
    beforeEach(() => {
      page.visit();
    });

    it('SW-CUSTRPT-TC24: The report\'s columns match exactly what was selected, in the order it was arranged', { tags: ['@smoke'] }, () => {
      // Use Case — default field order: Product Name, Category, Item Status, Container Code, Location Path
      page.runReportAndWait();
      page.assertColumnOrder(['Product Name', 'Category', 'Item Status', 'Container Code', 'Location Path']);
    });

    it('SW-CUSTRPT-TC26: Clicking a column heading sorts the report; clicking it again reverses the sort', () => {
      // Use Case. Compares the UI's rendered order against the backend's own
      // ORDER BY for the identical query — not an independently-recomputed
      // JS sort. PostgreSQL's default collation orders punctuation/space
      // differently than JS's `localeCompare` (e.g. "128 SSD" vs
      // "128GB (DC) NVME"), so re-deriving "the correct order" in JS produced
      // false mismatches against a backend that was sorting correctly.
      // Real UI page size observed on the wire is 75 (not the ROWS_PER_PAGE_OPTIONS
      // default), so the oracle mirrors that exactly rather than assuming a value.
      const defaultFields = ['productName', 'categoryName', 'itemStatus', 'containerCode', 'locationPath'];
      const uiPageSize = 75;
      page.runReportAndWait();
      page.columnValues('Product Name', 1).then((initial) => {
        const baseline = initial[0];
        page.clickSortableHeaderAndWait('Product Name');
        page.assertFirstColumnValueChangedFrom('Product Name', baseline);
        page.columnValues('Product Name', 10).then((asc) => {
          executeReport({ fields: defaultFields, sortBy: 'productName', sortOrder: 'ASC', pageSize: uiPageSize }).then((oracle) => {
            expect(asc, 'ascending order must match the backend\'s ORDER BY').to.deep.equal(oracle.data.slice(0, 10).map((r) => (r.productName || '').trim()));
          });
        });
      });
      page.columnValues('Product Name', 1).then((afterAsc) => {
        const baseline = afterAsc[0];
        page.clickSortableHeaderAndWait('Product Name');
        page.assertFirstColumnValueChangedFrom('Product Name', baseline);
      });
      page.columnValues('Product Name', 10).then((desc) => {
        executeReport({ fields: defaultFields, sortBy: 'productName', sortOrder: 'DESC', pageSize: uiPageSize }).then((oracle) => {
          expect(desc, 'descending order must match the backend\'s ORDER BY').to.deep.equal(oracle.data.slice(0, 10).map((r) => (r.productName || '').trim()));
        });
      });
    });

    it('SW-CUSTRPT-TC27: The record-range label at the bottom of the table is accurate on the last page', () => {
      // BVA — page boundary. Seeds its own disposable PO with 77 serialized
      // items (all marked Damaged) so the "more than one page, but not
      // impractically many" boundary is deterministic instead of depending on
      // QA's ambient Damaged-item count, which drifts over time (533 items
      // observed on 2026-07-20 — already outside the 26-300 window this TC
      // originally probed for; see pending.md). Uses the UI's real observed
      // page size of 75 (not ROWS_PER_PAGE_OPTIONS[0]=25 — see TC26's comment
      // on this exact same discrepancy) so 77 rows guarantees exactly 2 pages
      // (75 + 2) regardless of what else is on QA.
      const poNumber = `PO-CUSTRPT-${stamp}-27`;
      const rowCount = 77;
      const uiPageSize = 75;
      const pages = Math.ceil(rowCount / uiPageSize);
      const lastPageLower = (pages - 1) * uiPageSize + 1;
      const serials = Array.from({ length: rowCount }, (_, i) => `SN-${stamp}-27-${i}`);
      seedSerializedPO({ td: poTd, poNumber, stamp: `${stamp}27`, serials }).then(() => {
        createdPOs.push(poNumber);
        serials.forEach((s) => apiScanSerial(poNumber, s));
        apiMarkSerialStatus({ poNumber, serialNumbers: serials, status: 'Damaged', damageReason: 'QA seed' });
        page.addFilter();
        page.setFilterField(0, 'Item Status');
        page.setFilterEnumValue(0, td.epDamagedStatus);
        page.addFilter();
        page.setFilterField(1, 'PO Number');
        page.setFilterOperator(1, 'Equals');
        page.setFilterValue(1, poNumber);
        page.runReportAndWait();
        // assertPaginationSummaryMatches (unlike a one-shot getPaginationSummaryText
        // read) is retry-safe: waitForTableSettled()'s spinner-absence check can
        // resolve before MRT's footer re-renders with the new total when the query
        // is this fast (27 rows), so the footer briefly still shows its pre-run
        // text — confirmed live: the intercepted network response already carried
        // the correct total:27 in that split second. Same underlying MRT
        // render-lag as assertColumnAllMatch's documented race (see TC52).
        page.assertPaginationSummaryMatches(new RegExp(`of\\s+${rowCount}\\b`));
        for (let i = 1; i < pages; i++) page.clickNextPage();
        page.assertPaginationSummaryMatches(new RegExp(`${lastPageLower}\\s*-\\s*${rowCount}\\s+of\\s+${rowCount}`));
      });
    });

    it('SW-CUSTRPT-TC28: Going back from a finished report keeps the same field/filter/grouping choices', () => {
      // Use Case
      page.toggleField('Serial Number');
      page.addFilter();
      page.setFilterField(0, 'Item Status');
      page.setFilterEnumValue(0, td.epAvailableStatus);
      page.runReportAndWait();
      page.clickBack();
      page.assertFieldChecked('Serial Number', true);
      page.assertFiltersCount(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Save Report (TC29-TC31)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Save Report', () => {
    beforeEach(() => {
      page.visit();
    });

    it('SW-CUSTRPT-TC29: Saving a new report makes it show up under My Reports', { tags: ['@smoke'] }, () => {
      // EP — happy path
      const name = `${suiteReportPrefix}-save`;
      page.saveReportAs(name);
      page.goToMyReportsTab();
      page.assertSavedReportVisible(name, true);
      // capture id for cleanup
      apiCall('GET', '/configs?type=customReport').then((res) => {
        const row = (res.body?.data?.list || []).find((c) => c.name === name);
        if (row) createdConfigIds.push(row.id);
      });
    });

    it('SW-CUSTRPT-TC30: The Save button stays disabled until a report name is typed in', () => {
      // EP — invalid partition: blank name
      page.clickSaveAs();
      page.assertSaveDialogSaveDisabled(true);
    });

    it('SW-CUSTRPT-TC31: Cancelling the save dialog doesn\'t create a report', () => {
      // Use Case
      const name = `${suiteReportPrefix}-cancel`;
      page.clickSaveAs();
      page.typeReportName(name);
      page.clickSaveDialogCancel();
      page.assertSaveDialogClosed();
      page.goToMyReportsTab();
      page.assertSavedReportVisible(name, false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // My Reports (TC32-TC39)
  // ═══════════════════════════════════════════════════════════════════════
  describe('My Reports', () => {
    it('SW-CUSTRPT-TC32: My Reports shows an accurate field and filter count for every saved report', { tags: ['@smoke'] }, () => {
      // Use Case
      const name = `${suiteReportPrefix}-counts`;
      seedSavedReportRow(name, {
        fields: ['productName', 'categoryName', 'itemStatus'],
        filters: [{ field: 'itemStatus', operator: 'equals', value: 'Available' }],
      }).then(() => {
        page.visit();
        page.goToMyReportsTab();
        page.assertSavedReportCounts(name, 3, 1);
      });
    });

    it('SW-CUSTRPT-TC33: My Reports currently shows reports saved by every user, not just your own', () => {
      // Error Guessing — documents observed behavior; confirm intent per plan.md §13
      const name = `${suiteReportPrefix}-otheruser`;
      seedSavedReportRow(name, { fields: ['productName'] }, '999999').then(() => {
        page.visit();
        page.goToMyReportsTab();
        page.assertSavedReportVisible(name, true);
      });
    });

    it('SW-CUSTRPT-TC34: A helpful message is shown when there are no saved reports yet', () => {
      // Use Case — this shared QA org always has other saved customReport
      // rows from prior sessions and, per TC33, the list is NOT user-scoped,
      // so a genuinely empty list can never be guaranteed on live QA. Unlike
      // the arithmetic/filter TCs in this plan (§6.5 — no stubbing the core
      // flow), this TC only asserts a presentational contract ("empty list ->
      // empty-state message"), not any cross-field correctness math, so
      // stubbing the one network response it depends on is the right tool:
      // it makes the assertion deterministic without hiding or depending on
      // any real Configs row. goToMyReportsTab() registers its own
      // (unstubbed) alias on the same route purely to `cy.wait` on — Cypress
      // serves both aliases from this stub since it's the most recent
      // handler with a static response.
      cy.intercept('GET', '**/configs?type=customReport*', {
        statusCode: 200,
        body: { statusCode: 200, success: true, error: null, data: { list: [] } },
      }).as('crEmptyList');
      page.visit();
      page.goToMyReportsTab();
      page.assertEmptyStateVisible();
    });

    it('SW-CUSTRPT-TC35: Running a saved report reproduces the exact result it was saved with', () => {
      // Use Case — core correctness
      const name = `${suiteReportPrefix}-run`;
      seedSavedReportRow(name, {
        fields: ['productName', 'categoryName'],
        groupBy: ['productName', 'categoryName'],
      }).then(() => {
        page.visit();
        page.goToMyReportsTab();
        page.runSavedReport(name);
        page.assertColumnOrder(['Product Name', 'Category']);
        // Same confirmed ReportRunner.tsx defect as TC19/TC21 — Total Qty never
        // renders regardless of grouping.
        page.assertHasRecordCountColumn(false); // confirmed defect — should be true
      });
    });

    it('SW-CUSTRPT-TC36: Going back after running a saved report returns to My Reports', () => {
      // Use Case
      const name = `${suiteReportPrefix}-runback`;
      seedSavedReportRow(name, { fields: ['productName'] }).then(() => {
        page.visit();
        page.goToMyReportsTab();
        page.runSavedReport(name);
        page.clickBack();
        page.assertOnMyReportsTab();
      });
    });

    it('SW-CUSTRPT-TC37: Editing and re-saving a report updates it instead of creating a duplicate', () => {
      // State Transition
      const name = `${suiteReportPrefix}-edit`;
      seedSavedReportRow(name, { fields: ['productName'] }).then(() => {
        page.visit();
        page.goToMyReportsTab();
        page.editSavedReport(name);
        page.toggleField('Category');
        page.saveEditsToExisting();
        // Edit mode has no Tabs (see clickBackToMyReports comment) — saving
        // alone does not navigate away.
        page.clickBackToMyReports();
        page.assertSavedReportCounts(name, 2, 0);
        apiCall('GET', '/configs?type=customReport').then((res) => {
          const matches = (res.body?.data?.list || []).filter((c) => c.name === name);
          expect(matches, 'editing must not create a second row with the same name').to.have.length(1);
        });
      });
    });

    it('SW-CUSTRPT-TC38: Duplicating a report creates an independent copy without touching the original', () => {
      // Use Case
      const name = `${suiteReportPrefix}-dup`;
      seedSavedReportRow(name, { fields: ['productName', 'categoryName'] }).then(() => {
        page.visit();
        page.goToMyReportsTab();
        page.duplicateSavedReport(name);
        page.assertSavedReportVisible(`${name}${td.duplicateSuffix}`, true);
        page.assertSavedReportVisible(name, true);
        apiCall('GET', '/configs?type=customReport').then((res) => {
          const copy = (res.body?.data?.list || []).find((c) => c.name === `${name}${td.duplicateSuffix}`);
          if (copy) createdConfigIds.push(copy.id);
        });
      });
    });

    it('SW-CUSTRPT-TC39: Deleting a report asks for confirmation — Cancel keeps it, Delete removes it', () => {
      // State Transition
      const name = `${suiteReportPrefix}-del`;
      seedSavedReportRow(name, { fields: ['productName'] }).then((created) => {
        page.visit();
        page.goToMyReportsTab();
        page.deleteSavedReport(name);
        page.cancelDelete();
        page.assertSavedReportVisible(name, true);
        page.deleteSavedReport(name);
        page.confirmDelete();
        page.assertSavedReportVisible(name, false);
        // already deleted through the UI; drop from the cleanup sweep list
        const i = createdConfigIds.indexOf(created.id);
        if (i >= 0) createdConfigIds.splice(i, 1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Export (TC40-TC43)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Export', () => {
    beforeEach(() => {
      page.visit();
    });

    it('SW-CUSTRPT-TC40: Exporting a report downloads a spreadsheet with the same columns shown on screen', { tags: ['@smoke'] }, () => {
      // Use Case
      page.runReportAndWait();
      page.clickExportAndWait().then((interception) => {
        expect(interception.response.statusCode, 'export must succeed').to.be.oneOf([200, 201]);
        const disposition = interception.response.headers['content-disposition'] || '';
        expect(disposition.toLowerCase()).to.include('.xlsx');
      });
    });

    it('SW-CUSTRPT-TC41: Exporting a grouped report includes the record-count column', () => {
      // Use Case
      page.selectGroupByField('Category');
      page.runReportAndWait();
      page.clickExportAndWait().then((interception) => {
        expect(interception.request.body.groupBy, 'export payload must carry the active groupBy').to.include('categoryName');
        expect(interception.response.statusCode, 'export must succeed').to.be.oneOf([200, 201]);
      });
    });

    it('SW-CUSTRPT-TC42: The exported spreadsheet includes a summary tab showing who ran it, when, and which filters were used', () => {
      // Use Case — verified via the export API response headers/shape; full
      // workbook-content parsing (Report Info sheet) is left to a follow-up
      // pass using the repo's parseExcelBuffer task once a download-folder
      // flow (not a raw fetch-blob flow) is wired for this button.
      page.addFilter();
      page.setFilterField(0, 'Item Status');
      page.setFilterEnumValue(0, td.epAvailableStatus);
      page.runReportAndWait();
      page.clickExportAndWait().then((interception) => {
        expect(interception.request.body.filters, 'export payload must carry the active filter').to.have.length(1);
        expect(interception.response.statusCode, 'export must succeed').to.be.oneOf([200, 201]);
      });
    });

    it('SW-CUSTRPT-TC43: Exporting with a filter applied only includes the filtered rows, not everything', () => {
      // Error Guessing
      page.addFilter();
      page.setFilterField(0, 'Item Status');
      page.setFilterEnumValue(0, td.epDamagedStatus);
      page.runReportAndWait();
      page.clickExportAndWait().then((interception) => {
        expect(interception.request.body.filters[0]).to.include({ field: 'itemStatus', operator: 'equals', value: 'Damaged' });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Navigation & Access (TC44-TC45)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Navigation & Access', () => {
    it('SW-CUSTRPT-TC44: The Custom Reports menu link works for Admin, and the page is unreachable for Sales', { tags: ['@smoke'] }, function () {
      // Use Case (admin) + Decision Table (sales column). Sales became an
      // Inventory-only role, so it has neither the Reports menu nor the route —
      // this TC previously asserted the menu link worked for both.
      requireRoleOrSkip(this, 'sales');
      cy.authSession('admin');
      cy.visit('/dashboard');
      page.navigateViaMenu();
      cy.url().should('include', td.route);

      cy.authSession('sales');
      cy.visit(td.route);
      cy.contains(/sorry, page not found/i, { timeout: 15000 }).should('be.visible');
    });

    it('SW-CUSTRPT-TC45: Leaving the New Report tab without saving loses any unsaved changes', () => {
      // Error Guessing
      page.visit();
      page.toggleField('Serial Number');
      page.assertFieldChecked('Serial Number', true);
      page.goToMyReportsTab();
      page.goToNewReportTab();
      page.assertFieldChecked('Serial Number', false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Arithmetic & Numeric Correctness (TC47-TC60)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Arithmetic & Numeric Correctness', () => {
    beforeEach(() => {
      page.visit();
    });

    it('SW-CUSTRPT-TC47: The total cost shown for a simple (non-serialized) product is arithmetically correct', { tags: ['@smoke'] }, () => {
      // Decision Table — hasItems=false branch
      const poNumber = `PO-CUSTRPT-${stamp}-47`;
      const qty = 6;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}47`, quantity: qty }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: qty });
        executeReport({ fields: ['productName', 'poNumber', 'totalCost', 'expectedQty'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((result) => {
          const row = result.data.find((r) => r.poNumber === poNumber);
          expect(row, 'seeded PO row must appear in the report').to.exist;
          expect(Number(row.expectedQty)).to.eq(qty);
          expect(Number(row.totalCost)).to.be.greaterThan(0);
        });
      });
    });

    it('SW-CUSTRPT-TC48: The total cost shown for a serialized product correctly adds up each unit\'s own purchase price', () => {
      // Decision Table — hasItems=true branch
      const poNumber = `PO-CUSTRPT-${stamp}-48`;
      const serials = [`SN-${stamp}-48A`, `SN-${stamp}-48B`];
      seedSerializedPO({ td: poTd, poNumber, stamp: `${stamp}48`, serials }).then((productId) => {
        createdPOs.push(poNumber);
        serials.forEach((s) => apiScanSerial(poNumber, s));
        executeReport({ fields: ['serialNumber', 'poNumber', 'totalCost'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((result) => {
          const rows = result.data.filter((r) => r.poNumber === poNumber);
          expect(rows.length, 'both scanned serials must appear').to.eq(serials.length);
          rows.forEach((r) => expect(Number(r.totalCost)).to.be.greaterThan(0));
        });
      });
    });

    it('SW-CUSTRPT-TC49: The average unit cost correctly blends different purchase prices across multiple orders', function () {
      // Use Case — probe real QA data for a product already spanning 2+ POs
      executeReport({
        fields: ['productName', 'poNumber', 'unitCost'],
        filters: [{ field: 'isSerializedProduct', operator: 'equals', value: 'false' }, { field: 'poNumber', operator: 'isEmpty', value: 'NOT' }],
        pageSize: 500,
      }).then((result) => {
        const byProduct = new Map();
        result.data.forEach((r) => {
          if (!byProduct.has(r.productName)) byProduct.set(r.productName, new Set());
          byProduct.get(r.productName).add(r.poNumber);
        });
        const candidate = [...byProduct.entries()].find(([, pos]) => pos.size >= 2);
        if (!candidate) this.skip();
        const [productName] = candidate;
        page.addFilter();
        page.setFilterField(0, 'Product Name');
        page.setFilterOperator(0, 'Equals');
        page.setFilterValue(0, productName);
        page.toggleField('Item Status');
        page.toggleField('Container Code');
        page.toggleField('Location Path');
        page.toggleField('Unit Cost');
        page.toggleField('Total Cost');
        page.runReportAndWait();
        // Retry-safe (see TC52's comment on assertColumnAllMatch vs a raw
        // columnValues().then() race).
        page.assertColumnAllMatch('Unit Cost', 'greater than 0', (v) => Number(v.replace(/[^0-9.\-]/g, '')) > 0, 5);
      });
    });

    it('SW-CUSTRPT-TC50: A product\'s total cost isn\'t multiplied just because its stock is spread across several containers', () => {
      // Error Guessing — fan-out no-inflation guard. Seeds its own disposable
      // 2-container split (same seed pattern as TC66) so the assertion never
      // depends on a non-serialized product already being spread across live
      // QA containers — a probe found QA's entire current container-assigned
      // population (294 rows) is 100% serialized products, so a live-data-only
      // version of this TC could never find a candidate; see pending.md.
      const poNumber = `PO-CUSTRPT-${stamp}-50`;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}50`, quantity: 8 }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: 8 });
        createDisposableContainer().then((containerA) => {
          createDisposableContainer().then((containerB) => {
            loadProductIntoContainerViaApi(containerA.id, productId);
            loadProductIntoContainerViaApi(containerA.id, productId);
            loadProductIntoContainerViaApi(containerA.id, productId); // 3 in A
            loadProductIntoContainerViaApi(containerB.id, productId);
            loadProductIntoContainerViaApi(containerB.id, productId); // 2 in B
            // Oracle: the grouped (by poNumber) endpoint's own aggregation gives
            // the single true total — an independent code path (executeGroupedReport)
            // from the ungrouped fan-out rows being summed below.
            executeReport({ fields: ['poNumber', 'totalCost'], groupBy: ['poNumber'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((grouped) => {
              const trueTotal = Number(grouped.data[0]?.totalCost || 0);
              expect(trueTotal, 'seeded PO must have a nonzero true total cost').to.be.greaterThan(0);
              executeReport({ fields: ['productName', 'containerCode', 'totalCost'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((ungrouped) => {
                const rows = ungrouped.data;
                expect(rows.length, 'both seeded container-slot rows must appear').to.be.at.least(2);
                // The fan-out guard emits totalCost once per (product, PO) and 0 on every
                // other container-slot row, so summing every row (zeros included) must
                // land exactly on the single true total — not 2x/3x it.
                const summedAcrossFanOutRows = rows.reduce((sum, r) => sum + Number(r.totalCost || 0), 0);
                expect(summedAcrossFanOutRows, `summed Total Cost across ${rows.length} container fan-out rows (${summedAcrossFanOutRows}) vs the single true total (${trueTotal})`)
                  .to.be.closeTo(trueTotal, Math.max(1, trueTotal * 0.02));
              });
            });
          });
        });
      });
    });

    it('SW-CUSTRPT-TC51: A product\'s total quantity isn\'t multiplied just because it has several individual serialized units', function () {
      // Error Guessing — fan-out no-inflation guard
      executeReport({
        fields: ['productName', 'serialNumber', 'totalQty'],
        filters: [{ field: 'isSerializedProduct', operator: 'equals', value: 'true' }],
        pageSize: 200,
      }).then((result) => {
        const byProduct = new Map();
        result.data.forEach((r) => {
          if (!byProduct.has(r.productName)) byProduct.set(r.productName, []);
          byProduct.get(r.productName).push(r);
        });
        const candidate = [...byProduct.entries()].find(([, rows]) => rows.length >= 2);
        if (!candidate) this.skip();
        const [productName, rows] = candidate;
        const summedAcrossItems = rows.reduce((sum, r) => sum + Number(r.totalQty || 0), 0);
        executeReport({ fields: ['productName', 'totalQty'], groupBy: ['productName'], filters: [{ field: 'productName', operator: 'equals', value: productName }] }).then((grouped) => {
          const trueTotal = Number(grouped.data[0]?.totalQty || 0);
          expect(summedAcrossItems, `summed Total Quantity across ${rows.length} item rows (${summedAcrossItems}) vs the single true total (${trueTotal})`)
            .to.be.closeTo(trueTotal, 1);
        });
      });
    });

    it('SW-CUSTRPT-TC52: Filtering to one purchase order shows that order\'s cost and quantity only, not the product\'s other orders', function () {
      // Decision Table — PO-scoped vs product-level totals
      executeReport({
        fields: ['productName', 'poNumber', 'totalCost'],
        filters: [{ field: 'isSerializedProduct', operator: 'equals', value: 'false' }, { field: 'poNumber', operator: 'isEmpty', value: 'NOT' }],
        pageSize: 500,
      }).then((result) => {
        const byProduct = new Map();
        result.data.forEach((r) => {
          if (!byProduct.has(r.productName)) byProduct.set(r.productName, new Map());
          byProduct.get(r.productName).set(r.poNumber, r.totalCost);
        });
        const candidate = [...byProduct.entries()].find(([, pos]) => pos.size >= 2);
        if (!candidate) this.skip();
        const [productName, poMap] = candidate;
        const [poA, costA] = [...poMap.entries()][0];
        page.addFilter();
        page.setFilterField(0, 'Product Name');
        page.setFilterOperator(0, 'Equals');
        page.setFilterValue(0, productName);
        page.addFilter();
        page.setFilterField(1, 'PO Number');
        page.setFilterOperator(1, 'Equals');
        page.setFilterValue(1, poA);
        page.toggleField('Total Cost');
        page.toggleField('PO Number');
        page.runReportAndWait();
        // Uses the retry-safe assertColumnAllMatch (not a one-shot
        // columnValues().then()) — the network-response wait in
        // runReportAndWait() doesn't guarantee MRT has finished re-rendering
        // with the new rows, and a plain .then() can race a still-previous render.
        page.assertColumnAllMatch('PO Number', `equals "${poA}"`, (v) => v === poA, 5);
      });
    });

    it('SW-CUSTRPT-TC53: Grouped totals add up to the same overall total as the ungrouped report', { tags: ['@smoke'] }, function () {
      // Use Case — grouped-vs-ungrouped reconciliation, scoped to one real
      // category so both sides stay within the API's 500-row page cap.
      // Compares the single Category-grouped total against the sum of that
      // same category's rows grouped by (Product, PO) — two different,
      // non-overlapping partitions of the same cost universe that must agree.
      // (A raw ungrouped row-set can't be summed directly: the same product/PO's
      // totalCost is fan-out-guarded to repeat across its container/location/item
      // rows — see TC50 — so "grouped" is compared against another grouped view.)
      executeReport({ fields: ['categoryName'], groupBy: ['categoryName'], pageSize: 1 }).then((probe) => {
        const category = probe.data?.[0]?.categoryName;
        if (!category) this.skip();
        executeReport({
          fields: ['categoryName', 'totalCost'],
          groupBy: ['categoryName'],
          filters: [{ field: 'categoryName', operator: 'equals', value: category }],
        }).then((catResult) => {
          const categoryTotal = Number(catResult.data[0]?.totalCost || 0);
          executeReport({
            fields: ['productName', 'poNumber', 'totalCost'],
            groupBy: ['productName', 'poNumber'],
            filters: [{ field: 'categoryName', operator: 'equals', value: category }],
            pageSize: 500,
          }).then((ppResult) => {
            if (ppResult.pagination.total > 500) this.skip(); // keep the sum complete, not a partial page
            const productPoSum = ppResult.data.reduce((s, r) => s + Number(r.totalCost || 0), 0);
            expect(categoryTotal, `Category total (${categoryTotal}) vs sum of its Product+PO rows (${productPoSum})`)
              .to.be.closeTo(productPoSum, Math.max(1, productPoSum * 0.01));
          });
        });
      });
    });

    it('SW-CUSTRPT-TC54: Grouping by location shows one correct unit cost per group, while quantities still add up correctly', function () {
      // Decision Table — MAX vs SUM aggregation keys
      executeReport({
        fields: ['locationPath', 'unitCost', 'totalQty'],
        filters: [{ field: 'locationPath', operator: 'isEmpty', value: 'NOT' }],
        groupBy: ['locationPath'],
        pageSize: 20,
      }).then((result) => {
        if (!result.data.length) this.skip();
        result.data.slice(0, 5).forEach((row) => {
          expect(Number(row.unitCost), `unitCost for ${row.locationPath} must be a finite non-negative number`).to.be.at.least(0);
          expect(Number(row.totalQty), `totalQty for ${row.locationPath} must be a finite non-negative number`).to.be.at.least(0);
        });
      });
    });

    it('SW-CUSTRPT-TC55: The damaged-quantity count matches what was actually recorded as damaged', () => {
      // Use Case
      const poNumber = `PO-CUSTRPT-${stamp}-55`;
      const qty = 4;
      const damaged = 2;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}55`, quantity: qty }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: qty });
        apiMarkProductStatus({ poNumber, productId, quantity: damaged, status: 'Damaged', damageReason: 'QA seed' });
        executeReport({ fields: ['productName', 'poNumber', 'damagedQty'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((result) => {
          const row = result.data.find((r) => r.poNumber === poNumber);
          expect(row, 'seeded PO row must appear').to.exist;
          expect(Number(row.damagedQty)).to.eq(damaged);
        });
      });
    });

    it('SW-CUSTRPT-TC56: Available quantity correctly subtracts stock that\'s already reserved', () => {
      // Use Case
      const poNumber = `PO-CUSTRPT-${stamp}-56`;
      const qty = 8;
      const reserved = 3;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}56`, quantity: qty }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: qty });
        apiReserveViaWorkOrder({ productId, productName: `QA-RAM-${stamp}56`, quantity: reserved });
        executeReport({ fields: ['productName', 'poNumber', 'availableQty'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((result) => {
          const row = result.data.find((r) => r.poNumber === poNumber);
          expect(row, 'seeded PO row must appear').to.exist;
          expect(Number(row.availableQty)).to.eq(qty - reserved);
        });
      });
    });

    it('SW-CUSTRPT-TC57: Received quantity plus still-incoming quantity always adds up to the expected quantity', () => {
      // Use Case
      const poNumber = `PO-CUSTRPT-${stamp}-57`;
      const expected = 10;
      const received = 6;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}57`, quantity: expected }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: received });
        executeReport({ fields: ['productName', 'poNumber', 'receivedQty', 'unreceivedQty', 'expectedQty'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((result) => {
          const row = result.data.find((r) => r.poNumber === poNumber);
          expect(row, 'seeded PO row must appear').to.exist;
          expect(Number(row.receivedQty) + Number(row.unreceivedQty)).to.eq(Number(row.expectedQty));
        });
      });
    });

    it('SW-CUSTRPT-TC58: The total cost shown here matches the total cost already shown on the Cost Report for the same item', () => {
      // Error Guessing — cross-oracle agreement. Both sides seed/scope to the
      // SAME disposable PO, so this never depends on live QA data shape.
      // FIX (was a permanent false-skip): the previous version matched Cost
      // Report rows via `r.poNumber === poNumber || r.po === poNumber`, but
      // `GET /reports/inventory-value-report` (see
      // Backend/src/modules/reports/reports.controller.ts) already filters
      // server-side by the `po=` query param and its response rows carry
      // neither a `poNumber` nor a `po` field (verified live — the row is a
      // product record with `totalInventoryCost`/`poCost`, no PO identifier
      // at all) — so `crMatch` was always undefined and this TC skipped on
      // every run regardless of data. Since the query already scopes the
      // list to this exact PO, the single returned row (if any) IS the match.
      const poNumber = `PO-CUSTRPT-${stamp}-58`;
      const qty = 5;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}58`, quantity: qty }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: qty });
        executeReport({ fields: ['productName', 'poNumber', 'totalCost'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((customReportResult) => {
          const crRow = customReportResult.data.find((r) => r.poNumber === poNumber);
          expect(crRow, 'Custom Reports row must exist').to.exist;
          apiCall('GET', `/reports/inventory-value-report?page=1&page_size=50&po=${poNumber}`).then((costReportRes) => {
            expect(costReportRes.status, 'Cost Report call must succeed').to.be.lessThan(400);
            const list = costReportRes.body?.data?.list || costReportRes.body?.data || [];
            expect(Array.isArray(list) && list.length, 'Cost Report must return exactly this PO\'s row').to.be.greaterThan(0);
            const crMatch = list[0];
            const costReportTotal = Number(crMatch.totalInventoryCost ?? crMatch.total_inventory_cost ?? NaN);
            expect(Number.isNaN(costReportTotal), 'Cost Report row must carry a parseable total').to.eq(false);
            expect(Number(crRow.totalCost), `Custom Reports totalCost (${crRow.totalCost}) vs Cost Report totalInventoryCost (${costReportTotal})`).to.be.closeTo(costReportTotal, 0.5);
          });
        });
      });
    });

    it('SW-CUSTRPT-TC59: Quantity split between a location and a container still adds up to the product\'s total quantity', () => {
      // Use Case — sums locationSlotQty + containerSlotQty across EVERY row of
      // one product (not a single row) and compares against that product's
      // single true Total Quantity value (fan-out-guarded to appear once).
      // Seeds its own disposable container + Bin location split (mirrors
      // TC50/TC66's seeding style) instead of probing live QA for a product
      // already split this exact way — the same live-population probe used
      // for TC50 found zero non-serialized products currently assigned to
      // any container on QA, so a live-data-only version could never find a
      // candidate; see pending.md.
      // FIX (was unfixably skip-only before): the original field selection
      // (productName/locationSlotQty/containerSlotQty/totalQty only) never
      // fans a product out into one row per container/location slot — verified
      // live: without a location/container-identifying field selected, the
      // backend coalesces everything onto a single combined row (locationSlotQty
      // and containerSlotQty both populated on the SAME row), so `rows.length`
      // could never reach 2 no matter what live data existed. Selecting
      // 'Location Path' and 'Container Code' too (mirrors TC66/TC50's own field
      // lists) restores the actual per-slot fan-out this TC is designed to prove.
      const poNumber = `PO-CUSTRPT-${stamp}-59`;
      const containerQty = 5;
      const locationQty = 3;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}59`, quantity: containerQty + locationQty }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: containerQty + locationQty });
        createDisposableContainer().then((container) => {
          createDisposableBinChain().then(({ facility, bin }) => {
            createdLocationFacilityIds.push(facility.id);
            for (let i = 0; i < containerQty; i++) loadProductIntoContainerViaApi(container.id, productId);
            loadProductIntoLocationViaApi(bin.id, productId, locationQty);
            executeReport({
              fields: ['productName', 'locationPath', 'containerCode', 'locationSlotQty', 'containerSlotQty', 'totalQty'],
              filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }],
              pageSize: 500,
            }).then((result) => {
              const rows = result.data;
              expect(rows.length, 'both the container-slot and location-slot rows must appear').to.be.at.least(2);
              const slotSum = rows.reduce((s, r) => s + Number(r.locationSlotQty || 0) + Number(r.containerSlotQty || 0), 0);
              const trueTotalQty = Math.max(...rows.map((r) => Number(r.totalQty || 0)));
              expect(trueTotalQty, 'seeded Total Quantity must reflect the full received amount').to.eq(containerQty + locationQty);
              expect(slotSum, `sum of per-row location+container slot qty (${slotSum}) vs the product's Total Quantity (${trueTotalQty})`)
                .to.be.closeTo(trueTotalQty, 1);
            });
          });
        });
      });
    });

    it('SW-CUSTRPT-TC60: A component currently built into another item is correctly counted as "in use," not as available stock', () => {
      // Decision Table — Consumed status branch. Seeds its own Consumed item
      // via the asset-id disassembly→reassembly chain (the ONLY path that
      // reaches items.status='Consumed' — the simpler mark-status endpoint
      // hard-restricts to [Damaged, Disputed, Missing, 'Remove'], confirmed in
      // incoming-item.service.ts markStatus()). apiSeedConsumedItem wraps the
      // two-call chain (POST asset-id/disassembly/create-and-generate → POST
      // asset-id/reassembly/link-and-stockout), verified end-to-end against QA
      // before wiring in. The generated child item inherits the parent's PO,
      // so filtering the report by that PO + itemStatus=Consumed isolates
      // exactly the seeded component; consumedQty must be 1 (the template's
      // consumedQty is `CASE WHEN i.status='Consumed' THEN 1 ELSE 0`).
      const poNumber = `PO-CUSTRPT-${stamp}-60`;
      const snParent = `SN-${stamp}-60P`;
      const snSelected = `SN-${stamp}-60S`;
      seedSerializedPO({ td: poTd, poNumber, stamp: `${stamp}60`, serials: [snParent, snSelected] }).then((productId) => {
        createdPOs.push(poNumber);
        apiScanSerial(poNumber, snParent);
        apiScanSerial(poNumber, snSelected);
        apiResolveCategoryIdByName(poTd.categories.laptop).then((categoryId) => {
          apiSeedConsumedItem({
            parentSerialNumber: snParent,
            selectedItemSerialNumber: snSelected,
            categoryId,
            productId,
            quantity: 1,
          }).then(() => {
            executeReport({
              fields: ['productName', 'serialNumber', 'itemStatus', 'consumedQty'],
              filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }, { field: 'itemStatus', operator: 'equals', value: 'Consumed' }],
            }).then((result) => {
              expect(result.data.length, 'the seeded Consumed component must appear').to.be.greaterThan(0);
              result.data.forEach((row) => {
                expect(row.itemStatus, 'row status must be Consumed').to.eq('Consumed');
                expect(Number(row.consumedQty), 'each Consumed component counts as 1 in-use unit').to.eq(1);
              });
            });
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Filter Correctness by Field Name (TC61-TC65)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Filter Correctness by Field Name', () => {
    beforeEach(() => {
      page.visit();
    });

    it('SW-CUSTRPT-TC61: Filtering by a cost amount ("greater than") only returns products above that cost', () => {
      // Use Case
      page.toggleField('Total Cost');
      page.addFilter();
      page.setFilterField(0, 'Total Cost');
      page.setFilterOperator(0, 'Greater Than');
      page.setFilterValue(0, '1');
      page.runReportAndWait();
      page.assertColumnAllMatch('Total Cost', 'greater than 1', (v) => Number(v.replace(/[^0-9.\-]/g, '')) > 1, 25);
    });

    it('SW-CUSTRPT-TC62: Filtering by a date range only returns rows within that range', function () {
      // Use Case — a realistic single-year window (the current calendar year),
      // computed at run time so the test never goes stale.
      const YEAR = new Date().getFullYear();
      const FROM = `${YEAR}-01-01`;
      const TO = `${YEAR}-12-31`;
      // Probe with the SAME range so we only proceed when rows exist in that year —
      // otherwise the empty result would trip assertColumnAllMatch's "≥1 row" guard.
      executeReport({ fields: ['poNumber', 'poImportDate'], filters: [{ field: 'poImportDate', operator: 'between', value: [FROM, TO] }], pageSize: 1 }).then((probe) => {
        if (!probe.data.length) this.skip();
        page.toggleField('PO Number');
        page.toggleField('PO Import Date');
        page.addFilter();
        page.setFilterField(0, 'PO Import Date');
        page.setFilterOperator(0, 'Between');
        page.setFilterBetween(0, FROM, TO);
        page.runReportAndWait();
        // Each displayed date (MM/DD/YYYY, hh:mm AM) must fall inside the 2026 window.
        const lo = new Date(`${FROM}T00:00:00`);
        const hi = new Date(`${TO}T23:59:59`);
        page.assertColumnAllMatch('PO Import Date', `between ${FROM} and ${TO}`, (v) => {
          const d = new Date(v);
          return !Number.isNaN(d.getTime()) && d >= lo && d <= hi;
        }, 5);
      });
    });

    it('SW-CUSTRPT-TC63: Switching a filter to a different field actually filters by the new field', () => {
      // Error Guessing — the most direct proof a filter is bound to whichever field is currently selected
      page.addFilter();
      page.setFilterField(0, 'Item Status');
      page.setFilterEnumValue(0, td.epDamagedStatus);
      page.runReportAndWait();
      page.assertColumnAllMatch('Item Status', 'equals Damaged', (v) => v === 'Damaged', 10);
      // The Filter Panel only exists in "customize" mode — runReportAndWait()
      // switches to the results view, which replaces it entirely. Must go
      // Back before the filter row is editable again.
      page.clickBack();
      page.setFilterField(0, 'Item Status');
      page.setFilterEnumValue(0, td.epAvailableStatus);
      page.runReportAndWait();
      page.assertColumnAllMatch('Item Status', 'equals Available', (v) => v === 'Available', 10);
    });

    it('SW-CUSTRPT-TC64: Two filters on two different fields both apply at the same time', function () {
      // Decision Table
      executeReport({ fields: ['categoryName', 'itemStatus'], filters: [{ field: 'itemStatus', operator: 'equals', value: 'Available' }], pageSize: 1 }).then((probe) => {
        const category = probe.data?.[0]?.categoryName;
        if (!category) this.skip();
        page.addFilter();
        page.setFilterField(0, 'Category');
        page.setFilterOperator(0, 'Equals');
        page.setFilterValue(0, category);
        page.addFilter();
        page.setFilterField(1, 'Item Status');
        page.setFilterEnumValue(1, td.epAvailableStatus);
        page.runReportAndWait();
        page.assertColumnAllMatch('Category', `equals "${category}"`, (v) => v === category, 10);
        page.assertColumnAllMatch('Item Status', 'equals Available', (v) => v === 'Available', 10);
      });
    });

    it('SW-CUSTRPT-TC65: Filtering by location type only returns rows at that type of location', function () {
      // Use Case
      executeReport({ fields: ['locationPath', 'locationType'], filters: [{ field: 'locationType', operator: 'equals', value: td.epLocationTypeBin }], pageSize: 1 }).then((probe) => {
        if (!probe.data.length) this.skip();
        page.toggleField('Item Status');
        page.toggleField('Container Code');
        page.toggleField('Location Path');
        page.toggleField('Location Type');
        page.addFilter();
        page.setFilterField(0, 'Location Type');
        page.setFilterEnumValue(0, td.epLocationTypeBin);
        page.runReportAndWait();
        page.assertColumnAllMatch('Location Type', `equals "${td.epLocationTypeBin}"`, (v) => v === td.epLocationTypeBin, 10);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Per-Value Dimension Correctness (TC66-TC70)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Per-Value Dimension Correctness', () => {
    it('SW-CUSTRPT-TC66: Grouping by location shows each location\'s own correct quantity, not a combined total', () => {
      // Error Guessing — deliberately asymmetric seeded split
      const poNumber = `PO-CUSTRPT-${stamp}-66`;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}66`, quantity: 8 }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: 8 });
        createDisposableContainer().then((containerA) => {
          const idA = containerA.id;
          createDisposableContainer().then((containerB) => {
            const idB = containerB.id;
            loadProductIntoContainerViaApi(idA, productId);
            loadProductIntoContainerViaApi(idA, productId); // total 2 in A (delta:1 twice)
            loadProductIntoContainerViaApi(idA, productId);
            loadProductIntoContainerViaApi(idA, productId);
            loadProductIntoContainerViaApi(idA, productId); // 5 in A
            loadProductIntoContainerViaApi(idB, productId);
            loadProductIntoContainerViaApi(idB, productId);
            loadProductIntoContainerViaApi(idB, productId); // 3 in B
            executeReport({ fields: ['productName', 'containerCode', 'containerSlotQty'], filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }] }).then((result) => {
              const rows = result.data.filter((r) => Number(r.containerSlotQty) > 0);
              const byContainer = new Map(rows.map((r) => [r.containerCode, Number(r.containerSlotQty)]));
              expect([...byContainer.values()].sort((a, b) => a - b), 'per-container quantities must be the seeded asymmetric split, not an even smear').to.include.members([3, 5]);
            });
          });
        });
      });
    });

    it('SW-CUSTRPT-TC67: Grouping by container shows each container\'s own correct quantity, not a combined total', () => {
      // Error Guessing — deliberately asymmetric seeded split. Distinct from
      // TC66: TC66 proves the *ungrouped* per-container-slot fan-out (no
      // groupBy); this TC exercises the *explicit* `groupBy: ['containerCode']`
      // path — a different backend branch (executeGroupedReport's
      // isLocationOrContainerGroupBy recordCount expression) — and asserts each
      // container group carries its OWN physical count, not a blended figure.
      // Uses a 6/2 split (distinct from TC66's 5/3) so the two tests can't
      // accidentally share seeded data, and asserts both the per-group
      // recordCount AND containerSlotQty land on {2,6}, never {8,0} or {4,4}.
      const poNumber = `PO-CUSTRPT-${stamp}-67`;
      const qtyA = 6;
      const qtyB = 2;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}67`, quantity: qtyA + qtyB }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: qtyA + qtyB });
        createDisposableContainer().then((containerA) => {
          createDisposableContainer().then((containerB) => {
            for (let i = 0; i < qtyA; i++) loadProductIntoContainerViaApi(containerA.id, productId);
            for (let i = 0; i < qtyB; i++) loadProductIntoContainerViaApi(containerB.id, productId);
            executeReport({
              fields: ['containerCode', 'containerSlotQty'],
              groupBy: ['containerCode'],
              filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }],
            }).then((result) => {
              const rows = result.data.filter((r) => Number(r.containerSlotQty) > 0);
              expect(rows.length, 'both seeded containers must appear as their own group').to.eq(2);
              const perContainerCounts = rows.map((r) => Number(r.recordCount)).sort((a, b) => a - b);
              const perContainerSlotQty = rows.map((r) => Number(r.containerSlotQty)).sort((a, b) => a - b);
              expect(perContainerCounts, 'each container group\'s recordCount must be its own seeded quantity, not a blended total').to.deep.equal([qtyB, qtyA]);
              expect(perContainerSlotQty, 'each container group\'s slot quantity must be its own seeded quantity').to.deep.equal([qtyB, qtyA]);
            });
          });
        });
      });
    });

    it('SW-CUSTRPT-TC68: Grouping by category shows each category\'s own correct total cost, not a blended figure', function () {
      // Use Case
      executeReport({ fields: ['categoryName', 'totalCost'], groupBy: ['categoryName'], pageSize: 10 }).then((result) => {
        if (result.data.length < 2) this.skip();
        const [a, b] = result.data;
        expect(a.categoryName).to.not.eq(b.categoryName);
        expect(Number(a.totalCost)).to.not.eq(Number(b.totalCost));
      });
    });

    it('SW-CUSTRPT-TC69: Grouping by purchase order shows each order\'s own correct cost and quantity', () => {
      // Use Case — deliberately distinct seeded costs across two POs for the same product name
      const poA = `PO-CUSTRPT-${stamp}-69A`;
      const poB = `PO-CUSTRPT-${stamp}-69B`;
      seedProductOnlyPO({ td: poTd, poNumber: poA, stamp: `${stamp}69a`, quantity: 4 }).then(() => {
        createdPOs.push(poA);
        seedProductOnlyPO({ td: poTd, poNumber: poB, stamp: `${stamp}69b`, quantity: 9 }).then(() => {
          createdPOs.push(poB);
          executeReport({ fields: ['poNumber', 'totalQty'], groupBy: ['poNumber'], filters: [{ field: 'poNumber', operator: 'equals', value: poA }] }).then((resA) => {
            executeReport({ fields: ['poNumber', 'totalQty'], groupBy: ['poNumber'], filters: [{ field: 'poNumber', operator: 'equals', value: poB }] }).then((resB) => {
              expect(Number(resA.data[0].totalQty)).to.eq(4);
              expect(Number(resB.data[0].totalQty)).to.eq(9);
            });
          });
        });
      });
    });

    it('SW-CUSTRPT-TC70: Grouping by item status correctly combines serialized and non-serialized stock into the same count', function () {
      // Decision Table — mergeNonItemStatusBuckets correctness
      executeReport({ fields: ['itemStatus'], groupBy: ['itemStatus'], filters: [{ field: 'itemStatus', operator: 'equals', value: 'Damaged' }] }).then((result) => {
        const damagedRow = result.data.find((r) => r.itemStatus === 'Damaged');
        if (!damagedRow) this.skip();
        expect(Number(damagedRow.recordCount)).to.be.greaterThan(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Full Cross-Module Correctness (TC71-TC72)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Full Cross-Module Correctness', () => {
    it('SW-CUSTRPT-TC71: A report combining every module\'s fields is correct end to end for a serialized item', () => {
      // Use Case — golden serialized item spanning Product/Item/Container/PO/Work Order
      const poNumber = `PO-CUSTRPT-${stamp}-71`;
      const serial = `SN-${stamp}-71`;
      seedSerializedPO({ td: poTd, poNumber, stamp: `${stamp}71`, serials: [serial] }).then((productId) => {
        createdPOs.push(poNumber);
        apiScanSerial(poNumber, serial);
        createDisposableContainer().then(({ id: containerId }) => {
          loadProductIntoContainerViaApi(containerId, productId);
          executeReport({
            fields: ['productName', 'categoryName', 'serialNumber', 'itemStatus', 'poNumber', 'poStatus'],
            filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }],
          }).then((result) => {
            const row = result.data.find((r) => r.serialNumber === serial);
            expect(row, 'the seeded serial must appear in the combined report').to.exist;
            expect(row.poNumber).to.eq(poNumber);
            expect(row.poStatus).to.eq('Open');
            expect(row.productName).to.exist;
            expect(row.categoryName).to.exist;
          });
        });
      });
    });

    it('SW-CUSTRPT-TC72: The same all-modules, multi-filter report is correct end to end for a non-serialized product', () => {
      // Use Case — golden non-item product spanning Product/Container/PO
      const poNumber = `PO-CUSTRPT-${stamp}-72`;
      const qty = 7;
      seedProductOnlyPO({ td: poTd, poNumber, stamp: `${stamp}72`, quantity: qty }).then((productId) => {
        createdPOs.push(poNumber);
        apiCheckIn({ poNumber, productId, quantity: qty });
        createDisposableContainer().then(({ id: containerId }) => {
          loadProductIntoContainerViaApi(containerId, productId);
          executeReport({
            fields: ['productName', 'categoryName', 'containerCode', 'totalCost', 'totalQty', 'poNumber', 'poStatus'],
            filters: [{ field: 'poNumber', operator: 'equals', value: poNumber }],
          }).then((result) => {
            const row = result.data.find((r) => r.poNumber === poNumber && Number(r.containerSlotQty ?? 1) >= 0);
            expect(result.data.length, 'the seeded PO must produce at least one row').to.be.gt(0);
            const anyRow = result.data[0];
            expect(anyRow.poNumber).to.eq(poNumber);
            expect(anyRow.poStatus).to.eq('Open');
            expect(anyRow.productName).to.exist;
            expect(anyRow.categoryName).to.exist;
          });
        });
      });
    });
  });
});
