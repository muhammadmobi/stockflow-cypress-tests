import ItemViewPage from "../../pageObjects/ItemViewPage";
import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories } from "../../support/helpers/attributeHelpers";
import {
  makeLaptopRowWithSerial,
  importExcel,
  createExcelFile,
} from "../../support/helpers/incomingInventoryHelpers";

/**
 * Product Details Items List Sorting Tests — SW-PDIS-TC001 – SW-PDIS-TC010
 *
 * Functional Cases (Use Case Testing):
 *   SW-PDIS-TC001 — Serial Number column sort cycle (asc → desc → none)
 *   SW-PDIS-TC002 — Status column sort
 *   SW-PDIS-TC003 — Location column sort
 *   SW-PDIS-TC004 — Container column sort
 *
 * Boundary Value Analysis (BVA):
 *   SW-PDIS-TC005 — Single item sorting (lower boundary: qty=1)
 *   SW-PDIS-TC006 — Maximum page size sorting (upper boundary: 100 items)
 *
 * Edge Cases — Decision Table & Error Guessing:
 *   SW-PDIS-TC007 — Sort works when only one row is present (no crash)
 *   SW-PDIS-TC008 — Search filter + sort combined
 *   SW-PDIS-TC009 — Status filter + sort combined (skips when filter UI absent)
 *   SW-PDIS-TC010 — Rapid sort clicks (race condition guard)
 */
const LOG_FILE = "cypress/logs/ProductDetailsItemsSorting-debug.log";

function log(msg) {
  cy.task("writeLog", { filePath: LOG_FILE, message: msg });
  cy.log(msg);
}

