/**
 * POClose-MixedCategoryPO.cy.js
 * ============================================================
 * Spec: PO Close modal — mixed-category PO (product-only + serialized) (TC01–TC12; TC04 removed)
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (SW-POC-MIX)
 * Page Object: cypress/pageObjects/PurchaseOrder/POClosePage.js
 *
 * Seeding strategy:
 *   - mixedPO:    RAM (qty=5, received=3) + Laptop (3 serials, scan 2)
 *                 → both types partially received, both have missing
 *   - closeMixPO: RAM (qty=3, received=3) + Laptop (2 serials, scan 2) → Perfect Match, used for TC08
 *   - statusMixPO: RAM qty=4 received=2 + Laptop 2 serials, Damaged on RAM (product-level, not
 *     surfaced in Status Issues) + Disputed on one Laptop serial + Damaged on the other Laptop
 *     serial (both serialized, surfaced in Status Issues) → TC09
 *   - multi4PO:   2 RAM products + 2 Laptop products → TC10
 *   All POs deleted in after().
 *
 */

import POClosePage from '../../pageObjects/PurchaseOrder/POClosePage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedMixedPO,
  seedMultiMixedPO,
  apiCheckIn,
  apiScanSerial,
  apiMarkSerialStatus,
  apiMarkProductStatus,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';

const suiteStamp    = `MIX-${Date.now()}`;
const mixedPO       = `PO-POC-MIX-PAR-${suiteStamp}`;
const closeMixPO    = `PO-POC-MIX-CLS-${suiteStamp}`;
const statusMixPO   = `PO-POC-MIX-STA-${suiteStamp}`;
const multi4PO      = `PO-POC-MIX-M4-${suiteStamp}`;

const sn = (label) => `SN-MIX-${label}-${suiteStamp}`;

// Mixed PO serials
const mixSerials        = [sn('L1'), sn('L2'), sn('L3')];
const closeMixSerials   = [sn('CL1'), sn('CL2')];
const statusMixSerials  = [sn('ST1'), sn('ST2')];
const multi4ASerials    = [sn('M4A1'), sn('M4A2')];
const multi4BSerials    = [sn('M4B1'), sn('M4B2')];

let mixedIds;
let closeMixIds;
let statusMixIds;
let multi4ProductIds = [];

const page = new POClosePage();

// ── Suite setup ───────────────────────────────────────────────────────────────

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  // mixedPO: RAM qty=5 received=3, Laptop 3 serials 2 scanned
  seedMixedPO({
    td,
    poNumber: mixedPO,
    ramStamp: `${suiteStamp}-mr`,
    ramQty: 5,
    laptopStamp: `${suiteStamp}-ml`,
    serials: mixSerials,
  }).then((ids) => {
    mixedIds = ids;
    return apiCheckIn({ poNumber: mixedPO, productId: ids.ramProductId, quantity: 3 });
  }).then(() => {
    [sn('L1'), sn('L2')].forEach((s) => apiScanSerial(mixedPO, s));
  });

  // closeMixPO: RAM qty=3 received=3, Laptop 2 serials all scanned → Perfect Match
  seedMixedPO({
    td,
    poNumber: closeMixPO,
    ramStamp: `${suiteStamp}-cr`,
    ramQty: 3,
    laptopStamp: `${suiteStamp}-cl`,
    serials: closeMixSerials,
  }).then((ids) => {
    closeMixIds = ids;
    return apiCheckIn({ poNumber: closeMixPO, productId: ids.ramProductId, quantity: 3 });
  }).then(() => {
    closeMixSerials.forEach((s) => apiScanSerial(closeMixPO, s));
  });

  // statusMixPO: RAM qty=4 received=2 + Laptop 2 serials, with status issues
  seedMixedPO({
    td,
    poNumber: statusMixPO,
    ramStamp: `${suiteStamp}-sr`,
    ramQty: 4,
    laptopStamp: `${suiteStamp}-sl`,
    serials: statusMixSerials,
  }).then((ids) => {
    statusMixIds = ids;
    return apiCheckIn({ poNumber: statusMixPO, productId: ids.ramProductId, quantity: 2 });
  }).then(() => {
    statusMixSerials.forEach((s) => apiScanSerial(statusMixPO, s));
  }).then(() => {
    // Mark 1 Damaged on RAM (product-only)
    return apiMarkProductStatus({
      poNumber: statusMixPO,
      productId: statusMixIds.ramProductId,
      quantity: 1,
      status: 'Damaged',
      damageReason: 'Physical Damage',
    });
  }).then(() => {
    // Mark 1 Disputed on Laptop (serialized); Missing cannot be set via mark-status (returns success:false)
    return apiMarkSerialStatus({
      poNumber: statusMixPO,
      serialNumbers: [sn('ST1')],
      status: 'Disputed',
    });
  }).then(() => {
    // Mark the other Laptop serial Damaged so Status Issues has a real Damaged count to verify
    // (RAM's product-level Damaged mark above does NOT surface in Status Issues — see TC09).
    return apiMarkSerialStatus({
      poNumber: statusMixPO,
      serialNumbers: [sn('ST2')],
      status: 'Damaged',
      damageReason: 'Physical Damage',
    });
  });

  // multi4PO: 2 RAM products + 2 Laptop products (4 total) — one combined Excel import
  const m4RamProducts = [
    { stamp: `${suiteStamp}-m4r1`, quantity: 5 },
    { stamp: `${suiteStamp}-m4r2`, quantity: 3 },
  ];
  const m4LaptopProducts = [
    { stamp: `${suiteStamp}-m4l1`, serials: multi4ASerials },
    { stamp: `${suiteStamp}-m4l2`, serials: multi4BSerials },
  ];
  seedMultiMixedPO({ td, poNumber: multi4PO, ramProducts: m4RamProducts, laptopProducts: m4LaptopProducts })
    .then(({ ramProductIds, laptopProductIds }) => {
      multi4ProductIds.push(...ramProductIds, ...laptopProductIds);
      return apiCheckIn({ poNumber: multi4PO, productId: ramProductIds[0], quantity: 3 });
    })
    .then(() => apiCheckIn({ poNumber: multi4PO, productId: multi4ProductIds[1], quantity: 2 }))
    .then(() => {
      apiScanSerial(multi4PO, sn('M4A1'));
      apiScanSerial(multi4PO, sn('M4B1'));
    });
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [mixedPO, closeMixPO, statusMixPO, multi4PO].forEach((po) => apiDeletePO(po));
  });
});

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  cy.authSession('admin');
  page.visit();
});

