import 'cypress-file-upload';
import IncomingInvLocators from '../locators/IncomingInvLocators';
import InvViewLocators from '../locators/InvViewLocators';
import IncomingInvPage from '../../pageObjects/IncomingInvPage';

// ---------------------------------------------------------------------------
// makeRamRow(td) → row-builder for product-only (RAM) Excel imports
// Returns a function with the same signature as the local ramRow helpers so
// call sites inside cy.fixture().then() need no changes.
// ---------------------------------------------------------------------------
export const makeRamRow = (td) =>
  (RAMbrand, memGen, qty, cost, price, support) => ({
    Category: td.ram.category,
    "RAM Brand": RAMbrand,
    "Memory Generation": memGen,
    Cost: cost || td.ramKingston.cost,
    Price: price || td.ramKingston.price,
    "Support Contact": support || td.ramKingston.supportContact,
    Quantity: qty,
  });

// ---------------------------------------------------------------------------
// makeLaptopRowWithSerial(td) → row-builder for product-item (Laptop) imports
// ---------------------------------------------------------------------------
export const makeLaptopRowWithSerial = (td) =>
  (serial) => ({
    Category: td.laptop.category,
    "Model Number": td.laptop.modelNumber,
    Brand: td.laptop.brand,
    Cost: td.laptop.cost,
    Price: td.laptop.price,
    "Support Contact": td.laptop.supportContact,
    "Serial Number": serial,
    Quantity: 1,
  });

// ---------------------------------------------------------------------------
// createExcelFile — write rows to cypress/fixtures/<fileName> via cy.task
// ---------------------------------------------------------------------------
export const createExcelFile = (fileName, data) => {
  cy.task("createExcelFile", {
    filePath: `cypress/fixtures/${fileName}`,
    data,
  }).then((msg) => cy.log(msg));
};

// ---------------------------------------------------------------------------
// importExcel — navigate to import dialog, upload file, handle success.
//
// The upload has two success paths:
//   A. Import summary dialog (OK button) — when backend returns importSummary
//      with successCount > 0 or ignored rows.
//   B. Direct redirect to /incoming-inventory — simple success with no summary.
//
// Both paths are handled here via response inspection.
// ---------------------------------------------------------------------------
export const importExcel = (fileName, poNumber) => {
  const invPage = new IncomingInvPage();
  invPage.clickIncomingInventoryNav();
  invPage.clickImport();
  invPage.enterPONumber(poNumber);
  invPage.uploadFile(fileName);

  cy.intercept("POST", "**/excel/upload-inventory").as("uploadInventory");
  invPage.clickUpload();

  cy.wait("@uploadInventory", { timeout: 120000 }).then(({ response }) => {
    const body = response.body;
    const success = body?.success;
    const importSummary = body?.data?.importSummary;

    cy.log(`Upload response: success=${success}, successCount=${importSummary?.successCount}`);

    if (!success) {
      throw new Error(
        `Excel import failed (success=false): ${JSON.stringify(body?.error || body?.message || body)}`
      );
    }

    const hasWarnings =
      importSummary &&
      (importSummary.ignoredExistingValues?.count > 0 ||
        importSummary.ignoredDuplicateValues?.count > 0 ||
        importSummary.ignoredExtraColumns?.count > 0);

    const hasSummaryDialog =
      importSummary && (hasWarnings || importSummary.successCount > 0);

    if (hasSummaryDialog) {
      // Path A: import summary dialog shown — click OK
      cy.contains("button", /^OK$/, { timeout: 15000 })
        .scrollIntoView()
        .should("be.visible")
        .and("not.be.disabled")
        .click({ force: true });
    }
    // Path B: direct redirect — just wait for the URL to change

    // Wait for redirect to complete, then validate (URL should contain /incoming-inventory)
    cy.location("pathname", { timeout: 30000 }).should("match", /\/incoming-inventory/);
  });
};

// ---------------------------------------------------------------------------
// searchProduct — intercept, navigate, select PO (optional), search, wait
// poNumber is optional; when omitted the PO selection step is skipped.
// ---------------------------------------------------------------------------
export const searchProduct = (poNumber, productName) => {
  const invPage = new IncomingInvPage();
  invPage.clickIncomingInventoryNav();
  if (poNumber) {
    invPage.selectPoNumber(poNumber);
  }
  invPage.searchProduct(productName);
  cy.intercept("GET", "**/incoming-items**").as("incomingItems");
  cy.get("button").contains("Search").click();
  cy.wait("@incomingItems", { timeout: 10000 });
};

