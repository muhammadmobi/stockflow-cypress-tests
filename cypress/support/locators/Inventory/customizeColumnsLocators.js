// Locators for the Inventory Customize Columns dialog (/inventory).
// Source of truth: Frontend/src/components/Item/ItemHeadersMenue/inventoryActionMenue.tsx:147
// (header kebab #long-button → "Customize Columns" MenuItem, TuneIcon) +
// Frontend/src/components/InvetoryListViews/inventoryListViewsForm.tsx
// (form#attribute-form; columns render as labelled checkboxes; submit posts/patches
// /configs with { name, type, configJson:{columns}, userID }).

const customizeColumnsLocators = {
  // Toolbar kebab (NOT a per-row #long-button — scope with .not('tbody *')).
  TOOLBAR_KEBAB: 'button#long-button',
  MENU: '[role="menu"]',
  CC_MENU_ITEM: /Customize Columns/i,

  DIALOG: 'div[role="dialog"]',
  FORM: '#attribute-form',
  SUBMIT_BTN: 'button[type="submit"][form="attribute-form"]', // label "Save"
  CLOSE_ICON: '[data-testid="CloseIcon"]',

  SAVE_TOAST: 'Columns settings successfully updated.',

  // Config persistence: POST /configs (new) or PATCH /configs/:id (existing).
  CONFIGS_POST: '**/configs',
  CONFIGS_PATCH: '**/configs/*',
  CONFIGS_GET: '**/configs**',

  // Inventory grid column headers. MRT renders native <th> (implicit columnheader
  // role — an attribute selector won't match it), so target `thead th` directly.
  // The grid renders one header per saved configJson.columns entry (ItemList.tsx:770).
  GRID_COLUMN_HEADER: 'thead th',
};

export default customizeColumnsLocators;
