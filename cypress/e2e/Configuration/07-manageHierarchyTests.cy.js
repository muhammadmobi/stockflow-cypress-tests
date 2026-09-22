import CategoryPage from "../../pageObjects/CategoryPage";
import { apiEnsureBaseline } from "../../support/Configuration/apiCleanup.js";
const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

describe("Configuration - Manage Hierarchy", () => {
  let categoryPage;
  let td;

  before(() => {
    // This suite reads the baseline categories' attributes in the hierarchy modal.
    // Ensure the baseline is present/complete (build-missing, no purge) so it works
    // both standalone and in-order even if an earlier spec removed some attributes.
    loginSession();
    cy.getAuthToken().then((token) => {
      if (token) apiEnsureBaseline(token);
    });
    td = {};
    cy.fixture("Configuration/commonAttributeTestData.json").then((data) => {
      td.commonAttributes = Object.keys(data)
        .filter((key) => key.includes("common"))
        .map((key) => data[key].name);

      
    });

    cy.fixture("Configuration/prodItemCatAttributeTestData.json").then(
      (data) => {
        td.productItemCatName = data.categoryName;
        td.productItemAttributes = Object.keys(data)
          .filter((key) => key.includes("cat product"))
          .map((key) => data[key].name);

        
      },
    );

    cy.fixture("Configuration/productCatAttributeTestData.json").then(
      (data) => {
        td.productCatName = data.categoryName;
        td.productCatAttributes = Object.keys(data)
          .filter((key) => key.includes("Attribute"))
          .map((key) => data[key].name);
      },
    );

    cy.fixture("Configuration/ManageHierarchyTestData.json").then((data) => {
      td.HierarchyUpdateMsg = data.HierarchyUpdateMsg;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_HIER_01 - Verify Opening Manage Hierarchy Modal (Product Item Category)",
    { tags: ["@smoke", "@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productItemCatName);
      categoryPage.verifyModalContainAttribs(td.commonAttributes);
      categoryPage.verifyModalContainAttribs(td.productItemAttributes);
    },
  );

  it(
    "SW_CAT_HIER_07 - Verify Opening Manage Hierarchy Modal (Product Category)",
    { tags: ["@smoke", "@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productCatName);
      categoryPage.verifyModalContainAttribs(td.commonAttributes);
      categoryPage.verifyModalContainAttribs(td.productCatAttributes);
    },
  );

  it(
    "SW_CAT_HIER_02 - Verify Drag and Drop to Create Hierarchy Product Item Category",
    { tags: ["@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productItemCatName);
      const testAttribute1 = td.productItemAttributes[0];
      const testAttribute2 = td.productItemAttributes[1];
      categoryPage.dragAttributeToDependencyList(testAttribute1);
      categoryPage.dragAttributeToDependencyList(testAttribute2);
      categoryPage.clickSaveChanges();
      categoryPage.verifyDependencyUpdateMsg(td.HierarchyUpdateMsg);
    },
  );

  it(
    "SW_CAT_HIER_05 - Verify Cancel Reordering of Current Hierarchy",
    { tags: ["@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productItemCatName);
      const testAttribute1 = td.productItemAttributes[0];
      const testAttribute2 = td.productItemAttributes[1];
      categoryPage.dragItems(0, 1);
      categoryPage.verifyReordering(testAttribute1, testAttribute2);
      categoryPage.clickCancelButton();
      categoryPage.clickManageHierarchy(td.productItemCatName);
      categoryPage.verifyOrdering(testAttribute1, testAttribute2);
    },
  );

  it(
    "SW_CAT_HIER_03 - Verify Reordering of Current Hierarchy",
    { tags: ["@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productItemCatName);
      const testAttribute1 = td.productItemAttributes[0];
      const testAttribute2 = td.productItemAttributes[1];
      categoryPage.dragItems(0, 1);
      categoryPage.verifyReordering(testAttribute1, testAttribute2);
      categoryPage.clickSaveChanges();
      categoryPage.verifyDependencyUpdateMsg(td.HierarchyUpdateMsg);
    },
  );

  it(
    "SW_CAT_HIER_04 - Verify Removing Attributes from Current Hierarchy",
    { tags: ["@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productItemCatName);
      const attrName = td.productItemAttributes[0];
      categoryPage.dragAttributeFromDependencyList(attrName);
      categoryPage.verifyAttributeInAttributeList(attrName);
      categoryPage.clickSaveChanges();
      categoryPage.verifyDependencyUpdateMsg(td.HierarchyUpdateMsg);
    },
  );

  it(
    "SW_CAT_HIER_06 - Verify Cancel discards Attribute moved from attribute list to dependency list",
    { tags: ["@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productItemCatName);
      const attrName = td.productItemAttributes[2];
      categoryPage.dragAttributeToDependencyList(attrName);
      categoryPage.clickCancelButton();
      categoryPage.clickManageHierarchy(td.productItemCatName);
      categoryPage.verifyAttributeInAttributeList(attrName);
      categoryPage.verifyAttributeNotInDependencyList(attrName);
    },
  );

  it(
    "SW_CAT_HIER_08 - Verify Drag and Drop to Create Hierarchy Product  Category",
    { tags: ["@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productCatName);

      const ProdtestAttribute1 = td.productCatAttributes[0];
      const ProdtestAttribute2 = td.productCatAttributes[1];
      categoryPage.dragAttributeToDependencyList(ProdtestAttribute1);
      categoryPage.dragAttributeToDependencyList(ProdtestAttribute2);
      categoryPage.clickSaveChanges();
      categoryPage.verifyDependencyUpdateMsg(td.HierarchyUpdateMsg);
    },
  );

  it(
    "SW_CAT_HIER_09 - Verify Cancel Reordering of Current Hierarchy Product only category",
    { tags: ["@regression"] },
    () => {
      categoryPage.clickManageHierarchy(td.productCatName);
      const ProdtestAttribute1 = td.productCatAttributes[0];
      const ProdtestAttribute2 = td.productCatAttributes[1];
      categoryPage.dragItems(0, 1);
      categoryPage.verifyReordering(ProdtestAttribute1, ProdtestAttribute2);
      categoryPage.clickCancelButton();
      categoryPage.clickManageHierarchy(td.productCatName);
      categoryPage.verifyOrdering(ProdtestAttribute1, ProdtestAttribute2);
    },
  );
});
