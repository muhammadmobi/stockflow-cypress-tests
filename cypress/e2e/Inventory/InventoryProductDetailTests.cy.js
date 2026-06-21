/**
 * InventoryProductDetailTests.cy.js
 * ============================================================
 * Spec: Inventory → Product Detail page (/inventory/:productName/:id)
 * Page Object: InventoryProductDetailPage.js
 *
 * Clicking a product row on /inventory opens ItemView. NOTE (verified): the
 * /inventory entry always sets action:'item' (ItemList.tsx:522), so ItemView mounts
 * the ItemViewItemList serial table for every product — the product-only PO-accordion
 * / Storage-Locations panels (plan PD2) are NOT reachable from this entry, so they
 * are not covered here. These cases cover the reachable surface: navigation, the
 * Product Details accordion, refresh, and the serial table (render + serial link).
 *
 */

import InvViewPage from '../../pageObjects/InvViewPage';
import InventoryProductDetailPage from '../../pageObjects/Inventory/InventoryProductDetailPage';
import td from '../../fixtures/exportTestData.json';
import urls from '../../fixtures/urls.json';
import { seedProductItemPO, apiScanSerial, deletePO } from '../../support/helpers/exportSeedingHelpers';
import { importAttributesAndCategories, ensureCommonAttributesOptional }
  from '../../support/helpers/attributeHelpers';

const stamp = `PD-${Date.now()}`;
const laptopPo = `PO-PD-${stamp}`;
const laptopSearch = `${td.products.laptop.modelNumber}-${stamp}`; // ThinkPad T14-...
const serials = [`SN-PD-${stamp}-1`, `SN-PD-${stamp}-2`];

describe('Inventory Product Detail', { tags: ['@regression'] }, () => {
  const invPage = new InvViewPage();
  const pd = new InventoryProductDetailPage();

  before(() => {
    cy.adminSession();
    cy.visit(urls.dashboard);
    importAttributesAndCategories();
    ensureCommonAttributesOptional();
    seedProductItemPO({ td, poNumber: laptopPo, stamp, serials }).then(() => {
      serials.forEach((sn) => apiScanSerial(laptopPo, sn)); // → Available
    });
  });

  after(() => {
    cy.then(() => deletePO(laptopPo));
  });

  beforeEach(() => {
    cy.adminSession();
    cy.visit(urls.inventory);
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
    invPage.searchInventory(laptopSearch);
    invPage.openItemList(laptopSearch); // click row → /inventory/:name/:id
    // Wait for the detail serial table to load before any per-test assertion.
    cy.get('tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);
  });

  // Use Case — row click lands on the detail page and shows the product.
  it('SW-INV-PD-TC01 — opening a product navigates to its detail page', { tags: ['@smoke'] }, () => {
    pd.assertOnDetailPage();
    pd.assertHeaderShows(laptopSearch);
  });

  // Use Case — Product Details accordion expands to show attribute values.
  it('SW-INV-PD-TC02 — Product Details accordion reveals attributes', () => {
    pd.expandProductDetails();
    pd.assertProductDetailsContains(td.products.laptop.brand); // "Lenovo"
  });

  // Use Case — Refresh product detail re-fetches the item list without navigating.
  it('SW-INV-PD-TC03 — Refresh re-fetches the product detail', () => {
    pd.interceptItems('items');
    pd.clickRefresh();
    cy.wait('@items').its('response.statusCode').should('be.lessThan', 400);
    pd.assertOnDetailPage();
  });

  // Use Case — the serial table renders the seeded serials with status.
  it('SW-INV-PD-TC04 — the serial table lists the product items', { tags: ['@smoke'] }, () => {
    pd.assertSerialRow(serials[0], 'Available');
  });

  // Use Case — the serial cell links to the asset-id search.
  it('SW-INV-PD-TC05 — a serial links to the asset-id search', () => {
    pd.clickSerialLink(serials[0]);
    cy.url({ timeout: 10000 }).should('match', /\/asset-id\/search\?assetId=/);
  });

  // State Transition — leaving the detail returns to the inventory list.
  it('SW-INV-PD-TC06 — back navigation returns to the inventory list', () => {
    cy.go('back');
    cy.url({ timeout: 10000 }).should('include', '/inventory');
    cy.get('table tbody tr', { timeout: 20000 }).should('have.length.greaterThan', 0);
  });
});
