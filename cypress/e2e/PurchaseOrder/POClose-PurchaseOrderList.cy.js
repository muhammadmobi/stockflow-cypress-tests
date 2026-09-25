/**
 * POClose-PurchaseOrderList.cy.js
 * ============================================================
 * Spec: Purchase Orders tab — list quantities and status column
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (SW-POC-LIST-TC01–TC07)
 * Page Object: cypress/pageObjects/PurchaseOrder/POClosePage.js
 *
 * Seeding strategy:
 *   - One RAM (product-only) PO per run, expected qty=5.
 *   - TC01–TC04, TC07: use these shared POs (no close — read-only quantity assertions).
 *   - TC05: uses closePO — closed in-test (must run after TC07).
 *   - TC06: searches a guaranteed-missing PO number (no seeding needed).
 *   - All created POs are deleted in after().
 *
 */

import POClosePage from '../../pageObjects/PurchaseOrder/POClosePage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  apiCheckIn,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';

const suiteStamp = `LIST-${Date.now()}`;
const mainPO     = `PO-POC-LIST-${suiteStamp}`;
const closePO    = `PO-POC-LIST-CL-${suiteStamp}`;
const EXPECTED   = 5;
const RECEIVED   = 3;

let mainProductId;
let closePOProductId;

const page = new POClosePage();

// ── Suite setup ───────────────────────────────────────────────────────────────

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  cy.getAuthToken().then(() => {
    // Ensure categories/attributes are present (RAM Automation Cat)
    importAttributesAndCategories();

    // Seed main PO (expected=5, received=3 via check-in)
    seedProductOnlyPO({ td, poNumber: mainPO, stamp: `${suiteStamp}-m`, quantity: EXPECTED })
      .then((id) => {
        mainProductId = id;
        return apiCheckIn({ poNumber: mainPO, productId: id, quantity: RECEIVED });
      });

    // Seed close PO (expected=4, received=4 — perfect match, will be closed in TC05)
    seedProductOnlyPO({ td, poNumber: closePO, stamp: `${suiteStamp}-c`, quantity: 4 })
      .then((id) => {
        closePOProductId = id;
        return apiCheckIn({ poNumber: closePO, productId: id, quantity: 4 });
      });
  });
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    apiDeletePO(mainPO);
    apiDeletePO(closePO);
  });
});

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  cy.authSession('admin');
  page.visit();
});

// ── Test Cases ────────────────────────────────────────────────────────────────

describe('SW-POC-LIST — Purchase Orders list quantity columns', () => {
  it('SW-POC-LIST-TC01 — Searching a PO by number shows it in the list with the expected quantity set at creation @smoke', () => {
    // Use Case: admin searches for PO → row appears with correct Expected: cell value
    page.searchPO(mainPO);
    cy.contains('td', mainPO).should('be.visible');
    cy.contains('td', mainPO)
      .closest('tr')
      .find('td[data-index="5"]')
      .within(() => {
        cy.contains('Expected:').next().should('have.text', String(EXPECTED));
      });
  });

  it('SW-POC-LIST-TC02 — After partially stocking in items, the available quantity in the PO list matches what was stocked in via check-in @smoke', () => {
    // Use Case: "Available:" row in the Quantities cell reflects check-in count
    // For a product-only PO, available = received (no stock-outs on PO receiving flow)
    page.searchPO(mainPO);
    cy.contains('td', mainPO)
      .closest('tr')
      .find('td[data-index="5"]')
      .within(() => {
        cy.contains('Available:').next().should('have.text', String(RECEIVED));
      });
  });

  it('SW-POC-LIST-TC03 — Incoming quantity shown equals expected minus received for a partially received PO @regression', () => {
    // EP: Incoming = expected - received; validated against the precise "Incoming:" cell
    const expectedIncoming = EXPECTED - RECEIVED;
    page.searchPO(mainPO);
    cy.contains('td', mainPO)
      .closest('tr')
      .find('td[data-index="5"]')
      .within(() => {
        cy.contains('Incoming:').next().should('have.text', String(expectedIncoming));
      });
  });

  it('SW-POC-LIST-TC04 — Incoming quantity shows zero when all expected items have been received @regression', () => {
    // BVA (lower boundary = 0): when received = expected, Incoming cell must be exactly 0
    page.searchPO(closePO);
    cy.contains('td', closePO)
      .closest('tr')
      .find('td[data-index="5"]')
      .within(() => {
        cy.contains('Incoming:').next().should('have.text', '0');
      });
  });

  it('SW-POC-LIST-TC07 — Available quantity equals the expected quantity when all items have been received @regression', () => {
    // BVA (upper boundary): fully received PO → Available = Expected (no shortfall)
    // closePO was seeded with expected=4 and received=4
    page.searchPO(closePO);
    cy.contains('td', closePO)
      .closest('tr')
      .find('td[data-index="5"]')
      .within(() => {
        cy.contains('Available:').next().should('have.text', '4');
      });
  });

  it('SW-POC-LIST-TC05 — PO status changes to "Closed" in the list after the PO has been successfully closed @smoke', () => {
    // State Transition: Open → Closed
    page.searchPO(closePO);
    cy.contains('td', closePO).closest('tr').should('contain.text', td.listPage.openStatus);

    // Open the modal and close the PO
    page.clickClosePOButton(closePO);
    page.waitForModalReady();
    page.submitClosePO();

    // Status should now show Closed
    page.searchPO(closePO);
    cy.contains('td', closePO).closest('tr').should('contain.text', td.listPage.closedStatus);
  });

  it('SW-POC-LIST-TC06 — Searching for a non-existent PO number returns no results @regression', () => {
    // EP (invalid partition): unknown PO number → empty results
    const nonExistentPO = `PO-NONEXISTENT-${suiteStamp}-ZZZ`;
    page.searchPO(nonExistentPO);
    cy.contains('td', nonExistentPO).should('not.exist');
  });
});
