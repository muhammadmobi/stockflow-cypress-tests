// Locators for /reports/inventory-report (Frontend/src/components/Reports/InventoryReport/index.tsx).
// Mirrors costReportLocators.js's conventions/ids where the two screens
// share DOM structure (same PoList component, same category/status Select
// ids, same Group By Autocomplete, same Export/Customize-Columns layout),
// and adds the As-of Date selector + badge this screen alone has.
const inventoryReportLocators = {
  // ── Search ──────────────────────────────────────────────────────────────────
  searchInput: () => cy.get('input#searchInputRef'),
  searchButton: () => cy.findByRole('button', { name: /^search$/i }),

  // ── Stat Card ────────────────────────────────────────────────────────────────
  // "Total Ending Inventory Cost" — value renders as a sibling
  // Typography(variant="subtitle1") inside the same Card (src/pages/Dashboard's
  // StatCard), not inline with the title like Cost Report's own inline StatCard.
  totalEndingInventoryCostCard: () =>
    cy.contains('Total Ending Inventory Cost').closest('.MuiCard-root'),
  totalEndingInventoryCostValue: () =>
    cy.contains('Total Ending Inventory Cost').closest('.MuiCard-root').find('.MuiTypography-subtitle1'),

  // ── As-of Date ───────────────────────────────────────────────────────────────
  asOfPresetSelect: () => cy.get('#as-of-date-preset'),
  asOfPresetOption: (label) => cy.findByRole('option', { name: new RegExp(`^${label}$`, 'i') }),
  // The As-of Date PRESET select (always rendered) and the Custom DatePicker
  // (only rendered once "Custom" is selected) both carry a fieldset legend
  // reading "As-of Date" — cy.contains() matches the preset select's first,
  // whose fieldset has no [role="group"] ancestor, so that scoping always
  // times out. Anchor on the DatePicker's own "Choose date" button instead —
  // it only exists once the Custom picker has actually rendered.
  asOfDatePickerGroup: () => cy.get('button[aria-label="Choose date"]').closest('.MuiFormControl-root'),
  // Badge + Clear button rendered beneath/beside the preset once a non-Today
  // As-of Date is active.
  asOfBadge: () => cy.contains('span', 'As-of:').parent(),
  asOfClearButton: () => cy.contains('button', /^clear$/i),
  datePickerNextMonthButton: () => cy.get('button[aria-label="Next month"]'),

  // ── PO Filter ────────────────────────────────────────────────────────────────
  // Same non-createable PoList react-select id as Cost Report
  // (PoList.tsx: `id={"Incomming-inventory-P-O-" + dropdownId}`, dropdownId=1).
  poDropdownInput: () => cy.get('#Incomming-inventory-P-O-1'),
  poDropdownOption: (name) => cy.get('[class*="-menu"]').contains('[class*="-option"]', name),

  // ── Category Filter ──────────────────────────────────────────────────────────
  categorySelect: () => cy.get('#category-select'),
  categoryOption: (id) => cy.get('[role="listbox"] [data-value="' + id + '"]'),
  // MUI renders the Select menu in a PORTAL at document.body, not inside the
  // trigger's parent — query the portaled listbox directly (only one Select is
  // open at a time, so this is unambiguous). Scoping to #category-select.parent()
  // matched zero options.
  categoryOptionsAll: () => cy.get('[role="listbox"] [data-value]'),

  // ── Status Filter ────────────────────────────────────────────────────────────
  statusSelect: () => cy.get('#status-select'),
  // Match by data-value, NOT accessible name — "StockedOut" (value) vs.
  // "Stocked Out" (label) differ, same gotcha costReportLocators documents.
  statusOption: (value) => cy.get('[role="listbox"] [data-value="' + value + '"]'),
  // Portaled listbox (see categoryOptionsAll) — scoping to the trigger's parent
  // matched zero options.
  statusOptionsAll: () => cy.get('[role="listbox"] [role="option"], [role="listbox"] li'),
  // Generic currently-open MUI Select/Autocomplete popup listbox — used for
  // simple presence/absence text checks where the trigger control (status,
  // category, Group By) already disambiguates which listbox is open.
  openListbox: () => cy.get('[role="listbox"]'),

  // ── Table ─────────────────────────────────────────────────────────────────────
  tableContainer: () => cy.get('.MuiTableContainer-root'),
  tableRows: () => cy.get('.MuiTableContainer-root').first().find('tbody tr'),
  tableHeaderCell: (label) => cy.get('.MuiTableContainer-root').first().find('thead th').contains(label),
  tableLoadingSpinner: () => cy.get('.MuiTableContainer-root').find('.MuiCircularProgress-root'),

  // ── Mobile card view ─────────────────────────────────────────────────────────
  mobileCards: () => cy.get('.MuiStack-root .MuiCard-root'),
  // jQuery's selector engine doesn't support the CSS4 case-insensitive `i`
  // attribute flag (throws "unrecognized expression"), so the mobile
  // next-page button — whose accessible name casing varies — is matched via
  // a substring attribute selector instead of cy.findByRole()'s regex name.
  mobileNextPageButton: () =>
    cy.get('body').then(($body) =>
      $body.find('button[aria-label*="next page"], button[aria-label*="Next page"], button[aria-label*="Next Page"]')
    ),

  // ── Pagination ────────────────────────────────────────────────────────────────
  paginationSummary: () => cy.findByText(/record:/i),
  nextPageButton: () => cy.findByRole('button', { name: /next page/i }),
  pageSizeDropdown: () => cy.findByRole('combobox', { name: /rows per page/i }),
  pageSizeOption: (value) => cy.findByRole('option', { name: String(value) }),

  // ── Export ────────────────────────────────────────────────────────────────────
  exportButton: () => cy.findByRole('button', { name: /^export$/i }),
  exportMenuChevron: () => cy.get('#export-menu-button'),
  exportMenu: () => cy.get('#export-menu'),
  exportReportMenuItem: () => cy.get('#export-menu').contains('li, [role="menuitem"]', /export report/i),
  exportGroupedMenuItem: () => cy.get('#export-menu').contains('li, [role="menuitem"]', /export grouped/i),

  // ── Group By ──────────────────────────────────────────────────────────────────
  groupByInput: () => cy.findByLabelText(/^Group By$/i),
  groupByOption: (label) => cy.get('[role="listbox"]').contains('li', label),
  groupingChip: (label) => cy.get('[class*="MuiChip-root"]').contains(label),

  // ── Column Customization ─────────────────────────────────────────────────────
  // Direct sibling of the Export Stack inside the shared row Box (same
  // structural pattern as Cost Report, one fewer nesting level here).
  customizeColumnsButton: () =>
    cy.contains('button', /^export$/i).parents('.MuiStack-root').first().parent().find('button').last(),
  customizeColumnsModal: () =>
    cy.contains(/Columns setting for category/i).closest('[role="dialog"], .MuiDialog-paper, form'),
  columnLabel: (name) =>
    cy.get('#attribute-form').contains('label', new RegExp(`^${Cypress._.escapeRegExp(name)}$`)),
  // The "Selected Columns" chip row at the top of the modal mirrors every
  // currently-selected column (core report columns like Avg Cost/Total
  // Inventory Cost/Product Name have NO checkbox in the attribute grid below —
  // they only exist as a deletable chip here; attribute-backed columns like
  // Category appear as both a chip and a checkbox). The chip is therefore the
  // one mechanism that works to deselect ANY column.
  selectedColumnChip: (name) =>
    cy.get('[role="dialog"], .MuiDialog-paper').first().contains('.MuiChip-root', new RegExp(`^${Cypress._.escapeRegExp(name)}$`)),
  customizeColumnsSaveButton: () => cy.get('button[form="attribute-form"]').contains('Save'),

  // ── Nav ───────────────────────────────────────────────────────────────────────
  inventoryReportNavItem: () => cy.contains('a, span', /^Inventory Report$/),
};

export default inventoryReportLocators;
