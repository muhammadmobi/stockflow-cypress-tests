// cypress/e2e/InventoryAudit/07-ClassificationByCategoryTests.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/sub/classification-plan.md
//            (§9.1 — TC01–TC13, TC29, TC30)
// Components: Frontend/src/components/ABC/{index,AbcSummaryCards,ByCategoryTab}.tsx
// API mirror: cypress/e2e/api/AbcClassificationAPI.cy.js (SW-IACLS-API-TC01..TC10)
//
// This spec owns the module shell, the summary cards and the By-Category grid.
// The resolution ladder's arithmetic, every Joi boundary and the not-clearable
// category rule belong to the API spec and are not duplicated here (SKILL §3).
//
// The card-rounding floor, the override-count cell and the load-failure path are
// stubbed: no live tenant can be made to hold a band at exactly <1%, a category
// with and without overrides side by side, and a failing request, all at once
// (plan §6.5). The one live mutation (TC10) captures the category's class and puts
// it back — a leaked class silently changes what every future audit counts.

import ClassificationPage from '../../pageObjects/InventoryAudit/classificationPage';
import {
  captureCategory,
  otherClass,
  restoreCategory,
  stubCategories,
  stubCategoriesFailure,
  stubCategoryClassRefused,
  stubSummary,
} from '../../support/InventoryAudit/classificationHelpers';
import data from '../../fixtures/InventoryAudit/classification.json';

