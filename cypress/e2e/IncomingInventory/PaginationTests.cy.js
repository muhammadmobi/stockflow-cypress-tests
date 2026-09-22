import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import {
  createExcelFile,
  importExcel,
} from "../../support/helpers/incomingInventoryHelpers";
import {
  getRecordRange,
  getRowsPerPage,
  getRowsPerPageOptions,
  setRowsPerPage,
  getCurrentPage,
  clickNextPage,
  clickPrevPage,
  assertPrevDisabled,
  assertNextDisabled,
  assertPrevEnabled,
  assertNextEnabled,
  assertVisibleRowCount,
  snapshotTableRows,
  assertTableRowsChangedFrom,
  goToLastPage,
} from "../../support/helpers/paginationHelpers";

/**
 * Pagination Tests — Incoming Inventory (SW_INC_PAGE_001 – SW_INC_PAGE_008)
 *
 * Covers the bottom pagination footer of the Incoming Inventory list view.
 * The footer is a standard MUI / MaterialReactTable pagination component that
 * appears identically on every list view in StockWise (Inventory, Categories,
 * Work Orders, Reports, etc.) — every helper called from this spec lives in
 * `support/helpers/paginationHelpers.js` and is reusable across those pages.
 *
 * The Incoming Inventory rowsPerPageOptions are [25, 50, 75, 100, 150]
 * (Frontend/src/constant/common.ts → ROWS_PER_PAGE_OPTIONS). To exercise
 * page navigation the suite seeds 30 unique RAM products into a single PO so
 * the table spans 2 pages at the default rows-per-page (25 + 5).
 */
