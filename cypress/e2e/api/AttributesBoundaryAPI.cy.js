/**
 * Attributes API - Boundary & Negative Cases
 * ------------------------------------------
 * Endpoints:
 *   POST   /attributes           - create an attribute
 *   PATCH  /attributes           - update (id in body, not URL)
 *   GET    /attributes?all=true  - list attributes
 *   GET    /attributes/:id       - read one
 *   DELETE /attributes/:id       - delete one
 *
 * Complements the happy-path CommonAttributeAPI suite with equivalence-partition
 * and boundary-value checks: min/long names, missing/invalid fields, duplicates,
 * unknown ids and unauthenticated access. All names are faker-generated and
 * every created attribute is cleaned up in after().
 */

import { faker } from '@faker-js/faker';

describe('Attributes API - Boundary & Negative Cases', () => {
  let authToken;
  let baseUrl;
  const createdIds = [];

  const uniqueName = (prefix) =>
    `${prefix}-${faker.word.noun()}-${Date.now()}-${faker.number.int({ min: 100, max: 9999 })}`;

  const req = (method, path, opts = {}) =>
    cy.request({
      method,
      url: `${baseUrl}${path}`,
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      ...opts,
    });

  const createAttribute = (body) => req('POST', '/attributes', { body });

  const trackId = (res) => {
    const data = res.body && (res.body.data || res.body);
    if (data && data.id) createdIds.push(data.id);
    return data;
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
    createdIds.forEach((id) => req('DELETE', `/attributes/${id}`));
  });

  it('SW_ATTR_API_001 - creates a Text attribute with a single-character name (lower boundary)', () => {
    createAttribute({ name: faker.string.alpha(1), type: 'Text', entityType: 'Product' }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201, 400]); // accept or reject, never 5xx
      if (res.status < 400) trackId(res);
    });
  });

  it('SW_ATTR_API_002 - creates an attribute with a long name (upper boundary)', () => {
    createAttribute({ name: uniqueName(faker.string.alpha(60)), type: 'Text', entityType: 'Product' }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201, 400]);
      if (res.status < 400) trackId(res);
    });
  });

  it('SW_ATTR_API_003 - rejects a create with a missing name (400)', () => {
    createAttribute({ type: 'Text', entityType: 'Product' }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });

  it('SW_ATTR_API_004 - rejects a create with an empty-string name (400)', () => {
    createAttribute({ name: '', type: 'Text', entityType: 'Product' }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });

  it('SW_ATTR_API_005 - rejects a create with a missing type (400)', () => {
    createAttribute({ name: uniqueName('NoType'), entityType: 'Product' }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });

  it('SW_ATTR_API_006 - rejects a create with an invalid type (400)', () => {
    createAttribute({ name: uniqueName('BadType'), type: 'NotARealType', entityType: 'Product' }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });

  it('SW_ATTR_API_007 - rejects a duplicate attribute name', () => {
    const name = uniqueName('Dup');
    createAttribute({ name, type: 'Text', entityType: 'Product' }).then((first) => {
      expect(first.status).to.be.oneOf([200, 201]);
      trackId(first);
      createAttribute({ name, type: 'Text', entityType: 'Product' }).then((dup) => {
        expect(dup.status).to.be.oneOf([400, 409, 422]);
      });
    });
  });

  it('SW_ATTR_API_008 - rejects an unauthenticated create (401)', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: { 'Content-Type': 'application/json' },
      body: { name: uniqueName('NoAuth'), type: 'Text', entityType: 'Product' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  it('SW_ATTR_API_009 - reading an unknown attribute id returns a semantic error, not a 5xx', () => {
    req('GET', '/attributes/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
      expect(res.status).to.not.equal(200);
    });
  });

  it('SW_ATTR_API_010 - deleting an unknown attribute id returns a semantic error, not a 5xx', () => {
    req('DELETE', '/attributes/999999999').then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });
});
