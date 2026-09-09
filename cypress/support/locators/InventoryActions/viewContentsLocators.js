// cypress/support/locators/InventoryActions/viewContentsLocators.js
//
// Locators for the View Contents mobile screen
// (route /MobileViewScreen/view-contents).
// Component: Frontend/src/components/ViewContents/index.tsx.
//
// Inner-menu screen with three tiles: Search By Item / Search By Products /
// Search By Storage. Each tile sets the component's `step` state and
// renders a different sub-step. Read-only screen — no state mutation.

const viewContentsLocators = {
  // -- Outer entry / nav --------------------------------------------------
  warehouseManagementTile: 'Warehouse Management',
  viewContentsTile: 'View Contents',

  // -- Inner menu tiles --------------------------------------------------
  searchByItemTile: 'Search By Item',
  searchByProductsTile: 'Search By Products',
  searchByStorageTile: 'Search By Storage',

  // -- Search By Storage (wms-select) toggle group -----------------------
  scanQrToggle: 'Scan QR',
  selectContainerToggle: 'Select Container',
  selectLocationToggle: 'Select Location',

  wmsQrInputId: 'wms-qr-input',
  wmsQrInputByPlaceholder: 'input[placeholder*="Scan or enter container code"]',

  // -- Search By Item (item-select) -------------------------------------
  itemSerialInputId: 'item-serial-input',
  itemSerialInputByPlaceholder: 'input[placeholder*="Scan or enter serial number"]',

  // -- Search By Products (product-select) ------------------------------
  // ViewContents uses ph="Search by product name, serial number..." (different
  // from UnassignProducts which uses placeholder="Search Products"). Anchor
  // by the leading substring so a typo in the suffix doesn't break the test.
  productSearchPlaceholder: 'input[placeholder^="Search by product name"]',

  // -- Empty / fallback copy --------------------------------------------
  itemNotFoundFragment: 'No item found',
  noProductResultsPrefix: 'No products found',
  noWmsMatchPrefix: 'No container or location found for',
};

export default viewContentsLocators;
