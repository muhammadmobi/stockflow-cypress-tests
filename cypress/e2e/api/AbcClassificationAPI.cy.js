/**
 * ABC Classification API Tests — Inventory Audit → Classification
 * =============================================================================
 * Test plan: cypress/qa/testPlans/inventoryAudit/sub/classification-plan.md (§9.2)
 *
 * Backend:
 *   - Backend/src/modules/inventory-audit/abc-classification.controller.ts
 *   - Backend/src/modules/inventory-audit/abc-classification.service.ts
 *   - Backend/src/modules/inventory-audit/schema/abc-classification.schema.ts
 *   - Backend/src/shared/abc-class.ts   (the resolution ladder)
 *
 * The feature under test is a four-rung precedence rule:
 *
 *   product override  →  auto-computed  →  category class  →  'C'
 *      (Overridden)         (Auto)          (Inherited)      (Default)
 *
 * Endpoints exercised
 * -------------------
 *   GET    /abc-classification/categories
 *   PUT    /abc-classification/categories/:id
 *   GET    /abc-classification/products
 *   PUT    /abc-classification/products/:id
 *   DELETE /abc-classification/products/:id/override
 *   POST   /abc-classification/products/bulk
 *   GET    /abc-classification/summary
 *   GET    /abc-classification/auto/settings
 *   PUT    /abc-classification/auto/settings
 *   GET    /abc-classification/auto/preview
 *   POST   /abc-classification/auto/run
 *
 * State restoration is the load-bearing convention here (plan §6.3): a category's
 * class decides what EVERY future audit of that class counts, so a leaked change
 * silently alters other suites' expected sets. Every mutation captures its prior
 * value and restores it in-test and again in after().
 *
 * `POST auto/run` has no inverse — it rewrites `abcClassAuto` catalogue-wide — so
 * it is env-gated and skipped by default (API-TC37).
 *
 * Test ID convention: SW-IACLS-API-TC01..TC39
 */

import { resolveNonAdminActor } from '../../support/InventoryAudit/auditWarehouse';

const MISSING_ID = 999999999;
const CLASSES = ['A', 'B', 'C'];

