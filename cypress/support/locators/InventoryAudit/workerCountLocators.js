// cypress/support/locators/InventoryAudit/workerCountLocators.js
//
// Locators for the mobile worker count screen at /MobileViewScreen/abc/audits
// (cypress/e2e/InventoryAudit/06-WorkerCountMobileTests.cy.js).
// Component: Frontend/src/components/ABC/worker/index.tsx
//
// The screen is a single component with four steps — `audits`, `locate`, `tasks`,
// `count` — so locators are grouped by step and there is no per-step route to
// assert on. Step identity comes from the header title instead.
//
// TWO THINGS DIFFER FROM THE DESKTOP SCREENS, and both matter:
//
//  1. **Toasts are a MUI Snackbar + filled Alert**, not react-hot-toast. So the
//     desktop rule (match role=alert but EXCLUDE .MuiAlert-root) is exactly wrong
//     here — the worker toast IS a MuiAlert, inside .MuiSnackbar-root. Use
//     `snackbar()`, never the shared desktop toast locator.
//  2. **The scan field is read from the DOM at submit time**, not from React
//     state, because a barcode wedge delivers the value and its Enter
//     back-to-back. Tests that fire two scans in a row must set the input value
//     and dispatch events (see the page object) rather than relying on a typed
//     delay — otherwise they pass without exercising the mechanic at all.

/** Step header titles, which are how a test knows where it is. */
export const STEP_TITLE = {
  audits: 'My Audits',
  count: null, // the count step titles itself with the bin code
};

