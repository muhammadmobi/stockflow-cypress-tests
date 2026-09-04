// cypress/pageObjects/AllPOsPage.js
//
// Page Object Model for the Incoming Inventory "All POs" page.
// All selectors and atomic UI actions used by AllPOsTests.cy.js live here —
// per the Test Automation Skill, spec files must not contain raw selectors.
//
// Selector strategy follows the StockWise convention (existing IDs and CSS
// classes from List.tsx); we layer on Cypress-friendly chained selectors
// and prefer text-content matchers (`cy.contains`) for label-driven elements
// (badges, menu items, pagination footer).

import IncomingInvPage from './IncomingInvPage';

class AllPOsPage {
  constructor() {
    this.invPage = new IncomingInvPage();
  }

  // ── Selectors ─────────────────────────────────────────────────────────────
  get incomingInvNavLink() {
    return cy.get('a[aria-label="Incoming Inventory"][href="/incoming-inventory"]');
  }

  get poDropdownContainer() {
    return cy.get('#Incomming-inventory-P-O-1');
  }

  get poDropdownInput() {
    return cy.get('#Incomming-inventory-P-O-1 input');
  }

  get poDropdownMenu() {
    return cy.get('[class*="-menu"]');
  }

  get headerLongButton() {
    // The page-level (header) 3-dots — sits next to Import button. We
    // disambiguate from row-level long-buttons by filtering to the visible
    // one not nested inside a tbody row.
    return cy.get('button#long-button[aria-label="more"]:visible').first();
  }

  get menuRoot() {
    return cy.get('[role="menu"]');
  }

  get menuItems() {
    return cy.get('[role="menu"] [role="menuitem"]:visible');
  }

  get tableRows() {
    return cy.get('tbody tr');
  }

  get paginationFooter() {
    return cy.contains('p.MuiTypography-body1', /Record:/i);
  }

  badgeCaption(label) {
    // Handles both InfoCard (span.MuiTypography-caption) and compact-strip
    // (div "Label (N)") stat card formats. Retries until one is visible.
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const compactRe = new RegExp('^' + escapedLabel + '\\s*\\(\\d');
    return cy.get('body', { timeout: 30000 }).should(($body) => {
      const infoCard = $body.find('span.MuiTypography-caption')
        .filter((_, el) => el.textContent.trim() === label).length;
      const compact = $body.find('div')
        .filter((_, el) => {
          return !Cypress.$(el).closest('[aria-hidden="true"]').length
            && compactRe.test((el.textContent || '').trim());
        }).length;
      expect(infoCard + compact, `stat card "${label}" visible`).to.be.greaterThan(0);
    });
  }

  rowByCategory(categoryName) {
    return cy.contains('tbody tr', categoryName);
  }

  // ── Atomic actions ────────────────────────────────────────────────────────
  navigateToIncomingInventory() {
    cy.get('body').type('{esc}', { force: true });
    this.incomingInvNavLink.click({ force: true });
  }

  selectAllPOs() {
    this.navigateToIncomingInventory();
    this.poDropdownContainer.scrollIntoView().click({ force: true });
    this.poDropdownInput.type('All POs', { force: true });
    this.poDropdownMenu
      .should('be.visible')
      .and('contain.text', 'All POs');
    this.poDropdownMenu.contains(/^All POs$/).click({ force: true });
  }

  // Same as selectAllPOs but waits on the actual listing fetch completing
  // and on the table populating. Use this when the next step inspects the
  // pagination footer or row content (those render with placeholder values
  // until the request lands).
  selectAllPOsAndWaitForListing(alias = 'allPosListFetch') {
    // Match the All-POs listing fetch by query param (poNumber=allPO) rather than
    // a positional glob — the previous glob pinned page_size=75, but the default
    // rows-per-page is now 25 (ROWS_PER_PAGE_OPTIONS[0]), so the request never
    // matched and the wait timed out. The query matcher is order- and value-agnostic.
    cy.intercept({ method: 'GET', url: '**/incoming-items?**', query: { poNumber: 'allPO' } }).as(alias);
    this.selectAllPOs();
    cy.wait(`@${alias}`, { timeout: 30000 });
    this.tableRows.should('have.length.gte', 1);
  }

  openHeaderActionMenu() {
    this.headerLongButton.click({ force: true });
    this.menuRoot.should('be.visible');
  }

