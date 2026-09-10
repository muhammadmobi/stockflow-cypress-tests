// cypress/support/locators/InventoryAudit/classificationLocators.js
//
// Locators for /abc/classification — the module shell, the summary cards, and
// both grids (cypress/e2e/InventoryAudit/07-* and 08-*).
// Components: Frontend/src/components/ABC/{index,AbcSummaryCards,ByCategoryTab,
//             ByProductTab,AbcClassChip}.tsx
//
// Selector strategy, and the traps behind it (all verified against the rendered
// DOM while authoring the audits slice — see ../../../qa/testPlans/inventoryAudit/plan.md §13):
//
//   - **Class options are labelled "Class A", not "A".** An anchored /^A$/ matches
//     nothing. Use CLASS_OPTION.
//   - **The product override control has a fourth option, "Inherit from category"**,
//     rendered as an <em>; the category control has only three. A test asserting
//     "three options" is wrong on one of the two grids.
//   - **Both grids are MaterialReactTable**, so a sort toggle is a
//     span[role="button"].MuiTableSortLabel-root inside the header cell, and rows
//     carry no id — address them by index after narrowing.
//   - **Toasts carry no aria role in this app.** Reuse auditToastLocators.
//   - Row selection checkboxes ARE real checkboxes here (MRT renders
//     input[type=checkbox]), unlike the MUI Switches elsewhere in the module.

/** Option label for a class in either AbcClassSelect. */
export const CLASS_OPTION = (abcClass) => new RegExp(`^class ${abcClass}$`, 'i');

/** The extra option the By-Product override control offers. */
export const INHERIT_OPTION = /inherit from category/i;

/** Summary-card class order, as AbcSummaryCards renders them. */
export const SUMMARY_CLASSES = ['A', 'B', 'C'];

/** Category grid columns, in render order. */
export const CATEGORY_COLUMNS = ['Category', 'Products', 'Overrides', 'Class'];

/** Product grid columns, in render order (after MRT's selection column). */
export const PRODUCT_COLUMNS = ['Product', 'Category', 'On hand', 'Effective class', 'Override'];

/** Source-chip labels — ABC_CLASS_SOURCE_LABELS in Frontend/src/enum/abcAudit.ts. */
export const SOURCE_LABEL = {
  Overridden: 'Overridden',
  Auto: 'Auto',
  Inherited: 'Inherited',
  Default: 'Default',
};

/**
 * Which position each By-Product filter occupies, in render order.
 *
 * Exported so a spec can name the filter it means (`'class'`) instead of
 * hardcoding `.eq(1)`. The index is a DOM fact, so it belongs here beside the
 * selector that depends on it — adding a fourth filter is then a one-line change.
 */
export const FILTER_INDEX = { category: 0, class: 1, source: 2 };

