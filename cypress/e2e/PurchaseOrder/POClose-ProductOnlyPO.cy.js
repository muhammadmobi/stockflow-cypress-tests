/**
 * POClose-ProductOnlyPO.cy.js
 * ============================================================
 * Spec: PO Close modal — product-only PO scenarios (TC01–TC33, M1–M10)
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (SW-POC-PRO)
 * Page Object: cypress/pageObjects/PurchaseOrder/POClosePage.js
 *
 * Seeding strategy:
 *   - partialPO:  expected=5, received=3 → Quantity Mismatch (main reusable PO)
 *   - perfectPO:  expected=4, received=4 → Perfect Match
 *   - overPO:     expected=3, received=5 → Quantity Mismatch (Extras)
 *   - closePO:    expected=4, received=4 → used for TC13 (state transition close)
 *   - alreadyClosedPO: seeded + closed before tests → TC14 (no Close PO button)
 *   - statusPO:   expected=5, received=3, 1 Damaged + 1 Disputed → TC15
 *   - multi3PO:   3 RAM products → TC16/TC17/TC18
 *   - M4–M10: dedicated POs for the "Total Cost/Quantities Calculation" card
 *     decision table (ReconciliationSection.tsx) — each has a base line
 *     (expected=2, received=2 unless noted) plus a manually-added product
 *     (via apiAddProductToPO, minted on its own disposable "-SRC" PO first
 *     since add-product rejects a productId already on the target PO). See
 *     the M1–M10 describe block below for the full decision table.
 *   All POs deleted in after().
 *
 */

import POClosePage from '../../pageObjects/PurchaseOrder/POClosePage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  seedMultiProductOnlyPO,
  apiCheckIn,
  apiMarkProductStatus,
  apiClosePO,
  apiDeletePO,
  apiGetCheckStatus,
} from '../../support/helpers/poCloseHelpers';
import { apiAddProductToPO } from '../../support/helpers/allPosHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';
import {
  apiSetGeneralConfigFlags,
  apiGetGeneralConfigFlag,
} from '../../support/helpers/generalConfigApiHelpers';

// Derived from the fixture (not a re-hardcoded literal) so the decision-table math below
// stays correct if td.products.ram.cost ever changes.
const RAM_UNIT_COST = Number(td.products.ram.cost);

const suiteStamp    = `PRO-${Date.now()}`;
const partialPO     = `PO-POC-PRO-PAR-${suiteStamp}`;
const perfectPO     = `PO-POC-PRO-PFT-${suiteStamp}`;
const overPO        = `PO-POC-PRO-OVR-${suiteStamp}`;
const closePO       = `PO-POC-PRO-CLS-${suiteStamp}`;
const alreadyClosedPO = `PO-POC-PRO-ACL-${suiteStamp}`;
const statusPO      = `PO-POC-PRO-STA-${suiteStamp}`;
const multi3PO      = `PO-POC-PRO-M3-${suiteStamp}`;

// ── "Total Cost/Quantities Calculation" card decision-table POs (M4–M10) ────
// Each target PO has a base line (expected=2, received=2 unless noted) plus a
// manually-added product minted on its own "-SRC" disposable PO first.
const manualPureExcessPO      = `PO-POC-PRO-M4-${suiteStamp}`;
const manualPureExcessSrcPO   = `PO-POC-PRO-M4-SRC-${suiteStamp}`;
const manualNotReceivedPO     = `PO-POC-PRO-M5-${suiteStamp}`;
const manualNotReceivedSrcPO  = `PO-POC-PRO-M5-SRC-${suiteStamp}`;
const manualExactPO           = `PO-POC-PRO-M6-${suiteStamp}`;
const manualExactSrcPO        = `PO-POC-PRO-M6-SRC-${suiteStamp}`;
const manualPartialPO         = `PO-POC-PRO-M7-${suiteStamp}`;
const manualPartialSrcPO      = `PO-POC-PRO-M7-SRC-${suiteStamp}`;
const manualOverExpectedPO    = `PO-POC-PRO-M8-${suiteStamp}`;
const manualOverExpectedSrcPO = `PO-POC-PRO-M8-SRC-${suiteStamp}`;
// M9: original line has a shortfall (expected=5, received=3, mirrors partialPO)
const shortfallPlusManualPO    = `PO-POC-PRO-M9-${suiteStamp}`;
const shortfallPlusManualSrcPO = `PO-POC-PRO-M9-SRC-${suiteStamp}`;
// M10: original line is over-received (expected=3, received=5, mirrors overPO)
// AND a separate literal manual product is also added — proves the Excess
// row sums BOTH sources, not just one.
const overPlusManualPO    = `PO-POC-PRO-M10-${suiteStamp}`;
const overPlusManualSrcPO = `PO-POC-PRO-M10-SRC-${suiteStamp}`;

