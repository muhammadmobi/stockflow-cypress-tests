// Locators for the Warehouse Location Report screen
// (Frontend/src/components/Reports/WarehouseLocationReport/index.tsx +
//  ProductDetailPanel.tsx). Read directly from source — not carried over from a
// sibling report.
//
// DOM facts driving these selectors (verified in source):
//   * The search box is <Input id="warehouse-search"> which forwards `id` onto
//     the underlying MUI <input> (common/Input.tsx line 78), so
//     `input#warehouse-search` is stable.
//   * The three filter <Select>s carry no id of their own; each is wired to an
//     <InputLabel id="wlr-{category|type|assigned}-label">. MUI renders the
//     clickable combobox with aria-labelledby CONTAINING that label id, so a
//     substring match on aria-labelledby is the reliable anchor.
//   * Each <MenuItem value="x"> renders a listbox option carrying
//     data-value="x" — match by data-value (the enum/id), never by the visible
//     label, which varies per environment (mirrors the sibling report
//     locators' `option` convention).
//   * The detail panel (ProductDetailPanel.tsx) renders a nested <Table> whose
//     serialized header cell text is "Serial Number" and whose non-serialized
//     header cell text is "Quantity".
const warehouseLocationReportLocators = {
  // ── Search ──────────────────────────────────────────────────────────────────
  searchInput: () => cy.get('input#warehouse-search'),
  searchButton: () => cy.findByRole('button', { name: /^search$/i }),

  // ── Filters (MUI Selects) ─────────────────────────────────────────────────────
  // The Selects carry no id of their own, only a linked <InputLabel id="wlr-*-label">.
  // The clickable display element is `.MuiSelect-select` inside the same
  // FormControl — clicking it opens the portalled listbox. (An aria-labelledby
  // substring match resolved to a non-clickable node and never opened the menu.)
  categorySelect: () =>
    cy.get('#wlr-category-label').parents('.MuiFormControl-root').first().find('.MuiSelect-select'),
  productTypeSelect: () =>
    cy.get('#wlr-type-label').parents('.MuiFormControl-root').first().find('.MuiSelect-select'),
  assignmentSelect: () =>
    cy.get('#wlr-assigned-label').parents('.MuiFormControl-root').first().find('.MuiSelect-select'),
  // The open listbox is portalled to <body>; match the option by its data-value.
  option: (value) => cy.get('[role="listbox"] [data-value="' + value + '"]'),

  // ── Export ────────────────────────────────────────────────────────────────────
  // Label is "Export" normally and flips to "Downloaded!" for ~700ms after a
  // successful download (index.tsx handleExport), so match either.
  exportButton: () => cy.findByRole('button', { name: /export|downloaded/i }),

  // ── Summary stat cards ──────────────────────────────────────────────────────
  // StatCard renders its title in a <Typography variant="h6"> inside a
  // .MuiCard-root; locate the card by its (start-anchored) title text.
  statCard: (title) =>
    cy.contains('.MuiCard-root', new RegExp('^' + Cypress._.escapeRegExp(title))),

  // ── Table ─────────────────────────────────────────────────────────────────────
  tableContainer: () => cy.get('.MuiTableContainer-root').first(),
  tableRows: () => cy.get('.MuiTableContainer-root').first().find('tbody tr'),
  // The main product row that contains `text` (product name / stamp). Scoped to
  // the first (main) table container so a nested detail-panel table row is not
  // matched. cy.contains(selector, content) yields the matching <tr>.
  rowContaining: (text) =>
    cy.get('.MuiTableContainer-root').first().contains('tbody tr', text),
  // MRT renders the expand toggle as the first <button> in the row's first cell.
  expandButtonInRow: (text) =>
    cy.get('.MuiTableContainer-root').first().contains('tbody tr', text).find('button').first(),
  typeChipInRow: (text) =>
    cy.get('.MuiTableContainer-root').first().contains('tbody tr', text).find('.MuiChip-root').first(),

  // ── Detail panel (ProductDetailPanel.tsx) ─────────────────────────────────────
  detailSerialHeader: () => cy.contains('th, strong', /^Serial Number$/),
  detailNsCaption: () => cy.contains(/Quantity distribution across \d+ location/i),
  // Scoped to .MuiCollapse-entered — the class MUI's <Collapse> applies when the
  // detail panel is fully open. Prevents a false positive if the serial stamp
  // appears elsewhere in the main table (e.g. a search-result name column).
  detailCellWithText: (text) =>
    cy.get('.MuiCollapse-entered').contains('td', new RegExp(Cypress._.escapeRegExp(text))),

  // ── Pagination ──────────────────────────────────────────────────────────────
  paginationRecordText: () => cy.contains(/Record:\s*\d+\s*-\s*\d+\s*of\s*\d+/i),
};

export default warehouseLocationReportLocators;