  openFirstRowActionMenu() {
    this.tableRows
      .first()
      .find('button#long-button')
      .scrollIntoView()
      .click({ force: true });
    this.menuRoot.should('be.visible');
  }

  openRowActionMenuByCategory(categoryName) {
    this.rowByCategory(categoryName)
      .first()
      .find('button#long-button')
      .scrollIntoView()
      .click({ force: true });
    this.menuRoot.should('be.visible');
  }

  searchInPage(term) {
    this.invPage.searchProduct(term);
    this.invPage.clickSubmitSearch();
  }

  drillIntoFirstProductRow() {
    this.tableRows
      .first()
      .find('td')
      .eq(0)
      .scrollIntoView()
      .click({ force: true });
  }

  // Drill into the row whose category cell matches `categoryName`. Use
  // this when the table is filtered by search but the first DOM row may
  // still be a stale row from before the filter was applied.
  drillIntoRowByCategory(categoryName) {
    this.rowByCategory(categoryName)
      .first()
      .find('td')
      .eq(0)
      .scrollIntoView()
      .click({ force: true });
  }

  // ── Readers (return chainables / Promises Cypress can chain on) ──────────
  readMenuItems() {
    return this.menuItems.then(($items) =>
      Cypress._.map($items, (el) => ({
        text: Cypress.$(el).text().trim(),
        disabled:
          Cypress.$(el).attr('aria-disabled') === 'true' ||
          Cypress.$(el).hasClass('Mui-disabled'),
      })),
    );
  }

  readBadgeValue(label) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Exact-text regex: element's ENTIRE trimmed text is "Label (N)".
    // This distinguishes an individual tile ("Sold (123)") from the parent
    // strip container whose textContent concatenates ALL tiles.  It also
    // works for tiles inside the overflow "More" dropdown (aria-hidden or
    // collapsed) because textContent is readable regardless of visibility.
    const exactRe = new RegExp('^' + escapedLabel + '\\s*\\(\\d[\\d,]*\\)$');
    const extractRe = new RegExp(escapedLabel + '\\s*\\((\\d[\\d,]*)\\)');