// ---------------------------------------------------------------------------
// openChangeStatusDialog
// Navigates to a PO, searches for a product, opens the row action menu and
// clicks "Change Status", then waits for the dialog to appear.
//
// Waits for search results to stabilize and targets the row that contains
// searchTerm to avoid acting on stale/wrong products before the table refreshes.
//
// Usage:
//   cy.openChangeStatusDialog(poNumber, searchTerm);
// ---------------------------------------------------------------------------
Cypress.Commands.add('openChangeStatusDialog', (poNumber, searchTerm) => {
  // Dismiss any open overlay and navigate back to Incoming Inventory
  cy.get('body').type('{esc}', { force: true });
  cy.get(IncomingInvLocators.navLink).click({ force: true });

  // Select the PO
  cy.get(IncomingInvLocators.poDropdown)
    .scrollIntoView()
    .click({ force: true });
  cy.get(IncomingInvLocators.poDropdownInput)
    .type(poNumber, { force: true });

    cy.wait(2000)
  // cy.get(IncomingInvLocators.poDropdownMenu)
  //   .should('be.visible')
  //   .contains(poNumber)
  //   .click({ force: true });

  // Search for the product
  cy.get(InvViewLocators.searchInput, { timeout: 10000 })
    .should('be.visible')
    .click()
    .clear()
    .type(searchTerm);
  cy.get(InvViewLocators.searchSubmitBtn)
    .scrollIntoView()
    .should('not.be.disabled')
    .click();

  // Wait for search results to update: find the row containing searchTerm
  // and confirm the table has refreshed before interacting
  cy.get('tbody tr', { timeout: 10000 })
    .contains(searchTerm)
    .closest('tr')
    .should('be.visible')
    .within(() => {
      // Open row action menu from the matched row
      cy.get('button#long-button')
        .should('be.visible')
        .click({ force: true });
    });

  // Click "Change Status" from the action menu
  cy.contains(IncomingInvLocators.changeStatusMenuItem)
    .should('be.visible')
    .click({ force: true });

  // Wait for dialog
  cy.get(IncomingInvLocators.dialog).should('be.visible');
});

// ---------------------------------------------------------------------------
// applyStatusViaDialog
// Fills in the open "Change Status" dialog and submits it.
//
// Options:
//   status       {string}  – required. Status option label to select.
//   serialNumber {string}  – optional. Serial number to enter.
//   quantity     {number}  – optional. Quantity to enter (product-only flow).
//   damageReason {string}  – optional. Damage reason label (when status = Damaged).
//   poNumber     {string}  – optional. PO number (product-only flow with specific PO).
//
// Throws:
//   When status is missing/empty, throws a clear error to catch caller mistakes early.
//
// Usage:
//   cy.applyStatusViaDialog({ status: 'Missing', serialNumber: 'SN001' });
//   cy.applyStatusViaDialog({ status: 'Damaged', quantity: 1, damageReason: 'Broken' });
//   cy.applyStatusViaDialog({ status: 'Missing', quantity: 1, poNumber: 'SW-PO-007' }); // product-only with PO
// ---------------------------------------------------------------------------
Cypress.Commands.add('applyStatusViaDialog', ({ status, serialNumber, quantity, damageReason, poNumber } = {}) => {
  // Guard: Validate required 'status' parameter
  if (!status || typeof status !== 'string' || status.trim() === '') {
    throw new Error(
      `applyStatusViaDialog requires a non-empty 'status' string. Received: ${JSON.stringify(status)}`
    );
  }
  // Select status
  cy.get(IncomingInvLocators.dialog)
    .contains(IncomingInvLocators.chooseStatusLabel)
    .first()
    .click({ force: true });
  cy.get(IncomingInvLocators.dropdownOption).contains(status).click({ force: true });

  // If Damaged — pick damage reason
  if (damageReason) {
    cy.get(IncomingInvLocators.dialog)
      .contains(IncomingInvLocators.damageReasonLabel)
      .should('exist');
    cy.get(IncomingInvLocators.dialog)
      .contains(IncomingInvLocators.damageReasonLabel)
      .first()
      .click({ force: true });
    cy.get(IncomingInvLocators.dropdownOption).contains(damageReason).click({ force: true });
  }

  // Serial number (item-based flow)
  if (serialNumber) {
    cy.get(IncomingInvLocators.serialNumberInput)
      .should('be.visible')
      .clear()
      .type(serialNumber, { delay: 50 });
  }

  // Quantity (product-only flow)
  if (quantity !== undefined && quantity !== null) {
    cy.get(IncomingInvLocators.quantityInput)
      .should('be.visible')
      .clear()
      .type(String(quantity));
  }

  // PO dropdown — appears inside dialog for product-only categories
  if (poNumber) {
    cy.get('body').then(($body) => {
      if ($body.find(IncomingInvLocators.dialogWithPO).length > 0) {
        cy.get(IncomingInvLocators.dialogPODropdown)
          .scrollIntoView()
          .click({ force: true });
        cy.get(IncomingInvLocators.dialogPODropdownInput)
          .type(poNumber, { force: true });
        cy.wait(2000);
        cy.get(IncomingInvLocators.poDropdownMenu)
          .should('be.visible')
          .contains(poNumber)
          .click({ force: true });
      }
    });
  }

  // Source dropdown — appears only for product-only categories
  cy.get('body').then(($body) => {
    if ($body.find(IncomingInvLocators.dialogWithSource).length > 0) {
      cy.get(IncomingInvLocators.dialog)
        .contains(IncomingInvLocators.chooseSourceLabel)
        .first()
        .click({ force: true });
      cy.get(IncomingInvLocators.dropdownOption).first().click({ force: true });
    }
  });

  // Submit
  cy.intercept('POST', '**/incoming-items/mark-status**').as('markStatus');
  cy.get(IncomingInvLocators.dialog)
    .contains('button', /^Update$/i)
    .should('be.visible')
    .click({ force: true });
  cy.wait('@markStatus', { timeout: 15000 }).then(({ response }) => {
    expect(response?.statusCode).to.be.oneOf([200, 201]);
  });
  cy.contains('successfully', { timeout: 10000 }).should('exist');

  // Close dialog if still open
  cy.get('body').then(($body) => {
    if ($body.find(IncomingInvLocators.dialog).length > 0) {
      cy.get(IncomingInvLocators.dialog)
        .contains('button', /^Cancel$/i)
        .click({ force: true });
    }
  });
});
