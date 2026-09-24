/**
 * POClose-ExportExcel.cy.js
 * ============================================================
 * Spec: PO Close modal — Export Excel (TC01–TC09)
 * Test Plan: cypress/qa/testPlans/purchaseOrder/plan.md (SW-POC-EXP)
 * Page Object: cypress/pageObjects/PurchaseOrder/POClosePage.js
 *
 * Seeding strategy:
 *   - exportRamPO:    RAM product-only, expected=5, received=3 (missing=2)
 *   - exportLaptopPO: Laptop serialized, 4 serials, 3 scanned (missing=1)
 *   - For content tests (TC04–TC09): use exportRamPO as oracle via API
 *     GET /purchase-orders/checkStatus/:poNumber before triggering export.
 *   - Export API: GET /purchase-orders/:poNumber/report/export
 *     The FE triggers it via blob download from apiService.get — we intercept the
 *     response to verify it returns status 200 and a non-empty payload.
 *   All POs deleted in after().
 *
 */

import POClosePage from '../../pageObjects/PurchaseOrder/POClosePage';
import td from '../../fixtures/PurchaseOrder/poCloseData.json';
import {
  seedProductOnlyPO,
  seedSerializedPO,
  apiCheckIn,
  apiScanSerial,
  apiGetCheckStatus,
  apiDeletePO,
} from '../../support/helpers/poCloseHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';

const suiteStamp    = `EXP-${Date.now()}`;
const exportRamPO   = `PO-POC-EXP-RAM-${suiteStamp}`;
const exportLaptopPO = `PO-POC-EXP-LPT-${suiteStamp}`;

// ── Export helpers ────────────────────────────────────────────────────────────

function getApiBase() {
  const env = Cypress.env('API_BASE_URL');
  if (typeof env === 'string' && env.length > 0) return env;
  return Cypress.config('baseUrl').replace(/\/$/, '').replace('://', '://api.');
}

/**
 * Download the PO Close Excel report for poNumber via cy.request (encoding:'base64'),
 * parse all sheets with the parseExcelBuffer task, and return { sheets }.
 * Asserts HTTP 200 before resolving.
 */
function fetchPOExport(poNumber) {
  return cy.getAuthToken().then((token) =>
    cy.request({
      method: 'GET',
      url: `${getApiBase()}/purchase-orders/${encodeURIComponent(poNumber)}/report/export`,
      headers: { Authorization: `Bearer ${token}` },
      encoding: 'base64',
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, 'export HTTP status').to.eq(200);
      return cy.task('parseExcelBuffer', { base64Data: response.body });
    })
  );
}

const sn = (label) => `SN-EXP-${label}-${suiteStamp}`;
const laptopSerials = [sn('L1'), sn('L2'), sn('L3'), sn('L4')];

let ramProductId;
let laptopProductId;
let checkStatusOracle; // from GET /purchase-orders/checkStatus/:poNumber

const page = new POClosePage();

// ── Suite setup ───────────────────────────────────────────────────────────────

before(() => {
  cy.authSession('admin');
  cy.visit('/');
  importAttributesAndCategories();

  // Seed exportRamPO: expected=5, received=3
  seedProductOnlyPO({ td, poNumber: exportRamPO, stamp: `${suiteStamp}-r`, quantity: 5 })
    .then((id) => {
      ramProductId = id;
      return apiCheckIn({ poNumber: exportRamPO, productId: id, quantity: 3 });
    });

  // Seed exportLaptopPO: 4 serials, scan 3
  seedSerializedPO({ td, poNumber: exportLaptopPO, stamp: `${suiteStamp}-l`, serials: laptopSerials })
    .then((id) => {
      laptopProductId = id;
      [sn('L1'), sn('L2'), sn('L3')].forEach((s) => apiScanSerial(exportLaptopPO, s));
    });
});

