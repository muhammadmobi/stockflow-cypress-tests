// cypress/support/locators/InventoryActions/assignItemsLocators.js
//
// Locators for the Assign Items mobile screen
// (route /MobileViewScreen/assign-items).
// Component: Frontend/src/components/AssignItems/index.tsx.
//
// The screen has two steps:
//   1. target  → ToggleButtonGroup [Scan QR / Select Container / Select Location]
//   2. items   → serial-number Input + Scan button + Session History list
//
// We anchor to MUI primitives (placeholder attribute, Toggle button text,
// id="serial-number-input") since the component does not expose data-testid
// hooks. Anchors are stable because they are the literal user-visible texts.

const assignItemsLocators = {
  // -- Outer entry / nav --------------------------------------------------
  sideNavLink: 'a[aria-label="Inventory Actions"][href="/MobileViewScreen"]',

  // Tile labels on the landing-screen menu — the test plan walks
  // Inventory Actions → Warehouse Management → Assignment → Assign Items.
  warehouseManagementTile: 'Warehouse Management',
  assignmentTile: 'Assignment',
  assignItemsTile: 'Assign Items',

  // -- Step 1: target ----------------------------------------------------
  // Toggle group buttons (ToggleButtonGroup renders MUI <button> with the
  // value text as its accessible label).
  scanQrToggle: 'Scan QR',
  selectContainerToggle: 'Select Container',
  selectLocationToggle: 'Select Location',

  // Universal scan input — anchor by placeholder attribute (substring match).
  targetQrInputId: 'target-qr-input',
  targetQrInputByPlaceholder: 'input[placeholder*="Scan or enter container code"]',

  // Container picker open-button (inside the selectContainer toggle).
  selectContainerListBtnText: 'Select Container from List',

  // -- Step 2: items -----------------------------------------------------
  serialInputId: 'serial-number-input',
  serialInputByPlaceholder: 'input[placeholder*="Scan or enter serial number"]',
  scanButtonText: 'Scan',
  scanButtonBusyText: 'Assigning...',

  sessionHistoryHeading: 'Session History',
  noItemsAssignedText: 'No items assigned in this session.',

  // -- Confirm dialog (already-assigned / move-confirm) ------------------
  // ProductElsewhereDialog renders inside a MUI Dialog with title "Confirm
  // Assignment" and button "Yes, Continue". We use both as anchors.
  confirmDialogTitle: 'Confirm Assignment',
  confirmYesButtonText: /^Yes,?\s+Continue$/,
  confirmCancelButtonText: 'Cancel',

  // -- Container selector dialog title ----------------------------------
  containerSelectorTitle: 'Select Container for Item Assignment',
};

export default assignItemsLocators;
