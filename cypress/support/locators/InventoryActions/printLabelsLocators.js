// cypress/support/locators/InventoryActions/printLabelsLocators.js
//
// Locators for the Print Labels (Print Asset) mobile screen
// (route /MobileViewScreen/print-asset).
// Component: Frontend/src/components/PrintAsset/index.tsx.
//
// Two tabs: Containers / Locations. Tapping a row opens a QrCodeDialog
// (Frontend/src/components/container/qrCodeDialoge.tsx). The Print button
// inside that dialog calls window.open(...) then prints from the new
// window — see wmsHelpers.iaStubWindowOpen for how tests assert that.

const printLabelsLocators = {
  // -- Outer entry / nav --------------------------------------------------
  warehouseManagementTile: 'Warehouse Management',
  printLabelsTile: 'Print Labels',
  pageHeading: 'Print Labels',

  // -- Tabs --------------------------------------------------------------
  containersTabText: 'Containers',
  locationsTabText: 'Locations',
  // MUI Tabs render <button role="tab"> — anchor by role + name.
  containersTabRole: '[role="tab"]:contains("Containers")',
  locationsTabRole: '[role="tab"]:contains("Locations")',

  // -- Search input (tab-specific placeholder) ---------------------------
  containersSearchPlaceholder: 'input[placeholder="Search by code, type, or location"]',
  locationsSearchPlaceholder: 'input[placeholder="Search by code or path"]',

  // -- List states ------------------------------------------------------
  loadingFragment: 'Loading…',
  endOfResultsFragment: 'End of results',
  noContainersFoundText: 'No containers found.',
  noLocationsFoundText: 'No locations found.',

  // -- QR dialog --------------------------------------------------------
  // The dialog has no title attribute. Anchor by the Print button it
  // renders. The button was renamed "Print Zebra" in the ZPL-printing refactor.
  qrPrintButtonText: 'Print Zebra',
};

export default printLabelsLocators;
