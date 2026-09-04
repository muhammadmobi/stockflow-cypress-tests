import { MoveItemLocators as loc } from '../support/locators/MoveItemLocators';

/**
 * MoveItemPage.js
 *
 * Page object for the "Move Items" dialog that opens from the ItemView row
 * action menu (⋮ → Move Item).
 *
 * Components:
 *   Frontend/src/components/common/MoveItemModel.tsx
 *   Frontend/src/components/IncommingInventory/PoList.tsx   (PO react-select)
 *   Frontend/src/components/common/ProductTableSelector.tsx (product search)
 *
 * All selectors are sourced from MoveItemLocators — never inline here.
 */
class MoveItemPage {
  /**
   * Select a target PO in the open Move Items dialog.
   * The react-select portal renders outside the dialog, so the menu is queried globally.
   */
  selectDialogTargetPO(poNumber) {
    cy.findByRole('dialog').within(() => {
      cy.get(loc.poDropdownId).scrollIntoView().click({ force: true });
      cy.get(loc.poDropdownInput).type(poNumber, { force: true });
    });
    cy.get(loc.poDropdownMenu, { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', poNumber);
    cy.get(loc.poDropdownMenu).contains(poNumber).click({ force: true });
  }

  /**
   * Search for and select a product by model number in ProductTableSelector.
   * Manual search is used because auto-selection via productId prop only works
   * for products on page 1 of GET /products; new products may be at higher IDs.
   */
  selectProductByModelNumber(modelNumber) {
    cy.findByRole('dialog').within(() => {
      cy.get(loc.productSearchInput, { timeout: 30000 }).should('be.visible');
      cy.get(loc.productSearchInput).type(modelNumber, { force: true });
      cy.contains('button', loc.productSearchBtnText).click({ force: true });
    });
    cy.findByRole('dialog').within(() => {
      cy.get(loc.productListItem, { timeout: 20000 }).should('have.length.at.least', 1);
      cy.get(loc.productListItem).first().click({ force: true });
      cy.contains(loc.selectedIndicator, { timeout: 10000 }).should('be.visible');
    });
  }

  /**
   * Click Move in the dialog, then confirm in the secondary "Confirm Item Move" dialog.
   */
  confirmMove() {
    cy.findByRole('dialog').within(() => {
      cy.contains('button', loc.moveBtnText).should('not.be.disabled').click({ force: true });
    });
    cy.contains(loc.confirmMoveDialogTitle, { timeout: 10000 }).should('be.visible');
    cy.findByRole('dialog').within(() => {
      cy.contains('button', loc.moveBtnText).should('not.be.disabled').click({ force: true });
    });
  }

  /** Cancel the Move Items dialog. */
  cancelMove() {
    cy.findByRole('dialog').within(() => {
      cy.contains('button', loc.cancelBtnText).click({ force: true });
    });
    cy.findByRole('dialog').should('not.exist');
  }

  /** Assert the success toast after a move completes. */
  assertMoveSuccess() {
    cy.contains(loc.successToastText, { timeout: 10000 }).should('be.visible');
  }

  /**
   * Assert an error toast containing `partialText` is visible AND the dialog
   * remains open (setOpen(false) fires only on success in MoveItemModel.tsx).
   */
  assertMoveErrorContains(partialText) {
    cy.contains(partialText, { timeout: 10000 }).should('be.visible');
    cy.findByRole('dialog').should('be.visible');
  }
}

export default MoveItemPage;
