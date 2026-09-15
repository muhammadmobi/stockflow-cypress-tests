// cypress/support/locators/Roles/RolePrivilegesLocators.js
// Selectors for role-privilege tests. All DOM-touching happens here — never in specs.

const RolePrivilegesLocators = {
  // Table row action button (present for Admin, absent for Sales)
  rowActionButton: 'tbody button#long-button',

  // Toolbar action button (NOT in tbody — header-level add/import actions)
  toolbarActionButton: 'button#long-button:not(tbody *)',

  // Sign-in page path fragment
  signInPath: '/auth/jwt/sign-in',

  // Explicit 404 path — AdminAuthGuard redirects here for Sales+User
  notFoundPath: '/404',

  // Text patterns rendered by the React not-found component
  notFoundTextPattern: /page not found|404|not found/i,

  // Dashboard welcome greeting (visible only when dashboard loads successfully)
  dashboardWelcome: /welcome back/i,

  // MobileViewScreen — heading or any action tile
  mobileViewHeading: /inventory actions/i,

  // Cost/price column values in inventory table
  // Flexible selector: cells inside the tbody with a data-column or column header containing "cost" or "price"
  inventoryCostCells: 'tbody td',

  // Stat card for Total Inventory Cost on the cost report page
  costReportStatCard: /total inventory cost/i,
};

export default RolePrivilegesLocators;
