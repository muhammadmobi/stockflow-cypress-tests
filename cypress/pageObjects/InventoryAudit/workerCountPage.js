// cypress/pageObjects/InventoryAudit/workerCountPage.js
//
// Page object for the mobile worker count screen at /MobileViewScreen/abc/audits
// (cypress/e2e/InventoryAudit/06-WorkerCountMobileTests.cy.js).
// Component: Frontend/src/components/ABC/worker/index.tsx
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md §9.5, §6.6

import L from '../../support/locators/InventoryAudit/workerCountLocators';

const WORKER_ROUTE = '/MobileViewScreen/abc/audits';

class WorkerCountPage {
  /**
   * Open the worker screen at a handheld viewport.
   *
   * The viewport is set HERE rather than in the runner config: the screen branches
   * on an `md` breakpoint, so a full-suite run at 1920×1080 would silently
   * exercise a different layout (plan §8 risk 16).
   */
  visit() {
    cy.viewport('iphone-x');
    cy.visit(WORKER_ROUTE);
    return this;
  }

  assertOnAuditsStep() {
    L.auditsHeader().should('be.visible');
    return this;
  }

  assertNoAuditsAssigned() {
    L.noAuditsNotice().should('be.visible');
    return this;
  }

  assertAuditListed(name) {
    L.auditCard(name).should('be.visible');
    return this;
  }

  assertAuditNotListed(name) {
    cy.contains('.MuiCard-root', name).should('not.exist');
    return this;
  }

  /**
   * Whether a named audit appears on the worker's list. Yields a boolean rather
   * than asserting: an audit with nothing left assigned may legitimately drop off
   * the list OR remain and explain the emptiness, and both are correct — so the
   * branch belongs to the caller, not here.
   */
  auditIsListed(name) {
    return cy.get('body').then(($body) => $body.text().includes(name));
  }

  openAudit(name) {
    L.auditCard(name).click();
    return this;
  }

  /**
   * Open an audit AND walk through to its bin list.
   *
   * Opening an audit lands on the LOCATE step, not on the bins — see the note in
   * the locator file. "Choose from the list" is the no-label path, and it is the
   * one a test can drive deterministically (the other two want a scanned QR).
   *
   * Tolerates having no locations: an audit with nothing assigned to this worker
   * shows the "no bins are assigned to you" alert on the browse step instead of a
   * list, which is exactly what MOB-TC02 asserts.
   */
  openAuditBins(name) {
    this.openAudit(name);
    L.chooseFromListCard().click();
    cy.get('body').then(() => {
      if (Cypress.$('.MuiCard-root').length) L.locationGroupCards().first().click();
    });
    return this;
  }

  /**
   * Find the worker's bins by SCANNING a location label, the other path off the
   * locate step.
   *
   * The scan field does not exist until a scan card is tapped — `locateMode` is
   * null on arrival and `renderLocateScan()` is what draws the input
   * (worker/index.tsx:307, 1275). So the card click is the step, not a nicety.
   */
  locateByScanningLocation(code) {
    L.scanLocationCard().click();
    L.locateInput().should('be.visible').type(code, { delay: 0 });
    L.findMyBinsButton().click();
    return this;
  }

  /**
   * Find the bins by scanning a CONTAINER label.
   *
   * Not merely a different wording of `locateByScanningLocation`: what was scanned
   * here decides where the count files its finds. A container QR is carried through
   * as `pendingContainer` and becomes the filing target on the count screen, when
   * that container is parked in the bin being counted and the audit assigns on scan
   * (worker/index.tsx:546-553). One field serves both modes — `universal-scan`
   * identifies what was scanned — so the mode only picks the wording.
   */
  locateByScanningContainer(code) {
    L.locateCard(/^scan a container/i).click();
    L.locateInput().should('be.visible').type(code, { delay: 0 });
    L.findMyBinsButton().click();
    return this;
  }

  // ── Bin list ────────────────────────────────────────────────────────────

  assertNoBinsAssigned() {
    L.noBinsNotice().should('be.visible');
    return this;
  }

  assertBinListed(code) {
    L.binCard(code).should('be.visible');
    return this;
  }

  assertBinSummary(code, { products, expected }) {
    L.binCard(code)
      .should('contain.text', `${products} product`)
      .and('contain.text', `expected ${expected}`);
    return this;
  }

  assertBinDone(code) {
    L.doneChip(code).should('be.visible');
    return this;
  }

  assertBinOffersStart(code) {
    L.startCountingButton(code).should('be.visible');
    return this;
  }

  assertBinOffersContinue(code) {
    L.continueCountingButton(code).should('be.visible');
    return this;
  }

