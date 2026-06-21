# API Route Coverage Matrix

**Scope:** the API specs in this subset (`cypress/e2e/api/`, 9 specs / 72 tests)
mapped to the backend route groups they exercise via `cy.request`.

> URLs are placeholders (`*.example`). This matrix reflects the **curated
> subset** in this repository, not a full backend audit.

## API specs → route groups

| Spec | Tests | Route group(s) exercised |
|------|------:|--------------------------|
| `LoginAPI.cy.js` | 10 | `POST /auth/login`, `POST /auth/refresh` — token shape, wrong password, missing fields, refresh flow |
| `CategoryAPI.cy.js` | 17 | `GET/POST/PATCH/DELETE /categories` — CRUD, sort, pagination, hierarchy moves |
| `CreateCategoryAPI.cy.js` | 8 | `POST /categories` — product-only / product+item / variant, duplicate-name & missing-field validation |
| `CommonAttributeAPI.cy.js` | 8 | `POST/PATCH/DELETE /attributes` — common-attribute CRUD across types |
| `ProductCategoryAttributeAPI.cy.js` | 8 | `/attributes` scoped to product-only categories |
| `ProductItemCategoryAttributeAPI.cy.js` | 4 | `/attributes` scoped to product+item categories (item-level paths) |
| `AttributeDeletionRestrictionAPI.cy.js` | 4 | `DELETE /attributes/:id` — blocked when linked data exists (failure envelope) |
| `ProductNameAPI.cy.js` | 7 | `GET/POST /product-name-config` — custom text tags, save/update/remove, validation |
| `ZZ_TeardownAPI.cy.js` | 6 | Walks the API and deletes test-prefixed resources (categories, attributes) in dependency-safe order |

## Conventions

Each spec:

- authenticates once in `before()` and reuses the bearer token through a
  `headers()` helper;
- uses `failOnStatusCode: false` so negative paths are asserted as status codes
  rather than thrown errors;
- exposes a `noAuth` option on helpers to assert the matching `401`;
- is **self-reverting** — every created category/attribute is removed, and the
  `ZZ_` teardown spec (runs last alphabetically) sweeps anything left behind,
  gated by a test-prefix allow-list so seeded data is never touched.

## Negative-path coverage

Every route group is hit with at least one of: no-auth → `401`, missing/invalid
body → `400` / failure envelope, unknown id → semantic non-success (never `5xx`).
