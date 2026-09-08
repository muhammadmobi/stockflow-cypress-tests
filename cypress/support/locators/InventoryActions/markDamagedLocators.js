// cypress/support/locators/InventoryActions/markDamagedLocators.js
//
// Locators for the Mark Damaged Products mobile screen
// (route /MobileViewScreen/mark-damaged-products?poId=...).
// Component: Frontend/src/components/MarkDamagedProducts/index.tsx.

const markDamagedLocators = {
  searchProductsPlaceholder: 'Search Products',

  // Damage reason is a react-select.
  damageReasonInput: 'input[id^="react-select"]',

  // Quantity Input passes id="quantity" and ph="Quantity".
  quantityInput: 'input#quantity',
  quantityPlaceholder: 'Quantity',

  // Container source dropdown — only rendered when container assignment
  // is enabled for the selected product. Same react-select pattern as
  // the damage-reason dropdown.
  sourceSelectPlaceholder: 'Choose Source',

  // Submit button text.
  markDamageButton: 'Mark Damage',

  // Listed product cards are <ListItem>s; each has the product attributes
  // and an onClick that selects the product. We rely on the unique "Mark
  // Damaged Product" heading flipping in once a product is selected.
  selectProductHeading: 'Select Product',
  markDamagedHeading: 'Mark Damaged Product',
};

export default markDamagedLocators;
