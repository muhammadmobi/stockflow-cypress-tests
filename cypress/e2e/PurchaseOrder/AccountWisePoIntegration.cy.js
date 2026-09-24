/**
 * AccountWise → StockWise Purchase-Order Visibility — UI (SW-AWPO-TC01..06)
 * =============================================================================
 * Test plan: cypress/qa/testPlans/purchaseOrder/AccountWisePoIntegration/plan.md
 *
 * A buyer raises a Purchase Order in AccountWise; warehouse staff must be able
 * to pick it in StockWise with no import, upload or sync step in between. This
 * spec seeds through AccountWise's REAL purchase API (never a stub — stubbing an
 * integration seam tests nothing) and then drives StockWise's own PO pickers.
 *
 * WHY THE SEED IS API-DRIVEN. Creating the PO through the AccountWise UI is
 * `SW-AWPO-TC07`, a deliberately MANUAL test (plan.md §10): automating it would
 * mean porting account-wise's page objects into this repo, duplicating another
 * suite's testware. Everything StockWise-side is exercised for real here.
 *
 * ONE TOKEN, NOT TWO. purchase-service mounts the same IAM Keycloak guard
 * StockWise does, so cy.login()'s bearer authenticates against both. Do NOT use
 * loginToAccountWise() — that is the invoice service.
 *
 * ── WHICH LANE EACH SCREEN USES — the whole point of this file ───────────────
 *   Incoming Inventory  PoList incoming={true} openOnly={true}  -> close=FALSE
 *   Reports             PoList incoming={true} (no openOnly)    -> close=TRUE
 *   Mobile worker       /purchase-orders/assigned-po/:userId    -> neither lane
 * (`closeParam = incoming && !openOnly`, PoList.tsx). The lanes apply different
 * filters, so a purchase order can legitimately appear on one screen and not
 * another — ALWAYS name the lane when reading a failure here (plan.md §6.6).
 *
 * ── SEED ISOLATION ──────────────────────────────────────────────────────────
 * Defect D1 (pending.md §1) makes the close=false lane 500 whenever ANY
 * AccountWise PO with NULL metadata exists. Only SW-AWPO-TC01 seeds NULL
 * metadata — because that is what a real buyer's purchase order looks like, and
 * it is the condition under test. Every other TC seeds an explicit
 * `metadata.stockWiseStatus = 'open'` so its own subject decides the result.
 *
 * ⚠️ SW-AWPO-TC01 is a D1 regression guard — RED when D1 reproduces, GREEN when
 * it does not, and often SKIPPED first on the number collision. It briefly
 * degrades shared QA while its seed exists; seeds are torn down in afterEach, so
 * the window is seconds.
 *
 * ── WHY NOTHING HERE IS @smoke ──────────────────────────────────────────────
 * `cy:run:smoke` globs the whole of cypress/e2e, so a @smoke tag on TC01 would
 * put a deliberate NULL-metadata seed — and therefore D1's org-wide 500 on every
 * PO picker — into the fastest, most frequently run suite on SHARED QA. The
 * defect is worth pinning; degrading everyone else's environment on every smoke
 * run to pin it is not. This module is @regression-only until the one-line D1
 * guard lands (pending.md §1 / D1); promote TC01 to @smoke in the same PR that
 * fixes it.
 */

import AccountWisePoPage from '../../pageObjects/PurchaseOrder/AccountWisePoPage';
import {
  probeAccountWisePurchaseApi,
  getAccountWiseVendorRef,
  createAccountWisePo,
  deleteAccountWisePo,
  createStockWisePo,
  stockWiseHoldsClosedPo,
  skipAfterCleanup,
  sweepSuiteSeeds,
  deleteStockWisePo,
  getPurchaseBaseUrl,
} from '../../support/helpers/accountWisePurchaseOrders';
import poFixture from '../../fixtures/accountWisePurchaseOrder.json';

