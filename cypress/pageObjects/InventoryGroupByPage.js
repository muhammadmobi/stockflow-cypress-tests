import L from '../support/locators/InvGroupByLocators';
import ICFLocators from '../support/locators/inventoryCategoryFilterLocators';
import InvAdvSearchL from '../support/locators/InvAdvancedSearchLocators';
import urls from '../fixtures/urls.json';

/**
 * Page Object — Inventory Group By
 * Covers the MUI Autocomplete "Group By" control and overflow Popover
 * rendered in ItemList.tsx (≥1920×1080, non-mobile, non-advanced-search mode).
 */
class InventoryGroupByPage {
  // ── Navigation ──────────────────────────────────────────────────────────

  navigateToInventory() {
    cy.visit(urls.inventory);
    this.waitForTableLoad();
  }

  // ── Table readiness ──────────────────────────────────────────────────────

  waitForTableLoad() {
    cy.get('.MuiLinearProgress-root[role="progressbar"]', { timeout: 40000 }).should('not.exist');
  }

  // ── Category filter ──────────────────────────────────────────────────────

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

  // ── Group By Autocomplete ────────────────────────────────────────────────

  /**
   * Open the Group By dropdown by clicking the autocomplete input.
   * Waits for the listbox to appear.
   */
  openGroupByDropdown() {
    cy.get(L.autocompleteRoot).click();
    cy.get(L.optionsListbox).should('be.visible');
  }

  /**
   * Select a field from the Group By autocomplete.
   * Clicks the Autocomplete, types to filter (optional), then clicks the option.
   */
  selectGroupByField(fieldName) {
    cy.get(L.autocompleteRoot).click();
    cy.get(L.optionsListbox).should('be.visible');
    cy.get(L.optionsListbox).contains(L.optionItem, fieldName).click();
    // Close the dropdown by pressing Escape so chips render
    cy.get('body').type('{esc}');
    this.waitForTableLoad();
  }

  /**
   * Delete a filled chip from the Autocomplete by label.
   * Uses the chip's delete icon (MuiChip-deleteIcon).
   */
  deleteChipByLabel(label) {
    cy.contains(L.filledChip, label).find('.MuiChip-deleteIcon').click();
    this.waitForTableLoad();
  }

  /**
   * Click the overflow "+N" chip to open the grouping-fields Popover.
   * MUI Popover uses a Fade transition (~225 ms): the element enters the DOM
   * with opacity:0 and animates to opacity:1. Cypress's `be.visible` treats
   * opacity:0 as invisible and fails even though the element exists.
   * We wait for `opacity:'1'` explicitly so the assertion fires only once the
   * animation has completed.
   */
  clickOverflowChip() {
    cy.get(L.overflowChip).click();
    cy.get(L.popover)
      .should('exist')
      .and('have.css', 'opacity', '1');
  }

  /**
   * Click "Clear All" inside the overflow Popover to remove every GroupBy field.
   * Caller must have already opened the popover via clickOverflowChip().
   */
  clearAllInPopover() {
    cy.get(L.popover).within(() => {
      cy.contains('button', 'Clear All').click();
    });
    this.waitForTableLoad();
  }

  /**
   * Close the overflow Popover via the "Close" button.
   */
  closePopover() {
    cy.get(L.popover).within(() => {
      cy.contains('button', 'Close').click();
    });
    cy.get(L.popover).should('not.exist');
  }

  /**
   * Delete a specific chip inside the overflow Popover.
   */
  deletePopoverChipByLabel(label) {
    // Use .MuiChip-root (not the full L.popoverChip selector) inside .within()
    // to avoid double-scoping: L.popoverChip already includes .MuiPopover-paper.
    cy.get(L.popover).within(() => {
      cy.contains('.MuiChip-root', label).find('.MuiChip-deleteIcon').click();
    });
  }

  // ── Assertions ────────────────────────────────────────────────────────────

  /**
   * Assert no GroupBy fields are active.
   * Checks the Autocomplete root is visible and no filled chips exist.
   * Deliberately avoids asserting the placeholder text because MUI suppresses
   * the placeholder attribute on a disabled Autocomplete (Items View tab active).
   */
  assertGroupByEmpty() {
    cy.get(L.autocompleteRoot).should('be.visible');
    cy.get(L.filledChip).should('not.exist');
  }

  /** Assert a filled chip with the given label is visible inside the Autocomplete. */
  assertFilledChip(label) {
    cy.contains(L.filledChip, label).should('be.visible');
  }

  /** Assert the overflow "+N" chip is visible. */
  assertOverflowChipVisible() {
    cy.get(L.overflowChip).should('be.visible');
  }

  /** Assert the Autocomplete is disabled (Items View tab active). */
  assertAutocompleteDisabled() {
    cy.get(L.autocompleteRoot).should('have.class', 'Mui-disabled');
  }

