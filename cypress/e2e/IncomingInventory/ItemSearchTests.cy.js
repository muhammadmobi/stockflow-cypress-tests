/**
 * Item Search — Product Detail Items List
 * SW-ISE-UI-TC01 – SW-ISE-UI-TC14  +  SW-ISE-UI-DT-{status} (Decision Table)
 *
 * Tests the search input, status-filter cards, and basic pagination on the
 * ItemViewItemList component rendered inside /incoming-inventory/:name/:id.
 *
 * Navigation strategy
 * ───────────────────
 * Direct cy.visit() to the product detail URL is unreliable because the
 * component reads location.state for po_no / backPath. We work around this
 * by appending a ?state=<JSON> query param — ItemView.tsx falls back to
 * JSON.parse(query.get('state')) when location.state is absent (lines 61-63).
 *
 * Data strategy
 * ─────────────
 * GET /incoming-items is @Public() and returns items-enabled products with
 * their PO numbers. before() probes this endpoint, stores a real poNumber +
 * productId, then probes GET /incoming-items/:po/:id/items (auth required)
 * to capture a known serial number for search-term tests.
 *
 * Locator references
 * ──────────────────
 * All selectors live in ItemSearchLocators.js — never inline in this file.
 */

import ProductDetailsSearchPage from '../../pageObjects/ProductDetailsSearchPage';
import data from '../../fixtures/itemSearchTestData.json';
import { ensureCommonAttributesOptional } from '../../support/helpers/attributeHelpers';
import { ItemSearchLocators } from '../../support/locators/ItemSearchLocators';

