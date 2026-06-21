/**
 * InventoryStockOutTests.cy.js
 * ============================================================
 * Spec: Inventory → Stock Out (product-only + product-items 7-status)
 * Page Objects: InvViewPage.js
 *
 * Implementation notes (mapped to actual StockOutModal.tsx):
 *   - Stock-Out button text is "Stock Out" (space), located on each inventory
 *     row's actions cell. Clicking it opens StockOutModal scoped to that row's
 *     product (via setStockOutData) and posts to:
 *       /products/stock-out             (product-only, allowItems=false)
 *       /products/stockout-by-serial    (product-items, allowItems=true)
 *   - Form id: `stockoutform`. Field order: Reason → Description → Reference →
 *     (Quantity | Serial). The SN input is a PLAIN controlled input — NO chips,
 *     NO Enter key handler. Just type the SN and click the "Stock Out" submit
 *     button.
 *   - Success toast text: "Stocked out." (default) or BE message like
 *     "Item <SN> stocked out successfully" (items).
 *   - Error toast: BE message like
 *     "Item <SN> cannot be stocked out. It's status is <Status>".
 *
 * Seeding strategy (all API-based):
 *   Product-only — 3 RAM POs:
 *     ramPo1 qty=10 checked-in → TC19, TC21–TC25
 *     ramPo2 qty=3  checked-in → TC20 (full stock-out)
 *     ramPo3 qty=5  NOT checked-in → TC26 (zero available guard)
 *   Product-items — 2 Laptop POs:
 *     laptopPo    11 serials → TC27–TC31, TC33–TC39
 *     laptopPoRsv 1  serial  → TC32 (Reserved status)
 *
 */

import 'cypress-file-upload';
import InvViewPage    from '../../pageObjects/InvViewPage';
import sod            from '../../fixtures/inventoryStockOutData.json';
import td             from '../../fixtures/exportTestData.json';
import urls           from '../../fixtures/urls.json';
import {
  seedProductOnlyPO,
  seedProductItemPO,
  apiScanSerial,
  apiMarkItemStatus,
  apiStockOutSerial,
  apiReserveViaWorkOrder,
  deletePO,
  apiCheckInProductOnly,
} from '../../support/helpers/exportSeedingHelpers';
import { importAttributesAndCategories } from '../../support/helpers/attributeHelpers';

// ── Stamps & PO numbers ───────────────────────────────────────────────────────
const suiteStamp   = `SO-${Date.now()}`;
const ramStamp1    = `${suiteStamp}-r1`;
const ramStamp2    = `${suiteStamp}-r2`;
const ramStamp3    = `${suiteStamp}-r3`;
const laptopStamp  = `${suiteStamp}-l`;
const reservedStamp = `${suiteStamp}-lr`;

const ramPo1      = `PO-SO-R1-${suiteStamp}`;
const ramPo2      = `PO-SO-R2-${suiteStamp}`;
const ramPo3      = `PO-SO-R3-${suiteStamp}`;
const laptopPo    = `PO-SO-LPT-${suiteStamp}`;
const laptopPoRsv = `PO-SO-RSV-${suiteStamp}`;

// ── Search terms (built from the seeding stamp) ───────────────────────────────
const ramSearchTerm1     = `${td.products.ram.memoryGeneration}-${ramStamp1}`;
const ramSearchTerm2     = `${td.products.ram.memoryGeneration}-${ramStamp2}`;
const ramSearchTerm3     = `${td.products.ram.memoryGeneration}-${ramStamp3}`;
const laptopSearchTerm   = `${td.products.laptop.modelNumber}-${laptopStamp}`;
const reservedSearchTerm = `${td.products.laptop.modelNumber}-${reservedStamp}`;

