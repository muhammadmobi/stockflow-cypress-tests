import data from '../fixtures/purchaseOrderReportData.json';
import purchaseOrderReportLocators from '../support/locators/purchaseOrderReportLocators';
import urls from '../fixtures/urls.json';

class PurchaseOrderReportPage {

  constructor() {
    this.loc = purchaseOrderReportLocators;
  }

  // Encoding-agnostic check that a URL's `search` query param equals `keyword`.
  // The server may encode spaces as `+` or `%20`, `@` as `%40`, and leave
  // parens literal — so we read the raw `search` value, normalize `+`→space,
  // decode it, and compare to the keyword. Returns false if there is no
  // `search` param at all (e.g. an unscoped re-fetch).
  static searchParamMatches(url, keyword) {
    const match = /[?&]search=([^&]*)/.exec(url);
    if (!match) return false;
    let decoded;
    try {
      decoded = decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch {
      return false;
    }
    // Trim both sides: the FE trims the search input on change
    // (Reports/index.tsx), so a live term with trailing/leading whitespace is
    // sent trimmed and would never exactly equal the raw captured keyword.
    return decoded.trim() === String(keyword).trim();
  }

  // ── API interception ───────────────────────────────────────────────────────

  interceptApis() {
    cy.intercept('GET', data.apis.poList).as(data.aliases.poList);
    cy.intercept('GET', data.apis.tabCounts).as(data.aliases.tabCounts);
    cy.intercept('GET', data.apis.tableItems).as(data.aliases.tableItems);
  }

  // Used only by TC-01. Asserts each status code at the moment the request
  // fires — avoids the "2nd request" timeout caused by visit() consuming
  // the aliases first.
  interceptApisAndVerifyStatus() {
    cy.intercept('GET', data.apis.poList, (req) => {
      req.continue((res) => {
        expect(res.statusCode).to.eq(200);
      });
    }).as(data.aliases.poList);
    cy.intercept('GET', data.apis.tabCounts, (req) => {
      req.continue((res) => {
        expect(res.statusCode).to.eq(200);
      });
    }).as(data.aliases.tabCounts);
    cy.intercept('GET', data.apis.tableItems, (req) => {
      req.continue((res) => {
        expect(res.statusCode).to.eq(200);
      });
    }).as(data.aliases.tableItems);
  }
 
  // ── Navigation ────────────────────────────────────────────────────────────
 
  visit() {
    this.interceptApis();
    cy.visit(urls.purchaseOrderReport);
    cy.wait(`@${data.aliases.tabCounts}`);
    cy.wait(`@${data.aliases.tableItems}`);
    cy.wait(`@${data.aliases.poList}`);
  }

  // Visits the report pre-scoped to a specific PO via the `?po_no=` query
  // param, bypassing the "Purchase Order Number" dropdown entirely.
  //
  // Reports/index.tsx:165-167 seeds `selectedPo` straight from
  // `searchParams.get('po_no')` on mount — the same mechanism
  // IncomingInvPage.selectPoNumber already relies on for the sibling
  // Incoming Inventory screen. This matters because `selectPo()` depends on
  // the PO appearing in `GET /excel/po-numbers?close=true`, which is served
  // from a Redis cache (`cacheService.getImportPoList`, key `IMPORT_LIST`)
  // that is not reliably invalidated the moment a PO is created — a
  // freshly-seeded PO can 404 out of that dropdown's option list for a
  // window after import. Scoping via the URL param reads `selectedPo` from
  // component state, not from that cached list, so it is immune to the
  // staleness window.
  visitForPo(poNumber) {
    this.interceptApis();
    cy.visit(`${urls.purchaseOrderReport}?po_no=${encodeURIComponent(poNumber)}`);
    cy.wait(`@${data.aliases.tabCounts}`);
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
 
  clickTab(label) {
    this.loc.tab(label).click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // Clicks a tab and captures the SAME defective-reports response the table
  // renders from (`data.list`), so a caller can reconcile the tab's own
  // detail rows against the tab-count badge (`getTabBadgeCount`) without
  // scraping fragile DOM cells for a "quantity" column. Yields the raw row
  // array via a Cypress chain.
  clickTabAndCaptureRows(label) {
    let captured = null;
    cy.intercept('GET', data.apis.tableItems, (req) => {
      req.continue((res) => {
        captured = res.body?.data?.list || res.body?.list || [];
      });
    }).as(data.aliases.tableItems);
    this.loc.tab(label).click();
    cy.wait(`@${data.aliases.tableItems}`);
    return cy.wrap(null, { log: false }).then(() => captured);
  }

  // Used only by TC-01 — sets up status-asserting intercepts before visiting
  visitAndVerifyApiStatus() {
    this.interceptApisAndVerifyStatus();
    cy.visit(urls.purchaseOrderReport);
    cy.wait(`@${data.aliases.tabCounts}`);
    cy.wait(`@${data.aliases.tableItems}`);
    cy.wait(`@${data.aliases.poList}`);
  }

  getActiveTabLabel() {
    return this.loc.activeTab().invoke('text');
  }

  getTabBadgeCount(label) {
    // Remove commas and whitespace, then coerce to Number — ensures the
    // type is always consistent regardless of locale formatting.
    return this.loc.tabBadge(label)
      .invoke('text')
      .then((text) => Number(String(text).replace(/,/g, '').trim()));
  }

  getPoDropdownValue() {
    return this.loc.poDropdownVisibleValue().invoke('text');
  }

  selectPo(poName) {
    this.loc.poDropdownTrigger().click();
    this.loc.poDropdownOption(poName).click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  getExportButton() {
    return this.loc.exportButton();
  }

  // ── Search ────────────────────────────────────────────────────────────────

  search(keyword) {
    // The report's search submit is a no-op while any report query is in
    // flight (the form's onSubmit early-returns on `isFetching`, and the
    // Search button switches to a label-less loading state with
    // pointer-events:none). On a slower environment (Stage) a second,
    // back-to-back search can otherwise land mid-fetch and be silently
    // dropped, so the items request never fires and the wait times out.
    // Assert the button is back to its idle, clickable "Search" state before
    // clicking — Cypress retries until the previous search has fully settled.
    this.loc.searchInput().clear().type(keyword, { parseSpecialCharSequences: false });
    this.loc.searchButton()
      .should('not.be.disabled')
      .and('have.css', 'pointer-events', 'auto')
      .click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  // Submits a search and yields { url, responded } describing the items
  // request, WITHOUT failing if the server never responds. TC-10's intent is
  // purely to assert the correct `search=` param is sent, so it must not
  // depend on the response: the Stage `/incoming-items/defective-reports`
  // search endpoint is pathologically slow and can fail to respond entirely
  // (tracked as SW-POR-BUG-01). The caller uses `responded`
  // to skip the response-dependent portion when the backend times out.
  //
  // `state` (a plain object owned by the caller) is mutated by the intercept:
  //   state.url       — the issued request URL (set as soon as the request fires)
  //   state.responded — true once a response is received
  submitSearch(keyword, state) {
    state.url = null;
    state.responded = false;
    // Clearing the input first can itself fire a `defective-reports` re-fetch
    // WITHOUT a search param (the form's clear branch refetches), and the tab/
    // PO context may fire further unscoped requests. We must capture the
    // request that actually carries the search keyword, not the first items
    // request that happens to fly by. Match by DECODING the request's `search`
    // query param and comparing to the keyword — this is encoding-agnostic
    // (spaces may be `+`, `@`→`%40`, parens left literal, etc.), so we don't
    // have to reconstruct the server's exact encoding.
    const carriesSearch = (url) => PurchaseOrderReportPage.searchParamMatches(url, keyword);

    cy.intercept('GET', data.apis.tableItems, (req) => {
      if (carriesSearch(req.url) && !state.url) {
        state.url = req.url;
        req.continue(() => {
          state.responded = true;
        });
      } else {
        req.continue();
      }
    }).as(data.aliases.tableItems);

    this.loc.searchInput().clear().type(keyword, { parseSpecialCharSequences: false });
    this.loc.searchButton()
      .should('not.be.disabled')
      .and('have.css', 'pointer-events', 'auto')
      .click();

    // Wait for the SEARCH request to be ISSUED (fires immediately on submit).
    cy.wrap(state, { timeout: 15000 })
      .should((s) => expect(s.url, `search request carrying search=${keyword} should have been issued`).to.be.a('string'));
  }

  // Polls up to `timeout` ms (in ~1s steps) for state.responded to flip true.
  // Does NOT fail if it never does — yields the final responded flag so the
  // caller decides whether to skip the response-dependent assertions.
  waitForSearchResponse(state, timeout = 45000) {
    const poll = (remaining) =>
      cy.wrap(null, { log: false }).then(() => {
        if (state.responded || remaining <= 0) return state.responded;
        return cy.wait(1000, { log: false }).then(() => poll(remaining - 1000));
      });
    return poll(timeout);
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  getTableRows() {
    return this.loc.tableRows();
  }

  // Intercepts tableItems during visit to capture the first row's data
  // for use in search and navigation tests — avoids hardcoding item details
  visitAndCaptureFirstItem() {
    cy.intercept('GET', data.apis.poList, (req) => {
      req.continue((res) => {
        // The report dropdown is rendered with showSource, so /excel/po-numbers
        // is called with ?source=true and returns objects ({ name, source })
        // instead of plain string PO numbers. Normalize to a flat string[] of
        // PO names so every consumer (selectPo, dropdown option matching, the
        // "Default" filter) keeps working regardless of the API shape.
        this._firstPoList = (res.body.data.poList || []).map((entry) =>
          entry && typeof entry === 'object' ? entry.name : entry
        );
      });
    }).as(data.aliases.poList);
    cy.intercept('GET', data.apis.tabCounts).as(data.aliases.tabCounts);
    cy.intercept('GET', data.apis.columnConfig).as(data.aliases.columnConfig);
    cy.intercept('GET', data.apis.tableItems, (req) => {
      req.continue((res) => {
        this._firstItem = res.body.data.list[0];
      });
    }).as(data.aliases.tableItems);
    cy.visit(urls.purchaseOrderReport);
    cy.wait(`@${data.aliases.tabCounts}`);
    cy.wait(`@${data.aliases.tableItems}`);
    cy.wait(`@${data.aliases.columnConfig}`);
    cy.wait(`@${data.aliases.poList}`);
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  getPaginationSummary() {
    return this.loc.paginationSummary().invoke('text');
  }

  changePageSize(value) {
    this.loc.pageSizeDropdown().click();
    this.loc.pageSizeOption(value).click();
    cy.wait(`@${data.aliases.tableItems}`);
  }

  getPageSizeDropdownValue() {
    return this.loc.pageSizeDropdown().invoke('text');
  }

  getNextPageButton() {
    return this.loc.nextPageButton();
  }

  goToNextPage() {
    // The pagination control sits in the page footer, so scroll it into view to
    // avoid "center hidden from view" failures. Crucially we must NOT force the
    // click: while the items query is in flight the table (MRT) disables the
    // next-page button, and a forced click on a disabled button is swallowed —
    // no navigation request fires and the subsequent wait times out. On the
    // slow Stage backend this loading window is long, so wait for the button to
    // be genuinely enabled, then do a real click so the navigation actually
    // fires. The wait timeout is generous because the next-page items request
    // is itself slow on Stage.
    this.loc.nextPageButton()
      .scrollIntoView()
      .should('not.be.disabled')
      .click();
    cy.wait(`@${data.aliases.tableItems}`, { timeout: 120000 });
  }

  // ── Item Detail Page ──────────────────────────────────────────────────────

  // Intercepts all three detail page APIs before navigating via row click.
  // Captures the item detail and item list API responses for use in assertions.
  interceptDetailApisAndClickRow() {
    // itemDetail pattern is stored as a regex string to ensure the second segment
    // is strictly numeric (the productId), avoiding collisions with routes like
    // details-incoming/:id which also have two path segments.
    const itemDetailPattern = new RegExp(data.apis.itemDetail);
    cy.intercept('GET', itemDetailPattern, (req) => {
      req.continue((res) => {
        this._itemDetail = res.body.data;
      });
    }).as(data.aliases.itemDetail);
    cy.intercept('GET', data.apis.itemList, (req) => {
      req.continue((res) => {
        this._itemList = res.body.data;
      });
    }).as(data.aliases.itemList);
    cy.intercept('GET', data.apis.detailConfig).as(data.aliases.detailConfig);
    // The report table has a sticky header/toolbar; after scrollIntoView the
    // first row's vertical center can sit underneath that sticky chrome, so a
    // default click fails with "center of this element is hidden from view"
    // (the TC18/19/21/22 failure). Scroll the row to the center of the
    // viewport (clear of the sticky header) and force the click so navigation
    // always fires — the click only needs to trigger the row's onClick
    // handler, not assert pointer visibility.
    this.loc.tableRows().first()
      .scrollIntoView({ block: 'center' })
      .click({ force: true });
    cy.wait(`@${data.aliases.itemDetail}`);
    cy.wait(`@${data.aliases.itemList}`);
    cy.wait(`@${data.aliases.detailConfig}`);
  }

  getProductDetailsToggle() {
    return this.loc.productDetailsToggle();
  }

  getProductDetailsSection() {
    return this.loc.productDetailsSection();
  }

  getItemListRows() {
    return this.loc.itemListRows();
  }

  getPoNumberCell() {
    return this.loc.poNumberCell();
  }

  visitAndNavigateToDetail(ctx) {
    if (!ctx.firstPoNumber) {
      this.visitAndCaptureFirstItem();
      cy.then(() => {
        const poArray = this._firstPoList;
        expect(poArray, 'PO List API array should exist').to.be.an('array').and.not.be.empty;
        const allowedPoArray = poArray.filter((po) => po && po !== 'Default');
        expect(allowedPoArray, 'Filtered PO list should contain at least one selectable PO')
          .to.be.an('array')
          .and.not.be.empty;
        ctx.firstPoNumber = allowedPoArray[0];
        ctx.firstItemName = this._firstItem.name;
        ctx.firstItemCategory = this._firstItem.category;
        ctx.firstItemId = this._firstItem.id;
        this.interceptDetailApisAndClickRow();
      });
    } else {
      this.visit();
      this.interceptDetailApisAndClickRow();
    }
  }
}
export default PurchaseOrderReportPage;
