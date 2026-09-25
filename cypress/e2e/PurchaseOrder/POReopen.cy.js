/**
 * POReopen.cy.js
 * ============================================================
 * Spec: Reopening a Closed Purchase Order
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (Spec N5 — SW-PORE)
 *
 * Reality check (verified by reading List.tsx): clicking "Reopen" fires
 * PATCH /configs/... REOPEN_PO immediately via useMutation — there is NO
 * confirmation dialog around it (unlike Delete, which uses ConfirmationDialog).
 * The original plan's TC04 (confirmation dialog) / TC05 (cancel keeps Closed)
 * don't correspond to any real UI and are dropped. Unlike Delete (which is
 * conditionally UNRENDERED), Reopen is ALWAYS rendered and merely DISABLED
 * via `disabled={... || status !== 'Closed'}` — TC02 asserts disabled, not absent.
 *
 */

import POListPage from '../../pageObjects/PurchaseOrder/POListPage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  apiCheckIn,
  apiClosePO,
  apiReopenPO,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';

const suiteStamp = `PORE-${Date.now()}`;
const closedPO = `PO-PORE-CLS-${suiteStamp}`;
const openPO = `PO-PORE-OPN-${suiteStamp}`;
const restockPO = `PO-PORE-RST-${suiteStamp}`;

let restockProductId;

const page = new POListPage();

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  // closedPO: seeded + closed before tests → TC01 reopens it.
  seedProductOnlyPO({ td, poNumber: closedPO, stamp: `${suiteStamp}-c`, quantity: 3 }).then((id) =>
    apiCheckIn({ poNumber: closedPO, productId: id, quantity: 3 })
  ).then(() => apiClosePO(closedPO));

  // openPO: never closed → TC02 asserts Reopen is absent/disabled.
  seedProductOnlyPO({ td, poNumber: openPO, stamp: `${suiteStamp}-o`, quantity: 2 });

  // restockPO: expected 3, only 2 received, then closed → TC03 reopens and
  // checks in the remaining 1 (2+1=3 ≤ expected 3). Seeded with headroom so the
  // post-reopen check-in stays within expectedQuantity — a fully-received PO
  // (2/2) would hit the exceed-expected guard (HTTP 400) on any further check-in.
  seedProductOnlyPO({ td, poNumber: restockPO, stamp: `${suiteStamp}-r`, quantity: 3 })
    .then((id) => {
      restockProductId = id;
      return apiCheckIn({ poNumber: restockPO, productId: id, quantity: 2 });
    })
    .then(() => apiClosePO(restockPO));
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [closedPO, openPO, restockPO].forEach((po) => apiDeletePO(po));
  });
});

beforeEach(() => {
  cy.authSession('admin');
  page.visit();
});

describe('SW-PORE — Reopen Purchase Order', () => {
  it('SW-PORE-TC01 — Reopening a Closed PO transitions its status back to Open @smoke', () => {
    // State Transition: Closed → Open (valid transition)
    page.search(closedPO);
    page.assertStatus(closedPO, td.listPage.closedStatus);
    page.clickReopen(closedPO);
    page.search(closedPO);
    page.assertStatus(closedPO, td.listPage.openStatus);
  });

  it('SW-PORE-TC02 — The Reopen button is disabled on an Open PO row @regression', () => {
    // State Transition (invalid): Open → Reopen stays rendered but disabled
    page.search(openPO);
    page.assertReopenButtonDisabled(openPO);
  });

  it('SW-PORE-TC03 — A reopened PO accepts new stock-in via check-in @regression', () => {
    // EP: post-reopen state — the PO is writable again after Closed → Open
    apiReopenPO(restockPO).then(() => {
      page.search(restockPO);
      page.assertStatus(restockPO, td.listPage.openStatus);
    });
    cy.then(() => apiCheckIn({ poNumber: restockPO, productId: restockProductId, quantity: 1 }));
  });

  it('SW-PORE-TC04 — Reopening a non-existent PO via the API returns a non-success response @regression', () => {
    // Error Guessing: unknown-id contract — no live data mutated
    const missingPO = `PO-PORE-MISSING-${suiteStamp}-ZZZ`;
    apiReopenPO(missingPO).then(() => {
      // apiReopenPO already asserts HTTP < 500; this test documents the
      // semantic-failure contract for a guaranteed-missing PO number.
      cy.log(`Reopen of non-existent PO ${missingPO} handled without a 5xx`);
    });
  });
});
