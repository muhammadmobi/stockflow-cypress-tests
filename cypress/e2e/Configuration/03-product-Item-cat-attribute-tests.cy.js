import AttribPage from "../../pageObjects/AttribPage";
import CategoryPage from "../../pageObjects/CategoryPage";

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

// //─── Block 2: Category Setup

describe("Category Setup - Create Laptop Automation Cat (SW_CAT_01 )", () => {
  let categoryPage;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    categoryPage = new CategoryPage();
  });

  it(
    "SW_CAT_01 - Create Category 'Laptop Automation Cat'",
    { tags: ["@smoke", "@regression"] },
    () => {
      categoryPage.navigateToCategories();
      categoryPage.clickAddnewCat();
      categoryPage.typeCatName(catName);
      categoryPage.checkAllowItems();
      categoryPage.clickSaveBt();
      categoryPage.assertCategoryCreatedToast();
      categoryPage.assertCreatedCatagory(catName);
    },
  );
});

// ─── Block 3: Category-Specific Product Attribute - Text (SW_ATR_120 – SW_ATR_122) ─────

describe("Category-Specific Product Attribute - Text (SW_ATR_120 – SW_ATR_122)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product text"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_120 - Add Category-Specific Product Attribute (Text)",
    { tags: ["@smoke", "@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Text");
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_121 - Update Category-Specific Product Attribute Name (Text)",
    { tags: ["@smoke", "@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_122 - Delete Category-Specific Product Attribute (Text)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 4: Category-Specific Product Attribute - Multi Line Text (SW_ATR_123 – SW_ATR_127) ──

describe("Category-Specific Product Attribute - Multi Line Text (SW_ATR_123 – SW_ATR_127)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product multiLineText"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_123 - Add Category-Specific Product Attribute (Multi Line Text)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("MultiLineText");
      attribPage.typeMinLength(td.minLength);
      attribPage.typeMaxLength(td.maxLength);
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
      // Verify saved values
      attribPage.editAttribute(td.name);
      attribPage.assertMinLength(td.minLength);
      attribPage.assertMaxLength(td.maxLength);
      attribPage.clickCancelBt();
    },
  );

  it(
    "SW_ATR_124 - Update Category-Specific Product Attribute Name (Multi Line Text)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_125 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_126 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_127 - Delete Category-Specific Product Attribute (Multi Line Text)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 5: Category-Specific Product Attribute - Number (SW_ATR_128 – SW_ATR_132) ───

describe("Category-Specific Product Attribute - Number (SW_ATR_128 – SW_ATR_132)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product number"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_128 - Add Category-Specific Product Attribute (Number)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Number");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_129 - Update Category-Specific Product Attribute Name (Number)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_130 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_131 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_132 - Delete Category-Specific Product Attribute (Number)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 6: Category-Specific Product Attribute - Email (SW_ATR_133 – SW_ATR_137) ────

describe("Category-Specific Product Attribute - Email (SW_ATR_133 – SW_ATR_137)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product email"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_133 - Add Category-Specific Product Attribute (Email)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Email");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_134 - Update Category-Specific Product Attribute Name (Email)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_135 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_136 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_137 - Delete Category-Specific Product Attribute (Email)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 7: Category-Specific Product Attribute - URL (SW_ATR_138 – SW_ATR_142) ──────

describe("Category-Specific Product Attribute - URL (SW_ATR_138 – SW_ATR_142)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product url"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_138 - Add Category-Specific Product Attribute (URL)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("URL");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_139 - Update Category-Specific Product Attribute Name (URL)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_140 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_141 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_142 - Delete Category-Specific Product Attribute (URL)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 8: Category-Specific Product Attribute - Decimal (SW_ATR_143 – SW_ATR_147) ──

describe("Category-Specific Product Attribute - Decimal (SW_ATR_143 – SW_ATR_147)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product decimal"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_143 - Add Category-Specific Product Attribute (Decimal)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Decimal");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_144 - Update Category-Specific Product Attribute Name (Decimal)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_145 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");

      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_146 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_147 - Delete Category-Specific Product Attribute (Decimal)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 9: Category-Specific Product Attribute - Amount (SW_ATR_148 – SW_ATR_152) ───

describe("Category-Specific Product Attribute - Amount (SW_ATR_148 – SW_ATR_152)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product amount"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_148 - Add Category-Specific Product Attribute (Amount)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Amount");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_149 - Update Category-Specific Product Attribute Name (Amount)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_150 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_151 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_152 - Delete Category-Specific Product Attribute (Amount)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 10: Category-Specific Product Attribute - Percent (SW_ATR_153 – SW_ATR_157) ──

describe("Category-Specific Product Attribute - Percent (SW_ATR_153 – SW_ATR_157)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product percent"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_153 - Add Category-Specific Product Attribute (Percent)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Percent");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_154 - Update Category-Specific Product Attribute Name (Percent)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_155 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_156 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_157 - Delete Category-Specific Product Attribute (Percent)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 11: Category-Specific Product Attribute - List (SW_ATR_158 – SW_ATR_165) ────

describe("Category-Specific Product Attribute - List (SW_ATR_158 – SW_ATR_165)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product list"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_158 - Add Category-Specific Product Attribute (List)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("List");
      attribPage.waitForListRowsToRender();
      attribPage.typeInListRows(td.options);
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
      // Verify list options saved
      attribPage.editAttribute(td.name);
      td.options.forEach((opt, i) => {
        attribPage.assertListOption(i, opt);
      });
      attribPage.clickCancelBt();
    },
  );

  it(
    "SW_ATR_159 - Update Category-Specific Product Attribute Name (List)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_160 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_161 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_163 - Verify Add Row (List) for Category Product Attribute",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.clickAddRow();
      attribPage.typeFirstEmptyListOption(td.addRowOption);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.editAttribute(td.updatedName);
      attribPage.assertListOption(td.options.length, td.addRowOption);
      attribPage.clickCancelBt();
    },
  );

  it(
    "SW_ATR_164 - Verify Bulk Addition (List) for Category Product Attribute",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.clickAddBulkList();
      attribPage.typeBulkAddition(td.bulkOptions);
      attribPage.confirmBulkAddition();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
    },
  );

  it(
    "SW_ATR_165 - Verify Remove Option (List) for Category Product Attribute",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.deleteListOption(0);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
    },
  );

  it(
    "SW_ATR_162 - Delete Category-Specific Product Attribute (List)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 12: Category-Specific Product Attribute - Boolean (SW_ATR_166 – SW_ATR_170) ─

describe("Category-Specific Product Attribute - Boolean (SW_ATR_166 – SW_ATR_170)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat product boolean"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_166 - Add Category-Specific Product Attribute (Boolean)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Boolean");
      attribPage.clickCheckedByDefault();
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_167 - Update Category-Specific Product Attribute Name (Boolean)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_168 - Update Category-Specific Product Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_169 - Update Category-Specific Product Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_170 - Delete Category-Specific Product Attribute (Boolean)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 13: Category-Specific Item Attribute - Text (SW_ATR_171 – SW_ATR_175) ───────

describe("Category-Specific Item Attribute - Text (SW_ATR_171 – SW_ATR_175)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item text"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_171 - Add Category-Specific Item Attribute (Text)",
    { tags: ["@smoke", "@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Text");
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_172 - Update Category-Specific Item Attribute Name (Text)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_173 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_174 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_175 - Delete Category-Specific Item Attribute (Text)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 14: Category-Specific Item Attribute - Multi Line Text (SW_ATR_176 – SW_ATR_180) ──

describe("Category-Specific Item Attribute - Multi Line Text (SW_ATR_176 – SW_ATR_180)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item multiLineText"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_176 - Add Category-Specific Item Attribute (Multi Line Text)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("MultiLineText");
      attribPage.typeMinLength(td.minLength);
      attribPage.typeMaxLength(td.maxLength);
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
      // Verify saved values
      attribPage.editAttribute(td.name);
      attribPage.assertMinLength(td.minLength);
      attribPage.assertMaxLength(td.maxLength);
      attribPage.clickCancelBt();
    },
  );

  it(
    "SW_ATR_177 - Update Category-Specific Item Attribute Name (Multi Line Text)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_178 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_179 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_180 - Delete Category-Specific Item Attribute (Multi Line Text)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 15: Category-Specific Item Attribute - Number (SW_ATR_181 – SW_ATR_185) ─────

describe("Category-Specific Item Attribute - Number (SW_ATR_181 – SW_ATR_185)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item number"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_181 - Add Category-Specific Item Attribute (Number)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Number");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_182 - Update Category-Specific Item Attribute Name (Number)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_183 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_184 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_185 - Delete Category-Specific Item Attribute (Number)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 16: Category-Specific Item Attribute - Email (SW_ATR_186 – SW_ATR_190) ──────

describe("Category-Specific Item Attribute - Email (SW_ATR_186 – SW_ATR_190)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item email"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_186 - Add Category-Specific Item Attribute (Email)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Email");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_187 - Update Category-Specific Item Attribute Name (Email)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_188 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_189 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_190 - Delete Category-Specific Item Attribute (Email)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 17: Category-Specific Item Attribute - URL (SW_ATR_191 – SW_ATR_195) ────────

describe("Category-Specific Item Attribute - URL (SW_ATR_191 – SW_ATR_195)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item url"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_191 - Add Category-Specific Item Attribute (URL)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("URL");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_192 - Update Category-Specific Item Attribute Name (URL)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_193 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_194 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_195 - Delete Category-Specific Item Attribute (URL)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 18: Category-Specific Item Attribute - Decimal (SW_ATR_196 – SW_ATR_200) ────

describe("Category-Specific Item Attribute - Decimal (SW_ATR_196 – SW_ATR_200)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item decimal"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_196 - Add Category-Specific Item Attribute (Decimal)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Decimal");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_197 - Update Category-Specific Item Attribute Name (Decimal)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_198 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_199 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_200 - Delete Category-Specific Item Attribute (Decimal)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 19: Category-Specific Item Attribute - Amount (SW_ATR_201 – SW_ATR_205) ─────

describe("Category-Specific Item Attribute - Amount (SW_ATR_201 – SW_ATR_205)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item amount"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_201 - Add Category-Specific Item Attribute (Amount)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Amount");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_202 - Update Category-Specific Item Attribute Name (Amount)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_203 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_204 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_205 - Delete Category-Specific Item Attribute (Amount)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 20: Category-Specific Item Attribute - Percent (SW_ATR_206 – SW_ATR_210) ────

describe("Category-Specific Item Attribute - Percent (SW_ATR_206 – SW_ATR_210)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item percent"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_206 - Add Category-Specific Item Attribute (Percent)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Percent");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_207 - Update Category-Specific Item Attribute Name (Percent)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_208 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_209 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_210 - Delete Category-Specific Item Attribute (Percent)",
    { tags: ['@regression'] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

//─── Block 21: Category-Specific Item Attribute - List (SW_ATR_211 – SW_ATR_218) ────────────────────

describe("Category-Specific Item Attribute - List (SW_ATR_211 – SW_ATR_218)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item list"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_211 - Add Category-Specific Item Attribute (List)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("List");
      attribPage.waitForListRowsToRender();
      attribPage.typeInListRows(td.options);
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
      // Verify list options saved
      attribPage.editAttribute(td.name);
      td.options.forEach((opt, i) => {
        attribPage.assertListOption(i, opt);
      });
      attribPage.clickCancelBt();
    },
  );

  it(
    "SW_ATR_212 - Update Category-Specific Item Attribute Name (List)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_213 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_214 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_215 - Verify Add Row (List) for Category Item Attribute",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.clickAddRow();
      attribPage.typeFirstEmptyListOption(td.newOption);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
    },
  );

  it(
    "SW_ATR_216 - Verify Bulk Addition (List) for Category Item Attribute",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.clickAddBulkList();
      attribPage.typeBulkAddition(td.bulkOptions);
      attribPage.confirmBulkAddition();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
    },
  );

  it(
    "SW_ATR_217 - Verify Remove Option (List) for Category Item Attribute",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.deleteListOption(0);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
    },
  );

  it(
    "SW_ATR_218 - Delete Category-Specific Item Attribute (List)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// ─── Block 22: Category-Specific Item Attribute - Boolean (SW_ATR_219 – SW_ATR_223) ────────

describe("Category-Specific Item Attribute - Boolean (SW_ATR_219 – SW_ATR_223)", () => {
  let attribPage;
  let td;
  let catName;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      td = data["cat item boolean"];
      catName = data.categoryName;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_219 - Add Category-Specific Item Attribute (Boolean)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.name);
      attribPage.selectType("Boolean");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(td.name);
      attribPage.assertAttributeType(td.name, td.type);
      attribPage.assertAttributeRequired(td.name, td.required);
    },
  );

  it(
    "SW_ATR_220 - Update Category-Specific Item Attribute Name (Boolean)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.name);
      attribPage.editItemName(td.updatedName);
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertAttributeInList(td.updatedName);
    },
  );

  it(
    "SW_ATR_221 - Update Category-Specific Item Attribute (Enable Required)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.clickRequired();
      attribPage.assertRequiredChecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "Yes");
    },
  );

  it(
    "SW_ATR_222 - Update Category-Specific Item Attribute (Disable Required)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.editAttribute(td.updatedName);
      attribPage.assertAttributeNameLoaded(td.updatedName);
      attribPage.disableRequired();
      attribPage.assertRequiredUnchecked();
      attribPage.clickUpdateBt();
      attribPage.assertToast("Attribute updated.");
      attribPage.assertRequiredInList(td.updatedName, "No");
    },
  );

  it(
    "SW_ATR_223 - Delete Category-Specific Item Attribute (Boolean)",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();
      attribPage.assertAttributeInList(td.updatedName);
      attribPage.deleteAttribute(td.updatedName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(td.updatedName);
    },
  );
});

// // ─── Block 24: Validation Tests (SW_ATR_224 – SW_ATR_240) ─────────────────────

describe("Product-Item Category - Validation Tests (SW_ATR_224 – SW_ATR_240)", () => {
  let attribPage;
  let catName;
  let td;
  let vd;

  before(() => {
    cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
      catName = data.categoryName;
      td = data["cat item list"];
      vd = data.itemValidation;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
  });

  it(
    "SW_ATR_224 - Create Product Attribute with Empty Name for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.selectType("Text");
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.emptyNameError);
    },
  );

  it(
    "SW_ATR_225 - Create Duplicate Product Attribute Name for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();

      // Step 1: Create the attribute first
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(vd.duplicateProductAttrName);
      attribPage.selectType("Text");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(vd.duplicateProductAttrName);

      // Step 2: Try to create the same attribute again (duplicate) — should fail
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(vd.duplicateProductAttrName);
      attribPage.selectType("Text");
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.duplicateNameError);
      attribPage.clickCancelBt();

      // // Step 3: Cleanup — delete the attribute
      // attribPage.deleteAttribute(vd.duplicateProductAttrName);
      // attribPage.assertToast("Attribute Deleted");
      // attribPage.assertAttributeNotInList(vd.duplicateProductAttrName);
    },
  );

  it(
    "SW_ATR_226 - Create Duplicate Item Attribute Name for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();

      // Step 1: Create the attribute first
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(vd.duplicateItemAttrName);
      attribPage.selectType("Text");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(vd.duplicateItemAttrName);

      // Step 2: Try to create the same attribute again (duplicate) — should fail
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(vd.duplicateItemAttrName);
      attribPage.selectType("Text");
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.duplicateNameError);
      attribPage.clickCancelBt();

      // Step 3: Cleanup — delete the attribute
      attribPage.deleteAttribute(vd.duplicateItemAttrName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(vd.duplicateItemAttrName);
    },
  );

  it(
    "SW_ATR_227 - Create Multi Line Text Attribute with Max Length > 2000 for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("MLT Max Length Test");
      attribPage.selectType("MultiLineText");
      cy.wait(500);
      attribPage.typeMaxLength(vd.invalidMLTMaxLength);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.mltMaxLengthError);
    },
  );

  it(
    "SW_ATR_228 - Create Multi Line Text with Min Length > Max Length for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("MLT Min Max Test");
      attribPage.selectType("MultiLineText");
      cy.wait(500);
      attribPage.typeMinLength(vd.invalidMLTMinLength);
      attribPage.typeMaxLength(vd.invalidMLTMaxLengthForMin);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.mltMinMaxError);
    },
  );

  it(
    "SW_ATR_229 - Create Number Attribute with Max Value Exceeding System Limit for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("Number Max Test");
      attribPage.selectType("Number");
      attribPage.typeMaxValue(vd.invalidNumberMaxValue);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.numberMaxValueError);
    },
  );

  it(
    "SW_ATR_230 - Create Email Attribute with Invalid Default Value Format for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("Email Default Test");
      attribPage.selectType("Email");
      attribPage.typeDefaultValue(vd.invalidEmailDefault);
      attribPage.clickSaveBt();
      attribPage.assertNoToast("Attribute Created");
    },
  );

  it(
    "SW_ATR_231 - Create URL Attribute with Invalid Default Value Format for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("URL Default Test");
      attribPage.selectType("URL");
      attribPage.typeDefaultValue(vd.invalidUrlDefault);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.urlDefaultError);
    },
  );

  it(
    "SW_ATR_232 - Create List Attribute with No Options for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(vd.emptyListName);
      attribPage.selectType("List");
      attribPage.waitForListRowsToRender();
      attribPage.deleteListOption(0);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.emptyListError2);
    },
  );

  it(
    "SW_ATR_233 - Verify Bulk Addition with Empty String for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickItemAttributes();

      // Step 1: Create a list attribute as prerequisite
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(vd.bulkTestListName);
      attribPage.selectType("List");
      attribPage.waitForListRowsToRender();
      attribPage.typeInListRows(vd.bulkTestListOptions);
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(vd.bulkTestListName);

      // Step 2: Edit and try bulk addition with empty string
      attribPage.editAttribute(vd.bulkTestListName);
      attribPage.clickAddBulkList();
      attribPage.confirmBulkAddition();
      // Empty bulk addition — modal should remain open
      attribPage.assertBulkAdditionModalOpen();

      // Close the modal and cancel the form
      attribPage.closeBulkAdditionModal();
      attribPage.clickCancelBt();

      // Step 3: Cleanup — delete the list attribute
      attribPage.deleteAttribute(vd.bulkTestListName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.assertAttributeNotInList(vd.bulkTestListName);
    },
  );

  it(
    'SW_ATR_234 - Delete Default Required Attribute "Category" for Product-Item Category',
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      // "Category" is a default required attribute — delete button should be disabled
      attribPage.assertDeleteDisabled("Category");
    },
  );

  it(
    'SW_ATR_235 - Delete Default Required Attribute "Quantity" for Product-Item Category',
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      // "Quantity" is a default required product attribute — delete button should be disabled
      attribPage.assertDeleteDisabled("Quantity");
    },
  );

  it(
    "SW_ATR_236 - Update Attribute Name to Empty String for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();

      // Step 1: Create a temp attribute to test empty name update
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(vd.tempAttrName);
      attribPage.selectType("Text");
      attribPage.clickSaveBt();
      attribPage.assertToast("Attribute created.");
      attribPage.assertAttributeInList(vd.tempAttrName);

      // Step 2: Try to update name to empty string
      attribPage.editAttribute(vd.tempAttrName);
      attribPage.clearAttributeName();
      attribPage.clickUpdateBt();
      attribPage.assertValidationError(vd.emptyNameError);
      attribPage.clickCancelBt();
    },
  );

  it(
    "SW_ATR_237 - Update Attribute Name to Duplicate Name for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();

      // Step 2: Try to rename the temp attribute to "Model Number" (duplicate) — should fail
      attribPage.editAttribute(vd.tempAttrName);
      attribPage.assertAttributeNameLoaded(vd.tempAttrName);
      attribPage.editItemName(vd.duplicateProductAttrName);
      attribPage.clickUpdateBt();
      attribPage.assertValidationError(vd.duplicateNameError);
      attribPage.clickCancelBt();

      // Step 4: Cleanup — delete both attributes
      attribPage.deleteAttribute(vd.tempAttrName);
      attribPage.assertToast("Attribute Deleted");
      attribPage.deleteAttribute(vd.duplicateProductAttrName);
      attribPage.assertToast("Attribute Deleted");
    },
  );

  it(
    "SW_ATR_238 - Create Decimal Attribute with Invalid Default Value for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("Decimal Default Test");
      attribPage.selectType("Decimal");
      attribPage.typeDefaultValue(vd.invalidDecimalDefault);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.decimalDefaultError);
    },
  );

  it(
    "SW_ATR_239 - Create Amount Attribute with Negative Default Value for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("Amount Negative Test");
      attribPage.selectType("Amount");
      attribPage.typeDefaultValue(vd.negativeAmountDefault);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.amountNegativeError);
    },
  );

  it(
    "SW_ATR_240 - Create Percent Attribute with Default Value > 100 for Product-Item Category",
    { tags: ["@regression"] },
    () => {
      attribPage.navigateToCategoryAttributes(catName);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName("Percent Over 100 Test");
      attribPage.selectType("Percent");
      attribPage.typeDefaultValue(vd.percentOver100Default);
      attribPage.clickSaveBt();
      attribPage.assertValidationError(vd.percentOver100Error);
    },
  );

  

  });

  // //─── Cleanup: Delete Test Categories and Common Attributes  ───────────────────────────────────────

  describe("SW_ATR Restriction Tests - Cleanup: Delete Test Categories and Common Attributes", () => {
      let td;

      before(() => {
          cy.fixture("Configuration/attributeDeletionTestData").then((data) => {
              td = data;
          });
      });

      beforeEach(() => {
          loginSession();
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

      // it("SW_ATR_CLEANUP_05 - Delete All Common Attributes (Product and Item)", () => {
      //     const attribPage = new AttribPage();

      //     cy.fixture("Configuration/commonAttributeTestData").then((data) => {
      //         const commonProductAttrs = extractAttrNames(data, "common ");
      //         const commonItemAttrs = extractAttrNames(data, "item ");

      //         // Delete common product attributes
      //         attribPage.clickAttribOption();
      //         attribPage.clickProductAttributes();

      //         cy.wrap(Object.values(commonProductAttrs)).each((attrName) => {
      //             attribPage.tryDeleteAttribute(attrName);
      //         });

      //         // Delete common item attributes
      //         attribPage.clickItemAttributes();

      //         cy.wrap(Object.values(commonItemAttrs)).each((attrName) => {
      //             attribPage.tryDeleteAttribute(attrName);
      //         });
      //     });
      // });
   });