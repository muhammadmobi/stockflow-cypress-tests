// cypress/support/locators/PurchaseOrder/POListLocators.js
//
// Selectors for the Purchase Orders list page (`/purchase-orders`, tab 0).
// Source: Frontend/src/components/PurchaseOrder/List.tsx (verified by reading
// the component — column order, chip text, row-action conditions, and the
// delete confirmation dialog strings below are all literal copies).

const POListLocators = {
  PAGE: {
    TAB_PURCHASE_ORDERS: '[role="tab"]:contains("Purchase Orders")',
    TAB_ASSIGNMENT: '[role="tab"]:contains("Purchase Order Assignment")',
    SEARCH_INPUT: '#searchInputRef',
    SEARCH_SUBMIT: 'button[type="submit"]',
    CREATE_BTN: 'button:contains("Create Purchase Order"), button:contains("Create")',
    TEMPLATE_BTN: 'button:contains("Download Template"), button:contains("Template")',
    RESULT_COUNT_TEXT: (term) => `:contains("Result(s) for")`,
    NO_RESULT_TEXT: ':contains("No Result")',
    PAGINATION_FOOTER: 'p:contains("Record:")',
  },

  // Table columns — order matches List.tsx column defs.
  ROW: {
    byPO: (poNumber) => `tr:has(td:contains("${poNumber}"))`,
    PO_NUMBER_CELL: 'td[data-index="0"]',
    SOURCE_CELL: 'td[data-index="1"]',
    REFERENCE_NO_CELL: 'td[data-index="2"]',
    VENDOR_NAME_CELL: 'td[data-index="3"]',
    TOTAL_SCANNED_CELL: 'td[data-index="4"]',
    QUANTITIES_CELL: 'td[data-index="5"]',
    DISCREPANCY_CELL: 'td[data-index="6"]',
    ADJUSTMENT_CELL: 'td[data-index="7"]',
    CREDIT_MEMO_CELL: 'td[data-index="8"]',
    ASSIGNED_WORKERS_CELL: 'td[data-index="9"]',
    STATUS_CELL: 'td[data-index="10"]',
    SOURCE_CHIP: '[class*="MuiChip"]',
  },

  ACTIONS: {
    DETAILS_BTN: 'button:contains("Details"), a:contains("Details")',
    CLOSE_PO_BTN: 'button:contains("Close PO")',
    REOPEN_BTN: 'button:contains("Reopen")',
    // The Delete action is an icon-only IMSButton with no text label and no
    // data-testid in production — List.tsx renders <DeleteIcon> with no
    // distinguishing attribute. It is CONDITIONALLY UNRENDERED (not merely
    // disabled) when canDelete===false or the user isn't admin, so specs
    // must assert absence, not a disabled state, for the blocked partition.
    DELETE_ICON_BTN: 'button',
    // Mobile ⋮ menu
    ROW_MENU_BTN: 'button#long-button',
    MENU_ROOT: '[role="menu"]',
  },

  // Delete confirmation dialog (List.tsx renders a shared ConfirmationDialog —
  // buttons are literally "Yes"/"No", not "Confirm"/"Cancel").
  DELETE_DIALOG: {
    HEADING: ':contains("Confirm Purchase Order Deletion")',
    CONFIRM_INPUT: 'input[placeholder="Type DELETE to confirm"]',
    YES_BTN: 'button:contains("Yes")',
    NO_BTN: 'button:contains("No")',
  },

  TOASTS: {
    reopenSuccess: 'Purchase order reopened successfully.',
    deleteSuccess: 'Purchase order deleted successfully.',
  },
};

export default POListLocators;
