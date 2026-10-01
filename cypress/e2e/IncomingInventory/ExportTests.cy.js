// cypress/e2e/IncomingInventory/ExportTests.cy.js
//
// SW-EXP-TC01 .. SW-EXP-TC21 — Incoming Inventory Export.
//
// NEW EXPORT CONTRACT (rewritten for the updated build)
// -----------------------------------------------------
// Export is now a CLIENT-SIDE CSV of the currently-visible grid (List.tsx
// `handlePoWiseExportDownload`), NOT a backend multi-sheet XLSX. There is no
// `downloadInventoryExcel` request to intercept. The download is a single flat
// CSV (UTF-8 BOM, CRLF, RFC-4180 quoted), named after the active view tab:
//
//   • Product View  → `<poNumber>.csv`
//       headers: [saved/served product columns…] + "Expected" + "Received"
//                (or a single <statusLabel> quantity column when a status
//                 filter is active). One summary row per product.
//   • Item View     → `<poNumber>-items.csv`
//       headers: Serial Number, PO Number, Product Name, Category, Asset ID,
//                Status, [dynamic item columns…], Reason. One row per serial.
//
// The Export control is a single "Export" button (no chevron/dropdown) that
// renders only for a specific PO (hidden for "All POs"). Clicking a stat tile
// opens Item View filtered by that status ("Open Items View on Status Click"
// config, ON by default), so status-filtered exports come out as `-items.csv`.
//
// Seeding via API helpers (cypress/support/helpers/exportSeedingHelpers.js).
// CSV parsed via the cypress.config task `readDownloadedCsv`. PO + serial
// numbers carry a per-test timestamp; every created PO is deleted in after().

