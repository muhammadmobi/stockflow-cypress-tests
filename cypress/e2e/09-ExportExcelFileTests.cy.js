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
describe("Export Excel File tests", () => {
  let invViewPage;
  let newProductPage;
  let attribPage;
  let categoryPage;
  let incomingInvPage;
  var UIdata = {};
  before(() => {});
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
  it("Export Selected Excel File Test", () => {
    cy.contains(/^Inventory$/).click();
    invViewPage.selectCategory("TestProduct Category");
    invViewPage.selectCostCol();
    invViewPage.selectPriceCol();
    cy.get("thead tr").within(() => {
      cy.get("th").should(($headers) => {
        const headerTexts = $headers
          .map((index, el) => Cypress.$(el).text().trim())
          .get();
        console.log("Header Texts:", headerTexts); // Log the header texts for debugging

        expect(headerTexts).to.include("Cost0");
        expect(headerTexts).to.include("Price0");
      });
    });
    invViewPage.SelectFirstRecord();
    invViewPage.retrieveSelectedRowData().then((data) => {
      UIdata = data; // Store the retrieved data
      cy.log("UIdata from UI:", JSON.stringify(UIdata)); // Log the UI data for debugging
    });
    invViewPage.clickExport();
    cy.task("waitForDownload", "Inventory.xlsx");
    cy.task("readDownloadedFile").then((worksheet) => {
      validateData(UIdata, worksheet);
    });
  });
  it("Export Searched Record Excel File Test", () => {
      let productMake = "DefaultMake";
       cy.task("readExcelFile", "Product").then((rows) => {
      cy.log("Excel Rows: ", rows);
      if (rows.length > 0 && rows[0].length > 1) {
        productMake = rows[0][2];
      }
    }).then(() => {
   console.log("Product Make: " + productMake); // Log the extracted value
    cy.contains(/^Inventory$/).click();
    invViewPage.selectCategory("TestProduct Category");
    invViewPage.selectCostCol();
    invViewPage.selectPriceCol();
    cy.get("thead tr").within(() => {
      cy.get("th").should(($headers) => {
        const headerTexts = $headers
          .map((index, el) => Cypress.$(el).text().trim())
          .get();
        console.log("Header Texts:", headerTexts); // Log the header texts for debugging

        expect(headerTexts).to.include("Cost0");
        expect(headerTexts).to.include("Price0");
      });
    });
    invViewPage.searchProduct(productMake);
    invViewPage.clickSubmitSearch();
    invViewPage.retrieveAllRowsData().then((data) => {
      UIdata = data; // Store the retrieved data
      cy.log("UIdata from UI:", JSON.stringify(UIdata)); // Log the UI data for debugging
    });
    invViewPage.clickExportAll("Export All");
    cy.task("waitForDownload", "Inventory.xlsx");
    cy.task("readDownloadedFile").then((worksheet) => {
      validateData(UIdata, worksheet);
    });
    })
 
  });
  function validateData(UIdata, excelData) {
    // 1. Validate headers match
    const uiKeys = Object.keys(UIdata);
    const excelHeaders = excelData[0];
    expect([...uiKeys].sort()).to.deep.equal([...excelHeaders].sort());
    // 2. Create header to column index mapping
    const headerMap = excelHeaders.reduce((map, header, index) => {
      map[header] = index;
      return map;
    }, {});
    // 3. Validate data rows (skip header row)
    for (let rowIndex = 1; rowIndex < excelData.length; rowIndex++) {
      const excelRow = excelData[rowIndex];
      uiKeys.forEach((key) => {
        const excelColIndex = headerMap[key];
        const uiValue = UIdata[key][rowIndex - 1]; // UI data starts from 0
        const excelValue = excelRow[excelColIndex];
        // Log values before comparison
        cy.log(`Comparing row ${rowIndex}, column '${key}':`);
        cy.log(`- UI value: ${uiValue} (type: ${typeof uiValue})`);
        cy.log(`- Excel value: ${excelValue} (type: ${typeof excelValue})`);
        // Convert both to string for consistent comparison
        expect(String(uiValue)).to.equal(String(excelValue));
      });
    }
    cy.log(" All UI data matches the exported Excel data");
  }
  after(() => {
    cy.task("deleteTestExcelFiles").then((message) => {
      cy.log(`Cleanup after failure: ${message}`);
    });
  });
});
