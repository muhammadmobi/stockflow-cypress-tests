import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories } from "../../support/helpers/attributeHelpers";
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
  function apiStockOutByProductQty(productId, quantity, reason) {
    const body = {
      reason,
      quantity,
      containerSource: "unassigned",
      id: productId,
      level: "Product",
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

  // Mirror of the backend reserveProductWithItems service method:
  // 1. POST /work-orders  { status, products:[{productId,name,partNumber,quantity}] }
  //    – name allows null per schema; hasItems is resolved server-side from the product record.
  // 2. POST /work-orders/scan  { workOrderNumber, productId, serialNumber }
  //    – 'hasItems' must NOT be sent; the backend fetches it from the product entity.
  function apiReserve(productId, partNumber, quantity, serialNumbers = [], logPath) {
    const createBody = {
      status: "Open",
      products: [{ productId, name: null, partNumber, quantity }],
    };
    if (logPath) cy.task("writeLog", { filePath: logPath, message: `[apiReserve] → POST /work-orders body:${JSON.stringify(createBody)}` });
    return apiCall("POST", "/work-orders", createBody).then((woRes) => {
      if (logPath) cy.task("writeLog", { filePath: logPath, message: `[apiReserve] ← createWO ${woRes.status} ${JSON.stringify(woRes.body).slice(0, 400)}` });
      assertSeedSuccess("apiReserve createWorkOrder", woRes);
      if (serialNumbers.length === 0) return;
      const woNum = woRes.body?.data?.workOrderNumber;
      if (logPath) cy.task("writeLog", { filePath: logPath, message: `[apiReserve] WO created: ${woNum} — scanning ${serialNumbers.length} serial(s)` });
      serialNumbers.forEach((sn) => {
        const scanBody = { workOrderNumber: woNum, productId, serialNumber: sn };
        if (logPath) cy.task("writeLog", { filePath: logPath, message: `[apiReserve] → POST /work-orders/scan body:${JSON.stringify(scanBody)}` });
        apiCall("POST", "/work-orders/scan", scanBody).then((scanRes) => {
          if (logPath) cy.task("writeLog", { filePath: logPath, message: `[apiReserve] ← scan sn:${sn} ${scanRes.status} ${JSON.stringify(scanRes.body).slice(0, 200)}` });
        });
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
  function clickStatAndWait(tileLabel) {
    cy.intercept("GET", "**/incoming-items**").as("filteredFetch");
    incomingInvPage.clickStatTile(tileLabel);
    cy.wait("@filteredFetch", { timeout: 15000 });
  }

  function assertProductInTable(matchText) {
    incomingInvPage.verifyTableContainsText(matchText);
  }

  function assertProductNotInTable(matchText) {
    incomingInvPage.verifyTableDoesNotContainText(matchText);
  }

  function openStatsPO() {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(statsPO);
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

      cy.adminSession();
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

      incomingInvPage = new IncomingInvPage();
      purchaseOrderPage = new PurchaseOrderPage();

      // ── Build single PO with 6 products ──────────────────────────────────
      const stamp = ts();
      statsPO = `PO-StatsClick-${stamp}`;
      createdPOs.push(statsPO);
      const fileName = `StatsClick-${stamp}.xlsx`;
      const LOG = `cypress/fixtures/stats-seed-debug-${stamp}.log`;

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

      // ── Stock-in via UI ──────────────────────────────────────────────────
      stockInProduct(
        statsPO,
        td.ramKingston.displayName,
        td.qty.activeStockIn,
      );
      stockInProduct(
        statsPO,
        td.ramHyperX.displayName,
        td.qty.fullStockIn,
      );
      stockInProduct(
        statsPO,
        td.laptopThinkPad.displayName,
        td.qty.activeStockIn,
      );
      stockInProduct(
        statsPO,
        td.laptopEliteBook.displayName,
        td.qty.fullStockIn,
      );

      // ── API: resolve IDs then chain ALL seeds ─────────────────────────────
      // FIX: nested .then() ensures IDs are resolved before seeds fire.
      apiGetProductId(statsPO, td.ramKingston.displayName).then((kingId) => {
        kingstonProductId = kingId;
        cy.task("writeLog", { filePath: LOG, message: `Kingston productId resolved: ${kingId}` });

        apiGetProductId(statsPO, td.laptopThinkPad.displayName).then((lapId) => {
          thinkPadProductId = lapId;
          cy.task("writeLog", { filePath: LOG, message: `ThinkPad productId resolved: ${lapId}` });

          // ── Kingston seeds ────────────────────────────────────────────
          apiMarkStatusByProductQty(kingstonProductId, td.seed.damagedQty, td.filters.damaged, td.seed.damageReason, statsPO)
            .then((r) => {
              cy.task("writeLog", { filePath: LOG, message: `[Kingston] mark Damaged(${td.seed.damagedQty}) → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` });
              assertSeedSuccess("Kingston mark Damaged", r);
            });

          apiMarkStatusByProductQty(kingstonProductId, td.seed.disputedQty, td.filters.disputed, undefined, statsPO)
            .then((r) => {
              cy.task("writeLog", { filePath: LOG, message: `[Kingston] mark Disputed(${td.seed.disputedQty}) → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` });
              assertSeedSuccess("Kingston mark Disputed", r);
            });

          apiMarkStatusByProductQty(kingstonProductId, td.seed.missingQty, td.filters.missing, undefined, statsPO)
            .then((r) => {
              cy.task("writeLog", { filePath: LOG, message: `[Kingston] mark Missing(${td.seed.missingQty}) → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` });
              assertSeedSuccess("Kingston mark Missing", r);
            });

          apiStockOutByProductQty(kingstonProductId, td.seed.soldQty, td.reasons.sold, statsPO)
            .then((r) => {
              cy.task("writeLog", { filePath: LOG, message: `[Kingston] stockOut Sold(${td.seed.soldQty}) → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` });
              assertSeedSuccess("Kingston stockOut Sold", r);
            });

          apiStockOutByProductQty(kingstonProductId, td.seed.shippedQty, td.reasons.shipped, statsPO)
            .then((r) => {
              cy.task("writeLog", { filePath: LOG, message: `[Kingston] stockOut Shipped(${td.seed.shippedQty}) → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` });
              assertSeedSuccess("Kingston stockOut Shipped", r);
            });

          apiReserve(kingstonProductId, td.ramKingston.brand, td.seed.reservedQty, [], LOG);

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

          cy.task("writeLog", { filePath: LOG, message: `[ThinkPad] damagedSNs:${JSON.stringify(damagedSNs)} disputedSNs:${JSON.stringify(disputedSNs)} soldSNs:${JSON.stringify(soldSNs)} shippedSNs:${JSON.stringify(shippedSNs)} reservedSNs:${JSON.stringify(reservedSNs)} missingSNs:${JSON.stringify(missingSNs)}` });

          apiMarkStatusBySerials(damagedSNs, td.filters.damaged, td.seed.damageReason)
            .then((r) => cy.task("writeLog", { filePath: LOG, message: `[ThinkPad] mark Damaged → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` }));

          apiMarkStatusBySerials(disputedSNs, td.filters.disputed)
            .then((r) => cy.task("writeLog", { filePath: LOG, message: `[ThinkPad] mark Disputed → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` }));

          apiMarkStatusBySerials(missingSNs, td.filters.missing)
            .then((r) => cy.task("writeLog", { filePath: LOG, message: `[ThinkPad] mark Missing → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}` }));

          soldSNs.forEach((sn) =>
            apiStockOutBySerial(sn, td.reasons.sold)
              .then((r) => cy.task("writeLog", { filePath: LOG, message: `[ThinkPad] stockOut Sold sn:${sn} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}` }))
          );

          shippedSNs.forEach((sn) =>
            apiStockOutBySerial(sn, td.reasons.shipped)
              .then((r) => cy.task("writeLog", { filePath: LOG, message: `[ThinkPad] stockOut Shipped sn:${sn} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}` }))
          );

          apiReserve(thinkPadProductId, td.laptopThinkPad.modelNumber, td.seed.reservedQty, reservedSNs, LOG);

          cy.task("writeLog", { filePath: LOG, message: `=== Seed phase complete. Log: ${LOG} ===` });
        });
      });
    });
  });

  beforeEach(() => {
    cy.adminSession();
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
    it.only("SW_INC_STAT_001 – Available shows Product-Item with Available > 0 (Lenovo)", { tags: ["@smoke", "@regression"] }, () => {
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
    it("SW_INC_STAT_044 – Stocked out (others) shows Product-Only with stat > 0 (Kingston)", { tags: ["@regression"] }, () => {
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
    it("SW_INC_STAT_045 – Stocked out (others) shows both Product-Only and Product-Item with stat > 0", { tags: ["@regression"] }, () => {
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

  // ─── after() — cleanup created POs ────────────────────────────────────────
  after(() => {
    if (createdPOs.length === 0) return;
    cy.adminSession();
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });
});
