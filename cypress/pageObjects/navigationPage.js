import navigationLocators from "../support/locators/navigationLocators";

class NavigationPage {
  clickDashboard() {
    cy.findAllByRole('link', { name: navigationLocators.dashboard })
      .first()
      .should('be.visible')
      .click();
  }

  clickInventory() {
    cy.findByRole('link', { name: navigationLocators.inventory })
      .should('be.visible')
      .click();
  }

  clickIncomingInventory() {
    cy.findByRole('link', { name: navigationLocators.incomingInventory })
      .should('be.visible')
      .click();
  }

  clickPurchaseOrders() {
    cy.findByRole('link', { name: navigationLocators.purchaseOrders })
      .should('be.visible')
      .click();
  }

  clickWorkOrders() {
    cy.findByRole('link', { name: navigationLocators.workOrders })
      .should('be.visible')
      .click();
  }

  clickInventoryActions() {
    cy.findByRole('link', { name: navigationLocators.inventoryActions })
      .should('be.visible')
      .click();
  }

  clickAssetId() {
    cy.contains('li', navigationLocators.assetId, { timeout: 10000 })
      .first()
      .scrollIntoView()
      .click();
    cy.findByRole('link', { name: navigationLocators.generateAssetId }, { timeout: 10000 })
      .should('exist');
  }

  clickGenerateAssetId() {
    cy.findByRole('link', { name: navigationLocators.generateAssetId })
      .should('be.visible')
      .click();
  }

  clickAssetIdDisassembly() {
    cy.findByRole('link', { name: navigationLocators.assetIdDisassembly })
      .should('be.visible')
      .click();
  }

  clickAssetIdAssembly() {
    cy.findByRole('link', { name: navigationLocators.assetIdAssembly })
      .should('be.visible')
      .click();
  }

  clickAssetIdSearch() {
    cy.findByRole('link', { name: navigationLocators.assetIdSearch })
      .should('be.visible')
      .click();
  }

  clickInventoryAudit() {
    cy.findByRole('link', { name: navigationLocators.inventoryAudit })
      .should('be.visible')
      .click();
  }

  clickPrinters() {
    cy.findByRole('link', { name: navigationLocators.printers })
      .should('be.visible')
      .click();
  }

  clickWarehouseManagement() {
    // MUI accordion has no standard role - use contains on li
    cy.contains('li', navigationLocators.warehouseManagement, { timeout: 10000 })
      .first()
      .scrollIntoView()
      .click();
    cy.findByRole('link', { name: navigationLocators.warehouseLocations }, { timeout: 10000 })
      .should('exist');
  }

  clickReports() {
    // MUI accordion has no standard role - use contains on li
    cy.contains('li', navigationLocators.reports, { timeout: 10000 })
      .first()
      .scrollIntoView()
      .click();
    cy.findByRole('link', { name: navigationLocators.purchaseOrderReport }, { timeout: 10000 })
      .should('exist');
  }

  clickPurchaseOrderReport() {
    cy.findByRole('link', { name: navigationLocators.purchaseOrderReport })
      .should('be.visible')
      .click();
  }

  clickOrderReport() {
    cy.findByRole('link', { name: navigationLocators.orderReport })
      .should('be.visible')
      .click();
  }

  clickCostReport() {
    cy.findByRole('link', { name: navigationLocators.costReport })
      .should('be.visible')
      .click();
  }

  clickSalesReport() {
    cy.findByRole('link', { name: navigationLocators.salesReport })
      .should('be.visible')
      .click();
  }

  clickCustomReports() {
    cy.findByRole('link', { name: navigationLocators.customReports })
      .should('be.visible')
      .click();
  }

  clickInventoryReport() {
    cy.findByRole('link', { name: navigationLocators.inventoryReport })
      .should('be.visible')
      .click();
  }

  clickAssetLifecycleReport() {
    cy.findByRole('link', { name: navigationLocators.assetLifecycleReport })
      .should('be.visible')
      .click();
  }

  clickInventoryAgingReport() {
    cy.findByRole('link', { name: navigationLocators.inventoryAgingReport })
      .should('be.visible')
      .click();
  }

