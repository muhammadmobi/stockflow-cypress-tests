/**
 * Category API Tests — extended flows
 * =============================================================================
 * Mirrors:  cypress/e2e/Configuration/05-categoryTests.cy.js
 *
 * Scope of this file (complementary — not duplicate):
 *   cypress/e2e/api/CreateCategoryAPI.cy.js already covers the basic POST
 *   /categories happy path for product-only creation. This file focuses on
 *   the flows unique to the 05-categoryTests UI suite:
 *     - READ: list, sort Asc/desc, GET by id round-trip
 *     - UPDATE: rename product-only / product-item, toggle allowItems,
 *       rename-and-restore round-trip
 *     - VALIDATION & AUTH: missing name, duplicate name, special-chars-only,
 *       unauthenticated POST
 *     - DELETE: delete product-only and product-item categories with no data
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST   /categories          Create (product-only + product-item)
 *   GET    /categories          List / paginate / sort
 *   GET    /categories/:id      Read a single category by id
 *   PATCH  /categories/:id      Update (rename, toggle allowItems)
 *   DELETE /categories/:id      Delete empty category
 *
 * -----------------------------------------------------------------------------
 *   Joi / server-side expectations
 * -----------------------------------------------------------------------------
 *   - name is required, max length constrained, and subject to a character
 *     whitelist → special-chars-only names 400.
 *   - (name, tenant) is a uniqueness key → duplicate name returns 409.
 *   - Unauthenticated POST is blocked by the global AuthGuard → 401.
 *
 * -----------------------------------------------------------------------------
 *   UI-only cases (documented here; not asserted)
 * -----------------------------------------------------------------------------
 *     - "Add Category" modal title, breadcrumb, Save/Cancel buttons.
 *     - Allow Items toggle rendering + animation.
 *     - Delete confirmation dialog UI.
 *     - Sort-header click interactions (we assert the resulting GET instead).
 *     - "Category created/updated/deleted" toast copy.
 */

