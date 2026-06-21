// Page object for Inventory products grid mechanics (/inventory): Refresh + column sort.
// The grid is server-side MRT — sorting/pagination flow through GET /products query params.

import L from '../../support/locators/Inventory/gridLocators';

class InventoryGridPage {
  interceptProductsList(alias = 'products') {
    cy.intercept('GET', L.PRODUCTS_LIST).as(alias);
    return this;
  }

  clickRefresh() {
    cy.get(L.REFRESH_BTN, { timeout: 10000 }).first().should('not.be.disabled').click({ force: true });
    return this;
  }

  // Click a sortable MRT column header by its label.
  clickSortHeader(label) {
    cy.get(L.HEADER_CELL, { timeout: 10000 }).contains(label).scrollIntoView().click({ force: true });
    return this;
  }

  // MRT sets aria-sort on the <th> synchronously on click — the deterministic
  // client-side sort signal (independent of which /products GET resolves first).
  assertHeaderSorted(label, direction) {
    cy.contains(L.HEADER_CELL, label, { timeout: 10000 }).should('have.attr', 'aria-sort', direction);
    return this;
  }

  // Read the text of every visible row for the given column label.
  // Returns a cy.wrap(string[]) so callers can .then(values => ...).
  // Uses jQuery .index() on the <th> to find the column position, then reads
  // the matching <td> from each body row — works for standard MRT table layout.
  readColumnValues(label) {
    return cy.contains(L.HEADER_CELL, label, { timeout: 10000 }).then(($th) => {
      const colIndex = $th.index();
      const values = [];
      return cy.get('tbody tr', { timeout: 10000 })
        .should('have.length.greaterThan', 0)
        .then(($rows) => {
          $rows.each((_, row) => {
            values.push(Cypress.$(row).find('td').eq(colIndex).text().trim());
          });
          return cy.wrap(values);
        });
    });
  }

  // Assert that at least one /products list request captured under `alias` carries
  // a sortBy param (the sort refetch may not be the first request after the click).
  assertSortRequestFired(alias, extra = {}) {
    cy.get(`@${alias}.all`, { timeout: 10000 }).then((calls) => {
      const sortReq = [...calls].reverse().find((c) => c.request.query && c.request.query.sortBy);
      expect(sortReq, 'a /products request carried sortBy').to.exist;
      if (extra.sortOrder) {
        expect(String(sortReq.request.query.sortOrder).toLowerCase()).to.eq(extra.sortOrder);
      }
      if (extra.categoryId != null) {
        expect(Number(sortReq.request.query.categoryId)).to.eq(extra.categoryId);
      }
    });
    return this;
  }
}

export default InventoryGridPage;
