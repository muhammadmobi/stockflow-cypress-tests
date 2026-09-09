// cypress/pageObjects/InventoryActions/BulkContentsMovePage.js
//
// Page object for the Bulk Contents Move mobile screen
// (route /MobileViewScreen/bulk-contents-move).
// Component: Frontend/src/components/BulkContentsMove/index.tsx.
//
// Three steps (source → target → preview). Source / target both use the
// same renderSelectionUI helper but with distinct DOM ids — see
// fixtures.bulkContentsMove.json.decisionTable for the four
// source/target endpoint combinations.

import L from '../../support/locators/InventoryActions/bulkContentsMoveLocators';

class BulkContentsMovePage {
  // ---- Navigation -------------------------------------------------------

  visit() {
    // Intercept before navigation so the containers list request (fired on
    // component mount) is captured. doUniversalScan() matches codes against
    // containersListData first — if the list isn't loaded when Enter is
    // pressed the scan falls through to the location API and fails.
    // NOTE: match on the path only (no `pageSize` query matcher) — the
    // deployed build requests `/containers` while newer source appends
    // `?pageSize=9999`; the wait must survive both.
    cy.intercept({ method: 'GET', url: '**/containers*' }).as('_bcmContainersList');
    cy.visit('/MobileViewScreen/bulk-contents-move');
    cy.url().should('include', '/bulk-contents-move');
    cy.wait('@_bcmContainersList', { timeout: 15000 }).then(({ response }) => {
      expect(response.statusCode, 'containers list HTTP status').to.eq(200);
      const body = response.body;
      const list = Array.isArray(body)
        ? body
        : body.items || (body.data && (body.data.items || body.data.list || body.data)) || [];
      expect(list, 'containers list is a non-empty array').to.be.an('array').and.have.length.greaterThan(0);
    });
    cy.contains(L.step1Heading, { timeout: 10000 }).should('be.visible');
    cy.get(`#${L.sourceQrInputId}`).should('be.visible');
  }

  walkFromLanding() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.assignmentTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.bulkContentsMoveTile}$`)).click();
    cy.url().should('include', '/bulk-contents-move');
  }

  // ---- Step 1: source --------------------------------------------------

  assertSourceStepVisible() {
    cy.contains(L.step1Heading, { timeout: 15000 }).should('be.visible');
    cy.get(`#${L.sourceQrInputId}`).should('be.visible');
  }

  // Mode-agnostic step-1 assertion. The source scan input only renders in
  // 'scan' mode; after selecting via the picker the step stays in
  // 'selectContainer' mode (Back preserves the input mode), so assert the
  // step heading rather than the scan input.
  assertOnSourceStep() {
    cy.contains(L.step1Heading, { timeout: 15000 }).should('be.visible');
    cy.contains(L.step2Heading).should('not.exist');
  }

  scanSourceCode(code) {
    cy.get(`#${L.sourceQrInputId}`).clear().type(`${code}{enter}`);
  }

  // Select a source/target CONTAINER through the picker instead of scanning
  // the code. `doUniversalScan` matches a scanned code against the component's
  // page-level `containersListData` first; on builds whose list resolves empty
  // (predating the `?pageSize=9999` fix, present in current source) that match
  // never happens and the code falls through to the location API → "no match".
  // The picker (`ContainerSelector`, `showAllContainers`) fetches its own
  // searchable list and resolves by object reference, so it works on both the
  // deployed and current builds. Location sources are unaffected (they resolve
  // through the location API) and keep using scanSourceCode.
  _selectContainerViaPicker(dialogTitle, code) {
    cy.contains('button', new RegExp(`^${L.selectContainerToggleLabel}$`)).first().click();
    cy.contains(dialogTitle, { timeout: 10000 }).should('be.visible');
    cy.get(L.containerPickerSearchInput, { timeout: 10000 }).clear().type(code);
    cy.contains(code, { timeout: 10000 }).scrollIntoView().click({ force: true });
  }

  selectSourceViaPicker(code) {
    this._selectContainerViaPicker(L.sourceContainerSelectorTitle, code);
  }

  selectTargetViaPicker(code) {
    this._selectContainerViaPicker(L.targetContainerSelectorTitle, code);
  }

  // ---- Step 2: target --------------------------------------------------

  assertTargetStepVisible() {
    cy.contains(L.step2Heading, { timeout: 15000 }).should('be.visible');
    cy.get(`#${L.targetQrInputId}`).should('be.visible');
  }

  // Mode-agnostic assertion that we are on the target step and have NOT
  // advanced to the preview step. Used to verify a rejected target selection
  // (e.g. same-as-source) without relying on the transient error toast.
  assertStillOnTargetStep() {
    cy.contains(L.step2Heading, { timeout: 15000 }).should('be.visible');
    cy.contains(L.step3Heading).should('not.exist');
  }

  scanTargetCode(code) {
    cy.get(`#${L.targetQrInputId}`).clear().type(`${code}{enter}`);
  }

  // ---- Step 3: preview --------------------------------------------------

  assertPreviewVisible() {
    cy.contains(L.step3Heading, { timeout: 15000 }).should('be.visible');
    cy.contains('button', new RegExp(`^${L.confirmMoveBtnPrefix}`)).should('be.visible');
  }

  assertEmptySource() {
    cy.contains(L.emptySourceText).should('be.visible');
  }

  clickConfirmMove() {
    cy.contains('button', new RegExp(`^${L.confirmMoveBtnPrefix}`)).click();
  }

  // ---- Back navigation -------------------------------------------------

  goBack() {
    cy.contains('button', /^← Back$/).first().click();
  }
}

export default BulkContentsMovePage;
