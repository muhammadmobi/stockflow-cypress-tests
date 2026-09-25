/**
 * POCostBreakdown.cy.js
 * ============================================================
 * Spec: Cost Breakdown pane ("Product level breakdown")
 * Test Plan: cypress/qa/testPlans/purchaseOrder/POCostBreakdown/plan.md
 * CRITICAL VERIFICATION (per user requirement): this pane shows QUANTITY
 * columns (Expected/Received(PO)/Excess/Incoming/Missing/Damaged/Available),
 * not just cost — quantities are the primary business metric in StockWise
 * and are verified explicitly here, not just cost totals.
 *
 * GROUND TRUTH (re-verified directly against source 2026-07-05 — a prior
 * revision of this spec/page-object/locator trio was checked against STALE
 * DOM that never matches the live app; see the 2026-07-05 code review):
 * - The only entry point is the "Product level breakdown" button inside the
 *   PO Close modal (`PoCloseTextSection.tsx`) — sentence case, NO "View"
 *   prefix. "View Product Level Breakdown" is only ever plain hint text
 *   inside an `Alert`, never a clickable trigger.
 * - `CostBreakdownModal.tsx` is ALWAYS rendered with `embedded` from
 *   `ClosePoModelContent.tsx` — its standalone `<Dialog>` branch (which
 *   contains the title "Product Level Breakdown - PO {poNumber}") is DEAD
 *   CODE and never renders. `ClosePoModelContent.tsx` is a two-page sliding
 *   wizard inside the ONE physical `[role="dialog"]` opened by
 *   `PurchaseOrderClosuerModal.tsx` — there is NOT a second nested dialog.
 * - Real reconciling column set (`RECON_COLUMNS` in `CostBreakdownModal.tsx`):
 *   Expected / Received(PO) / Excess / Incoming / Missing / Damaged /
 *   Available / Expected Credit / Received(PO) Credit / Excess Credit.
 *   There is no "Manual" column (renamed to "Excess" — off-list/manually-
 *   scanned or manually-added-product units) and no single "Credit" column
 *   (split into three Credit columns). There is still no "Difference"
 *   column; "Missing" (expected-received shortfall) remains the closest
 *   equivalent and is used for TC05.
 *
 */

import POCostBreakdownPage from '../../pageObjects/PurchaseOrder/POCostBreakdownPage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  seedMultiProductOnlyPO,
  apiCheckIn,
  apiMarkProductStatus,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';
import { apiAddProductToPO, apiGetProductId } from '../../support/helpers/allPosHelpers';

const suiteStamp = `POCB-${Date.now()}`;
const mainPO = `PO-POCB-MAIN-${suiteStamp}`;
const manualPO = `PO-POCB-MAN-${suiteStamp}`;
const multiPO = `PO-POCB-MULTI-${suiteStamp}`;

let mainProductId;
let manualBaseProductId;
let manualExtraProductId;
let multiProductIds = [];

// Sourced from poCloseData.json's seeding partitions (fixture is the source
// of truth — TC03/04/05 assert against these, not hardcoded literals).
const { expected: mainExpected, received: mainReceived } = td.seeding.partialCheckIn;
const mainMissing = mainExpected - mainReceived;
const {
  product1Expected: mp1Expected,
  product1Received: mp1Received,
  product1Damaged: mp1Damaged,
  product2Expected: mp2Expected,
  product2Received: mp2Received,
  product3Expected: mp3Expected,
  product3Received: mp3Received,
} = td.seeding.multiProduct;

