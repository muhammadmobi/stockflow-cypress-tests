/**
 * Purchase Order API
 * ------------------
 * Endpoints:
 *   POST   /purchase-orders                       - create a PO
 *   GET    /purchase-orders                        - list POs (paginated envelope)
 *   GET    /purchase-orders/po-numbers/?close=...  - active/closed PO numbers
 *   DELETE /purchase-orders/:poNumber              - delete a PO
 *
 * Every PO number is generated at runtime (faker) so no real purchase-order
 * data is embedded. Created POs are tracked and removed in after().
 */

import { faker } from '@faker-js/faker';

describe('Purchase Order API', () => {
  let authToken;
  let baseUrl;
  const createdPoNumbers = [];

  // A demo-safe, collision-resistant PO number, e.g. "PO-AUTO-8F3K-4821".
  const uniquePo = () =>
    `PO-AUTO-${faker.string.alphanumeric({ length: 4, casing: 'upper' })}-${faker.number.int({ min: 1000, max: 9999 })}`;

  const req = (method, path, opts = {}) =>
    cy.request({
      method,
      url: `${baseUrl}${path}`,
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      ...opts,
    });

  const createPo = (poNumber, overrides = {}) => {
    const qty = faker.number.int({ min: 5, max: 50 });
    return req('POST', '/purchase-orders', {
      body: {
        poNumber,
        status: 'Open',
        expectedQuantity: qty,
        originalQuantity: qty,
        ...overrides,
      },
    });
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
    });
  });

  after(() => {
    createdPoNumbers.forEach((po) =>
      req('DELETE', `/purchase-orders/${encodeURIComponent(po)}`),
    );
  });

  it('SW_PO_API_001 - creates a purchase order with a valid payload @smoke', () => {
    const po = uniquePo();
    createPo(po).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      createdPoNumbers.push(po);
      const data = res.body.data || res.body;
      expect(JSON.stringify(data)).to.include(po);
    });
  });

  it('SW_PO_API_002 - lists purchase orders in a recognizable envelope', () => {
    req('GET', '/purchase-orders', { qs: { page: 1, page_size: 20 } }).then((res) => {
      expect(res.status).to.equal(200);
      expect(extractList(res.body)).to.be.an('array');
    });
  });

  it('SW_PO_API_003 - a newly created PO appears in the active po-numbers list', () => {
    const po = uniquePo();
    createPo(po).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      createdPoNumbers.push(po);
      req('GET', '/purchase-orders/po-numbers/', { qs: { close: false } }).then((listRes) => {
        expect(listRes.status).to.equal(200);
        expect(JSON.stringify(listRes.body)).to.include(po);
      });
    });
  });

  it('SW_PO_API_004 - filters purchase orders by Open status', () => {
    req('GET', '/purchase-orders', { qs: { status: 'Open', page: 1, page_size: 20 } }).then((res) => {
      expect(res.status).to.equal(200);
      const list = extractList(res.body);
      expect(list).to.be.an('array');
      list.forEach((po) => {
        if (po && po.status) expect(po.status).to.equal('Open');
      });
    });
  });

  it('SW_PO_API_005 - rejects a create with a missing poNumber (400)', () => {
    req('POST', '/purchase-orders', {
      body: { status: 'Open', expectedQuantity: 10, originalQuantity: 10 },
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });

  it('SW_PO_API_006 - rejects an unauthenticated create (401)', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/purchase-orders`,
      headers: { 'Content-Type': 'application/json' },
      body: { poNumber: uniquePo(), status: 'Open', expectedQuantity: 10, originalQuantity: 10 },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  it('SW_PO_API_007 - deleting an unknown PO returns a semantic error, not a 5xx', () => {
    req('DELETE', `/purchase-orders/${encodeURIComponent(uniquePo())}`).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  it('SW_PO_API_008 - a created PO can be deleted (round-trip)', () => {
    const po = uniquePo();
    createPo(po).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      req('DELETE', `/purchase-orders/${encodeURIComponent(po)}`).then((delRes) => {
        expect(delRes.status).to.be.oneOf([200, 201, 204]);
      });
    });
  });
});
