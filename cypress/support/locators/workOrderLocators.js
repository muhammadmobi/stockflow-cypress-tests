// cypress/support/locators/workOrderLocators.js

const workOrderLocators = {
  // ── Breadcrumb ────────────────────────────────────────────────────────────

  // The Dashboard link inside the breadcrumb
  breadcrumbDashboardLink: (label = 'Dashboard') =>
    cy.findByRole('navigation', { name: /breadcrumb/i })
      .findByRole('link', { name: new RegExp(`^${label}$`, 'i') }),

  // The plain Typography (no link/role) for the current page label
  breadcrumbCurrentPageLabel: (text) =>
    cy.findByRole('navigation', { name: /breadcrumb/i })
      .findByText(text),

  // ── Search ────────────────────────────────────────────────────────────────

  searchInput: () => cy.findByPlaceholderText(/search/i),
  searchBtn: () => cy.findByRole('button', { name: /^search$/i }),

  // Matches "‹N› Result(s) for "‹query›"" rendered below the search field.
  searchResultLabel: (label) => cy.contains(new RegExp(`\\d+ ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)),

  // Matches the 'No Result' label shown below the search field when count is 0.
  noResultLabel: () => cy.findByText(/^No Result$/),

  // Matches the 'No records to display' message rendered inside the table body.
  noRecordsInTable: () => cy.findByText(/No records to display/i),

  // Matches any visible table cell containing the given text.
  tableCellContaining: (text) => cy.findAllByRole('cell').contains(text),

  // ── List View ────────────────────────────────────────────────────────────

  // A column header <th> by column name — used for visibility checks and sort interactions.
  columnHeader: (name) => cy.findByRole('columnheader', { name: new RegExp(name, 'i') }),

  // The WO# cell in the first data row — safe click target to trigger row navigation.
  firstRowWoCell: () => cy.get('tbody tr[data-index="0"] td[data-index="0"]'),

  // The View action button in the first data row.
  firstRowViewBtn: () =>
    cy.get('tbody tr[data-index="0"]').findByRole('button', { name: /^view$/i }),

  // The SO# <p> element containing the given text — click triggers AccountWise window.open.
  soCellContaining: (text) => cy.get('tbody td[data-index="1"] p').contains(text),

  // The Invoice# <p> element containing the given text — click triggers AccountWise window.open.
  invoiceCellContaining: (text) => cy.get('tbody td[data-index="2"] p').contains(text),

  // ── Status Transitions ────────────────────────────────────────────────────

  // Finds the <tr> whose WO# cell text (trimmed) exactly equals the given work order number.
  rowByWoNum: (woNum) =>
    cy.get('tbody td[data-index="0"]')
      .filter((i, el) => Cypress.$(el).text().trim() === woNum)
      .should('have.length.greaterThan', 0)
      .first()
      .closest('tr'),

  // The Open action button scoped inside a given row element.
  actionOpenBtn: ($row) => cy.wrap($row).findByRole('button', { name: /^open$/i }),

  // The Cancel action button scoped inside a given row element.
  actionCancelBtn: ($row) => cy.wrap($row).findByRole('button', { name: /^cancel$/i }),

  // The status text cell scoped inside a given row element.
  statusCellInRow: ($row) => cy.wrap($row).find('td[data-index="3"]'),

  // The SO# <p> (Typography) scoped inside a given row element — avoids Tooltip title bleed.
  soCellInRow: ($row) => cy.wrap($row).find('td[data-index="1"] p').first(),

  // The confirmation / Force Open dialog.
  confirmDialog: () => cy.findByRole('dialog'),

  // Yes button inside the confirmation dialog.
  confirmYesBtn: () => cy.findByRole('dialog').findByRole('button', { name: /^yes$/i }),

  // No button inside the confirmation dialog.
  confirmNoBtn: () => cy.findByRole('dialog').findByRole('button', { name: /^no$/i }),

  // ── Pagination ────────────────────────────────────────────────────────────

  // The MUI Select combobox for rows-per-page inside MRT_TablePagination.
  rowsPerPageSelect: () => cy.get('[aria-label="Rows per page"]'),

  // An option in the rows-per-page listbox dropdown.
  rowsPerPageOption: (value) => cy.get('ul[role="listbox"]').contains('li', String(value)),

  // A numbered page button inside the MUI Pagination nav (e.g., "2", "3").
  pageNumberBtn: (num) => cy.get('nav[aria-label="pagination navigation"]').contains('button', String(num)),

  // "Go to first page" icon button.
  firstPageBtn: () => cy.findByRole('button', { name: /go to first page/i }),

  // "Go to previous page" icon button.
  prevPageBtn: () => cy.findByRole('button', { name: /go to previous page/i }),

  // "Go to next page" icon button.
  nextPageBtn: () => cy.findByRole('button', { name: /go to next page/i }),

  // "Go to last page" icon button.
  lastPageBtn: () => cy.findByRole('button', { name: /go to last page/i }),

  // ── Create Work Order ─────────────────────────────────────────────────────

  // The "Create Work Order" button on the list page.
  createWorkOrderBtn: () => cy.findByRole('button', { name: /^create work order$/i }),

  // The page heading on the create work order page.
  createPageHeading: () => cy.findByRole('heading', { name: /^create work order$/i }),

  // The "Create Work Order" submit button on the create page.
  createSubmitBtn: () => cy.findByRole('button', { name: /^create work order$/i }),

  // The Product TextField on the create work order form (read-only, click to open modal).
  createProductField: () => cy.findByPlaceholderText(/click to select product/i),

  // The heading inside the "Add Product" modal dialog.
  addProductModalHeading: () => cy.findByRole('dialog').findByRole('heading', { name: /add product/i }),

  // Individual product <li> items inside the Add Product modal list.
  addProductModalListItems: () => cy.findByRole('dialog').find('ul li'),

  // The first visible "Available: N" label inside the Add Product modal.
  addProductModalAvailableQtyLabel: () => cy.findByRole('dialog').contains(/Available:/),

  // The "Add" button in the Add Product modal footer (visible before a product is selected).
  addProductModalAddBtn: () => cy.findByRole('dialog').findByRole('button', { name: /^add$/i }),

  // The first product <li> item inside the Add Product modal list.
  addProductModalProductItem: () => cy.findByRole('dialog').find('ul li').first(),

  // ── Create Work Order Form ────────────────────────────────────────────────

  // The "Add Product" button on the create form that appends a new product/quantity row.
  createAddProductRowBtn: () => cy.findByRole('button', { name: /^add product$/i }),

  // All delete (remove row) icon buttons on the create form — one per product row.
  // Uses the stable MUI class applied when color="error" is set on IconButton,
  // since data-testid on MUI icons is stripped in production/QA builds.
  createDeleteRowBtns: () => cy.get('button[class*="MuiIconButton-colorError"]'),

  // The "Available: N" stock info label below the product field on the create form.
  createFormAvailableLabel: () => cy.contains(/^Available:/),

  // The "Incoming: N" stock info label below the product field on the create form.
  createFormIncomingLabel: () => cy.contains(/^Incoming:/),

  // The Quantity TextField on the create work order form.
  createQuantityField: () => cy.findByRole('spinbutton', { name: /quantity/i }),

  // The quantity validation error message on the create work order form.
  createQuantityError: (errorText) => cy.contains(errorText),

  // The Work Order breadcrumb button on the create page (rendered as <button>, not <a>).
  breadcrumbWorkOrderLink: (label = 'Work Order') =>
    cy.findByRole('navigation', { name: /breadcrumb/i })
      .findByRole('button', { name: new RegExp(`^${label}$`, 'i') }),

  // A KeyValue label in the detail info section (rendered as "Label:").
  // 30s timeout because the detail page can be slow to render on QA.
  detailInfoLabel: (name) => cy.contains(`${name}:`, { timeout: 30000 }),

  // The Scan button on the first product row in the detail page table.
  detailTableScanBtn: () => cy.findAllByRole('button', { name: /^scan$/i }).first(),

  // The View Detail button on the first product row in the detail page table.
  detailTableViewDetailBtn: () => cy.findAllByRole('button', { name: /^view detail$/i }).first(),

  // The fullscreen Work Orders Scan dialog that opens when Scan is clicked.
  workOrdersScanModal: () => cy.findByRole('dialog'),

  // The DONE button in the Work Orders Scan modal footer.
  // It is rendered as a button with the literal label "DONE".
  workOrdersScanDoneBtn: () =>
    cy.findByRole('dialog').findByRole('button', { name: /^done$/i }),

  // The Serial Number text input rendered inside the Work Orders Scan modal's
  // ScanForm. The Input component uses id="serialnumber". 30s timeout to
  // outlast the dialog mount + ScanForm hydration on slow QA responses.
  workOrdersScanSerialInput: () =>
    cy.findByRole('dialog').find('#serialnumber', { timeout: 30000 }),

  // The Scan submit button inside the Work Orders Scan modal's ScanForm
  // (capitalize:capitalize on the IMSButton produces "Scan" text). 30s
  // timeout for the same reason as workOrdersScanSerialInput.
  workOrdersScanSubmitBtn: () =>
    cy.findByRole('dialog').findByRole('button', { name: /^scan$/i }, { timeout: 30000 }),

  // The "Scanned Items" header rendered by the ScanList component (both inside
  // the modal and on the Scanned Items page). Acts as the marker that ScanList
  // mounted. 30s timeout because /work-orders/scanned-items can take several
  // seconds on QA before the MRT renders.
  workOrdersScanListHeader: () => cy.contains(/^Scanned Items$/, { timeout: 30000 }),

  // A row inside the ScanList containing the given serial number text.
  // Scoped to MaterialReactTable rows so we don't match stray Typography.
  // 30s timeout because the ScanList fetches /work-orders/scanned-items and
  // the row may render late on a slow QA response.
  workOrdersScanListRowBySerial: (serialNumber) =>
    cy.get('table tbody tr', { timeout: 30000 })
      .filter((i, el) => Cypress.$(el).text().includes(serialNumber)),

  // The "Work Order Number" KeyValue label rendered at the top of the Scanned
  // Items page (WorkOrdersProductView). Used to assert page identity.
  scannedItemsPageWoLabel: () => cy.contains(/^Work Order Number:?$/, { timeout: 30000 }),

  // The "Name" KeyValue label rendered on the Scanned Items page once the
  // /products/:id call has populated commonColumns. Acts as a category-driven
  // header probe — present on every product type.
  scannedItemsPageNameLabel: () => cy.contains(/^Name:?$/, { timeout: 30000 }),

  // Any "Remove" action button rendered by ScanList for a scanned row.
  // For Closed/Cancelled WOs the disabled prop is true on every Remove button.
  workOrdersScanListRemoveBtn: () =>
    cy.findAllByRole('button', { name: /^remove$/i }),

  // The inline RHF validation error rendered under the Serial Number input
  // when the user submits an empty value ("Serial number is required").
  // Scoped to the Scan modal dialog so it is unambiguous. 30s timeout in case
  // RHF schedules the error render on the next microtask under heavy CPU.
  workOrdersScanModalSerialRequiredError: (text) =>
    cy.findByRole('dialog').findByText(text, undefined, { timeout: 30000 }),

  // The "Work Orders Scan" modal title (Typography in the dialog header).
  // Used by the modal-ready combined assertion in WorkOrderPage. 30s timeout
  // because MUI dialog mount + initial paint can take several seconds on QA.
  workOrdersScanModalTitle: (title) =>
    cy.findByRole('dialog').findByText(title, undefined, { timeout: 30000 }),

  // The "Scanned Items" header rendered by ScanList inside the modal. 30s
  // timeout because ScanList only mounts the header AFTER the
  // /work-orders/scanned-items query resolves -- a 3-5s response on QA would
  // exceed the default 4s and flake TC89.
  workOrdersScanModalListHeader: (text) =>
    cy.findByRole('dialog').findByText(text, undefined, { timeout: 30000 }),

  // The Stock Out button in the bottom toolbar of the detail page products table.
  detailStockOutBtn: () => cy.findByRole('button', { name: /^stock out$/i }),

  // The Status value in the detail info panel — resolves the sibling value Typography.
  detailStatusValue: (status) => cy.contains('Status:').parent().contains(status),
};

export default workOrderLocators;