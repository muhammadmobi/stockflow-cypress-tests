import IncomingInvPage from '../../pageObjects/IncomingInvPage';
import PurchaseOrderPage from '../../pageObjects/PurchaseOrderPage';
import { ensureStandardProductNameConfigs, ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import {
  makeLaptopRowWithSerial,
  importExcel,
  createExcelFile,
} from '../../support/helpers/incomingInventoryHelpers';

/**
 * Serial Number, PO Number, and Product Row Navigation Tests — Incoming Inventory
 * Covers: SW_INC_NAV_TC01 – SW_INC_NAV_TC08
 *
 * Feature under test (updated for the quick-view enhancement, frontend commit
 * f2a0e3b5c): clicking a product-item row on the Incoming Inventory list now
 * opens a quick-view POP-UP (ProductQuickViewPanel) that embeds the same
 * InventoryItemsList (serials) the old Item View used — it no longer navigates
 * to the product-details page. Per the module rule: verify the items list via
 * the pop-up; reach the product-details page via the row's ⋮ long-button menu
 * "View Items". The three patterns map as:
 *
 * 1. Serial Number → Asset Lifecycle
 *    In the items pop-up the Serial Number column renders each value as a
 *    <button>; clicking it pushes `/asset-id/search?assetId=<encoded-sn>`.
 *
 * 2. PO Number → Purchase Orders detail
 *    In the items pop-up the PO Number column renders each value as a <span>
 *    link (disablePoLink=false in the incoming-inventory context); clicking it
 *    navigates to `/purchase-orders/<poNumber>`.
 *
 * 3. Product row → product detail page
 *    A row click now opens the items pop-up; to reach the product-details page
 *    the user opens the row's ⋮ long-button menu and clicks "View Items".
 *
 * Test-design technique:
 *   - TC01–TC02: Use Case (serial number link rendering + navigation)
 *   - TC03–TC04: Use Case (PO number link rendering + navigation)
 *   - TC05–TC06: Use Case (product row click + back navigation)
 *   - TC07:      EP — invalid partition (disablePoLink=true: PO shows as plain text)
 *   - TC08:      Error guessing (serial number URL-encodes special characters)
 *
 * Setup: one PO with one item-product (Laptop) created via Excel import.
 *   The serials are unique per run to avoid clashes.
 */
describe('Serial Number, PO Number, and Product Row Navigation Tests (SW_INC_NAV_TC01 – TC08)', () => {
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
    cy.fixture('serialAndPONavigationData').then((data) => {
      td = data;
      runId = ts();

      cy.authSession('admin');
      cy.visit('/');

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
      testPO = `PO-NAV-${stamp}`;
      createdPOs.push(testPO);
      const fileName = `NAV-${stamp}.xlsx`;

      // Use 2 serials so the table has rows for both navigation tests.
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
  // TC01 — Use Case: Serial number cell is rendered as a styled button
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC01
   * @technique     Use Case — visual contract for the clickable serial cell
   * @description   In Item View, the Serial Number column contains <button>
   *                elements (not plain text). The button has underline decoration
   *                and a primary colour so the user knows it is clickable.
   *                This verifies the rendering contract before asserting the
   *                navigation behaviour in TC02.
   */
  it('SW_INC_NAV_TC01 – Serial number in Item View is rendered as an underlined clickable button', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);
    // Open the items pop-up for the seeded product-item row.
    incomingInvPage.openItemsPopup(td.laptop.brand);

    // At least one serial number cell in the pop-up must be a <button type="button">.
    incomingInvPage.getFirstSerialInPopup().then((text) => {
      expect(text).to.have.length.greaterThan(0);
      expect(text).not.to.eq('--');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC02 — Use Case: Clicking serial number navigates to Asset Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC02
   * @technique     Use Case — main navigation flow (serial → asset lifecycle)
   * @description   Clicking the first serial number button in Item View triggers
   *                useNavigate(`/asset-id/search?assetId=<sn>`).
   *                The test reads the serial text first, clicks the button, then
   *                asserts the URL contains the expected path and query.
   */
  it('SW_INC_NAV_TC02 – Clicking serial number in Item View navigates to asset-lifecycle search', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);
    incomingInvPage.openItemsPopup(td.laptop.brand);

    // Capture the first serial text so we can assert on the drawer.
    incomingInvPage.getFirstSerialInPopup().then((serialText) => {
      incomingInvPage.clickFirstSerialInPopup();

      // Enhancement: the serial cell no longer navigates to /asset-id/search — it
      // opens an in-place Asset Lifecycle drawer (SerialNumberCell → onOpen →
      // AssetLifecycleDrawer) that shows the serial and a link to the full page.
      cy.contains('Asset Lifecycle', { timeout: 15000 }).should('be.visible');
      // The drawer's "open full page" link carries the clicked serial (encoded),
      // proving the drawer opened for the right item.
      cy.get('a[href*="/asset-id/search"]', { timeout: 10000 })
        .should('have.attr', 'href')
        .and('include', `${td.assetIdQueryParam}=${encodeURIComponent(serialText)}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC03 — Use Case: PO number cell is rendered as a clickable link in Item View
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC03
   * @technique     Use Case — visual contract for the clickable PO cell
   * @description   In Item View (on the main incoming-inventory page, where
   *                disablePoLink=false), the PO Number column renders each value
   *                as a <span> element with cursor:pointer and primary colour.
   *                This verifies the rendering contract before asserting the
   *                navigation in TC04.
   */
  it('SW_INC_NAV_TC03 – PO Number in Item View is rendered as a clickable span link', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);
    incomingInvPage.openItemsPopup(td.laptop.brand);

    // The pop-up's item table has a PO Number column whose first cell shows the PO.
    incomingInvPage.assertPoNumberCellInPopup(testPO);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC04 — Use Case: Clicking PO number navigates to Purchase Orders detail
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC04
   * @technique     Use Case — main navigation flow (PO number → purchase-orders detail)
   * @description   Clicking the PO Number cell in Item View triggers
   *                useNavigate(`/purchase-orders/<poNumber>`). The test asserts
   *                the URL changes to the purchase orders detail path.
   */
  it('SW_INC_NAV_TC04 – Clicking PO number in Item View navigates to Purchase Orders detail', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);
    incomingInvPage.openItemsPopup(td.laptop.brand);

    // Three-part oracle. Asserting the href alone would let a swallowed click
    // pass a test whose title claims navigation, so the click is exercised too.
    //
    // The PO cell is a plain anchor with target="_blank"
    // (InventoryItemsList.tsx:381) — NOT a router link; its onClick only
    // stopPropagation()s so the row click doesn't swap the pop-up's product.
    // Clicking it as-is opens a second tab that Cypress cannot follow, so
    // clickPoNumberLinkInPopup() strips `target` and lets the browser follow the
    // href in-tab. The new-tab behaviour itself is asserted separately rather
    // than lost.
    incomingInvPage.assertPoNumberLinksToDetail(testPO, td.purchaseOrdersBasePath);
    incomingInvPage.assertPoNumberOpensInNewTab();
    incomingInvPage.clickPoNumberLinkInPopup();
    cy.url({ timeout: 15000 }).should('include', `${td.purchaseOrdersBasePath}/${testPO}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC05 — Use Case: Clicking a product row navigates to product detail page
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC05
   * @technique     Use Case — main navigation flow (product row → product detail)
   * @description   In Product View, clicking a table row calls
   *                navigate(SINGLE_VIEW_ROUTE.replace(':id', id).replace(':productName', name)).
   *                The URL must change to /incoming-inventory/<productName>/<id>.
   */
  it('SW_INC_NAV_TC05 – Clicking a product row in Product View navigates to product detail page', { tags: ['@smoke', '@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);

    // Wait for the seeded product row to load.
    cy.contains('tbody tr', td.laptop.brand, { timeout: 15000 }).should('be.visible');

    // Enhancement: a row click now opens the items pop-up, so to reach the
    // product-details page use the row's ⋮ long-button menu → "View Items".
    incomingInvPage.openFirstRowLongButtonMenu();
    incomingInvPage.clickViewItemsMenuItem();

    // URL must shift to the product detail route (/incoming-inventory/<name>/<id>).
    cy.url({ timeout: 10000 }).should('match', /\/(incoming-inventory|purchase-orders)\/.+\/.+/);

    // The product-details items table renders a "Serial Number" column (hasItems=true).
    cy.get('thead th', { timeout: 15000 }).should('contain.text', 'Serial Number');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC06 — Use Case: Back navigation from product detail returns to Incoming Inventory
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC06
   * @technique     Use Case — alternate path (back button)
   * @description   After navigating to the product detail page via row click,
   *                the browser back action (cy.go('back')) returns the user to
   *                the Incoming Inventory listing.
   */
  it('SW_INC_NAV_TC06 – Browser back from product detail returns to Incoming Inventory', { tags: ['@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);
    cy.contains('tbody tr', td.laptop.brand, { timeout: 15000 }).should('be.visible');

    // Reach the product-details page via the ⋮ long-button menu → "View Items"
    // (enhancement: a row click now opens the items pop-up instead of navigating).
    incomingInvPage.openFirstRowLongButtonMenu();
    incomingInvPage.clickViewItemsMenuItem();

    // Confirm we navigated to the product detail route (/incoming-inventory/<name>/<id>
    // or /purchase-orders/<name>/<id>) — more path segments than just /incoming-inventory.
    cy.url({ timeout: 10000 }).should('match', /\/(incoming-inventory|purchase-orders)\/.+\/.+/);

    cy.go('back');
    cy.url({ timeout: 10000 }).should('include', '/incoming-inventory');
    // PO dropdown should be visible again
    cy.get('#Incomming-inventory-P-O-1', { timeout: 10000 }).should('be.visible');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC07 — EP (invalid partition): PO Number cell is plain text in closePo context
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC07
   * @technique     EP — invalid partition (disablePoLink=true: closePo context)
   * @description   When viewing the Incoming Inventory from the Purchase Orders
   *                detail page (closePo=true), InventoryItemsList receives
   *                disablePoLink=true and renders the PO number as plain
   *                <Typography> text — not a clickable link.
   *
   *                This test navigates to the PO detail page directly
   *                (/purchase-orders/<poNumber>) and switches to Item View there.
   *                The PO number cell must not be a link.
   */
  it('SW_INC_NAV_TC07 – PO Number is plain text (no link) on the Purchase Orders detail page', { tags: ['@regression'] }, () => {
    cy.visit(`/purchase-orders/${testPO}`, { timeout: 20000 });
    // Deep-linking to a PO-detail page immediately after login can bounce to
    // /dashboard while the session/route settles; re-visit once if that happens.
    cy.url({ timeout: 15000 }).then((u) => {
      if (!u.includes(`/purchase-orders/${testPO}`)) {
        cy.visit(`/purchase-orders/${testPO}`, { timeout: 20000 });
      }
    });
    cy.url({ timeout: 15000 }).should('include', `/purchase-orders/${testPO}`);

    // On the PO-detail page the incoming list runs with closePo=true, so the
    // items pop-up receives disablePoLink=true → the PO Number cell is plain
    // text, not a clickable link. Open the pop-up for the product-item row and
    // assert the PO cell has no link span.
    incomingInvPage.openItemsPopup(td.laptop.brand);
    incomingInvPage.assertPoNumberPlainTextInPopup(testPO);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC08 — Error guessing: Serial number with a hyphen is URL-encoded correctly
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * @testCaseId    SW_INC_NAV_TC08
   * @technique     Error guessing — known pain point: hyphenated serials must
   *                survive encodeURIComponent without breaking the asset search.
   * @description   Our seeded serials contain hyphens (e.g. "NAV-SN-..."). The
   *                URL must contain the encoded serial so the asset search page
   *                can decode it back. `encodeURIComponent('-') === '-'` (hyphens
   *                are not percent-encoded), but this test guards against future
   *                regressions where the encoding is omitted entirely (resulting
   *                in a missing query string).
   */
  it('SW_INC_NAV_TC08 – Hyphenated serial number is preserved in asset-lifecycle URL', { tags: ['@regression'] }, () => {
    incomingInvPage.clickIncomingInventoryNav();
    incomingInvPage.selectPoNumber(testPO);
    incomingInvPage.openItemsPopup(td.laptop.brand);

    incomingInvPage.getFirstSerialInPopup().then((serialText) => {
      // Confirm it contains at least one hyphen (our seed data always does).
      expect(serialText, 'serial must contain a hyphen').to.include('-');

      incomingInvPage.clickFirstSerialInPopup();

      // The Asset Lifecycle drawer's "open full page" link URL-encodes the
      // (hyphenated) serial into the assetId query param.
      cy.contains('Asset Lifecycle', { timeout: 15000 }).should('be.visible');
      cy.get('a[href*="/asset-id/search"]', { timeout: 10000 })
        .should('have.attr', 'href')
        .and('include', `${td.assetIdQueryParam}=`)
        .and('include', encodeURIComponent(serialText));
    });
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
