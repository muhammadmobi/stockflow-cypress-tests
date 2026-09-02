// cypress/support/locators/Chatbot/inlinePayloadsLocators.js
//
// Locators for the inline-payload-renderer specs
// (cypress/e2e/Chatbot/07-InlinePayloads.cy.js). Covers the data-table
// (TC14) and chart (TC15) decision-table partitions.
//
// ChatDataTable renders a sticky-header MUI Table. ChatChart renders a
// Recharts wrapper with class `recharts-wrapper`. Both are scoped to
// the drawer to avoid colliding with any data grid in the underlying
// page.

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const inlinePayloadsLocators = {
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  chatInput: () =>
    cy
      .get(DRAWER_PAPER)
      .findByPlaceholderText(/ask about your inventory/i),

  // Assert on the scrollable TableContainer (a normal-flow block) rather
  // than the inner sticky-header <table>: Cypress reports a stickyHeader
  // <table> as "not visible" when it sits in a nested scroll container
  // inside the position:fixed drawer, even after scrollIntoView. The
  // container scrolls into view cleanly and isn't subject to that quirk.
  inlineTableContainer: () => cy.get(`${DRAWER_PAPER} .MuiTableContainer-root`),
  inlineDataTable: () => cy.get(`${DRAWER_PAPER} table`),
  inlineChart: () => cy.get(`${DRAWER_PAPER} .recharts-wrapper`),
};

export default inlinePayloadsLocators;
