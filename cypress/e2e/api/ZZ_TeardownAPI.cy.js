/**
 * API Teardown — full cleanup of test-created resources
 * =============================================================================
 * Purpose
 *   Walk the live API and DELETE every resource the API spec suite has ever
 *   left behind, one by one, in dependency-safe order. Prefix-matched against
 *   the same naming patterns the API specs use, so production / QA-seeded
 *   data is NEVER touched.
 *
 * Filename starts with `ZZ_` so this spec runs LAST when the directory is
 * executed via `cypress/e2e/api/**`.
 *
 * -----------------------------------------------------------------------------
 *   Order requested
 * -----------------------------------------------------------------------------
 *     1. Products            → POST /products/deleteProduct
 *     2. Product items       → DELETE /products/item/:serialNumber
 *     3. Workers (PO assign) → DELETE /configs/po-assignment/:poNumber
 *     4. Purchase Orders     → DELETE /purchase-orders/:poNumber
 *     5. Categories          → DELETE /categories/:id
 *     6. Attributes          → DELETE /attributes/:id
 *
 * Internally the order is rearranged so children are deleted before their
 * parents (items before products, attributes before their host categories,
 * etc.) — see TEARDOWN_PHASES below. Resources that fail to delete are
 * logged and skipped rather than failing the suite, so a single in-use row
 * does not block the rest of the cleanup.
 *
 * -----------------------------------------------------------------------------
 *   Safety: prefix allow-list
 * -----------------------------------------------------------------------------
 * Every DELETE is gated by `isTestResource(name)`. The default prefix list
 * mirrors the literal names used by the API specs. Override at runtime via:
 *
 *     CYPRESS_TEARDOWN_PREFIX_REGEX="^(Cat|Prod|Test)-"
 *     npx cypress run --env TEARDOWN_PREFIX_REGEX="^Foo-" --spec ...
 *
 * Set CYPRESS_TEARDOWN_DRY_RUN=true to log targets without deleting.
 *
 * -----------------------------------------------------------------------------
 *   This is NOT a normal regression spec
 * -----------------------------------------------------------------------------
 * It performs side-effecting deletes against the configured environment.
 * Run only when the environment is meant to be reset (e.g. nightly cleanup,
 * or manually after a failed run). It contains no assertions about business
 * behaviour — every `it` reports counts via cy.log so the report is the
 * audit trail.
 */

