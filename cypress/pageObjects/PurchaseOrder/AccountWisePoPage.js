// cypress/pageObjects/PurchaseOrder/AccountWisePoPage.js
//
// Page object for the StockWise side of the AccountWise → StockWise
// purchase-order seam. It only ever drives StockWise screens; the AccountWise
// side is seeded through its API by
// cypress/support/helpers/accountWisePurchaseOrders.js.
//
// Test plan: cypress/qa/testPlans/purchaseOrder/AccountWisePoIntegration/plan.md

import locators from '../../support/locators/PurchaseOrder/accountWisePoLocators';

const PO_NUMBERS_ROUTE = '**/excel/po-numbers*';

class AccountWisePoPage {
  /**
   * Register the wait barrier for the picker's own fetch.
   *
   * MUST be called BEFORE the navigation that triggers it — registering an
   * intercept after the triggering action makes cy.wait() hang, a documented
   * trap in this suite. It never stubs the response: this is an integration
   * seam, and replacing the response would test nothing (plan.md §6.5).
   */
  interceptPoNumbers(alias = 'poNumbers') {
    cy.intercept('GET', PO_NUMBERS_ROUTE).as(alias);
    return this;
  }

  /**
   * Wait barrier for the WORKER picker's own fetch.
   *
   * MobileViewSeparateScreen branches on role: an Admin reads the merged list,
   * a non-admin reads /purchase-orders/assigned-po/:userId. Asserting that THIS
   * route fired is what proves SW-AWPO-TC06 exercised the worker branch — without
   * it, a screen that failed to render would satisfy a bare "PO is absent"
   * assertion vacuously.
   */
  interceptWorkerPoNumbers(alias = 'workerPoNumbers') {
    cy.intercept('GET', '**/purchase-orders/assigned-po/**').as(alias);
    return this;
  }

  /** Assert the worker lane — not the merged list — served this picker. */
  assertWorkerPoRequestUsed(alias = 'workerPoNumbers') {
    cy.wait(`@${alias}`, { timeout: 60000 }).then(({ response }) => {
      expect(
        response?.statusCode,
        'the worker picker must be served by /purchase-orders/assigned-po/:userId. If this ' +
          'never fired, the screen did not reach the picker step and any "purchase order is ' +
          'absent" assertion below would pass vacuously.',
      ).to.eq(200);
    });
    return this;
  }

  /** Open Incoming Inventory, whose picker requests the close=false lane. */
  visitIncomingInventory() {
    cy.visit('/incoming-inventory');
    return this;
  }

  /** Open Reports, the only screen that passes `showSource` (so the only one with chips). */
  visitReports() {
    cy.visit('/reports');
    return this;
  }

  /**
   * Wait for the picker's fetch and assert it actually succeeded.
   *
   * This exists so a failing endpoint is reported AS a failing endpoint. When
   * /excel/po-numbers 500s, the dropdown simply renders "No options" — and a
   * test that only asserted on the option would report "the AccountWise PO is
   * missing from the dropdown", sending the reader hunting for a filter bug
   * instead of the server error that actually happened.
   */
  assertPoNumbersRequestSucceeded(alias = 'poNumbers') {
    cy.wait(`@${alias}`, { timeout: 120000 }).then(({ response }) => {
      expect(
        response?.statusCode,
        `GET /excel/po-numbers must succeed for the PO picker to populate — got ` +
          `${response?.statusCode} ${JSON.stringify(response?.body).slice(0, 300)}. ` +
          'A 500 here means the merged PO list itself is broken, not that the ' +
          'purchase order is missing.',
      ).to.eq(200);
    });
    return this;
  }

  /** Open the PO dropdown and filter it to `poNumber`. */
  searchPoInDropdown(poNumber) {
    cy.get(locators.poDropdown, { timeout: 30000 }).scrollIntoView().click({ force: true });
    cy.get(locators.poDropdownInput).clear({ force: true }).type(poNumber, { force: true });
    return this;
  }

  /** Assert the dropdown offers `poNumber` as a selectable option. */
  assertPoOffered(poNumber) {
    cy.get(locators.poDropdownMenu, { timeout: 30000 })
      .should('be.visible')
      .within(() => {
        cy.contains(locators.poDropdownOption, poNumber, { timeout: 30000 }).should(
          'be.visible',
        );
      });
    return this;
  }

  /**
   * Assert the dropdown does NOT offer `poNumber`. Used by the worker-role and
   * StockWise-Closed cases — never as a substitute for a failing request, which
   * assertPoNumbersRequestSucceeded() catches first.
   */
  assertPoNotOffered(poNumber) {
    // Assert the OPTION's absence rather than waiting for a visible menu: when
    // the filter matches nothing, react-select renders a "no options" state
    // instead of an option list, so requiring a visible menu times out on the
    // very case this method exists to check.
    //
    // ⚠️ On its own this passes whenever the menu never opened at all. Pair it
    // with assertMenuPopulated() BEFORE filtering — see SW-AWPO-TC04.
    cy.contains(locators.poDropdownOption, poNumber).should('not.exist');
    return this;
  }

