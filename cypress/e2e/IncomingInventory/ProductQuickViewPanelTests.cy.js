import IncomingInvPage from '../../pageObjects/IncomingInvPage';
import PurchaseOrderPage from '../../pageObjects/PurchaseOrderPage';
import { ensureStandardProductNameConfigs, ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import {
  makeLaptopRowWithSerial,
  importExcel,
  createExcelFile,
} from '../../support/helpers/incomingInventoryHelpers';

/**
 * Product Quick-View Pop-up Tests — Incoming Inventory
 * Covers: SW_INC_PQV_TC01 – SW_INC_PQV_TC08
 *
 * Feature under test (frontend commit f2a0e3b5c, "Convert product quick view to
 * split-screen pane on desktop"):
 *   Incoming Inventory shows a single product-level MRT table (no Serial Number
 *   column). Clicking a product-item row opens the quick-view pop-up
 *   (ProductQuickViewPanel) beside it, embedding the same InventoryItemsList
 *   (Serial Number column) the old in-place Item View used. The details/items
 *   page is reached from the row ⋮ menu.
 *   - Product table renders for a specific PO and for "All POs".
 *   - Row click opens the pop-up; its Close button returns to the table alone.
 *   - A stat-tile filter applies in place — it does not switch views.
 *
 * On the Product View / Item View pill strip — it has changed TWICE, so read
 * carefully before "fixing" anything here:
 *   1. f2a0e3b5c removed it, along with in-place view switching.
 *   2. a0c3d0da7 "Add flat Items pages and routes" (2026-08-06) re-added it as a
 *      NAVIGATION control, not a tab strip: List.tsx hard-codes value="product"
 *      and its onChange early-returns on anything but 'items', so Product View
 *      is permanently active and inert, while Item View routes to a standalone
 *      flat items page. This suite therefore asserts the strip is present with
 *      Product View active (assertProductViewPillActive), and never tries to
 *      switch views. The flat items page is out of scope here.
 *
 * Renamed 2026-08-11 from ProductViewItemViewTabTests.cy.js / SW_INC_PVIV_*: the
 * old name and IDs described in-place tab switching, which no longer exists in
 * any form, while the bodies had already been rewritten for the pop-up. Test IDs
 * are the test-design record per cypress/qa/SKILL.md, so they were renamed with
 * the behaviour rather than left to rot.
 *
 * Test-design technique: Use Case (open/close pop-up flow) + EP (valid partitions:
 * specific PO / All POs) + State Transition (table ↔ pop-up round-trip).
 *
 * Setup: one PO with one item-product (Laptop) seeded via Excel import so the
 *   pop-up has at least one row with a Serial Number cell.
 */
describe('Product Quick-View Pop-up Tests (SW_INC_PQV_TC01 – TC08)', () => {
  let incomingInvPage, purchaseOrderPage;
  let td;
  const createdPOs = [];
  let testPO;
  let laptopSerials;
  let runId;

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  function buildSerials(prefix, count) {
    return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, '0')}-${runId}`);
  }

  // ─── before() ──────────────────────────────────────────────────────────────
  before(() => {
    cy.fixture('productViewItemViewTabData').then((data) => {
      td = data;
      runId = ts();

      cy.authSession('admin');
      cy.visit('/');

      // Ensure "Laptop Automation Cat" exists (idempotent API call).
      // importAttributesAndCategories() is skipped — it uses a UI flow
      // (button#basic-button) that is fragile on some environments. The
      // category and its attributes are expected to already exist from prior
      // runs; this call is a safety net for fresh environments only.
      cy.getAuthToken().then((token) => {
        cy.request({
          method: 'POST',
          url: `${Cypress.env('API_BASE_URL')}/categories`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: { name: td.laptop.category, allowItems: true, allowVariants: false, allowVariantItems: false },
          failOnStatusCode: false,
        }).then((r) => cy.log(`Ensure category ${td.laptop.category}: HTTP ${r.status}`));
      });
      ensureStandardProductNameConfigs();
      ensureCommonAttributesOptional();

      incomingInvPage = new IncomingInvPage();
      purchaseOrderPage = new PurchaseOrderPage();

      const stamp = ts();
      testPO = `PO-PQV-${stamp}`;
      createdPOs.push(testPO);
      const fileName = `PQV-${stamp}.xlsx`;

      laptopSerials = buildSerials(`${td.laptop.serialPrefix}${stamp.slice(-4)}-`, td.laptop.quantity);
      const laptopRow = makeLaptopRowWithSerial(td);

      createExcelFile(fileName, laptopSerials.map((sn) => laptopRow(sn)));
      importExcel(fileName, testPO);
    });
  });

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      if (err?.message?.includes('Request failed with status code')) return false;
      return true;
    });
    cy.authSession('admin');
    cy.visit('/');
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC01 — EP (valid partition): a specific PO shows the product-level table
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC01
   * @technique     EP — valid partition (initial page state, specific PO)
   * @description   Selecting a specific PO renders the product-level MRT table
   *                (no Serial Number column — the serial table lives in the
   *                pop-up, see TC02) with the Product View pill active. The
   *                Item View pill is a link to the standalone flat items page,
   *                not an in-place tab, so nothing on this screen swaps views.
   * @expectedResult  Product View pill active; product table with >= 1 row and
   *                  no Serial Number column header.
   */
  it('SW_INC_PQV_TC01 – A specific PO renders the product-level table with Product View active', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);

    incomingInvPage.assertProductViewPillActive();
    incomingInvPage.assertProductViewColumnsPresent();
    incomingInvPage.verifyTableHasRows(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC02 — Use Case: a product-item row click opens the quick-view pop-up
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC02
   * @technique     Use Case — main flow (open the pop-up)
   * @description   Clicking a product-item row opens ProductQuickViewPanel beside
   *                the product table (it does NOT navigate away). The panel embeds
   *                InventoryItemsList, so it carries a "Serial Number" column and
   *                lists that product's serials.
   * @expectedResult  Pop-up is mounted with a Serial Number column and >= 1 item
   *                  row, and the URL is still the listing page.
   */
  it('SW_INC_PQV_TC02 – Clicking a product-item row opens the items pop-up with serial rows', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);

    // openItemsPopup asserts the pop-up's Serial Number column internally; the
    // assertions below are the test's own explicit oracle (a @smoke case should
    // not rely solely on a side-effect assertion inside a page-object helper).
    incomingInvPage.openItemsPopup(td.laptop.brand);
    incomingInvPage.assertItemsPopupHasRows(1);
    // The row click opens a pane — it must NOT navigate to the details page.
    cy.url().should('include', '/incoming-inventory').and('not.match', /\/incoming-inventory\/.+\/.+/);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC03 — State Transition: table → pop-up → table (round-trip)
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC03
   * @technique     State Transition — valid round-trip (table ↔ pop-up)
   * @description   Closing the quick-view pop-up (its Close IconButton) unmounts
   *                the serial table and leaves the product-level table alone on
   *                the page — the pop-up's open/closed states are reversible.
   * @expectedResult  After Close, no Serial Number column is present on the page.
   */
  it('SW_INC_PQV_TC03 – Closing the items pop-up returns to the product-level table', { tags: ['@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);

    // Open the items pop-up (serial column present), then close it and confirm
    // the product-level table (no Serial Number column) is shown again.
    incomingInvPage.openItemsPopup(td.laptop.brand);
    incomingInvPage.closeItemsPopup();
    incomingInvPage.assertProductViewColumnsPresent();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC04 — EP (valid partition): the All-POs view renders the same table
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC04
   * @technique     EP — valid partition (All POs selected)
   * @description   The "All POs" selection is the second valid partition of the
   *                PO dropdown. It renders the same product-level table (rows
   *                aggregated across every PO), with the same Product-View-active
   *                pill strip and no Serial Number column — i.e. the layout is
   *                identical across both partitions. (The strip is driven by
   *                isPoReport, which is true regardless of the PO selection
   *                because reportType defaults to 'PO'.)
   * @expectedResult  Product View pill active; product table with >= 1 aggregated row.
   */
  it('SW_INC_PQV_TC04 – Product-level table renders when All POs is selected', { tags: ['@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectAllPos();

    incomingInvPage.assertProductViewPillActive();
    incomingInvPage.assertProductViewColumnsPresent();
    // At least one product row must be visible across all POs.
    incomingInvPage.verifyTableHasRows(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC05 — Use Case: the pop-up is scoped to the selected PO's items
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC05
   * @technique     Use Case — alternate path (PO-scoped item list)
   * @description   The pop-up's InventoryItemsList is filtered by the selected
   *                PO, so it lists rows even when the items are still Incoming
   *                (not yet scanned) — the list API returns all statuses by
   *                default and an item row is created at import time, so the
   *                seeded laptops appear here.
   * @expectedResult  Pop-up lists >= 1 item row for a PO whose items were only
   *                  imported, never scanned.
   */
  it('SW_INC_PQV_TC05 – Items pop-up renders at least one row for a PO with imported items', { tags: ['@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);

    incomingInvPage.openItemsPopup(td.laptop.brand);
    // Public helper — the spec must not reach through the page object's private
    // _itemsPopup() to build its own pop-up-scoped query.
    incomingInvPage.assertItemsPopupHasRows(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC06 — State Transition: a stat-tile filter does not disturb the pop-up flow
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC06
   * @technique     State Transition — invariant across a filter change
   * @description   A stat-tile click (e.g. "Incoming") now filters the single
   *                product-level table IN PLACE — it no longer switches views.
   *                The invariant under test is that the row → pop-up interaction
   *                survives that state change: after the filtered refetch, a
   *                product-item row still opens its quick-view pop-up.
   *
   *                Replaces the old "active tab survives a stat click"
   *                (sessionStorage) contract, which died with the tab strip.
   * @expectedResult  Filtered fetch completes and the pop-up opens with its
   *                  Serial Number column on the re-rendered table.
   */
  it('SW_INC_PQV_TC06 – Stat-tile filtering applies in place and the items pop-up still opens', { tags: ['@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);

    cy.intercept('GET', /\/incoming-items\?.*status=/).as('statusFetch');
    incomingInvPage.clickStatTile('Incoming');
    cy.wait('@statusFetch', { timeout: 20000 });

    // The product-item row still opens its items pop-up after the stat filter.
    // openItemsPopup waits on the row (cy.contains ... should be.visible), so the
    // post-filter re-render is covered deterministically — no arbitrary sleep.
    incomingInvPage.openItemsPopup(td.laptop.brand);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC07 — State Transition: the pop-up flow survives a PO switch round-trip
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC07
   * @technique     State Transition — round-trip across the PO dropdown
   * @description   Switching specific PO → All POs → the same specific PO must
   *                leave the page in its initial state: the product-level table
   *                renders and a row click still opens the quick-view pop-up.
   *                Guards against stale per-PO view state surviving the switch.
   *
   *                Replaces the old "tab strip stays visible across the switch"
   *                contract, which died with the tab strip.
   * @expectedResult  Product table renders before and after the round-trip, and
   *                  the pop-up opens afterwards.
   */
  it('SW_INC_PQV_TC07 – Product table and items pop-up work after re-selecting the PO', { tags: ['@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);
    incomingInvPage.assertProductViewColumnsPresent();

    incomingInvPage.selectAllPos();
    incomingInvPage.selectPoNumber(testPO);

    incomingInvPage.assertProductViewColumnsPresent();
    incomingInvPage.openItemsPopup(td.laptop.brand);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC08 — Use Case: the product table renders real seeded data
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_PQV_TC08
   * @technique     Use Case — product table content verification
   * @description   The product-level table renders one row per product in the PO,
   *                each carrying the seeded brand value — proving real data was
   *                loaded rather than an empty table passing the structural
   *                assertions above. The "Quantity" column is always appended by
   *                List.tsx (accessorKey 'expectedQuantity') and must be present.
   * @expectedResult  Quantity header present; first row contains the seeded brand.
   */
  it('SW_INC_PQV_TC08 – Product table renders product rows with correct model data and Quantity column', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);

    incomingInvPage.assertProductViewColumnsPresent();

    // Table must contain at least one product row.
    incomingInvPage.verifyTableHasRows(1);

    // "Quantity" column header is always appended by List.tsx to every
    // Product View table (accessorKey: 'expectedQuantity', header: 'Quantity').
    cy.get('thead th', { timeout: 10000 }).should('contain.text', 'Quantity');

    // The seeded product's brand must appear in the first data row,
    // confirming the backend data was loaded and rendered correctly.
    // (Model Number may not appear in the default column set on all envs;
    // brand is always visible as it is part of the product name template.)
    cy.get('tbody tr', { timeout: 10000 })
      .first()
      .should('contain.text', td.laptop.brand);
  });

  // ─── after() ──────────────────────────────────────────────────────────────
  after(() => {
    if (createdPOs.length === 0) return;
    cy.authSession('admin');
    cy.visit('/');
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });
});
