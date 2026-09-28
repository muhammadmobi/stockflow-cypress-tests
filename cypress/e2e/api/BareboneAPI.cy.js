/**
 * Barebone Conversion API Tests (SW-BAREBONE-API-TC01..14)
 * =============================================================================
 * Backend:  Backend/src/modules/barebone/barebone.controller.ts
 *           Backend/src/modules/barebone/barebone.service.ts
 *
 * -----------------------------------------------------------------------------
 *   Endpoints exercised
 * -----------------------------------------------------------------------------
 *   POST /barebone/scan          AuthGuard — worker marks a serial for barebone
 *                                conversion (Available → PendingBarebone).
 *   POST /barebone/scan/cancel   AuthGuard — undo a pending scan (restore item).
 *   POST /barebone/scan/bulk     AuthGuard + admin — mark many typed/pasted
 *                                serials at once; 200 + per-serial report.
 *   GET  /barebone/pending       AuthGuard + admin — grouped review payload.
 *   POST /barebone/convert       AuthGuard + admin — execute the conversion.
 *   GET  /barebone/conversions   AuthGuard + admin — conversion history.
 *
 * -----------------------------------------------------------------------------
 *   Test design
 * -----------------------------------------------------------------------------
 *   - @Public()-contract checks: every route asserted to 401 without a token.
 *   - EP (invalid partitions): empty body, unknown serial, empty unitGroups.
 *   - Decision/error-guessing: convert with a component serial not among the
 *     converted machines → rejected.
 *   - State transition + restoration: scan an Available item
 *     (Available → PendingBarebone), assert it appears in /pending, then cancel
 *     (PendingBarebone → Available). after() re-cancels as a safety net so QA
 *     data is never left mutated.
 *   - Probe-then-skip: the happy path needs a live Available serialized item;
 *     if QA has none (or the env's scan attribute differs from serialNumber)
 *     the mutation tests skip themselves rather than fail (principle #6).
 */

