// cypress/support/locators/AssetID/assemblyLocators.js
//
// Locators for the Asset ID → Assembly screen (route /asset-id/assembly).
// Component: Frontend/src/pages/AssetIdReassembly.tsx.
//
// Two ordered steps, and the ordering IS the feature:
//   Step 1 — "New Product Serial Number" + Fetch. On success the input goes
//            disabled and Fetch is replaced by Clear.
//   Step 2 — "Scan Asset Code" + Add Scan. Both are DISABLED until step 1
//            resolves (the card also drops to opacity 0.5), and the scanned
//            codes accumulate in a table until "Assemble" commits them.
//
// The step-2 gating is asserted with the `disabled` attribute rather than the
// opacity, because opacity is styling and would make the test fail on a purely
// cosmetic change while still passing if the control became usable too early.

import generateAssetIdLocators from './generateAssetIdLocators';

const assemblyLocators = {
  inputWithinLabel: generateAssetIdLocators.inputWithinLabel,

  // ── Headings ───────────────────────────────────────────────────────────
  heading: 'Assembly',
  productDetailsHeading: 'Product Details',

  // ── Step 1 — parent serial ─────────────────────────────────────────────
  parentSerialLabel: 'New Product Serial Number',
  fetchBtnText: /^Fetch$/,
  clearBtnText: /^Clear$/,
  parentSerialPrefix: 'Serial Number:',
  parentProductPrefix: 'Product:',
  parentStatusChip: '.MuiChip-root',

  // ── Step 2 — asset codes ───────────────────────────────────────────────
  assetCodeLabel: 'Scan Asset Code',
  addScanBtnText: /^Add Scan$/,
  assembleBtnText: /^Assemble$/,

  // The scanned-codes table is the ONLY table on this screen, so it needs no
  // card scoping — unlike Disassembly (see disassemblyLocators).
  scannedTable: 'table',
  scannedTableRow: 'tbody tr',
  removeRowBtn: 'button',

  // ── Empty states ───────────────────────────────────────────────────────
  emptyNoCodesScanned: 'No asset codes scanned yet.',

  // ── Shared ─────────────────────────────────────────────────────────────
  alert: generateAssetIdLocators.alert,
};

export default assemblyLocators;
