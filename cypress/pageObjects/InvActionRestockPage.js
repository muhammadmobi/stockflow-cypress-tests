class InventoryActionRestockPage {
    // Navigation elements
    clickIncomingInventoryNav() {
        cy.get('a[aria-label="Inventory Actions"][href="/MobileViewScreen"]')
            .and("not.be.disabled")
            .click({ force: true });
    }

    // Inventory Management menu
    clickInventoryManagement() {
        cy.contains('Inventory Management').click();
    }

    // Restock option
    clickRestock() {
        cy.contains(/^Restock$/).click();
    }

    // Input field for serial number
    enterSerialNumber(serialNumber) {
        cy.get('input[type="text"]').first().clear().type(serialNumber + '{enter}');
    }

    // Scan button (if needed separately)
    clickScanButton() {
        cy.contains('button', 'Scan').click();
    }

    // Verification methods
    verifyRestockToastMessage(serialNumber) {
        const expectedMessage = `Item ${serialNumber} restocked successfully`;
        cy.contains(expectedMessage, { timeout: 10000 }).should('be.visible');
        cy.log(`Toast message verified: ${expectedMessage}`);
    }

    verifyScannedSessionListItem(serialNumber) {
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

export default InventoryActionRestockPage;
