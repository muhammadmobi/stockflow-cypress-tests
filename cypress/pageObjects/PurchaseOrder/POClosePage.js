// cypress/pageObjects/PurchaseOrder/POClosePage.js
//
// Page Object for the PO Close feature.
// Covers:
//   - Purchase Orders list (search, status column, row actions)
//   - PO Close modal (verdict card, quantity breakdown, status issues, missing items, closure fields)
//   - Export Excel
//
// Locators are imported from POCloseLocators.js so specs never touch raw selectors.

import POCloseLocators from '../../support/locators/PurchaseOrder/POCloseLocators';

const L = POCloseLocators;

export default class POClosePage {
  // ── Navigation ───────────────────────────────────────────────────────────────

  visit() {
    cy.visit('/purchase-orders');
  }

  // ── PO List actions ──────────────────────────────────────────────────────────

  searchPO(poNumber) {
    cy.intercept('GET', '**/purchase-orders*').as('poSearch');
    cy.get(L.LIST.SEARCH_INPUT, { timeout: 20000 })
      .should('be.visible')
      .clear()
      .type(poNumber);
    cy.get(L.LIST.SEARCH_SUBMIT).click();
    cy.wait('@poSearch', { timeout: 20000 });
  }

  getRowByPO(poNumber) {
    return cy.contains('td', poNumber).closest('tr');
  }

  /** Click the "Close PO" text button on the row for the given PO. */
  clickClosePOButton(poNumber) {
    this.getRowByPO(poNumber)
      .contains('button', /Close PO/i)
      .should('be.visible')
      .click({ force: true });
  }

  /** Returns the status cell text ("Open" / "Closed") for the row. */
  getRowStatus(poNumber) {
    return this.getRowByPO(poNumber).find('td').eq(3);
  }

  /** Asserts the PO row status matches the expected text. */
  assertRowStatus(poNumber, expectedStatus) {
    this.getRowByPO(poNumber).should('contain.text', expectedStatus);
  }

  /**
   * Assert the "Close PO" button is disabled (already-closed PO).
   * The FE renders the button in all states but sets disabled={status==='Closed'}.
   */
  assertClosePOButtonDisabled(poNumber) {
    this.getRowByPO(poNumber)
      .contains('button', /Close PO/i)
      .should('be.disabled');
  }

  /**
   * Assert a sales-role user has no "Close PO" action on the row at all.
   * List.tsx sets `enableRowActions: isSales() ? false : true` at the table
   * level, so sales users never see an Actions column/button for ANY PO —
   * there is no partial state where the close modal opens but a section
   * inside it is hidden; the entry point itself doesn't exist for sales.
   */
  assertClosePOButtonAbsentForRow(poNumber) {
    this.getRowByPO(poNumber).contains('button', /Close PO/i).should('not.exist');
  }

  /** Delete a PO via the row's delete icon + confirmation dialog. */
  deletePurchaseOrder(poNumber) {
    this.searchPO(poNumber);
    cy.get('body').then(($b) => {
      if ($b.find(`td:contains("${poNumber}")`).length === 0) return;
      this.getRowByPO(poNumber)
        .find('button')
        .last()
        .click({ force: true });
      cy.get('body').then(($b2) => {
        if ($b2.find(L.LIST.DELETE_CONFIRM_INPUT).length > 0) {
          cy.get(L.LIST.DELETE_CONFIRM_INPUT).clear().type('DELETE');
          cy.contains('button', /^Yes$/i).click();
          cy.contains('button', /^Yes$/i, { timeout: 10000 }).should('not.exist');
        }
      });
    });
  }

  // ── Modal assertions ─────────────────────────────────────────────────────────

  /** Wait for the PO Close modal to finish loading (spinner gone). */
  waitForModalReady() {
    cy.get(L.MODAL.DIALOG, { timeout: 20000 }).should('be.visible');
    cy.get(L.MODAL.LOADING_SPINNER, { timeout: 20000 }).should('not.exist');
  }

