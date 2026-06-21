class InventoryActionStockInPage {
  // Locator for the Inventory Action menu/button

  clickIncomingInventoryNav() {
    cy.get('a[aria-label="Inventory Actions"][href="/MobileViewScreen"]')
      .and("not.be.disabled")
      .click({ force: true });
  }

  getInventoryActionMenu() {
    return cy.get('button[aria-label="Inventory Actions"]');
  }

  // Locator for the Stock In Items button in the action menu
  getStockInItemsButton() {
    return cy.contains('button', 'Stock In Items');
  }

  getStockInButton() {
    return cy.contains('button', 'Stock In');
  }

  // Locator for the Stock In Products button
  getStockInProductsButton() {
    return cy.contains('button', 'Stock In Products');
  }

  // Locator for the serial number input (if required)
  getSerialNumberInput() {
    return cy.get('input[placeholder*="Serial Number"]');
  }

  // Locator for the quantity input (if required)
  getQuantityInput() {
    return cy.get('input[placeholder*="Quantity"]');
  }

  // Locator for the confirm/submit button
  getConfirmButton() {
    return cy.contains('button', 'Confirm');
  }

  // Locator for the Search PO input field by label text
  getSearchPOInput() {
    return cy.contains('label', 'Search PO')
      .invoke('attr', 'for')
      .then((inputId) => {
        return cy.get(`#${inputId}`);
      });
  }

  // Get the available quantity value from the Available div
  getAvailableQuantity() {
    // Wait for Available section to be rendered and get the quantity
    return cy.contains('h6', 'Available', { timeout: 10000 })
      .should('be.visible')
      .parent()
      .find('h6.MuiTypography-h6')
      .should('be.visible')
      .should('not.have.text', '')
      .invoke('text')
      .then((text) => {
        const cleanText = text.trim();
        const quantity = parseInt(cleanText, 10);
        cy.log(`Raw text: "${cleanText}", Parsed quantity: ${quantity}`);

        if (isNaN(quantity)) {
          throw new Error(`Could not parse quantity from text: "${cleanText}"`);
        }

        return cy.wrap(quantity);
      });
  }

  // Actions
  openInventoryActionMenu() {
    this.getInventoryActionMenu().click();
  }

  clickStockInItems() {
    this.getStockInItemsButton().click();
  }

  enterSerialNumber(sn) {
    this.getSerialNumberInput().clear().type(sn);
  }

  enterQuantity(qty) {
    this.getQuantityInput().clear().type(qty);
  }

  confirmStockIn() {
    this.getConfirmButton().click();
  }

  // Action to type PO name in the Search PO input and press Enter with minimal delay
  typeInSearchPO(poName) {
    this.getSearchPOInput().clear().type(poName + '{enter}', { delay: 100 });
  }

  // Action to click the PO button from the search results
  clickPOResult(poName) {
    cy.contains('button', poName).click();
  }

  // Action to click the scan button
  clickScanButton() {
    cy.contains('button', 'Scan').click();
  }

  // Action to click Stock In button
  clickStockIn() {
    this.getStockInButton().click();
  }

  // Action to click Stock In Products button
  clickStockInProducts() {
    this.getStockInProductsButton().click();
  }

  // Action to search for a product
  searchProduct(productBrand) {
    cy.contains('label', 'Search Product')
      .invoke('attr', 'for')
      .then((inputId) => {
        cy.get(`#${inputId}`).clear().type(productBrand);
      });
  }

  // Action to enter quantity in product card
  enterProductQuantity(quantity) {
    cy.get('input[placeholder="Qty"]').clear().type(quantity);
  }

  // Action to click Stock In button in product card
  clickProductStockInButton() {
    cy.contains('button', 'Stock In').click();
  }

  // Verify product stock in toast message
  verifyProductStockInToastMessage(quantity, productBrand) {
    const expectedMessage = `Quantity "${quantity}" stocked in for ${productBrand}`;
    cy.contains(expectedMessage, { timeout: 10000 }).should('be.visible');
    cy.log(`Toast message verified: ${expectedMessage}`);
  }

  // Verify toast message with dynamic serial number
  verifyScannedToastMessage(serialNumber) {
    const expectedMessage = `Item ${serialNumber} is scanned successfully.`;
    cy.contains(expectedMessage).should('be.visible');
    cy.log(`Toast message verified: ${expectedMessage}`);
  }

  // Verify available quantity increased by expected amount
  verifyAvailableQuantityIncreased(initialQuantity, expectedIncrease = 1) {
    const expectedNewQuantity = initialQuantity + expectedIncrease;
    this.getAvailableQuantity().should('equal', expectedNewQuantity);
    cy.log(`Available quantity increased from ${initialQuantity} to ${expectedNewQuantity}`);
  }
}

export default InventoryActionStockInPage;
