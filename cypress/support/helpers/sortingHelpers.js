/**
 * sortingHelpers.js
 * Reusable helpers for Incoming Inventory sorting tests.
 * All UI interactions are delegated to IncomingInvPage POM methods.
 */

/**
 * Clicks a sortable column label and waits for the API refetch.
 * Uses a unique intercept alias per call to avoid stale-alias collisions.
 *
 * @param {object}   page        - IncomingInvPage instance
 * @param {number}   callIndex   - monotonically increasing index for alias uniqueness
 * @param {number}   timeout     - ms to wait for the API response
 * @param {Function} [clickFn]   - optional override; defaults to Quantity column click
 * @param {Function} [getStateFn]- optional override; defaults to Quantity sort-state read
 * @returns Cypress chainable that resolves to the new sort state string
 */
export function clickSortAndWait(page, callIndex, timeout, clickFn, getStateFn) {
  // NOTE: previously this waited on a broad `**/incoming-items**` intercept.
  // That was unreliable: (a) the alias matched unrelated incoming-items calls
  // (stats/poll/column-enable) so the wait resolved before the real sort
  // refetch, leaving STALE rows; (b) clearing the sort to "none" fires NO
  // refetch at all, so the wait timed out. The aria-sort attribute updates
  // synchronously on click (client state), so we click + settle + read state.
  // The actual ROW-ORDER assertions use assertColumnSortedEventually(), which
  // re-reads until the server re-sort lands — robust to refetch timing.
  if (clickFn) {
    clickFn();
  } else {
    page.clickQuantityColumnSortLabel();
  }
  cy.wait(600); // let MRT apply the new sort state + kick the refetch
  return getStateFn ? getStateFn() : page.getQuantityColumnSortState();
}

/**
 * Re-reads a column's values until they match the expected sorted order (or the
 * attempt budget is exhausted, at which point it asserts and surfaces the diff).
 * Robust to the server-side re-sort landing a beat after the sort click.
 *
 * @param {Function} readFn      - returns a Cypress chainable resolving to the
 *                                 current column values (array)
 * @param {Function} comparator  - Array.sort comparator defining "sorted"
 * @param {object}   [opts]      - { attempts=10, gap=700, label='values' }
 */
export function assertColumnSortedEventually(readFn, comparator, opts = {}) {
  const { attempts = 10, gap = 700, label = "values" } = opts;
  const attempt = (n) =>
    readFn().then((vals) => {
      const sorted = [...vals].sort(comparator);
      const isSorted = JSON.stringify(vals) === JSON.stringify(sorted);
      if (isSorted || n >= attempts) {
        expect(
          vals,
          `${label} should be sorted (settled after ${n} attempt(s))`
        ).to.deep.equal(sorted);
        return vals;
      }
      cy.wait(gap);
      return attempt(n + 1);
    });
  return attempt(1);
}

/**
 * Clicks a sortable column label up to `remaining` times until it reaches
 * `targetState` ("ascending" | "descending" | "none").
 * Throws if the target is not reached within the allowed clicks.
 *
 * @param {object}   page        - IncomingInvPage instance
 * @param {string}   targetState - desired aria-sort value
 * @param {object}   counter     - mutable { value: number } shared with spec
 * @param {number}   timeout     - ms to wait per API refetch
 * @param {number}   remaining   - recursion guard (decrements on each click)
 * @param {string}   errorMsg    - message to throw when guard exhausted
 * @param {Function} [clickFn]   - optional override; defaults to Quantity column click
 * @param {Function} [getStateFn]- optional override; defaults to Quantity sort-state read
 */
export function clickUntilSortState(
  page,
  targetState,
  counter,
  timeout,
  remaining = 3,
  errorMsg = `Could not reach sort state "${targetState}" after ${3 - remaining + remaining} clicks`,
  clickFn,
  getStateFn
) {
  if (remaining <= 0) throw new Error(errorMsg);
  const readState = getStateFn ? getStateFn() : page.getQuantityColumnSortState();
  return readState.then((state) => {
    if (state === targetState) return;
    counter.value++;
    clickSortAndWait(page, counter.value, timeout, clickFn, getStateFn);
    return clickUntilSortState(
      page,
      targetState,
      counter,
      timeout,
      remaining - 1,
      errorMsg,
      clickFn,
      getStateFn
    );
  });
}

/**
 * Builds a RAM product row object for Excel import.
 *
 * @param {object} td        - fixture data (stockInByQtyData)
 * @param {string} brand     - RAM brand name
 * @param {string} memGen    - Memory generation (e.g. "DDR4")
 * @param {number} qty       - Expected quantity
 * @returns plain object matching the Excel column schema
 */
export function buildRamRow(td, brand, memGen, qty) {
  return {
    Category: td.ram.category,
    // "RAMbrand" (no space) matches the registered attribute; "RAM Brand"
    // would be dropped on import → empty PO.
    RAMbrand: brand,
    "Memory Generation": memGen,
    Cost: td.ramKingston.cost,
    Price: td.ramKingston.price,
    "Support Contact": td.ramKingston.supportContact,
    Quantity: qty,
  };
}
