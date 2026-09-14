
// Utility to escape special regex characters
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const purchaseOrderReportLocators = {
  // Gets the visible value of the PO dropdown (e.g., "All POs")
  poDropdownVisibleValue: () =>
    cy
      .contains('span', 'Purchase Order Number')
      .parent()
      .find("[class$='-singleValue']"),


  // ── Tabs ──────────────────────────────────────────────────────────────────
  tab: (label) => {
    const safeLabel = escapeRegExp(label);
    return cy.findByRole('tab', { name: new RegExp(safeLabel, 'i') });
  },

  activeTab: () => cy.findByRole('tab', { selected: true }),

  // Badge inside a tab — the numeric count element.
  tabBadge: (label) => {
    const safeLabel = escapeRegExp(label);
    return cy
      .findByRole('tab', { name: new RegExp(safeLabel, 'i') })
      .find('span.minimal__label__root');
  },

  // ── PO Dropdown ───────────────────────────────────────────────────────────
  poDropdownTrigger: () =>
    cy.contains('span', 'Purchase Order Number')
      .parent()
      .find('input[role="combobox"]'),

  // Match the option by the PO label span's `title` attribute (which is exactly
  // the PO name) rather than the option's accessible name. With showSource the
  // option also contains a source chip ("StockWise"/"AccountWise"), so the
  // computed accessible name is "PO-NAME SOURCE" — matching on the name regex
  // alone risks substring collisions across POs. Scoping to the exact title is
  // unambiguous and ignores the chip text entirely.
  poDropdownOption: (name) =>
    cy.get(`[role="option"]`).filter(`:has([title="${name}"])`),

  // ── Export ────────────────────────────────────────────────────────────────
  exportButton: () => cy.findByRole('button', { name: /export/i }),

  // ── Search ────────────────────────────────────────────────────────────────
  searchInput: () => cy.get('input#searchInputRef'),
  searchButton: () => cy.findByRole('button', { name: /search/i }),

  // ── Table ─────────────────────────────────────────────────────────────────
  tableRows: () => cy.get('tbody tr'),

  // ── Pagination ────────────────────────────────────────────────────────────
  paginationSummary: () => cy.findByText(/record:/i),
  nextPageButton: () => cy.findByRole('button', { name: /next page/i }),
  pageSizeDropdown: () => cy.findByRole('combobox', { name: /rows per page/i }),
  pageSizeOption: (value) => cy.findByRole('option', { name: String(value) }),

  // ── Item Detail Page ──────────────────────────────────────────────────────
 
  // The collapsible Product Details section toggle arrow
  productDetailsToggle: () => cy.get('#product-details-header'),
 
  // The Product Details section container — used to assert collapsed/expanded state
  productDetailsSection: () => cy.get('#product-details-content'),
 
  // Item list table rows on the detail page.
  // Scoped to the last MuiTableContainer on the page — the item list MRT table is always
  // the last table container rendered (after the Product Details accordion), so this
  // avoids matching any variant table or the main report table on a different page.
  itemListRows: () => cy.get('.MuiTableContainer-root').last().find('tbody tr'),
 
  // PO Number cell in the first row of the item list table.
  // Resolves the column index dynamically by matching the "PO Number" header text,
  // then picks the corresponding td in the first body row — immune to column reordering.
  poNumberCell: () =>
    cy.get('.MuiTableContainer-root').last()
      .find('th').contains('PO Number')
      .invoke('index')
      .then((colIndex) =>
        cy.get('.MuiTableContainer-root').last()
          .find('tbody tr').first()
          .find('td').eq(colIndex)
          .find('.MuiBox-root')
      ),

};
export default purchaseOrderReportLocators;

