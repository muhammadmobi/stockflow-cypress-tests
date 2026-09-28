/**
 * BrainBox Hardware Stock-Out API Tests
 * =======================================
 * Backend: Backend/src/modules/incomingItems/incoming-item.controller.ts
 *
 * Endpoint exercised
 * ------------------
 *   POST /incoming-items/hardware-stock-out  AuthGuard — stock a hardware
 *     device out of inventory via a BrainBox payload
 *
 * Pre-requisite
 * -------------
 * A valid BrainBox configuration must exist in the backend database:
 *   GET /configs?type=brainboxConfig&name=brainboxConfig&userId=global
 * must return a row whose configJson contains:
 *   - poNumber   : a valid PO number
 *   - categoryId : a valid category ID
 *   - mapping    : at least one entry whose attribute value matches
 *                  /serial\s*number/i (e.g. "Serial Number (Item)")
 *
 * setupSuite() verifies this live against the backend before any test runs.
 * When the row is absent or has no serial mapping, serialMapping is set to
 * null and every config-dependent test calls this.skip() automatically.
 *
 * TC12 depends on stockInSerial having been stocked in by BrainboxStockInAPI TC17.
 * TC12 here re-stocks it in at the start to guarantee Available state,
 * making the suite safe to run independently.
 *
 * Test ID convention
 * ------------------
 *   SW-BB-SO-API-TC<NN>, sequential in the order the TC was AUTHORED, not in
 *   file order — TCs are grouped by concern below and never renumbered.
 *   Auth (JWT):         TC01–TC05
 *   Validation:         TC06–TC10, TC20–TC21
 *   Happy path:         TC11–TC13, TC25
 *   Auth (API token):   TC14–TC17
 *   Envelopes:          TC13, TC18–TC19
 *   Identity boundaries: TC22–TC24
 *   Item status table:  TC26–TC28, TC37–TC39
 *   Product matching:   TC29, TC40–TC46
 *   The full matrix lives in cypress/qa/testPlans/brainBoxStockOut/plan.md §9,
 *   with live per-TC status in that folder's coverage.md.
 *
 * Tags
 * ----
 *   @smoke      — auth enforcement + primary happy-path
 *   @regression — validation rules and edge cases
 *
 * Expected-red TCs
 * ----------------
 *   TC28 / TC37 / TC38 / TC39 assert a requirement the build does NOT yet meet
 *   (a BTO stock-out must succeed for Damaged / Missing / Disputed / Reserved).
 *   They fail ON PURPOSE and must NOT be relaxed to match current behaviour.
 *   Tracked internally; root cause and fix depth in
 *   cypress/qa/testPlans/brainBoxStockOut/pending.md § Expected-red. When that fix
 *   ships these four must pass UNCHANGED — if they need editing, the fix was wrong.
 *
 * Cleanup strategy
 * ----------------
 *   Serials need none: every serial the suite creates ends as StockedOut, an
 *   acceptable QA end-state. The after() hook DOES clean up the resources that
 *   would otherwise leak — minted API tokens (a partial run must never leave a
 *   live credential behind), TC39's work-order reservation, TC26's throwaway POs,
 *   and any serial mapping setupSuite() had to provision into the shared global
 *   brainboxConfig row.
 */

import BrainBoxHardwareApiHelper from '../../pageObjects/BrainBoxHardwareApiHelper';

// ─────────────────────────────────────────────────────────────────────────────
// Shared auth + config bootstrap
// ─────────────────────────────────────────────────────────────────────────────

