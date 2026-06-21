/**
 * InventoryCustomizeColumnsTests.cy.js
 * ============================================================
 * Spec: Inventory → Customize Columns dialog (/inventory)
 * Page Object: InventoryCustomizeColumnsPage.js
 *
 * Opened from the header kebab → "Customize Columns" (inventoryActionMenue.tsx:147).
 * Toggles per-category column visibility; persists to /configs
 * (type=inventoryCategoryFilter). The save WRITE is STUBBED so the shared per-user
 * column config is NOT mutated (InventoryGroupBy and other specs read it); we assert
 * the request shape (configJson.columns) and the real per-category GET.
 *
 * Coverage:
 *   - CC-TC01..04 assert the dialog, per-category config GET, save-payload shape,
 *     and cancel-safety WITHOUT mutating shared state (writes stubbed).
 *   - CC-TC05 asserts the picker lists columns from BOTH automation categories
 *     plus the common group (it is a global attribute picker, not category-scoped).
 *   - CC-TC06 drives the real select/unselect → save → reload round-trip and
 *     asserts the toggled column appears/disappears on the Inventory grid. The grid
 *     renders one header per saved configJson.columns entry (ItemList.tsx:770) and
 *     the GET resolves the row by `name LIKE %category%`, so a saved toggle is
 *     observable. Config writes flush the whole CONFIG LIST cache
 *     (cache.service.ts:303), so a reload reflects the change. The original config
 *     is captured in before() and restored in after() so no shared state leaks.
 *
 */

import InventoryCustomizeColumnsPage from '../../pageObjects/Inventory/InventoryCustomizeColumnsPage';
import data from '../../fixtures/Inventory/customizeColumnsData.json';
import td from '../../fixtures/exportTestData.json';
import urls from '../../fixtures/urls.json';
import { seedProductOnlyPO, deletePO } from '../../support/helpers/exportSeedingHelpers';
import { importAttributesAndCategories, ensureCommonAttributesOptional }
  from '../../support/helpers/attributeHelpers';

const suiteStamp = `CC-${Date.now()}`;
const ramPo = `PO-CC-${suiteStamp}`;
let ramCatId; // resolved in before() so the category is selected deterministically via ?categoryId=
let ccUserId; // owner of the per-user column config (for capture/restore)
let ccOriginal; // { id, columns } | null — the RAM-category column config before CC-TC06 mutates it

// The per-category column config row. GET matches name LIKE %name%, so the saved
// row (name = "inventoryCategoryFilter" + category) is resolved by name=category.
const ccConfigParams = (category) => ({ type: 'inventoryCategoryFilter', name: category, userId: ccUserId });

function apiGetCcConfig(category) {
  return cy.getAuthToken().then((token) =>
    cy.request({
      method: 'GET',
      url: `${Cypress.env('API_BASE_URL')}/configs`,
      qs: ccConfigParams(category),
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    }).then((res) => (res.body?.data?.list || res.body?.data || [])[0] || null)
  );
}

