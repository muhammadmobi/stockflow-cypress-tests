// cypress/e2e/Chatbot/03-Suggestions.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatbotDrawer.tsx
//
// OBSOLETE FEATURE — empty-conversation suggestion chips were removed from
// the Frontend in commit d06e17f9e "Chatbot and navbar design fix". The
// empty conversation state now renders a static descriptive paragraph
// (ChatbotDrawer.tsx ~L551-557) instead of clickable `.MuiChip-clickable`
// suggestion chips. The `GET /chatbot/suggestions` response is still
// fetched into state (ChatbotDrawer.tsx L115) but is no longer rendered.
//
// TC06/TC07 are skipped (not deleted) so the test IDs and rationale survive
// in case the empty-state chips are reinstated. Per-message follow-up chips
// (msg.followUps) are a separate feature and are not covered here.
// Confirmed with user 2026-06-01.

import SuggestionsPage from '../../pageObjects/Chatbot/SuggestionsPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/suggestions.json';

describe('StockWise AI Chatbot — Suggestions', { tags: ['@regression'] }, () => {
  const page = new SuggestionsPage();

  // EP — empty conversation partition: suggestion chips render before any message.
  // SKIPPED — empty-state suggestion chips removed from Frontend (see file header).
  it.skip('SW-CB-TC06: Suggestion chips render before the first user message', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    cy.wait('@getSuggestions');
    page.assertSuggestionChipCount(data.suggestions.twoChips.length);
  });

  // Use case — alternate happy path: clicking a chip fires the send flow.
  // SKIPPED — empty-state suggestion chips removed from Frontend (see file header).
  it.skip('SW-CB-TC07: Clicking a suggestion chip sends it as a message', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epHappyText);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    cy.wait('@getSuggestions');
    page.clickSuggestionChip(0);
    cy.wait('@sendMessage').its('request.body.message').should(
      'eq',
      data.suggestions.twoChips[0],
    );
  });
});
