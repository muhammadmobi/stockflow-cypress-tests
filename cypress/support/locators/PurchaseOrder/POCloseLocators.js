// cypress/support/locators/PurchaseOrder/POCloseLocators.js
//
// All DOM selectors for the PO Close feature:
//   - Purchase Orders list page
//   - PO Close modal (PurchaseOrderClosuerModal.tsx)
//   - PoCloseTextSection.tsx (verdict, breakdown cards, status issues)
//   - ReconciliationSection.tsx (missing items, closure reason, notes)

const POCloseLocators = {
  // ── PO List page ────────────────────────────────────────────────────────────
  LIST: {
    SEARCH_INPUT: '#searchInputRef',
    SEARCH_SUBMIT: 'button[type="submit"]',
    // "Close PO" row-action button (text button, color #ED3237)
    CLOSE_PO_BTN: (poNumber) =>
      `td:contains("${poNumber}")`,
    // Row status cell — "Open" / "Closed"
    ROW_STATUS: (poNumber) =>
      `tr:has(td:contains("${poNumber}")) td`,
    // Reopen button (appears on closed POs)
    REOPEN_BTN: 'button:contains("Reopen")',
    // Delete button (last icon button on row)
    DELETE_BTN_IN_ROW: 'button[aria-label="delete"], button svg[data-testid="DeleteIcon"]',
    DELETE_CONFIRM_INPUT: 'input[placeholder="Type DELETE to confirm"]',
    DELETE_CONFIRM_YES: 'button:contains("Yes")',
  },

  // ── PO Close modal ───────────────────────────────────────────────────────────
  MODAL: {
    DIALOG: '[role="dialog"]',
    TITLE: '[role="dialog"] h6, [role="dialog"] [class*="MuiTypography-formSection"]',
    LOADING_SPINNER: '[role="dialog"] [class*="MuiCircularProgress"]',
    // Footer actions
    EXPORT_BTN: '[role="dialog"] button:contains("Export Excel"), [role="dialog"] button:contains("Exporting")',
    CANCEL_BTN: '[role="dialog"] button:contains("Cancel"), [role="dialog"] button:contains("Close")',
    CLOSE_PO_SUBMIT_BTN: '[role="dialog"] button:contains("Close Purchase Order")',
  },

  // ── Verdict / PoCloseTextSection ─────────────────────────────────────────────
  VERDICT: {
    PERFECT_MATCH: '[role="dialog"] :contains("Perfect Match")',
    QUANTITY_MISMATCH: '[role="dialog"] :contains("Quantity Mismatch")',
    COST_MISMATCH: '[role="dialog"] :contains("Cost Mismatch")',
    COST_QTY_MISMATCH: '[role="dialog"] :contains("Cost & Quantity Mismatch")',
    REVIEW_CHIP: '[role="dialog"] [class*="MuiChip"]:contains("Review Required"), [role="dialog"] [class*="MuiChip"]:contains("Action Required")',
    // "View Product Level Breakdown" button
    VIEW_BREAKDOWN_BTN: '[role="dialog"] button:contains("View Product Level Breakdown")',
  },

  // ── PO-Level Summary (Quantity + Cost section) ──────────────────────────────
  // Actual DOM labels from PoCloseTextSection.tsx (confirmed by live DOM inspection):
  //   Section:  "PO-Level Summary"
  //   Qty sub:  "Original Products Quantity"  then Received (PO):N Expected:N Difference:N
  //   Cost sub: "Original Products Cost"      then Received (PO):$X Expected:$X Difference:$X
  //   Per-product row (in Missing Items):  "{Category}{received}/{expected} received{extra} excess{missing} missing{cost}"
  // NOTE: both sub-cards are instances of the SAME shared `BreakdownCard` component
  // (PoCloseTextSection.tsx) and both render the literal label "Difference:" — the
  // legacy CARD/MISSING_TEXT/EXTRAS_TEXT/EXPECTED_TEXT/RECEIVED_TEXT entries below are
  // unscoped `:contains()` CSS strings that match BOTH cards (and their ancestors) and
  // are not actually used by any spec today. CARD_SELECTOR/CARD_TEXT are the ones
  // meant for use with `cy.contains(selector, text)`, which resolves ambiguity between
  // the two cards the same way COST_CALC/QTY_CALC do above.
  QTY_BREAKDOWN: {
    CARD: '[role="dialog"] :contains("PO-Level Summary"), [role="dialog"] :contains("Original Products Quantity")',
    CARD_SELECTOR: '[role="dialog"] .MuiBox-root',
    CARD_TEXT: 'Original Products Quantity',
    // Difference is negative for missing: "Difference:-2"
    MISSING_TEXT: '[role="dialog"] :contains("Difference:")',
    // Excess shows as "Excess Received:N" in PO-Level Summary
    EXTRAS_TEXT: '[role="dialog"] :contains("Excess Received:")',
    EXPECTED_TEXT: '[role="dialog"] :contains("Expected:")',
    RECEIVED_TEXT: '[role="dialog"] :contains("Received:")',
  },

  // ── Cost section (inside PO-Level Summary) ───────────────────────────────────
  COST_BREAKDOWN: {
    CARD: '[role="dialog"] :contains("Original Products Cost"), [role="dialog"] :contains("PO-Level Summary")',
    CARD_SELECTOR: '[role="dialog"] .MuiBox-root',
    CARD_TEXT: 'Original Products Cost',
    MODAL: '[role="dialog"][aria-labelledby], [role="presentation"] [role="dialog"]',
  },

  // ── "Total Cost/Quantities Calculation" cards (ReconciliationSection.tsx) ────
  // These are SEPARATE MUI <Card> elements from the PO-Level Summary card above
  // (COST_BREAKDOWN/QTY_BREAKDOWN target PoCloseTextSection.tsx). Both cards render
  // the literal text "Excess Received:" so scoping by the card's own heading is
  // required to avoid ambiguity between the two.
  // NOTE: ReconciliationSection wraps BOTH cards in an outer <Card> (the "Incoming
  // Items" section), so a plain `.MuiCard-root:contains(text)` CSS selector matches
  // BOTH that outer wrapper AND the inner card (jQuery :contains() matches every
  // ancestor whose combined text includes the substring, not just the innermost
  // element). CARD_SELECTOR/CARD_TEXT are meant to be used with Cypress's
  // `cy.contains(selector, text)` command instead of `cy.get(selector)` —
  // cy.contains() resolves to the single deepest/most-specific matching element,
  // which sidesteps the outer-wrapper collision entirely.
  // Rows: Original PO Cost Received: (always) / Excess Cost Received: (if excessCost>0)
  //       / Original PO Cost Expected: (always) / Manual Expected Cost: (if manualExpectedCost>0)
  COST_CALC: {
    CARD_SELECTOR: '[role="dialog"] .MuiCard-root',
    CARD_TEXT: 'Total Cost Calculation',
  },

  // Rows: Original Received: (always) / Excess Received: (if excessQty>0)
  //       / Original Expected: (always) / Manual Expected: (if manualExpectedQty>0)
  QTY_CALC: {
    CARD_SELECTOR: '[role="dialog"] .MuiCard-root',
    CARD_TEXT: 'Total Quantities Calculation',
  },

  // ── Status Issues alert (serialized items only) ──────────────────────────────
  // Status Issues only renders for serialized items (Items table). Product-only
  // POs have no Items rows so this section is absent.
  STATUS_ISSUES: {
    ALERT: '[role="dialog"] [role="alert"], [role="dialog"] .MuiAlert-root',
    TEXT: '[role="dialog"] :contains("Status Issues:")',
    DAMAGED_TEXT: '[role="dialog"] :contains("Damaged:")',
    DISPUTED_TEXT: '[role="dialog"] :contains("Disputed:")',
    MISSING_STATUS_TEXT: '[role="dialog"] :contains("Missing:")',
  },

  // ── Missing Items section (ReconciliationSection) ────────────────────────────
  // DOM: "Missing Items{N} units{P} product(s)Est. vendor credit: ${X}"
  // Per-product row: "{Category}{received}/{expected} received{extra} excess{missing} missing${cost}"
  MISSING_ITEMS: {
    SECTION_HEADER: '[role="dialog"] :contains("Missing Items")',
    UNITS_CHIP: '[role="dialog"] [class*="MuiChip"]',
    SERIAL_ROW: '[role="dialog"] :contains("SER-AUTO"), [role="dialog"] :contains("SN-")',
  },

  // ── Closure fields (ReconciliationSection) ───────────────────────────────────
  // Verified literal strings from ReconciliationSection.tsx:
  //   Closure Reason label: "Closure Reason (optional)" — 8 MenuItem options
  //   Credit Memo label: "Credit Memo Number (optional)", placeholder "Vendor credit memo reference"
  //   Closure Notes label: "Closure Notes (optional)", placeholder "e.g. 'Vendor confirmed shortage will be in next shipment'."
  CLOSURE: {
    // `.MuiSelect-select` is the actual clickable trigger element that opens
    // the listbox popup — a broader `[class*="MuiSelect"]` match also picks
    // up `.MuiSelect-icon` / `.MuiSelect-nativeInput`, and clicking those
    // (with force:true masking the mis-click) never opens the popup.
    REASON_SELECT: '[role="dialog"] .MuiSelect-select',
    REASON_LABEL: '[role="dialog"] :contains("Closure Reason (optional)")',
    CREDIT_MEMO_INPUT: '[role="dialog"] input[placeholder="Vendor credit memo reference"]',
    NOTES_TEXTAREA: '[role="dialog"] textarea[placeholder*="Vendor confirmed shortage"]',
  },

  // ── Admin cost/qty adjustment (ReconciliationSection, admin-only) ────────────
  // The save button is labelled "Save Changes" (with an optional pending-count
  // suffix, e.g. "Save Changes (1)") — ReconciliationSection.tsx renders a single
  // combined button that persists both cost and expected-quantity edits, replacing
  // the older separate "Save Cost Changes" control. It is rendered disabled until
  // there is at least one pending edit (totalPending > 0), so callers must type an
  // edit first and wait for it to become enabled before clicking.
  ADJUSTMENT: {
    SECTION_TITLE: '[role="dialog"] :contains("Adjust cost / quantity (Admin)")',
    SAVE_COST_BTN: '[role="dialog"] button:contains("Save Changes")',
    COST_INPUT: '[role="dialog"] input[type="number"]',
  },

  // ── Post-close details (ClosureDetailsPopover) ───────────────────────────────
  CLOSURE_DETAILS: {
    TRIGGER: 'button[aria-label="view closure details"]',
    POPOVER: '[role="presentation"] .MuiPopover-paper, [role="tooltip"]',
  },
};

export default POCloseLocators;
