// cypress/pageObjects/InventoryActions/LandingScreenPage.js
//
// Page object for the Inventory Actions landing screen at /MobileViewScreen.
// Wraps the state-machine (step 0 menu / step 1 PO picker, menuGroup / menuSub
// URL params) so specs only call intent methods.

import L from '../../support/locators/InventoryActions/landingScreenLocators';

class LandingScreenPage {
  // -- Navigation -----------------------------------------------------------

  visit(qs = '') {
    cy.visit(`/MobileViewScreen${qs}`);
  }

  openFromSideNav() {
    // Visit /dashboard from inside this method (not from beforeEach) so the
    // caller's cy.intercept stubs are already in place when the dashboard
    // layout's /configs fetch fires on mount. Otherwise Redux loads with the
    // real (un-stubbed) config and wins the `configState ?? generalConfig`
    // fallback in the screen, masking decision-table tests like TC03.
    cy.visit('/dashboard');
    cy.get(L.sideNavLink).should('be.visible').click({ force: true });
    cy.url().should('include', '/MobileViewScreen');
  }

  // -- Tile interactions ----------------------------------------------------

  tile(label) {
    return cy.contains('button', new RegExp(`^${label}$`));
  }

  clickTile(label) {
    this.tile(label).should('be.visible').and('not.be.disabled').click();
  }

  // -- Assertions on root-menu tiles ---------------------------------------

  assertRootMenuVisible() {
    cy.contains('h6', L.groupHeadings.selectOperation).should('be.visible');
  }

  assertRootMenuAbsent() {
    cy.contains('h6', L.groupHeadings.selectOperation).should('not.exist');
  }

  assertTilesPresent(labels) {
    labels.forEach((label) => this.tile(label).should('be.visible'));
  }

  assertTilesAbsent(labels) {
    labels.forEach((label) =>
      cy.contains('button', new RegExp(`^${label}$`)).should('not.exist')
    );
  }

  assertTileDisabled(label) {
    this.tile(label).should('be.disabled');
  }

  assertTileEnabled(label) {
    this.tile(label).should('not.be.disabled');
  }

  // -- Group transitions ---------------------------------------------------

  // Root "Stock In" tile. Post-consolidation (2026-06) this no longer opens a
  // sub-menu — it calls openPoPickerFor(SMART_STOCK_IN_ROUTE) and lands the
  // user directly on the PO picker (step 1). Callers should follow with
  // assertPoPickerVisible() / pickPo(), not assertMenuGroup('stockIn').
  openStockIn() { this.clickTile(L.rootTiles.stockIn); }

  // "Start Stock In" button shown inside the deep-link Stock In sub-menu
  // (?menuGroup=stockIn). Also opens the PO picker but preserves menuGroup,
  // so ← Back from the picker returns to the sub-menu (see TC39).
  startStockIn() { this.clickTile(L.stockInSubTiles.startStockIn); }
  openStockOut() { this.clickTile(L.rootTiles.stockOut); }
  openInventoryManagement() { this.clickTile(L.rootTiles.inventoryManagement); }
  openProductOperations() { this.clickTile(L.rootTiles.productOperations); }
  openWarehouseManagement() { this.clickTile(L.rootTiles.warehouseManagement); }
  openAsset() { this.clickTile(L.rootTiles.asset); }

  openWarehouseAssignment() { this.clickTile(L.warehouseSubTiles.assignment); }
  openWarehouseUnassignment() { this.clickTile(L.warehouseSubTiles.unassignment); }

  // -- Back navigation -----------------------------------------------------

  backToMenu() {
    cy.contains('button', L.backToMenu).click();
  }

  backToWarehouse() {
    cy.contains('button', L.backToWarehouse).click();
  }

  // -- Group heading assertions --------------------------------------------

  assertGroupHeading(heading) {
    cy.contains('h6', heading).should('be.visible');
  }

  // -- URL state assertions (state-machine observability) -------------------

  assertMenuGroup(group) {
    cy.location('search', { timeout: 20000 }).should('include', `menuGroup=${group}`);
  }

  assertMenuSub(sub) {
    cy.location('search', { timeout: 20000 }).should('include', `menuSub=${sub}`);
  }

  assertNoMenuGroup() {
    cy.location('search', { timeout: 20000 }).should('not.include', 'menuGroup=');
  }

  assertNoMenuSub() {
    cy.location('search', { timeout: 20000 }).should('not.include', 'menuSub=');
  }

  assertPickerParamsCleared() {
    cy.location('search').should('not.include', 'poId=');
    cy.location('search').should('not.include', 'poSelection=');
    cy.location('search').should('not.include', 'returnTo=');
  }

  // -- PO picker (step 1) ---------------------------------------------------

  poPickerHeading() {
    return cy.contains('label', L.poSearchInputLabel);
  }

  assertPoPickerVisible() {
    this.poPickerHeading().should('be.visible');
  }

  pickPo(poNumber) {
    this.assertPoPickerVisible();
    // PO buttons render after the /excel/po-numbers stub/response resolves and
    // React re-renders the list. Default 8s is tight on Stage; extend to 15s.
    cy.contains('button', new RegExp(`^${poNumber}$`), { timeout: 15000 }).click();
  }

  backFromPoPicker() {
    cy.contains('button', new RegExp(`^${L.backFromPoPicker}$`)).click();
  }

  searchPo(text) {
    cy.contains('label', L.poSearchInputLabel)
      .parent()
      .find('input')
      .clear()
      .type(text);
  }

  assertPoButtonVisible(poNumber) {
    cy.contains('button', new RegExp(`^${poNumber}$`)).should('be.visible');
  }

  assertPoButtonAbsent(poNumber) {
    cy.contains('button', new RegExp(`^${poNumber}$`)).should('not.exist');
  }

  // -- URL contract assertions ---------------------------------------------

  assertUrlIncludes(fragment) {
    cy.url({ timeout: 15000 }).should('include', fragment);
  }

  // -- PO-list refetch spinner (state-transition: fetching → fetched) -------

  assertPoListLoaderVisible(timeout = 4000) {
    cy.get(L.poListLoader, { timeout }).should('be.visible');
  }
}

export default LandingScreenPage;
