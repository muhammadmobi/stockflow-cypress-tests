const costReportLocators = {
  // ── Search ──────────────────────────────────────────────────────────────────
  searchInput: () => cy.get('input#searchInputRef'),
  searchButton: () => cy.findByRole('button', { name: /^search$/i }),

  // ── Stat Card ────────────────────────────────────────────────────────────────
  // The "Total Inventory Cost" summary card at the top of the page
  totalInventoryCostCard: () => cy.contains('Total Inventory Cost').parents('[class*="MuiPaper"], [class*="MuiCard"], [class*="StatCard"]').first(),

  // ── Date Range Preset ────────────────────────────────────────────────────────
  dateRangePresetSelect: () => cy.get('#date-range-preset'),
  dateRangePresetOption: (label) => cy.findByRole('option', { name: new RegExp(label, 'i') }),

  // ── Custom Date Pickers ────────────────────────────────────────────────────
  // MUI v7 DatePicker renders a role="group" container with individual
  // role="spinbutton" spans for Month, Day, Year — not a plain <input>.
  // Scope by the legend text inside the fieldset to avoid ambiguity.
  startDatePickerGroup: () =>
    cy.contains('fieldset legend span', 'Start Date')
      .closest('[role="group"]'),
  endDatePickerGroup: () =>
    cy.contains('fieldset legend span', 'End Date')
      .closest('[role="group"]'),
  datePickerSection: (group, ariaLabel) =>
    group.find(`[role="spinbutton"][aria-label="${ariaLabel}"]`),

  // ── PO Filter ────────────────────────────────────────────────────────────────
  // react-select component with ID "Incomming-inventory-P-O-1".
  // poDropdownValue reads whichever text the control is currently showing —
  // either the placeholder (when nothing is selected) or the singleValue.
  poDropdownValue: () =>
    cy.get('#Incomming-inventory-P-O-1')
      .closest('[class*="-container"]'),
  poDropdownOption: (name) =>
    cy.get('[class*="-menu"]').contains('[class*="-option"]', name),

  // ── Category Filter ──────────────────────────────────────────────────────────
  categorySelect: () => cy.get('#category-select'),
  // MUI MenuItem options carry a data-value attribute matching the category id.
  // Using data-value avoids matching by display text which varies per environment.
  categoryOption: (id) => cy.get(`[role="listbox"] [data-value="${id}"]`),

  // ── Status Filter ────────────────────────────────────────────────────────────
  statusSelect: () => cy.get('#status-select'),
  // Match the MUI MenuItem by its data-value attribute (matching categoryOption),
  // NOT by accessible name: the option VALUE ("StockedOut") differs from its
  // visible LABEL ("Stocked Out", with a space), so a name-regex on the value
  // never matches that option.
  statusOption: (value) => cy.get(`[role="listbox"] [data-value="${value}"]`),

  // ── Table ─────────────────────────────────────────────────────────────────────
  tableRows: () => cy.get('.MuiTableContainer-root').first().find('tbody tr'),

  // ── Pagination ────────────────────────────────────────────────────────────────
  paginationSummary: () => cy.findByText(/record:/i),
  nextPageButton: () => cy.findByRole('button', { name: /next page/i }),
  pageSizeDropdown: () => cy.findByRole('combobox', { name: /rows per page/i }),
  pageSizeOption: (value) => cy.findByRole('option', { name: String(value) }),

  // ── Export ────────────────────────────────────────────────────────────────────
  exportMenuButton: () => cy.findByRole('button', { name: /^export$/i }),

  // ── Group By ──────────────────────────────────────────────────────────────────
  groupByInput: () => cy.findByLabelText(/^Group By$/i),
  groupByOption: (label) => cy.get('[role="listbox"]').contains('li', label),
  groupingChip: (label) => cy.get('[class*="MuiChip-root"]').contains(label),
  groupingChipDelete: (label) =>
    cy.get('[class*="MuiChip-root"]').contains(label).parents('[class*="MuiChip-root"]').find('svg'),

  // ── Column Customization ─────────────────────────────────────────────────────
  // MUI icons don't emit a data-testid in this (production) build, and the
  // Tooltip wrapping the IconButton only sets aria-describedby on hover — so
  // there's no static accessible name to query by. The button is instead
  // located structurally: it's the sibling button rendered immediately after
  // the Export button's own Stack, inside their shared flex Box.
  customizeColumnsButton: () =>
    cy.contains('button', /^export$/i).parents('.MuiStack-root').first().parent().find('button').last(),
  customizeColumnsModal: () => cy.contains(/Columns setting for category/i).closest('[role="dialog"], .MuiDialog-paper, form'),
  // FormControlLabel renders <label><input type=checkbox/><span>{text}</span></label> —
  // click the label (not the hidden checkbox input) per existing suite convention.
  // Scoped to #attribute-form (InvnetoryListViewsForm) — unscoped, an
  // attribute name like "Category" also matches the page's own unrelated
  // "Category" filter-dropdown <label> outside the modal.
  columnLabel: (name) => cy.get('#attribute-form').contains('label', new RegExp(`^${Cypress._.escapeRegExp(name)}$`)),
  // The "Selected Columns" chip row at the top of the modal mirrors every
  // currently-selected column (core report columns like Avg Cost/Total
  // Inventory Cost/Product Name have NO checkbox in the attribute grid below —
  // they only exist as a deletable chip here; attribute-backed columns like
  // Category appear as both a chip and a checkbox). The chip is therefore the
  // one mechanism that works to deselect ANY column.
  selectedColumnChip: (name) =>
    cy.get('[role="dialog"], .MuiDialog-paper').first().contains('.MuiChip-root', new RegExp(`^${Cypress._.escapeRegExp(name)}$`)),
  customizeColumnsSaveButton: () => cy.get('button[form="attribute-form"]').contains('Save'),

  // ── Table (sort) ──────────────────────────────────────────────────────────────
  tableHeaderCell: (label) => cy.get('.MuiTableContainer-root').first().find('thead th').contains(label),
};

export default costReportLocators;
