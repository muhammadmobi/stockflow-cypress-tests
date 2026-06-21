import AttribPage from "../../pageObjects/AttribPage";
import BrainBoxPage from "../../pageObjects/BrainBoxConfigPage";

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
  before(() => {
    loginSession();
    cy.fixture("brainboxConfig").then((cfg) => {
      const attribPage = new AttribPage();
      attribPage.navigateToCategoryAttributes(cfg.category);
      attribPage.clickProductAttributes();
      attribPage.clickAddAttribute();
      cfg.prerequisiteProductAttribs.forEach((name) => {
        addProductAttribute(attribPage, name, cfg);
      });
    });
  });

  after(() => {
    loginSession();
    cy.fixture("brainboxConfig").then((cfg) => {
      const attribPage = new AttribPage();
      cfg.prerequisiteProductAttribs.forEach((name) => {
        deleteProductAttribute(attribPage, cfg.category, name, cfg);
      });
    });
  });

  beforeEach(() => {
    cy.fixture("brainboxConfig").as("cfg");
    loginSession();
    cy.contains("Configuration").click();
    cy.contains("BrainBox Configuration").click();
  });

  it("BRBOX_CONF_001 - Ensure the user can successfully select an active PO from the dynamic list.", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.verifyPOSelected(cfg.poNumber);
  });

  it("BRBOX_CONF_002 - Verify Category selection for BrainBox mapping", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.LocateCategory(cfg.category);
    BrainBoxPage.LocateCategory(cfg.ProductOnlyCategory);
    BrainBoxPage.selectCategory(cfg.category);
  });

  it("BRBOX_CONF_003 - Verify 'Adding Payload Field' UI functionality", { tags: ["@smoke"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRows().its("length").then((countBefore) => {
      BrainBoxPage.clickAddPayloadField();
      BrainBoxPage.saveConfiguration();

      BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);
      BrainBoxPage.verifyNewEmptyPayloadRow();
    });
  });

  it("BRBOX_CONF_004 - Verify an attribute already mapped to a field is disabled for other fields.", { tags: ["@regression"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRows()
      .its("length")
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
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRows()
      .its("length")
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
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRows().its("length").then((countBefore) => {
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
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRows()
      .its("length")
      .then((countBefore) => {
        BrainBoxPage.clickAddPayloadField();
        BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);

        BrainBoxPage.setPayloadFieldName(countBefore, cfg.editRowPayloadFieldName);
        BrainBoxPage.selectAttributeInRow(countBefore, cfg.editRowTestAttribute);
        BrainBoxPage.assertAttributeInRow(countBefore, cfg.editRowTestAttribute);

        BrainBoxPage.saveConfiguration();

        BrainBoxPage.selectAttributeInRow(countBefore, cfg.editRowUpdatedAttribute);
        BrainBoxPage.saveConfiguration();

        BrainBoxPage.assertAttributeInRow(countBefore, cfg.editRowUpdatedAttribute);

        // Cleanup
        BrainBoxPage.deletePayloadRow(countBefore);
        BrainBoxPage.getPayloadRows().should("have.length", countBefore);
      });
  });

  it("BRBOX_CONF_008 - Verify Editing of individual Payload Field Name in a row", { tags: ["@regression"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRows()
      .its("length")
      .then((countBefore) => {
        BrainBoxPage.clickAddPayloadField();
        BrainBoxPage.getPayloadRows().should("have.length", countBefore + 1);

        BrainBoxPage.setPayloadFieldName(countBefore, cfg.editRowPayloadFieldName);
        BrainBoxPage.selectAttributeInRow(countBefore, cfg.editRowTestAttribute);
        BrainBoxPage.assertPayloadFieldNameInRow(countBefore, cfg.editRowPayloadFieldName);

        BrainBoxPage.saveConfiguration();

        BrainBoxPage.setPayloadFieldName(countBefore, cfg.editRowUpdatedPayloadFieldName);
        BrainBoxPage.saveConfiguration();

        BrainBoxPage.assertPayloadFieldNameInRow(
          countBefore,
          cfg.editRowUpdatedPayloadFieldName,
        );

        // Cleanup
        BrainBoxPage.deletePayloadRow(countBefore);
        BrainBoxPage.getPayloadRows().should("have.length", countBefore);
      });
  });

  it("BRBOX_CONF_009 - Verify validation for duplicate Payload Field names", { tags: ["@regression"] }, function () {
    const cfg = this.cfg;
    BrainBoxPage.selectPoNumber(cfg.poNumber);
    BrainBoxPage.selectCategory(cfg.category);

    BrainBoxPage.getPayloadRows().its("length").then((countBefore) => {
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
