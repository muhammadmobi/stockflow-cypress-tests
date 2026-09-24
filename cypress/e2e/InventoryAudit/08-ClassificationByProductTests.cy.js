// cypress/e2e/InventoryAudit/08-ClassificationByProductTests.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/sub/classification-plan.md
//            (§9.1 — TC14–TC28)
// Component:  Frontend/src/components/ABC/ByProductTab.tsx
// API mirror: cypress/e2e/api/AbcClassificationAPI.cy.js (SW-IACLS-API-TC11..TC29)
//
// This spec owns the By-Product grid: its columns, the effective-class + source
// chips, the per-row override control (which — unlike the category control — offers
// an inherit option), search, the three filters, row selection and the bulk bar.
//
// The four-rung source matrix is stubbed because no live page can be guaranteed to
// hold one product per rung at once — in particular an `Auto` row requires the
// nightly job to have run (plan §8 risk 4). The two live mutations capture the
// product's override and restore it.

import ClassificationPage from '../../pageObjects/InventoryAudit/classificationPage';
import {
  captureProduct,
  otherClass,
  productRows,
  restoreProduct,
  stubBulk,
  stubCategories,
  stubOverrideClear,
  stubOverrideSave,
  stubProducts,
  stubSummary,
} from '../../support/InventoryAudit/classificationHelpers';
import data from '../../fixtures/InventoryAudit/classification.json';

