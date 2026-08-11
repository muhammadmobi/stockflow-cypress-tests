// cypress/support/helpers/accountwise.js
//
// Helpers for driving AccountWise → StockWise integration flows from Cypress.
//
// AccountWise is a separate app that, when an invoice is created with
// metadata.work_order = true, calls StockWise's API to create a corresponding
// work order. These helpers let a StockWise spec exercise that integration
// without touching the AccountWise UI: log in to AccountWise, search StockWise
// products, build a valid invoice body around a real product, and POST it to
// AccountWise's invoice endpoint.
//
// TWO TOKENS, NOT INTERCHANGEABLE. AccountWise endpoints take the AccountWise
// bearer from loginToAccountWise() (`awToken`); StockWise endpoints (getSwApi())
// take the StockWise/Keycloak bearer from cy.getAuthToken() (`swToken`). They
// were interchangeable while both apps shared the legacy identity server —
// since the Keycloak migration, sending an AccountWise token to StockWise
// returns 401 {"code":"UNAUTHORIZED"}. Helper parameters are named for the
// token they require so a mismatch is visible at the call site.

import baseInvoiceBody from '../../fixtures/accountWiseInvoice.json';
import baseSalesOrderBody from '../../fixtures/accountWiseSalesOrder.json';

// Read the base URLs lazily and validate on first use. Reading at
// module-load with no validation produces "undefined/..." URLs on
// misconfigured CI runs and confusing downstream errors; this pattern
// mirrors getApiBaseUrl() in scanAllTestHelpers.js — fail fast with a
// clear message if any required env var is missing.
function requireEnv(name) {
  const value = Cypress.env(name);
  expect(value, `Cypress env ${name} must be configured`).to.be.a('string').and.not.empty;
  return value;
}

const getAwIdentity = () => requireEnv('ACCOUNTWISE_IDENTITY_BASE_URL');
const getAwInvoice  = () => requireEnv('ACCOUNTWISE_INVOICE_BASE_URL');
const getSwApi      = () => requireEnv('API_BASE_URL');

// Guard for seed-discovery requests. cy.request is configured with
// failOnStatusCode:false so we can read resp.body on 4xx (and so polling
// helpers can probe a not-yet-existent resource), but for *seed lookup*
// requests a non-2xx response means real misconfiguration (bad token,
// wrong base URL, server down) — letting the empty list fall through to
// the no-match path produces a misleading "no products found, skipping"
// instead of a clear failure. Throw with the response body excerpt so the
// failure points straight at the cause.
// 502/503/504 are transient gateway errors — retried by requestWithRetry.
function assertSeedRequestOk(resp, contextLabel) {
  if (resp.status >= 400) {
    const errBody = JSON.stringify(resp.body?.error ?? resp.body ?? {}).slice(0, 300);
    throw new Error(
      `Seed-discovery request failed at ${contextLabel}: HTTP ${resp.status}. Response: ${errBody}. Check API_BASE_URL / token validity.`,
    );
  }
}

// Wraps cy.request with up to maxRetries retries on transient gateway errors
// (502, 503, 504). Uses a 3-second wait between attempts via cy.wait so
// Cypress's command queue is respected. On final failure throws the same
// error as assertSeedRequestOk so callers get a clear message.
function requestWithRetry(options, contextLabel, maxRetries = 3) {
  const attempt = (retriesLeft) => {
    return cy.request({ ...options, failOnStatusCode: false }).then((resp) => {
      if ([502, 503, 504].includes(resp.status) && retriesLeft > 0) {
        Cypress.log({
          name: 'requestWithRetry',
          message: `${contextLabel} returned ${resp.status} — retrying (${retriesLeft} left)`,
        });
        cy.wait(3000);
        return attempt(retriesLeft - 1);
      }
      assertSeedRequestOk(resp, contextLabel);
      return resp;
    });
  };
  return attempt(maxRetries);
}

// Logs in to AccountWise and resolves with a fresh bearer token.
// AccountWise issues short-lived JWTs (~12h) so each test run gets a new one.
export function loginToAccountWise() {
  return cy.request({
    method: 'POST',
    url: `${getAwIdentity()}/auth/login`,
    body: {
      username: Cypress.env('ACCOUNTWISE_USERNAME'),
      password: Cypress.env('ACCOUNTWISE_PASSWORD'),
    },
  }).then((resp) => {
    const token = resp.body?.accessToken;
    expect(token, 'AccountWise login must return an accessToken').to.exist;
    return token;
  });
}

