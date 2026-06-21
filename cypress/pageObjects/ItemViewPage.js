import ItemViewLocators from "../support/locators/ItemViewLocators";

/**
 * ItemViewPage.js
 * Page object for Product Details (ItemView) page
 * Handles items list sorting, filtering, and verification
 */
class ItemViewPage {
  // ===========================================================================
  // Navigation
  // ===========================================================================

  /**
   * Navigate to the Product Details (items list) page by walking the UI:
   *   Incoming Inventory → select PO → click first product row.
   *
   * Direct cy.visit('/inventory/view/<id>') does NOT work — the route is
   * `/incoming-inventory/:productName/:id` and the ItemView reads
   * `location.state.productDetailsState` to know which PO / category the
   * product belongs to. UI navigation is the only reliable path.
   */
  navigateToProductDetails(poNumber, options = {}) {
    const { logPrefix = '[NAV]' } = options;
    cy.log(`${logPrefix} Starting navigation to PO: ${poNumber}`);
    
    cy.intercept("GET", "**/incoming-items**").as("incomingProducts");

    cy.log(`${logPrefix} Clicking Incoming Inventory nav link...`);
    cy.get('a[aria-label="Incoming Inventory"][href="/incoming-inventory"]', { timeout: 15000 })
      .then(($link) => {
        if ($link.length) {
          cy.wrap($link).click({ force: true });
        } else {
          cy.contains('.MuiListItemText-root', /^Incoming Inventory$/, {
            timeout: 15000,
          })
            .should('be.visible')
            .click({ force: true });
        }
      });

    cy.log(`${logPrefix} Opening PO dropdown...`);
    cy.get("#Incomming-inventory-P-O-1").scrollIntoView().click({ force: true });
    
    cy.log(`${logPrefix} Typing PO number: ${poNumber}`);
    cy.get("#Incomming-inventory-P-O-1 input").type(poNumber, { force: true });
    
    cy.log(`${logPrefix} Waiting for dropdown menu with PO...`);
    cy.get('[class*="-menu"]', { timeout: 10000 })
      .should("be.visible")
      .and("contain.text", poNumber);
    
    cy.log(`${logPrefix} Clicking PO option...`);
    cy.get('[class*="-menu"]').contains(poNumber).click({ force: true });

    // Wait for products list under the PO to load fully before clicking a row.
    cy.log(`${logPrefix} Waiting for incoming products API...`);
    cy.wait("@incomingProducts", { timeout: 20000 });
    
    cy.log(`${logPrefix} Verifying at least one product row exists...`);
    cy.get("tbody tr", { timeout: 15000 }).should("have.length.at.least", 1);

    cy.intercept("GET", "**/incoming-items/**/items**").as("itemsFirstLoad");
    
    cy.log(`${logPrefix} Clicking first product row...`);
    cy.get("tbody tr")
      .first()
      .find("td")
      .first()
      .click({ force: true });
      
    cy.log(`${logPrefix} Waiting for URL change...`);
    cy.url({ timeout: 15000 }).should(
      "match",
      /\/incoming-inventory\/.+\/\d+/
    );
    
    cy.log(`${logPrefix} Waiting for items API response...`);
    cy.wait("@itemsFirstLoad", { timeout: 20000 });
    
    cy.log(`${logPrefix} Verifying page loaded...`);
    this.verifyPageLoaded();
    cy.log(`${logPrefix} Navigation complete!`);
  }

  verifyPageLoaded() {
    cy.url().should("include", "/incoming-inventory/");
    cy.get(ItemViewLocators.itemsTable, { timeout: 20000 }).should("be.visible");
  }

  // ===========================================================================
  // Item-level actions
  // ===========================================================================

  clickItemActionMenuBySerial(serialNumber) {
    cy.contains(ItemViewLocators.tableRow, serialNumber, { timeout: 15000 })
      .should("be.visible")
      .within(() => {
        cy.get('button#long-button').click({ force: true });
      });
  }

  openItemDeleteDialogBySerial(serialNumber) {
    this.clickItemActionMenuBySerial(serialNumber);
    cy.get('[role="menu"]', { timeout: 10000 })
      .should("be.visible")
      .contains("Delete")
      .click({ force: true });
    cy.contains("Confirm Item Deletion", { timeout: 10000 }).should("be.visible");
  }

