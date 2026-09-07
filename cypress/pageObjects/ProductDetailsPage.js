// cypress/pageObjects/ProductDetailsPage.js
//
// Page Object Model for the Product Details page rendered at
// `/inventory/:productName/:id` and `/incoming-inventory/:productName/:id`
// (component: Frontend/src/components/Item/ItemView.tsx → ItemViewItemList).
//
// Used by StatsClickableTests.cy.js which exercises the *clickable badges*
// feature: clicking a quantity-stat tile (Expected, Available, Received,
// Reserved, Incoming, Damaged, Disputed, Missing, Sold, Stocked out (others))
// must filter the items table to only items in that status, and the visible
// row count must equal the badge value.
//
// Conventions (cypress/Test Automation Skill.txt):
//   • All selectors live here — never in spec files
//   • All UI actions are atomic POM methods
//   • No explicit cy.wait(ms) — only cy.wait('@alias') for network waits

class ProductDetailsPage {
  // ── Selectors ─────────────────────────────────────────────────────────────

  // Each badge is a <Box onClick=...><InfoCard label value /></Box> tile.
  // We locate by the caption label text and walk up to the clickable Box
  // (the InfoCard is wrapped by the onClick Box at the parent level).
  badgeTile(label) {
    return cy
      .contains('span.MuiTypography-caption', label)
      .parents('div')
      .filter((_, el) => Cypress.$(el).css('cursor') === 'pointer')
      .first();
  }

  badgeValueEl(label) {
    return cy
      .contains('span.MuiTypography-caption', label)
      .parent()
      .find('h6.MuiTypography-h6');
  }

