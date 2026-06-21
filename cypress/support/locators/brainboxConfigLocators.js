// Locators for BrainBox Configuration UI
const BrainboxLocators = {
  header: () => cy.contains('h5', 'BrainBox Configuration'),
  label: (text) => cy.contains('label', text),
  comboboxWithinLabel: (labelText) => cy.contains('label', labelText).closest('.MuiFormControl-root').find('[role="combobox"]'),
  inputWithinLabel: (labelText) => cy.contains('label', labelText).closest('.MuiFormControl-root').find('input'),
  addPayloadButton: () => cy.contains('button', 'Add Payload Field'),
  saveButton: () => cy.contains('button', 'Save Configuration'),
  payloadTableRows: () => cy.get('table tbody tr'),
  lastPayloadRow: () => cy.get('table tbody tr').last(),
};

module.exports = BrainboxLocators;
