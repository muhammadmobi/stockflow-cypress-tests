/**
 * =============================================================================
 *  Common Attribute API Tests
 * =============================================================================
 *  Maps to UI suite : cypress/e2e/Configuration/01-common-attribute-tests.cy.js
 *  Backend module   : Backend/src/modules/attribute
 *  Auth             : Bearer JWT obtained via POST {IDENTITY}/auth/login
 *
 *  Endpoints exercised
 *  -------------------
 *   POST   /attributes           - create a new attribute
 *   PATCH  /attributes           - update an attribute (id in body, NOT in URL)
 *   GET    /attributes?all=true  - list attributes (used for existence asserts)
 *   GET    /attributes/:id       - read single attribute
 *   DELETE /attributes/:id       - delete an attribute
 *
 *  Joi schema (createAttributeSchema) requires:
 *    name, type, fieldName, editable, required
 *  Joi schema (updateAttributeSchema) additionally requires:
 *    id, updatedAt, updatedBy
 *
 *  A "common" attribute is one where `categoryId` is NOT provided — it applies
 *  to every category. The `entityType` (Product|Item) determines whether the
 *  attribute is shown on the product-level or item-level tab.
 *
 *  Per-test flow
 *  -------------
 *   1. before()   — obtain JWT via identity-server.
 *   2. Each test  — issue the target request(s), assert status + body shape.
 *   3. after()    — DELETE every attribute created during the run so the
 *                  suite is fully re-runnable against a shared QA env.
 *
 *  UI-only checks NOT covered here (by design — per user approval):
 *    • "Attribute Created" / "Attribute updated" toast copy
 *    • Add/Edit modal title, field rendering, V-Lookup toggle visibility
 *    • Attribute-list column ordering / required "Yes/No" label rendering
 *    • Delete-confirmation dialog
 * =============================================================================
 */

