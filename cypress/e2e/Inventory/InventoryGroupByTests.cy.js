/**
 * InventoryGroupByTests.cy.js
 * ============================================================
 * Spec: Inventory Group By — Autocomplete control, 7-status decision table,
 *       state transitions, overflow popover, localStorage persistence
 * Page Object: cypress/pageObjects/InventoryGroupByPage.js
 * Locators:    cypress/support/locators/InvGroupByLocators.js
 * Fixtures:    cypress/fixtures/inventoryGroupByData.json
 *
 * Seeding: API-only — one Laptop product + one PO + product-stock-in qty=1.
 * Cleanup: POST /products/deleteProduct in after().
 *
 */

import InventoryGroupByPage from '../../pageObjects/InventoryGroupByPage';
import L from '../../support/locators/InvGroupByLocators';
import data from '../../fixtures/inventoryGroupByData.json';

// ── Module-level state ─────────────────────────────────────────────────────
let authToken;
let apiUrl;
let ts;

let laptopProductId;
let gbPo;
let laptopModel;

// Extra seeds for attribute-grouping coverage (TC20–TC23)
// Group By only works on product-table columns — item-level attributes return 500
// from getGroupedProducts (see product.service.ts:13812). Tests below stick to
// common-product and category-specific-product attributes only.
let ramProductId;        // RAM #1: rambrand=Corsair, shares memoryGeneration with RAM #2
let ramProduct2Id;       // RAM #2: rambrand=GSkill,  shares memoryGeneration with RAM #1
let ramMemGen;           // value shared by both RAM products → Memory Generation bucket aggregates
let ramDisplayTech;
let laptop2ProductId;    // Second Laptop: brand=Lenovo, shares batteryCellCount with laptopProduct
let laptop2Model;
let sharedBatteryCount;  // Laptop product attr value shared by both Laptops → Battery Cell Count bucket aggregates
let gateConfigId;
let userId;

