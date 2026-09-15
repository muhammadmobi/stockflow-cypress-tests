import data from '../fixtures/stockoutBTOData.json';

class StockoutBTOApiHelper {
  constructor() {
    this.data = data;
    this.baseUrl = Cypress.env('API_BASE_URL');
    // Populated on first fetch per status; subsequent calls pop from the array
    // rather than re-issuing API requests (avoids N+1 across the suite).
    this._serialCache = new Map();
  }

  // ── Request builders ────────────────────────────────────────────────────────

  // Builds a stockout request with the admin auth token.
  stockout(serialNumber, reason, status) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.endpoint}`,
      headers: {
        Authorization: `Bearer ${Cypress.env('adminToken')}`,
        'Content-Type': 'application/json',
      },
      body: { serialNumber, reason, status },
      failOnStatusCode: false,
    });
  }

  // Builds a stockout request with no Authorization header (for 401 tests).
  stockoutUnauthenticated(serialNumber, reason, status) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.endpoint}`,
      body: { serialNumber, reason, status },
      failOnStatusCode: false,
    });
  }

  // Builds a stockout request with a supplied token.
  stockoutWithToken(token, serialNumber, reason, status) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.endpoint}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: { serialNumber, reason, status },
      failOnStatusCode: false,
    });
  }

  // Builds a stockout request using the worker token.
  stockoutWithWorkerToken(serialNumber, reason, status) {
    return this.stockoutWithToken(Cypress.env('workerToken'), serialNumber, reason, status);
  }

  // Sends a stockout request with a fully custom body.
  // Use this for validation tests where a field is missing or has an invalid value.
  stockoutWithBody(body) {
    return cy.request({
      method: 'POST',
      url: `${this.baseUrl}${this.data.endpoint}`,
      headers: {
        Authorization: `Bearer ${Cypress.env('adminToken')}`,
        'Content-Type': 'application/json',
      },
      body,
      failOnStatusCode: false,
    });
  }

  // Fetches the first serial number of an item with the given status by:
  //   1. Check _serialCache — if serials are cached for this status, shift and
  //      return the next one immediately (no API calls).
  //   2. GET /products?status={status}&productStatus=active  → get all product IDs
  //      that may contain items with the requested status.
  //   3. Iterate product IDs until one has items. Cache ALL returned serial
  //      numbers for that status so future calls are served from the cache.
  //   4. If no serialized item exists in the environment for the requested
  //      status (e.g. Damaged/Disputed/Missing aggregates tracked only on pure
  //      products), resolve to `null` so the caller can `this.skip()` — this
  //      matches the project convention of skipping when QA has no suitable
  //      seed data, rather than failing with a confusing setup error.
  fetchSerialNumberByStatus(status) {
    const cached = this._serialCache.get(status);
    if (cached && cached.length > 0) {
      return cy.wrap(cached.shift());
    }

    return cy
      .request({
        method: 'GET',
        url: `${this.baseUrl}${this.data.productsEndpoint}`,
        qs: { page: 1, page_size: 75, status, productStatus: 'active' },
        headers: { Authorization: `Bearer ${Cypress.env('adminToken')}` },
        failOnStatusCode: true,
        timeout: 60000,
      })
      .then((res) => {
        const products = res.body?.data?.list ?? [];
        if (!Array.isArray(products) || products.length === 0) {
          return cy.wrap(null);
        }

        const productIds = products.map((p) => p.id);

        const tryNext = (index) => {
          if (index >= productIds.length) {
            return cy.wrap(null);
          }

          return cy
            .request({
              method: 'GET',
              url: `${this.baseUrl}${this.data.productsEndpoint}/${productIds[index]}/items`,
              qs: { page: 1, page_size: 75, status },
              headers: { Authorization: `Bearer ${Cypress.env('adminToken')}` },
              failOnStatusCode: false,
              timeout: 60000,
            })
            .then((itemsRes) => {
              const items = itemsRes.body?.data?.list ?? [];
              const serials = items
                .map((item) => item.serialNumber)
                .filter((s) => typeof s === 'string' && s.length > 0);
              if (serials.length > 0) {
                // Cache every serial from this product — subsequent tests for the
                // same status (e.g. three "available" success tests) each pop a
                // distinct serial number without issuing any further API requests.
                this._serialCache.set(status, serials);
                return cy.wrap(this._serialCache.get(status).shift());
              }
              return tryNext(index + 1);
            });
        };

        return tryNext(0);
      });
  }
}

export default StockoutBTOApiHelper;
