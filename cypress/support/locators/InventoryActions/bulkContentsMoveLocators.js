// cypress/support/locators/InventoryActions/bulkContentsMoveLocators.js
//
// Locators for the Bulk Contents Move mobile screen
// (route /MobileViewScreen/bulk-contents-move).
// Component: Frontend/src/components/BulkContentsMove/index.tsx.
//
// Three steps: source → target → preview. Step 1 and Step 2 reuse the same
// `renderSelectionUI` helper inside the component, which produces a shared
// ToggleButtonGroup [Scan QR / Select Container / Select Location] but
// with different `id` prefixes ("move-source-qr-input" vs
// "move-target-qr-input") and different ContainerSelector titles.

const bulkContentsMoveLocators = {
  // -- Tile labels --------------------------------------------------------
  warehouseManagementTile: 'Warehouse Management',
  assignmentTile: 'Assignment',
  bulkContentsMoveTile: 'Bulk Contents Move',

  // -- Step labels (visible <Typography variant="subtitle2">) ------------
  step1Heading: 'Step 1 of 3 — Select source',
  step2Heading: 'Step 2 of 3 — Select target',
  step3Heading: 'Step 3 of 3 — Review and confirm',

  // -- Toggle group ------------------------------------------------------
  scanQrToggle: 'Scan QR',
  selectContainerToggle: 'Select Container',
  selectLocationToggle: 'Select Location',
  selectContainerListBtnText: 'Select Container from List',

  // -- Source / target ContainerSelector dialog titles -------------------
  sourceContainerSelectorTitle: 'Select Source Container',
  targetContainerSelectorTitle: 'Select Target Container',
  selectContainerToggleLabel: 'Select Container',
  containerPickerSearchInput: 'input[placeholder*="Search by container code"]',

  // -- QR input ids (component renders these via Input id={`${prefix}-qr-input`}) -
  sourceQrInputId: 'move-source-qr-input',
  targetQrInputId: 'move-target-qr-input',
  qrInputByPlaceholder: 'input[placeholder*="Scan or enter container code / location path"]',

  // -- Preview / confirm -------------------------------------------------
  emptySourceText: 'Source is empty — nothing to move.',
  confirmMoveBtnPrefix: 'Confirm Move',
};

export default bulkContentsMoveLocators;
