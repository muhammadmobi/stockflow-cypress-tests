/**
 * Scan Configuration API Tests
 * ---------------------------------------------
 * Mirrors cypress/e2e/Configuration/08-scan-config-tests.cy.js.
 *
 * The UI "Scan Config" page toggles which attributes are used for
 * scan identification. Persistence is via /view-configs with type=scanView.
 *
 * Backend shape (see Backend/src/modules/view-configs/view-configs.service.ts):
 *   columns is a string[] — each entry is an existing attribute name.
 *   The UI's {field, label, checked} model is a frontend-only view; only
 *   the names of checked attributes are persisted.
 *
 * Endpoints exercised:
 *   GET    /view-configs?type=scanView   - fetch current scanView config
 *   POST   /view-configs                 - create if missing
 *   PATCH  /view-configs/:id             - update columns (checked set)
 *
 * UI-only cases (checkbox click, "Scan config updated" toast, modal
 * heading) SKIPPED.
 */

describe('Scan Configuration API', () => {
  let authToken;
  let baseUrl;
  let scanConfigId;
  let originalColumns;
  let seedColumn;

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const getScanConfig = () =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/view-configs`,
      qs: { type: 'scanView', page: 1, page_size: 50 },
      headers: headers(),
      failOnStatusCode: false,
    });

  const patchScanConfig = (id, body) =>
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/view-configs/${id}`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  const postScanConfig = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/view-configs`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  const listAttributes = () =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/attributes`,
      qs: { page: 1, page_size: 50, all: 'true' },
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
    return list.find((r) => r && r.type === 'scanView') || list[0] || null;
  };

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.login().then((token) => {
      authToken = token;
    });

    // Pick one real attribute name to use as a seed column for toggle tests.
    cy.then(() => {
      listAttributes().then((res) => {
        const body = res.body || {};
        const list = body?.data?.list || body?.data?.items || [];
        const first = list.find((a) => a && a.name);
        seedColumn = first ? first.name : 'PO. Number';
      });
    });

    // Ensure a scanView row exists; create one if the env is pristine.
    cy.then(() => {
      getScanConfig().then((res) => {
        expect(res.status).to.equal(200);
        const row = extractRow(res);
        if (row) {
          scanConfigId = row.id;
          originalColumns = Array.isArray(row.columns) ? [...row.columns] : [];
        } else {
          postScanConfig({
            type: 'scanView',
            columns: [seedColumn],
          }).then((createRes) => {
            expect(createRes.status).to.be.oneOf([200, 201]);
            const data = createRes.body.data || createRes.body;
            scanConfigId = data.id;
            originalColumns = Array.isArray(data.columns) ? [...data.columns] : [];
          });
        }
      });
    });
  });

  after(() => {
    // Restore original columns so the suite is re-runnable.
    if (scanConfigId && originalColumns) {
      patchScanConfig(scanConfigId, {
        type: 'scanView',
        columns: originalColumns,
      });
    }
  });

  it('SCAN_CFG_API_001 - GET /view-configs?type=scanView returns a scanView row', () => {
    getScanConfig().then((res) => {
      expect(res.status).to.equal(200);
      const row = extractRow(res);
      expect(row).to.exist;
      expect(row.type).to.equal('scanView');
      expect(Array.isArray(row.columns)).to.equal(true);
    });
  });

  it('SCAN_CFG_API_002 - PATCH with empty columns persists (all off)', () => {
    patchScanConfig(scanConfigId, { type: 'scanView', columns: [] }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      getScanConfig().then((getRes) => {
        const row = extractRow(getRes);
        expect(row.columns).to.deep.equal([]);
      });
    });
  });

  it('SCAN_CFG_API_003 - PATCH with seed column persists (one on)', () => {
    patchScanConfig(scanConfigId, { type: 'scanView', columns: [seedColumn] }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      getScanConfig().then((getRes) => {
        const row = extractRow(getRes);
        expect(row.columns).to.include(seedColumn);
      });
    });
  });

  it('SCAN_CFG_API_004 - PATCH restoring original columns round-trips cleanly', () => {
    patchScanConfig(scanConfigId, {
      type: 'scanView',
      columns: originalColumns,
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      getScanConfig().then((getRes) => {
        const row = extractRow(getRes);
        expect(row.columns).to.deep.equal(originalColumns);
      });
    });
  });

  it('SCAN_CFG_API_005 - PATCH with unknown column name is rejected', () => {
    patchScanConfig(scanConfigId, {
      type: 'scanView',
      columns: ['__nonexistent_attribute__'],
    }).then((res) => {
      // Backend returns 500 "Invalid Column Name - ..." OR envelope {success:false}.
      const ok = res.status >= 400 || (res.body && res.body.success === false);
      expect(ok, 'unknown column rejected').to.equal(true);
    });
  });

  it('SCAN_CFG_API_NEG_01 - PATCH missing columns returns 400', () => {
    patchScanConfig(scanConfigId, { type: 'scanView' }).then((res) =>
      expect(res.status).to.equal(400),
    );
  });

  it('SCAN_CFG_API_NEG_02 - unauthenticated PATCH /view-configs/:id → 401', () => {
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/view-configs/${scanConfigId}`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      body: { type: 'scanView', columns: [] },
    }).then((res) => expect(res.status).to.equal(401));
  });

  // UI-only: checkbox click, "Scan config updated" toast, page title,
  // "Update" button presence.
});