  openItemMoveDialogBySerial(serialNumber) {
    this.clickItemActionMenuBySerial(serialNumber);
    cy.get('[role="menu"]', { timeout: 10000 })
      .should("be.visible")
      .contains("li", "Move Item")
      .click({ force: true });
    cy.findByRole("dialog", { timeout: 10000 }).should("be.visible");
    cy.contains("Move Items", { timeout: 10000 }).should("be.visible");
  }

  assertMoveItemDisabledBySerial(serialNumber) {
    this.clickItemActionMenuBySerial(serialNumber);
    cy.get('[role="menu"]', { timeout: 10000 })
      .should("be.visible")
      .contains("li", "Move Item")
      .should("have.class", "Mui-disabled")
      .and("have.attr", "aria-disabled", "true");
    cy.get("body").type("{esc}");
  }

  confirmDeleteItem() {
    cy.findByRole("dialog", { timeout: 10000 })
      .within(() => {
        cy.findByRole("button", { name: /^Yes$/i })
          .should("not.be.disabled")
          .click({ force: true });
      });
  }

  cancelDeleteItem() {
    cy.findByRole("dialog", { timeout: 10000 })
      .within(() => {
        cy.findByRole("button", { name: /^No$/i }).click({ force: true });
      });
    cy.findByRole("dialog").should("not.exist");
  }

  verifyDeleteDialogOpen() {
    cy.contains("Confirm Item Deletion", { timeout: 10000 }).should("be.visible");
  }

  verifyItemExists(serialNumber) {
    cy.contains(ItemViewLocators.tableRow, serialNumber, { timeout: 10000 }).should("be.visible");
  }

  verifyItemNotExists(serialNumber) {
    cy.contains(ItemViewLocators.tableRow, serialNumber, { timeout: 10000 }).should("not.exist");
  }

  verifySuccessToast(message) {
    cy.contains(message, { timeout: 10000 }).should("be.visible");
  }

  verifyDeleteBlockedToast(keyword) {
    cy.contains(keyword, { timeout: 10000 }).should("be.visible");
  }

  verifyNoItems() {
    cy.get(ItemViewLocators.tableRow, { timeout: 10000 }).should("not.exist");
  }

  // ===========================================================================
  // Header / cell helpers (header-text based to avoid column-index fragility)
  // ===========================================================================

  _getHeaderCell(headerText) {
    return cy
      .get("thead th", { timeout: 15000 })
      .then(($ths) => {
        // First try exact match (case-insensitive)
        let $exactMatch = null;
        $ths.each((_, th) => {
          const text = Cypress.$(th).text().trim();
          if (text.toLowerCase() === headerText.toLowerCase()) {
            $exactMatch = Cypress.$(th);
            return false; // break the loop
          }
        });
        if ($exactMatch && $exactMatch.length > 0) {
          return $exactMatch;
        }

        // Fallback to substring match, but exclude multi-word headers if searching for a single word
        let $substringMatch = null;
        const searchWords = headerText.toLowerCase().split(/\s+/);
        $ths.each((_, th) => {
          const text = Cypress.$(th).text().trim().toLowerCase();
          // For single-word searches like "Location", prefer exact word boundary matches
          // to avoid matching "Vendor Location"
          const matches = searchWords.every(word => text.includes(word));
          if (matches) {
            // If searching for "Location" and text is "Vendor Location", skip it
            // unless it's closer to exact match
            const wordCount = text.split(/\s+/).length;
            const headerWordCount = headerText.split(/\s+/).length;
            if (wordCount === headerWordCount || headerWordCount === 1) {
              $substringMatch = Cypress.$(th);
              return false; // break the loop
            }
          }
        });

        if ($substringMatch && $substringMatch.length > 0) {
          return $substringMatch;
        }

        // If still not found, return any match (will fail with clear error message)
        return cy.get("thead th").filter((_, th) =>
          Cypress.$(th).text().trim().includes(headerText)
        ).first();
      });
  }

