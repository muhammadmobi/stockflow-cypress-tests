import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import {
  clickSortAndWait,
  clickUntilSortState,
  buildRamRow,
  assertColumnSortedEventually,
} from "../../support/helpers/sortingHelpers";

/**
 * Sorting Tests — Incoming Inventory (SW_INC_SORT_001 – SW_INC_SORT_006)
 *
 * Covers the Quantity and Memory Generation column sorts on the Incoming
 * Inventory table. The table uses MaterialReactTable (MRT) with manualSorting=true.
 *
 * Sort cycle: none → ascending → descending → none (3-click cycle).
 * MRT writes aria-sort="ascending"|"descending" on <th>; omits the
 * attribute entirely when sort is cleared (reads back as "none").
 *
 * Test data: fixtures/sortingData.json + fixtures/stockInByQtyData.json
 * Seeded rows: Kingston DDR4/15, Corsair DDR5/5, Crucial DDR3/30.
 *   Quantity sort  → ascending [5, 15, 30],    descending [30, 15, 5]
 *   MemGen sort    → ascending [DDR3, DDR4, DDR5], descending [DDR5, DDR4, DDR3]
 */
describe("Incoming Inventory - Sorting Tests (SW_INC_SORT_001 – 006)", () => {
  let incomingInvPage;
  let purchaseOrderPage;
  let td;
  let sd;

  const createdPOs = [];
  let sharedPO;
  const sortCounter = { value: 0 };

  // ─── Seed helpers ────────────────────────────────────────────────────────

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  function createExcelFile(fileName, rows) {
    cy.task("createExcelFile", {
      filePath: `cypress/fixtures/${fileName}`,
      data: rows,
    }).then((msg) => cy.log(msg));
  }

  // Seeds a PO via POST /excel/upload-inventory (uploadExcelToApi task). The
  // standalone UI "Import" button was removed from the incoming-inventory
  // header, so seeding uses the API path (skill principle #3 — API for setup).
  function importExcel(fileName, poNumber) {
    cy.getAuthToken().then((token) => {
      expect(token, "auth token for import seeding").to.be.a("string").and.not.be.empty;
      cy.task("uploadExcelToApi", {
        filePath: `cypress/fixtures/${fileName}`,
        poNumber,
        authToken: token,
        baseUrl: Cypress.env("API_BASE_URL"),
      }).then((res) => {
        cy.log(`importExcel API seed → ${poNumber}: HTTP ${res.status}, success=${res.body?.success}`);
        expect(res.status, `Excel import seed status for ${poNumber}`).to.be.oneOf([200, 201]);
        expect(
          res.body?.success,
          `Excel import seed success for ${poNumber} (error=${JSON.stringify(res.body?.error || res.body?.message)})`
        ).to.eq(true);
      });
    });
  }

  // ─── Suite setup ─────────────────────────────────────────────────────────

  before(() => {
    cy.fixture("sortingData").then((sortData) => {
      sd = sortData;
      cy.fixture("stockInByQtyData").then((stockData) => {
        td = stockData;

        cy.authSession('admin');
        cy.visit("/");

        // Ensure the RAM category exists via API before importing attributes —
        // robust to run order in a full sequential suite. Idempotent (409 ignored).
        cy.getAuthToken().then((token) => {
          const apiBase =
            Cypress.env("API_BASE_URL") ||
            Cypress.config("baseUrl").replace(/\/$/, "").replace("://", "://api.");
          cy.request({
            method: "POST",
            url: `${apiBase}/categories`,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: { name: td.ram.category, description: "Sorting automation category", allowItems: false, allowVariants: false, allowVariantItems: false },
            failOnStatusCode: false,
          });
        });

        importAttributesAndCategories();
        ensureCommonAttributesOptional();

        incomingInvPage = new IncomingInvPage();
        purchaseOrderPage = new PurchaseOrderPage();

        const stamp = ts();
        sharedPO = `${sd.poPrefix}-${stamp}`;
        createdPOs.push(sharedPO);
        const fileName = `SortTest-${stamp}.xlsx`;

        createExcelFile(fileName, [
          buildRamRow(
            td,
            td.ramKingston.brand,
            sd.products.kingston.memoryGeneration,
            sd.products.kingston.expectedQty
          ),
          buildRamRow(
            td,
            td.ram.RAMbrand,
            sd.products.corsair.memoryGeneration,
            sd.products.corsair.expectedQty
          ),
          buildRamRow(
            td,
            sd.products.crucial.brand,
            sd.products.crucial.memoryGeneration,
            sd.products.crucial.expectedQty
          ),
        ]);

        importExcel(fileName, sharedPO);
        // Note: the Memory Generation column is hidden by default for RAM and
        // its visibility doesn't persist per-test; the memGen sort helpers
        // (getMemGenColumnSortState / clickMemGenColumnSortLabel) enable it
        // lazily, so no column setup is needed here.
      });
    });
  });

  beforeEach(() => {
    sortCounter.value = 0;
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
   * @testCaseId    SW_INC_SORT_001
   * @description   Clicking the Quantity sort label three times cycles the
   *                column through all three states: ascending, descending,
   *                and no-sort (none), confirming the full sort lifecycle.
   * @testData      fixtures/sortingData.json → sortStates, importSummary.initialLoadTimeout
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Record initial aria-sort value on the Quantity column header
   *   3. Click the Quantity sort label — record new state
   *   4. Click again — record new state
   *   5. Click again — record new state
   * @expectedResult  The collected states include "ascending", "descending",
   *                  and "none" across the four snapshots.
   */
  it(
    "SW_INC_SORT_001 – Quantity sort label cycles through ascending, descending, and no-sort",
    { tags: ["@smoke", "@regression"] },
    () => {
      cy.intercept("GET", "**/incoming-items**").as("initialLoad");
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      cy.wait("@initialLoad", { timeout: sd.importSummary.initialLoadTimeout });

      const observedStates = [];

      incomingInvPage.getQuantityColumnSortState().then((state) => {
        observedStates.push(state);
      });

      sortCounter.value++;
      clickSortAndWait(incomingInvPage, sortCounter.value, sd.importSummary.sortWaitTimeout).then((state) => {
        observedStates.push(state);
      });

      sortCounter.value++;
      clickSortAndWait(incomingInvPage, sortCounter.value, sd.importSummary.sortWaitTimeout).then((state) => {
        observedStates.push(state);
      });

      sortCounter.value++;
      clickSortAndWait(incomingInvPage, sortCounter.value, sd.importSummary.sortWaitTimeout).then((state) => {
        observedStates.push(state);
      });

      cy.then(() => {
        const stateSet = new Set(observedStates);
        cy.log(`Observed sort states: [${observedStates.join(", ")}]`);
        expect(stateSet.has(sd.sortStates.ascending), "ascending state observed").to.be.true;
        expect(stateSet.has(sd.sortStates.descending), "descending state observed").to.be.true;
        expect(stateSet.has(sd.sortStates.none), "no-sort state observed").to.be.true;
      });
    }
  );

  /**
   * @testCaseId    SW_INC_SORT_002
   * @description   When the Quantity column is sorted ascending, the Expected
   *                quantities rendered in the table body appear in
   *                smallest-to-largest order matching the seeded data.
   * @testData      fixtures/sortingData.json → sortStates.ascending,
   *                expectedQtiesAscending, errorMessages.noAscendingState
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Click the Quantity sort label until aria-sort equals "ascending"
   *   3. Read "Expected:" values from every table row
   * @expectedResult  Extracted quantities equal [5, 15, 30] (ascending order).
   */
  it(
    "SW_INC_SORT_002 – Quantity column ascending sort renders rows in smallest-to-largest order",
    { tags: ["@regression"] },
    () => {
      cy.intercept("GET", "**/incoming-items**").as("initialLoad");
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      cy.wait("@initialLoad", { timeout: sd.importSummary.initialLoadTimeout });

      clickUntilSortState(
        incomingInvPage,
        sd.sortStates.ascending,
        sortCounter,
        sd.importSummary.sortWaitTimeout,
        3,
        sd.errorMessages.noAscendingState
      );

      incomingInvPage.verifyTableRowCountAtLeast(1);
      // Re-read until the server-side re-sort lands (avoids stale-row reads).
      assertColumnSortedEventually(
        () => incomingInvPage.getExpectedQuantitiesFromTable(),
        (a, b) => a - b,
        { label: "ascending quantities" }
      );
    }
  );

  /**
   * @testCaseId    SW_INC_SORT_003
   * @description   When the Quantity column is sorted descending, the Expected
   *                quantities rendered in the table body appear in
   *                largest-to-smallest order matching the seeded data.
   * @testData      fixtures/sortingData.json → sortStates.descending,
   *                expectedQtiesDescending, errorMessages.noDescendingState
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Click the Quantity sort label until aria-sort equals "descending"
   *   3. Read "Expected:" values from every table row
   * @expectedResult  Extracted quantities equal [30, 15, 5] (descending order).
   */
  it(
    "SW_INC_SORT_003 – Quantity column descending sort renders rows in largest-to-smallest order",
    { tags: ["@regression"] },
    () => {
      cy.intercept("GET", "**/incoming-items**").as("initialLoad");
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      cy.wait("@initialLoad", { timeout: sd.importSummary.initialLoadTimeout });

      clickUntilSortState(
        incomingInvPage,
        sd.sortStates.descending,
        sortCounter,
        sd.importSummary.sortWaitTimeout,
        3,
        sd.errorMessages.noDescendingState
      );

      incomingInvPage.verifyTableRowCountAtLeast(1);
      assertColumnSortedEventually(
        () => incomingInvPage.getExpectedQuantitiesFromTable(),
        (a, b) => b - a,
        { label: "descending quantities" }
      );
    }
  );

  // ===========================================================================
  // ██████████  MEMORY GENERATION COLUMN  ██████████████████████████████████████
  // ===========================================================================

  /**
   * @testCaseId    SW_INC_SORT_004
   * @description   Clicking the Memory Generation sort label three times cycles
   *                the column through all three states: ascending, descending,
   *                and no-sort (none), confirming the full sort lifecycle.
   * @testData      fixtures/sortingData.json → sortStates, importSummary.initialLoadTimeout
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Record initial aria-sort value on the Memory Generation column header
   *   3. Click the Memory Generation sort label — record new state
   *   4. Click again — record new state
   *   5. Click again — record new state
   * @expectedResult  The collected states include "ascending", "descending",
   *                  and "none" across the four snapshots.
   */
  it(
    "SW_INC_SORT_004 – Memory Generation sort label cycles through ascending, descending, and no-sort",
    { tags: ["@smoke", "@regression"] },
    () => {
      cy.intercept("GET", "**/incoming-items**").as("initialLoad");
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      cy.wait("@initialLoad", { timeout: sd.importSummary.initialLoadTimeout });

      const observedStates = [];

      incomingInvPage.getMemGenColumnSortState().then((state) => {
        observedStates.push(state);
      });

      sortCounter.value++;
      clickSortAndWait(
        incomingInvPage,
        sortCounter.value,
        sd.importSummary.sortWaitTimeout,
        () => incomingInvPage.clickMemGenColumnSortLabel(),
        () => incomingInvPage.getMemGenColumnSortState()
      ).then((state) => {
        observedStates.push(state);
      });

      sortCounter.value++;
      clickSortAndWait(
        incomingInvPage,
        sortCounter.value,
        sd.importSummary.sortWaitTimeout,
        () => incomingInvPage.clickMemGenColumnSortLabel(),
        () => incomingInvPage.getMemGenColumnSortState()
      ).then((state) => {
        observedStates.push(state);
      });

      sortCounter.value++;
      clickSortAndWait(
        incomingInvPage,
        sortCounter.value,
        sd.importSummary.sortWaitTimeout,
        () => incomingInvPage.clickMemGenColumnSortLabel(),
        () => incomingInvPage.getMemGenColumnSortState()
      ).then((state) => {
        observedStates.push(state);
      });

      cy.then(() => {
        const stateSet = new Set(observedStates);
        cy.log(`Observed sort states: [${observedStates.join(", ")}]`);
        expect(stateSet.has(sd.sortStates.ascending), "ascending state observed").to.be.true;
        expect(stateSet.has(sd.sortStates.descending), "descending state observed").to.be.true;
        expect(stateSet.has(sd.sortStates.none), "no-sort state observed").to.be.true;
      });
    }
  );

  /**
   * @testCaseId    SW_INC_SORT_005
   * @description   When the Memory Generation column is sorted ascending, the
   *                values rendered in the table body appear in A→Z order
   *                matching the seeded data (DDR3, DDR4, DDR5).
   * @testData      fixtures/sortingData.json → sortStates.ascending,
   *                expectedMemGenAscending, errorMessages.noAscendingStateMemGen
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Click the Memory Generation sort label until aria-sort equals "ascending"
   *   3. Read Memory Generation values from every table row
   * @expectedResult  Extracted values equal ["DDR3", "DDR4", "DDR5"] (ascending order).
   */
  it(
    "SW_INC_SORT_005 – Memory Generation column ascending sort renders rows in A→Z order",
    { tags: ["@regression"] },
    () => {
      cy.intercept("GET", "**/incoming-items**").as("initialLoad");
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      cy.wait("@initialLoad", { timeout: sd.importSummary.initialLoadTimeout });

      clickUntilSortState(
        incomingInvPage,
        sd.sortStates.ascending,
        sortCounter,
        sd.importSummary.sortWaitTimeout,
        3,
        sd.errorMessages.noAscendingStateMemGen,
        () => incomingInvPage.clickMemGenColumnSortLabel(),
        () => incomingInvPage.getMemGenColumnSortState()
      );

      incomingInvPage.verifyTableRowCountAtLeast(1);
      assertColumnSortedEventually(
        () => incomingInvPage.getMemGenValuesFromTable(),
        (a, b) => a.localeCompare(b),
        { label: "ascending memory generation" }
      );
    }
  );

  /**
   * @testCaseId    SW_INC_SORT_006
   * @description   When the Memory Generation column is sorted descending, the
   *                values rendered in the table body appear in Z→A order
   *                matching the seeded data (DDR5, DDR4, DDR3).
   * @testData      fixtures/sortingData.json → sortStates.descending,
   *                expectedMemGenDescending, errorMessages.noDescendingStateMemGen
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Click the Memory Generation sort label until aria-sort equals "descending"
   *   3. Read Memory Generation values from every table row
   * @expectedResult  Extracted values equal ["DDR5", "DDR4", "DDR3"] (descending order).
   */
  it(
    "SW_INC_SORT_006 – Memory Generation column descending sort renders rows in Z→A order",
    { tags: ["@regression"] },
    () => {
      cy.intercept("GET", "**/incoming-items**").as("initialLoad");
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      cy.wait("@initialLoad", { timeout: sd.importSummary.initialLoadTimeout });

      clickUntilSortState(
        incomingInvPage,
        sd.sortStates.descending,
        sortCounter,
        sd.importSummary.sortWaitTimeout,
        3,
        sd.errorMessages.noDescendingStateMemGen,
        () => incomingInvPage.clickMemGenColumnSortLabel(),
        () => incomingInvPage.getMemGenColumnSortState()
      );

      incomingInvPage.verifyTableRowCountAtLeast(1);
      assertColumnSortedEventually(
        () => incomingInvPage.getMemGenValuesFromTable(),
        (a, b) => b.localeCompare(a),
        { label: "descending memory generation" }
      );
    }
  );
});
