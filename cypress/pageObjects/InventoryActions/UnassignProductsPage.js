// cypress/pageObjects/InventoryActions/UnassignProductsPage.js
//
// Page object for the Unassign Products mobile screen
// (route /MobileViewScreen/unassign-products).
// Component: Frontend/src/components/UnassignProducts/index.tsx.
//
// Three-step flow: products list → assignments list → quantity entry.

import L from '../../support/locators/InventoryActions/unassignProductsLocators';

class UnassignProductsPage {
  visit() {
    cy.visit('/MobileViewScreen/unassign-products');
    cy.url().should('include', '/unassign-products');
  }

  walkFromLanding() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.unassignmentTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.unassignProductsTile}$`)).click();
    cy.url().should('include', '/unassign-products');
  }

  // ---- Step 1: products list -------------------------------------------

  assertProductsStepVisible() {
    cy.contains(L.step1Header, { timeout: 15000 }).should('be.visible');
    cy.get(L.productSearchPlaceholder).should('be.visible');
  }

  typeProductSearch(query) {
    cy.get(L.productSearchPlaceholder).clear().type(query);
  }

  /**
   * Click the first row in the product list. Use after typing a search
   * query that yields a known product. The component renders products as
   * <li> with `cursor: pointer` and an inline onClick.
   *
   * The bare `ul > li` selector matches hidden side-nav and breadcrumb <li>
   * elements at iphone-7 viewport before reaching the product list — on
   * mobile, MUI's collapsed drawer carries non-visible list items that
   * Cypress finds first. Anchor by the visible text of the product (its
   * category, displayed as `<ListItemText primary={...}>`) so the click
   * lands on a real product row.
   *
   * Pass `anchorText` (typically the product's category or attribute) to
   * select that specific row; pass nothing to click the first product
   * inside `.MuiList-root`.
   */
  clickFirstProductRow(anchorText) {
    if (anchorText) {
      cy.contains('li', anchorText, { timeout: 10000 })
        .first()
        .scrollIntoView()
        .click({ force: true });
    } else {
      cy.get('.MuiList-root > li').first().scrollIntoView().click({ force: true });
    }
  }

  // ---- Step 2: assignments list ----------------------------------------

  assertAssignmentsStepVisible() {
    // After step-1 product-list scrolling the outer overflow:auto Box carries a
    // non-zero scrollTop into step 2.  The layout has overflow:clip on mobile
    // (xs breakpoint) which prevents Cypress scrollIntoView() from resetting
    // the inner container; walk the DOM and reset scrollTop directly instead.
    cy.contains(L.step2Header, { timeout: 15000 }).then(($h6) => {
      let el = $h6[0].parentElement;
      while (el && el !== document.body) {
        if (el.scrollTop > 0) { el.scrollTop = 0; break; }
        el = el.parentElement;
      }
    });
    cy.contains(L.step2Header).should('be.visible');
    cy.get(L.scanInputByPlaceholder).should('be.visible');
  }

  scanAssignmentCode(code) {
    cy.get(L.scanInputByPlaceholder).clear().type(`${code}{enter}`);
  }

  clickFirstAssignmentRow() {
    cy.get('ul > li').filter(':contains("Assigned")').first().click();
  }

  // ---- Step 3: quantity ------------------------------------------------

  assertQuantityStepVisible() {
    // After step-1/2 scrolling, the outer overflow:auto Box carries a non-zero
    // scrollTop. Find and reset it before asserting visibility.
    cy.contains(L.step3Header, { timeout: 15000 }).then(($h6) => {
      const el = $h6[0];
      let scrollParent = el.parentElement;
      while (scrollParent && scrollParent !== document.body) {
        if (scrollParent.scrollHeight > scrollParent.clientHeight && scrollParent.scrollTop > 0) {
          scrollParent.scrollTop = 0;
          break;
        }
        scrollParent = scrollParent.parentElement;
      }
    });
    // Re-fetch and assert after scroll reset
    cy.contains(L.step3Header).scrollIntoView().should('be.visible');
    cy.contains('button', new RegExp(`^${L.unassignBtn}$`)).scrollIntoView().should('be.visible');
  }

  enterQty(qty) {
    // The quantity input is type="number" on step 3. There's only one numeric
    // input on the page, so direct selector is reliable.
    cy.get(L.qtyInput)
      .scrollIntoView()
      .should('be.visible')
      .clear()
      .type(String(qty));
  }

  clickUnassign() {
    cy.contains('button', new RegExp(`^${L.unassignBtn}$`)).click();
  }

  goBack() {
    cy.contains('button', /^← Back$/).first().click();
  }
}

export default UnassignProductsPage;
