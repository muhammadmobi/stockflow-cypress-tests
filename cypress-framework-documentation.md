# StockFlow Cypress Automation Framework — Documentation

The reference for this Cypress E2E + API test framework. It covers the
architecture, conventions, and the test inventory of the curated subset shipped
here: **54 spec files · 1,115 tests**.

> Environment URLs and credentials are placeholders (`*.example`, `user` /
> `password`). The application under test is not bundled — this repo demonstrates
> framework structure, scope, and engineering practices.

---

## Table of contents

1. Introduction & purpose
2. Technology stack
3. Architecture — the big picture
4. Directory structure
5. Configuration (base + per-environment)
6. Global support files
7. Custom commands & sessions
8. Page Object Model
9. Fixtures — test-data strategy
10. Helpers
11. Spec catalog
12. API spec conventions
13. Test IDs, tags & design techniques
14. Execution flow
15. Reporting

---

## 1. Introduction & purpose

Cypress is a JavaScript end-to-end testing framework that runs in the same
run-loop as the application under test — automatic waiting, time-travel
debugging, network stubbing, and a single language (JS) for **UI** and **API**
tests via `cy.request`.

This framework demonstrates a production-style structure: a layered Page Object
Model, custom commands with cached sessions, fixtures for data-driven tests,
tag-based smoke/regression filtering, Mochawesome reporting, and a
multi-environment configuration factory.

| Metric | Value |
|---|---|
| Spec files | 54 |
| Tests | 1,115 |
| Modules | root, api, Configuration, IncomingInventory, Inventory |
| Environments | QA (default), Stage |

---

## 2. Technology stack

| Package | Role |
|---|---|
| `cypress` | E2E + API test runner |
| `@bahmutov/cy-grep` | Filter tests by `@tag` |
| `@cypress/xpath`, `cypress-xpath` | XPath selectors |
| `@testing-library/cypress` | Accessible query helpers |
| `@faker-js/faker` | Generate fake test data |
| `cypress-file-upload` | File-upload support |
| `cypress-real-events` | Native browser events |
| `cypress-mochawesome-reporter` / `mochawesome-merge` | HTML reporting |
| `exceljs` | Read/write Excel for import/export tests |
| `dotenv` | Load env vars |

---

## 3. Architecture — the big picture

```
        +---------------- Spec (cypress/e2e/**) ----------------+
        |  describe / it — intent + assertions only             |
        +---------------+-----------------------+----------------+
                        | uses                  | uses
              +---------v--------+    +----------v---------+
              |   Page Object    |    |  Custom commands   |
              | (pageObjects/*)  |    | (support/commands) |
              +---------+--------+    +----------+---------+
                        | uses                  | reads
              +---------v--------+    +----------v---------+
              |     Locators     |    |      Fixtures      |
              | (support/locators)|   |  (fixtures/*.json) |
              +------------------+    +--------------------+
```

- **Specs** describe behaviour — never raw selectors.
- **Page objects** turn intent (`login`, `addProduct`) into actions.
- **Locators** are the only place a selector string lives.
- **Fixtures** hold data, never logic.
- **Commands** hold cross-cutting flows (login, sessions, API auth).

---

## 4. Directory structure

```
cypress/
├── e2e/
│   ├── *.cy.js            # root UI specs (12)
│   ├── api/               # pure-API specs (9)
│   ├── Configuration/     # attribute / category / config (10)
│   ├── IncomingInventory/ # PO receiving (13)
│   └── Inventory/         # inventory grid (10)
├── pageObjects/           # Page Object Model classes
├── support/
│   ├── locators/          # selectors per screen
│   ├── helpers/           # reusable cross-cutting flows
│   ├── commands.js        # custom commands + sessions
│   └── e2e.js             # global setup + cy-grep
├── fixtures/              # static test data
cypress.base.config.js     # shared config factory
cypress.config.js          # QA env (placeholder URLs)
cypress.stage.config.js    # Stage env (placeholder URLs)
```

---

## 5. Configuration

