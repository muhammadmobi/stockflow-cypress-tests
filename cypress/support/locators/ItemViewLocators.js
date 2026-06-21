/**
 * ItemViewLocators.js
 * Locators for Product Details (ItemView) page components
 * Used by ItemViewPage page object
 */

export const ItemViewLocators = {
  // Main containers
  productDetailsContainer: '[data-testid="product-details-container"]',
  itemsListContainer: '[data-testid="items-list-container"]',
  itemsTable: '.MuiTable-root, [class*="MuiTable-root"]',

  // Table headers - sortable columns
  tableHeaders: {
    serialNumber: 'th:contains("Serial Number"), th[data-column-id="serialNumber"]',
    status: 'th:contains("Status"), th[data-column-id="status"]',
    location: 'th:contains("Location"), th[data-column-id="locationPath"]',
    container: 'th:contains("Container"), th[data-column-id="containerCode"]',
  },

  // Sort indicators (MaterialReactTable)
  sortLabel: '.Mui-TableHeadCell-Content-Wrapper',
  sortIcon: '.Mui-TableHeadCell-Content-Actions svg',
  sortIconAsc: '[aria-sort="ascending"]',
  sortIconDesc: '[aria-sort="descending"]',
  sortIconNone: 'th:not([aria-sort="ascending"]):not([aria-sort="descending"])',

  // Table body
  tableBody: 'tbody',
  tableRows: 'tbody tr',
  tableRow: 'tbody tr',
  tableCell: 'td',

  // Cell content selectors
  cellContent: {
    serialNumber: 'td:nth-child(1)',
    status: 'td:nth-child(2)',
    location: 'td:nth-child(3)',
    container: 'td:nth-child(4)',
  },

  // Filters and search
  filters: {
    statusFilter: '[data-testid="status-filter"], input[placeholder*="Status"]',
    searchInput: 'input[placeholder*="Search"], input[type="search"]',
    searchButton: 'button[type="submit"], button:contains("Search")',
    clearSearch: 'button:contains("Clear"), [data-testid="clear-search"]',
  },

  // Empty state
  emptyState: {
    container: '[data-testid="empty-state"], .MuiTypography-root:contains("No records")',
    message: '.MuiTypography-root:contains("No records to display")',
  },

  // Loading state
  loading: {
    skeleton: '.MuiSkeleton-root',
    progressBar: '.MuiLinearProgress-root',
  },

  // Pagination (MRT)
  pagination: {
    container: '.MuiTablePagination-root',
    rowsPerPage: '.MuiTablePagination-select',
    nextPage: 'button[title="Next Page"], button[aria-label="Next Page"]',
    prevPage: 'button[title="Previous Page"], button[aria-label="Previous Page"]',
    pageNumber: '.MuiTablePagination-displayedRows',
  },

  // Product info
  productInfo: {
    name: '[data-testid="product-name"]',
    category: '[data-testid="product-category"]',
    quantity: '[data-testid="product-quantity"]',
  },

  // Navigation
  backButton: 'button:contains("Back"), [data-testid="back-button"]',
  inventoryNav: 'a[href="/inventory"]',
};

export default ItemViewLocators;