let partialProductId;
let perfectProductId;
let overProductId;
let closeProductId;
let alreadyClosedProductId;
let statusProductId;
let multi3ProductIds = [];

// Captured original value of the General Config "allow exceed expected quantity"
// toggle so after() can restore it. The over-receipt scenarios below (overPO, M4,
// M8, M10) stock in MORE than a product's expected quantity, which the backend
// rejects with a 400 ("Exceeding the expected quantity is disabled in General
// Config") unless this toggle is ON. It happens to be ON in QA (where this spec
// was authored) but is OFF on other environments (e.g. stage), so the spec must
// enable it explicitly rather than assume it — mirroring the enablePoForDamaging /
// enablePoForStockOut config-toggle pattern used elsewhere in the suite.
let originalAllowExceedExpectedQuantity;

const page = new POClosePage();

// ── Suite setup ───────────────────────────────────────────────────────────────

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  // Enable over-receipt for the whole suite (see note above), capturing the
  // original value first so after() can restore it.
  apiGetGeneralConfigFlag('allowExceedExpectedQuantity').then((val) => {
    originalAllowExceedExpectedQuantity = val;
  });
  apiSetGeneralConfigFlags({ allowExceedExpectedQuantity: true });

  // partialPO: expected=5, received=3
  seedProductOnlyPO({ td, poNumber: partialPO, stamp: `${suiteStamp}-p`, quantity: 5 })
    .then((id) => {
      partialProductId = id;
      return apiCheckIn({ poNumber: partialPO, productId: id, quantity: 3 });
    });

  // perfectPO: expected=4, received=4
  seedProductOnlyPO({ td, poNumber: perfectPO, stamp: `${suiteStamp}-pf`, quantity: 4 })
    .then((id) => {
      perfectProductId = id;
      return apiCheckIn({ poNumber: perfectPO, productId: id, quantity: 4 });
    });

  // overPO: expected=3, received=5 (over-received)
  seedProductOnlyPO({ td, poNumber: overPO, stamp: `${suiteStamp}-ov`, quantity: 3 })
    .then((id) => {
      overProductId = id;
      return apiCheckIn({ poNumber: overPO, productId: id, quantity: 5 });
    });

  // closePO: used only for TC13 (close action)
  seedProductOnlyPO({ td, poNumber: closePO, stamp: `${suiteStamp}-cl`, quantity: 4 })
    .then((id) => {
      closeProductId = id;
      return apiCheckIn({ poNumber: closePO, productId: id, quantity: 4 });
    });

  // alreadyClosedPO: seeded + fully received; TC14 performs the close and verifies button absence
  seedProductOnlyPO({ td, poNumber: alreadyClosedPO, stamp: `${suiteStamp}-acl`, quantity: 3 })
    .then((id) => {
      alreadyClosedProductId = id;
      return apiCheckIn({ poNumber: alreadyClosedPO, productId: id, quantity: 3 });
    });

  // statusPO: expected=5, received=3, 1 Damaged + 1 Disputed
  seedProductOnlyPO({ td, poNumber: statusPO, stamp: `${suiteStamp}-st`, quantity: 5 })
    .then((id) => {
      statusProductId = id;
      return apiCheckIn({ poNumber: statusPO, productId: id, quantity: 3 });
    })
    .then(() => {
      return apiMarkProductStatus({
        poNumber: statusPO,
        productId: statusProductId,
        quantity: 1,
        status: 'Damaged',
        damageReason: 'Physical Damage',
      });
    })
    .then(() => {
      return apiMarkProductStatus({
        poNumber: statusPO,
        productId: statusProductId,
        quantity: 1,
        status: 'Disputed',
      });
    });

  // multi3PO: 3 RAM products with different quantities
  const m3Products = [
    { stamp: `${suiteStamp}-m3a`, quantity: 5 },
    { stamp: `${suiteStamp}-m3b`, quantity: 8 },
    { stamp: `${suiteStamp}-m3c`, quantity: 4 },
  ];
  seedMultiProductOnlyPO({ td, poNumber: multi3PO, products: m3Products })
    .then((ids) => {
      multi3ProductIds = ids;
      // Check in partial amounts: product1=3/5, product2=8/8 (full), product3=2/4
      return apiCheckIn({ poNumber: multi3PO, productId: ids[0], quantity: 3 });
    })
    .then(() => apiCheckIn({ poNumber: multi3PO, productId: multi3ProductIds[1], quantity: 8 }))
    .then(() => apiCheckIn({ poNumber: multi3PO, productId: multi3ProductIds[2], quantity: 2 }));

  // ── M4–M10 seeding ────────────────────────────────────────────────────────
  // Helper: seed a base line (expected=2, received=2) on `po`, then mint a
  // fresh productId on `srcPo` and add it as a manual product to `po` with the
  // given expectedQuantity, then (optionally) check in `receivedQty` of it.
  const seedManualScenario = (po, srcPo, stamp, { manualExpectedQty, manualReceivedQty }) =>
    seedProductOnlyPO({ td, poNumber: po, stamp: `${stamp}-base`, quantity: 2 })
      .then((id) => apiCheckIn({ poNumber: po, productId: id, quantity: 2 }))
      .then(() => seedProductOnlyPO({ td, poNumber: srcPo, stamp: `${stamp}-src`, quantity: 1 }))
      .then((manualId) =>
        apiAddProductToPO({ productId: manualId, poNumber: po, expectedQuantity: manualExpectedQty, cost: td.products.ram.cost })
          .then(() => (manualReceivedQty > 0 ? apiCheckIn({ poNumber: po, productId: manualId, quantity: manualReceivedQty }) : null))
      );

  // M4: base fully received + manual pure excess (expectedQuantity=0, received=3)
  seedManualScenario(manualPureExcessPO, manualPureExcessSrcPO, `${suiteStamp}-m4`, { manualExpectedQty: 0, manualReceivedQty: 3 });

  // M5: base fully received + manual not yet received (expectedQuantity=3, received=0)
  seedManualScenario(manualNotReceivedPO, manualNotReceivedSrcPO, `${suiteStamp}-m5`, { manualExpectedQty: 3, manualReceivedQty: 0 });

  // M6: base fully received + manual received exactly as expected (3/3)
  seedManualScenario(manualExactPO, manualExactSrcPO, `${suiteStamp}-m6`, { manualExpectedQty: 3, manualReceivedQty: 3 });

  // M7: base fully received + manual partially received (2 of 5 expected)
  seedManualScenario(manualPartialPO, manualPartialSrcPO, `${suiteStamp}-m7`, { manualExpectedQty: 5, manualReceivedQty: 2 });

  // M8: base fully received + manual over-received beyond its own expected (5 of 2 expected)
  seedManualScenario(manualOverExpectedPO, manualOverExpectedSrcPO, `${suiteStamp}-m8`, { manualExpectedQty: 2, manualReceivedQty: 5 });

  // M9 (interaction): base line shortfall (expected=5, received=3) + manual received exactly (2/2)
  seedProductOnlyPO({ td, poNumber: shortfallPlusManualPO, stamp: `${suiteStamp}-m9-base`, quantity: 5 })
    .then((id) => apiCheckIn({ poNumber: shortfallPlusManualPO, productId: id, quantity: 3 }))
    .then(() => seedProductOnlyPO({ td, poNumber: shortfallPlusManualSrcPO, stamp: `${suiteStamp}-m9-src`, quantity: 1 }))
    .then((manualId) =>
      apiAddProductToPO({ productId: manualId, poNumber: shortfallPlusManualPO, expectedQuantity: 2, cost: td.products.ram.cost })
        .then(() => apiCheckIn({ poNumber: shortfallPlusManualPO, productId: manualId, quantity: 2 }))
    );

  // M10 (interaction): base line over-received (expected=3, received=5, no manual on that
  // line) + a SEPARATE literal manual product (pure excess, received=2) — proves the Excess
  // row sums both the reclassified PO-file over-receipt AND the literal manual product.
  seedProductOnlyPO({ td, poNumber: overPlusManualPO, stamp: `${suiteStamp}-m10-base`, quantity: 3 })
    .then((id) => apiCheckIn({ poNumber: overPlusManualPO, productId: id, quantity: 5 }))
    .then(() => seedProductOnlyPO({ td, poNumber: overPlusManualSrcPO, stamp: `${suiteStamp}-m10-src`, quantity: 1 }))
    .then((manualId) =>
      apiAddProductToPO({ productId: manualId, poNumber: overPlusManualPO, expectedQuantity: 0, cost: td.products.ram.cost })
        .then(() => apiCheckIn({ poNumber: overPlusManualPO, productId: manualId, quantity: 2 }))
    );
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [
      partialPO, perfectPO, overPO, closePO, alreadyClosedPO, statusPO, multi3PO,
      manualPureExcessPO, manualPureExcessSrcPO,
      manualNotReceivedPO, manualNotReceivedSrcPO,
      manualExactPO, manualExactSrcPO,
      manualPartialPO, manualPartialSrcPO,
      manualOverExpectedPO, manualOverExpectedSrcPO,
      shortfallPlusManualPO, shortfallPlusManualSrcPO,
      overPlusManualPO, overPlusManualSrcPO,
    ].forEach((po) => apiDeletePO(po));
  });
  // Restore the "allow exceed expected quantity" toggle to its original value.
  // undefined (never-set) is semantically equivalent to disabled, so restoring
  // to `false` in that case is faithful to the original behaviour.
  apiSetGeneralConfigFlags({
    allowExceedExpectedQuantity: originalAllowExceedExpectedQuantity === true,
  });
});

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  cy.authSession('admin');
  page.visit();
});

