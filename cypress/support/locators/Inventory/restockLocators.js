// Locators for the Inventory Restock row action (/inventory).
// Source of truth: Frontend/src/components/IncommingInventory/ProductListActionMenu.tsx
// (Restock MenuItem gated `['/inventory'].includes(backPath)`, disabled when the
// category allowItems/allowVariants — i.e. enabled for product-only rows only) +
// Frontend/src/components/InvetoryListViews/RestockModel.tsx (ProductRestock modal).

const restockLocators = {
  // There are TWO #long-button elements per page (header kebab + per-row). Scope
  // to the row via cy.contains('tbody tr', searchTerm).find(ROW_MENU_BTN).
  ROW_MENU_BTN: 'button[id="long-button"]',
  MENU: '[role="menu"]',
  MENU_ITEM: '[role="menuitem"]',
  RESTOCK_LABEL: /^Restock$/,

  // ProductRestock modal (RestockModel.tsx) — IMSDialog wrapper.
  MODAL: 'div[role="dialog"]',
  FORM: '#reportDescrepany-form', // form id carries the source typo (verified)
  QTY_INPUT: '#quantity',
  SUBMIT_BTN: 'button[type="submit"][form="reportDescrepany-form"]', // label "Restock"

  ENDPOINT: '**/products/restock-product',
};

export default restockLocators;
