class PurchaseOrderPage {
  // ═══════════════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════════

  navigateToPO(poNumber) {
    cy.visit(`/purchase-orders/${encodeURIComponent(poNumber)}`);
    cy.get('h1, h2, [data-testid="po-header"]').should('be.visible', { timeout: 10000 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD PRODUCT FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  clickAddProductButton() {
    cy.get('[data-testid="add-product-button"], button:contains("Add Product"), [aria-label*="Add Product"]')
      .first()
      .click();
    cy.get('[data-testid="product-search-input"], input[placeholder*="product" i], input[placeholder*="search" i]')
      .should('be.visible', { timeout: 5000 });
  }

  searchProduct(searchTerm) {
    cy.get('[data-testid="product-search-input"], input[placeholder*="product" i], input[placeholder*="search" i]')
      .first()
      .clear()
      .type(searchTerm, { delay: 50 });
    cy.wait(500); // Wait for search results
    cy.get('[data-testid="product-search-results"], [role="listbox"], ul[role="presentation"]')
      .should('be.visible', { timeout: 5000 });
  }

  selectProductFromSearch(displayName) {
    cy.get('[data-testid="product-search-results"]')
      .should('be.visible')
      .within(() => {
        cy.contains(displayName).closest('button, [role="option"], li').click();
      });
    cy.wait(300);
  }

  fillQuantity(quantity) {
    cy.get('[data-testid="quantity-input"], input[name="quantity"], input[placeholder*="quantity" i]')
      .first()
      .clear()
      .type(quantity, { delay: 50 });
  }

  fillCost(cost) {
    cy.get('[data-testid="cost-input"], input[name="cost"], input[placeholder*="cost" i]')
      .first()
      .clear()
      .type(cost, { delay: 50 });
  }

  submitAddProduct() {
    cy.get('[data-testid="add-product-submit"], button:contains("Add"), button:contains("Submit")')
      .first()
      .should('not.be.disabled')
      .click();
    cy.wait(500);
  }

  cancelAddProduct() {
    cy.get('[data-testid="cancel-button"], button:contains("Cancel"), button:contains("Close")')
      .first()
      .click();
    cy.wait(300);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  verifySuccessMessage(expectedMessage) {
    cy.contains(expectedMessage, { timeout: 5000 }).should('be.visible');
  }

  verifyErrorMessage(errorText) {
    cy.contains(errorText, { timeout: 5000 }).should('be.visible');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  deletePurchaseOrder(poNumberToDelete) {
    const baseUrl = Cypress.env("API_BASE_URL");
    cy.getAuthToken().then((token) => {
      cy.request({
        method: "DELETE",
        url: `${baseUrl}/purchase-orders/${encodeURIComponent(poNumberToDelete)}`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        failOnStatusCode: false,
      }).then((res) => {
        if (res.status === 200) {
          cy.log(`[CLEANUP] PO '${poNumberToDelete}' deleted successfully via API.`);
        } else if (res.status === 404) {
          cy.log(`[CLEANUP] PO '${poNumberToDelete}' not found — skipping.`);
        } else {
          cy.log(`[CLEANUP] PO '${poNumberToDelete}' delete returned ${res.status}: ${JSON.stringify(res.body)}`);
        }
      });
    });
  }
}
export default PurchaseOrderPage;