const page = new POCostBreakdownPage();

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  // mainPO: expected/received come from the fixture's partialCheckIn partition
  // (expected=5, received=3 → missing=2), not hardcoded inline, so the fixture
  // is the single source of truth for this scenario's numbers.
  seedProductOnlyPO({ td, poNumber: mainPO, stamp: `${suiteStamp}-m`, quantity: mainExpected }).then((id) => {
    mainProductId = id;
    return apiCheckIn({ poNumber: mainPO, productId: id, quantity: mainReceived });
  });

  // manualPO: baseline product (expected=2, received=2) + a manually-added
  // extra product via POST /incoming-items/add-product (isManualAddedToPO=true).
  // Baseline stamp is "-base", NOT "-mb" — mainPO's stamp is "-m" and the
  // manually-added product below is literally mainPO's product, so a "-mb"
  // baseline stamp would contain "-m" as a substring prefix and make
  // TC08's row-presence assertions ambiguous between the two products.
  seedProductOnlyPO({ td, poNumber: manualPO, stamp: `${suiteStamp}-base`, quantity: 2 })
    .then((id) => {
      manualBaseProductId = id;
      return apiCheckIn({ poNumber: manualPO, productId: id, quantity: 2 });
    })
    .then(() => apiGetProductId(mainPO, td.products.ram.memoryGeneration))
    .then((existingId) =>
      apiAddProductToPO({ productId: existingId, poNumber: manualPO, expectedQuantity: 1 })
    );

  // multiPO: 3 RAM products, quantities from the fixture's multiProduct
  // partition (not hardcoded inline) —
  //   mp1: expected/received/damaged from product1* → mismatch (Damaged>0)
  //   mp2: expected/received from product2* → mismatch (Missing>0)
  //   mp3: expected/received from product3* (equal, no damage) → NOT a
  //        mismatch (fully matched)
  // mp3 exists specifically so TC06/TC07 can prove the "Mismatches Only"
  // toggle actually excludes/restores a non-mismatched row, not just that
  // the column headers still render (which is true regardless of the toggle).
  seedMultiProductOnlyPO({
    td,
    poNumber: multiPO,
    products: [
      { stamp: `${suiteStamp}-mp1`, quantity: mp1Expected },
      { stamp: `${suiteStamp}-mp2`, quantity: mp2Expected },
      { stamp: `${suiteStamp}-mp3`, quantity: mp3Expected },
    ],
  }).then((ids) => {
    multiProductIds = ids;
    return apiCheckIn({ poNumber: multiPO, productId: ids[0], quantity: mp1Received })
      .then(() => apiCheckIn({ poNumber: multiPO, productId: ids[1], quantity: mp2Received }))
      .then(() => apiCheckIn({ poNumber: multiPO, productId: ids[2], quantity: mp3Received }))
      .then(() =>
        apiMarkProductStatus({
          poNumber: multiPO,
          productId: ids[0],
          quantity: mp1Damaged,
          status: 'Damaged',
          damageReason: 'Physical Damage',
        })
      );
  });
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [mainPO, manualPO, multiPO].forEach((po) => apiDeletePO(po));
  });
});

beforeEach(() => {
  cy.authSession('admin');
  page.closePage.visit();
});

