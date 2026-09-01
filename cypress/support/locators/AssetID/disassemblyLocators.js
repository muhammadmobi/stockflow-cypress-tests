// cypress/support/locators/AssetID/disassemblyLocators.js
//
// Locators for the Asset ID → Disassembly screen (route /asset-id/disassembly).
// Component: Frontend/src/pages/AssetIdDisassembly.tsx.
//
// The screen stacks FIVE cards, three of which render a <table>:
//   1. "Scan Serial Number"        — serial input + Scan button
//   2. "Select Found Item"         — table, one Radio per matched serial
//   3. "Previously Generated Labels" — table (children created by this flow)
//   4. "Assembled Items"           — table (children reassembled INTO this serial)
//   5. "Disassembly Labels"        — category / product / qty / assignment / actions
//
// Because three tables coexist, EVERY table assertion must be scoped to its
// card. `cardByHeading` is the only supported way to do that — an unscoped
// `cy.get('table')` matches whichever card rendered first and silently asserts
// against the wrong data (the same class of bug documented for the Inventory
// quick-view panel in project gotcha #22).

import generateAssetIdLocators from './generateAssetIdLocators';

/**
 * The MuiCard that owns a given heading. Scopes every table/row query to one
 * card so the three sibling tables can never be confused.
 */
const cardByHeading = (headingText) =>
  cy.contains('.MuiCard-root .MuiTypography-root', headingText).closest('.MuiCard-root');

const disassemblyLocators = {
  inputWithinLabel: generateAssetIdLocators.inputWithinLabel,
  comboboxWithinLabel: generateAssetIdLocators.comboboxWithinLabel,
  cardByHeading,

  // ── Card headings (the scoping anchors) ────────────────────────────────
  scanCardHeading: 'Scan Serial Number',
  foundItemsCardHeading: 'Select Found Item',
  generatedLabelsCardHeading: 'Previously Generated Labels',
  assembledItemsCardHeading: 'Assembled Items',
  disassemblyLabelsCardHeading: 'Disassembly Labels',

  // ── Card 1 — scan ──────────────────────────────────────────────────────
  serialLabel: 'Serial Number',
  scanBtnText: /^Scan$/,
  parentSerialPrefix: 'Parent Serial:',

  // ── Card 2 — found items table ─────────────────────────────────────────
  emptyFoundItemsText: 'Scan a serial number to load items.',
  rowRadio: 'input[type="radio"]',

  emptyAssembledItemsText: 'No items have been assembled into this serial number.',

  // ── Card 5 — disassembly labels form ───────────────────────────────────
  categoryLabel: 'Category',
  productLabel: 'Product',
  labelQuantityLabel: 'Label Quantity',
  summarySelectedItemPrefix: 'Selected Item:',
  summaryTargetCategoryPrefix: 'Target Category:',
  summaryTargetProductPrefix: 'Target Product:',

  previewBtnText: /^Preview Asset IDs$/,
  printLabelsBtnText: /^Print Labels$/,
  reprintBtnText: /^Reprint Last Labels$/,

  // ── Preview panel + shared listbox / alerts / toasts ───────────────────
  // Same panel component as the Generate screen — see generateAssetIdLocators
  // for why the count is read from the heading rather than by counting <img>.
  previewHeadingPrefix: generateAssetIdLocators.previewHeadingPrefix,
  previewHeadingWithCount: generateAssetIdLocators.previewHeadingWithCount,
  previewPanel: generateAssetIdLocators.previewPanel,
  previewCardImg: generateAssetIdLocators.previewCardImg,
  listbox: generateAssetIdLocators.listbox,
  option: generateAssetIdLocators.option,
  alert: generateAssetIdLocators.alert,
};

export default disassemblyLocators;
