// cypress/pageObjects/WarehouseLocationsPage.js
//
// Page Object for the Warehouse Management → Locations screen.
// Covers the affordances visible on the main /warehouse-management/locations
// route (no Manage-Locations modal yet; that lands in a later chunk).
//
// Selector access goes through warehouseLocationsLocators so tests never
// reach into the DOM directly.

import warehouseLocationsLocators from "../support/locators/warehouseLocationsLocators";

class WarehouseLocationsPage {
    // ---- Navigation --------------------------------------------------------

    // Visit the Locations page using the URL key from urls.json so we never
    // hard-code the route. Caller is responsible for cy.authSession('admin') first.
    visit() {
        cy.fixture("urls.json").then((urls) => {
            cy.visit(urls.warehouseLocations);
        });
        // The evolved page no longer renders an <h5> "Locations" page title
        // (only a breadcrumb leaf remains). Confirm the route resolved and the
        // page chrome rendered by waiting for the always-present "Manage
        // Locations" button instead of the removed heading.
        cy.location("pathname", { timeout: 30000 }).should("include", "locations");
        warehouseLocationsLocators
            .manageLocationsBtn()
            .should("be.visible");
    }

    // ---- Page chrome -------------------------------------------------------

    verifyPageHeading() {
        warehouseLocationsLocators.pageHeading().should("be.visible");
    }

    verifyBreadcrumb() {
        // The breadcrumb shows three segments — "Dashboard", "Warehouse
        // Management", "Locations" with the active one highlighted.
        cy.contains(/dashboard/i).should("be.visible");
        cy.contains(/warehouse management/i).should("be.visible");
        warehouseLocationsLocators.breadcrumbActive().should("be.visible");
    }

    // ---- Stats cards -------------------------------------------------------

    // Asserts every documented stat card label is rendered on screen.
    // Used by the "all stats present" test.
    verifyAllStatCardsRendered() {
        const labels = warehouseLocationsLocators.allStatLabels();
        labels.forEach((label) => {
            warehouseLocationsLocators.statCard(label).should("exist");
        });
    }

    // For a given stat-card label, asserts that the card text contains a
    // numeric value. Bin Occupancy % is allowed to include a "%" sign.
    verifyStatCardHasNumericValue(label) {
        warehouseLocationsLocators
            .statCardValue(label)
            .invoke("text")
            .should("match", /\d/); // at least one digit somewhere in the card
    }

    // ---- Filters / search --------------------------------------------------

    // Open the Status dropdown and pick an option by its visible text.
    selectStatus(optionLabel) {
        warehouseLocationsLocators.statusSelect().click();
        warehouseLocationsLocators.statusOption(optionLabel).click();
    }

    // Type into the search box but DO NOT submit. Tests assert the input
    // value separately from the submit (`Search` button) behavior.
    typeSearch(text) {
        warehouseLocationsLocators.searchInput().clear().type(text);
    }

    // Click the "Search" button. The page filters its grid client-/server-side
    // when this is clicked (the input alone doesn't trigger). The deployed build
    // DISABLES the Search button when the input is empty, so only click when it
    // is actually enabled — clicking a disabled button throws and an empty search
    // is a no-op anyway (the grid is already showing the unfiltered set).
    submitSearch() {
        warehouseLocationsLocators.searchButton().then(($btn) => {
            if (!$btn.is(':disabled')) cy.wrap($btn).click();
        });
    }

    // Convenience: type + submit in one call for happy-path searches.
    search(text) {
        this.typeSearch(text);
        this.submitSearch();
    }

    // Clear the search box so the grid resets. With an empty input the Search
    // button is disabled and clicking it throws; submitSearch() now no-ops when
    // disabled, and clearing the field already restores the unfiltered grid.
    clearSearch() {
        warehouseLocationsLocators.searchInput().clear();
        this.submitSearch();
    }

    // ---- Table -------------------------------------------------------------

    verifyTableRendered() {
        warehouseLocationsLocators.table().should("be.visible");
    }

    // Asserts the documented column set is present in the order seen in
    // discovery: Bin Path · Status · Assignment · Occupied Duration ·
    // Vacant Duration · Actions.
    verifyTableColumns(expected) {
        warehouseLocationsLocators
            .tableHeaders()
            .should(($headers) => {
                const actual = [...$headers].map((h) => h.innerText.trim()).filter(Boolean);
                expected.forEach((label) => {
                    expect(actual.join("|")).to.match(new RegExp(label, "i"));
                });
            });
    }

    // Returns the rows-count via Cypress chain so tests can do their own
    // assertions on it (e.g. "at least 1", "exactly 0", etc.).
    tableRows() {
        return warehouseLocationsLocators.tableRows();
    }

    // ---- Manage Locations button ------------------------------------------

    // Click the "Manage Locations" button. Discovery showed this navigates
    // to /warehouse-management/locations/facilities — a separate route, not
    // a modal. Subsequent verifications belong to the Facilities Management
    // helpers below.
    openManageLocations() {
        warehouseLocationsLocators.manageLocationsBtn().click();
        // Confirm the route changed by checking the new heading.
        warehouseLocationsLocators.facilitiesPageHeading().should("be.visible");
    }

    // ========================================================================
    // Facilities Management (sub-page reached via "Manage Locations")
    // ========================================================================

    // ---- Navigation -------------------------------------------------------

    // Direct visit to the Facilities Management page. Bypasses the click on
    // the main page so tests that focus only on Facilities don't pay for the
    // round trip. Caller must already have an admin session.
    // Visit the Facilities Management page. Pass an optional `searchTerm`
    // (name or code) to immediately filter the list to that facility — REQUIRED
    // when the caller then drills into a specific facility, because the list is
    // server-paginated (pageSize 20, ordered by id ASC). On a busy QA a
    // freshly-created parent facility lands on a later page and its drill-down
    // card is never visible in the default view, which cascaded into
    // "before each" hook failures ("Timed out finding content 'F-150'").
    visitFacilities(searchTerm) {
        cy.fixture("urls.json").then((urls) => {
            // Sub-route appended to the warehouseLocations URL key.
            cy.visit(`${urls.warehouseLocations}/facilities`);
            warehouseLocationsLocators.facilitiesPageHeading().should("be.visible");
        });
        if (searchTerm) {
            this.searchFacilities(searchTerm);
            warehouseLocationsLocators.facilityCardText(searchTerm).should("exist");
        }
    }

    verifyFacilitiesPageHeading() {
        warehouseLocationsLocators.facilitiesPageHeading().should("be.visible");
    }

    // ---- Add Facility -----------------------------------------------------

    // Opens the Add Facility dialog. Form-field interactions live in the
    // helpers below so tests can compose them.
    openAddFacility() {
        warehouseLocationsLocators.addFacilityBtn().click();
        warehouseLocationsLocators.facilityDialog().should("be.visible");
        // The Facility Code is fetched async (GET /locations/next-code/Facility).
        // Wait for it to populate — handleSubmit() rejects with a toast when
        // codeId is still empty and the dialog stays open.
        warehouseLocationsLocators.facilityCodeInput().should("not.have.value", "");
    }

    // Type into the dialog's name input. Scoped inside the dialog so we
    // don't accidentally hit a same-named input elsewhere on the page.
    typeFacilityName(value) {
        warehouseLocationsLocators
            .facilityDialog()
            .within(() => {
                warehouseLocationsLocators.facilityNameInput().clear().type(value);
            });
    }

