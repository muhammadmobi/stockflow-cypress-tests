import GeneralConfigPage from "../../pageObjects/GeneralConfigPage";

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

const verifyConfigField = (fieldName, expectedValue) => {
  cy.getAuthToken().then((authToken) => {
    cy.request({
      method: "GET",
      url: `${Cypress.env("API_BASE_URL")}/configs`,
      headers: { Authorization: `Bearer ${authToken}` },
    }).then((resp) => {
      expect(resp.status).to.eq(200);
      // API returns { data: { list: [...] } } — each item has configJson.data with toggle fields
      const list = resp.body.data.list;
      const configRow = list.find((c) => c.id === 1);
      expect(configRow.configJson.data).to.have.property(fieldName, expectedValue);
    });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Product Name Configuration (SW_GEN_CONF_03 – SW_GEN_CONF_07)
//─────────────────────────────────────────────────────────────────────────────

describe("General Config – Product Name Configuration (SW_GEN_CONF_03 – SW_GEN_CONF_07)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigProductNameTestData").then(
      (data) => {
        td = data;
      },
    );
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // ── SW_GEN_CONF_03 ─────────────────────────────────────────────────────────
  it(
    "SW_GEN_CONF_03 – Verify Product Name Config Dropdown Options (Full Attribute List)",
    { tags: ["@smoke"] },
    () => {
      // Clear any tags saved from previous runs so all attributes are visible in the dropdown
      generalConfigPage.clearAllProductNameTags();

      // Open the Product Name dropdown
      generalConfigPage.openProductNameDropdown();

      // Verify all expected common attributes are listed
      td.expectedAttributes.forEach((attr) => {
        generalConfigPage.assertDropdownContains(attr);
      });

      // Verify Cost and Price are NOT listed
      td.unexpectedAttributes.forEach((attr) => {
        generalConfigPage.openProductNameDropdown();
        generalConfigPage.assertDropdownNotContains(attr);
      });
    },
  );

  // ── SW_GEN_CONF_04 ─────────────────────────────────────────────────────────
  it(
    "SW_GEN_CONF_04 – Verify selecting multiple attributes and adding custom text",
    { tags: ["@regression"] },
    () => {
      // Clear any pre-existing tags to ensure a stable starting state
      generalConfigPage.clearAllProductNameTags();

      // Select Display Technology
      generalConfigPage.selectProductNameAttribute(td.selectAttr1);

      // Select Diagonal Size
      generalConfigPage.selectProductNameAttribute(td.selectAttr2);

      // Add custom text '-'
      generalConfigPage.addCustomTextTag(td.customText);

      // Select Storage Solution
      generalConfigPage.selectProductNameAttribute(td.selectAttr3);

      // Verify all four tags are visible in correct order
      generalConfigPage.assertProductNameTagVisible(td.selectAttr1);
      generalConfigPage.assertProductNameTagVisible(td.selectAttr2);
      generalConfigPage.assertProductNameTagVisible(td.customText);
      generalConfigPage.assertProductNameTagVisible(td.selectAttr3);

      // Save the configuration
      generalConfigPage.saveProductNameConfig();
      generalConfigPage.assertToast(td.settingsUpdatedToast);
    },
  );

  // ── SW_GEN_CONF_05 ─────────────────────────────────────────────────────────
  it(
    "SW_GEN_CONF_05 – Verify removing specific attributes from the sequence",
    { tags: ["@regression"] },
    () => {
      // Set up fresh known state: [Display Technology] [Diagonal Size] [-] [Storage Solution]
      generalConfigPage.clearAllProductNameTags();
      generalConfigPage.selectProductNameAttribute(td.selectAttr1);
      generalConfigPage.selectProductNameAttribute(td.selectAttr2);
      generalConfigPage.addCustomTextTag(td.customText);
      generalConfigPage.selectProductNameAttribute(td.selectAttr3);

      // Verify all 4 tags are present before removal
      generalConfigPage.assertProductNameTagVisible(td.selectAttr1);
      generalConfigPage.assertProductNameTagVisible(td.removeAttr);
      generalConfigPage.assertProductNameTagVisible(td.customText);
      generalConfigPage.assertProductNameTagVisible(td.selectAttr3);

      // Remove Diagonal Size
      generalConfigPage.removeProductNameTag(td.removeAttr);

      // Verify remaining tags
      td.tagsAfterRemoval.forEach((tag) => {
        generalConfigPage.assertProductNameTagVisible(tag);
      });

      // Verify removed tag is no longer visible
      generalConfigPage.assertProductNameTagNotVisible(td.removeAttr);

      // Save
      generalConfigPage.saveProductNameConfig();
      generalConfigPage.assertToast(td.settingsUpdatedToast);
    },
  );

  // ── SW_GEN_CONF_06 ─────────────────────────────────────────────────────────
  it(
    "SW_GEN_CONF_06 – Verify Product Name Config with custom text applies and persists",
    { tags: ["@regression"] },
    () => {
      // Set up fresh known state instead of relying on a previous test:
      // [Display Technology] [-] [Storage Solution]
      generalConfigPage.clearAllProductNameTags();
      generalConfigPage.selectProductNameAttribute(td.selectAttr1);
      generalConfigPage.addCustomTextTag(td.customText);
      generalConfigPage.selectProductNameAttribute(td.selectAttr3);
      td.tagsAfterRemoval.forEach((tag) => {
        generalConfigPage.assertProductNameTagVisible(tag);
      });

      // Add custom text "Condition A"
      generalConfigPage.addCustomTextTag(td.customTextForSave);

      // Save the configuration
      generalConfigPage.saveProductNameConfig();
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);

      // Reload the page and verify all tags persist
      generalConfigPage.navigateToGeneralConfig();
      td.tagsAfterCustomSave.forEach((tag) => {
        generalConfigPage.assertProductNameTagVisible(tag);
      });
    },
  );

  // ── SW_GEN_CONF_07 ─────────────────────────────────────────────────────────
  it(
    "SW_GEN_CONF_07 – Verify Updating Product Name Configuration (Replace existing tags)",
    { tags: ["@regression"] },
    () => {
      // Clear all existing tags
      generalConfigPage.clearAllProductNameTags();
      generalConfigPage.assertProductNameFieldEmpty();

      // Select new attribute "Processing Cores"
      generalConfigPage.selectProductNameAttribute(td.replaceNewAttr);

      // Add new custom text "Cores"
      generalConfigPage.addCustomTextTag(td.replaceNewText);

      // Save the configuration
      generalConfigPage.saveProductNameConfig();
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);

      // Reload and verify new tags replaced the old ones
      generalConfigPage.navigateToGeneralConfig();
      td.tagsAfterReplace.forEach((tag) => {
        generalConfigPage.assertProductNameTagVisible(tag);
      });
    },
  );

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.clearAllProductNameTags();
    gcPage.saveProductNameConfig();
    gcPage.assertToast(td.settingsUpdatedToast);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Stock Out Reason Configuration (SW_GEN_CONF_08 – SW_GEN_CONF_10)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Stock Out Reason Configuration (SW_GEN_CONF_08 – SW_GEN_CONF_10)",
  () => {
    let generalConfigPage;
    let td;

    before(() => {
      cy.fixture("Configuration/generalConfigStockOutReasonTestData").then(
        (data) => {
          td = data;
        },
      );
    });

    beforeEach(() => {
      loginSession();
      generalConfigPage = new GeneralConfigPage();
      generalConfigPage.navigateToGeneralConfig();
    });

    // ── SW_GEN_CONF_08 ───────────────────────────────────────────────────────────────────
    it(
      "SW_GEN_CONF_08 – Verify Adding a New Stock Out Reason",
      { tags: ["@smoke"] },
      () => {
        // Ensure the reason doesn't already exist from a previous run
        cy.get("body").then(($body) => {
          if ($body.find(`.MuiChip-root:contains("${td.addReason}")`).length > 0) {
            generalConfigPage.removeStockOutReason(td.addReason);
            generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
          }
        });

        // Type the new reason and press Enter
        generalConfigPage.addStockOutReason(td.addReason);

        // Verify it appears immediately in the Existing Reasons list with a delete icon
        generalConfigPage.assertStockOutReasonExists(td.addReason);
        cy.contains(".MuiChip-root", td.addReason)
          .find(".MuiIconButton-root")
          .should("exist");

        // Verify auto-save toast appears
        generalConfigPage.assertToast(td.settingsUpdatedToast);
      },
    );

    // ── SW_GEN_CONF_09 ───────────────────────────────────────────────────────────────────
    it(
      "SW_GEN_CONF_09 – Verify Removing a Stock Out Reason",
      { tags: ["@regression"] },
      () => {
        // Ensure the reason is present before removal (set up if missing)
        cy.get("body").then(($body) => {
          if ($body.find(`.MuiChip-root:contains("${td.addReason}")`).length === 0) {
            generalConfigPage.addStockOutReason(td.addReason);
            generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
          }
        });

        // Verify it exists before removing
        generalConfigPage.assertStockOutReasonExists(td.addReason);

        // Click the delete (x) icon on the chip
        generalConfigPage.removeStockOutReason(td.addReason);

        // Verify the chip disappears immediately
        generalConfigPage.assertStockOutReasonNotExists(td.addReason);

        // Verify auto-save toast appears
        generalConfigPage.assertToast(td.settingsUpdatedToast);
      },
    );

    // ── SW_GEN_CONF_10 ───────────────────────────────────────────────────────────────────
    it(
      "SW_GEN_CONF_10 – Verify Duplicate Stock Out Reason Prevention",
      { tags: ["@regression"] },
      () => {
        // 'Sold' is a protected, pre-existing reason — try to add it again
        generalConfigPage.assertStockOutReasonExists(td.protectedReason);

        // Type the duplicate reason and press Enter
        generalConfigPage.addStockOutReason(td.duplicateReason);

        // Verify the error toast appears (system prevents the duplicate)
        generalConfigPage.assertToast(td.duplicateToast);

        // Verify only exactly 1 'Sold' chip exists — no duplicate was added
        generalConfigPage.assertStockOutReasonCount(td.protectedReason, 1);
      },
    );

    // ── Cleanup ──────────────────────────────────────────────────────────────
    after(() => {
      // Remove the test reason if it was left behind (e.g. CONF_11/12 ran but not 13)
      loginSession();
      const gcPage = new GeneralConfigPage();
      gcPage.navigateToGeneralConfig();
      cy.get("body").then(($body) => {
        if ($body.find(`.MuiChip-root:contains("AutomationTestReason")`).length > 0) {
          gcPage.removeStockOutReason("AutomationTestReason");
        }
      });
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Scan Entire Inventory Toggle (SW_GEN_CONF_11 – SW_GEN_CONF_12)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Scan Entire Inventory Toggle (SW_GEN_CONF_11 – SW_GEN_CONF_12)",
  () => {
    let generalConfigPage;
    let td;

    before(() => {
      cy.fixture("Configuration/generalConfigScanAllTestData").then((data) => {
        td = data;
      });
    });

    beforeEach(() => {
      loginSession();
      generalConfigPage = new GeneralConfigPage();
      generalConfigPage.navigateToGeneralConfig();
    });

    // ── SW_GEN_CONF_11 ───────────────────────────────────────────────────────
    it(
      "SW_GEN_CONF_11 – Verify Enabling 'Allow Scan Entire Inventory' toggle",
      { tags: ["@smoke"] },
      () => {
        // Verify the toggle label is visible in Feature Controls
        cy.contains(td.toggleLabel).should("be.visible");

        // Force toggle OFF first (ensure a clean enable cycle produces a save event)
        generalConfigPage.disableToggle("enableScanAll");
        generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);

        // Now enable the toggle
        generalConfigPage.enableToggle("enableScanAll");

        // Verify toggle is now in the enabled (checked) state
        generalConfigPage.assertToggleEnabled("enableScanAll");

        // Verify auto-save toast appears
        generalConfigPage.assertToast(td.settingsUpdatedToast);
        verifyConfigField("enableScanAll", true);
      },
    );



    // ── SW_GEN_CONF_12 ───────────────────────────────────────────────────────────────────
    it(
      "SW_GEN_CONF_12 – Verify Disabling 'Allow Scan Entire Inventory' toggle",
      { tags: ["@regression"] },
      () => {
        generalConfigPage.enableToggle("enableScanAll");
        generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
        generalConfigPage.disableToggle("enableScanAll");
        generalConfigPage.assertToggleDisabled("enableScanAll");
        generalConfigPage.assertToast(td.settingsUpdatedToast);
        verifyConfigField("enableScanAll", false);
      },
    );



    // ── Cleanup ──────────────────────────────────────────────────────────────
    after(() => {
      // Restore toggle to enabled state (default) after the test suite
      loginSession();
      const gcPage = new GeneralConfigPage();
      gcPage.navigateToGeneralConfig();
      gcPage.enableToggle("enableScanAll");
    });
  },
);

// // ─────────────────────────────────────────────────────────────────────────────
// // GENERAL CONFIG – Allow Manual Entry Toggle (SW_GEN_CONF_13, SW_GEN_CONF_15)
// // ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Manual Entry Toggle (SW_GEN_CONF_13, SW_GEN_CONF_14)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => { td = d; });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it("SW_GEN_CONF_13 – Verify Enabling 'Allow Manual Entry' toggle", { tags: ["@smoke"] }, () => {
    cy.contains(td.manualEntryToggleLabel).should("be.visible");
    generalConfigPage.disableToggle("allowManualEntries");
    generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
    generalConfigPage.enableToggle("allowManualEntries");
    generalConfigPage.assertToggleEnabled("allowManualEntries");
    generalConfigPage.assertToast(td.settingsUpdatedToast);
    verifyConfigField("allowManualEntries", true);
  });


  it("SW_GEN_CONF_14 – Verify Disabling 'Allow Manual Entry' toggle", { tags: ["@regression"] }, () => {
    generalConfigPage.enableToggle("allowManualEntries");
    generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
    generalConfigPage.disableToggle("allowManualEntries");
    generalConfigPage.assertToggleDisabled("allowManualEntries");
    generalConfigPage.assertToast(td.settingsUpdatedToast);
    verifyConfigField("allowManualEntries", false);
  });


  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("allowManualEntries");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Inventory Stock Out Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Inventory Stock Out Toggle (SW_GEN_CONF_25-SW_GEN_CONF_27)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_25 – Verify Enabling 'Allow Inventory Stock Out' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains("Allow Inventory Stock Out").should("be.visible");
      generalConfigPage.disableToggle("enableInventoryStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("enableInventoryStockOut");
      generalConfigPage.assertToggleEnabled("enableInventoryStockOut");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableInventoryStockOut", true);
    },
  );

  it(
    "SW_GEN_CONF_27 – Verify 'Allow Inventory Stock Out' toggle state persists after page refresh",
    { tags: ["@smoke"] },
    () => {
      // Set known state within this test
      generalConfigPage.enableToggle("enableInventoryStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      // Simulate page refresh by navigating away and back
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      // Assert state persists
      generalConfigPage.assertToggleEnabled("enableInventoryStockOut");
      cy.contains("Allow Inventory Stock Out").should("be.visible");
      verifyConfigField("enableInventoryStockOut", true);
    },
  );

  it(
    "SW_GEN_CONF_26 – Verify Disabling 'Allow Inventory Stock Out' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("enableInventoryStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("enableInventoryStockOut");
      generalConfigPage.assertToggleDisabled("enableInventoryStockOut");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableInventoryStockOut", false);
    },
  );

  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("enableInventoryStockOut");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Inventory Editing Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Inventory Editing Toggle (SW_GEN_CONF_22-SW_GEN_CONF_24)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_22 – Verify Enabling 'Allow Inventory Editing' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains("Allow Inventory Editing").should("be.visible");
      generalConfigPage.disableToggle("allowEditing");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("allowEditing");
      generalConfigPage.assertToggleEnabled("allowEditing");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("allowEditing", true);
    },
  );

  it(
    "SW_GEN_CONF_24 – Verify 'Allow Inventory Editing' toggle state persists after page refresh",
    { tags: ["@smoke"] },
    () => {
      // Set known state within this test
      generalConfigPage.enableToggle("allowEditing");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      // Simulate page refresh by navigating away and back
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      // Assert state persists
      generalConfigPage.assertToggleEnabled("allowEditing");
      cy.contains("Allow Inventory Editing").should("be.visible");
      verifyConfigField("allowEditing", true);
    },
  );

  it(
    "SW_GEN_CONF_23 – Verify Disabling 'Allow Inventory Editing' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("allowEditing");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("allowEditing");
      generalConfigPage.assertToggleDisabled("allowEditing");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("allowEditing", false);
    },
  );

  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("allowEditing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Import/Export of Attributes Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Import/Export of Attributes Toggle (SW_GEN_CONF_19-SW_GEN_CONF_21)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_19 – Verify Enabling 'Allow Import/Export of Attributes' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains("Allow Import/Export of Attributes").should("be.visible");
      generalConfigPage.disableToggle("enableImportExportAttributes");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("enableImportExportAttributes");
      generalConfigPage.assertToggleEnabled("enableImportExportAttributes");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableImportExportAttributes", true);
    },
  );

  it(
    "SW_GEN_CONF_20 – Verify Disabling 'Allow Import/Export of Attributes' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("enableImportExportAttributes");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("enableImportExportAttributes");
      generalConfigPage.assertToggleDisabled("enableImportExportAttributes");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableImportExportAttributes", false);
    },
  );

  it(
    "SW_GEN_CONF_21 -Verify 'Allow Import/Export of Attributes' toggle state persists after page refresh",
    { tags: ["@regression"] },
    () => {
      // Set known state within this test
      generalConfigPage.disableToggle("enableImportExportAttributes");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      // Simulate page refresh by navigating away and back
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      // Assert state persists
      generalConfigPage.assertToggleDisabled("enableImportExportAttributes");
      cy.contains("Allow Import/Export of Attributes").should("be.visible");
      verifyConfigField("enableImportExportAttributes", false);
    },
  );

  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("enableImportExportAttributes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Create Work Order Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Create Work Order Toggle (SW_GEN_CONF_28-SW_GEN_CONF_30)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_28 - Verify Enabling 'Allow Create Work Order' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains("Allow Create Work Order").should("be.visible");
      generalConfigPage.disableToggle("enableCreateWorkOrder");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("enableCreateWorkOrder");
      generalConfigPage.assertToggleEnabled("enableCreateWorkOrder");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableCreateWorkOrder", true);
    },
  );

  it(
    "SW_GEN_CONF_29 - Verify Disabling 'Allow Create Work Order' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("enableCreateWorkOrder");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("enableCreateWorkOrder");
      generalConfigPage.assertToggleDisabled("enableCreateWorkOrder");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableCreateWorkOrder", false);
    },
  );

  it(
    "SW_GEN_CONF_30 - Verify 'Allow Create Work Order' toggle persists after page refresh",
    { tags: ["@regression"] },
    () => {
      // Set known state within this test
      generalConfigPage.disableToggle("enableCreateWorkOrder");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      // Simulate page refresh by navigating away and back
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      // Assert state persists
      generalConfigPage.assertToggleDisabled("enableCreateWorkOrder");
      cy.contains("Allow Create Work Order").should("be.visible");
      verifyConfigField("enableCreateWorkOrder", false);
    },
  );

  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("enableCreateWorkOrder");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Container Location Assignment Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Container Location Assignment Toggle (SW_GEN_CONF_15-SW_GEN_CONF_16)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_15 – Verify Enabling 'Allow Container Location Assignment' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains("Allow Container Location Assignment").should("be.visible");
      generalConfigPage.disableToggle("enableContainerLocationAssignment");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("enableContainerLocationAssignment");
      generalConfigPage.assertToggleEnabled("enableContainerLocationAssignment");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableContainerLocationAssignment", true);
    },
  );

  it(
    "SW_GEN_CONF_16 – Verify Disabling 'Allow Container Location Assignment' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("enableContainerLocationAssignment");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("enableContainerLocationAssignment");
      generalConfigPage.assertToggleDisabled("enableContainerLocationAssignment");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableContainerLocationAssignment", false);
    },
  );

  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.disableToggle("enableContainerLocationAssignment"); // default is disabled
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Single PO Assignment Per Worker Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Single PO Assignment Per Worker Toggle (SW_GEN_CONF_31-SW_GEN_CONF_33)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_31 - Verify Enabling 'Single PO Assignment Per Worker' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains("Single PO Assignment Per Worker").should("be.visible");
      generalConfigPage.disableToggle("enableSinglePoAssignment");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("enableSinglePoAssignment");
      generalConfigPage.assertToggleEnabled("enableSinglePoAssignment");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableSinglePoAssignment", true);
    },
  );

  it(
    "SW_GEN_CONF_32 - Verify Disabling 'Single PO Assignment Per Worker' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("enableSinglePoAssignment");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("enableSinglePoAssignment");
      generalConfigPage.assertToggleDisabled("enableSinglePoAssignment");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enableSinglePoAssignment", false);
    },
  );

  it(
    "SW_GEN_CONF_33 - Verify 'Single PO Assignment Per Worker' Persists after page refresh",
    { tags: ["@regression"] },
    () => {
      // Set known state within this test
      generalConfigPage.disableToggle("enableSinglePoAssignment");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      // Simulate page refresh by navigating away and back
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      // Assert state persists
      generalConfigPage.assertToggleDisabled("enableSinglePoAssignment");
      cy.contains("Single PO Assignment Per Worker").should("be.visible");
      verifyConfigField("enableSinglePoAssignment", false);
    },
  );

  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.disableToggle("enableSinglePoAssignment"); // default is disabled
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Require Purchase Order (PO Number) Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Require Purchase Order (PO Number) Toggle (SW_GEN_CONF_01, SW_GEN_CONF_02)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_01 -Verify Enabling 'Require Purchase Order (PO Number)' toggle",
    { tags: ["@smoke","@regression"] },
    () => {
      cy.contains("Require Purchase Order (PO Number)").should("be.visible");
      generalConfigPage.disableToggle("isPoNumberRequired");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("isPoNumberRequired");
      generalConfigPage.assertToggleEnabled("isPoNumberRequired");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("isPoNumberRequired", true);
    },
  );

  it(
    "SW_GEN_CONF_02 - Verify Disabling 'Require Purchase Order (PO Number)' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("isPoNumberRequired");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("isPoNumberRequired");
      generalConfigPage.assertToggleDisabled("isPoNumberRequired");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("isPoNumberRequired", false);
    },
  );


  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.disableToggle("isPoNumberRequired"); // default is disabled
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Product Upload Without Items Toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Product Upload Without Items Toggle (SW_GEN_CONF_34, SW_GEN_CONF_35)", () => {
  let generalConfigPage;
  let td;
  before(() => {
    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      td = d;
    });
  });
  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  it(
    "SW_GEN_CONF_34 - Verify Enabling 'Allow Product Upload Without Items' toggle",
    { tags: ["@smoke","@regression"] },
    () => {
      cy.contains("Allow Product Upload Without Items").should("be.visible");
      generalConfigPage.disableToggle("allowProductUploadWithoutItems");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("allowProductUploadWithoutItems");
      generalConfigPage.assertToggleEnabled("allowProductUploadWithoutItems");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("allowProductUploadWithoutItems", true);
    },
  );

  it(
    "SW_GEN_CONF_35 - Verify Disabling 'Allow Product Upload Without Items' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("allowProductUploadWithoutItems");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("allowProductUploadWithoutItems");
      generalConfigPage.assertToggleDisabled("allowProductUploadWithoutItems");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("allowProductUploadWithoutItems", false);
    },
  );

  it("SW_GEN_CONF_36 - Verify 'Allow Product Upload Without Items' toggle Persists after page refresh",
    { tags: ["@regression"] },
    () => {
      // Set known state within this test
      generalConfigPage.disableToggle("allowProductUploadWithoutItems");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      // Simulate page refresh by navigating away and back
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      // Assert state persists
      generalConfigPage.assertToggleDisabled("allowProductUploadWithoutItems");
      cy.contains("Allow Product Upload Without Items").should("be.visible");
      verifyConfigField("allowProductUploadWithoutItems", false);
    },
  );

  after(() => {
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("allowProductUploadWithoutItems"); // default is enabled
  });
});
