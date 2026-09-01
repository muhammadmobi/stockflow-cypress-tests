// cypress/support/locators/warehouseRecycleBinLocators.js
//
// Locators for the Warehouse Management → Recycle Bin page.
// The page renders three tabs (Containers, Locations, Container Types),
// each backed by its own MRT table.
//
// Selector strategy mirrors sibling WMS locators:
//   - Icon buttons → aria-label (set via wrapping <Tooltip>)
//   - Labelled buttons → button text
//   - Tab panels → role="tab" + accessible name
//   - Page heading → h5 text content

const warehouseRecycleBinLocators = {
    // ---- Page chrome -------------------------------------------------------

    // The page heading "Recycle Bin" rendered as an h5.
    pageHeading:        () => cy.findByRole('heading', { name: /^Recycle Bin$/i }),

    // ---- Tab navigation ----------------------------------------------------

    // All three tabs by accessible role.
    containersTab:      () => cy.findByRole('tab', { name: /containers/i }),
    locationsTab:       () => cy.findByRole('tab', { name: /locations/i }),
    containerTypesTab:  () => cy.findByRole('tab', { name: /container types/i }),

    // ---- Tables (one per tab) ----------------------------------------------

    // The visible MRT table when any tab is active.
    table:              () => cy.get('table'),
    tableRows:          () => cy.get('table tbody tr'),
    tableHeaders:       () => cy.get('table thead th'),

    // A specific row containing the given text value (code or name).
    rowByCode:          (code) => cy.contains('table tbody tr', new RegExp(code, 'i')),

    // ---- Empty-state alerts ------------------------------------------------

    // Severity="success" Alert rendered when the tab's list is empty.
    emptyAlert:         () => cy.get('.MuiAlert-standardSuccess'),

    // ---- Row actions -------------------------------------------------------

    // "Restore Container" / "Restore Location" / "Restore Container Type"
    // icon buttons. Each is wrapped in a Tooltip with the aria label below.
    restoreContainerBtn:     () => cy.findByRole('button', { name: /restore container/i }),
    restoreLocationBtn:      () => cy.findByRole('button', { name: /restore location/i }),
    restoreContainerTypeBtn: () => cy.findByRole('button', { name: /restore container type/i }),

    // ---- Confirmation dialogs ----------------------------------------------
    // The shared ConfirmationDialog component. Tests scope assertions to
    // the heading text to distinguish Restore dialogs from each other.

    // Container restore dialog
    restoreContainerDialog:     () => cy.contains('[role="dialog"]', /restore container/i),
    restoreContainerConfirmBtn: () =>
        cy.contains('[role="dialog"]', /restore container/i)
          .findByRole('button', { name: /^yes$/i }),
    restoreContainerCancelBtn: () =>
        cy.contains('[role="dialog"]', /restore container/i)
          .findByRole('button', { name: /^no$/i }),

    // Location restore dialog
    restoreLocationDialog:     () => cy.contains('[role="dialog"]', /restore location/i),
    restoreLocationConfirmBtn: () =>
        cy.contains('[role="dialog"]', /restore location/i)
          .findByRole('button', { name: /^yes$/i }),
    restoreLocationCancelBtn: () =>
        cy.contains('[role="dialog"]', /restore location/i)
          .findByRole('button', { name: /^no$/i }),

    // Container Type restore dialog
    restoreTypeDialog:     () => cy.contains('[role="dialog"]', /restore container type/i),
    restoreTypeConfirmBtn: () =>
        cy.contains('[role="dialog"]', /restore container type/i)
          .findByRole('button', { name: /^yes$/i }),
    restoreTypeCancelBtn: () =>
        cy.contains('[role="dialog"]', /restore container type/i)
          .findByRole('button', { name: /^no$/i }),

    // ---- Global filter (MRT built-in global search) ------------------------
    // MRT's global-filter text field is rendered with aria-label "Search"
    // when enableGlobalFilter=true and enableTopToolbar=false (the RecycleBin
    // page sets both of those). We can also match on the rendered input type.
    globalFilterInput:  () => cy.get('input[aria-label="Search"]').first(),
};

module.exports = warehouseRecycleBinLocators;
