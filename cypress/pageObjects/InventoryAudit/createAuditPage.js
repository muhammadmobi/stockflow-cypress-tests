// cypress/pageObjects/InventoryAudit/createAuditPage.js
//
// Page object for the create-audit screen at /abc/audits/new
// (cypress/e2e/InventoryAudit/02-CreateAuditTests.cy.js).
// Components: Frontend/src/components/ABC/CreateAudit.tsx + LocationScopePicker.tsx
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §9.1 (TC43..TC69)

import L, {
  AUDIT_TYPE_LABEL,
  PREVIEW_TILE,
  REQUIRED_LABEL,
  STRATEGY_LABEL,
} from '../../support/locators/InventoryAudit/createAuditLocators';
import T from '../../support/locators/InventoryAudit/auditToastLocators';

const CREATE_ROUTE = '/abc/audits/new';

class CreateAuditPage {
  // ── Navigation ──────────────────────────────────────────────────────────

  visit() {
    cy.visit(CREATE_ROUTE);
    return this;
  }

  assertOnCreateRoute() {
    cy.location('pathname').should('eq', CREATE_ROUTE);
    L.pageHeading().should('be.visible');
    return this;
  }

  goBack() {
    L.backButton().click();
    return this;
  }

  // ── Name ────────────────────────────────────────────────────────────────

  /**
   * A name of an exact length, built rather than hard-coded: a 151-character
   * literal is unreadable and a miscount silently moves the boundary.
   * The input's own maxLength is 151 (MAX_NAME + 1) so the over-length case can
   * be typed at all and its error observed.
   */
  nameOfLength(length, prefix = 'cy', filler = 'a') {
    return prefix + filler.repeat(Math.max(0, length - prefix.length));
  }

  enterName(value) {
    L.nameInput().clear().type(value, { delay: 0 });
    return this;
  }

  enterNameOfLength(length) {
    return this.enterName(this.nameOfLength(length));
  }

  assertNameValid() {
    L.nameHelperText().should('contain.text', 'Required — unique among');
    return this;
  }

  assertNameError(text) {
    L.nameHelperText().should('contain.text', text);
    return this;
  }

  /** What the field actually holds — proves the maxLength cap, not our typing. */
  readNameLength() {
    return L.nameInput().invoke('val').then((v) => String(v).length);
  }

  // ── Audit type ──────────────────────────────────────────────────────────

  selectAuditType(type) {
    L.auditTypeButton(AUDIT_TYPE_LABEL[type]).click();
    return this;
  }

  assertAuditTypeSelected(type) {
    L.auditTypeButton(AUDIT_TYPE_LABEL[type]).should('have.attr', 'aria-pressed', 'true');
    return this;
  }

  assertClassSelectVisible() {
    L.classSelect().should('exist');
    return this;
  }

  assertClassSelectAbsent() {
    // Must use the start-anchored label regex: the end-anchored one could never
    // match "Audit Class *", so this assertion used to pass on both branches.
    cy.contains(REQUIRED_LABEL.abcClass).should('not.exist');
    return this;
  }

  assertAssignOnScanVisible() {
    L.assignOnScanLabel().should('be.visible');
    L.assignOnScanSwitch().should('exist');
    return this;
  }

  assertAssignOnScanAbsent() {
    cy.contains(/assign to location on scan/i).should('not.exist');
    return this;
  }

  assertAssignOnScanChecked(checked) {
    L.assignOnScanSwitch().should(checked ? 'be.checked' : 'not.be.checked');
    return this;
  }

  toggleAssignOnScan() {
    L.assignOnScanSwitch().click();
    return this;
  }

  assertAssignOnScanLabel(text) {
    cy.contains(text).should('be.visible');
    return this;
  }

  assertTypeCaption(pattern) {
    L.auditTypeCaption().invoke('text').should('match', pattern);
    return this;
  }

  // ── ABC class ───────────────────────────────────────────────────────────

