// cypress/pageObjects/Chatbot/ErrorBoundaryPage.js
//
// Page object for the React-error-boundary spec
// (cypress/e2e/Chatbot/11-ErrorBoundary.cy.js).
//
// Triggering strategy: stub /chatbot/message with a chartConfig whose
// `data` field is a non-array truthy value (a string). ChatChart.tsx
// passes the early-return guard at line 41 (`!data || data.length === 0
// || !yKeys || yKeys.length === 0` — a non-empty string is truthy and
// has length > 0, so the guard does not fire), then throws on line 44
// (`data.map(...)` — strings have no `.map`). The thrown TypeError
// propagates to ChatErrorBoundary's `getDerivedStateFromError`, which
// flips `hasError = true` and renders the fallback UI.
//
// `Cypress.once('uncaught:exception', () => false)` is set inside the
// spec body before the malformed payload arrives — the boundary
// recovers gracefully but React still surfaces the error to Cypress's
// uncaught-exception channel in dev mode (matches the existing pattern
// in cypress/e2e/IncomingInventory/StockInBySerialNumbers.cy.js:90).

import L from '../../support/locators/Chatbot/errorBoundaryLocators';
import {
  stubSuggestions,
  stubStreamFallback,
  stubMessage,
} from '../../support/Chatbot/chatbotHelpers';

class ErrorBoundaryPage {
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

  // Click the "Reset Chat" button inside the boundary fallback.
  // ChatErrorBoundary.handleReset sets hasError=false AND calls
  // `onReset?.()` — wired to ChatbotDrawer's handleNewChat, which clears
  // the messages list and regenerates conversationId. After this click
  // the children re-render with an empty messages array, so the
  // empty-state intro replaces the fallback.
  clickResetChat() {
    L.resetChatButton().click();
  }

  // ── Assertions ─────────────────────────────────────────────────────

  // The boundary's fallback is a Typography + Button pair. Asserting
  // both protects against a regression that strips one of them.
  assertErrorBoundaryRendered() {
    L.errorBoundaryMessage().should('be.visible');
    L.resetChatButton().should('be.visible').and('not.be.disabled');
  }

  // After Reset Chat the fallback is unmounted (boundary's hasError flips
  // to false) and the empty-state intro is rendered (messages cleared).
  // Asserting `not.exist` on the fallback message is more robust than
  // `not.be.visible` because the entire boundary subtree unmounts.
  assertRecoveredToEmptyState() {
    L.errorBoundaryMessage().should('not.exist');
    L.emptyStateIntro().should('be.visible');
  }
}

export default ErrorBoundaryPage;
