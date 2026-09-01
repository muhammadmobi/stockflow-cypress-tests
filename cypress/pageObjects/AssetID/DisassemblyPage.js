// cypress/pageObjects/AssetID/DisassemblyPage.js
//
// Page object for Asset ID → Disassembly (/asset-id/disassembly).
// Component: Frontend/src/pages/AssetIdDisassembly.tsx
// Test plan: cypress/qa/testPlans/assetId/sub/disassembly-plan.md
//
// Three tables coexist on this screen (Found Items / Previously Generated
// Labels / Assembled Items). Every table method below scopes through
// `L.cardByHeading(...)` — an unscoped table query would match whichever card
// renders first and assert against the wrong dataset.

import L from '../../support/locators/AssetID/disassemblyLocators';

class DisassemblyPage {
  visit() {
    cy.visit('/asset-id/disassembly');
    cy.contains(L.scanCardHeading, { timeout: 30000 }).should('be.visible');
    return this;
  }

  // ── Card 1 — scan ──────────────────────────────────────────────────────

  /**
   * Type a serial and click Scan. The intercept goes up first so the wait can
   * never race a request that already flew — and so the client-side-guard TCs
   * (empty input) can assert `@aidScan.all` is empty, which needs the alias to
   * exist even though no request is expected.
   */
  scanSerial(serialNumber) {
    cy.intercept('POST', '**/products/asset-id/scan').as('aidScan');
    if (serialNumber !== undefined && serialNumber !== null && serialNumber !== '') {
      L.inputWithinLabel(L.serialLabel).clear().type(serialNumber);
    } else {
      L.inputWithinLabel(L.serialLabel).clear();
    }
    L.cardByHeading(L.scanCardHeading).contains('button', L.scanBtnText).click();
    return this;
  }

  assertParentSerial(serialNumber) {
    cy.contains(L.parentSerialPrefix).parent().should('contain.text', serialNumber);
    return this;
  }

  // ── Card 2 — found items ───────────────────────────────────────────────

  assertFoundItemsEmptyState() {
    L.cardByHeading(L.foundItemsCardHeading).should('contain.text', L.emptyFoundItemsText);
    return this;
  }

  assertFoundItemRow(serialNumber) {
    L.cardByHeading(L.foundItemsCardHeading)
      .find('tbody tr')
      .contains('td', serialNumber)
      .should('exist');
    return this;
  }

  /** Assert the Status cell of a found-item row. */
  assertFoundItemStatus(serialNumber, status) {
    L.cardByHeading(L.foundItemsCardHeading)
      .contains('td', serialNumber)
      .closest('tr')
      .should('contain.text', status);
    return this;
  }

  /** Select a found item by clicking its Radio. */
  selectFoundItem(serialNumber) {
    cy.intercept('GET', '**/products/asset-id/disassembly/generated-labels/**').as('aidGeneratedLabels');
    L.cardByHeading(L.foundItemsCardHeading)
      .contains('td', serialNumber)
      .closest('tr')
      .find(L.rowRadio)
      .check({ force: true });
    return this;
  }

  // ── Cards 3 & 4 — generated labels / assembled items ───────────────────

  assertGeneratedLabelRow(assetId) {
    L.cardByHeading(L.generatedLabelsCardHeading)
      .find('tbody tr')
      .contains('td', assetId)
      .should('exist');
    return this;
  }

  assertAssembledItemsEmptyState() {
    L.cardByHeading(L.assembledItemsCardHeading).should('contain.text', L.emptyAssembledItemsText);
    return this;
  }

  // ── Card 5 — disassembly labels form ───────────────────────────────────

