/**
 * paginationHelpers.js
 *
 * Reusable, page-agnostic helpers for the standard MUI / MaterialReactTable
 * pagination footer used across every list view in StockWise.
 *
 * The footer DOM looks like:
 *
 *   <div class="MuiBox-root ...">                            ← record container (parent)
 *     <p>Record:  X - Y of Z</p>
 *     <div class="MuiTablePagination-root ...">              ← pagination root
 *       <div>
 *         <label for="mrt-rows-per-page-..."> Rows per page </label>
 *         <div role="combobox" aria-label="Rows per page">75</div>
 *       </div>
 *       <nav aria-label="pagination navigation">
 *         <ul>
 *           <li><button aria-label="Go to previous page" .../></li>
 *           <li><button aria-label="page 1" aria-current="page">1</button></li>
 *           <li><button aria-label="Go to next page" .../></li>
 *         </ul>
 *       </nav>
 *     </div>
 *   </div>
 *
 * All helpers below scope themselves to the first MuiTablePagination-root on
 * the page so they work on any list view (Incoming Inventory, Inventory View,
 * Categories, Work Orders, Reports, etc.) without modification.
 *
 * Conventions:
 *   - Each helper that triggers a network refetch accepts an optional
 *     intercept alias name (default "paginationFetch") and an optional
 *     timeout, so callers can tie waits to the actual list endpoint.
 *   - Returned values flow through Cypress chainables — callers .then() to
 *     assert.
 *   - No hard-coded selectors in spec files: import these helpers instead.
 */

// ─── Selectors (single source of truth) ─────────────────────────────────────
const SEL = {
  paginationRoot: ".MuiTablePagination-root",
  recordTextRegex: /Record:\s*([\d,]+)\s*-\s*([\d,]+)\s*of\s*([\d,]+)/i,
  rowsPerPageCombo: '[role="combobox"][aria-label="Rows per page"]',
  // MUI portals the listbox to <body> — cannot scope to footer container
  listbox: 'ul[role="listbox"]',
  option: 'li[role="option"]',
  prevBtn: 'button[aria-label="Go to previous page"]',
  nextBtn: 'button[aria-label="Go to next page"]',
  pageBtn: 'button[aria-label^="page "]',
  selectedPageBtn: 'button[aria-current="page"]',
  tableBodyRow: "table.MuiTable-root tbody tr",
};

// ─── Scoping ────────────────────────────────────────────────────────────────

/** Returns the parent MuiBox that wraps both the record text and the
 *  pagination root — useful for `.within()` blocks that need both. */
export function getPaginationFooter() {
  return cy.get(SEL.paginationRoot).first().parent();
}

/** Returns the MuiTablePagination-root element (rows-per-page + nav). */
export function getPaginationRoot() {
  return cy.get(SEL.paginationRoot).first();
}

// ─── Record range / total ───────────────────────────────────────────────────

/**
 * Reads the "Record: X - Y of Z" text and returns { from, to, total } as
 * numbers via a Cypress chainable. Throws if the text cannot be parsed.
 */
export function getRecordRange() {
  return getPaginationFooter()
    .find("p")
    .filter((_, el) => SEL.recordTextRegex.test(el.textContent || ""))
    .first()
    .invoke("text")
    .then((text) => {
      const m = text.match(SEL.recordTextRegex);
      if (!m) throw new Error(`Could not parse record range from "${text}"`);
      return {
        from: parseInt(m[1].replace(/,/g, ""), 10),
        to: parseInt(m[2].replace(/,/g, ""), 10),
        total: parseInt(m[3].replace(/,/g, ""), 10),
      };
    });
}

// ─── Rows per page ──────────────────────────────────────────────────────────

/**
 * Reads the currently selected rows-per-page value and returns it as a
 * number via a Cypress chainable.
 */
export function getRowsPerPage() {
  return getPaginationRoot()
    .find(SEL.rowsPerPageCombo)
    .invoke("text")
    .then((t) => parseInt(t.trim(), 10));
}

