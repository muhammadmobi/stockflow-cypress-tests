// cypress/support/locators/quickViewLocators.js
//
// ProductQuickViewPanel locators (Frontend/src/components/common/ProductQuickViewPanel.tsx).
//
// Clicking a serialized (hasItems) product row on Inventory / Incoming Inventory
// no longer navigates to the product-details PAGE — it toggles this docked pane
// beside the still-mounted product table ('split' on desktop, 'floating' on
// mobile) with the product's item list embedded in it. Quantity-only products
// keep the original click-through.
//
// Shared by IncomingInvPage and ItemViewPage: the panel is one component hosted
// by two screens, so its selectors live in one module rather than being copied
// into each page object's own locator file.

const quickViewLocators = {
  // The panel is a plain MUI <Paper>; it carries no id/testid of its own, so it
  // is reached by walking up from a control that only IT renders.
  panel: '.MuiPaper-root',

  // Anchor for the panel. Matched as a BUTTON on purpose: the row Actions menu
  // (ProductListActionMenu.tsx) also has a "View Details" entry, but that is a
  // MenuItem — an <li role="menuitem"> — so the button match stays unambiguous.
  viewDetailsBtn: {
    tag: 'button',
    text: /^View Details$/,
  },

  // Header ✕ (IconButton aria-label="Close").
  closeBtn: 'button[aria-label="Close"]',

  // The embedded InventoryItemsList table. Always query this INSIDE the panel:
  // the product table stays mounted, so an unscoped `table.MuiTable-root`
  // matches both it and this one.
  itemsTable: 'table.MuiTable-root',
  emptyStateText: 'No records to display',
};

export default quickViewLocators;