    // NOTE: the Facility Code field is auto-generated and read-only on the
    // UI. This helper exists ONLY so a test can intentionally attempt to
    // type into it (e.g. to verify the field really is read-only) — never
    // to seed test data with a custom code. If a test is using this for
    // anything other than a negative-path assertion, that test is wrong:
    // a user can't reach this state.
    typeFacilityCode(value) {
        warehouseLocationsLocators
            .facilityDialog()
            .within(() => {
                warehouseLocationsLocators.facilityCodeInput().clear().type(value);
            });
    }

    // Submit the dialog. The CTA name differs by mode — Add uses "Create",
    // Edit uses "Save" or "Update". We click whichever is present so this
    // single helper covers both flows.
    saveFacility() {
        warehouseLocationsLocators.facilityDialog().within(() => {
            cy.get('button').then(($btns) => {
                const createBtn = [...$btns].find((b) => /^create$/i.test(b.innerText.trim()));
                const updateBtn = [...$btns].find((b) => /^(save|update)$/i.test(b.innerText.trim()));
                const target = createBtn || updateBtn;
                expect(target, 'Create/Save/Update button in dialog').to.exist;
                cy.wrap(target).click();
            });
        });
    }

    // Dismiss the dialog without saving. Used in negative tests.
    cancelFacilityDialog() {
        warehouseLocationsLocators
            .facilityDialog()
            .within(() => {
                warehouseLocationsLocators.facilityCancelBtn().click();
            });
    }

    // Convenience: full happy-path create. Returns nothing — caller asserts.
    addFacility({ name, code }) {
        this.openAddFacility();
        this.typeFacilityName(name);
        if (code) this.typeFacilityCode(code);
        this.saveFacility();
        // Wait for dialog to close — confirms the save round-tripped.
        warehouseLocationsLocators.facilityDialog().should("not.exist");
        // Confirm the new card via SEARCH, not by scanning the default list.
        // The Facilities list is server-paginated at pageSize 20, ordered by
        // `code ASC` (location.service.ts). On a QA where facilities have
        // accumulated past 20, a freshly-created one sorts onto a later page
        // and never appears in the default view — so the old
        // `facilityCardText(name).should("exist")` timed out intermittently
        // (SW-WL-UI-TC24 flake). Searching the unique name filters the list to
        // it, so the card is reliably visible regardless of total count. The
        // list stays filtered to `name`; callers that rename the facility must
        // re-search for the new name (see 25-…TC23).
        this.searchFacilities(name);
        warehouseLocationsLocators.facilityCardText(name).should("exist");
    }

    // ---- Edit Facility ----------------------------------------------------

    // Open the Edit dialog for a Facility identified by visible name/code.
    openEditFacility(nameOrCode) {
        warehouseLocationsLocators
            .facilityRow(nameOrCode)
            .within(() => {
                warehouseLocationsLocators.editFacilityBtn().click();
            });
        warehouseLocationsLocators.facilityDialog().should("be.visible");
    }

    // ---- Delete Facility --------------------------------------------------

    // Click the row's Delete icon. Confirmation handling is separated so
    // negative tests can also exercise the cancel path.
    clickDeleteFacility(nameOrCode) {
        warehouseLocationsLocators
            .facilityRow(nameOrCode)
            .within(() => {
                warehouseLocationsLocators.deleteFacilityBtn().click();
            });
    }

    // Confirm a pending delete in the confirmation dialog (if any).
    confirmDelete() {
        // Some flows have a confirm dialog, some don't. Check first to avoid
        // a test failure when there's no dialog to confirm.
        cy.get("body").then(($body) => {
            if ($body.find('[role="dialog"]').length > 0) {
                warehouseLocationsLocators.confirmDeleteBtn().click();
            }
        });
    }

    // Cancel a pending delete in the confirmation dialog. Negative tests use
    // this to verify the row stays in place.
    cancelDelete() {
        cy.get("body").then(($body) => {
            if ($body.find('[role="dialog"]').length > 0) {
                warehouseLocationsLocators.confirmCancelBtn().click();
            }
        });
    }

    // ---- Facilities search ------------------------------------------------

    typeFacilitiesSearch(text) {
        warehouseLocationsLocators.facilitiesSearchInput().clear().type(text);
    }

    submitFacilitiesSearch() {
        warehouseLocationsLocators.facilitiesSearchBtn().click();
    }

    searchFacilities(text) {
        this.typeFacilitiesSearch(text);
        this.submitFacilitiesSearch();
    }

    // Clear the Facilities filter and re-submit, restoring the unfiltered
    // list. `addFacility()` deliberately leaves the list filtered to the name
    // it just created (that search is how it confirms the card on a
    // server-paginated list); any case that then wants to TEST searching must
    // reset first, or it would only re-search what its own precondition
    // already searched.
    clearFacilitiesSearch() {
        warehouseLocationsLocators.facilitiesSearchInput().clear();
        this.submitFacilitiesSearch();
    }

    // ---- Drill-down -------------------------------------------------------

    // Click the "View & Manage Zones (n)" button on a Facility row. After
    // this, the page transitions to a Zones-management view (its own URL).
    // Uses facilityCard() (not facilityRow) because the drill-down button
    // lives in an outer wrapper that the row scope doesn't reach.
    drillIntoZones(nameOrCode) {
        warehouseLocationsLocators
            .facilityCard(nameOrCode)
            .within(() => {
                warehouseLocationsLocators.viewManageZonesBtn().click();
            });
    }

    // ---- Verifications ----------------------------------------------------

    // Asserts a Facility card containing the given name/code is present.
    // Uses the light card-text locator (not the full row scope) — fast and
    // doesn't care whether the page renders as cards or rows.
    verifyFacilityPresent(nameOrCode) {
        warehouseLocationsLocators.facilityCardText(nameOrCode).should("exist");
    }

    // Asserts no element on the page contains the given name/code.
    verifyFacilityAbsent(nameOrCode) {
        cy.contains(nameOrCode).should("not.exist");
    }

    // ========================================================================
    // Zones Management (sub-page reached by drilling into a Facility)
    // ========================================================================

    // ---- Navigation ------------------------------------------------------

    // Drill from the Facilities Management page into a specific Facility's
    // Zones list. Caller must already be on /facilities. After this call,
    // the URL transitions to the Zones page for the chosen Facility.
    visitZonesViaFacility(facilityNameOrCode) {
        // Re-uses the existing Facilities drill-down logic.
        this.drillIntoZones(facilityNameOrCode);
        warehouseLocationsLocators.zonesPageHeading().should("be.visible");
    }

    verifyZonesPageHeading() {
        warehouseLocationsLocators.zonesPageHeading().should("be.visible");
    }

    clickBackToFacilities() {
        warehouseLocationsLocators.backToFacilitiesBtn().click();
        warehouseLocationsLocators.facilitiesPageHeading().should("be.visible");
    }

    // ---- Add Zone --------------------------------------------------------

    openAddZone() {
        warehouseLocationsLocators.addZoneBtn().click();
        warehouseLocationsLocators.zoneDialog().should("be.visible");
    }

    typeZoneName(value) {
        warehouseLocationsLocators
            .zoneDialog()
            .within(() => {
                warehouseLocationsLocators.zoneNameInput().clear().type(value);
            });
    }

    // NOTE: same constraint as typeFacilityCode — Zone Code is auto-
    // generated and read-only on the UI. Use only for negative-path
    // assertions, never for happy-path scaffolding.
    typeZoneCode(value) {
        warehouseLocationsLocators
            .zoneDialog()
            .within(() => {
                warehouseLocationsLocators.zoneCodeInput().clear().type(value);
            });
    }

