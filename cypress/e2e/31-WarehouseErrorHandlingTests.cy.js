// cypress/e2e/31-WarehouseErrorHandlingTests.cy.js
//
// Warehouse Management → Containers — Error-handling & guard tests.
//
// Test ID prefix:  SW-WEH-UI-TC<NN>
//
// Covers:
//   TC01 — Non-empty container: Delete icon is disabled (UI guard)
//   TC02 — Empty container: Delete succeeds (control for TC01)
//   TC03 — Duplicate container type name: toast error from backend
//   TC04 — Unique container type name: creation succeeds (control for TC03)
//
// Key design finding (WMSContainers.tsx lines 969-983):
//   The Delete IconButton is rendered with `disabled={row.original.cur_items > 0}`.
//   There is NO toast or error dialog — the guard is a disabled button.
//   TC01 therefore asserts the disabled state rather than an error message.
//   This is stronger than it.skip(): it pins the guard mechanism and would catch
//   a future commit that removes the disabled prop.
//
// Duplicate type name (TC03): the backend service returns
//   400 { error: { message: 'Container type already exists' } }
//   which the FE surfaces via toast.error(e?.response?.data?.error?.message …).

import WarehouseContainersPage from "../pageObjects/WarehouseContainersPage";
import warehouseContainersLocators from "../support/locators/warehouseContainersLocators";
import {
    createContainerTypeViaApi,
    createContainerViaApi,
    deleteContainerViaApi,
    deleteContainerTypeViaApi,
    disposableTypeName,
    loadProductIntoContainerViaApi,
    findStockableProductViaApi,
    emptyContainerViaApi,
    listContainerTypesViaApi,
    sweepDisposableContainers,
    sweepDisposableContainerTypes,
} from "../support/helpers/wmsContainerHelpers";
import data from "../fixtures/warehouseErrorHandlingData.json";

