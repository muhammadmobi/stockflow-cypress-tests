// cypress/support/helpers/wmsContainerHelpers.js
//
// Helpers for the WMS Containers UI test suite. Cleanup goes via the API
// (per WMS-TEST-PLAN §5: API is faster and more reliable than driving a
// delete dialog).
//
// Containers don't have an "AUTO_WMS_" prefix the way Locations do —
// their codes are server-generated as CT-PREFIX-NUMBER, where PREFIX is
// the first 3 characters of the container type's name. So instead of
// sweeping by name prefix, tests track the IDs they created and delete
// each one explicitly in after().

/**
 * Delete a container by id via the API. Best-effort — tolerates 4xx so a
 * partially-cleaned-up state doesn't fail the whole spec.
 */
function deleteContainerViaApi(id) {
    if (!id) return;
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        cy.request({
            method: "DELETE",
            url: `${baseUrl}/containers/${id}`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        });
    });
}

/**
 * Look up a container by visible code via the API. Returns the matching
 * container's full record (incl. id) so tests created via UI can find
 * the id needed for cleanup.
 *
 * Returns a Cypress chain yielding the container record, or null when no
 * match is found (lets soft-skips be explicit).
 */
function findContainerByCode(code) {
    if (!code) return cy.wrap(null);
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        return cy
            .request({
                method: "GET",
                // Server-side search by code — same endpoint the UI uses.
                url: `${baseUrl}/containers?search=${encodeURIComponent(code)}&page=1&pageSize=20`,
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
            })
            .then((res) => {
                if (res.status !== 200) return null;
                const body = res.body && (res.body.data || res.body);
                const items = Array.isArray(body) ? body : body?.items || [];
                const exact = items.find(
                    (c) => (c.code || "").toUpperCase() === code.toUpperCase(),
                );
                return exact || null;
            });
    });
}

/**
 * Generate a disposable container-type name. Used by Manage Types tests
 * so cleanup can sweep them by prefix even if the test exits early.
 *
 * The Manage Types validator is strict — names may only contain letters,
 * numbers, and single internal spaces (no leading/trailing spaces, no
 * underscores or other punctuation). So we can't reuse the underscored
 * AUTO_WMS_<ts>_<rand>_<suffix> pattern from Locations.
 *
 * Container-code generation uses `name.substring(0, 3).toUpperCase()` as
 * the prefix and then *globally* enforces uniqueness on the resulting
 * `CT-<prefix>-<n>` code. So if two different types both yield the same
 * 3-char prefix (e.g. all `AutoWms...` types collapse to "AUT"), the
 * second container creation fails on the duplicate-code check even
 * though the per-type counter is fresh. To avoid the collision we vary
 * the first 3 chars deterministically — base-36 of the random seed
 * (clamped to A..Z plus digits) gives ~36^3 ≈ 47k distinct prefixes.
 */
function disposableTypeName(suffix = "Type") {
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 9000 + 1000);
    // Three uppercase base-36 chars from the timestamp's last digits.
    // Pad with "Z" if the result is shorter than 3 (unlikely).
    const prefix = (ts % 46656) // 36^3
        .toString(36)
        .toUpperCase()
        .padStart(3, "Z");
    return `${prefix}${rand}${suffix}`;
}

/**
 * Create a container-type via API. Returns the full record (incl. id).
 * Best-effort — surfaces errors so tests can fail fast on infra issues.
 */
function createContainerTypeViaApi(name) {
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        return cy
            .request({
                method: "POST",
                url: `${baseUrl}/container-types`,
                headers: { Authorization: `Bearer ${token}` },
                body: { name },
                failOnStatusCode: false,
            })
            .then((res) => {
                // The envelope is `{ data: {...} }` per project.
                const body = res.body && (res.body.data || res.body);
                return body || null;
            });
    });
}

/**
 * Delete a container-type by id via the API. Best-effort — tolerates
 * 4xx so a partially-cleaned-up state doesn't fail the whole spec.
 */
