import "cypress-file-upload";
import AttribPage from "../../pageObjects/AttribPage";
import {
  extractAttrNames,
  createExcelFile,
  importExcelFile,
  importAttributesAndCategories,
  deleteAllCommonAttributes,
  deleteCategory,
  deleteCategories,
} from "../../support/locators/attributeHelpers";

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};
// ─── Before All Tests: Import Attributes ───────────────────────────────────────

before(() => {
  loginSession();
  importAttributesAndCategories();
});

// // // // ─── SETUP: Import Data ────────────────────────────────────────────────────────

describe("SETUP - Import Prerequisite Inventory Data", () => {
  let td;

  before(() => {
    cy.fixture("Configuration/attributeDeletionTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
  });

  it("SW_ATR_SETUP_01 - Import Laptop Automation Cat data (common product + item + category product + item attributes)", () => {
    const timestamp = Date.now();
    const fileName = `LaptopCatAttribDelTestFile-${timestamp}.xlsx`;
    const filePath = `cypress/fixtures/${fileName}`;

    const excelData = [
      {
        Category: "Laptop Automation Cat",
        Brand: "Laptop-Restriction-Brand",
        Model: "Laptop-Restriction-Model",
        "Serial Number": "LAP-AUTO-101",
        Cost: "800",
        Price: "1200",
        // Common product attributes
        "Display Technology": "OLED",
        "Included Accessories": "Charger, Mouse",
        "Processing Cores": "8",
        "Support Contact": "support@test.com",
        "Product Page": "https://www.example.com",
        "Diagonal Size": "15.6",
        "Market Price": "1200.00",
        "Efficiency Rating": "85",
        "Storage Solution": "SSD",
        "Eco Friendly Certified": "true",
        // Common item attributes
        "Asset Security Code": "SEC-8899",
        "Maintenance Log Summary": "Screen replaced",
        "Previous Repair Count": "1",
        "Custodian Email": "admin@test.com",
        "Asset Management Link": "https://assets.example.com",
        "Battery Wear Level": "0.85",
        "Scrap Value": "50.00",
        "Utilization Rate": "75",
        "Department Allocation": "IT",
        "Active Status": "true",
        // Laptop category product attributes
        "Model Number": "Premium-Laptop-001",
        "Technical Specifications": "Intel Core i7, 16GB RAM",
        "Battery Cell Count": "6",
        "Technical Support Email": "support@laptop.com",
        "Driver Download Page": "https://drivers.example.com",
        Weight: "1.8",
        MSRP: "1500.00",
        "Battery Percentage": "80",
        Brand: "Dell",
        "Has Touchscreen": "true",
        // Laptop category item attributes
        "Asset Tag ID": "LAP-AUTO-101",
        "Service History": "No service required",
        "Total Service Count": "0",
        "Assigned User Email": "user@laptop.com",
        "Warranty Registration Link": "https://warranty.example.com",
        "Current Battery Health": "95.5",
        "Actual Purchase Price": "850.00",
        "Annual Depreciation Rate": "20",
        "Item Storage Capacity": "256GB",
        "Item Warranty Status": "true",
      },
    ];

    createExcelFile(filePath, excelData);
    importExcelFile(td.commonAttribDeleteTestsPO, fileName);
  });

  it("SW_ATR_SETUP_02 - Import RAM Automation Cat data (category-specific attributes)", () => {
    const timestamp = Date.now();
    const fileName = `RamCatAttribDelTestFile-${timestamp}.xlsx`;
    const filePath = `cypress/fixtures/${fileName}`;

    const excelData = [
      {
        Category: "RAM Automation Cat",
        Brand: "RAM-Restriction-Brand",
        Model: "RAM-Restriction-Model",
        Cost: "50",
        Price: "100",
        Quantity: "10",
        // RAM category product attributes
        "Memory Generation": "DDR5",
        "Compatibility Notes": "Supports XMP 3.0",
        "Memory Capacity": "32",
        "Vendor Contact": "vendor@ram.com",
        "Datasheet Link": "https://datasheet.example.com",
        "Operating Voltage": "1.1",
        MSRP: "450.00",
        "Performance Boost": "15",
        RAMbrand: "Corsair",
        "ECC Supported": "true",
      },
    ];

    createExcelFile(filePath, excelData);
    importExcelFile(td.categoryAttribDeleteTestsPO, fileName);
  });
});

// ─── Block 1: Common Product Attributes – Cannot Delete When Data Exists ───────

describe("Common Product Attributes - Cannot Delete When Data Exists (SW_ATR_298 – SW_ATR_307)", () => {
  let attribPage;
  let td;

  before(() => {
    cy.fixture("Configuration/commonAttributeTestData").then((data) => {
      td = extractAttrNames(data, "common ");
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.clickAttribOption();
    attribPage.clickProductAttributes();
  });

  it(
    "SW_ATR_298 - Common Product Text Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@smoke"] },
    () => {
      attribPage.deleteAttribute(td.text);
      attribPage.assertCannotDeleteToast(td.text);
      attribPage.assertAttributeInList(td.text);
    },
  );

  it(
    "SW_ATR_299 - Common Product MultiLineText Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.multiLineText);
      attribPage.assertCannotDeleteToast(td.multiLineText);
      attribPage.assertAttributeInList(td.multiLineText);
    },
  );

  it(
    "SW_ATR_300 - Common Product Number Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.number);
      attribPage.assertCannotDeleteToast(td.number);
      attribPage.assertAttributeInList(td.number);
    },
  );

  it(
    "SW_ATR_301 - Common Product Email Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.email);
      attribPage.assertCannotDeleteToast(td.email);
      attribPage.assertAttributeInList(td.email);
    },
  );

  it(
    "SW_ATR_302 - Common Product URL Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.url);
      attribPage.assertCannotDeleteToast(td.url);
      attribPage.assertAttributeInList(td.url);
    },
  );

  it(
    "SW_ATR_303 - Common Product Decimal Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.decimal);
      attribPage.assertCannotDeleteToast(td.decimal);
      attribPage.assertAttributeInList(td.decimal);
    },
  );

  it(
    "SW_ATR_304 - Common Product Amount Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.amount);
      attribPage.assertCannotDeleteToast(td.amount);
      attribPage.assertAttributeInList(td.amount);
    },
  );

  it(
    "SW_ATR_305 - Common Product Percent Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.percent);
      attribPage.assertCannotDeleteToast(td.percent);
      attribPage.assertAttributeInList(td.percent);
    },
  );

  it(
    "SW_ATR_306 - Common Product List Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.list);
      attribPage.assertCannotDeleteToast(td.list);
      attribPage.assertAttributeInList(td.list);
    },
  );

  it(
    "SW_ATR_307 - Common Product Boolean Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.boolean);
      attribPage.assertCannotDeleteToast(td.boolean);
      attribPage.assertAttributeInList(td.boolean);
    },
  );
});

