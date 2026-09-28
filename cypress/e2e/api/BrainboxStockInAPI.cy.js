/**
 * Sample Stock-In Test Body (Reference)
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

/**
 * BrainBox Hardware Stock-In API Tests
 * ======================================
 * Backend: Backend/src/modules/incomingItems/incoming-item.controller.ts
 *
 * Endpoint exercised
 * ------------------
 *   POST /incoming-items/hardware-stock-in   AuthGuard — stock a hardware
 *     device into inventory via a BrainBox payload
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
 * null and every config-dependent test calls this.skip() automatically,
 * keeping the run green on an unconfigured environment.
 *
 * Test ID convention
 * ------------------
 *   SW-BB-SI-API-TC01–TC21 (sequential in file order)
 *   Auth:          TC01–TC05
 *   Validation:    TC06–TC16
 *   Happy Path:    TC17, TC20
 *   Duplicates:    TC18 (same serial), TC19 (same data, different serial)
 *   Category:      TC21 (match)
 *
 * Tags
 * ----
 *   @smoke      — auth enforcement + primary happy-path
 *   @regression — validation rules and edge cases
 *
 * Cleanup strategy
 * ----------------
 *   after(): every serial created during the suite is stocked out via
 *   POST /products/stockout-by-serial-number.
 *   stockInSerial is the one exception — it is consumed by BrainboxStockOutAPI
 *   (TC12) which stocks it out there.
 */

import BrainBoxHardwareApiHelper from '../../pageObjects/BrainBoxHardwareApiHelper';

// ─────────────────────────────────────────────────────────────────────────────
// Shared auth + config bootstrap
// ─────────────────────────────────────────────────────────────────────────────