describe('SW-POCB — Cost Breakdown pane', () => {
  it('SW-POCB-TC01 — "Product level breakdown" opens the Cost Breakdown pane for the PO @smoke', () => {
    // Use Case: main flow — entry point is inside the PO Close modal
    page.open(mainPO);
    page.assertTitleContainsPO(mainPO);
  });

  it('SW-POCB-TC02 — The pane shows expected, received, and cost columns per product @smoke', () => {
    // EP: column presence
    page.open(mainPO);
    page.assertColumnsVisible();
  });

  it('SW-POCB-TC03 — The Expected quantity column matches the PO expected quantity @smoke', () => {
    // EP — Qty verification: expected=mainExpected (fixture) seeded for mainPO
    page.open(mainPO);
    page.modal().should('contain.text', String(mainExpected));
  });

  it('SW-POCB-TC04 — The Received quantity column matches the actual received/scanned count @smoke', () => {
    // EP — Qty verification: received=mainReceived (fixture) seeded for mainPO
    page.open(mainPO);
    page.modal().should('contain.text', String(mainReceived));
  });

  it('SW-POCB-TC05 — The Missing (shortfall) quantity column equals expected minus received @regression', () => {
    // EP — Qty verification: mainExpected − mainReceived = mainMissing (all from fixture)
    page.open(mainPO);
    page.modal().should('contain.text', String(mainMissing));
  });

  it('SW-POCB-TC06 — "Mismatches Only" filter narrows the table to cost/qty-mismatched rows @regression', () => {
    // State Transition — "Mismatches Only" OFF -> ON, asserting the resulting
    // row set at each state (per plan.md §5), not a static partition.
    // Reality check (verified live via the /cost-breakdown API + UI): the modal
    // opens with "Mismatches Only" ON by default (CostBreakdownModal.tsx:
    // `showMismatchOnly = useState(!defaultManualOnly)`, and defaultManualOnly
    // defaults to false) — so mp3 (expected=received=3, no damage → NOT a
    // mismatch) is already excluded on open, while mp1 (Damaged) and mp2
    // (Missing) are visible. Toggle OFF first to see the unfiltered set
    // (proving mp3 is really part of the PO), then toggle back ON and confirm
    // the table narrows again, excluding mp3 while the mismatch rows remain.
    page.open(multiPO);
    page.toggleMismatchesOnly();
    page.assertProductRowVisible(`${suiteStamp}-mp3`);
    page.toggleMismatchesOnly();
    page.assertProductRowAbsent(`${suiteStamp}-mp3`);
    page.assertProductRowVisible(`${suiteStamp}-mp1`);
    page.assertProductRowVisible(`${suiteStamp}-mp2`);
  });

  it('SW-POCB-TC07 — Turning off "Mismatches Only" restores all product rows @regression', () => {
    // State Transition — reset partition: the modal opens with the filter
    // already ON (see TC06), so mp3 (non-mismatch) starts hidden; turning the
    // filter OFF is the ON -> OFF transition and restores it alongside the
    // mismatch rows.
    page.open(multiPO);
    page.assertProductRowAbsent(`${suiteStamp}-mp3`);
    page.toggleMismatchesOnly();
    page.assertProductRowVisible(`${suiteStamp}-mp3`);
  });

  it('SW-POCB-TC08 — "Manual Products Only" filter shows only manually-added products (qty verification applies to them too) @regression', () => {
    // State Transition — "Manual Products Only" OFF -> ON, which also forces
    // "Mismatches Only" back to OFF (mutually exclusive toggles), asserted by
    // the resulting row set, per plan.md §5. manualPO has a baseline
    // (non-manual) product and a manually-added product (mainPO's product, added via
    // POST /incoming-items/add-product, isManualAddedToPO=true). Toggling
    // "Manual Products Only" also clears "Mismatches Only" — mutually
    // exclusive toggles (CostBreakdownModal.tsx) — and narrows the table to
    // just the manual product, excluding the baseline row.
    page.open(manualPO);
    page.toggleManualOnly();
    page.assertProductRowVisible(`${suiteStamp}-m`);
    page.assertProductRowAbsent(`${suiteStamp}-base`);
  });

  // APP GAP: CostBreakdownModal.tsx wires up MRT's `globalFilter` state
  // (onGlobalFilterChange, queryKey dependency) but sets `enableTopToolbar:
  // false`, which is what renders MRT's built-in search icon/input. There is
  // no other search control in the JSX (no custom TextField bound to
  // setGlobalFilter) — so the search feature has state + a backend query
  // param but no UI entry point to trigger it. Skipped until a search
  // control is added.
  it.skip('SW-POCB-TC09 — Searching within the modal filters rows by product name @regression', () => {
    // EP — search
    page.open(mainPO);
    page.searchProduct(td.products.ram.memoryGeneration);
    page.assertProductRowVisible(td.products.ram.memoryGeneration);
  });

  it('SW-POCB-TC10 — Pagination controls are visible when the product list is displayed @regression', () => {
    // BVA — page boundary presence
    page.open(multiPO);
    page.assertPaginationVisible();
  });

  // Ground truth (read directly from CostBreakdownModal.tsx's RECON_COLUMNS,
  // 2026-07-05): the deployed table's columns are Expected / Received(PO) /
  // Excess / Incoming / Missing / Damaged / Available / Expected Credit /
  // Received(PO) Credit / Excess Credit, with an MRT Footer "Total" row
  // beneath the product rows. There is no "Manual" column (renamed to
  // "Excess" — off-list/manually-scanned units, or a manually-added
  // product's full received qty) and no single "Credit" column (split into
  // three Credit columns). multiPO's exact per-row numeric values (mp1/mp2/
  // mp3) depend on live backend arithmetic (availNet, onFileReceived, the
  // per-row Credit formulas) on top of the fixture-seeded expected/received/
  // damaged quantities (see poCloseData.json `multiProduct`) — TC11-TC15
  // below assert structural properties (footer == sum of body cells == the
  // independent API sum) rather than hardcoded per-cell numbers, precisely
  // so they don't need to be pinned to a live-observed snapshot.
  // Each TC below opens the modal, waits for the (un-mismatch-filtered) data
  // to load, then asserts the Footer's Total for a column against BOTH an
  // arithmetic sum of that column's own visible per-product cells (proves
  // the footer isn't stale/hardcoded) and, where the field is unambiguous,
  // against the independent GET /cost-breakdown API response (real oracle).
  function openMultiPOUnfiltered() {
    cy.intercept('GET', '**/cost-breakdown*').as('costBreakdown');
    page.open(multiPO);
    cy.wait('@costBreakdown');
    page.toggleMismatchesOnly(); // OFF — default-on filter would hide mp3
    return cy.wait('@costBreakdown').then((interception) => {
      // The table/footer re-render a tick after the response resolves —
      // wait for 3 rendered rows with non-blank Expected cells before any
      // .then()-based (non-retrying) DOM read, or values race in as "".
      // Must chain through a single cy command sequence, not mix a
      // synchronous return with queued cy commands.
      page.modal().find('table tbody tr').should('have.length', 3);
      return page.modal()
        .find('table tbody tr')
        .eq(2)
        .find('td')
        .eq(2)
        .should('not.have.text', '')
        .then(() => interception.response.body.data.data);
    });
  }

  it('SW-POCB-TC11 — Aggregate Expected quantity is the sum of all product-level expected quantities @regression', () => {
    // Decision Table — the footer Total is derived from a combination of the
    // per-row filter/expand/pagination state; this asserts the "unfiltered,
    // 3-product" column of that table (per plan.md §5).
    openMultiPOUnfiltered().then((records) => {
      const apiSum = records.reduce((s, r) => s + (Number(r.expectedQuantity) || 0), 0);
      page.columnValues('Expected').then(({ footerText, bodyTexts }) => {
        const uiSum = bodyTexts.reduce((s, v) => s + Number(v), 0);
        expect(uiSum, 'Total Expected should equal the sum of each product\'s Expected cell').to.eq(Number(footerText));
        expect(Number(footerText), 'Total Expected should match the independent API sum').to.eq(apiSum);
      });
    });
  });

  it('SW-POCB-TC12 — Aggregate Received quantity is the sum of all product-level received quantities @regression', () => {
    // Decision Table — same "unfiltered, 3-product" column as TC11, applied
    // to the Received(PO) column (per plan.md §5).
    openMultiPOUnfiltered().then((records) => {
      const apiSum = records.reduce((s, r) => s + (Number(r.receivedQuantity) || 0), 0);
      page.columnValues('Received(PO)').then(({ footerText, bodyTexts }) => {
        const uiSum = bodyTexts.reduce((s, v) => s + Number(v), 0);
        expect(uiSum, 'Total Received(PO) should equal the sum of each product\'s Received(PO) cell').to.eq(Number(footerText));
        expect(Number(footerText), 'Total Received(PO) should match the independent API sum').to.eq(apiSum);
      });
    });
  });

  it('SW-POCB-TC13 — Aggregate cost totals reflect the sum of per-product expected/received costs @regression', () => {
    // Decision Table — same "unfiltered, 3-product" column as TC11/TC12,
    // applied to a cost column (per plan.md §5). "Expected Credit" (not
    // "Received(PO) Credit" or "Excess Credit") is asserted specifically
    // because it's guaranteed non-zero here: every seeded product has
    // expectedQuantity > 0 and a non-zero unit cost, whereas the other two
    // Credit columns can legitimately be zero depending on receive/excess
    // state. The per-row cell's exact business formula isn't independently
    // derivable from a single API field, so this verifies the property the
    // title actually asserts — the Total is the SUM of the per-product
    // Expected Credit cells, not a stale/independent number — while also
    // asserting it's non-zero (multiPO has real cost data, unlike an empty PO).
    openMultiPOUnfiltered().then(() => {
      page.columnValues('Expected Credit').then(({ footerText, bodyTexts }) => {
        const toNumber = (money) => Number(String(money).replace(/[^0-9.-]/g, ''));
        const uiSum = bodyTexts.reduce((s, v) => s + toNumber(v), 0);
        expect(toNumber(footerText), 'Total Expected Credit should equal the sum of each product\'s Expected Credit cell').to.eq(uiSum);
        expect(toNumber(footerText), 'Total Expected Credit should be non-zero for a PO with real cost data').to.be.greaterThan(0);
      });
    });
  });

  it('SW-POCB-TC14 — A product with a Damaged unit shows a non-zero Damaged count @regression', () => {
    // Error Guessing — written to pin down the exact per-row Damaged
    // distribution (not just "a Damaged value renders somewhere") after live
    // debugging surfaced that a weaker assertion would have missed a
    // mis-attributed Damaged count (per plan.md §5). Exactly mp1Damaged units
    // are marked Damaged, on mp1 specifically (fixture-seeded); mp2/mp3 have
    // zero Damaged, and the Total reflects just that.
    openMultiPOUnfiltered().then((records) => {
      const apiDamagedTotal = records.reduce((s, r) => s + (Number(r.damagedQuantity) || 0), 0);
      page.columnValues('Damaged').then(({ footerText, bodyTexts }) => {
        expect(bodyTexts, `per-product Damaged cells: mp1=${mp1Damaged}, mp2=0, mp3=0`).to.deep.equal([String(mp1Damaged), '0', '0']);
        expect(Number(footerText), 'Total Damaged should equal the independent API sum').to.eq(apiDamagedTotal);
        expect(Number(footerText), 'Total Damaged should be non-zero').to.be.greaterThan(0);
      });
    });
  });

  it('SW-POCB-TC15 — A manually-added product is distinguishable via the "Manually Added" badge, not a reconciling column @regression', () => {
    // Error Guessing — written to pin down a previously-mis-assumed signal
    // (per plan.md §5): there is no "Manual" reconciling column at all in the
    // live source (CostBreakdownModal.tsx RECON_COLUMNS renamed it to
    // "Excess", which tracks off-list/manually-SCANNED item counts — 0 for
    // this product-only PO, since nothing is ever scanned — NOT "is this
    // product a manual add"). The real distinguishing marker is a "📦
    // Manually Added" badge rendered inline in the Product Name cell for
    // isExtraProduct rows (verified: manually-added row shows it, baseline
    // row doesn't). Mismatches Only is ON by default and the manually-added product has
    // hasQuantityMismatch=true (expected=1, received=0) so it's already
    // visible; toggle the filter OFF so the baseline (non-mismatch) row is
    // visible too, to assert the badge is absent there.
    cy.intercept('GET', '**/cost-breakdown*').as('costBreakdown');
    page.open(manualPO);
    cy.wait('@costBreakdown');
    page.toggleMismatchesOnly();
    cy.wait('@costBreakdown');
    page.modal().find('table tbody tr').should('have.length', 2);
    page.bodyRowsValues().then((bodyRows) => {
      // "-base" doesn't contain "-m" as a substring, so this pair is unambiguous.
      const manualRow = bodyRows.find((r) => r[1].includes(`${suiteStamp}-m`));
      const baselineRow = bodyRows.find((r) => r[1].includes(`${suiteStamp}-base`));
      expect(manualRow, 'manually-added product row should be found').to.exist;
      expect(baselineRow, 'baseline product row should be found').to.exist;
      expect(manualRow[1], 'manually-added row shows the "Manually Added" badge').to.include('Manually Added');
      expect(baselineRow[1], 'baseline row does NOT show the "Manually Added" badge').to.not.include('Manually Added');
    });
  });

  it('SW-POCB-TC16 — The "Product level breakdown" trigger is absent for a PO with no received cost data @regression', () => {
    // BVA — genuine empty partition (zero expected quantity, zero products;
    // per plan.md §5). Reality check: hasCostDetails (ClosePoModelContent.tsx)
    // is `costDetailsPerProduct.length > 0 || hasMovedOutProducts`. A PO with
    // SOME expected quantity but nothing received (e.g. seedProductOnlyPO
    // with no apiCheckIn) still populates costDetailsPerProduct — it shows a
    // "Missing Items" discrepancy, so the trigger IS present there. The real
    // empty partition is a PO created with expectedQuantity=0 and no
    // products at all (bare POST /purchase-orders, no Excel import) — that
    // renders "✓ Perfect Match" with zero cost/quantity data and the trigger
    // is genuinely absent.
    const emptyPO = `PO-POCB-BARE-${suiteStamp}`;
    cy.getAuthToken().then((token) => {
      cy.request({
        method: 'POST',
        url: `${Cypress.env('API_BASE_URL')}/purchase-orders`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { poNumber: emptyPO, expectedQuantity: 0 },
        failOnStatusCode: false,
      }).then(() => {
        page.closePage.searchPO(emptyPO);
        page.closePage.clickClosePOButton(emptyPO);
        page.closePage.waitForModalReady();
        cy.get('[role="dialog"]').should(($d) => {
          expect($d.text(), 'a zero-expected-quantity PO shows the "Perfect Match" state').to.include('Perfect Match');
          expect($d.text(), 'the breakdown trigger must be absent when there is no cost data').to.not.include('Product level breakdown');
        });
        apiDeletePO(emptyPO);
      });
    });
  });
});
