const InvViewLocators = {
  InvViewLinkTxt: () => cy.contains("span", /^Inventory$/).click(),
  ViewsDropDown: "//div[contains(@class, 'select__control')]",
  selectOpt: ".select__menu-list .select__option",
  addProductBt: () => cy.findByRole("button", { name: "Add Product" }),
  categoryDropdown: 'input[name="category"]',
  tableHeader: "tr.MuiTableRow-head",
  tableRow: "tbody tr",

  // Product search bar & submit (used by openChangeStatusDialog)
  // Scoped to category-form to avoid matching multiple submit buttons on page
  searchInput: '#searchInputRef',
  searchSubmitBtn: '#category-form button[type="submit"]:visible',

  // Change Status dialog
  changeStatusDialog: '[role="dialog"]',
  changeStatusDialogStatusPlaceholder: 'Choose Status',
  changeStatusDialogDamageReasonPlaceholder: 'Select damage reason',
  changeStatusDialogSubmitBtn: '[role="dialog"] button',
  changeStatusQtyInput: '#quantity',
};

export default InvViewLocators;
