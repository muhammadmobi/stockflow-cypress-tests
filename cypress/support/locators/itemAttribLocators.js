// cypress/support/locators/itemAttribLocators.js

const ItemAttribLocators = {
  // ─── Navigation ────────────────────────────────────────────────
  itemAttribOptionTxt: "Attribute",
  configurationNavTxt: "Configuration",
  categoriesNavTxt: "Categories",
  attributeFormLabel: "Attribute",
  navSpan: "span",

  // ─── Buttons (function-based for findByRole) ──────────────────
  addAttribute: () => cy.findByRole("button", { name: "Add Attribute" }),
  saveandAddNew: () => cy.findByRole("button", { name: /Save & Add New/i }),
  saveBt: () => cy.findByRole("button", { name: "Save" }),
  updateBt: 'button[form="attribute-form"]',
  cancelBt: "button",
  cancelBtText: "Cancel",
  submitBt: 'button[type="submit"]',
  submitExcludeAddNew: ':contains("Add New")',
  saveBtText: "Save",
  saveAndAddNewText: "Save & Add New",
  confirmYesBtRole: /^Yes$/i,

  // ─── Form Inputs ──────────────────────────────────────────────
  itemName: "input#name",
  itemDefaultValue: "input#defaultValue",
  minLengthTxtBox: "input#minLength",
  maxLengthTxtBox: "input#maxLength",
  minValueTxtBox: "input#min",
  maxValueTxtBox: "input#max",
  formElement: 'form#attribute-form',

  // ─── Toggles / Switches ──────────────────────────────────────
  requiredCheckBox: 'input[role="switch"][name="required"]',
  requiredLabel: 'label[for="required"]',
  preventDupCheckBox: 'input[type="checkbox"][name="unique"]',
  preventDupLabel: "Prevent Duplicate Value",
  checkboxInput: 'input[type="checkbox"]',
  checkedByDefaultLabel: "Checked by default",

  // ─── V-Lookup locators ────────────────────────────────────────
  vLookupToggleLabel: "Enabled V-Lookups",
  vLookupToggleInput: 'input[type="checkbox"]',
  vLookupTypeDropdown: ".MuiSelect-select",
  vLookupKeyInput: 'input[placeholder="Key"]',
  vLookupValueInput: 'input[placeholder="Value"]',
  vLookupMatchContains: "Contains",
  vLookupMatchExact: "Exact",
  vLookupAddMoreText: "Add More",
  menuItemRoot: ".MuiMenuItem-root",

  // ─── Type selector (react-select) ─────────────────────────────
  select: ".select__control",
  selectControl: ".select__control",
  selectOpt: ".select__menu-list .select__option",
  selectMenu: ".select__menu",
  selectSingleValue: ".select__single-value",

  // ─── Table row ────────────────────────────────────────────────
  tableRow: "tr",
  tableCell: "td",
  rowText: "p",
  editBt: "Edit",
  deleteBt: "Delete",

  // ─── Required column in list ──────────────────────────────────
  requiredYes: "Yes",
  requiredNo: "No",

  // ─── Tabs ─────────────────────────────────────────────────────
  productTab: "#simple-tab-0",
  variantTab: "#simple-tab-1",
  itemTab: "#simple-tab-2",

  // ─── List Options ─────────────────────────────────────────────
  addMoreBt: "button#demo-customized-button",
  addMoreMenu: "#demo-customized-menu",
  menuItemAddRow: () => cy.findByRole("menuitem", { name: /ADD Row/i }),
  menuItemAddBulk: () => cy.findByRole("menuitem", { name: /Bulk Addition/i }),
  addRowText: "Add Row",
  bulkAdditionText: "Bulk Addition",
  bulkAdditionTextarea: "textarea[placeholder*='comma']",
  bulkAddConfirmPattern: /^Add$/,
  listOptionStack: ".MuiStack-root",

  // ─── Delete confirmation ──────────────────────────────────────
  confirmDeleteHeading: "Confirm Attribute Deletion",
  confirmDialog: ".MuiDialog-root",
  confirmPattern: /yes|confirm/i,

  // ─── Validation errors ────────────────────────────────────────
  helperText: ".MuiFormHelperText-root",

  // ─── API Field Name (preview section) ─────────────────────────
  apiFieldNameLabel: "API Field Name",

  // ─── Category ─────────────────────────────────────────────────
  manageAttributeBt: "Manage Attribute",
  addCategoryDialogTxt: "Add category",
};

const ListRowInputLoc = (index) => `input#listOptions\\.${index}\\.label`;

export { ItemAttribLocators, ListRowInputLoc };
