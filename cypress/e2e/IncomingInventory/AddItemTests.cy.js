import AddItemPage from "../../pageObjects/AddItemPage";
import ItemViewPage from "../../pageObjects/ItemViewPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import { createExcelFile } from "../../support/helpers/incomingInventoryHelpers";
import { ensureStandardProductNameConfigs, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import { apiSetGeneralConfigFlags } from "../../support/helpers/generalConfigApiHelpers";

/**
 * Add Item Tests (SW-AI-TC01 – SW-AI-TC12)
 *
 * Covers the "Add Item" UI workflow — the trigger button on the ItemView
 * screen and the form mounted at
 * /incoming-inventory/:productName/:id/add-item(s) (ItemForm.tsx).
 *
 * Reference plan: C:\Users\99TECH\stock-wise\cypress\qa\testPlans\incomingInventory\plan.md
 * Skill rules:    cypress/qa/SKILL.md
 *
 * Important deviations from the plan (the plan was speculative on several
 * points; the implementation was inspected and the spec restricted to
 * features that actually exist — principle #7, no absence-of-errors fallacy):
 *   - The serial input is a plain <textarea name="scannerInput"> bound to
 *     React Hook Form. There is NO chip UI. Serial values are split by
 *     /[\s,]+/ at submit time inside ItemForm.tsx onSubmit (lines 562-568).
 *   - There is NO "Save & Add New" button for the item form
 *     (Frontend/src/components/common/FormFooter.tsx — that button only
 *     renders for form="category-form" / "attribute-form").
 *   - For isItem=true, on Save success the form intentionally stays mounted
 *     and the fields are reset; no automatic redirect happens
 *     (ItemForm.tsx line 451-456).
 *   - Empty submit triggers FE toast "Please scan at least one item" and
 *     no API call is made (ItemForm.tsx line 568).
 *   - Duplicate serials inside the same submit produce an inline FE warning
 *     "Duplicate serials: ..." (ItemForm.tsx line 1320-1325), not chips.
 *
 * Backend route exercised: POST /products/item (asserted via intercept; no
 * direct response-shape assertions —  those belong in an API spec).
 *
 * Test data seeding strategy (deterministic, principle #6):
 *   Every test gets its own PO + product seeded via the API
 *   (cy.task('uploadExcelToApi')). POs are deleted in after() to avoid
 *   accumulation on shared QA. Serials are timestamped per run.
 */

describe("Add Item Tests (SW-AI-TC01 – SW-AI-TC12)", { tags: ["@regression"] }, () => {
  const created = {};
  let td;
  let authToken;
  const itemViewPage = new ItemViewPage();
  const addItemPage = new AddItemPage();
  const poPage = new PurchaseOrderPage();
  const runId = `${Date.now()}`;

  const apiBase = () => Cypress.env("API_BASE_URL");
  const makePo = (tag) => `PO-AI-${tag}-${runId}`;
  const buildSerial = (key) => `${td.serials[key]}-${runId}`;

  // ── Build an Excel row for a serialized laptop ───────────────────────────
  // For serialized products the Excel import sets expectedQuantity = number of
  // rows (one per Serial Number), not the Quantity field
  // (Backend/src/modules/import/import.service.ts line 2655-2665). So to make
  // room for N Add-Item submits inside one PO, seed N rows. The Add Item form
  // then increments receivedQuantity per submit and the BE's
  // received < expected guard (product.service.ts:6212) stays satisfied.
  const buildRow = (serial) => ({
    Category: td.laptop.category,
    "Model Number": td.laptop.modelNumber,
    Brand: td.laptop.brand,
    Cost: td.laptop.cost,
    Price: td.laptop.price,
    "Support Contact": td.laptop.supportContact,
    "Serial Number": serial,
    Quantity: 1,
  });

  // ── Seed a PO with one or more disposable serialized items via the API ───
  // seedCount drives expectedQuantity on the PO. Use the default (3) for any
  // test that adds items via the UI — keeps headroom for two UI submits plus
  // any retry. Pass seedCount=1 for tests that don't submit (visibility only).
  const seedPO = (poName, seedCount = 3) => {
    const serials = Array.from({ length: seedCount }, (_, i) =>
      `SEED-${poName}-${i + 1}`
    );
    const fileName = `AddItem-seed-${poName}.xlsx`;
    createExcelFile(fileName, serials.map(buildRow));
    return cy.task("uploadExcelToApi", {
      filePath: `cypress/fixtures/${fileName}`,
      poNumber: poName,
      authToken,
      baseUrl: apiBase(),
    }).then((res) => {
      const errDetail = res.status !== 200 && res.status !== 201
        ? ` | body: ${JSON.stringify(res.body || {}).substring(0, 400)}`
        : '';
      expect(res.status, `seed upload → ${poName}${errDetail}`).to.be.oneOf([200, 201]);
      expect(res.body?.success, `seed success for ${poName}`).to.eq(true);
      cy.log(`✓ ${poName} ← ${seedCount} seed rows`);
    });
  };

  // ── before(): create the category and seed one PO per test ───────────────
  before(() => {
    cy.fixture("addItemTestData").then((data) => {
      td = data;
      cy.authSession('admin');
      cy.visit("/");
    }).then(() => {
      // Enable allowManualEntries so the "Add Item" button is visible for TC01
      // and TC03–TC12. Stage defaults this flag to false. TC02 tests the
      // gate-off state via cy.intercept so it doesn't depend on the real value.
      apiSetGeneralConfigFlags({ allowManualEntries: true });
    }).then(() => {
      cy.iaAuthToken().then((token) => {
        authToken = token;
        expect(authToken, "identity server token must exist").to.exist;
      });
    }).then(() => {
      cy.getAuthToken().then((token) => {
        cy.request({
          method: "POST",
          url: `${apiBase()}/categories`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: {
            name: td.laptop.category,
            description: "Add Item automation category",
            allowItems: true,
            allowVariants: false,
            allowVariantItems: false,
          },
          failOnStatusCode: false,
        }).then((res) =>
          cy.log(`Category '${td.laptop.category}': HTTP ${res.status}`)
        );
      });
    }).then(() => {
      // Ensure the category has a product-name template so imported products
      // are named (not "Product name not defined"). Idempotent. This spec
      // bypasses importAttributesAndCategories(), so configure it explicitly.
      ensureStandardProductNameConfigs();
    }).then(() => {
      // Mark every common attribute (categoryId=null) as required=false so the
      // Excel import and scan endpoints don't reject rows that omit optional
      // common attrs. Serial-number and asset-ID attrs are excluded. Idempotent.
      ensureCommonAttributesOptional();
    }).then(() => {
      // Allocate unique PO names + seed serials. One PO per test keeps tests
      // independent and lets the after-hook clean up via DELETE.
      created.visiblePO = makePo("Visible");
      created.configPO  = makePo("Config");
      created.routePO   = makePo("Route");
      created.singlePO  = makePo("Single");
      created.spacePO   = makePo("Space");
      created.commaPO   = makePo("Comma");
      created.emptyPO   = makePo("Empty");
      created.dupPO     = makePo("Dup");
      created.cancelPO  = makePo("Cancel");
      created.clearPO   = makePo("Clear");
      created.decPO     = makePo("Decimal");
      created.zeroPO    = makePo("Zero");

      created.singleSerial = buildSerial("epSingle");
      created.spaceA       = buildSerial("epSpaceA");
      created.spaceB       = buildSerial("epSpaceB");
      created.commaA       = buildSerial("epCommaA");
      created.commaB       = buildSerial("epCommaB");
      created.dupSerial    = buildSerial("epDuplicate");
      created.cancelSerial = buildSerial("epCancel");
      created.clearSerial  = buildSerial("epClear");

      // Seed each PO with enough rows that the Add Item submits inside this
      // test fit under expectedQuantity. seedCount=1 is fine for tests that
      // never submit (visibility/route checks); seedCount=3 covers the rest.
      return seedPO(created.visiblePO, 1)
        .then(() => seedPO(created.configPO, 1))
        .then(() => seedPO(created.routePO,  1))
        .then(() => seedPO(created.singlePO, 3))
        .then(() => seedPO(created.spacePO,  4))
        .then(() => seedPO(created.commaPO,  4))
        .then(() => seedPO(created.emptyPO,  1))
        .then(() => seedPO(created.dupPO,    1))
        .then(() => seedPO(created.cancelPO, 1))
        .then(() => seedPO(created.clearPO,  1))
        .then(() => seedPO(created.decPO,    3))
        .then(() => seedPO(created.zeroPO,   3));
    });
  });

  // ── after(): delete every test PO and restore allowManualEntries ─────────
  after(() => {
    // Restore Stage default (false) so other suites that don't seed this flag
    // see the same environment they expect.
    apiSetGeneralConfigFlags({ allowManualEntries: false });
    Object.values(created)
      .filter((v) => typeof v === "string" && v.startsWith("PO-AI-"))
      .forEach((po) => poPage.deletePurchaseOrder(po));
  });

  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE & VISIBILITY
  // ═══════════════════════════════════════════════════════════════════════════

  // Use Case — golden visibility path: a specific PO is selected, manual entry
  // is enabled by config, the Add Item button must be visible to an Admin.
  it(
    "SW-AI-TC01 — Add Item button visible on ItemView when a specific PO is selected",
    { tags: ["@smoke"] },
    () => {
      itemViewPage.navigateToProductDetails(created.visiblePO);
      itemViewPage.verifyTableHasRows(1);
      addItemPage.assertAddItemButtonVisible();
    }
  );

  // Decision Table — gate (config.allowManualEntries=false). The FE reads the
  // value from Redux (state.config.config.allowManualEntries) which is hydrated
  // by the dashboard layout's React Query against
  // GET /configs?type=general&name=general. The real shape rewritten below is
  // body.data.list[0].configJson.data.allowManualEntries (see
  // Frontend/src/layouts/dashboard/layout.tsx line 199).
  //
  // The intercept must be registered BEFORE the layout mounts (i.e. before
  // cy.visit), so we re-visit inside the test after attaching the intercept.
  it(
    "SW-AI-TC02 — Add Item button absent when allowManualEntries=false",
    () => {
      cy.intercept("GET", "**/configs**", (req) => {
        req.continue((res) => {
          const body = res.body || {};
          const list = body?.data?.data?.list || body?.data?.list;
          if (Array.isArray(list)) {
            list.forEach((c) => {
              const d = c?.configJson?.data;
              if (d && typeof d === "object") {
                d.allowManualEntries = false;
              }
            });
          }
          res.send(body);
        });
      }).as("configsOff");

      // Force the layout to re-mount so the intercepted /configs request fires.
      cy.visit("/");
      cy.wait("@configsOff", { timeout: 20000 });

      itemViewPage.navigateToProductDetails(created.configPO);
      itemViewPage.verifyTableHasRows(1);
      addItemPage.assertAddItemButtonAbsent();
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Use Case — clicking the trigger must route to the add-item form URL and
  // the form (#item-form) must mount.
  it(
    "SW-AI-TC03 — Clicking Add Item routes to /add-item(s) and renders the form",
    () => {
      itemViewPage.navigateToProductDetails(created.routePO);
      addItemPage.clickAddItem();
      cy.url().should("match", /\/incoming-inventory\/.+\/\d+\/add-item/);
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATHS
  // ═══════════════════════════════════════════════════════════════════════════

  // Use Case — golden submission: one serial, cost, price → POST 200/201,
  // toast, item exists via API.
  it(
    "SW-AI-TC04 — Single serial submits; POST 200/201; success toast; item exists via API",
    { tags: ["@smoke"] },
    () => {
      itemViewPage.navigateToProductDetails(created.singlePO);
      addItemPage.clickAddItem();
      addItemPage.interceptAddItem();
      addItemPage.typeSerials(created.singleSerial);
      addItemPage.typeCost(td.costs.epValid);
      addItemPage.typePrice(td.prices.epValid);
      addItemPage.fillRequiredAssetFields(created.singleSerial);
      addItemPage.clickSave();
      addItemPage.waitForAddItemSuccess();
      addItemPage.verifyItemCreatedViaApi(authToken, created.singleSerial);
    }
  );

  // EP — multi-value partition: space-separated serials become an array of
  // length > 1 after the /[\s,]+/ split in onSubmit. Both serials must be
  // created on the same POST.
  it(
    "SW-AI-TC05 — Two space-separated serials submit and create both items",
    () => {
      itemViewPage.navigateToProductDetails(created.spacePO);
      addItemPage.clickAddItem();
      addItemPage.interceptAddItem();
      addItemPage.typeSerials(`${created.spaceA} ${created.spaceB}`);
      addItemPage.typeCost(td.costs.epValid);
      addItemPage.fillRequiredAssetFields(created.spaceA);
      addItemPage.clickSave();
      addItemPage.waitForAddItemSuccess();
      addItemPage.verifyItemCreatedViaApi(authToken, created.spaceA);
      addItemPage.verifyItemCreatedViaApi(authToken, created.spaceB);
    }
  );

  // EP — multi-value partition with the alternate delimiter (comma). Same
  // split rule, different separator.
  it(
    "SW-AI-TC06 — Comma-separated serials submit and create both items",
    () => {
      itemViewPage.navigateToProductDetails(created.commaPO);
      addItemPage.clickAddItem();
      addItemPage.interceptAddItem();
      addItemPage.typeSerials(`${created.commaA},${created.commaB}`);
      addItemPage.typeCost(td.costs.epValid);
      addItemPage.fillRequiredAssetFields(created.commaA);
      addItemPage.clickSave();
      addItemPage.waitForAddItemSuccess();
      addItemPage.verifyItemCreatedViaApi(authToken, created.commaA);
      addItemPage.verifyItemCreatedViaApi(authToken, created.commaB);
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE / EDGE
  // ═══════════════════════════════════════════════════════════════════════════

  // BVA — lower-invalid (serial array length = 0). The FE rejects the submit
  // with a toast and no POST is fired (ItemForm.tsx line 568).
  it(
    "SW-AI-TC07 — Empty serial submit shows 'Please scan at least one item' toast and fires no POST",
    () => {
      itemViewPage.navigateToProductDetails(created.emptyPO);
      addItemPage.clickAddItem();
      addItemPage.interceptAddItem();
      addItemPage.typeCost(td.costs.epValid);
      // Every other required field must be valid, otherwise RHF blocks
      // handleSubmit and the empty-serial guard inside onSubmit — the very
      // thing under test — is never reached.
      addItemPage.fillRequiredAssetFields(`EMPTY-${runId}`);
      addItemPage.clickSave();
      addItemPage.assertErrorToast(/Please scan at least one item/i);
      cy.get("@addItemSubmit.all").should("have.length", 0);
      addItemPage.assertFormStillOpen();
    }
  );

  // Error Guessing — duplicate input inside the same submit. The FE renders
  // an inline "Duplicate serials: ..." warning under the textarea even before
  // submit (ItemForm.tsx line 1320-1325).
  it(
    "SW-AI-TC08 — Duplicate serials in the textarea show inline 'Duplicate serials' warning",
    () => {
      itemViewPage.navigateToProductDetails(created.dupPO);
      addItemPage.clickAddItem();
      addItemPage.typeSerials(`${created.dupSerial} ${created.dupSerial}`);
      addItemPage.assertDuplicateInlineWarning(created.dupSerial);
    }
  );

  // Use Case — abort path. Cancel leaves the form, must fire no POST, and
  // returns the user to ItemView for the same PO.
  it(
    "SW-AI-TC09 — Cancel returns to ItemView without firing the Add Item POST",
    () => {
      itemViewPage.navigateToProductDetails(created.cancelPO);
      addItemPage.clickAddItem();
      addItemPage.interceptAddItem();
      addItemPage.typeSerials(created.cancelSerial);
      addItemPage.typeCost(td.costs.epValid);
      addItemPage.clickCancel();
      addItemPage.assertFormClosed();
      cy.get("@addItemSubmit.all").should("have.length", 0);
    }
  );

  // Use Case — utility action. The "Clear All" button under the textarea
  // empties the field via setValue('scannerInput', '').
  it(
    "SW-AI-TC10 — 'Clear All' button empties the serial textarea",
    () => {
      itemViewPage.navigateToProductDetails(created.clearPO);
      addItemPage.clickAddItem();
      addItemPage.typeSerials(`${created.clearSerial} EXTRA-1 EXTRA-2`);
      addItemPage.clearAll();
    }
  );

  // EP — decimal-cost partition. The Input is type="number" via renderControll
  // (ItemFormHelper.tsx line 33) so decimals are accepted by the input and the
  // form submits.
  it(
    "SW-AI-TC11 — Decimal cost (e.g. 99.99) is accepted and submits successfully",
    () => {
      const serial = `${created.singleSerial}-DEC-${runId}`;
      itemViewPage.navigateToProductDetails(created.decPO);
      addItemPage.clickAddItem();
      addItemPage.interceptAddItem();
      addItemPage.typeSerials(serial);
      addItemPage.typeCost(td.costs.epDecimal);
      addItemPage.fillRequiredAssetFields(serial);
      addItemPage.clickSave();
      addItemPage.waitForAddItemSuccess();
      addItemPage.verifyItemCreatedViaApi(authToken, serial);
    }
  );

  // BVA — cost lower-valid (0). RHF rule is min: 0 inclusive
  // (ItemForm.tsx line 1196), so zero must be accepted (paired with the
  // negative-cost case which is an open question — see the test plan).
  it(
    "SW-AI-TC12 — Zero cost (BVA lower-valid) is accepted and submits successfully",
    () => {
      const serial = `${created.singleSerial}-ZERO-${runId}`;
      itemViewPage.navigateToProductDetails(created.zeroPO);
      addItemPage.clickAddItem();
      addItemPage.interceptAddItem();
      addItemPage.typeSerials(serial);
      addItemPage.typeCost(td.costs.bvaLowerValid);
      addItemPage.fillRequiredAssetFields(serial);
      addItemPage.clickSave();
      addItemPage.waitForAddItemSuccess();
      addItemPage.verifyItemCreatedViaApi(authToken, serial);
    }
  );
});
