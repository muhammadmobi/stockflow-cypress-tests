import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import ImportPage from "../../pageObjects/ImportPage";
import GeneralConfigPage from "../../pageObjects/GeneralConfigPage";
import CategoryPage from "../../pageObjects/CategoryPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import { deletePO } from "../../support/helpers/exportSeedingHelpers";
import "cypress-file-upload";


describe("Import Tests (SW_IMP_001 – SW_IMP_070)", () => {
  let incomingInvPage,
    invViewPage,
    importPage,
    generalConfigPage,
    purchaseOrderPage;
  let testData;
  let sw003PO;
  let sw067BulkPO;
  let sw068BulkPO;
  let sw069RamPO;
  let sw070LaptopPO;

  before(() => {
    cy.fixture("importTestData").then((data) => {
      testData = data;
    });
  });

  before(() => {
    cy.session("user-session", () => {
      cy.visit("/");
      cy.login();
    });
    cy.visit("/");

    // ── Ensure Product Name config exists for both categories ──
    const catPage = new CategoryPage();

    // RAM Automation Cat – needs "RAMbrand" + "Memory Generation"
    catPage.navigateToCategories();
    catPage.clickManageProductName("RAM Automation Cat");
    cy.get("#product-name-form").then(($form) => {
      const formText = $form.text();
      const hasRamBrand = formText.includes("RAMbrand");
      const hasMemGen = formText.includes("Memory Generation");
      if (hasRamBrand && hasMemGen) {
        catPage.clickCancel();
      } else {
        if (
          $form.find('div[role="button"][aria-label^="Remove "]').length > 0
        ) {
          catPage.clearAllProductNameTags();
        }
        catPage.selectProductNameAttribute("RAMbrand");
        catPage.selectProductNameAttribute("Memory Generation");
        catPage.saveProductNameConfig();
        cy.url({ timeout: 10000 }).should("include", "category");
      }
    });

    // Laptop Automation Cat – needs "Brand" + "Model Number"
    catPage.navigateToCategories();
    catPage.clickManageProductName("Laptop Automation Cat");
    cy.get("#product-name-form").then(($form) => {
      const formText = $form.text();
      const hasBrand = formText.includes("Brand");
      const hasModel = formText.includes("Model Number");
      if (hasBrand && hasModel) {
        catPage.clickCancel();
      } else {
        if (
          $form.find('div[role="button"][aria-label^="Remove "]').length > 0
        ) {
          catPage.clearAllProductNameTags();
        }
        catPage.selectProductNameAttribute("Brand");
        catPage.selectProductNameAttribute("Model Number");
        catPage.saveProductNameConfig();
        cy.url({ timeout: 10000 }).should("include", "category");
      }
    });
  });

  beforeEach(() => {
    cy.session("user-session", () => {
      cy.visit("/");
      cy.login();
    });
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    importPage = new ImportPage();
    generalConfigPage = new GeneralConfigPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // ────────────────────────────── helpers ──────────────────────────────

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  function createExcelFile(fileName, data) {
    const filePath = `cypress/fixtures/${fileName}`;
    cy.task("createExcelFile", { filePath, data }).then((msg) => cy.log(msg));
  }

  function importExcel(
    fileName,
    {
      isNegative = false,
      validateRedirect = true,
      poOverride = null,
      clickOKTimeout = 30000,
    } = {},
  ) {
    const po = poOverride || testData.poNumber;
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.clickImport();
    incomingInvPage.enterPONumber(po);
    incomingInvPage.uploadFile(fileName);
    incomingInvPage.clickUpload();
    if (!isNegative) {
      cy.contains("button", /^OK$/, { timeout: clickOKTimeout })
        .should("be.visible")
        .and("not.be.disabled")
        .click();
    }
    if (validateRedirect && !isNegative) {
      incomingInvPage.validateRedirectedURL();
      incomingInvPage.selectPoNumber(po);
    }
  }

  /** Navigate to import, enter PO, upload file, click Upload — expect error. */
  function importExcelNegative(fileName) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.clickImport();
    incomingInvPage.enterPONumber(testData.poNumber);
    incomingInvPage.uploadFile(fileName);
    incomingInvPage.clickUpload();
  }

  /** Import expecting summary popup (with mixed success/ignored) — do NOT auto-click OK. */
  function importExcelExpectSummary(fileName) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.clickImport();
    incomingInvPage.enterPONumber(testData.poNumber);
    incomingInvPage.uploadFile(fileName);
    incomingInvPage.clickUpload();
  }

  function searchAndClickProduct(searchTerm) {
    invViewPage.searchProduct(searchTerm);
    invViewPage.clickSubmitSearch();
    invViewPage.clickSearchResultRecord(searchTerm);
  }

  /** Minimal valid RAM Automation Cat row. */
  function minRamRow(overrides = {}) {
    return {
      Category: testData.categories.productOnly,
      RAMbrand: testData.minRowDefaults.ram.ramBrand,
      "Memory Generation": testData.minRowDefaults.ram.memoryGeneration,
      Cost: testData.minRowDefaults.ram.cost,
      Quantity: testData.minRowDefaults.ram.quantity,
      "Support Contact": testData.minRowDefaults.ram.supportContact,
      ...overrides,
    };
  }

  /** Minimal valid Laptop Automation Cat row. */
  function minLaptopRow(serialNumber, overrides = {}) {
    return {
      Category: testData.categories.productItem,
      "Model Number": testData.minRowDefaults.laptop.modelNumber,
      Brand: testData.minRowDefaults.laptop.brand,
      Cost: testData.minRowDefaults.laptop.cost,
      "Serial Number": serialNumber,
      "Asset Tag ID": testData.minRowDefaults.laptop.assetTagId,
      "Asset Security Code": testData.minRowDefaults.laptop.assetSecurityCode,
      "Support Contact": testData.minRowDefaults.laptop.supportContact,
      ...overrides,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 1 – SUCCESSFUL IMPORTS (SW_IMP_001 – SW_IMP_010)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_001 ──────────────────────────────
  it(
    "SW_IMP_001 – Import product-only category with all attributes",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.productOnly}-${stamp}.xlsx`;

      const row = {
        Category: testData.categories.productOnly,
        Cost: testData.productOnlyData.Cost,
        Price: testData.productOnlyData.Price,
        Quantity: testData.productOnlyData.Quantity,
        RAMbrand: testData.productOnlyData["RAM Brand"],
        "Memory Generation": testData.productOnlyData["Memory Generation"],
        "Memory Capacity": testData.productOnlyData["Memory Capacity"],
        "Operating Voltage": testData.productOnlyData["Operating Voltage"],
        MSRP: testData.productOnlyData.MSRP,
        "Performance Boost": testData.productOnlyData["Performance Boost"],
        "ECC Supported": testData.productOnlyData["ECC Supported"],
        "Vendor Contact": testData.productOnlyData["Vendor Contact"],
        "Datasheet Link": testData.productOnlyData["Datasheet Link"],
        "Compatibility Notes": testData.productOnlyData["Compatibility Notes"],
        "Display Technology": testData.productOnlyData["Display Technology"],
        "Processing Cores": testData.productOnlyData["Processing Cores"],
        "Support Contact": testData.productOnlyData["Support Contact"],
        "Product Page": testData.productOnlyData["Product Page"],
        "Diagonal Size": testData.productOnlyData["Diagonal Size"],
        "Market Price": testData.productOnlyData["Market Price"],
        "Efficiency Rating": testData.productOnlyData["Efficiency Rating"],
        "Storage Solution": testData.productOnlyData["Storage Solution"],
        "Eco Friendly Certified":
          testData.productOnlyData["Eco Friendly Certified"],
        "Included Accessories":
          testData.productOnlyData["Included Accessories"],
      };

      createExcelFile(fileName, [row]);
      importExcel(fileName);

      cy.intercept("GET", "**/incoming-items**").as("searchApi001");
      invViewPage.searchProduct(testData.productOnlyData["RAM Brand"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi001");
      cy.get("tbody tr").should("have.length.greaterThan", 0);
    },
  );

  // ────────────────────────────── SW_IMP_002 ──────────────────────────────
  it(
    "SW_IMP_002 – Verify product details attributes after product-only import",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.productOnly}-${stamp}.xlsx`;

      const row = {
        Category: testData.categories.productOnly,
        Cost: testData.productOnlyData.Cost,
        Price: testData.productOnlyData.Price,
        Quantity: testData.productOnlyData.Quantity,
        RAMbrand: testData.productOnlyData["RAM Brand"],
        "Memory Generation": testData.productOnlyData["Memory Generation"],
        "Memory Capacity": testData.productOnlyData["Memory Capacity"],
        "Operating Voltage": testData.productOnlyData["Operating Voltage"],
        MSRP: testData.productOnlyData.MSRP,
        "Performance Boost": testData.productOnlyData["Performance Boost"],
        "ECC Supported": testData.productOnlyData["ECC Supported"],
        "Vendor Contact": testData.productOnlyData["Vendor Contact"],
        "Datasheet Link": testData.productOnlyData["Datasheet Link"],
        "Compatibility Notes": testData.productOnlyData["Compatibility Notes"],
        "Display Technology": testData.productOnlyData["Display Technology"],
        "Processing Cores": testData.productOnlyData["Processing Cores"],
        "Support Contact": testData.productOnlyData["Support Contact"],
        "Product Page": testData.productOnlyData["Product Page"],
        "Diagonal Size": testData.productOnlyData["Diagonal Size"],
        "Market Price": testData.productOnlyData["Market Price"],
        "Efficiency Rating": testData.productOnlyData["Efficiency Rating"],
        "Storage Solution": testData.productOnlyData["Storage Solution"],
        "Eco Friendly Certified":
          testData.productOnlyData["Eco Friendly Certified"],
        "Included Accessories":
          testData.productOnlyData["Included Accessories"],
      };

      createExcelFile(fileName, [row]);
      importExcel(fileName);

      cy.intercept("GET", "**/incoming-items**").as("searchApi002");
      invViewPage.searchProduct(testData.productOnlyData["RAM Brand"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi002");
      cy.get("tbody").should("contain.text", testData.categories.productOnly);
      invViewPage.clickFirstSearchResult();
      importPage.clickProductDetailsHeader();

      // scrollIntoView() can trigger a simplebar re-render that detaches the
      // element — do NOT chain .should() on the same subject. Re-query after scroll.
      cy.contains(testData.productOnlyData["RAM Brand"]).scrollIntoView();
      cy.contains(testData.productOnlyData["RAM Brand"]).should("be.visible");
      cy.contains(testData.productOnlyData["Memory Generation"]).scrollIntoView();
      cy.contains(testData.productOnlyData["Memory Generation"]).should("be.visible");
      cy.contains(testData.productOnlyData["Display Technology"]).scrollIntoView();
      cy.contains(testData.productOnlyData["Display Technology"]).should("be.visible");
      cy.contains(testData.productOnlyData["Storage Solution"]).scrollIntoView();
      cy.contains(testData.productOnlyData["Storage Solution"]).should("be.visible");

      incomingInvPage.navigateToPOTab();
      
    },
  );

  // ────────────────────────────── SW_IMP_003 ──────────────────────────────
  it(
    "SW_IMP_003 – Verify quantity counters after product-only import",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.productOnly}-${stamp}.xlsx`;
      // Use a unique PO so Expected quantity is exactly Quantity (20) — unaffected
      // by IMP_001/IMP_002 imports on the shared PO-Automation-Tests PO.
      // RAMbrand is a List attribute; cannot be stamped — isolate via PO instead.
      sw003PO = `IMP003-${stamp}`;

      const row = {
        Category: testData.categories.productOnly,
        Cost: testData.productOnlyData.Cost,
        Price: testData.productOnlyData.Price,
        Quantity: testData.productOnlyData.Quantity,
        RAMbrand: testData.productOnlyData["RAM Brand"],
        "Memory Generation": testData.productOnlyData["Memory Generation"],
        "Support Contact": testData.productOnlyData["Support Contact"],
      };

      createExcelFile(fileName, [row]);
      importExcel(fileName, { poOverride: sw003PO });

      cy.intercept("GET", "**/incoming-items**").as("searchApi003");
      invViewPage.searchProduct(testData.productOnlyData["RAM Brand"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi003");
      invViewPage.clickFirstSearchResult();

      cy.contains("span.MuiTypography-caption", "Expected")
        .parent()
        .find("h6")
        .first()
        .invoke("text")
        .then((text) => {
          const expected = parseInt(text);
          expect(expected).to.equal(
            parseInt(testData.productOnlyData.Quantity),
          );
        });

      // validateReceivedQty/validateAvailableQty use .parents("button") which
      // targets the PO-list stat cards; in the product-detail view the counters
      // are plain divs — use the same caption→parent→h6 pattern as Expected above.
      cy.contains("span.MuiTypography-caption", "Received")
        .parent()
        .find("h6")
        .first()
        .should("have.text", "0");
      cy.contains("span.MuiTypography-caption", "Available")
        .parent()
        .find("h6")
        .first()
        .should("have.text", "0");
    },
  );

  // ────────────────────────────── SW_IMP_004 ──────────────────────────────
  it(
    "SW_IMP_004 – Import product-item category with serial numbers and all attributes",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.productItem}-${stamp}.xlsx`;

      const sn1 = `${testData.productItemSerials.sn1}-${stamp}`;
      const sn2 = `${testData.productItemSerials.sn2}-${stamp}`;

      const baseRow = {
        Category: testData.categories.productItem,
        Cost: testData.productItemData.Cost,
        Price: testData.productItemData.Price,
        "Model Number": testData.productItemData["Model Number"],
        Brand: testData.productItemData.Brand,
        "Battery Cell Count": testData.productItemData["Battery Cell Count"],
        Weight: testData.productItemData.Weight,
        MSRP: testData.productItemData.MSRP,
        "Battery Percentage": testData.productItemData["Battery Percentage"],
        "Has Touchscreen": testData.productItemData["Has Touchscreen"],
        "Technical Support Email":
          testData.productItemData["Technical Support Email"],
        "Driver Download Page":
          testData.productItemData["Driver Download Page"],
        "Technical Specifications":
          testData.productItemData["Technical Specifications"],
        "Display Technology": testData.productItemData["Display Technology"],
        "Processing Cores": testData.productItemData["Processing Cores"],
        "Support Contact": testData.productItemData["Support Contact"],
        "Product Page": testData.productItemData["Product Page"],
        "Diagonal Size": testData.productItemData["Diagonal Size"],
        "Market Price": testData.productItemData["Market Price"],
        "Efficiency Rating": testData.productItemData["Efficiency Rating"],
        "Storage Solution": testData.productItemData["Storage Solution"],
        "Eco Friendly Certified":
          testData.productItemData["Eco Friendly Certified"],
        "Included Accessories":
          testData.productItemData["Included Accessories"],
      };

      const rows = [
        {
          ...baseRow,
          "Serial Number": sn1,
          "Asset Tag ID": testData.productItemSerials.assetTag1,
          "Asset Security Code": testData.productItemSerials.assetSecurityCode1,
        },
        {
          ...baseRow,
          "Serial Number": sn2,
          "Asset Tag ID": testData.productItemSerials.assetTag2,
          "Asset Security Code": testData.productItemSerials.assetSecurityCode2,
        },
      ];

      createExcelFile(fileName, rows);
      importExcel(fileName);

      cy.intercept("GET", "**/incoming-items**").as("searchApi004");
      invViewPage.searchProduct(testData.productItemData["Model Number"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi004");
      invViewPage.clickFirstSearchResult();
      incomingInvPage.verifyserialNumberInItemsList([sn1, sn2]);
    },
  );

  // ────────────────────────────── SW_IMP_005 ──────────────────────────────
  it(
    "SW_IMP_005 – Verify items list and item attributes after product-item import",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.productItem}-${stamp}.xlsx`;

      const sn1 = `${testData.productItemSerials.sn1}-${stamp}`;
      const sn2 = `${testData.productItemSerials.sn2}-${stamp}`;
      const uniqueModel = `ThinkPad X1 Nano-${stamp}`;

      const baseRow = {
        Category: testData.categories.productItem,
        Cost: testData.productItemData.Cost,
        Price: testData.productItemData.Price,
        "Model Number": uniqueModel,
        Brand: testData.productItemData.Brand,
        "Support Contact": testData.productItemData["Support Contact"],
        "Display Technology": testData.productItemData["Display Technology"],
        "Storage Solution": testData.productItemData["Storage Solution"],
      };

      const rows = [
        {
          ...baseRow,
          "Serial Number": sn1,
          "Asset Tag ID": testData.productItemSerials.assetTag1,
          "Asset Security Code": testData.productItemSerials.assetSecurityCode1,
        },
        {
          ...baseRow,
          "Serial Number": sn2,
          "Asset Tag ID": testData.productItemSerials.assetTag2,
          "Asset Security Code": testData.productItemSerials.assetSecurityCode2,
        },
      ];

      createExcelFile(fileName, rows);
      importExcel(fileName);

      invViewPage.searchProduct(uniqueModel);
      invViewPage.clickSubmitSearch();
      invViewPage.clickFirstSearchResult();

      incomingInvPage.verifyserialNumberInItemsList([sn1, sn2]);
    },
  );

  // ────────────────────────────── SW_IMP_006 ──────────────────────────────
  it(
    "SW_IMP_006 – Import product-item with quantity only (config ON, no serials)",
    { tags: ["@smoke", "@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableAllowProductUploadWithoutItems();

      const stamp = ts();
      const fileName = `${testData.filenamePrefix.productItem}-QtyOnly-${stamp}.xlsx`;

      const row = {
        Category: testData.categories.productItem,
        "Model Number": testData.quantityOnlyData.modelNumber,
        Brand: testData.quantityOnlyData.brand,
        Cost: testData.quantityOnlyData.Cost,
        Price: testData.quantityOnlyData.Price,
        Quantity: testData.quantityOnlyData.Quantity,
        "Support Contact": testData.quantityOnlyData["Support Contact"],
        "Asset Tag ID": testData.quantityOnlyData.assetTagId,
        "Asset Security Code": testData.quantityOnlyData.assetSecurityCode,
      };

      createExcelFile(fileName, [row]);
      importExcel(fileName);

      invViewPage.searchProduct(testData.quantityOnlyData.modelNumber);
      invViewPage.clickSubmitSearch();
      invViewPage.clickFirstSearchResult();
      cy.log(
        "Product imported with quantity only – no serial numbers expected",
      );
    },
  );

  // ────────────────────────────── SW_IMP_007 ──────────────────────────────
  it(
    "SW_IMP_007 – Import mixed product-only and product-item categories in single file",
    { tags: ["@smoke", "@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableAllowProductUploadWithoutItems();

      const stamp = ts();
      const fileName = `${testData.filenamePrefix.mixed}-${stamp}.xlsx`;

      const laptopSN = `${testData.mixedFileData.laptopSerial}-${stamp}`;

      const ramRow = {
        Category: testData.categories.productOnly,
        Cost: testData.mixedFileData.ramRow.Cost,
        Price: testData.mixedFileData.ramRow.Price,
        Quantity: testData.mixedFileData.ramRow.Quantity,
        RAMbrand: testData.mixedFileData.ramRow["RAM Brand"],
        "Memory Generation": testData.mixedFileData.ramRow["Memory Generation"],
        "Memory Capacity": testData.mixedFileData.ramRow["Memory Capacity"],
        "Operating Voltage": testData.mixedFileData.ramRow["Operating Voltage"],
        "Performance Boost": testData.mixedFileData.ramRow["Performance Boost"],
        "ECC Supported": testData.mixedFileData.ramRow["ECC Supported"],
        "Support Contact": testData.mixedFileData.ramRow["Support Contact"],
        "Serial Number": "",
        "Model Number": "",
        Brand: "",
        "Asset Tag ID": "",
        "Asset Security Code": "",
      };

      const laptopRow = {
        Category: testData.categories.productItem,
        Cost: testData.mixedFileData.laptopRow.Cost,
        Price: testData.mixedFileData.laptopRow.Price,
        Quantity: "",
        RAMbrand: "",
        "Memory Generation": "",
        "Memory Capacity": "",
        "Operating Voltage": "",
        "Performance Boost": "",
        "ECC Supported": "",
        "Support Contact": testData.mixedFileData.laptopRow["Support Contact"],
        "Serial Number": laptopSN,
        "Model Number": testData.mixedFileData.laptopRow["Model Number"],
        Brand: testData.mixedFileData.laptopRow.Brand,
        "Asset Tag ID": testData.mixedFileData.laptopAssetTag,
        "Asset Security Code": testData.mixedFileData.laptopAssetSecurityCode,
      };

      createExcelFile(fileName, [ramRow, laptopRow]);
      importExcel(fileName);

      cy.intercept("GET", "**/incoming-items**").as("searchRam007");
      invViewPage.searchProduct(testData.mixedFileData.ramRow["Memory Generation"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchRam007");
      cy.get("tbody tr").should("have.length.greaterThan", 0);

      cy.visit("/incoming-inventory");
      incomingInvPage.selectPoNumber(testData.poNumber);
      cy.intercept("GET", "**/incoming-items**").as("searchLaptop007");
      invViewPage.searchProduct(
        testData.mixedFileData.laptopRow["Model Number"],
      );
      invViewPage.clickSubmitSearch();
      cy.wait("@searchLaptop007");
      cy.get("tbody tr").should("have.length.greaterThan", 0);

      invViewPage.clickFirstSearchResult();
      incomingInvPage.verifyserialNumberInItemsList([laptopSN]);
    },
  );

  // ────────────────────────────── SW_IMP_008 ──────────────────────────────
  it(
    "SW_IMP_008 – Verify Import Summary popup success count ",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.summary}-Clean-${stamp}.xlsx`;

      const sn4 = `${testData.summaryData.cleanImportSerials[0]}-${stamp}`;
      const sn5 = `${testData.summaryData.cleanImportSerials[1]}-${stamp}`;
      const sn6 = `${testData.summaryData.cleanImportSerials[2]}-${stamp}`;

      const baseRow = {
        Category: testData.categories.productItem,
        Cost: testData.productItemData.Cost,
        Price: testData.productItemData.Price,
        "Model Number": testData.productItemData["Model Number"],
        Brand: testData.productItemData.Brand,
        "Support Contact": testData.productItemData["Support Contact"],
      };

      const rows = [
        {
          ...baseRow,
          "Serial Number": sn4,
          "Asset Tag ID": testData.summaryData.cleanImportAssetTags[0],
          "Asset Security Code":
            testData.summaryData.cleanImportAssetSecCodes[0],
        },
        {
          ...baseRow,
          "Serial Number": sn5,
          "Asset Tag ID": testData.summaryData.cleanImportAssetTags[1],
          "Asset Security Code":
            testData.summaryData.cleanImportAssetSecCodes[1],
        },
        {
          ...baseRow,
          "Serial Number": sn6,
          "Asset Tag ID": testData.summaryData.cleanImportAssetTags[2],
          "Asset Security Code":
            testData.summaryData.cleanImportAssetSecCodes[2],
        },
      ];

      createExcelFile(fileName, rows);

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(testData.poNumber);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();

      importPage.waitForSummaryDialog();
      importPage.verifySuccessCount(3);

      incomingInvPage.clickOK();
      incomingInvPage.validateRedirectedURL();
    },
  );

  // ────────────────────────────── SW_IMP_009 ──────────────────────────────
  it(
    "SW_IMP_009 – Verify extra columns are ignored without import failure",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.summary}-Extra-${stamp}.xlsx`;
      const sn7 = `${testData.summaryData.extraColSerial}-${stamp}`;

      const row = {
        Category: testData.categories.productItem,
        Cost: testData.productItemData.Cost,
        Price: testData.productItemData.Price,
        "Model Number": testData.productItemData["Model Number"],
        Brand: testData.productItemData.Brand,
        "Serial Number": sn7,
        "Asset Tag ID": testData.summaryData.extraColAssetTag,
        "Asset Security Code": testData.summaryData.extraColAssetSecCode,
        "Support Contact": testData.productItemData["Support Contact"],
        [testData.summaryData.extraColumnName]:
          testData.summaryData.extraColumnValue,
      };

      createExcelFile(fileName, [row]);

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(testData.poNumber);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();

      importPage.waitForSummaryDialog();
      importPage.clickExtraColumnsIgnored();
      cy.contains(testData.summaryData.extraColumnName).should("be.visible");

      incomingInvPage.clickOK();
      incomingInvPage.validateRedirectedURL();

      cy.intercept("GET", "**/incoming-items**").as("searchApi009");
      invViewPage.searchProduct(testData.productItemData["Model Number"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi009");
      invViewPage.clickFirstSearchResult();
      cy.log("Product with extra column imported successfully");
    },
  );

  // ────────────────────────────── SW_IMP_010 ──────────────────────────────
  it(
    "SW_IMP_010 – Verify duplicate serial numbers are shown as ignored on re-import",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `${testData.filenamePrefix.summary}-Dup-${stamp}.xlsx`;

      const dupSN = `${testData.summaryData.duplicateSerial}-${stamp}`;

      const row = {
        Category: testData.categories.productItem,
        Cost: testData.productItemData.Cost,
        Price: testData.productItemData.Price,
        "Model Number": testData.productItemData["Model Number"],
        Brand: testData.productItemData.Brand,
        "Serial Number": dupSN,
        "Asset Tag ID": testData.summaryData.duplicateAssetTag,
        "Asset Security Code": testData.summaryData.duplicateAssetSecCode,
        "Support Contact": testData.productItemData["Support Contact"],
      };

      createExcelFile(fileName, [row]);

      importExcel(fileName);
      cy.log("First import completed successfully");

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(testData.poNumber);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();

      importPage.waitForSummaryDialog();
      importPage.clickExistingValuesIgnored();
      cy.contains(dupSN).should("be.visible");

      incomingInvPage.clickOK();
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 2 – ALL DATA TYPES & FORMAT VALIDATION (SW_IMP_011 – SW_IMP_018)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_011 ──────────────────────────────
  it(
    "SW_IMP_011 – Import Product category data with all attribute data types and verify values",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-AllTypes-RAM-${stamp}.xlsx`;
      const d = testData.allTypesProductOnly;

      const row = {
        Category: testData.categories.productOnly,
        Cost: d.Cost,
        Price: d.Price,
        Quantity: d.Quantity,
        RAMbrand: d["RAMbrand"],
        "Memory Generation": d["Memory Generation"],
        "Memory Capacity": d["Memory Capacity"],
        "Operating Voltage": d["Operating Voltage"],
        MSRP: d.MSRP,
        "Performance Boost": d["Performance Boost"],
        "ECC Supported": d["ECC Supported"],
        "Vendor Contact": d["Vendor Contact"],
        "Datasheet Link": d["Datasheet Link"],
        "Compatibility Notes": d["Compatibility Notes"],
        "Display Technology": d["Display Technology"],
        "Processing Cores": d["Processing Cores"],
        "Support Contact": d["Support Contact"],
        "Product Page": d["Product Page"],
        "Diagonal Size": d["Diagonal Size"],
        "Market Price": d["Market Price"],
        "Efficiency Rating": d["Efficiency Rating"],
        "Storage Solution": d["Storage Solution"],
        "Eco Friendly Certified": d["Eco Friendly Certified"],
        "Included Accessories": d["Included Accessories"],
      };

      createExcelFile(fileName, [row]);
      importExcel(fileName);

      cy.intercept("GET", "**/incoming-items**").as("searchApi011");
      invViewPage.searchProduct(d["RAMbrand"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi011");
      cy.get("tbody").should("contain.text", testData.categories.productOnly);
      invViewPage.clickFirstSearchResult();
      importPage.clickProductDetailsHeader();

      cy.contains(d["RAMbrand"]).scrollIntoView().should("be.visible");
      cy.contains(d["Memory Generation"]).scrollIntoView().should("be.visible");
      cy.contains(d["Display Technology"])
        .scrollIntoView()
        .should("be.visible");
      cy.contains(d["Storage Solution"]).scrollIntoView().should("be.visible");
    },
  );

  // ────────────────────────────── SW_IMP_012 ──────────────────────────────
  it(
    "SW_IMP_012 – Import Item category data with all attribute data types and verify values",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-AllTypes-Laptop-${stamp}.xlsx`;
      const d = testData.allTypesProductItem;
      const sn = `${d["Serial Number"]}-${stamp}`;
      const uniqueModel = `${d["Model Number"]}-${stamp}`;

      const row = {
        Category: testData.categories.productItem,
        Cost: d.Cost,
        Price: d.Price,
        "Model Number": uniqueModel,
        Brand: d.Brand,
        "Battery Cell Count": d["Battery Cell Count"],
        Weight: d.Weight,
        MSRP: d.MSRP,
        "Battery Percentage": d["Battery Percentage"],
        "Has Touchscreen": d["Has Touchscreen"],
        "Technical Support Email": d["Technical Support Email"],
        "Driver Download Page": d["Driver Download Page"],
        "Technical Specifications": d["Technical Specifications"],
        "Display Technology": d["Display Technology"],
        "Processing Cores": d["Processing Cores"],
        "Support Contact": d["Support Contact"],
        "Product Page": d["Product Page"],
        "Diagonal Size": d["Diagonal Size"],
        "Market Price": d["Market Price"],
        "Efficiency Rating": d["Efficiency Rating"],
        "Storage Solution": d["Storage Solution"],
        "Eco Friendly Certified": d["Eco Friendly Certified"],
        "Included Accessories": d["Included Accessories"],
        "Serial Number": sn,
        "Asset Tag ID": d["Asset Tag ID"],
        "Condition Grade": d["Condition Grade"],
        "Total Service Count": d["Total Service Count"],
        "Current Battery Health": d["Current Battery Health"],
        "Actual Purchase Price": d["Actual Purchase Price"],
        "Annual Depreciation Rate": d["Annual Depreciation Rate"],
        "Under Active Warranty": d["Under Active Warranty"],
        "Assigned User Email": d["Assigned User Email"],
        "Warranty Registration Link": d["Warranty Registration Link"],
        "Service History": d["Service History"],
        "Asset Security Code": d["Asset Security Code"],
        "Department Allocation": d["Department Allocation"],
        "Previous Repair Count": d["Previous Repair Count"],
        "Battery Wear Level": d["Battery Wear Level"],
        "Scrap Value": d["Scrap Value"],
        "Utilization Rate": d["Utilization Rate"],
        "Active Status": d["Active Status"],
        "Custodian Email": d["Custodian Email"],
        "Asset Management Link": d["Asset Management Link"],
      };

      createExcelFile(fileName, [row]);
      importExcel(fileName);

      cy.intercept("GET", "**/incoming-items**").as("searchApi012");
      invViewPage.searchProduct(uniqueModel);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi012");
      invViewPage.clickFirstSearchResult();

      incomingInvPage.verifyserialNumberInItemsList([sn]);
    },
  );

  // ────────────────────────────── SW_IMP_013 ──────────────────────────────
  it(
    "SW_IMP_013 – Verify CSV file is rejected with error message",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-Invalid-${stamp}.csv`;
      cy.task("createPlainFile", {
        filePath: `cypress/fixtures/${fileName}`,
        content: "Category,RAM Brand\nRAM Automation Cat,Corsair",
      });

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(testData.poNumber);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();
      importPage.verifyErrorContains(testData.errorMessages.invalidFileFormat);
    },
  );

  // ────────────────────────────── SW_IMP_014 ──────────────────────────────
  it(
    "SW_IMP_014 – Verify TXT file is rejected with error message",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-Invalid-${stamp}.txt`;
      cy.task("createPlainFile", {
        filePath: `cypress/fixtures/${fileName}`,
        content: "plain text data",
      });

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(testData.poNumber);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();
      importPage.verifyErrorContains(testData.errorMessages.invalidFileFormat);
    },
  );

  // ────────────────────────────── SW_IMP_015 ──────────────────────────────
  it(
    "SW_IMP_015 – Verify PDF file is rejected with error message",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-Invalid-${stamp}.pdf`;
      cy.task("createPlainFile", {
        filePath: `cypress/fixtures/${fileName}`,
        content: "%PDF-1.4 fake pdf content",
      });

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(testData.poNumber);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();
      importPage.verifyErrorContains(testData.errorMessages.invalidFileFormat);
    },
  );

  // ────────────────────────────── SW_IMP_016 ──────────────────────────────
  it(
    "SW_IMP_016 – Verify empty Excel file (header only) is rejected",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-Empty-${stamp}.xlsx`;
      cy.task("createHeaderOnlyExcel", {
        filePath: `cypress/fixtures/${fileName}`,
        headers: [
          "Category",
          "RAM Brand",
          "Cost",
          "Quantity",
          "Support Contact",
        ],
      });
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.emptySheet);
    },
  );

  // ────────────────────────────── SW_IMP_017 ──────────────────────────────
  it(
    "SW_IMP_017 – Verify multi-sheet Excel file is rejected",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-MultiSheet-${stamp}.xlsx`;
      cy.task("createMultiSheetExcel", {
        filePath: `cypress/fixtures/${fileName}`,
      });
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.multipleSheets);
    },
  );

  // ────────────────────────────── SW_IMP_018 ──────────────────────────────
  it(
    "SW_IMP_018 – Verify file missing Category column triggers column mapping dialog",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoCat-${stamp}.xlsx`;
      const row = {
        RAMbrand: testData.minRowDefaults.ram.ramBrand,
        "Memory Generation": testData.minRowDefaults.ram.memoryGeneration,
        Cost: testData.minRowDefaults.ram.cost,
        Quantity: testData.minRowDefaults.ram.quantity,
        "Support Contact": testData.minRowDefaults.ram.supportContact,
      };
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      // Files without a Category column now trigger the Column Mapping Dialog
      // (the backend detects a vendor-format file and redirects to mapping flow)
      cy.contains("Map Vendor Columns", { timeout: 15000 }).should("be.visible");
      // Scope Cancel to the dialog — the form's own Cancel button is covered by the Dialog backdrop
      cy.get('[role="dialog"]').contains("button", "Cancel").click();
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 3 – MISSING REQUIRED COLUMNS (SW_IMP_019 – SW_IMP_021)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_019 ──────────────────────────────
  it(
    "SW_IMP_019 – Verify file missing required product attribute column (product-only category) is rejected",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoRAMBrand-${stamp}.xlsx`;
      const row = {
        Category: testData.categories.productOnly,
        "Memory Generation": testData.minRowDefaults.ram.memoryGeneration,
        Cost: testData.minRowDefaults.ram.cost,
        Quantity: testData.minRowDefaults.ram.quantity,
        "Support Contact": testData.minRowDefaults.ram.supportContact,
      };
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.missingColumns);
      importPage.verifyErrorContains(testData.fieldNames.ramBrandLower);
    },
  );

  // ────────────────────────────── SW_IMP_020 ──────────────────────────────
  it(
    "SW_IMP_020 – Verify file missing required item attribute column (product-item category) is rejected",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoAssetTag-${stamp}.xlsx`;
      const row = {
        Category: testData.categories.productItem,
        "Model Number": testData.minRowDefaults.laptop.modelNumber,
        Brand: testData.minRowDefaults.laptop.brand,
        Cost: testData.minRowDefaults.laptop.cost,
        "Serial Number": `SNAuto-${stamp}`,
        "Asset Security Code": testData.minRowDefaults.laptop.assetSecurityCode,
        "Support Contact": testData.minRowDefaults.laptop.supportContact,
      };
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.missingColumns);
      importPage.verifyErrorContains(testData.fieldNames.assetTagIdLower);
    },
  );

  // ────────────────────────────── SW_IMP_021 ──────────────────────────────
  it(
    "SW_IMP_021 – Verify file missing required common product attribute column is rejected",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoSupport-${stamp}.xlsx`;
      const row = {
        Category: testData.categories.productOnly,
        "RAM Brand": testData.minRowDefaults.ram.ramBrand,
        "Memory Generation": testData.minRowDefaults.ram.memoryGeneration,
        Cost: testData.minRowDefaults.ram.cost,
        Quantity: testData.minRowDefaults.ram.quantity,
      };
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.fieldSupportContactRequired,
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 4 – ROW-LEVEL VALIDATION (SW_IMP_022 – SW_IMP_030)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_022 ──────────────────────────────
  it(
    "SW_IMP_022 – Verify invalid category name produces error with row number",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadCat-${stamp}.xlsx`;
      const row = {
        Category: testData.invalidCategoryName,
        "RAM Brand": testData.minRowDefaults.ram.ramBrand,
        Cost: testData.minRowDefaults.ram.cost,
        Quantity: testData.minRowDefaults.ram.quantity,
        "Support Contact": testData.minRowDefaults.ram.supportContact,
      };
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        `${testData.errorMessages.invalidCategory} '${testData.invalidCategoryName}'`,
      );
      importPage.verifyErrorRowNumber(2);
    },
  );

  // ────────────────────────────── SW_IMP_023 ──────────────────────────────
  it(
    "SW_IMP_023 – Verify empty Category cell produces error with row number",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-EmptyCat-${stamp}.xlsx`;
      const row = {
        Category: "",
        "RAM Brand": testData.minRowDefaults.ram.ramBrand,
        Cost: testData.minRowDefaults.ram.cost,
        Quantity: testData.minRowDefaults.ram.quantity,
        "Support Contact": testData.minRowDefaults.ram.supportContact,
      };
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.invalidCategory);
      importPage.verifyErrorRowNumber(2);
    },
  );

  // ────────────────────────────── SW_IMP_024 ──────────────────────────────
  it(
    "SW_IMP_024 – Verify empty serial number rejected when config is OFF",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.disableAllowProductUploadWithoutItems();

      const stamp = ts();
      const fileName = `ImpTest-NoSN-${stamp}.xlsx`;
      const row = minLaptopRow("");
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.serialNumberEmpty);
      importPage.closeErrorDialog();

      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableAllowProductUploadWithoutItems();
    },
  );

  // ────────────────────────────── SW_IMP_025 ──────────────────────────────
  it(
    "SW_IMP_025 – Verify missing Cost column produces error for all rows (product-only)",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoCost-RAM-${stamp}.xlsx`;
      const rows = [
        {
          Category: testData.categories.productOnly,
          "RAM Brand": testData.minRowDefaults.ram.ramBrand,
          "Memory Generation": testData.minRowDefaults.ram.memoryGeneration,
          "Memory Capacity": "16",
          Quantity: "10",
          "Operating Voltage": "1.35",
          "Support Contact": testData.minRowDefaults.ram.supportContact,
        },
        {
          Category: testData.categories.productOnly,
          "RAM Brand": "GSkill",
          "Memory Generation": "DDR4",
          "Memory Capacity": "8",
          Quantity: "5",
          "Operating Voltage": "1.20",
          "Support Contact": testData.minRowDefaults.ram.supportContact,
        },
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.missingColumns);
      importPage.verifyErrorContains(testData.fieldNames.costLower);
    },
  );

  // ────────────────────────────── SW_IMP_026 ──────────────────────────────
  it(
    "SW_IMP_026 – Verify missing Cost column produces error for all rows (product-item)",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoCost-Laptop-${stamp}.xlsx`;
      const sn10 = `${testData.negativeTestSerials.sn10}-${stamp}`;
      const sn11 = `${testData.negativeTestSerials.sn11}-${stamp}`;
      const rows = [
        {
          Category: testData.categories.productItem,
          "Model Number": testData.minRowDefaults.laptop.modelNumber,
          Brand: testData.minRowDefaults.laptop.brand,
          "Serial Number": sn10,
          "Asset Tag ID": testData.minRowDefaults.laptop.assetTagId,
          "Asset Security Code":
            testData.minRowDefaults.laptop.assetSecurityCode,
          "Support Contact": testData.minRowDefaults.laptop.supportContact,
        },
        {
          Category: testData.categories.productItem,
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          "Serial Number": sn11,
          "Asset Tag ID": "ASSET-IT-2024-1002",
          "Asset Security Code": "SEC-2024-Y88",
          "Support Contact": testData.minRowDefaults.laptop.supportContact,
        },
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.missingColumns);
      importPage.verifyErrorContains(testData.fieldNames.costLower);
    },
  );

  // ────────────────────────────── SW_IMP_027 ──────────────────────────────
  it(
    "SW_IMP_027 – Verify Cost missing in one row targets only that row (product-only)",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-PartialCost-RAM-${stamp}.xlsx`;
      const rows = [
        minRamRow({ "Memory Capacity": "16", Price: "129.99" }),
        minRamRow({
          "RAM Brand": "GSkill",
          "Memory Generation": "DDR4",
          "Memory Capacity": "8",
          Cost: "",
          Price: "65.00",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.costRequired);
    },
  );

  // ────────────────────────────── SW_IMP_028 ──────────────────────────────
  it(
    "SW_IMP_028 – Verify Cost missing in one row targets only that row (product-item)",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-PartialCost-Laptop-${stamp}.xlsx`;
      const sn12 = `${testData.negativeTestSerials.sn12}-${stamp}`;
      const sn13 = `${testData.negativeTestSerials.sn13}-${stamp}`;
      const rows = [
        minLaptopRow(sn12, { Price: "2499.99" }),
        minLaptopRow(sn13, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          Cost: "",
          "Asset Tag ID": "ASSET-IT-2024-1002",
          "Asset Security Code": "SEC-2024-Y88",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.costRequired);
    },
  );

  // ────────────────────────────── SW_IMP_029 ──────────────────────────────
  it(
    "SW_IMP_029 – Verify empty required attribute (RAM Brand) produces error for correct row",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-EmptyRAMBrand-${stamp}.xlsx`;
      const rows = [
        minRamRow({ "Memory Capacity": "16", Price: "129.99" }),
        minRamRow({
          "RAM Brand": "",
          "Memory Generation": "DDR4",
          "Memory Capacity": "8",
          Cost: "45.00",
          Price: "65.00",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.fieldRamBrandRequired,
      );
    },
  );

  // ────────────────────────────── SW_IMP_030 ──────────────────────────────
  it(
    "SW_IMP_030 – Verify empty required attribute (Support Contact) produces error for correct row",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-EmptySupport-${stamp}.xlsx`;
      const rows = [
        minRamRow({ "Memory Capacity": "16", Price: "129.99" }),
        minRamRow({
          "Memory Generation": "DDR4",
          "Memory Capacity": "8",
          Cost: "45.00",
          Price: "65.00",
          "Support Contact": "",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.fieldSupportContactRequired,
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 5 – REQUIRED ATTRIBUTE VALUE MISSING (SW_IMP_031 – SW_IMP_033)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_031 ──────────────────────────────
  it(
    "SW_IMP_031 – Verify empty required item attribute (Asset Tag ID) error for correct row",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-EmptyAssetTag-${stamp}.xlsx`;
      const sn16 = `${testData.negativeTestSerials.sn16}-${stamp}`;
      const sn17 = `${testData.negativeTestSerials.sn17}-${stamp}`;
      const rows = [
        minLaptopRow(sn16, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          "Asset Tag ID": "ASSET-IT-2024-1001",
          "Asset Security Code": "SEC-2024-X99",
        }),
        minLaptopRow(sn17, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          "Asset Tag ID": "",
          "Asset Security Code": "SEC-2024-Y88",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.fieldAssetTagIdRequired,
      );
    },
  );

  // ────────────────────────────── SW_IMP_032 ──────────────────────────────
  it(
    "SW_IMP_032 – Verify empty required common attribute (Support Contact) error for correct row",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-EmptySupportContact-${stamp}.xlsx`;
      const rows = [
        minRamRow(),
        minRamRow({
          "RAM Brand": "GSkill",
          "Memory Generation": "DDR4",
          Cost: "45.00",
          "Support Contact": "",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.fieldSupportContactRequired,
      );
    },
  );

  // ────────────────────────────── SW_IMP_033 ──────────────────────────────
  it(
    "SW_IMP_033 – Verify empty required common item attribute (Asset Security Code) error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-EmptyAssetSec-${stamp}.xlsx`;
      const sn18 = `${testData.negativeTestSerials.sn18}-${stamp}`;
      const sn19 = `${testData.negativeTestSerials.sn19}-${stamp}`;
      const rows = [
        minLaptopRow(sn18, { "Asset Security Code": "SEC-2024-X99" }),
        minLaptopRow(sn19, {
          "Asset Tag ID": "ASSET-IT-2024-1002",
          "Asset Security Code": "",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.fieldAssetSecCodeRequired,
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 6 – PURCHASE ORDER VALIDATION (SW_IMP_035)
  // ═══════════════════════════════════════════════════════════════════════

  // SW_IMP_034 is skipped (not required per user request)

  // ────────────────────────────── SW_IMP_035 ──────────────────────────────
  it(
    "SW_IMP_035 – Verify import without PO when Require PO Number is ON produces error",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableToggle("isPoNumberRequired");

      const stamp = ts();
      const fileName = `ImpTest-NoPO-${stamp}.xlsx`;
      createExcelFile(fileName, [minRamRow()]);

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();

      importPage.verifyErrorContains(testData.errorMessages.poNumberRequired);

      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.disableToggle("isPoNumberRequired");
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 7 – DATA TYPE VALIDATION – PRODUCT-ONLY (SW_IMP_036 – SW_IMP_042)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_036 ──────────────────────────────
  it(
    "SW_IMP_036 – Verify invalid Number-type value in product-only category attribute produces error with row number",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadNumber-RAM-${stamp}.xlsx`;
      const row = minRamRow({
        "Memory Capacity": testData.typeValidation.invalidNumber,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.memoryCapacity);
      importPage.verifyErrorContains(testData.errorMessages.notANumber);
      importPage.verifyErrorRowNumber(2);
    },
  );

  // ────────────────────────────── SW_IMP_037 ──────────────────────────────
  it(
    "SW_IMP_037 – Verify invalid Decimal-type value in product-only category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadDecimal-RAM-${stamp}.xlsx`;
      const row = minRamRow({
        "Operating Voltage": testData.typeValidation.invalidDecimal,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.invalidDecimalValue,
      );
    },
  );

  // ────────────────────────────── SW_IMP_038 ──────────────────────────────
  it(
    "SW_IMP_038 – Verify invalid Boolean-type value in product-only category attribute produces error with row number",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadBool-RAM-${stamp}.xlsx`;
      const row = minRamRow({
        "ECC Supported": testData.typeValidation.invalidBoolean,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.valueMustBeBoolean);
      importPage.verifyErrorRowNumber(2);
    },
  );

  // ────────────────────────────── SW_IMP_039 ──────────────────────────────
  it(
    "SW_IMP_039 – Verify invalid Email-type value in product-only category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadEmail-RAM-${stamp}.xlsx`;
      const row = minRamRow({
        "Vendor Contact": testData.typeValidation.invalidEmail,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.invalidEmailFormat);
    },
  );

  // ────────────────────────────── SW_IMP_040 ──────────────────────────────
  it(
    "SW_IMP_040 – Verify invalid URL-type value in product-only category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadUrl-RAM-${stamp}.xlsx`;
      const row = minRamRow({
        "Datasheet Link": testData.typeValidation.invalidUrl,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.datasheetLink);
      importPage.verifyErrorContains(testData.errorMessages.notAUrl);
    },
  );

  // ────────────────────────────── SW_IMP_041 ──────────────────────────────
  it(
    "SW_IMP_041 – Verify invalid Percent-type value in product-only category attribute produces error with row number",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadPercent-RAM-${stamp}.xlsx`;
      const row = minRamRow({
        "Performance Boost": testData.typeValidation.invalidPercent,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.performanceBoost);
      importPage.verifyErrorContains(testData.errorMessages.invalidDecimalNumber);
      importPage.verifyErrorRowNumber(2);
    },
  );

  // ────────────────────────────── SW_IMP_042 ──────────────────────────────
  it(
    "SW_IMP_042 – Verify invalid List-type value in product-only category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadList-RAM-${stamp}.xlsx`;
      const row = minRamRow({
        "RAMbrand": testData.typeValidation.invalidListRamBrand,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.invalidListValue);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 8 – DATA TYPE VALIDATION – PRODUCT-ITEM (SW_IMP_043 – SW_IMP_050)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_043 ──────────────────────────────
  it(
    "SW_IMP_043 – Verify invalid Number-type value in product-item category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadNumber-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn20}-${stamp}`;
      const row = minLaptopRow(sn, { "Battery Cell Count": "Four" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.batteryCellCount);
      importPage.verifyErrorContains(testData.errorMessages.notANumber);
    },
  );

  // ────────────────────────────── SW_IMP_044 ──────────────────────────────
  it(
    "SW_IMP_044 – Verify invalid Decimal-type value in product-item category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadDecimal-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn21}-${stamp}`;
      const row = minLaptopRow(sn, { Weight: "heavy" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.invalidDecimalValue,
      );
    },
  );

  // ────────────────────────────── SW_IMP_045 ──────────────────────────────
  it(
    "SW_IMP_045 – Verify invalid Boolean-type value in product-item category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadBool-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn22}-${stamp}`;
      const row = minLaptopRow(sn, { "Has Touchscreen": "yes-maybe" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.valueMustBeBoolean);
    },
  );

  // ────────────────────────────── SW_IMP_046 ──────────────────────────────
  it(
    "SW_IMP_046 – Verify invalid Email-type value in product-item category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadEmail-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn23}-${stamp}`;
      const row = minLaptopRow(sn, {
        "Technical Support Email": testData.typeValidation.invalidEmail,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.invalidEmailFormat);
    },
  );

  // ────────────────────────────── SW_IMP_047 ──────────────────────────────
  it(
    "SW_IMP_047 – Verify invalid URL-type value in product-item category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadUrl-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn24}-${stamp}`;
      const row = minLaptopRow(sn, {
        "Driver Download Page": testData.typeValidation.invalidUrl,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.driverDownloadPage);
      importPage.verifyErrorContains(testData.errorMessages.notAUrl);
    },
  );

  // ────────────────────────────── SW_IMP_048 ──────────────────────────────
  it(
    "SW_IMP_048 – Verify invalid Percent-type value in product-item category attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadPercent-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn25}-${stamp}`;
      const row = minLaptopRow(sn, { "Battery Percentage": "full" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(
        testData.errorMessages.batteryPercMustBeNumber,
      );
    },
  );

  // ────────────────────────────── SW_IMP_049 ──────────────────────────────
  it(
    "SW_IMP_049 – Verify invalid List-type value in product-item category product attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadListBrand-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn26}-${stamp}`;
      const row = minLaptopRow(sn, {
        Brand: testData.typeValidation.invalidListBrand,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.brand);
      importPage.verifyErrorContains(testData.errorMessages.invalidListValue);
    },
  );

  // ────────────────────────────── SW_IMP_050 ──────────────────────────────
  it(
    "SW_IMP_050 – Verify invalid List-type value in product-item category item attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadListGrade-Laptop-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn27}-${stamp}`;
      const row = minLaptopRow(sn, {
        "Item Storage Capacity": testData.typeValidation.invalidListConditionGrade,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.conditionGrade);
      importPage.verifyErrorContains(testData.errorMessages.invalidListValue);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 9 – DATA TYPE VALIDATION – COMMON ATTRIBUTES (SW_IMP_051 – SW_IMP_055)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_051 ──────────────────────────────
  it(
    "SW_IMP_051 – Verify invalid Number-type value in common product attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadCommonNum-${stamp}.xlsx`;
      const row = minRamRow({ "Processing Cores": "many" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.processingCores);
      importPage.verifyErrorContains(testData.errorMessages.notANumber);
    },
  );

  // ────────────────────────────── SW_IMP_052 ──────────────────────────────
  it(
    "SW_IMP_052 – Verify invalid Email-type value in common product attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadCommonEmail-${stamp}.xlsx`;
      const row = minRamRow({
        "Support Contact": testData.typeValidation.invalidEmail,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.invalidEmailFormat);
    },
  );

  // ────────────────────────────── SW_IMP_053 ──────────────────────────────
  it(
    "SW_IMP_053 – Verify invalid List-type value in common product attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadCommonList-${stamp}.xlsx`;
      const row = minRamRow({
        "Storage Solution": testData.typeValidation.invalidListStorageSolution,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.storageSolution);
      importPage.verifyErrorContains(testData.errorMessages.invalidListValue);
    },
  );

  // ────────────────────────────── SW_IMP_054 ──────────────────────────────
  it(
    "SW_IMP_054 – Verify invalid Number-type value in common item attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadCommonItemNum-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn28}-${stamp}`;
      const row = minLaptopRow(sn, { "Previous Repair Count": "none" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.previousRepairCount);
      importPage.verifyErrorContains(testData.errorMessages.notANumber);
    },
  );

  // ────────────────────────────── SW_IMP_055 ──────────────────────────────
  it(
    "SW_IMP_055 – Verify invalid List-type value in common item attribute produces error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-BadCommonItemList-${stamp}.xlsx`;
      const sn = `${testData.negativeTestSerials.sn29}-${stamp}`;
      const row = minLaptopRow(sn, {
        "Department Allocation":
          testData.typeValidation.invalidListDepartmentAllocation,
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.fieldNames.departmentAllocation);
      importPage.verifyErrorContains(testData.errorMessages.invalidListValue);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 10 – EXTRA/DUPLICATE COLUMNS & SERIAL NUMBER HANDLING (SW_IMP_056 – SW_IMP_059)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_056 ──────────────────────────────
  it(
    "SW_IMP_056 – Verify duplicate column header reported in Error Summary",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-DupHeader-${stamp}.xlsx`;
      const row = minRamRow();
      cy.task("createExcelWithDuplicateHeader", {
        filePath: `cypress/fixtures/${fileName}`,
        data: [row],
        duplicateHeader: testData.fieldNames.ramBrand,
      }).then((msg) => cy.log(msg));
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.duplicateColumns);
      importPage.verifyErrorContains(testData.fieldNames.ramBrandLower);
    },
  );

  // ────────────────────────────── SW_IMP_057 ──────────────────────────────
  it(
    "SW_IMP_057 – Verify Serial Number in product-only file does not prevent import",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-SNInProductOnly-${stamp}.xlsx`;
      const row = minRamRow({
        "Serial Number": `${testData.negativeTestSerials.sn30}-${stamp}`,
        Quantity: "10",
      });
      createExcelFile(fileName, [row]);
      importExcel(fileName);
      cy.intercept("GET", "**/incoming-items**").as("searchApi057");
      invViewPage.searchProduct(testData.minRowDefaults.ram.ramBrand);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi057");
      cy.get("tbody").should("contain.text", testData.categories.productOnly);
    },
  );

  // ────────────────────────────── SW_IMP_058 ──────────────────────────────
  it(
    "SW_IMP_058 – Verify in-file duplicate serial numbers are counted in Duplicate Values",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-InFileDups-${stamp}.xlsx`;
      const sn31 = `${testData.negativeTestSerials.sn31}-${stamp}`;
      const sn32 = `${testData.negativeTestSerials.sn32}-${stamp}`;
      const sn33 = `${testData.negativeTestSerials.sn33}-${stamp}`;
      const rows = [
        minLaptopRow(sn31, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
        }),
        minLaptopRow(sn32, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          "Asset Tag ID": "ASSET-IT-2024-1002",
        }),
        minLaptopRow(sn33, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          "Asset Tag ID": "ASSET-IT-2024-1003",
        }),
        minLaptopRow(sn31, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          "Asset Tag ID": "ASSET-IT-2024-1004",
        }),
        minLaptopRow(sn32, {
          "Model Number": "X1 Carbon Gen 10",
          Brand: "Dell",
          "Asset Tag ID": "ASSET-IT-2024-1005",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcelExpectSummary(fileName);
      importPage.verifySuccessCount(3);
      importPage.closeSummaryDialog();
    },
  );

  // ────────────────────────────── SW_IMP_059 ──────────────────────────────
  it(
    "SW_IMP_059 – Verify already-existing serial numbers reported in Existing Values Ignored",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const firstFileName = `ImpTest-FirstImport-${stamp}.xlsx`;
      const sn34 = `${testData.negativeTestSerials.sn34}-${stamp}`;
      const firstRow = minLaptopRow(sn34, {
        "Model Number": "ThinkPad T14",
        Brand: "Lenovo",
      });
      createExcelFile(firstFileName, [firstRow]);
      importExcel(firstFileName);

      const sn35 = `${testData.negativeTestSerials.sn35}-${stamp}`;
      const sn36 = `${testData.negativeTestSerials.sn36}-${stamp}`;
      const secondFileName = `ImpTest-SecondImport-${stamp}.xlsx`;
      const secondRows = [
        minLaptopRow(sn34, { "Model Number": "ThinkPad T14", Brand: "Lenovo" }),
        minLaptopRow(sn35, {
          "Model Number": "ThinkPad T14",
          Brand: "Lenovo",
          "Asset Tag ID": "ASSET-IT-2024-1002",
        }),
        minLaptopRow(sn36, {
          "Model Number": "ThinkPad T14",
          Brand: "Lenovo",
          "Asset Tag ID": "ASSET-IT-2024-1003",
        }),
      ];
      createExcelFile(secondFileName, secondRows);
      importExcelExpectSummary(secondFileName);
      importPage.verifySuccessCount(2);
      importPage.verifyExistingValuesIgnoredCount(1);
      importPage.closeSummaryDialog();
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 11 – QUANTITY HANDLING (SW_IMP_060 – SW_IMP_061)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_060 ──────────────────────────────
  it(
    "SW_IMP_060 – Verify product-only with Quantity=0 is rejected with quantity error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-ZeroQty-${stamp}.xlsx`;
      const row = minRamRow({
        "Memory Generation": "DDR4",
        Cost: "45.00",
        Price: "65.00",
        Quantity: "0",
      });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.qtyRequiredError);
    },
  );

  // ────────────────────────────── SW_IMP_061 ──────────────────────────────
  it(
    "SW_IMP_061 – Verify product-only without Quantity column is rejected with quantity error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoQtyCol-${stamp}.xlsx`;
      const row = {
        Category: testData.categories.productOnly,
        RAMbrand: testData.minRowDefaults.ram.ramBrand,
        "Memory Generation": testData.minRowDefaults.ram.memoryGeneration,
        Cost: testData.minRowDefaults.ram.cost,
        Price: "129.99",
        "Support Contact": testData.minRowDefaults.ram.supportContact,
      };
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.qtyRequiredError);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 12 – CONFIG: ALLOW PRODUCT UPLOAD WITHOUT ITEMS (SW_IMP_062 – SW_IMP_066)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_062 ──────────────────────────────
  it(
    "SW_IMP_062 – Verify config ON: product-item with Qty, no SN imports successfully",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableToggle("allowProductUploadWithoutItems");

      const stamp = ts();
      const fileName = `ImpTest-QtyNoSN-ON-${stamp}.xlsx`;
      const uniqueModel = `HP EliteBook 840 G9-${stamp}`;
      const row = {
        Category: testData.categories.productItem,
        "Model Number": uniqueModel,
        Brand: testData.quantityOnlyData.brand,
        Cost: testData.quantityOnlyData.Cost,
        Price: testData.quantityOnlyData.Price,
        Quantity: "10",
        "Asset Tag ID": testData.minRowDefaults.laptop.assetTagId,
        "Asset Security Code": testData.minRowDefaults.laptop.assetSecurityCode,
        "Support Contact": testData.minRowDefaults.laptop.supportContact,
      };
      createExcelFile(fileName, [row]);
      importExcel(fileName);
      cy.intercept("GET", "**/incoming-items**").as("searchApi062");
      invViewPage.searchProduct(uniqueModel);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi062");
      cy.get("tbody").should("contain.text", testData.categories.productItem);
    },
  );

  // ────────────────────────────── SW_IMP_063 ──────────────────────────────
  it(
    "SW_IMP_063 – Verify config ON: product-item with serial numbers creates items",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableToggle("allowProductUploadWithoutItems");

      const stamp = ts();
      const fileName = `ImpTest-WithSN-ON-${stamp}.xlsx`;
      const sn37 = `${testData.negativeTestSerials.sn37}-${stamp}`;
      const sn38 = `${testData.negativeTestSerials.sn38}-${stamp}`;
      const sn39 = `${testData.negativeTestSerials.sn39}-${stamp}`;
      const uniqueModel = `ThinkPad T14-${stamp}`;
      const rows = [
        minLaptopRow(sn37, { "Model Number": uniqueModel }),
        minLaptopRow(sn38, {
          "Model Number": uniqueModel,
          "Asset Tag ID": "ASSET-IT-2024-1002",
        }),
        minLaptopRow(sn39, {
          "Model Number": uniqueModel,
          "Asset Tag ID": "ASSET-IT-2024-1003",
        }),
      ];
      createExcelFile(fileName, rows);
      importExcel(fileName);
      cy.intercept("GET", "**/incoming-items**").as("searchApi063");
      invViewPage.searchProduct(uniqueModel);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi063");
      invViewPage.clickFirstSearchResult();
      incomingInvPage.verifyserialNumberInItemsList([sn37, sn38, sn39]);
    },
  );

  // ────────────────────────────── SW_IMP_064 ──────────────────────────────
  it(
    "SW_IMP_064 – Verify config OFF: product-item without SN is rejected",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.disableToggle("allowProductUploadWithoutItems");

      const stamp = ts();
      const fileName = `ImpTest-NoSN-OFF-${stamp}.xlsx`;
      const row = minLaptopRow("", { Quantity: "5" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.serialNumberEmpty);
      importPage.closeErrorDialog();

      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableToggle("allowProductUploadWithoutItems");
    },
  );

  // ────────────────────────────── SW_IMP_065 ──────────────────────────────
  it(
    "SW_IMP_065 – Verify config toggle does not affect product-only imports",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.disableToggle("allowProductUploadWithoutItems");

      const stamp = ts();
      const fileName1 = `ImpTest-ProdOnly-OFF-${stamp}.xlsx`;
      const row1 = minRamRow({ Quantity: "20" });
      createExcelFile(fileName1, [row1]);
      importExcel(fileName1);

      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.verifyPageLoaded();
      generalConfigPage.enableToggle("allowProductUploadWithoutItems");

      const stamp2 = ts();
      const fileName2 = `ImpTest-ProdOnly-ON-${stamp2}.xlsx`;
      const row2 = minRamRow({
        RAMbrand: "Kingston",
        "Memory Generation": "DDR4",
        Cost: "45.00",
        Quantity: "15",
      });
      createExcelFile(fileName2, [row2]);
      importExcel(fileName2);

      cy.intercept("GET", "**/incoming-items**").as("searchApi065");
      invViewPage.searchProduct("Kingston");
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi065");
      cy.get("tbody").should("contain.text", testData.categories.productOnly);
    },
  );

  // ────────────────────────────── SW_IMP_066 ──────────────────────────────
  it(
    "SW_IMP_066 – Comprehensive: multiple row-level error types in one file",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-AllErrors-${stamp}.xlsx`;
      const row2 = minRamRow();
      const row3 = minRamRow({
        RAMbrand: "GSkill",
        "Memory Generation": "DDR4",
        Cost: "",
      });
      const row4 = minRamRow({ RAMbrand: "" });
      const row5 = minRamRow({
        RAMbrand: testData.typeValidation.invalidListRamBrand,
      });
      const row6 = minRamRow({
        "Support Contact": testData.typeValidation.invalidEmail,
      });
      createExcelFile(fileName, [row2, row3, row4, row5, row6]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.costRequired);
      importPage.verifyErrorContains(testData.errorMessages.invalidListValue);
      importPage.verifyErrorContains(testData.errorMessages.invalidEmailFormat);
      importPage.closeErrorDialog();
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 13 – BULK IMPORTS (SW_IMP_067 – SW_IMP_068)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_067 ──────────────────────────────
  it(
    "SW_IMP_067 – Bulk import 1000 Laptop items across 10 products (100 items each) and verify 10 product rows are created",
    // retries: 0 — do not retry this test; a 20sec clickOKTimeout means a
    // single retry doubles CI time. If the backend is genuinely slow the test
    // should be investigated, not silently retried.
    { tags: ["@regression"], retries: 0 },
    () => {
      const stamp = ts();
      const bulkPO = `PO-BulkImportTest-${stamp}`;
      const fileName = `ImpTest-1k-10Products-${stamp}.xlsx`;
      const productsCount = 10;
      const itemsPerProduct = 100;
      const totalItems = productsCount * itemsPerProduct;
      const rows = [];

      for (let p = 0; p < productsCount; p++) {
        const model = `TestBulk-Model-${stamp}-P${p + 1}`;
        for (let i = 0; i < itemsPerProduct; i++) {
          rows.push(
            minLaptopRow(`BulkSN-${stamp}-P${p + 1}-I${i + 1}`, {
              "Model Number": model,
              "Asset Tag ID": `ASSET-BULK-${stamp}-P${p + 1}-I${i + 1}`,
            }),
          );
        }
      }

      sw067BulkPO = bulkPO;
      createExcelFile(fileName, rows);
      // clickOKTimeout 180 s — server-side processing of 1 000 items takes longer
      // than the default 30 s command timeout. This is intentional for the bulk-
      // import smoke test; see retries: 0 above.
      importExcel(fileName, { poOverride: bulkPO, clickOKTimeout: 20000 });

      cy.get("tbody tr").should("have.length", productsCount);
      cy.log(
        `Successfully imported ${totalItems} items across ${productsCount} products under PO: ${bulkPO}`,
      );
    },
  );

  // ────────────────────────────── SW_IMP_068 ──────────────────────────────
  it(
    "SW_IMP_068 – Bulk import 200 Laptop items for a single product and verify expected quantity is 200",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const bulkPO = `PO-BulkImport-068-${stamp}`;
      sw068BulkPO = bulkPO;
      const fileName = `ImpTest-200Items-${stamp}.xlsx`;
      const totalItems = 200;
      const model = `TestBulk-model-${stamp}`;

      const rows = Array.from({ length: totalItems }, (_, i) =>
        minLaptopRow(`BulkSN-${stamp}-${i + 1}`, {
          "Model Number": model,
          "Asset Tag ID": `ASSET-BULK-${stamp}-${i + 1}`,
        }),
      );

      createExcelFile(fileName, rows);
      importExcel(fileName, { poOverride: bulkPO, clickOKTimeout: 20000 });

      cy.intercept("GET", "**/incoming-items**").as("searchApi068");
      invViewPage.searchProduct(model);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi068");
      cy.get("tbody tr").should("have.length", 1);
      incomingInvPage.verifyExpectedQty(totalItems.toString());
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 14 – PO QUANTITY VERIFICATION (SW_IMP_069 – SW_IMP_070)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_069 ──────────────────────────────
  it(
    "SW_IMP_069 – Product-only: verify Expected & Incoming after import, then re-import same PO",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const poQtyData = testData.poQuantityVerification;
      const po = `${poQtyData.poPrefix.productOnly}-${stamp}`;
      sw069RamPO = po;

      // ── First import ──
      const fileName1 = `${poQtyData.filenamePrefix.productOnly}-1-${stamp}.xlsx`;
      createExcelFile(fileName1, [
        minRamRow({ Quantity: poQtyData.productOnly.importQuantity }),
      ]);
      importExcel(fileName1, { poOverride: po });

      // Verify badges after first import
      incomingInvPage.validateExpectedQty(poQtyData.productOnly.expectedAfterFirstImport);
      incomingInvPage.validateIncomingQty(poQtyData.productOnly.incomingAfterFirstImport);

      // ── Second import: same product, same PO ──
      const fileName2 = `${poQtyData.filenamePrefix.productOnly}-2-${stamp}.xlsx`;
      createExcelFile(fileName2, [
        minRamRow({ Quantity: poQtyData.productOnly.importQuantity }),
      ]);
      importExcel(fileName2, { poOverride: po });

      // Verify cumulative badges
      incomingInvPage.validateExpectedQty(poQtyData.productOnly.expectedAfterSecondImport);
      incomingInvPage.validateIncomingQty(poQtyData.productOnly.incomingAfterSecondImport);
    },
  );

  // ────────────────────────────── SW_IMP_070 ──────────────────────────────
  it(
    "SW_IMP_070 – Product-item: verify Expected & Incoming after import, then re-import same PO",
    { tags: ["@smoke", "@regression"] },
    () => {
      const stamp = ts();
      const poQtyData = testData.poQuantityVerification;
      const po = `${poQtyData.poPrefix.productItem}-${stamp}`;
      sw070LaptopPO = po;

      // ── First import: serialized items ──
      const batch1 = Array.from({ length: poQtyData.productItem.itemsPerImport }, (_, i) =>
        minLaptopRow(`${poQtyData.productItem.serialPrefix}-A${i + 1}-${stamp}`),
      );
      const fileName1 = `${poQtyData.filenamePrefix.productItem}-1-${stamp}.xlsx`;
      createExcelFile(fileName1, batch1);
      importExcel(fileName1, { poOverride: po });

      // Verify badges after first import
      incomingInvPage.validateExpectedQty(poQtyData.productItem.expectedAfterFirstImport);
      incomingInvPage.validateIncomingQty(poQtyData.productItem.incomingAfterFirstImport);

      // ── Second import: more items, same PO ──
      const batch2 = Array.from({ length: poQtyData.productItem.itemsPerImport }, (_, i) =>
        minLaptopRow(`${poQtyData.productItem.serialPrefix}-B${i + 1}-${stamp}`),
      );
      const fileName2 = `${poQtyData.filenamePrefix.productItem}-2-${stamp}.xlsx`;
      createExcelFile(fileName2, batch2);
      importExcel(fileName2, { poOverride: po });

      // Verify cumulative badges
      incomingInvPage.validateExpectedQty(poQtyData.productItem.expectedAfterSecondImport);
      incomingInvPage.validateIncomingQty(poQtyData.productItem.incomingAfterSecondImport);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  after() – Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  after(() => {
    cy.adminSession();
    cy.visit("/");

    // Restore config toggles
    const gc = new GeneralConfigPage();
    gc.navigateToGeneralConfig();
    gc.verifyPageLoaded();
    gc.enableToggle("allowProductUploadWithoutItems");
    gc.disableToggle("isPoNumberRequired");

    // Delete POs created during testing via API helper.
    [testData.poNumber, sw003PO, sw067BulkPO, sw068BulkPO, sw069RamPO, sw070LaptopPO]
      .filter(Boolean)
      .forEach((po) => deletePO(po));

    // Clear Product Name configurations
    const catPage = new CategoryPage();

    catPage.navigateToCategories();
    catPage.clickManageProductName("RAM Automation Cat");
    cy.get("#product-name-form").then(($form) => {
      if ($form.find('div[role="button"][aria-label^="Remove "]').length > 0) {
        cy.intercept("PATCH", "**/configs/**").as("saveRamProductName");
        catPage.clearAllProductNameTags();
        catPage.saveProductNameConfig();
        cy.wait("@saveRamProductName").its("response.statusCode").should("eq", 200);
      }
    });

    catPage.navigateToCategories();
    catPage.clickManageProductName("Laptop Automation Cat");
    cy.get("#product-name-form").then(($form) => {
      if ($form.find('div[role="button"][aria-label^="Remove "]').length > 0) {
        cy.intercept("PATCH", "**/configs/**").as("saveLaptopProductName");
        catPage.clearAllProductNameTags();
        catPage.saveProductNameConfig();
        cy.wait("@saveLaptopProductName").its("response.statusCode").should("eq", 200);
      }
    });

    // Clean up test Excel files
    cy.task("deleteTestExcelFiles");
  });
});
