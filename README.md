# StockFlow — End-to-End Tests

> **Portfolio / showcase repository.** A Cypress (JavaScript) E2E **and** API
> automation framework for a warehouse / inventory-management application.
> All environment URLs and credentials are **placeholders** (`*.example`,
> `user` / `password`) — point the configs at your own environment and inject
> real secrets via CI. The application under test is not bundled here, so the
> specs are intended as a demonstration of framework structure, scope, and
> engineering practices.

## Highlights

- **54 spec files · 1,115 tests** across UI and API.
- **Page Object Model** — selectors isolated in `support/locators/`, intent in
  `pageObjects/`, assertions in specs.
- **Custom commands & cached sessions** (`cy.login`, session helpers).
- **Fixtures** for data-driven tests; **ISTQB** design techniques (EP, BVA,
  decision tables, state transition, error guessing).
- **Tag-based filtering** (`@smoke` / `@regression`) via `@bahmutov/cy-grep`.
- **Mochawesome** HTML reporting.
- **Multi-environment config** — one `cypress.base.config.js` factory with
  per-environment QA / Stage configs.

## Project structure

```
stockflow-cypress-tests/
├── cypress/
│   ├── e2e/
│   │   ├── *.cy.js            # root UI specs (login, navigation, CRUD, stock in/out, scan, export)
│   │   ├── api/               # pure-API specs (cy.request)
│   │   ├── Configuration/     # attribute / category / config screens
│   │   ├── IncomingInventory/ # purchase-order receiving
│   │   └── Inventory/         # inventory grid
│   ├── pageObjects/           # Page Object Model classes
│   ├── support/
│   │   ├── locators/          # selectors, isolated per screen
│   │   ├── helpers/           # cross-cutting reusable flows
│   │   ├── commands.js        # custom commands + cached sessions
│   │   └── e2e.js             # global setup + cy-grep
│   ├── fixtures/              # static test data
│   └── ROUTE_COVERAGE_MATRIX.md
├── cypress.base.config.js     # shared config factory
├── cypress.config.js          # QA environment (placeholder URLs)
├── cypress.stage.config.js    # Stage environment (placeholder URLs)
├── cypress-framework-documentation.md
└── package.json
```

## Getting started

```bash
npm install
npx cypress open      # interactive runner
npx cypress run       # headless (QA config by default)
```

Point it at your own environment without editing files:

```bash
npx cypress run --config baseUrl=https://your-app.example.com \
  --env API_BASE_URL=https://api.example.com,email=$USER,pass=$PASS
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run cy:open` | Open the Cypress Test Runner |
| `npm run cy:run` | Run all specs headless |
| `npm run cy:run:smoke` | Run only `@smoke`-tagged specs |
| `npm run cy:run:regression` | Run only `@regression`-tagged specs |
| `npm run merge-reports` / `generate-report` | Build the Mochawesome HTML report |
| `npm run smoke-tests` | Clean → run smoke → merge → generate → serve report |

## Test inventory (54 specs · 1,115 tests)

### Root UI suites — 12 specs / 111 tests

| Spec | Tests |
|------|------:|
| `00-ensureAttrsOptional.cy.js` | 1 |
| `00-loginPageTest.cy.js` | 15 |
| `01-navigationTest.cy.js` | 70 |
| `03-catagoryCRUDTest.cy.js` | 2 |
| `04-catagoryAttribCRUDTest.cy.js` | 3 |
| `05-AddProductTests.cy.js` | 9 |
| `07-StockInTests.cy.js` | 2 |
| `08-InventoryActionStockIn.cy.js` | 2 |
| `09-ExportExcelFileTests.cy.js` | 2 |
| `10-ScanTests.cy.js` | 1 |
| `11-StockOutTests.cy.js` | 3 |
| `12-InventoryActionStockOut.cy.js` | 1 |

### API suites (`cypress/e2e/api/`) — 9 specs / 72 tests

