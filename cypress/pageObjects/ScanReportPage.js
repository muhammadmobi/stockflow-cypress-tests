// cypress/pageObjects/ScanReportPage.js
//
// Page Object for the Scan Report page (/scan-report?poNumber=...).
// Covers: ScanSummary panel, ScanSummaryTable tabs, row actions, bulk actions.
// All selectors live in scanReportLocators.js.

import IncomingInvPage from './IncomingInvPage';
import L from '../support/locators/scanReportLocators';

class ScanReportPage {
  constructor() {
    this.invPage = new IncomingInvPage();
  }

  // ── Scan menu (Incoming Inventory page) ───────────────────────────────────
  // "Scan Report" lives in the ScanMenu chevron next to the "Scan" text button.
  // That whole stack is only rendered when a PO is selected (and the user is
  // not in the Sales role). See List.tsx / orderList.tsx — gated by
  // `selectedPo !== 'All POs' && !isSales()`.

  scanMenuButton() {
    // The Stack with border contains the "Scan" IMSButton + Divider + ScanMenu
    // chevron. Anchor on the "Scan" text, go to the containing Stack, then
    // pick the chevron from within.
    return cy
      .contains('button', /^Scan$/i, { timeout: 15000 })
      .parents('.MuiStack-root')
      .filter((_, el) => Cypress.$(el).find(L.scanMenuTriggerInStack).length > 0)
      .first()
      .find(L.scanMenuTriggerInStack);
  }

  // True when the Scan text button is not on the page (e.g. no PO selected).
  scanMenuExists() {
    return cy.get('body').then(($body) => {
      return $body.find(`button:contains("Scan")`).filter((_, el) => {
        return Cypress.$(el).text().trim() === 'Scan';
      }).length > 0;
    });
  }

  openHeaderMenu() {
    this.scanMenuButton().should('be.visible').click({ force: true });
    cy.get(L.scanMenuPanel, { timeout: 8000 }).should('be.visible');
  }

  closeHeaderMenu() {
    cy.get('body').type('{esc}', { force: true });
  }