const classificationLocators = {
  // ── Module shell ────────────────────────────────────────────────────────
  tab: (label) => cy.findByRole('tab', { name: label }),
  tabs: () => cy.findAllByRole('tab'),
  selectedTab: () => cy.get('[role="tab"][aria-selected="true"]'),

  // ── Summary cards ───────────────────────────────────────────────────────
  // Each card holds an AbcClassChip ("A"/"B"/"C") plus the unit and SKU figures.
  /**
   * A class card, found by the "Class A" caption it renders.
   *
   * NOT by a leading letter. `AbcSummaryCards` puts an `AbcClassChip` (the bare
   * letter) immediately before a `Class {x}` caption, so the card's text reads
   * `AClass A500units on hand (50%) · 10 products` — and while the summary query is
   * in flight it is just `AClass A`, because the figures are a Skeleton. An anchored
   * `^A\b` can never match either form: the character after the chip letter is `C`,
   * which is a word character, so there is no boundary. Verified against the
   * rendered DOM on 2026-08-20.
   *
   * `Class A` is unambiguous across the three cards, and `.first()` keeps a
   * By-Product row whose override select also reads "Class C" from winning — the
   * summary cards are always earlier in the DOM.
   */
  summaryCard: (abcClass) =>
    cy
      .get('.MuiCard-root')
      .filter((_i, el) => Cypress.$(el).text().includes(`Class ${abcClass}`))
      .first(),
  summaryCards: () => cy.get('.MuiCard-root'),

  // ── Grids (both tabs render one <table>) ────────────────────────────────
  table: () => cy.get('table'),
  columnHeaders: () => cy.get('table thead th'),
  rows: (options = {}) => cy.get('table tbody tr', options),
  row: (index) => cy.get('table tbody tr').eq(index),
  /** MRT's sort toggle — a span, never a <button>. */
  sortControl: (name) =>
    cy.get('table thead th').contains(name).closest('th').find('.MuiTableSortLabel-root'),

  // ── By Category ─────────────────────────────────────────────────────────
  categoryHint: () => cy.contains(/set a class here and every product in the category inherits it/i),
  categoryLoadError: () => cy.contains(/could not load categories/i),
  categoryFooter: () => cy.contains(/showing .* of .* categories|^no categories$/i),
  /** The class control on a category row (no inherit option). */
  categoryClassSelect: (rowIndex) => cy.get('table tbody tr').eq(rowIndex).find('[role="combobox"]'),
  /**
   * The class select on the row for a NAMED category.
   *
   * Row index is meaningless for the live round trip (TC10): the grid holds
   * whatever the tenant has, in whatever order, so the test captures a real
   * category and must find its row by name.
   */
  categoryClassSelectByName: (name) =>
    cy.contains('table tbody tr td', name).parent().find('[role="combobox"]'),
  /** The Overrides cell — "None", or a counted chip. */
  overridesCell: (rowIndex) =>
    cy
      .get('table tbody tr')
      .eq(rowIndex)
      .find('td')
      .eq(CATEGORY_COLUMNS.indexOf('Overrides')),

  // ── By Product ──────────────────────────────────────────────────────────
  productSearchInput: () => cy.findByPlaceholderText(/search product name/i),
  /**
   * The four filter controls in render order: category, class, source — plus the
   * search submit. They are unlabelled MUI selects, so order is the only handle,
   * exactly as on the audits list.
   */
  productFilter: (index) => cy.get('[role="combobox"]').eq(index),
  /**
   * Which position each By-Product filter occupies. Exported so a spec can name
   * the filter it means (`'class'`) instead of hardcoding `.eq(1)` — the index is
   * a DOM fact and belongs here, beside the selector that depends on it.
   */
  /** Options render into a portal listbox. */
  openOptionList: () => cy.get('[role="listbox"]'),
  option: (name) => cy.get('[role="listbox"]').findByRole('option', { name }),

  /** A product row's cell, by column name. */
  productCell: (rowIndex, columnName) =>
    cy
      .get('table tbody tr')
      .eq(rowIndex)
      .find('td')
      .filter((_i, el) => true)
      .eq(PRODUCT_COLUMNS.indexOf(columnName) + 1), // +1 for MRT's selection column

  /** The override control on a product row (has the inherit option). */
  overrideSelect: (rowIndex) =>
    cy.get('table tbody tr').eq(rowIndex).find('[role="combobox"]'),

  /** MRT's select-all checkbox, in the header row. */
  selectAllCheckbox: () => cy.get('table thead input[type="checkbox"]').first(),

  rowCheckbox: (rowIndex) =>
    cy.get('table tbody tr').eq(rowIndex).find('input[type="checkbox"]'),

  // ── Bulk bar (only rendered while a row is selected) ───────────────────
  // Takes options so the over-cap case (TC28) can wait longer — see `bulkClassSelect`.
  bulkSelectedCount: (options) => cy.contains(/^\d+ selected$/, options),
  /**
   * The bulk bar's class select. Takes options so the over-cap case can wait
   * longer: selecting 1001 rows re-renders every one of them (MRT is not
   * virtualised here), which does not finish inside the default timeout.
   */
  bulkClassSelect: (options = {}) => cy.findByLabelText(/assign class/i, options),
  bulkApplyButton: () => cy.findByRole('button', { name: /^apply to \d+$/i }),
  bulkClearButton: () => cy.findByRole('button', { name: /^clear overrides$/i }),
};

export default classificationLocators;
