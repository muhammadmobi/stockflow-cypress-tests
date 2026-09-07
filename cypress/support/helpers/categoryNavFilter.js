import L from '../locators/inventoryCategoryFilterLocators';

/**
 * Select a category from the in-page Inventory category filter.
 *
 * The filter is a searchable react-select (Frontend/src/components/Item/
 * CategoryList.tsx) rendered in the ItemList toolbar with container
 * id="invent-category-4"; its option menu is portaled to document.body
 * (menuPortalTarget). Options are [{ id: null, name: 'All' }, ...categories].
 * Choosing an option fires handleCategoryChange → updates client state and
 * refetches /products with a categoryId param. It does NOT write categoryId /
 * categoryName to the URL (navigate('/inventory', { replace:true })), so the
 * selection is confirmed via the control's displayed value, not the address bar.
 *
 * History: the category filter briefly lived in the left-nav drawer
 * (data-group="Inventory" sub-items); that relocation was reverted, so the old
 * nav-drawer path no longer exists — hence this drives the in-page react-select.
 *
 * @param {string} name - category name, or 'All' / 'All Categories' / 'All Inventory' to reset.
 */
export function selectCategoryViaNav(name) {
  const isAll = /^all( categories|( inventory)?)?$/i.test(String(name).trim());
  const label = isAll ? 'All' : name;

  // Open the react-select menu by clicking its control. `.first()` matches the
  // sibling input query below — the container renders more than one node whose
  // class contains "control" (control + valueContainer wrappers).
  cy.get(L.categoryFilterControl, { timeout: 15000 })
    .first()
    .scrollIntoView()
    .should('be.visible')
    .click({ force: true });

  // Type to filter, then click the exact-match option in the portaled menu.
  cy.get(L.categoryFilterInput, { timeout: 10000 })
    .first()
    .clear({ force: true })
    .type(label, { force: true, delay: 20 });

  cy.get(L.categoryFilterOption, { timeout: 10000 })
    .filter((_, el) => el.textContent.trim() === label)
    .first()
    .click({ force: true });

  // Confirm the selection landed — the control now displays the chosen category.
  cy.get(L.categoryFilterValue, { timeout: 10000 }).should('have.text', label);

  // Settle the MRT grid after the category-scoped /products refetch.
  cy.get('.MuiLinearProgress-root[role="progressbar"]', { timeout: 40000 }).should('not.exist');
}

export default selectCategoryViaNav;
