/**
 * Product + Item Category Attribute API Tests
 * =============================================================================
 * Mirrors:  cypress/e2e/Configuration/03-product-Item-cat-attribute-tests.cy.js
 * UI scope: "Laptop Automation Cat" — product-item category (allowItems=true).
 *           The UI page exposes TWO tabs (Product / Item). This file drives
 *           every supported data type on BOTH entityTypes within the same
 *           host category.
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST   /categories            Create host category (allowItems=true)
 *   POST   /attributes            Create attribute (categoryId + entityType)
 *   PATCH  /attributes            Update attribute (id in BODY, not URL)
 *   DELETE /attributes/:id        Delete attribute
 *   DELETE /categories/:id        Cleanup host category in after()
 *
 * -----------------------------------------------------------------------------
 *   Joi schema expectations (Backend/src/modules/attribute/attribute.schema.ts)
 * -----------------------------------------------------------------------------
 *   createAttributeSchema: name (regex /^[a-zA-Z0-9\s]+$/, max 50), type,
 *     fieldName, editable, required; categoryId + entityType required when the
 *     attribute is category-scoped.
 *   updateAttributeSchema: additionally requires id, updatedAt, updatedBy.
 *   customListValidator: otherInfo.listOpitons (backend typo — preserved).
 *
 * -----------------------------------------------------------------------------
 *   Per-type flow (SW_ATR_API_<case>_01..04)
 * -----------------------------------------------------------------------------
 *   For each (entityType × uiType) the crudBlock runs:
 *     _01  CREATE       POST /attributes; expect echoed name/type/entityType.
 *     _02  RENAME       PATCH overrides.name = "<name> Updated".
 *     _03  REQUIRED TOGGLE  PATCH required=true, then required=false (nested).
 *     _04  DELETE       DELETE /attributes/:id; remove id from cleanup set.
 *
 * -----------------------------------------------------------------------------
 *   UI-only cases (documented here; not asserted in this file)
 * -----------------------------------------------------------------------------
 *     - Tab visibility: Laptop category shows BOTH Product and Item tabs.
 *     - Modal titles, inline toasts ("Attribute created./updated./deleted.").
 *     - "Required" switch animation, list chip editor, column headers.
 */