// Resolves a valid { customerId, customerName, accountId, accountName } for the
// CURRENT AccountWise environment by scraping an existing record, instead of
// relying on hard-coded fixture UUIDs that are environment-specific. The
// invoice fixture's "Revenue" account (9b5d1162-…) exists on QA but NOT on
// Stage, where the invoice endpoint's journal-entry validation rejects it with
// "Invalid account(s) referenced in jeTransactions" (Stage invoices use the
// "Sale Of Goods" account b4ec5fcc-… instead). The accounts/customers list
// endpoints aren't exposed on the invoice service (all 404), so we read an
// existing record from the relevant list endpoint and reuse its ids.
//
// `kind` = 'invoice' (reads GET /v1/invoice) or 'saleOrder' (GET /v1/saleOrder).
// Returns null when no existing record is available (caller falls back to the
// fixture defaults / skips). Best-effort: tolerant request, never throws.
export function getValidAccountWiseRefs(awToken, kind = 'invoice') {
  const path = kind === 'saleOrder' ? '/v1/saleOrder' : '/v1/invoice';
  return cy.request({
    method: 'GET',
    url: `${getAwInvoice()}${path}`,
    headers: { Authorization: `Bearer ${awToken}` },
    failOnStatusCode: false,
    timeout: 60000,
  }).then((resp) => {
    if (resp.status < 200 || resp.status >= 300) return null;
    const d = resp.body?.data ?? resp.body;
    const list = Array.isArray(d) ? d : (d?.list ?? d?.rows ?? d?.items ?? d?.data ?? null);
    if (!Array.isArray(list) || !list.length) return null;
    // Prefer a record that has both a customer and a line item with an account.
    const rec = list.find((r) => r?.customer_id && (r?.items?.[0]?.account_id)) ?? list[0];
    const item0 = rec?.items?.[0] ?? {};
    if (!rec?.customer_id || !item0?.account_id) return null;
    return {
      customerId: rec.customer_id,
      customerName: rec.customer_name,
      accountId: item0.account_id,
      accountName: item0.account_name,
    };
  });
}

// Searches StockWise products the way the AccountWise New Invoice form
// populates its product picker. Walks the catalog and returns the first
// product that:
//   - is a pure product (no items, no variants — reservedQuantity on the
//     product row is the meaningful signal we assert against),
//   - has enough free stock (availableQuantity - reservedQuantity >= minReservable).
// Returns null if no qualifying product is found within `maxPages` pages.
// The caller (typically a before() hook) should check for null and call
// this.skip() — Cypress chains don't have .catch() so throwing would fail
// the hook outright instead of skipping cleanly.
// TOKEN: this helper only ever calls the STOCKWISE API, so it needs a
// StockWise (Keycloak) bearer — `cy.getAuthToken()` — NOT the AccountWise token
// from loginToAccountWise(). Both were interchangeable while the two apps shared
// the legacy identity server; since the Keycloak migration StockWise validates
// its own realm's tokens only, and an AccountWise token now returns
// 401 {"code":"UNAUTHORIZED"} here — which assertSeedRequestOk turns into a
// before-all failure that skips the whole spec. The parameter is named swToken
// so a mismatched argument is visible at the call site.
export function findStockWiseProductForInvoice(
  swToken,
  { minReservable = 1, searchTerm = '', maxPages = 5, pageSize = 50 } = {},
) {
  const searchSegment = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';

  const fetchPage = (page) => {
    return requestWithRetry({
      method: 'GET',
      url: `${getSwApi()}/products?page=${page}&page_size=${pageSize}${searchSegment}`,
      headers: { Authorization: `Bearer ${swToken}` },
      timeout: 60000,
    }, `GET /products?page=${page}`).then((resp) => {
      const list = resp.body?.data?.list ?? [];
      const totalPages = Number(resp.body?.data?.pagination?.pages ?? 0);

      const match = list.find((p) => {
        if (!p?.id) return false;
        if (p.hasItems) return false;
        if (p.hasVariants) return false;
        const available = Number(p.availableQuantity ?? 0);
        const reserved = Number(p.reservedQuantity ?? 0);
        return (available - reserved) >= minReservable;
      });

      if (match) return match;
      if (page >= maxPages || page >= totalPages) {
        Cypress.log({
          name: 'findStockWiseProductForInvoice',
          message: `No qualifying pure product (>= ${minReservable} unit(s) free) in the first ${page} page(s)${searchTerm ? ` of search="${searchTerm}"` : ''}. Returning null — caller should skip.`,
        });
        return null;
      }
      return fetchPage(page + 1);
    });
  };

  return fetchPage(1);
}

