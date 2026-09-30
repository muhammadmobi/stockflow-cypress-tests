/**
 * Warehouse Location Report UI Tests — SW-WLR-TC01..14
 * =============================================================================
 * Mirrors:  cypress/e2e/api/WarehouseLocationReportAPI.cy.js
 * Frontend: Frontend/src/components/Reports/WarehouseLocationReport/index.tsx +
 *           ProductDetailPanel.tsx
 * Plan:     cypress/qa/testPlans/Reports/warehouseLocationReport/plan.md
 *
 * Scope note (wiring layer): every backend contract — envelope shape, the
 * hasItems / itemType / categoryId / assignedOnly / search / sort / pagination
 * filters, the 400 validations, the lifecycle state transitions and the export
 * binary — is proven deterministically by WarehouseLocationReportAPI.cy.js.
 * This UI suite therefore stays at the wiring layer: does the screen mount,
 * do the summary cards render, does each control reach that proven backend with
 * the right query param, does a row expand into the detail panel, and does the
 * export button fire the download request.  It seeds one light mixed PO (a
 * serialized laptop with one serial assigned to a Bin + a non-serialized RAM
 * qty assigned to that Bin) so both product types are guaranteed visible under
 * the screen's default "Assigned only" filter, then isolates them with a
 * per-run search stamp — no dependence on ambient QA data.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/warehouseLocationReportData.json';
import WarehouseLocationReportPage from '../../../pageObjects/WarehouseLocationReportPage';
import { seedMixedPO, apiScanSerial, apiCheckIn, apiDeletePO } from '../../../support/helpers/poCloseHelpers';
import {
  createDisposableBinChain,
  sweepDisposableLocations,
  loadProductIntoLocationViaApi,
} from '../../../support/helpers/wmsLocationHelpers';

describe('Warehouse Location Report Tests', () => {
  const page = new WarehouseLocationReportPage();

  const stamp = `WLRUI${Date.now()}`;
  const poNumber = `PO-WLR-UI-${stamp}`;
  const serialA = `SNA-${stamp}`;
  const serialB = `SNB-${stamp}`;

  // Only the RAM product id is needed downstream (the non-serialized quantity
  // assignment). The laptop product id and the bin id were captured but never
  // read — the seeding chain uses `bin.id` directly from the callback.
  let ramId;

  // POST /location-assignments/:locationId/items — assign a serialized item to a
  // Bin. No exported helper covers the serial (item) variant — only the qty
  // variant (loadProductIntoLocationViaApi) is exported — so it is inlined here,
  // authenticated the same window-token way every WMS helper is.
  function assignSerialToLocation(locationId, serialNumber) {
    const baseUrl = Cypress.env('API_BASE_URL');
    return cy.getAuthToken().then((token) =>
      cy
        .request({
          method: 'POST',
          url: `${baseUrl}/location-assignments/${locationId}/items`,
          headers: { Authorization: `Bearer ${token}` },
          body: { serialNumber },
          failOnStatusCode: false,
        })
        .then((res) => {
          expect(res.status, 'assign serial to location').to.be.lessThan(400);
        }),
    );
  }

  before(() => {
    // A mounted, authenticated window so every seeding helper's
    // cy.getAuthToken() (window-sourced) resolves a Keycloak token.
    cy.authSession('admin');
    cy.visit('/');

    seedMixedPO({
      td,
      poNumber,
      ramStamp: `${stamp}R`,
      ramQty: data.seed.ramQty,
      laptopStamp: stamp,
      serials: [serialA, serialB],
    }).then(({ ramProductId }) => {
      ramId = ramProductId;
      return apiScanSerial(poNumber, serialA)
        .then(() => apiScanSerial(poNumber, serialB))
        .then(() => apiCheckIn({ poNumber, productId: ramProductId, quantity: data.seed.ramQty }));
    });

    // Assign SN_A to a Bin (serial) and RAM qty to the same Bin (non-serialized)
    // so both seeded products carry ≥1 WMS assignment → both are visible under
    // the screen's default "Assigned only" filter.
    createDisposableBinChain().then(({ bin }) => {
      assignSerialToLocation(bin.id, serialA);
      loadProductIntoLocationViaApi(bin.id, ramId, data.seed.nsLocationDelta);
    });
  });

  after(() => {
    if (poNumber) apiDeletePO(poNumber);
    sweepDisposableLocations();
  });

  beforeEach(() => {
    cy.authSession('admin');
    page.visit();
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC01-TC02  Page load + summary
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Use Case — main flow: navigating to the report renders the grid
  it('SW-WLR-TC01: report screen loads and renders the product table', { tags: ['@smoke'] }, () => {
    page.assertLoaded();
  });

  // Technique: Use Case — the five summary StatCards render from data.summary
  it('SW-WLR-TC02: the five summary stat cards render', { tags: ['@smoke'] }, () => {
    page.assertStatCardsVisible();
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC03  Search
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Use Case — free-text search narrows the grid to the seeded product
  it('SW-WLR-TC03: search narrows the grid to the seeded product and sends the search param', { tags: ['@smoke'] }, () => {
    page.search(stamp);
    page.assertLastListUrl((u) => expect(u).to.include(`search=${stamp}`));
    page.assertRowVisible(stamp);
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC04  Category filter reaches the backend
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Decision Table — Category select supplied → request carries categoryId
  it('SW-WLR-TC04: choosing a category sends categoryId to the backend', { tags: ['@regression'] }, () => {
    page.selectFirstConcreteCategory().then((id) => {
      page.assertLastListUrl((u) => expect(u).to.include(`categoryId=${id}`));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC05-TC07  Product Type filter (EP + decision table)
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Equivalence Partitioning — Serialized partition → hasItems=true
  it('SW-WLR-TC05: Product Type = Serialized sends hasItems=true and shows a Serialized chip', { tags: ['@regression'] }, () => {
    page.search(stamp);
    page.selectProductType(data.filters.productType.serialized);
    page.assertLastListUrl((u) => expect(u).to.include('hasItems=true'));
    page.loc.typeChipInRow(stamp).should('contain.text', data.labels.serializedChip);
  });

  // Technique: Equivalence Partitioning — Non-Serialized partition → hasItems=false
  it('SW-WLR-TC06: Product Type = Non-Serialized sends hasItems=false and shows a Non-Serialized chip', { tags: ['@regression'] }, () => {
    page.search(stamp);
    page.selectProductType(data.filters.productType.nonSerialized);
    page.assertLastListUrl((u) => expect(u).to.include('hasItems=false'));
    page.loc.typeChipInRow(stamp).should('contain.text', data.labels.nonSerializedChip);
  });

  // Technique: Decision Table — Asset Serialized → hasItems=true AND itemType=asset
  it('SW-WLR-TC07: Product Type = Asset Serialized sends hasItems=true and itemType=asset', { tags: ['@regression'] }, () => {
    page.selectProductType(data.filters.productType.assetSerialized);
    page.assertLastListUrl((u) => {
      expect(u).to.include('hasItems=true');
      expect(u).to.include('itemType=asset');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC08  Assignment filter (decision table)
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Decision Table — Assignment=All omits assignedOnly; default (Assigned only) sends assignedOnly=true
  it('SW-WLR-TC08: Assignment = All (incl. unassigned) omits assignedOnly from the request', { tags: ['@regression'] }, () => {
    page.selectAssignment(data.filters.assignment.all);
    page.assertLastListUrl((u) => expect(u).to.not.include('assignedOnly=true'));
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC09-TC10  Expandable detail panel
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Use Case — expanding a serialized row loads the per-item detail panel
  it('SW-WLR-TC09: expanding a serialized product shows its serial in the detail panel', { tags: ['@regression'] }, () => {
    page.search(stamp);
    page.selectProductType(data.filters.productType.serialized);
    page.expandRowContaining(stamp);
    page.loc.detailSerialHeader().should('be.visible');
    page.loc.detailCellWithText(serialA).should('exist');
  });

  // Technique: Equivalence Partitioning — the non-serialized branch of the detail
  // panel renders a quantity-per-location table (Quantity header) instead of serials
  it('SW-WLR-TC10: expanding a non-serialized product shows the quantity-location detail panel', { tags: ['@regression'] }, () => {
    page.search(stamp);
    page.selectProductType(data.filters.productType.nonSerialized);
    page.expandRowContaining(stamp);
    // The non-serialized branch of ProductDetailPanel renders a
    // "Quantity distribution across N location(s)" caption above a quantity
    // table (vs the serialized branch's serial rows) — assert that caption,
    // which uniquely identifies the NS panel and retries until it paints.
    page.loc.detailNsCaption().should('be.visible');
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC11  Export
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Use Case — the Export button fires the /export download request
  it('SW-WLR-TC11: Export button triggers the export download request', { tags: ['@regression'] }, () => {
    // The button's transient "Downloaded!" label is deliberately NOT asserted:
    // index.tsx reverts it after ~700ms, so on a fast response the flip can be
    // over before Cypress first queries the element, and the retry window then
    // expires against the reverted "Export" text — a race that fails only on
    // fast runs. The request/response assertion below is the actual contract
    // (the button fired the export and the backend accepted it); the label is
    // cosmetic feedback with no user-visible consequence if missed.
    page.triggerExport().its('response.statusCode').should('be.lessThan', 400);
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC12  Pagination summary
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Use Case — the bottom toolbar renders the "Record: X - Y of Z" summary
  it('SW-WLR-TC12: pagination record summary is displayed', { tags: ['@regression'] }, () => {
    page.loc.paginationRecordText().should('be.visible');
  });

  // ════════════════════════════════════════════════════════════════════════
  // TC13-TC14  Empty state + search reset
  // ════════════════════════════════════════════════════════════════════════

  // Technique: Error Guessing — a search that matches nothing yields no seeded row
  it('SW-WLR-TC13: a no-match search yields an empty grid (seeded row absent)', { tags: ['@regression'] }, () => {
    page.search(data.noMatchSearch);
    page.assertRowAbsent(stamp);
  });

  // Technique: Use Case — clearing the search box restores the unfiltered grid
  it('SW-WLR-TC14: clearing the search restores the grid', { tags: ['@regression'] }, () => {
    page.search(stamp);
    page.assertRowVisible(stamp);
    page.clearSearchViaBackspace();
    page.assertLoaded();
  });
});
