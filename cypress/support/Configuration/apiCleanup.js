/**
 * API-based cleanup helpers for the Configuration suite (cypress/e2e/Configuration/*).
 * =============================================================================
 * The Configuration specs create real resources on the live backend:
 *   - common attributes (Product + Item), e.g. "Display Technology"
 *   - per-category attributes on "Laptop Automation Cat" / "RAM Automation Cat"
 *   - the two shared categories themselves
 *   - purchase orders + products + serialised items (Excel imports in 04/05)
 *
 * These names are real-world strings (no "test-" prefix), so the generic
 * ZZ_TeardownAPI prefix allow-list does NOT catch them. This helper deletes
 * them by *exact known name* (plus the concatenated-leftover variants an older
 * page-object bug produced, e.g. "Display TechnologyDisplay Technology Updated").
 *
 * All calls go through cy.request against API_BASE_URL using the JWT already in
 * localStorage (the spec must be logged in — call inside an after() that runs a
 * loginSession() first). Every delete is best-effort: failOnStatusCode:false +
 * the suite is never failed by a cleanup miss (a leftover row just gets logged).
 *
 * Usage (inside a spec):
 *   import { apiCleanupConfiguration } from "../../support/Configuration/apiCleanup";
 *   after(() => {
 *     loginSession();
 *     apiCleanupConfiguration({
 *       commonAttrFixtures: ["Configuration/commonAttributeTestData"],
 *       catAttrFixtures:    ["Configuration/prodItemCatAttributeTestData"],
 *       categories:         ["Laptop Automation Cat"],
 *     });
 *   });
 */

const apiBase = () => Cypress.env("API_BASE_URL");

/** Pull the row array out of whatever envelope shape the endpoint returns. */
const extractList = (resBody) => {
  const body = (resBody && resBody.data) || resBody || {};
  return (
    body.list ||
    body.items ||
    body.results ||
    (Array.isArray(body) ? body : [])
  );
};

/** Authenticated cy.request that never throws on non-2xx. */
const apiRequest = (token, method, path, opts = {}) =>
  cy.request({
    method,
    url: `${apiBase()}${path}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    failOnStatusCode: false,
    timeout: 60000,
    ...opts,
  });

/**
 * Walk a fixture object collecting every `.name` and `.updatedName` string.
 * @returns {string[]} unique base names
 */
export const collectFixtureNames = (data) => {
  const names = new Set();
  const walk = (o) => {
    if (o && typeof o === "object") {
      if (typeof o.name === "string") names.add(o.name);
      if (typeof o.updatedName === "string") names.add(o.updatedName);
      Object.values(o).forEach(walk);
    }
  };
  walk(data);
  return [...names];
};

/**
 * Delete every attribute whose name exactly matches one of `names`, OR is a
 * concatenated-leftover of one of them (startsWith a base name but is longer —
 * catches the old "DisplayTechnologyDisplay Technology Updated" corruption).
 *
 * @param {string} token       JWT
 * @param {string[]} names      attribute names to remove
 * @param {object} [opts]
 * @param {number} [opts.categoryId]  when set, only delete attrs on this category
 */
export const apiDeleteAttributesByName = (token, names, opts = {}) => {
  if (!names || names.length === 0) return cy.wrap(null);
  const wanted = new Set(names);
  const qs = opts.categoryId
    ? `?all=true&categoryId=${opts.categoryId}`
    : `?all=true&page_size=1000`;

  return apiRequest(token, "GET", `/attributes${qs}`).then((res) => {
    if (res.status >= 400) {
      cy.log(`[apiCleanup] GET /attributes failed → ${res.status}`);
      return;
    }
    const rows = extractList(res.body);
    const targets = rows.filter((a) => {
      if (!a || typeof a.name !== "string") return false;
      if (wanted.has(a.name)) return true;
      // concatenated-leftover: name begins with a known base AND is longer
      return [...wanted].some(
        (n) => a.name !== n && a.name.startsWith(n) && a.name.length > n.length,
      );
    });
    cy.log(`[apiCleanup] attributes matched for delete: ${targets.length}`);
    return cy.wrap(targets).each((attr) => {
      apiRequest(token, "DELETE", `/attributes/${attr.id}`).then((d) => {
        const ok = d.status < 300 && d.body && d.body.success !== false;
        cy.log(`[apiCleanup] DELETE attribute ${attr.name}#${attr.id} → ${ok ? "ok" : d.status}`);
      });
    });
  });
};

