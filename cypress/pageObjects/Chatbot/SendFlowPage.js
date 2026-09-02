// cypress/pageObjects/Chatbot/SendFlowPage.js
//
// Page object for the golden-path send specs
// (cypress/e2e/Chatbot/04-SendFlow.cy.js).
//
// Type+Enter sends (TC08); Shift+Enter inserts a newline and does NOT
// submit (TC09). The compose-without-clearing pattern (typeMessage +
// pressShiftEnter + appendToInput) is required because typeMessage()
// runs `.clear()` first — calling it three times wiped 'hello\n' before
// 'world' was typed in the original implementation.

import L from '../../support/locators/Chatbot/sendFlowLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessage,
  waitForReply,
} from '../../support/Chatbot/chatbotHelpers';

class SendFlowPage {
  stubSuggestions(suggestions) {
    stubSuggestions(suggestions);
  }

  stubStreamFallback() {
    stubStreamFallback();
  }

  stubMessage(body, opts = {}) {
    stubMessage(body, opts);
  }

  waitForReply() {
    waitForReply();
  }

  openDrawerViaFab() {
    L.fab().click();
    L.drawerPaper().should('be.visible');
  }

  // Type without submitting. Replaces the textarea value with `text` —
  // call this when you want a clean input. For tests that compose
  // multiline input across multiple steps (e.g. shift+enter), use
  // `appendToInput` so prior content isn't wiped.
  typeMessage(text) {
    L.chatInput().clear().type(text, { delay: 0 });
  }

  // Append to the existing textarea value. Used by the shift+enter test
  // (TC09) to type text → newline → text in three steps without
  // clearing between them. `parseSpecialCharSequences: false` is NOT
  // set — we still want `{shift}{enter}` etc. interpreted by Cypress.
  appendToInput(text) {
    L.chatInput().type(text, { delay: 0 });
  }

  // Type + plain Enter → MUI handles the keydown on the textarea and the
  // ChatInput component fires `handleSend()` → POST /chatbot/message.
  // Use `{enter}` so cy.type emits a real Enter keydown (Shift not held).
  sendMessage(text) {
    L.chatInput().clear().type(`${text}{enter}`, { delay: 0 });
  }

  // Shift+Enter inserts a newline — handler returns early without
  // sending. Appends to whatever is already in the textarea.
  pressShiftEnter() {
    L.chatInput().type('{shift}{enter}', { delay: 0 });
  }

  assertMessageContains(index, text) {
    L.messageBubbleByIndex(index).should('contain.text', text);
  }

  // TC09 — Shift+Enter retains the input value with a newline because
  // handleSend was never called (it would have cleared the textarea).
  // Asserting on the raw textarea value is the only way to confirm the
  // newline is present without round-tripping through a backend.
  assertInputContainsNewline() {
    L.chatInput().invoke('val').should('include', '\n');
  }
}

export default SendFlowPage;
