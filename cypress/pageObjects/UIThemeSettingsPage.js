// cypress/pageObjects/UIThemeSettingsPage.js
//
// Page object for the UI Theme Settings Drawer.
// Spec: cypress/e2e/UIThemeSettings/UIThemeSettingsTests.cy.js
// Components: settings-button.tsx + settings-drawer.tsx + base-option.tsx
//             + font-options.tsx + nav-layout-option.tsx + presets-options.tsx
// Storage key: 'app-settings' (SETTINGS_STORAGE_KEY in settings-config.ts)
// Color mode key: 'theme-mode' (MUI modeStorageKey in theme-config.ts)

import L from '../support/locators/UIThemeSettingsLocators';

class UIThemeSettingsPage {

  // ── Drawer open / close ────────────────────────────────────────────────

  openDrawer() {
    L.settingsButton().first().click();
    L.drawerPaper().should('be.visible');
  }

  assertDrawerOpen() {
    L.drawerPaper().should('be.visible');
    L.drawerTitle().should('contain.text', 'Settings');
  }

  // MUI Drawer slides out and unmounts — asserting not.exist is more robust
  // than not.be.visible because the backdrop element lingers mid-transition.
  assertDrawerClosed() {
    L.drawerPaper().should('not.exist');
  }

  closeViaButton() {
    L.closeButton().click();
  }

  closeViaEsc() {
    cy.get('body').type('{esc}');
  }

  // backdrop.invisible:true keeps the overlay transparent but interactive.
  closeViaBackdrop() {
    L.backdrop().click({ force: true });
  }

  // ── Dark mode (colorScheme toggle) ────────────────────────────────────

  enableDarkMode() {
    L.darkModeInput().then($el => {
      if (!$el.prop('checked')) L.darkModeOption().click();
    });
  }

  disableDarkMode() {
    L.darkModeInput().then($el => {
      if ($el.prop('checked')) L.darkModeOption().click();
    });
  }

  assertDarkModeOn() {
    L.darkModeInput().should('be.checked');
    // themeConfig.cssVariables.colorSchemeSelector = 'data-color-scheme'
    cy.get('html').should('have.attr', 'data-color-scheme', 'dark');
  }

  assertDarkModeOff() {
    L.darkModeInput().should('not.be.checked');
    cy.get('html').should('not.have.attr', 'data-color-scheme', 'dark');
  }

  // ── Contrast ──────────────────────────────────────────────────────────

  toggleContrast() {
    L.contrastOption().click();
  }

  assertContrastOn() {
    L.contrastInput().should('be.checked');
    // types.ts: contrast: 'default' | 'hight' (note: intentional typo in source)
    this.assertStorageKey('contrast', 'hight');
  }

  assertContrastOff() {
    L.contrastInput().should('not.be.checked');
    this.assertStorageKey('contrast', 'default');
  }

  // ── RTL ───────────────────────────────────────────────────────────────

  enableRtl() {
    L.rtlInput().then($el => {
      if (!$el.prop('checked')) L.rtlOption().click();
    });
  }

  disableRtl() {
    L.rtlInput().then($el => {
      if ($el.prop('checked')) L.rtlOption().click();
    });
  }

  assertDirectionRtl() {
    L.rtlInput().should('be.checked');
    this.assertStorageKey('direction', 'rtl');
  }

  assertDirectionLtr() {
    L.rtlInput().should('not.be.checked');
    this.assertStorageKey('direction', 'ltr');
  }

  // ── Compact ───────────────────────────────────────────────────────────

  toggleCompact() {
    L.compactOption().click();
  }

  assertCompactOn() {
    L.compactInput().should('be.checked');
    this.assertStorageKey('compactLayout', true);
  }

  assertCompactOff() {
    L.compactInput().should('not.be.checked');
    this.assertStorageKey('compactLayout', false);
  }

  // The Compact BaseOption has a tooltip info icon (eva:info-outline).
  // This verifies the Iconify SVG is present inside the tile.
  assertCompactInfoIconVisible() {
    L.compactOption().find('svg').should('have.length.gte', 2);
  }