// ── Laptop serials ────────────────────────────────────────────────────────────
const snAvail1   = `SN-AV1-${suiteStamp}`;
const snIncoming = `SN-INC-${suiteStamp}`;
const snDamaged  = `SN-DMG-${suiteStamp}`;
const snMissing  = `SN-MSS-${suiteStamp}`;
const snDisputed = `SN-DSP-${suiteStamp}`;
const snStockedOut = `SN-STO-${suiteStamp}`;
const snAvail2   = `SN-AV2-${suiteStamp}`;
const snAvail3   = `SN-AV3-${suiteStamp}`;
const snAvail4   = `SN-AV4-${suiteStamp}`;
const snAvail5   = `SN-AV5-${suiteStamp}`;
const snAvail6   = `SN-AV6-${suiteStamp}`;
const snReserved = `SN-RSV-${suiteStamp}`;

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('Inventory Stock Out', { tags: ['@regression'] }, () => {
  const invPage = new InvViewPage();

  before(() => {
    cy.adminSession();
    cy.visit(urls.dashboard);
    importAttributesAndCategories();

    // Product-only PO 1 (qty=10, checked in)
    seedProductOnlyPO({ td, poNumber: ramPo1, stamp: ramStamp1, quantity: 10 }).then((id) => {
      apiCheckInProductOnly({ poNumber: ramPo1, productId: id, quantity: 10 });
    });

    // Product-only PO 2 (qty=3, checked in)
    seedProductOnlyPO({ td, poNumber: ramPo2, stamp: ramStamp2, quantity: 3 }).then((id) => {
      apiCheckInProductOnly({ poNumber: ramPo2, productId: id, quantity: 3 });
    });

    // Product-only PO 3 (qty=5, NOT checked in → available=0)
    seedProductOnlyPO({ td, poNumber: ramPo3, stamp: ramStamp3, quantity: 5 });

    // Laptop PO (11 serials, various statuses)
    const allSerials = [
      snAvail1, snIncoming, snDamaged, snMissing, snDisputed,
      snStockedOut, snAvail2, snAvail3, snAvail4, snAvail5, snAvail6,
    ];
    seedProductItemPO({ td, poNumber: laptopPo, stamp: laptopStamp, serials: allSerials }).then(() => {
      apiScanSerial(laptopPo, snAvail1);
      apiMarkItemStatus({ poNumber: laptopPo, serialNumber: snDamaged,  status: 'Damaged'  });
      apiMarkItemStatus({ poNumber: laptopPo, serialNumber: snMissing,  status: 'Missing'  });
      apiMarkItemStatus({ poNumber: laptopPo, serialNumber: snDisputed, status: 'Disputed' });
      apiScanSerial(laptopPo, snStockedOut);
      apiStockOutSerial({ serialNumber: snStockedOut, reason: 'Sold', description: 'seeded' });
      apiScanSerial(laptopPo, snAvail2);
      apiScanSerial(laptopPo, snAvail3);
      apiScanSerial(laptopPo, snAvail4);
      apiScanSerial(laptopPo, snAvail5);
      apiScanSerial(laptopPo, snAvail6);
    });

    // Reserved PO (1 serial → scan → reserve via WO)
    seedProductItemPO({ td, poNumber: laptopPoRsv, stamp: reservedStamp, serials: [snReserved] }).then((id) => {
      apiScanSerial(laptopPoRsv, snReserved).then(() => {
        apiReserveViaWorkOrder({ productId: id, productName: `RSV-${suiteStamp}`, quantity: 1 });
      });
    });
  });

  after(() => {
    cy.then(() => {
      deletePO(ramPo1);
      deletePO(ramPo2);
      deletePO(ramPo3);
      deletePO(laptopPo);
      deletePO(laptopPoRsv);
    });
  });

  beforeEach(() => {
    cy.adminSession();
    cy.visit(urls.inventory);
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // Area 5 — Stock Out — Product-Only (RAM)
  // ==========================================================================
  describe('Area 5 — Stock Out — Product-Only (RAM)', () => {

    // Use Case — happy path
    it('SW-INV-SO-TC19 — Product-only stock-out qty=1 (Sold) → success toast', { tags: ['@smoke'] }, () => {
      invPage.searchInventory(ramSearchTerm1);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.typeStockOutQty(sod.productOnly.epStockOutQty);
      invPage.submitStockOut();

      // BE returns "Quantity 1 Stocked out for <product>..." or similar
      invPage.verifyStockOutSuccess(/Stocked out/i);
    });

    // EP — full-quantity partition: stock out all seeded qty (ramPo2 qty=3)
    it('SW-INV-SO-TC20 — Product-only: stock-out all available qty=3 → success', { tags: ['@regression'] }, () => {
      invPage.searchInventory(ramSearchTerm2);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.typeStockOutQty(sod.productOnly.seedQtyPo2);
      invPage.submitStockOut();

      invPage.verifyStockOutSuccess(/Stocked out/i);
    });

    // BVA — qty=0. FE `required:true` accepts "0" (non-empty string); BE rejects.
    it('SW-INV-SO-TC21 — BVA: product-only qty=0 → rejected (modal stays open)', { tags: ['@regression'] }, () => {
      invPage.searchInventory(ramSearchTerm1);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.typeStockOutQty(sod.productOnly.bvaLowerInvalid);
      invPage.submitStockOut();

      // Either FE blocks (modal stays open) or BE rejects (error toast + modal stays)
      invPage.assertStockOutFormOpen();
    });

    // BVA — qty=1 (lower valid boundary)
    it('SW-INV-SO-TC22 — BVA: product-only qty=1 → accepted', { tags: ['@smoke'] }, () => {
      invPage.searchInventory(ramSearchTerm1);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.typeStockOutQty(sod.productOnly.bvaLowerValid);
      invPage.submitStockOut();

      invPage.verifyStockOutSuccess(/Stocked out/i);
    });

    // EP — above available quantity
    it('SW-INV-SO-TC23 — EP: product-only qty>available → BE error', { tags: ['@regression'] }, () => {
      invPage.searchInventory(ramSearchTerm1);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.typeStockOutQty(sod.productOnly.epAboveAvailable);
      invPage.submitStockOut();

      // BE returns insufficient-qty error; modal stays open
      invPage.assertStockOutFormOpen();
    });

    // Use Case — missing required reason field
    it('SW-INV-SO-TC24 — Use Case: product-only submit without reason → blocked', { tags: ['@regression'] }, () => {
      invPage.searchInventory(ramSearchTerm1);
      invPage.clickStockOutRow();

      // No reason filled
      invPage.typeStockOutQty(sod.productOnly.epStockOutQty);
      invPage.submitStockOut();

      // Reason has required:true → inline error renders, form does not close
      invPage.assertStockOutFormOpen();
    });

    // Use Case — Sold reason with description accepted
    it('SW-INV-SO-TC25 — Use Case: product-only Sold reason + description accepted', { tags: ['@regression'] }, () => {
      invPage.searchInventory(ramSearchTerm1);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.typeStockOutDescription('Test stock-out');
      invPage.typeStockOutQty(sod.productOnly.epStockOutQty);
      invPage.submitStockOut();

      invPage.verifyStockOutSuccess(/Stocked out/i);
    });

    // Error Guessing — available=0. BE rejects any qty; modal stays open or error toast appears.
    it('SW-INV-SO-TC26 — Error Guessing: product-only available=0 → stock-out rejected', { tags: ['@regression'] }, () => {
      invPage.searchInventory(ramSearchTerm3);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.typeStockOutQty('1');
      invPage.submitStockOut();

      // BE rejects (no available qty). Modal stays open OR error toast visible.
      invPage.assertStockOutFormOpen();
    });
  });

  // ==========================================================================
  // Area 6 — Stock Out — Product-Items (Laptop) — 7-Status State Transition
  // ==========================================================================
  describe('Area 6 — Stock Out — Product-Items (Laptop)', () => {

    // State Transition — Available → StockedOut
    it('SW-INV-SO-TC27 — State Transition: Available → StockedOut (valid)', { tags: ['@smoke'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snAvail1);
      invPage.submitStockOut();

      // BE returns "Item <SN> stocked out successfully"
      invPage.verifyStockOutSuccess(/stocked out/i);
    });

    // State Transition — Incoming → stock-out rejected
    it('SW-INV-SO-TC28 — State Transition: Incoming item → stock-out rejected', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snIncoming);
      invPage.submitStockOut();

      // BE returns "Item <SN> cannot be stocked out. It's status is Incoming"
      invPage.verifyStockOutError(/cannot be stocked out|Failed/i);
    });

    // State Transition — Damaged → stock-out rejected
    it('SW-INV-SO-TC29 — State Transition: Damaged item → stock-out rejected', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snDamaged);
      invPage.submitStockOut();

      invPage.verifyStockOutError(/cannot be stocked out/);
    });

    // State Transition — Missing → stock-out rejected
    it('SW-INV-SO-TC30 — State Transition: Missing item → stock-out rejected', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snMissing);
      invPage.submitStockOut();

      invPage.verifyStockOutError(/cannot be stocked out|Failed/i);
    });

    // State Transition — Disputed → stock-out rejected
    it('SW-INV-SO-TC31 — State Transition: Disputed item → stock-out rejected', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snDisputed);
      invPage.submitStockOut();

      invPage.verifyStockOutError(/cannot be stocked out|Failed/i);
    });

    // State Transition — Reserved → stock-out rejected
    it('SW-INV-SO-TC32 — State Transition: Reserved item → stock-out rejected', { tags: ['@regression'] }, () => {
      invPage.searchInventory(reservedSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snReserved);
      invPage.submitStockOut();

      invPage.verifyStockOutError(/cannot be stocked out|reserved|Failed/i);
    });

    // State Transition — already StockedOut → duplicate rejected
    it('SW-INV-SO-TC33 — State Transition: already StockedOut item → duplicate rejected', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snStockedOut);
      invPage.submitStockOut();

      invPage.verifyStockOutError(/cannot be stocked out|StockedOut|already|Failed/i);
    });

    // EP — non-existent serial
    it('SW-INV-SO-TC34 — EP: non-existent serial → BE error', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(sod.serial.nonExistent);
      invPage.submitStockOut();

      invPage.verifyStockOutError(/not found|cannot|Failed/i);
    });

    // Use Case — missing reason on product-items form
    it('SW-INV-SO-TC35 — Use Case: product-items submit without reason → blocked', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      // No reason filled
      invPage.fillStockOutSerial(snAvail2);
      invPage.submitStockOut();

      // Reason is required → inline error renders, form stays open
      invPage.assertStockOutFormOpen();
    });

    // Use Case — reason "Stockout from BTO"
    it('SW-INV-SO-TC36 — Use Case: reason "Stockout from BTO" → accepted', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.bto);
      invPage.fillStockOutSerial(snAvail3);
      invPage.submitStockOut();

      invPage.verifyStockOutSuccess(/stocked out/i);
    });

    // Use Case — reason "Lost"
    it('SW-INV-SO-TC37 — Use Case: reason "Lost" → accepted', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.lost);
      invPage.fillStockOutSerial(snAvail4);
      invPage.submitStockOut();

      invPage.verifyStockOutSuccess(/stocked out/i);
    });

    // State Transition — verify Available → StockedOut state is reflected in the items table
    it('SW-INV-SO-TC38 — State Transition: Available → StockedOut status visible in items table after stock-out', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutReason(sod.reasons.sold);
      invPage.fillStockOutSerial(snAvail5);
      invPage.submitStockOut();
      invPage.verifyStockOutSuccess(/stocked out/i);

      // Navigate to product detail and check items table
      cy.visit(urls.inventory);
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickSearchResultRecord(laptopSearchTerm);

      cy.contains('td', snAvail5, { timeout: 10000 })
        .closest('tr')
        .within(() => {
          cy.contains(new RegExp(sod.statusEnums.stockedOut, 'i')).should('exist');
        });
    });

    // Use Case — close modal without submitting
    it('SW-INV-SO-TC39 — Use Case: close Stock-Out modal → no stock-out performed', { tags: ['@regression'] }, () => {
      invPage.searchInventory(laptopSearchTerm);
      invPage.clickStockOutRow();

      invPage.fillStockOutSerial(snAvail6);
      // Close modal without submitting
      invPage.closeStockOutModal();
      cy.get('form#stockoutform').should('not.exist');

      // Verify the item is still Available (no stock-out happened)
      invPage.clickSearchResultRecord(laptopSearchTerm);
      cy.contains('td', snAvail6, { timeout: 10000 })
        .closest('tr')
        .within(() => {
          cy.contains(new RegExp(sod.statusEnums.available, 'i')).should('exist');
        });
    });
  });
});
