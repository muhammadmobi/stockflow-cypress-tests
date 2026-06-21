/**
 * InventoryRestockTests.cy.js
 * ============================================================
 * Spec: Inventory → Restock (product-only row action, /inventory-only gate)
 * Page Object: InventoryRestockPage.js
 *
 * API spec RestockAPI. These cases assert the user-visible /inventory row action:
 * the menu gate (product-only only), the modal qty validation (BVA), and that
 * submitting fires POST /products/restock-product. The existing 15-InvActionRestock
 * spec drives /MobileViewScreen — NOT this /inventory row action — so this gate is
 * uncovered.
 *
 * Verified gates (ProductListActionMenu.tsx:417-433):
 *   - "Restock" renders only when backPath === '/inventory'
 *   - disabled when categoryInfo.allowItems || allowVariants (→ enabled for
 *     product-only RAM rows, disabled for item-bearing Laptop rows)
 *   - RestockModel.tsx: form#reportDescrepany-form, #quantity (min 1), submit
 *     "Restock" → POST /products/restock-product { id, quantity }
 *
 */

import InvViewPage from '../../pageObjects/InvViewPage';
import InventoryRestockPage from '../../pageObjects/Inventory/InventoryRestockPage';
import data from '../../fixtures/Inventory/restockData.json';
import td from '../../fixtures/exportTestData.json';
import urls from '../../fixtures/urls.json';
import { seedProductOnlyPO, seedProductItemPO, apiScanSerial, apiCheckInProductOnly, deletePO }
  from '../../support/helpers/exportSeedingHelpers';
import { importAttributesAndCategories, ensureCommonAttributesOptional }
  from '../../support/helpers/attributeHelpers';
import { apiSetGeneralConfigFlags } from '../../support/helpers/generalConfigApiHelpers';

// Product-only stock-out via API (POST /products/stock-out, level "Product").
// Restock RESTORES previously stocked-out quantity (product.service.ts:5712 —
// rejects 4xx unless stockedOutItems.sum >= quantity), so the seed must stock
// out a buffer the tests can restock against.
function apiStockOutProductOnly({ poNumber, productId, quantity, reason }) {
  return cy.getAuthToken().then((token) =>
    cy.request({
      method: 'POST',
      url: `${Cypress.env('API_BASE_URL')}/products/stock-out`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { id: productId, poNumber, quantity: Number(quantity), reason, description: 'restock-seed', level: 'Product' },
      failOnStatusCode: false,
    }).then((res) => expect(res.status, 'seed stock-out HTTP').to.be.lessThan(400))
  );
}

// Every inventory bucket the report exposes for a single product. These are the
// keys returned in `data.reports` by GET /incoming-items/reports (the summary
// computed by simplifiedReports). StockedOut and Sold are DISTINCT: a stock-out
// row counts as Sold when reason='Sold', else StockedOut (incoming-item.service.ts:3700-3715).
const BUCKET_KEYS = ['Available', 'Incoming', 'Expected', 'Received', 'Reserved', 'Missing', 'Damaged', 'Disputed', 'StockedOut', 'Sold'];

// Snapshot all of a product's inventory buckets via the public reports endpoint
// (the same summary the inventory/product-detail UI renders). Used to prove what
// restock moves (Available, StockedOut) and what it must leave untouched.
function apiGetBuckets(productId) {
  return cy.getAuthToken().then((token) =>
    cy.request({
      method: 'GET',
      url: `${Cypress.env('API_BASE_URL')}/incoming-items/reports?id=${productId}`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status, 'reports HTTP').to.be.lessThan(400);
      const reports = (res.body.data || res.body)?.reports || {};
      const out = {};
      BUCKET_KEYS.forEach((k) => { out[k] = Number(reports[k] ?? 0); });
      return out;
    })
  );
}

const suiteStamp = `RS-${Date.now()}`;
const ramStamp = `${suiteStamp}-r`;
const laptopStamp = `${suiteStamp}-l`;

const ramPo = `PO-RS-RAM-${suiteStamp}`;
const laptopPo = `PO-RS-LPT-${suiteStamp}`;

const ramSearchTerm = `${td.products.ram.memoryGeneration}-${ramStamp}`;     // DDR4-...
const laptopSearchTerm = `${td.products.laptop.modelNumber}-${laptopStamp}`; // ThinkPad T14-...
const sn = `SN-RS-${suiteStamp}`;