  startCounting(code) {
    L.startCountingButton(code).click();
    return this;
  }

  continueCounting(code) {
    L.continueCountingButton(code).click();
    return this;
  }

  // ── Count step ──────────────────────────────────────────────────────────

  assertOnCountStep() {
    L.serialInput().should('be.visible');
    return this;
  }

  assertFilingTarget(kind, value) {
    L.filingTargetCaption().should('contain.text', kind);
    if (value) L.filingTargetValue().should('contain.text', value);
    return this;
  }

  /**
   * Scan a serial the way a barcode wedge does: the value and its Enter arrive
   * back-to-back with no human pause.
   *
   * `cy.type('X{enter}')` is close enough for a single scan, but NOT for the
   * back-to-back case (MOB-TC07): Cypress types character by character and each
   * keystroke lets React commit, which is exactly the race the component guards
   * against. So the value is written straight onto the DOM node and the events
   * dispatched — no per-character delay, no commit window. A test that needs an
   * artificial pause to pass is not testing the mechanic.
   */
  scanWithWedge(serial) {
    L.serialInput().then(($input) => {
      const el = $input[0];
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(el, serial);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
      );
    });
    return this;
  }

  /** Two barcodes with no gap — the second must not re-submit the first. */
  scanTwoWithoutPause(firstSerial, secondSerial) {
    this.scanWithWedge(firstSerial);
    this.scanWithWedge(secondSerial);
    return this;
  }

  /** The ordinary path: type it and press the button. */
  scanViaButton(serial) {
    L.serialInput().clear().type(serial, { delay: 0 });
    L.addScanButton().click();
    return this;
  }

  assertScanFieldEmpty() {
    L.serialInput().should('have.value', '');
    return this;
  }

  /** The "Scanned here (N)" count currently on screen. */
  readTally() {
    return L.tallyHeading()
      .invoke('text')
      .then((t) => Number((t.match(/\((\d+)\)/) || [])[1] ?? 0));
  }

  assertTally(count) {
    L.tallyHeading().should('contain.text', `(${count})`);
    return this;
  }

  assertScanRowPresent(serial) {
    L.scanRow(serial).should('be.visible');
    return this;
  }

  assertScanRowAbsent(serial) {
    cy.contains(serial).should('not.exist');
    return this;
  }

  /** The first (newest) serial in the scan log. */
  /**
   * The serial on the newest row of the scan log.
   *
   * Read from the ROW, not from the enclosing Card. The Card that holds the log
   * also holds the scan input and the last-scan banner (worker/index.tsx:1674-1919),
   * so `find('.MuiTypography-body2').first()` on it could resolve to a node that is
   * not a log row at all — which is how this reported the wrong serial as "newest".
   * `scanLogRows` identifies a row by what it IS and excludes the banner, and the
   * component renders the log newest-first, so the last matching Stack's first
   * `body2` is the newest scan's serial.
   */
  /**
   * Assert that `newer` sits ABOVE `older` in the scan log — i.e. the log is
   * newest-first.
   *
   * Expressed as a comparison between two KNOWN serials rather than "read whatever
   * is on top", because identifying "the newest row" structurally proved
   * unreliable: the wrapper Stack that holds every row matches the same shape as a
   * row, and its first `.MuiTypography-body2` is a product caption
   * ("Product 228446676"), not a serial. Four attempts at a structural selector
   * each read a different wrong node.
   *
   * `scanRow(serial)` is already proven in this file — it is what `removeScan`
   * uses — so comparing the two rows' document positions asks the question the test
   * actually cares about and borrows a locator that is known to resolve correctly.
   */
  assertScanOrder(newer, older) {
    L.scanRow(newer).then(($newer) => {
      L.scanRow(older).then(($older) => {
        const all = Cypress.$('.MuiStack-root').toArray();
        const iNewer = all.indexOf($newer[0]);
        const iOlder = all.indexOf($older[0]);
        expect(iNewer, `both scan rows are on screen (newer=${newer})`).to.be.greaterThan(-1);
        expect(iOlder, `both scan rows are on screen (older=${older})`).to.be.greaterThan(-1);
        expect(
          iNewer,
          `the scan log is newest-first: "${newer}" was scanned last so it must appear above "${older}"`
        ).to.be.lessThan(iOlder);
      });
    });
    return this;
  }

  assertScanChip(label) {
    L.chip(label).should('be.visible');
    return this;
  }

  assertLastScanBanner(pattern) {
    L.lastScanBanner().invoke('text').should('match', pattern);
    return this;
  }

  removeScan(serial) {
    L.removeScanButton(serial).click();
    return this;
  }

  showAllScans() {
    L.showAllScansButton().click();
    return this;
  }

  assertScanLogPaged() {
    L.showAllScansButton().should('be.visible');
    return this;
  }

  // ── Quantity entry (commits on blur) ────────────────────────────────────

  enterQuantity(productName, value) {
    L.quantityInput(productName).clear().type(String(value), { delay: 0 }).blur();
    return this;
  }

  assertQuantityValue(productName, value) {
    L.quantityInput(productName).should('have.value', String(value));
    return this;
  }

  assertExpectedQuantity(productName, expected) {
    L.expectedCaption(productName).should('contain.text', `Expected ${expected}`);
    return this;
  }

  markNotFound(productName) {
    L.notFoundButton(productName).click();
    return this;
  }

  assertNotFoundChip() {
    L.notFoundChip().should('be.visible');
    return this;
  }

  assertNoNonSerialProducts() {
    L.noNonSerialNote().should('be.visible');
    return this;
  }

  // ── Add a product ───────────────────────────────────────────────────────

  openProductPicker() {
    L.addProductButton().click();
    L.addProductDialogTitle().should('be.visible');
    return this;
  }

  searchProduct(term) {
    L.productSearchInput().clear().type(term, { delay: 0 });
    return this;
  }

  // ── Placement confirmation ──────────────────────────────────────────────

  assertPlacementOffered(kind) {
    if (kind === 'move') L.moveHereButton().should('be.visible');
    else L.placeHereButton().should('be.visible');
    return this;
  }

  /**
   * The correction was WITHHELD, and the screen says why.
   *
   * The opposite of `assertPlacementOffered('move')`: a serial whose current bin
   * belongs to another live audit is still reported as misplaced, but must not be
   * offered for relocation — `applyPlacement` would refuse it, and a button that
   * always fails is worse than the explanation (worker-count.service.ts:1013-1026).
   */
  assertPlacementWithheld(reason = /part of the open audit/i) {
    // NOT `L.moveHereButton().should('not.exist')`: that locator is
    // `findAllByRole`, which THROWS when nothing matches instead of yielding an
    // empty set, so the absence it is asserting can never be observed. A plain
    // `cy.get` with the accessible name filtered in jQuery yields zero elements
    // happily, which is what `not.exist` needs.
    cy.get('button')
      .filter((_, el) => /^move here$/i.test((el.textContent || '').trim()))
      .should('not.exist');
    cy.contains(reason).should('be.visible');
    return this;
  }

  /**
   * The ambiguous-scan picker is open.
   *
   * Both titles are accepted by default because WHICH one appears is a property of
   * the tenant's serial vocabulary, not of the behaviour under test: the dialog
   * reads "Confirm Match" for one candidate and "Multiple Matches Found" for
   * several (common/MultipleMatchesDialog.tsx:60). The claim is that the scan was
   * NOT applied silently — that the worker was asked — and that holds either way.
   * Pass 'single' or 'multiple' to pin one when a test controls the vocabulary.
   */
  assertMatchChooserOpen(kind = 'any') {
    L.matchDialog().should('be.visible');
    const expected =
      kind === 'single' ? /confirm match/i : kind === 'multiple' ? /multiple matches found/i : /confirm match|multiple matches found/i;
    L.matchDialogTitle().invoke('text').should('match', expected);
    return this;
  }

  /** The picker offers keeping the raw read, not just the system's guesses. */
  assertMatchChooserOffersUseAsIs() {
    L.useAsIsOption().should('be.visible');
    return this;
  }

  /** Pick a candidate row and confirm it. */
  chooseMatch(text) {
    L.matchOption(text).click();
    L.matchSelectButton().click();
    return this;
  }

  offerPlacement(kind) {
    if (kind === 'move') L.moveHereButton().click();
    else L.placeHereButton().click();
    return this;
  }

  confirmPlacement() {
    L.placementDialog().should('be.visible');
    L.confirmPlacementButton().click();
    return this;
  }

  skipPlacement() {
    L.skipPlacementButton().click();
    return this;
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  submitCount() {
    L.submitCountButton().click();
    return this;
  }

  assertUncountedConfirmation() {
    L.submitConfirmDialog().should('be.visible');
    return this;
  }

  // ── Toast ───────────────────────────────────────────────────────────────
  // A MUI Snackbar, NOT react-hot-toast — see the locator file's note.

  assertSnackbar(pattern) {
    L.snackbarText().should('match', pattern);
    return this;
  }
}

export default WorkerCountPage;