  assertModalOpen() {
    cy.get(L.MODAL.DIALOG).should('be.visible');
  }

  assertModalTitle(expectedTitle) {
    cy.get(L.MODAL.DIALOG).should('contain.text', expectedTitle);
  }

  // ── Verdict card ─────────────────────────────────────────────────────────────

  assertVerdictPerfectMatch() {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Perfect Match');
  }

  assertVerdictQuantityMismatch() {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Quantity Mismatch');
  }

  assertVerdictCostMismatch() {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Cost Mismatch');
  }

  assertVerdictCostQtyMismatch() {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Cost & Quantity Mismatch');
  }

  // ── Quantity Breakdown ───────────────────────────────────────────────────────
  // Actual DOM: section is "PO-Level Summary" containing "Original Products Quantity"
  // with rows: Received:N  Expected:N  Difference:N  Excess Received:N

  assertQuantityBreakdownVisible() {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Original Products Quantity');
  }

  /**
   * Assert that N units are listed in the "Incoming Items" card (the card that becomes
   * "Missing" on close). DOM: chip "{N} unit(s)" + copy "... {N} unit(s) will be marked
   * as Missing when the PO is closed."
   */
  assertMissingCount(n) {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Incoming Items');
    cy.get(L.MODAL.DIALOG).should('contain.text', `${n} unit`);
  }

  /**
   * Assert that N excess units appear in the "Total Quantities Calculation" card.
   * DOM: "Excess Received:" label followed by "+ N" — the whole row is omitted when
   * excess is 0, so this only applies to n > 0.
   * Scoped to the "Total Quantities Calculation" card via cy.contains(selector, text)
   * (see POCloseLocators.js QTY_CALC) — "Excess Received:" is also rendered verbatim
   * by the separate PO-Level Summary card (PoCloseTextSection.tsx), and a plain
   * `.MuiCard-root:contains()` CSS match would ALSO hit ReconciliationSection's outer
   * wrapper Card, so cy.contains() (which resolves to the single deepest match) is
   * required, not cy.get().
   */
  assertExtrasCount(n) {
    cy.contains(L.QTY_CALC.CARD_SELECTOR, L.QTY_CALC.CARD_TEXT).should('contain.text', 'Excess Received:');
    cy.contains(L.QTY_CALC.CARD_SELECTOR, L.QTY_CALC.CARD_TEXT).should('contain.text', `+ ${n}`);
  }

  /**
   * Assert no missing items — the "Incoming Items" card shows the zero-incoming copy
   * when received=expected.
   */
  assertZeroMissing() {
    cy.get(L.MODAL.DIALOG).should(
      'contain.text',
      'All items received. No items will be marked as Missing'
    );
  }

  /**
   * Assert no excess received — the "Excess Received:" row is omitted entirely when
   * excess is 0 (it is not rendered as "Excess Received:0").
   * Scoped via cy.contains() — see assertExtrasCount() for why.
   */
  assertZeroExtras() {
    cy.contains(L.QTY_CALC.CARD_SELECTOR, L.QTY_CALC.CARD_TEXT).should('not.contain.text', 'Excess Received:');
  }

  // ── "Total Cost/Quantities Calculation" cards (ReconciliationSection) ───────
  // See POCloseLocators.js COST_CALC/QTY_CALC — distinct cards from PO-Level Summary.

