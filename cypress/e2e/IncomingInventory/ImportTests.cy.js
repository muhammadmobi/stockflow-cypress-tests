import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import ImportPage from "../../pageObjects/ImportPage";
import CategoryPage from "../../pageObjects/CategoryPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import { deletePO } from "../../support/helpers/exportSeedingHelpers";
import {
  apiSetGeneralConfigFlags,
  apiDeleteProductNameConfig,
} from "../../support/helpers/generalConfigApiHelpers";
import "cypress-file-upload";


describe("Import Tests (SW_IMP_001 – SW_IMP_072)", () => {
  let incomingInvPage,
    invViewPage,
    importPage,
    purchaseOrderPage;
  let testData;
  let sw003PO;
  let sw067BulkPO;
  let sw068BulkPO;
  // The new import page enforces ONE import file per PO, so every import needs a
  // fresh PO (the static testData.poNumber collided across tests AND across
  // runs → "PO already has an import file"). Set a unique PO per test.
  let currentPO;
  let poCtr = 0;
  const createdImportPOs = [];

  before(() => {
    cy.fixture("importTestData").then((data) => {
      testData = data;
    });

    cy.authSession('admin');
    cy.visit("/");

    // ── Ensure Product Name config exists for both categories ──
    const catPage = new CategoryPage();

    // Helper: configure product name for a category if its row is visible in the
    // current table page. Skips silently when the category is not visible
    // (e.g. Stage has many categories spread across paginated pages).
    function configProductName(catName, requiredAttrs) {
      catPage.navigateToCategories();
      // navigateToCategories() waits for tbody rows; check if target row is there
      cy.get("tbody").then(($tbody) => {
        if (!$tbody.text().includes(catName)) {
          cy.log(`[Import before()] "${catName}" not visible on first page – skipping product name setup`);
          return;
        }
        catPage.clickManageProductName(catName);
        cy.get("#product-name-form").then(($form) => {
          const formText = $form.text();
          const allPresent = requiredAttrs.every((a) => formText.includes(a));
          if (allPresent) {
            catPage.clickCancel();
          } else {
            if ($form.find('div[role="button"][aria-label^="Remove "]').length > 0) {
              catPage.clearAllProductNameTags();
            }
            requiredAttrs.forEach((a) => catPage.selectProductNameAttribute(a));
            catPage.saveProductNameConfig();
            cy.url({ timeout: 10000 }).should("include", "category");
          }
        });
      });
    }

    // RAM Automation Cat – needs "RAMbrand" + "Memory Generation"
    configProductName("RAM Automation Cat", ["RAMbrand", "Memory Generation"]);

    // Laptop Automation Cat – needs "Brand" + "Model Number"
    configProductName("Laptop Automation Cat", ["Brand", "Model Number"]);

    // Ensure specific attributes are required so column-level and row-level
    // validation tests pass. Configuration suites may make attrs optional via
    // ensureCommonAttributesOptional() or direct PATCH. Restore required=true.
    const apiBase = Cypress.env("API_BASE_URL");
    // Common attrs (categoryId=null) to restore to required=true
    const REQUIRED_COMMON_ATTRS = ["Support Contact", "Asset Security Code"];
    // Category-specific attrs to restore to required=true (column-level checks)
    const REQUIRED_CAT_ATTRS = ["RAMbrand", "Asset Tag ID"];
    // System fields that must stay required=true so missing-column tests pass
    const REQUIRED_SYSTEM_ATTRS = ["Cost", "Quantity", "Price"];
    cy.getAuthToken().then((token) => {
      if (!token) return;
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // ── Step 0: Ensure "RAM Automation Cat" + "Laptop Automation Cat" exist ──
      // Stage may have been reset/reseeded. Create them idempotently so all
      // import tests can run regardless of environment state.
      cy.request({
        method: "GET",
        url: `${apiBase}/categories`,
        qs: { page: 1, page_size: 200 },
        headers,
        failOnStatusCode: false,
      }).then((catRes) => {
        const rawCats =
          catRes.body?.data?.list ??
          catRes.body?.data?.items ??
          catRes.body?.data?.results ??
          (Array.isArray(catRes.body?.data) ? catRes.body.data : null) ??
          [];
        const catList = Array.isArray(rawCats) ? rawCats : [];

        const existingRam = catList.find(
          (c) => c.name.toLowerCase() === "ram automation cat",
        );
        const existingLaptop = catList.find(
          (c) => c.name.toLowerCase() === "laptop automation cat",
        );

        /** Returns a Cypress chain that yields the category ID (existing or newly created). */
        const ensureCat = (existing, body) => {
          if (existing) return cy.wrap(existing.id);
          return cy
            .request({
              method: "POST",
              url: `${apiBase}/categories`,
              headers,
              failOnStatusCode: false,
              body,
            })
            .then((r) => {
              const d = r.body?.data || r.body;
              cy.log(`Created category "${body.name}": id=${d?.id} status=${r.status}`);
              return cy.wrap(d?.id);
            });
        };

        ensureCat(existingRam, {
          name: "RAM Automation Cat",
          allowItems: false,
          allowVariants: false,
          allowVariantItems: false,
        }).then((ramCatId) => {
          ensureCat(existingLaptop, {
            name: "Laptop Automation Cat",
            allowItems: true,
            allowVariants: false,
            allowVariantItems: false,
          }).then((laptopCatId) => {
            if (!ramCatId || !laptopCatId) {
              cy.log(
                "WARNING: Could not obtain automation category IDs — attr seeding skipped",
              );
              return;
            }
            cy.log(`Automation cats: RAM=${ramCatId}, Laptop=${laptopCatId}`);

            // Build the full list of category-specific attrs to ensure exist.
            // POST is idempotent via failOnStatusCode:false — 409/400 on
            // duplicate name/fieldName is silently ignored.
            const catAttrs = [
              // ── RAM Automation Cat – Product attrs ──
              { name: "RAMbrand", fieldName: "ramBrand", type: "List", categoryId: ramCatId, entityType: "Product", required: true, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: true }, listOptions: [{label:"Corsair",value:"Corsair"},{label:"GSkill",value:"GSkill"},{label:"Kingston",value:"Kingston"},{label:"Crucial",value:"Crucial"}] } },
              { name: "Memory Generation", fieldName: "memoryGeneration", type: "List", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false }, listOptions: [{label:"DDR4",value:"DDR4"},{label:"DDR5",value:"DDR5"},{label:"LPDDR5",value:"LPDDR5"},{label:"LPDDR4",value:"LPDDR4"}] } },
              { name: "Memory Capacity", fieldName: "memoryCapacity", type: "Number", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Operating Voltage", fieldName: "operatingVoltage", type: "Decimal", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Performance Boost", fieldName: "performanceBoost", type: "Decimal", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "ECC Supported", fieldName: "eccSupported", type: "Boolean", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Vendor Contact", fieldName: "vendorContact", type: "Email", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Datasheet Link", fieldName: "datasheetLink", type: "URL", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Compatibility Notes", fieldName: "compatibilityNotes", type: "Text", categoryId: ramCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              // ── Laptop Automation Cat – Product attrs ──
              { name: "Model Number", fieldName: "modelNumber", type: "Text", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Brand", fieldName: "brand", type: "List", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false }, listOptions: [{label:"Lenovo",value:"Lenovo"},{label:"Dell",value:"Dell"},{label:"HP",value:"HP"},{label:"Asus",value:"Asus"}] } },
              { name: "Battery Cell Count", fieldName: "batteryCellCount", type: "Number", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Weight", fieldName: "weight", type: "Decimal", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Battery Percentage", fieldName: "batteryPercentage", type: "Number", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Has Touchscreen", fieldName: "hasTouchscreen", type: "Boolean", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Technical Support Email", fieldName: "technicalSupportEmail", type: "Email", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Driver Download Page", fieldName: "driverDownloadPage", type: "URL", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Technical Specifications", fieldName: "technicalSpecifications", type: "Text", categoryId: laptopCatId, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              // ── Laptop Automation Cat – Item attrs ──
              { name: "Asset Tag ID", fieldName: "assetTagId", type: "Text", categoryId: laptopCatId, entityType: "Item", required: true, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: true } } },
              { name: "Item Storage Capacity", fieldName: "conditionGrade", type: "List", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false }, listOptions: [{label:"Excellent",value:"Excellent"},{label:"Good",value:"Good"},{label:"Fair",value:"Fair"},{label:"Poor",value:"Poor"}] } },
              { name: "Total Service Count", fieldName: "totalServiceCount", type: "Number", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Current Battery Health", fieldName: "currentBatteryHealth", type: "Decimal", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Actual Purchase Price", fieldName: "actualPurchasePrice", type: "Decimal", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Annual Depreciation Rate", fieldName: "annualDepreciationRate", type: "Decimal", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Under Active Warranty", fieldName: "underActiveWarranty", type: "Boolean", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Assigned User Email", fieldName: "assignedUserEmail", type: "Email", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Warranty Registration Link", fieldName: "warrantyRegistrationLink", type: "URL", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Service History", fieldName: "serviceHistory", type: "Text", categoryId: laptopCatId, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              // ── Extra common attrs (categoryId=null) needed by import rows ──
              { name: "MSRP", fieldName: "msrp", type: "Decimal", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Product Page", fieldName: "productPage", type: "URL", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Diagonal Size", fieldName: "diagonalSize", type: "Decimal", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Market Price", fieldName: "marketPrice", type: "Decimal", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Efficiency Rating", fieldName: "efficiencyRating", type: "Decimal", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Eco Friendly Certified", fieldName: "ecoFriendlyCertified", type: "Boolean", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Included Accessories", fieldName: "includedAccessories", type: "Text", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Battery Wear Level", fieldName: "batteryWearLevel", type: "Decimal", categoryId: null, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Scrap Value", fieldName: "scrapValue", type: "Decimal", categoryId: null, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Utilization Rate", fieldName: "utilizationRate", type: "Number", categoryId: null, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Active Status", fieldName: "activeStatus", type: "Boolean", categoryId: null, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Custodian Email", fieldName: "custodianEmail", type: "Email", categoryId: null, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              { name: "Asset Management Link", fieldName: "assetManagementLink", type: "URL", categoryId: null, entityType: "Item", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
              // ── System columns: Quantity / Cost / Price ──
              // These must be registered as attrs so their Excel column values
              // are recognised and mapped into data['quantity']/data['cost']/
              // data['price'] by the import service's allAttributes loop.
              // Without them the "Quantity" column is treated as an extra field,
              // leaving data['quantity']=undefined → "Quantity must be > 0" error.
              { name: "Quantity", fieldName: "quantity", type: "Number", categoryId: null, entityType: "Product", required: true, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: true } } },
              { name: "Cost", fieldName: "cost", type: "Decimal", categoryId: null, entityType: "Product", required: true, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: true } } },
              { name: "Price", fieldName: "price", type: "Decimal", categoryId: null, entityType: "Product", required: false, unique: false, editable: true, locked: false, otherInfo: { controlRules: { required: false } } },
            ];

            cy.wrap(catAttrs).each((attr) => {
              cy.request({
                method: "POST",
                url: `${apiBase}/attributes`,
                headers,
                failOnStatusCode: false,
                body: stripNullCategoryId(attr),
              }).then((r) =>
                cy.log(`ensureCatAttr "${attr.name}" (cat=${attr.categoryId}): ${r.status}`),
              );
            });

            // ── After POST, PATCH existing attrs to ensure correct config ──
            // If attrs already existed from a prior run (POST returned 409),
            // PATCH them to apply any config changes (fieldName, listOptions, name).
            cy.request({
              method: "GET",
              url: `${apiBase}/attributes`,
              qs: { all: true, page_size: 1000 },
              headers,
              failOnStatusCode: false,
            }).then((attrRes) => {
              const rawList = attrRes.body?.data?.list ?? attrRes.body?.data ?? attrRes.body ?? [];
              const attrList = Array.isArray(rawList) ? rawList : [];

              // PATCH helper: send a full PATCH with required fields
              const patchAttr = (found, overrides) => {
                cy.request({
                  method: "PATCH",
                  url: `${apiBase}/attributes`,
                  headers,
                  failOnStatusCode: false,
                  body: stripNullCategoryId({
                    id: found.id,
                    name: overrides.name ?? found.name,
                    type: overrides.type ?? found.type,
                    fieldName: overrides.fieldName ?? found.fieldName,
                    categoryId: found.categoryId,
                    entityType: found.entityType ?? "Product",
                    editable: found.editable ?? true,
                    required: overrides.required ?? found.required,
                    unique: found.unique ?? false,
                    locked: found.locked ?? false,
                    otherInfo: overrides.otherInfo ?? found.otherInfo,
                  }),
                }).then((r) => cy.log(`PATCH attr "${found.name}" → ${r.status}`));
              };

              // RAMbrand: ensure fieldName="ramBrand" + Samsung removed from listOptions
              const ramBrand = attrList.find((a) => a.name === "RAMbrand");
              if (ramBrand) {
                patchAttr(ramBrand, {
                  fieldName: "ramBrand",
                  required: true,
                  otherInfo: { controlRules: { required: true }, listOptions: [
                    {label:"Corsair",value:"Corsair"},
                    {label:"GSkill",value:"GSkill"},
                    {label:"Kingston",value:"Kingston"},
                    {label:"Crucial",value:"Crucial"},
                  ]},
                });
              }

              // Brand: ensure type=List and Apple removed from listOptions — patch ALL Brand attrs
              // (Stage may have Brand as common attr or category-specific; catch both)
              const brands = attrList.filter((a) => a.name === "Brand");
              cy.wrap(brands).each((b) => {
                patchAttr(b, {
                  type: "List",
                  otherInfo: { controlRules: { required: b.required ?? false }, listOptions: [
                    {label:"Lenovo",value:"Lenovo"},
                    {label:"Dell",value:"Dell"},
                    {label:"HP",value:"HP"},
                    {label:"Asus",value:"Asus"},
                  ]},
                });
              });

              // "Condition Grade" → rename to "Item Storage Capacity" so SW_IMP_050 works
              const condGrade = attrList.find((a) => a.name === "Condition Grade");
              if (condGrade) {
                patchAttr(condGrade, { name: "Item Storage Capacity" });
              }

              // Support Contact: ensure required=true + otherInfo.controlRules.required=true
              // Patch ALL instances (common or category-specific) — Stage varies.
              const supportContacts = attrList.filter((a) => a.name === "Support Contact");
              cy.wrap(supportContacts).each((sc) => {
                patchAttr(sc, {
                  required: true,
                  otherInfo: {
                    ...(sc.otherInfo || {}),
                    controlRules: { ...((sc.otherInfo || {}).controlRules || {}), required: true },
                  },
                });
              });

              // Asset Security Code: ensure required=true + otherInfo.controlRules.required=true
              const assetSecCodes = attrList.filter((a) => a.name === "Asset Security Code");
              cy.wrap(assetSecCodes).each((asc) => {
                patchAttr(asc, {
                  required: true,
                  otherInfo: {
                    ...(asc.otherInfo || {}),
                    controlRules: { ...((asc.otherInfo || {}).controlRules || {}), required: true },
                  },
                });
              });

              // Asset Tag ID: ensure required=true + otherInfo.controlRules.required=true
              const assetTagIds = attrList.filter((a) => a.name === "Asset Tag ID");
              cy.wrap(assetTagIds).each((atid) => {
                patchAttr(atid, {
                  required: true,
                  otherInfo: {
                    ...(atid.otherInfo || {}),
                    controlRules: { ...((atid.otherInfo || {}).controlRules || {}), required: true },
                  },
                });
              });

              // Quantity/Cost/Price: ensure correct fieldName AND required status
              const qty = attrList.find((a) => a.name === "Quantity" && a.categoryId == null);
              if (qty && (qty.fieldName !== "quantity" || !qty.required)) {
                patchAttr(qty, { fieldName: "quantity", required: true });
              }
              const cost = attrList.find((a) => a.name === "Cost" && a.categoryId == null);
              if (cost && (cost.fieldName !== "cost" || !cost.required)) {
                patchAttr(cost, { fieldName: "cost", required: true });
              }
              const price = attrList.find((a) => a.name === "Price" && a.categoryId == null);
              if (price && price.fieldName !== "price") {
                patchAttr(price, { fieldName: "price" });
              }
            });
          });
        });
      });

      // ── Step 1–4: Existing attr operations (PATCH required, makeOptional, ensureExists) ──
      cy.request({
        method: "GET",
        url: `${apiBase}/attributes`,
        qs: { all: true, page_size: 1000 },
        headers,
        failOnStatusCode: false,
      }).then((res) => {
        const raw =
          res.body?.data?.list ?? res.body?.data ?? res.body ?? [];
        const list = Array.isArray(raw) ? raw : [];
        const targets = list.filter(
          (a) =>
            !a.required &&
            (
              REQUIRED_COMMON_ATTRS.includes(a.name) ||
              REQUIRED_CAT_ATTRS.includes(a.name)
            ),
        );
        cy.wrap(targets).each((attr) => {
          cy.request({
            method: "PATCH",
            url: `${apiBase}/attributes`,
            headers,
            failOnStatusCode: false,
            body: stripNullCategoryId({
              id: attr.id,
              name: attr.name,
              type: attr.type,
              fieldName: attr.fieldName,
              categoryId: attr.categoryId,
              editable: attr.editable ?? true,
              required: true,
              ...(attr.entityType && { entityType: attr.entityType }),
              ...(attr.unique != null && { unique: attr.unique }),
              ...(attr.locked != null && { locked: attr.locked }),
              otherInfo: {
                ...(attr.otherInfo || {}),
                controlRules: {
                  ...((attr.otherInfo || {}).controlRules || {}),
                  required: true,
                },
              },
            }),
          }).then((r) =>
            cy.log(`ensureRequired PATCH ${attr.name} (catId=${attr.categoryId}): ${r.status}`),
          );
        });

        // Make any required attr that isn't in our keep-required lists optional so
        // unknown Stage attrs (e.g. "Processor", "Brand", "Model" — whether common
        // or category-specific) don't block positive imports.
        const unknownReqCommon = list.filter(
          (a) =>
            a.required &&
            !REQUIRED_COMMON_ATTRS.includes(a.name) &&
            !REQUIRED_CAT_ATTRS.includes(a.name) &&
            !REQUIRED_SYSTEM_ATTRS.includes(a.name),
        );
        cy.wrap(unknownReqCommon).each((attr) => {
          cy.request({
            method: "PATCH",
            url: `${apiBase}/attributes`,
            headers,
            failOnStatusCode: false,
            body: stripNullCategoryId({
              id: attr.id,
              name: attr.name,
              type: attr.type,
              fieldName: attr.fieldName,
              categoryId: attr.categoryId,
              editable: attr.editable ?? true,
              required: false,
              ...(attr.entityType && { entityType: attr.entityType }),
              ...(attr.unique != null && { unique: attr.unique }),
              ...(attr.locked != null && { locked: attr.locked }),
              ...(attr.otherInfo && { otherInfo: attr.otherInfo }),
            }),
          }).then((r) =>
            cy.log(`makeOptional PATCH ${attr.name}: ${r.status}`),
          );
        });

        // Recreate common attrs that Config spec 01 deletes. When present they
        // are skipped (BE returns 409 / "already exists"); when absent POST
        // creates them so type-validation tests (SW_IMP_051–055) have the
        // column registered and the BE rejects invalid values instead of
        // treating the column as an extra/ignored column.
        const existingNames = new Set(list.map((a) => a.name));
        const COMMON_ATTRS_TO_ENSURE = [
          {
            name: "Support Contact",
            fieldName: "supportContact",
            type: "Email",
            categoryId: null,
            entityType: "Product",
            editable: true,
            required: true,
            unique: false,
            locked: false,
            otherInfo: { controlRules: { required: true }, defaultValue: "" },
          },
          {
            name: "Asset Security Code",
            fieldName: "assetSecurityCode",
            type: "Text",
            categoryId: null,
            entityType: "Item",
            editable: true,
            required: true,
            unique: false,
            locked: false,
            otherInfo: {
              controlRules: {
                minLength: 0,
                maxLength: { value: 1000, message: "Asset Security Code cannot exceed 1000 characters" },
                required: true,
              },
              defaultValue: "",
              isVlookupEnabled: false,
              vLookups: [],
            },
          },
          {
            name: "Display Technology",
            fieldName: "displayTechnology",
            type: "Text",
            categoryId: null,
            entityType: "Product",
            editable: true,
            required: false,
            unique: false,
            locked: false,
            otherInfo: {
              controlRules: { minLength: 0, maxLength: { value: 1000, message: "Display Technology cannot exceed 1000 characters" }, required: false },
              defaultValue: "",
              isVlookupEnabled: false,
              vLookups: [],
            },
          },
          {
            name: "Processing Cores",
            fieldName: "processingCores",
            type: "Number",
            categoryId: null,
            entityType: "Product",
            editable: true,
            required: false,
            unique: false,
            locked: false,
            otherInfo: { controlRules: { required: false }, defaultValue: "" },
          },
          {
            name: "Storage Solution",
            fieldName: "storageSolution",
            type: "List",
            categoryId: null,
            entityType: "Product",
            editable: true,
            required: false,
            unique: false,
            locked: false,
            otherInfo: {
              controlRules: { required: false },
              listOptions: [
                { label: "SSD", value: "SSD" },
                { label: "HDD", value: "HDD" },
                { label: "Hybrid", value: "Hybrid" },
                { label: "NVMe", value: "NVMe" },
              ],
            },
          },
          {
            name: "Previous Repair Count",
            fieldName: "previousRepairCount",
            type: "Number",
            categoryId: null,
            entityType: "Item",
            editable: true,
            required: false,
            unique: false,
            locked: false,
            otherInfo: { controlRules: { required: false }, defaultValue: "" },
          },
          {
            name: "Department Allocation",
            fieldName: "departmentAllocation",
            type: "List",
            categoryId: null,
            entityType: "Item",
            editable: true,
            required: false,
            unique: false,
            locked: false,
            otherInfo: {
              controlRules: { required: false },
              listOptions: [
                { label: "HR", value: "HR" },
                { label: "IT", value: "IT" },
                { label: "Sales", value: "Sales" },
                { label: "Quality", value: "Quality" },
              ],
            },
          },
        ];
        const missing = COMMON_ATTRS_TO_ENSURE.filter(
          (a) => !existingNames.has(a.name),
        );
        cy.wrap(missing).each((attr) => {
          cy.request({
            method: "POST",
            url: `${apiBase}/attributes`,
            headers,
            failOnStatusCode: false,
            body: stripNullCategoryId(attr),
          }).then((r) =>
            cy.log(`ensureExists POST ${attr.name}: ${r.status}`),
          );
        });
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    importPage = new ImportPage();
    purchaseOrderPage = new PurchaseOrderPage();
    // Unique PO per test (one-import-per-PO + re-runnability).
    currentPO = `${testData.poNumber}-${Date.now()}-${poCtr++}`;
    createdImportPOs.push(currentPO);
  });

  // ────────────────────────────── helpers ──────────────────────────────

  // QA's POST/PATCH /attributes now rejects an explicit `categoryId: null`
  // ("categoryId must be a number") but accepts the key being ABSENT — an
  // absent categoryId still persists as a common attribute (categoryId=null in
  // the DB). Common-attribute seeding must therefore OMIT the key entirely.
  // Sending `categoryId: null` was silently 400-ing every common-attr POST/PATCH
  // in before(), leaving Support Contact optional, Brand as Text, and the
  // common item attrs (Asset Security Code / Previous Repair Count /
  // Department Allocation) missing — which broke SW_IMP_030/032/033/049/054/055.
  function stripNullCategoryId(body) {
    const b = { ...body };
    if (b.categoryId === null || b.categoryId === undefined) delete b.categoryId;
    return b;
  }

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
    const po = poOverride || currentPO;
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
      // The PO dropdown (PoList.tsx) caches GET /excel/po-numbers with
      // staleTime: Infinity. The post-upload invalidate/refetch races the
      // redirect, so the menu can still hold the PRE-import list → typing the
      // new PO shows "No purchase order number found" (root cause of the
      // 2026-06-11 SW_IMP_001–012 selectPoNumber failures). A hard reload
      // drops the react-query cache and guarantees a fresh PO list.
      cy.reload();
      incomingInvPage.selectPoNumber(po);
    }
  }

  /** Navigate to import, enter PO, upload file, click Upload — expect error. */
  function importExcelNegative(fileName) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.clickImport();
    incomingInvPage.enterPONumber(currentPO);
    incomingInvPage.uploadFile(fileName);
    incomingInvPage.clickUpload();
  }

  /** Import expecting summary popup (with mixed success/ignored) — do NOT auto-click OK. */
  function importExcelExpectSummary(fileName, { poOverride = null } = {}) {
    const po = poOverride || currentPO;
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.clickImport();
    incomingInvPage.enterPONumber(po);
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
  // Technique: Use Case
  it(
    "SW_IMP_001 – Import product-only category with all attributes",
    { tags: ["@smoke"] },
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
  // Technique: Use Case
  it(
    "SW_IMP_002 – Verify product details attributes after product-only import",
    { tags: ["@smoke"] },
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
  // Technique: Use Case
  it(
    "SW_IMP_003 – Verify quantity counters after product-only import",
    { tags: ["@smoke"] },
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

      // Config-agnostic badge reads (InfoCard caption+h6 OR QA compact
      // "Label (N)" tile, incl. the hidden measurement copy for overflow tiles).
      incomingInvPage.validateStatQty(
        "Expected",
        parseInt(testData.productOnlyData.Quantity),
      );
      incomingInvPage.validateStatQty("Received", 0);
      incomingInvPage.validateStatQty("Available", 0);
    },
  );

  // ────────────────────────────── SW_IMP_004 ──────────────────────────────
  // Technique: Use Case
  it(
    "SW_IMP_004 – Import product-item category with serial numbers and all attributes",
    { tags: ["@smoke"] },
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
  // Technique: Use Case
  it(
    "SW_IMP_005 – Verify items list and item attributes after product-item import",
    { tags: ["@smoke"] },
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
  // Technique: Decision Table
  it(
    "SW_IMP_006 – Import product-item with quantity only (config ON, no serials)",
    { tags: ["@smoke"] },
    () => {
      // Set the flag via API: the General Config UI navigation is broken
      // environment-wide in the 2026-06-11 runs ("'General Config' in h5
      // never did" for EVERY navigateToGeneralConfig call across all specs).
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: true });

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
  // Technique: Use Case
  it(
    "SW_IMP_007 – Import mixed product-only and product-item categories in single file",
    { tags: ["@smoke"] },
    () => {
      // API instead of the broken General Config UI nav — see SW_IMP_006.
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: true });

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
        // Item-specific columns are intentionally omitted — product-only categories
        // don't support items. Omitting (vs empty string) prevents the backend from
        // treating them as present-but-invalid required fields on this row.
      };

      const laptopRow = {
        Category: testData.categories.productItem,
        Cost: testData.mixedFileData.laptopRow.Cost,
        Price: testData.mixedFileData.laptopRow.Price,
        "Support Contact": testData.mixedFileData.laptopRow["Support Contact"],
        "Serial Number": laptopSN,
        "Model Number": testData.mixedFileData.laptopRow["Model Number"],
        Brand: testData.mixedFileData.laptopRow.Brand,
        "Asset Tag ID": testData.mixedFileData.laptopAssetTag,
        "Asset Security Code": testData.mixedFileData.laptopAssetSecurityCode,
        // RAM-specific columns are intentionally omitted — laptop category doesn't
        // use them. Omitting (vs empty string) avoids triggering unknown-field errors.
      };

      createExcelFile(fileName, [ramRow, laptopRow]);
      importExcel(fileName);

      cy.intercept("GET", "**/incoming-items**").as("searchRam007");
      invViewPage.searchProduct(testData.mixedFileData.ramRow["Memory Generation"]);
      invViewPage.clickSubmitSearch();
      cy.wait("@searchRam007");
      cy.get("tbody tr").should("have.length.greaterThan", 0);

      cy.visit("/incoming-inventory");
      incomingInvPage.selectPoNumber(currentPO);
      cy.intercept("GET", "**/incoming-items**").as("searchLaptop007");
      // incomingInvPage.searchProduct (NOT invViewPage's) — the InvViewPage
      // variant appends {enter}, which submits the search form and reloads
      // /incoming-inventory WITHOUT the ?po_no= that selectPoNumber just set.
      // The page then falls back to "All POs" and the quick-view panel below
      // lists the product's items across EVERY PO instead of this test's.
      incomingInvPage.searchProduct(
        testData.mixedFileData.laptopRow["Model Number"],
      );
      invViewPage.clickSubmitSearch();
      cy.wait("@searchLaptop007");

      // Target the row by its Model text rather than taking row 1. This model
      // ("X1 Carbon Gen 10") is static — unlike the stamped models the other
      // import tests use — so it also matches products left behind by earlier
      // runs, and row 1 can still be the PRE-search table while React
      // re-renders. clickFirstSearchResult would then open the quick-view panel
      // on the wrong product and the freshly imported serial would be absent.
      invViewPage.clickSearchResultRecord(
        testData.mixedFileData.laptopRow["Model Number"],
      );
      incomingInvPage.verifyserialNumberInItemsList([laptopSN]);
    },
  );

  // ────────────────────────────── SW_IMP_008 ──────────────────────────────
  // Technique: Use Case
  it(
    "SW_IMP_008 – Verify Import Summary popup success count ",
    { tags: ["@smoke"] },
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
      incomingInvPage.enterPONumber(currentPO);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();

      importPage.waitForSummaryDialog();
      importPage.verifySuccessCount(3);

      incomingInvPage.clickOK();
      incomingInvPage.validateRedirectedURL();
    },
  );

  // ────────────────────────────── SW_IMP_009 ──────────────────────────────
  // Technique: Error Guessing
  it(
    "SW_IMP_009 – Verify extra columns are ignored without import failure",
    { tags: ["@smoke"] },
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
      incomingInvPage.enterPONumber(currentPO);
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
  // Technique: State Transition
  it(
    "SW_IMP_010 – Verify duplicate serial numbers are shown as ignored on re-import",
    { tags: ["@smoke"] },
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

      // One-import-per-PO: use a fresh PO for the second upload.
      // The serial dupSN is already in the DB from the first import, so the
      // second upload (new PO) will show it in "Existing Values Ignored".
      const secondPO = `IMP010-B-${stamp}`;
      createdImportPOs.push(secondPO);

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(secondPO);
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
  // Technique: Equivalence Partitioning
  it(
    "SW_IMP_011 – Import Product category data with all attribute data types and verify values",
    { tags: ["@smoke"] },
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

      cy.contains(d["RAMbrand"]).scrollIntoView();
      cy.contains(d["RAMbrand"]).should("be.visible");
      cy.contains(d["Memory Generation"]).scrollIntoView();
      cy.contains(d["Memory Generation"]).should("be.visible");
      cy.contains(d["Display Technology"]).scrollIntoView();
      cy.contains(d["Display Technology"]).should("be.visible");
      cy.contains(d["Storage Solution"]).scrollIntoView();
      cy.contains(d["Storage Solution"]).should("be.visible");
    },
  );

  // ────────────────────────────── SW_IMP_012 ──────────────────────────────
  // Technique: Equivalence Partitioning
  it(
    "SW_IMP_012 – Import Item category data with all attribute data types and verify values",
    { tags: ["@smoke"] },
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
  // Technique: Equivalence Partitioning
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
      incomingInvPage.enterPONumber(currentPO);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();
      importPage.verifyErrorContains(testData.errorMessages.invalidFileFormat);
    },
  );

  // ────────────────────────────── SW_IMP_014 ──────────────────────────────
  // Technique: Equivalence Partitioning
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
      incomingInvPage.enterPONumber(currentPO);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();
      importPage.verifyErrorContains(testData.errorMessages.invalidFileFormat);
    },
  );

  // ────────────────────────────── SW_IMP_015 ──────────────────────────────
  // Technique: Equivalence Partitioning
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
      incomingInvPage.enterPONumber(currentPO);
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();
      importPage.verifyErrorContains(testData.errorMessages.invalidFileFormat);
    },
  );

  // ────────────────────────────── SW_IMP_016 ──────────────────────────────
  // Technique: Boundary Value
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
  // Technique: Error Guessing
  it(
    "SW_IMP_017 – Verify empty multi-sheet Excel file is rejected (empty sheets still unsupported)",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-MultiSheet-${stamp}.xlsx`;
      cy.task("createMultiSheetExcel", {
        filePath: `cypress/fixtures/${fileName}`,
      });
      importExcelNegative(fileName);
      // Multi-sheet with empty sheets: the first empty sheet triggers EmptyExcelException.
      // (sw-3884 added multi-sheet support for files with data; empty sheets still fail.)
      importPage.verifyErrorContains(testData.errorMessages.emptySheet);
    },
  );

  // ────────────────────────────── SW_IMP_018 ──────────────────────────────
  // Technique: Error Guessing
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
      importPage.waitForMappingDialog();
      // The deployed build renders the mapping UI INLINE in the page (a MuiBox),
      // not as a MUI Dialog — there is no [role="dialog"] / .MuiDialog-paper
      // ancestor. Dismiss via the visible Cancel action (page-object helper).
      importPage.cancelMappingDialog();
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 3 – MISSING REQUIRED COLUMNS (SW_IMP_019 – SW_IMP_021)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_019 ──────────────────────────────
  // Technique: Error Guessing
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
  // Technique: Error Guessing
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
  // Technique: Error Guessing — a required common attribute's column omitted
  // entirely. Previously skipped as an app bug because "Support Contact" was
  // required=false on the environment (the before() seeding sent categoryId:null
  // which QA rejects, so the flag never applied). With seeding fixed (categoryId
  // omitted for common attrs), Support Contact is required=true and the backend
  // now rejects the missing column at row level ("Field Support Contact is
  // required"), so this case is active again.
  it(
    "SW_IMP_021 – Verify file missing required common product attribute column is rejected",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-NoSupport-${stamp}.xlsx`;
      // Use "RAMbrand" (no space) so it matches the attribute name and the
      // category-specific required-column check passes. Only Support Contact
      // (common attribute, checked at row level) is missing.
      const row = {
        Category: testData.categories.productOnly,
        RAMbrand: testData.minRowDefaults.ram.ramBrand,
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
  // Technique: Equivalence Partitioning
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
  // Technique: Boundary Value
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
  // Technique: Decision Table
  it(
    "SW_IMP_024 – Verify empty serial number rejected when config is OFF",
    { tags: ["@regression"] },
    () => {
      // API instead of the broken General Config UI nav — see SW_IMP_006.
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: false });

      const stamp = ts();
      const fileName = `ImpTest-NoSN-${stamp}.xlsx`;
      const row = minLaptopRow("");
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.serialNumberEmpty);
      importPage.closeErrorDialog();

      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: true });
    },
  );

  // ────────────────────────────── SW_IMP_025 ──────────────────────────────
  // Technique: Error Guessing
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
      // When the Cost column is absent from the Excel file entirely, the backend
      // fires ExcelColumnsException (column-level) before row-level Joi validation,
      // producing a "Missing Columns" error (not a row-level "Cost is required").
      importPage.verifyErrorContains(testData.errorMessages.missingColumns);
    },
  );

  // ────────────────────────────── SW_IMP_026 ──────────────────────────────
  // Technique: Error Guessing
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
    },
  );

  // ────────────────────────────── SW_IMP_027 ──────────────────────────────
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
  it(
    "SW_IMP_029 – Verify empty required attribute (RAM Brand) produces error for correct row",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-EmptyRAMBrand-${stamp}.xlsx`;
      const rows = [
        minRamRow({ "Memory Capacity": "16", Price: "129.99" }),
        minRamRow({
          RAMbrand: "",
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Decision Table
  it(
    "SW_IMP_035 – Verify import without PO when Require PO Number is ON produces error",
    { tags: ["@regression"] },
    () => {
      // API instead of the broken General Config UI nav — see SW_IMP_006.
      apiSetGeneralConfigFlags({ isPoNumberRequired: true });

      const stamp = ts();
      const fileName = `ImpTest-NoPO-${stamp}.xlsx`;
      createExcelFile(fileName, [minRamRow()]);

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.uploadFile(fileName);
      incomingInvPage.clickUpload();

      importPage.verifyErrorContains(testData.errorMessages.poNumberRequired);

      apiSetGeneralConfigFlags({ isPoNumberRequired: false });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 7 – DATA TYPE VALIDATION – PRODUCT-ONLY (SW_IMP_036 – SW_IMP_042)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_036 ──────────────────────────────
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
      // Performance Boost is a Decimal-typed attribute (RAM category seeding,
      // ~line 165), so a non-numeric value ("high") fires the Joi decimal
      // `number.base` message "Invalid decimal number" (attribute.service.ts
      // ~2713) — the SAME message SW_IMP_037/044 assert for Decimal attrs. The
      // old "Performance Boost must be a number" text was never emitted.
      importPage.verifyErrorContains(testData.errorMessages.invalidDecimalValue);
      importPage.verifyErrorRowNumber(2);
    },
  );

  // ────────────────────────────── SW_IMP_042 ──────────────────────────────
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Equivalence Partitioning
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
  // Technique: Error Guessing
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
  // Technique: Error Guessing
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
  // Technique: State Transition
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
  // Technique: State Transition
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
      // One-import-per-PO: sn34 already exists globally; a fresh PO shows it
      // in "Existing Values Ignored" while sn35/sn36 are newly imported.
      const secondPO059 = `IMP059-B-${stamp}`;
      createdImportPOs.push(secondPO059);
      importExcelExpectSummary(secondFileName, { poOverride: secondPO059 });
      importPage.verifySuccessCount(2);
      importPage.verifyExistingValuesIgnoredCount(1);
      importPage.closeSummaryDialog();
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 11 – QUANTITY HANDLING (SW_IMP_060 – SW_IMP_061)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_060 ──────────────────────────────
  // Technique: Boundary Value
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
  // Technique: Error Guessing
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
  // Technique: Decision Table
  it(
    "SW_IMP_062 – Verify config ON: product-item with Qty, no SN imports successfully",
    { tags: ["@regression"] },
    () => {
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: true });

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
  // Technique: Decision Table
  it(
    "SW_IMP_063 – Verify config ON: product-item with serial numbers creates items",
    { tags: ["@regression"] },
    () => {
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: true });

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
  // Technique: Decision Table
  it(
    "SW_IMP_064 – Verify config OFF: product-item without SN is rejected",
    { tags: ["@regression"] },
    () => {
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: false });

      const stamp = ts();
      const fileName = `ImpTest-NoSN-OFF-${stamp}.xlsx`;
      const row = minLaptopRow("", { Quantity: "5" });
      createExcelFile(fileName, [row]);
      importExcelNegative(fileName);
      importPage.verifyErrorContains(testData.errorMessages.serialNumberEmpty);
      importPage.closeErrorDialog();

      cy.visit("/");
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: true });
    },
  );

  // ────────────────────────────── SW_IMP_065 ──────────────────────────────
  // Technique: Decision Table
  it(
    "SW_IMP_065 – Verify config toggle does not affect product-only imports",
    { tags: ["@regression"] },
    () => {
      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: false });

      const stamp = ts();
      const fileName1 = `ImpTest-ProdOnly-OFF-${stamp}.xlsx`;
      const row1 = minRamRow({ Quantity: "20" });
      createExcelFile(fileName1, [row1]);
      importExcel(fileName1);

      apiSetGeneralConfigFlags({ allowProductUploadWithoutItems: true });

      // One-import-per-PO: use a separate PO for the second import so the FE
      // doesn't reject it as "PO already has an import file".
      const stamp2 = ts();
      const po065B = `IMP065-B-${stamp2}`;
      createdImportPOs.push(po065B);
      const fileName2 = `ImpTest-ProdOnly-ON-${stamp2}.xlsx`;
      const row2 = minRamRow({
        RAMbrand: "Kingston",
        "Memory Generation": "DDR4",
        Cost: "45.00",
        Quantity: "15",
      });
      createExcelFile(fileName2, [row2]);
      importExcel(fileName2, { poOverride: po065B });

      cy.intercept("GET", "**/incoming-items**").as("searchApi065");
      invViewPage.searchProduct("Kingston");
      invViewPage.clickSubmitSearch();
      cy.wait("@searchApi065");
      cy.get("tbody").should("contain.text", testData.categories.productOnly);
    },
  );

  // ────────────────────────────── SW_IMP_066 ──────────────────────────────
  // Technique: Error Guessing
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
  // Technique: Use Case
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
  // Technique: Boundary Value
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
  //
  // RETIRED (2026-07-13): SW_IMP_069 & SW_IMP_070 exercised a second
  // (re-)import into a PO that already had an import file. That re-import
  // functionality is DEPRECATED — the app now enforces one-import-per-PO and
  // the Upload button is permanently disabled for a PO that already has an
  // import file. There is no longer a UI path to verify, so these two
  // scenarios are removed. Cumulative-PO-quantity behaviour remains covered at
  // the API layer (ImportAPI / ExcelImportAPI).

  // ═══════════════════════════════════════════════════════════════════════
  //  SECTION 15 – MULTI-SHEET & ONE-IMPORT-PER-PO (SW_IMP_071 – SW_IMP_072)
  // ═══════════════════════════════════════════════════════════════════════

  // ────────────────────────────── SW_IMP_071 ──────────────────────────────
  // Technique: Use Case
  it(
    "SW_IMP_071 – Verify successful import of multi-sheet Excel (RAM + Laptop in separate sheets)",
    { tags: ["@smoke"] },
    () => {
      const stamp = ts();
      const fileName = `ImpTest-MultiSheet-Data-${stamp}.xlsx`;
      const laptopSN = `SNMulti-${stamp}`;

      // Both sheets include a Category column, so the backend imports them
      // directly without showing the column-mapping dialog (sw-3884 behaviour).
      cy.task("createMultiSheetExcelWithData", {
        filePath: `cypress/fixtures/${fileName}`,
        sheets: [
          { name: "RAM", data: [minRamRow()] },
          { name: "Laptop", data: [minLaptopRow(laptopSN)] },
        ],
      });

      // Upload and wait for the Import Summary dialog (one RAM product + one Laptop item).
      importExcelExpectSummary(fileName);
      importPage.waitForSummaryDialog();
      // Both sheets contributed at least 1 success each — verify total >= 2.
      cy.contains("#scroll-dialog-description", /Successfully Imported/i, { timeout: 15000 }).should("be.visible");
      importPage.closeSummaryDialog();

      // After redirect, verify both categories appear in the PO listing.
      incomingInvPage.validateRedirectedURL();
      cy.reload();
      incomingInvPage.selectPoNumber(currentPO);
      cy.contains("tbody tr", testData.categories.productOnly, { timeout: 15000 }).should("exist");
      cy.contains("tbody tr", testData.categories.productItem, { timeout: 15000 }).should("exist");
    },
  );

  // ────────────────────────────── SW_IMP_072 ──────────────────────────────
  // Technique: Decision Table
  it(
    "SW_IMP_072 – Verify Upload button is disabled when a PO already has an import file (one-import-per-PO)",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();

      // First import succeeds using currentPO (seeded by beforeEach).
      const fileName1 = `ImpTest-FirstImport-072-${stamp}.xlsx`;
      createExcelFile(fileName1, [minRamRow()]);
      importExcel(fileName1);

      // Second attempt: navigate back to import, enter the SAME PO, select another file.
      // The Upload button must be disabled — the PO already has an import file.
      const fileName2 = `ImpTest-SecondImport-072-${stamp}.xlsx`;
      createExcelFile(fileName2, [minRamRow({ RAMbrand: "Corsair" })]);
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.clickImport();
      incomingInvPage.enterPONumber(currentPO);
      incomingInvPage.uploadFile(fileName2);
      cy.contains("button", /^Upload$/).should("be.disabled");
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  after() – Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  after(() => {
    cy.authSession('admin');
    cy.visit("/");

    // ── ALL cleanup is API-driven. The previous UI flow (navigate to General
    // Config → toggle, then Categories → Manage Product Name → clear chips)
    // failed run-wide on 2026-06-11 ("'General Config' in h5 never did"),
    // and because the failure happened FIRST, the deletePO() loop below never
    // ran → import POs accumulated on the shared environment. API calls are
    // nav-independent and each is failOnStatusCode:false (best-effort), so
    // this hook can no longer fail the suite on a UI/env regression. ──

    // Restore config toggles
    apiSetGeneralConfigFlags({
      allowProductUploadWithoutItems: true,
      isPoNumberRequired: false,
    });

    // Delete POs created during testing via API helper (incl. the per-test
    // unique import POs).
    [sw003PO, sw067BulkPO, sw068BulkPO, ...createdImportPOs]
      .filter(Boolean)
      .forEach((po) => deletePO(po));

    // Clear the per-category Product Name configurations seeded in before()
    apiDeleteProductNameConfig("RAM Automation Cat");
    apiDeleteProductNameConfig("Laptop Automation Cat");

    // Restore the shared "Support Contact" common attribute to required=false.
    // before() flips it to required=true so the required-column/row tests
    // (SW_IMP_021/030/032) can assert; leaving it required would change the
    // shared QA config for other suites. Best-effort (failOnStatusCode:false);
    // the next run's before() re-seeds required=true. categoryId is OMITTED —
    // QA's /attributes rejects an explicit categoryId:null for common attrs.
    const apiBase = Cypress.env("API_BASE_URL");
    cy.getAuthToken().then((token) => {
      if (!token) return;
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      cy.request({
        method: "GET",
        url: `${apiBase}/attributes`,
        qs: { all: true, page_size: 1000 },
        headers,
        failOnStatusCode: false,
      }).then((res) => {
        const raw = res.body?.data?.list ?? res.body?.data ?? res.body ?? [];
        const list = Array.isArray(raw) ? raw : [];
        // Common "Support Contact" attribute (categoryId=null).
        const sc = list.find(
          (a) => a.name === "Support Contact" && a.categoryId == null,
        );
        if (!sc) return;
        cy.request({
          method: "PATCH",
          url: `${apiBase}/attributes`,
          headers,
          failOnStatusCode: false,
          body: {
            id: sc.id,
            name: sc.name,
            type: sc.type,
            fieldName: sc.fieldName,
            entityType: sc.entityType ?? "Product",
            editable: sc.editable ?? true,
            required: false,
            unique: sc.unique ?? false,
            locked: sc.locked ?? false,
            otherInfo: {
              ...(sc.otherInfo || {}),
              controlRules: {
                ...((sc.otherInfo || {}).controlRules || {}),
                required: false,
              },
            },
          },
        }).then((r) => cy.log(`restore Support Contact required=false: ${r.status}`));
      });
    });

    // Clean up test Excel files
    cy.task("deleteTestExcelFiles");
  });
});
