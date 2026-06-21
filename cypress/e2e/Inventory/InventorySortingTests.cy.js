/**
 * InventorySortingTests.cy.js
 * ============================================================
 * Spec: Inventory → Column sorting (/inventory products grid)
 * Page Object: InventoryGridPage.js
 *
 * The grid is server-side MRT: clicking a sortable header adds sortBy + sortOrder to
 * GET /products. enableSortingRemoval:false → clicks cycle asc ↔ desc (never clears).
 * A RAM category is selected (?categoryId=) so the column set is deterministic.
 *
 */

import InventoryGridPage from '../../pageObjects/Inventory/InventoryGridPage';
import InvViewPage from '../../pageObjects/InvViewPage';
import td from '../../fixtures/exportTestData.json';
import urls from '../../fixtures/urls.json';
import { seedProductOnlyPO, deletePO } from '../../support/helpers/exportSeedingHelpers';
import { importAttributesAndCategories, ensureCommonAttributesOptional }
  from '../../support/helpers/attributeHelpers';

const stamp = `SRT-${Date.now()}`;
const ramPo  = `PO-SRT-${stamp}`;

// TC04/TC05 — two additional products with A/Z-prefixed stamps so that their
// Memory Generation values sort predictably:
//   DDR4-AAA-SRT-<ts>  <  DDR4-SRT-<ts>  <  DDR4-ZZZ-SRT-<ts>
// Searching by `stamp` matches all three (common suffix SRT-<ts>).
const stampA  = `AAA-${stamp}`;
const stampZ  = `ZZZ-${stamp}`;
const ramPoA  = `PO-SRT-A-${stamp}`;
const ramPoZ  = `PO-SRT-Z-${stamp}`;

const SORT_COLUMN = 'Memory Generation';
let ramCatId;

describe('Inventory Column Sorting', { tags: ['@regression'] }, () => {
  const grid    = new InventoryGridPage();
  const invPage = new InvViewPage();

  before(() => {
    cy.adminSession();
    cy.visit(urls.dashboard);
    importAttributesAndCategories();
    ensureCommonAttributesOptional();
    seedProductOnlyPO({ td, poNumber: ramPo,  stamp,  quantity: 5 });
    seedProductOnlyPO({ td, poNumber: ramPoA, stamp: stampA, quantity: 3 });
    seedProductOnlyPO({ td, poNumber: ramPoZ, stamp: stampZ, quantity: 7 });
    cy.getAuthToken().then((token) =>
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/categories?page=1&page_size=200`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        const list = res.body?.data?.list || res.body?.data || res.body?.list || [];
        ramCatId = list.find((c) => c.name === td.categories.ram)?.id;
      })
    );
  });

  after(() => {
    cy.then(() => deletePO(ramPo));
    cy.then(() => deletePO(ramPoA));
    cy.then(() => deletePO(ramPoZ));
  });

  beforeEach(() => {
    cy.adminSession();
    cy.visit(`/inventory?categoryId=${ramCatId}`);
    cy.get('[role="progressbar"]', { timeout: 60000 }).should('not.exist');
    cy.get('table tbody tr', { timeout: 60000 }).should('have.length.greaterThan', 0);
  });

  // Use Case — sorting a column ascends (aria-sort) and triggers a server refetch.
  // The sortBy/sortOrder request params are a backend concern covered by API specs;
  // here we assert the user-visible sort state + that the manual-sort refetch fires.
  it('SW-INV-SRT-TC01 — sorting a column ascends and refetches', { tags: ['@smoke'] }, () => {
    grid.interceptProductsList('products');
    grid.clickSortHeader(SORT_COLUMN);
    grid.assertHeaderSorted(SORT_COLUMN, 'ascending');
    cy.wait('@products').its('response.statusCode').should('be.lessThan', 400);
  });

  // State Transition — a second click flips to descending (no clear, per enableSortingRemoval:false).
  it('SW-INV-SRT-TC02 — a second click flips to descending', () => {
    grid.clickSortHeader(SORT_COLUMN);
    grid.assertHeaderSorted(SORT_COLUMN, 'ascending');
    grid.clickSortHeader(SORT_COLUMN);
    grid.assertHeaderSorted(SORT_COLUMN, 'descending');
  });

  // Decision Table — sorting within a selected category: the refetch keeps the categoryId.
  it('SW-INV-SRT-TC03 — sorting keeps the active category filter', () => {
    grid.interceptProductsList('products');
    grid.clickSortHeader(SORT_COLUMN);
    grid.assertHeaderSorted(SORT_COLUMN, 'ascending');
    cy.wait('@products').its('request.query.categoryId').should('eq', String(ramCatId));
  });

  // State Transition — ascending state: rendered rows are ordered A→Z for the sort column.
  // Three products are seeded with predictable Memory Generation values:
  //   DDR4-AAA-SRT-<ts>  <  DDR4-SRT-<ts>  <  DDR4-ZZZ-SRT-<ts>
  // Searching by `stamp` isolates exactly these rows so the assertion is deterministic.
  it('SW-INV-SRT-TC04 — ascending sort renders rows in A→Z order', () => {
    cy.intercept('GET', /\/products\?/).as('searchGet');
    invPage.searchInventory(stamp);
    cy.wait('@searchGet');
    cy.get('[role="progressbar"]', { timeout: 15000 }).should('not.exist');

    grid.interceptProductsList('sortGet');
    grid.clickSortHeader(SORT_COLUMN);
    grid.assertHeaderSorted(SORT_COLUMN, 'ascending');
    cy.wait('@sortGet');
    cy.get('[role="progressbar"]', { timeout: 15000 }).should('not.exist');

    grid.readColumnValues(SORT_COLUMN).then((values) => {
      expect(values.length, 'at least 2 seeded rows visible').to.be.greaterThan(1);
      const cmp = values[0].localeCompare(values[values.length - 1]);
      expect(cmp, `ascending: first "${values[0]}" should be ≤ last "${values[values.length - 1]}"`).to.be.lessThan(1);
    });
  });

  // State Transition — descending state: rendered rows are ordered Z→A for the sort column.
  it('SW-INV-SRT-TC05 — descending sort renders rows in Z→A order', () => {
    cy.intercept('GET', /\/products\?/).as('searchGet');
    invPage.searchInventory(stamp);
    cy.wait('@searchGet');
    cy.get('[role="progressbar"]', { timeout: 15000 }).should('not.exist');

    // First click → ascending (not asserted as data order here, covered by TC04)
    grid.clickSortHeader(SORT_COLUMN);
    grid.assertHeaderSorted(SORT_COLUMN, 'ascending');

    grid.interceptProductsList('sortGet');
    grid.clickSortHeader(SORT_COLUMN);
    grid.assertHeaderSorted(SORT_COLUMN, 'descending');
    cy.wait('@sortGet');
    cy.get('[role="progressbar"]', { timeout: 15000 }).should('not.exist');

    grid.readColumnValues(SORT_COLUMN).then((values) => {
      expect(values.length, 'at least 2 seeded rows visible').to.be.greaterThan(1);
      const cmp = values[0].localeCompare(values[values.length - 1]);
      expect(cmp, `descending: first "${values[0]}" should be ≥ last "${values[values.length - 1]}"`).to.be.greaterThan(-1);
    });
  });
});
