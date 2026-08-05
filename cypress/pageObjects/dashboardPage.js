// cypress/pageObjects/dashboardPage.js

import dashboardLocators from '../support/locators/dashboardLocators';
import urls from '../fixtures/urls.json';
import data from '../fixtures/dashboardData.json';

class DashboardPage {
  visit() {
    cy.visit(urls.dashboard);
  }

  // ── Legacy methods (TC04 backward compat) ──────────────────────────────────

  verifyBreadcrumbVisible() {
    dashboardLocators.breadcrumbNav().should('be.visible');
  }

  verifySectionVisible(sectionTitle) {
    dashboardLocators.sectionHeading(sectionTitle).should('be.visible');
  }

  verifyStatCardText(text) {
    dashboardLocators.statCardText(text).should('be.visible');
  }

  clickStatCard(title) {
    dashboardLocators.clickableStatCard(title).should('be.visible').click();
  }

  verifyStatCardValue(title, expectedValue) {
    dashboardLocators.statCardValue(title)
      .should('be.visible')
      .invoke('text')
      .invoke('trim')
      .should('eq', String(expectedValue));
  }

  verifyNavigatedToInventory() {
    cy.url().should('include', urls.inventory);
  }

  verifyCardClickNavigation(cardTitle, filterLabel) {
    this.clickStatCard(cardTitle);
    this.verifyNavigatedToInventory();
  }

  // ── KPI card methods ───────────────────────────────────────────────────────

  verifyKpiCardLabelVisible(label) {
    dashboardLocators.kpiCardLabel(label).should('be.visible');
  }

  // ── DashboardCard section title methods ────────────────────────────────────

  verifyDashboardCardTitle(title) {
    dashboardLocators.dashboardCardTitle(title).should('be.visible');
  }

  // ── Time range methods ─────────────────────────────────────────────────────

  verifyTimeRangeButton(label) {
    dashboardLocators.timeRangeButton(label).should('be.visible');
  }

  selectTimeRange(label) {
    dashboardLocators.timeRangeButton(label).click();
  }

  // ── Custom date range popover methods ──────────────────────────────────────

  openCustomDateRange() {
    dashboardLocators.timeRangeButton('Custom').click();
  }

  verifyCustomDatePopoverVisible() {
    dashboardLocators.customDateRangeTitle().should('be.visible');
  }

  setCustomDateFrom(date) {
    dashboardLocators.customDateFromInput().clear().type(date);
  }

  setCustomDateTo(date) {
    dashboardLocators.customDateToInput().clear().type(date);
  }

  applyCustomDateRange() {
    dashboardLocators.applyCustomDateButton().click();
  }

  cancelCustomDateRange() {
    dashboardLocators.cancelCustomDateButton().click();
  }

  verifyApplyButtonEnabled() {
    dashboardLocators.applyCustomDateButton().should('not.be.disabled');
  }

  // ── Edit Dashboard methods ─────────────────────────────────────────────────

  verifyEditDashboardButton() {
    dashboardLocators.editDashboardButton().should('be.visible');
  }

  enterEditMode() {
    dashboardLocators.editDashboardButton().click();
    dashboardLocators.saveLayoutButton().should('be.visible');
  }

  saveLayout() {
    dashboardLocators.saveLayoutButton().click();
  }

  resetLayout() {
    dashboardLocators.resetButton().click();
  }

  verifyResetButtonVisible() {
    dashboardLocators.resetButton().should('be.visible');
  }

  // ── Inventory Overview card methods ────────────────────────────────────────

  verifyInventoryOverviewRowVisible(label) {
    cy.contains('.MuiTypography-caption', new RegExp(`^${label}$`, 'i')).should('be.visible');
  }

  clickInventoryOverviewRow(label) {
    // Click the label text — event bubbles to the onClick Box wrapper
    cy.contains('.MuiTypography-caption', new RegExp(`^${label}$`, 'i')).click();
  }

  // ── Item Status card methods ────────────────────────────────────────────────

  verifyItemStatusRowVisible(label) {
    cy.contains('.MuiTypography-body2', new RegExp(`^${label}$`, 'i')).should('be.visible');
  }

  clickItemStatusRow(label) {
    cy.contains('.MuiTypography-body2', new RegExp(`^${label}$`, 'i'))
      .parent()
      .click();
  }

  // ── PO Health card methods ─────────────────────────────────────────────────

  verifyPOHealthRowVisible(label) {
    cy.contains('.MuiTypography-body2', new RegExp(`^${label}$`, 'i')).should('exist');
  }

  // ── Work Orders card methods ───────────────────────────────────────────────

  verifyWorkOrderRowVisible(label) {
    // Scope within the Work Orders DashboardCard Paper; use 'exist' — card content may be clipped by overflow parent
    cy.contains('.MuiTypography-subtitle2', /^work orders$/i)
      .closest('[class*="MuiPaper"]')
      .contains('.MuiTypography-caption', new RegExp(`^${label}$`, 'i'))
      .should('exist');
  }

  clickWorkOrdersCard() {
    // Scoped within Work Orders card — click a row; onClick bubbles to the Box grid that calls navigate('/work-orders')
    cy.contains('.MuiTypography-subtitle2', /^work orders$/i)
      .closest('[class*="MuiPaper"]')
      .contains('.MuiTypography-caption', new RegExp(`^${data.workOrderRows[0]}$`, 'i'))
      .click();
  }

  // ── Asset Tracking card methods ────────────────────────────────────────────

  verifyAssetTrackingRowVisible(label) {
    // Scope within the Asset Tracking DashboardCard Paper; use 'exist' — card content may be clipped by overflow parent
    cy.contains('.MuiTypography-subtitle2', /^asset tracking$/i)
      .closest('[class*="MuiPaper"]')
      .contains('.MuiTypography-caption', new RegExp(`^${label}$`, 'i'))
      .should('exist');
  }
}

export default DashboardPage;
