// cypress/support/locators/InventoryAudit/auditSettingsLocators.js
//
// Locators for the audit-settings dialog opened from /abc/audits
// (cypress/e2e/InventoryAudit/03-AuditSettingsTests.cy.js).
// Component: Frontend/src/components/ABC/AuditSettingsDialog.tsx
//
// One deliberate absence is asserted here, not just queried: the dialog used to
// expose "Release an abandoned count after (minutes)" (`staleBinFreezeMinutes`)
// and that control was REMOVED on purpose. The backend still accepts 1..1440,
// the stale-freeze sweep is destructive, and a small value reproduces the
// 2026-08-07 loss of 3,255 scans — so `staleFreezeInput` exists only so
// SW-IAUD-TC40 can prove it is still gone. Do not "fix" a failure there by
// adding the field back; see docs/location-audit-backend-impact.md § L1.

const auditSettingsLocators = {
  dialog: () => cy.findByRole('dialog'),
  title: () => cy.findByRole('dialog').contains(/^audit settings$/i),

  loadingSpinner: () => cy.findByRole('dialog').find('.MuiCircularProgress-root'),
  loadError: () => cy.contains(/could not load the current settings/i),

  // A MUI v7 Switch exposes role="switch", NOT role="checkbox" — the underlying
  // input is still type=checkbox (so `.should('be.checked')` works), but the
  // explicit role attribute wins for accessible-role queries. Verified against
  // the rendered DOM on 2026-08-18; querying `checkbox` here times out.
  correctionSwitch: () =>
    cy.findByRole('dialog').findByRole('switch', { name: /allow workers to correct item locations/i }),
  correctionCaption: () => cy.contains(/turning this off leaves the mis-placement/i),

  cancelButton: () => cy.findByRole('dialog').findByRole('button', { name: /^cancel$/i }),
  saveButton: () => cy.findByRole('dialog').findByRole('button', { name: /^save$/i }),

  /**
   * The removed stale-freeze control. Queried ONLY to assert absence — any
   * number-typed input inside the dialog, plus its old label text.
   */
  staleFreezeInput: () => cy.findByRole('dialog').find('input[type="number"]'),
  staleFreezeLabel: () => cy.findByRole('dialog').contains(/abandoned count|minutes/i),
};

export default auditSettingsLocators;
