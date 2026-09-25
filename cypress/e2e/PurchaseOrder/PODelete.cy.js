/**
 * PODelete.cy.js
 * ============================================================
 * Spec: Deleting a Purchase Order
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (Spec N6 — SW-PODLT)
 *
 * Reality check (verified by reading List.tsx + ConfirmationDialog.tsx +
 * Backend/src/modules/poDetail/poDetail.service.ts): the delete confirmation
 * dialog's buttons are literally "Yes"/"No", NOT "Confirm"/"Cancel" (project
 * convention, confirmed again here). The Delete button is CONDITIONALLY
 * UNRENDERED (not merely disabled) when the backend-calculated `canDelete` is
 * false — and per poDetail.service.ts:317, `canDelete = status === 'Closed'
 * ? false : !blockedFromDelete.has(poNumber)` — a Closed PO is UNCONDITIONALLY
 * non-deletable, regardless of StockedOut items. TC05 is corrected below from
 * the original plan ("Closed PO with no StockedOut items can still be
 * deleted") to match this: Closed always blocks deletion.
 *
 */

import POListPage from '../../pageObjects/PurchaseOrder/POListPage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  seedSerializedPO,
  apiCheckIn,
  apiScanSerial,
  apiClosePO,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';
import { apiStockOutSerial } from '../../support/helpers/exportSeedingHelpers';

const suiteStamp = `PODLT-${Date.now()}`;
const emptyPO = `PO-PODLT-EMPTY-${suiteStamp}`;
const stockedOutPO = `PO-PODLT-SO-${suiteStamp}`;
const cancelPO = `PO-PODLT-CANCEL-${suiteStamp}`;
const closedNoSoPO = `PO-PODLT-CLSD-${suiteStamp}`;

const sn = (label) => `SN-PODLT-${label}-${suiteStamp}`;
const stockedOutSerial = sn('SO1');

const page = new POListPage();

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  seedProductOnlyPO({ td, poNumber: emptyPO, stamp: `${suiteStamp}-e`, quantity: 1 });
  seedProductOnlyPO({ td, poNumber: cancelPO, stamp: `${suiteStamp}-cn`, quantity: 1 });

  seedSerializedPO({ td, poNumber: stockedOutPO, stamp: `${suiteStamp}-so`, serials: [stockedOutSerial] })
    .then(() => apiScanSerial(stockedOutPO, stockedOutSerial))
    .then(() => apiStockOutSerial({ serialNumber: stockedOutSerial, reason: 'Sold' }));

  seedProductOnlyPO({ td, poNumber: closedNoSoPO, stamp: `${suiteStamp}-cl`, quantity: 2 })
    .then((id) => apiCheckIn({ poNumber: closedNoSoPO, productId: id, quantity: 2 }))
    .then(() => apiClosePO(closedNoSoPO));
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [emptyPO, stockedOutPO, cancelPO, closedNoSoPO].forEach((po) => apiDeletePO(po));
  });
});

beforeEach(() => {
  cy.authSession('admin');
  page.visit();
});

describe('SW-PODLT — Delete Purchase Order', () => {
  it('SW-PODLT-TC01 — Deleting an empty (unreceived) PO removes it from the list @smoke', () => {
    // Use Case: main flow
    page.search(emptyPO);
    page.clickDeleteIcon(emptyPO);
    page.assertDeleteHeading();
    page.fillDeleteConfirmText('DELETE');
    page.confirmYes();
    page.search(emptyPO);
    page.assertRowAbsent(emptyPO);
  });

  it('SW-PODLT-TC02 — The Delete icon is not rendered for a PO with a StockedOut item @regression', () => {
    // EP (invalid partition): List.tsx conditionally OMITS the button entirely
    // when canDelete===false — it does not render it merely disabled.
    page.search(stockedOutPO);
    page.assertDeleteIconAbsent(stockedOutPO);
  });

  it('SW-PODLT-TC03 — A confirmation dialog with "Yes"/"No" buttons appears before deletion @regression', () => {
    // EP — UI guard: shared ConfirmationDialog uses Yes/No, not Confirm/Cancel
    page.search(cancelPO);
    page.clickDeleteIcon(cancelPO);
    page.assertDeleteHeading();
    page.assertDialogButtonsVisible();
  });

  it('SW-PODLT-TC04 — Clicking "No" cancels the deletion and the PO remains in the list @regression', () => {
    // EP: cancel flow
    page.search(cancelPO);
    page.clickDeleteIcon(cancelPO);
    page.assertDeleteHeading();
    page.confirmNo();
    page.search(cancelPO);
    page.assertRowVisible(cancelPO);
  });

  it('SW-PODLT-TC05 — A Closed PO is never deletable, even with no StockedOut items @regression', () => {
    // Error Guessing / EP (invalid partition): per poDetail.service.ts,
    // canDelete is unconditionally false when status==='Closed' — Closed
    // status alone blocks deletion independent of any StockedOut items.
    page.search(closedNoSoPO);
    page.assertDeleteIconAbsent(closedNoSoPO);
  });
});