describe('Common Attribute API - CRUD across all 10 data types', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Shared state
  // ──────────────────────────────────────────────────────────────────────────
  let authToken;                 // JWT populated in before()
  let baseUrl;                   // API_BASE_URL from cypress.env
  const createdIds = [];         // every attribute id created — cleaned in after()

  // ──────────────────────────────────────────────────────────────────────────
  // Utility helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Derive the backend `fieldName` from a display name using the same
   * camelCase + strip-non-alphanumeric rule the backend's formatFieldName()
   * applies (see Backend/src/modules/attribute/attribute.schema.ts).
   */
  const toFieldName = (name) =>
    name
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\b\w/g, (m, i) => (i === 0 ? m.toLowerCase() : m.toUpperCase()))
      .replace(/\s+/g, '');

  /** Produce a unique human-friendly name so tests never collide in shared QA. */
  const uniqueName = (prefix) =>
    `${prefix} ${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

  /** Standard auth + JSON headers used on every mutating call. */
  const baseHeaders = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  /**
   * Issue POST /attributes with a minimal valid body.
   * @param {Object} params
   * @param {string} params.name       Display name (must match /^[a-zA-Z0-9\s]+$/ and be <= 50 chars).
   * @param {string} params.type       One of: Text, MultiLineText, Number, Email, Url, Decimal, Amount, Percent, List, Boolean.
   * @param {string} [params.entityType='Product']  Product or Item.
   * @param {boolean} [params.required=false]
   * @param {Object} [params.otherInfo={}]  Extra metadata (e.g. list options).
   */
  const createCommonAttribute = ({
    name,
    type,
    entityType = 'Product',
    required = false,
    otherInfo = {},
  }) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: baseHeaders(),
      failOnStatusCode: false,
      body: {
        name,
        type,
        fieldName: toFieldName(name),
        editable: true,
        required,
        entityType,
        otherInfo,
      },
    });

  /**
   * Issue PATCH /attributes. Note that the update schema places the `id` in
   * the BODY, not the URL — this differs from typical REST conventions and is
   * the single most common source of 400s when hand-writing requests.
   */
  const patchAttribute = (attr, overrides) =>
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/attributes`,
      headers: baseHeaders(),
      failOnStatusCode: false,
      body: {
        id: attr.id,
        name: overrides.name ?? attr.name,
        type: attr.type,
        fieldName: attr.fieldName,
        editable: attr.editable ?? true,
        required: overrides.required ?? attr.required ?? false,
        otherInfo: overrides.otherInfo ?? attr.otherInfo ?? {},
        entityType: attr.entityType,
        updatedAt: new Date().toISOString(), // required by updateAttributeSchema
        updatedBy: 'api-test',                // required by updateAttributeSchema
      },
    });

  /** Issue DELETE /attributes/:id. 200/201/204 all accepted. */
  const deleteAttribute = (id) =>
    cy.request({
      method: 'DELETE',
      url: `${baseUrl}/attributes/${id}`,
      headers: baseHeaders(),
      failOnStatusCode: false,
    });

  /** Issue GET /attributes with optional query-string filters. */
  const getAttributes = (qs = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/attributes`,
      qs,
      headers: baseHeaders(),
      failOnStatusCode: false,
    });

  /**
   * Issue GET /attributes/:id. The backend PATCH /attributes response is
   * intentionally minimal ({statusCode, success, error}) with no echoed
   * row, so verification of updated fields must round-trip via GET.
   */
  const getAttributeById = (id) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/attributes/${id}`,
      headers: baseHeaders(),
      failOnStatusCode: false,
    });

  /**
   * The attribute list response shape varies across deployments because of
   * interceptor wrapping. Try every plausible path and return the first
   * array found so assertions do not hinge on a specific wrapper version.
   */
  const extractList = (res) => {
    const body = res.body || {};
    return (
      body?.data?.list ||
      body?.data?.items ||
      body?.data?.results ||
      body?.data?.data ||
      (Array.isArray(body?.data) ? body.data : null) ||
      body?.items ||
      body?.results ||
      (Array.isArray(body) ? body : []) ||
      []
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  before(() => {
    // Step 1: resolve config from cypress.env (set in cypress.config.js).
    baseUrl = Cypress.env('API_BASE_URL');
    const identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');

    // Step 2: identity-server login — must return 200 + accessToken.
    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: { username: Cypress.env('email'), password: Cypress.env('pass') },
    }).then((res) => {
      expect(res.status, 'identity /auth/login returned 200').to.equal(200);
      authToken = res.body.accessToken || res.body.token;
      expect(authToken, 'JWT token is present in login response').to.exist;
    });
  });

  after(() => {
    // Re-runnable cleanup — remove every attribute this spec created.
    createdIds.forEach((id) => deleteAttribute(id));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Re-usable block that generates 3 tests per (type, entityType) pair:
  //   _CREATE   - POST then PATCH (rename)
  //   _REQUIRED - toggle required=true then required=false via PATCH
  //   _DELETE   - POST then DELETE, then GET to confirm it is gone
  // This mirrors the SW_ATR_01..SW_ATR_110 pattern of the UI suite where
  // each data type has the same 5-step CRUD script.
  // ──────────────────────────────────────────────────────────────────────────

  const runCrudFor = (typeKey, uiType, entityType, options = {}) => {
    /**
     * SW_ATR_API_<typeKey>_CREATE
     * ---------------------------
     * Steps:
     *   1. POST /attributes with a unique name and the given type/entityType.
     *      Expect 200/201 and echoed body fields (name, type).
     *   2. PATCH /attributes renaming to "<name> Updated".
     *      Expect 200/201 and the new name in the body.
     * Asserts both the create AND rename paths because UI flows always use
     * them together (tests SW_ATR_01 + SW_ATR_02 in the UI suite).
     */
    it(`SW_ATR_API_${typeKey}_CREATE - create common ${entityType.toLowerCase()} ${uiType} attribute`, () => {
      const name = uniqueName(`AutoAPI ${uiType} ${entityType}`);
      createCommonAttribute({ name, type: uiType, entityType, otherInfo: options.otherInfo }).then(
        (res) => {
          expect(res.status, `POST /attributes status for ${uiType}`).to.be.oneOf([200, 201]);
          const data = res.body.data || res.body;
          expect(data.name, 'echoed name matches request').to.equal(name);
          expect(data.type, 'echoed type matches request').to.equal(uiType);
          expect(data.id, 'response includes generated id').to.exist;
          createdIds.push(data.id);

          // Rename flow (mirrors UI's "update attribute name" step).
          // PATCH /attributes returns a status-only envelope — verify the
          // rename via a follow-up GET /attributes/:id.
          const updatedName = `${name} Updated`;
          patchAttribute(data, { name: updatedName }).then((upd) => {
            expect(upd.status, 'PATCH /attributes status').to.be.oneOf([200, 201]);
            getAttributeById(data.id).then((getRes) => {
              const row = getRes.body.data || getRes.body;
              expect(row.name, 'renamed value visible on next GET').to.equal(updatedName);
            });
          });
        },
      );
    });

    /**
     * SW_ATR_API_<typeKey>_REQUIRED
     * -----------------------------
     * Steps:
     *   1. Create a fresh attribute with required=false.
     *   2. PATCH required=true — assert the echoed value.
     *   3. PATCH required=false — assert the echoed value again.
     * Equivalent to UI tests that click the "Required" checkbox twice.
     */
    it(`SW_ATR_API_${typeKey}_REQUIRED - toggle required on/off for ${uiType} ${entityType}`, () => {
      const name = uniqueName(`AutoAPI Req ${uiType} ${entityType}`);
      createCommonAttribute({ name, type: uiType, entityType, required: false }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        const data = res.body.data || res.body;
        createdIds.push(data.id);

        // Toggle ON — PATCH response is status-only; verify via GET.
        patchAttribute(data, { required: true }).then((enabled) => {
          expect(enabled.status, 'enable required PATCH returns 200/201').to.be.oneOf([200, 201]);
          getAttributeById(data.id).then((getOn) => {
            const rowOn = getOn.body.data || getOn.body;
            expect(rowOn.required, 'required is now true').to.equal(true);

            // Toggle OFF (pass the updated shape so backend validation sees
            // the latest `required` state).
            patchAttribute({ ...data, required: true }, { required: false }).then((disabled) => {
              expect(disabled.status).to.be.oneOf([200, 201]);
              getAttributeById(data.id).then((getOff) => {
                const rowOff = getOff.body.data || getOff.body;
                expect(rowOff.required, 'required is now false').to.equal(false);
              });
            });
          });
        });
      });
    });

    /**
     * SW_ATR_API_<typeKey>_DELETE
     * ---------------------------
     * Steps:
     *   1. Create a fresh attribute.
     *   2. DELETE /attributes/:id — expect 200/201/204.
     *   3. GET /attributes?name=... and confirm the name is absent.
     * Mirrors the UI's "Delete Attribute" + re-scan-list assertion.
     */
    it(`SW_ATR_API_${typeKey}_DELETE - delete common ${entityType.toLowerCase()} ${uiType} attribute`, () => {
      const name = uniqueName(`AutoAPI Del ${uiType} ${entityType}`);
      createCommonAttribute({ name, type: uiType, entityType }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        const data = res.body.data || res.body;
        deleteAttribute(data.id).then((delRes) => {
          expect(delRes.status, 'DELETE /attributes/:id is accepted').to.be.oneOf([200, 201, 204]);
          getAttributes({ name, all: 'true' }).then((listRes) => {
            const list = extractList(listRes);
            expect(
              list.find((a) => a && a.name === name),
              `attribute "${name}" is absent from list after delete`,
            ).to.be.undefined;
          });
        });
      });
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Common Product Attributes (entityType=Product, no categoryId)
  // ---------------------------------------------------------------------------
  // SW_ATR_API_01..10 — each block covers create/update, required toggle,
  // delete for one data type. The UI counterparts SW_ATR_01..SW_ATR_56 run
  // the same five-step CRUD script per type.
  // ──────────────────────────────────────────────────────────────────────────
  runCrudFor('01_TEXT_P', 'Text', 'Product');
  runCrudFor('02_MLT_P', 'MultiLineText', 'Product');
  runCrudFor('03_NUM_P', 'Number', 'Product');
  runCrudFor('04_EMAIL_P', 'Email', 'Product');
  runCrudFor('05_URL_P', 'Url', 'Product');
  runCrudFor('06_DEC_P', 'Decimal', 'Product');
  runCrudFor('07_AMT_P', 'Amount', 'Product');
  runCrudFor('08_PCT_P', 'Percent', 'Product');
  runCrudFor(
    '09_LIST_P',
    'List',
    'Product',
    // List attributes require otherInfo.listOpitons (note: typo preserved
    // — this is the ACTUAL field name used across the backend, see
    // customListValidator in attribute.schema.ts).
    { otherInfo: { listOpitons: [{ label: 'SSD' }, { label: 'HDD' }] } },
  );
  runCrudFor('10_BOOL_P', 'Boolean', 'Product');

  // ──────────────────────────────────────────────────────────────────────────
  // Common Item Attributes (entityType=Item, no categoryId)
  // SW_ATR_API_11..20 — mirrors UI cases SW_ATR_57..SW_ATR_110.
  // ──────────────────────────────────────────────────────────────────────────
  runCrudFor('11_TEXT_I', 'Text', 'Item');
  runCrudFor('12_MLT_I', 'MultiLineText', 'Item');
  runCrudFor('13_NUM_I', 'Number', 'Item');
  runCrudFor('14_EMAIL_I', 'Email', 'Item');
  runCrudFor('15_URL_I', 'Url', 'Item');
  runCrudFor('16_DEC_I', 'Decimal', 'Item');
  runCrudFor('17_AMT_I', 'Amount', 'Item');
  runCrudFor('18_PCT_I', 'Percent', 'Item');
  runCrudFor('19_LIST_I', 'List', 'Item', {
    otherInfo: { listOpitons: [{ label: 'HR' }, { label: 'IT' }] },
  });
  runCrudFor('20_BOOL_I', 'Boolean', 'Item');

  // ──────────────────────────────────────────────────────────────────────────
  // Negative / validation cases
  // These assert the Joi validation layer (JoiValidationPipe) and AuthGuard.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW_ATR_API_NEG_01 - Reject empty name
   * Body: name="" violates the min(1) constraint in createAttributeSchema.
   * Expected: 400 BadRequest.
   */
  it('SW_ATR_API_NEG_01 - rejects empty name with 400', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: baseHeaders(),
      failOnStatusCode: false,
      body: { name: '', type: 'Text', fieldName: 'x', editable: true, required: false },
    }).then((res) => expect(res.status).to.equal(400));
  });

  /**
   * SW_ATR_API_NEG_02 - Reject special characters in name
   * The name regex in the schema is /^[a-zA-Z0-9\s]+$/. Submitting "@#$%^&*"
   * must produce 400. Mirrors the UI's "specialCharValidationMsg" assertion.
   */
  it('SW_ATR_API_NEG_02 - rejects name with special characters (regex violation)', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: baseHeaders(),
      failOnStatusCode: false,
      body: {
        name: '@#$%^&*',
        type: 'Text',
        fieldName: 'bad',
        editable: true,
        required: false,
      },
    }).then((res) => expect(res.status).to.equal(400));
  });

  /**
   * SW_ATR_API_NEG_03 - Reject missing required fields
   * Omits type, fieldName, editable, required — all of which are .required()
   * on the schema. Validation must short-circuit at the pipe.
   */
  it('SW_ATR_API_NEG_03 - rejects missing required fields with 400', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: baseHeaders(),
      failOnStatusCode: false,
      body: { name: 'NoFieldName' },
    }).then((res) => expect(res.status).to.equal(400));
  });

  /**
   * SW_ATR_API_NEG_04 - AuthGuard on POST /attributes
   * The controller decorates @Post() with @UseGuards(AuthGuard). Without a
   * Bearer token the guard must reject with 401 before hitting the schema.
   */
  it('SW_ATR_API_NEG_04 - unauthenticated POST /attributes → 401', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/attributes`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      body: {
        name: uniqueName('NoAuth'),
        type: 'Text',
        fieldName: 'noAuthField',
        editable: true,
        required: false,
      },
    }).then((res) => expect(res.status).to.equal(401));
  });

  /**
   * SW_ATR_API_NEG_05 - AuthGuard on DELETE /attributes/:id
   * Verifies the same guard protects the DELETE route. The id 999999999 is
   * irrelevant because auth check runs before id lookup.
   */
  it('SW_ATR_API_NEG_05 - unauthenticated DELETE /attributes/:id → 401', () => {
    cy.request({
      method: 'DELETE',
      url: `${baseUrl}/attributes/999999999`,
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.equal(401));
  });

  // UI-only (skipped — see header): modal titles, toast copy, V-Lookup
  // toggle rendering, list column visibility & ordering.
});
