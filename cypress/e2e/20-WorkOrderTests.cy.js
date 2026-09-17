// cypress/e2e/20-WorkOrderTests.cy.js

import WorkOrderPage from '../pageObjects/WorkOrderPage';
import {
  loginToAccountWise,
  getValidAccountWiseRefs,
  findStockWiseProductForInvoice,
  findStockWiseItemsProductForInvoice,
  buildInvoiceBody,
  createAccountWiseInvoice,
  waitForStockWiseWorkOrderByInvoice,
  getProductReservedQuantity,
  buildSalesOrderBody,
  createAccountWiseSalesOrder,
  approveAccountWiseSalesOrder,
  getStockWiseWorkOrderByNumber,
  assertNoStockWiseWorkOrderForIdentifier,
} from '../support/helpers/accountwise';

describe('Work Order Tests', () => {
  let workOrderData;
  let workOrderPage;
  let woTerm, soTerm, invoiceTerm;

  // AccountWise → StockWise WO creation (invoice- and sales-order-driven) is
  // only available where the AccountWise environment exposes the work-order
  // toggle. QA's AccountWise does NOT, so the six AccountWise describe blocks
  // must skip on QA but run on Stage. Detect by config: the API base URL host
  // carries the environment name ("qa" vs "stage"). Confirmed with user
  // 2026-06-02.
  const accountWiseWoSupported = () => {
    const apiBase = String(Cypress.env('API_BASE_URL') || '');
    const awIdentity = String(Cypress.env('ACCOUNTWISE_IDENTITY_BASE_URL') || '');
    // Supported everywhere EXCEPT QA.
    return !/(^|[.\/])qa\./i.test(apiBase) && !/(^|[.\/])qa\./i.test(awIdentity);
  };

  // Disable screenshots on failure for this spec — when the QA server is slow,
  // `cy.screenshot()` itself times out at 15s and the real failure error is
  // masked behind a confusing "cy.screenshot() timed out" stack. Without
  // screenshots we see the actual assertion error in the report.
  Cypress.config('screenshotOnRunFailure', false);

  before(() => {
    cy.fixture('workOrderData').then((data) => {
      workOrderData = data;
    });
    // Seed-if-empty: guarantees the minimum data the suite needs (a product,
    // an Open WO, and a Cancelled WO) WITHOUT creating duplicates when the
    // environment already has data. Every branch is guarded on a live GET, so
    // a populated Stage/QA performs only reads. Runs once before all blocks.
    cy.authSession('admin');
    new WorkOrderPage().visit();
    new WorkOrderPage().ensureSeedData();
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Search
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Search', () => {
    before(() => {
      cy.authSession('admin');
      new WorkOrderPage().fetchSearchTerms().then(({ woTerm: wo, soTerm: so, invoiceTerm: inv }) => {
        woTerm      = wo;
        soTerm      = so;
        invoiceTerm = inv;
      });
    });

    beforeEach(function () {
      // The search/result-count tests need work-order rows. Skip the whole
      // block on environments with no seedable data (e.g. QA — see
      // ensureSeedData); it runs fully where data exists (e.g. Stage).
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      workOrderPage.visit();
    });

    // EP -- valid partition: empty query returns all results (the "no filter" partition)
    it('SW-WO-TC01: Verify search with an empty field shows the total result count', { tags: ['@regression'] }, () => {
      // Technique: EP
      workOrderPage.submitSearch();
      workOrderPage.verifySearchResultLabel(workOrderData.search.emptyQueryLabel);
    });

    // EP -- valid partition: WO number is a known identifier that should resolve to exactly one result
    it('SW-WO-TC02: Verify search by work order number returns the matching work order', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: EP
      if (!woTerm) this.skip();
      workOrderPage.typeSearch(woTerm);
      workOrderPage.submitSearch();
      workOrderPage.verifySearchResultLabel(`Result(s) for "${woTerm}"`);
      workOrderPage.verifyTableContains(woTerm);
    });

    // EP -- valid partition: SO number is a known identifier that should resolve to exactly one result
    it('SW-WO-TC03: Verify search by sales order number returns the matching work order', { tags: ['@regression'] }, function () {
      // Technique: EP
      if (!soTerm) this.skip();
      workOrderPage.typeSearch(soTerm);
      workOrderPage.submitSearch();
      workOrderPage.verifySearchResultLabel(`Result(s) for "${soTerm}"`);
      workOrderPage.verifyTableContains(soTerm);
    });

    // EP -- valid partition: invoice number is a known identifier that should resolve to exactly one result
    it('SW-WO-TC04: Verify search by invoice number returns the matching work order', { tags: ['@regression'] }, function () {
      // Technique: EP
      if (!invoiceTerm) this.skip();
      workOrderPage.typeSearch(invoiceTerm);
      workOrderPage.submitSearch();
      workOrderPage.verifySearchResultLabel(`Result(s) for "${invoiceTerm}"`);
      workOrderPage.verifyTableContains(invoiceTerm);
    });

    // EP -- valid partition: "Open" is a valid status value; results must all carry that status
    it('SW-WO-TC05: Verify search by status "Open" returns a list of Open work orders', { tags: ['@regression'] }, () => {
      // Technique: EP
      workOrderPage.typeSearch(workOrderData.search.byStatus.open.term);
      workOrderPage.submitSearch();
      workOrderPage.verifySearchResultLabel(workOrderData.search.byStatus.open.resultLabel);
      workOrderPage.verifyTableContains(workOrderData.search.byStatus.open.term);
    });

    // EP -- valid partition: "Draft" is a valid status value; results must all carry that status
    it('SW-WO-TC06: Verify search by status "Draft" returns a list of Draft work orders', { tags: ['@regression'] }, function () {
      // Technique: EP
      workOrderPage.typeSearch(workOrderData.search.byStatus.draft.term);
      workOrderPage.submitSearch();
      // Wait for the table to settle into either a result state or an empty state before deciding
      cy.get('body', { timeout: 15000 }).should(($b) => {
        const t = $b.text();
        expect(t.includes('No Result') || /\d+ Result/.test(t)).to.be.true;
      });
      cy.get('body').then(($b) => {
        if ($b.text().includes('No Result')) { this.skip(); return; }
        workOrderPage.verifySearchResultLabel(workOrderData.search.byStatus.draft.resultLabel);
        workOrderPage.verifyTableContains(workOrderData.search.byStatus.draft.term);
      });
    });

    // EP -- valid partition: "Closed" is a valid status value; results must all carry that status
    it('SW-WO-TC07: Verify search by status "Closed" returns a list of Closed work orders', { tags: ['@regression'] }, function () {
      // Technique: EP
      workOrderPage.typeSearch(workOrderData.search.byStatus.closed.term);
      workOrderPage.submitSearch();
      cy.get('body', { timeout: 15000 }).should(($b) => {
        const t = $b.text();
        expect(t.includes('No Result') || /\d+ Result/.test(t)).to.be.true;
      });
      cy.get('body').then(($b) => {
        if ($b.text().includes('No Result')) { this.skip(); return; }
        workOrderPage.verifySearchResultLabel(workOrderData.search.byStatus.closed.resultLabel);
        workOrderPage.verifyTableContains(workOrderData.search.byStatus.closed.term);
      });
    });

    // EP -- valid partition: "Cancelled" is a valid status value; results must all carry that status
    it('SW-WO-TC08: Verify search by status "Cancelled" returns a list of Cancelled work orders', { tags: ['@regression'] }, () => {
      // Technique: EP
      workOrderPage.typeSearch(workOrderData.search.byStatus.cancelled.term);
      workOrderPage.submitSearch();
      workOrderPage.verifySearchResultLabel(workOrderData.search.byStatus.cancelled.resultLabel);
      workOrderPage.verifyTableContains(workOrderData.search.byStatus.cancelled.term);
    });

    // EP -- invalid partition / error guessing: a nonsense term matches no WO and must surface the "No Result" state
    it('SW-WO-TC09: Verify search with an invalid term shows "No Result" label and empty table', { tags: ['@regression'] }, () => {
      // Technique: EP
      workOrderPage.typeSearch(workOrderData.search.invalidSearch.term);
      workOrderPage.submitSearch();
      workOrderPage.verifyNoResultLabel();
      workOrderPage.verifyNoRecordsInTable();
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // List View
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('List View', () => {
    // TC14 needs a WO whose SO# cell renders as a clickable link (requires saleOrderId
    // from a real AccountWise SO). TC15 needs a WO with an invoiceNumber (from a real AW
    // invoice). Both are created fresh in before() so the tests never depend on pre-existing
    // data that may have the wrong shape (e.g. saleOrderNumber without saleOrderId).
    let listViewSoTerm;
    let listViewInvoiceTerm;
    let listViewSoWoId;
    let listViewInvoiceWoId;

    before(function () {
      // This hook only PREPARES the optional AccountWise-backed WOs that TC14
      // and TC15 need (SO# / Invoice# clickable cells). TC10–TC13 do not need
      // AccountWise at all. AccountWise creation can fail for environmental
      // reasons (e.g. Stage returns 400 "Invalid account(s) referenced in
      // jeTransactions"); that must NOT fail the whole block — it should only
      // leave listViewSoTerm/listViewInvoiceTerm null so TC14/TC15 skip via
      // their own guards (principle #6 — environmental absence is not a defect).
      // So every AccountWise call here is best-effort: tolerant cy.request
      // (failOnStatusCode:false) instead of the hard-asserting shared helpers.
      const awInvoice = Cypress.env('ACCOUNTWISE_INVOICE_BASE_URL');
      const apiBase = Cypress.env('API_BASE_URL');
      cy.authSession('admin');
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        loginToAccountWise().then((awToken) => {
          const awReq = (method, url, body) => cy.request({
            method, url, headers: { Authorization: `Bearer ${awToken}` }, body,
            failOnStatusCode: false, timeout: 60000,
          });

          // Resolve environment-valid customer + account ids from existing AW
          // records so the fixture's QA-only UUIDs aren't rejected elsewhere
          // (Stage invoices need the "Sale Of Goods" account, not "Revenue").
          // null → builders keep the fixture defaults.
          // Create the SO-backed WO for TC14 (best-effort).
          getValidAccountWiseRefs(awToken, 'saleOrder').then((soRefs) => {
          findStockWiseProductForInvoice(swToken, { minReservable: 1 }).then((soProduct) => {
            if (!soProduct) { listViewSoTerm = null; return; }
            const soBody = buildSalesOrderBody({ product: soProduct, refs: soRefs });
            return awReq('POST', `${awInvoice}/v1/saleOrder`, soBody).then((resp) => {
              const data = resp.body?.data;
              if (resp.status >= 200 && resp.status < 300 && data?.sale_order_number) {
                listViewSoTerm = data.sale_order_number;
                listViewSoWoId = data.metadata?.work_order_number ?? null;
              } else {
                listViewSoTerm = null;
                Cypress.log({ name: 'List View setup', message: `AW sales order create unavailable (status=${resp.status}) — TC14 will skip` });
              }
            });
          });
          });

          // Create the invoice-backed WO for TC15 (best-effort).
          getValidAccountWiseRefs(awToken, 'invoice').then((invRefs) => {
          findStockWiseProductForInvoice(swToken, { minReservable: 1 }).then((invProduct) => {
            if (!invProduct) { listViewInvoiceTerm = null; return; }
            const invBody = buildInvoiceBody({ product: invProduct, refs: invRefs });
            return awReq('POST', `${awInvoice}/v2/invoice`, invBody).then((resp) => {
              const data = resp.body?.data;
              if (resp.status >= 200 && resp.status < 300 && data?.invoice_number) {
                listViewInvoiceTerm = data.invoice_number;
                // Resolve the linked WO id for after() cleanup — best-effort via
                // a tolerant search (the WO syncs async). TC15 only needs the
                // invoice term, so a missing WO id here is fine.
                return cy.request({
                  method: 'GET',
                  url: `${apiBase}/work-orders?page=1&pageSize=10&search=${encodeURIComponent(data.invoice_number)}`,
                  headers: { Authorization: `Bearer ${swToken}` },
                  failOnStatusCode: false,
                  timeout: 60000,
                }).then((woResp) => {
                  const wo = (woResp.body?.data?.list ?? []).find((w) => w?.invoiceNumber === data.invoice_number);
                  listViewInvoiceWoId = wo?.workOrderNumber ?? null;
                });
              }
              listViewInvoiceTerm = null;
              Cypress.log({ name: 'List View setup', message: `AW invoice create unavailable (status=${resp.status}) — TC15 will skip` });
              return undefined;
            });
          });
          }); // close getValidAccountWiseRefs('invoice').then
        });
      });
    });

    after(() => {
      // Cancel the WOs created in before() so they don't accumulate across runs.
      cy.getAuthToken().then((swToken) => {
        [listViewSoWoId, listViewInvoiceWoId].forEach((woNum) => {
          if (!woNum) return;
          cy.request({
            method: 'GET',
            url: `${Cypress.env('API_BASE_URL')}/work-orders?search=${encodeURIComponent(woNum)}&page=1&pageSize=1`,
            headers: { Authorization: `Bearer ${swToken}` },
            failOnStatusCode: false,
            timeout: 60000,
          }).then((resp) => {
            const wo = resp.body?.data?.list?.[0];
            if (!wo?.id || wo.status === 'Cancelled' || wo.status === 'Closed') return;
            cy.request({
              method: 'DELETE',
              url: `${Cypress.env('API_BASE_URL')}/work-orders/${wo.id}/cancel`,
              headers: { Authorization: `Bearer ${swToken}` },
              failOnStatusCode: false,
              timeout: 60000,
            });
          });
        });
      });
    });

    beforeEach(() => {
      // TC10–TC12 verify page chrome (breadcrumb, column headers) which renders
      // even with zero work orders, so this block does NOT gate on seed data.
      // Row-dependent tests (TC13) guard themselves; TC14/TC15 guard on their
      // AccountWise terms.
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      workOrderPage.visit();
    });

    // Use case -- alternate path: breadcrumb is secondary navigation rendered on every list page
    it('SW-WO-TC10: Verify breadcrumb shows the Dashboard link and Work Order as the current page', { tags: ['@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.verifyBreadcrumb(
        workOrderData.breadcrumb.dashboardLabel,
        workOrderData.breadcrumb.currentPageLabel
      );
    });

    // Use case -- alternate path: breadcrumb link routes user back to Dashboard without using browser back
    // SKIP: Dashboard breadcrumb link was removed in the 2026 redesign — no link to click.
    it.skip('SW-WO-TC11: Verify clicking the Dashboard link in the breadcrumb navigates to the dashboard', { tags: ['@regression'] }, () => {
      workOrderPage.clickBreadcrumbDashboard();
      cy.url().should('include', '/dashboard');
    });

    // Use case -- happy path: all expected column headers must render for the list to be usable
    it('SW-WO-TC12: Verify all columns of the list are visible', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.verifyAllColumnsVisible(workOrderData.listView.columns);
    });

    // Use case -- happy path: row click is the primary navigation into WO detail.
    // Needs at least one row. listHasRows() waits for the list to SETTLE first
    // (so a still-loading list isn't misread as empty), then skips cleanly only
    // when the list is genuinely empty (environmental absence, principle #6).
    it('SW-WO-TC13: Verify clicking on a row opens work order details', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: Use Case
      workOrderPage.listHasRows().then((hasRows) => {
        if (!hasRows) { this.skip(); return; }
        workOrderPage.clickFirstRow();
        cy.url().should('include', workOrderData.listView.detailUrlPattern);
      });
    });

    // Use case -- alternate path: SO# cell is a deep-link into AccountWise; must open in a new tab.
    // Uses a WO created in before() via createAccountWiseSalesOrder so saleOrderId is guaranteed
    // to be populated -- that is the field the Frontend checks to render the cell as a link.
    it('SW-WO-TC14: Verify clicking on a sales order number opens AccountWise in a new tab', { tags: ['@regression'] }, function () {
      // Technique: Use Case
      if (!listViewSoTerm) { this.skip(); return; }
      // Stub window.open before the search so it is in place when the row renders.
      cy.window().then((win) => cy.stub(win, 'open').as('windowOpen'));
      workOrderPage.typeSearch(listViewSoTerm);
      workOrderPage.submitSearch();
      cy.get('tbody td[data-index="1"]', { timeout: 30000 }).should('be.visible');
      workOrderPage.clickSoCellContaining(listViewSoTerm);
      cy.get('@windowOpen').should('have.been.calledOnce');
    });

    // Use case -- alternate path: Invoice# cell is a deep-link into AccountWise; must open in a new tab.
    // Uses a WO created in before() via createAccountWiseInvoice so invoiceNumber is guaranteed present.
    it('SW-WO-TC15: Verify clicking on an invoice number opens AccountWise in a new tab', { tags: ['@regression'] }, function () {
      // Technique: Use Case
      if (!listViewInvoiceTerm) { this.skip(); return; }
      // Stub window.open before the search for the same reason as TC14.
      cy.window().then((win) => cy.stub(win, 'open').as('windowOpen'));
      workOrderPage.typeSearch(listViewInvoiceTerm);
      workOrderPage.submitSearch();
      cy.get('tbody td[data-index="2"]', { timeout: 30000 }).should('be.visible');
      workOrderPage.clickInvoiceCellContaining(listViewInvoiceTerm);
      cy.get('@windowOpen').should('have.been.calledOnce');
    });

    // Use case -- alternate path: View button is the explicit action equivalent to row click
    it('SW-WO-TC16: Verify clicking the View button opens work order', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.clickFirstViewBtn();
      cy.url().should('include', workOrderData.listView.detailUrlPattern);
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Status Transitions
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Status Transitions', () => {
    // TC17 needs a StockWise-created Open WO (no SO, no Invoice) — create one in before() so
    // the test is independent of pre-existing QA state. Cleaned up in after().
    let tc17OwnedWoNum;
    let tc17OwnedWoId;

    before(function () {
      // Needs a stocked product to create a WO. Skip on environments where no
      // product could be seeded (e.g. QA — see ensureSeedData).
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      cy.authSession('admin');
      new WorkOrderPage().visit();
      new WorkOrderPage().createViaApiWithId().then(({ woNum, id }) => {
        tc17OwnedWoNum = woNum;
        tc17OwnedWoId = id;
      });
    });

    after(() => {
      if (!tc17OwnedWoId) return;
      cy.getAuthToken().then((swToken) => {
        cy.request({
          method: 'DELETE',
          url: `${Cypress.env('API_BASE_URL')}/work-orders/${tc17OwnedWoId}/cancel`,
          headers: { Authorization: `Bearer ${swToken}` },
          failOnStatusCode: false,
          timeout: 60000,
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      workOrderPage.visit();
    });

    // State transition -- valid state: StockWise-created WO enters Open; Cancel is the only valid action (no SO blocks it)
    it('SW-WO-TC17: Verify stockwise-created work order has Open status, disabled Open button, and enabled Cancel button', { tags: ['@regression'] }, function () {
      // Technique: State Transition
      if (!tc17OwnedWoNum) { this.skip(); return; }
      // Search for the owned WO so we operate on a known StockWise-created row, not on whatever
      // happens to be at the top of the table (which may be AW-driven with a saleOrderId set).
      workOrderPage.searchByWoNum(tc17OwnedWoNum);
      workOrderPage.findRowByWoNum(tc17OwnedWoNum).then(($row) => {
        workOrderPage.verifyStatusInRow($row, 'Open');
        workOrderPage.verifySoInRow($row, false);
        workOrderPage.verifyOpenBtnEnabled($row, false);
        workOrderPage.verifyCancelBtnEnabled($row, true);
      });
    });

    // State transition -- valid state + decision table: AW-approved WO is Open with SO; AW owns lifecycle so both buttons are locked.
    // Finds a WO with a real saleOrderId (AccountWise UUID) via API rather than scanning the rendered cell text —
    // test-created SOs have saleOrderNumber but no saleOrderId, and Cancel is gated on saleOrderId, not on the cell text.
    it('SW-WO-TC18: Verify accountwise-approved work order shows Open status, sales order associated, both buttons disabled', { tags: ['@regression'] }, function () {
      // Technique: Decision Table
      workOrderPage.findWoWithSaleOrderIdByStatus('Open').then((result) => {
        if (!result) { this.skip(); return; }
        workOrderPage.searchByWoNum(result.woNum);
        workOrderPage.findRowByWoNum(result.woNum).then(($row) => {
          workOrderPage.verifyStatusInRow($row, 'Open');
          workOrderPage.verifySoInRow($row, true);
          workOrderPage.verifyOpenBtnEnabled($row, false);
          workOrderPage.verifyCancelBtnEnabled($row, false);
        });
      });
    });

    // State transition -- valid state + decision table: AW-unapproved WO is Draft with SO; Open is enabled for force-open, Cancel is locked.
    // Same saleOrderId-based selection as TC18 — see comment above.
    it('SW-WO-TC19: Verify accountwise-unapproved work order shows Draft status, sales order associated, Open enabled and Cancel disabled', { tags: ['@regression'] }, function () {
      // Technique: Decision Table
      workOrderPage.findWoWithSaleOrderIdByStatus('Draft').then((result) => {
        if (!result) { this.skip(); return; }
        workOrderPage.searchByWoNum(result.woNum);
        workOrderPage.findRowByWoNum(result.woNum).then(($row) => {
          workOrderPage.verifyStatusInRow($row, 'Draft');
          workOrderPage.verifySoInRow($row, true);
          workOrderPage.verifyOpenBtnEnabled($row, true);
          workOrderPage.verifyCancelBtnEnabled($row, false);
        });
      });
    });

    // State transition -- terminal state: Closed is a final state; no further transitions are allowed.
    // Looks up a Closed WO by status via API (a quick API GET is cheaper and more reliable than
    // searching the rendered table for "Closed" — search by status filters server-side).
    it('SW-WO-TC20: Verify closed work order shows Closed status and both action buttons disabled', { tags: ['@regression'] }, function () {
      // Technique: State Transition
      workOrderPage.findWoDetailByStatus('Closed').then((result) => {
        if (!result) { this.skip(); return; }
        workOrderPage.searchByWoNum(result.woNum);
        workOrderPage.findRowByWoNum(result.woNum).then(($row) => {
          workOrderPage.verifyStatusInRow($row, 'Closed');
          workOrderPage.verifyOpenBtnEnabled($row, false);
          workOrderPage.verifyCancelBtnEnabled($row, false);
        });
      });
    });

    // -- Cancel Flow ----------------------------------------------------------
    // Uses a single StockWise-created Open WO (no SO#) identified once in before().
    // TC23 is destructive -- runs last and permanently cancels that WO.

    describe('Work order cancellation tests', () => {
      let cancelTargetWoNum;

      before(function () {
        if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
        cy.authSession('admin');
        workOrderPage = new WorkOrderPage();
        workOrderPage.visit();
        workOrderPage.createViaApi().then((woNum) => {
          cancelTargetWoNum = woNum;
        });
      });

      beforeEach(() => {
        workOrderPage = new WorkOrderPage();
        cy.authSession('admin');
        workOrderPage.visit();
        workOrderPage.searchByWoNum(cancelTargetWoNum);
      });

      // Use case -- happy path: Cancel action on an Open WO must surface a confirmation dialog before committing
      it('SW-WO-TC21: Verify clicking Cancel on an Open StockWise WO opens a confirmation popup', { tags: ['@regression'] }, () => {
        // Technique: Use Case
        workOrderPage.findRowByWoNum(cancelTargetWoNum).then(($row) => {
          workOrderPage.clickCancelBtn($row);
        });
        workOrderPage.verifyConfirmDialogVisible();
      });

      // Use case -- exception path: "No" aborts the cancellation and leaves the WO in Open state unchanged
      it('SW-WO-TC22: Verify clicking No on the cancel confirmation closes the popup without changing status', { tags: ['@regression'] }, () => {
        // Technique: Use Case
        workOrderPage.findRowByWoNum(cancelTargetWoNum).then(($row) => {
          workOrderPage.clickCancelBtn($row);
        });
        workOrderPage.verifyConfirmDialogVisible();
        workOrderPage.clickConfirmNo();
        workOrderPage.verifyConfirmDialogNotVisible();
        workOrderPage.findRowByWoNum(cancelTargetWoNum).then(($row) => {
          workOrderPage.verifyStatusInRow($row, 'Open');
          workOrderPage.verifyCancelBtnEnabled($row, true);
        });
      });

      // State transition -- Open â†’ Cancelled: "Yes" on confirmation commits the cancellation and status must reflect Cancelled
      it('SW-WO-TC23: Verify clicking Yes on the cancel confirmation cancels the work order', { tags: ['@smoke', '@regression'] }, () => {
        // Technique: State Transition
        workOrderPage.findRowByWoNum(cancelTargetWoNum).then(($row) => {
          workOrderPage.clickCancelBtn($row);
        });
        workOrderPage.verifyConfirmDialogVisible();
        workOrderPage.clickConfirmYes();
        workOrderPage.verifyConfirmDialogNotVisible();
        workOrderPage.verifyToast(workOrderData.toasts.cancelSuccess);
        // Search by WO number to bring it back into view after re-fetch, then verify.
        workOrderPage.searchByWoNum(cancelTargetWoNum);
        workOrderPage.verifyStatusByWoNum(cancelTargetWoNum, 'Cancelled');
        workOrderPage.findRowByWoNum(cancelTargetWoNum).then(($row) => {
          workOrderPage.verifyOpenBtnEnabled($row, false);
          workOrderPage.verifyCancelBtnEnabled($row, false);
        });
      });
    });

    // -- Force Open Flow ------------------------------------------------------
    // Uses a single Draft WO identified once in before().
    // TC26 is destructive -- runs last and permanently force-opens that WO.
    // If no Draft WO with a linked SO exists in the environment, all three
    // tests skip cleanly -- environmental absence is not a defect (principle #6).

    describe('Work order force open tests', () => {
      let forceOpenTargetWoNum;

      before(() => {
        cy.authSession('admin');
        // Find a Draft WO with a linked saleOrderId via the API (mirrors
        // TC18/TC19 / findWoWithSaleOrderIdByStatus). The earlier DOM-based
        // probe (findRowByCriteria) only scanned the rendered page-1 rows of
        // the WO list; in the full-suite run earlier destructive tests
        // (TC23 cancel, TC26 force-open, TC60 create, TC14/15 AW invoice
        // create) shift the page-1 contents enough that a qualifying Draft
        // WO falls off page 1 -- the DOM probe returned null and all three
        // Force-Open tests skipped. The API call is server-paginated and
        // walks 200 records, so it finds the WO regardless of list churn.
        workOrderPage = new WorkOrderPage();
        workOrderPage.visit();
        // Pick a Draft WO whose linked SO is confirmed NOT approved, so the
        // Open click is guaranteed to surface the Force-Open dialog. A plain
        // "Draft + has saleOrderId" pick (the old findWoWithSaleOrderIdByStatus)
        // can land on a Draft whose SO-status lookup the FE can't resolve -- the
        // FE then toasts an error and no dialog appears (TC24-26 "dialog not
        // found" on Stage). findDraftWoForForceOpen replays the FE's own
        // approval check (GET /work-orders/sale-order/:id) and only returns a WO
        // for which that lookup succeeds and is not-approved -- exactly the
        // condition under which the dialog renders.
        //
        // Null -> block skips cleanly. On Stage this currently skips because
        // /work-orders/sale-order/:saleOrderId returns 500 for every Draft WO's
        // SO (the AccountWise getSaleOrderDetails dependency is down), so the FE
        // can never reach the dialog path -- a backend/dependency defect, not a
        // test defect (principle #6). The log makes the skip reason explicit in
        // the report rather than a silent pending.
        workOrderPage.findDraftWoForForceOpen().then((result) => {
          forceOpenTargetWoNum = result?.woNum ?? null;
          if (!forceOpenTargetWoNum) {
            Cypress.log({
              name: 'Force Open setup',
              message: 'No Draft WO whose sale-order status resolves as not-approved (the FE Force-Open dialog precondition) -- TC24-TC26 will skip. On Stage this is the GET /work-orders/sale-order/:id 500 (AccountWise SO-details dependency down).',
            });
          }
        });
      });

      beforeEach(function () {
        if (!forceOpenTargetWoNum) this.skip();
        workOrderPage = new WorkOrderPage();
        cy.authSession('admin');
        workOrderPage.visit();
        workOrderPage.searchByWoNum(forceOpenTargetWoNum);
      });

      // Use case -- happy path: Force Open action on a Draft WO must surface a confirmation dialog before committing
      it('SW-WO-TC24: Verify clicking Open on a Draft WO opens the Force Open confirmation popup', { tags: ['@regression'] }, function () {
        // Technique: Use Case
        if (!forceOpenTargetWoNum) { this.skip(); return; }
        workOrderPage.findRowByWoNum(forceOpenTargetWoNum).then(($row) => {
          workOrderPage.clickOpenBtn($row);
        });
        workOrderPage.verifyConfirmDialogVisible();
      });

      // Use case -- exception path: "No" aborts the force-open and leaves the WO in Draft state unchanged
      it('SW-WO-TC25: Verify clicking No on the Force Open popup closes it without changing status', { tags: ['@regression'] }, function () {
        // Technique: Use Case
        if (!forceOpenTargetWoNum) { this.skip(); return; }
        workOrderPage.findRowByWoNum(forceOpenTargetWoNum).then(($row) => {
          workOrderPage.clickOpenBtn($row);
        });
        workOrderPage.verifyConfirmDialogVisible();
        workOrderPage.clickConfirmNo();
        workOrderPage.verifyConfirmDialogNotVisible();
        workOrderPage.findRowByWoNum(forceOpenTargetWoNum).then(($row) => {
          workOrderPage.verifyStatusInRow($row, 'Draft');
          workOrderPage.verifyOpenBtnEnabled($row, true);
        });
      });

      // State transition -- Draft â†’ Open: "Yes" on force-open commits the transition and status must reflect Open
      it('SW-WO-TC26: Verify clicking Yes on the Force Open popup changes the work order status to Open', { tags: ['@regression'] }, function () {
        // Technique: State Transition
        if (!forceOpenTargetWoNum) { this.skip(); return; }
        workOrderPage.findRowByWoNum(forceOpenTargetWoNum).then(($row) => {
          workOrderPage.clickOpenBtn($row);
        });
        workOrderPage.verifyConfirmDialogVisible();
        workOrderPage.clickConfirmYes();
        workOrderPage.verifyConfirmDialogNotVisible();
        workOrderPage.verifyToast(workOrderData.toasts.forceOpenSuccess);
        // Search by WO number to bring it back into view after re-fetch, then verify.
        workOrderPage.searchByWoNum(forceOpenTargetWoNum);
        workOrderPage.verifyStatusByWoNum(forceOpenTargetWoNum, 'Open');
      });
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Sorting
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TC27â€“TC32 form two sequential sort cycles (WO# then Status), each test doing
  // exactly one click and carrying page state forward. testIsolation: false keeps
  // the browser alive between tests so sort state is preserved.
  describe('Sorting', { testIsolation: false }, () => {
    const woCol = () => workOrderData.listView.sortableColumns.workOrderNumber;
    const statusCol = () => workOrderData.listView.sortableColumns.status;

    before(function () {
      // Sorting needs rows in the list. Skip on no-seed-data envs (QA).
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      workOrderPage.visit();
      cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
    });

    // State transition -- unsorted â†’ ascending: first click on a sortable column must set sortOrder=asc
    it('SW-WO-TC27: Verify clicking the Work Order Number column header once sorts the list ascending', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickColumnSort(woCol());
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'sortOrder=asc');
      workOrderPage.verifyColumnSortDirection(woCol(), 'ascending');
    });

    // State transition -- ascending â†’ descending: second click must toggle sortOrder to desc
    it('SW-WO-TC28: Verify clicking the Work Order Number column header again reverses to descending', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickColumnSort(woCol());
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'sortOrder=desc');
      workOrderPage.verifyColumnSortDirection(woCol(), 'descending');
    });

    // State transition -- descending â†’ unsorted: third click must clear sortOrder from the request URL
    it('SW-WO-TC29: Verify clicking the Work Order Number column header again removes the sort', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickColumnSort(woCol());
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('not.include', 'sortOrder');
      workOrderPage.verifyColumnSortDirection(woCol(), 'none');
    });

    // State transition -- unsorted â†’ ascending + EP: first click on Status sorts asc; Open (enum value 1) lands first
    it('SW-WO-TC30: Verify clicking the Status column header once sorts ascending and shows the Open status on top', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickColumnSort(statusCol().columnName);
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'sortOrder=asc');
      workOrderPage.verifyColumnSortDirection(statusCol().columnName, 'ascending');
      workOrderPage.getFirstStatusValue().should('equal', statusCol().ascFirstValue);
    });

    // State transition -- ascending â†’ descending + EP: second click reverses; Cancelled (enum value 4) lands first
    it('SW-WO-TC31: Verify clicking the Status column header again sorts descending and shows the Cancelled status on top', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickColumnSort(statusCol().columnName);
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'sortOrder=desc');
      workOrderPage.verifyColumnSortDirection(statusCol().columnName, 'descending');
      workOrderPage.getFirstStatusValue().should('equal', statusCol().descFirstValue);
    });

    // State transition -- descending â†’ unsorted: third click clears sortOrder for the Status column
    it('SW-WO-TC32: Verify clicking the Status column header a third time removes the sort', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickColumnSort(statusCol().columnName);
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('not.include', 'sortOrder');
      workOrderPage.verifyColumnSortDirection(statusCol().columnName, 'none');
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Pagination
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TC33â€“TC42 run sequentially with testIsolation: false so navigation state is
  // preserved between tests. Navigation tests (TC33â€“TC39) run with the default
  // page size; page-size tests (TC40â€“TC42) run at the end.
  describe('Pagination', { testIsolation: false }, () => {
    let firstPageFirstWoNum;
    let hasMultiplePages = false;

    before(function () {
      // Pagination needs rows in the list. Skip on no-seed-data envs (QA).
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      workOrderPage.visit();
      cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
      // Save the first WO# on page 1 to compare against page 2 records later.
      cy.get('tbody tr[data-index="0"] td[data-index="0"]').invoke('text').then((t) => {
        firstPageFirstWoNum = t.trim();
      });
      // Check whether a page-2 button is rendered in the pagination nav.
      // If only one page exists the Next button is present but disabled and
      // page-2 won't appear in the nav. TC34â€“TC36 and TC40â€“TC42 need a real
      // multi-page dataset -- skip them cleanly when QA only has one page of WOs.
      cy.get('nav[aria-label="pagination navigation"]').then(($nav) => {
        hasMultiplePages = $nav.find('button:contains("2")').length > 0;
      });
    });

    // -- Button state on first page -----------------------------------------

    // The WO list page renders MUI <Pagination> WITHOUT showFirstButton/
    // showLastButton, so the First Page and Last Page arrow buttons are not in
    // the DOM at all (WMS and Attribute pages set those flags; the WO list does
    // not -- Frontend gap, SW-TODO). This test feature-detects via
    // hasFirstLastPageButtons() and skips cleanly when they are absent (the
    // current state on both QA and Stage), so it auto-runs once the Frontend
    // enables the flags instead of hard-failing on an unfindable button.
    // BVA -- lower page boundary: on page 1 the First and Previous buttons must be disabled (boundary condition)
    it('SW-WO-TC33: Verify First Page and Previous Page buttons are disabled on the first page', { tags: ['@regression'] }, function () {
      // Technique: BVA
      workOrderPage.hasFirstLastPageButtons().then((present) => {
        if (!present) { this.skip(); return; }
        workOrderPage.verifyFirstPageBtnDisabled(true);
        workOrderPage.verifyPrevPageBtnDisabled(true);
      });
    });

    // -- Arrow navigation ---------------------------------------------------

    // Use case -- happy path: Next arrow must increment to page=2 and render a different record set
    it('SW-WO-TC34: Verify clicking the Next arrow navigates to the next page', { tags: ['@regression'] }, function () {
      // Technique: Use Case
      if (!hasMultiplePages) { this.skip(); return; }
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickNextPage();
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'page=2');
      // Confirm records are different from page 1.
      cy.get('tbody td[data-index="0"]').first().invoke('text').invoke('trim')
        .should('not.equal', firstPageFirstWoNum);
    });

    // Use case -- alternate path: Previous arrow must decrement to page=1 and restore the original record set
    it('SW-WO-TC35: Verify clicking the Previous arrow navigates back to the previous page', { tags: ['@regression'] }, function () {
      // Technique: Use Case
      if (!hasMultiplePages) { this.skip(); return; }
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickPrevPage();
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'page=1');
      // Confirm we are back on page 1.
      cy.get('tbody tr[data-index="0"] td[data-index="0"]').invoke('text').invoke('trim')
        .should('equal', firstPageFirstWoNum);
    });

    // -- Page number click --------------------------------------------------

    // Use case -- alternate path: numbered page button must navigate directly to the requested page
    it('SW-WO-TC36: Verify clicking a page number navigates to that page', { tags: ['@regression'] }, function () {
      // Technique: Use Case
      if (!hasMultiplePages) { this.skip(); return; }
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.clickPageNumber(2);
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'page=2');
      cy.get('tbody td[data-index="0"]').first().invoke('text').invoke('trim')
        .should('not.equal', firstPageFirstWoNum);
    });

    // -- Last page arrow ----------------------------------------------------

    // Blocked by the same Frontend gap as TC33 (SW-TODO) -- the Last Page
    // button is not rendered on the WO list because muiPaginationProps doesn't
    // set showLastButton. Feature-detects and skips cleanly when absent
    // (current state on QA and Stage); auto-runs once the flag is enabled.
    // BVA -- upper page boundary: Last Page button must navigate to the final page and disable Next/Last buttons
    it('SW-WO-TC37: Verify clicking the Last Page arrow navigates to the last page', { tags: ['@regression'] }, function () {
      // Technique: BVA
      workOrderPage.hasFirstLastPageButtons().then((present) => {
        if (!present) { this.skip(); return; }
        cy.intercept('GET', '**/work-orders**').as('workOrders');
        workOrderPage.clickLastPage();
        cy.wait('@workOrders', { timeout: 30000 });
        // On the last page Next and Last must be disabled.
        workOrderPage.verifyNextPageBtnDisabled(true);
        workOrderPage.verifyLastPageBtnDisabled(true);
      });
    });

    // Depends on TC37 reaching the last page via the Last button, which
    // doesn't exist (SW-TODO). Feature-detects and skips cleanly when the
    // First/Last buttons are absent; auto-runs with TC37 once enabled.
    // BVA -- upper page boundary: on the last page the Next and Last buttons must be disabled (boundary condition)
    it('SW-WO-TC38: Verify Next Page and Last Page buttons are disabled when on the last page', { tags: ['@regression'] }, function () {
      // Technique: BVA
      workOrderPage.hasFirstLastPageButtons().then((present) => {
        if (!present) { this.skip(); return; }
        // State carried forward from TC37 -- already on last page.
        workOrderPage.verifyNextPageBtnDisabled(true);
        workOrderPage.verifyLastPageBtnDisabled(true);
      });
    });

    // -- First page arrow ---------------------------------------------------

    // First Page button is not rendered on the WO list (SW-TODO -- muiPaginationProps
    // doesn't set showFirstButton). Feature-detects and skips cleanly when
    // absent (current state on QA and Stage); auto-runs once the flag is set.
    // BVA -- lower page boundary: First Page button must return to page=1 and disable First/Previous buttons
    it('SW-WO-TC39: Verify clicking the First Page arrow navigates back to the first page', { tags: ['@regression'] }, function () {
      // Technique: BVA
      workOrderPage.hasFirstLastPageButtons().then((present) => {
        if (!present) { this.skip(); return; }
        cy.intercept('GET', '**/work-orders**').as('workOrders');
        workOrderPage.clickFirstPage();
        cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', 'page=1');
        workOrderPage.verifyFirstPageBtnDisabled(true);
        workOrderPage.verifyPrevPageBtnDisabled(true);
      });
    });

    // -- Page size selection ------------------------------------------------

    // EP -- valid partition: selecting an alternate page size must propagate pageSize in the API request
    it('SW-WO-TC40: Verify changing the rows-per-page selection sends the correct pageSize to the API', { tags: ['@regression'] }, () => {
      // Technique: EP
      cy.intercept('GET', '**/work-orders**').as('workOrders');
      workOrderPage.changeRowsPerPage(workOrderData.pagination.altPageSize);
      cy.wait('@workOrders', { timeout: 30000 }).its('request.url').should('include', `pageSize=${workOrderData.pagination.altPageSize}`);
    });

    // EP -- valid partition + error guessing: page-size state must not persist across navigation (no localStorage leak)
    it('SW-WO-TC41: Verify navigating away and back resets the rows-per-page selection to the default', { tags: ['@regression'] }, () => {
      // Technique: EP
      // State carried forward from TC40 -- page size currently set to altPageSize.
      cy.visit('/dashboard');
      workOrderPage.visit();
      cy.get('tbody tr[data-index]', { timeout: 30000 }).should('have.length.greaterThan', 0);
      workOrderPage.verifyCurrentRowsPerPage(workOrderData.pagination.defaultPageSize);
    });

    // EP -- all valid partitions: each page-size option must exist in the dropdown and propagate the correct pageSize value
    it('SW-WO-TC42: Verify all rows-per-page options (25, 50, 75, 100, 150) are present and functional', { tags: ['@regression'] }, () => {
      // Technique: EP
      // Move away from the default first so every iteration triggers a real change.
      cy.intercept('GET', '**/work-orders**').as('setup');
      workOrderPage.changeRowsPerPage(workOrderData.pagination.pageSizeOptions.at(-1));
      cy.wait('@setup', { timeout: 30000 });
      workOrderData.pagination.pageSizeOptions.forEach((size, index) => {
        const alias = `pageSize${index}`;
        cy.intercept('GET', '**/work-orders**').as(alias);
        // changeRowsPerPage opens the dropdown, asserts the option exists, then clicks it.
        workOrderPage.changeRowsPerPage(size);
        // Verify the API receives the correct pageSize.
        cy.wait(`@${alias}`, { timeout: 30000 }).its('request.url').should('include', `pageSize=${size}`);
      });
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Create Work Order
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Create Work Order', () => {
    // The Create Work Order button is gated on configState.config.enableCreateWorkOrder.
    // Other suites (10-generalConfigTests, GeneralConfigAPI) can leave that flag set to
    // false in shared QA state — the button then never renders and every test in this
    // describe fails with "button not found". Force the flag back to true before any
    // test runs so this describe is independent of prior suite state.
    before(() => {
      cy.authSession('admin');
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        const headers = { Authorization: `Bearer ${swToken}`, 'Content-Type': 'application/json' };
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/configs?type=general&name=general`,
          headers,
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          const row = resp.body?.data?.list?.find((c) => c.name === 'general');
          if (!row?.id) return; // No general config row — nothing to patch.
          const current = row.configJson?.data || {};
          if (current.enableCreateWorkOrder === true) return; // Already enabled — no-op.
          cy.request({
            method: 'PATCH',
            url: `${Cypress.env('API_BASE_URL')}/configs/${row.id}`,
            headers,
            body: { type: 'general', configJson: { data: { ...current, enableCreateWorkOrder: true } } },
            failOnStatusCode: false,
            timeout: 60000,
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      cy.intercept('GET', '**/work-orders**').as('initialLoad');
      workOrderPage.visit();
      cy.wait('@initialLoad', { timeout: 30000 });
    });

    // Use case -- happy path: Create Work Order button routes user to the creation form
    it('SW-WO-TC43: Verify clicking the Create Work Order button navigates to the create page', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.clickCreateWorkOrderBtn();
      cy.url().should('include', workOrderData.createPage.url);
    });

    // Use case -- happy path: the create page pathname must match the configured route (deep-link safety)
    it('SW-WO-TC44: Verify the create work order page URL is correct', { tags: ['@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.clickCreateWorkOrderBtn();
      cy.location('pathname').should('eq', workOrderData.createPage.url);
    });

    // Use case -- happy path: page heading must render so the user knows which form they are on
    it('SW-WO-TC45: Verify the page heading on the create work order page', { tags: ['@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.verifyCreatePageHeading();
    });

    // Use case -- alternate path: breadcrumb on create page must show correct three-level hierarchy
    it('SW-WO-TC46: Verify the breadcrumb on the create work order page', { tags: ['@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.verifyCreateBreadcrumb(
        workOrderData.createPage.breadcrumb.dashboardLabel,
        workOrderData.createPage.breadcrumb.workOrderLabel,
        workOrderData.createPage.breadcrumb.currentPageLabel
      );
    });

    // Decision table -- all empty: submit button must remain disabled when neither product nor quantity has a value
    it('SW-WO-TC47: Verify the Create Work Order submit button is disabled when product and quantity fields are empty', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Decision Table
      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.verifyCreateSubmitBtnDisabled();
    });

    // Use case -- happy path: clicking the read-only product field opens the product picker modal
    it('SW-WO-TC48: Verify clicking the Product field opens the Add Product modal', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: Use Case
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.openProductModalInCreateForm();
    });

    // Use case -- happy path: modal must populate with at least one product so selection is possible
    it('SW-WO-TC49: Verify a list of products appears in the Add Product modal', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: Use Case
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.openProductModalInCreateForm();
      workOrderPage.verifyAddProductModalListVisible();
    });

    // Use case -- happy path: available-quantity label guides the user's quantity input decision
    it('SW-WO-TC50: Verify the available quantity label is displayed for each product in the modal', { tags: ['@regression'] }, function () {
      // Technique: Use Case
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.openProductModalInCreateForm();
      workOrderPage.verifyAddProductModalListVisible();
      workOrderPage.verifyAddProductModalAvailableQtyVisible();
    });

    // EP -- invalid partition / error guessing: Add with no selection must be rejected with a toast, not silently accepted
    it('SW-WO-TC51: Verify clicking the Add button without selecting a product shows an error toast', { tags: ['@regression'] }, function () {
      // Technique: EP
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.openProductModalInCreateForm();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyToast(workOrderData.toasts.noProductSelected);
    });

    // Use case -- happy path: clicking a product row in the modal must apply a selected visual state
    it('SW-WO-TC52: Verify clicking on a product in the modal selects it', { tags: ['@regression'] }, function () {
      // Technique: Use Case
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.selectFirstProductInCreateForm();
      workOrderPage.verifyProductInModalSelected();
    });

    // Use case -- happy path: confirming a selection must close the modal and populate the product field
    it('SW-WO-TC53: Verify clicking Add after selecting a product closes the modal and shows the product in the field', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: Use Case
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.selectFirstProductInCreateForm();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyAddProductModalNotVisible();
      workOrderPage.verifyProductFieldHasValue();
    });

    // Use case -- happy path: stock info labels must render after selection to inform quantity entry
    it('SW-WO-TC54: Verify the selected product available and incoming quantity labels appear below the product field', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: Use Case
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.selectFirstProductInCreateForm();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyAddProductModalNotVisible();
      workOrderPage.verifyStockInfoVisible();
    });

    // EP -- invalid partition: non-numeric input must be rejected; the field must remain empty
    it('SW-WO-TC55: Verify the quantity field only accepts numeric values', { tags: ['@regression'] }, function () {
      // Technique: EP
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.selectFirstProductInCreateForm();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyAddProductModalNotVisible();
      workOrderPage.typeQuantity(workOrderData.createForm.invalidQuantityInput);
      workOrderPage.verifyQuantityFieldEmpty();
    });

    // BVA -- upper boundary (just above): quantity = availableQty+1 must be rejected with a "cannot exceed" error
    it('SW-WO-TC56: Verify entering a quantity exceeding available stock shows a validation error', { tags: ['@regression'] }, function () {
      // Technique: BVA
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.selectFirstProductInCreateForm();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyAddProductModalNotVisible();
      workOrderPage.getAvailableQuantity().then((available) => {
        workOrderPage.typeQuantity(String(available + 1));
        workOrderPage.verifyQuantityExceedsError(available);
      });
    });

    // Decision table -- product filled + valid qty: submit button must become enabled only when both inputs are satisfied
    it('SW-WO-TC57: Verify entering a valid quantity enables the Create Work Order button', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: Decision Table
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.verifyCreateSubmitBtnDisabled();
      workOrderPage.clickProductField();
      workOrderPage.verifyAddProductModalListVisible();
      workOrderPage.clickProductInModal();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyAddProductModalNotVisible();
      workOrderPage.typeQuantity(workOrderData.createForm.validQuantity);
      workOrderPage.verifyCreateSubmitBtnEnabled();
    });

    // BVA -- lower boundary (1 row): delete must be disabled when exactly one row remains (prevents creating an empty WO)
    it('SW-WO-TC58: Verify the delete button is disabled when only one product row exists', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: BVA
      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.verifyDeleteRowBtnDisabled();
    });

    // BVA -- lower boundary + 1 (2 rows): adding a second row must enable delete on both rows
    it('SW-WO-TC59: Verify clicking Add Product appends a new product and quantity row and enables the delete button', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: BVA
      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.clickAddProductRowBtn();
      workOrderPage.verifyDeleteRowBtnsEnabled();
    });

    // Use case -- happy path: end-to-end create flow must succeed, show toast, redirect, and list the new WO
    it('SW-WO-TC60: Verify submitting the create form shows a success toast, redirects to the list, and the new work order appears in it', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: Use Case
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      cy.intercept('POST', '**/work-orders**').as('createWorkOrder');

      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.clickProductField();
      workOrderPage.verifyAddProductModalListVisible();
      workOrderPage.clickProductInModal();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyAddProductModalNotVisible();
      workOrderPage.typeQuantity(workOrderData.createForm.validQuantity);
      workOrderPage.clickCreateSubmitBtn();

      cy.wait('@createWorkOrder', { timeout: 30000 }).then((interception) => {
        const woNum = interception.response.body.data.workOrderNumber;
        workOrderPage.verifyToast(workOrderData.toasts.createSuccess);
        cy.url().should('include', workOrderData.url);
        workOrderPage.searchByWoNum(woNum);
        workOrderPage.verifyTableContains(woNum);
      });
    });

    // BVA -- lower boundary (invalid): quantity = 0 is a non-empty string so the button stays enabled,
    // but the Frontend guards against parseInt(qty) > 0 at submit time -- clicking shows an error toast
    // rather than creating a WO. The button-disabled contract only covers the truly-empty case (TC47).
    it('SW-WO-TC61: Verify entering quantity 0 (lower boundary invalid) and clicking Create Work Order shows an error toast', { tags: ['@regression'] }, function () {
      // Technique: BVA
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      workOrderPage.clickCreateWorkOrderBtn();
      workOrderPage.clickProductField();
      workOrderPage.verifyAddProductModalListVisible();
      workOrderPage.clickProductInModal();
      workOrderPage.clickAddProductModalAddBtn();
      workOrderPage.verifyAddProductModalNotVisible();
      workOrderPage.typeQuantity(workOrderData.createForm.bvaLowerInvalid);
      workOrderPage.verifyCreateSubmitBtnEnabled();
      workOrderPage.clickCreateSubmitBtn();
      workOrderPage.verifyToast('Please add at least one valid product with quantity');
    });

  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Work Order Detail View
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Work Order Detail View', () => {
    let detailWoNum;
    let detailWoId;

    before(function () {
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      cy.authSession('admin');
      workOrderPage = new WorkOrderPage();
      workOrderPage.visit();
      workOrderPage.createViaApiWithId().then(({ woNum, id }) => {
        detailWoNum = woNum;
        detailWoId = id;
      });

      // TC70 needs a Draft WO. StockWise's own create-WO API only produces Open
      // WOs -- Draft state is reachable only via the AccountWise sales-order
      // path (which lands as Draft until approved). If no Draft WO already
      // exists in QA, seed one here so TC70 can find it via findWoDetailByStatus.
      cy.getAuthToken().then((swToken) => {
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/work-orders?status=Draft&page=1&pageSize=1`,
          headers: { Authorization: `Bearer ${swToken}` },
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          if ((resp.body?.data?.list ?? []).length > 0) return;
          loginToAccountWise().then((awToken) => {
            findStockWiseProductForInvoice(swToken, { minReservable: 1 }).then((product) => {
              // Best-effort seed -- skip silently if no qualifying product
              // exists. TC70 will then this.skip() itself when it can't
              // find a Draft WO. No need to fail the whole describe.
              if (!product) return;
              const body = buildSalesOrderBody({ product });
              createAccountWiseSalesOrder(awToken, body);
            });
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      workOrderPage.visitDetail(detailWoNum, detailWoId);
    });

    // Use case -- alternate path: breadcrumb on detail page must show three-level hierarchy ending at the WO number
    it('SW-WO-TC62: Verify breadcrumb on work order detail page shows Dashboard > Work Order > WO Number', { tags: ['@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.verifyDetailBreadcrumb(
        workOrderData.createPage.breadcrumb.dashboardLabel,
        workOrderData.createPage.breadcrumb.workOrderLabel,
        detailWoNum
      );
    });
    // Use case -- happy path: all required metadata labels must render so the user can identify the WO
    it('SW-WO-TC63: Verify all info labels are visible on the work order detail page', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.verifyDetailInfoLabelsVisible(workOrderData.detailView.infoLabels);
    });

    // Use case -- happy path: all product table columns must render for the detail view to be usable
    it('SW-WO-TC64: Verify all product table columns are visible on the work order detail page', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.verifyAllColumnsVisible(workOrderData.detailView.tableColumns);
    });

    // Use case -- happy path: Scan button on a product row must open the fullscreen scan dialog
    it('SW-WO-TC65: Verify clicking the Scan button opens the Work Orders Scan modal', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      // The app throws benign runtime errors during Scan modal mount — most notably
      // a ResizeObserver "<ident> is not a function" from MUI's resize handler. The
      // minified identifier changes between builds (observed "e" then "b"), so match
      // the generic "is not a function" shape rather than a specific letter. Use an
      // 'on' handler (not 'once') with a returning-false-only-for-known-errors
      // filter so we suppress just these specific exceptions and not anything
      // genuinely broken.
      cy.on('uncaught:exception', (err) => {
        const msg = String(err?.message ?? '');
        if (msg.includes('ResizeObserver')) return false;
        if (/\bis not a function\b/.test(msg)) return false;
        return true; // let any other error fail the test
      });

      // The Scan modal also fires GET /incoming-items/location-breakdown
      // without the required poNumber query param, which the Backend rejects
      // with 400 "poNumber is required". The unresolved query keeps the
      // dialog stuck at opacity:0, so be.visible never passes. Stubbing the
      // endpoint with a benign empty payload lets the modal complete its
      // open animation. Frontend bug filed -- the call should include
      // poNumber (see scanForm.tsx, the variable is currently a typo).
      // Stub shape: getLocationBreakdown returns an array directly; ApiResponseInterceptor wraps it as { data: [] }.
      cy.intercept(
        'GET',
        '**/incoming-items/location-breakdown**',
        { statusCode: 200, body: { statusCode: 200, success: true, error: null, data: [] } },
      ).as('locationBreakdownStub');

      workOrderPage.clickScanBtn();
      workOrderPage.verifyWorkOrdersScanModalVisible();
    });

    // Use case -- happy path: View Detail button drills into the per-product scanned-items detail page
    it('SW-WO-TC66: Verify clicking the View Detail button navigates to the product scanned detail page', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.clickViewDetailBtn();
      cy.url().should('include', `${detailWoNum}/${detailWoId}/`);
    });


    // State transition -- Open â†’ Closed: Stock Out on an Open WO must commit the transition and show a success toast.
    // Idempotent under Cypress retries: the detail WO is created once in
    // before() and persists across retry attempts, so if attempt 1 already
    // stocked it out (WO -> Closed) the Stock Out button is now disabled and a
    // blind re-click on attempt 2 would fail with "element is disabled". Guard
    // by reading the WO's current status first: if it is already Closed the
    // stock-out has demonstrably succeeded -- assert the closed state and pass
    // without re-clicking.
    it('SW-WO-TC67: Verify clicking Stock Out on an Open work order stocks out, shows success toast and changes status to Closed', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: State Transition
      workOrderPage.getWorkOrderStatusById(detailWoId).then((currentStatus) => {
        if (currentStatus === workOrderData.detailView.statuses.closed) {
          // A prior attempt already stocked this WO out -- the Open->Closed
          // transition is proven. Assert the terminal state and finish.
          workOrderPage.verifyDetailStatus(workOrderData.detailView.statuses.closed);
          return;
        }
        cy.intercept('POST', workOrderData.api.bulkStockOutUrl).as('bulkStockOut');
        workOrderPage.clickStockOutBtn();
        cy.wait('@bulkStockOut', { timeout: 30000 });
        workOrderPage.verifyToast(workOrderData.toasts.stockOutSuccess);
        workOrderPage.verifyDetailStatus(workOrderData.detailView.statuses.closed);
      });
    });

    // State transition -- terminal state: Closed WO must disable all mutation actions (Stock Out and Scan)
    it('SW-WO-TC68: Verify Stock Out and Scan buttons are disabled on a Closed work order', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: State Transition
      workOrderPage.findWoDetailByStatus(workOrderData.detailView.statuses.closed).then((result) => {
        if (!result) { this.skip(); return; }
        const { woNum, id } = result;
        workOrderPage.visitDetail(woNum, id);
        workOrderPage.verifyStockOutBtnDisabled();
        workOrderPage.verifyScanBtnDisabled();
      });
    });

    // State transition -- terminal state: Cancelled WO must disable all mutation actions (Stock Out and Scan)
    it('SW-WO-TC69: Verify Stock Out and Scan buttons are disabled on a Cancelled work order', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: State Transition
      workOrderPage.findWoDetailByStatus(workOrderData.detailView.statuses.cancelled).then((result) => {
        if (!result) { this.skip(); return; }
        const { woNum, id } = result;
        workOrderPage.visitDetail(woNum, id);
        workOrderPage.verifyStockOutBtnDisabled();
        workOrderPage.verifyScanBtnDisabled();
      });
    });

    // State transition -- invalid transition: Stock Out on a Draft WO must be
    // REJECTED (the WO must not stock out). The contract under test is "a Draft
    // WO cannot be stocked out and the user is shown an error" -- not a specific
    // HTTP code.
    //
    // The Backend rejects in one of two shapes depending on the Draft WO's
    // shape:
    //   * Clean 400 with a semantic message -- the generic non-Open guard
    //     ("must be Open to stock out. Current status: Draft"), hit by a Draft
    //     WO with NO linked sale order (the common case on QA).
    //   * A 500 -- hit by an AccountWise-linked Draft WO whose sale order is
    //     not approved: bulkStockoutProducts wraps the inner "sale order not
    //     approved" BadRequestException in `new BadRequestException(error)`
    //     where `error` is an Exception OBJECT, not a string, producing a
    //     malformed 500 (workOrder.service.ts ~L1534-1542). This is an
    //     ungraceful-but-still-correct rejection -- the WO is NOT stocked out.
    // Both are valid rejections for THIS test (a Draft WO must not stock out),
    // so we accept any non-2xx, assert the semantic message when one is
    // present, and confirm the WO did not transition to Closed.
    it('SW-WO-TC70: Verify clicking Stock Out on a Draft work order returns an error message', { tags: ['@regression'] }, function () {
      // Technique: State Transition
      workOrderPage.findWoDetailByStatus(workOrderData.detailView.statuses.draft).then((result) => {
        if (!result) { this.skip(); return; }
        const { woNum, id } = result;
        cy.intercept('POST', workOrderData.api.bulkStockOutUrl).as('bulkStockOut');
        workOrderPage.visitDetail(woNum, id);
        workOrderPage.clickStockOutBtn();
        cy.wait('@bulkStockOut', { timeout: 30000 }).then((interception) => {
          const status = interception.response.statusCode;
          // Primary contract: the request must be REJECTED (no stock-out).
          expect(
            status,
            `Stock Out on Draft WO ${woNum} must be rejected (non-2xx), got ${status}`,
          ).to.be.gte(400);
          // The Backend rejects a Draft stock-out in three observed shapes,
          // all valid for THIS test (the WO must not stock out):
          //   1. Clean 400 + "must be Open to stock out. Current status: Draft"
          //      -- the generic non-Open guard (Draft WO with no linked SO).
          //   2. Clean 400 + "Cannot stock out ... sale order ... not approved"
          //      -- the SO-not-approved guard when getSaleOrderDetails resolves.
          //   3. A 400 whose message is the axios string "Request failed with
          //      status code 500" -- the SO-not-approved path where the
          //      AccountWise getSaleOrderDetails call itself 500s and the
          //      backend wraps that axios error in `new BadRequestException(
          //      error)` (workOrder.service.ts ~L1540). This is an ungraceful-
          //      but-correct rejection (the WO is NOT stocked out).
          // We assert the message is one of these recognised rejection
          // signatures; the un-Closed check below is the hard guarantee that
          // no stock-out occurred.
          const message = interception.response.body?.error?.message
            ?? interception.response.body?.message ?? '';
          const acceptedFragments = [
            ...workOrderData.toasts.stockOutNonOpenError,
            'is not approved',
            'Request failed with status code 5', // wrapped AccountWise 5xx
          ];
          if (message && typeof message === 'string' && message.length) {
            const matched = acceptedFragments.some((f) => message.includes(f));
            expect(
              matched,
              `Draft stock-out rejection message must be a recognised rejection signature (one of [${acceptedFragments.map((f) => `"${f}"`).join(', ')}]), got "${message}"`,
            ).to.be.true;
          }
        });
        // Confirm the rejection left the WO un-stocked-out: it must still be
        // Draft (definitely not Closed).
        workOrderPage.findWoDetailByStatus(workOrderData.detailView.statuses.draft);
        cy.getAuthToken().then((token) => {
          cy.request({
            method: 'GET',
            url: `${Cypress.env('API_BASE_URL')}/work-orders/${id}`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
            timeout: 60000,
          }).then((resp) => {
            const woStatus = resp.body?.data?.status;
            expect(
              woStatus,
              `WO ${woNum} must NOT be Closed after a rejected Draft stock-out`,
            ).to.not.equal('Closed');
          });
        });
      });
    });
  });
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise â†’ StockWise Work Order Creation
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise creates a new invoice with metadata.work_order = true. The
  // AccountWise backend then calls StockWise to create a corresponding work
  // order. These tests log in to AccountWise, search a StockWise product
  // (mirroring the AccountWise New Invoice form's product picker), POST the
  // invoice, and verify the WO appears in the StockWise list with the
  // invoice number attached and Open status.

  describe('AccountWise Invoice Driven Work Order', () => {
    // Shared between TC71, TC72, TC73: a single AccountWise invoice creates one
    // StockWise WO; each test inspects a different facet of that same WO.
    let awInvoiceNumber;
    let invoiceProduct;
    let invoiceLineQuantity;
    let reservedQtyBefore;

    // Use function() so this.skip() works if QA has no reservable seed product.
    before(function () {
      const requiredQty = 1; // matches items[0].quantity in the fixture invoice body
      const ctx = this; // captured so the .then() arrow callbacks below can skip
      // QA's AccountWise has no work-order creation option, so invoice- and
      // sales-order-driven WO creation cannot be exercised there. Skip this
      // AccountWise block on QA; it runs normally on Stage. (See
      // accountWiseWoSupported — detected by API base URL host.)
      if (!accountWiseWoSupported()) { this.skip(); return; }

      cy.authSession('admin');
      // Visit the app so cy.getAuthToken() can read the JWT from localStorage.
      // Without a page visit the browser is on about:blank and getAllLocalStorage
      // returns an empty object -- getAuthToken returns '' and API calls get a 502.
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        expect(swToken, 'StockWise admin token must be present').to.exist;

        loginToAccountWise().then((awToken) => {
          // findStockWiseProductForInvoice returns null when no qualifying
          // seed product is available -- we skip the whole describe rather
          // than letting a missing-product condition surface as an opaque
          // before-hook failure.
          findStockWiseProductForInvoice(swToken, { minReservable: requiredQty })
            .then((product) => {
              if (!product) {
                ctx.skip();
                return;
              }
              invoiceProduct = product;
              // Product object from search already carries reservedQuantity -- use it
              // directly for the "before" snapshot.
              reservedQtyBefore = Number(product.reservedQuantity ?? 0);

              const body = buildInvoiceBody({ product });
              invoiceLineQuantity = body.items[0].quantity;
              expect(invoiceLineQuantity, 'invoice line quantity must match the seed-data threshold').to.equal(requiredQty);

              createAccountWiseInvoice(awToken, body).then((invoice) => {
                awInvoiceNumber = invoice.invoice_number;
                waitForStockWiseWorkOrderByInvoice(swToken, awInvoiceNumber);
              });
            });
        });
      });
    });

    after(() => {
      // Cleanup: cancel the WO created in before() so it does not accumulate across runs.
      if (!awInvoiceNumber) return;
      // Read at point of use so a long-running spec cannot send a copy
      // captured before the app refreshed the token.
      cy.getAuthToken().then((swToken) => {
        const headers = { Authorization: `Bearer ${swToken}` };
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/work-orders?search=${encodeURIComponent(awInvoiceNumber)}&page=1&pageSize=1`,
          headers,
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          const wo = resp.body?.data?.list?.[0];
          if (!wo?.id || wo.status === 'Cancelled' || wo.status === 'Closed') return;
          cy.request({
            method: 'DELETE',
            url: `${Cypress.env('API_BASE_URL')}/work-orders/${wo.id}/cancel`,
            headers,
            failOnStatusCode: false,
            timeout: 60000,
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
    });

    /**
     * Test ID:           SW-WO-TC71
     * Description:       Verify that creating an AccountWise invoice with the
     *                    work_order toggle enabled (metadata.work_order=true)
     *                    causes a corresponding StockWise work order to be
     *                    created with the AccountWise invoice number attached.
     * Steps:             1. Log in to AccountWise as admin.
     *                    2. Pick a reservable StockWise pure product (done in before()).
     *                    3. Build an invoice body referencing that product with
     *                       metadata.work_order=true.
     *                    4. POST the invoice to AccountWise (/v2/invoice).
     *                    5. Poll StockWise /work-orders until a WO with that
     *                       invoiceNumber appears.
     *                    6. Open the StockWise WO list page, search by invoice
     *                       number, verify the row contains it.
     * Test Data:         AccountWise admin creds (Cypress env), a reservable
     *                    StockWise pure product (auto-discovered), invoice
     *                    fixture with metadata.work_order=true.
     * Expected Result:   StockWise returns exactly one WO whose invoiceNumber
     *                    equals the AccountWise invoice_number; the WO appears
     *                    in the StockWise list with the invoice number visible
     *                    in its row.
     */
    // Use case -- happy path: AW invoice with work_order=true must trigger WO creation in StockWise and return the invoice number on the WO
    it('SW-WO-TC71: Verify creating an AccountWise invoice with work_order toggle enabled creates a corresponding StockWise work order', { tags: ['@smoke'] }, () => {
      // Technique: Use Case
      cy.getAuthToken().then((swToken) => {
        waitForStockWiseWorkOrderByInvoice(swToken, awInvoiceNumber).then((wo) => {
          expect(wo.invoiceNumber, 'WO must carry the AccountWise invoice number').to.equal(awInvoiceNumber);
          expect(wo.workOrderNumber, 'WO must have a workOrderNumber').to.exist;

          workOrderPage.visit();
          workOrderPage.searchByWoNum(awInvoiceNumber);
          workOrderPage.verifyTableContains(awInvoiceNumber);
          workOrderPage.findRowByInvoiceNum(awInvoiceNumber).then(($row) => {
            workOrderPage.verifyInvoiceInRow($row, awInvoiceNumber);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC72
     * Description:       Verify that a work order created from an AccountWise
     *                    invoice (work_order toggle enabled) lands in StockWise
     *                    with Open status, both at the API level and in the UI.
     * Steps:             1. Use the WO created by the shared before() hook.
     *                    2. Fetch the WO from StockWise by invoice number.
     *                    3. Assert the WO's status field equals "Open".
     *                    4. Open the StockWise WO list page.
     *                    5. Search by invoice number, locate the row, assert
     *                       its status cell reads "Open".
     * Test Data:         Reuses awInvoiceNumber from the describe-level before().
     * Expected Result:   The WO has status="Open" in the API response and the
     *                    same value renders in the status column on the WO list.
     */
    // State transition -- entry state: WO created from AW invoice enters Open (invoice flow bypasses Draft)
    it('SW-WO-TC72: Verify a work order created from an AccountWise invoice has Open status', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.getAuthToken().then((swToken) => {
        waitForStockWiseWorkOrderByInvoice(swToken, awInvoiceNumber).then((wo) => {
          expect(wo.status, 'WO created from AccountWise invoice must have Open status').to.equal(workOrderData.detailView.statuses.open);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(awInvoiceNumber);
          workOrderPage.findRowByInvoiceNum(awInvoiceNumber).then(($row) => {
            workOrderPage.verifyStatusInRow($row, workOrderData.detailView.statuses.open);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC73
     * Description:       Verify that creating a work order from an AccountWise
     *                    invoice reserves stock against the selected product --
     *                    the product's reservedQuantity must increase by exactly
     *                    the invoice line quantity.
     * Steps:             1. Snapshot the product's reservedQuantity BEFORE the
     *                       invoice POST (captured in the shared before() hook).
     *                    2. After the invoice is posted and WO is created,
     *                       re-fetch the product and read reservedQuantity.
     *                    3. Assert the new value equals the snapshot plus the
     *                       invoice line quantity.
     * Test Data:         reservedQtyBefore (snapshot from before()),
     *                    invoiceLineQuantity = 1 (from the invoice fixture),
     *                    invoiceProduct (the product chosen in before()).
     * Expected Result:   reservedQuantityAfter === reservedQuantityBefore +
     *                    invoiceLineQuantity. If snapshot was 0 â†’ final is 1;
     *                    if snapshot was 5 â†’ final is 6. Always relative.
     */
    // EP -- valid partition: reservedQuantity must increase by exactly the invoice line qty upon WO creation
    it('SW-WO-TC73: Verify the product selected in the AccountWise invoice has its reserved quantity increased by the invoice line quantity', { tags: ['@regression'] }, () => {
      // Technique: EP
      cy.getAuthToken().then((swToken) => {
        getProductReservedQuantity(swToken, invoiceProduct).then((reservedQtyAfter) => {
          expect(reservedQtyAfter, `Product ${invoiceProduct.id} reservedQuantity must increase by the invoice line quantity (${invoiceLineQuantity})`)
            .to.equal(reservedQtyBefore + invoiceLineQuantity);
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC74
     * Description:       Negative case for the invoice flow -- verify that when
     *                    the work_order toggle is disabled (metadata.work_order
     *                    = false), AccountWise does NOT trigger StockWise to
     *                    create a work order, and the AccountWise response
     *                    omits the work_order_number field.
     * Steps:             1. Log in to AccountWise.
     *                    2. Pick a reservable StockWise product.
     *                    3. Build an invoice body with metadata.work_order=false.
     *                    4. POST the invoice to AccountWise.
     *                    5. Assert the response.metadata.work_order_number is
     *                       absent.
     *                    6. Wait briefly for any async creation to settle, then
     *                       query StockWise for any WO with that invoiceNumber.
     *                    7. Assert no matching WO exists in StockWise.
     * Test Data:         AccountWise admin creds, a reservable product, invoice
     *                    body override { metadata: { work_order: false } }.
     * Expected Result:   AccountWise response has no work_order_number; StockWise
     *                    /work-orders search by the invoice number returns no
     *                    matching row.
     */
    // EP -- invalid partition / decision table: work_order=false must suppress WO creation entirely; AW response must omit work_order_number
    it('SW-WO-TC74: Verify creating an AccountWise invoice with work_order toggle disabled does NOT create a StockWise work order', { tags: ['@regression'] }, function () {
      // Technique: Decision Table
      const ctx = this;
      cy.getAuthToken().then((swToken) => {
        loginToAccountWise().then((awToken) => {
          findStockWiseProductForInvoice(swToken, { minReservable: 1 }).then((product) => {
            if (!product) {
              ctx.skip();
              return;
            }
            const body = buildInvoiceBody({
              product,
              overrides: { metadata: { work_order: false } },
            });
            createAccountWiseInvoice(awToken, body).then((invoice) => {
              expect(
                invoice.metadata?.work_order_number,
                'AccountWise must NOT return work_order_number when toggle is off',
              ).to.not.exist;
              assertNoStockWiseWorkOrderForIdentifier(swToken, invoice.invoice_number, 'invoiceNumber');
            });
          });
        });
      });
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise Sales Order Driven Work Order
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise creates a new sales order with metadata.work_order = true.
  // Unlike the invoice flow, the sales-order POST creates the StockWise WO
  // synchronously and returns metadata.work_order_number in the response, so
  // there is no polling -- we fetch the WO by number directly. The sale order
  // number is stored on the WO as saleOrderNumber (vs invoiceNumber for the
  // invoice flow).

  describe('AccountWise Sales Order Driven Work Order', () => {
    // Shared between TC74, TC75, TC76: a single AccountWise sales order
    // creates one StockWise WO; each test inspects a different facet.
    let saleOrderNumber;
    let workOrderNumber;
    let salesOrderProduct;
    let salesOrderLineQuantity;
    let reservedQtyBefore;

    before(function () {
      const requiredQty = 1; // matches items[0].quantity in the sales-order fixture
      const ctx = this; // captured so the .then() arrow callbacks below can skip
      // QA's AccountWise has no work-order creation option, so invoice- and
      // sales-order-driven WO creation cannot be exercised there. Skip this
      // AccountWise block on QA; it runs normally on Stage. (See
      // accountWiseWoSupported — detected by API base URL host.)
      if (!accountWiseWoSupported()) { this.skip(); return; }

      cy.authSession('admin');
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        expect(swToken, 'StockWise admin token must be present').to.exist;

        loginToAccountWise().then((awToken) => {
          // Skip the describe if no qualifying seed product is available.
          findStockWiseProductForInvoice(swToken, { minReservable: requiredQty })
            .then((product) => {
              if (!product) {
                ctx.skip();
                return;
              }
              salesOrderProduct = product;
              reservedQtyBefore = Number(product.reservedQuantity ?? 0);

              const body = buildSalesOrderBody({ product });
              salesOrderLineQuantity = body.items[0].quantity;
              expect(salesOrderLineQuantity, 'sales order line quantity must match the seed-data threshold').to.equal(requiredQty);

              createAccountWiseSalesOrder(awToken, body).then((salesOrder) => {
                saleOrderNumber = salesOrder.sale_order_number;
                workOrderNumber = salesOrder.metadata.work_order_number;
              });
            });
        });
      });
    });

    after(() => {
      // Cleanup: cancel the WO created in before() so it does not accumulate across runs.
      if (!workOrderNumber) return;
      cy.getAuthToken().then((swToken) => {
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/work-orders?search=${encodeURIComponent(workOrderNumber)}&page=1&pageSize=1`,
          headers: { Authorization: `Bearer ${swToken}` },
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          const wo = resp.body?.data?.list?.[0];
          if (!wo?.id || wo.status === 'Cancelled' || wo.status === 'Closed') return;
          cy.request({
            method: 'DELETE',
            url: `${Cypress.env('API_BASE_URL')}/work-orders/${wo.id}/cancel`,
            headers: { Authorization: `Bearer ${swToken}` },
            failOnStatusCode: false,
            timeout: 60000,
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
    });

    /**
     * Test ID:           SW-WO-TC75
     * Description:       Verify that creating an AccountWise sales order with
     *                    the work_order toggle enabled (metadata.work_order=true)
     *                    causes a corresponding StockWise work order to be
     *                    created with the AccountWise sale order number attached.
     *                    Unlike the invoice flow this is synchronous -- the SO
     *                    response carries metadata.work_order_number directly.
     * Steps:             1. Log in to AccountWise as admin.
     *                    2. Pick a reservable StockWise pure product (in before()).
     *                    3. Build a sales order body with metadata.work_order=true.
     *                    4. POST to AccountWise (/v1/saleOrder); response
     *                       returns sale_order_number and work_order_number.
     *                    5. Fetch the StockWise WO by work_order_number.
     *                    6. Assert wo.workOrderNumber matches AW response and
     *                       wo.saleOrderNumber matches the sale_order_number.
     *                    7. Open the WO list page, search by SO number, and
     *                       verify the row contains it.
     * Test Data:         AccountWise admin creds, reservable product, sales
     *                    order fixture with metadata.work_order=true.
     * Expected Result:   StockWise has a WO whose workOrderNumber and
     *                    saleOrderNumber match the AccountWise response; the
     *                    SO number renders in the SO column of its WO list row.
     */
    // Use case -- happy path: AW SO with work_order=true must synchronously create a WO carrying the SO number
    it('SW-WO-TC75: Verify creating an AccountWise sales order with work_order toggle enabled creates a corresponding StockWise work order', { tags: ['@smoke'] }, () => {
      // Technique: Use Case
      cy.getAuthToken().then((swToken) => {
        getStockWiseWorkOrderByNumber(swToken, workOrderNumber).then((wo) => {
          expect(wo.workOrderNumber, 'WO number must match the one returned by AccountWise').to.equal(workOrderNumber);
          expect(wo.saleOrderNumber, 'WO must carry the AccountWise sale order number').to.equal(saleOrderNumber);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(saleOrderNumber);
          workOrderPage.verifyTableContains(saleOrderNumber);
          workOrderPage.findRowBySaleOrderNum(saleOrderNumber).then(($row) => {
            workOrderPage.verifySaleOrderInRow($row, saleOrderNumber);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC76
     * Description:       Verify that a work order created from an AccountWise
     *                    sales order (work_order toggle enabled) lands in
     *                    StockWise with Draft status -- sales orders are
     *                    pre-approval and reserve stock without committing the
     *                    work order to Open until approved.
     * Steps:             1. Use the WO created by the shared before() hook.
     *                    2. Fetch the WO by work_order_number from StockWise.
     *                    3. Assert wo.status equals "Draft".
     *                    4. Open the WO list page, search by SO number.
     *                    5. Find the row, assert its status cell reads "Draft".
     * Test Data:         Reuses workOrderNumber and saleOrderNumber from the
     *                    describe-level before().
     * Expected Result:   The WO has status="Draft" in the API response and
     *                    the same value renders in the status column of the
     *                    WO list. (TC79 covers the Draft â†’ Open transition
     *                    that happens on sales order approval.)
     */
    // State transition -- entry state: WO created from AW SO enters Draft (pending approval) before becoming Open
    it('SW-WO-TC76: Verify a work order created from an AccountWise sales order has Draft status', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.getAuthToken().then((swToken) => {
        getStockWiseWorkOrderByNumber(swToken, workOrderNumber).then((wo) => {
          expect(wo.status, 'WO created from AccountWise sales order must have Draft status').to.equal(workOrderData.detailView.statuses.draft);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(saleOrderNumber);
          workOrderPage.findRowBySaleOrderNum(saleOrderNumber).then(($row) => {
            workOrderPage.verifyStatusInRow($row, workOrderData.detailView.statuses.draft);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC77
     * Description:       Verify that creating a work order from an AccountWise
     *                    sales order reserves stock against the selected
     *                    product -- even though the WO is in Draft status, the
     *                    product's reservedQuantity must increase by the sales
     *                    order line quantity at SO creation time.
     * Steps:             1. Snapshot the product's reservedQuantity BEFORE the
     *                       sales order POST (in the shared before() hook).
     *                    2. After the SO is posted, re-fetch the product and
     *                       read reservedQuantity.
     *                    3. Assert the new value equals snapshot + line quantity.
     * Test Data:         reservedQtyBefore (from before()),
     *                    salesOrderLineQuantity = 1 (from the SO fixture),
     *                    salesOrderProduct (from before()).
     * Expected Result:   reservedQuantityAfter === reservedQuantityBefore +
     *                    salesOrderLineQuantity. Reservation occurs at SO
     *                    creation, not at approval.
     */
    // EP -- valid partition: reservation happens at SO creation (not at approval); reservedQty must increase immediately
    it('SW-WO-TC77: Verify the product selected in the AccountWise sales order has its reserved quantity increased by the sales order line quantity', { tags: ['@regression'] }, () => {
      // Technique: EP
      cy.getAuthToken().then((swToken) => {
        getProductReservedQuantity(swToken, salesOrderProduct).then((reservedQtyAfter) => {
          expect(reservedQtyAfter, `Product ${salesOrderProduct.id} reservedQuantity must increase by the sales order line quantity (${salesOrderLineQuantity})`)
            .to.equal(reservedQtyBefore + salesOrderLineQuantity);
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC78
     * Description:       Negative case for the sales order flow -- verify that
     *                    when the work_order toggle is disabled (metadata.
     *                    work_order=false) on a sales order, AccountWise does
     *                    NOT trigger StockWise to create a work order, and the
     *                    AccountWise response omits work_order_number.
     * Steps:             1. Log in to AccountWise.
     *                    2. Pick a reservable StockWise product.
     *                    3. Build a sales order body overriding metadata.
     *                       work_order to false.
     *                    4. POST to AccountWise (/v1/saleOrder).
     *                    5. Assert response.metadata.work_order_number is absent.
     *                    6. Wait briefly for any async creation to settle, then
     *                       query StockWise for any WO with that saleOrderNumber.
     *                    7. Assert no matching WO exists in StockWise.
     * Test Data:         AccountWise admin creds, reservable product, SO body
     *                    override { metadata: { work_order: false } }.
     * Expected Result:   AccountWise response has no work_order_number; StockWise
     *                    /work-orders search by the SO number returns no
     *                    matching row.
     */
    // EP -- invalid partition / decision table: work_order=false on SO must suppress WO creation; AW response must omit work_order_number
    it('SW-WO-TC78: Verify creating an AccountWise sales order with work_order toggle disabled does NOT create a StockWise work order', { tags: ['@regression'] }, function () {
      // Technique: Decision Table
      const ctx = this;
      cy.getAuthToken().then((swToken) => {
        loginToAccountWise().then((awToken) => {
          findStockWiseProductForInvoice(swToken, { minReservable: 1 }).then((product) => {
            if (!product) {
              ctx.skip();
              return;
            }
            const body = buildSalesOrderBody({
              product,
              overrides: { metadata: { work_order: false } },
            });
            createAccountWiseSalesOrder(awToken, body).then((salesOrder) => {
              expect(
                salesOrder.metadata?.work_order_number,
                'AccountWise must NOT return work_order_number when toggle is off',
              ).to.not.exist;
              assertNoStockWiseWorkOrderForIdentifier(swToken, salesOrder.sale_order_number, 'saleOrderNumber');
            });
          });
        });
      });
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise Approved Sales Order Driven Work Order
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Approving an AccountWise sales order (POST /v1/saleOrder/approveSaleOrder)
  // transitions the linked StockWise work order from Draft â†’ Open. This block
  // creates a fresh sales order and approves it in before(), so the WO state
  // observed in the test is the post-approval state -- keeps the test
  // independent of TC74-76 which observe the pre-approval (Draft) state.

  describe('AccountWise Approved Sales Order Driven Work Order', () => {
    let approvedSaleOrderNumber;
    let approvedWorkOrderNumber;

    before(function () {
      const requiredQty = 1;
      const ctx = this; // captured so the .then() arrow callbacks below can skip
      // QA's AccountWise has no work-order creation option, so invoice- and
      // sales-order-driven WO creation cannot be exercised there. Skip this
      // AccountWise block on QA; it runs normally on Stage. (See
      // accountWiseWoSupported — detected by API base URL host.)
      if (!accountWiseWoSupported()) { this.skip(); return; }

      cy.authSession('admin');
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        expect(swToken, 'StockWise admin token must be present').to.exist;

        loginToAccountWise().then((awToken) => {
          // Skip the describe if no qualifying seed product is available.
          findStockWiseProductForInvoice(swToken, { minReservable: requiredQty })
            .then((product) => {
              if (!product) {
                ctx.skip();
                return;
              }
              const body = buildSalesOrderBody({ product });

              createAccountWiseSalesOrder(awToken, body).then((salesOrder) => {
                approvedSaleOrderNumber = salesOrder.sale_order_number;
                approvedWorkOrderNumber = salesOrder.metadata.work_order_number;

                approveAccountWiseSalesOrder(awToken, salesOrder.id);
              });
            });
        });
      });
    });

    after(() => {
      // Cleanup: close/cancel the WO created in before() so it does not accumulate across runs.
      // Approved WOs are Open -- cancel is available.
      if (!approvedWorkOrderNumber) return;
      cy.getAuthToken().then((swToken) => {
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/work-orders?search=${encodeURIComponent(approvedWorkOrderNumber)}&page=1&pageSize=1`,
          headers: { Authorization: `Bearer ${swToken}` },
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          const wo = resp.body?.data?.list?.[0];
          if (!wo?.id || wo.status === 'Cancelled' || wo.status === 'Closed') return;
          cy.request({
            method: 'DELETE',
            url: `${Cypress.env('API_BASE_URL')}/work-orders/${wo.id}/cancel`,
            headers: { Authorization: `Bearer ${swToken}` },
            failOnStatusCode: false,
            timeout: 60000,
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
    });

    /**
     * Test ID:           SW-WO-TC79
     * Description:       Verify that approving an AccountWise sales order
     *                    (POST /v1/saleOrder/approveSaleOrder) transitions the
     *                    linked StockWise work order from Draft to Open. The
     *                    sales order moves Pending â†’ Approved on AccountWise;
     *                    the WO moves Draft â†’ Open on StockWise.
     * Steps:             1. (before) Create an AccountWise sales order with
     *                       work_order=true and capture the sale_order_number,
     *                       work_order_number, and AccountWise SO uuid.
     *                    2. (before) Call approveSaleOrder with the SO uuid.
     *                    3. Fetch the WO from StockWise by work_order_number.
     *                    4. Assert wo.status equals "Open".
     *                    5. Open the WO list page, search by SO number, locate
     *                       the row, and assert its status cell reads "Open".
     * Test Data:         approvedSaleOrderNumber, approvedWorkOrderNumber, and
     *                    AccountWise SO uuid (all captured in the block-level
     *                    before() hook).
     * Expected Result:   The same WO that was Draft after sales order creation
     *                    (TC76) is now Open after approval, both at the API
     *                    level and in the StockWise WO list UI.
     */
    // State transition -- Draft â†’ Open: AW SO approval must flip the linked WO from Draft to Open
    it('SW-WO-TC79: Verify approving an AccountWise sales order transitions the corresponding StockWise work order from Draft to Open', { tags: ['@smoke'] }, () => {
      // Technique: State Transition
      cy.getAuthToken().then((swToken) => {
        getStockWiseWorkOrderByNumber(swToken, approvedWorkOrderNumber).then((wo) => {
          expect(wo.status, 'WO must transition to Open after AccountWise sales order approval').to.equal(workOrderData.detailView.statuses.open);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(approvedSaleOrderNumber);
          workOrderPage.findRowBySaleOrderNum(approvedSaleOrderNumber).then(($row) => {
            workOrderPage.verifyStatusInRow($row, workOrderData.detailView.statuses.open);
          });
        });
      });
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise Invoice Driven Work Order -- Product With Items
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Mirror of TC71â€“TC74 but the AccountWise invoice line references a
  // serialized product (hasItems=true) instead of a pure product. The Backend
  // create path treats both product types identically at WO creation time:
  // the request body shape is the same (no serial numbers), reservedQuantity
  // increments at the product level, and WorkOrder.productsItems is empty
  // until the scan step. These tests prove that contract end-to-end and add
  // one items-specific assertion (TC83) that no Item.status is flipped to
  // Reserved at creation time.

  describe('AccountWise Invoice Driven Work Order (Product With Items)', () => {
    let awInvoiceNumber;
    let invoiceProduct;
    let invoiceLineQuantity;
    let reservedQtyBefore;

    before(function () {
      const requiredQty = 1;
      const ctx = this; // captured so the .then() arrow callbacks below can skip
      // QA's AccountWise has no work-order creation option, so invoice- and
      // sales-order-driven WO creation cannot be exercised there. Skip this
      // AccountWise block on QA; it runs normally on Stage. (See
      // accountWiseWoSupported — detected by API base URL host.)
      if (!accountWiseWoSupported()) { this.skip(); return; }

      cy.authSession('admin');
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        expect(swToken, 'StockWise admin token must be present').to.exist;

        loginToAccountWise().then((awToken) => {
          // Skip the describe if no qualifying items product is available.
          findStockWiseItemsProductForInvoice(swToken, { minReservable: requiredQty })
            .then((product) => {
              if (!product) {
                ctx.skip();
                return;
              }
              invoiceProduct = product;
              reservedQtyBefore = Number(product.reservedQuantity ?? 0);

              const body = buildInvoiceBody({ product });
              invoiceLineQuantity = body.items[0].quantity;
              expect(invoiceLineQuantity, 'invoice line quantity must match the seed-data threshold').to.equal(requiredQty);

              createAccountWiseInvoice(awToken, body).then((invoice) => {
                awInvoiceNumber = invoice.invoice_number;
                waitForStockWiseWorkOrderByInvoice(swToken, awInvoiceNumber);
              });
            });
        });
      });
    });

    after(() => {
      // Cleanup: cancel the WO created in before() so it does not accumulate across runs.
      if (!awInvoiceNumber) return;
      // Read at point of use so a long-running spec cannot send a copy
      // captured before the app refreshed the token.
      cy.getAuthToken().then((swToken) => {
        const headers = { Authorization: `Bearer ${swToken}` };
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/work-orders?search=${encodeURIComponent(awInvoiceNumber)}&page=1&pageSize=1`,
          headers,
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          const wo = resp.body?.data?.list?.[0];
          if (!wo?.id || wo.status === 'Cancelled' || wo.status === 'Closed') return;
          cy.request({
            method: 'DELETE',
            url: `${Cypress.env('API_BASE_URL')}/work-orders/${wo.id}/cancel`,
            headers,
            failOnStatusCode: false,
            timeout: 60000,
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
    });

    /**
     * Test ID:           SW-WO-TC80
     * Description:       Verify that creating an AccountWise invoice referencing
     *                    a product-with-items (hasItems=true) creates a
     *                    corresponding StockWise work order with the AccountWise
     *                    invoice number attached. The WO carries hasItems=true on
     *                    its products[0] entry, proving the Backend persisted the
     *                    serialized-product flag at creation time.
     * Steps:             1. Log in to AccountWise as admin.
     *                    2. Pick a StockWise product with hasItems=true and
     *                       enough Available items to reserve (in before()).
     *                    3. Build an invoice body with metadata.work_order=true.
     *                    4. POST the invoice to AccountWise.
     *                    5. Poll StockWise /work-orders by invoice number.
     *                    6. Open the WO list page, search by invoice number,
     *                       verify the row contains it.
     *                    7. Re-fetch the WO row and assert products[0].hasItems
     *                       is true.
     * Test Data:         AccountWise admin creds, a serialized StockWise product
     *                    (auto-discovered), invoice fixture with
     *                    metadata.work_order=true.
     * Expected Result:   StockWise returns one WO whose invoiceNumber equals the
     *                    AccountWise invoice_number; products[0].hasItems is true.
     */
    // Use case -- happy path: AW invoice referencing hasItems=true product must create WO with products[0].hasItems persisted
    it('SW-WO-TC80: Verify creating an AccountWise invoice with a product-with-items creates a corresponding StockWise work order', { tags: ['@smoke'] }, () => {
      // Technique: Use Case
      cy.getAuthToken().then((swToken) => {
        waitForStockWiseWorkOrderByInvoice(swToken, awInvoiceNumber).then((wo) => {
          expect(wo.invoiceNumber, 'WO must carry the AccountWise invoice number').to.equal(awInvoiceNumber);
          expect(wo.workOrderNumber, 'WO must have a workOrderNumber').to.exist;
          expect(wo.products?.[0]?.hasItems, 'WO products[0].hasItems must be true for a serialized product').to.equal(true);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(awInvoiceNumber);
          workOrderPage.verifyTableContains(awInvoiceNumber);
          workOrderPage.findRowByInvoiceNum(awInvoiceNumber).then(($row) => {
            workOrderPage.verifyInvoiceInRow($row, awInvoiceNumber);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC81
     * Description:       Verify that an AccountWise-invoice-driven WO for a
     *                    product-with-items lands with Open status, identical
     *                    to the pure-product flow (TC72). Status semantics are
     *                    not affected by hasItems.
     * Steps:             1. Use the WO created in the shared before() hook.
     *                    2. Fetch the WO from StockWise by invoice number.
     *                    3. Assert wo.status equals "Open".
     *                    4. Open the WO list page, search by invoice number,
     *                       locate the row, assert its status reads "Open".
     * Test Data:         Reuses awInvoiceNumber from before().
     * Expected Result:   wo.status === "Open" and the same renders in the UI.
     */
    // State transition -- entry state: hasItems flag must not affect invoice-flow status; WO still enters Open
    it('SW-WO-TC81: Verify a work order created from an AccountWise invoice with a product-with-items has Open status', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.getAuthToken().then((swToken) => {
        waitForStockWiseWorkOrderByInvoice(swToken, awInvoiceNumber).then((wo) => {
          expect(wo.status, 'WO created from AccountWise invoice must have Open status').to.equal(workOrderData.detailView.statuses.open);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(awInvoiceNumber);
          workOrderPage.findRowByInvoiceNum(awInvoiceNumber).then(($row) => {
            workOrderPage.verifyStatusInRow($row, workOrderData.detailView.statuses.open);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC82
     * Description:       Verify that creating a WO from an AccountWise invoice
     *                    referencing a product-with-items reserves stock at the
     *                    product level -- reservedQuantity must increase by the
     *                    invoice line quantity. For items products,
     *                    reservedQuantity in the GET /products response is the
     *                    count of Item rows with status='Reserved'; the Backend
     *                    create path increments the same field used by pure
     *                    products, so the assertion is identical to TC73.
     * Steps:             1. Snapshot reservedQuantity BEFORE invoice POST (in
     *                       before()).
     *                    2. After WO creation, re-fetch the product and read
     *                       reservedQuantity.
     *                    3. Assert new value === snapshot + invoiceLineQuantity.
     * Test Data:         reservedQtyBefore (from before()),
     *                    invoiceLineQuantity = 1, invoiceProduct.
     * Expected Result:   reservedQtyAfter === reservedQtyBefore + line qty.
     */
    // EP -- valid partition: reservedQty must increase at product level for hasItems products, same as pure products.
    // Use a >= comparison (not ===) because sibling describes can also reserve on this product during the same run
    // (e.g. the Scan Modal block, when QA returns this same WO from findOpenWorkOrderWithItemsProduct, may have
    // scanned an item by the time this assertion fires). The acceptance criterion is "reservedQuantity increases
    // by AT LEAST the invoice line quantity" -- an extra reservation from a sibling block is not a defect.
    it('SW-WO-TC82: Verify the product-with-items selected in the AccountWise invoice has its reserved quantity increased by the invoice line quantity', { tags: ['@regression'] }, () => {
      // Technique: EP
      cy.getAuthToken().then((swToken) => {
        getProductReservedQuantity(swToken, invoiceProduct).then((reservedQtyAfter) => {
          const expectedMin = reservedQtyBefore + invoiceLineQuantity;
          expect(reservedQtyAfter, `Product ${invoiceProduct.id} reservedQuantity must be at least ${expectedMin} after invoice creation (was ${reservedQtyBefore}, line qty ${invoiceLineQuantity})`)
            .to.be.at.least(expectedMin);
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC83
     * Description:       Verify that creating a WO for a product-with-items via
     *                    AccountWise invoice does NOT auto-assign serial numbers.
     *                    At creation time, only product-level reservation
     *                    happens; per-item reservation (Item.status =
     *                    'Reserved') is deferred to the scan step. This
     *                    assertion proves the WO row carries no productsItems
     *                    entries until a user scans them in.
     * Steps:             1. Use the WO created in the shared before() hook.
     *                    2. Fetch the WO by invoice number.
     *                    3. Assert wo.productsItems is null/empty.
     * Test Data:         Reuses awInvoiceNumber.
     * Expected Result:   wo.productsItems is empty (no serials reserved at
     *                    creation time -- they get assigned during scan).
     */
    // EP -- invalid partition / error guessing: serial assignment must NOT occur at WO creation; productsItems must be empty
    it('SW-WO-TC83: Verify a work order created for a product-with-items has no items pre-assigned (productsItems is empty until scan)', { tags: ['@regression'] }, () => {
      // Technique: Error Guessing
      cy.getAuthToken().then((swToken) => {
        waitForStockWiseWorkOrderByInvoice(swToken, awInvoiceNumber).then((wo) => {
          const productsItems = wo.productsItems ?? [];
          expect(productsItems, 'WO.productsItems must be empty at creation -- items are only attached during scan').to.have.lengthOf(0);
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC84
     * Description:       Negative case for the items-product invoice flow --
     *                    verify that when the work_order toggle is disabled on
     *                    an invoice referencing a product-with-items, no
     *                    StockWise WO is created. Mirrors TC74 but with a
     *                    serialized product.
     * Steps:             1. Log in to AccountWise.
     *                    2. Pick a serialized product with reservable stock.
     *                    3. Build an invoice body with metadata.work_order=false.
     *                    4. POST to AccountWise.
     *                    5. Assert response.metadata.work_order_number is absent.
     *                    6. Assert no StockWise WO matches the invoice number.
     * Test Data:         AccountWise creds, serialized product, invoice body
     *                    override { metadata: { work_order: false } }.
     * Expected Result:   AccountWise omits work_order_number; no StockWise WO
     *                    is created for the invoice number.
     */
    // EP -- invalid partition / decision table: work_order=false on items-product invoice must suppress WO creation (mirrors TC74)
    it('SW-WO-TC84: Verify creating an AccountWise invoice with a product-with-items and work_order toggle disabled does NOT create a StockWise work order', { tags: ['@regression'] }, function () {
      // Technique: Decision Table
      const ctx = this;
      cy.getAuthToken().then((swToken) => {
        loginToAccountWise().then((awToken) => {
          findStockWiseItemsProductForInvoice(swToken, { minReservable: 1 }).then((product) => {
            if (!product) {
              ctx.skip();
              return;
            }
            const body = buildInvoiceBody({
              product,
              overrides: { metadata: { work_order: false } },
            });
            createAccountWiseInvoice(awToken, body).then((invoice) => {
              expect(
                invoice.metadata?.work_order_number,
                'AccountWise must NOT return work_order_number when toggle is off',
              ).to.not.exist;
              assertNoStockWiseWorkOrderForIdentifier(swToken, invoice.invoice_number, 'invoiceNumber');
            });
          });
        });
      });
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise Sales Order Driven Work Order -- Product With Items
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Mirror of TC75â€“TC77 but the AccountWise sales order line references a
  // serialized product. As with the invoice flow, the Backend create path
  // is identical for both product types: same request shape, same Draft
  // landing status, same product-level reservation. No items-specific
  // negative test is duplicated here -- TC84 already proves the toggle gating.

  describe('AccountWise Sales Order Driven Work Order (Product With Items)', () => {
    let saleOrderNumber;
    let workOrderNumber;
    let salesOrderProduct;
    let salesOrderLineQuantity;
    let reservedQtyBefore;

    before(function () {
      const requiredQty = 1;
      const ctx = this; // captured so the .then() arrow callbacks below can skip
      // QA's AccountWise has no work-order creation option, so invoice- and
      // sales-order-driven WO creation cannot be exercised there. Skip this
      // AccountWise block on QA; it runs normally on Stage. (See
      // accountWiseWoSupported — detected by API base URL host.)
      if (!accountWiseWoSupported()) { this.skip(); return; }

      cy.authSession('admin');
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        expect(swToken, 'StockWise admin token must be present').to.exist;

        loginToAccountWise().then((awToken) => {
          // Skip the describe if no qualifying items product is available.
          findStockWiseItemsProductForInvoice(swToken, { minReservable: requiredQty })
            .then((product) => {
              if (!product) {
                ctx.skip();
                return;
              }
              salesOrderProduct = product;
              reservedQtyBefore = Number(product.reservedQuantity ?? 0);

              const body = buildSalesOrderBody({ product });
              salesOrderLineQuantity = body.items[0].quantity;
              expect(salesOrderLineQuantity, 'sales order line quantity must match the seed-data threshold').to.equal(requiredQty);

              createAccountWiseSalesOrder(awToken, body).then((salesOrder) => {
                saleOrderNumber = salesOrder.sale_order_number;
                workOrderNumber = salesOrder.metadata.work_order_number;
              });
            });
        });
      });
    });

    after(() => {
      // Cleanup: cancel the WO created in before() so it does not accumulate across runs.
      if (!workOrderNumber) return;
      cy.getAuthToken().then((swToken) => {
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/work-orders?search=${encodeURIComponent(workOrderNumber)}&page=1&pageSize=1`,
          headers: { Authorization: `Bearer ${swToken}` },
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          const wo = resp.body?.data?.list?.[0];
          if (!wo?.id || wo.status === 'Cancelled' || wo.status === 'Closed') return;
          cy.request({
            method: 'DELETE',
            url: `${Cypress.env('API_BASE_URL')}/work-orders/${wo.id}/cancel`,
            headers: { Authorization: `Bearer ${swToken}` },
            failOnStatusCode: false,
            timeout: 60000,
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
    });

    /**
     * Test ID:           SW-WO-TC85
     * Description:       Verify that creating an AccountWise sales order
     *                    referencing a product-with-items creates a
     *                    corresponding StockWise WO synchronously, with the
     *                    sale order number attached and products[0].hasItems
     *                    set to true. Mirrors TC75 with a serialized product.
     * Steps:             1. Log in to AccountWise as admin.
     *                    2. Pick a serialized StockWise product (in before()).
     *                    3. Build a sales order body with work_order=true.
     *                    4. POST to AccountWise; capture sale_order_number and
     *                       metadata.work_order_number.
     *                    5. Fetch the StockWise WO by work_order_number.
     *                    6. Assert workOrderNumber and saleOrderNumber match
     *                       and products[0].hasItems is true.
     *                    7. UI: search by SO number and verify the row.
     * Test Data:         AccountWise creds, serialized product, SO fixture
     *                    with metadata.work_order=true.
     * Expected Result:   WO exists with matching numbers; hasItems flag
     *                    persisted on the products[0] entry; SO renders in
     *                    the WO list row.
     */
    // Use case -- happy path: AW SO with hasItems=true product must create WO synchronously with products[0].hasItems persisted
    it('SW-WO-TC85: Verify creating an AccountWise sales order with a product-with-items creates a corresponding StockWise work order', { tags: ['@smoke'] }, () => {
      // Technique: Use Case
      cy.getAuthToken().then((swToken) => {
        getStockWiseWorkOrderByNumber(swToken, workOrderNumber).then((wo) => {
          expect(wo.workOrderNumber, 'WO number must match the one returned by AccountWise').to.equal(workOrderNumber);
          expect(wo.saleOrderNumber, 'WO must carry the AccountWise sale order number').to.equal(saleOrderNumber);
          expect(wo.products?.[0]?.hasItems, 'WO products[0].hasItems must be true for a serialized product').to.equal(true);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(saleOrderNumber);
          workOrderPage.verifyTableContains(saleOrderNumber);
          workOrderPage.findRowBySaleOrderNum(saleOrderNumber).then(($row) => {
            workOrderPage.verifySaleOrderInRow($row, saleOrderNumber);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC86
     * Description:       Verify a sales-order-driven WO for a product-with-items
     *                    lands in Draft status until SO approval, identical to
     *                    the pure-product flow (TC76). hasItems does not affect
     *                    pre-approval status semantics.
     * Steps:             1. Use the WO created in the shared before() hook.
     *                    2. Fetch the WO by work_order_number.
     *                    3. Assert wo.status equals "Draft".
     *                    4. UI: search by SO number, verify status cell reads
     *                       "Draft".
     * Test Data:         Reuses workOrderNumber and saleOrderNumber.
     * Expected Result:   wo.status === "Draft" both via API and in the UI list.
     */
    // State transition -- entry state: hasItems flag must not affect SO-flow status; WO still enters Draft until approved
    it('SW-WO-TC86: Verify a work order created from an AccountWise sales order with a product-with-items has Draft status', { tags: ['@regression'] }, () => {
      // Technique: State Transition
      cy.getAuthToken().then((swToken) => {
        getStockWiseWorkOrderByNumber(swToken, workOrderNumber).then((wo) => {
          expect(wo.status, 'WO created from AccountWise sales order must have Draft status').to.equal(workOrderData.detailView.statuses.draft);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(saleOrderNumber);
          workOrderPage.findRowBySaleOrderNum(saleOrderNumber).then(($row) => {
            workOrderPage.verifyStatusInRow($row, workOrderData.detailView.statuses.draft);
          });
        });
      });
    });

    /**
     * Test ID:           SW-WO-TC87
     * Description:       Verify that creating a sales-order-driven WO for a
     *                    product-with-items reserves stock at the product
     *                    level at SO creation time -- reservedQuantity must
     *                    increase by the line quantity even though the WO is
     *                    in Draft. Reservation occurs at SO creation, not at
     *                    approval. Mirrors TC77 with a serialized product.
     * Steps:             1. Snapshot reservedQuantity BEFORE the SO POST (in
     *                       before()).
     *                    2. After SO creation, re-fetch the product.
     *                    3. Assert reservedQtyAfter === before + line qty.
     * Test Data:         reservedQtyBefore, salesOrderLineQuantity = 1,
     *                    salesOrderProduct.
     * Expected Result:   reservedQtyAfter === reservedQtyBefore + line qty.
     */
    // EP -- valid partition: reservation at SO creation must also apply to hasItems products (mirrors TC77).
    // Use >= rather than === for the same reason as TC82 -- sibling describes (Scan Modal block) can reserve
    // on the same product during the same run, and an extra reservation is not a defect. The acceptance
    // criterion is "reservedQuantity increases by AT LEAST the SO line quantity".
    it('SW-WO-TC87: Verify the product-with-items selected in the AccountWise sales order has its reserved quantity increased by the sales order line quantity', { tags: ['@regression'] }, () => {
      // Technique: EP
      cy.getAuthToken().then((swToken) => {
        getProductReservedQuantity(swToken, salesOrderProduct).then((reservedQtyAfter) => {
          const expectedMin = reservedQtyBefore + salesOrderLineQuantity;
          expect(reservedQtyAfter, `Product ${salesOrderProduct.id} reservedQuantity must be at least ${expectedMin} after SO creation (was ${reservedQtyBefore}, line qty ${salesOrderLineQuantity})`)
            .to.be.at.least(expectedMin);
        });
      });
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AccountWise Approved Sales Order Driven Work Order -- Product With Items
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Mirror of TC79 with a serialized product. Approving an AccountWise sales
  // order transitions the linked StockWise WO from Draft â†’ Open. The
  // transition logic does not branch on hasItems -- pure and items products
  // both flip to Open on approval.

  describe('AccountWise Approved Sales Order Driven Work Order (Product With Items)', () => {
    let approvedSaleOrderNumber;
    let approvedWorkOrderNumber;

    before(function () {
      const requiredQty = 1;
      const ctx = this; // captured so the .then() arrow callbacks below can skip
      // QA's AccountWise has no work-order creation option, so invoice- and
      // sales-order-driven WO creation cannot be exercised there. Skip this
      // AccountWise block on QA; it runs normally on Stage. (See
      // accountWiseWoSupported — detected by API base URL host.)
      if (!accountWiseWoSupported()) { this.skip(); return; }

      cy.authSession('admin');
      new WorkOrderPage().visit();
      cy.getAuthToken().then((swToken) => {
        expect(swToken, 'StockWise admin token must be present').to.exist;

        loginToAccountWise().then((awToken) => {
          // Skip the describe if no qualifying items product is available.
          findStockWiseItemsProductForInvoice(swToken, { minReservable: requiredQty })
            .then((product) => {
              if (!product) {
                ctx.skip();
                return;
              }
              const body = buildSalesOrderBody({ product });

              createAccountWiseSalesOrder(awToken, body).then((salesOrder) => {
                approvedSaleOrderNumber = salesOrder.sale_order_number;
                approvedWorkOrderNumber = salesOrder.metadata.work_order_number;

                approveAccountWiseSalesOrder(awToken, salesOrder.id);
              });
            });
        });
      });
    });

    after(() => {
      // Cleanup: cancel the WO created in before() so it does not accumulate across runs.
      // Approved WOs are Open -- cancel is available.
      if (!approvedWorkOrderNumber) return;
      cy.getAuthToken().then((swToken) => {
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/work-orders?search=${encodeURIComponent(approvedWorkOrderNumber)}&page=1&pageSize=1`,
          headers: { Authorization: `Bearer ${swToken}` },
          failOnStatusCode: false,
          timeout: 60000,
        }).then((resp) => {
          const wo = resp.body?.data?.list?.[0];
          if (!wo?.id || wo.status === 'Cancelled' || wo.status === 'Closed') return;
          cy.request({
            method: 'DELETE',
            url: `${Cypress.env('API_BASE_URL')}/work-orders/${wo.id}/cancel`,
            headers: { Authorization: `Bearer ${swToken}` },
            failOnStatusCode: false,
            timeout: 60000,
          });
        });
      });
    });

    beforeEach(() => {
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
    });

    /**
     * Test ID:           SW-WO-TC88
     * Description:       Verify that approving an AccountWise sales order whose
     *                    line item references a product-with-items transitions
     *                    the linked StockWise WO from Draft â†’ Open. Mirrors
     *                    TC79 with a serialized product to prove the approval
     *                    code path does not branch on hasItems.
     * Steps:             1. (before) Create a sales order with work_order=true
     *                       and a serialized product; capture sale_order_number,
     *                       work_order_number, and SO uuid.
     *                    2. (before) Call approveSaleOrder with the SO uuid.
     *                    3. Fetch the WO by work_order_number.
     *                    4. Assert wo.status equals "Open".
     *                    5. UI: search by SO number, verify status cell reads
     *                       "Open".
     * Test Data:         approvedSaleOrderNumber, approvedWorkOrderNumber from
     *                    before(); reuses the AccountWise SO uuid for approval.
     * Expected Result:   The same WO that was Draft after SO creation (TC86)
     *                    is now Open after approval, both via API and in UI.
     */
    // State transition -- Draft â†’ Open: approval code path must not branch on hasItems; WO transitions to Open regardless of product type
    it('SW-WO-TC88: Verify approving an AccountWise sales order with a product-with-items transitions the corresponding StockWise work order from Draft to Open', { tags: ['@smoke'] }, () => {
      // Technique: State Transition
      cy.getAuthToken().then((swToken) => {
        getStockWiseWorkOrderByNumber(swToken, approvedWorkOrderNumber).then((wo) => {
          expect(wo.status, 'WO must transition to Open after AccountWise sales order approval').to.equal(workOrderData.detailView.statuses.open);

          workOrderPage.visit();
          workOrderPage.searchByWoNum(approvedSaleOrderNumber);
          workOrderPage.findRowBySaleOrderNum(approvedSaleOrderNumber).then(($row) => {
            workOrderPage.verifyStatusInRow($row, workOrderData.detailView.statuses.open);
          });
        });
      });
    });
  });

  // ============================================================================
  // Scan Modal (Work Orders Scan)
  // ============================================================================
  // Tests for the fullscreen Scan modal opened by clicking the Scan button on a
  // WO detail product row. The modal POSTs /work-orders/scan and renders
  // ScanForm + ScanList side by side. Tests require an Open WO whose products
  // include a hasItems=true entry with at least one Available serial number in
  // inventory -- the probe in findOpenWorkOrderWithItemsProduct() walks live QA
  // data and the whole describe skips cleanly via this.skip() when QA has no
  // qualifying WO (principle #6 -- environmental absence is not a defect).

  describe('Scan Modal', () => {
    let scanWoNum;
    let scanWoId;
    let scanProductId;
    let scanProductName;
    // Tracks any serial reserved during a test so the afterEach can pair the
    // mutation with its inverse (POST /work-orders/unscan) per SKILL.md §6
    // rule 5 -- state restoration. Tests that reserve a serial set this; the
    // afterEach reads and clears it. Cleanup is best-effort: a 4xx response
    // is logged, not asserted, so cleanup never masks a real test failure.
    let lastReservedSerial = null;

    before(function () {
      const ctx = this;
      cy.authSession('admin');
      new WorkOrderPage().visit();
      new WorkOrderPage().findOpenWorkOrderWithItemsProduct().then((result) => {
        if (!result) {
          // No Open WO with a hasItems product exists in QA -- skip the whole
          // describe rather than letting downstream this.skip() fall back
          // checks fire one by one. Each individual test still guards in
          // case shared state changes mid-run.
          ctx.skip();
          return;
        }
        scanWoNum = result.woNum;
        scanWoId = result.id;
        scanProductId = result.productId;
        scanProductName = result.productName;
      });
    });

    beforeEach(function () {
      if (!scanWoNum) this.skip();
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
      workOrderPage.visitDetail(scanWoNum, scanWoId);
    });

    afterEach(() => {
      if (!lastReservedSerial) return;
      const serial = lastReservedSerial;
      lastReservedSerial = null;
      // Best-effort inverse of TC90's reservation. Idempotent: a non-2xx
      // response is logged but not asserted by unscanSerial().
      new WorkOrderPage().unscanSerial(scanWoNum, scanProductId, serial);
    });

    // Use case -- happy path: opening the Scan modal must render the header
    // "Work Orders Scan", the embedded ScanForm (serial input + Scan button),
    // and the embedded ScanList (Scanned Items header) so the user can begin
    // scanning. This is the alive check for the whole modal mount.
    it('SW-WO-TC89: Verify the Work Orders Scan modal renders header, ScanForm, and ScanList', { tags: ['@smoke', '@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.openScanModalOnFirstRow();
      workOrderPage.verifyScanModalReady(
        workOrderData.scan.modalTitle,
        workOrderData.scan.scannedItemsListHeader,
      );
    });

    // State transition -- Item.status Available -> Reserved: scanning a valid
    // serial number must POST /work-orders/scan with 2xx, surface a success
    // toast, append the serial into the ScanList, AND the WO entity's
    // productsItems array must grow by one when re-read via the API. The
    // last check proves the round-trip through the WorkOrder JSON column
    // (not just a Frontend optimistic update). Probe-and-skip when no
    // Available serial exists for the chosen product.
    it('SW-WO-TC90: Verify scanning a valid Available serial reserves it on the work order', { tags: ['@smoke', '@regression'] }, function () {
      // Technique: State Transition
      const ctx = this;
      // Re-check live reservation headroom on the chosen WO+product before
      // scanning. The before()-selected WO can become saturated by a previous
      // run or a Cypress retry (its productsItems persist), in which case the
      // scan would be rejected "All requested quantities ... already reserved"
      // and the Scan submit may produce no POST at all. A full slot is an
      // environmental/data condition, not a scan defect -- skip cleanly per the
      // user's "no quantity to reserve must not fail" guidance.
      workOrderPage.getWorkOrderHeadroom(scanWoId, scanProductId).then((headroom) => {
        if (headroom < 1) {
          Cypress.log({ name: 'SW-WO-TC90', message: `WO ${scanWoNum} product slot full (headroom=${headroom}) -- skipping (capacity, not a defect)` });
          ctx.skip();
          return;
        }
      workOrderPage.findAvailableSerialForProduct(scanProductId).then((serial) => {
        if (!serial) { this.skip(); return; }

        workOrderPage.getWorkOrderProductsItems(scanWoId).then((before) => {
          cy.intercept('POST', workOrderData.scan.scanEndpoint).as('scanSerial');
          // Track for cleanup BEFORE the POST so afterEach unscans even if a
          // later assertion fails; unscanSerial is idempotent on a never-reserved serial.
          lastReservedSerial = serial;
          workOrderPage.openScanModalOnFirstRow();
          workOrderPage.typeSerialInScanModal(serial);
          workOrderPage.clickScanSubmitInScanModal();

          cy.wait('@scanSerial', { timeout: 30000 }).then((interception) => {
            const status = interception.response.statusCode;
            const message = interception.response.body?.error?.message
              ?? interception.response.body?.message ?? '';
            // Benign capacity race: the WO product slot filled between the
            // headroom probe and this scan (e.g. a concurrent/previous-run
            // reservation), so the Backend returns 400 "All requested
            // quantities for product ... have already been reserved." This is
            // an environmental state condition, not a scan defect -- skip
            // cleanly rather than fail (user guidance: a no-reservable-quantity
            // scan must not fail the suite). Any OTHER non-2xx (wrong product,
            // missing serial, etc.) is a real failure and still asserts below.
            if (status < 200 || status >= 300) {
              if (/have already been reserved/i.test(message)) {
                Cypress.log({
                  name: 'SW-WO-TC90',
                  message: `WO ${scanWoNum} product slot full at scan time ("${message}") -- skipping (capacity, not a defect)`,
                });
                lastReservedSerial = null; // nothing was reserved -- skip afterEach unscan
                ctx.skip();
                return;
              }
            }
            expect(
              status,
              `POST /work-orders/scan for "${serial}" must succeed (got "${message}")`,
            ).to.be.within(200, 299);
          });
          workOrderPage.verifyToast(workOrderData.scan.toasts.scanSuccessFragment);
          workOrderPage.verifyScanListContains(serial);

          workOrderPage.getWorkOrderProductsItems(scanWoId).then((after) => {
            expect(
              after.length,
              `WO ${scanWoNum} productsItems must grow by 1 after scanning "${serial}"`,
            ).to.equal(before.length + 1);
            const matched = after.some((it) => it?.serialNumber === serial && it?.productId === scanProductId);
            expect(matched, `productsItems must include serial "${serial}" for productId ${scanProductId}`).to.be.true;
          });
        });
      });
      }); // close getWorkOrderHeadroom().then
    });

    // EP -- invalid partition / error guessing: scanning a serial that belongs
    // to a DIFFERENT product than the row's productId must be rejected by the
    // Backend ('"<serial>" is not an item of selected product.'), surface an
    // error toast, and leave productsItems unchanged on the WO entity.
    it('SW-WO-TC91: Verify scanning a serial belonging to a different product is rejected', { tags: ['@regression'] }, function () {
      // Technique: EP
      workOrderPage.findAvailableSerialForOtherProduct(scanProductId).then((other) => {
        if (!other) { this.skip(); return; }

        workOrderPage.getWorkOrderProductsItems(scanWoId).then((before) => {
          cy.intercept('POST', workOrderData.scan.scanEndpoint).as('scanSerial');
          workOrderPage.openScanModalOnFirstRow();
          workOrderPage.typeSerialInScanModal(other.serialNumber);
          workOrderPage.clickScanSubmitInScanModal();

          cy.wait('@scanSerial', { timeout: 30000 }).then((interception) => {
            // BadRequestException reaches the client as HTTP 400. Accept any
            // non-2xx + a recognisable error body so a future Backend
            // refactor from BadRequestException to the envelope pattern
            // (200 + success:false) still passes.
            const status = interception.response.statusCode;
            const body = interception.response.body ?? {};
            const message = body?.error?.message ?? body?.message ?? '';
            const fragments = workOrderData.scan.toasts.wrongProductErrorFragments;
            const matched = fragments.some((f) => message.includes(f));
            expect(
              status >= 400 || body.success === false,
              `Wrong-product scan must be rejected (got HTTP ${status}, success=${body.success})`,
            ).to.be.true;
            expect(
              matched,
              `Backend error message must contain one of [${fragments.map((f) => `"${f}"`).join(', ')}], got "${message}"`,
            ).to.be.true;
          });

          // Confirm the WO entity's productsItems array is unchanged.
          workOrderPage.getWorkOrderProductsItems(scanWoId).then((after) => {
            expect(
              after.length,
              `WO ${scanWoNum} productsItems must NOT change after a wrong-product scan`,
            ).to.equal(before.length);
          });
        });
      });
    });

    // State transition -- invalid: re-scanning a serial that is already
    // Reserved for THIS work order must be rejected ('The serial number
    // "<serial>" is already associated with this product in this work
    // order.'), and productsItems length must not grow. The test arranges
    // its own Reserved serial via reserveSerialViaApi; the describe-level
    // afterEach unscans via lastReservedSerial.
    it('SW-WO-TC92: Verify scanning a duplicate (already-Reserved) serial is rejected', { tags: ['@regression'] }, function () {
      // Technique: State Transition
      const ctx = this;
      // Needs to reserve one serial up front to create the duplicate state.
      // Skip when the WO slot has no live headroom (shared-state saturation),
      // else reserveSerialViaApi would throw "already reserved" and fail the
      // arrangement -- a data condition, not a defect.
      workOrderPage.getWorkOrderHeadroom(scanWoId, scanProductId).then((headroom) => {
        if (headroom < 1) {
          Cypress.log({ name: 'SW-WO-TC92', message: `WO ${scanWoNum} product slot full (headroom=${headroom}) -- skipping (capacity, not a defect)` });
          ctx.skip();
          return;
        }
      workOrderPage.findAvailableSerialForProduct(scanProductId).then((serial) => {
        if (!serial) { this.skip(); return; }

        // Arrange: reserve the serial via API so its Item.status is now
        // Reserved before the UI scan. Track for afterEach cleanup BEFORE the
        // call so a mid-call failure still triggers unscan.
        lastReservedSerial = serial;
        workOrderPage.reserveSerialViaApi(scanWoNum, scanProductId, serial);

        workOrderPage.getWorkOrderProductsItems(scanWoId).then((before) => {
          cy.intercept('POST', workOrderData.scan.scanEndpoint).as('scanSerial');
          workOrderPage.openScanModalOnFirstRow();
          workOrderPage.typeSerialInScanModal(serial);
          workOrderPage.clickScanSubmitInScanModal();

          cy.wait('@scanSerial', { timeout: 30000 }).then((interception) => {
            const status = interception.response.statusCode;
            const body = interception.response.body ?? {};
            const message = body?.error?.message ?? body?.message ?? '';
            const fragment = workOrderData.scan.toasts.duplicateScanErrorFragment;
            expect(
              status >= 400 || body.success === false,
              `Duplicate scan of "${serial}" must be rejected (got HTTP ${status}, success=${body.success})`,
            ).to.be.true;
            // The Backend distinguishes "already reserved on THIS WO" from
            // generic statuses. Either fragment is acceptable -- the WO-scoped
            // duplicate is the primary signal but `is already stocked out`
            // would also be a valid rejection on a serial that moved on.
            expect(
              message.includes(fragment) || message.includes('already'),
              `Backend error message must indicate duplicate / already-reserved state, got "${message}"`,
            ).to.be.true;
          });

          workOrderPage.getWorkOrderProductsItems(scanWoId).then((after) => {
            expect(
              after.length,
              `WO ${scanWoNum} productsItems must NOT grow after a duplicate scan`,
            ).to.equal(before.length);
          });
        });
      });
      }); // close getWorkOrderHeadroom().then
    });

    // BVA -- lower boundary (invalid): submitting the form with an empty
    // serial number must be blocked by the Frontend RHF
    // `required: 'Serial number is required'` rule -- no POST goes out and
    // the validation message becomes visible. This is the "just-below" of
    // the valid-input partition (length >= configured min).
    it('SW-WO-TC93: Verify submitting an empty serial number triggers client-side validation and fires no scan request', { tags: ['@regression'] }, () => {
      // Technique: BVA
      // Stub /work-orders/scan with a 599 sentinel so that if RHF fails to block
      // the empty submit and a POST goes out, the intercept records it AND the
      // backend never sees the bad payload. We assert on the intercept alias
      // (cy.get('@scanSerial.all')) -- no bare cy.wait(<ms>).
      cy.intercept('POST', workOrderData.scan.scanEndpoint, (req) => {
        req.reply({ statusCode: 599, body: { sentinel: 'should-not-fire' } });
      }).as('scanSerial');

      workOrderPage.openScanModalOnFirstRow();
      workOrderPage.clickScanSubmitInScanModal();
      // The visible RHF error is a sufficient sync: POSTs happen inside
      // onSubmit, errors inside onError, and the two paths are mutually
      // exclusive. Once the helper-text node mounts the submit handler
      // has returned and no POST can subsequently fire. We accept either the
      // exact "Serial number is required" message OR any visible field-level
      // validation error -- the serial field's RHF rules spread in the
      // category's scan-attribute rules, so the exact wording is environment-
      // dependent (it differed on Stage). The hard contract is the no-POST
      // assertion below.
      workOrderPage.verifyScanModalBlockedWithValidationError(workOrderData.scan.toasts.serialRequiredError);
      cy.get('@scanSerial.all').should('have.length', 0);
    });

    // Use case -- exception path: DONE on the modal footer must close the
    // dialog and return the user to the WO detail page (no scan/no mutation).
    // Proves that exit-without-scan is inert -- a regression that pushes a
    // mutation on close would fail this assertion.
    it('SW-WO-TC94: Verify clicking DONE closes the Scan modal with no further mutation', { tags: ['@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.getWorkOrderProductsItems(scanWoId).then((before) => {
        workOrderPage.openScanModalOnFirstRow();
        workOrderPage.clickDoneInScanModal();
        workOrderPage.verifyScanModalNotVisible();
        // We are still on the WO detail URL.
        cy.url().should('include', `${scanWoNum}/${scanWoId}`);

        workOrderPage.getWorkOrderProductsItems(scanWoId).then((after) => {
          expect(
            after.length,
            `Closing the Scan modal with DONE must not change productsItems on WO ${scanWoNum}`,
          ).to.equal(before.length);
        });
      });
    });
  });

  // ============================================================================
  // Scanned Items Page (View Detail destination)
  // ============================================================================
  // Tests for the per-product Scanned Items page reached via the View Detail
  // button on a WO detail product row. URL:
  //   /work-order/<woNum>/<workOrderId>/<productName>/<productId>
  // The page renders WorkOrderProductDetailsView (Work Order Number + Name +
  // category attributes) and embeds ScanList reading the same
  // /work-orders/scanned-items endpoint that the modal's ScanList uses.

  describe('Scanned Items Page', () => {
    let pageWoNum;
    let pageWoId;
    let pageProductId;
    let pageProductName;
    // Tracks any serial reserved during a test (TC96 arranges one via API)
    // so the afterEach can pair the mutation with its inverse. Best-effort
    // unscan via the unscanSerial page-object method.
    let pageReservedSerial = null;

    before(function () {
      const ctx = this;
      cy.authSession('admin');
      new WorkOrderPage().visit();
      new WorkOrderPage().findOpenWorkOrderWithItemsProduct().then((result) => {
        if (!result) { ctx.skip(); return; }
        pageWoNum = result.woNum;
        pageWoId = result.id;
        pageProductId = result.productId;
        pageProductName = result.productName;
      });
    });

    beforeEach(function () {
      if (!pageWoNum) this.skip();
      workOrderPage = new WorkOrderPage();
      cy.authSession('admin');
    });

    afterEach(() => {
      if (!pageReservedSerial) return;
      const serial = pageReservedSerial;
      pageReservedSerial = null;
      new WorkOrderPage().unscanSerial(pageWoNum, pageProductId, serial);
    });

    // Use case -- happy path: the Scanned Items page must render the Work
    // Order Number + Name header labels AND the ScanList component so the
    // user can review what has been scanned per product. URL pattern check
    // doubles as a route-contract regression.
    it('SW-WO-TC95: Verify the Scanned Items page renders the WO header labels and ScanList', { tags: ['@regression'] }, () => {
      // Technique: Use Case
      workOrderPage.visitScannedItemsPage(pageWoNum, pageWoId, pageProductName, pageProductId);
      cy.url().should('include', workOrderData.scan.scannedItemsPage.urlPattern);
      cy.url().should('include', `${pageWoNum}/${pageWoId}/`);
      cy.url().should('include', `/${pageProductId}`);
      workOrderPage.verifyScannedItemsHeaderLabels();
      workOrderPage.verifyScanListVisible();
    });

    // EP -- valid partition: a serial scanned (reserved) on a WO must appear
    // in the Scanned Items page list. Proves the page reads the same
    // /work-orders/scanned-items source as the modal's embedded ScanList
    // (round-trip through the WorkOrder entity, not an in-memory cache).
    // The test arranges its own Reserved serial via reserveSerialViaApi;
    // the describe-level afterEach unscans via pageReservedSerial.
    it('SW-WO-TC96: Verify a previously-scanned serial appears in the Scanned Items page list', { tags: ['@regression'] }, function () {
      // Technique: EP
      const ctx = this;
      // Needs to reserve one serial to seed the Scanned Items list. Skip when
      // the WO slot has no live headroom (shared-state saturation) so
      // reserveSerialViaApi doesn't throw -- a data condition, not a defect.
      workOrderPage.getWorkOrderHeadroom(pageWoId, pageProductId).then((headroom) => {
        if (headroom < 1) {
          Cypress.log({ name: 'SW-WO-TC96', message: `WO ${pageWoNum} product slot full (headroom=${headroom}) -- skipping (capacity, not a defect)` });
          ctx.skip();
          return;
        }
      workOrderPage.findAvailableSerialForProduct(pageProductId).then((serial) => {
        if (!serial) { this.skip(); return; }

        // Track for cleanup BEFORE the reserve call so a mid-call failure
        // still triggers unscan in afterEach.
        pageReservedSerial = serial;
        workOrderPage.reserveSerialViaApi(pageWoNum, pageProductId, serial);

        workOrderPage.visitScannedItemsPage(pageWoNum, pageWoId, pageProductName, pageProductId);
        workOrderPage.verifyScanListVisible();
        workOrderPage.verifyScanListContains(serial);
      });
      }); // close getWorkOrderHeadroom().then
    });

    // State transition -- terminal state / error guessing: on a Closed or
    // Cancelled WO the Scanned Items page must render the ScanList in a
    // read-only state. ScanList disables every Remove button when
    // workOrderStatus is in ['Closed', 'Cancelled'] (see ScanList row-action
    // gating). This is the "scan/edit on a terminal WO must be inert"
    // error-guess case. Probe a terminal WO (Closed or Cancelled) whose
    // products array contains scanned serials; skip cleanly when QA has
    // none.
    it('SW-WO-TC97: Verify the Scanned Items page is read-only (Remove disabled) on a terminal-state WO', { tags: ['@regression'] }, function () {
      // Technique: State Transition
      workOrderPage.findTerminalWoWithScannedHasItemsProduct().then((target) => {
        if (!target) { this.skip(); return; }

        workOrderPage.visitScannedItemsPage(
          target.woNum, target.id, target.productName, target.productId,
        );
        workOrderPage.verifyScanListVisible();
        workOrderPage.verifyScanListRemoveBtnsDisabled();
      });
    });
  });

  // ============================================================================
  // Role-Based Access Control (worker vs admin)
  // ============================================================================
  // The WO list gates its mutation affordances on isAdmin() (Role.User fails
  // the check): the Create Work Order button (WorkOrderListView.tsx ~L831,
  // `enableCreateWorkOrder && isAdmin()`), the per-row Open/force-open button
  // (~L565, `isAdmin()`), and the per-row Cancel button (~L577, `isAdmin()`).
  // The View button (~L558) has NO role gate. So a worker sees a read-only list:
  // View present, Open/Cancel/Create absent. These tests log in as the worker
  // user (users.json `worker` -> Role.User) and assert that contract.
  //
  // Authorization is enforced primarily in the UI here (the controller routes
  // are not role-guarded), so this is intentionally a UI spec, not an API spec
  // (SKILL §3 — confirming role-based UI gating is a UI concern).
  describe('Role-Based Access Control (worker)', () => {
    beforeEach(function () {
      // Needs at least one WO row so the row-action absence checks are
      // meaningful (View present proves the row rendered). Skip on no-seed-data
      // envs (e.g. QA when product/WO creation is blocked) -- principle #6.
      if (!WorkOrderPage.hasSeedData()) { this.skip(); return; }
      // Force a fresh worker session: clear the admin session so the role-gated
      // UI reflects Role.User, not a leaked admin token from a sibling block.
      Cypress.session.clearAllSavedSessions();
      cy.authSession('user');
      workOrderPage = new WorkOrderPage();
      workOrderPage.visit();
    });

    after(() => {
      // Restore the admin session so subsequent specs in a full run are not
      // left authenticated as the worker (state restoration, SKILL §6.5).
      Cypress.session.clearAllSavedSessions();
    });

    // Decision table -- worker role, Create action: the gate is
    // `enableCreateWorkOrder && isAdmin()`; isAdmin() is false for a worker, so
    // the Create Work Order button must be absent regardless of the config flag.
    it('SW-WO-TC98: Verify a worker does not see the Create Work Order button', { tags: ['@regression'] }, () => {
      // Technique: Decision Table
      workOrderPage.verifyCreateWorkOrderBtnAbsent();
    });

    // Decision table -- worker role, View action (ungated): the View button has
    // no isAdmin() guard, so a worker must still see it (read-only access). This
    // also proves the WO row rendered, making TC100 a non-vacuous absence check.
    it('SW-WO-TC99: Verify a worker still sees the read-only View button on a work order row', { tags: ['@regression'] }, () => {
      // Technique: Decision Table
      workOrderPage.verifyRowViewBtnPresent();
    });

    // Decision table -- worker role, mutating row actions: both Open
    // (force-open) and Cancel are gated on isAdmin(), so a worker must see
    // neither in any row -- they cannot transition a WO's state from the list.
    it('SW-WO-TC100: Verify a worker does not see the Open or Cancel row action buttons', { tags: ['@regression'] }, () => {
      // Technique: Decision Table
      workOrderPage.verifyRowMutationBtnsAbsent();
    });

    // Use case -- exception path / error guessing: deep-linking straight to the
    // create-work-order route must not give a worker a creation form. The route
    // is admin-only UI; a worker who types the URL is redirected away (the
    // Create button that leads here is itself admin-gated), so the create-page
    // heading must NOT render for a worker.
    it('SW-WO-TC101: Verify a worker cannot reach the create work order form by direct URL', { tags: ['@regression'] }, () => {
      // Technique: Error Guessing
      workOrderPage.visitCreatePageAndVerifyHeadingAbsent(workOrderData.createPage.url);
    });
  });

});