// Same purpose as findStockWiseProductForInvoice (and the same null-on-no-
// match contract — caller should this.skip() if null) but for products-
// with-items (serialized inventory, hasItems=true). Walking /products is
// impractical: in QA the catalog has thousands of pure products and
// serialized products are sparse, so a top-down scan from page 1 may not
// find one within a reasonable page budget. Instead we go through
// /incoming-items/defective-reports?status=Available, which by construction
// only surfaces serialized products that have at least one item in
// 'Available' status — exactly the reservable population we need. The
// response rows are full product records (same shape as /products list
// rows), so the returned object is drop-in compatible with buildInvoiceBody
// / buildSalesOrderBody and with getProductReservedQuantity. For items
// products, `availableQuantity` on the product row already counts only
// items with status='Available' — Reserved items are excluded — so the
// free-to-reserve check is just `availableQuantity >= minReservable`, no
// subtraction.
//
// To make sure the picked product can actually be reserved, we read its
// Available items, collect their distinct PO numbers, then probe
// /incoming-items/defective-reports?poNumber=<PO> to confirm the product
// is listed under at least one of those POs (this endpoint joins
// quantities with the items aggregation, so a missing quantities row means
// the product won't be listed). Only then is the product safe to use in a
// WO test.
// TOKEN: StockWise-only, same as findStockWiseProductForInvoice above — every
// request it makes goes to getSwApi(), so it takes a StockWise bearer, not the
// AccountWise one.
export function findStockWiseItemsProductForInvoice(
  swToken,
  { minReservable = 1, maxPages = 5, pageSize = 50 } = {},
) {
  // Verify a candidate has at least one Available item under a PO whose
  // (productId, poNumber) pair exists in the quantities table. Resolves
  // with the product if qualifying, null otherwise.
  const candidateHasReservablePO = (product) => {
    return requestWithRetry({
      method: 'GET',
      url: `${getSwApi()}/products/${product.id}/items?page=1&page_size=50`,
      headers: { Authorization: `Bearer ${swToken}` },
      timeout: 60000,
    }, `GET /products/${product.id}/items`).then((resp) => {
      const items = resp.body?.data?.list ?? resp.body?.data ?? [];
      const availablePOs = Array.from(
        new Set(items.filter((it) => it?.status === 'Available' && it?.poNumber).map((it) => it.poNumber)),
      );
      if (availablePOs.length === 0) return null;

      // Check each PO until we find one where the product is listed in the
      // PO-scoped defective-reports — that proves a quantities row exists.
      const probePO = (poIdx) => {
        if (poIdx >= availablePOs.length) return cy.wrap(null, { log: false });
        const po = availablePOs[poIdx];
        return requestWithRetry({
          method: 'GET',
          url: `${getSwApi()}/incoming-items/defective-reports?page=1&page_size=200&poNumber=${encodeURIComponent(po)}`,
          headers: { Authorization: `Bearer ${swToken}` },
          timeout: 60000,
        }, `GET /incoming-items/defective-reports?poNumber=${po}&page=1`).then((poResp) => {
          const poList = poResp.body?.data?.list ?? [];
          const totalPages = Number(poResp.body?.data?.pagination?.pages ?? 0);
          const matched = poList.some((p) => p?.id === product.id);
          if (matched) return product;
          // If the PO list has more than one page, the product might still
          // be listed further on. Cap at a few pages to keep the helper
          // bounded — most POs fit in the first page at page_size=200.
          return probeMorePages(po, 2, totalPages, product, () => probePO(poIdx + 1));
        });
      };

      const probeMorePages = (po, page, totalPages, product, onNotFound) => {
        if (page > totalPages || page > 5) return onNotFound();
        return requestWithRetry({
          method: 'GET',
          url: `${getSwApi()}/incoming-items/defective-reports?page=${page}&page_size=200&poNumber=${encodeURIComponent(po)}`,
          headers: { Authorization: `Bearer ${swToken}` },
          timeout: 60000,
        }, `GET /incoming-items/defective-reports?poNumber=${po}&page=${page}`).then((r) => {
          const list = r.body?.data?.list ?? [];
          if (list.some((p) => p?.id === product.id)) return product;
          return probeMorePages(po, page + 1, totalPages, product, onNotFound);
        });
      };

      return probePO(0);
    });
  };

  // Walks an array of candidates sequentially, returning the first that
  // qualifies. Sequential (not Promise.all) so we short-circuit and don't
  // fire unnecessary requests once we find one.
  const findFirstQualifying = (candidates, idx) => {
    if (idx >= candidates.length) return cy.wrap(null, { log: false });
    return candidateHasReservablePO(candidates[idx]).then((p) => {
      if (p) return p;
      return findFirstQualifying(candidates, idx + 1);
    });
  };

  const fetchPage = (page) => {
    return requestWithRetry({
      method: 'GET',
      url: `${getSwApi()}/incoming-items/defective-reports?page=${page}&page_size=${pageSize}&poNumber=allPO&status=Available`,
      headers: { Authorization: `Bearer ${swToken}` },
      timeout: 60000,
    }, `GET /incoming-items/defective-reports?status=Available&page=${page}`).then((resp) => {
      const list = resp.body?.data?.list ?? [];
      const totalPages = Number(resp.body?.data?.pagination?.pages ?? 0);

      const candidates = list.filter((p) => {
        if (!p?.id) return false;
        if (!p.hasItems) return false;
        if (p.hasVariants) return false;
        return Number(p.availableQuantity ?? 0) >= minReservable;
      });

      return findFirstQualifying(candidates, 0).then((match) => {
        if (match) return match;
        if (page >= maxPages || page >= totalPages) {
          Cypress.log({
            name: 'findStockWiseItemsProductForInvoice',
            message: `No qualifying items product with a reservable Available item under a quantities-backed PO in the first ${page} page(s). Returning null — caller should skip.`,
          });
          return null;
        }
        return fetchPage(page + 1);
      });
    });
  };

  return fetchPage(1);
}

