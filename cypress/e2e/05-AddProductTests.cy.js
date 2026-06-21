import CategoryPage from "../pageObjects/CategoryPage";
import AttribPage from "../pageObjects/AttribPage";
import categoryLocators from "../support/locators/categoryLocators";
import {
  ItemAttribLocators,
  ListRowInputLoc,
} from "../support/locators/itemAttribLocators";
import catAttribsJson from "../fixtures/catAttribNames.json";
import InvViewPage from "../pageObjects/InvViewPage";
import NewProductPage from "../pageObjects/NewProductPage";
require("cypress-xpath");
describe("Add & Update Product tests", () => {
  var invViewPage;
  var newProductPage;
  var productMake;
  var productModel;
  var productQuantity;
  var productCost;
  var productPrice;
  var prodMakeUpdated;
  var prodModelUpdated;

  var VariantMake;
  var VariantModel;
  var VariantSize = "TestScript-32GB";
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
  var attributes;

  before(() => {
    cy.fixture("EssentialAttributes").then((data) => {
      attributes = data;
    });
  });

  beforeEach(() => {
    cy.visit("/");
    cy.login();
    newProductPage = new NewProductPage();
    invViewPage = new InvViewPage();
    attribPage = new AttribPage();
    categoryPage = new CategoryPage();
  });

  it("Add Product Test", () => {
    var now = new Date();
    var randomNum = `${now.getDay()}${now.getMinutes()}${now.getSeconds()}`; // Day + Min + Sec
    productMake = `Test-make-${randomNum}`;
    productModel = `Test-model-${randomNum}`;
    productQuantity = 1;
    productCost = "100";
    productPrice = "150";
    cy.contains(/^Inventory$/).click();
    newProductPage.clickAddProduct();
    newProductPage.selectCategory("TestProduct Category");
    newProductPage.enterDetails({
      [attributes.product[0]]: productMake,
      [attributes.product[1]]: productModel,
      [attributes.product[2]]: productQuantity,
      [attributes.product[3]]: productCost,
      [attributes.product[4]]: productPrice,
    });
    newProductPage.clickSave();
    newProductPage.verifyToastMsg("Product");
  });

  it("Search added product Test", () => {
    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(productMake);
    invViewPage.clickSubmitSearch();
    invViewPage.validateTableHeader(
      attributes.product[0],
      attributes.product[1]
    );
    invViewPage.validateProductData(productMake, productModel);
  });

  it("Add variant Test", () => {
    let now = new Date();
    let randomNum = `${now.getDay()}${now.getMinutes()}${now.getSeconds()}`; // Day + Min + Sec
    VariantMake = `Test-make-${randomNum}`;
    VariantModel = `Test-model-${randomNum}`;

    cy.contains(/^Inventory$/).click();
    newProductPage.clickAddProduct();
    newProductPage.selectCategory("TestVariant Category");
    newProductPage.enterDetails({
      [attributes.product[0]]: VariantMake,
      [attributes.product[1]]: VariantModel,
    });
    newProductPage.clickSave();
    newProductPage.verifyToastMsg("Product");

    // Search added product.
    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(VariantMake);
    invViewPage.clickSubmitSearch();
    invViewPage.clickSearchResultRecord(VariantMake);

    // Add Variant
    invViewPage.clickAddVariant();
    cy.get('input[name="testsize"]').type(VariantSize);
    cy.get('input[name="quantity"]').type("1");
    cy.get('input[name="cost"]').type("200");
    cy.get('input[name="price"]').type("250");
    newProductPage.clickSave();
    newProductPage.verifyToastMsg("Variant");
  });

  it("Search added variant Test", () => {
    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(VariantMake + " " + VariantSize);
    invViewPage.clickSubmitSearch();
    invViewPage.clickSearchResultRecord(VariantMake);
    invViewPage.validateTableHeader("TestSize");
    invViewPage.validateProductData(VariantSize);
  });

  it("Add Item Test", () => {
    let now = new Date();
    let randomNum = `${now.getDay()}${now.getMinutes()}${now.getSeconds()}`; // Day + Min + Sec
    ItemMake = `Test-make-${randomNum}`;
    ItemModel = `Test-model-${randomNum}`;
    serialNumber = `TestScript-sn-${randomNum}`;

    cy.contains(/^Inventory$/).should("not.be.disabled").click();
    newProductPage.clickAddProduct();
    newProductPage.selectCategory("TestItem Category");
    newProductPage.enterDetails({
      [attributes.product[0]]: ItemMake,
      [attributes.product[1]]: ItemModel,
    });
    newProductPage.clickSave();
    newProductPage.verifyToastMsg("Product");
    // Search added product.
    cy.contains(/^Inventory$/).should("not.be.disabled").click();
    invViewPage.searchProduct(ItemMake);
    invViewPage.clickSubmitSearch();
    invViewPage.clickSearchResultRecord(ItemMake);

    // Add Item
    invViewPage.clickAddItem();
    cy.get("#sn")
      .should("be.visible")
      .click()
      .clear() // clear any old value
      .type(serialNumber) // type the new serial number
      .should("have.value", serialNumber); // confirm value is typed

    
    
    cy.get("#sn")
      .focus() // ensure focus is active
      .trigger('keydown', { key: 'Enter' })
  
      
    cy.get('input[name="cost"]').type("300");
    cy.get('input[name="price"]').type("350");
    cy.get('input[name="testbatchno"]').type(BatchNo);
    cy.get('.MuiChip-root').should('have.length.gt', 0);
    newProductPage.clickSave();
    newProductPage.verifyToastMsg("Item(s)");
  });

  it("Search added Item Test", () => {
    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(ItemMake + " " + serialNumber);
    invViewPage.clickSubmitSearch();
    invViewPage.clickSearchResultRecord(ItemMake);
    invViewPage.validateTableHeader("Serial Number");
    invViewPage.validateProductData(serialNumber);
  });
  it("Update Product Test", () => {
    // Update
    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(productMake);
    invViewPage.clickSubmitSearch();
    invViewPage.clickEdit();
    prodMakeUpdated = productMake + "Updated";
    prodModelUpdated = productModel + "Updated";
    newProductPage.enterDetails({
      [attributes.product[0]]: prodMakeUpdated,
      [attributes.product[1]]: prodModelUpdated,
    });
    newProductPage.clickUpdate();
    // Validate
    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(prodMakeUpdated);
    invViewPage.clickSubmitSearch();
    invViewPage.validateTableHeader(
      attributes.product[0],
      attributes.product[1]
    );
    invViewPage.validateProductData(prodMakeUpdated, prodModelUpdated);
  });

  it("Update Variant Test", () => {
    // Update Variant Product

    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(VariantMake);
    invViewPage.clickSubmitSearch();
    invViewPage.clickEdit();
    VarMakeUpdated = VariantMake + "Updated";
    VarModelUpdated = VariantModel + "Updated";
    newProductPage.enterDetails({
      [attributes.product[0]]: VarMakeUpdated,
      [attributes.product[1]]: VarModelUpdated,
    });
    newProductPage.clickUpdate();

    // Validate Variant Product

    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(VarMakeUpdated);
    invViewPage.clickSubmitSearch();
    invViewPage.validateTableHeader(
      attributes.product[0],
      attributes.product[1]
    );

    let varAttribute = attributes.variant[3]; // TestSize
    invViewPage.validateProductData(VarMakeUpdated);

    // Update  variant
    VarSizeUpdated = "200GB";
    invViewPage.searchProduct(VarMakeUpdated + " " + VariantSize);
    invViewPage.clickSubmitSearch();
    invViewPage.clickSearchResultRecord(VarMakeUpdated);
    invViewPage.clickEdit();
    cy.get('input[name="testsize"]').clear().type(VarSizeUpdated);
    newProductPage.clickUpdate();
    invViewPage.verifyToastMsgNotExist();

    // validate updated variant
    invViewPage.validateTableHeader(varAttribute);
    invViewPage.clickViewAll();
    invViewPage.validateProductData(VarSizeUpdated);
  });

  it("Update Item test", () => {
    // Update Item Product

    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(ItemMake);
    invViewPage.clickSubmitSearch();
    invViewPage.clickEdit();
    ItemMakeUpdated = ItemMake + "Updated";
    ItemModelUpdated = ItemModel + "Updated";
    newProductPage.enterDetails({
      [attributes.product[0]]: ItemMakeUpdated,
      [attributes.product[1]]: ItemModelUpdated,
    });
    newProductPage.clickUpdate();

    // Validate Item Product

    cy.contains(/^Inventory$/).click();
    invViewPage.searchProduct(ItemMakeUpdated + " " + serialNumber);
    invViewPage.clickSubmitSearch();
    invViewPage.validateTableHeader(
      attributes.product[0],
      attributes.product[1]
    );
    invViewPage.validateProductData(ItemMakeUpdated, ItemModelUpdated);
    invViewPage.clickSearchResultRecord(ItemMakeUpdated);
    invViewPage.clickEditTxt();
    invViewPage.updateItemAttrib({ [attributes.item[5]]: UpdatedBatchNo });
    newProductPage.clickUpdate();
    invViewPage.validateTableHeader(attributes.item[5]);
    invViewPage.validateProductData(UpdatedBatchNo);
  });

});