    return cy.get('body', { timeout: 20000 }).should(($body) => {
      // InfoCard format: label in a span.caption sibling to an h6 value
      const caption = $body.find('span.MuiTypography-caption')
        .filter((_, el) => el.textContent.trim() === label)
        .filter((_, el) => Cypress.$(el).parent().find('h6.MuiTypography-h6').length > 0).length;
      // Compact-strip / StatusFilterTabs: "Label (N)" in a single element.
      // EXCLUDE aria-hidden elements (the hidden measuring row) so that we wait
      // for the VISIBLE tile to render the loaded value — not the measuring row's
      // possibly-stale copy, which updates after visible tabs in React 19 concurrent mode.
      const tile = $body.find('div, span, [role="tab"], [role="menuitem"]')
        .filter((_, el) => {
          if (Cypress.$(el).closest('[aria-hidden="true"]').length) return false;
          return exactRe.test((el.textContent || '').trim());
        }).length;
      expect(caption + tile, `stat tile "${label}" painted`).to.be.greaterThan(0);
    }).then(($body) => {
      // InfoCard format: span.MuiTypography-caption → parent → h6.
      // Only use this path when the h6 sibling actually exists — avoids a
      // false match when an unrelated caption element uses the same label text.
      const $caption = $body.find('span.MuiTypography-caption')
        .filter((_, el) => el.textContent.trim() === label);
      if ($caption.length > 0) {
        const $h6 = $caption.first().parent().find('h6.MuiTypography-h6');
        if ($h6.length > 0) {
          return cy.wrap($h6.first()).invoke('text').then((t) => t.trim());
        }
      }
      // Compact-strip: only from VISIBLE (non-aria-hidden) elements so we read
      // the actual rendered value, not the hidden measuring row's possibly-stale copy.
      let extracted = '0';
      $body.find('div, span, [role="tab"], [role="menuitem"]').each((_, el) => {
        if (Cypress.$(el).closest('[aria-hidden="true"]').length) return;
        if (!exactRe.test((el.textContent || '').trim())) return;
        const m = extractRe.exec(el.textContent || '');
        if (m) { extracted = m[1]; return false; }
      });
      return cy.wrap(extracted);
    });
  }

  readPaginationFooter() {
    // Retry-aware: the footer briefly renders "Record: 0 - 0 of 0" while the
    // listing query is hydrating even after the API response lands and the
    // first rows paint. `.invoke('text').then()` would snapshot that stale
    // text once; using `.should()` lets Cypress retry until the footer is
    // populated (total > 0 and the window is non-empty).
    return this.paginationFooter
      .should(($el) => {
        const raw = $el.text().replace(/\s+/g, ' ');
        const match = /Record:\s*(\d+)\s*-\s*(\d+)\s*of\s*([\d,]+)/i.exec(raw);
        expect(match, `pagination footer parseable: ${raw}`).to.not.be.null;
        const total = Number(match[3].replace(/,/g, ''));
        const to = Number(match[2]);
        expect(total, `pagination footer hydrated (total > 0): ${raw}`).to.be.greaterThan(0);
        expect(to, `pagination footer hydrated (to > 0): ${raw}`).to.be.greaterThan(0);
      })
      .invoke('text')
      .then((raw) => {
        const match = /Record:\s*(\d+)\s*-\s*(\d+)\s*of\s*([\d,]+)/i.exec(
          raw.replace(/\s+/g, ' '),
        );
        return {
          from: Number(match[1]),
          to: Number(match[2]),
          total: Number(match[3].replace(/,/g, '')),
        };
      });
  }

  // ── Add Product dialog ───────────────────────────────────────────────────

  // Open the header 3-dots menu, then click "Add Product".
  // Requires a specific PO to be selected (the item is hidden for All POs).
  openAddProductDialog() {
    this.openHeaderActionMenu();
    cy.contains('[role="menuitem"]', 'Add Product').click();
    cy.contains('[role="dialog"], .MuiDialog-root, [class*="IMSDialog"]', 'Add Product', { timeout: 10000 }).should('exist');
  }

  // Type into the Search Product field inside the Add Product dialog.
  // The field has label="Search Product" (MUI TextField), not a placeholder.
  searchInAddProductDialog(term) {
    cy.get('[role="dialog"]')
      .find('input')
      .first()
      .clear()
      .type(term);
  }

  // Click the Search button inside the dialog and wait for results.
  submitAddProductSearch() {
    cy.get('[role="dialog"]').contains('button', /^Search$/).click();
  }

  // Click the first product card / list item in the Add Product dialog.
  // ProductCard renders MuiListItem-root elements.
  selectFirstProductInDialog() {
    cy.get('[role="dialog"] [class*="MuiListItem"]')
      .first()
      .click({ force: true });
  }

  // Click the "Add" button (first step — opens cost/qty screen).
  clickAddInDialog() {
    cy.get('[role="dialog"]').contains('button', /^Add$/).click();
  }

  // Fill in Expected Quantity on the cost/qty screen.
  // The field has placeholder="0" per the ProductImsDialog TSX.
  fillExpectedQuantity(qty) {
    cy.get('[role="dialog"]')
      .find('input[placeholder="0"]')
      .first()
      .clear()
      .type(String(qty));
  }

  // Click "Add to PO" to submit the dialog.
  clickAddToPO() {
    cy.get('[role="dialog"]').contains('button', /Add to PO/i).click();
  }

  // Close the Add Product dialog.
  // ProductImsDialog renders a <Box component="button"> with ✕ text (not CloseIcon).
  // IMSDialog also places a CloseIcon IconButton at top-right. Either works.
  closeAddProductDialog() {
    // Prefer the IMSDialog CloseIcon button (absolute positioned top-right)
    cy.get('[role="dialog"]')
      .find('button')
      .last()
      .click({ force: true });
  }

  // Assert the success toast fired after adding a product.
  // react-hot-toast renders toasts outside [role="dialog"]; use body search.
  shouldShowAddProductSuccessToast() {
    cy.contains(/product added/i, { timeout: 15000 }).should('exist');
  }

  // Assert the Add Product dialog is NOT visible.
  // IMSDialog hides by not rendering the Dialog at all when open=false.
  addProductDialogShouldBeClosed() {
    cy.get('[role="dialog"]', { timeout: 10000 }).should('not.exist');
  }

  // ── PO Files modal ───────────────────────────────────────────────────────

  // Open the header 3-dots menu then click "PO Files".
  openPOFilesModal() {
    this.openHeaderActionMenu();
    cy.contains('[role="menuitem"]', 'PO Files').click();
    cy.contains('[role="dialog"]', /PO Files/i, { timeout: 10000 }).should('be.visible');
  }

  // The modal title includes the PO number: "PO Files - <poNumber>".
  poFilesModalTitle() {
    return cy.get('[role="dialog"] h6').filter((_, el) => Cypress.$(el).text().includes('PO Files'));
  }

  // List items rendered inside the PO Files dialog.
  poFilesListItems() {
    return cy.get('[role="dialog"] [class*="MuiListItem-root"]');
  }

  // Individual file name text inside the list.
  poFilesFileNames() {
    return cy.get('[role="dialog"] [class*="MuiListItemText"] [class*="subtitle2"]');
  }

  // Download icon buttons (one per file).
  poFilesDownloadButtons() {
    return cy.get('[role="dialog"] [class*="MuiListItemSecondaryAction"] button');
  }

  // "Download All" button.
  poFilesDownloadAllButton() {
    return cy.contains('[role="dialog"] button', /Download All/i);
  }

  // Close the PO Files modal via the "Close" button.
  closePOFilesModal() {
    cy.contains('[role="dialog"] button', /^Close$/i).click();
    cy.get('[role="dialog"]', { timeout: 8000 }).should('not.exist');
  }

  // Assert the "No files found" empty state is shown.
  poFilesModalShouldShowEmptyState() {
    cy.contains('[role="dialog"]', /No files found/i, { timeout: 10000 }).should('be.visible');
  }

  // ── Per-PO navigation helper ─────────────────────────────────────────────

  // Select a specific PO from the dropdown (non-All-POs) and wait for the
  // listing to load.
  selectPoAndWaitForListing(poNumber, alias = 'poListFetch') {
    cy.intercept('GET', `**/incoming-items?**poNumber=${encodeURIComponent(poNumber)}**`).as(alias);
    this.navigateToIncomingInventory();
    this.poDropdownContainer.scrollIntoView().click({ force: true });
    this.poDropdownInput.type(poNumber, { force: true });
    this.poDropdownMenu.should('be.visible').contains(poNumber).click({ force: true });
    cy.wait(`@${alias}`, { timeout: 20000 });
    this.tableRows.should('have.length.gte', 1);
  }

  // ── Badge-value assertion (retries until the specific loaded value appears) ─
  // Use this instead of readBadgeValue() when you already know the expected
  // value (e.g. from an intercepted API response). Unlike readBadgeValue, this
  // method will NOT pass on the React concurrent-mode loading "Label (0)" state —
  // it keeps retrying until the badge renders the actual value or times out.
  assertBadgeMatchesValue(label, expectedValue) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const n = Number(expectedValue);
    const extractRe = new RegExp(escapedLabel + '\\s*\\((\\d[\\d,]*)\\)');

    return cy.get('body', { timeout: 30000 }).should(($body) => {
      let found = false;
      $body.find('div, span, [role="tab"], [role="menuitem"]').each((_, el) => {
        if (Cypress.$(el).closest('[aria-hidden="true"]').length) return;
        const m = extractRe.exec((el.textContent || '').trim());
        if (m && Number(m[1].replace(/,/g, '')) === n) {
          found = true;
          return false;
        }
      });
      expect(found, `badge "${label}" shows value ${n}`).to.be.true;
    });
  }

  // ── Assertions on table contents ─────────────────────────────────────────
  shouldHaveRowWithCategory(categoryName) {
    return cy
      .contains('tbody tr td', categoryName, { timeout: 20000 })
      .should('exist')
      .scrollIntoView();
  }

  shouldHaveNoRowLongButtons() {
    // Product-only categories in All-POs view may render zero item rows on
    // the details page. Allow that — if rows do render, none may carry a
    // row-level long-button. Snapshot after the network intercept has already
    // settled; no rows → .each() is a no-op and the assertion trivially passes.
    cy.get('body').then(($body) => {
      $body.find('tbody tr').each((_, row) => {
        expect(
          Cypress.$(row).find('button#long-button').length,
          `row must not have a row-level long-button`,
        ).to.eq(0);
      });
    });
  }
}

export default AllPOsPage;
