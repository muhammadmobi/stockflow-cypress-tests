// cypress/pageObjects/Chatbot/InlinePayloadsPage.js
//
// Page object for the inline-payload renderer specs
// (cypress/e2e/Chatbot/07-InlinePayloads.cy.js). Decision-table
// partitions: assistant payload with `data` → ChatDataTable (TC14);
// assistant payload with `chartConfig` → ChatChart (TC15).

import L from '../../support/locators/Chatbot/inlinePayloadsLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubStreamDone,
  stubMessage,
  waitForReply,
  waitForStreamReply,
} from '../../support/Chatbot/chatbotHelpers';

class InlinePayloadsPage {
  stubSuggestions(suggestions) {
    stubSuggestions(suggestions);
  }

  stubStreamFallback() {
    stubStreamFallback();
  }

  stubStreamDone(doneEvent) {
    stubStreamDone(doneEvent);
  }

  stubMessage(body, opts = {}) {
    stubMessage(body, opts);
  }

  waitForReply() {
    waitForReply();
  }

  waitForStreamReply() {
    waitForStreamReply();
  }

  openDrawerViaFab() {
    L.fab().click();
    L.drawerPaper().should('be.visible');
  }

  sendMessage(text) {
    L.chatInput().clear().type(`${text}{enter}`, { delay: 0 });
  }

  // Inline ChatDataTable should render when the assistant payload included
  // `data: [...]`. When a message carries both a table and a chart (TC22),
  // the table can sit below the fold of the fixed-position drawer, so scroll
  // it into view before the visibility check. Assert visibility on the
  // scrollable TableContainer (normal-flow block) rather than the inner
  // sticky-header <table>, which Cypress mis-reports as clipped in a nested
  // scroll container; confirm the <table> exists inside it.
  assertInlineTableRendered() {
    L.inlineTableContainer().should('exist').scrollIntoView();
    L.inlineTableContainer().should('be.visible');
    L.inlineDataTable().should('exist');
  }

  assertInlineChartRendered() {
    L.inlineChart().should('exist').scrollIntoView();
    L.inlineChart().should('be.visible');
  }
}

export default InlinePayloadsPage;
