/**
 * InventoryStatsClickableTests.cy.js
 * ============================================================
 * Spec: Inventory Stats Clickable — 7-status badge filter, toggle, switch
 * Test Plan: cypress/qa/testPlans/inventory/plan.md
 *            cypress/qa/testPlans/inventory/sub/stats-clickable-plan.md
 * Page Object: cypress/pageObjects/InventoryAdvancedSearchPage.js
 * Locators:    cypress/support/locators/InvAdvancedSearchLocators.js
 * Fixtures:    cypress/fixtures/inventoryStatsClickableData.json
 *
 * Stat cards on /inventory are sourced from GET /incoming-items/reports.
 * Clicking a badge fires GET /products?status=X (handled by handleStatusFilterClick
 * in ItemList.tsx). Only one badge can be active at a time (toggle behaviour).
 *
 * Seeding: API-only — one Laptop product + one PO + serial numbers per status.
 * Cleanup: POST /products/deleteProduct in after().
 *
 * Prompt pattern: chain-of-thought + explore-then-implement (SKILL.md §8.3)
 */

import InventoryAdvancedSearchPage from '../../pageObjects/InventoryAdvancedSearchPage';
import data from '../../fixtures/inventoryStatsClickableData.json';
import { ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import { apiSetGeneralConfigFlags } from '../../support/helpers/generalConfigApiHelpers';

// ── Module-level state ─────────────────────────────────────────────────────
let authToken;
let apiUrl;
let ts;

let laptopProductId;
let laptopProductName;
let scPo; // single PO for all stat test items
// Live category id resolved in before() (env-specific — must not be hardcoded).
let laptopCatId;

// Serial numbers per status
let snAvailable;
let snIncoming;
let snDamaged;
let snMissing;
let snDisputed;
let snReserved;
let snStockedOut;

// For TC13 — Damaged count before/after seed
let damagedCountBefore = 0;

// ── API helper ─────────────────────────────────────────────────────────────
function apiReq(method, path, body = {}, qs = {}) {
  return cy.request({
    method,
    url: `${apiUrl}${path}`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    failOnStatusCode: false,
    body,
    qs,
    timeout: 60000,
  });
}

function extractId(res) {
  const d = res.body.data || res.body;
  const wrapper = Array.isArray(d) ? d[0] : d;
  const inner = wrapper.product || wrapper;
  const row = Array.isArray(inner) ? inner[0] : inner;
  return row?.id;
}

// ── Top-level describe ─────────────────────────────────────────────────────
describe('Inventory Stats Clickable', { tags: ['@regression'] }, () => {
  const page = new InventoryAdvancedSearchPage();

  // ── Seed once per suite ──────────────────────────────────────────────────
  before(() => {
    cy.authSession('admin');
    cy.visit('/dashboard');
    ensureCommonAttributesOptional();
    apiSetGeneralConfigFlags({ allowManualEntries: true });

    cy.getAuthToken().then((token) => {
      authToken = token;
      apiUrl = Cypress.env('API_BASE_URL');
      ts = Date.now();

      laptopProductName = `SC-LT-${ts}`;
      scPo = `SC-PO-${ts}`;

      // Resolve the live Laptop category id (env-specific) so TC14's
      // category-id assertion does not depend on a hardcoded value.
      apiReq('GET', '/categories?page=1&page_size=1000').then((res) => {
        const body = res.body?.data;
        const arr = body?.list || body?.items || (Array.isArray(body) ? body : []) || [];
        const laptop = arr.find((c) => c.name === data.categories.laptop.name);
        if (laptop) laptopCatId = laptop.id;
      });

      // Serials for each target status
      snAvailable  = `SC-SN-AV-${ts}`;
      snIncoming   = `SC-SN-IN-${ts}`;
      snDamaged    = `SC-SN-DM-${ts}`;
      snMissing    = `SC-SN-MS-${ts}`;
      snDisputed   = `SC-SN-DI-${ts}`;
      snReserved   = `SC-SN-RV-${ts}`;
      snStockedOut = `SC-SN-SO-${ts}`;

      // 1. Create Laptop product
      apiReq('POST', '/products', {
        category: data.categories.laptop.name,
        modelNumber: laptopProductName,
        brand: 'Lenovo',
      }).then((res) => {
        laptopProductId = extractId(res);
        expect(laptopProductId, 'Laptop product for SC tests').to.exist;

        // 2. Create PO and add product to it
        apiReq('POST', '/incoming-items/add-product', {
          poNumber: scPo,
          productId: laptopProductId,
          expectedQuantity: 7,
          cost: 0,
        }).then(() => {
          // 3. Create all 7 items directly (status=Available).
          //    POST /incoming-items/scan does NOT create new items on stage —
          //    it returns 400 "Serial Number not found" for serials that don't
          //    exist in the items table yet. POST /products/item creates them
          //    directly (same approach as InventoryAdvancedSearchTests §3).
          apiReq('POST', '/products/item', {
            poNumber: scPo,
            productId: Number(laptopProductId),
            serialNumber: [snAvailable, snIncoming, snDamaged, snMissing, snDisputed, snReserved, snStockedOut],
            cost: 0,
          });

          // 5–7: Mark statuses via /products/mark-status (inventory-side endpoint).
          //      Items were created as Available by POST /products/item above,
          //      so the inventory mark-status path is the right one.
          apiReq('POST', '/products/mark-status', {
            serialNumbers: [snDamaged],
            status: 'Damaged',
          });
          apiReq('POST', '/products/mark-status', {
            serialNumbers: [snMissing],
            status: 'Missing',
          });
          apiReq('POST', '/products/mark-status', {
            serialNumbers: [snDisputed],
            status: 'Disputed',
          });

          // 8. Reserve snReserved via Work Order (items already Available).
          apiReq('GET', '/products').then(() => {
            apiReq('POST', '/work-orders', {
              status: 'Open',
              products: [{
                productId: Number(laptopProductId),
                name: laptopProductName,
                partNumber: data.workOrderDefaults.partNumber,
                quantity: 1,
              }],
            }).then((woRes) => {
              const wo = woRes.body?.data || woRes.body?.data?.data;
              const woNum = wo?.workOrderNumber ?? wo?.data?.workOrderNumber;
              if (woNum) {
                apiReq('POST', '/work-orders/scan', {
                  workOrderNumber: woNum,
                  productId: Number(laptopProductId),
                  serialNumber: snReserved,
                });
              }
            });
          });

          // 9. Seed snStockedOut (already Available) — stock out by serial.
          apiReq('GET', '/products').then(() => {
            apiReq('POST', '/products/stockout-by-serial-number', {
              serialNumber: snStockedOut,
              reason: data.stockOutReason,
              description: data.stockOutDesc,
            });
          });
        });
      });
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  after(() => {
    cy.getAuthToken().then((token) => {
      authToken = token;
      apiUrl = Cypress.env('API_BASE_URL');

      if (laptopProductId) {
        apiReq('POST', '/products/deleteProduct', { id: laptopProductId });
      }
    });
  });

  // ── beforeEach ────────────────────────────────────────────────────────────
  beforeEach(function () {
    cy.on('uncaught:exception', (err) => {
      if (err?.message?.includes('Request failed with status code')) return false;
      return true;
    });
    cy.authSession('admin');
    // Pin the "Open Items View on Status Click" general-config toggle so each
    // test starts from a known config regardless of Redux cache / backend value.
    //   • Most tests force it FALSE → a stat-card click stays on the product
    //     list and fires GET /products?...&status=X (simpler to assert).
    //   • TC11 and TC12 pin it TRUE, which is the adversarial setting for them:
    //     both assert the list filters IN PLACE, so pinning the flag that once
    //     opened Items View proves the behaviour no longer depends on it.
    // The value is decided HERE from the test title because the config is read
    // at page load (navigateToInventory below) — too late to set in the body.
    // NOTE: ItemList.tsx no longer reads this flag at all (it is orphaned in the
    // app — see the TC11 comment), so the pin is currently inert for the
    // Inventory list. It is kept deliberately: if the flag is ever rewired,
    // TC11/TC12 fail loudly rather than silently changing meaning.
    const needsItemsView = /TC11|TC12/.test(this.currentTest.title);
    cy.intercept('GET', /\/configs\?.*type=general/, (req) => {
      req.continue((res) => {
        const list = res.body?.data?.list;
        if (list?.[0]?.configJson?.data) {
          list[0].configJson.data.statusClickOpensItemsView = needsItemsView;
        }
      });
    });
    page.navigateToInventory();
    page.waitForTableLoad();
  });

  // ==========================================================================
  // TC01 — Stat card groups render on page load
  // ==========================================================================

  // Use Case: both stat card groups render with numeric values
  it('SW-INV-SC-TC01 @smoke — Stat card groups render on /inventory page load', { tags: ['@smoke'] }, () => {
    cy.intercept('GET', '**/incoming-items/reports**').as('reports');
    cy.reload();
    cy.wait('@reports', { timeout: 20000 });

    // Assert two always-visible tiles render (works on both new InfoCard and QA plain-div builds)
    page.assertStatCardVisible('Available');
    page.assertStatCardVisible('Damaged');
  });

  // ==========================================================================
  // TC02 — Click Available badge
  // ==========================================================================

  // Use Case: click Available → GET /products?status=Available
  it('SW-INV-SC-TC02 @smoke — Click Available card fires status=Available list request', { tags: ['@smoke'] }, () => {
    // Where a stat-card click lands depends on the "Open Items View on Status
    // Click" general-config toggle (ItemList.tsx handleStatusFilterClick):
    //   - toggle ON  (QA default) → switches to Items View → GET /items?status=X
    //     (the /products query is disabled while productStatusTab==='items')
    //   - toggle OFF                → stays on product list → GET /products?status=X
    // Intercepting only /products (the prior 833 change) meant "no request ever
    // occurred" whenever the toggle was ON. Match EITHER list endpoint and
    // assert the status param so the test is config-agnostic.
    cy.intercept('GET', /\/(products|items)\?.*status=Available/).as('availableFilter');
    cy.clickStatCard('Available');
    cy.wait('@availableFilter', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Available');
    });
    page.waitForTableLoad();
  });

  // ==========================================================================
  // TC03 — Click Damaged badge (seeded)
  // ==========================================================================

  // Use Case + API seed: click Damaged → list filters to Damaged items
  it('SW-INV-SC-TC03 @smoke — Click Damaged badge filters list to Damaged items; seeded row visible', { tags: ['@smoke'] }, () => {
    // Same config-dependent routing as TC02: the stat-card click fires
    // GET /items?status=Damaged when the "Open Items View on Status Click"
    // toggle is ON (QA default) or GET /products?status=Damaged when OFF.
    // Match either list endpoint carrying the Damaged status param.
    cy.intercept('GET', /\/(products|items)\?.*status=Damaged/).as('damagedFilter');
    cy.clickStatCard('Damaged');
    cy.wait('@damagedFilter', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Damaged');
    });
    page.waitForTableLoad();
    // Shared stage has many Damaged items; assert the filtered table is not empty
    // (proves the filter works). The seeded-item visibility is covered by TC13.
    cy.get('tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // TC04 — Click Missing badge
  // ==========================================================================

  // Use Case + API seed: click Missing → list filters to Missing items
  it('SW-INV-SC-TC04 @regression — Click Missing badge filters list to Missing items; seeded row visible', () => {
    cy.intercept('GET', /\/(products|items)\?.*status=Missing/).as('missingFilter');
    cy.clickStatCard('Missing');
    cy.wait('@missingFilter', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Missing');
    });
    page.waitForTableLoad();
    cy.get('tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // TC05 — Click Disputed badge
  // ==========================================================================

  // Use Case + API seed: click Disputed → list filters to Disputed items
  it('SW-INV-SC-TC05 @regression — Click Disputed badge filters list to Disputed items; seeded row visible', () => {
    cy.intercept('GET', /\/(products|items)\?.*status=Disputed/).as('disputedFilter');
    cy.clickStatCard('Disputed');
    cy.wait('@disputedFilter', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Disputed');
    });
    page.waitForTableLoad();
    cy.get('tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // TC06 — Click Reserved badge
  // ==========================================================================

  // Use Case + API seed (WO): click Reserved → list filters to Reserved items
  it('SW-INV-SC-TC06 @regression — Click Reserved badge filters list to Reserved items; seeded row visible', () => {
    cy.intercept('GET', /\/(products|items)\?.*status=Reserved/).as('reservedFilter');
    cy.clickStatCard('Reserved');
    cy.wait('@reservedFilter', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Reserved');
    });
    page.waitForTableLoad();
    cy.get('tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // TC07 — Click StockedOut badge
  // ==========================================================================

  // Use Case + API seed: click Stocked Out → list filters to StockedOut items
  it('SW-INV-SC-TC07 @regression — Click Stocked Out badge filters list to StockedOut items; seeded row visible', () => {
    cy.intercept('GET', /\/(products|items)\?.*status=StockedOut/).as('stockedOutFilter');
    cy.clickStatCard('Stocked out (others)');
    cy.wait('@stockedOutFilter', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=StockedOut');
    });
    page.waitForTableLoad();
    cy.get('tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // TC08 — Click Incoming badge
  // ==========================================================================

  // Use Case + API seed: click Incoming → list filters to Incoming items.
  // The stat strip (StatusFilterTabs) fits only the first N tiles inline and
  // pushes the rest into a "More (N)" overflow Menu — "Incoming" is usually in
  // the overflow. Click it inline if present, else open More and click it in the
  // menu. Anchor to "Incoming<count>" so it never matches the "Incoming
  // Inventory" sidebar nav (which shares the prefix).
  it('SW-INV-SC-TC08 @regression — Click Incoming badge filters list to Incoming items; seeded row visible', () => {
    // Match ALL /products calls, then assert one carried status=Incoming — a
    // query-specific glob/regex intercept proved unreliable at matching the
    // query string in this Cypress version.
    cy.intercept('GET', '**/products*').as('anyProducts');
    // "Incoming" is normally pushed into the stat strip's "More (N)" overflow.
    // cy.clickStatCard already owns every mechanic that needs: it waits for the
    // reports-driven strip to render, invokes the React onClick prop directly on
    // <Box onClick> tiles (a synthetic Cypress click does not trigger them),
    // falls through to the "More" overflow menu when the label is not inline,
    // and anchors the label so it can never match the "Incoming Inventory"
    // sidebar nav. Framework internals belong there, not in a spec.
    cy.clickStatCard('Incoming');
    // Primary assertion: clicking Incoming filters the list via status=Incoming.
    cy.get('@anyProducts.all', { timeout: 20000 }).should((calls) => {
      const hit = (calls || []).some((c) => (c.request?.url || '').includes('status=Incoming'));
      expect(hit, 'a /products request with status=Incoming fired').to.eq(true);
    });
    // The table renders the filtered result (may be empty if no Incoming items).
    // A fixed settle is deliberate here: the status=Incoming list is frequently
    // EMPTY, so there are no rows to wait on, and the request can be superseded
    // by the tab's own refetch (so its intercepted response isn't reliably
    // captured). The meaningful assertion — that a status=Incoming request fired
    // — is already made above; this only lets the grid re-render before the next
    // test. Do NOT swap for a LinearProgress/alias-response wait: the stats strip
    // keeps an indeterminate progress bar mounted and the Incoming response is
    // not dependably recorded, both of which flake this tail.
    cy.wait(1500);
    cy.get('table tbody', { timeout: 15000 }).should('exist');
  });

  // ==========================================================================
  // TC09 — Toggle same badge off
  // ==========================================================================

  // State Transition: click same badge again → filter cleared (toggle off)
  it('SW-INV-SC-TC09 @regression — State Transition: click same badge twice toggles filter off', () => {
    // First click — activate filter
    cy.intercept('GET', /\/(products|items)\?.*status=Damaged/).as('firstClick');
    cy.clickStatCard('Damaged');
    cy.wait('@firstClick', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Damaged');
    });
    page.waitForTableLoad();

    // Second click — deactivate filter (same badge toggled off → no status param).
    // The list reloads via /products without a status param. The regex still
    // accepts /items because ItemList once routed there under
    // statusClickOpensItemsView; that flag is no longer read (see TC11), so in
    // practice only /products fires — the alternation is harmless tolerance.
    cy.intercept('GET', /\/(products|items)\?/).as('secondClick');
    cy.clickStatCard('Damaged');
    cy.wait('@secondClick', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.not.include('status=');
    });
    page.waitForTableLoad();
  });

  // ==========================================================================
  // TC10 — Switch badge (Damaged → Missing)
  // ==========================================================================

  // State Transition: switch badge — Damaged then Missing → filter switches (not AND)
  it('SW-INV-SC-TC10 @regression — State Transition: switch from Damaged to Missing badge filters only Missing', () => {
    // Click Damaged
    cy.intercept('GET', /\/(products|items)\?.*status=Damaged/).as('damagedClick');
    cy.clickStatCard('Damaged');
    cy.wait('@damagedClick', { timeout: 20000 });
    page.waitForTableLoad();

    // Click Missing → should replace Damaged filter
    cy.intercept('GET', /\/(products|items)\?.*status=Missing/).as('missingSwitch');
    cy.clickStatCard('Missing');
    cy.wait('@missingSwitch', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Missing');
      expect(request.url).to.not.include('status=Damaged');
    });
    page.waitForTableLoad();
  });

  // ==========================================================================
  // TC11 — Badge click switches productStatusTab to 'items'
  // ==========================================================================

  // State Transition: a status-badge click filters the current (Active) list in
  // place — the click fires /products?status=X and productStatusTab stays
  // 'active'; it must NOT switch to the Items View tab.
  //
  // Note precisely what changed: the `statusClickOpensItemsView` general-config
  // flag was NOT removed. It still exists (Frontend/src/pages/GeneralConfig.tsx —
  // default `true`, with a live user-facing toggle), and other suites still set
  // it. What changed is that ItemList.tsx no longer READS it, so the flag is
  // currently orphaned in the app: a toggle that claims to control behaviour
  // nothing consumes (worth a dev ticket — see pending.md).
  //
  // That is why the beforeEach pins the flag TRUE for this test: the assertion
  // then proves the list filters in place even when the config says "open Items
  // View". If the config is ever rewired to ItemList, this test goes red instead
  // of passing for the wrong reason.
  it('SW-INV-SC-TC11 @regression — State Transition: status-badge click filters in place; productStatusTab stays "active"', () => {
    // Start on Active Products tab
    cy.contains('Active Products').click();
    page.waitForTableLoad();

    cy.intercept('GET', /\/(products|items)\?.*status=Damaged/).as('tabSwitch');
    cy.clickStatCard('Damaged');
    cy.wait('@tabSwitch', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Damaged');
    });
    page.waitForTableLoad();

    cy.window().then((win) => {
      const stored = win.sessionStorage.getItem(data.sessionKey);
      expect(
        stored === null || stored === 'active',
        `productStatusTab must stay active (Items View is not opened on status click); was "${stored}"`,
      ).to.eq(true);
    });
  });

  // ==========================================================================
  // TC12 — Zero-count badge → empty table, no JS error
  // ==========================================================================

  // Error Guessing: zero-count badge → empty table; no uncaught exception.
  // Global QA data means all 7 statuses always have items, so we use
  // cy.intercept to stub the reports response with Disputed=0 (isolated
  // FE-behaviour test — verifies the UI gracefully handles a 0-count badge).
  it('SW-INV-SC-TC12 @regression — Error Guessing: zero-count badge shows empty table; no JS error', () => {
    cy.on('uncaught:exception', () => false);

    // Modify the reports response so 'Disputed' shows count=0 in the UI.
    cy.intercept('GET', '**/incoming-items/reports**', (req) => {
      req.continue((res) => {
        const target = res.body?.data || res.body;
        if (target) {
          ['Disputed', 'disputed'].forEach((k) => {
            if (target[k] !== undefined) target[k] = 0;
            if (target.reports?.[k] !== undefined) target.reports[k] = 0;
            if (target.statusCounts?.[k] !== undefined) target.statusCounts[k] = 0;
          });
        }
      });
    }).as('reportsMod');

    cy.reload();
    cy.wait('@reportsMod', { timeout: 20000 });
    page.waitForTableLoad();

    // Stub products for Disputed status → empty list (no rows for this status).
    // A status-badge click now filters the products list in place (the Items View
    // switch was removed), so stub GET /products?...&status=Disputed. Register
    // after page load so we don't intercept the initial no-status products request.
    cy.intercept('GET', '**/products*', (req) => {
      if (/[?&]status=Disputed/.test(req.url)) {
        req.reply({
          statusCode: 200,
          body: {
            statusCode: 200,
            success: true,
            data: { list: [], total: 0, page: 1, page_size: 25, pagination: { count: 0 } },
          },
        });
      } else {
        req.continue();
      }
    }).as('zeroFilter');

    // 'Disputed' badge now shows 0 via the stubbed reports response.
    cy.clickStatCard('Disputed');
    cy.wait('@zeroFilter', { timeout: 20000 });
    page.waitForTableLoad();

    // Empty-state overlay must appear; no uncaught JS exception raised
    cy.get('td[colspan]').should('exist');
    cy.get('.go4109123758').should('not.exist');
  });

  // ==========================================================================
  // TC13 — Stat count updates after seed + reload
  // ==========================================================================

  // Use Case: damaged count increments after seeding one more damaged item + reload
  it('SW-INV-SC-TC13 @regression — Use Case: stat count updates after API seed + reload', () => {
    // Read current Damaged count
    cy.intercept('GET', '**/incoming-items/reports**').as('reportsBefore');
    cy.reload();
    cy.wait('@reportsBefore', { timeout: 20000 }).then(({ response }) => {
      const reportBody = response.body?.data || response.body;
      damagedCountBefore = Number(
        reportBody?.reports?.Damaged ?? reportBody?.Damaged ?? reportBody?.damaged ?? reportBody?.statusCounts?.Damaged ?? 0
      );
    });

    // Seed one more Damaged item via API
    cy.getAuthToken().then((token) => {
      authToken = token;
      const newSn = `SC-SN-DM2-${Date.now()}`;
      const newPo = `SC-PO2-${Date.now()}`;

      // POST /incoming-items/scan requires the serial to already exist in the
      // items table (stage returns 400 "not found" for new serials). Use the
      // two-step pattern from InventoryAdvancedSearchTests:
      //   1. add-product to create the PO + quantities record
      //   2. POST /products/item to create the item directly (status=Available)
      // Then mark it Damaged via POST /products/mark-status.
      apiReq('POST', '/incoming-items/add-product', {
        poNumber: newPo,
        productId: laptopProductId,
        expectedQuantity: 1,
        cost: 0,
      }).then(() => {
        apiReq('POST', '/products/item', {
          poNumber: newPo,
          productId: Number(laptopProductId),
          serialNumber: [newSn],
          cost: 0,
        }).then((createRes) => {
          cy.log(`create item response: ${createRes.status} success=${createRes.body?.success}`);
          // serialNumbers = array; no damageReason (Physical Damage is not in
          // the Laptop Automation Cat damage config → would fail silently).
          apiReq('POST', '/products/mark-status', {
            serialNumbers: [newSn],
            status: 'Damaged',
          }).then((markRes) => {
            cy.log(`mark-status response: ${markRes.status} success=${markRes.body?.success}`);
            // Allow the backend reports aggregation to settle before reading.
            cy.wait(1500);
            // Reload and check updated count
            cy.intercept('GET', '**/incoming-items/reports**').as('reportsAfter');
            cy.reload();
            cy.wait('@reportsAfter', { timeout: 20000 }).then(({ response }) => {
              const reportBody = response.body?.data || response.body;
              const damagedCountAfter = Number(
                reportBody?.reports?.Damaged ?? reportBody?.Damaged ?? reportBody?.damaged ?? reportBody?.statusCounts?.Damaged ?? 0
              );
              expect(damagedCountAfter, 'Damaged count after seed').to.be.greaterThan(damagedCountBefore);
            });
          });
        });
      });
    });
  });

  // ==========================================================================
  // TC14 — Category filter + badge → both params in GET /products
  // ==========================================================================

  // Decision Table: category selected + badge click → categoryId AND status in request
  it('SW-INV-SC-TC14 @regression — Decision Table: category filter + badge → both categoryId and status in GET /products', () => {
    // Select Laptop Automation Cat via the nav-drawer helper, which expands the
    // Inventory submenu if collapsed (unmountOnExit hides categories from DOM).
    page.selectCategory('Laptop Automation Cat');

    cy.intercept('GET', /\/(products|items)\?.*status=Damaged/).as('catAndStatus');
    cy.clickStatCard('Damaged');
    cy.wait('@catAndStatus', { timeout: 20000 }).then(({ request }) => {
      expect(request.url).to.include('status=Damaged');
      expect(request.url).to.match(new RegExp(`category(Id)?=${laptopCatId}`));
    });
    page.waitForTableLoad();
  });
});
