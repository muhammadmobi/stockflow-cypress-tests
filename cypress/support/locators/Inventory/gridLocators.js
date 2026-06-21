// Locators for the Inventory products grid mechanics (/inventory): refresh + sort.
// Source of truth: ItemList.tsx — RefreshButton (aria-label="refresh", :2468),
// MaterialReactTable with manualSorting (GET /products carries sortBy + sortOrder,
// enableSortingRemoval:false → asc↔desc only), manualPagination (page + page_size,
// ROWS_PER_PAGE_OPTIONS=[75,100,150,200,300]).

const gridLocators = {
  REFRESH_BTN: 'button[aria-label="refresh"]',
  HEADER_CELL: 'thead th',
  // The list query is GET /products?... — match by the query-string form so it
  // doesn't collide with /products/:id, /products/grouped, /products/export, etc.
  PRODUCTS_LIST: /\/products\?/,
};

export default gridLocators;
