// cypress/support/locators/InventoryActions/checkItemStatusLocators.js
//
// Locators for the Check Item Status mobile screen
// (route /MobileViewScreen/scan-item-status, reached via Inventory Actions →
// Product Operations → Check Item Status).
// Selectors mirror the DOM cues used by the existing
// `InventoryActionCheckItemStatusPage` (read-only reference) but are owned
// here so this module's specs are independent of that file.

const checkItemStatusLocators = {
  sideNavLink: 'a[aria-label="Inventory Actions"][href="/MobileViewScreen"]',

  // Tile labels
  productOperationsTile: 'Product Operations',
  checkItemStatusTile: 'Check Item Status',

  // Serial number scan input — first text field on the screen
  serialInput: 'input[type="text"]',

  // "Scan" submit button
  scanButton: 'Scan',

  // Status row: a Stack with "Status:" label + a paragraph value.
  statusRowSelector: '.MuiStack-root',
  statusLabel: 'Status:',
};

export default checkItemStatusLocators;
