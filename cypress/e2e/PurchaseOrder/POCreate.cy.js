/**
 * POCreate.cy.js
 * ============================================================
 * Spec: Creating a new Purchase Order via the Import form
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (Spec N2 — SW-POCR)
 *
 * Reality check (verified by reading source, per SKILL.md §8.2 hallucination
 * guards): there is NO standalone "create PO with poNumber + expectedQuantity"
 * form. PO creation is the Excel-upload flow at /purchase-orders/import
 * (Frontend/src/components/IncommingInventory/uploadForm.tsx), reached via the
 * "Create Purchase Order" button on the Purchase Orders list. The PO-number
 * field is a creatable react-select (AccountWisePOSelect) and the file input
 * is unconditionally required (`register('file', { required: true })`).
 * TC02/TC03 below are adjusted from the original plan to match this reality;
 * TC07 (AccountWise ingest end-to-end) is deferred — out of scope for this pass.
 *
 * Page Object reuse: cypress/pageObjects/IncomingInvPage.js already implements
 * the real UI flow (navigateToPOTab, clickImportTemplate, enterPONumber,
 * uploadFile, clickUpload, clickOK, validateRedirectedURL) — no new locators
 * needed for the happy path.
 *
 */

import IncomingInvPage from '../../pageObjects/IncomingInvPage';
import POListPage from '../../pageObjects/PurchaseOrder/POListPage';
import td from '../../fixtures/PurchaseOrder/poCreateData.json';
import { apiCall, createExcelFile } from '../../support/helpers/allPosHelpers';

const suiteStamp = `POCR-${Date.now()}`;
const newPO = `PO-POCR-NEW-${suiteStamp}`;
const existingFilePO = `PO-POCR-EXIST-${suiteStamp}`;
const cancelPO = `PO-POCR-CANCEL-${suiteStamp}`;

function ramRow(memGenSuffix) {
  return {
    Category: td.category,
    RAMbrand: td.ram.brand,
    'Memory Generation': `${td.ram.memoryGeneration}-${memGenSuffix}`,
    Cost: td.ram.cost,
    Price: td.ram.price,
    'Support Contact': td.ram.supportContact,
    Quantity: td.ram.quantity,
  };
}

const incomingInvPage = new IncomingInvPage();
const listPage = new POListPage();

function apiDeletePO(poNumber) {
  return apiCall('DELETE', `/purchase-orders/${encodeURIComponent(poNumber)}`).then((res) => {
    cy.log(`Delete PO ${poNumber}: HTTP ${res.status}`);
  });
}

/**
 * Click Upload and wait for the actual POST /excel/upload-inventory response
 * before deciding whether to click "OK" — a bare `cy.get('body').then(...)`
 * snapshot right after clickUpload() races the network call and can miss the
 * OK dialog entirely if it hasn't rendered yet by the time the snapshot runs.
 */
function uploadAndConfirm() {
  cy.intercept('POST', '**/excel/upload-inventory').as('uploadInventory');
  incomingInvPage.clickUpload();
  cy.wait('@uploadInventory', { timeout: 60000 });
  cy.get('body', { timeout: 5000 }).then(($b) => {
    if ($b.find('button:contains("OK")').length) {
      cy.contains('button', /^OK$/).click({ force: true });
    }
  });
}

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  // Pre-seed one PO with an import file already attached, so TC03 can assert
  // the "already has an import file" blocking behavior deterministically.
  createExcelFile(`POCR-EXISTING-${suiteStamp}.xlsx`, [ramRow('exist')]);
  cy.getAuthToken().then(() => {
    incomingInvPage.navigateToPOTab();
    incomingInvPage.clickImportTemplate();
    incomingInvPage.enterPONumber(existingFilePO);
    incomingInvPage.uploadFile(`POCR-EXISTING-${suiteStamp}.xlsx`);
    uploadAndConfirm();
  });
  // Stabilize on a known page regardless of where the upload flow's redirect
  // landed — every test's beforeEach visits /purchase-orders anyway, but this
  // avoids a mid-navigation state bleeding into whatever runs next.
  cy.visit('/purchase-orders');
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [newPO, existingFilePO, cancelPO].forEach((po) => apiDeletePO(po));
  });
});

beforeEach(() => {
  cy.authSession('admin');
  // Every test starts from a known, stable page — don't rely on whichever
  // state the previous test/hook happened to leave the browser in (the
  // import flow's summary dialog / redirect timing is not deterministic
  // enough to chain tests off of it).
  cy.visit('/purchase-orders');
});

