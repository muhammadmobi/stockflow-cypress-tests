// cypress/support/locators/InventoryAudit/createAuditLocators.js
//
// Locators for the create-audit screen at /abc/audits/new
// (cypress/e2e/InventoryAudit/02-CreateAuditTests.cy.js).
// Components: Frontend/src/components/ABC/CreateAudit.tsx
//             Frontend/src/components/ABC/LocationScopePicker.tsx
//             Frontend/src/components/ABC/AbcClassChip.tsx  (AbcClassSelect)
//
// Selector strategy, and why:
//   - "Audit Name" is a labelled MUI TextField, so findByLabelText resolves it.
//     Its helper text doubles as the validation channel — the component shows the
//     hint when untouched and the error only once `name` is non-empty, so
//     assertions read the helper text rather than an `aria-invalid` flag.
//   - Audit Type is a MUI ToggleButtonGroup: each option is a real button whose
//     accessible name is the label from AUDIT_TYPE_LABELS ("ABC Classification"
//     / "Location"), and the active one carries aria-pressed="true".
//   - The scope picker's drill-down is an unlabelled-by-role MUI select whose
//     label text CHANGES as you drill ("Select a facility / location" → "Drill
//     into X (or keep it as the scope)"), so it is addressed structurally as the
//     combobox inside the picker's own Box rather than by its label.
//   - Preview stats are `<Card variant="outlined">` tiles pairing an h6 value
//     with a caption label; read the value relative to the caption.

/**
 * Section labels for the REQUIRED fields.
 *
 * Each renders as `<Label> *` — the component appends an inline asterisk span
 * inside the same Typography — so the element's text is "Location Scope *", not
 * "Location Scope". An END-ANCHORED regex therefore never matches, which silently
 * broke every scope-picker query and made `assertClassSelectAbsent()` pass
 * vacuously (a `should('not.exist')` on a selector that could never resolve).
 * Verified against the rendered DOM on 2026-08-18. Start-anchor only.
 */
export const REQUIRED_LABEL = {
  auditType: /^audit type/i,
  abcClass: /^audit class/i,
  scope: /^location scope/i,
  workers: /^assigned workers/i,
};

/** Audit-type toggle labels — AUDIT_TYPE_LABELS in Frontend/src/enum/abcAudit.ts. */
export const AUDIT_TYPE_LABEL = {
  Abc: 'ABC Classification',
  Location: 'Location',
};

/** Bin-assignment option labels — AUDIT_ASSIGNMENT_STRATEGY_LABELS. */
export const STRATEGY_LABEL = {
  RoundRobin: 'Auto assignment',
  Manual: 'Manual (assign bins later)',
};

/** Preview tile captions. The first one is type-dependent — see plan E2E/TC57. */
export const PREVIEW_TILE = {
  binsAbc: 'Bins',
  binsLocation: 'Bins to walk',
  products: 'Products to count',
  expectedUnits: 'Expected units',
  serialized: 'Serialized',
};

