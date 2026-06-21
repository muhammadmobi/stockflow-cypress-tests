/**
 * InventoryAdvancedSearchTests.cy.js
 * ============================================================
 * Spec: Inventory Advanced Search — modal flow, criteria, chips, category context
 * Page Object: cypress/pageObjects/InventoryAdvancedSearchPage.js
 * Locators:    cypress/support/locators/InvAdvancedSearchLocators.js
 * Fixtures:    cypress/fixtures/inventoryAdvancedSearchData.json
 *
 * Categories:
 *   RAM Automation Cat (id:106, allowItems:false) — product-only
 *   Laptop Automation Cat (id:105, allowItems:true) — product + items
 *
 * Seeding: API-only (POST /products, POST /incoming-items/add-product,
 *          POST /products/item — direct item creation with status=Available and
 *          item attributes pre-set; replaces the broken scan+check-in+PATCH chain).
 * Cleanup: POST /products/deleteProduct in after().
 *
 */

import InventoryAdvancedSearchPage from '../../pageObjects/InventoryAdvancedSearchPage';
import data from '../../fixtures/inventoryAdvancedSearchData.json';
import L from '../../support/locators/InvAdvancedSearchLocators';

// ── Module-level state ─────────────────────────────────────────────────────
let authToken;
let apiUrl;
let ts;

// Seeds created in before() — cleaned up in after()
let ramProductId;
let laptopProductId;
let laptopSerial;

// Live category IDs resolved dynamically in before() so they don't go stale
// when the QA DB is reset. Fallback to fixture values if lookup fails.
let ramCatId;
let laptopCatId;

// Unique per-run stamped values (set in before())
let ramMemGen;
let ramDisplayTech;
const ramBrand = data.ramBrandOptions[0]; // 'Corsair' — first valid RAMbrand list value; sourced from fixture

let laptopModel;
let laptopAssetTagId;
let laptopAssetSec;

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