describe('SW-POCR — Create Purchase Order (Excel-import flow)', () => {
  it('SW-POCR-TC01 — Creating a PO with a new PO number and a valid Excel file makes it appear in the PO list @smoke', () => {
    // Use Case: main creation flow — new poNumber + valid file → row appears in /purchase-orders
    createExcelFile(`POCR-NEW-${suiteStamp}.xlsx`, [ramRow('new')]);
    incomingInvPage.navigateToPOTab();
    incomingInvPage.clickImportTemplate();
    incomingInvPage.enterPONumber(newPO);
    incomingInvPage.uploadFile(`POCR-NEW-${suiteStamp}.xlsx`);
    uploadAndConfirm();
    incomingInvPage.validateRedirectedURL();

    listPage.visit();
    listPage.search(newPO);
    listPage.assertRowVisible(newPO);
  });

  it('SW-POCR-TC02 — Submitting the import form without attaching a file does not create a PO @regression', () => {
    // EP (invalid partition): file input is unconditionally required
    // (uploadForm.tsx: register('file', { required: true })) — Upload must
    // not proceed to a redirect/PO-creation when no file is attached.
    incomingInvPage.navigateToPOTab();
    incomingInvPage.clickImportTemplate();
    incomingInvPage.enterPONumber(`PO-POCR-NOFILE-${suiteStamp}`);
    cy.contains('button', /^Upload$/).click({ force: true });
    // No navigation should occur — still on the import form.
    cy.location('pathname', { timeout: 5000 }).should('include', '/purchase-orders/import');
  });

  it('SW-POCR-TC03 — Selecting a PO number that already has an import file shows a warning and blocks Upload @regression', () => {
    // Decision Table: existing PO + existing import file → warning alert
    // shown, Upload button disabled (uploadForm.tsx: hasExistingImportFile).
    incomingInvPage.navigateToPOTab();
    incomingInvPage.clickImportTemplate();
    incomingInvPage.enterPONumber(existingFilePO);
    cy.contains(new RegExp(td.existingFileWarningText, 'i'), { timeout: 15000 }).should('be.visible');
    cy.contains('button', /^Upload$/).should('be.disabled');
  });

  it('SW-POCR-TC04 — The PO-number field offers a "Create" option for a brand-new number not in the existing list @regression', () => {
    // Decision Table: typing a number with no matching existing PO shows the
    // CreatableSelect's formatCreateLabel option ('Create "X"').
    incomingInvPage.navigateToPOTab();
    incomingInvPage.clickImportTemplate();
    const freshPo = `PO-POCR-FRESH-${suiteStamp}`;
    cy.get('input[id^="react-select-"][id$="-input"]')
      .filter(':visible')
      .first()
      .clear({ force: true })
      .type(freshPo, { force: true });
    cy.contains(new RegExp(`${td.createLabelPrefix}${freshPo}`, 'i')).should('be.visible');
  });

  it('SW-POCR-TC05 — Clicking Cancel on the import form returns to the previous page without creating a PO @regression', () => {
    // EP: cancel flow — no PO created, no navigation to a success state
    incomingInvPage.navigateToPOTab();
    incomingInvPage.clickImportTemplate();
    incomingInvPage.enterPONumber(cancelPO);
    cy.contains('button', /^Cancel$/i).click({ force: true });
    cy.location('pathname', { timeout: 10000 }).should('not.include', '/purchase-orders/import');

    listPage.visit();
    listPage.search(cancelPO);
    listPage.assertNoResults();
  });

  it('SW-POCR-TC06 — A PO number containing characters outside PATTERN.NAME_PATTERN_VALUE is accepted as-is (pattern validation is dead code for this field); file upload error still surfaces @regression', () => {
    // Error Guessing: uploadForm.tsx wires PATTERN.NAME_PATTERN_VALUE / _MESSAGE
    // (Frontend/src/constant/validation.ts) onto the poNumber Controller's
    // `pattern` rule, appearing to guard against invalid characters. In
    // practice this never surfaces a validation error through the real UI
    // interaction: AccountWisePOSelect is a CreatableSelect — selecting/
    // creating an option commits the *option object* (`{label, value,
    // __isNew__}`) to the RHF field, not a plain string, and the pattern
    // check never produces a visible error for that committed value.
    // Verified live (2026-07): typing 'PO<>INVALID' and pressing Enter creates
    // and selects that option (confirmed via the react-select aria-live
    // region: `option Create "PO<>INVALID", selected.`), the hidden native
    // input backing the select ends up with value="PO<>INVALID", and no
    // pattern-message text renders anywhere in the DOM either before or
    // after clicking Upload. So this assertion documents the ACTUAL
    // behavior (invalid characters are silently accepted into the PO
    // number) rather than the aspirational one — see plan.md/coverage.md
    // for the app-gap note. The file-required validation (a real, wired-up
    // rule) still fires as expected since no file is attached.
    incomingInvPage.navigateToPOTab();
    incomingInvPage.clickImportTemplate();
    cy.get('input[id^="react-select-"][id$="-input"]')
      .filter(':visible')
      .first()
      .clear({ force: true })
      .type('PO<>INVALID{enter}', { force: true });

    // The invalid-character PO number is accepted and shown as the selected
    // value — no pattern-validation error renders for it.
    cy.contains('#ponumber', 'PO<>INVALID').should('be.visible');

    cy.contains('button', /^Upload$/).click({ force: true });

    // Verify the file upload error message appears (no file attached) — this
    // rule IS wired up and blocks submission.
    cy.contains('span', /Please upload excel file/i, { timeout: 5000 }).should('be.visible');

    // The pattern-validation message never appears (dead code for this
    // field) — assert its continued absence so a future fix is noticed here.
    cy.contains(
      /Only letters, numbers, periods \(\.\), dashes \(-\), underscores \(_\) and spaces are allowed\./i,
    ).should('not.exist');

    // Verify the form does not submit (blocked by the missing-file rule).
    cy.location('pathname', { timeout: 5000 }).should('include', '/purchase-orders/import');
  });
});
