// cypress/e2e/30-WarehouseCascadeDeleteTests.cy.js
//
// Warehouse Management → Locations — Cascade soft-delete & restore (UI tests).
//
// Test ID prefix:  SW-WCD-UI-TC<NN>
//
// Feature under test:
//   When a Facility is deleted via the Facilities Management page, the backend
//   soft-deletes the Facility AND all its descendants (cascade). Both the
//   Facility and its child Zone should appear in the Recycle Bin (Locations
//   tab). Restoring the Facility from the Recycle Bin should return it to the
//   Facilities Management main grid.
//
// Seeding strategy:
//   before()  — API-create a Facility + a child Zone; store both objects.
//   TC01-TC02 — delete the Facility via UI.
//   TC03-TC04 — verify Recycle Bin Locations tab shows Facility AND Zone.
//   TC05      — restore the Facility from Recycle Bin; confirm it reappears
//               on the Facilities Management page.
//   after()   — restore Facility (best-effort) then API-delete both to clean up.
//
// Out of scope:
//   - Restoring a Zone independently of its Facility (deeper restore UX).
//   - Cascaded restore of descendants when a Facility is restored.
//   - Cascade delete beyond two tiers (Area / Row / Bay / Level / Bin).
//   - Recycle Bin Containers / Container-Types tabs.
//   - Anonymous-user access (the Recycle Bin is admin-only by role).
//
// Doc-block format: every it() carries a full manual-execution block.

import WarehouseLocationsPage from "../pageObjects/WarehouseLocationsPage";
import WarehouseRecycleBinPage from "../pageObjects/WarehouseRecycleBinPage";
import {
    disposableName,
    createLocationViaApi,
    deleteLocationViaApi,
} from "../support/helpers/wmsLocationHelpers";

