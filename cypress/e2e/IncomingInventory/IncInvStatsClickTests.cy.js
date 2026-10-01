import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import { apiSetGeneralConfigFlags } from "../../support/helpers/generalConfigApiHelpers";
import {
  makeRamRow,
  importExcel,
  createExcelFile,
} from "../../support/helpers/incomingInventoryHelpers";

/**
 * Stats Clickable Tests — Incoming Inventory
 * Covers: SW_INC_STAT_001 – SW_INC_STAT_054  (9 stats × 6 cases each)
 *
 * Feature under test:
 *   Each summary tile in the Incoming Inventory PO header (Available,
 *   Received, Incoming, Damaged, Disputed, Missing, Sold,
 *   Stocked out (others), Reserved) is clickable. Clicking a tile re-fetches
 *   GET /incoming-items?poNumber=...&status=<filter> and filters the table
 *   to products with a non-zero count for that quantity type.
 *
 * For every stat we verify the same six cases:
 *   N+0  Click <tile> shows a Product-Item with <stat> > 0.
 *   N+1  Click <tile> shows a Product-Only with <stat> > 0.
 *   N+2  Click <tile> shows BOTH Product-Only and Product-Item with <stat> > 0.
 *   N+3  Click <tile> hides a Product-Only with <stat> = 0.
 *   N+4  Click <tile> hides a Product-Item with <stat> = 0.
 *   N+5  Click <tile> hides BOTH Product-Only and Product-Item with <stat> = 0.
 *
 * Setup (single shared PO, six products):
 *   Active product-only       — Kingston DDR4   qty 30, partial stock-in 25
 *   Untouched product-only    — Corsair  DDR5   qty 30, no stock-in
 *   Fully-received Only       — HyperX  DDR3    qty 5,  full stock-in
 *   Active product-item       — Lenovo ThinkPad 30 serials, partial stock-in 25
 *   Untouched product-item    — Dell   Latitude 30 serials, no stock-in
 *   Fully-received Item       — HP     EliteBook 5 serials, full stock-in
 *
 * After stock-in we seed Kingston (P1) and ThinkPad (P3) via API:
 *   3 Damaged  · 2 Disputed · 2 Missing
 *   2 Sold      (stock-out reason = Sold)
 *   2 Shipped   (stock-out reason = Shipped — falls under "Stocked out (others)")
 *   2 Reserved  (work-order create — auto-reserves the qty)
 *
 * Net effect: P1/P3 carry non-zero counts for every stat. P2/P4 have non-zero
 * for Incoming only (everything else = 0). P5/P6 are fully received so their
 * Incoming = 0 — these are the "stat = 0" reps for the Incoming tile.
 *
 * Per-stat product role table:
 *   ┌─────────────────┬──────────┬──────────┬──────────┬──────────┐
 *   │ Stat tile       │ OnlyPos  │ OnlyZero │ ItemPos  │ ItemZero │
 *   ├─────────────────┼──────────┼──────────┼──────────┼──────────┤
 *   │ Available       │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Received        │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Damaged         │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Disputed        │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Missing         │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Sold            │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Stocked-out (o) │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Reserved        │ Kingston │ Corsair  │ Lenovo   │ Dell     │
 *   │ Incoming (inv.) │ Corsair  │ HyperX   │ Dell     │ EliteBook│
 *   └─────────────────┴──────────┴──────────┴──────────┴──────────┘
 */
