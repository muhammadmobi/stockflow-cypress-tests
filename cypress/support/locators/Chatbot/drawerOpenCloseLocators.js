// cypress/support/locators/Chatbot/drawerOpenCloseLocators.js
//
// Locators for the drawer open/close state-transition specs
// (cypress/e2e/Chatbot/02-DrawerOpenClose.cy.js).
//
// Selectors rely on three stable signals (see notes on the original
// monolithic chatbotLocators.js for full history): MUI structural
// classes scoped to `.MuiDrawer-paperAnchorRight`, accessible names
// from MUI Tooltip `title` props, and sibling traversal for the
// header close IconButton (which has no aria-label / Tooltip / title).

const DRAWER_PAPER = '.MuiDrawer-paperAnchorRight';

const drawerOpenCloseLocators = {
  // FAB — Tooltip title="StockWise AI (Ctrl+/)" → aria-label.
  fab: () => cy.findByRole('button', { name: /stockwise ai/i }),

  drawerPaper: () => cy.get(DRAWER_PAPER),

  // `<Typography variant="h6">StockWise AI</Typography>` renders as <h6>,
  // exposed as role="heading" aria-level=6.
  drawerHeaderTitle: () =>
    cy.get(DRAWER_PAPER).findByRole('heading', { name: /^stockwise ai$/i }),

  // The close IconButton has no aria-label / Tooltip / title prop. It's
  // the immediate next sibling of the new-chat IconButton in the header
  // flex Box. `.next('.MuiIconButton-root')` is stable as long as the
  // header preserves [new chat | close] order.
  closeDrawerButton: () =>
    cy
      .get(DRAWER_PAPER)
      .findByRole('button', { name: /new chat/i })
      .next('.MuiIconButton-root'),
};

export default drawerOpenCloseLocators;