describe('Product + Item Category Attribute API', () => {
  // -------------------- Shared test state --------------------
  //   authToken        Bearer token fetched in before()
  //   baseUrl          Resolved from Cypress.env('API_BASE_URL')
  //   categoryId       Host Laptop (product-item) category id
  //   createdAttrIds   Attribute ids queued for DELETE in after()
  let authToken;
  let baseUrl;
  let categoryId;
  const createdAttrIds = [];

  // -------------------- Name helpers --------------------

  /** Short unique suffix (kept under the 50-char Joi name limit). */
  const suffix = () => `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

  /**
   * Compute a camelCase `fieldName` from a display name exactly like the
   * backend's formatFieldName() helper (attribute.schema.ts). The UI sends
   * this value from the client; API callers must replicate it.
   */
  const toFieldName = (name) =>
    name
      .replaceAll(/[^a-zA-Z0-9 ]/g, '')
      .replaceAll(/\b\w/g, (m, i) => (i === 0 ? m.toLowerCase() : m.toUpperCase()))
      .replaceAll(/\s+/g, '');

  /** JSON + Bearer auth headers. */
  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  // -------------------- Request helpers --------------------

  /** POST /categories — host category setup. */
  const createCategory = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/categories`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  /**
   * POST /attributes — create an attribute scoped to the host category.
   * @param {Object} params
   * @param {string} params.name         Display name (Joi regex /^[a-zA-Z0-9\s]+$/).
   * @param {string} params.type         Text|MultiLineText|Number|Email|Url|Decimal|
   *                                     Amount|Percent|List|Boolean
   * @param {string} params.entityType   'Product' | 'Item'
   * @param {boolean} [params.required=false]  Initial required flag.
   * @param {Object} [params.otherInfo={}]     Extra config (List → listOpitons).
   */
  const createAttribute = ({ name, type, entityType, required = false, otherInfo = {} }) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: headers(),
      failOnStatusCode: false,
      body: {
        name,
        type,
        fieldName: toFieldName(name),
        categoryId,
        entityType,
        editable: true,
        required,
        otherInfo,
      },
    });

  /**
   * PATCH /attributes — id is passed in the request BODY (non-standard).
   * updatedAt + updatedBy are required by updateAttributeSchema; missing them
   * returns 400.
   *
   * @param {Object} attr         Attribute to update (must include id, name,
   *                              type, fieldName, entityType).
   * @param {Object} overrides    { name?, required?, otherInfo? }
   */
  const patchAttribute = (attr, overrides = {}) =>
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/attributes`,
      headers: headers(),
      failOnStatusCode: false,
      body: {
        id: attr.id,
        name: overrides.name ?? attr.name,
        type: attr.type,
        fieldName: attr.fieldName,
        categoryId: attr.categoryId ?? categoryId,
        entityType: attr.entityType,
        editable: attr.editable ?? true,
        required: overrides.required ?? attr.required ?? false,
        otherInfo: overrides.otherInfo ?? attr.otherInfo ?? {},
        updatedAt: new Date().toISOString(),
        updatedBy: 'api-test',
      },
    });

  /** DELETE /attributes/:id — id is on the URL for DELETE. */
  const deleteAttribute = (id) =>
    cy.request({
      method: 'DELETE',
      url: `${baseUrl}/attributes/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  // PATCH /attributes returns a status-only envelope — verify updates via
  // GET /attributes/:id.
  const getAttributeById = (id) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/attributes/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  // -------------------- Setup / Teardown --------------------

  /**
   * before(): authenticate, then create a single Laptop-like product-item
   * category (allowItems=true). All attribute blocks share this categoryId
   * so they can co-exist on the same host, mirroring the UI page.
   */
  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    const identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: { username: Cypress.env('email'), password: Cypress.env('pass') },
    }).then((res) => {
      authToken = res.body.accessToken || res.body.token;
    });
    cy.then(() => {
      const catName = `Laptop-API-${suffix()}`;
      createCategory({
        name: catName,
        allowItems: true,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        categoryId = (res.body.data || res.body).id;
      });
    });
  });

  /**
   * after(): delete leftover attributes first (category delete would 409 if
   * any attribute still references it), then delete the host category.
   */
  after(() => {
    createdAttrIds.forEach((id) => deleteAttribute(id));
    if (categoryId) {
      cy.request({
        method: 'DELETE',
        url: `${baseUrl}/categories/${categoryId}`,
        headers: headers(),
        failOnStatusCode: false,
      });
    }
  });

  // -------------------- CRUD factory --------------------

  /**
   * 4-test lifecycle for one (entityType × type) pair. Each block captures a
   * local `created` variable so tests chain state forward.
   *
   * @param {string} caseId      SW_ATR_API_<caseId>_NN numbering (e.g. "111_TEXT_P")
   * @param {string} uiType      Attribute data type string
   * @param {string} entityType  'Product' | 'Item'
   * @param {Object} [otherInfo] Extra config (List → { listOpitons: [...] })
   */
  const crudBlock = (caseId, uiType, entityType, otherInfo = {}) => {
    describe(`Laptop Cat - ${entityType} ${uiType} Attribute (SW_ATR_API_${caseId})`, () => {
      let created;
      // Attribute names allow letters, numbers, and spaces only (Joi regex).
      const name = `${entityType} ${uiType} API ${suffix()}`;
      const updated = `${name} Updated`;

      /**
       * _01 CREATE
       *   Steps:
       *     1. POST /attributes with name/type/fieldName/entityType/categoryId.
       *     2. Expect 200/201 with echoed name/type/entityType/categoryId.
       *     3. Record the row + add id to cleanup set.
       *   UI mirror: "Add Attribute" form (on the correct tab).
       */
      it(`SW_ATR_API_${caseId}_01 - create ${entityType} ${uiType} attribute`, () => {
        createAttribute({ name, type: uiType, entityType, otherInfo }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          const data = res.body.data || res.body;
          expect(data.name).to.equal(name);
          expect(data.type).to.equal(uiType);
          expect(data.categoryId).to.equal(categoryId);
          expect(data.entityType).to.equal(entityType);
          created = data;
          createdAttrIds.push(data.id);
        });
      });

      /**
       * _02 RENAME
       *   Steps:
       *     1. PATCH /attributes with overrides.name = "<name> Updated".
       *     2. Expect 200/201 + response.name equals new value.
       *     3. Sync local `created` for subsequent PATCHes.
       *   UI mirror: in-place row rename.
       */
      it(`SW_ATR_API_${caseId}_02 - update name`, () => {
        patchAttribute(created, { name: updated }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          getAttributeById(created.id).then((getRes) => {
            expect((getRes.body.data || getRes.body).name).to.equal(updated);
          });
          created = { ...created, name: updated };
        });
      });

      /**
       * _03 REQUIRED TOGGLE (combined on → off)
       *   Steps:
       *     1. PATCH required=true; expect response.required=true.
       *     2. Chain a second PATCH required=false; expect response.required=false.
       *     3. Track local `created` across both updates.
       *   UI mirror: flipping the Required switch twice (on then off).
       */
      it(`SW_ATR_API_${caseId}_03 - toggle required on/off`, () => {
        patchAttribute(created, { required: true }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          getAttributeById(created.id).then((getOn) => {
            expect((getOn.body.data || getOn.body).required).to.equal(true);
          });
          created = { ...created, required: true };
          patchAttribute(created, { required: false }).then((res2) => {
            expect(res2.status).to.be.oneOf([200, 201]);
            getAttributeById(created.id).then((getOff) => {
              expect((getOff.body.data || getOff.body).required).to.equal(false);
            });
            created = { ...created, required: false };
          });
        });
      });

      /**
       * _04 DELETE
       *   Steps:
       *     1. DELETE /attributes/:id → expect 200/201/204.
       *     2. Remove id from cleanup set.
       *   UI mirror: row delete icon + confirmation.
       */
      it(`SW_ATR_API_${caseId}_04 - delete ${entityType} ${uiType} attribute`, () => {
        deleteAttribute(created.id).then((res) => {
          expect(res.status).to.be.oneOf([200, 201, 204]);
          const idx = createdAttrIds.indexOf(created.id);
          if (idx >= 0) createdAttrIds.splice(idx, 1);
        });
      });
    });
  };

  // ---------------------------------------------------------------------------
  // Product-entity attributes (UI: "Product" tab — SW_ATR_111 – SW_ATR_170)
  // ---------------------------------------------------------------------------
  crudBlock('111_TEXT_P', 'Text', 'Product');
  crudBlock('117_MLT_P', 'MultiLineText', 'Product');
  crudBlock('123_NUM_P', 'Number', 'Product');
  crudBlock('129_EMAIL_P', 'Email', 'Product');
  crudBlock('135_URL_P', 'Url', 'Product');
  crudBlock('141_DEC_P', 'Decimal', 'Product');
  crudBlock('147_AMT_P', 'Amount', 'Product');
  crudBlock('153_PCT_P', 'Percent', 'Product');
  crudBlock('159_LIST_P', 'List', 'Product', { listOpitons: [{ label: 'Dell' }, { label: 'HP' }] });
  crudBlock('165_BOOL_P', 'Boolean', 'Product');

  // ---------------------------------------------------------------------------
  // Item-entity attributes (UI: "Item" tab — SW_ATR_171 – SW_ATR_230)
  // ---------------------------------------------------------------------------
  crudBlock('171_TEXT_I', 'Text', 'Item');
  crudBlock('177_MLT_I', 'MultiLineText', 'Item');
  crudBlock('183_NUM_I', 'Number', 'Item');
  crudBlock('189_EMAIL_I', 'Email', 'Item');
  crudBlock('195_URL_I', 'Url', 'Item');
  crudBlock('201_DEC_I', 'Decimal', 'Item');
  crudBlock('207_AMT_I', 'Amount', 'Item');
  crudBlock('213_PCT_I', 'Percent', 'Item');
  crudBlock('219_LIST_I', 'List', 'Item', { listOpitons: [{ label: 'IT' }, { label: 'HR' }] });
  crudBlock('225_BOOL_I', 'Boolean', 'Item');

  // UI-only (not asserted): tab visibility (Product vs Item), modal titles,
  // "Attribute created/updated/deleted" toast copy, Required switch motion,
  // list option chip rendering.
});
