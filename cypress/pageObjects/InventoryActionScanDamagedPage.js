class InventoryActionScanDamagedPage {
  // Navigation
  clickIncomingInventoryNav() {
    cy.get('a[aria-label="Inventory Actions"][href="/MobileViewScreen"]')
      .and("not.be.disabled")
      .click({ force: true });
  }

  // Actions
  clickScanDamagedItems() {
    cy.contains('button', 'Scan Damaged Items').click();
  }

  enterSerialNumber(sn) {
    cy.get('input#serialnumber').clear().type(sn);
  }

  clickScanDamagedButton() {
    cy.contains('button', 'Scan Damaged').click();
  }

  // Verify toast message with dynamic serial number
  verifyScanDamagedToastMessage(serialNumber) {
    const expectedMessage = `Serial Number ${serialNumber} is marked as damaged.`;
    cy.contains(expectedMessage, { timeout: 5000 }).should('be.visible');
  }
}

export default InventoryActionScanDamagedPage;
