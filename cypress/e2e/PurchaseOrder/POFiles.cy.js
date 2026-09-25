/**
 * POFiles.cy.js
 * ============================================================
 * Spec: PO Files modal (import files + attachments, read-only viewer)
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (Spec N4 — SW-POFIL)
 *
 * Reality check (verified by reading Frontend/src/components/IncommingInventory/
 * POFilesModal.tsx + POFilesMenuItem.tsx): the "PO Files" trigger lives on the
 * Incoming Inventory header 3-dot menu (per-PO selected, not "All POs") — NOT
 * on the /purchase-orders list row. The modal has no tabs; it merges Excel
 * import files (GET /excel/:poNumber/files) and attachments into one read-only
 * list with per-file Download icons + a "Download All" button. There is no
 * in-modal upload control, so the original TC05/TC08 (upload via modal /
 * reject invalid file type) don't correspond to any real UI and are dropped.
 *
 * Page Object reuse: cypress/pageObjects/AllPOsPage.js already implements this
 * modal's locators/actions (built for a different spec) — reused here as-is.
 *
 */

import AllPOsPage from '../../pageObjects/AllPOsPage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import { seedProductOnlyPO, apiDeletePO } from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';

const suiteStamp = `POFIL-${Date.now()}`;
const withFilePO = `PO-POFIL-WF-${suiteStamp}`;
const emptyPO = `PO-POFIL-EMPTY-${suiteStamp}`;
// Must match the fileName built by seedProductOnlyPO (poCloseHelpers.js:
// `POC-RAM-${stamp}.xlsx`), since seedProductOnlyPO is called below with
// stamp: `${suiteStamp}-wf` — kept in sync so TC02 can assert an exact name.
const expectedFileName = `POC-RAM-${suiteStamp}-wf.xlsx`;

const allPos = new AllPOsPage();

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  // withFilePO: seeded via Excel import → has exactly one import file.
  seedProductOnlyPO({ td, poNumber: withFilePO, stamp: `${suiteStamp}-wf`, quantity: 3 });

  // emptyPO: created with zero expected quantity and NO Excel import, via the
  // bare PurchaseOrders API create route — no file should ever exist for it.
  cy.getAuthToken().then((token) => {
    cy.request({
      method: 'POST',
      url: `${Cypress.env('API_BASE_URL') || Cypress.config('baseUrl').replace('://', '://api.')}/purchase-orders`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { poNumber: emptyPO, expectedQuantity: 0 },
      failOnStatusCode: false,
    });
  });
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [withFilePO, emptyPO].forEach((po) => apiDeletePO(po));
  });
});

beforeEach(() => {
  cy.authSession('admin');
  // Every test starts from a known dashboard page — AllPOsPage's navigation
  // helpers expect the sidebar nav link to already be present, which requires
  // being inside the dashboard layout first.
  cy.visit('/incoming-inventory');
});

