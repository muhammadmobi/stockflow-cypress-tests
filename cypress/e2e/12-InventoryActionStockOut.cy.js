import InventoryActionStockOutPage from '../pageObjects/InventoryActionStockOutPage';
import "cypress-file-upload";

describe('Inventory Action - Stock Out Items', () => {
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

    it('should stock out items using Inventory Action with reason "Sold"', () => {

        // Read the serial numbers from the most recent Item Excel file using the task
        cy.task('readExcelFile', 'Item').then((serialNumbers) => {

            // Get the first serial number
            serialNumber = serialNumbers[0];

            // Open Inventory Action menu
            invActionItemStockOutPage.clickIncomingInventoryNav();

            //Click stock out button
            invActionItemStockOutPage.clickStockOutButton()

            // Click Stock Out Items
            invActionItemStockOutPage.clickStockOutItems();

            // Get sold scenario from fixture data
            const soldScenario = stockOutData.reasons.sold;
            const reason = soldScenario.reason;
            const description = soldScenario.description.replace('{date}', currentDate);

            // Select reason from fixture data
            invActionItemStockOutPage.selectReason(reason);

            // Type description from fixture template with current date
            invActionItemStockOutPage.typeDescription(description);

            // Click the Scan button to focus/prepare for scanning
            invActionItemStockOutPage.clickScanButton();

            // Enter Serial Number
            invActionItemStockOutPage.enterSerialNumber(serialNumber);

            // Click Stock Out button
            invActionItemStockOutPage.clickStockOutButton();

            // Verify toast message with the stocked out serial number
            invActionItemStockOutPage.verifyStockOutToastMessage(serialNumber);


        });
    });
});