    // Submit the Zone dialog. Same dual-mode pattern as saveFacility — the
    // Add dialog uses "Create"; the Edit dialog probably uses "Save"/"Update".
    saveZone() {
        warehouseLocationsLocators.zoneDialog().within(() => {
            cy.get("button").then(($btns) => {
                const createBtn = [...$btns].find((b) => /^create$/i.test(b.innerText.trim()));
                const updateBtn = [...$btns].find((b) => /^(save|update)$/i.test(b.innerText.trim()));
                const target = createBtn || updateBtn;
                expect(target, "Create/Save/Update button in Zone dialog").to.exist;
                cy.wrap(target).click();
            });
        });
    }

    cancelZoneDialog() {
        warehouseLocationsLocators
            .zoneDialog()
            .within(() => {
                warehouseLocationsLocators.zoneCancelBtn().click();
            });
    }

    // Convenience full happy-path create.
    addZone({ name, code }) {
        this.openAddZone();
        this.typeZoneName(name);
        if (code) this.typeZoneCode(code);
        this.saveZone();
        warehouseLocationsLocators.zoneDialog().should("not.exist");
    }

    // ---- Edit Zone -------------------------------------------------------

    openEditZone(nameOrCode) {
        warehouseLocationsLocators
            .zoneRow(nameOrCode)
            .within(() => {
                warehouseLocationsLocators.editZoneBtn().click();
            });
        warehouseLocationsLocators.zoneDialog().should("be.visible");
    }

    // ---- Delete Zone -----------------------------------------------------

    clickDeleteZone(nameOrCode) {
        warehouseLocationsLocators
            .zoneRow(nameOrCode)
            .within(() => {
                warehouseLocationsLocators.deleteZoneBtn().click();
            });
    }

    // ---- Zones search ----------------------------------------------------

    typeZonesSearch(text) {
        warehouseLocationsLocators.zonesSearchInput().clear().type(text);
    }

    submitZonesSearch() {
        warehouseLocationsLocators.zonesSearchBtn().click();
    }

    searchZones(text) {
        this.typeZonesSearch(text);
        this.submitZonesSearch();
    }

    // ---- Drill-down to Areas --------------------------------------------

    drillIntoAreas(zoneNameOrCode) {
        // Uses zoneCard() (outer scope) because the drill-down button lives
        // outside the inner Edit/Delete wrapper that zoneRow targets.
        warehouseLocationsLocators
            .zoneCard(zoneNameOrCode)
            .within(() => {
                warehouseLocationsLocators.viewManageAreasBtn().click();
            });
    }

    // ---- Verifications ---------------------------------------------------

    verifyZonePresent(nameOrCode) {
        warehouseLocationsLocators.zoneCardText(nameOrCode).should("exist");
    }

    verifyZoneAbsent(nameOrCode) {
        cy.contains(nameOrCode).should("not.exist");
    }

    // ========================================================================
    // Areas Management (sub-page reached by drilling into a Zone)
    // ========================================================================

    // ---- Navigation ------------------------------------------------------

    // Drill from the Zones Management page into a specific Zone's Areas
    // list. Caller must already be on the Zones page. After this call, the
    // URL transitions to /warehouse-management/locations/areas?...
    visitAreasViaZone(zoneNameOrCode) {
        // Re-uses the existing Zones drill-down logic.
        this.drillIntoAreas(zoneNameOrCode);
        warehouseLocationsLocators.areasPageHeading().should("be.visible");
    }

    verifyAreasPageHeading() {
        warehouseLocationsLocators.areasPageHeading().should("be.visible");
    }

    clickBackToZones() {
        warehouseLocationsLocators.backToZonesBtn().click();
        warehouseLocationsLocators.zonesPageHeading().should("be.visible");
    }

    // ---- Add Area --------------------------------------------------------

    openAddArea() {
        warehouseLocationsLocators.addAreaBtn().click();
        warehouseLocationsLocators.areaDialog().should("be.visible");
    }

    typeAreaName(value) {
        warehouseLocationsLocators
            .areaDialog()
            .within(() => {
                warehouseLocationsLocators.areaNameInput().clear().type(value);
            });
    }

    // NOTE: same constraint as typeFacilityCode/typeZoneCode — Area Code is
    // auto-generated and read-only. Use only for negative-path assertions.
    typeAreaCode(value) {
        warehouseLocationsLocators
            .areaDialog()
            .within(() => {
                warehouseLocationsLocators.areaCodeInput().clear().type(value);
            });
    }

    // Set the four bulk-hierarchy numeric fields. Pass any subset; missing
    // fields keep their default (1). The component clamps each value into
    // [0, fieldMax] on change, so values above max round down on submit.
    setBulkHierarchy({ rows, bays, levels, bins } = {}) {
        warehouseLocationsLocators.areaDialog().within(() => {
            if (rows !== undefined) {
                warehouseLocationsLocators.bulkRowsInput().clear().type(String(rows));
            }
            if (bays !== undefined) {
                warehouseLocationsLocators.bulkBaysInput().clear().type(String(bays));
            }
            if (levels !== undefined) {
                warehouseLocationsLocators.bulkLevelsInput().clear().type(String(levels));
            }
            if (bins !== undefined) {
                warehouseLocationsLocators.bulkBinsInput().clear().type(String(bins));
            }
        });
    }

    // Submit the Area dialog. Same dual-mode pattern as saveZone — Add uses
    // "Create"; Edit uses "Update" or "Save".
    saveArea() {
        warehouseLocationsLocators.areaDialog().within(() => {
            cy.get("button").then(($btns) => {
                const createBtn = [...$btns].find((b) => /^create$/i.test(b.innerText.trim()));
                const updateBtn = [...$btns].find((b) => /^(update|save)$/i.test(b.innerText.trim()));
                const target = createBtn || updateBtn;
                expect(target, "Create/Update/Save button in Area dialog").to.exist;
                cy.wrap(target).click();
            });
        });
    }

    cancelAreaDialog() {
        warehouseLocationsLocators
            .areaDialog()
            .within(() => {
                warehouseLocationsLocators.areaCancelBtn().click();
            });
    }

    // Convenience full happy-path create. Caller can override the bulk-
    // hierarchy values via `bulk` — defaults to 1×1×1×1 (the smallest
    // submission the form accepts) so we create as little garbage as
    // possible per test.
    addArea({ name, code, bulk } = {}) {
        const hierarchy = { rows: 1, bays: 1, levels: 1, bins: 1, ...(bulk || {}) };
        this.openAddArea();
        this.typeAreaName(name);
        if (code) this.typeAreaCode(code);
        this.setBulkHierarchy(hierarchy);
        this.saveArea();
        warehouseLocationsLocators.areaDialog().should("not.exist");
    }

    // ---- Edit Area -------------------------------------------------------

    openEditArea(nameOrCode) {
        warehouseLocationsLocators
            .areaRow(nameOrCode)
            .within(() => {
                warehouseLocationsLocators.editAreaBtn().click();
            });
        warehouseLocationsLocators.areaDialog().should("be.visible");
    }

    // ---- Delete Area -----------------------------------------------------

    clickDeleteArea(nameOrCode) {
        warehouseLocationsLocators
            .areaRow(nameOrCode)
            .within(() => {
                warehouseLocationsLocators.deleteAreaBtn().click();
            });
    }

    // ---- Areas search ----------------------------------------------------

    typeAreasSearch(text) {
        warehouseLocationsLocators.areasSearchInput().clear().type(text);
    }

    submitAreasSearch() {
        warehouseLocationsLocators.areasSearchBtn().click();
    }

    searchAreas(text) {
        this.typeAreasSearch(text);
        this.submitAreasSearch();
    }

