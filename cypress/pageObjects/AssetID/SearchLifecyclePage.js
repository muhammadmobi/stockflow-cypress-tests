// cypress/pageObjects/AssetID/SearchLifecyclePage.js
//
// Page object for Asset ID → Search Life Cycle (/asset-id/search).
// Component: Frontend/src/pages/AssetIdSearch.tsx
// Test plan: cypress/qa/testPlans/assetId/sub/search-lifecycle-plan.md
//
// Method naming follows intent, not mechanics (CTAL-TAE §7): `searchFor()` not
// `typeThenClick()`, `assertNoWorkOrderLinkage()` not `assertAlert(string)`.
// Assertions live in `assert*` methods so a spec body reads as conditions rather
// than DOM steps — and so the spec never has to import the locator file, which
// keeps the Spec → Page Object → Locator → DOM layering intact.
//
// Two screen-specific rules shape almost every method here.
//
//   1. The entire result grid is behind `{!!lifecycleData && …}`, so there is no
//      "empty result" state — either the flow tree is mounted or nothing is.
//      Every assertion ABOUT the result therefore waits for `Lifecycle Flow`
//      first; a query that ran before the request settled would fail with
//      "element not found" and read as a rendering bug rather than a timing one.
//
//   2. Every tab-body assertion is scoped to `tabPanel()`. Unscoped, a
//      `cy.contains('Stock Out')` also matches the sidebar and a
//      `cy.get('.MuiChip-root')` also matches the flow tree's own status chip —
//      so the assertion would pass with an empty Timeline tab.

import L from '../../support/locators/AssetID/searchLifecycleLocators';

class SearchLifecyclePage {
  // ── Navigation ─────────────────────────────────────────────────────────

  /** Visit the screen cold and wait until the search control is usable. */
  visit() {
    cy.visit(L.route);
    cy.contains(L.heading, { timeout: 30000 }).should('be.visible');
    return this;
  }

  /**
   * Visit with `?assetId=<term>` — the deep-link entry the screen supports.
   *
   * The component fires the lookup from a mount-time `useEffect`, so the request
   * is already in flight before Cypress can attach an intercept. Callers that
   * need to WAIT on that request must alias it BEFORE calling this.
   */
  visitWithAssetId(term) {
    cy.visit(`${L.route}?assetId=${encodeURIComponent(term)}`);
    cy.contains(L.heading, { timeout: 30000 }).should('be.visible');
    return this;
  }

  /** Reach the screen through the sidebar instead of a deep link. */
  navigateViaSidebar() {
    cy.contains('a, div, span', L.navGroupTitle).first().click({ force: true });
    cy.contains('a', L.navSearchLifecycleTitle).click({ force: true });
    cy.location('pathname').should('eq', L.route);
    return this;
  }

  // ── Search ─────────────────────────────────────────────────────────────

  /** Type a term into the search field without submitting. */
  typeSearchTerm(term) {
    L.inputWithinLabel(L.searchLabel).clear().type(term);
    return this;
  }

  /** Click Search. Does not wait — callers own their own intercept. */
  clickSearch() {
    cy.contains('button', L.searchBtnText).click();
    return this;
  }

  /**
   * Type a term and submit it, then block until the result grid is mounted.
   *
   * Used by every POSITIVE test. A negative test must NOT use this — it would
   * hang waiting for a flow tree that will never render — and should drive
   * typeSearchTerm() + clickSearch() directly.
   */
  searchFor(term) {
    this.typeSearchTerm(term);
    this.clickSearch();
    return this.waitForResult();
  }

  /** Block until the result grid has rendered. */
  waitForResult() {
    cy.contains(L.lifecycleFlowHeading, { timeout: 30000 }).should('be.visible');
    return this;
  }

  // ── Tabs ───────────────────────────────────────────────────────────────

  openWorkOrdersTab() {
    L.tabByPrefix(L.tabWorkOrders).click();
    return this;
  }

  openComponentsTab() {
    L.tabByPrefix(L.tabComponents).click();
    return this;
  }

  openTimelineTab() {
    L.tabByPrefix(L.tabTimeline).click();
    return this;
  }

  /**
   * The Card holding the tab strip and whichever tab body is mounted — the
   * scope for every tab-body assertion (see rule 2 in the file header).
   */
  tabPanel() {
    return cy.get(L.tabList).closest(L.paper).first();
  }

  // ── Flow-tree interaction ──────────────────────────────────────────────

