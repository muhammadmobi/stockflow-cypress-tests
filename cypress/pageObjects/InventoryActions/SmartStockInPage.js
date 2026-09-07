// cypress/pageObjects/InventoryActions/SmartStockInPage.js
//
// Page object for the consolidated Smart Stock In mobile screen
// (route /MobileViewScreen/smart-stock-in?poId=...).
// Component: Frontend/src/components/SmartStockIn/index.tsx.
//
// Wraps the screen's two modes so specs only call intent methods:
//   • no product selected  → top scan/search field + Browse / Catalog lists
//   • product selected      → quantity card (quantity-tracked product) OR
//                              serial card (serialized product)
//
// The screen is form-driven; pressing Enter in the active text field submits.

import L from '../../support/locators/InventoryActions/smartStockInLocators';

class SmartStockInPage {
  // -- Navigation -----------------------------------------------------------

  visitWithPo(poNumber) {
    // Intercept the layout's general-config fetch and inject allowManualEntries:true
    // into every config row in the response. This makes the Serial Number field
    // visible without depending on the DB value, which may lag behind apiSetGeneralConfigFlags
    // (the DB patch and the config fetch race during the page-load lifecycle).
    cy.intercept('GET', '**/configs*', (req) => {
      req.continue((res) => {
        const list = res.body?.data?.list;
        if (Array.isArray(list)) {
          list.forEach((row) => {
            if (row?.configJson?.data) {
              row.configJson.data.allowManualEntries = true;
            }
          });
        }
      });
    }).as('_ssiGeneralConfig');
    cy.visit(`/MobileViewScreen/smart-stock-in?poId=${encodeURIComponent(poNumber)}`);
    this.assertLoaded();
    cy.wait('@_ssiGeneralConfig', { timeout: 10000 });
  }

  // Visit with no poId — the screen's mount effect redirects to /MobileViewScreen.
  visitWithoutPo() {
    cy.visit('/MobileViewScreen/smart-stock-in');
  }

  // -- Page-level assertions ------------------------------------------------

  assertLoaded() {
    cy.contains('h6', L.heading, { timeout: 20000 }).should('be.visible');
  }

  assertSubtitleVisible() {
    cy.contains(L.subtitle).should('be.visible');
  }

  assertPoChip(poNumber) {
    // Chip element contains the PO number; use a selector-based contains.
    cy.get(L.poChip).contains(new RegExp(`^${poNumber}`)).should('be.visible');
  }

  assertRedirectedToLanding() {
    // No poId → component navigates back to the inventory-action hub.
    cy.location('pathname', { timeout: 15000 }).should('eq', '/MobileViewScreen');
    cy.contains('h6', L.heading).should('not.exist');
  }

  back() {
    cy.contains('button', new RegExp(`^${L.backButton}$`)).click();
  }

  // -- Top scan/search field (no product selected) --------------------------

  scanInput() {
    return cy.get(`input[placeholder="${L.scanInputPlaceholder}"]`, { timeout: 15000 });
  }

  assertScanInputVisible() {
    this.scanInput().should('be.visible');
  }

  typeScan(value) {
    this.scanInput().clear().type(value);
  }

  // Submit the top scan field via Enter (mirrors a hardware scanner).
  submitScan(value) {
    this.scanInput().clear().type(`${value}{enter}`);
  }

  // Submit an empty scan to exercise the required-input error path.
  submitEmptyScan() {
    this.scanInput().clear();
    // Click the primary submit button (Enter on an empty field is a no-op).
    cy.contains('button', new RegExp(`^${L.submit.stockIn}$`)).click();
  }

  // -- Product discovery ----------------------------------------------------

  browseProducts() {
    cy.contains('button', new RegExp(`^${L.browseProductsButton}$`)).click();
  }

  searchAllProducts() {
    cy.contains('button', new RegExp(`^${L.searchAllProductsButton}$`)).click();
  }

