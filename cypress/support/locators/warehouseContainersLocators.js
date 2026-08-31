// cypress/support/locators/warehouseContainersLocators.js
//
// Locators for the Warehouse Management → Containers page.
// Selector strategy mirrors warehouseLocationsLocators:
//   - Icon buttons → aria-label (set via wrapping <Tooltip>)
//   - Labelled buttons → button text
//   - Inputs → placeholder
//   - Filter selects → role + label
//
// The page renders no `data-testid` attributes today, so we lean on
// accessible names. If/when test ids land, swap selectors here only.

const warehouseContainersLocators = {
    // ---- Page chrome --------------------------------------------------------
    // The Containers page does NOT render a top-level <h1> heading. We
    // anchor on the Manage Types / Add Container / Assign To Location
    // toolbar buttons as the "did the page render" signal.
    manageTypesBtn:        () => cy.findByRole('button', { name: /^manage types$/i }),
    assignToLocationBtn:   () => cy.findByRole('button', { name: /^assign to location$/i }),
    addContainerBtn:       () => cy.findByRole('button', { name: /^add container$/i }),

    // ---- Filters / search row ----------------------------------------------
    // Type filter — MUI Select. The "Type" label is a sibling Typography
    // (NOT a real <label htmlFor=...>) so the Select has no accessible
    // name and cy.findByRole('combobox', { name: /type/i }) misses it.
    //
    // We anchor on the literal label text and walk to the next sibling
    // FormControl, then descend to the Select's clickable trigger
    // (rendered as a div with role="combobox" by MUI v7).
    typeSelect:            () =>
        cy.contains(/^Type$/i)
          .parent()
          .find('[role="combobox"]'),

    // A specific option inside the open Type dropdown menu, e.g. "All Types".
    // Pass the option's visible text. Used after opening typeSelect().
    typeOption:            (label) =>
        cy.findByRole('option', { name: new RegExp(`^${label}$`, 'i') }),

    // The free-text search input. Placeholder is the most reliable handle.
    searchInput:           () => cy.get('input[placeholder*="Enter container code"]'),

    // The contained "Search" button to the right of the search input.
    searchButton:          () => cy.findByRole('button', { name: /^search$/i }),

    // ---- Table (material-react-table) --------------------------------------
    // The grid root. MRT renders a single <table> on the page.
    table:                 () => cy.get('table'),

    // All visible column-header cells. Use to assert the documented column set.
    tableHeaders:          () => cy.get('table thead th'),

    // A specific column header by its visible label, e.g. "Code". Note the
    // discovery output shows headers as "Code0" / "Location0" / "Items0"
    // because MRT appends a sort-indicator counter when sorting is enabled.
    // Match leading-text only.
    tableHeader:           (name) => cy.contains('th', new RegExp(`^${name}`, 'i')),

    // All data rows in the body (excludes header).
    tableRows:             () => cy.get('table tbody tr'),

    // The "no data" fallback that MRT shows when the body is empty.
    tableEmptyMessage:     () =>
        cy.contains(/no records|no data|no results/i),

    // ---- Pagination --------------------------------------------------------
    // Footer controls rendered by MRT. The page uses the "pages" display
    // mode, so pagination renders as numbered page buttons + prev/next.
    rowsPerPageSelect:     () => cy.get('[id^="mrt-rows-per-page"]'),
    prevPageBtn:           () => cy.findByRole('button', { name: /go to previous page/i }),
    nextPageBtn:           () => cy.findByRole('button', { name: /go to next page/i }),

    // ---- Row-level actions (icon buttons inside a row's Actions cell) -------
    // Tests pass a row scope (e.g. cy.contains('tr', '<container code>'))
    // and call .within(() => warehouseContainersLocators.viewContentsBtn().click()).
    //
    // Discovery confirms these aria-labels (set by <Tooltip title="...">):
    //   View Contents · Merge · Stock Out · Delete · View Label
    viewContentsBtn:       () => cy.findByRole('button', { name: /^view contents$/i }),
    mergeBtn:              () => cy.findByRole('button', { name: /^merge$/i }),
    stockOutBtn:           () => cy.findByRole('button', { name: /^stock out$/i }),
    deleteRowBtn:          () => cy.findByRole('button', { name: /^delete$/i }),
    viewLabelBtn:          () => cy.findByRole('button', { name: /^view label$/i }),

    // Look up a row by its container code. The Code column renders the
    // container's code as a <Typography variant="subtitle2"> in a 2-line
    // stack with the type below it; cy.contains('tr', code) finds the
    // <tr> that contains that text.
    containerRow:          (code) =>
        cy.contains('table tbody tr', code),

    // Lightweight presence check by container code.
    containerRowText:      (code) =>
        cy.contains('table tbody tr td', code),

    // The Actions cell within a row identified by container code.
    // MRT renders row actions in their own <td>; we scope by the row
    // and pick the cell containing the action IconButtons (the only
    // <td> with multiple <button> children).
    actionsCellInRow:      (code) =>
        cy.contains('table tbody tr', code).find('td').filter(':has(button)').last(),

    // ========================================================================
    // Add Container dialog (containerForm.tsx — `mode === 'create'`)
    //
    // The form is a custom <Box> overlay (NOT an MUI <Dialog>), so it has
    // no role="dialog". Anchor on the heading text "Add Container" — the
    // text comes from <FormSecitonHeading text="Add Container">. The
    // overlay backdrop is the outer fixed Box with onClick={onClose}; the
    // inner content panel stops propagation, so clicks INSIDE the panel
    // don't dismiss it.
    // ========================================================================

    // The dialog's content panel — anchored on the heading. We walk to a
    // common ancestor that ALSO contains the Save button so .within()
    // scopes form-field clicks correctly. The toolbar also has a
    // <button>Add Container</button>, so we use `cy.contains(selector,
    // text)` with `:not(button)` to scope only to the dialog's heading
    // (a <span> rendered by Typography variant="formSection").
    addContainerDialog:    () =>
        cy.contains(':not(button)', /^Add Container$/i)
          .parents()
          .filter(':has(button:contains("Save"))')
          .first(),

    // The form heading. Used to assert "did the dialog open" without
    // requiring a role. NOTE: the toolbar also has a <button>Add
    // Container</button>, so we restrict to non-button elements
    // (the heading renders as a Typography/text node, not a button).
    addContainerHeading:   () =>
        cy.contains(':not(button)', /^Add Container$/i),

    // Type Select — same accessibility quirk as the page's filter (label
    // is a plain Typography, not a real <label>). Anchor on the label
    // text inside the dialog scope. Excludes the toolbar button match
    // (see addContainerDialog).
    typeSelectInDialog:    () =>
        cy.contains(':not(button)', /^Add Container$/i)
          .parents()
          .filter(':has(button:contains("Save"))')
          .first()
          .find('[role="combobox"]'),

    // Code ID input — disabled in create mode (auto-generated). The Input
    // component's label "Code ID" is a real <label>, so we walk up from
    // it to the wrapping field and grab the actual <input>.
    codeIdInput:           () =>
        cy.contains(/^Code ID\*?$/i)
          .parents(':has(input)')
          .first()
          .find('input')
          .first(),

    // Max Items input. Optional field, validates 1-10000.
    maxItemsInput:         () =>
        cy.contains(/^Max Items \(optional\)\*?$/i)
          .parents(':has(input)')
          .first()
          .find('input')
          .first(),

    // Inline error text shown beneath Max Items when invalid (e.g.
    // "Max items cannot exceed 10000").
    maxItemsError:         () =>
        cy.contains(/Enter a whole number greater than 0|Max items cannot exceed/i),

    // Save and Cancel are scoped via the dialog .within() — we expose
    // role-based accessors so tests can use them directly without the
    // dialog scope when uniqueness is fine.
    addContainerSaveBtn:   () => cy.findByRole('button', { name: /^save$/i }),
    addContainerCancelBtn: () => cy.findByRole('button', { name: /^cancel$/i }),

    // ========================================================================
    // Manage Container Types modal (WMSContainers.tsx — typeManager state)
    //
    // Same custom <Box> overlay shape as the Add Container dialog, anchored
    // on the heading "Manage Container Types". The overlay backdrop has
    // onClick={resetTypeManagerDialog}; the inner panel stops propagation.
    // ========================================================================

    manageTypesHeading:    () =>
        cy.contains(':not(button)', /^Manage Container Types$/i),

    // The dialog content panel — closest ancestor of the heading that also
    // contains the Save AND Close buttons (distinguishes it from the
    // backdrop wrapper).
    manageTypesDialog:     () =>
        cy.contains(':not(button)', /^Manage Container Types$/i)
          .parents()
          .filter(':has(button:contains("Save")):has(button:contains("Close"))')
          .first(),

    // "New Type" input. Real <label htmlFor="...">, but the Input
    // component doesn't pass an id, so we anchor on label text and walk
    // to the wrapping <Box> that contains the <input>. The label "New
    // Type" is unique on the page (the per-row Inputs use hideLabel).
    newTypeInput:          () =>
        cy.contains(/^New Type\*?$/i)
          .parents(':has(input)')
          .first()
          .find('input')
          .first(),

    newTypeError:          () =>
        cy.contains(/Only letters, numbers and single spaces between words/i),

    // The "Add" button INSIDE the modal. There's no other "Add" button
    // on screen when this modal is open, so the role-name match is safe.
    addTypeBtn:            () => cy.findByRole('button', { name: /^add$/i }),

    // The Save / Close buttons in the modal footer. Save here is
    // disambiguated from the Add Container Save by being inside the
    // manageTypesDialog scope.
    manageTypesSaveBtn:    () => cy.findByRole('button', { name: /^save$/i }),
    manageTypesCloseBtn:   () => cy.findByRole('button', { name: /^close$/i }),

    // The per-row Input + Delete IconButton stack. Each row has a
    // hidden-label Input pre-filled with the type's name. We can locate
    // a row by the Input's value (or via its surrounding Stack).
    //
    // For row-level operations we anchor on the input that CURRENTLY
    // shows `name`, then walk up to its Stack ancestor which also
    // contains the Delete IconButton.
    typeRowByName:         (name) =>
        cy.get(`input[value="${name}"]`),

    // The Delete icon button for a given type row. MUI's Tooltip wraps
    // the IconButton in a <span> with the tooltip title as aria-label —
    // but the title differs by inUse: "Delete" for editable rows,
    // "Cannot delete type in use" for in-use rows. So we anchor on the
    // span (any aria-label) that has a single <button> child — there's
    // only one such pattern per row.
    deleteTypeBtnInRow:    () => cy.get('span[aria-label] > button'),

    // ConfirmationDialog (real MUI <Dialog> with role="dialog") for type
    // deletion. The heading text is "Delete Container Type"; we scope by
    // the dialog title via :has() so the selector returns an empty set
    // (rather than throwing) when the dialog dismounts.
    deleteTypeDialog:      () =>
        cy.get('div[role="dialog"]:has(:contains("Delete Container Type"))'),
    deleteTypeYesBtn:      () =>
        cy.get('div[role="dialog"]:has(:contains("Delete Container Type"))')
          .findByRole('button', { name: /^yes$/i }),
    deleteTypeNoBtn:       () =>
        cy.get('div[role="dialog"]:has(:contains("Delete Container Type"))')
          .findByRole('button', { name: /^no$/i }),

    // ========================================================================
    // Row-action dialogs (View Contents · Merge · Stock Out · View Label · Delete)
    //
    // All but Delete are custom <Box> overlays — we anchor on heading text,
    // matching the same pattern used for the Add Container dialog.
    // ========================================================================

    // View Contents → Container Details overlay.
    viewContentsHeading:   () => cy.contains(':not(button)', /^Container Details$/i),
    viewContentsCloseBtn:  () => cy.findByRole('button', { name: /^close$/i }),

    // View Label → "Label for {code}" overlay.
    viewLabelHeading:      (code) =>
        cy.contains(':not(button)', new RegExp(`^Label for ${code}$`, 'i')),
    viewLabelCancelBtn:    () => cy.findByRole('button', { name: /^cancel$/i }),

    // "Print Zebra" button inside the View Label / QR modal. Triggers
    // ZPL generation + Printwise upload; the button shows
    // "Printing..." while the upload is in flight. Scope match covers
    // both labels.
    viewLabelPrintZebraBtn: () =>
        cy.findByRole('button', { name: /^(print zebra|printing\.\.\.)$/i }),
    // "Print A4" button inside the View Label modal — opens a new
    // window with the label preview for browser printing.
    viewLabelPrintA4Btn:   () => cy.findByRole('button', { name: /^print a4$/i }),

    // Merge → "Merge Container {code}" overlay. Same custom <Box>
    // overlay pattern as the other Container modals — anchored on
    // heading text. The form is mergeContainerForm.tsx and renders a
    // scan input (placeholder "Scan or type container code..." — note
    // this collides with the Assign-To-Location modal's scan input
    // when both happen to be open; since the Merge modal opens from a
    // row Action and no other modal can be open at the same time,
    // anchoring on the input's placeholder is unambiguous in practice).
    mergeHeading:          (code) =>
        cy.contains(':not(button)', new RegExp(`^Merge Container ${code}$`, 'i')),

    // The Merge dialog content panel — anchored on the heading. Walks
    // to a common ancestor that ALSO contains the Merge AND Cancel
    // footer buttons so .within() scopes cleanly. The buttons live in
    // the same Stack as the form fields.
    mergeDialog:           (code) =>
        cy.contains(':not(button)', new RegExp(`^Merge Container ${code}$`, 'i'))
          .parents()
          .filter(':has(button:contains("Merge")):has(button:contains("Cancel"))')
          .first(),

    // Scan input inside the Merge dialog. The placeholder matches the
    // Assign-To-Location modal's scan input too, but the Merge dialog
    // is mutually exclusive with Assign-To-Location so the selector is
    // unambiguous in test context.
    mergeScanInput:        () =>
        cy.get('input[placeholder*="Scan or type container code"]'),

    // Merge submit button — label is "Merge" (or "Moving..." while in
    // flight). Scoped via .within(mergeDialog) by the page object.
    mergeSubmitBtn:        () =>
        cy.findByRole('button', { name: /^(merge|moving\.\.\.)$/i }),
    mergeCancelBtn:        () => cy.findByRole('button', { name: /^cancel$/i }),

    // Delete confirmation — real MUI <Dialog> with heading "Confirm
    // Container Deletion". Scope by the title via :has() so the
    // selector resolves to an empty set (rather than throwing) when
    // the dialog has dismounted; that lets `should("not.exist")` work.
    deleteContainerDialog: () =>
        cy.get('div[role="dialog"]:has(:contains("Confirm Container Deletion"))'),
    deleteContainerYesBtn: () =>
        cy.get('div[role="dialog"]:has(:contains("Confirm Container Deletion"))')
          .findByRole('button', { name: /^yes$/i }),
    deleteContainerNoBtn:  () =>
        cy.get('div[role="dialog"]:has(:contains("Confirm Container Deletion"))')
          .findByRole('button', { name: /^no$/i }),

    // ========================================================================
    // Assign To Location modal (assignToLocationForm.tsx)
    //
    // Same custom Box overlay pattern as the other Container modals.
    // Anchored on heading text "Assign to Location".
    // ========================================================================

    assignToLocationHeading: () =>
        cy.contains(':not(button)', /^Assign to Location$/i),

    assignToLocationDialog:  () =>
        cy.contains(':not(button)', /^Assign to Location$/i)
          .parents()
          .filter(':has(button:contains("Assign")):has(button:contains("Cancel"))')
          .first(),

    // Container input — placeholder "Scan or type container code..." in Scan mode.
    assignContainerScanInput: () =>
        cy.get('input[placeholder*="Scan or type container code"]'),

    // Location input — placeholder "Scan or type location code..." in Scan mode.
    assignLocationScanInput:  () =>
        cy.get('input[placeholder*="Scan or type location code"]'),

    // Toggle buttons. Two pairs share the same labels (one per section);
    // the page object scopes via `.within()` over each Typography label
    // ("Select Container" / "Select Location").
    assignScanToggleBtn:      () =>
        cy.findAllByRole('button', { name: /^scan$/i }),
    assignSelectToggleBtn:    () =>
        cy.findAllByRole('button', { name: /^select from list$/i }),

    // ---- Scoped helpers for Select-From-List flow ---------------------
    // The dialog has two parallel sections ("Select Container" and
    // "Select Location"). Each section's heading Typography is the
    // immediate previous sibling of its ToggleButtonGroup (role="group").
    // Using .parents(':has([role="group"])').first() was too broad —
    // the nearest ancestor containing ANY toggle group also contains
    // the OTHER section's group, so findByRole('button') hit two
    // matches and threw. .next('[role="group"]') is the precise
    // sibling and gives us a single-toggle scope.
    assignContainerToggleGroup: () =>
        cy.contains(':not(button)', /^Select Container$/i)
          .next('[role="group"]'),

    assignLocationToggleGroup:  () =>
        cy.contains(':not(button)', /^Select Location$/i)
          .next('[role="group"]'),

    // The "Select From List" button inside the current `.within` scope.
    selectFromListToggleBtn:    () =>
        cy.findByRole('button', { name: /^select from list$/i }),

    // The matching scan-input TextField for each section. The Scan
    // input shares its section with the toggle group, but the
    // Autocomplete input mounts in place of the scan input — so we
    // anchor inputs by placeholder (unique across the dialog) rather
    // than scoping through the section.
    assignContainerSelectInput: () =>
        cy.get('input[placeholder*="Select container from list"]'),

    assignLocationSelectInput:  () =>
        cy.get('input[placeholder*="Search or select location"]'),

    // Footer Assign / Cancel buttons. Inside the dialog scope so we
    // don't collide with the "Cancel" inside other modals.
    assignAssignBtn:          () => cy.findByRole('button', { name: /^(assign|confirm assignment|assigning\.\.\.)$/i }),
    assignCancelBtn:          () => cy.findByRole('button', { name: /^cancel$/i }),

    // ========================================================================
    // Stock Out modal (StockOutModal.tsx — opened from a row's Stock Out icon)
    //
    // Real MUI <Dialog> rendered via IMSDialog. The title is two adjacent
    // Typography spans: "Stock Out" + container code. We anchor on the
    // role="dialog" that contains the literal "Stock Out" heading text.
    // The Reason field is a react-select CreatableSelect — we drive it
    // by clicking the input wrapper and selecting the first option in
    // the popup menu (react-select renders options as role="option").
    // ========================================================================

    // The Stock Out dialog root. Matches by role + heading text so the
    // selector returns an empty set (rather than throwing) after close.
    stockOutDialog:           () =>
        cy.get('div[role="dialog"]:has(:contains("Stock Out"))'),

    // The Stock Out dialog heading. Used to assert "did the modal open"
    // and to scope subsequent within-blocks.
    stockOutHeading:          () =>
        cy.contains('div[role="dialog"] :not(button)', /^Stock Out$/i),

    // The react-select input wrapper for "Reason". The CreatableSelect
    // renders a textbox inside a complex div tree; we anchor on the
    // "Reason" label inside the dialog and walk to the nearest react-
    // select control container (class "select__control" by default,
    // but we use a generic [class*="control"] match in case the
    // CSS-modules hash differs).
    stockOutReasonControl:    () =>
        cy.get('div[role="dialog"]')
          .contains(/^Reason$/i)
          .parent()
          .find('input[id*="react-select"]')
          .first(),

    // After clicking the control, react-select renders its menu as a
    // sibling div. Each option has role="option".
    stockOutReasonOption:     (label) =>
        cy.findAllByRole('option').filter(`:contains("${label}")`).first(),

    // First available reason option (for tests that just need "any
    // valid reason" without caring which).
    stockOutReasonAnyOption:  () => cy.findAllByRole('option').first(),

    // Footer Stock Out submit button. The button label is "Stock Out"
    // for both tabs (see StockOutModal.tsx line 917). Scope inside the
    // dialog so we don't collide with the row icon button (which has
    // aria-label "Stock Out" but is NOT inside the dialog).
    stockOutSubmitBtn:        () =>
        cy.get('div[role="dialog"]:has(:contains("Stock Out"))')
          .findByRole('button', { name: /^stock out$/i }),

    // ========================================================================
    // Container Audit Trail (containerAuditTrail.tsx — row clock icon)
    //
    // Rendered as the SIXTH icon in the Actions cell. The IconButton has
    // `title="View Audit Trail"` (NOT a Tooltip wrapper), so MUI sets
    // accessible-name via the title attribute. Opens an IMSDialog with
    // heading "Container Audit Trail (Code: {code})".
    // ========================================================================

    // Clock-icon button inside a row's Actions cell. Tests scope it via
    // .within(actionsCellInRow(code)).
    auditTrailBtnInRow:       () =>
        cy.get('button[title="View Audit Trail"]'),

    // The IMSDialog rendered when the audit trail icon is clicked. Title
    // contains the container's code so the assertion is unambiguous.
    auditTrailDialog:         (code) =>
        cy.get(`div[role="dialog"]:has(:contains("Container Audit Trail (Code: ${code})"))`),

    auditTrailHeading:        (code) =>
        cy.contains(new RegExp(`Container Audit Trail \\(Code: ${code}\\)`, 'i')),

    // The Close button inside IMSDialog. IMSDialog renders its own
    // close affordance — depending on its implementation this may be a
    // <button aria-label="close"> in the title bar OR a footer button.
    // Tests should close via `body.type('{esc}')` or by clicking the
    // close icon — we expose a best-effort matcher that finds either.
    auditTrailCloseBtn:       () =>
        cy.get(`div[role="dialog"]:has(:contains("Container Audit Trail"))`)
          .find('button[aria-label="close"], button:has([data-testid="CloseIcon"])')
          .first(),

    // ---- Audit trail content selectors -------------------------------------
    //
    // containerAuditTrail.tsx renders entries as a <ul>/<li> list
    // (NOT a <table>). Each <li> card contains <div> elements with a
    // <strong> label (rendered via formatStatus(key)) and a text value.
    // The allowed fields rendered per entry are: actionType, userName,
    // userEmail, createdBy, description, notes, comment, status,
    // createdAt, updatedAt, timestamp (from the whitelist in the TSX).
    //
    // Empty state is a plain <div> with text:
    //   "No audit logs found for this container."
    //
    // All selectors are scoped inside the open audit-trail IMSDialog.

    // All <li> entry cards inside the open audit trail dialog. Used to
    // assert at-least-N entries (use `.its('length').should('be.gte', N)`).
    auditTrailEntries:        () =>
        cy.get('div[role="dialog"]:has(:contains("Container Audit Trail"))').find('ul li'),

    // The empty-state message shown when a container has no audit events.
    auditTrailEmptyState:     () =>
        cy.get('div[role="dialog"]:has(:contains("Container Audit Trail"))')
          .contains(/No audit logs found for this container/i),

    // All <strong> label elements inside the audit trail dialog. Used to
    // assert that expected field labels (e.g. "Action Type", "Created At")
    // are rendered across at least one entry. The labels are formatted by
    // formatStatus() which converts camelCase keys to title-cased strings
    // (e.g. "actionType" → "Action Type", "createdAt" → "Created At").
    auditTrailLabels:         () =>
        cy.get('div[role="dialog"]:has(:contains("Container Audit Trail"))').find('li strong'),

    // ========================================================================
    // Row selection (MRT checkboxes) + bulk print dialog
    //
    // MRT renders standard checkboxes per row + a header "select all"
    // checkbox. Each has aria-label of either "Toggle select row" or
    // "Toggle select all". Selecting one or more rows surfaces a top-
    // toolbar "Print QR Codes" button + "Clear Selection" button (see
    // WMSContainers.tsx ~ line 752).
    // ========================================================================

    // Checkbox for the row that displays `code`. Scoped via
    // cy.contains('tr', code) → first <input type="checkbox">.
    rowSelectCheckbox:        (code) =>
        cy.contains('table tbody tr', code).find('input[type="checkbox"]').first(),

    // The "Toggle select all" checkbox in the header row.
    selectAllCheckbox:        () =>
        cy.get('table thead input[type="checkbox"]').first(),

    // The "Print QR Codes" button that surfaces in the top toolbar when
    // ≥1 row is selected.
    bulkPrintBtn:             () =>
        cy.findByRole('button', { name: /^print qr codes$/i }),

    // The "Clear Selection" button that surfaces alongside the bulk-print
    // button when ≥1 row is selected.
    clearSelectionBtn:        () =>
        cy.findByRole('button', { name: /^clear selection$/i }),

    // Bulk print dialog — real MUI <Dialog> with title "Print QR Codes".
    bulkPrintDialog:          () =>
        cy.get('div[role="dialog"]:has(:contains("Print QR Codes"))'),

    // The "Print to Zebra Thermal Printer" button inside the bulk-print
    // dialog. Triggers ZPL generation and Printwise upload.
    bulkPrintZebraBtn:        () =>
        cy.findByRole('button', { name: /^print to zebra thermal printer$/i }),

    bulkPrintCancelBtn:       () =>
        cy.get('div[role="dialog"]:has(:contains("Print QR Codes"))')
          .findByRole('button', { name: /^cancel$/i }),

    // Live "N selected" label that shows in the toolbar when rows are
    // selected.
    selectedCountLabel:       () => cy.contains(/^\d+ selected$/),
};

export default warehouseContainersLocators;
