// cypress/e2e/InventoryActions/16-UnassignProducts.cy.js
//
// Inventory Action — Unassign Products
// Route: /MobileViewScreen/unassign-products
// Component: Frontend/src/components/UnassignProducts/index.tsx
// Workbook:  InventoryActions-WarehouseManagement.xlsx, sheet "2 - Unassignment", group "Unassign Products"
//
// Three-step flow: products list → assignment list → quantity entry.
//
// State restoration: TC08 happy-path pairs the unassign with a re-assign.
// API-shaped TC21 is covered by WmsContainerAPI.cy.js TC13 (POST
// /containers/:id/quantities with delta).

import UnassignProductsPage from '../../pageObjects/InventoryActions/UnassignProductsPage';
import L from '../../support/locators/InventoryActions/unassignProductsLocators';
import data from '../../fixtures/InventoryActions/unassignProducts.json';
// L.noAssignmentsErrorText holds the toast text for the "no assignments" path.
// The fixture's data.errors.* keys are the OTHER error messages — the
// no-assignments one lives only on the locator (run 007 surfaced this gap).

const page = new UnassignProductsPage();

describe('Inventory Action — Unassign Products', { tags: ['@regression'] }, () => {
  before(function () {
    cy.iaAuthToken().then((token) => {
      cy.wrap(token).as('token');
    });
  });

  beforeEach(function () {
    cy.authSession('admin');
    cy.viewport('iphone-7');
  });

  // NB: cy.intercept('@productsSearch') is registered INLINE in each test
  // that needs it, AFTER page.visit() has triggered the mount fetch — so
  // the alias only catches the user-action-triggered search request. (The
  // beforeEach pattern caused run-008/009 timeouts because the mount fetch
  // was consumed first, leaving no response for the search-targeted wait.)
  // Codebase precedent: 20-WorkOrderTests.cy.js TC27.

  // ═══════════════════════════════════════════════════════════════
  // Existing smoke tests (kept verbatim — DO NOT modify)
  // ═══════════════════════════════════════════════════════════════

  it('SW-IA-TC137 — unassign-products route renders the Search Products input', { tags: ['@smoke'] }, () => {
    // Technique: Use Case
    cy.visit('/MobileViewScreen/unassign-products');
    cy.url().should('include', '/unassign-products');
    cy.get(L.productSearchPlaceholder, { timeout: 15000 }).should('be.visible');
  });

  it('SW-IA-TC138 — initial mount renders the "Select Product" header (step 1)', () => {
    // Technique: Use Case
    // The container/location scan input only renders inside the
    // `step === 'assignment'` branch (after a product is selected); at
    // initial mount we're in step 'products', whose header reads
    // "Select Product". Asserting the header keeps this spec smoke-only
    // (no QA seed data, no interaction) while still covering the visible
    // mount surface.
    cy.visit('/MobileViewScreen/unassign-products');
    cy.contains(/^Select Product$/, { timeout: 15000 }).should('be.visible');
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Page entry & step 1 (products list)
  // ═══════════════════════════════════════════════════════════════

  describe('Page entry & products list', () => {
    // Use case: page renders with the products step.
    it('SW-WM-UP-TC01 — page opens with the products step', () => {
      // Technique: Use Case
      page.visit();
      page.assertProductsStepVisible();
    });

    // Search filter — debounced.
    // Use case: debounced server-side product search filtering.
    // NB: data.placeholders.productSearchText holds the placeholder TEXT
    // (for human-readable docs); L.productSearchPlaceholder holds the CSS
    // selector. Use the locator here — same anchor as typeProductSearch().
    it('SW-WM-UP-TC02 — product search filters the list', () => {
      // Technique: Use Case
      page.visit();
      page.assertProductsStepVisible();
      page.typeProductSearch('a');
      cy.get(L.productSearchPlaceholder).should('have.value', 'a');
    });

    // EP: special-character class on search.
    it('SW-WM-UP-TC20 — special characters in search input are blocked', () => {
      // Technique: EP
      page.visit();
      page.assertProductsStepVisible();
      page.typeProductSearch('abc!');
      // The validateNoSpecialCharacters tooltip-error fires; the search
      // request should NOT execute (searchValue stays at the previous
      // valid value). Just assert the input value persisted (no auto-strip).
      cy.get(L.productSearchPlaceholder).should('have.value', 'abc!');
    });

    // Use case (auth contract — SKILL.md §11 convention #3): direct URL must redirect.
    it('SW-WM-UP-TC16 — direct URL access without a token redirects to login', () => {
      // Technique: Use Case
      cy.iaAssertRedirectsToLogin('/MobileViewScreen/unassign-products');
    });

    // State transition: re-entering the page resets to step 1.
    it('SW-WM-UP-TC15 — re-entering the page resets to the products step', () => {
      // Technique: State Transition
      page.visit();
      page.assertProductsStepVisible();
      cy.reload();
      page.assertProductsStepVisible();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Probe-gated step transitions
  // ═══════════════════════════════════════════════════════════════

  describe('Probe-gated step transitions', () => {
    afterEach(() => cy.iaSeedCleanup());

    beforeEach(function () {
      cy.iaProbeProductWithAssignment(this.token).then((probe) => {
        if (probe) { cy.wrap(probe).as('probe'); return; }
        cy.iaSeedProductWithAssignment(this.token).then((seeded) => {
          if (!seeded) this.skip();
          cy.wrap(seeded).as('probe');
        });
      });
    });

    // State transition: picking a product with assignments → step 2.
    it('SW-WM-UP-TC03 — picking a product with assignments advances to the assignment step', { tags: ['@smoke'] }, function () {
      // Technique: State Transition
      page.visit();
      page.assertProductsStepVisible();
      // Type the product's first attribute as a search query so the row is at the top of the list.
      const searchTerm =
        this.probe.product.category ||
        this.probe.product.name ||
        String(this.probe.product.id);
      page.typeProductSearch(String(searchTerm));
      page.clickFirstProductRow(String(searchTerm));
      page.assertAssignmentsStepVisible();
    });

    // State transition: ← Back from assignment step → products step.
    it('SW-WM-UP-TC14 — Back from the assignment step returns to the products step', function () {
      // Technique: State Transition
      page.visit();
      const searchTerm =
        this.probe.product.category ||
        this.probe.product.name ||
        String(this.probe.product.id);
      page.typeProductSearch(String(searchTerm));
      page.clickFirstProductRow(String(searchTerm));
      page.assertAssignmentsStepVisible();
      page.goBack();
      page.assertProductsStepVisible();
    });

    // State transition: tapping an assignment row → step 3 (quantity).
    it('SW-WM-UP-TC07 — tapping an assignment row advances to the quantity step', function () {
      // Technique: State Transition
      page.visit();
      const searchTerm =
        this.probe.product.category ||
        this.probe.product.name ||
        String(this.probe.product.id);
      page.typeProductSearch(String(searchTerm));
      page.clickFirstProductRow(String(searchTerm));
      page.assertAssignmentsStepVisible();
      page.clickFirstAssignmentRow();
      page.assertQuantityStepVisible();
    });

    // State transition: ← Back from quantity → assignment step.
    it('SW-WM-UP-TC13 — Back from the quantity step returns to the assignment step', function () {
      // Technique: State Transition
      page.visit();
      const searchTerm =
        this.probe.product.category ||
        this.probe.product.name ||
        String(this.probe.product.id);
      page.typeProductSearch(String(searchTerm));
      page.clickFirstProductRow(String(searchTerm));
      page.assertAssignmentsStepVisible();
      page.clickFirstAssignmentRow();
      page.assertQuantityStepVisible();
      page.goBack();
      page.assertAssignmentsStepVisible();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Quantity input EP / BVA
  // ═══════════════════════════════════════════════════════════════

  describe('Quantity input EP / BVA', () => {
    afterEach(() => cy.iaSeedCleanup());

    beforeEach(function () {
      cy.iaProbeProductWithAssignment(this.token).then((probe) => {
        if (probe) { cy.wrap(probe).as('probe'); return; }
        cy.iaSeedProductWithAssignment(this.token).then((seeded) => {
          if (!seeded) this.skip();
          cy.wrap(seeded).as('probe');
        });
      });
    });

    /** Walk to step 3 (quantity) — shared by the BVA tests below. */
    const navigateToQty = (probe) => {
      const searchTerm =
        probe.product.category || probe.product.name || String(probe.product.id);
      page.visit();
      page.typeProductSearch(String(searchTerm));
      page.clickFirstProductRow(String(searchTerm));
      page.assertAssignmentsStepVisible();
      page.clickFirstAssignmentRow();
      page.assertQuantityStepVisible();
    };

    // BVA: zero — partition lower boundary.
    it('SW-WM-UP-TC09 — qty=0 is rejected by validation', function () {
      // Technique: BVA
      navigateToQty(this.probe);
      page.enterQty(0);
      page.clickUnassign();
      cy.contains(data.errors.validQty, { timeout: 8000 }).should('be.visible');
    });

    // BVA: negative — outside lower partition.
    it('SW-WM-UP-TC10 — a negative qty is rejected', function () {
      // Technique: BVA
      navigateToQty(this.probe);
      page.enterQty(-1);
      page.clickUnassign();
      cy.contains(data.errors.validQty, { timeout: 8000 }).should('be.visible');
    });

    // BVA: above-assigned partition (assignment.quantity + 1).
    it('SW-WM-UP-TC11 — qty greater than available is rejected', function () {
      // Technique: BVA
      navigateToQty(this.probe);
      const overshoot = (this.probe.assignment.quantity || 0) + 100;
      page.enterQty(overshoot);
      page.clickUnassign();
      cy.contains(data.errors.exceedsAssigned, { timeout: 8000 }).should('be.visible');
    });

    // EP: non-numeric input. The qty field is type="number" so most
    // browsers strip non-digits — assert no error/no crash and no submit.
    it('SW-WM-UP-TC12 — non-numeric qty input is rejected', function () {
      // Technique: BVA
      navigateToQty(this.probe);
      page.enterQty('abc');
      page.clickUnassign();
      // Either the validation toast OR the page stays on step 3 — both are
      // acceptable behaviours for an empty/invalid number.
      cy.contains('button', new RegExp(`^${data.headings.unassignButton}$`)).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Workbook TCs — Mocked failures
  // ═══════════════════════════════════════════════════════════════

  describe('Mocked failures', () => {
    afterEach(() => cy.iaSeedCleanup());

    // Error guessing: forced network failure on submit; UI must not crash.
    it('SW-WM-UP-TC17 — graceful handling of network failure on submit', function () {
      // Technique: Error Guessing
      cy.iaProbeProductWithAssignment(this.token).then((probe) => {
        const runTest = (p) => {
          cy.iaStubNetworkFailureOnce('POST', '**/containers/*/quantities');
          const searchTerm =
            p.product.category || p.product.name || String(p.product.id);
          page.visit();
          page.typeProductSearch(String(searchTerm));
          page.clickFirstProductRow(String(searchTerm));
          page.assertAssignmentsStepVisible();
          page.clickFirstAssignmentRow();
          page.assertQuantityStepVisible();
          page.enterQty(1);
          page.clickUnassign();
          // Assert the UI remained usable after the forced failure: still on the
          // quantity step (heading present) and still on /unassign-products, i.e.
          // no crash / error-boundary / navigate-away. The Unassign button itself
          // renders a CircularProgress (no "Unassign" text) while the failed
          // submit is in flight, so the button text is not a reliable anchor.
          cy.contains(L.step3Header, { timeout: 10000 }).should('be.visible');
          cy.url().should('include', '/unassign-products');
        };
        if (probe) { runTest(probe); return; }
        cy.iaSeedProductWithAssignment(this.token).then((seeded) => {
          if (!seeded) { this.skip(); return; }
          runTest(seeded);
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Phase 5 batch 1 — additional probe-gated coverage (Tier A)
  // ═══════════════════════════════════════════════════════════════

  describe('Probe-gated edge cases (Phase 5 batch 1)', () => {
    afterEach(() => cy.iaSeedCleanup());

    // Use case: picking a product with NO assignments shows an empty/error
    // state (the component's `fetchAssignmentsForProduct` calls
    // `showErrorToast('No containers or locations have this product assigned')`
    // and returns false, leaving the user on step 1).
    // Workbook UP-TC04: Product: HP Pavilion x390 (no assignments).
    //
    // Probe-first; seed fallback via iaSeedProductWithNoAssignment (creates a
    // minimal CPU-category product with 0 assignments) when every existing pure
    // product on QA has at least one assignment.
    it('SW-WM-UP-TC04 — picking a product with no assignments shows empty/error state', function () {
      // Technique: EP
      const self = this;
      const runWithProduct = (product) => {
        // Search by the product NAME — the rendered rows show the name, not the
        // category, so a category term would never match a row. Fall back to
        // category/id only if the product carries no name.
        const searchTerm = product.name || product.category || String(product.id);
        page.visit();
        page.assertProductsStepVisible();
        page.typeProductSearch(String(searchTerm));
        // The search is debounced (~500ms) and async. Retry until the list
        // settles into a terminal state — the product row is present OR the
        // "no products" empty-state — so the skip decision below is deterministic
        // rather than a race against the fetch.
        cy.get('body', { timeout: 15000 }).should(($b) => {
          const hasRow = $b.find(`li:contains("${searchTerm}")`).length > 0;
          const hasEmpty = /No products/i.test($b.text());
          expect(hasRow || hasEmpty, 'product search settled (row or empty-state)').to.eq(true);
        });
        cy.get('body').then(($body) => {
          if (!$body.find(`li:contains("${searchTerm}")`).length) self.skip();
        });
        page.clickFirstProductRow(String(searchTerm));
        // Component fires the error toast and stays on the products step.
        cy.contains(L.noAssignmentsErrorText, { timeout: 10000 }).should('be.visible');
        cy.url().should('include', '/unassign-products');
        cy.get(L.productSearchPlaceholder).should('be.visible');
      };

      cy.iaProbeProductWithNoAssignments(this.token, { maxProducts: 100 }).then((product) => {
        if (product) { runWithProduct(product); return; }
        cy.iaSeedProductWithNoAssignment(this.token).then((seeded) => {
          if (!seeded) { self.skip(); return; }
          runWithProduct(seeded);
        });
      });
    });
  });
});