  /** Open the PO dropdown WITHOUT typing, so the option list is unfiltered. */
  openPoDropdown() {
    cy.get(locators.poDropdown, { timeout: 30000 }).scrollIntoView().click({ force: true });
    return this;
  }

  /**
   * Prove the menu is open AND populated, using an option known to be present.
   *
   * Must be called before any filtering: react-select filters on the typed text,
   * so an anchor like "All POs" disappears the moment a purchase-order number is
   * typed. This is what stops a later assertPoNotOffered() from passing
   * vacuously because the menu simply never rendered.
   *
   * The default anchor is the synthetic "All POs" row, which `PoList` prepends
   * whenever the parent passes `allPo` — and the Incoming Inventory picker under
   * test DOES pass it (List.tsx:1770 desktop / :1969 mobile, both `allPo={true}`).
   * That makes the anchor a positive identity check on a known row rather than a
   * bare "some option rendered" count, which would also be satisfied by a menu
   * showing an unrelated leftover option. Pass an explicit `anchorText` on a
   * screen that does not prepend it.
   */
  assertMenuPopulated(anchorText = locators.poDropdownAllPosOption) {
    cy.contains(locators.poDropdownOption, anchorText, { timeout: 30000 }).should('be.visible');
    return this;
  }

  /** Select `poNumber` from the open dropdown. */
  selectPoFromDropdown(poNumber) {
    cy.get(locators.poDropdownMenu, { timeout: 30000 })
      .should('be.visible')
      .contains(locators.poDropdownOption, poNumber)
      .click({ force: true });
    return this;
  }

  /**
   * Assert the screen is scoped to `poNumber`.
   *
   * Asserted on the picker's own selected value rather than the URL: a mount
   * effect strips the ?po_no= param right after load, so a URL assertion here
   * would be racing that effect (the same trap documented for selectPOFresh in
   * scanAllTestHelpers.js).
   */
  assertScreenScopedToPo(poNumber) {
    cy.get(locators.poDropdownSelectedValue, { timeout: 30000 })
      .should('be.visible')
      .and('contain.text', poNumber);
    return this;
  }

  /**
   * Assert nothing has been received against the selected purchase order.
   *
   * A purchase order that exists only in AccountWise has no `quantities` rows in
   * StockWise, so its PO-scoped product table renders material-react-table's
   * empty state. This is the "nothing received yet" signal without reaching into
   * per-status badges, whose markup is shared with unrelated features.
   */
  assertNothingReceivedYet() {
    cy.contains(locators.emptyTableText, { timeout: 30000 }).should('be.visible');
    return this;
  }

  /**
   * Open the mobile worker's purchase-order picker.
   *
   * The picker step is reached by CLICKING a tile, not by a URL parameter:
   * MobileViewSeparateScreen sets `poSelection` on the query string but reads it
   * back with useParams() (route params), so a direct visit never opens step 1.
   */
  visitMobileWorkerPoPicker() {
    cy.visit('/MobileViewScreen');
    // ONE click: the ROOT "Stock In" tile calls openPoPickerFor directly (the
    // 2026-06 Smart Stock In consolidation). Do NOT route via a "Start Stock In"
    // button — that one lives behind `selectedGroup === 'stockIn'`, a value
    // nothing in the component ever sets, so it is unreachable dead UI.
    cy.contains('button', locators.mobileStockInTile, { timeout: 30000 })
      .should('be.visible')
      .click();
    cy.contains('label', locators.mobileWorkerPoSearch, { timeout: 30000 }).should('be.visible');
    return this;
  }

  /**
   * Assert the worker's picker does not offer `poNumber`.
   *
   * Filters the list first so the assertion is about a rendered, searched-for
   * absence rather than about a purchase order being off-screen in a long grid.
   *
   * The absence is scoped to the picker's OWN option grid — the Box rendered
   * immediately after the search field, one button per assigned purchase order
   * (MobileViewSeparateScreen.tsx:233-270). Asserting `cy.get('body')` instead
   * would go red for the wrong reason the moment a toast, a debug banner or an
   * echoed URL happened to contain the number.
   */
  assertWorkerPoNotOffered(poNumber) {
    const searchField = () =>
      cy.contains('label', locators.mobileWorkerPoSearch).closest('.MuiFormControl-root');

    searchField().find('input').clear({ force: true }).type(poNumber, { force: true });

    searchField()
      .next()
      .should('exist')
      .within(() => {
        cy.contains(locators.mobileWorkerPoButton, poNumber).should('not.exist');
      });
    return this;
  }

  /**
   * Assert the option carries the given source chip. Reports page only.
   *
   * The chip is rendered by `PoList`'s formatOptionLabel ONLY inside menu rows
   * (context === 'menu') and ONLY when the parent passes `showSource`, which
   * Reports is the only caller to do. So it must be asserted with the menu OPEN,
   * never against the selected control. The chip carries no class of its own —
   * it is a text node inside the option row — hence the text match; the locator
   * file exports selector constants only, so the chain lives here.
   */
  assertPoSource(poNumber, source) {
    cy.get(locators.poDropdownMenu, { timeout: 30000 })
      .contains(locators.poDropdownOption, poNumber)
      .contains(source)
      .should('be.visible');
    return this;
  }
}

export default AccountWisePoPage;
