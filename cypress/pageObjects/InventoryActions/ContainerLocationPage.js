// cypress/pageObjects/InventoryActions/ContainerLocationPage.js
//
// Page object for the Container Location mobile screen
// (route /MobileViewScreen/container-location).
// Component: Frontend/src/components/ContainerLocation/index.tsx.
//
// The same route serves THREE flows differentiated by the `mode` query
// param:
//   • mode=assign/change   — 3 steps: container → location → confirm
//   • mode=unassign        — 2 steps: container → confirm (warning + button)
//
// Tests pass the mode explicitly via visit() so the URL contract is
// covered by the navigation TC (e.g. SW-WM-AC-TC01).

import L from '../../support/locators/InventoryActions/containerLocationLocators';

class ContainerLocationPage {
  // ---- Navigation -------------------------------------------------------

  visitAssign() {
    // Intercept before navigation so the containers list request (fired on
    // component mount) is captured. The scan handler matches codes against
    // containersListData — if it isn't loaded when Enter is pressed the scan
    // errors with "not found" and the step never advances.
    // NOTE: match on the path only (no `pageSize` query matcher) — the
    // deployed build requests `/containers` while newer source appends
    // `?pageSize=9999`; the wait must survive both.
    cy.intercept({ method: 'GET', url: '**/containers*' }).as('_clContainersList');
    cy.visit('/MobileViewScreen/container-location?mode=assign/change');
    cy.url().should('include', 'mode=assign');
    ContainerLocationPage._assertContainersLoaded('_clContainersList');
    cy.contains(L.scanQrToggle, { timeout: 10000 }).should('be.visible');
    cy.get(`#${L.containerQrInputId}`).should('be.visible');
  }

  visitUnassign() {
    cy.intercept({ method: 'GET', url: '**/containers*' }).as('_clContainersList');
    cy.visit('/MobileViewScreen/container-location?mode=unassign');
    cy.url().should('include', 'mode=unassign');
    ContainerLocationPage._assertContainersLoaded('_clContainersList');
    cy.contains(L.scanQrToggle, { timeout: 10000 }).should('be.visible');
    cy.get(`#${L.containerQrInputId}`).should('be.visible');
  }

  // Wait for the containers-list fetch and assert it returned a non-empty
  // list, tolerating both the bare-array and the `{ items, total, … }`
  // paginated envelope the API actually returns.
  static _assertContainersLoaded(alias) {
    cy.wait(`@${alias}`, { timeout: 15000 }).then(({ response }) => {
      expect(response.statusCode, 'containers list HTTP status').to.eq(200);
      const body = response.body;
      const list = Array.isArray(body)
        ? body
        : body.items || (body.data && (body.data.items || body.data.list || body.data)) || [];
      expect(list, 'containers list is a non-empty array').to.be.an('array').and.have.length.greaterThan(0);
    });
  }

  walkFromLandingAssign() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.assignmentTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.assignContainerTile}$`)).click();
    cy.url().should('include', '/container-location');
  }

  walkFromLandingUnassign() {
    cy.visit('/MobileViewScreen');
    cy.contains('button', new RegExp(`^${L.warehouseManagementTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.unassignmentTile}$`)).click();
    cy.contains('button', new RegExp(`^${L.unassignContainerTile}$`)).click();
    cy.url().should('include', '/container-location');
  }

  // ---- Step 1: container -----------------------------------------------

  assertContainerStepVisible() {
    cy.contains(L.scanQrToggle, { timeout: 15000 }).should('be.visible');
    cy.contains(L.selectFromListToggle).should('be.visible');
    cy.get(`#${L.containerQrInputId}`).should('be.visible');
  }

  // Mode-agnostic step-1 assertion. The container step exposes the Scan QR /
  // Select From List toggle pair in BOTH input modes, but the scan input only
  // renders in 'scan' mode. After selecting via the picker the step stays in
  // 'select' mode (the Back handler preserves containerInputMode), so use this
  // to assert "we are back on the container step" without requiring the scan
  // input.
  assertOnContainerStep() {
    cy.contains(L.scanQrToggle, { timeout: 15000 }).should('be.visible');
    cy.contains(L.selectFromListToggle).should('be.visible');
    // Not on step 2 / step 3.
    cy.contains(L.selectTargetLocationHeading).should('not.exist');
    cy.contains(L.unassignWarningText).should('not.exist');
  }

  scanContainerCode(code) {
    cy.get(`#${L.containerQrInputId}`).clear().type(`${code}{enter}`);
  }

  selectFromListToggle() {
    cy.contains('button', new RegExp(`^${L.selectFromListToggle}$`)).click();
  }

  // Select a container through the "Select From List" picker.
  //
  // Why not always scan the code? The container-step scan handler
  // (`selectContainerByCode`) matches the typed code against the component's
  // page-level `containersListData` query. On deployed builds that predate the
  // `?pageSize=9999` + `{ items }`-envelope parsing fix (present in current
  // source), that list resolves empty, so *every* code — valid or seeded —
  // reports "not found" and the flow never advances. The picker
  // (`ContainerSelector`) fetches its own paginated/searchable list and
  // resolves the container by object reference (`handleContainerSelect`),
  // so it works on both the deployed and the current build. The picker is
  // therefore the deterministic way to satisfy the "a container is selected"
  // precondition for the location/confirm-step assertions.
  selectContainerViaPicker(code) {
    this.selectFromListToggle();
    cy.contains(L.containerSelectorTitle, { timeout: 10000 }).should('be.visible');
    // Search server-side so the target is surfaced even when it is not on the
    // first page of the list; after the filter settles only matching rows
    // remain, so a text match resolves the row unambiguously.
    cy.get(L.containerPickerSearchInput, { timeout: 10000 }).clear().type(code);
    cy.contains(code, { timeout: 10000 }).scrollIntoView().click({ force: true });
  }

  // ---- Step 2: location (assign/change mode only) ----------------------

  assertLocationStepVisible() {
    cy.contains(L.selectTargetLocationHeading, { timeout: 15000 }).should('be.visible');
    cy.get(`#${L.locationQrInputId}`).should('be.visible');
  }

  scanLocationPath(path) {
    cy.get(`#${L.locationQrInputId}`).clear().type(`${path}{enter}`);
  }

  clickAssignContainer() {
    cy.contains('button', new RegExp(`^${L.assignContainerBtn}$`)).click();
  }

  // ---- Step 3: confirm (unassign mode only) ----------------------------

  assertUnassignConfirmVisible() {
    cy.contains(L.unassignWarningText, { timeout: 15000 }).should('be.visible');
    cy.contains('button', new RegExp(`^${L.removeContainerBtn}$`)).should('be.visible');
  }

  clickRemoveContainer() {
    cy.contains('button', new RegExp(`^${L.removeContainerBtn}$`)).click();
  }

  // ---- Back navigation -------------------------------------------------

  goBack() {
    cy.contains('button', /^Back$/).first().click();
  }
}

export default ContainerLocationPage;
