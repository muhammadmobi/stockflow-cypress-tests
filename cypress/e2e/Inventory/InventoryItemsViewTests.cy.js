/**
 * InventoryItemsViewTests.cy.js
 * ============================================================
 * Spec: Inventory → Items View selection toolbar (/inventory)
 * Page Object: InventoryItemsViewPage.js
 *
 * The "Items View" tab renders a serial-row table with row selection. Selecting
 * rows surfaces inline actions ("N selected" + Stock Out Selected / Print Asset IDs
 * / Select all / Clear). "Select all" uses the lightweight GET /items/serial-numbers
 * (all matching, not just the page). Selection clears when the search/filter changes.
 *
 * Seeds a Laptop product with 3 Available serials via API and scopes the Items View
 * to them by searching the model so counts are deterministic.
 *
 */

import InvViewPage from '../../pageObjects/InvViewPage';
import InventoryItemsViewPage from '../../pageObjects/Inventory/InventoryItemsViewPage';
import td from '../../fixtures/exportTestData.json';
import urls from '../../fixtures/urls.json';
import { seedProductItemPO, apiScanSerial, deletePO } from '../../support/helpers/exportSeedingHelpers';
import { importAttributesAndCategories, ensureCommonAttributesOptional }
  from '../../support/helpers/attributeHelpers';

const suiteStamp = `IV-${Date.now()}`;
const laptopPo = `PO-IV-${suiteStamp}`;
const serials = [`SN-IV-${suiteStamp}-1`, `SN-IV-${suiteStamp}-2`, `SN-IV-${suiteStamp}-3`];
// Search by the serial prefix: both the items-list query AND the lightweight
// select-all serial-numbers endpoint match on serialNumber, so the filtered set
// is the same 3 rows in the table and in "Select all".
const serialPrefix = `SN-IV-${suiteStamp}`;

describe('Inventory Items View — selection', { tags: ['@regression'] }, () => {
  const invPage = new InvViewPage();
  const items = new InventoryItemsViewPage();

  before(() => {
    cy.adminSession();
    cy.visit(urls.dashboard);
    importAttributesAndCategories();
    ensureCommonAttributesOptional();
    // 3 Available serials so the Items View has a known, deterministic row set.
    seedProductItemPO({ td, poNumber: laptopPo, stamp: suiteStamp, serials }).then(() => {
      serials.forEach((sn) => apiScanSerial(laptopPo, sn));
    });
  });

  after(() => {
    cy.then(() => deletePO(laptopPo));
  });

  beforeEach(() => {
    cy.adminSession();
    cy.visit(urls.inventory);
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
    items.switchToItemsView();
    invPage.searchInventory(serialPrefix); // scope to the 3 seeded serials
  });

  // Use Case — Items View renders a serial table with a row-select checkbox column.
  it('SW-INV-IV-TC01 — Items View renders the items table with a checkbox column', { tags: ['@smoke'] }, () => {
    items.assertItemsTableRendered();
  });

  // Use Case — selecting one row surfaces the count and the bulk action buttons.
  it('SW-INV-IV-TC02 — selecting a row shows the count and enables bulk actions', { tags: ['@smoke'] }, () => {
    items.selectRow(0);
    items.assertSelectedCount(1);
    items.assertBulkButtonsVisible();
  });

  // Use Case — "Select all" is backed by the lightweight all-matching
  // serial-numbers endpoint (the distinguishing behaviour vs page-only selection).
  it('SW-INV-IV-TC03 — Select all is backed by the serial-numbers endpoint', () => {
    items.interceptSelectAll('serialNumbers');
    items.selectRow(0);
    items.assertSelectedCount(1);
    items.clickSelectAll();
    cy.wait('@serialNumbers').its('response.statusCode').should('be.lessThan', 400);
  });

  // State Transition — Clear resets the selection (inline actions disappear).
  it('SW-INV-IV-TC04 — Clear resets the selection', () => {
    items.selectRow(0);
    items.assertSelectedCount(1);
    items.clickClear();
    items.assertSelectionCleared();
  });

  // State Transition — changing the search clears the current selection.
  it('SW-INV-IV-TC05 — changing the search clears the selection', () => {
    items.selectRow(0);
    items.assertSelectedCount(1);
    invPage.searchInventory(serials[0]); // narrow the search → selection resets
    items.assertSelectionCleared();
  });
});