  /**
   * Expand a step card by clicking its title.
   *
   * `This Item` is expanded by default (`expanded.thisItem !== false`), so
   * calling this on it would COLLAPSE it — read its fields directly instead.
   */
  expandStep(title) {
    L.cardByTitle(title).click();
    return this;
  }

  // ── Assertions — search control ────────────────────────────────────────

  assertSearchButtonDisabled() {
    cy.contains('button', L.searchBtnText).should('be.disabled');
    return this;
  }

  assertSearchButtonEnabled() {
    cy.contains('button', L.searchBtnText).should('not.be.disabled');
    return this;
  }

  /** The screen writes the searched term into `?assetId=` so a result is shareable. */
  assertUrlCarriesAssetId(term) {
    cy.location('search').should('contain', encodeURIComponent(term));
    return this;
  }

  /** No `assetId` is in the query string yet. */
  assertUrlHasNoAssetId() {
    cy.location('search').should('not.contain', 'assetId');
    return this;
  }

  // ── Assertions — result present / absent ───────────────────────────────

  assertResultShown() {
    cy.contains(L.lifecycleFlowHeading).should('be.visible');
    return this;
  }

  /**
   * No result is held.
   *
   * Asserting the ABSENCE of the flow-tree heading is the honest check: the
   * component renders the whole grid conditionally, so this is the app's own
   * statement that `lifecycleData` is null. Asserting on the error toast alone
   * would pass while a stale result was still on screen — which is exactly the
   * regression SW-AIDL-TC12 is about.
   */
  assertNoResultShown() {
    cy.contains(L.lifecycleFlowHeading).should('not.exist');
    return this;
  }

  /** The server's own error message reached the user, quoting the searched term. */
  assertLookupFailedFor(term) {
    cy.contains(term, { timeout: 20000 }).should('be.visible');
    return this;
  }

  // ── Assertions — flow tree ─────────────────────────────────────────────

  /** The highlighted "This Item" card contains `text` somewhere in its fields. */
  assertThisItemContains(text) {
    L.cardByTitle(L.stepThisItem).should('contain.text', text);
    return this;
  }

  /** The status chip inside "This Item" (not any other chip on the page). */
  assertThisItemStatus(status) {
    L.cardByTitle(L.stepThisItem).find(L.statusChip).should('contain.text', status);
    return this;
  }

  /** Expand the Purchase Order step and confirm it names `poNumber`. */
  assertPurchaseOrderStepShows(poNumber) {
    this.expandStep(L.stepPurchaseOrder);
    L.cardByTitle(L.stepPurchaseOrder).should('contain.text', poNumber);
    return this;
  }

  // ── Assertions — tabs ──────────────────────────────────────────────────

  /** All three result tabs are rendered. */
  assertAllTabsShown() {
    [L.tabWorkOrders, L.tabComponents, L.tabTimeline].forEach((prefix) => {
      L.tabByPrefix(prefix).should('be.visible');
    });
    return this;
  }

  /** The Timeline tab's label carries a bracketed count, e.g. `Timeline (7)`. */
  assertTimelineTabHasCountBadge() {
    L.tabByPrefix(L.tabTimeline).invoke('text').should('match', /\(\d+\)/);
    return this;
  }

  assertNoWorkOrderLinkage() {
    cy.contains(L.alert, L.emptyNoWorkOrders).should('be.visible');
    return this;
  }

  assertNoParentWorkOrderLinkage() {
    cy.contains(L.alert, L.emptyNoParentWorkOrders).should('be.visible');
    return this;
  }

  /** A humanised timeline action label, asserted inside the tab body only. */
  assertTimelineShows(label) {
    this.tabPanel().should('contain.text', label);
    return this;
  }

  assertTimelineNotEmpty() {
    cy.contains(L.emptyNoTimeline).should('not.exist');
    this.tabPanel().find(L.timelineChip).its('length').should('be.greaterThan', 0);
    return this;
  }

  /**
   * Rows of the Disassembled Components table.
   *
   * The Components tab renders TWO tables (disassembled and reassembled), so an
   * unscoped `tbody tr` would silently merge them and "the disassembled table
   * has two rows" would also be counting the reassembled rows.
   *
   * The walk is exactly one level: each section is
   * `<Stack><Typography>heading</Typography><TableContainer/></Stack>`, so the
   * heading's parent IS the section boundary. Anything deeper would be guessing
   * at MUI's internals.
   */
  disassembledComponentRows() {
    cy.contains(L.componentsDisassembledHeading).should('be.visible');
    return cy
      .contains(L.componentsDisassembledHeading)
      .parent()
      .find(`${L.tableContainer} ${L.tableRow}`);
  }
}

export default SearchLifecyclePage;