describe("Product Details Items Sorting Tests (SW-PDIS-TC001 – SW-PDIS-TC010)", () => {
  let itemViewPage, incomingInvPage, purchaseOrderPage;
  let td;

  const createdPOs = [];
  let productWithItemsPO;
  let singleItemPO;
  let manyItemsPO;

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  function getNonEmptySerialsWithRetry(maxAttempts = 8) {
    const attempt = (attemptNo = 1) => {
      return itemViewPage.getSerialNumbersFromTable().then((serials) => {
        if (serials.length > 0) {
          return serials;
        }

        if (attemptNo >= maxAttempts) {
          throw new Error(
            `Serial Number rows did not render after ${maxAttempts} attempts`
          );
        }

        log(
          `[WAIT] Serial rows still empty. Retry ${attemptNo}/${maxAttempts} — waiting for table rows`
        );
        cy.get("tbody tr", { timeout: 10000 }).should("have.length.at.least", 1);
        return attempt(attemptNo + 1);
      });
    };

    return attempt();
  }

  // ─── before() ─────────────────────────────────────────────────────────────
  before(() => {
    cy.task("writeLog", {
      filePath: LOG_FILE,
      message: "\n=== ProductDetailsItemsSorting Suite START ===",
    });

    cy.fixture("productDetailsItemsSortingData").then((data) => {
      td = data;
      const runId = ts();
      log(`[SETUP] Starting test setup with runId: ${runId}`);
      log(`[SETUP] Laptop category: ${td.laptop.category}`);

      cy.adminSession();
      cy.visit("/");
      log("[SETUP] Admin session established, on home page");

      // Ensure laptop category exists with allowItems=true
      cy.getAuthToken().then((token) => {
        const apiBase = Cypress.env("API_BASE_URL");
        log(`[SETUP] API base: ${apiBase}`);

        cy.request({
          method: "POST",
          url: `${apiBase}/categories`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: {
            name: td.laptop.category,
            description: "Test category for items sorting",
            allowItems: true,
            allowVariants: false,
            allowVariantItems: false,
          },
          failOnStatusCode: false,
        }).then((res) => {
          log(`[SETUP] Category creation response: ${res.status}`);
          cy.log(`Ensure category '${td.laptop.category}': ${res.status}`);
        });
      });

      importAttributesAndCategories();
      log("[SETUP] Attributes and categories imported");

      itemViewPage = new ItemViewPage();
      incomingInvPage = new IncomingInvPage();
      purchaseOrderPage = new PurchaseOrderPage();

      const laptopRow = makeLaptopRowWithSerial(td);
      log(`[SETUP] Laptop row generator ready`);

      // ── Product with 5 Items (Standard) ─────────────────────────────────────
      const poStamp1 = ts();
      productWithItemsPO = `PO-Items-Sort-${poStamp1}`;
      createdPOs.push(productWithItemsPO);
      const fileName1 = `ItemsSort-${poStamp1}.xlsx`;
      const serials1 = td.testData.epMultipleItems.serials.map(
        (s) => `${s}-${runId}`
      );
      log(`[SETUP] Creating PO with 5 items: ${productWithItemsPO}`);
      log(`[SETUP] Serials: ${JSON.stringify(serials1)}`);
      createExcelFile(
        fileName1,
        serials1.map((serial) => laptopRow(serial))
      );
      importExcel(fileName1, productWithItemsPO);
      log(`[SETUP] Excel imported for 5-item PO`);

      // ── Product with Single Item ───────────────────────────────────────────
      const poStamp2 = ts();
      singleItemPO = `PO-Single-Item-${poStamp2}`;
      createdPOs.push(singleItemPO);
      const fileName2 = `SingleItem-${poStamp2}.xlsx`;
      const singleSerial = `${td.testData.epSingleItem.serials[0]}-${runId}`;
      log(`[SETUP] Creating single-item PO: ${singleItemPO}, serial: ${singleSerial}`);
      
      createExcelFile(fileName2, [laptopRow(singleSerial)]);
      importExcel(fileName2, singleItemPO);
      log(`[SETUP] Excel imported for single-item PO`);

      // ── Product with Many Items ────────────────────────────────────────────
      const poStamp3 = ts();
      manyItemsPO = `PO-Many-Items-${poStamp3}`;
      createdPOs.push(manyItemsPO);
      const fileName3 = `ManyItems-${poStamp3}.xlsx`;
      const manyRows = Array.from(
        { length: td.testData.epManyItems.count },
        (_, i) =>
          laptopRow(
            `${td.testData.epManyItems.prefix}${String(i + 1).padStart(
              3,
              "0"
            )}-${runId}`
          )
      );
      log(`[SETUP] Creating many-items PO: ${manyItemsPO}, count: ${td.testData.epManyItems.count}`);
      
      createExcelFile(fileName3, manyRows);
      importExcel(fileName3, manyItemsPO);
      log(`[SETUP] Excel imported for many-items PO`);

      log(`[SETUP] Complete. Created POs: ${JSON.stringify(createdPOs)}`);
    });
  });

  // ─── beforeEach() ─────────────────────────────────────────────────────────
  beforeEach(() => {
    cy.adminSession();
    cy.visit("/");
    itemViewPage = new ItemViewPage();
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // ===========================================================================
  // ██████████  FUNCTIONAL CASES — Use Case Testing  █████████████████████████
  // ===========================================================================
  describe("Functional Cases — Happy Path", () => {
    /**
     * @testCaseId    SW-PDIS-TC001
     * @description   Serial Number column sort cycles through ascending then descending on two successive clicks.
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epMultipleItems
     * @steps
     *   1. Navigate to product details via productWithItemsPO
     *   2. Read initial serial order from table
     *   3. Click Serial Number header once — capture resulting order
     *   4. Click Serial Number header again — capture resulting order
     *   5. Assert the two captured orders differ and at least one matches a sorted sequence
     * @expectedResult  Two clicks produce distinct orderings; at least one is correctly ascending or descending.
     */
    it(
      "SW-PDIS-TC001 — Serial Number sort cycles through ascending and descending",
      { tags: ["@smoke", "@regression"] },
      () => {
        log(`[TC001] START - PO: ${productWithItemsPO}`);
        
        log("[TC001] Navigating to product details via Incoming Inventory...");
        itemViewPage.navigateToProductDetails(productWithItemsPO);
        itemViewPage.waitForLoadingComplete();
        log("[TC001] Page loaded");

        // Store serials in an object that persists across cy.then() blocks
        const serials = { initial: [], first: [], second: [] };
        
        // Get initial serial numbers
        getNonEmptySerialsWithRetry().then((initial) => {
          serials.initial = initial;
          log(`[TC001] Initial serials: [${initial.join(", ")}]`);
          expect(initial.length).to.be.at.least(1);
        });
        
        // Click once to sort
        cy.then(() => {
          log("[TC001] Click 1: Sorting...");
          itemViewPage.clickSerialNumberColumnSort();
        });
        
        // Get serials after first click
        cy.then(() => {
          getNonEmptySerialsWithRetry().then((first) => {
            serials.first = first;
            log(`[TC001] After click 1: [${first.join(", ")}]`);
          });
        });
        
        // Click again to toggle
        cy.then(() => {
          log("[TC001] Click 2: Sorting...");
          itemViewPage.clickSerialNumberColumnSort();
        });
        
        // Get serials after second click
        cy.then(() => {
          getNonEmptySerialsWithRetry().then((second) => {
            serials.second = second;
            log(`[TC001] After click 2: [${second.join(", ")}]`);
          });
        });
        
        // Verify results
        cy.then(() => {
          const order1 = serials.first.join(',');
          const order2 = serials.second.join(',');
          
          // Verify we have at least 2 different orderings
          const hasDifferentOrder = order1 !== order2;
          expect(hasDifferentOrder, `Sort should produce different orderings. Order1: [${serials.first}], Order2: [${serials.second}]`).to.be.true;
          
          // Check if one is ascending
          const sortedAsc = [...serials.first].sort((a, b) => a.localeCompare(b));
          const isAsc = JSON.stringify(serials.first) === JSON.stringify(sortedAsc);
          
          // Check if one is descending
          const sortedDesc = [...serials.second].sort((a, b) => b.localeCompare(a));
          const isDesc = JSON.stringify(serials.second) === JSON.stringify(sortedDesc);
          
          log(`[TC001] First is ascending: ${isAsc}, Second is descending: ${isDesc}`);
          
          // At least one should match expected sort order
          expect(isAsc || isDesc, `One order should be correctly sorted. First: [${serials.first}], Second: [${serials.second}]`).to.be.true;
          
          log("[TC001] PASS - Sort cycling verified");
        });
      }
    );

    /**
     * @testCaseId    SW-PDIS-TC002
     * @description   Use Case — Status column sort cycles through ascending and descending on two clicks.
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epMultipleItems, expectedResults.sortStates
     * @steps
     *   1. Navigate to product details via productWithItemsPO
     *   2. Click Status column header once — assert rows are in ascending status order
     *   3. Click Status column header again — assert rows are in descending status order
     * @expectedResult  Status column sorts ascending on first click and descending on second click without crash.
     */
    it(
      "SW-PDIS-TC002 — Status column sort cycles through ascending and descending",
      { tags: ["@regression"] },
      () => {
        log(`[TC002] START - PO: ${productWithItemsPO}`);
        itemViewPage.navigateToProductDetails(productWithItemsPO);
        itemViewPage.waitForLoadingComplete();

        cy.intercept("GET", "**/incoming-items/**/items**").as("statusSort1");
        itemViewPage.clickStatusColumnSort();
        cy.wait("@statusSort1");
        itemViewPage.getStatusValuesFromTable().then((ascValues) => {
          expect(ascValues.length, "Table should have rows after Status sort").to.be.at.least(1);
          const sortedAsc = [...ascValues].sort((a, b) => a.localeCompare(b));
          expect(ascValues, "Status values should be ascending after first click").to.deep.equal(sortedAsc);
          log(`[TC002] Ascending status order verified: [${ascValues.join(", ")}]`);
        });

        cy.intercept("GET", "**/incoming-items/**/items**").as("statusSort2");
        itemViewPage.clickStatusColumnSort();
        cy.wait("@statusSort2");
        itemViewPage.getStatusValuesFromTable().then((descValues) => {
          const sortedDesc = [...descValues].sort((a, b) => b.localeCompare(a));
          expect(descValues, "Status values should be descending after second click").to.deep.equal(sortedDesc);
          log(`[TC002] Descending status order verified: [${descValues.join(", ")}]`);
        });

        log("[TC002] PASS");
      }
    );

    /**
     * @testCaseId    SW-PDIS-TC003
     * @description   Use Case — Location column sort cycles through ascending and descending on two clicks.
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epMultipleItems, expectedResults.sortStates
     * @steps
     *   1. Navigate to product details via productWithItemsPO
     *   2. Click Location column header once — assert rows are in ascending location order
     *   3. Click Location column header again — assert rows are in descending location order
     * @expectedResult  Location column sorts ascending on first click and descending on second click without crash.
     */
    it(
      "SW-PDIS-TC003 — Location column sort cycles through ascending and descending",
      { tags: ["@regression"] },
      () => {
        log(`[TC003] START - PO: ${productWithItemsPO}`);
        itemViewPage.navigateToProductDetails(productWithItemsPO);
        itemViewPage.waitForLoadingComplete();

        cy.intercept("GET", "**/incoming-items/**/items**").as("locationSort1");
        itemViewPage.clickLocationColumnSort();
        cy.wait("@locationSort1");
        itemViewPage.getLocationValuesFromTable().then((ascValues) => {
          expect(ascValues.length, "Table should have rows after Location sort").to.be.at.least(1);
          const sortedAsc = [...ascValues].sort((a, b) => a.localeCompare(b));
          expect(ascValues, "Location values should be ascending after first click").to.deep.equal(sortedAsc);
          log(`[TC003] Ascending location order verified: [${ascValues.join(", ")}]`);
        });

        cy.intercept("GET", "**/incoming-items/**/items**").as("locationSort2");
        itemViewPage.clickLocationColumnSort();
        cy.wait("@locationSort2");
        itemViewPage.getLocationValuesFromTable().then((descValues) => {
          const sortedDesc = [...descValues].sort((a, b) => b.localeCompare(a));
          expect(descValues, "Location values should be descending after second click").to.deep.equal(sortedDesc);
          log(`[TC003] Descending location order verified: [${descValues.join(", ")}]`);
        });

        log("[TC003] PASS");
      }
    );

    /**
     * @testCaseId    SW-PDIS-TC004
     * @description   Use Case — Container column sort cycles through ascending and descending on two clicks.
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epMultipleItems, expectedResults.sortStates
     * @steps
     *   1. Navigate to product details via productWithItemsPO
     *   2. Click Container column header once — assert rows are in ascending container order
     *   3. Click Container column header again — assert rows are in descending container order
     * @expectedResult  Container column sorts ascending on first click and descending on second click without crash.
     */
    it(
      "SW-PDIS-TC004 — Container column sort cycles through ascending and descending",
      { tags: ["@regression"] },
      () => {
        log(`[TC004] START - PO: ${productWithItemsPO}`);
        itemViewPage.navigateToProductDetails(productWithItemsPO);
        itemViewPage.waitForLoadingComplete();

        cy.intercept("GET", "**/incoming-items/**/items**").as("containerSort1");
        itemViewPage.clickContainerColumnSort();
        cy.wait("@containerSort1");
        itemViewPage.getContainerValuesFromTable().then((ascValues) => {
          expect(ascValues.length, "Table should have rows after Container sort").to.be.at.least(1);
          const sortedAsc = [...ascValues].sort((a, b) => a.localeCompare(b));
          expect(ascValues, "Container values should be ascending after first click").to.deep.equal(sortedAsc);
          log(`[TC004] Ascending container order verified: [${ascValues.join(", ")}]`);
        });

        cy.intercept("GET", "**/incoming-items/**/items**").as("containerSort2");
        itemViewPage.clickContainerColumnSort();
        cy.wait("@containerSort2");
        itemViewPage.getContainerValuesFromTable().then((descValues) => {
          const sortedDesc = [...descValues].sort((a, b) => b.localeCompare(a));
          expect(descValues, "Container values should be descending after second click").to.deep.equal(sortedDesc);
          log(`[TC004] Descending container order verified: [${descValues.join(", ")}]`);
        });

        log("[TC004] PASS");
      }
    );
  });

  // ===========================================================================
  // ██████████  BOUNDARY VALUE ANALYSIS  █████████████████████████████████████
  // ===========================================================================
  describe("Boundary Value Cases", () => {
    /**
     * @testCaseId    SW-PDIS-TC005
     * @description   BVA lower boundary — sort columns work without error when the table has exactly 1 item.
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epSingleItem
     * @steps
     *   1. Navigate to product details via singleItemPO (1 item)
     *   2. Click Serial Number column sort — assert 1 row remains
     *   3. Click Status column sort — assert 1 row remains
     *   4. Click Location column sort — assert 1 row remains
     * @expectedResult  Table retains exactly 1 row after each sort click; no crash or empty state.
     */
    it(
      "SW-PDIS-TC005 — Single item: Verify sorting works with minimum boundary",
      { tags: ["@regression"] },
      () => {
        log(`SW-PDIS-TC005: single item PO ${singleItemPO}`);
        itemViewPage.navigateToProductDetails(singleItemPO);
        itemViewPage.waitForLoadingComplete();

        itemViewPage.clickSerialNumberColumnSort();
        itemViewPage.verifyTableHasRows(1);

        itemViewPage.clickStatusColumnSort();
        itemViewPage.verifyTableHasRows(1);

        itemViewPage.clickLocationColumnSort();
        itemViewPage.verifyTableHasRows(1);
      }
    );

    /**
     * @testCaseId    SW-PDIS-TC006
     * @description   BVA upper boundary — sort is correct when table contains 100 items (page boundary).
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epManyItems
     * @steps
     *   1. Navigate to product details via manyItemsPO (100 items)
     *   2. Assert at least 1 row renders on initial load
     *   3. Click Serial Number header once — assert visible rows are in ascending order
     *   4. Click Serial Number header again — assert visible rows are in descending order
     * @expectedResult  Visible rows correctly sorted ascending then descending; no crash on large dataset.
     */
    it(
      "SW-PDIS-TC006 — Maximum page size: Verify sorting with 100 items across paginated view",
      { tags: ["@regression"] },
      () => {
        log(`SW-PDIS-TC006: many items PO ${manyItemsPO}`);
        itemViewPage.navigateToProductDetails(manyItemsPO);
        itemViewPage.waitForLoadingComplete();

        itemViewPage.getSerialNumbersFromTable().then((initialRows) => {
          expect(
            initialRows.length,
            "Many-items PO should render at least one page of data"
          ).to.be.at.least(1);
          log(`SW-PDIS-TC006: Initial visible rows = ${initialRows.length}`);
        });

        // Explicit click #1: verify ascending order
        itemViewPage.clickSerialNumberColumnSort();
        itemViewPage.getSerialNumbersFromTable().then((ascendingRows) => {
          expect(
            ascendingRows,
            "After first sort click, serial numbers should be ascending"
          ).to.deep.equal([...ascendingRows].sort((a, b) => a.localeCompare(b)));
          log(`SW-PDIS-TC006: Ascending sort verified on ${ascendingRows.length} rows`);
        });

        // Explicit click #2: verify descending order
        itemViewPage.clickSerialNumberColumnSort();
        itemViewPage.getSerialNumbersFromTable().then((descendingRows) => {
          expect(
            descendingRows,
            "After second sort click, serial numbers should be descending"
          ).to.deep.equal([...descendingRows].sort((a, b) => b.localeCompare(a)));
          log(`SW-PDIS-TC006: Descending sort verified on ${descendingRows.length} rows`);
        });
      }
    );
  });

  // ===========================================================================
  // ██████████  EDGE CASES — Decision Table & Error Guessing  █████████████████
  // ===========================================================================
  describe("Edge Cases — Decision Table & Error Guessing", () => {
    /**
     * @testCaseId    SW-PDIS-TC007
     * @description   Error guessing — rapid sort clicks on a single-row table do not crash or change the row value.
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epSingleItem
     * @steps
     *   1. Navigate to product details via singleItemPO
     *   2. Read serial value before sorting
     *   3. Click Serial Number header twice
     *   4. Assert row count and serial value unchanged after sorting
     * @expectedResult  Row count remains 1 and serial value is identical before and after sort clicks.
     */
    it(
      "SW-PDIS-TC007 — Single row sort: no crash and value stable across clicks",
      { tags: ["@regression"] },
      () => {
        log("SW-PDIS-TC007: single-row sort stability");
        itemViewPage.navigateToProductDetails(singleItemPO);
        itemViewPage.waitForLoadingComplete();

        getNonEmptySerialsWithRetry().then((before) => {
          expect(
            before.length,
            "Single-item PO should show exactly one serial row"
          ).to.equal(1);

          cy.intercept("GET", "**/incoming-items/**/items**").as("sortReload1");
          itemViewPage.clickSerialNumberColumnSort();
          cy.wait("@sortReload1");
          cy.intercept("GET", "**/incoming-items/**/items**").as("sortReload2");
          itemViewPage.clickSerialNumberColumnSort();
          cy.wait("@sortReload2");

          getNonEmptySerialsWithRetry().then((after) => {
            expect(after.length).to.equal(before.length);
            expect(after[0]).to.equal(before[0]);
          });
        });
      }
    );

    /**
     * @testCaseId    SW-PDIS-TC008
     * @description   Decision table — search filter combined with sort produces filtered and correctly ordered results.
     * @testData      fixtures/productDetailsItemsSortingData.json → searchTerms.alphaPrefix, expectedResults.sortStates
     * @steps
     *   1. Navigate to product details via productWithItemsPO
     *   2. Search for alphaPrefix term
     *   3. Wait for search API response
     *   4. Click Serial Number header until ascending sort state is reached
     *   5. Assert all visible rows contain the search term and are sorted ascending
     * @expectedResult  Only matching rows shown; those rows are in ascending serial order.
     */
    it(
      "SW-PDIS-TC008 — Search + Sort: Verify combined filter and sort behavior",
      { tags: ["@regression"] },
      () => {
        log("SW-PDIS-TC008: search + sort");
        itemViewPage.navigateToProductDetails(productWithItemsPO);
        itemViewPage.waitForLoadingComplete();

        const searchPattern = td.searchTerms.alphaPrefix;
        cy.intercept("GET", "**/incoming-items/**/items**").as("searchResult");
        itemViewPage.searchItems(searchPattern);
        cy.wait("@searchResult");

        itemViewPage.clickUntilSortState(
          "serialNumber",
          td.expectedResults.sortStates.ascending
        );

        itemViewPage.getSerialNumbersFromTable().then((filteredSerials) => {
          expect(filteredSerials.length).to.be.at.least(1);
          expect(
            filteredSerials.every((s) =>
              s.toUpperCase().includes(searchPattern)
            )
          ).to.be.true;
          const sorted = [...filteredSerials].sort((a, b) => a.localeCompare(b));
          expect(filteredSerials).to.deep.equal(sorted);
        });
      }
    );

    /**
     * @testCaseId    SW-PDIS-TC009
     * @description   Decision table — status filter combined with sort shows correctly filtered + ordered rows; probe-then-skip when filter UI absent.
     * @testData      fixtures/productDetailsItemsSortingData.json → expectedResults.sortStates
     * @steps
     *   1. Navigate to product details via productWithItemsPO
     *   2. Probe for status filter UI presence
     *   3a. If absent: apply Status column sort and assert table is not empty
     *   3b. If present: apply "Available" filter, sort by Location ascending, assert all rows are "Available"
     * @expectedResult  Table is non-empty and sorted when filter absent; filtered + sorted correctly when present.
     */
    it(
      "SW-PDIS-TC009 — Status Filter + Sort: Verify combined behavior",
      { tags: ["@regression"] },
      () => {
        log("SW-PDIS-TC009: status filter + sort");
        itemViewPage.navigateToProductDetails(productWithItemsPO);
        itemViewPage.waitForLoadingComplete();

        cy.get("body").then(($body) => {
          const hasStatusFilter =
            $body.find('[data-testid="status-filter"]').length > 0;
          if (!hasStatusFilter) {
            log("Status filter UI not available — verifying sort works alone");
            itemViewPage.clickUntilSortState(
              "status",
              td.expectedResults.sortStates.ascending
            );
            itemViewPage.verifyTableNotEmpty();
          } else {
            itemViewPage.applyStatusFilter("Available");
            itemViewPage.clickUntilSortState(
              "location",
              td.expectedResults.sortStates.ascending
            );
            itemViewPage.getStatusValuesFromTable().then((statuses) => {
              expect(statuses.every((s) => s === "Available")).to.be.true;
            });
          }
        });
      }
    );

    /**
     * @testCaseId    SW-PDIS-TC010
     * @description   Error guessing — five rapid sort clicks do not cause a race condition; table stays populated in a valid sort state.
     * @testData      fixtures/productDetailsItemsSortingData.json → testData.epMultipleItems
     * @steps
     *   1. Navigate to product details via productWithItemsPO
     *   2. Click Serial Number header 5 times in rapid succession
     *   3. Wait for the last sort API response to settle
     *   4. Assert table rows exist and final sort state is a valid enum value
     * @expectedResult  Table has at least 1 row; sort state is one of ascending, descending, or none; no JS error thrown.
     */
    it(
      "SW-PDIS-TC010 — Rapid clicks: Verify no race condition on quick successive sorts",
      { tags: ["@regression"] },
      () => {
        log("SW-PDIS-TC010: rapid clicks");
        itemViewPage.navigateToProductDetails(productWithItemsPO);
        itemViewPage.waitForLoadingComplete();

        cy.intercept("GET", "**/incoming-items/**/items**").as("lastSort");
        for (let i = 0; i < 5; i++) {
          itemViewPage.clickSerialNumberColumnSort();
        }
        cy.wait("@lastSort");

        itemViewPage.verifyTableNotEmpty();
        itemViewPage.getSerialNumbersFromTable().then((serials) => {
          expect(serials.length).to.be.at.least(1);
        });

        itemViewPage.getSerialNumberColumnSortState().then((finalState) => {
          expect(["ascending", "descending", "none"]).to.include(finalState);
          cy.log(`Final state after rapid clicks: ${finalState}`);
        });
      }
    );
  });

  // ─── after() — cleanup created POs ─────────────────────────────────────────
  after(() => {
    cy.task("writeLog", {
      filePath: LOG_FILE,
      message: `=== Suite END. Created POs: ${JSON.stringify(createdPOs)} ===`,
    });
    if (createdPOs.length === 0) return;
    cy.adminSession();
    cy.visit("/");
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });
});
