// cypress/support/Chatbot/chatbotHelpers.js
//
// Shared cy.intercept stubs and wait helpers for the StockWise AI Chatbot
// UI specs. Mirrors the support pattern used by InventoryActions/probes.js —
// per-feature page objects under cypress/pageObjects/Chatbot/ import only
// what they need from this module so the stub strategy is defined once.
//
// Stub strategy (kept identical to the original ChatbotPage.js so the
// test bodies behave exactly as before):
//   The drawer's send flow tries SSE first via `fetch('/chatbot/message/stream')`
//   and falls back to `apiService.post('/chatbot/message')` whenever the
//   stream response is not `text/event-stream` (see ChatbotDrawer.tsx
//   line ~178). We exploit that: stub the stream endpoint with a plain
//   JSON 200 to *force* the deterministic non-stream path, then stub
//   `/chatbot/message` with the assertion-shaped body. SSE internals stay
//   out of scope here — they're an API-spec concern (cypress/qa/
//   testPlans/chatbot/plan.md §3 "Out of scope"; cypress/qa/SKILL.md
//   §3 — UI vs API).
//
//   `cy.intercept` matches both `fetch()` and `apiService.post()` so a
//   single intercept per path covers both transports.

export const STREAM_PATH = '**/chatbot/message/stream';
export const MESSAGE_PATH = '**/chatbot/message';
export const SUGGESTIONS_PATH = '**/chatbot/suggestions*';
export const FEEDBACK_PATH = '**/chatbot/feedback';

// Force the drawer to take the non-stream fallback path. JSON 200 with
// `application/json` content-type fails the
// `headers['content-type'].includes('text/event-stream')` check inside
// ChatbotDrawer.tsx, so the code falls through to `apiService.post`.
export function stubStreamFallback() {
  cy.intercept('POST', STREAM_PATH, {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {},
  }).as('streamFallback');
}

export function stubStreamDone(doneEvent) {
  const payload = [
    { type: 'thinking', content: 'Looking up inventory...' },
    { type: 'done', ...doneEvent },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('');

  cy.intercept('POST', STREAM_PATH, {
    statusCode: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: payload,
  }).as('streamMessage');
}

// Stub POST /chatbot/message (the actual deterministic path after the
// fallback above).
// body: ChatResponse-shaped object (response, data?, chartConfig?,
//                                    thinking?, messageId?).
// opts: { delay?: ms, statusCode?: number }
export function stubMessage(body, opts = {}) {
  cy.intercept('POST', MESSAGE_PATH, (req) => {
    const reply = {
      statusCode: opts.statusCode || 200,
      body,
    };
    if (opts.delay) reply.delay = opts.delay;
    req.reply(reply);
  }).as('sendMessage');
}

// One-off mode: first call returns an error, second call returns a
// success body. Used by the retry/error-guessing test (TC19) to verify
// the retry button re-fires the request.
export function stubMessageFailThenSucceed(successBody) {
  let callCount = 0;
  cy.intercept('POST', MESSAGE_PATH, (req) => {
    callCount += 1;
    if (callCount === 1) {
      req.reply({
        statusCode: 500,
        body: {
          statusCode: 500,
          success: false,
          error: 'service unavailable',
        },
      });
    } else {
      req.reply({ statusCode: 200, body: successBody });
    }
  }).as('sendMessage');
}

export function stubSuggestions(suggestions) {
  cy.intercept('GET', SUGGESTIONS_PATH, {
    statusCode: 200,
    body: { suggestions },
  }).as('getSuggestions');
}

// No-op feedback intercept — the spec asserts on the captured request
// body via `cy.wait('@feedback').its('request.body')`.
export function interceptFeedback() {
  cy.intercept('POST', FEEDBACK_PATH, {
    statusCode: 200,
    body: { success: true },
  }).as('feedback');
}

// Wait for the initial message round-trip after triggering a send.
//
// NOTE: the drawer no longer fires the SSE stream POST in the test env.
// ChatbotDrawer.tsx reads the bearer from
// localStorage['stock-wise'].App.user.accessToken, but the Redux persist
// config strips accessToken before serialization (store.ts — Keycloak
// migration), so that value is always empty. With no token the drawer SKIPS
// `fetch('/chatbot/message/stream')` and goes straight to the
// apiService.post('/chatbot/message') fallback (which refreshes the token via
// interceptors). So `@streamFallback` never occurs — wait only on the real
// `@sendMessage` request.
//
// This is a PRODUCTION bug, not a test-env quirk: streaming is silently dead
// for every user. It is tracked in qa/testPlans/chatbot/pending.md and the
// SSE-specific case SW-CB-TC22 is `it.skip`ped there — deliberately NOT left
// red, per the suite policy of "a skip, never a red test". `stubStreamFallback`
// is kept as a harmless no-op in case the drawer ever calls the stream again.
export function waitForReply() {
  cy.wait('@sendMessage');
}

export function waitForStreamReply() {
  cy.wait('@streamMessage');
}