// ── READING ORDER ───────────────────────────────────────────────────────────
// The TCs are grouped by the LANE each screen requests, not by TC number, so a
// failure is read next to the other cases sharing its filter:
//   Incoming Inventory (close=false)  TC01, TC05
//   Reports            (close=true)   TC02, TC03
//   Freshness & roles                 TC04, TC06
// The numbering is plan.md's and is deliberately not re-sequenced here — plan.md
// §9 stays the authoritative matrix.
describe('AccountWise → StockWise Purchase-Order Visibility', { tags: ['@regression'] }, () => {
  const page = new AccountWisePoPage();

  let authToken;
  let vendorRef = null;
  let suiteSkipReason = null;

  let awSeeds = [];
  let swSeeds = [];

  // Partition constants live in the fixture, not inline in two specs.
  const OPEN_METADATA = { metadata: poFixture.metadata.epExplicitOpen };

  const seedAw = (opts = {}) =>
    createAccountWisePo(authToken, { vendorRef, status: poFixture.status.epPending, ...opts }).then(
      (po) => {
        awSeeds.push(po);
        return po;
      },
    );

  before(() => {
    cy.login().then((token) => {
      authToken = token;
      expect(authToken, 'a IAM bearer is required for both StockWise and AccountWise').to.exist;
    });

    // Self-heal before anything else — see the API spec for why.
    cy.then(() => sweepSuiteSeeds(authToken));

    // Reachability gate — StockWise degrades SILENTLY when AccountWise is
    // unreachable, so without this an outage reads as "the PO is missing"
    // instead of naming the environment. plan.md §8 risk 1.
    cy.then(() => probeAccountWisePurchaseApi(authToken)).then(({ reachable, reason }) => {
      if (!reachable) suiteSkipReason = reason;
    });

    // Vendor gate — AccountWise requires a real vendor_id on create; a synthetic
    // one is rejected with a 500.
    cy.then(() => (suiteSkipReason ? null : getAccountWiseVendorRef(authToken))).then((ref) => {
      if (suiteSkipReason) return;
      if (!ref) {
        suiteSkipReason =
          `The AccountWise tenant behind ${getPurchaseBaseUrl()} has no vendor to reference, ` +
          'so this suite cannot seed a purchase order. Create one vendor on the tenant and re-run.';
        return;
      }
      vendorRef = ref;
    });
  });

  beforeEach(function () {
    if (suiteSkipReason) {
      cy.log(`SKIPPED — ${suiteSkipReason}`);
      this.skip();
    }
    cy.authSession('admin');
  });

  afterEach(() => {
    if (!authToken) return;
    awSeeds.forEach((po) => deleteAccountWisePo(authToken, po.id));
    swSeeds.forEach((poNumber) => deleteStockWisePo(authToken, poNumber));
    awSeeds = [];
    swSeeds = [];
  });

  // Safety net. `this.skip()` aborts a test AND its remaining hooks, so a seed
  // created just before a skip never reaches afterEach. Sweep by order_id prefix
  // rather than replaying awSeeds, which that same skip may have orphaned.
  after(() => {
    if (!authToken) return;
    swSeeds.forEach((poNumber) => deleteStockWisePo(authToken, poNumber));
    swSeeds = [];
    sweepSuiteSeeds(authToken);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Picking an AccountWise purchase order (Incoming Inventory — close=false)
  // ───────────────────────────────────────────────────────────────────────────

  // Use case — the actor-driven happy path: a buyer raises a PO in AccountWise,
  // a warehouse admin opens Incoming Inventory and picks it, with no
  // StockWise-side import in between.
  //
  // ⚠️ D1 REGRESSION GUARD — read the status, not this comment, for today's
  // result. Incoming Inventory requests the close=false lane, which returns 500
  // while a NULL-metadata AccountWise PO exists, so the picker renders
  // "No options" — missing EVERY purchase order, not merely this one.
  // assertPoNumbersRequestSucceeded() is what makes the failure say so instead
  // of "the purchase order is not in the dropdown". On shared QA this TC often
  // SKIPS first on the number collision, which is an environment signal.
  it('SW-AWPO-TC01 — a warehouse admin can pick the AccountWise purchase order from the Incoming Inventory dropdown', function () {
    // Register the wait barrier BEFORE the navigation that triggers the fetch —
    // the other way round makes cy.wait hang.
    page.interceptPoNumbers('incomingPoNumbers');

    // Seed BEFORE the first visit: PoList caches with staleTime: Infinity, so a
    // PO created after the picker loaded would not appear on a re-open anyway
    // (that cache behaviour is SW-AWPO-TC04's subject, not this one).
    cy.then(() => seedAw()).then((po) => {
      // Environment guard — see the note in the API spec's TC01.
      stockWiseHoldsClosedPo(authToken, po.purchase_order_number).then(function guard(closed) {
        if (closed) {
          return skipAfterCleanup.call(
            this,
            authToken,
            po,
            `StockWise already holds "${po.purchase_order_number}" as Closed, which the open lane ` +
              'excludes by design (TC11 subject), not by the defect under test.',
          );
        }
        return undefined;
      });
      page.visitIncomingInventory();
      page.assertPoNumbersRequestSucceeded('incomingPoNumbers');
      page.searchPoInDropdown(po.purchase_order_number);
      page.assertPoOffered(po.purchase_order_number);
    });
  });

  // Use case — selecting the purchase order scopes the Incoming Inventory screen
  // to it. Goes only as far as "the screen loads for this PO"; receiving against
  // it is out of scope (plan.md §3.2).
  it('SW-AWPO-TC05 — choosing the AccountWise purchase order opens its Incoming Inventory screen with nothing received yet', function () {
    page.interceptPoNumbers('incomingPoNumbers');

    cy.then(() => seedAw({ overrides: OPEN_METADATA })).then((po) => {
      stockWiseHoldsClosedPo(authToken, po.purchase_order_number).then(function guard(closed) {
        if (closed) {
          return skipAfterCleanup.call(
            this,
            authToken,
            po,
            `StockWise already holds "${po.purchase_order_number}" as Closed, which the open lane ` +
              'excludes by design (TC11 subject), not by the defect under test.',
          );
        }
        return undefined;
      });
      page.visitIncomingInventory();
      page.assertPoNumbersRequestSucceeded('incomingPoNumbers');
      page.searchPoInDropdown(po.purchase_order_number);
      page.selectPoFromDropdown(po.purchase_order_number);
      page.assertScreenScopedToPo(po.purchase_order_number);
      page.assertNothingReceivedYet();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Source badging — Reports only (close=true lane)
  // ───────────────────────────────────────────────────────────────────────────

  // Use case — the AccountWise/StockWise chip. Reports is the ONLY caller that
  // passes `showSource`, and the chip renders only inside open menu rows, never
  // on the selected control — so this must be asserted with the menu open.
  // Reports uses close=true, which defect D1 does not affect.
  it('SW-AWPO-TC02 — the Reports purchase-order dropdown shows an AccountWise badge next to that purchase order', () => {
    page.interceptPoNumbers('reportsPoNumbers');

    cy.then(() => seedAw({ overrides: OPEN_METADATA })).then((po) => {
      page.visitReports();
      page.assertPoNumbersRequestSucceeded('reportsPoNumbers');
      page.searchPoInDropdown(po.purchase_order_number);
      page.assertPoOffered(po.purchase_order_number);
      page.assertPoSource(po.purchase_order_number, 'AccountWise');
    });
  });

  // Decision table — the other column of the same condition: a purchase order
  // that exists ONLY in StockWise must be badged StockWise. Together with TC02
  // this proves the chip reflects origin rather than being a constant.
  it('SW-AWPO-TC03 — a purchase order created inside StockWise is badged StockWise, not AccountWise', () => {
    const poNumber = `CYP-AWPO-SW-${Date.now()}`;
    page.interceptPoNumbers('reportsPoNumbers');

    cy.then(() => createStockWisePo(authToken, { poNumber, status: 'Open' }))
      .then(() => {
        swSeeds.push(poNumber);
        page.visitReports();
        page.assertPoNumbersRequestSucceeded('reportsPoNumbers');
        page.searchPoInDropdown(poNumber);
        page.assertPoOffered(poNumber);
        page.assertPoSource(poNumber, 'StockWise');
      });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Freshness & role gating
  // ───────────────────────────────────────────────────────────────────────────

  // Use case — documents the picker's indefinite cache so a future reader does
  // not read the first half of this as a defect. `staleTime: Infinity` keyed on
  // [INCOMING_POS, !!showSource, closeParam] means a PO created mid-session is
  // invisible until the page is reloaded.
  it('SW-AWPO-TC04 — a purchase order created in AccountWise mid-session only appears after the page is reloaded', function () {
    // ⚠️ EXPECTED RED — defect D1 (pending.md §1), failing at assertMenuPopulated():
    // the Incoming Inventory picker renders ZERO options. That is D1's
    // user-facing symptom — the close=false lane is broken, so the dropdown is
    // missing EVERY purchase order, not just the seeded one. Before the anchor
    // was added this TC passed vacuously, because "no menu at all" is
    // indistinguishable from "this one option is absent".
    //
    // Incoming Inventory, NOT Reports. The cache behaviour itself is identical on
    // both screens — Reports' two PoList call sites are `isMobile` vs desktop and
    // therefore mutually exclusive, and even if both mounted they share the React
    // Query key [INCOMING_POS, !!showSource, closeParam] with staleTime: Infinity,
    // so a remount reads the cache and never refetches. The reason is relevance,
    // not mechanism: this module's use case is a warehouse admin receiving against
    // the AccountWise purchase order, which runs through the Incoming Inventory
    // picker (the close=false lane), so that is the screen whose staleness a
    // reader needs documented.
    page.interceptPoNumbers('firstLoad');
    page.visitIncomingInventory();
    page.assertPoNumbersRequestSucceeded('firstLoad');

    // Create the purchase order only AFTER the picker has loaded and cached.
    cy.then(() => seedAw({ overrides: OPEN_METADATA })).then((po) => {
      // Prove the menu is open and populated BEFORE filtering — anchored on the
      // always-present "All POs" entry. Without this a menu that never opened
      // would satisfy the absence check below, and this TC would prove nothing
      // about the staleTime: Infinity cache it exists to document. The anchor
      // must be checked unfiltered: typing a purchase-order number filters it out.
      page.openPoDropdown();
      page.assertMenuPopulated();
      page.searchPoInDropdown(po.purchase_order_number);
      page.assertPoNotOffered(po.purchase_order_number);

      // Reload: a fresh React Query client with an empty cache re-fetches.
      page.interceptPoNumbers('afterReload');
      page.visitIncomingInventory();
      page.assertPoNumbersRequestSucceeded('afterReload');
      page.searchPoInDropdown(po.purchase_order_number);
      page.assertPoOffered(po.purchase_order_number);
    });
  });

  // Decision table — the role condition. A non-admin's mobile picker reads
  // /purchase-orders/assigned-po/:userId (MobileViewSeparateScreen.tsx), NOT the
  // merged list, so an unassigned AccountWise purchase order must not reach
  // them. The branch is in the component, which is why this cannot be an API TC.
  it('SW-AWPO-TC06 — a warehouse worker cannot see an AccountWise purchase order that has not been assigned to them', () => {
    cy.then(() => seedAw({ overrides: OPEN_METADATA })).then((po) => {
      // Switch roles AFTER seeding: the seed needs the admin bearer, the
      // assertion needs the worker's own session.
      cy.authSession('user');
      page.interceptWorkerPoNumbers('workerPoNumbers');
      page.visitMobileWorkerPoPicker();
      // Prove the worker branch actually served the picker before asserting an
      // absence — otherwise a screen that never rendered would pass vacuously.
      page.assertWorkerPoRequestUsed('workerPoNumbers');
      page.assertWorkerPoNotOffered(po.purchase_order_number);
    });
  });
});
