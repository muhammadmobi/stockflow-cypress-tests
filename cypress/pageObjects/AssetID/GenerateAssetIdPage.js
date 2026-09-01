// cypress/pageObjects/AssetID/GenerateAssetIdPage.js
//
// Page object for Generate Asset ID (/asset-id).
// Component: Frontend/src/pages/AssetId.tsx
// Test plan: cypress/qa/testPlans/assetId/sub/generate-asset-id-plan.md
//
// Method naming follows intent, not mechanics (CTAL-TAE §7): `selectPo()` not
// `clickAutocompleteThenOption()`. Assertions live in `assert*` methods so a
// spec body reads as conditions, not DOM steps.

import L from '../../support/locators/AssetID/generateAssetIdLocators';

class GenerateAssetIdPage {
  // ── Navigation ─────────────────────────────────────────────────────────

  /**
   * Visit the screen and wait until its controls are actually usable — see
   * waitForCategoriesLoaded() for why landing on the heading is not enough.
   */
  visit() {
    cy.visit('/asset-id');
    cy.contains(L.heading, { timeout: 30000 }).should('be.visible');
    return this.waitForCategoriesLoaded();
  }

  /**
   * Block until the Category Select is usable.
   *
   * The FormControl is rendered `disabled={categoriesLoading}`, and a click on
   * a disabled MUI Select is a silent no-op — the listbox simply never opens
   * and the next command fails with a misleading "listbox not found". Waiting
   * on the label losing `Mui-disabled` is the DOM's own statement that the
   * category query has settled, and it beats waiting on the network alias
   * because /categories is also fetched by the shell on every page load.
   */
  waitForCategoriesLoaded() {
    cy.contains('label', L.categoryLabel, { timeout: 30000 }).should('not.have.class', 'Mui-disabled');
    return this;
  }

  /** Reach the screen through the sidebar instead of a deep link. */
  navigateViaSidebar() {
    cy.contains('a, div, span', L.navGroupTitle).first().click({ force: true });
    cy.contains('a', L.navGenerateTitle).click({ force: true });
    cy.location('pathname').should('eq', '/asset-id');
    return this;
  }

  // ── Form input ─────────────────────────────────────────────────────────

  /**
   * Type into the PO autocomplete and pick the exact option.
   * Typing first is required: the QA PO list is long and MUI virtualises
   * nothing here, so filtering is what makes the target option reachable in
   * one click instead of a scroll loop.
   */
  selectPo(poNumber) {
    L.inputWithinLabel(L.poLabel).clear().type(poNumber);
    cy.get(L.listbox, { timeout: 20000 })
      .find(L.option)
      .contains(new RegExp(`^${poNumber}$`))
      .click();
    return this;
  }

  /**
   * Clear the PO autocomplete through its own clear (✕) indicator.
   *
   * Deliberately NOT "re-select the same PO": MUI fires onChange on every
   * option pick, but a test that re-picks an identical value would still pass
   * if the handler started short-circuiting on an unchanged value — it would
   * assert nothing. Clearing forces a genuine value change, which is the
   * transition the reset behaviour is actually specified against.
   */
  clearPo() {
    cy.contains('label', L.poLabel)
      .closest('.MuiFormControl-root')
      .find('.MuiAutocomplete-clearIndicator')
      .click({ force: true });
    return this;
  }

  /** Open the Category MUI Select and choose by visible name. */
  selectCategory(categoryName) {
    this.waitForCategoriesLoaded();
    L.comboboxWithinLabel(L.categoryLabel).click();
    cy.get(L.listbox, { timeout: 20000 }).find(L.option).contains(categoryName).click();
    return this;
  }

  /**
   * Type into the Product autocomplete and pick the first filtered option.
   * The product list is derived from the category (+ PO) selection, so this
   * intentionally waits on the option to exist rather than assuming it does.
   */
  selectProduct(productNameFragment) {
    L.inputWithinLabel(L.productLabel).clear().type(productNameFragment);
    cy.get(L.listbox, { timeout: 20000 })
      .find(L.option)
      .contains(productNameFragment)
      .first()
      .click();
    return this;
  }

  /**
   * Set Label Quantity. Accepts a number or a raw string (invalid-input TCs).
   *
   * NOT `.clear().type(value)`. The field is a CONTROLLED number input whose
   * onChange does `setLabelQuantity(Number(event.target.value))`; clear() fires
   * onChange('') which coerces to 0, React re-renders the field as "0", and the
   * caret snaps to position 0 — so the typed digits land BEFORE the zero and
   * "3" silently becomes "30". That defect made the two boundary TCs pass for
   * the wrong reason (0 -> "00", 201 -> "2010") until a value assertion was
   * added. Select-all + overtype keeps the caret correct, and the
   * `should('have.value')` guard makes a silent recurrence impossible.
   */
  setLabelQuantity(quantity) {
    const value = String(quantity);
    L.inputWithinLabel(L.labelQuantityLabel).type(`{selectall}${value}`);
    L.inputWithinLabel(L.labelQuantityLabel).should('have.value', value);
    return this;
  }

  // ── Container / Location assignment ────────────────────────────────────

  /** Switch the optional-assignment block to one of its three input modes. */
  chooseAssignmentMode(mode) {
    const text = {
      scan: L.scanQrToggle,
      container: L.selectContainerToggle,
      location: L.selectLocationToggle,
    }[mode];
    cy.contains('button', text).click();
    return this;
  }