  /**
   * Assert the "Total Cost Calculation" card's four rows. Pass only the values that
   * should be PRESENT; omit `excessReceived`/`manualExpected` (leave undefined) to
   * assert the corresponding row is ABSENT — both are conditionally rendered only
   * when their underlying value is > 0 (ReconciliationSection.tsx).
   */
  assertCostCalcCard({ originalReceived, excessReceived, originalExpected, manualExpected } = {}) {
    // ReconciliationSection wraps both calculation cards in an outer <Card> (the
    // "Incoming Items" section), so a plain `.MuiCard-root:contains()` CSS selector
    // matches BOTH that wrapper and the inner card. cy.contains(selector, text)
    // resolves to the single deepest/most-specific match, avoiding the collision —
    // .within() requires exactly one element.
    cy.contains(L.COST_CALC.CARD_SELECTOR, L.COST_CALC.CARD_TEXT).within(() => {
      cy.contains('Original PO Cost Received:')
        .closest('.MuiBox-root')
        .should('contain.text', `$${Number(originalReceived).toFixed(2)}`);

      if (excessReceived !== undefined && excessReceived !== null) {
        cy.contains('Excess Cost Received:')
          .closest('.MuiBox-root')
          .should('contain.text', `$${Number(excessReceived).toFixed(2)}`);
      } else {
        cy.contains('Excess Cost Received:').should('not.exist');
      }

      cy.contains('Original PO Cost Expected:')
        .closest('.MuiBox-root')
        .should('contain.text', `$${Number(originalExpected).toFixed(2)}`);

      if (manualExpected !== undefined && manualExpected !== null) {
        cy.contains('Manual Expected Cost:')
          .closest('.MuiBox-root')
          .should('contain.text', `$${Number(manualExpected).toFixed(2)}`);
      } else {
        cy.contains('Manual Expected Cost:').should('not.exist');
      }
    });
  }

  /**
   * Assert the "Total Quantities Calculation" card's four rows — same present/absent
   * convention as assertCostCalcCard().
   */
  assertQtyCalcCard({ originalReceived, excessReceived, originalExpected, manualExpected } = {}) {
    // See assertCostCalcCard() for why cy.contains() is required here.
    cy.contains(L.QTY_CALC.CARD_SELECTOR, L.QTY_CALC.CARD_TEXT).within(() => {
      cy.contains('Original Received:')
        .closest('.MuiBox-root')
        .should('contain.text', String(originalReceived));

      if (excessReceived !== undefined && excessReceived !== null) {
        cy.contains('Excess Received:')
          .closest('.MuiBox-root')
          .should('contain.text', String(excessReceived));
      } else {
        cy.contains('Excess Received:').should('not.exist');
      }

      cy.contains('Original Expected:')
        .closest('.MuiBox-root')
        .should('contain.text', String(originalExpected));

      if (manualExpected !== undefined && manualExpected !== null) {
        cy.contains('Manual Expected:')
          .closest('.MuiBox-root')
          .should('contain.text', String(manualExpected));
      } else {
        cy.contains('Manual Expected:').should('not.exist');
      }
    });
  }

  // ── Cost Breakdown ───────────────────────────────────────────────────────────
  // Actual DOM: "Original Products Cost" inside PO-Level Summary

  assertCostBreakdownCardVisible() {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Original Products Cost');
  }

  /**
   * Assert the "Original Products Cost" card's "Difference:" row (received cost minus
   * expected cost), formatted like the DOM (`-$150.00`). PoCloseTextSection.tsx's
   * "Original Products Cost" and "Original Products Quantity" cards are both instances
   * of the same shared `BreakdownCard` component and both render the literal label
   * "Difference:" — scoped via cy.contains(selector, text) to the Cost card specifically
   * so this can't accidentally read the Quantity card's row instead (see assertCostCalcCard
   * for why an unscoped `cy.contains('span', 'Difference:')` is fragile: it only "works"
   * today because the Cost card happens to render first in JSX DOM order).
   */
  assertCostDifference(expectedDiffFormatted) {
    cy.contains(L.COST_BREAKDOWN.CARD_SELECTOR, L.COST_BREAKDOWN.CARD_TEXT).within(() => {
      cy.contains('span', 'Difference:').next().should('have.text', expectedDiffFormatted);
    });
  }