// Builds a complete invoice body by deep-cloning the fixture template and
// substituting the discovered StockWise product into items[0] and a unique
// order_id. Pass overrides (e.g. { metadata: { work_order: false } }) to
// flip integration flags for negative tests later.
export function buildInvoiceBody({ product, overrides = {}, refs = null } = {}) {
  const body = JSON.parse(JSON.stringify(baseInvoiceBody));

  body.order_id = `CYP-${Date.now()}`;
  body.invoice_date = new Date().toISOString().slice(0, 10);

  body.items = [{
    ...body.items[0],
    item_id: String(product.id),
    description: product.name || body.items[0].description,
    item: product.name || body.items[0].item,
    custom_fields: {
      ...body.items[0].custom_fields,
      partnumber: product.partNumber || body.items[0].custom_fields.partnumber,
    },
  }];

  // Apply environment-valid customer + account ids when supplied (see
  // getValidAccountWiseRefs) so the fixture's hard-coded QA-only UUIDs don't
  // get rejected on other environments (e.g. Stage "Invalid account(s)").
  applyAccountWiseRefs(body, refs);

  return deepMerge(body, overrides);
}

// Overwrites customer + line-item account ids on an AccountWise body in place
// with environment-valid values. No-op when refs is null (keeps fixture values).
function applyAccountWiseRefs(body, refs) {
  if (!refs) return;
  if (refs.customerId) body.customer_id = refs.customerId;
  if (refs.customerName) body.customer_name = refs.customerName;
  if (Array.isArray(body.items)) {
    body.items = body.items.map((it) => ({
      ...it,
      ...(refs.accountId ? { account_id: refs.accountId } : {}),
      ...(refs.accountName ? { account_name: refs.accountName } : {}),
    }));
  }
}

// POSTs the invoice to AccountWise. Returns the parsed response data block
// (which includes invoice_number, id, total_amount, etc.).
export function createAccountWiseInvoice(awToken, body) {
  // Patch the body with environment-valid customer + account ids just before
  // POSTing (unless the caller already supplied them via buildInvoiceBody's
  // `refs`). The fixture's hard-coded "Revenue" account is QA-only; Stage's
  // invoice journal-entry validation requires the env's real account ("Sale
  // Of Goods"), else it 400s with "Invalid account(s) referenced in
  // jeTransactions". Best-effort: null refs → body unchanged.
  return getValidAccountWiseRefs(awToken, 'invoice').then((refs) => {
    applyAccountWiseRefs(body, refs);
    return cy.request({
      method: 'POST',
      url: `${getAwInvoice()}/v2/invoice`,
      headers: { Authorization: `Bearer ${awToken}` },
      body,
    }).then((resp) => {
      expect(resp.status, 'AccountWise invoice creation must return 2xx').to.be.within(200, 299);
      expect(resp.body?.success, 'AccountWise invoice response must be success:true').to.be.true;
      const data = resp.body?.data;
      expect(data?.invoice_number, 'AccountWise must return an invoice_number').to.exist;
      return data;
    });
  });
}