  /** Scan a container/location code through the universal-scan input. */
  scanContainerOrLocation(code) {
    this.chooseAssignmentMode('scan');
    cy.intercept('GET', '**/locations/universal-scan**').as('aidUniversalScan');
    cy.get(L.scanContainerOrLocationInput).clear().type(`${code}{enter}`);
    cy.wait('@aidUniversalScan', { timeout: 20000 });
    return this;
  }

  // ── Actions ────────────────────────────────────────────────────────────

  /**
   * Click "Preview Asset IDs". The intercept is registered BEFORE the click —
   * registering it after means cy.wait can hang on a request that already flew
   * (a repo-wide convention; see cypress/qa/SKILL.md §10).
   */
  clickPreview() {
    cy.intercept('POST', '**/products/asset-id/preview-from-po').as('aidPreview');
    cy.contains('button', L.previewBtnText).click();
    return this;
  }

  /** Click "Generate & Print" — the real mutation. */
  clickGenerate() {
    cy.intercept('POST', '**/products/asset-id/generate-from-po').as('aidGenerate');
    cy.contains('button', L.generateBtnText).click();
    return this;
  }

  // ── Assertions ─────────────────────────────────────────────────────────

  assertOnPage() {
    cy.contains(L.heading).should('be.visible');
    cy.location('pathname').should('eq', '/asset-id');
    return this;
  }

  assertFormControlsVisible() {
    cy.contains('label', L.poLabel).should('be.visible');
    cy.contains('label', L.categoryLabel).should('be.visible');
    cy.contains('label', L.productLabel).should('be.visible');
    cy.contains('label', L.labelQuantityLabel).should('be.visible');
    cy.contains('button', L.previewBtnText).should('exist');
    cy.contains('button', L.generateBtnText).should('exist');
    return this;
  }

  /** Open the Category listbox and hand the option texts to the caller. */
  readCategoryOptions() {
    this.waitForCategoriesLoaded();
    L.comboboxWithinLabel(L.categoryLabel).click();
    return cy
      .get(L.listbox, { timeout: 20000 })
      .find(L.option)
      .then(($opts) => Cypress._.map($opts, (o) => o.textContent.trim()));
  }

  /** Dismiss an open MUI listbox without choosing anything. */
  closeListbox() {
    cy.get('body').type('{esc}');
    cy.get(L.listbox).should('not.exist');
    return this;
  }

  /**
   * Assert how many labels the preview is showing.
   *
   * Reads the panel's own rendered count — the heading is literally
   * `Asset ID Preview ({previewItems.length})` — instead of counting <img>
   * nodes. The QR images are produced by an async effect that re-runs on every
   * previewItems change, so a DOM image count is a race; the heading is
   * rendered synchronously from the same array the cards map over.
   */
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

  /**
   * Assert the Product autocomplete is presented as disabled.
   *
   * Checks the `Mui-disabled` CLASS, not the native `disabled` attribute:
   * AssetId.tsx passes `disabled` to the TextField inside `renderInput`, and
   * MUI's Autocomplete then overwrites the native input's `disabled` through
   * its own `inputProps`. The result is an input that renders greyed-out while
   * the attribute is absent (verified against QA). The class is what the user
   * perceives, so that is what is asserted; the missing attribute is recorded
   * as a finding in cypress/qa/testPlans/assetId/pending.md.
   */
  assertProductFieldDisabled() {
    L.inputWithinLabel(L.productLabel).should('have.class', 'Mui-disabled');
    return this;
  }

  assertProductFieldEnabled() {
    L.inputWithinLabel(L.productLabel).should('not.have.class', 'Mui-disabled');
    return this;
  }

  assertPreviewAbsent() {
    cy.contains(L.previewHeadingPrefix).should('not.exist');
    return this;
  }

  assertGenerateDisabled() {
    cy.contains('button', L.generateBtnText).should('be.disabled');
    return this;
  }

  assertGenerateEnabled() {
    cy.contains('button', L.generateBtnText).should('not.be.disabled');
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

  assertReprintVisible() {
    cy.contains('button', L.reprintBtnText, { timeout: 30000 }).should('be.visible');
    return this;
  }

  assertReprintAbsent() {
    cy.contains('button', L.reprintBtnText).should('not.exist');
    return this;
  }

  /**
   * Assert a react-hot-toast message is on screen. Matched on the document
   * rather than through a structural selector — see the note on `errorToast`
   * in generateAssetIdLocators.js for why.
   */
  assertToast(message) {
    cy.contains(message, { timeout: 20000 }).should('be.visible');
    return this;
  }

  /**
   * The scanned container/location code is rendered as the resolved assignment
   * target. Deliberately NOT assertToast(): this is a positive confirmation
   * that the universal-scan resolved, and the code also renders in the
   * selected-target chip — so calling it a toast assertion overstated what is
   * observed. `scanContainerOrLocation()` already waits on the universal-scan
   * response, so the server side is proven there; this is the render check.
   */
  assertScannedTargetShown(code) {
    cy.contains(code, { timeout: 20000 }).should('be.visible');
    return this;
  }

  assertNoRequestFired(alias) {
    // A negative "the FE blocked this client-side" assertion. cy.get('@alias')
    // throws when the alias never resolved, which is exactly the pass
    // condition — so it is inverted through .then on the intercept's own
    // request store rather than a bare cy.wait that would time out loudly.
    cy.get(`@${alias}.all`).should('have.length', 0);
    return this;
  }
}

export default GenerateAssetIdPage;
