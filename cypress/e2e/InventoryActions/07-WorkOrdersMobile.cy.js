// cypress/e2e/InventoryActions/07-WorkOrdersMobile.cy.js
//
// Specs for the Work Orders mobile screen
// (route /MobileViewScreen/work-order). The component branches on
// isMobile (Frontend/src/pages/WorkOrderListView.tsx).
//
// SW-IA-TC118 (search) / SW-IA-TC119 (button states) / SW-IA-TC120
// (View navigates to detail) are owned by `cypress/e2e/20-WorkOrderTests.cy.js`
// (desktop) — see Coverage Map.

import WorkOrdersMobilePage from '../../pageObjects/InventoryActions/WorkOrdersMobilePage';
import WorkOrderPage from '../../pageObjects/WorkOrderPage';

describe('Inventory Action — Work Orders (mobile)', { tags: ['@regression'] }, () => {
  const page = new WorkOrdersMobilePage();
  let seededWoId = null;

  before(() => {
    // Seed one Open work order using a hasItems product from the Laptop Automation
    // category so TC117 (worker Open filter), TC121 (Scan buttons), and TC122
    // (scan-reserves-serial) all have qualifying data even on a clean QA.
    cy.authSession('admin');
    cy.iaAuthToken().then((token) => {
      // Step 1: resolve the Laptop Automation Cat by name (category ID is dynamic).
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/categories`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        qs: { search: 'Laptop Automation', limit: 20 },
        failOnStatusCode: false,
        timeout: 60000,
      }).then((catRes) => {
        const cats = catRes.body?.data?.list || catRes.body?.list || [];
        const laptopCat = cats.find((c) => /laptop automation/i.test(c.name) && c.allowItems);
        if (!laptopCat) { cy.log('[seed] Laptop Automation Cat not found — seeding skipped'); return; }

        // Step 2: find a hasItems product in that category with available qty.
        cy.request({
          method: 'GET',
          url: `${Cypress.env('API_BASE_URL')}/products`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          qs: { categoryId: laptopCat.id, page: 1, page_size: 20 },
          failOnStatusCode: false,
          timeout: 60000,
        }).then((prodRes) => {
          const prods = prodRes.body?.data?.data?.list || prodRes.body?.data?.list || [];
          const candidates = prods.filter(
            (p) => p.hasItems === true && Number(p.availableQuantity ?? 0) > 0,
          );
          if (!candidates.length) { cy.log('[seed] No hasItems product with available qty in Laptop Automation Cat'); return; }

          // Step 3: confirm at least one Available serial via /products/:id/items.
          const tryCandidate = (idx) => {
            if (idx >= candidates.length) {
              cy.log('[seed] No hasItems product with an Available serial found');
              return;
            }
            const prod = candidates[idx];
            cy.request({
              method: 'GET',
              url: `${Cypress.env('API_BASE_URL')}/products/${prod.id}/items`,
              headers: { Authorization: `Bearer ${token}` },
              qs: { page: 1, page_size: 20 },
              failOnStatusCode: false,
              timeout: 60000,
            }).then((itemsRes) => {
              const items = itemsRes.body?.data?.list || [];
              const hasAvail = items.some((i) => i.status === 'Available');
              if (!hasAvail) { tryCandidate(idx + 1); return; }

              // Step 4: create the Open work order with this hasItems product.
              cy.request({
                method: 'POST',
                url: `${Cypress.env('API_BASE_URL')}/work-orders`,
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: {
                  status: 'Open',
                  products: [{ productId: prod.id, name: prod.name || null, partNumber: null, quantity: 2 }],
                },
                failOnStatusCode: false,
                timeout: 60000,
              }).then((woRes) => {
                const wo = woRes.body?.data?.data || woRes.body?.data;
                if (wo?.id) {
                  seededWoId = wo.id;
                  cy.log(`[seed] Created hasItems WO id=${wo.id} (product ${prod.id} — ${prod.name}) for TC117/TC121/TC122`);
                }
              });
            });
          };

          tryCandidate(0);
        });
      });
    });
  });

  after(() => {
    if (!seededWoId) return;
    const id = seededWoId;
    seededWoId = null;
    cy.iaAuthToken().then((token) => {
      cy.request({
        method: 'DELETE',
        url: `${Cypress.env('API_BASE_URL')}/work-orders/${id}`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
        timeout: 60000,
      });
    });
  });

  // The mobile-card layout in WorkOrderListView.tsx is gated on
  //   useMediaQuery(theme.breakpoints.down('md'))
  // which is FALSE at Cypress's default 1920x1080 viewport. Force the
  // viewport below MUI's `md` breakpoint (~900px) so the mobile branch
  // renders instead of the desktop MaterialReactTable.
  //
  // Also alias the work-orders list query so tests can `cy.wait('@woList')`
  // and avoid race-condition skips when the synchronous DOM check fires
  // before react-query populates the cards.
  beforeEach(() => {
    cy.viewport('iphone-7');
    cy.intercept('GET', '**/work-orders**').as('woList');
  });

  // ------------------------------------------------------------------------
  // EP — TC117: when the user is a worker (isUser()=true), the mobile
  // list query is sent with `status=Open` (WorkOrderListView.tsx:138),
  // so the rendered cards should all show the Open status chip.
  //
  // For admin sessions there is no default status filter — the spec
  // would see mixed statuses, contradicting the Excel acceptance.
  // We therefore force a worker session for this case.
  // ------------------------------------------------------------------------
  // SKILL §5: @smoke representative — TC117 verifies the worker landing
  // experience (Open-only filter); failure breaks the operator workflow.
  it('SW-IA-TC117 — work orders list shows only Open work orders (worker view)', { tags: ['@smoke'] }, function () {
    Cypress.session.clearAllSavedSessions();
    cy.authSession('user');
    // Re-register the alias so only the visitDirect request is captured.
    // Without this, cy.authSession('user') may trigger a work-orders fetch during
    // session restoration that consumes the beforeEach-registered alias, causing
    // the DOM check to fire before the WO cards have rendered.
    cy.intercept('GET', '**/work-orders**').as('woList');
    page.visitDirect();

    cy.wait('@woList', { timeout: 15000 }).then(() => {
      cy.get('body').then(($body) => {
        const chips = $body.find('.MuiChip-label');
        if (chips.length === 0) {
          cy.log('Worker has no Open work orders on QA — skipping TC117');
          this.skip();
        }
      });
    });

    page.assertEveryCardStatus('Open');
  });

  // ------------------------------------------------------------------------
  // Use Case — TC121: every product card on the WO detail screen renders
  // an enabled Scan button. We open the first card on the mobile list
  // (admin can see all WOs), which navigates to the desktop detail view,
  // and assert each Scan button on that screen is not disabled.
  //
  // Note: 20-WorkOrderTests.cy.js (SW-WO-TC65) confirms ONE Scan button
  // opens the modal; this test extends that to "all product rows have
  // Scan enabled".
  // ------------------------------------------------------------------------
  it('SW-IA-TC121 — Scan button is enabled against each work order product', function () {
    cy.authSession('admin');
    // Re-register alias after session restore so only the visitDirect request is captured.
    cy.intercept('GET', '**/work-orders**').as('woList');
    page.visitDirect();

    cy.wait('@woList', { timeout: 15000 }).then(() => {
      cy.get('body').then(($body) => {
        if ($body.find(':contains("Work Order Number")').length === 0) {
          cy.log('No work orders on QA — skipping TC121');
          this.skip();
        }
      });
    });

    page.openFirstCard();
    // The WO detail route is a desktop-style layout; reset viewport so
    // the Scan buttons aren't hidden behind a mobile menu.
    cy.viewport(1920, 1080);
    page.assertEveryScanButtonEnabled();
  });

  // ------------------------------------------------------------------------
  // Use Case — TC122: scanning a valid serial number reserves it in a
  // product-item product, entered from the mobile Work Orders screen.
  //
  // Previously deferred for lack of a probe; the WorkOrderPage probes added
  // for the desktop Scan-modal block (SW-WO-TC89–94) now make this
  // deterministic and reusable:
  //   - findOpenWorkOrderWithItemsProduct() → an Open WO + hasItems product
  //     with reservation headroom AND a live Available serial in inventory.
  //   - findAvailableSerialForProduct(productId) → the serial to scan.
  //   - getWorkOrderProductsItems(id) → assert the reservation round-tripped
  //     through the WorkOrder entity (not just an optimistic FE update).
  //   - reserveSerialViaApi / unscanSerial → state restoration in afterEach.
  //
  // The WO detail + Scan modal render as the desktop layout even when entered
  // from mobile (see TC121's viewport reset), so the Scan interaction reuses
  // the proven WorkOrderPage modal helpers. The MOBILE context under test is
  // the entry point: we start on /MobileViewScreen/work-order at an iPhone
  // viewport, then open the WO. Skips cleanly (principle #6) when QA/Stage has
  // no qualifying WO or the product slot is already full.
  // ------------------------------------------------------------------------
  describe('TC122 — mobile scan reserves a serial', () => {
    const wo = new WorkOrderPage();
    let scanWoNum;
    let scanWoId;
    let scanProductId;
    // Track any serial reserved so afterEach can pair the mutation with its
    // inverse (POST /work-orders/unscan), per SKILL §6 rule 5.
    let reservedSerial = null;

    before(function () {
      const ctx = this;
      cy.authSession('admin');
      // Visit the app so getAuthToken() can read the JWT before the probe.
      new WorkOrderPage().visit();
      new WorkOrderPage().findOpenWorkOrderWithItemsProduct().then((result) => {
        if (!result) { ctx.skip(); return; }
        scanWoNum = result.woNum;
        scanWoId = result.id;
        scanProductId = result.productId;
      });
    });

    afterEach(() => {
      if (!reservedSerial) return;
      const serial = reservedSerial;
      reservedSerial = null;
      new WorkOrderPage().unscanSerial(scanWoNum, scanProductId, serial);
    });

    // Use Case — happy path (mobile entry): a worker/admin starting on the
    // mobile Work Orders screen scans a valid Available serial and reserves it.
    // The WO entity's productsItems must grow by exactly one for that serial.
    it('SW-IA-TC122 — scanning a valid serial reserves it in a product-item product', { tags: ['@smoke'] }, function () {
      const ctx = this;
      if (!scanWoNum) { this.skip(); return; }
      cy.authSession('admin');

      // Re-check live headroom: the before()-selected WO can saturate between
      // runs (productsItems persist). A full slot is a data condition, not a
      // defect — skip cleanly (matches the desktop TC90 guard).
      wo.getWorkOrderHeadroom(scanWoId, scanProductId).then((headroom) => {
        if (headroom < 1) {
          cy.log(`WO ${scanWoNum} product slot full (headroom=${headroom}) — skipping (capacity, not a defect)`);
          ctx.skip();
          return;
        }
        wo.findAvailableSerialForProduct(scanProductId).then((serial) => {
          if (!serial) { ctx.skip(); return; }

          // Establish the mobile entry context: land on the mobile WO list.
          page.visitDirect();
          cy.wait('@woList', { timeout: 15000 });

          wo.getWorkOrderProductsItems(scanWoId).then((before) => {
            // Navigate to the WO detail (desktop layout) to drive the Scan
            // modal with the proven helpers; reset viewport so the modal isn't
            // hidden behind the mobile menu (same approach as TC121).
            cy.viewport(1920, 1080);
            // Register view-configs intercept BEFORE navigation so the
            // request is captured on mount. WorkOrdersDetailsList passes
            // configLoading to ScanForm; until /view-configs resolves the
            // form shows a spinner and #serialnumber is absent.
            cy.intercept('GET', '**/view-configs**').as('_viewCfgReady');
            wo.visitDetail(scanWoNum, scanWoId);
            // Wait for /view-configs so ScanForm renders the input
            // (configLoading=false) before we open the Scan modal.
            cy.wait('@_viewCfgReady', { timeout: 15000 });

            cy.intercept('POST', '**/work-orders/scan').as('scanSerial');
            // Track for cleanup BEFORE the POST so afterEach unscans even if a
            // later assertion fails (unscanSerial is idempotent on a never-
            // reserved serial).
            reservedSerial = serial;
            wo.openScanModalOnFirstRow();
            wo.typeSerialInScanModal(serial);
            wo.clickScanSubmitInScanModal();

            cy.wait('@scanSerial', { timeout: 30000 }).then((interception) => {
              const status = interception.response.statusCode;
              const message = interception.response.body?.error?.message
                ?? interception.response.body?.message ?? '';
              // Benign capacity race: slot filled between the headroom probe and
              // the scan. Environmental state, not a defect — skip cleanly.
              if (status < 200 || status >= 300) {
                if (/have already been reserved/i.test(message)) {
                  cy.log(`WO ${scanWoNum} slot full at scan time ("${message}") — skipping (capacity, not a defect)`);
                  reservedSerial = null;
                  ctx.skip();
                  return;
                }
              }
              expect(
                status,
                `POST /work-orders/scan for "${serial}" must succeed (got "${message}")`,
              ).to.be.within(200, 299);
            });

            wo.verifyScanListContains(serial);

            // The reservation must round-trip through the WorkOrder entity.
            wo.getWorkOrderProductsItems(scanWoId).then((after) => {
              expect(
                after.length,
                `WO ${scanWoNum} productsItems must grow by 1 after scanning "${serial}"`,
              ).to.equal(before.length + 1);
              const matched = after.some(
                (it) => it?.serialNumber === serial && it?.productId === scanProductId,
              );
              expect(matched, `productsItems must include serial "${serial}" for productId ${scanProductId}`).to.be.true;
            });
          });
        });
      });
    });
  });
});
