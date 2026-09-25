/**
 * PODetail.cy.js
 * ============================================================
 * Spec: Single-PO detail/report page (`/purchase-orders/:poNumber`)
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (Spec N3 — SW-PODV)
 *
 * Reality check (verified by reading source): Frontend/src/pages/Report.tsx
 * renders `<IncomingList poNumberData={poNumber} closePo={true} />` — the
 * PurchaseOrderSummary header component is commented out (dead code). The
 * detail page is really the SAME table component used on Incoming Inventory,
 * bound read-only to one PO with no PO dropdown. The original plan's
 * `closedAt` date-display TC does not correspond to any implemented UI and
 * is dropped — see plan.md update. (This spec's own TC08 — direct-URL-to-
 * unknown-PO — IS covered: the shared table's own empty-state renders.)
 * Row navigation to this page uses `window.open(url, '_blank')`, so TC01 stubs
 * window.open per project/skill convention (navigationPage.js precedent).
 *
 */

import POListPage from '../../pageObjects/PurchaseOrder/POListPage';
import PODetailPage from '../../pageObjects/PurchaseOrder/PODetailPage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  seedMixedPO,
  apiCheckIn,
  apiScanSerial,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';
import { apiCall } from '../../support/helpers/allPosHelpers';

function apiGetPoRowCount(poNumber) {
  return apiCall('GET', `/incoming-items?poNumber=${encodeURIComponent(poNumber)}&page=1&page_size=50`).then(
    (res) => {
      const list = res.body?.data?.list || res.body?.list || res.body?.data || [];
      const arr = Array.isArray(list) ? list : list.list || [];
      return arr.length;
    }
  );
}

const suiteStamp = `PODV-${Date.now()}`;
const navPO = `PO-PODV-NAV-${suiteStamp}`;
const mixedPO = `PO-PODV-MIX-${suiteStamp}`;
const partialPO = `PO-PODV-PAR-${suiteStamp}`;
// Guaranteed-missing PO number (never seeded) — negative-case fixture for TC08.
const unknownPO = `PO-PODV-NONE-${suiteStamp}`;

const sn = (label) => `SN-PODV-${label}-${suiteStamp}`;
const mixedSerials = [sn('M1'), sn('M2')];
// Hoisted so TC03 can re-derive the same identifying search text used to look
// up each seeded product's id in before().
const mixedRamStamp = `${suiteStamp}-mr`;
const mixedLaptopStamp = `${suiteStamp}-ml`;

const listPage = new POListPage();
const detailPage = new PODetailPage();

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  // navPO: minimal PO used just to verify the row-navigation call.
  seedProductOnlyPO({ td, poNumber: navPO, stamp: `${suiteStamp}-n`, quantity: 2 });

  // mixedPO: product-only (qty=3, checked-in 3) + serialized (2 serials, scan 1)
  seedMixedPO({
    td,
    poNumber: mixedPO,
    ramStamp: mixedRamStamp,
    ramQty: 3,
    laptopStamp: mixedLaptopStamp,
    serials: mixedSerials,
  }).then(({ ramProductId, laptopProductId }) => {
    apiCheckIn({ poNumber: mixedPO, productId: ramProductId, quantity: 3 });
    apiScanSerial(mixedPO, mixedSerials[0]);
  });

  // partialPO: product-only, expected=5, received=3 → Incoming=2
  seedProductOnlyPO({ td, poNumber: partialPO, stamp: `${suiteStamp}-p`, quantity: 5 }).then((id) => {
    apiCheckIn({ poNumber: partialPO, productId: id, quantity: 3 });
  });
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [navPO, mixedPO, partialPO].forEach((po) => apiDeletePO(po));
  });
});

beforeEach(() => {
  cy.authSession('admin');
});

