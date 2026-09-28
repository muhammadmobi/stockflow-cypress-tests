/**
 * Dashboard API Tests (SW-DASH-API-TC01..TC32)
 * =============================================================================
 * Routes under test:
 *
 *   GET /incoming-items/reports            @Public()  — dashboard status counts
 *   GET /incoming-items/trends             @Public()  — stock movement trend data
 *   GET /reports/inventory-value-report    AuthGuard  — total inventory value
 *   GET /reports/inventory-kpi-summary     AuthGuard  — KPI value + products
 *   GET /reports/monthly-kpi-summary       AuthGuard  — 12-month sparkline data
 */

import dashboardData from '../../fixtures/dashboardData.json';

describe('Dashboard API Tests', () => {
  let authToken;
  const baseUrl = () => Cypress.env('API_BASE_URL');

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  before(() => {
    cy.login().then((token) => {
      authToken = token;
      expect(authToken, 'auth token must be present').to.exist;
    });
  });

  // ── /incoming-items/reports ─────────────────────────────────────────────────

  describe('GET /incoming-items/reports', () => {
    let response;

    before(() => {
      cy.request(`${baseUrl()}${dashboardData.endpoints.reports}`).then((res) => {
        response = res;
      });
    });

    it('SW-DASH-API-TC01: Verify that the response status is 200', () => {
      expect(response.status).to.equal(200);
    });

    it('SW-DASH-API-TC02: Verify that the response success flag is true', () => {
      expect(response.body.success).to.be.true;
    });

    it('SW-DASH-API-TC03: Verify that the Expected Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Expected)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC04: Verify that the Available Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Available)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC05: Verify that the Received Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Received)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC06: Verify that the Reserved Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Reserved)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC07: Verify that the Incoming Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Incoming)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC08: Verify that the Damaged Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Damaged)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC09: Verify that the Disputed Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Disputed)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC10: Verify that the Missing Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Missing)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC11: Verify that the Sold Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.Sold)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC12: Verify that the Stocked Out Items count is present and numeric', () => {
      expect(Number(response.body.data.reports.StockedOut)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC13: Verify that the Total Products count is present and numeric', () => {
      expect(Number(response.body.data.totalProductQuantities)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC14: Verify that the Total Purchase Orders count is present and numeric', () => {
      expect(Number(response.body.data.totalPOs)).to.be.a('number').and.not.be.NaN;
    });

    it('SW-DASH-API-TC15: Verify that the Total Work Orders count is present and numeric', () => {
      expect(Number(response.body.data.totalWorkOrders)).to.be.a('number').and.not.be.NaN;
    });
  });

  // ── /reports/inventory-value-report ────────────────────────────────────────

  describe('GET /reports/inventory-value-report', () => {
    let response;

    before(() => {
      cy.request({
        method: 'GET',
        url: `${baseUrl()}${dashboardData.endpoints.inventoryValue}`,
        headers: headers(),
      }).then((res) => {
        response = res;
      });
    });

    it('SW-DASH-API-TC16: Verify that the response status is 200', () => {
      expect(response.status).to.equal(200);
    });

    it('SW-DASH-API-TC17: Verify that the response success flag is true', () => {
      expect(response.body.success).to.be.true;
    });

    it('SW-DASH-API-TC18: Verify that the Total Inventory Value is present and numeric', () => {
      expect(Number(response.body.data.summary.totalInventoryValue)).to.be.a('number').and.not.be.NaN;
    });
  });

  // ── /incoming-items/trends — @Public() contract + BVA on days ──────────────

  describe('GET /incoming-items/trends', () => {
    // @Public() contract: no Authorization header so a guard regression is caught
    const publicGet = (days) =>
      cy.request({
        method: 'GET',
        url: `${baseUrl()}/incoming-items/trends${days !== undefined ? `?days=${days}` : ''}`,
        failOnStatusCode: false,
        timeout: 30000,
      });

    it('SW-DASH-API-TC19: Verify that the trends endpoint is accessible without authentication', () => {
      // @Public() contract: endpoint must be accessible without Authorization header
      publicGet().then((res) => {
        expect(res.status, 'public endpoint must not require auth').to.equal(200);
        expect(res.body.success).to.be.true;
        expect(res.body.data, 'data must be an array').to.be.an('array');
      });
    });

    it('SW-DASH-API-TC20: Verify that requesting trends for 1 day returns exactly 1 data point', () => {
      // BVA: lower boundary — minimum meaningful value
      publicGet(dashboardData.trendsEpBva.bvaLowerValid).then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
        expect(res.body.data).to.be.an('array').with.length(1);
      });
    });

    it('SW-DASH-API-TC21: Verify that omitting the days parameter returns the default 7 data points', () => {
      // EP: valid partition — no param → service default 7
      publicGet().then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
        expect(res.body.data).to.be.an('array').with.length(7);
      });
    });

    it('SW-DASH-API-TC22: Verify that requesting trends for 90 days returns exactly 90 data points', () => {
      // BVA: upper boundary — largest value the Dashboard UI generates (getDateRange quarter)
      publicGet(dashboardData.trendsEpBva.bvaUpperValid).then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
        expect(res.body.data).to.be.an('array').with.length(90);
      });
    });

    it('SW-DASH-API-TC23: Verify that each trend entry contains the required day, date, received, stockedOut, incoming and avai fields', () => {
      // Use case: response shape contract — all fields consumed by StockMovementCard must be present
      publicGet(dashboardData.trendsEpBva.bvaLowerValid).then((res) => {
        expect(res.status).to.equal(200);
        const point = res.body.data[0];
        expect(point).to.have.property('day');
        expect(point).to.have.property('date');
        expect(Number(point.received), 'received must be numeric').to.be.a('number').and.not.be.NaN;
        expect(Number(point.stockedOut), 'stockedOut must be numeric').to.be.a('number').and.not.be.NaN;
        expect(Number(point.incoming), 'incoming must be numeric').to.be.a('number').and.not.be.NaN;
        expect(Number(point.available), 'available must be numeric').to.be.a('number').and.not.be.NaN;
      });
    });
  });

  // ── /reports/inventory-kpi-summary — Decision Table on startDate × endDate ──

  describe('GET /reports/inventory-kpi-summary', () => {
    const get = (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return cy.request({
        method: 'GET',
        url: `${baseUrl()}/reports/inventory-kpi-summary${qs ? `?${qs}` : ''}`,
        headers: headers(),
        failOnStatusCode: false,
        timeout: 60000,
      });
    };

    it('SW-DASH-API-TC24: Verify that the inventory KPI summary endpoint returns 401 when called without authentication', () => {
      // AuthGuard contract: route is protected — no token must return 401
      cy.request({
        method: 'GET',
        url: `${baseUrl()}/reports/inventory-kpi-summary`,
        headers: { 'Content-Type': 'application/json' },
        failOnStatusCode: false,
        timeout: 30000,
      }).then((res) => {
        expect(res.status, 'AuthGuard must block unauthenticated request').to.equal(401);
      });
    });

    it('SW-DASH-API-TC25: Verify that the inventory KPI summary returns totalInventoryValue and totalProducts when no date filters are applied', () => {
      // Decision table C1: startDate=absent, endDate=absent → current live snapshot
      get(dashboardData.kpiDecisionTable.c1Neither).then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
        expect(Number(res.body.data.totalInventoryValue), 'totalInventoryValue must be numeric')
          .to.be.a('number').and.not.be.NaN;
        expect(Number(res.body.data.totalProducts), 'totalProducts must be numeric')
          .to.be.a('number').and.not.be.NaN;
      });
    });

    it('SW-DASH-API-TC26: Verify that the inventory KPI summary returns historical values when both startDate and endDate are provided', () => {
      // Decision table C2: startDate=present, endDate=present → historical value calculation
      get(dashboardData.kpiDecisionTable.c2Both).then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
        expect(Number(res.body.data.totalInventoryValue), 'totalInventoryValue must be numeric')
          .to.be.a('number').and.not.be.NaN;
      });
    });

    it('SW-DASH-API-TC27: Verify that providing only a startDate returns an error due to the both-or-neither date rule', () => {
      // Decision table C3: service enforces "both or neither" — one date throws BadRequestException
      get(dashboardData.kpiDecisionTable.c3StartOnly).then((res) => {
        expect(res.status, 'one date only must not return 2xx').to.be.at.least(400);
      });
    });

    it('SW-DASH-API-TC28: Verify that providing only an endDate returns an error due to the both-or-neither date rule', () => {
      // Decision table C4: same rejection as C3
      get(dashboardData.kpiDecisionTable.c4EndOnly).then((res) => {
        expect(res.status, 'one date only must not return 2xx').to.be.at.least(400);
      });
    });
  });

  // ── /reports/monthly-kpi-summary ──────────────────────────────────────────

  describe('GET /reports/monthly-kpi-summary', () => {
    const get = (opts = {}) =>
      cy.request({
        method: 'GET',
        url: `${baseUrl()}/reports/monthly-kpi-summary`,
        headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
        failOnStatusCode: false,
        timeout: 60000,
      });

    it('SW-DASH-API-TC29: Verify that the monthly KPI summary endpoint returns 401 when called without authentication', () => {
      // AuthGuard contract: route is protected — no token must return 401
      get({ noAuth: true }).then((res) => {
        expect(res.status, 'AuthGuard must block unauthenticated request').to.equal(401);
      });
    });

    it('SW-DASH-API-TC30: Verify that the monthly KPI summary returns a successful response for an authenticated request', () => {
      // EP: valid partition — authenticated request with no params
      get().then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
      });
    });

    it('SW-DASH-API-TC31: Verify that the monthly KPI summary contains all four KPI arrays with 12 monthly entries each', () => {
      // Use case: response shape — all 4 KPI sparkline arrays must be present with 12 monthly entries
      get().then((res) => {
        expect(res.status).to.equal(200);
        const d = res.body.data;
        ['inventoryValue', 'products', 'purchaseOrders', 'workOrders'].forEach((key) => {
          expect(d, `${key} must be present`).to.have.property(key).that.is.an('array');
          expect(d[key], `${key} must have 12 monthly entries`).to.have.length(12);
        });
      });
    });

    it('SW-DASH-API-TC32: Verify that each monthly KPI entry contains a month string and a numeric value', () => {
      // Use case: entry shape — frontend KpiTopCard sparkline reads .month and .value
      get().then((res) => {
        expect(res.status).to.equal(200);
        const entry = res.body.data.inventoryValue[0];
        expect(entry).to.have.property('month').that.is.a('string');
        expect(Number(entry.value), 'value must be numeric').to.be.a('number').and.not.be.NaN;
      });
    });
  });
});
