/**
 * API-level helpers for the General Config ("type=general") and per-category
 * product-name ("type=categoryProductName") config rows.
 *
 * WHY API INSTEAD OF UI: the 2026-06-11 smoke run shows that EVERY
 * `GeneralConfigPage.navigateToGeneralConfig()` call across the whole run
 * (10/12-generalConfig*, ImportTests SW_IMP_006/007 + after(), ChangeStatus,
 * ScanAllProduct, ProductDetailsStatsClickable after-hooks) failed with
 * "Expected to find content 'General Config' within the selector 'h5'" —
 * an environment-wide breakage of the General Config navigation, not a flake
 * in any single spec. Toggling the flags through `PATCH /configs/:id` is
 * deterministic and immune to nav/layout regressions. The payload shape
 * mirrors `Frontend/src/pages/GeneralConfig.tsx` `configPostData` exactly
 * (PATCH body = { type, configJson } — no name/userID).
 */

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const userIdFromToken = (token) => {
  try {
    return String(JSON.parse(atob(token.split('.')[1]))?.id ?? '');
  } catch (e) {
    return '';
  }
};

/**
 * Merge `flags` into the logged-in user's general config row
 * (type='general', name='general'). Creates the row when missing.
 * The Backend import service reads these flags per-user
 * (`WHERE "type"='general' AND "userID"='<jwt id>'` in import.service.ts),
 * so the row is resolved with the SAME userId the session token carries.
 *
 * @param {Object} flags e.g. { allowProductUploadWithoutItems: true,
 *                              isPoNumberRequired: false }
 */
export const apiSetGeneralConfigFlags = (flags) => {
  const apiBase = Cypress.env('API_BASE_URL');
  cy.getAuthToken().then((token) => {
    if (!token) {
      cy.log('apiSetGeneralConfigFlags: no auth token — skipping');
      return;
    }
    const headers = authHeaders(token);
    const userId = userIdFromToken(token);
    cy.request({
      method: 'GET',
      url: `${apiBase}/configs`,
      qs: { type: 'general', name: 'general', userId },
      headers,
      failOnStatusCode: false,
    }).then((res) => {
      const existing = res.body?.data?.list?.[0];
      const currentData = existing?.configJson?.data || {};
      const data = { ...currentData, ...flags };
      if (existing?.id) {
        cy.request({
          method: 'PATCH',
          url: `${apiBase}/configs/${existing.id}`,
          headers,
          failOnStatusCode: false,
          body: { type: 'general', configJson: { data } },
        }).then((r) =>
          cy.log(
            `apiSetGeneralConfigFlags PATCH ${JSON.stringify(flags)}: ${r.status}`,
          ),
        );
      } else {
        cy.request({
          method: 'POST',
          url: `${apiBase}/configs`,
          headers,
          failOnStatusCode: false,
          body: {
            name: 'general',
            type: 'general',
            configJson: { data },
            userID: userId,
          },
        }).then((r) =>
          cy.log(
            `apiSetGeneralConfigFlags POST ${JSON.stringify(flags)}: ${r.status}`,
          ),
        );
      }
    });
  });
};

/**
 * Delete the per-category product-name template config row
 * (type='categoryProductName', name=`productNamingTemplate<catId>`).
 * Replaces the UI "Manage Product Name" clear-all-chips flow in cleanup
 * hooks — best-effort: silently no-ops when the category or config row
 * doesn't exist.
 *
 * @param {string} categoryName exact category name (case-insensitive)
 */
export const apiDeleteProductNameConfig = (categoryName) => {
  const apiBase = Cypress.env('API_BASE_URL');
  cy.getAuthToken().then((token) => {
    if (!token) {
      cy.log(`apiDeleteProductNameConfig: no auth token — skipping ${categoryName}`);
      return;
    }
    const headers = authHeaders(token);
    cy.request({
      method: 'GET',
      url: `${apiBase}/categories`,
      qs: { page: 1, page_size: 200 },
      headers,
      failOnStatusCode: false,
    }).then((catRes) => {
      const list = catRes.body?.data?.list || catRes.body?.data || [];
      const cat = (Array.isArray(list) ? list : []).find(
        (c) => (c.name || '').toLowerCase() === categoryName.toLowerCase(),
      );
      if (!cat) {
        cy.log(`apiDeleteProductNameConfig: category "${categoryName}" not found — skipping`);
        return;
      }
      const tmplName = `productNamingTemplate${cat.id}`;
      cy.request({
        method: 'GET',
        url: `${apiBase}/configs`,
        qs: { type: 'categoryProductName', name: tmplName },
        headers,
        failOnStatusCode: false,
      }).then((cfgRes) => {
        const existing = cfgRes.body?.data?.list?.[0];
        if (!existing?.id) {
          cy.log(`apiDeleteProductNameConfig: no config row for ${categoryName} — nothing to clear`);
          return;
        }
        cy.request({
          method: 'DELETE',
          url: `${apiBase}/configs/${existing.id}`,
          headers,
          failOnStatusCode: false,
        }).then((r) =>
          cy.log(`apiDeleteProductNameConfig DELETE ${categoryName} (#${existing.id}): ${r.status}`),
        );
      });
    });
  });
};
