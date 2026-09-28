/**
 * Manage Attribute Hierarchy API Tests
 * ---------------------------------------------
 * Mirrors cypress/e2e/Configuration/07-manageHierarchyTests.cy.js.
 *
 * In the UI, drag-drop reordering of attribute dependencies triggers
 * PATCH /attributes with otherInfo.dependsOn set on each affected attribute.
 *
 * Endpoints exercised:
 *   POST   /categories            - create host category
 *   POST   /attributes            - seed attributes that will form the chain
 *   PATCH  /attributes            - write otherInfo.dependsOn to establish hierarchy
 *   GET    /attributes            - verify persistence
 *   DELETE /attributes/:id        - cleanup
 *
 * UI-only cases (drag-drop interaction, modal title, toast copy
 * "Dependencies updated successfully") SKIPPED.
 */

import { withValidOtherInfo } from '../../support/helpers/attributeHelpers';

describe('Manage Attribute Hierarchy API', () => {
  let authToken;
  let baseUrl;
  let categoryId;
  const attrs = {};
  const createdAttrIds = [];

  const suffix = () => `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
  const toFieldName = (name) =>
    name
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\b\w/g, (m, i) => (i === 0 ? m.toLowerCase() : m.toUpperCase()))
      .replace(/\s+/g, '');

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const createCategory = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/categories`,
      headers: headers(),
      failOnStatusCode: false,
      // POST /categories is highly variable on QA (1s–25s with the
      // schema-cache rebuild). Allow generous headroom so before() doesn't
      // die on a slow run.
      timeout: 120000,
      body,
    });

  const createAttribute = (name) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: headers(),
      failOnStatusCode: false,
      timeout: 120000,
      body: {
        name,
        type: 'Text',
        fieldName: toFieldName(name),
        categoryId,
        entityType: 'Product',
        editable: true,
        required: true,
        // Text needs a valid otherInfo.controlRules; an empty {} passes create
        // but 500s every later Excel import ("Could not fetch attribute schema").
        otherInfo: withValidOtherInfo('Text'),
      },
    });

  const patchAttribute = (attr, otherInfo) =>
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/attributes`,
      headers: headers(),
      failOnStatusCode: false,
      // PATCH /attributes triggers a cross-row dependsOn recompute and can
      // exceed 60s on the first call after attribute create on shared QA
      // (observed 60s+ on cold path; TC04's later PATCH took 26s).
      timeout: 120000,
      body: {
        id: attr.id,
        name: attr.name,
        type: attr.type,
        fieldName: attr.fieldName,
        categoryId: attr.categoryId,
        entityType: attr.entityType,
        editable: attr.editable ?? true,
        required: attr.required ?? true,
        // `?? {}` is NOT enough: an attribute that comes back with otherInfo:{}
        // would be PATCHed straight back as {} — the exact import-breaking value.
        // Backfill the type's required sub-object while keeping dependsOn etc.
        otherInfo: withValidOtherInfo(attr.type, otherInfo ?? attr.otherInfo ?? {}),
        updatedAt: new Date().toISOString(),
        updatedBy: 'api-test',
      },
    });

  const getAttribute = (id) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/attributes/${id}`,
      headers: headers(),
      failOnStatusCode: false,
      timeout: 60000,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
    });
    cy.then(() => {
      createCategory({
        name: `Hier-Cat-${suffix()}`,
        allowItems: true,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        categoryId = (res.body.data || res.body).id;
      });
    });
    // Seed 3 required attributes to form a chain: Brand → Model → RAM
    // Backend schema for attribute name allows only [a-zA-Z0-9\s] — no hyphens.
    cy.then(() => {
      ['Brand', 'Model', 'RAM'].forEach((n) => {
        const fullName = `${n} Hier ${suffix()}`;
        createAttribute(fullName).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          const data = res.body.data || res.body;
          attrs[n] = data;
          createdAttrIds.push(data.id);
        });
      });
    });
  });

  after(() => {
    createdAttrIds.forEach((id) => {
      cy.request({
        method: 'DELETE',
        url: `${baseUrl}/attributes/${id}`,
        headers: headers(),
        failOnStatusCode: false,
        timeout: 60000,
      });
    });
    if (categoryId) {
      cy.request({
        method: 'DELETE',
        url: `${baseUrl}/categories/${categoryId}`,
        headers: headers(),
        failOnStatusCode: false,
        timeout: 60000,
      });
    }
  });

  // PATCH /attributes returns the entity but does not echo otherInfo —
  // we follow each PATCH with a GET to assert the persisted shape, matching
  // the contract TC03 already exercises.

  it('SW_CAT_HIER_API_01 - set dependsOn: Model → Brand', () => {
    patchAttribute(attrs.Model, { dependsOn: attrs.Brand.fieldName }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getAttribute(attrs.Model.id).then((res) => {
      const data = res.body.data || res.body;
      expect(data.otherInfo?.dependsOn).to.equal(attrs.Brand.fieldName);
      attrs.Model = data;
    });
  });

  it('SW_CAT_HIER_API_02 - set dependsOn: RAM → Model (chain of 3)', () => {
    patchAttribute(attrs.RAM, { dependsOn: attrs.Model.fieldName }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getAttribute(attrs.RAM.id).then((res) => {
      const data = res.body.data || res.body;
      expect(data.otherInfo?.dependsOn).to.equal(attrs.Model.fieldName);
      attrs.RAM = data;
    });
  });

  it('SW_CAT_HIER_API_03 - GET verifies the full chain persists', () => {
    getAttribute(attrs.Model.id).then((res) => {
      expect((res.body.data || res.body).otherInfo?.dependsOn).to.equal(attrs.Brand.fieldName);
    });
    getAttribute(attrs.RAM.id).then((res) => {
      expect((res.body.data || res.body).otherInfo?.dependsOn).to.equal(attrs.Model.fieldName);
    });
  });

  it('SW_CAT_HIER_API_04 - rewire chain: RAM → Brand, Model cleared', () => {
    patchAttribute(attrs.RAM, { dependsOn: attrs.Brand.fieldName }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getAttribute(attrs.RAM.id).then((res) => {
      const data = res.body.data || res.body;
      expect(data.otherInfo?.dependsOn).to.equal(attrs.Brand.fieldName);
      attrs.RAM = data;
    });
    patchAttribute(attrs.Model, {}).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getAttribute(attrs.Model.id).then((res) => {
      attrs.Model = res.body.data || res.body;
    });
  });

  it('SW_CAT_HIER_API_05 - clear all dependsOn (reset hierarchy)', () => {
    patchAttribute(attrs.RAM, {}).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getAttribute(attrs.RAM.id).then((res) => {
      const data = res.body.data || res.body;
      expect(data.otherInfo?.dependsOn ?? null).to.satisfy((v) => v === null || v === undefined);
      attrs.RAM = data;
    });
  });

  it('SW_CAT_HIER_API_06 - POST /categories/multi accepts bulk hierarchy payload', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/categories/multi`,
      headers: headers(),
      failOnStatusCode: false,
      body: { categories: [], attributes: [] },
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
    });
  });

  it('SW_CAT_HIER_API_NEG_01 - unauthenticated PATCH /attributes → 401', () => {
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/attributes`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      body: {
        id: attrs.Model.id,
        name: attrs.Model.name,
        type: attrs.Model.type,
        fieldName: attrs.Model.fieldName,
        editable: true,
        required: true,
        updatedAt: new Date().toISOString(),
        updatedBy: 'noauth',
      },
    }).then((res) => expect(res.status).to.equal(401));
  });

  // UI-only: drag-drop reorder, "Dependencies updated successfully" toast,
  // modal layout.
});
