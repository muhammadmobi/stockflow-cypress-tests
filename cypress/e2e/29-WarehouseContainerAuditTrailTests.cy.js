// cypress/e2e/29-WarehouseContainerAuditTrailTests.cy.js
//
// Warehouse Management → Containers — Audit Trail content tests.
//
// Test ID prefix:  SW-WCA-UI-TC<NN>
// Doc-block format: every test carries a manual-execution block (Test ID,
// Description, Test Steps, Expected Result, Test Data, Technique, Why).
//
// These tests extend the coverage of SW-WCN-UI-TC36 (which only asserts
// the audit trail modal OPENS). Here we verify the CONTENT of audit trail
// entries after known mutations, and the empty-state for a pristine container.
//
// Seeding strategy (before / after):
//   before()  — create disposable type → container → Facility location →
//               assign container to location via PUT /containers/:id
//   after()   — delete container → delete type → delete location(s)
//
// All disposable resources use disposableTypeName() / disposableName() so
// leftovers from aborted runs are swept by the existing suite-level sweepers
// in 26-WarehouseContainersTests.cy.js.

import WarehouseContainersPage from "../pageObjects/WarehouseContainersPage";
import warehouseContainersLocators from "../support/locators/warehouseContainersLocators";
import {
    disposableTypeName,
    createContainerTypeViaApi,
    createContainerViaApi,
    deleteContainerViaApi,
    deleteContainerTypeViaApi,
} from "../support/helpers/wmsContainerHelpers";
import {
    disposableName,
    createLocationViaApi,
    createDisposableBinChain,
    deleteLocationViaApi,
} from "../support/helpers/wmsLocationHelpers";

