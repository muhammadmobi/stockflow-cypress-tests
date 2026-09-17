import InventoryActionCheckItemStatusPage from '../pageObjects/InventoryActionCheckItemStatusPage';

describe('Inventory Action - Check Item Status', () => {
    let invActionCheckItemStatusPage;
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
        invActionCheckItemStatusPage = new InventoryActionCheckItemStatusPage();
    });

    it('should check item status using serial number from Excel file', () => {
        // Read the full data from the most recent Item Excel file using the new task
        cy.task('readItemExcelFileFullData', 'Item').then((rows) => {
            cy.log('Excel Rows:', rows);
            
            // rows[0] contains headers, rows[1] contains first data row
            const headers = rows[0];
            const firstRow = rows[1];
            
            cy.log('Headers:', headers);
            cy.log('First Row:', firstRow);
            
            // Find column indices dynamically
            const serialNumIndex = headers.indexOf('Serial Number');
            const categoryIndex = headers.indexOf('Category');
            const brandIndex = headers.indexOf('Brand');
            const modelIndex = headers.indexOf('Model');
            const cpuIndex = headers.indexOf('TestCPU');
            const ramIndex = headers.indexOf('TestRAM');

            // Validate that all required columns are present
            const missingColumns = [];
            if (serialNumIndex === -1) missingColumns.push('Serial Number');
            if (categoryIndex === -1) missingColumns.push('Category');
            if (brandIndex === -1) missingColumns.push('Brand');
            if (modelIndex === -1) missingColumns.push('Model');
            if (cpuIndex === -1) missingColumns.push('TestCPU');
            if (ramIndex === -1) missingColumns.push('TestRAM');

            if (missingColumns.length > 0) {
                throw new Error(`Missing expected Excel column(s): ${missingColumns.join(', ')}`);
            }
            
            // Extract data from first row using indices
            serialNumber = firstRow[serialNumIndex];
            const categoryName = firstRow[categoryIndex];
            const brand = firstRow[brandIndex];
            const model = firstRow[modelIndex];
            const cpu = firstRow[cpuIndex];
            const ram = firstRow[ramIndex];
            
            // Construct product name by combining Brand, Model, CPU, and RAM
            const productName = `${brand} ${model} ${cpu} ${ram}`;

            // Step 1: Go to Inventory action
            invActionCheckItemStatusPage.clickIncomingInventoryNav();

            // Step 2: Click on "Product Operations"
            invActionCheckItemStatusPage.clickProductOperations();

            // Step 3: Click on "Check Item Status"
            invActionCheckItemStatusPage.clickCheckItemStatus();

            // Step 4: Type serial number in text box
            invActionCheckItemStatusPage.enterSerialNumber(serialNumber);

            // Step 5: Click Button with text "Scan"
            invActionCheckItemStatusPage.clickScanButton();

            // Verify the category name
            invActionCheckItemStatusPage.verifyCategoryName(categoryName);

            // Verify the product name (Brand Model CPU RAM)
            invActionCheckItemStatusPage.verifyProductName(productName);

            // Verify the status is "Available"
            invActionCheckItemStatusPage.verifyStatus('Available');
        });
    });
});
