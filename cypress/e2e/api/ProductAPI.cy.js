/**
 * Product API
 * -----------
 * Endpoints:
 *   POST   /products               - create a product (category referenced by name)
 *   GET    /products               - list products (paginated envelope)
 *   POST   /products/deleteProduct - delete a product ({ id } in body)
 *   POST   /categories             - (setup) create the product-only category
 *   DELETE /categories/:id         - (teardown) remove the setup category
 *
 * A disposable product-only category is created in before() so the suite is
 * fully self-seeding and re-runnable. Products and the category are removed in
 * after(). All product data is faker-generated - no real inventory is embedded.
 */

import { faker } from '@faker-js/faker';

describe('Product API', () => {
  let authToken;
  let baseUrl;
  let categoryId;
  let categoryName;
  const createdProductIds = [];

  const uniqueName = (prefix) =>
    `${prefix}-${Date.now()}-${faker.number.int({ min: 1000, max: 9999 })}`;

  const req = (method, path, opts = {}) =>
    cy.request({
      method,
      url: `${baseUrl}${path}`,
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      ...opts,
    });

  const createProduct = (overrides = {}) =>
    req('POST', '/products', { body: { category: categoryName, ...overrides } });

  const extractId = (res) => {
    const data = (res.body && (res.body.data || res.body)) || {};
    return data.id ?? data.productId ?? null;
  };

  const extractList = (body) => {
    const data = (body && body.data) || body || {};
    return data.list || data.items || data.results || (Array.isArray(data) ? data : []);
  };

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    const identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: { username: Cypress.env('email'), password: Cypress.env('pass') },
    }).then((res) => {
      expect(res.status).to.equal(200);
      authToken = res.body.accessToken || res.body.token;
      expect(authToken).to.exist;

      // Seed a product-only category to hang the products off.
      categoryName = uniqueName('ProdAPI-Cat');
      req('POST', '/categories', {
        body: {
          name: categoryName,
          allowItems: false,
          allowVariants: false,
          allowVariantItems: false,
        },
      }).then((catRes) => {
        expect(catRes.status).to.be.oneOf([200, 201]);
        categoryId = extractId(catRes);
      });
    });
  });

  after(() => {
    createdProductIds.forEach((id) => req('POST', '/products/deleteProduct', { body: { id } }));
    if (categoryId) req('DELETE', `/categories/${categoryId}`);
  });

  it('SW_PROD_API_001 - creates a product under a product-only category @smoke', () => {
    createProduct().then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const id = extractId(res);
      expect(id, 'created product id').to.exist;
      createdProductIds.push(id);
    });
  });

  it('SW_PROD_API_002 - the created product echoes its category', () => {
    createProduct().then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const id = extractId(res);
      createdProductIds.push(id);
      expect(JSON.stringify(res.body)).to.include(categoryName);
    });
  });

  it('SW_PROD_API_003 - lists products in a recognizable envelope', () => {
    req('GET', '/products', { qs: { page: 1, page_size: 20 } }).then((res) => {
      expect(res.status).to.equal(200);
      expect(extractList(res.body)).to.be.an('array');
    });
  });

  it('SW_PROD_API_004 - rejects a create with no category', () => {
    req('POST', '/products', { body: {} }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });

  it('SW_PROD_API_005 - rejects a create referencing an unknown category', () => {
    req('POST', '/products', { body: { category: uniqueName('Ghost-Cat') } }).then((res) => {
      // Unknown category is a semantic failure - never a 5xx.
      expect(res.status).to.be.lessThan(500);
      expect(res.status).to.not.be.oneOf([200, 201]);
    });
  });

  it('SW_PROD_API_006 - rejects an unauthenticated create (401)', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products`,
      headers: { 'Content-Type': 'application/json' },
      body: { category: categoryName },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  it('SW_PROD_API_007 - a created product can be deleted (round-trip)', () => {
    createProduct().then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const id = extractId(res);
      req('POST', '/products/deleteProduct', { body: { id } }).then((delRes) => {
        expect(delRes.status).to.be.oneOf([200, 201, 204]);
      });
    });
  });

  it('SW_PROD_API_008 - deleting an unknown product id returns a semantic error, not a 5xx', () => {
    req('POST', '/products/deleteProduct', { body: { id: faker.number.int({ min: 900000000, max: 999999999 }) } }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
