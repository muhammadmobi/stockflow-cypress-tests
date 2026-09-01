// cypress/pageObjects/WarehouseRecycleBinPage.js
//
// Page Object for the Warehouse Management → Recycle Bin page.
// Three tabs: Containers · Locations · Container Types.
// Each tab's table is backed by MRT with a Restore icon button per row.

import warehouseRecycleBinLocators from '../support/locators/warehouseRecycleBinLocators';

class WarehouseRecycleBinPage {

    // ---- Navigation --------------------------------------------------------

    visit() {
        cy.fixture('urls.json').then((urls) => {
            cy.visit(urls.warehouseRecycleBin);
        });
        // Page heading is the most stable "did the route load" signal.
        warehouseRecycleBinLocators.pageHeading().should('be.visible');
    }

    // ---- Page chrome -------------------------------------------------------

    verifyPageHeading() {
        warehouseRecycleBinLocators.pageHeading().should('be.visible');
    }

    // ---- Tab navigation ----------------------------------------------------

    switchToContainersTab() {
        warehouseRecycleBinLocators.containersTab().click();
    }

    switchToLocationsTab() {
        warehouseRecycleBinLocators.locationsTab().click();
    }

    switchToContainerTypesTab() {
        warehouseRecycleBinLocators.containerTypesTab().click();
    }

    // ---- Table helpers -----------------------------------------------------

    // Returns the number of visible body rows (excludes the MRT no-data row).
    getTableRowCount() {
        return cy.get('body').then(($body) => {
            return $body.find('table tbody tr').length;
        });
    }

    // Assert no data rows are visible (either empty state alert or MRT empty tbody).
    verifyTableEmpty() {
        cy.get('body').then(($body) => {
            const hasAlert = $body.find('.MuiAlert-standardSuccess').length > 0;
            if (hasAlert) {
                warehouseRecycleBinLocators.emptyAlert().should('be.visible');
            } else {
                warehouseRecycleBinLocators.tableRows().should('have.length', 0);
            }
        });
    }

    // Assert a row containing the given code/name is visible in the table.
    verifyRowPresent(codeOrName) {
        warehouseRecycleBinLocators.rowByCode(codeOrName).should('be.visible');
    }

    // Assert no row containing the given code/name is visible.
    verifyRowAbsent(codeOrName) {
        warehouseRecycleBinLocators.rowByCode(codeOrName).should('not.exist');
    }

    // ---- Restore Container -------------------------------------------------

    // Click the Restore Container icon for the row identified by containerCode.
    openRestoreContainerDialog(containerCode) {
        warehouseRecycleBinLocators
            .rowByCode(containerCode)
            .within(() => {
                warehouseRecycleBinLocators.restoreContainerBtn().click();
            });
        warehouseRecycleBinLocators.restoreContainerDialog().should('be.visible');
    }

    // Confirm the restore. The dialog closes and a success toast appears.
    confirmRestoreContainer() {
        warehouseRecycleBinLocators.restoreContainerConfirmBtn().click();
        // Wait for dialog to close.
        warehouseRecycleBinLocators.restoreContainerDialog().should('not.exist');
    }

    // Cancel the restore. The dialog closes without any mutation.
    cancelRestoreContainer() {
        warehouseRecycleBinLocators.restoreContainerCancelBtn().click();
        warehouseRecycleBinLocators.restoreContainerDialog().should('not.exist');
    }

    // ---- Restore Location --------------------------------------------------

    openRestoreLocationDialog(locationCodeOrPath) {
        warehouseRecycleBinLocators
            .rowByCode(locationCodeOrPath)
            .within(() => {
                warehouseRecycleBinLocators.restoreLocationBtn().click();
            });
        warehouseRecycleBinLocators.restoreLocationDialog().should('be.visible');
    }

    confirmRestoreLocation() {
        warehouseRecycleBinLocators.restoreLocationConfirmBtn().click();
        warehouseRecycleBinLocators.restoreLocationDialog().should('not.exist');
    }

    cancelRestoreLocation() {
        warehouseRecycleBinLocators.restoreLocationCancelBtn().click();
        warehouseRecycleBinLocators.restoreLocationDialog().should('not.exist');
    }

    // ---- Restore Container Type --------------------------------------------

    openRestoreContainerTypeDialog(typeName) {
        warehouseRecycleBinLocators
            .rowByCode(typeName)
            .within(() => {
                warehouseRecycleBinLocators.restoreContainerTypeBtn().click();
            });
        warehouseRecycleBinLocators.restoreTypeDialog().should('be.visible');
    }

    confirmRestoreContainerType() {
        warehouseRecycleBinLocators.restoreTypeConfirmBtn().click();
        warehouseRecycleBinLocators.restoreTypeDialog().should('not.exist');
    }

    cancelRestoreContainerType() {
        warehouseRecycleBinLocators.restoreTypeCancelBtn().click();
        warehouseRecycleBinLocators.restoreTypeDialog().should('not.exist');
    }
}

export default WarehouseRecycleBinPage;
