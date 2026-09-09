// cypress/support/locators/InventoryActions/containerLocationLocators.js
//
// Locators for the Container Location mobile screen
// (route /MobileViewScreen/container-location, with ?mode=assign/change OR
// ?mode=unassign).
// Component: Frontend/src/components/ContainerLocation/index.tsx.
//
// Three steps:
//   1. container — Scan QR / Select From List
//   2. location  — only in assign/change mode (Scan QR / Select From List)
//   3. confirm   — only in unassign mode (warning Alert + remove button)
//
// The same route is used by Assign Container, Change Location AND Unassign
// Container; the URL `mode` param toggles step 2 vs step 3.

const containerLocationLocators = {
  // -- Tile labels --------------------------------------------------------
  warehouseManagementTile: 'Warehouse Management',
  assignmentTile: 'Assignment',
  unassignmentTile: 'Unassignment',
  assignContainerTile: 'Assign Container',
  unassignContainerTile: 'Unassign Container',

  // -- Toggle group buttons ----------------------------------------------
  scanQrToggle: 'Scan QR',
  selectFromListToggle: 'Select From List',

  // -- Step 1: container input -------------------------------------------
  containerQrInputId: 'container-qr-input',
  containerQrInputByPlaceholder: 'input[placeholder*="Scan or enter container code"]',
  containerHelperText: 'Scan container QR code or type code manually',
  selectContainerListBtnText: 'Select Container from List',
  containerSelectorTitle: 'Select Container',
  containerPickerSearchInput: 'input[placeholder*="Search by container code"]',

  // -- Step 2: location input (assign/change mode only) ------------------
  locationQrInputId: 'location-qr-input',
  locationQrInputByPlaceholder: 'input[placeholder*="Scan or enter location path"]',
  locationSelectInputLabel: 'Search or Select Location',
  selectTargetLocationHeading: 'Select Target Location',

  assignContainerBtn: 'Assign Container',

  // -- Step 3: confirm (unassign mode only) ------------------------------
  unassignWarningText: 'This will unassign the container from its current location and leave it unassigned.',
  removeContainerBtn: 'Remove Container from Location',

  // -- Confirmation dialogs (occupied target / move existing) ------------
  occupiedDialogTitleFragment: 'Bin',
  moveDialogConfirmText: 'Move',
  moveDialogCancelText: 'Cancel',

  // -- Inline alerts -----------------------------------------------------
  sameLocationInfoFragment: 'is already assigned to location',
};

export default containerLocationLocators;
