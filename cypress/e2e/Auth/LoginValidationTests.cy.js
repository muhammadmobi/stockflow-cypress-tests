import LoginPage from '../../pageObjects/loginPage';
import { faker } from '@faker-js/faker';

/**
 * Login - Validation & Edge Cases
 * -------------------------------
 * Additive edge-case coverage that complements the core login suite
 * (00-loginPageTest.cy.js, SW-AUTH-TC01..15): field masking, email-format
 * handling, unknown credentials, whitespace, repeated failures and long-input
 * boundaries. All rejected-login data is faker-generated so no real account is
 * ever submitted.
 */
describe('Login - Validation & Edge Cases', () => {
  const loginPage = new LoginPage();
  let loginData;

  before(() => {
    cy.fixture('loginPageData').then((d) => { loginData = d; });
  });

  beforeEach(() => {
    loginPage.visit();
  });

  afterEach(() => {
    cy.clearLocalStorage();
    cy.clearCookies();
  });

  it('SW-AUTH-TC16: password field is masked by default', () => {
    loginPage.enterPassword(faker.internet.password({ length: 10 }));
    loginPage.getPasswordInput().should('have.attr', 'type', 'password');
  });

  it('SW-AUTH-TC17: an invalid email format keeps the user on the sign-in page', () => {
    loginPage.enterEmail('not-an-email');
    loginPage.enterPassword(faker.internet.password({ length: 10 }));
    loginPage.submit();
    cy.url().should('include', '/auth/jwt/sign-in');
  });

  it('SW-AUTH-TC18: unknown credentials show the invalid-credentials error', () => {
    loginPage.enterEmail(faker.internet.email());
    loginPage.enterPassword(faker.internet.password({ length: 12 }));
    loginPage.submit();
    loginPage.verifyErrorMessage(loginData.errors.invalidCredentials);
  });

  it('SW-AUTH-TC19: leading/trailing whitespace around an unknown email is rejected', () => {
    loginPage.enterEmail(`   ${faker.internet.email()}   `);
    loginPage.enterPassword(faker.internet.password({ length: 12 }));
    loginPage.submit();
    cy.url().should('include', '/auth/jwt/sign-in');
  });

  it('SW-AUTH-TC20: repeated failed attempts keep surfacing the error', () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      loginPage.enterEmail(faker.internet.email());
      loginPage.enterPassword(faker.internet.password({ length: 12 }));
      loginPage.submit();
      loginPage.verifyErrorMessage(loginData.errors.invalidCredentials);
    }
  });

  it('SW-AUTH-TC21: an over-long input is handled without leaving the sign-in page', () => {
    loginPage.enterEmail(`${faker.string.alpha(256)}@example.com`);
    loginPage.enterPassword(faker.string.alphanumeric(256));
    loginPage.submit();
    cy.url().should('include', '/auth/jwt/sign-in');
  });

  it('SW-AUTH-TC22: submitting with only the email filled flags the password as required', () => {
    loginPage.enterEmail(faker.internet.email());
    loginPage.submit();
    loginPage.verifyFieldError(loginData.errors.passwordRequired);
  });

  it('SW-AUTH-TC23: submitting with only the password filled flags the email as required', () => {
    loginPage.enterPassword(faker.internet.password({ length: 10 }));
    loginPage.submit();
    loginPage.verifyFieldError(loginData.errors.emailRequired);
  });
});