const createAuditLocators = {
  // ── Chrome ──────────────────────────────────────────────────────────────
  pageHeading: () => cy.findByRole('heading', { name: /^create audit$/i }),
  backButton: () => cy.findByRole('button', { name: /^back$/i }),

  // ── Name ────────────────────────────────────────────────────────────────
  nameInput: () => cy.findByLabelText(/audit name/i),
  // MUI wires helper text to the input via aria-describedby.
  nameHelperText: () =>
    cy.findByLabelText(/audit name/i).then(($i) => cy.get(`#${$i.attr('aria-describedby')}`)),

  // ── Audit type ──────────────────────────────────────────────────────────
  auditTypeButton: (label) => cy.findByRole('button', { name: label }),
  auditTypeCaption: () => cy.contains(/targets a single abc class|counts every product physically found/i),

  // ── ABC class (Abc audits only) ─────────────────────────────────────────
  classSelectLabel: () => cy.contains(REQUIRED_LABEL.abcClass),
  classSelect: () => cy.findByLabelText(/abc class/i),

  // ── Assign on scan (Location audits only) ───────────────────────────────
  assignOnScanLabel: () => cy.contains(/assign to location on scan/i),
  // role="switch", not "checkbox" — see the note in auditSettingsLocators.js.
  assignOnScanSwitch: () => cy.findByRole('switch', { name: /on — assign immediately|off — count only/i }),
  assignOnScanCaption: () =>
    cy.contains(/gets placed into the bin|nothing is written to the warehouse location model/i),

  // ── Location scope picker ───────────────────────────────────────────────
  scopeSectionLabel: () => cy.contains(REQUIRED_LABEL.scope),
  /** The picker's Box is the next sibling content after its section label. */
  scopePicker: () => cy.contains(REQUIRED_LABEL.scope).parent(),
  scopeSelect: () => createAuditLocators.scopePicker().find('[role="combobox"]').first(),
  scopeBreadcrumbAllLink: () => createAuditLocators.scopePicker().findByRole('button', { name: /^all$/i }),
  scopeBreadcrumbChips: () => createAuditLocators.scopePicker().find('.MuiChip-root'),
  scopeLeafNote: () => cy.contains(/is a bin — the audit will count this bin/i),
  scopeHelperRequired: () => cy.contains(/required — pick the location to audit/i),

  // ── Workers ─────────────────────────────────────────────────────────────
  workersLabel: () => cy.contains(REQUIRED_LABEL.workers),
  /**
   * The worker Autocomplete's text input.
   *
   * NOT addressed by placeholder: the component sets
   * `placeholder={workers.length ? '' : 'Select one or more workers'}`, so the
   * placeholder VANISHES as soon as the first worker is chosen — a
   * findByPlaceholderText that works for the first selection then fails for the
   * second. The Autocomplete input carries `role="combobox"`, which is stable
   * whether or not anything is selected (verified 2026-08-18).
   */
  workerInput: () =>
    cy.contains(REQUIRED_LABEL.workers).parent().find('input[role="combobox"]'),
  /** Autocomplete options render into a portal listbox. */
  workerOption: (name) => cy.get('[role="listbox"]').findByRole('option', { name }),
  /**
   * The first worker in the open roster list, whoever that is.
   *
   * Some cases need *a* worker rather than a NAMED one — a live create against
   * whatever roster the tenant returns, or confirming a filtered list's single
   * remaining row. Naming one there would couple the test to tenant data.
   */
  firstWorkerOption: () => cy.get('[role="listbox"]').find('[role="option"]').first(),
  workerChips: () => cy.contains(REQUIRED_LABEL.workers).parent().find('.MuiChip-root'),

  // ── Bin assignment strategy ─────────────────────────────────────────────
  /**
   * The Bin Assignment select.
   *
   * `findByLabelText` resolves to the element the <label for> points at, which for
   * a MUI select is not the clickable surface — clicking it opens nothing and the
   * option list never appears. Target the combobox inside the same form control.
   */
  strategySelect: () => cy.contains('label', /bin assignment/i).parent().find('[role="combobox"]'),

  // ── Live preview ────────────────────────────────────────────────────────
  previewHeading: () => cy.contains(/^live preview$/i),
  previewPlaceholder: () =>
    cy.contains(/pick a (class and a )?location scope to preview/i),
  previewSpinner: () => cy.contains(/^live preview$/i).parent().find('.MuiCircularProgress-root'),
  previewError: () => cy.contains(/could not compute a preview for this scope/i),
  /** A preview tile's numeric value, addressed via its caption. */
  previewTileValue: (caption) => cy.contains('span,p', caption).closest('.MuiCard-root').find('h6'),
  previewEmptyWarning: () =>
    cy.contains(/no bins exist under this location|no binned inventory of class/i),
  previewUnmappedInfo: () => cy.contains(/this walk maps the location as it counts it/i),

  // ── Submit ──────────────────────────────────────────────────────────────
  submitButton: () => cy.findByRole('button', { name: /create audit|creating…/i }),
  submitHint: () => cy.contains(/are required\.$/),

  // ── Empty-scope confirmation ────────────────────────────────────────────
  emptyScopeDialog: () => cy.findByRole('dialog'),
  emptyScopeDialogTitle: () => cy.contains(/create an audit with no count tasks\?/i),
  goBackButton: () => cy.findByRole('dialog').findByRole('button', { name: /go back/i }),
  createAnywayButton: () => cy.findByRole('dialog').findByRole('button', { name: /create anyway/i }),
};

export default createAuditLocators;
