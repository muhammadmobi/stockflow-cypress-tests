class InventoryActionCheckItemStatusPage {
    // Navigation elements
    clickIncomingInventoryNav() {
        cy.get('a[aria-label="Inventory Actions"][href="/MobileViewScreen"]')
            .and("not.be.disabled")
            .click({ force: true });
    }


    // Product Operations menu
    clickProductOperations() {
        cy.contains('Product Operations').click();
    }

    // Check Item Status option
    clickCheckItemStatus() {
        cy.contains('Check Item Status').click();
    }

    // Input field for serial number
    enterSerialNumber(serialNumber) {
        cy.get('input[type="text"]').first().clear().type(serialNumber);
    }

    // Scan button
    clickScanButton() {
        cy.contains('button', 'Scan').click();
    }

    // Verification methods
    verifyCategoryName(categoryName) {
        // Verify category name in MuiListItemText-primary
        cy.get('.MuiListItemText-primary').should('contain.text', categoryName);
    }

    verifyProductName(productName) {
        // Verify product name (Brand Model CPU RAM)
        cy.get('.MuiListItemText-secondary p.MuiTypography-body2').first().should('contain.text', productName);
    }

    verifyStatus(expectedStatus) {
        // Verify status value
        cy.get('.MuiStack-root').contains('Status:').parent().within(() => {
            cy.get('p').last().should('contain.text', expectedStatus);
        });
    }
}

export default InventoryActionCheckItemStatusPage;