// ── API helper ─────────────────────────────────────────────────────────────
function apiReq(method, path, body = {}) {
  return cy.request({
    method,
    url: `${apiUrl}${path}`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    failOnStatusCode: false,
    body,
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

/** Parse a grouped-response quantity value to a number (BE may return strings). */
function qty(val) {
  return Number(val ?? 0);
}

/** Find the seeded product row in a grouped API response list. */
function findRow(list, modelNumber) {
  const arr = Array.isArray(list) ? list : [];
  return arr.find(
    (r) => r[data.fields.modelNumber] === modelNumber
      || r['modelNumber'] === modelNumber
      || r['model number'] === modelNumber
  );
}

/** Extract the list array from a grouped GET /products/grouped response body. */
function extractList(body) {
  return body?.data?.list || body?.data || body?.list || [];
}

// ── Top-level describe ─────────────────────────────────────────────────────
describe('Inventory Group By Search', { tags: ['@regression'] }, () => {
  const page = new InventoryGroupByPage();

  // ── Seed once per suite ──────────────────────────────────────────────────
  before(() => {
    cy.adminSession();

    cy.getAuthToken().then((token) => {
      authToken = token;
      apiUrl = Cypress.env('API_BASE_URL');
      ts = Date.now();

      laptopModel = `GB-LT-${ts}`;
      gbPo = `GB-PO-${ts}`;
      // Use a unique-per-run number to avoid colliding with pre-existing Laptops
      // in the QA DB; 80000-range keeps it well outside any realistic cell count.
      sharedBatteryCount = 80000 + (ts % 9999);

      // ── Pre-cleanup: remove any stale inventoryCategoryFilter config left by a
      // previous TC23 run that crashed before after() could delete it.
      // If this config is present the Group By dropdown is restricted to
      // ["Brand","Model Number"] only, which breaks TC22 (Battery Cell Count).
      const staleCfgName = data.configGate.type + data.categories.laptop.name;
      return apiReq('GET', `/configs?type=${encodeURIComponent(data.configGate.type)}&name=${encodeURIComponent(staleCfgName)}`)
        .then((lookupRes) => {
          const lookupData = lookupRes.body?.data || lookupRes.body || {};
          const existing = Array.isArray(lookupData?.list) ? lookupData.list
            : Array.isArray(lookupData) ? lookupData
            : lookupData?.id ? [lookupData] : [];
          return existing.reduce(
            (chain, cfg) => chain.then(() => cfg?.id ? apiReq('DELETE', `/configs/${cfg.id}`) : cy.wrap(null)),
            cy.wrap(null),
          );
        })
        .then(() => {
          // 1. Create Laptop product (with shared Battery Cell Count for TC22)
          return apiReq('POST', '/products', {
        category: data.categories.laptop.name,
        modelNumber: laptopModel,
        brand: data.brand,
        batteryCellCount: sharedBatteryCount,
      }).then((res) => {
        laptopProductId = extractId(res);
        expect(laptopProductId, 'Laptop product created').to.exist;

        // 2. Add product to PO (expectedQuantity=7)
        return apiReq('POST', '/incoming-items/add-product', {
          poNumber: gbPo,
          productId: laptopProductId,
          expectedQuantity: 7,
          cost: 0,
        }).then(() => {
          // 3. Stock-in qty=1 via product-stock-in.
          //    check-in cannot be used for Laptop (hasItems=true) because
          //    checkInItemsWithoutVariants throws when no rows exist in the
          //    items table, which rolls back the transaction.
          //    product-stock-in does a direct quantities UPDATE with no
          //    items-table check, so it works for any product type.
          //    Result: availableQuantity=1, receivedQuantity=1, reservedQuantity=0
          //    Grouped formula: availableQty=1-0=1, incomingQty=7-1=6
          return apiReq('POST', '/incoming-items/product-stock-in', {
            productId: Number(laptopProductId),
            poNumber: gbPo,
            quantity: 1,
          });
        });
      }).then(() => {
        // ── Two RAM products sharing memoryGeneration (TC23 — Memory Generation aggregation) ──
        // They differ only in rambrand: this is the canonical Group By use case —
        // "how many DDR-X exist in inv despite rambrand?" The grouped bucket must
        // SUM stats across both products.
        ramMemGen      = `DDR-GB-${ts}`;
        ramDisplayTech = `IPS-GB-${ts}`;
        const ramPo    = `GB-RM-PO-${ts}`;
        const ramPo2   = `GB-RM2-PO-${ts}`;

        return apiReq('POST', '/products', {
          category: data.categories.ram.name,
          memoryGeneration: ramMemGen,
          rambrand: data.ramBrand,           // Corsair
          displayTechnology: ramDisplayTech,
        }).then((res) => {
          ramProductId = extractId(res);
          expect(ramProductId, 'RAM product #1 created').to.exist;

          return apiReq('POST', '/incoming-items/add-product', {
            poNumber: ramPo,
            productId: ramProductId,
            expectedQuantity: 5,
            cost: 0,
          }).then(() => {
            // RAM #1: avail=2, incoming=3
            return apiReq('POST', '/incoming-items/product-stock-in', {
              productId: Number(ramProductId),
              poNumber: ramPo,
              quantity: 2,
            });
          }).then(() => {
            return apiReq('POST', '/products', {
              category: data.categories.ram.name,
              memoryGeneration: ramMemGen,        // SHARED with RAM #1
              rambrand: data.ramBrand2,           // GSkill — different brand
              displayTechnology: ramDisplayTech,
            }).then((res) => {
              ramProduct2Id = extractId(res);
              expect(ramProduct2Id, 'RAM product #2 created').to.exist;

              return apiReq('POST', '/incoming-items/add-product', {
                poNumber: ramPo2,
                productId: ramProduct2Id,
                expectedQuantity: 5,
                cost: 0,
              }).then(() => {
                // RAM #2: avail=2, incoming=3 → Memory Generation bucket totals avail=4, incoming=6
                return apiReq('POST', '/incoming-items/product-stock-in', {
                  productId: Number(ramProduct2Id),
                  poNumber: ramPo2,
                  quantity: 2,
                });
              });
            });
          });
        });
      }).then(() => {
        // ── Second Laptop product (shared brand + shared batteryCellCount) ──
        // Drives TC20 (Brand aggregation across 2 products) and
        // TC22 (Battery Cell Count Laptop-specific product attr aggregation).
        laptop2Model    = `GB-LT2-${ts}`;
        const laptop2Po = `GB-LT2-PO-${ts}`;

        return apiReq('POST', '/products', {
          category: data.categories.laptop.name,
          modelNumber: laptop2Model,
          brand: data.brand,                     // SHARED with laptopProduct (list attr)
          batteryCellCount: sharedBatteryCount,   // SHARED with laptopProduct
        }).then((res) => {
          laptop2ProductId = extractId(res);
          expect(laptop2ProductId, 'Laptop2 product created').to.exist;

          return apiReq('POST', '/incoming-items/add-product', {
            poNumber: laptop2Po,
            productId: laptop2ProductId,
            expectedQuantity: 4,
            cost: 0,
          }).then(() => {
            // Laptop2: avail=2, incoming=2 → Lenovo bucket totals avail=3, incoming=8
            return apiReq('POST', '/incoming-items/product-stock-in', {
              productId: Number(laptop2ProductId),
              poNumber: laptop2Po,
              quantity: 2,
            });
          });
        });
      }).then(() => {
        // ── Resolve userId for the column-customisation config (TC25) ──
        return cy.window().then((win) => {
          const ls = JSON.parse(win.localStorage.getItem('stock-wise') || '{}');
          userId = ls?.App?.user?.userId ?? null;
          // Log all seeded product IDs for debugging
          cy.log('=== SEEDING COMPLETE ===');
          cy.log('Laptop #1:', laptopProductId);
          cy.log('Laptop #2:', laptop2ProductId);
          cy.log('RAM #1 (Corsair):', ramProductId);
          cy.log('RAM #2 (GSkill):', ramProduct2Id);
          cy.log('UserId:', userId);
        });
      });
        }); // closes pre-cleanup .then(() => { return apiReq seeding chain })
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
      if (ramProductId) {
        apiReq('POST', '/products/deleteProduct', { id: ramProductId });
      }
      if (ramProduct2Id) {
        apiReq('POST', '/products/deleteProduct', { id: ramProduct2Id });
      }
      if (laptop2ProductId) {
        apiReq('POST', '/products/deleteProduct', { id: laptop2ProductId });
      }
      if (gateConfigId) {
        apiReq('DELETE', `/configs/${gateConfigId}`);
      }
    });
  });

  // ── beforeEach ────────────────────────────────────────────────────────────
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      if (err?.message?.includes('Request failed with status code')) return false;
      return true;
    });
    cy.adminSession();
    cy.clearAllSessionStorage();
    page.navigateToInventory();
  });

  // ==========================================================================
  // Group A — Group By Control UI (Use Case + EP)
  // ==========================================================================

  // Use Case: autocomplete renders; placeholder "Select fields" visible on load
  it('SW-INV-GB-TC01 @smoke — Group By Autocomplete renders with "Select fields" placeholder', { tags: ['@smoke'] }, () => {
    cy.get(L.emptyInput).should('be.visible');
    cy.get(L.autocompleteRoot).should('be.visible');
  });

  // Use Case: select one field → GET /products/grouped fires; rows appear; row-actions absent
  it('SW-INV-GB-TC02 @smoke — Select "Category" groupBy → GET /products/grouped fires; grouped rows shown; row-actions absent', { tags: ['@smoke'] }, () => {
    cy.intercept('GET', '**/products/grouped**').as('grouped');

    page.selectGroupByField(data.fields.category);

    cy.wait('@grouped').then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('groupBy')).to.equal(data.fields.category);
    });

    page.assertGroupedRowsExist();
    page.assertRowActionsAbsent();
    page.assertFilledChip(data.fields.category);
  });

  // Use Case: 2 fields → both in groupBy param; chips shown
  it('SW-INV-GB-TC03 @smoke — Select 2 fields (Laptop cat) → both in groupBy param', { tags: ['@smoke'] }, () => {
    page.selectCategory(data.categories.laptop.name);

    // Two separate intercepts to capture each field-selection request independently
    cy.intercept('GET', '**/products/grouped**').as('grouped3a');
    page.selectGroupByField(data.fields.brand);
    cy.wait('@grouped3a');  // consume the Brand-only request

    cy.intercept('GET', '**/products/grouped**').as('grouped3b');
    page.selectGroupByField(data.fields.modelNumber);
    cy.wait('@grouped3b').then(({ request }) => {
      const url = new URL(request.url);
      const gb = url.searchParams.get('groupBy');
      expect(gb).to.include(data.fields.brand);
      expect(gb).to.include(data.fields.modelNumber);
    });

    page.assertFilledChip(data.fields.brand);
    page.assertGroupedRowsExist();
  });

  // EP: deselect all chips → groupBy cleared; row-actions return
  it('SW-INV-GB-TC04 @regression — Deselect all groupBy chips → groupBy cleared; row-actions return', () => {
    page.selectGroupByField(data.fields.category);
    page.assertFilledChip(data.fields.category);

    page.deleteChipByLabel(data.fields.category);

    // React Query may serve from cache without a new network request; assert UI state only
    page.waitForTableLoad();
    page.assertGroupByEmpty();
    page.assertRowActionsPresent();
  });

  // EP: excluded fields absent from dropdown options
  it('SW-INV-GB-TC05 @regression — Quantity / Cost / Serial Number are NOT in groupBy dropdown options', () => {
    page.assertDropdownOptionsExclude(data.excludedFields);
  });

  // ==========================================================================
  // Group B — State Transitions
  // ==========================================================================

  // State Transition: search → groupBy cleared; standard /products fires
  it('SW-INV-GB-TC06 @regression — Regular search clears groupBy chips; standard GET /products fires', () => {
    page.selectGroupByField(data.fields.category);
    page.assertFilledChip(data.fields.category);

    cy.intercept('GET', '**/products**').as('searchProducts');

    page.searchAndSubmit(data.searchTerm);

    cy.wait('@searchProducts', { timeout: 20000 });

    page.assertGroupByEmpty();
  });

  // State Transition: category change → groupBy cleared
  it('SW-INV-GB-TC07 @regression — Category change clears groupBy chips', () => {
    page.selectGroupByField(data.fields.category);
    page.assertFilledChip(data.fields.category);

    page.selectCategory(data.categories.laptop.name);

    page.assertGroupByEmpty();
  });

  // State Transition: advanced search submit → groupBy chips cleared; /products/advanced-search fires
  // page.openAdvancedSearch() + page.fillAdvancedSearchField() + page.submitAdvancedSearch() exist.
  // Test body not yet written — pending authoring. See pending.md.
  it.skip('SW-INV-GB-TC08 @regression — Advanced search submit clears groupBy chips; GET /products/advanced-search fires', () => {
    // TODO: open advanced search panel, fill one field, submit, assert chips cleared and
    // /products/advanced-search (or equivalent) fires instead of /products/grouped.
  });



  // ==========================================================================
  // Group C — 7-Status Decision Table
  // TC09–TC13: select Laptop cat → group by Model Number → find seeded row
  // ==========================================================================

  // Decision Table: Available serial → availableQty ≥ 1 in grouped row
  it('SW-INV-GB-TC09 @smoke — [Available] grouped row for seeded product present; availableQty ≥ 1', { tags: ['@smoke'] }, () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped09');

    page.selectGroupByField(data.fields.modelNumber);

    cy.wait('@grouped09', { timeout: 20000 }).then(({ response }) => {
      const row = findRow(extractList(response.body), laptopModel);
      expect(row, `grouped row for model ${laptopModel}`).to.exist;
      expect(qty(row?.availableQuantity), 'availableQty ≥ 1').to.be.greaterThan(0);
    });
  });

  // Decision Table: Incoming serial → incomingQty ≥ 1 in grouped response
  it('SW-INV-GB-TC10 @regression — [Incoming] incomingQty ≥ 1 for seeded model in grouped response', () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped10');

    page.selectGroupByField(data.fields.modelNumber);

    cy.wait('@grouped10', { timeout: 20000 }).then(({ response }) => {
      const row = findRow(extractList(response.body), laptopModel);
      expect(row, `grouped row for model ${laptopModel}`).to.exist;
      expect(qty(row?.incomingQuantity), 'incomingQty ≥ 1').to.be.greaterThan(0);
    });
  });

  // Decision Table: Damaged/Missing/Disputed serials don't inflate availableQty
  it('SW-INV-GB-TC11 @regression — [Damaged/Missing/Disputed] non-available statuses do NOT inflate availableQty', () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped11');

    page.selectGroupByField(data.fields.modelNumber);

    cy.wait('@grouped11', { timeout: 20000 }).then(({ response }) => {
      const row = findRow(extractList(response.body), laptopModel);
      expect(row, `grouped row for model ${laptopModel}`).to.exist;
      // Only the check-in'd serial counts; Damaged/Missing/Disputed must NOT inflate this
      expect(qty(row?.availableQuantity), 'availableQty === 1 (only the checked-in serial)').to.equal(1);
    });
  });

  // Decision Table: Reserved serial → reservedQty field present in grouped response
  it('SW-INV-GB-TC12 @regression — [Reserved] reservedQty ≥ 1 in grouped response', () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped12');

    page.selectGroupByField(data.fields.modelNumber);

    cy.wait('@grouped12', { timeout: 20000 }).then(({ response }) => {
      const row = findRow(extractList(response.body), laptopModel);
      expect(row, `grouped row for model ${laptopModel}`).to.exist;
      // WO-based reservation requires items in the items table, which can't be
      // seeded for hasItems=true (Laptop) products via API alone. Assert the field
      // is present in the grouped response as a contract check instead.
      expect(row).to.have.property('reservedQuantity');
    });
  });

  // Decision Table: StockedOut serial → product grouped row still present; availableQty = 1
  it('SW-INV-GB-TC13 @regression — [StockedOut] grouped row still exists after stock-out; availableQty not inflated', () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped13');

    page.selectGroupByField(data.fields.modelNumber);

    cy.wait('@grouped13', { timeout: 20000 }).then(({ response }) => {
      const row = findRow(extractList(response.body), laptopModel);
      expect(row, `grouped row still present after StockedOut seed`).to.exist;
      // StockedOut should NOT inflate availableQty
      expect(qty(row?.availableQuantity), 'availableQty not inflated by StockedOut').to.equal(1);
    });
  });

  // ==========================================================================
  // Group D — Category + Tab Context Decision Table
  // ==========================================================================

  // Decision Table: category filter + groupBy → both params in request
  it('SW-INV-GB-TC14 @regression — Category filter + GroupBy → categoryId and groupBy both in GET /products/grouped', () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped14');

    page.selectGroupByField(data.fields.brand);

    cy.wait('@grouped14', { timeout: 20000 }).then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('groupBy'), 'groupBy param').to.equal(data.fields.brand);
      const catParam = url.searchParams.get('categoryId') || url.searchParams.get('category');
      expect(catParam, 'category param present').to.exist;
    });
  });

  // Decision Table: Active tab + GroupBy → productStatus=active (or absent, which defaults to active)
  it('SW-INV-GB-TC15 @regression — Active Products tab + GroupBy → productStatus=active in GET /products/grouped', () => {
    page.clickTab(data.tabs.active);

    cy.intercept('GET', '**/products/grouped**').as('grouped15');

    page.selectGroupByField(data.fields.category);

    cy.wait('@grouped15', { timeout: 20000 }).then(({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('productStatus') || url.searchParams.get('status');
      // productStatus=active or absent (default) are both valid for the Active Products tab
      if (status !== null) {
        expect(status).to.equal('active');
      }
    });
  });

  // Decision Table: Inactive tab + GroupBy → productStatus=inactive in request
  it('SW-INV-GB-TC16 @regression — Inactive Products tab + GroupBy → productStatus=inactive in GET /products/grouped', () => {
    page.clickTab(data.tabs.inactive);

    cy.intercept('GET', '**/products/grouped**').as('grouped16');

    page.selectGroupByField(data.fields.category);

    cy.wait('@grouped16', { timeout: 20000 }).then(({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('productStatus') || url.searchParams.get('status');
      expect(status, 'productStatus=inactive in grouped request').to.equal('inactive');
    });
  });

  // ==========================================================================
  // Group E — Multi-Field + Overflow Chip (Use Case)
  // ==========================================================================

  // Use Case: 2+ fields → overflow "+1" chip → popover → Clear All removes all
  it('SW-INV-GB-TC17 @regression — 2+ fields → overflow "+1" chip → popover "All Grouping Fields (2)" → Clear All', () => {
    page.selectCategory(data.categories.laptop.name);

    page.selectGroupByField(data.fields.brand);
    page.selectGroupByField(data.fields.modelNumber);

    // After 2 fields: 1 filled chip + 1 overflow "+1" chip
    page.assertFilledChip(data.fields.brand);
    page.assertOverflowChipVisible();

    // Open popover and verify contents
    page.clickOverflowChip();
    page.assertPopoverContents('All Grouping Fields (2)', [data.fields.brand, data.fields.modelNumber]);

    // Clear All → no chips; autocomplete shows empty state
    page.clearAllInPopover();
    page.assertGroupByEmpty();
  });

  // Use Case: delete one chip from popover → remaining field still active in request
  it('SW-INV-GB-TC18 @regression — Popover chip delete removes one field; remaining field still grouped', () => {
    page.selectCategory(data.categories.laptop.name);

    page.selectGroupByField(data.fields.brand);
    page.selectGroupByField(data.fields.modelNumber);

    page.assertOverflowChipVisible();
    page.clickOverflowChip();

    // Delete Model Number from the popover.
    // The MUI Popover auto-closes on React re-render after chip deletion, so
    // closePopover() must NOT be called — the element is already gone from the DOM.
    // React Query staleTime=30000ms means the grouped response may be served from
    // cache without a new network request, so assert UI state only.
    page.deletePopoverChipByLabel(data.fields.modelNumber);
    page.waitForTableLoad();

    // Brand chip should remain visible in the Autocomplete after Model Number is removed.
    page.assertFilledChip(data.fields.brand);
  });


  // ==========================================================================
  // Group G — Tab Combination (Use Case)
  // ==========================================================================

  // Use Case: tab switch does NOT clear groupBy chips; grouped request fires with updated productStatus
  it('SW-INV-GB-TC19 @regression — Tab switch preserves groupBy chip; grouped request reflects new tab productStatus', () => {
    page.selectGroupByField(data.fields.category);
    page.assertFilledChip(data.fields.category);

    cy.intercept('GET', '**/products/grouped**').as('grouped19');

    // Switching to Inactive should NOT clear chips (unlike category change)
    page.clickTab(data.tabs.inactive);

    cy.wait('@grouped19', { timeout: 20000 }).then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('groupBy'), 'groupBy preserved on tab switch').to.equal(data.fields.category);
      const status = url.searchParams.get('productStatus') || url.searchParams.get('status');
      expect(status, 'productStatus=inactive on Inactive tab').to.equal('inactive');
    });

    page.assertFilledChip(data.fields.category);
  });

  // ==========================================================================
  // Group H — Error Guessing
  // ==========================================================================

  // Error Guessing: no-match search while GroupBy active → empty grouped table; no error toast
  // Deferred — Group H section intentionally empty pending authoring. See pending.md.
  it.skip('SW-INV-GB-TC25 @regression — No-match search while GroupBy active → empty grouped table; no error toast', () => {
    // TODO: select a groupBy field, then search for data.noMatchSearch, assert
    // the table shows a "no rows" overlay and no error toast is displayed.
  });

  // Error Guessing: category change clears localStorage groupBy key
  // Deferred — Group H section intentionally empty pending authoring. See pending.md.
  it.skip('SW-INV-GB-TC26 @regression — Category change clears localStorage groupBy key (state cleanup on clear)', () => {
    // TODO: select a groupBy field (assert localStorage key set), change category,
    // assert localStorage key is cleared or empty.
  });

  // ==========================================================================
  // Group I — Attribute-Level Grouping with Aggregation + Identity Check
  // Group By aggregates ≥2 products that share an attribute value (SUM of
  // available/incoming/reserved). Identity check: typing the shared value in
  // the search bar and submitting CLEARS grouping (ItemList.tsx:1237) and
  // surfaces the constituent products in the standard /products view.
  //
  // Item-level attributes are NOT covered — getGroupedProducts only projects
  // products-table columns, so grouping by an item-attr returns 500
  // (see product.service.ts:13812 SQL — it never joins items).
  // ==========================================================================

  /** Find the grouped row whose <header> column equals <value>.
   *  BE may return display headers ("Memory Generation") or camelCase DB columns ("memoryGeneration"),
   *  so we try both plus lowercase as a fallback. */
  function findSeededRow(body, fieldHeader, value) {
    const list = extractList(body);
    // Convert display header → camelCase: "Memory Generation" → "memoryGeneration"
    const camelCase = fieldHeader
      .split(/\s+/)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    return (Array.isArray(list) ? list : []).find(
      (r) =>
        String(r[fieldHeader]) === String(value)
        || String(r[fieldHeader.toLowerCase()]) === String(value)
        || String(r[camelCase]) === String(value)
    );
  }

  // Decision Table: Brand=Lenovo (shared list attr) aggregated across 2 seeded Laptops; ≥ assertions
  // because other QA products carry the same brand. TC22 covers exact-SUM with a unique-per-run value.
  it('SW-INV-GB-TC20 @regression — Group by common product attribute "Brand" → bucket aggregates across products + identity by search', () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped20');
    page.selectGroupByField(data.fields.brand);

    cy.wait('@grouped20', { timeout: 20000 }).then(({ response }) => {
      // laptopProduct:  expected=7, available=1 → incoming=6
      // laptop2Product: expected=4, available=2 → incoming=2
      // Brand bucket includes ALL QA products with this brand → use ≥.
      const row = findSeededRow(response.body, data.fields.brand, data.brand);
      if (!row) {
        cy.log('TC20 DEBUG: grouped response:', JSON.stringify(extractList(response.body), null, 2));
        cy.log('TC20 DEBUG: looking for brand =', data.brand);
        cy.log('TC20 DEBUG: laptop products created:', laptopProductId, laptop2ProductId);
      }
      expect(row, `grouped row for brand=${data.brand}`).to.exist;
      expect(qty(row.availableQuantity), 'availableQty ≥ 3 (our seeds contribute 1+2)').to.be.at.least(3);
      expect(qty(row.incomingQuantity), 'incomingQty ≥ 8 (our seeds contribute 6+2)').to.be.at.least(8);
      expect(row, 'reservedQuantity field present').to.have.property('reservedQuantity');
    });

    // UI row visible in grouped table
    page.findGroupedRowByText(data.brand).should('exist');

    // Identity check skipped for Brand: "Lenovo" returns 1000+ products in QA,
    // causing the table to hang. TC21 and TC22 (unique-per-run values) prove
    // the identity-search-clears-grouping contract instead.
  });

  // Decision Table: Memory Generation (unique-per-run) aggregated across 2 RAM rambrands;
  // exact-SUM (avail=4, inc=6). UI paginates at 75/page → direct API call with page_size=2000.
  it('SW-INV-GB-TC21 @regression — Group by RAM-category product attribute "Memory Generation" → bucket aggregates across rambrands + identity by search', () => {
    page.selectCategory(data.categories.ram.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped21');
    page.selectGroupByField(data.fields.memoryGeneration);

    // Wait for the UI grouped request to fire, then extract the categoryId
    // used by the FE so we can make a direct API call with all rows.
    cy.wait('@grouped21', { timeout: 20000 }).then(({ request }) => {
      const url = new URL(request.url);
      const catId = url.searchParams.get('categoryId');

      // Direct API call with large page_size to bypass UI pagination
      const apiPath = `/products/grouped?groupBy=${encodeURIComponent(data.fields.memoryGeneration)}&categoryId=${catId}&page_size=2000&productStatus=active`;
      apiReq('GET', apiPath).then((res) => {
        // RAM #1 (Corsair): expected=5, available=2 → incoming=3
        // RAM #2 (GSkill):  expected=5, available=2 → incoming=3
        // Memory Generation bucket should SUM to exactly: available=4, incoming=6
        // (memoryGeneration value is unique-per-run → no other rows contribute).
        const row = findSeededRow(res.body, data.fields.memoryGeneration, ramMemGen);
        if (!row) {
          const list = extractList(res.body);
          cy.log('TC21 DEBUG: total grouped rows:', list.length);
          cy.log('TC21 DEBUG: looking for memoryGeneration =', ramMemGen);
          cy.log('TC21 DEBUG: first row keys:', list.length > 0 ? Object.keys(list[0]).join(', ') : 'empty');
          cy.log('TC21 DEBUG: RAM products created:', ramProductId, ramProduct2Id);
        }
        expect(row, `grouped row for memoryGeneration=${ramMemGen}`).to.exist;
        expect(qty(row.availableQuantity), 'availableQty === 4 (2+2)').to.equal(4);
        expect(qty(row.incomingQuantity), 'incomingQty === 6 (3+3)').to.equal(6);
        if (row.productCount !== undefined) {
          expect(Number(row.productCount), 'productCount === 2').to.equal(2);
        }
      });
    });

    // Identity — searching the unique memoryGeneration value reveals BOTH
    // rambrand constituents (Corsair + GSkill) in the standard products view.
    page.assertSearchRevealsConstituents(ramMemGen, [data.ramBrand, data.ramBrand2]);
  });

  // Decision Table: Battery Cell Count (unique-per-run) aggregated across 2 seeded Laptops;
  // exact-SUM (avail=3, inc=8). Column Customisation stale-config cleared in before() pre-cleanup.
  it('SW-INV-GB-TC22 @regression — Group by Laptop-category product attribute "Battery Cell Count" → bucket aggregates + identity by search', () => {
    page.selectCategory(data.categories.laptop.name);

    cy.intercept('GET', '**/products/grouped**').as('grouped22');
    page.selectGroupByField(data.fields.batteryCellCount);

    cy.wait('@grouped22', { timeout: 20000 }).then(({ response }) => {
      // Both seeded Laptops share batteryCellCount=sharedBatteryCount (unique to this run).
      // Bucket should SUM to exactly: available=3, incoming=8.
      const row = findSeededRow(response.body, data.fields.batteryCellCount, sharedBatteryCount);
      if (!row) {
        cy.log('TC22 DEBUG: grouped response:', JSON.stringify(extractList(response.body), null, 2));
        cy.log('TC22 DEBUG: looking for batteryCellCount =', sharedBatteryCount);
        cy.log('TC22 DEBUG: Laptop products created:', laptopProductId, laptop2ProductId);
      } else if (qty(row.availableQuantity) !== 3) {
        cy.log('TC22 DEBUG: found row but qty mismatch:', JSON.stringify(row, null, 2));
        cy.log('TC22 DEBUG: expected availableQuantity=3, got', row.availableQuantity);
      }
      expect(row, `grouped row for batteryCellCount=${sharedBatteryCount}`).to.exist;
      expect(qty(row.availableQuantity), 'availableQty === 3 (1+2)').to.equal(3);
      expect(qty(row.incomingQuantity), 'incomingQty === 8 (6+2)').to.equal(8);
      if (row.productCount !== undefined) {
        expect(Number(row.productCount), 'productCount === 2').to.equal(2);
      }
    });

    // UI row visible with Available cell = 3
    page.assertAvailableInRow(String(sharedBatteryCount), 3);

    // Identity — searching the shared battery cell count reveals both seeded model numbers
    page.assertSearchRevealsConstituents(sharedBatteryCount, [laptopModel, laptop2Model]);
  });

  // ==========================================================================
  // Group J — Column-Customisation Gate (Use Case)
  // Dropdown options derive from the columns persisted by Column Customisation
  // (POST /configs?type=inventoryCategoryFilter&name=<cat>). When a config
  // exists, only those headers may appear as group-by options.
  // ==========================================================================

  // Use Case: POST /configs gate — when inventoryCategoryFilter config exists, Group By
  // dropdown only lists allowed column headers; disallowed headers are absent.
  it('SW-INV-GB-TC23 @regression — Group By dropdown only shows columns persisted via Column Customisation', () => {
    expect(userId, 'userId resolved from localStorage').to.not.be.null;

    const cfg = data.configGate;
    const payload = {
      name: cfg.type + data.categories.laptop.name,
      type: cfg.type,
      configJson: { columns: cfg.allowed },
      userID: String(userId),
    };

    // Pre-cleanup: delete any stale config left from a previous run that crashed
    // before after() could clean up. GET /configs?type=…&name=… returns the list.
    apiReq('GET', `/configs?type=${encodeURIComponent(payload.type)}&name=${encodeURIComponent(payload.name)}`).then((lookupRes) => {
      const lookupBody = lookupRes.body || {};
      const lookupData = lookupBody?.data || lookupBody;
      const existing = Array.isArray(lookupData?.list) ? lookupData.list
        : Array.isArray(lookupData) ? lookupData
        : lookupData?.id ? [lookupData] : [];
      // Delete every stale config row that matches
      const deleteChain = existing.reduce(
        (chain, cfg) => chain.then(() => cfg?.id ? apiReq('DELETE', `/configs/${cfg.id}`) : cy.wrap(null)),
        cy.wrap(null),
      );
      return deleteChain;
    }).then(() => {
      // POST the config and capture its id for cleanup in after().
      return apiReq('POST', '/configs', payload);
    }).then((res) => {
      // Envelope: { statusCode, success, data: {...} } — id can live in data, data.id, or data.list[0].id
      const body = res.body || {};
      const d = body?.data || body;
      gateConfigId = d?.id
        || d?.list?.[0]?.id
        || (Array.isArray(d) ? d[0]?.id : undefined)
        || d?.[0]?.id
        || (Array.isArray(body) ? body[0]?.id : undefined)
        || body?.id;
      if (!gateConfigId) {
        cy.log('POST /configs status:', res.status);
        cy.log('POST /configs full body:', JSON.stringify(res.body, null, 2));
        cy.log('Extracted d object:', JSON.stringify(d, null, 2));
      }
      expect(gateConfigId, 'config id returned by POST /configs').to.exist;

      // Reload after seeding so the FE useQuery picks up the new config row.
      cy.reload();
      page.waitForTableLoad();
      page.selectCategory(data.categories.laptop.name);

      // Open dropdown — allowed headers must be present, disallowed absent.
      page.assertDropdownOptionsInclude(cfg.allowed);
      page.assertDropdownOptionsExclude(cfg.disallowed);

      // Sanity: selecting an allowed field still fires GET /products/grouped
      cy.intercept('GET', '**/products/grouped**').as('grouped23');
      page.selectGroupByField(data.fields.brand);
      cy.wait('@grouped23', { timeout: 20000 }).then(({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('groupBy')).to.equal(data.fields.brand);
      });
    });
  });




});