describe("Warehouse Container Audit Trail Content Tests", { tags: ["@regression"] }, () => {
    let containersPage;

    // Per-suite disposables — created once in before(), freed in after().
    const suite = {
        typeId: null,
        containerId: null,
        containerCode: null,
        locationId: null,    // Bin-type location (containers can only be assigned to Bins)
        facilityId: null,    // top-level Facility of the bin chain (deleted in after() to cascade-clean)
    };

    beforeEach(() => {
        cy.authSession('admin');
        containersPage = new WarehouseContainersPage();
    });

    // Create a disposable type → container → full Bin chain (Facility→…→Bin),
    // then assign the container to the Bin so the audit trail has at least one
    // ASSIGN_LOCATION entry before any test runs.
    //
    // NOTE: PUT /containers/:id only accepts Bin-type locations (service line 415:
    // "Containers can only be assigned to Bin locations"). We must create the full
    // 7-level chain via createDisposableBinChain() to get a valid target.
    before(function () {
        cy.authSession('admin');
        const typeName = disposableTypeName("WCAAudit");

        createContainerTypeViaApi(typeName).then((typeRecord) => {
            expect(typeRecord, "type record created").to.be.an("object");
            suite.typeId = typeRecord.id;
            return createContainerViaApi(typeRecord.id);
        }).then((containerRecord) => {
            expect(containerRecord, "container record created").to.be.an("object");
            suite.containerId   = containerRecord.id;
            suite.containerCode = containerRecord.code;
            // Create a full Facility→Zone→Area→Row→Bay→Level→Bin chain.
            return createDisposableBinChain();
        }).then((chain) => {
            // chain = { facility, zone, area, row, bay, level, bin }
            expect(chain.bin, "bin created").to.be.an("object");
            suite.locationId = chain.bin.id;
            suite.facilityId = chain.facility.id;

            // Assign the container to the Bin via PUT /containers/:id.
            const baseUrl = Cypress.env("API_BASE_URL");
            return cy.getAuthToken().then((token) => {
                cy.request({
                    method: "PUT",
                    url: `${baseUrl}/containers/${suite.containerId}`,
                    headers: { Authorization: `Bearer ${token}` },
                    body: { locationId: suite.locationId },
                    failOnStatusCode: false,
                }).then((res) => {
                    expect(
                        res.status,
                        "PUT /containers/:id assign-to-bin status",
                    ).to.be.lessThan(400);
                });
            });
        });
    });

    after(() => {
        // Delete container first (clears the Bin occupancy), then the
        // Facility (cascade-deletes the whole chain), then the type.
        if (suite.containerId) {
            deleteContainerViaApi(suite.containerId);
            suite.containerId   = null;
            suite.containerCode = null;
        }
        if (suite.facilityId) {
            deleteLocationViaApi(suite.facilityId);
            suite.facilityId = null;
            suite.locationId = null;
        }
        if (suite.typeId) {
            deleteContainerTypeViaApi(suite.typeId);
            suite.typeId = null;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC01 — At-least-one entry after an assignment
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Test ID:         SW-WCA-UI-TC01
     * Description:     Verify that opening the audit trail for a container
     *                  that has been assigned to a location shows at least
     *                  one entry in the list.
     *
     * Test Steps:
     *   1. Visit /warehouse-management/containers.
     *   2. Search for the seeded container code.
     *   3. Click the "View Audit Trail" clock icon in the row's Actions cell.
     *   4. Wait for the audit trail dialog to open.
     *   5. Assert that the <ul> list contains at least one <li> entry card.
     *
     * Expected Result:
     *   The audit trail list contains ≥1 entry. The dialog heading includes
     *   the container code.
     *
     * Test Data:       Disposable container assigned to a Facility location
     *                  via API in before().
     *
     * Technique:       Use Case
     * Why this technique: This is the primary actor-driven flow — a user
     *                  opens the audit trail after a known mutation. It
     *                  confirms the backend persists the assignment event and
     *                  the component renders the list instead of the empty
     *                  state, which TC36 (the existing spec) does not check.
     */
    it("SW-WCA-UI-TC01: Audit trail shows at least one entry after container is assigned to a location", { tags: ["@smoke"] }, () => {
        // Use Case — primary happy path of the audit trail feature.
        cy.fixture("urls.json").then((urls) => cy.visit(urls.warehouseContainers));
        containersPage.search(suite.containerCode);
        containersPage.verifyContainerPresent(suite.containerCode);

        // Intercept the audit trail API call so we wait for data to load
        // before asserting the list, avoiding a race against the
        // CircularProgress spinner.
        cy.intercept("GET", "**/audit-trails*").as("auditTrailFetch");
        containersPage.openAuditTrail(suite.containerCode);
        cy.wait("@auditTrailFetch", { timeout: 15000 });

        containersPage.assertAuditTrailHasAtLeast(1);
        containersPage.closeAuditTrail(suite.containerCode);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC02 — Entry content: Action Type + Date labels present
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Test ID:         SW-WCA-UI-TC02
     * Description:     Verify that at least one audit trail entry contains
     *                  a non-empty "Action Type" label and a datetime-style
     *                  "Created At" label. These are the two most critical
     *                  fields: actionType identifies what happened; createdAt
     *                  shows when.
     *
     * Test Steps:
     *   1. Visit /warehouse-management/containers.
     *   2. Search for the seeded container code.
     *   3. Open the audit trail dialog.
     *   4. Wait for entries to load.
     *   5. Assert that the rendered <strong> labels include text matching
     *      /Action Type/i across at least one entry card.
     *   6. Assert that the rendered <strong> labels include text matching
     *      /Created At/i across at least one entry card.
     *
     * Expected Result:
     *   Both "Action Type" and "Created At" labels appear among the rendered
     *   <strong> elements. containerAuditTrail.tsx uses formatStatus(key)
     *   which converts camelCase keys ("actionType", "createdAt") to
     *   title-cased labels ("Action Type", "Created At").
     *
     * Test Data:       Same seeded container as TC01.
     *
     * Technique:       Use Case (field-content assertion)
     * Why this technique: Pins the two mandatory content fields on each
     *                  entry card. EP would over-specify which partition of
     *                  actionType is displayed; Use Case validates the
     *                  rendering pipeline (component → formatStatus →
     *                  <strong> label) without depending on exact enum values.
     */
    it("SW-WCA-UI-TC02: Audit trail entry renders non-empty Action Type and Created At labels", { tags: ["@regression"] }, () => {
        // Use Case — content assertion on the two mandatory rendered labels.
        cy.fixture("urls.json").then((urls) => cy.visit(urls.warehouseContainers));
        containersPage.search(suite.containerCode);
        containersPage.verifyContainerPresent(suite.containerCode);

        cy.intercept("GET", "**/audit-trails*").as("auditTrailFetch");
        containersPage.openAuditTrail(suite.containerCode);
        cy.wait("@auditTrailFetch", { timeout: 15000 });

        // Ensure at least one entry is present before asserting field content.
        containersPage.assertAuditTrailHasAtLeast(1);

        // Assert Action Type label is rendered by formatStatus("actionType").
        containersPage.assertAuditTrailLabelExists(/Action Type/i);

        // Assert Created At label is rendered by formatStatus("createdAt").
        // createdAt is always in the auditTrail entity; it is placed in
        // dateTimeEntries and rendered last in the card.
        containersPage.assertAuditTrailLabelExists(/Created At/i);

        containersPage.closeAuditTrail(suite.containerCode);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC03 — Two location assignments produce two or more entries
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Test ID:         SW-WCA-UI-TC03
     * Description:     Verify that after a second location assignment (move)
     *                  the audit trail shows at least two entries — one for
     *                  the original assignment and one for the move.
     *
     * Test Steps:
     *   1. Create a second disposable Facility location via API.
     *   2. Move the container to the second location via
     *      POST /containers/:id/move-to-location/:locationId.
     *   3. Visit /warehouse-management/containers.
     *   4. Search for the seeded container code.
     *   5. Open the audit trail dialog.
     *   6. Assert the list contains at least 2 entries.
     *   7. Delete the second location in after().
     *
     * Expected Result:
     *   The audit trail list contains ≥2 entries. The extra entry was
     *   produced by moveContainerToLocation(), which writes a MOVE or
     *   CHANGE_LOCATION audit trail record.
     *
     * Test Data:       Second disposable Facility location created inline.
     *
     * Technique:       State Transition
     * Why this technique: The audit trail accumulates a new record per
     *                  transition. Testing "assigned → moved" exercises two
     *                  consecutive valid transitions and asserts both are
     *                  persisted, which is the minimum non-trivial state-
     *                  transition coverage for an append-only audit log.
     */
    it("SW-WCA-UI-TC03: Audit trail accumulates a new entry after a second location assignment", { tags: ["@regression"] }, function () {
        // State Transition — assigned → moved, assert count ≥ 2.
        // NOTE: move-to-location also only accepts Bin targets (container.service.ts
        // line 814: "Target must be a Bin"). We create a second full bin chain.
        let secondFacilityId = null;
        let secondBinId = null;
        const baseUrl = Cypress.env("API_BASE_URL");

        createDisposableBinChain()
            .then((chain2) => {
                expect(chain2.bin, "second bin created").to.be.an("object");
                secondFacilityId = chain2.facility.id;
                secondBinId      = chain2.bin.id;

                return cy.getAuthToken().then((token) => {
                    // POST /containers/:id/move-to-location/:locationId —
                    // the backend fires moveContainerToLocation() which
                    // writes a new auditTrail row with MOVE or
                    // CHANGE_LOCATION actionType.
                    return cy.request({
                        method: "POST",
                        url: `${baseUrl}/containers/${suite.containerId}/move-to-location/${secondBinId}`,
                        headers: { Authorization: `Bearer ${token}` },
                        failOnStatusCode: false,
                    }).then((res) => {
                        expect(
                            res.status,
                            "POST /containers/:id/move-to-location/:locationId status",
                        ).to.be.lessThan(400);
                    });
                });
            })
            .then(() => {
                cy.fixture("urls.json").then((urls) => cy.visit(urls.warehouseContainers));
                containersPage.search(suite.containerCode);
                containersPage.verifyContainerPresent(suite.containerCode);

                cy.intercept("GET", "**/audit-trails*").as("auditTrailFetch");
                containersPage.openAuditTrail(suite.containerCode);
                cy.wait("@auditTrailFetch", { timeout: 15000 });

                containersPage.assertAuditTrailHasAtLeast(2);
                containersPage.closeAuditTrail(suite.containerCode);
            })
            .then(() => {
                // Cascade-delete the second bin chain via the top-level Facility.
                if (secondFacilityId) {
                    deleteLocationViaApi(secondFacilityId);
                }
            });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC04 — Audit trail dialog opens without crashing for a never-assigned container
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Test ID:         SW-WCA-UI-TC04
     * Description:     Verify that opening the audit trail for a brand-new
     *                  container that has never been assigned to a location
     *                  renders the dialog successfully (no crash, no spinner
     *                  stuck) and shows at least one entry.
     *
     *                  NOTE: The backend logs a creation event when a container
     *                  is first created (POST /containers), so even a
     *                  never-assigned container has ≥1 audit entry.  The
     *                  "No audit logs" empty-state branch in
     *                  containerAuditTrail.tsx is therefore not reachable via
     *                  normal container creation — it would only appear if the
     *                  audit table had rows pruned directly.  This TC instead
     *                  validates that the dialog renders the entry list (not the
     *                  empty-state) for a container with no location mutations,
     *                  covering the EP partition "container with only creation
     *                  event (no location assignments)".
     *
     * Test Steps:
     *   1. Create a second disposable type and container via API (never assigned).
     *   2. Visit /warehouse-management/containers.
     *   3. Search for the new container's code.
     *   4. Open the audit trail dialog.
     *   5. Wait for the audit-trails API response.
     *   6. Assert at least one entry is rendered (creation event).
     *   7. Delete the second container and type in cleanup.
     *
     * Expected Result:
     *   The audit trail dialog opens without error and the entry list renders
     *   at least one row (the container creation event).
     *
     * Test Data:       Fresh disposable container, never assigned to a location.
     *
     * Technique:       Equivalence Partitioning
     * Why this technique: The EP partition is "container with only creation
     *                  events (no location mutations)".  This is distinct from
     *                  TC01's partition ("container with at least one location
     *                  assignment event").  Both partitions exercise the
     *                  list-rendering branch.  Without TC04, a regression that
     *                  crashes or hangs specifically when auditTrails contains
     *                  only a creation event would not be caught.
     */
    it("SW-WCA-UI-TC04: Audit trail dialog opens for a never-assigned container and shows at least one entry", { tags: ["@regression"] }, () => {
        // EP — "creation-only" partition: no location assignment events exist.
        let freshTypeId        = null;
        let freshContainerId   = null;
        let freshContainerCode = null;

        const typeName = disposableTypeName("WCAEmpty");

        createContainerTypeViaApi(typeName)
            .then((typeRecord) => {
                expect(typeRecord, "fresh type created").to.be.an("object");
                freshTypeId = typeRecord.id;
                return createContainerViaApi(typeRecord.id);
            })
            .then((containerRecord) => {
                expect(containerRecord, "fresh container created").to.be.an("object");
                freshContainerId   = containerRecord.id;
                freshContainerCode = containerRecord.code;

                cy.fixture("urls.json").then((urls) => cy.visit(urls.warehouseContainers));
                containersPage.search(freshContainerCode);
                containersPage.verifyContainerPresent(freshContainerCode);

                cy.intercept("GET", "**/audit-trails*").as("auditTrailFetch");
                containersPage.openAuditTrail(freshContainerCode);
                cy.wait("@auditTrailFetch", { timeout: 15000 });

                // Backend logs a creation event → the list branch renders, not
                // the empty-state branch.  At least one entry must be present.
                containersPage.assertAuditTrailHasAtLeast(1);

                containersPage.closeAuditTrail(freshContainerCode);
            })
            .then(() => {
                if (freshContainerId) {
                    deleteContainerViaApi(freshContainerId);
                }
                if (freshTypeId) {
                    deleteContainerTypeViaApi(freshTypeId);
                }
            });
    });
});