  // Filters the currently open product list (PO browse or catalog) by term.
  // Only usable after browseProducts()/searchAllProducts() has opened the panel.
  searchProductList(term) {
    cy.get(
      `input[placeholder="${L.productSearchInputPlaceholder.poProducts}"], `
        + `input[placeholder="${L.productSearchInputPlaceholder.catalog}"]`,
      { timeout: 10000 },
    ).clear().type(term);
    cy.contains('button', new RegExp(`^${L.productSearchButton}$`)).click();
  }

  productListItems() {
    return cy.get(L.productListItem, { timeout: 20000 });
  }

  assertProductListVisible() {
    this.productListItems().should('have.length.greaterThan', 0);
  }

  assertCatalogResultsVisible() {
    // Catalog rows carry an "Add to this PO" secondary line.
    cy.contains(L.productListItem, /Add to this PO/i, { timeout: 20000 }).should('be.visible');
  }

  selectFirstProduct() {
    this.productListItems().first().click();
  }

  selectProductContaining(text) {
    cy.contains(L.productListItem, text, { timeout: 20000 }).click();
  }

  // ProductMatchList secondary text tags each row "Quantity product" or
  // "Serial product" (SmartStockIn ProductMatchList getSecondaryText), so we
  // can pick a row of the required kind without knowing its label.
  selectFirstQuantityProduct() {
    cy.contains(L.productListItem, /Quantity product/i, { timeout: 20000 }).first().click();
  }

  selectFirstSerialProduct() {
    cy.contains(L.productListItem, /Serial product/i, { timeout: 20000 }).first().click();
  }

  // A bare `cy.get('body').then(...)` reads the DOM exactly once with no
  // retry — racy against the async product-list fetch (productRowsFetching),
  // which briefly renders nothing while the request is in flight. Wait for
  // the load spinner to clear first so the check reflects the settled list.
  hasQuantityProductRow() {
    cy.get('.MuiCircularProgress-root', { timeout: 20000 }).should('not.exist');
    return cy.get('body').then(($b) => /Quantity product/i.test($b.text()));
  }

  hasSerialProductRow() {
    cy.get('.MuiCircularProgress-root', { timeout: 20000 }).should('not.exist');
    return cy.get('body').then(($b) => /Serial product/i.test($b.text()));
  }

  // EP — the Quantity field strips non-digits on change. Type a mixed string
  // and assert only the digits survive.
  assertQuantityStripsNonNumeric(typed, kept) {
    cy.get(L.selectedCard.quantityInput).clear().type(typed).should('have.value', kept);
  }

  // -- Selected-product card ------------------------------------------------

  assertQuantityCard() {
    cy.contains(L.selectedCard.quantityProductSubtitle, { timeout: 15000 }).should('be.visible');
  }

  assertSerialCard() {
    cy.contains(L.selectedCard.serialProductSubtitle, { timeout: 15000 }).should('be.visible');
  }

  // Returns whether the selected product landed on the quantity branch.
  selectedCardIsQuantity() {
    return cy.get('body').then(($b) => $b.text().includes(L.selectedCard.quantityProductSubtitle));
  }

  enterQuantity(qty) {
    cy.get(L.selectedCard.quantityInput).clear().type(String(qty));
  }

  submitQuantity() {
    cy.contains('button', new RegExp(`^${L.selectedCard.stockInQuantity}$`)).click();
  }

  enterCardSerial(serialNumber) {
    this._fieldByLabel(L.selectedCard.serialFieldLabel).clear().type(serialNumber);
  }

  submitCardSerial() {
    cy.contains('button', new RegExp(`^${L.selectedCard.scanSerial}$`)).click();
  }

  // Read the numeric value off an "Expected/Received/Available N" chip in the
  // selected-product card. Resolves to a Number.
  readCountChip(label) {
    return cy
      .contains(L.poChip, new RegExp(`^${label}\\s+\\d+`))
      .invoke('text')
      .then((t) => Number((t.match(/(\d+)/) || [])[1]));
  }

