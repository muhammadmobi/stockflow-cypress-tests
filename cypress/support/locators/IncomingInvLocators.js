const IncomingInvLocators = {
  // Existing
  poNumberTxtBox: '#ponumber',
  fileInput: 'input[name="file"]',

  // Navigation
  navLink: 'a[aria-label="Incoming Inventory"][href="/incoming-inventory"]',

  // PO selector (used by openChangeStatusDialog)
  poDropdown: '#Incomming-inventory-P-O-1',
  poDropdownInput: '#Incomming-inventory-P-O-1 input',
  poDropdownMenu: '[class*="-menu"]',

  // Table row actions
  firstRowActionBtn: 'tbody tr:first-child button#long-button',
  changeStatusMenuItem: 'Change Status',
  updateExpectedQtyMenuItem: 'Update Expected Quantity',

  // Change Status dialog
  dialog: '[role="dialog"]',
  chooseStatusLabel: 'Choose Status',
  chooseSourceLabel: 'Choose Source',
  damageReasonLabel: 'Select damage reason',
  dropdownOption: '[role="option"]',
  serialNumberInput: '#serialNumberForReport',
  quantityInput: '#quantity',

  // Selector for "Choose Source" presence check (used inside cy.get('body'))
  dialogWithSource: '[role="dialog"]:contains("Choose Source")',

  // Selector for "Select Purchase Order" presence check inside dialog (product-only flow)
  dialogWithPO: '[role="dialog"]:contains("Select Purchase Order")',
  dialogPODropdown: '[role="dialog"] #Incomming-inventory-P-O-1',
  dialogPODropdownInput: '[role="dialog"] #Incomming-inventory-P-O-1 input',

  // Inventory nav (used by MoveItemTests TC08)
  inventoryNavLink: 'a[aria-label="Inventory"][href="/inventory"]',

  // Generic table row + action menu (used by assertMoveItemAbsentInFirstTableRow)
  tableRow: 'tbody tr',
  rowActionBtn: 'button[id="long-button"]',
  actionMenu: '[role="menu"]',

  // ─── Add Product to PO Feature ─────────────────────────────────────────────
  // Header long button menu (not row-level — sits outside tbody)
  headerLongButton: 'button#long-button',
  addProductMenuItem: 'Add Product',

  // ProductImsDialog — search screen
  addProductDialogTitle: 'Add Product',
  productSearchInput: 'label:contains("Search Product") + div input, input[type="text"]',
  productSearchButton: 'button:contains("Search")',
  productCardList: 'ul',
  noProductsFound: 'No products found',

  // ProductImsDialog — cost/quantity form (showCostInput === true)
  expectedQuantityInput: 'input[type="number"]',
  costInput: 'input[type="number"]',
  sourceLocationInput: 'input[type="text"]',

  // ProductImsDialog — footer buttons
  addButton: 'button:contains("Add")',
  addToPOButton: 'button:contains("Add to PO")',
  backButton: 'button:contains("Back")',
  closeDialogButton: 'button:contains("✕")',

  // ─── Export (ImportExport chevron dropdown — importexportn.tsx) ────────────
  // Only rendered in the header when selectedPo !== 'All POs'.
  // The chevron button opens a small Menu containing the ExportButton MenuItem.
  exportDropdownBtn: 'li#basic-button[aria-haspopup="true"]',
  exportDropdownMenu: '#basic-menu',
};

export default IncomingInvLocators;

