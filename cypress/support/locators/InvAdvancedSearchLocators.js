/**
 * Locators — Inventory Advanced Search Modal & Stats Clickable
 * Source verified against:
 *   Frontend/src/components/AdvancedSearch/AdvancedSearchModal.tsx
 *   Frontend/src/components/Item/ItemList.tsx (stat cards)
 */

const InvAdvancedSearchLocators = {
  // ── Advanced Search trigger ─────────────────────────────────────────────
  // The TuneIcon IconButton lives inside the search field's end adornment.
  // data-testid is stripped in production builds; target the button via its
  // parent InputAdornment class — stable across MUI versions.
  openBtn:            '[class*="MuiInputAdornment-positionEnd"] button',

  // ── Drawer (variant="drawer" at 1920×1080, anchor="right") ────────────
  dialog:             '.MuiDrawer-paperAnchorRight',
  dialogTitle:        '.MuiDrawer-paperAnchorRight h6',

  // ── Field filter (narrows accordion field list) ─────────────────────────
  fieldFilterInput:   'input[placeholder="Type to filter field names..."]',

  // ── All / Category toggle (only visible when category = All) ───────────
  toggleGroup:        '[role="group"]',
  allToggleBtn:       '[role="group"] button:first-child',
  categoryToggleBtn:  '[role="group"] button:last-child',

  // ── Accordion sections (one per category / "Common") ───────────────────
  accordion:          '.MuiAccordion-root',
  accordionSummary:   '.MuiAccordionSummary-root',

  // ── Dialog action buttons ───────────────────────────────────────────────
  searchBtn:          'button:contains("Search")',
  clearAllBtn:        'button:contains("Clear All")',
  cancelBtn:          'button:contains("Cancel")',

  // ── Active filter chips ─────────────────────────────────────────────────
  activeFiltersHeading: 'h6:contains("Active Filters")',
  filterChip:           '.MuiChip-filled',
  // MuiChip-deleteIcon is a stable MUI class on the SVG delete icon (not test-specific)
  chipDeleteIcon:       '[class*="MuiChip-deleteIcon"]',

  // ── Validation / empty-state messages ──────────────────────────────────
  validationError:    'p:contains("Please enter at least one search value to proceed.")',
  noFieldsMsg:        'p:contains("No searchable fields configured.")',

  // ── Column customization (MRT toolbar button) ───────────────────────────
  customizeColsBtn:   'button:contains("Customize Columns")',

  // ── Scoped active-filter chip inside the search-bar start adornment ───────
  // Used to assert no criteria chips remain after Clear All / chip removal /
  // category change without matching unrelated filled chips elsewhere on page.
  searchInputChip:    '[class*="MuiInputAdornment-positionStart"] .MuiChip-filled',

  // ── Error toast (react-hot-toast error level) ──────────────────────────
  // react-hot-toast renders error notifications with role="alert".
  // MUI Alert components (info/warning banners) also use role="alert" but
  // always carry the MuiAlert-root class — exclude them so the assertion
  // targets only transient toast notifications, not persistent page banners.
  errorToast:         '[role="alert"]:not(.MuiAlert-root)',

  // ── Table empty-state overlay ───────────────────────────────────────────
  noRowsOverlay:      'td[colspan]',

  // ── Stats Clickable — stat card wrapper ────────────────────────────────
  // Rendered as MUI CardActionArea inside the stat-cards row on /inventory
  statCard:           '[class*="MuiCardActionArea"]',
};

export default InvAdvancedSearchLocators;
