// cypress/support/locators/InventoryAudit/auditDetailLocators.js
//
// Locators for the audit detail / bin-assignment screen at /abc/audits/:id
// (cypress/e2e/InventoryAudit/05-AuditAssignmentTests.cy.js).
// Component: Frontend/src/components/ABC/AuditDetail.tsx
//
// Selector strategy, and why:
//   - The bins table is a PLAIN MUI <Table>, not MaterialReactTable, so rows are
//     addressed by index and cells by column position — there is no row id.
//   - Each unlocked row's worker control is a MUI `TextField select` inside the
//     last cell. There is one per row and they are otherwise identical, so they
//     are addressed through their row, never globally.
//   - A LOCKED row (bin no longer Pending) renders plain text
//     "<name|Unassigned> (locked)" instead of a select. Absence of the select is
//     the observable fact, which is what `workerSelect` / `lockedWorkerText`
//     let a test assert either way.
//   - The Save button's label carries the pending-change count — `Save (3)` —
//     so a name regex must tolerate the suffix.

/** Bins-table column order as rendered by AuditDetail.tsx. */
export const BIN_COLUMNS = ['Bin', 'Products', 'Expected', 'Status', 'Assigned worker'];

const auditDetailLocators = {
  // ── Header ──────────────────────────────────────────────────────────────
  backButton: () => cy.findByRole('button', { name: /^back$/i }),
  auditName: (name) => cy.contains('h5', name),
  statusChip: (status) => cy.get('.MuiChip-root').contains(status),
  reviewButton: () => cy.findByRole('button', { name: /(review|view) discrepancies/i }),
  reportButton: () => cy.findByRole('button', { name: /^report$/i }),

  /**
   * A header summary item, addressed via its caption label.
   *
   * Scoped to `.MuiTypography-caption` deliberately: HeaderItem renders the LABEL as
   * a caption and the VALUE as a body2 paragraph, and for a Location-type audit the
   * value is literally the word "Location" — so a bare `cy.contains('span,p', /^Location$/)`
   * matched the value and `.parent()` then yielded a box containing only that word.
   * Verified against the rendered DOM on 2026-08-19.
   */
  headerItem: (label) =>
    cy.get('.MuiTypography-caption').contains(new RegExp(`^${label}$`, 'i')).parent(),

  // ── Generation state ────────────────────────────────────────────────────
  generatingNotice: () => cy.contains(/generating count tasks/i),
  noBinsWarning: () => cy.contains(/generated no count bins/i),
  noWorkersNotice: () => cy.contains(/this audit has no workers assigned/i),

  // ── Bins table ──────────────────────────────────────────────────────────
  binsSectionTitle: () => cy.contains(/^bin assignments$/i),
  table: () => cy.get('table'),
  columnHeaders: () => cy.get('table thead th'),
  rows: () => cy.get('table tbody tr'),
  row: (index) => cy.get('table tbody tr').eq(index),
  cell: (rowIndex, columnName) =>
    cy.get('table tbody tr').eq(rowIndex).find('td').eq(BIN_COLUMNS.indexOf(columnName)),

  /** The row whose Bin cell shows this location code. */
  rowByBinCode: (code) => cy.get('table tbody tr').contains('td', code).parent(),

  // ── Per-row worker control ──────────────────────────────────────────────
  workerSelect: (rowIndex) =>
    cy.get('table tbody tr').eq(rowIndex).find('[role="combobox"]'),
  /** Locked rows render text instead of a select. */
  lockedWorkerText: (rowIndex) =>
    cy.get('table tbody tr').eq(rowIndex).find('td').eq(BIN_COLUMNS.indexOf('Assigned worker')),
  /** Options live in a portal listbox once a select is open. */
  openOptionList: () => cy.get('[role="listbox"]'),
  option: (label) => cy.get('[role="listbox"]').findByRole('option', { name: label }),

  // ── Save ────────────────────────────────────────────────────────────────
  // The label is `Save`, `Save (N)` or `Saving…` depending on state.
  saveButton: () => cy.findByRole('button', { name: /^(save( \(\d+\))?|saving…)$/i }),
};

export default auditDetailLocators;
