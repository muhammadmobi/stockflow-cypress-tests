import IncomingInvPage from "../pageObjects/IncomingInvPage";
import CategoryPage from "../pageObjects/CategoryPage";
import AttribPage from "../pageObjects/AttribPage";
import categoryLocators from "../support/locators/categoryLocators";
import {
  ItemAttribLocators,
  ListRowInputLoc,
} from "../support/locators/itemAttribLocators";
import "cypress-file-upload";
import catAttribsJson from "../fixtures/catAttribNames.json";
import InvViewPage from "../pageObjects/InvViewPage";
import NewProductPage from "../pageObjects/NewProductPage";
require("cypress-xpath");
describe("Stock out tests", () => {
  var categoryPage;
  var attribPage;
  var scanPage;
  var isDownloaded = false;

  var poNumber = "PO-Import-testing";
  var Make;
  var Model;
  var serialNumber;
  var randomNum;
  var category;
  var poNumber;
  var categoryName;
  var fileName;
  var filePath;
  var InvalidSerialNo = "S-no-0I";
  var ExcelData;
  var stockoutQty;

  var invViewPage;
  var newProductPage;
  var incomingInvPage;
  var productMake;
  var productModel;
  var productQuantity;
  var productCost;
  var productPrice;
  var prodMakeUpdated;
  var prodModelUpdated;
  var categoryName;
  var VariantMake;
  var VariantModel;
  var VariantSize;
  var VariantCost;
  var VariantPrice;
  var VarMakeUpdated;
  var VarModelUpdated;
  var VarSizeUpdated;

  var ItemMake;
  var ItemModel;
  var ItemCost;
  var ItemPrice;
  var serialNumber;
  var attribPage;
  var categoryPage;
  var ItemMakeUpdated;
  var ItemModelUpdated;
  var BatchNo = "B-01";
  var UpdatedBatchNo = "B-02-updated";

  before(() => { });

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

  it("Product Stock out Test", () => {
    stockoutQty = 1;

    cy.task("readExcelFile", "Product").then((rows) => {
      cy.log("Excel Rows: ", rows);
      if (rows.length > 0 && rows[0].length > 1) {
        productMake = rows[0][2]; // First row (excluding header), second column i.e Make
        cy.log("Product Make: " + productMake); // Log the extracted value
        cy.contains(".MuiListItemText-root", /^Inventory$/).click();
        invViewPage.searchProduct(productMake);
        invViewPage.clickSubmitSearch();
        invViewPage.clickStockOut();
        invViewPage.InputStockOutQty(stockoutQty);
        invViewPage.clickStockOutFormBt();
        invViewPage.verifyToastMsg(`Quantity ${stockoutQty} Stocked-out`);
        // incomingInvPage.verifyToastMsgNotExist();
        // Verify in Inventory
        invViewPage.validateIncomingQty("0");
        invViewPage.validateAvailable("0");

        // Verify in Incoming Inventory
        cy.contains(".MuiListItemText-root", /^Incoming Inventory$/).click();

        incomingInvPage.selectPoNumber(poNumber);
        incomingInvPage.searchProduct(productMake);
        incomingInvPage.clickSubmitSearch();
        invViewPage.clickSearchResultRecord(productMake);
        incomingInvPage.validateReceivedQty("1");
        incomingInvPage.validateExpectedQty("1");
      } else {
        cy.log("No valid data found in the expected format");
      }
    });
  });

  it("Variant Stock out Test", () => {
    stockoutQty = 1;

    cy.task("readExcelFile", "Variant").then((rows) => {
      cy.log("Excel Rows: ", rows);
      if (rows.length > 0 && rows[0].length > 1) {
        VariantMake = rows[0][2];
        VariantModel = rows[0][3];
        VariantSize = rows[0][4];

        cy.contains(".MuiListItemText-root", /^Inventory$/).click();
        invViewPage.searchProduct(VariantMake + " " + VariantSize);
        invViewPage.clickSubmitSearch();
        invViewPage.clickSearchResultRecord(VariantMake);
        invViewPage.clickStockOut();
        invViewPage.InputStockOutQty(stockoutQty);
        invViewPage.clickStockOutFormBt();
        invViewPage.verifyToastMsg(`Quantity ${stockoutQty} Stocked-out`);
        incomingInvPage.verifyToastMsgNotExist();
        // Validate in Inventory
        invViewPage.validateIncomingQty("0");
        invViewPage.validateAvailable("0");

        // Verify in Incoming Inventory
        cy.contains(".MuiListItemText-root", /^Incoming Inventory$/).click();
        incomingInvPage.verifyToastMsgNotExist();
        incomingInvPage.selectPoNumber(poNumber);
        incomingInvPage.searchProduct(VariantMake + " " + VariantSize);
        incomingInvPage.clickSubmitSearch();
        invViewPage.validateProductData(VariantMake, VariantModel);
        invViewPage.clickSearchResultRecord(VariantMake);
        incomingInvPage.validateReceivedQty("1");
        incomingInvPage.validateExpectedQty("1");
      } else {
        cy.log("No valid data found in the expected format");
      }
    });
  });

  it("Item Stock out Test", () => {
    stockoutQty = 1;

    cy.task("readExcelFile", "Item").then((rows) => {
      cy.log("Excel Rows: ", rows);
      if (rows.length > 0 && rows[0].length > 1) {
        ItemMake = rows[0][2];
        ItemModel = rows[0][3];
        serialNumber = rows[0][4];

        cy.contains(".MuiListItemText-root", /^Inventory$/).click();
        invViewPage.searchProduct(ItemMake + " " + serialNumber);
        invViewPage.clickSubmitSearch();
        invViewPage.clickStockOut();
        invViewPage.InputStockOutQty(stockoutQty);
        invViewPage.clickStockOutFormBt();
        invViewPage.verifyToastMsg(`Quantity ${stockoutQty} Stocked-out`);
        incomingInvPage.verifyToastMsgNotExist();

        // Validate in Inventory
        invViewPage.validateIncomingQty("0");
        invViewPage.validateAvailable("0");

        // Verify in Incoming Inventory
        cy.contains(".MuiListItemText-root", /^Incoming Inventory$/).click();
        incomingInvPage.selectPoNumber(poNumber);
        incomingInvPage.searchProduct(ItemMake + " " + serialNumber);
        incomingInvPage.clickSubmitSearch();
        invViewPage.validateProductData(ItemMake, ItemModel);
        invViewPage.clickSearchResultRecord(ItemMake);
        incomingInvPage.validateReceivedQty("1");
        incomingInvPage.validateIncomingQty("1");
      } else {
        cy.log("No valid data found in the expected format");
      }
    });
  });

  after(() => {
    cy.task("deleteTestExcelFiles", isDownloaded).then((message) => {
      cy.log(`Cleanup after failure: ${message}`);
    });
  });
});
