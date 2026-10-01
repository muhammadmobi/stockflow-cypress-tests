import "cypress-file-upload";
import CategoryPage from "../../pageObjects/CategoryPage";
import {
  apiEnsureBaseline,
  apiResetProductNameConfig,
  apiSnapshotProductNameConfigs,
  apiRestoreProductNameConfigs,
  apiEnsureAttributeCategory,
} from "../../support/Configuration/apiCleanup.js";

// ─── Session Helper ────────────────────────────────────────────────────────────

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

// ─── Rebuild a CLEAN baseline (purge + rebuild) ─────────────────────────────────
// This suite drives the per-category "Manage Product Name" modal, which lists a
// category's attributes. On a shared/polluted env other specs leave category
// attributes behind (e.g. spec 09's CPU/HDD/Make on Laptop) and pre-existing
// attributes can be mis-associated, so a plain build-missing leaves the dropdown
// showing the wrong options. apiEnsureBaseline PURGES the baseline categories +
// attributes (which removes that pollution by dropping & recreating the category)
// then rebuilds the canonical baseline — verified to restore Brand/Model Number/
// RAMbrand as the correct per-category options. Final teardown: 11-zz.
before(() => {
  loginSession();
  cy.getAuthToken().then((token) => {
    if (!token) return;
    apiEnsureBaseline(token);
    // "MSRP" is defined for both Laptop and RAM with the same fieldName "msrp";
    // the backend allows only one, so the rebuild can leave it on RAM. PN_01
    // expects it in the Laptop dropdown — pin it to Laptop.
    apiEnsureAttributeCategory(token, "MSRP", "Laptop Automation Cat");
    // Capture the REAL product-name configuration before deleting it. These are
    // application configuration rows that drive the background product-name
    // worker, not test fixtures — a suite that removes them must put them back
    // (restored in the after() below).
    apiSnapshotProductNameConfigs(token);

    // The product-name config (a per-category `configs` row) persists across runs
    // even after the baseline rebuild, leaving stale chips that break the dropdown
    // (PN_01/02) and the remove/validation specs (PN_05/12/07). Delete it so every
    // run starts from an empty product-name configuration.
    apiResetProductNameConfig(token);
  });
});

