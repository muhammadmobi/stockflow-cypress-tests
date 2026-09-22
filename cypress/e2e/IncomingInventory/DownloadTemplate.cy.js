import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import { importAttributesAndCategories } from "../../support/helpers/attributeHelpers";

/**
 * Download Template Tests
 * Covers: SW_DT_001 – SW_DT_006
 *
 * Each download test (004-006) performs the full UI flow and then verifies
 * the downloaded Excel file's column headers contain the correct attributes:
 *
 * RAM (Product-Only):
 *   ✓ Common Product attrs + RAM-specific Product attrs
 *   ✗ Must NOT contain any Item attrs (common or category-specific)
 *
 * Laptop (Product+Item):
 *   ✓ Common Product + Common Item + Laptop Product + Laptop Item attrs
 *
 * General:
 *   ✓ All unique attribute names across every category
 *
 * Backend: GET /excel/download[?category=<name>]
 * Frontend: Header #long-button → "Download Template" → dialog → select → download
 */
describe("Download Template Tests (SW_DT_001 – SW_DT_006)", () => {
  let incomingInvPage;
  let td;

  // ---------------------------------------------------------------------------
  // Helper: Build the API base URL from Cypress baseUrl
  // ---------------------------------------------------------------------------
  function getApiBase() {
    const rawBase = Cypress.config("baseUrl").replace(/\/$/, "");
    return rawBase.replace("://", "://api.");
  }

  // ---------------------------------------------------------------------------
  // Helper: Open the Download Template dialog from the header action menu
  // ---------------------------------------------------------------------------
  function openDownloadTemplateDialog() {
    incomingInvPage.clickHeaderActionMenu();
    cy.contains("Download Template").should("be.visible").click();
    cy.findByRole("dialog").should("be.visible");
  }

  // ---------------------------------------------------------------------------
  // Helper: Select a template option from the react-select dropdown
  // ---------------------------------------------------------------------------
  function selectTemplateOption(templateLabel) {
    cy.findByRole("dialog").within(() => {
      cy.get('[class*="-control"]').first().click({ force: true });
    });
    // Wait for the react-select menu to appear in the portal
    cy.get('.select__menu').should('be.visible');
    cy.get('.select__option').contains(templateLabel).click({ force: true });
  }

  // ---------------------------------------------------------------------------
  // Helper: Click the "Download Template" button inside the dialog card
  // ---------------------------------------------------------------------------
  function clickDownloadButton() {
    cy.findByRole("dialog")
      .find("button")
      .contains("Download Template")
      .should("not.be.disabled")
      .click();
  }

  // ---------------------------------------------------------------------------
  // Helper: Download a template via UI and verify its Excel headers
  //
  //  1. UI flow: open dialog → select → intercept API → click Download
  //  2. Verify 200 response + success toast
  //  3. Call the same endpoint via cy.request → parse Excel → assert headers
  //
  //  mustInclude  — arrays of header names that MUST be present
  //  mustNotInclude — arrays of header names that must NOT be present
  // ---------------------------------------------------------------------------
  function downloadAndVerifyHeaders({
    templateLabel,
    categoryQueryParam,
    mustInclude,
    mustNotInclude,
  }) {
    // — UI download flow —
    openDownloadTemplateDialog();

    const interceptAlias = categoryQueryParam
      ? "downloadCategory"
      : "downloadGeneral";
    const interceptPattern = categoryQueryParam
      ? "**/excel/download?category=*"
      : "**/excel/download";

    cy.intercept("GET", interceptPattern).as(interceptAlias);

    selectTemplateOption(templateLabel);
    clickDownloadButton();

    cy.wait(`@${interceptAlias}`, { timeout: 15000 }).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.headers["content-type"]).to.include("spreadsheetml");
    });

    cy.contains(td.successMessages.downloadStarted, {
      timeout: 10000,
    }).should("exist");

    // — Verify actual Excel headers via API —
    cy.getAuthToken().then((token) => {
      const apiBase = getApiBase();
      const requestOptions = {
        url: `${apiBase}/excel/download`,
        headers: { Authorization: `Bearer ${token}` },
        encoding: "base64",
      };
      if (categoryQueryParam) {
        requestOptions.qs = { category: categoryQueryParam };
      }

      cy.request(requestOptions).then((response) => {
        expect(response.status).to.eq(200);

        cy.task("parseExcelHeaders", { base64Data: response.body }).then(
          (headers) => {
            cy.log(
              `Downloaded headers (${headers.length}): ${headers.join(", ")}`,
            );
            expect(headers).to.have.length.greaterThan(0);

            // Flatten all mustInclude arrays and verify each header is present
            const allMustInclude = mustInclude.flat();
            allMustInclude.forEach((header) => {
              expect(headers, `should include "${header}"`).to.include(header);
            });

            // Flatten all mustNotInclude arrays and verify each is absent
            if (mustNotInclude && mustNotInclude.length > 0) {
              const allMustNotInclude = mustNotInclude.flat();
              allMustNotInclude.forEach((header) => {
                expect(
                  headers,
                  `should NOT include "${header}"`,
                ).to.not.include(header);
              });
            }
          },
        );
      });
    });
  }

  // ---------------------------------------------------------------------------
  // before() — fixture → session → ensure categories exist
  // ---------------------------------------------------------------------------
  before(() => {
    cy.fixture("downloadTemplateData").then((data) => {
      td = data;

      cy.authSession('admin');
      cy.visit("/");

      cy.getAuthToken().then((token) => {
        const apiBase = getApiBase();
        [
          { name: td.categories.ram, allowItems: false },
          { name: td.categories.laptop, allowItems: true },
        ].forEach(({ name, allowItems }) => {
          cy.request({
            method: "POST",
            url: `${apiBase}/categories`,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: {
              name,
              description: "...",
              allowItems,
              allowVariants: false,
              allowVariantItems: false,
            },
            failOnStatusCode: false,
          }).then((res) =>
            cy.log(`Ensure category '${name}': ${res.status}`),
          );
        });
      });

      importAttributesAndCategories();

      // After the UI-based bulk import, recreate any common attrs that Config
      // spec 01 deletes (the bulk import shows "already exists" and silently
      // skips attrs that were deleted, leaving them absent from templates).
      cy.getAuthToken().then((token) => {
        const apiBase = getApiBase();
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        cy.request({
          method: "GET",
          url: `${apiBase}/attributes`,
          // page_size is REQUIRED: `all: true` alone still paginates and returns
          // only the first 10 attributes (of ~105). With a 10-name existingNames
          // set, nearly every entry in ENSURE_ATTRS below looked "missing", so the
          // recovery POST /attributes/multi went out as a batch full of
          // already-existing attrs, the duplicate names failed the batch, and the
          // genuinely-missing ones (Maintenance Log Summary, …) were never created
          // — which is what broke the SW_DT_004/005/006 header assertions.
          qs: { all: true, page_size: 1000 },
          headers,
          failOnStatusCode: false,
        }).then((res) => {
          const raw = res.body?.data?.list ?? res.body?.data ?? res.body ?? [];
          const list = Array.isArray(raw) ? raw : [];
          const existingNames = new Set(list.map((a) => a.name));
          const ENSURE_ATTRS = [
            { name: "Display Technology", fieldName: "displayTechnology", type: "Text", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { minLength: 0, maxLength: { value: 1000, message: "Display Technology cannot exceed 1000 characters" }, required: false }, defaultValue: "", isVlookupEnabled: false, vLookups: [] } },
            { name: "Included Accessories", fieldName: "includedAccessories", type: "MultiLineText", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { minLength: 0, maxLength: { value: 2000, message: "Included Accessories cannot exceed 2000 characters" }, required: false }, defaultValue: "" } },
            { name: "Processing Cores", fieldName: "processingCores", type: "Number", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Support Contact", fieldName: "supportContact", type: "Email", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Product Page", fieldName: "productPage", type: "URL", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Diagonal Size", fieldName: "diagonalSize", type: "Decimal", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Market Price", fieldName: "marketPrice", type: "Decimal", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Efficiency Rating", fieldName: "efficiencyRating", type: "Decimal", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Storage Solution", fieldName: "storageSolution", type: "List", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, listOptions: [{ label: "SSD", value: "SSD" }, { label: "HDD", value: "HDD" }, { label: "Hybrid", value: "Hybrid" }, { label: "NVMe", value: "NVMe" }] } },
            { name: "Eco Friendly Certified", fieldName: "ecoFriendlyCertified", type: "Boolean", categoryId: null, entityType: "Product", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { checkByDefault: false, required: false } } },
            { name: "Asset Security Code", fieldName: "assetSecurityCode", type: "Text", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { minLength: 0, maxLength: { value: 1000, message: "Asset Security Code cannot exceed 1000 characters" }, required: false }, defaultValue: "", isVlookupEnabled: false, vLookups: [] } },
            { name: "Maintenance Log Summary", fieldName: "maintenanceLogSummary", type: "MultiLineText", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { minLength: 0, maxLength: { value: 2000, message: "Maintenance Log Summary cannot exceed 2000 characters" }, required: false }, defaultValue: "" } },
            { name: "Previous Repair Count", fieldName: "previousRepairCount", type: "Number", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Custodian Email", fieldName: "custodianEmail", type: "Email", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Asset Management Link", fieldName: "assetManagementLink", type: "URL", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Battery Wear Level", fieldName: "batteryWearLevel", type: "Decimal", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Scrap Value", fieldName: "scrapValue", type: "Decimal", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, defaultValue: "" } },
            { name: "Utilization Rate", fieldName: "utilizationRate", type: "Percent", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { pattern: { value: "^(100(\\.00?)?|[0-9]{1,2}(\\.[0-9]{1,2})?)$", message: "Only positive percentages between 0 and 100 with up to two decimal places are allowed." }, required: false }, defaultValue: "" } },
            { name: "Department Allocation", fieldName: "departmentAllocation", type: "List", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { required: false }, listOptions: [{ label: "HR", value: "HR" }, { label: "IT", value: "IT" }, { label: "Sales", value: "Sales" }, { label: "Quality", value: "Quality" }] } },
            { name: "Active Status", fieldName: "activeStatus", type: "Boolean", categoryId: null, entityType: "Item", editable: true, required: false, unique: false, locked: false, otherInfo: { controlRules: { checkByDefault: false, required: false } } },
          ];
          const missing = ENSURE_ATTRS.filter((a) => !existingNames.has(a.name));
          cy.log(`Recreating ${missing.length} deleted common attrs`);
          if (missing.length > 0) {
            // POST /attributes/multi skips JoiValidationPipe so categoryId:null
            // is accepted (the single POST /attributes endpoint uses
            // joi.number().optional() which rejects null, causing silent 400s).
            cy.request({
              method: "POST",
              url: `${apiBase}/attributes/multi`,
              headers,
              failOnStatusCode: false,
              body: missing,
            }).then((r) => cy.log(`POST multi (${missing.length} attrs): ${r.status}`));
          }

          // ── Ensure category-SCOPED attrs the templates assert on exist ──────
          // The bulk JSON import creates a same-named attribute only once, so an
          // attribute the fixture declares for BOTH automation categories (MSRP
          // is in expectedHeaders.ramProduct AND .laptopProduct) ends up on just
          // one of them — leaving it absent from the other category's template
          // (this is what failed SW_DT_005: MSRP existed only on Laptop).
          //
          // A same-named attribute must share its type + validation across
          // categories — the API rejects a mismatch with "Mismatch detected: the
          // attribute X in category Y has a different type or validation" — so
          // clone the definition from the existing instance instead of
          // re-declaring it and risking a drifted copy.
          cy.request({
            method: "GET",
            url: `${apiBase}/categories`,
            qs: { page: 1, page_size: 200 },
            headers,
            failOnStatusCode: false,
          }).then((catRes) => {
            const rawCats = catRes.body?.data?.list ?? catRes.body?.data ?? [];
            const catList = Array.isArray(rawCats) ? rawCats : [];

            const ensureCategoryAttr = (attrName, categoryName) => {
              const category = catList.find(
                (c) => (c.name || "").toLowerCase() === categoryName.toLowerCase(),
              );
              if (!category) {
                cy.log(`ensureCategoryAttr: category '${categoryName}' not found`);
                return;
              }
              if (list.some((a) => a.name === attrName && a.categoryId === category.id)) return;
              const source = list.find((a) => a.name === attrName && a.categoryId != null);
              if (!source) {
                cy.log(`ensureCategoryAttr: no existing '${attrName}' to clone`);
                return;
              }
              cy.request({
                method: "POST",
                url: `${apiBase}/attributes`,
                headers,
                failOnStatusCode: false,
                body: {
                  name: source.name,
                  fieldName: source.fieldName,
                  type: source.type,
                  entityType: source.entityType,
                  required: source.required,
                  unique: source.unique,
                  editable: source.editable,
                  locked: source.locked,
                  otherInfo: source.otherInfo,
                  categoryId: category.id,
                },
              }).then((r) =>
                cy.log(`ensureCategoryAttr '${attrName}' → ${categoryName}: ${r.status}`),
              );
            };

            ensureCategoryAttr("MSRP", td.categories.ram);
            ensureCategoryAttr("MSRP", td.categories.laptop);

            // ── Backfill any category-scoped attribute the seed fixture declares
            // but QA does not actually have ────────────────────────────────────
            // The UI bulk import silently skips attributes on an "already exists"
            // response, so an attribute that was deleted from QA at some point is
            // never recreated and just quietly vanishes from the template (that is
            // how "Maintenance Log Summary" and "Item Warranty Status" went
            // missing). Rather than hard-code each casualty as it turns up, read
            // the definitions straight from testDataAttributes.json — the same
            // file the bulk import uses — and create whatever is absent.
            //
            // The fixture's own category ids (105 = Laptop, 106 = RAM) are local to
            // the file, so map them to the REAL category ids by name and drop the
            // fixture's `id` before POSTing.
            cy.fixture("testDataAttributes").then((seed) => {
              const fixtureCatById = new Map(
                (seed.categories || []).map((c) => [c.id, c.name]),
              );

              (seed.attributes || [])
                .filter((a) => a.categoryId != null)
                .forEach((a) => {
                  const categoryName = fixtureCatById.get(a.categoryId);
                  if (!categoryName) return;
                  const category = catList.find(
                    (c) => (c.name || "").toLowerCase() === categoryName.toLowerCase(),
                  );
                  if (!category) return;
                  const exists = list.some(
                    (x) => x.name === a.name && x.categoryId === category.id,
                  );
                  if (exists) return;

                  const { id, categoryId, categoryName: _cn, ...definition } = a;
                  cy.request({
                    method: "POST",
                    url: `${apiBase}/attributes`,
                    headers,
                    failOnStatusCode: false,
                    body: { ...definition, categoryId: category.id },
                  }).then((r) =>
                    cy.log(`backfill attr '${a.name}' → ${categoryName}: ${r.status}`),
                  );
                });
            });
          });
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // beforeEach — session + page object init
  // ---------------------------------------------------------------------------
  beforeEach(() => {
    cy.fixture("downloadTemplateData").then((data) => {
      td = data;
    });
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
  });

  // ===========================================================================
  // SW_DT_001
  // Scenario       : Verify that the Download Template dialog opens from the
  //                  header action menu and contains the expected UI elements.
  // Precondition   : User is logged in and on the Incoming Inventory page.
  // Test Steps     : 1. Navigate to Incoming Inventory.
  //                  2. Click the header action menu (long-button).
  //                  3. Click "Download Template" from the menu.
  // Expected Result: Dialog is visible and contains the dialog title, the
  //                  "Choose Template" label, and the "Download Template" button.
  // ===========================================================================
  it(
    "SW_DT_001 – Dialog opens from header action menu with correct UI elements",
    { tags: ["@smoke", "@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();

      openDownloadTemplateDialog();

      cy.findByRole("dialog").within(() => {
        cy.contains(td.uiTexts.dialogTitle).should("be.visible");
        cy.contains(td.uiTexts.chooseTemplateLabel).should("be.visible");
        cy.contains("button", td.uiTexts.downloadButtonText).should("exist");
      });
    },
  );

  // ===========================================================================
  // SW_DT_002
  // Scenario       : Confirm that the Download Template button is disabled
  //                  when no template option has been selected from the dropdown.
  // Precondition   : Download Template dialog is accessible from the header menu.
  // Test Steps     : 1. Navigate to Incoming Inventory.
  //                  2. Open the Download Template dialog.
  //                  3. Do not select any option from the template dropdown.
  //                  4. Inspect the "Download Template" button state.
  // Expected Result: The "Download Template" button is disabled (cannot be clicked).
  // ===========================================================================
  it(
    "SW_DT_002 – Download button is disabled when no template is selected",
    { tags: ["@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();

      openDownloadTemplateDialog();

      cy.findByRole("dialog")
        .find("button")
        .contains(td.uiTexts.downloadButtonText)
        .should("be.disabled");
    },
  );

  // ===========================================================================
  // SW_DT_003
  // Scenario       : Verify that the template dropdown lists the General option
  //                  as well as all category-specific templates (RAM, Laptop).
  // Precondition   : Categories (RAM, Laptop) exist in the system. User is on
  //                  the Incoming Inventory page.
  // Test Steps     : 1. Navigate to Incoming Inventory.
  //                  2. Open the Download Template dialog.
  //                  3. Click the template dropdown to expand it.
  //                  4. Inspect the available options in the dropdown menu.
  // Expected Result: Dropdown menu shows options for "General", the RAM category
  //                  template, and the Laptop category template. Dismiss with Esc.
  // ===========================================================================
  it(
    "SW_DT_003 – Template dropdown lists General and category-specific templates",
    { tags: ["@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();

      openDownloadTemplateDialog();

      cy.findByRole("dialog").within(() => {
        cy.get('[class*="-control"]').first().click({ force: true });
      });

      cy.get(".select__menu")
        .contains(".select__option", td.templateTypes.general.label)

      cy.get(".select__menu").contains(
        ".select__option",
        td.templateTypes.ram.label,
      );

      cy.get(".select__menu").contains(
        ".select__option",
        td.templateTypes.laptop.label,
      );



      cy.get("body").type("{esc}");
    },
  );

  // ===========================================================================
  // SW_DT_004
  // Scenario       : Download the General Template and confirm the generated
  //                  Excel file contains both common Product and common Item
  //                  attribute headers across all categories.
  // Precondition   : Attributes (common Product + common Item) are configured
  //                  in the system. User is on the Incoming Inventory page.
  // Test Steps     : 1. Navigate to Incoming Inventory.
  //                  2. Open the Download Template dialog.
  //                  3. Select "General" from the template dropdown.
  //                  4. Click "Download Template" and intercept the API call.
  //                  5. Request the same endpoint via cy.request and parse headers.
  // Expected Result: API returns 200 with spreadsheetml content. Success toast
  //                  appears. Excel headers include all common Product attributes
  //                  and all common Item attributes.
  // ===========================================================================
  it(
    "SW_DT_004 – Download General Template and verify headers contain common Product and Item attributes",
    { tags: ["@smoke", "@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();

      downloadAndVerifyHeaders({
        templateLabel: td.templateTypes.general.label,
        categoryQueryParam: null,
        mustInclude: [
          td.expectedHeaders.commonProduct,
          td.expectedHeaders.commonItem,
        ],
        mustNotInclude: [],
      });
    },
  );

  // ===========================================================================
  // SW_DT_005
  // Scenario       : Download the RAM Category Template and verify that the
  //                  generated Excel file contains the correct Product-only
  //                  headers and does NOT include any Item-level headers.
  // Precondition   : RAM category exists (product-only, allowItems=false).
  //                  Common Product + RAM-specific Product attributes configured.
  // Test Steps     : 1. Navigate to Incoming Inventory.
  //                  2. Open the Download Template dialog.
  //                  3. Select the RAM category template from the dropdown.
  //                  4. Click "Download Template" and intercept the API call
  //                     (GET /excel/download?category=<ram>).
  //                  5. Request the same endpoint via cy.request and parse headers.
  // Expected Result: API returns 200. Excel headers include common Product attrs
  //                  and RAM-specific Product attrs. Headers do NOT include any
  //                  common Item attrs or Laptop Item attrs.
  // ===========================================================================
  it(
    "SW_DT_005 – Download RAM Template and verify common Product + RAM Product headers, no Item attributes",
    { tags: ["@smoke", "@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();

      downloadAndVerifyHeaders({
        templateLabel: td.templateTypes.ram.label,
        categoryQueryParam: td.categories.ram,
        mustInclude: [
          td.expectedHeaders.commonProduct,
          td.expectedHeaders.ramProduct,
        ],
        mustNotInclude: [
          td.expectedHeaders.commonItem,
          td.expectedHeaders.laptopItem,
        ],
      });
    },
  );

  // ===========================================================================
  // SW_DT_006
  // Scenario       : Download the Laptop Category Template and verify that the
  //                  generated Excel file contains all four expected header groups:
  //                  common Product, common Item, Laptop-specific Product, and
  //                  Laptop-specific Item attributes.
  // Precondition   : Laptop category exists (allowItems=true). All four attribute
  //                  groups (common Product, common Item, Laptop Product, Laptop
  //                  Item) are configured in the system.
  // Test Steps     : 1. Navigate to Incoming Inventory.
  //                  2. Open the Download Template dialog.
  //                  3. Select the Laptop category template from the dropdown.
  //                  4. Click "Download Template" and intercept the API call
  //                     (GET /excel/download?category=<laptop>).
  //                  5. Request the same endpoint via cy.request and parse headers.
  // Expected Result: API returns 200. Excel headers include common Product attrs,
  //                  common Item attrs, Laptop-specific Product attrs, and
  //                  Laptop-specific Item attrs.
  // ===========================================================================
  it(
    "SW_DT_006 – Download Laptop Template and verify common + Laptop-specific Product and Item headers",
    { tags: ["@smoke", "@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();

      downloadAndVerifyHeaders({
        templateLabel: td.templateTypes.laptop.label,
        categoryQueryParam: td.categories.laptop,
        mustInclude: [
          td.expectedHeaders.commonProduct,
          td.expectedHeaders.commonItem,
          td.expectedHeaders.laptopProduct,
          td.expectedHeaders.laptopItem,
        ],
        mustNotInclude: [],
      });
    },
  );
});
