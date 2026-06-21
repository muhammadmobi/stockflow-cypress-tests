import newProductLocators from "../support/locators/newProductLocators";
require("cypress-xpath");
class NewProductPage {
  selectCategory(categoryName) {
    // CategoryList wraps a react-select with id="inventory-category-P-O-5".
    // Target the inner <input> directly — cy.focused() is unreliable after a
    // force-click on the container. The menu is portaled to document.body so
    // we click the matching option outside the wrapper.
    cy.get('#inventory-category-P-O-5').find('input').first().click({ force: true }).type(categoryName, { delay: 30 });
    cy.get('div[class*="menu"]', { timeout: 8000 }).should('be.visible').contains(categoryName).first().click({ force: true });
  }

  clickAddProduct() {
    cy.findByRole("button", { name: "Add Product" }).click({ force: true });
  }

  clickSave() {
    cy.contains("button", /^Save$/).should("not.be.disabled").click({ force: true });
  }

  clickUpdate() {
    cy.contains("button", /^Update$/).click({ force: true });
  }
  enterDetails(details) {
    Object.entries(details).forEach(([key, value]) => {
      if (value) {
        cy.get(`input[name="${key.toLowerCase()}"]`).clear().type(value);
      }
    });
  }
  
  

  verifyToastMsg(EntityType) {
    if (EntityType == "variant") {
      cy.get(newProductLocators.variantToastLocator).should('exist').should(
        "contain",
        `${EntityType} created`
      );
    } else {
      cy.get(newProductLocators.toastLocator).should('exist').should(
        "contain",
        `${EntityType} created`
      );
    }
  }

  // Enter a value into an attribute field. ItemForm renders attribute inputs
  // with `name={fieldName}` where fieldName comes from the attribute definition
  // (camelCase, e.g. "memoryGeneration", "modelNumber", "assetTagId").
  //
  // StockWise label → fieldName map (from cypress/fixtures/testDataAttributes.json):
  //   "Memory Generation" → memoryGeneration
  //   "Model Number"      → modelNumber
  //   "Asset Tag ID"      → assetTagId
  //   "Brand"             → brand
  //   "RAMbrand"          → rambrand
  //
  // The MUI Typography "label" is actually a <p>/<div>, not <label>, so we
  // can't rely on cy.contains('label', ...). Use the fieldName-based input
  // selector instead.
  enterAttributeByLabel(labelOrFieldName, value) {
    const labelToField = {
      'Memory Generation': 'memoryGeneration',
      'Model Number': 'modelNumber',
      'Asset Tag ID': 'assetTagId',
      'Brand': 'brand',
      'RAMbrand': 'rambrand',
    };
    const fieldName = labelToField[labelOrFieldName] || labelOrFieldName;
    cy.get(`input[name="${fieldName}"]`, { timeout: 10000 })
      .should('exist')
      .scrollIntoView()
      .clear()
      .type(value, { delay: 20, force: true });
  }

  // Update success toast — ItemForm emits "Product Updated." or "Item Updated."
  verifyUpdateToast() {
    cy.contains(/updated/i, { timeout: 10000 }).should('be.visible');
  }

  // Save the product form and assert success via URL navigation back to /inventory.
  // FormFooter renders OUTSIDE <form id="item-form"> and links via form="item-form".
  saveAndExpectSuccess() {
    cy.get('button[type="submit"][form="item-form"]', { timeout: 10000 }).should('be.visible').click({ force: true });
    cy.url({ timeout: 15000 }).should('match', /\/inventory(\?|#|$|\/)/).and('not.include', '/new-product');
  }

  // Click Save where validation should block submission (URL must stay on /new-product).
  saveAndExpectBlocked() {
    cy.get('button[type="submit"][form="item-form"]', { timeout: 10000 }).should('be.visible').click({ force: true });
    cy.url().should('include', '/new-product');
  }

  // Click the form submit button without asserting a URL outcome.
  // Use when the expected result (blocked vs navigated) is scenario-dependent.
  clickSaveBtn() {
    cy.get('button[type="submit"][form="item-form"]', { timeout: 10000 })
      .should('be.visible')
      .click({ force: true });
  }

  // Click the Update submit button on the edit-product / edit-item form.
  // The button lives in <FormFooter> outside <form id="item-form"> and is linked
  // to the form via the form="item-form" HTML attribute.
  clickUpdateBtn() {
    cy.get('button[type="submit"][form="item-form"]', { timeout: 10000 })
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });
  }

  // Clear an attribute field by its display label or raw fieldName.
  clearAttributeByLabel(labelOrFieldName) {
    const labelToField = {
      'Memory Generation': 'memoryGeneration',
      'Model Number': 'modelNumber',
      'Asset Tag ID': 'assetTagId',
      'Brand': 'brand',
      'RAMbrand': 'rambrand',
    };
    const fieldName = labelToField[labelOrFieldName] || labelOrFieldName;
    cy.get(`input[name="${fieldName}"]`, { timeout: 10000 }).should('exist').scrollIntoView().clear();
  }

  // Fill the supportContact input only if it is rendered (QA marks it required;
  // other environments may omit it).
  fillSupportContactIfPresent(value) {
    cy.get('input[name="supportContact"]').then(($el) => {
      if ($el.length) cy.wrap($el).scrollIntoView().clear().type(value, { delay: 20 });
    });
  }
}

export default NewProductPage;
