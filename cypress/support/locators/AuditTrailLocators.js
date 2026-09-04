/**
 * AuditTrailLocators.js
 *
 * Selectors for the Item Audit Trail dialog opened from the ⋮ action menu on
 * a serialized item row in the Product Details (ItemView) page of
 * /incoming-inventory. Used by AuditTrailPage and AuditTrailTests.cy.js.
 *
 * The dialog is rendered by IMSDialog (Frontend/src/components/common/Model.tsx)
 * inside ItemActionMenu.tsx. Title is dynamic:
 *   "Item Audit Trail (Serial Number: {serialNumber})"
 *
 * Empty state copy: "No Audit Trail Available" (HistoryIcon + Typography)
 * Each audit entry is a <li> in a <ul> with field-label pairs as
 * <strong>FormattedKey:</strong> value
 */

const AuditTrailLocators = {
  // Item row action menu (⋮ button on each item row in the items table)
  itemActionMenuBtn:      'button#long-button',

  // The Menu rendered by MUI when the ⋮ is clicked
  menu:                   '[role="menu"]',
  menuItem:               '[role="menuitem"]',

  // Visible label of the audit-trail menu item — used with cy.contains()
  auditTrailMenuItemText: 'Audit trail',

  // The IMSDialog (MUI Dialog) container and title element
  dialog:                 '[role="dialog"]',
  dialogTitle:            '[role="dialog"] #scroll-dialog-title',

  // Close button — IMSDialog renders an IconButton with a CloseIcon (MUI)
  closeIcon:              '[role="dialog"] svg[data-testid="CloseIcon"]',

  // Loading state — CircularProgress while React Query is fetching
  loadingSpinner:         '[role="dialog"] .MuiCircularProgress-root',

  // Empty state
  emptyStateText:         'No Audit Trail Available',

  // Audit entry list — <ul><li>…</li></ul> with field cards inside each <li>
  auditEntryList:         '[role="dialog"] ul',
  auditEntry:             '[role="dialog"] ul li',
};

export default AuditTrailLocators;