// ── Test Cases ────────────────────────────────────────────────────────────────

describe('SW-POC-PRO — Product-Only PO close modal', () => {
  it('SW-POC-PRO-TC01 — Clicking "Close PO" opens the PO Close modal', { tags: ["@smoke"] }, () => {
    // Use Case: admin selects a PO from the list and triggers close modal
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertModalOpen();
    page.assertModalTitle('Close Purchase Order');
  });

  it('SW-POC-PRO-TC02 — Verdict card shows "Cost & Quantity Mismatch" when received qty is less than expected', { tags: ["@smoke"] }, () => {
    // EP: received (3) < expected (5) → cost and qty both short → "Cost & Quantity Mismatch"
    // (shortfall in qty always produces a proportional cost shortfall when unit_cost > 0)
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertVerdictCostQtyMismatch();
  });

  it('SW-POC-PRO-TC03 — Verdict card shows "Perfect Match" when received equals expected', { tags: ["@regression"] }, () => {
    // EP: received (4) = expected (4) → Perfect Match partition
    page.searchPO(perfectPO);
    page.clickClosePOButton(perfectPO);
    page.waitForModalReady();
    page.assertVerdictPerfectMatch();
  });

  it('SW-POC-PRO-TC04 — Quantity Breakdown shows correct expected quantity', { tags: ["@smoke"] }, () => {
    // EP: modal quantity breakdown expected = seeded expected qty (5). Scoped to the
    // "Original Products Quantity" card's own "Expected:" row and asserted as the exact value —
    // a bare dialog-wide `contain.text('5')` would also pass if the field showed any other
    // coincidental '5' (a cost digit, PO number digit, pagination footer, etc.), so it never
    // actually proved the expected quantity was correct.
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertQuantityBreakdownVisible();
    page.assertQuantityExpected(5);
  });

  it('SW-POC-PRO-TC05 — Quantity Breakdown shows correct received quantity matching what was stocked in', { tags: ["@smoke"] }, () => {
    // EP: received qty in breakdown matches check-in qty (3). Scoped to the exact
    // "Received (PO):" row value — see TC04 for why an unscoped bare-digit match is meaningless.
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertQuantityBreakdownVisible();
    page.assertQuantityReceived(3);
  });

  it('SW-POC-PRO-TC06 — Quantity Breakdown Missing count equals expected minus received when short', { tags: ["@regression"] }, () => {
    // EP: 5 expected, 3 received → Missing: 2
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertMissingCount(2);
  });

  it('SW-POC-PRO-TC07 — Quantity Breakdown shows zero Missing when received equals expected', { tags: ["@regression"] }, () => {
    // BVA (lower = 0): perfect match PO → Missing: 0 (or absent)
    page.searchPO(perfectPO);
    page.clickClosePOButton(perfectPO);
    page.waitForModalReady();
    page.assertZeroMissing();
  });

  it('SW-POC-PRO-TC08 — Quantity Breakdown Extras count equals units received above expected', { tags: ["@regression"] }, () => {
    // EP: 5 received, 3 expected → Excess (over-received): 2
    page.searchPO(overPO);
    page.clickClosePOButton(overPO);
    page.waitForModalReady();
    page.assertExtrasCount(2);
  });

  it('SW-POC-PRO-TC09 — Quantity Breakdown shows zero Extras when received does not exceed expected', { tags: ["@regression"] }, () => {
    // BVA (lower = 0): partial PO received 3 out of 5 → no extras
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertZeroExtras();
  });

  it('SW-POC-PRO-TC10 — Cost Breakdown shows correct expected cost per product', { tags: ["@regression"] }, () => {
    // EP: cost breakdown card is rendered; expected cost = unit_cost × expected_qty
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertCostBreakdownCardVisible();
  });

  it('SW-POC-PRO-TC11 — Cost Breakdown shows correct received and expected cost per product', { tags: ["@regression"] }, () => {
    // EP: received cost=$225 (3×$75), expected cost=$375 (5×$75); both shown in "Original Products Cost"
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertCostBreakdownCardVisible();
    cy.get('[role="dialog"]').should('contain.text', '$375.00');
    cy.get('[role="dialog"]').should('contain.text', '$225.00');
  });

  it('SW-POC-PRO-TC12 — Cost Breakdown shows correct cost difference (expected minus received)', { tags: ["@regression"] }, () => {
    // EP: difference = received cost − expected cost = $225 − $375 = −$150
    // Scoped to the "Original Products Cost" card specifically (page.assertCostDifference) —
    // "Original Products Cost" and "Original Products Quantity" are both instances of the
    // same shared BreakdownCard component and both render the literal "Difference:" label,
    // so an unscoped dialog-wide lookup would be ambiguous between the two.
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertCostBreakdownCardVisible();
    page.assertCostDifference('-$150.00');
  });

  it('SW-POC-PRO-TC29 — Quantity Breakdown shows correct quantity difference (received minus expected)', { tags: ["@regression"] }, () => {
    // EP: difference = received qty − expected qty = 3 − 5 = −2, in the "Original Products
    // Quantity" card (distinct from TC12's cost-card Difference row — see page.assertCostDifference
    // for why the two need separate, explicitly-scoped assertions rather than a shared
    // unscoped lookup).
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertQuantityBreakdownVisible();
    page.assertQuantityDifference(-2);
  });

  it('SW-POC-PRO-TC30 — Quantity Breakdown Difference stays zero (not positive) on an over-received PO because the surplus is reclassified as Excess', () => {
    // BVA (upper/over-received partition) — corrected after a live-DOM check disproved the
    // original assumption here that Difference would read "+2" on overPO: the "Original
    // Products Quantity" card's own Received (PO) is CAPPED at Expected (PoCloseTextSection.tsx
    // reads a pre-capped `originalReceivedQuantity`, not the raw received total), so
    // Received=3, Expected=3 → Difference=0 even though 5 units were actually received. The
    // surplus 2 units are reported separately as "Excess Received" in the "Total Quantities
    // Calculation" card (ReconciliationSection.tsx, asserted via assertQtyCalcCard) — a
    // regression that computed Difference from the raw (uncapped) received total instead would
    // wrongly show "+2" here, which this test would catch.
    page.searchPO(overPO);
    page.clickClosePOButton(overPO);
    page.waitForModalReady();
    page.assertQuantityBreakdownVisible();
    page.assertQuantityDifference(0);
    page.assertQtyCalcCard({ originalReceived: 3, excessReceived: 2, originalExpected: 3 });
  });

  it('SW-POC-PRO-TC31 — Quantity Breakdown Difference is zero for a Perfect Match PO', { tags: ["@regression"] }, () => {
    // BVA (boundary = 0): perfectPO expected=4, received=4 → Difference = 0 (rendered as the
    // bare digit '0', no "+" prefix and no sign). Completes the negative/zero/positive
    // partition set for the Quantity Difference row alongside TC29 (negative) and TC30 (positive).
    page.searchPO(perfectPO);
    page.clickClosePOButton(perfectPO);
    page.waitForModalReady();
    page.assertQuantityBreakdownVisible();
    page.assertQuantityDifference(0);
  });

  it('SW-POC-PRO-TC32 — Cost Breakdown Difference stays zero (not positive) on an over-received PO because the surplus cost is reclassified as Excess', () => {
    // BVA (upper/over-received partition) — same capping behavior as TC30, on the cost side:
    // "Original Products Cost" Received (PO) is capped at Expected cost (3×$75=$225.00 both),
    // so Difference=$0.00 even though $375.00 (5×$75) was actually received. The surplus
    // $150.00 (2×$75) is reported separately as "Excess Cost Received" in the "Total Cost
    // Calculation" card, asserted via assertCostCalcCard.
    page.searchPO(overPO);
    page.clickClosePOButton(overPO);
    page.waitForModalReady();
    page.assertCostBreakdownCardVisible();
    page.assertCostDifference('$0.00');
    page.assertCostCalcCard({ originalReceived: 3 * RAM_UNIT_COST, excessReceived: 2 * RAM_UNIT_COST, originalExpected: 3 * RAM_UNIT_COST });
  });

  it('SW-POC-PRO-TC33 — Cost Breakdown Difference is zero for a Perfect Match PO', { tags: ["@regression"] }, () => {
    // BVA (boundary = 0): perfectPO expected cost=4×$75=$300.00, received cost=$300.00 →
    // Difference = $0.00 (no "-" and no "+" prefix). Completes the negative/zero/positive
    // partition set for the Cost Difference row alongside TC12 (negative) and TC32 (positive).
    page.searchPO(perfectPO);
    page.clickClosePOButton(perfectPO);
    page.waitForModalReady();
    page.assertCostBreakdownCardVisible();
    page.assertCostDifference('$0.00');
  });

  it('SW-POC-PRO-TC13 — Successfully closing a product-only PO changes its status to "Closed"', { tags: ["@smoke"] }, () => {
    // State Transition: Open → Closed
    page.searchPO(closePO);
    page.clickClosePOButton(closePO);
    page.waitForModalReady();
    page.submitClosePO();
    page.searchPO(closePO);
    page.assertRowStatus(closePO, td.listPage.closedStatus);
  });

  it('SW-POC-PRO-TC14 — After closing a PO, the "Close PO" button is disabled on that row', { tags: ["@regression"] }, () => {
    // State Transition: Open → Closed
    // FE renders the Close PO button in all states but sets disabled={status==='Closed'}.
    page.searchPO(alreadyClosedPO);
    page.clickClosePOButton(alreadyClosedPO);
    page.waitForModalReady();
    page.submitClosePO();
    page.searchPO(alreadyClosedPO);
    page.assertClosePOButtonDisabled(alreadyClosedPO);
  });

  it('SW-POC-PRO-TC15 — Qty-level Damaged/Disputed mark units as received; Status Issues absent for product-only PO', { tags: ["@regression"] }, () => {
    // EP (product-only behavior): quantity-level Damaged/Disputed (via mark-status productIdsArray)
    // are counted as "received" by the backend. statusPO: expected=5, check-in=3,
    // +1 Damaged +1 Disputed via mark-status from the incoming pool → 5/5 received = "Perfect Match".
    // Status Issues section only renders for serialized items (Items table) — never for product-only POs.
    page.searchPO(statusPO);
    page.clickClosePOButton(statusPO);
    page.waitForModalReady();
    page.assertVerdictPerfectMatch();
    cy.get('[role="dialog"]').should('not.contain.text', 'Status Issues');
  });

  it('SW-POC-PRO-TC16 — Quantity Breakdown shows a separate row per product when a PO has 3 product-only products', { tags: ["@regression"] }, () => {
    // EP (multi-product): 3 RAM products with different expected/received qtys → 3 rows in the
    // Product Level Breakdown table. Asserted per-row via the product's own stamp so each row's
    // Expected/Received is checked against its actual seeded value — a bare dialog-wide
    // `contain.text('5')`/`'8'`/`'4'` only proves those digits appear SOMEWHERE (cost values, PO
    // number, pagination footer all contain digits too), not that each product's row is correct.
    // Seeded: product1 expected=5 received=3, product2 expected=8 received=8 (Perfect Match),
    // product3 expected=4 received=2. The breakdown table's "Mismatches Only" filter defaults to
    // ON and hides Perfect Match rows, so it must be turned off first to see product2's row too.
    page.searchPO(multi3PO);
    page.clickClosePOButton(multi3PO);
    page.waitForModalReady();
    page.assertQuantityBreakdownVisible();
    page.clickViewProductLevelBreakdown();
    page.disableMismatchesOnlyFilter();
    page.assertProductRowQuantities(`${suiteStamp}-m3a`, { expected: 5, received: 3 });
    page.assertProductRowQuantities(`${suiteStamp}-m3b`, { expected: 8, received: 8 });
    page.assertProductRowQuantities(`${suiteStamp}-m3c`, { expected: 4, received: 2 });
  });

  it('SW-POC-PRO-TC17 — Missing count sums shortfalls across multiple product-only products when some are partially received', { tags: ["@regression"] }, () => {
    // Decision Table: product1 missing=2, product2 missing=0, product3 missing=2 → total missing=4
    page.searchPO(multi3PO);
    page.clickClosePOButton(multi3PO);
    page.waitForModalReady();
    // Total missing: (5-3) + (8-8) + (4-2) = 2 + 0 + 2 = 4
    page.assertMissingCount(4);
  });

  it('SW-POC-PRO-TC18 — Verdict shows "Cost & Quantity Mismatch" when any product in a multi-product PO is received short', { tags: ["@regression"] }, () => {
    // Decision Table: product1 short=2, product3 short=2 → both qty and cost mismatch overall
    page.searchPO(multi3PO);
    page.clickClosePOButton(multi3PO);
    page.waitForModalReady();
    page.assertVerdictCostQtyMismatch();
  });
});

