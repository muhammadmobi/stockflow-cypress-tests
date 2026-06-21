import importLocators from '../support/locators/importLocators';

class ImportPage {
  verifyImportErrorMessages(importConfig) {
    cy.get(importLocators.errorDialog).within(() => {
      cy.contains(importConfig.errorMessages.missingRequiredColumn).should('be.visible');
      cy.contains(importConfig.errorMessages.invalidCPU).should('be.visible');
    });
  }

  // ─── Import Summary popup helpers ────────────────────────────────────────

  /**
   * Wait for the Import Summary / Error dialog to be visible.
   * Uses a generous timeout to accommodate slow upload backend responses.
   */
  waitForSummaryDialog() {
    cy.get(importLocators.errorDialog, { timeout: 30000 }).should("be.visible");
  }

  /**
   * Verify the "Successfully Imported" count on the Import Summary popup.
   */
  verifySuccessCount(expectedCount) {
    cy.contains("Successfully Imported")
      .closest(importLocators.summaryCard)
      .find(importLocators.countChip)
      .should("contain.text", expectedCount);
  }

  /**
   * Verify the "Existing Values Ignored" card count.
   */
  verifyExistingValuesIgnoredCount(expectedCount) {
    cy.contains("Existing Values Ignored")
      .closest(importLocators.summaryCard)
      .find(importLocators.countChip)
      .should("contain.text", expectedCount);
  }

  /**
   * Verify the "Duplicate Values in Sheet" card count.
   */
  verifyDuplicateValuesCount(expectedCount) {
    cy.contains("Duplicate Values in Sheet")
      .closest(importLocators.summaryCard)
      .find(importLocators.countChip)
      .should("contain.text", expectedCount);
  }

  /**
   * Verify specific serial number appears inside "Existing Values Ignored" records.
   */
  verifyExistingValueRecord(serialNumber) {
    cy.contains("Existing Values Ignored").click();
    cy.contains(serialNumber).should("be.visible");
  }

  /**
   * Verify that the "Extra Columns Ignored" card contains specific column names.
   */
  verifyExtraColumnsIgnored(columnNames) {
    cy.contains("Extra Columns Ignored").click();
    columnNames.forEach((col) => {
      cy.contains(col).should("be.visible");
    });
  }

  /**
   * Verify that the "Extra Columns Ignored" card appears with a count.
   */
  verifyExtraColumnsIgnoredCount(expectedCount) {
    cy.contains("Extra Columns Ignored")
      .closest(importLocators.summaryCard)
      .find(importLocators.countChip)
      .should("contain.text", expectedCount);
  }

  /**
   * Click the "Extra Columns Ignored" card to expand its details.
   */
  clickExtraColumnsIgnored() {
    cy.contains("Extra Columns Ignored").click();
  }

  /**
   * Click the "Existing Values Ignored" card to expand its details.
   */
  clickExistingValuesIgnored() {
    cy.contains("Existing Values Ignored").click();
  }

  /**
   * Click the product details header panel to expand it.
   */
  clickProductDetailsHeader() {
    cy.get(importLocators.productDetailsHeader).click();
  }

  /**
   * Verify a row-level error message appears in the Error Summary dialog.
   * @param {string} errorSubstring — a substring to match (e.g. "Column: Capacity must be a number")
   */
  verifyErrorContains(errorSubstring) {
    cy.contains(errorSubstring, { timeout: 15000 }).should(
      "have.css",
      "opacity",
      "1",
    );
  }

  /**
   * Verify a specific row number appears in the Error Summary dialog.
   * Row numbers are rendered in the "Row" column of the error table.
   * @param {number|string} rowNumber — the expected row number (e.g. 2)
   */
  verifyErrorRowNumber(rowNumber) {
    cy.get(importLocators.errorDialog)
      .contains(String(rowNumber))
      .should('have.css', 'opacity', '1');
  }

  /**
   * Close the Error Summary dialog (Cancel button).
   */
  closeErrorDialog() {
    cy.contains("button", "Cancel")
      .should("have.css", "opacity", "1")
      .click({force: true});
  }

  /**
   * Click OK on the Import Summary dialog.
   */
  closeSummaryDialog() {
    cy.contains("button", "OK").click({force: true});
  }
}

export default ImportPage;