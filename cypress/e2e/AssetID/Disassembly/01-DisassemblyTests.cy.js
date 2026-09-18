/**
 * Asset ID → Disassembly — UI Tests (SW-AIDD-TC01..TC11)
 * =============================================================================
 * Screen:   /asset-id/disassembly  (Frontend/src/pages/AssetIdDisassembly.tsx)
 * API twin: cypress/e2e/AssetID/Disassembly/DisassemblyAPI.cy.js
 * Plan:     cypress/qa/testPlans/assetId/sub/disassembly-plan.md
 *
 * -----------------------------------------------------------------------------
 *   Scope split
 * -----------------------------------------------------------------------------
 *   The backend ladder (PO inheritance, zero-cost children, the quantities
 *   write, the two location-payload guards, allowItems, product ∈ category) is
 *   proven deterministically in the API twin — principle #3, shift left. This
 *   spec owns the parts only a browser can prove: the scan → select → configure
 *   → print sequence, the status gate the user actually sees, the three-table
 *   layout staying consistent, and the confirmation dialog that protects a
 *   completed print run.
 *
 * -----------------------------------------------------------------------------
 *   Scoping rule this spec is built around
 * -----------------------------------------------------------------------------
 *   THREE tables coexist on this screen (Found Items / Previously Generated
 *   Labels / Assembled Items). Every table assertion goes through
 *   DisassemblyPage, which scopes to the owning card. An unscoped
 *   `cy.contains('td', …)` here would match whichever card rendered first and
 *   assert against the wrong dataset — the same trap project gotcha #22
 *   documents for the Inventory quick-view panel.
 */

import td from '../../../fixtures/PurchaseOrder/poCloseData.json';
import data from '../../../fixtures/AssetID/assetIdData.json';
import DisassemblyPage from '../../../pageObjects/AssetID/DisassemblyPage';
import { apiDeletePO, apiResolveCategoryIdByName } from '../../../support/helpers/poCloseHelpers';
import {
  aidMarkStatus,
  readItemStatus,
  readPoQuantities,
  seedAssetIdPo,
  seedDisassemblyChildren,
} from '../../../support/helpers/assetIdHelpers';