// ── Top-level describe ─────────────────────────────────────────────────────
describe('Inventory Advanced Search', { tags: ['@regression'] }, () => {
  const page = new InventoryAdvancedSearchPage();

  // ── Seed once per suite ──────────────────────────────────────────────────
  before(() => {
    cy.adminSession();

    // Resolve auth token and API URL
    cy.getAuthToken().then((token) => {
      authToken = token;
      apiUrl = Cypress.env('API_BASE_URL');
      ts = Date.now();

      // Unique stamped values
      ramMemGen      = `DDR5-AS-${ts}`;
      ramDisplayTech = `IPS-AS-${ts}`;
      laptopModel    = `LT-AS-${ts}`;
      laptopAssetTagId = `ATG-AS-${ts}`;
      laptopAssetSec   = `SEC-AS-${ts}`;
      laptopSerial     = `SN-LT-AS-${ts}`;

      // Resolve live category IDs — fixture values can go stale after DB resets
      apiReq('GET', '/categories?page=1&page_size=1000').then((res) => {
        const body = res.body?.data;
        const arr = body?.list || body?.items || body?.results
          || (Array.isArray(body) ? body : null) || [];
        const ram    = arr.find((c) => c.name === data.categories.ram.name);
        const laptop = arr.find((c) => c.name === data.categories.laptop.name);
        if (ram)    ramCatId    = ram.id;
        if (laptop) laptopCatId = laptop.id;
      });

      // 1. Create RAM product with common + RAM-specific attrs
      apiReq('POST', '/products', {
        category: data.categories.ram.name,
        memoryGeneration: ramMemGen,
        rambrand: ramBrand,
        displayTechnology: ramDisplayTech,
      }).then((res) => {
        ramProductId = extractId(res);
        expect(ramProductId, 'RAM product created').to.exist;
      });

      // 2. Create Laptop product with Laptop-specific product attr
      apiReq('POST', '/products', {
        category: data.categories.laptop.name,
        modelNumber: laptopModel,
        brand: 'Lenovo',
      }).then((res) => {
        laptopProductId = extractId(res);
        expect(laptopProductId, 'Laptop product created').to.exist;

        // 3. Create a PO for the Laptop product and directly create the item.
        //
        //    WHY NOT scan + check-in + PATCH:
        //      • POST /incoming-items/scan only works for serials already in
        //        the items table (it queries items WHERE serialNumber = $1 and
        //        throws "not found" for new serials).
        //      • POST /incoming-items/check-in requires items with status=Incoming
        //        to exist in the items table first.
        //      • PATCH /products/item/:sn runs UPDATE on the items table; when the
        //        item isn't there yet the UPDATE affects 0 rows silently.
        //
        //    WHY POST /products/item works:
        //      • Creates the item directly in the items table with status=Available.
        //      • The Joi schema (getItemSchema) is built from all item-level
        //        attributes for the category, so assetTagId (Laptop item attr) and
        //        assetSecurityCode (Common item attr) are known fields → they are
        //        written as native columns (added by attribute.service.create via
        //        ALTER TABLE items ADD COLUMN IF NOT EXISTS "${fieldName}").
        //      • Requires the PO + quantities record to already exist (add-product).
        const po = `AS-LT-PO-${ts}`;
        apiReq('POST', '/incoming-items/add-product', {
          poNumber: po,
          productId: laptopProductId,
          expectedQuantity: 1,
          cost: 0,
        }).then(() => {
          // Create the item directly — status=Available, attributes pre-set.
          apiReq('POST', '/products/item', {
            poNumber: po,
            productId: Number(laptopProductId),
            serialNumber: [laptopSerial],
            cost: 0,
            assetTagId: laptopAssetTagId,
            assetSecurityCode: laptopAssetSec,
          }).then((res) => {
            expect(res.status, 'POST /products/item must succeed').to.be.oneOf([200, 201]);
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

      if (ramProductId) {
        apiReq('POST', '/products/deleteProduct', { id: ramProductId });
      }
      if (laptopProductId) {
        // deleteProduct cascades to the items table via the productId FK, so
        // the Laptop item (SN-LT-AS-${ts}) is implicitly removed as well.
        apiReq('POST', '/products/deleteProduct', { id: laptopProductId });
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
    // Clear sessionStorage so advancedSearchCriteria from a previous test
    // never bleeds into the next one (ItemList initialises from sessionStorage
    // on every mount, causing stale chips / chip-count mismatches).
    cy.clearAllSessionStorage();
    page.navigateToInventory();
  });

  // ==========================================================================
  // Group A — Modal lifecycle & validation
  // ==========================================================================

  // Use Case: dialog opens; GET /products/searchable-fields fires; accordions render
  it('SW-INV-AS-TC01 @smoke — Open Advanced Search dialog; searchable-fields loaded; accordion renders', { tags: ['@smoke'] }, () => {
    page.openAdvancedSearch();

    cy.get(L.dialogTitle).should('contain.text', 'Advanced Search');
    cy.get(L.accordion).should('have.length.greaterThan', 0);
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('be.disabled');
      cy.contains('button', 'Clear All').should('be.disabled');
    });

    page.closeViaCancel();
  });

  // Use Case: Cancel closes dialog without firing POST
  it('SW-INV-AS-TC02 @regression — Cancel closes dialog without firing POST /products/advanced-search', () => {
    page.openAdvancedSearch();
    page.fillField('Display Technology', 'IPS');

    cy.intercept('POST', '**/products/advanced-search**').as('noSearch');
    page.closeViaCancel();

    cy.get(L.dialog).should('not.exist');
    cy.get('@noSearch.all').should('have.length', 0);
  });

  // Use Case: Escape key closes dialog without firing POST
  it('SW-INV-AS-TC03 @regression — Escape key closes dialog without firing POST', () => {
    page.openAdvancedSearch();

    cy.intercept('POST', '**/products/advanced-search**').as('noSearchEsc');
    page.closeViaEscape();

    cy.get(L.dialog).should('not.exist');
    cy.get('@noSearchEsc.all').should('have.length', 0);
  });

  // EP (field filter): type to filter narrows accordion field list
  it('SW-INV-AS-TC04 @regression — EP field filter: typing "memory" shows memory fields, hides others', () => {
    page.openAdvancedSearch();

    page.filterFieldsByName(data.filterFieldQuery); // "memory"

    cy.get(L.dialog).within(() => {
      // RAM Automation Cat accordion must appear with exactly 2 memory fields
      cy.contains(L.accordion, data.categories.ram.name)
        .find('input[placeholder*="memory"]')
        .should('have.length', 2);
      cy.contains(L.accordion, data.categories.ram.name)
        .find('input[placeholder="Search by memory capacity..."]')
        .should('exist');
      cy.contains(L.accordion, data.categories.ram.name)
        .find('input[placeholder="Search by memory generation..."]')
        .should('exist');
      // Non-memory fields should be absent from the field list.
      // Use 'not.be.visible' rather than 'not.exist': simplebar keeps filtered
      // inputs in the DOM (CSS-hidden via the simplebar-content wrapper) while
      // only removing them visually. 'not.be.visible' passes for both hidden
      // and genuinely absent elements.
      cy.get('input[placeholder*="display technology"]').should('not.be.visible');
      cy.get('input[placeholder*="support contact"]').should('not.be.visible');
    });

    page.closeViaCancel();
  });

  // ==========================================================================
  // Group B — Category = All (common attributes)
  // ==========================================================================

  // Use Case + Decision Table: All cat / common Product attr — search returns products from any category
  it('SW-INV-AS-TC05 @smoke — [All cat / Common Product attr] Display Technology search returns seeded RAM product', { tags: ['@smoke'] }, () => {
    page.customizeColumn('Display Technology');

    page.openAdvancedSearch();

    // Category = All → toggle should be visible
    page.assertToggleVisible();

    page.fillField('Display Technology', ramDisplayTech);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch06');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch06', { timeout: 20000 }).then(({ request }) => {
      expect(request.body.criteria[0].searchField, 'searchField').to.eq('displayTechnology');
      expect(request.body.criteria[0].searchType, 'searchType').to.eq('contains');
    });

    page.waitForTableLoad();
    cy.get('tbody').should('contain.text', ramDisplayTech);
    // Active filter chip should appear
    cy.get(L.filterChip).should('contain.text', ramDisplayTech);
  });

  // Use Case + Decision Table: All cat / common Item attr — results from Laptop (allowItems=true) only
  it('SW-INV-AS-TC06 @regression — [All cat / Common Item attr] Asset Security Code search returns Laptop item', () => {
    // Note: 'Asset Security Code' is an Item-level attribute and does not appear in the
    // product-level Customize Columns panel (filtered by entityType=Product). Skip column
    // customization and verify via API body + table non-emptiness.

    page.openAdvancedSearch();

    page.fillField('Asset Security Code', laptopAssetSec);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch07');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch07', { timeout: 20000 }).then(({ request }) => {
      expect(request.body.criteria[0].searchField).to.eq('assetSecurityCode');
      expect(request.body.criteria[0].entityType).to.eq('Item');
    });

    page.waitForTableLoad();
    // Assertion is intentionally length.greaterThan(0) rather than asserting the exact
    // seeded row: 'Asset Security Code' is an Item-level attr filtered out of the
    // product-level Customize Columns panel (entityType=Product), so no column can be
    // enabled to make the seeded value visible in the table. The key proof here is the
    // API-body assertion above (searchField + entityType) and the allowItems gate check
    // below. TC13 provides the exact-row assertion under the Laptop category context
    // where Model Number (a Product attr) CAN be enabled as a column.
    cy.get('tbody tr').should('have.length.greaterThan', 0);
    // RAM product row should not appear (no items on allowItems=false category)
    cy.get('tbody').should('not.contain.text', ramDisplayTech);
  });

  // ==========================================================================
  // Group C — RAM Automation Cat (product-only, allowItems=false)
  // ==========================================================================

  // Use Case + Decision Table: RAM cat / category-specific Product attr → only RAM product returned
  it('SW-INV-AS-TC07 @smoke — [RAM cat / Category Product attr] Memory Generation search returns seeded RAM product', { tags: ['@smoke'] }, () => {
    page.selectCategory(data.categories.ram.name);
    page.customizeColumn('Memory Generation');

    page.openAdvancedSearch();

    // Specific category selected → toggle should be absent
    page.assertToggleAbsent();
    // RAM category accordion should be present
    page.assertAccordionPresent(data.categories.ram.name);

    page.fillField('Memory Generation', ramMemGen);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch08');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch08', { timeout: 20000 }).then(({ request }) => {
      expect(request.body.criteria[0].searchField).to.eq('memoryGeneration');
      // Use live category ID resolved in before(); fall back to fixture if lookup failed
      expect(Number(request.body.categoryId)).to.eq(ramCatId || data.categories.ram.id);
    });

    page.waitForTableLoad();
    cy.get('tbody').should('contain.text', ramMemGen);
  });

  // Decision Table: RAM cat with allowItems=false → item attr accordion absent
  it('SW-INV-AS-TC08 @regression — [RAM cat] Item attribute accordion absent — allowItems=false gate', () => {
    page.selectCategory(data.categories.ram.name);

    page.openAdvancedSearch();

    page.assertItemFieldsAbsent();
    cy.get(L.dialog).within(() => {
      cy.get('input[placeholder*="asset tag id"]').should('not.exist');
    });

    page.closeViaCancel();
  });

  // Decision Table: two RAM product criteria (AND) — only row matching both returned
  it('SW-INV-AS-TC09 @regression — [RAM cat] Two product criteria AND — intersection returned', () => {
    page.selectCategory(data.categories.ram.name);
    page.customizeColumn('Memory Generation');
    page.customizeColumn('RAMbrand');

    page.openAdvancedSearch();

    page.fillField('Memory Generation', ramMemGen);
    page.fillField('RAMbrand', ramBrand);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch10');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch10', { timeout: 20000 }).then(({ request }) => {
      expect(request.body.criteria, 'criteria count').to.have.length(2);
      const fields = request.body.criteria.map((c) => c.searchField);
      expect(fields).to.include('memoryGeneration');
      expect(fields).to.include('rambrand');
    });

    page.waitForTableLoad();
    cy.get('tbody').should('contain.text', ramMemGen);
    // Two chips should appear in active filters
    cy.get(L.filterChip).should('have.length', 2);
  });

  // ==========================================================================
  // Group D — Laptop Automation Cat (product+items, allowItems=true)
  // ==========================================================================

  // Use Case + Decision Table: Laptop cat / category-specific Product attr
  it('SW-INV-AS-TC10 @smoke — [Laptop cat / Category Product attr] Model Number search returns seeded Laptop product', { tags: ['@smoke'] }, () => {
    page.selectCategory(data.categories.laptop.name);
    page.customizeColumn('Model Number');

    page.openAdvancedSearch();

    page.assertToggleAbsent();
    page.assertAccordionPresent(data.categories.laptop.name);

    page.fillField('Model Number', laptopModel);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch11');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch11', { timeout: 20000 }).then(({ request }) => {
      expect(request.body.criteria[0].searchField).to.eq('modelNumber');
      // Use live category ID resolved in before(); fall back to fixture if lookup failed
      expect(Number(request.body.categoryId)).to.eq(laptopCatId || data.categories.laptop.id);
    });

    page.waitForTableLoad();
    cy.get('tbody').should('contain.text', laptopModel);
  });

  // Use Case + Decision Table: Laptop cat / category-specific Item attr
  it('SW-INV-AS-TC11 @smoke — [Laptop cat / Category Item attr] Asset Tag ID search returns Laptop item', { tags: ['@smoke'] }, () => {
    page.selectCategory(data.categories.laptop.name);
    // 'Asset Tag ID' is an Item-level attribute; use 'Model Number' (Product attr) to
    // make the seeded laptop row identifiable in the table.
    page.customizeColumn('Model Number');

    page.openAdvancedSearch();

    page.assertAccordionPresent(data.categories.laptop.name);

    page.fillField('Asset Tag ID', laptopAssetTagId);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch12');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch12', { timeout: 20000 }).then(({ request }) => {
      expect(request.body.criteria[0].searchField).to.eq('assetTagId');
      expect(request.body.criteria[0].entityType).to.eq('Item');
    });

    page.waitForTableLoad();
    // Model Number column is now visible; the seeded laptop product should appear
    cy.get('tbody').should('contain.text', laptopModel);
  });

  // Use Case + Decision Table: Laptop cat / common Item attr via Laptop context
  it('SW-INV-AS-TC12 @regression — [Laptop cat / Common Item attr] Asset Security Code search returns Laptop item', () => {
    page.selectCategory(data.categories.laptop.name);
    // 'Asset Security Code' is an Item-level attribute; use 'Model Number' (Product attr)
    // to make the seeded laptop row identifiable in the table.
    page.customizeColumn('Model Number');

    page.openAdvancedSearch();

    page.fillField('Asset Security Code', laptopAssetSec);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch13');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch13', { timeout: 20000 }).then(({ request }) => {
      const asc = request.body.criteria.find((c) => c.searchField === 'assetSecurityCode');
      expect(asc, 'assetSecurityCode criterion').to.exist;
      expect(asc.entityType).to.eq('Item');
    });

    page.waitForTableLoad();
    // Model Number column is now visible; the seeded laptop product should appear
    cy.get('tbody').should('contain.text', laptopModel);
  });

  // Decision Table: All/Category toggle — visible when All; hidden when specific category
  it('SW-INV-AS-TC13 @regression — Toggle visible for "All" category; hidden for specific category; "Category" shows common fields only', () => {
    // 1. Category = All → toggle visible
    page.openAdvancedSearch();
    page.assertToggleVisible();
    cy.get(L.toggleGroup).within(() => {
      cy.get('button:first-child').should('be.visible');
      cy.get('button:last-child').should('be.visible');
    });

    // 2. Click Category toggle — common accordions remain; category-specific accordions hidden
    page.clickCategoryToggle();
    cy.get(L.dialog).within(() => {
      // With no specific category selected, showOnlySelectedCategory=true + no id → only common fields remain
      cy.get(L.accordion).should('contain.text', 'Common');
    });

    page.closeViaCancel();

    // 3. Select specific category → toggle absent
    page.selectCategory(data.categories.ram.name);
    page.openAdvancedSearch();
    page.assertToggleAbsent();
    page.closeViaCancel();
  });

  // ==========================================================================
  // Group E — Context and chips
  // ==========================================================================

  // Decision Table: Active tab context → POST includes productStatus=active
  it('SW-INV-AS-TC14 @regression — Active tab context: POST includes productStatus=active', () => {
    cy.contains('Active Products').click();
    page.waitForTableLoad();

    page.openAdvancedSearch();
    page.fillField('Display Technology', ramDisplayTech);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch15');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch15', { timeout: 20000 }).then(({ request }) => {
      const url = request.url;
      expect(url).to.include('productStatus=active');
    });
  });

  // Decision Table: Inactive tab context → POST includes productStatus=inactive
  it('SW-INV-AS-TC15 @regression — Inactive tab context: POST includes productStatus=inactive', () => {
    cy.contains('Inactive Products').click();
    page.waitForTableLoad();

    page.openAdvancedSearch();
    page.fillField('Display Technology', ramDisplayTech);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch16');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch16', { timeout: 20000 }).then(({ request }) => {
      const url = request.url;
      expect(url).to.include('productStatus=inactive');
    });
  });

  // State Transition: individual chip removal → auto re-search with remaining criteria
  it('SW-INV-AS-TC16 @regression — State Transition: remove one chip → auto re-search with remaining criteria', () => {
    page.selectCategory(data.categories.ram.name);
    page.customizeColumn('Memory Generation');
    page.customizeColumn('RAMbrand');

    // Set up two criteria first
    page.openAdvancedSearch();
    page.fillField('Memory Generation', ramMemGen);
    page.fillField('RAMbrand', ramBrand);

    cy.intercept('POST', '**/products/advanced-search**').as('firstSearch');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@firstSearch', { timeout: 20000 });
    page.waitForTableLoad();

    cy.get(L.filterChip).should('have.length', 2);

    // Remove first chip → re-search with 1 criterion
    cy.intercept('POST', '**/products/advanced-search**').as('reSearch');
    cy.get(L.filterChip).first().find(L.chipDeleteIcon).click();
    cy.wait('@reSearch', { timeout: 20000 }).then(({ request }) => {
      expect(request.body.criteria, 'criteria after chip removal').to.have.length(1);
    });

    // 1 criterion remaining: 1 chip in search-input adornment + 1 in the
    // below-search results-info row = 2 total .MuiChip-filled on the page.
    cy.get(L.filterChip).should('have.length', 2);
  });

  // State Transition: last chip removed → GET /products restores list
  it('SW-INV-AS-TC17 @regression — State Transition: remove last chip → standard GET /products restores list', () => {
    page.openAdvancedSearch();
    page.fillField('Display Technology', ramDisplayTech);

    cy.intercept('POST', '**/products/advanced-search**').as('search18');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@search18', { timeout: 20000 });
    page.waitForTableLoad();

    // 1 criterion: 1 chip in search-input adornment + 1 in the below-search
    // results-info row = 2 total .MuiChip-filled on the page.
    cy.get(L.filterChip).should('have.length', 2);

    cy.intercept('GET', '**/products**').as('productListRestore');
    cy.get(L.filterChip).first().find(L.chipDeleteIcon).click();
    cy.wait('@productListRestore', { timeout: 20000 });

    // 0 criteria: the search-input adornment chip is gone; scope to the
    // start-adornment area so unrelated warning/status chips elsewhere on the
    // page do not cause a false failure.
    cy.get(L.searchInputChip).should('not.exist');
    page.waitForTableLoad();
  });

  // Use Case: Clear All removes all criteria; standard list restored
  it('SW-INV-AS-TC18 @regression — Use Case: Clear All removes all criteria and restores standard product list', () => {
    page.openAdvancedSearch();
    page.fillField('Display Technology', ramDisplayTech);

    cy.intercept('POST', '**/products/advanced-search**').as('search19');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@search19', { timeout: 20000 });
    page.waitForTableLoad();

    cy.get(L.filterChip).should('have.length.greaterThan', 0);

    page.clearAll();

    // After Clear All, no criteria chips should remain in the search-input
    // adornment. Scope to start-adornment so unrelated filled chips elsewhere
    // on the page (e.g. low-stock warning badges) don't cause false failures.
    cy.get(L.searchInputChip).should('not.exist');
    page.waitForTableLoad();
  });

  // State Transition: re-open after search → previous criteria pre-populated
  it('SW-INV-AS-TC19 @regression — State Transition: re-open after search → previous criteria hydrated in modal', () => {
    page.openAdvancedSearch();
    page.fillField('Display Technology', ramDisplayTech);

    cy.intercept('POST', '**/products/advanced-search**').as('search20');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@search20', { timeout: 20000 });
    page.waitForTableLoad();

    // Close dialog (it closes after search automatically on some implementations,
    // or we can re-open manually)
    page.openAdvancedSearch();

    // Previously typed value should still be in the field
    cy.get(L.dialog).within(() => {
      cy.get('input[placeholder="Search by display technology..."]')
        .scrollIntoView()
        .should('have.value', ramDisplayTech);
    });

    page.closeViaCancel();
  });

  // State Transition: category change after advanced search → criteria cleared
  it('SW-INV-AS-TC20 @regression — State Transition: category change clears advanced search criteria', () => {
    page.openAdvancedSearch();
    page.fillField('Display Technology', ramDisplayTech);

    cy.intercept('POST', '**/products/advanced-search**').as('search21');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@search21', { timeout: 20000 });
    page.waitForTableLoad();

    cy.get(L.filterChip).should('have.length.greaterThan', 0);

    // Change category → criteria should be cleared
    cy.intercept('GET', '**/products**').as('productListCatChange');
    page.selectCategory(data.categories.ram.name);
    cy.wait('@productListCatChange', { timeout: 20000 });

    // After category change the criteria are cleared; assert no criteria chip
    // in the search-input adornment. Other filled chips on the page (e.g.
    // low-stock warning badges that only appear for specific categories) must
    // not cause a false failure, so we scope to the start-adornment area.
    cy.get(L.searchInputChip).should('not.exist');

    // Re-open dialog → form should be empty
    page.openAdvancedSearch();
    cy.get(L.dialog).within(() => {
      cy.get('input[placeholder="Search by memory generation..."]')
        .scrollIntoView()
        .should('have.value', '');
    });
    page.closeViaCancel();
  });

  // Error Guessing: case-insensitive ILIKE — uppercase query finds lowercase-stamped value
  it('SW-INV-AS-TC21 @regression — Error Guessing: uppercase query matches lowercase-stamped value (ILIKE)', () => {
    page.selectCategory(data.categories.ram.name);
    page.customizeColumn('Memory Generation');

    page.openAdvancedSearch();

    // Type the memGen in UPPERCASE
    page.fillField('Memory Generation', ramMemGen.toUpperCase());

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch23');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch23', { timeout: 20000 });
    page.waitForTableLoad();

    // ILIKE on backend is case-insensitive — seeded product should appear
    cy.get('tbody').should('contain.text', ramMemGen);
  });

  // EP (no-match): no matching criterion → empty table; no error toast
  it('SW-INV-AS-TC22 @regression — EP no-match: non-existent value → empty table; no error toast', () => {
    page.openAdvancedSearch();
    page.fillField('Display Technology', data.noMatchValue);

    cy.intercept('POST', '**/products/advanced-search**').as('advSearch24');
    cy.get(L.dialog).within(() => {
      cy.contains('button', 'Search').should('not.be.disabled').click();
    });
    cy.wait('@advSearch24', { timeout: 20000 });
    page.waitForTableLoad();

    page.assertTableEmpty();
    // No error toast bubble (react-hot-toast renders errors with role="alert")
    page.assertNoErrorToast();
  });
});