`cypress.base.config.js` exports a `buildConfig({ baseUrl, env })` factory.
Per-environment configs import it and inject only the differing URLs/credentials,
so reporter options, timeouts, the grep plugin, and Node tasks are defined once.

- `cypress.config.js` — QA (default).
- `cypress.stage.config.js` — Stage.

Override at runtime without editing files:

```bash
npx cypress run --config baseUrl=https://your-app.example.com \
  --env API_BASE_URL=https://api.example.com,email=$USER,pass=$PASS
```

---

## 6. Global support files

`cypress/support/e2e.js` is loaded before every spec: it imports the custom
commands and helpers and registers `@bahmutov/cy-grep`.

---

## 7. Custom commands & sessions

Defined in `cypress/support/commands.js`:

- `cy.getAuthToken()` — read the JWT from app storage.
- `cy.login()` — programmatic UI login using env credentials.
- session helpers — cached login via `cy.session` so each spec authenticates
  once and revalidates the persisted session.

---

## 8. Page Object Model

Three layers, one job each:

1. **Spec** — `loginPage.login(user, pass)` then asserts.
2. **Page object** (`pageObjects/loginPage.js`) — `enterEmail → enterPassword → submit`.
3. **Locators** (`support/locators/loginLocators.js`) — the selector strings.

A markup change is a one-line edit in the locators file.

---

## 9. Fixtures — test-data strategy

`cypress/fixtures/` holds static data loaded in `before()` hooks (e.g.
`users.json`, `loginPageData.json`, attribute/import data sets). Keeping expected
strings and payloads in fixtures means a data change updates one JSON file rather
than every assertion.

---

## 10. Helpers

`cypress/support/helpers/` holds cross-cutting reusable flows (attribute helpers,
pagination, sorting, category navigation/filter, incoming-inventory flows, etc.)
so specs stay declarative.

---

## 11. Spec catalog

| Module | Specs | Tests | Coverage |
|---|---:|---:|---|
| Root UI | 12 | 111 | Login, navigation, category & attribute CRUD, add product, stock in/out, scan, export |
| `api/` | 9 | 72 | Auth, category, attribute, product-name config, teardown |
| `Configuration/` | 10 | 460 | Common/product/item attribute matrices, category, product-name, scan / BrainBox / general config |
| `IncomingInventory/` | 13 | 278 | PO receiving — import, scan, stats, change-status, export, cost, move/delete |
| `Inventory/` | 10 | 194 | Inventory grid — category filter, sort, group-by, status, stock-out, restock, detail |

Per-spec test counts are listed in the repository [README](README.md).

---

## 12. API spec conventions

Pure-API specs (`cypress/e2e/api/`) use `cy.request` against the backend:

- authenticate once in `before()`, reuse the bearer token via a `headers()` helper;
- `failOnStatusCode: false` so negative paths assert status codes instead of throwing;
- a `noAuth` option on helpers to assert the matching `401`;
- **self-reverting** mutations — every create is deleted; `ZZ_TeardownAPI`
  (runs last alphabetically) sweeps any test-prefixed resources left behind.

See [cypress/ROUTE_COVERAGE_MATRIX.md](cypress/ROUTE_COVERAGE_MATRIX.md).

---

## 13. Test IDs, tags & design techniques

- **IDs** — `SW-<AREA>-TC<NN>` (UI), `SW-<AREA>-API-TC<NN>` (API).
- **Tags** — `@smoke` (critical path), `@regression`. Filter with
  `--env grepTags=@smoke`.
- **Techniques** — equivalence partitioning, boundary value analysis, decision
  tables, state transition, error guessing — cited above the relevant `it()`.

---

## 14. Execution flow

```
npx cypress run
  ├─ support/e2e.js loads commands + cy-grep
  ├─ each spec: before() loads fixtures / auth token
  ├─ tests execute (UI via POM, API via cy.request)
  └─ Mochawesome writes per-spec JSON + HTML report
```

---

## 15. Reporting

`cypress-mochawesome-reporter` writes per-spec JSON; `mochawesome-merge` + the
report generator assemble a single HTML report. `npm run smoke-tests` runs the
smoke suite and serves the report locally.
