/**
 * Product-Only Category Attribute API Tests
 * =============================================================================
 * Mirrors:  cypress/e2e/Configuration/02-product-cat-attribute-tests.cy.js
 * UI scope: "RAM Automation Cat" — product-only category (allowItems=false,
 *           allowVariants=false, allowVariantItems=false). All attributes
 *           created in the UI under this page use entityType="Product".
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST   /categories            Create the host product-only category (before)
 *   POST   /attributes            Create attribute scoped to categoryId + Product
 *   PATCH  /attributes            Update attribute (id is in the BODY, not URL)
 *   DELETE /attributes/:id        Delete attribute
 *   DELETE /categories/:id        Cleanup (after)
 *
 * -----------------------------------------------------------------------------
 *   Joi schema expectations (Backend/src/modules/attribute/attribute.schema.ts)
 * -----------------------------------------------------------------------------
 *   createAttributeSchema: name (regex /^[a-zA-Z0-9\s]+$/, max 50), type,
 *     fieldName, editable, required. categoryId + entityType are required for
 *     category-scoped attributes.
 *   updateAttributeSchema: additionally requires id, updatedAt, updatedBy.
 *   customListValidator: listOpitons (note the backend typo — we preserve it).
 *
 * -----------------------------------------------------------------------------
 *   Per-attribute-type flow (SW_ATR_API_<case>_01..05)
 * -----------------------------------------------------------------------------
 *   Each data type (Text, MultiLineText, Number, Email, Url, Decimal, Amount,
 *   Percent, List, Boolean) drives the same five-step flow produced by the
 *   UI crudBlock factory:
 *     _01  CREATE       POST /attributes; expect name/type/categoryId to echo.
 *     _02  RENAME       PATCH with overrides.name = "<name> Updated".
 *     _03  REQUIRED ON  PATCH with required=true; expect response.required=true.
 *     _04  REQUIRED OFF PATCH with required=false; expect response.required=false.
 *     _05  DELETE       DELETE /attributes/:id; remove from cleanup set.
 *
 * -----------------------------------------------------------------------------
 *   UI-only cases (documented here; not asserted in this file)
 * -----------------------------------------------------------------------------
 *     - "Add Attribute" modal title & tab visibility (Product-only shows only
 *       the Product tab; no Item tab).
 *     - Toast copy: "Attribute created.", "Attribute updated.",
 *       "Attribute deleted successfully."
 *     - Table rendering: column headers, "required" chip, sort indicators.
 *     - Inline rename UX & list-option chip editor.
 */

