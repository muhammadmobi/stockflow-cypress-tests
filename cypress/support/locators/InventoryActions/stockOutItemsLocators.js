// cypress/support/locators/InventoryActions/stockOutItemsLocators.js
//
// Locators for the Stock Out Items mobile screen
// (route /StockOutBySerialNumber via the Inventory Actions tile).
// Component: Frontend/src/components/Item/MobileViewSeperateStockOut.tsx.

const stockOutItemsLocators = {
  sideNavLink: 'a[aria-label="Inventory Actions"][href="/MobileViewScreen"]',

  stockOutTile: 'Stock Out',
  stockOutItemsTile: 'Stock Out Items',

  // react-select uses an internal id starting with 'react-select'
  reasonSelectInput: 'input[id^="react-select"]',
  // The visible value rendered by react-select
  reasonSelectValueClass: '.css-', // generic prefix for emotion-styled value containers; we use text fallback

  descriptionTextarea: 'textarea[name="description"]',

  // The reference-number Input passes ph="Enter reference number" which
  // renders as the underlying input's placeholder attribute. The
  // accompanying label "Reference Number" is a Typography rendered as
  // <label> but lives in a sibling Box, not the input's parent — so
  // placeholder is the most reliable selector.
  referenceNumberPlaceholder: 'Enter reference number',

  nextButton: 'Next',

  // Validation messages
  reasonRequiredToast: 'Select a reason before continuing to scan.',
  reasonRequiredFieldError: 'Reason is required',

  // Stock-out reason config — the reasons dropdown is populated from
  // configJson.data.stockOutReason on the General Configuration list.
};

export default stockOutItemsLocators;
