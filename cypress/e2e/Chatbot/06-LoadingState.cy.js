// cypress/e2e/Chatbot/06-LoadingState.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatbotDrawer.tsx
//
// State transition — Sending → Loading: thinking indicator visible
// mid-flight (TC13). The stub adds a 1500ms delay so the
// CircularProgress is observable before the assistant reply lands.

import LoadingStatePage from '../../pageObjects/Chatbot/LoadingStatePage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/loadingState.json';

describe('StockWise AI Chatbot — Loading state', { tags: ['@regression'] }, () => {
  const page = new LoadingStatePage();

  // State transition — Sending → Loading: thinking indicator visible mid-flight
  it('SW-CB-TC13: Thinking indicator renders while the request is in flight', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epHappyText, { delay: 1500 });
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);
    page.assertThinkingVisible();
  });
});
