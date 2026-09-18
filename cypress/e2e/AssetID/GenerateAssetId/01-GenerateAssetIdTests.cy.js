/**
 * Generate Asset ID — UI Tests (SW-AIDG-TC01..TC12)
 * =============================================================================
 * Screen:   /asset-id  (Frontend/src/pages/AssetId.tsx)
 * API twin: cypress/e2e/AssetID/GenerateAssetId/GenerateAssetIdAPI.cy.js
 * Plan:     cypress/qa/testPlans/assetId/sub/generate-asset-id-plan.md
 *
 * -----------------------------------------------------------------------------
 *   What is deliberately NOT here
 * -----------------------------------------------------------------------------
 *   The backend validation ladder (reserved PO buckets, allowItems, product ∈
 *   category, unknown ids, the 200-label ceiling as the SERVER enforces it) is
 *   covered deterministically in the API twin — ISTQB principle #3, shift left.
 *   This spec owns only what a browser can prove: what the user can see, what
 *   the form lets them do, and that a real click produces a real inventory
 *   effect.
 *
 * -----------------------------------------------------------------------------
 *   Why assertions anchor on the intercepted response, not on the toast
 * -----------------------------------------------------------------------------
 *   "Generate & Print" creates the items and THEN hands the ZPL to PrintWise.
 *   On an environment with no printer configured that second step fails and the
 *   user sees "Items are created, but label printing failed…" — a *different*
 *   toast from the happy one, for a run in which the items were created
 *   perfectly. Asserting on the toast would make this suite a printer test.
 *   So the generate TCs wait on POST /products/asset-id/generate-from-po and
 *   then re-read the created items through the API.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/AssetID/assetIdData.json';
import GenerateAssetIdPage from '../../../pageObjects/AssetID/GenerateAssetIdPage';
import { apiDeletePO, apiResolveCategoryIdByName } from '../../../support/helpers/poCloseHelpers';
import {
  createContainerTypeViaApi,
  deleteContainerTypeViaApi,
  deleteContainerViaApi,
  disposableTypeName,
  emptyContainerViaApi,
} from '../../../support/helpers/wmsContainerHelpers';
import {
  createContainerWithCapacity,
  getContainerSerials,
} from '../../../support/helpers/containerLocationHelpers';
import {
  aidData,
  assetIdsOf,
  readItemStatus,
  readPoQuantities,
  seedAssetIdPo,
} from '../../../support/helpers/assetIdHelpers';

describe('Generate Asset ID — UI', { tags: ['@regression'] }, () => {
  const page = new GenerateAssetIdPage();

  const stamp = `AIDGU-${Date.now()}`;
  const poNumber = `PO-AIDGU-${Date.now()}`;
  const seedSerial = `SN-AIDGU-${Date.now()}`;

  let laptopProductId;
  let laptopProductName;
  let containerTypeId;
  let container;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    seedAssetIdPo({ td, poNumber, stamp, serials: [seedSerial] })
      .then((seed) => {
        laptopProductId = seed.laptopProductId;
        // The Product autocomplete labels options with the CATEGORY'S product
        // naming template, not with the Excel columns — so the visible option
        // text has to be read back from the same endpoint the dropdown uses
        // rather than guessed from the fixture. Falls back to the service's own
        // "Product #<id>" default when no template is configured.
        return apiResolveCategoryIdByName(td.categories.laptop);
      })
      .then((categoryId) =>
        cy
          .getAuthToken()
          .then((token) =>
            cy.request({
              method: 'GET',
              url: `${Cypress.env('API_BASE_URL')}/products/asset-id/category/${categoryId}/products?poNumber=${encodeURIComponent(poNumber)}`,
              headers: { Authorization: `Bearer ${token}` },
              failOnStatusCode: false,
            }),
          )
          .then((res) => {
            const match = (res.body?.data?.products || []).find(
              (p) => Number(p.id) === Number(laptopProductId),
            );
            expect(match, 'seeding: the seeded product must be offered by the Product dropdown').to.exist;
            laptopProductName = match.name;
          }),
      );
    createContainerTypeViaApi(disposableTypeName('AidguType'))
      .then((type) => {
        containerTypeId = type?.id;
        return createContainerWithCapacity(containerTypeId, data.container.maxItemsRoomy);
      })
      .then((c) => {
        container = c;
      });
  });

  beforeEach(() => {
    cy.authSession('admin');
    page.visit();
  });

  after(() => {
    if (container?.id) emptyContainerViaApi(container.id).then(() => deleteContainerViaApi(container.id));
    if (containerTypeId) deleteContainerTypeViaApi(containerTypeId);
    apiDeletePO(poNumber);
  });

  // ── Rendering & navigation ──────────────────────────────────────────────

  // Use case — the screen is reachable and complete
  it('SW-AIDG-TC01: the screen renders every control the flow needs', { tags: ['@smoke'] }, () => {
    page.assertOnPage().assertFormControlsVisible();
    page.assertPreviewAbsent();
    page.assertReprintAbsent();
  });

  // Use case — the documented navigation path, not just the deep link
  it('SW-AIDG-TC02: the sidebar Asset Id group reaches Generate Asset ID', { tags: ['@regression'] }, () => {
    cy.visit('/');
    page.navigateViaSidebar().assertOnPage();
  });

  // ── The category gate (decision table on category.allowItems) ───────────

  // Decision table — allowItems true vs false decides what the dropdown offers
  it('SW-AIDG-TC03: only categories that allow items are offered', { tags: ['@regression'] }, () => {
    page.readCategoryOptions().then((options) => {
      expect(
        options,
        'the serialized category must be offered — asset IDs identify individual items',
      ).to.include(td.categories.laptop);
      expect(
        options,
        'the quantity-only category must NOT be offered — it cannot hold serialized items at all',
      ).to.not.include(td.categories.ram);
    });
    page.closeListbox();
  });

  // Decision table — the product list is a function of the chosen category
  it('SW-AIDG-TC04: the Product field stays disabled until a category is chosen', { tags: ['@regression'] }, () => {
    page.assertProductFieldDisabled();
    page.selectCategory(td.categories.laptop);
    page.assertProductFieldEnabled();
  });

  // ── The action gate (decision table on the three required selections) ───

  // Decision table — Preview/Generate require PO ∧ category ∧ product
  it('SW-AIDG-TC05: Preview and Generate unlock only once PO, category and product are all chosen', { tags: ['@regression'] }, () => {
    page.assertPreviewDisabled().assertGenerateDisabled();

    page.selectPo(poNumber);
    page.assertGenerateDisabled();

    page.selectCategory(td.categories.laptop);
    page.assertGenerateDisabled();

    page.selectProduct(laptopProductName);
    page.assertPreviewEnabled();
    page.assertGenerateEnabled();
  });

  // ── Preview ─────────────────────────────────────────────────────────────

  // Use case — the dry run a worker does before committing a print
  it('SW-AIDG-TC06: Preview renders one label card per requested quantity', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.epTypical;
    page
      .selectPo(poNumber)
      .selectCategory(td.categories.laptop)
      .selectProduct(laptopProductName)
      .setLabelQuantity(quantity)
      .clickPreview();

    cy.wait('@aidPreview').then(({ response }) => {
      const previewed = (response?.body?.data?.previewItems || []).map((i) => i.assetId);
      expect(previewed, 'the preview call must return the requested number of asset IDs').to.have.length(quantity);
      page.assertToast(data.ui.toasts.previewReady);
      page.assertPreviewCardCount(quantity);
      // Each card is keyed by the asset ID it shows, so this proves the screen
      // renders the SERVER's ids rather than a locally invented placeholder.
      previewed.forEach((assetId) => page.assertPreviewShowsAssetId(assetId));
    });
  });

  // BVA — lower boundary, blocked in the browser before any request
  it('SW-AIDG-TC07: a label quantity of 0 is refused client-side with no request', { tags: ['@regression'] }, () => {
    page
      .selectPo(poNumber)
      .selectCategory(td.categories.laptop)
      .selectProduct(laptopProductName)
      .setLabelQuantity(data.labelQuantity.bvaLowerInvalid)
      .clickPreview();

    page.assertToast(data.ui.toasts.invalidQuantity);
    page.assertNoRequestFired('aidPreview');
    page.assertPreviewAbsent();
  });

  // BVA — upper boundary, just outside; blocked before the mutation is sent
  it('SW-AIDG-TC08: a label quantity of 201 is refused client-side with no request', { tags: ['@regression'] }, () => {
    page
      .selectPo(poNumber)
      .selectCategory(td.categories.laptop)
      .selectProduct(laptopProductName)
      .setLabelQuantity(data.labelQuantity.bvaUpperInvalid)
      .clickGenerate();

    page.assertToast(data.ui.toasts.quantityOverMax);
    page.assertNoRequestFired('aidGenerate');
  });

  // State transition — changing the PO invalidates everything downstream of it
  it('SW-AIDG-TC09: changing the PO clears the product selection and the preview', { tags: ['@regression'] }, () => {
    page
      .selectPo(poNumber)
      .selectCategory(td.categories.laptop)
      .selectProduct(laptopProductName)
      .setLabelQuantity(data.labelQuantity.bvaLowerValid)
      .clickPreview();
    cy.wait('@aidPreview');
    page.assertPreviewCardCount(data.labelQuantity.bvaLowerValid);

    page.clearPo();
    page.assertPreviewAbsent();
    page.assertGenerateDisabled();
  });

  // ── Generate — the real mutation, driven through the browser ────────────

  // Use case — the main flow, end to end, with an inventory oracle
  it('SW-AIDG-TC10: Generate & Print creates Available items and raises available stock', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.bvaLowerValidPlusOne;
    let before;
    let created;

    readPoQuantities(poNumber, laptopProductId).then((snapshot) => {
      before = snapshot;
      page
        .selectPo(poNumber)
        .selectCategory(td.categories.laptop)
        .selectProduct(laptopProductName)
        .setLabelQuantity(quantity)
        .clickGenerate();

      cy.wait('@aidGenerate', { timeout: 60000 }).then(({ response }) => {
        expect(response?.statusCode, 'the browser-driven generate must reach the server').to.be.oneOf([200, 201]);
        created = (response?.body?.data?.createdItems || []).map((i) => i.assetId);
        expect(created, 'one item per requested label').to.have.length(quantity);
      });

      cy.then(() => readItemStatus(created[0])).then((status) => {
        expect(status, 'an item created from the screen is immediately on-hand stock').to.equal(
          data.statuses.available,
        );
      });

      cy.then(() => readPoQuantities(poNumber, laptopProductId)).then((after) => {
        expect(
          after.availableQuantity - before.availableQuantity,
          'a UI-driven generate must move the ledger exactly as the API-driven one does',
        ).to.equal(quantity);
      });
    });
  });

  // State transition — the reprint affordance appears only after a print
  it('SW-AIDG-TC11: Reprint Last Labels appears only after a successful generate', { tags: ['@regression'] }, () => {
    page.assertReprintAbsent();
    page
      .selectPo(poNumber)
      .selectCategory(td.categories.laptop)
      .selectProduct(laptopProductName)
      .setLabelQuantity(data.labelQuantity.bvaLowerValid)
      .clickGenerate();
    cy.wait('@aidGenerate', { timeout: 60000 }).then(({ response }) => {
      expect(response?.statusCode, 'the generate must succeed for the reprint state to be meaningful').to.be.oneOf([
        200, 201,
      ]);
    });
    // Present regardless of whether the PrintWise hand-off succeeded — the
    // button is driven by lastGeneratedItems, which the create response fills.
    page.assertReprintVisible();
  });

  // Use case — generate straight into a container, from the screen
  it('SW-AIDG-TC12: items generated with a container selected land in that container', { tags: ['@regression'] }, function () {
    if (!container?.code) this.skip();
    let created;
    page
      .selectPo(poNumber)
      .selectCategory(td.categories.laptop)
      .selectProduct(laptopProductName)
      .setLabelQuantity(data.labelQuantity.bvaLowerValid)
      .scanContainerOrLocation(container.code);

    page.assertScannedTargetShown(container.code);
    page.clickGenerate();

    cy.wait('@aidGenerate', { timeout: 60000 }).then(({ response }) => {
      expect(response?.statusCode).to.be.oneOf([200, 201]);
      expect(aidData(response).containerAssigned, 'the server must confirm the assignment').to.be.true;
      created = assetIdsOf(response);
    });

    cy.then(() => getContainerSerials(container.id)).then((serials) => {
      created.forEach((assetId) => {
        expect(serials, `${assetId} must physically be in container ${container.code}`).to.include(assetId);
      });
    });
  });
});
