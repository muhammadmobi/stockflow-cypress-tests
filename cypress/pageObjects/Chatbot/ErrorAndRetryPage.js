// cypress/pageObjects/Chatbot/ErrorAndRetryPage.js
//
// Page object for the 5xx error + retry affordance spec
// (cypress/e2e/Chatbot/10-ErrorAndRetry.cy.js).
//
// Error guessing (project gotcha #7 — JWT expiry, mid-flow network
// failures): a 5xx on /chatbot/message must surface a retry affordance,
// and clicking retry must re-fire the request.
//
// The retry IconButton lives inside `.msg-actions` which has
// opacity:0 by default and only fades in on hover — Cypress's default
// visibility check would refuse to click it. `{ force: true }` skips
// the geometric visibility check; the click event still propagates
// correctly because the element is in the DOM and not pointer-events
// suppressed.

import L from '../../support/locators/Chatbot/errorAndRetryLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessageFailThenSucceed,
} from '../../support/Chatbot/chatbotHelpers';

class ErrorAndRetryPage {
  stubSuggestions(suggestions) {
    stubSuggestions(suggestions);
  }

  stubStreamFallback() {
    stubStreamFallback();
  }

  stubMessageFailThenSucceed(successBody) {
    stubMessageFailThenSucceed(successBody);
  }

  openDrawerViaFab() {
    L.fab().click();
    L.drawerPaper().should('be.visible');
  }

  sendMessage(text) {
    L.chatInput().clear().type(`${text}{enter}`, { delay: 0 });
  }

  // Used by TC19 to confirm the error bubble + retry affordance appear.
  // Note: the retry button lives inside `.msg-actions` (opacity:0 by
  // default, fades in on hover), so we cannot `should('be.visible')` —
  // existence in the DOM is the real signal that the error path
  // rendered the affordance. The subsequent click is forced for the
  // same reason.
  assertRetryAffordanceVisible() {
    L.retryButtons()
      .should('have.length.at.least', 1)
      .and('exist');
  }

  clickRetryOnLatestError() {
    L.retryButtons().last().click({ force: true });
  }

  // After the retry's 200 response lands, the recovery bubble's text
  // appears inside the drawer. Substring match keeps the assertion
  // resilient to copy tweaks in the fixture's response body.
  assertRecoveryMessageVisible(text) {
    L.drawerContainsText(text).should('be.visible');
  }
}

export default ErrorAndRetryPage;
