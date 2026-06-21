// cypress/pageObjects/WorkOrderPage.js

import workOrderLocators from '../support/locators/workOrderLocators';
import urls from '../fixtures/urls.json';
import workOrderData from '../fixtures/workOrderData.json';

const API_BASE_URL = Cypress.env('API_BASE_URL');

// Wrap cy.request with retry on transient errors (502/503/504/timeout) and a
// 60s per-request timeout. The QA server is flaky -- without this, random
// requests fail and kill before() hooks. Always returns a resolved chain so
// callers can .then() on the final response. After maxRetries the last
// response is returned as-is so callers can decide how to handle it.
export function workOrderRequestWithRetry(options, label, maxRetries = 3) {
  const attempt = (retriesLeft) => {
    return cy.request({
      ...options,
      failOnStatusCode: false,
      timeout: options.timeout ?? 60000,
    }).then((resp) => {
      const isTransient = [502, 503, 504].includes(resp.status) || resp.status === 0;
      if (isTransient && retriesLeft > 0) {
        Cypress.log({
          name: 'workOrderRequestWithRetry',
          message: `${label} returned ${resp.status} -- retrying (${retriesLeft} left)`,
        });
        cy.wait(3000);
        return attempt(retriesLeft - 1);
      }
      return resp;
    });
  };
  return attempt(maxRetries);
}

class WorkOrderPage {
      // Helper: Navigates to create page, opens product modal, waits for modal visible
      // and waits for the initial product list to load (the modal fires a /products
      // request on open -- without this wait TC49/TC50 see an empty list).
      openProductModalInCreateForm() {
        this.clickCreateWorkOrderBtn();
        this.clickProductField();
        this.verifyAddProductModalVisible();
        // Wait for products to load -- DOM assertion with a long timeout is more
        // reliable than an intercept alias here because **/products** can match
        // other in-flight requests and resolve the alias before the modal's own
        // request completes.
        cy.findByRole('dialog').find('ul li', { timeout: 60000 }).should('have.length.greaterThan', 0);
      }
    // Helper: Navigates to create page, opens product modal, waits for list, selects first product.
    // The modal fires GET /products on open -- we wait for at least one li to appear in the DOM
    // rather than waiting on an intercept alias, because the **/products** pattern is broad enough
    // to match other in-flight requests and resolve the alias prematurely. Uses a 60s timeout
    // because the QA /products endpoint can be slow to respond.
    selectFirstProductInCreateForm() {
      this.clickCreateWorkOrderBtn();
      this.clickProductField();
      this.verifyAddProductModalVisible();
      cy.findByRole('dialog').find('ul li', { timeout: 60000 }).should('have.length.greaterThan', 0);
      this.clickProductInModal();
    }
  // -- Breadcrumb -----------------------------------------------------------

  // Verifies the breadcrumb shows the Dashboard link and the current page label.
  verifyBreadcrumb(dashboardLabel, currentPageLabel) {
    workOrderLocators.breadcrumbDashboardLink(dashboardLabel)
      .should('be.visible')
      .and('have.attr', 'href', '/dashboard');
    workOrderLocators.breadcrumbCurrentPageLabel(currentPageLabel)
      .should('be.visible');
  }

  // Clicks the Dashboard link in the breadcrumb.
  clickBreadcrumbDashboard() {
    workOrderLocators.breadcrumbDashboardLink().click();
  }

  // -- Navigation ----------------------------------------------------------

  // Visit the WO list page. Waits for the table or empty-state to render so
  // subsequent actions don't race against the initial /work-orders fetch.
  visit() {
    cy.visit(urls.workOrders);
    // Either the table has rows OR the no-records label is visible — both
    // count as "page is settled". Long timeout for slow QA bundle + API.
    cy.get('body', { timeout: 60000 }).should(($body) => {
      const hasRows = $body.find('tbody tr[data-index]').length > 0;
      const hasEmpty = $body.text().includes('No records to display');
      expect(hasRows || hasEmpty, 'WO list page rendered (rows or empty state)').to.be.true;
    });
  }

