// cypress/pageObjects/InventoryAudit/auditSettingsDialog.js
//
// Page object for the audit-settings dialog opened from /abc/audits
// (cypress/e2e/InventoryAudit/03-AuditSettingsTests.cy.js).
// Component: Frontend/src/components/ABC/AuditSettingsDialog.tsx
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §9.1 (TC36..TC40)

import L from '../../support/locators/InventoryAudit/auditSettingsLocators';
import T from '../../support/locators/InventoryAudit/auditToastLocators';

class AuditSettingsDialog {
  assertOpen() {
    L.title().should('be.visible');
    return this;
  }

  assertClosed() {
    L.dialog().should('not.exist');
    return this;
  }

  assertCorrectionToggle(checked) {
    L.correctionSwitch().should(checked ? 'be.checked' : 'not.be.checked');
    return this;
  }

  toggleCorrection() {
    L.correctionSwitch().click();
    return this;
  }

  save() {
    L.saveButton().click();
    return this;
  }

  cancel() {
    L.cancelButton().click();
    return this;
  }

  assertSaveDisabled() {
    L.saveButton().should('be.disabled');
    return this;
  }

  assertLoadError() {
    L.loadError().should('be.visible');
    return this;
  }

  /**
   * The stale-freeze control must stay GONE.
   *
   * Not a cosmetic check. The backend still accepts 1..1440 minutes, the sweep
   * that consumes the value DELETES the bin's scans, and it measures from when
   * the bin was STARTED rather than from last activity — so an admin typing a
   * small number here reproduces the 2026-08-07 loss of 3,255 scans exactly.
   * Removing the input is the mitigation until the sweep is made non-destructive.
   * If this assertion fails, the control came back: do NOT add a locator and move
   * on — read docs/location-audit-backend-impact.md § L1 first.
   */
  assertNoStaleFreezeControl() {
    L.staleFreezeInput().should('not.exist');
    L.dialog().should('not.contain.text', 'minutes');
    return this;
  }

  assertToast(pattern) {
    T.toastText().should('match', pattern);
    return this;
  }
}

export default AuditSettingsDialog;
