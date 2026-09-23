// cypress/e2e/InventoryActions/01-LandingScreen.cy.js
//
// Specs for the "Inventory Actions" landing screen at /MobileViewScreen
// (component: Frontend/src/components/IncommingInventory/MobileViewSeparateScreen.tsx).
// Scope: screen state-machine, tile visibility, role gating, config-flag conditional
// disabling, deep-link / refresh behaviour. Destination screens are covered by
// sibling specs in this directory and by root specs at cypress/e2e/.
//
// ISTQB techniques cited per cypress/qa/SKILL.md §4 in a one-line comment above
// each it(). Test IDs: SW-IA-TC<NN>.

import LandingScreenPage from '../../pageObjects/InventoryActions/LandingScreenPage';
import data from '../../fixtures/InventoryActions/landingScreen.json';

describe('Inventory Actions (/MobileViewScreen)', { tags: ['@regression'] }, () => {
  const ia = new LandingScreenPage();

  // -- Intercept helpers ----------------------------------------------------
  // The screen fires two GETs on mount that drive conditional tile state:
  //   1. /inventory-audits/active  → controls Audit Scan tile visibility
  //   2. /configs?type=general     → controls Stock-Out + Mark-Damaged flags
  // Stub them deterministically per CTAL-TAE §7 (CI/CD determinism).

  function stubAudit(body) {
    cy.intercept('GET', '**/inventory-audits/active*', { body });
  }

  function stubGeneralConfig(body) {
    // Use pathname so the same stub catches BOTH the dashboard layout's call
    // (`/configs?userId=X&type=general&name=general`) and the screen's local
    // useQuery (`/configs?type=general&name=general`). If only the screen call
    // is stubbed, Redux loads the real QA config first and the
    // `configState ?? generalConfig` fallback in the screen masks the stub.
    // Alias so tests can `cy.wait('@generalConfig')` and avoid a race where
    // the click handler fires before the response is applied.
    cy.intercept({ method: 'GET', pathname: '/configs' }, { body }).as('generalConfig');
  }

  function stubPoNumbers(body) {
    cy.intercept('GET', '**/excel/po-numbers*', { body });
  }

  function applyStubs({ audit, config, pos }) {
    stubAudit(audit);
    stubGeneralConfig(config);
    if (pos) stubPoNumbers(pos);
  }

  // -- Setup ---------------------------------------------------------------
  // Credentials and baseUrl come from cypress.config.js (already pointing at QA).

  beforeEach(() => {
    cy.authSession('admin');
    // Don't visit /dashboard here: the dashboard layout fetches /configs on
    // mount, which would race the per-test cy.intercept stubs (Redux would
    // win via the configState ?? generalConfig fallback in the screen).
    // openFromSideNav() handles the visit after stubs are set.
  });

  afterEach(() => {
    // State restoration (SKILL §6 rule 5): screen writes ic-selectedPo / ic-returnTo
    // to localStorage when the PO picker is engaged. Clear them so the next
    // it() starts from a known state.
    cy.window().then((win) => {
      win.localStorage.removeItem('ic-selectedPo');
      win.localStorage.removeItem('ic-returnTo');
    });
  });

  // ------------------------------------------------------------------------
  // EP — Equivalence Partitioning on role-based root-tile visibility
  // ------------------------------------------------------------------------
  it('SW-IA-TC01 — admin sees all root tiles plus the Select Operation heading', { tags: ['@smoke'] }, () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.allFlagsFalse });
    ia.openFromSideNav();
    ia.assertRootMenuVisible();
    ia.assertTilesPresent(data.epRootTilesNonSales);
    // The Inventory Audit tile (ABC epic) is now a PERMANENT root tile — no
    // hasActiveAudit gating — so it belongs in epRootTilesNonSales above, and
    // this case's "all root tiles" title stays accurate. SW-IA-TC10 remains the
    // dedicated case for that tile.
  });

  // ------------------------------------------------------------------------
  // Decision Table — Stock-Out tile state across (requireWorkOrderForStockOut × enablePoForStockOut)
  // ------------------------------------------------------------------------
  it('SW-IA-TC02 — C1 woFalse/poFalse: all 3 Stock-Out sub-tiles are enabled', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.allFlagsFalse });
    ia.openFromSideNav();
    ia.openStockOut();
    ia.assertGroupHeading('Stock Out');
    data.stockOutSubTiles.forEach((label) => ia.assertTileEnabled(label));
  });

  it('SW-IA-TC03 — C3 woTrue: all 3 Stock-Out sub-tiles are disabled (work-order required)', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.stockOutBlocked });
    ia.openFromSideNav();
    ia.openStockOut();
    data.stockOutSubTiles.forEach((label) => ia.assertTileDisabled(label));
  });

  it('SW-IA-TC04 — C2 woFalse/poTrue: "Stock Out Products" routes via the PO picker', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.poForStockOutOn });
    ia.openFromSideNav();
    // Click handler reads enablePoForStockOut from the /configs response — wait
    // for the stubbed reply to land in react-query before clicking, or the click
    // takes the navigate(...) branch and the picker never renders.
    cy.wait('@generalConfig');
    ia.openStockOut();
    ia.clickTile('Stock Out Products');
    ia.assertPoPickerVisible();
  });

  // ------------------------------------------------------------------------
  // Decision Table — Mark Damaged Products by enablePoForDamaging
  // ------------------------------------------------------------------------
  it('SW-IA-TC05 — C2 poDamageTrue: "Mark Damaged Products" routes via the PO picker', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.poForDamagingOn });
    ia.openFromSideNav();
    // Same race as TC04 — wait for /configs before reading enablePoForDamaging.
    cy.wait('@generalConfig');
    ia.openInventoryManagement();
    ia.clickTile('Mark Damaged Products');
    ia.assertPoPickerVisible();
  });

  // ------------------------------------------------------------------------
  // State Transition — root → PO picker → back-to-root round-trip.
  // Post-consolidation (2026-06): the root "Stock In" tile now calls
  // openPoPickerFor(SMART_STOCK_IN_ROUTE) and jumps straight to the PO picker
  // (step 1) instead of opening a menuGroup=stockIn sub-menu. The picker's
  // ← Back returns to the root menu (step 0). The old sub-menu is still
  // reachable by deep-link only — see TC09.
  // ------------------------------------------------------------------------
  it('SW-IA-TC06 — root → Stock In → PO picker → ← Back returns to the root menu', { tags: ['@smoke'] }, () => {
    applyStubs(baseStubs());
    ia.openFromSideNav();
    ia.assertNoMenuGroup();
    ia.openStockIn();
    // Lands directly on the PO picker — no menuGroup is set on the root tile.
    ia.assertPoPickerVisible();
    ia.assertNoMenuGroup();
    ia.backFromPoPicker();
    ia.assertRootMenuVisible();
    ia.assertNoMenuGroup();
  });

  // ------------------------------------------------------------------------
  // State Transition — nested warehouse menu (root → warehouse → assignment → back × 2)
  // ------------------------------------------------------------------------
  it('SW-IA-TC07 — warehouse → assignment → back-to-warehouse → back-to-menu unwinds correctly', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.allFlagsFalse });
    ia.openFromSideNav();
    ia.openWarehouseManagement();
    ia.assertMenuGroup('warehouse');
    ia.assertTilesPresent(data.warehouseSubTiles);

    ia.openWarehouseAssignment();
    ia.assertMenuGroup('warehouse');
    ia.assertMenuSub('assignment');
    ia.assertTilesPresent(data.warehouseAssignmentSubTiles);

    ia.backToWarehouse();
    ia.assertMenuGroup('warehouse');
    ia.assertNoMenuSub();

    ia.backToMenu();
    ia.assertNoMenuGroup();
    ia.assertRootMenuVisible();
  });

  // ------------------------------------------------------------------------
  // State Transition — invalid menuGroup deep-link
  // ------------------------------------------------------------------------
  it('SW-IA-TC08 — invalid menuGroup deep-link renders no group and no sub-tiles leak', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.allFlagsFalse });
    ia.visit(data.deepLinks.invalidGroup);
    // Component falls through every group conditional — no group heading, no sub-tiles.
    ia.assertTilesAbsent([
      ...data.stockInSubTiles,
      ...data.stockOutSubTiles,
      ...data.warehouseSubTiles,
    ]);
  });

  // ------------------------------------------------------------------------
  // Use Case — deep-link directly into a sub-menu
  // ------------------------------------------------------------------------
  it('SW-IA-TC09 — deep-link ?menuGroup=stockIn lands on the Stock In sub-menu (single Start Stock In tile)', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.allFlagsFalse });
    ia.visit(data.deepLinks.stockInGroup);
    ia.assertGroupHeading('Stock In');
    // Post-consolidation the sub-menu renders a single "Start Stock In" button
    // (data.stockInSubTiles === ["Start Stock In"]).
    ia.assertTilesPresent(data.stockInSubTiles);
  });

  // ------------------------------------------------------------------------
  // Inventory Audit tile (ABC epic)
  // ------------------------------------------------------------------------
  // The ABC feature shipped WITHOUT the old hasActiveAudit gating: the mobile
  // landing now renders an "Inventory Audit" tile unconditionally (routes to
  // /MobileViewScreen/abc/audits). The former /inventory-audits/active gate no
  // longer exists (MobileViewSeparateScreen.tsx), so TC10 asserts the tile is
  // always present and TC11 (the hide-when-inactive case) is RETIRED — there is
  // no gating left to hide it.
  it('SW-IA-TC10 — the Inventory Audit tile is present on the landing screen', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.allFlagsFalse });
    ia.openFromSideNav();
    ia.assertTilesPresent([data.epAuditScanTile]);
  });

  // SW-IA-TC11 RETIRED: the Inventory Audit tile is unconditional now (the ABC
  // feature dropped the hasActiveAudit gate), so there is no "hidden" state to
  // assert.

  // ------------------------------------------------------------------------
  // Error Guessing — refresh mid-flow must not lose menuGroup state
  // ------------------------------------------------------------------------
  it('SW-IA-TC12 — page refresh on a sub-menu preserves menuGroup via URL state', () => {
    applyStubs({ audit: data.interceptedConfigs.noActiveAudit, config: data.interceptedConfigs.generalConfig.allFlagsFalse });
    ia.openFromSideNav();
    ia.openWarehouseManagement();
    ia.assertMenuGroup('warehouse');
    cy.reload();
    // Re-stub on reload — intercepts persist across reloads in Cypress, but be explicit.
    ia.assertGroupHeading('Warehouse Management');
    ia.assertMenuGroup('warehouse');
  });

  // ========================================================================
  // Navigation contracts (Use Case — actor-driven navigation per cypress/qa/SKILL.md §4.1).
  //
  // Every reachable button on the screen gets one it() asserting it routes to the
  // expected URL fragment. CRUD on each destination is covered by its own spec
  // (08-/12-/13-/14-/15-/16-/17- + IncomingInventory/ + Configuration/ + api/),
  // so this section verifies the *contract*, not the destination behaviour.
  //
  // Test ID prefix: SW-IA-TC<NN> continuing from TC13.
  // ========================================================================

  const baseStubs = () => ({
    audit: data.interceptedConfigs.noActiveAudit,
    config: data.interceptedConfigs.generalConfig.allFlagsFalse,
    pos: data.interceptedConfigs.poNumbers,
  });

  let tcCounter = 13;
  const nextTcId = () => `SW-IA-TC${String(tcCounter++).padStart(2, '0')}`;

  // Per cypress/qa/SKILL.md §5: @smoke = critical-path subset, one representative
  // per major tile group — every other navigation contract inherits @regression
  // from the outer describe.
  const smokeTileLabels = new Set([
    'Stock Out Items',         // rep: direct-route path
    'Mark Damaged Products',   // rep: Inventory Management group
    'Work Orders',             // rep: root-direct nav
    'Assign Items',            // rep: Warehouse Assignment group
  ]);
  const tagsFor = (label) => (smokeTileLabels.has(label) ? { tags: ['@smoke'] } : {});

  // ------------------------------------------------------------------------
  // Use Case — Smart Stock In navigation contract (replaces the retired 4-row
  // stockIn contract table). Post-consolidation (2026-06) the root "Stock In"
  // tile opens the PO picker directly and routes to /MobileViewScreen/
  // smart-stock-in. The old TC14 (Stock In Products), TC15 (Add By Product)
  // and TC16 (Product Listing) contracts are retired — their destination
  // behaviour is now covered by the consolidated SmartStockIn spec
  // (12-SmartStockIn.cy.js). The counter is advanced to 17 below so the
  // downstream Stock-Out / Inventory-Management / etc. test IDs stay stable.
  // ------------------------------------------------------------------------
  describe('Smart Stock In navigation contract', () => {
    it(`${nextTcId()} — Root → "Stock In" → PO picker → routes to ${data.smartStockInUrlIncludes}`, { tags: ['@smoke'] }, () => {
      applyStubs(baseStubs());
      ia.openFromSideNav();
      ia.openStockIn();
      ia.assertPoPickerVisible();
      ia.pickPo(data.stubPoNumber);
      ia.assertUrlIncludes(data.smartStockInUrlIncludes);
    });
  });

  // Retired TC14–TC16 (Stock In Products / Add By Product / Product Listing
  // sub-tile contracts). Skip the counter past them so TC17+ keep their IDs.
  tcCounter = 17;

  describe('Stock Out direct-nav navigation contracts', () => {
    data.navigationContracts.stockOutDirect.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Stock Out → "${tileLabel}" routes to ${expectedUrlIncludes}`, tagsFor(tileLabel), () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.openStockOut();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Inventory Management direct-nav navigation contracts', () => {
    data.navigationContracts.inventoryManagementDirect.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Inventory Management → "${tileLabel}" routes to ${expectedUrlIncludes}`, tagsFor(tileLabel), () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.openInventoryManagement();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Product Operations navigation contracts', () => {
    data.navigationContracts.productOperations.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Product Operations → "${tileLabel}" routes to ${expectedUrlIncludes}`, () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.openProductOperations();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Root-direct navigation contracts', () => {
    data.navigationContracts.rootDirect.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Root → "${tileLabel}" routes to ${expectedUrlIncludes}`, tagsFor(tileLabel), () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Warehouse Management root navigation contracts', () => {
    data.navigationContracts.warehouseRoot.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Warehouse → "${tileLabel}" routes to ${expectedUrlIncludes}`, () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.openWarehouseManagement();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Warehouse → Assignment navigation contracts', () => {
    data.navigationContracts.warehouseAssignment.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Warehouse → Assignment → "${tileLabel}" routes to ${expectedUrlIncludes}`, tagsFor(tileLabel), () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.openWarehouseManagement();
        ia.openWarehouseAssignment();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Warehouse → Unassignment navigation contracts', () => {
    data.navigationContracts.warehouseUnassignment.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Warehouse → Unassignment → "${tileLabel}" routes to ${expectedUrlIncludes}`, () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.openWarehouseManagement();
        ia.openWarehouseUnassignment();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Asset navigation contracts', () => {
    data.navigationContracts.asset.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Asset → "${tileLabel}" routes to ${expectedUrlIncludes}`, () => {
        applyStubs(baseStubs());
        ia.openFromSideNav();
        ia.openAsset();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  describe('Audit Scan conditional navigation contract', () => {
    data.navigationContracts.auditScanConditional.forEach(({ tileLabel, expectedUrlIncludes }) => {
      it(`${nextTcId()} — Active audit → "${tileLabel}" routes to ${expectedUrlIncludes}`, () => {
        applyStubs({
          audit: data.interceptedConfigs.withActiveAudit,
          config: data.interceptedConfigs.generalConfig.allFlagsFalse,
        });
        ia.openFromSideNav();
        ia.clickTile(tileLabel);
        ia.assertUrlIncludes(expectedUrlIncludes);
      });
    });
  });

  // ========================================================================
  // Coverage gaps (per branch walk of MobileViewSeparateScreen.tsx).
  // Each it() targets a specific component branch not exercised by TC01–TC38.
  // ========================================================================

  // ------------------------------------------------------------------------
  // Use Case — back from PO picker clears picker-only state (step, selectedPo,
  // nextLink, poId/poSelection/returnTo URL params, ic-* localStorage). The
  // back handler intentionally PRESERVES menuGroup/menuSub so the user lands
  // back on the sub-menu they came from, not the root.
  // Component branch: L193–L218 (back-button onClick handler).
  // ------------------------------------------------------------------------
  it('SW-IA-TC39 — clicking ← Back from the PO picker returns to the originating sub-menu and clears picker state', () => {
    applyStubs(baseStubs());
    // Reach the picker from the deep-link Stock In sub-menu so menuGroup=stockIn
    // is set before opening the picker. openPoPickerFor preserves the existing
    // search params, so the back-from-picker handler (which deletes only
    // poId/poSelection/returnTo) lands the user back on the sub-menu.
    ia.visit(data.deepLinks.stockInGroup);
    ia.assertGroupHeading('Stock In');
    ia.startStockIn();
    ia.assertPoPickerVisible();

    ia.backFromPoPicker();

    // User lands back on the Stock In sub-menu (step 0, menuGroup preserved).
    ia.assertGroupHeading('Stock In');
    ia.assertMenuGroup('stockIn');
    // Picker-specific URL params are cleared.
    ia.assertPickerParamsCleared();
    // localStorage keys the picker writes are removed.
    cy.window().then((win) => {
      expect(win.localStorage.getItem('ic-selectedPo')).to.be.null;
      expect(win.localStorage.getItem('ic-returnTo')).to.be.null;
    });
  });

  // ------------------------------------------------------------------------
  // Use Case — deep-link with ?poId=… mounts directly into PO-picker mode (step=1).
  // Component branch: L126–L133 (second useEffect: poId search param → setStep(1)).
  // ------------------------------------------------------------------------
  it('SW-IA-TC40 — deep-link ?poId=PO-NAV-TEST mounts the PO picker directly (step 1)', () => {
    applyStubs(baseStubs());
    ia.visit(`?poId=${data.stubPoNumber}`);
    ia.assertPoPickerVisible();
    // Root-menu heading must NOT be present — confirms step=1 on mount, not step=0.
    ia.assertRootMenuAbsent();
  });

  // ------------------------------------------------------------------------
  // Decision Table — C4: requireWorkOrderForStockOut=true overrides enablePoForStockOut=true.
  // Component branch: L555/L568/L596 disabled prop wired to requireWorkOrderForStockOut alone.
  // The fourth column of fixtures.decisionTableStockOut was previously untested.
  // ------------------------------------------------------------------------
  it('SW-IA-TC41 — C4 woTrue/poTrue: all 3 Stock-Out sub-tiles still disabled (workOrder dominates)', () => {
    applyStubs({
      audit: data.interceptedConfigs.noActiveAudit,
      config: data.interceptedConfigs.generalConfig.stockOutBlockedAndPoOn,
    });
    ia.openFromSideNav();
    ia.openStockOut();
    data.stockOutSubTiles.forEach((label) => ia.assertTileDisabled(label));
  });

  // ------------------------------------------------------------------------
  // EP — non-admin role partition: worker users do not see the literal 'default' PO.
  // Component branch: L161–L168 — non-admin filter strips po.toLowerCase() === 'default'.
  // Endpoint differs from admin: /purchase-orders/assigned-po/:userId (see API.GET_WORKER_POS).
  // ------------------------------------------------------------------------
  it('SW-IA-TC42 — worker role filters the literal "default" PO out of the picker list', () => {
    // Override the session set in beforeEach with a worker session.
    Cypress.session.clearAllSavedSessions();
    cy.authSession('user');

    cy.intercept('GET', '**/inventory-audits/active*', { body: data.interceptedConfigs.noActiveAudit });
    cy.intercept('GET', '**/configs?type=general**', { body: data.interceptedConfigs.generalConfig.allFlagsFalse });
    cy.intercept('GET', '**/purchase-orders/assigned-po/**', { body: data.interceptedConfigs.workerPoList });

    // Workers may not see the "Inventory Actions" entry in the dashboard
    // side-nav, so visit the screen directly rather than via openFromSideNav().
    ia.visit();
    ia.openStockIn(); // root Stock In tile now opens the PO picker directly
    ia.assertPoPickerVisible();

    ia.assertPoButtonVisible('PO-WORKER-1');
    ia.assertPoButtonAbsent('default');
  });

  // ------------------------------------------------------------------------
  // Use Case — search field filters the PO list by case-insensitive substring.
  // Component branch: L226–L231 (TextField onChange → filteredPoList).
  // ------------------------------------------------------------------------
  it('SW-IA-TC43 — typing in the PO search field filters the list by case-insensitive substring', () => {
    applyStubs({
      audit: data.interceptedConfigs.noActiveAudit,
      config: data.interceptedConfigs.generalConfig.allFlagsFalse,
      pos: data.interceptedConfigs.poNumbersMulti,
    });
    ia.openFromSideNav();
    ia.openStockIn(); // opens the PO picker directly
    ia.assertPoPickerVisible();

    // All three POs visible before filtering.
    ia.assertPoButtonVisible('PO-ALPHA');
    ia.assertPoButtonVisible('PO-BETA');
    ia.assertPoButtonVisible('XYZ-100');

    // Lowercase 'beta' should match 'PO-BETA' only (case-insensitive substring).
    ia.searchPo('beta');
    ia.assertPoButtonVisible('PO-BETA');
    ia.assertPoButtonAbsent('PO-ALPHA');
    ia.assertPoButtonAbsent('XYZ-100');
  });

  // ------------------------------------------------------------------------
  // State Transition — fetching → fetched: LinearProgress visible while poFetching=true.
  // Component branch: L242 / L269 (ternary on poFetching gating list vs spinner).
  // poFetching is isRefetching, so the spinner only shows after a refetch is triggered
  // by openPoPickerFor → refetchPo() (the root "Stock In" tile handler).
  // ------------------------------------------------------------------------
  it('SW-IA-TC44 — LinearProgress is visible while the PO list is refetching', () => {
    cy.intercept('GET', '**/inventory-audits/active*', { body: data.interceptedConfigs.noActiveAudit });
    cy.intercept('GET', '**/configs?type=general**', { body: data.interceptedConfigs.generalConfig.allFlagsFalse });
    // First call (mount) responds immediately; second call (refetch on tile click) is delayed.
    // Aliased so we can `cy.wait('@poNumbers')` after mount: if call #1 is still
    // in-flight when the click fires, react-query attaches refetch() to the
    // existing promise and call #2 never happens — no delay window, no spinner.
    let callCount = 0;
    cy.intercept('GET', '**/excel/po-numbers*', (req) => {
      callCount += 1;
      if (callCount === 1) {
        req.reply({ body: data.interceptedConfigs.poNumbers });
      } else {
        // Hold the refetch open long enough that the spinner-visible window
        // comfortably exceeds Cypress's retry cadence under CI load.
        req.reply({ body: data.interceptedConfigs.poNumbers, delay: 4000 });
      }
    }).as('poNumbers');

    ia.openFromSideNav();
    // Make sure the mount-time call has resolved before clicking the tile —
    // otherwise refetchPo() rides on top of the in-flight request and the
    // delayed second response never fires.
    cy.wait('@poNumbers');
    // The root "Stock In" tile calls openPoPickerFor → refetchPo(), which is
    // the refetch that flips poFetching=true. (Previously this was a separate
    // "Stock In Items" sub-tile click.)
    ia.openStockIn();
    // Spinner should appear during the in-flight refetch (poFetching=true).
    ia.assertPoListLoaderVisible(8000);
  });
});