function deleteContainerTypeViaApi(id) {
    if (!id) return;
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        cy.request({
            method: "DELETE",
            url: `${baseUrl}/container-types/${id}`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        });
    });
}

/**
 * Resolve a container type id by name via the listing API. Used right
 * after creating a type via UI: the UI doesn't expose the new id, so the
 * test reads it back so `afterEach` can clean up. Asserts the lookup
 * succeeded (fails loudly if the type can't be found — that means the UI
 * create silently failed).
 *
 * Returns a Cypress chain yielding the id.
 */
function resolveTypeIdByName(name) {
    return listContainerTypesViaApi().then((all) => {
        const match = (all || []).find((t) => t && t.name === name);
        expect(match, `type id resolved for "${name}"`).to.not.be.undefined;
        return match.id;
    });
}

/**
 * List all container-types. Used by tests that need to find a known
 * "in-use" type (its `inUse` flag is true) to assert the Edit input is
 * disabled, OR the type-by-name id for cleanup.
 *
 * Returns a Cypress chain yielding an array (possibly empty).
 */
function listContainerTypesViaApi() {
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        return cy
            .request({
                method: "GET",
                url: `${baseUrl}/container-types`,
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
            })
            .then((res) => {
                if (res.status !== 200) return [];
                const body = res.body && (res.body.data || res.body);
                return Array.isArray(body) ? body : [];
            });
    });
}

/**
 * Create a container via API for a given containerTypeId. Returns the
 * full record (incl. id and code). Used by TC21 to flip a freshly-
 * created type into the "in use" state without driving the UI.
 *
 * The backend's POST /containers requires both containerTypeId AND
 * code, so we first call GET /containers/next-code/:typeId to obtain
 * the auto-generated code (matching the UI's flow).
 */
function createContainerViaApi(containerTypeId) {
    if (!containerTypeId) return cy.wrap(null);
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        return cy
            .request({
                method: "GET",
                url: `${baseUrl}/containers/next-code/${containerTypeId}`,
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
            })
            .then((codeRes) => {
                const codeBody = codeRes.body && (codeRes.body.data || codeRes.body);
                const code = codeBody && codeBody.code;
                if (!code) return null;
                return cy
                    .request({
                        method: "POST",
                        url: `${baseUrl}/containers`,
                        headers: { Authorization: `Bearer ${token}` },
                        body: { containerTypeId, code },
                        failOnStatusCode: false,
                    })
                    .then((res) => {
                        if (res.status >= 400) {
                            // Surface real failures rather than papering
                            // over them — callers expect a non-null
                            // record only on success.
                            return null;
                        }
                        const body = res.body && (res.body.data || res.body);
                        return body || null;
                    });
            });
    });
}

/**
 * Empty a container's contents via API: deletes every container_quantities
 * row and every container_items row owned by the container.
 *
 * Used as a teardown safety net BEFORE deleting a container — DELETE
 * /containers/:id returns 400 while cur_items > 0, so leaving even a
 * single stranded row from a failed mid-test stock-out blocks cleanup
 * and the disposable container leaks into QA.
 *
 * Best-effort: tolerates 4xx on any sub-call so partial state still
 * unwinds as far as it can.
 */
