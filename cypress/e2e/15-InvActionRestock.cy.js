import InventoryActionRestockPage from '../pageObjects/InvActionRestockPage';

describe('Inventory Action - Item Restock Test', () => {
    let invActionRestockPage;
    let serialNumber;
    let mobileConfig;

    before(() => {
        // Load mobile configuration for viewport settings
        cy.fixture('mobileConfig').then((config) => {
            mobileConfig = config;
        });
    });

    beforeEach(() => {
         cy.session('user-session', () => {
            cy.visit('/');
            cy.login();
        });

        // Set viewport from mobile config
        cy.viewport(mobileConfig.viewport.device);
        cy.visit('/');
        invActionRestockPage = new InventoryActionRestockPage();
    });

    it('should restock item using serial number', () => {
        // Read the serial numbers from the most recent Item Excel file using the task
        cy.task('readExcelFile', 'Item').then((serialNumbers) => {
            // Get the first serial number
            serialNumber = serialNumbers[0];
            cy.log('Using Serial Number:', serialNumber);

            // Step 1: Go to Inventory Action
            invActionRestockPage.clickIncomingInventoryNav();

            // Step 2: Click Inventory Management
            invActionRestockPage.clickInventoryManagement();

            // Step 3: Click Restock
            invActionRestockPage.clickRestock();

            // Step 4: Scan serial number
            invActionRestockPage.enterSerialNumber(serialNumber);

            // Step 5: Verify toast message "Item {serialNumber} restocked successfully"
            invActionRestockPage.verifyRestockToastMessage(serialNumber);

            // Step 6: Verify Scanned Session List contains the scanned item
            invActionRestockPage.verifyScannedSessionListItem(serialNumber);
        });


    });


});
