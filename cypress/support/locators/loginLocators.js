// cypress/support/locators/loginLocators.js

const loginLocators = {
    emailField:      () => cy.findByRole('textbox', { name: /email/i }),
    emailLabel:      (label) => cy.findByRole('textbox', { name: new RegExp(label, 'i') }),
    passwordField:   () => cy.findByLabelText(/password/i),
    passwordLabel:   (label) => cy.findByLabelText(new RegExp(label, 'i')),
    submitButton:    () => cy.findByRole('button', { name: /sign in/i }),
    passwordToggle:  () => cy.get('input[name="password"] ~ div button, input[name="password"] + div button').first(),
    alertMessage:    () => cy.findByRole('alert'),
    pageHeading:     (name) => cy.findByRole('heading', { name: new RegExp(name, 'i') }),
    profileIcon:     () => cy.findByRole('button', { name: /account|my profile|open settings/i }),
    logoutButton:    () => cy.findByRole('button', { name: /logout/i }),
};

export default loginLocators;  // Exporting the loginLocators object
  