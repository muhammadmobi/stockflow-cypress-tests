import InventoryActionStockInPage from '../pageObjects/InventoryActionStockInPage';
import "cypress-file-upload";
import IncomingInvLocators from '../support/locators/IncomingInvLocators';

describe('Inventory Action - Stock In Items', () => {
  let invActionItemStockInPage;
  let stockInQty;
  let serialNumber;
  let poNumber;
  let importConfig;
  let mobileConfig;


  before(() => {
    // Load import configuration to get PO number
    cy.fixture('importConfig').then((config) => {
      importConfig = config;
      poNumber = config.defaults.poNumber;
    });

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
    invActionItemStockInPage = new InventoryActionStockInPage();
  });

  it('should stock in items using Inventory Action', () => {
    var initialAvailableQuantity;

    // Read the serial numbers from the most recent Item Excel file using the task
    cy.task('readExcelFile', 'Item').then((serialNumbers) => {
      cy.log('Serial Numbers from Excel:', serialNumbers);

      // Get the first serial number
      serialNumber = serialNumbers[0];
      cy.log('Using Serial Number:', serialNumber);
      cy.log('Using PO Number:', poNumber);

      // Open Inventory Action menu
      invActionItemStockInPage.clickIncomingInventoryNav();

      // Click Stock In Button
      invActionItemStockInPage.getStockInButton().click();

      // Click Stock In Items Button
      invActionItemStockInPage.clickStockInItems();


      // Search for the PO using the correct input field
      invActionItemStockInPage.typeInSearchPO(poNumber);

      invActionItemStockInPage.clickPOResult(poNumber);

      // Get initial available quantity before scanning
      invActionItemStockInPage.getAvailableQuantity().then((quantity) => {
        initialAvailableQuantity = quantity;
        cy.log(`Initial Available Quantity: ${initialAvailableQuantity}`);
      });

      // Enter Serial Number
      invActionItemStockInPage.enterSerialNumber(serialNumber);

      // Click Scan button
      invActionItemStockInPage.clickScanButton();

      // Verify toast message with the scanned serial number
      invActionItemStockInPage.verifyScannedToastMessage(serialNumber);

      // Verify available quantity increased by 1
      cy.then(() => {
        invActionItemStockInPage.verifyAvailableQuantityIncreased(initialAvailableQuantity, 1);
      });
    });
  });

  it('should stock in product of product only category', () => {
    // Read the product details from the most recent Product Excel file
    cy.task('readItemExcelFileFullData', 'Product').then((rows) => {
      cy.log('Excel Rows:', rows);

      // rows[0] contains headers, rows[1] contains first data row
      const headers = rows[0];
      const firstRow = rows[1];
      
      cy.log('Headers:', headers);
      cy.log('First Row:', firstRow);
      
      // Find column indices dynamically
      const brandIndex = headers.indexOf('Brand');
      const modelIndex = headers.indexOf('Model');
      
      // Extract data from first row using indices
      const productBrand = firstRow[brandIndex];
      const productModel = firstRow[modelIndex];
      const stockInQuantity = importConfig.importTestQuantity.productQty;

      cy.log('Using Product Brand:', productBrand);
      cy.log('Using Product Model:', productModel);
      cy.log('Using PO Number:', poNumber);
      cy.log('Stock In Quantity:', stockInQuantity);

      // Step 1: Open Inventory Action menu
      invActionItemStockInPage.clickIncomingInventoryNav();

      // Step 2: Click Stock In Button
      invActionItemStockInPage.clickStockIn();

      // Step 3: Click Stock In Products
      invActionItemStockInPage.clickStockInProducts();

      // Step 4: Search for the PO using the correct input field
      invActionItemStockInPage.typeInSearchPO(poNumber);
      invActionItemStockInPage.clickPOResult(poNumber);

      // Step 5: Search for exact product
      invActionItemStockInPage.searchProduct(productBrand);

      // Step 6: Enter quantity and stock in
      invActionItemStockInPage.enterProductQuantity(stockInQuantity);
      invActionItemStockInPage.clickProductStockInButton();

      // Step 7: Verify toast message
      invActionItemStockInPage.verifyProductStockInToastMessage(stockInQuantity, productBrand);
    });
  });
});