describe('Inventory Audit — Classification: By Product', { tags: ['@regression'] }, () => {
  const page = new ClassificationPage();
  const prods = data.productRows;
  const cats = data.categoryRows;

  let adminJwt;
  // Captured in before(), i.e. BEFORE anything can mutate it. Capturing in after()
  // would read post-run state and write it straight back — a no-op that only looks
  // like a safety net.
  let capturedProduct;

  /** Land on the By-Product tab with a known page of rows. */
  const openProductTab = (rows, count) => {
    stubCategories([cats.dtNoOverrides, cats.dtSomeOverrides, cats.epThirdCategory], 'abcCategories');
    stubSummary(data.summary.epBalanced, 'abcSummary');
    stubProducts(rows, count, 'abcProducts');
    page.visitAndWait('abcCategories');
    page.openTab('By Product');
    cy.wait('@abcProducts');
    return page;
  };

  before(() => {
    cy.login().then((t) => {
      adminJwt = t;
      return captureProduct(adminJwt);
    }).then((p) => {
      capturedProduct = p;
    });
  });

  beforeEach(() => {
    cy.authSession('admin');
  });

  // ==========================================================================
  // The grid
  // ==========================================================================

  // EP — the column contract
  it('SW-IACLS-TC14: the product grid shows its five columns', { tags: ['@smoke'] }, () => {
    openProductTab([prods.dtInherited]);
    page.assertProductColumns();
  });

  // Decision table — the cell pairs a class with the rung that produced it
  it('SW-IACLS-TC15: the effective-class cell pairs a class with its source', () => {
    openProductTab([prods.dtOverridden]);
    page.assertProductCell(0, 'Effective class', prods.dtOverridden.effectiveClass);
    page.assertSourceChip(0, 'Overridden');
  });

  // Decision table — all four rungs of the resolution ladder, one row each
  it('SW-IACLS-TC16: the source chip names the rung that decided the class', () => {
    openProductTab([prods.dtOverridden, prods.dtAuto, prods.dtInherited, prods.dtDefault]);
    page.assertSourceChip(0, 'Overridden');
    page.assertSourceChip(1, 'Auto');
    page.assertSourceChip(2, 'Inherited');
    page.assertSourceChip(3, 'Default');
    // The ladder's meaning, not just its labels: an overridden row's effective
    // class is its override, while an inherited row's is its category's.
    expect(prods.dtOverridden.effectiveClass, 'the override wins').to.eq(
      prods.dtOverridden.abcClassOverride
    );
    expect(prods.dtInherited.effectiveClass, 'an inherited row takes its category class').to.eq(
      prods.dtInherited.categoryClass
    );
  });

  // EP — the asymmetry with the category control
  it('SW-IACLS-TC17: the product override control can return a product to inheriting', () => {
    openProductTab([prods.dtOverridden]);
    page.readOverrideOptions(0).then((options) => {
      expect(options, 'three classes plus the inherit option').to.have.length(4);
      expect(
        options.join('|'),
        'unlike the category control, this one can clear the override'
      ).to.match(/inherit from category/i);
    });
  });

  // ==========================================================================
  // Per-row override — the two live mutations
  // ==========================================================================

  // State transition — setting an override
  it('SW-IACLS-TC18: setting an override overrides the product', { tags: ['@smoke'] }, () => {
    openProductTab([prods.dtInherited]);
    stubOverrideSave('overridePut');
    const next = otherClass(prods.dtInherited.effectiveClass);
    page.setOverride(0, next);
    cy.wait('@overridePut').then(({ request }) => {
      expect(request.body.abcClass, 'the chosen class is sent').to.eq(next);
    });
    page.assertToast(new RegExp(`product overridden to class ${next}`, 'i'));
  });

  // State transition — clearing it falls back down the ladder
  it('SW-IACLS-TC19: clearing an override returns the product to its category class', () => {
    openProductTab([prods.dtOverridden]);
    stubOverrideClear(prods.dtOverridden.categoryClass, 'overrideDelete');
    page.clearOverride(0);
    cy.wait('@overrideDelete');
    page.assertToast(
      new RegExp(`override cleared — now inheriting class ${prods.dtOverridden.categoryClass}`, 'i')
    );
  });

  // Error guessing — the no-op guard
  it('SW-IACLS-TC20: re-selecting a product current override sends nothing', () => {
    openProductTab([prods.dtOverridden]);
    cy.intercept('PUT', '**/abc-classification/products/*', cy.spy().as('putSpy'));
    page.setOverride(0, prods.dtOverridden.abcClassOverride);
    cy.get('@putSpy').should('not.have.been.called');
  });

  // ==========================================================================
  // Search and filters
  // ==========================================================================

  // EP — search narrows the grid. The grid is server-paged, so the assertion is
  // that the request carried the term and the returned page is what renders.
  it('SW-IACLS-TC21: searching a product name narrows the grid', () => {
    openProductTab([prods.dtOverridden, prods.dtInherited, prods.dtDefault]);
    stubProducts([prods.dtInherited], 1, 'searched');
    page.searchProducts(prods.dtInherited.name);
    cy.wait('@searched').then(({ request }) => {
      expect(request.url, 'the search term reaches the server').to.contain('search=');
    });
    page.assertRowCount(1);
    page.assertProductCell(0, 'Product', prods.dtInherited.name);
  });

  // EP — each of the three filters
  it('SW-IACLS-TC22: each product filter narrows the grid', () => {
    openProductTab([prods.dtOverridden, prods.dtAuto, prods.dtInherited]);
    // Class filter. The positional index the DOM forces lives in the locator layer
    // (`FILTER_INDEX`), so the spec names the filter it means.
    stubProducts([prods.dtOverridden], 1, 'byClass');
    page.selectProductFilter('class', /class c/i);
    cy.wait('@byClass').then(({ request }) => {
      expect(request.url, 'the class filter reaches the server').to.match(/class=/);
    });
    page.assertRowCount(1);

    // Source filter.
    stubProducts([prods.dtAuto], 1, 'bySource');
    page.selectProductFilter('source', /^auto$/i);
    cy.wait('@bySource').then(({ request }) => {
      expect(request.url, 'the source filter reaches the server').to.match(/source=/);
    });
    page.assertRowCount(1);
    page.assertSourceChip(0, 'Auto');
  });

  // EP — the summary tracks the filtered rows on this tab, and the whole
  // catalogue on the category tab
  it('SW-IACLS-TC23: the summary follows the product filters', () => {
    openProductTab([prods.dtOverridden, prods.dtInherited]);
    // A filtered summary is requested with the filter, and its total is smaller.
    stubSummary(
      {
        buckets: [
          { abcClass: 'A', productCount: 1, onHandQuantity: 40 },
          { abcClass: 'B', productCount: 0, onHandQuantity: 0 },
          { abcClass: 'C', productCount: 0, onHandQuantity: 0 },
        ],
        totalOnHandQuantity: 40,
      },
      'filteredSummary'
    );
    stubProducts([prods.dtOverridden], 1, 'filteredProducts');
    page.searchProducts(prods.dtOverridden.name);
    cy.wait('@filteredProducts');
    cy.wait('@filteredSummary').then(({ request }) => {
      expect(request.url, 'the summary is asked for the same slice the grid shows').to.contain(
        'search='
      );
    });
    page.assertSummaryCardShows('A', '40');
  });

  // ==========================================================================
  // Row selection and the bulk bar
  // ==========================================================================

  // EP — the bar appears with the selection
  it('SW-IACLS-TC24: selecting rows reveals the bulk bar', () => {
    openProductTab([prods.dtOverridden, prods.dtInherited]);
    page.assertBulkBarAbsent();
    page.selectRow(0).selectRow(1);
    page.assertBulkBarSelected(data.bulk.epTwoSelected);
  });

  // Use case — the apply action waits for a class
  it('SW-IACLS-TC25: bulk apply waits for a class', () => {
    openProductTab([prods.dtOverridden, prods.dtInherited]);
    page.selectRow(0).selectRow(1);
    page.assertBulkApplyDisabled();
    page.chooseBulkClass('B');
    page.assertBulkApplyEnabled();
  });

  // Decision table — bulk assign
  it('SW-IACLS-TC26: bulk assigning a class updates the selection', { tags: ['@smoke'] }, () => {
    openProductTab([prods.dtOverridden, prods.dtInherited]);
    stubBulk(data.bulk.stAssignResult, 'bulkAssign');
    page.selectRow(0).selectRow(1);
    page.chooseBulkClass('B').applyBulk();
    cy.wait('@bulkAssign').then(({ request }) => {
      expect(request.body.productIds, 'both selected ids are sent').to.have.length(2);
      expect(request.body.abcClass, 'the chosen band is sent').to.eq('B');
    });
    page.assertToast(/2 product\(s\) set to class B/i);
    // The selection resets, so the bar goes away.
    page.assertBulkBarAbsent();
  });

  // Decision table — bulk clear sends an explicit null
  it('SW-IACLS-TC27: bulk clearing overrides reverts the selection', () => {
    openProductTab([prods.dtOverridden, prods.dtInherited]);
    stubBulk(data.bulk.stClearResult, 'bulkClear');
    page.selectRow(0).selectRow(1);
    page.clearBulkOverrides();
    cy.wait('@bulkClear').then(({ request }) => {
      expect(
        request.body.abcClass,
        'clearing sends an explicit null — omitting the key is refused by the schema'
      ).to.eq(null);
    });
    page.assertToast(/2 override\(s\) cleared/i);
  });

  // BVA — the bulk cap. A 1001-row page is stubbed because selecting that many
  // through the UI is impractical; the guard under test is the button's own.
  it('SW-IACLS-TC28: bulk apply refuses more than the cap', () => {
    const many = productRows(data.bulk.bvaOverCapRowCount, prods.dtInherited);
    openProductTab(many, many.length);
    // Select-all via the header checkbox, then confirm the guard holds.
    //
    // Generous timeouts on purpose: this grid is NOT virtualised, so checking
    // select-all re-renders all 1001 rows, and the bulk bar does not appear inside
    // the default 50s. Waiting for the "1001 selected" label first also proves the
    // selection actually happened — without it, a select-all that quietly selected
    // nothing would fail later with a confusing "no such label".
    // Wait for the ROWS first. Select-all acts on MRT's row model, so clicking it
    // while the 1001-row body is still rendering selects nothing at all and the bulk
    // bar never appears — which is what made this look like a select-all failure.
    page.assertProductRowsRendered(data.bulk.bvaOverCapRowCount, { timeout: 180000 });
    page.selectAllRows();
    page.assertBulkBarSelected(data.bulk.bvaOverCapRowCount, { timeout: 60000 });
    page.chooseBulkClass('B', { timeout: 60000 });
    page.assertBulkApplyDisabled();
  });

  // State restoration — the net for any live write this spec grows. TC18/TC19 above
  // run against stubs so the grid can hold a known rung, but the product they name
  // is real, so the pair stays wired in for a future author. It re-reads and writes
  // only on drift: a fully stubbed run therefore issues no PUT/DELETE against live
  // product data at all (the previous version captured in after() and wrote back
  // unconditionally — a provable no-op that still hit live data every run).
  after(() => {
    if (!capturedProduct) return;
    captureProduct(adminJwt).then((now) => {
      if (now && now.id === capturedProduct.id && now.originalOverride === capturedProduct.originalOverride) return;
      restoreProduct(adminJwt, capturedProduct);
    });
  });
});