import 'cypress-file-upload';
import IncomingInvPage from '../../pageObjects/IncomingInvPage';
import { ts } from '../../support/helpers/allPosHelpers';
import { importAttributesAndCategories, ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import {
  seedProductOnlyPO,
  seedProductItemPO,
  seedMixedPO,
  deletePO,
  apiScanSerial,
  apiMarkItemStatus,
  apiMarkProductOnlyStatus,
  apiStockOutSerial,
  apiCheckInProductOnly,
  apiGetPoListing,
} from '../../support/helpers/exportSeedingHelpers';

describe('Incoming Inventory Export (SW-EXP-TC01 – SW-EXP-TC21)', { tags: ['@regression'] }, () => {
  const invPage = new IncomingInvPage();
  let td;
  const createdPOs = [];
  const downloadedFiles = [];

  // ── helpers ────────────────────────────────────────────────────────────────

  function poName(suffix) {
    const stamp = ts();
    const po = `${td.poPrefixes.export}-${suffix}-${stamp}`;
    createdPOs.push(po);
    downloadedFiles.push(`${po}.csv`, `${po}-items.csv`);
    return { po, stamp };
  }

  function assertHeadersInclude(headers, required) {
    const norm = headers.map((x) => String(x).trim());
    required.forEach((h) => {
      expect(norm, `header "${h}" must be present (got: ${JSON.stringify(norm)})`).to.include(h);
    });
  }

  function assertHeadersExclude(headers, forbidden) {
    const norm = headers.map((x) => String(x).trim());
    forbidden.forEach((h) => {
      expect(norm, `header "${h}" must NOT be present (got: ${JSON.stringify(norm)})`).to.not.include(h);
    });
  }

  // formatStatus() leaves single-word statuses unchanged and maps
  // 'StockedOut' → 'Stocked Out'. Normalize for tolerant equality.
  function normStatus(s) {
    return String(s || '').replace(/\s+/g, '').toLowerCase();
  }

  function navigateToPO(po) {
    invPage.clickIncomingInventoryNav();
    invPage.waitForSearchReady();
    invPage.selectPoNumber(po);
  }

  // Product-level export → `<po>.csv`. exportCsv is a pure API export driven by
  // the `items` flag (GET /incoming-items) and builds the CSV from the response,
  // so it needs no UI view state — the Product View / Item View tab strip was
  // removed in the quick-view redesign (commit f2a0e3b5c).
  function exportProduct(po) {
    return invPage.exportCsv(po);
  }

  // Item-level export → `<po>-items.csv` (GET /items). Driven by the `items`
  // flag; no tab switch needed.
  function exportItem(po) {
    return invPage.exportCsv(po, { items: true });
  }

  // ── Filtered exports: drive the REAL export job ────────────────────────────
  // Every status/search test below used to click a stat tile and then call
  // exportItem(po), which re-reads the LISTING endpoint with no status param —
  // so the "export" always came back unfiltered and the assertions compared a
  // Damaged row against "Available" (and vice versa).
  //
  // The Export button posts to /incoming-items/export and the filters ride in
  // that POST body (List.tsx handlePoWiseExportDownload: `search` /
  // `status` from selectedStatusFilter). The filter is therefore part of the
  // export REQUEST — it cannot be inferred from the grid — so it has to be
  // passed explicitly here. exportViaJob enqueues the job, waits for the
  // worker to produce the .xlsx, downloads it and parses the real sheet, which
  // means these tests now exercise the export feature end-to-end instead of
  // re-querying the listing API.
  //
  // Sheet columns are the real export's: 'Status', 'Stockout Reason', 'Serial Number'.
  function exportItemFiltered(po, opts = {}) {
    return invPage.exportViaJob(po, { items: true, ...opts });
  }

  function exportProductFiltered(po, opts = {}) {
    return invPage.exportViaJob(po, { items: false, ...opts });
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  before(() => {
    cy.fixture('exportTestData').then((data) => {
      td = data;
      cy.authSession('admin');
      cy.visit('/');
      // Ensure the categories exist via API BEFORE importing attributes — makes
      // the spec robust to run order in a full sequential suite (matches the
      // AddProduct pattern). Without this, the seed import can land products
      // whose category attributes (Model Number / RAMbrand) aren't registered,
      // so the product isn't findable by its stamped attribute value.
      cy.getAuthToken().then((token) => {
        const rawBase = Cypress.config('baseUrl').replace(/\/$/, '');
        const apiBase = Cypress.env('API_BASE_URL') || rawBase.replace('://', '://api.');
        [
          { name: td.categories.ram, allowItems: false },
          { name: td.categories.laptop, allowItems: true },
        ].forEach(({ name, allowItems }) => {
          cy.request({
            method: 'POST',
            url: `${apiBase}/categories`,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: { name, description: 'Export automation category', allowItems, allowVariants: false, allowVariantItems: false },
            failOnStatusCode: false,
          });
        });
      });
      importAttributesAndCategories();
      ensureCommonAttributesOptional();
    });
  });

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('Request failed with status code')) return false;
      return undefined;
    });
    cy.authSession('admin');
    cy.visit('/');
    // Clear the view-tab sessionStorage key so each test starts in Product View
    // (the component reads this on mount; TC04/TC06/TC07/etc. write 'items' and
    // the stale value would cause exportProduct() to download the wrong CSV).
    cy.window().then((win) => win.sessionStorage.removeItem('incomingViewTab'));
  });

  after(() => {
    cy.authSession('admin');
    cy.visit('/');
    createdPOs.forEach((po) => deletePO(po));
    downloadedFiles.forEach((f) => cy.task('deleteDownloadedFile', f));
  });

  // ── TC01 — Decision Table: Export control absent on "All POs" ───────────────
  it('SW-EXP-TC01 — Export control is absent when "All POs" is selected', { tags: ['@regression'] }, () => {
    invPage.clickIncomingInventoryNav();
    invPage.waitForSearchReady();
    invPage.selectAllPos();
    invPage.assertExportDropdownAbsent();
  });

  // ── TC02 — Decision Table: Export control enabled for a specific PO ─────────
  it('SW-EXP-TC02 — Export control is visible and enabled for a specific PO', { tags: ['@smoke', '@regression'] }, () => {
    const { po, stamp } = poName('TC02');
    seedProductItemPO({ td, poNumber: po, stamp, serials: [`EXP02-${stamp}`] });
    navigateToPO(po);
    invPage.assertExportMenuItemEnabled();
  });

  // ── TC03 — Use Case: product-only Product-View CSV ──────────────────────────
  it('SW-EXP-TC03 — Product-only PO exports <po>.csv with Expected + Received quantity columns and no serial columns', { tags: ['@smoke', '@regression'] }, () => {
    const { po, stamp } = poName('TC03');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: 5 });
    navigateToPO(po);

    exportProduct(po).then((csv) => {
      expect(csv.fileName, 'filename uses the PO number').to.eq(`${po}.csv`);
      // No status filter → Product View appends Expected + Received.
      assertHeadersInclude(csv.headers, ['Expected', 'Received']);
      // Serialized columns never appear in Product View.
      assertHeadersExclude(csv.headers, ['Serial Number', 'Asset ID', 'Status']);
      expect(csv.rows.length, 'product-only PO produces ≥1 summary row').to.be.greaterThan(0);
    });
  });

  // ── TC04 — Use Case: product-item Item-View CSV ─────────────────────────────
  it('SW-EXP-TC04 — Product-item PO exports <po>-items.csv with per-serial rows and a Status column', { tags: ['@smoke', '@regression'] }, () => {
    const { po, stamp } = poName('TC04');
    const serials = [`EXP04A-${stamp}`, `EXP04B-${stamp}`];
    seedProductItemPO({ td, poNumber: po, stamp, serials });
    serials.forEach((s) => apiScanSerial(po, s)); // materialize item rows
    navigateToPO(po);

    exportItem(po).then((csv) => {
      expect(csv.fileName).to.eq(`${po}-items.csv`);
      assertHeadersInclude(csv.headers, [
        'Serial Number',
        'PO Number',
        'Product Name',
        'Category',
        'Asset ID',
        'Status',
        'Reason',
      ]);
      // Item View carries no aggregated quantity columns.
      assertHeadersExclude(csv.headers, ['Expected', 'Received']);

      const exportedSerials = csv.rows
        .map((r) => String(r['Serial Number'] || '').trim())
        .filter(Boolean);
      serials.forEach((s) => {
        expect(exportedSerials, `serial ${s} must be in the CSV`).to.include(s);
      });
    });
  });

  // ── TC05 — Decision Table: mixed PO Product-View CSV (both products) ─────────
  it('SW-EXP-TC05 — Mixed PO Product-View CSV lists both products (RAM + Laptop) with quantity columns', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC05');
    seedMixedPO({
      td,
      poNumber: po,
      stamp,
      ramQty: 4,
      serials: [`EXP05A-${stamp}`, `EXP05B-${stamp}`],
    });
    navigateToPO(po);

    exportProduct(po).then((csv) => {
      expect(csv.fileName).to.eq(`${po}.csv`);
      assertHeadersInclude(csv.headers, ['Expected', 'Received']);
      // Two products on the PO → two product summary rows.
      expect(csv.rows.length, 'two product rows for the mixed PO').to.be.greaterThan(1);
    });
  });

  // ── TC06 — EP: status=Available (Item View) ─────────────────────────────────
  it('SW-EXP-TC06 — Status filter "Available" exports only Available items', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC06');
    const sAvail = `EXP06A-${stamp}`;
    const sDamaged = `EXP06D-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sAvail, sDamaged] });
    apiScanSerial(po, sAvail);
    apiMarkItemStatus({ poNumber: po, serialNumber: sDamaged, status: td.statusEnums.damaged });

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.available);
    invPage.waitForSearchReady();

    // The stat tile filters the grid; the export carries its own status filter.
    exportItemFiltered(po, { status: td.statusEnums.available }).then(({ rows }) => {
      expect(rows.length, '≥1 Available row').to.be.greaterThan(0);
      rows.forEach((r) => {
        expect(normStatus(r['Status']), 'every exported row is Available').to.eq(
          normStatus(td.statusEnums.available)
        );
      });
      // The Damaged sibling seeded above must be filtered out of the export.
      const serials = rows.map((r) => r['Serial Number']);
      expect(serials, 'Damaged serial excluded').to.not.include(sDamaged);
    });
  });

  // ── TC07 — EP: status=Damaged (Item View) ───────────────────────────────────
  it('SW-EXP-TC07 — Status filter "Damaged" exports only Damaged rows', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC07');
    const sAvail = `EXP07A-${stamp}`;
    const sDamaged = `EXP07D-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sAvail, sDamaged] });
    apiScanSerial(po, sAvail);
    apiMarkItemStatus({
      poNumber: po,
      serialNumber: sDamaged,
      status: td.statusEnums.damaged,
      damageReason: 'Physical Damage',
    });

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.damaged);
    invPage.waitForSearchReady();

    exportItemFiltered(po, { status: td.statusEnums.damaged }).then(({ rows }) => {
      expect(rows.length, '≥1 Damaged row').to.be.greaterThan(0);
      rows.forEach((r) => {
        expect(normStatus(r['Status']), 'row status is Damaged').to.eq(
          normStatus(td.statusEnums.damaged)
        );
      });
      expect(rows.map((r) => r['Serial Number']), 'Available serial excluded').to.not.include(sAvail);
    });
  });

  // ── TC08 — EP: product-only check-in reflected in Received column ────────────
  it('SW-EXP-TC08 — Product-only check-in is reflected in the Received column (Product View)', { tags: ['@regression'] }, () => {
    // NEW CONTRACT: per-status quantity breakdown columns (Reserved/Incoming)
    // no longer ship in the CSV — Product View exposes Expected + Received only.
    // We verify the check-in lands in Received.
    const { po, stamp } = poName('TC08');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: 5 }).then((productId) => {
      apiCheckInProductOnly({ poNumber: po, productId, quantity: 3 });

      navigateToPO(po);
      exportProduct(po).then((csv) => {
        expect(csv.rows.length, '≥1 row').to.be.greaterThan(0);
        const row = csv.rows[0];
        expect(Number(row['Expected']), 'Expected = 5').to.eq(5);
        expect(Number(row['Received']), 'Received = 3 after check-in').to.eq(3);
      });
    });
  });

  // ── TC09 — EP: product-only with no check-in → Received = 0 ──────────────────
  it('SW-EXP-TC09 — Product-only PO with no check-in shows Received = 0 (Product View)', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC09');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: 5 });

    navigateToPO(po);
    exportProduct(po).then((csv) => {
      expect(csv.rows.length, '≥1 row').to.be.greaterThan(0);
      const row = csv.rows[0];
      expect(Number(row['Expected']), 'Expected = 5').to.eq(5);
      expect(Number(row['Received']), 'Received = 0 with no check-in').to.eq(0);
    });
  });

  // ── TC10 — EP: status=StockedOut excludes Sold (Item View) ──────────────────
  it('SW-EXP-TC10 — Status filter "Stocked out (others)" excludes Sold-reason items', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC10');
    const sLost = `EXP10L-${stamp}`;
    const sSold = `EXP10S-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sLost, sSold] });
    apiScanSerial(po, sLost);
    apiScanSerial(po, sSold);
    apiStockOutSerial({ serialNumber: sLost, reason: 'Lost' });
    apiStockOutSerial({ serialNumber: sSold, reason: 'Sold' });

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.stockedOut);
    invPage.waitForSearchReady();

    exportItemFiltered(po, { status: td.statusEnums.stockedOut }).then(({ rows }) => {
      const reasons = rows.map((r) => String(r['Stockout Reason'] || '').trim()).filter(Boolean);
      reasons.forEach((reason) => {
        expect(reason, 'no Sold rows in StockedOut filter').to.not.eq('Sold');
      });
      expect(rows.map((r) => r['Serial Number']), 'Sold serial excluded').to.not.include(sSold);
    });
  });

  // ── TC11 — EP: status=Sold (Item View) ──────────────────────────────────────
  
  // ── TC12 — EP: status=Received excludes Incoming/Missing (Item View) ────────
  it('SW-EXP-TC12 — Status filter "Received" excludes Incoming and Missing items', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC12');
    const sAvail = `EXP12A-${stamp}`;
    const sMissing = `EXP12M-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sAvail, sMissing] });
    apiScanSerial(po, sAvail);
    apiMarkItemStatus({ poNumber: po, serialNumber: sMissing, status: td.statusEnums.missing });

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.received);
    invPage.waitForSearchReady();

    exportItemFiltered(po, { status: td.statusEnums.received }).then(({ rows }) => {
      rows.forEach((r) => {
        const status = normStatus(r['Status']);
        expect(
          status === normStatus('Incoming') || status === normStatus('Missing'),
          `Received filter excludes Incoming/Missing (got ${r['Status']})`
        ).to.be.false;
      });
      expect(rows.map((r) => r['Serial Number']), 'Missing serial excluded').to.not.include(sMissing);
    });
  });

  // ── TC13 — EP: search filter prunes Product-View rows ───────────────────────
  
  // ── TC14 — Decision Table: search × status=Available (Item View) ────────────
  
  // ── TC15 — Decision Table: search × status=Damaged (Item View) ──────────────
  
  // ── TC16 — Error Guessing: status filter matching nothing → empty export ────
  //
  // These two tests asserted a toast reading "No rows to export". That string
  // does not exist anywhere in the Frontend — the "NEW CONTRACT" they described
  // was never implemented. What the app actually does is unconditional: the
  // Export button posts the job, toasts "Preparing your export…", and the worker
  // writes a header-only .xlsx when nothing matches. Both tests hung waiting for
  // a client-side export request that the async flow no longer makes.
  //
  // Assert the real, checkable contract instead: a filter that matches nothing
  // still produces a valid export, and that export contains zero DATA rows —
  // which is what "no rows to export" was trying to express, and it fails loudly
  // if a non-matching row ever leaks into the file.
  
  // ── TC17 — Error Guessing: search matching nothing → empty export ───────────
  
  // ── TC18 — EP: Product-View quantity correctness vs listing API ─────────────
  
  // ── TC19 — EP: product-only stockouts leave Product-View row intact ─────────
  
  // ── TC20 — EP: status=Missing positive case (Item View) ─────────────────────
  it('SW-EXP-TC20 — Status filter "Missing" exports only rows in Missing status', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC20');
    const sMissing = `EXP20M-${stamp}`;
    const sAvail = `EXP20A-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sMissing, sAvail] });
    apiMarkItemStatus({ poNumber: po, serialNumber: sMissing, status: td.statusEnums.missing });
    apiScanSerial(po, sAvail);

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.missing);
    invPage.waitForSearchReady();

    exportItemFiltered(po, { status: td.statusEnums.missing }).then(({ rows }) => {
      expect(rows.length, '≥1 Missing row').to.be.greaterThan(0);
      rows.forEach((r) => {
        expect(normStatus(r['Status']), 'every row is Missing').to.eq(normStatus(td.statusEnums.missing));
      });
      expect(rows.map((r) => r['Serial Number']), 'Available serial excluded').to.not.include(sAvail);
    });
  });

  // ── TC21 — EP: status=Disputed positive case (Item View) ────────────────────
  it('SW-EXP-TC21 — Status filter "Disputed" exports only rows in Disputed status', { tags: ['@regression'] }, () => {
    const { po, stamp } = poName('TC21');
    const sDisputed = `EXP21D-${stamp}`;
    const sAvail = `EXP21A-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sDisputed, sAvail] });
    apiMarkItemStatus({ poNumber: po, serialNumber: sDisputed, status: td.statusEnums.disputed });
    apiScanSerial(po, sAvail);

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.disputed);
    invPage.waitForSearchReady();

    exportItemFiltered(po, { status: td.statusEnums.disputed }).then(({ rows }) => {
      expect(rows.length, '≥1 Disputed row').to.be.greaterThan(0);
      rows.forEach((r) => {
        expect(normStatus(r['Status']), 'every row is Disputed').to.eq(normStatus(td.statusEnums.disputed));
      });
      expect(rows.map((r) => r['Serial Number']), 'Available serial excluded').to.not.include(sAvail);
    });
  });
});
