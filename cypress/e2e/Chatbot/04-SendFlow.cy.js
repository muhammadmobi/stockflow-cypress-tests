// cypress/e2e/Chatbot/04-SendFlow.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatbotDrawer.tsx +
//             ChatInput.tsx + ChatMessage.tsx
//
// Use case — golden-path send: type + Enter → user bubble + assistant
// bubble (TC08). EP — input partition: Shift+Enter inserts a newline
// and does NOT submit (TC09).

import SendFlowPage from '../../pageObjects/Chatbot/SendFlowPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/sendFlow.json';

describe('StockWise AI Chatbot — Send flow', { tags: ['@regression'] }, () => {
  const page = new SendFlowPage();

  // Use case — golden path send: type + Enter → user bubble + assistant bubble
  it(
    'SW-CB-TC08: Type + Enter sends message; bubbles render in order',
    { tags: ['@smoke'] },
    () => {
      cy.authSession('admin');
      page.stubSuggestions(data.suggestions.twoChips);
      page.stubStreamFallback();
      page.stubMessage(data.stub.epHappyText);
      cy.visit(urls.dashboard);
      page.openDrawerViaFab();
      page.sendMessage(data.input.epShortText);
      page.waitForReply();
      // After send: messages = [user, assistant]
      page.assertMessageContains(0, data.input.epShortText);
      page.assertMessageContains(1, 'We have 42 SKUs');
    },
  );

  // EP — input partition: Shift+Enter inserts newline (does NOT send)
  it('SW-CB-TC09: Shift+Enter inserts a newline and does not submit', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epHappyText);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    // Compose 'hello\nworld' across three steps without clearing —
    // the previous version called typeMessage() three times, but
    // typeMessage() runs `.clear()` first, which wiped 'hello\n' before
    // 'world' was typed (input ended up as just 'world').
    page.typeMessage('hello');
    page.pressShiftEnter();
    page.appendToInput('world');
    // Value retained AND contains a newline → handleSend never fired
    // (handleSend would clear the input).
    page.assertInputContainsNewline();
    // No assistant bubble rendered → /chatbot/message was never called.
    cy.get('@sendMessage.all').should('have.length', 0);
  });
});
