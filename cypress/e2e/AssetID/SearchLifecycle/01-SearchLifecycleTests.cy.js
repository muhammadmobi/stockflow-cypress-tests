/**
 * Asset ID → Search Life Cycle — UI Tests (SW-AIDL-TC01..TC12)
 * =============================================================================
 * Screen:   /asset-id/search  (Frontend/src/pages/AssetIdSearch.tsx)
 * API twin: cypress/e2e/AssetID/SearchLifecycle/SearchLifecycleAPI.cy.js
 * Plan:     cypress/qa/testPlans/assetId/sub/search-lifecycle-plan.md
 *
 * -----------------------------------------------------------------------------
 *   Scope split
 * -----------------------------------------------------------------------------
 *   The API twin owns the contract: which inventory operation lands in which of
 *   the three timeline sources, the quantity and cost ledger, the lineage in
 *   both directions, and the four confirmed defects. All of that is
 *   deterministic over HTTP and does not need a browser (principle #3).
 *
 *   This spec owns only what a browser can break: the search control and its
 *   disabled state, the `?assetId=` deep link, the URL round trip that makes a
 *   result shareable, the flow-tree cards, the three tabs and their badges, the
 *   empty states, and the error path.
 *
 * -----------------------------------------------------------------------------
 *   One screen-specific rule shapes every test here
 * -----------------------------------------------------------------------------
 *   The whole result grid is behind `{!!lifecycleData && ( … )}`, so there is no
 *   "empty result" rendering — either the flow tree is mounted or nothing is.
 *   That is why every negative assertion in this file is `assertNoResultShown()`
 *   (the absence of the "Lifecycle Flow" heading): it is the app's own statement
 *   that no result is held, and unlike a toast assertion it cannot pass while a
 *   stale result is still on screen.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/AssetID/assetIdData.json';
import SearchLifecyclePage from '../../../pageObjects/AssetID/SearchLifecyclePage';
import { apiDeletePO, apiResolveCategoryIdByName } from '../../../support/helpers/poCloseHelpers';
import {
  aidStockOutSerial,
  seedAssetIdPo,
  seedDisassemblyChildren,
  seedGeneratedAssetIds,
} from '../../../support/helpers/assetIdHelpers';

const LC = data.lifecycle;

describe('Asset ID Search Life Cycle — UI', { tags: ['@regression'] }, () => {
  const page = new SearchLifecyclePage();

  const stamp = `AIDLU-${Date.now()}`;
  const poNumber = `PO-AIDLU-${Date.now()}`;
  const disassemblyParent = `SN-AIDLU-DP-${Date.now()}`;

  let laptopCategoryId;
  let laptopProductId;

  // Read-only across the suite: neither is mutated after before(), so sharing
  // them cannot make one test depend on another's side effects.
  let readOnlyAssetId;
  let stockedOutAssetId;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');

    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });

    seedAssetIdPo({ td, poNumber, stamp, serials: [disassemblyParent] })
      .then((seed) => {
        laptopProductId = seed.laptopProductId;
        return seedGeneratedAssetIds({
          poNumber,
          categoryId: laptopCategoryId,
          productId: laptopProductId,
          quantity: 1,
        });
      })
      .then(([id]) => {
        readOnlyAssetId = id;
        // A second asset, driven to StockedOut here in the HOOK rather than in
        // an it(). Seeding inside a test would make TC11 depend on run order and
        // would strand it under any tag filter that dropped the seeding test.
        return seedGeneratedAssetIds({
          poNumber,
          categoryId: laptopCategoryId,
          productId: laptopProductId,
          quantity: 1,
        });
      })
      .then(([id]) => {
        stockedOutAssetId = id;
        return aidStockOutSerial({
          serialNumber: stockedOutAssetId,
          reason: LC.stockOutReason.sold,
          description: 'Search lifecycle UI automation — stocked-out fixture',
        });
      })
      .then(() =>
        // Two children, so TC08's "the table holds two rows" is a real count and
        // not a tautology over a single row.
        seedDisassemblyChildren({
          parentSerialNumber: disassemblyParent,
          selectedItemSerialNumber: disassemblyParent,
          categoryId: laptopCategoryId,
          productId: laptopProductId,
          quantity: 2,
        }),
      );
  });

  beforeEach(() => {
    cy.authSession('admin');
    page.visit();
  });

  after(() => {
    apiDeletePO(poNumber);
  });

  // ── Searching ───────────────────────────────────────────────────────────

  // Use case — main flow: the reason the screen exists
  it('SW-AIDL-TC01: searching a known asset ID renders the flow tree and the tabs', { tags: ['@smoke'] }, () => {
    page.searchFor(readOnlyAssetId);
    page.assertResultShown();
    page.assertThisItemContains(readOnlyAssetId);
    // The humanised flow label, not the raw enum. `getFlowLabel` maps
    // GENERATE_ASSET_ID -> "Generate Asset ID" in the FE only, so a backend
    // rename would leave the raw value on screen and this is what catches it.
    page.assertThisItemContains(LC.ui.flowLabelGenerate);
    page.assertAllTabsShown();
  });

  // Use case — the other identifier a worker might have to hand. The disassembly
  // parent was imported and scanned, so it has a serial and NO asset ID; looking
  // it up can only have gone through the serial branch of the lookup.
  it('SW-AIDL-TC02: the lifecycle can also be reached by serial number', { tags: ['@regression'] }, () => {
    page.searchFor(disassemblyParent);
    page.assertResultShown();
    page.assertThisItemContains(disassemblyParent);
  });

  // EP — the empty-input partition. The button is `disabled={!searchValue.trim()}`,
  // so the guard is client-side and no request should ever leave the browser.
  it('SW-AIDL-TC03: search is disabled while the field is empty, so no request is sent', { tags: ['@regression'] }, () => {
    cy.intercept('GET', '**/products/asset-id/lifecycle/**').as('lifecycle');

    page.assertSearchButtonDisabled();

    // Whitespace only — the component trims before enabling, so the button must
    // stay disabled. This is the boundary the API twin covers as API-TC06.
    page.typeSearchTerm(LC.identifier.epBlank);
    page.assertSearchButtonDisabled();

    page.typeSearchTerm(readOnlyAssetId);
    page.assertSearchButtonEnabled();

    // Nothing above clicked Search, so the alias must never have fired.
    cy.get('@lifecycle.all').should('have.length', 0);
  });

  // Use case — the deep link. The lookup fires from a mount-time useEffect, so
  // the intercept has to be registered BEFORE the visit; registering it after
  // would miss the request and the wait would hang.
  it('SW-AIDL-TC04: landing with ?assetId= searches on arrival without a click', { tags: ['@regression'] }, () => {
    cy.intercept('GET', '**/products/asset-id/lifecycle/**').as('deepLink');
    page.visitWithAssetId(readOnlyAssetId);
    cy.wait('@deepLink').its('response.statusCode').should('eq', 200);
    page.waitForResult();
    page.assertThisItemContains(readOnlyAssetId);
  });

  // State transition — searching pushes the term into the query string, which is
  // what makes a result linkable in a ticket. TC04 proves the other half: that a
  // link produced this way actually reloads the same result.
  it('SW-AIDL-TC05: searching writes the term into the URL so the result is shareable', { tags: ['@regression'] }, () => {
    page.assertUrlHasNoAssetId();
    page.searchFor(readOnlyAssetId);
    page.assertUrlCarriesAssetId(readOnlyAssetId);
  });

  // ── Failure path ────────────────────────────────────────────────────────

  // Decision table — lookup resolves vs lookup 404s. The FE surfaces the
  // SERVER's message (`error?.response?.data?.error?.message`), so asserting the
  // searched term appears in it is what proves the server message reached the
  // user rather than the generic client fallback.
  it('SW-AIDL-TC06: an unknown asset ID surfaces the server message and renders no result', { tags: ['@regression'] }, () => {
    page.typeSearchTerm(LC.identifier.epUnknown);
    page.clickSearch();
    page.assertLookupFailedFor(LC.identifier.epUnknown);
    page.assertNoResultShown();
  });

  // Error guessing — the stale-result trap. `onError` sets lifecycleData to
  // null, so a failed lookup after a successful one must leave the pane empty. A
  // user who did not notice the toast would otherwise be reading the PREVIOUS
  // asset's history while believing it belongs to the one they just typed.
  it('SW-AIDL-TC12: a failed lookup leaves the previous result cleared rather than stale', { tags: ['@regression'] }, () => {
    page.searchFor(readOnlyAssetId);
    page.assertThisItemContains(readOnlyAssetId);

    page.typeSearchTerm(LC.identifier.epUnknown);
    page.clickSearch();
    page.assertLookupFailedFor(LC.identifier.epUnknown);
    page.assertNoResultShown();
  });

  // ── Flow tree ───────────────────────────────────────────────────────────

  // Use case — provenance. The PO step only renders when the item has a PO, so
  // its presence is itself part of the assertion.
  it('SW-AIDL-TC07: the Purchase Order card shows the PO the asset came from', { tags: ['@smoke'] }, () => {
    page.searchFor(readOnlyAssetId);
    page.assertPurchaseOrderStepShows(poNumber);
  });

  // ── Tabs ────────────────────────────────────────────────────────────────

  // Use case — the Components tab is where a teardown is read back, and cost is
  // the column that matters: disassembly mints children at 0, so a regression
  // that started inheriting the parent's cost would show up here first.
  it('SW-AIDL-TC08: the Components tab lists the children of a disassembled machine with their cost', { tags: ['@regression'] }, () => {
    page.searchFor(disassemblyParent);
    page.openComponentsTab();

    page
      .disassembledComponentRows()
      .should('have.length', 2)
      .each(($row) => {
        cy.wrap($row).should('contain.text', LC.ui.zeroCost);
        cy.wrap($row).should('contain.text', LC.ui.flowLabelDisassembly);
      });
  });

  // EP — the "no linkage" partition. Both work-order tables render their own
  // empty state independently, and the second one (via assembly) is easy to drop
  // in a refactor because it is only reachable for assembled parts.
  it('SW-AIDL-TC09: an asset with no work orders shows the empty-state message on both WO tables', { tags: ['@regression'] }, () => {
    page.searchFor(readOnlyAssetId);
    page.openWorkOrdersTab();
    page.assertNoWorkOrderLinkage();
    page.assertNoParentWorkOrderLinkage();
  });

  // Use case — the timeline is the screen's headline feature. The badge count is
  // asserted because it is derived from `timeline.length` and is what tells a
  // user there is anything worth opening the tab for.
  it('SW-AIDL-TC10: the Timeline tab lists the asset\'s operations and badges the count', { tags: ['@regression'] }, () => {
    page.searchFor(readOnlyAssetId);
    page.assertTimelineTabHasCountBadge();
    page.openTimelineTab();
    page.assertTimelineNotEmpty();
    // The humanised label, not the raw action: `getActionLabel` maps
    // ASSET_ID_ITEM_CREATE -> "Asset ID Created" in the FE only.
    page.assertTimelineShows(LC.ui.timelineLabelItemCreate);
  });

  // Use case — a non-Available asset must render its state honestly. The chip
  // and the timeline label are two independent renderings of the same fact, and
  // the humanised label ("Stock Out") comes from a FE lookup table that a
  // backend rename would silently desync.
  it('SW-AIDL-TC11: a stocked-out asset renders its status chip and its stock-out on the timeline', { tags: ['@regression'] }, () => {
    page.searchFor(stockedOutAssetId);
    page.assertThisItemStatus(data.statuses.stockedOut);
    page.openTimelineTab();
    page.assertTimelineShows(LC.ui.timelineLabelStockOut);
  });
});
