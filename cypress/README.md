# StockFlow — Cypress suite

Cypress E2E + API tests for a warehouse / inventory-management application.
This is a curated subset: **54 spec files · 1,115 tests**. See the repository
[README](../README.md) for setup, scripts, and the full test inventory, and
[ROUTE_COVERAGE_MATRIX.md](ROUTE_COVERAGE_MATRIX.md) for API coverage.

> Environment URLs and credentials are placeholders (`*.example`, `user` /
> `password`). The application under test is not bundled here.

## Layout

| Path | Purpose |
|------|---------|
| `e2e/*.cy.js` | Root UI specs — login, navigation, category/attribute CRUD, add product, stock in/out, scan, export (12 specs) |
| `e2e/api/` | Pure-API specs via `cy.request` — auth, category, attribute, product-name, teardown (9 specs) |
| `e2e/Configuration/` | Attribute matrices, category, product-name, scan / BrainBox / general config (10 specs) |
| `e2e/IncomingInventory/` | Purchase-order receiving — import, scan, stats, change-status, export, cost, move/delete (13 specs) |
| `e2e/Inventory/` | Inventory grid — category filter, sort, group-by, status, stock-out, restock, detail (10 specs) |
| `pageObjects/` | Page Object Model classes |
| `support/locators/` | Selectors, isolated per screen |
| `support/helpers/` | Cross-cutting reusable flows |
| `support/commands.js` | Custom commands + cached sessions |
| `fixtures/` | Static test data |

## Conventions

- **Page Object Model** — specs hold intent + assertions only; selectors live in
  `support/locators/`; page objects translate intent into actions.
- **Test IDs** — `SW-<AREA>-TC<NN>` (UI) and `SW-<AREA>-API-TC<NN>` (API).
- **Tags** — `@smoke` (critical path) and `@regression`, filtered with
  `--env grepTags=@smoke`.
- **API specs** — authenticate once, reuse the token, use
  `failOnStatusCode: false` for negative paths, and self-revert mutations.
- **Reporting** — Mochawesome (`npm run smoke-tests` runs and serves a report).
