// Locators for Item Search — itemViewItemList.tsx component
// Search input: id="searchInputRef" (itemViewItemList.tsx:1199)
// Search button: type="submit" inside the search form (itemViewItemList.tsx:1240)
// Status filters: MuiCardActionArea wrapping InfoCard with Typography label (ProductDetailStats.tsx:98–161)
// Table: MaterialReactTable renders standard <table class="MuiTable-root">
// Pagination: custom renderBottomToolbar uses Typography (→ <p>) + MRT_TablePagination

export const ItemSearchLocators = {
  searchInput: '#searchInputRef',
  searchButton: 'button[type="submit"]',

  // Status filter cards — Box > Card > CardActionArea containing Typography with the label text
  statusFilterButton: (status) => `.MuiCardActionArea-root:contains("${status}")`,

  // Results table (MaterialReactTable standard rendering)
  itemsTable: '.MuiTable-root',
  tableRows: 'tbody tr',

  // Custom renderBottomToolbar: <Typography>{`Record:  ${left} - ${right}  of ${count}`}</Typography>
  // MUI Typography without variant prop → body1 → renders as <p>
  pageInfoText: 'p:contains("Record:")',

  // MUI Pagination page buttons: aria-label="page N" (lowercase, space-separated)
  pageNumberButton: (pageNum) => `button[aria-label="page ${pageNum}"]`,
  previousPageButton: 'button[aria-label="Go to previous page"]',
  nextPageButton: 'button[aria-label="Go to next page"]',

  // MRT empty-state default message
  noResultsMessage: 'td:contains("No records to display")',

  // Row action menu (ItemActionMenu.tsx uses id="long-button")
  longButton: (serialNumber) => `tr:contains("${serialNumber}") button[id="long-button"]`,

  errorToast: '[role="alert"]',
};

export default ItemSearchLocators;