// ── Test Cases ────────────────────────────────────────────────────────────────

describe('SW-POC-MIX — Mixed-category PO close modal', () => {
  it('SW-POC-MIX-TC01 — Quantity Breakdown expected qty is combined total of product-only and serialized expected', { tags: ["@regression"] }, () => {
    // Decision Table: RAM expected=5, Laptop expected=3 → aggregate originalExpectedQuantity=8
    // "Original Products Quantity" is the section header span in the Quantity card DOM.
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    cy.get('[role="dialog"]')
      .contains('span', 'Original Products Quantity')
      .parent()
      .within(() => {
        cy.contains('span', 'Expected:').next().should('have.text', '8');
      });
  });

  it('SW-POC-MIX-TC02 — Quantity Breakdown received qty is combined total across both product types', { tags: ["@smoke"] }, () => {
    // Decision Table: RAM received=3, Laptop received=2 → aggregate originalReceivedQuantity=5
    // "Original Products Quantity" is the section header span in the Quantity card DOM.
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    cy.get('[role="dialog"]')
      .contains('span', 'Original Products Quantity')
      .parent()
      .within(() => {
        cy.contains('span', 'Received (PO):').next().should('have.text', '5');
      });
  });

  it('SW-POC-MIX-TC03 — Missing count sums shortfalls from both product-only and serialized products', { tags: ["@smoke"] }, () => {
    // Decision Table: RAM missing=2 (5-3), Laptop missing=1 (3-2) → total Missing=3
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    page.assertMissingCount(3);
  });

  // SW-POC-MIX-TC04 removed: it asserted zero Extras on mixedPO under the title "Extras count
  // includes over-received units from both product types" — a scenario mismatch (mixedPO has no
  // over-received line at all), and the assertion added nothing over TC03's Missing coverage.
  // Slot intentionally left vacant rather than renumbering the suite.

  it('SW-POC-MIX-TC05 — Verdict shows "Cost & Quantity Mismatch" when either product type has a discrepancy', { tags: ["@regression"] }, () => {
    // Decision Table: RAM short=2, Laptop short=1 → both qty and cost short → "Cost & Quantity Mismatch"
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    page.assertVerdictCostQtyMismatch();
  });

  it('SW-POC-MIX-TC06 — Cost Breakdown includes all products regardless of type', { tags: ["@regression"] }, () => {
    // Use Case: "Original Products Cost" Expected must aggregate RAM ($75×5=$375.00) and Laptop
    // ($1799.99×3=$5399.97) → $5774.97. Received must aggregate RAM ($75×3=$225.00) and Laptop
    // ($1799.99×2=$3599.98) → $3824.98. Asserted as exact values, not just "non-zero", so a
    // regression that drops one product type's contribution (e.g. Laptop's $3599.97 alone would
    // still pass a "not $0" check) is actually caught.
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    page.assertCostExpected('$5774.97');
    page.assertCostReceived('$3824.98');
  });

  it('SW-POC-MIX-TC11 — Quantity Breakdown Difference equals combined Received minus combined Expected across both product types', { tags: ["@regression"] }, () => {
    // Decision Table: combined Expected=8 (RAM 5 + Laptop 3, per TC01), combined Received=5
    // (RAM 3 + Laptop 2, per TC02) → Difference = Received - Expected = 5 - 8 = -3.
    // Regression guard: a bug that computes the Difference row from only one product type's
    // own shortfall (RAM's -2, or Laptop's -1) would produce the wrong number here — only the
    // correctly-summed aggregate (-3) satisfies this assertion.
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    page.assertQuantityDifference(-3);
  });

  it('SW-POC-MIX-TC12 — Cost Breakdown Difference equals combined Received cost minus combined Expected cost across both product types', { tags: ["@regression"] }, () => {
    // Decision Table: combined Expected cost=$5774.97, combined Received cost=$3824.98 (TC06)
    // → Difference = $3824.98 - $5774.97 = -$1949.99. Same regression guard as TC11, for cost.
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    page.assertCostDifference('-$1949.99');
  });

  it('SW-POC-MIX-TC07 — Missing Items section is visible and shows combined count across both product types', { tags: ["@smoke"] }, () => {
    // Use Case: both RAM (product-only, 2 missing) and Laptop (serialized, 1 missing) shortfalls
    // contribute to the Missing Items section. The modal shows a count summary — individual serial
    // numbers are not listed in the close modal.
    page.searchPO(mixedPO);
    page.clickClosePOButton(mixedPO);
    page.waitForModalReady();
    page.assertMissingItemsSectionVisible();
    page.assertMissingCount(3);
  });

  it('SW-POC-MIX-TC08 — Successfully closing a mixed-category PO changes its status to "Closed"', { tags: ["@smoke"] }, () => {
    // State Transition: Open → Closed (closeMixPO is a Perfect Match PO)
    page.searchPO(closeMixPO);
    page.clickClosePOButton(closeMixPO);
    page.waitForModalReady();
    page.submitClosePO();
    page.searchPO(closeMixPO);
    page.assertRowStatus(closeMixPO, td.listPage.closedStatus);
  });

  it('SW-POC-MIX-TC09 — Status Issues shows Damaged and Disputed counts from serialized items, but not the product-level Damaged mark, in a mixed PO', { tags: ["@regression"] }, () => {
    // Decision Table: Laptop Disputed=1 (ST1, serialized item → Items table) and Laptop Damaged=1
    // (ST2, serialized) → both shown in Status Issues. RAM Damaged=1 is product-only
    // quantity-level and does NOT appear in Status Issues (Status Issues only counts Items table
    // rows, not qty-level marks — confirmed by TC15 in PRO spec) — asserting exactly "Damaged: 1"
    // (not 2) proves the RAM mark is correctly excluded rather than silently double-counted.
    page.searchPO(statusMixPO);
    page.clickClosePOButton(statusMixPO);
    page.waitForModalReady();
    page.assertStatusIssuesSectionPresent();
    page.assertStatusIssuesDamagedCount(1);
    page.assertStatusIssuesDisputedCount(1);
  });

  it('SW-POC-MIX-TC10 — Quantity Breakdown shows correct per-product Expected/Received rows for 4 products in a mixed PO', { tags: ["@smoke"] }, () => {
    // EP (multi-product): 2 RAM + 2 Laptop products → 4 per-product breakdown rows.
    // Per-product rows live in the "Product Level Breakdown" table (opened via the
    // "Product level breakdown" button). The pagination footer count alone ("Record: 1 - 4 of 4")
    // only proves 4 rows exist, not that each row carries the right numbers — asserting each
    // row's actual Expected/Received values catches a regression that renders 4 rows with wrong
    // or swapped quantities.
    // Seeded: RAM1 expected=5 received=3, RAM2 expected=3 received=2,
    //         Laptop1 expected=2 received=1 (M4A1 scanned), Laptop2 expected=2 received=1 (M4B1 scanned).
    page.searchPO(multi4PO);
    page.clickClosePOButton(multi4PO);
    page.waitForModalReady();
    page.assertQuantityBreakdownVisible();
    page.clickViewProductLevelBreakdown();
    cy.get('[role="dialog"]').should('contain.text', 'Record: 1 - 4 of 4');
    page.assertProductRowQuantities(`${suiteStamp}-m4r1`, { expected: 5, received: 3 });
    page.assertProductRowQuantities(`${suiteStamp}-m4r2`, { expected: 3, received: 2 });
    page.assertProductRowQuantities(`${suiteStamp}-m4l1`, { expected: 2, received: 1 });
    page.assertProductRowQuantities(`${suiteStamp}-m4l2`, { expected: 2, received: 1 });
  });
});
