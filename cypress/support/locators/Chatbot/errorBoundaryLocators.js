// cypress/support/locators/Chatbot/errorBoundaryLocators.js
//
// Locators for the React-error-boundary spec
// (cypress/e2e/Chatbot/11-ErrorBoundary.cy.js).
//
// Component under test:
// Frontend/src/components/Chatbot/ChatErrorBoundary.tsx — wraps the
// messages region of ChatbotDrawer.tsx (line ~375). When any descendant
// throws during render, the boundary renders a fallback Box with:
//
//   <Typography variant="body2">Something went wrong displaying the chat.</Typography>
//   <Button variant="outlined" size="small">Reset Chat</Button>
//
// The fallback Typography is the default `<p>` element — distinct from
// the message-bubble Typographies which are `component="div"` (see
// sendFlowLocators.js). The Reset button is a regular MUI Button (not
// IconButton), so role+name matches "Reset Chat" reliably.

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const errorBoundaryLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  // Fallback copy from ChatErrorBoundary.tsx — case-insensitive and scoped
  // to the drawer so we don't collide with any unrelated "something went
  // wrong" toast on the underlying page.
  errorBoundaryMessage: () =>
    cy.get(DRAWER_PAPER).contains(/something went wrong displaying the chat/i),

  // The fallback Reset button has the literal text "Reset Chat". Anchor
  // the regex (^reset chat$) so we don't pick up an unrelated reset
  // affordance elsewhere on the page.
  resetChatButton: () =>
    cy.get(DRAWER_PAPER).findByRole('button', { name: /^reset chat$/i }),

  // After Reset Chat fires `handleNewChat`, the messages array is cleared
  // and the empty-state intro Typography is rendered ("Ask me about
  // products, available quantities, items and serial numbers..."). It's
  // a default `<p>` (variant="body2", color="text.secondary"), so we
  // anchor on a stable substring of its copy.
  emptyStateIntro: () =>
    cy.get(DRAWER_PAPER).contains(/ask me about products/i),
};

export default errorBoundaryLocators;
