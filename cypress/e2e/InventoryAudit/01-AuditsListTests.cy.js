// cypress/e2e/InventoryAudit/01-AuditsListTests.cy.js
//
// Test plan: cypress/qa/testPlans/inventoryAudit/plan.md  (§9.1.1, TC01–TC42, TC76–TC84)
// Component:  Frontend/src/components/ABC/AuditsList.tsx
// API mirror: cypress/e2e/api/AuditManagementAPI.cy.js (SW-IAUD-API-TC01..58)
//
// This spec asserts only what a user SEES. Every backend rule behind this screen
// — Joi shapes, the auditType×abcClass decision table, both 409s, the cancel
// gates — is owned by the API spec and is deliberately not duplicated here
// (SKILL §3, early-testing principle).
//
// Stub-driven where the condition cannot be arranged live (plan §6.5): no QA
// tenant can hold, at once, one audit mid-generation, one that generated zero
// bins, one with exactly one discrepancy and one with three workers — and none
// can be made to fail a request on cue. Chrome, navigation and the cancel round
// trip run live.

import AuditsListPage from '../../pageObjects/InventoryAudit/auditsListPage';
import {
  auditRow,
  stubAuditList,
  stubEmptyAuditList,
  stubCancelSuccess,
  stubCancelRefused,
} from '../../support/InventoryAudit/auditHelpers';
import data from '../../fixtures/InventoryAudit/auditsListRows.json';

