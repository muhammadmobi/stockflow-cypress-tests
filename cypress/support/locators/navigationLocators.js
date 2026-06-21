// cypress/support/locators/navigationLocators.js

const navigationLocators = {
  // Main menu items - accessible names used with findByRole('link', { name })
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  incomingInventory: 'Incoming Inventory',
  purchaseOrders: 'Purchase Orders',
  workOrders: 'Work Orders',
  inventoryActions: 'Inventory Actions',
  inventoryAudit: 'Inventory Audit',
  printers: 'Printers',

  // Asset Id accordion (expandable - no standard role, use contains on li)
  assetId: 'Asset Id',

  // Asset Id sub-menu items
  generateAssetId: 'Generate Asset ID',
  assetIdDisassembly: 'Disassembly',
  assetIdAssembly: 'Assembly',
  assetIdSearch: 'Search Lifecycle',

  // Sub-menu parent items (expandable accordions - no standard role, use contains)
  reports: 'Reports',
  configuration: 'Configuration',

  // Reports sub-menu items
  purchaseOrderReport: 'Purchase Order Report',
  orderReport: 'Order Report',
  costReport: 'Cost Report',
  salesReport: 'Sales Report',
  customReports: 'Custom Reports',
  inventoryReport: 'Inventory Report',
  assetLifecycleReport: 'Asset Lifecycle Report',
  inventoryAgingReport: 'Inventory Aging Report',
  warehouseLocationReport: 'Warehouse Location Report',

  // Configuration sub-menu items
  attributes: 'Attribute',
  categories: 'Categories',
  categoriesLink: 'a[href*="/category"]',
  scanConfig: 'Scan Config',
  generalConfig: 'General Config',
  brainboxConfig: 'BrainBox Configuration',
  mappingTemplates: 'Mapping Templates',

  // Warehouse Management (accordion - no standard role, use contains)
  warehouseManagement: 'Warehouse Management',
  warehouseLocations: 'Locations',
  warehouseContainers: 'Containers',
  warehouseRecycleBin: 'Recycle Bin',
  containerAssignment: 'Container Assignment',

  // External link at bottom of sidebar
  accountWiseLink: 'Open Account Wise',

  // Collapse/expand toggle button (scoped to vertical nav to avoid ambiguity)
  navToggleButton: '[class*="layout__nav__vertical"] button.MuiIconButton-sizeSmall',

  // AccountWise icon in collapsed (mini) sidebar - scoped to vertical nav, mini nav renders plain MuiSvgIcon without data-testid
  accountWiseMiniIcon: '[class*="layout__nav__vertical"] .MuiSvgIcon-root',
};

export default navigationLocators;