  /**
   * Choose the target category.
   *
   * The FormControl is `disabled={!selectedItem || categoriesLoading}`, and a
   * click on a disabled MUI Select is a silent no-op that surfaces later as a
   * misleading "listbox not found" — so the enabled state is awaited first.
   * The control is addressed by its LABEL rather than by "the first combobox in
   * the card": the Product autocomplete in the same card also exposes
   * role="combobox", so a positional selector would silently drift the day the
   * two fields are reordered.
   */
  selectCategory(categoryName) {
    cy.intercept('GET', '**/products/asset-id/disassembly/category/**/products').as('aidDisCatProducts');
    L.cardByHeading(L.disassemblyLabelsCardHeading)
      .contains('label', L.categoryLabel)
      .should('not.have.class', 'Mui-disabled');
    L.cardByHeading(L.disassemblyLabelsCardHeading)
      .contains('label', L.categoryLabel)
      .closest('.MuiFormControl-root')
      .find('[role="combobox"]')
      .click();
    cy.get(L.listbox, { timeout: 20000 }).find(L.option).contains(categoryName).click();
    return this;
  }

  selectProduct(productNameFragment) {
    L.cardByHeading(L.disassemblyLabelsCardHeading)
      .contains('label', L.productLabel)
      .closest('.MuiFormControl-root')
      .find('input')
      .clear()
      .type(productNameFragment);
    cy.get(L.listbox, { timeout: 20000 })
      .find(L.option)
      .contains(productNameFragment)
      .first()
      .click();
    return this;
  }

  /**
   * Set Label Quantity. See GenerateAssetIdPage.setLabelQuantity for why this
   * is select-all-and-overtype rather than `.clear().type(...)` — the field is
   * a controlled number input whose caret snaps to 0 after a clear, turning
   * "3" into "30".
   */
  setLabelQuantity(quantity) {
    const value = String(quantity);
    const field = () =>
      L.cardByHeading(L.disassemblyLabelsCardHeading)
        .contains('label', L.labelQuantityLabel)
        .closest('.MuiFormControl-root')
        .find('input');
    field().type(`{selectall}${value}`);
    field().should('have.value', value);
    return this;
  }

  clickPreview() {
    cy.intercept('POST', '**/products/asset-id/disassembly/preview').as('aidDisPreview');
    cy.contains('button', L.previewBtnText).click();
    return this;
  }

  clickPrintLabels() {
    cy.intercept('POST', '**/products/asset-id/disassembly/create-and-generate').as('aidDisCreate');
    cy.contains('button', L.printLabelsBtnText).click();
    return this;
  }

  // ── Change-category confirmation dialog ────────────────────────────────

  // ── Shared assertions ──────────────────────────────────────────────────

  /** Read the panel's own rendered count — see GenerateAssetIdPage for why. */
  assertPreviewCardCount(expected) {
    cy.contains(L.previewHeadingWithCount(expected), { timeout: 30000 }).should('be.visible');
    return this;
  }

  /** Assert one specific asset ID has a rendered QR card INSIDE the panel. */
  assertPreviewShowsAssetId(assetId) {
    L.previewPanel()
      .find(`${L.previewCardImg}[alt="${assetId}"]`, { timeout: 30000 })
      .should('exist');
    return this;
  }

  assertPreviewAbsent() {
    cy.contains(L.previewHeadingPrefix).should('not.exist');
    return this;
  }

  assertPrintLabelsDisabled() {
    cy.contains('button', L.printLabelsBtnText).should('be.disabled');
    return this;
  }

  assertPrintLabelsEnabled() {
    cy.contains('button', L.printLabelsBtnText).should('not.be.disabled');
    return this;
  }

  assertPreviewDisabled() {
    cy.contains('button', L.previewBtnText).should('be.disabled');
    return this;
  }

  assertPreviewEnabled() {
    cy.contains('button', L.previewBtnText).should('not.be.disabled');
    return this;
  }

  assertStatusBlockAlert(status) {
    cy.contains(L.alert, status, { timeout: 20000 }).should('be.visible');
    return this;
  }

  /** react-hot-toast text, matched on the document — see the locator note. */
  assertToast(message) {
    cy.contains(message, { timeout: 20000 }).should('be.visible');
    return this;
  }

  assertSummary({ selectedItem, category, product }) {
    if (selectedItem) cy.contains(L.summarySelectedItemPrefix).parent().should('contain.text', selectedItem);
    if (category) cy.contains(L.summaryTargetCategoryPrefix).parent().should('contain.text', category);
    if (product) cy.contains(L.summaryTargetProductPrefix).parent().should('contain.text', product);
    return this;
  }
}

export default DisassemblyPage;