  /**
   * Choose an ABC class. The options are labelled "Class A" / "Class B" /
   * "Class C" — NOT bare letters — so an anchored `/^A$/` matches nothing
   * (verified against the rendered option list on 2026-08-18).
   */
  selectClass(abcClass) {
    L.classSelect().click();
    cy.get('[role="listbox"]')
      .findByRole('option', { name: new RegExp(`^class ${abcClass}$`, 'i') })
      .click();
    return this;
  }

  // ── Location scope picker ───────────────────────────────────────────────

  /**
   * Drill one level: open the picker's select and choose a node by its label.
   *
   * The enabled-check is load-bearing, not defensive. `LocationScopePicker`
   * disables its select while the children query is in flight
   * (`disabled={disabled || isFetching}`), and a click on a disabled MUI Select is
   * a silent no-op — Cypress then retries finding the option list forever and
   * fails with "Expected to find [role=listbox]" that says nothing about why.
   * Waiting for the control to be enabled is what makes the click land.
   */
  drillIntoScope(nodeLabel) {
    L.scopeSelect().should('not.have.attr', 'aria-disabled', 'true').click();
    cy.get('[role="listbox"]').contains('[role="option"]', nodeLabel).click();
    return this;
  }

  assertBreadcrumbCount(count) {
    L.scopeBreadcrumbChips().should('have.length', count);
    return this;
  }

  assertBreadcrumbChipText(index, text) {
    L.scopeBreadcrumbChips().eq(index).should('contain.text', text);
    return this;
  }

  /** The active scope is the LAST chip, rendered `color="primary"`. */
  assertActiveScopeIsLastChip() {
    L.scopeBreadcrumbChips().last().should('have.class', 'MuiChip-colorPrimary');
    return this;
  }

  resetScope() {
    L.scopeBreadcrumbAllLink().click();
    return this;
  }

  popBreadcrumbTo(index) {
    L.scopeBreadcrumbChips().eq(index).click();
    return this;
  }

  assertBreadcrumbEmpty() {
    L.scopeBreadcrumbChips().should('not.exist');
    return this;
  }

  assertLeafBinNote() {
    L.scopeLeafNote().should('be.visible');
    return this;
  }

  // ── Workers ─────────────────────────────────────────────────────────────

  /**
   * Open the roster and take the FIRST worker offered — for cases that need any
   * worker rather than a named one (a live create, or a filtered list whose one
   * remaining row is the assertion).
   */
  selectFirstWorker() {
    L.workerInput().click();
    L.firstWorkerOption().click();
    return this;
  }

  /** Take the first option from an ALREADY-OPEN roster list. */
  pickFirstListedWorker() {
    L.firstWorkerOption().click();
    return this;
  }

  selectWorker(name) {
    L.workerInput().click().type(name.slice(0, 3), { delay: 0 });
    L.workerOption(new RegExp(name, 'i')).click();
    return this;
  }

  /** Type an arbitrary fragment (e.g. an e-mail) and yield the option labels. */
  typeWorkerFilter(fragment) {
    L.workerInput().click().clear().type(fragment, { delay: 0 });
    return cy
      .get('[role="listbox"]')
      .find('[role="option"]')
      .then(($o) => Cypress._.map($o.toArray(), (el) => Cypress.$(el).text().trim()));
  }

  assertWorkerChipCount(count) {
    L.workerChips().should('have.length', count);
    return this;
  }

  // ── Strategy ────────────────────────────────────────────────────────────

  selectStrategy(strategy) {
    L.strategySelect().click();
    cy.get('[role="listbox"]').findByRole('option', { name: STRATEGY_LABEL[strategy] }).click();
    return this;
  }

