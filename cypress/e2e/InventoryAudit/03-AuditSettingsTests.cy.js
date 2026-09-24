// cypress/e2e/InventoryAudit/03-AuditSettingsTests.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md  (§9.1.3, TC36–TC40)
// Component:  Frontend/src/components/ABC/AuditSettingsDialog.tsx
// API mirror: cypress/e2e/api/AuditManagementAPI.cy.js (SW-IAUD-API-TC53..58)
//
// The dialog is one switch, but it carries two conditions worth their own spec:
// a discarded edit must not persist into the next open (the component re-seeds on
// `open`), and the removed stale-freeze control must stay removed — the backend
// still accepts 1..1440 minutes and its sweep DELETES scans, so that input is how
// the 2026-08-07 loss of 3,255 scans is still reachable.
//
// The settings value is tenant-global and gates a worker feature for everyone, so
// the save path is stubbed rather than live: a leaked `false` would change worker
// behaviour across the tenant. The persistence rules themselves are proven live by
// the API spec (TC54/TC57), which captures and restores the value.

import AuditsListPage from '../../pageObjects/InventoryAudit/auditsListPage';
import AuditSettingsDialog from '../../pageObjects/InventoryAudit/auditSettingsDialog';
import {
  stubAuditList,
  stubSettings,
  stubSettingsFailure,
  stubSettingsSave,
  auditRow,
} from '../../support/InventoryAudit/auditHelpers';

describe('Inventory Audit — Audit settings dialog', { tags: ['@regression'] }, () => {
  const list = new AuditsListPage();
  const dialog = new AuditSettingsDialog();

  beforeEach(() => {
    cy.authSession('admin');
    stubAuditList([auditRow()]);
  });

  // Use case — the dialog reflects what the server holds
  it('SW-IAUD-TC36: the Settings dialog opens showing the stored correction value', () => {
    stubSettings({ enableWorkerLocationCorrection: false }, 'settingsGet');
    list.visitAndWait().openSettings();
    cy.wait('@settingsGet');
    dialog.assertOpen().assertCorrectionToggle(false);
  });

  // State transition — toggle, save, and the body carries ONLY the toggle
  it('SW-IAUD-TC37: saving sends only the correction flag, toasts and closes', () => {
    stubSettings({ enableWorkerLocationCorrection: false }, 'settingsGet');
    stubSettingsSave('settingsPut');
    list.visitAndWait().openSettings();
    cy.wait('@settingsGet');
    dialog.toggleCorrection().assertCorrectionToggle(true).save();
    cy.wait('@settingsPut').then(({ request }) => {
      expect(request.body.enableWorkerLocationCorrection, 'the flipped value is sent').to.eq(true);
      expect(
        request.body,
        'the screen must not send a stale-freeze value — an absent key preserves the stored one'
      ).to.not.have.property('staleBinFreezeMinutes');
    });
    dialog.assertToast(/audit settings saved\./i);
    dialog.assertClosed();
  });

  // Error guessing — a discarded edit must not survive into the next open
  it('SW-IAUD-TC38: cancelling discards the edit and reopening shows the server value', () => {
    stubSettings({ enableWorkerLocationCorrection: true }, 'settingsGet');
    cy.intercept('PUT', '**/inventory-audits/settings', cy.spy().as('savedSpy'));
    list.visitAndWait().openSettings();
    cy.wait('@settingsGet');
    dialog.assertCorrectionToggle(true).toggleCorrection().assertCorrectionToggle(false).cancel();
    dialog.assertClosed();
    cy.get('@savedSpy').should('not.have.been.called');

    list.openSettings();
    dialog.assertOpen().assertCorrectionToggle(true);
  });

  // Error guessing — the read-failure partition must not show a guessed default
  it('SW-IAUD-TC39: a failed settings read is reported and Save is disabled', () => {
    stubSettingsFailure('settingsFail');
    list.visitAndWait().openSettings();
    cy.wait('@settingsFail');
    dialog.assertLoadError().assertSaveDisabled();
  });

  // Error guessing — a deliberately removed control must not come back.
  // See the note on assertNoStaleFreezeControl() before "fixing" a failure here.
  it('SW-IAUD-TC40: the dialog exposes no abandoned-count release window', () => {
    stubSettings({ enableWorkerLocationCorrection: true, staleBinFreezeMinutes: 0 }, 'settingsGet');
    list.visitAndWait().openSettings();
    cy.wait('@settingsGet');
    dialog.assertOpen().assertNoStaleFreezeControl();
  });
});
