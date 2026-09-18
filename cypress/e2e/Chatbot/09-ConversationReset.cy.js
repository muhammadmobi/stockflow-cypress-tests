// cypress/e2e/Chatbot/09-ConversationReset.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatbotDrawer.tsx
//
// State transition — Conversation → New: clears messages and resets
// the conversationId UUID (TC18). After "New chat" the messages list
// is empty again — the drawer falls back to the empty-state suggestion
// view — and a follow-up send carries a fresh conversationId.

import ConversationResetPage from '../../pageObjects/Chatbot/ConversationResetPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/conversationReset.json';

describe('StockWise AI Chatbot — Conversation reset', { tags: ['@regression'] }, () => {
  const page = new ConversationResetPage();

  // State transition — Conversation → New: clears messages + resets conversationId
  it('SW-CB-TC18: "New chat" clears messages and resets conversationId', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epHappyText);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();

    page.sendMessage(data.input.epShortText);
    let firstConversationId = null;
    cy.wait('@sendMessage').then((intercept) => {
      firstConversationId = intercept.request.body.conversationId;
      expect(firstConversationId, 'first conversationId').to.be.a('string').and.not.be.empty;
    });

    page.clickNewChat();
    page.assertConversationCleared();

    page.sendMessage(data.input.epShortText);
    cy.wait('@sendMessage').then((intercept) => {
      expect(
        intercept.request.body.conversationId,
        'second conversationId must differ — handleNewChat regenerates the UUID',
      ).to.not.eq(firstConversationId);
    });
  });
});
