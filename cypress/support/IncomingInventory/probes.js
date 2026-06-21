// cypress/support/IncomingInventory/probes.js
//
// Read-only probes against the live QA API to find seed data needed by
// IncomingInventory specs (ItemSearchTests, MoveItemTests, etc.).
//
// Each probe resolves to the seed value or `null` so callers can
// this.skip() when QA has nothing suitable.

const apiBase = () => Cypress.env('API_BASE_URL');

const authHeader = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const isRealPo = (po) => {
  if (!po) return false;
  return String(po).toLowerCase() !== 'default';
};

/**
 * Probe for an open PO that contains at least one items-enabled product
 * (hasItems===true). Used by ItemSearchTests to get a real poNumber +
 * productId for the /incoming-inventory/:name/:id detail page.
 *
 * Returns { poNumber, product } or null. Walks each open PO until one
 * yields a matching item-product (capped to keep the probe quick).
 */
Cypress.Commands.add('iaProbePoWithItemProduct', (token, opts = {}) => {
  const maxPos = opts.maxPos || 50;

  return cy
    .request({
      method: 'GET',
      url: `${apiBase()}/excel/po-numbers?close=false`,
      headers: authHeader(token),
      failOnStatusCode: false,
      timeout: 60000,
    })
    .then((res) => {
      if (res.status >= 400) return null;
      const body = res.body.data || res.body;
      const arr = body.poList || body.list || body;
      const list = Array.isArray(arr) ? arr : [];
      const candidates = list
        .map((row) => (typeof row === 'string' ? row : row && row.poNumber))
        .filter(Boolean).filter(isRealPo)
        .slice(0, maxPos);

      let result = null;
      const tryNext = (idx) => {
        if (result || idx >= candidates.length) return cy.wrap(result);
        const po = candidates[idx];
        return cy
          .request({
            method: 'GET',
            url: `${apiBase()}/incoming-items?page=1&page_size=200&poNumber=${encodeURIComponent(po)}`,
            headers: authHeader(token),
            failOnStatusCode: false,
            timeout: 60000,
          })
          .then((r) => {
            if (r.status < 400) {
              const items = r.body?.data?.data?.list || r.body?.data?.list || r.body?.list || [];
              const itemProduct = (items || []).find((p) => p && p.hasItems === true);
              if (itemProduct) {
                result = { poNumber: po, product: itemProduct };
              }
            }
            return tryNext(idx + 1);
          });
      };
      return tryNext(0);
    });
});
