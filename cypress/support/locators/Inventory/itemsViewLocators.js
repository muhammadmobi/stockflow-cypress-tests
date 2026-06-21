// Locators for the Inventory Items View selection toolbar (/inventory, Items View tab).
// Source of truth: Frontend/src/components/Item/ItemList.tsx (tabs row, "Items View"
// pill ~line 2341) + Frontend/src/components/Item/InventoryItemsList.tsx
// (fillParent inlineSelectionActions ~line 920: "{n} selected", "Stock Out Selected (n)",
// "Print Asset IDs (n)", `Select all "{total}"`, "Clear"; select-all hits
// GET /items/serial-numbers; selection clears on search/status/category change).

const itemsViewLocators = {
  TAB_ITEMS_VIEW: 'Items View',

  ROW_CHECKBOX: 'tbody tr input[type="checkbox"]',
  HEADER_CHECKBOX: 'thead input[type="checkbox"]',

  SELECTED_COUNT: /\d+ selected/, // "N selected"
  STOCK_OUT_SELECTED: /Stock Out Selected/,
  PRINT_ASSET_IDS: /Print Asset IDs/,
  SELECT_ALL: /Select all/,
  CLEAR_BTN: /^Clear$/,

  SERIAL_NUMBERS_ENDPOINT: '**/items/serial-numbers**',
};

export default itemsViewLocators;
