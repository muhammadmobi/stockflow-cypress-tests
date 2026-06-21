import "cypress-file-upload";
import CategoryPage from "../../pageObjects/CategoryPage";

// ─── Session Helper ────────────────────────────────────────────────────────────

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

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

      // Assert success toast
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);

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

      // Assert success toast
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);

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

      // Remove ALL selected attribute tags
      categoryPage.clearAllProductNameTags();

      // Save the empty configuration
      categoryPage.saveProductNameConfig();
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);
      categoryPage.assertProductNameModalClosed();

      // Reopen and verify the field is now empty
      categoryPage.clickManageProductName(td.laptopCatName);

      categoryPage.assertProductNameFieldEmpty();
      categoryPage.clickCancel();
    },
  );

  it(
    "SW_CAT_PN_12 – Remove Product Name Configuration - RAM Automation Cat",
    { tags: ["@regression"] },
    () => {
      // Open Product Name modal
      categoryPage.clickManageProductName(td.ramCatName);

      // Remove ALL selected attribute tags
      categoryPage.clearAllProductNameTags();

      // Save the empty configuration
      categoryPage.saveProductNameConfig();
      categoryPage.assertToast(td.toastProductNameUpdateSuccess);
      categoryPage.assertProductNameModalClosed();

      // Reopen and verify the field is now empty
      categoryPage.clickManageProductName(td.ramCatName);
      categoryPage.assertProductNameFieldEmpty();
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
      // Open Product Name modal with no attributes selected
      categoryPage.clickManageProductName(td.laptopCatName);

      // Ensure the field is empty (no chips selected)
      categoryPage.assertProductNameFieldEmpty();

      // Click Save with empty configuration
      categoryPage.saveProductNameConfig();

      categoryPage.assertToast(td.toastProductNameUpdateSuccess);
      categoryPage.assertProductNameModalClosed();
    },
  );
});
