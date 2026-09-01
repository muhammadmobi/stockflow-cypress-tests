// cypress/support/locators/InventoryActions/assignProductsLocators.js
//
// Locators for the Assign Products mobile screen
// (route /MobileViewScreen/assign-products).
// Component: Frontend/src/components/AssignProducts/index.tsx.
//
// Two steps: target (container or location) → products (search + qty per row).
// Each product row renders a numeric input with placeholder "Qty" and an
// inline "Assign" button — they're plain <Box component="input"> + <Box
// component="button"> elements, not standard MUI fields, so we anchor by
// placeholder/text rather than label.

const assignProductsLocators = {
  // -- Outer entry / nav --------------------------------------------------
  warehouseManagementTile: 'Warehouse Management',
  assignmentTile: 'Assignment',
  assignProductsTile: 'Assign Products',

  // -- Step 1: target ----------------------------------------------------
  scanQrToggle: 'Scan QR',
  selectContainerToggle: 'Select Container',
  selectLocationToggle: 'Select Location',
  selectContainerListBtnText: 'Select Container from List',
  containerSelectorTitle: 'Select Container for Product Assignment',

  targetQrInputId: 'target-qr-input',
  targetQrInputByPlaceholder: 'input[placeholder*="Scan Container/location label"]',

  // -- Step 2: products list ----------------------------------------------
  // Search field is a labelled MUI TextField with label="Search Product"
  // and placeholder="Search Products". The label form is reliable inside
  // a MUI <label for=...> chain.
  searchProductLabel: 'Search Product',
  searchProductPlaceholder: 'input[placeholder="Search Products"]',

  qtyInputByPlaceholder: 'input[placeholder="Qty"]',
  assignButtonInRowText: 'Assign',

  // Empty / loading copy.
  noResultsTextPrefix: 'No products found for',
  noProductsAvailableText: 'No products with available quantity found.',
  searchingTextPrefix: 'Searching for',

  // Reassignment dialog (when product is already assigned elsewhere).
  reassignDialogTitle: 'Confirm Assignment',
  reassignAssignButtonText: 'Assign',
  reassignCancelButtonText: 'Cancel',
};

export default assignProductsLocators;
