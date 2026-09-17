import InventoryActionStockOutPage from '../pageObjects/InventoryActionStockOutPage';
import "cypress-file-upload";

describe('Inventory Action - Stock Out BTO Tests', () => {
    let invActionItemStockOutPage;
    let serialNumber;
    let mobileConfig;
    let stockOutData;
    let currentDate;

    before(() => {
        // Load mobile configuration for viewport settings
        cy.fixture('mobileConfig').then((config) => {
            mobileConfig = config;
        });

        // Load stock out test data
        cy.fixture('stockOutTestsData').then((data) => {
            stockOutData = data;
        });

        // Get current date for description
        const now = new Date();
        currentDate = now.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
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
        invActionItemStockOutPage = new InventoryActionStockOutPage();
    });

    it('should stock out item with reason "Stockout from bto"', () => {
        // Read the serial numbers from the most recent Item Excel file using the task
        cy.task('readExcelFile', 'Item').then((serialNumbers) => {

            // Get the third serial number
            serialNumber = serialNumbers[3];
            cy.log('Using Serial Number:', serialNumber);

            // Step 1: Open Inventory Action menu
            invActionItemStockOutPage.clickIncomingInventoryNav();

            // Step 2: Click Stock Out button
            invActionItemStockOutPage.clickStockOutButton();

            // Step 3: Click Stock Out Items
            invActionItemStockOutPage.clickStockOutItems();

            // Get BTO scenario from fixture data
            const btoScenario = stockOutData.reasons.stockoutFromBTO;
            const reason = btoScenario.reason;
            const description = btoScenario.description.replace('{date}', currentDate);

            // Step 4: Select reason "Stockout from bto"
            invActionItemStockOutPage.selectReason(reason);

            // Step 5: Type description
            invActionItemStockOutPage.typeDescription(description);

            // Step 6: Click the Scan button
            invActionItemStockOutPage.clickScanButton();

            // Step 7: Enter Serial Number
            invActionItemStockOutPage.enterSerialNumber(serialNumber);

            // Step 8: Click Stock Out button
            invActionItemStockOutPage.clickStockOutButton();

            // Step 9: Verify toast message with the stocked out serial number
            invActionItemStockOutPage.verifyStockOutToastMessage(serialNumber);

            // Step 10: Verify item appears in scanned session
            invActionItemStockOutPage.verifyItemInScannedSession(serialNumber);

            cy.log('Successfully stocked out item with BTO reason');
        });
    });

    it('should prevent duplicate stock out for same serial number with BTO reason', () => {
        // Read the serial numbers from the most recent Item Excel file using the task
        cy.task('readExcelFile', 'Item').then((serialNumbers) => {

            // Use the same serial number that was stocked out in the previous test
            serialNumber = serialNumbers[3];
            cy.log('Attempting to stock out same Serial Number again:', serialNumber);

            // Step 1: Open Inventory Action menu
            invActionItemStockOutPage.clickIncomingInventoryNav();

            // Step 2: Click Stock Out button
            invActionItemStockOutPage.clickStockOutButton();

            // Step 3: Click Stock Out Items
            invActionItemStockOutPage.clickStockOutItems();

            // Get BTO scenario from fixture data
            const btoScenario = stockOutData.reasons.stockoutFromBTO;
            const reason = btoScenario.reason;
            const description = btoScenario.description.replace('{date}', currentDate);

            // Step 4: Select reason "Stockout from bto"
            invActionItemStockOutPage.selectReason(reason);

            // Step 5: Type description
            invActionItemStockOutPage.typeDescription(description);

            // Step 6: Click the Scan button
            invActionItemStockOutPage.clickScanButton();

            // Step 7: Enter Serial Number (same as previous test)
            invActionItemStockOutPage.enterSerialNumber(serialNumber);

            // Step 8: Click Stock Out button
            invActionItemStockOutPage.clickStockOutButton();

            // Step 9: Verify error message that item is already stocked out
            invActionItemStockOutPage.verifyAlreadyStockedOutMessage(serialNumber);

            cy.log('Verified that duplicate stock out is prevented');
        });
    });
});
