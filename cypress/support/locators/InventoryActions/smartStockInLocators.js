// cypress/support/locators/InventoryActions/smartStockInLocators.js
//
// Locators for the consolidated Smart Stock In mobile screen
// (route /MobileViewScreen/smart-stock-in?poId=...).
// Component: Frontend/src/components/SmartStockIn/index.tsx.
//
// Dev consolidation (2026-06): Smart Stock In replaces the four former
// Stock-In destinations — Stock In Items, Stock In Products, Add By Product
// and Product Listing — with one screen that auto-detects whether the
// selected product is quantity-tracked (hasItems=false && hasVariants=false)
// or serialized, and exposes a "Search All Products" catalog to add a product
// to the PO on the fly.
//
// Selectors use accessible names / placeholders / labels so they survive MUI
// version bumps. The screen is form-driven (Box component="form"); pressing
// Enter in the active text field submits it.

const smartStockInLocators = {
  // Page chrome
  heading: 'Smart Stock In',
  subtitle: 'Scan an item serial, or browse and search products to stock in.',
  backButton: 'Back',

  // PO context chip (top-right) — MUI Chip element. The chip contains the PO number as text.
  // Matched via the .MuiChip-root class selector.
  poChip: '.MuiChip-root',

  // Main scan/search field (rendered only while no product is selected)
  scanInputPlaceholder: 'Scan serial number',

  // Product-discovery toggles
  browseProductsButton: 'Browse This PO',
  hideProductsButton: 'Hide PO Products',
  searchAllProductsButton: 'Add Product to PO',
  hideCatalogButton: 'Hide Product Catalog',

  // ProductMatchList rows (PO suggestions, browse list, catalog list, matches)
  productListItem: '.MuiListItemButton-root',

  // Product search field (rendered inside the open browse/catalog panel).
  // Placeholder switches between the two modes:
  //   showCatalogSearch=false → 'Search products in this PO'
  //   showCatalogSearch=true  → 'Search all products'
  productSearchInputPlaceholder: {
    poProducts: 'Search products in this PO',
    catalog: 'Search all products',
  },
  // Submit button for the product search field.
  productSearchButton: 'Search',

  // Section titles ProductMatchList can render
  listTitles: {
    poProducts: 'PO Products',
    suggestions: 'Product suggestions',
    multipleMatches: 'Multiple product matches',
    catalog: 'Catalog products',
    allProducts: 'All products',
  },

  // Primary submit button labels (no product selected)
  submit: {
    stockIn: 'Stock In',
    receiveDamaged: 'Receive Damaged',
    selectProductToAdd: 'Select Product to Add',
    containerFull: 'Container Full',
  },

  // Selected-product card
  selectedCard: {
    quantityProductSubtitle: 'Product quantity stock-in',
    serialProductSubtitle: 'Scan serials into selected product',
    quantityFieldLabel: 'Quantity',
    serialFieldLabel: 'Serial Number',
    // Numeric quantity input (only rendered for a quantity-tracked product)
    quantityInput: 'input[inputmode="numeric"]',
    // Submit labels inside the selected-product card
    stockInQuantity: 'Stock In Quantity',
    scanSerial: 'Scan Serial',
    receiveDamagedQuantity: 'Receive Damaged Quantity',
    receiveDamagedSerial: 'Receive Damaged Serial',
  },

  // Receive-damaged controls
  receiveDamagedSwitchLabel: 'Receive damaged',
  damageReasonLabel: 'Damage Reason',

  // Container / Location assignment panel (rendered only when the general-config
  // toggle `enableContainerLocationAssignment` is ON). See SmartStockIn/index.tsx:1412.
  assignment: {
    panelHeading: 'Container / Location',
    // Universal scan field — type a container CODE or bin-location CODE + Enter to
    // resolve it via GET /locations/universal-scan (SmartStockIn/index.tsx:1481).
    scanFieldPlaceholder: 'Scan container or location',
    clearSelectionTooltip: 'Clear selection',
    // Toast copy (react-hot-toast — matched via cy.contains)
    selectContainerOk: (code) => `Container ${code} selected successfully`,
    selectLocationOk: /selected successfully/i,
    atCapacityError: (code) => `Container ${code} is at maximum capacity`,
    // Submit-time gate + capacity errors
    noSelectionError: 'Please select a container or location before stocking in',
    overCapacityError: /Cannot assign \d+ item.*can only hold \d+ more/i,
  },

  // Session scanned list
  sessionListHeadingRe: /Scanned in this session/i,
  sessionClearButton: 'Clear',

  // react-hot-toast renders toast text in the DOM (no MuiAlert wrapper).
  // Assertions match on the toast copy directly via cy.contains.
};

export default smartStockInLocators;