  // Fetches up to 300 work orders via API and returns the first available
  // WO#, SO#, and Invoice# as search terms.
  // Visits the page first so window.localStorage (used by getAuthToken) is
  // accessible -- avoids the about:blank context that getAllLocalStorage can't
  // reliably read after a session restore.
  // Returns null for any field where no populated record exists in the dataset.
  fetchSearchTerms() {
    this.visit();
    return cy.getAuthToken().then((token) => {
      expect(token, 'Admin access token must be present in localStorage').to.exist;

      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/work-orders?page=1&pageSize=300`,
        headers: { Authorization: `Bearer ${token}` },
      }, 'GET /work-orders?pageSize=300').then((resp) => {
        const list = resp.body?.data?.list ?? [];
        const woTerm   = list[0]?.workOrderNumber ?? null;
        // Only pick a WO whose SO# cell will actually be a clickable link.
        // The Frontend renders the SO cell as a link only when saleOrderId
        // (the AccountWise UUID) is populated -- saleOrderNumber alone (which
        // our test-created SOs have) produces a plain, non-clickable cell.
        const soItem   = list.find((wo) => wo.saleOrderNumber?.trim() && wo.saleOrderId?.trim());
        // Invoice cell is a link for any WO with a non-empty invoiceNumber --
        // no invoiceId gating in the Frontend (unlike SO which gates on saleOrderId).
        const invItem  = list.find((wo) => wo.invoiceNumber?.trim());
        return {
          woTerm,
          soTerm:      soItem?.saleOrderNumber  ?? null,
          invoiceTerm: invItem?.invoiceNumber   ?? null,
        };
      });
    });
  }

  // Creates a fresh StockWise Open work order via API and returns its work order number.
  // Must be called while an admin session is active (token present in localStorage).
  createViaApi() {
    return this.createViaApiWithId().then(({ woNum }) => woNum);
  }

  // Same as createViaApi() but also returns the numeric DB id needed for detail URLs.
  // Picks the first pure product (hasItems=false, hasVariants=false) with at least
  // 1 unit of available stock so that TC66 (bulk-stockout on this WO) succeeds.
  // Falls back to any product if no such product is found within the first 5 pages.
  createViaApiWithId() {
    return cy.getAuthToken().then((token) => {
      expect(token, 'Admin access token must be present in localStorage').to.exist;

      const findProduct = (page) => {
        return workOrderRequestWithRetry({
          method: 'GET',
          url: `${API_BASE_URL}/products?page=${page}&page_size=50`,
          headers: { Authorization: `Bearer ${token}` },
        }, `GET /products?page=${page}`).then((productResp) => {
          const list = productResp.body?.data?.list ?? [];
          const totalPages = Number(productResp.body?.data?.pagination?.pages ?? 0);
          const match = list.find(
            (p) => p?.id && !p.hasItems && !p.hasVariants && Number(p.availableQuantity ?? 0) >= 1,
          );
          if (match) return match;
          if (page >= 5 || page >= totalPages) {
            // Fallback: take the very first product returned from page 1.
            return workOrderRequestWithRetry({
              method: 'GET',
              url: `${API_BASE_URL}/products?page=1&page_size=1`,
              headers: { Authorization: `Bearer ${token}` },
            }, 'GET /products?page=1&page_size=1 (fallback)').then((r) => r.body?.data?.list?.[0]);
          }
          return findProduct(page + 1);
        });
      };

      return findProduct(1).then((product) => {
        expect(product, 'At least one product must exist to create a work order').to.exist;

        return workOrderRequestWithRetry({
          method: 'POST',
          url: `${API_BASE_URL}/work-orders`,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            status: 'Open',
            products: [{
              productId: product.id,
              name: product.name || 'Test Product',
              partNumber: product.partNumber || product.name || 'TEST-PART',
              quantity: 1,
            }],
          },
        }, 'POST /work-orders').then((resp) => {
          const woNum = resp.body?.data?.workOrderNumber;
          const id = resp.body?.data?.id;
          expect(woNum, 'Created work order must have a workOrderNumber').to.exist;
          expect(id, 'Created work order must have an id').to.exist;
          return { woNum, id };
        });
      });
    });
  }

  // Navigates directly to the work order detail page.
  visitDetail(woNum, id) {
    cy.visit(`/work-order/${woNum}/${id}`);
  }

  // Finds the first WO of a given status via API and returns { woNum, id }.
  // Used by detail-view tests that need a Closed, Cancelled, or Draft WO.
  // Uses the dedicated ?status= filter (exact SQL equality) rather than the
  // free-text ?search= param, and asserts the returned record actually carries
  // that status before returning -- guards against a backend change silently
  // delivering a mismatched record.
  // Returns null when no WO with the requested status exists so callers can
  // call this.skip() instead of letting the hard assert fail the test.
  // Finds the first WO with the given status AND a populated saleOrderId
  // (i.e. truly AccountWise-approved, not just any WO with a saleOrderNumber).
  // Returns null when none exist so callers can this.skip().
  // TC18/TC19 need this because the Cancel button is disabled only when
  // saleOrderId !== null — a WO with saleOrderNumber-only (test-created) has
  // Cancel enabled, which breaks the test if we pick it.
  findWoWithSaleOrderIdByStatus(status) {
    return cy.getAuthToken().then((token) => {
      // Pull a generous page of WOs at this status and find the first one
      // whose saleOrderId is non-null in the API response.
      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/work-orders?status=${encodeURIComponent(status)}&page=1&pageSize=200`,
        headers: { Authorization: `Bearer ${token}` },
      }, `GET /work-orders?status=${status} (saleOrderId scan)`).then((resp) => {
        const list = resp.body?.data?.list ?? [];
        const wo = list.find((w) => w.saleOrderId && String(w.saleOrderId).trim() !== '');
        if (!wo) return null;
        return { woNum: wo.workOrderNumber, saleOrderNumber: wo.saleOrderNumber };
      });
    });
  }

  findWoDetailByStatus(status) {
    return cy.getAuthToken().then((token) => {
      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/work-orders?status=${encodeURIComponent(status)}&page=1&pageSize=1`,
        headers: { Authorization: `Bearer ${token}` },
      }, `GET /work-orders?status=${status}`).then((resp) => {
        const wo = resp.body?.data?.list?.[0];
        if (!wo) return null;
        if (wo.status !== status) return null;
        return { woNum: wo.workOrderNumber, id: wo.id };
      });
    });
  }

  // Asserts the Stock Out button in the products table bottom toolbar is disabled.
  verifyStockOutBtnDisabled() {
    workOrderLocators.detailStockOutBtn().should('be.disabled');
  }

  // Asserts the Scan button on the first product row is disabled.
  verifyScanBtnDisabled() {
    cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
    workOrderLocators.detailTableScanBtn().should('be.disabled');
  }

  // Asserts every info label in the detail page info section is visible.
  verifyDetailInfoLabelsVisible(labels) {
    labels.forEach((label) => {
      workOrderLocators.detailInfoLabel(label).should('be.visible');
    });
  }

  // Clicks the Scan button on the first product row -- waits for the table to load first.
  clickScanBtn() {
    cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
    workOrderLocators.detailTableScanBtn().click();
  }

  // Asserts the Work Orders Scan fullscreen modal is visible.
  verifyWorkOrdersScanModalVisible() {
    workOrderLocators.workOrdersScanModal()
      .should('be.visible')
      .findByText(/work orders scan/i)
      .should('be.visible');
  }

  // Clicks the View Detail button on the first product row -- waits for the table to load first.
  clickViewDetailBtn() {
    cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
    workOrderLocators.detailTableViewDetailBtn().click();
  }

  // Clicks the Stock Out button in the detail page products table bottom toolbar.
  clickStockOutBtn() {
    cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
    workOrderLocators.detailStockOutBtn().click();
  }

  // Asserts the status value in the detail info panel matches the expected status.
  verifyDetailStatus(status) {
    workOrderLocators.detailStatusValue(status).should('be.visible');
  }

  // Asserts the breadcrumb on the detail page shows Dashboard â†’ Work Order â†’ WO Number.
  verifyDetailBreadcrumb(dashboardLabel, workOrderLabel, currentLabel) {
    workOrderLocators.breadcrumbDashboardLink(dashboardLabel)
      .should('be.visible')
      .and('have.attr', 'href', '/dashboard');
    workOrderLocators.breadcrumbWorkOrderLink(workOrderLabel)
      .should('be.visible');
    workOrderLocators.breadcrumbCurrentPageLabel(currentLabel).should('be.visible');
  }

  // -- Search -----------------------------------------------------------------

  typeSearch(term) {
    workOrderLocators.searchInput().clear().type(term);
  }

  submitSearch() {
    workOrderLocators.searchBtn().click();
  }

  // Verifies the result label below the search field is visible.
  // label comes from fixture â€“ the fixed suffix of the result text.
  verifySearchResultLabel(label) {
    workOrderLocators.searchResultLabel(label).should('be.visible');
  }

  // Verifies the 'No Result' label is visible (search returned 0 results).
  verifyNoResultLabel() {
    workOrderLocators.noResultLabel().should('be.visible');
  }

  // Verifies the 'No records to display' message is visible inside the table.
  verifyNoRecordsInTable() {
    workOrderLocators.noRecordsInTable().should('be.visible');
  }

  // Verifies at least one table cell contains the given text.
  verifyTableContains(text) {
    workOrderLocators.tableCellContaining(text).should('be.visible');
  }

  // -- List View -----------------------------------------------------------

  // Clicks the MRT sort trigger for the given column header.
  clickColumnSort(columnName) {
    workOrderLocators.columnHeader(columnName)
      .find('span')
      .first()
      .click({ force: true });
  }

  // Asserts the aria-sort on the column header equals the expected direction.
  verifyColumnSortDirection(columnName, direction) {
    if (direction === 'none') {
      workOrderLocators.columnHeader(columnName)
        .should(($th) => {
          const attr = $th.attr('aria-sort');
          expect(attr === undefined || attr === 'none', `Expected no sort on "${columnName}"`).to.be.true;
        });
    } else {
      workOrderLocators.columnHeader(columnName)
        .should('have.attr', 'aria-sort', direction);
    }
  }

  // Returns the text of the status cell in the first data row.
  getFirstStatusValue() {
    return cy.get('tbody tr[data-index="0"] td[data-index="3"]').invoke('text').invoke('trim');
  }

  // Asserts each expected column header is visible.
  verifyAllColumnsVisible(columns) {
    columns.forEach((col) => {
      workOrderLocators.columnHeader(col).should('be.visible');
    });
  }

  // Clicks the WO# cell in the first row to trigger row navigation.
  clickFirstRow() {
    workOrderLocators.firstRowWoCell().click();
  }

  // Clicks the View action button in the first row.
  clickFirstViewBtn() {
    workOrderLocators.firstRowViewBtn().click();
  }

  // Clicks the SO# cell containing the given term.
  clickSoCellContaining(text) {
    workOrderLocators.soCellContaining(text).click();
  }

  // Clicks the Invoice# cell containing the given term.
  clickInvoiceCellContaining(text) {
    workOrderLocators.invoiceCellContaining(text).click();
  }

  // -- Status Transitions --------------------------------------------------

  // Finds the first row where status matches AND the SO# / Invoice#
  // presence matches the given flags.
  // Searches by status first so server-side pagination returns only relevant rows.
  // hasSo:      true = SO# present (not '--'/empty), false = SO# absent, null = don't check.
  // hasInvoice: true = Invoice# present, false = Invoice# absent, null = don't check.
  //
  // Why hasInvoice exists: the WO list now contains Open WOs created three
  // ways -- by StockWise UI (no SO, no Invoice), by AccountWise sales order
  // (has SO), and by AccountWise invoice (has Invoice, no SO). The Cancel
  // button is only enabled for the first of these. Tests that need a
  // truly-StockWise-created WO must pass hasSo:false AND hasInvoice:false.
  //
  // Returns null (wrapped in a Cypress chain) when no matching row is found so
  // callers can call this.skip() instead of letting the hard assert fail the
  // test -- principle #6 (context-dependent testing): environmental absence is
  // not a defect.
  findRowByCriteria(status, hasSo = null, hasInvoice = null) {
    // Filter the table to show only rows with this status before scanning.
    // Scope the intercept to search-scoped requests only so we don't resolve
    // on a stale page-load /work-orders request.
    cy.intercept('GET', `**/work-orders?*search=${encodeURIComponent(status)}*`).as('filteredWorkOrders');
    workOrderLocators.searchInput().clear().type(status);
    workOrderLocators.searchBtn().click();
    cy.wait('@filteredWorkOrders', { timeout: 30000 });

    // If the search returns no rows at all the table shows 'No records'. In
    // that case return null immediately rather than asserting length > 0.
    return cy.get('body').then(($body) => {
      const noRecords = $body.find('[data-testid="table-empty"], [class*="noRecords"]').length > 0
        || $body.text().includes('No records to display');

      if (noRecords) return cy.wrap(null);

      return cy.get('tbody tr[data-index]', { timeout: 30000 })
        .then(($rows) => {
          if ($rows.length === 0) return cy.wrap(null);

          const target = $rows.toArray().find((row) => {
            const statusText = (
              row.querySelector('td[data-index="3"] p')?.textContent ||
              row.querySelector('td[data-index="3"]')?.textContent || ''
            ).trim();

            const soText = (
              row.querySelector('td[data-index="1"] p')?.textContent ||
              row.querySelector('td[data-index="1"]')?.textContent || ''
            ).trim();

            const invoiceText = (
              row.querySelector('td[data-index="2"] p')?.textContent ||
              row.querySelector('td[data-index="2"]')?.textContent || ''
            ).trim();

            const soAbsent = soText === '--' || soText === '';
            const invoiceAbsent = invoiceText === '--' || invoiceText === '';
            const statusMatch = statusText.includes(status);
            const soMatch = hasSo === null ? true : hasSo ? !soAbsent : soAbsent;
            const invoiceMatch = hasInvoice === null ? true : hasInvoice ? !invoiceAbsent : invoiceAbsent;
            return statusMatch && soMatch && invoiceMatch;
          });

          if (!target) return cy.wrap(null);
          return cy.wrap(Cypress.$(target));
        });
    });
  }

  // Finds the row whose WO# cell contains the given work order number.
  findRowByWoNum(woNum) {
    return workOrderLocators.rowByWoNum(woNum);
  }

  // Finds the row whose Invoice# cell exactly equals the given invoice number (after trim).
  findRowByInvoiceNum(invoiceNum) {
    return cy.get('tbody td[data-index="2"]')
      .filter((i, el) => Cypress.$(el).text().trim() === invoiceNum)
      .first()
      .closest('tr');
  }

  // Verifies the invoice number cell in the given row matches.
  verifyInvoiceInRow($row, invoiceNum) {
    cy.wrap($row).find('td[data-index="2"]').should('contain.text', invoiceNum);
  }

  // Finds the row whose Sales Order# cell exactly equals the given sale order number (after trim).
  findRowBySaleOrderNum(soNum) {
    return cy.get('tbody td[data-index="1"]')
      .filter((i, el) => Cypress.$(el).text().trim() === soNum)
      .first()
      .closest('tr');
  }

  // Verifies the sales order number cell in the given row matches.
  verifySaleOrderInRow($row, soNum) {
    cy.wrap($row).find('td[data-index="1"]').should('contain.text', soNum);
  }

  // Types the WO number into the search box, submits, and waits for the search-scoped API response.
  // Uses a specific intercept on '**/work-orders?*search=*' so the wait only matches the search
  // request (not the page-load /work-orders?pageSize=75). 30s timeout for slow QA responses.
  searchByWoNum(woNum) {
    cy.intercept('GET', `**/work-orders?*search=${encodeURIComponent(woNum)}*`).as('searchByWo');
    workOrderLocators.searchInput().clear().type(woNum);
    workOrderLocators.searchBtn().click();
    cy.wait('@searchByWo', { timeout: 30000 });
    cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
  }

  // Verifies the status of a specific WO row by re-querying the DOM fresh (avoids stale $row).
  // Use this after searchByWoNum to avoid DOM detachment issues.
  verifyStatusByWoNum(woNum, status) {
    cy.get('tbody td[data-index="0"]')
      .filter((i, el) => Cypress.$(el).text().trim() === woNum)
      .first()
      .closest('tr')
      .find('td[data-index="3"]')
      .should('contain.text', status);
  }

  // Asserts the Open button in a row is enabled or disabled.
  verifyOpenBtnEnabled($row, enabled) {
    workOrderLocators.actionOpenBtn($row).should(enabled ? 'not.be.disabled' : 'be.disabled');
  }

  // Asserts the Cancel button in a row is enabled or disabled.
  verifyCancelBtnEnabled($row, enabled) {
    workOrderLocators.actionCancelBtn($row).should(enabled ? 'not.be.disabled' : 'be.disabled');
  }

  // Asserts the status cell in a row contains the given status text.
  verifyStatusInRow($row, status) {
    workOrderLocators.statusCellInRow($row).should('contain.text', status);
  }

  // Asserts the SO# cell in a row is populated (present=true) or shows '--'/empty (present=false).
  verifySoInRow($row, present) {
    workOrderLocators.soCellInRow($row).invoke('text').then((t) => {
      const val = t.trim();
      if (present) {
        expect(val).to.not.match(/^(--|)$/);
      } else {
        expect(val).to.match(/^(--|)$/);
      }
    });
  }

  // Clicks the Cancel action button inside the given row.
  clickCancelBtn($row) {
    workOrderLocators.actionCancelBtn($row).click();
  }

  // Clicks the Open action button inside the given row.
  clickOpenBtn($row) {
    workOrderLocators.actionOpenBtn($row).click();
  }

  // Asserts the confirmation dialog is visible and fully rendered.
  // Checking the Yes button ensures the MUI enter animation has completed.
  verifyConfirmDialogVisible() {
    workOrderLocators.confirmYesBtn().should('be.visible');
  }

  // Asserts the confirmation dialog is no longer present.
  verifyConfirmDialogNotVisible() {
    workOrderLocators.confirmDialog().should('not.exist');
  }

  // Asserts a toast message with the given text is visible.
  verifyToast(message) {
    cy.contains(message, { timeout: 30000 }).should('be.visible');
  }

  // Clicks the Yes button in the confirmation dialog.
  clickConfirmYes() {
    workOrderLocators.confirmYesBtn().click();
  }

  // Clicks the No button in the confirmation dialog.
  clickConfirmNo() {
    workOrderLocators.confirmNoBtn().click();
  }

  // -- Create Work Order -------------------------------------------------------------

  // Clicks the Create Work Order button on the list page.
  clickCreateWorkOrderBtn() {
    workOrderLocators.createWorkOrderBtn().click();
  }

  // Asserts the page heading on the create work order page is visible.
  verifyCreatePageHeading() {
    workOrderLocators.createPageHeading().should('be.visible');
  }

  // Asserts the Create Work Order submit button is disabled.
  verifyCreateSubmitBtnDisabled() {
    workOrderLocators.createSubmitBtn().should('be.disabled');
  }

  // Clicks the Create Work Order submit button to submit the form.
  clickCreateSubmitBtn() {
    workOrderLocators.createSubmitBtn().click();
  }

  // Clicks the Product field on the create work order form to open the Add Product modal.
  clickProductField() {
    workOrderLocators.createProductField().click();
  }

  // Asserts the "Add Product" modal is visible.
  verifyAddProductModalVisible() {
    workOrderLocators.addProductModalHeading().should('be.visible');
  }

  // Asserts the product list inside the Add Product modal has at least one item.
  // Uses a 60s timeout because the QA /products endpoint can be slow to respond.
  verifyAddProductModalListVisible() {
    cy.findByRole('dialog').find('ul li', { timeout: 60000 }).should('have.length.greaterThan', 0);
  }

  // Asserts the "Available: N" label is visible inside the Add Product modal.
  verifyAddProductModalAvailableQtyVisible() {
    workOrderLocators.addProductModalAvailableQtyLabel().should('be.visible');
  }

  // Clicks the "Add" button in the Add Product modal without selecting a product.
  clickAddProductModalAddBtn() {
    workOrderLocators.addProductModalAddBtn().click();
  }

  // Clicks the first product item in the Add Product modal list.
  clickProductInModal() {
    workOrderLocators.addProductModalProductItem().click();
  }

  // Asserts the first product in the modal list is visually selected (green border applied).
  verifyProductInModalSelected() {
    workOrderLocators.addProductModalProductItem()
      .invoke('css', 'border-left-color')
      .should('not.equal', 'rgba(0, 0, 0, 0)');
  }

  // Asserts the Add Product modal has been removed from the DOM (unmounts on close).
  verifyAddProductModalNotVisible() {
    workOrderLocators.confirmDialog().should('not.exist');
  }

  // Asserts the product field on the create form has a non-empty value (product was added).
  verifyProductFieldHasValue() {
    workOrderLocators.createProductField().should('not.have.value', '');
  }

  // Asserts the "Available: N" and "Incoming: N" labels are visible below the product field.
  verifyStockInfoVisible() {
    workOrderLocators.createFormAvailableLabel().should('be.visible');
    workOrderLocators.createFormIncomingLabel().should('be.visible');
  }

  // Types a value into the Quantity field on the create work order form.
  typeQuantity(value) {
    workOrderLocators.createQuantityField().clear().type(value);
  }

  // Asserts the Quantity field has an empty value (e.g. after typing non-numeric input).
  verifyQuantityFieldEmpty() {
    workOrderLocators.createQuantityField().should('have.value', '');
  }

  // Reads the available quantity from the stock info label and returns it via a Cypress chain.
  getAvailableQuantity() {
    return workOrderLocators.createFormAvailableLabel().invoke('text').then((text) => {
      return parseInt(text.replace('Available:', '').trim(), 10);
    });
  }

  // Asserts the quantity validation error appears for the given available quantity.
  verifyQuantityExceedsError(availableQty) {
    const errorText = `${workOrderData.createForm.validationErrors.quantityExceedsStock} (${availableQty} available)`;
    workOrderLocators.createQuantityError(errorText).should('be.visible');
  }

  // Asserts the Create Work Order submit button is enabled.
  verifyCreateSubmitBtnEnabled() {
    workOrderLocators.createSubmitBtn().should('not.be.disabled');
  }

  // Asserts the delete button on the single default row is disabled.
  verifyDeleteRowBtnDisabled() {
    workOrderLocators.createDeleteRowBtns().first().should('be.disabled');
  }

  // Clicks the "Add Product" button on the form to append a new product/quantity row.
  clickAddProductRowBtn() {
    workOrderLocators.createAddProductRowBtn().click();
  }

  // Asserts every delete button on the form is enabled (i.e. more than one row exists).
  verifyDeleteRowBtnsEnabled() {
    workOrderLocators.createDeleteRowBtns().each(($btn) => {
      cy.wrap($btn).should('not.be.disabled');
    });
  }

  // Asserts the breadcrumb on the create page shows Dashboard â†’ Work Order â†’ current label.
  verifyCreateBreadcrumb(dashboardLabel, workOrderLabel, currentLabel) {
    workOrderLocators.breadcrumbDashboardLink(dashboardLabel)
      .should('be.visible')
      .and('have.attr', 'href', '/dashboard');
    workOrderLocators.breadcrumbWorkOrderLink(workOrderLabel)
      .should('be.visible');
    workOrderLocators.breadcrumbCurrentPageLabel(currentLabel).should('be.visible');
  }

  // Opens the rows-per-page MUI Select and picks the given value.
  // Asserts the option exists before clicking it.
  changeRowsPerPage(value) {
    workOrderLocators.rowsPerPageSelect().click();
    workOrderLocators.rowsPerPageOption(value).should('exist').click();
  }

  // Asserts the rows-per-page selector currently shows the given size.
  verifyCurrentRowsPerPage(size) {
    workOrderLocators.rowsPerPageSelect().should('have.text', String(size));
  }

  // Clicks the First Page button. force:true because the StockWise AI
  // floating action button (bottom-right) overlaps the pagination row and
  // Cypress's actionability check fails with "covered by another element".
  // The pagination buttons are functional; the overlap is a Frontend layout
  // issue separate from this test.
  clickFirstPage() {
    workOrderLocators.firstPageBtn().click({ force: true });
  }

  // Clicks the Previous Page button. See clickFirstPage for the force:true
  // rationale.
  clickPrevPage() {
    workOrderLocators.prevPageBtn().click({ force: true });
  }

  // Clicks a numbered page button (e.g., 2, 3). See clickFirstPage for the
  // force:true rationale.
  clickPageNumber(num) {
    workOrderLocators.pageNumberBtn(num).click({ force: true });
  }

  // Clicks the Next Page button. See clickFirstPage for the force:true
  // rationale.
  clickNextPage() {
    workOrderLocators.nextPageBtn().click({ force: true });
  }

  // Clicks the Last Page button. See clickFirstPage for the force:true
  // rationale.
  clickLastPage() {
    workOrderLocators.lastPageBtn().click({ force: true });
  }

  // Asserts the First Page button is disabled (true) or enabled (false).
  verifyFirstPageBtnDisabled(disabled) {
    workOrderLocators.firstPageBtn().should(disabled ? 'be.disabled' : 'not.be.disabled');
  }

  // Asserts the Previous Page button is disabled (true) or enabled (false).
  verifyPrevPageBtnDisabled(disabled) {
    workOrderLocators.prevPageBtn().should(disabled ? 'be.disabled' : 'not.be.disabled');
  }

  // Asserts the Next Page button is disabled (true) or enabled (false).
  verifyNextPageBtnDisabled(disabled) {
    workOrderLocators.nextPageBtn().should(disabled ? 'be.disabled' : 'not.be.disabled');
  }

  // Asserts the Last Page button is disabled (true) or enabled (false).
  verifyLastPageBtnDisabled(disabled) {
    workOrderLocators.lastPageBtn().should(disabled ? 'be.disabled' : 'not.be.disabled');
  }

  // -- Work Orders Scan modal -------------------------------------------------
  // Helpers for the Scan modal opened from the Scan button on a WO detail
  // product row. The modal embeds ScanForm + ScanList side by side. See TC64
  // for the ResizeObserver / location-breakdown stub rationale -- the same
  // pre-conditions apply to every test that opens this modal.

  // Suppresses the benign runtime errors that the Scan modal throws on mount
  // and stubs the broken /incoming-items/location-breakdown call (Frontend
  // sends it without the required poNumber query param). Idempotent -- safe
  // to call multiple times in a single test.
  prepareScanModalEnv() {
    cy.on('uncaught:exception', (err) => {
      const msg = String(err?.message ?? '');
      if (msg.includes('ResizeObserver')) return false;
      if (msg.includes('e is not a function')) return false;
      return true;
    });
    cy.intercept(
      'GET',
      '**/incoming-items/location-breakdown**',
      { statusCode: 200, body: { statusCode: 200, success: true, error: null, data: [] } },
    ).as('locationBreakdownStub');
  }

  // Opens the Scan modal on the first product row. Combines the table-ready
  // wait, the env preparation, and the click so each scan-modal test reads
  // as one step. Returns the same Cypress chain shape as clickScanBtn.
  openScanModalOnFirstRow() {
    this.prepareScanModalEnv();
    this.clickScanBtn();
    this.verifyWorkOrdersScanModalVisible();
  }

  // Types a serial number into the Scan modal's Serial Number input.
  // The Input uses an underlying <input id="serialnumber"> regardless of the
  // category-driven scanAttribute label.
  typeSerialInScanModal(serialNumber) {
    workOrderLocators.workOrdersScanSerialInput().clear({ force: true }).type(serialNumber, { force: true });
  }

  // Submits the Scan modal form via the Scan button.
  clickScanSubmitInScanModal() {
    workOrderLocators.workOrdersScanSubmitBtn().click();
  }

  // Clicks DONE in the modal footer to close it.
  clickDoneInScanModal() {
    workOrderLocators.workOrdersScanDoneBtn().click();
  }

  // Asserts the Scan modal has closed. MUI's exit transition keeps the
  // <div role="dialog"> mounted for ~225ms with opacity 0 before unmounting,
  // so a strict not.exist check can fail in that window. We use a body-scoped
  // .should() with retry so Cypress polls until either the dialog is detached
  // OR its visibility is false -- both indicate the modal is closed from a
  // user-facing perspective. The 10s timeout gives the exit transition plenty
  // of slack on slow QA.
  verifyScanModalNotVisible() {
    cy.get('body', { timeout: 10000 }).should(($body) => {
      const $dialog = $body.find('[role="dialog"]');
      const closed = $dialog.length === 0
        || $dialog.attr('aria-hidden') === 'true'
        || $dialog.css('visibility') === 'hidden'
        || Number($dialog.css('opacity')) === 0;
      expect(closed, 'Scan modal should be closed (detached, aria-hidden, or opacity 0)').to.be.true;
    });
  }

  // Asserts the ScanList rendered inside the modal contains a row matching the
  // serial number. ScanList queries /work-orders/scanned-items which returns
  // both serialNumber and referenceNumber as separate fields -- the row text
  // contains whichever value the backend stored. Waits for the MRT table to
  // mount with at least one row first; without this guard the filter() chain
  // can race the React Query refresh that happens right after a scan POST.
  verifyScanListContains(serialNumber) {
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
    workOrderLocators.workOrdersScanListRowBySerial(serialNumber)
      .should('have.length.greaterThan', 0)
      .first()
      .should('be.visible');
  }

  // Asserts every Remove button rendered by ScanList is disabled.
  // ScanList disables Remove when workOrderStatus is Closed or Cancelled.
  // Waits for at least one MRT data row to render before checking the
  // buttons — without this guard, on a slow /work-orders/scanned-items
  // response the assertion can run against zero buttons and pass trivially
  // (or, conversely, fail with an empty NodeList timeout).
  verifyScanListRemoveBtnsDisabled() {
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
    workOrderLocators.workOrdersScanListRemoveBtn()
      .should('have.length.greaterThan', 0)
      .each(($btn) => {
        cy.wrap($btn).should('be.disabled');
      });
  }

  // -- Scanned Items page -----------------------------------------------------

  // Navigates directly to the per-product Scanned Items page using the same
  // URL shape the View Detail button produces:
  //   /work-order/<woNum>/<workOrderId>/<productName>/<productId>
  // productName is included in the path verbatim by the Frontend; it is purely
  // cosmetic and not read from useParams -- a placeholder is acceptable.
  visitScannedItemsPage(woNum, workOrderId, productName, productId) {
    const safeName = encodeURIComponent(productName || 'product');
    cy.visit(`/work-order/${woNum}/${workOrderId}/${safeName}/${productId}`);
  }

  // Asserts the Scanned Items page has rendered the Work Order Number and
  // product-name KeyValue labels at the top of the view.
  verifyScannedItemsHeaderLabels() {
    workOrderLocators.scannedItemsPageWoLabel().should('be.visible');
    workOrderLocators.scannedItemsPageNameLabel().should('be.visible');
  }

  // Asserts the ScanList component has mounted on the page (Scanned Items
  // header is its top-toolbar label).
  verifyScanListVisible() {
    workOrderLocators.workOrdersScanListHeader().should('be.visible');
  }

  // -- Scan support helpers ---------------------------------------------------

  // Probes /products/<id>/items via API (Admin token) and resolves with the
  // first 'Available' serial number for that product, or null when no
  // Available item exists. Used by Scan modal tests to pull a real,
  // unreserved serial without depending on test-only seed data. The probe
  // lives on the page object (new probes belong on the page object).
  findAvailableSerialForProduct(productId) {
    return cy.getAuthToken().then((token) => {
      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/products/${productId}/items?page=1&page_size=100`,
        headers: { Authorization: `Bearer ${token}` },
      }, `GET /products/${productId}/items`).then((resp) => {
        const items = resp.body?.data?.list ?? resp.body?.data ?? [];
        const available = items.find((it) => it?.status === 'Available' && it?.serialNumber);
        return available?.serialNumber ?? null;
      });
    });
  }

  // Same shape as findAvailableSerialForProduct but pulls a serial that is
  // already 'Reserved' (i.e. a duplicate-scan target). Returns null when
  // none exist so tests can call this.skip().
  findReservedSerialForProduct(productId) {
    return cy.getAuthToken().then((token) => {
      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/products/${productId}/items?page=1&page_size=100`,
        headers: { Authorization: `Bearer ${token}` },
      }, `GET /products/${productId}/items (reserved scan)`).then((resp) => {
        const items = resp.body?.data?.list ?? resp.body?.data ?? [];
        const reserved = items.find((it) => it?.status === 'Reserved' && it?.serialNumber);
        return reserved?.serialNumber ?? null;
      });
    });
  }

  // Finds a different product (id !== excludeProductId) whose hasItems=true
  // and has at least one Available serial number. Returns
  // { productId, serialNumber } or null when none exist.
  //
  // Walks /incoming-items/defective-reports?poNumber=allPO&status=Available
  // rather than /products because the latter is overwhelmingly pure products
  // on QA -- defective-reports is filtered server-side to products with
  // Available items so candidates are dense.
  findAvailableSerialForOtherProduct(excludeProductId, { maxPages = 10, pageSize = 50 } = {}) {
    return cy.getAuthToken().then((token) => {
      const scan = (page) => {
        return workOrderRequestWithRetry({
          method: 'GET',
          url: `${API_BASE_URL}/incoming-items/defective-reports?page=${page}&page_size=${pageSize}&poNumber=allPO&status=Available`,
          headers: { Authorization: `Bearer ${token}` },
        }, `GET /incoming-items/defective-reports?status=Available&page=${page} (wrong-product probe)`).then((resp) => {
          const list = resp.body?.data?.list ?? [];
          const totalPages = Number(resp.body?.data?.pagination?.pages ?? 0);
          const candidates = list.filter(
            (p) => p?.id && p.id !== excludeProductId && p.hasItems === true,
          );
          // Walk candidates sequentially; resolve on first one with an
          // Available serial.
          const tryCandidate = (idx) => {
            if (idx >= candidates.length) {
              if (page >= maxPages || page >= totalPages) return cy.wrap(null, { log: false });
              return scan(page + 1);
            }
            return this.findAvailableSerialForProduct(candidates[idx].id).then((sn) => {
              if (sn) return { productId: candidates[idx].id, serialNumber: sn };
              return tryCandidate(idx + 1);
            });
          };
          return tryCandidate(0);
        });
      };
      return scan(1);
    });
  }

  // Reserves a serial against a work order by POSTing /work-orders/scan
  // directly (no UI). Throws on failure so test arrangement errors fail loud
  // rather than silently producing an empty Reserved set. Pair with
  // unscanSerial() in afterEach for cleanup.
  reserveSerialViaApi(workOrderNumber, productId, serialNumber) {
    expect(workOrderNumber, 'workOrderNumber required to reserve serial').to.exist;
    expect(productId, 'productId required to reserve serial').to.exist;
    expect(serialNumber, 'serialNumber required to reserve serial').to.exist;
    return cy.getAuthToken().then((token) => {
      return cy.request({
        method: 'POST',
        url: `${API_BASE_URL}/work-orders/scan`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { workOrderNumber, productId, serialNumber },
        failOnStatusCode: false,
        timeout: 60000,
      }).then((resp) => {
        const status = resp.status;
        const isSuccess = status >= 200 && status < 300 && resp.body?.success !== false;
        if (!isSuccess) {
          const message = resp.body?.error?.message ?? resp.body?.message ?? '';
          throw new Error(
            `reserveSerialViaApi failed for serial="${serialNumber}" productId=${productId} woNum=${workOrderNumber}: HTTP ${status}, message="${message}". The test arrangement could not be set up; aborting.`,
          );
        }
        return resp;
      });
    });
  }

  // Reads the WO via GET /work-orders/<id> and returns its productsItems
  // array (empty array when null). Used by scan tests to assert
  // productsItems mutations end-to-end.
  getWorkOrderProductsItems(workOrderId) {
    return cy.getAuthToken().then((token) => {
      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/work-orders/${workOrderId}`,
        headers: { Authorization: `Bearer ${token}` },
      }, `GET /work-orders/${workOrderId}`).then((resp) => {
        return resp.body?.data?.productsItems ?? [];
      });
    });
  }

  // Finds the first work order whose status='Open' and whose products array
  // contains a hasItems=true entry, returning the metadata needed to drive
  // scan tests. Resolves with { woNum, id, productId, productName } or null
  // when no qualifying WO exists in QA. Bounded to first page of WOs to
  // keep the probe fast -- callers should this.skip() on null per
  // principle #6 (environmental absence is not a defect).
  findOpenWorkOrderWithItemsProduct() {
    return cy.getAuthToken().then((token) => {
      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/work-orders?status=Open&page=1&pageSize=50`,
        headers: { Authorization: `Bearer ${token}` },
      }, 'GET /work-orders?status=Open (items-product probe)').then((resp) => {
        const list = resp.body?.data?.list ?? [];
        const wo = list.find((w) =>
          (w?.products ?? []).some((p) => p?.hasItems === true && p?.productId),
        );
        if (!wo) return null;
        const product = wo.products.find((p) => p?.hasItems === true);
        return {
          woNum: wo.workOrderNumber,
          id: wo.id,
          productId: product.productId,
          productName: product.name || 'product',
        };
      });
    });
  }

  // Combined alive check used by the Scan-modal happy-path test. Asserts the
  // modal title, the serial-number input, and the embedded ScanList header
  // are all visible -- one call replaces three inline cy.findByRole('dialog')
  // chains in the spec.
  verifyScanModalReady(modalTitle, scanListHeader) {
    workOrderLocators.workOrdersScanModalTitle(modalTitle).should('be.visible');
    workOrderLocators.workOrdersScanSerialInput().should('be.visible');
    workOrderLocators.workOrdersScanModalListHeader(scanListHeader).should('be.visible');
  }

  // Asserts the inline RHF required-error text is visible inside the Scan
  // modal. Used by the BVA empty-serial test.
  verifyScanModalSerialRequiredError(text) {
    workOrderLocators.workOrdersScanModalSerialRequiredError(text).should('be.visible');
  }

  // Restores Item.status Reserved -> Available by POSTing /work-orders/unscan.
  // Used by the scan-flow afterEach to pair the TC that reserves a serial
  //
  // Asserts the cleanup succeeded -- a silent 4xx leaks a Reserved item to QA
  // and pollutes the snapshot for the next run's TC82 / TC87 (which compare
  // against reservedQuantity). The only acceptable non-2xx responses are the
  // semantic "WO is in a terminal state" errors -- if the WO is already Closed
  // or Cancelled the unscan is moot, so we accept that path. Anything else
  // fails the cleanup loudly so the developer sees the leak immediately.
  unscanSerial(workOrderNumber, productId, serialNumber) {
    if (!workOrderNumber || productId == null || !serialNumber) {
      return cy.wrap(null, { log: false });
    }
    return cy.getAuthToken().then((token) => {
      return cy.request({
        method: 'POST',
        url: `${API_BASE_URL}/work-orders/unscan`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { workOrderNumber, productId, serialNumber },
        failOnStatusCode: false,
        timeout: 60000,
      }).then((resp) => {
        const status = resp.status;
        const message = resp.body?.error?.message ?? resp.body?.message ?? '';
        const isSuccess = status >= 200 && status < 300 && resp.body?.success !== false;
        // Terminal-state semantic failures are acceptable -- the cleanup is
        // moot because the WO is no longer Open and the Reserved item is no
        // longer relevant to the reservedQuantity calculation.
        const isTerminalStateFailure = /cannot be unscanned because its status is (Closed|Cancelled)/i.test(message);
        if (isSuccess || isTerminalStateFailure) {
          if (isTerminalStateFailure) {
            Cypress.log({
              name: 'unscanSerial',
              message: `cleanup is moot: WO ${workOrderNumber} is in a terminal state -- skipping unscan`,
            });
          }
          return resp;
        }
        // Unexpected cleanup failure -- fail loudly so the leak is visible.
        throw new Error(
          `unscanSerial cleanup failed for serial="${serialNumber}" productId=${productId} woNum=${workOrderNumber}: HTTP ${status}, message="${message}". This Reserved item will pollute QA state and break TC82/TC87 on the next run -- fix immediately.`,
        );
      });
    });
  }

  // Finds the first terminal-state (Closed or Cancelled) WO that has a
  // scanned hasItems serial in productsItems. Returns { woNum, id, productId,
  // productName } or null when none qualifies.
  findTerminalWoWithScannedHasItemsProduct() {
    return cy.getAuthToken().then((token) => {
      const matches = (w) => {
        const hasScannedItem = (w?.productsItems ?? []).some((it) => it?.serialNumber);
        const hasItemsProduct = (w?.products ?? []).some((p) => p?.hasItems === true);
        return hasScannedItem && hasItemsProduct;
      };
      const select = (wo) => {
        const product = wo.products.find((p) => p?.hasItems === true) || wo.products[0];
        return {
          woNum: wo.workOrderNumber,
          id: wo.id,
          productId: product.productId,
          productName: product.name || 'product',
        };
      };
      // Walk Closed first, then Cancelled.
      return workOrderRequestWithRetry({
        method: 'GET',
        url: `${API_BASE_URL}/work-orders?status=Closed&page=1&pageSize=50`,
        headers: { Authorization: `Bearer ${token}` },
      }, 'GET /work-orders?status=Closed (terminal-with-scanned probe)').then((closedResp) => {
        const closed = (closedResp.body?.data?.list ?? []).find(matches);
        if (closed) return select(closed);
        return workOrderRequestWithRetry({
          method: 'GET',
          url: `${API_BASE_URL}/work-orders?status=Cancelled&page=1&pageSize=50`,
          headers: { Authorization: `Bearer ${token}` },
        }, 'GET /work-orders?status=Cancelled (terminal-with-scanned probe)').then((cancelledResp) => {
          const cancelled = (cancelledResp.body?.data?.list ?? []).find(matches);
          if (!cancelled) return null;
          return select(cancelled);
        });
      });
    });
  }
}

export default WorkOrderPage;

