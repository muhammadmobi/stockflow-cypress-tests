// cypress/e2e/Chatbot/08-Feedback.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatMessage.tsx
//
// Decision-table feedback × rating:
//   col C1 — thumbs up   → POST /chatbot/feedback rating:'up'   (TC16)
//   col C2 — thumbs down → POST /chatbot/feedback rating:'down' (TC17)
// Both must carry the assistant `messageId`.
//
// The visual filled-icon swap is intentionally NOT asserted — see the
// page object for the long-form rationale.

import FeedbackPage from '../../pageObjects/Chatbot/FeedbackPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/feedback.json';

describe('StockWise AI Chatbot — Feedback', { tags: ['@regression'] }, () => {
  const page = new FeedbackPage();

  // Decision table col C1 — thumbs up posts rating:'up' with the messageId
  it('SW-CB-TC16: Thumbs-up sends rating:"up" with the assistant messageId', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epHappyText);
    page.interceptFeedback();
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);
    page.waitForReply();
    page.clickThumbsUpOnLatestAssistant();
    cy.wait('@feedback').then((intercept) => {
      expect(intercept.request.body.rating, 'feedback rating').to.eq('up');
      expect(intercept.request.body.messageId, 'feedback messageId').to.eq(
        data.stub.epHappyText.messageId,
      );
    });
  });

  // Decision table col C2 — thumbs down posts rating:'down' with the messageId
  it('SW-CB-TC17: Thumbs-down sends rating:"down" with the assistant messageId', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epHappyText);
    page.interceptFeedback();
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);
    page.waitForReply();
    page.clickThumbsDownOnLatestAssistant();
    cy.wait('@feedback').then((intercept) => {
      expect(intercept.request.body.rating, 'feedback rating').to.eq('down');
      expect(intercept.request.body.messageId, 'feedback messageId').to.eq(
        data.stub.epHappyText.messageId,
      );
    });
  });
});
