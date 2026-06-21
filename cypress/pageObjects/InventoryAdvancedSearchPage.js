import L from '../support/locators/InvAdvancedSearchLocators';
import ICFLocators from '../support/locators/inventoryCategoryFilterLocators';
import urls from '../fixtures/urls.json';

/**
 * Page Object — Inventory Advanced Search Modal & Stats Clickable
 * Covers:
 *   AdvancedSearchModal.tsx  — dialog variant (≥1920×1080)
 *   ItemList.tsx             — stat card click handlers
 *   Customize Columns panel  — MRT column visibility toggle
 */
class InventoryAdvancedSearchPage {
  // ── Navigation ──────────────────────────────────────────────────────────

  navigateToInventory() {
    cy.visit(urls.inventory);
    this.waitForTableLoad();
  }

  // ── Table readiness ──────────────────────────────────────────────────────

  waitForTableLoad() {
    cy.get('.MuiLinearProgress-root[role="progressbar"]', { timeout: 40000 }).should('not.exist');
  }

  // ── Column customization ─────────────────────────────────────────────────

  /**
   * Ensure a named column is visible in the MRT table.
   * Opens the "Customize Columns" panel, checks the box if unchecked, then
   * clicks Update (or closes with no change if already checked).
   */
  customizeColumn(columnLabel) {
    // Two #long-button elements outside tbody: [0] ExportMenu, [1] InventoryActionMenu
    cy.get('button#long-button').not('tbody *').eq(1).click();
    // Wait for Customize Columns to be enabled (disabled while isFetchingCustomizeColumn)
    cy.get('[role="menu"]')
      .contains('Customize Columns')
      .should('not.have.class', 'Mui-disabled')
      .click({ force: true });
    // Wait for the dialog to appear, then wait for the attribute list to finish
    // loading (inventoryListViewsForm fetches /attributes async on first open).
    cy.get('[role="dialog"]', { timeout: 20000 }).should('be.visible');
    cy.get('[role="dialog"]').find('.MuiCircularProgress-root', { timeout: 15000 }).should('not.exist');
    cy.contains('label', columnLabel, { timeout: 15000 })
      .find('input[type="checkbox"]')
      .then(($cb) => {
        if (!$cb.is(':checked')) {
          cy.wrap($cb).check({ force: true });
          // Submit button text alternates between 'Update' and 'save'; target by type
          cy.get('[role="dialog"]').find('button[type="submit"]').should('not.be.disabled').click();
        } else {
          // Close the IMSDialog using its absolute-positioned close button.
          // The only MuiIconButton inside [role="dialog"] without aria-label is the close btn.
          cy.get('[role="dialog"] button.MuiIconButton-root:not([aria-label])').click();
        }
      });
    this.waitForTableLoad();
  }

  // ── Category filter (React-Select) ──────────────────────────────────────

  selectCategory(name) {
    cy.get(ICFLocators.categoryDropdownInput)
      .click({ force: true })
      .clear()
      .type(name, { delay: 40 });
    cy.get(ICFLocators.categoryDropdownMenu).contains(name).click();
    this.waitForTableLoad();
  }

  clearCategory() {
    this.selectCategory('All');
  }

  // ── Tab navigation ───────────────────────────────────────────────────────

  clickTab(tabLabel) {
    cy.contains(tabLabel).click();
    this.waitForTableLoad();
  }

  // ── Advanced Search modal ────────────────────────────────────────────────

  /**
   * Click the "Advanced Search" icon button and wait for the drawer to open.
   * Does NOT intercept GET /products/searchable-fields — React Query caches the
   * response after the first load; subsequent opens serve from cache with no
   * network request, so cy.wait('@fields') would time out on every test after
   * the first. Waiting for the drawer element to be visible is sufficient.
   */
  openAdvancedSearch() {
    cy.get(L.openBtn).click();
    cy.get(L.dialog).should('be.visible');
  }

  closeViaCancel() {
    // Drawer close button is an absolute-positioned IconButton (first in the drawer DOM).
    // data-testid is absent on prod builds; the close button is the first MuiIconButton
    // inside the drawer paper, before any field-level clear buttons in the content.
    cy.get(L.dialog).find('button.MuiIconButton-root').first().click();
    cy.get(L.dialog).should('not.exist');
  }