| Spec | Tests | Covers |
|------|------:|--------|
| `LoginAPI.cy.js` | 10 | Auth login + refresh, happy/negative, token shape |
| `CategoryAPI.cy.js` | 17 | Category CRUD, sort, pagination, hierarchy |
| `CreateCategoryAPI.cy.js` | 8 | Category creation variants + validation |
| `CommonAttributeAPI.cy.js` | 8 | Common attribute CRUD matrix |
| `ProductCategoryAttributeAPI.cy.js` | 8 | Product-category attributes |
| `ProductItemCategoryAttributeAPI.cy.js` | 4 | Product-item attributes |
| `AttributeDeletionRestrictionAPI.cy.js` | 4 | Deletion blocked when data is linked |
| `ProductNameAPI.cy.js` | 7 | Product-name configuration |
| `ZZ_TeardownAPI.cy.js` | 6 | Self-cleaning teardown of test-created resources |

### Configuration (`cypress/e2e/Configuration/`) — 10 specs / 460 tests

| Spec | Tests |
|------|------:|
| `01-common-attribute-tests.cy.js` | 118 |
| `02-product-cat-attribute-tests.cy.js` | 54 |
| `03-product-Item-cat-attribute-tests.cy.js` | 124 |
| `04-attribute-deletion-restriction-tests.cy.js` | 52 |
| `05-categoryTests.cy.js` | 43 |
| `06-productNameTests.cy.js` | 14 |
| `08-scan-config-tests.cy.js` | 10 |
| `09-BrainBoxConfigTests.cy.js` | 9 |
| `10-generalConfigTests.cy.js` | 34 |
| `11-zz-teardownConfiguration.cy.js` | 2 |

### Incoming Inventory (`cypress/e2e/IncomingInventory/`) — 13 specs / 278 tests

| Spec | Tests | Spec | Tests |
|------|------:|------|------:|
| `ImportTests.cy.js` | 69 | `ScanAllProductTests.cy.js` | 12 |
| `IncInvStatsClickTests.cy.js` | 53 | `ItemDelete.cy.js` | 11 |
| `ChangeStatusTests.cy.js` | 26 | `ScanReportTests.cy.js` | 11 |
| `ExportTests.cy.js` | 21 | `IncomingInventoryDeleteProduct.cy.js` | 10 |
| `UpdateCostPrice.cy.js` | 20 | `IncomingInventoryMoveProduct.cy.js` | 10 |
| `AddProduct.cy.js` | 16 | `ProductDetailsItemsSorting.cy.js` | 10 |
| | | `ScanAllItemTests.cy.js` | 9 |

### Inventory (`cypress/e2e/Inventory/`) — 10 specs / 194 tests

| Spec | Tests | Spec | Tests |
|------|------:|------|------:|
| `InventoryCategoryFilterTests.cy.js` | 73 | `InventoryProductDetailTests.cy.js` | 6 |
| `InventoryChangeStatusTests.cy.js` | 25 | `InventoryRestockTests.cy.js` | 6 |
| `InventoryGroupByTests.cy.js` | 25 | `InventoryCustomizeColumnsTests.cy.js` | 6 |
| `InventoryAdvancedSearchTests.cy.js` | 22 | `InventoryItemsViewTests.cy.js` | 5 |
| `InventoryStockOutTests.cy.js` | 21 | `InventorySortingTests.cy.js` | 5 |

## Configuration & secrets

All environment hosts use placeholder domains (`*.example`) and all credentials
are placeholders (`user` / `password`). Point the configs at your own
environment and inject real values at runtime or via CI secrets — never commit
real URLs or credentials.

See [cypress/ROUTE_COVERAGE_MATRIX.md](cypress/ROUTE_COVERAGE_MATRIX.md) for API
coverage and [cypress-framework-documentation.md](cypress-framework-documentation.md)
for the framework deep-dive.
