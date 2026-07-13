import CategoryPage from '../../pageObjects/categoryPage';
import { randomCategory } from '../../support/helpers/dataFactory';
import { faker } from '@faker-js/faker';

/**
 * Category - Validation & Boundary
 * --------------------------------
 * Additive validation coverage on top of the CRUD suite: unique create,
 * duplicate rejection, discard-on-cancel, and long / special-character name
 * boundaries. Every category name is faker-generated (dataFactory.randomCategory)
 * and created categories are deleted in-test so the suite stays re-runnable.
 */
describe('Category - Validation & Boundary', () => {
  const categoryPage = new CategoryPage();

  const goToCategories = () => {
    cy.contains('Configuration').click();
    cy.contains(/^Categories$/).click();
  };

  const createCategory = (name) => {
    categoryPage.clickAddnewCat();
    categoryPage.typeCatName(name);
    categoryPage.clickSaveBt();
  };

  const deleteCategory = (name) => {
    cy.contains('tr', name).within(() => cy.contains(/delete/i).click({ force: true }));
    cy.contains('button', /^Yes$/i).should('be.visible').click();
  };

  beforeEach(() => {
    cy.session('admin-session', () => {
      cy.visit('/');
      cy.login();
    });
    cy.visit('/');
    goToCategories();
  });

  it('SW-CAT-TC01: creates a category with a valid unique name @smoke', () => {
    const name = randomCategory('ValidCat');
    createCategory(name);
    categoryPage.assertToast('Category created.');
    deleteCategory(name); // cleanup
    categoryPage.assertToast('Category Deleted');
  });

  it('SW-CAT-TC02: rejects a duplicate category name', () => {
    const name = randomCategory('DupCat');
    createCategory(name);
    categoryPage.assertToast('Category created.');

    createCategory(name);
    categoryPage.assertToast(/exist|already|unique|duplicate/i);

    deleteCategory(name); // cleanup the original
  });

  it('SW-CAT-TC03: cancelling the form discards the new category', () => {
    const name = randomCategory('CancelCat');
    categoryPage.clickAddnewCat();
    categoryPage.typeCatName(name);
    categoryPage.clickCancelButton();
    categoryPage.verifyCategories(name).should('eq', false);
  });

  it('SW-CAT-TC04: handles a long category name (upper boundary)', () => {
    const name = randomCategory(faker.string.alpha(40));
    createCategory(name);
    // Either accepted (created) or rejected with a validation toast - never a crash.
    categoryPage.assertToast(/Category created\.|invalid|too long|max/i);
  });

  it('SW-CAT-TC05: handles special characters in the category name', () => {
    const name = `${randomCategory('SpecialCat')}-#$&`;
    createCategory(name);
    categoryPage.assertToast(/Category created\.|invalid|not allowed/i);
  });
});
