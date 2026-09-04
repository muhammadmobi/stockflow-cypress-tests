import PrintersLocators from '../support/locators/printersLocators';

class PrintersPage {
  visit() {
    cy.visit('/printers');
  }

  // ─── Page structure ───────────────────────────────────────────────────────────

  assertPageHeadingVisible(heading) {
    cy.contains(PrintersLocators.pageHeading, heading).should('be.visible');
  }

  assertTabVisible(label) {
    cy.contains(PrintersLocators.tab, label).should('be.visible');
  }

  clickTab(label) {
    cy.contains(PrintersLocators.tab, label).click();
  }

  // ─── Setup tab (PrintwiseSetup) ───────────────────────────────────────────────

  navigateToSetupTab() {
    this.clickTab('Setup');
  }

  assertSetupSectionVisible() {
    cy.contains(PrintersLocators.setupHeading).should('be.visible');
  }

  getUrlInput() {
    return cy.get(PrintersLocators.urlInput);
  }

  setUrl(url) {
    this.getUrlInput().clear().type(url);
  }

  getApplyButton() {
    return cy.contains('button', PrintersLocators.applyButton);
  }

  assertApplyButtonDisabled() {
    cy.contains('button', PrintersLocators.applyButton).should('be.disabled');
  }

  assertApplyButtonEnabled() {
    cy.contains('button', PrintersLocators.applyButton).should('not.be.disabled');
  }

  clickApply() {
    cy.contains('button', PrintersLocators.applyButton).click();
  }

  assertConnectionStatusChipVisible() {
    cy.get(PrintersLocators.connectionStatusChip).should('exist');
  }

  assertAgentInstallSectionVisible() {
    cy.contains(PrintersLocators.agentInstallHeading).should('be.visible');
  }

  assertDownloadButtonVisible(os) {
    cy.contains('button', os).should('be.visible');
  }

  // ─── Workstations tab ────────────────────────────────────────────────────────

  navigateToWorkstationsTab() {
    this.clickTab('Workstations & Printers');
  }

  assertNoAgentsMessageVisible() {
    cy.contains(PrintersLocators.noAgentsText, { timeout: 10000 }).should('be.visible');
  }

  // ─── Jobs tab ────────────────────────────────────────────────────────────────

  navigateToJobsTab() {
    this.clickTab('Print Jobs');
  }

  assertStatCardVisible(label) {
    cy.contains(label).should('be.visible');
  }

  assertStatusFilterVisible() {
    cy.contains('label', PrintersLocators.statusFilterLabel).should('exist');
  }

  assertTimeWindowFilterVisible() {
    cy.contains('label', PrintersLocators.timeWindowFilterLabel).should('exist');
  }
}

export default PrintersPage;