describe('Inventory Restock', { tags: ['@regression'] }, () => {
  const invPage = new InvViewPage();
  const restock = new InventoryRestockPage();
  let ramProductId; // captured from the seed; used to read availableQuantity back

  before(() => {
    cy.adminSession();
    cy.visit(urls.dashboard);
    importAttributesAndCategories();
    ensureCommonAttributesOptional();
    // QA leaves stock-out gates ON; open them so the seed stock-out succeeds.
    apiSetGeneralConfigFlags({
      requireWorkOrderForStockOut: false,
      enablePoForStockOut: false,
      enableInventoryStockOut: true,
    });

    // Product-only RAM: check in 10, stock out 8 → leaves a stocked-out buffer
    // the restock tests can restore against (TC01 restocks 5, TC02 restocks 1).
    // Reason 'Lost' (NOT 'Sold') so the buffer lands in the StockedOut bucket and
    // the Sold bucket stays 0 — lets TC01 assert StockedOut↓ while Sold is unchanged.
    seedProductOnlyPO({ td, poNumber: ramPo, stamp: ramStamp, quantity: 10 }).then((id) => {
      ramProductId = id;
      apiCheckInProductOnly({ poNumber: ramPo, productId: id, quantity: 10 }).then(() => {
        apiStockOutProductOnly({ poNumber: ramPo, productId: id, quantity: 8, reason: 'Lost' });
      });
    });

    // Item-bearing Laptop (Restock disabled gate, RS-TC05).
    seedProductItemPO({ td, poNumber: laptopPo, stamp: laptopStamp, serials: [sn] }).then(() => {
      apiScanSerial(laptopPo, sn);
    });
  });

  after(() => {
    cy.then(() => {
      deletePO(ramPo);
      deletePO(laptopPo);
    });
  });

  beforeEach(() => {
    cy.adminSession();
    cy.visit(urls.inventory);
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
  });

  // Use Case (results integrity) — a product-only Restock moves exactly the right
  // stock: Available rises by the restocked amount, the StockedOut buffer falls by
  // the same amount (restock restores stocked-out stock → availableQuantity,
  // product.service.ts:5723), and NO other bucket (Incoming/Expected/Received/
  // Reserved/Missing/Damaged/Disputed/Sold) is disturbed.
  it('SW-INV-RS-TC01 — Restock increases Available, reduces StockedOut, leaves other buckets unchanged', { tags: ['@smoke'] }, () => {
    const qty = data.qty.epTypical;
    apiGetBuckets(ramProductId).then((before) => {
      invPage.searchInventory(ramSearchTerm);
      restock.interceptRestock('restock');
      restock.openRestockForProduct(ramSearchTerm);
      restock.typeQty(qty).submit();
      cy.wait('@restock').then(({ request, response }) => {
        // RHF submits the number input's value as a string ("5"); coerce to compare.
        expect(Number(request.body.quantity), 'restock quantity in payload').to.eq(qty);
        expect(response.statusCode, 'restock HTTP').to.be.lessThan(400);
      });
      restock.assertModalClosed();
      apiGetBuckets(ramProductId).then((after) => {
        expect(after.Available - before.Available, 'Available rose by the restocked qty').to.eq(qty);
        expect(before.StockedOut - after.StockedOut, 'StockedOut fell by the restocked qty').to.eq(qty);
        ['Incoming', 'Expected', 'Received', 'Reserved', 'Missing', 'Damaged', 'Disputed', 'Sold'].forEach((k) =>
          expect(after[k], `${k} unchanged by restock`).to.eq(before[k])
        );
      });
    });
  });

  // BVA — lower valid boundary qty=1 accepted.
  it('SW-INV-RS-TC02 — BVA: Restock qty=1 (lower valid boundary) accepted', () => {
    invPage.searchInventory(ramSearchTerm);
    restock.interceptRestock('restock');
    restock.openRestockForProduct(ramSearchTerm);
    restock.typeQty(data.qty.bvaLowerValid).submit();
    cy.wait('@restock').its('response.statusCode').should('be.lessThan', 400);
    restock.assertModalClosed();
  });

  // BVA — qty=0 rejected by the modal (min:1); form stays open.
  it('SW-INV-RS-TC03 — BVA: Restock qty=0 rejected (modal stays open)', () => {
    invPage.searchInventory(ramSearchTerm);
    restock.openRestockForProduct(ramSearchTerm);
    restock.typeQty(data.qty.bvaLowerInvalid).submit();
    restock.assertModalOpen();
    restock.assertValidationError();
  });

  // EP — negative qty rejected (invalid partition); form stays open.
  it('SW-INV-RS-TC04 — EP: negative Restock quantity rejected', () => {
    invPage.searchInventory(ramSearchTerm);
    restock.openRestockForProduct(ramSearchTerm);
    restock.typeQty(data.qty.epNegative).submit();
    restock.assertModalOpen();
    restock.assertValidationError();
  });

  // Error Guessing — Restock is disabled for an item-bearing (allowItems) product.
  it('SW-INV-RS-TC05 — Restock is disabled for an item-bearing product', () => {
    invPage.searchInventory(laptopSearchTerm);
    restock.assertRestockDisabledForProduct(laptopSearchTerm);
  });

  // Error Guessing (results integrity) — you cannot restock more than the stocked-out
  // buffer. The service rejects when requested qty > stocked-out sum
  // (product.service.ts:5715, atomic rollback), so NO bucket moves and the modal
  // stays open with an error (RestockModel onError does not close it).
  it('SW-INV-RS-TC06 — restocking more than the stocked-out buffer is rejected; quantities unchanged', () => {
    apiGetBuckets(ramProductId).then((before) => {
      invPage.searchInventory(ramSearchTerm);
      restock.interceptRestock('restock');
      restock.openRestockForProduct(ramSearchTerm);
      restock.typeQty(data.qty.epAboveBuffer).submit();
      cy.wait('@restock').then(({ response }) => {
        const failed = response.statusCode >= 400 || response.body?.success === false || !!response.body?.error;
        expect(failed, 'restock beyond the stocked-out buffer is rejected').to.be.true;
      });
      restock.assertModalOpen(); // onError keeps the dialog open
      apiGetBuckets(ramProductId).then((after) => {
        expect(after.Available, 'Available unchanged on a rejected restock').to.eq(before.Available);
        expect(after.StockedOut, 'StockedOut unchanged on a rejected restock').to.eq(before.StockedOut);
      });
    });
  });
});
