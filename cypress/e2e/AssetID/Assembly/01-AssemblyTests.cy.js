/**
 * Asset ID → Assembly — UI Tests (SW-AIDA-TC01..TC12)
 * =============================================================================
 * Screen:   /asset-id/assembly  (Frontend/src/pages/AssetIdReassembly.tsx)
 * API twin: cypress/e2e/AssetID/Assembly/AssemblyAPI.cy.js
 * Plan:     cypress/qa/testPlans/assetId/sub/assembly-plan.md
 *
 * -----------------------------------------------------------------------------
 *   Scope split
 * -----------------------------------------------------------------------------
 *   The guard ladder (self-link, >200 codes, non-Available parent or component,
 *   batch rollback, the Consumed -> StockedOut cascade, the restock/
 *   mark-available divergence) is proven deterministically in the API twin —
 *   principle #3. This spec owns the two-step interaction the screen enforces:
 *   step 2 is inert until step 1 resolves, codes accumulate in a client-side
 *   basket that can be edited before it is committed, and one click then turns
 *   that basket into real stock consumption.
 *
 * -----------------------------------------------------------------------------
 *   Components are minted per test, never shared
 * -----------------------------------------------------------------------------
 *   Assembling a component moves it to `Consumed`, which is terminal for that
 *   item — it can never be assembled again. A component shared between tests
 *   would make every test after the first depend on run order, and would break
 *   under any tag filter that reorders or drops one. Each test that consumes
 *   stock mints its own.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/AssetID/assetIdData.json';
import AssemblyPage from '../../../pageObjects/AssetID/AssemblyPage';
import { apiDeletePO, apiResolveCategoryIdByName } from '../../../support/helpers/poCloseHelpers';
import {
  aidAssembledItems,
  aidData,
  readItemStatus,
  readPoQuantities,
  seedAssetIdPo,
  seedGeneratedAssetIds,
} from '../../../support/helpers/assetIdHelpers';

describe('Asset ID Assembly — UI', { tags: ['@regression'] }, () => {
  const page = new AssemblyPage();

  const stamp = `AIDAU-${Date.now()}`;
  const poNumber = `PO-AIDAU-${Date.now()}`;
  const parentSerial = `SN-AIDAU-P-${Date.now()}`;

  let laptopCategoryId;
  let laptopProductId;

  /** Mint one fresh Available component and yield its asset code. */
  const freshComponent = () =>
    seedGeneratedAssetIds({
      poNumber,
      categoryId: laptopCategoryId,
      productId: laptopProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((ids) => ids[0]);

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });
    seedAssetIdPo({ td, poNumber, stamp, serials: [parentSerial] }).then((seed) => {
      laptopProductId = seed.laptopProductId;
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
    page.visit();
  });

  after(() => {
    apiDeletePO(poNumber);
  });

  // ── Step gating ─────────────────────────────────────────────────────────

  // Use case — the screen opens on step 1 with step 2 locked
  it('SW-AIDA-TC01: step 2 is locked until a parent serial has been fetched', { tags: ['@smoke'] }, () => {
    page.assertParentDetailsAbsent();
    page.assertAssetCodeEntryDisabled();
    page.assertAssembleDisabled();
    page.assertInfoAlert(data.ui.alerts.scanSerialFirst);
  });

  // EP — invalid partition (empty input), blocked before any request
  it('SW-AIDA-TC02: fetching with an empty serial is refused client-side with no request', { tags: ['@regression'] }, () => {
    page.fetchParent('');
    page.assertToast(data.ui.toasts.enterSerial);
    cy.get('@aidScan.all').should('have.length', 0);
    page.assertParentDetailsAbsent();
  });

  // EP — invalid partition (a serial that exists nowhere)
  it('SW-AIDA-TC03: fetching an unknown serial surfaces an error and leaves step 2 locked', { tags: ['@regression'] }, () => {
    page.fetchParent(data.serialNumber.epUnknown);
    cy.wait('@aidScan');
    page.assertToast(data.ui.toasts.noItemsFoundPrefix);
    page.assertParentDetailsAbsent();
    page.assertAssetCodeEntryDisabled();
  });

  // Use case — main flow step 1, and the lock that follows it
  it('SW-AIDA-TC04: fetching a valid parent shows its details, locks the input and unlocks step 2', { tags: ['@smoke'] }, () => {
    page.fetchParent(parentSerial);
    cy.wait('@aidScan');
    page.assertToast(data.ui.toasts.foundProduct);
    page.assertParentDetails({ serialNumber: parentSerial, status: data.statuses.available });
    page.assertParentLocked();
    page.assertAssetCodeEntryEnabled();
    // Nothing is scanned yet, so the commit stays unavailable.
    page.assertAssembleDisabled();
    page.assertInfoAlert(data.ui.alerts.noAssetCodesScanned);
  });

  // State transition — Clear returns the screen to its initial state
  it('SW-AIDA-TC05: Clear releases the parent and re-locks step 2', { tags: ['@regression'] }, () => {
    page.fetchParent(parentSerial);
    cy.wait('@aidScan');
    page.assertParentLocked();

    page.clearParent();
    page.assertParentDetailsAbsent();
    page.assertAssetCodeEntryDisabled();
    page.assertAssembleDisabled();
  });

  // ── The scan basket ─────────────────────────────────────────────────────

  // Use case — main flow step 2: scan a component into the basket
  it('SW-AIDA-TC06: a scanned asset code is added to the basket with its live details', { tags: ['@smoke'] }, () => {
    freshComponent().then((assetCode) => {
      page.fetchParent(parentSerial);
      cy.wait('@aidScan');
      page.addAssetCode(assetCode);
      cy.wait('@aidLifecycle');

      page.assertScannedRow(assetCode);
      page.assertScannedRowCount(1);
      // The row must show the component's LIVE status, not an assumed one —
      // that is the whole point of resolving the code before committing.
      page.assertScannedRowStatus(assetCode, data.statuses.available);
      page.assertAssembleEnabled();
    });
  });

  // Error guessing — the same physical label scanned twice in a row
  it('SW-AIDA-TC07: scanning the same asset code twice is refused and does not duplicate the row', { tags: ['@regression'] }, () => {
    freshComponent().then((assetCode) => {
      page.fetchParent(parentSerial);
      cy.wait('@aidScan');
      page.addAssetCode(assetCode);
      cy.wait('@aidLifecycle');
      page.assertScannedRowCount(1);

      // The duplicate is caught in the browser, before the lookup — a second
      // request would mean the guard is only server-side.
      page.addAssetCode(assetCode, { expectRequest: false });
      page.assertToast(data.ui.toasts.duplicateAssetCode);
      page.assertScannedRowCount(1);
    });
  });

  // EP — invalid partition (an asset code nothing carries)
  it('SW-AIDA-TC08: an unknown asset code is rejected and never enters the basket', { tags: ['@regression'] }, () => {
    page.fetchParent(parentSerial);
    cy.wait('@aidScan');
    page.addAssetCode(data.assetCode.epUnknown);
    cy.wait('@aidLifecycle');
    page.assertScannedRowCount(0);
    page.assertAssembleDisabled();
  });

  // State transition — the basket is editable right up to the commit
  it('SW-AIDA-TC09: a scanned code can be removed before assembling, which re-locks the commit', { tags: ['@regression'] }, () => {
    freshComponent().then((assetCode) => {
      page.fetchParent(parentSerial);
      cy.wait('@aidScan');
      page.addAssetCode(assetCode);
      cy.wait('@aidLifecycle');
      page.assertAssembleEnabled();

      page.removeScannedRow(assetCode);
      page.assertScannedRowCount(0);
      page.assertAssembleDisabled();

      // Removing from the basket is a CLIENT-side edit: nothing was committed,
      // so the component must still be on the shelf.
      cy.then(() => readItemStatus(assetCode)).then((status) => {
        expect(status, 'un-scanning a code must not touch the item — nothing was committed yet').to.equal(
          data.statuses.available,
        );
      });
    });
  });

  // EP — invalid partition (empty code), blocked before any lookup
  it('SW-AIDA-TC12: adding an empty asset code is refused client-side with no request', { tags: ['@regression'] }, () => {
    page.fetchParent(parentSerial);
    cy.wait('@aidScan');
    page.addAssetCode('');
    page.assertToast(data.ui.toasts.scanAssetCode);
    cy.get('@aidLifecycle.all').should('have.length', 0);
    page.assertScannedRowCount(0);
  });

  // ── The commit ──────────────────────────────────────────────────────────

  // Use case — the main flow end to end, with an inventory oracle
  it('SW-AIDA-TC10: Assemble consumes the scanned component and removes it from available stock', { tags: ['@smoke'] }, () => {
    let assetCode;
    let before;

    freshComponent()
      .then((code) => {
        assetCode = code;
        return readPoQuantities(poNumber, laptopProductId);
      })
      .then((snapshot) => {
        before = snapshot;

        page.fetchParent(parentSerial);
        cy.wait('@aidScan');
        page.addAssetCode(assetCode);
        cy.wait('@aidLifecycle');
        page.clickAssemble();

        cy.wait('@aidReassemble', { timeout: 60000 }).then(({ response }) => {
          expect(response?.statusCode, 'the browser-driven assembly must reach the server').to.be.oneOf([200, 201]);
          expect(aidData(response).linkedItems, 'exactly one component was linked').to.have.length(1);
        });

        // The basket empties on success, so the worker can start the next unit.
        cy.then(() => {
          page.assertScannedRowCount(0);
        });

        cy.then(() => readItemStatus(assetCode)).then((status) => {
          expect(status, 'a component assembled from the screen is Consumed, not StockedOut').to.equal(
            data.statuses.consumed,
          );
        });

        cy.then(() => readPoQuantities(poNumber, laptopProductId)).then((after) => {
          expect(
            before.availableQuantity - after.availableQuantity,
            'a UI-driven assembly must move the ledger exactly as the API-driven one does',
          ).to.equal(1);
        });

        cy.then(() => aidAssembledItems(parentSerial)).then((res) => {
          const serials = (aidData(res).assembledItems || []).map((i) => i.serialNumber);
          expect(serials, 'the parent must now list the component on its bill of materials').to.include(assetCode);
        });
      });
  });
});