describe('Inventory Customize Columns', { tags: ['@regression'] }, () => {
  const cc = new InventoryCustomizeColumnsPage();

  before(() => {
    cy.adminSession();
    cy.visit(urls.dashboard);
    importAttributesAndCategories();
    ensureCommonAttributesOptional();
    // A RAM product so the selected category renders a populated table + columns.
    seedProductOnlyPO({ td, poNumber: ramPo, stamp: suiteStamp, quantity: 5 });
    // Resolve the RAM category id so we can deep-link /inventory?categoryId= (the
    // in-page category filter moved to the nav drawer; URL param is deterministic).
    cy.getAuthToken().then((token) =>
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/categories?page=1&page_size=200`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        const list = res.body?.data?.list || res.body?.data || res.body?.list || [];
        const cat = list.find((c) => c.name === data.category);
        expect(cat, `category "${data.category}" exists`).to.exist;
        ramCatId = cat.id;
      })
    );
    // Capture the current per-user column config so CC-TC06 can restore it in after().
    cy.window().then((win) => {
      const ls = JSON.parse(win.localStorage.getItem('stock-wise') || '{}');
      ccUserId = String(ls?.App?.user?.userId ?? '');
    });
    cy.then(() => {
      if (!ccUserId) return;
      apiGetCcConfig(data.category).then((row) => {
        ccOriginal = row ? { id: row.id, columns: [...(row.configJson?.columns || [])] } : null;
      });
    });
  });

  after(() => {
    cy.then(() => deletePO(ramPo));
    // Restore the column config CC-TC06 mutated: PATCH the original columns back, or
    // DELETE the row if none existed before, so other Inventory specs see no drift.
    cy.then(() => {
      if (!ccUserId) return;
      apiGetCcConfig(data.category).then((row) => {
        if (!row) return;
        cy.getAuthToken().then((token) => {
          if (ccOriginal) {
            cy.request({
              method: 'PATCH',
              url: `${Cypress.env('API_BASE_URL')}/configs/${row.id}`,
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: { type: 'inventoryCategoryFilter', configJson: { columns: ccOriginal.columns } },
              failOnStatusCode: false,
            });
          } else {
            cy.request({
              method: 'DELETE',
              url: `${Cypress.env('API_BASE_URL')}/configs/${row.id}`,
              headers: { Authorization: `Bearer ${token}` },
              failOnStatusCode: false,
            });
          }
        });
      });
    });
  });

  beforeEach(() => {
    cy.adminSession();
    cy.visit(`/inventory?categoryId=${ramCatId}`);
    cy.get('[role="progressbar"]', { timeout: 30000 }).should('not.exist');
  });

  // Use Case — dialog opens from the header menu and lists the category's columns.
  it('SW-INV-CC-TC01 — Customize Columns opens and lists the category columns', { tags: ['@smoke'] }, () => {
    cc.openDialog();
    cc.assertColumnListed(data.toggleColumn);
    cc.assertColumnListed(data.anchorColumn);
  });

  // Use Case — a selected column is persisted in the saved configJson on Save.
  it('SW-INV-CC-TC02 — a visible column is included in the saved config', { tags: ['@smoke'] }, () => {
    cc.interceptSave();
    cc.openDialog();
    cc.assertColumnChip(data.toggleColumn); // present in the category's selected columns
    cc.save();
    cc.assertSaveToast();
    cc.getSaveRequest().then((req) => {
      const cols = (req.body.configJson?.columns || []).map((c) => String(c).toLowerCase());
      expect(cols, `columns should include ${data.toggleColumn}`).to.include(data.toggleColumn.toLowerCase());
    });
  });

  // Decision Table — per-category scoping: the config fetch is keyed by the
  // selected category name (one category's columns are independent of another's).
  it('SW-INV-CC-TC03 — the column config is fetched per selected category', () => {
    cc.interceptConfigGet();
    cc.openDialog();
    cc.assertColumnListed(data.toggleColumn);
    cy.get('@ccGet.all').then((calls) => {
      const ccCall = calls.find((c) => c.request.query?.type === 'inventoryCategoryFilter');
      expect(ccCall, 'a per-category inventoryCategoryFilter config GET fired').to.exist;
      expect(String(ccCall.request.query.name)).to.contain(data.category);
    });
  });

  // Error Guessing — making a change then closing without Save fires no config write.
  it('SW-INV-CC-TC04 — closing without saving fires no config write', () => {
    cc.interceptSave();
    cc.openDialog();
    cc.removeColumnChip(data.toggleColumn); // a change the user then abandons
    cc.cancelViaClose();
    cc.assertDialogClosed();
    cy.get('@ccPost.all').should('have.length', 0);
    cy.get('@ccPatch.all').should('have.length', 0);
  });

  // EP / Decision Table — the picker is a GLOBAL attribute list grouped by category:
  // columns from BOTH automation categories AND the common group must all be listed,
  // independent of the currently-selected category.
  it('SW-INV-CC-TC05 — the picker lists columns from both categories and the common group', { tags: ['@smoke'] }, () => {
    cc.openDialog();
    // Group headers for each category + the common bucket.
    cc.assertGroupListed(data.commonGroup);
    cc.assertGroupListed(data.ramGroup);
    cc.assertGroupListed(data.laptopGroup);
    // A representative column from each group.
    cc.assertColumnListed(data.commonColumn); // common (categoryId = null)
    cc.assertColumnListed(data.ramColumn); // RAM-category product attribute
    cc.assertColumnListed(data.laptopColumn); // Laptop-category product attribute
  });

  // State Transition (results integrity) — unselect → save → the column disappears
  // from the Inventory grid; re-select → save → it reappears. Real round-trip; the
  // original config is restored in after(). Baseline: the column is shown (CC-TC02
  // confirms it is a selected column for this category).
  it('SW-INV-CC-TC06 — unselecting a column hides it on the grid; re-selecting shows it again', () => {
    // Baseline — the toggle column is currently a grid header.
    cc.assertGridColumnVisible(data.toggleColumn);

    // Unselect → save (real write) → reload → column gone, anchor remains.
    cc.openDialog();
    cc.removeColumnChip(data.toggleColumn);
    cc.save();
    cc.assertSaveToast();
    cy.reload();
    cc.assertGridColumnHidden(data.toggleColumn, data.anchorColumn);

    // Re-select → save → reload → column back.
    cc.openDialog();
    cc.selectColumnByLabel(data.toggleColumn);
    cc.save();
    cc.assertSaveToast();
    cy.reload();
    cc.assertGridColumnVisible(data.toggleColumn);
  });
});
