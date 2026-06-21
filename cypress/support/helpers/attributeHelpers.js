import AttribPage from "../../pageObjects/AttribPage";
import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import NavigationPage from "../../pageObjects/navigationPage";
import GeneralConfigPage from "../../pageObjects/GeneralConfigPage";
import CategoryPage from "../../pageObjects/CategoryPage";

/**
 * Extract attribute names from fixture data by key prefix.
 * @param {Object} data - fixture data object
 * @param {string} prefix - key prefix (e.g. "common ", "item ", "cat product ", "cat item ", or "" for none)
 * @returns {Object} map of type → name, e.g. { text: "Display Technology", ... }
 */
export const extractAttrNames = (data, prefix) => {
    const types = [
      "text",
      "multiLineText",
      "number",
      "email",
      "url",
      "decimal",
      "amount",
      "percent",
      "list",
      "boolean",
    ];
    const result = {};
    types.forEach((type) => {
        const key = prefix ? `${prefix}${type}` : type;
        const keyWithSuffix = prefix ? `${prefix}${type}Attribute` : `${type}Attribute`;
        if (data[key]) {
            result[type] = data[key].name;
        } else if (data[keyWithSuffix]) {
            result[type] = data[keyWithSuffix].name;
        }
    });
    return result;
};

/**
 * Create an Excel file dynamically with provided data.
 * @param {string} filePath - path where file should be created
 * @param {Array} data - array of row objects for the Excel file
 */
export const createExcelFile = (filePath, data) => {
    cy.task("createExcelFile", { filePath, data }).then((msg) => cy.log(msg));
};

/**
 * Import an Excel file with inventory data for a given PO.
 * @param {string} poNumber - Purchase Order number
 * @param {string} fileName - name of the file to upload
 */
export const importExcelFile = (poNumber, fileName) => {
    const invPage = new IncomingInvPage();
    invPage.clickIncomingInventoryNav();
    invPage.clickImport();
    invPage.enterPONumber(poNumber);
    invPage.uploadFile(fileName);
    invPage.clickUpload();
    invPage.clickOK();
};

/**
 * Import attributes from JSON file and enable attribute import/export in General Config.
 * Prerequisites: Must be logged in
 */
export const importAttributesAndCategories = () => {
  const navPage = new NavigationPage();
  const configPage = new GeneralConfigPage();

  // Step 1: Navigate to General Config
  navPage.clickConfiguration();
  navPage.clickGeneralConfig();

  // Step 2: Enable "Allow Import/Export of Attributes" toggle (generic helper)
  configPage.enableToggle("enableImportExportAttributes");

  // Step 3: Navigate to Attributes page
  navPage.clickConfiguration();
  navPage.clickAttributes();

  // Step 4: Import attributes from JSON file
  const attribPage = new AttribPage();
  attribPage.importAttributesFromFile(
    "cypress/fixtures/testDataAttributes.json",
  );

  // Handle both success and error
  cy.get("[role='alert']", { timeout: 10000 }).then(($alert) => {
    const msg = $alert.text();
    msg.includes("already exists");

    if (msg.includes("already exists")) {
      cy.log("✓ Attributes already imported (this is OK)");
      cy.wrap($alert).first().click(); // Dismiss error
    } else if (msg.includes("successfully")) {
      cy.log("✓ Attributes imported successfully");
      cy.wrap($alert).first().click(); // Dismiss success
    }
  });

  cy.wait(300); // Wait for toast to disappear
};

/**
 * Delete all common product and item attributes.
 * @param {Object} commonProductAttrs - map of attribute type → name for products
 * @param {Object} commonItemAttrs - map of attribute type → name for items
 */
export const deleteAllCommonAttributes = (commonProductAttrs, commonItemAttrs) => {
    if (!commonProductAttrs && !commonItemAttrs) return;
    const attribPage = new AttribPage();

    // Delete common product attributes
    if (commonProductAttrs) {
        attribPage.clickAttribOption();
        attribPage.clickProductAttributes();
        cy.wait(2000);
        cy.wrap(Object.values(commonProductAttrs)).each((attrName) => {
            attribPage.tryDeleteAttribute(attrName);
        });
    }

    // Delete common item attributes
    if (commonItemAttrs) {
        attribPage.clickItemAttributes();
        cy.wait(2000);
        cy.wrap(Object.values(commonItemAttrs)).each((attrName) => {
            attribPage.tryDeleteAttribute(attrName);
        });
    }
};

/**
 * Delete a single category by name.
 * @param {string} categoryName - name of the category to delete
 */
export const deleteCategory = (categoryName) => {
    const categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
    categoryPage.clickDelCat(categoryName);
    categoryPage.assertCatDelete(categoryName);
};

/**
 * Delete multiple categories by name.
 * @param {Array<string>} categoryNames - array of category names to delete
 */
export const deleteCategories = (categoryNames) => {
    categoryNames.forEach((categoryName) => {
        deleteCategory(categoryName);
    });
};
