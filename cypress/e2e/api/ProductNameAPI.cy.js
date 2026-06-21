/**
 * Per-Category Product Name API Tests
 * ---------------------------------------------
 * Mirrors cypress/e2e/Configuration/06-productNameTests.cy.js.
 *
 * The "Manage Product Name" modal stores the per-category naming template
 * in the /configs table under:
 *   type=categoryProductName
 *   name=productNamingTemplate{categoryId}
 *   configJson: { productName: [ { label, value }, ... ] }
 *
 * Endpoints exercised:
 *   POST  /categories                          - create host category
 *   POST  /attributes                          - seed product attributes used as tags
 *   POST  /configs                             - create the template
 *   GET   /configs?type=categoryProductName&name=...   - read the template
 *   PATCH /configs/:id                         - update the template
 *   DELETE /configs/:id                        - cleanup
 *
 * UI-only cases (modal drag-drop, toast copy, attribute picker rendering) SKIPPED.
 */

describe('Product Name API - per-category', () => {
  let authToken;
  let baseUrl;
  let categoryId;
  let configId;
  let userID;
  const createdAttrIds = [];

  // Decode JWT payload to extract the user id — POST /configs requires
  // userID as a string. PATCH/DELETE intentionally reject it (asymmetric
  // Joi schemas), so we only attach it on the create call.
  const jwtUserId = (token) => {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf8'),
      );
      return String(payload.id || payload.userId || payload.sub || '');
    } catch {
      return '';
    }
  };

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
      body,
    });

  const createAttribute = (name) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: headers(),
      failOnStatusCode: false,
      body: {
        name,
        type: 'Text',
        fieldName: toFieldName(name),
        categoryId,
        entityType: 'Product',
        editable: true,
        required: false,
        // otherInfo is required — backend crashes with "Cannot read properties of
        // undefined (reading 'controlRules')" when omitted.
        otherInfo: {},
      },
    });

  const postConfig = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/configs`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  const patchConfig = (id, body) =>
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/configs/${id}`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  const getConfig = (qs) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/configs`,
      qs,
      headers: headers(),
      failOnStatusCode: false,
    });

  const deleteConfig = (id) =>
    cy.request({
      method: 'DELETE',
      url: `${baseUrl}/configs/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    const identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: { username: Cypress.env('email'), password: Cypress.env('pass') },
    }).then((res) => {
      authToken = res.body.accessToken || res.body.token;
      userID = jwtUserId(authToken);
    });
    cy.then(() => {
      createCategory({
        name: `ProdName-Cat-${suffix()}`,
        allowItems: true,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        categoryId = (res.body.data || res.body).id;
      });
    });
    cy.then(() => {
      // Seed 3 attributes that will be used as naming-template tags.
      ['Brand', 'Model', 'Capacity'].forEach((n) => {
        // Attribute names allow letters, numbers, and spaces only (Joi regex).
        createAttribute(`${n} ${suffix()}`).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          createdAttrIds.push((res.body.data || res.body).id);
        });
      });
    });
  });

  after(() => {
    if (configId) deleteConfig(configId);
    createdAttrIds.forEach((id) => {
      cy.request({
        method: 'DELETE',
        url: `${baseUrl}/attributes/${id}`,
        headers: headers(),
        failOnStatusCode: false,
      });
    });
    if (categoryId) {
      cy.request({
        method: 'DELETE',
        url: `${baseUrl}/categories/${categoryId}`,
        headers: headers(),
        failOnStatusCode: false,
      });
    }
  });

  it('SW_CAT_PN_API_01 - create product name template for the category', () => {
    postConfig({
      type: 'categoryProductName',
      name: `productNamingTemplate${categoryId}`,
      userID,
      configJson: {
        productName: [
          { label: 'Brand', value: '${brand}' },
          { label: 'Model', value: '${model}' },
        ],
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const data = res.body.data || res.body;
      expect(data.id).to.exist;
      configId = data.id;
    });
  });

  it('SW_CAT_PN_API_02 - GET /configs returns the saved template', () => {
    getConfig({
      type: 'categoryProductName',
      name: `productNamingTemplate${categoryId}`,
    }).then((res) => {
      expect(res.status).to.equal(200);
      const list =
        res.body?.data?.list || res.body?.data?.items || res.body?.data?.results || [];
      const row = list.find((r) => r?.name === `productNamingTemplate${categoryId}`);
      expect(row).to.exist;
      expect(row.configJson.productName).to.have.length.of.at.least(2);
    });
  });

  it('SW_CAT_PN_API_03 - PATCH /configs/:id updates template (append Capacity tag)', () => {
    patchConfig(configId, {
      type: 'categoryProductName',
      name: `productNamingTemplate${categoryId}`,
      configJson: {
        productName: [
          { label: 'Brand', value: '${brand}' },
          { label: 'Model', value: '${model}' },
          { label: 'Capacity', value: '${capacity}' },
        ],
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  it('SW_CAT_PN_API_04 - PATCH with custom text segment persists', () => {
    patchConfig(configId, {
      type: 'categoryProductName',
      name: `productNamingTemplate${categoryId}`,
      configJson: {
        productName: [
          { label: 'Brand', value: '${brand}' },
          { label: '-', value: '-' },
          { label: 'Model', value: '${model}' },
          { label: 'Edition A', value: 'Edition A' },
        ],
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      getConfig({
        type: 'categoryProductName',
        name: `productNamingTemplate${categoryId}`,
      }).then((getRes) => {
        const list =
          getRes.body?.data?.list || getRes.body?.data?.items || getRes.body?.data?.results || [];
        const row = list.find((r) => r?.name === `productNamingTemplate${categoryId}`);
        const tags = row?.configJson?.productName || [];
        expect(tags.some((t) => t.value === 'Edition A')).to.equal(true);
      });
    });
  });

  it('SW_CAT_PN_API_05 - PATCH with empty productName array is accepted (reset)', () => {
    patchConfig(configId, {
      type: 'categoryProductName',
      name: `productNamingTemplate${categoryId}`,
      configJson: { productName: [] },
    }).then((res) => expect(res.status).to.be.oneOf([200, 201]));
  });

  it('SW_CAT_PN_API_NEG_01 - unauthenticated POST /configs → 401', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/configs`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      body: {
        type: 'categoryProductName',
        name: `productNamingTemplate${categoryId}`,
        configJson: { productName: [] },
      },
    }).then((res) => expect(res.status).to.equal(401));
  });

  it('SW_CAT_PN_API_NEG_02 - PATCH /configs/:id unknown id → 4xx', () => {
    patchConfig(999999999, {
      type: 'categoryProductName',
      name: `productNamingTemplate${categoryId}`,
      configJson: { productName: [] },
    }).then((res) => expect(res.status).to.be.oneOf([400, 404]));
  });

  // UI-only: drag-drop reorder, modal "Manage Product Name", toast copy
  // ("Product name update successfully.", "Product name created.").
});
