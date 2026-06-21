import "cypress-map";
import SCAN_CONFIG_LOCATORS from "../support/locators/scanConfigLocators";

class ScanConfigPage {
  navigateToScanConfig() {
    cy.contains(SCAN_CONFIG_LOCATORS.CONFIGURATION_LINK).click();
    cy.contains(SCAN_CONFIG_LOCATORS.SCAN_CONFIG_LINK).click();
  }

  clickCheckboxByLabel(labelText) {
    cy.get(SCAN_CONFIG_LOCATORS.CHECKBOX_BY_ARIA_LABEL(labelText))
      .closest(SCAN_CONFIG_LOCATORS.CHECKBOX_CONTAINER)
      .find(SCAN_CONFIG_LOCATORS.CHECKBOX_INPUT)
      .click();
  }

  clickUpdateButton() {
    cy.contains(SCAN_CONFIG_LOCATORS.UPDATE_BUTTON).click();
  }

  validateToastMessage(expectedMessage) {
    cy.contains(expectedMessage)
      .should("be.visible")
      .and("contain.text", expectedMessage);
  }

  clickClearBt() {
    cy.contains(SCAN_CONFIG_LOCATORS.CLEAR_BUTTON).click();
  }

  verifySelectedCount(n) {
    cy.contains("p", "Selected:").find("span").should("have.text", n);
  }

  getCheckedCheckboxCount() {
    return cy.get(SCAN_CONFIG_LOCATORS.CHECKBOX_INPUT).then(($checkboxes) => {
      const checkedCount = $checkboxes.filter((i, el) => {
        return el.checked === true;
      }).length;

      cy.log(`Checked checkboxes: ${checkedCount}`);
      return cy.wrap(checkedCount); // ✅ wrap in cy to avoid sync/async mix
    });
  }

  verifyCheckboxIsChecked(labelText) {
    cy.get(SCAN_CONFIG_LOCATORS.CHECKBOX_BY_ARIA_LABEL(labelText))
      .closest(SCAN_CONFIG_LOCATORS.CHECKBOX_CONTAINER)
      .find(SCAN_CONFIG_LOCATORS.CHECKBOX_INPUT)
      .should("be.checked");
  }

  verifyCheckboxIsUnchecked(labelText) {
    cy.get(SCAN_CONFIG_LOCATORS.CHECKBOX_BY_ARIA_LABEL(labelText))
      .closest(SCAN_CONFIG_LOCATORS.CHECKBOX_CONTAINER)
      .find(SCAN_CONFIG_LOCATORS.CHECKBOX_INPUT)
      .should("not.be.checked");
  }

  verifyAllCheckboxesUnchecked() {
    // Assert ALL checkboxes are unchecked - FAIL test if any are checked (don't auto-fix)
    cy.get(SCAN_CONFIG_LOCATORS.CHECKBOX_INPUT).each(($checkbox) => {
      cy.wrap($checkbox).should("not.be.checked");
    });
  }

  uncheckAllCheckboxes() {
    cy.get(SCAN_CONFIG_LOCATORS.CHECKBOX_INPUT).each(($checkbox) => {
      cy.wrap($checkbox).then(($el) => {
        if ($el.is(":checked")) {
          cy.wrap($el).click();
        }
      });
    });
  }
}

export default ScanConfigPage;