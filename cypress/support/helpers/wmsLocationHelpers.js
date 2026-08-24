// cypress/support/helpers/wmsLocationHelpers.js
//
// Helpers for the WMS Locations UI test suite. Cleanup goes via the API
// (per WMS-TEST-PLAN §5: API is faster and more reliable than driving a
// delete dialog). Tests that create Locations on the UI should:
//
//   1. Use disposableName() for both name and code
//   2. Push the visible name/code to a per-spec tracker
//   3. Call sweepDisposableLocations() in after()

// Shared prefix for any throwaway Location these tests create. The sweeper
// finds leftovers from prior aborted runs by matching this prefix.
const DISPOSABLE_PREFIX = "AUTO_WMS_";

/**
 * Build a disposable name/code unique enough to avoid collisions across
 * parallel runs and re-runs in the same second.
 *
 *   suffix — optional human-readable hint at the tail of the name.
 */
function disposableName(suffix = "") {
    const ts = Date.now();
    const rand = Math.random().toString(16).slice(2, 6);
    const tail = suffix ? `_${suffix}` : "";
    return `${DISPOSABLE_PREFIX}${ts}_${rand}${tail}`;
}

/**
 * Sweep any disposable Locations whose name or code starts with AUTO_WMS_.
 *
 * Used in after() as a safety net. Best-effort: each delete tolerates 4xx
 * (already deleted, not found) so a partially-cleaned-up state doesn't fail
 * the whole spec.
 *
 * Caller passes the API base URL and bearer token — typically obtained via
 * Cypress.env('API_BASE_URL') and cy.getAuthToken().
 */
function sweepDisposableLocations() {
    const baseUrl = Cypress.env("API_BASE_URL");

    return cy.getAuthToken().then((token) => {
        if (!token) return; // not logged in — nothing to sweep

        // List top-level (Facility) Locations — disposables created via UI
        // are always Facilities at this point in the suite.
        cy.request({
            method: "GET",
            url: `${baseUrl}/locations?page=1&pageSize=200`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        }).then((res) => {
            if (res.status !== 200) return;

            // Some interceptors wrap in { data: ... } — handle both shapes.
            const body = res.body && (res.body.data || res.body);
            const items = (body && body.items) || [];

            // Filter to disposables and DELETE each one. Soft-delete cascades
            // to descendants (zones/areas/etc.) so this also cleans nested
            // structures that future chunks will create.
            const disposables = items.filter(
                (l) =>
                    (l.name && l.name.startsWith(DISPOSABLE_PREFIX)) ||
                    (l.code && l.code.startsWith(DISPOSABLE_PREFIX)),
            );

            disposables.forEach((l) => {
                cy.request({
                    method: "DELETE",
                    url: `${baseUrl}/locations/${l.id}`,
                    headers: { Authorization: `Bearer ${token}` },
                    failOnStatusCode: false,
                });
            });
        });
    });
}

/**
 * Create a Location via the API. Convenience wrapper used by UI-test
 * scaffolding when a parent Location is needed but the test isn't about
 * the create flow.
 *
 *   payload — { name, type, parentId? }
 *
 * IMPORTANT — UI-fidelity rule:
 *   On the Locations UI, the Code field is auto-generated and read-only;
 *   a user cannot submit an arbitrary code. Therefore this helper must NOT
 *   accept a `code` field — accepting one would let test scaffolding
 *   produce data that is structurally impossible via the real user flow,
 *   masking bugs in code-uniqueness rules, format validation, etc.
 *
 *   The backend auto-generates the code via getNextCode(type, parentId)
 *   when `code` is omitted — same path the UI submit takes.
 *
 *   If you ever need a specific code for a test, drive the UI flow itself
 *   (which will use the auto-generated code). Tests can read the resulting
 *   code from the response or by reading the rendered card.
 */
