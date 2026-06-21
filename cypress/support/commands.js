
import LoginPage from "../pageObjects/loginPage";
import '@testing-library/cypress/add-commands'
import 'cypress-mochawesome-reporter/register';

// Central helper to read the JWT from localStorage.
// Update this one place if the storage key or token path ever changes.
Cypress.Commands.add('getAuthToken', () => {
  return cy.window().then((win) => {
    const ls = JSON.parse(win.localStorage.getItem('stock-wise') || '{}');
    return ls?.App?.user?.accessToken ?? null;
  });
});

Cypress.Commands.add('login', () => {
  const email = Cypress.env('email');
  const pass = Cypress.env('pass');
  cy.visit('/');
  const loginPage = new LoginPage();
  loginPage.enterEmail(email);
  loginPage.enterPassword(pass);
  loginPage.submit();
  cy.url().should('include', '/dashboard');
});

// Reusable session command for admin (uses env credentials)
Cypress.Commands.add('adminSession', () => {
  cy.session('admin-session', () => {
    cy.login();
  }, {
    validate() {
      cy.getAuthToken().should('not.be.null');
    },
  });
});

// Reusable session command for worker role
Cypress.Commands.add('workerSession', () => {
  cy.session('worker-session', () => {
    cy.fixture('users').then((users) => {
      expect(users.worker, 'users.json must contain a worker object').to.exist;
      cy.visit('/');
      const loginPage = new LoginPage();
      loginPage.enterEmail(users.worker.email);
      loginPage.enterPassword(users.worker.password);
      loginPage.submit();
      // Workers may land on /MobileViewScreen instead of /dashboard depending on
      // role-based default route; accept either as a successful login signal.
      cy.url().should('match', /\/(dashboard|MobileViewScreen)/);
    });
  }, {
    validate() {
      cy.getAuthToken().should('not.be.null');
    },
  });
});

