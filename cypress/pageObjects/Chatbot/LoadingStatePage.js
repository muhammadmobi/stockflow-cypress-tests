// cypress/pageObjects/Chatbot/LoadingStatePage.js
//
// Page object for the in-flight thinking-indicator spec
// (cypress/e2e/Chatbot/06-LoadingState.cy.js). The stub sets
// `delay: 1500` so the CircularProgress is observable mid-flight.

import L from '../../support/locators/Chatbot/loadingStateLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessage,
} from '../../support/Chatbot/chatbotHelpers';

class LoadingStatePage {
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

  assertThinkingVisible() {
    L.thinkingIndicator().should('be.visible');
  }
}

export default LoadingStatePage;
