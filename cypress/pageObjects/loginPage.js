import loginLocators from "../support/locators/loginLocators";

class LoginPage {
  visit() {
    cy.visit('/auth/jwt/sign-in');
  }

  // Type into email field
  enterEmail(email) {
    loginLocators.emailField().clear().type(email);
  }

  // Type into password field
  enterPassword(password) {
    loginLocators.passwordField().clear().type(password);
  }

  // Click sign in button
  submit() {
    loginLocators.submitButton().click();
  }

  // Toggle password visibility
  togglePasswordVisibility() {
    loginLocators.passwordToggle().click();
  }

  // Get password input element
  getPasswordInput() {
    return loginLocators.passwordField();
  }

  // Verify page heading
  verifyPageHeading(expectedHeading) {
    return loginLocators.pageHeading(expectedHeading).should('be.visible');
  }

  // Verify email field label
  verifyEmailLabel(expectedLabel) {
    return loginLocators.emailLabel(expectedLabel).should('be.visible');
  }

  // Verify password field label
  verifyPasswordLabel(expectedLabel) {
    return loginLocators.passwordLabel(expectedLabel).should('be.visible');
  }

  // Verify sign in button
  verifySignInButton(expectedText) {
    return loginLocators.submitButton().should('be.visible').and('contain', expectedText);
  }

  // Verify alert error message (e.g. invalid credentials)
  verifyErrorMessage(expectedMessage) {
    return loginLocators.alertMessage().should('be.visible').and('contain', expectedMessage);
  }

  // Verify inline field validation error (e.g. required field)
  verifyFieldError(expectedError) {
    return cy.contains(expectedError).should('be.visible');
  }

  // Combined login method
  login(email, password) {
    this.enterEmail(email);
    this.enterPassword(password);
    this.submit();
  }

  // Open profile panel by clicking the account icon
  clickProfileIcon() {
    loginLocators.profileIcon().click();
  }

  // Verify username/role shown in the profile panel heading
  verifyProfileRole(expectedRole) {
    return loginLocators.pageHeading(expectedRole).should('be.visible');
  }

  // Click logout from the profile panel
  clickLogout() {
    loginLocators.logoutButton().click();
  }
}

export default LoginPage;
