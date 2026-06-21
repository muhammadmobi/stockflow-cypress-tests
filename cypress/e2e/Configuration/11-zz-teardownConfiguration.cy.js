/**
 * Configuration suite — FINAL API TEARDOWN.
 * =============================================================================
 * This spec is intentionally named "11-zz-…" so it sorts last and runs AFTER
 * every other Configuration spec (00–10). The Configuration specs are order-
 * dependent: spec 02 creates "RAM Automation Cat", spec 03 creates
 * "Laptop Automation Cat" + its ~230 attributes, and specs 04–10 all consume
 * those two shared categories. Deleting that data mid-suite (as older specs
 * did) cascades every downstream test into failure, so ALL destructive cleanup
 * is consolidated here and done purely via API for speed + reliability.
 *
 * What this removes (dependency-safe order — products/POs first, then
 * attributes, then the categories themselves):
 *   - Purchase orders created by the import/deletion specs
 *   - Products + serialised items inside the two shared categories
 *   - Common Product/Item attributes (commonAttributeTestData)
 *   - Per-category attributes (prodItem… + product… cat attribute fixtures)
 *   - The two shared categories: "Laptop Automation Cat", "RAM Automation Cat"
 *
 * Every delete is best-effort (failOnStatusCode:false); a leftover row is
 * logged, never fails the run.
 */

import { apiCleanupConfiguration } from "../../support/Configuration/apiCleanup.js";

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

describe("Configuration – Final API Teardown (SW_CFG_TEARDOWN)", () => {
  before(() => {
    loginSession();
  });

  it("SW_CFG_TEARDOWN_01 – delete all Configuration-suite test data via API", () => {
    apiCleanupConfiguration({
      commonAttrFixtures: ["Configuration/commonAttributeTestData"],
      catAttrFixtures: [
        "Configuration/prodItemCatAttributeTestData",
        "Configuration/productCatAttributeTestData",
      ],
      categories: ["Laptop Automation Cat", "RAM Automation Cat"],
      poNumbers: [
        "PO-CommonAttribute-Deletion",
        "PO-CategoryAttribute-Deletion",
        "PO-CatTest-Laptop",
        "PO-CatTest-RAM",
      ],
    });
  });

  it("SW_CFG_TEARDOWN_02 – verify shared categories are gone", () => {
    cy.getAuthToken().then((token) => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("API_BASE_URL")}/categories?page=1&page_size=500`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
        timeout: 60000,
      }).then((res) => {
        const body = (res.body && res.body.data) || res.body || {};
        const cats = body.list || body.items || (Array.isArray(body) ? body : []);
        const names = cats.map((c) => c && c.name);
        // Best-effort: a category still referenced by undeletable products may
        // survive. Log rather than hard-fail so the teardown never blocks CI.
        ["Laptop Automation Cat", "RAM Automation Cat"].forEach((n) => {
          if (names.includes(n)) {
            cy.log(`[teardown] WARNING: category "${n}" still present after cleanup`);
          } else {
            cy.log(`[teardown] category "${n}" successfully removed`);
          }
        });
      });
    });
  });
});
