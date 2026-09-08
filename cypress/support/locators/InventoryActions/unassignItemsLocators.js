// cypress/support/locators/InventoryActions/unassignItemsLocators.js
//
// Locators for the Unassign Items mobile screen
// (route /MobileViewScreen/unassign-items).
// Component: Frontend/src/components/UnAssignItems/index.tsx.
//
// Single-step screen: serial input + Scan button. Backend resolves the
// container/location from the serial — no target picker.

const unassignItemsLocators = {
  // -- Tile labels --------------------------------------------------------
  warehouseManagementTile: 'Warehouse Management',
  unassignmentTile: 'Unassignment',
  unassignItemsTile: 'Unassign Items',

  // -- Inputs ------------------------------------------------------------
  serialInputId: 'serial-number-unassign-input',
  serialInputByPlaceholder: 'input[placeholder*="Scan or enter serial number"]',
  scanButtonText: 'Scan',
  scanButtonBusyText: 'Unassigning...',
  serialLabel: 'Serial Number*',

  // -- Session history ---------------------------------------------------
  sessionHistoryHeading: 'Session History',
  noUnassignedItemsText: 'No items unassigned in this session.',
};

export default unassignItemsLocators;
