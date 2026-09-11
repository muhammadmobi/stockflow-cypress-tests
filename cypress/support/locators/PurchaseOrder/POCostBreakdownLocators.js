// cypress/support/locators/PurchaseOrder/POCostBreakdownLocators.js
//
// Selectors for the Cost Breakdown pane, opened via the "Product level
// breakdown" button inside the PO Close modal (PoCloseTextSection.tsx).
//
// GROUND TRUTH (read directly from source 2026-07-05, superseding an earlier,
// incorrect "second nested dialog" assumption):
// - `CostBreakdownModal.tsx` is ALWAYS rendered with `embedded` from
//   `ClosePoModelContent.tsx` (line ~126). Its standalone `<Dialog>` branch
//   (with the title "Product Level Breakdown - PO {poNumber}") is DEAD CODE
//   — `embedded` is always truthy in the live app, so that branch, and that
//   title string, never render.
// - `ClosePoModelContent.tsx` is a two-page SLIDING WIZARD inside the ONE
//   physical `[role="dialog"]` opened by `PurchaseOrderClosuerModal.tsx`
//   (via `IMSDialog`) — not a second nested dialog. Page 0 = Close PO
//   (`PoCloseTextSection.tsx` + `ReconciliationSection.tsx`), page 1 = the
//   embedded `CostBreakdownModal`. Both pages' Boxes are always mounted;
//   the inactive one gets `aria-hidden={true}` and the active one
//   `aria-hidden={false}` — React stringifies `aria-*` props literally, so
//   `[aria-hidden="false"]` reliably identifies whichever page is showing.
// - The trigger button's real rendered text (`PoCloseTextSection.tsx` line
//   ~208) is "Product level breakdown" (sentence case, no "View" prefix) —
//   NOT "View Product Level Breakdown". That longer string only appears as
//   plain hint text inside an `Alert` ("Click \"View Product Level
//   Breakdown\" to see details.") and, separately, inside the dead Dialog
//   branch's title — neither is the clickable trigger.
const POCostBreakdownLocators = {
  TRIGGER_BTN: '[role="dialog"] button:contains("Product level breakdown")',
  // Scope to the visible wizard page (aria-hidden="false") that also contains
  // the "Mismatches Only" switch label — that label only exists in
  // CostBreakdownModal's embedded render (the dead standalone-Dialog branch
  // that repeats the same label never mounts), so the combination is
  // unambiguous even though both wizard pages share the one [role="dialog"].
  MODAL: '[role="dialog"] [aria-hidden="false"]:contains("Mismatches Only")',
  // FormControlLabel roots — the Switch's <input type="checkbox"> lives inside.
  FILTER_MANUAL_ONLY: 'label:contains("Manual Products Only")',
  FILTER_MISMATCHES_ONLY: 'label:contains("Mismatches Only")',
  // APP GAP (see SW-POCB-TC09 / plan.md §3.2): CostBreakdownModal.tsx wires up
  // MRT's `globalFilter` state (`enableGlobalFilter: true`, `onGlobalFilterChange`)
  // but sets `enableTopToolbar: false`, which is what would normally render
  // MRT's built-in search icon/input, and there is no custom search TextField
  // in the JSX. No selector resolves to a real element today — this constant
  // exists only so TC09's `it.skip` body still imports a "real" (if currently
  // unreachable) locator instead of an invented one.
  SEARCH_INPUT: 'input[placeholder], input[type="text"]',
  // Bottom-toolbar text: `Record: ${left} - ${right} of ${totalProducts}`.
  PAGINATION_FOOTER: ':contains("Record:")',
  // "💲 Cost Updated" — opens CostUpdateHistoryModal (a REAL separate MUI
  // Dialog, unlike the breakdown pane itself; out of scope per plan.md §3.2).
  COST_HISTORY_BTN: 'button:contains("Cost Updated")',
  // Rendered text is "{count} Item Deleted" / "{count} Items Deleted" (no
  // literal parentheses) — match on the stable "Deleted" substring instead.
  DELETED_ITEMS_BTN: 'button:contains("Deleted")',
  MOVEMENTS_BTN: 'button:contains("moved in"), button:contains("moved out")',
  COST_HISTORY_TITLE: '[role="dialog"]:contains("Cost Update History")',
  DELETED_ITEMS_TITLE: '[role="dialog"]:contains("Deleted Items")',
};

export default POCostBreakdownLocators;