describe("Warehouse Cascade Delete Tests", { tags: ["@regression"] }, () => {
    let locationsPage;
    let recycleBinPage;

    // Shared seeded objects — populated once in before().
    let facility; // { id, code, name, … }
    let zone;     // { id, code, name, … }

    // ── Seeding ────────────────────────────────────────────────────────────────
    // Create the Facility and its child Zone via API once before the suite runs.
    // We do NOT delete them here — the tests themselves delete the Facility via
    // the UI (that is what TC01-TC02 exercise).
    before(() => {
        cy.authSession('admin');
        const facilityName = disposableName("casc-fac");
        const zoneName     = disposableName("casc-zone");

        createLocationViaApi({ name: facilityName, type: "Facility" })
            .then((fac) => {
                facility = fac;
                return createLocationViaApi({
                    name: zoneName,
                    type: "Zone",
                    parentId: fac.id,
                });
            })
            .then((z) => {
                zone = z;
            });
    });

    // ── Page-object instantiation ──────────────────────────────────────────────
    beforeEach(() => {
        cy.authSession('admin');
        locationsPage  = new WarehouseLocationsPage();
        recycleBinPage = new WarehouseRecycleBinPage();
    });

    // ── Cleanup ────────────────────────────────────────────────────────────────
    // TC05 restores the Facility, so the after() safety-net must first restore
    // it (in case TC05 did not run) and then hard-delete both locations via API.
    // All calls are best-effort (failOnStatusCode: false) so a partially-run
    // suite doesn't leave the after() itself failing.
    after(() => {
        cy.authSession('admin');

        if (!facility) return;

        const baseUrl = Cypress.env("API_BASE_URL");

        cy.getAuthToken().then((token) => {
            // 1. Restore Facility — idempotent: if it was already restored by
            //    TC05, the backend will return a semantic "already active" error
            //    which we tolerate via failOnStatusCode: false.
            cy.request({
                method: "POST",
                url: `${baseUrl}/locations/${facility.id}/restore`,
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
            }).then(() => {
                // 2. Delete Facility (cascade-deletes Zone automatically).
                deleteLocationViaApi(facility.id);
            });
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  TC01 — Confirmation dialog opens with Facility code visible
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WCD-UI-TC01
     *
     * Description:     Navigate to Facilities Management and click the Delete
     *                  icon on the seeded Facility. Verify the confirmation
     *                  dialog opens and shows the Facility's code.
     *
     * Pre-conditions:
     *   - Admin session active.
     *   - Facility (facility.code) exists and is visible on the Facilities
     *     Management page.
     *
     * Test Steps:
     *   1. Navigate to /warehouse-management/locations/facilities.
     *   2. Locate the row for the seeded Facility by its code.
     *   3. Click the "Delete Facility" icon button.
     *
     * Expected Result:
     *   - A confirmation dialog is visible on screen.
     *   - The dialog body contains the Facility's code text so the user
     *     knows exactly which Facility will be deleted.
     *
     * Test Data:       facility.code (from before() seed).
     *
     * Technique:       Use Case
     * Why this technique: The actor-driven happy path for "initiate delete"
     *                  is: navigate → locate row → click delete icon →
     *                  confirmation dialog appears. TC01 covers the trigger
     *                  step and the dialog's informational content without
     *                  yet completing the destructive action.
     */
    it(
        "SW-WCD-UI-TC01: Delete icon on seeded Facility opens confirmation dialog with Facility code",
        { tags: ["@smoke", "@regression"] },
        function () {
            // Use Case — confirm-dialog open (pre-confirmation half of the delete flow).
            if (!facility) { this.skip(); return; }

            locationsPage.visitFacilities();
            locationsPage.clickDeleteFacility(facility.code);

            // The confirmation dialog must be visible …
            cy.findByRole("dialog").should("be.visible");

            // … and it must surface the Facility's code so the user sees
            // clearly what will be deleted.
            cy.findByRole("dialog").should("contain.text", facility.code);
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  TC02 — Confirming delete removes Facility from main grid
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WCD-UI-TC02
     *
     * Description:     Confirm the delete on the already-open confirmation
     *                  dialog (or re-trigger delete if TC01 closed the dialog).
     *                  Verify the Facility's code no longer appears on the
     *                  Facilities Management page after deletion.
     *
     * Pre-conditions:
     *   - Admin session active.
     *   - Facility exists (has NOT been deleted by a prior test run in this
     *     suite because beforeEach re-establishes the session, not the data).
     *
     * Test Steps:
     *   1. Navigate to /warehouse-management/locations/facilities.
     *   2. Click the "Delete Facility" icon for the seeded Facility.
     *   3. In the confirmation dialog, click the confirm/yes button.
     *   4. Observe the Facilities Management grid.
     *
     * Expected Result:
     *   - The confirmation dialog closes.
     *   - The Facility's code is no longer visible in the grid.
     *
     * Test Data:       facility.code (from before() seed).
     *
     * Technique:       State Transition
     * Why this technique: The Facility transitions Active → Soft-deleted.
     *                  TC02 covers the Active → Soft-deleted transition by
     *                  confirming the delete and asserting the entity is no
     *                  longer in the Active grid view.
     */
    it(
        "SW-WCD-UI-TC02: Confirming Facility delete removes it from the Facilities Management grid",
        { tags: ["@smoke", "@regression"] },
        function () {
            // State Transition: Active → Soft-deleted (confirmed by absence from Active grid).
            if (!facility) { this.skip(); return; }

            locationsPage.visitFacilities();
            locationsPage.clickDeleteFacility(facility.code);

            // Wait for the dialog to be visible before confirming so we
            // don't click a stale/absent element.
            cy.findByRole("dialog").should("be.visible");
            locationsPage.confirmDelete();

            // After confirmation the dialog must close …
            cy.findByRole("dialog").should("not.exist");

            // … and the Facility code must have left the Active grid.
            locationsPage.verifyFacilityAbsent(facility.code);
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  TC03 — Deleted Facility appears in Recycle Bin → Locations tab
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WCD-UI-TC03
     *
     * Description:     Navigate to the Recycle Bin page, switch to the
     *                  Locations tab, and verify the soft-deleted Facility
     *                  appears in the table.
     *
     * Pre-conditions:
     *   - Admin session active.
     *   - The Facility was soft-deleted by TC02 (or an earlier run that
     *     left the Facility in soft-deleted state).
     *
     * Test Steps:
     *   1. Navigate to /warehouse-management/recycle-bin.
     *   2. Click the "Locations" tab.
     *   3. Inspect the table for the Facility's code.
     *
     * Expected Result:
     *   - The Locations tab is active.
     *   - The table contains a row whose text includes the Facility's code.
     *
     * Test Data:       facility.code (from before() seed).
     *
     * Technique:       State Transition
     * Why this technique: After the Active → Soft-deleted transition, the
     *                  entity should become visible in the Recycle Bin view.
     *                  TC03 verifies the target state of the preceding
     *                  transition — the entity is correctly represented in
     *                  the Soft-deleted view.
     */
    it(
        "SW-WCD-UI-TC03: Deleted Facility appears in Recycle Bin Locations tab",
        { tags: ["@regression"] },
        function () {
            // State Transition post-condition: Soft-deleted Facility appears in Recycle Bin.
            if (!facility) { this.skip(); return; }

            recycleBinPage.visit();
            recycleBinPage.switchToLocationsTab();
            recycleBinPage.verifyRowPresent(facility.code);
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  TC04 — Child Zone ALSO appears in Recycle Bin (cascade delete)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WCD-UI-TC04
     *
     * Description:     On the Recycle Bin → Locations tab (already showing
     *                  soft-deleted locations), verify that the seeded child
     *                  Zone also appears — confirming the backend cascade
     *                  soft-delete propagated to descendants.
     *
     * Pre-conditions:
     *   - Admin session active.
     *   - The Facility was soft-deleted (TC02).
     *   - The Zone was NOT explicitly deleted — it must appear because of
     *     the cascade.
     *
     * Test Steps:
     *   1. Navigate to /warehouse-management/recycle-bin.
     *   2. Click the "Locations" tab.
     *   3. Inspect the table for the Zone's code.
     *
     * Expected Result:
     *   - The table contains a row whose text includes the child Zone's code,
     *     confirming cascade soft-delete reached the Zone.
     *
     * Test Data:       zone.code (from before() seed).
     *
     * Technique:       State Transition (cascade path)
     * Why this technique: This is a separate state-transition assertion:
     *                  Zone had no direct delete action, yet the expected
     *                  post-state is Soft-deleted. The test specifically
     *                  validates the cascade path of the Facility delete,
     *                  covering a distinct transition (Zone: Active →
     *                  Soft-deleted via parent cascade).
     */
    it(
        "SW-WCD-UI-TC04: Child Zone also appears in Recycle Bin (cascade soft-delete)",
        { tags: ["@regression"] },
        function () {
            // State Transition: Zone Active → Soft-deleted via parent cascade.
            if (!zone) { this.skip(); return; }

            recycleBinPage.visit();
            recycleBinPage.switchToLocationsTab();
            recycleBinPage.verifyRowPresent(zone.code);
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  TC05 — Restoring Facility returns it to Facilities Management grid
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WCD-UI-TC05
     *
     * Description:     In the Recycle Bin → Locations tab, click Restore on
     *                  the deleted Facility, confirm the restore dialog, then
     *                  navigate back to Facilities Management and verify the
     *                  Facility reappears.
     *
     * Pre-conditions:
     *   - Admin session active.
     *   - The Facility is in the Recycle Bin (soft-deleted by TC02).
     *
     * Test Steps:
     *   1. Navigate to /warehouse-management/recycle-bin.
     *   2. Click the "Locations" tab.
     *   3. Locate the Facility row; click the "Restore Location" icon button.
     *   4. Confirm the restore dialog (click "Yes").
     *   5. Navigate to /warehouse-management/locations/facilities.
     *   6. Confirm the Facility's code is present in the grid.
     *
     * Expected Result:
     *   - The restore confirmation dialog closes after clicking "Yes".
     *   - The Facility appears in the Facilities Management grid.
     *
     * Test Data:       facility.code (from before() seed).
     *
     * Technique:       State Transition
     * Why this technique: Restore is the inverse of delete — it covers the
     *                  Soft-deleted → Active transition. Combining TC02
     *                  (Active → Soft-deleted) and TC05 (Soft-deleted →
     *                  Active) gives a complete round-trip through the
     *                  location lifecycle's two most-used transitions.
     */
    it(
        "SW-WCD-UI-TC05: Restoring Facility from Recycle Bin returns it to Facilities Management grid",
        { tags: ["@regression"] },
        function () {
            // State Transition: Soft-deleted → Active (Restore path).
            if (!facility) { this.skip(); return; }

            recycleBinPage.visit();
            recycleBinPage.switchToLocationsTab();
            recycleBinPage.openRestoreLocationDialog(facility.code);
            recycleBinPage.confirmRestoreLocation();

            // Navigate to Facilities Management and confirm the Facility is
            // back in the Active grid.
            locationsPage.visitFacilities();
            locationsPage.verifyFacilityPresent(facility.code);
        }
    );
});
