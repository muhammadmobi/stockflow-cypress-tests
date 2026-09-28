/**
 * BrainBox Configuration API Tests
 * ---------------------------------------------
 * Mirrors cypress/e2e/Configuration/09-BrainBoxConfigTests.cy.js.
 *
 * The "BrainBox Configuration" page persists its settings in /configs with:
 *   type=brainboxConfig
 *   name=brainboxConfig
 *   userID=global
 *   configJson: {
 *     poNumber: string,
 *     categoryId: number,
 *     mapping: Record<payloadPath, attributeFieldName>,
 *     payloadFields: Array<{ path: string }>,
 *     defaultCost: number,
 *   }
 *
 * Endpoints exercised:
 *   GET   /configs?type=brainboxConfig&name=brainboxConfig&userId=global
 *   POST  /configs
 *   PATCH /configs/:id
 *   DELETE /configs/:id   (cleanup for standalone test configs)
 *
 * UI-only cases (dropdown rendering, "Adding Payload Field" UI,
 * duplicate-row toast, "BrainBox configuration saved." toast) SKIPPED.
 */

describe('BrainBox Configuration API', () => {
  let authToken;
  let baseUrl;
  let configId;
  let originalConfigJson;
  const createdAuxIds = [];

  const CONFIG_NAME = 'brainboxConfig';
  const CONFIG_TYPE = 'brainboxConfig';
  const GLOBAL_USER_ID = 'global';

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const getBrainBox = () =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/configs`,
      qs: { type: CONFIG_TYPE, name: CONFIG_NAME, userId: GLOBAL_USER_ID },
      headers: headers(),
      failOnStatusCode: false,
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

  const deleteConfig = (id) =>
    cy.request({
      method: 'DELETE',
      url: `${baseUrl}/configs/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  const extractRow = (res) => {
    const body = res.body || {};
    const list =
      body?.data?.list ||
      body?.data?.items ||
      body?.data?.results ||
      (Array.isArray(body?.data) ? body.data : null) ||
      [];
    return list[0] || null;
  };

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
    });
    // Snapshot existing brainboxConfig so we can restore it in after().
    cy.then(() => {
      getBrainBox().then((res) => {
        expect(res.status).to.equal(200);
        const row = extractRow(res);
        if (row) {
          configId = row.id;
          originalConfigJson = JSON.parse(JSON.stringify(row.configJson || {}));
        }
      });
    });
  });

  after(() => {
    // Restore original state if one existed; otherwise delete any test row.
    if (configId && originalConfigJson) {
      patchConfig(configId, {
        name: CONFIG_NAME,
        type: CONFIG_TYPE,
        configJson: originalConfigJson,
      });
    }
    createdAuxIds.forEach((id) => deleteConfig(id));
  });

  it('BRBOX_CONF_API_001 - GET /configs returns (possibly empty) list', () => {
    getBrainBox().then((res) => {
      expect(res.status).to.equal(200);
      // No assertion on list length — the suite must work on a fresh env.
    });
  });

  it('BRBOX_CONF_API_002 - POST /configs creates a brainbox config when none exists', () => {
    getBrainBox().then((res) => {
      const row = extractRow(res);
      if (row) {
        cy.log(`Existing brainboxConfig id=${row.id} found — PATCH path will be covered below.`);
        return;
      }
      postConfig({
        name: CONFIG_NAME,
        type: CONFIG_TYPE,
        userID: GLOBAL_USER_ID,
        configJson: {
          poNumber: 'PO-API-0001',
          categoryId: 1,
          mapping: { 'items[0].sku': 'model' },
          payloadFields: [{ path: 'items[0].sku' }],
          defaultCost: 0,
        },
      }).then((createRes) => {
        expect(createRes.status).to.be.oneOf([200, 201]);
        const data = createRes.body.data || createRes.body;
        expect(data.id).to.exist;
        configId = data.id;
      });
    });
  });

  it('BRBOX_CONF_API_003 - PATCH /configs/:id updates poNumber and categoryId', () => {
    if (!configId) {
      cy.log('No config id seeded — skipping PATCH.');
      return;
    }
    patchConfig(configId, {
      name: CONFIG_NAME,
      type: CONFIG_TYPE,
      configJson: {
        poNumber: 'PO-API-0050',
        categoryId: 2,
        mapping: {},
        payloadFields: [],
        defaultCost: 0,
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
  });

  it('BRBOX_CONF_API_004 - PATCH persists payloadFields array', () => {
    if (!configId) return;
    const payloadFields = [
      { path: 'payload.sku' },
      { path: 'payload.serial' },
      { path: 'payload.qty' },
    ];
    patchConfig(configId, {
      name: CONFIG_NAME,
      type: CONFIG_TYPE,
      configJson: {
        poNumber: 'PO-API-0050',
        categoryId: 2,
        mapping: {
          'payload.sku': 'model',
          'payload.serial': 'serialNumber',
          'payload.qty': 'quantity',
        },
        payloadFields,
        defaultCost: 0,
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      getBrainBox().then((getRes) => {
        const row = extractRow(getRes);
        expect(row.configJson.payloadFields).to.have.length(3);
        expect(row.configJson.mapping['payload.sku']).to.equal('model');
      });
    });
  });

  it('BRBOX_CONF_API_005 - PATCH with defaultCost persists numeric value', () => {
    if (!configId) return;
    patchConfig(configId, {
      name: CONFIG_NAME,
      type: CONFIG_TYPE,
      configJson: {
        poNumber: 'PO-API-0050',
        categoryId: 2,
        mapping: {},
        payloadFields: [],
        defaultCost: 42.5,
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      getBrainBox().then((getRes) => {
        const row = extractRow(getRes);
        expect(Number(row.configJson.defaultCost)).to.equal(42.5);
      });
    });
  });

  it('BRBOX_CONF_API_006 - duplicate payload field paths still persist (string array shape)', () => {
    if (!configId) return;
    // The frontend enforces uniqueness; the API accepts whatever is sent.
    const dupFields = [{ path: 'payload.sku' }, { path: 'payload.sku' }];
    patchConfig(configId, {
      name: CONFIG_NAME,
      type: CONFIG_TYPE,
      configJson: {
        poNumber: 'PO-API-0050',
        categoryId: 2,
        mapping: {},
        payloadFields: dupFields,
        defaultCost: 0,
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      getBrainBox().then((getRes) => {
        const row = extractRow(getRes);
        expect(row.configJson.payloadFields).to.have.length(2);
      });
    });
  });

  it('BRBOX_CONF_API_007 - import-mapping-templates list endpoint responds 200', () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/import-mapping-templates`,
      headers: headers(),
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(200);
    });
  });

  it('BRBOX_CONF_API_NEG_01 - unauthenticated POST /configs → 401', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/configs`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      body: {
        name: CONFIG_NAME,
        type: CONFIG_TYPE,
        userID: GLOBAL_USER_ID,
        configJson: {},
      },
    }).then((res) => expect(res.status).to.equal(401));
  });

  it('BRBOX_CONF_API_NEG_02 - PATCH /configs/:id unknown id → 4xx', () => {
    patchConfig(999999999, {
      name: CONFIG_NAME,
      type: CONFIG_TYPE,
      configJson: {},
    }).then((res) => expect(res.status).to.be.oneOf([400, 404]));
  });

  // UI-only: PO/category dropdown rendering, "Adding Payload Field" UI,
  // "Payload field names must be unique" toast, "BrainBox configuration saved." toast.
});
