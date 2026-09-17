import InventoryActionScanDamagedPage from '../pageObjects/InventoryActionScanDamagedPage';
describe('Inventory Action - Scan Damaged Incoming Items', () => {
    let invActionScanDamagedPage;
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
        invActionScanDamagedPage = new InventoryActionScanDamagedPage();
    });

    it('should scan and mark damaged incoming items', () => {

        // Read the serial numbers from the most recent Item Excel file using the task
        cy.task('readExcelFile', 'Item').then((serialNumbers) => {

            // Get the first serial number
            serialNumber = serialNumbers[2];

            // Open Inventory Action menu
            invActionScanDamagedPage.clickIncomingInventoryNav();

            // Click Scan Damaged Items
            invActionScanDamagedPage.clickScanDamagedItems();

            // Enter Serial Number
            invActionScanDamagedPage.enterSerialNumber(serialNumber);

            // Click Scan Damaged button
            invActionScanDamagedPage.clickScanDamagedButton();

            // Verify toast message with the scanned serial number
            invActionScanDamagedPage.verifyScanDamagedToastMessage(serialNumber);
        });
    });
});
