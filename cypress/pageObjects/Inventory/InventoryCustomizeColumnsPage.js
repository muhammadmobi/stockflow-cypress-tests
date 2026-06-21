// Page object for the Inventory Customize Columns dialog (/inventory).
// Opens from the header kebab → "Customize Columns" (inventoryActionMenue.tsx:147),
// toggles per-category column visibility (labelled checkboxes), and persists to
// /configs (type=inventoryCategoryFilter). The write is STUBBED by the spec so the
// shared per-user column config is never mutated (other Inventory specs depend on it);
// the spec asserts the request shape + the real GET that scopes columns per category.

import L from '../../support/locators/Inventory/customizeColumnsLocators';

class InventoryCustomizeColumnsPage {
  openDialog() {
    cy.get(L.TOOLBAR_KEBAB).not('tbody *').first().click({ force: true });
    cy.get(L.MENU, { timeout: 8000 }).contains(L.CC_MENU_ITEM).should('be.visible').click({ force: true });
    cy.get(L.DIALOG, { timeout: 10000 }).should('be.visible');
    cy.get(L.FORM, { timeout: 10000 }).should('exist');
    // The per-category config GET hydrates the selected-column chips AFTER the
    // dialog mounts. Wait for that hydration before mutating, otherwise a late
    // GET response resets `columns` and silently reverts our toggle.
    cy.get(L.DIALOG).find('.MuiChip-root', { timeout: 15000 }).should('have.length.greaterThan', 0);
    return this;
  }

  assertColumnListed(col) {
    cy.get(L.DIALOG).contains('label', col, { timeout: 8000 }).should('exist');
    return this;
  }

  // Selected columns render as MUI Chips; in customColumn mode every chip is
  // deletable (isPredefined is only true in scan mode). Removing a chip is the
  // robust "hide" affordance (force-clicking the visually-hidden checkbox input
  // is unreliable across columns).
  removeColumnChip(col) {
    cy.get(L.DIALOG).contains('.MuiChip-root', col).find('.MuiChip-deleteIcon').click({ force: true });
    cy.get(L.DIALOG).contains('.MuiChip-root', col).should('not.exist');
    return this;
  }

  assertColumnChip(col) {
    cy.get(L.DIALOG).contains('.MuiChip-root', col, { timeout: 8000 }).should('exist');
    return this;
  }

  // The picker groups columns by category (Common Attributes + each category name)
  // — assert a category group header is present. Headers are Typography (not labels)
  // and can be scrolled within the list, so assert existence, not pixel-visibility.
  assertGroupListed(group) {
    cy.get(L.DIALOG).contains(group, { timeout: 8000 }).should('exist');
    return this;
  }

  // Select a currently-unselected column via its label using a real pointer event.
  // realClick() dispatches a trusted native PointerEvent which reliably triggers
  // React's synthetic onChange on the MUI Checkbox — force-click / check({force})
  // on the hidden input fires a non-trusted event that React can silently ignore.
  selectColumnByLabel(col) {
    cy.get(L.DIALOG).contains('label', col).realClick();
    cy.get(L.DIALOG).contains('.MuiChip-root', col, { timeout: 15000 }).should('exist');
    return this;
  }

  // ── Inventory grid column-visibility assertions (after a real save + reload) ──
  // Assert existence rather than pixel-visibility: MRT renders sticky header cells
  // (and an off-screen measurement clone) that Cypress flags as not-visible even
  // though the column is rendered. Presence/absence in `thead th` is the signal.
  assertGridColumnVisible(col) {
    cy.get('[role="progressbar"]', { timeout: 30000 }).should('not.exist');
    cy.contains(L.GRID_COLUMN_HEADER, col, { timeout: 20000 }).should('exist');
    return this;
  }

  // Assert a column is gone from the grid. Anchor on a column that MUST remain so
  // we know the grid actually rendered (not just empty) before asserting absence.
  assertGridColumnHidden(col, anchor) {
    cy.get('[role="progressbar"]', { timeout: 30000 }).should('not.exist');
    cy.contains(L.GRID_COLUMN_HEADER, anchor, { timeout: 20000 }).should('exist');
    cy.get(L.GRID_COLUMN_HEADER).should('not.contain', col);
    return this;
  }

  interceptSave() {
    cy.intercept('POST', L.CONFIGS_POST, { statusCode: 200, body: { data: {} } }).as('ccPost');
    cy.intercept('PATCH', L.CONFIGS_PATCH, { statusCode: 200, body: { data: {} } }).as('ccPatch');
    return this;
  }

  interceptConfigGet() {
    cy.intercept('GET', L.CONFIGS_GET).as('ccGet');
    return this;
  }

  save() {
    cy.get(L.SUBMIT_BTN, { timeout: 10000 }).should('be.visible').click({ force: true });
    return this;
  }

  assertSaveToast() {
    cy.contains(L.SAVE_TOAST, { timeout: 10000 }).should('be.visible');
    return this;
  }

  // Resolve the fired config-write (POST when no config exists, else PATCH). Both
  // carry configJson.columns. Call AFTER the save toast so the request has settled.
  getSaveRequest() {
    return cy.get('@ccPost.all').then((post) => {
      if (post.length) return post[0].request;
      return cy.get('@ccPatch.all').then((patch) => {
        expect(patch.length, 'a /configs write fired on save').to.be.greaterThan(0);
        return patch[0].request;
      });
    });
  }

  // The dialog closes on its onClose handler; Escape is the most robust trigger
  // (the top-right close IconButton's CloseIcon testid isn't always present).
  cancelViaClose() {
    cy.get(L.DIALOG).type('{esc}');
    return this;
  }

  assertDialogClosed() {
    cy.get(L.DIALOG, { timeout: 10000 }).should('not.exist');
    return this;
  }
}

export default InventoryCustomizeColumnsPage;
