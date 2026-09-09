// cypress/support/locators/InventoryAudit/auditsListLocators.js
//
// Locators for the audits list at /abc/audits
// (cypress/e2e/InventoryAudit/01-AuditsListTests.cy.js).
// Component: Frontend/src/components/ABC/AuditsList.tsx
//
// Selector strategy, and why:
//   - The screen has NO data-testid attributes and MaterialReactTable rows carry
//     no id, so rows are addressed by index after a filter/search has narrowed
//     the table (the same approach as the inventory suite —
//     feedback_cypress_product_only_search).
//   - The five filter dropdowns are MUI `TextField select` — each renders a
//     div[role="combobox"] and they are otherwise IDENTICAL (no label, no name).
//     They are therefore addressed by ORDER, which is fixed in the component:
//     status, audit type, class, location, worker. `filterByIndex` exists so a
//     reordering breaks one obvious helper rather than five scattered selectors.
//   - The options render into a MUI portal at the document root, so option
//     queries are global (`cy.get('[role="listbox"]')`), never scoped to the
//     trigger (feedback_cypress_mui_select_combobox).
//   - The row actions IconButton is the only element on the screen with an
//     explicit aria-label ("Audit actions") — use it, never the Iconify name,
//     because the Iconify registry is a closed allow-list and icon names churn.

/** Filter dropdown order as rendered by AuditsList.tsx. */
export const FILTER = {
  status: 0,
  auditType: 1,
  abcClass: 2,
  location: 3,
  worker: 4,
};

/** Column header text, in render order (drives the column-order assertion). */
export const COLUMNS = [
  'Name',
  'Audit Type',
  'Class',
  'Location',
  'Assigned Worker',
  'Bins',
  'Status',
  'Variance',
  'Created',
  'Actions',
];

/** Summary stat-card labels, in render order. */
export const STAT_CARDS = ['Open', 'In Progress', 'Pending Review', 'Completed', 'Accuracy'];

const auditsListLocators = {
  // ── Page chrome ─────────────────────────────────────────────────────────
  pageHeading: () => cy.findByRole('heading', { name: /^audits$/i }),
  pageSubtitle: () => cy.contains('All inventory audits and bin counts.'),
  settingsButton: () => cy.findByRole('button', { name: /^settings$/i }),
  createAuditButton: () => cy.findByRole('button', { name: /^create audit$/i }),

  // ── Summary cards ───────────────────────────────────────────────────────
  // Each card is a `<Card variant="outlined">` holding a body2 label and an h4
  // value. Scope to the card that contains the label, then read its h4.
  statCard: (label) =>
    cy
      .get('.MuiCard-root')
      .filter((_i, el) => new RegExp(`^${label}$`, 'i').test(Cypress.$(el).find('p,span').first().text().trim()))
      .first(),
  statCardValue: (label) => auditsListLocators.statCard(label).find('h4'),

  // ── Search ──────────────────────────────────────────────────────────────
  searchInput: () => cy.findByPlaceholderText(/search audits/i),
  // The Search button is a submit inside the same form as the input. Scoped to
  // the form so it can never resolve to a table-cell "Search" text.
  searchSubmit: () => cy.get('form').findByRole('button', { name: /^search$/i }),

  // ── Filters ─────────────────────────────────────────────────────────────
  /** The Nth filter combobox — use the FILTER map, never a bare number. */
  filterByIndex: (index) => cy.get('[role="combobox"]').eq(index),
  /** Options of the currently-open select (MUI renders them in a portal). */
  openOptionList: () => cy.get('[role="listbox"]'),
  option: (label) => cy.get('[role="listbox"]').findByRole('option', { name: label }),

  // ── Table ───────────────────────────────────────────────────────────────
  table: () => cy.get('table'),
  columnHeaders: () => cy.get('table thead th'),
  /** A column's header cell. */
  columnHeader: (name) => cy.get('table thead th').contains(name).closest('th'),
  /**
   * MaterialReactTable's sort toggle. Verified against the rendered DOM on
   * 2026-08-18: it is a `<span role="button" class="MuiTableSortLabel-root">`
   * INSIDE the header cell, so clicking the `<th>` itself does nothing and a
   * `find('button')` check finds nothing either — which would make a
   * "column is not sortable" assertion pass on a sortable column. Target this.
   *
   * Note the class list is NOT a state signal: MRT renders `Mui-active` and
   * `MuiTableSortLabel-directionAsc` on every column regardless of the current
   * sort, so read the row order to verify a sort, never these classes.
   */
  sortControl: (name) =>
    cy.get('table thead th').contains(name).closest('th').find('.MuiTableSortLabel-root'),
  rows: () => cy.get('table tbody tr'),
  row: (index) => cy.get('table tbody tr').eq(index),
  /** One cell of one row, by the column's position in COLUMNS. */
  cell: (rowIndex, columnName) =>
    cy
      .get('table tbody tr')
      .eq(rowIndex)
      .find('td')
      .eq(COLUMNS.indexOf(columnName)),
  emptyFallback: () => cy.get('table').parent().contains(/no audits/i),

  // ── Pagination ──────────────────────────────────────────────────────────
  recordCounter: () => cy.contains(/^Record:/),
  rowsPerPageSelect: () => cy.get('[role="combobox"]').last(),

  // ── Row actions menu ────────────────────────────────────────────────────
  actionsButton: (rowIndex) =>
    cy.get('table tbody tr').eq(rowIndex).findByRole('button', { name: /audit actions/i }),
  // The menu renders into a portal; scope every item query to [role="menu"]
  // (feedback_cypress_confirmation_dialog_buttons).
  menu: () => cy.get('[role="menu"]'),
  menuItem: (name) => cy.get('[role="menu"]').findByRole('menuitem', { name }),

  // ── Cancel confirmation dialog ──────────────────────────────────────────
  cancelDialog: () => cy.findByRole('dialog'),
  cancelDialogTitle: () => cy.findByRole('dialog').contains(/cancel audit\?/i),
  keepAuditButton: () => cy.findByRole('dialog').findByRole('button', { name: /keep audit/i }),
  confirmCancelButton: () =>
    cy.findByRole('dialog').findByRole('button', { name: /^cancel audit$/i }),
};

export default auditsListLocators;
