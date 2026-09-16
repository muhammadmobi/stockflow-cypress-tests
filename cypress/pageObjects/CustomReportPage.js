import L from '../support/locators/customReportLocators';

class CustomReportPage {
  // ── Navigation ────────────────────────────────────────────────────────────
  visit() {
    cy.intercept('GET', '**/custom-reports/templates/*/fields').as('crFields');
    cy.visit('/reports/custom-reports');
    cy.wait('@crFields', { timeout: 20000 });
    // MUI Checkbox hides its native <input> (opacity:0 — the SVG icon is what
    // renders visibly), so asserting the input itself 'be.visible' always
    // times out. Assert existence (mounted + interactable) instead, anchored
    // on the visible "Select All" label text as the real readiness signal.
    cy.contains('Select All').should('be.visible');
    L.selectAllCheckbox().should('exist');
  }

  navigateViaMenu() {
    L.reportsNavGroup().click();
    L.customReportsNavLink().should('be.visible').click();
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  clickTabByLabel(label) {
    cy.get(L.tabs, { timeout: 15000 })
      .filter((_, el) => el.textContent.trim() === label)
      .first()
      .should('not.have.class', 'Mui-disabled')
      .click();
    cy.get(L.tabs)
      .filter((_, el) => el.textContent.trim() === label)
      .first()
      .should('have.attr', 'aria-selected', 'true');
  }

  goToNewReportTab() {
    this.clickTabByLabel('New Report');
  }

  assertOnMyReportsTab() {
    cy.get(L.tabs)
      .filter((_, el) => el.textContent.trim() === 'My Reports')
      .first()
      .should('have.attr', 'aria-selected', 'true');
  }

  goToMyReportsTab() {
    cy.intercept('GET', '**/configs?type=customReport').as('crSavedList');
    this.clickTabByLabel('My Reports');
    cy.wait('@crSavedList', { timeout: 20000 });
    // The list is NOT user-scoped (see TC33) and this suite itself seeds
    // several disposable reports per run, so a specific report can easily land
    // past the default page size. Bump rows-per-page to the largest available
    // option so savedReportRow() lookups don't depend on sort order or
    // accumulated state.
    return this.maximizeRowsPerPage();
  }

  // Picks the numerically-largest rows-per-page option rather than a
  // hardcoded value — MRT's default option set isn't customized for this
  // table, so hardcoding e.g. 100 risks selecting an option that doesn't exist.
  // Queries via `cy.get('body').find(...)` rather than `L.rowsPerPageSelect()`
  // directly: on an empty saved-reports list (TC34's empty state), MUI's
  // TablePagination doesn't render a "Rows per page" control at all, and a
  // bare `cy.get()` on a selector that will never appear retries for the
  // full command timeout before throwing. `.find()` on an already-yielded
  // element resolves immediately with an empty collection instead.
  maximizeRowsPerPage() {
    return cy.get('body').then(($body) => {
      const $el = $body.find('[role="combobox"][aria-label="Rows per page"]');
      if (!$el.length) return;
      cy.wrap($el).click();
      cy.get('[role="listbox"], [role="menu"]').find('li').then(($lis) => {
        const options = [...$lis].map((li) => Number(li.textContent.trim())).filter((n) => !Number.isNaN(n));
        if (!options.length) {
          cy.get('body').type('{esc}');
          return;
        }
        const max = Math.max(...options);
        cy.get('[role="listbox"], [role="menu"]').contains('li', String(max)).click();
      });
    });
  }

  // ── Field Selector ────────────────────────────────────────────────────────
  searchFields(text) {
    L.fieldSearchInput().clear().type(text);
  }

  clearFieldSearch() {
    L.fieldSearchInput().clear();
  }

  toggleField(label) {
    L.fieldCheckbox(label).click({ force: true });
  }

  assertFieldChecked(label, checked = true) {
    L.fieldCheckbox(label).should(checked ? 'be.checked' : 'not.be.checked');
  }

  assertFieldCheckboxExists(label, exists = true) {
    L.fieldCheckbox(label).should(exists ? 'exist' : 'not.exist');
  }

  toggleGroupHeader(group) {
    L.groupHeaderCheckbox(group).click({ force: true });
  }

  toggleSelectAll() {
    L.selectAllCheckbox().click({ force: true });
  }

  assertFieldsCount(selected, total) {
    L.fieldsCountLabel().should('contain.text', `Fields (${selected}/${total})`);
  }

  assertInColumnOrder(label, present = true) {
    if (present) {
      L.columnOrderItem(label).should('exist');
    } else {
      cy.contains('Column Order (drag to reorder)').parent().contains(label).should('not.exist');
    }
  }

  // ── Filter Panel ──────────────────────────────────────────────────────────
  addFilter() {
    L.addFilterBtn().click();
  }

  removeFilter(index) {
    L.filterDeleteBtn(index).click();
  }

  setFilterField(index, label) {
    L.filterFieldSelect(index).click({ force: true });
    cy.get('[role="listbox"], [role="menu"]').contains('li', label).click();
  }

  setFilterOperator(index, operatorLabel) {
    L.filterOperatorSelect(index).click({ force: true });
    cy.get('[role="listbox"], [role="menu"]').contains('li', operatorLabel).click();
  }

  setFilterValue(index, value) {
    L.filterValueInput(index).clear().type(value);
  }

  assertFilterFieldNotEmpty(index) {
    L.filterFieldSelect(index).invoke('text').should('match', /./);
  }

  assertFilterOperatorText(index, expected) {
    L.filterOperatorSelect(index).invoke('text').should('match', expected);
  }

  setFilterEnumValue(index, value) {
    L.filterEnumValueSelect(index).click({ force: true });
    cy.get('[role="listbox"], [role="menu"]').contains('li', value).click();
    // Confirm the selection actually committed to React state before the
    // caller runs the report — the option click resolving in the DOM doesn't
    // guarantee the onChange has propagated yet, and running immediately
    // could send the *previous* (possibly empty) filter value.
    L.filterEnumValueSelect(index).should('have.text', value);
  }

  setFilterBetween(index, from, to) {
    L.filterFromInput(index).clear().type(from);
    L.filterToInput(index).clear().type(to);
  }

  addFilterFor(fieldLabel, operatorLabel, value) {
    this.addFilter();
    const index = 0; // caller is expected to know the row index; kept simple for single-filter flows
    this.setFilterField(index, fieldLabel);
    if (operatorLabel) this.setFilterOperator(index, operatorLabel);
    if (value !== undefined) this.setFilterValue(index, value);
  }

  getOperatorOptionsText() {
    return cy.get('[role="listbox"], [role="menu"]').find('li').then(($lis) => [...$lis].map((li) => li.textContent.trim()));
  }

  assertFiltersCount(n) {
    L.filtersCountLabel().should('contain.text', `Filters (${n})`);
  }

  assertNoFiltersMessage() {
    L.noFiltersMessage().should('be.visible');
  }

  openFilterOperatorOptions(index) {
    L.filterOperatorSelect(index).click({ force: true });
  }

  assertOperatorOptions(index, included = [], excluded = []) {
    this.openFilterOperatorOptions(index);
    this.getOperatorOptionsText().then((texts) => {
      included.forEach((op) => expect(texts, `operator "${op}" must be offered`).to.include(op));
      excluded.forEach((op) => expect(texts, `operator "${op}" must NOT be offered`).to.not.include(op));
    });
    cy.get('body').type('{esc}');
  }

  assertSingleValueInputVisible(index) {
    L.filterValueInput(index).should('be.visible');
  }

  assertBetweenInputsVisible(index) {
    L.filterFromInput(index).should('be.visible');
    L.filterToInput(index).should('be.visible');
  }

  assertNoValueInputVisible(index) {
    this.filterRowHasNoValueInput(index);
  }

  filterRowHasNoValueInput(index) {
    L.filterRow(index).within(() => {
      cy.get('input[placeholder="Value"], input[placeholder="From"], input[placeholder="To"]').should('not.exist');
    });
  }

  // ── Group By ──────────────────────────────────────────────────────────────
  openGroupBySelector() {
    L.groupByAutocompleteInput().click();
  }

  selectGroupByField(fieldLabel) {
    this.openGroupBySelector();
    cy.get('[role="listbox"]').should('be.visible').contains('li', fieldLabel).click();
    cy.get('body').type('{esc}');
  }

  assertGroupByOptions(included = [], excluded = []) {
    this.openGroupBySelector();
    cy.get('[role="listbox"]').should('be.visible').find('li').then(($lis) => {
      const texts = [...$lis].map((li) => li.textContent.trim());
      included.forEach((label) => expect(texts, `Group By option "${label}" must be offered`).to.include(label));
      excluded.forEach((label) => expect(texts, `Group By option "${label}" must NOT be offered`).to.not.include(label));
    });
    cy.get('body').type('{esc}');
  }

  assertGroupByChipPresent(label, present = true) {
    if (present) {
      L.groupByChip(label).should('exist');
    } else {
      cy.contains('.MuiChip-root', label).should('not.exist');
    }
  }

  // ── Action bar ────────────────────────────────────────────────────────────
  clickRunReport() {
    L.runReportBtn().click();
  }

  runReportAndWait() {
    cy.intercept('POST', '**/custom-reports/execute').as('crExecute');
    this.clickRunReport();
    cy.wait('@crExecute', { timeout: 20000 });
    return this.waitForTableSettled();
  }

  // The network response landing doesn't guarantee MRT has finished
  // re-rendering with the new rows — MRT shows a MuiLinearProgress bar while
  // `isRefetching`/`isLoading` is true; waiting for it to clear is a stable,
  // generic settle signal reused by every run/sort/re-run action, rather than
  // patching each call site with its own timing workaround.
  waitForTableSettled() {
    return cy.get('body').find('.MuiLinearProgress-root').should('not.exist');
  }

  clickSaveAs() {
    L.saveAsBtn().click();
  }

  assertRunReportEnabled(enabled = true) {
    L.runReportBtn().should(enabled ? 'not.be.disabled' : 'be.disabled');
  }

  assertSaveAsEnabled(enabled = true) {
    L.saveAsBtn().should(enabled ? 'not.be.disabled' : 'be.disabled');
  }

  // ── Save dialog ───────────────────────────────────────────────────────────
  typeReportName(name) {
    L.reportNameInput().clear().type(name);
  }

  assertSaveDialogSaveDisabled(disabled = true) {
    L.saveDialogSaveBtn().should(disabled ? 'be.disabled' : 'not.be.disabled');
  }

  assertSaveDialogClosed() {
    L.saveDialog().should('not.exist');
  }

  clickSaveDialogSave() {
    L.saveDialogSaveBtn().click();
  }

  clickSaveDialogCancel() {
    L.saveDialogCancelBtn().click();
  }

  saveReportAs(name) {
    cy.intercept('POST', '**/configs').as('crSaveNew');
    this.clickSaveAs();
    this.typeReportName(name);
    this.clickSaveDialogSave();
    cy.wait('@crSaveNew', { timeout: 20000 });
    L.saveDialog().should('not.exist');
  }

  saveEditsToExisting() {
    cy.intercept('PATCH', '**/configs/*').as('crSaveEdit');
    L.saveAsBtn().click();
    this.clickSaveDialogSave();
    cy.wait('@crSaveEdit', { timeout: 20000 });
    L.saveDialog().should('not.exist');
  }

  // Edit mode (CustomReportsPage.tsx view.type === 'edit') renders no Tabs at
  // all — saving does NOT navigate away on its own. This is the only way
  // back to the tabbed view (lands on My Reports, per handleBack()).
  clickBackToMyReports() {
    cy.intercept('GET', '**/configs?type=customReport').as('crSavedListAfterEdit');
    L.backToMyReportsBtn().click();
    cy.wait('@crSavedListAfterEdit', { timeout: 20000 });
    return this.maximizeRowsPerPage();
  }

  // ── Report Runner (run view) ──────────────────────────────────────────────
  clickBack() {
    L.backBtn().click();
  }

  clickExport() {
    L.exportBtn().click();
  }

  clickExportAndWait() {
    cy.intercept('POST', '**/custom-reports/export').as('crExport');
    this.clickExport();
    return cy.wait('@crExport', { timeout: 60000 });
  }

  clickSortableHeader(label) {
    L.sortableColumnHeader(label).click();
  }

  clickSortableHeaderAndWait(label) {
    cy.intercept('POST', '**/custom-reports/execute').as('crSort');
    this.clickSortableHeader(label);
    cy.wait('@crSort', { timeout: 20000 });
    return this.waitForTableSettled();
  }

  // The network response landing doesn't guarantee React has re-rendered the
  // table yet — poll the first row's cell until it differs from a captured
  // "before" snapshot, so a subsequent columnValues() read isn't racing a
  // still-old render.
  assertFirstColumnValueChangedFrom(headerText, previousValue) {
    L.runnerTableHeaders().then(($headers) => {
      const colIndex = [...$headers].findIndex((th) => th.textContent.trim().toLowerCase().includes(headerText.toLowerCase()));
      expect(colIndex, `Column "${headerText}" must be visible`).to.be.gte(0);
      L.runnerTableRows().eq(0).find('td').eq(colIndex).should(($td) => {
        expect($td.text().trim()).to.not.eq(previousValue);
      });
    });
  }

  assertColumnOrder(labelsInOrder) {
    L.runnerTableHeaders().then(($headers) => {
      const headerTexts = [...$headers].map((th) => th.textContent.trim());
      const positions = labelsInOrder.map((label) =>
        headerTexts.findIndex((t) => t.toLowerCase().startsWith(label.toLowerCase())),
      );
      positions.forEach((pos, i) => {
        expect(pos, `column "${labelsInOrder[i]}" must be present`).to.be.gte(0);
      });
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i], `"${labelsInOrder[i]}" must come after "${labelsInOrder[i - 1]}"`).to.be.gt(positions[i - 1]);
      }
    });
  }

  // Same column-index-by-header-text convention as CostReportPage.assertColumnContains.
  columnValues(headerText, maxRows) {
    return L.runnerTableHeaders().then(($headers) => {
      const colIndex = [...$headers].findIndex((th) => th.textContent.trim().toLowerCase().includes(headerText.toLowerCase()));
      expect(colIndex, `Column "${headerText}" must be visible`).to.be.gte(0);
      return L.runnerTableRows().then(($rows) => {
        const limit = maxRows != null ? Math.min($rows.length, maxRows) : $rows.length;
        const values = [];
        for (let i = 0; i < limit; i++) {
          values.push($rows.eq(i).find('td').eq(colIndex).text().trim());
        }
        return values;
      });
    });
  }

  // Uses cy.get(...).should(callback) rather than columnValues().then(...):
  // a plain .then() reads the DOM exactly once, and a network response
  // landing (runReportAndWait's intercept wait) does not guarantee MRT has
  // finished re-rendering with the new rows yet — that one-shot read could
  // race a still-previous render. .should() re-runs the whole callback
  // (re-querying the table fresh each attempt) until it stops throwing or
  // times out, which is the robust fix, not a fixed settle delay.
  assertColumnAllMatch(headerText, predicateDescription, predicateFn, maxRows) {
    cy.get('.MuiTableContainer-root').first().should(($container) => {
      const colIndex = [...$container.find('thead th')].findIndex(
        (th) => th.textContent.trim().toLowerCase().includes(headerText.toLowerCase()),
      );
      expect(colIndex, `Column "${headerText}" must be visible`).to.be.gte(0);
      const $rows = $container.find('tbody tr');
      const limit = maxRows != null ? Math.min($rows.length, maxRows) : $rows.length;
      expect(limit, 'at least one row must be present to assert on').to.be.gt(0);
      for (let i = 0; i < limit; i++) {
        const v = Cypress.$($rows[i]).find('td').eq(colIndex).text().trim();
        expect(predicateFn(v), `"${v}" must satisfy: ${predicateDescription}`).to.be.true;
      }
    });
  }

  assertHasRecordCountColumn(present = true) {
    L.runnerTableHeaders().then(($headers) => {
      const has = [...$headers].some((th) => /record count|total qty/i.test(th.textContent));
      expect(has, 'Record Count / Total Qty column presence').to.eq(present);
    });
  }

  assertNoDuplicateColumnValues(headerText, maxRows) {
    this.columnValues(headerText, maxRows).then((values) => {
      const unique = new Set(values);
      expect(unique.size, `"${headerText}" values must be distinct across grouped rows`).to.eq(values.length);
    });
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  clickNextPage() {
    L.nextPageBtn().click();
  }

  isNextPageDisabled() {
    return L.nextPageBtn().then(($btn) => $btn.is(':disabled') || $btn.attr('disabled') !== undefined);
  }

  setRowsPerPage(size) {
    L.rowsPerPageSelect().click();
    cy.get('[role="listbox"], [role="menu"]').contains('li', String(size)).click();
  }

  assertPaginationSummaryMatches(regex) {
    L.paginationSummary().invoke('text').should('match', regex);
  }

  getPaginationSummaryText() {
    return L.paginationSummary().invoke('text');
  }

  // ── My Reports ────────────────────────────────────────────────────────────
  runSavedReport(name) {
    L.savedReportRow(name).findByRole('button', { name: /^Run$/i }).click();
  }

  editSavedReport(name) {
    L.savedReportRow(name).findByRole('button', { name: /^Edit$/i }).click();
  }

  duplicateSavedReport(name) {
    cy.intercept('POST', '**/configs').as('crDuplicate');
    L.savedReportRow(name).findByRole('button', { name: /^Duplicate$/i }).click();
    return cy.wait('@crDuplicate', { timeout: 20000 });
  }

  deleteSavedReport(name) {
    L.savedReportRow(name).findByRole('button', { name: /^Delete$/i }).click();
  }

  confirmDelete() {
    cy.intercept('DELETE', '**/configs/*').as('crDelete');
    L.deleteDialogConfirmBtn().click();
    cy.wait('@crDelete', { timeout: 20000 });
    L.deleteDialog().should('not.exist');
  }

  cancelDelete() {
    L.deleteDialogCancelBtn().click();
    L.deleteDialog().should('not.exist');
  }

  assertSavedReportVisible(name, visible = true) {
    if (visible) {
      L.savedReportRow(name).should('exist');
    } else {
      cy.contains('.MuiTableContainer-root tbody tr', name).should('not.exist');
    }
  }

  assertSavedReportCounts(name, fieldsCount, filtersCount) {
    L.savedReportRow(name).within(() => {
      cy.get('td').eq(1).should('contain.text', String(fieldsCount));
      cy.get('td').eq(2).should('contain.text', String(filtersCount));
    });
  }

  assertEmptyStateVisible() {
    L.emptyStateMessage().should('be.visible');
  }
}

export default CustomReportPage;