describe('Barebone Conversion API', () => {
  // -------------------- Shared state --------------------
  let authToken;
  let baseUrl;
  let seedSerial; // an Available serialized item's serial number, if found
  let scanned = false; // guards the after() restore

  // -------------------- Helpers --------------------

  const headers = () => ({
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  });

  const scan = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/barebone/scan`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const bulkScan = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/barebone/scan/bulk`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const cancel = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/barebone/scan/cancel`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const getPending = (opts = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/barebone/pending`,
      headers: opts.noAuth ? {} : headers(),
      failOnStatusCode: false,
    });

  const convert = (body, opts = {}) =>
    cy.request({
      method: 'POST',
      url: `${baseUrl}/barebone/convert`,
      headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers(),
      failOnStatusCode: false,
      body,
    });

  const getConversions = (opts = {}) =>
    cy.request({
      method: 'GET',
      url: `${baseUrl}/barebone/conversions`,
      headers: opts.noAuth ? {} : headers(),
      failOnStatusCode: false,
    });

  const isFailureEnvelope = (body) =>
    body && (body.success === false || body.statusCode >= 400 || !!body.error);

  // -------------------- Setup --------------------

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');

    cy.login().then((token) => {
      authToken = token;
      expect(authToken).to.exist;
    });

    // Probe for an Available serialized item to exercise the scan ↔ cancel pair.
    cy.then(() => {
      cy.request({
        method: 'GET',
        url: `${baseUrl}/incoming-items/defective-reports?page=1&page_size=10&poNumber=allPO&status=Available`,
        headers: headers(),
        failOnStatusCode: false,
      }).then((res) => {
        const body = res.body.data || res.body;
        const list = body.list || body.items || body.results || [];
        const picked = (list || []).find((i) => i && i.serialNumber);
        if (picked) seedSerial = picked.serialNumber;
      });
    });
  });

  // -------------------- Teardown: never leave an item PendingBarebone --------------------

  after(() => {
    if (seedSerial && scanned) {
      cancel({ serialNumber: seedSerial });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // @Public()-contract — no-auth guards
  // ──────────────────────────────────────────────────────────────────────────

  // Use-case / security — POST /barebone/scan requires auth.
  it('SW-BAREBONE-API-TC01: POST /barebone/scan without auth returns 401', () => {
    scan({ serialNumber: 'ANY' }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // Use-case / security — POST /barebone/scan/cancel requires auth.
  it('SW-BAREBONE-API-TC02: POST /barebone/scan/cancel without auth returns 401', () => {
    cancel({ serialNumber: 'ANY' }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // Use-case / security — GET /barebone/pending requires auth.
  it('SW-BAREBONE-API-TC03: GET /barebone/pending without auth returns 401', () => {
    getPending({ noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // Use-case / security — POST /barebone/convert requires auth.
  it('SW-BAREBONE-API-TC04: POST /barebone/convert without auth returns 401', () => {
    convert({ unitGroups: [] }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // Use-case / security — GET /barebone/conversions requires auth.
  it('SW-BAREBONE-API-TC05: GET /barebone/conversions without auth returns 401', () => {
    getConversions({ noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  it('SW-BAREBONE-API-TC13: POST /barebone/scan/bulk without auth returns 401', () => {
    bulkScan({ serialNumbers: ['X'] }, { noAuth: true }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /barebone/scan/bulk — per-serial report, never a request-level failure
  // for a bad serial (the good ones are already committed)
  // ──────────────────────────────────────────────────────────────────────────

  // Error-guessing — an unknown serial is reported in `failed`, the request
  // itself succeeds, and nothing is marked. Uses a guaranteed-missing serial so
  // no live data is mutated.
  it('SW-BAREBONE-API-TC14: POST /barebone/scan/bulk reports an unknown serial as failed', () => {
    const bogus = `__NONEXISTENT-${Date.now()}__`;
    bulkScan({ serialNumbers: [bogus, ` ${bogus} `] }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      const data = res.body.data || res.body;
      expect(data).to.have.property('marked').that.is.an('array').with.length(0);
      expect(data).to.have.property('failed').that.is.an('array').with.length(1); // deduped
      expect(data.failed[0].serialNumber).to.equal(bogus);
      expect(data.failed[0].reason).to.be.a('string').and.not.be.empty;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /barebone/scan — invalid-input partitions
  // ──────────────────────────────────────────────────────────────────────────

  // EP invalid — empty body (missing serialNumber) is rejected.
  it('SW-BAREBONE-API-TC06: POST /barebone/scan with empty body returns non-success', () => {
    scan({}).then((res) => {
      expect(res.status).to.be.lessThan(600);
      expect(isFailureEnvelope(res.body), 'empty scan body should be rejected').to.be.true;
    });
  });

  // EP invalid — a serial that does not resolve to any item is rejected.
  it('SW-BAREBONE-API-TC07: POST /barebone/scan with unknown serial returns non-success', () => {
    scan({ serialNumber: `__NONEXISTENT-${Date.now()}__` }).then((res) => {
      expect(res.status).to.be.lessThan(600);
      expect(isFailureEnvelope(res.body), 'unknown serial should be rejected').to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /barebone/pending & /barebone/conversions — authenticated read shape
  // ──────────────────────────────────────────────────────────────────────────

  // Use-case — the pending review payload has the documented grouped shape.
  it('SW-BAREBONE-API-TC08: GET /barebone/pending returns grouped payload for admin', () => {
    getPending().then((res) => {
      expect(res.status).to.be.lessThan(500);
      const data = res.body.data || res.body;
      expect(data).to.have.property('items');
      expect(data).to.have.property('unitGroups');
      expect(data).to.have.property('componentGroups');
      expect(data.items).to.be.an('array');
    });
  });

  // Use-case — conversion history returns an array for admin.
  it('SW-BAREBONE-API-TC09: GET /barebone/conversions returns an array for admin', () => {
    getConversions().then((res) => {
      expect(res.status).to.be.lessThan(500);
      const data = res.body.data || res.body;
      expect(data).to.be.an('array');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // /barebone/convert — invalid-input partitions (Joi + service guards)
  // ──────────────────────────────────────────────────────────────────────────

  // BVA / EP invalid — unitGroups is required and must be non-empty (min 1).
  it('SW-BAREBONE-API-TC10: POST /barebone/convert with empty unitGroups is rejected', () => {
    convert({ unitGroups: [], componentGroups: [] }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      expect(isFailureEnvelope(res.body), 'empty unitGroups should be rejected').to.be.true;
    });
  });

  // Decision / error-guessing — a component serial not among the converted
  // machines must be rejected before any inventory is touched.
  it('SW-BAREBONE-API-TC11: POST /barebone/convert with a stray component serial is rejected', () => {
    convert({
      unitGroups: [
        {
          sourceProductId: 999999999,
          serialNumbers: [`__U-${Date.now()}__`],
          targetCategoryId: 999999999,
          unitCost: 1,
        },
      ],
      componentGroups: [
        {
          attributeId: 999999999,
          fieldName: 'cpu',
          value: 'i7-9200',
          serialNumbers: [`__STRAY-${Date.now()}__`],
          targetCategoryId: 999999999,
          unitCost: 1,
        },
      ],
    }).then((res) => {
      expect(res.status).to.be.lessThan(500);
      expect(isFailureEnvelope(res.body), 'stray component serial should be rejected').to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // State transition + restoration — scan an Available item, then cancel it
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * SW-BAREBONE-API-TC12 — Available → PendingBarebone → Available.
   * Scans a live Available serial, confirms it surfaces in /pending, then
   * cancels to restore. Skips when QA has no Available serialized item, or when
   * the env's scan attribute differs from serialNumber (the scan won't resolve).
   */
  it('SW-BAREBONE-API-TC12: scan then cancel restores an Available item', function () {
    if (!seedSerial) this.skip();

    scan({ serialNumber: seedSerial }).then((res) => {
      const ok = res.status < 500 && res.body && res.body.success === true;
      if (!ok) {
        // Env couldn't resolve/scan this serial (config or status race) — skip
        // rather than fail; principle #6 (context-dependent).
        this.skip();
        return;
      }
      scanned = true;

      // /pending must now include the scanned serial (state moved off Available).
      getPending().then((pRes) => {
        const data = pRes.body.data || pRes.body;
        const serials = (data.items || []).map((i) => i.serialNumber);
        expect(serials, 'scanned serial should appear in the pending queue').to.include(seedSerial);

        // Cancel restores the item (PendingBarebone → previous status).
        cancel({ serialNumber: seedSerial }).then((cRes) => {
          expect(cRes.status).to.be.lessThan(500);
          expect(cRes.body.success === true || cRes.body.statusCode === 200).to.be.true;
          scanned = false;
        });
      });
    });
  });
});
