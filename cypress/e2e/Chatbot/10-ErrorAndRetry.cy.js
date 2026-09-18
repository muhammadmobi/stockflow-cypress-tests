// cypress/e2e/Chatbot/10-ErrorAndRetry.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatbotDrawer.tsx +
//             ChatMessage.tsx
//
// Error guessing (project gotcha #7 — JWT expiry, mid-flow network
// failures): a 5xx on /chatbot/message must surface a retry affordance,
// and clicking retry must re-fire the request (TC19).

import ErrorAndRetryPage from '../../pageObjects/Chatbot/ErrorAndRetryPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/errorAndRetry.json';

describe('StockWise AI Chatbot — Error & retry', { tags: ['@regression'] }, () => {
  const page = new ErrorAndRetryPage();

  // Error guessing — 5xx mid-flow → error bubble + retry affordance;
  // clicking retry re-fires the request.
  it('SW-CB-TC19: 5xx surfaces error bubble + retry; retry re-sends successfully', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessageFailThenSucceed(data.stub.epRetrySuccess);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);
    cy.wait('@sendMessage'); // first call → 500 → error bubble
    page.assertRetryAffordanceVisible();

    page.clickRetryOnLatestError();
    cy.wait('@sendMessage'); // second call → 200 → recovery bubble
    page.assertRecoveryMessageVisible('Recovery succeeded');
  });
});