describe('Inventory Audit — Audits list', { tags: ['@regression'] }, () => {
  const page = new AuditsListPage();

  /** Build the stub rows for a decision-table group. */
  const rows = (...partials) => partials.map((p) => auditRow(p));

  beforeEach(() => {
    cy.authSession('admin');
  });

  // ==========================================================================
  // Page chrome (live — asserts structure, so it is deterministic on any stack)
  // ==========================================================================

  // Use case — the actor-driven entry point
  it('SW-IAUD-TC01: audits list loads with its heading and primary actions', { tags: ['@smoke'] }, () => {
    page.visit().assertOnAuditsRoute().assertPageChrome();
  });

  // EP — the summary card row
  it('SW-IAUD-TC02: all five summary cards render and Accuracy is not yet computed', () => {
    page.visit().assertAllStatCardsRendered().assertAccuracyNotComputed();
  });

  // EP — the cards summarise the payload, not the page
  it('SW-IAUD-TC03: each summary card counts the loaded audits in its status', () => {
    const set = rows(
      data.actionGates.stOpen,
      { ...data.actionGates.stOpen, id: 5011, name: 'Gate - open 2' },
      data.actionGates.stInProgress,
      data.actionGates.stPendingReview,
      data.actionGates.stCompleted
    );
    stubAuditList(set);
    page.visitAndWait();
    page
      .assertStatCardValue('Open', 2)
      .assertStatCardValue('In Progress', 1)
      .assertStatCardValue('Pending Review', 1)
      .assertStatCardValue('Completed', 1);
  });

  // EP — the column contract
  it('SW-IAUD-TC04: the table renders every required column in order', { tags: ['@smoke'] }, () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA));
    page.visitAndWait().assertColumnOrder();
  });

  // EP — pagination footer
  it('SW-IAUD-TC05: the pagination footer reports the visible range and total', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait().assertRecordCounter(/Record:\s*1\s*-\s*2\s*of\s*2/);
  });

  // ==========================================================================
  // Conditional cells — decision tables driven by stubbed rows
  // ==========================================================================

  // Decision table — Bins cell, column 1 of 3 (generation still running)
  it('SW-IAUD-TC06: a Bins cell reads "Generating…" while generation is running', () => {
    stubAuditList(rows(data.binsCell.dtGenerating));
    page.visitAndWait().assertCellContains(0, 'Bins', 'Generating');
  });

  // Decision table — Bins cell, column 2 of 3 (finished, zero bins)
  it('SW-IAUD-TC07: a Bins cell warns when generation finished with nothing to count', () => {
    stubAuditList(rows(data.binsCell.dtGeneratedEmpty));
    page.visitAndWait().assertCellContains(0, 'Bins', 'No tasks');
  });

  // Decision table — Bins cell, column 3 of 3 (finished, populated)
  it('SW-IAUD-TC08: a Bins cell shows the generated bin count with separators', () => {
    stubAuditList(rows(data.binsCell.dtGeneratedPopulated));
    page.visitAndWait().assertCellContains(0, 'Bins', (1234).toLocaleString());
  });

  // Decision table — Variance cell, column 1 of 4 (nothing counted yet)
  it('SW-IAUD-TC09: a Variance cell is empty until counting produces results', () => {
    stubAuditList(rows(data.varianceCell.dtNotCounted));
    page.visitAndWait().assertCellText(0, 'Variance', '—');
  });

  // Decision table — Variance cell, column 2 of 4 (counted, clean)
  it('SW-IAUD-TC10: a Variance cell reports a clean count', () => {
    stubAuditList(rows(data.varianceCell.dtCleanCount));
    page.visitAndWait().assertCellContains(0, 'Variance', 'No discrepancies');
  });

  // BVA — the singular/plural boundary, lower side (exactly one discrepancy)
  it('SW-IAUD-TC11: a Variance cell with one discrepancy reads in the singular', () => {
    stubAuditList(rows(data.varianceCell.bvaOneDiscrepancy));
    page.visitAndWait();
    page.assertCellContains(0, 'Variance', '-3 net').assertCellContains(0, 'Variance', '1 discrepancy');
  });

  // BVA — the singular/plural boundary, upper side (two discrepancies)
  it('SW-IAUD-TC12: a Variance cell with two discrepancies reads in the plural', () => {
    stubAuditList(rows(data.varianceCell.bvaTwoDiscrepancies));
    page.visitAndWait();
    page.assertCellContains(0, 'Variance', '+5 net').assertCellContains(0, 'Variance', '2 discrepancies');
  });

  // Decision table — Assigned Worker cell, columns 1 and 2
  it('SW-IAUD-TC13: the Assigned Worker cell flags an unassigned audit and names a lone worker', () => {
    stubAuditList(rows(data.assignedWorkerCell.dtUnassigned, data.assignedWorkerCell.dtSingleWorker));
    page.visitAndWait();
    page.assertCellText(0, 'Assigned Worker', 'Unassigned');
    page.assertCellContains(1, 'Assigned Worker', 'Alice Anderson');
  });

  // Decision table — Assigned Worker cell, column 3 (overflow chip + tooltip)
  it('SW-IAUD-TC14: the Assigned Worker cell collapses extra workers into a counted chip', () => {
    stubAuditList(rows(data.assignedWorkerCell.dtThreeWorkers));
    page.visitAndWait();
    page.assertCellContains(0, 'Assigned Worker', 'Alice Anderson');
    page.assertWorkerOverflowChip(0, '+2', 'Bob Brown');
  });

  // Decision table — type and class rendering by audit type
  it('SW-IAUD-TC15: class is shown for an ABC audit and omitted for a Location audit', () => {
    stubAuditList(rows(data.typeAndClassCell.dtAbcWithClass, data.typeAndClassCell.dtLocationNoClass));
    page.visitAndWait();
    page.assertCellContains(0, 'Audit Type', 'ABC Classification').assertCellContains(0, 'Class', 'A');
    page.assertCellContains(1, 'Audit Type', 'Location').assertCellText(1, 'Class', '—');
  });

  // ==========================================================================
  // Search & filters
  // ==========================================================================

  // Error guessing — the search commits on submit, not on keystroke
  it('SW-IAUD-TC16: typing a search term does not filter until it is submitted', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait().assertRowCount(2);
    page.typeSearch('zzz-no-match');
    // Still two rows: the component only applies `search` on form submit.
    page.assertRowCount(2);
  });

  // EP — search matches the name
  it('SW-IAUD-TC17: submitting a search on an audit name narrows the table', { tags: ['@smoke'] }, () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait();
    page.searchFor(data.filterSet.epOpenAbcClassA.name);
    page.assertRowCount(1).assertCellContains(0, 'Name', data.filterSet.epOpenAbcClassA.name);
  });

  // EP — search matches a non-obvious haystack member (worker names)
  it('SW-IAUD-TC18: submitting a search on an assigned worker name narrows the table', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait();
    page.searchFor('Bob Brown');
    page.assertRowCount(1).assertCellContains(0, 'Assigned Worker', 'Bob Brown');
  });

  // EP — the no-match partition
  it('SW-IAUD-TC19: a search with no match says the filters excluded everything', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA));
    page.visitAndWait();
    page.searchFor('zzz-definitely-no-match');
    page.assertEmptyMessageText('No audits match your filters.');
  });

  // EP — status filter
  it('SW-IAUD-TC20: the Status filter narrows the table to the chosen status', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait();
    page.selectFilter('status', 'Open');
    page.assertRowCount(1).assertEveryRowCellEquals('Status', 'Open');
  });

  // EP — audit type filter
  it('SW-IAUD-TC21: the Audit Type filter narrows the table to the chosen type', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait();
    page.selectFilter('auditType', 'Location');
    page.assertRowCount(1).assertEveryRowCellEquals('Audit Type', 'Location');
  });

  // EP — class filter
  it('SW-IAUD-TC22: the Class filter narrows the table to the chosen ABC class', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epInProgressAbcClassC));
    page.visitAndWait();
    page.selectFilter('abcClass', 'Class C');
    page.assertRowCount(1).assertEveryRowCellEquals('Class', 'C');
  });

  // EP — options are derived from the loaded list, not hard-coded
  it('SW-IAUD-TC23: the Location filter offers only scopes present in the loaded list', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait();
    page.readFilterOptions('location').then((options) => {
      expect(options, 'the placeholder plus exactly the loaded scopes').to.have.length(3);
      expect(options, 'the placeholder is always offered').to.include('All locations');
      expect(options, 'the scope of the first loaded row').to.include('Facility 02 (Facility)');
      expect(options, 'and of the second — options are derived, not hard-coded').to.include('Zone 09 (Zone)');
    });
    page.closeOpenFilter();
    page.selectFilter('location', 'Zone 09 (Zone)');
    page.assertRowCount(1).assertCellContains(0, 'Location', 'Zone 09');
  });

  // EP — worker options are derived too
  it('SW-IAUD-TC24: the Worker filter offers only workers present in the loaded list', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA, data.filterSet.epCompletedLocation));
    page.visitAndWait();
    page.readFilterOptions('worker').then((options) => {
      expect(options, 'the placeholder plus exactly the workers on the loaded rows').to.have.length(3);
      expect(options, 'the placeholder is always offered').to.include('All workers');
      expect(options, 'the worker on the first loaded row').to.include('Alice Anderson');
      expect(options).to.include('Bob Brown');
    });
    page.closeOpenFilter();
    page.selectFilter('worker', 'Bob Brown');
    page.assertRowCount(1).assertCellContains(0, 'Assigned Worker', 'Bob Brown');
  });

  // Decision table — two filters compose as an intersection
  it('SW-IAUD-TC25: Status and Class filters combine as an intersection', () => {
    stubAuditList(
      rows(data.filterSet.epOpenAbcClassA, data.filterSet.epInProgressAbcClassC, data.filterSet.epCompletedLocation)
    );
    page.visitAndWait().assertRowCount(3);
    page.selectFilter('status', 'In Progress');
    page.selectFilter('abcClass', 'Class C');
    page.assertRowCount(1).assertCellContains(0, 'Name', data.filterSet.epInProgressAbcClassC.name);
    // Clearing both restores the full set.
    page.selectFilter('status', 'All statuses');
    page.selectFilter('abcClass', 'All classes');
    page.assertRowCount(3);
  });

  // EP — the truly-empty partition (distinct copy from the filtered-empty one)
  it('SW-IAUD-TC26: an empty audits list invites the admin to create one', () => {
    stubEmptyAuditList('emptyList');
    page.visitAndWait('emptyList');
    page.assertEmptyMessageText('No audits yet. Create one to plan a count.');
  });

  // ==========================================================================
  // Row actions & lifecycle
  // ==========================================================================

  // Use case — row navigation
  it('SW-IAUD-TC27: clicking a row opens that audit', { tags: ['@smoke'] }, () => {
    const row = data.filterSet.epOpenAbcClassA;
    stubAuditList(rows(row));
    page.visitAndWait();
    page.clickRow(0);
    cy.location('pathname').should('eq', `/abc/audits/${row.id}`);
  });

  // Use case — the same destination from the menu
  it('SW-IAUD-TC28: the actions menu opens the audit', () => {
    const row = data.filterSet.epOpenAbcClassA;
    stubAuditList(rows(row));
    page.visitAndWait();
    page.openActionsMenu(0).clickMenuItem(/open audit/i);
    cy.location('pathname').should('eq', `/abc/audits/${row.id}`);
  });

  // Decision table — Review is gated on PendingReview (the four negative columns)
  it('SW-IAUD-TC29: Review discrepancies is disabled outside a pending review', () => {
    stubAuditList(
      rows(
        data.actionGates.stOpen,
        data.actionGates.stInProgress,
        data.actionGates.stCompleted,
        data.actionGates.stCancelled
      )
    );
    page.visitAndWait();
    [0, 1, 2, 3].forEach((rowIndex) => {
      page.openActionsMenu(rowIndex).assertMenuItemDisabled(/review discrepancies/i).closeActionsMenu();
    });
  });

  // Use case — the enabled counterpart
  it('SW-IAUD-TC30: Review discrepancies opens the review screen for a pending review', () => {
    const row = data.actionGates.stPendingReview;
    stubAuditList(rows(row));
    page.visitAndWait();
    page.openActionsMenu(0).clickMenuItem(/review discrepancies/i);
    cy.location('pathname').should('eq', `/abc/audits/${row.id}/review`);
  });

  // State transition — the cancellable window
  it('SW-IAUD-TC31: Cancel is offered while an audit can still be abandoned', () => {
    stubAuditList(rows(data.actionGates.stOpen, data.actionGates.stInProgress, data.actionGates.stPendingReview));
    page.visitAndWait();
    [0, 1, 2].forEach((rowIndex) => {
      page.openActionsMenu(rowIndex).assertMenuItemEnabled(/cancel audit/i).closeActionsMenu();
    });
  });

  // State transition — invalid transitions out of a terminal state (AC3)
  it('SW-IAUD-TC32: a finished audit offers no cancel and no edit', () => {
    stubAuditList(rows(data.actionGates.stCompleted, data.actionGates.stCancelled));
    page.visitAndWait();
    [0, 1].forEach((rowIndex) => {
      page
        .openActionsMenu(rowIndex)
        .assertMenuItemDisabled(/cancel audit/i)
        .assertNoEditAction()
        .closeActionsMenu();
    });
  });

  // Use case — the confirmation is a real gate
  it('SW-IAUD-TC33: backing out of the cancel confirmation changes nothing', () => {
    const row = data.actionGates.stOpen;
    stubAuditList(rows(row));
    // Registered so a stray request would be observable, then asserted unfired.
    cy.intercept('POST', `**/inventory-audits/${row.id}/cancel`, cy.spy().as('cancelSpy'));
    page.visitAndWait();
    page.openActionsMenu(0).clickMenuItem(/cancel audit/i);
    page.assertCancelDialogCopy().keepAudit();
    cy.get('@cancelSpy').should('not.have.been.called');
    page.assertCellContains(0, 'Status', 'Open');
  });

  // State transition — Open → Cancelled, and the toast names what was KEPT
  it('SW-IAUD-TC34: confirming the cancel moves the audit to Cancelled', { tags: ['@smoke'] }, () => {
    const row = data.actionGates.stOpen;
    const result = data.cancelResults.stClosedAndKept;
    stubAuditList(rows(row));
    stubCancelSuccess(row.id, result, 'cancelOk');
    page.visitAndWait();
    // The list refetches after a successful cancel — return the row as Cancelled.
    page.openActionsMenu(0).clickMenuItem(/cancel audit/i);
    stubAuditList(rows({ ...row, status: 'Cancelled' }), 'auditListAfter');
    page.confirmCancel();
    cy.wait('@cancelOk');
    page.assertToast(new RegExp(`${result.cancelledBins} open bin task`));
    page.assertToast(new RegExp(`${result.preservedScanCount} recorded scan`));
    cy.wait('@auditListAfter');
    page.assertCellContains(0, 'Status', 'Cancelled');
  });

  // Error guessing — the server's refusal must reach the user unaltered
  it('SW-IAUD-TC35: a refused cancel shows the server reason and leaves the status alone', () => {
    const row = data.actionGates.stPendingReview;
    stubAuditList(rows(row));
    stubCancelRefused(row.id, data.cancelResults.egRefusedApplied, 'cancelRefused');
    page.visitAndWait();
    page.openActionsMenu(0).clickMenuItem(/cancel audit/i);
    page.confirmCancel();
    cy.wait('@cancelRefused');
    page.assertToast(/already applied an inventory adjustment/i);
    page.assertCellContains(0, 'Status', 'Pending Review');
  });

  // ==========================================================================
  // RBAC at the route
  // ==========================================================================

  // Decision table — the audits route is not registered for a worker, so the
  // router's catch-all renders the not-found page WITHOUT redirecting. Assert the
  // page, not the URL.
  it('SW-IAUD-TC41: a worker-role account cannot reach the audits screen', function () {
    cy.credentials('user').then(({ username, password }) => {
      if (!username || !password) this.skip(); // no `user` account declared
      // `cy.authSession(role)`, NOT `cy.login(...)`.
      //
      // `beforeEach` already established the ADMIN browser session, and cy.login()
      // hands back a token without swapping the session the app boots from — so the
      // page under test still rendered as the admin and the not-found assertion
      // failed. It only ever "passed" when this spec ran first in a fresh browser.
      // `authSession` caches per role ('worker-session') and switches the session
      // the visit below actually uses.
      cy.authSession('user');
      cy.visit('/abc/audits', { failOnStatusCode: false });
      cy.contains(/sorry, page not found/i).should('be.visible');
      cy.findByRole('heading', { name: /^audits$/i }).should('not.exist');
      page.assertNoTable();
    });
  });

  // Decision table — a sales account never gets the abc route registered at all
  it('SW-IAUD-TC42: a sales-role account cannot reach the audits screen', function () {
    cy.credentials('sales').then(({ username, password }) => {
      if (!username || !password) this.skip(); // no `sales` account declared
      // Same session-swap reason as TC41 above.
      cy.authSession('sales');
      cy.visit('/abc/audits', { failOnStatusCode: false });
      cy.contains(/sorry, page not found/i).should('be.visible');
      cy.findByRole('heading', { name: /^audits$/i }).should('not.exist');
    });
  });

  // ==========================================================================
  // Sorting & summary-card behaviour
  // ==========================================================================

  // Error guessing — the variance column sorts with a sentinel for uncounted rows
  it('SW-IAUD-TC76: sorting by Variance keeps the not-yet-counted audits together', () => {
    stubAuditList(
      rows(
        data.varianceCell.bvaOneDiscrepancy,
        data.varianceCell.dtNotCounted,
        data.varianceCell.bvaTwoDiscrepancies,
        { ...data.varianceCell.dtNotCounted, id: 2012, name: 'Variance - not counted 2' }
      )
    );
    page.visitAndWait();
    page.sortColumnBothWays('Variance').then(({ first, second }) => {
      // Whichever direction the first click produced, the sentinel rows must stay
      // together and sit at one END of the order — never interleaved with the
      // counted rows. Asserting "position 0" would only be testing which way MRT
      // happens to toggle first.
      [first, second].forEach((values, n) => {
        const positions = values.reduce((acc, v, i) => (v === '—' ? acc.concat([i]) : acc), []);
        expect(positions, `both uncounted rows present in read ${n + 1}`).to.have.length(2);
        expect(
          positions[1] - positions[0],
          `not-yet-counted rows must be adjacent in read ${n + 1}, not interleaved`
        ).to.eq(1);
        const atStart = positions[0] === 0;
        const atEnd = positions[1] === values.length - 1;
        expect(
          atStart || atEnd,
          `the sentinel group must sit at one end of read ${n + 1} — it grouped at ${positions}`
        ).to.eq(true);
      });
      expect(first, 'the two directions are exact reverses of each other').to.deep.eq(
        [...second].reverse()
      );
    });
  });

  // EP — the text columns sort alphabetically in both directions
  it('SW-IAUD-TC77: a text column sorts alphabetically in both directions', () => {
    stubAuditList(rows(data.sorting.egBinsTen, data.sorting.egBinsNine, data.sorting.egBinsOneHundred));
    page.visitAndWait();
    page.sortColumnBothWays('Name').then(({ first, second }) => {
      expect(first, 'the two directions are exact reverses').to.deep.eq([...second].reverse());
      const ascending = first[0] < first[first.length - 1] ? first : second;
      expect(ascending, 'the ascending direction is alphabetical').to.deep.eq([...ascending].sort());
    });
  });

  // Error guessing — the classic lexical-sort-on-a-number bug (9 vs 10)
  it('SW-IAUD-TC78: the Bins column sorts numerically, not lexically', () => {
    stubAuditList(rows(data.sorting.egBinsTen, data.sorting.egBinsOneHundred, data.sorting.egBinsNine));
    page.visitAndWait();
    page.sortColumnBothWays('Bins').then(({ first, second }) => {
      const nums = (values) => values.map((v) => Number(v.replace(/[^0-9]/g, '')));
      const a = nums(first);
      const b = nums(second);
      expect(a, 'the two directions are exact reverses').to.deep.eq([...b].reverse());
      // Whichever read is ascending must be numerically ascending. A LEXICAL sort
      // would produce [10, 100, 9] / [9, 100, 10] — neither of which equals this.
      const ascending = a[0] < a[a.length - 1] ? a : b;
      expect(
        ascending,
        '9 must sort below 10 and 10 below 100 — a lexical sort would give 10, 100, 9'
      ).to.deep.eq([9, 10, 100]);
    });
  });

  // Error guessing — a formatted date must not be sorted as its display string
  it('SW-IAUD-TC79: the Created column sorts chronologically', () => {
    stubAuditList(rows(data.sorting.egBinsTen, data.sorting.egBinsNine, data.sorting.egBinsOneHundred));
    page.visitAndWait();
    page.sortColumnBothWays('Created').then(({ first, second }) => {
      const times = (values) => values.map((v) => new Date(v).getTime());
      const a = times(first);
      const b = times(second);
      expect(a, 'the two directions are exact reverses').to.deep.eq([...b].reverse());
      const ascending = a[0] < a[a.length - 1] ? a : b;
      expect(
        ascending,
        'ordered by real timestamps — a lexical sort of the localised string would disagree'
      ).to.deep.eq([...ascending].sort((x, y) => x - y));
    });
  });

  // Decision table — a derived column: first worker's name, unassigned grouped
  it('SW-IAUD-TC80: the Assigned Worker column sorts by first worker and groups the unassigned', () => {
    stubAuditList(
      rows(
        data.assignedWorkerCell.dtSingleWorker,
        data.assignedWorkerCell.dtUnassigned,
        { ...data.assignedWorkerCell.dtUnassigned, id: 3012, name: 'Workers - none 2' },
        data.assignedWorkerCell.dtThreeWorkers
      )
    );
    page.visitAndWait();
    page.sortColumnBothWays('Assigned Worker').then(({ first, second }) => {
      [first, second].forEach((values, n) => {
        const unassigned = values.reduce(
          (acc, v, i) => (v === 'Unassigned' ? acc.concat([i]) : acc),
          []
        );
        expect(unassigned, `both unassigned rows present in read ${n + 1}`).to.have.length(2);
        expect(
          unassigned[1] - unassigned[0],
          `unassigned rows are grouped in read ${n + 1}, not interleaved`
        ).to.eq(1);
      });
    });
  });

  // Decision table — the column that must not sort
  it('SW-IAUD-TC81: the Actions column offers no sort control', () => {
    stubAuditList(rows(data.filterSet.epOpenAbcClassA));
    page.visitAndWait().assertColumnNotSortable('Actions');
  });

  // Decision table — sort and filter compose
  it('SW-IAUD-TC82: a sort and a filter apply together', () => {
    stubAuditList(
      rows(
        { ...data.filterSet.epOpenAbcClassA, name: 'Zulu open' },
        { ...data.filterSet.epOpenAbcClassA, id: 6011, name: 'Alpha open' },
        data.filterSet.epCompletedLocation
      )
    );
    page.visitAndWait();
    page.selectFilter('status', 'Open');
    page.sortBy('Name');
    page.assertRowCount(2).assertEveryRowCellEquals('Status', 'Open');
    page.readColumn('Name').then((values) => {
      expect(values, 'the filtered subset is in name order').to.deep.eq(['Alpha open', 'Zulu open']);
    });
  });

  // Error guessing — the cards summarise the LIST, not the current view
  it('SW-IAUD-TC83: the summary cards ignore the search and the filters', () => {
    stubAuditList(
      rows(data.filterSet.epOpenAbcClassA, data.filterSet.epInProgressAbcClassC, data.filterSet.epCompletedLocation)
    );
    page.visitAndWait();
    page.readStatCardValue('Open').then((openBefore) => {
      page.searchFor(data.filterSet.epCompletedLocation.name);
      page.assertRowCount(1);
      page.assertStatCardValue('Open', openBefore);
      page.selectFilter('status', 'Completed');
      page.assertStatCardValue('Open', openBefore);
    });
  });

  // State transition — the cards are live, no manual reload
  it('SW-IAUD-TC84: cancelling an Open audit decrements the Open card', () => {
    const row = data.actionGates.stOpen;
    stubAuditList(rows(row, data.actionGates.stCompleted));
    stubCancelSuccess(row.id, data.cancelResults.stNothingOpen, 'cancelOk');
    page.visitAndWait();
    page.readStatCardValue('Open').then((before) => {
      expect(before, 'fixture must start with one Open audit').to.eq(1);
      page.openActionsMenu(0).clickMenuItem(/cancel audit/i);
      stubAuditList(rows({ ...row, status: 'Cancelled' }, data.actionGates.stCompleted), 'auditListAfter');
      page.confirmCancel();
      cy.wait('@cancelOk');
      cy.wait('@auditListAfter');
      page.assertStatCardValue('Open', before - 1);
    });
  });
});
