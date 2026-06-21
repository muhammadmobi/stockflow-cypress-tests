import urls from "../fixtures/urls.json";
import navigationPageData from "../fixtures/navigationPageData.json";
import NavigationPage from "../pageObjects/navigationPage";
import navigationLocators from "../support/locators/navigationLocators";

describe("Navigation Tests", { tags: ['@regression'] }, () => {
  let navigationPage;

  beforeEach(() => {
    navigationPage = new NavigationPage();
    // Use cy.session to cache and restore login state
    cy.session('admin-session', () => {
      cy.login();
    }, {
      validate() {
        // Verify session is still valid by checking localStorage token
        cy.window().then((win) => {
          const storage = win.localStorage.getItem('stock-wise');
          expect(storage).to.exist;
        });
      }
    });

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
    cy.findByRole('link', { name: navigationLocators.generateAssetId }).should('be.visible');
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

  // Use case — direct link navigation
  it("SW-NAV-TC12: Verify navigation to Inventory Audit page", () => {
    navigationPage.clickInventoryAudit();
    navigationPage.verifyNavigation(urls.inventoryAudit, navigationPageData.headings.inventoryAudit);
  });

  // Use case — direct link navigation
  it("SW-NAV-TC13: Verify navigation to Printers page", () => {
    navigationPage.clickPrinters();
    navigationPage.verifyNavigation(urls.printers, navigationPageData.headings.printers);
  });

  // EP — valid partition: accordion expands and sub-items become visible
  it("SW-NAV-TC14: Verify expansion of Warehouse Management menu", { tags: ['@smoke'] }, () => {
    navigationPage.clickWarehouseManagement();
    cy.findByRole('link', { name: navigationLocators.warehouseLocations }).should('be.visible');
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
    cy.findByRole('link', { name: navigationLocators.purchaseOrderReport }).should('be.visible');
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
    cy.findByRole('link', { name: navigationLocators.attributes }).should('be.visible');
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
      cy.findByRole('link', { name: navigationLocators.generateAssetId }).should('be.visible');
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

    // Use case — collapsed sidebar: Inventory Audit direct link
    it("SW-NAV-TC47: Verify Inventory Audit link works in collapsed menu", () => {
      navigationPage.clickInventoryAudit();
      navigationPage.verifyNavigation(urls.inventoryAudit, navigationPageData.headings.inventoryAudit);
    });

    // Use case — collapsed sidebar: Printers direct link
    it("SW-NAV-TC48: Verify Printers link works in collapsed menu", () => {
      navigationPage.clickPrinters();
      navigationPage.verifyNavigation(urls.printers, navigationPageData.headings.printers);
    });

    // EP — valid partition: accordion expands and sub-items become visible in collapsed mode
    it("SW-NAV-TC49: Verify Warehouse Management menu expands in collapsed menu", () => {
      navigationPage.clickWarehouseManagement();
      cy.findByRole('link', { name: navigationLocators.warehouseLocations }).should('be.visible');
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
      cy.findByRole('link', { name: navigationLocators.purchaseOrderReport }).should('be.visible');
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
      cy.findByRole('link', { name: navigationLocators.attributes }).should('be.visible');
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
});