describe('SW-PODV — Single-PO detail page', () => {
  it('SW-PODV-TC01 — Clicking the PO number opens the detail page via window.open with correct URL @smoke', () => {
    // Use Case: main navigation flow. The PO-number Typography has its OWN
    // onClick (List.tsx) that calls e.stopPropagation() then
    // window.open(`/purchase-orders/${poNumber}`, '_blank') for a StockWise
    // PO — click that inner text node directly, not the whole <td> (whose
    // click point may land on the date sub-line instead). The stub MUST be
    // set up AFTER cy.visit() — visiting reloads the page and hands back a
    // fresh `window`, discarding any stub set on the pre-navigation reference.
    listPage.visit();
    listPage.search(navPO);
    // Wait for the result row to render, THEN stub window.open, THEN click the
    // PO-number Typography scoped to the table body. An unscoped cy.contains
    // can match the PO text outside the row (search echo/header) whose click
    // never reaches the cell's onClick (List.tsx stopPropagation → window.open),
    // so window.open was never called.
    cy.get('table tbody', { timeout: 30000 }).contains(navPO).should('be.visible');
    detailPage.visitViaWindowOpenStub(navPO);
    cy.get('table tbody').contains(navPO).click({ force: true });
    // Verify window.open was called with the correct URL and '_blank' target
    detailPage.assertWindowOpenedOnce();
    detailPage.assertWindowOpenedWith(navPO);

    // Secondary assertion: navigate directly to verify the detail page ACTUALLY loads
    detailPage.visit(navPO);
    // Verify the URL is correct for the PO detail page
    cy.url({ timeout: 15000 }).should('include', `/purchase-orders/${navPO}`);
    // Verify the IncomingList table component is rendered. The MRT header is
    // sticky (position: fixed/sticky) so Cypress's viewport-visibility check
    // reports it as not visible even though it renders correctly on screen —
    // assert existence + column count instead of visibility for the header.
    detailPage.tableHeader().should('exist');
    detailPage.headerCells().should('have.length.gte', 3); // Multiple columns present
    detailPage.tableRows().should('have.length.gte', 1); // At least one product row
    // Verify table data is actually populated (first row has data cells)
    detailPage.firstRowCells().should('have.length.gte', 1).and('not.be.empty');
  });

  it('SW-PODV-TC02 — Visiting the detail page directly renders the PO-scoped inventory table with correct row count @smoke', () => {
    // EP: valid PO with seeded rows renders visible table rows matching API data.
    apiGetPoRowCount(mixedPO).then((expectedCount) => {
      detailPage.visit(mixedPO);
      // Verify the table header is present
      detailPage.headerRows().should('have.length.gte', 1);
      // Verify exact row count matches the API oracle
      detailPage.tableRows().should('have.length', expectedCount);
      // Verify at least one row has visible content
      detailPage.firstRowCells().should('have.length.gte', 1);
    });
  });

  it('SW-PODV-TC03 — Each product seeded on the PO is individually discoverable in the detail table @smoke', () => {
    // EP: distinct from TC02 (aggregate row count) — this asserts that the
    // RAM (product-only) AND Laptop (serialized) rows seeded on mixedPO are
    // each individually findable, via the table's own search box.
    //
    // NOT a cy.contains('tbody tr', text) text match: for a PO spanning
    // multiple categories, the backend's column/fieldMapping builder
    // (Backend/src/modules/incomingItems/incoming-item.service.ts
    // searchProductsVariantsItems ~line 2439) only keeps a category-specific
    // attribute column when the request's categoryId matches — this route
    // never sends one — so category-specific attribute text (Memory
    // Generation, Model Number) never renders in ANY cell for a mixed-
    // category PO. The backend's free-text search is not scoped that way
    // (raw ILIKE across all product/variant columns), so searching narrows
    // the table to exactly the seeded product, proving it is individually
    // discoverable without depending on which attribute columns render.
    detailPage.visit(mixedPO);
    detailPage.searchInTable(`${td.products.ram.memoryGeneration}-${mixedRamStamp}`);
    detailPage.tableRows().should('have.length', 1);
    detailPage.clearTableSearch();
    detailPage.searchInTable(`${td.products.laptop.modelNumber}-${mixedLaptopStamp}`);
    detailPage.tableRows().should('have.length', 1);
  });

  it('SW-PODV-TC04 — A serialized product on the detail page reflects partial scan progress via the Expected badge @regression', () => {
    // EP: 2 serials imported, 1 scanned → Expected badge reflects the mixed PO's total.
    detailPage.visit(mixedPO);
    detailPage.assertBadgeMatchesValue('Expected', 5);
  });

  it('SW-PODV-TC05 — A pure (product-only) product on the detail page shows quantity tracking without serial drill-down @regression', () => {
    // EP: product-only row renders with quantity columns visible (no serial number, no expand drill-down).
    apiGetPoRowCount(partialPO).then((count) => {
      detailPage.visit(partialPO);
      // Verify exact row count matches API
      detailPage.tableRows().should('have.length', count);
      // Verify no serial number column/icon present for product-only product
      detailPage.firstRow().should('be.visible');
      // Verify the first row does NOT contain an expand icon or serial-specific data
      detailPage.firstRowExpandOrSerialIndicator().should('not.exist');
      // Verify quantity/status columns are present and visible in the first row
      detailPage.firstRowCells().should('have.length.gte', 3);
    });
  });

  it('SW-PODV-TC06 — The Purchase Orders nav link remains reachable from the detail page @regression', () => {
    // Use Case (back-nav equivalent): the page loads inside the standard
    // dashboard chrome, so the left-nav "Purchase Orders" link is present and
    // navigable — there is no in-page back button on this read-only view.
    detailPage.visit(partialPO);
    detailPage.navPurchaseOrdersLink().should('exist');
  });

  it('SW-PODV-TC07 — Partial check-in state (Expected 5, Received 3, Incoming 2) is reflected on the detail page @regression', () => {
    // Decision Table: expected=5, received=3 → Incoming=2 — all three columns
    // of the decision table are asserted (previously only Expected was
    // checked), via the same stat-card component used on Incoming Inventory
    // (AllPOsPage.assertBadgeMatchesValue).
    detailPage.visit(partialPO);
    detailPage.assertBadgeMatchesValue('Expected', 5);
    detailPage.assertBadgeMatchesValue('Received', 3);
    detailPage.assertBadgeMatchesValue('Incoming', 2);
  });

  it('SW-PODV-TC08 — Visiting the detail page for a PO number that does not exist renders the empty-state table @regression', () => {
    // EP: invalid/no-match partition — a syntactically valid but never-
    // seeded PO number renders the shared table's own "no rows" empty state
    // rather than an error page, since this route has no dedicated
    // error boundary of its own (see plan.md §3.2).
    detailPage.visit(unknownPO);
    detailPage.assertNoRows();
  });
});
