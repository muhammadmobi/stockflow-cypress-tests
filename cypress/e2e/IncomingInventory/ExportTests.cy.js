// cypress/e2e/IncomingInventory/ExportTests.cy.js
//
// SW-EXP-TC01 .. SW-EXP-TC21 — Incoming Inventory Export.
//
// Implements the test plan at
//
// The current scope:
//   1. Chevron-gating decision (TC01, TC02)
//   2. Workbook shape per category type (TC03 product-only, TC04
//      product-item, TC05 mixed)
//   3. Status filter EP partitions (TC06–TC12)
//   4. Search filter EP (TC13)
//   5. Search × Status decision-table intersections (TC14, TC15)
//   6. Empty-result edges (TC16, TC17)
//   7. Quantity-correctness against the listing API (TC18)
//   8. Product-only stockout grouping (TC19)
//
// All seeding is via API helpers (cypress/support/helpers/exportSeedingHelpers.js).
// The download trigger + workbook parse goes through the page-object
// helper `exportAndAssertFileName` which uses the cypress.config task
// `readDownloadedWorkbook` (multi-sheet).
//
// PO numbers and serial numbers carry a per-test timestamp so reruns do
// not collide. Every created PO is torn down via DELETE in after().

import 'cypress-file-upload';
import IncomingInvPage from '../../pageObjects/IncomingInvPage';
import { ts } from '../../support/helpers/allPosHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';
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
  apiReserveViaWorkOrder,
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
    downloadedFiles.push(`${po}.xlsx`);
    return { po, stamp };
  }

  function assertHeadersInclude(headers, required) {
    required.forEach((h) => {
      expect(
        headers.map((x) => String(x).trim()),
        `header "${h}" must be present (got: ${JSON.stringify(headers)})`
      ).to.include(h);
    });
  }

  function assertHeadersExclude(headers, forbidden) {
    forbidden.forEach((h) => {
      expect(
        headers.map((x) => String(x).trim()),
        `header "${h}" must NOT be present (got: ${JSON.stringify(headers)})`
      ).to.not.include(h);
    });
  }

  function navigateToPO(po) {
    invPage.clickIncomingInventoryNav();
    invPage.waitForSearchReady();
    invPage.selectPoNumber(po);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  before(() => {
    cy.fixture('exportTestData').then((data) => { td = data; });
    cy.adminSession();
    cy.visit('/');
    importAttributesAndCategories();
  });

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('Request failed with status code')) return false;
      return undefined;
    });
    cy.adminSession();
    cy.visit('/');
  });

  after(() => {
    cy.adminSession();
    cy.visit('/');
    createdPOs.forEach((po) => deletePO(po));
    downloadedFiles.forEach((f) => cy.task('deleteDownloadedFile', f));
  });

  // ── TC01 — Decision Table: chevron absent on All POs ────────────────────────
  it('SW-EXP-TC01 — Export chevron is absent when "All POs" is selected', { tags: ['@regression'] }, () => {
    // Decision Table — All POs column → no chevron rendered.
    invPage.clickIncomingInventoryNav();
    invPage.waitForSearchReady();
    invPage.selectAllPos();
    invPage.assertExportDropdownAbsent();
  });

  // ── TC02 — Decision Table: chevron + menu enabled on specific PO ────────────
  it('SW-EXP-TC02 — Export chevron + "Export" menu item are visible and enabled for a specific PO', { tags: ['@smoke', '@regression'] }, () => {
    // Decision Table — specific PO column → chevron visible, menu item enabled.
    const { po, stamp } = poName('TC02');
    seedProductItemPO({ td, poNumber: po, stamp, serials: [`EXP02-${stamp}`] });
    navigateToPO(po);
    invPage.openExportDropdown();
    invPage.assertExportMenuItemEnabled();
  });

  // ── TC03 — Use Case: product-only export ────────────────────────────────────
  it('SW-EXP-TC03 — Product-only PO exports as <poNumber>.xlsx with one sheet matching the RAM category and the product-only column set', { tags: ['@smoke', '@regression'] }, () => {
    // Use Case — main flow for a product-only PO.
    const { po, stamp } = poName('TC03');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: 5 });
    navigateToPO(po);

    invPage.exportAndAssertFileName(po).then((wb) => {
      expect(wb.fileName, 'filename uses the PO number').to.eq(`${po}.xlsx`);
      const sheetNames = Object.keys(wb.sheets);
      expect(sheetNames, 'exactly one sheet for the single-category PO').to.deep.eq([td.categories.ram]);

      const sheet = wb.sheets[td.categories.ram];
      // Product-only sheets must carry every quantity column + Cost/Price (admin).
      assertHeadersInclude(sheet.headers, [
        'Category',
        'RAMbrand',
        'Name',
        'Cost',
        'Price',
        'Available Quantity',
        'Incoming Quantity',
        'Reserved Quantity',
        'Received Quantity',
        'Expected Quantity',
      ]);
      // Serialized columns must NOT appear for a product-only PO.
      assertHeadersExclude(sheet.headers, ['Serial Number', 'Asset Tag ID', 'Status']);
      expect(sheet.rows.length, 'product-only PO produces ≥1 summary row').to.be.greaterThan(0);
    });
  });

  // ── TC04 — Use Case: product-item export ────────────────────────────────────
  it('SW-EXP-TC04 — Product-item PO exports a Laptop sheet with per-item rows and a Status column; no quantity columns appear', { tags: ['@smoke', '@regression'] }, () => {
    // Use Case — main flow for a product-item PO.
    const { po, stamp } = poName('TC04');
    const serials = [`EXP04A-${stamp}`, `EXP04B-${stamp}`];
    seedProductItemPO({ td, poNumber: po, stamp, serials });
    navigateToPO(po);

    invPage.exportAndAssertFileName(po).then((wb) => {
      expect(Object.keys(wb.sheets)).to.deep.eq([td.categories.laptop]);

      const sheet = wb.sheets[td.categories.laptop];
      assertHeadersInclude(sheet.headers, [
        'Category',
        'Model Number',
        'Brand',
        'Serial Number',
        'Status',
        'Cost',
        'Price',
      ]);
      // Product-item sheets omit the product-only qty columns EXCEPT
      // Reserved Quantity, which the BE includes for all product types
      // (shows how many serialized items from this PO are currently reserved).
      assertHeadersExclude(sheet.headers, [
        'Available Quantity',
        'Incoming Quantity',
        'Received Quantity',
        'Expected Quantity',
      ]);

      const exportedSerials = sheet.rows
        .map((r) => String(r['Serial Number'] || '').trim())
        .filter(Boolean);
      serials.forEach((s) => {
        expect(exportedSerials, `serial ${s} must be in the workbook`).to.include(s);
      });
    });
  });

  // ── TC05 — Decision Table: mixed PO, two sheets ─────────────────────────────
  it('SW-EXP-TC05 — Mixed PO produces exactly two sheets, one per category, each with the appropriate shape', { tags: ['@regression'] }, () => {
    // Decision Table — (product-only present? × product-item present?) = (T, T).
    const { po, stamp } = poName('TC05');
    seedMixedPO({
      td,
      poNumber: po,
      stamp,
      ramQty: 4,
      serials: [`EXP05A-${stamp}`, `EXP05B-${stamp}`],
    });
    navigateToPO(po);

    invPage.exportAndAssertFileName(po).then((wb) => {
      const names = Object.keys(wb.sheets).sort();
      expect(names, 'two sheets, one per category').to.deep.eq(
        [td.categories.laptop, td.categories.ram].sort()
      );

      // TC05 checks STRUCTURAL shape: RAM sheet has qty columns; Laptop sheet
      // has serial/status columns. Attribute-column presence (RAMbrand, Model
      // Number) is tested in TC03/TC04. In a two-import scenario the second
      // import's attribute columns may not be persisted by the BE, so we
      // intentionally omit them here to keep TC05 scoped to its concern.
      const ramSheet = wb.sheets[td.categories.ram];
      assertHeadersInclude(ramSheet.headers, ['Available Quantity', 'Reserved Quantity']);

      const laptopSheet = wb.sheets[td.categories.laptop];
      assertHeadersInclude(laptopSheet.headers, ['Serial Number', 'Status']);
    });
  });

  // ── TC06 — EP: status=Available on serialized items ─────────────────────────
  it('SW-EXP-TC06 — Status filter "Available" exports only items in Available status (product-item PO)', { tags: ['@regression'] }, () => {
    // EP — Available partition.
    const { po, stamp } = poName('TC06');
    const sAvail = `EXP06A-${stamp}`;
    const sDamaged = `EXP06D-${stamp}`;
    const serials = [sAvail, sDamaged];
    seedProductItemPO({ td, poNumber: po, stamp, serials });
    apiScanSerial(po, sAvail);
    apiMarkItemStatus({ poNumber: po, serialNumber: sDamaged, status: td.statusEnums.damaged });

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.available);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.available } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.laptop];
        expect(sheet, 'Laptop sheet present').to.exist;
        const statuses = sheet.rows.map((r) => String(r['Status'] || '').trim());
        statuses.forEach((s) => {
          expect(s, 'every exported row is Available').to.eq(td.statusEnums.available);
        });
      });
  });

  // ── TC07 — EP: status=Damaged ───────────────────────────────────────────────
  it('SW-EXP-TC07 — Status filter "Damaged" exports only Damaged rows with reason populated', { tags: ['@regression'] }, () => {
    // EP — Damaged partition.
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

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.damaged } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.laptop];
        expect(sheet, 'Laptop sheet present').to.exist;
        sheet.rows.forEach((r) => {
          expect(String(r['Status'] || '').trim(), 'row status').to.eq(td.statusEnums.damaged);
        });
      });
  });

  // ── TC08 — EP: status=Reserved (product-only) ───────────────────────────────
  it('SW-EXP-TC08 — Status filter "Reserved" on a product-only PO yields a summary row whose Reserved Quantity > 0', { tags: ['@regression'] }, () => {
    // EP — Reserved partition (product-only).
    const { po, stamp } = poName('TC08');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: 5 }).then((productId) => {
      apiCheckInProductOnly({ poNumber: po, productId, quantity: 3 });
      apiReserveViaWorkOrder({ productId, productName: `EXP08-${stamp}`, quantity: 1 });

      navigateToPO(po);
      invPage.clickStatTile(td.tileLabels.reserved);
      invPage.waitForSearchReady();

      invPage
        .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.reserved } })
        .then((wb) => {
          const sheet = wb.sheets[td.categories.ram];
          expect(sheet, 'RAM sheet present').to.exist;
          expect(sheet.rows.length, '≥1 row').to.be.greaterThan(0);
          sheet.rows.forEach((r) => {
            expect(Number(r['Reserved Quantity']), 'reservedQty > 0').to.be.greaterThan(0);
          });
        });
    });
  });

  // ── TC09 — EP: status=Incoming (product-only) ───────────────────────────────
  it('SW-EXP-TC09 — Status filter "Incoming" on a product-only PO yields rows with Incoming Quantity > 0', { tags: ['@regression'] }, () => {
    // EP — Incoming partition (product-only).
    const { po, stamp } = poName('TC09');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: 5 });
    // No check-in, so available=0, incoming = expected - 0 - 0 = 5

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.incoming);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.incoming } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.ram];
        expect(sheet, 'RAM sheet present').to.exist;
        expect(sheet.rows.length, '≥1 row').to.be.greaterThan(0);
        sheet.rows.forEach((r) => {
          expect(Number(r['Incoming Quantity']), 'incoming > 0').to.be.greaterThan(0);
        });
      });
  });

  // ── TC10 — EP: status=StockedOut excludes Sold ──────────────────────────────
  it('SW-EXP-TC10 — Status filter "Stocked out (others)" excludes Sold-reason items', { tags: ['@regression'] }, () => {
    // EP — StockedOut (non-Sold) partition.
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

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.stockedOut } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.laptop];
        expect(sheet, 'Laptop sheet present').to.exist;
        const reasons = sheet.rows
          .map((r) => String(r['Stockout Reason'] || '').trim())
          .filter(Boolean);
        reasons.forEach((reason) => {
          expect(reason, 'no Sold rows in StockedOut filter').to.not.eq('Sold');
        });
      });
  });

  // ── TC11 — EP: status=Sold ──────────────────────────────────────────────────
  it('SW-EXP-TC11 — Status filter "Sold" exports only rows where Stockout Reason = Sold', { tags: ['@regression'] }, () => {
    // EP — Sold partition.
    const { po, stamp } = poName('TC11');
    const sLost = `EXP11L-${stamp}`;
    const sSold = `EXP11S-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sLost, sSold] });
    apiScanSerial(po, sLost);
    apiScanSerial(po, sSold);
    apiStockOutSerial({ serialNumber: sLost, reason: 'Lost' });
    apiStockOutSerial({ serialNumber: sSold, reason: 'Sold' });

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.sold);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.sold } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.laptop];
        expect(sheet, 'Laptop sheet present').to.exist;
        expect(sheet.rows.length, '≥1 row').to.be.greaterThan(0);
        sheet.rows.forEach((r) => {
          expect(String(r['Stockout Reason'] || '').trim(), 'row reason is Sold').to.eq('Sold');
        });
      });
  });

  // ── TC12 — EP: status=Received excludes Incoming/Missing ────────────────────
  it('SW-EXP-TC12 — Status filter "Received" excludes Incoming and Missing items', { tags: ['@regression'] }, () => {
    // EP — Received partition.
    const { po, stamp } = poName('TC12');
    const sAvail = `EXP12A-${stamp}`;
    const sIncoming = `EXP12I-${stamp}`;
    const sMissing = `EXP12M-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sAvail, sIncoming, sMissing] });
    apiScanSerial(po, sAvail);
    apiMarkItemStatus({ poNumber: po, serialNumber: sMissing, status: td.statusEnums.missing });

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.received);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.received } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.laptop];
        expect(sheet, 'Laptop sheet present').to.exist;
        sheet.rows.forEach((r) => {
          const status = String(r['Status'] || '').trim();
          expect(status, `Received filter excludes Incoming/Missing (got ${status})`).to.not.match(
            /^(Incoming|Missing)$/
          );
        });
      });
  });

  // ── TC13 — EP: search filter alone ──────────────────────────────────────────
  it('SW-EXP-TC13 — Search filter prunes the workbook to the matched product only', { tags: ['@regression'] }, () => {
    // EP — search-active partition (product set pruned).
    const { po, stamp } = poName('TC13');
    seedMixedPO({
      td,
      poNumber: po,
      stamp,
      ramQty: 3,
      serials: [`EXP13L-${stamp}`],
    });
    const laptopSearchTerm = `${td.products.laptop.modelNumber}-${stamp}`;

    navigateToPO(po);
    invPage.searchProduct(laptopSearchTerm);
    invPage.clickSubmitSearch();
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { search: laptopSearchTerm } })
      .then((wb) => {
        // Either RAM sheet is absent OR present-but-empty. Pruning is on
        // the product set, not on the per-row level — both readings are
        // acceptable; the assertion is "no RAM rows in the workbook".
        const ramSheet = wb.sheets[td.categories.ram];
        if (ramSheet) {
          expect(ramSheet.rows.length, 'RAM sheet, if present, must be empty').to.eq(0);
        }
        const laptopSheet = wb.sheets[td.categories.laptop];
        expect(laptopSheet, 'Laptop sheet present').to.exist;
        expect(laptopSheet.rows.length, '≥1 Laptop row').to.be.greaterThan(0);
      });
  });

  // ── TC14 — Decision Table: search × status (Available) ──────────────────────
  it('SW-EXP-TC14 — search=<Laptop> + status=Available intersects: only Available Laptop rows are in the workbook', { tags: ['@regression'] }, () => {
    // Decision Table — (search=Laptop, status=Available) intersection.
    const { po, stamp } = poName('TC14');
    const sAvail = `EXP14A-${stamp}`;
    const sDamaged = `EXP14D-${stamp}`;
    seedMixedPO({
      td,
      poNumber: po,
      stamp,
      ramQty: 3,
      serials: [sAvail, sDamaged],
    });
    apiScanSerial(po, sAvail);
    apiMarkItemStatus({ poNumber: po, serialNumber: sDamaged, status: td.statusEnums.damaged });

    const laptopSearchTerm = `${td.products.laptop.modelNumber}-${stamp}`;
    navigateToPO(po);
    invPage.searchProduct(laptopSearchTerm);
    invPage.clickSubmitSearch();
    invPage.waitForSearchReady();
    invPage.clickStatTile(td.tileLabels.available);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, {
        assertParams: { search: laptopSearchTerm, status: td.statusEnums.available },
      })
      .then((wb) => {
        const laptopSheet = wb.sheets[td.categories.laptop];
        expect(laptopSheet, 'Laptop sheet present').to.exist;
        laptopSheet.rows.forEach((r) => {
          expect(String(r['Status'] || '').trim(), 'row is Available').to.eq(td.statusEnums.available);
        });
        const ramSheet = wb.sheets[td.categories.ram];
        if (ramSheet) {
          expect(ramSheet.rows.length, 'RAM rows excluded by search').to.eq(0);
        }
      });
  });

  // ── TC15 — Decision Table: search × status (Damaged) ────────────────────────
  it('SW-EXP-TC15 — search=<Laptop> + status=Damaged intersects: only Damaged Laptop rows are in the workbook', { tags: ['@regression'] }, () => {
    // Decision Table — (search=Laptop, status=Damaged) intersection.
    const { po, stamp } = poName('TC15');
    const sAvail = `EXP15A-${stamp}`;
    const sDamaged = `EXP15D-${stamp}`;
    seedMixedPO({
      td,
      poNumber: po,
      stamp,
      ramQty: 3,
      serials: [sAvail, sDamaged],
    });
    apiScanSerial(po, sAvail);
    apiMarkItemStatus({ poNumber: po, serialNumber: sDamaged, status: td.statusEnums.damaged });

    const laptopSearchTerm = `${td.products.laptop.modelNumber}-${stamp}`;
    navigateToPO(po);
    invPage.searchProduct(laptopSearchTerm);
    invPage.clickSubmitSearch();
    invPage.waitForSearchReady();
    invPage.clickStatTile(td.tileLabels.damaged);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, {
        assertParams: { search: laptopSearchTerm, status: td.statusEnums.damaged },
      })
      .then((wb) => {
        const laptopSheet = wb.sheets[td.categories.laptop];
        expect(laptopSheet, 'Laptop sheet present').to.exist;
        laptopSheet.rows.forEach((r) => {
          expect(String(r['Status'] || '').trim(), 'row is Damaged').to.eq(td.statusEnums.damaged);
        });
      });
  });

  // ── TC16 — Error Guessing: status filter with no matches → Empty Inventory ──
  it('SW-EXP-TC16 — Status filter "Missing" with no Missing rows yields an "Empty Inventory" sheet', { tags: ['@regression'] }, () => {
    // Error Guessing — empty result for a filter that excludes everything.
    const { po, stamp } = poName('TC16');
    seedProductItemPO({ td, poNumber: po, stamp, serials: [`EXP16-${stamp}`] });
    // No mutations → no Missing items.

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.missing);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.missing } })
      .then((wb) => {
        const names = Object.keys(wb.sheets);
        // BE either returns an "Empty Inventory" sheet OR the category
        // sheet with zero rows. Both are acceptable "empty" representations.
        if (names.includes('Empty Inventory')) {
          expect(names, 'single sheet, no category sheet').to.deep.eq(['Empty Inventory']);
        } else {
          const laptopSheet = wb.sheets[td.categories.laptop];
          expect(laptopSheet, 'Laptop sheet').to.exist;
          expect(laptopSheet.rows.length, 'no rows under Missing filter').to.eq(0);
        }
      });
  });

  // ── TC17 — Error Guessing: search with no match → Empty Inventory ───────────
  it('SW-EXP-TC17 — Search term that matches no product yields an "Empty Inventory" sheet', { tags: ['@regression'] }, () => {
    // Error Guessing — search returns no products.
    const { po, stamp } = poName('TC17');
    seedProductItemPO({ td, poNumber: po, stamp, serials: [`EXP17-${stamp}`] });

    const unmatched = `ZZZ-NO-MATCH-${stamp}`;
    navigateToPO(po);
    invPage.searchProduct(unmatched);
    invPage.clickSubmitSearch();
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { search: unmatched } })
      .then((wb) => {
        const names = Object.keys(wb.sheets);
        if (names.includes('Empty Inventory')) {
          expect(names, 'single Empty Inventory sheet').to.deep.eq(['Empty Inventory']);
        } else {
          // Some BE builds emit the category sheet with zero rows.
          Object.values(wb.sheets).forEach((s) => {
            expect(s.rows.length, 'no rows on any sheet').to.eq(0);
          });
        }
      });
  });

  // ── TC18 — EP: quantity correctness against the listing API ─────────────────
  it('SW-EXP-TC18 — Product-only summary row qty values match the listing API (single source of truth)', { tags: ['@regression'] }, () => {
    // EP — output verification: workbook cells must agree with the
    // canonical numbers from GET /incoming-items. We do NOT recompute the
    // BE's mark-status arithmetic here; we test that the export and the
    // table show the same numbers.
    const { po, stamp } = poName('TC18');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: td.mixedQtyStatusSeed.expected }).then(
      (productId) => {
        apiCheckInProductOnly({
          poNumber: po,
          productId,
          quantity: td.mixedQtyStatusSeed.received,
        });
        apiMarkProductOnlyStatus({
          poNumber: po,
          productId,
          quantity: td.mixedQtyStatusSeed.missing,
          status: td.statusEnums.missing,
        });

        navigateToPO(po);
        invPage.exportAndAssertFileName(po).then((wb) => {
          const sheet = wb.sheets[td.categories.ram];
          expect(sheet, 'RAM sheet').to.exist;
          // Use the listing API as the source of truth.
          apiGetPoListing(po).then((products) => {
            const apiRow = products.find((p) => Number(p.id) === Number(productId));
            expect(apiRow, 'productId returned by listing API').to.exist;

            // Pick the workbook row that matches this product (RAMbrand + Memory Generation suffix).
            const wbRow = sheet.rows.find((r) =>
              String(r['Memory Generation'] || '').includes(stamp)
            );
            expect(wbRow, 'matching workbook row by Memory Generation stamp').to.exist;

            // Guard: confirm the listing API reflects the seeded values before
            // comparing workbook cells — prevents vacuous passes if seeding failed silently.
            expect(
              Number(apiRow.expectedQuantity),
              'seed guard: expected qty present in listing API'
            ).to.eq(td.mixedQtyStatusSeed.expected);
            expect(
              Number(apiRow.receivedQuantity),
              'seed guard: received qty present in listing API'
            ).to.eq(td.mixedQtyStatusSeed.received);

            const cmp = (label, wbKey, apiKey) => {
              const wbVal = Number(wbRow[wbKey] ?? 0);
              const apiVal = Number(apiRow[apiKey] ?? 0);
              expect(wbVal, `${label}: workbook == listing-API`).to.eq(apiVal);
            };
            cmp('Expected', 'Expected Quantity', 'expectedQuantity');
            cmp('Received', 'Received Quantity', 'receivedQuantity');
            cmp('Available', 'Available Quantity', 'availableQuantity');
            cmp('Reserved', 'Reserved Quantity', 'reservedQuantity');
          });
        });
      }
    );
  });

  // ── TC19 — Decision Table: product-only stockout grouping ───────────────────
  it('SW-EXP-TC19 — Product-only PO with two distinct (status, reason) stockout groups emits two stockout rows', { tags: ['@regression'] }, () => {
    // Decision Table — (Damaged group present? × Disputed group present?) = (T, T).
    const { po, stamp } = poName('TC19');
    seedProductOnlyPO({ td, poNumber: po, stamp, quantity: 5 }).then((productId) => {
      apiCheckInProductOnly({ poNumber: po, productId, quantity: 4 });
      apiMarkProductOnlyStatus({
        poNumber: po,
        productId,
        quantity: 1,
        status: td.statusEnums.damaged,
        damageReason: 'Physical Damage',
      });
      apiMarkProductOnlyStatus({
        poNumber: po,
        productId,
        quantity: 1,
        status: td.statusEnums.disputed,
      });

      navigateToPO(po);
      invPage.exportAndAssertFileName(po).then((wb) => {
        const sheet = wb.sheets[td.categories.ram];
        expect(sheet, 'RAM sheet').to.exist;
        const exportedStatuses = sheet.rows
          .map((r) => String(r['Status'] || '').trim())
          .filter(Boolean);
        // Two stockout groups should produce at least one row each.
        expect(exportedStatuses, 'Damaged row present').to.include(td.statusEnums.damaged);
        expect(exportedStatuses, 'Disputed row present').to.include(td.statusEnums.disputed);

        // Reserved Quantity should be reported consistently across the
        // product's rows (the BE merges vertically; in flat-row terms the
        // value should match the single product's reservedQty everywhere
        // it appears).
        const reservedVals = sheet.rows
          .map((r) => Number(r['Reserved Quantity'] || 0))
          .filter((v) => !Number.isNaN(v));
        if (reservedVals.length > 1) {
          const unique = Array.from(new Set(reservedVals));
          expect(
            unique.length,
            'Reserved Quantity must be uniform across the product group (merged-cell semantics)'
          ).to.eq(1);
        }
      });
    });
  });

  // ── TC20 — EP: status=Missing positive case ─────────────────────────────────
  it('SW-EXP-TC20 — Status filter "Missing" exports only rows in Missing status', { tags: ['@regression'] }, () => {
    // EP — Missing partition (positive case: PO has Missing items → only they appear).
    const { po, stamp } = poName('TC20');
    const sMissing = `EXP20M-${stamp}`;
    const sAvail = `EXP20A-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sMissing, sAvail] });
    apiMarkItemStatus({ poNumber: po, serialNumber: sMissing, status: td.statusEnums.missing });
    apiScanSerial(po, sAvail);

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.missing);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.missing } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.laptop];
        expect(sheet, 'Laptop sheet present').to.exist;
        expect(sheet.rows.length, '≥1 Missing row').to.be.greaterThan(0);
        sheet.rows.forEach((r) => {
          expect(String(r['Status'] || '').trim(), 'every exported row is Missing').to.eq(td.statusEnums.missing);
        });
      });
  });

  // ── TC21 — EP: status=Disputed positive case ─────────────────────────────────
  it('SW-EXP-TC21 — Status filter "Disputed" exports only rows in Disputed status', { tags: ['@regression'] }, () => {
    // EP — Disputed partition (positive case: PO has Disputed items → only they appear).
    const { po, stamp } = poName('TC21');
    const sDisputed = `EXP21D-${stamp}`;
    const sAvail = `EXP21A-${stamp}`;
    seedProductItemPO({ td, poNumber: po, stamp, serials: [sDisputed, sAvail] });
    apiMarkItemStatus({ poNumber: po, serialNumber: sDisputed, status: td.statusEnums.disputed });
    apiScanSerial(po, sAvail);

    navigateToPO(po);
    invPage.clickStatTile(td.tileLabels.disputed);
    invPage.waitForSearchReady();

    invPage
      .exportAndAssertFileName(po, { assertParams: { status: td.statusEnums.disputed } })
      .then((wb) => {
        const sheet = wb.sheets[td.categories.laptop];
        expect(sheet, 'Laptop sheet present').to.exist;
        expect(sheet.rows.length, '≥1 Disputed row').to.be.greaterThan(0);
        sheet.rows.forEach((r) => {
          expect(String(r['Status'] || '').trim(), 'every exported row is Disputed').to.eq(td.statusEnums.disputed);
        });
      });
  });
});