/**
 * Delete a category by exact name (after its attributes have been removed).
 * Best-effort — a category still referenced by products will not delete, and
 * that is logged rather than failing the suite.
 */
export const apiDeleteCategoryByName = (token, name) =>
  apiRequest(token, "GET", `/categories?page=1&page_size=500`).then((res) => {
    if (res.status >= 400) return;
    const cats = extractList(res.body);
    const match = cats.find((c) => c && c.name === name);
    if (!match) {
      cy.log(`[apiCleanup] category "${name}" not present — nothing to delete`);
      return;
    }
    return apiRequest(token, "DELETE", `/categories/${match.id}`).then((d) => {
      const ok = d.status < 300 && d.body && d.body.success !== false;
      cy.log(`[apiCleanup] DELETE category ${name}#${match.id} → ${ok ? "ok" : d.status}`);
    });
  });

/** Delete all serialised items of a product, then the product itself. */
export const apiDeleteProductWithItems = (token, productId) =>
  apiRequest(token, "GET", `/products/${productId}/items?page=1&page_size=500`).then((res) => {
    const items = extractList(res.body);
    return cy
      .wrap(items)
      .each((it) => {
        const serial = it && (it.serialNumber || it.serial);
        if (serial) {
          apiRequest(token, "DELETE", `/products/item/${encodeURIComponent(serial)}`);
        }
      })
      .then(() => {
        apiRequest(token, "POST", `/products/deleteProduct`, { body: { id: productId } });
      });
  });

/**
 * Delete every product (and its items) that belongs to a named category, then
 * the purchase order, then the category. Used by import-based specs (04/05).
 *
 * @param {string} token
 * @param {object} cfg
 * @param {string[]} [cfg.categories]   exact category names to purge
 * @param {string[]} [cfg.poNumbers]    purchase orders to delete
 */
export const apiPurgeCategoriesAndPOs = (token, cfg = {}) => {
  const categories = cfg.categories || [];
  const poNumbers = cfg.poNumbers || [];

  // 1. products in each target category (delete items first, then product)
  return apiRequest(token, "GET", `/categories?page=1&page_size=500`)
    .then((res) => {
      const cats = extractList(res.body);
      const targetCats = cats.filter((c) => c && categories.includes(c.name));
      return cy.wrap(targetCats).each((cat) =>
        apiRequest(token, "GET", `/products?page=1&page_size=500&category=${cat.id}`).then((pr) => {
          const products = extractList(pr.body).filter(
            (p) => p && (p.category === cat.id || p.categoryId === cat.id),
          );
          return cy.wrap(products).each((p) => apiDeleteProductWithItems(token, p.id));
        }),
      );
    })
    // 2. purchase orders
    .then(() =>
      cy.wrap(poNumbers).each((po) =>
        apiRequest(token, "DELETE", `/purchase-orders/${encodeURIComponent(po)}`).then((d) =>
          cy.log(`[apiCleanup] DELETE PO ${po} → ${d.status}`),
        ),
      ),
    );
};

/**
 * The two categories the shared import fixture (testDataAttributes.json) builds.
 * That fixture is the "baseline" consumed by the attribute-deletion-restriction
 * (spec 04) and product-name (spec 06) suites: 2 categories + 10 common-product
 * + 10 common-item + 20 Laptop + 10 RAM attributes.
 */
export const BASELINE_CATEGORIES = ["Laptop Automation Cat", "RAM Automation Cat"];

/**
 * Purge the entire shared baseline so a spec can rebuild it from a clean slate.
 * Deletes (in dependency-safe order): products + serialised items inside the two
 * baseline categories, the supplied purchase orders, every attribute named in
 * testDataAttributes.json, then the two categories themselves.
 *
 * This is the key to running the Configuration specs *independently* and in any
 * order: the backend bulk-import (POST /categories/multi) is all-or-nothing — it
 * rolls the whole transaction back if ANY attribute already exists — so a spec
 * that re-imports the baseline must first guarantee none of those names exist.
 *
 * @param {string} token JWT
 * @param {object} [opts]
 * @param {string[]} [opts.poNumbers] purchase orders to remove first
 */
