/**
 * Stock Out API - Duplicate Prevention Tests
 * ---------------------------------------------
 * Mirrors UI suite: cypress/e2e/11-StockOutTests.cy.js (duplicate path).
 *
 * The spec deliberately avoids hard-coded serials from Excel fixtures
 * (which drift as inventory churns on shared QA). Instead it:
 *   1. Authenticates against the identity server.
 *   2. Fetches a live Available serialized item via
 *      GET /products?status=Available&productStatus=active → pick product →
 *      GET /products/:id/items?status=Available → pick first serial.
 *   3. Stocks it out with reason "stockout from bto".
 *   4. Re-submits the same serial to exercise duplicate prevention.
 *   5. after() restores the serial via /products/restock-by-serial-number
 *      so the QA environment is re-runnable.
 *
 * If no Available serialized item exists in the environment this spec
 * skips (matching the rest of the API suite's skip convention).
 */

describe('Stock Out API - Duplicate Prevention Tests', () => {
  let authToken;
  let baseUrl;
  let stockOutData;
  let serialNumber;
  let stockedOut = false;

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const fetchAvailableSerial = () =>
    cy
      .request({
        method: 'GET',
        url: `${baseUrl}/products`,
        qs: { page: 1, page_size: 75, status: 'Available', productStatus: 'active' },
        headers: headers(),
        failOnStatusCode: true,
        timeout: 60000,
      })
      .then((res) => {
        const products = res.body?.data?.list ?? [];
        if (products.length === 0) return cy.wrap(null);
        const ids = products.map((p) => p.id);

        const tryNext = (i) => {
          if (i >= ids.length) return cy.wrap(null);
          return cy
            .request({
              method: 'GET',
              url: `${baseUrl}/products/${ids[i]}/items`,
              qs: { page: 1, page_size: 75, status: 'Available' },
              headers: headers(),
              failOnStatusCode: false,
              timeout: 60000,
            })
            .then((itemsRes) => {
              const items = itemsRes.body?.data?.list ?? [];
              const serial = items
                .map((it) => it.serialNumber)
                .find((s) => typeof s === 'string' && s.length > 0);
              if (serial) return cy.wrap(serial);
              return tryNext(i + 1);
            });
        };

        return tryNext(0);
      });

  const stockout = (serial) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/products/stockout-by-serial-number`,
      headers: headers(),
      failOnStatusCode: false,
      body: {
        serialNumber: serial,
        reason: stockOutData.reasons.stockoutFromBTO.reason,
        description: stockOutData.reasons.stockoutFromBTO.description,
      },
    });

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    cy.fixture('stockOutTestsData').then((data) => {
      stockOutData = data;
    });
    cy.login().then((token) => {
      authToken = token;
    });
    cy.then(() => {
      fetchAvailableSerial().then((s) => {
        serialNumber = s;
      });
    });
  });

  after(() => {
    // Restore the item so the suite is re-runnable.
    if (serialNumber && stockedOut) {
      cy.request({
        method: 'POST',
        url: `${baseUrl}/products/restock-by-serial-number`,
        headers: headers(),
        failOnStatusCode: false,
        body: { serialNumber },
      });
    }
  });

  it('should successfully stock out an Available item via API with reason "stockout from bto"', function () {
    if (!serialNumber) {
      cy.log('No Available serialized item found — skipping.');
      this.skip();
    }
    stockout(serialNumber).then((response) => {
      expect(response.body.success, 'envelope success flag').to.equal(true);
      expect(response.body.statusCode).to.equal(200);
      stockedOut = true;
    });
  });

  it('should prevent duplicate stock out for the same serial number via API', function () {
    if (!serialNumber || !stockedOut) {
      cy.log('Prerequisite stockout did not run — skipping.');
      this.skip();
    }
    stockout(serialNumber).then((response) => {
      const text = JSON.stringify(response.body).toLowerCase();
      expect(text).to.satisfy((t) => t.includes('already stocked out'));
      expect(response.body.statusCode).to.equal(400);
    });
  });
});
