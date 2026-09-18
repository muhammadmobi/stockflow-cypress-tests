// cypress/e2e/Chatbot/11-ErrorBoundary.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatErrorBoundary.tsx +
//             ChatbotDrawer.tsx (line ~375 — boundary wraps the
//             messages region) + ChatChart.tsx (the descendant that
//             throws on a malformed payload).
//
// Error guessing (CT Ch.4 / SKILL §4.3) + State transition
// (SKILL §4.1):
//
//   Healthy → Error: a malformed assistant payload (chartConfig.data
//   typed as string instead of array) makes ChatChart's `data.map`
//   call throw a TypeError during render. ChatErrorBoundary catches
//   the error via `getDerivedStateFromError`, sets hasError=true, and
//   replaces its children with the fallback Box (TC20).
//
//   Error → Recovered: clicking "Reset Chat" inside the fallback fires
//   `handleReset` → `setState({ hasError: false })` AND
//   `props.onReset?.()` (wired to ChatbotDrawer's handleNewChat, which
//   clears messages and regenerates conversationId). The boundary
//   re-renders its children against an empty messages array, so the
//   empty-state intro Typography is restored (TC21).
//
// `Cypress.once('uncaught:exception', () => false)` follows the existing
// pattern in cypress/e2e/IncomingInventory/StockInBySerialNumbers.cy.js
// — the boundary handles the error functionally but React still surfaces
// the TypeError to Cypress's uncaught-exception channel in dev mode.

import ErrorBoundaryPage from '../../pageObjects/Chatbot/ErrorBoundaryPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/errorBoundary.json';

describe('StockWise AI Chatbot — Error boundary', { tags: ['@regression'] }, () => {
  const page = new ErrorBoundaryPage();

  // Error guessing + state transition — Healthy → Error: the malformed
  // chart payload throws inside ChatChart; the boundary catches it and
  // renders the fallback UI in place of the messages region.
  it('SW-CB-TC20: Malformed assistant payload triggers the error boundary', { tags: ['@smoke'] }, () => {
    // Boundary catches the TypeError, but React still bubbles it to
    // Cypress's uncaught-exception channel — suppress for this test.
    Cypress.once('uncaught:exception', () => false);

    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epMalformedChart);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);

    // The malformed chart causes ChatChart to throw during render →
    // ChatErrorBoundary catches and shows fallback Typography + Button.
    page.assertErrorBoundaryRendered();
  });

  // State transition — Error → Recovered: Reset Chat clears hasError
  // AND clears the messages array (handleNewChat), so the boundary
  // re-renders into the empty-conversation state.
  it('SW-CB-TC21: "Reset Chat" clears the error and restores the empty-conversation state', () => {
    // Two suppressions: one for the initial render that triggers the
    // boundary, and one as a safety net in case the React reconciler
    // re-throws during the recovery render.
    Cypress.on('uncaught:exception', () => false);

    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epMalformedChart);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);
    page.assertErrorBoundaryRendered();

    page.clickResetChat();
    page.assertRecoveredToEmptyState();
  });
});
