// Locators for the Asset Lifecycle Report screen
// (Frontend/src/components/Reports/AssetLifecycleReport/index.tsx +
//  AssetLifecycleMobileCardList.tsx). Read directly from source, not carried
// over from a sibling report — the Customize-Columns IconButton sits BEFORE
// the Export button in this screen's DOM (opposite order from Cost/Inventory
// Report), so its structural locator differs from those two (see comment
// below).
const assetLifecycleReportLocators = {
  // ── Search ──────────────────────────────────────────────────────────────────
  searchInput: () => cy.get('input#assetSearchInputRef'),
  searchButton: () => cy.findByRole('button', { name: /^search$/i }),

  // ── Category Filter ──────────────────────────────────────────────────────────
  categorySelect: () => cy.get('#category-select'),
  // MUI MenuItem carries a data-value attribute matching the category id —
  // avoids matching by display text, which varies per environment.
  categoryOption: (id) => cy.get('[role="listbox"] [data-value="' + id + '"]'),
  allCategoriesOption: () => cy.get('[role="listbox"] [data-value="all"]'),

  // ── Status Filter ─────────────────────────────────────────────────────────────
  statusSelect: () => cy.get('#status-select'),
  // Match by data-value (the status enum, e.g. "StockedOut"), not by the
  // visible label ("Stocked Out", with a space) — mirrors costReportLocators'
  // statusOption convention for the identical reason.
  statusOption: (value) => cy.get(`[role="listbox"] [data-value="${value}"]`),

  // ── PO Filter ────────────────────────────────────────────────────────────────
  // Shared IncommingInventory/PoList component — dropdownId is hardcoded to 1
  // inside PoList.tsx regardless of which screen mounts it (verified in
  // source), so this id is stable across every report screen that uses it.
  // The react-select text input itself. Defined ONCE here so the page object
  // never re-inlines the raw id — poDropdownValue() derives from it, so the two
  // cannot drift apart.
  poDropdownInput: () => cy.get('#Incomming-inventory-P-O-1'),
  poDropdownValue: () => assetLifecycleReportLocators.poDropdownInput().closest('[class*="-container"]'),
  poDropdownOption: (name) => cy.get('[class*="-menu"]').contains('[class*="-option"]', name),

  // ── Table ─────────────────────────────────────────────────────────────────────
  tableContainer: () => cy.get('.MuiTableContainer-root').first(),
  // Unchained variant for zero-match assertions. tableContainer()'s .first()
  // makes cy.get() wait for at least one match before .first() can resolve, so
  // `tableContainer().should('not.exist')` times out on a viewport that
  // genuinely renders no table (the mobile card list, SW-ALR-TC13) instead of
  // passing. Assert on this one whenever the expectation is absence.
  tableContainerAny: () => cy.get('.MuiTableContainer-root'),
  tableRows: () => cy.get('.MuiTableContainer-root').first().find('tbody tr'),
  tableHeaderCell: (label) => cy.get('.MuiTableContainer-root').first().find('thead th').contains(label),
  tableLoadingSpinner: () => cy.get('.MuiTableContainer-root').first().find('.MuiCircularProgress-root'),

  // ── Lifecycle link (per-row) ─────────────────────────────────────────────────
  // Rendered as a MuiLink "View Report" button in the always-appended
  // Lifecycle column (AssetLifecycleReport/index.tsx ~line 340).
  lifecycleLinkInRow: (rowIndex) =>
    cy.get('.MuiTableContainer-root').first().find('tbody tr').eq(rowIndex).contains('a, button', /view report/i),

  // ── Export ────────────────────────────────────────────────────────────────────
  // The label is always literally "Export" (index.tsx has no
  // Export/Exporting…/Done text-cycling logic, unlike the Inventory Aging
  // Report screen — confirmed by reading the full component; IMSButton's
  // `loading` prop drives its own internal spinner, not a label change here).
  exportButton: () => cy.findByRole('button', { name: /^export$/i }),

  // ── Column Customization ─────────────────────────────────────────────────────
  // Structural: the outer Stack (direction="row", spacing={2}) contains, in
  // DOM order, [IconButton(TuneIcon), Stack(bordered, containing the Export
  // button)] — the Tune IconButton has no accessible name/testid in this
  // production build (same production-build gap costReportLocators.js
  // documents), so it's located as the FIRST button inside that outer Stack,
  // found by walking up from the Export button two ".MuiStack-root"
  // ancestors (index 0 = the bordered Export wrapper, index 1 = the shared
  // outer Stack) rather than the "last button" pattern Cost/Inventory Report
  // use — their Tune button sits AFTER Export in DOM order, this screen's
  // sits BEFORE it.
  customizeColumnsButton: () =>
    cy.contains('button', /^export$/i).parents('.MuiStack-root').eq(1).find('button').first(),
  customizeColumnsModal: () => cy.contains(/Columns setting for category/i).closest('[role="dialog"], .MuiDialog-paper, form'),
  columnLabel: (name) => cy.get('#attribute-form').contains('label', new RegExp(`^${Cypress._.escapeRegExp(name)}$`)),
  selectedColumnChip: (name) =>
    cy.get('[role="dialog"], .MuiDialog-paper').first().contains('.MuiChip-root', new RegExp(`^${Cypress._.escapeRegExp(name)}$`)),
  customizeColumnsSaveButton: () => cy.get('button[form="attribute-form"]').contains('Save'),

  // ── Asset count / header ──────────────────────────────────────────────────────
  assetCountText: () => cy.contains(/Showing\s+\d+\s+assets/i),
  pageTitle: () => cy.contains('h6', /Asset Lifecycle Flow Report/i),

  // ── Mobile card list (AssetLifecycleMobileCardList.tsx) ──────────────────────
  mobileCards: () => cy.get('.MuiCard-root'),
  firstMobileCard: () => cy.get('.MuiCard-root').first(),
  mobileEmptyState: () => cy.contains(/No assets found\./i),
  mobileViewMoreLink: () => cy.get('.MuiCard-root').first().contains(/view more/i),
  mobileViewLessLink: () => cy.get('.MuiCard-root').first().contains(/view less/i),
  mobilePagination: () => cy.get('.MuiPagination-root'),

  // ── Status chip (per-row) ─────────────────────────────────────────────────────
  statusChipInRow: (rowIndex) => cy.get('.MuiTableContainer-root').first().find('tbody tr').eq(rowIndex).find('.MuiChip-root'),
};

export default assetLifecycleReportLocators;
