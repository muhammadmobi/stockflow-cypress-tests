import data from '../fixtures/brainBoxHardwareAPI.json';

/**
 * BrainBoxHardwareApiHelper
 * --------------------------
 * Request helpers and data utilities for the BrainBox hardware stock-in/out
 * API tests.
 *
 * Endpoints covered:
 *   POST /incoming-items/hardware-stock-in
 *   POST /incoming-items/hardware-stock-out
 *
 * Both endpoints require AuthGuard and depend on a valid BrainBox config
 * (type=brainboxConfig, name=brainboxConfig, userId=global) that provides:
 *   - poNumber    : the PO to stock items against
 *   - categoryId  : the category for stocked items
 *   - mapping     : Record<payloadPath, attributeFieldName>  — must include an
 *                   entry whose value is "serialNumber"
 */
class BrainBoxHardwareApiHelper {
  constructor() {
    this.data = data;
    this.baseUrl = Cypress.env('API_BASE_URL');
    // Set by ensureSerialMapping() to the brainboxConfig row AS FOUND, so the
    // suite can put the shared global row back in after(). null when the suite
    // never had to provision anything (the common case).
    this.provisionedConfigSnapshot = null;
  }

  // ── Request headers ─────────────────────────────────────────────────────────

  headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Suite bootstrap ──────────────────────────────────────────────────────────

  /**
   * Bootstrap auth tokens and verify the backend has a live brainboxConfig row.
   *
   * Steps:
   *  1. Authenticate admin (and worker if available) against the identity server.
   *  2. Call GET /configs?type=brainboxConfig&name=brainboxConfig&userId=global to
   *     verify the backend environment is actually configured.
   *  3. If no row is found, or the row's mapping contains no serialNumber entry,
   *     return { configRow: null, serialMapping: null } so every test that guards
   *     with `if (!serialMapping) this.skip()` will skip cleanly instead of
   *     failing with a confusing API error.
   *
   * Sets Cypress.env('bbApiAdminToken') and (optionally)
   * Cypress.env('bbApiWorkerToken') as side-effects.
   *
   * @returns {Cypress.Chainable<{ configRow: object|null, serialMapping: string|null }>}
   */
  setupSuite() {
    return cy.credentials('user').then((worker) => {
      return cy.login().then((adminToken) => {
        expect(adminToken, 'Admin auth token must be returned by Keycloak').to.exist;
        Cypress.env('bbApiAdminToken', adminToken);

        // Worker token is best-effort: the suite still runs admin-only if the
        // worker realm account is not provisioned.
        return cy.login(worker.username, worker.password, {
          optional: true,
        }).then((workerToken) => {
          if (workerToken) Cypress.env('bbApiWorkerToken', workerToken);

          // ── Verify the backend actually has a brainboxConfig row ──────────
          // This is the real prerequisite check. The local fixture is only a
          // reference; if the environment is unconfigured the tests must skip,
          // not fail with a confusing 400/500 from the stock-in endpoint.
          //
          // The row is a SINGLE global record shared with the BrainBox Config
          // UI suite (09-BrainBoxConfigTests.cy.js), whose cleanup helper
          // `apiResetBrainBoxConfig` (cypress/support/Configuration/apiCleanup.js)
          // deliberately resets it to `mapping: {}` so its relative row-count
          // math starts from a deterministic 1-row baseline. That leaves the
          // hardware suites with no serialNumber mapping and every happy-path
          // test silently pending — a green run that stocked nothing.
          //
          // So we self-provision, exactly as the Config suite does for itself:
          // read the row, and if it carries no serial mapping, PATCH one in and
          // re-read. The repair is additive (existing mapping entries and
          // payloadFields are preserved) and harmless to the Config suite, which
          // resets to its own baseline in beforeEach.
          return this.readBrainBoxConfig(adminToken).then((liveRow) => {
            if (!liveRow || !liveRow.configJson) {
              cy.log(
                'BrainBoxHardwareApiHelper.setupSuite: no brainboxConfig row found in the ' +
                'backend — all config-dependent tests will skip.'
              );
              return cy.wrap({ configRow: null, serialMapping: null });
            }

            if (this.findSerialPayloadKey(liveRow.configJson.mapping)) {
              return cy.wrap(this.buildConfigRow(liveRow));
            }

            // Repair ONLY the empty-mapping signature that apiResetBrainBoxConfig
            // leaves behind. A NON-empty mapping that still has no serial entry is
            // the case pending.md Guard 1 describes — the attribute was renamed
            // (e.g. to "Device Serial"), which breaks identity resolution for real
            // BrainBox traffic too. Provisioning over that would turn a live
            // integration defect into a green suite, so it must keep skipping.
            if (Object.keys(liveRow.configJson.mapping || {}).length > 0) {
              cy.log(
                'BrainBoxHardwareApiHelper.setupSuite: brainboxConfig row exists but has no ' +
                'serialNumber mapping entry — all config-dependent tests will skip. The mapping ' +
                'is non-empty, so this is a real misconfiguration, not test pollution: see ' +
                'cypress/qa/testPlans/brainBoxStockOut/pending.md Guard 1.'
              );
              return cy.wrap({ configRow: null, serialMapping: null });
            }

            cy.log(
              'BrainBoxHardwareApiHelper.setupSuite: brainboxConfig mapping is empty (the ' +
              'apiResetBrainBoxConfig baseline) — provisioning ' +
              `"${this.data.serialPayloadKey}" → serialNumber.`
            );
            return this.ensureSerialMapping(liveRow, adminToken).then(() =>
              this.readBrainBoxConfig(adminToken).then((repairedRow) => {
                if (!repairedRow || !this.findSerialPayloadKey(repairedRow.configJson?.mapping)) {
                  cy.log(
                    'BrainBoxHardwareApiHelper.setupSuite: could not provision a serialNumber ' +
                    'mapping — all config-dependent tests will skip.'
                  );
                  return cy.wrap({ configRow: null, serialMapping: null });
                }
                return cy.wrap(this.buildConfigRow(repairedRow));
              })
            );
          });
        });
      });
    });
  }