  _clickColumnHeader(headerText) {
    // Find the header cell and click on the sort label/button directly
    return this._getHeaderCell(headerText)
      .scrollIntoView()
      .within(() => {
        // Click on the TableSortLabel root element which handles the sort toggle
        cy.get('.MuiTableSortLabel-root').click({ force: true });
      });
  }

  _getColumnSortState(headerText) {
    return this._getHeaderCell(headerText).then(($th) => {
      // Find the MUI TableSortLabel root
      const $sortLabel = $th.find('.MuiTableSortLabel-root').first();
      
      if ($sortLabel.length === 0) {
        return "none";
      }
      
      // Check if sort is active by looking for the icon
      const $svg = $sortLabel.find('svg').first();
      if ($svg.length === 0) {
        return "none";
      }
      
      // MUI applies direction classes to the ROOT TableSortLabel element, not the icon
      // Check the parent element's classes for direction indicators
      const parentClasses = $sortLabel.attr('class') || '';
      
      // MUI v5 class pattern: MuiTableSortLabel-iconDirectionAsc or MuiTableSortLabel-iconDirectionDesc
      // These classes are on the TableSortLabel root when sort is active
      const isAsc = parentClasses.includes('DirectionAsc');
      const isDesc = parentClasses.includes('DirectionDesc');
      
      // Check aria-sort attribute on the th element itself
      const ariaSort = $th.attr('aria-sort') || '';
      
      // Check aria-label on the sort button
      const ariaLabel = $sortLabel.attr('aria-label') || '';
      
      // Debug info - will help us see what's actually in the DOM
      const iconText = $svg.attr('data-testid') || $svg.prop('tagName') || 'unknown';
      
      // Determine state from all available indicators
      if (isDesc || ariaSort === 'descending' || ariaLabel.includes('desc')) {
        return "descending";
      }
      
      if (isAsc || ariaSort === 'ascending' || ariaLabel.includes('asc')) {
        return "ascending";
      }
      
      // If icon exists but no direction indicator, default to ascending
      // (MRT always shows icon when sorted, default is ascending on first click)
      return "ascending";
    });
  }

  _getColumnValues(headerText) {
    const values = [];
    return cy.get("thead th", { timeout: 15000 }).then(($headers) => {
      let colIndex = -1;
      $headers.each((i, th) => {
        if (Cypress.$(th).text().trim().includes(headerText)) {
          colIndex = i;
        }
      });
      if (colIndex === -1) {
        throw new Error(`Column with header "${headerText}" not found`);
      }
      return cy
        .get("tbody tr", { timeout: 10000 })
        .should("have.length.at.least", 1)
        .each(($row) => {
          const text = Cypress.$($row).find("td").eq(colIndex).text().trim();
          if (text) values.push(text);
        })
        .then(() => values);
    });
  }

  // ===========================================================================
  // Sort Column Interactions (header-text aware)
  // ===========================================================================

  clickSerialNumberColumnSort() {
    cy.log('[SORT] Clicking Serial Number column header...');
    this._clickColumnHeader("Serial Number");
    this.waitForLoadingComplete();
    cy.log('[SORT] Sort click completed');
  }

  clickStatusColumnSort() {
    cy.log('[SORT] Clicking Status column header...');
    this._clickColumnHeader("Status");
  }

  clickLocationColumnSort() {
    cy.log('[SORT] Clicking Location column header...');
    this._clickColumnHeader("Location");
  }

  clickContainerColumnSort() {
    cy.log('[SORT] Clicking Container column header...');
    this._clickColumnHeader("Container");
  }

  // ===========================================================================
  // Sort State Retrieval
  // ===========================================================================

  getSerialNumberColumnSortState() {
    return this._getColumnSortState("Serial Number");
  }

  getStatusColumnSortState() {
    return this._getColumnSortState("Status");
  }

  getLocationColumnSortState() {
    return this._getColumnSortState("Location");
  }

  getContainerColumnSortState() {
    return this._getColumnSortState("Container");
  }

  // ===========================================================================
  // Table Data Extraction
  // ===========================================================================

  getSerialNumbersFromTable() {
    return this._getColumnValues("Serial Number");
  }

