// Scan Config Page Locators

export const SCAN_CONFIG_LOCATORS = {
  // Navigation
  CONFIGURATION_LINK: "Configuration",
  SCAN_CONFIG_LINK: /^Scan Config$/,

  // Buttons
  UPDATE_BUTTON: "Update",
  CLEAR_BUTTON: "Clear",

  // Checkboxes
  CHECKBOX_BY_ARIA_LABEL: (labelText) => `span[aria-label="${labelText}"]`,
  CHECKBOX_CONTAINER: "label.MuiFormControlLabel-root",
  CHECKBOX_INPUT: 'input[type="checkbox"]',

  // Text/Count
  SELECTED_COUNT_CONTAINER: "p:contains('Selected:')",
  SELECTED_COUNT_SPAN: "p:contains('Selected:') span",

  // Toast
  TOAST_MESSAGE: (message) => `*:contains('${message}')`,
};

export default SCAN_CONFIG_LOCATORS;
