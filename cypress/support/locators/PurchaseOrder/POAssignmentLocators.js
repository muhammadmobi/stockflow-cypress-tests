// cypress/support/locators/PurchaseOrder/POAssignmentLocators.js
//
// Selectors for the "Purchase Order Assignment" tab (Frontend/src/components/
// PO_Assignment/*.tsx). Verified by reading worker-list.tsx, worker-pos.tsx,
// SelectedWorker.tsx, AssignPo.tsx, workerPoList.tsx.

// NOTE (post code-review cleanup): ASSIGN_PO_BTN, WORKER_LABEL, SAVE_BTN,
// CANCEL_BTN, WORKER_LIST_ITEM, ASSIGNED_POS_HEADER, ASSIGNED_PO_ITEM,
// UNASSIGN_BTN, and NO_POS_ASSIGNED_TEXT are currently unreferenced —
// POAssignmentPage.js uses inline selectors (not always identical, e.g.
// WORKER_LIST_ITEM lacks the `:not(.Mui-disabled)` skeleton-row guard that
// selectFirstWorker() relies on) rather than these constants, and the
// page-object methods that used to consume WORKER_LABEL/CANCEL_BTN/
// NO_POS_ASSIGNED_TEXT (selectWorkerByName/assertWorkerSelected/clickCancel/
// assertNoPosAssigned) were removed as dead code. Left in place rather than
// deleted in case a future spec needs the exact intended selector — verify
// against the live DOM before wiring any of them back in.
const POAssignmentLocators = {
  ASSIGN_PO_BTN: 'button:contains("Assign Purchase Order")',
  DIALOG: '[role="dialog"]',
  WORKER_LABEL: '[role="dialog"] :contains("Worker:")',
  PO_SELECT_INPUT: '[role="dialog"] input[id^="react-select-"][id$="-input"]',
  PO_SELECT_MENU: '[class*="-menu"]',
  SAVE_BTN: '[role="dialog"] button:contains("Save")',
  CANCEL_BTN: '[role="dialog"] button:contains("Cancel")',

  WORKER_LIST_ITEM: 'ul li button, ul li [class*="MuiListItemButton"]',
  WORKERS_HEADER: ':contains("Workers (")',

  ASSIGNED_POS_HEADER: ':contains("Assigned Purchase Orders")',
  ASSIGNED_PO_ITEM: (poNumber) => `li:contains("PO: ${poNumber}")`,
  UNASSIGN_BTN: (poNumber) => `li:contains("PO: ${poNumber}") button`,
  NO_POS_ASSIGNED_TEXT: ':contains("No POs Assigned")',
};

export default POAssignmentLocators;