  /**
   * Assert the "Original Products Quantity" card's "Difference:" row (received qty
   * minus expected qty, plain number — no "$"). Same shared-component scoping caveat as
   * assertCostDifference() applies, targeted at the Quantity card instead.
   */
  assertQuantityDifference(expectedDiff) {
    cy.contains(L.QTY_BREAKDOWN.CARD_SELECTOR, L.QTY_BREAKDOWN.CARD_TEXT).within(() => {
      cy.contains('span', 'Difference:').next().should('have.text', String(expectedDiff));
    });
  }

  /** Assert the "Original Products Quantity" card's "Expected:" row equals an exact value. */
  assertQuantityExpected(expectedQty) {
    cy.contains(L.QTY_BREAKDOWN.CARD_SELECTOR, L.QTY_BREAKDOWN.CARD_TEXT).within(() => {
      cy.contains('span', 'Expected:').next().should('have.text', String(expectedQty));
    });
  }

  /** Assert the "Original Products Quantity" card's "Received (PO):" row equals an exact value. */
  assertQuantityReceived(receivedQty) {
    cy.contains(L.QTY_BREAKDOWN.CARD_SELECTOR, L.QTY_BREAKDOWN.CARD_TEXT).within(() => {
      cy.contains('span', 'Received (PO):').next().should('have.text', String(receivedQty));
    });
  }

  /** Assert the "Original Products Cost" card's "Expected:" row equals an exact formatted value (e.g. '$375.00'). */
  assertCostExpected(expectedFormatted) {
    cy.contains(L.COST_BREAKDOWN.CARD_SELECTOR, L.COST_BREAKDOWN.CARD_TEXT).within(() => {
      cy.contains('span', 'Expected:').next().should('have.text', expectedFormatted);
    });
  }

  /** Assert the "Original Products Cost" card's "Received (PO):" row equals an exact formatted value. */
  assertCostReceived(receivedFormatted) {
    cy.contains(L.COST_BREAKDOWN.CARD_SELECTOR, L.COST_BREAKDOWN.CARD_TEXT).within(() => {
      cy.contains('span', 'Received (PO):').next().should('have.text', receivedFormatted);
    });
  }

  clickViewProductLevelBreakdown() {
    cy.get(L.MODAL.DIALOG)
      .contains('button', /Product level breakdown/i)
      .click({ force: true });
  }

  /**
   * Turn off the "Mismatches Only" filter toggle in the Product Level Breakdown table.
   * It defaults to ON (CostBreakdownModal.tsx: `useState(!defaultManualOnly)`), which hides
   * any product row that is a Perfect Match (expected === received) — needed whenever a test
   * asserts a row for a fully-received product alongside mismatched ones.
   */
  disableMismatchesOnlyFilter() {
    cy.get(L.MODAL.DIALOG).contains('span', 'Mismatches Only').click({ force: true });
  }

  /**
   * Assert the Product Level Breakdown table's Expected/Received(PO) cells for the row
   * whose Product Name cell contains `nameSubstring`. Column order (CostBreakdownModal.tsx
   * RECON_COLUMNS, after the expand-chevron + Product Name columns): Expected, Received(PO),
   * Excess, Incoming, Missing, Damaged, Available — so Expected is td index 2, Received is
   * td index 3 (0 = expand chevron, 1 = Product Name).
   */
  assertProductRowQuantities(nameSubstring, { expected, received } = {}) {
    cy.contains(L.MODAL.DIALOG + ' tr', nameSubstring).within(() => {
      if (expected !== undefined && expected !== null) {
        cy.get('td').eq(2).should('have.text', String(expected));
      }
      if (received !== undefined && received !== null) {
        cy.get('td').eq(3).should('have.text', String(received));
      }
    });
  }

  // ── Status Issues ────────────────────────────────────────────────────────────

  assertStatusIssuesDamagedCount(n) {
    cy.get(L.MODAL.DIALOG).should('contain.text', `Damaged: ${n}`);
  }

  assertStatusIssuesDisputedCount(n) {
    cy.get(L.MODAL.DIALOG).should('contain.text', `Disputed: ${n}`);
  }

