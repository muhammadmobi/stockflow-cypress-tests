import AddItemLocators from "../support/locators/AddItemLocators";

/**
 * AddItemPage.js
 * Page object for the Add Item form
 * (Frontend/src/components/Item/ItemForm.tsx) and its trigger
 * button on the ItemView screen.
 *
 * The serial input is a TextareaAutosize bound to RHF "scannerInput".
 * Serial values are split by /[\s,]+/ at submit time. There is no chip
 * UI and there is no "Save & Add New" button for this form.
 */
class AddItemPage {
  // ── Trigger ────────────────────────────────────────────────────────────────

  assertAddItemButtonVisible() {
    cy.get(AddItemLocators.addItemButton, { timeout: 15000 })
      .should("be.visible")
      .and("not.be.disabled");
  }

  assertAddItemButtonAbsent() {
    cy.get(AddItemLocators.addItemButton).should("not.exist");
  }

  clickAddItem() {
    cy.get(AddItemLocators.addItemButton, { timeout: 15000 })
      .should("be.visible")
      .click({ force: true });
    cy.url({ timeout: 15000 }).should("match", /\/add-item/);
    cy.get(AddItemLocators.formContainer, { timeout: 15000 }).should("be.visible");
  }

  // ── Form inputs ────────────────────────────────────────────────────────────

  typeSerials(text) {
    cy.get(AddItemLocators.serialInput, { timeout: 15000 })
      .scrollIntoView()
      .click({ force: true })
      .clear({ force: true })
      .type(text, { delay: 30, parseSpecialCharSequences: false, force: true });
  }

  clearAll() {
    cy.get(AddItemLocators.clearAllButton).scrollIntoView().click({ force: true });
    cy.get(AddItemLocators.serialInput).should("have.value", "");
  }

  typeCost(value) {
    // The Add Item form is a scrollable container (overflow:auto); the cost
    // input may be clipped, so scrollIntoView before typing instead of asserting
    // visibility (which retries against a clipped parent and never resolves).
    cy.get(AddItemLocators.costInput, { timeout: 15000 })
      .scrollIntoView()
      .click({ force: true })
      .clear({ force: true })
      .type(String(value), { delay: 30, force: true });
  }

  typePrice(value) {
    cy.get(AddItemLocators.priceInput, { timeout: 15000 })
      .scrollIntoView()
      .click({ force: true })
      .clear({ force: true })
      .type(String(value), { delay: 30, force: true });
  }

  // Asset Tag ID and Asset Security Code are required item attributes in this
  // environment. React Hook Form's handleSubmit will not invoke onSubmit while a
  // required field is empty, so leaving them blank suppresses the POST *and* the
  // FE-side toasts that onSubmit raises — a submit that looks like it silently
  // did nothing. Filled conditionally so the suite still runs if the attribute
  // config is later relaxed.
  fillRequiredAssetFields(uniqueSuffix) {
    cy.get(AddItemLocators.formContainer).then(($form) => {
      if ($form.find(AddItemLocators.assetTagIdInput).length) {
        cy.get(AddItemLocators.assetTagIdInput)
          .scrollIntoView()
          .clear({ force: true })
          .type(`ASSET-${uniqueSuffix}`, { delay: 0, force: true });
      }
      if ($form.find(AddItemLocators.assetSecurityCodeInput).length) {
        cy.get(AddItemLocators.assetSecurityCodeInput)
          .scrollIntoView()
          .clear({ force: true })
          .type(`ASC-${uniqueSuffix}`, { delay: 0, force: true });
      }
    });
  }

  // ── Submission ─────────────────────────────────────────────────────────────

  interceptAddItem(alias = "addItemSubmit") {
    cy.intercept("POST", "**/products/item").as(alias);
    return alias;
  }

  clickSave() {
    cy.get(AddItemLocators.saveButton, { timeout: 15000 })
      .scrollIntoView()
      .should("not.be.disabled")
      .click({ force: true });
  }

  clickCancel() {
    cy.get(AddItemLocators.cancelButton, { timeout: 15000 })
      .scrollIntoView()
      .click({ force: true });
  }

  // ── Assertions ─────────────────────────────────────────────────────────────

  waitForAddItemSuccess(alias = "addItemSubmit") {
    cy.wait(`@${alias}`, { timeout: 30000 }).then(({ response }) => {
      expect(response?.statusCode, "POST /products/item status").to.be.oneOf([200, 201]);
      const body = response?.body || {};
      expect(
        body.success !== false,
        "POST /products/item envelope must not be success:false"
      ).to.eq(true);
    });
  }

  assertSuccessToast(matcher = /Item\(s\) created|created/i) {
    cy.contains(matcher, { timeout: 15000 }).should("be.visible");
  }

  assertErrorToast(matcher) {
    cy.contains(matcher, { timeout: 15000 }).should("be.visible");
  }

  assertFormStillOpen() {
    cy.url().should("match", /\/add-item/);
    cy.get(AddItemLocators.formContainer).should("be.visible");
  }

  assertFormClosed() {
    cy.url().should("not.match", /\/add-item/);
  }

  assertDuplicateInlineWarning(serial) {
    cy.contains("Duplicate serials:", { timeout: 10000 }).should("be.visible");
    if (serial) {
      cy.contains("Duplicate serials:").parent().should("contain", serial);
    }
  }

  // ── Verification via API (decoupled from items-table UI structure) ─────────

  verifyItemCreatedViaApi(token, serialNumber) {
    const baseUrl = Cypress.env("API_BASE_URL");
    cy.request({
      method: "GET",
      url: `${baseUrl}/products/item/${encodeURIComponent(serialNumber)}`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    }).then((res) => {
      expect(
        res.status,
        `GET /products/item/${serialNumber} after Add Item submit`
      ).to.eq(200);
      const body = res.body?.data || res.body || {};
      const list = body.list || (Array.isArray(body) ? body : []);
      const found =
        (Array.isArray(list) && list.find((i) => i?.serialNumber === serialNumber)) ||
        (body?.serialNumber === serialNumber ? body : null);
      expect(found, `item ${serialNumber} must exist after Add Item`).to.exist;
    });
  }
}

export default AddItemPage;