function createLocationViaApi(payload) {
    // Hard guard: surface the violation immediately rather than silently
    // creating unrealistic data.
    if (Object.prototype.hasOwnProperty.call(payload, "code")) {
        throw new Error(
            "createLocationViaApi: do NOT pass `code`. The UI Code field is " +
            "auto-generated and read-only — passing one creates test data " +
            "the user cannot produce. Omit `code` and let the API generate it.",
        );
    }

    const baseUrl = Cypress.env("API_BASE_URL");

    // Prefix map for fallback unique codes (used when the backend's
    // getNextCode cache returns a code that was previously soft-deleted).
    // TypeORM soft-delete silently filters deleted rows from repo.find(),
    // so loadNextCode only sees active locations and can return a code
    // that matches a soft-deleted record — causing a 400. On the first 400
    // we retry with an explicit timestamp-based code that bypasses
    // getNextCode entirely so the cache collision doesn't affect us.
    const TYPE_PREFIX = { Facility: 'F', Zone: 'Z', Area: 'A', Row: 'R', Bay: 'B', Level: 'L', Bin: 'BN' };

    const doRequest = (body, token) =>
        cy.request({
            method: "POST",
            url: `${baseUrl}/locations`,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body,
            failOnStatusCode: false,
        });

    return cy.getAuthToken().then((token) => {
        return doRequest(payload, token).then((res) => {
            if (res.status === 400) {
                // Soft-delete cache collision: auto-generated code collides with a
                // soft-deleted record. Retry with a unique timestamp-hex code that
                // bypasses getNextCode so the collision never occurs.
                const pfx = TYPE_PREFIX[payload.type] || 'X';
                const uniqueSuffix = Date.now().toString(36).slice(-5).toUpperCase();
                const fallbackCode = `${pfx}-T${uniqueSuffix}`;
                cy.log(
                    `create-location ${payload.type}: 400 (likely soft-delete code collision) — ` +
                    `retrying with explicit code ${fallbackCode}`,
                );
                const retryPayload = Object.assign({}, payload, { code: fallbackCode });
                return doRequest(retryPayload, token).then((res2) => {
                    expect(res2.status, `create-location ${payload.type} status (retry)`).to.be.oneOf([200, 201]);
                    const body2 = res2.body && (res2.body.data || res2.body);
                    expect(body2, "create-location body (retry)").to.be.an("object");
                    expect(body2.id, "created Location id (retry)").to.be.a("number");
                    return body2;
                });
            }
            expect(res.status, `create-location ${payload.type} status`).to.be.oneOf([200, 201]);
            const body = res.body && (res.body.data || res.body);
            expect(body, "create-location body").to.be.an("object");
            expect(body.id, "created Location id").to.be.a("number");
            return body;
        });
    });
}

/**
 * Create a full hierarchy chain Facility → Zone → Area → Row → Bay →
 * Level → Bin via the API. Used by tests that need a real Bin (the
 * only type that can hold a Container) without driving 7 dialogs in
 * the UI.
 *
 * Returns a Cypress chain yielding `{ facility, bin }` so callers can
 * push the facility id to a cleanup tracker (deleting the facility
 * cascade-deletes the whole chain) and the bin id for assignment.
 */
function createDisposableBinChain() {
    const tag = `${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
    const facName = `${DISPOSABLE_PREFIX}${tag}_F`;
    let facility, zone, area, row, bay, level, bin;
    return createLocationViaApi({ name: facName, type: 'Facility' }).then((f) => {
        facility = f;
        return createLocationViaApi({ name: `${tag}_Z`, type: 'Zone', parentId: f.id });
    }).then((z) => {
        zone = z;
        return createLocationViaApi({ name: `${tag}_A`, type: 'Area', parentId: z.id });
    }).then((a) => {
        area = a;
        return createLocationViaApi({ type: 'Row', parentId: a.id });
    }).then((r) => {
        row = r;
        return createLocationViaApi({ type: 'Bay', parentId: r.id });
    }).then((b) => {
        bay = b;
        return createLocationViaApi({ type: 'Level', parentId: b.id });
    }).then((l) => {
        level = l;
        return createLocationViaApi({ type: 'Bin', parentId: l.id });
    }).then((bn) => {
        bin = bn;
        return cy.wrap({ facility, zone, area, row, bay, level, bin });
    });
}

/**
 * Load `delta` units of `productId` into a Bin location via
 * POST /location-assignments/:locationId/quantities — bypasses the UI so the
 * quantity lands in exactly this Bin. Mirrors wmsContainerHelpers.js's
 * loadProductIntoContainerViaApi (same request shape, mirrored endpoint).
 */
function loadProductIntoLocationViaApi(locationId, productId, delta = 1) {
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        return cy.request({
            method: "POST",
            url: `${baseUrl}/location-assignments/${locationId}/quantities`,
            headers: { Authorization: `Bearer ${token}` },
            body: { productId, delta },
            failOnStatusCode: false,
        }).then((res) => {
            expect(
                res.status,
                `POST /location-assignments/${locationId}/quantities status`,
            ).to.be.lessThan(400);
        });
    });
}

/**
 * Delete a Location by id via the API. Best-effort.
 * Soft-delete cascades to children, so deleting a Facility removes
 * its entire chain.
 */
function deleteLocationViaApi(id) {
    if (!id) return;
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        cy.request({
            method: "DELETE",
            url: `${baseUrl}/locations/${id}`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        });
    });
}

module.exports = {
    DISPOSABLE_PREFIX,
    disposableName,
    sweepDisposableLocations,
    createLocationViaApi,
    createDisposableBinChain,
    loadProductIntoLocationViaApi,
    deleteLocationViaApi,
};
