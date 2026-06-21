// cypress/support/locators/InvGroupByLocators.js
// Locators for the Inventory Group By feature (ItemList.tsx — Autocomplete + Popover).

const InvGroupByLocators = {
  // MUI Autocomplete root — unique on /inventory toolbar (category uses React-Select)
  autocompleteRoot:   '.MuiAutocomplete-root',
  // Placeholder input shown when no fields are selected
  emptyInput:         'input[placeholder="Select fields"]',
  // Options listbox rendered when the autocomplete is open
  optionsListbox:     '[role="listbox"]',
  optionItem:         '[role="option"]',
  // Filled primary chip = one selected field (first chip visible in the input)
  filledChip:         '.MuiAutocomplete-root .MuiChip-filled',
  // Outlined overflow chip "+N" shown when more than 1 field is selected
  overflowChip:       '.MuiAutocomplete-root .MuiChip-outlined',
  // Popover opened by clicking the overflow chip
  popover:            '.MuiPopover-paper',
  popoverTitle:       '.MuiPopover-paper .MuiTypography-subtitle2',
  popoverChip:        '.MuiPopover-paper .MuiChip-root',
  popoverChipDelete:  '.MuiPopover-paper .MuiChip-deleteIcon',
  popoverCloseBtn:    '.MuiPopover-paper button',
  // Row-action button inside table body (absent when grouping is enabled)
  tbodyRowAction:     'tbody tr td button#long-button',
};

export default InvGroupByLocators;