export const apiPurgeBaseline = (token, opts = {}) => {
  const poNumbers = opts.poNumbers || [];
  return cy.fixture("testDataAttributes").then((d) => {
    const names = collectFixtureNames(d); // 50 attribute names + 2 category names
    return apiPurgeCategoriesAndPOs(token, {
      categories: BASELINE_CATEGORIES,
      poNumbers,
    })
      .then(() => apiDeleteAttributesByName(token, names))
      .then(() =>
        cy.wrap(BASELINE_CATEGORIES).each((c) => apiDeleteCategoryByName(token, c)),
      );
  });
};

/** Fields the single POST /attributes endpoint accepts (createAttributeSchema). */
const pickAttrPayload = (a, categoryId) => {
  const p = {
    name: a.name,
    type: a.type,
    fieldName: a.fieldName,
    editable: a.editable !== undefined ? a.editable : true,
    required: a.required !== undefined ? a.required : false,
  };
  if (a.unique !== undefined) p.unique = a.unique;
  if (a.locked !== undefined) p.locked = a.locked;
  if (a.otherInfo !== undefined) p.otherInfo = a.otherInfo;
  if (a.entityType !== undefined) p.entityType = a.entityType;
  if (categoryId != null) p.categoryId = categoryId;
  return p;
};

/**
 * Build the shared baseline so it is GUARANTEED present regardless of what
 * already exists on the target environment.
 *
 * Approach:
 *   1. ensure the 2 baseline categories exist via the SINGLE POST /categories
 *      (the bulk /categories/multi needs the enableImportExportAttributes flag,
 *      which is OFF on Stage, so it 400s "import disabled");
 *   2. read the attributes already present;
 *   3. create the MISSING ones in ONE bulk POST /attributes/multi call. The batch
 *      is de-duplicated by name first: the fixture has two "MSRP" attributes
 *      (Laptop + RAM) → same fieldName "msrp" → a unique-constraint conflict that
 *      rolls the whole all-or-nothing batch back (builds nothing). De-duping fixes
 *      that, and one bulk call (vs ~48 per-attribute POSTs) is far faster and
 *      survives the flaky/slow network. Falls back to per-attribute creation only
 *      if the bulk call fails.
 *
 * Returns the number of attributes it attempted to create.
 */
