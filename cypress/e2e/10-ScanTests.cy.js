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

    it("Stock In using scan Test", () => {
        let importConfig;
        let scanTestsData;
        let categoryName;
        let randomNum;
        let ItemBrand;
        let ItemModel;
        let ItemfilePath;
        let ItemfileName;
        let shouldValidateRedirect;
        let ExcelData;
        let expectedQty;
        let stockInQty;

        // Load scan tests data first
        cy.fixture("ScanTestsData").then((scanData) => {
            scanTestsData = scanData;
            stockInQty = scanTestsData.scanTestConfig.stockInQty;

            // Load import configuration
            return cy.fixture("importConfig");
        }).then((config) => {
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

            incomingInvPage.clickScanButton();
            incomingInvPage.scanSerialNumber(sn1);
            incomingInvPage.clickIncomingInventoryNav();

            invViewPage.searchProduct(ItemBrand);
            invViewPage.clickSubmitSearch();

            // Verify received quantity is now 1
            incomingInvPage.validateReceivedQty(stockInQty);

            // Verify available quantity is now 1
            incomingInvPage.validateAvailableQty(stockInQty);

            // Verify expected quantity remains 2 (unchanged)
            incomingInvPage.validateExpectedQty(expectedQty);

            cy.log(`Successfully performed stock-in of ${stockInQty} item for product: ${ItemBrand}`);
        });
    });


});
