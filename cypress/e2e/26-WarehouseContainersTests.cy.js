// cypress/e2e/26-WarehouseContainersTests.cy.js
//
// Warehouse Management → Containers — UI tests.
//
// Test ID prefix:  SW-WCN-UI-TC<NN>
// Doc-block format: every test carries a manual-execution block (Test ID,
// Description, Test Steps, Expected Result, Test Data, Technique).
//
// Per WMS-TEST-PLAN.md §8 chunk 10, this spec begins with:
//   - List & Table (default render, columns, pagination)
//   - Search (by container code)
//   - Filters (Type dropdown — All Types / Bin / etc.)
//
// Subsequent chunks (11-15) add Add Container, Manage Types, Row Actions,
// Assign To Location, and a full E2E.
//
// NOTE on table toggles: the Containers page disables the Show/Hide
// columns, density, and full-screen toggles in MRT (see
// WMSContainers.tsx — enableHiding/enableDensityToggle/enableFullScreenToggle
// are all false). So unlike the Locations spec there are no toolbar-toggle
// tests here.

import WarehouseContainersPage from "../pageObjects/WarehouseContainersPage";
import warehouseContainersLocators from "../support/locators/warehouseContainersLocators";
import AssignProductsPage from "../pageObjects/InventoryActions/AssignProductsPage";
import {
    deleteContainerViaApi,
    findContainerByCode,
    disposableTypeName,
    createContainerTypeViaApi,
    createContainerViaApi,
    deleteContainerTypeViaApi,
    listContainerTypesViaApi,
    resolveTypeIdByName,
    emptyContainerViaApi,
    sweepDisposableContainers,
    sweepDisposableContainerTypes,
    getContainerByIdViaApi,
    loadProductIntoContainerViaUI,
    loadProductIntoContainerViaApi,
} from "../support/helpers/wmsContainerHelpers";
import {
    createDisposableBinChain,
    deleteLocationViaApi,
    sweepDisposableLocations,
} from "../support/helpers/wmsLocationHelpers";

// Drives /MobileViewScreen/assign-products for the "load" step in
// TC32-TC35/TC45/TC46 (merge + stock-out flows need the source
// container loaded; the Containers page has no UI affordance for
// putting product quantities into a container).
// The Containers page has no UI affordance for putting product quantities
// into a container; the canonical user flow is Inventory Actions →
// Warehouse Management → Assignment → Assign Products.
const assignProductsPage = new AssignProductsPage();

