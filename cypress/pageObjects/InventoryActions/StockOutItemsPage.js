// cypress/pageObjects/InventoryActions/StockOutItemsPage.js
//
// Page object for the Stock Out Items mobile screen
// (route /StockOutBySerialNumber). Reached via Inventory Actions →
// Stock Out → Stock Out Items.
//
// Component: Frontend/src/components/Item/MobileViewSeperateStockOut.tsx.
// The "Next" button performs three guards in order:
//   1. Order-number guard (only when orderRequired=true — disabled here).
//   2. Order-finished guard.
//   3. Reason-required guard — async trigger('reason'); on invalid:
//        addError('Select a reason before continuing to scan.')
//        (and the field shows helper text 'Reason is required').

import L from '../../support/locators/InventoryActions/stockOutItemsLocators';

class StockOutItemsPage {
  // -- Navigation -----------------------------------------------------------

  openFromSideNav() {
    // The "Next" button is disabled while requireWorkOrderForStockOut is true
    // (MobileViewSeperateStockOut.tsx:690 — disabled={!!configState?.
    // requireWorkOrderForStockOut}), and the Stock-Out tiles on the landing
    // screen are likewise gated by the same flag. On QA this flag is currently
    // ON, so clickNext() hit a disabled button (the TC84 failure) and the
    // reason-required guard could never fire. Force the general config to
    // requireWorkOrderForStockOut=false so the order-number path is bypassed
    // and the reason validation (the actual behaviour under test) is reachable.
    cy.intercept('GET', '**/configs*type=general*', (req) => {
      req.continue((res) => {
        try {
          const body = JSON.parse(JSON.stringify(res.body));
          const list = body?.data?.list || [];
          if (list[0]?.configJson?.data) {
            list[0].configJson.data.requireWorkOrderForStockOut = false;
            res.body = body;
          }
        } catch (e) {
          /* leave the response untouched on parse failure */
        }
      });
    }).as('stockOutItemsConfig');

    cy.visit('/dashboard');
    cy.get(L.sideNavLink).should('be.visible').click({ force: true });
    cy.url().should('include', '/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.stockOutTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.stockOutItemsTile}$`)).click();
    cy.url().should('include', '/StockOutBySerialNumber');
  }

  // -- Reason interactions --------------------------------------------------

  /**
   * Open the reason dropdown. react-select responds to `{downarrow}` on the
   * focused input by opening its menu — focus + click alone may not open
   * the menu in all react-select versions, so we send the explicit gesture.
   */
  openReasonDropdown() {
    cy.get(L.reasonSelectInput)
      .first()
      .focus()
      .type('{downarrow}', { force: true });
  }

  selectReason(reason) {
    cy.get(L.reasonSelectInput).first().type(`${reason}{enter}`, { delay: 100 });
  }

  /**
   * Asserts the rendered reason dropdown contains every option in `reasons`.
   * Reasons are configured server-side via /configs general config —
   * this assertion verifies the configured list reaches the UI.
   *
   * react-select renders option rows as <div> with a className containing
   * "option" once the menu is open (e.g. css-...-option). Asserting both
   * containment AND visibility filters out stray text nodes elsewhere in
   * the DOM.
   */
  assertReasonOptionsContain(reasons) {
    this.openReasonDropdown();
    // Wait for the menu container to appear before assertions.
    cy.get('[class*="-menu"], [class*="MenuList"], [class*="option"]', { timeout: 8000 })
      .should('exist');
    reasons.forEach((reason) => {
      // react-select's menu has a scrollable max-height; with 9+ configured
      // reasons the later options render BELOW the scroll fold, so a strict
      // be.visible fails on the clipped element even though it's in the DOM.
      // Scroll each option into view, then assert visibility. `should('exist')`
      // after a successful contains() is a tautology — contains() already failed
      // if nothing matched — so assert be.visible, which still holds once the
      // option is scrolled into the menu's viewport and keeps the original
      // intent (the option is genuinely presented to the user).
      cy.get('[class*="option"]', { timeout: 8000 })
        .contains(new RegExp(`^${reason}$`))
        .scrollIntoView()
        .should('be.visible');
    });
  }

  /**
   * Asserts the chosen reason is reflected in the react-select value
   * container. react-select keeps the chosen option's label as a span
   * inside the .css-* value wrapper sibling to the input.
   */
  assertSelectedReason(reason) {
    cy.contains(reason).should('be.visible');
  }

  // -- Description / reference --------------------------------------------

  typeDescription(text) {
    cy.get(L.descriptionTextarea).clear().type(text);
  }

  assertDescriptionValue(text) {
    cy.get(L.descriptionTextarea).should('have.value', text);
  }

  typeReferenceNumber(value) {
    cy.get(`input[placeholder="${L.referenceNumberPlaceholder}"]`)
      .clear()
      .type(String(value));
  }

  assertReferenceNumberValue(value) {
    cy.get(`input[placeholder="${L.referenceNumberPlaceholder}"]`)
      .should('have.value', String(value));
  }

  // -- Next-button validation --------------------------------------------

  clickNext() {
    cy.contains('button', new RegExp(`^${L.nextButton}$`)).click();
  }

  /**
   * Asserts the reason-required error surface (toast OR helper text).
   * The component shows BOTH on submission with no reason selected:
   *   - addError('Select a reason before continuing to scan.')   (toast)
   *   - field-level helper text 'Reason is required'             (RHF rule)
   *
   * Uses cy.contains with a regex so Cypress retries until either string
   * actually appears in the DOM (the toast can be async via react-hot-
   * toast; the helper text is sync from RHF). Both strings are
   * sufficiently distinctive that a stray static page label is unlikely
   * to false-positive — the toast wording is full and verb-form, and
   * "Reason is required" is the rule message that only renders after
   * validation triggers.
   */
  assertReasonRequiredError() {
    const RE = new RegExp(`${L.reasonRequiredToast}|${L.reasonRequiredFieldError}`);
    cy.contains(RE, { timeout: 8000 }).should('be.visible');
  }
}

export default StockOutItemsPage;
