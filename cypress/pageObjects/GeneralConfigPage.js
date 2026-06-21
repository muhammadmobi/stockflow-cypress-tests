class GeneralConfigPage {
  constructor() {
    // Navigation elements
    this.configurationNav = () => cy.contains("span", "Configuration");
    this.generalConfigSubmenu = () => cy.contains("span", "General Config");

    // Toggle elements
    this.allowProductUploadWithoutItemsToggle = () =>
      cy.get('input[name="allowProductUploadWithoutItems"]');
    this.allowProductUploadWithoutItemsLabel = () =>
      cy.contains("p.MuiTypography-root", "Allow Product Upload Without Items");
    this.allowImportExportAttributesToggle = () =>
      cy.get('input[name="enableImportExportAttributes"]');
    this.allowImportExportAttributesLabel = () =>
      cy.contains("p.MuiTypography-root", "Allow Import/Export of Attributes");
  }

  /**
   * Navigate to Configuration > General Config
   */
  navigateToGeneralConfig() {
    this.configurationNav().click();
    this.generalConfigSubmenu().click();
    cy.contains("h5", "General Config").should("be.visible");
  }

  /**
   * Check if "Allow Product Upload Without Items" toggle is enabled
   * @returns {Cypress.Chainable<boolean>}
   */
  isAllowProductUploadWithoutItemsEnabled() {
    return this.allowProductUploadWithoutItemsToggle().then(($toggle) => {
      return $toggle.is(":checked");
    });
  }

  /**
   * Disable "Allow Product Upload Without Items" toggle if it's enabled
   */
  disableAllowProductUploadWithoutItems() {
    this.allowProductUploadWithoutItemsToggle().then(($toggle) => {
      if ($toggle.is(":checked")) {
        cy.log("Toggle is enabled. Disabling it...");
        this.allowProductUploadWithoutItemsToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else {
        cy.log("Toggle is already disabled.");
      }
    });
  }

  /**
   * Enable "Allow Product Upload Without Items" toggle if it's disabled
   */
  enableAllowProductUploadWithoutItems() {
    this.allowProductUploadWithoutItemsToggle().then(($toggle) => {
      if (!$toggle.is(":checked")) {
        cy.log("Toggle is disabled. Enabling it...");
        this.allowProductUploadWithoutItemsToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else {
        cy.log("Toggle is already enabled.");
      }
    });
  }

 

  /**
   * Set the "Allow Product Upload Without Items" toggle to a specific state
   * @param {boolean} shouldEnable - true to enable, false to disable
   */
  setAllowProductUploadWithoutItems(shouldEnable) {
    this.allowProductUploadWithoutItemsToggle().then(($toggle) => {
      const isCurrentlyEnabled = $toggle.is(":checked");

      if (shouldEnable && !isCurrentlyEnabled) {
        cy.log("Enabling toggle...");
        this.allowProductUploadWithoutItemsToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else if (!shouldEnable && isCurrentlyEnabled) {
        cy.log("Disabling toggle...");
        this.allowProductUploadWithoutItemsToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else {
        cy.log(
          `Toggle is already in the desired state: ${shouldEnable ? "enabled" : "disabled"}`,
        );
      }
    });
  }

  /**
   * Verify the toggle state
   * @param {boolean} shouldBeEnabled - expected state
   */
  verifyToggleState(shouldBeEnabled) {
    this.allowProductUploadWithoutItemsToggle().should(
      shouldBeEnabled ? "be.checked" : "not.be.checked",
    );
  }

  /**
   * Verify the General Config page is loaded
   */
  verifyPageLoaded() {
    this.allowProductUploadWithoutItemsLabel().should("be.visible");
  }

  // ─── Allow Import/Export of Attributes Toggle ───

  /**
   * Check if "Allow Import/Export of Attributes" toggle is enabled
   * @returns {Cypress.Chainable<boolean>}
   */
  isAllowImportExportAttributesEnabled() {
    return this.allowImportExportAttributesToggle().then(($toggle) => {
      return $toggle.is(":checked");
    });
  }

  /**
   * Disable "Allow Import/Export of Attributes" toggle if it's enabled
   */
  disableAllowImportExportAttributes() {
    this.allowImportExportAttributesToggle().then(($toggle) => {
      if ($toggle.is(":checked")) {
        cy.log("Toggle is enabled. Disabling it...");
        this.allowImportExportAttributesToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else {
        cy.log("Toggle is already disabled.");
      }
    });
  }

  /**
   * Enable "Allow Import/Export of Attributes" toggle if it's disabled
   */
  enableAllowImportExportAttributes() {
    this.allowImportExportAttributesToggle().then(($toggle) => {
      if (!$toggle.is(":checked")) {
        cy.log("Toggle is disabled. Enabling it...");
        this.allowImportExportAttributesToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else {
        cy.log("Toggle is already enabled.");
      }
    });
  }

  /**
   * Set the "Allow Import/Export of Attributes" toggle to a specific state
   * @param {boolean} shouldEnable - true to enable, false to disable
   */
  setAllowImportExportAttributes(shouldEnable) {
    this.allowImportExportAttributesToggle().then(($toggle) => {
      const isCurrentlyEnabled = $toggle.is(":checked");

      if (shouldEnable && !isCurrentlyEnabled) {
        cy.log("Enabling toggle...");
        this.allowImportExportAttributesToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else if (!shouldEnable && isCurrentlyEnabled) {
        cy.log("Disabling toggle...");
        this.allowImportExportAttributesToggle().click({ force: true });
        cy.contains("Settings successfully updated.").should("be.visible");
      } else {
        cy.log(
          `Toggle is already in the desired state: ${shouldEnable ? "enabled" : "disabled"}`,
        );
      }
    });
  }

  // ─── Product Name Configuration ────────────────────────────────────────────

  getProductNameContainer() {
    return cy.contains("p", "Product Name").closest("div[class]").parent();
  }

  openProductNameDropdown() {
    this.getProductNameContainer()
      .find('input[role="combobox"]')
      .should("exist")
      .click({ force: true });
  }

  assertDropdownContains(attrName) {
    cy.get('[id^="react-select-"][id$="-listbox"]', { timeout: 8000 })
      .should("be.visible")
      .contains(new RegExp(`^\\s*${attrName}\\s*$`, "i"))
      .should("exist");
  }

  assertDropdownNotContains(attrName) {
    cy.get('[id^="react-select-"][id$="-listbox"]', { timeout: 8000 })
      .should("be.visible")
      .then(($listbox) => {
        // Use jQuery find to get all option items (IDs: react-select-X-option-Y)
        const $options = $listbox.find('[id*="-option-"]');
        const texts = $options
          .toArray()
          .map((el) => Cypress.$(el).text().trim().toLowerCase());
        expect(texts).not.to.include(attrName.toLowerCase());
      });
  }

  selectProductNameAttribute(attrName) {
    this.openProductNameDropdown();
    cy.get('[id^="react-select-"][id$="-listbox"]', { timeout: 8000 })
      .should("be.visible")
      .contains(new RegExp(`^${attrName}$`, "i"))
      .click();
  }

  addCustomTextTag(customText) {
    // Use force: true to open the react-select input, then type via cy.focused() to avoid re-querying
    this.getProductNameContainer()
      .find('input[role="combobox"]')
      .first()
      .click({ force: true });
    cy.focused().type(customText, { delay: 50 });
    cy.get('[id^="react-select-"][id$="-listbox"]', { timeout: 8000 })
      .should("be.visible")
      .contains(new RegExp(`Create.*${customText}`, "i"))
      .click();
  }

  removeProductNameTag(tagLabel) {
    this.getProductNameContainer()
      .find(`div[role="button"][aria-label="Remove ${tagLabel}"]`)
      .click();
  }

  clearAllProductNameTags() {
    // Check with jQuery (no Cypress assertion), then re-query fresh for click
    cy.contains("p", "Product Name")
      .closest("div[class]")
      .parent()
      .then(($container) => {
        if (
          $container.find('div[role="button"][aria-label^="Remove "]').length >
          0
        ) {
          // Use Cypress cy.get() for a fresh DOM reference at click time, force bypasses actionability
          cy.contains("p", "Product Name")
            .closest("div[class]")
            .parent()
            .find('div[role="button"][aria-label^="Remove "]')
            .first()
            .click({ force: true });
          this.clearAllProductNameTags();
        }
      });
  }

  saveProductNameConfig() {
    this.getProductNameContainer()
      .contains("button", /^Save$/i)
      .click();
  }

  assertProductNameTagVisible(tagLabel) {
    cy.get(`div[role="button"][aria-label="Remove ${tagLabel}"]`).should(
      "exist",
    );
  }

  assertProductNameTagNotVisible(tagLabel) {
    cy.get(`div[role="button"][aria-label="Remove ${tagLabel}"]`).should(
      "not.exist",
    );
  }

  assertProductNameFieldEmpty() {
    this.getProductNameContainer()
      .find('div[class*="-multiValue"]')
      .should("not.exist");
  }

  assertToast(message, timeout = 10000) {
    cy.contains(message, { timeout })
      .should("exist")
      .and("not.have.css", "opacity", "0");
  }

  waitForToastToDisappear(message, timeout = 10000) {
    cy.contains(message, { timeout }).should("not.exist");
  }

  // ─── Stock Out Reason Configuration ─────────────────────────────────────────

  getStockOutReasonInput() {
    return cy.get("#stockOutReasonInput");
  }

  addStockOutReason(reason) {
    this.getStockOutReasonInput()
      .click()
      .clear()
      .type(reason)
      .trigger("keydown", { key: "Enter", keyCode: 13, which: 13 });
  }

  getStockOutReasonChip(reason) {
    return cy.contains(".MuiChip-root", reason).should("exist");
  }

  assertStockOutReasonExists(reason) {
    cy.contains(".MuiChip-root", reason).should("exist");
  }

  assertStockOutReasonNotExists(reason) {
    cy.contains(".MuiChip-root", reason).should("not.exist");
  }

  removeStockOutReason(reason) {
    cy.contains(".MuiChip-root", reason).find(".MuiIconButton-root").click();
  }

  assertStockOutReasonCount(reason, count) {
    cy.get(".MuiChip-root")
      .filter(`:contains("${reason}")`)
      .should("have.length", count);
  }

  // ─── Generic toggle helpers ──────────────────────────────────────────────────

  enableToggle(name) {
    cy.get(`input[name="${name}"]`).then(($t) => {
      if (!$t.is(":checked")) cy.wrap($t).click({ force: true });
    });
  }

  disableToggle(name) {
    cy.get(`input[name="${name}"]`).then(($t) => {
      if ($t.is(":checked")) cy.wrap($t).click({ force: true });
    });
  }

  assertToggleEnabled(name) {
    cy.get(`input[name="${name}"]`).should("be.checked");
  }

  assertToggleDisabled(name) {
    cy.get(`input[name="${name}"]`).should("not.be.checked");
  }

  verifyRequirePOToggleState(shouldEnable) {
    if (shouldEnable) {
      this.assertToggleEnabled("isPoNumberRequired");
    } else {
      this.assertToggleDisabled("isPoNumberRequired");
    }
  }
}

export default GeneralConfigPage;
