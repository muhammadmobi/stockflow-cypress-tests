import L from '../support/locators/inventoryCategoryFilterLocators';
import urls from '../fixtures/urls.json';

/**
 * Page Object — Inventory Category Filter & Product Status Tabs
 * Covers: ItemList.tsx (tabs, category dropdown, bulk actions)
 *         CategoryList.tsx (React-Select dropdown)
 *         ProductListActionMenu.tsx (row action menu)
 */
class InventoryCategoryFilterPage {
  // ── Navigation ─────────────────────────────────────────────────────────

  navigateToInventory() {
    cy.visit(urls.inventory);
    this.waitForTableLoad();
  }

  // ── Category filter (React-Select) ─────────────────────────────────────

  /**
   * Select a category by name from the virtualised React-Select dropdown.
   * Pass 'All' to reset to the default.
   */
  selectCategory(name) {
    cy.get(L.categoryDropdownInput).click({ force: true }).clear().type(name, { delay: 40 });
    cy.get(L.categoryDropdownMenu).contains(name).click();
    this.waitForTableLoad();
  }

  clearCategory() {
    this.selectCategory('All');
  }

  // ── Product status tabs ─────────────────────────────────────────────────

  /**
   * Click a tab chip by its label text.
   * Supported values: 'Active Products' | 'Inactive Products' | 'Low Stock'
   */
  clickTab(tabLabel) {
    cy.contains(tabLabel).click();
    this.waitForTableLoad();
  }

  /**
   * Assert that the given tab is the currently active tab (bold, primary
   * colour). Uses font-weight because it's the stable computed signal set by
   * ItemList.tsx (fontWeight: productStatusTab === tab ? 600 : 400).
   */
  assertTabIsActive(tabLabel) {
    cy.contains(tabLabel).should('have.css', 'font-weight', '600');
  }

  /**
   * Read the numeric badge count on the Low Stock tab.
   * Returns a Chainable<number>. Resolves to 0 if the badge is absent.
   */
  getLowStockBadgeCount() {
    return cy.contains(L.tabLowStock).then(($tab) => {
      const chip = $tab[0].parentElement.querySelector('.MuiChip-root');
      return chip ? parseInt(chip.textContent.trim(), 10) : 0;
    });
  }

  assertLowStockBadgeVisible() {
    cy.contains(L.tabLowStock).find(L.lowStockBadge).should('be.visible');
  }

  assertLowStockBadgeAbsent() {
    cy.contains(L.tabLowStock).within(() => {
      cy.get(L.lowStockBadge).should('not.exist');
    });
  }

  // ── Search ──────────────────────────────────────────────────────────────

  searchProduct(term) {
    cy.get(L.searchInput).clear().type(term, { delay: 40 });
    cy.contains('button', /^Search$/).click();
    this.waitForTableLoad();
  }

  clearSearch() {
    cy.get(L.searchInput).clear();
    cy.contains('button', /^Search$/).click();
    this.waitForTableLoad();
  }

  // ── Table state ─────────────────────────────────────────────────────────

  waitForTableLoad() {
    // Wait for any active spinner/overlay inside the MRT table to disappear.
    // MRT uses aria-busy on the root table wrapper while loading.
    // Stat cards use MUI Skeleton which also carries role="progressbar"; scoping to
    // MuiLinearProgress-root targets only the MRT table loading bar and avoids
    // blocking indefinitely on stat-card skeletons.
    cy.get('.MuiLinearProgress-root[role="progressbar"]', { timeout: 40000 }).should('not.exist');
  }

  /**
   * Assert a product row is visible. Searches by product name text appearing
   * anywhere in the table body.
   */
  assertProductVisible(productName, timeout = 12000) {
    cy.get(L.tableBody, { timeout }).should('contain.text', productName);
  }

  assertProductAbsent(productName) {
    cy.get(L.tableBody).should('not.contain.text', productName);
  }

  assertTableEmpty() {
    cy.get(L.tableRow).should('have.length.lte', 1);
    cy.get(L.noRowsOverlay).should('exist');
  }

  getRowCount() {
    return cy.get(L.tableRow);
  }

  // ── Row action menu ─────────────────────────────────────────────────────

  /**
   * Open the three-dot action menu for a given row.
   * @param {string} productName - unique text visible in the row
   */
  openRowActionMenu(productName) {
    cy.contains(L.tableRow, productName)
      .find(L.rowActionButton)
      .click({ force: true });
  }

  clickMenuAction(label) {
    cy.contains(L.rowActionMenu + ' li span', label).click();
  }

  // ── Confirmation dialog ─────────────────────────────────────────────────

  confirmAction() {
    cy.contains('button', L.confirmYesBtn).click();
  }

  cancelAction() {
    cy.contains('button', L.confirmNoBtn).click();
  }

  // ── Row selection (MRT checkboxes) ─────────────────────────────────────

  selectRow(productName) {
    cy.contains(L.tableRow, productName)
      .find('input[type="checkbox"]')
      .check({ force: true });
  }

  selectAllRows() {
    cy.get(L.headerCheckbox).check({ force: true });
  }

  clearRowSelection() {
    cy.contains('button', 'Clear Selection').click({ force: true });
  }

  // ── Bulk action button ──────────────────────────────────────────────────

  clickBulkAction(label) {
    cy.contains('button', label).click();
  }

  // ── Session storage ─────────────────────────────────────────────────────

  clearTabSessionStorage() {
    cy.window().then((win) => {
      win.sessionStorage.removeItem('inventoryProductStatusTab');
    });
  }

  getTabSessionStorage() {
    return cy.window().then((win) =>
      win.sessionStorage.getItem('inventoryProductStatusTab')
    );
  }

  // ── Column header sorting ───────────────────────────────────────────────

  clickColumnHeader(headerText) {
    cy.contains('th', headerText).click();
    this.waitForTableLoad();
  }

  // ── Toast assertions ────────────────────────────────────────────────────

  assertToast(partial) {
    cy.contains(partial, { timeout: 10000 }).should('be.visible');
  }
}

export default InventoryCategoryFilterPage;
