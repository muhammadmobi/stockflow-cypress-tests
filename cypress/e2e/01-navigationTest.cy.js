import urls from "../fixtures/urls.json";
import navigationPageData from "../fixtures/navigationPageData.json";
import NavigationPage from "../pageObjects/navigationPage";
import navigationLocators from "../support/locators/navigationLocators";
import { requireRoleOrSkip } from '../support/helpers/roleGuards';

describe("Navigation Tests", { tags: ['@regression'] }, () => {
  let navigationPage;

  beforeEach(() => {
    navigationPage = new NavigationPage();
    cy.on('uncaught:exception', (err) => {
      if (err?.message?.includes('Request failed with status code')) return false;
      return true;
    });
    // Use the shared admin session. It validates on the Keycloak access token in
    // sessionStorage — the old inline validate checked localStorage['stock-wise'],
    // which the app no longer populates with a token under Keycloak, so the
    // session failed validation immediately after creation.
    cy.authSession('admin');

    // After session is restored, visit dashboard
    cy.visit(urls.dashboard);
  });

  // Use case — happy path: landing on dashboard confirms successful login redirect
  it("SW-NAV-TC01: Verify dashboard page", { tags: ['@smoke'] }, () => {
    navigationPage.verifyUrl(urls.dashboard);
  });

  // Use case — direct link navigation
  it("SW-NAV-TC02: Verify navigation to Inventory page", { tags: ['@smoke'] }, () => {
    navigationPage.clickInventory();
    navigationPage.verifyNavigation(urls.inventory, navigationPageData.headings.inventory);
  });

  // Use case — direct link navigation
  it("SW-NAV-TC03: Verify navigation to Incoming Inventory page", () => {
    navigationPage.clickIncomingInventory();
    navigationPage.verifyNavigation(urls.incomingInventory, navigationPageData.headings.incomingInventory);
  });

  // Use case — direct link navigation
  it("SW-NAV-TC04: Verify navigation to Purchase Orders page", () => {
    navigationPage.clickPurchaseOrders();
    navigationPage.verifyNavigation(urls.purchaseOrders, navigationPageData.headings.purchaseOrders);
  });

  // Use case — direct link navigation
  it("SW-NAV-TC05: Verify navigation to Work Orders page", () => {
    navigationPage.clickWorkOrders();
    navigationPage.verifyNavigation(urls.workOrders, navigationPageData.headings.workOrders);
  });

  // Use case — direct link navigation
  it("SW-NAV-TC06: Verify navigation to Inventory Actions page", () => {
    navigationPage.clickInventoryActions();
    navigationPage.verifyNavigation(urls.inventoryActions, navigationPageData.headings.inventoryActions);
  });

  // EP — valid partition: accordion expands and sub-items become visible
  it("SW-NAV-TC07: Verify expansion of Asset Id menu", () => {
    navigationPage.clickAssetId();
    navigationPage.verifySubItemVisible(navigationLocators.generateAssetId);
  });

  // Use case — accordion sub-item navigation: Generate Asset ID
  it("SW-NAV-TC08: Verify navigation to Generate Asset ID page", () => {
    navigationPage.clickAssetId();
    navigationPage.clickGenerateAssetId();
    navigationPage.verifyNavigation(urls.assetId, navigationPageData.headings.assetId);
  });

  // Use case — accordion sub-item navigation: Disassembly
  it("SW-NAV-TC09: Verify navigation to Asset Id Disassembly page", () => {
    navigationPage.clickAssetId();
    navigationPage.clickAssetIdDisassembly();
    navigationPage.verifyNavigation(urls.assetIdDisassembly, navigationPageData.headings.assetIdDisassembly);
  });

  // Use case — accordion sub-item navigation: Assembly
  it("SW-NAV-TC10: Verify navigation to Asset Id Assembly page", () => {
    navigationPage.clickAssetId();
    navigationPage.clickAssetIdAssembly();
    navigationPage.verifyNavigation(urls.assetIdAssembly, navigationPageData.headings.assetIdAssembly);
  });

  // Use case — accordion sub-item navigation: Search Lifecycle
  it("SW-NAV-TC11: Verify navigation to Asset Id Search Lifecycle page", () => {
    navigationPage.clickAssetId();
    navigationPage.clickAssetIdSearch();
    navigationPage.verifyNavigation(urls.assetIdSearch, navigationPageData.headings.assetIdSearch);
  });

  // SW-NAV-TC12 RETIRED: "Inventory Audit" is no longer a standalone /inventory-audit
  // link. The ABC epic moved it into its own accordion module at /abc
  // (children: Classification /abc/classification, Audits /abc/audits), so the
  // direct-link navigation this case asserted no longer exists. ABC has its own
  // dedicated coverage; the nav item's presence/absence is still covered by the
  // Worker/admin visibility cases (verifyNavLinkAbsent(inventoryAudit)).

  // Use case — direct link navigation
  it("SW-NAV-TC13: Verify navigation to Printers page", () => {
    navigationPage.clickPrinters();
    navigationPage.verifyNavigation(urls.printers, navigationPageData.headings.printers);
  });

  // EP — valid partition: accordion expands and sub-items become visible
  it("SW-NAV-TC14: Verify expansion of Warehouse Management menu", { tags: ['@smoke'] }, () => {
    navigationPage.clickWarehouseManagement();
    navigationPage.verifySubItemVisible(navigationLocators.warehouseLocations);
  });

  // Use case — accordion sub-item navigation: Locations
  it("SW-NAV-TC15: Verify navigation to Warehouse Locations page", () => {
    navigationPage.clickWarehouseManagement();
    navigationPage.clickWarehouseLocations();
    navigationPage.verifyNavigation(urls.warehouseLocations, navigationPageData.headings.warehouseLocations);
  });

  // Use case — accordion sub-item navigation: Containers
  it("SW-NAV-TC16: Verify navigation to Warehouse Containers page", () => {
    navigationPage.clickWarehouseManagement();
    navigationPage.clickWarehouseContainers();
    navigationPage.verifyNavigation(urls.warehouseContainers, navigationPageData.headings.warehouseContainers);
  });

  // Use case — accordion sub-item navigation: Recycle Bin
  it("SW-NAV-TC17: Verify navigation to Warehouse Recycle Bin page", () => {
    navigationPage.clickWarehouseManagement();
    navigationPage.clickWarehouseRecycleBin();
    navigationPage.verifyNavigation(urls.warehouseRecycleBin, navigationPageData.headings.warehouseRecycleBin);
  });

  // EP — valid partition: accordion expands and sub-items become visible
  it("SW-NAV-TC18: Verify expansion of Reports menu", { tags: ['@smoke'] }, () => {
    navigationPage.clickReports();
    navigationPage.verifySubItemVisible(navigationLocators.purchaseOrderReport);
  });

  // Use case — accordion sub-item navigation: Purchase Order Report
  it("SW-NAV-TC19: Verify navigation to Purchase Order Report page", () => {
    navigationPage.clickReports();
    navigationPage.clickPurchaseOrderReport();
    navigationPage.verifyNavigation(urls.purchaseOrderReport, navigationPageData.headings.purchaseOrderReport);
  });

  // Use case — accordion sub-item navigation: Cost Report
  it("SW-NAV-TC20: Verify navigation to Cost Report page", () => {
    navigationPage.clickReports();
    navigationPage.clickCostReport();
    navigationPage.verifyNavigation(urls.costReport, navigationPageData.headings.costReport);
  });

  // Use case — accordion sub-item navigation: Sales Report
  it("SW-NAV-TC21: Verify navigation to Sales Report page", () => {
    navigationPage.clickReports();
    navigationPage.clickSalesReport();
    navigationPage.verifyNavigation(urls.salesReport, navigationPageData.headings.salesReport);
  });

  // Use case — accordion sub-item navigation: Custom Reports
  it("SW-NAV-TC22: Verify navigation to Custom Reports page", () => {
    navigationPage.clickReports();
    navigationPage.clickCustomReports();
    navigationPage.verifyNavigation(urls.customReports, navigationPageData.headings.customReports);
  });

  // Use case — accordion sub-item navigation: Inventory Report
  it("SW-NAV-TC23: Verify navigation to Inventory Report page", () => {
    navigationPage.clickReports();
    navigationPage.clickInventoryReport();
    navigationPage.verifyNavigation(urls.inventoryReport, navigationPageData.headings.inventoryReport);
  });

  // Use case — accordion sub-item navigation: Asset Lifecycle Report
  it("SW-NAV-TC24: Verify navigation to Asset Lifecycle Report page", () => {
    navigationPage.clickReports();
    navigationPage.clickAssetLifecycleReport();
    navigationPage.verifyNavigation(urls.assetLifecycleReport, navigationPageData.headings.assetLifecycleReport);
  });

  // Use case — accordion sub-item navigation: Inventory Aging Report
  it("SW-NAV-TC25: Verify navigation to Inventory Aging Report page", () => {
    navigationPage.clickReports();
    navigationPage.clickInventoryAgingReport();
    navigationPage.verifyNavigation(urls.inventoryAgingReport, navigationPageData.headings.inventoryAgingReport);
  });

  // Use case — accordion sub-item navigation: Warehouse Location Report
  it("SW-NAV-TC26: Verify navigation to Warehouse Location Report page", () => {
    navigationPage.clickReports();
    navigationPage.clickWarehouseLocationReport();
    navigationPage.verifyNavigation(urls.warehouseLocationReport, navigationPageData.headings.warehouseLocationReport);
  });

  // EP — valid partition: accordion expands and sub-items become visible
  it("SW-NAV-TC27: Verify expansion of Configuration menu", { tags: ['@smoke'] }, () => {
    navigationPage.clickConfiguration();
    navigationPage.verifySubItemVisible(navigationLocators.attributes);
  });

  // Use case — accordion sub-item navigation: Attributes
  it("SW-NAV-TC28: Verify navigation to Attributes page", () => {
    navigationPage.clickConfiguration();
    navigationPage.clickAttributes();
    navigationPage.verifyNavigation(urls.attributes, navigationPageData.headings.attributes);
  });

  // Use case — accordion sub-item navigation: Categories
  it("SW-NAV-TC29: Verify navigation to Categories page", () => {
    navigationPage.clickConfiguration();
    navigationPage.clickCategories();
    navigationPage.verifyNavigation(urls.category, navigationPageData.headings.categories);
  });

  // Use case — accordion sub-item navigation: Scan Config
  it("SW-NAV-TC30: Verify navigation to Scan Config page", () => {
    navigationPage.clickConfiguration();
    navigationPage.clickScanConfig();
    navigationPage.verifyNavigation(urls.scanConfig, navigationPageData.headings.scanConfig);
  });

  // Use case — accordion sub-item navigation: General Config
  it("SW-NAV-TC31: Verify navigation to General Config page", () => {
    navigationPage.clickConfiguration();
    navigationPage.clickGeneralConfig();
    navigationPage.verifyNavigation(urls.generalConfig, navigationPageData.headings.generalConfig);
  });

  // Use case — accordion sub-item navigation: BrainBox Configuration
  it("SW-NAV-TC32: Verify navigation to BrainBox Configuration page", () => {
    navigationPage.clickConfiguration();
    navigationPage.clickBrainboxConfig();
    navigationPage.verifyNavigation(urls.brainboxConfig, navigationPageData.headings.brainboxConfig);
  });

  // Use case — accordion sub-item navigation: Mapping Templates
  it("SW-NAV-TC33: Verify navigation to Mapping Templates page", () => {
    navigationPage.clickConfiguration();
    navigationPage.clickMappingTemplates();
    navigationPage.verifyNavigation(urls.mappingTemplates, navigationPageData.headings.mappingTemplates);
  });

  // Use case — external link opens new tab
  it("SW-NAV-TC34: Verify Account Wise link opens in a new tab", () => {
    navigationPage.verifyAccountWiseLinkOpensNewTab();
  });

  // ── Collapsed menu tests ──────────────────────────────────────────────────

  describe("Collapsed menu", { tags: ['@regression'] }, () => {
    beforeEach(() => {
      navigationPage.collapseNav();
    });

    // EP — valid partition: sidebar enters mini/collapsed mode
    it("SW-NAV-TC35: Verify sidebar collapses when toggle is clicked", { tags: ['@smoke'] }, () => {
      navigationPage.verifyNavCollapsed();
    });

    // Use case — collapsed sidebar: Dashboard link
    it("SW-NAV-TC36: Verify Dashboard link works in collapsed menu", () => {
      navigationPage.clickInventory(); // navigate away first so dashboard click is meaningful
      navigationPage.clickDashboard();
      navigationPage.verifyUrl(urls.dashboard);
    });

    // Use case — collapsed sidebar: Inventory link
    it("SW-NAV-TC37: Verify Inventory link works in collapsed menu", () => {
      navigationPage.clickInventory();
      navigationPage.verifyNavigation(urls.inventory, navigationPageData.headings.inventory);
    });

    // Use case — collapsed sidebar: Incoming Inventory link
    it("SW-NAV-TC38: Verify Incoming Inventory link works in collapsed menu", () => {
      navigationPage.clickIncomingInventory();
      navigationPage.verifyNavigation(urls.incomingInventory, navigationPageData.headings.incomingInventory);
    });

    // Use case — collapsed sidebar: Purchase Orders link
    it("SW-NAV-TC39: Verify Purchase Orders link works in collapsed menu", () => {
      navigationPage.clickPurchaseOrders();
      navigationPage.verifyNavigation(urls.purchaseOrders, navigationPageData.headings.purchaseOrders);
    });

    // Use case — collapsed sidebar: Work Orders link
    it("SW-NAV-TC40: Verify Work Orders link works in collapsed menu", () => {
      navigationPage.clickWorkOrders();
      navigationPage.verifyNavigation(urls.workOrders, navigationPageData.headings.workOrders);
    });

    // Use case — collapsed sidebar: Inventory Actions link
    it("SW-NAV-TC41: Verify Inventory Actions link works in collapsed menu", () => {
      navigationPage.clickInventoryActions();
      navigationPage.verifyNavigation(urls.inventoryActions, navigationPageData.headings.inventoryActions);
    });

    // EP — valid partition: accordion expands and sub-items become visible in collapsed mode
    it("SW-NAV-TC42: Verify Asset Id menu expands in collapsed menu", () => {
      navigationPage.clickAssetId();
      navigationPage.verifySubItemVisible(navigationLocators.generateAssetId);
    });

    // Use case — collapsed sidebar: Generate Asset ID sub-item
    it("SW-NAV-TC43: Verify Generate Asset ID link works in collapsed menu", () => {
      navigationPage.clickAssetId();
      navigationPage.clickGenerateAssetId();
      navigationPage.verifyNavigation(urls.assetId, navigationPageData.headings.assetId);
    });

    // Use case — collapsed sidebar: Disassembly sub-item
    it("SW-NAV-TC44: Verify Asset Id Disassembly link works in collapsed menu", () => {
      navigationPage.clickAssetId();
      navigationPage.clickAssetIdDisassembly();
      navigationPage.verifyNavigation(urls.assetIdDisassembly, navigationPageData.headings.assetIdDisassembly);
    });

    // Use case — collapsed sidebar: Assembly sub-item
    it("SW-NAV-TC45: Verify Asset Id Assembly link works in collapsed menu", () => {
      navigationPage.clickAssetId();
      navigationPage.clickAssetIdAssembly();
      navigationPage.verifyNavigation(urls.assetIdAssembly, navigationPageData.headings.assetIdAssembly);
    });

    // Use case — collapsed sidebar: Search Lifecycle sub-item
    it("SW-NAV-TC46: Verify Asset Id Search Lifecycle link works in collapsed menu", () => {
      navigationPage.clickAssetId();
      navigationPage.clickAssetIdSearch();
      navigationPage.verifyNavigation(urls.assetIdSearch, navigationPageData.headings.assetIdSearch);
    });

    // SW-NAV-TC47 RETIRED: see SW-NAV-TC12 — Inventory Audit is now the /abc
    // accordion module, not a direct /inventory-audit link, so a collapsed-menu
    // direct-link click no longer applies.

    // Use case — collapsed sidebar: Printers direct link
    it("SW-NAV-TC48: Verify Printers link works in collapsed menu", () => {
      navigationPage.clickPrinters();
      navigationPage.verifyNavigation(urls.printers, navigationPageData.headings.printers);
    });

    // EP — valid partition: accordion expands and sub-items become visible in collapsed mode
    it("SW-NAV-TC49: Verify Warehouse Management menu expands in collapsed menu", () => {
      navigationPage.clickWarehouseManagement();
      navigationPage.verifySubItemVisible(navigationLocators.warehouseLocations);
    });

    // Use case — collapsed sidebar: Locations sub-item
    it("SW-NAV-TC50: Verify Warehouse Locations link works in collapsed menu", () => {
      navigationPage.clickWarehouseManagement();
      navigationPage.clickWarehouseLocations();
      navigationPage.verifyNavigation(urls.warehouseLocations, navigationPageData.headings.warehouseLocations);
    });

    // Use case — collapsed sidebar: Containers sub-item
    it("SW-NAV-TC51: Verify Warehouse Containers link works in collapsed menu", () => {
      navigationPage.clickWarehouseManagement();
      navigationPage.clickWarehouseContainers();
      navigationPage.verifyNavigation(urls.warehouseContainers, navigationPageData.headings.warehouseContainers);
    });

    // Use case — collapsed sidebar: Recycle Bin sub-item
    it("SW-NAV-TC52: Verify Warehouse Recycle Bin link works in collapsed menu", () => {
      navigationPage.clickWarehouseManagement();
      navigationPage.clickWarehouseRecycleBin();
      navigationPage.verifyNavigation(urls.warehouseRecycleBin, navigationPageData.headings.warehouseRecycleBin);
    });

    // EP — valid partition: accordion expands and sub-items become visible in collapsed mode
    it("SW-NAV-TC53: Verify Reports menu expands in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.verifySubItemVisible(navigationLocators.purchaseOrderReport);
    });

    // Use case — collapsed sidebar: Purchase Order Report sub-item
    it("SW-NAV-TC54: Verify Purchase Order Report link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickPurchaseOrderReport();
      navigationPage.verifyNavigation(urls.purchaseOrderReport, navigationPageData.headings.purchaseOrderReport);
    });

    // Use case — collapsed sidebar: Cost Report sub-item
    it("SW-NAV-TC55: Verify Cost Report link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickCostReport();
      navigationPage.verifyNavigation(urls.costReport, navigationPageData.headings.costReport);
    });

    // Use case — collapsed sidebar: Sales Report sub-item
    it("SW-NAV-TC56: Verify Sales Report link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickSalesReport();
      navigationPage.verifyNavigation(urls.salesReport, navigationPageData.headings.salesReport);
    });

    // Use case — collapsed sidebar: Custom Reports sub-item
    it("SW-NAV-TC57: Verify Custom Reports link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickCustomReports();
      navigationPage.verifyNavigation(urls.customReports, navigationPageData.headings.customReports);
    });

    // Use case — collapsed sidebar: Inventory Report sub-item
    it("SW-NAV-TC58: Verify Inventory Report link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickInventoryReport();
      navigationPage.verifyNavigation(urls.inventoryReport, navigationPageData.headings.inventoryReport);
    });

    // Use case — collapsed sidebar: Asset Lifecycle Report sub-item
    it("SW-NAV-TC59: Verify Asset Lifecycle Report link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickAssetLifecycleReport();
      navigationPage.verifyNavigation(urls.assetLifecycleReport, navigationPageData.headings.assetLifecycleReport);
    });

    // Use case — collapsed sidebar: Inventory Aging Report sub-item
    it("SW-NAV-TC60: Verify Inventory Aging Report link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickInventoryAgingReport();
      navigationPage.verifyNavigation(urls.inventoryAgingReport, navigationPageData.headings.inventoryAgingReport);
    });

    // Use case — collapsed sidebar: Warehouse Location Report sub-item
    it("SW-NAV-TC61: Verify Warehouse Location Report link works in collapsed menu", () => {
      navigationPage.clickReports();
      navigationPage.clickWarehouseLocationReport();
      navigationPage.verifyNavigation(urls.warehouseLocationReport, navigationPageData.headings.warehouseLocationReport);
    });

    // EP — valid partition: accordion expands and sub-items become visible in collapsed mode
    it("SW-NAV-TC62: Verify Configuration menu expands in collapsed menu", () => {
      navigationPage.clickConfiguration();
      navigationPage.verifySubItemVisible(navigationLocators.attributes);
    });

    // Use case — collapsed sidebar: Attributes sub-item
    it("SW-NAV-TC63: Verify Attributes link works in collapsed menu", () => {
      navigationPage.clickConfiguration();
      navigationPage.clickAttributes();
      navigationPage.verifyNavigation(urls.attributes, navigationPageData.headings.attributes);
    });

    // Use case — collapsed sidebar: Categories sub-item
    it("SW-NAV-TC64: Verify Categories link works in collapsed menu", () => {
      navigationPage.clickConfiguration();
      navigationPage.clickCategories();
      navigationPage.verifyNavigation(urls.category, navigationPageData.headings.categories);
    });

    // Use case — collapsed sidebar: Scan Config sub-item
    it("SW-NAV-TC65: Verify Scan Config link works in collapsed menu", () => {
      navigationPage.clickConfiguration();
      navigationPage.clickScanConfig();
      navigationPage.verifyNavigation(urls.scanConfig, navigationPageData.headings.scanConfig);
    });

    // Use case — collapsed sidebar: General Config sub-item
    it("SW-NAV-TC66: Verify General Config link works in collapsed menu", () => {
      navigationPage.clickConfiguration();
      navigationPage.clickGeneralConfig();
      navigationPage.verifyNavigation(urls.generalConfig, navigationPageData.headings.generalConfig);
    });

    // Use case — collapsed sidebar: BrainBox Configuration sub-item
    it("SW-NAV-TC67: Verify BrainBox Configuration link works in collapsed menu", () => {
      navigationPage.clickConfiguration();
      navigationPage.clickBrainboxConfig();
      navigationPage.verifyNavigation(urls.brainboxConfig, navigationPageData.headings.brainboxConfig);
    });

    // Use case — collapsed sidebar: Mapping Templates sub-item
    it("SW-NAV-TC68: Verify Mapping Templates link works in collapsed menu", () => {
      navigationPage.clickConfiguration();
      navigationPage.clickMappingTemplates();
      navigationPage.verifyNavigation(urls.mappingTemplates, navigationPageData.headings.mappingTemplates);
    });

    // Use case — collapsed sidebar: external link via mini icon
    it("SW-NAV-TC69: Verify Account Wise icon opens new tab in collapsed menu", () => {
      navigationPage.verifyAccountWiseMiniIconOpensNewTab();
    });

    // ── Expand back ───────────────────────────────────────────────────────────

    // EP — valid partition: sidebar returns to full/expanded mode
    it("SW-NAV-TC70: Verify sidebar expands when toggle is clicked again", () => {
      navigationPage.expandNav();
      navigationPage.verifyNavExpanded();
    });
  });

  // ── Additional tests for 100% coverage ───────────────────────────────────

  // Use case — alternate path: Dashboard link click from a non-dashboard page in expanded mode
  it("SW-NAV-TC71: Verify Dashboard nav link click navigates to dashboard from another page", () => {
    navigationPage.clickInventory();
    navigationPage.verifyUrl(urls.inventory);
    navigationPage.clickDashboard();
    navigationPage.verifyUrl(urls.dashboard);
  });

  // State transition — accordion A open → expand accordion B → accordion B sub-items visible
  // (verifies that opening a second accordion works when another is already expanded)
  it("SW-NAV-TC72: Verify Configuration accordion opens while Reports accordion is already expanded", () => {
    // The collapse toggle state can leak past cy.session; make sure we start expanded so the
    // accordions render inline sub-items (not the collapsed-mode fixed flyout).
    navigationPage.ensureNavExpanded();
    navigationPage.clickReports();
    navigationPage.verifySubItemVisible(navigationLocators.purchaseOrderReport);
    navigationPage.clickConfiguration();
    // Both accordions open: the Configuration sub-items sit low enough to fall behind the
    // fixed footer box, so scroll the item above the footer before asserting visibility.
    navigationPage.verifyStackedSubItemVisible(navigationLocators.attributes);
  });

  // EP — valid partition: nav link for the currently-active route carries the "--active" CSS class
  // (Minimal UI NavItem writes "--active" on the active <a>; React Router aria-current is NOT used)
  it("SW-NAV-TC73: Verify active link indicator on a direct nav item after navigation", () => {
    navigationPage.clickInventory();
    navigationPage.verifyUrl(urls.inventory);
    navigationPage.verifyInventoryNavLinkActive();
  });

  // EP — valid partition: nav sub-item for the currently-active route carries the "--active" CSS class
  // (Minimal UI NavItem writes "--active" on the active <a>; React Router aria-current is NOT used)
  it("SW-NAV-TC74: Verify active link indicator on a Reports sub-item after navigation", () => {
    navigationPage.clickReports();
    navigationPage.clickCostReport();
    navigationPage.verifyUrl(urls.costReport);
    navigationPage.verifyNavLinkActive(navigationLocators.costReport);
  });

  // Use case — alternate path: browser back button returns to previous page
  it("SW-NAV-TC75: Verify browser back button returns to the previous page", () => {
    navigationPage.clickInventory();
    navigationPage.verifyUrl(urls.inventory);
    navigationPage.clickIncomingInventory();
    navigationPage.verifyUrl(urls.incomingInventory);
    cy.go('back');
    navigationPage.verifyUrl(urls.inventory);
  });

  // ── Worker role navigation (decision table) ───────────────────────────────

  describe("Worker role navigation", { tags: ['@regression'] }, () => {
    beforeEach(() => {
      navigationPage = new NavigationPage();
      cy.on('uncaught:exception', (err) => {
        if (err?.message?.includes('Request failed with status code')) return false;
        return true;
      });
      cy.authSession('user');
      // Visit /inventory to trigger the route guard: Workers are redirected to /MobileViewScreen.
      // This is the correct starting state for Worker role nav tests.
      cy.visit(urls.inventory);
      // Wait for the Keycloak callback to settle AND the worker route-guard
      // redirect to complete before any test asserts. Otherwise the URL is still
      // mid-callback (/inventory#state=...code=...) and cases that assert on
      // /MobileViewScreen race the redirect and flake.
      cy.location('pathname', { timeout: 30000 }).should('eq', urls.inventoryActions);
    });

    // Decision table — Worker role uses mobile view (no sidebar); admin-only nav items are absent
    it("SW-NAV-TC76: Verify admin-only nav items are absent for Worker role", () => {
      navigationPage.verifyNavLinkAbsent(navigationLocators.inventoryAudit);
      navigationPage.verifyNavLinkAbsent(navigationLocators.printers);
      navigationPage.verifyNavSectionAbsent(navigationLocators.configuration);
      navigationPage.verifyNavSectionAbsent(navigationLocators.warehouseManagement);
    });

    // Decision table — Worker role is redirected to the mobile landing screen (no sidebar nav);
    // the mobile view renders action category buttons, not sidebar links.
    it("SW-NAV-TC77: Verify Worker role mobile landing shows expected action category buttons", () => {
      // Route guard redirects Workers from /inventory → /MobileViewScreen
      navigationPage.verifyUrl(urls.inventoryActions);
      navigationPage.verifyMobileLandingButtons();
    });

    // Use case — Worker role: the mobile view heading confirms the correct landing destination
    it("SW-NAV-TC78: Verify Worker role is served the mobile Inventory Actions landing view", () => {
      navigationPage.verifyUrl(urls.inventoryActions);
      navigationPage.verifyMobileLandingHeading(navigationPageData.headings.inventoryActions);
    });
  });

  // ── Unauthenticated access guard (error guessing) ─────────────────────────

  describe("Unauthenticated access", { tags: ['@regression'] }, () => {
    // Error guessing — no valid session: visiting a protected route redirects to the sign-in page.
    // cy.clearSessionStorage does not exist in Cypress — use cy.window() to clear sessionStorage.
    it("SW-NAV-TC79: Verify unauthenticated access to protected route redirects to sign-in", () => {
      navigationPage.clearAuthSessionAndVisit(urls.inventory);
      navigationPage.verifySignInRedirect();
    });
  });

  // ── Sales role navigation (decision table) ───────────────────────────────

  describe("Sales role navigation", { tags: ['@regression'] }, () => {
    beforeEach(function () {
      navigationPage = new NavigationPage();
      cy.on('uncaught:exception', (err) => {
        if (err?.message?.includes('Request failed with status code')) return false;
        return true;
      });
      requireRoleOrSkip(this, 'sales', 'Sales role navigation');
      cy.authSession('sales');
      cy.visit(urls.dashboard);
    });

    // Use case — happy path: Sales has no dashboard, so /dashboard redirects to
    // Inventory (the only page the role mounts).
    it("SW-NAV-TC80: Verify Sales role lands on Inventory after login", { tags: ['@smoke'] }, () => {
      navigationPage.verifyNavigation(urls.inventory, navigationPageData.headings.inventory);
    });

    // Use case — Sales nav: Inventory link present and navigable
    it("SW-NAV-TC81: Verify Inventory nav link is present and navigable for Sales role", () => {
      navigationPage.clickInventory();
      navigationPage.verifyNavigation(urls.inventory, navigationPageData.headings.inventory);
    });

    // TC82–TC87 and TC90 retired: they asserted Sales access to Incoming
    // Inventory, Purchase Orders and the Reports accordion, which the
    // Inventory-only Sales role no longer grants. Slots stay vacant; the
    // replacement conditions are TC91 (nav is Inventory-only) and TC92 (a
    // restricted deep link does not render).

    // Decision table — isSales() gate: Work Orders, Asset Id, Inventory Actions absent
    it("SW-NAV-TC88: Verify isSales-gated nav items are absent for Sales role", () => {
      navigationPage.verifyNavLinkAbsent(navigationLocators.workOrders);
      navigationPage.verifyNavSectionAbsent(navigationLocators.assetId);
      navigationPage.verifyNavLinkAbsent(navigationLocators.inventoryActions);
    });

    // Decision table — admin-only gate: Inventory Audit, Printers, Warehouse Management, Configuration absent
    it("SW-NAV-TC89: Verify admin-only nav items are absent for Sales role", () => {
      navigationPage.verifyNavLinkAbsent(navigationLocators.inventoryAudit);
      navigationPage.verifyNavLinkAbsent(navigationLocators.printers);
      navigationPage.verifyNavSectionAbsent(navigationLocators.warehouseManagement);
      navigationPage.verifyNavSectionAbsent(navigationLocators.configuration);
    });

    // Decision table — isSales() nav gate: Inventory is the only item; every
    // other top-level entry the role used to see is absent
    it("SW-NAV-TC91: Verify Sales nav shows Inventory only", { tags: ['@smoke'] }, () => {
      navigationPage.verifySubItemVisible(navigationLocators.inventory);
      navigationPage.verifyNavLinkAbsent(navigationLocators.dashboard);
      navigationPage.verifyNavLinkAbsent(navigationLocators.incomingInventory);
      navigationPage.verifyNavLinkAbsent(navigationLocators.purchaseOrders);
      navigationPage.verifyNavSectionAbsent(navigationLocators.reports);
    });

    // Error guessing — hiding a nav link is not access control: a Sales user who
    // types a restricted URL must not get the page (the route is not mounted)
    it("SW-NAV-TC92: Verify a restricted deep link does not render for Sales role", () => {
      cy.visit(urls.purchaseOrders);
      navigationPage.verifyPageHeading(navigationPageData.headings.pageNotFound);
    });
  });
});