  getStatusValuesFromTable() {
    return this._getColumnValues("Status");
  }

  getLocationValuesFromTable() {
    return this._getColumnValues("Location");
  }

  getContainerValuesFromTable() {
    return this._getColumnValues("Container");
  }

  // ===========================================================================
  // Table Verification
  // ===========================================================================

  verifyTableHasRows(expectedCount = null) {
    cy.get(ItemViewLocators.tableRows).should("be.visible");
    if (expectedCount !== null) {
      cy.get(ItemViewLocators.tableRows).should("have.length", expectedCount);
    }
  }

  verifyTableRowCountAtLeast(minCount) {
    cy.get(ItemViewLocators.tableRows).should("have.length.at.least", minCount);
  }

  verifyEmptyState() {
    cy.get(ItemViewLocators.emptyState.message).should("be.visible");
  }

  verifyTableNotEmpty() {
    cy.get(ItemViewLocators.tableRows).should("exist");
  }

  // ===========================================================================
  // Search and Filter
  // ===========================================================================

  searchItems(searchText) {
    cy.get("#searchInputRef", { timeout: 10000 })
      .should("be.visible")
      .clear()
      .type(searchText, { force: true });
    cy.get('button[type="submit"]').contains("Search").click({ force: true });
  }

  clearSearch() {
    cy.get("#searchInputRef").clear({ force: true });
  }

  applyStatusFilter(status) {
    cy.get(ItemViewLocators.filters.statusFilter).first().click({ force: true });
    cy.contains('[role="option"]', status).click({ force: true });
  }

  // ===========================================================================
  // Pagination
  // ===========================================================================

  goToNextPage() {
    cy.get(ItemViewLocators.pagination.nextPage).first().click({ force: true });
  }

  // ===========================================================================
  // Loading State
  // ===========================================================================

  waitForLoadingComplete() {
    cy.get(ItemViewLocators.tableRows, { timeout: 20000 }).should("exist");
  }

  // ===========================================================================
  // Sort Helpers for Complex Scenarios
  // ===========================================================================

  /**
   * Clicks sort column until target state is reached
   * @param {string} column - Column name: serialNumber, status, location, container
   * @param {string} targetState - "ascending", "descending", or "none"
   * @param {number} maxAttempts - Maximum click attempts (default 4)
   */
  clickUntilSortState(column, targetState, maxAttempts = 4) {
    cy.log(`[SORT] Clicking ${column} until state = "${targetState}" (max ${maxAttempts} attempts)`);
    
    const getStateFn = this._getSortStateFunction(column);
    const clickFn = this._getClickFunction(column);

    const attemptSort = (attemptsRemaining, attemptNum = 1) => {
      if (attemptsRemaining <= 0) {
        throw new Error(`Could not reach sort state "${targetState}" after ${maxAttempts} attempts`);
      }
      return getStateFn().then((currentState) => {
        cy.log(`[SORT] Attempt ${attemptNum}: current state = "${currentState}", target = "${targetState}"`);
        
        if (currentState === targetState) {
          cy.log(`[SORT] Target state "${targetState}" reached!`);
          return cy.wrap(currentState);
        }
        clickFn();
        this.waitForLoadingComplete();
        return attemptSort(attemptsRemaining - 1, attemptNum + 1);
      });
    };

    return attemptSort(maxAttempts);
  }

  _getSortStateFunction(column) {
    switch (column) {
      case "serialNumber":
        return () => this.getSerialNumberColumnSortState();
      case "status":
        return () => this.getStatusColumnSortState();
      case "location":
        return () => this.getLocationColumnSortState();
      case "container":
        return () => this.getContainerColumnSortState();
      default:
        return () => this.getSerialNumberColumnSortState();
    }
  }

  _getClickFunction(column) {
    switch (column) {
      case "serialNumber":
        return () => this.clickSerialNumberColumnSort();
      case "status":
        return () => this.clickStatusColumnSort();
      case "location":
        return () => this.clickLocationColumnSort();
      case "container":
        return () => this.clickContainerColumnSort();
      default:
        return () => this.clickSerialNumberColumnSort();
    }
  }
}

export default ItemViewPage;