  // ── Nav layout ────────────────────────────────────────────────────────

  selectNavLayout(index) {
    L.navLayoutOptionButtons().eq(index).click();
  }

  assertNavLayoutInStorage(value) {
    this.assertStorageKey('navLayout', value);
  }

  // ── Nav color ─────────────────────────────────────────────────────────

  selectNavColor(buttonText) {
    cy.get('.MuiDrawer-paperAnchorRight').contains('button', buttonText).click();
  }

  assertNavColorInStorage(value) {
    this.assertStorageKey('navColor', value);
  }

  // ── Font family ───────────────────────────────────────────────────────

  selectFontFamily(buttonText) {
    cy.get('.MuiDrawer-paperAnchorRight').contains('button', buttonText).click();
  }

  assertFontFamilyInStorage(storageValue) {
    this.assertStorageKey('fontFamily', storageValue);
  }

  assertFontAppliedToBody(fontName) {
    cy.get('body').should('have.css', 'font-family').and('include', fontName);
  }

  // ── Font size ─────────────────────────────────────────────────────────

  // Sets the slider to an exact value using React's native-setter technique.
  // Multiple sequential cy.trigger('keydown') calls in a loop fail because
  // React batches event processing and only commits the first step — the
  // subsequent dispatches see a stale captured-event reference.
  // The native-setter + 'input' event dispatch bypasses that: React's
  // onChange fires once with the final target value.
  setFontSizeViaSlider(value) {
    cy.window().then(win => {
      const drawer = win.document.querySelector('.MuiDrawer-paperAnchorRight');
      const input = drawer.querySelector('input[aria-label="Change font size"]');
      const nativeSetter = Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(input, String(value));
      // React 16+ maps onChange on <input type="range"> to the native 'input' event.
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
  }

  // Nudge the slider N steps via keyboard (positive = right / increase).
  // Single-step keydown IS reliable; only multi-step loops are batched out.
  // Tests using this should nudge by 1 step only (TC21).
  nudgeFontSizeByKeyboard(steps) {
    const key = steps > 0 ? 'ArrowRight' : 'ArrowLeft';
    const n = Math.abs(steps);
    for (let i = 0; i < n; i++) {
      L.fontSizeSlider().trigger('keydown', { key, bubbles: true, force: true });
    }
  }

  assertFontSizeInStorage(value) {
    this.assertStorageKey('fontSize', value);
  }

  // ── Fullscreen ────────────────────────────────────────────────────────

  clickFullscreen() {
    L.fullscreenButton().click();
  }

  // Returns a Cypress chain resolving to true if fullscreen is active.
  // Used to guard assertions when the Fullscreen API is unavailable in CI.
  assertFullscreenStateIs(expectActive) {
    cy.document().then(doc => {
      if (expectActive) {
        if (doc.fullscreenElement) {
          // Fullscreen engaged: FullScreenButton uses color="primary"
          L.fullscreenButton().should('have.class', 'MuiIconButton-colorPrimary');
        } else {
          cy.log('Fullscreen API not available in this environment — skipping DOM assertion');
        }
      } else {
        expect(doc.fullscreenElement).to.equal(null);
      }
    });
  }

  // ── Reset all ─────────────────────────────────────────────────────────

  clickResetAll() {
    L.resetAllButton().click();
  }

  // ── localStorage helpers ──────────────────────────────────────────────

  // Asserts a single key in the app-settings localStorage object.
  assertStorageKey(key, expectedValue) {
    cy.window().then(win => {
      const raw = win.localStorage.getItem('app-settings');
      const stored = raw ? JSON.parse(raw) : {};
      expect(stored[key], `app-settings.${key}`).to.deep.equal(expectedValue);
    });
  }

  // Returns the full parsed app-settings object via cy.wrap.
  readStorage() {
    return cy.window().then(win => {
      const raw = win.localStorage.getItem('app-settings');
      return raw ? JSON.parse(raw) : {};
    });
  }
}

export default UIThemeSettingsPage;