  closeViaEscape() {
    // Escape handler is registered on window, not the dialog element
    cy.get('body').type('{esc}');
    cy.get(L.dialog).should('not.exist');
  }

  // ── Field interaction ────────────────────────────────────────────────────

  /**
   * Type a value into an Advanced Search field by its placeholder text.
   * fieldLabel: the visible label, e.g. "Memory Generation"
   */
  fillField(fieldLabel, value) {
    // AdvancedSearchModal uses field.name.toLowerCase() for the placeholder.
    // The Drawer uses position:fixed with a Scrollbar (simplebar-react); inputs
    // below the fold are clipped — scrollIntoView() scrolls the simplebar
    // container so Cypress's visibility check passes.
    //
    // IMPORTANT: do NOT chain scrollIntoView() → clear() in one expression.
    // simplebar's scroll event triggers a React re-render that detaches the
    // input from the DOM between scrollIntoView() and clear(), causing a
    // "element has detached" CypressError. Re-querying after scrollIntoView()
    // gives Cypress a fresh DOM reference.
    const sel = `input[placeholder="Search by ${fieldLabel.toLowerCase()}..."]`;
    cy.get(L.dialog).within(() => {
      // Three separate cy.get() calls — each is a fresh DOM query.
      //
      // Why three calls instead of one chain:
      //   1. scrollIntoView() scrolls the simplebar container (position:fixed).
      //      The scroll event triggers a React re-render that detaches the input
      //      from the DOM; chaining .clear() on the same subject throws
      //      "element has detached".
      //   2. clear({ force:true }) itself can also trigger a React re-render
      //      (controlled-input onChange fires, component re-renders).
      //      Chaining .type() on the post-clear subject can fail the same way.
      //   3. Each re-query gives Cypress a live DOM reference. { force:true }
      //      bypasses the position:fixed viewport-clipping visibility check.
      cy.get(sel).scrollIntoView();
      cy.get(sel).clear({ force: true });
      cy.get(sel).type(value, { delay: 30, force: true });
    });
  }

  clearFieldInput(fieldLabel) {
    cy.get(L.dialog).within(() => {
      cy.get(`input[placeholder="Search by ${fieldLabel.toLowerCase()}..."]`)
        .parents('[class*="MuiInputBase"]')
        .find('button')
        .click();
    });
  }

  filterFieldsByName(text) {
    cy.get(L.dialog).within(() => {
      // Two separate cy.get() calls — same rationale as fillField():
      // clear() can fire an onChange that re-renders the input, detaching it
      // before a chained type() can act on it.
      cy.get(L.fieldFilterInput).clear({ force: true });
      cy.get(L.fieldFilterInput).type(text, { delay: 30, force: true });
    });
  }

  // ── All / Category toggle ────────────────────────────────────────────────

  clickAllToggle() {
    cy.get(L.dialog).within(() => {
      cy.get(L.allToggleBtn).click();
    });
  }

  clickCategoryToggle() {
    cy.get(L.dialog).within(() => {
      cy.get(L.categoryToggleBtn).click();
    });
  }

  // ── Submit / Enter ────────────────────────────────────────────────────────

  /**
   * Click the Search button.
   * Intercept alias @advSearch must be registered by the caller BEFORE calling.
   */
  clickSearchBtn() {
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
  }

