class InventoryActionStockOutPage {
  // Navigation
  clickIncomingInventoryNav() {
    cy.get('a[aria-label="Inventory Actions"][href="/MobileViewScreen"]')
      .and("not.be.disabled")
      .click({ force: true });
  }


  clickStockOutItems() {
    cy.contains('button', 'Stock Out Items').click();
  }

  selectReason(reason) {
    cy.get('input[id^="react-select"]').type(`${reason}{enter}`, { delay: 100 });
  }

  typeDescription(description) {
    cy.get('textarea[name="description"]').clear().type(description);
  }

  clickScanButton() {
    cy.contains('button', 'Scan').click();
  }

  enterSerialNumber(sn) {
    cy.get('input#sn').clear().type(sn);
  }

  clickStockOutButton() {
    cy.contains('button', 'Stock Out').click();
  }

  // Verify toast message with dynamic serial number
  verifyStockOutToastMessage(serialNumber) {
    const expectedMessage = `Item ${serialNumber} stocked out successfully`;
    cy.contains(expectedMessage, { timeout: 10000 }).should('be.visible');
    cy.log(`Toast message verified: ${expectedMessage}`);
  }

  // Verify already stocked out error message
  verifyAlreadyStockedOutMessage(serialNumber) {
    const expectedMessage = `Item ${serialNumber} is already stocked out`;
    cy.contains(expectedMessage, { timeout: 10000 }).should('be.visible');
    cy.log(`Error message verified: ${expectedMessage}`);
  }

  // Verify item appears in "Scanned in this session" section
  verifyItemInScannedSession(serialNumber) {
    // Verify the scanned item appears in the session list
    cy.get(`p[title="${serialNumber}"]`).should('be.visible');

    // Verify "Scanned" status text appears
    cy.get(`p[title="${serialNumber}"]`)
      .parent()
      .within(() => {
        cy.contains('p', 'Scanned').should('be.visible');
      });

    cy.log(`Verified ${serialNumber} in scanned session list`);

  }

}

export default InventoryActionStockOutPage;
