// Page object for the Inventory Restock row action (/inventory).
// The "Restock" menu item renders only on /inventory and is enabled only for
// product-only rows (disabled when the category allowItems/allowVariants). It
// opens ProductRestock (RestockModel.tsx) → POST /products/restock-product.
// Source of truth verified at ProductListActionMenu.tsx:417-433 + RestockModel.tsx.

import L from '../../support/locators/Inventory/restockLocators';

class InventoryRestockPage {
  // Open the per-row 3-dot menu for the searched product and click "Restock".
  openRestockForProduct(searchTerm) {
    cy.contains('tbody tr', searchTerm, { timeout: 20000 })
      .find(L.ROW_MENU_BTN)
      .scrollIntoView()
      .click({ force: true });
    cy.get(L.MENU, { timeout: 8000 })
      .contains(L.RESTOCK_LABEL)
      .should('be.visible')
      .click({ force: true });
    cy.get(L.MODAL, { timeout: 8000 }).should('be.visible');
    return this;
  }

  // Assert the "Restock" menu item is present but disabled for an item-bearing
  // product (allowItems=true). Closes the menu afterwards.
  assertRestockDisabledForProduct(searchTerm) {
    cy.contains('tbody tr', searchTerm, { timeout: 20000 })
      .find(L.ROW_MENU_BTN)
      .scrollIntoView()
      .click({ force: true });
    cy.get(L.MENU, { timeout: 8000 })
      .contains(L.RESTOCK_LABEL)
      .closest(L.MENU_ITEM)
      .should('have.attr', 'aria-disabled', 'true');
    cy.get('body').type('{esc}');
    return this;
  }

  interceptRestock(alias = 'restock') {
    cy.intercept('POST', L.ENDPOINT).as(alias);
    return this;
  }

  // The qty field is an autofocus controlled input on a freshly-mounted modal;
  // react-hook-form captures the value via onChange, which can race the mount.
  // Settle the modal, type, blur to commit, and assert the value stuck so the
  // subsequent submit reads a populated form value (not an empty one).
  typeQty(qty) {
    cy.get(L.QTY_INPUT, { timeout: 10000 }).should('be.visible');
    cy.get(L.QTY_INPUT)
      .click({ force: true })
      .clear({ force: true })
      .type(String(qty), { delay: 40 })
      .blur();
    cy.get(L.QTY_INPUT).should('have.value', String(qty));
    return this;
  }

  // Submit via the footer "Restock" button scoped to the dialog (form-linked).
  submit() {
    cy.get(L.MODAL).contains('button', /^Restock$/, { timeout: 10000 }).click({ force: true });
    return this;
  }

  // Modal stays open when react-hook-form validation blocks submit (qty < 1).
  assertModalOpen() {
    cy.get(L.FORM, { timeout: 5000 }).should('exist');
    return this;
  }

  assertValidationError() {
    cy.contains(/at least 1|Quantity is required/i, { timeout: 5000 }).should('be.visible');
    return this;
  }

  assertModalClosed() {
    cy.get(L.MODAL, { timeout: 10000 }).should('not.exist');
    return this;
  }
}

export default InventoryRestockPage;