function emptyContainerViaApi(containerId) {
    if (!containerId) return cy.wrap(null);
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        const auth = { Authorization: `Bearer ${token}` };
        // 1) Drop every quantity row.
        return cy
            .request({
                method: "GET",
                url: `${baseUrl}/containers/${containerId}/quantities`,
                headers: auth,
                failOnStatusCode: false,
            })
            .then((qRes) => {
                const qBody = qRes.body && (qRes.body.data || qRes.body);
                const qRows = Array.isArray(qBody) ? qBody : qBody?.list || qBody?.items || [];
                const dropQty = (idx) => {
                    if (idx >= qRows.length) return cy.wrap(null);
                    const row = qRows[idx];
                    const productId = row?.productId || row?.product_id;
                    if (!productId) return dropQty(idx + 1);
                    return cy
                        .request({
                            method: "DELETE",
                            url: `${baseUrl}/containers/${containerId}/quantities/${productId}`,
                            headers: auth,
                            failOnStatusCode: false,
                        })
                        .then(() => dropQty(idx + 1));
                };
                return dropQty(0);
            })
            .then(() =>
                // 2) Drop every serialized item.
                cy.request({
                    method: "GET",
                    url: `${baseUrl}/containers/${containerId}/items`,
                    headers: auth,
                    failOnStatusCode: false,
                }),
            )
            .then((iRes) => {
                const iBody = iRes.body && (iRes.body.data || iRes.body);
                const iRows = Array.isArray(iBody) ? iBody : iBody?.list || iBody?.items || [];
                const dropItem = (idx) => {
                    if (idx >= iRows.length) return cy.wrap(null);
                    const sn = iRows[idx]?.serialNumber || iRows[idx]?.serial_number;
                    if (!sn) return dropItem(idx + 1);
                    return cy
                        .request({
                            method: "DELETE",
                            url: `${baseUrl}/containers/items/${encodeURIComponent(sn)}`,
                            headers: auth,
                            failOnStatusCode: false,
                        })
                        .then(() => dropItem(idx + 1));
                };
                return dropItem(0);
            });
    });
}

// Shared shape of every disposableTypeName() return: 3 base-36 upper chars,
// 4 random digits, then an alphabetic suffix (2–12 chars). Distinctive
// enough that a human-named type would never accidentally match.
const DISPOSABLE_TYPE_NAME_PATTERN = /^[A-Z0-9]{3}\d{4}[A-Za-z]{2,12}$/;

/**
 * Sweep leftover disposable containers from prior crashed runs OR from
 * tests whose afterEach didn't run (Cypress hard-fail, manual abort,
 * etc.).
 *
 * "Disposable" is determined by the parent type's name shape — a
 * container is swept iff its `containerTypeId` resolves to a type whose
 * name matches DISPOSABLE_TYPE_NAME_PATTERN. This keeps the sweep
 * surgical: hand-created containers under stock types are untouched.
 *
 * Each container's contents are emptied first (drops
 * container_quantities and container_items rows) so the subsequent
 * DELETE doesn't 400 on "container has contents". Best-effort: any 4xx
 * is tolerated so a partially-cleanable run still makes progress.
 *
 * Returns a Cypress chain yielding the array of ids that were deleted.
 */
function sweepDisposableContainers() {
    const baseUrl = Cypress.env("API_BASE_URL");
    return listContainerTypesViaApi().then((types) => {
        const disposableTypeIds = new Set(
            (types || [])
                .filter(
                    (t) =>
                        t &&
                        t.id != null &&
                        t.name &&
                        DISPOSABLE_TYPE_NAME_PATTERN.test(t.name),
                )
                .map((t) => t.id),
        );
        if (disposableTypeIds.size === 0) return cy.wrap([]);

        return cy.getAuthToken().then((token) => {
            if (!token) return [];
            return cy
                .request({
                    method: "GET",
                    url: `${baseUrl}/containers?page=1&pageSize=500`,
                    headers: { Authorization: `Bearer ${token}` },
                    failOnStatusCode: false,
                })
                .then((res) => {
                    if (res.status !== 200) return [];
                    const body = res.body && (res.body.data || res.body);
                    const items = Array.isArray(body) ? body : body?.items || [];
                    // The listing payload may carry the parent as either
                    // `containerTypeId` (lean shape) or a nested
                    // `containerType.id` (relation shape). Tolerate both.
                    const stale = items.filter((c) => {
                        const typeId =
                            c?.containerTypeId ??
                            c?.containerType?.id ??
                            null;
                        return typeId != null && disposableTypeIds.has(typeId);
                    });

                    const deleted = [];
                    const dropNext = (idx) => {
                        if (idx >= stale.length) return cy.wrap(deleted);
                        const c = stale[idx];
                        // Empty first so the DELETE isn't blocked by
                        // cur_items > 0; both calls tolerate 4xx.
                        return emptyContainerViaApi(c.id)
                            .then(() => deleteContainerViaApi(c.id))
                            .then(() => {
                                deleted.push(c.id);
                                return dropNext(idx + 1);
                            });
                    };
                    return dropNext(0);
                });
        });
    });
}