const workerCountLocators = {
  // ── Shared ──────────────────────────────────────────────────────────────
  header: (title) => cy.findByRole('heading', { name: title }),
  backButton: () => cy.get('button').find('svg[data-testid="ArrowBackIcon"]').first().parents('button').first(),

  /** The worker toast: a MUI Snackbar holding a filled Alert. */
  snackbar: () => cy.get('.MuiSnackbar-root'),
  snackbarText: () => cy.get('.MuiSnackbar-root').invoke('text'),

  spinner: () => cy.get('.MuiCircularProgress-root'),
  progressBar: () => cy.get('.MuiLinearProgress-root'),

  // ── Step: my audits ─────────────────────────────────────────────────────
  auditsHeader: () => cy.findByRole('heading', { name: /^my audits$/i }),
  noAuditsNotice: () => cy.contains(/you have no audit tasks assigned right now/i),
  refreshButton: () => cy.findByRole('button', { name: /^refresh$/i }),
  /** Each assigned audit is a clickable Card carrying its name. */
  auditCard: (name) => cy.contains('.MuiCard-root', name),
  auditCards: () => cy.get('.MuiCard-root'),

  // ── Step: my bins for one audit ─────────────────────────────────────────
  noBinsNotice: () => cy.contains(/no bins are assigned to you in this audit/i),
  /** A bin card, addressed by the location code it shows. */
  binCard: (code) => cy.contains('.MuiCard-root', code),
  binCards: () => cy.get('.MuiCard-root'),
  startCountingButton: (code) =>
    workerCountLocators.binCard(code).findByRole('button', { name: /start counting/i }),
  continueCountingButton: (code) =>
    workerCountLocators.binCard(code).findByRole('button', { name: /continue counting/i }),
  startRecountButton: (code) =>
    workerCountLocators.binCard(code).findByRole('button', { name: /start recount/i }),
  doneChip: (code) => workerCountLocators.binCard(code).contains(/^done$/i),

  // ── Step: locate a bin by label ─────────────────────────────────────────
  //
  // OPENING AN AUDIT DOES NOT SHOW ITS BINS. It lands on this locate step, because
  // the handheld assumes the worker is standing somewhere and wants to say where:
  // three tappable CARDS — "Scan a location", "Scan a container", "Choose from the
  // list". Bins appear only after a location is chosen. Verified against the
  // rendered screen on 2026-08-20; the page object's `openAuditBins()` walks it.
  //
  // They are Cards, NOT buttons — the only <button>s on this step are the app bar's.
  locateCard: (label) => cy.contains('.MuiCard-root', label),
  scanLocationCard: () => cy.contains('.MuiCard-root', /^scan a location/i),
  chooseFromListCard: () => cy.contains('.MuiCard-root', /choose from the list/i),
  /** The browse step lists the worker's own locations, one Card each. */
  locationGroupCards: () => cy.get('.MuiCard-root'),

  locateInput: () => cy.findByPlaceholderText(/scan (location qr|container code)/i),
  findMyBinsButton: () => cy.findByRole('button', { name: /find my bins/i }),
  chooseFromListButton: () => cy.findByRole('button', { name: /label missing\? choose from the list/i }),

  // ── Step: count a bin ───────────────────────────────────────────────────
  /** Where scans are filed — "Found items are filed into location|container". */
  filingTargetCaption: () => cy.contains(/found items are filed into (location|container)/i),
  filingTargetValue: () => cy.contains(/found items are filed into/i).parent().find('h6, .MuiTypography-subtitle1'),
  containerModeChip: () => cy.contains('.MuiChip-root', /^container$/i),
  locationModeChip: () => cy.contains('.MuiChip-root', /^location$/i),

  // ── The ambiguous-scan picker (common/MultipleMatchesDialog) ────────────
  //
  // Opens on a 409 MULTIPLE_MATCHES_FOUND. Titled "Confirm Match" for ONE candidate
  // and "Multiple Matches Found" for several — a lone candidate still asks, because
  // the backend only returns one when it matched on a rung it will not apply
  // unattended (CONFIRM_MATCH_PRIORITY, worker-count.service.ts:3078).
  matchDialog: () => cy.get('[role="dialog"]').filter(':contains("Match")'),
  matchDialogTitle: () => workerCountLocators.matchDialog().find('h6').first(),
  /** One row per stored candidate, plus the "Use as-is" row on a Location audit. */
  matchOption: (text) => workerCountLocators.matchDialog().contains('[role="button"], li', text),
  useAsIsOption: () => workerCountLocators.matchDialog().contains('.MuiChip-root', /use as-is/i),
  matchSelectButton: () => workerCountLocators.matchDialog().contains('button', /^select$/i),

  serialInput: () => cy.findByPlaceholderText(/scan serial number/i),
  addScanButton: () => cy.findByRole('button', { name: /^add$/i }),

  /** The banner describing the most recent scan (severity varies by outcome). */
  lastScanBanner: () => cy.get('.MuiAlert-root').filter(':visible').first(),

  /**
   * The placement offer. `findAllByRole(...).first()`, NOT `findByRole` — the offer
   * is rendered TWICE on purpose: once in the last-scan banner and once on the scan
   * ROW, because "scanning the next serial used to be enough to lose the only way to
   * move the previous one" (see the comment above `scanRowOffer` in
   * Frontend/src/components/ABC/worker/index.tsx). `findByRole` throws on the second
   * match, so the duplication that is the FEATURE looked like a locator failure.
   */
  placeHereButton: () => cy.findAllByRole('button', { name: /^place here$/i }).first(),
  moveHereButton: () => cy.findAllByRole('button', { name: /^move here$/i }).first(),

  /** "Scanned here (N)" — the running tally the merge keeps up to date. */
  tallyHeading: () => cy.contains(/^scanned here \(\d+\)$/i),
  showAllScansButton: () => cy.findByRole('button', { name: /show all \d+/i }),
  showRecentButton: () => cy.findByRole('button', { name: /show recent/i }),
  emptyScanLogNote: () => cy.contains(/everything you scan in this bin is listed here/i),

  /**
   * One scan row, addressed by its serial.
   *
   * NOT `cy.contains('.MuiStack-root', serial)`. The most recent serial also appears
   * in the LAST-SCAN BANNER, which sits above the log inside the same Card and is
   * earlier in the document — so that form matched the banner's Stack, which has no
   * delete control, and `removeScan` failed with "never found DeleteOutlineIcon".
   *
   * Identified instead by what a row actually IS: a Stack that carries the serial AND
   * a delete button, and is not inside the banner's Alert.
   */
  scanRow: (serial) =>
    cy
      .get('.MuiStack-root')
      .filter((_i, el) => {
        const $el = Cypress.$(el);
        return (
          $el.closest('.MuiAlert-root').length === 0 &&
          $el.find('button').length > 0 &&
          $el.text().includes(serial)
        );
      })
      // LAST, not first: the wrapper Stack holding every row also contains this
      // serial and buttons, and an ancestor precedes its descendant in document
      // order — so the last match is the row itself.
      .last(),
  /**
   * The scan-log rows, newest first.
   *
   * Identified exactly the way `scanRow` identifies one: a Stack outside the
   * last-scan banner's Alert that carries a delete button. Two traps live here and
   * both were hit before this settled:
   *
   *  1. A bare `cy.get('.MuiTypography-body2')` is page-wide. It read correctly while
   *     the fixture held two serials and nothing else rendered in that class, then
   *     started resolving to a non-row node once the seeded fixture made the screen
   *     richer.
   *  2. A row's FIRST `body2` is its serial, but the wrapper Stack that holds every
   *     row also matches the filter — and an ancestor precedes its descendants in
   *     document order, so `.first()` on the raw match set is the wrapper, whose
   *     first `body2` may be a product caption ("Product 228446674").
   *
   * `.filter()` + `children('button')` keeps only true rows (the wrapper's buttons
   * are nested deeper, not direct children), so index 0 is the newest scan.
   */
  scanLogRows: () =>
    cy.get('.MuiStack-root').filter((_i, el) => {
      const $el = Cypress.$(el);
      return (
        $el.closest('.MuiAlert-root').length === 0 &&
        $el.children('button').length > 0 &&
        $el.children().find('.MuiTypography-body2').length > 0
      );
    }),

  scanRows: () =>
    cy.get('.MuiStack-root').filter((_i, el) => Cypress.$(el).find('button').length > 0),
  /**
   * The row's delete control — its FIRST button.
   *
   * NOT `svg[data-testid="DeleteOutlineIcon"]`: `@mui/icons-material` only emits
   * `data-testid` in a development build, and QA serves a production one, so that
   * selector matches nothing there. The row renders the delete IconButton before the
   * optional "Move here"/"Place here" button, so `first()` is the delete one.
   */
  removeScanButton: (serial) => workerCountLocators.scanRow(serial).find('button').first(),

  // Scan-result chips — the worker-facing vocabulary (ScanRowChips).
  //
  // `cy.contains(selector, text)`, NOT `cy.get(selector).contains(text)`. The second
  // form scopes the search to the FIRST element of the subject, so with several chips
  // on screen it only ever looked inside the audit-status chip and reported "never
  // found" for a chip that was plainly rendered two nodes away.
  chip: (label) => cy.contains('.MuiChip-root', label),

  // Non-serial quantity entry. The field commits on BLUR, not on Enter.
  quantitySectionTitle: () => cy.contains(/^enter counted quantity$/i),
  noNonSerialNote: () => cy.contains(/no non-serial products expected here/i),
  /** The quantity input on the row for this product name. */
  quantityInput: (productName) =>
    workerCountLocators.nonSerialRow(productName).find('input[type="number"]'),
  // The non-serial row is: [icon] [Box: name + "Expected N"] [qty field] [not-found
  // button] — all direct children of ONE row Stack (worker/index.tsx:1933).
  //
  // So the row is `.parents('.MuiStack-root')` from the NAME, and both the caption
  // and the button live under it — but NOT under the name's own parent, which is
  // only the inner name+chip Stack. Anchoring on `.parent()` searched that inner
  // Stack and found neither, which is why TC21 and TC22 timed out looking for text
  // and an icon that were both on the page.
  //
  // `.first()` on the parents chain is wrong too: MUI nests Stacks, so the first
  // match walking UP from the name is the innermost one. Filter for the Stack that
  // actually holds the quantity input instead.
  nonSerialRow: (productName) =>
    cy
      .contains('.MuiStack-root', productName)
      .parents('.MuiStack-root')
      .filter((_, el) => el.querySelector('input[type="number"]') !== null)
      .first(),

  /**
   * The row's "I looked — this product isn't here" control.
   *
   * Addressed by STRUCTURE, not by `svg[data-testid="SearchOffIcon"]`, for the same
   * reason as `removeScanButton` above: `@mui/icons-material` emits `data-testid`
   * only in a development build and QA serves a production one, so that selector
   * matches nothing there. The row renders exactly one IconButton — the not-found
   * one, and only on a Location audit (worker/index.tsx:1957) — after the quantity
   * field, so the row's last button is it.
   */
  notFoundButton: (productName) =>
    workerCountLocators.nonSerialRow(productName).find('button').last(),

  notFoundChip: () => cy.contains('.MuiChip-root', /^not found$/i),
  expectedCaption: (productName) =>
    workerCountLocators.nonSerialRow(productName).contains(/^expected \d+$/i),

  addProductButton: () => cy.findByRole('button', { name: /add a product/i }),
  productSearchInput: () => cy.findByPlaceholderText(/search products by name/i),

  submitCountButton: () => cy.findByRole('button', { name: /^submit count$/i }),

  // ── Dialogs ─────────────────────────────────────────────────────────────
  submitConfirmDialog: () => cy.contains(/submit with uncounted products\?/i),
  placementDialog: () => cy.contains(/(move|place) this item here\?/i),
  confirmPlacementButton: () => cy.findByRole('button', { name: /confirm (move|placement)/i }),
  skipPlacementButton: () => cy.findByRole('button', { name: /^skip$/i }),
  addProductDialogTitle: () => cy.contains(/^add a product$/i),
  /** The multiple-matches picker shared with the stock-in screens. */
  matchesDialog: () => cy.findByRole('dialog'),
};

export default workerCountLocators;