// ─── Block 2: Common Item Attributes – Cannot Delete When Data Exists ──────────

describe("Common Item Attributes - Cannot Delete When Data Exists (SW_ATR_308 – SW_ATR_317)", () => {
  let attribPage;
  let td;

  before(() => {
    cy.fixture("Configuration/commonAttributeTestData").then((data) => {
      td = extractAttrNames(data, "item ");
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.clickAttribOption();
    attribPage.clickItemAttributes();
  });

  it(
    "SW_ATR_308 - Common Item Text Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@smoke"] },
    () => {
      attribPage.deleteAttribute(td.text);
      attribPage.assertCannotDeleteToast(td.text);
      attribPage.assertAttributeInList(td.text);
    },
  );

  it(
    "SW_ATR_309 - Common Item MultiLineText Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.multiLineText);
      attribPage.assertCannotDeleteToast(td.multiLineText);
      attribPage.assertAttributeInList(td.multiLineText);
    },
  );

  it(
    "SW_ATR_310 - Common Item Number Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.number);
      attribPage.assertCannotDeleteToast(td.number);
      attribPage.assertAttributeInList(td.number);
    },
  );

  it(
    "SW_ATR_311 - Common Item Email Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.email);
      attribPage.assertCannotDeleteToast(td.email);
      attribPage.assertAttributeInList(td.email);
    },
  );

  it(
    "SW_ATR_312 - Common Item URL Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.url);
      attribPage.assertCannotDeleteToast(td.url);
      attribPage.assertAttributeInList(td.url);
    },
  );

  it(
    "SW_ATR_313 - Common Item Decimal Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.decimal);
      attribPage.assertCannotDeleteToast(td.decimal);
      attribPage.assertAttributeInList(td.decimal);
    },
  );

  it(
    "SW_ATR_314 - Common Item Amount Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.amount);
      attribPage.assertCannotDeleteToast(td.amount);
      attribPage.assertAttributeInList(td.amount);
    },
  );

  it(
    "SW_ATR_315 - Common Item Percent Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.percent);
      attribPage.assertCannotDeleteToast(td.percent);
      attribPage.assertAttributeInList(td.percent);
    },
  );

  it(
    "SW_ATR_316 - Common Item List Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.list);
      attribPage.assertCannotDeleteToast(td.list);
      attribPage.assertAttributeInList(td.list);
    },
  );

  it(
    "SW_ATR_317 - Common Item Boolean Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.boolean);
      attribPage.assertCannotDeleteToast(td.boolean);
      attribPage.assertAttributeInList(td.boolean);
    },
  );
});

