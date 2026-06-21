const categoryLocators = {
  addCategory: () => cy.findByRole("button", { name: /ADD CATEGORY/i }),
  categoryName: () => cy.get('.MuiDialog-root input[name="name"]'),
  nameInput: 'input[name="name"]',
  allowItemsToggle: 'input[name="allowItems"]',

  rowsDropDown: 'div[role="combobox"]',
  tableRows: "tbody tr",
  firstColumnCells: "tbody tr td:first-child",

  /**
   * Get table row by category name
   * @param {string} catName - Category name to find
   * @returns {Cypress.Chainable} Table row containing the category
   */
  categoryRow: (catName) => cy.contains("tbody tr", catName),

  /**
   * Get category name cell by category name
   * @param {string} catName - Category name to find
   * @returns {Cypress.Chainable} First td cell containing the category name
   */
  categoryNameCell: (catName) =>
    cy.contains('tbody tr td[data-index="0"]', catName),

  /**
   * Manage Attribute button for a specific category row
   * @param {string} catName - exact category name text in the first column
   */
  manageAttributeBtn: (catName) =>
    cy.contains("tr", catName).contains("button", "Manage Attribute"),

  /**
   * "Manage Product Name" action button for a specific category row
   * @param {string} catName - exact category name text in the first column
   */
  manageProductNameBtn: (catName) =>
    cy.contains("tr", catName).contains("button", /Manage Product Name/i),

  manageHierarchyBtn: (catName) =>
    cy.contains("tr", catName).contains("button", /Manage Hierarchy/i),

  // ── Product Name Modal ──────────────────────────────────────────────────────
  // The modal that opens after clicking "Manage Product Name"
  productNameModal: "#product-name-form",

  // Multi-select / combo-box inside the Product Name modal
  productNameDropdownInput: '#product-name-form input[role="combobox"]',

  // Dropdown option list
  productNameOptionsList: '[id^="react-select-"][id$="-listbox"]',

  // Tag chips already selected inside the modal
  productNameTags: '#product-name-form div[class*="-multiValue"]',

  // Save button inside Product Name modal
  productNameSaveBtn: () =>
    cy
      .get("#product-name-form")
      .closest(".MuiDialog-root")
      .contains("button", /^Save$/i),

  /**
   * MaterialReactTable sort label for a specific column
   * @param {string} columnName - Column name to sort by (e.g., "Category Name")
   */
  sortLabelByColumn: (columnName) =>
    cy.get(
      `span.MuiTableSortLabel-root[role="button"][aria-label*="${columnName}"]`,
    ),

  // Modal/Dialog elements
  modalDialog: ".MuiDialog-root",
  dialogActions: ".MuiDialogActions-root",

  // Buttons
  saveButton: () => cy.contains("button", /^Save$/),
  saveAndAddAttributeButton: () =>
    cy.contains("button", /Save & Add Attribute/i),
  cancelButton: () => cy.contains("button", /^Cancel$/i),
  updateButton: () => cy.findByRole("button", { name: /^Update$/i }),
  yesButton: () => cy.contains("button", /^Yes$/i),
  noButton: () => cy.contains("button", /^No$/i),

  // ── Manage Hierarchy Modal ──────────────────────────────────────────────────
  manageHierarchyModal: '[data-rfd-droppable-id="available-attributes"]',
  attribNameAvailableList: "p",
  attribNameDependencyList: '[data-rfd-droppable-id="dependency-list"] p',
  dependencyList: '[data-rfd-droppable-id="dependency-list"]',
  attributeList: '[data-rfd-droppable-id="available-attributes"]',
};

export default categoryLocators;
