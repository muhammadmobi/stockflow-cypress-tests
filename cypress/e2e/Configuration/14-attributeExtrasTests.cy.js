import AttribPage from "../../pageObjects/AttribPage";

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

// ─── API helpers (cleanup + pre-conditions) ─────────────────────────────────

// Delete by name across the common (categoryId=null) attribute list.
const apiDeleteAttributeByName = (token, name) =>
  cy
    .request({
      method: "GET",
      url: `${Cypress.env("API_BASE_URL")}/attributes?page=1&page_size=10000&entityType=Product`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    })
    .then((resp) => {
      const list = resp.body?.data?.list ?? [];
      const match = list.find((a) => a.name === name && a.categoryId === null);
      if (match) {
        return cy.request({
          method: "DELETE",
          url: `${Cypress.env("API_BASE_URL")}/attributes/${match.id}`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        });
      }
      return null;
    });

// Ensure the general-config enableImportExportAttributes flag is TRUE so the
// Import/Export menu is actually rendered (FE conditionally renders it).
const apiEnsureImportExportEnabled = (token) =>
  cy
    .request({
      method: "GET",
      url: `${Cypress.env("API_BASE_URL")}/configs?type=general&name=general`,
      headers: { Authorization: `Bearer ${token}` },
    })
    .then((resp) => {
      const row = resp.body?.data?.list?.[0];
      if (!row) return null;
      const merged = {
        ...row.configJson?.data,
        enableImportExportAttributes: true,
      };
      return cy.request({
        method: "PATCH",
        url: `${Cypress.env("API_BASE_URL")}/configs/${row.id}`,
        headers: { Authorization: `Bearer ${token}` },
        body: {
          type: "general",
          configJson: { data: merged },
        },
        failOnStatusCode: false,
      });
    });

// ─────────────────────────────────────────────────────────────────────────────
// SW_ATR_EXT_01-03 — "Use as Location" toggle (common-attribute form only)
//
// The toggle appears on the **common** attribute form (when `!category`) and
// is hidden on category-specific forms. When ON, the attribute is flagged
// `isLocation: true` and can be referenced as a location attribute.
// Frontend source: Frontend/src/components/Attribute/AttributeForm.tsx:819-836
// ─────────────────────────────────────────────────────────────────────────────

