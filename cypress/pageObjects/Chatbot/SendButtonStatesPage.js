// cypress/pageObjects/Chatbot/SendButtonStatesPage.js
//
// Page object for the send-button BVA specs
// (cypress/e2e/Chatbot/05-SendButtonStates.cy.js).
//
// ChatInput.tsx uses `disabled || !value.trim()` to gate the send
// button — empty (TC10) and whitespace-only (TC11) keep it disabled;
// 5000-char input (TC12) sends without truncation.

import L from '../../support/locators/Chatbot/sendButtonStatesLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessage,
} from '../../support/Chatbot/chatbotHelpers';

class SendButtonStatesPage {
  stubSuggestions(suggestions) {
    stubSuggestions(suggestions);
  }

  stubStreamFallback() {
    stubStreamFallback();
  }

  stubMessage(body, opts = {}) {
    stubMessage(body, opts);
  }

  openDrawerViaFab() {
    L.fab().click();
    L.drawerPaper().should('be.visible');
  }

  typeMessage(text) {
    L.chatInput().clear().type(text, { delay: 0 });
  }

  clickSendButton() {
    L.sendButton().click();
  }

  assertSendButtonDisabled() {
    L.sendButton().should('be.disabled');
  }

  assertSendButtonEnabled() {
    L.sendButton().should('not.be.disabled');
  }
}

export default SendButtonStatesPage;
