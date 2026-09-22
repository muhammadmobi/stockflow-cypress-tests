// cypress/e2e/IncomingInventory/POFilesTests.cy.js  *** REWRITTEN — PO Files only ***
//
// Test scripts for the Incoming Inventory "PO Files" modal (POFilesModal.tsx).
// Accessible via: header long-button (three-dots) → "PO Files" (visible only when
// a specific PO is selected, hidden for "All POs").
//
// Authoring conventions (Test Automation Skill):
//   • Page Object Model — all UI interactions via AllPOsPage.js
//   • Fixtures — allPosData.json
//   • Helpers — allPosHelpers.js
//   • Comment block — every it() has @testCaseId / @description / @testData /
//                     @steps / @expectedResult
//   • No explicit waits — only network-driven cy.wait('@alias') waits
//
// ISTQB techniques applied:
//   Use case       — modal open/close (Close button, X icon button)
//   Decision table — menu visibility (single PO shows "PO Files"; All POs hides it)
//   Error guessing — PO with no files → empty state; download intercept verified
//
// Test IDs: SW_INC_POFI_001 – SW_INC_POFI_006

import 'cypress-file-upload';
import AllPOsPage from '../../pageObjects/AllPOsPage';
import {
  importAttributesAndCategories,
  deleteCategories,
} from '../../support/helpers/attributeHelpers';
import { importExcel } from '../../support/helpers/incomingInventoryHelpers';
import {
  ts,
  buildLaptopRow,
  buildRamRow,
  createExcelFile,
  cleanupCreatedPOs,
} from '../../support/helpers/allPosHelpers';