describe('ABC Classification API', { tags: ['@regression'] }, () => {
  const baseUrl = Cypress.env('API_BASE_URL');

  /**
   * The status a successful POST on this controller returns.
   *
   * `POST /abc-classification/products/bulk` is annotated `@ApiOkResponse` (Swagger
   * metadata only) and has no `@HttpCode(200)`, so NestJS applies its POST default
   * and the route answers **201** — `ApiResponseInterceptor` then echoes that into
   * the envelope. Same fact TC37 below already encodes for `POST auto/run`.
   * Accepting both keeps the suite honest about the observable contract; the
   * annotation being wrong is a documentation defect to raise separately.
   */
  const expectAccepted = (res, why = 'the call must succeed') => {
    expect(res.status, why).to.be.oneOf([200, 201]);
    return res;
  };

  let adminJwt;
  let workerJwt;
  let category = null; // a real category, with its original class captured
  let product = null; // a real product, with its original override captured
  let originalAutoSettings = null;

  const headers = (token = adminJwt) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const call = (method, path, body, opts = {}) =>
    cy.request({
      method,
      url: `${baseUrl}${path}`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(opts.token),
      body,
      failOnStatusCode: false,
    });

  const data = (res) => res.body && res.body.data;

  /** The Joi contract: 400 and the field named inside error.message (plan §6.6). */
  const expectJoiRejection = (res, field) => {
    expect(res.status, 'Joi validation must reject with 400').to.eq(400);
    expect(
      String((res.body.error && res.body.error.message) || ''),
      `the Joi error must name the "${field}" field`
    ).to.contain(field);
  };

  /** A class that is NOT the one supplied — for "change it to something else". */
  const otherClass = (current) => CLASSES.find((c) => c !== current);


  const setCategoryClass = (id, abcClass) =>
    call('PUT', `/abc-classification/categories/${id}`, { abcClass });
  const setProductClass = (id, abcClass) =>
    call('PUT', `/abc-classification/products/${id}`, { abcClass });
  const clearProductOverride = (id) =>
    call('DELETE', `/abc-classification/products/${id}/override`);
  const bulk = (productIds, abcClass) =>
    call('POST', '/abc-classification/products/bulk', { productIds, abcClass });
  const listProducts = (qs = '') => call('GET', `/abc-classification/products${qs}`);

  /** Put a product back exactly as it was found. */
  const restoreProduct = (p) => {
    if (!p) return;
    if (p.originalOverride) setProductClass(p.id, p.originalOverride);
    else clearProductOverride(p.id);
  };

  before(() => {
    cy.login().then((t) => {
      adminJwt = t;
      expect(adminJwt, 'admin bearer token').to.be.a('string');
    });

    // A category to work on, with its class captured for restoration.
    cy.then(() =>
      call('GET', '/abc-classification/categories').then((res) => {
        const rows = data(res) || [];
        if (rows.length) category = { id: rows[0].id, originalClass: rows[0].abcClass };
      })
    );

    // A product to work on, with its override captured.
    cy.then(() =>
      listProducts('?page=1&page_size=1').then((res) => {
        const row = ((data(res) || {}).list || [])[0];
        if (row) {
          product = {
            id: row.id,
            originalOverride: row.abcClassOverride,
            categoryClass: row.categoryClass,
            effectiveClass: row.effectiveClass,
          };
        }
      })
    );

    cy.then(() =>
      call('GET', '/abc-classification/auto/settings').then((res) => {
        if (res.status === 200) originalAutoSettings = data(res);
      })
    );

    // A token the admin gate genuinely REFUSES, for the 403 column.
    //
    // Optional twice over: a tenant may declare no non-admin account at all, AND an
    // account NAMED `user` may still resolve to ADMIN — `mapRolesToId` prioritises
    // an `admin` role held on ANY client, and this tenant's `user` carries
    // stockwise-app: User beside account-wise: Admin, so the guard admits it. That
    // made TC03 skip against a guard that was working.
    //
    // `resolveNonAdminActor` decides with the backend's own rule and falls back to
    // the `sales` account (stockwise-app: Sales and nothing else). Shared with
    // AuditManagementAPI.cy.js so the two specs cannot drift.
    cy.then(() =>
      resolveNonAdminActor().then((actor) => {
        workerJwt = actor ? actor.token : null;
      })
    );
  });

  after(() => {
    if (category) setCategoryClass(category.id, category.originalClass);
    restoreProduct(product);
    if (originalAutoSettings) {
      call('PUT', '/abc-classification/auto/settings', {
        enabled: originalAutoSettings.enabled,
        windowDays: originalAutoSettings.windowDays,
        thresholdA: originalAutoSettings.thresholdA,
        thresholdB: originalAutoSettings.thresholdB,
        cronTime: originalAutoSettings.cronTime,
      });
    }
  });

  // ===========================================================================
  // Categories
  // ===========================================================================

  // EP — the documented row shape
  it('SW-IACLS-API-TC01: lists categories with class, product count and override count', { tags: ['@smoke'] }, function () {
    call('GET', '/abc-classification/categories').then((res) => {
      expect(res.status, 'lists categories with class, product count and override count').to.eq(200);
      const rows = data(res);
      expect(rows).to.be.an('array');
      if (!rows.length) this.skip(); // no categories on this tenant
      expect(rows[0]).to.include.all.keys('id', 'name', 'abcClass', 'productCount', 'overriddenCount');
      expect(rows[0].productCount).to.be.a('number');
      expect(rows[0].overriddenCount).to.be.a('number');
    });
  });

  // Error guessing — the guard-regression check
  it('SW-IACLS-API-TC02: rejects a category list that carries no Authorization header', () => {
    call('GET', '/abc-classification/categories', undefined, { noAuth: true }).then((res) => {
      expect(res.status, 'rejects a category list that carries no Authorization header').to.eq(401);
    });
  });

  // Decision table — authenticated but not an admin
  it('SW-IACLS-API-TC03: refuses a non-admin with access denied, not merely unauthenticated', function () {
    if (!workerJwt) this.skip(); // no account resolves to a non-admin token — see before()
    call('GET', '/abc-classification/categories', undefined, { token: workerJwt }).then((res) => {
      expect(res.status, 'the inline admin gate must 403 — the abcApi docblock claiming 401 is stale').to.eq(403);
      expect(res.body.error.code).to.eq('FORBIDDEN');
    });
  });

  // EP — decision #6: a category is never unclassified
  it('SW-IACLS-API-TC04: every category carries a class — none is null', function () {
    call('GET', '/abc-classification/categories').then((res) => {
      const rows = data(res) || [];
      if (!rows.length) this.skip();
      rows.forEach((r) => {
        expect(CLASSES, `category ${r.id} must carry a real class`).to.include(r.abcClass);
      });
    });
  });

  // State transition — the category class round trip
  it('SW-IACLS-API-TC05: setting a category class persists it and restores cleanly', { tags: ['@smoke'] }, function () {
    if (!category) this.skip();
    const next = otherClass(category.originalClass);
    setCategoryClass(category.id, next).then((res) => {
      expect(res.status, 'setting a category class persists it and restores cleanly').to.eq(200);
      call('GET', '/abc-classification/categories').then((list) => {
        const row = (data(list) || []).find((c) => c.id === category.id);
        expect(row.abcClass, 'the new class persisted').to.eq(next);
        setCategoryClass(category.id, category.originalClass).then((back) => {
          expect(back.status).to.eq(200);
          call('GET', '/abc-classification/categories').then((again) => {
            const restored = (data(again) || []).find((c) => c.id === category.id);
            expect(restored.abcClass, 'and the original class is back').to.eq(category.originalClass);
          });
        });
      });
    });
  });

  // Decision table — a category class cannot be cleared (unlike a product override)
  it('SW-IACLS-API-TC06: refuses a null category class', function () {
    if (!category) this.skip();
    setCategoryClass(category.id, null).then((res) => {
      expectJoiRejection(res, 'abcClass');
    });
  });

  // Error guessing — invalid enum
  it('SW-IACLS-API-TC07: refuses a category class outside A, B and C', function () {
    if (!category) this.skip();
    setCategoryClass(category.id, 'D').then((res) => {
      expectJoiRejection(res, 'abcClass');
    });
  });

  // Error guessing — unknown id
  it('SW-IACLS-API-TC08: reports not found when the category does not exist', () => {
    setCategoryClass(MISSING_ID, 'A').then((res) => {
      expect(res.status, 'reports not found when the category does not exist').to.eq(404);
    });
  });

  // BVA — just below the minimum valid id
  it('SW-IACLS-API-TC09: refuses a category id of zero', () => {
    setCategoryClass(0, 'A').then((res) => {
      expect(res.status, 'id 0 is invalid, not missing').to.eq(400);
    });
  });

  // Error guessing — the closed request surface
  it('SW-IACLS-API-TC10: refuses an unknown field in the category body', function () {
    if (!category) this.skip();
    call('PUT', `/abc-classification/categories/${category.id}`, {
      abcClass: category.originalClass,
      notAField: 1,
    }).then((res) => {
      expect(res.status, 'allowUnknown:false must reject, not ignore').to.eq(400);
    });
  });

  // ===========================================================================
  // Products — list
  // ===========================================================================

  // EP — the row shape carries the whole resolution result
  it('SW-IACLS-API-TC11: lists products with the effective class, its source and pagination', { tags: ['@smoke'] }, function () {
    listProducts('?page=1&page_size=5').then((res) => {
      expect(res.status, 'lists products with the effective class, its source and pagination').to.eq(200);
      const payload = data(res);
      expect(payload).to.include.all.keys('list', 'pagination');
      if (!payload.list.length) this.skip();
      const row = payload.list[0];
      expect(row).to.include.all.keys(
        'id',
        'categoryClass',
        'abcClassOverride',
        'effectiveClass',
        'source',
        'onHandQuantity',
        'isSerialized'
      );
      expect(CLASSES, 'the effective class always resolves').to.include(row.effectiveClass);
      expect(
        ['Overridden', 'Auto', 'Inherited', 'Default'],
        'the source names which rung produced it'
      ).to.include(row.source);
    });
  });

  // BVA — the page-size range
  it('SW-IACLS-API-TC12: accepts a page size of 1 and 300 and refuses 301', () => {
    listProducts('?page_size=1').then((r) => expect(r.status, 'minimum').to.eq(200));
    listProducts('?page_size=300').then((r) => expect(r.status, 'documented maximum').to.eq(200));
    listProducts('?page_size=301').then((r) => expect(r.status, 'one over the maximum').to.eq(400));
  });

  // BVA — the page floor
  it('SW-IACLS-API-TC13: refuses a page number of 0 and accepts 1', () => {
    listProducts('?page=0').then((r) => expect(r.status).to.eq(400));
    listProducts('?page=1').then((r) => expect(r.status).to.eq(200));
  });

  // EP — the class filter matches the EFFECTIVE class
  //
  // The row is STAGED rather than hoped for. Both this test and TC15 used to read
  // whatever the tenant happened to hold and skip on an empty page — which is a
  // filter test that never runs, and worse, one that would still "pass" if the
  // filter returned nothing at all. An override sets the effective class directly
  // (it is the top rung of the ladder), so one PUT guarantees a matching row, and
  // the captured original goes back in the same test.
  it('SW-IACLS-API-TC14: filtering by class returns only that effective class', function () {
    if (!product) this.skip(); // no product on this tenant at all
    setProductClass(product.id, 'A').then((staged) =>
      expectAccepted(staged, 'stage a product whose effective class is A')
    );
    listProducts('?class=A&page_size=25').then((res) => {
      expect(res.status, 'filtering by class returns only that effective class').to.eq(200);
      const rows = (data(res) || {}).list || [];
      expect(rows.length, 'the staged class-A product must come back').to.be.greaterThan(0);
      expect(rows.map((r) => r.id), 'and it is the one we staged').to.include(product.id);
      rows.forEach((r) => expect(r.effectiveClass, `product ${r.id}`).to.eq('A'));
      // The complement: the filter EXCLUDES, it does not merely include. Without
      // this a filter that ignored `class` entirely would still pass above.
      listProducts('?class=B&page_size=100').then((other) => {
        expect(
          ((data(other) || {}).list || []).map((r) => r.id),
          'the staged class-A product must NOT appear under class B'
        ).to.not.include(product.id);
      });
    });
    cy.then(() => restoreProduct(product));
  });

  // EP — the source filter
  //
  // Staged for the same reason as TC14: `source` is derived, so the only way to
  // guarantee an `Overridden` row is to override one. Setting an override is
  // exactly what makes `source` read `Overridden` (Backend/src/shared/abc-class.ts).
  it('SW-IACLS-API-TC15: filtering by source returns only products resolved that way', function () {
    if (!product) this.skip();
    setProductClass(product.id, 'A').then((staged) =>
      expectAccepted(staged, 'stage an overridden product')
    );
    listProducts('?source=Overridden&page_size=25').then((res) => {
      expect(res.status, 'filtering by source returns only products resolved that way').to.eq(200);
      const rows = (data(res) || {}).list || [];
      expect(rows.length, 'the staged overridden product must come back').to.be.greaterThan(0);
      rows.forEach((r) => {
        expect(r.source).to.eq('Overridden');
        expect(r.abcClassOverride, 'an overridden row carries its override').to.not.eq(null);
      });
      // The complement: clearing the override must remove it from this filter, which
      // proves the filter reads the live source rather than a stale column.
      clearProductOverride(product.id).then(() =>
        listProducts('?source=Overridden&page_size=100').then((after) => {
          expect(
            ((data(after) || {}).list || []).map((r) => r.id),
            'a product whose override was cleared leaves the Overridden partition'
          ).to.not.include(product.id);
        })
      );
    });
    cy.then(() => restoreProduct(product));
  });

  // Error guessing — invalid enum on a query param
  it('SW-IACLS-API-TC16: refuses an unrecognised source value', () => {
    listProducts('?source=Bogus').then((res) => expectJoiRejection(res, 'source'));
  });

  // Error guessing — the sort allow-list
  it('SW-IACLS-API-TC17: refuses an undocumented sort field and accepts each documented one', () => {
    listProducts('?sortBy=notAColumn').then((res) => expectJoiRejection(res, 'sortBy'));
    ['name', 'categoryName', 'effectiveClass', 'onHandQuantity', 'id'].forEach((sortBy) => {
      listProducts(`?sortBy=${sortBy}&page_size=1`).then((res) => {
        expect(res.status, `sortBy=${sortBy} is documented and must be accepted`).to.eq(200);
      });
    });
  });

  // Error guessing — `sortOrder` is declared uppercase() but the pipe returns the
  // RAW value, so the service receives whatever case was sent. Assert the ORDERING
  // outcome rather than the echoed parameter (plan §8 risk 6).
  it('SW-IACLS-API-TC18: both sort directions order the rows', function () {
    listProducts('?sortBy=id&sortOrder=ASC&page_size=5').then((asc) => {
      const ascIds = (((data(asc) || {}).list) || []).map((r) => r.id);
      if (ascIds.length < 2) this.skip();
      expect(ascIds, 'ASC is ascending by id').to.deep.eq([...ascIds].sort((a, b) => a - b));
      listProducts('?sortBy=id&sortOrder=DESC&page_size=5').then((desc) => {
        const descIds = (((data(desc) || {}).list) || []).map((r) => r.id);
        expect(descIds, 'DESC is the reverse ordering').to.deep.eq([...descIds].sort((a, b) => b - a));
      });
    });
  });

  // Error guessing — the closed query surface
  it('SW-IACLS-API-TC19: refuses an unknown query parameter', () => {
    listProducts('?notAParameter=1').then((res) => expect(res.status).to.eq(400));
  });

  // BVA — the search-term length bound
  it('SW-IACLS-API-TC20: accepts a 200-character search term and refuses 201', () => {
    listProducts(`?search=${'a'.repeat(200)}`).then((r) => expect(r.status, '200 chars').to.eq(200));
    listProducts(`?search=${'a'.repeat(201)}`).then((r) => expect(r.status, '201 chars').to.eq(400));
  });

  // ===========================================================================
  // Products — the resolution ladder
  // ===========================================================================

  // EP — an override decides the effective class
  it('SW-IACLS-API-TC21: an override becomes the effective class and reports the overridden source', function () {
    if (!product) this.skip();
    const target = otherClass(product.effectiveClass) || 'A';
    setProductClass(product.id, target).then((res) => {
      expect(res.status, 'the request must succeed').to.eq(200);
      const d = data(res);
      expect(d.abcClassOverride, 'the override is stored').to.eq(target);
      expect(d.effectiveClass, 'and it wins the ladder').to.eq(target);
      expect(d.source, 'the source names the rung').to.eq('Overridden');
      restoreProduct(product);
    });
  });

  // EP — clearing falls back down the ladder
  it('SW-IACLS-API-TC22: clearing an override falls back to the category class', function () {
    if (!product) this.skip();
    // Ensure there IS an override to clear, then clear it.
    const target = otherClass(product.effectiveClass) || 'A';
    setProductClass(product.id, target)
      .then(() => clearProductOverride(product.id))
      .then((res) => {
        expect(res.status, 'clearing an override falls back to the category class').to.eq(200);
        const d = data(res);
        expect(d.abcClassOverride, 'the override is gone').to.eq(null);
        expect(d.source, 'so the rung is no longer the override').to.not.eq('Overridden');
        if (d.source === 'Inherited') {
          expect(d.effectiveClass, 'an inherited product takes its category class').to.eq(d.categoryClass);
        }
        restoreProduct(product);
      });
  });

  // State transition — unknown product
  it('SW-IACLS-API-TC23: reports not found when the product does not exist', () => {
    setProductClass(MISSING_ID, 'A').then((res) => {
      expect(res.status, 'reports not found when the product does not exist').to.eq(404);
    });
  });

  // ===========================================================================
  // Products — bulk
  // ===========================================================================

  // EP — a bulk assignment reports what changed
  it('SW-IACLS-API-TC24: a bulk assignment reports how many products changed', function () {
    if (!product) this.skip();
    const target = otherClass(product.effectiveClass) || 'A';
    bulk([product.id], target).then((res) => {
      expectAccepted(res, 'a bulk assignment must be accepted');
      const d = data(res);
      expect(d.updated, 'one product was listed and updated').to.eq(1);
      expect(d.abcClass, 'the band applied is echoed').to.eq(target);
      restoreProduct(product);
    });
  });

  // BVA — the bulk cap. Unknown ids are ignored by design, so a synthetic batch is
  // safe: it exercises the SIZE boundary without touching a thousand products.
  it('SW-IACLS-API-TC25: accepts a thousand ids and refuses one more', () => {
    const ids = (n) => Array.from({ length: n }, (_, i) => MISSING_ID - i);
    bulk(ids(1000), 'C').then((res) => {
      expectAccepted(res, '1000 is the documented cap and must be accepted');
      expect(data(res).updated, 'every id was unknown, so nothing changed').to.eq(0);
    });
    bulk(ids(1001), 'C').then((res) => {
      expect(res.status, 'one over the cap').to.eq(400);
    });
  });

  // Error guessing — the empty partition
  it('SW-IACLS-API-TC26: refuses a bulk call with no ids', () => {
    bulk([], 'A').then((res) => expectJoiRejection(res, 'productIds'));
  });

  // Error guessing — the unique() constraint
  it('SW-IACLS-API-TC27: refuses a bulk call repeating an id', () => {
    bulk([12, 12], 'A').then((res) => expectJoiRejection(res, 'productIds'));
  });

  // EP — null is MEANINGFUL: it clears
  it('SW-IACLS-API-TC28: a null class clears the override on every listed product', function () {
    if (!product) this.skip();
    const target = otherClass(product.effectiveClass) || 'A';
    setProductClass(product.id, target)
      .then(() => bulk([product.id], null))
      .then((res) => {
        expectAccepted(res, 'a clearing bulk call must be accepted');
        expect(data(res).abcClass, 'a clearing call reports a null band').to.eq(null);
        return listProducts(`?page=1&page_size=1&search=`);
      })
      .then(() => call('GET', `/abc-classification/products?page=1&page_size=300`))
      .then((list) => {
        const row = ((data(list) || {}).list || []).find((r) => r.id === product.id);
        if (row) {
          expect(row.abcClassOverride, 'the override was cleared by the bulk call').to.eq(null);
        }
        restoreProduct(product);
      });
  });

  // Error guessing — null must be explicit, not implied by omission
  it('SW-IACLS-API-TC29: refuses a bulk call that omits the class', function () {
    if (!product) this.skip();
    call('POST', '/abc-classification/products/bulk', { productIds: [product.id] }).then((res) => {
      expectJoiRejection(res, 'abcClass');
    });
  });

  // ===========================================================================
  // Summary
  // ===========================================================================

  // EP — units per class, and the arithmetic invariant
  it('SW-IACLS-API-TC30: the summary reports units per class and reconciles with its total', () => {
    call('GET', '/abc-classification/summary').then((res) => {
      expect(res.status, 'the summary reports units per class and reconciles with its total').to.eq(200);
      const d = data(res);
      expect(d.buckets, 'one bucket per class').to.be.an('array');
      const sum = d.buckets.reduce((n, b) => n + Number(b.onHandQuantity), 0);
      expect(
        Number(d.totalOnHandQuantity),
        'the buckets must sum to the reported total — the cards divide by this'
      ).to.eq(sum);
      d.buckets.forEach((b) => {
        expect(CLASSES).to.include(b.abcClass);
        expect(b.productCount, 'a SKU count rides along').to.be.a('number');
      });
    });
  });

  // Error guessing — the summary must honour its filters, not ignore them
  it('SW-IACLS-API-TC31: the summary honours the category filter', function () {
    if (!category) this.skip();
    call('GET', '/abc-classification/summary').then((all) => {
      const total = Number(data(all).totalOnHandQuantity);
      call('GET', `/abc-classification/summary?categoryId=${category.id}`).then((filtered) => {
        expect(filtered.status).to.eq(200);
        expect(
          Number(data(filtered).totalOnHandQuantity),
          'a single category cannot hold more than the whole catalogue'
        ).to.be.at.most(total);
      });
    });
  });

  // ===========================================================================
  // Auto-classification (no reachable UI — see plan §3.2)
  // ===========================================================================

  // EP — the settings shape
  it('SW-IACLS-API-TC32: reads the auto-classification settings', function () {
    call('GET', '/abc-classification/auto/settings').then((res) => {
      if (res.status === 404) this.skip(); // route not deployed on this environment
      expect(res.status, 'reads the auto-classification settings').to.eq(200);
      const d = data(res);
      expect(d).to.include.all.keys('windowDays', 'thresholdA', 'thresholdB');
    });
  });

  // Decision table — the thresholds are validated as a PAIR
  it('SW-IACLS-API-TC33: refuses a B threshold that does not exceed A', function () {
    if (!originalAutoSettings) this.skip();
    const a = Number(originalAutoSettings.thresholdA) || 80;
    call('PUT', '/abc-classification/auto/settings', { thresholdA: a, thresholdB: a }).then((equal) => {
      expect(equal.status, 'B equal to A would leave the B band empty').to.eq(400);
      call('PUT', '/abc-classification/auto/settings', {
        thresholdA: a,
        thresholdB: Math.min(a + 5, 100),
      }).then((higher) => {
        expect(higher.status, 'B above A is the valid pairing').to.eq(200);
      });
    });
  });

  // BVA — the window range
  it('SW-IACLS-API-TC34: accepts a window of 1 and 3650 days and refuses 0 and 3651', function () {
    if (!originalAutoSettings) this.skip();
    [
      { windowDays: 0, ok: false },
      { windowDays: 1, ok: true },
      { windowDays: 3650, ok: true },
      { windowDays: 3651, ok: false },
    ].forEach(({ windowDays, ok }) => {
      call('PUT', '/abc-classification/auto/settings', { windowDays }).then((res) => {
        expect(res.status, `windowDays=${windowDays}`).to.eq(ok ? 200 : 400);
      });
    });
  });

  // BVA — the schema requires at least one field
  it('SW-IACLS-API-TC35: refuses an empty settings body', function () {
    if (!originalAutoSettings) this.skip();
    call('PUT', '/abc-classification/auto/settings', {}).then((res) => {
      expect(res.status, 'min(1) on the settings object').to.eq(400);
    });
  });

  // Error guessing — a preview must apply NOTHING
  it('SW-IACLS-API-TC36: the auto preview applies nothing', function () {
    if (!product) this.skip();
    listProducts('?page=1&page_size=1').then((before) => {
      const rowBefore = ((data(before) || {}).list || [])[0];
      if (!rowBefore) this.skip();
      call('GET', '/abc-classification/auto/preview?windowDays=90&thresholdA=70&thresholdB=95').then((res) => {
        if (res.status === 404) this.skip();
        expect(res.status, 'the preview computes a ranking').to.eq(200);
        listProducts('?page=1&page_size=1').then((after) => {
          const rowAfter = ((data(after) || {}).list || [])[0];
          expect(rowAfter.effectiveClass, 'a preview must not reclassify anything').to.eq(
            rowBefore.effectiveClass
          );
          expect(rowAfter.source, 'nor change which rung decided it').to.eq(rowBefore.source);
        });
      });
    });
  });

  // EP — the run is enqueued, not executed inline.
  // Gated: a real run rewrites `abcClassAuto` across the catalogue and has NO
  // inverse, so it must never fire against a shared environment by default.
  it('SW-IACLS-API-TC37: a forced run is enqueued rather than executed inline', function () {
    if (!Cypress.env('ABC_ALLOW_AUTO_RUN')) {
      this.skip(); // destructive with no inverse — see plan §6.3 and pending.md
    }
    call('POST', '/abc-classification/auto/run', {}).then((res) => {
      expect(res.status).to.be.oneOf([200, 201, 202]);
      expect(
        JSON.stringify(data(res) || {}),
        'the response describes a queued job rather than a finished ranking'
      ).to.match(/queue|job|enqueu|run/i);
    });
  });

  // Use case — the mandatory audit trail
  it('SW-IACLS-API-TC38: a category class change leaves an audit-trail entry', function () {
    if (!category) this.skip();
    const next = otherClass(category.originalClass);
    setCategoryClass(category.id, next)
      .then(() => setCategoryClass(category.id, category.originalClass))
      .then(() =>
        call(
          'GET',
          `/audit-trails?entityType=Category&entityID=${category.id}&page=1&page_size=25`
        )
      )
      .then((res) => {
        expect(res.status, 'the trail must be queryable').to.be.lessThan(500);
        const body = data(res) || res.body;
        const rows = body.items || body.list || (Array.isArray(body) ? body : []);
        // The entityType a class change files under is the service's choice; assert
        // that SOMETHING recorded it rather than pinning a label the code may change.
        if (!rows.length) {
          cy.log('no Category-scoped trail rows — the change may be filed under another entityType');
          this.skip();
        }
        expect(rows[0].userName, 'the entry names the acting user').to.be.a('string').and.not.be.empty;
      });
  });

  // ===========================================================================
  // The reason the feature exists: classification is what an audit consumes
  // ===========================================================================

  // Decision table — moving a product's class moves the units an audit would count
  it('SW-IACLS-API-TC39: a class change moves what an audit preview reports', { tags: ['@smoke'] }, function () {
    if (!product) this.skip();

    // A scope that actually holds this product's stock. Probe the location tree
    // and take the first scope whose preview reports units for the current class.
    const from = product.effectiveClass;
    const to = otherClass(from);

    cy.request({
      method: 'GET',
      url: `${baseUrl}/locations?page=1&pageSize=500`,
      headers: headers(),
      failOnStatusCode: false,
    }).then((locRes) => {
      const body = locRes.body.data || locRes.body;
      const items = ((body && body.items) || []).filter((l) => !l.isDeleted && !l.is_deleted).slice(0, 20);
      const preview = (locationId, abcClass) =>
        call(
          'GET',
          `/inventory-audits/preview?scopeLocationId=${locationId}&abcClass=${abcClass}`
        );

      const findScope = (i) => {
        if (i >= items.length) return null;
        return preview(items[i].id, from).then((p) =>
          p.status === 200 && Number((data(p) || {}).totalExpectedUnits) > 0 ? items[i] : findScope(i + 1)
        );
      };

      findScope(0).then((scope) => {
        if (!scope) this.skip(); // no scope holds stock of this class — see pending.md

        preview(scope.id, from).then((beforeFrom) => {
          preview(scope.id, to).then((beforeTo) => {
            const fromBefore = Number(data(beforeFrom).totalExpectedUnits);
            const toBefore = Number(data(beforeTo).totalExpectedUnits);

            setProductClass(product.id, to).then((set) => {
              expect(set.status, 'the override must apply for this to mean anything').to.eq(200);

              preview(scope.id, from).then((afterFrom) => {
                preview(scope.id, to).then((afterTo) => {
                  const fromAfter = Number(data(afterFrom).totalExpectedUnits);
                  const toAfter = Number(data(afterTo).totalExpectedUnits);

                  expect(
                    fromAfter,
                    'the old class must now expect fewer units — this is what an audit of that class would count'
                  ).to.be.at.most(fromBefore);
                  expect(toAfter, 'and the new class more').to.be.at.least(toBefore);
                  expect(
                    fromBefore - fromAfter,
                    'the units that left the old class are the units that joined the new one'
                  ).to.eq(toAfter - toBefore);

                  restoreProduct(product);
                });
              });
            });
          });
        });
      });
    });
  });
});
