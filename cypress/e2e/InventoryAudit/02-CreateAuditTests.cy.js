// cypress/e2e/InventoryAudit/02-CreateAuditTests.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md  (§9.1.2, TC43–TC69)
// Components: Frontend/src/components/ABC/CreateAudit.tsx
//             Frontend/src/components/ABC/LocationScopePicker.tsx
// API mirror:  cypress/e2e/api/AuditManagementAPI.cy.js (SW-IAUD-API-TC25..45)
//
// The backend's create rules (auditType×abcClass, name/worker boundaries, both
// 409s) belong to the API spec. What this spec owns is the FORM: which fields
// appear for which audit type, when submit unlocks, what the four preview states
// say, and that a server refusal reaches a toast with its own words.
//
// The location tree, the worker roster and the preview are stubbed (plan §6.5):
// the scope picker's four states and the preview's four states cannot be
// arranged against a live warehouse, and the drill-down would depend on whatever
// hierarchy QA happens to hold. The one live path — a real create — is TC63.

import CreateAuditPage from '../../pageObjects/InventoryAudit/createAuditPage';
import AuditsListPage from '../../pageObjects/InventoryAudit/auditsListPage';
import {
  stubWorkers,
  stubPreview,
  stubPreviewFailure,
  stubLocations,
  stubCreateSuccess,
  stubCreateConflict,
  uniqueAuditName,
  cancelAudit,
  probeAuditableScope,
} from '../../support/InventoryAudit/auditHelpers';
import data from '../../fixtures/InventoryAudit/createAudit.json';