/**
 * Sweep leftover disposable container types from prior crashed runs OR
 * from non-E2E tests in the suite whose afterEach didn't run.
 *
 * Skips types with `inUse: true` — those have at least one container
 * referencing them and the backend will reject the delete with 400.
 * Pair with `sweepDisposableContainers()` BEFORE this sweep so the
 * inUse flag has had a chance to flip.
 *
 * Returns a Cypress chain yielding the array of ids that were deleted
 * (so the caller can log volume or assert in audits).
 */
function sweepDisposableContainerTypes() {
    return listContainerTypesViaApi().then((all) => {
        const stale = (all || []).filter(
            (t) =>
                t &&
                t.name &&
                DISPOSABLE_TYPE_NAME_PATTERN.test(t.name) &&
                !t.inUse,
        );
        const deleted = [];
        const dropNext = (idx) => {
            if (idx >= stale.length) return cy.wrap(deleted);
            return deleteContainerTypeViaApi(stale[idx].id).then(() => {
                deleted.push(stale[idx].id);
                return dropNext(idx + 1);
            });
        };
        return dropNext(0);
    });
}

/**
 * Fetch a container's full record by id via API. Used by Stock Out tests
 * to verify cur_items reset to 0 after the bulk stock-out succeeds.
 *
 * Returns a Cypress chain yielding the container record, or null on miss.
 */
function getContainerByIdViaApi(id) {
    if (!id) return cy.wrap(null);
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        return cy
            .request({
                method: "GET",
                url: `${baseUrl}/containers/${id}`,
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
            })
            .then((res) => {
                if (res.status !== 200) return null;
                const body = res.body && (res.body.data || res.body);
                return body || null;
            });
    });
}

/**
 * Find any product with `quantity > 0` for the load → stock-out flow.
 *
 * The container's bulk stock-out (WMSContainers.tsx:432-499) inspects the
 * container's quantities + items and POSTs the right shape per row:
 *   - variantId present  → POST /products/stock-out-variant
 *   - serialized items   → POST /products/stockout-by-serial
 *   - else               → POST /products/stock-out (level: "Product")
 * So a product of ANY shape (pure / variant-bearing / serialized) works
 * here — what matters is that there's enough quantity on hand to load 1
 * unit into our disposable container and stock it back out cleanly.
 *
 * Endpoint contract (verified against ProductListingAPI):
 *   - Query params: `page` and `page_size` (snake_case, not camelCase).
 *   - Response envelope: `{ data: { list: [...], total: N } }`.
 *
 * Returns a Cypress chain yielding the product record, or null when QA
 * has no stocked product across the first three pages of 100 (extremely
 * unlikely — would only happen on a freshly-reset environment).
 */
function findStockableProductViaApi() {
    const baseUrl = Cypress.env("API_BASE_URL");
    // The /products listing endpoint exposes aggregated quantity fields
    // (availableQuantity, expectedQuantity, receivedQuantity, etc.) — NOT
    // the `quantity` column from the products table directly. So matching
    // on `p.quantity > 0` always returned 0 because the field is
    // undefined on listing rows. We accept ANY positive qty signal.
    const getQty = (p) =>
        Number(
            p?.availableQuantity ??
            p?.quantity ??
            p?.receivedQuantity ??
            0,
        );
    const isMatch = (p) => p && getQty(p) > 0;
    const fetchPage = (token, page) =>
        cy.request({
            method: "GET",
            url: `${baseUrl}/products?page=${page}&page_size=100`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        });
    const extract = (res) => {
        if (res.status !== 200) return [];
        const data = res.body && (res.body.data || res.body);
        if (Array.isArray(data)) return data;
        return data?.list || data?.items || data?.results || [];
    };
    return cy.getAuthToken().then((token) => {
        return fetchPage(token, 1).then((res1) => {
            const m1 = extract(res1).find(isMatch);
            if (m1) return m1;
            return fetchPage(token, 2).then((res2) => {
                const m2 = extract(res2).find(isMatch);
                if (m2) return m2;
                return fetchPage(token, 3).then((res3) => {
                    return extract(res3).find(isMatch) || null;
                });
            });
        });
    });
}