  // ── brainboxConfig row access ────────────────────────────────────────────────

  /**
   * GET the single global brainboxConfig row, tolerating both the paginated
   * ({ data: { list: [] } }) and flat ({ data: [] }) response shapes.
   *
   * @returns {Cypress.Chainable<object|null>} the raw config row, or null
   */
  readBrainBoxConfig(token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}/configs`,
      headers: this.headers(token),
      qs: {
        type:   this.data.brainboxConfigType,
        name:   this.data.brainboxConfigName,
        userId: this.data.brainboxConfigUserId,
      },
      failOnStatusCode: false,
    }).then((res) => {
      const body = res.body || {};
      const list =
        body?.data?.list ||
        body?.data?.items ||
        body?.data?.results ||
        (Array.isArray(body?.data) ? body.data : null) ||
        [];
      return Array.isArray(list) ? list[0] || null : null;
    });
  }

  /**
   * Find the payload key in a raw mapping whose attribute field is the serial
   * number. The BrainBox Config UI stores attribute FIELD NAMES, so the canonical
   * value is the literal "serialNumber" the backend identity path requires
   * (incoming-item-hardware.service.ts checks `attributeField === 'serialNumber'`);
   * a label-style value such as "Serial Number (Item)" is accepted too, since the
   * suite normalises it before use.
   *
   * @param {Record<string, string>} rawMapping - configJson.mapping
   * @returns {string|null} the payload key, or null when none maps to the serial
   */
  findSerialPayloadKey(rawMapping) {
    const entry = Object.entries(rawMapping || {}).find(([, attributeField]) =>
      /serial\s*number/i.test(String(attributeField))
    );
    return entry ? entry[0] : null;
  }

  /**
   * PATCH a serialNumber mapping into the live brainboxConfig row.
   *
   * Additive by design: existing mapping entries and payloadFields are kept, so
   * this repairs the row without discarding anything another suite depends on.
   * The matching payloadFields entry is added too, keeping the row coherent for
   * the BrainBox Config UI (which renders one row per payload field).
   *
   * @param {object} liveRow - the raw config row from readBrainBoxConfig()
   * @param {string} token   - admin auth token
   */
  ensureSerialMapping(liveRow, token) {
    const serialKey = this.data.serialPayloadKey;
    const configJson = liveRow.configJson || {};
    // apiCleanup.js's rule — "a spec that CHANGES application configuration must
    // put it back" — applies here too: this PATCH mutates the shared global row.
    // Snapshot it so restoreProvisionedConfig() can undo it in after().
    this.provisionedConfigSnapshot = { id: liveRow.id, configJson };
    const payloadFields = Array.isArray(configJson.payloadFields) ? configJson.payloadFields : [];
    const hasField = payloadFields.some((f) => f?.path === serialKey);

    return cy.request({
      method: 'PATCH',
      url: `${this.baseUrl}/configs/${liveRow.id}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      body: {
        name: this.data.brainboxConfigName,
        type: this.data.brainboxConfigType,
        configJson: {
          ...configJson,
          mapping: { ...(configJson.mapping || {}), [serialKey]: 'serialNumber' },
          payloadFields: hasField ? payloadFields : [...payloadFields, { path: serialKey }],
        },
      },
    });
  }

  /**
   * Undo the PATCH ensureSerialMapping() made to the shared global brainboxConfig
   * row, restoring the exact configJson that was found at suite start.
   *
   * A no-op (resolving to null) when nothing was provisioned, which is the normal
   * case — the repair only fires against the empty-mapping signature the BrainBox
   * Config UI suite's cleanup leaves behind. Call it from `after()`.
   *
   * @param {string} token - admin auth token
   */
  restoreProvisionedConfig(token) {
    const snapshot = this.provisionedConfigSnapshot;
    if (!snapshot || !token) return cy.wrap(null);
    // Cleared first so a retried after() cannot re-PATCH a stale snapshot.
    this.provisionedConfigSnapshot = null;
    return cy.request({
      method: 'PATCH',
      url: `${this.baseUrl}/configs/${snapshot.id}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      body: {
        name: this.data.brainboxConfigName,
        type: this.data.brainboxConfigType,
        configJson: snapshot.configJson,
      },
    });
  }

  /**
   * Normalise a raw config row into the { configRow, serialMapping } shape the
   * specs consume.
   *
   * The mapping keeps its `payloadKey -> attributeField` shape. The ONLY
   * normalisation is on the serial entry: an attribute value that looks like
   * "Serial Number (Item)" is collapsed to the canonical key "serialNumber", so
   * buildMinimalPayload() and the skip guards work regardless of how the mapping
   * was authored. Every other attribute field is preserved verbatim, because
   * buildMappedPayload() looks values up BY attribute field name and
   * mappedProductAttributes() filters the same values against the backend's
   * ignoredFields — rewriting them to payload keys breaks both.
   *
   * @param {object} liveRow - the raw config row from readBrainBoxConfig()
   * @returns {{ configRow: object, serialMapping: string }}
   */
  buildConfigRow(liveRow) {
    const rawMapping = liveRow.configJson.mapping || {};
    const mapping = {};
    Object.entries(rawMapping).forEach(([payloadKey, attributeField]) => {
      if (/serial\s*number/i.test(String(attributeField))) {
        mapping[payloadKey] = 'serialNumber';
      } else {
        // Keep the ATTRIBUTE FIELD as the value. buildMappedPayload() and
        // mappedProductAttributes() both read these values as attribute field
        // names; collapsing them to the payload key destroyed that (every
        // product attribute silently dropped, and requireComparableMapping
        // rendered unable to catch the degradation).
        mapping[payloadKey] = attributeField;
      }
    });

    const configRow = {
      configJson: {
        mapping,
        defaultCost: liveRow.configJson.defaultCost,
        poNumber:    liveRow.configJson.poNumber,
        categoryId:  liveRow.configJson.categoryId,
      },
    };
    return { configRow, serialMapping: this.findSerialPayloadKey(rawMapping) };
  }

  // ── Assertion helpers ────────────────────────────────────────────────────────

  /**
   * Assert a 4xx bad-request response with an error indicator in the body.
   *
   * @param {object} res   - Cypress response object
   * @param {string} label - short description prepended to failure messages
   */
  assertBadRequest(res, label) {
    const prefix = label ? `[${label}] ` : '';
    expect(res.status, `${prefix}status must be 4xx`).to.be.within(400, 499);
    const reason = res.body?.message || res.body?.error;
    expect(reason, `${prefix}error indicator must be present in response body`).to.exist;
  }

  /**
   * Assert the canonical hardware-stock-in success response shape and return
   * data[0] for further assertions by the caller.
  */

  // ── Payload builders ─────────────────────────────────────────────────────────

  /**
   * Build the minimal valid payload for a hardware-stock-in or hardware-stock-out
   * call given the config mapping and the serial number to use.
   *
   * Finds the mapping entry whose attribute field value is "serialNumber" and
   * returns a payload object with only that key set.
   * Returns null if no serialNumber mapping is found.
   *
   * @param {Record<string, string>} mapping   - configJson.mapping
   * @param {string}                 serial    - the serial number value to inject
   */
  buildMinimalPayload(mapping, serial) {
    const entry = Object.entries(mapping).find(
      ([, attributeField]) => attributeField === 'serialNumber'
    );
    if (!entry) return null;
    const [payloadKey] = entry;
    return { [payloadKey]: serial };
  }

  /**
   * Build a payload with ALL mapped fields populated.
   * The serialNumber field is set to `serial`; every other mapped field is set
   * to `nonSerialValue`. Handles dot-notation paths:
   *   "spec.ram" → { spec: { ram: nonSerialValue } }
   *
   * @param {Record<string, string>} mapping        - configJson.mapping
   * @param {string}                 serial         - the serial number value
   * @param {*}                      nonSerialValue - value for all non-serial fields
   */
  buildPayloadWithAllMappedFields(mapping, serial, nonSerialValue) {
    const payload = {};
    Object.entries(mapping).forEach(([payloadKey, attributeField]) => {
      const value = attributeField === 'serialNumber' ? serial : nonSerialValue;
      this.setPayloadField(payload, payloadKey, value);
    });
    return payload;
  }

  /**
   * Set a value at a dot-notation path inside an existing payload object.
   * Intermediate objects are created if they do not exist.
   * Useful for building partial-mismatch payloads from a cloned base.
   *
   * @param {object} payload - the object to mutate (in-place)
   * @param {string} dotPath - dot-notation path e.g. "spec.ram"
   * @param {*}      value   - the value to set
   */
  setPayloadField(payload, dotPath, value) {
    const parts = dotPath.split('.');
    let cur = payload;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  /**
   * Generate a unique test serial using the stock-in prefix + current timestamp.
   */
  uniqueStockInSerial() {
    return `${this.data.stockInTestSerialPrefix}${Date.now()}`;
  }

  /**
   * Generate a unique test serial using the stock-out prefix + current timestamp.
   */
  uniqueStockOutSerial() {
    return `${this.data.stockOutTestSerialPrefix}${Date.now()}`;
  }

  // ── Assertion helpers ────────────────────────────────────────────────────────

  /**
   * Assert the canonical hardware-stock-in success response shape and return
   * data[0] for further assertions by the caller.
   *   Checks: data[0] exists; data[0].status === true; data[0].results is a
   *           non-empty array.
   * Note: the caller is responsible for asserting the HTTP status code (2xx).
   *
   * @param {object} res - Cypress response object
   * @returns {object}   - res.body.data[0]
   */
  assertStockInSuccess(res) {
    const result = res.body.data?.[0];
    expect(result, 'stock-in data[0] must be present').to.exist;
    expect(result.status, 'stock-in top-level status must be true').to.be.true;
    expect(result.results, 'stock-in results must be a non-empty array')
      .to.be.an('array').and.have.length.greaterThan(0);
    return result;
  }

  // ── Mapping utilities ────────────────────────────────────────────────────────

  /**
   * Return all non-serial mapping entries (i.e. every entry whose
   * attributeField value is not "serialNumber").
   *
   * @param {Record<string, string>} mapping - configJson.mapping
   * @returns {[string, string][]} Array of [payloadKey, attributeField] pairs
   */
  getNonSerialEntries(mapping) {
    return Object.entries(mapping).filter(([, f]) => f !== 'serialNumber');
  }

  /**
   * Extract and validate configJson.defaultCost.
   * Returns undefined when the value is absent, null, or blank — use as a
   * skip guard: `if (api.getDefaultCost(configJson) === undefined) this.skip()`.
   *
   * @param {object} configJson
   * @returns {number|string|undefined}
   */
  getDefaultCost(configJson) {
    const v = configJson?.defaultCost;
    if (v === undefined || v === null || String(v).trim() === '') return undefined;
    return v;
  }

  // ── Stock-in requests ────────────────────────────────────────────────────────

  /**
   * POST /incoming-items/hardware-stock-in with the admin auth token.
   */
  stockIn(payload, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.stockInEndpoint}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body: payload,
    });
  }

  /**
   * POST /incoming-items/hardware-stock-in with no Authorization header.
   * Used to verify 401 enforcement.
   */
  stockInUnauthenticated(payload) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.stockInEndpoint}`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      timeout: 60000,
      body: payload,
    });
  }

  // ── Stock-out requests ───────────────────────────────────────────────────────

  /**
   * POST /incoming-items/hardware-stock-out with the admin auth token.
   */
  stockOut(payload, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.stockOutEndpoint}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body: payload,
    });
  }

  /**
   * POST /incoming-items/hardware-stock-out with no Authorization header.
   */
  stockOutUnauthenticated(payload) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.stockOutEndpoint}`,
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
      timeout: 60000,
      body: payload,
    });
  }

  // ── Item-status seeding (TC26–TC28, TC37–TC39) ───────────────────────────────

  /**
   * POST /products/mark-status — move seeded items to a non-Available status.
   *
   * ⚠️ The backend allows ONLY Damaged / Disputed / Missing here
   * (`product-stock-out.service.ts` `allowedStatuses`); anything else is
   * rejected `400 Invalid status: <status>`. In particular **Incoming and
   * Reserved cannot be seeded this way** — Reserved comes from work-order
   * allocation (see reserveItemViaWorkOrder), Incoming from the PO check-in flow.
   *
   * @param {string[]} serialNumbers
   * @param {'Damaged'|'Disputed'|'Missing'} status
   * @param {string} poNumber - the BrainBox-configured PO the items sit under
   * @param {string} token
   */
  markItemStatus(serialNumbers, status, poNumber, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.markStatusEndpoint}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body: { serialNumbers, status, poNumber },
    });
  }

  /**
   * GET /incoming-items/hardware-inventory — read-only lookup of what StockWise
   * holds for a serial. Used to VERIFY a seed actually took before asserting on
   * the stock-out: `mark-status` answers 2xx on a no-op, so trusting it blindly
   * would let a test assert the Available contract while claiming to test Damaged.
   */
  readHardwareInventory(serialNumber, token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}${this.data.hardwareInventoryEndpoint}`,
      headers: this.headers(token),
      qs: { serialNumber },
      failOnStatusCode: false,
      timeout: 60000,
    });
  }

  /**
   * Pull the single matching row out of a readHardwareInventory() response.
   *
   * Shape note (easy to get wrong): the controller returns `{ data: [result] }`
   * where `result` is `{ pagination, list }` — so the row is at
   * `body.data[0].list[0]`, NOT `body.data[0]`. Reading `data[0]` yields the
   * pagination wrapper, whose `.status` is undefined; an assertion built on that
   * fails with "expected null to equal 'Damaged'" rather than anything that
   * points at the real cause.
   *
   * @returns {object|null} the item row, or null when nothing matched
   */
  hardwareInventoryRow(res) {
    const list = res.body?.data?.[0]?.list;
    return Array.isArray(list) && list[0] ? list[0] : null;
  }

  /** The item's status from a readHardwareInventory() response, or null. */
  itemStatusFrom(res) {
    return this.hardwareInventoryRow(res)?.status ?? null;
  }

  /** The item's productId (nested under `product.id`), or null. */
  itemProductIdFrom(res) {
    return this.hardwareInventoryRow(res)?.product?.id ?? null;
  }

  /**
   * Move an Available item to **Reserved** the only way the product allows: put it
   * on a work order. `workOrder.service.ts` flips the item to Reserved when it is
   * scanned onto an order.
   *
   * Two traps, both confirmed on QA 2026-08-31:
   *  1. `POST /work-orders` IGNORES a supplied workOrderNumber and generates its
   *     own — always scan the number that comes back in the response.
   *  2. A work order is created **Draft** unless a status is given, and scanning
   *     a Draft order fails `400 cannot be scanned because it's status is Draft`.
   *     So the order is created explicitly `Open`.
   *
   * @returns {Cypress.Chainable<{ workOrderNumber: string|null, id: any, scanStatus: number }>}
   */
  reserveItemViaWorkOrder(serialNumber, productId, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.workOrdersEndpoint}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body: {
        status: 'Open',
        products: [{ productId, name: null, partNumber: null, quantity: 1 }],
      },
    }).then((created) => {
      const wo = created.body?.data;
      const workOrderNumber = wo?.workOrderNumber ?? null;
      const id = wo?.id ?? null;
      if (!workOrderNumber) return cy.wrap({ workOrderNumber: null, id, scanStatus: created.status });

      return cy.request({
        method: 'POST',
        url: `${this.baseUrl}${this.data.workOrdersEndpoint}/scan`,
        headers: this.headers(token),
        failOnStatusCode: false,
        timeout: 60000,
        body: { workOrderNumber, productId, serialNumber },
      }).then((scan) => cy.wrap({ workOrderNumber, id, scanStatus: scan.status }));
    });
  }

  /** POST /work-orders/unscan — release a Reserved item back to Available. */
  unscanItemFromWorkOrder(workOrderNumber, productId, serialNumber, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.workOrdersEndpoint}/unscan`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body: { workOrderNumber, productId, serialNumber },
    });
  }

  /** DELETE /work-orders/:id — remove a throwaway work order in after(). */
  deleteWorkOrder(id, token) {
    return cy.request({
      method: 'DELETE',
      url: `${this.baseUrl}${this.data.workOrdersEndpoint}/${id}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
    });
  }

  // ── Incoming seeding via PO import (TC26) ────────────────────────────────────

  /**
   * Create a throwaway purchase order.
   *
   * TC26 needs its OWN PO rather than the BrainBox-configured one because of the
   * single-import-file-per-PO rule: `POST /excel/upload-inventory`
   * refuses a PO that already has an import file
   * (`PO <n> already has an import file (...). Delete it before uploading a new
   * one.`) and **no API deletes that file** — it lives on the API server's
   * filesystem. Importing into the shared BrainBox PO would therefore work once
   * and then permanently block both this test and any human importing to that PO.
   * A fresh PO number per run sidesteps the rule entirely.
   */
  createPurchaseOrder(poNumber, token, expectedQuantity = 1) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.purchaseOrdersEndpoint}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body: { poNumber, status: 'Open', expectedQuantity, originalQuantity: expectedQuantity },
    });
  }

  /** DELETE /purchase-orders/:poNumber — remove a throwaway PO in after(). */
  deletePurchaseOrder(poNumber, token) {
    return cy.request({
      method: 'DELETE',
      url: `${this.baseUrl}${this.data.purchaseOrdersEndpoint}/${encodeURIComponent(poNumber)}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
    });
  }

  /**
   * Build a one-row inventory workbook and import it against `poNumber`, which
   * creates a serialized item with status **Incoming** — the one status neither
   * `mark-status` (Damaged/Disputed/Missing only) nor a work order can produce.
   *
   * Row requirements, all learned the hard way against QA:
   *  - `Category` is the category NAME, not its id.
   *  - At least ONE **product-level** column is mandatory; a row of only
   *    item-level columns is rejected "At least one product column ...". The
   *    product columns come from `productColumnNames` in the fixture
   *    (Brand / Model / Form Factor / Ram) and are the SAME attributes the
   *    stock-out payload maps, which is what lets an imported item and a payload
   *    resolve to the same product. `Brand` is a List attribute, so its value
   *    must be one the list actually offers — `matchingProductValues.brand`
   *    ("Dell") and `driftProductValues.brand` ("HP") are both valid options on
   *    the configured category. A brand outside the list is rejected row-wise,
   *    so a category change means re-checking those two fixture values.
   *  - `Cost` is the only required item-level attribute.
   *  - The product columns are held CONSTANT across runs so every run matches the
   *    same product instead of growing the products table (plan §8 R3); only the
   *    serial varies.
   *
   * @returns {Cypress.Chainable} the upload response
   */
  importIncomingItem(serialNumber, poNumber, categoryName, token, productValues = null) {
    const filePath = `cypress/fixtures/${this.data.importSeedFilePrefix}${Date.now()}.xlsx`;
    const values = productValues || this.data.matchingProductValues;
    const row = {
      Category: categoryName,
      'Serial Number': serialNumber,
      Cost: this.data.importSeedCost,
      Quantity: 1,
    };
    // Required item-level attributes the configured category enforces. Category 2
    // (Desktop) makes `Asset Security Code` required, and the importer rejects the
    // whole row with `Field Asset Security Code is required` without it. Driven
    // from the fixture so a category change is a data edit, not a code edit.
    Object.entries(this.data.importRequiredItemColumns || {}).forEach(([col, v]) => {
      row[col] = v;
    });
    // Product columns carry the SAME values the drift/match payloads use, so an
    // imported item and a payload built from the same value set resolve to the
    // same product — which is what the "matching" cases (2/3) need.
    Object.entries(this.data.productColumnNames || {}).forEach(([attributeField, columnName]) => {
      if (values[attributeField] !== undefined) row[columnName] = values[attributeField];
    });
    return cy.task('createExcelFile', { filePath, data: [row] }).then(() =>
      cy.task('uploadExcelToApi', {
        filePath,
        poNumber,
        authToken: token,
        baseUrl: this.baseUrl,
      })
    );
  }

  /** GET /categories/:id — resolve a category's display name for the import row. */
  getCategoryName(categoryId, token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}${this.data.categoriesEndpoint}/${categoryId}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
    }).then((res) => res.body?.data?.name ?? null);
  }

  // ── API-token requests (TC14–TC17) ───────────────────────────────────────────

  /**
   * POST /api-tokens — mint a throwaway API token scoped to `scopes`.
   *
   * The raw `sw_…` secret is returned by the server EXACTLY ONCE, in this
   * response; it is stored only as a SHA-256 hash and can never be re-read. So
   * the caller must capture `res.body.data.token` here and keep it in a closure
   * variable for the life of the test.
   *
   * ⛔ NEVER write that value to a fixture, a `cy.log`, an assertion message, a
   * file, or `Cypress.env()` — `allowCypressEnv` makes env values readable by
   * any browser code in the run. Tests mint their own token and delete it in
   * `after()`; they must never borrow a real integration credential (revoking or
   * exhausting one takes BrainBox down on that environment).
   *
   * @param {string[]} scopes - values from API_TOKEN_SCOPES, e.g. ['hardware:stock-out']
   * @param {string}   token  - an ADMIN Keycloak JWT (tenant ADMIN is required)
   */
  createApiToken(scopes, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.apiTokensEndpoint}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      body: {
        name: `${this.data.apiTokenNamePrefix}${Date.now()}`,
        scopes,
      },
    });
  }

  /**
   * POST /api-tokens/:id/revoke — disable a token, keeping the row.
   * This is the ACT of TC16, not a cleanup step; use deleteApiToken() to clean up.
   */
  revokeApiToken(id, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.apiTokensEndpoint}/${id}/revoke`,
      headers: this.headers(token),
      failOnStatusCode: false,
    });
  }

  /**
   * DELETE /api-tokens/:id — remove a token row entirely. Used in `after()` so a
   * partial run never leaves a live credential behind.
   */
  deleteApiToken(id, token) {
    return cy.request({
      method: 'DELETE',
      url: `${this.baseUrl}${this.data.apiTokensEndpoint}/${id}`,
      headers: this.headers(token),
      failOnStatusCode: false,
    });
  }

  /**
   * POST /incoming-items/hardware-stock-out authenticating with a raw `sw_…` API
   * token instead of a Keycloak JWT — the path production BrainBox actually uses.
   *
   * Identical to stockOut() apart from the bearer value; kept as its own method
   * so a spec reads as "stock out as BrainBox would" and so the raw secret is
   * passed positionally rather than parked anywhere durable.
   */
  stockOutWithApiToken(payload, rawSecret) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.stockOutEndpoint}`,
      headers: this.headers(rawSecret),
      failOnStatusCode: false,
      timeout: 60000,
      body: payload,
    });
  }

  // ── Config-row CRUD, for the unconfigured-org cases (TC30/TC31) ──────────────

  /**
   * POST /configs — create a config row.
   *
   * Used ONLY against the second tenant. TC30/TC31 must observe the endpoint with
   * a broken `brainboxConfig`, and the plan's original answer was to mutate the
   * shared global row and restore it (§8 R1) — which is the hazard the 2026-09-01
   * review closed. The second org has no `brainboxConfig` row of its own and no
   * BrainBox traffic, so its config is a genuinely disposable fixture: TC30 needs
   * no mutation at all, and TC31 creates a row here and deletes it in `after()`.
   */
  createConfigRow(body, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}/configs`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body,
    });
  }

  /**
   * Reclaim a `brainboxConfig` row that a PREVIOUS interrupted run left behind in
   * the second organisation, and report whether one was removed.
   *
   * Why this exists (raised in review 2026-09-02): TC31 creates a throwaway row
   * and deletes it in `after()`. If a run dies between the two — Ctrl-C, a CI
   * timeout, a crash — the row survives, and on the NEXT run TC30 skips ("org B
   * now HAS a mapping") and TC31 skips ("already has a row"). Both log a reason,
   * but they read like the ordinary "no second tenant declared" skip, so the suite
   * would quietly stop covering two TCs with nobody knowing a row needs deleting.
   * That is the self-disabling-pending failure Guard 1 exists to prevent, and the
   * fix is the same shape: self-repair the one signature we are responsible for.
   *
   * DELIBERATELY NARROW. A row is only reclaimed when it matches this suite's own
   * throwaway fixture exactly:
   *   - a mapping of exactly one entry, keyed by `serialPayloadKey`, whose value
   *     is the serial attribute field, AND
   *   - no `poNumber` and no `categoryId`.
   * A genuinely configured org B (which would carry a poNumber) is left untouched,
   * so TC30/TC31 still skip for the right reason if someone configures BrainBox
   * there. Never call this against org A.
   *
   * @returns {Cypress.Chainable<boolean>} true when a leaked row was deleted
   */
  reclaimLeakedThrowawayConfig(token) {
    return this.readBrainBoxConfig(token).then((row) => {
      if (!row || !row.id) return cy.wrap(false, { log: false });
      const configJson = row.configJson || {};
      const mapping = configJson.mapping || {};
      const keys = Object.keys(mapping);
      const isThrowaway =
        keys.length === 1 &&
        keys[0] === this.data.serialPayloadKey &&
        /serial\s*number/i.test(String(mapping[keys[0]])) &&
        !configJson.poNumber &&
        !configJson.categoryId;

      if (!isThrowaway) return cy.wrap(false, { log: false });

      cy.log(
        'BrainBoxHardwareApiHelper: found a LEAKED throwaway brainboxConfig row ' +
        `(id ${row.id}) in the second organisation — a previous run was interrupted ` +
        'between TC31 creating it and after() deleting it. Reclaiming it so TC30/TC31 ' +
        'run instead of silently skipping.'
      );
      return this.deleteConfigRow(row.id, token).then(() => cy.wrap(true, { log: false }));
    });
  }

  /** DELETE /configs/:id — remove a throwaway config row created by TC31. */
  deleteConfigRow(id, token) {
    return cy.request({
      method: 'DELETE',
      url: `${this.baseUrl}/configs/${id}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
    });
  }

  // ── Concurrency (TC35) ───────────────────────────────────────────────────────

  /**
   * Post the SAME stock-out payload `count` times genuinely in parallel.
   *
   * Delegates to the `postJsonParallel` Node task: chained `cy.request` calls are
   * queued by Cypress and therefore strictly sequential, so a concurrency test
   * built on them would assert the sequential contract while claiming to test
   * simultaneity. See the task in cypress.base.config.js.
   *
   * @returns {Cypress.Chainable<Array<{status:number, body:any}>>}
   */
  stockOutConcurrently(payload, token, count = 2) {
    return cy.task('postJsonParallel', {
      url: `${this.baseUrl}${this.data.stockOutEndpoint}`,
      body: payload,
      authToken: token,
      count,
    });
  }

  /** Responses that reported a successful stock-out (2xx AND success !== false). */
  successfulResponses(responses) {
    return (responses || []).filter(
      (r) => r.status >= 200 && r.status < 300 && r.body?.success !== false
    );
  }

  // ── Product-matching helpers (TC29, TC40–TC46) ───────────────────────────────

  /**
   * Build a payload carrying the serial PLUS mapped product attributes.
   *
   * `values` is keyed by ATTRIBUTE field name (e.g. `{ brand:'Dell', model:'OptiPlex' }`);
   * this translates them to the payload keys the live mapping declares, so the test
   * never hard-codes BrainBox's wire field names. Any attribute the mapping does not
   * carry is silently skipped — which is exactly why `assertMappingHasProductAttrs`
   * exists: without a product attribute in the mapping the drift branch is
   * unreachable and these tests would pass while asserting nothing.
   *
   * @param {Record<string,string>} mapping - configRow.configJson.mapping (payloadKey -> attributeField)
   * @param {string} serial
   * @param {Record<string,any>} values    - keyed by attribute field name
   */
  buildMappedPayload(mapping, serial, values) {
    const payload = this.buildMinimalPayload(mapping, serial) || {};
    Object.entries(mapping).forEach(([payloadKey, attributeField]) => {
      if (attributeField === 'serialNumber') return;
      if (values[attributeField] !== undefined) {
        this.setPayloadField(payload, payloadKey, values[attributeField]);
      }
    });
    return payload;
  }

  /**
   * The product-level attribute fields the live mapping actually carries.
   * `serialNumber`, `cost` and `price` are excluded because the drift comparison
   * ignores them (`ignoredFields` in incoming-item-hardware.service.ts) — a mapping
   * of only those can never produce a mismatch.
   */
  mappedProductAttributes(mapping) {
    const ignored = new Set(['serialNumber', 'cost', 'price']);
    return Object.values(mapping || {}).filter((f) => !ignored.has(String(f)));
  }

  /**
   * The drift branch is unreachable unless the mapping carries at least one
   * comparable (product-level) attribute. Call this in a skip guard so a
   * serial-only mapping SKIPS these tests loudly instead of passing vacuously.
   */
  hasComparableMapping(mapping) {
    return this.mappedProductAttributes(mapping).length > 0;
  }

  /** The productId currently behind a serial, or null. */
  productIdOfSerial(serial, token) {
    return this.readHardwareInventory(serial, token).then((res) => this.itemProductIdFrom(res));
  }

  /**
   * GET /audit-trails filtered to one serial + action type.
   * Used to assert a `BRAINBOX_REPLACE` entry exists (drift cases) or does NOT
   * exist (matching cases).
   *
   * @returns {Cypress.Chainable<object[]>} the matching audit rows
   */
  findAuditEntries(serial, actionType, token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}${this.data.auditTrailsEndpoint}`,
      headers: this.headers(token),
      qs: { entityID: serial, actionType, page: 1, page_size: 50 },
      failOnStatusCode: false,
      timeout: 60000,
    }).then((res) => {
      const d = res.body?.data;
      const list = d?.list || d?.items || d?.results || (Array.isArray(d) ? d : []);
      // The endpoint filters server-side, but re-filter defensively: a loosened
      // filter would otherwise turn "no drift happened" into a false pass.
      return (Array.isArray(list) ? list : []).filter(
        (r) => String(r?.entityID ?? '').toLowerCase() === String(serial).toLowerCase()
          && String(r?.actionType ?? '') === actionType
      );
    });
  }

  /**
   * EVERY audit row for a serial, regardless of actionType.
   *
   * `findAuditEntries` needs the actionType up front, which is right for the drift
   * assertions but wrong for TC33: a stock-out is logged as `STOCKOUT` normally and
   * as `BTO -> SOLD` on the BTO branch (`product-stock-out.service.ts` writes
   * `btoSold ? btoSold : 'STOCKOUT'`). Filtering on one of those would make TC33
   * pass or fail depending on which branch ran. This returns the rows so the test
   * can assert the set and name the observed actionTypes when it fails.
   *
   * @returns {Cypress.Chainable<object[]>}
   */
  findAuditEntriesForSerial(serial, token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}${this.data.auditTrailsEndpoint}`,
      headers: this.headers(token),
      qs: { entityID: serial, page: 1, page_size: 50 },
      failOnStatusCode: false,
      timeout: 60000,
    }).then((res) => {
      const d = res.body?.data;
      const list = d?.list || d?.items || d?.results || (Array.isArray(d) ? d : []);
      return (Array.isArray(list) ? list : []).filter(
        (r) => String(r?.entityID ?? '').toLowerCase() === String(serial).toLowerCase()
      );
    });
  }

  /**
   * How many products currently sit in a category. The drift/ingestion cases assert
   * on the DELTA across the call: +1 proves a product was created, 0 proves an
   * existing one was reused.
   */
  countProductsInCategory(categoryId, token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}${this.data.productsEndpoint}`,
      headers: this.headers(token),
      qs: { categoryId, page: 1, page_size: 1 },
      failOnStatusCode: false,
      timeout: 60000,
    }).then((res) => {
      const d = res.body?.data;
      const count = d?.pagination?.count ?? d?.count ?? d?.total ?? null;
      if (count !== null && count !== undefined) return Number(count);
      const list = d?.list || d?.items || (Array.isArray(d) ? d : []);
      return Array.isArray(list) ? list.length : 0;
    });
  }

  /**
   * Stock a brand-new serial in through the BrainBox hardware path carrying a
   * specific product value set, so the resulting item's product provably holds
   * those values. Seeds the `Available` + known-product state cases 3/5a/5b need.
   */
  stockInWithValues(mapping, serial, values, token) {
    return this.stockIn(this.buildMappedPayload(mapping, serial, values), token);
  }

  // ── Cleanup helpers ──────────────────────────────────────────────────────────

  /**
   * POST /products/stockout-by-serial-number
   * Used in after() to clean up items that were stocked in during tests.
   */
  stockOutBySerial(serialNumber, token) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.stockOutBySerialEndpoint}`,
      headers: this.headers(token),
      failOnStatusCode: false,
      timeout: 60000,
      body: {
        serialNumber,
        reason: this.data.stockoutFromBrainboxReason,
        description: 'API test cleanup',
      },
    });
  }

  /**
   * GET /incoming-items/getProductCost
   * Queries the products table by any product-level field(s) and returns
   * { data: { cost, price } }. Used to verify that the correct cost was
   * stored after a hardware stock-in.
   *
   * @param {Record<string, string|number>} queryParams - filter fields (must
   *   be product-level attributes — item-level fields like serialNumber are on
   *   the items table and will not match here)
   * @param {string} token - auth token
   */
  getProductCost(queryParams, token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}/incoming-items/getProductCost`,
      headers: this.headers(token),
      qs: queryParams,
      failOnStatusCode: false,
      timeout: 60000,
    });
  }

  /**
   * GET /products — list products filtered by optional query params.
   * @param {object} qs    - query string params (categoryId, poNumber, page, etc.)
   * @param {string} token - auth token
   */
  getProducts(qs, token) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}${this.data.productsEndpoint}`,
      headers: this.headers(token),
      qs,
      failOnStatusCode: false,
      timeout: 60000,
    });
  }

  /**
   * GET /products/:id — fetch a single product by its ID.
   * Pass an optional poNumber to scope quantity data to that PO.
   * @param {number|string} productId - the product ID
   * @param {string}        token     - auth token
   * @param {string}        [poNumber] - optional PO number query param
   */
  getProductById(productId, token, poNumber) {
    return cy.request({
      method: 'GET',
      url: `${this.baseUrl}${this.data.productsEndpoint}/${productId}`,
      headers: this.headers(token),
      qs: poNumber ? { poNumber } : undefined,
      failOnStatusCode: false,
      timeout: 60000,
    });
  }
}

export default BrainBoxHardwareApiHelper;
