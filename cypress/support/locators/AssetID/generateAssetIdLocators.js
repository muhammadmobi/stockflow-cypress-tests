// cypress/support/locators/AssetID/generateAssetIdLocators.js
//
// Locators for the Generate Asset ID screen (route /asset-id).
// Component: Frontend/src/pages/AssetId.tsx.
//
// The page exposes no data-testid hooks, so every anchor here is either a
// user-visible label (which is what a human tester would use, and what an
// accessible-name change SHOULD break) or a MUI structural class. The two
// helper functions below are the only place that knows how MUI wires a
// <label> to its control — page objects call them instead of re-deriving it.

/**
 * The `input` of a MUI Autocomplete / TextField addressed by its floating
 * label. `.closest('.MuiFormControl-root')` is what joins the two: MUI renders
 * the label and the input as siblings inside one FormControl, and the generated
 * `for`/`id` pair is not stable across builds.
 */
const inputWithinLabel = (labelText) =>
  cy.contains('label', labelText).closest('.MuiFormControl-root').find('input');

/**
 * The `[role="combobox"]` of a MUI Select addressed by its floating label.
 * A Select renders a div[role=combobox] (not an input), so it needs its own
 * accessor — reusing inputWithinLabel here would silently match the Select's
 * hidden native input and never open the listbox.
 */
const comboboxWithinLabel = (labelText) =>
  cy.contains('label', labelText).closest('.MuiFormControl-root').find('[role="combobox"]');

const generateAssetIdLocators = {
  inputWithinLabel,
  comboboxWithinLabel,

  // ── Nav ────────────────────────────────────────────────────────────────
  navGroupTitle: 'Asset Id',
  navGenerateTitle: 'Generate Asset ID',
  navSearchLifecycleTitle: 'Search Lifecycle',

  // ── Form ───────────────────────────────────────────────────────────────
  heading: 'Generate Asset IDs',
  poLabel: 'PO Number',
  categoryLabel: 'Category',
  productLabel: 'Product',
  labelQuantityLabel: 'Label Quantity',

  // MUI renders every open Select/Autocomplete list into a portal at the end
  // of <body>, so options are NOT inside the form — they must be queried
  // globally.
  listbox: 'ul[role="listbox"]',
  option: 'li[role="option"]',

  scanQrToggle: 'Scan QR',
  selectContainerToggle: 'Select Container',
  selectLocationToggle: 'Select Location',
  scanContainerOrLocationInput: 'input[placeholder*="Scan or enter container/location QR code"]',

  // ── Actions ────────────────────────────────────────────────────────────
  previewBtnText: /^Preview Asset IDs$/,
  generateBtnText: /^Generate & Print$/,
  reprintBtnText: /^Reprint Last Labels$/,

  // ── Preview panel ──────────────────────────────────────────────────────
  //
  // The panel is an outlined Paper whose heading literally renders
  // `Asset ID Preview ({previewItems.length})`. That rendered COUNT is the
  // assertion target for "how many labels are shown" — counting <img> nodes
  // instead was measuring the QR-code renderer (which mounts and remounts as
  // the async QRCode.toDataURL effect resolves) rather than the card list, and
  // gave inflated, timing-dependent numbers.
  previewHeadingPrefix: 'Asset ID Preview',
  previewHeadingWithCount: (n) => `Asset ID Preview (${n})`,
  // Every query for a preview card MUST go through this — an unscoped
  // `img[alt]` also matches anything else on the page that happens to carry an
  // alt attribute.
  previewPanel: () =>
    cy.contains('.MuiPaper-root', 'Asset ID Preview').filter(':visible').last(),
  previewCardImg: 'img[alt]',

  // ── Alerts ─────────────────────────────────────────────────────────────
  alert: '.MuiAlert-root',

};

export default generateAssetIdLocators;