  // Returns a chainable wrapping the "Scan Report" MenuItem element so the
  // caller can assert enabled / disabled state.
  scanReportMenuItem() {
    return cy
      .get(L.scanMenuPanel, { timeout: 10000 })
      .contains(L.scanReportMenuItemText)
      .closest('[role="menuitem"]');
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  navigateViaHeaderMenu(poNumber) {
    this.invPage.clickIncomingInventoryNav();
    this.invPage.selectPoNumber(poNumber);
    this.openHeaderMenu();
    this.scanReportMenuItem().should('not.have.class', 'Mui-disabled').click({ force: true });
    cy.url({ timeout: 15000 }).should('include', '/scan-report');
    cy.url().should('include', `poNumber=${encodeURIComponent(poNumber)}`);
  }

  visitDirect(poNumber) {
    cy.visit(`/scan-report?poNumber=${encodeURIComponent(poNumber)}`);
    cy.url({ timeout: 15000 }).should('include', '/scan-report');
  }

  // ── ScanSummary panel ──────────────────────────────────────────────────────

  assertSummaryPanelVisible() {
    cy.contains(L.poNumberLabel, { timeout: 15000 }).should('be.visible');
  }

  assertPoNumberVisible(poNumber) {
    cy.contains(poNumber, { timeout: 15000 }).should('be.visible');
  }

  // Wait until the reports query has finished (Skeletons replaced by h6).
  // Critical before reading any stat-tile value.
  waitForSkeletonsGone() {
    cy.get('body', { timeout: 15000 }).should(($body) => {
      // Either no skeletons or at least one h6 stat value rendered
      expect($body.find(L.statTileSkeleton).length).to.equal(0);
    });
  }

  // Assert a stat tile shows the expected count.
  assertStatTile(label, expectedCount) {
    this.waitForSkeletonsGone();
    cy.contains(L.statTileCaption, label, { timeout: 10000 })
      .parent() // CardContent
      .find(L.statTileValue)
      .should('have.text', String(expectedCount));
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  // The Tab elements are `disabled={isLoading || isPending}` — a `force:true`
  // click passes through but MUI's onChange swallows it, leaving the active
  // tab unchanged. Wait for the tab to be enabled, then click without force,
  // then assert that it actually became the selected tab.
  clickTabByLabel(label) {
    cy.get(L.tabs, { timeout: 15000 })
      .filter((_, el) => el.textContent.includes(label))
      .first()
      .should('not.have.class', 'Mui-disabled')
      .click();
    cy.get(L.tabs)
      .filter((_, el) => el.textContent.includes(label))
      .first()
      .should('have.attr', 'aria-selected', 'true');
  }

  clickFoundItemsTab() {
    this.clickTabByLabel('Found Items');
  }

  clickNotFoundTab() {
    this.clickTabByLabel('Not Found');
  }

  clickNotScannedTab() {
    this.clickTabByLabel('Not Scanned');
  }

  assertAllTabsVisible() {
    ['Found Items', 'Not Found', 'Not Scanned'].forEach((label) => {
      cy.get(L.tabs).contains(label).should('be.visible');
    });
  }

  // ── Table ──────────────────────────────────────────────────────────────────

  assertTableHasRows(minCount = 1) {
    cy.get(L.tableRow, { timeout: 15000 }).should('have.length.at.least', minCount);
  }

  assertTableEmpty() {
    cy.get(L.tableBody, { timeout: 15000 }).should(($tb) => {
      // Either no rows or rows reflect MRT's "No records to display" placeholder
      const dataRows = $tb.find('tr').filter((_, tr) => {
        const cells = Cypress.$(tr).find('td');
        return cells.length > 1; // skip placeholder rows
      });
      expect(dataRows.length).to.equal(0);
    });
  }

  assertTableContainsSerial(serialNumber) {
    cy.get(L.tableBody, { timeout: 15000 }).should('contain.text', serialNumber);
  }

  assertColumnHeadersVisible() {
    cy.contains('th', 'Serial Number').should('be.visible');
    cy.contains('th', 'PO. Number').should('be.visible');
    cy.contains('th', 'Status').should('be.visible');
  }

  // ── Row action menu ────────────────────────────────────────────────────────

  openRowActionMenu(serialNumber) {
    cy.get(L.tableBody, { timeout: 10000 })
      .contains('tr', serialNumber)
      .find(L.rowActionBtn)
      .click({ force: true });
  }

  openFirstRowActionMenu() {
    cy.get(L.tableRow, { timeout: 10000 })
      .first()
      .find(L.rowActionBtn)
      .click({ force: true });
  }

  clickMenuItem(label) {
    cy.get(L.rowActionMenu, { timeout: 8000 })
      .contains('[role="menuitem"]', label)
      .should('be.visible')
      .click({ force: true });
  }

  // ── Intercepts ─────────────────────────────────────────────────────────────

  interceptReports(alias = 'scanReports') {
    cy.intercept('GET', `**${L.api.reports}**`).as(alias);
  }

  interceptScannedItems(alias = 'scannedItems') {
    cy.intercept('GET', `**${L.api.scannedItems}**`).as(alias);
  }

  interceptMarkStatus(alias = 'markStatus') {
    cy.intercept('POST', `**${L.api.markStatus}**`).as(alias);
  }

  waitForReports(alias = 'scanReports') {
    cy.wait(`@${alias}`, { timeout: 20000 }).then(({ response }) => {
      expect(response.statusCode, 'reports API must succeed').to.eq(200);
    });
  }

  waitForScannedItems(alias = 'scannedItems') {
    cy.wait(`@${alias}`, { timeout: 20000 }).then(({ response }) => {
      expect(response.statusCode, 'scanned-items API must succeed').to.eq(200);
    });
  }

  waitForMarkStatus(alias = 'markStatus') {
    cy.wait(`@${alias}`, { timeout: 20000 }).then(({ response }) => {
      expect(response.statusCode, 'mark-status API must succeed').to.be.oneOf([200, 201]);
    });
  }

  // ── Assertions ─────────────────────────────────────────────────────────────

  assertStatusUpdatedToast() {
    cy.contains('successfully', { timeout: 10000 }).should('exist');
  }

  assertPageUrl(poNumber) {
    cy.url().should('include', '/scan-report');
    cy.url().should('include', `poNumber=${encodeURIComponent(poNumber)}`);
  }
}

export default ScanReportPage;
