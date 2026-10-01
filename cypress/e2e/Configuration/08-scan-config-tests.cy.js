import ScanConfigPage from "../../pageObjects/ScanConfigPage.js";
import { apiEnsureBaseline } from "../../support/Configuration/apiCleanup.js";


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
    // Scan-config selects baseline item attributes ("Asset Security Code",
    // "Asset Tag ID"); ensure the baseline exists (build-missing, no purge) so this
    // suite works standalone and in-order even if an earlier spec removed them.
    cy.getAuthToken().then((token) => {
      if (token) apiEnsureBaseline(token);
    });
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

// NOTE: A "Cleanup: Delete POs and Categories" describe block used to live here and deleted the
// shared "Laptop Automation Cat" / "RAM Automation Cat" categories (and their import POs). But
// spec 08 runs BEFORE specs 09 (BrainBox) and 10 (General Config), which both depend on those
// categories — so this premature cleanup collapsed 09/10. All shared-resource teardown is now
// consolidated into the dedicated, alphabetically-last API teardown spec
// `11-zz-teardownConfiguration.cy.js` (cy.request, no UI, runs once after spec 10).

