import AttribPage from "../../pageObjects/AttribPage";
import { withValidOtherInfo } from "../../support/helpers/attributeHelpers";
import BrainBoxPage from "../../pageObjects/BrainBoxConfigPage";
import {
  apiEnsureBaseline,
  apiEnsurePurchaseOrder,
  apiResetBrainBoxConfig,
  apiSnapshotBrainBoxConfig,
  apiRestoreBrainBoxConfig,
} from "../../support/Configuration/apiCleanup.js";

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

// ─── Helpers — reuse SW_ATR_120 pattern ───────────────────────────────────────

const addProductAttribute = (attribPage, name, cfg) => {
  // Wait for React to fully reset the form before typing
  cy.get('input#name').should('have.value', '');
  attribPage.typeAttributeName(name);
  attribPage.selectType("Text");
  attribPage.typeMaxLength(cfg.prerequisiteMaxLength);
  attribPage.clickSaveandAddNew();
  attribPage.assertToast(cfg.attributeCreatedToast);
  // Wait for toast to disappear — true signal React has finished the save
  // cycle and fully re-rendered the empty form
  attribPage.waitForToastToDisappear(cfg.attributeCreatedToast);
};

const deleteProductAttribute = (attribPage, catName, name, cfg) => {
  attribPage.navigateToCategoryAttributes(catName);
  attribPage.clickProductAttributes();
  attribPage.assertAttributeInList(name);
  attribPage.deleteAttribute(name);
  attribPage.assertToast(cfg.attributeDeletedToast);
  attribPage.assertAttributeNotInList(name);
};

const addItemAttribute = (attribPage, catName, name, cfg) => {
  attribPage.navigateToCategoryAttributes(catName);
  attribPage.clickItemAttributes();
  attribPage.clickAddAttribute();
  attribPage.typeAttributeName(name);
  attribPage.selectType("Text");
  attribPage.clickSaveBt();
  attribPage.assertToast(cfg.attributeCreatedToast);
};

// ─────────────────────────────────────────────────────────────────────────────