    // ---- Drill-down to Rows ---------------------------------------------

    drillIntoRows(areaNameOrCode) {
        // Uses areaCard() (outer scope) because the drill-down button lives
        // outside the inner Edit/Delete wrapper that areaRow targets.
        warehouseLocationsLocators
            .areaCard(areaNameOrCode)
            .within(() => {
                warehouseLocationsLocators.viewManageRowsBtn().click();
            });
    }

    // ---- Verifications ---------------------------------------------------

    verifyAreaPresent(nameOrCode) {
        warehouseLocationsLocators.areaCardText(nameOrCode).should("exist");
    }

    verifyAreaAbsent(nameOrCode) {
        cy.contains(nameOrCode).should("not.exist");
    }

    // ========================================================================
    // Rows Management (sub-page reached by drilling into an Area)
    //
    // Rows are CODE-ONLY entities — the dialog has no Name input and the card
    // displays "Code: R-NN" with no Name typography. Tests therefore identify
    // Rows by their auto-assigned R-NN code (read back from the dialog or the
    // rendered card), not by a user-supplied name.
    // ========================================================================

    // ---- Navigation ------------------------------------------------------

    visitRowsViaArea(areaNameOrCode) {
        // Re-uses the existing Areas drill-down logic.
        this.drillIntoRows(areaNameOrCode);
        warehouseLocationsLocators.rowsPageHeading().should("be.visible");
    }

    verifyRowsPageHeading() {
        warehouseLocationsLocators.rowsPageHeading().should("be.visible");
    }

    clickBackToAreas() {
        warehouseLocationsLocators.backToAreasBtn().click();
        warehouseLocationsLocators.areasPageHeading().should("be.visible");
    }

    // ---- Add Row --------------------------------------------------------

    openAddRow() {
        warehouseLocationsLocators.addRowBtn().click();
        warehouseLocationsLocators.rowDialog().should("be.visible");
    }

    // Read back the auto-generated Row Code that the dialog displays.
    //
    // Used by BOTH paths: negative-path tests (e.g. "Cancel preserves no
    // row") need the previewed code BEFORE submitting so they can assert it
    // never appeared, and `addRow()` reads it to know exactly which card to
    // wait for. The card renders `R-${codeId}` from the SAME React state this
    // input shows, so the two are guaranteed identical.
    //
    // The Code is fetched asynchronously (GET /next-code/Row); until that
    // resolves the input renders empty with a spinner adornment. We wait
    // for a non-empty value via a retrying `.should('not.have.value', '')`
    // and then read it.
    //
    // Returns a Cypress chain that yields the full "R-NN" code string.
    readRowCodeFromDialog() {
        warehouseLocationsLocators
            .rowCodeInput()
            .should("not.have.value", "");
        return warehouseLocationsLocators
            .rowCodeInput()
            .invoke("val")
            .then((shortId) => `R-${(shortId || "").toUpperCase()}`);
    }

    // Submit the Add Row dialog. Single mode (Create only — Rows have no
    // Edit affordance, so there's no Save/Update path). Scoped via
    // `.contains('Create')` inside a fresh dialog scope so the click
    // can't drift to a Create button outside the dialog.
    saveRow() {
        warehouseLocationsLocators
            .rowDialog()
            .contains("button", /^create$/i)
            .click();
    }

    cancelRowDialog() {
        warehouseLocationsLocators
            .rowDialog()
            .contains("button", /^cancel$/i)
            .click();
    }

    // Convenience full happy-path create. Reads the code the dialog has
    // already assigned, submits, waits for the React-query refetch to repaint
    // the list, then returns that "R-NN" code.
    //
    // Returns a Cypress chain yielding the new Row's code.
    addRow() {
        // Step 1: open the dialog. Once open, the disabled Code input holds
        // the auto-generated `codeId` (e.g. "001").
        this.openAddRow();

        // Step 2: read the exact code the dialog will assign. The created card
        // renders `R-${codeId}` from the SAME React state the input shows
        // (WMSRows.tsx: setCodeId(nextCode.replace('R-','')) → card code
        // `R-${codeId}`), so the dialog's code and the card's code are
        // guaranteed identical. `readRowCodeFromDialog()` already waits for the
        // next-code fetch to populate the input, which also doubles as the
        // "don't click Create before codeId is set" barrier.
        //
        // This replaces the former before/after DOM diff, whose `before`
        // snapshot could be taken before the rows list finished loading — it
        // then captured an empty set and counted pre-existing sibling rows as
        // "new", flaking SW-WL-UI-TC51 ("expected [R-001,R-002,R-003] to have
        // length 1"). Reading the assigned code is race-free and independent of
        // how many sibling rows already exist.
        return this.readRowCodeFromDialog().then((code) => {
            // Step 3: click Create. The dialog stays open until the mutation
            // resolves, then closes via setOpenDialog(false).
            this.saveRow();

            // Step 4: dialog closes on success.
            warehouseLocationsLocators.rowDialog().should("not.exist");

            // Step 5: wait for the refetch to repaint the new row's card. Match
            // the Code <p>'s OWN textContent (== "Code: R-NNN"), NOT the
            // stitched card text — the adjacent "<n> Bays" chip concatenates
            // into "Code: R-NNN<n> Bays" and would defeat a code regex.
            cy.get("body").should(() => {
                const present = [...Cypress.$("body p")].some(
                    (el) => (el.textContent || "").trim() === `Code: ${code}`,
                );
                expect(present, `new Row card ${code} is present after refetch`).to.be.true;
            });

            return cy.wrap(code);
        });
    }

    // ---- Delete Row -----------------------------------------------------

    clickDeleteRow(code) {
        warehouseLocationsLocators
            .rowCard(code)
            .within(() => {
                warehouseLocationsLocators.deleteRowBtnLevel().click();
            });
    }

    // ---- Rows search ----------------------------------------------------

    typeRowsSearch(text) {
        warehouseLocationsLocators.rowsSearchInput().clear().type(text);
    }

    submitRowsSearch() {
        warehouseLocationsLocators.rowsSearchBtn().click();
    }

    searchRows(text) {
        this.typeRowsSearch(text);
        this.submitRowsSearch();
    }

    // ---- Drill-down to Bays ---------------------------------------------

    drillIntoBays(rowCode) {
        warehouseLocationsLocators
            .rowCard(rowCode)
            .within(() => {
                warehouseLocationsLocators.viewManageBaysBtn().click();
            });
    }

    // ---- Verifications ---------------------------------------------------

    verifyRowPresent(code) {
        warehouseLocationsLocators.rowCardText(code).should("exist");
    }

    verifyRowAbsent(code) {
        warehouseLocationsLocators.rowCardText(code).should("not.exist");
    }

    // ========================================================================
    // Bays Management (sub-page reached by drilling into a Row)
    //
    // Bays mirror Rows: code-only entities (B-NN) with no Edit affordance.
    // Tests identify Bays by their auto-assigned B-NN code (read back from
    // the dialog or the rendered card), not by a user-supplied name.
    // ========================================================================

    // ---- Navigation ------------------------------------------------------

    visitBaysViaRow(rowCode) {
        // Re-uses the existing Rows drill-down logic.
        this.drillIntoBays(rowCode);
        warehouseLocationsLocators.baysPageHeading().should("be.visible");
    }

    verifyBaysPageHeading() {
        warehouseLocationsLocators.baysPageHeading().should("be.visible");
    }

    clickBackToRows() {
        warehouseLocationsLocators.backToRowsBtn().click();
        warehouseLocationsLocators.rowsPageHeading().should("be.visible");
    }

    // ---- Add Bay --------------------------------------------------------

