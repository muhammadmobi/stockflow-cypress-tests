// cypress/support/InventoryAudit/classificationHelpers.js
//
// Stubs, live seeding and capture/restore for the ABC Classification specs.
// Test plan: cypress/qa/testPlans/inventoryAudit/sub/classification-plan.md (§6.2, §6.3, §6.5)
//
// WHY capture-and-restore is load-bearing here, not hygiene: a category's class
// decides what EVERY future audit of that class counts. A leaked change does not
// fail this suite — it silently changes another suite's expected set, days later.
// So every mutation helper below comes in a pair.

const apiBase = () => Cypress.env('API_BASE_URL');
const H = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const req = (method, token, path, body) =>
  cy.request({ method, url: `${apiBase()}${path}`, headers: H(token), body, failOnStatusCode: false });

export const unwrap = (res) => (res && res.body && 'data' in res.body ? res.body.data : res && res.body);

/** Route matchers — one place to change if the base path moves. */
export const ROUTES = {
  categories: '**/abc-classification/categories',
  category: (id) => `**/abc-classification/categories/${id}`,
  products: '**/abc-classification/products*',
  product: (id) => `**/abc-classification/products/${id}`,
  productOverride: (id) => `**/abc-classification/products/${id}/override`,
  bulk: '**/abc-classification/products/bulk',
  summary: '**/abc-classification/summary*',
};

export const envelope = (data) => ({ statusCode: 200, success: true, error: null, data });

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

export function stubCategories(rows, alias = 'abcCategories') {
  cy.intercept('GET', ROUTES.categories, { body: envelope(rows) }).as(alias);
  return alias;
}

export function stubCategoriesFailure(message, alias = 'abcCategoriesFail') {
  cy.intercept('GET', ROUTES.categories, {
    statusCode: 500,
    body: {
      statusCode: 500,
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message, details: [] },
      data: null,
    },
  }).as(alias);
  return alias;
}

/** Stub the product grid. `rows` is the page; `count` the reported total. */
export function stubProducts(rows, count, alias = 'abcProducts') {
  cy.intercept('GET', ROUTES.products, {
    body: envelope({
      list: rows,
      pagination: { page: 1, page_size: 75, count: count == null ? rows.length : count, pages: 1 },
    }),
  }).as(alias);
  return alias;
}

export function stubSummary(summary, alias = 'abcSummary') {
  cy.intercept('GET', ROUTES.summary, { body: envelope(summary) }).as(alias);
  return alias;
}

/** Capture the PUT that sets a category class, and reply with the new value. */
export function stubCategoryClassSave(alias = 'abcCategoryPut') {
  cy.intercept('PUT', ROUTES.category('*'), (r) => {
    r.reply({ body: envelope({ id: 0, abcClass: r.body.abcClass }) });
  }).as(alias);
  return alias;
}

/** Refuse a category class change with a server message the UI must surface. */
export function stubCategoryClassRefused(message, alias = 'abcCategoryRefused') {
  cy.intercept('PUT', ROUTES.category('*'), {
    statusCode: 400,
    body: {
      statusCode: 400,
      success: false,
      error: { code: 'INVALID_REQUEST', message, details: [] },
      data: null,
    },
  }).as(alias);
  return alias;
}

/** Capture the per-row override PUT, echoing a coherent resolution result. */
export function stubOverrideSave(alias = 'abcOverridePut') {
  cy.intercept('PUT', ROUTES.product('*'), (r) => {
    r.reply({
      body: envelope({
        id: 0,
        abcClassOverride: r.body.abcClass,
        categoryClass: 'C',
        effectiveClass: r.body.abcClass,
        source: 'Overridden',
      }),
    });
  }).as(alias);
  return alias;
}

/** Capture the clear-override DELETE, echoing the inherited fallback. */
export function stubOverrideClear(categoryClass = 'C', alias = 'abcOverrideDelete') {
  cy.intercept('DELETE', ROUTES.productOverride('*'), {
    body: envelope({
      id: 0,
      abcClassOverride: null,
      categoryClass,
      effectiveClass: categoryClass,
      source: 'Inherited',
    }),
  }).as(alias);
  return alias;
}

/** Capture the bulk POST and reply with a chosen result. */
export function stubBulk(result, alias = 'abcBulk') {
  cy.intercept('POST', ROUTES.bulk, (r) => {
    r.reply({
      body: envelope(
        Object.assign({ updated: (r.body.productIds || []).length, abcClass: r.body.abcClass }, result)
      ),
    });
  }).as(alias);
  return alias;
}

/** Generate N synthetic product rows — for the bulk-cap boundary. */
export function productRows(count, template) {
  return Array.from({ length: count }, (_, i) =>
    Object.assign({}, template, {
      id: 100000 + i,
      name: `Cypress bulk product ${i + 1}`,
    })
  );
}

// ---------------------------------------------------------------------------
// Live reads + capture/restore
// ---------------------------------------------------------------------------

export const listCategories = (token) => req('GET', token, '/abc-classification/categories');
export const setCategoryClass = (token, id, abcClass) =>
  req('PUT', token, `/abc-classification/categories/${id}`, { abcClass });
export const listProducts = (token, qs = '') => req('GET', token, `/abc-classification/products${qs}`);
export const setProductClass = (token, id, abcClass) =>
  req('PUT', token, `/abc-classification/products/${id}`, { abcClass });
export const clearProductOverride = (token, id) =>
  req('DELETE', token, `/abc-classification/products/${id}/override`);
export const getSummary = (token, qs = '') => req('GET', token, `/abc-classification/summary${qs}`);

/** A category plus its current class, so a test can put it back. */
export function captureCategory(token) {
  return listCategories(token).then((res) => {
    const rows = unwrap(res) || [];
    return rows.length ? { id: rows[0].id, name: rows[0].name, originalClass: rows[0].abcClass } : null;
  });
}

/** A product plus its current override, so a test can put it back. */
export function captureProduct(token) {
  return listProducts(token, '?page=1&page_size=1').then((res) => {
    const row = ((unwrap(res) || {}).list || [])[0];
    return row
      ? {
          id: row.id,
          name: row.name,
          originalOverride: row.abcClassOverride,
          categoryClass: row.categoryClass,
          effectiveClass: row.effectiveClass,
        }
      : null;
  });
}

/** Put a captured category back. Best-effort — teardown must never fail a run. */
export function restoreCategory(token, captured) {
  if (!captured) return cy.wrap(null, { log: false });
  return setCategoryClass(token, captured.id, captured.originalClass);
}

/** Put a captured product back: re-apply its override, or clear if it had none. */
export function restoreProduct(token, captured) {
  if (!captured) return cy.wrap(null, { log: false });
  return captured.originalOverride
    ? setProductClass(token, captured.id, captured.originalOverride)
    : clearProductOverride(token, captured.id);
}

/** A class that is not the one given — for "change it to something else". */
export const otherClass = (current) => ['A', 'B', 'C'].find((c) => c !== current);