// Builds a complete sales order body. Mirrors buildInvoiceBody but uses the
// sales-order fixture template and stamps sale_order_date instead of
// invoice_date.
export function buildSalesOrderBody({ product, overrides = {}, refs = null } = {}) {
  const body = JSON.parse(JSON.stringify(baseSalesOrderBody));

  body.order_id = `CYP-SO-${Date.now()}`;
  body.sale_order_date = new Date().toISOString().slice(0, 10);

  body.items = [{
    ...body.items[0],
    item_id: String(product.id),
    description: product.name || body.items[0].description,
    item: product.name || body.items[0].item,
    custom_fields: {
      ...body.items[0].custom_fields,
      partnumber: product.partNumber || body.items[0].custom_fields.partnumber,
    },
  }];

  // Apply environment-valid customer + account ids when supplied.
  applyAccountWiseRefs(body, refs);

  return deepMerge(body, overrides);
}

// POSTs the sales order to AccountWise. Returns the parsed response data
// block. Note: unlike the invoice flow, the sales-order response carries
// metadata.work_order_number directly — the WO is created synchronously
// during this POST, no polling required. The work_order_number is only
// asserted to exist when the request asked for one (metadata.work_order=true);
// negative tests pass work_order=false and verify the field is absent.
export function createAccountWiseSalesOrder(awToken, body) {
  // Patch with environment-valid customer + account ids before POSTing (see
  // createAccountWiseInvoice). Best-effort: null refs → body unchanged.
  return getValidAccountWiseRefs(awToken, 'saleOrder').then((refs) => {
    applyAccountWiseRefs(body, refs);
    return cy.request({
      method: 'POST',
      url: `${getAwInvoice()}/v1/saleOrder`,
      headers: { Authorization: `Bearer ${awToken}` },
      body,
    }).then((resp) => {
      expect(resp.status, 'AccountWise sales order creation must return 2xx').to.be.within(200, 299);
      expect(resp.body?.success, 'AccountWise sales order response must be success:true').to.be.true;
      const data = resp.body?.data;
      expect(data?.sale_order_number, 'AccountWise must return a sale_order_number').to.exist;
      if (body?.metadata?.work_order === true) {
        expect(data?.metadata?.work_order_number, 'AccountWise must return metadata.work_order_number when work_order toggle is on').to.exist;
      }
      return data;
    });
  });
}

// Approves an AccountWise sales order by its uuid (the `id` field returned
// by createAccountWiseSalesOrder). On the AccountWise side this flips the
// sales order from Pending → Approved; on the StockWise side it transitions
// the linked work order from Draft → Open. Returns the parsed response data.
export function approveAccountWiseSalesOrder(awToken, salesOrderId) {
  return cy.request({
    method: 'POST',
    url: `${getAwInvoice()}/v1/saleOrder/approveSaleOrder`,
    headers: { Authorization: `Bearer ${awToken}` },
    body: { id: salesOrderId },
  }).then((resp) => {
    expect(resp.status, 'AccountWise sales order approval must return 2xx').to.be.within(200, 299);
    expect(resp.body?.success, 'AccountWise approval response must be success:true').to.be.true;
    const data = resp.body?.data;
    expect(data?.status, 'Approved sales order must have status="Approved"').to.equal('Approved');
    return data;
  });
}

// Fetches a StockWise WO by its work order number and resolves with the WO
// row. The sales-order POST returns work_order_number synchronously, so
// unlike the invoice flow there is no need to poll — but we still allow a
// short retry window to absorb eventual-consistency lag if it ever exists.
export function getStockWiseWorkOrderByNumber(swToken, workOrderNumber, { timeout = 10000, interval = 1000 } = {}) {
  const deadline = Date.now() + timeout;

  const attempt = () => {
    return cy.request({
      method: 'GET',
      url: `${getSwApi()}/work-orders?page=1&pageSize=10&search=${encodeURIComponent(workOrderNumber)}`,
      headers: { Authorization: `Bearer ${swToken}` },
      failOnStatusCode: false,
    }).then((resp) => {
      const wo = (resp.body?.data?.list ?? []).find(
        (w) => w?.workOrderNumber === workOrderNumber,
      );
      if (wo) return wo;
      if (Date.now() > deadline) {
        throw new Error(`StockWise work order ${workOrderNumber} did not appear within ${timeout}ms`);
      }
      return cy.wait(interval, { log: false }).then(attempt);
    });
  };

  return attempt();
}