export const apiImportBaseline = (token) =>
  cy.fixture("testDataAttributes").then((payload) => {
    const attrs = payload.attributes || [];
    const cats = payload.categories || [];
    // Create the baseline categories via the SINGLE POST /categories. We must NOT
    // use /categories/multi here: it requires the `enableImportExportAttributes`
    // general-config flag, which is OFF by default (and gets reset when data is
    // cleared), so it 400s "Import of attributes is disabled" and creates nothing.
    // POST /categories has no such gate.
    return apiRequest(token, "GET", `/categories?page=1&page_size=500`)
      .then((catRes) => {
        const existingCats = new Set(extractList(catRes.body).map((c) => c && c.name));
        return cy.wrap(cats).each((c) => {
          if (existingCats.has(c.name)) return;
          return apiRequest(token, "POST", "/categories", {
            body: {
              name: c.name,
              allowItems: !!c.allowItems,
              allowVariants: !!c.allowVariants,
              allowVariantItems: !!c.allowVariantItems,
            },
          }).then((r) => cy.log(`[apiCleanup] create category ${c.name} → ${r.status}`));
        });
      })
      .then(() => apiRequest(token, "GET", `/categories?page=1&page_size=500`))
      .then((catRes) => {
        const catByName = {};
        extractList(catRes.body).forEach((c) => {
          if (c && c.name) catByName[c.name] = c.id;
        });
        return apiRequest(token, "GET", `/attributes?all=true&page_size=2000`).then((attrRes) => {
          const existing = new Set(extractList(attrRes.body).map((a) => a && a.name));
          // Split into the de-duplicated bulk set and the dropped duplicates.
          // The fixture has two "MSRP" (one per category, same fieldName "msrp"):
          // /attributes/multi rolls back on the in-batch dup, so we bulk the unique
          // names and then create the dropped duplicate(s) individually, with their
          // own categoryId, so each category gets its copy.
          const seen = new Set();
          const missing = [];
          const droppedDups = [];
          attrs.forEach((a) => {
            if (existing.has(a.name)) return;
            if (seen.has(a.name)) { droppedDups.push(a); return; }
            seen.add(a.name);
            missing.push(a);
          });
          cy.log(`[apiCleanup] baseline attrs — ${existing.size} present, ${missing.length} bulk, ${droppedDups.length} dup`);

          // Create the dropped duplicates — BUT skip any whose fieldName already
          // exists. The backend enforces a GLOBAL fieldName uniqueness, so e.g.
          // "MSRP" (fieldName "msrp") cannot live on both Laptop and RAM: POSTing
          // the second one doesn't add a row, it MOVES the existing attribute to
          // the new category. Since the bulk above already created the first
          // occurrence (Laptop's MSRP, on the Laptop category) and no spec needs a
          // second copy, creating the dropped RAM dup would silently relocate MSRP
          // to RAM and break PN_01 (which expects MSRP in the Laptop dropdown).
          // So we only create a dropped dup when its fieldName is still free.
          const createDroppedDups = () =>
            apiRequest(token, "GET", `/attributes?all=true&page_size=2000`).then((res) => {
              const existingFields = new Set(
                extractList(res.body).map((a) => a && a.fieldName),
              );
              return cy.wrap(droppedDups, { log: false }).each((a) => {
                if (existingFields.has(a.fieldName)) {
                  cy.log(
                    `[apiCleanup] skip dropped dup ${a.name} — fieldName "${a.fieldName}" already exists (global uniqueness)`,
                  );
                  return;
                }
                const categoryId = a.categoryName ? catByName[a.categoryName] : null;
                return apiRequest(token, "POST", "/attributes", {
                  body: pickAttrPayload(a, categoryId),
                });
              });
            });

          if (missing.length === 0) return createDroppedDups().then(() => cy.wrap(0, { log: false }));
          const payloadAttrs = missing.map(({ id, ...rest }) => rest);
          return apiRequest(token, "POST", "/attributes/multi", {
            body: payloadAttrs,
            timeout: 120000,
          })
            .then((r) => {
              const ok = r.status < 400 && r.body && r.body.success !== false;
              cy.log(`[apiCleanup] bulk create ${payloadAttrs.length} attrs → ${r.status} ${ok ? "ok" : JSON.stringify(r.body).slice(0, 160)}`);
              if (ok) return;
              cy.log("[apiCleanup] bulk failed — falling back to per-attribute create");
              return cy.wrap(payloadAttrs, { log: false }).each((a) => {
                const categoryId = a.categoryName ? catByName[a.categoryName] : null;
                return apiRequest(token, "POST", "/attributes", { body: pickAttrPayload(a, categoryId) });
              });
            })
            .then(() => createDroppedDups())
            .then(() => cy.wrap(payloadAttrs.length, { log: false }));
        });
      });
  });

/**
 * Ensure an active (Open) purchase order exists so it appears in PO pickers that
 * query `/purchase-orders/po-numbers/?close=false` (e.g. BrainBox config). On a
 * clean environment there are no POs, so specs that select one by number must
 * seed it. Best-effort: a duplicate (already exists) is fine.
 */
export const apiEnsurePurchaseOrder = (token, poNumber, opts = {}) =>
  apiRequest(token, "POST", "/purchase-orders", {
    body: {
      poNumber,
      status: "Open",
      expectedQuantity: opts.expectedQuantity != null ? opts.expectedQuantity : 10,
      originalQuantity: opts.originalQuantity != null ? opts.originalQuantity : 10,
    },
  }).then((r) => {
    cy.log(`[apiCleanup] ensure PO ${poNumber} → ${r.status}`);
    return cy.wrap(r.status, { log: false });
  });

/**
 * Reset the BrainBox config to an empty payload-field set.
 *
 * The BrainBox Configuration page persists ALL of its state in a single
 * `configs` row (type=name='brainboxConfig', userId='global'), and its
 * `configJson.payloadFields` array ACCUMULATES across runs — spec 09's
 * CONF_003 saves a row without cleanup, and any failed test leaves its added
 * rows behind. Over many runs this grows to dozens of stale rows, which breaks
 * the suite's relative `countBefore + N` length assertions (e.g. "Found 52,
 * expected 51"). Clearing `payloadFields` + `mapping` (while preserving the
 * selected PO/category/defaultCost) restores a clean countBefore=0 baseline.
 * Best-effort: never throws.
 */
