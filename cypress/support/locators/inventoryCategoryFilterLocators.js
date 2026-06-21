/**
 * Locators — Inventory Category Filter & Product Status Tabs
 * Source verified against:
 *   Frontend/src/components/Item/ItemList.tsx
 *   Frontend/src/components/Item/CategoryList.tsx
 *   Frontend/src/components/IncommingInventory/ProductListActionMenu.tsx
 *   Frontend/src/components/common/ConfirmationDialog.tsx
 */

const ICFLocators = {
  // ── Category dropdown (React-Select virtualised) ────────────────────────
  categoryDropdownInput:  '[class*="control"] input',
  categoryDropdownMenu:   'div[class*="menu"]',

  // ── Desktop tab labels (ItemList.tsx:2942) ──────────────────────────────
  tabActiveProducts:      'Active Products',
  tabInactiveProducts:    'Inactive Products',
  tabLowStock:            'Low Stock',

  // Low-stock badge chip rendered inside the Low-Stock tab (ItemList.tsx:2944)
  lowStockBadge:          '.MuiChip-root',

  // ── Search input (confirmed: InvViewLocators.js, ItemList.tsx) ──────────
  searchInput:            '#searchInputRef',

  // ── MRT table (Material React Table) ───────────────────────────────────
  tableBody:              'tbody',
  tableRow:               'tbody tr',
  headerCheckbox:         'thead tr input[type="checkbox"]',
  rowCheckbox:            'tbody tr td:first-child input[type="checkbox"]',

  // ── Row action menu (ProductListActionMenu.tsx:168) ─────────────────────
  rowActionButton:        '#long-button',
  rowActionMenu:          '[role="menu"]',

  // Menu item text labels (ProductListActionMenu.tsx:563,575)
  menuItemDeactivate:     'Deactivate Product',
  menuItemActivate:       'Activate Product',
  menuItemSetThreshold:   'Set Alert Threshold',

  // ── Bulk action button text (ItemList.tsx:1035) — visible once rows are
  //    selected; find with cy.contains('button', label) ───────────────────
  bulkMarkInactive:       'Mark Inactive',
  bulkMarkActive:         'Mark Active',

  // ── Confirmation dialog (ConfirmationDialog.tsx) ────────────────────────
  confirmYesBtn:          /^Yes$/i,
  confirmNoBtn:           /^No$/i,

  // ── Pagination ───────────────────────────────────────────────────────────
  paginationNextBtn:      '[aria-label="Go to next page"]',
  rowsPerPageCombo:       '[role="combobox"]',

  // ── Empty-state / no-rows indicator ────────────────────────────────────
  noRowsOverlay:          'td[colspan]',
};

export default ICFLocators;