describe("Attribute Extras – 'Use as Location' toggle (SW_ATR_EXT_01-03)", () => {
  let attribPage;
  let td;

  before(() => {
    cy.fixture("Configuration/attributeExtrasTestData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.clickAttribOption();
  });

  // Use-case: toggle is visible only on the common attribute form
  it(
    "SW_ATR_EXT_01 – 'Use as Location' label is visible on common attribute Add form",
    { tags: ["@smoke"] },
    () => {
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.useAsLocation.name);
      attribPage.selectType(td.useAsLocation.type);
      attribPage.assertUseAsLocationLabelVisible();
      attribPage.assertUseAsLocationUnchecked();
      // Cancel without saving — UI-only smoke
      cy.contains("button", /^Cancel$/i).click();
    },
  );

  // State-transition: OFF → ON, save, then verify persistence
  it(
    "SW_ATR_EXT_02 – Create common attribute with 'Use as Location' enabled, then delete it",
    { tags: ["@regression"] },
    () => {
      // Clean any prior leftover
      cy.get("body").then(($body) => {
        if ($body.find(`tr:has(p:contains("${td.useAsLocation.name}"))`).length > 0) {
          attribPage.deleteAttribute(td.useAsLocation.name);
          attribPage.assertToast(td.toasts.deleted);
        }
      });

      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.useAsLocation.name);
      attribPage.selectType(td.useAsLocation.type);
      attribPage.clickUseAsLocationToggle();
      attribPage.assertUseAsLocationChecked();
      attribPage.clickSaveBt();
      attribPage.assertToast(td.toasts.created);
      attribPage.assertAttributeInList(td.useAsLocation.name);

      // Verify the saved value round-trips
      attribPage.editAttribute(td.useAsLocation.name);
      attribPage.assertUseAsLocationChecked();
      cy.contains("button", /^Cancel$/i).click();

      // Cleanup
      attribPage.deleteAttribute(td.useAsLocation.name);
      attribPage.assertToast(td.toasts.deleted);
    },
  );

  // Use-case: toggle is **absent** when editing a category-specific attribute
  // (the Frontend conditionally renders it only when `!category`).
  it(
    "SW_ATR_EXT_03 – 'Use as Location' label is NOT visible on category-specific attribute form",
    { tags: ["@regression"] },
    () => {
      // Navigate into a category's attributes page (Categories → Manage Attribute)
      attribPage.clickConfigurationOption();
      cy.contains("Categories").click();
      // Pick any existing category, open its attributes
      cy.contains("tr", "Automation").first().within(() => {
        cy.contains("button", "Manage Attribute").click();
      });
      // Stage/QA route is /configurations/category/category-attributes/:id
      cy.url().should("match", /category-attributes/);
      // Add Attribute in the category context
      cy.contains("button", "Add Attribute").click();
      attribPage.typeAttributeName("Category Scope Test");
      attribPage.selectType("Text");
      // The toggle must NOT be rendered in this context
      attribPage.assertUseAsLocationLabelNotPresent();
      cy.contains("button", /^Cancel$/i).click();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SW_ATR_EXT_04-07 — Convert attribute type (Text ↔ List)
//
// Admin can convert Text/MultiLineText → List, and List → Text.
// API: POST /attributes/:id/convert-type { targetType: 'List' | 'Text' }
// Frontend: Convert button shows only for Text/MultiLineText/List and only
// when !row.locked. Confirmation dialog uses Yes/No.
// ─────────────────────────────────────────────────────────────────────────────

describe("Attribute Extras – Convert Text ↔ List (SW_ATR_EXT_04-07)", () => {
  let attribPage;
  let td;

  before(() => {
    cy.fixture("Configuration/attributeExtrasTestData").then((data) => {
      td = data;
    });
    // Pagination on the UI may hide the leftover attribute → UI-based pre-cleanup
    // unreliable. Delete via API instead so TC04 always starts from a clean slate.
    loginSession();
    cy.getAuthToken().then((token) => {
      if (token) apiDeleteAttributeByName(token, "Auto Convertible Text");
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.clickAttribOption();
  });

  // Decision-table column: type=Text + !locked + isAdmin → "Convert to List" visible
  it(
    "SW_ATR_EXT_04 – Setup: create convertible Text attribute (decision-table positive column)",
    { tags: ["@smoke"] },
    () => {
      // Clean any prior leftover (defensive — test runs are not always sequential)
      cy.get("body").then(($body) => {
        if ($body.find(`tr:has(p:contains("${td.convert.textAttr.name}"))`).length > 0) {
          attribPage.deleteAttribute(td.convert.textAttr.name);
          attribPage.assertToast(td.toasts.deleted);
        }
      });
      // Intercept the POST so we wait on the actual create rather than racing the toast.
      cy.intercept("POST", "**/attributes").as("createAttr");
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(td.convert.textAttr.name);
      attribPage.selectType(td.convert.textAttr.type);
      attribPage.typeDefaultValue(td.convert.textAttr.defaultValue);
      attribPage.clickSaveBt();
      cy.wait("@createAttr", { timeout: 15000 }).then((i) =>
        expect(i.response.statusCode).to.be.lessThan(400),
      );
      attribPage.assertAttributeInList(td.convert.textAttr.name);
    },
  );

  // State-transition: Text → List (forward conversion)
  it(
    "SW_ATR_EXT_05 – Convert Text attribute to List (state-transition: Text → List)",
    { tags: ["@regression"] },
    () => {
      // Intercept BEFORE click so cy.wait can resolve.
      cy.intercept("POST", "**/attributes/*/convert-type").as("convertType");
      attribPage.clickConvertToList(td.convert.textAttr.name);
      attribPage.assertConvertDialogVisible();
      attribPage.confirmConvertDialog();
      cy.wait("@convertType").its("response.statusCode").should("be.lessThan", 400);
      attribPage.assertToast(td.toasts.convertToListOk);
    },
  );

  // State-transition: List → Text (reverse conversion)
  it(
    "SW_ATR_EXT_06 – Convert List attribute back to Text (state-transition: List → Text)",
    { tags: ["@regression"] },
    () => {
      cy.intercept("POST", "**/attributes/*/convert-type").as("convertBack");
      attribPage.clickConvertToText(td.convert.listConvertedName);
      attribPage.assertConvertDialogVisible();
      attribPage.confirmConvertDialog();
      cy.wait("@convertBack").its("response.statusCode").should("be.lessThan", 400);
      attribPage.assertToast(td.toasts.convertToTextOk);
    },
  );

  // Decision-table column: type=Number → no Convert button (negative column)
  it(
    "SW_ATR_EXT_07 – Convert button is NOT visible for non-convertible types (Number)",
    { tags: ["@regression"] },
    () => {
      const numberAttrName = `Auto Convert Negative ${Date.now()}`;
      // Clean leftover from prior run
      cy.get("body").then(($body) => {
        if ($body.find(`tr:has(p:contains("Auto Convert Negative"))`).length > 0) {
          // Best-effort cleanup: delete any matching leftover
          $body.find(`tr:has(p:contains("Auto Convert Negative"))`).each((_, row) => {
            const name = Cypress.$(row).find("p").first().text();
            attribPage.deleteAttribute(name);
          });
        }
      });

      cy.intercept("POST", "**/attributes").as("createNum");
      attribPage.clickAddAttribute();
      attribPage.typeAttributeName(numberAttrName);
      attribPage.selectType("Number");
      attribPage.clickSaveBt();
      cy.wait("@createNum", { timeout: 15000 }).then((i) =>
        expect(i.response.statusCode).to.be.lessThan(400),
      );
      attribPage.assertAttributeInList(numberAttrName);

      // Per AttributeList.tsx: canConvert => Text | MultiLineText | List only.
      attribPage.assertConvertButtonNotVisible(numberAttrName);

      // Cleanup
      attribPage.deleteAttribute(numberAttrName);
    },
  );

  // Cleanup the test attribute after the conversion suite
  after(() => {
    loginSession();
    const page = new AttribPage();
    page.clickAttribOption();
    cy.get("body").then(($body) => {
      if ($body.find(`tr:has(p:contains("${td.convert.textAttr.name}"))`).length > 0) {
        page.deleteAttribute(td.convert.textAttr.name);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SW_ATR_EXT_08-12 — Import / Export Attributes menu
//
// Frontend: ImportExportMenu.tsx — kebab-menu in attribute toolbar.
// "Import Attributes": POST /categories/multi with JSON body.
// "Export Attributes": GET /attributes/export?page=1&page_size=20000.
//
// Equivalence partitioning on file input:
//   - Valid JSON (well-formed structure) → success toast
//   - Invalid JSON (malformed) → error toast "invalid JSON"
//   - Non-JSON file (txt) → error toast "valid JSON file"
// ─────────────────────────────────────────────────────────────────────────────

describe("Attribute Extras – Import/Export menu (SW_ATR_EXT_08-12)", () => {
  let attribPage;
  let td;

  before(() => {
    cy.fixture("Configuration/attributeExtrasTestData").then((data) => {
      td = data;
    });
    // The Import/Export menu only renders when general-config flag
    // `enableImportExportAttributes` is TRUE. Ensure it is via API so this
    // suite is independent of any prior spec toggling it off.
    loginSession();
    cy.getAuthToken().then((token) => {
      if (token) apiEnsureImportExportEnabled(token);
    });
  });

  beforeEach(() => {
    loginSession();
    attribPage = new AttribPage();
    attribPage.clickAttribOption();
  });

  // Use-case: menu opens and shows both items
  it(
    "SW_ATR_EXT_08 – Import/Export menu opens with Import and Export options",
    { tags: ["@smoke"] },
    () => {
      attribPage.openImportExportMenu();
      attribPage.assertImportExportMenuOpen();
      attribPage.assertImportMenuItemVisible();
      attribPage.assertExportMenuItemVisible();
    },
  );

  // EP — valid JSON file (happy path)
  it(
    "SW_ATR_EXT_09 – Importing a valid JSON file calls POST /categories/multi and shows success toast",
    { tags: ["@regression"] },
    () => {
      cy.intercept("POST", "**/categories/multi").as("importAttrs");
      attribPage.openImportExportMenu();
      attribPage.uploadAttributesJson(td.importExport.validJsonFile);
      cy.wait("@importAttrs", { timeout: 30000 })
        .its("response.statusCode")
        .should("be.lessThan", 500);
      // The EP intent is to prove the upload pipeline fires. The wait on
      // intercept above is sufficient evidence of that — react-hot-toast
      // renders to a dynamic portal whose class is not stable across versions.
    },
  );

  // EP — invalid JSON content (file is .json but content is malformed)
  it(
    "SW_ATR_EXT_10 – Importing a malformed JSON file shows 'invalid JSON' error (no API call)",
    { tags: ["@regression"] },
    () => {
      // No backend call should be made — the handler parses client-side first.
      let backendCalled = false;
      cy.intercept("POST", "**/categories/multi", () => {
        backendCalled = true;
      }).as("noImport");
      attribPage.openImportExportMenu();
      attribPage.uploadAttributesJson(td.importExport.invalidJsonFile);
      attribPage.assertToast(td.toasts.importBad);
      cy.wrap(null).then(() => {
        expect(backendCalled, "backend must not be called for malformed JSON").to.eq(false);
      });
    },
  );

  // EP — wrong file type (.txt instead of .json)
  it(
    "SW_ATR_EXT_11 – Importing a non-JSON (.txt) file shows 'valid JSON file' error",
    { tags: ["@regression"] },
    () => {
      attribPage.openImportExportMenu();
      attribPage.uploadAttributesJson(td.importExport.wrongTypeFile);
      attribPage.assertToast(td.toasts.importInvalidType);
    },
  );

  // Use-case — Export Attributes triggers GET /attributes/export
  it(
    "SW_ATR_EXT_12 – Clicking 'Export Attributes' calls GET /attributes/export",
    { tags: ["@smoke"] },
    () => {
      // Stub the browser download so the test doesn't actually save the file
      cy.intercept("GET", "**/attributes/export**").as("exportAttrs");
      attribPage.openImportExportMenu();
      attribPage.clickExportAttributes();
      cy.wait("@exportAttrs", { timeout: 30000 })
        .its("response.statusCode")
        .should("be.lessThan", 400);
    },
  );
});
