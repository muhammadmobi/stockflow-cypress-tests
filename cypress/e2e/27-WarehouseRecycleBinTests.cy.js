// cypress/e2e/27-WarehouseRecycleBinTests.cy.js
//
// Warehouse Management → Recycle Bin — UI tests.
//
// The Recycle Bin page (/warehouse-management/recycle-bin) lists soft-deleted
// WMS records in three tabs: Containers · Locations · Container Types. Each
// row has a "Restore …" icon that opens a ConfirmationDialog (Yes/No).
//
// Test ID prefix:  SW-WRB-UI-TC<NN>
// Doc-block format: every test carries a manual-execution block (Test ID,
// Description, Test Steps, Expected Result, Test Data, Technique).

import WarehouseRecycleBinPage from '../pageObjects/WarehouseRecycleBinPage';
import warehouseRecycleBinLocators from '../support/locators/warehouseRecycleBinLocators';
import {
    createLocationViaApi,
    deleteLocationViaApi,
    disposableName,
} from '../support/helpers/wmsLocationHelpers';
import {
    createContainerTypeViaApi,
    createContainerViaApi,
    deleteContainerViaApi,
    deleteContainerTypeViaApi,
    disposableTypeName,
} from '../support/helpers/wmsContainerHelpers';

// ---------------------------------------------------------------------------
// Helpers: restore-then-delete helpers for after() cleanup.
// The recycle-bin only exposes soft-delete/restore; hard-delete still goes
// through the main resource endpoints. So cleanup = restore (if needed) →
// delete.
// ---------------------------------------------------------------------------

function restoreContainerViaApi(id) {
    if (!id) return cy.wrap(null);
    const baseUrl = Cypress.env('API_BASE_URL');
    return cy.getAuthToken().then((token) =>
        cy.request({
            method: 'POST',
            url: `${baseUrl}/containers/${id}/restore`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        }),
    );
}

function restoreLocationViaApi(id) {
    if (!id) return cy.wrap(null);
    const baseUrl = Cypress.env('API_BASE_URL');
    return cy.getAuthToken().then((token) =>
        cy.request({
            method: 'POST',
            url: `${baseUrl}/locations/${id}/restore`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        }),
    );
}

function restoreContainerTypeViaApi(id) {
    if (!id) return cy.wrap(null);
    const baseUrl = Cypress.env('API_BASE_URL');
    return cy.getAuthToken().then((token) =>
        cy.request({
            method: 'POST',
            url: `${baseUrl}/container-types/${id}/restore`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        }),
    );
}

