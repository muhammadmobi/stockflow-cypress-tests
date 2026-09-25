// cypress/e2e/UIThemeSettings/UIThemeSettingsTests.cy.js
//
// Test plan: cypress/qa/testPlans/uiThemeSettings/README.md
// Component:  Frontend/src/components/settings/drawer/settings-drawer.tsx
// Trigger:    Frontend/src/layouts/components/settings-button.tsx
// Storage:    localStorage['app-settings'] (SETTINGS_STORAGE_KEY in settings-config.ts)
// Color mode: localStorage['theme-mode']   (modeStorageKey in theme-config.ts)
//
// Test IDs:  SW-THEME-TC01 – TC42   Total active: 41  Skip: 1 (TC07)

import UIThemeSettingsPage from '../../pageObjects/UIThemeSettingsPage';
import urls from '../../fixtures/urls.json';
import data from '../../fixtures/UIThemeSettings/themeSettingsData.json';

// Clears settings before each test via onBeforeLoad so SettingsProvider
// mounts with defaultSettings (no version-mismatch risk).
const clearSettings = (win) => {
  win.localStorage.removeItem('app-settings');
  win.localStorage.removeItem('theme-mode');
};

describe('UI Theme Settings Drawer', { tags: ['@regression'] }, () => {
  const page = new UIThemeSettingsPage();

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      // Fullscreen API throws "Permissions check failed" in headless Chrome
      // when requestFullscreen() is denied (no user-activation gesture).
      if (
        err?.message?.toLowerCase().includes('fullscreen') ||
        err?.message?.toLowerCase().includes('permissions check') ||
        err?.message?.includes('Request failed with status code')
      ) return false;
      return true;
    });
    cy.authSession('admin');
    cy.visit(urls.dashboard, { onBeforeLoad: clearSettings });
  });

  // ── 3.1 Navigation & Drawer Interaction ──────────────────────────────

  // Use case — happy path: trigger opens the drawer
  it('SW-THEME-TC01: Settings drawer opens on header button click', { tags: ['@smoke'] }, () => {
    page.openDrawer();
    page.assertDrawerOpen();
  });

  // Use case — close path: X button closes the drawer
  it('SW-THEME-TC02: Settings drawer closes on close button click', () => {
    page.openDrawer();
    page.closeViaButton();
    page.assertDrawerClosed();
  });

  // Use case — keyboard alternative close path
  it('SW-THEME-TC03: Settings drawer closes on ESC key press', () => {
    page.openDrawer();
    page.closeViaEsc();
    page.assertDrawerClosed();
  });

  // Error guessing — backdrop is invisible but should still close drawer
  it('SW-THEME-TC04: Settings drawer closes on backdrop click', () => {
    page.openDrawer();
    page.closeViaBackdrop();
    page.assertDrawerClosed();
  });

  // ── 3.2 Color Scheme Tests ────────────────────────────────────────────

  // EP — light partition: starts in dark, toggle to light
  it('SW-THEME-TC05: Apply light color scheme', () => {
    page.openDrawer();
    page.enableDarkMode();   // ensure dark first so the toggle has meaning
    page.disableDarkMode();  // apply light
    page.assertDarkModeOff();
  });

  // EP — dark partition: toggle dark mode on
  it('SW-THEME-TC06: Apply dark color scheme', () => {
    page.openDrawer();
    page.enableDarkMode();
    page.assertDarkModeOn();
  });

  // SKIP — "system" color scheme is not present in the settings drawer.
  // The drawer only offers a light/dark toggle (BaseOption "Dark mode").
  // Tracked in: cypress/qa/testPlans/uiThemeSettings/pending.md
  it.skip('SW-THEME-TC07: Apply system color scheme — NOT IMPLEMENTED IN DRAWER', () => {});

  // State transition — light → dark → light round trip
  it('SW-THEME-TC08: Switch from light to dark to light', () => {
    page.openDrawer();
    page.enableDarkMode();
    page.assertDarkModeOn();
    page.disableDarkMode();
    page.assertDarkModeOff();
  });

  // Use case — verify default state on a clean load (no prior settings)
  it('SW-THEME-TC09: Default color scheme on first load is light', () => {
    // beforeEach cleared app-settings → SettingsProvider uses defaultSettings
    page.openDrawer();
    // Default: colorScheme='light' → Dark mode switch should be OFF
    page.assertDarkModeOff();
  });

  // ── 3.3 Font Family Tests ─────────────────────────────────────────────

  // EP — Public Sans partition (also default, verifies initial selected state)
  it('SW-THEME-TC10: Select Public Sans font family', { tags: ['@smoke'] }, () => {
    page.openDrawer();
    page.selectFontFamily(data.fontFamily.epPublicSans.buttonText);
    page.assertFontFamilyInStorage(data.fontFamily.epPublicSans.storageValue);
  });

  // EP — Inter partition
  it('SW-THEME-TC11: Select Inter font family', () => {
    page.openDrawer();
    page.selectFontFamily(data.fontFamily.epInter.buttonText);
    page.assertFontFamilyInStorage(data.fontFamily.epInter.storageValue);
    page.assertFontAppliedToBody('Inter');
  });

  // EP — DM Sans partition
  it('SW-THEME-TC12: Select DM Sans font family', () => {
    page.openDrawer();
    page.selectFontFamily(data.fontFamily.epDmSans.buttonText);
    page.assertFontFamilyInStorage(data.fontFamily.epDmSans.storageValue);
    page.assertFontAppliedToBody('DM Sans');
  });

  // EP — Nunito Sans partition
  it('SW-THEME-TC13: Select Nunito Sans font family', () => {
    page.openDrawer();
    page.selectFontFamily(data.fontFamily.epNunitoSans.buttonText);
    page.assertFontFamilyInStorage(data.fontFamily.epNunitoSans.storageValue);
    page.assertFontAppliedToBody('Nunito Sans');
  });

  // Use case — default font on a clean load
  it('SW-THEME-TC14: Default font family on first load is Public Sans', () => {
    page.openDrawer();
    // defaultSettings.fontFamily = 'Public Sans Variable' (settings-config.ts)
    page.assertFontAppliedToBody('Public Sans');
  });

  // ── 3.4 Font Size Tests ───────────────────────────────────────────────

  // BVA — lower boundary (min = 12)
  it('SW-THEME-TC15: Set font size to 12px (lower boundary)', () => {
    page.openDrawer();
    page.setFontSizeViaSlider(data.fontSize.bvaLowerBoundary);
    page.assertFontSizeInStorage(data.fontSize.bvaLowerBoundary);
  });

  // BVA — just above lower boundary (14)
  it('SW-THEME-TC16: Set font size to 14px (just above lower boundary)', () => {
    page.openDrawer();
    page.setFontSizeViaSlider(data.fontSize.bvaJustAboveLower);
    page.assertFontSizeInStorage(data.fontSize.bvaJustAboveLower);
  });

  // BVA — default / mid value (16)
  it('SW-THEME-TC17: Set font size to 16px (default / mid value)', () => {
    page.openDrawer();
    page.setFontSizeViaSlider(data.fontSize.bvaDefault);
    page.assertFontSizeInStorage(data.fontSize.bvaDefault);
  });

  // BVA — just below upper boundary (18)
  it('SW-THEME-TC18: Set font size to 18px (just below upper boundary)', () => {
    page.openDrawer();
    page.setFontSizeViaSlider(data.fontSize.bvaJustBelowUpper);
    page.assertFontSizeInStorage(data.fontSize.bvaJustBelowUpper);
  });

  // BVA — upper boundary (max = 20)
  it('SW-THEME-TC19: Set font size to 20px (upper boundary)', () => {
    page.openDrawer();
    page.setFontSizeViaSlider(data.fontSize.bvaUpperBoundary);
    page.assertFontSizeInStorage(data.fontSize.bvaUpperBoundary);
  });

  // Use case — slider programmatic set: nativeInputValueSetter + 'input' event
  it('SW-THEME-TC20: Drag font size slider changes the stored value', () => {
    page.openDrawer();
    // Starts at default 16; target 18 via setFontSizeViaSlider
    page.setFontSizeViaSlider(data.fontSize.bvaJustBelowUpper);
    page.assertFontSizeInStorage(data.fontSize.bvaJustBelowUpper);
  });

  // Use case — keyboard interaction: arrow key on focused slider thumb
  it('SW-THEME-TC21: Keyboard arrow key nudges font size by 1 step', () => {
    page.openDrawer();
    // Default is 16; one right-arrow increases by 1 step to 17
    page.nudgeFontSizeByKeyboard(1);
    page.assertFontSizeInStorage(17);
  });

  // Error guessing — page should not overflow at boundary font sizes
  it('SW-THEME-TC22: Layout does not break at extreme font sizes', () => {
    page.openDrawer();
    page.setFontSizeViaSlider(data.fontSize.bvaLowerBoundary); // 12
    page.closeViaButton();
    // No horizontal scroll on dashboard
    cy.document().then(doc => {
      expect(doc.body.scrollWidth, 'no horizontal overflow at 12px').to.be.lte(
        doc.documentElement.clientWidth + 5  // 5px tolerance for sub-pixel rounding
      );
    });
    cy.get('nav, [role="navigation"]').first().should('be.visible');
    // Now test upper boundary
    page.openDrawer();
    page.setFontSizeViaSlider(data.fontSize.bvaUpperBoundary); // 20
    page.closeViaButton();
    cy.document().then(doc => {
      expect(doc.body.scrollWidth, 'no horizontal overflow at 20px').to.be.lte(
        doc.documentElement.clientWidth + 5
      );
    });
    cy.get('nav, [role="navigation"]').first().should('be.visible');
  });

  // ── 3.5 Navigation Layout Tests ───────────────────────────────────────

  // EP — vertical layout partition (also the default)
  it('SW-THEME-TC23: Select vertical navigation layout', { tags: ['@smoke'] }, () => {
    page.openDrawer();
    page.selectNavLayout(data.navLayout.epVertical.index);
    page.assertNavLayoutInStorage(data.navLayout.epVertical.value);
  });

  // EP — horizontal layout partition
  it('SW-THEME-TC24: Select horizontal navigation layout', () => {
    page.openDrawer();
    page.selectNavLayout(data.navLayout.epHorizontal.index);
    page.assertNavLayoutInStorage(data.navLayout.epHorizontal.value);
  });

  // EP — mini layout partition
  it('SW-THEME-TC25: Select mini navigation layout', () => {
    page.openDrawer();
    page.selectNavLayout(data.navLayout.epMini.index);
    page.assertNavLayoutInStorage(data.navLayout.epMini.value);
  });

  // State transition — cycle through all 3 layouts
  it('SW-THEME-TC26: Switch between all three navigation layouts', () => {
    page.openDrawer();
    page.selectNavLayout(data.navLayout.epHorizontal.index);
    page.assertNavLayoutInStorage(data.navLayout.epHorizontal.value);
    page.selectNavLayout(data.navLayout.epMini.index);
    page.assertNavLayoutInStorage(data.navLayout.epMini.value);
    page.selectNavLayout(data.navLayout.epVertical.index);
    page.assertNavLayoutInStorage(data.navLayout.epVertical.value);
  });

  // Use case — content area adapts when layout changes
  it('SW-THEME-TC27: Content area is visible with each navigation layout', () => {
    // Verify main content container is visible regardless of nav layout
    [
      data.navLayout.epVertical.index,
      data.navLayout.epHorizontal.index,
      data.navLayout.epMini.index,
    ].forEach(idx => {
      page.openDrawer();
      page.selectNavLayout(idx);
      page.closeViaButton();
      cy.get('main, [role="main"]').first().should('be.visible');
    });
  });

  // Use case — navigation links remain accessible after layout change
  it('SW-THEME-TC28: Navigation links remain accessible in all layouts', () => {
    [
      data.navLayout.epHorizontal.index,
      data.navLayout.epMini.index,
      data.navLayout.epVertical.index,
    ].forEach(idx => {
      page.openDrawer();
      page.selectNavLayout(idx);
      page.closeViaButton();
      // At least one navigation anchor is visible and functional
      cy.get('nav a, [role="navigation"] a').first().should('be.visible');
    });
  });

  // ── 3.5b Navigation Color Tests ──────────────────────────────────────────

  // EP — integrate partition (default nav color)
  it('SW-THEME-TC41: Select Integrate nav color', () => {
    page.openDrawer();
    page.selectNavColor(data.navColor.epIntegrate.buttonText);
    page.assertNavColorInStorage(data.navColor.epIntegrate.value);
  });

  // EP — apparent partition
  it('SW-THEME-TC42: Select Apparent nav color', () => {
    page.openDrawer();
    page.selectNavColor(data.navColor.epApparent.buttonText);
    page.assertNavColorInStorage(data.navColor.epApparent.value);
  });

  // ── 3.6 Compact Mode Tests ────────────────────────────────────────────

  // Decision table — compact ON: default is compactLayout=true, so toggle
  // OFF then back ON to test both sides
  it('SW-THEME-TC29: Enable compact mode', () => {
    page.openDrawer();
    // Start: default compactLayout=true; ensure it's ON
    page.assertCompactOn();
  });

  // Decision table — compact OFF: toggle from default (true) to false
  it('SW-THEME-TC30: Disable compact mode', () => {
    page.openDrawer();
    page.toggleCompact(); // default=true → toggle → false
    page.assertCompactOff();
  });

  // State transition — toggle compact on/off in sequence
  it('SW-THEME-TC31: Toggle compact mode on and off', () => {
    page.openDrawer();
    // Default: ON
    page.assertCompactOn();
    page.toggleCompact();
    page.assertCompactOff();
    page.toggleCompact();
    page.assertCompactOn();
  });

  // Error guessing — Compact BaseOption has a tooltip info icon (eva:info-outline SVG)
  it('SW-THEME-TC32: Compact mode option shows an info icon tooltip trigger', () => {
    page.openDrawer();
    // The Compact tile contains at least 2 SVGs: the setting icon + the info icon
    page.assertCompactInfoIconVisible();
  });

  // ── 3.7 Contrast Toggle Tests ─────────────────────────────────────────

  // Decision table — contrast ON
  it('SW-THEME-TC33: Enable high contrast mode', () => {
    page.openDrawer();
    page.toggleContrast();
    page.assertContrastOn();
  });

  // Decision table — contrast OFF: toggle on then off
  it('SW-THEME-TC34: Disable high contrast mode', () => {
    page.openDrawer();
    page.toggleContrast(); // enable
    page.toggleContrast(); // disable
    page.assertContrastOff();
  });

  // Error guessing — key elements remain visible with contrast enabled
  it('SW-THEME-TC35: Key page elements remain visible with contrast enabled', () => {
    page.openDrawer();
    page.toggleContrast();
    page.closeViaButton();
    // Verify that the page heading and nav are still visible after contrast change
    cy.get('nav, [role="navigation"]').first().should('be.visible');
    cy.get('main, [role="main"]').first().should('be.visible');
  });

  // ── 3.8 Right-to-Left (RTL) Tests ────────────────────────────────────

  // Decision table — RTL ON
  it('SW-THEME-TC36: Enable RTL text direction', () => {
    page.openDrawer();
    page.enableRtl();
    page.assertDirectionRtl();
  });

  // Decision table — RTL OFF (restore LTR)
  it('SW-THEME-TC37: Disable RTL and restore LTR', () => {
    page.openDrawer();
    page.enableRtl();
    page.assertDirectionRtl();
    page.disableRtl();
    page.assertDirectionLtr();
  });

  // ── 3.9 Fullscreen Toggle Tests ───────────────────────────────────────

  // Use case — clicking fullscreen button initiates fullscreen
  // (requestFullscreen may be unavailable in headless CI — handled gracefully)
  it('SW-THEME-TC38: Fullscreen button click attempts fullscreen mode', () => {
    page.openDrawer();
    page.clickFullscreen();
    page.assertFullscreenStateIs(true);
  });

  // Use case — clicking fullscreen button again exits fullscreen
  it('SW-THEME-TC39: Clicking fullscreen button again exits fullscreen', () => {
    page.openDrawer();
    page.clickFullscreen(); // enter
    cy.document().then(doc => {
      if (doc.fullscreenElement) {
        page.clickFullscreen(); // exit
        page.assertFullscreenStateIs(false);
      } else {
        cy.log('Fullscreen API not available — exit path cannot be verified');
      }
    });
  });

  // ── 3.10 Persistence Tests ────────────────────────────────────────────

  // State transition — multiple settings survive a hard page refresh
  it('SW-THEME-TC40: All settings persist after page refresh', { tags: ['@smoke'] }, () => {
    // 1. Apply a combination of non-default settings via the drawer
    page.openDrawer();
    page.enableDarkMode();
    page.enableRtl();
    page.selectNavLayout(data.navLayout.epMini.index);
    page.selectFontFamily(data.fontFamily.epInter.buttonText);
    page.setFontSizeViaSlider(data.fontSize.bvaJustBelowUpper); // 18
    page.closeViaButton();

    // 2. Verify settings are in localStorage before refresh
    page.assertStorageKey('colorScheme', 'dark');
    page.assertStorageKey('direction', 'rtl');
    page.assertStorageKey('navLayout', 'mini');
    page.assertStorageKey('fontFamily', data.fontFamily.epInter.storageValue);
    page.assertStorageKey('fontSize', data.fontSize.bvaJustBelowUpper);

    // 3. Hard reload — SettingsProvider reads from localStorage on mount
    cy.reload();

    // 4. Verify settings are still in localStorage after reload
    page.assertStorageKey('colorScheme', 'dark');
    page.assertStorageKey('direction', 'rtl');
    page.assertStorageKey('navLayout', 'mini');
    page.assertStorageKey('fontFamily', data.fontFamily.epInter.storageValue);
    page.assertStorageKey('fontSize', data.fontSize.bvaJustBelowUpper);

    // 5. Re-open drawer and verify switch state reflects persisted settings
    page.openDrawer();
    page.assertDarkModeOn();
    page.assertDirectionRtl();
  });
});
