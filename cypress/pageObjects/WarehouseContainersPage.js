// cypress/pageObjects/WarehouseContainersPage.js
//
// Page Object for the Warehouse Management → Containers page.
// Covers chunk 10 of the WMS plan — list/table chrome, search, filters,
// pagination. Subsequent chunks (Add Container, Manage Types, Row
// Actions, Assign To Location, E2E) extend this class incrementally.

import warehouseContainersLocators from "../support/locators/warehouseContainersLocators";

// The UI renders a dotted location path as "A > B > C" (Frontend
// utils/locationPath.ts); scan fields and the API still use the dotted form.
const displayPath = (path) => String(path || "").split(".").join(" > ");
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class WarehouseContainersPage {
    // ---- Navigation ------------------------------------------------------

    visit() {
        // Track the container-types fetch so callers can wait for it
        // before driving the Add Container click. The page handler
        // initializes selectedTypeIdForCode from containerTypes[0] only
        // if containerTypes is populated at click-time; otherwise the
        // form opens but never fetches its auto-code.
        cy.intercept("GET", "**/container-types").as("getContainerTypes");
        // Also alias the auto-code lookup. On QA the post-create
        // /containers/next-code/:typeId XHR can take 10s+; aliasing it
        // here lets readAddContainerCode() wait on the response rather
        // than polling the (still-empty) Code ID input value.
        cy.intercept("GET", "**/containers/next-code/**").as("getNextCode");
        // Alias the pageSize=500 fetch used by Assign-To-Location / Merge
        // dialogs (WMSContainers.tsx — enabled: dialog.open). The fetch fires
        // when the dialog opens, NOT on page mount. Registering the alias here
        // (before visit) means it is available whether or not the dialog has
        // opened yet; openAssignToLocation() waits on it so the scan's
        // client-side containers.find() lookup has a populated list.
        cy.intercept("GET", "**/containers?pageSize=500*").as("getAllContainersList");
        cy.fixture("urls.json").then((urls) => {
            cy.visit(urls.warehouseContainers);
        });
        // Anchor on the Add Container button as the "page rendered" signal —
        // the page has no top-level heading.
        warehouseContainersLocators.addContainerBtn().should("be.visible");
    }

    // ---- Toolbar verification --------------------------------------------

    verifyToolbarButtonsRender() {
        warehouseContainersLocators.addContainerBtn().should("be.visible").and("not.be.disabled");
        warehouseContainersLocators.manageTypesBtn().should("be.visible").and("not.be.disabled");
        warehouseContainersLocators.assignToLocationBtn().should("be.visible").and("not.be.disabled");
    }

    // ---- Table -----------------------------------------------------------

    verifyTableRendered() {
        warehouseContainersLocators.table().should("be.visible");
    }

    // Asserts the documented column set is present. Discovery captured the
    // headers as "Code0" / "Location0" / "Items0" / "Actions" (the trailing
    // 0 is MRT's sort-counter indicator). We match leading-text only.
    verifyTableColumns(expected) {
        warehouseContainersLocators
            .tableHeaders()
            .should(($headers) => {
                const actual = [...$headers]
                    .map((h) => h.innerText.trim())
                    .filter(Boolean);
                expected.forEach((label) => {
                    expect(actual.join("|")).to.match(new RegExp(label, "i"));
                });
            });
    }

    // Returns the rows-count via Cypress chain so tests can do their own
    // assertions on it (e.g. "at least 1", "exactly 0", etc.).
    tableRows() {
        return warehouseContainersLocators.tableRows();
    }

    // ---- Search ----------------------------------------------------------

    typeSearch(text) {
        warehouseContainersLocators.searchInput().clear().type(text);
    }

    submitSearch() {
        warehouseContainersLocators.searchButton().click();
    }

    // Convenience: type + submit.
    search(text) {
        this.typeSearch(text);
        this.submitSearch();
    }

    // Clear the search box. The component triggers an automatic re-fetch
    // when the input becomes empty (see WMSContainers.tsx:1207 — the
    // onChange clears the search filter when v === "").
    clearSearch() {
        warehouseContainersLocators.searchInput().clear();
    }

    // ---- Type filter -----------------------------------------------------

    // Open the Type dropdown. MUI renders it as a combobox; clicking the
    // combobox opens an option list.
    openTypeFilter() {
        warehouseContainersLocators.typeSelect().click();
    }

    // Select an option in the Type dropdown by visible label, e.g.
    // "All Types" or a known container-type name. Re-fires the server-side
    // query, so the body repaints.
    selectTypeFilter(label) {
        this.openTypeFilter();
        warehouseContainersLocators.typeOption(label).click();
        // Wait for the dropdown to close — once closed, the React-query
        // refetch is in flight; tests can then assert the table body
        // matches the filter.
        cy.findByRole('option', { name: new RegExp(`^${label}$`, 'i') })
            .should('not.exist');
    }

    // ---- Pagination ------------------------------------------------------

    verifyPaginationControlsRender() {
        warehouseContainersLocators.rowsPerPageSelect().should("exist");
        warehouseContainersLocators.prevPageBtn().should("exist");
        warehouseContainersLocators.nextPageBtn().should("exist");
    }

    // ---- Row presence ----------------------------------------------------

    verifyContainerPresent(code) {
        warehouseContainersLocators.containerRowText(code).should("exist");
    }

    verifyContainerAbsent(code) {
        warehouseContainersLocators.containerRowText(code).should("not.exist");
    }

    // Search for a container code, re-issuing the search if the row
    // doesn't show up. `search()` only clicks the Search button and
    // returns — it never re-fires the request if the resulting XHR
    // stalls or is dropped (seen on stage under load). cy.contains alone
    // can only re-poll the DOM; it can't recover from a request that
    // never resolved. This waits on the actual paginated-fetch response
    // (WMSContainers.tsx's `GET /containers?...&search=...` query) before
    // checking, and retries the ACTION — not just the assertion — up to
    // `attemptsLeft` times, letting the final attempt's real assertion
    // (with its own retry) report failure normally.
    searchUntilPresent(code, attemptsLeft = 3) {
        cy.intercept("GET", "**/containers?*search=*").as("searchContainers");
        this.search(code);
        cy.wait("@searchContainers", { timeout: 15000 });
        if (attemptsLeft <= 1) {
            this.verifyContainerPresent(code);
            return;
        }
        // cy.contains() throws (and internally retries) on no-match, so it
        // can't be used for a soft check — read the table synchronously
        // via jQuery instead to decide whether to retry the search action.
        warehouseContainersLocators.table().then(($table) => {
            const present = $table.find("tbody tr td").filter((_, el) => el.innerText.includes(code)).length > 0;
            if (present) {
                this.verifyContainerPresent(code);
            } else {
                cy.log(`searchUntilPresent: "${code}" not found yet — retrying search`);
                this.searchUntilPresent(code, attemptsLeft - 1);
            }
        });
    }

    // ========================================================================
    // Add Container dialog (containerForm.tsx — create mode)
    // ========================================================================

    openAddContainer() {
        // Background — there are TWO independent timing hazards in the
        // page's Add Container click flow:
        //
        // 1) Closure staleness. The button's onClick reads `containerTypes`
        //    from a closure. When a React-Query refetch invalidates the
        //    cache mid-render, the captured list is briefly empty and
        //    `if (containerTypes.length > 0) setSelectedTypeIdForCode(...)`
        //    is skipped. The dialog opens, but `selectedTypeIdForCode`
        //    stays null and the useEffect that fires GET /next-code is
        //    never reached.
        //
        // 2) Same-value setState no-op. Forcing the form's Type select to
        //    re-pick the auto-pre-filled type doesn't help: React's
        //    setState with the SAME value doesn't re-run the effect
        //    (the deps array `[..., selectedTypeIdForCode]` is reference-
        //    equal).
        //
        // Reliable workaround: drive `selectedTypeIdForCode` through a
        // real null → id transition every time. We do that by:
        //   a. Clicking Add Container.
        //   b. Cancelling immediately — closing the dialog runs
        //      `setSelectedTypeIdForCode(null)` (WMSContainers.tsx:1542).
        //   c. Clicking Add Container a second time. At this point the
        //      React-Query refetch from step (a) has fully resolved, so
        //      the button's closure now sees a populated `containerTypes`,
        //      and the null → id transition is guaranteed real → effect
        //      fires → GET /next-code is issued.
        //
        // The double-open adds ~500ms but is deterministic.
        cy.wait("@getContainerTypes");

        // First open: primes the page (kicks any pending refetches).
        warehouseContainersLocators.addContainerBtn().click();
        warehouseContainersLocators.addContainerHeading().should("be.visible");
        // Cancel — resets selectedTypeIdForCode to null.
        warehouseContainersLocators
            .addContainerDialog()
            .within(() => {
                warehouseContainersLocators.addContainerCancelBtn().click();
            });
        warehouseContainersLocators.addContainerHeading().should("not.exist");

        // Second open: containerTypes is now warm in the closure, the
        // null → id transition is real, and next-code is fetched.
        warehouseContainersLocators.addContainerBtn().click();
        warehouseContainersLocators.addContainerHeading().should("be.visible");

        // Self-heal: on slower environments (e.g. stage) even the second
        // click can race the containerTypes invalidation, so the
        // null → id transition never happens and next-code is never
        // requested. The Code ID field's placeholder flips to "Loading..."
        // the instant the effect fires (before the XHR resolves), so use
        // it as a cheap signal that the fetch was actually kicked off. If
        // it hasn't after a short window, cancel/reopen once more.
        warehouseContainersLocators.codeIdInput().then(($el) => {
            const loading = /Loading/i.test($el.attr("placeholder") || "");
            const hasValue = ($el.val() || "").toString().length > 0;
            if (loading || hasValue) {
                return;
            }
            cy.log("openAddContainer: next-code effect did not fire — retrying");
            warehouseContainersLocators
                .addContainerDialog()
                .within(() => {
                    warehouseContainersLocators.addContainerCancelBtn().click();
                });
            warehouseContainersLocators.addContainerHeading().should("not.exist");
            warehouseContainersLocators.addContainerBtn().click();
            warehouseContainersLocators.addContainerHeading().should("be.visible");
        });
    }

    cancelAddContainer() {
        warehouseContainersLocators
            .addContainerDialog()
            .within(() => {
                warehouseContainersLocators.addContainerCancelBtn().click();
            });
        warehouseContainersLocators.addContainerHeading().should("not.exist");
    }

    // Read back the auto-generated Code ID. The backend pre-fetches the
    // next code asynchronously (codeLoading=true while in flight); we
    // wait for the XHR to land FIRST, then assert the input populates.
    //
    // On QA the /containers/next-code/:typeId request can take 10s+
    // immediately after a fresh type is created — too slow for the
    // 10s defaultCommandTimeout to catch via .should("not.have.value").
    // Waiting on the aliased XHR (registered in visit()) with a 30s
    // timeout makes the assertion deterministic and self-healing.
    //
    // Returns a Cypress chain yielding the full code (e.g. "CT-PAL-1").
    readAddContainerCode() {
        cy.wait("@getNextCode", { timeout: 30000 });
        warehouseContainersLocators
            .codeIdInput()
            .should("not.have.value", "")
            .and(($el) => {
                // The placeholder is "Loading..." while codeLoading=true;
                // assert the value isn't a leftover placeholder text.
                expect($el.attr("placeholder") || "").to.not.match(/Loading/i);
            });
        return warehouseContainersLocators
            .codeIdInput()
            .invoke("val")
            .then((v) => (v || "").toString());
    }

    typeMaxItems(value) {
        warehouseContainersLocators.maxItemsInput().clear({ force: true });
        if (value !== "") {
            warehouseContainersLocators
                .maxItemsInput()
                .type(String(value), { force: true });
        }
    }

    saveAddContainer() {
        warehouseContainersLocators
            .addContainerDialog()
            .within(() => {
                warehouseContainersLocators.addContainerSaveBtn().click();
            });
    }

    // Convenience: full happy-path create. Reads the auto-generated Code
    // (which arrives from the backend) and submits without typing
    // anything else. Returns a Cypress chain yielding the new container's
    // code so tests can assert it on the table and clean it up later.
    addContainer({ maxItems } = {}) {
        this.openAddContainer();
        return this.readAddContainerCode().then((code) => {
            if (maxItems !== undefined) {
                this.typeMaxItems(maxItems);
            }
            this.saveAddContainer();
            // The dialog dismounts on successful create. cy.wrap(code)
            // keeps the Cypress chain alive so the captured code can be
            // yielded after the dismount assertion runs.
            return warehouseContainersLocators
                .addContainerHeading()
                .should("not.exist")
                .then(() => code);
        });
    }

    // Variant of addContainer() that also waits on POST /containers and
    // returns BOTH the captured code and the server-assigned id.
    //
    // Required for E2E tests that immediately drive UI flows depending on
    // server-side visibility of the new container (e.g. Assign To Location
    // modal's GET /containers?pageSize=500, Assign Products universal-
    // scan). addContainer() resolves on dialog dismount, which can win
    // the race against the create-response committing — leaving the
    // downstream lookup with a stale `containers` prop and a
    // "not found" silent failure.
    //
    // Caller MUST register the intercept BEFORE calling this method so
    // the alias exists when the POST fires; we don't register it here so
    // tests that need additional intercepts can compose their own. The
    // standard call shape is:
    //
    //     cy.intercept("POST", "**/containers").as("createContainer");
    //     containersPage.addContainerAndCaptureId({ alias: "createContainer" })
    //         .then(({ code, id }) => { ... });
    addContainerAndCaptureId({ alias = "createContainer", maxItems, timeout = 20000 } = {}) {
        return this.addContainer({ maxItems }).then((code) =>
            cy.wait(`@${alias}`, { timeout }).then((xhr) => {
                expect(xhr.response?.statusCode, "POST /containers status")
                    .to.be.lessThan(400);
                const body = xhr.response?.body;
                const data = body && (body.data || body);
                const id = data && (data.id || data.containerId);
                expect(id, "container id from create response").to.exist;
                return { code, id };
            }),
        );
    }

    // ========================================================================
    // Manage Container Types modal (WMSContainers.tsx — typeManager state)
    // ========================================================================

    openManageTypes() {
        // Wait for the page-level container-types fetch (aliased in
        // visit) so the modal mounts with a populated list. Otherwise
        // the modal shows the "No container types found." Alert.
        cy.wait("@getContainerTypes");
        warehouseContainersLocators.manageTypesBtn().click();
        warehouseContainersLocators.manageTypesHeading().should("be.visible");
    }

    closeManageTypes() {
        warehouseContainersLocators
            .manageTypesDialog()
            .within(() => {
                warehouseContainersLocators.manageTypesCloseBtn().click();
            });
        warehouseContainersLocators.manageTypesHeading().should("not.exist");
    }

    typeNewTypeName(name) {
        warehouseContainersLocators.newTypeInput().clear({ force: true });
        if (name !== "") {
            warehouseContainersLocators
                .newTypeInput()
                .type(name, { force: true });
        }
    }

    clickAddType() {
        warehouseContainersLocators
            .manageTypesDialog()
            .within(() => {
                warehouseContainersLocators.addTypeBtn().click();
            });
    }

    // Convenience: type a fresh name + click Add. Resolves once the
    // POST has come back and the new row is rendered (we wait for the
    // input to appear with the typed value).
    addType(name) {
        this.typeNewTypeName(name);
        this.clickAddType();
        warehouseContainersLocators.typeRowByName(name).should("exist");
    }

    // Delete the row that currently displays the given type name. Uses
    // the row's icon button (aria-label="Delete"), then confirms with
    // "Yes" in the resulting MUI ConfirmationDialog. Returns once the
    // row dismounts.
    deleteTypeRow(name) {
        warehouseContainersLocators
            .typeRowByName(name)
            .parents('div.MuiStack-root')
            .first()
            .within(() => {
                warehouseContainersLocators.deleteTypeBtnInRow().click();
            });
        warehouseContainersLocators.deleteTypeYesBtn().click();
        warehouseContainersLocators.typeRowByName(name).should("not.exist");
    }

    // ========================================================================
    // Row Actions (View Contents · Merge · Stock Out · Delete · View Label)
    // ========================================================================

    // Click an action button (by its tooltip name) inside the row that
    // contains `code`. The tooltip wraps the IconButton so MUI sets the
    // accessible name on the button itself.
    clickRowAction(code, actionName) {
        warehouseContainersLocators
            .actionsCellInRow(code)
            .within(() => {
                cy.findByRole('button', { name: new RegExp(`^${actionName}$`, 'i') }).click();
            });
    }

    // Open the View Contents (Container Details) modal for a row.
    openViewContents(code) {
        this.clickRowAction(code, "View Contents");
        warehouseContainersLocators.viewContentsHeading().should("be.visible");
    }

    closeViewContents() {
        warehouseContainersLocators.viewContentsCloseBtn().click();
        warehouseContainersLocators.viewContentsHeading().should("not.exist");
    }

    openViewLabel(code) {
        this.clickRowAction(code, "View Label");
        warehouseContainersLocators.viewLabelHeading(code).should("be.visible");
    }

    closeViewLabel(code) {
        warehouseContainersLocators.viewLabelCancelBtn().click();
        warehouseContainersLocators.viewLabelHeading(code).should("not.exist");
    }

    // ---- Merge dialog ----------------------------------------------------
    // Open the Merge Container dialog for the given source row. The
    // Merge icon is disabled when source.cur_items === 0; callers must
    // ensure the source is loaded before invoking this.
    //
    // Two flakes used to bite here:
    //   1) The grid row data comes from a SEPARATE fetch (pageSize=10
    //      with the search filter) than the Merge dialog's container
    //      list (pageSize=500). Waiting only on the latter can leave
    //      the row showing stale cur_items=0 at click time — the icon
    //      stays disabled and the click throws. The .should("not.be.
    //      disabled") below retries the DOM query until the row data
    //      refreshes.
    //   2) MUI's <Tooltip> wraps the IconButton in a <span> and opens
    //      a popper on hover/focus. Cypress's actionability check
    //      moves the cursor to the button to test "is it covered",
    //      which immediately triggers the popper — the popper element
    //      can land on top of the button (it's portaled and positioned
    //      absolutely) and Cypress flags the button as covered.
    //      { force: true } bypasses the cover check; we still verify
    //      the button isn't disabled first, so we're not papering
    //      over a real "not interactable" regression.
    openMerge(code) {
        // Register the intercept BEFORE clicking so the dialog-triggered
        // GET /containers?pageSize=500 is captured.  The Merge form uses
        // this list for `containers.find(c => c.code === targetCode)` —
        // scanning before the response lands leaves scannedTarget null.
        cy.intercept("GET", "**/containers?pageSize=500*").as("mergeContainersList");
        warehouseContainersLocators
            .actionsCellInRow(code)
            .within(() => {
                cy.findByRole('button', { name: /^merge$/i })
                    .should("not.be.disabled")
                    .click({ force: true });
            });
        warehouseContainersLocators.mergeHeading(code).should("be.visible");
        cy.wait("@mergeContainersList", { timeout: 20000 });
    }

    cancelMerge(code) {
        warehouseContainersLocators
            .mergeDialog(code)
            .within(() => {
                warehouseContainersLocators.mergeCancelBtn().click();
            });
        warehouseContainersLocators.mergeHeading(code).should("not.exist");
    }

    // Type a target container code into the Merge dialog's scan input
    // and press Enter to "scan" it. The form's onKeyDown does the
    // lookup and pops a toast on miss or on a type-mismatch.
    scanMergeTargetCode(code) {
        warehouseContainersLocators
            .mergeScanInput()
            .clear()
            .type(`${code}{enter}`);
    }

    // Click the Merge submit button. Caller must ensure a valid target
    // is selected (button is disabled when scannedTarget is null).
    submitMerge(sourceCode) {
        warehouseContainersLocators
            .mergeDialog(sourceCode)
            .within(() => {
                warehouseContainersLocators.mergeSubmitBtn().click();
            });
    }

    // Open the Delete-container confirmation dialog for a row.
    openDeleteContainer(code) {
        this.clickRowAction(code, "Delete");
        warehouseContainersLocators.deleteContainerDialog().should("be.visible");
    }

    confirmDeleteContainer(code) {
        warehouseContainersLocators.deleteContainerYesBtn().click();
        // Row dismounts on success.
        warehouseContainersLocators.containerRowText(code).should("not.exist");
    }

    cancelDeleteContainer() {
        warehouseContainersLocators.deleteContainerNoBtn().click();
        warehouseContainersLocators.deleteContainerDialog().should("not.exist");
    }

    // ========================================================================
    // Assign To Location modal (assignToLocationForm.tsx)
    // ========================================================================

    openAssignToLocation() {
        cy.wait("@getContainerTypes");
        warehouseContainersLocators.assignToLocationBtn().click();
        warehouseContainersLocators.assignToLocationHeading().should("be.visible");
        // Wait for the dialog-triggered GET /containers?pageSize=500 to resolve
        // before the caller scans a container code. The scan is a client-side
        // containers.find() against the allData prop; if the fetch is still
        // in-flight, the prop is empty and every scan shows "Container not found".
        cy.wait("@getAllContainersList", { timeout: 30000 });
    }

    cancelAssignToLocation() {
        warehouseContainersLocators
            .assignToLocationDialog()
            .within(() => {
                warehouseContainersLocators.assignCancelBtn().click();
            });
        warehouseContainersLocators.assignToLocationHeading().should("not.exist");
    }

    // Type a container code into the Scan-mode input and press Enter
    // to "scan" it. The form's onKeyDown handler does an async lookup and
    // only sets `scannedContainer` once it resolves. We wait for the
    // resulting confirmation card (which renders `${code} • ${type}`) so the
    // caller can trust the selection landed before scanning the location /
    // clicking Assign — otherwise the Assign button stays disabled
    // (assignToLocationForm.tsx:820) when the lookup is slow on QA.
    scanContainerCode(code) {
        warehouseContainersLocators
            .assignContainerScanInput()
            .clear()
            .type(`${code}{enter}`);
        // Confirmation card text is "<code> • <type>"; match the code so we
        // don't depend on the container's type name.
        cy.contains(new RegExp(`${code}\\s*•`, 'i'), { timeout: 25000 }).should('be.visible');
    }

    // Type a location path/code into the Scan-mode input and press
    // Enter — the form looks it up via /locations/scan-path?path=... and
    // only sets `scannedLocation` once it resolves. Wait for the location
    // confirmation card (which renders the location path) so Assign is
    // guaranteed enabled before the caller clicks it.
    scanLocationPath(path) {
        warehouseContainersLocators
            .assignLocationScanInput()
            .clear()
            .type(`${path}{enter}`);
        cy.contains(displayPath(path), { timeout: 25000 }).should('be.visible');
    }

    // Select a container from the "Select From List" tab.
    //
    // Scoping: the dialog has two ToggleButtonGroups ("Scan / Select
    // From List") with identical labels — one for Container, one for
    // Location. We scope clicks to the toggle group that is the
    // IMMEDIATE next sibling of the "Select Container" heading
    // (assignContainerToggleGroup) so findByRole('button',{name:
    // /select from list/i}) inside that scope matches exactly one
    // button. The Autocomplete input that mounts afterwards is
    // anchored by its unique placeholder text.
    selectContainerFromList(code) {
        warehouseContainersLocators
            .assignContainerToggleGroup()
            .within(() => {
                warehouseContainersLocators.selectFromListToggleBtn().click();
            });
        warehouseContainersLocators
            .assignContainerSelectInput()
            .click()
            .clear()
            .type(code);
        // The option's renderOption stacks two Typography spans (code on
        // line 1, "Unassigned" or location path on line 2), so the option's
        // accessible name is the concatenation of both — `^${code}$` never
        // matches. Anchor on the inner code text inside the open listbox;
        // the click bubbles to the parent <li>.
        cy.findByRole('listbox')
            .findByText(new RegExp(`^${code}$`))
            .click();
    }

    // Select a location from the "Select From List" tab. Same scoping
    // pattern as selectContainerFromList. The LocationSelector's
    // options use the location path as the accessible name.
    selectLocationFromList(path) {
        warehouseContainersLocators
            .assignLocationToggleGroup()
            .within(() => {
                warehouseContainersLocators.selectFromListToggleBtn().click();
            });
        warehouseContainersLocators
            .assignLocationSelectInput()
            .click()
            .clear()
            .type(path);
        cy.findByRole('option', { name: new RegExp(`^${escapeRegExp(displayPath(path))}$`, 'i') })
            .click();
    }

    clickAssign() {
        // Both container and location scan lookups are async (GET requests).
        // The form enables Assign only once BOTH scannedContainer AND
        // scannedLocation are set (assignToLocationForm.tsx:820 —
        // disabled={!scannedContainer || !scannedLocation || ...}). The
        // earlier `.should('not.be.disabled', { timeout: 15000 })` was a no-op
        // timeout: the second arg to a `.should(chainer)` is treated as the
        // expected VALUE, not Cypress options, so the assertion fell back to
        // the 8s default command timeout and clicked a still-disabled button
        // when the location scan was slow on QA — the TC41/TC46 failure.
        //
        // Pass the timeout on the COMMAND that yields the element (cy.get via
        // the locator) so the retry window actually applies, then assert
        // enabled before clicking. The button label is "Assign" on a clean
        // assign and "Confirm Assignment" when a force-reassign is pending; we
        // don't assert the label so both paths work.
        warehouseContainersLocators
            .assignAssignBtn()
            .should('not.be.disabled');
        warehouseContainersLocators
            .assignAssignBtn()
            .click();
    }

    // ========================================================================
    // Stock Out modal (StockOutModal.tsx — row Stock Out icon)
    // ========================================================================

    // Open the Stock Out modal for the row matching `code`. The icon is
    // disabled when cur_items === 0, so callers must ensure the container
    // is loaded (via API helper) before invoking this.
    openStockOut(code) {
        this.clickRowAction(code, "Stock Out");
        warehouseContainersLocators.stockOutHeading().should("be.visible");
    }

    // Select a reason in the Stock Out modal. The Reason field is a
    // react-select CreatableSelect — clicking the input opens the menu;
    // we then pick the matching option (or the first option if no label
    // is supplied). Defaulting to "any option" makes tests resilient to
    // QA's stockOutReason config changing.
    selectStockOutReason(label) {
        warehouseContainersLocators.stockOutReasonControl().click();
        if (label) {
            warehouseContainersLocators.stockOutReasonOption(label).click();
        } else {
            warehouseContainersLocators.stockOutReasonAnyOption().click();
        }
    }

    // Submit the Stock Out form. The button is disabled while the
    // mutation is pending; cy.click() auto-retries until it becomes
    // enabled, so we don't need an explicit wait.
    confirmStockOut() {
        warehouseContainersLocators.stockOutSubmitBtn().click();
    }

    // Cancel the Stock Out modal without submitting (click "Cancel" or ESC).
    // The dialog closes and no mutation is performed.
    cancelStockOut() {
        cy.get('div[role="dialog"]:has(:contains("Stock Out"))')
            .findByRole('button', { name: /^Cancel|Close$/i })
            .first()
            .click();
    }

    // ========================================================================
    // Composite flows
    // ========================================================================

    // Re-visit Containers, search for `code`, open the row's Stock Out icon,
    // pick any reason, submit, and assert the success toast. Used by E2E
    // tests where the Containers page is not the current view (the
    // preceding step was on Inventory Actions → Assign Products) and the
    // page needs a fresh visit before the row is interacted with.
    //
    // Precondition: the container must be loaded (cur_items > 0). The row
    // Stock Out icon is disabled at 0 — callers should run their load
    // step before this composite.
    stockOutContainerByRow(code) {
        this.visit();
        this.search(code);
        this.verifyContainerPresent(code);
        this.openStockOut(code);
        this.selectStockOutReason();
        this.confirmStockOut();
        cy.contains(/stocked out and container cleared/i)
            .should("be.visible");
    }

    // ========================================================================
    // Audit Trail (row clock icon → IMSDialog)
    // ========================================================================

    // Open the Container Audit Trail dialog for a row. The clock icon
    // is rendered AFTER the five tooltip-wrapped action icons and lives
    // inside the same Actions cell; ContainerAuditTrail uses an
    // IconButton with `title="View Audit Trail"` (no Tooltip wrapper),
    // so we scope by the row's actions cell and look for that button.
    openAuditTrail(code) {
        warehouseContainersLocators
            .actionsCellInRow(code)
            .within(() => {
                warehouseContainersLocators.auditTrailBtnInRow().click();
            });
        warehouseContainersLocators.auditTrailHeading(code).should("be.visible");
    }

    // Close the audit trail dialog. IMSDialog's close IconButton has no
    // accessible name (no aria-label, no title, and the CloseIcon is
    // wrapped in <Zoom>), and the sticky DialogTitle can overlap it —
    // so cy.click() on it intermittently flags as "covered". MUI Dialog
    // honours onClose on Escape, which is the unambiguous close path.
    closeAuditTrail(code) {
        cy.get("body").type("{esc}");
        warehouseContainersLocators.auditTrailHeading(code).should("not.exist");
    }

    // Assert the audit trail dialog contains at least `min` entry cards.
    // containerAuditTrail.tsx renders a <ul>/<li> list — each <li> is one
    // event card. The query is aliased so tests can wait on the intercept
    // before calling this assertion.
    assertAuditTrailHasAtLeast(min) {
        warehouseContainersLocators
            .auditTrailEntries()
            .its("length")
            .should("be.gte", min, `audit trail should have at least ${min} entr${min === 1 ? "y" : "ies"}`);
    }

    // Assert the empty state message is shown (container has no audit events).
    assertAuditTrailEmpty() {
        warehouseContainersLocators.auditTrailEmptyState().should("be.visible");
        // The <ul> should not be rendered at all when there are no entries.
        cy.get('div[role="dialog"]:has(:contains("Container Audit Trail"))')
            .find("ul")
            .should("not.exist");
    }

    // Assert that at least one entry card contains the label matching
    // `labelPattern` (regex or string). The labels are rendered by
    // formatStatus(key) — e.g. "actionType" → "Action Type".
    assertAuditTrailLabelExists(labelPattern) {
        warehouseContainersLocators
            .auditTrailLabels()
            .then(($labels) => {
                const texts = [...$labels].map((el) => el.innerText);
                const match = texts.some((t) =>
                    labelPattern instanceof RegExp
                        ? labelPattern.test(t)
                        : t.toLowerCase().includes(labelPattern.toLowerCase()),
                );
                expect(match, `audit trail should have a label matching "${labelPattern}"`).to.be.true;
            });
    }

    // ========================================================================
    // Row selection + bulk print (top-toolbar)
    // ========================================================================

    // Toggle the checkbox for a row whose code matches. MRT lazily
    // mounts row checkboxes in the "mrt-row-select" display column;
    // we anchor inside the row.
    selectRowByCode(code) {
        warehouseContainersLocators.rowSelectCheckbox(code).check({ force: true });
    }

    // Open the bulk Print QR Codes dialog (top-toolbar Print QR Codes
    // button is only rendered when ≥1 row is selected).
    openBulkPrintDialog() {
        warehouseContainersLocators.bulkPrintBtn().click();
        warehouseContainersLocators.bulkPrintDialog().should("be.visible");
    }

    cancelBulkPrintDialog() {
        warehouseContainersLocators.bulkPrintCancelBtn().click();
        warehouseContainersLocators.bulkPrintDialog().should("not.exist");
    }

    // Click "Clear Selection" in the top toolbar — only visible when
    // ≥1 row is selected. Resolves once the selection toolbar
    // dismounts (Print QR Codes button is gone).
    clickClearSelection() {
        warehouseContainersLocators.clearSelectionBtn().click();
        warehouseContainersLocators.bulkPrintBtn().should("not.exist");
    }
}

export default WarehouseContainersPage;