/**
 * Opens the rows-per-page dropdown, reads each option's value, and returns
 * them as a numeric array via a Cypress chainable. Closes the dropdown
 * before resolving so subsequent assertions run against a stable DOM.
 *
 * The collection (`.then` #1) is kept synchronous — only DOM reads, no cy
 * commands — so it can return the plain array. A separate `.then` (#2)
 * dismisses the dropdown and re-yields the array via `cy.wrap` so the
 * overall chain ends in a Cypress chainable, avoiding the "mixed sync/async"
 * runtime error.
 */
export function getRowsPerPageOptions() {
  getPaginationRoot().find(SEL.rowsPerPageCombo).click({ force: true });
  return cy
    .get(`${SEL.listbox} ${SEL.option}`, { timeout: 8000 })
    .should("have.length.at.least", 1)
    .then(($opts) => {
      const values = [];
      $opts.each((_, el) => {
        const dv = el.getAttribute("data-value") ?? el.textContent;
        const n = parseInt((dv || "").trim(), 10);
        if (!Number.isNaN(n)) values.push(n);
      });
      return values;
    })
    .then((values) =>
      cy
        .get("body")
        .type("{esc}")
        .then(() => cy.get(SEL.listbox).should("not.exist"))
        .then(() => values)
    );
}

/**
 * Sets the rows-per-page selector to `value`. Aliases the list-endpoint
 * intercept so the caller can wait on the resulting refetch.
 *
 * @param {number} value      - new rows-per-page value (must be a real option)
 * @param {object} [opts]
 * @param {string} [opts.endpoint="**"] - intercept URL pattern (e.g. "**\/incoming-items**")
 * @param {string} [opts.alias="rowsPerPageRefetch"] - intercept alias
 * @param {number} [opts.timeout=15000] - ms to wait for the refetch
 */
export function setRowsPerPage(value, opts = {}) {
  const {
    endpoint = "**",
    alias = "rowsPerPageRefetch",
    timeout = 15000,
  } = opts;

  if (endpoint && endpoint !== "**") {
    cy.intercept("GET", endpoint).as(alias);
  }
  getPaginationRoot().find(SEL.rowsPerPageCombo).click({ force: true });
  cy.get(`${SEL.listbox} ${SEL.option}`, { timeout: 8000 })
    .filter((_, el) => {
      const dv = el.getAttribute("data-value") ?? el.textContent;
      return parseInt((dv || "").trim(), 10) === value;
    })
    .first()
    .should("exist")
    .click({ force: true });
  cy.get(SEL.listbox).should("not.exist");
  if (endpoint && endpoint !== "**") {
    cy.wait(`@${alias}`, { timeout });
  }
}

// ─── Navigation buttons ─────────────────────────────────────────────────────

export function getPrevButton() {
  return getPaginationRoot().find(SEL.prevBtn);
}

export function getNextButton() {
  return getPaginationRoot().find(SEL.nextBtn);
}

/** Asserts the previous-page button is disabled. */
export function assertPrevDisabled() {
  getPrevButton().should("be.disabled");
}

/** Asserts the previous-page button is enabled. */
export function assertPrevEnabled() {
  getPrevButton().should("not.be.disabled");
}

/** Asserts the next-page button is disabled. */
export function assertNextDisabled() {
  getNextButton().should("be.disabled");
}

/** Asserts the next-page button is enabled. */
export function assertNextEnabled() {
  getNextButton().should("not.be.disabled");
}

/**
 * Clicks the next-page arrow and waits for the list-endpoint refetch.
 * Uses a unique alias per call to avoid stale-alias collisions.
 *
 * @param {object} [opts]
 * @param {string} [opts.endpoint] - intercept URL pattern; if omitted, no wait is performed
 * @param {string} [opts.aliasPrefix="nextPage"] - intercept alias prefix
 * @param {number} [opts.timeout=15000] - ms to wait
 */
