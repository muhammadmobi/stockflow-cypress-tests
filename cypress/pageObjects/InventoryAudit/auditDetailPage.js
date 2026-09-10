// cypress/pageObjects/InventoryAudit/auditDetailPage.js
//
// Page object for the audit detail / bin-assignment screen at /abc/audits/:id
// (cypress/e2e/InventoryAudit/05-AuditAssignmentTests.cy.js).
// Component: Frontend/src/components/ABC/AuditDetail.tsx
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §9.4

import L, { BIN_COLUMNS } from '../../support/locators/InventoryAudit/auditDetailLocators';
import T from '../../support/locators/InventoryAudit/auditToastLocators';

class AuditDetailPage {
  /**
   * Whether the WMS bins screen surfaces any "being counted" wording.
   *
   * Yields a boolean, because whether this build renders the indicator at all is
   * the open question behind E2E-TC20 — see testPlans/inventoryAudit/action-plan.md
   * §6. The caller decides whether a missing indicator is a skip or a failure.
   *
   * Lives here rather than in a Warehouse page object on purpose: this module is
   * the one that cares about the indicator, and reaching across to another
   * module's page object for a one-line read would couple two suites together.
   */
  warehouseShowsCountingIndicator() {
    return cy.get('body').then(($body) => /audit|counting/i.test($body.text()));
  }

  visit(auditId) {
    cy.visit(`/abc/audits/${auditId}`);
    return this;
  }

  assertOnDetailRoute(auditId) {
    cy.location('pathname').should('eq', `/abc/audits/${auditId}`);
    return this;
  }

  goBack() {
    L.backButton().click();
    return this;
  }

  // ── Header ──────────────────────────────────────────────────────────────

  assertAuditName(name) {
    L.auditName(name).should('be.visible');
    return this;
  }

  assertHeaderItem(label, value) {
    L.headerItem(label).should('contain.text', value);
    return this;
  }

  clickReview() {
    L.reviewButton().click();
    return this;
  }

  assertReviewDisabled() {
    L.reviewButton().should('be.disabled');
    return this;
  }

  // ── Generation state ────────────────────────────────────────────────────

  assertGenerating() {
    L.generatingNotice().should('be.visible');
    return this;
  }

  assertNotGenerating() {
    cy.contains(/generating count tasks/i).should('not.exist');
    return this;
  }

  assertNoBinsWarning() {
    L.noBinsWarning().should('be.visible');
    return this;
  }

  /**
   * Wait until count-task generation has finished, bounded explicitly.
   *
   * Waits only for the notice to be ABSENT — deliberately NOT "spinner appears,
   * then disappears". Generation frequently completes before the screen's first
   * render, and the earlier version asserted the spinner existed first, so those
   * runs failed with "expected to find content: /generating count tasks/" while the
   * feature was working perfectly. A Cypress assertion failure is not a catchable
   * promise rejection either, so the two-arg `.then(ok, fail)` guard around it never
   * ran. Absence is true in both orders, which is what makes this correct.
   */
  waitForGeneration(timeout = 90000) {
    cy.contains(/generating count tasks/i, { timeout }).should('not.exist');
    return this;
  }

  // ── Bins table ──────────────────────────────────────────────────────────

  assertBinColumnOrder() {
    BIN_COLUMNS.forEach((name, index) => {
      L.columnHeaders().eq(index).should('contain.text', name);
    });
    return this;
  }

  assertBinRowCount(count) {
    L.rows().should('have.length', count);
    return this;
  }

  assertBinRowCountAtLeast(count) {
    L.rows().should('have.length.at.least', count);
    return this;
  }

  assertBinCell(rowIndex, columnName, text) {
    L.cell(rowIndex, columnName).should('contain.text', text);
    return this;
  }

  /** Every row's assigned-worker cell text, top to bottom. */
  readAssignedWorkers() {
    return L.rows().then(($rows) =>
      Cypress._.map($rows.toArray(), (tr) =>
        Cypress.$(tr).find('td').eq(BIN_COLUMNS.indexOf('Assigned worker')).text().trim()
      )
    );
  }

  /** Rows that still offer a worker select, i.e. bins that are Pending. */
  readAssignableRowCount() {
    return cy.get('table tbody tr').then(($rows) =>
      Cypress._.filter($rows.toArray(), (tr) => Cypress.$(tr).find('[role="combobox"]').length > 0).length
    );
  }

  // ── Assignment ──────────────────────────────────────────────────────────

  assignRowTo(rowIndex, workerName) {
    L.workerSelect(rowIndex).click();
    L.option(workerName).click();
    return this;
  }

  unassignRow(rowIndex) {
    L.workerSelect(rowIndex).click();
    L.option(/^unassigned$/i).click();
    return this;
  }

  /** Worker options, with the menu closed again — an open MUI select lays a modal
   *  backdrop that makes the NEXT click fail wherever it lands. */
  readWorkerOptions(rowIndex) {
    L.workerSelect(rowIndex).click();
    return L.openOptionList()
      .find('[role="option"]')
      .then(($o) => Cypress._.map($o.toArray(), (el) => Cypress.$(el).text().trim()))
      .then((labels) => {
        cy.get('body').type('{esc}');
        L.openOptionList().should('not.exist');
        // `cy.wrap` — NOT a bare return: queueing cy commands in a .then() and
        // then returning a plain value is the "mixing async and sync code" error.
        return cy.wrap(labels, { log: false });
      });
  }

  closeOpenSelect() {
    cy.get('body').type('{esc}');
    return this;
  }

  assertRowLocked(rowIndex) {
    L.workerSelect(rowIndex).should('not.exist');
    L.lockedWorkerText(rowIndex).should('contain.text', '(locked)');
    return this;
  }

  assertRowAssignable(rowIndex) {
    L.workerSelect(rowIndex).should('exist');
    return this;
  }

  assertWorkerSelectDisabled(rowIndex) {
    // MUI marks a disabled select's combobox with aria-disabled.
    L.workerSelect(rowIndex).should('have.attr', 'aria-disabled', 'true');
    return this;
  }

  // ── Save ────────────────────────────────────────────────────────────────

  assertSaveDisabled() {
    L.saveButton().should('be.disabled');
    return this;
  }

  assertSaveEnabled() {
    L.saveButton().should('not.be.disabled');
    return this;
  }

  /** The pending-change count the button advertises, or 0 when it shows none. */
  readPendingChangeCount() {
    return L.saveButton()
      .invoke('text')
      .then((t) => {
        const m = t.match(/\((\d+)\)/);
        return m ? Number(m[1]) : 0;
      });
  }

  save() {
    L.saveButton().click();
    return this;
  }

  assertToast(pattern) {
    T.toastText().should('match', pattern);
    return this;
  }
}

export default AuditDetailPage;