// Asserts that no StockWise work order is linked to the given AccountWise
// identifier (saleOrderNumber or invoiceNumber). Used by negative tests
// that create an AW record with metadata.work_order=false to prove the
// toggle actually gates StockWise WO creation.
//
// We wait `settleMs` first so a slow WO creation can't false-pass: if the
// search returns empty immediately, but the WO would have shown up 1 second
// later, we'd report a false negative. The wait is small but bounded.
export function assertNoStockWiseWorkOrderForIdentifier(swToken, identifier, fieldName, { settleMs = 3000 } = {}) {
  expect(['saleOrderNumber', 'invoiceNumber']).to.include(fieldName, 'fieldName must be saleOrderNumber or invoiceNumber');

  return cy.wait(settleMs, { log: false }).then(() => {
    return cy.request({
      method: 'GET',
      url: `${getSwApi()}/work-orders?page=1&pageSize=10&search=${encodeURIComponent(identifier)}`,
      headers: { Authorization: `Bearer ${swToken}` },
      failOnStatusCode: false,
    });
  }).then((resp) => {
    const list = resp.body?.data?.list ?? [];
    const match = list.find((w) => w?.[fieldName] === identifier);
    expect(
      match,
      `Expected no StockWise work order for ${fieldName}="${identifier}" (toggle was off), but found WO ${match?.workOrderNumber}`,
    ).to.be.undefined;
  });
}

// Reads the current reservedQuantity for a given StockWise product.
//
// Uses the id-direct endpoint GET /products/:id rather than the free-text
// search endpoint. The earlier search-based implementation flaked on
// partNumbers containing non-search-safe characters (e.g. NBSP / U+00A0
// from category attributes like "Dell Inc. "): encodeURIComponent
// turned the NBSP into %20 (regular space), the Backend's search index
// only matches the original NBSP form, the result list came back empty,
// and the find() returned undefined -- failing TC82/TC87. The id-direct
// path bypasses search entirely; it always finds the product (or 404s
// cleanly) and returns reservedQuantity at data.product.reservedQuantity.
export function getProductReservedQuantity(swToken, product) {
  expect(product?.id, 'Product must have an id to look up reservedQuantity').to.exist;

  return cy.request({
    method: 'GET',
    url: `${getSwApi()}/products/${product.id}`,
    headers: { Authorization: `Bearer ${swToken}` },
    timeout: 60000,
    failOnStatusCode: false,
  }).then((resp) => {
    assertSeedRequestOk(resp, `GET /products/${product.id}`);
    const fresh = resp.body?.data?.product;
    expect(fresh, `StockWise product id ${product.id} must be readable via GET /products/${product.id}`).to.exist;
    return Number(fresh.reservedQuantity ?? 0);
  });
}

// Polls StockWise's work-order list filtered by invoice number until a
// matching WO appears, or fails after `timeout` ms. AccountWise → StockWise
// WO creation is async on AccountWise's side, so we cannot rely on the
// invoice POST returning before the WO row exists.
export function waitForStockWiseWorkOrderByInvoice(swToken, invoiceNumber, { timeout = 30000, interval = 1500 } = {}) {
  const deadline = Date.now() + timeout;

  const attempt = () => {
    return cy.request({
      method: 'GET',
      url: `${getSwApi()}/work-orders?page=1&pageSize=10&search=${encodeURIComponent(invoiceNumber)}`,
      headers: { Authorization: `Bearer ${swToken}` },
      failOnStatusCode: false,
    }).then((resp) => {
      const wo = (resp.body?.data?.list ?? []).find(
        (w) => w?.invoiceNumber === invoiceNumber,
      );
      if (wo) return wo;
      if (Date.now() > deadline) {
        throw new Error(`StockWise work order for invoice ${invoiceNumber} did not appear within ${timeout}ms`);
      }
      return cy.wait(interval, { log: false }).then(attempt);
    });
  };

  return attempt();
}

// Shallow-recursive merge so callers can override nested fields like
// `{ metadata: { work_order: false } }` without clobbering siblings.
function deepMerge(target, source) {
  if (source === null || typeof source !== 'object') return source;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && target?.[key] && typeof target[key] === 'object') {
      out[key] = deepMerge(target[key], sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}
