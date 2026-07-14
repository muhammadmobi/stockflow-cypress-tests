import NewProductPage from '../../pageObjects/NewProductPage';
import { randomProduct } from '../../support/helpers/dataFactory';
import { faker } from '@faker-js/faker';

/**
 * Add Product - Validation & Boundary
 * -----------------------------------
 * Negative-path coverage for the Add Product form: the form must block
 * submission when the category or required fields are missing, and when numeric
 * fields hold invalid values (negative cost, non-numeric quantity). Focusing on
 * blocked submissions keeps the suite side-effect free - no demo product is
 * persisted. Field values are faker-generated (dataFactory.randomProduct).
 *
 * Note: the numeric-validation cases select a product category that the
 * Configuration suite seeds ("TestProduct Category").
 */
describe('Add Product - Validation & Boundary', () => {
  const newProductPage = new NewProductPage();
  const SEEDED_CATEGORY = 'TestProduct Category';

  const openAddProductForm = () => {
    cy.contains(/^Inventory$/).click();
    newProductPage.clickAddProduct();
  };

  beforeEach(() => {
    cy.session('admin-session', () => {
      cy.visit('/');
      cy.login();
    });
    cy.visit('/');
  });

  it('SW-PROD-VAL-TC01: Add Product opens the product form @smoke', () => {
    openAddProductForm();
    cy.url().should('include', '/new-product');
  });

  it('SW-PROD-VAL-TC02: submitting an empty form is blocked', () => {
    openAddProductForm();
    newProductPage.saveAndExpectBlocked();
  });

  it('SW-PROD-VAL-TC03: submitting without required fields (category selected) is blocked', () => {
    openAddProductForm();
    newProductPage.selectCategory(SEEDED_CATEGORY);
    newProductPage.saveAndExpectBlocked();
  });

  it('SW-PROD-VAL-TC04: a negative cost is rejected', () => {
    const product = randomProduct();
    openAddProductForm();
    newProductPage.selectCategory(SEEDED_CATEGORY);
    newProductPage.enterDetails({
      make: product.make,
      model: product.model,
      quantity: product.quantity,
      cost: -Math.abs(product.cost),
      price: product.price,
    });
    newProductPage.saveAndExpectBlocked();
  });

  it('SW-PROD-VAL-TC05: a non-numeric quantity is rejected', () => {
    const product = randomProduct();
    openAddProductForm();
    newProductPage.selectCategory(SEEDED_CATEGORY);
    newProductPage.enterDetails({
      make: product.make,
      model: product.model,
      quantity: faker.string.alpha(4), // letters where a number is required
      cost: product.cost,
      price: product.price,
    });
    newProductPage.saveAndExpectBlocked();
  });

  it('SW-PROD-VAL-TC06: navigating back to Inventory leaves the form', () => {
    openAddProductForm();
    cy.url().should('include', '/new-product');
    cy.contains(/^Inventory$/).click();
    cy.url().should('not.include', '/new-product');
  });
});
