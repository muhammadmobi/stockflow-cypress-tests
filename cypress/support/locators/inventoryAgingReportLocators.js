// Locators for the Inventory Aging Report screen
// (Frontend/src/components/Reports/InventoryAgingReport/index.tsx +
//  AgingCharts.tsx + AgingMobileCardList.tsx). Read directly from source, not
// carried over from a sibling report — this screen has NO PO filter, NO
// Status filter, NO Customize Columns, and its Category <Select> carries no
// `id`/`labelId` prop at all (confirmed: index.tsx's <Select> has neither),
// unlike the sibling Cost/Inventory/Sales/Asset-Lifecycle Report screens'
// `#category-select` — so it is located structurally from its <InputLabel>,
// mirroring brainboxConfigLocators.js's `comboboxWithinLabel` convention.
const inventoryAgingReportLocators = {
  // ── Search ──────────────────────────────────────────────────────────────────
  // Input.tsx forwards every extra prop (including RHF's `name`) straight to
  // the underlying MUI TextField/<input> — the Controller's field name is
  // "searchValue" (index.tsx) and no `id` prop is ever passed, so `name` is
  // the only stable hook into the DOM.
  searchInput: () => cy.get('input[name="searchValue"]'),
  searchButton: () => cy.findByRole('button', { name: /^search$/i }),

  // ── Category Filter ────────────────────────────────────────────────────────
  categorySelect: () =>
    cy.contains('label', 'Category').closest('.MuiFormControl-root').find('[role="combobox"]'),
  // MenuItem's `value` is the category id, but its VISIBLE TEXT is cat.name
  // (index.tsx: `<MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>`)
  // — match by name text, not by a data-value id, since the UI never exposes
  // the id anywhere a caller could read it independently.
  categoryOption: (name) => cy.get('[role="listbox"]').contains('li', name),
  allCategoriesOption: () => cy.get('[role="listbox"]').contains('li', 'All Categories'),

  // ── Table ───────────────────────────────────────────────────────────────────
  // No `.first()` here (unlike AssetLifecycleReportLocators' identical-looking
  // selector): this screen mounts at most one `.MuiTableContainer-root` at a
  // time (MaterialReactTable is conditionally rendered, never alongside the
  // mobile card list), and TC17 asserts `tableContainer().should('not.exist')`
  // on a mobile viewport — `.first()` (like `.closest()`/`.eq()`) THROWS
  // "requires a DOM element" when the base selector matches zero elements,
  // which breaks a `.should('not.exist')` assertion instead of satisfying it
  // (confirmed by a live run before this fix).
  tableContainer: () => cy.get('.MuiTableContainer-root'),
  tableRows: () => cy.get('.MuiTableContainer-root').find('tbody tr'),
  tableHeaderCell: (label) => cy.get('.MuiTableContainer-root').find('thead th').contains(label),

  // ── KPI tiles / charts (AgingCharts.tsx) ─────────────────────────────────────
  // Deliberately NOT `cy.contains(label).closest('.MuiCard-root')` (the
  // convention inventoryReportLocators.js uses for its own, non-collapsible,
  // KPI card): this screen's tiles/charts sit inside AgingCharts' `<Collapse
  // unmountOnExit>`, so `cy.contains(label)` finds ZERO elements once the
  // panel is toggled shut — and `.closest()` throws "requires a DOM element"
  // on a zero-match subject instead of yielding an empty (not.exist-safe)
  // result (confirmed by a live run of TC09 before this fix). A single
  // `cy.get()` call with a jQuery `:contains()` pseudo-selector keeps the
  // whole match — including the text filter — inside one Cypress primitive,
  // which resolves to zero elements cleanly when the panel is collapsed.
  kpiTile: (label) => cy.get(`.MuiCard-root:contains("${label}")`),
  kpiTileValue: (label) => cy.get(`.MuiCard-root:contains("${label}")`).find('.MuiTypography-h6'),
  chartCard: (title) => cy.get(`.MuiCard-root:contains("${title}")`),
  // The IconButton's aria-label flips between exactly these two strings
  // (AgingCharts.tsx: `aria-label={expanded ? 'Hide charts' : 'Show charts'}`)
  // — only one is ever present at a time, so this matches regardless of the
  // panel's current state.
  chartsToggleButton: () => cy.get('[aria-label="Hide charts"], [aria-label="Show charts"]'),

  // ── Export ──────────────────────────────────────────────────────────────────
  // Label cycles Export → Exporting… → Done (index.tsx's handleExport) — no
  // stable id/testid exists on this button, so match the full set of
  // possible labels.
  exportButton: () => cy.contains('button', /^(Export|Exporting…|Done)$/),

  // ── Mobile card list (AgingMobileCardList.tsx) ────────────────────────────────
  // Row cards are the ONLY `<Card variant="outlined">` on this screen — the
  // KPI tiles and chart cards above use the MUI default (elevation) variant —
  // so this class combination is what actually distinguishes "an inventory
  // row card" from "a KPI/chart card" on a mobile viewport, where AgingCharts
  // is still mounted above the card list (it renders regardless of isMobile).
  mobileCards: () => cy.get('.MuiCard-root.MuiPaper-outlined'),
  mobileEmptyState: () => cy.contains('No inventory found.'),
};

export default inventoryAgingReportLocators;