// ─── Block 3: Laptop Cat – Product Attributes Cannot Delete When Data Exists ───

describe("Laptop Cat - Product Attributes Cannot Delete When Data Exists (SW_ATR_318 – SW_ATR_327)", () => {
  let attribPage;
  let catName;
  let td;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      catName = data.categoryName;
      td = extractAttrNames(data, "cat product ");
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.navigateToCategoryAttributes(catName);
    attribPage.clickProductAttributes();
  });

  it(
    "SW_ATR_318 - Laptop Cat Product Text Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@smoke"] },
    () => {
      attribPage.deleteAttribute(td.text);
      attribPage.assertCannotDeleteToast(td.text);
      attribPage.assertAttributeInList(td.text);
    },
  );

  it(
    "SW_ATR_319 - Laptop Cat Product MultiLineText Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.multiLineText);
      attribPage.assertCannotDeleteToast(td.multiLineText);
      attribPage.assertAttributeInList(td.multiLineText);
    },
  );

  it(
    "SW_ATR_320 - Laptop Cat Product Number Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.number);
      attribPage.assertCannotDeleteToast(td.number);
      attribPage.assertAttributeInList(td.number);
    },
  );

  it(
    "SW_ATR_321 - Laptop Cat Product Email Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.email);
      attribPage.assertCannotDeleteToast(td.email);
      attribPage.assertAttributeInList(td.email);
    },
  );

  it(
    "SW_ATR_322 - Laptop Cat Product URL Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.url);
      attribPage.assertCannotDeleteToast(td.url);
      attribPage.assertAttributeInList(td.url);
    },
  );

  it(
    "SW_ATR_323 - Laptop Cat Product Decimal Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.decimal);
      attribPage.assertCannotDeleteToast(td.decimal);
      attribPage.assertAttributeInList(td.decimal);
    },
  );

  it(
    "SW_ATR_324 - Laptop Cat Product Amount Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.amount);
      attribPage.assertCannotDeleteToast(td.amount);
      attribPage.assertAttributeInList(td.amount);
    },
  );

  it(
    "SW_ATR_325 - Laptop Cat Product Percent Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.percent);
      attribPage.assertCannotDeleteToast(td.percent);
      attribPage.assertAttributeInList(td.percent);
    },
  );

  it(
    "SW_ATR_326 - Laptop Cat Product List Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.list);
      attribPage.assertCannotDeleteToast(td.list);
      attribPage.assertAttributeInList(td.list);
    },
  );

  it(
    "SW_ATR_327 - Laptop Cat Product Boolean Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.boolean);
      attribPage.assertCannotDeleteToast(td.boolean);
      attribPage.assertAttributeInList(td.boolean);
    },
  );
});

// ─── Block 4: Laptop Cat – Item Attributes Cannot Delete When Data Exists ──────

describe("Laptop Cat - Item Attributes Cannot Delete When Data Exists (SW_ATR_328 – SW_ATR_337)", () => {
  let attribPage;
  let catName;
  let td;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      catName = data.categoryName;
      td = extractAttrNames(data, "cat item ");
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.navigateToCategoryAttributes(catName);
    attribPage.clickItemAttributes();
  });

  it(
    "SW_ATR_328 - Laptop Cat Item Text Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@smoke"] },
    () => {
      attribPage.deleteAttribute(td.text);
      attribPage.assertCannotDeleteToast(td.text);
      attribPage.assertAttributeInList(td.text);
    },
  );

  it(
    "SW_ATR_329 - Laptop Cat Item MultiLineText Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.multiLineText);
      attribPage.assertCannotDeleteToast(td.multiLineText);
      attribPage.assertAttributeInList(td.multiLineText);
    },
  );

  it(
    "SW_ATR_330 - Laptop Cat Item Number Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.number);
      attribPage.assertCannotDeleteToast(td.number);
      attribPage.assertAttributeInList(td.number);
    },
  );

  it(
    "SW_ATR_331 - Laptop Cat Item Email Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.email);
      attribPage.assertCannotDeleteToast(td.email);
      attribPage.assertAttributeInList(td.email);
    },
  );

  it(
    "SW_ATR_332 - Laptop Cat Item URL Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.url);
      attribPage.assertCannotDeleteToast(td.url);
      attribPage.assertAttributeInList(td.url);
    },
  );

  it(
    "SW_ATR_333 - Laptop Cat Item Decimal Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.decimal);
      attribPage.assertCannotDeleteToast(td.decimal);
      attribPage.assertAttributeInList(td.decimal);
    },
  );

  it(
    "SW_ATR_334 - Laptop Cat Item Amount Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.amount);
      attribPage.assertCannotDeleteToast(td.amount);
      attribPage.assertAttributeInList(td.amount);
    },
  );

  it(
    "SW_ATR_335 - Laptop Cat Item Percent Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.percent);
      attribPage.assertCannotDeleteToast(td.percent);
      attribPage.assertAttributeInList(td.percent);
    },
  );

  it(
    "SW_ATR_336 - Laptop Cat Item List Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.list);
      attribPage.assertCannotDeleteToast(td.list);
      attribPage.assertAttributeInList(td.list);
    },
  );

  it(
    "SW_ATR_337 - Laptop Cat Item Boolean Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.boolean);
      attribPage.assertCannotDeleteToast(td.boolean);
      attribPage.assertAttributeInList(td.boolean);
    },
  );
});