describe('Inventory Audit — Classification: By Category', { tags: ['@regression'] }, () => {
  const page = new ClassificationPage();
  const cats = data.categoryRows;

  let adminJwt;
  // Set by TC10 the moment it captures the category, so the after() net below can
  // put the class back even when the test body aborts before its own restore.
  let capturedCategory;

  before(() => {
    cy.login().then((t) => {
      adminJwt = t;
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
  });

  // ==========================================================================
  // Module shell
  // ==========================================================================

  // EP — the entry point
  it('SW-IACLS-TC01: the classification screen loads with its cards and tabs', { tags: ['@smoke'] }, () => {
    page.visit().assertOnRoute();
    page.assertSummaryCardPerClass();
    page.assertTabsOffered(['By Category', 'By Product']);
  });

  // Error guessing — a deliberately unreachable tab must stay unreachable.
  // If this fails, the Automatic tab was re-enabled and needs its own coverage
  // (plan §3.2) — do not delete the assertion.
  it('SW-IACLS-TC02: the Automatic tab is not offered', () => {
    page.visit();
    page.assertTabAbsent('Automatic');
  });

  // EP — the card contents
  it('SW-IACLS-TC03: each class card reports its on-hand units and product count', () => {
    stubSummary(data.summary.epBalanced, 'abcSummary');
    page.visit();
    cy.wait('@abcSummary');
    data.summary.epBalanced.buckets.forEach((b) => {
      page.assertSummaryCardShows(b.abcClass, b.onHandQuantity.toLocaleString());
      page.assertSummaryCardShows(b.abcClass, String(b.productCount));
    });
  });

  // BVA — the rounding floor: a band holding stock must never read 0%
  it('SW-IACLS-TC04: a band holding a sliver of stock reads "<1%", never "0%"', () => {
    stubSummary(data.summary.bvaSliverBand, 'abcSummary');
    page.visit();
    cy.wait('@abcSummary');
    // Band B holds 10 of 20,000 units — 0.05%, which rounds to zero.
    page.readSummaryShare('B').should('eq', '<1%');
    page.readSummaryShare('A').should('match', /^\d+%$/);
  });

  // Use case — the buckets must reconcile with the total the cards divide by
  it('SW-IACLS-TC05: the class buckets reconcile with the reported total', () => {
    const fixture = data.summary.epBalanced;
    stubSummary(fixture, 'abcSummary');
    page.visit();
    cy.wait('@abcSummary');
    const sum = fixture.buckets.reduce((n, b) => n + b.onHandQuantity, 0);
    expect(sum, 'the fixture itself must reconcile, or the test proves nothing').to.eq(
      fixture.totalOnHandQuantity
    );
    // Each card's share is computed against that total, so the shares must add up.
    page.readSummaryShare('A').then((a) => {
      page.readSummaryShare('B').then((b) => {
        page.readSummaryShare('C').then((c) => {
          const total = [a, b, c].reduce((n, sh) => n + Number(String(sh).replace(/[^0-9]/g, '')), 0);
          expect(total, 'the three shares account for the whole total (±1 for rounding)').to.be.closeTo(
            100,
            1
          );
        });
      });
    });
  });

  // EP — the default tab
  it('SW-IACLS-TC06: By Category is the tab shown first', () => {
    page.visit();
    page.assertSelectedTab('By Category');
    page.assertCategoryHint();
  });

  // ==========================================================================
  // The category grid
  // ==========================================================================

  // EP — the column contract
  it('SW-IACLS-TC07: the category grid shows its four columns', { tags: ['@smoke'] }, () => {
    stubCategories([cats.dtNoOverrides, cats.dtSomeOverrides], 'abcCategories');
    page.visitAndWait();
    page.assertCategoryColumns();
  });

  // Decision table — the Overrides cell, both columns
  it('SW-IACLS-TC08: the Overrides cell distinguishes none from some', () => {
    stubCategories([cats.dtNoOverrides, cats.dtSomeOverrides], 'abcCategories');
    page.visitAndWait();
    page.assertOverridesCell(0, 'None');
    page.assertOverridesCell(1, String(cats.dtSomeOverrides.overriddenCount));
    page.assertOverridesTooltip(1, /will not follow this category/i);
  });

  // EP — decision #6: a category is never unclassified, so no empty option
  it('SW-IACLS-TC09: the category class control offers only the three classes', () => {
    stubCategories([cats.dtNoOverrides], 'abcCategories');
    page.visitAndWait();
    page.readCategoryClassOptions(0).then((options) => {
      expect(options, 'exactly A, B and C').to.have.length(3);
      expect(options.join('|')).to.match(/class a/i);
      expect(options.join('|')).to.match(/class b/i);
      expect(options.join('|')).to.match(/class c/i);
      expect(
        options.join('|'),
        'a category can never be left unclassified, so no inherit option'
      ).to.not.match(/inherit/i);
    });
  });

  // State transition — the live class round trip, captured and restored
  it('SW-IACLS-TC10: changing a category class saves it', { tags: ['@smoke'] }, function () {
    captureCategory(adminJwt).then((c) => {
      if (!c) this.skip(); // no categories on this tenant — see pending.md
      capturedCategory = c;
      const next = otherClass(c.originalClass);
      cy.intercept('PUT', `**/abc-classification/categories/${c.id}`).as('savedClass');
      page.visit();
      // Narrow to the captured category so the row index is unambiguous, then drive
      // the change through the page object rather than reaching into the DOM here.
      page.setCategoryClassByName(c.name, next);
      cy.wait('@savedClass').then(({ request, response }) => {
        expect(request.body.abcClass, 'the chosen class is sent').to.eq(next);
        expect(response.statusCode, 'the class change is accepted').to.eq(200);
      });
      page.assertToast(new RegExp(`category set to class ${next}`, 'i'));
    });
    // State restoration — mandatory: this class decides what future audits count.
    // Repeated in after() as a net: a failed cy.wait or toast assertion aborts the
    // chain here and this line would never run (SKILL §6 convention 5).
    cy.then(() => restoreCategory(adminJwt, capturedCategory));
  });

  // Error guessing — the no-op guard
  it('SW-IACLS-TC11: re-selecting a category current class sends nothing', () => {
    stubCategories([cats.dtSomeOverrides], 'abcCategories');
    cy.intercept('PUT', '**/abc-classification/categories/*', cy.spy().as('putSpy'));
    page.visitAndWait();
    // Re-select the class the row already has.
    page.setCategoryClass(0, cats.dtSomeOverrides.abcClass);
    cy.get('@putSpy').should('not.have.been.called');
  });

  // Error guessing — the load-failure path
  it('SW-IACLS-TC12: a failed category load is reported', () => {
    stubCategoriesFailure(data.errors.egCategoryLoadFailed, 'abcCategoriesFail');
    page.visit();
    cy.wait('@abcCategoriesFail');
    page.assertCategoryLoadError();
  });

  // EP — the footer contract, populated and empty
  it('SW-IACLS-TC13: the category footer reports the range and the total', () => {
    stubCategories([cats.dtNoOverrides, cats.dtSomeOverrides, cats.epThirdCategory], 'abcCategories');
    page.visitAndWait();
    page.assertCategoryFooter(/showing 1–3 of 3 categories/i);

    stubCategories([], 'abcCategoriesEmpty');
    page.visitAndWait('abcCategoriesEmpty');
    page.assertCategoryFooter(/^no categories$/i);
  });

  // ==========================================================================
  // RBAC and the server-error path
  // ==========================================================================

  // Decision table — the classification route is admin-only. The route is not
  // registered for a worker at all, so the router's catch-all renders the
  // not-found page WITHOUT redirecting — assert the page, not the URL.
  it('SW-IACLS-TC29: a worker cannot reach the classification screen', function () {
    cy.credentials('user').then(({ username, password }) => {
      if (!username || !password) this.skip(); // no `user` account declared
      // `cy.authSession(role)`, NOT `cy.login(...)` — `beforeEach` already put an
      // ADMIN session in the browser, and cy.login() returns a token without
      // swapping the session the app boots from, so the page still rendered as the
      // admin. Same fix as SW-IAUD-TC41/TC42 in 01-AuditsListTests.
      cy.authSession('user');
      cy.visit('/abc/classification', { failOnStatusCode: false });
      cy.contains(/sorry, page not found/i).should('be.visible');
      cy.findAllByRole('tab').should('not.exist');
    });
  });

  // Error guessing — the server's refusal must reach the user unaltered
  it('SW-IACLS-TC30: a refused class change reaches the user', () => {
    stubCategories([cats.dtSomeOverrides], 'abcCategories');
    stubCategoryClassRefused(data.errors.egClassChangeRefused, 'refused');
    page.visitAndWait();
    page.setCategoryClass(0, otherClass(cats.dtSomeOverrides.abcClass));
    cy.wait('@refused');
    page.assertToast(new RegExp(data.errors.egClassChangeRefused.slice(0, 30), 'i'));
    // The grid still shows what the server holds.
    page.assertCategoryClass(0, cats.dtSomeOverrides.abcClass);
  });

  // State restoration — the net for TC10's live write. TC10 restores in-body, but a
  // failed cy.wait/toast assertion aborts that chain, and a leaked ABC class changes
  // the effective class of every product in the category — which is exactly what
  // spec 08 reads. Re-reads first and writes only on drift, so an already-restored
  // run leaves no extra PUT (or audit-trail row) behind.
  after(() => {
    if (!capturedCategory) return;
    captureCategory(adminJwt).then((now) => {
      if (now && now.id === capturedCategory.id && now.originalClass === capturedCategory.originalClass) return;
      restoreCategory(adminJwt, capturedCategory);
    });
  });
});
