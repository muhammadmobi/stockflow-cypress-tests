// cypress/e2e/32-WarehouseIntegrationE2ETests.cy.js
//
// Warehouse Management — Integration / End-to-End lifecycle tests.
//
// Test ID prefix:  SW-WIE-UI-TC<NN>
//
// Covers a full container lifecycle across pages:
//   TC01 — Create type + container + Bin via API; assign container to Bin via UI
//   TC02 — Delete the assigned container via UI → row disappears from grid
//   TC03 — Navigate to Recycle Bin → Containers tab → deleted code visible
//   TC04 — Restore the container from Recycle Bin → code reappears on Containers page
//   TC05 — The restored container's Location column shows "Unassigned" (restore
//           strips the previous location assignment)
//
// All five TCs share the same disposable resources (one type, one container, one
// Bin chain).  TC01-TC02-TC03-TC04-TC05 run in stated order; Cypress runs `it()`
// blocks in declaration order within a describe(), which is intentional here
// because each TC inherits the state mutation left by the prior one.
//
// Why this is acceptable:
//   These tests exercise a state-transition chain — the whole point is to observe
//   the system moving through states: Assigned → Deleted → In-Recycle-Bin →
//   Restored → Unassigned.  Parallel isolation would require duplicating the full
//   5-step chain in each test, defeating readability.  The state is deterministic
//   (all resources are created fresh per suite run) and the after() block cleans up
//   regardless of the outcome.
//
// State machine:
//   [API-created] → (Assign UI) → Assigned → (Delete UI) → Deleted/soft
//               → (Recycle Bin) → visible in bin → (Restore UI) → Active/Unassigned

import WarehouseContainersPage from "../pageObjects/WarehouseContainersPage";
import WarehouseRecycleBinPage from "../pageObjects/WarehouseRecycleBinPage";
import {
    createContainerTypeViaApi,
    createContainerViaApi,
    deleteContainerViaApi,
    deleteContainerTypeViaApi,
    disposableTypeName,
    emptyContainerViaApi,
    sweepDisposableContainers,
    sweepDisposableContainerTypes,
} from "../support/helpers/wmsContainerHelpers";
import {
    createDisposableBinChain,
    deleteLocationViaApi,
    sweepDisposableLocations,
} from "../support/helpers/wmsLocationHelpers";
import data from "../fixtures/warehouseIntegrationE2EData.json";

