import ScanConfigPage from "../../pageObjects/ScanConfigPage.js";
import IncomingInvPage from "../../pageObjects/IncomingInvPage.js";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage.js";
import CategoryPage from "../../pageObjects/CategoryPage.js";


const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

describe("Scan Config – Scan Configuration Tests (SCAN_CFG_001-SCAN_CFG_006)", () => {
  let scanConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/scanConfigTestData.json").then((data) => {
      td = data;
    });
    loginSession();
    scanConfigPage = new ScanConfigPage();
    scanConfigPage.navigateToScanConfig();
    scanConfigPage.uncheckAllCheckboxes();
  });

  beforeEach(() => {
    loginSession();
    scanConfigPage = new ScanConfigPage();
    scanConfigPage.navigateToScanConfig();
  });

  it(
    "SCAN_CFG_001 – Select Common Unique Attribute and Verify Count",
    { tags: ["@smoke","@regression"] },
    () => {
      scanConfigPage.clickCheckboxByLabel(td.CommonUniqueAttrib);
      scanConfigPage.clickUpdateButton();
      scanConfigPage.validateToastMessage(td.ScanConfigUpdateMsg);
      // ✅ Verify the checkbox is actually selected in the UI
      scanConfigPage.verifyCheckboxIsChecked(td.CommonUniqueAttrib);
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
    },
  );

  it(
    "SCAN_CFG_002 – Remove Common Unique Attribute and Verify Count ",
    { tags: ["@regression"] },
    () => {
      // ✅ Verify selection from SCAN_CFG_001 persisted (fresh page load)
      scanConfigPage.verifyCheckboxIsChecked(td.CommonUniqueAttrib);
      // Now remove it
      scanConfigPage.clickCheckboxByLabel(td.CommonUniqueAttrib);
      scanConfigPage.clickUpdateButton();
      scanConfigPage.validateToastMessage(td.ScanConfigUpdateMsg);
      // ✅ Verify it's now unchecked
      scanConfigPage.verifyCheckboxIsUnchecked(td.CommonUniqueAttrib);
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
    },
  );

  it(
    "SCAN_CFG_003 – Select Category Unique Attribute and Verify Count  ",
    { tags: ["@smoke", "@regression"] },
    () => {
      scanConfigPage.clickCheckboxByLabel(td.UniqueItemAttrib);
      scanConfigPage.clickUpdateButton();
      scanConfigPage.validateToastMessage(td.ScanConfigUpdateMsg);
      // ✅ Verify the checkbox is actually selected in the UI
      scanConfigPage.verifyCheckboxIsChecked(td.UniqueItemAttrib);
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
    },
  );

  it(
    "SCAN_CFG_004 – Remove Category Unique Attribute and Verify Count ",
    { tags: ["@regression"] },
    () => {
      scanConfigPage.verifyCheckboxIsChecked(td.UniqueItemAttrib);
      scanConfigPage.clickCheckboxByLabel(td.UniqueItemAttrib);
      scanConfigPage.clickUpdateButton();
      scanConfigPage.validateToastMessage(td.ScanConfigUpdateMsg);
      scanConfigPage.verifyCheckboxIsUnchecked(td.UniqueItemAttrib);
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
    },
  );

  it(
    "SCAN_CFG_005 - Verify Clear Button Reverts to Last Saved State",
    { tags: ["@regression"] },
    () => {
      scanConfigPage.clickCheckboxByLabel(td.UniqueItemAttrib);
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
      scanConfigPage.clickCheckboxByLabel(td.CommonUniqueAttrib);
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
      scanConfigPage.clickClearBt();
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
    },
  );

  it(
    "SCAN_CFG_006 - Save Multiple Selection and Verify Persistence",
    { tags: ["@smoke","@regression"] },
    () => {
      scanConfigPage.clickCheckboxByLabel(td.CommonUniqueAttrib);
      scanConfigPage.clickCheckboxByLabel(td.UniqueItemAttrib);
      scanConfigPage.clickUpdateButton();
      scanConfigPage.validateToastMessage(td.ScanConfigUpdateMsg);
      scanConfigPage.getCheckedCheckboxCount().then((count) => {
        scanConfigPage.verifySelectedCount(count.toString());
      });
    },
  );

  after(() => {
    // Cleanup: establish own session and fresh page object so this is
    // independent of any prior test failure or incomplete beforeEach.
    // Return scan config to clean slate (all checkboxes unchecked) matching before() state.
    loginSession();
    const cleanupPage = new ScanConfigPage();
    cleanupPage.navigateToScanConfig();

    // Uncheck all checkboxes
    cleanupPage.uncheckAllCheckboxes();
    cleanupPage.clickUpdateButton();
    cleanupPage.validateToastMessage(td.ScanConfigUpdateMsg);

    // Verify we're back to clean state (0 selected)
    cleanupPage.verifyAllCheckboxesUnchecked();
  });
});

describe("Cleanup: Delete POs and Categories", () => {
  let td;

  before(() => {
    cy.fixture("Configuration/attributeDeletionTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
  });

  it("SW_ATR_CLEANUP_01 - Delete Laptop Cat Import PO", () => {
    const invPage = new IncomingInvPage();
    const purchaseOrderPage = new PurchaseOrderPage();
    invPage.navigateToPOTab();
    purchaseOrderPage.deletePurchaseOrder(td.commonAttribDeleteTestsPO);
  });

  it("SW_ATR_CLEANUP_02 - Delete RAM Cat Import PO", () => {
    const invPage = new IncomingInvPage();
    const purchaseOrderPage = new PurchaseOrderPage();
    invPage.navigateToPOTab();
    purchaseOrderPage.deletePurchaseOrder(td.categoryAttribDeleteTestsPO);
  });

  it("SW_ATR_CLEANUP_03 - Delete Laptop Automation Cat", () => {
    const categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
    categoryPage.clickDelCat(td.laptopCatName);
    categoryPage.assertCatDelete(td.laptopCatName);
  });

  it("SW_ATR_CLEANUP_04 - Delete RAM Automation Cat", () => {
    const categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
    categoryPage.clickDelCat(td.ramCatName);
    categoryPage.assertCatDelete(td.ramCatName);
  });
});

