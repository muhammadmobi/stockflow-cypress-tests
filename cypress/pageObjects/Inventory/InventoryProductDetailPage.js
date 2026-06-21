// Page object for the Inventory Product Detail page (/inventory/:productName/:id).
// Entered by clicking a product row on /inventory (the route needs router state, so
// it can't be visited by URL directly). From /inventory the page mounts the
// ItemViewItemList serial table (action:'item').

import L from '../../support/locators/Inventory/productDetailLocators';

class InventoryProductDetailPage {
  assertOnDetailPage() {
    cy.url({ timeout: 10000 }).should('match', L.URL_RE);
    return this;
  }

  assertHeaderShows(text) {
    cy.contains(text, { timeout: 10000 }).should('be.visible');
    return this;
  }

  expandProductDetails() {
    cy.get(L.PRODUCT_DETAILS_HEADER, { timeout: 10000 }).should('exist').click({ force: true });
    return this;
  }

  assertProductDetailsContains(text) {
    cy.contains(text, { timeout: 10000 }).should('exist');
    return this;
  }

  interceptItems(alias = 'items') {
    cy.intercept('GET', L.ITEMS_ENDPOINT).as(alias);
    return this;
  }

  clickRefresh() {
    cy.get(L.REFRESH_BTN, { timeout: 10000 }).first().should('not.be.disabled').click({ force: true });
    return this;
  }

  assertSerialRow(serial, status) {
    cy.contains('tbody tr', serial, { timeout: 15000 }).should('exist');
    if (status) cy.contains('tbody tr', serial).should('contain.text', status);
    return this;
  }

  clickSerialLink(serial) {
    cy.contains('tbody tr button', serial, { timeout: 10000 }).click({ force: true });
    return this;
  }
}

export default InventoryProductDetailPage;
