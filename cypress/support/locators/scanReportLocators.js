// cypress/support/locators/scanReportLocators.js
//
// All DOM selectors for the Scan Report page (/scan-report?poNumber=...).
// Derived from:
//   - Frontend/src/pages/ScanReport.tsx              (page shell)
//   - Frontend/src/components/IncommingInventory/ScanSummary.tsx (top stats panel)
//   - Frontend/src/components/IncommingInventory/ScanSummaryTable.tsx (table + tabs + row actions)
//   - Frontend/src/components/Item/searchStatisticCard.tsx (InfoCard — noClick=true variant on ScanReport)

const ScanReportLocators = {
  // ── Navigation ───────────────────────────────────────────────────────────
  incomingInvNavLink: 'a[aria-label="Incoming Inventory"][href="/incoming-inventory"]',

  // ── Header "Scan Report" menu item ────────────────────────────────────────
  // "Scan Report" lives inside the ScanMenu dropdown — the chevron next to the
  // "Scan" text button. It is NOT in the 3-dots long-button menu (that one
  // holds Add Product / PO Files / Download Template / Customize Columns).
  //
  // CAUTION: id="basic-button" is reused by *both* the Import/Export chevron
  // (importexportn.tsx) AND the Scan chevron (ScanMenu.tsx) on the same page —
  // duplicate HTML IDs. Same for the menu id="basic-menu". Plus both render
  // as <li component="li"> rather than <button>. So we cannot select by
  // `button[id="basic-button"]`. We disambiguate by scoping to the Stack that
  // contains the "Scan" text IMSButton (rendered next to the chevron under
  // selectedPo !== 'All POs' && !isSales() in List.tsx / orderList.tsx).
  scanTextButton: 'Scan',
  scanMenuTriggerInStack: '[id="basic-button"]',
  scanMenuPanel: '#basic-menu',
  scanReportMenuItemText: 'Scan Report',

  // ── ScanSummary panel (top of /scan-report page) ─────────────────────────
  poNumberLabel: 'PO. Number',

  // InfoCard with noClick=true renders Typography caption + h6 inside a <div>
  // (not a CardActionArea button). Walk caption → CardContent parent → h6.
  statTileCaption: 'span.MuiTypography-caption',
  statTileValue: 'h6.MuiTypography-h6',
  statTileSkeleton: '.MuiSkeleton-root',

  // ── ScanSummaryTable – tabs ───────────────────────────────────────────────
  tabs: '[role="tab"]',

  // ── Table rows ────────────────────────────────────────────────────────────
  tableBody: 'tbody',
  tableRow: 'tbody tr',

  // ── Row action menu (MoreVertIcon per row) ────────────────────────────────
  // Each row's IconButton has id="long-button-<serialNumber>" so we cannot
  // use a static id; the aria-label="more" attribute is stable across rows.
  rowActionBtn: 'button[aria-label="more"]',
  rowActionMenu: '[role="menu"]',

  // ── Confirmation dialog ───────────────────────────────────────────────────
  confirmDialog: '[role="dialog"]',

  // ── API paths (for cy.intercept) ──────────────────────────────────────────
  api: {
    reports: '/incoming-items/reports',
    scannedItems: '/incoming-items/scanned-items',
    markStatus: '/incoming-items/mark-status',
  },
};

export default ScanReportLocators;
