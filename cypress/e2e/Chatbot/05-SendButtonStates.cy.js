// cypress/e2e/Chatbot/05-SendButtonStates.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatInput.tsx
//
// BVA on input length:
//   Lower boundary — empty input keeps the send button disabled (TC10)
//   Lower boundary — whitespace-only keeps it disabled (TC11)
//   Upper boundary — 5000-char paste sends without truncation (TC12)
// (ChatInput.tsx uses `disabled || !value.trim()` to gate the button.)

import SendButtonStatesPage from '../../pageObjects/Chatbot/SendButtonStatesPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/sendButtonStates.json';

describe('StockWise AI Chatbot — Send button BVA', { tags: ['@regression'] }, () => {
  const page = new SendButtonStatesPage();

  // BVA — lower boundary: empty input keeps the send button disabled
  it('SW-CB-TC10: Send button is disabled when the input is empty', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.assertSendButtonDisabled();
  });

  // BVA — lower boundary: whitespace-only input keeps the button disabled
  // (ChatInput.tsx uses `disabled || !value.trim()` to gate the button)
  it('SW-CB-TC11: Send button is disabled on whitespace-only input', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.typeMessage(data.input.epWhitespace);
    page.assertSendButtonDisabled();
  });

  // BVA — upper boundary: 5 000-char paste sends without truncation
  it('SW-CB-TC12: Long input (5 000 chars) sends without truncation', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epHappyText);
    const longMessage = 'a'.repeat(5000);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.typeMessage(longMessage);
    page.clickSendButton();
    cy.wait('@sendMessage').its('request.body.message').should(
      'have.length',
      5000,
    );
  });
});
