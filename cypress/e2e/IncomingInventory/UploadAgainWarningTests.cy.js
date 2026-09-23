import IncomingInvPage from '../../pageObjects/IncomingInvPage';
import PurchaseOrderPage from '../../pageObjects/PurchaseOrderPage';
import { ensureStandardProductNameConfigs, ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import {
  makeLaptopRowWithSerial,
  importExcel,
  createExcelFile,
} from '../../support/helpers/incomingInventoryHelpers';

/**
 * Upload Again Warning Tests — Incoming Inventory / Purchase Orders import
 * Covers: SW_INC_UAGAIN_TC01 – SW_INC_UAGAIN_TC04
 *
 * Feature under test:
 *   The InventoryUploadForm (at /purchase-orders/import) calls
 *   `GET /excel/<poNumber>/files` when a PO is selected. If the response list
 *   is non-empty (`hasExistingImportFile = true`) the form shows an MUI Alert
 *   warning: "This PO already has an import file. To upload a new file, please
 *   delete this PO and create a new one." The Upload submit button is also
 *   disabled in that state.
 *   (Source: Frontend/src/components/IncommingInventory/uploadForm.tsx:439–443, 462)
 *
 * Test-design technique:
 *   - TC01: EP — valid partition (fresh PO → no warning)
 *   - TC02: EP — invalid partition (already-imported PO → warning shown)
 *   - TC03: BVA — upload button disabled boundary (exactly 1 existing file → disabled)
 *   - TC04: Use Case — user experience: alert severity is "warning" (not error)
 *
 * Setup:
 *   - `freshPO` — created via API, no Excel file uploaded
 *   - `importedPO` — created via importExcel so /excel/<poNumber>/files returns ≥ 1 file
 */
describe('Upload Again Warning Tests (SW_INC_UAGAIN_TC01 – TC04)', () => {
  let incomingInvPage, purchaseOrderPage;
  let td;
  const createdPOs = [];
  let freshPO;
  let importedPO;
  let runId;

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  function apiBase() {
    return Cypress.env('API_BASE_URL') || Cypress.config('baseUrl').replace(/\/$/, '').replace('://', '://api.');
  }

  function createFreshPoViaApi(poNumber, token) {
    return cy.request({
      method: 'POST',
      url: `${apiBase()}/purchase-orders`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: { poNumber, status: 'Open' },
      failOnStatusCode: false,
    });
  }

  // ─── before() ──────────────────────────────────────────────────────────────
  before(() => {
    cy.fixture('uploadAgainWarningData').then((data) => {
      td = data;
      runId = ts();

      cy.authSession('admin');
      cy.visit('/');

      cy.getAuthToken().then((token) => {
        cy.request({
          method: 'POST',
          url: `${Cypress.env('API_BASE_URL')}/categories`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: { name: td.laptop.category, allowItems: true, allowVariants: false, allowVariantItems: false },
          failOnStatusCode: false,
        }).then((r) => cy.log(`Ensure category ${td.laptop.category}: HTTP ${r.status}`));
      });
      ensureStandardProductNameConfigs();
      ensureCommonAttributesOptional();

      incomingInvPage = new IncomingInvPage();
      purchaseOrderPage = new PurchaseOrderPage();

      const stamp = ts();
      freshPO = `PO-FRESH-${stamp}`;
      importedPO = `PO-IMPORTED-${stamp}`;
      createdPOs.push(freshPO, importedPO);

      // Create a fresh PO via API (no Excel import).
      cy.getAuthToken().then((token) => {
        createFreshPoViaApi(freshPO, token).then((res) => {
          cy.log(`Create freshPO: ${res.status}`);
        });
      });

      // Create the imported PO by uploading an Excel file.
      const laptopSerials = [`${td.laptop.serialPrefix}${stamp.slice(-4)}-001`];
      const laptopRow = makeLaptopRowWithSerial(td);
      const fileName = `UAGAIN-${stamp}.xlsx`;
      createExcelFile(fileName, laptopSerials.map((sn) => laptopRow(sn)));
      importExcel(fileName, importedPO);
    });
  });

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      if (err?.message?.includes('Request failed with status code')) return false;
      return true;
    });
    cy.authSession('admin');
    cy.visit('/');
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // Helper: navigate to the Upload Import Template form
  // Uses clickImport() which handles the PO nav → Create PO button sequence.
  function goToImportForm() {
    incomingInvPage.clickImport();
    cy.location('pathname', { timeout: 15000 }).should('include', '/purchase-orders/import');
  }

  // Helper: select a PO in the react-select PO dropdown on the import form.
  // The select has id="ponumber" (AccountWisePOSelect with id="ponumber").
  // `__isNew__` is set when the user types a PO that doesn't exist in AccountWise;
  // our test POs were created in StockWise directly so they may not appear in the
  // AccountWise list. Using `Create "…"` option (react-select creatable) is fine
  // because the component accepts __isNew__ items and sets `name: value.value`.
  function selectPoInImportForm(poNumber) {
    // Register the intercept BEFORE clicking so cy.wait can catch the request.
    cy.intercept('GET', '**/excel/**/files').as('existingFilesCheck');

    cy.get('#ponumber input', { timeout: 10000 })
      .click({ force: true })
      .type(poNumber, { force: true });
    cy.get('[class*="-menu"]', { timeout: 10000 }).should('be.visible');
    // Accept either the exact option or the "Create …" creatable option.
    cy.get('[class*="-option"]', { timeout: 10000 })
      .first()
      .click({ force: true });
    // Wait for the hasExistingImportFile query (`GET /excel/<po>/files`) to settle.
    cy.wait('@existingFilesCheck', { timeout: 10000 });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TC01 — EP (valid partition): Fresh PO shows no warning
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_UAGAIN_TC01
   * @technique     EP — valid partition (GET /excel/<po>/files returns empty list)
   * @description   When a PO with no previous Excel import is selected on the
   *                upload form, `hasExistingImportFile` is false and the MUI
   *                Alert warning is NOT rendered. The Upload button is enabled.
   */
  it('SW_INC_UAGAIN_TC01 – No warning is shown for a fresh PO with no existing import', { tags: ['@smoke', '@regression'] }, () => {
    goToImportForm();
    selectPoInImportForm(freshPO);

    // The specific "already imported" warning text must not exist.
    cy.contains(td.existingFileWarningText).should('not.exist');

    // The form may show other informational alerts (e.g., guidance banners);
    // only assert the existing-file warning specifically is absent.
    cy.contains('[role="alert"]', td.existingFileWarningText).should('not.exist');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC02 — EP (invalid partition): Already-imported PO shows warning
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_UAGAIN_TC02
   * @technique     EP — invalid partition (GET /excel/<po>/files returns ≥ 1 file)
   * @description   When a PO that already has an Excel import is selected,
   *                `hasExistingImportFile` is true and the MUI Alert warning
   *                "This PO already has an import file. To upload a new file,
   *                please delete this PO and create a new one." is displayed.
   */
  it('SW_INC_UAGAIN_TC02 – Warning is shown when the selected PO already has an import file', { tags: ['@smoke', '@regression'] }, () => {
    goToImportForm();
    selectPoInImportForm(importedPO);

    cy.contains(td.existingFileWarningText, { timeout: 10000 }).should('be.visible');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC03 — BVA: Upload button is disabled when PO has exactly 1 existing file
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_UAGAIN_TC03
   * @technique     BVA — boundary (exactly 1 file = minimum disabling boundary)
   * @description   The Upload button must be disabled when `hasExistingImportFile`
   *                is true (even for exactly 1 existing file). This guards
   *                against an off-by-one regression in the `length > 0` check.
   *                Our `importedPO` has exactly 1 uploaded file.
   */
  it('SW_INC_UAGAIN_TC03 – Upload button is disabled when PO has exactly one existing import file', { tags: ['@regression'] }, () => {
    goToImportForm();
    selectPoInImportForm(importedPO);

    // The upload submit button must be disabled.
    cy.contains('button', td.uploadButtonLabel, { timeout: 10000 })
      .filter(':visible')
      .first()
      .should('be.disabled');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC04 — Use Case: Alert has severity "warning" (amber), not "error" (red)
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_UAGAIN_TC04
   * @technique     Use Case — visual / UX contract
   * @description   The MUI Alert for an already-imported PO uses severity="warning"
   *                (not severity="error"). This matters for accessibility and UX:
   *                a "warning" is informational ("you can't do this here; go
   *                elsewhere"), whereas an "error" implies a broken state.
   *                MUI Alert renders `[role="alert"]` for both severities; we
   *                distinguish by asserting the MUI class suffix `MuiAlert-colorWarning`
   *                (MUI v7 class naming).
   */
  it('SW_INC_UAGAIN_TC04 – Existing-file alert uses severity warning (amber), not error', { tags: ['@regression'] }, () => {
    goToImportForm();
    selectPoInImportForm(importedPO);

    // Scope to the alert containing the warning text to avoid matching other
    // informational alerts that are always present on the import form.
    cy.contains('[role="alert"]', td.existingFileWarningText, { timeout: 10000 })
      .should('be.visible')
      // MUI v7: severity prop maps to class "MuiAlert-colorWarning" / "MuiAlert-colorError".
      .and('satisfy', ($el) => {
        const classes = $el[0].className;
        return classes.includes('Warning') || classes.includes('warning');
      });
  });

  // ─── after() ──────────────────────────────────────────────────────────────
  after(() => {
    if (createdPOs.length === 0) return;
    cy.authSession('admin');
    cy.visit('/');
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });
});
