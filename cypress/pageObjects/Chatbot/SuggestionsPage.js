// cypress/pageObjects/Chatbot/SuggestionsPage.js
//
// Page object for the suggestion-chip empty-conversation specs
// (cypress/e2e/Chatbot/03-Suggestions.cy.js).

import L from '../../support/locators/Chatbot/suggestionsLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessage,
} from '../../support/Chatbot/chatbotHelpers';

class SuggestionsPage {
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

  clickSuggestionChip(index) {
    L.suggestionChipByIndex(index).click();
  }

  assertSuggestionChipCount(expected) {
    L.suggestionChips().should('have.length', expected);
  }
}

export default SuggestionsPage;