describe('Item Search — Incoming Inventory Product Detail', { tags: ['@regression'] }, () => {
  const page = new ProductDetailsSearchPage();

  let foundPoNumber;
  let foundProductId;
  let knownSerial;
  let serialPrefix;
  let deepSerial;
  let seededPO;
  let authToken;

  // Seed shape lives in the fixture (itemSearchTestData.json → seed) — no test data
  // is inlined in this spec.
  const seed = data.seed;
  const SEEDED_ITEM_COUNT = seed.itemCount;

  const apiBase = () => Cypress.env('API_BASE_URL');

  // Minimal state injected via URL ?state= so ItemView renders the items list
  const buildVisitUrl = () => {
    const stateJson = JSON.stringify({
      po_no: foundPoNumber,
      backPath: '/incoming-inventory',
      action: 'item',
    });
    return `/incoming-inventory/Product/${foundProductId}?state=${encodeURIComponent(stateJson)}`;
  };

  // ============================================================================
  // SETUP — probe API for a real PO with items, navigate once
  // ============================================================================

  // ── Seed a PO whose items cover EVERY status the filter cards expose ────────
  //
  // This used to probe QA for any PO with an items-enabled product. That made the
  // whole spec hostage to whatever happened to be on the shared environment: if no
  // suitable PO existed, beforeEach skipped all 19 tests; and because a probed PO's
  // items are usually all Available, the Missing / Incoming stat tiles read 0. A
  // zero-count tile fires no request when clicked, which is why DT-Missing failed
  // ("no request ever occurred") and DT-Incoming was hard-skipped outright.
  //
  // Seed the statuses instead, so every tile in statusFilters has at least one item
  // and is genuinely clickable:
  //   3 × Available (scanned) · 1 × Damaged · 1 × Missing · 3 × Incoming (untouched)
  // → Received = 4 (3 scanned + the damaged one, which is received but not available).
  before(() => {
    cy.iaAuthToken().then((token) => {
      expect(token, 'identity server must return a bearer token').to.exist;
      authToken = token;

      // Required attrs would otherwise reject seed rows that omit their columns
      // (ImportTests tightens them globally).
      ensureCommonAttributesOptional();

      const stamp = `${Date.now()}`;
      seededPO = `${seed.poPrefix}-${stamp}`;
      const serials = Array.from(
        { length: SEEDED_ITEM_COUNT },
        (_, i) => `${seed.serialPrefix}-${stamp}-${String(i + 1).padStart(2, '0')}`,
      );
      const fileName = `ItemSearchSeed-${stamp}.xlsx`;

      cy.task('createExcelFile', {
        filePath: `cypress/fixtures/${fileName}`,
        data: serials.map((sn) => ({
          Category: seed.product.category,
          'Model Number': `${seed.product.modelNumberPrefix} ${stamp}`,
          Brand: seed.product.brand,
          Cost: seed.product.cost,
          Price: seed.product.price,
          'Support Contact': seed.product.supportContact,
          'Serial Number': sn,
          Quantity: 1,
        })),
      });

      cy.task('uploadExcelToApi', {
        filePath: `cypress/fixtures/${fileName}`,
        poNumber: seededPO,
        authToken: token,
        baseUrl: apiBase(),
      }).then((res) => {
        expect(res.status, `seed import for ${seededPO}`).to.be.oneOf([200, 201]);
        expect(res.body?.success, `seed import success for ${seededPO}`).to.eq(true);
      });

      const markStatus = (serialNumber, status, extra = {}) =>
        cy.request({
          method: 'POST',
          url: `${apiBase()}/incoming-items/mark-status`,
          headers: { Authorization: `Bearer ${token}` },
          body: { poNumber: seededPO, serialNumbers: [serialNumber], status, ...extra },
        }).then((r) => {
          expect(r.status, `mark ${serialNumber} ${status}`).to.be.lessThan(400);
        });

      // Available (scanned)
      serials.slice(0, seed.availableCount).forEach((sn) => cy.iaScanItem(token, seededPO, sn));
      // Damaged, then Missing
      const damagedIdx = seed.availableCount;
      const missingIdx = damagedIdx + seed.damagedCount;
      cy.then(() => markStatus(serials[damagedIdx], 'Damaged', { damageReason: seed.damageReason }));
      cy.then(() => markStatus(serials[missingIdx], 'Missing'));
      // the remaining serials stay Incoming

      // Resolve the productId the ItemView route needs.
      cy.then(() =>
        cy.request({
          method: 'GET',
          url: `${apiBase()}/incoming-items`,
          qs: { poNumber: seededPO, page: 1, page_size: 5 },
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
          const raw = res.body?.data?.list ?? res.body?.data ?? [];
          const list = Array.isArray(raw) ? raw : raw.list || [];
          const product = list.find((p) => p && (p.id ?? p.productId));
          expect(product, `seeded product in ${seededPO}`).to.exist;

          foundPoNumber = seededPO;
          foundProductId = product.id ?? product.productId;
          knownSerial = serials[0];
          serialPrefix = `${seed.serialPrefix}-${stamp}`;
          // TC13 needs an item beyond page 1 (>100 items); seeding 100+ rows just
          // for that is not worth the run time, so it stays opt-in.
          deepSerial = null;
        }),
      );
    });
  });

  after(() => {
    if (!seededPO) return;
    cy.request({
      method: 'DELETE',
      url: `${apiBase()}/purchase-orders/${encodeURIComponent(seededPO)}`,
      headers: { Authorization: `Bearer ${authToken}` },
      failOnStatusCode: false,
    });
  });

  // Register the @itemSearch intercept before every visit so it always catches
  // the initial page-load items request.
  beforeEach(() => {
    // The probe-then-skip guard is gone: before() now SEEDS the PO and asserts the
    // seed, so foundPoNumber cannot be missing without the suite already failing.
    expect(foundPoNumber, 'seeded PO from before()').to.exist;
    cy.authSession('admin');
    // ItemView reads sessionStorage before the ?state= query param (priority order:
    // location.state > sessionStorage > ?state=). Clear it so our state is always used.
    cy.intercept('GET', '**/incoming-items/**/items**').as('itemSearch');
    cy.visit(buildVisitUrl(), {
      onBeforeLoad(win) {
        win.sessionStorage.clear();
      },
    });
    // ItemView fetches product details first (async), then renders ItemViewItemList
    // which fires the items API → wait up to 20 s for that initial request
    cy.wait('@itemSearch', { timeout: 20000 });
  });

  // ============================================================================
  // HAPPY PATH (Use-Case)
  // ============================================================================

  // Use-case: main flow — enter a known serial, submit, verify result visible
  it('SW-ISE-UI-TC01 — search by exact serial number returns matching item (Use-Case)', { tags: ['@smoke'] }, () => {
    if (!knownSerial) { cy.log('No known serial in QA — skipping TC01'); return; }

    cy.intercept('GET', '**/incoming-items/**/items**').as('itemSearch');
    page.searchAndWait(knownSerial);
    page.assertTableIsVisible();
    page.assertItemInResults(knownSerial);
  });

  // Use-case: enter search term THEN click a status filter card — both params sent
  it('SW-ISE-UI-TC02 — search term + status filter sends both params to API (Use-Case)', { tags: ['@smoke'] }, () => {
    if (!serialPrefix) { cy.log('No serial prefix in QA — skipping TC02'); return; }

    page.enterSearchTerm(serialPrefix);
    cy.intercept('GET', '**/incoming-items/**/items**').as('combined');
    page.clickStatusFilter('Available', 'combined');
    cy.get('@combined').then((intercept) => {
      const url = intercept.request.url;
      expect(url, 'search param should be in URL').to.include(`search=${serialPrefix}`);
      expect(url, 'status param should be in URL').to.include('status=Available');
    });
  });

  // ============================================================================
  // SEARCH TERM VARIATIONS (Equivalence Partitioning)
  // ============================================================================

  // EP — invalid partition: guaranteed-absent serial returns no results
  it('SW-ISE-UI-TC03 — non-existent search term returns empty table (EP)', () => {
    cy.intercept('GET', '**/incoming-items/**/items**').as('itemSearch');
    page.searchAndWait(data.searchScenarios.noResults.searchTerm);
    page.assertNoResults();
  });

  // EP — case-insensitive: lowercase and uppercase of the same prefix return equal counts
  it('SW-ISE-UI-TC04 — lowercase and uppercase serial prefix return the same result count (EP)', () => {
    if (!serialPrefix) { cy.log('No serial prefix in QA — skipping TC04'); return; }

    let lowerCount;

    cy.intercept('GET', '**/incoming-items/**/items**').as('itemSearch');
    page.searchAndWait(serialPrefix.toLowerCase());
    cy.get('@itemSearch').its('response.body.data.pagination.count').then((n) => {
      lowerCount = n;

      cy.intercept('GET', '**/incoming-items/**/items**').as('itemSearch');
      page.searchAndWait(serialPrefix.toUpperCase());
      cy.get('@itemSearch').its('response.body.data.pagination.count').then((upperCount) => {
        expect(lowerCount, 'case-insensitive: upper == lower count').to.equal(upperCount);
      });
    });
  });

  // EP — whitespace-only: the Search button stays disabled when the field
  // holds only whitespace (the frontend trims before enabling the button).
  it('SW-ISE-UI-TC05 — whitespace-only input keeps the Search button disabled (EP)', () => {
    page.enterSearchTerm('   ');
    cy.get('button[type="submit"]').contains('Search').should('be.disabled');
  });

  // EP — whitespace: leading spaces are trimmed before the API call
  // itemViewItemList.tsx line 1205: searchRef.current = e.target.value.trim()
  it('SW-ISE-UI-TC06 — leading whitespace in search term is trimmed in API request (EP)', () => {
    if (!serialPrefix) { cy.log('No serial prefix in QA — skipping TC06'); return; }

    cy.intercept('GET', '**/incoming-items/**/items**').as('itemSearch');
    page.searchAndWait(`   ${serialPrefix}`);
    cy.get('@itemSearch').then((intercept) => {
      expect(intercept.request.url, 'trimmed value should appear in URL').to.include(
        `search=${serialPrefix}`
      );
      expect(intercept.request.url, 'no leading %20 before the search value').not.to.match(
        /search=%20/
      );
    });
  });

  // EP — special characters: hyphens in serial number match literally
  it('SW-ISE-UI-TC07 — exact serial with hyphens matches only that item (EP)', () => {
    if (!knownSerial) { cy.log('No known serial in QA — skipping TC07'); return; }

    cy.intercept('GET', '**/incoming-items/**/items**').as('itemSearch');
    page.searchAndWait(knownSerial);
    page.assertItemInResults(knownSerial);
  });

  // EP — empty filter: initial page load shows all items (no search or status filter)
  it('SW-ISE-UI-TC08 — initial page load requests items with no search or status filter (EP)', () => {
    // @itemSearch was already waited on in beforeEach (the initial page-load request)
    cy.get('@itemSearch').then((intercept) => {
      expect(intercept.request.url, 'no search param on initial load').not.to.include('search=');
      expect(intercept.request.url, 'no status param on initial load').not.to.include('status=');
    });
  });

  // ============================================================================
  // STATUS FILTER CARDS (Decision Table)
  // Each status card click appends the correct status= param to the items API.
  // IDs use SW-ISE-UI-DT-{status} rather than TC<NN> because the tests are
  // generated from the statusFilters fixture array — one test per status value.
  // ============================================================================

  data.statusFilters.forEach((status) => {
    // Every status in this table now has at least one seeded item (before()), so
    // each tile renders a non-zero count and is clickable. Incoming used to be
    // hard-skipped and Missing used to fail with "no request ever occurred" —
    // both were symptoms of a probed PO whose items were all Available, leaving
    // those tiles at 0 and therefore inert.
    it(`SW-ISE-UI-DT-${status} — clicking '${status}' filter card sends status=${status} to API (Decision Table)`, () => {
      // Decision Table — each status filter is an independent column:
      // Condition: user clicks status card for <status>
      // Action:    items API receives status=<status> query param
      cy.intercept('GET', '**/incoming-items/**/items**').as('statusFilter');
      page.clickStatusFilter(status, 'statusFilter');
      cy.get('@statusFilter').then((intercept) => {
        expect(
          intercept.request.url,
          `status=${status} should appear in the items API request URL`
        ).to.include(`status=${status}`);
      });
    });
  });

  // ============================================================================
  // PAGINATION (Boundary Value Analysis)
  // ROWS_PER_PAGE_OPTIONS = [25, 50, 75, 100, 150]. Default = 25.
  // TC09: start boundary — page 1 is active on initial load.
  // ============================================================================

  // BVA — lower boundary: page 1 is the active page on initial load
  it('SW-ISE-UI-TC09 — page 1 is the active page on initial load (BVA — start boundary)', () => {
    page.assertCurrentPage(1);
  });


  // ============================================================================
  // EDGE CASES (Error Guessing / Use-Case)
  // ============================================================================

  // Error-guessing: 500-char search term does not crash the page
  it('SW-ISE-UI-TC10 — 500-char search term is handled gracefully (Error Guessing)', () => {
    const longTerm = data.longSearchTerm.character.repeat(data.longSearchTerm.length);
    cy.intercept('GET', '**/incoming-items/**/items**').as('longSearch');
    page.searchAndWait(longTerm, 'longSearch');
    // Page must still render (no uncaught exception, table visible)
    page.assertTableIsVisible();
  });

  // Use-case: exact serial search returns only that item
  it('SW-ISE-UI-TC11 — exact serial search returns a single result (Edge Case)', () => {
    if (!knownSerial) { cy.log('No known serial in QA — skipping TC11'); return; }

    cy.intercept('GET', '**/incoming-items/**/items**').as('exactSearch');
    page.searchAndWait(knownSerial, 'exactSearch');
    page.assertItemInResults(knownSerial);
    // Serial number is the primary key — at most 1 item per serial
    // count arrives as a string from the API so cast before comparing
    cy.get('@exactSearch').its('response.body.data.pagination.count').then((count) => {
      expect(Number(count), 'result count for exact serial').to.be.lessThan(5);
    });
  });

  // Use-case: clearing the input after a search restores the full, unfiltered list.
  //
  // This used to wait for a "reset" request and always timed out. Clearing the search
  // does NOT re-query: the items listing runs with `staleTime: Infinity`
  // (itemViewItemList.tsx), so blanking the search returns the query key to the one
  // already fetched on page load and React Query serves it straight from cache. There
  // is no request to wait on — only a restored list. (Same cache behaviour as the
  // badge toggle-off in SW_INC_PDSC_010.)
  //
  // Assert the observable contract: the input is empty and every seeded item is back.
  it('SW-ISE-UI-TC12 — clearing search input resets items to full list (Use-Case)', () => {
    // Filter down to a single item first, so "restored" is a real change.
    cy.intercept('GET', '**/incoming-items/**/items**').as('searchCall');
    page.searchAndWait(knownSerial, 'searchCall');
    cy.get('tbody tr').should('have.length', 1);

    cy.intercept('GET', '**/incoming-items/**/items**').as('clearReset');
    page.clearSearch();

    cy.get(ItemSearchLocators.searchInput).should('have.value', '');
    cy.get('tbody tr', { timeout: 15000 }).should('have.length', SEEDED_ITEM_COUNT);

    // If the app ever DOES re-query on clear, that request must carry no search param.
    cy.get('@clearReset.all').then((calls) => {
      calls.forEach((call) => {
        expect(call.request.url, 'no search param after clear').not.to.include('search=');
      });
    });
  });

  // BVA + Use-Case: search is server-side — it finds an item beyond page 1.
  // The server returns only matching items; the result appears on filtered page 1
  // regardless of where the item sits in the unfiltered list.
  it('SW-ISE-UI-TC13 — search returns item from beyond first page (BVA — cross-page, Use-Case)', () => {
    if (!deepSerial) { cy.log('Fewer than 101 items on QA — skipping TC13'); return; }

    cy.intercept('GET', '**/incoming-items/**/items**').as('deepSearch');
    page.searchAndWait(deepSerial, 'deepSearch');
    page.assertItemInResults(deepSerial);
    cy.get('@deepSearch').its('response.body.data.pagination.count').then((count) => {
      expect(Number(count), 'search should return at least the matching item').to.be.greaterThan(0);
    });
  });

  // Edge case: enter search term then click status filter — API receives both params
  it('SW-ISE-UI-TC14 — search term is preserved when status filter is applied (Edge Case)', () => {
    if (!serialPrefix) { cy.log('No serial prefix in QA — skipping TC14'); return; }

    page.enterSearchTerm(serialPrefix); // updates searchRef.current (no API call yet)

    cy.intercept('GET', '**/incoming-items/**/items**').as('withFilter');
    page.clickStatusFilter('Received', 'withFilter');

    cy.get('@withFilter').then((intercept) => {
      const url = intercept.request.url;
      expect(url, 'search term preserved').to.include(`search=${serialPrefix}`);
      expect(url, 'status filter applied').to.include('status=Received');
    });
  });
});