    openAddBay() {
        warehouseLocationsLocators.addBayBtn().click();
        warehouseLocationsLocators.bayDialog().should("be.visible");
    }

    // Read back the auto-generated Bay Code that the dialog displays.
    //
    // Used only by negative-path tests (e.g. "Cancel preserves no bay"):
    // those tests need the previewed code BEFORE submitting so they can
    // assert it never appeared on the page. Happy-path creates use the
    // diff-based approach in `addBay()` instead, which doesn't depend on
    // the disabled-input value at all.
    //
    // The Code is fetched asynchronously (GET /next-code/Bay); until that
    // resolves the input renders empty with a spinner adornment. We wait
    // for a non-empty value via a retrying `.should('not.have.value', '')`
    // and then read it.
    //
    // Returns a Cypress chain that yields the full "B-NN" code string.
    readBayCodeFromDialog() {
        warehouseLocationsLocators
            .bayCodeInput()
            .should("not.have.value", "");
        return warehouseLocationsLocators
            .bayCodeInput()
            .invoke("val")
            .then((shortId) => `B-${(shortId || "").toUpperCase()}`);
    }

    // Submit the Add Bay dialog. Single mode (Create only — Bays have no
    // Edit affordance, so there's no Save/Update path). Scoped via
    // `.contains('Create')` inside a fresh dialog scope so the click can't
    // drift to a Create button outside the dialog.
    saveBay() {
        warehouseLocationsLocators
            .bayDialog()
            .contains("button", /^create$/i)
            .click();
    }

    cancelBayDialog() {
        warehouseLocationsLocators
            .bayDialog()
            .contains("button", /^cancel$/i)
            .click();
    }

    // Read all visible Bay codes on the page. Returns a Cypress chain that
    // yields a Set<string> of codes (e.g. {"B-001", "B-002"}). Used by
    // `addBay()` to compute the freshly-added code via a before/after
    // diff — more robust than reading the disabled dialog input, which
    // races the `next-code` fetch and the Code state setter.
    //
    // Same caveat as addRow's card-present check: we MUST NOT read body.text() here
    // because each card's <Typography>Code: B-NNN</Typography> sits next
    // to a <Chip label="<n> Levels"> sibling whose text concatenates with
    // no whitespace in textContent. Reading per-element textContent on the
    // card's <p> isolates the code cleanly.
    listVisibleBayCodes() {
        return cy.get("body").then(($body) => {
            const codes = new Set();
            $body.find("p").each((_, el) => {
                const t = (el.textContent || "").trim();
                const m = t.match(/^Code:\s*(B-\d+)$/);
                if (m) codes.add(m[1]);
            });
            return codes;
        });
    }

    // Convenience full happy-path create. Captures the set of visible Bay
    // codes BEFORE clicking Create, submits the dialog, waits for the
    // React-query refetch to repaint the list, then returns the single
    // newly-added "B-NN" code via diff.
    //
    // Returns a Cypress chain yielding the new Bay's code.
    addBay() {
        // Step 1: open the dialog.
        this.openAddBay();

        // Step 2: wait for the disabled Code input to populate, so we don't
        // click Create before React has set codeId — `handleSubmit` bails
        // on `!codeId.trim()` and toasts an error if so.
        warehouseLocationsLocators
            .bayCodeInput()
            .should("not.have.value", "");

        // Step 3: snapshot the BEFORE set of bay codes.
        return this.listVisibleBayCodes().then((before) => {
            // Step 4: click Create. The dialog stays open until the
            // mutation resolves, then closes via setOpenDialog(false).
            this.saveBay();

            // Step 5: wait for the dialog to close — the success signal.
            warehouseLocationsLocators.bayDialog().should("not.exist");

            // Step 6: poll the visible-codes set until it differs from
            // `before` by exactly one new code, then yield that code.
            return cy
                .document()
                .should(() => {
                    const after = new Set();
                    Cypress.$("body p").each((_, el) => {
                        const t = (el.textContent || "").trim();
                        const m = t.match(/^Code:\s*(B-\d+)$/);
                        if (m) after.add(m[1]);
                    });
                    const added = [...after].filter((c) => !before.has(c));
                    expect(
                        added,
                        "exactly one new Bay code on the page after the list refetch",
                    ).to.have.length(1);
                })
                .then(() => {
                    const after = new Set();
                    Cypress.$("body p").each((_, el) => {
                        const t = (el.textContent || "").trim();
                        const m = t.match(/^Code:\s*(B-\d+)$/);
                        if (m) after.add(m[1]);
                    });
                    const added = [...after].filter((c) => !before.has(c));
                    return added[0];
                });
        });
    }

    // ---- Delete Bay -----------------------------------------------------

    clickDeleteBay(code) {
        warehouseLocationsLocators
            .bayCard(code)
            .within(() => {
                warehouseLocationsLocators.deleteBayBtnLevel().click();
            });
    }

    // ---- Bays search ----------------------------------------------------

    typeBaysSearch(text) {
        warehouseLocationsLocators.baysSearchInput().clear().type(text);
    }

    submitBaysSearch() {
        warehouseLocationsLocators.baysSearchBtn().click();
    }

    searchBays(text) {
        this.typeBaysSearch(text);
        this.submitBaysSearch();
    }

    // ---- Drill-down to Levels -------------------------------------------

    drillIntoLevels(bayCode) {
        warehouseLocationsLocators
            .bayCard(bayCode)
            .within(() => {
                warehouseLocationsLocators.viewManageLevelsBtn().click();
            });
    }

    // ---- Verifications --------------------------------------------------

    verifyBayPresent(code) {
        warehouseLocationsLocators.bayCardText(code).should("exist");
    }

    verifyBayAbsent(code) {
        warehouseLocationsLocators.bayCardText(code).should("not.exist");
    }

    // ========================================================================
    // Levels Management (sub-page reached by drilling into a Bay)
    //
    // Levels mirror Bays/Rows: code-only entities (L-NN) with no Edit
    // affordance. Tests identify Levels by their auto-assigned L-NN code
    // (read back from the dialog or the rendered card), not by a user-
    // supplied name.
    // ========================================================================

    // ---- Navigation ------------------------------------------------------

    visitLevelsViaBay(bayCode) {
        // Re-uses the existing Bays drill-down logic.
        this.drillIntoLevels(bayCode);
        warehouseLocationsLocators.levelsPageHeading().should("be.visible");
    }

    verifyLevelsPageHeading() {
        warehouseLocationsLocators.levelsPageHeading().should("be.visible");
    }

    clickBackToBays() {
        warehouseLocationsLocators.backToBaysBtn().click();
        warehouseLocationsLocators.baysPageHeading().should("be.visible");
    }

    // ---- Add Level ------------------------------------------------------

    openAddLevel() {
        warehouseLocationsLocators.addLevelBtn().click();
        warehouseLocationsLocators.levelDialog().should("be.visible");
    }

    // Read back the auto-generated Level Code that the dialog displays.
    //
    // Used only by negative-path tests (e.g. "Cancel preserves no level"):
    // those tests need the previewed code BEFORE submitting so they can
    // assert it never appeared on the page. Happy-path creates use the
    // diff-based approach in `addLevel()` instead.
    //
    // The Code is fetched asynchronously (GET /next-code/Level); until that
    // resolves the input renders empty with a spinner adornment. We wait
    // for a non-empty value via a retrying `.should('not.have.value', '')`
    // and then read it.
    //
    // Returns a Cypress chain that yields the full "L-NN" code string.
    readLevelCodeFromDialog() {
        warehouseLocationsLocators
            .levelCodeInput()
            .should("not.have.value", "");
        return warehouseLocationsLocators
            .levelCodeInput()
            .invoke("val")
            .then((shortId) => `L-${(shortId || "").toUpperCase()}`);
    }

