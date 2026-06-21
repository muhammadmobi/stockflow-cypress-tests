import AttribPage from "../../pageObjects/AttribPage";
import CategoryPage from "../../pageObjects/CategoryPage";


const loginSession = () => {
    cy.session("user-session", () => {
        cy.visit("/");
        cy.login();
    });
    cy.visit("/");
};

// ======================================================================
// Product-Only Category Tests - RAM Automation Cat (SW_ATR_241 – SW_ATR_315)
// ======================================================================

describe("Create Product-Only Category Setup - RAM Automation Cat SW_CAT_03 - SW_CAT_04", () => {
    let categoryPage;
    let catName;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
        });
    });

    beforeEach(() => {
        loginSession();
        categoryPage = new CategoryPage();
    });


    it("SW_CAT_03 - Create Product-Only Category 'RAM Automation Cat'", { tags: ["@smoke", "@regression"] }, () => {
        categoryPage.navigateToCategories();
        categoryPage.clickAddnewCat();
        categoryPage.typeCatName(catName);
        categoryPage.clickSaveBt();
        categoryPage.assertCategoryCreatedToast();
        categoryPage.assertCreatedCatagory(catName);

    });

});

// // ─── Block 1: Text Attribute (SW_ATR_241 – SW_ATR_245) ───────

describe("Product-Only Category - Text Attribute (SW_ATR_241 – SW_ATR_245)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.textAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_241 - Add Text Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("Text");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_242 - Update Text Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_243 - Update Text Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_244 - Update Text Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_245 - Delete Text Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 2: Multi Line Text Attribute (SW_ATR_246 – SW_ATR_250) ───────

describe("Product-Only Category - Multi Line Text Attribute (SW_ATR_246 – SW_ATR_250)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.multiLineTextAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_246 - Add Multi Line Text Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("MultiLineText");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_247 - Update Multi Line Text Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_248 - Update Multi Line Text Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_249 - Update Multi Line Text Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_250 - Delete Multi Line Text Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 3: Number Attribute (SW_ATR_251 – SW_ATR_255) ───────

describe("Product-Only Category - Number Attribute (SW_ATR_251 – SW_ATR_255)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.numberAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_251 - Add Number Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("Number");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_252 - Update Number Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_253 - Update Number Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_254 - Update Number Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_255 - Delete Number Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 4: Email Attribute (SW_ATR_256 – SW_ATR_260) ───────

describe("Product-Only Category - Email Attribute (SW_ATR_256 – SW_ATR_260)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.emailAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_256 - Add Email Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("Email");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_257 - Update Email Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_258 - Update Email Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_259 - Update Email Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_260 - Delete Email Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 5: URL Attribute (SW_ATR_261 – SW_ATR_265) ───────

describe("Product-Only Category - URL Attribute (SW_ATR_261 – SW_ATR_265)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.urlAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_261 - Add URL Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("URL");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_262 - Update URL Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_263 - Update URL Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_264 - Update URL Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_265 - Delete URL Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 6: Decimal Attribute (SW_ATR_266 – SW_ATR_270) ───────

describe("Product-Only Category - Decimal Attribute (SW_ATR_266 – SW_ATR_270)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.decimalAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_266 - Add Decimal Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("Decimal");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_267 - Update Decimal Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_268 - Update Decimal Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_269 - Update Decimal Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_270 - Delete Decimal Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 7: Amount Attribute (SW_ATR_271 – SW_ATR_275) ───────

describe("Product-Only Category - Amount Attribute (SW_ATR_271 – SW_ATR_275)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.amountAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_271 - Add Amount Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("Amount");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_272 - Update Amount Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_273 - Update Amount Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_274 - Update Amount Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_275 - Delete Amount Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 8: Percent Attribute (SW_ATR_276 – SW_ATR_280) ───────

describe("Product-Only Category - Percent Attribute (SW_ATR_276 – SW_ATR_280)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.percentAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_276 - Add Percent Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("Percent");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_277 - Update Percent Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_278 - Update Percent Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_279 - Update Percent Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_280 - Delete Percent Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 9: List Attribute (SW_ATR_281 – SW_ATR_288) ───────

describe("Product-Only Category - List Attribute (SW_ATR_281 – SW_ATR_288)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.listAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_281 - Add List Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("List");
        attribPage.waitForListRowsToRender();
        attribPage.typeInListRows(td.options);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_282 - Update List Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_283 - Update List Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_284 - Update List Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_286 - Verify Bulk Add for List Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.clickAddBulkList();
        attribPage.typeBulkAddition(td.bulkOptions);
        attribPage.confirmBulkAddition();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
    });

    it("SW_ATR_287 - Verify Add Row for List Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.clickAddRow();
        attribPage.typeFirstEmptyListOption(td.newOption);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
    });

    it("SW_ATR_288 - Verify Remove Option for List Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.deleteListOption(0);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
    });

    it("SW_ATR_285 - Delete List Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});

// // ─── Block 10: Boolean Attribute (SW_ATR_289 – SW_ATR_293) ───────

describe("Product-Only Category - Boolean Attribute (SW_ATR_289 – SW_ATR_293)", () => {
    let attribPage;
    let catName;
    let td;

    before(() => {
        cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
            catName = data.categoryName;
            td = data.booleanAttribute;
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_289 - Add Boolean Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.selectType("Boolean");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute created.");
        attribPage.assertAttributeInList(td.name);
    });

    it("SW_ATR_290 - Update Boolean Attribute Name for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertAttributeInList(td.updatedName);
    });

    it("SW_ATR_291 - Update Boolean Attribute (Enable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "Yes");
    });

    it("SW_ATR_292 - Update Boolean Attribute (Disable Required) for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated.");
        attribPage.assertRequiredInList(td.updatedName, "No");
    });

    it("SW_ATR_293 - Delete Boolean Attribute for Product-Only Category", { tags: ["@regression"] }, () => {
        attribPage.navigateToCategoryAttributes(catName);
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(td.updatedName);
    });
});



// SW_ATR_294-SW_ATR_297