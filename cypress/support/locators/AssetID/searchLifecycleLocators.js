// cypress/support/locators/AssetID/searchLifecycleLocators.js
//
// Locators for the Asset ID → Search Life Cycle screen (route /asset-id/search).
// Component: Frontend/src/pages/AssetIdSearch.tsx.
//
// The screen is a two-pane result view that only exists AFTER a successful
// lookup — `{!!lifecycleData && ( … )}` wraps the whole grid — so "the result is
// gone" and "the lookup failed" are the same DOM state. That is why the
// `lifecycleFlowHeading` anchor below doubles as the negative assertion for
// TC06 and TC12: its absence is the app's own statement that no result is held.
//
// Anchors are user-visible strings wherever the screen renders one, because a
// change to a heading a user reads SHOULD break a test. The places that fall
// back to MUI structure are called out where they appear.
//
// Every key here is consumed by SearchLifecyclePage — nothing is defined "just
// in case". An unused locator drifts out of step with the app and then lies to
// the next author (SKILL.md §9).
//
// Two collision traps this file exists to avoid:
//
//   1. Tab labels carry a live count suffix (`Timeline (7)`), so an exact-text
//      match would couple every tab interaction to the seeded data volume.
//      `tabByPrefix` matches the stable part only.
//   2. The step cards ("Purchase Order", "Parent Item", "This Item") and the
//      output cards are all MuiPaper, and so is the panel that contains them.
//      Addressing a step by its title text and then taking the DEEPEST matching
//      Paper is what keeps a "This Item" assertion from matching the whole
//      left-hand pane.

import generateAssetIdLocators from './generateAssetIdLocators';

/**
 * The Paper that renders one step card, addressed by its title.
 *
 * `cy.contains(selector, text)` yields the deepest element matching both, which
 * is the step card rather than the enclosing panel. Without the Paper walk-up a
 * `cy.contains('This Item')` would yield the <p> title alone, and asserting a
 * field value inside it would always fail.
 */
const cardByTitle = (title) =>
  cy.contains('.MuiPaper-root', title).filter(':visible').first();

/** One tab of the right-hand panel, addressed by the PREFIX of its label. */
const tabByPrefix = (prefix) =>
  cy.get('[role="tab"]').filter(`:contains("${prefix}")`).first();

const searchLifecycleLocators = {
  cardByTitle,
  tabByPrefix,
  inputWithinLabel: generateAssetIdLocators.inputWithinLabel,

  // ── Route + nav ────────────────────────────────────────────────────────
  route: '/asset-id/search',
  navGroupTitle: generateAssetIdLocators.navGroupTitle,
  navSearchLifecycleTitle: generateAssetIdLocators.navSearchLifecycleTitle,

  // ── Search card ────────────────────────────────────────────────────────
  heading: 'Search Asset Lifecycle',
  searchLabel: 'Asset ID / Serial Number',
  searchBtnText: /^Search$/,

  // ── Result — left pane (flow tree) ─────────────────────────────────────
  lifecycleFlowHeading: 'Lifecycle Flow',
  stepPurchaseOrder: 'Purchase Order',
  stepThisItem: 'This Item',

  // ── Result — right pane (tabs) ─────────────────────────────────────────
  tabWorkOrders: 'Work Orders',
  tabComponents: 'Components',
  tabTimeline: 'Timeline',
  componentsDisassembledHeading: 'Disassembled Components',

  // ── Empty states (verbatim from AssetIdSearch.tsx) ─────────────────────
  emptyNoWorkOrders: 'No work order linkage found.',
  emptyNoParentWorkOrders: 'No parent work-order linkage via assembly.',
  emptyNoTimeline: 'No timeline events found.',

  // ── Structural fallbacks ───────────────────────────────────────────────
  //
  // These have no user-visible anchor of their own.
  //   `tabList`       — the tab strip; its enclosing Paper is the scope every
  //                     tab-body assertion is narrowed to, so that "the Timeline
  //                     shows a Stock Out" cannot be satisfied by the sidebar.
  //   `paper`         — that enclosing Card.
  //   `tableContainer` / `tableRow` — the tab tables carry no caption, so rows
  //                     are reached by scoping to their section heading.
  //   `statusChip` / `timelineChip` — StatusChip and TimelineList both render a
  //                     bare MuiChip whose only text is the value itself.
  tabList: '[role="tablist"]',
  paper: '.MuiPaper-root',
  tableContainer: '.MuiTableContainer-root',
  tableRow: 'tbody tr',
  statusChip: '.MuiChip-root',
  timelineChip: '.MuiChip-root',

  // ── Shared ─────────────────────────────────────────────────────────────
  alert: generateAssetIdLocators.alert,
};

export default searchLifecycleLocators;