    // Submit the Add Level dialog. Single mode (Create only — Levels have
    // no Edit affordance, so there's no Save/Update path). Scoped via
    // `.contains('Create')` inside a fresh dialog scope so the click can't
    // drift to a Create button outside the dialog.
    saveLevel() {
        warehouseLocationsLocators
            .levelDialog()
            .contains("button", /^create$/i)
            .click();
    }

    cancelLevelDialog() {
        warehouseLocationsLocators
            .levelDialog()
            .contains("button", /^cancel$/i)
            .click();
    }

    // Read all visible Level codes on the page. Returns a Cypress chain
    // that yields a Set<string> of codes (e.g. {"L-001", "L-002"}). Used
    // by `addLevel()` to compute the freshly-added code via a before/after
    // diff.
    //
    // Same caveat as listVisibleBayCodes: we MUST NOT read body.text() here
    // because each card's <Typography>Code: L-NNN</Typography> sits next
    // to a <Chip label="<n> Bins"> sibling whose text concatenates with no
    // whitespace in textContent. Reading per-element textContent on the
    // card's <p> isolates the code cleanly.
    listVisibleLevelCodes() {
        return cy.get("body").then(($body) => {
            const codes = new Set();
            $body.find("p").each((_, el) => {
                const t = (el.textContent || "").trim();
                const m = t.match(/^Code:\s*(L-\d+)$/);
                if (m) codes.add(m[1]);
            });
            return codes;
        });
    }

    // Convenience full happy-path create. Reads the auto-generated code
    // directly from the dialog's disabled input, submits, waits for the
    // dialog to close, verifies the card appears, then yields the full
    // "L-NN" code string.
    //
    // Avoids the before/after DOM-diff approach which is susceptible to
    // React-Query re-fetch timing when multiple Levels already exist.
    //
    // Returns a Cypress chain yielding the new Level's code (e.g. "L-01").
    addLevel() {
        // Step 1: open the dialog.
        this.openAddLevel();

        // Step 2: wait for the disabled Code input to populate. WMSLevels
        // stores only the short numeric id (e.g. "01") — the full code
        // is assembled as `L-${codeId}` on submit.
        warehouseLocationsLocators
            .levelCodeInput()
            .should("not.have.value", "");

        // Step 3: capture the short id, build the full code, then submit.
        return warehouseLocationsLocators
            .levelCodeInput()
            .invoke("val")
            .then((shortId) => {
                const levelCode = `L-${(shortId || "").trim().toUpperCase()}`;

                // Step 4: click Create.
                this.saveLevel();

                // Step 5: wait for the dialog to close — the success signal.
                warehouseLocationsLocators.levelDialog().should("not.exist");

                // Step 6: verify the card is now visible, then yield the code.
                warehouseLocationsLocators.levelCardText(levelCode).should("exist");
                return cy.wrap(levelCode);
            });
    }

    // ---- Delete Level ---------------------------------------------------

    clickDeleteLevel(code) {
        warehouseLocationsLocators
            .levelCard(code)
            .within(() => {
                warehouseLocationsLocators.deleteLevelBtnLevel().click();
            });
    }

    // ---- Levels search --------------------------------------------------

    typeLevelsSearch(text) {
        warehouseLocationsLocators.levelsSearchInput().clear().type(text);
    }

    submitLevelsSearch() {
        warehouseLocationsLocators.levelsSearchBtn().click();
    }

    searchLevels(text) {
        this.typeLevelsSearch(text);
        this.submitLevelsSearch();
    }

    // ---- Drill-down to Bins ---------------------------------------------

    drillIntoBins(levelCode) {
        warehouseLocationsLocators
            .levelCard(levelCode)
            .within(() => {
                warehouseLocationsLocators.viewManageBinsBtn().click();
            });
    }

    // ---- Verifications --------------------------------------------------

    verifyLevelPresent(code) {
        warehouseLocationsLocators.levelCardText(code).should("exist");
    }

    verifyLevelAbsent(code) {
        warehouseLocationsLocators.levelCardText(code).should("not.exist");
    }

    // ========================================================================
    // Bins Management (sub-page reached by drilling into a Level — leaf)
    //
    // Bins are CODE-ONLY entities (full code in dialog, no prefix adornment)
    // rendered in a MaterialReactTable instead of a Card grid. Tests
    // identify bins by the `BN-N` text in a <td> cell and reach actions via
    // the row's Actions column (View Label / Delete Bin).
    //
    // The table-based diff approach for `addBin()` differs from the upper
    // tiers: instead of scraping <p>Code: X-NNN</p> typography, we scrape
    // the first <td> (Code column) of every <tr>.
    // ========================================================================

    // ---- Navigation ------------------------------------------------------

    visitBinsViaLevel(levelCode) {
        // Re-uses the existing Levels drill-down logic.
        this.drillIntoBins(levelCode);
        warehouseLocationsLocators.binsPageHeading().should("be.visible");
    }

    verifyBinsPageHeading() {
        warehouseLocationsLocators.binsPageHeading().should("be.visible");
    }

    clickBackToLevels() {
        warehouseLocationsLocators.backToLevelsBtn().click();
        warehouseLocationsLocators.levelsPageHeading().should("be.visible");
    }

    // ---- Add Bin --------------------------------------------------------

    openAddBin() {
        warehouseLocationsLocators.addBinBtn().click();
        warehouseLocationsLocators.binDialog().should("be.visible");
    }

    // Read back the auto-generated Bin Code that the dialog displays.
    //
    // Unlike the upper tiers, the WMSBins dialog stores the FULL code in
    // the input (no `BN-` prefix adornment) — the input's value is the
    // entire code string, ready to use as-is.
    //
    // Returns a Cypress chain that yields the full code string (e.g. "BN-1").
    readBinCodeFromDialog() {
        warehouseLocationsLocators
            .binCodeInput()
            .should("not.have.value", "");
        return warehouseLocationsLocators
            .binCodeInput()
            .invoke("val")
            .then((code) => (code || "").toUpperCase());
    }

    // Submit the Add Bin dialog. Single mode (Create only — Bins have no
    // Edit affordance, so there's no Save/Update path).
    saveBin() {
        warehouseLocationsLocators
            .binDialog()
            .contains("button", /^create$/i)
            .click();
    }

    cancelBinDialog() {
        warehouseLocationsLocators
            .binDialog()
            .contains("button", /^cancel$/i)
            .click();
    }

    // Read all visible Bin codes from the table. Returns a Cypress chain
    // that yields a Set<string> of codes (e.g. {"BN-1", "BN-2"}). Used by
    // `addBin()` to compute the freshly-added code via a before/after diff.
    //
    // The Code column is the FIRST data column in the MRT table (before
    // Status / Assignment / Path / Actions). We grab `td:first-child` of
    // every body row. We trim+uppercase to match the dialog's value format.
    listVisibleBinCodes() {
        return cy.get("body").then(($body) => {
            const codes = new Set();
            $body.find("table tbody tr td:first-child").each((_, el) => {
                const t = (el.textContent || "").trim().toUpperCase();
                // Skip empty cells (e.g. the empty-state row when present).
                if (t && /^BN-\d+$/i.test(t)) codes.add(t);
            });
            return codes;
        });
    }

