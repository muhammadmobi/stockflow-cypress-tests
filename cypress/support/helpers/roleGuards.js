/**
 * Runtime role guards.
 *
 * Some cases can only run when a dedicated IAM account exists for a
 * non-admin role (Sales, a second Worker, …). Those accounts are optional:
 * they live under `tenants.<tenant>.<role>` in the gitignored
 * `cypress.env.json`, so a fresh clone — or any environment that has not
 * provisioned them — has none. `cy.credentials(role)` yields empty strings
 * rather than throwing, and `cy.authSession(role)` would then hard-fail the
 * test on "missing credentials", which reads like a product bug when it is
 * only a missing local account.
 *
 * This is the ONE implementation of that guard. It previously existed as five
 * copy-pasted eight-line blocks (navigation, two PurchaseOrder specs,
 * CustomReport, InventoryReport), which would inevitably drift.
 *
 * Why it takes `ctx` instead of being a `cy.*` command: skipping a test is
 * mocha's job, not Cypress's — only the runnable can do it, and a custom
 * command can reach it only through undocumented `cy.state()` internals. So
 * the caller passes its own mocha context. That requires the enclosing
 * `it()` / `beforeEach()` to be a `function ()`, NOT an arrow — with an arrow,
 * `this` is not the test and the skip silently does nothing.
 *
 * Skips are runtime and environment-driven, so per cypress/qa/SKILL.md §11 each
 * consuming module documents them in its `pending.md`.
 *
 * @example
 *   it('SW-X-TC01 — sales cannot reach the page', function () {
 *     requireRoleOrSkip(this, 'sales');
 *     cy.authSession('sales');
 *     // …
 *   });
 *
 * @param {Mocha.Context} ctx   the enclosing test's `this`
 * @param {string} role         role key, e.g. 'sales' | 'worker'
 * @param {string} [what]       optional phrase naming what is skipped, for the log
 */
export function requireRoleOrSkip(ctx, role, what) {
  return cy.credentials(role).then((c) => {
    if (!c.username || !c.password) {
      cy.log(
        `${role} creds not provisioned — skipping${what ? ` ${what}` : ''}. ` +
          `Add tenants.<tenant>.${role} to cypress.env.json to run it.`,
      );
      ctx.skip();
    }
  });
}
