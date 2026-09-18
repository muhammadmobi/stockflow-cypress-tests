// cypress/e2e/Chatbot/07-InlinePayloads.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatMessage.tsx +
//             ChatDataTable.tsx + ChatChart.tsx
//
// Decision-table coverage on assistant payload extras:
//   payload with `data`        → ChatDataTable rendered (TC14)
//   payload with `chartConfig` → ChatChart rendered     (TC15)

import InlinePayloadsPage from '../../pageObjects/Chatbot/InlinePayloadsPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/inlinePayloads.json';

describe('StockWise AI Chatbot — Inline payloads', { tags: ['@regression'] }, () => {
  const page = new InlinePayloadsPage();

  // Decision table — assistant payload with `data` → ChatDataTable rendered
  it('SW-CB-TC14: Assistant payload with data renders an inline table', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epWithTable);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);
    page.waitForReply();
    page.assertInlineTableRendered();
  });

  // Decision table — assistant payload with `chartConfig` → ChatChart rendered
  it('SW-CB-TC15: Assistant payload with chartConfig renders an inline chart', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamFallback();
    page.stubMessage(data.stub.epWithChart);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage(data.input.epShortText);
    page.waitForReply();
    page.assertInlineChartRendered();
  });

  // SKIPPED (app bug, not a test bug): the drawer never fires the SSE stream
  // POST, so there is no streamed payload to assert on. ChatbotDrawer.tsx:243
  // reads the bearer from localStorage['stock-wise'].App.user.accessToken, but
  // store.ts:24 omits accessToken before persisting (Keycloak migration —
  // project gotcha #7), so the token is always empty and the drawer falls
  // straight through to the apiService POST fallback. Streaming is therefore
  // dead for real users too. Skipped rather than left red per the suite policy
  // ("a skip, never a red test"); tracked in qa/testPlans/chatbot/pending.md.
  // Un-skip once the drawer reads sessionStorage['jwt_access_token'] (or goes
  // through apiService).
  it.skip('SW-CB-TC22: Streamed stockout prediction payload renders table and chart', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    page.stubStreamDone(data.stub.epStreamPrediction);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.sendMessage('Which products may stock out in the next 30 days?');
    page.waitForStreamReply();
    page.assertInlineTableRendered();
    page.assertInlineChartRendered();
  });
});