export function clickNextPage(opts = {}) {
  const { endpoint, aliasPrefix = "nextPage", timeout = 15000 } = opts;
  const alias = `${aliasPrefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  if (endpoint) cy.intercept("GET", endpoint).as(alias);
  getNextButton().click({ force: true });
  if (endpoint) cy.wait(`@${alias}`, { timeout });
}

/**
 * Clicks the previous-page arrow and waits for the list-endpoint refetch.
 * See clickNextPage for the options shape.
 */
export function clickPrevPage(opts = {}) {
  const { endpoint, aliasPrefix = "prevPage", timeout = 15000 } = opts;
  const alias = `${aliasPrefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  if (endpoint) cy.intercept("GET", endpoint).as(alias);
  getPrevButton().click({ force: true });
  if (endpoint) cy.wait(`@${alias}`, { timeout });
}

// ─── Page numbers ───────────────────────────────────────────────────────────

/** Reads the currently selected page number (1-indexed) as a chainable. */
export function getCurrentPage() {
  return getPaginationRoot()
    .find(SEL.selectedPageBtn)
    .first()
    .invoke("text")
    .then((t) => parseInt(t.trim(), 10));
}

/**
 * Computes the total number of pages from the record range and current
 * rows-per-page value (Math.ceil(total / rowsPerPage)).
 */
export function getTotalPages() {
  return getRecordRange().then((range) =>
    getRowsPerPage().then((rpp) => Math.ceil(range.total / rpp))
  );
}

// ─── Table snapshot ─────────────────────────────────────────────────────────

/**
 * Captures a stable snapshot of the visible table — concatenates each row's
 * trimmed text. Used to verify page navigation actually changes the rows.
 */
export function snapshotTableRows() {
  return cy.get(SEL.tableBodyRow).then(($rows) => {
    const texts = [];
    $rows.each((_, el) => texts.push((el.textContent || "").trim()));
    return texts;
  });
}

/**
 * Asserts the grid has re-rendered with rows DIFFERENT from `previousRows`.
 *
 * snapshotTableRows() resolves through a one-shot .then(), so calling it straight
 * after a page click can read the DOM while the previous page's rows are still
 * mounted — the request has come back but React has not re-rendered yet. The
 * snapshot then equals the page-1 snapshot and the test reports "rows did not
 * change" even though pagination worked. Wrapping the comparison in a .should()
 * makes Cypress retry the read until the new rows land (or the timeout proves
 * they never do).
 */
export function assertTableRowsChangedFrom(previousRows, timeout = 15000) {
  return cy.get(SEL.tableBodyRow, { timeout }).should(($rows) => {
    const texts = [];
    $rows.each((_, el) => texts.push((el.textContent || "").trim()));
    expect(texts.length, "row count after page navigation").to.be.greaterThan(0);
    expect(texts, "table rows must change after page navigation").to.not.deep.equal(
      previousRows,
    );
  });
}

/** Asserts the visible table currently shows exactly `expected` rows. */
export function assertVisibleRowCount(expected) {
  cy.get(SEL.tableBodyRow, { timeout: 10000 }).should("have.length", expected);
}

// ─── Compound helpers ───────────────────────────────────────────────────────

/**
 * Navigates to the last page by clicking the next arrow until it becomes
 * disabled. Safe to call when already on the last page (does nothing).
 *
 * @param {object} [opts]
 * @param {string} [opts.endpoint] - intercept URL pattern; passed to clickNextPage
 * @param {number} [opts.maxClicks=50] - safety cap on iterations
 */
export function goToLastPage(opts = {}) {
  const { endpoint, maxClicks = 50 } = opts;
  function step(remaining) {
    if (remaining <= 0)
      throw new Error(`goToLastPage exceeded ${maxClicks} clicks`);
    return getNextButton().then(($btn) => {
      if ($btn.is(":disabled")) return;
      clickNextPage({ endpoint });
      return step(remaining - 1);
    });
  }
  return step(maxClicks);
}

/**
 * Navigates to the first page by clicking the prev arrow until it becomes
 * disabled. Safe to call when already on the first page.
 */
export function goToFirstPage(opts = {}) {
  const { endpoint, maxClicks = 50 } = opts;
  function step(remaining) {
    if (remaining <= 0)
      throw new Error(`goToFirstPage exceeded ${maxClicks} clicks`);
    return getPrevButton().then(($btn) => {
      if ($btn.is(":disabled")) return;
      clickPrevPage({ endpoint });
      return step(remaining - 1);
    });
  }
  return step(maxClicks);
}