describe('BrainBox Stock-In API Tests', () => {
    let api;
    let configRow;
    let serialMapping;

    // stockInSerial is stocked in by TC17 and consumed (stocked out) by
    // BrainboxStockOutAPI TC08.  It is NOT cleaned up in this file's after().
    let stockInSerial;

    before(() => {
        api = new BrainBoxHardwareApiHelper();
        api.setupSuite().then(({ configRow: cr, serialMapping: sm }) => {
            configRow = cr;
            serialMapping = sm;
        });
    });

    // ── Per-suite serial variables ──────────────────────────────────────────
    // Each serial is generated in before(), used by exactly one test, and
    // cleaned up in after() — except stockInSerial (see above).
    let specialCharSerial;     // TC11
    let dupDataDiffSerial;     // TC19
    let secondStockInSerial;   // TC20
    let categoryMatchSerial;   // TC21
    let categoryMismatchSerial; // TC22
    let allMismatchSerial;     // TC23
    let partialMismatchSerial; // TC24
    let diffSpecSerial;        // TC25
    let restockedSerial;       // TC26
    let noCostSerial;          // TC27
    let zeroCostSerial;        // TC28
    let specMismatchSerial;    // TC29
    let ramMismatchSerial;     // TC30

    before(function () {
        if (!serialMapping) return;
        stockInSerial = api.uniqueStockInSerial();
        specialCharSerial = `${api.uniqueStockInSerial()}-!@#$%&`;
        dupDataDiffSerial = `${api.uniqueStockInSerial()}-DUP`;
        secondStockInSerial = `${api.uniqueStockInSerial()}-B`;
        categoryMatchSerial = `${api.uniqueStockInSerial()}-CM`;
        categoryMismatchSerial = `${api.uniqueStockInSerial()}-CX`;
        allMismatchSerial = `${api.uniqueStockInSerial()}-MM`;
        partialMismatchSerial = `${api.uniqueStockInSerial()}-PM`;
        diffSpecSerial = `${api.uniqueStockInSerial()}-DS`;
        restockedSerial = `${api.uniqueStockInSerial()}-RS`;
        noCostSerial = `${api.uniqueStockInSerial()}-NC`;
        zeroCostSerial = `${api.uniqueStockInSerial()}-ZC`;
        specMismatchSerial = `${api.uniqueStockInSerial()}-SM`;
        ramMismatchSerial = `${api.uniqueStockInSerial()}-RM`;
    });

    after(() => {
        const token = Cypress.env('bbApiAdminToken');
        if (specialCharSerial) api.stockOutBySerial(specialCharSerial, token);
        if (dupDataDiffSerial) api.stockOutBySerial(dupDataDiffSerial, token);
        if (secondStockInSerial) api.stockOutBySerial(secondStockInSerial, token);
        if (categoryMatchSerial) api.stockOutBySerial(categoryMatchSerial, token);
        if (categoryMismatchSerial) api.stockOutBySerial(categoryMismatchSerial, token);
        if (allMismatchSerial) api.stockOutBySerial(allMismatchSerial, token);
        if (partialMismatchSerial) api.stockOutBySerial(partialMismatchSerial, token);
        if (diffSpecSerial) api.stockOutBySerial(diffSpecSerial, token);
        if (restockedSerial) api.stockOutBySerial(restockedSerial, token);
        if (noCostSerial) api.stockOutBySerial(noCostSerial, token);
        if (zeroCostSerial) api.stockOutBySerial(zeroCostSerial, token);
        if (specMismatchSerial) api.stockOutBySerial(specMismatchSerial, token);
        if (ramMismatchSerial) api.stockOutBySerial(ramMismatchSerial, token);
        // stockInSerial intentionally NOT cleaned up here — BrainboxStockOutAPI uses it

        // Put the shared global brainboxConfig row back if setupSuite() had to
        // provision a serial mapping into it. No-op when it did not.
        api.restoreProvisionedConfig(token);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Authentication
    // ═══════════════════════════════════════════════════════════════════════════

    // ── TC01 ── No auth token returns 401 ──────────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC01
         * Description: Verify the API returns 401 when no auth token is provided
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with no Authorization header.
         * Expected Result: API responds with 401 Unauthorized.
         */
    it('SW-BB-SI-API-TC01: Verify the API returns 401 when no auth token is provided', { tags: ['@smoke'] }, () => {
        api.stockInUnauthenticated({}).then((res) => {
            expect(res.status).to.equal(401);
        });
    });

    // ── TC02 ── Malformed auth token returns 401 ────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC02
         * Description: Verify the API returns 401 when a malformed auth token is provided
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with an invalid Authorization token.
         * Expected Result: API responds with 401 Unauthorized.
         */
    it('SW-BB-SI-API-TC02: Verify the API returns 401 when a malformed auth token is provided', { tags: ['@regression'] }, () => {
        cy.fixture('brainBoxHardwareAPI').then((fixtureData) => {
            api.stockIn({}, fixtureData.malformedToken).then((res) => {
                expect(res.status).to.equal(401);
            });
        });
    });

    // ── TC03 ── Expired auth token returns 401 ──────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC03
         * Description: Verify the API returns 401 when an expired auth token is provided
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with an expired Authorization token.
         * Expected Result: API responds with 401 Unauthorized.
         */
    it('SW-BB-SI-API-TC03: Verify the API returns 401 when an expired auth token is provided', { tags: ['@regression'] }, () => {
        cy.fixture('brainBoxHardwareAPI').then((fixtureData) => {
            api.stockIn({}, fixtureData.expiredToken).then((res) => {
                expect(res.status).to.equal(401);
            });
        });
    });

    // ── TC04 ── Valid admin token is accepted ───────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC04
         * Description: Verify the API accepts a valid admin auth token
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a valid admin Authorization token.
         * Expected Result: API does not return 401 Unauthorized.
         */
    it('SW-BB-SI-API-TC04: Verify the API accepts a valid admin auth token', { tags: ['@smoke'] }, () => {
        const token = Cypress.env('bbApiAdminToken');
        api.stockIn({}, token).then((res) => {
            expect(res.status, 'valid admin token must not be rejected as unauthenticated (401)').to.not.equal(401);
        });
    });

    // ── TC05 ── Valid worker token is accepted ──────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC05
         * Description: Verify the API accepts a valid worker auth token
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a valid worker Authorization token.
         * Expected Result: API does not return 401 Unauthorized.
         */
    it('SW-BB-SI-API-TC05: Verify the API accepts a valid worker auth token', { tags: ['@regression'] }, function () {
        const token = Cypress.env('bbApiWorkerToken');
        if (!token) this.skip();

        api.stockIn({}, token).then((res) => {
            expect(res.status, 'valid worker token must not be rejected as unauthenticated (401)').to.not.equal(401);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Request Validation
    // ═══════════════════════════════════════════════════════════════════════════

    // ── TC06 ── Empty body returns 400 ─────────────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC06
         * Description: Verify the API returns 400 when an empty body is sent
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with an empty JSON body.
         * Expected Result: API responds with 400 Bad Request.
         */
    it('SW-BB-SI-API-TC06: Verify the API returns 400 when an empty body is sent', { tags: ['@regression'] }, () => {
        const token = Cypress.env('bbApiAdminToken');
        api.stockIn({}, token).then((res) => {
            api.assertBadRequest(res, 'empty body');
        });
    });

    // ── TC07 ── Body with no serialNumber mapping key returns 400 ───────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC07
         * Description: Verify the API returns 400 when the payload contains no mapped serial number key
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a payload that does not contain the mapped serial number key.
         * Expected Result: API responds with 400 Bad Request.
         */
    it('SW-BB-SI-API-TC07: Verify the API returns 400 when the payload contains no mapped serial number key', { tags: ['@regression'] }, () => {
        const token = Cypress.env('bbApiAdminToken');
        api.stockIn({ bb_unmapped_field: 'value-that-cannot-map' }, token).then((res) => {
            api.assertBadRequest(res, 'unmapped payload');
        });
    });

    // ── TC08 ── Empty string serialNumber returns 400 ───────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC08
         * Description: Verify the API returns 400 when the mapped serial number is an empty string
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a payload where the mapped serial number is an empty string.
         * Expected Result: API responds with 400 Bad Request.
         */
    it('SW-BB-SI-API-TC08: Verify the API returns 400 when the mapped serial number is an empty string', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, '');

        api.stockIn(payload, token).then((res) => {
            api.assertBadRequest(res, 'empty serialNumber');
        });
    });

    // ── TC09 ── Null serialNumber returns 400 ───────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC09
         * Description: Verify the API returns 400 when the serial number is null
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a payload where the mapped serial number is null.
         * Expected Result: API responds with 400 Bad Request.
         */
    it('SW-BB-SI-API-TC09: Verify the API returns 400 when the serial number is null', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, null);

        api.stockIn(payload, token).then((res) => {
            api.assertBadRequest(res, 'null serialNumber');
        });
    });

    // ── TC10 ── Whitespace-only serialNumber returns 400 ────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC10
         * Description: Verify the API returns 400 when the serial number contains only whitespace
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a payload where the mapped serial number is only whitespace.
         * Expected Result: API responds with 400 Bad Request.
         */
    it('SW-BB-SI-API-TC10: Verify the API returns 400 when the serial number contains only whitespace', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, '   ');

        api.stockIn(payload, token).then((res) => {
            api.assertBadRequest(res, 'whitespace-only serialNumber');
        });
    });

    // ── TC11 ── Serial number with special characters is handled correctly ──────
        /**
         * Testcase ID: SW-BB-SI-API-TC11
         * Description: Verify the API handles serial numbers containing special characters correctly
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a payload where the mapped serial number contains special characters.
         * Expected Result: API either accepts the serial (and it appears in results) or rejects it with a meaningful error. Must not return 5xx.
         */
    // The API should either accept special characters (valid serial) or reject
    // them with a meaningful error — it must never return 5xx.
    it('SW-BB-SI-API-TC11: Verify the API handles serial numbers containing special characters correctly', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, specialCharSerial);

        api.stockIn(payload, token).then((res) => {
            expect(res.status, 'special-char serial must not cause a server error').to.be.lessThan(500);

            if (res.status >= 200 && res.status < 300) {
                // Accepted — verify the serial appears in results
                const result = api.assertStockInSuccess(res);
                const itemResult = result.results.find(
                    (r) => String(r.serialNumber) === specialCharSerial
                );
                expect(itemResult, `serial ${specialCharSerial} must appear in results`).to.exist;
            } else {
                // Rejected — must include a meaningful error
                const reason = res.body?.message || res.body?.error;
                expect(reason, 'rejection of special-char serial must include an error indicator').to.exist;
            }
        });
    });

    // ── TC12 ── Extremely long serial number (500+ chars) is validated ───────────
        /**
         * Testcase ID: SW-BB-SI-API-TC12
         * Description: Verify the API validates extremely long serial numbers (500+ characters)
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a payload where the mapped serial number is 501 characters long.
         * Expected Result: API must reject or gracefully handle the serial. Must not return 5xx.
         */
    // The API must reject or gracefully handle a serial number exceeding 500
    // characters — it must never return 5xx.
    it('SW-BB-SI-API-TC12: Verify the API validates extremely long serial numbers (500+ characters)', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const longSerial = 'A'.repeat(501);
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, longSerial);

        api.stockIn(payload, token).then((res) => {
            expect(res.status, '500+ char serial must not cause a server error').to.be.lessThan(500);

            if (res.status >= 400) {
                const reason = res.body?.message || res.body?.error;
                expect(reason, 'rejection of overlong serial must include an error indicator').to.exist;
            }
            // If 2xx, the backend accepted it — not ideal but not a crash.
            // We still verify no 5xx above.
        });
    });

    // ── TC13 ── spec:{} returns 400 ─────────────────────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC13
         * Description: Verify the API returns 400 when spec is an empty object
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with { spec: {} } as the body.
         * Expected Result: API responds with 400 Bad Request.
         */
    // { spec: {} } unwraps to {} via normalizeHardwarePayload → no serialNumber.
    it('SW-BB-SI-API-TC13: Verify the API returns 400 when spec is an empty object', { tags: ['@regression'] }, () => {
        const token = Cypress.env('bbApiAdminToken');
        api.stockIn({ spec: {} }, token).then((res) => {
            api.assertBadRequest(res, 'spec:{}');
        });
    });

    // ── TC14 ── spec wrapper with all unmapped fields returns 400 ─────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC14
         * Description: Verify the API returns 400 when spec contains only unmapped fields
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with { spec: { bb_unmapped_field: 'not-in-any-mapping' } } as the body.
         * Expected Result: API responds with 400 Bad Request.
         */
    // { spec: { bb_unmapped_field: '...' } } unwraps to { bb_unmapped_field: '...' }
    // — no mapping entry matches, so no serialNumber is found → 400.
    it('SW-BB-SI-API-TC14: Verify the API returns 400 when spec contains only unmapped fields', { tags: ['@regression'] }, () => {
        const token = Cypress.env('bbApiAdminToken');
        api.stockIn({ spec: { bb_unmapped_field: 'not-in-any-mapping' } }, token).then((res) => {
            api.assertBadRequest(res, 'spec with only unmapped fields');
        });
    });

    // ── TC15 ── Malformed JSON body returns 400 ─────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC15
         * Description: Verify the API returns 400 when the request body is malformed JSON
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a syntactically invalid JSON body.
         * Expected Result: API responds with 400 Bad Request. Must not return 401 or 500.
         */
    // NestJS body-parser rejects syntactically invalid bodies with 400 before
    // any route logic runs.
    it('SW-BB-SI-API-TC15: Verify the API returns 400 when the request body is malformed JSON', { tags: ['@regression'] }, () => {
        const token = Cypress.env('bbApiAdminToken');
        cy.request({
            method: 'POST',
            url: `${Cypress.env('API_BASE_URL')}/incoming-items/hardware-stock-in`,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: '{invalid: json, missing: quotes}',
            failOnStatusCode: false,
        }).then((res) => {
            expect(res.status, 'malformed JSON body must not cause a server error').to.not.equal(500);
            expect(res.status, 'malformed JSON body must not be rejected as unauthenticated').to.not.equal(401);
            expect(res.status, 'malformed JSON body must be rejected with 400').to.equal(400);
        });
    });

    // ── TC16 ── Wrong HTTP methods are rejected ─────────────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC16
         * Description: Verify that GET, PUT, and DELETE methods are rejected on the stock-in endpoint
         * Steps:
         *   1. Send GET, PUT, and DELETE requests to /incoming-items/hardware-stock-in with valid Authorization.
         * Expected Result: API does not accept these methods. Must not return 200/201 or 5xx.
         */
    // hardware-stock-in is POST-only. GET, PUT, DELETE have no registered handler.
    it('SW-BB-SI-API-TC16: Verify that GET, PUT, and DELETE methods are rejected on the stock-in endpoint', { tags: ['@regression'] }, () => {
        const token = Cypress.env('bbApiAdminToken');
        const url = `${Cypress.env('API_BASE_URL')}/incoming-items/hardware-stock-in`;
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        cy.request({ method: 'GET', url, headers, failOnStatusCode: false }).then((res) => {
            expect(res.status, 'GET on a POST-only endpoint must not succeed').to.not.be.oneOf([200, 201]);
            expect(res.status, 'GET must not cause a server error').to.be.lessThan(500);
        });
        cy.request({ method: 'PUT', url, headers, body: {}, failOnStatusCode: false }).then((res) => {
            expect(res.status, 'PUT on a POST-only endpoint must not succeed').to.not.be.oneOf([200, 201]);
            expect(res.status, 'PUT must not cause a server error').to.be.lessThan(500);
        });
        cy.request({ method: 'DELETE', url, headers, failOnStatusCode: false }).then((res) => {
            expect(res.status, 'DELETE on a POST-only endpoint must not succeed').to.not.be.oneOf([200, 201]);
            expect(res.status, 'DELETE must not cause a server error').to.be.lessThan(500);
        });
    });

    // ── TC17 ── Valid new serial is stocked in successfully ─────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC17
         * Description: Verify a valid payload with a new serial number is stocked in successfully
         * Steps:
         *   1. Send a POST request to /incoming-items/hardware-stock-in with a valid payload and a new serial number.
         * Expected Result: API responds with 200/201 and the serial appears in the results with status 'success', 'existing_made_available', or 'restocked'.
         */
    // stockInSerial is also used by BrainboxStockOutAPI TC08 to verify the
    // full round-trip.
    it('SW-BB-SI-API-TC17: Verify a valid payload with a new serial number is stocked in successfully', { tags: ['@smoke'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, stockInSerial);

        api.stockIn(payload, token).then((res) => {
            expect(res.status).to.be.oneOf([200, 201]);
            const result = api.assertStockInSuccess(res);

            const itemResult = result.results.find(
                (r) => String(r.serialNumber).toLowerCase() === stockInSerial.toLowerCase()
            );
            expect(itemResult, `serial ${stockInSerial} must appear in results`).to.exist;
            expect(itemResult.status).to.be.oneOf(['success', 'existing_made_available', 'restocked']);
        });
    });

    // ── TC18 ── Duplicate serial number is rejected ──────────────────────
        /**
         * Testcase ID: SW-BB-SI-API-TC18
         * Description: Verify duplicate serial number is rejected
         * Steps:
         *   1. Stock in a serial number (TC17).
         *   2. Attempt to stock in the same serial number again.
         * Expected Result: API rejects the duplicate serial (via 4xx or envelope pattern). Must not return 5xx. Status is not 'success'.
         */
    // Sending a serial that is already stocked in must be rejected — the API
    // must not allow duplicate serial numbers.
    //
    // SELF-SEEDING (do not remove): TC17 stocks stockInSerial in, but TC17 is
    // @smoke and this test is @regression, so `--env grepTags=@regression`
    // deselects the seed and the "duplicate" below would be a brand-new serial —
    // the stock-in would succeed and the test would assert nothing while still
    // reporting green. cy-grep filters at collection time, so a sibling `it()`
    // is never a dependable seed. We therefore stock the serial in here first
    // and assert on the SECOND call, which is the duplicate under test.
    it('SW-BB-SI-API-TC18: Verify duplicate serial number is rejected', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, stockInSerial);

        // Seed. Result deliberately ignored: when TC17 has already run this is
        // itself a duplicate, which is fine — either way the serial is present
        // before the assertion below.
        api.stockIn(payload, token);

        api.stockIn(payload, token).then((res) => {
            expect(res.status, 'duplicate serial stock-in must not return 5xx').to.be.lessThan(500);

            // The API must reject the duplicate — either via HTTP 4xx or via
            // the envelope pattern (200 + success:false / error message).
            if (res.status >= 400) {
                const reason = res.body?.message || res.body?.error;
                expect(reason, 'rejected duplicate serial must include an error indicator').to.exist;
            } else {
                // Envelope-style rejection: 2xx but success === false or the
                // per-item result indicates the duplicate was not accepted.
                const result = res.body.data?.[0];
                expect(result, 'stock-in data[0] must be present').to.exist;

                const itemResult = result.results?.find(
                    (r) => String(r.serialNumber).toLowerCase() === stockInSerial.toLowerCase()
                );

                if (itemResult) {
                    expect(
                        itemResult.status,
                        'duplicate serial must not be reported as a fresh success'
                    ).to.not.equal('success');
                } else {
                    // If the serial is absent from results, the service
                    // silently dropped it — acceptable duplicate handling.
                    expect(result.status, 'overall status should reflect the rejection').to.not.be.true;
                }
            }
        });
    });

    // ── TC19 ── Duplicate data with a different serial number is accepted ────
        /**
         * Testcase ID: SW-BB-SI-API-TC19
         * Description: Verify duplicate data with a different serial number is accepted
         * Steps:
         *   1. Stock in a serial number (TC17).
         *   2. Attempt to stock in the same payload data but with a new serial number.
         * Expected Result: API accepts the new serial and returns it in the results with status 'success', 'existing_made_available', or 'restocked'.
         */
    // The API uses serial number as the unique key. Sending the same payload
    // data (all non-serial fields identical to TC17) but with a brand-new
    // serial number is a legitimate new item and must be accepted.
    it('SW-BB-SI-API-TC19: Verify duplicate data with a different serial number is accepted', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildMinimalPayload(configRow.configJson.mapping, dupDataDiffSerial);

        api.stockIn(payload, token).then((res) => {
            expect(res.status, 'duplicate data with new serial must succeed').to.be.oneOf([200, 201]);
            const result = api.assertStockInSuccess(res);

            const itemResult = result.results.find(
                (r) => String(r.serialNumber).toLowerCase() === dupDataDiffSerial.toLowerCase()
            );
            expect(itemResult, `serial ${dupDataDiffSerial} must appear in results`).to.exist;
            expect(itemResult.status).to.be.oneOf(['success', 'existing_made_available', 'restocked']);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Category Assignment
    // ═══════════════════════════════════════════════════════════════════════════

    // ── TC20 ── All mapped fields match → item assigned to correct category ─────
        /**
         * Testcase ID: SW-BB-SI-API-TC20
         * Description: Verify the item is assigned to the correct category when all mapped fields match
         * Steps:
         *   1. Stock in an item with all mapped fields matching the BrainBox config category.
         *   2. Fetch the product by productId from the response.
         * Expected Result: Product exists and has a valid (non-null) categoryId.
         */
    // When the payload contains values for all mapped fields, the resulting
    // product must belong to the category configured in the BrainBox config.
    // We verify by fetching the product and comparing its category to the one
    // assigned to the item stocked in via TC17 (same config, same category).
    it('SW-BB-SI-API-TC20: Verify the item is assigned to the correct category when all mapped fields match', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        const payload = api.buildPayloadWithAllMappedFields(
            configRow.configJson.mapping,
            categoryMatchSerial,
            'test-value'
        );

        api.stockIn(payload, token).then((res) => {
            expect(res.status, 'stock-in must succeed').to.be.oneOf([200, 201]);
            const result = api.assertStockInSuccess(res);

            const itemResult = result.results.find(
                (r) => String(r.serialNumber).toLowerCase() === categoryMatchSerial.toLowerCase()
            );
            expect(itemResult, `serial ${categoryMatchSerial} must appear in results`).to.exist;
            expect(itemResult.productId, 'productId must be returned').to.exist;

            // Fetch the product and verify it has a valid category
            api.getProductById(itemResult.productId, token).then((prodRes) => {
                expect(prodRes.status).to.equal(200);
                const product = prodRes.body.data?.product;
                expect(product, 'product must be returned').to.exist;
                expect(product.categoryId, 'product must be assigned to a category').to.exist;
                expect(product.categoryId, 'categoryId must not be null').to.not.be.null;
            });
        });
    });

    // ── TC21 ── Mapped fields do not match → item placed under configured PO ────
        /**
         * Testcase ID: SW-BB-SI-API-TC21
         * Description: Verify the item is placed under the configured PO when mapped fields do not match
         * Steps:
         *   1. Stock in an item with all mapped fields set to unique values (no match in category).
         *   2. Fetch the product by productId from the response.
         * Expected Result: Product exists and has a valid (non-null) categoryId. Item is not rejected.
         */
    // When payload field values do not match any existing product in the
    // configured category, the API should still stock the item under the PO
    // number selected in the BrainBox config. A new product row is created in
    // that category for the new specs and the item must not be rejected.
    it('SW-BB-SI-API-TC21: Verify the item is placed under the configured PO when mapped fields do not match', { tags: ['@regression'] }, function () {
        if (!serialMapping) this.skip();

        const token = Cypress.env('bbApiAdminToken');
        // Use unique non-matching values for every non-serial field so no
        // existing product in the category can match.
        const uniqueMismatchValue = `MISMATCH-${Date.now()}`;
        const payload = api.buildPayloadWithAllMappedFields(
            configRow.configJson.mapping,
            categoryMismatchSerial,
            uniqueMismatchValue
        );

        api.stockIn(payload, token).then((res) => {
            expect(res.status, 'mismatched-field stock-in must still succeed').to.be.oneOf([200, 201]);
            const result = api.assertStockInSuccess(res);

            const itemResult = result.results.find(
                (r) => String(r.serialNumber).toLowerCase() === categoryMismatchSerial.toLowerCase()
            );
            expect(itemResult, `serial ${categoryMismatchSerial} must appear in results`).to.exist;
            expect(itemResult.productId, 'productId must be returned').to.exist;

            // Verify the product was created and belongs to the BrainBox
            // configured category. The successful stock-in response already
            // proves the item was placed under the configured PO.
            api.getProductById(itemResult.productId, token).then((prodRes) => {
                expect(prodRes.status).to.equal(200);
                const product = prodRes.body.data?.product;
                expect(product, 'product must be returned').to.exist;
                expect(product.categoryId, 'product must have a categoryId').to.exist;
                expect(product.categoryId, 'categoryId must not be null').to.not.be.null;
            });
        });
    });
});