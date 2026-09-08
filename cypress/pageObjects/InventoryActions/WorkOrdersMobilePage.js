// cypress/pageObjects/InventoryActions/WorkOrdersMobilePage.js
//
// Page object for the Work Orders mobile screen
// (route /MobileViewScreen/work-order). The view is rendered by the same
// component used for the desktop list (Frontend/src/pages/WorkOrderListView.tsx)
// branching on isMobile.

import L from '../../support/locators/InventoryActions/workOrdersMobileLocators';

class WorkOrdersMobilePage {
  // -- Navigation -----------------------------------------------------------

  /**
   * Side-nav navigation. Side-nav is hidden in mobile viewports
   * (collapsed behind a hamburger), so this method only works at
   * desktop viewports. For mobile-viewport tests use visitDirect().
   */
  openFromSideNav() {
    cy.visit('/dashboard');
    cy.get(L.sideNavLink).should('be.visible').click({ force: true });
    cy.url().should('include', '/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.workOrdersTile}$`)).click();
    cy.url().should('include', '/MobileViewScreen/work-order');
  }

  /**
   * Direct visit — works at any viewport. Used by both the worker
   * session (TC117) and the mobile-card click flow (TC121) since both
   * need to be at iPhone viewport for the mobile-card branch to render.
   */
  visitDirect() {
    cy.visit('/MobileViewScreen/work-order');
    cy.url().should('include', '/MobileViewScreen/work-order');
  }

  // Backwards-compat alias used by older tests in this file.
  visitDirectAsWorker() {
    return this.visitDirect();
  }

  // -- Card list assertions -------------------------------------------------

  cardCount() {
    return cy.contains(L.workOrderCardLabel).should('exist').parents().its('length');
  }

  /**
   * Asserts every status chip on screen contains the given status text.
   * Used by TC117 (worker view filtered to Open).
   */
  assertEveryCardStatus(expectedStatus) {
    cy.get(L.statusChipSelector, { timeout: 15000 }).should('have.length.at.least', 1);
    cy.get(L.statusChipSelector).each(($chip) => {
      const text = $chip.text().trim();
      expect(text, 'card status chip').to.equal(expectedStatus);
    });
  }

  // -- Detail view (after clicking a card) ---------------------------------

  /**
   * Click the first WO card in the list. The mobile card is a Box with
   * an `onClick` prop that navigates to the detail route. React's
   * synthetic onClick can't be matched by Cypress via the `[onclick]`
   * attribute selector and `cursor:pointer` lives in MUI's emotion-
   * generated CSS class (not inline style) — so we click the visible
   * caption text itself and let the click bubble up to the wrapping
   * Box's handler.
   */
  openFirstCard() {
    cy.contains(L.workOrderCardLabel)
      .first()
      .click({ force: true });
    // Confirm navigation away from the list route.
    cy.url({ timeout: 10000 }).should('not.include', '/MobileViewScreen/work-order');
  }

  /**
   * Asserts every product row on the WO detail view shows a Scan button
   * that is not disabled. Run after openFirstCard() to be on the detail.
   */
  assertEveryScanButtonEnabled() {
    cy.contains('button', new RegExp(`^${L.scanButton}$`), { timeout: 15000 })
      .should('exist');
    cy.contains('button', new RegExp(`^${L.scanButton}$`)).each(($btn) => {
      expect($btn.is(':disabled'), 'Scan button enabled').to.equal(false);
    });
  }
}

export default WorkOrdersMobilePage;