/**
 * Drive Inventory Actions → Warehouse Management → Assignment → Assign
 * Products through one full UI pass: visit → scan target → search → assign
 * first row → handle the "Confirm Assignment" dialog when AssignProducts
 * opens it → wait for the POST /containers/:id/quantities to commit.
 *
 * Used by container-E2E tests whose "load" step must go through the
 * canonical UI flow (the Containers page itself has no load affordance).
 *
 * Lives here (not on AssignProductsPage) because AssignProductsPage is
 * owned by a different stream; container-E2E specs should compose its
 * primitive methods rather than extend the page object.
 *
 * Search term defaults to `product.category` (the row's visible primary
 * text). product.id is NOT rendered on the row, so id-as-search-term
 * returns no matches. Falls through to `product.name` then `'a'` when the
 * probe row's category field is empty.
 *
 * Why the dialog matters:
 *   AssignProducts pre-fetches /containers/product-assignments/:id before
 *   submitting. If the product is assigned ANYWHERE else (even with
 *   quantity=0 leftover rows), it opens the "Confirm Assignment" dialog
 *   instead of firing the POST directly. The dialog asks the user where
 *   to move quantity from — Unassigned Pool is the easy path; selecting
 *   it and clicking Assign delegates back to the same direct-assign
 *   mutation with our exact qty.
 *
 * Why wait on the POST intercept:
 *   The "Product assigned ... successfully" toast appears on POST
 *   success, but the previous test's toast can linger and the broad
 *   /assigned|successfully/ regex would match it falsely. Anchoring on
 *   the actual POST response is unambiguous.
 *
 * Caller's responsibility:
 *   - Pass an `AssignProductsPage` instance (so this helper stays
 *     decoupled from the page-object module).
 *   - Ensure the container exists server-side before calling — the scan
 *     hits /locations/universal-scan which 404s a not-yet-committed code.
 *   - Pass a product the assign endpoint will accept (a pure product is
 *     required; iaProbeProductWithNoAssignments is the cleanest probe
 *     but its filter is "quantity > 0" while AssignProducts considers
 *     ANY row in product-assignments as "elsewhere" — so the dialog can
 *     still open even with that probe, which is why we handle it).
 */
