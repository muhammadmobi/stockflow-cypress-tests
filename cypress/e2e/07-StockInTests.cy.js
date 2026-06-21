import IncomingInvPage from "../pageObjects/IncomingInvPage";
import CategoryPage from "../pageObjects/CategoryPage";
import AttribPage from "../pageObjects/AttribPage";
import "cypress-file-upload";
import InvViewPage from "../pageObjects/InvViewPage";
import NewProductPage from "../pageObjects/NewProductPage";

describe("Stock In tests", () => {
  var poNumber = "PO-Import-testing";
  var invViewPage;
  var newProductPage;
  var incomingInvPage;
  var attribPage;
  var categoryPage;



  beforeEach(() => {
    cy.session("user-session", () => {
      cy.visit("/");
      cy.login();
    });
    cy.visit("/");
    newProductPage = new NewProductPage();
    invViewPage = new InvViewPage();
    attribPage = new AttribPage();
    categoryPage = new CategoryPage();
    incomingInvPage = new IncomingInvPage();
  });



  // Helper functions for the import and stock-in test
  function generateRandomTimestamp() {
    let now = new Date();
    return `${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
  }

  function createExcelFile(filePath, data) {
    cy.task("createExcelFile", { filePath, data }).then((message) => {
      cy.log(message);
    });
  }

  function importExcel(fileName, filePath, shouldValidateRedirect, isNegativeTest = false) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.clickImport();
    incomingInvPage.enterPONumber(poNumber)
    incomingInvPage.uploadFile(fileName);
    incomingInvPage.clickUpload();
    if (!isNegativeTest) {
      incomingInvPage.clickOK();
    }
    if (shouldValidateRedirect) {
      incomingInvPage.validateRedirectedURL();
    }
  }

  it("Import Product-Item and perform Stock In by Quantity", () => {
    let importConfig;
    let categoryName;
    let randomNum;
    let ItemBrand;
    let ItemModel;
    let ItemfilePath;
    let ItemfileName;
    let shouldValidateRedirect;
    let ExcelData;
    let expectedQty;

    // Load import configuration
    cy.fixture("importConfig").then((config) => {
      importConfig = config;

      // Generate unique identifiers
      categoryName = importConfig.categories.itemCategory;
      randomNum = generateRandomTimestamp();
      const sn1 = `TestStockInSN1${randomNum}`;
      const sn2 = `TestStockInSN2${randomNum}`;
      ItemBrand = `TestStockIn-make-${randomNum}`;
      ItemModel = `TestStockIn-model-${randomNum}`;
      poNumber = importConfig.defaults.poNumber;
      ItemfilePath = `cypress/fixtures/${importConfig.filenameFormats.item}-StockIn-${randomNum}.xlsx`;
      ItemfileName = `${importConfig.filenameFormats.item}-StockIn-${randomNum}.xlsx`;
      shouldValidateRedirect = true;

      const stockInQty = "1";

      // Create Excel data with 2 items
      ExcelData = [
        {
          Category: categoryName,
          Brand: ItemBrand,
          Model: ItemModel,
          "Serial Number": sn1,
          Cost: importConfig.defaults.itemCost,
          Price: importConfig.defaults.itemPrice,
          TestCPU: importConfig.defaults.TestCPU,
          TestRAM: importConfig.defaults.TestRAM
        },
        {
          Category: categoryName,
          Brand: ItemBrand,
          Model: ItemModel,
          "Serial Number": sn2,
          Cost: importConfig.defaults.itemCost,
          Price: importConfig.defaults.itemPrice,
          TestCPU: importConfig.defaults.TestCPU,
          TestRAM: importConfig.defaults.TestRAM
        }
      ];

      expectedQty = ExcelData.length.toString(); // Expected quantity should be 2

      // Create and import the file
      createExcelFile(ItemfilePath, ExcelData);
      importExcel(ItemfileName, ItemfilePath, shouldValidateRedirect);

      // Navigate to incoming inventory and search for imported product
      invViewPage.searchProduct(ItemBrand);
      invViewPage.clickSubmitSearch();

      // Verify expected quantity before stock-in
      incomingInvPage.verifyExpectedQty(expectedQty);

      // Perform stock-in operation
      incomingInvPage.performCheckIn(stockInQty);

      // Verify received quantity is now 1
      incomingInvPage.validateReceivedQty(stockInQty);

      // Verify available quantity is now 1
      incomingInvPage.validateAvailableQty(stockInQty);

      // Verify expected quantity remains 2 (unchanged)
      incomingInvPage.validateExpectedQty(expectedQty);

      cy.log(`Successfully performed stock-in of ${stockInQty} item for product: ${ItemBrand}`);
    });
  });

  it("Stock In with quantity exceeding expected quantity", () => {
    let importConfig;
    let categoryName;
    let randomNum;
    let ItemBrand;
    let ItemModel;
    let ItemfilePath;
    let ItemfileName;
    let shouldValidateRedirect;
    let ExcelData;
    let expectedQty;

    // Load import configuration
    cy.fixture("importConfig").then((config) => {
      importConfig = config;

      // Generate unique identifiers
      categoryName = importConfig.categories.itemCategory;
      randomNum = generateRandomTimestamp();
      const sn1 = `TestExceedSN1${randomNum}`;
      const sn2 = `TestExceedSN2${randomNum}`;
      ItemBrand = `TestExceed-make-${randomNum}`;
      ItemModel = `TestExceed-model-${randomNum}`;
      poNumber = importConfig.defaults.poNumber;
      ItemfilePath = `cypress/fixtures/${importConfig.filenameFormats.item}-Exceed-${randomNum}.xlsx`;
      ItemfileName = `${importConfig.filenameFormats.item}-Exceed-${randomNum}.xlsx`;
      shouldValidateRedirect = true;

      // Stock-in quantity that exceeds expected (expected will be 2, we'll try to stock-in 5)
      const excessiveStockInQty = "5";

      // Create Excel data with 2 items (expected quantity = 2)
      ExcelData = [
        {
          Category: categoryName,
          Brand: ItemBrand,
          Model: ItemModel,
          "Serial Number": sn1,
          Cost: importConfig.defaults.itemCost,
          Price: importConfig.defaults.itemPrice,
          TestCPU: importConfig.defaults.TestCPU,
          TestRAM: importConfig.defaults.TestRAM
        },
        {
          Category: categoryName,
          Brand: ItemBrand,
          Model: ItemModel,
          "Serial Number": sn2,
          Cost: importConfig.defaults.itemCost,
          Price: importConfig.defaults.itemPrice,
          TestCPU: importConfig.defaults.TestCPU,
          TestRAM: importConfig.defaults.TestRAM
        }
      ];

      expectedQty = ExcelData.length.toString(); // Expected quantity should be 2

      // Create and import the file
      createExcelFile(ItemfilePath, ExcelData);
      importExcel(ItemfileName, ItemfilePath, shouldValidateRedirect);

      // Navigate to incoming inventory and search for imported product
      invViewPage.searchProduct(ItemBrand);
      invViewPage.clickSubmitSearch();

      // Verify expected quantity before stock-in
      incomingInvPage.verifyExpectedQty(expectedQty);

      // Attempt to perform stock-in with excessive quantity (5 > 2)
      incomingInvPage.performCheckIn(excessiveStockInQty);

      // Verify error toast message appears
      cy.contains("Stock In quantity exceeds incoming quantity.")
        .should('be.visible');

      // Verify received quantity remains 0 (no stock-in should have occurred)
      incomingInvPage.validateReceivedQty("0");

      // Verify available quantity remains 0 (no stock-in should have occurred)
      incomingInvPage.validateAvailableQty("0");

      // Verify expected quantity remains unchanged (2)
      incomingInvPage.validateExpectedQty(expectedQty);

      cy.log(`Successfully verified error for excessive stock-in quantity ${excessiveStockInQty} > ${expectedQty} for product: ${ItemBrand}`);
    });
  });
});