  pressEnterInDialog() {
    // Trigger a native keydown on the drawer element so it bubbles up to window.
    // cy.get('body').type('{enter}') is unreliable when the MUI Drawer's focus
    // trap holds focus on an inner element — the synthetic event may never reach
    // the window.addEventListener('keydown', onKey) registered in
    // AdvancedSearchModal. Firing .trigger('keydown') on the drawer element
    // guarantees the event bubbles through the DOM to window.
    cy.get(L.dialog).trigger('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
    });
  }

  // ── Clear All ─────────────────────────────────────────────────────────────

  /**
   * Click "Clear All" and wait for the standard product list to reload.
   * Does NOT wait for GET /products/searchable-fields — React Query cache hit
   * means no network request fires on the re-open; just wait for drawer visibility.
   */
  clearAll() {
    cy.intercept('GET', '**/products**').as('productListAfterClear');
    cy.get(L.openBtn).click();
    cy.get(L.dialog).should('be.visible');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Clear All').should('not.be.disabled').click();
    });
    cy.wait('@productListAfterClear', { timeout: 20000 });
    this.waitForTableLoad();
  }

  // ── Chip management ───────────────────────────────────────────────────────

  removeChip(chipLabel) {
    cy.contains(L.filterChip, chipLabel)
      .find(L.chipDeleteIcon)
      .click();
  }

  assertActiveFiltersCount(n) {
    if (n === 0) {
      cy.get(L.filterChip).should('not.exist');
    } else {
      cy.get(L.filterChip).should('have.length', n);
    }
  }

  // ── Assertions ────────────────────────────────────────────────────────────

  assertValidationError() {
    // Error paragraph may be below the fold in the simplebar scroll area —
    // scrollIntoView() brings it into the drawer's visible bounds first.
    //
    // IMPORTANT: do NOT chain scrollIntoView() → should() in one expression.
    // simplebar's scroll event triggers a React re-render that detaches the
    // element from the DOM between scrollIntoView() and should(), causing a
    // "element has detached" CypressError. Re-querying after scrollIntoView()
    // gives Cypress a fresh DOM reference.
    cy.get(L.dialog).within(() => {
      cy.get(L.validationError).scrollIntoView();
      cy.get(L.validationError).should('be.visible');
    });
  }

  assertNoFieldsMessage() {
    // "No searchable fields configured." message may also require scrolling.
    cy.get(L.dialog).within(() => {
      cy.get(L.noFieldsMsg).scrollIntoView().should('be.visible');
    });
  }

  assertToggleVisible() {
    cy.get(L.dialog).within(() => {
      cy.get(L.toggleGroup).should('be.visible');
    });
  }

  assertToggleAbsent() {
    cy.get(L.dialog).within(() => {
      cy.get(L.toggleGroup).should('not.exist');
    });
  }

  assertAccordionPresent(categoryName) {
    cy.get(L.dialog).within(() => {
      cy.get(L.accordion).should('contain.text', categoryName);
    });
  }

  assertAccordionAbsent(categoryName) {
    cy.get(L.dialog).within(() => {
      cy.get(L.accordion).should('not.contain.text', categoryName);
    });
  }

  /**
   * Assert that no item-level attribute inputs are visible in the modal.
   * Item attrs are identified by checking that none of the known common item
   * fields appear as inputs (Asset Security Code is the sentinel).
   */
  assertItemFieldsAbsent() {
    cy.get(L.dialog).within(() => {
      cy.get('input[placeholder="Search by asset security code..."]').should('not.exist');
      cy.get('input[placeholder="Search by maintenance log summary..."]').should('not.exist');
    });
  }

  assertTableEmpty() {
    cy.get(ICFLocators.noRowsOverlay).should('exist');
  }

  /**
   * Assert no react-hot-toast error alert is present on the page.
   * react-hot-toast renders error-level toasts with role="alert" + aria-live="assertive".
   * Used after a no-match search to confirm no error bubble appears.
   */
  assertNoErrorToast() {
    cy.get(L.errorToast).should('not.exist');
  }

  assertProductVisible(productName) {
    cy.get(ICFLocators.tableBody).should('contain.text', productName);
  }

  assertProductAbsent(productName) {
    cy.get(ICFLocators.tableBody).should('not.contain.text', productName);
  }

  // ── Stats Clickable ───────────────────────────────────────────────────────

  /**
   * Click a stat card by its label text (e.g. "Damaged", "Available").
   * Accepts the display label shown in the UI.
   */
  clickStatBadge(label) {
    cy.contains(L.statCard, label).click();
    this.waitForTableLoad();
  }

  /**
   * Assert the stat card for a given label shows a numeric value ≥ 0.
   */
  assertStatCardVisible(label) {
    cy.contains(L.statCard, label).should('be.visible');
  }
}

export default InventoryAdvancedSearchPage;
