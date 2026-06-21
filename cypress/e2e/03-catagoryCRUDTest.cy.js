import CategoryPage from "../pageObjects/CategoryPage";
import AttribPage from "../pageObjects/AttribPage";
describe("Catagory CRUD test", () => {
  var categoryPage;
  var attribPage

  before(() => {

    cy.visit("/");
    cy.login();
  });


  beforeEach(() => {
    cy.session('user-session', () => {
      cy.visit("/");
      cy.login();
    })
    cy.visit("/");
    categoryPage = new CategoryPage();
    attribPage = new AttribPage();
  })




    it("CRUD Product Category", () => {
      const baseName = "TestScript Product Category";
      const updatedName = `Updated Product Category`;

      cy.contains("Configuration").click();
      cy.contains(/^Categories$/).click();

      // Create
      categoryPage.clickAddnewCat();
      categoryPage.typeCatName(baseName);
      categoryPage.clickSaveBt();
      categoryPage.verifyToastMsg("Category created.");
      categoryPage.verifyToastMsgNotExist();


      // Edit

      // Delete
      cy.contains("tr", baseName)
        .within(() => cy.contains(/delete/i).click({ force: true }));
      cy.contains('button', /^Yes$/i).should('be.visible').click();
      categoryPage.verifyToastMsg("Category Deleted");
    });

  it("CRUD Item Category", () => {
    const baseName = "TestScriptItem Category";
    const updatedName = `${baseName} Updated`;
    const itemAttribName = "TestBatchNo";

    cy.contains("Configuration").click();
    cy.contains(/^Categories$/).click();

    // Create (with allowItems + attribute)
    categoryPage.clickAddnewCat();
    categoryPage.typeCatName(baseName);
    cy.get('input[name="allowItems"]').check({ force: true });
    categoryPage.clickSaveAndAddAttrib();
    attribPage.clickAddAttribute();
    attribPage.typeAttributeName(itemAttribName);
    attribPage.clickSaveBt();
    categoryPage.verifyToastMsg("Attribute created.");

    // Back to list via breadcrumb
    cy.contains('button', /^Category$/).scrollIntoView().click();

    // Edit

    // Click Update button
    cy.get('button[type="submit"][form="category-form"]')
      .contains('Update')
      .click();

    // Verify update
    categoryPage.verifyToastMsg("Category updated.");

    // Delete
    cy.contains("tr", baseName)
      .within(() => cy.contains(/delete/i).click({ force: true }));
    cy.contains('button', /^Yes$/i).should('be.visible').click();
    categoryPage.verifyToastMsg("Category Deleted");
  });

});