describe(
  'Incoming Inventory — PO Files modal',
  { tags: ['@regression', '@pofiles'] },
  () => {
    /** @type {AllPOsPage} */
    let page;

    // Shared context — populated in before()
    const ctx = {
      stamp: null,
      laptopPO: null,  // has an Excel import → files exist
      ramPO: null,     // used for empty-state test (stubbed)
      createdPOs: [],
    };

    before(function () {
      cy.fixture('allPosData').as('data');

      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      importAttributesAndCategories();

      cy.get('@data').then((td) => {
        ctx.stamp    = ts();
        ctx.laptopPO = `${td.poPrefixes.poFilesLap}${ctx.stamp}`;
        ctx.ramPO    = `${td.poPrefixes.poFilesRam}${ctx.stamp}`;
        ctx.createdPOs.push(ctx.laptopPO, ctx.ramPO);

        const sn      = `POFilesLap-${ctx.stamp}`;
        const lapFile = `POFiles-Lap-${ctx.stamp}.xlsx`;
        const ramFile = `POFiles-Ram-${ctx.stamp}.xlsx`;

        createExcelFile(lapFile, [buildLaptopRow(td, ctx.stamp, sn)]);
        createExcelFile(ramFile, [buildRamRow(td, ctx.stamp, td.ram.defaultQuantity)]);

        importExcel(lapFile, ctx.laptopPO);
        importExcel(ramFile, ctx.ramPO);
      });
    });

    beforeEach(function () {
      cy.fixture('allPosData').as('data');
      cy.on('uncaught:exception', (err) => {
        if (err?.message?.includes('Request failed with status code')) return false;
      });
      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      page = new AllPOsPage();
    });

    after(function () {
      cy.fixture('allPosData').as('data');
      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      cy.get('body').type('{esc}', { force: true });
      cleanupCreatedPOs(ctx.createdPOs);
      // RAM/Laptop automation categories are durable shared fixtures (idempotent
      // re-seed). They can't be deleted while POs reference their products, so
      // deleting them here only caused a spurious after-hook failure.
    });

    // ─────────────────────────────────────────────────────────────────────
    // SW_INC_POFI_001 — "PO Files" visible in menu for a specific PO
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @testCaseId    SW_INC_POFI_001
     * @description   The header 3-dots menu exposes "PO Files" (and "Add Product")
     *                when a specific PO is selected. Both are absent in All-POs view
     *                (covered by SW_INC_ALLPO_001).
     * @testData      fixtures/allPosData.json → poFilesModal.menuItemLabel
     * @steps
     *   1. Select ctx.laptopPO from the dropdown and wait for listing
     *   2. Click the header 3-dots button
     *   3. Read all visible menu-item labels
     * @expectedResult  Labels include "PO Files".
     */
    it(
      'SW_INC_POFI_001 — "PO Files" menu item is visible when a specific PO is selected',
      function () {
        page.selectPoAndWaitForListing(ctx.laptopPO, 'lapList001');
        page.openHeaderActionMenu();
        page.readMenuItems().then((items) => {
          const labels = items.map((i) => i.text);
          expect(labels, 'menu includes "PO Files"').to.include(
            this.data.poFilesModal.menuItemLabel,
          );
        });
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // SW_INC_POFI_002 — modal opens, title correct, Close button present
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @testCaseId    SW_INC_POFI_002
     * @description   Clicking "PO Files" opens a dialog whose title contains
     *                "PO Files - <poNumber>". The "Close" button in DialogActions
     *                and the X IconButton in the title bar are both rendered.
     * @testData      fixtures/allPosData.json → poFilesModal.titlePrefix
     * @steps
     *   1. Select ctx.laptopPO and wait for listing
     *   2. Intercept GET /excel/{poNumber}/files
     *   3. Click 3-dots → "PO Files"; wait for the intercept
     *   4. Assert title h6 contains "PO Files - {poNumber}"
     *   5. Assert "Close" button in footer is visible
     *   6. Assert the X IconButton in the dialog title bar is visible
     * @expectedResult  Modal renders correct title, Close button, and X button.
     */
    it(
      'SW_INC_POFI_002 — modal opens with correct title, Close button and X button present',
      function () {
        page.selectPoAndWaitForListing(ctx.laptopPO, 'lapList002');
        cy.intercept('GET', `**/excel/${ctx.laptopPO}/files`).as('poFiles002');
        page.openPOFilesModal();
        cy.wait('@poFiles002', { timeout: 15000 });

        // Title: "PO Files - {poNumber}"
        cy.get('[role="dialog"] h6')
          .invoke('text')
          .should('include', `PO Files - ${ctx.laptopPO}`);

        // Footer Close button (IMSButton variant="outlined")
        cy.get('[role="dialog"]')
          .find('[role="dialog"] button, .MuiDialogActions-root button')
          .filter(':contains("Close")')
          .should('be.visible');

        // X IconButton in the DialogTitle bar (onClick={onClose}, CloseIcon)
        cy.get('[role="dialog"] [role="dialog"] button[aria-label], [role="dialog"] .MuiDialogTitle-root button')
          .first()
          .should('exist');

        page.closePOFilesModal();
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // SW_INC_POFI_003 — Close button dismisses the modal
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @testCaseId    SW_INC_POFI_003
     * @description   Clicking the "Close" button in DialogActions dismisses the
     *                modal — [role="dialog"] must no longer be in the DOM.
     * @steps
     *   1. Open PO Files modal for ctx.laptopPO
     *   2. Click "Close" button
     *   3. Assert [role="dialog"] does not exist
     * @expectedResult  Modal is removed from the DOM within 8 s.
     */
    it(
      'SW_INC_POFI_003 — Close button dismisses the modal',
      function () {
        page.selectPoAndWaitForListing(ctx.laptopPO, 'lapList003');
        cy.intercept('GET', `**/excel/${ctx.laptopPO}/files`).as('poFiles003');
        page.openPOFilesModal();
        cy.wait('@poFiles003', { timeout: 15000 });

        // Click the labelled Close button in DialogActions
        cy.get('[role="dialog"]').contains('button', /^Close$/i).click();

        cy.get('[role="dialog"]', { timeout: 8000 }).should('not.exist');
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // SW_INC_POFI_004 — X IconButton in title bar dismisses the modal
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @testCaseId    SW_INC_POFI_004
     * @description   Clicking the X IconButton (CloseIcon) that POFilesModal
     *                renders inside <DialogTitle> calls onClose and removes the
     *                dialog from the DOM.
     * @steps
     *   1. Open PO Files modal for ctx.laptopPO
     *   2. Click the IconButton that contains CloseIcon (inside DialogTitle)
     *   3. Assert [role="dialog"] does not exist
     * @expectedResult  Modal is dismissed within 8 s.
     */
    it(
      'SW_INC_POFI_004 — X IconButton in title bar dismisses the modal',
      function () {
        page.selectPoAndWaitForListing(ctx.laptopPO, 'lapList004');
        cy.intercept('GET', `**/excel/${ctx.laptopPO}/files`).as('poFiles004');
        page.openPOFilesModal();
        cy.wait('@poFiles004', { timeout: 15000 });

        // The X button is an IconButton inside DialogTitle (not in DialogActions)
        // POFilesModal.tsx line 170: <IconButton onClick={onClose} size="small">
        cy.get('[role="dialog"] .MuiDialogTitle-root button').first().click({ force: true });

        cy.get('[role="dialog"]', { timeout: 8000 }).should('not.exist');
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // SW_INC_POFI_005 — file list, per-file download, Download All
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @testCaseId    SW_INC_POFI_005
     * @description   When files exist the modal renders a list with one row per
     *                file. Each row has a DownloadIcon button. The "Download All"
     *                button is visible. Clicking a single-file download button
     *                triggers POST /excel/files/download with the correct payload.
     *                API file names from GET /excel/{po}/files all appear in the UI.
     * @testData      Live API GET /excel/{poNumber}/files
     * @steps
     *   1. API: GET /excel/{laptopPO}/files — capture file names
     *   2. Open PO Files modal; wait for the file-list response
     *   3. Assert ≥1 MuiListItem row and ≥1 download button
     *   4. Assert "Download All" is visible
     *   5. Assert every API fileName appears in a subtitle2 Typography element
     *   6. Intercept POST /excel/files/download
     *   7. Click the first per-file download button
     *   8. Assert the intercept fired with poNumber + correct fileName
     *   9. Close the modal
     * @expectedResult  File list matches API; per-file download POST intercepted
     *                  with correct body; Download All button present.
     */
    it(
      'SW_INC_POFI_005 — file list renders correctly and per-file download fires the right API call',
      function () {
        cy.getAuthToken().then((token) => {
          const apiBase =
            Cypress.env('API_BASE_URL') ||
            Cypress.config('baseUrl').replace(/\/$/, '').replace('://', '://api.');

          cy.request({
            method: 'GET',
            url: `${apiBase}/excel/${ctx.laptopPO}/files`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status, 'GET /excel/{po}/files status').to.be.lessThan(400);
            const apiFiles = (res.body?.data || []).map((f) => f.fileName);
            expect(apiFiles.length, 'at least 1 file from API').to.be.gte(1);

            page.selectPoAndWaitForListing(ctx.laptopPO, 'lapList005');
            cy.intercept('GET', `**/excel/${ctx.laptopPO}/files`).as('poFiles005');
            page.openPOFilesModal();
            cy.wait('@poFiles005', { timeout: 15000 });

            // ── list items present
            page.poFilesListItems().should('have.length.gte', 1);

            // ── every download button present
            page.poFilesDownloadButtons().should('have.length.gte', 1);

            // ── Download All button visible
            page.poFilesDownloadAllButton().should('be.visible');

            // ── every API fileName rendered in subtitle2
            page.poFilesFileNames().then(($els) => {
              const uiNames = Cypress._.map($els, (el) => Cypress.$(el).text().trim());
              apiFiles.forEach((name) => {
                expect(uiNames, `"${name}" appears in file list`).to.include(name);
              });
            });

            // ── per-file download: intercept POST /excel/files/download
            cy.intercept('POST', '**/excel/files/download').as('singleDownload');

            // Stub the blob response so the browser doesn't try to save a file
            cy.intercept('POST', '**/excel/files/download', (req) => {
              req.reply({ statusCode: 200, body: 'stub-blob' });
            }).as('singleDownloadStub');

            page.poFilesDownloadButtons().first().click({ force: true });

            cy.wait('@singleDownloadStub', { timeout: 10000 }).then((interception) => {
              expect(interception.request.body.poNumber, 'download payload poNumber').to.eq(
                ctx.laptopPO,
              );
              expect(
                interception.request.body.fileNames,
                'download payload fileNames is array',
              ).to.be.an('array').with.length.gte(1);
              expect(
                interception.request.body.fileNames[0],
                'first fileName matches API',
              ).to.eq(apiFiles[0]);
            });

            page.closePOFilesModal();
          });
        });
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // SW_INC_POFI_006 — empty state when no files exist
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @testCaseId    SW_INC_POFI_006
     * @description   When both the Excel-files API and the attachments API
     *                return empty lists the modal shows the "No files found
     *                for this PO." message and hides the "Download All" button.
     * @testData      Stubbed responses — environment-independent.
     * @steps
     *   1. Stub GET /excel/{ramPO}/files → { data: [] }
     *   2. Stub GET /api/v1/attachments  → { list: [] }
     *   3. Select ctx.ramPO and open PO Files modal
     *   4. Assert empty-state text is visible
     *   5. Assert "Download All" button does NOT exist
     *   6. Close via the "Close" button
     * @expectedResult  "No files found for this PO." shown; no Download All.
     */
    it(
      'SW_INC_POFI_006 — empty state shown and Download All absent when no files exist',
      function () {
        cy.intercept('GET', `**/excel/${ctx.ramPO}/files`, {
          statusCode: 200,
          body: { data: [] },
        }).as('poFilesEmpty');

        cy.intercept('GET', '**/api/v1/attachments**', {
          statusCode: 200,
          body: { list: [], pagination: { count: 0, pages: 0 } },
        }).as('attachmentsEmpty');

        page.selectPoAndWaitForListing(ctx.ramPO, 'ramList006');
        page.openPOFilesModal();
        cy.wait('@poFilesEmpty', { timeout: 10000 });

        // Empty state text (POFilesModal.tsx line 192-194)
        cy.get('[role="dialog"]')
          .contains('No files found for this PO.', { timeout: 8000 })
          .should('be.visible');

        // Download All must not render (conditional on files.length > 0)
        cy.get('[role="dialog"]')
          .find('button')
          .filter(':contains("Download All")')
          .should('not.exist');

        // Close via footer button
        cy.get('[role="dialog"]').contains('button', /^Close$/i).click();
        cy.get('[role="dialog"]', { timeout: 8000 }).should('not.exist');
      },
    );
  },
);