describe('Inventory Audit — Create audit', { tags: ['@regression'] }, () => {
  const page = new CreateAuditPage();
  const list = new AuditsListPage();

  /** Escape a value taken from LIVE data before it becomes a regex (TC63). */
  const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * Drill the scope picker down a probed location's own path.
   *
   * The picker only ever offers the CURRENT level's children, so a nested scope has
   * to be reached one level at a time — jumping straight to its label finds nothing
   * at the root. `path` is the dot-joined chain of location CODES, which is that
   * order exactly.
   *
   * Matched on the CODE as a whole word — NOT on the name, and NOT on `(CODE)`.
   * `LocationScopePicker.labelOf` renders `Name (CODE) · Type` only when the node HAS
   * a name; a nameless one renders `CODE · Type` with no brackets at all, and
   * requiring the brackets stalled the drill at `R-001` (observed on QA 2026-08-20).
   * The word boundaries stop `R-001` also matching `R-0012`, and matching the code
   * rather than the name keeps a live name like "Bay 1 (North)" from being read as a
   * regex group.
   */
  const drillToProbedScope = (scope) => {
    const codes = String(scope.path || scope.code || '').split('.').filter(Boolean);
    expect(codes, 'the probe must report a drillable path or code').to.have.length.at.least(1);
    const edge = '[^A-Za-z0-9_-]';
    codes.forEach((code) =>
      page.drillIntoScope(new RegExp(`(^|${edge})${escapeRegExp(code)}(${edge}|$)`))
    );
  };

  /** Facility → Zone drill labels, as LocationScopePicker renders them. */
  const FACILITY = 'Facility 02 (F-02) · Facility';
  const ZONE = 'Zone 01 (Z-01) · Zone';
  const BIN = 'Bin A1 (BN-A1) · Bin';

  /** Stub the whole read surface the screen depends on. */
  const stubReads = (preview = data.preview.dtAbcPopulated) => {
    stubWorkers(data.workers.epTwoWorkers);
    stubLocations(data.locations);
    stubPreview(preview);
  };

  beforeEach(() => {
    cy.authSession('admin');
  });

  // ==========================================================================
  // Chrome & the submit gate
  // ==========================================================================

  // Use case — the screen opens and can be left again
  it('SW-IAUD-TC43: the create screen opens and Back returns to the list', { tags: ['@smoke'] }, () => {
    stubReads();
    list.visit().clickCreateAudit();
    page.assertOnCreateRoute();
    page.goBack();
    list.assertOnAuditsRoute();
  });

  // EP — the submit gate unlocks only when every required field is supplied
  it('SW-IAUD-TC44: Create stays disabled until name, class, scope and a worker are supplied', () => {
    stubReads();
    page.visit().assertSubmitDisabled();
    page.assertSubmitHint(/name, class, location scope and at least one worker are required/i);

    page.enterName(uniqueAuditName('gate')).assertSubmitDisabled();
    page.selectClass(data.abcClass.epClassA).assertSubmitDisabled();
    page.drillIntoScope(FACILITY).assertSubmitDisabled();
    page.selectWorker('Alice Anderson').assertSubmitEnabled();
  });

  // ==========================================================================
  // Name validation
  // ==========================================================================

  // BVA — the maximum valid name length
  it('SW-IAUD-TC45: a 150-character name is accepted without a validation error', () => {
    stubReads();
    page.visit().enterNameOfLength(data.name.bvaUpperValid);
    page.readNameLength().should('eq', data.name.bvaUpperValid);
    page.assertNameValid();
  });

  // BVA — one over the maximum
  it('SW-IAUD-TC46: a 151-character name is rejected and keeps Create disabled', () => {
    stubReads();
    page.visit().enterNameOfLength(data.name.bvaUpperInvalid);
    // The input allows MAX_NAME + 1 precisely so the error is observable.
    page.readNameLength().should('eq', data.name.bvaUpperInvalid);
    page.assertNameError(`Max ${data.name.bvaUpperValid} characters`);
    page.assertSubmitDisabled();
  });

  // Error guessing — a name that is only whitespace must read as missing
  it('SW-IAUD-TC47: a whitespace-only name is treated as missing', () => {
    stubReads();
    page.visit().enterName(data.name.epWhitespaceOnly);
    page.assertNameError('Audit name is required');
    page.assertSubmitDisabled();
  });

  // ==========================================================================
  // The audit-type branch
  // ==========================================================================

  // Decision table — Abc asks for a class and not for assign-on-scan
  it('SW-IAUD-TC48: an ABC audit asks for a class and hides assign-on-scan', () => {
    stubReads();
    page.visit().selectAuditType('Abc');
    page.assertAuditTypeSelected('Abc');
    page.assertClassSelectVisible().assertAssignOnScanAbsent();
    page.assertTypeCaption(/targets a single abc class within a location scope/i);
  });

  // Decision table — Location asks for assign-on-scan and not for a class
  it('SW-IAUD-TC49: a Location audit asks for assign-on-scan, defaulted on, and hides the class', () => {
    stubReads();
    page.visit().selectAuditType('Location');
    page.assertAuditTypeSelected('Location');
    page.assertAssignOnScanVisible().assertAssignOnScanChecked(true);
    page.assertClassSelectAbsent();
    page.assertTypeCaption(/counts every product physically found at the location/i);
  });

  // EP — the off partition of the switch, and the copy that explains it
  it('SW-IAUD-TC50: turning assign-on-scan off says what that means', () => {
    stubReads();
    page.visit().selectAuditType('Location');
    page.toggleAssignOnScan().assertAssignOnScanChecked(false);
    page.assertAssignOnScanLabel('Off — count only');
    cy.contains(/nothing is written to the warehouse location model/i).should('be.visible');
  });

  // ==========================================================================
  // Location scope picker
  // ==========================================================================

  // Use case — drilling builds a breadcrumb whose last chip is the scope
  it('SW-IAUD-TC51: drilling the picker builds a breadcrumb ending in the active scope', () => {
    stubReads();
    page.visit();
    page.drillIntoScope(FACILITY).assertBreadcrumbCount(1).assertBreadcrumbChipText(0, 'Facility 02');
    page.drillIntoScope(ZONE).assertBreadcrumbCount(2).assertBreadcrumbChipText(1, 'Zone 01');
    page.assertActiveScopeIsLastChip();
  });

  // Use case — resetting clears the scope and re-locks submit
  it('SW-IAUD-TC52: the All link resets the trail and clears the scope', () => {
    stubReads();
    page.visit().enterName(uniqueAuditName('reset')).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).drillIntoScope(ZONE);
    page.selectWorker('Alice Anderson').assertSubmitEnabled();
    page.resetScope().assertBreadcrumbEmpty().assertSubmitDisabled();
  });

  // Use case — clicking an earlier chip pops the trail back to it
  it('SW-IAUD-TC53: clicking an earlier breadcrumb chip pops the trail back to that level', () => {
    stubReads();
    page.visit();
    page.drillIntoScope(FACILITY).drillIntoScope(ZONE).drillIntoScope(BIN).assertBreadcrumbCount(3);
    page.popBreadcrumbTo(0).assertBreadcrumbCount(1).assertBreadcrumbChipText(0, 'Facility 02');
    page.assertActiveScopeIsLastChip();
  });

  // EP — the leaf partition ends the drill-down
  it('SW-IAUD-TC54: selecting a leaf bin ends the drill-down with a note', () => {
    stubReads();
    page.visit().drillIntoScope(FACILITY).drillIntoScope(ZONE).drillIntoScope(BIN);
    page.assertLeafBinNote();
  });

  // ==========================================================================
  // Live preview — four states
  // ==========================================================================

  // EP — the not-ready partition: no request until class AND scope exist
  it('SW-IAUD-TC55: the preview waits for a class and a scope', () => {
    stubWorkers(data.workers.epTwoWorkers);
    stubLocations(data.locations);
    cy.intercept('GET', '**/inventory-audits/preview*', cy.spy().as('previewSpy'));
    page.visit().assertPreviewPlaceholder();
    page.selectClass(data.abcClass.epClassA);
    // A class alone is not enough — the scope is required too.
    page.assertPreviewPlaceholder();
    cy.get('@previewSpy').should('not.have.been.called');
  });

  // EP — the ready partition: one debounced request, four tiles
  it('SW-IAUD-TC56: the preview reports what the audit would include', { tags: ['@smoke'] }, () => {
    stubReads(data.preview.dtAbcPopulated);
    const p = data.preview.dtAbcPopulated;
    page.visit().selectClass(data.abcClass.epClassA).drillIntoScope(FACILITY);
    cy.wait('@preview');
    page.assertPreviewTile('Bins', p.binCount);
    page.assertPreviewTile('Products to count', p.lineCount);
    page.assertPreviewTile('Expected units', p.totalExpectedUnits);
    page.assertPreviewTile('Serialized', p.serializedUnits);
  });

  // Decision table — a Location audit previews every bin it will WALK
  it('SW-IAUD-TC57: a Location audit previews bins to walk, not bins holding inventory', () => {
    stubReads(data.preview.dtLocationBinsToWalk);
    const p = data.preview.dtLocationBinsToWalk;
    page.visit().selectAuditType('Location').drillIntoScope(FACILITY);
    cy.wait('@preview');
    page.assertPreviewTileCaptionPresent('Bins to walk');
    page.assertPreviewTileCaptionAbsent('Bins to count');
    page.assertPreviewTile('Bins to walk', p.scopeBinCount);
    // The distinction that matters: it reports the scope's bins, not binCount.
    expect(p.scopeBinCount, 'fixture must make the two numbers differ').to.not.eq(p.binCount);
  });

  // EP — the zero-result partition raises the type-specific warning
  it('SW-IAUD-TC58: a scope that would generate no bins raises a warning', () => {
    stubReads(data.preview.dtAbcEmpty);
    page.visit().selectClass(data.abcClass.epClassA).drillIntoScope(FACILITY);
    cy.wait('@preview');
    page.assertPreviewEmptyWarning();
    cy.contains(new RegExp(`no binned inventory of class ${data.abcClass.epClassA}`, 'i')).should('be.visible');
  });

  // Decision table — bins exist but hold nothing recorded yet
  it('SW-IAUD-TC59: a Location scope with unmapped bins says every scan will be new', () => {
    stubReads(data.preview.dtLocationUnmapped);
    page.visit().selectAuditType('Location').drillIntoScope(FACILITY);
    cy.wait('@preview');
    page.assertPreviewUnmappedInfo();
  });

  // Error guessing — the preview failure path must not block the create
  it('SW-IAUD-TC60: a failed preview is reported and leaves Create usable', () => {
    stubWorkers(data.workers.epTwoWorkers);
    stubLocations(data.locations);
    stubPreviewFailure();
    page.visit().enterName(uniqueAuditName('pvfail')).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@previewFail');
    page.assertPreviewError().assertSubmitEnabled();
  });

  // ==========================================================================
  // Empty-scope confirmation
  // ==========================================================================

  // Use case — the guard rail fires and "Go back" sends nothing
  it('SW-IAUD-TC61: creating against an empty scope needs a deliberate confirmation', () => {
    stubReads(data.preview.dtAbcEmpty);
    cy.intercept('POST', '**/inventory-audits', cy.spy().as('createSpy'));
    page.visit().enterName(uniqueAuditName('empty')).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@preview');
    page.submit();
    page.assertEmptyScopeDialogOpen();
    page.dismissEmptyScopeDialog();
    cy.get('@createSpy').should('not.have.been.called');
  });

  // Use case — confirming submits anyway
  it('SW-IAUD-TC62: Create anyway submits despite the empty scope', () => {
    stubReads(data.preview.dtAbcEmpty);
    stubCreateSuccess({}, 'createOk');
    page.visit().enterName(uniqueAuditName('anyway')).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@preview');
    page.submit();
    page.assertEmptyScopeDialogOpen();
    page.createAnyway();
    cy.wait('@createOk');
  });

  // ==========================================================================
  // Submit — success and the two server refusals
  // ==========================================================================

  // Use case — the happy path, LIVE. Seeded scope, real create, cancelled after.
  it('SW-IAUD-TC63: a complete form creates the audit and lands on it', { tags: ['@smoke'] }, function () {
    const name = uniqueAuditName('live');
    let token;
    let createdId;

    cy.login().then((t) => {
      token = t;
    });

    cy.then(() =>
      probeAuditableScope(token).then((scope) => {
        if (!scope) this.skip(); // QA holds no bin-bearing location — see pending.md

        // Real workers, real locations, real preview — only the create is watched.
        cy.intercept('POST', '**/inventory-audits').as('createLive');
        page.visit();
        page.enterName(name).selectAuditType('Abc').selectClass(data.abcClass.epClassA);
        // Drill the whole chain from the root — see drillToProbedScope().
        drillToProbedScope(scope);
        // Any worker from the live roster — naming one would couple this to tenant data.
        page.selectFirstWorker();
        page.submit();

        // The probe picks a bin for holding countable stock, not for holding stock
        // of THIS class — so an ABC audit over it legitimately previews zero bins and
        // the empty-scope confirmation intercepts the submit before anything is sent.
        // Confirm it when it appears; TC61/TC62 are what test the dialog itself.
        page.emptyScopeDialogIsOpen().then((open) => {
          if (open) page.createAnyway();
        });

        cy.wait('@createLive').then(({ request, response }) => {
          expect(response.statusCode, 'the live create must be accepted').to.be.oneOf([200, 201]);
          // The request carries exactly what the form showed.
          expect(request.body.name, 'the name the form held').to.eq(name);
          expect(request.body.auditType, 'the type the form held').to.eq('Abc');
          expect(request.body.abcClass, 'the class the form held').to.eq(data.abcClass.epClassA);
          expect(request.body.workers, 'at least the one selected worker').to.have.length.at.least(1);

          createdId = response.body?.data?.id;
          page.assertToast(new RegExp(`Audit "${name}" created`));
          page.assertToast(/generating count tasks/i);
          cy.location('pathname').should('eq', `/abc/audits/${createdId}`);
        });
      })
    );

    // State restoration — cancel is the only terminal state reachable here.
    cy.then(() => cancelAudit(token, createdId));
  });

  // Decision table — generationQueued false drops the clause from the toast
  it('SW-IAUD-TC64: a create whose generation was not queued omits that clause', () => {
    const name = uniqueAuditName('noqueue');
    stubReads();
    stubCreateSuccess({ generationQueued: false }, 'createOk');
    page.visit().enterName(name).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@preview');
    page.submit();
    cy.wait('@createOk');
    page.assertToast(new RegExp(`Audit "${name}" created`));
    page.assertNoToastMatching(/generating count tasks/i);
  });

  // Error guessing — the duplicate-name conflict reaches the toast verbatim.
  // The stub puts the sentence in details[0], where the Conflict filter puts it —
  // a stub that used error.message would not exercise auditErrorMessage at all.
  it('SW-IAUD-TC65: a duplicate active name keeps the user on the form with the server message', () => {
    stubReads();
    stubCreateConflict(data.conflicts.egDuplicateName, 'conflict');
    page.visit().enterName('cy-dup').selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@preview');
    page.submit();
    cy.wait('@conflict');
    page.assertToast(/already exists/i);
    page.assertOnCreateRoute();
    // The entered values survive the refusal.
    cy.findByLabelText(/audit name/i).should('have.value', 'cy-dup');
  });

  // Error guessing — the scope-overlap conflict names the blocking audit
  it('SW-IAUD-TC66: an overlapping live scope names the blocking audit', () => {
    stubReads();
    stubCreateConflict(data.conflicts.egScopeOverlap, 'overlap');
    page.visit().enterName(uniqueAuditName('overlap')).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@preview');
    page.submit();
    cy.wait('@overlap');
    page.assertToast(new RegExp(data.conflicts.egScopeOverlap.auditName));
    page.assertToast(/close or cancel that audit first/i);
  });

  // ==========================================================================
  // Workers & strategy
  // ==========================================================================

  // EP — the roster comes from the workers endpoint and filters on e-mail text
  it('SW-IAUD-TC67: workers are chosen from the identity roster and filter on e-mail', () => {
    stubReads();
    page.visit();
    cy.wait('@workers');
    page.typeWorkerFilter(data.workers.epEmailFragment).then((options) => {
      expect(options, 'typing an e-mail fragment narrows the roster').to.have.length(1);
      expect(options[0], 'the one roster entry whose e-mail matches the fragment').to.contain('Bob Brown');
    });
    // The filtered list holds exactly one row — take it, then add a second by name.
    page.pickFirstListedWorker();
    page.selectWorker('Alice Anderson');
    page.assertWorkerChipCount(2);
  });

  // EP — the strategy select offers both labels and sends the chosen one
  it('SW-IAUD-TC68: Bin Assignment offers both strategies and sends the chosen one', () => {
    stubReads();
    stubCreateSuccess({}, 'createOk');
    page.visit();
    page.readStrategyOptions().then((options) => {
      expect(options, 'both strategies are offered, in render order').to.deep.eq([
        'Auto assignment',
        'Manual (assign bins later)',
      ]);
    });
    page.selectStrategy('Manual');
    page.enterName(uniqueAuditName('strat')).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@preview');
    page.submit();
    cy.wait('@createOk').its('request.body.assignmentStrategy').should('eq', 'Manual');
  });

  // Error guessing — script content in a free-text field must round-trip inert
  it('SW-IAUD-TC69: a script tag in the name round-trips as inert text', () => {
    const name = data.name.egScriptTag;
    stubReads();
    stubCreateSuccess({ id: 909, name }, 'createOk');
    // Any script that executed would raise an uncaught exception or alter the DOM;
    // assert on the rendered text instead of trusting the absence of a crash.
    cy.on('window:alert', () => {
      throw new Error('an alert() fired — the audit name was executed, not escaped');
    });
    page.visit().enterName(name).selectClass(data.abcClass.epClassA);
    page.drillIntoScope(FACILITY).selectWorker('Alice Anderson');
    cy.wait('@preview');
    page.submit();
    cy.wait('@createOk');
    // The toast renders the raw characters as text.
    page.assertToast(/<script>/);
  });
});