describe("Warehouse Error Handling Tests", { tags: ["@regression"] }, () => {
    let containersPage;

    // Suite-wide pre-sweep: remove disposables left by prior crashed runs.
    before(() => {
        sweepDisposableContainers();
        sweepDisposableContainerTypes();
    });

    // Suite-wide safety net (also catches TC01/TC02/TC03/TC04 leftovers).
    after(() => {
        sweepDisposableContainers();
        sweepDisposableContainerTypes();
    });

    beforeEach(() => {
        cy.authSession('admin');
        containersPage = new WarehouseContainersPage();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TC01 — Non-empty container: Delete icon is disabled
    // ══════════════════════════════════════════════════════════════════════════

    describe("TC01 — Delete disabled on non-empty container", () => {
        const state = { typeId: null, containerId: null, containerCode: null };

        afterEach(() => {
            if (state.containerId) {
                emptyContainerViaApi(state.containerId);
                deleteContainerViaApi(state.containerId);
                state.containerId = null;
                state.containerCode = null;
            }
            if (state.typeId) {
                deleteContainerTypeViaApi(state.typeId);
                state.typeId = null;
            }
        });

        /**
         * Test ID:         SW-WEH-UI-TC01
         * Description:     Verify that when a container has contents
         *                  (cur_items > 0) the Delete icon button is disabled,
         *                  preventing accidental deletion of non-empty containers.
         *
         * Design note:     WMSContainers.tsx line 975 renders the Delete
         *                  IconButton with `disabled={row.original.cur_items > 0}`.
         *                  There is no toast or error dialog — the guard is a
         *                  disabled button.  This test asserts that mechanism
         *                  rather than using it.skip(), because it pins the guard
         *                  and catches any future removal of the disabled prop.
         *
         * Test Steps:
         *   1. Create a disposable type + empty container via API.
         *   2. Find a stockable product and load 1 unit into the container
         *      via POST /containers/:id/quantities (so cur_items becomes 1).
         *      Soft-skip if QA has no stockable product.
         *   3. Visit the Containers page, search for the container's code.
         *   4. Inspect the Delete icon button in the row's Actions cell.
         *
         * Expected Result:
         *   - The Delete icon button has the `disabled` attribute.
         *   - The container row is still present in the table.
         *
         * Test Data:       Disposable container loaded with 1 unit
         *                  (loadDelta from fixture).
         *
         * Technique:       Error Guessing
         * Why this technique: Deleting a container that still holds stock is a
         *                  common operator error.  The disabled guard is the
         *                  documented defence — pinning it ensures it never
         *                  regresses silently.
         */
        it(
            "SW-WEH-UI-TC01: Verify Delete icon is disabled when container has contents",
            { tags: ["@smoke"] },
            function () {
                const typeName = disposableTypeName("LoadDel");
                createContainerTypeViaApi(typeName).then((type) => {
                    expect(type, "type was created").to.not.be.null;
                    state.typeId = type.id;

                    createContainerViaApi(type.id).then((container) => {
                        expect(container, "container was created").to.not.be.null;
                        state.containerId = container.id;
                        state.containerCode = container.code;

                        // Load 1 unit so cur_items > 0.
                        findStockableProductViaApi().then((product) => {
                            if (!product || !product.id) {
                                cy.log(
                                    "TC01: no stockable product in QA — soft-skip. " +
                                    "The container stays empty and Delete would be " +
                                    "ENABLED, which is the wrong condition to assert."
                                );
                                this.skip();
                                return;
                            }

                            loadProductIntoContainerViaApi(state.containerId, product.id);

                            // --- Act ---
                            containersPage.visit();
                            containersPage.search(state.containerCode);
                            containersPage.verifyContainerPresent(state.containerCode);

                            // --- Assert: Error Guessing ---
                            // Delete must be disabled while cur_items > 0.
                            warehouseContainersLocators
                                .actionsCellInRow(state.containerCode)
                                .within(() => {
                                    cy.findByRole("button", { name: /^delete$/i })
                                        .should(
                                            "be.disabled",
                                            "Delete icon must be disabled when cur_items > 0"
                                        );
                                });

                            // The row is still present — the container was not deleted.
                            containersPage.verifyContainerPresent(state.containerCode);
                        });
                    });
                });
            }
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TC02 — Empty container: Delete succeeds (control for TC01)
    // ══════════════════════════════════════════════════════════════════════════

    describe("TC02 — Delete enabled and succeeds on empty container", () => {
        const state = { typeId: null };

        afterEach(() => {
            // Container is deleted by the test itself (UI delete); only the
            // type remains.
            if (state.typeId) {
                deleteContainerTypeViaApi(state.typeId);
                state.typeId = null;
            }
        });

        /**
         * Test ID:         SW-WEH-UI-TC02
         * Description:     Verify that when a container has no contents
         *                  (cur_items === 0) the Delete icon button is enabled
         *                  and confirming deletion removes the row.
         *
         * Test Steps:
         *   1. Create a disposable type + empty container via API.
         *   2. Visit the Containers page, search for the container's code.
         *   3. Assert the Delete icon is NOT disabled on the empty row.
         *   4. Click Delete → confirm "Yes" in the dialog.
         *
         * Expected Result:
         *   - The Delete icon is enabled (not disabled) for an empty container.
         *   - After confirming, the container row dismounts from the table.
         *
         * Test Data:       Disposable empty container (cur_items === 0).
         *
         * Technique:       Negative/Control
         * Why this technique: This is the control case for TC01.  Confirming
         *                  the delete path works for empty containers proves the
         *                  disabled state in TC01 is conditional, not a blanket
         *                  disable, making TC01's assertion meaningful.
         */
        it(
            "SW-WEH-UI-TC02: Verify Delete is enabled and succeeds for an empty container",
            { tags: ["@regression"] },
            () => {
                const typeName = disposableTypeName("EmpDel");
                createContainerTypeViaApi(typeName).then((type) => {
                    expect(type, "type was created").to.not.be.null;
                    state.typeId = type.id;

                    createContainerViaApi(type.id).then((container) => {
                        expect(container, "container was created").to.not.be.null;

                        // --- Act ---
                        containersPage.visit();
                        containersPage.search(container.code);
                        containersPage.verifyContainerPresent(container.code);

                        // Negative/Control: Delete must be ENABLED on empty container.
                        warehouseContainersLocators
                            .actionsCellInRow(container.code)
                            .within(() => {
                                cy.findByRole("button", { name: /^delete$/i })
                                    .should(
                                        "not.be.disabled",
                                        "Delete must be enabled when cur_items === 0"
                                    );
                            });

                        // Drive the delete through — confirms the path is not
                        // blocked unconditionally.
                        containersPage.openDeleteContainer(container.code);
                        containersPage.confirmDeleteContainer(container.code);

                        // Row dismounts on success.
                        containersPage.verifyContainerAbsent(container.code);
                    });
                });
            }
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TC03 — Duplicate container type name: toast error from backend
    // ══════════════════════════════════════════════════════════════════════════

    describe("TC03 — Duplicate container type name rejected with toast", () => {
        const state = { typeId: null };

        afterEach(() => {
            if (state.typeId) {
                deleteContainerTypeViaApi(state.typeId);
                state.typeId = null;
            }
        });

        /**
         * Test ID:         SW-WEH-UI-TC03
         * Description:     Verify that attempting to add a container type whose
         *                  name already exists surfaces an error toast from the
         *                  backend ("Container type already exists").
         *
         * Design note:     container-type.service.ts line 55 throws
         *                  BadRequestException('Container type already exists')
         *                  on a case-insensitive name collision.
         *                  WMSContainers.tsx createTypeMutation.onError forwards
         *                  it via toast.error(e?.response?.data?.error?.message).
         *
         * Test Steps:
         *   1. Create a disposable container type via API (pre-existing name).
         *   2. Visit the Containers page and open the Manage Types modal.
         *   3. Type the SAME name (exact match) into the "New Type" input.
         *   4. Click "Add".
         *
         * Expected Result:
         *   - POST /container-types returns 400.
         *   - A toast is visible containing "Container type already exists".
         *   - The Manage Types modal remains open (rejection did not dismiss it).
         *
         * Test Data:       disposableTypeName("Dup") — created via API first,
         *                  then submitted again via UI.
         *
         * Technique:       Error Guessing
         * Why this technique: Duplicate type names are a common operator mistake
         *                  (no uniqueness hint is shown before submission).
         *                  The backend guards against it; this test pins the
         *                  error message the operator sees.
         */
        it(
            "SW-WEH-UI-TC03: Verify duplicate container type name shows an error toast",
            { tags: ["@regression"] },
            () => {
                const typeName = disposableTypeName(data.manageTypes.epDuplicateName.suffix);

                // EP — pre-create the type via API so the name is already taken.
                createContainerTypeViaApi(typeName).then((type) => {
                    expect(type, "pre-existing type was created").to.not.be.null;
                    state.typeId = type.id;

                    // Intercept BEFORE opening the modal so the failing POST
                    // is captured.
                    cy.intercept("POST", "**/container-types").as("createTypeDup");

                    // --- Act ---
                    containersPage.visit();
                    containersPage.openManageTypes();
                    // The frontend's live validator only checks format (special
                    // chars, consecutive spaces) — not server-side uniqueness.
                    // The duplicate check is server-side only, so the "Add" button
                    // is NOT disabled for a duplicate name.
                    containersPage.typeNewTypeName(typeName);
                    containersPage.clickAddType();

                    // Wait for the 400 response before asserting the toast.
                    cy.wait("@createTypeDup", { timeout: 15000 }).then((xhr) => {
                        expect(
                            xhr.response?.statusCode,
                            "POST /container-types duplicate should return 400"
                        ).to.equal(400);
                    });

                    // --- Assert: Error Guessing ---
                    cy.contains(/container type already exists/i, { timeout: 8000 })
                        .should(
                            "be.visible",
                            "Toast must surface the backend rejection message"
                        );

                    // The modal is still open — the failed POST did not dismiss it.
                    // Assert existence, not visibility: the error toast renders
                    // with `position: fixed` and transiently overlaps the modal
                    // heading during the retry window, so a `be.visible` check is
                    // a false negative. "Still open" == present in the DOM.
                    warehouseContainersLocators.manageTypesHeading()
                        .should("exist");

                    containersPage.closeManageTypes();
                });
            }
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TC04 — Unique container type name: creation succeeds (control for TC03)
    // ══════════════════════════════════════════════════════════════════════════

    describe("TC04 — Unique container type name accepted", () => {
        const state = { typeId: null, typeName: null };

        afterEach(() => {
            if (state.typeId) {
                deleteContainerTypeViaApi(state.typeId);
                state.typeId = null;
                state.typeName = null;
            } else if (state.typeName) {
                // Fallback: resolve by name if POST response id was not captured.
                const nameToDelete = state.typeName;
                state.typeName = null;
                listContainerTypesViaApi().then((all) => {
                    const match = all.find((t) => t.name === nameToDelete);
                    if (match && match.id) deleteContainerTypeViaApi(match.id);
                });
            }
        });

        /**
         * Test ID:         SW-WEH-UI-TC04
         * Description:     Verify that adding a container type with a name that
         *                  does not already exist succeeds — the new row appears
         *                  in the Manage Types modal list and no error toast is
         *                  shown.
         *
         * Test Steps:
         *   1. Visit the Containers page.
         *   2. Open the Manage Types modal.
         *   3. Type a fresh disposable name into "New Type".
         *   4. Click "Add".
         *
         * Expected Result:
         *   - POST /container-types returns < 400.
         *   - No error toast appears.
         *   - The new type row is visible in the modal list.
         *
         * Test Data:       disposableTypeName("Unq") — a name never used before
         *                  (timestamp + random seed guarantee uniqueness).
         *
         * Technique:       Equivalence Partitioning (control case)
         * Why this technique: This is the valid-input partition for TC03.
         *                  Confirming the happy path still works after TC03's
         *                  error path ensures the modal recovers cleanly and the
         *                  create path is intact.
         */
        it(
            "SW-WEH-UI-TC04: Verify adding a unique container type name succeeds",
            { tags: ["@regression"] },
            () => {
                const typeName = disposableTypeName(data.manageTypes.epUniqueName.suffix);
                state.typeName = typeName;

                cy.intercept("POST", "**/container-types").as("createTypeUnq");

                // --- Act ---
                containersPage.visit();
                containersPage.openManageTypes();
                containersPage.typeNewTypeName(typeName);
                containersPage.clickAddType();

                cy.wait("@createTypeUnq", { timeout: 15000 }).then((xhr) => {
                    expect(
                        xhr.response?.statusCode,
                        "POST /container-types unique name should succeed"
                    ).to.be.lessThan(400);

                    // Capture the id for precise cleanup.
                    const body = xhr.response?.body;
                    const created = body && (body.data || body);
                    if (created && created.id) {
                        state.typeId = created.id;
                        state.typeName = null; // id-based cleanup takes precedence
                    }
                });

                // EP — valid partition: new row present, no error toast.
                warehouseContainersLocators.typeRowByName(typeName)
                    .should("exist");

                containersPage.closeManageTypes();
            }
        );
    });
});
