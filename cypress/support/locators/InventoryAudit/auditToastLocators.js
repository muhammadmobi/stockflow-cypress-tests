// cypress/support/locators/InventoryAudit/auditToastLocators.js
//
// One toast locator for every Inventory Audit desktop page object.
//
// WHY IT MATCHES A GENERATED CLASS AND NOT A ROLE — verified against the deployed
// app on 2026-08-18, not assumed:
//
// react-hot-toast's documented default `ariaProps` are `role="status"` /
// `aria-live="polite"`, and this suite's older convention
// (`InvAdvancedSearchLocators.js`) says its notifications carry `role="alert"`.
// BOTH are wrong for this build. A DOM dump taken at the moment a toast is on
// screen shows the message div with **no role attribute at all**:
//
//   <DIV role=null class="">              <- the message
//     <- <DIV role=null class="">
//     <- <DIV role=null class="go4109123758">   <- the toast bar
//     <- <DIV role=null class="">               <- the Toaster container
//     <- <BODY>
//
// So the only stable hook is the class goober (react-hot-toast's CSS-in-JS engine)
// generates, which is always `go` + a hash. The HASH IS NOT STABLE — this build
// renders `go4109123758` while `newProductLocators.js` hardcodes `go2072408551`
// from an older one — so match on the `go` PREFIX and never on a full class name.
//
// `[data-hot-toast]` is included as a forward-compatible alternative: the app's own
// dismiss handler in `Frontend/src/main.tsx` looks for it, so a future
// react-hot-toast version that emits it will keep these assertions working.
//
// A MUI `<Alert>` banner is deliberately NOT matched: those are persistent page
// content (the create screen's preview warnings, the settings dialog's load error),
// and letting one satisfy a "the toast said X" assertion would make the assertion
// meaningless.
//
// NOTE for the worker screens: the mobile count screen does NOT use
// react-hot-toast at all — it renders a MUI Snackbar. Use
// `workerCountLocators.snackbar()` there, never this file.

/** The react-hot-toast bar: goober-generated class, or a future data attribute. */
export const TOAST = 'div[class^="go"], [data-hot-toast]';

/**
 * Toasts render one React commit AFTER the network response that triggers them,
 * so a `cy.wait('@alias')` returns before the toast exists. Every query here is
 * retrying with a generous timeout for exactly that reason — and toasts here live
 * 4–5 s (`toastOptions.duration` in main.tsx), so the window is real but finite.
 */
const auditToastLocators = {
  toast: () => cy.get(TOAST, { timeout: 15000 }),

  /** The concatenated text of every visible toast — several can stack. */
  toastText: () => cy.get(TOAST, { timeout: 15000 }).invoke('text'),
};

export default auditToastLocators;
