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
      expect(resp.status, "GET /configs should return 200").to.eq(200);
      const list = resp.body.data.list;
      const configRow = list.find((c) => c.id === 1);
      expect(
        configRow.configJson.data,
        `configJson.data should have field "${fieldName}" = ${expectedValue}`,
      ).to.have.property(fieldName, expectedValue);
    });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Require PO Number for Damaging Products (SW_GEN_CONF_17-18, SW_GEN_CONF_37)
// Fills the existing gap between GEN_CONF_16 and GEN_CONF_19 in spec 10.
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Require PO Number for Damaging Products (SW_GEN_CONF_17-18, SW_GEN_CONF_37)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // State-transition technique: OFF → ON
  it(
    "SW_GEN_CONF_17 – Verify Enabling 'Require PO Number for Damaging Products' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains(td.toggles.enablePoForDamaging.label).should("be.visible");
      generalConfigPage.disableToggle("enablePoForDamaging");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("enablePoForDamaging");
      generalConfigPage.assertToggleEnabled("enablePoForDamaging");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enablePoForDamaging", true);
    },
  );

  // State-transition technique: ON → OFF
  it(
    "SW_GEN_CONF_18 – Verify Disabling 'Require PO Number for Damaging Products' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("enablePoForDamaging");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("enablePoForDamaging");
      generalConfigPage.assertToggleDisabled("enablePoForDamaging");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enablePoForDamaging", false);
    },
  );

  // Use-case technique: persistence across navigation
  it(
    "SW_GEN_CONF_37 – Verify 'Require PO Number for Damaging Products' toggle state persists after page refresh",
    { tags: ["@regression"] },
    () => {
      // Intercept the PATCH so we wait on the actual save (not the toast,
      // which sometimes disappears before the FE refetches the config).
      cy.intercept("PATCH", "**/configs/*").as("saveConfig");
      generalConfigPage.enableToggle("enablePoForDamaging");
      cy.wait("@saveConfig", { timeout: 12000 }).its("response.statusCode").should("be.lessThan", 400);
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      cy.visit("/");
      // Wait on the generalConfig GET so the form has hydrated before assertion
      cy.intercept("GET", "**/configs?**type=general**").as("loadConfig");
      generalConfigPage.navigateToGeneralConfig();
      cy.wait("@loadConfig", { timeout: 12000 });
      generalConfigPage.assertToggleEnabled("enablePoForDamaging");
      cy.contains(td.toggles.enablePoForDamaging.label).should("be.visible");
      verifyConfigField("enablePoForDamaging", true);
    },
  );

  after(() => {
    // enablePoForDamaging defaults to true — restore
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("enablePoForDamaging");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Require PO Number for Stock Out (SW_GEN_CONF_38-40)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Require PO Number for Stock Out (SW_GEN_CONF_38-40)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // State-transition technique: OFF → ON
  it(
    "SW_GEN_CONF_38 – Verify Enabling 'Require PO Number for Stock Out' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains(td.toggles.enablePoForStockOut.label).should("be.visible");
      generalConfigPage.disableToggle("enablePoForStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("enablePoForStockOut");
      generalConfigPage.assertToggleEnabled("enablePoForStockOut");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enablePoForStockOut", true);
    },
  );

  // State-transition technique: ON → OFF
  it(
    "SW_GEN_CONF_39 – Verify Disabling 'Require PO Number for Stock Out' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("enablePoForStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("enablePoForStockOut");
      generalConfigPage.assertToggleDisabled("enablePoForStockOut");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("enablePoForStockOut", false);
    },
  );

  // Use-case technique: persistence across navigation
  it(
    "SW_GEN_CONF_40 – Verify 'Require PO Number for Stock Out' toggle state persists after page refresh",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.disableToggle("enablePoForStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.assertToggleDisabled("enablePoForStockOut");
      cy.contains(td.toggles.enablePoForStockOut.label).should("be.visible");
      verifyConfigField("enablePoForStockOut", false);
    },
  );

  after(() => {
    // enablePoForStockOut defaults to false — restore
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.disableToggle("enablePoForStockOut");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Require Work Order for Stock Out (SW_GEN_CONF_41-43)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Require Work Order for Stock Out (SW_GEN_CONF_41-43)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // State-transition technique: OFF → ON
  it(
    "SW_GEN_CONF_41 – Verify Enabling 'Require Work Order for Stock Out' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains(td.toggles.requireWorkOrderForStockOut.label).should("be.visible");
      generalConfigPage.disableToggle("requireWorkOrderForStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("requireWorkOrderForStockOut");
      generalConfigPage.assertToggleEnabled("requireWorkOrderForStockOut");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("requireWorkOrderForStockOut", true);
    },
  );

  // State-transition technique: ON → OFF
  it(
    "SW_GEN_CONF_42 – Verify Disabling 'Require Work Order for Stock Out' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("requireWorkOrderForStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("requireWorkOrderForStockOut");
      generalConfigPage.assertToggleDisabled("requireWorkOrderForStockOut");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("requireWorkOrderForStockOut", false);
    },
  );

  // Use-case technique: persistence across navigation
  it(
    "SW_GEN_CONF_43 – Verify 'Require Work Order for Stock Out' toggle state persists after page refresh",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.disableToggle("requireWorkOrderForStockOut");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.assertToggleDisabled("requireWorkOrderForStockOut");
      cy.contains(td.toggles.requireWorkOrderForStockOut.label).should("be.visible");
      verifyConfigField("requireWorkOrderForStockOut", false);
    },
  );

  after(() => {
    // requireWorkOrderForStockOut defaults to false — restore
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.disableToggle("requireWorkOrderForStockOut");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Bulk Stock Out (Skip Item Scanning) (SW_GEN_CONF_44-46)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Bulk Stock Out (Skip Item Scanning) (SW_GEN_CONF_44-46)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // State-transition: ON → OFF (default is true)
  it(
    "SW_GEN_CONF_44 – Verify Disabling 'Bulk Stock Out (Skip Item Scanning)' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains(td.toggles.bulkStockOutWithoutScanning.label).should("be.visible");
      generalConfigPage.enableToggle("bulkStockOutWithoutScanning");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("bulkStockOutWithoutScanning");
      generalConfigPage.assertToggleDisabled("bulkStockOutWithoutScanning");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("bulkStockOutWithoutScanning", false);
    },
  );

  // State-transition: OFF → ON
  it(
    "SW_GEN_CONF_45 – Verify Enabling 'Bulk Stock Out (Skip Item Scanning)' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.disableToggle("bulkStockOutWithoutScanning");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("bulkStockOutWithoutScanning");
      generalConfigPage.assertToggleEnabled("bulkStockOutWithoutScanning");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("bulkStockOutWithoutScanning", true);
    },
  );

  // Use-case: persistence after navigation
  it(
    "SW_GEN_CONF_46 – Verify 'Bulk Stock Out' toggle state persists after page refresh",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("bulkStockOutWithoutScanning");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.assertToggleEnabled("bulkStockOutWithoutScanning");
      cy.contains(td.toggles.bulkStockOutWithoutScanning.label).should("be.visible");
      verifyConfigField("bulkStockOutWithoutScanning", true);
    },
  );

  after(() => {
    // bulkStockOutWithoutScanning defaults to true — restore
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("bulkStockOutWithoutScanning");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Auto-move Items Without Confirmation (SW_GEN_CONF_47-48)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Auto-move Items Without Confirmation (SW_GEN_CONF_47-48)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // State-transition: OFF → ON
  it(
    "SW_GEN_CONF_47 – Verify Enabling 'Auto-move Items Without Confirmation' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains(td.toggles.autoMoveOnAssign.label).should("be.visible");
      generalConfigPage.disableToggle("autoMoveOnAssign");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("autoMoveOnAssign");
      generalConfigPage.assertToggleEnabled("autoMoveOnAssign");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("autoMoveOnAssign", true);
    },
  );

  // State-transition: ON → OFF
  it(
    "SW_GEN_CONF_48 – Verify Disabling 'Auto-move Items Without Confirmation' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("autoMoveOnAssign");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("autoMoveOnAssign");
      generalConfigPage.assertToggleDisabled("autoMoveOnAssign");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("autoMoveOnAssign", false);
    },
  );

  after(() => {
    // autoMoveOnAssign defaults to false — restore
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.disableToggle("autoMoveOnAssign");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Allow Exceeding Expected Quantity (SW_GEN_CONF_49-51)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Allow Exceeding Expected Quantity (SW_GEN_CONF_49-51)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // State-transition: OFF → ON
  it(
    "SW_GEN_CONF_49 – Verify Enabling 'Allow Exceeding Expected Quantity' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains(td.toggles.allowExceedExpectedQuantity.label).should("be.visible");
      generalConfigPage.disableToggle("allowExceedExpectedQuantity");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("allowExceedExpectedQuantity");
      generalConfigPage.assertToggleEnabled("allowExceedExpectedQuantity");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("allowExceedExpectedQuantity", true);
    },
  );

  // State-transition: ON → OFF
  it(
    "SW_GEN_CONF_50 – Verify Disabling 'Allow Exceeding Expected Quantity' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("allowExceedExpectedQuantity");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("allowExceedExpectedQuantity");
      generalConfigPage.assertToggleDisabled("allowExceedExpectedQuantity");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("allowExceedExpectedQuantity", false);
    },
  );

  // Use-case: persistence after navigation
  it(
    "SW_GEN_CONF_51 – Verify 'Allow Exceeding Expected Quantity' toggle state persists after page refresh",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.disableToggle("allowExceedExpectedQuantity");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.assertToggleDisabled("allowExceedExpectedQuantity");
      cy.contains(td.toggles.allowExceedExpectedQuantity.label).should("be.visible");
      verifyConfigField("allowExceedExpectedQuantity", false);
    },
  );

  after(() => {
    // allowExceedExpectedQuantity defaults to false — restore
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.disableToggle("allowExceedExpectedQuantity");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Open Items View on Status Click (SW_GEN_CONF_52-54)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Open Items View on Status Click (SW_GEN_CONF_52-54)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // State-transition: ON → OFF (default is true)
  it(
    "SW_GEN_CONF_52 – Verify Disabling 'Open Items View on Status Click' toggle",
    { tags: ["@smoke"] },
    () => {
      cy.contains(td.toggles.statusClickOpensItemsView.label).should("be.visible");
      generalConfigPage.enableToggle("statusClickOpensItemsView");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.disableToggle("statusClickOpensItemsView");
      generalConfigPage.assertToggleDisabled("statusClickOpensItemsView");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("statusClickOpensItemsView", false);
    },
  );

  // State-transition: OFF → ON
  it(
    "SW_GEN_CONF_53 – Verify Enabling 'Open Items View on Status Click' toggle",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.disableToggle("statusClickOpensItemsView");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      generalConfigPage.enableToggle("statusClickOpensItemsView");
      generalConfigPage.assertToggleEnabled("statusClickOpensItemsView");
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("statusClickOpensItemsView", true);
    },
  );

  // Use-case: persistence after navigation
  it(
    "SW_GEN_CONF_54 – Verify 'Open Items View on Status Click' toggle state persists after page refresh",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.enableToggle("statusClickOpensItemsView");
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.assertToggleEnabled("statusClickOpensItemsView");
      cy.contains(td.toggles.statusClickOpensItemsView.label).should("be.visible");
      verifyConfigField("statusClickOpensItemsView", true);
    },
  );

  after(() => {
    // statusClickOpensItemsView defaults to true — restore
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.enableToggle("statusClickOpensItemsView");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Default Low-Stock Alert Threshold (SW_GEN_CONF_55-58)
// BVA on the non-negative integer input field.
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Default Low-Stock Alert Threshold (SW_GEN_CONF_55-58)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // EP valid partition — typical positive integer value
  it(
    "SW_GEN_CONF_55 – Set valid low-stock threshold (EP: valid positive integer)",
    { tags: ["@smoke"] },
    () => {
      generalConfigPage.setLowStockThreshold(td.lowStockThreshold.epValid);
      generalConfigPage.assertLowStockThresholdValue(td.lowStockThreshold.epValid);
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("defaultLowStockThreshold", td.lowStockThreshold.epValid);
    },
  );

  // BVA lower boundary — 0 is valid (min=0)
  it(
    "SW_GEN_CONF_56 – Set low-stock threshold to BVA lower boundary (0)",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.setLowStockThreshold(td.lowStockThreshold.bvaLowerValid);
      generalConfigPage.assertLowStockThresholdValue(td.lowStockThreshold.bvaLowerValid);
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      verifyConfigField("defaultLowStockThreshold", td.lowStockThreshold.bvaLowerValid);
    },
  );

  // EP null partition — clear field disables global threshold
  it(
    "SW_GEN_CONF_57 – Clear low-stock threshold (EP: null disables global alert)",
    { tags: ["@regression"] },
    () => {
      // Set a value first so clearing is meaningful
      generalConfigPage.setLowStockThreshold(td.lowStockThreshold.bvaLowerPlusOne);
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      // Now clear → sends null
      generalConfigPage.clearLowStockThreshold();
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      generalConfigPage.assertLowStockThresholdValue(null);
      verifyConfigField("defaultLowStockThreshold", null);
    },
  );

  // Use-case: persistence across page navigation
  it(
    "SW_GEN_CONF_58 – Verify low-stock threshold value persists after page refresh",
    { tags: ["@regression"] },
    () => {
      generalConfigPage.setLowStockThreshold(td.lowStockThreshold.persistenceValue);
      generalConfigPage.assertToast(td.settingsUpdatedToast);
      generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
      cy.visit("/");
      generalConfigPage.navigateToGeneralConfig();
      generalConfigPage.assertLowStockThresholdValue(td.lowStockThreshold.persistenceValue);
      verifyConfigField("defaultLowStockThreshold", td.lowStockThreshold.persistenceValue);
    },
  );

  after(() => {
    // Restore threshold to null (disabled) after the suite
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    gcPage.clearLowStockThreshold();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CONFIG – Damage Reason Configuration (SW_GEN_CONF_59-61)
// ─────────────────────────────────────────────────────────────────────────────

describe("General Config – Damage Reason Configuration (SW_GEN_CONF_59-61)", () => {
  let generalConfigPage;
  let td;

  before(() => {
    cy.fixture("Configuration/generalConfigExtendedTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    generalConfigPage = new GeneralConfigPage();
    generalConfigPage.navigateToGeneralConfig();
  });

  // EP: valid new reason — happy path
  it(
    "SW_GEN_CONF_59 – Verify Adding a New Damage Reason",
    { tags: ["@smoke"] },
    () => {
      // Intercept the autoSave call so we wait on the actual server round-trip
      // (debounce ~1s + API call) rather than racing the toast which may appear
      // and disappear within Cypress's polling window.
      cy.intercept("PATCH", "**/configs/*").as("damagePatch");

      // Remove the test reason if a prior run left it, and wait for the save.
      cy.get("body").then(($body) => {
        const hasPrior =
          $body.find(`.MuiChip-root:contains("${td.damageReason.addReason}")`).length > 0;
        if (hasPrior) {
          generalConfigPage.removeDamageReason(td.damageReason.addReason);
          cy.wait("@damagePatch", { timeout: 12000 });
          // Re-register the alias so the next wait gets the NEXT request.
          cy.intercept("PATCH", "**/configs/*").as("damagePatch");
        }
      });

      generalConfigPage.addDamageReason(td.damageReason.addReason);
      cy.wait("@damagePatch", { timeout: 12000 }).then(
        (interception) => expect(interception.response.statusCode).to.be.lessThan(400),
      );

      generalConfigPage.assertDamageReasonExists(td.damageReason.addReason);
    },
  );

  // State-transition: remove existing reason
  it(
    "SW_GEN_CONF_60 – Verify Removing a Damage Reason",
    { tags: ["@regression"] },
    () => {
      // Ensure reason exists before removing
      cy.get("body").then(($body) => {
        const exists =
          $body.find(`.MuiChip-root:contains("${td.damageReason.addReason}")`).length > 0;
        if (!exists) {
          generalConfigPage.addDamageReason(td.damageReason.addReason);
          generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
        }
      });

      generalConfigPage.assertDamageReasonExists(td.damageReason.addReason);
      generalConfigPage.removeDamageReason(td.damageReason.addReason);
      generalConfigPage.assertDamageReasonNotExists(td.damageReason.addReason);
      generalConfigPage.assertToast(td.settingsUpdatedToast);
    },
  );

  // Error guessing: duplicate prevention
  it(
    "SW_GEN_CONF_61 – Verify Duplicate Damage Reason Prevention",
    { tags: ["@regression"] },
    () => {
      // Add the reason first
      cy.get("body").then(($body) => {
        const exists =
          $body.find(`.MuiChip-root:contains("${td.damageReason.addReason}")`).length > 0;
        if (!exists) {
          generalConfigPage.addDamageReason(td.damageReason.addReason);
          generalConfigPage.waitForToastToDisappear(td.settingsUpdatedToast);
        }
      });

      // Try to add it again — should show duplicate error
      generalConfigPage.addDamageReason(td.damageReason.duplicateReason);
      generalConfigPage.assertToast(td.damageReason.duplicateToast);

      // Verify only one chip exists (no duplicate was created)
      generalConfigPage.assertDamageReasonCount(td.damageReason.addReason, 1);
    },
  );

  after(() => {
    // Remove the test reason to leave state clean
    loginSession();
    const gcPage = new GeneralConfigPage();
    gcPage.navigateToGeneralConfig();
    cy.get("body").then(($body) => {
      const exists = $body.find(`.MuiChip-root:contains("AutoDamageTestReason")`).length > 0;
      if (exists) {
        gcPage.removeDamageReason("AutoDamageTestReason");
      }
    });
  });
});
