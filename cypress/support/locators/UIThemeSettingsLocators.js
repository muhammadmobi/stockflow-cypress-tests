// cypress/support/locators/UIThemeSettingsLocators.js
//
// DOM selectors for the UI Theme Settings Drawer.
// Source: Frontend/src/components/settings/drawer/settings-drawer.tsx
// Trigger: Frontend/src/layouts/components/settings-button.tsx
// Storage key: 'app-settings' (from settings-config.ts SETTINGS_STORAGE_KEY)

const DRAWER = '.MuiDrawer-paperAnchorRight';

const UIThemeSettingsLocators = {
  // ── Trigger ─────────────────────────────────────────────────────────────
  // settings-button.tsx: aria-label="Settings button"
  settingsButton: () => cy.get('button[aria-label="Settings button"]'),

  // ── Drawer ──────────────────────────────────────────────────────────────
  drawerPaper: () => cy.get(DRAWER),
  // Typography variant="h6" renders as <h6>
  drawerTitle: () => cy.get(DRAWER).find('h6').first(),

  // ── Header action buttons ───────────────────────────────────────────────
  // Header flex Box contains: h6("Settings") + FullScreenButton + Reset IconButton + Close IconButton
  // Target buttons scoped to the same flex parent as the h6 to avoid matching
  // OptionButton / SmallLabel buttons in the scrollable section below.
  _headerArea: () => cy.get(DRAWER).find('h6').first().parent(),
  fullscreenButton: () => UIThemeSettingsLocators._headerArea().find('button').eq(0),
  resetAllButton:   () => UIThemeSettingsLocators._headerArea().find('button').eq(1),
  closeButton:      () => UIThemeSettingsLocators._headerArea().find('button').eq(2),

  // ── Backdrop (invisible but present) ────────────────────────────────────
  backdrop: () => cy.get('.MuiBackdrop-root'),

  // ── BaseOption tiles ────────────────────────────────────────────────────
  // BaseOption renders a ButtonBase (button) containing a Switch.
  // The Switch input has name={label}. .closest('button') traverses up to the tile.
  darkModeOption: () => cy.get(`${DRAWER} input[name="Dark mode"]`).closest('button'),
  contrastOption: () => cy.get(`${DRAWER} input[name="Contrast"]`).closest('button'),
  rtlOption:      () => cy.get(`${DRAWER} input[name="Right to left"]`).closest('button'),
  compactOption:  () => cy.get(`${DRAWER} input[name="Compact"]`).closest('button'),

  // Switch inputs — used for checked-state assertions
  darkModeInput: () => cy.get(`${DRAWER} input[name="Dark mode"]`),
  contrastInput: () => cy.get(`${DRAWER} input[name="Contrast"]`),
  rtlInput:      () => cy.get(`${DRAWER} input[name="Right to left"]`),
  compactInput:  () => cy.get(`${DRAWER} input[name="Compact"]`),

  // ── Nav — Layout ─────────────────────────────────────────────────────────
  // SmallLabel "Layout" (ButtonBase = <button>) is followed by its sibling
  // NavLayoutOptions Box (<div>) containing 3 icon-only OptionButton (<button>).
  // Order: vertical=0, horizontal=1, mini=2 (settings-drawer.tsx options array).
  navLayoutOptionButtons:  () => cy.get(DRAWER).contains('button', 'Layout').next().find('button'),
  navLayoutVerticalBtn:    () => cy.get(DRAWER).contains('button', 'Layout').next().find('button').eq(0),
  navLayoutHorizontalBtn:  () => cy.get(DRAWER).contains('button', 'Layout').next().find('button').eq(1),
  navLayoutMiniBtn:        () => cy.get(DRAWER).contains('button', 'Layout').next().find('button').eq(2),

  // ── Nav — Color ──────────────────────────────────────────────────────────
  navColorIntegrateBtn: () => cy.get(DRAWER).contains('button', 'Integrate'),
  navColorApparentBtn:  () => cy.get(DRAWER).contains('button', 'Apparent'),

  // ── Font — Family ────────────────────────────────────────────────────────
  // FontFamilyOptions strips " Variable" suffix for display text.
  fontPublicSansBtn: () => cy.get(DRAWER).contains('button', 'Public Sans'),
  fontInterBtn:      () => cy.get(DRAWER).contains('button', 'Inter'),
  fontDmSansBtn:     () => cy.get(DRAWER).contains('button', 'DM Sans'),
  fontNunitoSansBtn: () => cy.get(DRAWER).contains('button', 'Nunito Sans'),

  // ── Font — Size ──────────────────────────────────────────────────────────
  // FontSizeOptions renders MUI Slider with aria-label="Change font size".
  // Range: min=12, max=20, step=1 (font-options.tsx options prop [12, 20]).
  fontSizeSlider: () => cy.get(`${DRAWER} input[aria-label="Change font size"]`),
  // The visual thumb (for keyboard interaction)
  fontSizeThumb:  () => cy.get(`${DRAWER} .MuiSlider-thumb`).first(),
};

export default UIThemeSettingsLocators;