  /** Assert row-action buttons are absent from the table body (grouping mode). */
  assertRowActionsAbsent() {
    cy.get(L.tbodyRowAction).should('not.exist');
  }

  /** Assert row-action buttons are present in the table body (standard mode). */
  assertRowActionsPresent() {
    cy.get('tbody tr').first().find('button#long-button').should('exist');
  }

  /** Assert the "no rows" overlay is shown (empty grouped table). */
  assertTableEmpty() {
    cy.get(ICFLocators.noRowsOverlay).should('exist');
  }

  /** Assert at least one grouped row is shown in the table body. */
  assertGroupedRowsExist() {
    cy.get('tbody tr').should('have.length.greaterThan', 0);
    cy.get(ICFLocators.noRowsOverlay).should('not.exist');
  }

  /**
   * Find a grouped table row whose first text cell contains `text`.
   * Returns a Cypress chain resolving to that <tr> element.
   */
  findGroupedRowByText(text) {
    return cy.contains('tbody tr', text);
  }

  /**
   * Assert the "Available" quantity rendered inside the grouped row matching
   * `groupValue`. In grouping mode the QuantityCell renders only the Available
   * value (Incoming/Reserved are suppressed — see itemListComponents.tsx).
   */
  assertAvailableInRow(groupValue, expectedNumber) {
    this.findGroupedRowByText(groupValue).within(() => {
      cy.contains('Available').parent().should('contain.text', String(expectedNumber));
    });
  }

  /** Assert the dropdown listbox contains an option for each label in `labels`. */
  assertDropdownOptionsInclude(labels) {
    this.openGroupByDropdown();
    labels.forEach((label) => {
      cy.get(L.optionsListbox).contains(L.optionItem, label).should('be.visible');
    });
    cy.get('body').type('{esc}');
  }

  /** Assert the dropdown listbox does NOT contain any option from `labels`. */
  assertDropdownOptionsExclude(labels) {
    this.openGroupByDropdown();
    labels.forEach((label) => {
      cy.get(L.optionsListbox).should('not.contain.text', label);
    });
    cy.get('body').type('{esc}');
  }

  // ── Search helpers ────────────────────────────────────────────────────────

  /**
   * Type a value into the inventory search bar and click the Search button.
   * Clears any existing text first.
   */
  searchAndSubmit(term) {
    cy.get('#searchInputRef').clear().type(String(term));
    cy.contains('button', /^Search$/).click();
  }

  /**
   * Type the shared attribute value into the search bar, submit, then assert
   * that (a) the GroupBy chips are cleared and (b) every identifier in
   * `expectedIdentifiers` is visible in the standard products table body.
   *
   * Submit clears grouping state (ItemList.tsx:1237) and triggers
   * GET /products?search=…; the standard table must surface all constituents.
   */
  assertSearchRevealsConstituents(sharedValue, expectedIdentifiers) {
    cy.intercept('GET', /\/products(?:\/grouped)?(\?|$)/).as('productsSearch');
    this.searchAndSubmit(sharedValue);
    cy.wait('@productsSearch', { timeout: 20000 });
    this.waitForTableLoad();
    this.assertGroupByEmpty();
    expectedIdentifiers.forEach((id) => {
      cy.get('tbody').should('contain.text', id);
    });
  }

  /**
   * Assert the overflow popover shows the expected title and that each label
   * in `chipLabels` is visible as a chip inside the popover.
   * Caller must have already opened the popover via clickOverflowChip().
   */
  assertPopoverContents(title, chipLabels) {
    cy.get(L.popoverTitle).should('contain.text', title);
    chipLabels.forEach((label) => {
      cy.contains(L.popoverChip, label).should('be.visible');
    });
  }

  // ── Stat cards ───────────────────────────────────────────────────────────

  /** Click a stat badge card by its label text (e.g. "Available", "Damaged"). */
  clickStatBadge(label) {
    cy.contains('[class*="MuiCardActionArea"]', label).click();
    this.waitForTableLoad();
  }

  // ── Advanced Search (pass-through for TC09) ───────────────────────────────

  openAdvancedSearch() {
    cy.get(InvAdvSearchL.openBtn).click();
    cy.get(InvAdvSearchL.dialog).should('be.visible');
  }

  fillAdvancedSearchField(fieldLabel, value) {
    const sel = `input[placeholder="Search by ${fieldLabel.toLowerCase()}..."]`;
    cy.get(InvAdvSearchL.dialog).within(() => {
      cy.get(sel).scrollIntoView();
      cy.get(sel).should('be.visible').clear().type(value, { delay: 30 });
    });
  }

  submitAdvancedSearch() {
    cy.get(InvAdvSearchL.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
  }
}

export default InventoryGroupByPage;
