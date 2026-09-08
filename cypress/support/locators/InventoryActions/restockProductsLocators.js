// cypress/support/locators/InventoryActions/restockProductsLocators.js
//
// Locators for the Restock Products mobile screen — product-quantity flow
// (route /MobileViewScreen/restock-products).
// Component: Frontend/src/components/RestockProducts/index.tsx.

const restockProductsLocators = {
  searchProductsPlaceholder: 'Search Products',
  quantityInput: 'input#quantity',
  restockButton: 'Restock',

  selectProductHeading: 'Select Product',
  restockProductHeading: 'Restock Product',

  // Server error fragment when qty exceeds stocked-out (per Excel TC100).
  notEnoughStockedOutFragment: 'enough stocked out',
};

export default restockProductsLocators;
