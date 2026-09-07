// cypress/support/locators/InventoryActions/landingScreenLocators.js
//
// Locators for the Inventory Actions landing screen at /MobileViewScreen
// (component: Frontend/src/components/IncommingInventory/MobileViewSeparateScreen.tsx).
// The screen is a state-machine: step 0 = tile menu, step 1 = PO picker.
// Selectors use accessible names so they survive MUI version bumps.

const landingScreenLocators = {
  // Side-nav entry that opens the screen
  sideNavLink: 'a[aria-label="Inventory Actions"][href="/MobileViewScreen"]',

  // Step-0 root-menu tile labels (button text — case-sensitive match in component)
  rootTiles: {
    stockIn: 'Stock In',
    stockOut: 'Stock Out',
    inventoryManagement: 'Inventory Management',
    productOperations: 'Product Operations',
    workOrders: 'Work Orders',
    warehouseManagement: 'Warehouse Management',
    asset: 'Asset',
    auditScan: 'Audit Scan', // conditional — only when /inventory-audit/active returns an active audit
  },

  // Stock-In sub-tiles.
  // Dev consolidation (2026-06): the former 4 sub-tiles (Stock In Items /
  // Stock In Products / Add By Product / Product Listing) were merged into a
  // single Smart Stock In flow. The root "Stock In" tile now opens the PO
  // picker directly; the deep-link sub-menu (?menuGroup=stockIn) renders a
  // single "Start Stock In" button.
  stockInSubTiles: {
    startStockIn: 'Start Stock In',
  },

  // Stock-Out sub-tiles
  stockOutSubTiles: {
    stockOutItems: 'Stock Out Items',
    stockOutProducts: 'Stock Out Products',
    stockOutByProductScanning: 'Stock Out by Product Scanning',
  },

  // Inventory-Management sub-tiles
  inventoryManagementSubTiles: {
    restockProducts: 'Restock Products',
    restock: 'Restock',
    markDamagedProducts: 'Mark Damaged Products',
    scanDamagedItems: 'Scan Damaged Items',
  },

  // Product-Operations sub-tiles
  productOperationsSubTiles: {
    checkItemStatus: 'Check Item Status',
  },

  // Warehouse-Management root sub-tiles
  warehouseSubTiles: {
    assignment: 'Assignment',
    unassignment: 'Unassignment',
    viewContents: 'View Contents',
    printLabels: 'Print Labels',
  },

  // Warehouse → Assignment children
  warehouseAssignmentSubTiles: {
    assignItems: 'Assign Items',
    assignProducts: 'Assign Products',
    assignContainer: 'Assign Container',
    bulkContentsMove: 'Bulk Contents Move',
  },

  // Warehouse → Unassignment children
  warehouseUnassignmentSubTiles: {
    unassignItems: 'Unassign Items',
    unassignProducts: 'Unassign Products',
    unassignContainer: 'Unassign Container',
  },

  // Asset sub-tiles
  assetSubTiles: {
    assetGeneration: 'Asset Generation',
    assembly: 'Assembly',
    disassembly: 'Disassembly',
  },

  // Section headings rendered by the active group
  groupHeadings: {
    selectOperation: 'Select Operation',
    stockIn: 'Stock In',
    stockOut: 'Stock Out',
    inventoryManagement: 'Inventory Management',
    productOperations: 'Product Operations',
    warehouseManagement: 'Warehouse Management',
    assignment: 'Assignment',
    unassignment: 'Unassignment',
    asset: 'Asset',
  },

  // Back buttons
  backToMenu: '← Back to Menu',
  backToWarehouse: '← Back to Warehouse',
  backFromPoPicker: '← Back',

  // PO picker (step 1)
  poSearchInputLabel: 'Search Purchase Orders',

  // PO-list refetch spinner (rendered while react-query isRefetching=true)
  poListLoader: '.MuiLinearProgress-root',
};

export default landingScreenLocators;
