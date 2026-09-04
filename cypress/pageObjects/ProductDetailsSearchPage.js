import { ItemSearchLocators as loc } from '../support/locators/ItemSearchLocators';

// Page object for the items list inside the Product Detail (ItemView) page.
// The itemViewItemList.tsx component renders the items table with search,
// status-filter cards (ProductDetailStats), and MRT pagination.

class ProductDetailsSearchPage {

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  enterSearchTerm(searchTerm) {
    cy.get(loc.searchInput).clear().type(searchTerm);
    return this;
  }

  // Submits the search form and waits on the alias provided by the caller.
  // Default alias matches the @itemSearch alias registered in beforeEach.
  clickSearchButton(alias = 'itemSearch') {
    cy.get(loc.searchButton).click();
    cy.wait(`@${alias}`);
    return this;
  }

  clearSearch() {
    // Use .clear() — NOT type('{selectAll}{backspace}'). Cypress's select-all
    // sequence is {selectall} (lowercase); the camelCase form is not a recognised
    // sequence, so the field was never actually emptied. itemViewItemList's onChange
    // only refetches when `!e.target.value`, so with a non-empty value the reset
    // never fired and SW-ISE-UI-TC12 sat waiting for a request that could not happen.
    cy.get(loc.searchInput).focus().clear();
    return this;
  }

  searchAndWait(searchTerm, alias = 'itemSearch') {
    this.enterSearchTerm(searchTerm);
    this.clickSearchButton(alias);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Status filter cards (ProductDetailStats)
  // Clicking a MuiCardActionArea triggers handleStatusFilterClick which updates
  // selectedStatusFilter state → query key changes → items API refetch.
  // ---------------------------------------------------------------------------

  clickStatusFilter(status, alias = 'itemSearch') {
    // The status stat cards render as a MuiCardActionArea on the InfoCard build
    // but as a plain compact-strip tile (and possibly behind "More") on QA.
    // cy.clickStatCard adapts to whichever layout is deployed.
    cy.clickStatCard(status);
    cy.wait(`@${alias}`);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  goToNextPage(alias = 'itemSearch') {
    cy.get(loc.nextPageButton).click();
    cy.wait(`@${alias}`);
    return this;
  }

  goToPage(pageNum, alias = 'itemSearch') {
    cy.get(loc.pageNumberButton(pageNum)).click();
    cy.wait(`@${alias}`);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  assertTableIsVisible() {
    cy.get(loc.itemsTable).should('be.visible');
    return this;
  }

  assertTableHasRows() {
    cy.get(loc.tableRows).should('have.length.greaterThan', 0);
    return this;
  }

  assertNoResults() {
    cy.get(loc.noResultsMessage).should('be.visible');
    return this;
  }

  // expectedText: any substring of the "Record:  N - M  of T" string
  assertResultsCount(expectedText) {
    cy.get(loc.pageInfoText).should('contain', expectedText);
    return this;
  }

  assertItemInResults(serialNumber) {
    cy.get(loc.itemsTable).should('contain', serialNumber);
    return this;
  }

  assertItemNotInResults(serialNumber) {
    cy.get(loc.itemsTable).should('not.contain', serialNumber);
    return this;
  }

  assertRowCount(count) {
    cy.get(loc.tableRows).should('have.length', count);
    return this;
  }

  // MUI Pagination: active page button carries the Mui-selected CSS class
  assertCurrentPage(pageNum) {
    cy.get(loc.pageNumberButton(pageNum)).should('have.class', 'Mui-selected');
    return this;
  }

  assertErrorMessage(expectedMessage) {
    cy.get(loc.errorToast).should('be.visible').and('contain', expectedMessage);
    return this;
  }
}

export default ProductDetailsSearchPage;