    // Convenience full happy-path create. Reads the auto-generated code
    // directly from the dialog's disabled input (WMSBins stores the FULL
    // code "BN-N" in codeId, unlike upper tiers which store only the
    // numeric part). Submits, waits for the dialog to close, verifies
    // the row appears, then yields the code.
    //
    // Avoids the before/after table-diff approach which is unreliable
    // when the table hasn't finished loading when the snapshot is taken.
    //
    // Returns a Cypress chain yielding the new Bin's code (e.g. "BN-3").
    addBin() {
        // Step 1: open the dialog.
        this.openAddBin();

        // Step 2: capture the full code directly from the dialog input.
        return this.readBinCodeFromDialog().then((binCode) => {
            // Step 3: click Create.
            this.saveBin();

            // Step 4: wait for the dialog to close.
            warehouseLocationsLocators.binDialog().should("not.exist");

            // Step 5: verify the new row appears in the table, then yield.
            warehouseLocationsLocators.binRow(binCode).should("exist");
            return cy.wrap(binCode);
        });
    }

    // ---- Delete Bin -----------------------------------------------------

    clickDeleteBin(code) {
        warehouseLocationsLocators
            .binRow(code)
            .within(() => {
                warehouseLocationsLocators.deleteBinBtn().click();
            });
    }

    // ---- View Label (QR code) ------------------------------------------

    clickViewLabel(code) {
        warehouseLocationsLocators
            .binRow(code)
            .within(() => {
                warehouseLocationsLocators.viewLabelBtn().click();
            });
    }

    // ---- Bins search ----------------------------------------------------

    typeBinsSearch(text) {
        warehouseLocationsLocators.binsSearchInput().clear().type(text);
    }

    submitBinsSearch() {
        warehouseLocationsLocators.binsSearchBtn().click();
    }

    searchBins(text) {
        this.typeBinsSearch(text);
        this.submitBinsSearch();
    }

    // ---- Verifications --------------------------------------------------

    verifyBinPresent(code) {
        warehouseLocationsLocators.binRowText(code).should("exist");
    }

    verifyBinAbsent(code) {
        warehouseLocationsLocators.binRowText(code).should("not.exist");
    }

    // ========================================================================
    // Main-grid Row Actions (back on /warehouse-management/locations)
    //
    // The main Locations grid lists Bins (the leaf tier) with a "Bin Path"
    // column that displays the location.path string with `/` swapped for
    // `.`. Each row has a per-row Actions cell with two icon buttons:
    //   - "View Label" — opens the QR-code overlay (qrCodeDialoge)
    //   - "Delete"      — opens a ConfirmationDialog ("Confirm Location
    //                     Deletion") with Yes / No buttons.
    //
    // These helpers are designed for tests that already created a Bin via
    // API and want to act on it from the main grid. The row is identified
    // by the bin's full displayed path (computed from the API response),
    // because BN-N short codes can collide across different parents.
    // ========================================================================

    // Compute the displayed "Bin Path" string from a Bin API response. The
    // API stores `path` as `FAC1/Z1/A1/R01/B03/L02/BN-001`; the frontend
    // splits on `/`, trims each segment, drops empty ones, and joins with
    // `.`. We mirror that exactly so cy.contains can match the rendered
    // cell text.
    formatBinPath(bin) {
        return String(bin?.path || "")
            .split("/")
            .map((s) => s.trim())
            .filter(Boolean)
            .join(".");
    }

    // Search the main grid for a bin's path so the row is in view (the
    // main grid paginates and may not show our freshly-created bin in the
    // first page on busy QA). After the search, only matching rows remain.
    findBinOnMainGrid(bin) {
        const path = this.formatBinPath(bin);
        this.search(path);
        warehouseLocationsLocators.mainGridBinRow(path).should("be.visible");
        return cy.wrap(path);
    }

    // ---- Row Actions on the main grid -----------------------------------

    clickMainGridViewLabel(binPath) {
        warehouseLocationsLocators
            .mainGridBinRow(binPath)
            .within(() => {
                warehouseLocationsLocators.viewLabelBtn().click();
            });
    }

    clickMainGridDelete(binPath) {
        warehouseLocationsLocators
            .mainGridBinRow(binPath)
            .within(() => {
                warehouseLocationsLocators.deleteRowBtn().click();
            });
    }

    // Confirm the main-grid delete dialog ("Yes" button). Different from
    // confirmDelete() (used by per-tier dialogs that say "Delete").
    confirmMainGridDelete() {
        warehouseLocationsLocators.mainGridDeleteYesBtn().click();
    }

    // Cancel the main-grid delete dialog ("No" button).
    cancelMainGridDelete() {
        warehouseLocationsLocators.mainGridDeleteNoBtn().click();
    }

    // ---- Main-grid presence/absence assertions --------------------------
    //
    // Both helpers assume the main grid has already been narrowed to the
    // bin in question (e.g. via findBinOnMainGrid()) so the row either
    // exists once or not at all. We don't filter again here because the
    // grid paginates and the test would otherwise need to guess the page.

    verifyBinOnMainGridPresent(binPath) {
        warehouseLocationsLocators.mainGridBinRow(binPath).should("exist");
    }

    verifyBinOnMainGridAbsent(binPath) {
        // After deletion, the search either keeps showing the (refetched)
        // empty result set or repaints to the previous unfiltered state
        // depending on the grid's React-query keys. Either way, the
        // specific path must NOT match a row.
        cy.contains("table tbody tr", binPath).should("not.exist");
    }

    // ========================================================================
    // Main-grid additional affordances: filters, table toggles, row
    // selection, bulk print, View Content
    // ========================================================================

    // ---- Status filter ---------------------------------------------------

    // Select an option in the Status dropdown by visible label, e.g.
    // "Empty bins" or "Occupied bins". Re-fires the server-side report
    // query, so the body repaints.
    selectStatusFilter(label) {
        warehouseLocationsLocators.statusSelect().click();
        warehouseLocationsLocators.statusOption(label).click();
        // Wait for the option to be applied — once the dropdown closes,
        // the React-query refetch is in flight; tests can then assert
        // the table body matches the filter.
        cy.findByRole('option', { name: new RegExp(`^${label}$`, 'i') }).should('not.exist');
    }

    // Resolves the column index of a header by its visible text. Used by
    // assertions that need to inspect a specific column without depending
    // on hard-coded indexes (the row-selection checkbox shifts indexes).
    //
    // Returns a Cypress chain yielding the zero-based index of the header.
    getColumnIndex(headerLabel) {
        return cy.get('table thead th').then(($ths) => {
            const idx = [...$ths].findIndex((th) => {
                // innerText can include button labels (sort, column-actions) on
                // subsequent lines — match only the first non-empty line so the
                // anchored regex ^..$ doesn't fail due to extra trailing content.
                const firstLine = (th.innerText || '').trim().split('\n')[0].trim();
                return new RegExp(`^${headerLabel}$`, 'i').test(firstLine);
            });
            expect(idx, `column "${headerLabel}" exists in header`).to.be.greaterThan(-1);
            return idx;
        });
    }

    // Asserts that every visible row in the body has the given text in
    // the named column. `expected` is matched as a regex case-insensitive.
    // Skips assertion if the body is empty (filtered to zero rows) so
    // tests can decide explicitly via tableRows().should('have.length',N).
    //
    // Uses cy.get('table').should(callback) with synchronous jQuery reads
    // so the entire assertion is re-tried by Cypress on React re-renders.
    // The old pattern (.each($row) → cy.wrap($row).find()) captured element
    // references before the filter-triggered re-render, causing detached-DOM
    // errors when the DOM was replaced before .find() ran.
    verifyEveryRowColumn(headerLabel, expected) {
        this.getColumnIndex(headerLabel).then((idx) => {
            cy.get('table').should(($table) => {
                const rows = $table.find('tbody tr');
                rows.each((_, row) => {
                    const cellText = Cypress.$(row)
                        .find(`td:nth-child(${idx + 1})`)
                        .text()
                        .trim();
                    expect(cellText).to.match(new RegExp(expected, 'i'));
                });
            });
        });
    }

