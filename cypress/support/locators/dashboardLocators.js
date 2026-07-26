// cypress/support/locators/dashboardLocators.js

const dashboardLocators = {
  // Page heading - renders as h1 (legacy — not present in redesigned dashboard)
  pageHeading: (text) => cy.findByRole('heading', { level: 1, name: new RegExp(text, 'i') }),

  // Breadcrumb nav (legacy — not present in redesigned dashboard)
  breadcrumbNav: () => cy.findByRole('navigation', { name: /breadcrumb/i }),

  // Section headings (legacy — not present in redesigned dashboard)
  sectionHeading: (text) => cy.findByRole('heading', { name: new RegExp(text, 'i') }),

  // ── Redesigned dashboard locators ──────────────────────────────────────────

  // KpiTopCard label — rendered as <Typography variant="caption"> (MuiTypography-caption class)
  kpiCardLabel: (label) =>
    cy.contains('.MuiTypography-caption', new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')),

  // DashboardCard section title — <Typography variant="subtitle2" fontWeight={700}>
  // Scoped to subtitle2 class to avoid matching identically-named sidebar nav items
  dashboardCardTitle: (title) =>
    cy.contains('.MuiTypography-subtitle2', new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')),

  // Time range toggle button (ToggleButtonGroup)
  timeRangeButton: (label) => cy.findByRole('button', { name: new RegExp(label, 'i') }),

  // Edit Dashboard button
  editDashboardButton: () => cy.findByRole('button', { name: /edit dashboard/i }),

  // Save Layout button (visible in edit mode)
  saveLayoutButton: () => cy.findByRole('button', { name: /save layout/i }),

  // Reset button (visible in edit mode alongside Save Layout)
  resetButton: () => cy.findByRole('button', { name: /^reset$/i }),

  // ── Custom date range popover ───────────────────────────────────────────────

  // "Custom Date Range" popover heading
  customDateRangeTitle: () => cy.contains('.MuiTypography-subtitle2', /custom date range/i),

  // From / To date inputs inside the popover — scoped by label text, then sibling input
  customDateFromInput: () =>
    cy.contains('.MuiFormLabel-root', /^from$/i).closest('.MuiFormControl-root').find('input[type="date"]'),
  customDateToInput: () =>
    cy.contains('.MuiFormLabel-root', /^to$/i).closest('.MuiFormControl-root').find('input[type="date"]'),

  // Apply button inside the popover
  applyCustomDateButton: () => cy.findByRole('button', { name: /^apply$/i }),

  // Cancel button inside the popover
  cancelCustomDateButton: () => cy.findByRole('button', { name: /^cancel$/i }),

  // ── Legacy stat card locators (kept for backward compat) ───────────────────

  statCardText: (text) => cy.findByText(new RegExp(text, 'i')),

  clickableStatCard: (title) => {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return cy.findByRole('button', { name: new RegExp(escaped, 'i') });
  },

  statCardValue: (title) => {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return cy
      .contains('span', new RegExp(`^${escaped}$`, 'i'))
      .parent()
      .children('div')
      .first();
  },
};

export default dashboardLocators;
