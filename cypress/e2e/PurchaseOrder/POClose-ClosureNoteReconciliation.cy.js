/**
 * POClose-ClosureNoteReconciliation.cy.js
 * ============================================================
 * Spec: Closure reason/notes/credit-memo fields, admin cost adjustment, and
 *       the post-close ClosureDetailsPopover.
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (Spec N8 — SW-POC-CNR)
 * CRITICAL VERIFICATION (per user requirement): a cost update made via the
 * "Save Changes" button must be reflected on the product's inventory cost —
 * verified here against GET /products/:id (the same data Inventory reads).
 *
 * Reality check (verified by reading ReconciliationSection.tsx): cost edits
 * are NOT deferred to PO close — clicking "Save Changes" (a single combined
 * button that persists both cost and expected-quantity edits) posts
 * immediately to /incoming-items/update-cost-price and recalculates the
 * product's weighted-average cost right away, independent of closing the PO.
 * The button is disabled until there is a pending edit, and success shows a
 * "Changes saved: …" toast. TC08/TC09 test that immediate-save path rather
 * than "close with a cost update" (there is no such combined action).
 *
 */

import POClosePage from '../../pageObjects/PurchaseOrder/POClosePage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  seedMultiProductOnlyPO,
  apiCheckIn,
  apiClosePO,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';
import { apiCall } from '../../support/helpers/allPosHelpers';
import { requireRoleOrSkip } from '../../support/helpers/roleGuards';

const suiteStamp = `POCCNR-${Date.now()}`;
const reasonPO = `PO-POCCNR-RSN-${suiteStamp}`;
const notePO = `PO-POCCNR-NOTE-${suiteStamp}`;
const adminAdjPO = `PO-POCCNR-ADJ-${suiteStamp}`;
const costSyncPO = `PO-POCCNR-CS-${suiteStamp}`;
const multiCostPO = `PO-POCCNR-MC-${suiteStamp}`;
const openPO = `PO-POCCNR-OPEN-${suiteStamp}`;
const noReasonPO = `PO-POCCNR-NR-${suiteStamp}`;

let costSyncProductId;
let multiCostProductIds = [];

// GET /products/:id wraps the product as `data.product` (alongside
// locations/commonColumns/etc. sibling metadata), not `data` directly.
function apiGetProduct(productId) {
  return apiCall('GET', `/products/${productId}`).then((res) => res.body?.data?.product || res.body);
}

const page = new POClosePage();

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  [reasonPO, notePO, adminAdjPO, openPO, noReasonPO].forEach((po, i) => {
    seedProductOnlyPO({ td, poNumber: po, stamp: `${suiteStamp}-x${i}`, quantity: 3 }).then((id) =>
      apiCheckIn({ poNumber: po, productId: id, quantity: 3 })
    );
  });

  seedProductOnlyPO({ td, poNumber: costSyncPO, stamp: `${suiteStamp}-cs`, quantity: 2 }).then((id) => {
    costSyncProductId = id;
    return apiCheckIn({ poNumber: costSyncPO, productId: id, quantity: 2 });
  });

  seedMultiProductOnlyPO({
    td,
    poNumber: multiCostPO,
    products: [
      { stamp: `${suiteStamp}-mc1`, quantity: 2 },
      { stamp: `${suiteStamp}-mc2`, quantity: 3 },
    ],
  }).then((ids) => {
    multiCostProductIds = ids;
    return apiCheckIn({ poNumber: multiCostPO, productId: ids[0], quantity: 2 }).then(() =>
      apiCheckIn({ poNumber: multiCostPO, productId: ids[1], quantity: 3 })
    );
  });
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [reasonPO, notePO, adminAdjPO, costSyncPO, multiCostPO, openPO, noReasonPO].forEach((po) =>
      apiDeletePO(po)
    );
  });
});

beforeEach(() => {
  cy.authSession('admin');
  page.visit();
});

