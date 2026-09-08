// cypress/support/locators/InventoryActions/stockOutByProductScanningLocators.js
//
// Locators for the Stock Out by Product Scanning mobile screen
// (route /MobileViewScreen/sku-stock-out).
// Component: Frontend/src/components/ScanProduct/index.tsx.

const stockOutByProductScanningLocators = {
  // The screen heading is "Stock Out by <productAttrName>" — productAttrName
  // is config-driven (e.g. "SKU"), so we match the prefix only.
  headingPrefix: 'Stock Out by',

  // Step 1 form fields
  reasonSelectInput: 'input[id^="react-select"]',
  referenceNumberLabelText: 'Reference Number',
  quantityInputId: 'input#quantity',
  // Description / scan inputs aren't strictly needed for smoke tests
};

export default stockOutByProductScanningLocators;