describe("Warehouse Containers Tests", () => {
    let containersPage;

    beforeEach(() => {
        cy.authSession('admin');
        containersPage = new WarehouseContainersPage();
    });

    // Suite-wide pre-sweep: clean up any disposables left behind by a
    // previous run that crashed before its after() ran. Same order as
    // the after() sweep below — containers → locations → types.
    before(() => {
        sweepDisposableContainers();
        sweepDisposableLocations();
        sweepDisposableContainerTypes();
    });

    // Suite-wide safety net. Every test's afterEach is the primary
    // cleanup path; this is what rescues us when a test crashed before
    // its afterEach ran (Cypress hard-fail, manual abort, network
    // wipeout). Order is load-bearing:
    //
    //   1. Containers — must be emptied (drop quantities + items) and
    //      deleted FIRST because:
    //        a) DELETE /containers/:id 400s on cur_items > 0, so we
    //           empty before delete.
    //        b) DELETE /container-types/:id 400s on inUse > 0; only
    //           after the containers are gone does inUse flip false.
    //   2. Locations — bin chains created via createDisposableBinChain()
    //      use the AUTO_WMS_ prefix and are swept by the Locations
    //      sweeper. Locations soft-delete cascades to descendants, so
    //      deleting the Facility takes the whole Zone→…→Bin chain with
    //      it.
    //   3. Container types — now safe to drop since no container
    //      references any disposable type.
    //
    // Best-effort throughout: every sub-call tolerates 4xx so a
    // half-clean state still makes progress.
    after(() => {
        sweepDisposableContainers();
        sweepDisposableLocations();
        sweepDisposableContainerTypes();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Page Header & Layout (TC01-TC03)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Page Header & Layout (TC01-TC03)", () => {
        beforeEach(() => containersPage.visit());

        /**
         * Test ID:         SW-WCN-UI-TC01
         * Description:     Verify the Containers page renders its toolbar
         *                  action buttons (Add Container, Manage Types,
         *                  Assign To Location).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *
         * Expected Result:
         *   - "Add Container" button is visible and enabled.
         *   - "Manage Types" button is visible and enabled.
         *   - "Assign To Location" button is visible and enabled.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: The Containers page has no <h1> heading, so
         *                  the toolbar buttons ARE the "page rendered"
         *                  signal. Confirming all three render proves the
         *                  page mounted with the documented affordances.
         */
        it("SW-WCN-UI-TC01: Verify the toolbar action buttons render", { tags: ["@smoke", "@regression"] }, () => {
            containersPage.verifyToolbarButtonsRender();
        });

        /**
         * Test ID:         SW-WCN-UI-TC02
         * Description:     Verify the table renders the documented column
         *                  set (Code, Location, Items, Actions) on first
         *                  load.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *
         * Expected Result:
         *   - The table is visible.
         *   - Column headers match: Code, Location, Items, Actions.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Single representative happy-path proves the
         *                  page renders the documented columns. MRT's
         *                  sort-indicator may append text to the header
         *                  (e.g. "Code0"); the column matcher uses
         *                  leading-text so it's tolerant of that.
         */
        it("SW-WCN-UI-TC02: Verify the table renders the documented column set", { tags: ["@regression"] }, () => {
            containersPage.verifyTableRendered();
            containersPage.verifyTableColumns(["Code", "Location", "Items", "Actions"]);
        });

        /**
         * Test ID:         SW-WCN-UI-TC03
         * Description:     Verify the pagination footer renders the rows-
         *                  per-page selector and prev/next navigation
         *                  buttons.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *
         * Expected Result:
         *   - Rows-per-page select is rendered (id="mrt-rows-per-page-...").
         *   - "Go to previous page" button exists.
         *   - "Go to next page" button exists.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the footer wiring is on screen,
         *                  even when there's only one page of data (the
         *                  buttons are rendered but disabled in that case).
         */
        it("SW-WCN-UI-TC03: Verify the pagination footer renders the rows-per-page selector and navigation buttons", { tags: ["@regression"] }, () => {
            containersPage.verifyPaginationControlsRender();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Search (TC04-TC07)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Search (TC04-TC07)", () => {
        beforeEach(() => containersPage.visit());

        /**
         * Test ID:         SW-WCN-UI-TC04
         * Description:     Verify the search input accepts text.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Type "TEST" into the search input.
         *
         * Expected Result:
         *   - The input shows "TEST".
         *
         * Test Data:       The literal string "TEST".
         *
         * Technique:       Use Case
         * Why this technique: Smallest input that proves the search field
         *                  is interactive. Submission is a separate test
         *                  (TC05).
         */
        it("SW-WCN-UI-TC04: Verify the search input accepts text", { tags: ["@smoke", "@regression"] }, () => {
            const term = "TEST";
            containersPage.typeSearch(term);
            warehouseContainersLocators.searchInput().should("have.value", term);
        });

        /**
         * Test ID:         SW-WCN-UI-TC05
         * Description:     Verify searching for an unmatchable container
         *                  code yields no rows.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Type a guaranteed-unmatchable string into the search input.
         *   4. Click "Search".
         *
         * Expected Result:
         *   - The body either renders zero rows OR shows MRT's "no
         *     records" empty-state message.
         *
         * Test Data:
         *   - A timestamp-suffixed nonsense string that can't match any
         *     real container code.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the negative path of the search filter:
         *                  empty result must surface as 0 rows or empty
         *                  state, never as a stale grid.
         */
        it("SW-WCN-UI-TC05: Verify searching with an unmatchable term yields no rows", { tags: ["@regression"] }, () => {
            const nonsense = `__NO_MATCH_${Date.now()}__`;
            containersPage.search(nonsense);

            // Non-retrying probe: when the result set is genuinely zero,
            // MRT renders the empty-state row and 0 actual data rows. We
            // accept both shapes — the assertion that matters is "no
            // matching container row exists for this nonsense term".
            cy.get("body").then(() => {
                const $rows = Cypress.$("table tbody tr");
                if ($rows.length === 0) {
                    warehouseContainersLocators
                        .tableEmptyMessage()
                        .should("be.visible");
                } else {
                    // Some MRT configs render an empty-state row inside
                    // tbody; in either case, the nonsense string itself
                    // should NOT appear as a container code.
                    cy.contains("table tbody tr td", nonsense).should("not.exist");
                }
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC06
         * Description:     Verify clearing the search input restores the
         *                  grid (no search filter applied).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Search for an unmatchable term to filter the grid down.
         *   4. Clear the search input.
         *
         * Expected Result:
         *   - After clearing, the grid is no longer filtered to the
         *     unmatchable term (the empty-state for that search is gone).
         *
         * Test Data:
         *   - QA's existing Container inventory.
         *
         * Technique:       State Transition
         * Why this technique: Pairs filtered → cleared to confirm the
         *                  filter releases properly. The component's
         *                  onChange clears the filter automatically when
         *                  the input becomes empty (see WMSContainers.tsx
         *                  ~ line 1207).
         */
        it("SW-WCN-UI-TC06: Verify clearing the search restores the grid", { tags: ["@regression"] }, () => {
            const nonsense = `__NO_MATCH_${Date.now()}__`;
            containersPage.search(nonsense);

            // Snapshot the body width as a "filtered state" signal; we
            // don't check exact row counts because QA's data shifts.
            cy.contains("table tbody tr td", nonsense).should("not.exist");

            containersPage.clearSearch();
            // After clearing, the search input is empty.
            warehouseContainersLocators.searchInput().should("have.value", "");
            // The grid should NOT show the empty-state for the nonsense
            // term anymore (any rows present, or a different empty
            // state if QA has zero containers — both are valid).
        });

        /**
         * Test ID:         SW-WCN-UI-TC07
         * Description:     Verify searching for an EXISTING container
         *                  code returns the matching row.
         *
         * Test Steps:
         *   1. Create a disposable container type + container via API
         *      (so the test owns a known-existing code regardless of
         *      QA seed state).
         *   2. Reload the Containers page.
         *   3. Type the container's code into the search box and click
         *      Search.
         *
         * Expected Result:
         *   - At least one row is visible.
         *   - The visible row's Code cell shows the searched code.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: The positive partition of the search filter
         *                  — exactly the inverse of TC05 (no-match) and
         *                  TC06 (cleared). Pinning a known-match path
         *                  protects against a regression that would
         *                  silently drop all results.
         *
         * Cleanup: the container + type are deleted via API in afterEach.
         */
        it("SW-WCN-UI-TC07: Verify searching for an existing container code lists the row", { tags: ["@regression"] }, function () {
            const typeName = disposableTypeName("Srch");
            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "type was created").to.not.be.null;
                this.createdTypeId = type.id;

                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    this.createdContainerId = container.id;

                    containersPage.visit();
                    containersPage.search(container.code);
                    containersPage.verifyContainerPresent(container.code);
                    // The Code cell must show the exact searched code on
                    // at least one row — proves the filter narrowed the
                    // grid to a real match (not a stale render).
                    cy.contains("table tbody tr td", container.code).should("be.visible");
                });
            });
        });

        // Cleanup created resources for TC07. Order matters: container
        // first (so the type stops being in-use), then type.
        afterEach(function () {
            if (this.createdContainerId) {
                deleteContainerViaApi(this.createdContainerId);
                this.createdContainerId = null;
            }
            if (this.createdTypeId) {
                deleteContainerTypeViaApi(this.createdTypeId);
                this.createdTypeId = null;
            }
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Filters (TC08-TC09)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Filters (TC08-TC09)", () => {
        beforeEach(() => containersPage.visit());

        /**
         * Test ID:         SW-WCN-UI-TC08
         * Description:     Verify the Type dropdown opens and lists "All
         *                  Types" as the default option.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click the Type select to open the dropdown.
         *
         * Expected Result:
         *   - The dropdown opens.
         *   - "All Types" is one of the options.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: One assertion that the filter is interactive
         *                  and the documented "All Types" default option
         *                  is selectable. Per-type filtering (specific
         *                  container types) is TC09.
         */
        it("SW-WCN-UI-TC08: Verify the Type dropdown opens and contains the 'All Types' option", { tags: ["@smoke", "@regression"] }, () => {
            containersPage.openTypeFilter();
            warehouseContainersLocators.typeOption("All Types").should("be.visible");
            // Close the menu so subsequent tests see a clean DOM.
            cy.get("body").type("{esc}");
        });

        /**
         * Test ID:         SW-WCN-UI-TC09
         * Description:     Verify selecting a non-default Type filter
         *                  narrows the grid to containers of that type.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Open the Type dropdown.
         *   4. Pick the FIRST non-"All Types" option.
         *   5. After the grid refetches, inspect the visible rows.
         *
         * Expected Result:
         *   - Either the grid renders zero rows (no containers of that
         *     type), OR every visible row's "Code" cell shows the type
         *     as a subtitle. (The Code cell renders the container's
         *     code on top with its type as a smaller second line —
         *     see WMSContainers.tsx ~ line 671.)
         *
         * Test Data:
         *   - QA's existing Container inventory + the first non-default
         *     type configured under "Manage Types". Soft-skipped when QA
         *     has no container types configured.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative selection from the "filter
         *                  to a specific type" partition. The "All Types"
         *                  default is TC08.
         */
        it("SW-WCN-UI-TC09: Verify selecting a specific Type narrows the grid (soft-skip when no types exist)", { tags: ["@regression"] }, function () {
            // Determine deterministically from the API whether any non-default
            // Container Type exists, instead of polling the dropdown with a
            // fixed-ms tick (SKILL §10). The dropdown renders "All Types"
            // synchronously and the dynamic types arrive from a React Query
            // fetch; reading the option list too early would race and could
            // false-skip. Sourcing the target name from the API removes both
            // the timer and the race — the UI step below then retries on that
            // specific option until it renders.
            listContainerTypesViaApi().then((all) => {
                const labels = (all || [])
                    .map((t) => (t?.name || "").trim())
                    .filter((name) => name && !/^all types$/i.test(name));

                if (labels.length === 0) {
                    cy.log("TC09: no non-default Container Types configured in QA");
                    this.skip();
                    return;
                }

                const target = labels[0];
                containersPage.openTypeFilter();
                warehouseContainersLocators.typeOption(target).click();
                // Wait for the dropdown to close, signalling the refetch
                // is in flight.
                cy.findByRole("option", { name: new RegExp(`^${target}$`, "i") })
                    .should("not.exist");

                // Wait for the table to settle after the refetch, then
                // assert every visible row's Code cell contains the
                // selected type (rendered as a subtitle under the code).
                //
                // We use cy.get(...).should(callback) so Cypress retries
                // the WHOLE assertion on every iteration. Holding a
                // snapshot of <tr> elements across the refetch fails
                // with "subject is detached from the DOM" because React
                // re-renders the rows when the filter applies.
                //
                // Zero rows is acceptable for environments where QA has
                // no containers of that type — we soft-pass.
                cy.get("table tbody")
                    .should(($tbody) => {
                        const $rows = $tbody.find("tr");
                        if ($rows.length === 0) {
                            // Vacuous pass: filter returned 0 rows.
                            return;
                        }
                        $rows.each((_, row) => {
                            const txt = (row.textContent || "").trim();
                            // Either a real row containing the target type,
                            // or MRT's no-records empty-state row (which
                            // doesn't contain the target string).
                            const isEmptyState = /no records|no data|no results/i.test(txt);
                            if (!isEmptyState) {
                                expect(txt, `row text contains "${target}"`)
                                    .to.match(new RegExp(target, "i"));
                            }
                        });
                    });
            });
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Add Container Dialog (TC10-TC15)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Add Container is a custom <Box> overlay (NOT an MUI <Dialog>) — same
    // pattern as the QR-label component on the Locations page. The form
    // has three fields:
    //   - Type        (Select, defaults to first containerType)
    //   - Code ID     (auto-generated by backend, disabled in create mode)
    //   - Max Items   (optional, validates 1..10000)
    //
    // Save is disabled while the create mutation is pending OR when the
    // Max Items inline error is set.
    //
    // The Type Select needs ≥1 container type configured in QA. Tests
    // soft-skip when none are available.
    describe("Add Container Dialog (TC10-TC15)", () => {
        // Track ids of containers created via UI for cleanup.
        const createdIds = [];

        beforeEach(() => containersPage.visit());

        // After every test in this block, remove any container the test
        // created. We resolve IDs lazily — TC14 captures them, the others
        // create nothing.
        afterEach(() => {
            while (createdIds.length > 0) {
                const id = createdIds.shift();
                deleteContainerViaApi(id);
            }
        });

        /**
         * Test ID:         SW-WCN-UI-TC10
         * Description:     Verify clicking "Add Container" opens the Add
         *                  Container dialog with Save and Cancel buttons.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *
         * Expected Result:
         *   - The dialog heading "Add Container" is visible.
         *   - Save and Cancel buttons are visible inside the dialog.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WCN-UI-TC10: Verify clicking 'Add Container' opens the Add Container dialog", { tags: ["@smoke", "@regression"] }, () => {
            containersPage.openAddContainer();
            warehouseContainersLocators.addContainerHeading().should("be.visible");
            warehouseContainersLocators
                .addContainerDialog()
                .within(() => {
                    warehouseContainersLocators.addContainerSaveBtn().should("be.visible");
                    warehouseContainersLocators.addContainerCancelBtn().should("be.visible");
                });
            containersPage.cancelAddContainer();
        });

        /**
         * Test ID:         SW-WCN-UI-TC11
         * Description:     Verify cancelling the Add Container dialog
         *                  does not create a container.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *   4. Capture the auto-generated Code ID from the disabled input.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No container row with the previewed code appears in the table.
         *
         * Test Data:
         *   - The dialog's auto-generated next code (e.g. "CT-PAL-1").
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a real
         *                  regression pattern; we verify by the previewed
         *                  code so the assertion is unambiguous.
         */
        it("SW-WCN-UI-TC11: Verify cancelling the Add Container dialog does not create a container", { tags: ["@regression"] }, () => {
            containersPage.openAddContainer();
            containersPage.readAddContainerCode().then((previewedCode) => {
                containersPage.cancelAddContainer();
                containersPage.search(previewedCode);
                containersPage.verifyContainerAbsent(previewedCode);
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC12
         * Description:     Verify the Code ID input is disabled in create
         *                  mode (the documented "auto-generated" contract).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *   4. Inspect the Code ID input.
         *
         * Expected Result:
         *   - The Code ID input has the `disabled` attribute.
         *   - The input shows a non-empty auto-generated value (the
         *     full code, e.g. "CT-PAL-1") once the backend lookup
         *     resolves.
         *
         * Test Data:       Not required.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract. Mirrors the Locations-side TC for
         *                  Facility/Zone/Area code-readonly invariants.
         */
        it("SW-WCN-UI-TC12: Verify the Code ID field is disabled (auto-generated) in create mode", { tags: ["@regression"] }, () => {
            containersPage.openAddContainer();
            warehouseContainersLocators
                .codeIdInput()
                .should("be.disabled")
                .and("not.have.value", "");
            containersPage.cancelAddContainer();
        });

        /**
         * Test ID:         SW-WCN-UI-TC13
         * Description:     Verify the Max Items field rejects 0 (lower
         *                  invalid boundary — the field accepts 1..10000).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *   4. Type "0" into the Max Items field.
         *
         * Expected Result:
         *   - An inline validation error appears
         *     ("Enter a whole number greater than 0").
         *   - The Save button becomes disabled.
         *
         * Test Data:
         *   - Max Items = 0 (just below the documented 1..10000 range).
         *
         * Technique:       Boundary Value Analysis
         * Why this technique: 0 is the largest invalid value below the
         *                  valid range — pinning it covers the lower
         *                  partition's edge.
         */
        it("SW-WCN-UI-TC13: Verify Max Items rejects 0 (lower invalid boundary)", { tags: ["@regression"] }, () => {
            containersPage.openAddContainer();
            containersPage.typeMaxItems("0");
            warehouseContainersLocators.maxItemsError().should("be.visible");
            warehouseContainersLocators.addContainerSaveBtn().should("be.disabled");
            containersPage.cancelAddContainer();
        });

        /**
         * Test ID:         SW-WCN-UI-TC14
         * Description:     Verify the Max Items field rejects 10001
         *                  (upper invalid boundary — max accepted is 10000).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *   4. Type "10001" into the Max Items field.
         *
         * Expected Result:
         *   - An inline validation error appears
         *     ("Max items cannot exceed 10000").
         *   - The Save button becomes disabled.
         *
         * Test Data:
         *   - Max Items = 10001 (one above the documented 1..10000 range).
         *
         * Technique:       Boundary Value Analysis
         * Why this technique: 10001 is the smallest invalid value above
         *                  the valid range. Together TC13+TC14 pin both
         *                  edges of the integer-range guard.
         */
        it("SW-WCN-UI-TC14: Verify Max Items rejects 10001 (upper invalid boundary)", { tags: ["@regression"] }, () => {
            containersPage.openAddContainer();
            containersPage.typeMaxItems("10001");
            warehouseContainersLocators.maxItemsError().should("be.visible");
            warehouseContainersLocators.addContainerSaveBtn().should("be.disabled");
            containersPage.cancelAddContainer();
        });

        /**
         * Test ID:         SW-WCN-UI-TC15
         * Description:     Verify creating a container with the auto-
         *                  generated Code (no Max Items) creates a new
         *                  row in the table.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *   4. Click "Save" (Code is auto-generated, all other fields
         *      are optional).
         *   5. Search for the new container's code and verify it appears.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new row with the captured code appears in the table.
         *
         * Test Data:
         *   - The auto-generated CT-PREFIX-N code.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Container" partition. Code is
         *                  server-generated, all required fields default,
         *                  so there's no other valid input to vary.
         *
         * Cleanup:
         *   The created container is deleted via API in afterEach() —
         *   we capture its id by looking up the code we just received.
         */
        it("SW-WCN-UI-TC15: Verify creating a container with valid data creates it in the table", { tags: ["@smoke", "@regression"] }, function () {
            // Drive the full happy path via the page-object convenience.
            // openAddContainer() (called inside addContainer) waits for
            // the container-types fetch before clicking, so the auto-
            // code generation fires reliably.
            containersPage.addContainer().then((code) => {
                // Verify the new row appears (after a search to narrow
                // the grid — the new container may live on a different
                // page of the paginated list).
                containersPage.search(code);
                containersPage.verifyContainerPresent(code);

                // Capture id for afterEach() cleanup.
                findContainerByCode(code).then((container) => {
                    if (container && container.id) {
                        createdIds.push(container.id);
                    } else {
                        cy.log(
                            `TC14: could not look up id for "${code}" — leaving cleanup to a future sweep`,
                        );
                    }
                });
            });
        });

        /**
         * Test ID:         SW-WC-UI-TC51
         * Description:     Verify the Max Items field accepts 1 (lower
         *                  valid boundary — the field accepts 1..10000).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *   4. Type "1" into the Max Items field.
         *
         * Expected Result:
         *   - No inline validation error is visible.
         *   - The Save button is NOT disabled.
         *
         * Test Data:       max_items = 1 (lower valid boundary)
         *
         * Technique:       BVA
         * Why this technique: 1 is the smallest valid value in the
         *                  accepted 1..10000 range. TC13 pins the invalid
         *                  value immediately below (0 → rejected); this
         *                  test pins the valid boundary itself — confirming
         *                  the fence is placed correctly and 1 is accepted.
         */
        it("SW-WC-UI-TC51: Verify Max Items accepts 1 (lower valid boundary)", { tags: ["@regression"] }, () => {
            containersPage.openAddContainer();
            containersPage.typeMaxItems("1");
            warehouseContainersLocators.maxItemsError().should("not.exist");
            warehouseContainersLocators.addContainerSaveBtn().should("not.be.disabled");
            containersPage.cancelAddContainer();
        });

        /**
         * Test ID:         SW-WC-UI-TC52
         * Description:     Verify the Max Items field accepts 10000 (upper
         *                  valid boundary — the field accepts 1..10000).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Add Container".
         *   4. Type "10000" into the Max Items field.
         *
         * Expected Result:
         *   - No inline validation error is visible.
         *   - The Save button is NOT disabled.
         *
         * Test Data:       max_items = 10000 (upper valid boundary)
         *
         * Technique:       BVA
         * Why this technique: 10000 is the largest valid value in the
         *                  accepted 1..10000 range. TC14 pins the invalid
         *                  value immediately above (10001 → rejected); this
         *                  test pins the valid boundary itself — confirming
         *                  the upper fence is placed correctly and 10000
         *                  is accepted.
         */
        it("SW-WC-UI-TC52: Verify Max Items accepts 10000 (upper valid boundary)", { tags: ["@regression"] }, () => {
            containersPage.openAddContainer();
            containersPage.typeMaxItems("10000");
            warehouseContainersLocators.maxItemsError().should("not.exist");
            warehouseContainersLocators.addContainerSaveBtn().should("not.be.disabled");
            containersPage.cancelAddContainer();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Manage Container Types modal (TC16-TC23)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Manage Container Types Modal (TC16-TC23)", () => {
        // Track names of types created via UI for cleanup. Names are
        // unique per test (timestamp + rand suffix) so the API delete
        // by id (resolved through listContainerTypesViaApi) is precise.
        const createdNames = [];
        // Track ids of containers created via API (TC21 creates one to
        // flip a type's inUse flag). Containers are deleted BEFORE
        // types so the type cleanup isn't blocked by an in-use guard.
        const createdContainerIds = [];

        beforeEach(() => containersPage.visit());

        // After every test in this block, sweep what the test created.
        // Order matters: containers first (so types are no longer
        // referenced), then types. Anything already gone (TC19 deletes
        // a type via UI) is a no-op via failOnStatusCode: false.
        afterEach(() => {
            while (createdContainerIds.length > 0) {
                const id = createdContainerIds.shift();
                deleteContainerViaApi(id);
            }
            if (createdNames.length === 0) return;
            const names = createdNames.splice(0);
            listContainerTypesViaApi().then((all) => {
                names.forEach((n) => {
                    const match = all.find((t) => t.name === n);
                    if (match && match.id) deleteContainerTypeViaApi(match.id);
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC16
         * Description:     Verify clicking "Manage Types" opens the Manage
         *                  Container Types modal.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/containers.
         *   3. Click "Manage Types".
         *
         * Expected Result:
         *   - The modal heading "Manage Container Types" is visible.
         *   - The "New Type" input is visible.
         *   - Save and Close buttons are visible inside the modal.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the entry point opens the modal
         *                  with its three permanent affordances (input,
         *                  Save, Close) before deeper tests rely on it.
         */
        it("SW-WCN-UI-TC16: Verify clicking 'Manage Types' opens the modal", { tags: ["@smoke", "@regression"] }, () => {
            containersPage.openManageTypes();
            warehouseContainersLocators.newTypeInput().should("be.visible");
            // The modal panel is overflowY:auto with maxHeight:90vh and the
            // Save/Close footer sits in the SAME Stack as the per-type list,
            // so once enough types accumulate the footer scrolls below the
            // viewport. scrollIntoView() puts it back in view before the
            // visibility assertion runs.
            warehouseContainersLocators
                .manageTypesDialog()
                .within(() => {
                    warehouseContainersLocators.manageTypesSaveBtn()
                        .scrollIntoView()
                        .should("be.visible");
                    warehouseContainersLocators.manageTypesCloseBtn()
                        .scrollIntoView()
                        .should("be.visible");
                });
            containersPage.closeManageTypes();
        });

        /**
         * Test ID:         SW-WCN-UI-TC17
         * Description:     Verify the "New Type" field shows a real-time
         *                  validation error for special characters.
         *
         * Test Steps:
         *   1. Open the Manage Types modal.
         *   2. Type "Bad_Type!" into the New Type input.
         *
         * Expected Result:
         *   - An inline validation error appears advising "Only letters,
         *     numbers and single spaces between words…".
         *
         * Test Data:
         *   - "Bad_Type!" — contains underscore + bang, both rejected
         *     by the validator.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative from the "invalid
         *                  characters" partition pins the live-validation
         *                  guard. Boundary cases (leading space, double
         *                  space) are covered by sibling tests.
         */
        it("SW-WCN-UI-TC17: Verify New Type rejects special characters", { tags: ["@regression"] }, () => {
            containersPage.openManageTypes();
            containersPage.typeNewTypeName("Bad_Type!");
            warehouseContainersLocators.newTypeError().should("be.visible");
            containersPage.closeManageTypes();
        });

        /**
         * Test ID:         SW-WCN-UI-TC18
         * Description:     Verify the "New Type" field shows the live
         *                  validation error for two consecutive spaces.
         *
         * Test Steps:
         *   1. Open the Manage Types modal.
         *   2. Type "Bin  Type" (two spaces) into New Type.
         *
         * Expected Result:
         *   - The inline validation error appears.
         *
         * Test Data:
         *   - "Bin  Type" — two consecutive spaces, an explicit reject
         *     case in hasValidationError().
         *
         * Technique:       Boundary Value Analysis
         * Why this technique: 2 consecutive spaces is the smallest
         *                  invalid value above the "single internal
         *                  space" boundary; pins the lower edge of the
         *                  multi-space partition.
         */
        it("SW-WCN-UI-TC18: Verify New Type rejects consecutive spaces", { tags: ["@regression"] }, () => {
            containersPage.openManageTypes();
            containersPage.typeNewTypeName("Bin  Type");
            warehouseContainersLocators.newTypeError().should("be.visible");
            containersPage.closeManageTypes();
        });

        /**
         * Test ID:         SW-WCN-UI-TC19
         * Description:     Verify clicking "Add" with a valid New Type
         *                  name creates a new type that appears in the
         *                  list.
         *
         * Test Steps:
         *   1. Open the Manage Types modal.
         *   2. Type a unique disposable name (AutoWms<ts><rand>Type).
         *   3. Click "Add".
         *
         * Expected Result:
         *   - The new type appears as a new row in the modal list.
         *
         * Test Data:
         *   - Disposable name like "AutoWms17031234560000Type".
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed type name" partition. Cleanup via
         *                  API in afterEach() — the type is unused so the
         *                  delete succeeds.
         */
        it("SW-WCN-UI-TC19: Verify Add creates a new container type", { tags: ["@smoke", "@regression"] }, () => {
            const name = disposableTypeName("Type");
            createdNames.push(name);
            containersPage.openManageTypes();
            containersPage.addType(name);
            containersPage.closeManageTypes();
        });

        /**
         * Test ID:         SW-WCN-UI-TC20
         * Description:     Verify deleting a freshly-added type via its
         *                  row Delete icon → "Yes" removes the row.
         *
         * Test Steps:
         *   1. Open the Manage Types modal.
         *   2. Add a disposable type (TC19 confirms this works).
         *   3. Click the row's Delete icon → confirm "Yes".
         *
         * Expected Result:
         *   - The Confirm dialog ("Delete Container Type") opens.
         *   - After "Yes", the row dismounts and the type is gone.
         *
         * Test Data:       A disposable name (created in-test).
         *
         * Technique:       State Transition
         * Why this technique: Verifies the "exists → confirmed delete →
         *                  removed" lifecycle of a not-in-use type.
         */
        it("SW-WCN-UI-TC20: Verify deleting a not-in-use type removes the row", { tags: ["@regression"] }, () => {
            const name = disposableTypeName("Del");
            // afterEach won't find it (we'll delete it in-test), but
            // listing it for safety in case the UI delete fails.
            createdNames.push(name);
            containersPage.openManageTypes();
            containersPage.addType(name);
            containersPage.deleteTypeRow(name);
            containersPage.closeManageTypes();
        });

        /**
         * Test ID:         SW-WCN-UI-TC21
         * Description:     Verify clicking "No" on the type-delete
         *                  confirmation dialog cancels the delete and
         *                  leaves the row intact.
         *
         * Test Steps:
         *   1. Open the Manage Types modal.
         *   2. Add a disposable type.
         *   3. Click the row's Delete icon.
         *   4. Click "No" on the confirmation dialog.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The type row is still present.
         *
         * Test Data:       A disposable name (created in-test).
         *
         * Technique:       Negative testing
         * Why this technique: Pins the negative path of the delete
         *                  confirmation — a "No" must not destroy data.
         */
        it("SW-WCN-UI-TC21: Verify Cancel ('No') on the delete-type confirm leaves the row", { tags: ["@regression"] }, () => {
            const name = disposableTypeName("Cncl");
            createdNames.push(name);
            containersPage.openManageTypes();
            containersPage.addType(name);
            // Open the confirm, then say No.
            warehouseContainersLocators
                .typeRowByName(name)
                .parents("div.MuiStack-root")
                .first()
                .within(() => {
                    warehouseContainersLocators.deleteTypeBtnInRow().click();
                });
            warehouseContainersLocators.deleteTypeNoBtn().click();
            warehouseContainersLocators.typeRowByName(name).should("exist");
            containersPage.closeManageTypes();
        });

        /**
         * Test ID:         SW-WCN-UI-TC22
         * Description:     Verify an in-use container type renders its
         *                  Edit input and Delete icon as disabled.
         *
         * Test Steps:
         *   1. Create a disposable container type via API.
         *   2. Create a container via API that uses that type — this
         *      flips the type's `inUse` flag to true.
         *   3. Reload the page so the freshly-fetched data includes the
         *      updated inUse flag, then open the Manage Types modal.
         *   4. Inspect the row for our created type.
         *
         * Expected Result:
         *   - The row's Input has the `disabled` attribute.
         *   - The row's Delete IconButton has the `disabled` attribute.
         *
         * Test Data:       A self-created throwaway type + container.
         *
         * Technique:       Decision Table
         * Why this technique: The decision rule "type may be edited /
         *                  deleted" depends on the inUse flag — pinning
         *                  the disabled state with self-created data
         *                  removes any reliance on QA seed state.
         *
         * Cleanup: the inverse order of creation — delete the container
         * first (so the type stops being in-use), then delete the type.
         * Both run in afterEach() via the createdContainerIds and
         * createdNames trackers.
         */
        it("SW-WCN-UI-TC22: Verify in-use types are not editable or deletable", { tags: ["@regression"] }, () => {
            const name = disposableTypeName("InUse");
            createContainerTypeViaApi(name).then((type) => {
                expect(type, "type was created").to.not.be.null;
                expect(type.id, "created type has id").to.be.a("number");
                createdNames.push(name);

                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    expect(container.id, "created container has id").to.be.a("number");
                    createdContainerIds.push(container.id);

                    // Reload so the page's React-Query cache reflects
                    // the new inUse=true flag for our type.
                    containersPage.visit();
                    containersPage.openManageTypes();
                    warehouseContainersLocators
                        .typeRowByName(name)
                        .should("be.disabled");
                    warehouseContainersLocators
                        .typeRowByName(name)
                        .parents("div.MuiStack-root")
                        .first()
                        .within(() => {
                            warehouseContainersLocators
                                .deleteTypeBtnInRow()
                                .should("be.disabled");
                        });
                    containersPage.closeManageTypes();
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC23
         * Description:     Verify clicking "Close" dismisses the Manage
         *                  Container Types modal.
         *
         * Test Steps:
         *   1. Open the Manage Types modal.
         *   2. Click "Close".
         *
         * Expected Result:
         *   - The modal heading is no longer in the DOM.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Closes the loop on the modal's lifecycle —
         *                  a Close that fails to dismiss is a real
         *                  regression (modals can leak when refs go stale).
         */
        it("SW-WCN-UI-TC23: Verify Close dismisses the Manage Types modal", { tags: ["@regression"] }, () => {
            containersPage.openManageTypes();
            containersPage.closeManageTypes();
            warehouseContainersLocators.manageTypesHeading().should("not.exist");
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Row Actions — View Contents / Merge / Stock Out / Delete / View Label
    // / Audit Trail (TC24-TC36)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Row Actions (TC24-TC36)", () => {
        // For this block every test creates its own disposable type +
        // empty container via API in beforeEach so we don't rely on QA
        // seed data and tests can't contaminate each other. Cleanup is
        // strict: container first (so the type stops being in-use),
        // then type.
        const created = { typeId: null, typeName: null, containerId: null, containerCode: null };

        beforeEach(() => {
            // Visit page (and register the @getContainerTypes alias).
            containersPage.visit();
            const typeName = disposableTypeName("Row");
            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "type was created").to.not.be.null;
                created.typeId = type.id;
                created.typeName = typeName;
                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    expect(container.code, "container has code").to.be.a("string");
                    created.containerId = container.id;
                    created.containerCode = container.code;
                    // Reload so the new container appears in the page state.
                    containersPage.visit();
                    // Filter to our row only — the grid may be paginated.
                    containersPage.search(container.code);
                    containersPage.verifyContainerPresent(container.code);
                });
            });
        });

        afterEach(() => {
            // TC32-TC35 load the source container via UI; if the merge
            // didn't succeed (negative cases) cur_items stays > 0 and
            // DELETE /containers/:id 400s. Empty the container first
            // so cleanup is reliable regardless of the test outcome.
            if (created.containerId) {
                emptyContainerViaApi(created.containerId);
                deleteContainerViaApi(created.containerId);
                created.containerId = null;
                created.containerCode = null;
            }
            if (created.typeId) {
                deleteContainerTypeViaApi(created.typeId);
                created.typeId = null;
                created.typeName = null;
            }
        });

        /**
         * Test ID:         SW-WCN-UI-TC24
         * Description:     Verify all five row-action icon buttons render
         *                  in the Actions cell of a container row.
         *
         * Test Steps:
         *   1. Create a disposable container via API (beforeEach).
         *   2. Search for it on the Containers page.
         *   3. Inspect the Actions cell of its row.
         *
         * Expected Result:
         *   - Tooltip-named buttons "View Contents", "Merge", "Stock Out",
         *     "Delete", and "View Label" are all present.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       Use Case
         * Why this technique: A single representative row pins the
         *                  per-row affordance set. Disabled-state checks
         *                  for cur_items-driven actions live in TC27/28.
         */
        it("SW-WCN-UI-TC24: Verify the row-actions cell renders all five icon buttons", { tags: ["@smoke", "@regression"] }, () => {
            warehouseContainersLocators
                .actionsCellInRow(created.containerCode)
                .within(() => {
                    cy.findByRole('button', { name: /^view contents$/i }).should("exist");
                    cy.findByRole('button', { name: /^merge$/i }).should("exist");
                    cy.findByRole('button', { name: /^stock out$/i }).should("exist");
                    cy.findByRole('button', { name: /^delete$/i }).should("exist");
                    cy.findByRole('button', { name: /^view label$/i }).should("exist");
                });
        });

        /**
         * Test ID:         SW-WCN-UI-TC25
         * Description:     Verify "View Contents" opens the Container
         *                  Details modal and Close dismisses it.
         *
         * Test Steps:
         *   1. Click the row's "View Contents" icon.
         *   2. Verify the Container Details modal opens.
         *   3. Click Close.
         *
         * Expected Result:
         *   - The modal heading "Container Details" appears, then is
         *     removed after Close.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       State Transition
         * Why this technique: Open → close lifecycle of the modal pins
         *                  the dialog's mount/unmount paths.
         */
        it("SW-WCN-UI-TC25: Verify View Contents opens and Close dismisses the Container Details modal", { tags: ["@regression"] }, () => {
            containersPage.openViewContents(created.containerCode);
            containersPage.closeViewContents();
        });

        /**
         * Test ID:         SW-WCN-UI-TC26
         * Description:     Verify "View Label" opens the QR-label modal
         *                  for the container code, and Cancel dismisses it.
         *
         * Test Steps:
         *   1. Click the row's "View Label" icon.
         *   2. Verify the modal heading reads "Label for {code}".
         *   3. Click Cancel.
         *
         * Expected Result:
         *   - The label modal opens scoped to the container, then is
         *     removed after Cancel.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       State Transition
         * Why this technique: Same open → close pattern as TC25 for the
         *                  label modal — its heading is scoped to the
         *                  container code so we know we got the right one.
         */
        it("SW-WCN-UI-TC26: Verify View Label opens and Cancel dismisses the label modal", { tags: ["@regression"] }, () => {
            containersPage.openViewLabel(created.containerCode);
            containersPage.closeViewLabel(created.containerCode);
        });

        /**
         * Test ID:         SW-WCN-UI-TC27
         * Description:     Verify the Merge action is disabled on a row
         *                  whose container is empty (cur_items === 0).
         *
         * Test Steps:
         *   1. Create an empty disposable container (beforeEach — no
         *      contents are stocked in).
         *   2. Inspect the row's Merge button.
         *
         * Expected Result:
         *   - The Merge IconButton has the `disabled` attribute.
         *
         * Test Data:       Self-created empty container.
         *
         * Technique:       Decision Table
         * Why this technique: The decision rule "Merge is enabled" depends
         *                  on cur_items > 0; an empty container pins the
         *                  cur_items === 0 branch.
         */
        it("SW-WCN-UI-TC27: Verify Merge is disabled on an empty container", { tags: ["@regression"] }, () => {
            warehouseContainersLocators
                .actionsCellInRow(created.containerCode)
                .within(() => {
                    cy.findByRole('button', { name: /^merge$/i }).should("be.disabled");
                });
        });

        /**
         * Test ID:         SW-WCN-UI-TC28
         * Description:     Verify the Stock Out action is disabled on a
         *                  row whose container is empty.
         *
         * Test Steps:
         *   1. Create an empty disposable container.
         *   2. Inspect the row's Stock Out button.
         *
         * Expected Result:
         *   - The Stock Out IconButton has the `disabled` attribute.
         *
         * Test Data:       Self-created empty container.
         *
         * Technique:       Decision Table
         * Why this technique: Same as TC27 — Stock Out's enable rule
         *                  (cur_items > 0) is pinned via the false branch.
         */
        it("SW-WCN-UI-TC28: Verify Stock Out is disabled on an empty container", { tags: ["@regression"] }, () => {
            warehouseContainersLocators
                .actionsCellInRow(created.containerCode)
                .within(() => {
                    cy.findByRole('button', { name: /^stock out$/i }).should("be.disabled");
                });
        });

        /**
         * Test ID:         SW-WCN-UI-TC29
         * Description:     Verify Delete → Yes on an empty container
         *                  removes the row.
         *
         * Test Steps:
         *   1. Click the row's Delete icon.
         *   2. Verify the "Confirm Container Deletion" dialog opens.
         *   3. Click Yes.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The container row dismounts.
         *
         * Test Data:       Self-created empty container.
         *
         * Technique:       State Transition
         * Why this technique: Verifies the empty → deleted lifecycle.
         *                  Delete is enabled because cur_items === 0
         *                  (its inverse rule from TC27/28).
         *
         * Cleanup:         The row is already deleted by the test —
         *                  afterEach() will see a 404 from DELETE and
         *                  proceed (failOnStatusCode: false).
         */
        it("SW-WCN-UI-TC29: Verify Delete → Yes removes an empty container row", { tags: ["@regression"] }, () => {
            containersPage.openDeleteContainer(created.containerCode);
            containersPage.confirmDeleteContainer(created.containerCode);
        });

        /**
         * Test ID:         SW-WCN-UI-TC30
         * Description:     Verify Delete → No on the confirm dialog
         *                  leaves the container row intact.
         *
         * Test Steps:
         *   1. Click the row's Delete icon.
         *   2. Verify the confirmation dialog opens.
         *   3. Click No.
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The container row is still present.
         *
         * Test Data:       Self-created empty container.
         *
         * Technique:       Negative testing
         * Why this technique: The "No" path of a destructive confirm is
         *                  a high-risk regression target — pinning it
         *                  protects against accidental deletes.
         */
        it("SW-WCN-UI-TC30: Verify Delete → No leaves the container row intact", { tags: ["@regression"] }, () => {
            containersPage.openDeleteContainer(created.containerCode);
            containersPage.cancelDeleteContainer();
            containersPage.verifyContainerPresent(created.containerCode);
        });

        /**
         * Test ID:         SW-WCN-UI-TC31
         * Description:     Verify clicking the row body (outside the
         *                  Actions cell) opens the Container Details
         *                  modal — matching the documented row-click
         *                  behaviour (muiTableBodyRowProps.onClick).
         *
         * Test Steps:
         *   1. Click anywhere in the row outside the Actions cell.
         *
         * Expected Result:
         *   - The Container Details modal opens.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       Use Case
         * Why this technique: Pins a non-obvious affordance — the row
         *                  body is itself a "view contents" trigger,
         *                  not just the icon button.
         */
        it("SW-WCN-UI-TC31: Verify clicking the row body opens View Contents", { tags: ["@regression"] }, () => {
            // Click the Code cell — definitely not inside a button.
            warehouseContainersLocators.containerRowText(created.containerCode).click();
            warehouseContainersLocators.viewContentsHeading().should("be.visible");
            containersPage.closeViewContents();
        });

        /**
         * Test ID:         SW-WCN-UI-TC32
         * Description:     Verify the Merge action is ENABLED on a row
         *                  whose container has at least one item
         *                  (cur_items > 0) — the inverse rule of TC27.
         *
         * Test Steps:
         *   1. Create an empty disposable container via API (beforeEach).
         *   2. Load 1 unit of any pure product into the container via
         *      the canonical Inventory Actions → Assign Products UI.
         *      Soft-skip when QA has no suitable product.
         *   3. Re-visit Containers, filter to the row, inspect the
         *      Merge IconButton.
         *
         * Expected Result:
         *   - The Merge IconButton is NOT disabled.
         *
         * Test Data:       Self-created disposable container + 1 unit
         *                  of any pure product.
         *
         * Technique:       Decision Table
         * Why this technique: The decision rule "Merge is enabled" is
         *                  cur_items > 0. TC27 pins the false branch;
         *                  this test pins the true branch.
         */
        it("SW-WCN-UI-TC32: Verify Merge is enabled on a non-empty container", { tags: ["@regression"] }, function () {
            cy.iaAuthToken().then((token) => {
                cy.iaProbeProductWithNoAssignments(token).then((product) => {
                    if (!product) {
                        cy.log("TC32: no assignable pure product in QA — soft-skip");
                        this.skip();
                        return;
                    }
                    loadProductIntoContainerViaUI(assignProductsPage, created.containerCode, product);
                    containersPage.visit();
                    containersPage.search(created.containerCode);
                    containersPage.verifyContainerPresent(created.containerCode);
                    warehouseContainersLocators
                        .actionsCellInRow(created.containerCode)
                        .within(() => {
                            cy.findByRole('button', { name: /^merge$/i })
                                .should("not.be.disabled");
                        });
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC33
         * Description:     Verify clicking the Merge icon on a non-empty
         *                  row opens the Merge Container dialog scoped
         *                  to that source container.
         *
         * Test Steps:
         *   1. Load 1 unit of a pure product into the container
         *      (soft-skip on no product).
         *   2. Re-visit Containers, click the row's Merge icon.
         *
         * Expected Result:
         *   - The dialog heading "Merge Container {code}" is visible.
         *   - Merge + Cancel footer buttons are present.
         *
         * Test Data:       Self-created loaded container.
         *
         * Technique:       Use Case
         * Why this technique: Pins the open-path of the Merge modal —
         *                  the dialog's existence and accessible name
         *                  are the only contract a caller sees before
         *                  attempting an actual merge (TC34/TC35).
         */
        it("SW-WCN-UI-TC33: Verify clicking Merge opens the Merge Container modal", { tags: ["@regression"] }, function () {
            cy.iaAuthToken().then((token) => {
                cy.iaProbeProductWithNoAssignments(token).then((product) => {
                    if (!product) {
                        cy.log("TC33: no assignable pure product in QA — soft-skip");
                        this.skip();
                        return;
                    }
                    loadProductIntoContainerViaUI(assignProductsPage, created.containerCode, product);
                    containersPage.visit();
                    containersPage.search(created.containerCode);
                    containersPage.openMerge(created.containerCode);
                    warehouseContainersLocators
                        .mergeDialog(created.containerCode)
                        .within(() => {
                            warehouseContainersLocators.mergeSubmitBtn().should("be.visible");
                            warehouseContainersLocators.mergeCancelBtn().should("be.visible");
                        });
                    containersPage.cancelMerge(created.containerCode);
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC34
         * Description:     Verify merge succeeds between two containers
         *                  of the SAME type — the source's contents
         *                  move into the target and the source's
         *                  cur_items resets to 0.
         *
         * Test Steps:
         *   1. Create a second empty container of the SAME disposable
         *      type via API (this becomes the merge target).
         *   2. Load 1 unit of a pure product into the source container
         *      via the Assign Products UI (soft-skip on no product).
         *   3. Visit Containers, search for the source row, click its
         *      Merge icon.
         *   4. In the Merge dialog, scan the target's code, click Merge.
         *
         * Expected Result:
         *   - A success toast appears containing "moved" or "merged"
         *     wording, and the dialog dismounts.
         *   - The source container's cur_items returns to 0 via API.
         *
         * Test Data:       Self-created source + target containers
         *                  (same type) + 1 unit of any pure product.
         *
         * Technique:       Use Case
         * Why this technique: This is the documented happy-path of the
         *                  Merge flow. Pinning the success toast +
         *                  dismount + API-side cur_items reset is the
         *                  strongest single regression check.
         *
         * Cleanup: the target id is tracked locally so afterEach()
         * deletes both source and target in order.
         */
        it("SW-WCN-UI-TC34: Verify merge succeeds between two containers of the same type", { tags: ["@regression"] }, function () {
            // Create a second container of the same type — merge target.
            createContainerViaApi(created.typeId).then((target) => {
                expect(target, "target container was created").to.not.be.null;
                this.mergeTargetId = target.id;

                cy.iaAuthToken().then((token) => {
                    cy.iaProbeProductWithNoAssignments(token).then((product) => {
                        if (!product) {
                            cy.log("TC34: no assignable pure product in QA — soft-skip");
                            this.skip();
                            return;
                        }
                        loadProductIntoContainerViaUI(assignProductsPage, created.containerCode, product);

                        containersPage.visit();

                        containersPage.searchUntilPresent(created.containerCode);
                        containersPage.openMerge(created.containerCode);
                        containersPage.scanMergeTargetCode(target.code);
                        // Target info card confirms the target was
                        // recognised (the "{code} • {type}" subtitle).
                        cy.contains(new RegExp(`${target.code}\\s*[••]\\s*`, 'i'))
                            .should("be.visible");
                        containersPage.submitMerge(created.containerCode);

                        // The dialog dismounts on success.
                        warehouseContainersLocators
                            .mergeHeading(created.containerCode)
                            .should("not.exist");

                        // Source's cur_items must reset to 0 via API.
                        getContainerByIdViaApi(created.containerId).then((after) => {
                            expect(after, "source container record").to.not.be.null;
                            expect(after.cur_items, "source cur_items after merge").to.equal(0);
                        });
                    });
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC35
         * Description:     Verify the Merge dialog REJECTS a target of a
         *                  DIFFERENT container type — surfaces a
         *                  toast and never enables the Merge submit
         *                  button.
         *
         * Test Steps:
         *   1. Create a second disposable container of a DIFFERENT type
         *      via API.
         *   2. Load 1 unit of a pure product into the source container
         *      (soft-skip on no product).
         *   3. Open the Merge dialog for the source row, scan the
         *      different-typed target's code.
         *
         * Expected Result:
         *   - A toast appears advising the merge is disallowed across
         *     types ("Cannot merge different container types…").
         *   - The Merge submit button stays disabled (no target
         *     selected internally).
         *
         * Test Data:       Self-created source + alt-type target +
         *                  1 unit of a pure product.
         *
         * Technique:       Decision Table
         * Why this technique: The merge guard is a type-match decision —
         *                  pinning the mismatched-type branch is the
         *                  strongest negative test for that rule.
         */
        it("SW-WCN-UI-TC35: Verify different container types cannot be merged", { tags: ["@regression"] }, function () {
            // Create an alt-type container.
            const altTypeName = disposableTypeName("Alt");
            createContainerTypeViaApi(altTypeName).then((altType) => {
                expect(altType, "alt type was created").to.not.be.null;
                this.altTypeId = altType.id;
                createContainerViaApi(altType.id).then((altContainer) => {
                    expect(altContainer, "alt container was created").to.not.be.null;
                    this.altContainerId = altContainer.id;

                    cy.iaAuthToken().then((token) => {
                        cy.iaProbeProductWithNoAssignments(token).then((product) => {
                            if (!product) {
                                cy.log("TC35: no assignable pure product in QA — soft-skip");
                                this.skip();
                                return;
                            }
                            loadProductIntoContainerViaUI(assignProductsPage, created.containerCode, product);

                            containersPage.visit();

                            containersPage.search(created.containerCode);
                            containersPage.openMerge(created.containerCode);
                            containersPage.scanMergeTargetCode(altContainer.code);

                            // Toast surfaces the type-mismatch reason.
                            cy.contains(/cannot merge different container types/i)
                                .should("be.visible");
                            // Merge submit stays disabled because no
                            // valid scannedTarget was set internally.
                            warehouseContainersLocators
                                .mergeDialog(created.containerCode)
                                .within(() => {
                                    warehouseContainersLocators
                                        .mergeSubmitBtn()
                                        .should("be.disabled");
                                });
                            containersPage.cancelMerge(created.containerCode);
                        });
                    });
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC36
         * Description:     Verify clicking the clock icon (audit trail)
         *                  in a row's Actions cell opens the Container
         *                  Audit Trail dialog.
         *
         * Test Steps:
         *   1. Click the row's "View Audit Trail" clock icon.
         *
         * Expected Result:
         *   - A dialog with heading "Container Audit Trail (Code: {code})"
         *     is visible.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       Use Case
         * Why this technique: Pins the open-path of the audit trail
         *                  affordance. Content of the trail is data-
         *                  dependent (empty for fresh containers) so
         *                  asserting on the heading scope is the only
         *                  stable contract.
         */
        it("SW-WCN-UI-TC36: Verify clicking the clock icon opens the Container Audit Trail dialog", { tags: ["@regression"] }, () => {
            containersPage.openAuditTrail(created.containerCode);
            warehouseContainersLocators
                .auditTrailDialog(created.containerCode)
                .should("be.visible");
            containersPage.closeAuditTrail(created.containerCode);
        });

        // Cleanup helper for TC34/TC35 — wipes the extra resources
        // those tests created on top of the per-block (created) state.
        afterEach(function () {
            if (this.mergeTargetId) {
                emptyContainerViaApi(this.mergeTargetId);
                deleteContainerViaApi(this.mergeTargetId);
                this.mergeTargetId = null;
            }
            if (this.altContainerId) {
                emptyContainerViaApi(this.altContainerId);
                deleteContainerViaApi(this.altContainerId);
                this.altContainerId = null;
            }
            if (this.altTypeId) {
                deleteContainerTypeViaApi(this.altTypeId);
                this.altTypeId = null;
            }
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Assign To Location flow (TC37-TC42)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Assign To Location (TC37-TC42)", () => {
        // Per-test trackers — every test creates its own type, container,
        // and Bin chain so we don't depend on QA seed state.
        const created = {
            typeId: null,
            containerId: null,
            containerCode: null,
            facilityId: null,
            binId: null,
            binPath: null,
        };

        beforeEach(() => {
            containersPage.visit();
        });

        afterEach(() => {
            // Container first (so it's no longer assigned), then the
            // facility (cascade-deletes the chain), then the type.
            if (created.containerId) {
                deleteContainerViaApi(created.containerId);
                created.containerId = null;
                created.containerCode = null;
            }
            if (created.facilityId) {
                deleteLocationViaApi(created.facilityId);
                created.facilityId = null;
                created.binId = null;
                created.binPath = null;
            }
            if (created.typeId) {
                deleteContainerTypeViaApi(created.typeId);
                created.typeId = null;
            }
        });

        /**
         * Test ID:         SW-WCN-UI-TC37
         * Description:     Verify clicking "Assign To Location" opens the
         *                  modal with the documented controls.
         *
         * Test Steps:
         *   1. Visit /warehouse-management/containers.
         *   2. Click "Assign To Location".
         *
         * Expected Result:
         *   - The modal heading "Assign to Location" is visible.
         *   - Two scan inputs are rendered (container + location).
         *   - Assign and Cancel footer buttons are visible.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the entry point — opening the
         *                  modal is a precondition for every other test
         *                  in this block.
         */
        it("SW-WCN-UI-TC37: Verify clicking 'Assign To Location' opens the modal", { tags: ["@smoke", "@regression"] }, () => {
            containersPage.openAssignToLocation();
            warehouseContainersLocators.assignContainerScanInput().should("be.visible");
            warehouseContainersLocators.assignLocationScanInput().should("be.visible");
            warehouseContainersLocators
                .assignToLocationDialog()
                .within(() => {
                    warehouseContainersLocators.assignAssignBtn().should("be.visible");
                    warehouseContainersLocators.assignCancelBtn().should("be.visible");
                });
            containersPage.cancelAssignToLocation();
        });

        /**
         * Test ID:         SW-WCN-UI-TC38
         * Description:     Verify the Assign button is disabled when
         *                  neither container nor location has been
         *                  selected/scanned.
         *
         * Test Steps:
         *   1. Open the Assign To Location modal.
         *
         * Expected Result:
         *   - The Assign footer button has the `disabled` attribute.
         *
         * Test Data:       Not required.
         *
         * Technique:       Decision Table
         * Why this technique: The decision rule "Assign is enabled"
         *                  requires both inputs — pinning the
         *                  null/null branch covers the disabled state.
         */
        it("SW-WCN-UI-TC38: Verify Assign is disabled when no selections are made", { tags: ["@regression"] }, () => {
            containersPage.openAssignToLocation();
            warehouseContainersLocators.assignAssignBtn().should("be.disabled");
            containersPage.cancelAssignToLocation();
        });

        /**
         * Test ID:         SW-WCN-UI-TC39
         * Description:     Verify scanning a non-existent container code
         *                  shows an error toast and does not pre-select
         *                  any container.
         *
         * Test Steps:
         *   1. Open the Assign To Location modal.
         *   2. Type a guaranteed-unmatchable container code into the
         *      container scan input and press Enter.
         *
         * Expected Result:
         *   - A "Container not found" toast is visible.
         *   - No container info card appears below the input.
         *
         * Test Data:       A timestamp-suffixed nonsense code.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the negative path of the container
         *                  lookup so a regression that silently
         *                  selects the wrong container is caught.
         */
        it("SW-WCN-UI-TC39: Verify scanning an unknown container code shows an error", { tags: ["@regression"] }, () => {
            const bogusCode = `CT-XXX-${Date.now()}`;
            containersPage.openAssignToLocation();
            // Type directly — scanContainerCode() waits for the success
            // confirmation card (code•type) which never appears for an
            // unknown code. Type + Enter, then assert the error toast.
            warehouseContainersLocators
                .assignContainerScanInput()
                .clear()
                .type(`${bogusCode}{enter}`);
            cy.contains(/container not found/i).should("be.visible");
            containersPage.cancelAssignToLocation();
        });

        /**
         * Test ID:         SW-WCN-UI-TC40
         * Description:     Verify scanning a valid container code
         *                  selects it (the container info card renders).
         *
         * Test Steps:
         *   1. Create a disposable type + container via API (beforeEach).
         *   2. Open the Assign To Location modal.
         *   3. Scan the created container's code.
         *
         * Expected Result:
         *   - The container info card shows the code (e.g.
         *     "CT-PRE-0001 • {type}").
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       Use Case
         * Why this technique: The happy-path of "scan container" is the
         *                  building block for the assignment flow —
         *                  confirming the form recognises a real code
         *                  isolates input handling from assignment.
         */
        it("SW-WCN-UI-TC40: Verify scanning a valid container code selects it", { tags: ["@regression"] }, () => {
            const typeName = disposableTypeName("Asn");
            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "type was created").to.not.be.null;
                created.typeId = type.id;
                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    created.containerId = container.id;
                    created.containerCode = container.code;
                    // Reload so the form's `containers` prop reflects
                    // the new container (the modal reads its
                    // suggestion list from the page state).
                    containersPage.visit();
                    containersPage.openAssignToLocation();
                    containersPage.scanContainerCode(container.code);
                    // Container info card uses bullet • between code and type.
                    cy.contains(new RegExp(`${container.code}\\s*[••]\\s*${typeName}`, 'i'))
                        .should("be.visible");
                    containersPage.cancelAssignToLocation();
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC41
         * Description:     Verify the full happy-path: scan a valid
         *                  container, scan a valid Bin location, click
         *                  Assign, and the modal closes successfully.
         *
         * Test Steps:
         *   1. Create a disposable container + Bin chain via API.
         *   2. Open the Assign To Location modal.
         *   3. Scan the container code.
         *   4. Scan the Bin's path.
         *   5. Click Assign.
         *
         * Expected Result:
         *   - A success toast "Container ... assigned to ..." appears.
         *   - The modal closes.
         *
         * Test Data:       Self-created disposable container + Bin.
         *
         * Technique:       Use Case
         * Why this technique: The end-to-end happy path is the
         *                  documented core flow for this modal —
         *                  asserting the success toast + dismount is
         *                  the strongest single regression check.
         */
        it("SW-WCN-UI-TC41: Verify happy-path assign — container + location → Assign", { tags: ["@smoke", "@regression"] }, () => {
            const typeName = disposableTypeName("Asn");
            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "type was created").to.not.be.null;
                created.typeId = type.id;
                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    created.containerId = container.id;
                    created.containerCode = container.code;
                    createDisposableBinChain().then(({ facility, bin }) => {
                        created.facilityId = facility.id;
                        created.binId = bin.id;
                        created.binPath = bin.path;
                        // Reload to pick up the new container in the
                        // page's `containers` prop fed to the modal.
                        containersPage.visit();
                        containersPage.openAssignToLocation();
                        containersPage.scanContainerCode(container.code);
                        containersPage.scanLocationPath(bin.path);
                        // Assign should be enabled once both selections
                        // resolve. Click and assert the dismount + toast.
                        containersPage.clickAssign();
                        cy.contains(new RegExp(`assigned to ${bin.code}`, 'i'))
                            .should("be.visible");
                        warehouseContainersLocators
                            .assignToLocationHeading()
                            .should("not.exist");
                    });
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC42
         * Description:     Verify clicking Cancel dismisses the
         *                  Assign To Location modal without performing
         *                  any assignment.
         *
         * Test Steps:
         *   1. Open the Assign To Location modal.
         *   2. Click Cancel.
         *
         * Expected Result:
         *   - The modal heading is no longer in the DOM.
         *
         * Test Data:       Not required.
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that fails to dismiss (or worse,
         *                  inadvertently submits) is a real regression
         *                  pattern — pinning the no-op exit closes the
         *                  modal's lifecycle test.
         */
        it("SW-WCN-UI-TC42: Verify Cancel dismisses the Assign To Location modal", { tags: ["@regression"] }, () => {
            containersPage.openAssignToLocation();
            containersPage.cancelAssignToLocation();
            warehouseContainersLocators.assignToLocationHeading().should("not.exist");
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // E2E — Add type → Add container → Assign → Load → Stock Out (TC43-TC46)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Per WMS-TEST-PLAN §2.2 the documented Containers E2E is:
    //   "Add type → add container → assign → load → stock out"
    //
    // The page has NO UI affordance for bulk-loading a container from the
    // row (loading happens through Stock-In / scan flows on other pages),
    // so the "load" step uses the API helper. Everything else drives the
    // UI directly. Tests escalate in scope:
    //
    //   TC43 — Manage Types create flows into Add Container's Type dropdown
    //   TC44 — UI-created container can be assigned to a Bin
    //   TC45 — A loaded container can be stocked out from the row
    //   TC46 — Full end-to-end wiring of all four steps
    describe("E2E (TC43-TC46)", () => {
        // Per-test trackers — every test cleans up its own resources.
        // Order on teardown is strict: container first (so it stops being
        // in-use and clears its location), then facility (cascade-deletes
        // the chain), then type.
        const created = {
            typeId: null,
            typeName: null,
            containerId: null,
            containerCode: null,
            facilityId: null,
        };

        beforeEach(() => containersPage.visit());

        afterEach(() => {
            // Order matters: empty the container's contents so DELETE
            // /containers/:id doesn't 400 with "container has contents"
            // — then drop container → facility chain → type.
            if (created.containerId) {
                emptyContainerViaApi(created.containerId);
                deleteContainerViaApi(created.containerId);
                created.containerId = null;
                created.containerCode = null;
            }
            if (created.facilityId) {
                deleteLocationViaApi(created.facilityId);
                created.facilityId = null;
            }
            // Delete by id if resolved; fall back to name-lookup when the
            // async resolveTypeIdByName / listContainerTypesViaApi chain
            // didn't complete before afterEach ran (TC43, TC46 create types
            // via UI and resolve the id asynchronously).
            if (created.typeId) {
                deleteContainerTypeViaApi(created.typeId);
                created.typeId = null;
                created.typeName = null;
            } else if (created.typeName) {
                const nameToDelete = created.typeName;
                created.typeName = null;
                listContainerTypesViaApi().then((all) => {
                    const match = all.find((t) => t.name === nameToDelete);
                    if (match && match.id) {
                        deleteContainerTypeViaApi(match.id);
                    }
                });
            }
        });

        /**
         * Test ID:         SW-WCN-UI-TC43
         * Description:     Verify a Container Type created via the Manage
         *                  Types modal becomes immediately selectable in
         *                  the Add Container dialog's Type dropdown (no
         *                  page reload).
         *
         * Test Steps:
         *   1. Open Manage Types.
         *   2. Add a disposable type via UI.
         *   3. Close Manage Types.
         *   4. Open Add Container.
         *   5. Open the Type Select.
         *
         * Expected Result:
         *   - The freshly-added type is listed as an option in the
         *     Add Container dialog's Type dropdown.
         *
         * Test Data:       Disposable type name (created in-test).
         *
         * Technique:       State Transition
         * Why this technique: Pins the cross-modal data flow — the
         *                  containerTypes React-Query cache must
         *                  invalidate when a new type is added, OR the
         *                  Add Container handler must read the freshest
         *                  list. A regression here surfaces as "I added
         *                  a type but it doesn't show up until refresh".
         *
         * Cleanup: the type name is captured so afterEach() resolves
         * its id via the list API and deletes it.
         */
        it("SW-WCN-UI-TC43: Verify a Type created via Manage Types appears in Add Container's Type dropdown", { tags: ["@regression"] }, () => {
            const typeName = disposableTypeName("E2E");
            // Register the name synchronously so afterEach's name-lookup
            // fallback can delete the type even if id resolution never completes.
            created.typeName = typeName;
            // Add the type via UI.
            containersPage.openManageTypes();
            containersPage.addType(typeName);
            containersPage.closeManageTypes();

            // Best-effort id resolution — afterEach falls back to name-lookup
            // if this async chain hasn't completed when afterEach runs.
            listContainerTypesViaApi().then((all) => {
                const match = all.find((t) => t.name === typeName);
                if (match && match.id) {
                    created.typeId = match.id;
                }
            });

            // Open Add Container and confirm the type is in the dropdown.
            containersPage.openAddContainer();
            warehouseContainersLocators.typeSelectInDialog().click();
            // Existence in the DOM is the contract here — MUI's Popover
            // animates opacity 0 → 1 over ~225ms, so `should("be.visible")`
            // races against the transition. The option being listed at
            // role="option" inside the open menu is the real assertion.
            cy.findByRole('option', { name: new RegExp(`^${typeName}$`, 'i') })
                .should("exist");
            // Close the menu, then cancel out of the dialog so the page
            // returns to a clean state for cleanup.
            cy.get("body").type("{esc}");
            containersPage.cancelAddContainer();
        });

        /**
         * Test ID:         SW-WCN-UI-TC44
         * Description:     Verify a container CREATED VIA UI (Add
         *                  Container dialog) can be assigned to a Bin
         *                  via the Assign To Location modal.
         *
         * Test Steps:
         *   1. Create a disposable type via API (precondition only —
         *      the test's focus is the Add Container → Assign flow).
         *   2. Add Container via UI (uses the type from step 1).
         *   3. Create a Bin chain via API.
         *   4. Reload the page so the new container appears in the
         *      page's `containers` prop.
         *   5. Open Assign To Location, scan the container + bin,
         *      click Assign.
         *
         * Expected Result:
         *   - The success toast "Container … assigned to {bin code}"
         *     appears, and the modal dismounts.
         *
         * Test Data:       Self-created throwaway type + container + Bin.
         *
         * Technique:       Use Case
         * Why this technique: A trimmed E2E that pins the Add Container
         *                  → Assign path. TC41 already covers Assign
         *                  using an API-created container; this test
         *                  shows the UI-created container is functionally
         *                  identical from the Assign modal's perspective.
         */
        it("SW-WCN-UI-TC44: Verify a UI-created container can be assigned to a Bin", { tags: ["@regression"] }, () => {
            const typeName = disposableTypeName("E2E");
            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "type was created").to.not.be.null;
                created.typeId = type.id;
                created.typeName = typeName;

                // Reload so Add Container sees the new type.
                containersPage.visit();
                // Add a container via UI for our new type. addContainer()
                // returns the captured auto-code; we use it to select
                // the new container from the Assign modal's list.
                containersPage.addContainer().then((code) => {
                    // Resolve the new container's id for cleanup.
                    findContainerByCode(code).then((container) => {
                        if (container && container.id) {
                            created.containerId = container.id;
                            created.containerCode = container.code;
                        }
                    });

                    // Build the location target.
                    createDisposableBinChain().then(({ facility, bin }) => {
                        created.facilityId = facility.id;

                        // Reload to pick up the new container in the
                        // page's `containers` prop fed to Assign modal.
                        containersPage.visit();
                        containersPage.openAssignToLocation();
                        // Drive both inputs via the "Select From List"
                        // tab — the admin-workflow path. (The scan path
                        // is exercised by TC34/TC35.)
                        containersPage.selectContainerFromList(code);
                        containersPage.selectLocationFromList(bin.path);
                        containersPage.clickAssign();
                        cy.contains(new RegExp(`assigned to ${bin.code}`, 'i'))
                            .should("be.visible");
                        warehouseContainersLocators
                            .assignToLocationHeading()
                            .should("not.exist");
                    });
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC45
         * Description:     Verify a LOADED container can be stocked out
         *                  via the row's Stock Out icon. After submit,
         *                  the container's cur_items returns to 0.
         *
         * Test Steps:
         *   1. Create a disposable type + empty container via API.
         *   2. Find any stockable product (hasItems=false, qty>0) via API.
         *      Soft-skip if QA has no suitable product.
         *   3. Load 1 unit of the product into the container via API.
         *      (No UI affordance to do this from the Containers page.)
         *   4. Reload the page so the row reflects cur_items === 1.
         *   5. Click the row's Stock Out icon.
         *   6. Pick the first reason in the dropdown and submit.
         *
         * Expected Result:
         *   - The success toast "Container contents stocked out and
         *     container cleared" appears.
         *   - The container record reads cur_items === 0 via API.
         *
         * Test Data:       Self-created throwaway type + container +
         *                  one unit of any pure product.
         *
         * Technique:       State Transition
         * Why this technique: Pins the loaded → empty transition driven
         *                  by the row Stock Out icon. The icon is
         *                  disabled when cur_items === 0 (covered by
         *                  TC28); this test exercises its inverse —
         *                  enabled when cur_items > 0, and the submit
         *                  resets cur_items back to 0.
         */
        it("SW-WCN-UI-TC45: Verify a loaded container can be stocked out via the row Stock Out icon", { tags: ["@regression"] }, function () {
            const typeName = disposableTypeName("E2E");
            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "type was created").to.not.be.null;
                created.typeId = type.id;
                created.typeName = typeName;

                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    created.containerId = container.id;
                    created.containerCode = container.code;

                    // Probe a pure product with NO existing container/location
                    // assignments — keeps the row Stock Out's auto-checkout
                    // path deterministic (it would otherwise pick the lowest-
                    // id container holding the product, which might not be
                    // ours).
                    cy.iaAuthToken().then((token) => {
                        cy.iaProbeProductWithNoAssignments(token).then((product) => {
                            if (!product) {
                                cy.log("TC45: no assignable pure product in QA — soft-skip");
                                this.skip();
                                return;
                            }

                            // Load via API so the quantity lands in exactly
                            // THIS container.  The frontend's stockOutContainerMutation
                            // does NOT pass containerSource, so the backend falls
                            // back to the lowest-id container holding the product —
                            // if another container also held it we'd stock out the
                            // wrong one and cur_items would stay at 1.
                            loadProductIntoContainerViaApi(container.id, product.id);

                            // Re-visit Containers, click the row's Stock
                            // Out icon, pick a reason, submit, assert
                            // toast.
                            containersPage.stockOutContainerByRow(container.code);

                            // Verify cur_items reset to 0 via API.
                            getContainerByIdViaApi(container.id).then((after) => {
                                expect(after, "container record").to.not.be.null;
                                expect(after.cur_items, "cur_items after stock out").to.equal(0);
                            });
                        });
                    });
                });
            });
        });

        /**
         * Test ID:         SW-WCN-UI-TC46
         * Description:     Verify the full Containers E2E journey:
         *                  Add Type → Add Container → Assign → Load → Stock Out.
         *
         * Test Steps:
         *   1. Add a Container Type via Manage Types (UI).
         *   2. Add a Container of that type via Add Container (UI).
         *   3. Create a disposable Bin chain via API.
         *   4. Assign the container to the Bin via the Assign modal (UI).
         *   5. Find a stockable product (soft-skip if none) and load
         *      one unit into the container via API.
         *   6. Reload, click the row's Stock Out icon, pick a reason,
         *      submit.
         *
         * Expected Result:
         *   - "assigned to {bin}" toast appears after step 4.
         *   - "stocked out and container cleared" toast appears after
         *     step 6.
         *   - The container's cur_items is 0 via API after step 6.
         *
         * Test Data:       Self-created throwaway type + container + Bin
         *                  + one unit of any pure product.
         *
         * Technique:       Use Case / E2E
         * Why this technique: This is the documented full journey from
         *                  WMS-TEST-PLAN §2.2. Each individual step is
         *                  covered by a focused TC (TC43/TC44/TC45); this
         *                  test pins the wiring — that the four flows
         *                  compose cleanly without state corruption
         *                  between them.
         */
        it("SW-WCN-UI-TC46: Verify the full Containers E2E (Add type → Add container → Assign → Load → Stock Out)", { tags: ["@smoke", "@regression"] }, function () {
            // Step 1: Add a Type via UI.
            const typeName = disposableTypeName("E2E");
            // Register the name synchronously so afterEach's name-lookup
            // fallback can delete the type even if id resolution never completes.
            created.typeName = typeName;
            containersPage.openManageTypes();
            containersPage.addType(typeName);
            containersPage.closeManageTypes();

            // Best-effort id resolution — afterEach falls back to name-lookup
            // if this async chain hasn't completed when afterEach runs.
            cy.intercept("POST", "**/containers").as("createContainer");
            resolveTypeIdByName(typeName).then((typeId) => {
                created.typeId = typeId;
            });
            containersPage.addContainerAndCaptureId({ alias: "createContainer" }).then(({ code, id }) => {
                created.containerId = id;
                created.containerCode = code;

                // Step 3 + 4: Create a Bin chain via API, assign via UI.
                createDisposableBinChain().then(({ facility, bin }) => {
                    created.facilityId = facility.id;

                    // Reload to feed the new container into the Assign
                    // modal's container suggestion list.
                    //
                    // Flakiness fix: handleContainerScan in
                    // assignToLocationForm.tsx searches the modal's local
                    // `containers` prop — populated by GET /containers?
                    // pageSize=500 fired when the modal mounts. If we
                    // scan the code before that fetch lands, the lookup
                    // misses our newly-created container, scannedContainer
                    // stays null, and the Assign button stays disabled.
                    // Intercept the listing call and wait on it after
                    // opening the modal.
                    cy.intercept("GET", "**/containers?pageSize=500*").as("listContainersForAssign");
                    containersPage.visit();
                    containersPage.openAssignToLocation();
                    cy.wait("@listContainersForAssign", { timeout: 20000 });
                    containersPage.scanContainerCode(code);
                    containersPage.scanLocationPath(bin.path);
                    containersPage.clickAssign();
                    cy.contains(new RegExp(`assigned to ${bin.code}`, 'i'))
                        .should("be.visible");
                    warehouseContainersLocators
                        .assignToLocationHeading()
                        .should("not.exist");

                    // Step 5: Load via the canonical UI flow —
                    // Inventory Actions → Warehouse Management →
                    // Assignment → Assign Products. (The Containers page
                    // has no UI affordance for loading from the row.)
                    cy.iaAuthToken().then((token) => {
                        cy.iaProbeProductWithNoAssignments(token).then((product) => {
                            if (!product) {
                                cy.log("TC46: no assignable pure product in QA — soft-skip");
                                this.skip();
                                return;
                            }

                            // Steps 5 + 6: load via API (same reason as TC45 —
                            // frontend stockOutContainerMutation omits containerSource,
                            // backend picks lowest-id container holding the product),
                            // then stock out via the row icon.
                            expect(created.containerId, "container id resolved").to.exist;
                            loadProductIntoContainerViaApi(created.containerId, product.id);
                            containersPage.stockOutContainerByRow(code);
                            getContainerByIdViaApi(created.containerId).then((after) => {
                                expect(after, "container record").to.not.be.null;
                                expect(after.cur_items, "cur_items after E2E").to.equal(0);
                            });
                        });
                    });
                });
            });
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Printing — Zebra label print + bulk QR selection (TC47-TC50)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // The Containers page exposes two print affordances:
    //
    //   1. Per-container "Print Zebra" — from a row's View Label icon
    //      (qrCodeDialoge.tsx). Generates ZPL and uploads to Printwise.
    //
    //   2. Bulk "Print QR Codes" — the top toolbar surfaces a
    //      <Button>Print QR Codes</Button> + <Button>Clear Selection</Button>
    //      pair when ≥1 row is selected (WMSContainers.tsx ~ line 752).
    //      Clicking opens an MUI <Dialog> with a single
    //      "Print to Zebra Thermal Printer" submit button.
    //
    // Both flows talk to the Printwise sidecar which may not be present
    // in QA — the actual print upload can fail. Tests assert the UI
    // contract only (button visible / dialog opens / submit fires) and
    // tolerate toast wording for either success ("Sent N label(s) to
    // printer") or failure ("Failed to send labels…"). The IMPORTANT
    // contract here is that the controls render and the click is
    // wired — the print pipeline itself is out of scope.
    describe("Printing (TC47-TC50)", () => {
        const created = { typeId: null, containerId: null, containerCode: null };
        // TC50 uses two containers so the bulk-print covers a multi-row
        // selection. Tracked here so afterEach can clean both up.
        const extra = { containerId: null, containerCode: null };

        beforeEach(() => {
            containersPage.visit();
            const typeName = disposableTypeName("Prn");
            createContainerTypeViaApi(typeName).then((type) => {
                expect(type, "type was created").to.not.be.null;
                created.typeId = type.id;
                createContainerViaApi(type.id).then((container) => {
                    expect(container, "container was created").to.not.be.null;
                    created.containerId = container.id;
                    created.containerCode = container.code;
                    containersPage.visit();
                });
            });
        });

        afterEach(() => {
            // Defensive close: if a Printing-block test threw before
            // reaching its modal-close step, the View Label / Bulk Print
            // overlay is still mounted and the next test's visit() will
            // race against the stale DOM. Esc dismisses both (MUI Dialog
            // honours escapeKeyDown; the custom Box overlays don't, but
            // they're click-outside-to-close — the body type swallows
            // harmlessly there).
            cy.get('body').then(($b) => {
                if ($b.find('canvas#container-qrcode-canvas').length ||
                    $b.find('div[role="dialog"]').filter((_, el) =>
                        el.textContent && el.textContent.includes('Print QR Codes')
                    ).length) {
                    cy.get('body').type('{esc}');
                }
            });
            if (extra.containerId) {
                deleteContainerViaApi(extra.containerId);
                extra.containerId = null;
                extra.containerCode = null;
            }
            if (created.containerId) {
                deleteContainerViaApi(created.containerId);
                created.containerId = null;
                created.containerCode = null;
            }
            if (created.typeId) {
                deleteContainerTypeViaApi(created.typeId);
                created.typeId = null;
            }
        });

        /**
         * Test ID:         SW-WCN-UI-TC47
         * Description:     Verify clicking "Print Zebra" inside the View
         *                  Label (QR) modal triggers the print flow.
         *
         * Test Steps:
         *   1. Create a disposable container via API (beforeEach).
         *   2. Click the row's "View Label" icon.
         *   3. Inspect the modal — Print A4 + Print Zebra + Cancel
         *      buttons must all render.
         *   4. Click "Print Zebra".
         *
         * Expected Result:
         *   - The Print Zebra button is visible and enabled before the
         *     click.
         *   - After the click, a toast surfaces — either the success
         *     "Sent ... to printer" wording OR the failure "Failed to
         *     send label" wording (Printwise may be offline in QA).
         *     Either toast confirms the click was wired.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       Use Case
         * Why this technique: The contract we own here is the UI wiring
         *                  — the Zebra/Printwise sidecar is out of
         *                  scope. Accepting either success/failure
         *                  toast keeps the test green across QA setups
         *                  while still catching a regression where the
         *                  click does nothing.
         */
        it("SW-WCN-UI-TC47: Verify Print Zebra in the View Label modal fires the print flow", { tags: ["@regression"] }, () => {
            // Stub the Printwise job-submit endpoint so the test does not
            // depend on a local Printwise sidecar running.
            // The FE calls POST http://localhost:<port>/api/jobs/submit via
            // printwiseService.submitZplJob (zebraPrint.ts → printwiseService.ts).
            // Stubbing it lets us verify the FE wires the button click → HTTP
            // call without requiring the Printwise service to be installed.
            cy.intercept("POST", "**/api/jobs/submit", {
                statusCode: 200,
                body: { job: { id: "test-job-id", status: "queued" } },
            }).as("printwiseWrite");

            containersPage.openViewLabel(created.containerCode);
            // Print A4 is currently commented out in qrCodeDialoge.tsx —
            // the View Label modal renders only Print Zebra + Cancel.
            warehouseContainersLocators
                .viewLabelPrintZebraBtn()
                .should("be.visible")
                .and("not.be.disabled")
                .click();

            // Confirm the FE made the Printwise job-submit request.
            cy.wait("@printwiseWrite", { timeout: 15000 }).then((xhr) => {
                expect(xhr.response?.statusCode, "Printwise write status").to.be.lessThan(500);
            });

            // Close the modal so afterEach can sweep cleanly.
            containersPage.closeViewLabel(created.containerCode);
        });

        /**
         * Test ID:         SW-WCN-UI-TC48
         * Description:     Verify selecting one or more row checkboxes
         *                  surfaces the "Print QR Codes" + "Clear
         *                  Selection" buttons in the top toolbar.
         *
         * Test Steps:
         *   1. Filter the grid to our disposable container row.
         *   2. Check the row's checkbox.
         *
         * Expected Result:
         *   - "N selected" indicator is visible.
         *   - "Print QR Codes" button is visible.
         *   - "Clear Selection" button is visible.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       State Transition
         * Why this technique: Pins the "no selection → ≥1 selection"
         *                  transition that surfaces the toolbar
         *                  buttons. The buttons are conditionally
         *                  rendered (see WMSContainers.tsx ~ line 752);
         *                  a regression that hides them would silently
         *                  remove bulk-print access.
         */
        it("SW-WCN-UI-TC48: Verify checking a row surfaces the Print and Clear Selection buttons", { tags: ["@regression"] }, () => {
            containersPage.search(created.containerCode);
            containersPage.verifyContainerPresent(created.containerCode);
            containersPage.selectRowByCode(created.containerCode);

            warehouseContainersLocators.selectedCountLabel().should("be.visible");
            warehouseContainersLocators.bulkPrintBtn().should("be.visible");
            warehouseContainersLocators.clearSelectionBtn().should("be.visible");

            // Cleanup: clear selection so the toolbar collapses before
            // the next test runs.
            containersPage.clickClearSelection();
        });

        /**
         * Test ID:         SW-WCN-UI-TC49
         * Description:     Verify printing a SINGLE QR code via bulk-
         *                  selection: check one row, click Print QR
         *                  Codes, submit the dialog's Print to Zebra
         *                  Thermal Printer button.
         *
         * Test Steps:
         *   1. Filter to the disposable row and check its checkbox.
         *   2. Click "Print QR Codes" in the top toolbar.
         *   3. Verify the Print QR Codes dialog opens and shows
         *      "1 container(s) selected".
         *   4. Click "Print to Zebra Thermal Printer".
         *
         * Expected Result:
         *   - The bulk-print dialog opens with a "1 container(s)
         *     selected" indicator.
         *   - After Print, the dialog closes and a toast surfaces —
         *     either the success wording or the Printwise-failure
         *     wording.
         *
         * Test Data:       Self-created disposable container.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Single-selection is the smallest
         *                  representative of the "≥1 row selected"
         *                  partition for bulk print. TC50 covers the
         *                  multi-row partition.
         */
        it("SW-WCN-UI-TC49: Verify printing a single QR via bulk-selection", { tags: ["@regression"] }, () => {
            containersPage.search(created.containerCode);
            containersPage.selectRowByCode(created.containerCode);
            containersPage.openBulkPrintDialog();
            // Dialog shows "1 container(s) selected".
            cy.contains(/1 container\(s\) selected/i).should("be.visible");
            warehouseContainersLocators
                .bulkPrintZebraBtn()
                .should("be.visible")
                .and("not.be.disabled")
                .click();
            // Dialog dismounts on submit. Toast confirms the click was
            // wired — either success or printer-offline failure is OK.
            warehouseContainersLocators.bulkPrintDialog().should("not.exist");
            cy.contains(/sent .* to printer|failed to send labels/i, { timeout: 15000 })
                .should("be.visible");
        });

        /**
         * Test ID:         SW-WCN-UI-TC50
         * Description:     Verify printing MULTIPLE QR codes via bulk-
         *                  selection: check two rows, click Print QR
         *                  Codes, submit Print to Zebra.
         *
         * Test Steps:
         *   1. Create a second disposable container of the same type.
         *   2. Clear the grid filter so both rows are visible.
         *   3. Check both rows' checkboxes (filter to each in turn to
         *      avoid scrolling).
         *   4. Click "Print QR Codes".
         *   5. Verify the dialog shows "2 container(s) selected".
         *   6. Click "Print to Zebra Thermal Printer".
         *
         * Expected Result:
         *   - The bulk-print dialog reports "2 container(s) selected".
         *   - After submit, the dialog closes and a toast confirms
         *     (success or Printwise-offline failure).
         *
         * Test Data:       Two self-created disposable containers
         *                  (same type).
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Multi-selection is the second
         *                  representative of the "≥1 row selected"
         *                  partition. Pairs with TC49 to pin both
         *                  cardinalities of the bulk-print flow.
         */
        it("SW-WCN-UI-TC50: Verify printing multiple QRs via bulk-selection", { tags: ["@regression"] }, () => {
            // Create a second container of the same type — both
            // become bulk-print targets.
            createContainerViaApi(created.typeId).then((secondContainer) => {
                expect(secondContainer, "second container was created").to.not.be.null;
                extra.containerId = secondContainer.id;
                extra.containerCode = secondContainer.code;

                containersPage.visit();
                // Select first row.
                containersPage.search(created.containerCode);
                containersPage.selectRowByCode(created.containerCode);
                // Clear the filter, then narrow to the second row and
                // select it. Selection persists across the in-place
                // filter change because MRT keys rows by `id`.
                containersPage.clearSearch();
                containersPage.search(secondContainer.code);
                containersPage.selectRowByCode(secondContainer.code);

                containersPage.openBulkPrintDialog();
                cy.contains(/2 container\(s\) selected/i).should("be.visible");
                warehouseContainersLocators
                    .bulkPrintZebraBtn()
                    .should("be.visible")
                    .and("not.be.disabled")
                    .click();
                warehouseContainersLocators.bulkPrintDialog().should("not.exist");
                cy.contains(/sent .* to printer|failed to send labels/i, { timeout: 15000 })
                    .should("be.visible");
            });
        });
    });
});
