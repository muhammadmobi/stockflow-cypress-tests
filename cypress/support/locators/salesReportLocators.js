const salesReportLocators = {
  // ── Search ──────────────────────────────────────────────────────────────────
  searchInput: () => cy.get('input#searchInputRef'),
  searchButton: () => cy.findByRole('button', { name: /^search$/i }),

  // ── Stat Cards ───────────────────────────────────────────────────────────────
  totalSaleValueCard: () => cy.contains('Total Sale Value').parents('[class*="MuiPaper"], [class*="MuiCard"], [class*="StatCard"]').first(),
  totalQtySoldCard: () => cy.contains('Total Qty Sold').parents('[class*="MuiPaper"], [class*="MuiCard"], [class*="StatCard"]').first(),

  // ── Date Range Preset ────────────────────────────────────────────────────────
  dateRangePresetSelect: () => cy.get('#date-range-preset'),
  dateRangePresetOption: (label) => cy.findByRole('option', { name: new RegExp(`^${label}$`, 'i') }),

  // ── Custom Date Pickers ────────────────────────────────────────────────────
  startDatePickerGroup: () =>
    cy.contains('fieldset legend span', 'Start Date')
      .closest('[role="group"]'),
  endDatePickerGroup: () =>
    cy.contains('fieldset legend span', 'End Date')
      .closest('[role="group"]'),

  // ── PO Filter ────────────────────────────────────────────────────────────────
  // react-select component reused from IncommingInventory/PoList (same id used
  // by the Cost Report suite for the identical component instance).
  poDropdownValue: () =>
    cy.get('#Incomming-inventory-P-O-1')
      .closest('[class*="-container"]'),
  poDropdownOption: (name) =>
    cy.get('[class*="-menu"]').contains('[class*="-option"]', name),

  // ── Category Filter ──────────────────────────────────────────────────────────
  categorySelect: () => cy.get('#category-select'),

  // ── Reason Filter ─────────────────────────────────────────────────────────────
  reasonSelect: () => cy.get('#reason-select'),
  // Match by data-value (the option VALUE, e.g. "StockedOut") — NOT by visible
  // label, which differs ("Stocked Out", with a space) exactly like Cost
  // Report's statusOption convention.
  reasonOption: (value) => cy.get(`[role="listbox"] [data-value="${value}"]`),

  // ── Table ─────────────────────────────────────────────────────────────────────
  tableContainer: () => cy.get('.MuiTableContainer-root'),
  tableRows: () => cy.get('.MuiTableContainer-root').first().find('tbody tr'),
  tableHeaderCell: (label) => cy.get('.MuiTableContainer-root').first().find('thead th').contains(label),
  tableHeaderCells: () => cy.get('.MuiTableContainer-root').first().find('thead th'),
  firstRowFirstCellText: () => cy.get('.MuiTableContainer-root').first().find('tbody tr').eq(0).find('td').eq(0),

  // ── Generic MUI Select listbox (Category / Reason) ──────────────────────────
  selectListboxOptions: () => cy.get('[role="listbox"] [role="option"]'),

  // ── Pagination ────────────────────────────────────────────────────────────────
  paginationSummary: () => cy.findByText(/record:/i),
  nextPageButton: () => cy.findByRole('button', { name: /next page/i }),
  pageSizeDropdown: () => cy.findByRole('combobox', { name: /rows per page/i }),
  pageSizeOption: (value) => cy.findByRole('option', { name: String(value) }),

  // ── Export ────────────────────────────────────────────────────────────────────
  exportButton: () => cy.findByRole('button', { name: /^export$/i }),

  // ── Mobile card view ─────────────────────────────────────────────────────────
  mobileCards: () => cy.get('.MuiCard-root'),
};

export default salesReportLocators;
