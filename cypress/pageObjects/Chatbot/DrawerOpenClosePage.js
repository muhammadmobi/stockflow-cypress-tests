// cypress/pageObjects/Chatbot/DrawerOpenClosePage.js
//
// Page object for the chatbot drawer open/close transition specs
// (cypress/e2e/Chatbot/02-DrawerOpenClose.cy.js).
//
// Components: ChatbotFAB.tsx (trigger) + ChatbotDrawer.tsx (right-side
// MUI Drawer). Covered transitions: Closed→Open via FAB (TC03),
// Open→Closed via header close button (TC04), and the alt trigger via
// Ctrl+/ keyboard shortcut (TC05).

import L from '../../support/locators/Chatbot/drawerOpenCloseLocators';
import { stubSuggestions } from '../../support/Chatbot/chatbotHelpers';

class DrawerOpenClosePage {
  // Re-export the shared helper as an instance method so the spec body
  // can call `page.stubSuggestions(...)` exactly like the original
  // monolithic spec did.
  stubSuggestions(suggestions) {
    stubSuggestions(suggestions);
  }

  openDrawerViaFab() {
    L.fab().click();
    L.drawerPaper().should('be.visible');
  }

  // Ctrl+/ — the FAB's keydown listener is attached to `document`
  // (Frontend/src/components/Chatbot/ChatbotFAB.tsx).
  //
  // History of this method, recorded so the next author doesn't repeat:
  //   1. `cy.get('body').type('{ctrl}/')` — failed: cy.type targets
  //      the focused element and Cypress's synthetic keystrokes do
  //      not always deliver `ctrlKey` to a document-level listener.
  //   2. `document.dispatchEvent(new KeyboardEvent('keydown', ...))`
  //      — also failed: synthetic events from the constructor do not
  //      reliably carry modifier flags across Cypress's iframe boundary.
  //   3. `cy.realPress(['Control', '/'])` alone — failed: the
  //      cypress-real-events plugin uses Chrome DevTools Protocol
  //      `Input.dispatchKeyEvent`, which delivers the keystroke to
  //      whichever target currently has OS-level focus. In headless
  //      Cypress the iframe does not have focus by default, so the
  //      keystroke goes nowhere reachable from the app's document.
  //
  // Resolution: establish OS-level focus on the iframe with
  // `realClick` at safe coordinates (top-left padding, no widget),
  // and only THEN fire `realPress`. The `should('be.visible')` on
  // the FAB before realClick is also load-bearing — it ensures the
  // React useEffect has attached the document keydown listener.
  openDrawerViaShortcut() {
    L.fab().should('be.visible');
    cy.get('body').realClick({ x: 2, y: 2 });
    cy.realPress(['Control', '/']);
    L.drawerPaper().should('be.visible');
  }

  closeDrawerViaHeader() {
    L.closeDrawerButton().click();
  }

  assertDrawerOpen() {
    L.drawerPaper().should('be.visible');
    L.drawerHeaderTitle()
      .should('be.visible')
      .and('contain.text', 'StockWise AI');
  }

  // The Drawer mounts/unmounts based on the `open` prop with a slide
  // transition. Asserting `not.exist` is more robust than
  // `not.be.visible` because MUI keeps a hidden Backdrop in the DOM
  // mid-transition.
  assertDrawerClosed() {
    L.drawerPaper().should('not.exist');
  }
}

export default DrawerOpenClosePage;