export const apiResetBrainBoxConfig = (token) => {
  if (!token) return;
  const qs = { type: "brainboxConfig", name: "brainboxConfig", userId: "global" };
  apiRequest(token, "GET", "/configs", { qs }).then((res) => {
    const list = extractList(res.body);
    const cfg = Array.isArray(list) ? list[0] : null;
    const baselinePayload = { name: "brainboxConfig", type: "brainboxConfig", configJson: { mapping: {}, payloadFields: [{ path: "baseline_field" }] } };
    if (!cfg || !cfg.id) {
      // No config exists yet — create it so the page renders at least 1 row.
      apiRequest(token, "POST", "/configs", { body: baselinePayload })
        .then((r) => cy.log(`[apiCleanup] BrainBox config created (1-row baseline) → ${r.status}`));
      return;
    }
    // Reset to a single baseline row (NOT zero): the BrainBox page disables the
    // delete button when only one row remains (canRemoveField = length > 1), so
    // the specs' cleanup that deletes added rows back to `countBefore` can never
    // remove the very last row. A 1-row baseline gives every spec a stable
    // countBefore=1 that the relative add/delete math and the table-render read
    // both rely on.
    const cleared = {
      ...(cfg.configJson || {}),
      mapping: {},
      payloadFields: [{ path: "baseline_field" }],
    };
    apiRequest(token, "PATCH", `/configs/${cfg.id}`, {
      body: { name: "brainboxConfig", type: "brainboxConfig", configJson: cleared },
    }).then((r) => cy.log(`[apiCleanup] BrainBox payloadFields reset to 1-row baseline → ${r.status}`));
  });
};

/**
 * Ensure an attribute (by name) is associated with a specific category.
 *
 * Some attributes are defined for two categories with the SAME fieldName (e.g.
 * "MSRP"/fieldName "msrp" on both Laptop and RAM). The backend enforces global
 * fieldName uniqueness, so only one copy can exist and the baseline build can
 * non-deterministically leave it on the wrong category. If the attribute exists
 * but on a different category, move it to the desired one via PATCH (categoryId).
 * Best-effort; a no-op if it's already on the target category or doesn't exist.
 */
export const apiEnsureAttributeCategory = (token, attrName, categoryName) => {
  if (!token) return;
  apiRequest(token, "GET", "/categories?page=1&page_size=500").then((catRes) => {
    const cat = extractList(catRes.body).find((c) => c && c.name === categoryName);
    if (!cat) return;
    apiRequest(token, "GET", "/attributes?all=true&page_size=2000").then((aRes) => {
      const rows = extractList(aRes.body).filter((a) => a && a.name === attrName);
      if (rows.length === 0) return; // attribute doesn't exist at all
      if (rows.some((a) => a.categoryId === cat.id)) return; // already correct
      const a = rows[0];
      // Update route is PATCH /attributes with the id in the BODY (not the path).
      // updateAttributeSchema requires name, type, fieldName, editable, required.
      apiRequest(token, "PATCH", `/attributes`, {
        body: {
          id: a.id,
          name: a.name,
          type: a.type,
          fieldName: a.fieldName,
          categoryId: cat.id,
          editable: a.editable != null ? a.editable : true,
          required: a.required != null ? a.required : false,
          unique: a.unique != null ? a.unique : false,
          locked: a.locked != null ? a.locked : false,
        },
      }).then((r) =>
        cy.log(`[apiCleanup] move attr "${attrName}" → ${categoryName} (cat ${cat.id}) → ${r.status}`),
      );
    });
  });
};

/**
 * Reset the per-category "Manage Product Name" configuration to empty.
 *
 * The product-name config is stored as a `configs` row per category
 * (type='categoryProductName', name=`productNamingTemplate<categoryId>`,
 * configJson.productName=[…selected attrs]). On the shared env the baseline
 * categories are not truly recreated (the delete is blocked by dependent data),
 * so this config PERSISTS across runs with stale chips — which (a) removes those
 * attrs from the "add" dropdown (breaking PN_01/PN_02) and (b) leaves chips that
 * the remove/validation specs (PN_05/12/07) expect to be gone. Deleting the
 * config rows gives every run a clean, empty starting state. Best-effort.
 */
