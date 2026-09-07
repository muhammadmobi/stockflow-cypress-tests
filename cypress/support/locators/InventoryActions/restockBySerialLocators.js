// cypress/support/locators/InventoryActions/restockBySerialLocators.js
//
// Locators for the Restock-by-serial mobile screen
// (route /restock, reached via Inventory Actions → Inventory Management
// → Restock).
// Scanned items render in a SessionScannedList with the serial number as
// the `title` attribute on a <p>; the parent stack contains a status <p>
// that shows "Scanned" on success or the server-side scanStatus on error
// (e.g. "Incoming", "Available", "Missing", "Reserved").

const restockBySerialLocators = {
  sideNavLink: 'a[aria-label="Inventory Actions"][href="/MobileViewScreen"]',
  inventoryManagementTile: 'Inventory Management',
  restockTile: 'Restock',

  serialInput: 'input[type="text"]',

  // Scan button can be optional (the input handles Enter), but specs that
  // type without {enter} should click it.
  scanButton: 'Scan',

  // SessionScannedList row keyed by serial number title.
  sessionItemBySerial: (serial) => `p[title="${serial}"]`,
};

export default restockBySerialLocators;
