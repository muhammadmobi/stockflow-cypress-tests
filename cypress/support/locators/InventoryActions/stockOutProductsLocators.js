// cypress/support/locators/InventoryActions/stockOutProductsLocators.js
//
// Locators for the Stock Out Products mobile screen
// (route /MobileViewScreen/stock-out-products).
// Component: Frontend/src/components/StockOutProducts/index.tsx.

const stockOutProductsLocators = {
  searchProductsPlaceholder: 'Search Products',

  // react-select for the reason dropdown
  reasonSelectInput: 'input[id^="react-select"]',

  // Reference number input
  referenceNumberPlaceholder: 'e.g. REF-001',
  referenceNumberId: 'stockout-products-reference-number',

  quantityInput: 'input#quantity',

  stockOutButton: 'Stock Out',

  // Heading flips when a product is selected
  selectProductHeading: 'Select Product',
  stockOutProductHeading: 'Stock Out Product',

  // Container source dropdown — only rendered when container assignment
  // is enabled for the selected product. Same react-select pattern as
  // the reason dropdown.
  sourceSelectPlaceholder: 'Choose Source',

  // Validation strings
  qtyExceedsAvailableFragment: 'cannot exceed available',
  workOrderRequiredHeading: 'Work Order Required for Stock Out',
};

export default stockOutProductsLocators;
