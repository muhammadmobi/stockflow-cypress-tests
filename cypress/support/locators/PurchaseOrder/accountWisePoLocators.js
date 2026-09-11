// cypress/support/locators/PurchaseOrder/accountWisePoLocators.js
//
// Selectors for the AccountWise → StockWise purchase-order seam
// (cypress/qa/testPlans/purchaseOrder/AccountWisePoIntegration/plan.md).
//
// The PO picker is the SHARED `PoList` react-select
// (Frontend/src/components/IncommingInventory/PoList.tsx), rendered on Incoming
// Inventory, Import, Scan, Reports and the mobile screen. Its control id is the
// same everywhere, which is why `#Incomming-inventory-P-O-1` also appears in
// IncomingInvLocators, inventoryReportLocators and friends — the misspelling is
// the app's, don't "fix" it.
//
// react-select renders no stable class names of its own (emotion hashes them),
// so menu/option matching goes through the `[class*="-menu"]` / `[class*="-option"]`
// substring pattern the rest of this suite already uses.

const accountWisePoLocators = {
  // ── Navigation ────────────────────────────────────────────────────────────
  incomingInventoryNav: 'a[aria-label="Incoming Inventory"][href="/incoming-inventory"]',

  // ── The shared PO picker ──────────────────────────────────────────────────
  poDropdown: '#Incomming-inventory-P-O-1',
  poDropdownInput: '#Incomming-inventory-P-O-1 input',
  poDropdownMenu: '[class*="-menu"]',
  poDropdownOption: '[class*="-option"]',

  // react-select's "no results" row. Present in the menu when the fetch
  // returned an empty list OR failed — which is exactly the state a broken
  // /excel/po-numbers produces, so a test must never read it as "the PO is
  // simply absent" without also checking the request's status.
  poDropdownNoOptions: '[class*="-noOptionsMessage"]',

  // Synthetic option that `PoList` prepends whenever the parent passes
  // `allPo` — Incoming Inventory does (List.tsx). Because it is always present
  // and never filtered out, it is a safe ANCHOR: proving it rendered proves the
  // menu is open and populated, so a "purchase order is absent" assertion is
  // meaningful rather than vacuously true.
  poDropdownAllPosOption: 'All POs',

  // ── Selected value / PO-scoped screen ─────────────────────────────────────
  // react-select renders the chosen option into a "-singleValue" div inside the
  // control container. Emotion hashes the class, hence the substring match.
  poDropdownSelectedValue: '#Incomming-inventory-P-O-1 [class*="-singleValue"]',

  // material-react-table's default empty-state row. A brand-new AccountWise
  // purchase order has no products in StockWise yet, so the PO-scoped table
  // renders this. The same string is already matched by ItemSearchLocators,
  // quickViewLocators and warehouseLocationsLocators.
  emptyTableText: 'No records to display',

  // ── Mobile worker PO picker (SW-AWPO-TC06) ────────────────────────────────
  // A different component entirely: MobileViewSeparateScreen.tsx renders a
  // search field plus one button per purchase order, and for a NON-admin it
  // populates them from /purchase-orders/assigned-po/:userId rather than the
  // merged list. The picker step opens by clicking a tile, not by a URL param
  // (the component reads poSelection from useParams(), which never matches the
  // query string it sets — so navigate by clicking).
  // The ROOT tile, which calls openPoPickerFor() directly. Note there is also a
  // "Start Stock In" button in the same component, but it renders only when
  // `selectedGroup === 'stockIn'` — a value nothing ever sets, so it is
  // unreachable dead UI. Do not target it.
  mobileStockInTile: 'Stock In',
  mobileWorkerPoSearch: 'Search Purchase Orders',
  mobileWorkerPoButton: 'button',

  // ── Source chip (Reports only) ────────────────────────────────────────────
  // `formatOptionLabel` renders the AccountWise/StockWise chip ONLY inside menu
  // rows (context === 'menu') and ONLY when the parent passes `showSource`.
  // Frontend/src/components/Reports/index.tsx is the only caller that does, so
  // asserting the chip anywhere else fails for a reason unrelated to the
  // integration. Always assert it with the menu open, never on the selected
  // control.
  //
  // There is no selector for the chip itself: it is a bare text node inside the
  // option row, carrying no class of its own. The cy chain that walks
  // menu -> option -> chip therefore lives in
  // AccountWisePoPage.assertPoSource(), because this file exports selector
  // CONSTANTS only and never Cypress commands (SKILL.md §5).
};

export default accountWisePoLocators;
