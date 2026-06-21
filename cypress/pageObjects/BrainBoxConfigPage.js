const Locators = require('../support/locators/brainboxConfigLocators');

class BrainBoxConfigPage {
  visit(path = "/") {
    cy.visit(path);
  }

  ensureOnPage() {
    Locators.header();
  }

  LocateCategory(value) {
    Locators.comboboxWithinLabel("Category").click();
    cy.get('ul[role="listbox"]', { timeout: 8000 })
      .should("be.visible")
      .contains(value)
      .scrollIntoView()
      .should("be.visible");
    cy.get("body").type("{esc}");
  }

  selectPoNumber(value) {
    Locators.comboboxWithinLabel("PO Number").click();
    cy.get('ul[role="listbox"]')
      .contains(value)
      .scrollIntoView()
      .click({ force: true });
  }

  verifyPOSelected(expected) {
    Locators.comboboxWithinLabel("PO Number").should("contain.text", expected);
  }

  selectCategory(value) {
    Locators.comboboxWithinLabel("Category").click();
    cy.get('ul[role="listbox"]').contains(value).click({ force: true });
  }

  setDefaultCost(cost) {
    Locators.inputWithinLabel("Default Cost").clear().type(String(cost));
  }

  clickAddPayloadField() {
    Locators.addPayloadButton().click();
  }

  verifyNewEmptyPayloadRow() {
    Locators.lastPayloadRow().within(() => {
      cy.get('input[type="text"]').should("have.value", "");
      cy.get('[role="combobox"]').should("exist");
    });
  }

  getPayloadRowCount() {
    return Locators.payloadTableRows().its("length");
  }

  addPayloadField(fieldName, attribute) {
    Locators.addPayloadButton().click();
    // fill last row
    Locators.lastPayloadRow().within(() => {
      cy.get('input[type="text"]').clear().type(fieldName);
      cy.get('[role="combobox"]').click();
    });
    // select attribute from listbox (outside the row)
    cy.get('ul[role="listbox"]').contains(attribute).click({ force: true });
  }

  saveConfiguration() {
    Locators.saveButton().click();
  }

  getPayloadRows() {
    return Locators.payloadTableRows();
  }

  assertPayloadMappings(expectedMappings) {
    this.getPayloadRows().should("have.length", expectedMappings.length);
    expectedMappings.forEach((m, idx) => {
      this.getPayloadRows()
        .eq(idx)
        .within(() => {
          cy.get('input[type="text"]').should("have.value", m.payloadFieldName);
          cy.get('.MuiSelect-select, [role="combobox"]')
            .first()
            .should("contain.text", m.attribute);
        });
    });
  }

  deletePayloadFieldByName(name) {
    this.getPayloadRows()
      .contains("input", name)
      .parents("tr")
      .within(() => {
        cy.get('button[type="button"]').click();
      });
  }

  deletePayloadRow(rowIndex) {
    this.getPayloadRows()
      .eq(rowIndex)
      .within(() => {
        cy.get('button[type="button"]').click();
      });
  }

  editPayloadField(oldName, newName, newAttribute) {
    this.getPayloadRows()
      .contains("input", oldName)
      .parents("tr")
      .within(() => {
        cy.get('input[type="text"]').clear().type(newName);
        cy.get('[role="combobox"]').click();
      });
    cy.get('ul[role="listbox"]').contains(newAttribute).click({ force: true });
  }

  selectAttributeInRow(rowIndex, attributeName) {
    this.getPayloadRows()
      .eq(rowIndex)
      .within(() => {
        cy.get('[role="combobox"]').click();
      });
    cy.get('ul[role="listbox"]').contains(attributeName).click({ force: true });
  }

  setPayloadFieldName(rowIndex, fieldName) {
    this.getPayloadRows()
      .eq(rowIndex)
      .within(() => {
        cy.get('input[type="text"]')
          .should("be.visible")
          .click()
          .type("{selectAll}{backspace}", { delay: 50 })
          .should("have.value", "")
          .wait(200) // 👈 let React settle
          .type(fieldName, { delay: 50 })
          .should("have.value", fieldName);
      });
  }

  assertPayloadFieldNameInRow(rowIndex, fieldName) {
    this.getPayloadRows()
      .eq(rowIndex)
      .within(() => {
        cy.get('input[type="text"]').should("have.value", fieldName);
      });
  }

  assertAttributeInRow(rowIndex, attributeName) {
    this.getPayloadRows()
      .eq(rowIndex)
      .within(() => {
        cy.get('.MuiSelect-select, [role="combobox"]')
          .first()
          .should("contain.text", attributeName);
      });
  }

  verifyAttributeDisabledInRow(rowIndex, attributeName) {
    this.getPayloadRows()
      .eq(rowIndex)
      .within(() => {
        cy.get('[role="combobox"]').click();
      });
    cy.get('ul[role="listbox"]', { timeout: 8000 })
      .should("be.visible")
      .contains(attributeName)
      .should("have.attr", "aria-disabled", "true");
    cy.get("body").type("{esc}");
  }

  assertToasterMessage(expectedMessage) {
    cy.contains(expectedMessage, { timeout: 5000 }).should("be.visible");
  }

  waitForToastToDisappear(expectedMessage) {
    cy.contains(expectedMessage, { timeout: 10000 }).should("not.exist");
  }
}

module.exports = new BrainBoxConfigPage();