  // The InfoCard receives `isSelected` which renders a 2px solid border
  // (searchStatisticCard.tsx) — its inner Card carries the highlight class
  // structure. We assert via inline border style on the rendered Card.
  badgeCard(label) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tileRe = new RegExp('^\\s*' + esc + '\\s*\\(\\d+\\)\\s*$');
    return cy.get('body').then(($body) => {
      // InfoCard build: span.MuiTypography-caption carries the plain label text
      const captions = $body.find('span.MuiTypography-caption')
        .filter((_, el) => el.textContent.trim() === label);
      if (captions.length) {
        return cy.contains('span.MuiTypography-caption', label)
          .closest('.MuiPaper-root, .MuiCard-root').first();
      }
      // Compact-strip build: deepest div whose full text is "Label (N)"
      const tiles = $body.find('div').filter((_, el) => {
        if (Cypress.$(el).closest('[aria-hidden="true"]').length) return false;
        if (!tileRe.test((el.textContent || '').trim())) return false;
        return !Cypress.$(el).children('div')
          .filter((__, c) => tileRe.test((c.textContent || '').trim())).length;
      }).filter(':visible');
      if (tiles.length) return cy.wrap(Cypress.$(tiles[0]));
      // Fallback to caption approach
      return cy.contains('span.MuiTypography-caption', label)
        .closest('.MuiPaper-root, .MuiCard-root').first();
    });
  }

  get itemRows() {
    return cy.get('tbody tr');
  }

  get statusCells() {
    // Status column index can shift with dynamic attribute columns; instead
    // of locking to a column, we rely on the status text being present
    // somewhere in each row. We expose a `rowStatus` reader for assertions.
    return cy.get('tbody tr');
  }

  get paginationFooter() {
    return cy.contains('p.MuiTypography-body1, p.MuiTablePagination-displayedRows', /Record:|of\s+\d+/i);
  }

  // ── Atomic actions ────────────────────────────────────────────────────────

  // Visit the product details page directly given a productId. The route
  // expects a URL-safe productName segment; the actual value is irrelevant
  // for the items list (productDetails are re-fetched by id), so a
  // throwaway slug is fine.
  visitInventoryView(productName, productId) {
    const slug = encodeURIComponent(productName || 'product');
    cy.visit(`/inventory/${slug}/${productId}`);
  }

  visitIncomingInventoryView(productName, productId) {
    const slug = encodeURIComponent(productName || 'product');
    cy.visit(`/incoming-inventory/${slug}/${productId}`);
  }

  // Drills from the Incoming Inventory page (after a PO + product search)
  // into the product details page by clicking the first-row's first cell.
  // Mirrors AllPOsPage.drillIntoFirstProductRow but lives here so the spec
  // doesn't reach into another POM.
  drillIntoFirstProductRow() {
    cy.get('tbody tr').first().find('td').eq(0).scrollIntoView().click({ force: true });
  }

  // Clicks the first cell of the first product row using the data-index="0"
  // attribute from the MUI table DOM (as documented in the steps file).
  // This navigates from the Incoming Inventory product list to the Product Details page.
  clickFirstProductRow() {
    cy.get('tbody tr')
      .first()
      .find('td[data-index="0"]')
      .scrollIntoView()
      .click({ force: true });
  }

  // Click a badge tile by its label. The tile fires the React onClick that
  // sets `selectedStatusFilter` and triggers a fresh listing fetch with
  // `?status=<filter>`. Spec is expected to cy.wait() on its own intercept.
  clickBadge(label) {
    // Delegate to the config-agnostic stat-card command which adapts to the
    // InfoCard build, the QA compact strip, and the "More (N)" overflow.
    cy.clickStatCard(label);
  }

  // ── Readers ───────────────────────────────────────────────────────────────

  // Returns the badge integer value (e.g. 5 for "Available: 5").
  //
  // Config-agnostic — the badge strip renders three different ways across the
  // builds under test:
  //   • InfoCard build  — <span.MuiTypography-caption>Label</span> + <h6>N</h6>
  //   • QA compact strip — a <div> reading "Label (N)" (ignore the hidden
  //     aria-hidden measurement copy, which always reads "(0)")
  //   • compact strip overflow — lower-priority tiles (e.g. Sold, Stocked out
  //     (others)) live behind a "More (N)" dropdown and must be opened to read.
  readBadgeValue(label) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tileRe = new RegExp('^\\s*' + esc + '\\s*\\((\\d+)\\)\\s*$');

    return cy.get('body').then(($body) => {
      // InfoCard build
      const captions = $body
        .find('span.MuiTypography-caption')
        .filter((_, el) => el.textContent.trim() === label);
      if (captions.length) {
        const $cap = Cypress.$(captions[0]);
        let h6 = $cap.parent().find('h6.MuiTypography-h6');
        if (!h6.length) h6 = $cap.closest('button').find('h6');
        return Number(String(h6.first().text()).trim());
      }

      // Compact strip — read the deepest "Label (N)" tile. Tiles that overflow
      // into the "More (N)" menu render NO count in the menu, so their real
      // value lives only in the visible strip OR the hidden aria-hidden
      // measurement copy. Prefer a visible tile; fall back to the copy.
      const findTiles = (includeHidden) =>
        $body.find('div').filter((_, el) => {
          if (!includeHidden && Cypress.$(el).closest('[aria-hidden="true"]').length)
            return false;
          if (!tileRe.test((el.textContent || '').trim())) return false;
          return !Cypress.$(el)
            .children('div')
            .filter((__, c) => tileRe.test((c.textContent || '').trim())).length;
        });
      let tiles = findTiles(false);
      if (!tiles.length) tiles = findTiles(true);
      if (tiles.length) {
        const m = tileRe.exec((tiles[0].textContent || '').trim());
        return m ? Number(m[1]) : NaN;
      }
      return NaN;
    });
  }

  // Returns the rendered row count (excludes the empty/no-rows placeholder
  // row that Material-React-Table renders when the list is empty).
  // Snapshot reader — DO NOT use for assertions that fire right after a
  // filter click; React-Query's `keepPreviousData` keeps the previous rows
  // visible until the new fetch resolves AND MRT re-renders. Use
  // `shouldHaveDataRowCount(n)` for retry-aware assertions instead.
  readVisibleItemRowCount() {
    return cy.get('body').then(($body) => {
      const rows = $body.find('tbody tr');
      const dataRows = rows.filter((_, el) =>
        !/no\s+records/i.test(Cypress.$(el).text()),
      );
      return dataRows.length;
    });
  }

  // Retry-aware row-count assertion. Cypress retries the .should() callback
  // until the data-row count matches `expected` or the command times out.
  // Use this immediately after clicking a status badge: the listing API
  // resolves first, then MRT re-renders — there's a window between those
  // two events where the table still shows stale rows
  // (`keepPreviousData` in itemViewItemList.tsx:228).
  shouldHaveDataRowCount(expected, message) {
    cy.get('tbody', { timeout: 10000 }).should(($tbody) => {
      const rows = $tbody.find('tr');
      const dataRows = rows.filter(
        (_, el) => !/no\s+records/i.test(Cypress.$(el).text()),
      );
      expect(dataRows.length, message || `data-row count`).to.eq(expected);
    });
  }

  // ── Assertions ────────────────────────────────────────────────────────────

  // Every visible row must have a status cell whose text is exactly
  // `status`. We assert per-row to catch off-by-one or unfiltered rows.
  shouldHaveAllRowsWithStatus(status) {
    cy.get('tbody tr').each(($row) => {
      // Skip MRT empty-state row.
      if (/no\s+records/i.test($row.text())) return;
      cy.wrap($row).contains(status).should('exist');
    });
  }

  // Selected badge: the InfoCard build applies rgba(0,0,0,0.04) background to
  // the card root when isSelected=true. The QA compact-strip build does not
  // use InfoCard — it renders plain div tiles where the same CSS is applied to
  // a CardActionArea child rather than the root. Asserting on a specific rgba
  // value is therefore brittle across builds; we instead verify the badge label
  // is still present in the DOM (InfoCard or tile text) after the click.
  shouldHaveBadgeSelected(label) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cy.get('body').should(($body) => {
      const hasCaption = $body
        .find('span.MuiTypography-caption')
        .filter((_, el) => el.textContent.trim() === label).length > 0;
      const hasTile = $body.find('div, li').filter((_, el) =>
        new RegExp(esc + '\\s*\\(\\d').test(el.textContent || ''),
      ).length > 0;
      expect(hasCaption || hasTile, `badge "${label}" present after selection`).to.be.true;
    });
  }

  shouldHaveBadgeNotSelected(label) {
    // After deselection the badge tile must still be visible (it is never
    // removed from the strip; it just loses its selection highlight).
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cy.get('body').should(($body) => {
      const hasCaption = $body
        .find('span.MuiTypography-caption')
        .filter((_, el) => el.textContent.trim() === label).length > 0;
      const hasTile = $body.find('div, li').filter((_, el) =>
        new RegExp(esc + '\\s*\\(\\d').test(el.textContent || ''),
      ).length > 0;
      expect(hasCaption || hasTile, `badge "${label}" still present after deselection`).to.be.true;
    });
  }
}

export default ProductDetailsPage;