// Put the product-name configuration back. The suite deletes it in the before()
// above to start from an empty naming config; leaving it deleted would silently
// reconfigure the product-name worker for every other suite and for QA users.
//
// Rows whose category no longer exists are skipped, not blindly re-created:
// apiEnsureBaseline recreates the baseline categories with NEW ids, and a config
// keyed to a dead category id is an orphan the UI cannot reach.
after(() => {
  cy.getAuthToken().then((token) => {
    if (!token) return;
    apiRestoreProductNameConfigs(token);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT NAME – Attribute List Verification (SW_CAT_PN_01)
// ─────────────────────────────────────────────────────────────────────────────

describe("PRODUCT NAME – Attribute List Verification (SW_CAT_PN_01)", () => {
  let categoryPage;
  let td;

  before(() => {
    cy.fixture("Configuration/productNameTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_PN_01 – Verify Attribute List in Manage Product Name Modal - Laptop Automation Cat",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Step: Click "Manage Product Name" for Laptop Automation Cat
      categoryPage.clickManageProductName(td.laptopCatName);

      // Open the dropdown to show available attribute options
      categoryPage.openProductNameDropdown();

      const expectedAttributes = td.expectedAttributes;
      expectedAttributes.forEach((attr) => {
        categoryPage.assertDropdownContains(attr);
      });

      const unexpectedAttributes = td.unexpectedAttributes;
      unexpectedAttributes.forEach((attr) => {
        categoryPage.assertDropdownNotContains(attr);
      });
    },
  );
});

// // ─────────────────────────────────────────────────────────────────────────────
// // PRODUCT NAME – Create Configuration (SW_CAT_PN_02, SW_CAT_PN_09)
// // ─────────────────────────────────────────────────────────────────────────────

describe("PRODUCT NAME – Create Configuration (SW_CAT_PN_02, SW_CAT_PN_09)", () => {
  let categoryPage;
  let td;

  before(() => {
    cy.fixture("Configuration/productNameTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_PN_02 – Create Product Name Configuration - Laptop Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal for Laptop Automation Cat
      categoryPage.clickManageProductName(td.laptopCatName);
      categoryPage.openProductNameDropdown();

      categoryPage.selectProductNameAttribute(td.laptopRequiredAttributes[0]);
      categoryPage.selectProductNameAttribute(td.laptopRequiredAttributes[1]);
      categoryPage.selectProductNameAttribute(td.laptopRequiredAttributes[2]);
      // Save the configuration
      categoryPage.saveProductNameConfig();

      // Assert success toast. The global before() DELETES the product-name config,
      // so this first save is a CREATE ("Product name created.") not an update.
      // Accept either so the test is robust if a prior config happened to survive.
      categoryPage.assertToast(/Product name (created|update successfully)\./i);

      // Assert modal closed and user is back on categories list
      categoryPage.assertProductNameModalClosed();
      cy.url({ timeout: 4000 }).should("include", "category");
    },
  );

  it(
    "SW_CAT_PN_09 – Create Product Name Configuration - RAM Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal for RAM Automation Cat
      categoryPage.clickManageProductName(td.ramCatName);

      categoryPage.openProductNameDropdown();

      // Save the configuration
      categoryPage.selectProductNameAttribute(td.ramRequiredAttributes[0]);
      categoryPage.selectProductNameAttribute(td.ramRequiredAttributes[1]);
      categoryPage.selectProductNameAttribute(td.ramRequiredAttributes[2]);

      categoryPage.saveProductNameConfig();

      // Assert success toast. First save after the before() config-delete is a
      // CREATE ("Product name created."); accept update too for robustness.
      categoryPage.assertToast(/Product name (created|update successfully)\./i);

      // // Assert modal closed and user is back on categories list
      // categoryPage.assertProductNameModalClosed();
      cy.url({ timeout: 10000 }).should("include", "category");
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT NAME – Verify Saved Configuration (SW_CAT_PN_03, SW_CAT_PN_10)
// ─────────────────────────────────────────────────────────────────────────────

describe("PRODUCT NAME – Verify Saved Configuration (SW_CAT_PN_03, SW_CAT_PN_10)", () => {
  let categoryPage;
  let td;

  before(() => {
    cy.fixture("Configuration/productNameTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_PN_03 – Verify Saved Product Name Configuration - Laptop Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Reopen the modal to verify previously saved configuration persists
      categoryPage.clickManageProductName(td.laptopCatName);

      // Verify the saved attributes are displayed as tags
      categoryPage.assertProductNameTagVisible(td.laptopRequiredAttributes[0]);
      categoryPage.assertProductNameTagVisible(td.laptopRequiredAttributes[1]);
      categoryPage.assertProductNameTagVisible(td.laptopRequiredAttributes[2]);

      // Close without saving
      categoryPage.clickCancel();
    },
  );

  it(
    "SW_CAT_PN_10 – Verify Saved Product Name Configuration - RAM Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Reopen the modal to verify previously saved configuration persists
      categoryPage.clickManageProductName(td.ramCatName);

      // Verify the saved attributes are displayed as tags
      categoryPage.assertProductNameTagVisible(td.ramRequiredAttributes[0]);
      categoryPage.assertProductNameTagVisible(td.ramRequiredAttributes[1]);
      categoryPage.assertProductNameTagVisible(td.ramRequiredAttributes[2]);

      // Close without saving
      categoryPage.clickCancel();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT NAME – Update Configuration (SW_CAT_PN_04, SW_CAT_PN_11)
// ─────────────────────────────────────────────────────────────────────────────

describe("PRODUCT NAME – Update Configuration (SW_CAT_PN_04, SW_CAT_PN_11)", () => {
  let categoryPage;
  let td;

  before(() => {
    cy.fixture("Configuration/productNameTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_PN_04 – Update Product Name Configuration - Laptop Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.laptopCatName);

      // Remove "Model Number" and "Technical Specifications" tags
      categoryPage.removeProductNameTag(td.laptopRequiredAttributes[1]);
      categoryPage.removeProductNameTag(td.laptopRequiredAttributes[2]);

      // Add "Technical Support Email" attribute
      categoryPage.selectProductNameAttribute(td.laptopUpdateAttribute);

      // Save the updated configuration
      categoryPage.saveProductNameConfig();
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);
      categoryPage.assertProductNameModalClosed();

      // Reopen modal and verify the updated config persists
      categoryPage.clickManageProductName(td.laptopCatName);
      categoryPage.assertProductNameTagVisible(td.laptopRequiredAttributes[0]);
      categoryPage.assertProductNameTagVisible(td.laptopUpdateAttribute);
      categoryPage.clickCancel();
    },
  );

  it(
    "SW_CAT_PN_11 – Update Product Name Configuration - RAM Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.ramCatName);

      // Remove "Memory Generation" and "Compatibility Notes" tags
      categoryPage.removeProductNameTag(td.ramRequiredAttributes[0]);
      categoryPage.removeProductNameTag(td.ramRequiredAttributes[1]);
      categoryPage.removeProductNameTag(td.ramRequiredAttributes[2]);

      // Add "Vendor Contact" attribute
      categoryPage.selectProductNameAttribute(td.ramUpdateAttribute);

      // Save the updated configuration
      categoryPage.saveProductNameConfig();
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);
      categoryPage.assertProductNameModalClosed();

      // Reopen modal and verify updated config
      categoryPage.clickManageProductName(td.ramCatName);
      categoryPage.assertProductNameTagVisible(td.ramUpdateAttribute);
      categoryPage.clickCancel();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT NAME – Remove Configuration (SW_CAT_PN_05, SW_CAT_PN_12)
// ─────────────────────────────────────────────────────────────────────────────

describe("PRODUCT NAME – Remove Configuration (SW_CAT_PN_05, SW_CAT_PN_12)", () => {
  let categoryPage;
  let td;

  before(() => {
    cy.fixture("Configuration/productNameTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_PN_05 – Remove Product Name Configuration - Laptop Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.laptopCatName);

      // Remove ALL selected attribute tags, then attempt to save an empty config.
      categoryPage.clearAllProductNameTags();
      categoryPage.saveProductNameConfig();

      // The product name requires at least one attribute: the app REJECTS an empty
      // configuration with an inline validation error and keeps the modal open —
      // the config cannot be reduced to empty (intended guard, ProductNameForm.tsx).
      categoryPage.assertToast(td.emptyProductNameError);
      categoryPage.assertProductNameModalOpen();
      categoryPage.clickCancel();
    },
  );

  it(
    "SW_CAT_PN_12 – Remove Product Name Configuration - RAM Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.ramCatName);

      // Remove ALL selected attribute tags, then attempt to save an empty config.
      categoryPage.clearAllProductNameTags();
      categoryPage.saveProductNameConfig();

      // Empty configuration is rejected with the required-attribute validation
      // error and the modal stays open (config cannot be emptied).
      categoryPage.assertToast(td.emptyProductNameError);
      categoryPage.assertProductNameModalOpen();
      categoryPage.clickCancel();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT NAME – Add Custom Text Tag (SW_CAT_PN_06, SW_CAT_PN_14)
// ─────────────────────────────────────────────────────────────────────────────

describe("PRODUCT NAME – Add Custom Text Tag (SW_CAT_PN_06, SW_CAT_PN_14)", () => {
  let categoryPage;
  let td;

  before(() => {
    cy.fixture("Configuration/productNameTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_PN_06 – Add Custom Text to Product Name Configuration - Laptop Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.laptopCatName);

      // Add custom tag using POM
      categoryPage.addCustomTextTag(td.gloveSeriesTag);
      categoryPage.saveProductNameConfig();
      // Assert success toast
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);

      // Reopen and verify the custom tag persists
      categoryPage.clickManageProductName(td.laptopCatName);
      categoryPage.assertProductNameTagVisible(td.gloveSeriesTag);
    },
  );
  it(
    "SW_CAT_PN_14 – Add Custom Text to Product Name Configuration - RAM Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.ramCatName);

      // Add custom tag using POM
      categoryPage.addCustomTextTag(td.gamingEditionTag);
      categoryPage.saveProductNameConfig();
      // Assert success toast
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);

      // Reopen and verify the custom tag persists
      categoryPage.clickManageProductName(td.ramCatName);
      categoryPage.assertProductNameTagVisible(td.gamingEditionTag);
    },
  );

  it(
    "Clean Up Test – Custom Text Tag Deletion from Product Name Configuration - Laptop Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.laptopCatName);

      // Remove the "td.gloveSeriesTag" custom tag
      categoryPage.removeProductNameTag(td.gloveSeriesTag);

      // Save the configuration
      categoryPage.saveProductNameConfig();
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);
      categoryPage.assertProductNameModalClosed();

      // Reopen and verify the custom tag is removed
      categoryPage.clickManageProductName(td.laptopCatName);
      categoryPage.assertProductNameTagNotVisible(td.gloveSeriesTag);
      categoryPage.clickCancel();
    },
  );

  it(
    "Clean Up Test –  Custom Text Tag Deletion from Product Name Configuration - RAM Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.ramCatName);

      // Remove the td.gamingEditionTag custom tag
      categoryPage.removeProductNameTag(td.gamingEditionTag);

      // Save the configuration
      categoryPage.saveProductNameConfig();
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);
      categoryPage.assertProductNameModalClosed();

      // Reopen and verify the custom tag is removed
      categoryPage.clickManageProductName(td.ramCatName);
      categoryPage.assertProductNameTagNotVisible(td.gamingEditionTag);
      categoryPage.clickCancel();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT NAME – Validation (SW_CAT_PN_07, SW_CAT_PN_13)
// ─────────────────────────────────────────────────────────────────────────────

describe("PRODUCT NAME – Validation (SW_CAT_PN_07)", () => {
  let categoryPage;
  let td;

  before(() => {
    cy.fixture("Configuration/productNameTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
    categoryPage.navigateToCategories();
  });

  it(
    "SW_CAT_PN_07 – Verify Validation for Empty Product Name Configuration - Laptop Automation Cat",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Open Product Name modal and clear all attributes so the config is empty.
      categoryPage.clickManageProductName(td.laptopCatName);
      categoryPage.clearAllProductNameTags();

      // Click Save with an empty configuration — the app must REJECT it with the
      // "at least one attribute is required" validation error and keep the modal
      // open (no save occurs). This is the intended empty-config validation.
      categoryPage.saveProductNameConfig();

      categoryPage.assertToast(td.emptyProductNameError);
      categoryPage.assertProductNameModalOpen();
      categoryPage.clickCancel();
    },
  );
});