after(() => {
  cy.authSession('admin');
  cy.visit('/purchase-orders');
  cy.getAuthToken().then(() => {
    [exportRamPO, exportLaptopPO].forEach((po) => apiDeletePO(po));
  });
});

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  cy.authSession('admin');
  page.visit();
});

// ── Test Cases ────────────────────────────────────────────────────────────────

describe('SW-POC-EXP — Export Excel from PO Close modal', () => {
  it('SW-POC-EXP-TC01 — The Export button is visible on the PO Close modal', { tags: ["@smoke"] }, () => {
    // Use Case: Export Excel button is rendered in the modal footer
    page.searchPO(exportRamPO);
    page.clickClosePOButton(exportRamPO);
    page.waitForModalReady();
    page.assertExportButtonVisible();
  });

  it('SW-POC-EXP-TC02 — Clicking Export on a product-only PO triggers a file download without error', { tags: ["@smoke"] }, () => {
    // Use Case: export API call returns 200 for a product-only PO
    page.searchPO(exportRamPO);
    page.clickClosePOButton(exportRamPO);
    page.waitForModalReady();

    // Intercept the export API call to assert it returns successfully
    cy.intercept('GET', `**/purchase-orders/${exportRamPO}/report/export**`).as('exportDownload');
    page.clickExportExcel();
    // Export triggers a blob download via apiService.get — intercept it
    cy.wait('@exportDownload', { timeout: 30000 }).then((interception) => {
      expect(interception.response.statusCode).to.eq(200);
    });
  });

  it('SW-POC-EXP-TC03 — Clicking Export on a serialized items PO triggers a file download without error', { tags: ["@regression"] }, () => {
    // Use Case: export API call returns 200 for a serialized PO
    page.searchPO(exportLaptopPO);
    page.clickClosePOButton(exportLaptopPO);
    page.waitForModalReady();

    cy.intercept('GET', `**/purchase-orders/${exportLaptopPO}/report/export**`).as('exportLaptop');
    page.clickExportExcel();
    cy.wait('@exportLaptop', { timeout: 30000 }).then((interception) => {
      expect(interception.response.statusCode).to.eq(200);
    });
  });

  it('SW-POC-EXP-TC04 — Exported Excel Sheet 2 contains exactly one product data row for a single-product PO', { tags: ["@smoke"] }, () => {
    // EP: exportRamPO has 1 RAM product → Sheet 2 "Product Breakdown" has exactly 1 data row
    // after the column header row ("Product / Serial Number", "Type", …).
    fetchPOExport(exportRamPO).then(({ sheets }) => {
      const s2 = sheets.find((s) => s.name === 'Product Breakdown');
      expect(s2, 'Sheet "Product Breakdown" exists').to.exist;
      const headerIdx = s2.allRows.findIndex((r) => r[0] === 'Product / Serial Number');
      expect(headerIdx, 'column header row found').to.be.greaterThan(-1);
      // Data rows follow the header; filter out any trailing empty/null rows
      const dataRows = s2.allRows.slice(headerIdx + 1).filter((r) => r[0] != null && r[0] !== '');
      expect(dataRows, 'exactly 1 product row').to.have.length(1);
      // The product row's "Exp Qty" column (index 3) should equal the seeded expected qty
      expect(dataRows[0][3], 'product Exp Qty = 5').to.eq(5);
    });
  });

  it('SW-POC-EXP-TC05 — Exported Excel Expected Quantity matches PO expected quantities', { tags: ["@smoke"] }, () => {
    // EP: exportRamPO expected=5 → Sheet 1 "Original Expected" Quantity cell = 5.
    // Oracle (apiGetCheckStatus) is cross-referenced so any backend drift fails the oracle assert first.
    cy.getAuthToken().then(() => {
      apiGetCheckStatus(exportRamPO).then((status) => {
        const oracle = status?.originalExpectedQuantity ?? 0;
        expect(oracle, 'oracle originalExpectedQuantity').to.eq(5);

        fetchPOExport(exportRamPO).then(({ sheets }) => {
          const s1 = sheets.find((s) => s.name === 'PO Summary');
          const row = s1.allRows.find((r) => r[0] === 'Original Expected');
          expect(row, '"Original Expected" row in Sheet 1').to.exist;
          expect(row[2], 'Quantity cell matches oracle').to.eq(oracle);
        });
      });
    });
  });

  it('SW-POC-EXP-TC06 — Exported Excel Received Quantity matches what was stocked in', { tags: ["@smoke"] }, () => {
    // EP: exportRamPO received=3 → Sheet 1 "Original Received" Quantity cell = 3.
    cy.getAuthToken().then(() => {
      apiGetCheckStatus(exportRamPO).then((status) => {
        const oracle = status?.originalReceivedQuantity ?? 0;
        expect(oracle, 'oracle originalReceivedQuantity').to.eq(3);

        fetchPOExport(exportRamPO).then(({ sheets }) => {
          const s1 = sheets.find((s) => s.name === 'PO Summary');
          const row = s1.allRows.find((r) => r[0] === 'Original Received');
          expect(row, '"Original Received" row in Sheet 1').to.exist;
          expect(row[2], 'Quantity cell matches oracle').to.eq(oracle);
        });
      });
    });
  });

  it('SW-POC-EXP-TC07 — Exported Excel shows correct shortfall in the Incoming (PO File) row', { tags: ["@smoke"] }, () => {
    // EP: expected=5 received=3 → remaining=2 → Sheet 1 "Incoming (PO File) — not yet received"
    // Quantity cell = 2. This row (built in poDetail.service.ts) only appears when
    // poFileIncoming > 0; the shortfall formula is max(0, originalExpectedQty - originalReceivedQty).
    fetchPOExport(exportRamPO).then(({ sheets }) => {
      const s1 = sheets.find((s) => s.name === 'PO Summary');
      const row = s1.allRows.find(
        (r) => typeof r[0] === 'string' && r[0].startsWith('Incoming (PO File)')
      );
      expect(row, '"Incoming (PO File)" row present (shortfall > 0)').to.exist;
      expect(row[2], 'shortfall quantity = 2').to.eq(2);
    });
  });

  it('SW-POC-EXP-TC08 — Exported Excel has no Extra Incoming row when received does not exceed expected', { tags: ["@regression"] }, () => {
    // EP (no extras): exportRamPO received=3 < expected=5 → backend skips the "Extra Incoming"
    // row entirely (only added when totalExtraIncoming > 0).
    fetchPOExport(exportRamPO).then(({ sheets }) => {
      const s1 = sheets.find((s) => s.name === 'PO Summary');
      const extrasRow = s1.allRows.find(
        (r) => typeof r[0] === 'string' && r[0].startsWith('Extra Incoming')
      );
      expect(extrasRow, '"Extra Incoming" row absent when received < expected').to.be.undefined;
    });
  });

  it('SW-POC-EXP-TC09 — Oracle confirms totalExtraIncoming = 0 and no Extra Incoming row in export', { tags: ["@regression"] }, () => {
    // BVA (lower boundary = 0): exportRamPO received=3 < expected=5 → no over-received items.
    // Both the checkStatus oracle and the exported Sheet 1 must agree: extras = 0.
    cy.getAuthToken().then(() => {
      apiGetCheckStatus(exportRamPO).then((status) => {
        expect(status?.totalExtraIncoming ?? 0, 'oracle totalExtraIncoming = 0').to.eq(0);

        fetchPOExport(exportRamPO).then(({ sheets }) => {
          const s1 = sheets.find((s) => s.name === 'PO Summary');
          const extrasRow = s1.allRows.find(
            (r) => typeof r[0] === 'string' && r[0].startsWith('Extra Incoming')
          );
          expect(extrasRow, '"Extra Incoming" row absent (oracle + sheet agree on zero)').to.be.undefined;
        });
      });
    });
  });
});
