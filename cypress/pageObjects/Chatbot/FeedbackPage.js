// cypress/pageObjects/Chatbot/FeedbackPage.js
//
// Page object for the thumbs up/down feedback specs
// (cypress/e2e/Chatbot/08-Feedback.cy.js).
//
// The visual filled-icon swap on click is intentionally NOT exposed as
// an assertion: @iconify/react does not emit `data-icon` on the
// rendered SVG, and the wrapping IconButton's accessible name (Tooltip
// "Good response" / "Bad response") does not change between states.
// The user-visible *behaviour* under test is "feedback was sent" —
// verified deterministically by the `cy.wait('@feedback')` assertion
// on request body shape (rating + messageId). Treat the icon swap as a
// UX concern that's better validated by a screenshot test or by adding
// testids in a future Frontend pass.

import L from '../../support/locators/Chatbot/feedbackLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessage,
  interceptFeedback,
  waitForReply,
} from '../../support/Chatbot/chatbotHelpers';

class FeedbackPage {
  stubSuggestions(suggestions) {
    stubSuggestions(suggestions);
  }

  stubStreamFallback() {
    stubStreamFallback();
  }

  stubMessage(body, opts = {}) {
    stubMessage(body, opts);
  }

  interceptFeedback() {
    interceptFeedback();
  }

  waitForReply() {
    waitForReply();
  }

  openDrawerViaFab() {
    L.fab().click();
    L.drawerPaper().should('be.visible');
  }

  sendMessage(text) {
    L.chatInput().clear().type(`${text}{enter}`, { delay: 0 });
  }

  // Click the thumbs-up button on the most recent assistant message.
  // The locator returns the IconButton directly (via Tooltip-derived
  // accessible name), so no `.closest('button')` traversal is needed.
  clickThumbsUpOnLatestAssistant() {
    L.feedbackUpButtons().last().click();
  }

  clickThumbsDownOnLatestAssistant() {
    L.feedbackDownButtons().last().click();
  }
}

export default FeedbackPage;