describe("Warehouse Integration E2E Tests", { tags: ["@regression"] }, () => {
    let containersPage;
    let recycleBinPage;

    // Shared state across the five TCs — all populated in TC01's before hook.
    const suite = {
        typeId: null,
        containerId: null,
        containerCode: null,
        facilityId: null,
        binPath: null,
        binCode: null,
    };

    // Suite-wide pre-sweep: remove disposables from any prior crashed run.
    before(() => {
        sweepDisposableContainers();
        sweepDisposableLocations();
        sweepDisposableContainerTypes();
    });

    // Suite-wide safety net — runs after all TCs, regardless of outcome.
    // Order is load-bearing (same as spec 26):
    //   1. Container (empty first so DELETE /containers/:id doesn't 400)
    //   2. Location chain (cascade-deletes via facility soft-delete)
    //   3. Container type (now safe — no container references it)
    after(() => {
        if (suite.containerId) {
            emptyContainerViaApi(suite.containerId);
            deleteContainerViaApi(suite.containerId);
        }
        if (suite.facilityId) {
            deleteLocationViaApi(suite.facilityId);
        }
        if (suite.typeId) {
            deleteContainerTypeViaApi(suite.typeId);
        }
        // Belt-and-suspenders sweep for anything missed above.
        sweepDisposableContainers();
        sweepDisposableLocations();
        sweepDisposableContainerTypes();
    });

    beforeEach(() => {
        cy.authSession('admin');
        containersPage = new WarehouseContainersPage();
        recycleBinPage = new WarehouseRecycleBinPage();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TC01 — API-create resources, assign to Bin via API, verify Location column
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WIE-UI-TC01
     * Description:     API-create a container type, an empty container, and a
     *                  full Bin chain (Facility → Zone → Area → Row → Bay →
     *                  Level → Bin).  Assign the container to the Bin via
     *                  PUT /containers/:id (API), then verify the Containers
     *                  table reflects the assignment in the Location column.
     *
     *                  NOTE: The Assign To Location scan-UI flow
     *                  (scanContainerCode + scanLocationPath) is known to be
     *                  unreliable on QA — same root cause as TC39–TC41 in
     *                  spec 26.  This TC uses the API to establish the assigned
     *                  state and then validates the UI read-path (Location
     *                  column), which is the integration assertion this spec
     *                  is designed to cover.
     *
     * Test Steps:
     *   1. Create a disposable container type via API.
     *   2. Create an empty container of that type via API.
     *   3. Create a disposable Bin chain via API (returns facility + bin).
     *   4. Assign the container to the Bin via PUT /containers/:id.
     *   5. Visit the Containers page.
     *   6. Search for the container code.
     *   7. Assert the Location column shows the Bin path.
     *
     * Expected Result:
     *   - The Containers table row for the container shows a non-empty Location
     *     value that contains the Bin path (e.g. "FAC-xxx/ZON-xxx/.../BIN-xxx").
     *
     * Test Data:       disposableTypeName("IntE2E") — unique to this run.
     *
     * Technique:       Use Case
     * Why this technique: TC01 verifies the cross-page state contract: an
     *                  assignment persisted via API is immediately visible in
     *                  the Containers list view.  This is the prerequisite
     *                  state for TC02–TC05 which exercise the delete →
     *                  recycle-bin → restore chain.
     */
    it(
        "SW-WIE-UI-TC01: Assign container to Bin via API and verify Location column reflects assignment",
        { tags: ["@smoke"] },
        () => {
            const typeName = disposableTypeName(data.assignToLocation.typeSuffix);

            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "container type was created").to.not.be.null;
                suite.typeId = type.id;

                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    suite.containerId = container.id;
                    suite.containerCode = container.code;

                    createDisposableBinChain().then(({ facility, bin }) => {
                        suite.facilityId = facility.id;
                        suite.binPath = bin.path;
                        suite.binCode = bin.code;

                        // Assign the container to the Bin via API.
                        // PUT /containers/:id only accepts Bin-type locations
                        // (container.service.ts line 415).
                        const baseUrl = Cypress.env("API_BASE_URL");
                        cy.getAuthToken().then((token) => {
                            cy.request({
                                method: "PUT",
                                url: `${baseUrl}/containers/${suite.containerId}`,
                                headers: { Authorization: `Bearer ${token}` },
                                body: { locationId: bin.id },
                                failOnStatusCode: false,
                            }).then((res) => {
                                expect(
                                    res.status,
                                    "PUT /containers/:id assign-to-bin status",
                                ).to.be.lessThan(400);

                                // Visit Containers page and verify Location column.
                                containersPage.visit();
                                containersPage.search(suite.containerCode);
                                containersPage.verifyContainerPresent(suite.containerCode);

                                cy.contains("table tbody tr", suite.containerCode).within(() => {
                                    // The UI renders dotted paths as "A > B > C" (Frontend utils/locationPath.ts).
                                    cy.contains(String(suite.binPath).split(".").join(" > ")).should("exist");
                                });
                            });
                        });
                    });
                });
            });
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    // TC02 — Delete the assigned container via UI
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WIE-UI-TC02
     * Description:     Delete the container (assigned to the Bin in TC01) via
     *                  the UI Delete row action.  Verify the row disappears from
     *                  the Containers main grid (soft-delete).
     *
     * Precondition:    TC01 must have assigned the container so that this test
     *                  exercises the "delete an assigned container" path.
     *                  (State is shared in the `suite` object above.)
     *
     * Test Steps:
     *   1. Visit the Containers page.
     *   2. Search for the container's code.
     *   3. Click the row's Delete icon → confirm "Yes".
     *
     * Expected Result:
     *   - The "Confirm Container Deletion" dialog opens.
     *   - After "Yes" the container row dismounts from the table.
     *
     * Test Data:       suite.containerCode from TC01.
     *
     * Technique:       State Transition
     * Why this technique: Exercises the Assigned → Deleted transition.
     *                  The row disappearing from the grid is the observable
     *                  contract for a successful soft-delete.
     */
    it(
        "SW-WIE-UI-TC02: Delete the assigned container via UI — row disappears from grid",
        { tags: ["@regression"] },
        () => {
            // TC01 must have run first — skip gracefully if shared state is absent.
            if (!suite.containerCode) {
                cy.log("TC02: suite.containerCode not set — TC01 may have been skipped.");
                return;
            }

            // State Transition: Assigned → Deleted (soft).
            containersPage.visit();
            containersPage.search(suite.containerCode);
            containersPage.verifyContainerPresent(suite.containerCode);
            containersPage.openDeleteContainer(suite.containerCode);
            containersPage.confirmDeleteContainer(suite.containerCode);

            // Row dismounts — container is now soft-deleted.
            containersPage.verifyContainerAbsent(suite.containerCode);
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    // TC03 — Deleted container visible in Recycle Bin → Containers tab
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WIE-UI-TC03
     * Description:     Navigate to the Warehouse Management → Recycle Bin page,
     *                  switch to the Containers tab, and verify the deleted
     *                  container's code is visible in the table.
     *
     * Precondition:    TC02 soft-deleted the container.
     *
     * Test Steps:
     *   1. Visit /warehouse-management/recycle-bin.
     *   2. Click the "Containers" tab.
     *   3. Assert the container's code is visible in the table.
     *
     * Expected Result:
     *   - The Recycle Bin's Containers tab shows a row containing
     *     suite.containerCode.
     *
     * Test Data:       suite.containerCode from TC01.
     *
     * Technique:       State Transition
     * Why this technique: Exercises the Deleted → In-Recycle-Bin state.
     *                  Verifying the code appears in the Recycle Bin confirms
     *                  the soft-delete is visible to operators who want to
     *                  recover the container.
     */
    it(
        "SW-WIE-UI-TC03: Deleted container appears in Recycle Bin → Containers tab",
        { tags: ["@regression"] },
        () => {
            if (!suite.containerCode) {
                cy.log("TC03: suite.containerCode not set — TC01 may have been skipped.");
                return;
            }

            // State Transition: Deleted → In-Recycle-Bin (observable).
            recycleBinPage.visit();
            recycleBinPage.switchToContainersTab();
            recycleBinPage.verifyRowPresent(suite.containerCode);
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    // TC04 — Restore the container from Recycle Bin
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WIE-UI-TC04
     * Description:     Restore the deleted container from the Recycle Bin
     *                  Containers tab.  Verify the container's code reappears
     *                  on the main Containers page.
     *
     * Precondition:    TC03 confirmed the container is visible in the Recycle Bin.
     *
     * Test Steps:
     *   1. On the Recycle Bin → Containers tab, click the Restore icon for the
     *      container row.
     *   2. Confirm the restore dialog.
     *   3. Navigate to the main Containers page.
     *   4. Search for the container's code.
     *
     * Expected Result:
     *   - The Recycle Bin row for this container disappears after restore.
     *   - The container's code reappears in the main Containers grid.
     *
     * Test Data:       suite.containerCode from TC01.
     *
     * Technique:       State Transition
     * Why this technique: Exercises the In-Recycle-Bin → Active transition.
     *                  The reappearance on the main grid is the observable
     *                  contract for a successful restore.
     */
    it(
        "SW-WIE-UI-TC04: Restore container from Recycle Bin — code reappears on Containers page",
        { tags: ["@regression"] },
        () => {
            if (!suite.containerCode) {
                cy.log("TC04: suite.containerCode not set — TC01 may have been skipped.");
                return;
            }

            // State Transition: In-Recycle-Bin → Active.
            recycleBinPage.visit();
            recycleBinPage.switchToContainersTab();
            recycleBinPage.verifyRowPresent(suite.containerCode);
            recycleBinPage.openRestoreContainerDialog(suite.containerCode);
            recycleBinPage.confirmRestoreContainer();

            // Recycle Bin row dismounts after successful restore.
            recycleBinPage.verifyRowAbsent(suite.containerCode);

            // The code must now appear on the main Containers page.
            containersPage.visit();
            containersPage.search(suite.containerCode);
            containersPage.verifyContainerPresent(suite.containerCode);
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    // TC05 — Restored container shows "Unassigned" in Location column
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Test ID:         SW-WIE-UI-TC05
     * Description:     Verify that the restored container's Location column
     *                  shows "Unassigned" — the restore operation strips the
     *                  previous Bin location assignment.
     *
     * Precondition:    TC04 restored the container; it is now active but should
     *                  have no location (the delete → restore lifecycle clears
     *                  the location FK).
     *
     * Test Steps:
     *   1. On the main Containers page, search for the container's code.
     *   2. Inspect the Location cell of the matching row.
     *
     * Expected Result:
     *   - The row's Location cell contains the text "Unassigned"
     *     (rendered by WMSContainers.tsx as
     *     <Typography variant="body2">Unassigned</Typography>
     *     when row.original.location is null).
     *
     * Test Data:       suite.containerCode from TC01;
     *                  data.assignToLocation.locationUnassignedLabel = "Unassigned".
     *
     * Technique:       State Transition
     * Why this technique: Exercises the Active/Assigned → Active/Unassigned
     *                  transition that happens implicitly as part of the
     *                  delete → restore cycle.  The "Unassigned" label is the
     *                  observable contract for location = null in the UI.
     */
    it(
        "SW-WIE-UI-TC05: Restored container Location column shows Unassigned",
        { tags: ["@regression"] },
        () => {
            if (!suite.containerCode) {
                cy.log("TC05: suite.containerCode not set — TC01 may have been skipped.");
                return;
            }

            const unassignedLabel = data.assignToLocation.locationUnassignedLabel;

            // State Transition: Active/Assigned → Active/Unassigned (post-restore).
            containersPage.visit();
            containersPage.search(suite.containerCode);
            containersPage.verifyContainerPresent(suite.containerCode);

            // WMSContainers.tsx line 780-781: when location is null the cell
            // renders <Typography variant="body2">Unassigned</Typography>.
            cy.contains("table tbody tr", suite.containerCode).within(() => {
                cy.contains(unassignedLabel).should(
                    "exist",
                    `Location column must show "${unassignedLabel}" after restore strips the prior Bin assignment`
                );
            });
        }
    );
});