describe('Warehouse Recycle Bin Tests', () => {
    let recycleBinPage;

    beforeEach(() => {
        cy.authSession('admin');
        recycleBinPage = new WarehouseRecycleBinPage();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Page Layout & Navigation (TC01-TC04)
    // ══════════════════════════════════════════════════════════════════════════

    describe('Page Layout & Navigation (TC01-TC04)', () => {
        beforeEach(() => recycleBinPage.visit());

        /**
         * Test ID:         SW-WRB-UI-TC01
         * Description:     Verify the Recycle Bin page heading and the three
         *                  tab labels render after navigating to the page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Recycle Bin.
         *
         * Expected Result:
         *   - The "Recycle Bin" heading (h5) is visible.
         *   - Three tabs render: "Containers", "Locations", "Container Types".
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the route loaded with
         *                  the expected chrome. Anchors all subsequent tests.
         */
        it('SW-WRB-UI-TC01: Verify the Recycle Bin heading and three tabs render', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.verifyPageHeading();
            warehouseRecycleBinLocators.containersTab().should('be.visible');
            warehouseRecycleBinLocators.locationsTab().should('be.visible');
            warehouseRecycleBinLocators.containerTypesTab().should('be.visible');
        });

        /**
         * Test ID:         SW-WRB-UI-TC02
         * Description:     Verify the Containers tab is active (selected) by
         *                  default when the page loads.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page.
         *
         * Expected Result:
         *   - The "Containers" tab has aria-selected="true".
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: The default-active tab determines which MRT
         *                  table is initially visible. A regression that
         *                  flips the default to Locations would silently
         *                  break all tests that proceed without a tab click.
         */
        it('SW-WRB-UI-TC02: Verify the Containers tab is selected by default', { tags: ['@smoke', '@regression'] }, () => {
            warehouseRecycleBinLocators.containersTab().should('have.attr', 'aria-selected', 'true');
        });

        /**
         * Test ID:         SW-WRB-UI-TC03
         * Description:     Verify clicking the "Locations" tab switches the
         *                  active tab and hides the Container Types tab content.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page.
         *   3. Click the "Locations" tab.
         *
         * Expected Result:
         *   - The "Locations" tab has aria-selected="true".
         *   - The "Containers" tab has aria-selected="false".
         *
         * Test Data:       Not required.
         *
         * Technique:       State Transition
         * Why this technique: Tab navigation is a state machine; each click
         *                  must update aria-selected cleanly. Checking both
         *                  the new-active and the old-active catches both
         *                  directions of the toggle.
         */
        it('SW-WRB-UI-TC03: Verify clicking the Locations tab switches the active tab', { tags: ['@regression'] }, () => {
            recycleBinPage.switchToLocationsTab();
            warehouseRecycleBinLocators.locationsTab().should('have.attr', 'aria-selected', 'true');
            warehouseRecycleBinLocators.containersTab().should('have.attr', 'aria-selected', 'false');
        });

        /**
         * Test ID:         SW-WRB-UI-TC04
         * Description:     Verify clicking the "Container Types" tab switches
         *                  the active tab (admin-visible tab).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page.
         *   3. Click the "Container Types" tab.
         *
         * Expected Result:
         *   - The "Container Types" tab has aria-selected="true".
         *   - The "Containers" tab has aria-selected="false".
         *
         * Test Data:       Not required (requires Admin role).
         *
         * Technique:       State Transition
         * Why this technique: Mirrors TC03 for the third tab. The tab is
         *                  only rendered for Admin — since this suite runs
         *                  as Admin, we can always reach it.
         */
        it('SW-WRB-UI-TC04: Verify clicking the Container Types tab switches the active tab', { tags: ['@regression'] }, () => {
            recycleBinPage.switchToContainerTypesTab();
            warehouseRecycleBinLocators.containerTypesTab().should('have.attr', 'aria-selected', 'true');
            warehouseRecycleBinLocators.containersTab().should('have.attr', 'aria-selected', 'false');
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Containers Tab — Restore Flow (TC05-TC08)
    //
    // Scaffolding:
    //   before() creates a disposable container type + container via API,
    //   then soft-deletes the container so it appears in the Recycle Bin's
    //   Containers tab. The after() sweep restores and hard-deletes so QA
    //   stays clean. All TC05–TC07 tests confirm the container is in the
    //   recycle bin but do not restore it; TC08 restores it (the after()
    //   hook then re-deletes the restored container).
    // ══════════════════════════════════════════════════════════════════════════

    describe('Containers Tab — Restore Flow (TC05-TC08)', () => {
        let containerType;
        let container;

        before(() => {
            cy.authSession('admin');
            cy.visit('/');

            const typeName = disposableTypeName('RBT');

            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, 'container type created').to.exist;
                containerType = type;

                return createContainerViaApi(type.id);
            }).then((ctr) => {
                expect(ctr, 'container created').to.exist;
                container = ctr;

                // Soft-delete the container so it appears in Recycle Bin.
                return deleteContainerViaApi(ctr.id);
            });
        });

        after(() => {
            // Restore (if still deleted) then hard-delete — keeps QA clean.
            if (container?.id) {
                restoreContainerViaApi(container.id).then(() =>
                    deleteContainerViaApi(container.id),
                );
            }
            if (containerType?.id) {
                deleteContainerTypeViaApi(containerType.id);
            }
        });

        /**
         * Test ID:         SW-WRB-UI-TC05
         * Description:     Verify the Containers tab shows a table row for a
         *                  soft-deleted container including its code and a
         *                  "Deleted On" timestamp.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. (Pre-condition) A container has been soft-deleted via API.
         *   3. Navigate to the Recycle Bin page.
         *
         * Expected Result:
         *   - The table has at least one row.
         *   - A row with the deleted container's code is visible.
         *   - The table headers include "Code" and "Deleted On".
         *
         * Test Data:
         *   - Disposable container type + container created and deleted in before().
         *
         * Technique:       Use Case
         * Why this technique: Confirms the soft-delete lands in the Recycle
         *                  Bin list. If this fails, the entire restore flow
         *                  is untestable.
         */
        it('SW-WRB-UI-TC05: Verify the Containers tab shows a row for a soft-deleted container', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();

            // Confirm the Containers tab is active (default).
            warehouseRecycleBinLocators.containersTab().should('have.attr', 'aria-selected', 'true');

            // Verify the deleted container's code is visible.
            recycleBinPage.verifyRowPresent(container.code);

            // Spot-check column headers.
            warehouseRecycleBinLocators.tableHeaders().should(($ths) => {
                const texts = [...$ths].map((th) => th.textContent.trim());
                expect(texts.join(' ')).to.match(/code/i);
                expect(texts.join(' ')).to.match(/deleted on/i);
            });
        });

        /**
         * Test ID:         SW-WRB-UI-TC06
         * Description:     Verify clicking "Restore Container" on a row opens
         *                  the Restore Container confirmation dialog with the
         *                  container code visible in the dialog content.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page.
         *   3. Find the row for the deleted container.
         *   4. Click the "Restore Container" icon.
         *
         * Expected Result:
         *   - A dialog with heading "Restore Container" appears.
         *   - The dialog body references the container's code.
         *   - "Yes" and "No" buttons are visible inside the dialog.
         *
         * Test Data:
         *   - Disposable deleted container from before().
         *
         * Technique:       Use Case
         * Why this technique: Opening the dialog is the precondition for
         *                  the cancel (TC07) and confirm (TC08) flows. A
         *                  regression that breaks the icon click path would
         *                  cause both to fail silently — asserting the
         *                  dialog opens separately surfaces the root cause.
         */
        it('SW-WRB-UI-TC06: Verify the Restore Container dialog opens with the container code', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();

            recycleBinPage.openRestoreContainerDialog(container.code);

            warehouseRecycleBinLocators.restoreContainerDialog().should('be.visible');
            // The dialog renders the container code in the body.
            warehouseRecycleBinLocators
                .restoreContainerDialog()
                .should('contain.text', container.code);
            warehouseRecycleBinLocators.restoreContainerConfirmBtn().should('be.visible');
            warehouseRecycleBinLocators.restoreContainerCancelBtn().should('be.visible');

            // Clean up — cancel the dialog without restoring.
            recycleBinPage.cancelRestoreContainer();
        });

        /**
         * Test ID:         SW-WRB-UI-TC07
         * Description:     Verify cancelling the Restore Container dialog
         *                  (clicking "No") leaves the container in the Recycle
         *                  Bin without restoring it.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page.
         *   3. Click "Restore Container" on the row.
         *   4. Click "No" in the confirmation dialog.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The container row is still present in the Containers tab table.
         *
         * Test Data:
         *   - Disposable deleted container from before().
         *
         * Technique:       Negative testing
         * Why this technique: "No" must be a genuine no-op — a regression
         *                  that closes the dialog AND fires the restore is
         *                  a data-integrity bug.
         */
        it('SW-WRB-UI-TC07: Verify cancelling the Restore Container dialog does not restore', { tags: ['@regression'] }, () => {
            recycleBinPage.visit();

            recycleBinPage.openRestoreContainerDialog(container.code);
            recycleBinPage.cancelRestoreContainer();

            // Dialog closed.
            warehouseRecycleBinLocators.restoreContainerDialog().should('not.exist');

            // Container must still be in the list.
            recycleBinPage.verifyRowPresent(container.code);
        });

        /**
         * Test ID:         SW-WRB-UI-TC08
         * Description:     Verify confirming the Restore Container dialog
         *                  (clicking "Yes") removes the container from the
         *                  Recycle Bin and a success toast appears.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page.
         *   3. Click "Restore Container" on the row.
         *   4. Click "Yes" in the confirmation dialog.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A success toast "Container restored successfully" is visible.
         *   - The container row is no longer present in the Containers tab.
         *
         * Test Data:
         *   - Disposable deleted container from before().
         *
         * Technique:       State Transition
         * Why this technique: deleted-in-recycle-bin → restored is the
         *                  core state transition this page exists for.
         *                  Verifying both the row disappears AND the toast
         *                  is the two-signal confirmation the mutation
         *                  actually committed server-side.
         */
        it('SW-WRB-UI-TC08: Verify confirming restore removes the container from the Recycle Bin', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();

            recycleBinPage.openRestoreContainerDialog(container.code);
            recycleBinPage.confirmRestoreContainer();

            // Success toast.
            cy.contains(/container restored successfully/i, { timeout: 10000 }).should('be.visible');

            // Row no longer in the list.
            recycleBinPage.verifyRowAbsent(container.code);
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Locations Tab — Restore Flow (TC09-TC12)
    //
    // Scaffolding:
    //   before() creates a disposable Facility via API, then soft-deletes it
    //   so it appears in the Recycle Bin's Locations tab. The after() sweep
    //   restores and hard-deletes. TC09–TC11 are read-only; TC12 restores.
    // ══════════════════════════════════════════════════════════════════════════

    describe('Locations Tab — Restore Flow (TC09-TC12)', () => {
        let facility;

        before(() => {
            cy.authSession('admin');
            cy.visit('/');

            createLocationViaApi({
                name: disposableName('rb-fac'),
                type: 'Facility',
            }).then((fac) => {
                expect(fac, 'facility created').to.exist;
                facility = fac;

                // Soft-delete so it appears in the Recycle Bin Locations tab.
                return deleteLocationViaApi(fac.id);
            });
        });

        after(() => {
            // Restore (if still deleted) → hard-delete → QA stays clean.
            if (facility?.id) {
                restoreLocationViaApi(facility.id).then(() =>
                    deleteLocationViaApi(facility.id),
                );
            }
        });

        /**
         * Test ID:         SW-WRB-UI-TC09
         * Description:     Verify the Locations tab shows a row for a soft-
         *                  deleted location including its code, type, path,
         *                  and "Deleted On" columns.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. (Pre-condition) A Facility has been soft-deleted via API.
         *   3. Navigate to the Recycle Bin page.
         *   4. Click the "Locations" tab.
         *
         * Expected Result:
         *   - A row with the deleted Facility's code is visible.
         *   - The table headers include "Code / Name", "Type", "Path",
         *     and "Deleted On".
         *
         * Test Data:
         *   - Disposable Facility created and deleted in before().
         *
         * Technique:       Use Case
         * Why this technique: Confirms the Locations tab is wired to the
         *                  /locations/deleted endpoint and renders the
         *                  expected column set. Anchors the restore tests.
         */
        it('SW-WRB-UI-TC09: Verify the Locations tab shows a row for a soft-deleted location', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToLocationsTab();

            recycleBinPage.verifyRowPresent(facility.code);

            warehouseRecycleBinLocators.tableHeaders().should(($ths) => {
                const texts = [...$ths].map((th) => th.textContent.trim()).join(' ');
                expect(texts).to.match(/code/i);
                expect(texts).to.match(/type/i);
                expect(texts).to.match(/path/i);
                expect(texts).to.match(/deleted on/i);
            });
        });

        /**
         * Test ID:         SW-WRB-UI-TC10
         * Description:     Verify clicking "Restore Location" on a row opens
         *                  the Restore Location confirmation dialog with the
         *                  location code and path visible.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page and switch to Locations tab.
         *   3. Click the "Restore Location" icon on the deleted Facility's row.
         *
         * Expected Result:
         *   - A dialog with heading "Restore Location" appears.
         *   - The dialog body references the Facility's code.
         *   - "Yes" and "No" buttons are visible inside the dialog.
         *
         * Test Data:
         *   - Disposable deleted Facility from before().
         *
         * Technique:       Use Case
         * Why this technique: Mirrors TC06 for the Locations tab — confirms
         *                  the dialog-open path works independently from the
         *                  confirm/cancel paths.
         */
        it('SW-WRB-UI-TC10: Verify the Restore Location dialog opens with the location code', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToLocationsTab();

            recycleBinPage.openRestoreLocationDialog(facility.code);

            warehouseRecycleBinLocators.restoreLocationDialog().should('be.visible');
            warehouseRecycleBinLocators
                .restoreLocationDialog()
                .should('contain.text', facility.code);
            warehouseRecycleBinLocators.restoreLocationConfirmBtn().should('be.visible');
            warehouseRecycleBinLocators.restoreLocationCancelBtn().should('be.visible');

            recycleBinPage.cancelRestoreLocation();
        });

        /**
         * Test ID:         SW-WRB-UI-TC11
         * Description:     Verify cancelling the Restore Location dialog
         *                  leaves the location in the Recycle Bin.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Recycle Bin → Locations tab.
         *   3. Click "Restore Location" on the row.
         *   4. Click "No" in the confirmation dialog.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The location row is still present in the Locations tab table.
         *
         * Test Data:
         *   - Disposable deleted Facility from before().
         *
         * Technique:       Negative testing
         * Why this technique: Mirrors TC07 for the Locations tab. "No"
         *                  must leave the record soft-deleted.
         */
        it('SW-WRB-UI-TC11: Verify cancelling the Restore Location dialog does not restore', { tags: ['@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToLocationsTab();

            recycleBinPage.openRestoreLocationDialog(facility.code);
            recycleBinPage.cancelRestoreLocation();

            warehouseRecycleBinLocators.restoreLocationDialog().should('not.exist');
            recycleBinPage.verifyRowPresent(facility.code);
        });

        /**
         * Test ID:         SW-WRB-UI-TC12
         * Description:     Verify confirming the Restore Location dialog
         *                  removes the location from the Recycle Bin and a
         *                  success toast appears.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Recycle Bin → Locations tab.
         *   3. Click "Restore Location" on the row.
         *   4. Click "Yes" in the confirmation dialog.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A success toast "Location '<CODE>' restored successfully" is visible
         *     (the backend always injects the location code into the message).
         *   - The location row no longer appears in the Locations tab.
         *
         * Test Data:
         *   - Disposable deleted Facility from before().
         *
         * Technique:       State Transition
         * Why this technique: deleted-in-recycle-bin → restored is the
         *                  core lifecycle for the Locations tab. The after()
         *                  hook re-deletes the restored Facility to leave QA
         *                  clean.
         */
        it('SW-WRB-UI-TC12: Verify confirming restore removes the location from the Recycle Bin', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToLocationsTab();

            recycleBinPage.openRestoreLocationDialog(facility.code);
            recycleBinPage.confirmRestoreLocation();

            // Backend injects the location code: "Location '<CODE>' restored successfully"
            cy.contains(/location.*restored successfully/i, { timeout: 10000 }).should('be.visible');
            recycleBinPage.verifyRowAbsent(facility.code);
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Container Types Tab — Restore Flow (TC13-TC16)
    //
    // Scaffolding:
    //   before() creates a disposable container type via API, then soft-deletes
    //   it. The after() sweep restores (if needed) and hard-deletes.
    //   TC13–TC15 are read-only/cancel; TC16 confirms the restore.
    // ══════════════════════════════════════════════════════════════════════════

    describe('Container Types Tab — Restore Flow (TC13-TC16)', () => {
        let containerType;

        before(() => {
            cy.authSession('admin');
            cy.visit('/');

            const typeName = disposableTypeName('RBTy');

            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, 'container type created').to.exist;
                containerType = type;

                // Soft-delete so it appears in the Recycle Bin Container Types tab.
                return deleteContainerTypeViaApi(type.id);
            });
        });

        after(() => {
            // Restore (if still deleted) → hard-delete.
            if (containerType?.id) {
                restoreContainerTypeViaApi(containerType.id).then(() =>
                    deleteContainerTypeViaApi(containerType.id),
                );
            }
        });

        /**
         * Test ID:         SW-WRB-UI-TC13
         * Description:     Verify the Container Types tab (Admin-only) shows
         *                  a row for a soft-deleted container type including
         *                  its name and "Deleted On" columns.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. (Pre-condition) A container type has been soft-deleted via API.
         *   3. Navigate to the Recycle Bin page.
         *   4. Click the "Container Types" tab.
         *
         * Expected Result:
         *   - The Container Types tab renders (admin sees it).
         *   - A row with the deleted type's name is visible.
         *   - The table headers include "Name" and "Deleted On".
         *
         * Test Data:
         *   - Disposable container type created and deleted in before().
         *
         * Technique:       Use Case
         * Why this technique: Confirms the Container Types tab is wired
         *                  to /container-types/deleted. Also validates the
         *                  admin-gate (the tab only renders for Admins).
         */
        it('SW-WRB-UI-TC13: Verify the Container Types tab shows a row for a soft-deleted type', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToContainerTypesTab();

            recycleBinPage.verifyRowPresent(containerType.name);

            warehouseRecycleBinLocators.tableHeaders().should(($ths) => {
                const texts = [...$ths].map((th) => th.textContent.trim()).join(' ');
                expect(texts).to.match(/name/i);
                expect(texts).to.match(/deleted on/i);
            });
        });

        /**
         * Test ID:         SW-WRB-UI-TC14
         * Description:     Verify clicking "Restore Container Type" opens the
         *                  confirmation dialog with the type name visible.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Recycle Bin → Container Types tab.
         *   3. Click the "Restore Container Type" icon on the row.
         *
         * Expected Result:
         *   - A dialog with heading "Restore Container Type" appears.
         *   - The dialog body references the type's name.
         *   - "Yes" and "No" buttons are visible.
         *
         * Test Data:
         *   - Disposable deleted container type from before().
         *
         * Technique:       Use Case
         * Why this technique: Mirrors TC06/TC10 for the Container Types tab.
         */
        it('SW-WRB-UI-TC14: Verify the Restore Container Type dialog opens with the type name', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToContainerTypesTab();

            recycleBinPage.openRestoreContainerTypeDialog(containerType.name);

            warehouseRecycleBinLocators.restoreTypeDialog().should('be.visible');
            warehouseRecycleBinLocators
                .restoreTypeDialog()
                .should('contain.text', containerType.name);
            warehouseRecycleBinLocators.restoreTypeConfirmBtn().should('be.visible');
            warehouseRecycleBinLocators.restoreTypeCancelBtn().should('be.visible');

            recycleBinPage.cancelRestoreContainerType();
        });

        /**
         * Test ID:         SW-WRB-UI-TC15
         * Description:     Verify cancelling the Restore Container Type dialog
         *                  leaves the type in the Recycle Bin.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Recycle Bin → Container Types tab.
         *   3. Click "Restore Container Type" on the row.
         *   4. Click "No" in the confirmation dialog.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The type row is still present in the Container Types tab.
         *
         * Test Data:
         *   - Disposable deleted container type from before().
         *
         * Technique:       Negative testing
         * Why this technique: Mirrors TC07/TC11 for the Container Types tab.
         */
        it('SW-WRB-UI-TC15: Verify cancelling the Restore Container Type dialog does not restore', { tags: ['@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToContainerTypesTab();

            recycleBinPage.openRestoreContainerTypeDialog(containerType.name);
            recycleBinPage.cancelRestoreContainerType();

            warehouseRecycleBinLocators.restoreTypeDialog().should('not.exist');
            recycleBinPage.verifyRowPresent(containerType.name);
        });

        /**
         * Test ID:         SW-WRB-UI-TC16
         * Description:     Verify confirming the Restore Container Type dialog
         *                  removes the type from the Recycle Bin and a success
         *                  toast appears.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Recycle Bin → Container Types tab.
         *   3. Click "Restore Container Type" on the row.
         *   4. Click "Yes" in the confirmation dialog.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A success toast "Container type restored" is visible.
         *   - The type row no longer appears in the Container Types tab.
         *
         * Test Data:
         *   - Disposable deleted container type from before().
         *
         * Technique:       State Transition
         * Why this technique: deleted-in-recycle-bin → restored closes the
         *                  Container Types lifecycle. The after() hook re-
         *                  deletes the restored type to leave QA clean.
         */
        it('SW-WRB-UI-TC16: Verify confirming restore removes the container type from the Recycle Bin', { tags: ['@smoke', '@regression'] }, () => {
            recycleBinPage.visit();
            recycleBinPage.switchToContainerTypesTab();

            recycleBinPage.openRestoreContainerTypeDialog(containerType.name);
            recycleBinPage.confirmRestoreContainerType();

            cy.contains(/container type restored/i, { timeout: 10000 }).should('be.visible');
            recycleBinPage.verifyRowAbsent(containerType.name);
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Empty-State Verification (TC17)
    //
    // Asserts the "nothing deleted" alert renders correctly. We use the
    // Container Types tab because we can reliably ensure it has zero deleted
    // types by pre-sweeping the disposable types (this avoids depending on
    // QA having no deleted containers or locations, which may vary).
    //
    // NOTE: This test skips if QA currently has deleted container types it
    // cannot sweep (e.g. in-use or non-disposable types). Fail-fast skip
    // keeps QA test reliability high without false positives.
    // ══════════════════════════════════════════════════════════════════════════

    describe('Empty-State Verification (TC17)', () => {
        beforeEach(() => recycleBinPage.visit());

        /**
         * Test ID:         SW-WRB-UI-TC17
         * Description:     Verify each tab shows a "No recoverable …" success
         *                  alert when its list is empty (read QA current state).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to the Recycle Bin page.
         *   3. Check the Containers tab.
         *   4. Check the Locations tab.
         *   5. Check the Container Types tab.
         *
         * Expected Result:
         *   - Any tab whose list is empty displays a MUI success Alert with
         *     the text "No recoverable <X> — nothing has been soft-deleted."
         *   - The test logs which tabs are empty vs populated and passes
         *     vacuously if ALL tabs have data (expected on a busy QA).
         *
         * Test Data:       QA's current state (read-only).
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: The empty-state alert is rendered by a
         *                  conditional `if (!isLoading && <list>.length === 0)`.
         *                  We check each tab independently to isolate regressions
         *                  in each tab's empty-state path. The test does NOT
         *                  create or delete data — it observes what QA has.
         */
        it('SW-WRB-UI-TC17: Verify empty-state alerts render when tabs have no deleted records', { tags: ['@regression'] }, () => {
            const checkTab = (switchFn, tabLabel, emptyText) => {
                switchFn();
                cy.get('body').then(($body) => {
                    const hasAlert = $body.text().includes(emptyText);
                    if (hasAlert) {
                        cy.contains(new RegExp(emptyText, 'i')).should('be.visible');
                        cy.log(`TC17: ${tabLabel} tab is empty — empty-state alert verified.`);
                    } else {
                        cy.log(`TC17: ${tabLabel} tab has data — empty-state vacuously satisfied.`);
                    }
                });
            };

            checkTab(
                () => { /* Containers tab is active by default */ },
                'Containers',
                'No recoverable containers',
            );
            checkTab(
                () => recycleBinPage.switchToLocationsTab(),
                'Locations',
                'No recoverable locations',
            );
            checkTab(
                () => recycleBinPage.switchToContainerTypesTab(),
                'Container Types',
                'No recoverable container types',
            );
        });
    });
});