describe("Incoming Inventory - Pagination Tests (SW_INC_PAGE_001 – 008)", () => {
  let incomingInvPage;
  let purchaseOrderPage;
  let pd; // paginationData fixture
  let td; // stockInByQtyData fixture (RAM category + cost/price/support fallbacks)

  const createdPOs = [];
  let sharedPO;

  // ─── Local helpers ───────────────────────────────────────────────────────

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  // Build N unique RAM rows. RAMbrand is a List-type attribute restricted to
  // [Corsair, GSkill, Kingston, Crucial] — invalid List values are silently
  // dropped on import which collapses all rows onto the same brand. So we
  // cycle through the 4 valid brand values for the Brand column and use the
  // free-text Memory Generation column as the per-row unique discriminator.
  // Each row therefore carries a unique (brand, memGen) tuple and the import
  // creates a distinct Incoming Inventory product per row.
  function buildUniqueRamRows(count) {
    const validBrands = pd.seed.validBrands;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const brand = validBrands[i % validBrands.length];
      const memGen = `${pd.seed.memGenPrefix}-${String(i + 1).padStart(3, "0")}`;
      rows.push({
        Category: td.ram.category,
        // "RAMbrand" (no space) matches the registered attribute; "RAM Brand"
        // is dropped on import, which produced an empty PO (0 products).
        RAMbrand: brand,
        "Memory Generation": memGen,
        Cost: td.ramKingston.cost,
        Price: td.ramKingston.price,
        "Support Contact": td.ramKingston.supportContact,
        Quantity: pd.seed.expectedQty,
      });
    }
    return rows;
  }

  // After the PO is selected the stat cards (Expected/Incoming) populate first,
  // but the product *table* loads a beat later — the footer transiently reads
  // "of 0" / "No records to display" with a spinner. Reading the count during
  // that window is a race. Wait for the table body to actually render rows.
  function waitForProductTableLoaded() {
    cy.get("tbody", { timeout: pd.timeouts.initialLoadTimeout }).should(
      "not.contain.text",
      "No records to display"
    );
    cy.get("tbody tr", { timeout: pd.timeouts.initialLoadTimeout }).should(
      "have.length.greaterThan",
      0
    );
  }

  function navigateToSeededPO() {
    cy.intercept("GET", pd.endpoints.incomingItems).as("initialLoad");
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(sharedPO);
    cy.wait("@initialLoad", { timeout: pd.timeouts.initialLoadTimeout });
    waitForProductTableLoaded();
  }

  // Fail fast if the import did not produce the expected number of unique
  // products. Seeding silently collapses rows when an attribute value is
  // rejected by a List-type attribute (only 4 RAMbrand values are valid), so
  // we assert the pagination footer's total *before* running any test that
  // depends on multi-page behavior.
  function verifySeededProductCount() {
    cy.intercept("GET", pd.endpoints.incomingItems).as("seedVerifyLoad");
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(sharedPO);
    cy.wait("@seedVerifyLoad", { timeout: pd.timeouts.initialLoadTimeout });
    waitForProductTableLoaded();
    getRecordRange().then((range) => {
      expect(
        range.total,
        `Seed import produced ${range.total} products; expected ${pd.seed.totalProducts}. ` +
          `Check that all rows in the generated Excel use valid List-type attribute values.`
      ).to.equal(pd.seed.totalProducts);
    });
  }

  // ─── Suite setup ─────────────────────────────────────────────────────────

  before(() => {
    cy.fixture("paginationData").then((pageData) => {
      pd = pageData;
      cy.fixture("stockInByQtyData").then((stockData) => {
        td = stockData;

        cy.authSession('admin');
        cy.visit("/");

        importAttributesAndCategories();
        ensureCommonAttributesOptional();

        incomingInvPage = new IncomingInvPage();
        purchaseOrderPage = new PurchaseOrderPage();

        const stamp = ts();
        sharedPO = `${pd.poPrefix}-${stamp}`;
        createdPOs.push(sharedPO);
        const fileName = `PageTest-${stamp}.xlsx`;

        createExcelFile(fileName, buildUniqueRamRows(pd.seed.totalProducts));
        importExcel(fileName, sharedPO);

        verifySeededProductCount();
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  after(() => {
    if (createdPOs.length === 0) return;
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });

  // ===========================================================================
  // ██████████  FUNCTIONAL  ████████████████████████████████████████████████████
  // ===========================================================================

  /**
   * @testCaseId    SW_INC_PAGE_001
   * @description   The rows-per-page dropdown exposes exactly the configured
   *                ROWS_PER_PAGE_OPTIONS values [25, 50, 75, 100, 150] and
   *                the default selection is the first option (25).
   * @testData      fixtures/paginationData.json → rowsPerPageOptions, defaultRowsPerPage
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Read the currently selected rows-per-page value
   *   3. Open the rows-per-page dropdown and read every option value
   * @expectedResult  Selected value equals 25; option list deep-equals
   *                  [25, 50, 75, 100, 150] in order.
   */
  it(
    "SW_INC_PAGE_001 – Rows-per-page dropdown exposes the configured options with 25 selected by default",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Technique: Use Case
      navigateToSeededPO();

      getRowsPerPage().should("equal", pd.defaultRowsPerPage);

      getRowsPerPageOptions().then((options) => {
        expect(options).to.deep.equal(pd.rowsPerPageOptions);
      });
    }
  );

  /**
   * @testCaseId    SW_INC_PAGE_002
   * @description   The "Record: X - Y of Z" footer text accurately reflects
   *                the seeded total and the number of rows currently rendered
   *                in the table body on page 1.
   * @testData      fixtures/paginationData.json → seed.totalProducts, expected.page1Count
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Read the record range from the pagination footer
   *   3. Count visible table body rows
   * @expectedResult  total === 30, from === 1, to === 25, and the table body
   *                  renders exactly 25 rows.
   */
  it(
    "SW_INC_PAGE_002 – Record count text matches the seeded total and visible row count",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Technique: BVA
      navigateToSeededPO();

      getRecordRange().then((range) => {
        expect(range.total, "total records").to.equal(pd.seed.totalProducts);
        expect(range.from, "from index on page 1").to.equal(1);
        expect(range.to, "to index on page 1").to.equal(pd.expected.page1Count);
      });

      assertVisibleRowCount(pd.expected.page1Count);
    }
  );

  /**
   * @testCaseId    SW_INC_PAGE_003
   * @description   Clicking the next-page arrow on page 1 advances the table
   *                to page 2, updates the record range to span the remaining
   *                rows, and renders the leftover row count.
   * @testData      fixtures/paginationData.json → expected.page1Count,
   *                expected.page2Count, expected.lastPage
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Click the next-page arrow and wait for the list refetch
   *   3. Read the new record range and current page number
   *   4. Count visible table body rows
   * @expectedResult  Current page === 2, range.from === 26, range.to === 30,
   *                  and exactly 5 rows are rendered.
   */
  it(
    "SW_INC_PAGE_003 – Next-arrow click advances from page 1 to page 2 with the correct record range",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Technique: BVA
      navigateToSeededPO();

      clickNextPage({
        endpoint: pd.endpoints.incomingItems,
        timeout: pd.timeouts.pageNavTimeout,
      });

      getCurrentPage().should("equal", pd.expected.lastPage);

      getRecordRange().then((range) => {
        expect(range.from).to.equal(pd.expected.page1Count + 1);
        expect(range.to).to.equal(pd.seed.totalProducts);
        expect(range.total).to.equal(pd.seed.totalProducts);
      });

      assertVisibleRowCount(pd.expected.page2Count);
    }
  );

  /**
   * @testCaseId    SW_INC_PAGE_004
   * @description   Clicking the previous-page arrow on page 2 returns the
   *                table to page 1, restoring the original record range and
   *                row count.
   * @testData      fixtures/paginationData.json → expected.page1Count,
   *                expected.firstPage
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Click the next-page arrow to reach page 2
   *   3. Click the previous-page arrow and wait for the refetch
   *   4. Read the record range and current page number
   * @expectedResult  Current page === 1, range.from === 1,
   *                  range.to === 25, and 25 rows are rendered.
   */
  it(
    "SW_INC_PAGE_004 – Prev-arrow click returns from page 2 to page 1 with the correct record range",
    { tags: ["@regression"] },
    () => {
      // Technique: EP
      navigateToSeededPO();

      clickNextPage({
        endpoint: pd.endpoints.incomingItems,
        timeout: pd.timeouts.pageNavTimeout,
      });
      getCurrentPage().should("equal", pd.expected.lastPage);

      // React Query caches page-1 data — the prev-page click may be served from
      // cache with no new network request. Skip the endpoint intercept and just
      // assert the DOM updates (page indicator + record range).
      clickPrevPage();

      getCurrentPage().should("equal", pd.expected.firstPage);

      getRecordRange().then((range) => {
        expect(range.from).to.equal(1);
        expect(range.to).to.equal(pd.expected.page1Count);
      });

      assertVisibleRowCount(pd.expected.page1Count);
    }
  );

  /**
   * @testCaseId    SW_INC_PAGE_007
   * @description   Page navigation actually swaps the rendered rows: a
   *                snapshot of the table on page 1 must not equal a snapshot
   *                of the table on page 2 (the data set rotates with the
   *                paginated query, not just the page indicator).
   * @testData      fixtures/paginationData.json → endpoints.incomingItems
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Snapshot all table rows on page 1
   *   3. Click the next-page arrow and wait for the refetch
   *   4. Snapshot all table rows on page 2
   *   5. Compare the two snapshots
   * @expectedResult  Both snapshots are non-empty and the page-1 snapshot is
   *                  not deep-equal to the page-2 snapshot — confirming the
   *                  table actually re-renders new rows when the page changes.
   */
  it(
    "SW_INC_PAGE_007 – Navigating pages changes the rows rendered in the table",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Technique: EP
      navigateToSeededPO();

      snapshotTableRows().then((page1Rows) => {
        expect(page1Rows.length, "page 1 row count").to.be.greaterThan(0);

        clickNextPage({
          endpoint: pd.endpoints.incomingItems,
          timeout: pd.timeouts.pageNavTimeout,
        });

        // Retry the comparison rather than snapshotting once: the page-2 request
        // resolving does not mean React has swapped the rows in yet, and a
        // one-shot read can still see page 1 (reported as "rows did not change").
        assertTableRowsChangedFrom(page1Rows, pd.timeouts.pageNavTimeout);
      });
    }
  );

  /**
   * @testCaseId    SW_INC_PAGE_008
   * @description   Increasing rows-per-page beyond the seeded total collapses
   *                the table to a single page: the next button becomes
   *                disabled and every seeded record renders in one page.
   * @testData      fixtures/paginationData.json → secondaryRowsPerPage,
   *                seed.totalProducts
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Set rows-per-page to 50 (greater than the 30 seeded products)
   *   3. Read the record range and visible row count
   *   4. Inspect the next-page button state
   * @expectedResult  range.to === 30, exactly 30 rows render, and the
   *                  next-page button is disabled.
   */
  it(
    "SW_INC_PAGE_008 – Increasing rows-per-page beyond the total collapses the table to one page",
    { tags: ["@regression"] },
    () => {
      // Technique: BVA
      navigateToSeededPO();

      setRowsPerPage(pd.secondaryRowsPerPage, {
        endpoint: pd.endpoints.incomingItems,
        timeout: pd.timeouts.pageNavTimeout,
      });

      getRowsPerPage().should("equal", pd.secondaryRowsPerPage);

      getRecordRange().then((range) => {
        expect(range.from).to.equal(1);
        expect(range.to).to.equal(pd.seed.totalProducts);
        expect(range.total).to.equal(pd.seed.totalProducts);
      });

      assertVisibleRowCount(pd.seed.totalProducts);
      assertNextDisabled();
      assertPrevDisabled();
    }
  );

  // ===========================================================================
  // ██████████  NEGATIVE / BOUNDARY  ███████████████████████████████████████████
  // ===========================================================================

  /**
   * @testCaseId    SW_INC_PAGE_005
   * @description   On the first page the previous-page arrow must be disabled
   *                (no earlier records exist) while the next-page arrow is
   *                enabled (more pages follow).
   * @testData      fixtures/paginationData.json → errorMessages.prevNotDisabled
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Confirm current page is 1
   *   3. Inspect the prev and next button states
   * @expectedResult  Previous button has the disabled attribute; next button
   *                  is enabled.
   */
  it(
    "SW_INC_PAGE_005 – Previous-page button is disabled on the first page",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Technique: BVA
      navigateToSeededPO();

      getCurrentPage().should("equal", pd.expected.firstPage);
      assertPrevDisabled();
      assertNextEnabled();
    }
  );

  /**
   * @testCaseId    SW_INC_PAGE_006
   * @description   On the last page the next-page arrow must be disabled
   *                (no further records exist) while the previous-page arrow
   *                is enabled.
   * @testData      fixtures/paginationData.json → expected.lastPage,
   *                errorMessages.nextNotDisabled
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Click next until the next-page button becomes disabled
   *   3. Read the current page number
   *   4. Inspect the prev and next button states
   * @expectedResult  Current page === 2 (last page), next button is disabled,
   *                  previous button is enabled.
   */
  it(
    "SW_INC_PAGE_006 – Next-page button is disabled on the last page",
    { tags: ["@smoke", "@regression"] },
    () => {
      // Technique: BVA
      navigateToSeededPO();

      goToLastPage({ endpoint: pd.endpoints.incomingItems });

      getCurrentPage().should("equal", pd.expected.lastPage);
      assertNextDisabled();
      assertPrevEnabled();
    }
  );
});
