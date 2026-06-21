import LoginPage from '../pageObjects/loginPage'
describe('Login Page', () => {

  const loginPage = new LoginPage()
  let loginData
  let userData

  before(() => {
    cy.fixture('loginPageData').then((data) => {
      loginData = data
    })
    cy.fixture('users').then((data) => {
      userData = data
    })
  })

  // UI Elements verification - only needs to visit once
  describe('Login Page UI Elements', () => {
    beforeEach(() => {
      loginPage.visit()
    })

    it('SW-AUTH-TC01: Verify page heading', () => {
      loginPage.verifyPageHeading(loginData.pageHeading)
    })

    it('SW-AUTH-TC02: Verify email field label', () => {
      loginPage.verifyEmailLabel(loginData.labels.email)
    })

    it('SW-AUTH-TC03: Verify password field label', () => {
      loginPage.verifyPasswordLabel(loginData.labels.password)
    })

    it('SW-AUTH-TC04: Verify sign in button caption', () => {
      loginPage.verifySignInButton(loginData.buttons.signIn)
    })
  })

  // All interactive tests share a single beforeEach
  describe('Login Form Interactions', () => {
    beforeEach(() => {
      loginPage.visit()
    })

    afterEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
    })

    // Required field errors
    it('SW-AUTH-TC05: Verify email field required error message', () => {
      loginPage.submit()
      loginPage.verifyFieldError(loginData.errors.emailRequired)
    })

    it('SW-AUTH-TC06: Verify password field required error message', () => {
      loginPage.submit()
      loginPage.verifyFieldError(loginData.errors.passwordRequired)
    })

    // Invalid credentials
    it('SW-AUTH-TC07: Verify error message on invalid email', () => {
      loginPage.enterEmail(userData.invalid.email)
      loginPage.enterPassword(userData.admin.password)
      loginPage.submit()
      loginPage.verifyErrorMessage(loginData.errors.invalidCredentials)
    })

    it('SW-AUTH-TC08: Verify error message on invalid password', () => {
      loginPage.enterEmail(userData.admin.email)
      loginPage.enterPassword(userData.invalid.password)
      loginPage.submit()
      loginPage.verifyErrorMessage(loginData.errors.invalidCredentials)
    })

    // Password toggle
    it('SW-AUTH-TC09: Verify show password when toggle clicked', () => {
      loginPage.enterPassword(userData.admin.password)
      loginPage.togglePasswordVisibility()
      loginPage.getPasswordInput()
        .should('have.attr', 'type', 'text')
    })

    it('SW-AUTH-TC10: Verify hide password when toggle clicked again', () => {
      loginPage.enterPassword(userData.admin.password)
      loginPage.togglePasswordVisibility()
      loginPage.togglePasswordVisibility()
      loginPage.getPasswordInput()
        .should('have.attr', 'type', 'password')
    })

    // Successful login
    it('SW-AUTH-TC11: Verify successful admin login', () => {
      loginPage.login(userData.admin.email, userData.admin.password)
      cy.url().should('include', loginData.routes.dashboard)
      cy.contains(loginData.landingPage.title).should('be.visible')
    })

    it('SW-AUTH-TC12: Verify admin profile panel shows Admin role', () => {
      loginPage.login(userData.admin.email, userData.admin.password)
      cy.url().should('include', loginData.routes.dashboard)
      loginPage.clickProfileIcon()
      loginPage.verifyProfileRole(loginData.profile.adminRole)
    })

    it('SW-AUTH-TC13: Verify logout redirects to login page', () => {
      loginPage.login(userData.admin.email, userData.admin.password)
      cy.url().should('include', loginData.routes.dashboard)
      loginPage.clickProfileIcon()
      loginPage.clickLogout()
      cy.url().should('include', '/auth/jwt/sign-in')
    })

    it('SW-AUTH-TC14: Verify successful user login', () => {
      loginPage.login(userData.worker.email, userData.worker.password)
      cy.url().should('include', loginData.routes.userview)
      cy.contains(loginData.landingPage.heading).should('be.visible')
    })

    it('SW-AUTH-TC15: Verify user profile panel shows User role', () => {
      loginPage.login(userData.worker.email, userData.worker.password)
      cy.url().should('include', loginData.routes.userview)
      loginPage.clickProfileIcon()
      loginPage.verifyProfileRole(loginData.profile.userRole)
    })
  })
})