// ─── Block 5: RAM Cat – Product Attributes Cannot Delete When Data Exists ──────

describe("RAM Cat (Product-Only) - Product Attributes Cannot Delete When Data Exists (SW_ATR_338 – SW_ATR_347)", () => {
  let attribPage;
  let catName;
  let td;

  before(() => {
    cy.fixture("Configuration/productCatAttributeTestData").then((data) => {
      catName = data.categoryName;
      td = extractAttrNames(data, "");
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.navigateToCategoryAttributes(catName);
  });

  it(
    "SW_ATR_338 - RAM Cat Product Text Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@smoke"] },
    () => {
      attribPage.deleteAttribute(td.text);
      attribPage.assertCannotDeleteToast(td.text);
      attribPage.assertAttributeInList(td.text);
    },
  );

  it(
    "SW_ATR_339 - RAM Cat Product MultiLineText Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.multiLineText);
      attribPage.assertCannotDeleteToast(td.multiLineText);
      attribPage.assertAttributeInList(td.multiLineText);
    },
  );

  it(
    "SW_ATR_340 - RAM Cat Product Number Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.number);
      attribPage.assertCannotDeleteToast(td.number);
      attribPage.assertAttributeInList(td.number);
    },
  );

  it(
    "SW_ATR_341 - RAM Cat Product Email Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.email);
      attribPage.assertCannotDeleteToast(td.email);
      attribPage.assertAttributeInList(td.email);
    },
  );

  it(
    "SW_ATR_342 - RAM Cat Product URL Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.url);
      attribPage.assertCannotDeleteToast(td.url);
      attribPage.assertAttributeInList(td.url);
    },
  );

  it(
    "SW_ATR_343 - RAM Cat Product Decimal Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.decimal);
      attribPage.assertCannotDeleteToast(td.decimal);
      attribPage.assertAttributeInList(td.decimal);
    },
  );

  it(
    "SW_ATR_344 - RAM Cat Product Amount Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.amount);
      attribPage.assertCannotDeleteToast(td.amount);
      attribPage.assertAttributeInList(td.amount);
    },
  );

  it(
    "SW_ATR_345 - RAM Cat Product Percent Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.percent);
      attribPage.assertCannotDeleteToast(td.percent);
      attribPage.assertAttributeInList(td.percent);
    },
  );

  it(
    "SW_ATR_346 - RAM Cat Product List Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.list);
      attribPage.assertCannotDeleteToast(td.list);
      attribPage.assertAttributeInList(td.list);
    },
  );

  it(
    "SW_ATR_347 - RAM Cat Product Boolean Attribute Cannot Be Deleted When Data Exists",
    { tags: ["@regression"] },
    () => {
      attribPage.deleteAttribute(td.boolean);
      attribPage.assertCannotDeleteToast(td.boolean);
      attribPage.assertAttributeInList(td.boolean);
    },
  );
});

//─── Cleanup: Delete POs and Categories ───────────────────────────────────────

describe("SW_ATR Restriction Tests - Cleanup: Delete POs and Categories", () => {
  let td;

  before(() => {
    cy.fixture("Configuration/attributeDeletionTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
  });

  
  after(() => {
    // Step 1: Delete Import POs before categories (dependency order)
    const invPage = new IncomingInvPage();
    const purchaseOrderPage = new PurchaseOrderPage();

    invPage.navigateToPOTab();
    purchaseOrderPage.deletePurchaseOrder(td.commonAttribDeleteTestsPO);

    invPage.navigateToPOTab();
    purchaseOrderPage.deletePurchaseOrder(td.categoryAttribDeleteTestsPO);

    // Step 2: Delete both categories
    deleteCategories([td.laptopCatName, td.ramCatName]);

    // Step 3: Delete all common attributes (Product and Item)
    cy.fixture("Configuration/commonAttributeTestData").then((data) => {
      const commonProductAttrs = extractAttrNames(data, "common ");
      const commonItemAttrs = extractAttrNames(data, "item ");
      deleteAllCommonAttributes(commonProductAttrs, commonItemAttrs);
    });
  });
});