describe('Product-Only Category Attribute API', () => {
  // -------------------- Shared test state --------------------
  //   authToken        Bearer token fetched in before()
  //   baseUrl          Resolved from Cypress.env('API_BASE_URL')
  //   categoryId       Host product-only category created in before()
  //   createdAttrIds   Attribute ids queued for DELETE in after()
  let authToken;
  let baseUrl;
  let categoryId;
  const createdAttrIds = [];

  // -------------------- Name helpers --------------------

  /**
   * Generate a short, timestamp-based suffix used to keep attribute/category
   * names unique across re-runs (the attribute name is a UNIQUE-scoped column
   * — duplicate names within the same category would 409).
   */
  const suffix = () => `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

  /** Build a uniquely suffixed name for a given prefix. */
  const uniqueName = (prefix) => `${prefix} ${suffix()}`;

  /**
   * Derive the backend `fieldName` from a display name using the same camelCase
   * + strip-non-alphanumeric rule the backend's formatFieldName() helper applies
   * (see Backend/src/modules/attribute/attribute.schema.ts). The UI computes
   * fieldName on the client before POST, so the API client must do the same.
   */
  const toFieldName = (name) =>
    name
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\b\w/g, (m, i) => (i === 0 ? m.toLowerCase() : m.toUpperCase()))
      .replace(/\s+/g, '');

  /** Standard JSON headers with the authenticated Bearer token. */
  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  // -------------------- Request helpers --------------------

  /**
   * POST /categories — host category setup. Returns the full cy.request chain
   * so the caller can add .then(...) expectations.
   */
  const createCategory = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/categories`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  /**
   * POST /attributes — create a single attribute scoped to the host category.
   * @param {Object} params
   * @param {string} params.name        Display name (must satisfy Joi regex).
   * @param {string} params.type        One of Text/MultiLineText/Number/Email/
   *                                    Url/Decimal/Amount/Percent/List/Boolean.
   * @param {string} [params.entityType='Product']  Always Product in this file.
   * @param {boolean} [params.required=false]       Initial required flag.
   * @param {Object} [params.otherInfo={}]          Extra config (e.g. listOpitons).
   */
  const createAttribute = ({ name, type, entityType = 'Product', required = false, otherInfo = {} }) =>
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
   * PATCH /attributes — update an attribute. IMPORTANT: unlike most REST
   * update endpoints in this codebase, `id` is passed in the request BODY,
   * not on the URL. updatedAt + updatedBy are required by the Joi schema.
   *
   * @param {Object} attr              The attribute row to update (must include
   *                                   id, name, type, fieldName, entityType).
   * @param {Object} overrides         Fields to apply on top: { name?, required?, otherInfo? }.
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

  /** DELETE /attributes/:id — the id here DOES go on the URL. */
  const deleteAttribute = (id) =>
    cy.request({
      method: 'DELETE',
      url: `${baseUrl}/attributes/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  // PATCH /attributes echoes only a status envelope with no data field;
  // verification of the updated row must round-trip through GET /:id.
  const getAttributeById = (id) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/attributes/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  // -------------------- Setup / Teardown --------------------

  /**
   * before(): authenticate against the identity server, then create the
   * host product-only category (allowItems/Variants/VariantItems all false).
   * All attribute tests hang off this single categoryId.
   */
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
    });
    cy.then(() => {
      const catName = `RAM-API-${suffix()}`;
      createCategory({
        name: catName,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        const data = res.body.data || res.body;
        categoryId = data.id;
        expect(categoryId).to.exist;
      });
    });
  });

  /**
   * after(): delete any attributes that survived their test (e.g. failed
   * mid-flow), then delete the host category. Order matters — category
   * delete would 409 if attributes still reference it.
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
   * Produces the 5-test lifecycle block for one attribute data type.
   * Each block isolates its own local `created` variable so the tests chain
   * create → rename → required-on → required-off → delete.
   *
   * @param {string} caseId     SW_ATR_API_<caseId>_NN case numbering (e.g. "241_TEXT")
   * @param {string} uiType     Attribute type string (sent as body.type)
   * @param {Object} [otherInfo] Extra config — for List attributes this must
   *                             carry the backend-spelt key `listOpitons`.
   */
  const crudBlock = (caseId, uiType, otherInfo = {}) => {
    describe(`Product-Only Category - ${uiType} Attribute (SW_ATR_API_${caseId})`, () => {
      let created;
      // Attribute names allow letters, numbers, and spaces only (Joi regex).
      const name = `${uiType} API ${suffix()}`;
      const updated = `${name} Updated`;

      /**
       * _01 CREATE
       *   Steps:
       *     1. POST /attributes with name/type/fieldName/categoryId/Product.
       *     2. Expect 200/201.
       *     3. Assert persisted name/type/categoryId echo the request.
       *     4. Remember the row + add id to cleanup set.
       *   UI mirror: "Add <Type> Attribute" form submit.
       */
      it(`SW_ATR_API_${caseId}_01 - create ${uiType} attribute on product-only category`, () => {
        createAttribute({ name, type: uiType, otherInfo }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          const data = res.body.data || res.body;
          expect(data.name).to.equal(name);
          expect(data.type).to.equal(uiType);
          expect(data.categoryId).to.equal(categoryId);
          created = data;
          createdAttrIds.push(data.id);
        });
      });

      /**
       * _02 RENAME
       *   Steps:
       *     1. PATCH /attributes with overrides.name = "<name> Updated".
       *     2. Expect 200/201 + response.name equals the new value.
       *     3. Sync local `created` so subsequent PATCHes carry the new name.
       *   UI mirror: in-place edit on the attribute row.
       */
      it(`SW_ATR_API_${caseId}_02 - update ${uiType} attribute name`, () => {
        patchAttribute(created, { name: updated }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          getAttributeById(created.id).then((getRes) => {
            const row = getRes.body.data || getRes.body;
            expect(row.name).to.equal(updated);
          });
          created = { ...created, name: updated };
        });
      });

      /**
       * _03 REQUIRED ON
       *   Steps:
       *     1. PATCH with required=true.
       *     2. Expect response.required=true.
       *   UI mirror: toggling the "Required" switch to ON in the attribute row.
       */
      it(`SW_ATR_API_${caseId}_03 - toggle required on`, () => {
        patchAttribute(created, { required: true }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          getAttributeById(created.id).then((getRes) => {
            expect((getRes.body.data || getRes.body).required).to.equal(true);
          });
          created = { ...created, required: true };
        });
      });

      /**
       * _04 REQUIRED OFF
       *   Steps:
       *     1. PATCH with required=false.
       *     2. Expect response.required=false.
       *   UI mirror: toggling the "Required" switch back to OFF.
       */
      it(`SW_ATR_API_${caseId}_04 - toggle required off`, () => {
        patchAttribute(created, { required: false }).then((res) => {
          expect(res.status).to.be.oneOf([200, 201]);
          getAttributeById(created.id).then((getRes) => {
            expect((getRes.body.data || getRes.body).required).to.equal(false);
          });
          created = { ...created, required: false };
        });
      });

      /**
       * _05 DELETE
       *   Steps:
       *     1. DELETE /attributes/:id.
       *     2. Expect 200/201/204.
       *     3. Remove the id from the cleanup set so after() doesn't double-delete.
       *   UI mirror: row "Delete" icon + confirm dialog.
       */
      it(`SW_ATR_API_${caseId}_05 - delete ${uiType} attribute`, () => {
        deleteAttribute(created.id).then((res) => {
          expect(res.status).to.be.oneOf([200, 201, 204]);
          const idx = createdAttrIds.indexOf(created.id);
          if (idx >= 0) createdAttrIds.splice(idx, 1);
        });
      });
    });
  };

  // -------------------- Blocks mapped to UI cases --------------------
  // Each crudBlock() invocation = 5 tests. The case-id prefix roughly tracks
  // the UI numbering (SW_ATR_241 – SW_ATR_297). List attributes must pass
  // `listOpitons` (backend typo) in otherInfo or Joi validation will 400.
  crudBlock('241_TEXT', 'Text');
  crudBlock('246_MLT', 'MultiLineText');
  crudBlock('251_NUM', 'Number');
  crudBlock('256_EMAIL', 'Email');
  crudBlock('261_URL', 'Url');
  crudBlock('266_DEC', 'Decimal');
  crudBlock('271_AMT', 'Amount');
  crudBlock('276_PCT', 'Percent');
  crudBlock('281_LIST', 'List', { listOpitons: [{ label: 'Corsair' }, { label: 'Kingston' }] });
  crudBlock('291_BOOL', 'Boolean');

  // -------------------- Negative validation --------------------

  describe('Product-Only Category - Negative validation', () => {
    /**
     * NEG_01: empty name fails Joi .required() / pattern validation → 400.
     * Mirrors UI "Name is required" toast/inline error.
     */
    it('SW_ATR_API_NEG_01 - empty attribute name → 400', () => {
      createAttribute({ name: '', type: 'Text' }).then((res) => expect(res.status).to.equal(400));
    });

    /**
     * NEG_02: special-character-only name fails the Joi /^[a-zA-Z0-9\s]+$/
     * pattern → 400. Mirrors UI "Name can only contain letters, numbers and
     * spaces" inline validation.
     */
    it('SW_ATR_API_NEG_02 - attribute name with special chars → 400', () => {
      createAttribute({ name: '@@@###', type: 'Text' }).then((res) => expect(res.status).to.equal(400));
    });

    /**
     * NEG_03: POST with no Authorization header bypasses the global AuthGuard
     * check and returns 401 (UnauthorizedExceptionFilter). Mirrors "session
     * expired — redirected to login" UX.
     */
    it('SW_ATR_API_NEG_03 - unauthenticated POST /attributes → 401', () => {
      cy.request({
        method: 'POST',
        url: `${baseUrl}/attributes`,
        headers: { 'Content-Type': 'application/json' },
        failOnStatusCode: false,
        body: {
          name: uniqueName('NoAuth'),
          type: 'Text',
          fieldName: 'noauthx',
          categoryId,
          editable: true,
          required: false,
        },
      }).then((res) => expect(res.status).to.equal(401));
    });
  });

  // UI-only (not asserted): modal titles, "Attribute created." toast copy,
  // tab visibility (Product-only category hides the Item tab), list column
  // chip rendering, Required toggle animation.
});