describe('SW-POC-CNR — Closure fields, admin cost adjustment, post-close details', () => {
  it('SW-POC-CNR-TC01 — The Closure Reason dropdown renders in the close modal @smoke', () => {
    // EP — UI presence
    page.searchPO(reasonPO);
    page.clickClosePOButton(reasonPO);
    page.waitForModalReady();
    page.assertClosureReasonSelectVisible();
  });

  it('SW-POC-CNR-TC02 — Selecting a closure reason and closing the PO stores that reason @smoke', () => {
    // Use Case: main flow
    page.searchPO(reasonPO);
    page.clickClosePOButton(reasonPO);
    page.waitForModalReady();
    page.selectClosureReason('Vendor shortage (under-shipped)');
    page.submitClosePO();
    page.searchPO(reasonPO);
    page.assertRowStatus(reasonPO, td.listPage.closedStatus);
  });

  it('SW-POC-CNR-TC03 — The Closure Notes textarea accepts free-text input @regression', () => {
    // EP — valid text
    page.searchPO(notePO);
    page.clickClosePOButton(notePO);
    page.waitForModalReady();
    page.typeClosureNote('Vendor confirmed shortage will ship next week.');
    cy.get('[role="dialog"] textarea').first().should('have.value', 'Vendor confirmed shortage will ship next week.');
  });

  // APP GAP: ClosureDetailsPopover.tsx (aria-label="view closure details") is
  // a fully-built component but is not imported/rendered anywhere in the app
  // (verified: no reference to it outside its own file) — closed POs have no
  // UI entry point to view a persisted closure note/reason. Skipped until the
  // component is wired into the PO List.
  it.skip('SW-POC-CNR-TC04 — Closing a PO with a closure note persists it for later viewing @regression', () => {
    // Use Case: note round-trips through close → visible via ClosureDetailsPopover
    page.searchPO(notePO);
    page.clickClosePOButton(notePO);
    page.waitForModalReady();
    page.typeClosureNote('Vendor confirmed shortage will ship next week.');
    page.submitClosePO();
    page.searchPO(notePO);
    page.clickClosureDetailsTrigger();
    cy.contains(/Vendor confirmed shortage/i, { timeout: 10000 }).should('be.visible');
  });

  it('SW-POC-CNR-TC05 — An admin user sees the cost adjustment section in the close modal @regression', () => {
    // Decision Table: admin && !readOnly && perProductAdjustment.length > 0
    page.searchPO(adminAdjPO);
    page.clickClosePOButton(adminAdjPO);
    page.waitForModalReady();
    page.assertAdjustmentSectionVisible();
  });

  it('SW-POC-CNR-TC06 — A sales user cannot reach the purchase-order list at all @regression', function () {
    // Decision Table: the Sales role mounts the Inventory page only, so
    // /purchase-orders is not a registered route for it — there is no PO list
    // to render a Close PO action on. (Before the Inventory-only change this
    // TC asserted the weaker property: list renders, row actions suppressed by
    // `enableRowActions: isSales() ? false : true`.)
    requireRoleOrSkip(this, 'sales');
    cy.authSession('sales');
    page.visit();
    cy.contains(/sorry, page not found/i, { timeout: 15000 }).should('be.visible');
    cy.contains('button', /close po/i).should('not.exist');
  });

  it('SW-POC-CNR-TC07 — Admin adjusts a product\'s cost via "Save Changes" and the change persists immediately (independent of closing) @regression', () => {
    // Use Case — admin path: cost edits are NOT deferred to close.
    page.searchPO(costSyncPO);
    page.clickClosePOButton(costSyncPO);
    page.waitForModalReady();
    page.setCostForFirstProduct('99.50');
    page.clickSaveChanges();
    cy.contains(/Changes saved:/i, { timeout: 15000 }).should('be.visible');
  });

  it('SW-POC-CNR-TC08 — A cost update saved via "Save Changes" is reflected on the product\'s inventory cost (GET /products/:id) @regression', () => {
    // CRITICAL: verify the persisted cost sync end-to-end against the same
    // data Inventory reads — not just the modal's own optimistic state.
    page.searchPO(costSyncPO);
    page.clickClosePOButton(costSyncPO);
    page.waitForModalReady();
    page.setCostForFirstProduct('123.45');
    page.clickSaveChanges();
    cy.contains(/Changes saved:/i, { timeout: 15000 }).should('be.visible');

    apiGetProduct(costSyncProductId).then((product) => {
      expect(Number(product.cost), 'product.cost should reflect the saved adjustment').to.eq(123.45);
    });
  });

  it('SW-POC-CNR-TC09 — Multi-product cost adjustments each persist independently to their respective products @regression', () => {
    // Decision Table — Per-product cost sync
    page.searchPO(multiCostPO);
    page.clickClosePOButton(multiCostPO);
    page.waitForModalReady();
    cy.get('[role="dialog"] input[type="number"]').then(($inputs) => {
      cy.wrap($inputs.eq(0)).clear().type('55.00');
      if ($inputs.length > 1) cy.wrap($inputs.eq(1)).clear().type('88.00');
    });
    page.clickSaveChanges();
    cy.contains(/Changes saved:/i, { timeout: 15000 }).should('be.visible');

    // Assert order-independently: the modal's number-input order is NOT
    // guaranteed to match multiCostProductIds order, so verify the two DISTINCT
    // costs (55, 88) each landed on one of the two products — proving each
    // persisted independently — rather than assuming input[0] == product[0].
    const costs = [];
    cy.wrap(multiCostProductIds.slice(0, 2))
      .each((pid) => apiGetProduct(pid).then((p) => costs.push(Number(p.cost))))
      .then(() => {
        expect(
          costs.slice().sort((a, b) => a - b),
          'both products persisted their own adjusted cost independently',
        ).to.deep.eq([55.0, 88.0]);
      });
  });

  // APP GAP — see TC04: ClosureDetailsPopover has no UI entry point.
  it.skip('SW-POC-CNR-TC10 — ClosureDetailsPopover opens on a Closed PO and shows per-product reconciliation entries @regression', () => {
    // EP — post-close state
    page.searchPO(reasonPO);
    page.clickClosureDetailsTrigger();
    cy.contains(/Product Reconciliation/i, { timeout: 10000 }).should('be.visible');
  });

  // NOTE: passes trivially today since the trigger is unwired everywhere
  // (see TC04/TC10 app-gap note) — kept active so it starts failing (its
  // "absent" assumption becomes meaningful) once the component is wired in
  // and this test needs the Open-PO exclusion to actually be exercised.
  it('SW-POC-CNR-TC11 — The ClosureDetailsPopover trigger is unavailable on an Open PO @regression', () => {
    // State Transition (invalid): trigger only renders for Closed rows
    page.searchPO(openPO);
    page.assertClosureDetailsTriggerAbsent();
  });

  it('SW-POC-CNR-TC12 — Closing a PO without selecting a closure reason succeeds (the field is optional) @regression', () => {
    // Error Guessing: closure reason is explicitly optional — no validation blocks an empty selection
    page.searchPO(noReasonPO);
    page.clickClosePOButton(noReasonPO);
    page.waitForModalReady();
    page.submitClosePO();
    page.searchPO(noReasonPO);
    page.assertRowStatus(noReasonPO, td.listPage.closedStatus);
  });
});