  // -- Receive-damaged ------------------------------------------------------

  toggleReceiveDamaged() {
    cy.contains('label', L.receiveDamagedSwitchLabel).find('input[type="checkbox"]').click({ force: true });
  }

  assertDamageReasonVisible() {
    cy.contains('label', L.damageReasonLabel, { timeout: 10000 }).should('be.visible');
  }

  // -- Container / Location assignment (config ON) --------------------------

  assertAssignmentPanelVisible() {
    cy.contains(L.assignment.panelHeading, { timeout: 15000 }).should('be.visible');
  }

  assertAssignmentPanelAbsent() {
    cy.contains(L.assignment.panelHeading).should('not.exist');
  }

  _assignmentScanField() {
    return cy.get(`input[placeholder="${L.assignment.scanFieldPlaceholder}"]`, { timeout: 15000 });
  }

  // Resolve a container by its code through the universal-scan field (Enter submits).
  selectContainerByCode(code) {
    this._assignmentScanField().should('be.visible').clear().type(`${code}{enter}`);
    cy.contains(L.assignment.selectContainerOk(code), { timeout: 15000 }).should('be.visible');
  }

  // Resolve a bin location by its code through the same field.
  selectLocationByCode(code) {
    this._assignmentScanField().should('be.visible').clear().type(`${code}{enter}`);
    cy.contains(L.assignment.selectLocationOk, { timeout: 15000 }).should('be.visible');
  }

  // Attempt to select a code but expect the at-capacity selection guard.
  selectContainerExpectFull(code) {
    this._assignmentScanField().should('be.visible').clear().type(`${code}{enter}`);
    cy.contains(L.assignment.atCapacityError(code), { timeout: 15000 }).should('be.visible');
  }

  assertNoSelectionError() {
    cy.contains(L.assignment.noSelectionError, { timeout: 15000 }).should('be.visible');
  }

  assertOverCapacityError() {
    cy.contains(L.assignment.overCapacityError, { timeout: 15000 }).should('be.visible');
  }

  // -- Session scanned list -------------------------------------------------

  // Resolves to the count shown in "Scanned in this session (N)".
  sessionCount() {
    return cy
      .contains(L.sessionListHeadingRe)
      .invoke('text')
      .then((t) => Number((t.match(/\((\d+)\)/) || [])[1] || 0));
  }

  assertSessionCountAtLeast(min) {
    cy.contains(new RegExp(`Scanned in this session \\((\\d+)\\)`)).should(($el) => {
      const n = Number((($el.text().match(/\((\d+)\)/)) || [])[1] || 0);
      expect(n, 'session-scanned count').to.be.at.least(min);
    });
  }

  // -- Toast assertions -----------------------------------------------------
  // Backend success copy varies by route, so match on a broad success lexicon
  // rather than one exact string (config-agnostic per CTAL-TAE §7).

  assertSuccessToast() {
    cy.contains(/success|scanned successfully|stocked in|added successfully|quantity added/i, {
      timeout: 15000,
    }).should('be.visible');
  }

  // Narrower than assertSuccessToast — matches only the STOCK-IN success copy, not
  // the "Container X selected successfully" selection toast (which contains "success").
  assertStockInSuccess() {
    cy.contains(/stocked in|quantity added|added successfully|scanned successfully|is scanned/i, {
      timeout: 15000,
    }).should('be.visible');
  }

  assertErrorToast(matcher) {
    cy.contains(matcher, { timeout: 15000 }).should('be.visible');
  }

  // -- internal -------------------------------------------------------------

  // Resolve a TextField's input by its visible MUI label (auto-linked via the
  // shared MuiFormControl root), avoiding brittle generated-id selectors.
  _fieldByLabel(label) {
    return cy
      .contains('label', new RegExp(`^${label}$`))
      .closest('.MuiFormControl-root')
      .find('input, textarea')
      .first();
  }
}

export default SmartStockInPage;