describe('BrainBox Stock-Out API Tests', () => {
  let api;
  let configRow;
  let serialMapping;

  // stockInSerial is stocked in (or re-stocked in) by TC12 before calling
  // stock-out, ensuring Available state regardless of prior test run order.
  let stockInSerial;

  // freshSerial is a brand-new serial (never stocked in). TC11 verifies the
  // service auto-stocks it in then immediately stocks it out.
  let freshSerial;

  // Every API token minted by TC14/TC15 → deleted in after(). The suite mints
  // its own throwaway tokens and never borrows a real integration credential:
  // a shared token would be taken down for BrainBox by a revocation test, and
  // its fixed scope set could not express TC15's missing-scope case at all.
  const mintedTokenIds = [];

  // Throwaway work orders created by TC39 to reach the Reserved status. The item
  // is unscanned (back to Available) and the order deleted in after().
  const reservedWorkOrders = [];

  // Throwaway POs created by TC26 to seed an Incoming item via import -> deleted
  // in after(). A fresh PO number per run is required: a PO that already has an
  // import file refuses every later upload and no API can delete that file.
  const importedPoNumbers = [];

  before(() => {
    api = new BrainBoxHardwareApiHelper();
    api.setupSuite().then(({ configRow: cr, serialMapping: sm }) => {
      configRow = cr;
      serialMapping = sm;
    });
  });

  before(function () {
    if (!serialMapping) return;
    stockInSerial = api.uniqueStockInSerial();
    freshSerial   = api.uniqueStockOutSerial();
  });

  // Serials need no after(): freshSerial and stockInSerial end as StockedOut,
  // an acceptable QA end-state. API tokens DO — a partial run must never leave a
  // live credential behind.
  after(function () {
    const token = Cypress.env('bbApiAdminToken');
    if (!token) return;
    mintedTokenIds.forEach((id) => {
      if (id) api.deleteApiToken(id, token);
    });
    // Release TC39's reservation and remove the throwaway order, so a partial run
    // never leaves an item pinned to an orphan work order.
    reservedWorkOrders.forEach((wo) => {
      if (wo.workOrderNumber) {
        api.unscanItemFromWorkOrder(wo.workOrderNumber, wo.productId, wo.serial, token);
      }
      if (wo.id) api.deleteWorkOrder(wo.id, token);
    });
    // Remove TC26's throwaway POs so repeat runs do not accumulate purchase
    // orders (each carries an import file that cannot be deleted via the API).
    importedPoNumbers.forEach((po) => api.deletePurchaseOrder(po, token));
    // Put the shared global brainboxConfig row back if setupSuite() had to
    // provision a serial mapping into it (apiCleanup.js's rule: a spec that
    // CHANGES application configuration must put it back). No-op otherwise.
    api.restoreProvisionedConfig(token);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Authentication
  // ═══════════════════════════════════════════════════════════════════════════

  // ── TC01 ── No auth token returns 401 ──────────────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC01
     * Description: Verify the API returns 401 when no auth token is provided
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with no Authorization header.
     * Expected Result: API responds with 401 Unauthorized.
     */
  it('SW-BB-SO-API-TC01: Verify the API returns 401 when no auth token is provided', { tags: ['@smoke'] }, () => {
    api.stockOutUnauthenticated({}).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // ── TC02 ── Malformed auth token returns 401 ────────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC02
     * Description: Verify the API returns 401 when a malformed auth token is provided
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with an invalid Authorization token.
     * Expected Result: API responds with 401 Unauthorized.
     */
  it('SW-BB-SO-API-TC02: Verify the API returns 401 when a malformed auth token is provided', { tags: ['@regression'] }, () => {
    cy.fixture('brainBoxHardwareAPI').then((fixtureData) => {
      api.stockOut({}, fixtureData.malformedToken).then((res) => {
        expect(res.status).to.equal(401);
      });
    });
  });

  // ── TC03 ── Expired auth token returns 401 ──────────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC03
     * Description: Verify the API returns 401 when an expired auth token is provided
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with an expired Authorization token.
     * Expected Result: API responds with 401 Unauthorized.
     */
  it('SW-BB-SO-API-TC03: Verify the API returns 401 when an expired auth token is provided', { tags: ['@regression'] }, () => {
    cy.fixture('brainBoxHardwareAPI').then((fixtureData) => {
      api.stockOut({}, fixtureData.expiredToken).then((res) => {
        expect(res.status).to.equal(401);
      });
    });
  });

  // ── TC04 ── Valid admin token is accepted ───────────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC04
     * Description: Verify the API accepts a valid admin auth token
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with a valid admin Authorization token.
     * Expected Result: API does not return 401 Unauthorized.
     */
  it('SW-BB-SO-API-TC04: Verify the API accepts a valid admin auth token', { tags: ['@smoke'] }, () => {
    const token = Cypress.env('bbApiAdminToken');
    api.stockOut({}, token).then((res) => {
      expect(res.status, 'valid admin token must not be rejected as unauthenticated (401)').to.not.equal(401);
    });
  });

  // ── TC05 ── Valid worker token is accepted ──────────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC05
     * Description: Verify the API accepts a valid worker auth token
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with a valid worker Authorization token.
     * Expected Result: API does not return 401 Unauthorized.
     */
  it('SW-BB-SO-API-TC05: Verify the API accepts a valid worker auth token', { tags: ['@regression'] }, function () {
    const token = Cypress.env('bbApiWorkerToken');
    if (!token) this.skip();

    api.stockOut({}, token).then((res) => {
      expect(res.status, 'valid worker token must not be rejected as unauthenticated (401)').to.not.equal(401);
    });
  });

  // ── TC14 ── API token WITH hardware:stock-out is accepted ───────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC14
     * Description: Verify the API accepts an sw_ API token carrying the hardware:stock-out scope
     * Steps:
     *   1. Mint a throwaway API token scoped to hardware:stock-out only.
     *   2. Send a POST request to /incoming-items/hardware-stock-out authenticating with the raw sw_ token.
     * Expected Result: The request is neither 401 (token rejected) nor 403 (scope rejected).
     */
  // This is the path production BrainBox actually uses; every other auth TC here
  // uses a Keycloak JWT. Together with TC15 it pins @ApiTokenAccess AND its scope
  // constant to THIS route — drop the decorator or point it at the wrong scope and
  // one of the pair goes red. ApiTokensAPI covers the mechanism generically but
  // asserts it on print-spec-sheet / hardware-stock-in, so it cannot catch that.
  //
  // The body is deliberately `{}`: guards run BEFORE body validation, so an empty
  // payload still exercises auth + scope and then fails validation — which keeps
  // the test from minting inventory as a side effect (plan §8 R2).
  it('SW-BB-SO-API-TC14: Verify the API accepts an API token carrying the hardware:stock-out scope', { tags: ['@smoke'] }, function () {
    const adminJwt = Cypress.env('bbApiAdminToken');
    if (!adminJwt) this.skip();

    api.createApiToken([api.data.scopeHardwareStockOut], adminJwt).then((created) => {
      // Tenant ADMIN is required to mint. Skip rather than fail on a realm where
      // the QA user lacks it — the assertion below would be meaningless anyway.
      if (created.status < 200 || created.status >= 300) {
        cy.log(`TC14: could not mint an API token (${created.status}) — needs tenant ADMIN; skipping.`);
        this.skip();
      }

      const rawSecret = created.body?.data?.token;
      const id = created.body?.data?.apiToken?.id;
      if (id) mintedTokenIds.push(id);
      expect(rawSecret, 'minted token must be returned once, sw_-prefixed').to.match(/^sw_/);

      api.stockOutWithApiToken({}, rawSecret).then((res) => {
        expect(res.status, 'a scoped API token must not be rejected as unauthenticated (401)').to.not.equal(401);
        expect(res.status, 'a token WITH hardware:stock-out must not be rejected as forbidden (403)').to.not.equal(403);
      });
    });
  });

  // ── TC15 ── API token WITHOUT hardware:stock-out returns 403 ────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC15
     * Description: Verify the API returns 403 for an sw_ API token that lacks the hardware:stock-out scope
     * Steps:
     *   1. Mint a throwaway API token scoped to inventory:read only.
     *   2. Send a POST request to /incoming-items/hardware-stock-out authenticating with the raw sw_ token.
     * Expected Result: API responds with 403 Forbidden — NOT 401.
     */
  // 403, not 401, and the distinction is the whole point: the token authenticates
  // perfectly, it simply lacks the scope. Accepting 401 here would let a
  // regression that stops recognising valid tokens pass as "still rejected".
  it('SW-BB-SO-API-TC15: Verify the API returns 403 for an API token lacking the hardware:stock-out scope', { tags: ['@regression'] }, function () {
    const adminJwt = Cypress.env('bbApiAdminToken');
    if (!adminJwt) this.skip();

    api.createApiToken([api.data.scopeInventoryRead], adminJwt).then((created) => {
      if (created.status < 200 || created.status >= 300) {
        cy.log(`TC15: could not mint an API token (${created.status}) — needs tenant ADMIN; skipping.`);
        this.skip();
      }

      const rawSecret = created.body?.data?.token;
      const id = created.body?.data?.apiToken?.id;
      if (id) mintedTokenIds.push(id);
      expect(rawSecret, 'minted token must be returned once, sw_-prefixed').to.match(/^sw_/);

      api.stockOutWithApiToken({}, rawSecret).then((res) => {
        expect(
          res.status,
          'a valid token missing the required scope must be 403 Forbidden, not 401 Unauthorized'
        ).to.equal(403);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Request Validation
  // ═══════════════════════════════════════════════════════════════════════════

  // ── TC06 ── Empty body returns 400 ─────────────────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC06
     * Description: Verify the API returns 400 when an empty body is sent
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with an empty JSON body.
     * Expected Result: API responds with 400 Bad Request.
     */
  it('SW-BB-SO-API-TC06: Verify the API returns 400 when an empty body is sent', { tags: ['@regression'] }, () => {
    const token = Cypress.env('bbApiAdminToken');
    api.stockOut({}, token).then((res) => {
      api.assertBadRequest(res, 'empty body');
    });
  });

  // ── TC07 ── Body with no serialNumber mapping key returns 400 ───────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC07
     * Description: Verify the API returns 400 when the payload contains no mapped serial number key
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with a payload that does not contain the mapped serial number key.
     * Expected Result: API responds with 400 Bad Request.
     */
  it('SW-BB-SO-API-TC07: Verify the API returns 400 when the payload contains no mapped serial number key', { tags: ['@regression'] }, () => {
    const token = Cypress.env('bbApiAdminToken');
    api.stockOut({ bb_unmapped_field: 'value-that-cannot-map' }, token).then((res) => {
      api.assertBadRequest(res, 'unmapped payload');
    });
  });

  // ── TC08 ── Empty string serialNumber returns 400 ───────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC08
     * Description: Verify the API returns 400 when the mapped serial number is an empty string
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with a payload where the mapped serial number is an empty string.
     * Expected Result: API responds with 400 Bad Request.
     */
  it('SW-BB-SO-API-TC08: Verify the API returns 400 when the mapped serial number is an empty string', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, '');

    api.stockOut(payload, token).then((res) => {
      api.assertBadRequest(res, 'empty serialNumber');
    });
  });

  // ── TC09 ── spec:{} returns 400 ─────────────────────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC09
     * Description: Verify the API returns 400 when spec is an empty object
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with { spec: {} } as the body.
     * Expected Result: API responds with 400 Bad Request.
     */
  it('SW-BB-SO-API-TC09: Verify the API returns 400 when spec is an empty object', { tags: ['@regression'] }, () => {
    const token = Cypress.env('bbApiAdminToken');
    api.stockOut({ spec: {} }, token).then((res) => {
      api.assertBadRequest(res, 'spec:{}');
    });
  });

  // ── TC10 ── spec wrapper with all unmapped fields returns 400 ───────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC10
     * Description: Verify the API returns 400 when spec contains only unmapped fields
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with { spec: { bb_unmapped_field: 'not-in-any-mapping' } } as the body.
     * Expected Result: API responds with 400 Bad Request.
     */
  it('SW-BB-SO-API-TC10: Verify the API returns 400 when spec contains only unmapped fields', { tags: ['@regression'] }, () => {
    const token = Cypress.env('bbApiAdminToken');
    api.stockOut({ spec: { bb_unmapped_field: 'not-in-any-mapping' } }, token).then((res) => {
      api.assertBadRequest(res, 'spec with only unmapped fields');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Happy Path
  // ═══════════════════════════════════════════════════════════════════════════

  // ── TC11 ── Non-existing serial is auto-stocked-in then stocked out ─────────
    /**
     * Testcase ID: SW-BB-SO-API-TC11
     * Description: Verify that a non-existing serial is automatically stocked in and then stocked out
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with a payload containing a serial that was never stocked in.
     *   2. Observe that the service auto-stocks it in, then stocks it out.
     * Expected Result: API responds with 200/201 and message confirms auto stock-in+out flow.
     */

  // freshSerial has never been stocked in.  The service detects it is absent,
  // runs hardware-stock-in internally, then immediately stocks it out.
  // The response message confirms the auto-flow.
  it('SW-BB-SO-API-TC11: Verify that a non-existing serial is automatically stocked in and then stocked out', { tags: ['@smoke'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, freshSerial);

    api.stockOut(payload, token).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);

      const result = res.body.data[0];
      expect(result, 'response data[0] must be present').to.exist;
      expect(result.assetIds, 'assetIds must be an array').to.be.an('array');
      expect(result.message, 'message must confirm the auto stock-in+out flow')
        .to.include('stocked in and then stocked out');
    });
  });

  // ── TC12 ── Existing available item is stocked out ──────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC12
     * Description: Verify that an existing available item is successfully stocked out
     * Steps:
     *   1. Stock in a serial (if not already available).
     *   2. Send a POST request to /incoming-items/hardware-stock-out with the same serial.
     * Expected Result: API responds with 200/201 and assetIds are present in the response.
     */
  // Stocks in stockInSerial first (idempotent) to guarantee Available state,
  // then stocks it out and asserts a clean 2xx response.
  it('SW-BB-SO-API-TC12: Verify that an existing available item is successfully stocked out', { tags: ['@smoke'] }, function () {
    if (!serialMapping || !stockInSerial) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, stockInSerial);

    api.stockIn(payload, token).then(() => {
      api.stockOut(payload, token).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);

        const result = res.body.data[0];
        expect(result, 'response data[0] must be present').to.exist;
        expect(result.assetIds, 'assetIds must be an array').to.be.an('array');
        expect(result.assetId !== undefined, 'assetId field must be present').to.be.true;
      });
    });
  });

  // -- TC18 -- CloudErase session envelope is normalised and accepted ---------
    /**
     * Testcase ID: SW-BB-SO-API-TC18
     * Description: Verify a CloudErase session envelope (data.system) is normalised and accepted
     * Steps:
     *   1. Wrap a valid mapped payload in the CloudErase session envelope
     *      { id, type, createdAt, data: { org, system: {...} } }.
     *   2. Post it to /incoming-items/hardware-stock-out.
     * Expected Result: 200/201 - data.system is flattened to the top level, so the
     *   same mapping resolves it exactly as a bare payload.
     */
  // The CloudErase envelope is the NEWER wire format; TC13 covers only the legacy
  // `spec` wrapper. `normalizeHardwarePayload` (incoming-item.controller.ts:77)
  // flattens `data.system` to the top level and preserves `data.org`, so a mapping
  // of bare keys resolves both shapes unchanged. Uses a fresh serial so the
  // auto-stock-in+out path is exercised end to end.
  it('SW-BB-SO-API-TC18: Verify a CloudErase session envelope is normalised and accepted', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-CLOUDERASE`;
    const inner = api.buildMinimalPayload(configRow.configJson.mapping, serial);

    const envelope = {
      id: `cy-session-${Date.now()}`,
      type: 'session.stocked-out',
      createdAt: new Date().toISOString(),
      data: {
        org: { name: 'cypress-automation' },
        system: inner,
      },
    };

    api.stockOut(envelope, token).then((res) => {
      expect(res.status, 'the CloudErase envelope must be accepted').to.be.oneOf([200, 201]);

      const result = res.body.data?.[0];
      expect(result, 'CloudErase-wrapped stock-out data[0] must be present').to.exist;
      expect(result.assetIds, 'assetIds must be an array').to.be.an('array');

      // Prove the envelope really resolved to OUR serial. A normaliser that dropped
      // data.system would 400 for want of a serial, but one that resolved the WRONG
      // key could still answer 2xx while stocking out something else entirely.
      api.readHardwareInventory(serial, token).then((rd) => {
        expect(api.itemStatusFrom(rd), 'the enveloped serial must end StockedOut')
          .to.equal('StockedOut');
      });
    });
  });

  // -- TC16 -- A revoked API token is rejected 401 ----------------------------
    /**
     * Testcase ID: SW-BB-SO-API-TC16
     * Description: Verify a revoked API token can no longer stock out
     * Steps:
     *   1. Mint a throwaway token scoped to hardware:stock-out and confirm it is accepted.
     *   2. Revoke it.
     *   3. Post again with the same raw secret.
     * Expected Result: 401 - revocation takes effect immediately.
     */
  // State transition on the TOKEN, not the item: active -> revoked. The pre-revoke
  // call matters as much as the post-revoke one — without it a token that never
  // worked would produce the same 401 and the test would prove nothing.
  it('SW-BB-SO-API-TC16: Verify a revoked API token is rejected', { tags: ['@regression'] }, function () {
    const adminJwt = Cypress.env('bbApiAdminToken');
    if (!adminJwt) this.skip();

    api.createApiToken([api.data.scopeHardwareStockOut], adminJwt).then((created) => {
      if (created.status < 200 || created.status >= 300) {
        cy.log(`TC16: could not mint an API token (${created.status}) — needs tenant ADMIN; skipping.`);
        this.skip();
      }
      const rawSecret = created.body?.data?.token;
      const id = created.body?.data?.apiToken?.id;
      if (id) mintedTokenIds.push(id);
      expect(rawSecret, 'minted token must be sw_-prefixed').to.match(/^sw_/);

      // Prove it works BEFORE revoking, so the 401 below is caused by the revoke.
      api.stockOutWithApiToken({}, rawSecret).then((before) => {
        expect(before.status, 'the token must be accepted while active').to.not.be.oneOf([401, 403]);

        api.revokeApiToken(id, adminJwt).then((rev) => {
          expect(rev.status, 'revoke must succeed').to.be.oneOf([200, 201]);

          api.stockOutWithApiToken({}, rawSecret).then((after) => {
            expect(after.status, 'a revoked token must be rejected 401').to.equal(401);
          });
        });
      });
    });
  });

  // -- TC17 -- An sw_ token in the query string is not accepted ---------------
    /**
     * Testcase ID: SW-BB-SO-API-TC17
     * Description: Verify an sw_ API token passed as a ?token= query parameter is rejected
     * Steps:
     *   1. Mint a throwaway token scoped to hardware:stock-out.
     *   2. Post with NO Authorization header, passing the secret as ?token=<sw_...>.
     * Expected Result: 401 - the token-in-query fallback is for JWT-driven Excel
     *   downloads only; an API-token secret must travel in the Authorization header.
     */
  // Error guessing: the suite convention documents a ?token= fallback for exports
  // (it exists because <a href> downloads cannot set headers), so it is a natural
  // wrong assumption that the same works here. It must NOT — a machine secret in a
  // query string lands in access logs, proxies and browser history.
  it('SW-BB-SO-API-TC17: Verify an sw_ token passed as a query parameter is rejected', { tags: ['@regression'] }, function () {
    const adminJwt = Cypress.env('bbApiAdminToken');
    if (!adminJwt) this.skip();

    api.createApiToken([api.data.scopeHardwareStockOut], adminJwt).then((created) => {
      if (created.status < 200 || created.status >= 300) {
        cy.log(`TC17: could not mint an API token (${created.status}) — needs tenant ADMIN; skipping.`);
        this.skip();
      }
      const rawSecret = created.body?.data?.token;
      const id = created.body?.data?.apiToken?.id;
      if (id) mintedTokenIds.push(id);

      cy.request({
        method: 'POST',
        url: `${Cypress.env('API_BASE_URL')}${api.data.stockOutEndpoint}`,
        headers: { 'Content-Type': 'application/json' },
        qs: { token: rawSecret },
        body: {},
        failOnStatusCode: false,
        timeout: 60000,
      }).then((res) => {
        expect(res.status, 'a secret in the query string must not authenticate').to.equal(401);
      });
    });
  });

  // -- TC19 -- serialNumber-only payload is aliased onto serial ---------------
    /**
     * Testcase ID: SW-BB-SO-API-TC19
     * Description: Verify a payload that sets serialNumber but never serial is aliased and accepted
     * Steps:
     *   1. Post a flat payload carrying `serialNumber` only — not the mapped `serial` key.
     * Expected Result: 2xx - normalizeHardwarePayload copies serialNumber onto serial,
     *   so the mapping resolves and the item is stocked out.
     */
  // EP: `{serialNumber}` and `{serial}` are the same equivalence class thanks to the
  // alias at incoming-item.controller.ts:96. Only meaningful while the mapped key is
  // NOT already `serialNumber` — asserted below, so the test self-disables rather
  // than passing trivially if the config changes.
  it('SW-BB-SO-API-TC19: Verify a serialNumber-only payload is aliased onto serial and accepted', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();
    if (serialMapping === 'serialNumber') {
      cy.log('TC19: the mapped key IS serialNumber, so the alias is a no-op here — skipping.');
      this.skip();
    }

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-ALIAS`;

    // Deliberately NOT buildMinimalPayload: the point is to omit the mapped key.
    api.stockOut({ serialNumber: serial }, token).then((res) => {
      expect(res.status, 'a serialNumber-only payload must be accepted').to.be.oneOf([200, 201]);

      api.readHardwareInventory(serial, token).then((rd) => {
        expect(api.itemStatusFrom(rd), 'the aliased serial must end StockedOut')
          .to.equal('StockedOut');
      });
    });
  });

  // -- TC20 -- An array body is rejected --------------------------------------
    /**
     * Testcase ID: SW-BB-SO-API-TC20
     * Description: Verify an array request body is rejected
     * Steps:
     *   1. POST an empty array as the body.
     * Expected Result: 4xx - no serial can be resolved from an array.
     */
  // Error guessing: `typeof [] === 'object'`, so an array slips PAST the
  // "Payload is required" guard that catches strings and numbers (TC21) and fails
  // later, at identity resolution. Both are 4xx, but for different reasons — hence
  // two TCs rather than one.
  it('SW-BB-SO-API-TC20: Verify an array request body is rejected', { tags: ['@regression'] }, function () {
    const token = Cypress.env('bbApiAdminToken');
    if (!token) this.skip();

    api.stockOut([], token).then((res) => {
      api.assertBadRequest(res, 'array body');
    });
  });

  // -- TC21 -- A non-object body is rejected ----------------------------------
    /**
     * Testcase ID: SW-BB-SO-API-TC21
     * Description: Verify a non-object request body is rejected with "Payload is required"
     * Steps:
     *   1. POST a bare JSON string as the body.
     * Expected Result: 4xx whose message is "Payload is required".
     */
  // Error guessing: the FIRST guard in stockOutHardwarePayload is
  // `if (!payload || typeof payload !== 'object')`. Asserting the message (not just
  // 4xx) is what distinguishes this from TC20 — otherwise both tests would pass even
  // if that guard were deleted, because identity resolution 4xxs anyway.
  //
  // The body is sent as **text/plain**, and that detail is the test. A JSON scalar
  // cannot reach the guard at all: body-parser runs in strict mode, so `123`,
  // `null` or a bare `"string"` are refused as malformed JSON by the framework
  // (`Unexpected token … is not valid JSON`) before the controller sees anything —
  // verified against QA on 2026-09-01. Only a body Nest does not parse into an
  // object leaves `payload` undefined and exercises the guard itself.
  it('SW-BB-SO-API-TC21: Verify a non-object request body is rejected', { tags: ['@regression'] }, function () {
    const token = Cypress.env('bbApiAdminToken');
    if (!token) this.skip();

    cy.request({
      method: 'POST',
      url: `${Cypress.env('API_BASE_URL')}${api.data.stockOutEndpoint}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: 'not-an-object',
      failOnStatusCode: false,
      timeout: 60000,
    }).then((res) => {
      api.assertBadRequest(res, 'non-object body');
      const message = res.body?.error?.message || res.body?.message || '';
      expect(message, 'the first guard must be the one that rejects it')
        .to.match(/payload is required/i);
    });
  });

  // -- TC22 -- Padded / collapsed whitespace resolves to the same item --------
    /**
     * Testcase ID: SW-BB-SO-API-TC22
     * Description: Verify a serial with leading, trailing and repeated inner whitespace resolves to the same item
     * Steps:
     *   1. Stock in a serial containing a single inner space.
     *   2. Stock out using the same serial padded and with the inner space repeated.
     * Expected Result: 2xx and the ORIGINAL serial ends StockedOut - no second item is created.
     */
  // BVA on the normaliser `value.trim().replace(/\s+/g, ' ')`. The read-back is the
  // real assertion: without it a service that created a SECOND item under the padded
  // string would still answer 2xx and the test would pass while inventory doubled.
  it('SW-BB-SO-API-TC22: Verify a padded, collapsed-whitespace serial resolves to the same item', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()} WS`;          // exactly one inner space
    const padded = `   ${serial.replace(' ', '   ')}   `;        // padded + repeated inner spaces

    api.stockIn(api.buildMinimalPayload(configRow.configJson.mapping, serial), token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.stockOut(api.buildMinimalPayload(configRow.configJson.mapping, padded), token).then((res) => {
        expect(res.status, 'a padded serial must resolve to the seeded item').to.be.oneOf([200, 201]);

        api.readHardwareInventory(serial, token).then((rd) => {
          expect(api.itemStatusFrom(rd), 'the ORIGINAL serial must be the one stocked out')
            .to.equal('StockedOut');
        });
      });
    });
  });

  // -- TC23 -- A case-variant serial matches the existing item ----------------
    /**
     * Testcase ID: SW-BB-SO-API-TC23
     * Description: Verify a serial differing only in letter case matches the existing item
     * Steps:
     *   1. Stock in a serial containing lowercase letters.
     *   2. Stock out using the same serial upper-cased.
     * Expected Result: 2xx and the ORIGINAL serial ends StockedOut - no second item is created.
     */
  // BVA on the lookup `WHERE LOWER("serialNumber") = LOWER($1)`. As with TC22 the
  // read-back is what proves a match rather than a silent second stock-in.
  it('SW-BB-SO-API-TC23: Verify a case-variant serial matches the existing item', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-case`;
    const variant = serial.toUpperCase();
    expect(variant, 'the variant must differ only in case').to.not.equal(serial);

    api.stockIn(api.buildMinimalPayload(configRow.configJson.mapping, serial), token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.stockOut(api.buildMinimalPayload(configRow.configJson.mapping, variant), token).then((res) => {
        expect(res.status, 'a case-variant serial must resolve to the seeded item').to.be.oneOf([200, 201]);

        api.readHardwareInventory(serial, token).then((rd) => {
          expect(api.itemStatusFrom(rd), 'the ORIGINAL serial must be the one stocked out')
            .to.equal('StockedOut');
        });
      });
    });
  });

  // -- TC24 -- An ambiguous identity is rejected, not silently resolved -------
    /**
     * Testcase ID: SW-BB-SO-API-TC24
     * Description: Verify an identity mapping that resolves to more than one serial is rejected
     * Steps:
     *   1. Post a legacy `spec` envelope whose spec is an ARRAY of two machines,
     *      each carrying its own serial.
     * Expected Result: 4xx - resolveIdentityValue must refuse rather than pick one.
     */
  // Error guessing, and the highest-stakes case in this group: the identity field is
  // the ONE value that must never be guessed. `normalizeHardwarePayload` unwraps
  // `spec` verbatim, so an array spec makes the mapped key fan out over two elements;
  // `toSingleValue` then throws rather than choosing. Silently picking one would
  // stock out the WRONG physical unit.
  //
  // Neither serial is asserted to exist afterwards on purpose — the request must be
  // refused before anything is created (plan §8 R2: negative payloads must fail
  // before identity resolution can mint inventory).
  it('SW-BB-SO-API-TC24: Verify an ambiguous identity mapping is rejected, not silently resolved', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const first = `${api.uniqueStockOutSerial()}-AMB-A`;
    const second = `${api.uniqueStockOutSerial()}-AMB-B`;
    const mapping = configRow.configJson.mapping;

    api.stockOut({
      spec: [
        api.buildMinimalPayload(mapping, first),
        api.buildMinimalPayload(mapping, second),
      ],
    }, token).then((res) => {
      api.assertBadRequest(res, 'ambiguous identity');

      // Neither serial may have been stocked in as a side effect of the refusal.
      api.readHardwareInventory(first, token).then((a) => {
        expect(api.itemStatusFrom(a), 'an ambiguous payload must not create the first serial').to.be.null;
      });
      api.readHardwareInventory(second, token).then((b) => {
        expect(api.itemStatusFrom(b), 'an ambiguous payload must not create the second serial').to.be.null;
      });
    });
  });

  // -- TC25 -- The stock-out is recorded against the BrainBox reason ----------
    /**
     * Testcase ID: SW-BB-SO-API-TC25
     * Description: Verify the stock-out records reason "stockout from brainbox"
     * Steps:
     *   1. Stock a serial in, then stock it out through the BrainBox endpoint.
     *   2. Read the STOCKOUT audit entry for that serial.
     * Expected Result: the audit diff carries reason "stockout from brainbox".
     */
  // Every other happy-path TC proves THAT stock happened; this proves it is
  // ATTRIBUTED correctly. Without it a regression that stocked out under `Sold`
  // would leave every existing test green while corrupting the reason breakdown
  // every cost and sales report is built on.
  it('SW-BB-SO-API-TC25: Verify the stock-out records reason "stockout from brainbox"', { tags: ['@smoke'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-REASON`;
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, serial);

    api.stockIn(payload, token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.stockOut(payload, token).then((res) => {
        expect(res.status, 'the stock-out must succeed').to.be.oneOf([200, 201]);

        api.findAuditEntries(serial, api.data.stockoutActionType, token).then((entries) => {
          expect(entries.length, 'a STOCKOUT audit entry must exist for the serial')
            .to.be.greaterThan(0);

          // `diff` comes back already parsed as an object (not the JSON string the
          // service stored), so String() would yield "[object Object]" and the
          // assertion would fail for the wrong reason. JSON.stringify handles both.
          const diffs = entries
            .map((e) => (typeof e.diff === 'string' ? e.diff : JSON.stringify(e.diff ?? '')))
            .join(' ');
          expect(diffs, 'the recorded reason must identify BrainBox')
            .to.contain(api.data.stockoutFromBrainboxReason);
        });
      });
    });
  });

  // ===========================================================================
  // State transitions - stock-out attempted against each item status
  // ===========================================================================
  //
  // REQUIREMENT (confirmed with the product owner, 2026-09-01):
  // a BTO stock-out MUST SUCCEED for an item that is Missing, Damaged, Disputed
  // or Reserved. Those units are physically in hand — refusing to ship them is
  // what strands stock.
  //
  //   Available   -> 2xx, item becomes StockedOut                (TC11/TC12)
  //   Incoming    -> 2xx via the BTO retry                       (TC26)
  //   Missing     -> 2xx REQUIRED                                (TC37)
  //   Damaged     -> 2xx REQUIRED                                (TC28)
  //   Disputed    -> 2xx REQUIRED                                (TC38)
  //   Reserved    -> 2xx REQUIRED                                (TC39)
  //   StockedOut  -> 400 "Item <s> is already stocked out."      (TC27 - still a refusal)
  //
  // ⚠️ TC28/TC37/TC38/TC39 are EXPECTED-RED against the current build. Observed on
  // QA 2026-08-31/09-01: all four are refused
  // `400 ... cannot be stocked out. It's status is <status>`.
  //
  // Root cause, from the source:
  //   - `stockOutBySerialNumber` DOES implement the required behaviour, but only
  //     when the caller passes description `stockout from bto`
  //     (product-stock-out.service.ts ~779 force-stocks-out Missing/Damaged/Disputed).
  //   - `stockOutHardwarePayload` calls it with description
  //     'Stock out from brainbox', and only retries under the BTO description when
  //     the error message contains 'status is Incoming' — so Missing/Damaged/
  //     Disputed never reach the branch that would satisfy the requirement.
  //   - `Reserved` additionally throws unconditionally at ~751, ahead of the BTO
  //     branch, so it fails even via the BTO description.
  //
  // These tests assert the REQUIREMENT, not the current behaviour. Do NOT relax
  // them to make the suite green: that would re-encode the defect as the contract,
  // which is exactly what the previous revision did. Rationale in pending.md.
  //
  // Each test verifies the SEED took before asserting - mark-status answers 2xx
  // even on a no-op, so an unverified seed would let the test assert the
  // Available contract while claiming to cover Damaged.

  /**
   * Seed an Available item, move it to `status`, prove the move took, then assert
   * the stock-out SUCCEEDS — the confirmed requirement for a BTO stock-out.
   *
   * EXPECTED-RED on the current build (see the block above): the service refuses
   * with `400 ... It's status is <status>`. Tracked internally — a red here is
   * that ticket, not a broken test. The failure message deliberately surfaces the
   * observed response so the defect is readable straight from the CI log without
   * re-running anything.
   *
   * @param {Mocha.Context} ctx    the test's `this`, so the skip guard binds
   * @param {'Missing'|'Damaged'|'Disputed'} status
   */
  const assertStocksOutDespiteStatus = (ctx, status) => {
    if (!serialMapping) ctx.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-${status.toUpperCase()}`;
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, serial);

    return api.stockIn(payload, token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      return api.markItemStatus([serial], status, configRow.configJson.poNumber, token).then((mk) => {
        expect(mk.status, `mark-status ${status} must be accepted`).to.be.lessThan(400);

        // Prove the seed actually landed before asserting on the stock-out.
        return api.readHardwareInventory(serial, token).then((rd) => {
          expect(api.itemStatusFrom(rd), `item must really be ${status} before the stock-out`)
            .to.equal(status);

          return api.stockOut(payload, token).then((res) => {
            expect(
              res.status,
              `REQUIREMENT: a ${status} item must stock out successfully ` +
              `(observed ${res.status}: ${JSON.stringify(res.body?.error?.message ?? res.body).slice(0, 200)})`
            ).to.be.oneOf([200, 201]);

            return api.readHardwareInventory(serial, token).then((after) => {
              expect(api.itemStatusFrom(after), `a ${status} item must end StockedOut`)
                .to.equal('StockedOut');
            });
          });
        });
      });
    });
  };

  // ===========================================================================
  // Product matching — does the payload's product detail agree with what is stored?
  // ===========================================================================
  //
  // A SECOND dimension over the status table above. On every call the service
  // compares the mapped payload against the stored product/item rows
  // (`serialNumber`, `cost`, `price` are ignored) and then:
  //
  //   no mismatch -> stock out; product + PO untouched
  //   mismatch    -> BRAINBOX_REPLACE audit
  //                  -> reuse an existing product in the configured category that
  //                     matches, else CREATE one
  //                  -> shiftItemPO(item -> configured PO, target product)
  //                  -> update item attributes -> stock out
  //
  // Every one of these cases ends with the serial StockedOut — that is the
  // constant, not the variable. What separates them is what happens to the
  // PRODUCT on the way there, so the product-identity and audit assertions are
  // the ones carrying the weight. A test asserting only "2xx + StockedOut" would
  // pass in all eight and prove nothing.
  //
  // NOTE the PO usually does NOT change: shiftItemPO is called with the configured
  // PO, and the item is normally already on it, so only productId moves.

  /** Skip guard: without a product attribute in the mapping the drift branch is dead code. */
  const requireComparableMapping = (ctx) => {
    if (!serialMapping) ctx.skip();
    if (!api.hasComparableMapping(configRow.configJson.mapping)) {
      cy.log(
        'brainboxConfig maps no product-level attribute (only serialNumber/cost/price), so ' +
        'the product-matching branch cannot be reached — skipping rather than passing vacuously. ' +
        'See plan §7.3.'
      );
      ctx.skip();
    }
  };

  // ── TC45 ── Unknown serial, an existing product matches ─────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC45
     * Description: Verify an unknown serial is stocked in under an existing matching product, then stocked out
     * Steps:
     *   1. Ensure a product carrying the matching value set exists (seed one via a prior stock-in).
     *   2. Post a stock-out for a brand-new serial carrying those same values.
     * Expected Result: The item is stocked in under the EXISTING product (no new product) and stocked out.
     */
  // Case 1a — confirmed with the team 2026-08-31.
  it('SW-BB-SO-API-TC45: Verify an unknown serial reuses an existing matching product', { tags: ['@regression'] }, function () {
    requireComparableMapping(this);
    const token = Cypress.env('bbApiAdminToken');
    const values = api.data.matchingProductValues;
    const catId = configRow.configJson.categoryId;

    // Guarantee the product exists first, so this asserts REUSE rather than create.
    const seedSerial = `${api.uniqueStockOutSerial()}-P45SEED`;
    api.stockInWithValues(configRow.configJson.mapping, seedSerial, values, token).then(() => {
      api.productIdOfSerial(seedSerial, token).then((seededProductId) => {
        expect(seededProductId, 'seed product must resolve').to.be.ok;

        api.countProductsInCategory(catId, token).then((before) => {
          const serial = `${api.uniqueStockOutSerial()}-TC45`;
          api.stockOut(api.buildMappedPayload(configRow.configJson.mapping, serial, values), token).then((res) => {
            expect(res.status, 'unknown serial must auto stock-in then stock out').to.be.oneOf([200, 201]);

            api.productIdOfSerial(serial, token).then((productId) => {
              expect(productId, 'item must be attached to the EXISTING matching product')
                .to.equal(seededProductId);

              api.countProductsInCategory(catId, token).then((after) => {
                expect(after, 'no new product may be created when one already matches').to.equal(before);
              });
              api.readHardwareInventory(serial, token).then((rd) => {
                expect(api.itemStatusFrom(rd), 'the serial must end StockedOut').to.equal('StockedOut');
              });
            });
          });
        });
      });
    });
  });

  // ── TC46 ── Unknown serial, no product matches ──────────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC46
     * Description: Verify an unknown serial with no matching product creates one, then stocks out
     * Steps:
     *   1. Post a stock-out for a brand-new serial carrying a product value set nothing matches.
     * Expected Result: A new product is created, the item is stocked in under it and stocked out.
     */
  // Case 1b. The drifted value set is FIXED, so the product it creates is reused by
  // every later run — growth is bounded to one product, not one per run (plan §8 R3).
  it('SW-BB-SO-API-TC46: Verify an unknown serial with no matching product creates one', { tags: ['@regression'] }, function () {
    requireComparableMapping(this);
    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-TC46`;
    const values = api.data.driftProductValues;

    api.stockOut(api.buildMappedPayload(configRow.configJson.mapping, serial, values), token).then((res) => {
      expect(res.status, 'unknown serial must auto stock-in then stock out').to.be.oneOf([200, 201]);
      const result = res.body.data?.[0];
      expect(result?.message, 'message must confirm the auto stock-in+out flow')
        .to.include('stocked in and then stocked out');

      api.productIdOfSerial(serial, token).then((productId) => {
        expect(productId, 'the item must be attached to a product').to.be.ok;
        api.readHardwareInventory(serial, token).then((rd) => {
          expect(api.itemStatusFrom(rd), 'the serial must end StockedOut').to.equal('StockedOut');
        });
      });
    });
  });

  // ── TC41 ── Available + matching product: no drift ──────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC41
     * Description: Verify an Available item whose product detail matches is stocked out without any drift handling
     * Steps:
     *   1. Stock a serial in carrying a known product value set (item -> Available).
     *   2. Post a stock-out carrying the SAME values.
     * Expected Result: No BRAINBOX_REPLACE, product and PO unchanged, serial stocked out.
     */
  // Case 3 — the NEGATIVE CONTROL for TC43/TC29. Without it, a regression firing
  // BRAINBOX_REPLACE unconditionally (re-homing every item on every call) would
  // pass the entire suite.
  it('SW-BB-SO-API-TC41: Verify an Available item with matching product detail is stocked out untouched', { tags: ['@smoke'] }, function () {
    requireComparableMapping(this);
    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-TC41`;
    const values = api.data.matchingProductValues;
    const payload = api.buildMappedPayload(configRow.configJson.mapping, serial, values);

    api.stockIn(payload, token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.readHardwareInventory(serial, token).then((before) => {
        expect(api.itemStatusFrom(before), 'seeded item must be Available').to.equal('Available');
        const beforeProductId = api.itemProductIdFrom(before);
        const beforePo = api.hardwareInventoryRow(before)?.poNumber ?? null;

        api.stockOut(payload, token).then((res) => {
          expect(res.status, 'a matching payload must stock out cleanly').to.be.oneOf([200, 201]);

          api.findAuditEntries(serial, api.data.brainboxReplaceAction, token).then((entries) => {
            expect(entries, 'a matching payload must NOT trigger BRAINBOX_REPLACE')
              .to.have.length(0);
          });
          api.readHardwareInventory(serial, token).then((after) => {
            expect(api.itemProductIdFrom(after), 'product must be unchanged').to.equal(beforeProductId);
            expect(api.hardwareInventoryRow(after)?.poNumber ?? null, 'PO must be unchanged').to.equal(beforePo);
            expect(api.itemStatusFrom(after), 'the serial must end StockedOut').to.equal('StockedOut');
          });
        });
      });
    });
  });

  // ── TC43 ── Available + drift, an existing product matches ──────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC43
     * Description: Verify a drifted Available item is re-attached to an existing matching product rather than duplicating it
     * Steps:
     *   1. Ensure a product carrying the drifted value set exists.
     *   2. Stock a serial in carrying the MATCHING value set (item -> Available under a different product).
     *   3. Post a stock-out carrying the DRIFTED values.
     * Expected Result: BRAINBOX_REPLACE, item re-attached to the existing drifted product, NO new product, stocked out.
     */
  // Case 5a — confirmed with the team 2026-08-31. The create-vs-reuse split is the
  // point: a suite that only ever hits the create path would not notice a
  // regression that stopped reusing, i.e. one duplicating a product every call.
  it('SW-BB-SO-API-TC43: Verify a drifted Available item reuses an existing matching product', { tags: ['@regression'] }, function () {
    requireComparableMapping(this);
    const token = Cypress.env('bbApiAdminToken');
    const mapping = configRow.configJson.mapping;
    const catId = configRow.configJson.categoryId;
    const drift = api.data.driftProductValues;

    // Ensure the drift target product exists, so this is REUSE not create.
    const targetSeed = `${api.uniqueStockOutSerial()}-P43SEED`;
    api.stockInWithValues(mapping, targetSeed, drift, token).then(() => {
      api.productIdOfSerial(targetSeed, token).then((driftProductId) => {
        expect(driftProductId, 'drift target product must resolve').to.be.ok;

        const serial = `${api.uniqueStockOutSerial()}-TC43`;
        api.stockInWithValues(mapping, serial, api.data.matchingProductValues, token).then(() => {
          api.productIdOfSerial(serial, token).then((originalProductId) => {
            expect(originalProductId, 'seeded item must start on the matching product')
              .to.not.equal(driftProductId);

            api.countProductsInCategory(catId, token).then((before) => {
              api.stockOut(api.buildMappedPayload(mapping, serial, drift), token).then((res) => {
                expect(res.status, 'a drifted payload must still stock out').to.be.oneOf([200, 201]);

                api.findAuditEntries(serial, api.data.brainboxReplaceAction, token).then((entries) => {
                  expect(entries.length, 'drift must write a BRAINBOX_REPLACE audit entry')
                    .to.be.greaterThan(0);
                });
                api.productIdOfSerial(serial, token).then((afterProductId) => {
                  expect(afterProductId, 'item must be re-attached to the EXISTING drift product')
                    .to.equal(driftProductId);
                  api.countProductsInCategory(catId, token).then((after) => {
                    expect(after, 'no new product may be created when one already matches')
                      .to.equal(before);
                  });
                });
                api.readHardwareInventory(serial, token).then((rd) => {
                  expect(api.itemStatusFrom(rd), 'the serial must end StockedOut').to.equal('StockedOut');
                });
              });
            });
          });
        });
      });
    });
  });

  // ── TC29 ── Available + drift, no product matches → one is created ──────────
    /**
     * Testcase ID: SW-BB-SO-API-TC29
     * Description: Verify a drifted Available item with no matching product gets a new product created in the same PO
     * Steps:
     *   1. Stock a serial in carrying the matching value set (item -> Available).
     *   2. Post a stock-out carrying product values no product carries.
     * Expected Result: BRAINBOX_REPLACE, a NEW product created, item moved onto it, PO unchanged, stocked out.
     */
  // Case 5b. Uses a per-run-unique drifted MODEL so nothing can already match —
  // this is the one case that must genuinely create.
  //
  // GROWTH, and why it is not fixable here (raised in review 2026-09-01): this
  // leaves one product per run on the environment, and TC42 leaves a second.
  // Neither a fixed value nor a bounded rotating pool works — the moment a value
  // has been used once, a product carrying it exists, so the next run REUSES it
  // and `countAfter > countBefore` (the whole assertion) can no longer hold.
  // Cleaning up instead is not available either: there is no DELETE /products/:id
  // route (product.controller.ts exposes DELETE :serial, /deletevariant/:id and
  // :id/image only), and the created product owns a StockedOut item by the time
  // the test finishes. So this is the deliberate, documented exception to the
  // fixed-value rule in plan §8 R3 — accepted at 2 rows/run against a QA
  // products table, and the reason both tests scope their count assertion to the
  // configured category rather than the whole table.
  it('SW-BB-SO-API-TC29: Verify a drifted Available item with no matching product creates one', { tags: ['@smoke'] }, function () {
    requireComparableMapping(this);
    const token = Cypress.env('bbApiAdminToken');
    const mapping = configRow.configJson.mapping;
    const catId = configRow.configJson.categoryId;
    const serial = `${api.uniqueStockOutSerial()}-TC29`;
    const unique = { ...api.data.driftProductValues, model: `BB-SO-NEW-${Date.now()}` };

    api.stockInWithValues(mapping, serial, api.data.matchingProductValues, token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.readHardwareInventory(serial, token).then((before) => {
        expect(api.itemStatusFrom(before), 'seeded item must be Available').to.equal('Available');
        const originalProductId = api.itemProductIdFrom(before);
        const originalPo = api.hardwareInventoryRow(before)?.poNumber ?? null;

        api.countProductsInCategory(catId, token).then((countBefore) => {
          api.stockOut(api.buildMappedPayload(mapping, serial, unique), token).then((res) => {
            expect(res.status, 'a drifted payload must still stock out').to.be.oneOf([200, 201]);

            api.findAuditEntries(serial, api.data.brainboxReplaceAction, token).then((entries) => {
              expect(entries.length, 'drift must write a BRAINBOX_REPLACE audit entry')
                .to.be.greaterThan(0);
            });
            api.countProductsInCategory(catId, token).then((countAfter) => {
              expect(countAfter, 'a product must be CREATED when nothing matches')
                .to.be.greaterThan(countBefore);
            });
            api.readHardwareInventory(serial, token).then((after) => {
              expect(api.itemProductIdFrom(after), 'item must move off its original product')
                .to.not.equal(originalProductId);
              // shiftItemPO targets the CONFIGURED PO; the item is normally already
              // there, so the PO is expected to stay put.
              expect(api.hardwareInventoryRow(after)?.poNumber ?? null, 'PO must be the configured BrainBox PO')
                .to.equal(originalPo);
              expect(api.itemStatusFrom(after), 'the serial must end StockedOut').to.equal('StockedOut');
            });
          });
        });
      });
    });
  });

  // -- TC26 -- Incoming item stocks out via the BTO fallback -------------------
    /**
     * Testcase ID: SW-BB-SO-API-TC26
     * Description: Verify an Incoming item is stocked out through the internal BTO fallback
     * Steps:
     *   1. Create a throwaway PO and import a one-row workbook against it, which
     *      creates a serialized item with status Incoming.
     *   2. Confirm the item really is Incoming.
     *   3. Post a valid BrainBox payload for that serial.
     * Expected Result: 2xx - the first attempt fails "status is Incoming", the service
     *   retries with the "stockout from bto" description, and the item becomes StockedOut.
     */
  // Incoming is the ONE status that succeeds despite not being Available, and the
  // only one neither mark-status nor a work order can produce (plan section 7.2):
  //   - mark-status allows only Damaged / Disputed / Missing
  //   - a work order yields Reserved
  // It comes from the PO import path, so this seeds it the way receiving does.
  //
  // The PO is a THROWAWAY, not the BrainBox-configured one, because of the
  // single-import-file-per-PO rule: a PO that already carries an import file
  // refuses every later upload, and no API deletes that file. Importing into the
  // shared BrainBox PO would pass once and then block this test - and any human
  // importing to that PO - permanently. The stock-out finds the item by SERIAL
  // (`SELECT * FROM items WHERE LOWER(scanField) = ...`, no PO filter), so the
  // item being on a different PO does not affect what is under test.
  it('SW-BB-SO-API-TC26: Verify an Incoming item is stocked out via the BTO fallback', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-INCOMING`;
    const poNumber = `${api.data.incomingPoPrefix}${Date.now()}`;

    api.getCategoryName(configRow.configJson.categoryId, token).then((categoryName) => {
      if (!categoryName) {
        cy.log('TC26: could not resolve the configured category name - skipping.');
        this.skip();
      }

      api.createPurchaseOrder(poNumber, token).then((po) => {
        if (po.status >= 400) {
          cy.log(`TC26: could not create the throwaway PO (${po.status}) - skipping.`);
          this.skip();
        }
        importedPoNumbers.push(poNumber);

        api.importIncomingItem(serial, poNumber, categoryName, token).then((up) => {
          // A failed import means no Incoming item exists, so the assertion below
          // would be meaningless. Surface why rather than asserting on nothing.
          expect(
            up.status,
            `import must succeed to seed an Incoming item (body: ${JSON.stringify(up.body).slice(0, 300)})`
          ).to.be.oneOf([200, 201]);

          api.readHardwareInventory(serial, token).then((rd) => {
            expect(api.itemStatusFrom(rd), 'imported item must really be Incoming before the stock-out')
              .to.equal('Incoming');

            const payload = api.buildMinimalPayload(configRow.configJson.mapping, serial);
            api.stockOut(payload, token).then((res) => {
              expect(res.status, 'an Incoming item must stock out via the BTO fallback').to.be.oneOf([200, 201]);

              api.readHardwareInventory(serial, token).then((after) => {
                expect(api.itemStatusFrom(after), 'the Incoming item must end StockedOut')
                  .to.equal('StockedOut');
              });
            });
          });
        });
      });
    });
  });

  // ── TC40 / TC42 / TC44 ── the Incoming variants of the matching table ───────
  //
  // Incoming items can only be seeded by importing into a throwaway PO (§7.2), so
  // these three share one seeding routine. Each creates its own PO — a PO accepts
  // exactly ONE import file ever and no API can delete it.

  /**
   * Seed an Incoming item carrying `values`, then run `assertFn(serial, productIdBefore)`.
   * Skips (never fails) when the environment cannot produce an Incoming item.
   */
  const withIncomingItem = (ctx, values, assertFn) => {
    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-INC`;
    const poNumber = `${api.data.incomingPoPrefix}${Date.now()}`;

    return api.getCategoryName(configRow.configJson.categoryId, token).then((categoryName) => {
      if (!categoryName) {
        cy.log('could not resolve the configured category name - skipping.');
        ctx.skip();
      }
      return api.createPurchaseOrder(poNumber, token).then((po) => {
        if (po.status >= 400) {
          cy.log(`could not create the throwaway PO (${po.status}) - skipping.`);
          ctx.skip();
        }
        importedPoNumbers.push(poNumber);

        return api.importIncomingItem(serial, poNumber, categoryName, token, values).then((up) => {
          expect(
            up.status,
            `import must succeed to seed an Incoming item (body: ${JSON.stringify(up.body).slice(0, 300)})`
          ).to.be.oneOf([200, 201]);

          return api.readHardwareInventory(serial, token).then((rd) => {
            expect(api.itemStatusFrom(rd), 'imported item must really be Incoming').to.equal('Incoming');
            return assertFn(serial, api.itemProductIdFrom(rd), token);
          });
        });
      });
    });
  };

  // ── TC40 ── Incoming + matching product: no drift ───────────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC40
     * Description: Verify an Incoming item whose product detail matches is stocked out without drift handling
     * Steps:
     *   1. Import an item carrying a known product value set (item -> Incoming).
     *   2. Post a stock-out carrying the SAME values.
     * Expected Result: No BRAINBOX_REPLACE, product unchanged, serial stocked out via the BTO retry.
     */
  // Case 2 — confirmed with the team 2026-08-31. Negative control for TC42/TC44.
  it('SW-BB-SO-API-TC40: Verify an Incoming item with matching product detail is stocked out untouched', { tags: ['@regression'] }, function () {
    requireComparableMapping(this);
    const values = api.data.matchingProductValues;

    withIncomingItem(this, values, (serial, productIdBefore, token) => {
      const payload = api.buildMappedPayload(configRow.configJson.mapping, serial, values);
      return api.stockOut(payload, token).then((res) => {
        expect(res.status, 'an Incoming item must stock out via the BTO fallback').to.be.oneOf([200, 201]);

        api.findAuditEntries(serial, api.data.brainboxReplaceAction, token).then((entries) => {
          expect(entries, 'a matching payload must NOT trigger BRAINBOX_REPLACE').to.have.length(0);
        });
        api.readHardwareInventory(serial, token).then((after) => {
          expect(api.itemProductIdFrom(after), 'product must be unchanged').to.equal(productIdBefore);
          expect(api.itemStatusFrom(after), 'the serial must end StockedOut').to.equal('StockedOut');
        });
      });
    });
  });

  // ── TC44 ── Incoming + drift, an existing product matches ───────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC44
     * Description: Verify a drifted Incoming item is re-attached to an existing matching product rather than duplicating it
     * Steps:
     *   1. Ensure a product carrying the drifted value set exists.
     *   2. Import an item carrying the MATCHING value set (item -> Incoming).
     *   3. Post a stock-out carrying the DRIFTED values.
     * Expected Result: BRAINBOX_REPLACE, item re-attached to the existing product, NO new product, stocked out.
     */
  // Case 4a — the Incoming mirror of the confirmed TC43.
  it('SW-BB-SO-API-TC44: Verify a drifted Incoming item reuses an existing matching product', { tags: ['@regression'] }, function () {
    requireComparableMapping(this);
    const token0 = Cypress.env('bbApiAdminToken');
    const mapping = configRow.configJson.mapping;
    const catId = configRow.configJson.categoryId;
    const drift = api.data.driftProductValues;

    // Ensure the drift target exists first, so this asserts REUSE not create.
    const targetSeed = `${api.uniqueStockOutSerial()}-P44SEED`;
    api.stockInWithValues(mapping, targetSeed, drift, token0).then(() => {
      api.productIdOfSerial(targetSeed, token0).then((driftProductId) => {
        expect(driftProductId, 'drift target product must resolve').to.be.ok;

        withIncomingItem(this, api.data.matchingProductValues, (serial, productIdBefore, token) => {
          expect(productIdBefore, 'seeded item must start off the drift product')
            .to.not.equal(driftProductId);

          return api.countProductsInCategory(catId, token).then((before) => {
            return api.stockOut(api.buildMappedPayload(mapping, serial, drift), token).then((res) => {
              expect(res.status, 'a drifted Incoming item must still stock out').to.be.oneOf([200, 201]);

              api.findAuditEntries(serial, api.data.brainboxReplaceAction, token).then((entries) => {
                expect(entries.length, 'drift must write a BRAINBOX_REPLACE audit entry')
                  .to.be.greaterThan(0);
              });
              api.productIdOfSerial(serial, token).then((afterProductId) => {
                expect(afterProductId, 'item must be re-attached to the EXISTING drift product')
                  .to.equal(driftProductId);
                api.countProductsInCategory(catId, token).then((after) => {
                  expect(after, 'no new product may be created when one already matches').to.equal(before);
                });
              });
              api.readHardwareInventory(serial, token).then((rd) => {
                expect(api.itemStatusFrom(rd), 'the serial must end StockedOut').to.equal('StockedOut');
              });
            });
          });
        });
      });
    });
  });

  // ── TC42 ── Incoming + drift, no product matches → one is created ───────────
    /**
     * Testcase ID: SW-BB-SO-API-TC42
     * Description: Verify a drifted Incoming item with no matching product gets a new product created, then stocks out
     * Steps:
     *   1. Import an item carrying the matching value set (item -> Incoming).
     *   2. Post a stock-out carrying product values no product carries.
     * Expected Result: BRAINBOX_REPLACE, a NEW product created, item moved onto it, stocked out via the BTO retry.
     */
  // Case 4b — confirmed with the team 2026-08-31. Uses a per-run-unique model so
  // nothing can already match; this case must genuinely create. Same bounded-growth
  // exception as TC29, and for the same reason — see the note on TC29 above. The
  // model must ALSO differ from TC29's within a run, or whichever test ran second
  // would reuse the first's product and its "a product must be CREATED" assertion
  // would fail; Date.now() gives that for free.
  it('SW-BB-SO-API-TC42: Verify a drifted Incoming item with no matching product creates one', { tags: ['@regression'] }, function () {
    requireComparableMapping(this);
    const mapping = configRow.configJson.mapping;
    const catId = configRow.configJson.categoryId;
    const unique = { ...api.data.driftProductValues, model: `BB-SO-NEW-${Date.now()}` };

    withIncomingItem(this, api.data.matchingProductValues, (serial, productIdBefore, token) => {
      return api.countProductsInCategory(catId, token).then((countBefore) => {
        return api.stockOut(api.buildMappedPayload(mapping, serial, unique), token).then((res) => {
          expect(res.status, 'a drifted Incoming item must still stock out').to.be.oneOf([200, 201]);

          api.findAuditEntries(serial, api.data.brainboxReplaceAction, token).then((entries) => {
            expect(entries.length, 'drift must write a BRAINBOX_REPLACE audit entry')
              .to.be.greaterThan(0);
          });
          api.countProductsInCategory(catId, token).then((countAfter) => {
            expect(countAfter, 'a product must be CREATED when nothing matches')
              .to.be.greaterThan(countBefore);
          });
          api.readHardwareInventory(serial, token).then((after) => {
            expect(api.itemProductIdFrom(after), 'item must move off its original product')
              .to.not.equal(productIdBefore);
            expect(api.itemStatusFrom(after), 'the serial must end StockedOut').to.equal('StockedOut');
          });
        });
      });
    });
  });

  // -- TC27 -- Stocking out the same serial twice is refused -------------------
    /**
     * Testcase ID: SW-BB-SO-API-TC27
     * Description: Verify that re-posting an already stocked-out serial is refused and does not move stock twice
     * Steps:
     *   1. Stock a fresh serial in, then stock it out (the first post succeeds).
     *   2. Post the identical payload a second time.
     * Expected Result: The second post is refused 4xx with "is already stocked out", and the item is not moved twice.
     */
  // Plan section 8 R4 flagged this as an ASSUMPTION to verify, not known-good: if
  // the service double-moved stock the suite had to surface it. Probed on QA
  // 2026-08-31 - it refuses correctly, so this now pins that behaviour.
  it('SW-BB-SO-API-TC27: Verify that stocking out the same serial twice is refused', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-TWICE`;
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, serial);

    api.stockIn(payload, token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.stockOut(payload, token).then((first) => {
        expect(first.status, 'the FIRST stock-out must succeed').to.be.oneOf([200, 201]);

        api.stockOut(payload, token).then((second) => {
          api.assertBadRequest(second, 'second stock-out of the same serial');
          const message = second.body?.error?.message || second.body?.message || '';
          expect(message, 'refusal must say the item is already stocked out')
            .to.match(/already stocked out/i);

          // ...and the item is still exactly StockedOut - refused, not re-moved.
          api.readHardwareInventory(serial, token).then((rd) => {
            expect(api.itemStatusFrom(rd), 'item stays StockedOut after the refused repost')
              .to.equal('StockedOut');
          });
        });
      });
    });
  });

  // -- TC28 -- Damaged item MUST stock out (BTO requirement) -- EXPECTED-RED ---
    /**
     * Testcase ID: SW-BB-SO-API-TC28
     * Description: Verify a Damaged item IS successfully stocked out (BTO requirement)
     * Steps:
     *   1. Stock a fresh serial in, mark it Damaged, and confirm the status took.
     *   2. Post a valid BrainBox payload for it.
     * Expected Result: 2xx and the item ends StockedOut. EXPECTED-RED on the
     *   current build, which refuses 400 "It's status is Damaged" — see pending.md.
     */
  it('SW-BB-SO-API-TC28: Verify a Damaged item is successfully stocked out', { tags: ['@regression'] }, function () {
    assertStocksOutDespiteStatus(this, 'Damaged');
  });

  // -- TC37 -- Missing item MUST stock out (BTO requirement) -- EXPECTED-RED ---
    /**
     * Testcase ID: SW-BB-SO-API-TC37
     * Description: Verify a Missing item IS successfully stocked out (BTO requirement)
     * Steps:
     *   1. Stock a fresh serial in, mark it Missing, and confirm the status took.
     *   2. Post a valid BrainBox payload for it.
     * Expected Result: 2xx and the item ends StockedOut. EXPECTED-RED on the
     *   current build, which refuses 400 "It's status is Missing" — see pending.md.
     */
  it('SW-BB-SO-API-TC37: Verify a Missing item is successfully stocked out', { tags: ['@regression'] }, function () {
    assertStocksOutDespiteStatus(this, 'Missing');
  });

  // -- TC38 -- Disputed item MUST stock out (BTO requirement) -- EXPECTED-RED --
    /**
     * Testcase ID: SW-BB-SO-API-TC38
     * Description: Verify a Disputed item IS successfully stocked out (BTO requirement)
     * Steps:
     *   1. Stock a fresh serial in, mark it Disputed, and confirm the status took.
     *   2. Post a valid BrainBox payload for it.
     * Expected Result: 2xx and the item ends StockedOut. EXPECTED-RED on the
     *   current build, which refuses 400 "It's status is Disputed" — see pending.md.
     */
  it('SW-BB-SO-API-TC38: Verify a Disputed item is successfully stocked out', { tags: ['@regression'] }, function () {
    assertStocksOutDespiteStatus(this, 'Disputed');
  });

  // -- TC39 -- Reserved item MUST stock out (BTO requirement) -- EXPECTED-RED --
    /**
     * Testcase ID: SW-BB-SO-API-TC39
     * Description: Verify an item Reserved on a work order IS successfully stocked out (BTO requirement)
     * Steps:
     *   1. Stock a fresh serial in and read back its productId.
     *   2. Create a throwaway work order and scan the item onto it (status -> Reserved).
     *   3. Post a valid BrainBox payload for it.
     * Expected Result: 2xx and the item ends StockedOut. EXPECTED-RED on the current
     *   build - Reserved throws unconditionally ahead of the BTO branch. See pending.md.
     */
  // Reserved is NOT seedable via mark-status (the backend allows only Damaged /
  // Disputed / Missing there and answers 400 "Invalid status: Reserved"), so this
  // reserves the item the way the product itself does: by putting it on a work order.
  //
  // Reserved is the hardest of the four: `stockOutBySerialNumber` throws for it
  // unconditionally (~751), BEFORE the BTO branch that rescues Missing/Damaged/
  // Disputed — so satisfying the requirement here needs a deeper fix than widening
  // the hardware wrapper's retry.
  it('SW-BB-SO-API-TC39: Verify a Reserved item is successfully stocked out', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-RESERVED`;
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, serial);

    api.stockIn(payload, token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.readHardwareInventory(serial, token).then((rd) => {
        const productId = api.itemProductIdFrom(rd);
        if (!productId) {
          cy.log('TC39: could not resolve productId for the seeded serial - skipping.');
          this.skip();
        }

        api.reserveItemViaWorkOrder(serial, productId, token).then((wo) => {
          if (!wo.workOrderNumber || wo.scanStatus >= 400) {
            cy.log(`TC39: work-order reservation unavailable (scan ${wo.scanStatus}) - skipping.`);
            this.skip();
          }
          reservedWorkOrders.push({ ...wo, productId, serial });

          api.readHardwareInventory(serial, token).then((after) => {
            expect(api.itemStatusFrom(after), 'item must really be Reserved before the stock-out')
              .to.equal('Reserved');

            api.stockOut(payload, token).then((res) => {
              expect(
                res.status,
                'REQUIREMENT: a Reserved item must stock out successfully ' +
                `(observed ${res.status}: ${JSON.stringify(res.body?.error?.message ?? res.body).slice(0, 200)})`
              ).to.be.oneOf([200, 201]);

              api.readHardwareInventory(serial, token).then((done) => {
                expect(api.itemStatusFrom(done), 'a Reserved item must end StockedOut')
                  .to.equal('StockedOut');
              });
            });
          });
        });
      });
    });
  });

  // ── TC13 ── spec-wrapped payload is normalised and accepted ─────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC13
     * Description: Verify a payload wrapped inside a "spec" key is normalised and accepted
     * Steps:
     *   1. Send a POST request to /incoming-items/hardware-stock-out with a payload wrapped inside a "spec" key.
     * Expected Result: API responds with 200/201 and assetIds are present in the response.
     */
  // Uses a fresh unique serial so the auto stock-in+out path is exercised.
  it('SW-BB-SO-API-TC13: Verify a payload wrapped inside a "spec" key is normalised and accepted', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const specSerial = `${api.uniqueStockOutSerial()}-SPEC`;
    const wrappedPayload = {
      spec: api.buildMinimalPayload(configRow.configJson.mapping, specSerial),
    };

    api.stockOut(wrappedPayload, token).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);

      const result = res.body.data[0];
      expect(result, 'spec-wrapped stock-out data[0] must be present').to.exist;
      expect(result.assetIds, 'assetIds must be an array').to.be.an('array');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // End-to-end contract: read-back, audit, response envelope (TC32–TC34)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // All three observe ONE stock-out from three angles, so they share a single
  // seeded serial rather than each minting their own: the read-back, the audit
  // row and the response envelope must all describe the same event, and seeding
  // three separate ones would let a bug that only affects (say) the auto
  // stock-in path hide behind a different seed per test.
  //
  // The seed runs in a before() and NOT inside one of the it()s: the three tests
  // carry different tags, so `--env grepTags=@smoke` selects TC32 alone and a
  // sibling-it() seed would simply not run (the trap documented on
  // BrainboxStockInAPI TC18). A before() hook is selected with whichever test
  // survives the filter.

  let contractSerial;      // stocked in, then stocked out — the shared subject
  let contractResponse;    // the stock-out response, for TC34's envelope assertions
  let contractFreshSerial; // never stocked in — exercises the auto stock-in path
  let contractFreshResponse;

  before(function () {
    if (!serialMapping) return;
    const token = Cypress.env('bbApiAdminToken');
    const mapping = configRow.configJson.mapping;

    contractSerial = `${api.uniqueStockOutSerial()}-CONTRACT`;
    contractFreshSerial = `${api.uniqueStockOutSerial()}-CONTRACTNEW`;

    const seeded = api.buildMinimalPayload(mapping, contractSerial);
    api.stockIn(seeded, token).then((si) => {
      if (si.status >= 300) return;
      api.stockOut(seeded, token).then((res) => {
        contractResponse = res;
      });
    });

    // Second subject: a serial the service must stock IN before stocking out, so
    // TC34 can assert the extra `message` + `assetIds` the fallback path returns.
    api.stockOut(api.buildMinimalPayload(mapping, contractFreshSerial), token).then((res) => {
      contractFreshResponse = res;
    });
  });

  // ── TC32 ── hardware-inventory read-back reflects the stock-out ─────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC32
     * Description: Verify the hardware-inventory read-back reflects the stock-out
     * Steps:
     *   1. Stock a serial in and stock it out (shared before() seed).
     *   2. GET /incoming-items/hardware-inventory for that serial.
     * Expected Result: The row reports status StockedOut and sits on the configured BrainBox PO.
     */
  // The read-back is the ONLY assertion that proves the write was durable: the
  // stock-out response is generated inside the same request, so a transaction that
  // reported success and rolled back would still satisfy TC12.
  it('SW-BB-SO-API-TC32: Verify the hardware-inventory read-back reflects the stock-out', { tags: ['@smoke'] }, function () {
    if (!serialMapping) this.skip();
    if (!contractResponse) {
      cy.log('TC32: the shared contract seed did not stock out — skipping.');
      this.skip();
    }

    const token = Cypress.env('bbApiAdminToken');
    expect(contractResponse.status, 'seed stock-out must have succeeded').to.be.oneOf([200, 201]);

    api.readHardwareInventory(contractSerial, token).then((res) => {
      const row = api.hardwareInventoryRow(res);
      expect(row, 'the stocked-out serial must still be readable').to.exist;
      expect(row.status, 'read-back must report StockedOut').to.equal('StockedOut');
      expect(
        row.poNumber,
        'the item must sit on the PO the brainboxConfig names'
      ).to.equal(configRow.configJson.poNumber);
    });
  });

  // ── TC33 ── an audit-trail entry is written for the stock-out ───────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC33
     * Description: Verify an audit-trail entry is written naming the acting user
     * Steps:
     *   1. Stock a serial in and stock it out (shared before() seed).
     *   2. GET /audit-trails for that serial.
     * Expected Result: An entry exists for the item whose actionType is the stock-out
     *   action and which names the acting user.
     */
  // Asserted over ALL entries for the serial rather than a filtered STOCKOUT query:
  // product-stock-out.service.ts writes `btoSold ? btoSold : 'STOCKOUT'`, so the BTO
  // branch logs `BTO -> SOLD` instead. Filtering on one spelling would make this
  // pass or fail according to which branch ran, which is not what it is testing.
  it('SW-BB-SO-API-TC33: Verify an audit-trail entry is written for the stock-out', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();
    if (!contractResponse) {
      cy.log('TC33: the shared contract seed did not stock out — skipping.');
      this.skip();
    }

    const token = Cypress.env('bbApiAdminToken');

    api.findAuditEntriesForSerial(contractSerial, token).then((entries) => {
      const observed = entries.map((e) => e?.actionType).join(', ') || '(none)';
      expect(
        entries.length,
        `the stock-out must be auditable (observed actionTypes: ${observed})`
      ).to.be.greaterThan(0);

      const stockOutish = entries.filter((e) =>
        /stock\s*out|stockout|sold/i.test(String(e?.actionType ?? ''))
      );
      expect(
        stockOutish.length,
        `an entry must record the stock-out itself (observed: ${observed})`
      ).to.be.greaterThan(0);

      // An audit row that cannot say WHO acted is not an audit row. Both columns
      // are checked because userName is the human-readable one and userID is the
      // one a query joins on.
      const named = stockOutish.find(
        (e) => String(e?.userName ?? '').trim() !== '' || String(e?.userID ?? '').trim() !== ''
      );
      expect(named, 'the stock-out entry must name the acting user').to.exist;
      expect(
        String(named.entityType ?? ''),
        'the entry must be filed against the Item'
      ).to.match(/item/i);
    });
  });

  // ── TC34 ── the response envelope carries serialNumber + assetId ────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC34
     * Description: Verify the response envelope carries serialNumber and assetId, plus message on the fallback path
     * Steps:
     *   1. Read the stock-out response for an already-Available serial.
     *   2. Read the stock-out response for a serial that had to be stocked in first.
     * Expected Result: Both carry data[0] with a non-empty serialNumber and an assetId;
     *   the auto-stock-in response additionally carries message and assetIds.
     */
  // BrainBox consumes this envelope, so its shape is a published contract, not an
  // implementation detail — a field quietly renamed here breaks the integration
  // without breaking any status-code assertion in this suite.
  it('SW-BB-SO-API-TC34: Verify the stock-out response envelope carries serialNumber and assetId', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();
    if (!contractResponse) {
      cy.log('TC34: the shared contract seed did not stock out — skipping.');
      this.skip();
    }

    expect(contractResponse.body?.success, 'envelope must report success').to.not.equal(false);
    const result = contractResponse.body?.data?.[0];
    expect(result, 'data[0] must be present').to.exist;

    // WHERE THE SERIAL LIVES. The plan's wording said "data[0] carries a
    // non-empty serialNumber"; the service does not put one there. Probed on QA
    // 2026-09-02, data[0] is
    //   { status, message, productId, assetId, assetIds: [{ serialNumber, assetId }] }
    // — normalizeHardwareAssetResponse builds assetIds and lifts assetIds[0]
    // into a top-level assetId. So the serial is carried per-asset, which is the
    // shape BrainBox consumes; the plan was imprecise, not the build. Asserted
    // across every place it may legitimately appear so a future flattening of
    // the envelope does not read as a regression.
    const serialsInEnvelope = [
      result.serialNumber,
      ...(Array.isArray(result.assetIds) ? result.assetIds.map((a) => a?.serialNumber) : []),
      ...(Array.isArray(result.results) ? result.results.map((r) => r?.serialNumber) : []),
    ]
      .filter((v) => v !== undefined && v !== null && String(v) !== '')
      .map((v) => String(v).toLowerCase());
    expect(
      serialsInEnvelope,
      `the envelope must name the serial it acted on (data[0] keys: ${Object.keys(result).join(', ')})`
    ).to.include(contractSerial.toLowerCase());

    // assetId is the label BrainBox prints. It may arrive top-level (existing
    // item) or only inside assetIds (freshly stocked in) — require one of them.
    const anyAssetId =
      (result.assetId !== undefined && result.assetId !== null && result.assetId !== '') ||
      (Array.isArray(result.assetIds) && result.assetIds.length > 0);
    expect(anyAssetId, 'data[0] must carry an assetId (or a non-empty assetIds)').to.be.true;
    expect(String(result.message ?? ''), 'data[0] must carry a message').to.not.equal('');

    // The auto-stock-in path additionally explains itself.
    if (!contractFreshResponse || contractFreshResponse.status >= 300) {
      cy.log('TC34: the auto-stock-in subject did not stock out — fallback half not asserted.');
      return;
    }
    const fresh = contractFreshResponse.body?.data?.[0];
    expect(fresh, 'auto-stock-in data[0] must be present').to.exist;
    expect(String(fresh.message ?? ''), 'the fallback path must explain itself in message')
      .to.include('stocked in and then stocked out');
    expect(fresh.assetIds, 'the fallback path must return assetIds').to.be.an('array');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Concurrency (TC35)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── TC35 ── two concurrent posts yield exactly one stock-out ───────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC35
     * Description: Verify two genuinely concurrent stock-out posts move the item exactly once
     * Steps:
     *   1. Stock a serial in so it is Available.
     *   2. Fire two identical stock-out requests in parallel from Node.
     *   3. Read the item back and count its stock-out audit entries.
     * Expected Result: Exactly one request reports success, the item ends StockedOut,
     *   and exactly one stock-out audit entry exists.
     */
  // Cypress queues its commands, so two chained cy.request calls are strictly
  // SEQUENTIAL and cannot express concurrency — a version of this test built on
  // them would assert the sequential contract (already covered by TC27) while
  // claiming to cover simultaneity. The two posts are therefore issued from Node
  // with Promise.all via the `postJsonParallel` task.
  //
  // A transport-level failure on the loser is acceptable (it means the transaction
  // held); what must never happen is two successes or a double move.
  //
  // Observed on QA 2026-09-02: statuses `409, 201` — the loser is refused with a
  // real Conflict, not a silent second success. Proven live by mutation (asserting
  // 2 winners fails with "expected 1 to equal 2"), so this is not passing vacuously.
  it('SW-BB-SO-API-TC35: Verify two concurrent stock-out posts move the item exactly once', { tags: ['@regression'] }, function () {
    if (!serialMapping) this.skip();

    const token = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-RACE`;
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, serial);

    api.stockIn(payload, token).then((si) => {
      expect(si.status, 'seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.readHardwareInventory(serial, token).then((before) => {
        expect(api.itemStatusFrom(before), 'seeded item must be Available').to.equal('Available');

        api.stockOutConcurrently(payload, token, 2).then((responses) => {
          expect(responses, 'both requests must return an outcome').to.have.length(2);
          const statuses = responses.map((r) => r.status).join(', ');
          const winners = api.successfulResponses(responses);

          expect(
            winners.length,
            `exactly one concurrent post may succeed (statuses: ${statuses})`
          ).to.equal(1);
          responses.forEach((r) => {
            expect(r.status, `no concurrent post may 5xx (statuses: ${statuses})`).to.be.lessThan(500);
          });

          api.readHardwareInventory(serial, token).then((after) => {
            expect(api.itemStatusFrom(after), 'the item must end StockedOut').to.equal('StockedOut');
          });

          // The decisive assertion: one physical move, therefore one audit row.
          api.findAuditEntriesForSerial(serial, token).then((entries) => {
            const stockOuts = entries.filter((e) =>
              /stock\s*out|stockout|sold/i.test(String(e?.actionType ?? ''))
            );
            expect(
              stockOuts.length,
              'the item must be stocked out exactly ONCE, never twice'
            ).to.equal(1);
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Configuration guards and tenancy, asserted against the SECOND organisation
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // TC30/TC31 need the endpoint to answer with a BROKEN brainboxConfig. The plan's
  // original answer was to mutate the shared global row and restore it (§8 R1) —
  // exactly the hazard the 2026-09-01 review closed, and the reason these two were
  // Manual. Both are now automated WITHOUT that hazard by asserting against the
  // second declared organisation instead:
  //
  //   * org B has no brainboxConfig row at all (verified on QA 2026-09-02), so
  //     TC30's empty-mapping guard fires with NO mutation whatsoever;
  //   * TC31 creates a throwaway row in org B carrying a mapping but no poNumber,
  //     and deletes it in after(). Org B runs no BrainBox integration and no other
  //     suite, so its config is a disposable fixture rather than shared state.
  //
  // Org A's row — the one production BrainBox reads — is never touched.
  //
  // Stubbing is not an option here: cy.intercept does not see cy.request (it is
  // issued from Node, not the browser), and stubbing the RESPONSE would assert the
  // stub rather than the backend guard these TCs exist to pin.

  let orgBToken = null;
  let orgBAlias = null;
  const orgBConfigRows = [];

  before(() => {
    // Declared last on purpose: this signs the BROWSER into org B, and every test
    // authenticates its cy.request with a token captured in Cypress.env, so the
    // browser session is not load-bearing after setupSuite() has run.
    cy.otherTenants().then((others) => {
      if (!others.length) {
        cy.log(
          'No second tenant declared in cypress.env.json — TC30/TC31/TC36 will skip. ' +
          'Add a tenants.<alias>.admin block (shape in cypress.env.example.json).'
        );
        return;
      }
      orgBAlias = others[0];
      cy.credentials('admin', { tenant: orgBAlias }).then(({ username, password }) => {
        if (!username || !password) {
          cy.log(`Tenant "${orgBAlias}" has no admin credentials — TC30/TC31/TC36 will skip.`);
          return;
        }
        cy.login(username, password, { optional: true }).then(() => {
          cy.getAuthToken().then((t) => {
            orgBToken = t || null;
            cy.log(
              orgBToken
                ? `Second organisation "${orgBAlias}" authenticated for TC30/TC31/TC36.`
                : `Could not authenticate tenant "${orgBAlias}" — TC30/TC31/TC36 will skip.`
            );
            if (!orgBToken) return;
            // Self-repair the ONE signature this spec is responsible for: a
            // throwaway config row TC31 created and an interrupted run never
            // deleted. Without this, that leak silently disables BOTH TC30 and
            // TC31 on every later run, with skip messages indistinguishable from
            // "no second tenant declared". Same reasoning as setupSuite()'s
            // empty-mapping repair for org A, and just as narrow.
            api.reclaimLeakedThrowawayConfig(orgBToken);
          });
        });
      });
    });
  });

  after(() => {
    // Remove TC31's throwaway config row. Org B only, and only rows this spec made.
    if (!orgBToken) return;
    orgBConfigRows.forEach((id) => api.deleteConfigRow(id, orgBToken));
  });

  /** Skip guard for the cross-tenant TCs. */
  const requireOrgB = (ctx) => {
    if (!orgBToken) {
      cy.log('TC requires a second organisation with admin credentials — skipping.');
      ctx.skip();
    }
  };

  // ── TC30 ── an organisation with no mapping is refused ─────────────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC30
     * Description: Verify a stock-out is refused when the caller's org has no BrainBox mapping
     * Steps:
     *   1. Confirm the second organisation has no brainboxConfig mapping.
     *   2. POST a valid-shaped payload as that organisation's admin.
     * Expected Result: A client error naming the unconfigured mapping; nothing is created.
     */
  it('SW-BB-SO-API-TC30: Verify a stock-out is refused when the org has no BrainBox mapping', { tags: ['@regression'] }, function () {
    requireOrgB(this);

    // Verify the precondition rather than assuming it: if someone configures
    // BrainBox for org B, this test must SKIP, not silently invert its meaning.
    api.readBrainBoxConfig(orgBToken).then((row) => {
      const mapping = row?.configJson?.mapping || {};
      if (Object.keys(mapping).length > 0) {
        // NOT the interrupted-run leak — the before() hook reclaims that shape
        // before any test runs. Reaching here means org B carries a genuine
        // BrainBox configuration, so this TC has nowhere unconfigured to assert
        // against and must skip rather than invert its own meaning.
        cy.log(
          `Tenant "${orgBAlias}" carries a REAL brainboxConfig (mapping: ` +
          `${JSON.stringify(mapping)}, poNumber: ${row?.configJson?.poNumber ?? 'none'}), so the ` +
          'unconfigured guard cannot be reached from it — skipping rather than asserting the ' +
          'wrong thing. This is NOT a leaked throwaway row: those are reclaimed in before().'
        );
        this.skip();
      }

      const serial = `${api.uniqueStockOutSerial()}-NOCFG`;
      // Payload key from the fixture, not inlined: org B has no mapping to build
      // from, but the wire key still belongs in data. (TC19 is the one place a
      // literal key is correct — it exists to test the `serialNumber` alias.)
      api.stockOut({ [api.data.serialPayloadKey]: serial }, orgBToken).then((res) => {
        api.assertBadRequest(res, 'stock-out with no configured mapping');
        const message = res.body?.error?.message || res.body?.message || '';
        expect(message, 'the refusal must name the unconfigured mapping')
          .to.match(/mapping is not configured/i);

        // The guard must fire BEFORE any inventory is touched (plan §8 R2).
        api.readHardwareInventory(serial, orgBToken).then((rd) => {
          expect(api.hardwareInventoryRow(rd), 'no item may be created by a refused call')
            .to.equal(null);
        });
      });
    });
  });

  // ── TC31 ── an organisation whose config has no poNumber is refused ────────
    /**
     * Testcase ID: SW-BB-SO-API-TC31
     * Description: Verify a stock-out is refused when the caller's BrainBox config has no poNumber
     * Steps:
     *   1. Create a brainboxConfig row in the second organisation carrying a mapping but no poNumber.
     *   2. POST a valid payload as that organisation's admin.
     *   3. Delete the throwaway row.
     * Expected Result: A client error naming the missing PO number; nothing is created.
     */
  // The guard order matters and is the reason this needs a mapping: the service
  // checks mapping-empty FIRST and only then poNumber, so a row without a mapping
  // would return TC30's message and this test would pass for the wrong reason.
  it('SW-BB-SO-API-TC31: Verify a stock-out is refused when the BrainBox config has no poNumber', { tags: ['@regression'] }, function () {
    requireOrgB(this);

    api.readBrainBoxConfig(orgBToken).then((existing) => {
      if (existing) {
        // A leaked throwaway from an interrupted run is already gone (reclaimed in
        // before()), so a row here is somebody's real configuration. This test
        // creates its own and will never overwrite one.
        cy.log(
          `Tenant "${orgBAlias}" already has a REAL brainboxConfig row (id ${existing.id}); ` +
          'this test creates its own and will not overwrite one — skipping. Leaked throwaway ' +
          'rows are reclaimed in before(), so this is not one.'
        );
        this.skip();
      }

      api.createConfigRow(
        {
          name: api.data.brainboxConfigName,
          type: api.data.brainboxConfigType,
          // `userID`, capital ID — createConfigSchema requires it and rejects
          // `userId` as an unknown key (verified against QA 2026-09-02).
          userID: api.data.brainboxConfigUserId,
          // Mapping present, poNumber deliberately absent — that is the whole
          // fixture. categoryId is deliberately omitted too: the guard order is
          // mapping-empty then poNumber, so a category is never consulted, and
          // copying org A's categoryId into org B's config would plant an id that
          // does not resolve in org B.
          configJson: {
            mapping: { [api.data.serialPayloadKey]: 'serialNumber' },
          },
        },
        orgBToken
      ).then((created) => {
        const id = created.body?.data?.id ?? created.body?.id ?? null;
        if (created.status >= 300 || !id) {
          cy.log(`TC31: could not create a throwaway config in "${orgBAlias}" (${created.status}) — skipping.`);
          this.skip();
        }
        orgBConfigRows.push(id);

        const serial = `${api.uniqueStockOutSerial()}-NOPO`;
        api.stockOut({ [api.data.serialPayloadKey]: serial }, orgBToken).then((res) => {
          api.assertBadRequest(res, 'stock-out with no configured poNumber');
          const message = res.body?.error?.message || res.body?.message || '';
          expect(message, 'the refusal must name the missing PO number')
            .to.match(/missing PO number/i);

          api.readHardwareInventory(serial, orgBToken).then((rd) => {
            expect(api.hardwareInventoryRow(rd), 'no item may be created by a refused call')
              .to.equal(null);
          });
        });
      });
    });
  });

  // ── TC36 ── one organisation cannot stock out another's serial ─────────────
    /**
     * Testcase ID: SW-BB-SO-API-TC36
     * Description: Verify an organisation cannot stock out a serial belonging to another organisation
     * Steps:
     *   1. Stock a serial in as org A so it is Available there.
     *   2. Confirm org B cannot see it.
     *   3. Post a stock-out for that serial as org B's admin.
     *   4. Re-read the serial as org A.
     * Expected Result: Org A's item stays Available. Org B either refuses or acts only
     *   on its own new item — never on org A's row.
     */
  // Org B has no brainboxConfig (see the block comment above), so its call is
  // expected to be refused by the mapping guard. The assertion that carries the
  // weight is therefore step 4: whatever org B's call does, org A's item must be
  // untouched. That holds whether org B is configured or not, which is why this
  // test does not depend on org B's config state the way TC30/TC31 do.
  it('SW-BB-SO-API-TC36: Verify one organisation cannot stock out another organisation serial', { tags: ['@regression'] }, function () {
    requireOrgB(this);
    if (!serialMapping) this.skip();

    const tokenA = Cypress.env('bbApiAdminToken');
    const serial = `${api.uniqueStockOutSerial()}-XORG`;
    const payload = api.buildMinimalPayload(configRow.configJson.mapping, serial);

    api.stockIn(payload, tokenA).then((si) => {
      expect(si.status, 'org A seed stock-in must succeed').to.be.oneOf([200, 201]);

      api.readHardwareInventory(serial, tokenA).then((beforeA) => {
        expect(api.itemStatusFrom(beforeA), 'org A item must start Available').to.equal('Available');

        // Isolation precondition: if org B can already SEE the row, the two
        // aliases are the same organisation and this test proves nothing.
        api.readHardwareInventory(serial, orgBToken).then((beforeB) => {
          if (api.hardwareInventoryRow(beforeB)) {
            cy.log(
              `Tenant "${orgBAlias}" can read org A serials, so the two aliases resolve to the ` +
              'SAME organisation — skipping rather than reporting a false isolation pass.'
            );
            this.skip();
          }

          api.stockOut(payload, orgBToken).then((res) => {
            expect(res.status, 'the cross-org call must not 5xx').to.be.lessThan(500);

            // The decisive assertion: org A's row is untouched.
            api.readHardwareInventory(serial, tokenA).then((afterA) => {
              const row = api.hardwareInventoryRow(afterA);
              expect(row, 'org A item must still exist').to.exist;
              expect(row.status, 'org A item must remain Available').to.equal('Available');
            }).then(() => {
              // Pair the mutation with its inverse (coverage.md convention 5):
              // every other serial this suite creates ends StockedOut, and an
              // Available leftover per run would accumulate as phantom stock.
              // Done AFTER the assertion so cleanup cannot mask the result.
              api.stockOut(payload, tokenA);
            });
          });
        });
      });
    });
  });
});

/**
 * Sample Stock-Out Test Body (Reference)
 * --------------------------------------
 * {
 *   "serialNumber": "APITEST001",
 *   "spec": {
 *     "serial_id": 758915,
 *     "serial": "APITEST001",
 *     "make": "HP",
 *     "model": "HP Pro book 800 G5 Desktop Mini",
 *     "cpu": "HP i5-9500T CPU @ 2.20GHz",
 *     "ram": 17179869184,
 *     "ram_fmt": "16 GB",
 *     "disk1_name": "KXG50ZNV256G TOSHIBA",
 *     "disk1_serial": null,
 *     "disk1_size": 256052966400,
 *     "disk1_size_fmt": "256 GB",
 *     "disk2_name": null,
 *     "disk2_serial": null,
 *     "disk2_size": null,
 *     "disk2_size_fmt": null,
 *     "gpu1": "not collected",
 *     "gpu2": "not collected"
 *   }
 * }
 *
 * Use this as a reference for valid/typical payloads in manual test cases.
 */