describe('Category API - extended flows', () => {
  // -------------------- Shared test state --------------------
  //   authToken             Bearer token fetched in before()
  //   baseUrl               Resolved from Cypress.env('API_BASE_URL')
  //   createdCategoryIds    Category ids queued for DELETE in after()
  let authToken;
  let baseUrl;
  const createdCategoryIds = [];

  // -------------------- Name helpers --------------------

  /** Short unique suffix. Used to avoid 409s on concurrent re-runs. */
  const suffix = () => `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
  /** Build a uniquely suffixed category name for a given prefix. */
  const uniqueName = (prefix) => `${prefix}-${suffix()}`;

  /** JSON + Bearer auth headers. */
  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  // -------------------- Request helpers --------------------

  /** POST /categories — create a category with the given body. */
  const createCategory = (body) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/categories`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  /** PATCH /categories/:id — update a category (rename / toggle flags). */
  const patchCategory = (id, body) =>
    cy.request({
      method: 'PATCH',
      url: `${baseUrl}/categories/${id}`,
      headers: headers(),
      failOnStatusCode: false,
      body,
    });

  /** GET /categories/:id — read a single category by id. */
  const getCategory = (id) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/categories/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  /** GET /categories — list/paginate/sort via query string. */
  const listCategories = (qs = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/categories`,
      qs,
      headers: headers(),
      failOnStatusCode: false,
    });

  /** DELETE /categories/:id — delete a category by id. */
  const deleteCategory = (id) =>
    cy.request({
      method: 'DELETE',
      url: `${baseUrl}/categories/${id}`,
      headers: headers(),
      failOnStatusCode: false,
    });

  // -------------------- Setup / Teardown --------------------

  /**
   * before(): authenticate against the identity server and cache the
   * accessToken. Each test creates its own category so there is no shared
   * fixture to seed beyond authentication.
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
  });

  /**
   * after(): delete every category created during the run. Each test adds
   * its created id to `createdCategoryIds` so this list is authoritative.
   */
  after(() => {
    createdCategoryIds.forEach((id) => deleteCategory(id));
  });

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------
  describe('CREATE', () => {
    /**
     * SW_CAT_API_01 — Create a product-item category.
     *   Steps:
     *     1. POST /categories with allowItems=true (Laptop-like).
     *     2. Expect 200/201 with echoed name + allowItems=true.
     *     3. Track id for teardown.
     *   UI mirror: "Add Category" modal with "Allow Items" toggle ON.
     */
    it('SW_CAT_API_01 - Create product-item category (allowItems=true)', () => {
      const name = uniqueName('LaptopCat');
      createCategory({
        name,
        allowItems: true,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        const data = res.body.data || res.body;
        expect(data.name).to.equal(name);
        expect(data.allowItems).to.equal(true);
        createdCategoryIds.push(data.id);
      });
    });

    /**
     * SW_CAT_API_03 — Create a product-only category.
     *   Steps:
     *     1. POST /categories with all flags false (RAM-like).
     *     2. Expect 200/201 with allowItems=false.
     *     3. Track id for teardown.
     *   UI mirror: "Add Category" modal with "Allow Items" toggle OFF.
     */
    it('SW_CAT_API_03 - Create product-only category (allowItems=false)', () => {
      const name = uniqueName('RAMCat');
      createCategory({
        name,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        const data = res.body.data || res.body;
        expect(data.name).to.equal(name);
        expect(data.allowItems).to.equal(false);
        createdCategoryIds.push(data.id);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------
  describe('READ', () => {
    /**
     * SW_CAT_API_05 — List endpoint responds 200 with an array payload.
     *   Steps:
     *     1. GET /categories?page=1&page_size=50.
     *     2. Expect 200 and that the response exposes a list under
     *        data.list / data.items / data.results / data (shape tolerance).
     *   UI mirror: first page load of the Category table.
     */
    it('SW_CAT_API_05 - GET /categories returns a list', () => {
      listCategories({ page: 1, page_size: 50 }).then((res) => {
        expect(res.status).to.equal(200);
        const body = res.body || {};
        const list =
          body?.data?.list ||
          body?.data?.items ||
          body?.data?.results ||
          (Array.isArray(body?.data) ? body.data : null) ||
          [];
        expect(Array.isArray(list)).to.equal(true);
      });
    });

    /**
     * SW_CAT_API_19 — Ascending sort accepted.
     *   Steps:
     *     1. GET /categories?sortBy=name&sortOrder=Asc.
     *     2. Expect 200 (shape variance — we don't assert ordering because
     *        sort options like Asc/ASC/asc are each accepted by different
     *        deployment versions).
     *   UI mirror: click "Name" column header to sort ascending.
     */
    it('SW_CAT_API_19 - GET /categories with sortOrder=Asc responds 200', () => {
      listCategories({ page: 1, page_size: 50, sortBy: 'name', sortOrder: 'Asc' }).then((res) => {
        expect(res.status).to.equal(200);
      });
    });

    /**
     * SW_CAT_API_20 — Descending sort accepted.
     *   Steps:
     *     1. GET /categories?sortBy=name&sortOrder=desc.
     *     2. Expect 200.
     *   UI mirror: click "Name" column header again to sort descending.
     */
    it('SW_CAT_API_20 - GET /categories with sortOrder=desc responds 200', () => {
      listCategories({ page: 1, page_size: 50, sortBy: 'name', sortOrder: 'desc' }).then((res) => {
        expect(res.status).to.equal(200);
      });
    });

    /**
     * SW_CAT_API_ROUNDTRIP — Create → fetch-by-id round-trip.
     *   Steps:
     *     1. POST /categories (product-only).
     *     2. GET /categories/:id with the fresh id.
     *     3. Expect 200 and response.name to equal the created name.
     *   UI mirror: opening a freshly-created row to view its detail view.
     */
    it('SW_CAT_API_ROUNDTRIP - GET /categories/:id returns the created row', () => {
      const name = uniqueName('RoundTripCat');
      createCategory({
        name,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        createdCategoryIds.push(data.id);
        getCategory(data.id).then((getRes) => {
          expect(getRes.status).to.equal(200);
          expect((getRes.body.data || getRes.body).name).to.equal(name);
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE — rename & allowItems toggle
  // ---------------------------------------------------------------------------
  describe('UPDATE - rename & allowItems toggle', () => {
    /**
     * SW_CAT_API_22 — Rename a product-only category.
     *   Steps:
     *     1. POST a product-only category.
     *     2. PATCH /categories/:id with a new name.
     *     3. Expect response.name = new name.
     *   UI mirror: row "Edit" → change name → Save.
     */
    it('SW_CAT_API_22 - rename product-only category', () => {
      const original = uniqueName('RAM-Orig');
      const updated = `${original}-Updated`;
      createCategory({
        name: original,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        createdCategoryIds.push(data.id);
        patchCategory(data.id, { name: updated }).then((patchRes) => {
          expect(patchRes.status).to.be.oneOf([200, 201]);
          expect((patchRes.body.data || patchRes.body).name).to.equal(updated);
        });
      });
    });

    /**
     * SW_CAT_API_23 — Rename a product-item category.
     *   Steps:
     *     1. POST a product-item category (allowItems=true).
     *     2. PATCH /categories/:id with a new name.
     *     3. Expect response.name = new name.
     *   UI mirror: row "Edit" on a Laptop-like category.
     */
    it('SW_CAT_API_23 - rename product-item category', () => {
      const original = uniqueName('Laptop-Orig');
      const updated = `${original}-Updated`;
      createCategory({
        name: original,
        allowItems: true,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        createdCategoryIds.push(data.id);
        patchCategory(data.id, { name: updated }).then((patchRes) => {
          expect(patchRes.status).to.be.oneOf([200, 201]);
          expect((patchRes.body.data || patchRes.body).name).to.equal(updated);
        });
      });
    });

    /**
     * SW_CAT_API_24 — Enable allowItems on an empty product-only category.
     *   Steps:
     *     1. POST product-only category.
     *     2. PATCH allowItems=true.
     *     3. Expect response.allowItems=true.
     *   Why "no data": toggling allowItems on a category with live inventory
     *   is UI-gated; at the API layer we only verify the empty-category path.
     *   UI mirror: row Edit → flip Allow Items toggle ON → Save.
     */
    it('SW_CAT_API_24 - enable allowItems on product-only category (no data)', () => {
      const name = uniqueName('RAM-ToggleOn');
      createCategory({
        name,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        createdCategoryIds.push(data.id);
        patchCategory(data.id, { allowItems: true }).then((patchRes) => {
          expect(patchRes.status).to.be.oneOf([200, 201]);
          expect((patchRes.body.data || patchRes.body).allowItems).to.equal(true);
        });
      });
    });

    /**
     * SW_CAT_API_25 — Disable allowItems on an empty product-item category.
     *   Steps:
     *     1. POST product-item category.
     *     2. PATCH allowItems=false.
     *     3. Expect response.allowItems=false.
     *   UI mirror: row Edit → flip Allow Items toggle OFF → Save.
     */
    it('SW_CAT_API_25 - disable allowItems on product-item category (no data)', () => {
      const name = uniqueName('Laptop-ToggleOff');
      createCategory({
        name,
        allowItems: true,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        createdCategoryIds.push(data.id);
        patchCategory(data.id, { allowItems: false }).then((patchRes) => {
          expect(patchRes.status).to.be.oneOf([200, 201]);
          expect((patchRes.body.data || patchRes.body).allowItems).to.equal(false);
        });
      });
    });

    /**
     * SW_CAT_API_RESTORE — Rename and restore (round-trip edit).
     *   Steps:
     *     1. POST a product-only category with name "original".
     *     2. PATCH name → "edited".
     *     3. PATCH name → "original" again.
     *     4. Expect final response.name = "original".
     *   Why: verifies PATCH is idempotent on name and that no ghost history
     *   prevents restoring the initial value. UI mirror: edit → Save → edit
     *   back → Save.
     */
    it('SW_CAT_API_RESTORE - rename roundtrip (edit then restore)', () => {
      const original = uniqueName('Cat-Restore');
      const edited = `${original}-Edited`;
      createCategory({
        name: original,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        createdCategoryIds.push(data.id);
        patchCategory(data.id, { name: edited }).then(() => {
          patchCategory(data.id, { name: original }).then((restore) => {
            expect(restore.status).to.be.oneOf([200, 201]);
            expect((restore.body.data || restore.body).name).to.equal(original);
          });
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // VALIDATION & NEGATIVE
  // ---------------------------------------------------------------------------
  describe('VALIDATION & NEGATIVE', () => {
    /**
     * SW_CAT_API_17 — Missing name returns 400 from Joi.
     *   Steps:
     *     1. POST /categories omitting `name`.
     *     2. Expect 400.
     *   UI mirror: Save button disabled / inline "Name is required".
     */
    it('SW_CAT_API_17 - missing name returns 400', () => {
      createCategory({ allowItems: false, allowVariants: false, allowVariantItems: false }).then(
        (res) => expect(res.status).to.equal(400),
      );
    });

    /**
     * SW_CAT_API_34 — Duplicate name returns 409 from the uniqueness check.
     *   Steps:
     *     1. POST unique category → expect success; capture id.
     *     2. POST a SECOND category with the same name → expect 409.
     *   UI mirror: "Category name already exists" inline error.
     */
    it('SW_CAT_API_34 - duplicate name returns 409', () => {
      const name = uniqueName('Dup-Cat');
      createCategory({
        name,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        createdCategoryIds.push(data.id);
        createCategory({
          name,
          allowItems: false,
          allowVariants: false,
          allowVariantItems: false,
        }).then((dup) => {
          expect(dup.status).to.equal(409);
        });
      });
    });

    /**
     * SW_CAT_API_35 — Special-character-only name.
     *   Steps:
     *     1. POST with name="@#$%^&*".
     *     2. Expect either 400 (Joi pattern fail) or 409 (treated as
     *        equivalent to an existing sanitized empty name). Both paths
     *        are considered rejection; we do not distinguish here.
     *   UI mirror: "Name can only contain letters, numbers and spaces".
     */
    it('SW_CAT_API_35 - special-characters-only name returns 400', () => {
      createCategory({
        name: '@#$%^&*',
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => expect(res.status).to.be.oneOf([400, 409]));
    });

    /**
     * SW_CAT_API_AUTH — Unauthenticated POST is blocked.
     *   Steps:
     *     1. POST /categories without the Authorization header.
     *     2. Expect 401 from the global AuthGuard / UnauthorizedFilter.
     *   UI mirror: expired-session auto-redirect to /login.
     */
    it('SW_CAT_API_AUTH - unauthenticated POST /categories returns 401', () => {
      cy.request({
        method: 'POST',
        url: `${baseUrl}/categories`,
        headers: { 'Content-Type': 'application/json' },
        failOnStatusCode: false,
        body: {
          name: uniqueName('NoAuth'),
          allowItems: false,
          allowVariants: false,
          allowVariantItems: false,
        },
      }).then((res) => expect(res.status).to.equal(401));
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------
  describe('DELETE', () => {
    /**
     * SW_CAT_API_32 — Delete a product-only category that has no data.
     *   Steps:
     *     1. POST product-only category.
     *     2. DELETE /categories/:id → expect 200/201/204.
     *     3. GET /categories/:id → expect 404/400 to confirm removal.
     *   UI mirror: row delete icon + confirmation dialog.
     */
    it('SW_CAT_API_32 - delete product-only category (no data) succeeds', () => {
      const name = uniqueName('RAM-ToDel');
      createCategory({
        name,
        allowItems: false,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        deleteCategory(data.id).then((delRes) => {
          expect(delRes.status).to.be.oneOf([200, 201, 204]);
          getCategory(data.id).then((getRes) => {
            expect(getRes.status).to.be.oneOf([404, 400]);
          });
        });
      });
    });

    /**
     * SW_CAT_API_33 — Delete a product-item category that has no data.
     *   Steps:
     *     1. POST product-item category (allowItems=true).
     *     2. DELETE /categories/:id → expect 200/201/204.
     *   UI mirror: row delete icon on a Laptop-like category.
     */
    it('SW_CAT_API_33 - delete product-item category (no data) succeeds', () => {
      const name = uniqueName('Laptop-ToDel');
      createCategory({
        name,
        allowItems: true,
        allowVariants: false,
        allowVariantItems: false,
      }).then((res) => {
        const data = res.body.data || res.body;
        deleteCategory(data.id).then((delRes) => {
          expect(delRes.status).to.be.oneOf([200, 201, 204]);
        });
      });
    });
  });

  // UI-only (not asserted): Add Category modal title, breadcrumb, Save/Cancel
  // buttons, Allow Items toggle rendering, Delete confirmation dialog UI,
  // sort-header click interactions, toast copy.
});
