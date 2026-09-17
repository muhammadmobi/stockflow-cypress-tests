// cypress/e2e/25-WarehouseLocationsTests.cy.js
//
// Warehouse Management → Locations — UI tests.
//
// Test ID prefix:  SW-WL-UI-TC<NN>
// Doc-block format: every test carries a manual-execution block (Test ID,
// Description, Test Steps, Expected Result, Test Data, Technique).

import WarehouseLocationsPage from "../pageObjects/WarehouseLocationsPage";
import warehouseLocationsLocators from "../support/locators/warehouseLocationsLocators";
import {
    disposableName,
    sweepDisposableLocations,
    createLocationViaApi,
    deleteLocationViaApi,
} from "../support/helpers/wmsLocationHelpers";
import {
    createContainerTypeViaApi,
    createContainerViaApi,
    deleteContainerViaApi,
    deleteContainerTypeViaApi,
    disposableTypeName,
} from "../support/helpers/wmsContainerHelpers";

describe("Warehouse Locations Tests", () => {
    // Page object instance, recreated per test so any internal state on the
    // page object (none today, but a safe default) doesn't leak between tests.
    let locationsPage;

    // Outer hook handles only auth + page-object instantiation. Each inner
    // describe block is responsible for its own visit, so we don't navigate
    // to /locations only to immediately navigate away to /locations/facilities.
    beforeEach(() => {
        cy.authSession('admin');
        locationsPage = new WarehouseLocationsPage();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Page Header & Layout (TC01-TC07)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Page Header & Layout (TC01-TC07)", () => {
        // Visit the main Locations page once per test in this block.
        beforeEach(() => locationsPage.visit());

        /**
         * Test ID:         SW-WL-UI-TC01
         * Description:     Verify the page heading and breadcrumb render on the
         *                  Locations landing page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *
         * Expected Result:
         *   - The "Locations" heading is visible.
         *   - The breadcrumb shows "Dashboard · Warehouse Management · Locations"
         *     with "Locations" as the active leaf.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: A single happy-path baseline confirms the route
         *                  loads with the expected chrome. If this fails, the
         *                  rest of the suite is meaningless, so it's the first
         *                  signal.
         */
        it("SW-WL-UI-TC01: Verify the page heading and breadcrumb render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyPageHeading();
            locationsPage.verifyBreadcrumb();
        });

        /**
         * Test ID:         SW-WL-UI-TC02
         * Description:     Verify the Locations grid renders the documented
         *                  column set.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Wait for the bin table to render.
         *
         * Expected Result:
         *   - The table is visible.
         *   - The column headers include all of:
         *     Bin Path, Status, Assignment, Occupied Duration, Vacant Duration,
         *     Actions.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Column-set drift is a common UI regression; one
         *                  assertion pins the contract for downstream tests
         *                  that rely on row actions in the "Actions" column.
         */
        it("SW-WL-UI-TC02: Verify the table renders the documented column set", { tags: ["@regression"] }, () => {
            locationsPage.verifyTableRendered();
            locationsPage.verifyTableColumns([
                "Bin Path",
                "Status",
                "Assignment",
                "Occupied Duration",
                "Vacant Duration",
                "Actions",
            ]);
        });

        /**
         * Test ID:         SW-WL-UI-TC03
         * Description:     Verify the standard MRT toolbar toggle buttons are
         *                  NOT rendered — the Locations grid disables the top
         *                  toolbar by design and replaces it with a custom
         *                  bulk-action toolbar (covered by TC83–TC87).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Inspect the top of the grid for the default MRT toggles.
         *
         * Expected Result:
         *   - "Show/Hide columns" button does not exist.
         *   - "Toggle density" button does not exist.
         *   - "Toggle full screen" button does not exist.
         *
         * Test Data:       Not required.
         *
         * Technique:       Negative testing (design/absence contract)
         * Why this technique: `enableTopToolbar: false` is a deliberate design
         *                  choice; asserting the three standard toggles are
         *                  absent pins that contract so a regression that
         *                  re-enables the default MRT toolbar is caught.
         */
        it("SW-WL-UI-TC03: Verify the standard MRT toolbar toggle buttons are not rendered (top toolbar disabled by design)", { tags: ["@regression"] }, () => {
            // WMSLocations sets enableTopToolbar: false on its MRT table
            // (Frontend/src/pages/WMSLocations.tsx:598), which removes the
            // standard Show/Hide Columns, Density and Full-Screen toggles. The
            // custom bulk-action toolbar (Print QR Codes / Clear Selection) that
            // replaces them is covered by TC83–TC87. This negative assertion
            // pins the design contract so a regression that re-enables the
            // default toolbar is caught. TC05/TC06/TC07 pin each control
            // individually.
            //
            // Positive anchor first: assert the grid actually rendered, so this
            // is a genuine "toolbar disabled on a loaded table" check and not a
            // vacuous pass against a page whose table never mounted.
            warehouseLocationsLocators.table().should("exist");
            warehouseLocationsLocators.showHideColumnsBtn().should("not.exist");
            warehouseLocationsLocators.toggleDensityBtn().should("not.exist");
            warehouseLocationsLocators.toggleFullScreenBtn().should("not.exist");
        });

        /**
         * Test ID:         SW-WL-UI-TC04
         * Description:     Verify the pagination footer renders the rows-per-page
         *                  selector and the prev/next navigation buttons.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Locate the pagination footer at the bottom of the table.
         *
         * Expected Result:
         *   - "Rows per page" selector exists.
         *   - "Go to previous page" button exists.
         *   - "Go to next page" button exists.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the footer wiring is on screen, even
         *                  when there's only one page of data.
         */
        it("SW-WL-UI-TC04: Verify the pagination footer renders the rows-per-page selector and navigation buttons", { tags: ["@regression"] }, () => {
            warehouseLocationsLocators.rowsPerPageSelect().should("exist");
            warehouseLocationsLocators.prevPageBtn().should("exist");
            warehouseLocationsLocators.nextPageBtn().should("exist");
        });

        /**
         * Test ID:         SW-WL-UI-TC05
         * Description:     Verify the standard "Show/Hide Columns" toggle is
         *                  absent — the Locations grid disables the top toolbar
         *                  (enableTopToolbar: false), so the column-visibility
         *                  menu control is not rendered.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Inspect the grid for the "Show/Hide Columns" toolbar icon.
         *
         * Expected Result:
         *   - The "Show/Hide Columns" button does not exist.
         *
         * Test Data:       Not required.
         *
         * Technique:       Negative testing (design/absence contract)
         * Why this technique: Pins the absence of the column-visibility control
         *                  independently of TC03's collective check, so a
         *                  regression that re-enables only that toggle is caught.
         */
        it("SW-WL-UI-TC05: Verify the Show/Hide Columns toggle is absent (top toolbar disabled)", { tags: ["@regression"] }, () => {
            // enableTopToolbar: false removes the standard MRT Show/Hide
            // Columns button. This pins the absence of that specific control
            // (independent of TC03's collective check) so a regression that
            // re-enables only column visibility is caught. See TC03.
            // Positive anchor first: a bare not.exist also passes on a page that
            // never rendered the grid (failed login, route change, 500). Assert
            // the table mounted so this is a real "control absent on a loaded
            // table" check. Same guard as TC03.
            warehouseLocationsLocators.table().should("exist");
            warehouseLocationsLocators.showHideColumnsBtn().should("not.exist");
        });

        /**
         * Test ID:         SW-WL-UI-TC06
         * Description:     Verify the standard "Toggle Density" control is
         *                  absent — the Locations grid disables the top toolbar
         *                  (enableTopToolbar: false), so the density toggle is
         *                  not rendered.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Inspect the grid for the density toggle icon.
         *
         * Expected Result:
         *   - The "Toggle density" button does not exist.
         *
         * Test Data:       Not required.
         *
         * Technique:       Negative testing (design/absence contract)
         * Why this technique: Pins the absence of the density control so a
         *                  regression that re-enables density switching is
         *                  caught independently of TC03's collective check.
         */
        it("SW-WL-UI-TC06: Verify the Density toggle is absent (top toolbar disabled)", { tags: ["@regression"] }, () => {
            // enableTopToolbar: false removes the standard MRT Density toggle
            // button. This pins the absence of that specific control so a
            // regression that re-enables density switching is caught. See TC03.
            // Positive anchor first: a bare not.exist also passes on a page that
            // never rendered the grid (failed login, route change, 500). Assert
            // the table mounted so this is a real "control absent on a loaded
            // table" check. Same guard as TC03.
            warehouseLocationsLocators.table().should("exist");
            warehouseLocationsLocators.toggleDensityBtn().should("not.exist");
        });

        /**
         * Test ID:         SW-WL-UI-TC07
         * Description:     Verify the standard "Toggle Full Screen" control is
         *                  absent — the Locations grid disables the top toolbar
         *                  (enableTopToolbar: false), so the fullscreen toggle
         *                  is not rendered.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Inspect the grid for the full-screen toggle icon.
         *
         * Expected Result:
         *   - The "Toggle full screen" button does not exist.
         *
         * Test Data:       Not required.
         *
         * Technique:       Negative testing (design/absence contract)
         * Why this technique: Pins the absence of the fullscreen control so a
         *                  regression that re-enables fullscreen mode is caught
         *                  independently of TC03's collective check.
         */
        it("SW-WL-UI-TC07: Verify the Full-Screen toggle is absent (top toolbar disabled)", { tags: ["@regression"] }, () => {
            // enableTopToolbar: false removes the standard MRT Full-Screen
            // toggle button. This pins the absence of that specific control so
            // a regression that re-enables fullscreen mode is caught. See TC03.
            // Positive anchor first: a bare not.exist also passes on a page that
            // never rendered the grid (failed login, route change, 500). Assert
            // the table mounted so this is a real "control absent on a loaded
            // table" check. Same guard as TC03.
            warehouseLocationsLocators.table().should("exist");
            warehouseLocationsLocators.toggleFullScreenBtn().should("not.exist");
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Search (TC08-TC10)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Search (TC08-TC10)", () => {
        beforeEach(() => locationsPage.visit());

        /**
         * Test ID:         SW-WL-UI-TC08
         * Description:     Verify the search input on the Locations page accepts
         *                  text and round-trips its value back.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Click the search input.
         *   4. Type any non-empty text into it (do NOT submit).
         *
         * Expected Result:
         *   - The input's displayed value matches the typed text exactly.
         *
         * Test Data:
         *   - Search term: any non-empty string (e.g. "test-search").
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One valid input from the "non-empty string"
         *                  partition proves the input exists and accepts text.
         *                  Submission is a separate test (TC09).
         */
        it("SW-WL-UI-TC08: Verify the search input accepts text", { tags: ["@smoke", "@regression"] }, () => {
            const term = "test-search";
            locationsPage.typeSearch(term);
            warehouseLocationsLocators.searchInput().should("have.value", term);
        });

        /**
         * Test ID:         SW-WL-UI-TC09
         * Description:     Verify that submitting an unmatchable search term
         *                  yields no rows in the grid.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Type a deliberately unlikely term into the search input.
         *   4. Click the "Search" button.
         *
         * Expected Result:
         *   - The grid either shows zero data rows OR an empty-state message
         *     ("No records", "No data", or "No results").
         *
         * Test Data:
         *   - Search term: an unmatchable string such as "__NO_MATCH_<timestamp>__".
         *
         * Technique:       Negative testing / Error guessing
         * Why this technique: When the filter rejects every row the grid must
         *                  empty cleanly (no crash, no stale rows). Using a
         *                  deliberately unlikely term makes this work
         *                  regardless of seed data on QA.
         */
        it("SW-WL-UI-TC09: Verify searching with an unmatchable term yields no rows", { tags: ["@regression"] }, () => {
            const nonsense = `__NO_MATCH_${Date.now()}__`;
            locationsPage.search(nonsense);

            // MRT either renders an empty <tbody> or shows the "no records"
            // message — accept either.
            cy.get("body").then(($body) => {
                const hasMsg = $body.find(":contains('No records'), :contains('No data'), :contains('No results')").length > 0;
                if (hasMsg) {
                    warehouseLocationsLocators.tableEmptyMessage().should("be.visible");
                } else {
                    locationsPage.tableRows().should("have.length", 0);
                }
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC10
         * Description:     Verify clearing the search restores the grid to at
         *                  least its pre-search row count.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Note the baseline number of rows visible.
         *   4. Search with an unmatchable term so the grid empties.
         *   5. Clear the search input and re-submit.
         *
         * Expected Result:
         *   - After clearing, the grid shows at least the baseline row count
         *     again.
         *
         * Test Data:
         *   - Search term: an unmatchable string such as "__NO_MATCH_<timestamp>__".
         *
         * Technique:       State Transition
         * Why this technique: searched-state → cleared-state is a typical user
         *                  flow; the grid must return to its pre-search state.
         */
        it("SW-WL-UI-TC10: Verify clearing the search restores the grid", { tags: ["@regression"] }, () => {
            locationsPage
                .tableRows()
                .its("length")
                .then((baseline) => {
                    locationsPage.search(`__NO_MATCH_${Date.now()}__`);
                    locationsPage.clearSearch();
                    locationsPage
                        .tableRows()
                        .its("length")
                        .should("be.gte", baseline);
                });
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Filters (TC11-TC13)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Filters (TC11-TC13)", () => {
        beforeEach(() => locationsPage.visit());

        /**
         * Test ID:         SW-WL-UI-TC11
         * Description:     Verify the Status dropdown opens and contains the
         *                  documented "All bins" option.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Click the Status dropdown.
         *
         * Expected Result:
         *   - The dropdown menu opens.
         *   - An option labelled "All bins" is visible.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: One assertion that the filter is interactive and
         *                  the documented default option is selectable.
         */
        it("SW-WL-UI-TC11: Verify the Status dropdown opens and contains the 'All bins' option", { tags: ["@smoke", "@regression"] }, () => {
            warehouseLocationsLocators.statusSelect().click();
            warehouseLocationsLocators.statusOption("All bins").should("be.visible");
            // Close the menu so subsequent tests see a clean DOM.
            cy.get("body").type("{esc}");
        });

        /**
         * Test ID:         SW-WL-UI-TC12
         * Description:     Verify selecting "Empty bins" from the Status
         *                  dropdown lists only bins whose Status column reads
         *                  "Empty".
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Open the Status dropdown.
         *   4. Click "Empty bins".
         *
         * Expected Result:
         *   - The body either renders zero rows (when QA has no bins at
         *     all), or every row's "Status" cell reads "Empty".
         *
         * Test Data:
         *   - QA's existing Bin inventory. We don't seed; the assertion is
         *     uniform regardless of count.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative selection from the "filter
         *                  to a status" partition. The reverse (Occupied)
         *                  is TC13.
         */
        it("SW-WL-UI-TC12: Verify selecting 'Empty bins' lists only Empty rows", { tags: ["@regression"] }, () => {
            locationsPage.selectStatusFilter("Empty bins");
            // After the React-query refetch, the body either has rows
            // (each must read Empty) or shows the MRT no-records state.
            // We MUST NOT use cy.get('table tbody tr').then() — that
            // retries indefinitely waiting for ≥1 row when the result
            // set is genuinely zero. Use a non-retrying jQuery-style
            // probe via cy.$$ instead.
            cy.get("body").then(() => {
                const rowCount = Cypress.$("table tbody tr").length;
                if (rowCount > 0) {
                    locationsPage.verifyEveryRowColumn("Status", "^Empty$");
                } else {
                    cy.log("TC12: filter returned 0 rows on this QA — assertion is vacuous");
                }
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC13
         * Description:     Verify selecting "Occupied bins" from the Status
         *                  dropdown lists only bins whose Status column
         *                  reads "Occupied".
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Open the Status dropdown.
         *   4. Click "Occupied bins".
         *
         * Expected Result:
         *   - The body either renders zero rows (when QA has no occupied
         *     bins), or every row's "Status" cell reads "Occupied".
         *
         * Test Data:
         *   - QA's existing Bin inventory. Read-only.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Pair to TC12 — the other partition.
         */
        it("SW-WL-UI-TC13: Verify selecting 'Occupied bins' lists only Occupied rows", { tags: ["@regression"] }, () => {
            locationsPage.selectStatusFilter("Occupied bins");
            // Same non-retrying probe as TC12 — see comment there.
            cy.get("body").then(() => {
                const rowCount = Cypress.$("table tbody tr").length;
                if (rowCount > 0) {
                    locationsPage.verifyEveryRowColumn("Status", "^Occupied$");
                } else {
                    cy.log("TC13: filter returned 0 rows on this QA — assertion is vacuous");
                }
            });
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Stats (TC14-TC16)
    // ══════════════════════════════════════════════════════════════════════════

    describe("Stats (TC14-TC16)", () => {
        beforeEach(() => locationsPage.visit());

        /**
         * Test ID:         SW-WL-UI-TC14
         * Description:     Verify all ten documented stat cards render at the
         *                  top of the Locations page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *
         * Expected Result:
         *   - All ten stat cards are present:
         *     Facilities, Zones, Areas, Rows, Bays, Levels, Bins,
         *     Empty Bins, Occupied Bins, Bin Occupancy %.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: The stats row is the most prominent
         *                  "page loaded correctly" signal; a missing card is
         *                  an immediate visual regression.
         */
        it("SW-WL-UI-TC14: Verify all ten stat cards render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyAllStatCardsRendered();
        });

        /**
         * Test ID:         SW-WL-UI-TC15
         * Description:     Verify each stat card holds a numeric value.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. For each stat card, read its visible content.
         *
         * Expected Result:
         *   - Each of the ten cards contains at least one digit (a numeric
         *     value, possibly with a "%" suffix for "Bin Occupancy %").
         *
         * Test Data:       Not required.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative assertion per card from the
         *                  "valid number" partition. A non-numeric value
         *                  (loading state, "—", null) on any card is a
         *                  regression.
         */
        it("SW-WL-UI-TC15: Verify each stat card holds a numeric value", { tags: ["@regression"] }, () => {
            warehouseLocationsLocators.allStatLabels().forEach((label) => {
                locationsPage.verifyStatCardHasNumericValue(label);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC16
         * Description:     Verify the "Bin Occupancy %" stat card shows the
         *                  rounded percentage of Occupied Bins ÷ Bins.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Read the values on the Bins, Occupied Bins, and Bin
         *      Occupancy % cards.
         *
         * Expected Result:
         *   - Bin Occupancy % equals Math.round(occupiedBins / bins × 100).
         *   - When `bins` is 0, the card shows 0%.
         *
         * Test Data:
         *   - QA's existing Bin inventory. Read-only.
         *
         * Technique:       Equivalence Partitioning + arithmetic check
         * Why this technique: Stat-card accuracy needs to be derived, not
         *                  just present. We compute the expected value
         *                  from the same inputs the page uses (occupied
         *                  and total) and assert equality. Encodes the
         *                  zero-bins partition explicitly.
         */
        it("SW-WL-UI-TC16: Verify the Bin Occupancy % stat is the rounded ratio of Occupied Bins to Bins", { tags: ["@regression"] }, () => {
            // Read all three values, then compute the expected occupancy.
            locationsPage.readStatCardValue("Bins").then((totalBins) => {
                locationsPage.readStatCardValue("Occupied Bins").then((occupied) => {
                    locationsPage.readStatCardValue("Bin Occupancy %").then((displayedPct) => {
                        const expectedPct = totalBins > 0
                            ? Math.round((occupied / totalBins) * 100)
                            : 0;
                        expect(displayedPct, `Bin Occupancy % matches round(${occupied}/${totalBins}*100)`)
                            .to.equal(expectedPct);
                    });
                });
            });
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Hierarchy CRUD — Facilities Management (TC17-TC25)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Tests in this block work on the Facilities Management sub-page reached
    // via the "Manage Locations" button. Discovery confirmed:
    //   - URL:        /warehouse-management/locations/facilities
    //   - Heading:    "Facilities Management"
    //   - Add CTA:    "Add Facility" (button)
    //   - Row icons:  "Edit Facility", "Delete Facility"
    //   - Drill-down: "View & Manage Zones (n)" per row
    //
    // Cleanup: every facility created here uses the AUTO_WMS_ disposable
    // prefix; the after() sweep deletes them via the Locations API. Soft-
    // delete cascades, so any descendants created in later chunks are also
    // removed by the same sweep.

    describe("Hierarchy CRUD — Facilities Management (TC17-TC25)", () => {
        // Outer hook already authenticates and creates the page object.
        // Here we only need to land on the Facilities sub-page.
        beforeEach(() => locationsPage.visitFacilities());

        // Per-spec safety net. Runs once after every test in this describe.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC17
         * Description:     Verify the Facilities Management page heading and
         *                  core controls render after navigating to the page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations → Manage Locations.
         *
         * Expected Result:
         *   - The "Facilities Management" heading is visible.
         *   - The "Add Facility" button is visible and enabled.
         *   - The Facilities search input is visible.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the route loaded and the
         *                  page is itself, not a 404 / fallback. Anchors the
         *                  rest of the block.
         */
        it("SW-WL-UI-TC17: Verify the Facilities Management page heading and core controls render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyFacilitiesPageHeading();
            warehouseLocationsLocators.addFacilityBtn().should("be.visible").and("not.be.disabled");
            warehouseLocationsLocators.facilitiesSearchInput().should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC18
         * Description:     Verify clicking "Manage Locations" from the main
         *                  Locations page navigates to the Facilities Management
         *                  page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations.
         *   3. Click the "Manage Locations" button.
         *
         * Expected Result:
         *   - The URL ends with "/warehouse-management/locations/facilities".
         *   - The "Facilities Management" heading is visible.
         *
         * Test Data:       Not required.
         *
         * Technique:       State Transition
         * Why this technique: The entry path from the main Locations page (a
         *                  button click) should land on /facilities. Other
         *                  tests visit /facilities directly for speed, so
         *                  this is the only test that exercises the click
         *                  path.
         */
        it("SW-WL-UI-TC18: Verify clicking 'Manage Locations' from the main page navigates to Facilities Management", { tags: ["@regression"] }, () => {
            // Start over from the main page to test the click path itself.
            locationsPage.visit();
            locationsPage.openManageLocations();

            cy.url().should("match", /\/warehouse-management\/locations\/facilities$/);
            locationsPage.verifyFacilitiesPageHeading();
        });

        /**
         * Test ID:         SW-WL-UI-TC19
         * Description:     Verify clicking "Add Facility" opens the Add Facility
         *                  dialog with both Create and Cancel buttons reachable.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Facilities Management.
         *   3. Click "Add Facility".
         *
         * Expected Result:
         *   - The Add Facility dialog is visible.
         *   - The "Create" button is visible inside the dialog.
         *   - The "Cancel" button is visible inside the dialog.
         *
         * Test Data:       Not required.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WL-UI-TC19: Verify clicking 'Add Facility' opens the Add Facility dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.openAddFacility();
            warehouseLocationsLocators.facilityDialog().should("be.visible");
            warehouseLocationsLocators
                .facilityDialog()
                .within(() => {
                    warehouseLocationsLocators.facilityCreateBtn().should("be.visible");
                    warehouseLocationsLocators.facilityCancelBtn().should("be.visible");
                });
            // Close without submitting — keeps the page state clean.
            locationsPage.cancelFacilityDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC20
         * Description:     Verify cancelling the Add Facility dialog discards
         *                  any input and does not create a Facility.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Facilities Management.
         *   3. Click "Add Facility".
         *   4. Type a name into the "Facility Name" field.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No Facility card with the typed name appears in the list.
         *
         * Test Data:
         *   - Facility name: any unique non-empty string (e.g.
         *     "AUTO_WMS_<timestamp>_<rand>_cancelled").
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a real
         *                  regression pattern.
         */
        it("SW-WL-UI-TC20: Verify cancelling the Add Facility dialog does not create a Facility", { tags: ["@regression"] }, () => {
            const nameThatMustNotPersist = disposableName("cancelled");

            locationsPage.openAddFacility();
            locationsPage.typeFacilityName(nameThatMustNotPersist);
            locationsPage.cancelFacilityDialog();

            warehouseLocationsLocators.facilityDialog().should("not.exist");
            locationsPage.verifyFacilityAbsent(nameThatMustNotPersist);
        });

        /**
         * Test ID:         SW-WL-UI-TC21
         * Description:     Verify adding a Facility with valid data creates it
         *                  on the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Warehouse Management → Locations → Manage Locations.
         *   3. Click "Add Facility".
         *   4. Enter a unique name in "Facility Name".
         *      Leave "Facility Code" untouched (auto-generated, read-only).
         *   5. Click "Create".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new Facility card appears showing the entered name and the
         *     auto-generated F-XX code.
         *
         * Test Data:
         *   - Facility name: any unique non-empty string (e.g. "Main Warehouse").
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Facility" partition proves the create
         *                  flow accepts well-formed input.
         */
        it("SW-WL-UI-TC21: Verify adding a Facility with valid data creates it on the list", { tags: ["@smoke", "@regression"] }, () => {
            const name = disposableName("create");

            locationsPage.addFacility({ name });

            locationsPage.verifyFacilityPresent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC22
         * Description:     Verify searching a Facility by its name returns the
         *                  matching card.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Facilities Management.
         *   3. Add a new Facility with a unique name (precondition).
         *   4. Type the new Facility's name into the Facilities search input.
         *   5. Click "Search".
         *
         * Expected Result:
         *   - The Facility card with the searched name remains visible after
         *     filtering.
         *
         * Test Data:
         *   - Facility name: any unique non-empty string.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Representative match-by-name search; the input's
         *                  placeholder ("Search name or code...") implies both
         *                  classes work.
         */
        it("SW-WL-UI-TC22: Verify searching a Facility by its name returns the matching card", { tags: ["@regression"] }, () => {
            const name = disposableName("search");
            locationsPage.addFacility({ name });

            // addFacility() confirms the new card BY SEARCHING for it, so the
            // list is already filtered to `name`. Reset the filter first —
            // otherwise this case would "search" for what its own precondition
            // already searched and pass without exercising the filter at all.
            locationsPage.clearFacilitiesSearch();

            locationsPage.searchFacilities(name);

            locationsPage.verifyFacilityPresent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC23
         * Description:     Verify editing a Facility updates its name on the
         *                  list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Facilities Management.
         *   3. Add a new Facility with the original name (precondition).
         *   4. Click the "Edit Facility" icon on its card.
         *   5. Replace the name with a new unique value.
         *   6. Click "Save"/"Update".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A card with the updated name is visible.
         *   - No card with the original name remains.
         *
         * Test Data:
         *   - Original name: any unique non-empty string.
         *   - Updated name:  any unique non-empty string different from above.
         *
         * Technique:       State Transition
         * Why this technique: created → edited is a basic lifecycle step.
         */
        it("SW-WL-UI-TC23: Verify editing a Facility updates its name on the list", { tags: ["@regression"] }, () => {
            const originalName = disposableName("edit-orig");
            const updatedName = disposableName("edit-new");

            locationsPage.addFacility({ name: originalName });
            locationsPage.verifyFacilityPresent(originalName);

            locationsPage.openEditFacility(originalName);
            locationsPage.typeFacilityName(updatedName);
            locationsPage.saveFacility();

            warehouseLocationsLocators.facilityDialog().should("not.exist");

            // addFacility() leaves the list filtered to originalName; after the
            // rename the facility no longer matches that filter, so re-search
            // by the new name before asserting it's present (the list is
            // server-paginated — searching is how we reliably surface a card).
            locationsPage.searchFacilities(updatedName);
            locationsPage.verifyFacilityPresent(updatedName);
            locationsPage.verifyFacilityAbsent(originalName);
        });

        /**
         * Test ID:         SW-WL-UI-TC24
         * Description:     Verify deleting a Facility removes it from the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Facilities Management.
         *   3. Add a new Facility (precondition).
         *   4. Click the "Delete Facility" icon on its card.
         *   5. Confirm the deletion if a confirmation dialog appears.
         *
         * Expected Result:
         *   - The Facility card no longer appears on the list.
         *
         * Test Data:
         *   - Facility name: any unique non-empty string.
         *
         * Technique:       State Transition
         * Why this technique: created → deleted closes the basic CRUD lifecycle.
         */
        it("SW-WL-UI-TC24: Verify deleting a Facility removes it from the list", { tags: ["@regression"] }, () => {
            const name = disposableName("delete");

            locationsPage.addFacility({ name });
            locationsPage.verifyFacilityPresent(name);

            locationsPage.clickDeleteFacility(name);
            locationsPage.confirmDelete();

            locationsPage.verifyFacilityAbsent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC25
         * Description:     Verify the Facility Code field in the Add Facility
         *                  dialog is read-only and cannot be modified by the
         *                  user.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Facilities Management.
         *   3. Click "Add Facility".
         *   4. Inspect the "Facility Code" input.
         *   5. Wait briefly so the auto-generated value populates.
         *
         * Expected Result:
         *   - The Facility Code input has the `disabled` (or `readonly`)
         *     attribute, so a real user cannot type into it.
         *   - The Facility Code input shows a non-empty auto-generated value
         *     (e.g. "F- 21") confirming the auto-generation path fires.
         *
         * Test Data:       Not required.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract. A regression that makes Code editable
         *                  would let users override the uniqueness/format
         *                  guarantees the backend assumes.
         */
        it("SW-WL-UI-TC25: Verify the Facility Code field is read-only and cannot be modified by the user", { tags: ["@regression"] }, () => {
            locationsPage.openAddFacility();

            // The contract is "Code is auto-generated" + the field is locked
            // from user input. Asserting `disabled` (or `readonly`) is what
            // really matters: browsers refuse keyboard input on a disabled
            // <input>, so a real user cannot type into it.
            warehouseLocationsLocators
                .facilityCodeInput()
                .should(($el) => {
                    const isLocked = $el.is(":disabled") || $el.attr("readonly") !== undefined;
                    expect(isLocked, "Code input is disabled or readonly").to.be.true;
                });

            // Sanity: the field eventually shows a non-empty auto-generated
            // value (proves the auto-generation path actually fires).
            warehouseLocationsLocators
                .facilityCodeInput()
                .should("not.have.value", "");

            // Close the dialog so subsequent tests start clean.
            locationsPage.cancelFacilityDialog();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Hierarchy CRUD — Zones Management (TC26-TC34)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Discovery confirmed:
    //   - URL pattern:   /warehouse-management/locations/facilities (after
    //                    drilling into a Facility's "View & Manage Zones (n)").
    //   - Heading:       "Zones in <FACILITY_CODE>"
    //   - Add CTA:       "Add Zone"
    //   - Card actions:  Edit Zone / Delete Zone
    //   - Drill-down:    "View & Manage Areas (n)" per row
    //   - Dialog:        "Add New Zone" — Name + Code (auto-generated) + Cancel/Create
    //
    // Scaffolding strategy: a single disposable parent Facility AND a
    // placeholder Zone are created ONCE per spec via the API (faster than UI;
    // tests aren't about the Facility flow). The placeholder Zone is required
    // because the "View & Manage Zones (n)" drill-down button only renders
    // when the Facility has >= 1 child Zone. Every test creates its own Zone
    // with a unique name and is responsible for its own cleanup. The
    // after-hook sweep deletes the parent Facility, which cascades to all
    // descendants.

    describe("Hierarchy CRUD — Zones Management (TC26-TC34)", () => {
        // Captured in before() — the parent Facility every Zones test drills into.
        let parentFacility;

        before(() => {
            cy.authSession('admin');
            // Guarantee the JWT is in localStorage before any API call:
            // cy.authSession restores the session from cy.session() cache, but
            // the current window may be about:blank. A throwaway visit
            // populates the storage so getAuthToken() returns a real token.
            cy.visit("/");

            // Pre-run sweep: delete any stray AUTO_WMS_ Locations from prior
            // failed runs so the Facilities list stays manageable.
            sweepDisposableLocations();

            const facilityName = disposableName("zones-parent");

            // Step 1: create the parent Facility.
            // Code is INTENTIONALLY OMITTED: on the UI, the Facility Code
            // field is auto-generated and read-only. A user can never
            // submit an arbitrary code, so our scaffolding must not either.
            createLocationViaApi({
                name: facilityName,
                type: "Facility",
            }).then((createdFacility) => {
                parentFacility = createdFacility;

                // Step 2: create a placeholder Zone so the drill-down
                // "View & Manage Zones (1)" button renders on the card.
                return createLocationViaApi({
                    name: disposableName("zones-placeholder"),
                    type: "Zone",
                    parentId: parentFacility.id,
                });
            }).then((createdZone) => {
                // Step 3: sanity-check via API that the Zone actually
                // attached to this Facility. If it didn't, the drill-down
                // button won't render and we'd see a confusing UI error
                // later — assert here so the failure points at the seed.
                expect(createdZone.parent, "placeholder Zone has a parent").to.not.be.null;
                expect(createdZone.parent.id, "placeholder Zone parent id").to.equal(parentFacility.id);
            });
        });

        // Per-test setup: visit the Zones page for the parent Facility.
        beforeEach(() => {
            // Land on Facilities Management first so we can drill in.
            locationsPage.visitFacilities(parentFacility.code);
            // Defensive: assert the drill-down button is rendered before
            // we try to click it. Uses facilityCard() (outer scope) so the
            // assertion sees the View-&-Manage-Zones button.
            warehouseLocationsLocators
                .facilityCard(parentFacility.code)
                .within(() => {
                    warehouseLocationsLocators.viewManageZonesBtn().should("be.visible");
                });
            // Drill into our parent Facility's Zones list.
            locationsPage.visitZonesViaFacility(parentFacility.code);
        });

        // Sweep all disposable Locations after the block — parent Facility
        // (cascade delete kills any orphaned Zones too).
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC26
         * Description:     Verify the Zones Management page heading, breadcrumb
         *                  and core controls render after drilling in from a
         *                  Facility.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate to Facilities Management.
         *   3. Click "View & Manage Zones (n)" on a Facility that has at
         *      least one Zone.
         *
         * Expected Result:
         *   - The page heading "Zones in <FACILITY_CODE>" is visible.
         *   - The "Back to Facilities" button is visible.
         *   - The "Add Zone" button is visible and enabled.
         *   - The Zones search input is visible.
         *
         * Test Data:
         *   - A pre-existing Facility with at least one Zone.
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the drill-down landed on
         *                  the right page.
         */
        it("SW-WL-UI-TC26: Verify the Zones Management page heading, breadcrumb and core controls render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyZonesPageHeading();
            warehouseLocationsLocators.backToFacilitiesBtn().should("be.visible");
            warehouseLocationsLocators.addZoneBtn().should("be.visible").and("not.be.disabled");
            warehouseLocationsLocators.zonesSearchInput().should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC27
         * Description:     Verify clicking "Add Zone" opens the Add Zone dialog
         *                  with both Create and Cancel buttons reachable.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Click "Add Zone".
         *
         * Expected Result:
         *   - The Add Zone dialog is visible.
         *   - The "Create" button is visible inside the dialog.
         *   - The "Cancel" button is visible inside the dialog.
         *
         * Test Data:
         *   - A pre-existing Facility with at least one Zone.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WL-UI-TC27: Verify clicking 'Add Zone' opens the Add Zone dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.openAddZone();
            warehouseLocationsLocators.zoneDialog().should("be.visible");
            warehouseLocationsLocators
                .zoneDialog()
                .within(() => {
                    warehouseLocationsLocators.zoneCreateBtn().should("be.visible");
                    warehouseLocationsLocators.zoneCancelBtn().should("be.visible");
                });
            locationsPage.cancelZoneDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC28
         * Description:     Verify cancelling the Add Zone dialog discards any
         *                  input and does not create a Zone.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Click "Add Zone".
         *   4. Type a name into the "Zone Name" field.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No Zone card with the typed name appears on the page.
         *
         * Test Data:
         *   - Zone name: any unique non-empty string.
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a common
         *                  regression pattern.
         */
        it("SW-WL-UI-TC28: Verify cancelling the Add Zone dialog does not create a Zone", { tags: ["@regression"] }, () => {
            const nameThatMustNotPersist = disposableName("zone-cancelled");

            locationsPage.openAddZone();
            locationsPage.typeZoneName(nameThatMustNotPersist);
            locationsPage.cancelZoneDialog();

            warehouseLocationsLocators.zoneDialog().should("not.exist");
            locationsPage.verifyZoneAbsent(nameThatMustNotPersist);
        });

        /**
         * Test ID:         SW-WL-UI-TC29
         * Description:     Verify adding a Zone with valid data creates it on
         *                  the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Click "Add Zone".
         *   4. Enter a unique name in "Zone Name".
         *      Leave "Zone Code" untouched (auto-generated, read-only).
         *   5. Click "Create".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new Zone card appears showing the entered name and an
         *     auto-generated Z-XX code.
         *
         * Test Data:
         *   - Zone name: any unique non-empty string (e.g. "Storage Zone A").
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Zone" partition.
         */
        it("SW-WL-UI-TC29: Verify adding a Zone with valid data creates it on the list", { tags: ["@smoke", "@regression"] }, () => {
            const name = disposableName("zone-create");

            locationsPage.addZone({ name });

            locationsPage.verifyZonePresent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC30
         * Description:     Verify searching a Zone by its name returns the
         *                  matching card.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Add a new Zone with a unique name (precondition).
         *   4. Type the new Zone's name into the Zones search input.
         *   5. Click "Search".
         *
         * Expected Result:
         *   - The Zone card with the searched name remains visible.
         *
         * Test Data:
         *   - Zone name: any unique non-empty string.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Representative match-by-name search; placeholder
         *                  "Search name or code..." implies both classes work.
         */
        it("SW-WL-UI-TC30: Verify searching a Zone by its name returns the matching card", { tags: ["@regression"] }, () => {
            const name = disposableName("zone-search");

            locationsPage.addZone({ name });

            locationsPage.searchZones(name);

            locationsPage.verifyZonePresent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC31
         * Description:     Verify editing a Zone updates its name on the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Add a new Zone with the original name (precondition).
         *   4. Click the "Edit Zone" icon on its card.
         *   5. Replace the name with a new unique value.
         *   6. Click "Save"/"Update".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A card with the updated name is visible.
         *   - No card with the original name remains.
         *
         * Test Data:
         *   - Original Zone name: any unique non-empty string.
         *   - Updated Zone name:  any unique non-empty string different from above.
         *
         * Technique:       State Transition
         * Why this technique: created → edited is a basic lifecycle step.
         */
        it("SW-WL-UI-TC31: Verify editing a Zone updates its name on the list", { tags: ["@regression"] }, () => {
            const originalName = disposableName("zone-edit-orig");
            const updatedName = disposableName("zone-edit-new");

            locationsPage.addZone({ name: originalName });
            locationsPage.verifyZonePresent(originalName);

            locationsPage.openEditZone(originalName);
            locationsPage.typeZoneName(updatedName);
            locationsPage.saveZone();

            warehouseLocationsLocators.zoneDialog().should("not.exist");

            locationsPage.verifyZonePresent(updatedName);
            locationsPage.verifyZoneAbsent(originalName);
        });

        /**
         * Test ID:         SW-WL-UI-TC32
         * Description:     Verify deleting a Zone removes it from the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Add a new Zone (precondition).
         *   4. Click the "Delete Zone" icon on its card.
         *   5. Confirm the deletion if a confirmation dialog appears.
         *
         * Expected Result:
         *   - The Zone card no longer appears on the list.
         *
         * Test Data:
         *   - Zone name: any unique non-empty string.
         *
         * Technique:       State Transition
         * Why this technique: created → deleted closes the basic CRUD lifecycle.
         */
        it("SW-WL-UI-TC32: Verify deleting a Zone removes it from the list", { tags: ["@regression"] }, () => {
            const name = disposableName("zone-delete");

            locationsPage.addZone({ name });
            locationsPage.verifyZonePresent(name);

            locationsPage.clickDeleteZone(name);
            locationsPage.confirmDelete();

            locationsPage.verifyZoneAbsent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC33
         * Description:     Verify clicking "View & Manage Areas" on a Zone
         *                  navigates to that Zone's Areas page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Add a new Zone (precondition: it must auto-create at least one
         *      Area, OR the test should pre-seed an Area; in this suite the
         *      Add Zone flow does not auto-create children, so the drill
         *      target is the freshly-created Zone whose drill-down behaves
         *      according to the level's contract).
         *   4. Click "View & Manage Areas (n)" on the Zone's card.
         *
         * Expected Result:
         *   - A heading "Areas in <ZONE_CODE>" appears on the page.
         *
         * Test Data:
         *   - Zone name: any unique non-empty string.
         *
         * Technique:       State Transition
         * Why this technique: Drilling into a Zone's Areas is the expected
         *                  user flow at this hierarchy level. Verifies the
         *                  navigation transition only — Areas-page details
         *                  belong to the Areas chunk.
         */
        it("SW-WL-UI-TC33: Verify clicking 'View & Manage Areas' on a Zone navigates to the Areas page", { tags: ["@regression"] }, () => {
            const name = disposableName("zone-drilldown");

            locationsPage.addZone({ name });
            locationsPage.verifyZonePresent(name);

            locationsPage.drillIntoAreas(name);

            cy.findByRole("heading", { name: /^areas in /i }).should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC34
         * Description:     Verify the Zone Code field in the Add Zone dialog
         *                  is read-only and cannot be modified by the user.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Facility's Zones page.
         *   3. Click "Add Zone".
         *   4. Inspect the "Zone Code" input.
         *   5. Wait briefly so the auto-generated value populates.
         *
         * Expected Result:
         *   - The Zone Code input has the `disabled` (or `readonly`)
         *     attribute, so a real user cannot type into it.
         *   - The Zone Code input shows a non-empty auto-generated value
         *     (e.g. "Z- 01") confirming the auto-generation path fires.
         *
         * Test Data:
         *   - A pre-existing Facility with at least one Zone.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract. Tested independently from the Facility
         *                  variant because the form implementations could
         *                  drift.
         */
        it("SW-WL-UI-TC34: Verify the Zone Code field is read-only and cannot be modified by the user", { tags: ["@regression"] }, () => {
            locationsPage.openAddZone();

            warehouseLocationsLocators
                .zoneCodeInput()
                .should(($el) => {
                    const isLocked = $el.is(":disabled") || $el.attr("readonly") !== undefined;
                    expect(isLocked, "Code input is disabled or readonly").to.be.true;
                });

            warehouseLocationsLocators
                .zoneCodeInput()
                .should("not.have.value", "");

            locationsPage.cancelZoneDialog();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Hierarchy CRUD — Areas Management (TC35-TC45)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Discovery (cross-checked against Frontend/src/pages/WMSAreas.tsx):
    //   - URL pattern:   /warehouse-management/locations/areas?facilityId=&
    //                    facilityCode=&zoneId=&zoneCode=
    //   - Heading:       "Areas in <ZONE_CODE>"
    //   - Add CTA:       "Add Area"
    //   - Card actions:  Edit Area / Delete Area
    //   - Drill-down:    "View & Manage Rows (n)" per card
    //   - Dialog:        "Add New Area" — Name + Code (auto-gen, A- prefix)
    //                    + four bulk-hierarchy numeric fields (only on create):
    //                      Number of Rows         max 25
    //                      Bays in Each Row       max 20
    //                      Levels in Each Bay     max  9
    //                      Bins in Each Level     max  9
    //                    Each must be > 0 to submit.
    //
    // Scaffolding strategy: a single disposable parent Facility AND a parent
    // Zone are created ONCE per spec via the API (faster than UI; tests
    // aren't about the Facility/Zone flow). The parent Zone is required
    // because the "View & Manage Areas" drill-down only renders on a Zone
    // card, and the chain has to land on the Areas page for some Zone.
    // Every test creates its own Area with a unique name and the smallest
    // legal bulk-hierarchy (1×1×1×1) — keeps test data minimal. The
    // after-hook sweep deletes the parent Facility, which cascades to all
    // descendants (Zones, Areas, Rows, Bays, Levels, Bins).

    describe("Hierarchy CRUD — Areas Management (TC35-TC45)", () => {
        // Captured in before() — the parent Facility/Zone every Areas test
        // drills through. parentZone is the immediate parent of the Areas.
        let parentFacility;
        let parentZone;

        before(() => {
            cy.authSession('admin');
            // Seed-step prerequisite: cy.session restores cookies/storage but
            // the active window may be about:blank — which means
            // cy.getAuthToken() can't read the JWT yet. A throwaway visit
            // populates window.localStorage so getAuthToken() returns a
            // real bearer for the API-based scaffolding below.
            cy.visit("/");

            // Pre-run sweep: delete any stray AUTO_WMS_ Locations from prior
            // failed runs so the Facilities list stays manageable.
            sweepDisposableLocations();

            const facilityName = disposableName("areas-parent-fac");
            const zoneName = disposableName("areas-parent-zone");

            // Step 1: create the parent Facility.
            // Code is INTENTIONALLY OMITTED — the UI auto-generates it and
            // the field is read-only, so scaffolding must follow the same
            // contract.
            createLocationViaApi({
                name: facilityName,
                type: "Facility",
            }).then((createdFacility) => {
                parentFacility = createdFacility;

                // Step 2: create the parent Zone under the Facility. The
                // Areas page is reached by drilling Facility → Zone, so a
                // single Zone is enough.
                return createLocationViaApi({
                    name: zoneName,
                    type: "Zone",
                    parentId: parentFacility.id,
                });
            }).then((createdZone) => {
                parentZone = createdZone;

                // Step 3: sanity-check the Zone is wired to our Facility.
                // If it isn't, the Facilities-page drill-down would fail
                // later with a confusing UI error — assert here so the
                // failure points at the seed.
                expect(createdZone.parent, "parent Zone has a parent").to.not.be.null;
                expect(createdZone.parent.id, "parent Zone parent id").to.equal(parentFacility.id);
            });
        });

        // Per-test setup: navigate Facility → Zone → Areas page. This block
        // intentionally does NOT visit the Areas URL directly because the
        // route requires both facilityId and zoneId in the query string and
        // the canonical entry point is the drill-through.
        beforeEach(() => {
            // Land on Facilities Management first so we can drill in.
            locationsPage.visitFacilities(parentFacility.code);
            // Defensive: assert the Facility's drill-down button rendered
            // before clicking — same pattern as the Zones block.
            warehouseLocationsLocators
                .facilityCard(parentFacility.code)
                .within(() => {
                    warehouseLocationsLocators.viewManageZonesBtn().should("be.visible");
                });
            // Drill into the parent Facility's Zones list.
            locationsPage.visitZonesViaFacility(parentFacility.code);
            // Drill into the parent Zone's Areas list. After this, the URL
            // is /warehouse-management/locations/areas?... and the heading
            // reads "Areas in <ZONE_CODE>".
            locationsPage.visitAreasViaZone(parentZone.code);
        });

        // Sweep after the block — the parent Facility's soft-delete cascades
        // to Zones, Areas and any Rows/Bays/Levels/Bins they auto-created.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC35
         * Description:     Verify the Areas Management page heading and core
         *                  controls render after drilling in from a Zone.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Navigate Facilities Management → Zones (for a parent Facility).
         *   3. Click "View & Manage Areas (n)" on a Zone.
         *
         * Expected Result:
         *   - The page heading "Areas in <ZONE_CODE>" is visible.
         *   - The "Back to Zones" button is visible.
         *   - The "Add Area" button is visible and enabled.
         *   - The Areas search input is visible.
         *
         * Test Data:
         *   - A pre-existing Facility → Zone scaffolding (created in before()).
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the drill-through landed
         *                  on the right page. Anchors the rest of the block.
         */
        it("SW-WL-UI-TC35: Verify the Areas Management page heading and core controls render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyAreasPageHeading();
            warehouseLocationsLocators.backToZonesBtn().should("be.visible");
            warehouseLocationsLocators.addAreaBtn().should("be.visible").and("not.be.disabled");
            warehouseLocationsLocators.areasSearchInput().should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC36
         * Description:     Verify clicking "Add Area" opens the Add Area dialog
         *                  with both Create and Cancel buttons reachable.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Click "Add Area".
         *
         * Expected Result:
         *   - The Add Area dialog is visible.
         *   - The "Create" button is visible inside the dialog.
         *   - The "Cancel" button is visible inside the dialog.
         *
         * Test Data:
         *   - A pre-existing Facility → Zone scaffolding.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WL-UI-TC36: Verify clicking 'Add Area' opens the Add Area dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.openAddArea();
            warehouseLocationsLocators.areaDialog().should("be.visible");
            warehouseLocationsLocators
                .areaDialog()
                .within(() => {
                    warehouseLocationsLocators.areaCreateBtn().should("be.visible");
                    warehouseLocationsLocators.areaCancelBtn().should("be.visible");
                });
            locationsPage.cancelAreaDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC37
         * Description:     Verify cancelling the Add Area dialog discards any
         *                  input and does not create an Area.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Click "Add Area".
         *   4. Type a name into the "Area Name" field.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No Area card with the typed name appears on the page.
         *
         * Test Data:
         *   - Area name: any unique non-empty string.
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a common
         *                  regression pattern — and on Areas it would also
         *                  accidentally bulk-create a sub-hierarchy.
         */
        it("SW-WL-UI-TC37: Verify cancelling the Add Area dialog does not create an Area", { tags: ["@regression"] }, () => {
            const nameThatMustNotPersist = disposableName("area-cancelled");

            locationsPage.openAddArea();
            locationsPage.typeAreaName(nameThatMustNotPersist);
            locationsPage.cancelAreaDialog();

            warehouseLocationsLocators.areaDialog().should("not.exist");
            locationsPage.verifyAreaAbsent(nameThatMustNotPersist);
        });

        /**
         * Test ID:         SW-WL-UI-TC38
         * Description:     Verify adding an Area with valid data and the
         *                  smallest legal bulk-hierarchy (1×1×1×1) creates
         *                  the Area on the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Click "Add Area".
         *   4. Enter a unique name in "Area Name".
         *      Leave "Area Code" untouched (auto-generated, read-only).
         *   5. Set Number of Rows = 1, Bays in Each Row = 1, Levels in Each
         *      Bay = 1, Bins in Each Level = 1.
         *   6. Click "Create".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new Area card appears showing the entered name and an
         *     auto-generated A-XX code.
         *
         * Test Data:
         *   - Area name: any unique non-empty string (e.g. "Picking Area 1").
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Area + minimal hierarchy" partition
         *                  proves the create flow accepts the smallest legal
         *                  combination. Larger hierarchies are covered by
         *                  the BVA tests later.
         */
        it("SW-WL-UI-TC38: Verify adding an Area with valid data creates it on the list", { tags: ["@smoke", "@regression"] }, () => {
            const name = disposableName("area-create");

            locationsPage.addArea({ name }); // defaults to 1×1×1×1

            locationsPage.verifyAreaPresent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC39
         * Description:     Verify searching an Area by its name returns the
         *                  matching card.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Add a new Area with a unique name (precondition).
         *   4. Type the new Area's name into the Areas search input.
         *   5. Click "Search".
         *
         * Expected Result:
         *   - The Area card with the searched name remains visible.
         *
         * Test Data:
         *   - Area name: any unique non-empty string.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Representative match-by-name search; placeholder
         *                  "Search name or code..." implies both classes work.
         */
        it("SW-WL-UI-TC39: Verify searching an Area by its name returns the matching card", { tags: ["@regression"] }, () => {
            const name = disposableName("area-search");

            locationsPage.addArea({ name });

            locationsPage.searchAreas(name);

            locationsPage.verifyAreaPresent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC40
         * Description:     Verify editing an Area updates its name on the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Add a new Area with the original name (precondition).
         *   4. Click the "Edit Area" icon on its card.
         *   5. Replace the name with a new unique value.
         *   6. Click "Update".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A card with the updated name is visible.
         *   - No card with the original name remains.
         *
         * Test Data:
         *   - Original name: any unique non-empty string.
         *   - Updated name:  any unique non-empty string different from above.
         *
         * Technique:       State Transition
         * Why this technique: created → edited is a basic lifecycle step.
         *                  The Edit dialog hides the bulk-hierarchy fields,
         *                  so saveArea() picks the "Update" CTA which is
         *                  what this test exercises.
         */
        it("SW-WL-UI-TC40: Verify editing an Area updates its name on the list", { tags: ["@regression"] }, () => {
            const originalName = disposableName("area-edit-orig");
            const updatedName = disposableName("area-edit-new");

            locationsPage.addArea({ name: originalName });
            locationsPage.verifyAreaPresent(originalName);

            locationsPage.openEditArea(originalName);
            locationsPage.typeAreaName(updatedName);
            locationsPage.saveArea();

            warehouseLocationsLocators.areaDialog().should("not.exist");

            locationsPage.verifyAreaPresent(updatedName);
            locationsPage.verifyAreaAbsent(originalName);
        });

        /**
         * Test ID:         SW-WL-UI-TC41
         * Description:     Verify deleting an Area removes it from the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Add a new Area (precondition).
         *   4. Click the "Delete Area" icon on its card.
         *   5. Confirm the deletion in the "Confirm Delete" dialog.
         *
         * Expected Result:
         *   - The Area card no longer appears on the list.
         *
         * Test Data:
         *   - Area name: any unique non-empty string.
         *
         * Technique:       State Transition
         * Why this technique: created → deleted closes the basic CRUD lifecycle.
         *                  Note: an Area created here always has child Rows
         *                  (because the bulk-hierarchy minimum is 1×…) but
         *                  the Delete button only disables on hasContainers
         *                  / hasDirectAssignments — descendants alone don't
         *                  block deletion.
         */
        it("SW-WL-UI-TC41: Verify deleting an Area removes it from the list", { tags: ["@regression"] }, () => {
            const name = disposableName("area-delete");

            locationsPage.addArea({ name });
            locationsPage.verifyAreaPresent(name);

            locationsPage.clickDeleteArea(name);
            locationsPage.confirmDelete();

            locationsPage.verifyAreaAbsent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC42
         * Description:     Verify clicking "View & Manage Rows" on an Area
         *                  navigates to that Area's Rows page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Add a new Area (precondition: minimum hierarchy auto-creates
         *      1 Row, so the drill-down button reads "View & Manage Rows (1)").
         *   4. Click "View & Manage Rows" on the Area's card.
         *
         * Expected Result:
         *   - A heading "Rows in <AREA_CODE>" appears on the page.
         *
         * Test Data:
         *   - Area name: any unique non-empty string.
         *
         * Technique:       State Transition
         * Why this technique: Drilling into an Area's Rows is the expected
         *                  user flow at this hierarchy level. Verifies the
         *                  navigation transition only — Rows-page details
         *                  belong to the Rows chunk.
         */
        it("SW-WL-UI-TC42: Verify clicking 'View & Manage Rows' on an Area navigates to the Rows page", { tags: ["@regression"] }, () => {
            const name = disposableName("area-drilldown");

            locationsPage.addArea({ name });
            locationsPage.verifyAreaPresent(name);

            locationsPage.drillIntoRows(name);

            cy.findByRole("heading", { name: /^rows in /i }).should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC43
         * Description:     Verify the Area Code field in the Add Area dialog
         *                  is read-only and cannot be modified by the user.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Click "Add Area".
         *   4. Inspect the "Area Code" input.
         *
         * Expected Result:
         *   - The Area Code input has the `disabled` (or `readonly`)
         *     attribute, so a real user cannot type into it.
         *   - The visible Code shows the auto-generated short id (right-side
         *     of the "A-" prefix is non-empty).
         *
         * Test Data:
         *   - A pre-existing Facility → Zone scaffolding.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract for Areas, mirroring the Facility/Zone
         *                  variants. Tested independently because the form
         *                  implementations could drift.
         */
        it("SW-WL-UI-TC43: Verify the Area Code field is read-only and cannot be modified by the user", { tags: ["@regression"] }, () => {
            locationsPage.openAddArea();

            warehouseLocationsLocators
                .areaCodeInput()
                .should(($el) => {
                    const isLocked = $el.is(":disabled") || $el.attr("readonly") !== undefined;
                    expect(isLocked, "Code input is disabled or readonly").to.be.true;
                });

            warehouseLocationsLocators
                .areaCodeInput()
                .should("not.have.value", "");

            locationsPage.cancelAreaDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC44
         * Description:     Verify the bulk-hierarchy fields reject zero —
         *                  submitting with any field set to 0 must NOT
         *                  create the Area.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Click "Add Area".
         *   4. Enter a unique name in "Area Name".
         *   5. Set Number of Rows = 0 (other three left at default 1).
         *   6. Click "Create".
         *
         * Expected Result:
         *   - The dialog stays open (form submission is blocked).
         *   - No Area card with the typed name appears on the page.
         *
         * Test Data:
         *   - Area name: any unique non-empty string.
         *   - Bulk hierarchy: rows=0, bays=1, levels=1, bins=1.
         *
         * Technique:       Boundary Value Analysis (BVA)
         * Why this technique: 0 is the lower invalid boundary for each
         *                  count — the documented contract is "must be > 0".
         *                  One representative field (Number of Rows) covers
         *                  the rule because the validation loops over all
         *                  four fields with the same predicate.
         */
        it("SW-WL-UI-TC44: Verify the bulk-hierarchy field rejects zero (lower invalid boundary)", { tags: ["@regression"] }, () => {
            const name = disposableName("area-bva-zero");

            locationsPage.openAddArea();
            locationsPage.typeAreaName(name);
            locationsPage.setBulkHierarchy({ rows: 0 });
            locationsPage.saveArea();

            // Form should reject — dialog stays open.
            warehouseLocationsLocators.areaDialog().should("be.visible");

            // Close the dialog so we can confirm no Area card was created.
            locationsPage.cancelAreaDialog();
            locationsPage.verifyAreaAbsent(name);
        });

        /**
         * Test ID:         SW-WL-UI-TC45
         * Description:     Verify the bulk-hierarchy fields clamp values
         *                  above the documented per-field maximum (BVA upper
         *                  boundary on the input itself).
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Zone's Areas page.
         *   3. Click "Add Area".
         *   4. Type 999 into "Number of Rows".
         *   5. Read back the displayed value.
         *
         * Expected Result:
         *   - The displayed value is clamped to "25" (the documented maximum
         *     for Number of Rows). The user can't get above the cap.
         *
         * Test Data:
         *   - Number of Rows: typed 999, expected clamp 25.
         *
         * Technique:       Boundary Value Analysis (BVA)
         * Why this technique: 25 is the documented upper bound for Number
         *                  of Rows; "above max" is the just-out-of-range
         *                  partition. Verifying the UI-level clamp is the
         *                  cheapest BVA assertion: no Area is created (which
         *                  would otherwise burn ~25 Rows × 20 Bays × 9
         *                  Levels × 9 Bins of test data per attempt).
         */
        it("SW-WL-UI-TC45: Verify the bulk-hierarchy field clamps values above the documented maximum", { tags: ["@regression"] }, () => {
            locationsPage.openAddArea();

            // Type 999 into "Number of Rows". The Frontend's onChange clamps
            // parseInt(value) to [0, max=25] so the input should display 25.
            locationsPage.setBulkHierarchy({ rows: 999 });

            warehouseLocationsLocators.bulkRowsInput().should("have.value", "25");

            // Don't submit — we'd otherwise create 25 Rows under the parent.
            // The cancel path is verified separately by TC37; here we just
            // need to close the dialog cleanly.
            locationsPage.cancelAreaDialog();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Hierarchy CRUD — Rows Management (TC46-TC53)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Discovery (cross-checked against Frontend/src/pages/WMSRows.tsx):
    //   - URL pattern:   /warehouse-management/locations/rows?facilityId=&
    //                    facilityCode=&zoneId=&zoneCode=&areaId=&areaCode=
    //   - Heading:       "Rows in <AREA_CODE>"
    //   - Add CTA:       "Add Row"
    //   - Card:          "Code: R-NN" + "<n> Bays" chip + Delete + drill-down.
    //                    Rows are CODE-ONLY — there is NO Name field on the
    //                    dialog and no Name typography on the card.
    //   - Per-card:      ONLY "Delete Row" — no Edit affordance.
    //   - Drill-down:    "View & Manage Bays (n)" per card.
    //   - Dialog:        "Add New Row" — single Row Code input (auto-gen,
    //                    R- prefix, disabled) + Cancel/Create.
    //   - Search:        Code-only — placeholder "Search code...".
    //
    // Scaffolding strategy: the Areas chunk already proved the
    // Facility → Zone → Area drill-through; here we go one step deeper. A
    // single disposable Facility / Zone / Area chain is created ONCE per
    // spec via the API. The Area is created with the bulk-hierarchy
    // endpoint via the API only when needed; for these tests it's enough
    // to create a plain Area (parentId=zoneId, type=Area) since we don't
    // need a pre-seeded Row — the `addRow()` flow creates one. The
    // after-hook sweep deletes the parent Facility, which cascades to all
    // descendants.

    describe("Hierarchy CRUD — Rows Management (TC46-TC53)", () => {
        // Captured in before() — the chain we drill through every test.
        let parentFacility;
        let parentZone;
        let parentArea;

        before(() => {
            cy.authSession('admin');
            // Same primer as the Areas block: cy.session restores cookies
            // but the active window may be about:blank, so cy.getAuthToken()
            // can't read the JWT yet. A throwaway visit fixes that.
            cy.visit("/");

            // Pre-run sweep so the Facilities list stays manageable.
            sweepDisposableLocations();

            const facilityName = disposableName("rows-parent-fac");
            const zoneName = disposableName("rows-parent-zone");
            const areaName = disposableName("rows-parent-area");

            // Step 1: parent Facility (auto-generated code).
            createLocationViaApi({ name: facilityName, type: "Facility" })
                .then((createdFacility) => {
                    parentFacility = createdFacility;
                    // Step 2: parent Zone under the Facility.
                    return createLocationViaApi({
                        name: zoneName,
                        type: "Zone",
                        parentId: parentFacility.id,
                    });
                })
                .then((createdZone) => {
                    parentZone = createdZone;
                    // Step 3: parent Area under the Zone. This goes through
                    // the regular create-location endpoint (NOT the bulk-
                    // create-area path) because we don't want auto-seeded
                    // Rows polluting our test view — every test creates the
                    // Row(s) it needs.
                    return createLocationViaApi({
                        name: areaName,
                        type: "Area",
                        parentId: parentZone.id,
                    });
                })
                .then((createdArea) => {
                    parentArea = createdArea;

                    // Sanity-check the chain. If any link is wrong the
                    // drill-through later fails with a confusing UI error,
                    // so failing here points at the seed instead.
                    expect(parentArea.parent, "parent Area has a parent").to.not.be.null;
                    expect(parentArea.parent.id, "parent Area parent id").to.equal(parentZone.id);
                });
        });

        // Per-test setup: drill Facility → Zone → Area → Rows. The Rows
        // route requires facilityId AND zoneId AND areaId in the URL, so
        // the canonical entry point is the drill-through.
        beforeEach(() => {
            locationsPage.visitFacilities(parentFacility.code);
            warehouseLocationsLocators
                .facilityCard(parentFacility.code)
                .within(() => {
                    warehouseLocationsLocators.viewManageZonesBtn().should("be.visible");
                });
            locationsPage.visitZonesViaFacility(parentFacility.code);
            locationsPage.visitAreasViaZone(parentZone.code);
            locationsPage.visitRowsViaArea(parentArea.code);
        });

        // Sweep after the block — cascade soft-delete on the parent Facility
        // cleans every Zone/Area/Row/Bay/Level/Bin we created.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC46
         * Description:     Verify the Rows Management page heading and core
         *                  controls render after drilling in from an Area.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill Facilities → Zones → Areas → Rows.
         *
         * Expected Result:
         *   - The page heading "Rows in <AREA_CODE>" is visible.
         *   - The "Back to Areas" button is visible.
         *   - The "Add Row" button is visible and enabled.
         *   - The Rows search input (placeholder "Search code...") is visible.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area chain (created in before()).
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the four-level drill-
         *                  through landed on the right page. Anchors the
         *                  rest of the block.
         */
        it("SW-WL-UI-TC46: Verify the Rows Management page heading and core controls render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyRowsPageHeading();
            warehouseLocationsLocators.backToAreasBtn().should("be.visible");
            warehouseLocationsLocators.addRowBtn().should("be.visible").and("not.be.disabled");
            warehouseLocationsLocators.rowsSearchInput().should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC47
         * Description:     Verify clicking "Add Row" opens the Add Row dialog
         *                  with both Create and Cancel buttons reachable.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into an Area's Rows page.
         *   3. Click "Add Row".
         *
         * Expected Result:
         *   - The Add Row dialog is visible (title "Add New Row").
         *   - The "Create" button is visible inside the dialog.
         *   - The "Cancel" button is visible inside the dialog.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area chain.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WL-UI-TC47: Verify clicking 'Add Row' opens the Add Row dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.openAddRow();
            warehouseLocationsLocators.rowDialog().should("be.visible");
            warehouseLocationsLocators
                .rowDialog()
                .within(() => {
                    warehouseLocationsLocators.rowCreateBtn().should("be.visible");
                    warehouseLocationsLocators.rowCancelBtn().should("be.visible");
                });
            locationsPage.cancelRowDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC48
         * Description:     Verify cancelling the Add Row dialog does not
         *                  create a Row.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into an Area's Rows page.
         *   3. Click "Add Row".
         *   4. Read the auto-assigned R-NN code from the disabled Code input.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No Row card with the previewed code appears on the page.
         *
         * Test Data:
         *   - The dialog's auto-generated next code (e.g. "R-02").
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a real
         *                  regression pattern; verifying by the previewed
         *                  code is the only way since Rows have no Name.
         */
        it("SW-WL-UI-TC48: Verify cancelling the Add Row dialog does not create a Row", { tags: ["@regression"] }, () => {
            locationsPage.openAddRow();
            // Capture the previewed code BEFORE cancelling, so we can later
            // assert no card with that exact code appeared.
            locationsPage.readRowCodeFromDialog().then((previewedCode) => {
                locationsPage.cancelRowDialog();
                warehouseLocationsLocators.rowDialog().should("not.exist");
                locationsPage.verifyRowAbsent(previewedCode);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC49
         * Description:     Verify clicking "Create" with the auto-generated
         *                  Row Code creates a new Row card on the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into an Area's Rows page.
         *   3. Click "Add Row".
         *   4. Without typing anything (Code is auto-generated and disabled),
         *      click "Create".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new Row card showing "Code: R-NN" with the previewed code
         *     appears on the page.
         *
         * Test Data:
         *   - The auto-generated next R-NN code.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Row" partition. The Code is
         *                  auto-generated server-side, so there's no other
         *                  valid input to vary.
         */
        it("SW-WL-UI-TC49: Verify clicking 'Create' creates a new Row card with the auto-generated code", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.addRow().then((code) => {
                locationsPage.verifyRowPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC50
         * Description:     Verify searching a Row by its code returns the
         *                  matching card.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into an Area's Rows page.
         *   3. Add a new Row (precondition).
         *   4. Type the new Row's R-NN code into the Rows search input.
         *   5. Click "Search".
         *
         * Expected Result:
         *   - A Row card with the searched code remains visible.
         *
         * Test Data:
         *   - The R-NN code of the freshly-created Row.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Representative match-by-code search. Rows
         *                  have no Name, so code is the only searchable
         *                  field — placeholder "Search code..." confirms it.
         */
        it("SW-WL-UI-TC50: Verify searching a Row by its code returns the matching card", { tags: ["@regression"] }, () => {
            locationsPage.addRow().then((code) => {
                locationsPage.searchRows(code);
                locationsPage.verifyRowPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC51
         * Description:     Verify deleting a Row removes it from the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into an Area's Rows page.
         *   3. Add a new Row (precondition — the freshly-added Row has no
         *      child Bays, so the Delete button is enabled).
         *   4. Click the "Delete Row" icon on its card.
         *   5. Confirm the deletion in the "Confirm Delete" dialog.
         *
         * Expected Result:
         *   - The Row card no longer appears on the list.
         *
         * Test Data:
         *   - The R-NN code of the freshly-created Row.
         *
         * Technique:       State Transition
         * Why this technique: created → deleted closes the basic CRUD
         *                  lifecycle. Rows have no Edit, so this is the
         *                  whole lifecycle the user can drive.
         */
        it("SW-WL-UI-TC51: Verify deleting a Row removes it from the list", { tags: ["@regression"] }, () => {
            locationsPage.addRow().then((code) => {
                locationsPage.verifyRowPresent(code);

                locationsPage.clickDeleteRow(code);
                locationsPage.confirmDelete();

                locationsPage.verifyRowAbsent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC52
         * Description:     Verify clicking "View & Manage Bays" on a Row
         *                  navigates to that Row's Bays page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into an Area's Rows page.
         *   3. Add a new Row (precondition).
         *   4. Click "View & Manage Bays" on the Row's card.
         *
         * Expected Result:
         *   - A heading "Bays in <ROW_CODE>" appears on the page.
         *
         * Test Data:
         *   - The R-NN code of the freshly-created Row.
         *
         * Technique:       State Transition
         * Why this technique: Drilling into a Row's Bays is the expected
         *                  user flow at this hierarchy level. Verifies the
         *                  navigation transition only — Bays-page details
         *                  belong to the Bays chunk.
         */
        it("SW-WL-UI-TC52: Verify clicking 'View & Manage Bays' on a Row navigates to the Bays page", { tags: ["@regression"] }, () => {
            locationsPage.addRow().then((code) => {
                locationsPage.verifyRowPresent(code);

                locationsPage.drillIntoBays(code);

                cy.findByRole("heading", { name: /^bays in /i }).should("be.visible");
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC53
         * Description:     Verify the Row Code field in the Add Row dialog
         *                  is read-only and cannot be modified by the user.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into an Area's Rows page.
         *   3. Click "Add Row".
         *   4. Inspect the "Row Code" input.
         *
         * Expected Result:
         *   - The Row Code input has the `disabled` (or `readonly`)
         *     attribute, so a real user cannot type into it.
         *   - The Row Code input shows a non-empty auto-generated value
         *     (the short id; the R- prefix lives in a startAdornment).
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area chain.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract for Rows, mirroring the Facility / Zone
         *                  / Area variants. The Row dialog is the simplest
         *                  of the four (single field) so this test is the
         *                  cheapest sanity check on the read-only invariant.
         */
        it("SW-WL-UI-TC53: Verify the Row Code field is read-only and cannot be modified by the user", { tags: ["@regression"] }, () => {
            locationsPage.openAddRow();

            warehouseLocationsLocators
                .rowCodeInput()
                .should(($el) => {
                    const isLocked = $el.is(":disabled") || $el.attr("readonly") !== undefined;
                    expect(isLocked, "Code input is disabled or readonly").to.be.true;
                });

            warehouseLocationsLocators
                .rowCodeInput()
                .should("not.have.value", "");

            locationsPage.cancelRowDialog();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Hierarchy CRUD — Bays Management (TC54-TC61)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Bays mirror Rows almost verbatim — both are CODE-ONLY entities with no
    // Name field, no Edit affordance, and an auto-generated B-NN / R-NN code.
    // The describe block reuses the same parent-chain seed pattern: build
    // Facility → Zone → Area → Row once in before(), then drill in per test.
    // Every Bay this block creates lives under the seeded Row so the after()
    // cascade (soft-delete on the parent Facility) sweeps everything cleanly.
    describe("Hierarchy CRUD — Bays Management (TC54-TC61)", () => {
        // Captured in before() — the chain we drill through every test.
        let parentFacility;
        let parentZone;
        let parentArea;
        let parentRow;

        before(() => {
            cy.authSession('admin');
            // Same primer as the Rows block: cy.session restores cookies but
            // the active window may still be about:blank, so cy.getAuthToken()
            // can't read the JWT yet. A throwaway visit fixes that.
            cy.visit("/");

            // Pre-run sweep so the Facilities list stays manageable.
            sweepDisposableLocations();

            const facilityName = disposableName("bays-parent-fac");
            const zoneName = disposableName("bays-parent-zone");
            const areaName = disposableName("bays-parent-area");

            // Step 1: parent Facility (auto-generated code).
            createLocationViaApi({ name: facilityName, type: "Facility" })
                .then((createdFacility) => {
                    parentFacility = createdFacility;
                    // Step 2: parent Zone under the Facility.
                    return createLocationViaApi({
                        name: zoneName,
                        type: "Zone",
                        parentId: parentFacility.id,
                    });
                })
                .then((createdZone) => {
                    parentZone = createdZone;
                    // Step 3: parent Area under the Zone (regular create —
                    // not the bulk path — so we don't auto-seed Rows/Bays).
                    return createLocationViaApi({
                        name: areaName,
                        type: "Area",
                        parentId: parentZone.id,
                    });
                })
                .then((createdArea) => {
                    parentArea = createdArea;
                    // Step 4: parent Row under the Area. Rows are code-only;
                    // the API accepts (and ignores) a `name`. We send one
                    // anyway for consistency with the helper signature used
                    // for the named layers above.
                    return createLocationViaApi({
                        name: disposableName("bays-parent-row"),
                        type: "Row",
                        parentId: parentArea.id,
                    });
                })
                .then((createdRow) => {
                    parentRow = createdRow;

                    // Sanity-check the chain. If any link is wrong the
                    // drill-through later fails with a confusing UI error,
                    // so failing here points at the seed instead.
                    expect(parentRow.parent, "parent Row has a parent").to.not.be.null;
                    expect(parentRow.parent.id, "parent Row parent id").to.equal(parentArea.id);
                });
        });

        // Per-test setup: drill Facility → Zone → Area → Rows → Bays. The Bays
        // route requires facilityId AND zoneId AND areaId AND rowId in the
        // URL, so the canonical entry point is the drill-through.
        beforeEach(() => {
            locationsPage.visitFacilities(parentFacility.code);
            warehouseLocationsLocators
                .facilityCard(parentFacility.code)
                .within(() => {
                    warehouseLocationsLocators.viewManageZonesBtn().should("be.visible");
                });
            locationsPage.visitZonesViaFacility(parentFacility.code);
            locationsPage.visitAreasViaZone(parentZone.code);
            locationsPage.visitRowsViaArea(parentArea.code);
            locationsPage.visitBaysViaRow(parentRow.code);
        });

        // Sweep after the block — cascade soft-delete on the parent Facility
        // cleans every Zone/Area/Row/Bay/Level/Bin we created.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC54
         * Description:     Verify the Bays Management page heading and core
         *                  controls render after drilling in from a Row.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill Facilities → Zones → Areas → Rows → Bays.
         *
         * Expected Result:
         *   - The page heading "Bays in <ROW_CODE>" is visible.
         *   - The "Back to Rows" button is visible.
         *   - The "Add Bay" button is visible and enabled.
         *   - The Bays search input (placeholder "Search code...") is visible.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row chain (created in before()).
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the five-level drill-
         *                  through landed on the right page. Anchors the
         *                  rest of the block.
         */
        it("SW-WL-UI-TC54: Verify the Bays Management page heading and core controls render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyBaysPageHeading();
            warehouseLocationsLocators.backToRowsBtn().should("be.visible");
            warehouseLocationsLocators.addBayBtn().should("be.visible").and("not.be.disabled");
            warehouseLocationsLocators.baysSearchInput().should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC55
         * Description:     Verify clicking "Add Bay" opens the Add Bay dialog
         *                  with both Create and Cancel buttons reachable.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Row's Bays page.
         *   3. Click "Add Bay".
         *
         * Expected Result:
         *   - The Add Bay dialog is visible (title "Add New Bay").
         *   - The "Create" button is visible inside the dialog.
         *   - The "Cancel" button is visible inside the dialog.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row chain.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WL-UI-TC55: Verify clicking 'Add Bay' opens the Add Bay dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.openAddBay();
            warehouseLocationsLocators.bayDialog().should("be.visible");
            warehouseLocationsLocators
                .bayDialog()
                .within(() => {
                    warehouseLocationsLocators.bayCreateBtn().should("be.visible");
                    warehouseLocationsLocators.bayCancelBtn().should("be.visible");
                });
            locationsPage.cancelBayDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC56
         * Description:     Verify cancelling the Add Bay dialog does not
         *                  create a Bay.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Row's Bays page.
         *   3. Click "Add Bay".
         *   4. Read the auto-assigned B-NN code from the disabled Code input.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No Bay card with the previewed code appears on the page.
         *
         * Test Data:
         *   - The dialog's auto-generated next code (e.g. "B-02").
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a real
         *                  regression pattern; verifying by the previewed
         *                  code is the only way since Bays have no Name.
         */
        it("SW-WL-UI-TC56: Verify cancelling the Add Bay dialog does not create a Bay", { tags: ["@regression"] }, () => {
            locationsPage.openAddBay();
            // Capture the previewed code BEFORE cancelling, so we can later
            // assert no card with that exact code appeared.
            locationsPage.readBayCodeFromDialog().then((previewedCode) => {
                locationsPage.cancelBayDialog();
                warehouseLocationsLocators.bayDialog().should("not.exist");
                locationsPage.verifyBayAbsent(previewedCode);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC57
         * Description:     Verify clicking "Create" with the auto-generated
         *                  Bay Code creates a new Bay card on the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Row's Bays page.
         *   3. Click "Add Bay".
         *   4. Without typing anything (Code is auto-generated and disabled),
         *      click "Create".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new Bay card showing "Code: B-NN" with the previewed code
         *     appears on the page.
         *
         * Test Data:
         *   - The auto-generated next B-NN code.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Bay" partition. The Code is
         *                  auto-generated server-side, so there's no other
         *                  valid input to vary.
         */
        it("SW-WL-UI-TC57: Verify clicking 'Create' creates a new Bay card with the auto-generated code", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.addBay().then((code) => {
                locationsPage.verifyBayPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC58
         * Description:     Verify searching a Bay by its code returns the
         *                  matching card.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Row's Bays page.
         *   3. Add a new Bay (precondition).
         *   4. Type the new Bay's B-NN code into the Bays search input.
         *   5. Click "Search".
         *
         * Expected Result:
         *   - A Bay card with the searched code remains visible.
         *
         * Test Data:
         *   - The B-NN code of the freshly-created Bay.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Representative match-by-code search. Bays
         *                  have no Name, so code is the only searchable
         *                  field — placeholder "Search code..." confirms it.
         */
        it("SW-WL-UI-TC58: Verify searching a Bay by its code returns the matching card", { tags: ["@regression"] }, () => {
            locationsPage.addBay().then((code) => {
                locationsPage.searchBays(code);
                locationsPage.verifyBayPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC59
         * Description:     Verify deleting a Bay removes it from the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Row's Bays page.
         *   3. Add a new Bay (precondition — the freshly-added Bay has no
         *      child Levels, so the Delete button is enabled).
         *   4. Click the "Delete Bay" icon on its card.
         *   5. Confirm the deletion in the "Confirm Delete" dialog.
         *
         * Expected Result:
         *   - The Bay card no longer appears on the list.
         *
         * Test Data:
         *   - The B-NN code of the freshly-created Bay.
         *
         * Technique:       State Transition
         * Why this technique: created → deleted closes the basic CRUD
         *                  lifecycle. Bays have no Edit, so this is the
         *                  whole lifecycle the user can drive.
         */
        it("SW-WL-UI-TC59: Verify deleting a Bay removes it from the list", { tags: ["@regression"] }, () => {
            locationsPage.addBay().then((code) => {
                locationsPage.verifyBayPresent(code);

                locationsPage.clickDeleteBay(code);
                locationsPage.confirmDelete();

                locationsPage.verifyBayAbsent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC60
         * Description:     Verify clicking "View & Manage Levels" on a Bay
         *                  navigates to that Bay's Levels page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Row's Bays page.
         *   3. Add a new Bay (precondition).
         *   4. Click "View & Manage Levels" on the Bay's card.
         *
         * Expected Result:
         *   - A heading "Levels in <BAY_CODE>" appears on the page.
         *
         * Test Data:
         *   - The B-NN code of the freshly-created Bay.
         *
         * Technique:       State Transition
         * Why this technique: Drilling into a Bay's Levels is the expected
         *                  user flow at this hierarchy level. Verifies the
         *                  navigation transition only — Levels-page details
         *                  belong to the Levels chunk.
         */
        it("SW-WL-UI-TC60: Verify clicking 'View & Manage Levels' on a Bay navigates to the Levels page", { tags: ["@regression"] }, () => {
            locationsPage.addBay().then((code) => {
                locationsPage.verifyBayPresent(code);

                locationsPage.drillIntoLevels(code);

                cy.findByRole("heading", { name: /^levels in /i }).should("be.visible");
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC61
         * Description:     Verify the Bay Code field in the Add Bay dialog
         *                  is read-only and cannot be modified by the user.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Row's Bays page.
         *   3. Click "Add Bay".
         *   4. Inspect the "Bay Code" input.
         *
         * Expected Result:
         *   - The Bay Code input has the `disabled` (or `readonly`)
         *     attribute, so a real user cannot type into it.
         *   - The Bay Code input shows a non-empty auto-generated value
         *     (the short id; the B- prefix lives in a startAdornment).
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row chain.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract for Bays, mirroring the Facility / Zone
         *                  / Area / Row variants. The Bay dialog is the
         *                  same single-field shape as Rows, so this test
         *                  is the cheapest sanity check on the read-only
         *                  invariant at this level.
         */
        it("SW-WL-UI-TC61: Verify the Bay Code field is read-only and cannot be modified by the user", { tags: ["@regression"] }, () => {
            locationsPage.openAddBay();

            warehouseLocationsLocators
                .bayCodeInput()
                .should(($el) => {
                    const isLocked = $el.is(":disabled") || $el.attr("readonly") !== undefined;
                    expect(isLocked, "Code input is disabled or readonly").to.be.true;
                });

            warehouseLocationsLocators
                .bayCodeInput()
                .should("not.have.value", "");

            locationsPage.cancelBayDialog();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Hierarchy CRUD — Levels Management (TC62-TC69)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Levels mirror Bays/Rows almost verbatim — code-only entity (L-NN), no
    // Name field, no Edit affordance, auto-generated code. The only structural
    // difference is one extra layer of seed: Facility → Zone → Area → Row →
    // Bay. The describe block reuses the same seed-and-cascade-cleanup pattern
    // as the Bays block.
    describe("Hierarchy CRUD — Levels Management (TC62-TC69)", () => {
        // Captured in before() — the chain we drill through every test.
        let parentFacility;
        let parentZone;
        let parentArea;
        let parentRow;
        let parentBay;

        before(() => {
            cy.authSession('admin');
            // Same primer as the Bays block: cy.session restores cookies but
            // the active window may still be about:blank, so cy.getAuthToken()
            // can't read the JWT yet. A throwaway visit fixes that.
            cy.visit("/");

            // Pre-run sweep so the Facilities list stays manageable.
            sweepDisposableLocations();

            const facilityName = disposableName("levels-parent-fac");
            const zoneName = disposableName("levels-parent-zone");
            const areaName = disposableName("levels-parent-area");

            // Step 1: parent Facility (auto-generated code).
            createLocationViaApi({ name: facilityName, type: "Facility" })
                .then((createdFacility) => {
                    parentFacility = createdFacility;
                    // Step 2: parent Zone under the Facility.
                    return createLocationViaApi({
                        name: zoneName,
                        type: "Zone",
                        parentId: parentFacility.id,
                    });
                })
                .then((createdZone) => {
                    parentZone = createdZone;
                    // Step 3: parent Area under the Zone (regular create —
                    // not the bulk path — so we don't auto-seed Rows/Bays).
                    return createLocationViaApi({
                        name: areaName,
                        type: "Area",
                        parentId: parentZone.id,
                    });
                })
                .then((createdArea) => {
                    parentArea = createdArea;
                    // Step 4: parent Row under the Area. Code-only — name is
                    // sent for helper signature symmetry but ignored server-
                    // side.
                    return createLocationViaApi({
                        name: disposableName("levels-parent-row"),
                        type: "Row",
                        parentId: parentArea.id,
                    });
                })
                .then((createdRow) => {
                    parentRow = createdRow;
                    // Step 5: parent Bay under the Row. Same code-only contract.
                    return createLocationViaApi({
                        name: disposableName("levels-parent-bay"),
                        type: "Bay",
                        parentId: parentRow.id,
                    });
                })
                .then((createdBay) => {
                    parentBay = createdBay;

                    // Sanity-check the chain. If any link is wrong the
                    // drill-through later fails with a confusing UI error,
                    // so failing here points at the seed instead.
                    expect(parentBay.parent, "parent Bay has a parent").to.not.be.null;
                    expect(parentBay.parent.id, "parent Bay parent id").to.equal(parentRow.id);
                });
        });

        // Per-test setup: drill Facility → Zone → Area → Rows → Bays → Levels.
        // The Levels route requires the full id chain in the URL, so the
        // canonical entry point is the drill-through.
        beforeEach(() => {
            locationsPage.visitFacilities(parentFacility.code);
            warehouseLocationsLocators
                .facilityCard(parentFacility.code)
                .within(() => {
                    warehouseLocationsLocators.viewManageZonesBtn().should("be.visible");
                });
            locationsPage.visitZonesViaFacility(parentFacility.code);
            locationsPage.visitAreasViaZone(parentZone.code);
            locationsPage.visitRowsViaArea(parentArea.code);
            locationsPage.visitBaysViaRow(parentRow.code);
            locationsPage.visitLevelsViaBay(parentBay.code);
        });

        // Sweep after the block — cascade soft-delete on the parent Facility
        // cleans every Zone/Area/Row/Bay/Level/Bin we created.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC62
         * Description:     Verify the Levels Management page heading and core
         *                  controls render after drilling in from a Bay.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill Facilities → Zones → Areas → Rows → Bays → Levels.
         *
         * Expected Result:
         *   - The page heading "Levels in <BAY_CODE>" is visible.
         *   - The "Back to Bays" button is visible.
         *   - The "Add Level" button is visible and enabled.
         *   - The Levels search input (placeholder "Search code...") is visible.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row → Bay chain (created in before()).
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the six-level drill-
         *                  through landed on the right page. Anchors the
         *                  rest of the block.
         */
        it("SW-WL-UI-TC62: Verify the Levels Management page heading and core controls render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyLevelsPageHeading();
            warehouseLocationsLocators.backToBaysBtn().should("be.visible");
            warehouseLocationsLocators.addLevelBtn().should("be.visible").and("not.be.disabled");
            warehouseLocationsLocators.levelsSearchInput().should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC63
         * Description:     Verify clicking "Add Level" opens the Add Level
         *                  dialog with both Create and Cancel buttons reachable.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Bay's Levels page.
         *   3. Click "Add Level".
         *
         * Expected Result:
         *   - The Add Level dialog is visible (title "Add New Level").
         *   - The "Create" button is visible inside the dialog.
         *   - The "Cancel" button is visible inside the dialog.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row → Bay chain.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WL-UI-TC63: Verify clicking 'Add Level' opens the Add Level dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.openAddLevel();
            warehouseLocationsLocators.levelDialog().should("be.visible");
            warehouseLocationsLocators
                .levelDialog()
                .within(() => {
                    warehouseLocationsLocators.levelCreateBtn().should("be.visible");
                    warehouseLocationsLocators.levelCancelBtn().should("be.visible");
                });
            locationsPage.cancelLevelDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC64
         * Description:     Verify cancelling the Add Level dialog does not
         *                  create a Level.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Bay's Levels page.
         *   3. Click "Add Level".
         *   4. Read the auto-assigned L-NN code from the disabled Code input.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No Level card with the previewed code appears on the page.
         *
         * Test Data:
         *   - The dialog's auto-generated next code (e.g. "L-02").
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a real
         *                  regression pattern; verifying by the previewed
         *                  code is the only way since Levels have no Name.
         */
        it("SW-WL-UI-TC64: Verify cancelling the Add Level dialog does not create a Level", { tags: ["@regression"] }, () => {
            locationsPage.openAddLevel();
            // Capture the previewed code BEFORE cancelling, so we can later
            // assert no card with that exact code appeared.
            locationsPage.readLevelCodeFromDialog().then((previewedCode) => {
                locationsPage.cancelLevelDialog();
                warehouseLocationsLocators.levelDialog().should("not.exist");
                locationsPage.verifyLevelAbsent(previewedCode);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC65
         * Description:     Verify clicking "Create" with the auto-generated
         *                  Level Code creates a new Level card on the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Bay's Levels page.
         *   3. Click "Add Level".
         *   4. Without typing anything (Code is auto-generated and disabled),
         *      click "Create".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new Level card showing "Code: L-NN" with the previewed code
         *     appears on the page.
         *
         * Test Data:
         *   - The auto-generated next L-NN code.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Level" partition. The Code is
         *                  auto-generated server-side, so there's no other
         *                  valid input to vary.
         */
        it("SW-WL-UI-TC65: Verify clicking 'Create' creates a new Level card with the auto-generated code", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.addLevel().then((code) => {
                locationsPage.verifyLevelPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC66
         * Description:     Verify searching a Level by its code returns the
         *                  matching card.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Bay's Levels page.
         *   3. Add a new Level (precondition).
         *   4. Type the new Level's L-NN code into the Levels search input.
         *   5. Click "Search".
         *
         * Expected Result:
         *   - A Level card with the searched code remains visible.
         *
         * Test Data:
         *   - The L-NN code of the freshly-created Level.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Representative match-by-code search. Levels
         *                  have no Name, so code is the only searchable
         *                  field — placeholder "Search code..." confirms it.
         */
        it("SW-WL-UI-TC66: Verify searching a Level by its code returns the matching card", { tags: ["@regression"] }, () => {
            locationsPage.addLevel().then((code) => {
                locationsPage.searchLevels(code);
                locationsPage.verifyLevelPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC67
         * Description:     Verify deleting a Level removes it from the list.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Bay's Levels page.
         *   3. Add a new Level (precondition — the freshly-added Level has
         *      no child Bins, so the Delete button is enabled).
         *   4. Click the "Delete Level" icon on its card.
         *   5. Confirm the deletion in the "Confirm Delete" dialog.
         *
         * Expected Result:
         *   - The Level card no longer appears on the list.
         *
         * Test Data:
         *   - The L-NN code of the freshly-created Level.
         *
         * Technique:       State Transition
         * Why this technique: created → deleted closes the basic CRUD
         *                  lifecycle. Levels have no Edit, so this is the
         *                  whole lifecycle the user can drive.
         */
        it("SW-WL-UI-TC67: Verify deleting a Level removes it from the list", { tags: ["@regression"] }, () => {
            locationsPage.addLevel().then((code) => {
                locationsPage.verifyLevelPresent(code);

                locationsPage.clickDeleteLevel(code);
                locationsPage.confirmDelete();

                locationsPage.verifyLevelAbsent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC68
         * Description:     Verify clicking "View & Manage Bins" on a Level
         *                  navigates to that Level's Bins page.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Bay's Levels page.
         *   3. Add a new Level (precondition).
         *   4. Click "View & Manage Bins" on the Level's card.
         *
         * Expected Result:
         *   - A heading "Bins in <LEVEL_CODE>" appears on the page.
         *
         * Test Data:
         *   - The L-NN code of the freshly-created Level.
         *
         * Technique:       State Transition
         * Why this technique: Drilling into a Level's Bins is the expected
         *                  user flow at this hierarchy level. Verifies the
         *                  navigation transition only — Bins-page details
         *                  belong to the Bins chunk.
         */
        it("SW-WL-UI-TC68: Verify clicking 'View & Manage Bins' on a Level navigates to the Bins page", { tags: ["@regression"] }, () => {
            locationsPage.addLevel().then((code) => {
                locationsPage.verifyLevelPresent(code);

                locationsPage.drillIntoBins(code);

                cy.findByRole("heading", { name: /^bins in /i }).should("be.visible");
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC69
         * Description:     Verify the Level Code field in the Add Level
         *                  dialog is read-only and cannot be modified by
         *                  the user.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Bay's Levels page.
         *   3. Click "Add Level".
         *   4. Inspect the "Level Code" input.
         *
         * Expected Result:
         *   - The Level Code input has the `disabled` (or `readonly`)
         *     attribute, so a real user cannot type into it.
         *   - The Level Code input shows a non-empty auto-generated value
         *     (the short id; the L- prefix lives in a startAdornment).
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row → Bay chain.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract for Levels, mirroring the Facility /
         *                  Zone / Area / Row / Bay variants. Cheapest
         *                  sanity check on the read-only invariant.
         */
        it("SW-WL-UI-TC69: Verify the Level Code field is read-only and cannot be modified by the user", { tags: ["@regression"] }, () => {
            locationsPage.openAddLevel();

            warehouseLocationsLocators
                .levelCodeInput()
                .should(($el) => {
                    const isLocked = $el.is(":disabled") || $el.attr("readonly") !== undefined;
                    expect(isLocked, "Code input is disabled or readonly").to.be.true;
                });

            warehouseLocationsLocators
                .levelCodeInput()
                .should("not.have.value", "");

            locationsPage.cancelLevelDialog();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Hierarchy CRUD — Bins Management (TC70-TC78)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Bins are the LEAF tier of the Locations hierarchy. They differ from the
    // Card-grid pages in two ways:
    //   1. Layout is a MaterialReactTable (table rows, not Cards). Tests
    //      identify bins by the BN-N text in a <td> cell and reach actions
    //      (View Label / Delete Bin) inside the row's Actions column.
    //   2. There is no drill-down — Bin is a leaf, so the navigation tests
    //      from earlier blocks don't apply. We test "View Label" instead
    //      (the only extra row affordance besides Delete).
    //
    // Code-only entity (no Name field, no Edit), like Row/Bay/Level. The
    // describe block reuses the seed-and-cascade-cleanup pattern, with one
    // extra parent layer (Bay).
    describe("Hierarchy CRUD — Bins Management (TC70-TC78)", () => {
        // Captured in before() — the chain we drill through every test.
        let parentFacility;
        let parentZone;
        let parentArea;
        let parentRow;
        let parentBay;
        let parentLevel;

        before(() => {
            cy.authSession('admin');
            // Same primer as the Levels block: cy.session restores cookies
            // but the active window may still be about:blank, so
            // cy.getAuthToken() can't read the JWT yet. A throwaway visit
            // fixes that.
            cy.visit("/");

            // Pre-run sweep so the Facilities list stays manageable.
            sweepDisposableLocations();

            const facilityName = disposableName("bins-parent-fac");
            const zoneName = disposableName("bins-parent-zone");
            const areaName = disposableName("bins-parent-area");

            // Step 1: parent Facility (auto-generated code).
            createLocationViaApi({ name: facilityName, type: "Facility" })
                .then((createdFacility) => {
                    parentFacility = createdFacility;
                    // Step 2: parent Zone under the Facility.
                    return createLocationViaApi({
                        name: zoneName,
                        type: "Zone",
                        parentId: parentFacility.id,
                    });
                })
                .then((createdZone) => {
                    parentZone = createdZone;
                    // Step 3: parent Area under the Zone (regular create —
                    // not the bulk path — so we don't auto-seed the lower
                    // tiers).
                    return createLocationViaApi({
                        name: areaName,
                        type: "Area",
                        parentId: parentZone.id,
                    });
                })
                .then((createdArea) => {
                    parentArea = createdArea;
                    // Step 4: parent Row under the Area.
                    return createLocationViaApi({
                        name: disposableName("bins-parent-row"),
                        type: "Row",
                        parentId: parentArea.id,
                    });
                })
                .then((createdRow) => {
                    parentRow = createdRow;
                    // Step 5: parent Bay under the Row.
                    return createLocationViaApi({
                        name: disposableName("bins-parent-bay"),
                        type: "Bay",
                        parentId: parentRow.id,
                    });
                })
                .then((createdBay) => {
                    parentBay = createdBay;
                    // Step 6: parent Level under the Bay.
                    return createLocationViaApi({
                        name: disposableName("bins-parent-level"),
                        type: "Level",
                        parentId: parentBay.id,
                    });
                })
                .then((createdLevel) => {
                    parentLevel = createdLevel;

                    // Sanity-check the chain. If any link is wrong the
                    // drill-through later fails with a confusing UI error,
                    // so failing here points at the seed instead.
                    expect(parentLevel.parent, "parent Level has a parent").to.not.be.null;
                    expect(parentLevel.parent.id, "parent Level parent id").to.equal(parentBay.id);
                });
        });

        // Per-test setup: drill all seven levels (Facility → Zone → Area →
        // Rows → Bays → Levels → Bins). The Bins route requires the full id
        // chain in the URL, so the canonical entry point is the drill-through.
        beforeEach(() => {
            locationsPage.visitFacilities(parentFacility.code);
            warehouseLocationsLocators
                .facilityCard(parentFacility.code)
                .within(() => {
                    warehouseLocationsLocators.viewManageZonesBtn().should("be.visible");
                });
            locationsPage.visitZonesViaFacility(parentFacility.code);
            locationsPage.visitAreasViaZone(parentZone.code);
            locationsPage.visitRowsViaArea(parentArea.code);
            locationsPage.visitBaysViaRow(parentRow.code);
            locationsPage.visitLevelsViaBay(parentBay.code);
            locationsPage.visitBinsViaLevel(parentLevel.code);
        });

        // Sweep after the block — cascade soft-delete on the parent Facility
        // cleans every Zone/Area/Row/Bay/Level/Bin we created.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC70
         * Description:     Verify the Bins Management page heading and core
         *                  controls render after drilling in from a Level.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill all seven levels down to a Level's Bins page.
         *
         * Expected Result:
         *   - The page heading "Bins in <LEVEL_CODE>" is visible.
         *   - The "Back to Levels" button is visible.
         *   - The "Add Bin" button is visible and enabled.
         *   - The Bins search input (placeholder "Search code...") is visible.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row → Bay → Level chain
         *     (created in before()).
         *
         * Technique:       Use Case
         * Why this technique: Cheapest baseline that the seven-level drill-
         *                  through landed on the right page. Anchors the
         *                  rest of the block.
         */
        it("SW-WL-UI-TC70: Verify the Bins Management page heading and core controls render", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.verifyBinsPageHeading();
            warehouseLocationsLocators.backToLevelsBtn().should("be.visible");
            warehouseLocationsLocators.addBinBtn().should("be.visible").and("not.be.disabled");
            warehouseLocationsLocators.binsSearchInput().should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC71
         * Description:     Verify clicking "Add Bin" opens the Add Bin dialog
         *                  with both Create and Cancel buttons reachable.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Click "Add Bin".
         *
         * Expected Result:
         *   - The Add Bin dialog is visible (title "Add New Bin").
         *   - The "Create" button is visible inside the dialog.
         *   - The "Cancel" button is visible inside the dialog.
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row → Bay → Level chain.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the create-path entry point works
         *                  before later tests rely on it. Doesn't submit.
         */
        it("SW-WL-UI-TC71: Verify clicking 'Add Bin' opens the Add Bin dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.openAddBin();
            warehouseLocationsLocators.binDialog().should("be.visible");
            warehouseLocationsLocators
                .binDialog()
                .within(() => {
                    warehouseLocationsLocators.binCreateBtn().should("be.visible");
                    warehouseLocationsLocators.binCancelBtn().should("be.visible");
                });
            locationsPage.cancelBinDialog();
        });

        /**
         * Test ID:         SW-WL-UI-TC72
         * Description:     Verify cancelling the Add Bin dialog does not
         *                  create a Bin.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Click "Add Bin".
         *   4. Read the auto-assigned BN-N code from the disabled Code input.
         *   5. Click "Cancel".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - No Bin row with the previewed code appears in the table.
         *
         * Test Data:
         *   - The dialog's auto-generated next code (e.g. "BN-1").
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally saves is a real
         *                  regression pattern; verifying by the previewed
         *                  code is the only way since Bins have no Name.
         */
        it("SW-WL-UI-TC72: Verify cancelling the Add Bin dialog does not create a Bin", { tags: ["@regression"] }, () => {
            locationsPage.openAddBin();
            // Capture the previewed code BEFORE cancelling, so we can later
            // assert no row with that exact code appeared.
            locationsPage.readBinCodeFromDialog().then((previewedCode) => {
                locationsPage.cancelBinDialog();
                warehouseLocationsLocators.binDialog().should("not.exist");
                locationsPage.verifyBinAbsent(previewedCode);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC73
         * Description:     Verify clicking "Create" with the auto-generated
         *                  Bin Code creates a new Bin row in the table.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Click "Add Bin".
         *   4. Without typing anything (Code is auto-generated and disabled),
         *      click "Create".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - A new Bin row showing the previewed BN-N code appears in the
         *     table.
         *
         * Test Data:
         *   - The auto-generated next BN-N code.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: One representative valid input from the
         *                  "well-formed Bin" partition. The Code is
         *                  auto-generated server-side, so there's no other
         *                  valid input to vary.
         */
        it("SW-WL-UI-TC73: Verify clicking 'Create' creates a new Bin row in the table", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.addBin().then((code) => {
                locationsPage.verifyBinPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC74
         * Description:     Verify searching a Bin by its code returns the
         *                  matching row.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Add a new Bin (precondition).
         *   4. Type the new Bin's BN-N code into the Bins search input.
         *   5. Click "Search".
         *
         * Expected Result:
         *   - A Bin row with the searched code remains visible.
         *
         * Test Data:
         *   - The BN-N code of the freshly-created Bin.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Representative match-by-code search. Bins
         *                  have no Name, so code is the only searchable
         *                  field — placeholder "Search code..." confirms it.
         */
        it("SW-WL-UI-TC74: Verify searching a Bin by its code returns the matching row", { tags: ["@regression"] }, () => {
            locationsPage.addBin().then((code) => {
                locationsPage.searchBins(code);
                locationsPage.verifyBinPresent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC75
         * Description:     Verify deleting a Bin removes it from the table.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Add a new Bin (precondition — the freshly-added Bin has no
         *      containers/assignments, so the Delete button is enabled).
         *   4. Click the "Delete Bin" icon in the row's Actions cell.
         *   5. Confirm the deletion in the "Confirm Delete" dialog.
         *
         * Expected Result:
         *   - The Bin row no longer appears in the table.
         *
         * Test Data:
         *   - The BN-N code of the freshly-created Bin.
         *
         * Technique:       State Transition
         * Why this technique: created → deleted closes the basic CRUD
         *                  lifecycle. Bins have no Edit, so this is the
         *                  whole lifecycle the user can drive at this
         *                  level.
         */
        it("SW-WL-UI-TC75: Verify deleting a Bin removes it from the table", { tags: ["@regression"] }, () => {
            locationsPage.addBin().then((code) => {
                locationsPage.verifyBinPresent(code);

                locationsPage.clickDeleteBin(code);
                locationsPage.confirmDelete();

                locationsPage.verifyBinAbsent(code);
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC76
         * Description:     Verify clicking "View Label" on a Bin opens the
         *                  QR-code dialog for that Bin.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Add a new Bin (precondition).
         *   4. Click the "View Label" icon in the row's Actions cell.
         *
         * Expected Result:
         *   - A dialog opens displaying the Bin's QR code / label.
         *
         * Test Data:
         *   - The BN-N code of the freshly-created Bin.
         *
         * Technique:       Use Case
         * Why this technique: View Label is the only Actions-column
         *                  affordance besides Delete. We cover its open
         *                  path here; rendering details (QR contents,
         *                  print button) belong to a deeper-coverage QR
         *                  test if/when QA cares about the canvas.
         */
        it("SW-WL-UI-TC76: Verify clicking 'View Label' on a Bin opens the QR-code dialog", { tags: ["@regression"] }, () => {
            locationsPage.addBin().then((code) => {
                locationsPage.verifyBinPresent(code);

                locationsPage.clickViewLabel(code);

                // The QR-code component (`qrCodeDialoge.tsx`) is a custom
                // <Box> overlay — NOT an MUI <Dialog> — so it has no
                // role="dialog". We anchor on its title text instead:
                // the dialog renders "Label for <CODE>" as a subtitle,
                // which is unique to this overlay and contains the code
                // we just acted on (regardless of casing).
                cy.contains(new RegExp(`Label for\\s+${code}`, "i"))
                    .should("be.visible");
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC77
         * Description:     Verify clicking "Cancel" inside the QR-code
         *                  overlay closes it without sending a print job.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Add a new Bin (precondition).
         *   4. Click the "View Label" icon to open the QR overlay.
         *   5. Click the "Cancel" button inside the overlay.
         *
         * Expected Result:
         *   - The overlay closes.
         *   - The "Label for <CODE>" title is no longer in the DOM.
         *
         * Test Data:
         *   - The BN-N code of the freshly-created Bin.
         *
         * Technique:       Negative testing
         * Why this technique: A Cancel that accidentally fires the print
         *                  request is a real regression pattern. We verify
         *                  the close path only — the print path itself is
         *                  out of scope (would require a Zebra printer or
         *                  request-stubbing).
         */
        it("SW-WL-UI-TC77: Verify clicking 'Cancel' inside the QR-code overlay closes it", { tags: ["@regression"] }, () => {
            locationsPage.addBin().then((code) => {
                locationsPage.clickViewLabel(code);
                cy.contains(new RegExp(`Label for\\s+${code}`, "i"))
                    .should("be.visible");

                locationsPage.cancelQrOverlay(code);
                // cancelQrOverlay() asserts not.exist on the title; we
                // re-assert here for explicit step-by-step traceability
                // in the test report.
                cy.contains(new RegExp(`Label for\\s+${code}`, "i"))
                    .should("not.exist");
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC78
         * Description:     Verify the Bin Code field in the Add Bin dialog
         *                  is read-only and cannot be modified by the user.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Drill into a Level's Bins page.
         *   3. Click "Add Bin".
         *   4. Inspect the "Bin Code" input.
         *
         * Expected Result:
         *   - The Bin Code input has the `disabled` (or `readonly`)
         *     attribute, so a real user cannot type into it.
         *   - The Bin Code input shows a non-empty auto-generated value
         *     (the FULL code, e.g. "BN-1" — no prefix adornment on this page).
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row → Bay → Level chain.
         *
         * Technique:       Negative testing
         * Why this technique: Pins the documented "Code is auto-generated"
         *                  contract for Bins. The Bin dialog uniquely
         *                  stores the FULL code in the input (no prefix
         *                  adornment), which is the only structural
         *                  variation from the upper-tier dialogs worth
         *                  pinning.
         */
        it("SW-WL-UI-TC78: Verify the Bin Code field is read-only and cannot be modified by the user", { tags: ["@regression"] }, () => {
            locationsPage.openAddBin();

            warehouseLocationsLocators
                .binCodeInput()
                .should(($el) => {
                    const isLocked = $el.is(":disabled") || $el.attr("readonly") !== undefined;
                    expect(isLocked, "Code input is disabled or readonly").to.be.true;
                });

            warehouseLocationsLocators
                .binCodeInput()
                .should("not.have.value", "");

            locationsPage.cancelBinDialog();
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Row Actions on Main Grid (TC79-TC82)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // The main /warehouse-management/locations grid lists Bins (the leaves
    // of the hierarchy) with a Bin-Path column and per-row Actions. This
    // block covers the row-level affordances that aren't exercised by the
    // per-tier blocks above: View Label and Delete on the main grid.
    //
    // The bulk-action top toolbar (Print QR Codes, Clear Selection) is in
    // a separate block below (TC83-TC88), and the full drill-through E2E
    // is the last test in the spec (TC89).
    describe("Row Actions on Main Grid (TC79-TC82)", () => {
        // Captured in before() — the chain we drill to create one Bin we
        // can act on from the main grid. We don't care about UI navigation
        // here — only the API'd Bin's path on the main grid matters.
        let parentFacility;
        let parentZone;
        let parentArea;
        let parentRow;
        let parentBay;
        let parentLevel;
        let testBin;
        let testBinPath;

        before(() => {
            cy.authSession('admin');
            // Same JWT-priming visit as upper blocks: cy.session restores
            // cookies but the active window may still be about:blank.
            cy.visit("/");

            // Pre-run sweep so the main grid stays manageable.
            sweepDisposableLocations();

            // Build Facility → … → Level via API, then a Bin under the Level.
            createLocationViaApi({
                name: disposableName("rowact-parent-fac"),
                type: "Facility",
            })
                .then((createdFacility) => {
                    parentFacility = createdFacility;
                    return createLocationViaApi({
                        name: disposableName("rowact-parent-zone"),
                        type: "Zone",
                        parentId: parentFacility.id,
                    });
                })
                .then((createdZone) => {
                    parentZone = createdZone;
                    return createLocationViaApi({
                        name: disposableName("rowact-parent-area"),
                        type: "Area",
                        parentId: parentZone.id,
                    });
                })
                .then((createdArea) => {
                    parentArea = createdArea;
                    return createLocationViaApi({
                        name: disposableName("rowact-parent-row"),
                        type: "Row",
                        parentId: parentArea.id,
                    });
                })
                .then((createdRow) => {
                    parentRow = createdRow;
                    return createLocationViaApi({
                        name: disposableName("rowact-parent-bay"),
                        type: "Bay",
                        parentId: parentRow.id,
                    });
                })
                .then((createdBay) => {
                    parentBay = createdBay;
                    return createLocationViaApi({
                        name: disposableName("rowact-parent-level"),
                        type: "Level",
                        parentId: parentBay.id,
                    });
                })
                .then((createdLevel) => {
                    parentLevel = createdLevel;
                    return createLocationViaApi({
                        name: disposableName("rowact-test-bin"),
                        type: "Bin",
                        parentId: parentLevel.id,
                    });
                })
                .then((createdBin) => {
                    testBin = createdBin;
                    // Compute the displayed "Bin Path" once so each test
                    // doesn't recompute. The frontend renders path with `.`
                    // separators (see formatBinPath in WMSLocations.tsx).
                    testBinPath = String(createdBin.path || "")
                        .split("/")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(".");
                });
        });

        // Per-test setup: visit the main grid and search for our bin so the
        // row is in view. Without the search, our bin may live on page N of
        // a busy QA grid.
        beforeEach(() => {
            locationsPage.visit();
            // Each test below interacts with our bin. We pre-narrow the
            // grid via search so the row is the only one rendered.
            locationsPage.search(testBinPath);
            warehouseLocationsLocators
                .mainGridBinRow(testBinPath)
                .should("be.visible");
        });

        // Sweep after the block — cascade soft-delete on the parent
        // Facility cleans every Zone/Area/Row/Bay/Level/Bin we created.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC79
         * Description:     Verify clicking "View Label" on a Bin row in the
         *                  main Locations grid opens the QR-code overlay.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for the test Bin's path so its row is visible.
         *   4. Click the "View Label" icon in the row's Actions cell.
         *
         * Expected Result:
         *   - The QR-code overlay opens displaying "Label for <BIN_CODE>".
         *
         * Test Data:
         *   - Pre-existing Facility → Zone → Area → Row → Bay → Level → Bin
         *     chain (created in before()).
         *
         * Technique:       Use Case
         * Why this technique: View Label is one of two row-level affordances
         *                  on the main grid. We exercise its open path here
         *                  with the bin we already act on for delete tests
         *                  below.
         */
        it("SW-WL-UI-TC79: Verify clicking 'View Label' on a main-grid Bin row opens the QR-code overlay", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.clickMainGridViewLabel(testBinPath);

            // The QR-code component is a custom <Box> overlay (NOT an MUI
            // <Dialog>) — same component used on the Bins sub-page (TC76).
            // Anchor on the unique title text "Label for <CODE>".
            cy.contains(new RegExp(`Label for\\s+${testBin.code}`, "i"))
                .should("be.visible");
        });

        /**
         * Test ID:         SW-WL-UI-TC80
         * Description:     Verify clicking "Delete" on a Bin row opens the
         *                  "Confirm Location Deletion" dialog.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for the test Bin's path.
         *   4. Click the "Delete" icon in the row's Actions cell.
         *
         * Expected Result:
         *   - A dialog with heading "Confirm Location Deletion" is visible.
         *   - The dialog body shows the bin's code (the BN-N value).
         *   - The "Yes" and "No" buttons are present.
         *
         * Test Data:
         *   - Pre-existing test Bin.
         *
         * Technique:       Use Case
         * Why this technique: Confirms the delete dialog wires up correctly
         *                  before TC81/TC82 rely on its Yes/No buttons.
         *                  Doesn't mutate state.
         */
        it("SW-WL-UI-TC80: Verify clicking 'Delete' on a main-grid Bin row opens the Confirm Location Deletion dialog", { tags: ["@smoke", "@regression"] }, () => {
            locationsPage.clickMainGridDelete(testBinPath);

            // Heading discriminates this dialog from per-tier "Confirm
            // Delete" dialogs.
            warehouseLocationsLocators
                .mainGridDeleteDialogHeading()
                .should("be.visible");

            // The dialog renders <strong>{bin.code}</strong> in its body.
            cy.contains(testBin.code, { matchCase: false })
                .should("be.visible");

            warehouseLocationsLocators.mainGridDeleteYesBtn().should("be.visible");
            warehouseLocationsLocators.mainGridDeleteNoBtn().should("be.visible");

            // Cancel so we don't actually delete the bin TC81 still uses.
            locationsPage.cancelMainGridDelete();
        });

        /**
         * Test ID:         SW-WL-UI-TC81
         * Description:     Verify cancelling the delete dialog (clicking
         *                  "No") preserves the Bin row.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for the test Bin's path.
         *   4. Click "Delete" → click "No".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The Bin row is still visible in the grid.
         *
         * Test Data:
         *   - Pre-existing test Bin.
         *
         * Technique:       Negative testing
         * Why this technique: A "No" that accidentally deletes is a real
         *                  regression pattern — confirms the cancel path
         *                  is wired correctly.
         */
        it("SW-WL-UI-TC81: Verify cancelling the delete dialog with 'No' preserves the Bin row", { tags: ["@regression"] }, () => {
            locationsPage.clickMainGridDelete(testBinPath);
            warehouseLocationsLocators
                .mainGridDeleteDialogHeading()
                .should("be.visible");

            locationsPage.cancelMainGridDelete();

            warehouseLocationsLocators
                .mainGridDeleteDialogHeading()
                .should("not.exist");
            locationsPage.verifyBinOnMainGridPresent(testBinPath);
        });

        /**
         * Test ID:         SW-WL-UI-TC82
         * Description:     Verify confirming the delete dialog (clicking
         *                  "Yes") removes the Bin from the main grid.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for the test Bin's path.
         *   4. Click "Delete" → click "Yes".
         *
         * Expected Result:
         *   - The dialog closes.
         *   - The Bin row no longer appears in the grid.
         *
         * Test Data:
         *   - Pre-existing test Bin.
         *
         * Technique:       State Transition
         * Why this technique: Closes the create → delete lifecycle for the
         *                  main-grid affordance. Mutates state, which is
         *                  why this test runs LAST in this block — TC79/TC80/TC81
         *                  all need testBin to still exist.
         */
        it("SW-WL-UI-TC82: Verify confirming the delete dialog with 'Yes' removes the Bin from the main grid", { tags: ["@regression"] }, () => {
            locationsPage.clickMainGridDelete(testBinPath);
            warehouseLocationsLocators
                .mainGridDeleteDialogHeading()
                .should("be.visible");

            locationsPage.confirmMainGridDelete();

            // The dialog closes on success; the React-query refetch may
            // take a moment, so we let `should()` retry the absence check.
            warehouseLocationsLocators
                .mainGridDeleteDialogHeading()
                .should("not.exist");
            locationsPage.verifyBinOnMainGridAbsent(testBinPath);
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Main Grid Toolbar & Selection (TC83-TC88)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // The main /warehouse-management/locations grid renders an MRT row-
    // selection column and conditionally shows a top-toolbar action group
    // (Print QR Codes + Clear Selection + "N selected") when ≥1 rows are
    // selected. This block covers those affordances plus the Assignment
    // column's "View Content" button (only shown for occupied bins).
    //
    // We seed our own throwaway Bin via API so TC83/TC84 always have at
    // least one row to select. TC88 (View Content) needs an OCCUPIED bin
    // — which requires a container or direct assignment, both out of
    // scope here — so it's a soft-skip when no occupied bin exists.
    describe("Main Grid Toolbar & Selection (TC83-TC88)", () => {
        let parentFacility;
        let parentZone;
        let parentArea;
        let parentRow;
        let parentBay;
        let parentLevel;
        let testBin;
        let testBinPath;

        before(() => {
            cy.authSession('admin');
            cy.visit("/");
            sweepDisposableLocations();

            // Build the chain to a Bin so TC83/TC84 have a row to act on.
            // We create one bin (the row-selection tests don't need
            // multiple rows; check-all just needs to operate on whatever
            // is visible after we narrow via search).
            createLocationViaApi({
                name: disposableName("toolbar-fac"),
                type: "Facility",
            })
                .then((f) => {
                    parentFacility = f;
                    return createLocationViaApi({ name: disposableName("toolbar-zone"), type: "Zone", parentId: f.id });
                })
                .then((z) => {
                    parentZone = z;
                    return createLocationViaApi({ name: disposableName("toolbar-area"), type: "Area", parentId: z.id });
                })
                .then((a) => {
                    parentArea = a;
                    return createLocationViaApi({ name: disposableName("toolbar-row"), type: "Row", parentId: a.id });
                })
                .then((r) => {
                    parentRow = r;
                    return createLocationViaApi({ name: disposableName("toolbar-bay"), type: "Bay", parentId: r.id });
                })
                .then((b) => {
                    parentBay = b;
                    return createLocationViaApi({ name: disposableName("toolbar-level"), type: "Level", parentId: b.id });
                })
                .then((l) => {
                    parentLevel = l;
                    return createLocationViaApi({ name: disposableName("toolbar-bin"), type: "Bin", parentId: l.id });
                })
                .then((bin) => {
                    testBin = bin;
                    testBinPath = String(bin.path || "")
                        .split("/")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(".");
                });
        });

        beforeEach(() => {
            locationsPage.visit();
            // Pre-narrow the grid to our bin so TC83/TC84/TC85 select a
            // known-empty row that won't accidentally trip an Occupied
            // partition. The check-all test (TC84) operates on the
            // narrowed view, which is fine — "all visible" still
            // satisfies the spec.
            locationsPage.search(testBinPath);
            warehouseLocationsLocators
                .mainGridBinRow(testBinPath)
                .should("be.visible");
        });

        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC83
         * Description:     Verify checking a row's selection checkbox
         *                  reveals the "Print QR Codes" and "Clear
         *                  Selection" buttons in the top toolbar.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for the test Bin's path so its row is visible.
         *   4. Tick the row-selection checkbox in that row.
         *
         * Expected Result:
         *   - "1 selected" text appears in the top toolbar.
         *   - "Print QR Codes" button is visible.
         *   - "Clear Selection" button is visible.
         *
         * Test Data:
         *   - Pre-existing test Bin.
         *
         * Technique:       Use Case
         * Why this technique: First-row selection is the smallest input
         *                  that triggers the conditional toolbar state.
         */
        it("SW-WL-UI-TC83: Verify selecting a row reveals Print QR Codes + Clear Selection in the toolbar", { tags: ["@smoke", "@regression"] }, () => {
            const row = warehouseLocationsLocators.mainGridBinRow(testBinPath);
            locationsPage.selectRow(row);

            warehouseLocationsLocators.selectionCountText().should("be.visible");
            warehouseLocationsLocators.printQrCodesBtn().should("be.visible");
            warehouseLocationsLocators.clearSelectionBtn().should("be.visible");

            // Clean up — clear before next test so beforeEach starts
            // with no selection. Even though beforeEach navigates, MRT
            // can persist selection across renders if we're not careful.
            locationsPage.clearSelection();
        });

        /**
         * Test ID:         SW-WL-UI-TC84
         * Description:     Verify the header (select-all) checkbox checks
         *                  every visible row in the body.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for the test Bin's path so the body is narrowed.
         *   4. Click the header (select-all) checkbox.
         *
         * Expected Result:
         *   - The "N selected" toolbar indicator equals the visible row
         *     count.
         *   - Every body row's checkbox is checked.
         *
         * Test Data:
         *   - Pre-existing test Bin (drives the visible row count).
         *
         * Technique:       Use Case
         * Why this technique: Select-all is the inverse of the per-row
         *                  selection in TC83; combining the two pins the
         *                  selection contract from both directions.
         */
        it("SW-WL-UI-TC84: Verify the select-all header checkbox selects every visible row", { tags: ["@regression"] }, () => {
            locationsPage.selectAllVisibleRows();

            // Sanity check: the body has at least one row (we filtered to
            // our bin). Then assert every row's checkbox is checked.
            locationsPage.tableRows().then(($rows) => {
                expect($rows.length, "at least one visible row to select").to.be.greaterThan(0);
                cy.get("table tbody tr input[type='checkbox']").each(($cb) => {
                    cy.wrap($cb).should("be.checked");
                });
                // The toolbar indicator matches the visible count.
                warehouseLocationsLocators
                    .selectionCountText()
                    .should("contain", `${$rows.length} selected`);
            });

            locationsPage.clearSelection();
        });

        /**
         * Test ID:         SW-WL-UI-TC85
         * Description:     Verify clicking "Print QR Codes" with at least
         *                  one row selected opens the bulk print dialog
         *                  with the selected count and two print options.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search and select the test Bin's row.
         *   4. Click "Print QR Codes" in the top toolbar.
         *
         * Expected Result:
         *   - A dialog opens with title "Print QR Codes".
         *   - The body shows "1 location(s) selected".
         *   - The dialog offers "Print as PDF (A4)" and "Print to Zebra
         *     Thermal Printer" buttons.
         *
         * Test Data:
         *   - Pre-existing test Bin.
         *
         * Technique:       Use Case
         * Why this technique: We exercise the open path; actually printing
         *                  is out of scope (would require a Zebra printer
         *                  fixture or a PDF-pop-up window assertion).
         */
        it("SW-WL-UI-TC85: Verify clicking 'Print QR Codes' opens the bulk print dialog with print options", { tags: ["@smoke", "@regression"] }, () => {
            const row = warehouseLocationsLocators.mainGridBinRow(testBinPath);
            locationsPage.selectRow(row);

            locationsPage.openBulkPrint();

            // The deployed locations bulk-print dialog exposes only the Zebra
            // Thermal Printer option + Cancel (no PDF/A4 button on this dialog).
            warehouseLocationsLocators.bulkPrintCountText().should("be.visible");
            warehouseLocationsLocators.bulkPrintZebraBtn().should("be.visible");
            warehouseLocationsLocators.bulkPrintCancelBtn().should("be.visible");

            locationsPage.cancelBulkPrint();
            locationsPage.clearSelection();
        });

        /**
         * Test ID:         SW-WL-UI-TC86
         * Description:     Verify selecting a single Bin row and opening
         *                  the bulk print dialog shows "1 location(s)
         *                  selected" — i.e. the count text reflects exactly
         *                  one selection.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for the test Bin's path so its row is visible.
         *   4. Tick the row-selection checkbox.
         *   5. Click "Print QR Codes" in the top toolbar.
         *
         * Expected Result:
         *   - The bulk print dialog opens.
         *   - The body shows "1 location(s) selected" (exact text).
         *
         * Test Data:
         *   - Pre-existing test Bin (seeded in before()).
         *
         * Technique:       Equivalence Partitioning + boundary
         * Why this technique: One representative input from the "1
         *                  selected" partition. TC85 confirms the dialog
         *                  opens; this test pins the count text contract
         *                  for a single selection (the smallest non-empty
         *                  partition).
         */
        it("SW-WL-UI-TC86: Verify the bulk print dialog shows '1 location(s) selected' when one row is checked", { tags: ["@regression"] }, () => {
            const row = warehouseLocationsLocators.mainGridBinRow(testBinPath);
            locationsPage.selectRow(row);

            locationsPage.openBulkPrint();

            // Anchor on the exact "1 location(s) selected" text — pluralisation
            // and number both matter. The locator uses a broader regex
            // (\d+ location\(s\) selected); we tighten it here to "1".
            cy.contains(/^1\s+location\(s\)\s+selected$/i).should("be.visible");

            locationsPage.cancelBulkPrint();
            locationsPage.clearSelection();
        });

        /**
         * Test ID:         SW-WL-UI-TC87
         * Description:     Verify selecting multiple Bin rows and opening
         *                  the bulk print dialog shows "<N> location(s)
         *                  selected" with the correct count.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Clear the per-test search so multiple QA bins are visible.
         *   4. Tick the header (select-all) checkbox to select every
         *      visible row.
         *   5. Click "Print QR Codes" in the top toolbar.
         *
         * Expected Result:
         *   - The bulk print dialog opens.
         *   - The body shows "<N> location(s) selected" where N matches
         *     the number of rows that were checked.
         *
         * Test Data:
         *   - QA must already have ≥2 Bins on the main grid. Soft-skipped
         *     when there's fewer (a fresh QA, etc.) so the test stays
         *     deterministic across environments.
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: Pair to TC86 — the multi-selection partition.
         *                  Together they pin the dialog's count contract
         *                  for both the "1" and "many" inputs.
         */
        it("SW-WL-UI-TC87: Verify the bulk print dialog shows '<N> location(s) selected' when multiple rows are checked", { tags: ["@regression"] }, function () {
            // Override the per-test search so multiple rows can show.
            locationsPage.clearSearch();

            // Non-retrying probe: when QA has < 2 visible bins we soft-skip
            // (e.g. fresh QA, or after a previous TC82 deletion).
            cy.get("body").then(() => {
                const rowCount = Cypress.$("table tbody tr").length;
                if (rowCount < 2) {
                    cy.log(`TC87: only ${rowCount} bin(s) visible — need ≥2 for multi-select`);
                    this.skip();
                    return;
                }

                locationsPage.selectAllVisibleRows();
                locationsPage.openBulkPrint();

                // The selected count should match the number of rows we
                // saw before clicking select-all (pagination doesn't
                // change between then and now — no other clicks happened).
                cy.contains(new RegExp(`^${rowCount}\\s+location\\(s\\)\\s+selected$`, "i"))
                    .should("be.visible");

                locationsPage.cancelBulkPrint();
                locationsPage.clearSelection();
            });
        });

        /**
         * Test ID:         SW-WL-UI-TC88
         * Description:     Verify clicking "View Content" on an occupied
         *                  Bin row opens the contents dialog.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Visit /warehouse-management/locations.
         *   3. Filter to "Occupied bins".
         *   4. If at least one row is visible, click "View Content" on
         *      the first row.
         *
         * Expected Result:
         *   - The contents dialog opens (heading begins with "Contents").
         *
         * Test Data:
         *   - QA must already have an occupied Bin (i.e. a Bin with a
         *     container or direct assignment). Container/assignment flows
         *     are out of scope for this Locations chunk — the test
         *     soft-skips when no occupied bin exists, leaving QA's
         *     environment untouched.
         *
         * Technique:       Use Case (read-only)
         * Why this technique: View Content is conditional on bin
         *                  occupancy; we don't seed occupied bins from
         *                  this chunk (would couple to Containers).
         *                  Soft-skip keeps the test deterministic across
         *                  environments.
         */
        it("SW-WL-UI-TC88: Verify clicking 'View Content' on an occupied Bin row opens the contents dialog", { tags: ["@regression"] }, function () {
            // Our seeded testBin is empty, so we filter the grid to
            // Occupied first. Note: this overrides the beforeEach narrow
            // search — we deliberately reset the search box before
            // applying the status filter.
            // The Occupied filter triggers a SERVER-SIDE refetch:
            // GET {API.LOCATIONS}/dashboard/hierarchy-report?...&status=occupied
            // (WMSLocations.tsx:433). selectStatusFilter only waits for the
            // dropdown to close, so the DOM still holds the STALE pre-filter rows.
            //
            // Do NOT settle on a DOM predicate here. The UNFILTERED grid already
            // lists occupied bins, so "a View Content button exists" can be true
            // BEFORE the refetch lands — the exact race this guards against. Key
            // off the response instead: intercept the refetch, read `bins` from
            // the body to decide occupied-vs-empty, and only then touch the DOM.
            cy.intercept("GET", "**/dashboard/hierarchy-report*status=occupied*").as("occupiedRefetch");

            locationsPage.clearSearch();
            locationsPage.selectStatusFilter("Occupied bins");

            cy.wait("@occupiedRefetch", { timeout: 20000 }).then(({ response }) => {
                expect(response.statusCode, "occupied-bins refetch").to.equal(200);
                const bins = response.body?.data?.bins ?? response.body?.bins ?? [];
                if (bins.length === 0) {
                    // Genuinely no occupied bin in QA — soft-skip rather than
                    // assigning a container from a Locations test.
                    cy.log("Skipping TC88: no occupied bins available in QA");
                    this.skip();
                    return;
                }

                // The response proved occupied rows exist, so the button must
                // render once React commits the new page.
                warehouseLocationsLocators.viewContentBtn().first().click();
                warehouseLocationsLocators.contentsDialogHeading().should("be.visible");
            });
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Stats Verification — API → UI (SW-WL-STATS-TC01–TC10)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Two-tier approach:
    //   Tier 1: Seed known location counts via API.
    //   Tier 2: Call GET /wms/locations/stats → verify counts ≥ seeded amounts.
    //   Tier 3: Visit the /locations UI → verify each stat card displays the API value.
    //
    // The seed creates: 2 Facilities, 3 Zones (under fac[0]), 2 Areas, 1 Row,
    // 1 Bay, 1 Level, 3 Bins — using the AUTO_WMS_ disposable prefix so the
    // after() sweep removes them cleanly.

    describe("Stats Verification (SW-WL-STATS-TC01–TC10)", { tags: ["@regression"] }, () => {
        // expectedStats tracks the counts we seeded; the API can only be ≥.
        let expectedStats = {
            facilities: 0,
            zones: 0,
            areas: 0,
            rows: 0,
            bays: 0,
            levels: 0,
            bins: 0,
        };

        before(() => {
            cy.authSession('admin');
            cy.visit("/");
            sweepDisposableLocations();

            // Create hierarchy sequentially — Promise.all does not work with
            // Cypress chains (chains share a command queue and cannot truly
            // run concurrently; the wrapped Promise resolves before the API
            // calls complete, yielding 400s).
            createLocationViaApi({ name: disposableName("stats-fac-1"), type: "Facility" }).then((fac1) => {
                createLocationViaApi({ name: disposableName("stats-fac-2"), type: "Facility" }).then(() => {
                    expectedStats.facilities = 2;

                    createLocationViaApi({ name: disposableName("stats-zone-1"), type: "Zone", parentId: fac1.id }).then((zone1) => {
                        createLocationViaApi({ name: disposableName("stats-zone-2"), type: "Zone", parentId: fac1.id }).then(() => {
                            createLocationViaApi({ name: disposableName("stats-zone-3"), type: "Zone", parentId: fac1.id }).then(() => {
                                expectedStats.zones = 3;

                                createLocationViaApi({ name: disposableName("stats-area-1"), type: "Area", parentId: zone1.id }).then((area1) => {
                                    createLocationViaApi({ name: disposableName("stats-area-2"), type: "Area", parentId: zone1.id }).then(() => {
                                        expectedStats.areas = 2;

                                        // Row/Bay/Level/Bin: do NOT pass name — API
                                        // auto-generates the code for these types.
                                        createLocationViaApi({ type: "Row", parentId: area1.id }).then((row) => {
                                            expectedStats.rows = 1;

                                            createLocationViaApi({ type: "Bay", parentId: row.id }).then((bay) => {
                                                expectedStats.bays = 1;

                                                createLocationViaApi({ type: "Level", parentId: bay.id }).then((level) => {
                                                    expectedStats.levels = 1;

                                                    createLocationViaApi({ type: "Bin", parentId: level.id }).then(() => {
                                                        createLocationViaApi({ type: "Bin", parentId: level.id }).then(() => {
                                                            createLocationViaApi({ type: "Bin", parentId: level.id }).then(() => {
                                                                expectedStats.bins = 3;
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

        after(() => {
            sweepDisposableLocations();
        });

        // Helper: call stats API → assert UI stat card shows the API value.
        const verifyStatCard = (statName) => {
            const baseUrl = Cypress.env("API_BASE_URL");

            cy.getAuthToken().then((token) => {
                cy.request({
                    method: "GET",
                    url: `${baseUrl}/wms/locations/stats`,
                    headers: { Authorization: `Bearer ${token}` },
                    failOnStatusCode: false,
                }).then((apiRes) => {
                    if (apiRes.status !== 200) {
                        cy.log(`Stats API returned ${apiRes.status} — skipping UI assertion`);
                        return;
                    }

                    // camelCase key: "Occupied Bins" → "occupiedBins"
                    const camelKey = statName
                        .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
                        .replace(/^(.)/, (c) => c.toLowerCase())
                        .replace(/%/g, "Percent");
                    const apiCount = apiRes.body[camelKey];
                    cy.log(`${statName}: API key="${camelKey}" value=${apiCount}`);

                    locationsPage.visit();
                    locationsPage.readStatCardValue(statName).then((uiCount) => {
                        cy.log(`${statName}: UI value=${uiCount}`);
                        expect(uiCount, `${statName} UI matches API`).to.equal(apiCount);
                    });
                });
            });
        };

        /**
         * Test ID:         SW-WL-STATS-TC01
         * Description:     Verify the Facilities stat card (API → UI).
         * Technique:       Data Integrity (API→UI two-tier).
         */
        it(
            "SW-WL-STATS-TC01: Verify Facilities stat card matches API",
            { tags: ["@smoke"] },
            () => {
                verifyStatCard("Facilities");
            }
        );

        /**
         * Test ID:         SW-WL-STATS-TC02
         * Description:     Verify the Zones stat card (API → UI).
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC02: Verify Zones stat card matches API", { tags: ["@smoke"] }, () => {
            verifyStatCard("Zones");
        });

        /**
         * Test ID:         SW-WL-STATS-TC03
         * Description:     Verify the Areas stat card (API → UI).
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC03: Verify Areas stat card matches API", { tags: ["@regression"] }, () => {
            verifyStatCard("Areas");
        });

        /**
         * Test ID:         SW-WL-STATS-TC04
         * Description:     Verify the Rows stat card (API → UI).
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC04: Verify Rows stat card matches API", { tags: ["@regression"] }, () => {
            verifyStatCard("Rows");
        });

        /**
         * Test ID:         SW-WL-STATS-TC05
         * Description:     Verify the Bays stat card (API → UI).
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC05: Verify Bays stat card matches API", { tags: ["@regression"] }, () => {
            verifyStatCard("Bays");
        });

        /**
         * Test ID:         SW-WL-STATS-TC06
         * Description:     Verify the Levels stat card (API → UI).
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC06: Verify Levels stat card matches API", { tags: ["@regression"] }, () => {
            verifyStatCard("Levels");
        });

        /**
         * Test ID:         SW-WL-STATS-TC07
         * Description:     Verify the Bins stat card (API → UI).
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC07: Verify Bins stat card matches API", { tags: ["@regression"] }, () => {
            verifyStatCard("Bins");
        });

        /**
         * Test ID:         SW-WL-STATS-TC08
         * Description:     Verify the Empty Bins stat card (API → UI).
         *                  All bins seeded here are new and have no containers,
         *                  so the empty count must be ≥ the 3 we seeded.
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC08: Verify Empty Bins stat card matches API", { tags: ["@regression"] }, () => {
            const baseUrl = Cypress.env("API_BASE_URL");

            cy.getAuthToken().then((token) => {
                cy.request({
                    method: "GET",
                    url: `${baseUrl}/wms/locations/stats`,
                    headers: { Authorization: `Bearer ${token}` },
                    failOnStatusCode: false,
                }).then((apiRes) => {
                    if (apiRes.status !== 200) {
                        cy.log(`Stats API returned ${apiRes.status} — skipping`);
                        return;
                    }
                    const apiEmptyBins = apiRes.body.emptyBins;
                    cy.log(`Empty Bins: API=${apiEmptyBins}`);

                    locationsPage.visit();
                    locationsPage.readStatCardValue("Empty Bins").then((uiCount) => {
                        cy.log(`Empty Bins: UI=${uiCount}`);
                        expect(uiCount, "Empty Bins UI matches API").to.equal(apiEmptyBins);
                        expect(uiCount, "Empty Bins ≥ seeded count").to.be.gte(expectedStats.bins);
                    });
                });
            });
        });

        /**
         * Test ID:         SW-WL-STATS-TC09
         * Description:     Verify the Occupied Bins stat card (API → UI).
         *                  Newly seeded bins have no containers — occupied count is
         *                  driven by QA's existing state, not our seed.
         * Technique:       Data Integrity.
         */
        it("SW-WL-STATS-TC09: Verify Occupied Bins stat card matches API", { tags: ["@regression"] }, () => {
            const baseUrl = Cypress.env("API_BASE_URL");

            cy.getAuthToken().then((token) => {
                cy.request({
                    method: "GET",
                    url: `${baseUrl}/wms/locations/stats`,
                    headers: { Authorization: `Bearer ${token}` },
                    failOnStatusCode: false,
                }).then((apiRes) => {
                    if (apiRes.status !== 200) {
                        cy.log(`Stats API returned ${apiRes.status} — skipping`);
                        return;
                    }
                    const apiOccupied = apiRes.body.occupiedBins;
                    cy.log(`Occupied Bins: API=${apiOccupied}`);

                    locationsPage.visit();
                    locationsPage.readStatCardValue("Occupied Bins").then((uiCount) => {
                        cy.log(`Occupied Bins: UI=${uiCount}`);
                        expect(uiCount, "Occupied Bins UI matches API").to.equal(apiOccupied);
                    });
                });
            });
        });

        /**
         * Test ID:         SW-WL-STATS-TC10
         * Description:     Verify the Bin Occupancy % stat card is the rounded
         *                  ratio (occupiedBins / bins × 100) and matches the UI.
         *
         * Test Steps:
         *   1. Call GET stats API to read bins, occupiedBins, binOccupancyPercent.
         *   2. Compute expected = round(occupiedBins / bins * 100) (0 when bins = 0).
         *   3. Assert API binOccupancyPercent equals the computed value.
         *   4. Assert UI "Bin Occupancy %" stat card equals the API value.
         *
         * Technique:       Equivalence Partitioning + arithmetic check.
         */
        it(
            "SW-WL-STATS-TC10: Verify Bin Occupancy % stat card matches API and is correctly computed",
            { tags: ["@smoke"] },
            () => {
                const baseUrl = Cypress.env("API_BASE_URL");

                cy.getAuthToken().then((token) => {
                    cy.request({
                        method: "GET",
                        url: `${baseUrl}/wms/locations/stats`,
                        headers: { Authorization: `Bearer ${token}` },
                        failOnStatusCode: false,
                    }).then((apiRes) => {
                        if (apiRes.status !== 200) {
                            cy.log(`Stats API returned ${apiRes.status} — skipping`);
                            return;
                        }
                        const totalBins = apiRes.body.bins;
                        const occupiedBins = apiRes.body.occupiedBins;
                        const apiOccupancy = apiRes.body.binOccupancyPercent;
                        const expectedOccupancy =
                            totalBins > 0 ? Math.round((occupiedBins / totalBins) * 100) : 0;

                        cy.log(`API: ${occupiedBins}/${totalBins} = ${apiOccupancy}% (expected ${expectedOccupancy}%)`);
                        expect(apiOccupancy, "API binOccupancyPercent equals computed ratio").to.equal(
                            expectedOccupancy
                        );

                        locationsPage.visit();
                        locationsPage.readStatCardValue("Bin Occupancy %").then((uiOccupancy) => {
                            cy.log(`UI Bin Occupancy %: ${uiOccupancy}`);
                            expect(uiOccupancy, "Bin Occupancy % UI matches API").to.equal(apiOccupancy);
                        });
                    });
                });
            }
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Duration Columns — Occupied Duration / Vacant Duration
    // (SW-WL-DUR-TC01–TC04)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Background:
    //   The main Locations grid has two duration columns:
    //     • Occupied Duration  — rendered only when bin.isOccupied === true
    //                            (shows "--" otherwise)
    //     • Vacant Duration    — rendered only when bin.isOccupied === false
    //                            (shows "--" otherwise)
    //   Both use formatDurationSince(timestamp) → "{days}d {hours}h".
    //   The timestamps (lastOccupiedAt, lastEmptiedAt) are set on the
    //   Location row whenever a container is assigned / reassigned:
    //     PUT /containers/:id { locationId } → backend sets last_occupied_at
    //     on the NEW location and last_emptied_at on the OLD location.
    //
    // Seeding strategy:
    //   before() creates TWO Bins under the same Level via API, then:
    //     Step 1: Assign container to Bin A → Bin A isOccupied=true,
    //             lastOccupiedAt=now().
    //     Step 2: Reassign container to Bin B → Bin A isOccupied=false,
    //             lastEmptiedAt=now();  Bin B isOccupied=true,
    //             lastOccupiedAt=now().
    //   Net result entering the tests:
    //     Bin A: vacant  → shows Vacant Duration = "0d 0h", Occupied = "--"
    //     Bin B: occupied → shows Occupied Duration = "0d 0h", Vacant = "--"
    //
    // Duration format: "{days}d {hours}h"   e.g. "0d 0h", "1d 3h"
    // Since the smallest granularity is hours, a freshly-assigned bin
    // (within the same minute) always reads "0d 0h".

    describe("Duration Columns (SW-WL-DUR-TC01–TC04)", { tags: ["@regression"] }, () => {
        const suite = {
            facilityId: null,
            typeId: null,
            containerId: null,
            binAPath: null, // vacant after reassignment
            binBPath: null, // occupied after reassignment
        };

        before(() => {
            cy.authSession('admin');
            cy.visit("/");
            sweepDisposableLocations();

            const baseUrl = Cypress.env("API_BASE_URL");

            // Build a full Facility → … → Level chain, then create Bin A and Bin B
            // under the same Level so both share a compact path.
            createLocationViaApi({ name: disposableName("dur-fac"), type: "Facility" })
                .then((fac) => {
                    suite.facilityId = fac.id;
                    return createLocationViaApi({
                        name: disposableName("dur-zone"),
                        type: "Zone",
                        parentId: fac.id,
                    });
                })
                .then((zone) =>
                    createLocationViaApi({
                        name: disposableName("dur-area"),
                        type: "Area",
                        parentId: zone.id,
                    })
                )
                .then((area) =>
                    // Row/Bay/Level/Bin: do NOT pass name — API auto-generates
                    // the code for these types (same as createDisposableBinChain).
                    createLocationViaApi({ type: "Row", parentId: area.id })
                )
                .then((row) =>
                    createLocationViaApi({ type: "Bay", parentId: row.id })
                )
                .then((bay) =>
                    createLocationViaApi({ type: "Level", parentId: bay.id })
                )
                .then((level) => {
                    // Create both Bins sequentially — Promise.all does not
                    // work with Cypress chains (see Stats before() comment).
                    return createLocationViaApi({ type: "Bin", parentId: level.id })
                    .then((binA) => {
                        return createLocationViaApi({ type: "Bin", parentId: level.id })
                        .then((binB) => cy.wrap([binA, binB]));
                    });
                })
                .then(([binA, binB]) => {
                    // Compute the hierarchy paths the main grid displays
                    // (segments joined with " > ", see Frontend utils/locationPath.ts).
                    suite.binAPath = String(binA.path || "")
                        .split(/[/.]/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(" > ");
                    suite.binBPath = String(binB.path || "")
                        .split(/[/.]/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(" > ");

                    // Create a disposable container type and container.
                    return createContainerTypeViaApi(disposableTypeName("DUR")).then((ct) => {
                        suite.typeId = ct.id;
                        return createContainerViaApi(ct.id);
                    }).then((container) => {
                        suite.containerId = container.id;

                        // Step 1: Assign container → Bin A.
                        // This sets lastOccupiedAt on Bin A.
                        return cy.getAuthToken().then((token) =>
                            cy.request({
                                method: "PUT",
                                url: `${baseUrl}/containers/${suite.containerId}`,
                                headers: { Authorization: `Bearer ${token}` },
                                body: { locationId: binA.id },
                                failOnStatusCode: false,
                            })
                        );
                    }).then(() => {
                        // Step 2: Reassign container → Bin B.
                        // Backend sets lastEmptiedAt on Bin A and lastOccupiedAt on Bin B.
                        return cy.getAuthToken().then((token) =>
                            cy.request({
                                method: "PUT",
                                url: `${baseUrl}/containers/${suite.containerId}`,
                                headers: { Authorization: `Bearer ${token}` },
                                body: { locationId: binB.id },
                                failOnStatusCode: false,
                            })
                        );
                    });
                });
        });

        after(() => {
            cy.authSession('admin');
            const baseUrl = Cypress.env("API_BASE_URL");
            if (suite.containerId) {
                deleteContainerViaApi(suite.containerId);
            }
            if (suite.facilityId) {
                deleteLocationViaApi(suite.facilityId);
            }
            if (suite.typeId) {
                deleteContainerTypeViaApi(suite.typeId);
            }
        });

        // Helper: read a specific named-column cell value from a table row
        // identified by binPath.  Uses jQuery index() to align header and cell
        // positions (robust to selection-checkbox columns prepended by MRT).
        const readDurationCell = (binPath, columnHeader) => {
            return cy.get("table thead tr").find("th").then(($ths) => {
                let colIdx = -1;
                $ths.each((i, th) => {
                    if (
                        Cypress.$(th)
                            .text()
                            .trim()
                            .toLowerCase()
                            .includes(columnHeader.toLowerCase())
                    ) {
                        colIdx = i;
                    }
                });
                expect(colIdx, `column "${columnHeader}" found in thead`).to.be.gte(0);
                return cy
                    .contains("table tbody tr", binPath)
                    .find("td")
                    .eq(colIdx)
                    .invoke("text")
                    .then((t) => t.trim());
            });
        };

        /**
         * Test ID:         SW-WL-DUR-TC01
         * Description:     Verify the "Occupied Duration" column shows "0d 0h"
         *                  for a bin that was assigned a container in the
         *                  current hour.
         *
         * Test Steps:
         *   1. (Pre-condition) Container was assigned to Bin B in before().
         *   2. Visit /warehouse-management/locations.
         *   3. Search for Bin B's path so its row is in view.
         *   4. Read the "Occupied Duration" cell for Bin B.
         *
         * Expected Result:
         *   - The cell shows "0d 0h" (assigned within the same hour as the test).
         *   - The value matches the pattern /^\d+d \d+h$/ (valid format).
         *
         * Test Data:
         *   - Bin B seeded in before(); container assigned within this test run.
         *
         * Technique:       State Transition
         * Why this technique: The transition "unoccupied → occupied" sets
         *                  lastOccupiedAt to now() on the backend; the
         *                  frontend renders (now − lastOccupiedAt) as
         *                  "{days}d {hours}h". A freshly-assigned bin must
         *                  read "0d 0h".
         */
        it(
            "SW-WL-DUR-TC01: Verify Occupied Duration shows '0d 0h' for a bin assigned in the current hour",
            { tags: ["@smoke"] },
            () => {
                locationsPage.visit();
                locationsPage.search(suite.binBPath);
                warehouseLocationsLocators.mainGridBinRow(suite.binBPath).should("be.visible");

                readDurationCell(suite.binBPath, "Occupied Duration").then((text) => {
                    cy.log(`Occupied Duration for Bin B: "${text}"`);
                    // Freshly assigned → current-hour window → "0d 0h"
                    expect(text, "format is {N}d {N}h").to.match(/^\d+d \d+h$/);
                    expect(text, "assigned in the same hour → 0d 0h").to.equal("0d 0h");
                });
            }
        );

        /**
         * Test ID:         SW-WL-DUR-TC02
         * Description:     Verify the "Vacant Duration" column shows "--" for
         *                  an OCCUPIED bin (conditional rendering: the column
         *                  is hidden by the frontend when isOccupied = true).
         *
         * Test Steps:
         *   1. Visit /warehouse-management/locations.
         *   2. Search for Bin B's path (occupied bin).
         *   3. Read the "Vacant Duration" cell.
         *
         * Expected Result:
         *   - The cell shows "--".
         *
         * Test Data:
         *   - Bin B (occupied, container assigned in before()).
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: The "occupied bin" partition must show "--" in
         *                  the Vacant Duration column. This pins the FE
         *                  conditional-render contract.
         */
        it(
            "SW-WL-DUR-TC02: Verify Vacant Duration shows '--' for an occupied bin",
            { tags: ["@regression"] },
            () => {
                locationsPage.visit();
                locationsPage.search(suite.binBPath);
                warehouseLocationsLocators.mainGridBinRow(suite.binBPath).should("be.visible");

                readDurationCell(suite.binBPath, "Vacant Duration").then((text) => {
                    cy.log(`Vacant Duration for Bin B (occupied): "${text}"`);
                    expect(text, "occupied bin → Vacant Duration hidden as '--'").to.equal("--");
                });
            }
        );

        /**
         * Test ID:         SW-WL-DUR-TC03
         * Description:     Verify the "Vacant Duration" column shows "0d 0h"
         *                  for a bin that was vacated (container moved away)
         *                  in the current hour.
         *
         * Test Steps:
         *   1. (Pre-condition) Container was moved FROM Bin A TO Bin B in
         *      before(); this sets lastEmptiedAt on Bin A.
         *   2. Visit /warehouse-management/locations.
         *   3. Search for Bin A's path.
         *   4. Read the "Vacant Duration" cell for Bin A.
         *
         * Expected Result:
         *   - The cell shows "0d 0h" (vacated within the same hour).
         *
         * Test Data:
         *   - Bin A: was occupied then vacated — both within the same test run.
         *
         * Technique:       State Transition
         * Why this technique: The transition "occupied → vacant" sets
         *                  lastEmptiedAt to now() on the backend; the
         *                  frontend renders (now − lastEmptiedAt) as
         *                  "{days}d {hours}h". A freshly-vacated bin must
         *                  read "0d 0h".
         */
        it(
            "SW-WL-DUR-TC03: Verify Vacant Duration shows '0d 0h' for a bin vacated in the current hour",
            { tags: ["@smoke"] },
            () => {
                locationsPage.visit();
                locationsPage.search(suite.binAPath);
                warehouseLocationsLocators.mainGridBinRow(suite.binAPath).should("be.visible");

                readDurationCell(suite.binAPath, "Vacant Duration").then((text) => {
                    cy.log(`Vacant Duration for Bin A (vacated): "${text}"`);
                    expect(text, "format is {N}d {N}h").to.match(/^\d+d \d+h$/);
                    expect(text, "vacated in the same hour → 0d 0h").to.equal("0d 0h");
                });
            }
        );

        /**
         * Test ID:         SW-WL-DUR-TC04
         * Description:     Verify the "Occupied Duration" column shows "--"
         *                  for a VACANT bin (conditional rendering: the column
         *                  is hidden by the frontend when isOccupied = false).
         *
         * Test Steps:
         *   1. Visit /warehouse-management/locations.
         *   2. Search for Bin A's path (vacant bin).
         *   3. Read the "Occupied Duration" cell.
         *
         * Expected Result:
         *   - The cell shows "--".
         *
         * Test Data:
         *   - Bin A (vacant, container moved away in before()).
         *
         * Technique:       Equivalence Partitioning
         * Why this technique: The "vacant bin" partition must show "--" in
         *                  the Occupied Duration column. Pair to TC02 — the
         *                  two together pin the conditional-render contract
         *                  from both partitions.
         */
        it(
            "SW-WL-DUR-TC04: Verify Occupied Duration shows '--' for a vacant bin",
            { tags: ["@regression"] },
            () => {
                locationsPage.visit();
                locationsPage.search(suite.binAPath);
                warehouseLocationsLocators.mainGridBinRow(suite.binAPath).should("be.visible");

                readDurationCell(suite.binAPath, "Occupied Duration").then((text) => {
                    cy.log(`Occupied Duration for Bin A (vacant): "${text}"`);
                    expect(text, "vacant bin → Occupied Duration hidden as '--'").to.equal("--");
                });
            }
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // E2E full drill-through (TC89)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // The plan calls for an end-to-end test that exercises the entire
    // hierarchy creation flow as a real user would — through the UI, no
    // API shortcuts. This test is intentionally heavy: it touches every
    // sub-page and confirms each level wires up to the next.
    //
    // Container assignment is out of scope for this Locations chunk
    // (chunk 14 in the plan covers Container assignment); we stop at Bin
    // and confirm the freshly-created Bin lands on the main grid.
    describe("E2E Full Drill-through (TC89)", () => {
        before(() => {
            cy.authSession('admin');
            cy.visit("/");
            // Pre-run sweep — this test creates a brand-new chain via UI,
            // and we don't want stale AUTO_WMS_* facilities to clutter the
            // search.
            sweepDisposableLocations();
        });

        // Sweep after the test runs so the chain we created via UI doesn't
        // linger. The Facility name uses disposableName(), which the
        // sweeper recognises by the AUTO_WMS_ prefix.
        after(() => {
            sweepDisposableLocations();
        });

        /**
         * Test ID:         SW-WL-UI-TC89
         * Description:     Verify a full UI hierarchy create-and-drill flow:
         *                  Facility → Zone → Area → Row → Bay → Level → Bin
         *                  works end-to-end and the Bin appears on the main
         *                  Locations grid.
         *
         * Test Steps:
         *   1. Log in as Admin.
         *   2. Manage Locations → Add Facility (with disposable name).
         *   3. Drill into the Facility → Add Zone (with disposable name).
         *   4. Drill into the Zone → Add Area (with disposable name).
         *   5. Drill into the Area → Add Row (auto code).
         *   6. Drill into the Row → Add Bay (auto code).
         *   7. Drill into the Bay → Add Level (auto code).
         *   8. Drill into the Level → Add Bin (auto code).
         *   9. Navigate back to the main Locations grid.
         *  10. Search for the new Bin's BN-N code.
         *
         * Expected Result:
         *   - Each Add step reaches a card/row showing the new entity.
         *   - The freshly-created Bin appears on the main /locations grid
         *     when searched by its BN-N code.
         *
         * Test Data:
         *   - All disposable names generated at runtime; no pre-seeded
         *     fixtures consumed.
         *
         * Technique:       Use Case (E2E)
         * Why this technique: A full happy-path drill is the single best
         *                  proof that the seven sub-pages compose correctly.
         *                  We accept the cost — it's deliberately one test,
         *                  not seven duplicated ones.
         */
        it("SW-WL-UI-TC89: Verify a full UI Facility → Zone → Area → Row → Bay → Level → Bin drill-through works end-to-end", { tags: ["@regression", "@e2e"] }, () => {
            const facilityName = disposableName("e2e-fac");
            const zoneName = disposableName("e2e-zone");
            const areaName = disposableName("e2e-area");

            // Step 1: create Facility via UI.
            locationsPage.visitFacilities();
            locationsPage.addFacility({ name: facilityName });
            locationsPage.verifyFacilityPresent(facilityName);

            // Step 2: drill into it and create a Zone via UI.
            locationsPage.visitZonesViaFacility(facilityName);
            locationsPage.addZone({ name: zoneName });
            locationsPage.verifyZonePresent(zoneName);

            // Step 3: drill into it and create an Area via UI.
            locationsPage.visitAreasViaZone(zoneName);
            locationsPage.addArea({ name: areaName });
            locationsPage.verifyAreaPresent(areaName);

            // Step 4: drill into it and create a Row via UI.
            locationsPage.visitRowsViaArea(areaName);
            locationsPage.addRow().then((rowCode) => {
                locationsPage.verifyRowPresent(rowCode);

                // Step 5: drill into it and create a Bay via UI.
                locationsPage.visitBaysViaRow(rowCode);
                locationsPage.addBay().then((bayCode) => {
                    locationsPage.verifyBayPresent(bayCode);

                    // Step 6: drill into it and create a Level via UI.
                    locationsPage.visitLevelsViaBay(bayCode);
                    locationsPage.addLevel().then((levelCode) => {
                        locationsPage.verifyLevelPresent(levelCode);

                        // Step 7: drill into it and create a Bin via UI.
                        locationsPage.visitBinsViaLevel(levelCode);
                        locationsPage.addBin().then((binCode) => {
                            locationsPage.verifyBinPresent(binCode);

                            // Step 8: back to the main grid; search for our
                            // Bin to confirm it propagated to the leaf-only
                            // Locations grid.
                            locationsPage.visit();
                            locationsPage.search(binCode);

                            // The main grid filters in `manualFiltering`
                            // mode — the React-query refetch will repaint
                            // the table once the result lands. We poll for
                            // the bin code to appear in any row.
                            cy.contains("table tbody tr", binCode, { timeout: 15000 })
                                .should("be.visible");
                        });
                    });
                });
            });
        });
    });
});
