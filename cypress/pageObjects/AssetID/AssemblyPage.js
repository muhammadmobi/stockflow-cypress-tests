// cypress/pageObjects/AssetID/AssemblyPage.js
//
// Page object for Asset ID → Assembly (/asset-id/assembly).
// Component: Frontend/src/pages/AssetIdReassembly.tsx
// Test plan: cypress/qa/testPlans/assetId/sub/assembly-plan.md

import L from '../../support/locators/AssetID/assemblyLocators';

class AssemblyPage {
  visit() {
    cy.visit('/asset-id/assembly');
    cy.contains(L.heading, { timeout: 30000 }).should('be.visible');
    return this;
  }

  // ── Step 1 — parent serial ─────────────────────────────────────────────

  fetchParent(serialNumber) {
    cy.intercept('POST', '**/products/asset-id/scan').as('aidScan');
    if (serialNumber) L.inputWithinLabel(L.parentSerialLabel).clear().type(serialNumber);
    else L.inputWithinLabel(L.parentSerialLabel).clear();
    cy.contains('button', L.fetchBtnText).click();
    return this;
  }

  clearParent() {
    cy.contains('button', L.clearBtnText).click();
    return this;
  }

  assertParentDetails({ serialNumber, productName, status }) {
    cy.contains(L.productDetailsHeading, { timeout: 30000 }).should('be.visible');
    if (serialNumber) cy.contains(L.parentSerialPrefix).should('contain.text', serialNumber);
    if (productName) cy.contains(L.parentProductPrefix).should('contain.text', productName);
    if (status) cy.contains(L.parentStatusChip, status).should('be.visible');
    return this;
  }

  assertParentDetailsAbsent() {
    cy.contains(L.productDetailsHeading).should('not.exist');
    return this;
  }

  /** After a successful fetch the serial input locks and Fetch becomes Clear. */
  assertParentLocked() {
    L.inputWithinLabel(L.parentSerialLabel).should('be.disabled');
    cy.contains('button', L.clearBtnText).should('be.visible');
    return this;
  }

  // ── Step 2 — asset codes ───────────────────────────────────────────────

  assertAssetCodeEntryDisabled() {
    L.inputWithinLabel(L.assetCodeLabel).should('be.disabled');
    cy.contains('button', L.addScanBtnText).should('be.disabled');
    return this;
  }

  assertAssetCodeEntryEnabled() {
    L.inputWithinLabel(L.assetCodeLabel).should('not.be.disabled');
    cy.contains('button', L.addScanBtnText).should('not.be.disabled');
    return this;
  }

  /**
   * Type an asset code and click Add. The intercept goes up first so the wait
   * can never race a lookup that already flew.
   *
   * `expectRequest: false` is for the duplicate-scan TC, where the browser is
   * expected to refuse the code before any lookup: there is no request to wait
   * on, and re-aliasing `@aidLifecycle` would rebind it to a new interceptor
   * and discard the first scan's history. Note this is the WEAK form of "no
   * request was made" — it is inferred from the toast and an unchanged row
   * count. The strong form, asserting `@aidLifecycle.all` is empty, needs the
   * alias and so must keep the default `true`.
   */
  addAssetCode(code, { expectRequest = true } = {}) {
    if (expectRequest) cy.intercept('GET', '**/products/asset-id/lifecycle/**').as('aidLifecycle');
    if (code) L.inputWithinLabel(L.assetCodeLabel).clear().type(code);
    else L.inputWithinLabel(L.assetCodeLabel).clear();
    cy.contains('button', L.addScanBtnText).click();
    return this;
  }

  assertScannedRow(code) {
    cy.get(L.scannedTable).find(L.scannedTableRow).contains('td', code).should('exist');
    return this;
  }

  assertScannedRowCount(expected) {
    if (expected === 0) {
      cy.contains(L.emptyNoCodesScanned).should('be.visible');
      return this;
    }
    cy.get(L.scannedTable).find(L.scannedTableRow).should('have.length', expected);
    return this;
  }

  /** Assert the Status cell of a scanned row (the row is code-keyed). */
  assertScannedRowStatus(code, status) {
    cy.get(L.scannedTable).contains('td', code).closest('tr').should('contain.text', status);
    return this;
  }

  removeScannedRow(code) {
    cy.get(L.scannedTable)
      .contains('td', code)
      .closest('tr')
      .find(L.removeRowBtn)
      .last()
      .click();
    return this;
  }

  clickAssemble() {
    cy.intercept('POST', '**/products/asset-id/reassembly/link-and-stockout').as('aidReassemble');
    cy.contains('button', L.assembleBtnText).click();
    return this;
  }

  assertAssembleDisabled() {
    cy.contains('button', L.assembleBtnText).should('be.disabled');
    return this;
  }

  assertAssembleEnabled() {
    cy.contains('button', L.assembleBtnText).should('not.be.disabled');
    return this;
  }

  // ── Shared ─────────────────────────────────────────────────────────────

  /** react-hot-toast text, matched on the document — see the locator note. */
  assertToast(message) {
    cy.contains(message, { timeout: 20000 }).should('be.visible');
    return this;
  }

  assertInfoAlert(fragment) {
    cy.contains(L.alert, fragment, { timeout: 20000 }).should('be.visible');
    return this;
  }
}

export default AssemblyPage;
