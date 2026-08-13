// cypress/support/locators/warehouseLocationsLocators.js
//
// Locators for the Warehouse Management → Locations page.
// Selector strategy (per WMS-TEST-PLAN §6, derived from discovery output):
//   - Icon buttons → aria-label
//   - Labelled buttons → button text
//   - Inputs → placeholder
//   - Stat cards → label text
// The page renders no data-testid attributes today, so we lean on
// accessible names. If/when data-testids land, swap selectors here only.

const warehouseLocationsLocators = {
    // ---- Page chrome --------------------------------------------------------
    // The evolved page removed the dedicated <h5> "Locations" page title; the
    // page identity now lives only in the breadcrumb leaf. Anchor the
    // page-rendered check on the unique "Manage Locations" button instead.
    pageHeading:        () => cy.findByRole('button', { name: /manage locations/i }),

    // The breadcrumb trail "Dashboard · Warehouse Management · Locations".
    // We anchor on the active leaf so it doesn't false-match other pages.
    breadcrumbActive:   () => cy.contains(/^locations$/i),

    // ---- Filters / search row ----------------------------------------------
    // The "Status" select (default "All bins"). MUI renders it as a button with
    // role="combobox"; the visible label text is "Status".
    statusSelect:       () => cy.findByRole('combobox', { name: /status/i }),

    // A specific option inside the open Status dropdown menu, e.g. "All bins".
    // Pass the option's visible text. Used after opening statusSelect().
    statusOption:       (label) => cy.findByRole('option', { name: new RegExp(`^${label}$`, 'i') }),

    // The free-text search input. Placeholder is the most reliable handle —
    // there's no label association in the rendered DOM. Matched on the tail of
    // the placeholder, which the leading "Search location path," prefix (added
    // when displayed paths became searchable) does not disturb.
    searchInput:        () => cy.get('input[placeholder*="container code or contents"]'),

    // The green "Search" button to the right of the search input.
    searchButton:       () => cy.findByRole('button', { name: /^search$/i }),

    // The "Manage Locations" button (opens the hierarchy CRUD modal).
    manageLocationsBtn: () => cy.findByRole('button', { name: /manage locations/i }),

    // ---- Stats cards --------------------------------------------------------
    // Each stat card shows a label (e.g. "Facilities", "Bin Occupancy %") and
    // a number to its right. We expose two helpers:
    //
    //   statCard(label)      — the card container (use to scope assertions).
    //   statCardValue(label) — the numeric value rendered inside the card.
    //
    // The card container is identified by finding the label text and walking
    // up to the nearest enclosing element that holds the value too. The
    // implementation uses `parent()` chain because the cards have no test id.
    statCard:           (label) =>
        cy.contains(new RegExp(`^${label}$`, 'i')).parent(),

    statCardValue:      (label) =>
        cy.contains(new RegExp(`^${label}$`, 'i')).parent(),

    // The full set of stat-card labels rendered on the page (10 cards),
    // derived from the discovery screenshot. Used by tests that iterate.
    allStatLabels:      () => [
        'Facilities',
        'Zones',
        'Areas',
        'Rows',
        'Bays',
        'Levels',
        'Bins',
        'Empty Bins',
        'Occupied Bins',
        'Bin Occupancy %',
    ],

    // ---- Table (material-react-table) --------------------------------------
    // The grid root. The MRT component renders a single <table> on the page.
    table:              () => cy.get('table'),

    // All visible column-header cells. Use to assert the documented column set.
    tableHeaders:       () => cy.get('table thead th'),

    // A specific column header by its visible label, e.g. "Bin Path".
    tableHeader:        (name) => cy.contains('th', new RegExp(`^${name}$`, 'i')),

    // All data rows in the body (excludes header).
    tableRows:          () => cy.get('table tbody tr'),

    // The "no data" fallback that MRT shows when the body is empty.
    // MRT's default text is "No records to display" — we match loosely.
    tableEmptyMessage:  () => cy.contains(/no records|no data|no results/i),

    // ---- Toolbar toggles (MRT) ---------------------------------------------
    // Toolbar icon buttons sit at the top-right of the grid. Each is exposed
    // as its own helper so tests don't repeat aria-label strings.
    showHideColumnsBtn: () => cy.findByRole('button', { name: /show\/hide columns/i }),
    toggleDensityBtn:   () => cy.findByRole('button', { name: /toggle density/i }),
    toggleFullScreenBtn:() => cy.findByRole('button', { name: /toggle full screen/i }),

    // ---- Pagination --------------------------------------------------------
    // Footer controls rendered by MRT. The "Rows per page" selector and the
    // page-navigation icon buttons are the ones we'll exercise.
    rowsPerPageSelect:  () => cy.get('[id^="mrt-rows-per-page"]'),
    prevPageBtn:        () => cy.findByRole('button', { name: /go to previous page/i }),
    nextPageBtn:        () => cy.findByRole('button', { name: /go to next page/i }),

    // ---- Row-level actions (icon buttons inside a row's Actions cell) -------
    // Tests pass a row scope (e.g. cy.contains('tr', '<bin path>'))
    // and call .within(() => warehouseLocationsLocators.viewLabelBtn().click()).
    viewLabelBtn:       () => cy.findByRole('button', { name: /view label/i }),
    deleteRowBtn:       () => cy.findByRole('button', { name: /^delete$/i }),

    // ---- Main-grid row by Bin path -----------------------------------------
    // The main grid's "Bin Path" column shows the location.path string with
    // `/` swapped for ` > ` (the grid's display form). Looking up a row by full path is the only reliable
    // way to disambiguate on a busy QA where multiple bins share the same
    // BN-N short code under different parents.
    mainGridBinRow:     (binPath) =>
        cy.contains('table tbody tr', binPath),

    // ---- Main-grid delete confirmation -------------------------------------
    // The main grid uses a different ConfirmationDialog shape than the per-
    // tier pages: heading "Confirm Location Deletion", buttons "Yes" / "No".
    // We expose explicit accessors so tests don't rely on the loose
    // confirmDelete*/confirmCancel* regex helpers below — those still work,
    // but pinning the exact text here doubles as a structural assertion.
    mainGridDeleteDialogHeading: () =>
        cy.contains(/^Confirm Location Deletion$/i),
    mainGridDeleteYesBtn:        () =>
        cy.findByRole('button', { name: /^yes$/i }),
    mainGridDeleteNoBtn:         () =>
        cy.findByRole('button', { name: /^no$/i }),

    // ---- Status filter options ---------------------------------------------
    // The Status select shows three options: "All bins", "Empty bins",
    // "Occupied bins". statusOption() above already accepts the visible
    // label, so we don't add new selectors — but we expose the literal
    // labels as a tuple so tests don't repeat them.
    statusOptionLabels: () => ({
        all: 'All bins',
        empty: 'Empty bins',
        occupied: 'Occupied bins',
    }),

    // The cells in the Status column render the per-row label. Each
    // <Chip> shows either "Empty" or "Occupied" (NOT "Empty bins" /
    // "Occupied bins" — those are the dropdown labels). We grab them by
    // column index after the body re-renders for an applied filter.
    //
    // Body cell index 1 because columns render in this order:
    //   0 = MRT row-selection checkbox
    //   1 = Bin Path
    //   2 = Status (target)
    // …but `enableRowSelection: true` adds a <td> for the checkbox at
    // index 0. So actual indexes shift by one. We use the column header
    // text to find the column number reliably instead of hard-coding it,
    // via :nth-child of the matching th's index. Tests should iterate
    // rows and check the Status cell content.
    //
    // Implementation: find the index of the "Status" header column, then
    // grab every body cell at that index. Cypress doesn't expose CSS
    // :nth-child(n) where n is dynamic, so we resolve indices via .each
    // in the page object.
    statusCellsByHeader: (headerLabel) => {
        // Returns a Cypress chain that yields all status cells. We
        // implement this in the page object to allow runtime header-
        // index resolution.
        return cy.get('table tbody tr');
    },

    // ---- MRT row selection -------------------------------------------------
    // MRT renders an MUI <Checkbox> inside the row-selection column. The
    // header checkbox toggles all visible rows; each body row has its own.
    //
    // Selectors target the <input type="checkbox"> directly because MUI
    // wraps it in a <span> with role="presentation" that's not findByRole-
    // friendly. We anchor on the table to avoid accidentally selecting any
    // other checkbox on the page.
    selectAllCheckbox:  () =>
        cy.get('table thead input[type="checkbox"]').first(),
    rowCheckbox:        (rowChain) => rowChain.find('input[type="checkbox"]'),

    // ---- Top-toolbar bulk-action buttons -----------------------------------
    // These only render once at least one row is selected. Both buttons sit
    // in the table's top toolbar (the row above the column headers).
    printQrCodesBtn:    () => cy.contains('button', /print qr codes/i),
    clearSelectionBtn:  () => cy.contains('button', /clear selection/i),

    // The "N selected" indicator that renders alongside the bulk buttons.
    // Useful as a sanity check that selection state landed before clicking
    // Print/Clear.
    selectionCountText: () => cy.contains(/\d+.*selected/i),

    // ---- Bulk Print QR Codes dialog ----------------------------------------
    // Opens via the Print QR Codes top-toolbar button. Standard MUI Dialog
    // (NOT the custom-overlay style used by the QR-label component).
    //
    // Heading is "Print QR Codes"; body contains "<N> location(s) selected"
    // and two action buttons: "Print as PDF (A4)" and "Print to Zebra
    // Thermal Printer", plus a Cancel.
    //
    // We use a CSS selector that climbs the MUI dialog ancestor of the
    // title text. Doing this with `cy.findByRole('dialog').filter(...)`
    // breaks when the dialog isn't mounted: findByRole returns zero
    // elements and .filter() then fails with "requires a DOM element".
    // The plain `cy.contains` form correctly resolves to "no match" in
    // the absent case, which works with both .should('be.visible') and
    // .should('not.exist').
    bulkPrintDialog:        () =>
        cy.get('.MuiDialog-root:has(.MuiDialogTitle-root:contains("Print QR Codes"))'),
    bulkPrintCountText:     () => cy.contains(/\d+\s+location\(s\)\s+selected/i),
    // The deployed LOCATIONS bulk-print dialog ("Print QR Codes") offers ONLY
    // "Print to Zebra Thermal Printer" + Cancel — there is NO PDF/A4 option here
    // (verified live). pdfBtn is kept for callers but is not expected to exist on
    // the locations dialog; TC85 asserts only the Zebra + count + cancel controls.
    bulkPrintPdfBtn:        () =>
        cy.findByRole('button', { name: /print as pdf|print\s*a4/i }),
    bulkPrintZebraBtn:      () =>
        cy.findByRole('button', { name: /zebra/i }),
    bulkPrintCancelBtn:     () =>
        cy.findByRole('button', { name: /^cancel$/i }),

    // ---- "View Content" button (Assignment column) -------------------------
    // Renders only on Bin rows where `bin.isOccupied === true`. For empty
    // bins the cell shows "--" instead. findAllByRole (not findByRole): when
    // several occupied bins are visible the grid renders MANY "View Content"
    // buttons, and singular findByRole throws "Found multiple elements" before
    // a .first() can run. Row-scoped callers (inside .within()) still resolve a
    // single element, so .click() on the collection works there too.
    viewContentBtn:     () => cy.findAllByRole('button', { name: /^view content$/i }),

    // The contents dialog is a custom <Box> overlay (no role="dialog"),
    // same pattern as the QR-label component. Heading reads "Contents : <path>"
    // (with a leading space before the colon — see FormSecitonHeading in
    // ViewLocationContentsDialog.tsx).
    contentsDialogHeading: () => cy.contains(/^Contents\b/i),

    // ---- Loading indicator --------------------------------------------------
    // MRT shows a linear/circular progress while data is fetching. Useful as
    // a wait point: tests can `should('not.exist')` to confirm load completion.
    loadingIndicator:   () => cy.get('[role="progressbar"]'),

    // ========================================================================
    // Facilities Management page (/warehouse-management/locations/facilities)
    //
    // Reached via the "Manage Locations" button on the main Locations page.
    // Discovery showed this is NOT a modal — it's a separate route with its
    // own page heading "Facilities Management" and per-row CRUD buttons.
    // ========================================================================

    // ---- Page chrome (Facilities Management) -------------------------------
    facilitiesPageHeading: () => cy.findByRole('heading', { name: /facilities management/i }),

    // ---- CRUD buttons -----------------------------------------------------
    // Primary CTA at the top-right of the Facilities Management page.
    addFacilityBtn:        () => cy.findByRole('button', { name: /^add facility$/i }),

    // Per-row icon buttons. Tests scope these inside a row using .within().
    editFacilityBtn:       () => cy.findByRole('button', { name: /edit facility/i }),
    deleteFacilityBtn:     () => cy.findByRole('button', { name: /delete facility/i }),

    // The drill-down button on each Facility row, e.g. "View & Manage Zones (3)".
    // The (count) suffix varies, so the regex matches just the prefix.
    viewManageZonesBtn:    () => cy.findByRole('button', { name: /view & manage zones/i }),

    // ---- Facilities search ------------------------------------------------
    // Different from the main page's search — this one searches inside the
    // Facilities list and uses a different placeholder.
    facilitiesSearchInput: () => cy.get('input[placeholder*="Search name or code"]'),
    facilitiesSearchBtn:   () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Add/Edit Facility dialog -----------------------------------------
    // Confirmed from a failed-test screenshot:
    //   - Dialog title:      "Add New Facility"
    //   - Field 1 label:     "Facility Name*"  placeholder "e.g. Main Warehouse"
    //   - Field 2 label:     "Facility Code"   placeholder shows next code,
    //                         helper text "Code is auto-generated"
    //   - Footer buttons:    "Cancel"   "Create"

    // Dialog root. role="dialog" is reliable for MUI dialogs.
    facilityDialog:        () => cy.findByRole('dialog'),

    // The dialog's labels are visible text *above* the input but aren't
    // programmatically associated, so findByLabelText times out. The
    // immediate parent of the matched text node may be the <label> itself
    // (no input inside), so we walk up via `parents()` until we hit an
    // ancestor that contains an input and grab the first input inside it.
    // .first() on parents() is the closest ancestor, ensuring we don't
    // grab the dialog's input list as a whole.
    facilityNameInput:     () =>
        cy.contains(/^facility name\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    facilityCodeInput:     () =>
        cy.contains(/^facility code$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    // Footer buttons — the primary CTA is "Create" (not "Save"). For Edit
    // mode the same button is likely labelled "Save" or "Update"; tests
    // that exercise edit will pick whichever is present.
    facilityCreateBtn:     () => cy.findByRole('button', { name: /^create$/i }),
    facilityUpdateBtn:     () => cy.findByRole('button', { name: /^(save|update)$/i }),
    facilityCancelBtn:     () => cy.findByRole('button', { name: /^cancel$/i }),

    // ---- Delete confirmation dialog ---------------------------------------
    // Best-guess locators for the confirmation dialog. Pattern is typically a
    // generic confirm with "Delete" or "Confirm" CTA — we accept either.
    confirmDialog:         () => cy.findByRole('dialog'),
    // The CTA varies per dialog: most per-tier dialogs render "Delete";
    // the main-grid `ConfirmationDialog` renders bare "Yes".
    confirmDeleteBtn:      () => cy.findByRole('button', { name: /^(delete|confirm|yes,?\s*delete|yes)$/i }),
    // Same dual-shape contract on the cancel side: most dialogs say
    // "Cancel"; the main-grid one says "No".
    confirmCancelBtn:      () => cy.findByRole('button', { name: /^(cancel|no)$/i }),

    // ---- Facility card helpers --------------------------------------------
    // The Facilities Management page renders facilities as CARDS, not
    // table rows. We expose two scope helpers because the card has two
    // visual sections that don't share a single Edit/Delete + drill-down
    // wrapper:
    //
    //   - facilityRow(): the inner wrapper containing Edit/Delete icons.
    //     Use for openEditFacility / clickDeleteFacility.
    //   - facilityCard(): the OUTER card root containing BOTH the Edit
    //     buttons AND the "View & Manage Zones" drill-down. Use for
    //     drillIntoZones — only valid when the Facility has >= 1 Zone.
    facilityRow:           (nameOrCode) =>
        cy.contains(nameOrCode)
          .parents(':has(button[aria-label="Edit Facility"])')
          .first(),

    facilityCard:          (nameOrCode) =>
        cy.contains(nameOrCode)
          .parents(':has(button[aria-label="Edit Facility"]):has(button:contains("View & Manage Zones"))')
          .first(),

    // Lightweight presence check (used by verifyFacilityPresent/Absent):
    // simply asserts the text appears somewhere on the page. Faster and
    // more lenient than scoping to a card root.
    facilityCardText:      (nameOrCode) => cy.contains(nameOrCode),

    // ========================================================================
    // Zones Management page (sub-route per Facility)
    //
    // URL pattern: /warehouse-management/locations/facilities (after drilling
    // into a Facility's "View & Manage Zones (n)" button — the route changes
    // but the segment isn't stable across test runs because it includes the
    // Facility's id; we therefore drill from Facilities rather than visit
    // directly).
    //
    // Discovery findings:
    //   - Heading:    "Zones in <FACILITY_CODE>"
    //   - Back btn:   "Back to Facilities"
    //   - Add btn:    "Add Zone"
    //   - Search:     placeholder "Search name or code..."  + "Search" button
    //   - Filter:     "Zone" / default "All Zones"
    //   - Card:       Zone name + code + "View & Manage Areas (n)" + edit/delete
    //   - Dialog:     "Add New Zone" — Name + Code + Cancel/Create
    // ========================================================================

    // ---- Page chrome (Zones) ---------------------------------------------
    zonesPageHeading:      () => cy.findByRole('heading', { name: /^zones in /i }),
    backToFacilitiesBtn:   () => cy.findByRole('button', { name: /back to facilities/i }),

    // ---- CRUD buttons ----------------------------------------------------
    addZoneBtn:            () => cy.findByRole('button', { name: /^add zone$/i }),

    // Edit/Delete are present on Zone cards based on the Facility pattern.
    // The aria-label format follows the per-level convention seen on Facilities.
    editZoneBtn:           () => cy.findByRole('button', { name: /edit zone/i }),
    deleteZoneBtn:         () => cy.findByRole('button', { name: /delete zone/i }),

    // Drill-down to the Zone's Areas page.
    viewManageAreasBtn:    () => cy.findByRole('button', { name: /view & manage areas/i }),

    // ---- Zones search ----------------------------------------------------
    zonesSearchInput:      () => cy.get('input[placeholder*="Search name or code"]'),
    zonesSearchBtn:        () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Add/Edit Zone dialog -------------------------------------------
    // Same shape as the Facility dialog (Name + Code, code auto-generated).
    zoneDialog:            () => cy.findByRole('dialog'),

    // Same label-then-walk-up strategy used for the Facility inputs — works
    // around the visible-but-not-programmatically-associated label markup.
    zoneNameInput:         () =>
        cy.contains(/^zone name\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    zoneCodeInput:         () =>
        cy.contains(/^zone code$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    zoneCreateBtn:         () => cy.findByRole('button', { name: /^create$/i }),
    zoneCancelBtn:         () => cy.findByRole('button', { name: /^cancel$/i }),

    // ---- Zone card helpers ----------------------------------------------
    // Same dual-scope pattern as Facility cards: zoneRow() reaches the
    // inner Edit/Delete wrapper; zoneCard() reaches the outer card root
    // that also contains the drill-down button.
    zoneRow:               (nameOrCode) =>
        cy.contains(nameOrCode)
          .parents(':has(button[aria-label="Edit Zone"])')
          .first(),

    zoneCard:              (nameOrCode) =>
        cy.contains(nameOrCode)
          .parents(':has(button[aria-label="Edit Zone"]):has(button:contains("View & Manage Areas"))')
          .first(),

    zoneCardText:          (nameOrCode) => cy.contains(nameOrCode),

    // ========================================================================
    // Areas Management page (sub-route per Zone)
    //
    // URL pattern:
    //   /warehouse-management/locations/areas
    //     ?facilityId=&facilityCode=&zoneId=&zoneCode=
    //
    // Discovery findings (cross-checked against Frontend/src/pages/WMSAreas.tsx):
    //   - Heading:    "Areas in <ZONE_CODE>"
    //   - Back btn:   "Back to Zones"
    //   - Add btn:    "Add Area"
    //   - Search:     placeholder "Search name or code..."  + "Search" button
    //   - Filter:     "Area" / "All Areas" / "With Rows" / "Empty"
    //   - Card:       Area name + code + "View & Manage Rows (n)" + edit/delete
    //   - Dialog:     "Add New Area" — Name (placeholder "e.g. Picking Area 1"),
    //                 Code (auto-generated, A- prefix, disabled), then a
    //                 "Create Location Hierarchy *" sub-section with FOUR
    //                 numeric fields:
    //                   Number of Rows         max 25
    //                   Bays in Each Row       max 20
    //                   Levels in Each Bay     max  9
    //                   Bins in Each Level     max  9
    //                 Each must be > 0 to submit. The TextField inside each
    //                 row clamps input to [0, max] on change.
    //   - Buttons:    "Cancel" / "Create" (or "Update" in edit mode).
    //                 In edit mode the bulk-hierarchy section is hidden.
    //   - Delete confirm dialog: title "Confirm Delete", buttons Cancel/Delete.
    // ========================================================================

    // ---- Page chrome (Areas) ---------------------------------------------
    areasPageHeading:      () => cy.findByRole('heading', { name: /^areas in /i }),
    backToZonesBtn:        () => cy.findByRole('button', { name: /back to zones/i }),

    // ---- CRUD buttons ----------------------------------------------------
    addAreaBtn:            () => cy.findByRole('button', { name: /^add area$/i }),

    // Edit/Delete buttons on each Area card. The aria-label format follows
    // the per-level convention (Tooltip title surfaces as accessible name).
    editAreaBtn:           () => cy.findByRole('button', { name: /edit area/i }),
    deleteAreaBtn:         () => cy.findByRole('button', { name: /delete area/i }),

    // Drill-down to the Area's Rows page.
    viewManageRowsBtn:     () => cy.findByRole('button', { name: /view & manage rows/i }),

    // ---- Areas search ----------------------------------------------------
    areasSearchInput:      () => cy.get('input[placeholder*="Search name or code"]'),
    areasSearchBtn:        () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Add/Edit Area dialog -------------------------------------------
    // Dialog root. role="dialog" is reliable for MUI dialogs.
    areaDialog:            () => cy.findByRole('dialog'),

    // Same label-then-walk-up strategy used for Facility/Zone inputs — works
    // around the visible-but-not-programmatically-associated label markup.
    areaNameInput:         () =>
        cy.contains(/^area name\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    areaCodeInput:         () =>
        cy.contains(/^area code\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    // Bulk-hierarchy numeric inputs. Each label is a plain <Typography>, not
    // a <label for=...>, so we walk up to the wrapping flex row and grab its
    // first <input>. The four labels are exact-match — same regex shape as
    // the Frontend source.
    bulkRowsInput:         () =>
        cy.contains(/^number of rows$/i)
          .parent()
          .find('input')
          .first(),
    bulkBaysInput:         () =>
        cy.contains(/^bays in each row$/i)
          .parent()
          .find('input')
          .first(),
    bulkLevelsInput:       () =>
        cy.contains(/^levels in each bay$/i)
          .parent()
          .find('input')
          .first(),
    bulkBinsInput:         () =>
        cy.contains(/^bins in each level$/i)
          .parent()
          .find('input')
          .first(),

    // Footer buttons. Edit mode swaps "Create" for "Update".
    areaCreateBtn:         () => cy.findByRole('button', { name: /^create$/i }),
    areaUpdateBtn:         () => cy.findByRole('button', { name: /^(update|save)$/i }),
    areaCancelBtn:         () => cy.findByRole('button', { name: /^cancel$/i }),

    // ---- Area card helpers ----------------------------------------------
    // Same dual-scope pattern as Facility/Zone cards: areaRow() reaches the
    // inner Edit/Delete wrapper; areaCard() reaches the outer card root that
    // also contains the drill-down button.
    areaRow:               (nameOrCode) =>
        cy.contains(nameOrCode)
          .parents(':has(button[aria-label="Edit Area"])')
          .first(),

    areaCard:              (nameOrCode) =>
        cy.contains(nameOrCode)
          .parents(':has(button[aria-label="Edit Area"]):has(button:contains("View & Manage Rows"))')
          .first(),

    areaCardText:          (nameOrCode) => cy.contains(nameOrCode),

    // ========================================================================
    // Rows Management page (sub-route per Area)
    //
    // URL pattern:
    //   /warehouse-management/locations/rows
    //     ?facilityId=&facilityCode=&zoneId=&zoneCode=&areaId=&areaCode=
    //
    // Discovery findings (cross-checked against Frontend/src/pages/WMSRows.tsx):
    //   - Heading:    "Rows in <AREA_CODE>"
    //   - Back btn:   "Back to Areas"
    //   - Add btn:    "Add Row"
    //   - Search:     placeholder "Search code..."  + "Search" button
    //   - Filter:     "Row" / "All Rows" / "With Bays" / "Empty"
    //   - Card:       Code: R-NN + "<n> Bay(s)" chip + Delete + drill-down
    //                 NO Name field (Rows are code-only) and NO Edit button.
    //   - Dialog:     "Add New Row" — single Row Code input (auto-generated,
    //                 R- prefix, disabled) + Cancel/Create.
    //   - Delete confirm: title "Confirm Delete", buttons Cancel/Delete.
    // ========================================================================

    // ---- Page chrome (Rows) ----------------------------------------------
    rowsPageHeading:       () => cy.findByRole('heading', { name: /^rows in /i }),
    backToAreasBtn:        () => cy.findByRole('button', { name: /back to areas/i }),

    // ---- CRUD buttons ----------------------------------------------------
    addRowBtn:             () => cy.findByRole('button', { name: /^add row$/i }),

    // No Edit at the Row level — the affordance map confirms it.
    deleteRowBtnLevel:     () => cy.findByRole('button', { name: /delete row/i }),

    // Drill-down to the Row's Bays page.
    viewManageBaysBtn:     () => cy.findByRole('button', { name: /view & manage bays/i }),

    // ---- Rows search -----------------------------------------------------
    // Different placeholder ("Search code...") because Rows have no Name to
    // search by — keeps this distinct from the areas/zones search input that
    // shares the same page layout.
    rowsSearchInput:       () => cy.get('input[placeholder*="Search code"]'),
    rowsSearchBtn:         () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Add Row dialog -------------------------------------------------
    rowDialog:             () => cy.findByRole('dialog'),

    // The label-then-walk-up strategy used elsewhere. The optional `\*?`
    // tolerates the `*` MUI appends to required-field labels (e.g. "Row Code *").
    rowCodeInput:          () =>
        cy.contains(/^row code\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    rowCreateBtn:          () => cy.findByRole('button', { name: /^create$/i }),
    rowCancelBtn:          () => cy.findByRole('button', { name: /^cancel$/i }),

    // ---- Row card helpers -----------------------------------------------
    // Identification is by the Row's CODE (e.g. "R-001") because Rows have
    // no Name. Match the row-card body text containing "Code: R-NNN".
    //
    // Scoping requires an ancestor that contains BOTH:
    //   - the per-card Delete Row icon button, AND
    //   - the per-card "View & Manage Bays" drill-down button
    // because in the rendered JSX they live in different sub-trees of the
    // <Card>: Delete is inside an inner Stack alongside the code text;
    // the drill-down button is a SIBLING of that Stack. Walking up from
    // the matched text using only `:has(button[aria-label="Delete Row"])`
    // would stop at the inner Stack — which has no drill-down — and
    // subsequent .within() searches for the drill-down button would
    // silently miss. Requiring both selectors lifts the scope to the
    // Card itself.
    //
    // The negative lookahead `(?!\d)` after the 3-digit code matters
    // because the rendered card stitches "Code: R-NNN" directly to the
    // adjacent Chip's "<n> Bays" text via textContent (no whitespace
    // between block-level siblings), producing strings like
    // "Code: R-0050 Bays". Without the lookahead, `\b` after 3 digits
    // would still NOT match (digit-to-digit), but cy.contains' regex
    // anchor search would happily match against a longer code value
    // earlier in tests' code-capture path. We keep the bound here for
    // symmetry with the page object's row-card code matching in addRow().
    rowCard:               (code) =>
        cy.contains(new RegExp(`Code:\\s*${code}(?!\\d)`, 'i'))
          .parents(':has(button[aria-label="Delete Row"]):has(button:contains("View & Manage Bays"))')
          .first(),

    // Lightweight presence check by code text. The negative lookahead
    // keeps "Code: R-002" from matching when the body text reads
    // "Code: R-0020 Bays".
    rowCardText:           (code) =>
        cy.contains(new RegExp(`Code:\\s*${code}(?!\\d)`, 'i')),

    // ========================================================================
    // Bays Management page (sub-route per Row)
    //
    // Discovery findings (cross-checked against Frontend/src/pages/WMSBays.tsx):
    //   - URL:        /warehouse-management/locations/bays
    //                 ?facilityId=…&zoneId=…&areaId=…&rowId=…&…codes
    //   - Heading:    "Bays in <ROW_CODE>"
    //   - Back btn:   "Back to Rows"
    //   - Add btn:    "Add Bay"
    //   - Search:     placeholder "Search code..." + "Search" button
    //   - Filter:     "Bay" / "All Bays" / "With Levels" / "Empty"
    //   - Card:       Code: B-NN + "<n> Level(s)" chip + Delete + drill-down
    //                 NO Name field (Bays are code-only) and NO Edit button.
    //   - Dialog:     "Add New Bay" — single Bay Code input (auto-generated,
    //                 B- prefix, disabled) + Cancel/Create.
    //   - Delete confirm: title "Confirm Delete", buttons Cancel/Delete.
    //
    // Bays mirror Rows almost verbatim — the only differences are the level
    // (Bay vs Row), the code prefix (B- vs R-), and the drill-down target
    // ("View & Manage Levels" vs "View & Manage Bays").
    // ========================================================================

    // ---- Page chrome (Bays) ----------------------------------------------
    baysPageHeading:       () => cy.findByRole('heading', { name: /^bays in /i }),
    backToRowsBtn:         () => cy.findByRole('button', { name: /back to rows/i }),

    // ---- CRUD buttons ----------------------------------------------------
    addBayBtn:             () => cy.findByRole('button', { name: /^add bay$/i }),

    // No Edit at the Bay level — the affordance map confirms it. The icon
    // button gets `aria-label="Delete Bay"` via the wrapping <Tooltip
    // title="Delete Bay">.
    deleteBayBtnLevel:     () => cy.findByRole('button', { name: /delete bay/i }),

    // Drill-down to the Bay's Levels page.
    viewManageLevelsBtn:   () => cy.findByRole('button', { name: /view & manage levels/i }),

    // ---- Bays search -----------------------------------------------------
    // Same placeholder as Rows ("Search code...") because Bays are also
    // code-only. The locator is the same regardless — Cypress only ever has
    // one search input on screen at a time (you're either on the Rows page
    // or the Bays page, never both).
    baysSearchInput:       () => cy.get('input[placeholder*="Search code"]'),
    baysSearchBtn:         () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Add Bay dialog --------------------------------------------------
    bayDialog:             () => cy.findByRole('dialog'),

    // The label-then-walk-up strategy used elsewhere. The optional `\*?`
    // tolerates the `*` MUI appends to required-field labels (e.g. "Bay Code *").
    bayCodeInput:          () =>
        cy.contains(/^bay code\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    bayCreateBtn:          () => cy.findByRole('button', { name: /^create$/i }),
    bayCancelBtn:          () => cy.findByRole('button', { name: /^cancel$/i }),

    // ---- Bay card helpers ------------------------------------------------
    // Identification is by the Bay's CODE (e.g. "B-001") because Bays have
    // no Name. Same dual-:has scoping as rowCard — the matched text lives
    // alongside the Delete icon in an inner Stack, while the drill-down
    // button is a sibling of that Stack inside the <Card>. Walking up to a
    // node that contains BOTH affordances lifts the scope to the Card so
    // subsequent .within() searches can reach either button.
    //
    // The negative lookahead `(?!\d)` after the digits matters because the
    // rendered card stitches "Code: B-NNN" directly to the adjacent Chip's
    // "<n> Levels" text via textContent, producing strings like
    // "Code: B-0050 Levels". The lookahead keeps "B-005" from matching
    // longer codes like "B-0050".
    bayCard:               (code) =>
        cy.contains(new RegExp(`Code:\\s*${code}(?!\\d)`, 'i'))
          .parents(':has(button[aria-label="Delete Bay"]):has(button:contains("View & Manage Levels"))')
          .first(),

    // Lightweight presence check by code text. The negative lookahead keeps
    // "Code: B-002" from matching when the body text reads
    // "Code: B-0020 Levels".
    bayCardText:           (code) =>
        cy.contains(new RegExp(`Code:\\s*${code}(?!\\d)`, 'i')),

    // ========================================================================
    // Levels Management page (sub-route per Bay)
    //
    // Discovery findings (cross-checked against Frontend/src/pages/WMSLevels.tsx):
    //   - URL:        /warehouse-management/locations/levels
    //                 ?facilityId=…&zoneId=…&areaId=…&rowId=…&bayId=…&…codes
    //   - Heading:    "Levels in <BAY_CODE>"
    //   - Back btn:   "Back to Bays"
    //   - Add btn:    "Add Level"
    //   - Search:     placeholder "Search code..." + "Search" button
    //   - Filter:     "Level" / "All Levels" / "With Bins" / "Empty"
    //   - Card:       Code: L-NN + "<n> Bin(s)" chip + Delete + drill-down
    //                 NO Name field (Levels are code-only) and NO Edit button.
    //   - Dialog:     "Add New Level" — single Level Code input (auto-generated,
    //                 L- prefix, disabled) + Cancel/Create.
    //   - Delete confirm: title "Confirm Delete", buttons Cancel/Delete.
    //
    // Levels mirror Bays/Rows exactly — only the level (Level vs Bay), the
    // code prefix (L- vs B-), and the drill-down target ("View & Manage Bins"
    // vs "View & Manage Levels") differ.
    // ========================================================================

    // ---- Page chrome (Levels) --------------------------------------------
    levelsPageHeading:     () => cy.findByRole('heading', { name: /^levels in /i }),
    backToBaysBtn:         () => cy.findByRole('button', { name: /back to bays/i }),

    // ---- CRUD buttons ----------------------------------------------------
    addLevelBtn:           () => cy.findByRole('button', { name: /^add level$/i }),

    // No Edit at the Level level — the affordance map confirms it. The icon
    // button gets `aria-label="Delete Level"` via the wrapping <Tooltip
    // title="Delete Level">.
    deleteLevelBtnLevel:   () => cy.findByRole('button', { name: /delete level/i }),

    // Drill-down to the Level's Bins page.
    viewManageBinsBtn:     () => cy.findByRole('button', { name: /view & manage bins/i }),

    // ---- Levels search ---------------------------------------------------
    // Same placeholder as Rows/Bays ("Search code...") because Levels are
    // also code-only. Cypress only ever has one search input on screen at
    // a time (you're either on the Bays page or the Levels page, never
    // both).
    levelsSearchInput:     () => cy.get('input[placeholder*="Search code"]'),
    levelsSearchBtn:       () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Add Level dialog ------------------------------------------------
    levelDialog:           () => cy.findByRole('dialog'),

    // The label-then-walk-up strategy used elsewhere. The optional `\*?`
    // tolerates the `*` MUI appends to required-field labels (e.g. "Level Code *").
    levelCodeInput:        () =>
        cy.contains(/^level code\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    levelCreateBtn:        () => cy.findByRole('button', { name: /^create$/i }),
    levelCancelBtn:        () => cy.findByRole('button', { name: /^cancel$/i }),

    // ---- Level card helpers ----------------------------------------------
    // Identification is by the Level's CODE (e.g. "L-001") because Levels
    // have no Name. Same dual-:has scoping as bayCard / rowCard — Walk up
    // to the <Card> ancestor that contains BOTH the per-card Delete Level
    // icon AND the per-card "View & Manage Bins" drill-down button.
    //
    // The negative lookahead `(?!\d)` after the digits matters because the
    // rendered card stitches "Code: L-NNN" directly to the adjacent Chip's
    // "<n> Bins" text via textContent, producing strings like
    // "Code: L-0050 Bins". The lookahead keeps "L-005" from matching
    // longer codes like "L-0050".
    levelCard:             (code) =>
        cy.contains(new RegExp(`Code:\\s*${code}(?!\\d)`, 'i'))
          .parents(':has(button[aria-label="Delete Level"]):has(button:contains("View & Manage Bins"))')
          .first(),

    // Lightweight presence check by code text. The negative lookahead keeps
    // "Code: L-002" from matching when the body text reads
    // "Code: L-0020 Bins".
    levelCardText:         (code) =>
        cy.contains(new RegExp(`Code:\\s*${code}(?!\\d)`, 'i')),

    // ========================================================================
    // Bins Management page (sub-route per Level — leaf of the hierarchy)
    //
    // Bins are the FIRST tier that DOESN'T render as a Card grid — the page
    // uses material-react-table with rows-as-records. This means:
    //   - Lookup is by table-cell text (e.g. cy.contains('td', 'BN-1'))
    //     instead of an outer Card scope.
    //   - The Code column shows the FULL code (no prefix adornment) —
    //     the dialog's disabled input does too: `setCodeId(nextCode)`
    //     directly. So tests read whatever the input shows verbatim.
    //   - There is no drill-down — Bin is a leaf.
    //
    // Discovery findings (cross-checked against Frontend/src/pages/WMSBins.tsx):
    //   - URL:        /warehouse-management/locations/bins?…full id chain…
    //   - Heading:    "Bins in <LEVEL_CODE>"
    //   - Back btn:   "Back to Levels"
    //   - Add btn:    "Add Bin"
    //   - Search:     placeholder "Search code..." + "Search" button
    //                 (NO filter dropdown on this page).
    //   - Table:      MRT, columns Code, Status (Empty/Occupied chip),
    //                 Assignment ("View Contents"/"--"), Path, Actions
    //                 (View Label, Delete Bin).
    //   - Dialog:     "Add New Bin" — single Bin Code input (auto-generated,
    //                 disabled, FULL code e.g. "BN-1") + Cancel/Create.
    //   - Delete confirm: title "Confirm Delete", buttons Cancel/Delete.
    //
    // Bin codes use prefix "BN-" (Backend `getLocationPrefix(Bin)`). Padding
    // is 1 digit (BIN_PAD=1, so first nine bins are BN-1..BN-9, then BN-10).
    // Tests don't rely on exact format though — they read the disabled
    // dialog input or diff the table.
    // ========================================================================

    // ---- Page chrome (Bins) ----------------------------------------------
    binsPageHeading:       () => cy.findByRole('heading', { name: /^bins in /i }),
    backToLevelsBtn:       () => cy.findByRole('button', { name: /back to levels/i }),

    // ---- CRUD buttons ----------------------------------------------------
    addBinBtn:             () => cy.findByRole('button', { name: /^add bin$/i }),

    // No Edit at the Bin level. The icon button gets `aria-label="Delete
    // Bin"` via the wrapping <Tooltip title="Delete Bin">.
    deleteBinBtn:          () => cy.findByRole('button', { name: /delete bin/i }),

    // QR-code icon ("View Label") on each Bins-page row reuses the
    // top-of-file `viewLabelBtn` selector — same aria-label, same selector,
    // so we don't redefine it here. Page object methods that scope to a
    // bin row reach the icon via that shared locator.

    // ---- Bins search -----------------------------------------------------
    // Same placeholder as the upper code-only tiers; works the same way.
    binsSearchInput:       () => cy.get('input[placeholder*="Search code"]'),
    binsSearchBtn:         () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Add Bin dialog --------------------------------------------------
    binDialog:             () => cy.findByRole('dialog'),

    // The label-then-walk-up strategy used elsewhere. The optional `\*?`
    // tolerates the `*` MUI appends to required-field labels (e.g. "Bin Code *").
    binCodeInput:          () =>
        cy.contains(/^bin code\*?$/i)
          .parents(':has(input, textarea)')
          .first()
          .find('input, textarea')
          .first(),

    binCreateBtn:          () => cy.findByRole('button', { name: /^create$/i }),
    binCancelBtn:          () => cy.findByRole('button', { name: /^cancel$/i }),

    // ---- Table-row lookup by code ----------------------------------------
    // The bin's Code is rendered as a plain text cell in the MRT table.
    // We scope to <tr> via cy.contains('tr', code) so callers can chain
    // `.within()` to reach this row's Delete / View Label buttons.
    //
    // No negative lookahead is needed here — table cells render code
    // values inside their own <td> with no adjacent siblings polluting
    // textContent (the Status chip and Path live in OTHER <td>s within
    // the same row, separated by clear element boundaries).
    binRow:                (code) =>
        cy.contains('table tbody tr', new RegExp(`(?:^|[^\\w-])${code}(?![\\w-])`, 'i')),

    // Lightweight presence check by code text in the table body.
    binRowText:            (code) =>
        cy.contains('table tbody tr td', new RegExp(`(?:^|[^\\w-])${code}(?![\\w-])`, 'i')),

    // ---- QR-code dialog (opened by "View Label") --------------------------
    // Different role-scoped lookup so a test can assert it opened without
    // mixing it up with Add Bin / Delete confirm dialogs that share the
    // generic `cy.findByRole('dialog')` selector.
    qrCodeDialog:          () => cy.findByRole('dialog'),
};

export default warehouseLocationsLocators;