describe('SW-POFIL — PO Files modal', () => {
  it('SW-POFIL-TC01 — Opening "PO Files" from the header menu for a selected PO opens the modal with that PO in the title @smoke', () => {
    // Use Case: main flow — select PO → header menu → "PO Files" → modal titled "PO Files - <poNumber>"
    allPos.selectPoAndWaitForListing(withFilePO);
    allPos.openPOFilesModal();
    allPos.poFilesModalTitle().should('contain.text', withFilePO);
  });

  it('SW-POFIL-TC02 — The files list shows the exact imported Excel file name @smoke', () => {
    // EP: PO with a known import file → the list shows that exact file name,
    // proving the list is bound to this PO's own import and not some other
    // file. NOTE: the backend auto-generates a second "ImportSummary_...xlsx"
    // file alongside every upload (verified live: modal shows both
    // "ImportSummary_<poNumber>_<ts>.xlsx" and our own "POC-RAM-...xlsx") —
    // so this asserts our file is PRESENT among the names, not that it's the
    // only or first entry.
    allPos.selectPoAndWaitForListing(withFilePO);
    allPos.openPOFilesModal();
    allPos.poFilesListItems().should('have.length.gte', 1);
    allPos.poFilesFileNames().then(($names) => {
      const names = [...$names].map((el) => el.textContent.trim());
      expect(names, 'file list should include our imported file').to.include(expectedFileName);
    });
  });

  it('SW-POFIL-TC03 — Clicking the per-file download icon requests that exact file and succeeds @regression', () => {
    // Use Case: individual download path (as opposed to "Download All").
    // POFilesModal.tsx's handleSingleFileDownload issues
    // POST /excel/files/download {poNumber, fileNames:[fileName]} via
    // react-query (responseType: 'blob') — intercept it so the assertion
    // verifies the real request/response instead of "no error thrown".
    // The modal lists our import file alongside an auto-generated
    // "ImportSummary_...xlsx" (see TC02) — click OUR file's row specifically
    // so the asserted fileNames payload is deterministic.
    cy.intercept('POST', '**/excel/files/download').as('downloadFile');
    allPos.selectPoAndWaitForListing(withFilePO);
    allPos.openPOFilesModal();
    // Resolve OUR file's row index by name, then click ITS download button —
    // more robust than nesting .find('button') inside cy.contains(), whose
    // matched node can be the innermost text element rather than the <li>.
    allPos.poFilesFileNames().then(($names) => {
      const names = [...$names].map((el) => el.textContent.trim());
      const ourIndex = names.indexOf(expectedFileName);
      expect(ourIndex, `${expectedFileName} should be in the files list`).to.be.at.least(0);
      allPos.poFilesDownloadButtons().eq(ourIndex).should('be.visible').click({ force: true });
    });

    cy.wait('@downloadFile').then(({ request, response }) => {
      expect(request.body).to.deep.equal({ poNumber: withFilePO, fileNames: [expectedFileName] });
      // Verified live: POST /excel/files/download returns 201 for both the
      // single-file and multi-file paths (it's a generation endpoint, so the
      // response semantics are "created", not "ok").
      expect(response.statusCode, 'single-file download status').to.eq(201);
      // response.body on a blob/binary intercept doesn't reliably reflect
      // payload size in Cypress — assert on content-length instead, which
      // is the actual byte count the server sent.
      expect(Number(response.headers['content-length']), 'downloaded file has content').to.be.greaterThan(0);
    });
  });

  it('SW-POFIL-TC04 — "Download All" requests every import file and succeeds @regression', () => {
    // Use Case: bulk download path. handleDownloadAll (POFilesModal.tsx
    // ~121-137) builds its `fileNames` wire payload ONLY from
    // `filesData.data` — the import-files query result
    // (GET /excel/:poNumber/files). Attachments (attachmentFilesData) are
    // downloaded separately via a parallel
    // `Promise.all(...downloadAttachment...)` call and are NEVER part of the
    // POST /excel/files/download body. The DOM list
    // (`allPos.poFilesFileNames()`) merges BOTH import files and attachments
    // (see POFilesModal.tsx render: files.map(...) then
    // attachmentFilesData.map(...)), so asserting the wire payload against
    // "every DOM name" is only an oracle when zero attachments exist — it is
    // not a correct general check and was a latent bug in this test. Fetch
    // the real import-file set independently via the exact same GET the
    // modal itself calls, and assert the payload against THAT set.
    // Attachment-type files are intentionally out of scope for this
    // equality check — no seed helper in this spec creates a true
    // attachment record (attachments live behind a separate attachment
    // microservice); see "Known gaps" in POFiles/coverage.md.
    cy.intercept('POST', '**/excel/files/download').as('downloadAll');
    cy.getAuthToken().then((token) => {
      const apiBaseUrl = Cypress.env('API_BASE_URL') || Cypress.config('baseUrl').replace('://', '://api.');
      cy.request({
        method: 'GET',
        url: `${apiBaseUrl}/excel/${withFilePO}/files`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((filesRes) => {
        const importFileNames = (filesRes.body?.data || []).map((f) => f.fileName);
        expect(importFileNames, 'withFilePO should have at least one import file').to.have.length.gte(1);

        allPos.selectPoAndWaitForListing(withFilePO);
        allPos.openPOFilesModal();
        allPos.poFilesDownloadAllButton().should('be.visible').click({ force: true });

        cy.wait('@downloadAll').then(({ request, response }) => {
          expect(request.body.poNumber).to.eq(withFilePO);
          // Assert against the import-file names only — not "every DOM
          // name" — since attachments never enter this payload.
          expect(request.body.fileNames).to.have.members(importFileNames);
          expect(response.statusCode, 'bulk download status').to.eq(201);
          // The zip response is chunked (no content-length header) — assert
          // via content-type/content-disposition instead, which are the
          // reliable signals that a real binary file (not a JSON error) came
          // back for the bulk-download path.
          expect(response.headers['content-type'], 'response is a binary file, not JSON').to.not.include('application/json');
          expect(response.headers['content-disposition'], 'server names the downloaded file').to.exist;
        });
      });
    });
  });

  it('SW-POFIL-TC05 — The modal shows the "No files found" empty state for a PO with no import file and no attachments @regression', () => {
    // BVA (lower boundary — zero files): freshly created PO, never imported.
    allPos.selectPoAndWaitForListing(emptyPO);
    allPos.openPOFilesModal();
    allPos.poFilesModalShouldShowEmptyState();
  });

  it('SW-POFIL-TC06 — Clicking Close dismisses the modal @regression', () => {
    // Use Case: dismiss flow
    allPos.selectPoAndWaitForListing(withFilePO);
    allPos.openPOFilesModal();
    allPos.closePOFilesModal();
  });
});
