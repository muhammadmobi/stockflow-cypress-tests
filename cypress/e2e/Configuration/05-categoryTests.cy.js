import "cypress-file-upload";
import CategoryPage from "../../pageObjects/CategoryPage";
import AttribPage from "../../pageObjects/AttribPage";
import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import categoryLocators from "../../support/locators/categoryLocators";

// ─── Session Helper ────────────────────────────────────────────────────────────

const loginSession = () => {
    cy.session("user-session", () => {
        cy.visit("/");
        cy.login();
    });
    cy.visit("/");
};

// ─── Excel / Import Helpers ─────────────────────────────────────────────────────

function createExcelFile(filePath, data) {
    cy.task("createExcelFile", { filePath, data }).then((msg) => cy.log(msg));
}

function importExcelFile(poNumber, fileName) {
    const invPage = new IncomingInvPage();
    invPage.clickIncomingInventoryNav();
    invPage.clickImport();
    invPage.enterPONumber(poNumber);
    invPage.uploadFile(fileName);
    invPage.clickUpload();
    invPage.clickOK();
}

// ─── Global Before ─────────────────────────────────────────────────────────────

before(() => {
    loginSession();
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE – Category Setup
// ─────────────────────────────────────────────────────────────────────────────

describe("CREATE - Category Setup (SW_CAT_01, SW_CAT_03)", () => {
    let categoryPage;

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_01 - Create a new category 'Laptop Automation Cat' with Allow Items enabled and navigate to Add Attribute screen", { tags: ["@smoke" ,  "@regression"] }, () => {
        categoryPage.clickAddnewCat();
        categoryPage.typeCatName("Laptop Automation Cat");
        categoryPage.checkAllowItems();
        categoryPage.clickSaveAndAddAttrib();

        // Verify toast
        cy.contains("Category created.", { timeout: 10000 }).should("be.visible");

        // Verify navigation to attribute management page
        cy.url({ timeout: 10000 }).should("include", "attributes");

        // Verify breadcrumb segment
        cy.contains("Laptop Automation Cat").should("be.visible");

        // Verify Product Attributes tab is active by default
        cy.contains("button", /Product Attributes/i).should("be.visible");

        // Verify both tabs are visible
        cy.contains("button", /Product Attributes/i).should("be.visible");
        cy.contains("button", /Item Attributes/i).should("be.visible");

        // Verify default attributes present
        cy.contains("Category").should("be.visible");
    });

    it("SW_CAT_03 - Create 'RAM Automation Cat' as a product-only category (Allow Items: Disabled)", { tags: ["@smoke",  "@regression"] }, () => {
        categoryPage.clickAddnewCat();
        categoryPage.typeCatName("RAM Automation Cat");
        // Allow Items toggle remains OFF (default)
        categoryPage.clickSaveAndAddAttrib();

        // Verify toast
        cy.contains("Category created.", { timeout: 10000 }).should("be.visible");

        // Verify navigation to attribute management page
        cy.url({ timeout: 10000 }).should("include", "attributes");

        // Verify breadcrumb segment
        cy.contains("RAM Automation Cat").should("be.visible");

        // Verify only Product Attributes tab (no Item Attributes tab)
        cy.contains("button", /Product Attributes/i).should("be.visible");
        cy.contains("button", /Item Attributes/i).should("not.be.visible");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// READ – Navigation & Page Structure
// ─────────────────────────────────────────────────────────────────────────────

describe("READ - Navigation & Page Structure (SW_CAT_02, SW_CAT_04 – SW_CAT_07)", () => {
    let categoryPage;

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
    });

    it("SW_CAT_02 - Verify that clicking 'Manage Attribute' for Laptop Automation Cat navigates to the attribute management page", { tags: ["@regression"] }, () => {
        categoryPage.navigateToCategories();
        categoryPage.clickManageAttributes("Laptop Automation Cat");

        cy.url({ timeout: 10000 }).should("include", "category-attributes");
        cy.contains("Laptop Automation Cat").should("be.visible");
        cy.contains("button", /Product Attributes/i).should("be.visible");
        cy.contains("button", /Item Attributes/i).should("be.visible");
    });

    it("SW_CAT_04 - Verify clicking 'Manage Attribute' for product-only category RAM Automation Cat shows product attributes only", { tags: ["@regression"] }, () => {
        categoryPage.navigateToCategories();
        categoryPage.clickManageAttributes("RAM Automation Cat");

        cy.url({ timeout: 10000 }).should("include", "attributes");
        cy.contains("RAM Automation Cat").should("be.visible");
        cy.contains("button", /Product Attributes/i).should("be.visible");
        cy.contains("button", /Item Attributes/i).should("not.be.visible");
    });

    it("SW_CAT_05 - Verify user can access Category page through side menu", { tags: ["@regression"] }, () => {
        cy.contains("Configuration").click();
        cy.contains(/^Categories$/).click();
        cy.url({ timeout: 10000 }).should("include", "category");
        cy.contains(/Add Category/i).should("be.visible");
    });

    it("SW_CAT_06 - Verify the URL updates correctly when Category page loads", { tags: ["@regression"] }, () => {
        categoryPage.navigateToCategories();
        cy.url({ timeout: 10000 }).should("include", "configurations/category");
    });

    it("SW_CAT_07 - Verify Category page breadcrumbs", { tags: ["@regression"] }, () => {
        categoryPage.navigateToCategories();
        cy.contains(/Dashboard/i).should("be.visible");
        cy.contains(/Configurations/i).should("be.visible");
        cy.contains(/Category/i).should("be.visible");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// READ – Add Category Form UI Checks
// ─────────────────────────────────────────────────────────────────────────────

describe("READ - Add Category Form UI Checks (SW_CAT_08 – SW_CAT_14)", () => {
    let categoryPage;

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
        categoryPage.clickAddnewCat();
    });

    it("SW_CAT_08 - Verify Add Category modal title is 'Add Category'", { tags: ["@regression"] }, () => {
        categoryPage.assertTextVisible(/Add Category/i);
    });

    it("SW_CAT_09 - Verify Name field is present in Add Category modal", { tags: ["@regression"] }, () => {
        categoryPage.assertNameFieldProperties({ visible: true });
    });

    it("SW_CAT_10 - Verify Cancel button closes modal without saving", { tags: ["@regression"] }, () => {
        categoryPage.typeCatName("Should Not Be Saved");
        categoryPage.clickCancel();
        categoryPage.assertModalClosed();
        cy.get("table").should("not.contain", "Should Not Be Saved");
    });

    it("SW_CAT_12 - Verify Add Category form contains Name input field", { tags: ["@regression"] }, () => {
        categoryPage.assertNameFieldProperties({ visible: true, type: "text" });
    });

    it("SW_CAT_13 - Verify Allow Items toggle is present and OFF by default in Add Category", { tags: ["@regression"] }, () => {
        categoryPage.assertNameFieldProperties({ exists: true });
        categoryPage.assertAllowItemsToggle("unchecked");
    });

    it("SW_CAT_14 - Verify Save, Save & Add Attributes, and Cancel buttons are present in Add Category", { tags: ["@regression"] }, () => {
        categoryPage.assertButtonVisible("Save");
        categoryPage.assertButtonVisible("Save & Add Attribute");
        categoryPage.assertButtonVisible("Cancel");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation – Name Rules
// ─────────────────────────────────────────────────────────────────────────────

describe("Validation - Name Rules (SW_CAT_17, SW_CAT_34 – SW_CAT_36)", () => {
    let categoryPage;

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
        categoryPage.clickAddnewCat();
    });

    it("SW_CAT_17 - Verify Name field is mandatory in Add Category (empty name → validation error)", { tags: ["@regression"] }, () => {
        // Leave name empty, click Save
        categoryPage.clickSaveBt();
        categoryPage.assertNameFieldError();
        categoryPage.assertUrlContains("category");
    });



    it("SW_CAT_34 - Create Category with Duplicate Name shows duplicate error", { tags: ["@regression"] }, () => {
        categoryPage.typeCatName("Laptop Automation Cat");
        categoryPage.checkAllowItems();
        categoryPage.clickSaveAndAddAttrib();
        categoryPage.assertToast(/category name must be unique/i);
    });

    it("SW_CAT_35 - Create Category with Special Characters Only shows validation error", { tags: ["@regression"] }, () => {
        categoryPage.typeCatName("@#$%^&*");
        categoryPage.clickSaveAndAddAttrib();
        categoryPage.assertToast("Only letters, numbers, periods (.), dashes (-), underscores (_) and spaces are allowed.", 8000);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// READ – Sorting & Pagination
// ─────────────────────────────────────────────────────────────────────────────

describe("READ - Sorting & Pagination (SW_CAT_19 – SW_CAT_20)", () => {
    let categoryPage;

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_19 - Category List Sorting – Ascending (click Category Name header once)", { tags: ["@regression"] }, () => {
        // Wait for initial table load before interacting
        cy.get(categoryLocators.tableRows).should("have.length.at.least", 1);
        cy.intercept("GET", "**/categories?*sortOrder=Asc*").as("sortAsc");
        categoryLocators.sortLabelByColumn("Category Name").first().click();
        cy.wait("@sortAsc");
        // Verifies rows are sorted A→Z with "Default" always pinned at top
        categoryPage.assertCategoriesSorted("asc");
    });

    it("SW_CAT_20 - Category List Sorting – Descending (click Category Name header twice)", { tags: ["@regression"] }, () => {
        // Wait for initial table load before interacting
        cy.get(categoryLocators.tableRows).should("have.length.at.least", 1);
        // Click 1: unsorted → ascending
        cy.intercept("GET", "**/categories?*sortOrder=Asc*").as("sortAsc");
        categoryLocators.sortLabelByColumn("Category Name").first().click();
        cy.wait("@sortAsc");
        cy.get(categoryLocators.tableRows).should("have.length.at.least", 1);
        // Click 2: ascending → descending
        cy.intercept("GET", "**/categories?*sortOrder=desc*").as("sortDesc");
        categoryLocators.sortLabelByColumn("Category Name").first().click();
        cy.wait("@sortDesc");
        cy.get(categoryLocators.tableRows).should("have.length.at.least", 1);
        // Verifies rows are sorted Z→A with "Default" always pinned at top
        categoryPage.assertCategoriesSorted("desc");
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE – Edit Category
// ─────────────────────────────────────────────────────────────────────────────

describe("UPDATE - Edit Category (SW_CAT_22 – SW_CAT_25)", () => {
    let categoryPage;
    let td;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_22 - Verify the category name can be updated for a Product-Only category (RAM Automation Cat)", { tags: ["@smoke"] }, () => {
        // Edit: rename to Edited
        categoryPage.clickEditButton(td.ramCatName);
        categoryPage.updatedCatName(td.ramCatName, td.ramCatEdited);
        categoryPage.clickUpdateCat();

        categoryPage.assertToast("Category updated.");
        categoryPage.assertCatEdit(td.ramCatEdited);
    });

    it("SW_CAT_23 - Verify the category name can be updated for a Product-Item category (Laptop Automation Cat)", { tags: ["@smoke"] }, () => {
        // Edit: rename to Edited
        categoryPage.clickEditButton(td.laptopCatName);
        categoryPage.updatedCatName(td.laptopCatName, td.laptopCatEdited);
        categoryPage.clickUpdateCat();

        categoryPage.assertToast("Category updated.");
        categoryPage.assertCatEdit(td.laptopCatEdited);

    });

    it("SW_CAT_24 - Verify enabling the 'Allow Items' toggle for a Product-Only category (RAM Automation Cat)", { tags: ["@regression"] }, () => {
        // Enable Allow Items for RAM (product-only → product-item)
        categoryPage.clickEditButton(td.ramCatName);
        categoryPage.toggleAllowItems(true);
        categoryPage.clickUpdateCat();
        categoryPage.assertToast("Category updated.");

        // Restore: disable Allow Items
        categoryPage.clickEditButton(td.ramCatName);
        categoryPage.toggleAllowItems(false);
        categoryPage.clickUpdateCat();
        categoryPage.assertToast("Category updated.");
    });

    it("SW_CAT_25 - Verify disabling the 'Allow Items' toggle for a Product-Item category (Laptop Automation Cat)", { tags: ["@regression"] }, () => {
        // Disable Allow Items for Laptop (product-item → product-only)
        categoryPage.clickEditButton(td.laptopCatName);
        categoryPage.toggleAllowItems(false);
        categoryPage.clickUpdateCat();
        categoryPage.assertToast("Category updated.");

        // Verify toggle was actually disabled
        categoryPage.clickEditButton(td.laptopCatName);
        categoryPage.assertAllowItemsToggle("unchecked");
        categoryPage.clickCancel();
    });

    it("SW_CAT_RESTORE - Restore both category names to original values after edit tests", { tags: ["@regression"] }, () => {

                categoryPage.clickEditButton(td.ramCatEdited);
                categoryPage.updatedCatName(td.ramCatEdited, td.ramCatName);
                categoryPage.clickUpdateCat();
                cy.contains("Category updated.", { timeout: 10000 }).should("be.visible");
                categoryPage.assertCatEdit(td.ramCatName);

                categoryPage.clickEditButton(td.laptopCatEdited);
                categoryPage.updatedCatName(td.laptopCatEdited, td.laptopCatName);
                categoryPage.clickUpdateCat();
                cy.contains("Category updated.", { timeout: 10000 }).should("be.visible");
                categoryPage.assertCatEdit(td.laptopCatName);


});
});


// // ─────────────────────────────────────────────────────────────────────────────
// // SETUP – Import Prerequisite Inventory Data
// (Required for SW_CAT_18, SW_CAT_26, SW_CAT_27, SW_CAT_30, SW_CAT_31, SW_CAT_38)
// ─────────────────────────────────────────────────────────────────────────────

describe("SETUP - Import Prerequisite Inventory Data", () => {
    let td;
    let attribPage;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Step 1: Create required attributes before importing ──

    it("SW_CAT_SETUP_ATTR_01 - Add 'Model Number' (Text) Product Attribute for Laptop Automation Cat", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(td.laptopCatName);
        attribPage.clickProductAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName("Model Number");
        attribPage.selectType("Text");
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList("Model Number");
    });

    it("SW_CAT_SETUP_ATTR_02 - Add 'Brand' (Text) Product Attribute for RAM Automation Cat", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(td.ramCatName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName("Brand");
        attribPage.selectType("Text");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList("Brand");
    });

    it("SW_CAT_SETUP_ATTR_03 - Add 'Memory Generation' (Text) Product Attribute for RAM Automation Cat", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(td.ramCatName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName("Memory Generation");
        attribPage.selectType("Text");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList("Memory Generation");
    });

    it("SW_CAT_SETUP_RESTORE - Re-enable Allow Items toggle for Laptop Automation Cat before importing data", { tags: ["@regression"] }, () => {
        const categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
        categoryPage.clickEditButton(td.laptopCatName);
        categoryPage.toggleAllowItems(true);
        categoryPage.clickUpdateCat();
        categoryPage.assertToast("Category updated.");
    });

    // ── Step 2: Import inventory data ──

    it("SW_CAT_SETUP_01 - Import Laptop Automation Cat inventory data (serialized item)", { tags: ["@regression"] }, () => {
        const timestamp = Date.now();
        const fileName = `LaptopCatTestFile-${timestamp}.xlsx`;
        const filePath = `cypress/fixtures/${fileName}`;

        const excelData = [
            {
                Category: "Laptop Automation Cat",
                "Model Number": "CatTest-Model",
                "Serial Number": `CATTEST-LAP-${timestamp}`,
                Cost: "500",
                Price: "800"
            }
        ];

        createExcelFile(filePath, excelData);
        importExcelFile(td.laptopCatPO, fileName);
    });

    it("SW_CAT_SETUP_02 - Import RAM Automation Cat inventory data (product-only with quantity)", { tags: ["@regression"] }, () => {
        const timestamp = Date.now();
        const fileName = `RamCatTestFile-${timestamp}.xlsx`;
        const filePath = `cypress/fixtures/${fileName}`;

        const excelData = [
            {
                Category: "RAM Automation Cat",
              "Brand": "GSkill",
              "Memory Generation": "DDR4",
                Cost: "30",
                Price: "60",
                Quantity: "5"
            }
        ];

        createExcelFile(filePath, excelData);
        importExcelFile(td.ramCatPO, fileName);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE – Allow Items Toggle Restriction with Data
// ─────────────────────────────────────────────────────────────────────────────

describe("UPDATE - Allow Items Toggle Restriction with Data (SW_CAT_18, SW_CAT_26, SW_CAT_27)", () => {
    let categoryPage;
    let td;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_18 - Verify Allow Items toggle CANNOT be turned OFF when items exist for Laptop Automation Cat", { tags: ["@regression"] }, () => {
        categoryPage.clickEditButton(td.laptopCatName);
        // Allow Items toggle should be disabled (cannot be turned off) when items exist
        categoryPage.assertAllowItemsToggle("checked");
        categoryPage.assertAllowItemsToggle("disabled");
        categoryPage.clickCancel();
    });

    it("SW_CAT_26 - Verify Allow Items toggle is disabled for RAM Automation Cat (has associated products)", { tags: ["@regression"] }, () => {
        categoryPage.clickEditButton(td.ramCatName);
        // Toggle should be disabled / unclickable when data exists
        categoryPage.assertAllowItemsToggle("disabled");
        categoryPage.clickCancel();
    });

    it("SW_CAT_27 - Verify Allow Items toggle is disabled for Laptop Automation Cat (has associated products/items)", { tags: ["@regression"] }, () => {
        categoryPage.clickEditButton(td.laptopCatName);
        categoryPage.assertAllowItemsToggle("disabled");
        categoryPage.clickCancel();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE – Cancel Category Deletion
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE - Cancel Category Deletion (SW_CAT_11, SW_CAT_28, SW_CAT_29)", () => {
    let categoryPage;
    let td;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_11 - Verify 'No' Button on Category Deletion Pop Up – Laptop Automation Cat remains in list", { tags: ["@regression"] }, () => {
        categoryPage.cancelDeletion(td.laptopCatName);
        categoryPage.assertCatEdit(td.laptopCatName);
    });

    it("SW_CAT_28 - Verify cancellation of product-only category deletion (RAM Automation Cat)", { tags: ["@smoke"] }, () => {
        categoryPage.cancelDeletion(td.ramCatName);
        categoryPage.assertCatEdit(td.ramCatName);
    });

    it("SW_CAT_29 - Verify cancellation of product-item category deletion (Laptop Automation Cat)", { tags: ["@regression"] }, () => {
        categoryPage.cancelDeletion(td.laptopCatName);
        categoryPage.assertCatEdit(td.laptopCatName);
    });
});

// // ─────────────────────────────────────────────────────────────────────────────
// // DELETE – Delete Confirmation UI
// // ─────────────────────────────────────────────────────────────────────────────

describe("DELETE - Delete Confirmation UI (SW_CAT_15, SW_CAT_16)", () => {
    let categoryPage;
    let td;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_15 - Verify Delete confirmation dialog appears when clicking Delete on a category", { tags: ["@regression"] }, () => {
        cy.contains("tr", td.ramCatName)
            .within(() => cy.contains(/Delete/i).click());
        categoryPage.assertDeleteConfirmationDialog();
        // Close dialog – click No to avoid actual deletion
        cy.get(categoryLocators.dialogActions)
            .contains("button", /^No$/i).click();
        categoryPage.assertModalNotVisible();
    });

    it("SW_CAT_16 - Verify Attributes Management button navigates to attributes page", { tags: ["@regression"] }, () => {
        categoryPage.clickManageAttributes(td.laptopCatName);
        categoryPage.assertUrlContains("attributes");
        categoryPage.assertTextVisible("Laptop Automation Cat");
        categoryPage.assertButtonVisible("Product Attributes");
    });
});

// // ─────────────────────────────────────────────────────────────────────────────
// // DELETE – Cannot Delete Category with Associated Data
// // ─────────────────────────────────────────────────────────────────────────────

describe("DELETE - Cannot Delete Category with Associated Data (SW_CAT_30, SW_CAT_31)", () => {
    let categoryPage;
    let td;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_30 - Verify product-only category (RAM Automation Cat) cannot be deleted when associated data exists", { tags: ["@smoke"] }, () => {
        categoryPage.tryDeleteAndExpectError(td.ramCatName);
        // Category should still be in the list
        categoryPage.assertCatEdit(td.ramCatName);
    });

    it("SW_CAT_31 - Verify product-item category (Laptop Automation Cat) cannot be deleted when associated data exists", { tags: ["@smoke"] }, () => {
        categoryPage.tryDeleteAndExpectError(td.laptopCatName);
        // Category should still be in the list
        categoryPage.assertCatEdit(td.laptopCatName);
    });
});



// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP – Delete Import POs
// ─────────────────────────────────────────────────────────────────────────────

describe("CLEANUP - Delete Import POs (SW_CAT_CLEANUP_01, SW_CAT_CLEANUP_02)", () => {
    let td;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
    });

    it("SW_CAT_CLEANUP_01 - Delete Laptop Automation Cat Import PO", { tags: ["@regression"] }, () => {
        const invPage = new IncomingInvPage();
        const purchaseOrderPage = new PurchaseOrderPage();
        invPage.navigateToPOTab();
        purchaseOrderPage.deletePurchaseOrder(td.laptopCatPO);
    });

    it("SW_CAT_CLEANUP_02 - Delete RAM Automation Cat Import PO", { tags: ["@regression"] }, () => {
        const invPage = new IncomingInvPage();
        const purchaseOrderPage = new PurchaseOrderPage();
        invPage.navigateToPOTab();
        purchaseOrderPage.deletePurchaseOrder(td.ramCatPO);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP/DELETE – Delete Test Categories
// ─────────────────────────────────────────────────────────────────────────────

describe("CLEANUP/DELETE - Delete Test Categories (SW_CAT_32, SW_CAT_33)", () => {
    let categoryPage;
    let td;

    before(() => {
        cy.fixture("Configuration/categoryTestData").then((data) => {
            td = data;
        });
    });

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
        categoryPage.navigateToCategories();
    });

    it("SW_CAT_32 - Verify product-only category (RAM Automation Cat) deletion succeeds when no associated data", { tags: ["@smoke"] }, () => {
        categoryPage.clickDelCat(td.ramCatName);
        cy.contains(/deleted|Category deleted/i, { timeout: 10000 }).should("be.visible");
        categoryPage.assertCatDelete(td.ramCatName);
    });

    it("SW_CAT_33 - Verify product-item category (Laptop Automation Cat) deletion succeeds when no associated data", { tags: ["@regression"] }, () => {
        categoryPage.clickDelCat(td.laptopCatName);
        cy.contains(/deleted|Category deleted/i, { timeout: 10000 }).should("be.visible");
        categoryPage.assertCatDelete(td.laptopCatName);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT NAME tests have been moved to:
// cypress/e2e/Configuration/productNameTests.cy.js
// ─────────────────────────────────────────────────────────────────────────────