describe('API Teardown - cleanup test-created resources', () => {
  // -------------------- Shared state --------------------
  let authToken;
  let baseUrl;
  let dryRun;
  let prefixRegex;

  /** Counters surfaced via cy.log so the Mochawesome report shows what ran. */
  const counts = {
    items: { found: 0, deleted: 0, failed: 0 },
    products: { found: 0, deleted: 0, failed: 0 },
    workers: { found: 0, deleted: 0, failed: 0 },
    purchaseOrders: { found: 0, deleted: 0, failed: 0 },
    categories: { found: 0, deleted: 0, failed: 0 },
    attributes: { found: 0, deleted: 0, failed: 0 },
  };

  // -------------------- Default test-resource prefixes --------------------
  // Names used by API specs in cypress/e2e/api/*. We only match patterns
  // that include the API specs' literal test-prefixes AND require something
  // that distinguishes them from production seed rows — usually a hyphen
  // followed by the unique 6-digit timestamp suffix the specs append.
  //
  // Production rows like "Laptop", "RAM", "Category" carry no such suffix
  // and are therefore left alone.
  const DEFAULT_PREFIX_REGEX = new RegExp(
    [
      // API-spec category names: always carry a trailing "-<digits>" suffix
      '^(LaptopCat|RAMCat|RoundTripCat|Cat-Restore|Dup-Cat|NoAuth)-\\d',
      '^(Hier-Cat|ProdOnly-\\w+|ProdName-Cat|DelRestrict-Cat)-\\d',
      // Attribute names from the deletion-restriction spec
      '^DelChk\\s',
      // Generic test-tag prefixes used by automation only
      '^(api-test|sw-api|test-api|TestAPI|AutoAPI|QA-Auto|API-AUTO|API_AUTO)-',
      '^TC\\d+-',
    ].join('|'),
    'i',
  );

  // -------------------- Helpers --------------------

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const apiRequest = (method, path, opts = {}) =>
    cy.request({
      method,
      url: `${baseUrl}${path}`,
      headers: headers(),
      failOnStatusCode: false,
      timeout: 60000,
      ...opts,
    });

  /** Returns true when the given display name matches a known test prefix. */
  const isTestResource = (name) => {
    if (!name || typeof name !== 'string') return false;
    return prefixRegex.test(name.trim());
  };

  /** Pull the array of rows out of the various envelope shapes the API uses. */
  const extractList = (resBody) => {
    const body = (resBody && resBody.data) || resBody || {};
    return body.list || body.items || body.results || (Array.isArray(body) ? body : []);
  };

  /**
   * Walk a paginated list endpoint and accumulate rows that match
   * isTestResource on the supplied name field. Caps at hardLimit pages to
   * avoid runaway loops if the backend ignores paging.
   */
  const collectMatching = (path, nameField, { pageSize = 100, hardLimit = 50, extraQs = '' } = {}) => {
    const collected = [];
    const fetchPage = (page) =>
      apiRequest('GET', `${path}?page=${page}&page_size=${pageSize}${extraQs}`).then((res) => {
        if (res.status >= 400) return collected;
        const rows = extractList(res.body);
        rows.forEach((row) => {
          const name = row && (row[nameField] || row.name);
          if (isTestResource(name)) collected.push(row);
        });
        if (rows.length < pageSize || page >= hardLimit) return collected;
        return fetchPage(page + 1);
      });
    return fetchPage(1);
  };

  /** Execute a delete unless dry-run; bump counters either way. */
  const tryDelete = (bucket, label, fn) => {
    counts[bucket].found += 1;
    if (dryRun) {
      cy.log(`[dry-run] would delete ${bucket} ${label}`);
      return cy.wrap(null);
    }
    return fn().then((res) => {
      const ok = res.status >= 200 && res.status < 300;
      const semanticOk = res.body && res.body.success !== false;
      if (ok && semanticOk) {
        counts[bucket].deleted += 1;
      } else {
        counts[bucket].failed += 1;
        cy.log(`failed to delete ${bucket} ${label} → ${res.status}`);
      }
    });
  };

  // -------------------- Setup --------------------

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    const identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');
    dryRun = String(Cypress.env('TEARDOWN_DRY_RUN') || '').toLowerCase() === 'true';
    const overrideRegex = Cypress.env('TEARDOWN_PREFIX_REGEX');
    prefixRegex = overrideRegex ? new RegExp(overrideRegex, 'i') : DEFAULT_PREFIX_REGEX;

    cy.log(`Teardown mode: ${dryRun ? 'DRY RUN' : 'LIVE DELETE'}`);
    cy.log(`Prefix regex: ${prefixRegex}`);

    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: { username: Cypress.env('email'), password: Cypress.env('pass') },
    }).then((res) => {
      authToken = res.body.accessToken || res.body.token;
      expect(authToken, 'auth token').to.exist;
    });
  });

  after(() => {
    cy.log('--- Teardown summary ---');
    Object.entries(counts).forEach(([k, v]) => {
      cy.log(`${k}: found=${v.found} deleted=${v.deleted} failed=${v.failed}`);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 1 — Product items (must be removed before their parent product)
  // ---------------------------------------------------------------------------
  /**
   * For every test-prefixed product that has hasItems=true, list its items
   * via GET /products/:id/items and DELETE /products/item/:serialNumber.
   * Items whose product itself is non-test are left alone.
   */
  it('Phase 1 - delete serialised product items belonging to test products', () => {
    collectMatching('/products', 'name', { pageSize: 100 }).then((products) => {
      const itemBearers = products.filter((p) => p && p.hasItems);
      if (itemBearers.length === 0) {
        cy.log('No test products with items found.');
        return;
      }
      cy.wrap(itemBearers).each((product) => {
        apiRequest('GET', `/products/${product.id}/items?page=1&page_size=200`).then((res) => {
          const items = extractList(res.body);
          items.forEach((item) => {
            const serial = item && (item.serialNumber || item.serial);
            if (!serial) return;
            tryDelete('items', serial, () =>
              apiRequest('DELETE', `/products/item/${encodeURIComponent(serial)}`),
            );
          });
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2 — Products (POST /products/deleteProduct {id})
  // ---------------------------------------------------------------------------
  it('Phase 2 - delete test-prefixed products', () => {
    collectMatching('/products', 'name', { pageSize: 100 }).then((products) => {
      products.forEach((p) => {
        const id = p && p.id;
        const label = `${p && p.name}#${id}`;
        if (!id) return;
        tryDelete('products', label, () =>
          apiRequest('POST', '/products/deleteProduct', { body: { id } }),
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 3 — Workers / PO assignments
  // ---------------------------------------------------------------------------
  /**
   * `/configs/po-assignment` returns rows keyed by poNumber. We only delete
   * assignments whose poNumber matches a test-prefix — the worker user
   * accounts themselves live in the identity server and are out of scope.
   */
  it('Phase 3 - delete worker / PO-assignment rows attached to test POs', () => {
    apiRequest('GET', '/configs/po-assignment').then((res) => {
      const rows = extractList(res.body);
      rows.forEach((row) => {
        const po = row && (row.poNumber || row.po);
        if (!po || !isTestResource(po)) return;
        tryDelete('workers', po, () =>
          apiRequest('DELETE', `/configs/po-assignment/${encodeURIComponent(po)}`),
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 4 — Purchase Orders
  // ---------------------------------------------------------------------------
  it('Phase 4 - delete test-prefixed purchase orders', () => {
    collectMatching('/purchase-orders', 'poNumber', { pageSize: 100 }).then((pos) => {
      pos.forEach((po) => {
        const num = po && po.poNumber;
        if (!num) return;
        tryDelete('purchaseOrders', num, () =>
          apiRequest('DELETE', `/purchase-orders/${encodeURIComponent(num)}`),
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 5 — Attributes (must be removed before their host category)
  // ---------------------------------------------------------------------------
  it('Phase 5 - delete test-prefixed attributes', () => {
    apiRequest('GET', '/attributes?page=1&page_size=500').then((res) => {
      const rows = extractList(res.body);
      rows.forEach((attr) => {
        const id = attr && attr.id;
        const label = `${attr && attr.name}#${id}`;
        if (!id || !isTestResource(attr.name)) return;
        tryDelete('attributes', label, () => apiRequest('DELETE', `/attributes/${id}`));
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 6 — Categories (parent of products + attributes — last)
  // ---------------------------------------------------------------------------
  it('Phase 6 - delete test-prefixed categories', () => {
    collectMatching('/categories', 'name', { pageSize: 100 }).then((cats) => {
      cats.forEach((c) => {
        const id = c && c.id;
        const label = `${c && c.name}#${id}`;
        if (!id) return;
        tryDelete('categories', label, () => apiRequest('DELETE', `/categories/${id}`));
      });
    });
  });
});
