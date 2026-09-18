// cypress/e2e/Chatbot/02-DrawerOpenClose.cy.js
//
// Test plan: cypress/qa/testPlans/chatbot/plan.md
// Component:  Frontend/src/components/Chatbot/ChatbotFAB.tsx +
//             ChatbotDrawer.tsx
//
// State-transition coverage:
//   Closed → Open via FAB                           (TC03)
//   Open   → Closed via header close button         (TC04)
//   Closed → Open via Ctrl+/ keyboard shortcut      (TC05)

import DrawerOpenClosePage from '../../pageObjects/Chatbot/DrawerOpenClosePage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/Chatbot/drawerOpenClose.json';

describe('StockWise AI Chatbot — Drawer open/close', { tags: ['@regression'] }, () => {
  const page = new DrawerOpenClosePage();

  // State transition — Closed → Open via FAB
  it('SW-CB-TC03: Click FAB opens drawer with header "StockWise AI"', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.assertDrawerOpen();
  });

  // State transition — Open → Closed via header close button
  it('SW-CB-TC04: Header close button closes the drawer', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    cy.visit(urls.dashboard);
    page.openDrawerViaFab();
    page.closeDrawerViaHeader();
    page.assertDrawerClosed();
  });

  // State transition — alt trigger: Ctrl+/ keyboard shortcut toggles drawer
  it('SW-CB-TC05: Ctrl+/ shortcut toggles the drawer', () => {
    cy.authSession('admin');
    page.stubSuggestions(data.suggestions.twoChips);
    cy.visit(urls.dashboard);
    page.openDrawerViaShortcut();
    page.assertDrawerOpen();
  });
});