  /**
   * The strategy options, with the menu CLOSED again before yielding.
   *
   * Self-closing on purpose: an open MUI select lays an invisible modal backdrop
   * over the page, so the next click anywhere — including re-opening this same
   * select — fails with "covered by another element". A read helper that leaves the
   * UI open is a trap for whatever runs next.
   */
  readStrategyOptions() {
    L.strategySelect().click();
    return cy
      .get('[role="listbox"]')
      .find('[role="option"]')
      .then(($o) => Cypress._.map($o.toArray(), (el) => Cypress.$(el).text().trim()))
      .then((labels) => {
        cy.get('body').type('{esc}');
        cy.get('[role="listbox"]').should('not.exist');
        // `cy.wrap` — NOT a bare return: queueing cy commands in a .then() and
        // then returning a plain value is the "mixing async and sync code" error.
        return cy.wrap(labels, { log: false });
      });
  }

  // ── Preview ─────────────────────────────────────────────────────────────

  assertPreviewPlaceholder() {
    L.previewPlaceholder().should('be.visible');
    return this;
  }

  assertPreviewTile(caption, value) {
    L.previewTileValue(caption).should('have.text', Number(value).toLocaleString());
    return this;
  }

  assertPreviewTileCaptionPresent(caption) {
    cy.contains(caption).should('be.visible');
    return this;
  }

  assertPreviewTileCaptionAbsent(caption) {
    cy.contains(caption).should('not.exist');
    return this;
  }

  assertPreviewEmptyWarning() {
    L.previewEmptyWarning().should('be.visible');
    return this;
  }

  assertPreviewUnmappedInfo() {
    L.previewUnmappedInfo().should('be.visible');
    return this;
  }

  assertPreviewError() {
    L.previewError().should('be.visible');
    return this;
  }

  /** Tile captions differ by audit type — see plan TC57. */
  previewBinTileCaption(auditType) {
    return auditType === 'Location' ? PREVIEW_TILE.binsLocation : PREVIEW_TILE.binsAbc;
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  assertSubmitDisabled() {
    L.submitButton().should('be.disabled');
    return this;
  }

  assertSubmitEnabled() {
    L.submitButton().should('not.be.disabled');
    return this;
  }

  assertSubmitHint(pattern) {
    L.submitHint().invoke('text').should('match', pattern);
    return this;
  }

  /**
   * Whether the empty-scope confirmation is currently standing open. Yields a
   * boolean rather than asserting, so the CALLER keeps the branch — a live create
   * over a probed bin legitimately previews zero bins or not, depending on what
   * that bin holds, and neither outcome is a failure. TC61/TC62 own the dialog
   * itself; this is only "did it appear this time?".
   */
  emptyScopeDialogIsOpen() {
    return cy
      .get('body')
      .then(($body) => /create an audit with no count tasks\?/i.test($body.text()));
  }

  submit() {
    L.submitButton().click();
    return this;
  }

  // ── Empty-scope confirmation ────────────────────────────────────────────

  assertEmptyScopeDialogOpen() {
    L.emptyScopeDialogTitle().should('be.visible');
    return this;
  }

  dismissEmptyScopeDialog() {
    L.goBackButton().click();
    L.emptyScopeDialog().should('not.exist');
    return this;
  }

  createAnyway() {
    L.createAnywayButton().click();
    return this;
  }

  // ── Toasts ──────────────────────────────────────────────────────────────

  assertToast(pattern) {
    T.toastText().should('match', pattern);
    return this;
  }

  assertNoToastMatching(pattern) {
    T.toastText().should('not.match', pattern);
    return this;
  }

  /**
   * Fill every required field for an Abc audit. Named for intent so a spec body
   * reads as the use case, not as a form-filling script.
   */
  fillValidAbcForm({ name, abcClass, scopePath, worker, strategy }) {
    this.enterName(name);
    this.selectAuditType('Abc');
    this.selectClass(abcClass);
    scopePath.forEach((node) => this.drillIntoScope(node));
    this.selectWorker(worker);
    if (strategy) this.selectStrategy(strategy);
    return this;
  }
}

export default CreateAuditPage;
