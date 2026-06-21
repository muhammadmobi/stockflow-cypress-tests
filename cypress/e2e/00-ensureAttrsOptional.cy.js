import { ensureCommonAttributesOptional } from '../support/helpers/attributeHelpers';

describe('Pre-suite: ensureCommonAttributesOptional', () => {
  before(() => {
    cy.adminSession();
    cy.visit('/');
  });

  it('patches all required=true attributes to optional (excluding system fields)', { tags: ['@smoke'] }, () => {
    ensureCommonAttributesOptional().then(() => {
      cy.log('ensureCommonAttributesOptional completed');
    });

    // Verify: re-fetch all attributes and assert none are required=true
    // (except the system exclusions: serial, quantity, cost, price)
    const EXCLUDE = /serial|^quantity$|^cost$|^price$|^category$/i;
    const apiBase = Cypress.env('API_BASE_URL');

    cy.getAuthToken().then((token) => {
      cy.request({
        method: 'GET',
        url: `${apiBase}/attributes`,
        qs: { all: true, page_size: 1000 },
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      }).then((res) => {
        const raw = res.body?.data?.list ?? res.body?.data ?? res.body ?? [];
        const list = Array.isArray(raw) ? raw : [];

        const stillRequired = list.filter((a) => {
          const isExcluded = EXCLUDE.test(a.fieldName || '') || EXCLUDE.test(a.name || '');
          return !isExcluded && a.required === true;
        });

        cy.log(`Attributes still required after patch: ${stillRequired.length}`);
        stillRequired.forEach((a) =>
          cy.log(`  → still required: ${a.name} (fieldName: ${a.fieldName}, id: ${a.id})`)
        );

        expect(stillRequired.length, 'No non-system attributes should remain required').to.equal(0);
      });
    });
  });
});