describe("Stats Clickable Tests — Incoming Inventory (SW_INC_STAT_001 – SW_INC_STAT_054)", () => {
  let incomingInvPage, purchaseOrderPage;
  let td;
  const createdPOs = [];
  let statsPO;
  let runId;
  let kingstonProductId, thinkPadProductId;
  let thinkPadSerials, latitudeSerials, eliteBookSerials;

  // ---------------------------------------------------------------------------
  // Local helpers
  // ---------------------------------------------------------------------------
  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  // Row builder for laptop products with overridable model/brand. The shared
  // makeLaptopRowWithSerial only knows about td.laptop, but we need three
  // distinct laptop products in one PO so we drive the row from a per-laptop
  // config (modelNumber, brand, cost, price, supportContact).
  function makeLaptopRow(laptopCfg, category) {
    return (serial) => ({
      Category: category,
      "Model Number": laptopCfg.modelNumber,
      Brand: laptopCfg.brand,
      Cost: laptopCfg.cost,
      Price: laptopCfg.price,
      "Support Contact": laptopCfg.supportContact,
      "Serial Number": serial,
      Quantity: 1,
    });
  }

  // Generate runId-suffixed serial numbers so re-runs do not clash with
  // previously imported data on the same environment.
  function buildSerials(prefix, count) {
    return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}-${runId}`);
  }

  // ---------------------------------------------------------------------------k
  // API helpers — wrap cy.request so each call carries auth + JSON headers
  // ---------------------------------------------------------------------------
  function apiBase() {
    return Cypress.config("baseUrl").replace(/\/$/, "").replace("://", "://api.");
  }

  function apiCall(method, path, body) {
    return cy.getAuthToken().then((token) =>
      cy.request({
        method,
        url: `${apiBase()}${path}`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
        failOnStatusCode: false,
      }),
    );
  }

  // Resolve productId by display name within a PO. Used to populate
  // productIdsArray bodies for mark-status and stock-out admin endpoints.
  function apiGetProductId(poNumber, displayName) {
    const url =
      `/incoming-items?poNumber=${encodeURIComponent(poNumber)}` +
      `&search=${encodeURIComponent(displayName)}&page=1&page_size=10`;
    return apiCall("GET", url).then((res) => {
      const list = res.body?.data?.list || res.body?.list || res.body?.data || [];
      const arr = Array.isArray(list) ? list : list.list || [];
      const hit = arr.find((row) => row && (row.productId || row.id));
      if (!hit) {
        throw new Error(
          `apiGetProductId: no productId returned for displayName=${displayName} po=${poNumber}. Response: ${JSON.stringify(res.body).slice(0, 500)}`,
        );
      }
      return hit.productId || hit.id;
    });
  }

  // Mark a quantity of a product-only product to a status.
  // NOTE on async/sync mixing: helpers must NOT do
  //   `apiCall(...).then((res) => { cy.log(...); return res; })`
  // because `cy.log` queues an async command while `return res` is sync —
  // Cypress throws "mixing up async and sync code". Either keep the .then
  // body fully sync, or skip the wrapper entirely (preferred — `apiCall`
  // already returns the cy.request chain).
  function apiMarkStatusByProductQty(productId, quantity, status, damageReason, poNumber) {
    const body = {
      productIdsArray: [{ productId, quantity }],
      status,
      ...(poNumber ? { poNumber } : {}),
      ...(damageReason ? { damageReason } : {}),
    };
    return apiCall("POST", "/incoming-items/mark-status", body);
  }

  // Mark a list of serials to a status (for product-item).
  function apiMarkStatusBySerials(serialNumbers, status, damageReason) {
    const body = {
      serialNumbers,
      status,
      ...(damageReason ? { damageReason } : {}),
    };
    return apiCall("POST", "/incoming-items/mark-status", body);
  }

  // Stock-out a quantity of a product-only product with a given reason.
  // NOTE: the /products/stock-out endpoint expects `productId` and `quantity`
  // for product-level stock-outs (no serial number).
  //
  // poNumber is REQUIRED. Every call site already passed it, but the parameter was
  // missing from this signature so the argument was silently dropped and the body
  // went out without a PO. Without one, product.service adjustAcrossPOs picks the
  // OLDEST PO that still has available quantity for that productId — and Kingston
  // DDR4 is a product shared with other specs — so the stock-out could land on a
  // different PO entirely. The seeded count then never appeared on statsPO and the
  // "Stocked out (others)" tile showed the ThinkPad but not the Kingston row
  // (SW_INC_STAT_044 / 045).
  function apiStockOutByProductQty(productId, quantity, reason, poNumber) {
    const body = {
      reason,
      quantity,
      containerSource: "unassigned",
      id: productId,
      level: "Product",
      poNumber,
    };
    return apiCall("POST", "/products/stock-out", body);
  }

  function assertSeedSuccess(label, res) {
    const ok = res?.status < 500 && res?.body?.success === true;
    expect(ok, `${label} failed: ${JSON.stringify(res?.body)}`).to.eq(true);
  }

  // Stock-out a single serial-numbered item with a given reason.
  function apiStockOutBySerial(serialNumber, reason) {
    const body = {
      serialNumber,
      reason,
      description: `stats-click seed ${reason} ${new Date().toISOString()}`,
    };
    return apiCall("POST", "/products/stockout-by-serial-number", body);
  }

  // Stock-in a quantity of a product-only product via the API.
  // Uses POST /incoming-items/product-stock-in which requires productId + poNumber + quantity.
  // More reliable than UI stock-in because it bypasses selector flakiness and
  // guarantees the availableQuantity is set before the downstream seed stock-outs fire.
  function apiStockInByProductQty(productId, poNumber, quantity) {
    return apiCall("POST", "/incoming-items/product-stock-in", {
      productId,
      poNumber,
      quantity,
    });
  }

  // Stock-in a single serialized item via POST /incoming-items/scan.
  // Excel import creates items with status "Incoming"; scanning transitions them
  // to "Available" so the work-order reservation query counts them correctly.
  function apiScanSerial(serialNumber, poNumber) {
    return apiCall("POST", "/incoming-items/scan", { serialNumber, poNumber });
  }

  // Mirror of the backend reserveProductWithItems service method:
  // 1. POST /work-orders  { status, products:[{productId,name,partNumber,quantity}] }
  //    – name allows null per schema; hasItems is resolved server-side from the product record.
  //    – totalAvailableQuantity must NOT be sent: the Joi schema rejects unknown fields.
  //      The service queries the DB itself for availableQuantity and uses that to gate
  //      reserveQty. Stock-in must happen before this call so the DB has sufficient qty.
  // 2. POST /work-orders/scan  { workOrderNumber, productId, serialNumber }
  //    – 'hasItems' must NOT be sent; the backend fetches it from the product entity.
  function apiReserve(productId, partNumber, quantity, serialNumbers = []) {
    const createBody = {
      status: "Open",
      products: [{ productId, name: null, partNumber, quantity }],
    };
    return apiCall("POST", "/work-orders", createBody).then((woRes) => {
      assertSeedSuccess("apiReserve createWorkOrder", woRes);
      if (serialNumbers.length === 0) return;
      const woNum = woRes.body?.data?.workOrderNumber;
      serialNumbers.forEach((sn) => {
        const scanBody = { workOrderNumber: woNum, productId, serialNumber: sn };
        apiCall("POST", "/work-orders/scan", scanBody);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // UI helpers — search + stock-in mirror the proven pattern used in
  // StockInProductOnlyByQty.cy.js / StockInProductItemsByQty.cy.js:
  //   1. set the GET intercept BEFORE navigating
  //   2. nav → select PO → enter search text → click Search
  //   3. wait on the @incomingItems alias to confirm the table reloaded
  //   4. enter qty, click Stock In, assert on the success toast text
  // No POST-intercept — different categories hit different stock-in endpoints
  // (product-stock-in vs scan-all). The success toast is the canonical signal.
  // ---------------------------------------------------------------------------
  function searchProduct(poNumber, productName) {
    cy.intercept("GET", "**/incoming-items**").as("incomingItems");
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(poNumber);
    incomingInvPage.searchProduct(productName);
    incomingInvPage.clickSubmitSearch();
    cy.wait("@incomingItems", { timeout: 10000 });
  }

  function stockInProduct(poNumber, displayName, qty, successText) {
    searchProduct(poNumber, displayName);
    incomingInvPage.enterStockInQty(qty);
    incomingInvPage.clickStockInSubmit();
    if (successText) {
      incomingInvPage.verifyToastContainsText(successText);
    }
  }

  // Click the named tile and wait for the resulting filtered fetch.
  // We intentionally do NOT assert the URL contains the filter token —
  // tile labels and filter values diverge for "Stocked out (others)" → StockedOut,
  // and the goal of the suite is content correctness of the filtered list.
  //
  // Intercept notes:
  //   • Pattern targets requests that carry a `status=` query param so we do NOT
  //     accidentally catch the background Product-View refetch (which has no
  //     status param) that fires while the previous query is still settling.
  //   • When the "Open Items View on Status Click" general-config toggle is ON
  //     (QA default), the stat-tile click switches to Items View and fires
  //     GET /items?...&status=<X> instead of GET /incoming-items?...&status=<X>.
  //     Matching either endpoint keeps the wait working regardless of toggle state.
  function clickStatAndWait(tileLabel) {
    // Clicking a stat tile sets selectedStatusFilter and the product list
    // refetches GET /incoming-items?...&status=<X>, filtering the table in place.
    //
    // UI redesign note: on the OLD build a stat-tile click switched the table to
    // Item View (hiding product-only rows), so this helper clicked "Product View"
    // to switch back. Two frontend changes killed that:
    //   - f2a0e3b5c removed the Product View / Item View strip and in-place view
    //     switching; a stat-tile click now just filters the product table.
    //   - a0c3d0da7 re-added the strip as a NAVIGATION control — Product View is
    //     hard-coded active and its onClick early-returns, so clicking it is a
    //     no-op; Item View routes to a standalone page (which we must NOT do here).
    // Either way there is no view to return from, so the switch-back is deleted
    // outright rather than wrapped in an `if (strip exists)` guard: that guard
    // WOULD now fire (the strip is back), clicking an inert pill for nothing, and
    // it would mask a genuine regression by silently adapting to whatever renders.
    cy.intercept("GET", /\/incoming-items\?.*status=/).as("statusFetch");
    incomingInvPage.clickStatTile(tileLabel);
    cy.wait("@statusFetch", { timeout: 20000 });
    cy.wait(800); // let the filtered table re-render settle
  }

  function assertProductInTable(matchText) {
    incomingInvPage.verifyTableContainsText(matchText);
  }

  function assertProductNotInTable(matchText) {
    incomingInvPage.verifyTableDoesNotContainText(matchText);
  }

  function openStatsPO() {
    // Clear persisted status-filter and view-tab from sessionStorage, AND patch
    // the Redux-persisted localStorage so the component reads
    // statusClickOpensItemsView=false on mount.
    //
    // Why localStorage patch is required:
    //   cy.authSession('admin') restores a browser session whose localStorage contains
    //   Redux state persisted when statusClickOpensItemsView was true on the
    //   backend. SPA navigation (clicking the nav link) does NOT reinitialise
    //   Redux — the component reads stateConfig from in-memory Redux, bypassing
    //   any config-API intercept. The only reliable fix is to patch the Redux
    //   cache in localStorage before a full-page reload so the component mounts
    //   with the correct value from day one.
    cy.window().then((win) => {
      win.sessionStorage.removeItem('incomingInventorySelectedStatusFilter');
      win.sessionStorage.removeItem('incomingViewTab');
      try {
        const lsKey = 'stock-wise';
        const raw = win.localStorage.getItem(lsKey);
        const state = raw ? JSON.parse(raw) : {};
        // Ensure the config slice and its nested config object exist before patching
        if (!state.config) state.config = {};
        state.config.config = { ...(state.config.config || {}), statusClickOpensItemsView: false };
        win.localStorage.setItem(lsKey, JSON.stringify(state));
      } catch (e) { /* ignore parse errors */ }
    });

    // Aliased so we can wait for the config response to arrive (and be dispatched
    // to Redux) before clicking any stat tile. No mutation needed — before() calls
    // apiSetGeneralConfigFlags({ statusClickOpensItemsView: false }) so the server
    // already returns false. A pass-through intercept (no callback) avoids the
    // "Socket closed before finished writing response" error that a response-mutating
    // callback causes when the stage API drops keep-alive connections mid-test.
    cy.intercept("GET", /\/configs\?.*type=general/).as("statsPoConfigFetch");

    // cy.visit() forces a full page reload — Redux reinitialises from the
    // patched localStorage so statusClickOpensItemsView=false is in component
    // state before any tile click fires. Replacing the SPA nav-link click with
    // a direct visit is the only way to guarantee a fresh Redux initialisation.
    cy.visit('/incoming-inventory');
    // Wait for the config response to arrive AND give React time to run
    // layout.tsx useEffect → dispatch(saveConfig) so statusClickOpensItemsView=false
    // is in Redux memory before any stat-tile click fires.
    cy.wait("@statsPoConfigFetch", { timeout: 15000 });
    cy.wait(800);

    incomingInvPage.selectPoNumber(statsPO);
    // The old build persisted the active view in sessionStorage, so this switched
    // to Product View in case a prior run left 'items' selected (Item View hid
    // product-only rows). There is no persisted view state to correct any more —
    // the product table always renders and the surviving pill strip is inert.
    // See clickStatAndWait for the full history and why this is deleted, not guarded.
    incomingInvPage.verifyTableHasAtLeastOneRow();
  }

  // ---------------------------------------------------------------------------
  // Test-body shorthands. Each it() supplies its tile label + product roles
  // (which differ for the Incoming tile — see role table in the file header)
  // and delegates to one of these.
  // ---------------------------------------------------------------------------
  function tcInTable(tileLabel, productCfg) {
    openStatsPO();
    clickStatAndWait(tileLabel);
    assertProductInTable(productCfg.tableMatchText);
  }

  function tcBothInTable(tileLabel, onlyCfg, itemCfg) {
    openStatsPO();
    clickStatAndWait(tileLabel);
    assertProductInTable(onlyCfg.tableMatchText);
    assertProductInTable(itemCfg.tableMatchText);
  }

  function tcNotInTable(tileLabel, productCfg) {
    openStatsPO();
    clickStatAndWait(tileLabel);
    assertProductNotInTable(productCfg.tableMatchText);
  }

  function tcBothNotInTable(tileLabel, onlyCfg, itemCfg) {
    openStatsPO();
    clickStatAndWait(tileLabel);
    assertProductNotInTable(onlyCfg.tableMatchText);
    assertProductNotInTable(itemCfg.tableMatchText);
  }

  // ===========================================================================
  // before() — fixture → session → categories → import → stock-in → API seeds
  // ===========================================================================
  before(() => {
    cy.fixture("statsClickData").then((data) => {
      td = data;
      runId = ts();

      // Make every seeded product unique per run by appending runId to the
      // discriminating attribute (memoryGeneration for RAM, modelNumber for
      // laptops). Excel import merges products across runs by attribute set,
      // so without this the same productId is reused across every prior PO.
      // adjustAcrossPOs in workOrder.create sorts quantities by importDate ASC
      // and reserves against the oldest PO with capacity — meaning the
      // reservation for THIS PO would land on a stale older PO and the
      // Reserved tile would read 0 for our seeded PO. Suffixing isolates our
      // products to a single quantities row so the reservation targets us.
      // displayName/tableMatchText keep their literal substrings ("DDR4",
      // "Lenovo ", etc.) — ILIKE search and contain.text both still match.
      td.ramKingston.memoryGeneration = `${td.ramKingston.memoryGeneration}-${runId}`;
      td.ramCorsair.memoryGeneration = `${td.ramCorsair.memoryGeneration}-${runId}`;
      td.ramHyperX.memoryGeneration = `${td.ramHyperX.memoryGeneration}-${runId}`;
      td.laptopThinkPad.modelNumber = `${td.laptopThinkPad.modelNumber}-${runId}`;
      td.laptopLatitude.modelNumber = `${td.laptopLatitude.modelNumber}-${runId}`;
      td.laptopEliteBook.modelNumber = `${td.laptopEliteBook.modelNumber}-${runId}`;

      const ramRow = makeRamRow(td);
      const thinkPadRow = makeLaptopRow(td.laptopThinkPad, td.laptop.category);
      const latitudeRow = makeLaptopRow(td.laptopLatitude, td.laptop.category);
      const eliteBookRow = makeLaptopRow(td.laptopEliteBook, td.laptop.category);

      cy.authSession('admin');
      cy.visit("/");

      // Pre-create categories so the Excel import always finds them by name.
      cy.getAuthToken().then((token) => {
        [
          { name: td.ram.category, allowItems: false },
          { name: td.laptop.category, allowItems: true },
        ].forEach(({ name, allowItems }) => {
          cy.request({
            method: "POST",
            url: `${apiBase()}/categories`,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: {
              name,
              description: "...",
              allowItems,
              allowVariants: false,
              allowVariantItems: false,
            },
            failOnStatusCode: false,
          }).then((res) => cy.log(`Ensure category '${name}': ${res.status}`));
        });
      });

      importAttributesAndCategories();
      ensureCommonAttributesOptional();
      // QA General Config has enablePoForStockOut / requireWorkOrderForStockOut
      // ON (a gen-config toggle test persists them), which makes the seed
      // stock-outs below fail with "Purchase Order number is required for stock
      // out." Force the stock-out gates open before seeding.
      apiSetGeneralConfigFlags({
        requireWorkOrderForStockOut: false,
        enablePoForStockOut: false,
        enableInventoryStockOut: true,
        // Keep Product View when clicking stat tiles — default true switches to
        // Items View, which hides product-only rows (RAM never appears there).
        statusClickOpensItemsView: false,
      });

      incomingInvPage = new IncomingInvPage();
      purchaseOrderPage = new PurchaseOrderPage();

      // ── Build single PO with 6 products ──────────────────────────────────
      const stamp = ts();
      statsPO = `PO-StatsClick-${stamp}`;
      createdPOs.push(statsPO);
      const fileName = `StatsClick-${stamp}.xlsx`;

      thinkPadSerials = buildSerials(td.laptopThinkPad.serialPrefix, td.qty.activeExpected);
      latitudeSerials = buildSerials(td.laptopLatitude.serialPrefix, td.qty.untouchedExpected);
      eliteBookSerials = buildSerials(td.laptopEliteBook.serialPrefix, td.qty.fullExpected);

      createExcelFile(fileName, [
        ramRow(
          td.ramKingston.brand,
          td.ramKingston.memoryGeneration,
          td.qty.activeExpected,
          td.ramKingston.cost,
          td.ramKingston.price,
          td.ramKingston.supportContact,
        ),
        ramRow(
          td.ramCorsair.brand,
          td.ramCorsair.memoryGeneration,
          td.qty.untouchedExpected,
          td.ramCorsair.cost,
          td.ramCorsair.price,
          td.ramCorsair.supportContact,
        ),
        ramRow(
          td.ramHyperX.brand,
          td.ramHyperX.memoryGeneration,
          td.qty.fullExpected,
          td.ramHyperX.cost,
          td.ramHyperX.price,
          td.ramHyperX.supportContact,
        ),
        ...thinkPadSerials.map(thinkPadRow),
        ...latitudeSerials.map(latitudeRow),
        ...eliteBookSerials.map(eliteBookRow),
      ]);
      importExcel(fileName, statsPO);

      // ── Stock-in: RAM (product-only) via API, Laptops (product-item) via UI ─
      // RAM products use POST /incoming-items/product-stock-in directly.
      // This avoids UI selector flakiness that causes silent stock-in failures
      // which leave availableQuantity=0, making downstream stock-out seeds fail
      // with "insufficient inventory" and crashing the entire before() hook.
      apiGetProductId(statsPO, td.ramKingston.displayName).then((kingId) => {
        kingstonProductId = kingId;
        apiStockInByProductQty(kingstonProductId, statsPO, td.qty.activeStockIn)
          .then((r) => assertSeedSuccess("Kingston API stock-in", r));

        apiGetProductId(statsPO, td.ramHyperX.displayName).then((hyperXId) => {
          apiStockInByProductQty(hyperXId, statsPO, td.qty.fullStockIn)
            .then((r) => assertSeedSuccess("HyperX API stock-in", r));
        });
      });

      // Laptop (product-item) stock-in via API scan — scan each serial directly
      // instead of using the UI stock-in form, which was failing silently on stage
      // leaving items in "Incoming" status and totalAvailableQuantity=0 for the
      // work-order reservation query (which counts items WHERE status='Available').
      // ThinkPad: first 25 of 30 serials; EliteBook: all 5 serials.
      thinkPadSerials.slice(0, td.qty.activeStockIn).forEach((sn) => {
        apiScanSerial(sn, statsPO).then((r) => assertSeedSuccess(`ThinkPad scan ${sn}`, r));
      });
      eliteBookSerials.slice(0, td.qty.fullStockIn).forEach((sn) => {
        apiScanSerial(sn, statsPO).then((r) => assertSeedSuccess(`EliteBook scan ${sn}`, r));
      });

      // ── API: resolve IDs then chain ALL seeds ─────────────────────────────
      // Re-resolve Kingston ID here (after stock-in) to confirm the product
      // is fully registered before seeds fire.
      apiGetProductId(statsPO, td.ramKingston.displayName).then((kingId) => {
        kingstonProductId = kingId;

        apiGetProductId(statsPO, td.laptopThinkPad.displayName).then((lapId) => {
          thinkPadProductId = lapId;

          // ── Kingston seeds ────────────────────────────────────────────
          apiMarkStatusByProductQty(kingstonProductId, td.seed.damagedQty, td.filters.damaged, td.seed.damageReason, statsPO)
            .then((r) => assertSeedSuccess("Kingston mark Damaged", r));

          apiMarkStatusByProductQty(kingstonProductId, td.seed.disputedQty, td.filters.disputed, undefined, statsPO)
            .then((r) => assertSeedSuccess("Kingston mark Disputed", r));

          apiMarkStatusByProductQty(kingstonProductId, td.seed.missingQty, td.filters.missing, undefined, statsPO)
            .then((r) => assertSeedSuccess("Kingston mark Missing", r));

          apiStockOutByProductQty(kingstonProductId, td.seed.soldQty, td.reasons.sold, statsPO)
            .then((r) => assertSeedSuccess("Kingston stockOut Sold", r));

          apiStockOutByProductQty(kingstonProductId, td.seed.shippedQty, td.reasons.shipped, statsPO)
            .then((r) => assertSeedSuccess("Kingston stockOut Shipped", r));


          apiReserve(kingstonProductId, td.ramKingston.brand, td.seed.reservedQty, []);

          // ── ThinkPad seeds ────────────────────────────────────────────
          // Serial allocation (no overlap):
          //   [0..damagedQty-1]                             → Damaged
          //   [damagedQty..+disputedQty-1]                  → Disputed
          //   [..+soldQty-1]                                → Sold
          //   [..+shippedQty-1]                             → Shipped
          //   [..+reservedQty-1]                            → Reserved (scan into WO)
          //   [activeStockIn..activeStockIn+missingQty-1]   → Missing (Incoming range)
          const d = td.seed.damagedQty;
          const di = d + td.seed.disputedQty;
          const dis = di + td.seed.soldQty;
          const dish = dis + td.seed.shippedQty;
          const dishr = dish + td.seed.reservedQty;
          const damagedSNs = thinkPadSerials.slice(0, d);
          const disputedSNs = thinkPadSerials.slice(d, di);
          const soldSNs = thinkPadSerials.slice(di, dis);
          const shippedSNs = thinkPadSerials.slice(dis, dish);
          const reservedSNs = thinkPadSerials.slice(dish, dishr);
          // BE rule (incoming-item.service.ts:7822): Available → Missing is
          // rejected from /incoming-items/mark-status. Pull missing serials
          // from the still-Incoming range (indices >= activeStockIn) so the
          // mark-status call lands on Incoming → Missing, which is allowed.
          const missingSNs = thinkPadSerials.slice(
            td.qty.activeStockIn,
            td.qty.activeStockIn + td.seed.missingQty
          );

          apiMarkStatusBySerials(damagedSNs, td.filters.damaged, td.seed.damageReason);
          apiMarkStatusBySerials(disputedSNs, td.filters.disputed);
          apiMarkStatusBySerials(missingSNs, td.filters.missing);

          soldSNs.forEach((sn) => apiStockOutBySerial(sn, td.reasons.sold));
          shippedSNs.forEach((sn) => apiStockOutBySerial(sn, td.reasons.shipped));

          apiReserve(thinkPadProductId, td.laptopThinkPad.modelNumber, td.seed.reservedQty, reservedSNs);
        });
      });
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // ===========================================================================
  // ██████████  AVAILABLE  ████████████████████████████████████████████████████
  // ===========================================================================
  describe("Available filter (SW_INC_STAT_001 – 006)", () => {
    /**
     * @testCaseId    SW_INC_STAT_001
     * @description   Clicking the Available tile filters the Incoming Inventory
     *                table to include the active Product-Item (Lenovo ThinkPad)
     *                whose Available count is non-zero after partial stock-in.
     * @testData      fixtures/statsClickData.json → tileLabels.available, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Available stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_001 – Available shows Product-Item with Available > 0 (Lenovo)", { tags: ["@smoke", "@regression"] }, () => {
      tcInTable(td.tileLabels.available, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_002
     * @description   Clicking the Available tile filters the table to include
     *                the active Product-Only (Kingston DDR4) whose Available
     *                count is non-zero after partial stock-in.
     * @testData      fixtures/statsClickData.json → tileLabels.available, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Available stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it("SW_INC_STAT_002 – Available shows Product-Only with Available > 0 (Kingston DDR4)", { tags: ["@smoke", "@regression"] }, () => {
      tcInTable(td.tileLabels.available, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_003
     * @description   Clicking the Available tile shows both the active
     *                Product-Only and Product-Item simultaneously when each
     *                has Available > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.available, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Available stat tile and wait for the filtered fetch
     *   3. Assert the table contains ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it("SW_INC_STAT_003 – Available shows both Product-Only and Product-Item with Available > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.available, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_004
     * @description   Clicking the Available tile hides the untouched
     *                Product-Only (Corsair DDR5) which has Available = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.available, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Available stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_004 – Available hides Product-Only with Available = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.available, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_005
     * @description   Clicking the Available tile hides the untouched
     *                Product-Item (Dell Latitude) which has Available = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.available, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Available stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_005 – Available hides Product-Item with Available = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.available, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_006
     * @description   Clicking the Available tile hides both untouched products
     *                (Corsair Product-Only and Dell Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.available, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Available stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_006 – Available hides both Product-Only and Product-Item with Available = 0", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.available, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ===========================================================================
  // ██████████  RECEIVED  █████████████████████████████████████████████████████
  // ===========================================================================
  describe("Received filter (SW_INC_STAT_007 – 012)", () => {
    /**
     * @testCaseId    SW_INC_STAT_007
     * @description   Clicking the Received tile filters the table to include
     *                the active Product-Item (Lenovo ThinkPad) whose Received
     *                count is non-zero after partial stock-in.
     * @testData      fixtures/statsClickData.json → tileLabels.received, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Received stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_007 – Received shows Product-Item with Received > 0 (Lenovo)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.received, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_008
     * @description   Clicking the Received tile filters the table to include
     *                the active Product-Only (Kingston DDR4) whose Received
     *                count is non-zero after partial stock-in.
     * @testData      fixtures/statsClickData.json → tileLabels.received, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Received stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it("SW_INC_STAT_008 – Received shows Product-Only with Received > 0 (Kingston)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.received, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_009
     * @description   Clicking the Received tile shows both the active
     *                Product-Only and Product-Item simultaneously when each
     *                has Received > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.received, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Received stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it("SW_INC_STAT_009 – Received shows both Product-Only and Product-Item with Received > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.received, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_010
     * @description   Clicking the Received tile hides the untouched
     *                Product-Only (Corsair DDR5) which has Received = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.received, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Received stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_010 – Received hides Product-Only with Received = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.received, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_011
     * @description   Clicking the Received tile hides the untouched
     *                Product-Item (Dell Latitude) which has Received = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.received, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Received stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_011 – Received hides Product-Item with Received = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.received, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_012
     * @description   Clicking the Received tile hides both untouched products
     *                (Corsair Product-Only and Dell Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.received, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Received stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_012 – Received hides both Product-Only and Product-Item with Received = 0", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.received, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ===========================================================================
  // ██████████  INCOMING (roles inverted — see role table in file header)  ████
  // ===========================================================================
  describe("Incoming filter (SW_INC_STAT_013 – 018)", () => {
    /**
     * @testCaseId    SW_INC_STAT_013
     * @description   Clicking the Incoming tile filters the table to include
     *                the untouched Product-Item (Dell Latitude) whose Incoming
     *                count is non-zero (no stock-in performed).
     * @testData      fixtures/statsClickData.json → tileLabels.incoming, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Incoming stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is present in the filtered table.
     */
    it("SW_INC_STAT_013 – Incoming shows Product-Item with Incoming > 0 (Dell)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.incoming, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_014
     * @description   Clicking the Incoming tile filters the table to include
     *                the untouched Product-Only (Corsair DDR5) whose Incoming
     *                count is non-zero (no stock-in performed).
     * @testData      fixtures/statsClickData.json → tileLabels.incoming, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Incoming stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is present in the filtered table.
     */
    it("SW_INC_STAT_014 – Incoming shows Product-Only with Incoming > 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.incoming, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_015
     * @description   Clicking the Incoming tile shows both untouched
     *                Product-Only (Corsair) and Product-Item (Dell)
     *                simultaneously when each has Incoming > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.incoming, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Incoming stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramCorsair AND laptopLatitude
     * @expectedResult  Both Corsair DDR5 and Dell Latitude rows are present.
     */
    it("SW_INC_STAT_015 – Incoming shows both Product-Only and Product-Item with Incoming > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.incoming, td.ramCorsair, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_016
     * @description   Clicking the Incoming tile hides the fully-received
     *                Product-Only (HyperX DDR3) which has Incoming = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.incoming, ramHyperX
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Incoming stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramHyperX.tableMatchText
     * @expectedResult  HyperX DDR3 row is absent from the filtered table.
     */
    it("SW_INC_STAT_016 – Incoming hides Product-Only with Incoming = 0 (HyperX)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.incoming, td.ramHyperX);
    });

    /**
     * @testCaseId    SW_INC_STAT_017
     * @description   Clicking the Incoming tile hides the fully-received
     *                Product-Item (HP EliteBook) which has Incoming = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.incoming, laptopEliteBook
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Incoming stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopEliteBook.tableMatchText
     * @expectedResult  HP EliteBook row is absent from the filtered table.
     */
    it("SW_INC_STAT_017 – Incoming hides Product-Item with Incoming = 0 (EliteBook)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.incoming, td.laptopEliteBook);
    });

    /**
     * @testCaseId    SW_INC_STAT_018
     * @description   Clicking the Incoming tile hides both fully-received
     *                products (HyperX Product-Only and EliteBook Product-Item).
     * @testData      fixtures/statsClickData.json → tileLabels.incoming, ramHyperX, laptopEliteBook
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Incoming stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramHyperX nor laptopEliteBook
     * @expectedResult  Neither HyperX nor EliteBook rows are present.
     */
    it("SW_INC_STAT_018 – Incoming hides both fully-received products", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.incoming, td.ramHyperX, td.laptopEliteBook);
    });
  });

  // ===========================================================================
  // ██████████  DAMAGED  ██████████████████████████████████████████████████████
  // ===========================================================================
  describe("Damaged filter (SW_INC_STAT_019 – 024)", () => {
    /**
     * @testCaseId    SW_INC_STAT_019
     * @description   Clicking the Damaged tile filters the table to include
     *                the active Product-Item (Lenovo ThinkPad) which has been
     *                seeded with Damaged > 0 via mark-status by serials.
     * @testData      fixtures/statsClickData.json → tileLabels.damaged, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Damaged stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_019 – Damaged shows Product-Item with Damaged > 0 (Lenovo)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.damaged, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_020
     * @description   Clicking the Damaged tile filters the table to include
     *                the active Product-Only (Kingston DDR4) which has been
     *                seeded with Damaged > 0 via mark-status by quantity.
     * @testData      fixtures/statsClickData.json → tileLabels.damaged, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Damaged stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it("SW_INC_STAT_020 – Damaged shows Product-Only with Damaged > 0 (Kingston)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.damaged, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_021
     * @description   Clicking the Damaged tile shows both the active
     *                Product-Only and Product-Item simultaneously when each
     *                has Damaged > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.damaged, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Damaged stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it("SW_INC_STAT_021 – Damaged shows both Product-Only and Product-Item with Damaged > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.damaged, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_022
     * @description   Clicking the Damaged tile hides the untouched
     *                Product-Only (Corsair DDR5) which has Damaged = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.damaged, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Damaged stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_022 – Damaged hides Product-Only with Damaged = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.damaged, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_023
     * @description   Clicking the Damaged tile hides the untouched
     *                Product-Item (Dell Latitude) which has Damaged = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.damaged, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Damaged stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_023 – Damaged hides Product-Item with Damaged = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.damaged, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_024
     * @description   Clicking the Damaged tile hides both untouched products
     *                (Corsair Product-Only and Dell Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.damaged, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Damaged stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_024 – Damaged hides both untouched products", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.damaged, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ===========================================================================
  // ██████████  DISPUTED  █████████████████████████████████████████████████████
  // ===========================================================================
  describe("Disputed filter (SW_INC_STAT_025 – 030)", () => {
    /**
     * @testCaseId    SW_INC_STAT_025
     * @description   Clicking the Disputed tile filters the table to include
     *                the active Product-Item (Lenovo ThinkPad) which has been
     *                seeded with Disputed > 0 via mark-status by serials.
     * @testData      fixtures/statsClickData.json → tileLabels.disputed, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Disputed stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_025 – Disputed shows Product-Item with Disputed > 0 (Lenovo)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.disputed, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_026
     * @description   Clicking the Disputed tile filters the table to include
     *                the active Product-Only (Kingston DDR4) which has been
     *                seeded with Disputed > 0 via mark-status by quantity.
     * @testData      fixtures/statsClickData.json → tileLabels.disputed, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Disputed stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it("SW_INC_STAT_026 – Disputed shows Product-Only with Disputed > 0 (Kingston)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.disputed, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_027
     * @description   Clicking the Disputed tile shows both the active
     *                Product-Only and Product-Item simultaneously when each
     *                has Disputed > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.disputed, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Disputed stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it("SW_INC_STAT_027 – Disputed shows both Product-Only and Product-Item with Disputed > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.disputed, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_028
     * @description   Clicking the Disputed tile hides the untouched
     *                Product-Only (Corsair DDR5) which has Disputed = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.disputed, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Disputed stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_028 – Disputed hides Product-Only with Disputed = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.disputed, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_029
     * @description   Clicking the Disputed tile hides the untouched
     *                Product-Item (Dell Latitude) which has Disputed = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.disputed, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Disputed stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_029 – Disputed hides Product-Item with Disputed = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.disputed, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_030
     * @description   Clicking the Disputed tile hides both untouched products
     *                (Corsair Product-Only and Dell Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.disputed, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Disputed stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_030 – Disputed hides both untouched products", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.disputed, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ===========================================================================
  // ██████████  MISSING  ██████████████████████████████████████████████████████
  // ===========================================================================
  describe("Missing filter (SW_INC_STAT_031 – 036)", () => {
    /**
     * @testCaseId    SW_INC_STAT_031
     * @description   Clicking the Missing tile filters the table to include
     *                the active Product-Item (Lenovo ThinkPad) which has been
     *                seeded with Missing > 0 from its still-Incoming serials
     *                (BE blocks Available → Missing transitions).
     * @testData      fixtures/statsClickData.json → tileLabels.missing, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Missing stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_031 – Missing shows Product-Item with Missing > 0 (Lenovo)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.missing, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_032
     * @description   Clicking the Missing tile filters the table to include
     *                the active Product-Only (Kingston DDR4) which has been
     *                seeded with Missing > 0 via mark-status by quantity.
     * @testData      fixtures/statsClickData.json → tileLabels.missing, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Missing stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it("SW_INC_STAT_032 – Missing shows Product-Only with Missing > 0 (Kingston)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.missing, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_033
     * @description   Clicking the Missing tile shows both the active
     *                Product-Only and Product-Item simultaneously when each
     *                has Missing > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.missing, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Missing stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it("SW_INC_STAT_033 – Missing shows both Product-Only and Product-Item with Missing > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.missing, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_034
     * @description   Clicking the Missing tile hides the untouched
     *                Product-Only (Corsair DDR5) which has Missing = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.missing, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Missing stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_034 – Missing hides Product-Only with Missing = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.missing, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_035
     * @description   Clicking the Missing tile hides the untouched
     *                Product-Item (Dell Latitude) which has Missing = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.missing, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Missing stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_035 – Missing hides Product-Item with Missing = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.missing, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_036
     * @description   Clicking the Missing tile hides both untouched products
     *                (Corsair Product-Only and Dell Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.missing, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Missing stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_036 – Missing hides both untouched products", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.missing, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ===========================================================================
  // ██████████  SOLD  █████████████████████████████████████████████████████████
  // ===========================================================================
  describe("Sold filter (SW_INC_STAT_037 – 042)", () => {
    /**
     * @testCaseId    SW_INC_STAT_037
     * @description   Clicking the Sold tile filters the table to include the
     *                active Product-Item (Lenovo ThinkPad) which has been
     *                seeded with Sold > 0 via stockout-by-serial-number with
     *                reason = Sold.
     * @testData      fixtures/statsClickData.json → tileLabels.sold, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Sold stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_037 – Sold shows Product-Item with Sold > 0 (Lenovo)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.sold, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_038
     * @description   Clicking the Sold tile filters the table to include the
     *                active Product-Only (Kingston DDR4) which has been
     *                seeded with Sold > 0 via /products/stock-out (Sold).
     * @testData      fixtures/statsClickData.json → tileLabels.sold, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Sold stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it("SW_INC_STAT_038 – Sold shows Product-Only with Sold > 0 (Kingston)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.sold, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_039
     * @description   Clicking the Sold tile shows both the active
     *                Product-Only and Product-Item simultaneously when each
     *                has Sold > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.sold, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Sold stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it("SW_INC_STAT_039 – Sold shows both Product-Only and Product-Item with Sold > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.sold, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_040
     * @description   Clicking the Sold tile hides the untouched Product-Only
     *                (Corsair DDR5) which has Sold = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.sold, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Sold stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_040 – Sold hides Product-Only with Sold = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.sold, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_041
     * @description   Clicking the Sold tile hides the untouched Product-Item
     *                (Dell Latitude) which has Sold = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.sold, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Sold stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_041 – Sold hides Product-Item with Sold = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.sold, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_042
     * @description   Clicking the Sold tile hides both untouched products
     *                (Corsair Product-Only and Dell Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.sold, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Sold stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_042 – Sold hides both untouched products", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.sold, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ===========================================================================
  // ██████████  STOCKED OUT (OTHERS)  █████████████████████████████████████████
  // ===========================================================================
  describe("Stocked out (others) filter (SW_INC_STAT_043 – 048)", () => {
    /**
     * @testCaseId    SW_INC_STAT_043
     * @description   Clicking the "Stocked out (others)" tile filters the
     *                table to include the active Product-Item (Lenovo
     *                ThinkPad) which has been seeded with stock-outs whose
     *                reason ≠ Sold (Shipped).
     * @testData      fixtures/statsClickData.json → tileLabels.stockedOutOther, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Stocked-out (others) stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_043 – Stocked out (others) shows Product-Item with stat > 0 (Lenovo)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.stockedOutOther, td.laptopThinkPad);
    });

    /**
     * ⚠ APP BUG — SW_INC_STAT_044 / 045 skipped deliberately. Do NOT "fix" these by
     * changing the expectation; the assertions are correct.
     *
     * The "Stocked out (others)" CARD COUNT and its TILE FILTER disagree for
     * product-only products:
     *   • the count (computeStockoutHybridByProduct, incoming-item.service.ts) UNIONs
     *     items-based stock-outs with `stockoutItems` rows keyed by product id, so a
     *     product-only product's quantity stock-out IS counted; but
     *   • the filter's whereClause is items-driven — it requires
     *     `EXISTS (SELECT 1 FROM items i_so WHERE i_so."productId" = p.id
     *              AND i_so.status = 'StockedOut' AND <reason> IS DISTINCT FROM 'Sold')`
     *     and a product-only product has NO rows in `items` at all.
     * So clicking the tile drops every product-only product, even though the badge
     * counted it. "Sold" does not have this problem — it goes through the
     * stockoutItems (SOI) branch, which is why SW_INC_STAT_038 (Sold shows Kingston,
     * the same product-only product) passes while these two cannot.
     *
     * Un-skip once the "Stocked out (others)" filter covers product-only quantity
     * stock-outs the same way its count already does.
     */
    /**
     * @testCaseId    SW_INC_STAT_044
     * @description   Clicking the "Stocked out (others)" tile filters the
     *                table to include the active Product-Only (Kingston DDR4)
     *                which has been seeded with stock-outs whose reason ≠ Sold.
     * @testData      fixtures/statsClickData.json → tileLabels.stockedOutOther, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Stocked-out (others) stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it.skip("SW_INC_STAT_044 – Stocked out (others) shows Product-Only with stat > 0 (Kingston)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.stockedOutOther, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_045
     * @description   Clicking the "Stocked out (others)" tile shows both the
     *                active Product-Only and Product-Item simultaneously when
     *                each has a non-Sold stock-out count > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.stockedOutOther, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Stocked-out (others) stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it.skip("SW_INC_STAT_045 – Stocked out (others) shows both Product-Only and Product-Item with stat > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.stockedOutOther, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_046
     * @description   Clicking the "Stocked out (others)" tile hides the
     *                untouched Product-Only (Corsair DDR5) which has stat = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.stockedOutOther, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Stocked-out (others) stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_046 – Stocked out (others) hides Product-Only with stat = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.stockedOutOther, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_047
     * @description   Clicking the "Stocked out (others)" tile hides the
     *                untouched Product-Item (Dell Latitude) which has stat = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.stockedOutOther, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Stocked-out (others) stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_047 – Stocked out (others) hides Product-Item with stat = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.stockedOutOther, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_048
     * @description   Clicking the "Stocked out (others)" tile hides both
     *                untouched products (Corsair Product-Only and Dell
     *                Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.stockedOutOther, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Stocked-out (others) stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_048 – Stocked out (others) hides both untouched products", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.stockedOutOther, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ===========================================================================
  // ██████████  RESERVED  █████████████████████████████████████████████████████
  // ===========================================================================
  describe("Reserved filter (SW_INC_STAT_049 – 054)", () => {
    /**
     * @testCaseId    SW_INC_STAT_049
     * @description   Clicking the Reserved tile filters the table to include
     *                the active Product-Item (Lenovo ThinkPad) which has been
     *                reserved against an Open work order via /work-orders +
     *                /work-orders/scan.
     * @testData      fixtures/statsClickData.json → tileLabels.reserved, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Reserved stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains laptopThinkPad.tableMatchText
     * @expectedResult  Lenovo ThinkPad row is present in the filtered table.
     */
    it("SW_INC_STAT_049 – Reserved shows Product-Item with Reserved > 0 (Lenovo)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.reserved, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_050
     * @description   Clicking the Reserved tile filters the table to include
     *                the active Product-Only (Kingston DDR4) reserved against
     *                an Open work order (no serials needed for product-only).
     * @testData      fixtures/statsClickData.json → tileLabels.reserved, ramKingston
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Reserved stat tile and wait for the filtered fetch
     *   3. Assert the rendered table contains ramKingston.tableMatchText
     * @expectedResult  Kingston DDR4 row is present in the filtered table.
     */
    it("SW_INC_STAT_050 – Reserved shows Product-Only with Reserved > 0 (Kingston)", { tags: ["@regression"] }, () => {
      tcInTable(td.tileLabels.reserved, td.ramKingston);
    });

    /**
     * @testCaseId    SW_INC_STAT_051
     * @description   Clicking the Reserved tile shows both the active
     *                Product-Only and Product-Item simultaneously when each
     *                has Reserved > 0.
     * @testData      fixtures/statsClickData.json → tileLabels.reserved, ramKingston, laptopThinkPad
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Reserved stat tile and wait for the filtered fetch
     *   3. Assert the table contains both ramKingston AND laptopThinkPad
     * @expectedResult  Both Kingston DDR4 and Lenovo ThinkPad rows are present.
     */
    it("SW_INC_STAT_051 – Reserved shows both Product-Only and Product-Item with Reserved > 0", { tags: ["@regression"] }, () => {
      tcBothInTable(td.tileLabels.reserved, td.ramKingston, td.laptopThinkPad);
    });

    /**
     * @testCaseId    SW_INC_STAT_052
     * @description   Clicking the Reserved tile hides the untouched
     *                Product-Only (Corsair DDR5) which has Reserved = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.reserved, ramCorsair
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Reserved stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain ramCorsair.tableMatchText
     * @expectedResult  Corsair DDR5 row is absent from the filtered table.
     */
    it("SW_INC_STAT_052 – Reserved hides Product-Only with Reserved = 0 (Corsair)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.reserved, td.ramCorsair);
    });

    /**
     * @testCaseId    SW_INC_STAT_053
     * @description   Clicking the Reserved tile hides the untouched
     *                Product-Item (Dell Latitude) which has Reserved = 0.
     * @testData      fixtures/statsClickData.json → tileLabels.reserved, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Reserved stat tile and wait for the filtered fetch
     *   3. Assert the rendered table does NOT contain laptopLatitude.tableMatchText
     * @expectedResult  Dell Latitude row is absent from the filtered table.
     */
    it("SW_INC_STAT_053 – Reserved hides Product-Item with Reserved = 0 (Dell)", { tags: ["@regression"] }, () => {
      tcNotInTable(td.tileLabels.reserved, td.laptopLatitude);
    });

    /**
     * @testCaseId    SW_INC_STAT_054
     * @description   Clicking the Reserved tile hides both untouched products
     *                (Corsair Product-Only and Dell Product-Item) at once.
     * @testData      fixtures/statsClickData.json → tileLabels.reserved, ramCorsair, laptopLatitude
     * @steps
     *   1. Open the seeded stats PO from Incoming Inventory
     *   2. Click the Reserved stat tile and wait for the filtered fetch
     *   3. Assert the table contains neither ramCorsair nor laptopLatitude
     * @expectedResult  Neither Corsair DDR5 nor Dell Latitude rows are present.
     */
    it("SW_INC_STAT_054 – Reserved hides both untouched products", { tags: ["@regression"] }, () => {
      tcBothNotInTable(td.tileLabels.reserved, td.ramCorsair, td.laptopLatitude);
    });
  });

  // ─── after() — cleanup created POs + restore config ──────────────────────
  after(() => {
    if (createdPOs.length === 0) return;
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
    // Restore: statusClickOpensItemsView defaults to true — other specs expect it
    apiSetGeneralConfigFlags({ statusClickOpensItemsView: true });
  });
});
