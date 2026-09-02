// cypress/pageObjects/Chatbot/ConversationResetPage.js
//
// Page object for the "New chat" reset spec
// (cypress/e2e/Chatbot/09-ConversationReset.cy.js). After clicking
// "New chat" the messages list is empty again — the drawer falls back
// to the empty-state suggestion view — and `handleNewChat` regenerates
// the conversationId UUID so the next send carries a fresh value.

import L from '../../support/locators/Chatbot/conversationResetLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessage,
} from '../../support/Chatbot/chatbotHelpers';

class ConversationResetPage {
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

  sendMessage(text) {
    L.chatInput().clear().type(`${text}{enter}`, { delay: 0 });
  }

  clickNewChat() {
    L.newChatButton().click();
  }

  assertConversationCleared() {
    L.messageBubbles().should('have.length', 0);
  }
}

export default ConversationResetPage;