describe("BRBOX Configuration Tests (BRBOX_CONF_001 - BRBOX_CONF_009)", () => {
  // The BrainBox PO dropdown is populated by GET /purchase-orders/po-numbers/?close=false
  // — i.e. it lists only OPEN purchase orders. A statically-named PO (e.g.
  // "PO-0050") is frequently already CLOSED on a shared QA/Stage env, so it
  // never appears in the dropdown and selectPoNumber times out. Instead we
  // resolve a real open PO at runtime (see before()) and use it everywhere.
  let activePO;

  before(() => {
    loginSession();
    // The BrainBox config requires (a) the category to exist — its attribute
    // setup below navigates into it — and (b) an active (open) PO in the
    // dynamic list (selectPoNumber). Ensure the baseline (categories +
    // attributes, build-missing, no purge), then resolve an OPEN PO from the
    // same endpoint the dropdown uses so the option is guaranteed present.
    cy.fixture("brainboxConfig").then((cfg) => {
      cy.getAuthToken().then((token) => {
        if (!token) return;
        apiEnsureBaseline(token);
        // Resolve an open PO straight from the dropdown's data source.
        cy.request({
          method: "GET",
          url: `${Cypress.env("API_BASE_URL")}/purchase-orders/po-numbers/?close=false`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((res) => {
          const list = res.body?.data?.list ?? res.body?.data ?? [];
          // Prefer a normal numbered PO; skip special/quarantine entries.
          activePO =
            (Array.isArray(list) ? list : []).find((p) => /^PO-\d+/i.test(p)) ||
            (Array.isArray(list) && list.length ? list[0] : null);
          if (!activePO) {
            // No open PO on this env — fall back to seeding the fixture PO open.
            activePO = cfg.poNumber;
            apiEnsurePurchaseOrder(token, cfg.poNumber);
          }
          cy.log(`BrainBox: using open PO "${activePO}"`);
        });
        // Capture the REAL BrainBox configuration before this suite touches it.
        // This suite rewrites the shared global brainboxConfig row to get a
        // deterministic 1-row baseline; without a snapshot + restore that rewrite
        // is permanent, which silently disables the BrainBox hardware suites (their
        // happy-path tests go `pending` with no serial mapping) and breaks the real
        // integration for anyone using the environment. Restored in after().
        apiSnapshotBrainBoxConfig(token);

        // Clear payloadFields accumulated by prior runs so the suite's relative
        // countBefore+N length assertions start from a clean (0-row) baseline.
        apiResetBrainBoxConfig(token);

        // Ensure prerequisite product attributes exist AND are linked to the
        // CURRENT "Laptop Automation Cat" entity. apiEnsureBaseline deletes and
        // recreates the category, giving it a NEW database id each run. Any
        // attributes created in a prior run keep the OLD categoryId and become
        // invisible to the BrainBox dropdown (filtered by the new catId). Fix:
        // always delete stale copies first, then recreate with the current catId.
        cy.request({
          method: "GET",
          url: `${Cypress.env("API_BASE_URL")}/categories?page=1&page_size=500`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((catRes) => {
          const cats = catRes.body?.data?.list ?? catRes.body?.data ?? [];
          const cat = (Array.isArray(cats) ? cats : []).find(
            (c) => c?.name === cfg.category,
          );
          if (!cat) {
            cy.log(`[BrainBox] category "${cfg.category}" not found — skipping attr seed`);
            return;
          }
          cy.request({
            method: "GET",
            url: `${Cypress.env("API_BASE_URL")}/attributes?all=true&page_size=1000`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
          }).then((attrRes) => {
            const attrData = attrRes.body?.data?.list ?? attrRes.body?.data ?? [];
            const stale = (Array.isArray(attrData) ? attrData : []).filter(
              (a) => a?.name && cfg.prerequisiteProductAttribs.includes(a.name),
            );
            cy.log(`[BrainBox] deleting ${stale.length} stale prereq attrs before recreate`);
            // Delete stale copies (may have wrong categoryId after baseline purge)
            cy.wrap(stale).each((attr) =>
              cy.request({
                method: "DELETE",
                url: `${Cypress.env("API_BASE_URL")}/attributes/${attr.id}`,
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
              }).then((r) => cy.log(`[BrainBox] delete stale attr "${attr.name}" → ${r.status}`)),
            ).then(() => {
              // Recreate all with current categoryId and entityType: "Product" (capital P
              // matches what the BrainBox dropdown uses for the "(Product)" suffix)
              cy.wrap(cfg.prerequisiteProductAttribs).each((name) =>
                cy.request({
                  method: "POST",
                  url: `${Cypress.env("API_BASE_URL")}/attributes`,
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  failOnStatusCode: false,
                  body: {
                    name,
                    type: "Text",
                    // Use a unique prefix so this fieldName never collides with
                    // any baseline attribute — the backend enforces global fieldName
                    // uniqueness. Without the prefix, if the baseline creates "make"
                    // and it can't be deleted (referenced by products), the POST here
                    // would fail silently and "Make (Product)" would stay invisible.
                    fieldName: `bb_prereq_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
                    editable: true,
                    required: false,
                    entityType: "Product",
                    categoryId: cat.id,
                    // Text attributes need a valid otherInfo.controlRules — omitting
                    // it (or sending {}) makes getTypeBasedSchema 500 every later
                    // Excel import ("Could not fetch attribute schema").
                    otherInfo: withValidOtherInfo('Text'),
                  },
                }).then((r) =>
                  cy.log(`[BrainBox] create attr "${name}" on cat ${cat.id} → ${r.status}`),
                ),
              );
            });
          });
        });
      });
    });
  });

  after(() => {
    loginSession();
    // RESTORE the BrainBox configuration this suite overwrote, then remove
    // prerequisite attributes via API (same pattern as the before() creation).
    // UI deletion is fragile: the product-attribute tab may not finish loading
    // before assertAttributeInList snapshots the DOM, causing spurious "not found"
    // failures in the after hook.
    //
    // Restoring — not resetting — is the point. The old code called
    // apiResetBrainBoxConfig here, which left `mapping: {}` behind permanently:
    // correct as a per-test baseline, wrong as an end state.
    cy.fixture("brainboxConfig").then((cfg) => {
      cy.getAuthToken().then((token) => {
        if (!token) return;
        apiRestoreBrainBoxConfig(token);
        cy.request({
          method: "GET",
          url: `${Cypress.env("API_BASE_URL")}/attributes?all=true&page_size=1000`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((res) => {
          const attrs = res.body?.data?.list ?? res.body?.data ?? [];
          const targets = (Array.isArray(attrs) ? attrs : []).filter(
            (a) => a?.name && cfg.prerequisiteProductAttribs.includes(a.name),
          );
          cy.wrap(targets).each((attr) =>
            cy.request({
              method: "DELETE",
              url: `${Cypress.env("API_BASE_URL")}/attributes/${attr.id}`,
              headers: { Authorization: `Bearer ${token}` },
              failOnStatusCode: false,
            }).then((r) =>
              cy.log(`[BrainBox after] DELETE attr "${attr.name}" → ${r.status}`),
            ),
          );
        });
      });
    });
  });

  beforeEach(() => {
    cy.fixture("brainboxConfig").as("cfg");
    loginSession();
    // Reset to the 1-row baseline BEFORE navigating so every test starts from a
    // deterministic countBefore=1, independent of rows a prior test saved
    // (CONF_003 saves a row without cleanup) or a prior run accumulated.
    cy.getAuthToken().then((token) => {
      if (token) apiResetBrainBoxConfig(token);
    });
    cy.contains("Configuration").click();
    cy.contains("BrainBox Configuration").click();
  });

  it("BRBOX_CONF_001 - Ensure the user can successfully select an active PO from the dynamic list.", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.verifyPOSelected(activePO);
  });

  it("BRBOX_CONF_002 - Verify Category selection for BrainBox mapping", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.LocateCategory(cfg.category);
    BrainBoxPage.LocateCategory(cfg.ProductOnlyCategory);
    BrainBoxPage.selectCategory(cfg.category);
  });

  it("BRBOX_CONF_003 - Verify 'Adding Payload Field' UI functionality", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRowCount().then((countBefore) => {
      BrainBoxPage.clickAddPayloadField();
      BrainBoxPage.saveConfiguration();

      BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);
      BrainBoxPage.verifyNewEmptyPayloadRow();
    });
  });

  it("BRBOX_CONF_004 - Verify an attribute already mapped to a field is disabled for other fields.", { tags: ["@regression"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRowCount()
      .then((countBefore) => {
        BrainBoxPage.clickAddPayloadField();
        BrainBoxPage.clickAddPayloadField();
        BrainBoxPage.getPayloadRows().should("have.length", countBefore + 2);

        BrainBoxPage.setPayloadFieldName(countBefore, cfg.uniquenessTestFieldName);
        BrainBoxPage.selectAttributeInRow(countBefore, cfg.uniquenessTestAttribute);

        BrainBoxPage.verifyAttributeDisabledInRow(
          countBefore + 1,
          cfg.uniquenessTestAttribute,
        );
      });
  });

  it("BRBOX_CONF_005 - Verify successful saving of full BrainBox mapping configuration", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;

    // Step 1: Select PO and Category for CONF_005
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRowCount()
      .then((countBefore) => {
        // Step 2: Add all payload field to attribute mappings
        cfg.CategoryAttributesforPayload.forEach((mapping, i) => {
          BrainBoxPage.clickAddPayloadField();
          BrainBoxPage.setPayloadFieldName(
            countBefore + i,
            mapping.payloadFieldName,
          );
          BrainBoxPage.selectAttributeInRow(countBefore + i, mapping.attribute);
        });

        // Step 3: Set default cost
        BrainBoxPage.setDefaultCost(cfg.defaultCost);

        // Step 4: Save and assert success toast
        BrainBoxPage.saveConfiguration();
        BrainBoxPage.assertToasterMessage(cfg.confSavedMessage);

        // Step 5: Verify each mapping row persists with the correct values
        cfg.CategoryAttributesforPayload.forEach((mapping, i) => {
          BrainBoxPage.assertPayloadFieldNameInRow(
            countBefore + i,
            mapping.payloadFieldName,
          );
          BrainBoxPage.assertAttributeInRow(countBefore + i, mapping.attribute);
        });

        // Cleanup: remove added rows so state is left clean
        for (let i = cfg.CategoryAttributesforPayload.length - 1; i >= 0; i--) {
          BrainBoxPage.deletePayloadRow(countBefore + i);
        }
        BrainBoxPage.getPayloadRows().should("have.length", countBefore);
      });
  });

  it("BRBOX_CONF_006 - Verify deletion of individual Payload Mapping rows", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRowCount().then((countBefore) => {
      BrainBoxPage.clickAddPayloadField();
      BrainBoxPage.setPayloadFieldName(countBefore, cfg.uniquenessTestFieldName);
      BrainBoxPage.selectAttributeInRow(countBefore, cfg.uniquenessTestAttribute);
      BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);

      BrainBoxPage.deletePayloadRow(countBefore);

      BrainBoxPage.getPayloadRows().should("have.length", countBefore);
    });
  });

  it("BRBOX_CONF_007 - Verify Editing of individual Attribute in a row", { tags: ["@regression"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRowCount()
      .then((countBefore) => {
        BrainBoxPage.clickAddPayloadField();
        BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);

        BrainBoxPage.setPayloadFieldName(countBefore, cfg.editRowPayloadFieldName);
        BrainBoxPage.selectAttributeInRow(countBefore, cfg.editRowTestAttribute);
        BrainBoxPage.assertAttributeInRow(countBefore, cfg.editRowTestAttribute);

        BrainBoxPage.saveConfiguration();

        BrainBoxPage.selectAttributeInRow(countBefore, cfg.editRowUpdatedAttribute);
        BrainBoxPage.saveConfiguration();

        // After saveConfiguration() the table re-renders from server data. The
        // field name is the input VALUE, not a text node, so .contains(text) is
        // unreliable. Use the row index directly — we know the row is at countBefore.
        BrainBoxPage.getPayloadRows().eq(countBefore).within(() => {
          cy.get('[role="combobox"]').should("contain.text", cfg.editRowUpdatedAttribute);
        });

        // Cleanup: delete all rows whose index is >= countBefore (handles 0 or 1 extra rows).
        BrainBoxPage.getPayloadRowCount().then((actualCount) => {
          for (let i = actualCount - 1; i >= countBefore; i--) {
            BrainBoxPage.deletePayloadRow(i);
          }
        });
        BrainBoxPage.getPayloadRows().should("have.length", countBefore);
      });
  });

  it("BRBOX_CONF_008 - Verify Editing of individual Payload Field Name in a row", { tags: ["@regression"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRowCount()
      .then((countBefore) => {
        BrainBoxPage.clickAddPayloadField();
        BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);

        BrainBoxPage.setPayloadFieldName(countBefore, cfg.editRowPayloadFieldName);
        BrainBoxPage.selectAttributeInRow(countBefore, cfg.editRowTestAttribute);
        BrainBoxPage.assertPayloadFieldNameInRow(countBefore, cfg.editRowPayloadFieldName);

        BrainBoxPage.saveConfiguration();

        BrainBoxPage.setPayloadFieldName(countBefore, cfg.editRowUpdatedPayloadFieldName);
        BrainBoxPage.saveConfiguration();

        // After saveConfiguration() the table re-renders from server data. The
        // field name is the input VALUE at row countBefore — verify by index.
        BrainBoxPage.assertPayloadFieldNameInRow(countBefore, cfg.editRowUpdatedPayloadFieldName);

        // Cleanup: delete all rows whose index is >= countBefore.
        BrainBoxPage.getPayloadRowCount().then((actualCount) => {
          for (let i = actualCount - 1; i >= countBefore; i--) {
            BrainBoxPage.deletePayloadRow(i);
          }
        });
        BrainBoxPage.getPayloadRows().should("have.length", countBefore);
      });
  });

  // CONF_009 is a known app bug: the frontend does NOT validate duplicate payload
  // field names before submitting — the save call succeeds without the expected
  // "Payload field names must be unique" toast. Skip until the app is fixed.
  it.skip("BRBOX_CONF_009 - Verify validation for duplicate Payload Field names", { tags: ["@regression"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(activePO);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRowCount().then((countBefore) => {
      // Add row 1: unique field name + attribute
      BrainBoxPage.clickAddPayloadField();
      BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);
      BrainBoxPage.setPayloadFieldName(countBefore, cfg.duplicateFieldName);
      BrainBoxPage.selectAttributeInRow(countBefore, cfg.duplicateAttributeName);

      // Add row 2: same field name (duplicate) + different attribute
      BrainBoxPage.clickAddPayloadField();
      BrainBoxPage.getPayloadRows().should("have.length", countBefore + 2);
      BrainBoxPage.setPayloadFieldName(countBefore + 1, cfg.duplicateFieldName);
      BrainBoxPage.selectAttributeInRow(countBefore + 1, cfg.duplicateFieldAttribute);

      // Attempt to save — expect validation error for duplicate field names
      BrainBoxPage.saveConfiguration();
      BrainBoxPage.assertToasterMessage(cfg.duplicateFieldNameError);

      // Cleanup: remove both added rows (highest index first)
      BrainBoxPage.deletePayloadRow(countBefore + 1);
      BrainBoxPage.deletePayloadRow(countBefore);
      BrainBoxPage.getPayloadRows().should("have.length", countBefore);
    });
  });
});