describe('Asset ID Disassembly — UI', { tags: ['@regression'] }, () => {
  const page = new DisassemblyPage();

  const stamp = `AIDDU-${Date.now()}`;
  const childStamp = `AIDDUC-${Date.now()}`;
  const parentPo = `PO-AIDDU-${Date.now()}`;
  const childPo = `PO-AIDDUC-${Date.now()}`;

  // Run stamp BEFORE the role letter so the prefix these share is run-unique —
  // TC05 scans that prefix, and with `SN-AIDDU-P-<ts>` the shared part was the
  // bare `SN-AIDDU-`, matching every leftover serial from every previous run.
  const serialPrefix = `SN-AIDDU-${Date.now()}-`;
  const parentSerial = `${serialPrefix}P`;
  const siblingSerial = `${serialPrefix}S`;
  const blockedSerial = `${serialPrefix}B`;

  let laptopCategoryId;
  let childProductId;
  let childProductName;

  before(() => {
    cy.authSession('admin');
    cy.visit('/');
    apiResolveCategoryIdByName(td.categories.laptop).then((id) => {
      laptopCategoryId = id;
    });

    // parentPo carries the machine (plus a sibling for the multi-row table TC
    // and a Damaged one for the status gate); childPo carries the DIFFERENT
    // product the machine is disassembled into, exactly as in the API twin.
    seedAssetIdPo({
      td,
      poNumber: parentPo,
      stamp,
      serials: [parentSerial, siblingSerial, blockedSerial],
    })
      .then(() =>
        seedAssetIdPo({ td, poNumber: childPo, stamp: childStamp, serials: [`SN-AIDDUC-${Date.now()}`] }),
      )
      .then((seed) => {
        childProductId = seed.laptopProductId;
        return aidMarkStatus({
          poNumber: parentPo,
          serialNumbers: [blockedSerial],
          status: data.statuses.damaged,
          damageReason: 'Asset ID automation — status gate fixture',
        });
      })
      .then(() =>
        // The Product dropdown labels options with the category's naming
        // template, so the visible text is read back from the very endpoint
        // that fills the dropdown rather than guessed from the fixture.
        cy.getAuthToken().then((token) =>
          cy
            .request({
              method: 'GET',
              url: `${Cypress.env('API_BASE_URL')}/products/asset-id/disassembly/category/${laptopCategoryId}/products`,
              headers: { Authorization: `Bearer ${token}` },
              failOnStatusCode: false,
            })
            .then((res) => {
              const match = (res.body?.data?.products || []).find(
                (p) => Number(p.id) === Number(childProductId),
              );
              expect(match, 'seeding: the child product must be offered as a disassembly target').to.exist;
              childProductName = match.name;
            }),
        ),
      );
  });

  beforeEach(() => {
    cy.authSession('admin');
    page.visit();
  });

  after(() => {
    apiDeletePO(parentPo);
    apiDeletePO(childPo);
  });

  // ── Landing state ───────────────────────────────────────────────────────

  // Use case — the screen starts inert until something is scanned
  it('SW-AIDD-TC01: the screen opens with an empty found-items table and the actions locked', { tags: ['@smoke'] }, () => {
    page.assertFoundItemsEmptyState();
    page.assertPreviewDisabled();
    page.assertPrintLabelsDisabled();
    page.assertPreviewAbsent();
  });

  // EP — invalid partition (empty scan input), blocked before any request
  it('SW-AIDD-TC02: scanning with an empty serial is refused client-side with no request', { tags: ['@regression'] }, () => {
    page.scanSerial('');
    page.assertToast(data.ui.toasts.enterSerial);
    cy.get('@aidScan.all').should('have.length', 0);
    page.assertFoundItemsEmptyState();
  });

  // EP — invalid partition (a serial that exists nowhere)
  it('SW-AIDD-TC03: scanning an unknown serial surfaces an error and leaves the table empty', { tags: ['@regression'] }, () => {
    page.scanSerial(data.serialNumber.epUnknown);
    cy.wait('@aidScan');
    page.assertToast(data.ui.toasts.noItemsFoundPrefix);
    page.assertFoundItemsEmptyState();
  });

  // ── Scan → select ───────────────────────────────────────────────────────

  // Use case — main flow step 1: scan and see the machine
  it('SW-AIDD-TC04: scanning a known serial loads it with its status and asset ID', { tags: ['@smoke'] }, () => {
    page.scanSerial(parentSerial);
    cy.wait('@aidScan');
    page.assertParentSerial(parentSerial);
    page.assertFoundItemRow(parentSerial);
    page.assertFoundItemStatus(parentSerial, data.statuses.available);
    page.assertSummary({ selectedItem: parentSerial });
  });

  // Error guessing — a partial scan matches several serials, which is why the
  // screen renders a radio list instead of auto-selecting
  it('SW-AIDD-TC05: a partial serial lists every match and lets the user pick one', { tags: ['@regression'] }, () => {
    page.scanSerial(serialPrefix);
    cy.wait('@aidScan');
    page.assertFoundItemRow(parentSerial);
    page.assertFoundItemRow(siblingSerial);

    page.selectFoundItem(siblingSerial);
    page.assertSummary({ selectedItem: siblingSerial });
  });

  // Decision table — selected item status Available vs not
  it('SW-AIDD-TC06: selecting a non-Available item blocks the actions and explains why', { tags: ['@regression'] }, () => {
    page.scanSerial(blockedSerial);
    cy.wait('@aidScan');
    page.assertFoundItemStatus(blockedSerial, data.statuses.damaged);
    page.assertStatusBlockAlert(data.statuses.damaged);
    page.assertPreviewDisabled();
    page.assertPrintLabelsDisabled();
  });

  // ── Configure → preview ─────────────────────────────────────────────────

  // Decision table — the actions need a selected item ∧ category ∧ product
  it('SW-AIDD-TC07: Preview and Print unlock only once a category and product are chosen', { tags: ['@regression'] }, () => {
    page.scanSerial(parentSerial);
    cy.wait('@aidScan');
    page.assertPrintLabelsDisabled();

    page.selectCategory(td.categories.laptop);
    cy.wait('@aidDisCatProducts');
    page.assertPrintLabelsDisabled();

    page.selectProduct(childProductName);
    page.assertPreviewEnabled();
    page.assertPrintLabelsEnabled();
    page.assertSummary({
      selectedItem: parentSerial,
      category: td.categories.laptop,
      product: childProductName,
    });
  });

  // Use case — the dry run before a print
  it('SW-AIDD-TC08: Preview renders one label card per requested quantity', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.epTypical;
    page.scanSerial(parentSerial);
    cy.wait('@aidScan');
    page.selectCategory(td.categories.laptop);
    cy.wait('@aidDisCatProducts');
    page.selectProduct(childProductName);
    page.setLabelQuantity(quantity);
    page.clickPreview();

    cy.wait('@aidDisPreview').then(({ response }) => {
      const previewed = (response?.body?.data?.previewItems || []).map((i) => i.assetId);
      expect(previewed, 'the preview call must return the requested number of asset IDs').to.have.length(quantity);
      page.assertPreviewCardCount(quantity);
      previewed.forEach((assetId) => page.assertPreviewShowsAssetId(assetId));
    });
  });

  // BVA — upper boundary, just outside; blocked before the mutation is sent
  it('SW-AIDD-TC09: a label quantity of 201 is refused client-side with no request', { tags: ['@regression'] }, () => {
    page.scanSerial(parentSerial);
    cy.wait('@aidScan');
    page.selectCategory(td.categories.laptop);
    cy.wait('@aidDisCatProducts');
    page.selectProduct(childProductName);
    page.setLabelQuantity(data.labelQuantity.bvaUpperInvalid);
    page.clickPrintLabels();

    page.assertToast(data.ui.toasts.quantityOverMax);
    cy.get('@aidDisCreate.all').should('have.length', 0);
  });

  // ── Print — the real mutation, driven through the browser ───────────────

  // Use case — the main flow end to end, with an inventory oracle. Also proves
  // the newly created children immediately populate the "Previously Generated
  // Labels" card, which is the screen's own record of what it just did.
  it('SW-AIDD-TC10: Print Labels creates Available children, raises stock and lists them on the screen', { tags: ['@smoke'] }, () => {
    const quantity = data.labelQuantity.bvaLowerValidPlusOne;
    let before;
    let created;

    readPoQuantities(parentPo, childProductId).then((snapshot) => {
      before = snapshot;

      page.scanSerial(parentSerial);
      cy.wait('@aidScan');
      page.selectCategory(td.categories.laptop);
      cy.wait('@aidDisCatProducts');
      page.selectProduct(childProductName);
      page.setLabelQuantity(quantity);
      page.clickPrintLabels();

      cy.wait('@aidDisCreate', { timeout: 60000 }).then(({ response }) => {
        expect(response?.statusCode, 'the browser-driven disassembly must reach the server').to.be.oneOf([200, 201]);
        created = (response?.body?.data?.createdItems || []).map((i) => i.assetId);
        expect(created, 'one child per requested label').to.have.length(quantity);
      });

      cy.then(() => readItemStatus(created[0])).then((status) => {
        expect(status, 'a child extracted from the screen is immediately on-hand stock').to.equal(
          data.statuses.available,
        );
      });

      cy.then(() => readPoQuantities(parentPo, childProductId)).then((after) => {
        expect(
          after.availableQuantity - before.availableQuantity,
          'a UI-driven disassembly must move the ledger exactly as the API-driven one does',
        ).to.equal(quantity);
      });

      // The screen must be able to show what it just produced. Asserted after
      // an explicit RE-SCAN rather than on the auto-refresh, because
      // handlePrintLabels only calls fetchExistingLabels AFTER `await printZpl`
      // succeeds — on an environment with no PrintWise printer the create
      // succeeds, the print throws, and the panel is never refreshed. That is a
      // real (minor) defect recorded in
      // cypress/qa/testPlans/assetId/pending.md; pinning the auto-refresh here
      // would turn this into a printer-availability test instead of a
      // disassembly test.
      //
      // Braces, not a concise arrow: a cy.then() callback that QUEUES commands
      // must not also RETURN a value, or Cypress aborts with "mixing up async
      // and sync code". Page-object methods return `this` for chaining, so the
      // return has to be swallowed here.
      cy.then(() => {
        page.scanSerial(parentSerial);
      });
      cy.wait('@aidScan');
      cy.then(() => {
        page.assertGeneratedLabelRow(created[0]);
      });
    });
  });

  // Use case — the screen's own history panels, for a serial seeded outside it
  it('SW-AIDD-TC11: previously generated labels are listed when the parent is re-scanned', { tags: ['@regression'] }, () => {
    let childAssetId;
    seedDisassemblyChildren({
      parentSerialNumber: siblingSerial,
      selectedItemSerialNumber: siblingSerial,
      categoryId: laptopCategoryId,
      productId: childProductId,
      quantity: data.labelQuantity.bvaLowerValid,
    }).then((ids) => {
      [childAssetId] = ids;
      page.scanSerial(siblingSerial);
      cy.wait('@aidScan');
      page.assertGeneratedLabelRow(childAssetId);
      // Disassembly only creates children FROM a serial; nothing has been
      // assembled INTO it, so the sibling panel must stay empty.
      page.assertAssembledItemsEmptyState();
    });
  });
});
