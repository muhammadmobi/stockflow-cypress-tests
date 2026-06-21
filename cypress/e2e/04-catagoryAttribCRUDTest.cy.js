import CategoryPage from "../pageObjects/CategoryPage";
import AttribPage from "../pageObjects/AttribPage";
import categoryLocators from "../support/locators/categoryLocators";
import {
  ItemAttribLocators,
  ListRowInputLoc,
} from "../support/locators/itemAttribLocators";
import catAttribsJson from "../fixtures/catAttribNames.json";
require("cypress-xpath");
describe("Catagory Attribute CRUD test", () => {
  let categoryPage;
  let attribPage;
  before(() => {

  });

  beforeEach(() => {
    cy.session('user-session', () => {
      cy.visit("/");
      cy.login();
    })
    cy.visit("/");
    categoryPage = new CategoryPage();
    attribPage = new AttribPage();
  });

  it("Create allow product category and peform Product Attribute CRUD Test", () => {

    const baseName = "TestScript Product Category";
    // Create Category
    cy.contains("Configuration").click();
    cy.contains(/^Categories$/).click();
    categoryPage.clickAddnewCat();
    categoryPage.typeCatName(baseName);
    categoryPage.clickSaveAndAddAttrib();
    categoryPage.verifyToastMsg("Category created.");
    categoryPage.verifyToastMsgNotExist();



    //Add category specific Boolean Attrib
    attribPage.clickAddAttribute();
    attribPage.clickSelect();
    attribPage.clickSelectOption("Boolean");
    attribPage.typeAttributeName("TestBooleanAttrib");
    attribPage.clickSaveBt();
    attribPage.assertCatUrlAndAttrib("TestBooleanAttrib");

    // Update category specific product attribute

    attribPage.editAttribute("TestBooleanAttrib");
    attribPage.typeAttributeName("updatedBoolAttribute");
    attribPage.clickUpdateBt();

    // Verify category specific product attribute is updated
    attribPage.assertUrlandItemName("updatedBoolAttribute");

    // Delete category specific product attribute
    attribPage.deleteAttribute("updatedBoolAttribute");

    // Verify category specific product attribute deletion
    attribPage.assertDeletion("updatedBoolAttribute");
  });
  it("Create allow Item category and peform Item Attribute CRUD Test", () => {
    const baseName = "TestScriptItem Category";
    cy.contains("Configuration").click();
    cy.contains(/^Categories$/).click();
    categoryPage.clickAddnewCat();
    categoryPage.typeCatName(baseName);
    cy.get('input[name="allowItems"]').click();
    categoryPage.clickSaveAndAddAttrib();

    // Create category specific Item attribute

    attribPage.clickItemAttributes();
    attribPage.clickAddAttribute();
    attribPage.clickSelect();
    attribPage.clickSelectOption("List");
    attribPage.typeInListRows([
      "list opt1",
      "list opt2",
      "list opt3",
      "list opt4",
    ]);
    attribPage.typeAttributeName("TestListItem");

    // attribPage.typeMinLength(1);
    // attribPage.typeMaxLength(20);
    attribPage.clickSaveBt();
    attribPage.assertUrlandItemName("TestListItem");

    // Update category specific Item attribute
    attribPage.clickAttribOption();
    attribPage.clickItemAttributes();
    attribPage.editAttribute("TestListItem");
    attribPage.typeAttributeName("updatedListItem");
    attribPage.clickUpdateBt();

    // Verify category specific Item attribute is updated
    attribPage.assertUrlandItemName("updatedListItem");

    // Delete category specific Item attribute
    attribPage.deleteAttribute("updatedListItem");

    // Verify category specific Item attribute deletion
    attribPage.assertDeletion("updatedListItem");
  });
  // it("Create allow variants category and peform variant Attribute CRUD Test", () => {
  //   // Create Category
  //   categoryPage.clickCatLink();
  //   categoryPage.clickAddnewCat();

  //   cy.get('input[name="allowVariants"]').click();
  //   categoryPage.typeCatName("Variant Test Category");
  //   categoryPage.clickSaveAndAddAttrib();

  //   // Create category specific  variant attribute

  //   attribPage.clickVariantAttributes();
  //   attribPage.clickAddAttribute();
  //   attribPage.clickSelect();
  //   attribPage.clickSelectOption("Percent");
  //   attribPage.typeAttributeName("TestPercent Variant");

  //   // attribPage.typeMinLength(1);
  //   // attribPage.typeMaxLength(20);
  //   attribPage.clickSaveBt();
  //   attribPage.assertUrlandItemName("TestPercent Variant");

  //   // Update category specific variant attribute
  //   attribPage.clickAttribOption();
  //   attribPage.clickVariantAttributes();
  //   attribPage.editAttribute("TestPercent Variant");
  //   attribPage.typeAttributeName("Updated test Variant");
  //   attribPage.clickUpdateBt();

  //   // Verify category specific variant attribute is updated
  //   attribPage.assertUrlandItemName("Updated test Variant");

  //   // Delete category specific variant attribute
  //   attribPage.deleteAttribute("Updated test Variant");

  //   // Verify category specific variant attribute deletion
  //   attribPage.assertDeletion("Updated test Variant");
  // });
  it("Delete created Categories", () => {
    cy.contains("Configuration").click();
    cy.contains(/^Categories$/).click();
    categoryPage.clickDelCat("TestScriptItem Category");
    categoryPage.assertCatDelete("TestScriptItem Category");
    categoryPage.clickDelCat("TestScript Product Category");
    categoryPage.assertCatDelete("TestScript Product Category");
  });
});