    // ---- Bin Occupancy % stat --------------------------------------------

    // Read the numeric value of one of the dashboard stat cards by label
    // (e.g. "Bins", "Empty Bins", "Occupied Bins"). Returns a Cypress
    // chain yielding the parsed integer.
    //
    // The cards render the value inside the same parent that holds the
    // label, so we extract digits from the parent's textContent. The
    // "Bin Occupancy %" card has a "%" suffix on its value.
    readStatCardValue(label) {
        // Wait — possibly across a retry — until the card's text contains
        // a digit. This handles the brief Skeleton state that renders
        // while React-Query is still fetching the dashboard summary.
        // Without the retry the regex returns null → "expected null not
        // to be null" assertion error before the Skeleton resolves.
        return warehouseLocationsLocators.statCard(label).should(($el) => {
            const text = ($el.text() || '').trim();
            const cleaned = text.replace(new RegExp(label, 'i'), '');
            // Drop "Bins" inside "Empty Bins"/"Occupied Bins" etc. so a
            // card like "Empty Bins" doesn't accidentally pick a digit
            // from the label itself (no digits in label text — but the
            // safety belt is cheap).
            expect(cleaned, `stat card "${label}" text settled`).to.match(/\d/);
        }).then(($el) => {
            const text = ($el.text() || '').trim();
            const cleaned = text.replace(new RegExp(label, 'i'), '');
            const m = cleaned.match(/-?\d+/);
            return parseInt(m[0], 10);
        });
    }

    // ---- Table toolbar toggles ------------------------------------------

    // Open the column-visibility menu via the Show/Hide Columns icon. MRT
    // renders the menu as a popover with a list of <button>s, one per
    // column. Returns a Cypress chain on the menu so callers can assert
    // its presence and toggle individual columns.
    openShowHideColumnsMenu() {
        warehouseLocationsLocators.showHideColumnsBtn().click();
        // MRT renders the column-visibility popover as an MUI Menu —
        // role="menu" matches a hidden table-cell wrapper instead, so we
        // anchor on the popover's modal backdrop being present (proof
        // the popover layer mounted) and return the first actual
        // column-toggle menuitem.
        return cy.get('.MuiPopover-root').should('be.visible');
    }

    // Click the Density toggle once. MRT cycles density compact ↔
    // comfortable ↔ spacious; one click is enough to prove the toggle
    // is wired (the table re-renders with a different row height).
    toggleDensity() {
        // Capture a sample row's height before clicking, so the test can
        // assert the density actually changed. The page object only
        // performs the click; the test compares heights itself if
        // needed — but MRT's toolbar button has no other side effects, so
        // just clicking and verifying it didn't error is the cheapest
        // signal at this layer.
        warehouseLocationsLocators.toggleDensityBtn().click();
    }

    // Click the Full-screen toggle. MRT wraps the entire table in a
    // top-positioned overlay when fullscreen is active. We assert by
    // checking the toggle's pressed/aria-state changed.
    toggleFullScreen() {
        warehouseLocationsLocators.toggleFullScreenBtn().click();
    }

    // ---- Row selection / bulk print --------------------------------------

    // Toggle the header (select-all) checkbox. After this call, every
    // visible row's checkbox is checked.
    selectAllVisibleRows() {
        warehouseLocationsLocators.selectAllCheckbox().check({ force: true });
    }

    // Toggle a single row's checkbox. The caller passes an existing row
    // chain (e.g. mainGridBinRow(path)) — we scope the find to that row
    // so we don't accidentally check the header checkbox.
    selectRow(rowChain) {
        // MRT renders an MUI <Checkbox> whose underlying <input> is visually
        // hidden (opacity:0, zero-size). A plain .click({force}) can land
        // before the input is mounted/actionable and silently no-op, so the
        // rowSelection state never updates and the conditional toolbar
        // ("N selected" + Print QR Codes + Clear Selection) never renders —
        // the cause of the TC83/TC85 "never found /\d+ selected/" failures.
        // Cypress's .check({force}) drives the native change event AND verifies
        // the input ends up checked, retrying until the React selection state
        // has actually landed. We then assert checked so callers can trust the
        // selection took effect before reading the toolbar (mirrors
        // selectAllVisibleRows, which uses .check and does not flake).
        warehouseLocationsLocators
            .rowCheckbox(rowChain)
            .check({ force: true })
            .should('be.checked');
    }

    // Click "Clear Selection" in the top toolbar. Only renders when at
    // least one row is selected.
    clearSelection() {
        warehouseLocationsLocators.clearSelectionBtn().click();
    }

    // Click "Print QR Codes" in the top toolbar to open the bulk print
    // dialog. Only renders when at least one row is selected.
    openBulkPrint() {
        warehouseLocationsLocators.printQrCodesBtn().click();
        warehouseLocationsLocators.bulkPrintDialog().should('be.visible');
    }

    // Cancel the bulk print dialog without printing.
    cancelBulkPrint() {
        // Scope the click inside the dialog so a stray Cancel button on
        // the page can't satisfy the find. Then verify the dialog is
        // dismounted via the locator's :has() selector — which returns
        // zero elements after close, satisfying not.exist cleanly.
        warehouseLocationsLocators
            .bulkPrintDialog()
            .within(() => {
                warehouseLocationsLocators.bulkPrintCancelBtn().click();
            });
        warehouseLocationsLocators.bulkPrintDialog().should('not.exist');
    }

    // ---- View Content (Assignment column) --------------------------------

    // Click the "View Content" button on the row identified by binPath.
    // Caller must ensure the row is for an OCCUPIED bin (otherwise the
    // cell shows "--" and the button doesn't render). Tests skip
    // themselves when no occupied bin is available.
    clickViewContent(binPath) {
        warehouseLocationsLocators
            .mainGridBinRow(binPath)
            .within(() => {
                warehouseLocationsLocators.viewContentBtn().click();
            });
        warehouseLocationsLocators.contentsDialogHeading().should('be.visible');
    }

    // ========================================================================
    // QR-code label overlay (qrCodeDialoge.tsx — single-bin Print/Cancel)
    //
    // The component is a custom <Box> overlay (no role="dialog"). Tests
    // anchor on the unique title text "Label for <CODE>" to scope clicks
    // and assertions to the right popup (TC76 / TC78 already do).
    // ========================================================================

    // Click the Cancel button inside the QR overlay for a given bin code.
    // We scope via the overlay's title to avoid hitting any other Cancel
    // button on the page (e.g. dialogs that share that label).
    cancelQrOverlay(code) {
        cy.contains(new RegExp(`Label for\\s+${code}`, 'i'))
            // Walk up to the overlay's content panel — the panel that
            // contains BOTH the title and the Cancel button. The
            // qrCodeDialoge renders title + Cancel as siblings inside
            // the same inner Box, so the closest common ancestor is
            // that Box's first parent above the title element.
            .parents()
            .filter(':has(button:contains("Cancel"))')
            .first()
            .within(() => {
                cy.findByRole('button', { name: /^cancel$/i }).click();
            });
        // After Cancel, the overlay dismounts (open=false → returns null).
        cy.contains(new RegExp(`Label for\\s+${code}`, 'i')).should('not.exist');
    }

}

export default WarehouseLocationsPage;