  clickWarehouseLocationReport() {
    cy.findByRole('link', { name: navigationLocators.warehouseLocationReport })
      .should('be.visible')
      .click();
  }

  clickConfiguration() {
    // MUI accordion has no standard role - use contains on li
    cy.contains('li', navigationLocators.configuration, { timeout: 10000 })
      .first()
      .scrollIntoView()
      .click();
    cy.findByRole('link', { name: navigationLocators.attributes }, { timeout: 10000 })
      .should('exist');
  }

  clickAttributes() {
    cy.findByRole('link', { name: navigationLocators.attributes })
      .click();
  }

  clickCategories() {
    cy.get(navigationLocators.categoriesLink, { timeout: 10000 })
      .should('be.visible')
      .click();
  }

  clickScanConfig() {
    cy.findByRole('link', { name: navigationLocators.scanConfig })
      .click();
  }

  clickGeneralConfig() {
    cy.findByRole('link', { name: navigationLocators.generalConfig })
      .click();
  }

  clickBrainboxConfig() {
    cy.findByRole('link', { name: navigationLocators.brainboxConfig })
      .should('be.visible')
      .click();
  }

  clickMappingTemplates() {
    cy.findByRole('link', { name: navigationLocators.mappingTemplates })
      .should('be.visible')
      .click();
  }

  verifyAccountWiseLinkOpensNewTab() {
    // window.open() is used (not an <a> tag), so we stub it to prevent an actual new tab
    cy.window().then((win) => {
      cy.stub(win, 'open').as('windowOpen');
    });
    cy.contains('p', navigationLocators.accountWiseLink)
      .should('be.visible')
      .click();
    cy.get('@windowOpen').should('have.been.calledOnce')
      .its('firstCall.args.0')
      .should('include', '/auth/jwt/sign-in')
      .and('include', 'returnTo');
  }

  collapseNav() {
    cy.get(navigationLocators.navToggleButton, { timeout: 10000 })
      .should('be.visible')
      .click();
  }

  expandNav() {
    cy.get(navigationLocators.navToggleButton, { timeout: 10000 })
      .should('be.visible')
      .click();
  }

  verifyNavCollapsed() {
    // In mini mode the text label disappears — only the OpenInNew icon shows
    cy.contains('p', navigationLocators.accountWiseLink).should('not.exist');
    cy.get(navigationLocators.accountWiseMiniIcon).should('be.visible');
  }

  verifyNavExpanded() {
    // In full mode the text label is visible again
    cy.contains('p', navigationLocators.accountWiseLink).should('be.visible');
  }

  verifyAccountWiseMiniIconOpensNewTab() {
    cy.window().then((win) => {
      cy.stub(win, 'open').as('windowOpenMini');
    });
    cy.get(navigationLocators.accountWiseMiniIcon, { timeout: 10000 })
      .should('have.length', 1)
      .first()
      .should('be.visible')
      .click();
    cy.get('@windowOpenMini').should('have.been.calledOnce')
      .its('firstCall.args.0')
      .should('include', '/auth/jwt/sign-in')
      .and('include', 'returnTo');
  }

  clickWarehouseLocations() {
    cy.findByRole('link', { name: navigationLocators.warehouseLocations })
      .should('be.visible')
      .click();
  }

  clickWarehouseContainers() {
    cy.findByRole('link', { name: navigationLocators.warehouseContainers })
      .should('be.visible')
      .click();
  }

  clickWarehouseRecycleBin() {
    cy.findByRole('link', { name: navigationLocators.warehouseRecycleBin })
      .should('be.visible')
      .click();
  }

  clickWarehouseContainerAssignment() {
    cy.findByRole('link', { name: navigationLocators.containerAssignment })
      .should('be.visible')
      .click();
  }

  // Verify URL
  verifyUrl(expectedPath) {
    cy.url({ timeout: 20000 }).should('include', expectedPath);
  }

  // Verify page heading/title
  verifyPageHeading(expectedHeading) {
    cy.contains(expectedHeading, { timeout: 20000 }).should('be.visible');
  }

  // Combined verification: URL + Heading
  verifyNavigation(expectedPath, expectedHeading) {
    this.verifyUrl(expectedPath);
    this.verifyPageHeading(expectedHeading);
  }
}

export default NavigationPage;