function loadProductIntoContainerViaUI(assignProductsPage, containerCode, product) {
    // Intercept the assign POST so we can wait on a real server commit
    // rather than a fuzzy toast match.
    cy.intercept("POST", "**/containers/*/quantities").as(
        "assignProductToContainer",
    );
    // AssignProducts pre-fetches /containers/product-assignments/:id
    // BEFORE deciding whether to open the "Confirm Assignment" dialog
    // or fire the POST directly. We alias it so the dialog-detection
    // probe waits for that decision instead of racing it.
    cy.intercept("GET", "**/containers/product-assignments/**").as(
        "getProductAssignments",
    );

    assignProductsPage.visit();
    assignProductsPage.scanTargetCode(containerCode);
    assignProductsPage.assertProductsStepVisible();
    assignProductsPage.typeProductSearch(
        String(product?.category || product?.name || "a"),
    );
    // Component debounces 500ms before firing the /products search;
    // let the list settle before clicking.
    cy.wait(700);
    assignProductsPage.enterQtyAndAssignFirstRow(1);

    // Wait for the product-assignments lookup to settle so the
    // dialog-vs-direct-POST branch is decided BEFORE we probe.
    // Previously the probe ran synchronously after the row click and
    // sometimes saw an empty body, then fell through — neither
    // handling the dialog nor catching the POST. Waiting on the GET
    // here makes the branch deterministic. Best-effort: if the GET
    // already fired before we registered the alias (very rare), the
    // wait times out and we fall through to the body probe with a
    // retrying assertion as a second safety net.
    cy.wait("@getProductAssignments", { timeout: 15000 }).then(() => {
        // Give React one tick to render either the dialog or the
        // POST-in-flight state — `cy.wait` resolves on response, not
        // on render.
        cy.wait(150, { log: false });
        cy.get("body").then(($body) => {
            const dialogOpen = $body.find('div[role="dialog"]')
                .filter((_, el) => el.textContent.includes("Confirm Assignment"))
                .length > 0;
            if (!dialogOpen) return;

            // Dialog (AssignQuantityDialog.tsx) lists every source as a
            // <ListItemButton>; the "Unassigned" entry has primary
            // text "Unassigned" + secondary text "{N} units". Anchor
            // on the primary text node — its closest ancestor with
            // role="button" is the ListItemButton we want to click.
            //
            // Why Unassigned specifically:
            //   - Picking Unassigned routes back through the parent's
            //     normal POST /containers/:id/quantities flow (which
            //     is our @assignProductToContainer alias).
            //   - Picking a container/location source calls a
            //     DIFFERENT mutation (moveContents /
            //     moveQuantityToLocation) and our intercept would
            //     never fire, leaking back into the cy.wait timeout
            //     we just fixed.
            cy.get('div[role="dialog"]')
                .contains("Confirm Assignment")
                .parents('div[role="dialog"]')
                .first()
                .within(() => {
                    cy.contains('p, span, div', /^Unassigned$/)
                        .closest('[role="button"]')
                        .click();
                    // Quantity to move is pre-filled with the row qty —
                    // we leave it untouched. Click the dialog's Assign
                    // button (distinct from the row's Assign because
                    // it's inside DialogActions).
                    cy.findByRole('button', { name: /^assign$/i })
                        .should('not.be.disabled')
                        .click();
                });
        });
    });

    // Wait on the real POST response — the only unambiguous signal that
    // a quantity row was committed. 4xx surfaces as a test failure here
    // rather than getting masked by a stale toast.
    cy.wait("@assignProductToContainer", { timeout: 15000 }).then((xhr) => {
        expect(
            xhr.response?.statusCode,
            "POST /containers/:id/quantities status",
        ).to.be.lessThan(400);
    });
}

/**
 * Load 1 unit of `product` into container `containerId` via
 * POST /containers/:id/quantities — bypasses the UI entirely so
 * the quantity lands in exactly this container, not whichever one
 * the frontend happens to select.  Used by stock-out tests where
 * the frontend's stockOutContainerMutation does NOT pass
 * containerSource, meaning the backend falls back to the lowest-id
 * container holding the product.  Loading via API guarantees no
 * other container is holding the product before we stock out.
 */
function loadProductIntoContainerViaApi(containerId, productId) {
    const baseUrl = Cypress.env("API_BASE_URL");
    return cy.getAuthToken().then((token) => {
        return cy.request({
            method: "POST",
            url: `${baseUrl}/containers/${containerId}/quantities`,
            headers: { Authorization: `Bearer ${token}` },
            body: { productId, delta: 1 },
            failOnStatusCode: false,
        }).then((res) => {
            expect(
                res.status,
                `POST /containers/${containerId}/quantities status`,
            ).to.be.lessThan(400);
        });
    });
}

module.exports = {
    deleteContainerViaApi,
    findContainerByCode,
    disposableTypeName,
    createContainerTypeViaApi,
    createContainerViaApi,
    deleteContainerTypeViaApi,
    listContainerTypesViaApi,
    resolveTypeIdByName,
    emptyContainerViaApi,
    sweepDisposableContainers,
    sweepDisposableContainerTypes,
    getContainerByIdViaApi,
    findStockableProductViaApi,
    loadProductIntoContainerViaUI,
    loadProductIntoContainerViaApi,
};
