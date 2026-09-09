// cypress/support/locators/InventoryActions/unassignProductsLocators.js
//
// Locators for the Unassign Products mobile screen
// (route /MobileViewScreen/unassign-products).
// Component: Frontend/src/components/UnassignProducts/index.tsx.
//
// Three steps:
//   1. products    — search + infinite-scroll list (tap a row)
//   2. assignment  — list of containers/locations holding that product
//                    (tap row OR scan a code)
//   3. quantity    — numeric input + Unassign button

const unassignProductsLocators = {
  // -- Tile labels --------------------------------------------------------
  warehouseManagementTile: 'Warehouse Management',
  unassignmentTile: 'Unassignment',
  unassignProductsTile: 'Unassign Products',

  // -- Step headers (header right-side <Typography variant="h6">) ---------
  step1Header: 'Select Product',
  step2Header: 'Select Container / Location',
  step3Header: 'Enter Quantity',

  // -- Step 1 inputs / state --------------------------------------------
  productSearchPlaceholder: 'input[placeholder="Search Products"]',
  endOfResultsText: '• End of results •',
  loadingMoreText: 'Loading more…',

  // -- Step 2 scan input / list -----------------------------------------
  scanInputByPlaceholder: 'input[placeholder*="Scan or type container code"]',
  noAssignmentsText: 'No containers or locations found for this product.',

  // -- Step 3 quantity --------------------------------------------------
  qtyInputLabel: 'Quantity to Unassign',
  qtyInput: 'input[type="number"]',
  unassignBtn: 'Unassign',

  // -- Toast errors -----------------------------------------------------
  noAssignmentsErrorText: 'No containers or locations have this product assigned',
};

export default unassignProductsLocators;