  assertStatusIssuesMissingCount(n) {
    cy.get(L.MODAL.DIALOG).should('contain.text', `Missing: ${n}`);
  }

  assertStatusIssuesSectionPresent() {
    cy.get(L.MODAL.DIALOG).should('contain.text', 'Status Issues');
  }

  // ── Missing Items section ────────────────────────────────────────────────────
  // There is no literal "Missing Items" heading in the DOM — the "Incoming Items"
  // card's copy switches between the zero-incoming sentence and the "will be marked
  // as Missing" sentence depending on whether anything is still incoming.

  assertMissingItemsSectionVisible() {
    cy.get(L.MODAL.DIALOG).should(
      'not.contain.text',
      'All items received. No items will be marked as Missing'
    );
  }

  assertMissingItemsSectionAbsent() {
    cy.get(L.MODAL.DIALOG).should(
      'contain.text',
      'All items received. No items will be marked as Missing'
    );
  }

  assertSerialInMissingItems(serialNumber) {
    cy.get(L.MODAL.DIALOG).should('contain.text', serialNumber);
  }

  // ── Closure actions ──────────────────────────────────────────────────────────

  submitClosePO() {
    cy.get(L.MODAL.CLOSE_PO_SUBMIT_BTN)
      .should('be.visible')
      .click({ force: true });
    // Wait for the modal to close (success path)
    cy.get(L.MODAL.DIALOG, { timeout: 15000 }).should('not.exist');
  }

  cancelModal() {
    cy.contains(L.MODAL.DIALOG + ' button', /Cancel/i).click({ force: true });
    cy.get(L.MODAL.DIALOG).should('not.exist');
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  assertExportButtonVisible() {
    cy.get(L.MODAL.EXPORT_BTN).should('be.visible');
  }

  clickExportExcel() {
    cy.get(L.MODAL.EXPORT_BTN).click({ force: true });
  }

  // ── Closure fields (ReconciliationSection) ───────────────────────────────────

  assertClosureReasonSelectVisible() {
    cy.get(L.CLOSURE.REASON_LABEL).should('be.visible');
  }

  selectClosureReason(optionText) {
    cy.get(L.CLOSURE.REASON_SELECT).first().click({ force: true });
    cy.get('[role="listbox"], ul[role="listbox"]').contains(optionText).click({ force: true });
  }

  typeClosureNote(text) {
    cy.get(L.CLOSURE.NOTES_TEXTAREA).clear().type(text);
  }

  typeCreditMemoNumber(text) {
    cy.get(L.CLOSURE.CREDIT_MEMO_INPUT).clear().type(text);
  }

  // ── Admin cost/qty adjustment ────────────────────────────────────────────────

  assertAdjustmentSectionVisible() {
    cy.get(L.ADJUSTMENT.SECTION_TITLE, { timeout: 10000 }).should('be.visible');
  }

  assertAdjustmentSectionAbsent() {
    cy.get('[role="dialog"]').should('not.contain.text', 'Adjust cost / quantity (Admin)');
  }

  setCostForFirstProduct(cost) {
    cy.get(L.ADJUSTMENT.COST_INPUT).first().clear().type(String(cost));
  }

  /**
   * Click the combined "Save Changes" button that persists pending cost/expected-qty
   * edits immediately (ReconciliationSection.tsx). The button is rendered disabled
   * until there is at least one pending edit, so we wait for it to become enabled
   * before clicking — a force-click on a disabled MUI button would not fire onClick.
   */
  clickSaveChanges() {
    cy.get(L.ADJUSTMENT.SAVE_COST_BTN).should('be.visible').and('not.be.disabled').click();
  }

  // ── Post-close details (ClosureDetailsPopover) ───────────────────────────────

  clickClosureDetailsTrigger() {
    cy.get(L.CLOSURE_DETAILS.TRIGGER).first().click({ force: true });
  }

  assertClosureDetailsTriggerAbsent() {
    cy.get(L.CLOSURE_DETAILS.TRIGGER).should('not.exist');
  }
}
