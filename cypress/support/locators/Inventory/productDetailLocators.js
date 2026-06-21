// Locators for the Inventory Product Detail page (/inventory/:productName/:id).
// Source of truth: ItemView.tsx (+ itemViewProductDetails.tsx, itemViewItemList.tsx).
// IMPORTANT: entering from /inventory always sets action:'item' (ItemList.tsx:522),
// so ItemView mounts ItemViewItemList (the serial table) and the product-only
// PO-accordion / Storage-Locations / standalone stat-tabs block (action!=='item')
// is NOT reachable from this entry. There is no in-page back button — use cy.go('back').

const productDetailLocators = {
  URL_RE: /\/inventory\/[^/]+\/\d+/,
  PRODUCT_DETAILS_HEADER: '#product-details-header', // AccordionSummary
  REFRESH_BTN: 'button[aria-label="refresh"]',       // RefreshButton (tooltip "Refresh product detail")

  // ItemViewItemList serial table. Serial cell is a <button> (navigates to asset-id search).
  ITEM_TABLE: 'table',
  ITEMS_ENDPOINT: '**/products/*/items**', // GET /products/:id/items
  ASSET_SEARCH_RE: /\/asset-id\/search\?assetId=/,
};

export default productDetailLocators;
