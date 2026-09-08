// cypress/support/locators/InventoryActions/workOrdersMobileLocators.js
//
// Locators for the Work Orders mobile screen
// (route /MobileViewScreen/work-order). The component is shared with the
// desktop Work Orders page (Frontend/src/pages/WorkOrderListView.tsx) and
// branches on isMobile breakpoint.
//
// Mobile renders Box cards with a Chip status badge per WO. Clicking a
// card navigates to the desktop WO detail at /work-order/:number/:id.

const workOrdersMobileLocators = {
  sideNavLink: 'a[aria-label="Inventory Actions"][href="/MobileViewScreen"]',
  workOrdersTile: 'Work Orders',

  // The WO list cards have a status Chip with a className containing
  // MuiChip-label and the status text.
  statusChipSelector: '.MuiChip-label',

  // The "Work Order Number" caption identifies a card; we use it to count
  // visible cards.
  workOrderCardLabel: 'Work Order Number',

  // Detail-page Scan button (rendered by the WorkOrderListView desktop
  // detail layout reached after card click).
  scanButton: 'Scan',
};

export default workOrdersMobileLocators;
