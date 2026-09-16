// Locators for the Custom Reports feature (cypress/qa/testPlans/Reports/customReport/plan.md).
// Mirrors repo conventions: testing-library queries for accessible-name-bearing
// controls (@testing-library/cypress/add-commands, registered in commands.js),
// the `.MuiTableContainer-root` structural pattern for MaterialReactTable output
// (see CostReportPage.js), and Tooltip-as-accessible-name for icon-only buttons
// (see warehouseContainersLocators.js).

const esc = (s) => Cypress._.escapeRegExp(s);

const CustomReportLocators = {
  // ── Navigation ──────────────────────────────────────────────────────────
  reportsNavGroup: () => cy.contains('[class*="MuiListItemButton"], li, a', /^Reports$/),
  customReportsNavLink: () => cy.findByRole('link', { name: /^Custom Reports$/i }),

  // ── Tabs (New Report / My Reports) ─────────────────────────────────────
  tabs: '[role="tab"]',

  // ── Field Selector ──────────────────────────────────────────────────────
  fieldSearchInput: () => cy.get('input[placeholder="Search fields..."]'),
  fieldsCountLabel: () => cy.contains(/^Fields \(\d+\/\d+\)$/),
  selectAllCheckbox: () => cy.findByRole('checkbox', { name: /^Select All$/i }),
  // Group header caption Typography, e.g. "ITEM (8)" — group headers render
  // uppercase via CSS text-transform but textContent stays as authored ("Item (8)").
  groupHeaderCaption: (group) =>
    cy.contains('.MuiTypography-caption', new RegExp('^' + esc(group) + '\\s*\\(\\d+\\)$', 'i')),
  // The group checkbox is a bare <Checkbox> (no wrapping <label>), so it carries
  // no accessible name — locate structurally via the sibling caption's container.
  groupHeaderCheckbox: (group) =>
    CustomReportLocators.groupHeaderCaption(group).parent().find('input[type="checkbox"]'),
  groupExpandCollapseBtn: (group) =>
    CustomReportLocators.groupHeaderCaption(group).parent().find('button'),
  // Individual field checkboxes are wrapped in FormControlLabel, so the
  // accessible name is "<label> (<type>)" — anchor on the label prefix.
  fieldCheckbox: (label) =>
    cy.findByRole('checkbox', { name: new RegExp('^' + esc(label) + '\\s*\\(', 'i') }),

  // ── Filter Panel ─────────────────────────────────────────────────────────
  filtersCountLabel: () => cy.contains(/^Filters \(\d+\)$/),
  addFilterBtn: () => cy.findByRole('button', { name: /^Add Filter$/i }),
  noFiltersMessage: () => cy.contains('No filters applied'),
  filterFieldSelect: (index) => cy.findAllByLabelText(/^Field$/i).eq(index),
  filterOperatorSelect: (index) => cy.findAllByLabelText(/^Operator$/i).eq(index),
  // Row container: climb from the Field select to the outer per-row Box
  // (p:1.5, border) — the only ancestor between the input and that Box which
  // carries MUI's own "MuiBox-root" marker class.
  filterRow: (index) =>
    CustomReportLocators.filterFieldSelect(index).closest('div.MuiBox-root'),
  filterDeleteBtn: (index) => CustomReportLocators.filterRow(index).find('button'),
  // Single (non-Between, non-Is-Empty) value input for a row.
  filterValueInput: (index) =>
    CustomReportLocators.filterRow(index).find('input[placeholder="Value"]'),
  filterFromInput: (index) => CustomReportLocators.filterRow(index).find('input[placeholder="From"]'),
  filterToInput: (index) => CustomReportLocators.filterRow(index).find('input[placeholder="To"]'),
  // A filter row has THREE role="combobox" elements when the operator is an
  // enum value-select: Field, Operator, then the unlabeled value TextField
  // (it has no `label` prop — see FilterPanel.tsx). Field/Operator always
  // render first per the row's Stack order, so the value-select is the last.
  filterEnumValueSelect: (index) => CustomReportLocators.filterRow(index).find('[role="combobox"]').last(),

  // ── Group By ──────────────────────────────────────────────────────────────
  groupByLabel: () => cy.contains('Group By'),
  groupByAutocompleteInput: () =>
    cy.contains('Group By').parent().parent().find('input'),
  groupByHelperText: () => cy.contains('Numeric fields will be summed per group'),
  groupByChip: (label) => cy.get('.MuiChip-root').contains(label),

  // ── Column Order ──────────────────────────────────────────────────────────
  columnOrderHeading: () => cy.contains('Column Order (drag to reorder)'),
  columnOrderItem: (label) => cy.contains('Column Order (drag to reorder)').parent().contains(label),

  // ── Action bar ────────────────────────────────────────────────────────────
  runReportBtn: () => cy.findByRole('button', { name: /^Run Report$/i }),
  saveAsBtn: () => cy.findByRole('button', { name: /^Save As$/i }),

  // ── Save dialog ───────────────────────────────────────────────────────────
  saveDialog: () => cy.findByRole('dialog'),
  reportNameInput: () => cy.findByRole('dialog').find('input[type="text"], input:not([type])').first(),
  saveDialogSaveBtn: () => cy.findByRole('dialog').findByRole('button', { name: /^Save$/i }),
  saveDialogCancelBtn: () => cy.findByRole('dialog').findByRole('button', { name: /^Cancel$/i }),

  // ── Report Runner (run view) ─────────────────────────────────────────────
  // Exact match, not a prefix: a global "Background tasks" icon button's
  // aria-label also starts with "Back", which /^Back/i would incorrectly match too.
  backBtn: () => cy.findByRole('button', { name: /^Back$/i }),
  // Edit-mode-only button (CustomReportsPage.tsx renders no Tabs at all while
  // view.type === 'edit' — only this button, which triggers handleBack() to
  // return to the tabbed view with My Reports selected).
  backToMyReportsBtn: () => cy.findByRole('button', { name: /^Back to My Reports$/i }),
  exportBtn: () => cy.findByRole('button', { name: /^Export$/i }),
  runnerTableContainer: () => cy.get('.MuiTableContainer-root').first(),
  runnerTableHeaders: () => cy.get('.MuiTableContainer-root').first().find('thead th'),
  runnerTableRows: () => cy.get('.MuiTableContainer-root').first().find('tbody tr'),
  paginationSummary: () => cy.contains(/^Record:\s/i),
  nextPageBtn: () => cy.findByRole('button', { name: /next page/i }),
  previousPageBtn: () => cy.findByRole('button', { name: /previous page/i }),
  // The real clickable trigger carries no id at all (only the paired hidden
  // native <input> does, id="mrt-rows-per-page-...") — it's a
  // role="combobox" div identified by aria-label instead. Verified against
  // the actual rendered DOM (not assumed).
  rowsPerPageSelect: () => cy.get('[role="combobox"][aria-label="Rows per page"]'),
  // The clickable element is MRT's inner MuiTableSortLabel span
  // (class="MuiTableSortLabel-root"), not the outer <th> (no handler of its
  // own). Its aria-label text changes format once it becomes the active sort
  // column ("Sort by X ascending" -> "X Sorted by X ascending"), so target it
  // structurally via the stable CSS class scoped to the right <th> instead of
  // matching that shifting accessible name.
  sortableColumnHeader: (label) =>
    cy.get('.MuiTableContainer-root').first().find('thead th')
      .filter((_, el) => new RegExp('^' + esc(label), 'i').test(el.textContent.trim()))
      .find('.MuiTableSortLabel-root'),
  noRecordsMessage: () => cy.contains(/No records found/i),

  // ── My Reports (SavedReportsList) ─────────────────────────────────────────
  savedReportsTableContainer: () => cy.get('.MuiTableContainer-root').first(),
  savedReportRow: (name) => cy.contains('.MuiTableContainer-root tbody tr', name),
  emptyStateMessage: () => cy.contains('No saved reports yet'),
  savedReportsCountFooter: () => cy.contains(/saved report\(s\)$/i),

  // ── Delete confirmation dialog ────────────────────────────────────────────
  deleteDialog: () => cy.findByRole('dialog'),
  deleteDialogTitle: () => cy.findByRole('dialog').contains('Delete Report'),
  deleteDialogCancelBtn: () => cy.findByRole('dialog').findByRole('button', { name: /^Cancel$/i }),
  deleteDialogConfirmBtn: () => cy.findByRole('dialog').findByRole('button', { name: /^Delete$/i }),
};

export default CustomReportLocators;