export const apiResetProductNameConfig = (
  token,
  categoryNames = BASELINE_CATEGORIES,
) => {
  if (!token) return;
  apiRequest(token, "GET", "/categories").then((catRes) => {
    const ids = extractList(catRes.body)
      .filter((c) => c && categoryNames.includes(c.name))
      .map((c) => c.id);
    ids.forEach((id) => {
      apiRequest(token, "GET", "/configs", {
        qs: { type: "categoryProductName", name: `productNamingTemplate${id}` },
      }).then((cfgRes) => {
        extractList(cfgRes.body).forEach((row) => {
          if (row && row.id) {
            apiRequest(token, "DELETE", `/configs/${row.id}`).then((r) =>
              cy.log(
                `[apiCleanup] delete product-name config ${row.id} (cat ${id}) → ${r.status}`,
              ),
            );
          }
        });
      });
    });
  });
};

/** A representative attribute from each baseline group — if all present, the import worked. */
const KEY_BASELINE_ATTRS = [
  "Display Technology", // common product
  "Asset Security Code", // common item
  "Model Number", // Laptop category product
  "Asset Tag ID", // Laptop category item
  "RAMbrand", // RAM category product
];

/** GET /attributes and report whether every KEY_BASELINE_ATTRS name is present. */
export const apiVerifyBaseline = (token) =>
  apiRequest(token, "GET", "/attributes?all=true&page_size=2000").then((res) => {
    const names = new Set(extractList(res.body).map((a) => a && a.name));
    const missing = KEY_BASELINE_ATTRS.filter((n) => !names.has(n));
    cy.log(`[apiCleanup] baseline verify — missing: ${missing.join(", ") || "none"}`);
    return cy.wrap(missing.length === 0, { log: false });
  });

/**
 * Purge then re-import the baseline so a spec starts from a known-clean, fully
 * populated state (2 categories + 10 common-product + 10 common-item + 20 Laptop
 * + 10 RAM attributes). Safe to call from a before() (must be logged in).
 *
 * The backend import is all-or-nothing (rolls back if ANY attribute already
 * exists), and on the shared QA env an attribute occasionally lingers with
 * associated data the purge can't delete — leaving the baseline partially built.
 * So we verify the key attributes afterwards and, if any are missing, purge +
 * re-import once more. Best-effort: a still-incomplete baseline is logged rather
 * than throwing (so the suite reports its own assertion failures, not a hook
 * crash).
 */
export const apiEnsureBaseline = (token, opts = {}) =>
  apiPurgeBaseline(token, opts)
    .then(() => apiImportBaseline(token))
    .then(() => apiVerifyBaseline(token))
    .then((ok) => {
      if (ok) return;
      cy.log("[apiCleanup] baseline incomplete — purging deeper and retrying once");
      return apiPurgeBaseline(token, opts)
        .then(() => apiImportBaseline(token))
        .then(() => apiVerifyBaseline(token))
        .then((ok2) => {
          if (!ok2) {
            cy.log("[apiCleanup] WARNING: baseline still incomplete after retry");
          }
        });
    });

/**
 * One-shot cleanup entry point. Reads the supplied fixtures, derives attribute
 * names, and deletes attributes → products/POs → categories in dependency-safe
 * order. Safe to call from an after() hook (must be logged in first).
 *
 * @param {object} cfg
 * @param {string[]} [cfg.commonAttrFixtures]  fixture paths for common attrs
 * @param {string[]} [cfg.catAttrFixtures]     fixture paths for category attrs
 * @param {string[]} [cfg.categories]          category names to remove last
 * @param {string[]} [cfg.poNumbers]           purchase orders to remove
 * @param {string[]} [cfg.extraAttrNames]      explicit extra attribute names
 */
export const apiCleanupConfiguration = (cfg = {}) => {
  cy.getAuthToken().then((token) => {
    if (!token) {
      cy.log("[apiCleanup] no auth token — skipping API cleanup");
      return;
    }

    const fixtureNames = [];
    const loadAll = (paths = []) =>
      cy.wrap(paths).each((p) =>
        cy.fixture(p).then((d) => fixtureNames.push(...collectFixtureNames(d))),
      );

    loadAll([...(cfg.commonAttrFixtures || []), ...(cfg.catAttrFixtures || [])])
      .then(() => {
        const names = [...new Set([...fixtureNames, ...(cfg.extraAttrNames || [])])];
        // purge products + POs that block category deletion
        return apiPurgeCategoriesAndPOs(token, {
          categories: cfg.categories || [],
          poNumbers: cfg.poNumbers || [],
        }).then(() => apiDeleteAttributesByName(token, names));
      })
      .then(() =>
        cy.wrap(cfg.categories || []).each((c) => apiDeleteCategoryByName(token, c)),
      );
  });
};