// ── "Total Cost/Quantities Calculation" cards — manual/original decision table ──
// (ReconciliationSection.tsx). Since the "Original" (non-manual) and "Excess/Manual
// Expected" buckets are computed independently and only combined in the final linear
// Vendor Credit formula, this is a decision table (every condition true/false once,
// plus the interaction rows TC27/TC28) rather than a full cross-product of every state.
describe('SW-POC-PRO — Total Cost/Quantities Calculation cards (manual × original decision table)', () => {
  it('SW-POC-PRO-TC19 — Baseline: fully received, no manual product → Excess/Manual Expected rows both hidden', { tags: ["@regression"] }, () => {
    // Decision Table (row 1/10): hasManual=F, excess=F, manualExpected=F → both conditional rows hidden.
    page.searchPO(perfectPO);
    page.clickClosePOButton(perfectPO);
    page.waitForModalReady();
    page.assertCostCalcCard({ originalReceived: 4 * RAM_UNIT_COST, originalExpected: 4 * RAM_UNIT_COST });
    page.assertQtyCalcCard({ originalReceived: 4, originalExpected: 4 });
  });

  it('SW-POC-PRO-TC20 — Shortfall, no manual product → Excess/Manual Expected rows both hidden, Original Received < Expected', { tags: ["@regression"] }, () => {
    // Decision Table (row 2/10): same F/F/F condition set as TC19, but with a shortfall on the
    // original line — proves the conditional rows stay hidden regardless of the original bucket's
    // own value (shortfall vs. exact match).
    page.searchPO(partialPO);
    page.clickClosePOButton(partialPO);
    page.waitForModalReady();
    page.assertCostCalcCard({ originalReceived: 3 * RAM_UNIT_COST, originalExpected: 5 * RAM_UNIT_COST });
    page.assertQtyCalcCard({ originalReceived: 3, originalExpected: 5 });
  });

  it('SW-POC-PRO-TC21 — Over-received PO-file line, no literal manual product → Excess row appears, Manual Expected stays hidden', { tags: ["@regression"] }, () => {
    // Decision Table (row 3/10): hasManual=F but excess=T (reclassified PO-file over-receipt) —
    // proves Excess can trigger purely from a PO-file over-receipt reclassification, with no
    // manually-added product at all. Values cross-checked against the live oracle rather than
    // hand-derived, since the reclassification magnitude is an internal detail.
    page.searchPO(overPO);
    page.clickClosePOButton(overPO);
    page.waitForModalReady();
    apiGetCheckStatus(overPO).then((status) => {
      const excessCost = status?.manualReceivedCost ?? 0;
      const excessQty  = status?.manualReceivedQuantity ?? 0;
      expect(excessCost, 'oracle excess cost > 0').to.be.greaterThan(0);
      expect(excessQty, 'oracle excess qty > 0').to.be.greaterThan(0);
      page.assertCostCalcCard({
        originalReceived: status?.originalReceivedCost ?? 0,
        excessReceived: excessCost,
        originalExpected: status?.originalExpectedCost ?? 0,
      });
      page.assertQtyCalcCard({
        originalReceived: status?.originalReceivedQuantity ?? 0,
        excessReceived: excessQty,
        originalExpected: status?.originalExpectedQuantity ?? 0,
      });
    });
  });

  it('SW-POC-PRO-TC22 — Manual product added with expectedQuantity=0 (pure excess) → Excess appears, Manual Expected stays hidden', { tags: ["@regression"] }, () => {
    // Decision Table (row 4/10): hasManual=T, excess=T (manualExpected=0), manualExpected row=F.
    page.searchPO(manualPureExcessPO);
    page.clickClosePOButton(manualPureExcessPO);
    page.waitForModalReady();
    page.assertCostCalcCard({ originalReceived: 2 * RAM_UNIT_COST, excessReceived: 3 * RAM_UNIT_COST, originalExpected: 2 * RAM_UNIT_COST });
    page.assertQtyCalcCard({ originalReceived: 2, excessReceived: 3, originalExpected: 2 });
  });

  it('SW-POC-PRO-TC23 — Manual product added but not yet received → Manual Expected appears, Excess stays hidden', { tags: ["@regression"] }, () => {
    // Decision Table (row 5/10): hasManual=T, received=0 so excess row=F, manualExpected row=T.
    page.searchPO(manualNotReceivedPO);
    page.clickClosePOButton(manualNotReceivedPO);
    page.waitForModalReady();
    page.assertCostCalcCard({ originalReceived: 2 * RAM_UNIT_COST, originalExpected: 2 * RAM_UNIT_COST, manualExpected: 3 * RAM_UNIT_COST });
    page.assertQtyCalcCard({ originalReceived: 2, originalExpected: 2, manualExpected: 3 });
  });

  it('SW-POC-PRO-TC24 — Manual product received exactly as expected → BOTH Excess and Manual Expected appear with equal magnitude', { tags: ["@regression"] }, () => {
    // Decision Table (row 6/10) — core "hidden gotcha": a manual product's full received
    // amount always lands in Excess even when it never exceeds its own expected — so both
    // rows render here with the SAME value (net-zero effect on Vendor Credit) rather than
    // the row simply not appearing because "nothing is outstanding".
    page.searchPO(manualExactPO);
    page.clickClosePOButton(manualExactPO);
    page.waitForModalReady();
    page.assertCostCalcCard({
      originalReceived: 2 * RAM_UNIT_COST,
      excessReceived: 3 * RAM_UNIT_COST,
      originalExpected: 2 * RAM_UNIT_COST,
      manualExpected: 3 * RAM_UNIT_COST,
    });
    page.assertQtyCalcCard({ originalReceived: 2, excessReceived: 3, originalExpected: 2, manualExpected: 3 });
  });

  it('SW-POC-PRO-TC25 — Manual product partially received → both rows appear, Manual Expected > Excess', { tags: ["@regression"] }, () => {
    // Decision Table (row 7/10): hasManual=T, received < manualExpected → both rows present,
    // Manual Expected (still outstanding) is the larger of the two.
    page.searchPO(manualPartialPO);
    page.clickClosePOButton(manualPartialPO);
    page.waitForModalReady();
    page.assertCostCalcCard({
      originalReceived: 2 * RAM_UNIT_COST,
      excessReceived: 2 * RAM_UNIT_COST,
      originalExpected: 2 * RAM_UNIT_COST,
      manualExpected: 5 * RAM_UNIT_COST,
    });
    page.assertQtyCalcCard({ originalReceived: 2, excessReceived: 2, originalExpected: 2, manualExpected: 5 });
  });

  it('SW-POC-PRO-TC26 — Manual product over-received beyond its own expected → both rows appear, Excess > Manual Expected', { tags: ["@regression"] }, () => {
    // Decision Table (row 8/10): hasManual=T, received > manualExpected → both rows present,
    // Excess (over the manual product's own expectation) is the larger of the two.
    page.searchPO(manualOverExpectedPO);
    page.clickClosePOButton(manualOverExpectedPO);
    page.waitForModalReady();
    page.assertCostCalcCard({
      originalReceived: 2 * RAM_UNIT_COST,
      excessReceived: 5 * RAM_UNIT_COST,
      originalExpected: 2 * RAM_UNIT_COST,
      manualExpected: 2 * RAM_UNIT_COST,
    });
    page.assertQtyCalcCard({ originalReceived: 2, excessReceived: 5, originalExpected: 2, manualExpected: 2 });
  });

  it('SW-POC-PRO-TC27 — Interaction: original-line shortfall + manual product received exactly → buckets do not cross-contaminate', { tags: ["@regression"] }, () => {
    // Decision Table (row 9/10, interaction case): combines a shortfall condition on the
    // original bucket with an exact-match manual product. Regression guard: the shortfall on
    // the base line must not leak into the Excess/Manual Expected numbers, and vice versa —
    // each bucket keeps its own independently-computed value regardless of the other bucket's state.
    page.searchPO(shortfallPlusManualPO);
    page.clickClosePOButton(shortfallPlusManualPO);
    page.waitForModalReady();
    page.assertCostCalcCard({
      originalReceived: 3 * RAM_UNIT_COST,
      excessReceived: 2 * RAM_UNIT_COST,
      originalExpected: 5 * RAM_UNIT_COST,
      manualExpected: 2 * RAM_UNIT_COST,
    });
    page.assertQtyCalcCard({ originalReceived: 3, excessReceived: 2, originalExpected: 5, manualExpected: 2 });
  });

  it('SW-POC-PRO-TC28 — Interaction: PO-file over-receipt + separate manual excess product → Excess sums BOTH sources', { tags: ["@regression"] }, () => {
    // Decision Table (row 10/10, interaction case): combines a reclassified PO-file
    // over-receipt with a literal manually-added excess product. Regression guard against a
    // copy-paste bug that only reads one excess source (manualCost alone, or extraIncoming
    // alone) instead of summing both.
    page.searchPO(overPlusManualPO);
    page.clickClosePOButton(overPlusManualPO);
    page.waitForModalReady();
    const manualOnlyCost = 2 * RAM_UNIT_COST; // the literal manual product's own contribution
    apiGetCheckStatus(overPlusManualPO).then((status) => {
      const excessCost = status?.manualReceivedCost ?? 0;
      const excessQty  = status?.manualReceivedQuantity ?? 0;
      expect(excessCost, 'combined excess cost exceeds the manual product alone (PO-file over-receipt also folded in)')
        .to.be.greaterThan(manualOnlyCost);
      page.assertCostCalcCard({
        originalReceived: status?.originalReceivedCost ?? 0,
        excessReceived: excessCost,
        originalExpected: status?.originalExpectedCost ?? 0,
      });
      page.assertQtyCalcCard({
        originalReceived: status?.originalReceivedQuantity ?? 0,
        excessReceived: excessQty,
        originalExpected: status?.originalExpectedQuantity ?? 0,
      });
    });
  });
});
