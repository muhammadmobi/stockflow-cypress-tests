import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import { borrowGeneralConfigFlag, restoreGeneralConfigFlag } from "../../support/helpers/generalConfigApiHelpers";

/**
 * Stock-In by Quantity Tests
 * Covers: SW_INC_038 – SW_INC_043
 *
 * HOOK EXECUTION ORDER FIX:
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOT CAUSE:
 *   The after() hook was running before tests completed because:
 *   1. cy.fixture() inside before() is async — td was undefined when
 *      sharedPO setup ran immediately after
 *   2. Page objects were initialized outside cy.fixture().then(), so
 *      they were used before Cypress queued them properly
 *   3. importAttributesAndCategories() ran outside the fixture chain,
 *      causing race conditions
 *
 * FIX:
 *   - Nest ALL before() logic inside cy.fixture().then() so td is
 *     guaranteed to be loaded before anything else runs
 *   - Initialize page objects inside the fixture chain
 *   - Move importAttributesAndCategories() inside the fixture chain
 *   - after() now safely references createdPOs which is populated
 *     only after before() fully completes
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("Stock-In Product Only by Quantity Tests (SW_INC_038 – SW_INC_043)", () => {
  let incomingInvPage, invViewPage, purchaseOrderPage;
  let td;

  const createdPOs = [];
  let sharedPO;

  // ---------------------------------------------------------------------------
  // Timestamp helper
  // ---------------------------------------------------------------------------
  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  // ---------------------------------------------------------------------------
  // Excel file creator
  // ---------------------------------------------------------------------------
  function createExcelFile(fileName, data) {
    cy.task("createExcelFile", {
      filePath: `cypress/fixtures/${fileName}`,
      data,
    }).then((msg) => cy.log(msg));
  }

  // ---------------------------------------------------------------------------
  // Row builders — only called after td is loaded
  // ---------------------------------------------------------------------------
  function ramRow(RAMbrand, memGen, qty, cost, price, support) {
    return {
      Category: td.ram.category,
      // "RAMbrand" (no space) matches the registered attribute; "RAM Brand"
      // is dropped on import → empty PO.
      RAMbrand: RAMbrand,
      "Memory Generation": memGen,
      Cost: cost || td.ramKingston.cost,
      Price: price || td.ramKingston.price,
      "Support Contact": support || td.ramKingston.supportContact,
      Quantity: qty,
    };
  }

  function laptopQtyRow(qty) {
    return {
      Category: td.laptop.category,
      "Model Number": td.laptop.modelNumber,
      Brand: td.laptop.brand,
      Cost: td.laptop.cost,
      Price: td.laptop.price,
      "Support Contact": td.laptop.supportContact,
      Quantity: qty,
    };
  }

  // ---------------------------------------------------------------------------
  // Import helper
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Search helper — intercept BEFORE action, click Search, THEN wait
  // ---------------------------------------------------------------------------
  function searchProduct(poNumber, productName) {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(poNumber);
    // Register the intercept AFTER PO selection so we wait on the SEARCH
    // request, not the PO-load request. Waiting on the PO load (the old bug)
    // let assertions run before the search filtered the grid/stats — the stat
    // tile then showed the PO-wide total (e.g. 10) and stock-in targeted the
    // wrong row.
    cy.wait(500); // let the PO-selection load settle first
    cy.intercept("GET", "**/incoming-items**").as("searchReq");
    incomingInvPage.searchProduct(productName);
    cy.get("button").contains("Search").click();
    cy.wait("@searchReq", { timeout: 15000 });
    cy.wait(900); // settle stats + grid re-render after the filtered response
  }

  // ---------------------------------------------------------------------------
  // Post-mutation re-search with retry — Stage-observed race condition:
  // the stock-in success toast fires as soon as the write commits, but the
  // Incoming/Received aggregate the backend serves on the very next GET can
  // still reflect the pre-commit count for a brief window (eventual-consistency
  // lag, more noticeable on Stage than QA). searchProduct() above only fetches
  // ONCE per call, and validateStatQty()'s retryable assertion only re-inspects
  // that single DOM snapshot for the rest of the 50s command timeout — it never
  // re-fetches — so a request that lands mid-race fails the whole test even
  // though the data is correct moments later. Re-issuing the search itself
  // (not just re-reading the DOM) until the stat catches up removes the flake.
  // ---------------------------------------------------------------------------
  function searchProductAwaitStat(poNumber, productName, label, expected, attemptsLeft = 5) {
    searchProduct(poNumber, productName);
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\b" + esc + "\\s*\\((\\d+)\\)");
    cy.get("body").then(($body) => {
      const m = re.exec($body.text());
      const matched = m && m[1] === String(expected);
      if (matched || attemptsLeft <= 1) return;
      cy.log(
        `searchProductAwaitStat: "${label}" not yet ${expected} (Stage consistency lag) — retrying, ${attemptsLeft - 1} attempt(s) left`,
      );
      cy.wait(2000);
      searchProductAwaitStat(poNumber, productName, label, expected, attemptsLeft - 1);
    });
  }

  // ---------------------------------------------------------------------------
  // before() — fixture load → session → attributes → shared PO setup
  // ALL steps are chained inside cy.fixture().then() so td is
  // guaranteed to exist before any cy commands that depend on it run
  // ---------------------------------------------------------------------------
  before(() => {
    // ✅ STEP 1: Load fixture first — everything else is nested inside .then()
    //    so Cypress queues all commands only AFTER td is populated
    cy.fixture("stockInByQtyData").then((data) => {
      td = data;

      // ✅ STEP 2: Login session — nested so it runs after fixture
      cy.authSession('admin');

      // ✅ STEP 3: Visit app
      cy.visit("/");

      // ✅ STEP 3b: Ensure categories exist via API before importing attributes
      // — makes the spec robust to run order in a full sequential suite (a prior
      // spec can leave shared schema partial, causing the seed import to drop
      // attribute columns). Idempotent: existing categories return 409, ignored.
      cy.getAuthToken().then((token) => {
        const apiBase =
          Cypress.env("API_BASE_URL") ||
          Cypress.config("baseUrl").replace(/\/$/, "").replace("://", "://api.");
        [
          { name: td.ram.category, allowItems: false },
          { name: td.laptop.category, allowItems: true },
        ].forEach(({ name, allowItems }) => {
          cy.request({
            method: "POST",
            url: `${apiBase}/categories`,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: { name, description: "Stock-in automation category", allowItems, allowVariants: false, allowVariantItems: false },
            failOnStatusCode: false,
          });
        });
      });

      // ✅ STEP 4: Import attributes — runs after session is ready
      importAttributesAndCategories();
      ensureCommonAttributesOptional();

      // SW_INC_041 verifies the over-quantity REJECT path ("exceeds the expected
      // quantity"), which needs the flag off. General Config is GLOBAL state on a
      // shared stack — borrow it through the helper, which captures the prior value
      // (collapsing "absent" to false, exactly as the backend reads it) and asserts
      // the restore landed in after().
      // Backend gate: incoming-item.service.ts checkInPreprocess.
      borrowGeneralConfigFlag("allowExceedExpectedQuantity", false);

      // ✅ STEP 5: Init page objects for this before() scope
      //    (beforeEach re-initializes them for each test)
      incomingInvPage = new IncomingInvPage();
      invViewPage = new InvViewPage();
      purchaseOrderPage = new PurchaseOrderPage();

      // ✅ STEP 6: Create shared PO — td is available here
      const stamp = ts();
      sharedPO = `PO-StockInShared-${stamp}`;
      createdPOs.push(sharedPO);
      const fileName = `StockInShared-${stamp}.xlsx`;

      createExcelFile(fileName, [
        // Product 1 — Kingston DDR4, qty 5 → used by SW_INC_038
        ramRow(
          td.ramKingston.brand,
          td.ramKingston.memoryGeneration,
          td.stockIn.fullQty,
        ),
        // Product 2 — Corsair DDR5, qty 5 → used by SW_INC_039
        ramRow(
          td.ram.RAMbrand,
          td.ram.memoryGeneration,
          td.stockIn.fullQty,
          "45.00",
          "75.00",
          "support@ram.com",
        ),
      ]);

      importExcel(fileName, sharedPO);

      // ✅ STEP 7: Verify both products loaded. API-based importExcel no longer
      // navigates, so go to Incoming Inventory before selecting the PO.
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(sharedPO);
      incomingInvPage.validateExpectedQty(td.stockIn.fullQty * 2); // 5 + 5
      incomingInvPage.validateIncomingQty(td.stockIn.fullQty * 2);
    });
  });

  // ---------------------------------------------------------------------------
  // beforeEach — re-initialize page objects fresh for every test
  // ---------------------------------------------------------------------------
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // ---------------------------------------------------------------------------
  // after() — runs ONLY after all tests complete
  // ✅ FIX: Do NOT call cy.session() here — reuse the existing session
  //    that beforeEach() already established. Calling cy.session() with
  //    the same identifier ("user-session") inside after() throws:
  //    "This session already exists. You may not create a new session
  //    with a previously used identifier."
  //    Instead just cy.visit() — Cypress reuses the active session cookie.
  // ---------------------------------------------------------------------------
  after(() => {
    // Return the borrowed flag FIRST — before the early-return below — so a
    // before() that aborted mid-seed still hands global config back untouched.
    restoreGeneralConfigFlag("allowExceedExpectedQuantity");

    if (createdPOs.length === 0) return;

    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });

  // ===========================================================================
  // SW_INC_038 – Full qty stock-in for Kingston DDR4
  // ===========================================================================
  it(
    "SW_INC_038 – Product Only Stock in full expected qty (5) for RAM and verify Received, Available = 5, Incoming = 0",
    { tags: ["@smoke", "@regression"] },
    () => {
      searchProduct(sharedPO, td.ramKingston.displayName);

      incomingInvPage.validateExpectedQty(td.stockIn.fullQty);
      incomingInvPage.validateIncomingQty(td.stockIn.fullQty);

      incomingInvPage.enterStockInQty(td.stockIn.fullQty);
      incomingInvPage.clickStockInSubmit();

      // Backend success message embeds the FULL product name (template
      // "{rambrand} {memoryGeneration}" → "Kingston DDR4"), so assert the
      // product-name-agnostic prefix: `Quantity "5" stocked in for`.
      cy.contains(`Quantity "${td.stockIn.fullQty}" stocked in for`, {
        timeout: 10000,
      }).should("exist");

      searchProductAwaitStat(sharedPO, td.ramKingston.displayName, "Incoming", 0);

      incomingInvPage.validateExpectedQty(td.stockIn.fullQty);
      incomingInvPage.validateReceivedQty(td.stockIn.fullQty);
      incomingInvPage.validateAvailableQty(td.stockIn.fullQty);
      incomingInvPage.validateIncomingQty(0);
    },
  );

  // ===========================================================================
  // SW_INC_039 – Partial qty stock-in for Corsair DDR5
  // ===========================================================================
  it(
    "SW_INC_039 – Product Only Partially stock-in qty 2 of 5 for RAM and verify Received = 2, Available = 2, Incoming = 3",
    { tags: ["@regression"] },
    () => {
      searchProduct(sharedPO, td.ram.displayName);

      incomingInvPage.validateExpectedQty(td.stockIn.fullQty);
      incomingInvPage.validateIncomingQty(td.stockIn.fullQty);

      incomingInvPage.enterStockInQty(td.stockIn.partialQty); // 2
      incomingInvPage.clickStockInSubmit();

      cy.contains(`Quantity "${td.stockIn.partialQty}" stocked in for`, {
        timeout: 10000,
      }).should("exist");

      searchProductAwaitStat(
        sharedPO,
        td.ram.displayName,
        "Incoming",
        td.stockIn.fullQty - td.stockIn.partialQty, // 5 - 2 = 3
      );

      incomingInvPage.validateExpectedQty(td.stockIn.fullQty);
      incomingInvPage.validateReceivedQty(td.stockIn.partialQty);
      incomingInvPage.validateAvailableQty(td.stockIn.partialQty);
      incomingInvPage.validateIncomingQty(
        td.stockIn.fullQty - td.stockIn.partialQty, // 5 - 2 = 3
      );
    },
  );

  // ===========================================================================
  // SW_INC_040 – Zero qty shows tooltip validation error
  // ===========================================================================
  it(
    "SW_INC_040 – Product Only Entering qty 0 in Stock-In form shows tooltip validation error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const po = `PO-StockIn040-${stamp}`;
      createdPOs.push(po);
      const fileName = `StockIn-040-${stamp}.xlsx`;

      createExcelFile(fileName, [
        ramRow(
          td.ramKingston.brand,
          td.ramKingston.memoryGeneration,
          td.stockIn.fullQty,
        ),
      ]);
      importExcel(fileName, po);

      incomingInvPage.selectPoNumber(po);
      incomingInvPage.enterStockInQty(td.stockIn.zeroQty);
      incomingInvPage.clickStockInSubmit();

      incomingInvPage.verifyQtyValidationError(td.errorMessages.qtyValidation);
    },
  );

  // ===========================================================================
  // SW_INC_041 – Qty exceeds expected shows error toast
  // ===========================================================================
  it(
    "SW_INC_041 – Product Only Entering qty greater than expected (10 vs 5) shows 'exceeds expected quantity' error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const po = `PO-StockIn041-${stamp}`;
      createdPOs.push(po);
      const fileName = `StockIn-041-${stamp}.xlsx`;

      createExcelFile(fileName, [
        ramRow(
          td.ramKingston.brand,
          td.ramKingston.memoryGeneration,
          td.stockIn.fullQty,
        ),
      ]);
      importExcel(fileName, po);

      incomingInvPage.selectPoNumber(po);
      incomingInvPage.validateExpectedQty(td.stockIn.fullQty);

      incomingInvPage.enterStockInQty(td.stockIn.exceedsQty); // 10 > 5
      incomingInvPage.clickStockInSubmit();

      cy.contains(td.errorMessages.exceedsExpected, {
        timeout: 10000,
      }).should("exist");
    },
  );

  // ===========================================================================
  // SW_INC_042 – Closed PO returns error
  // ===========================================================================
  it(
    "SW_INC_042 – Product Only Attempting Stock-In on a Closed PO returns 'PO is closed' error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const po = `${td.closedPo}-${stamp}`;
      const fileName = `Closed-PO-${stamp}.xlsx`;

      createExcelFile(fileName, [
        ramRow(
          td.ramKingston.brand,
          td.ramKingston.memoryGeneration,
          td.stockIn.fullQty,
        ),
      ]);
      importExcel(fileName, po);

      cy.getAuthToken().then((token) => {
        const apiUrl = Cypress.env("API_BASE_URL");
        cy.request({
          method: "PATCH",
          url: `${apiUrl}/purchase-orders/closePurchaseOrder`,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            poNumber: po,
            status: "Closed",
            creditMemoNumber: null,
          },
        }).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 201]);
        });
      });

      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(po);
      incomingInvPage.enterStockInQty(td.stockIn.partialQty);
      incomingInvPage.clickStockInSubmit();

      cy.contains(td.errorMessages.poIsClosed, { timeout: 10000 }).should(
        "exist",
      );
    },
  );

  // ===========================================================================
  // SW_INC_043 – Negative qty shows tooltip validation error
  // ===========================================================================
  it(
    "SW_INC_043 – Product Only Entering qty -1 in Stock-In form shows tooltip validation error",
    { tags: ["@regression"] },
    () => {
      const stamp = ts();
      const po = `PO-StockIn043-${stamp}`;
      createdPOs.push(po);
      const fileName = `StockIn-043-${stamp}.xlsx`;

      createExcelFile(fileName, [
        ramRow(
          td.ramKingston.brand,
          td.ramKingston.memoryGeneration,
          td.stockIn.fullQty,
        ),
      ]);
      importExcel(fileName, po);

      incomingInvPage.selectPoNumber(po);
      incomingInvPage.enterStockInQty(td.stockIn.negativeQty);
      incomingInvPage.clickStockInSubmit();
      incomingInvPage.verifyQtyValidationError(td.errorMessages.qtyValidation);
     
    },
  );
});
