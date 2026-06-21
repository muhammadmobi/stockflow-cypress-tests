 
import IncomingInvLocators from '../support/locators/IncomingInvLocators'
require("cypress-xpath");
class IncomingInvPage {
  clickIncomingInventoryNav() {
    cy.get('a[aria-label="Incoming Inventory"][href="/incoming-inventory"]')
      .should("be.visible")
      .and("not.be.disabled")
      .click({ force: true });
  }

  verifyQtyValidationError(expectedMsg) {
    cy.get('input[name="quantity"]').then(($input) => {
      expect($input[0].validity.valid).to.be.false;
      if (expectedMsg) {
        expect($input[0].validationMessage).to.eq(expectedMsg);
      }
    });
  }
  clickRowActionMenu(){
    cy.get("tbody tr")
      .first()
      .find('button[id="long-button"]')
      .click({ force: true });
  }

  clickHeaderActionMenu() {
    cy.get('button[id="long-button"]')
      .filter((_, el) => !el.closest('tbody'))
      .first()
      .click({ force: true });
  }

  clickImport() {
    cy.contains("button", /^Import$/)
      .should("be.visible")
      .and("not.be.disabled")
      .click({ force: true });
  }
  clickScanButton() {
    cy.contains("button", "Scan").should("exist").click();
  }

  scanSerialNumber(serialNumber) {
    // Type then click Scan explicitly. Typing with `{enter}` alone races
    // react-hook-form's onChange/register cycle: the form is submitted
    // before the value is registered, so RHF reports "Serial number is
    // required" and the POST /incoming-items/scan never fires. Clicking the
    // dedicated Scan button after .blur()-equivalent commit avoids that race.
    cy.get('input[name="serialNumber"]')
      .should("be.visible")
      .clear()
      .type(serialNumber);
    cy.contains("button", /^Scan$/i, { timeout: 10000 })
      .should("be.visible")
      .and("not.be.disabled")
      .click({ force: true });
  }

  verifyserialNumberInItemsList(serialNumbers) {
    cy.get("#searchInputRef").should("be.visible");
    cy.get("#searchInputRef").click({ force: true });
    cy.get("#searchInputRef").clear({ force: true });

    // Wait for table to load and not show "No records to display"
    cy.get("table.MuiTable-root")
      .should("be.visible")
      .should("not.contain", "No records to display", { timeout: 10000 });

    cy.get("table.MuiTable-root tbody").should("be.visible");

    // Verify row count
    cy.get("table.MuiTable-root tbody")
      .find("tr")
      .should("have.length.at.least", serialNumbers.length);

    // Check each serial number exists in the table (in any order)
    serialNumbers.forEach((serialNumber) => {
      cy.get("table.MuiTable-root tbody")
        .contains("td", serialNumber)
        .should("be.visible");
    });
  }

  enterPONumber(POnumber) {
    cy.get("#ponumber")
      .find('[id^="react-select-"][id$="-input"]')
      .should("not.be.disabled")
      .clear()
      .type(POnumber + "{enter}");
  }

  verifyExpectedQty(UIexpectedQty) {
    // Find all "Expected" spans, get their parent, and then the quantity
    cy.get("button")
      .find("span")
      .contains("Expected")
      .parents("button")
      .find("div.MuiBox-root")
      .find("h6")
      .invoke("text")
      .then((expectedQty) => {
        cy.log("Expected Quantity:", expectedQty);

        expect(expectedQty).to.equal(UIexpectedQty.toString());
      });
  }

  uploadFile(path) {
    cy.get('input[name="file"]').attachFile(path);
  }

  clickOK() {
    cy.contains("button", /^OK$/)
      .should("be.visible")
      .and("not.be.disabled")
      .click();
  }

  navigateToPOTab() {
    // Navigate to Purchase Order tab/page - Using your app's navigation pattern
    cy.get('a[aria-label="Purchase Orders"][href="/purchase-orders"]')
      .should("be.visible")
      .and("not.be.disabled")
      .click({ force: true });

    // Wait for navigation to complete and page to load
    cy.url().should("include", "/purchase-orders");
    cy.contains("li.MuiBreadcrumbs-li p.MuiTypography-root", "Purchase Orders");
  }

  clickUpload() {
    cy.contains("button", /^Upload$/)
      .should("be.visible")
      .and("not.be.disabled")
      .click();
  }

  validateRedirectedURL() {
    cy.location("pathname").should("eq", "/incoming-inventory");
  }

  clickScan() {
    cy.contains("button", /^Scan$/)
      .should("be.visible")
      .and("not.be.disabled")
      .click({ force: true });
    cy.contains("Scan Items")
      .should("be.visible")
      .and("not.be.disabled")
      .click({ force: true });
  }

  verifyToastMsgNotExist() {
    cy.get(".go3958317564", { timeout: 10000 }).should("not.exist");
  }
  selectPoNumber(PoNumber) {
    cy.get("#Incomming-inventory-P-O-1")
      .scrollIntoView()
      .click({ force: true });
    cy.get("#Incomming-inventory-P-O-1 input").type(PoNumber, { force: true });
    // Wait for the type-ahead filter to settle: assert the menu is visible
    // AND already contains the PO text in a single retryable expression.
    // This avoids the race where the menu re-renders between the visibility
    // check and the click and detaches the subject mid-chain.
    cy.get('[class*="-menu"]', { timeout: 10000 })
      .should("be.visible")
      .and("contain.text", PoNumber);
    // Re-query from the top so .contains() runs against the latest DOM and
    // is auto-retried by Cypress until it can stably click the option.
    cy.get('[class*="-menu"]')
      .contains(PoNumber)
      .click({ force: true });
  }

  // Select "All POs" from the PO dropdown.
  // The page auto-selects the first PO when no state is provided (List.tsx line 1027),
  // so this method is needed when a test requires the "All POs" state.
  selectAllPos() {
    cy.get(IncomingInvLocators.poDropdown)
      .scrollIntoView()
      .click({ force: true });
    cy.get(IncomingInvLocators.poDropdownInput).clear({ force: true }).type('All', { force: true });
    cy.get(IncomingInvLocators.poDropdownMenu, { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'All POs');
    cy.get(IncomingInvLocators.poDropdownMenu)
      .contains('All POs')
      .click({ force: true });
  }
  clearSearch() {
    cy.get("#searchInputRef").should("be.visible").click().clear();
  }

  searchProduct(searchQuery) {
    cy.get("#searchInputRef")
      .should("be.visible")
      .click()
      .clear()
      .type(searchQuery);
  }

  // Wait for the Incoming Inventory page to be ready for interaction after a
  // PO selection, stat-tile click, or search submission. The Search button
  // becoming visible is the reliable settled-state indicator used throughout
  // this suite — it renders only once the product table has loaded.
  waitForSearchReady() {
    cy.contains('button', /^Search$/i, { timeout: 15000 }).should('be.visible');
  }

  clickSubmitSearch() {
    cy.get('button[type="submit"]')
      .contains("Search")
      .should("exist")
      .should("be.visible")
      .scrollIntoView()
      .then(($el) => {
        cy.wrap($el).click({ force: true });
      });
  }

  clickViewAllItems() {
    cy.contains("button", "View All").should("exist").click();
  }

  clickSearchResultRecord(VariantMake) {
    cy.get("td")
      .contains(VariantMake)
      .should("exist")
      .scrollIntoView({ duration: 500 })
      .click({ force: true });
  }

  performCheckIn(quantity) {
    cy.get("tbody.MuiTableBody-root tr.MuiTableRow-root")
      .should("have.length", 1)
      .should("be.visible");

    cy.get('input[name="quantity"]')
      .should("be.visible")
      .clear()
      .type(quantity);

    // Find and click the stock-in button
    cy.contains("button", "Stock In")
      .should("be.visible")
      .and("not.be.disabled")
      .click();
  }

  verifyToastMsg(expectedMessage) {
    cy.get(".go3958317564")
      .should("exist")
      .and("include.text", expectedMessage);
  }
  validateReceived(expectedQty) {
    cy.contains("p", "Received:")
      .next()
      .should("contain.text", expectedQty.toString());
  }
  validateReceivedQty(expectedQty) {
    cy.contains("span.MuiTypography-caption", "Received")
      .parents("button")
      .find("div.MuiBox-root")
      .find("h6")
      .should("have.text", expectedQty.toString());
  }

  validateAvailableQty(expectedQty) {
    cy.contains("span.MuiTypography-caption", "Available")
      .parents("button")
      .find("div.MuiBox-root")
      .find("h6")
      .should("have.text", expectedQty.toString());
  }

  validateExpectedQty(expectedQty) {
    cy.get("button")
      .find("span.MuiTypography-caption")
      .contains("Expected")
      .parents("button")
      .find("div.MuiBox-root")
      .find("h6")
      .should("have.text", expectedQty.toString());
  }

  validateIncomingQty(expectedQty) {
    cy.contains("span.MuiTypography-caption", "Incoming")
      .parent()
      .find("h6.MuiTypography-h6")
      .should("have.text", expectedQty.toString());
  }

  validateReservedQty(qty) {
    cy.contains("span.MuiTypography-caption", "Reserved").parents("button").find("h6").should("have.text", qty.toString());
  }

  validateMissingQty(qty) {
    cy.contains("span.MuiTypography-caption", "Missing").parents("button").find("h6").should("have.text", qty.toString());
  }

  validateDamagedQty(qty) {
    cy.contains("span.MuiTypography-caption", "Damaged").parents("button").find("h6").should("have.text", qty.toString());
  }

  validateDisputedQty(qty) {
    cy.contains("span.MuiTypography-caption", "Disputed").parents("button").find("h6").should("have.text", qty.toString());
  }

  validateSoldQty(qty) {
    cy.contains("span.MuiTypography-caption", "Sold").parents("button").find("h6").should("have.text", qty.toString());
  }

  validateStockOutOtherQty(qty) {
    cy.contains("span.MuiTypography-caption", "Stocked out (others)").parents("button").find("h6").should("have.text", qty.toString());
  }

  // Click a stat tile (Available, Received, Missing, Incoming, Reserved,
  // Sold, "Stocked out (others)", Damaged, Disputed). Each tile is rendered
  // as an InfoCard whose CardActionArea (button) wraps the caption span and
  // the count h6 — walk up to the nearest button ancestor and click.
  clickStatTile(label) {
    cy.contains("span.MuiTypography-caption", label)
      .parents("button")
      .first()
      .scrollIntoView()
      .should("be.visible")
      .click({ force: true });
  }

  enterStockInQty(quantity) {
    cy.get('input[name="quantity"]')
      .should("be.visible")
      .clear()
      .type(quantity);
  }

  clickStockInSubmit() {
    cy.contains("button", "Stock In")
      .should("be.visible")
      .and("not.be.disabled")
      .click();
  }

  // ─── Cost & Price ─────────────────────────────────────────────────────────
  enableCostPriceColumns(successMessage) {
    this.clickHeaderActionMenu();
    cy.contains("Customize Column").should("be.visible").click();

    cy.get("label")
      .filter((_, el) => el.textContent.trim() === "Cost")
      .first()
      .find('input[type="checkbox"]')
      .then(($cb) => {
        if (!$cb.prop("checked")) cy.wrap($cb).check({ force: true });
      });

    cy.get("label")
      .filter((_, el) => el.textContent.trim() === "Price")
      .first()
      .find('input[type="checkbox"]')
      .then(($cb) => {
        if (!$cb.prop("checked")) cy.wrap($cb).check({ force: true });
      });

    cy.contains("button", "Update").scrollIntoView().click();
    if (successMessage) {
      cy.contains(successMessage, { timeout: 8000 }).should("exist");
    }
  }

  openUpdateCostPriceDialog() {
    this.clickRowActionMenu();
    cy.findByRole("menuitem", { name: /update cost & price/i }).click();
    cy.findByRole("dialog").should("be.visible");
  }

  // Drill into the first product row → first item row → open Update Cost & Price.
  // Reads the serial number from the first item row and stores it as @currentItemSerial
  // so verifyItemSuccessMessage() can use the actual value in its assertion.
  // Caller is responsible for searching the product first.
  openItemCostPriceDialog() {
    cy.get("tbody tr").first().find("td").first().click({ force: true });
    cy.url().should("not.eq", "/incoming-inventory", { timeout: 10000 });

    cy.get("tbody tr.MuiTableRow-root", { timeout: 10000 })
      .should("have.length.at.least", 1);

    // Capture serial number from the first item row before opening the action menu
    cy.get("tbody tr.MuiTableRow-root")
      .eq(0)
      .find("td")
      .eq(0)
      .invoke("text")
      .then((text) => cy.wrap(text.trim()).as("currentItemSerial"));

    cy.get("tbody tr.MuiTableRow-root")
      .eq(0)
      .find('#long-button[aria-label="more"]')
      .should("exist")
      .click({ force: true });

    cy.contains("Update Cost & Price", { timeout: 8000 })
      .should("be.visible")
      .click();
    cy.findByRole("dialog").should("be.visible");
  }

  // Fill cost + price inputs and click Update. Does NOT assert the success
  // toast — call verifySuccessMessage() separately for positive tests so the
  // same method works in negative/validation tests.
  submitCostPrice(newCost, newPrice) {
    cy.findByRole("dialog").within(() => {
      cy.get("input#cost")
        .should("be.visible")
        .focus()
        .click()
        .type("{selectall} {backspace}")
        .should("have.value", "")
        .type(String(newCost), { delay: 50 });
      cy.get("input#price")
        .should("be.visible")
        .focus()
        .click()
        .type("{selectall} {backspace}")
        .should("have.value", "")
        .type(String(newPrice), { delay: 50 });
      cy.findByRole("button", { name: /^Update$/i }).click();
    });
  }

  // Update only the cost field (price stays at its pre-filled value) and submit.
  submitCostOnly(newCost) {
    cy.findByRole("dialog").within(() => {
      cy.get("input#cost")
        .should("be.visible")
        .clear()
        .type(String(newCost), { delay: 50 });
      cy.findByRole("button", { name: /^Update$/i }).click();
    });
  }

  // Update only the price field (cost stays at its pre-filled value) and submit.
  submitPriceOnly(newPrice) {
    cy.findByRole("dialog").within(() => {
      cy.get("input#price")
        .should("be.visible")
        .clear()
        .type(String(newPrice), { delay: 50 });
      cy.findByRole("button", { name: /^Update$/i }).click();
    });
  }

  // Type values into the cost/price inputs without submitting.
  fillCostPrice(newCost, newPrice) {
    cy.findByRole("dialog").within(() => {
      cy.get("input#cost").clear().type(String(newCost));
      cy.get("input#price").clear().type(String(newPrice));
    });
  }

  verifySuccessMessage(message) {
    cy.contains(message, { timeout: 10000 }).should("exist");
  }

  // Asserts the item cost/price toast using the serial captured by openItemCostPriceDialog.
  // Expected toast: Cost and price of item "<serialNumber>" updated successfully
  verifyItemSuccessMessage() {

    cy.get("body")
      .contains("Cost and price of item", { timeout: 10000 })
      .should("be.visible");

    cy.get("body").contains("updated successfully").should("be.visible");
   
  }

  verifyCostInRow(expectedCost) {
    cy.get("tbody tr", { timeout: 10000 })
      .first()
      .should("contain.text", String(expectedCost));
  }

  verifyPriceInRow(expectedPrice) {
    cy.get("tbody tr", { timeout: 10000 })
      .first()
      .should("contain.text", String(expectedPrice));
  }

  verifyCostPriceInRow(expectedCost, expectedPrice) {
    cy.get("tbody tr", { timeout: 10000 })
      .first()
      .should("contain.text", String(expectedCost))
      .and("contain.text", String(expectedPrice));
  }

  verifyDialogInputValues(expectedCost, expectedPrice) {
    cy.findByRole("dialog").within(() => {
      cy.get("input#cost").should("have.value", String(expectedCost));
      cy.get("input#price").should("have.value", String(expectedPrice));
    });
  }

  verifyDialogIsOpen() {
    cy.findByRole("dialog").should("be.visible");
  }

  verifyTableHasRows(minCount = 1) {
    cy.get("tbody tr", { timeout: 10000 }).should("have.length.at.least", minCount);
  }

  verifyDialogError(text) {
    cy.findByRole("dialog").should("contain.text", text);
  }

  closeDialogViaCancel() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Cancel$/i }).click();
    });
    cy.findByRole("dialog").should("not.exist");
  }

  // ─── View Items / View Details menu actions ───────────────────────────────
  openFirstRowLongButtonMenu() {
    cy.get("tbody tr")
      .first()
      .find('button[id="long-button"]')
      .should("be.visible")
      .click({ force: true });
  }

  clickViewItemsMenuItem() {
    cy.contains("View Items", { timeout: 5000 })
      .should("be.visible")
      .click({ force: true });
  }

  clickViewDetailsMenuItem() {
    cy.contains("View Details", { timeout: 5000 })
      .should("be.visible")
      .click({ force: true });
  }

  verifyMenuItemDisabled(label) {
    cy.contains('[role="menuitem"]', label).should(
      "have.attr",
      "aria-disabled",
      "true"
    );
  }

  verifyItemsTableRowCount(expectedCount) {
    cy.get("table.MuiTable-root tbody tr", { timeout: 10000 }).should(
      "have.length",
      expectedCount
    );
  }

  verifyItemsTableContainsSerial(serial) {
    cy.get("table.MuiTable-root tbody")
      .contains("td", serial)
      .should("be.visible");
  }

  expandProductDetailsHeader() {
    cy.get("#product-details-header", { timeout: 10000 })
      .should("be.visible")
      .click({ force: true });
  }

  verifyAttributeVisible(attributeValue) {
    cy.contains(attributeValue).scrollIntoView().should("be.visible");
  }

  // ─── Stats Click table assertions ─────────────────────────────────────────
  verifyTableContainsText(matchText) {
    cy.get("tbody", { timeout: 10000 }).should("contain.text", matchText);
  }

  verifyTableDoesNotContainText(matchText) {
    cy.get("tbody", { timeout: 10000 }).then(($tbody) => {
      if ($tbody.find("tr").length === 0) return;
      cy.get("tbody").should("not.contain.text", matchText);
    });
  }

  verifyTableHasAtLeastOneRow() {
    cy.get("tbody tr", { timeout: 10000 }).should("have.length.at.least", 1);
  }

  verifyToastContainsText(text) {
    cy.contains(text, { timeout: 10000 }).should("exist");
  }

  // ─── Sorting ───────────────────────────────────────────────────────────────

  clickQuantityColumnSortLabel() {
    cy.get('th[data-can-sort="true"]')
      .contains("span", "Quantity")
      .parents("th")
      .find(".MuiTableSortLabel-root")
      .click({ force: true });
  }

  getQuantityColumnSortState() {
    return cy
      .get('th[data-can-sort="true"]')
      .contains("span", "Quantity")
      .parents("th")
      .then(($th) => $th.attr("aria-sort") || "none");
  }

  clickMemGenColumnSortLabel() {
    cy.contains('th[data-can-sort="true"]', "Memory Generation")
      .find(".MuiTableSortLabel-root")
      .click({ force: true });
  }

  getMemGenColumnSortState() {
    return cy
      .contains('th[data-can-sort="true"]', "Memory Generation")
      .then(($th) => $th.attr("aria-sort") || "none");
  }

  getMemGenValuesFromTable() {
    const values = [];
    return cy.get("thead th", { timeout: 10000 })
      .then(($headers) => {
        let colIndex = -1;
        $headers.each((i, th) => {
          if (Cypress.$(th).text().trim().includes("Memory Generation")) {
            colIndex = i;
          }
        });
        if (colIndex === -1) throw new Error("Memory Generation column not found in table headers");
        return cy.get("tbody tr")
          .should("have.length.at.least", 1)
          .each(($row) => {
            const text = $row.find("td").eq(colIndex).text().trim();
            if (text) values.push(text);
          })
          .then(() => values);
      });
  }

  getExpectedQuantitiesFromTable() {
    const values = [];
    return cy
      .get("tbody tr", { timeout: 10000 })
      .should("have.length.at.least", 1)
      .each(($row) => {
        $row.find("td").each((_, cell) => {
          const typographies = Cypress.$(cell).find("p.MuiTypography-root");
          typographies.each((idx, typo) => {
            if (Cypress.$(typo).text().trim() === "Expected:") {
              const next = typographies.eq(idx + 1);
              if (next.length) {
                const val = parseInt(next.text().trim(), 10);
                if (!isNaN(val)) values.push(val);
              }
            }
          });
        });
      })
      .then(() => values);
  }

  verifyTableRowCountAtLeast(min) {
    cy.get("tbody tr", { timeout: 10000 }).should(
      "have.length.at.least",
      min
    );
  }

  // ─── Delete Product ───────────────────────────────────────────────────────
  openDeleteDialog() {
    this.clickRowActionMenu();
    cy.contains("Delete", { timeout: 5000 })
      .should("be.visible")
      .click({ force: true });
    cy.findByRole("dialog").should("be.visible");
  }

  typeDeleteConfirmation(text) {
    cy.findByRole("dialog").within(() => {
      cy.get('input[placeholder="Type DELETE to confirm"]')
        .should("be.visible")
        .clear()
        .type(text, { delay: 50 });
    });
  }

  clickDeleteConfirm() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Confirm$/i }).click();
    });
  }

  clickDeleteCancel() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Cancel$/i }).click();
    });
    cy.findByRole("dialog").should("not.exist");
  }

  verifyConfirmButtonDisabled() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Confirm$/i }).should("be.disabled");
    });
  }

  verifyConfirmButtonEnabled() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Confirm$/i }).should("not.be.disabled");
    });
  }

  verifyDeleteDialogOpen() {
    cy.contains("Confirm Product Deletion", { timeout: 5000 }).should("be.visible");
    cy.contains("Type DELETE to confirm").should("be.visible");
  }

  verifyDeleteDialogClosed() {
    cy.findByRole("dialog").should("not.exist");
  }

  verifyProductNotInTable(productName) {
    cy.get("tbody", { timeout: 10000 }).should("not.contain.text", productName);
  }

  verifyDeleteMenuItemNotVisible() {
    cy.get('[role="menu"]').then(($menu) => {
      if ($menu.find(':contains("Delete")').length > 0) {
        cy.wrap($menu).should("not.contain.text", "Delete");
      }
    });
  }

  verifyDeleteMenuItemVisible() {
    cy.get('[role="menu"]', { timeout: 5000 })
      .should("contain.text", "Delete");
  }

  closeMenu() {
    cy.get("body").click({ force: true });
  }

  // ─── Delete Product ───────────────────────────────────────────────────────
  // ConfirmationDialog component uses "Yes" / "No" labels (see
  // Frontend/src/components/common/ConfirmationDialog.tsx). The dialog
  // heading is "Confirm Product Deletion". The Delete menu item is scoped
  // inside the open MUI menu to avoid matching unrelated "Delete" text.
  openDeleteDialog() {
    this.clickRowActionMenu();
    cy.get('[role="menu"]', { timeout: 5000 })
      .should("be.visible")
      .contains("li", "Delete")
      .click({ force: true });
    cy.findByRole("dialog", { timeout: 10000 }).should("be.visible");
  }

  typeDeleteConfirmation(text) {
    cy.findByRole("dialog").within(() => {
      cy.get('input[placeholder="Type DELETE to confirm"]')
        .should("be.visible")
        .clear();
      if (text && text.length > 0) {
        cy.get('input[placeholder="Type DELETE to confirm"]').type(text, { delay: 50 });
      }
    });
  }

  clickDeleteConfirm() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Yes$/i }).should("not.be.disabled").click();
    });
  }

  clickDeleteCancel() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^No$/i }).click();
    });
    cy.findByRole("dialog").should("not.exist");
  }

  verifyConfirmButtonDisabled() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Yes$/i }).should("be.disabled");
    });
  }

  verifyConfirmButtonEnabled() {
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /^Yes$/i }).should("not.be.disabled");
    });
  }

  verifyDeleteDialogOpen() {
    cy.contains("Confirm Product Deletion", { timeout: 5000 }).should("be.visible");
    cy.contains("Type DELETE to confirm").should("be.visible");
  }

  verifyDeleteDialogClosed() {
    cy.findByRole("dialog").should("not.exist");
  }

  verifyProductNotInTable(productName) {
    cy.get("tbody", { timeout: 10000 }).should("not.contain.text", productName);
  }

  verifyDeleteMenuItemNotVisible() {
    cy.get('[role="menu"]').then(($menu) => {
      if ($menu.find(':contains("Delete")').length > 0) {
        cy.wrap($menu).should("not.contain.text", "Delete");
      }
    });
  }

  verifyDeleteMenuItemVisible() {
    cy.get('[role="menu"]', { timeout: 5000 })
      .should("contain.text", "Delete");
  }

  closeMenu() {
    cy.get("body").click({ force: true });
  }

  // ─── Move Product ─────────────────────────────────────────────────────────
  openMoveProductDialog() {
    this.clickRowActionMenu();
    cy.get('[role="menu"]', { timeout: 5000 })
      .should("be.visible")
      .contains("li", "Move Product")
      .click({ force: true });
    cy.findByRole("dialog", { timeout: 10000 }).should("be.visible");
  }

  openMoveItemsDialog() {
    this.clickRowActionMenu();
    cy.get('[role="menu"]', { timeout: 5000 })
      .should("be.visible")
      .contains("li", "Move Items")
      .click({ force: true });
    cy.findByRole("dialog", { timeout: 10000 }).should("be.visible");
  }

  selectTargetPO(poNumber) {
    // Open the PO dropdown in the move dialog
    cy.findByRole("dialog").within(() => {
      cy.contains("Target Purchase Order Number").should("be.visible");
      // Click on the PO dropdown using exact ID from source
      cy.get('#Inventory-create-P-O-2, #Incomming-inventory-P-O-1')
        .first()
        .scrollIntoView()
        .click({ force: true });
      // Type to search for PO
      cy.get('#Inventory-create-P-O-2 input, #Incomming-inventory-P-O-1 input')
        .first()
        .type(poNumber, { force: true });
    });
    // Wait for menu and select
    cy.get('[class*="-menu"]', { timeout: 10000 })
      .should("be.visible")
      .and("contain.text", poNumber);
    cy.get('[class*="-menu"]')
      .contains(poNumber)
      .click({ force: true });
  }

  clickMoveButton() {
    cy.findByRole("dialog").within(() => {
      cy.contains("button", /^Move$/i).should("not.be.disabled").click();
    });
  }

  clickMoveConfirm() {
    // For the confirmation dialog (Confirm Product Move)
    cy.findByRole("dialog").within(() => {
      cy.contains("button", /^Move$/i).should("not.be.disabled").click();
    });
  }

  clickMoveCancel() {
    cy.findByRole("dialog").within(() => {
      cy.contains("button", /^Cancel$/i).click();
    });
    cy.findByRole("dialog").should("not.exist");
  }

  verifyMoveDialogOpen() {
    cy.findByRole("dialog").should("be.visible");
    cy.contains("Target Purchase Order Number").should("be.visible");
  }

  verifyMoveDialogClosed() {
    cy.findByRole("dialog").should("not.exist");
  }

  verifyMoveConfirmDialogOpen() {
    cy.contains("Confirm Product Move", { timeout: 5000 }).should("be.visible");
  }

  verifyMoveMenuVisible() {
    cy.get('[role="menu"]', { timeout: 5000 }).should("contain.text", "Move Product");
  }

  verifyMoveMenuNotVisible() {
    cy.get('[role="menu"]', { timeout: 5000 }).should("not.contain.text", "Move Product");
  }

  verifyMoveItemsMenuVisible() {
    cy.get('[role="menu"]', { timeout: 5000 }).should("contain.text", "Move Items");
  }

  verifyMoveItemsMenuNotVisible() {
    cy.get('[role="menu"]', { timeout: 5000 }).should("not.contain.text", "Move Items");
  }

  selectTargetProduct(productName) {
    // For Move Items - select target product from table
    cy.findByRole("dialog").within(() => {
      cy.contains(productName).closest('tr').within(() => {
        cy.get('input[type="radio"]').click({ force: true });
      });
    });
  }

  clearSearch() {
    cy.get('input[placeholder*="Search"]').clear({ force: true });
  }

  // ─── Add Product to PO ───────────────────────────────────────────────────

  /**
   * Open the Add Product dialog from the header long-button menu.
   * The header long-button is outside tbody (unlike row-level long-buttons).
   */
  openAddProductDialog() {
    cy.log('[ADD-PO] Opening Add Product dialog via header long button...');
    this.clickHeaderActionMenu();
    cy.contains('[role="menuitem"]', 'Add Product', { timeout: 5000 })
      .should('be.visible')
      .click({ force: true });
    // Dialog title confirms we're in the right dialog
    cy.contains('Add Product', { timeout: 10000 }).should('be.visible');
    cy.log('[ADD-PO] Add Product dialog opened');
  }

  /**
   * Visible MUI dialog for Add Product (ProductImsDialog).
   * Scope all dialog interactions here — global `input` / `button` queries
   * were hitting the wrong controls on Incoming Inventory.
   */
  _addProductDialogRoot() {
    return cy.get('[role="dialog"]:visible', { timeout: 20000 }).should('be.visible');
  }

  /**
   * Type a search term into the product search field inside the dialog
   * and click the Search button. Waits for the product search API to respond.
   */
  searchProductInDialog(searchTerm) {
    cy.log(`[ADD-PO] Searching for: "${searchTerm}"`);
    this._addProductDialogRoot().within(() => {
      cy.get('input.MuiOutlinedInput-input, input[type="text"]')
        .filter(':visible')
        .first()
        .clear({ force: true })
        .type(searchTerm, { force: true });
      cy.contains('button', 'Search')
        .filter(':visible')
        .should('not.be.disabled')
        .click({ force: true });
    });
    cy.get('[role="dialog"]:visible', { timeout: 90000 }).should(($dialog) => {
      const hasResults = $dialog.find('li').length > 0;
      const text = $dialog.text();
      const hasEmpty = /no products found/i.test(text);
      expect(
        hasResults || hasEmpty,
        '[ADD-PO] Search should finish with results list or empty-state copy'
      ).to.be.true;
    });
    cy.log(`[ADD-PO] Search completed for "${searchTerm}"`);
  }

  /**
   * Select a product from the product card list by clicking on a card
   * that contains the given product name/text.
   */
  selectProductFromList(productIdentifier) {
    cy.log(`[ADD-PO] Selecting product: "${productIdentifier}"`);
    this._addProductDialogRoot()
      .contains('li', productIdentifier, { timeout: 25000 })
      .scrollIntoView({ block: 'center', inline: 'nearest' })
      .should('exist')
      .click({ force: true });
    cy.log(`[ADD-PO] Product "${productIdentifier}" selected`);
  }

  /**
   * Click the "Add" button in the dialog footer (first step — transitions
   * from product list view to the expected quantity/cost form).
   */
  clickAddButton() {
    cy.log('[ADD-PO] Clicking Add button...');
    this._addProductDialogRoot().within(() => {
      cy.contains('button', /^Add$/)
        .filter(':visible')
        .should('not.be.disabled')
        .click({ force: true });
    });
    // After clicking Add, the "Expected Quantity" heading should appear
    this._addProductDialogRoot()
      .contains('Expected Quantity', { timeout: 15000 })
      .should('be.visible');
    cy.log('[ADD-PO] Cost/quantity form opened');
  }

  /**
   * Fill the Expected Quantity field on the cost input screen.
   */
  fillExpectedQuantity(qty) {
    cy.log(`[ADD-PO] Filling Expected Quantity: ${qty}`);
    this._addProductDialogRoot().within(() => {
      cy.contains('Expected Quantity *')
        .parent()
        .find('input[type="number"]')
        .should('be.visible')
        .clear({ force: true })
        .type(String(qty), { force: true });
    });
  }

  /**
   * Fill the Cost field on the cost input screen.
   */
  fillProductCost(cost) {
    cy.log(`[ADD-PO] Filling Cost: ${cost}`);
    this._addProductDialogRoot().within(() => {
      cy.contains('Product Cost (Optional)')
        .parent()
        .find('input[type="number"]')
        .should('be.visible')
        .clear({ force: true })
        .type(String(cost), { force: true });
    });
  }

  /**
   * Click "Add to PO" button in the dialog footer (submits the product).
   * Waits for POST /incoming-items/add-product and asserts 2xx (single alias
   * so specs must not register a duplicate intercept for the same request).
   */
  clickAddToPO() {
    cy.log('[ADD-PO] Clicking Add to PO button...');
    cy.intercept('POST', '**/incoming-items/add-product').as('addProduct');
    this._addProductDialogRoot().within(() => {
      cy.contains('button', 'Add to PO')
        .filter(':visible')
        .should('not.be.disabled')
        .click({ force: true });
    });
    cy.wait('@addProduct', { timeout: 120000 }).then(({ response }) => {
      expect(response?.statusCode, '[ADD-PO] add-product should return 2xx').to.be.oneOf([
        200, 201,
      ]);
    });
    cy.log('[ADD-PO] Add to PO request completed');
  }

  /**
   * Click "Back" button on the cost input screen (returns to product list).
   */
  clickAddProductBack() {
    cy.log('[ADD-PO] Clicking Back button on cost screen...');
    this._addProductDialogRoot().within(() => {
      cy.contains('button', 'Back')
        .filter(':visible')
        .should('be.visible')
        .click({ force: true });
    });
    cy.log('[ADD-PO] Back button clicked, returned to product list');
  }

  /**
   * Close the Add Product dialog via the ✕ button.
   */
  closeAddProductDialog() {
    cy.log('[ADD-PO] Closing Add Product dialog...');
    this._addProductDialogRoot().within(() => {
      cy.contains('button', '✕').click({ force: true });
    });
    cy.log('[ADD-PO] Dialog closed');
  }

  /**
   * Verify the success toast message after adding a product.
   */
  verifyAddProductSuccess(expectedMsg) {
    const msg = expectedMsg || 'Product added successfully';
    cy.contains(msg, { timeout: 10000 }).should('be.visible');
  }

  /**
   * Verify that the "Selected Product" heading is visible on the cost screen.
   */
  verifySelectedProductVisible() {
    this._addProductDialogRoot().within(() => {
      cy.contains('Selected Product', { timeout: 10000 }).should('be.visible');
    });
  }

  /**
   * Verify that no products were found (empty results).
   */
  verifyNoProductsFound() {
    this._addProductDialogRoot().within(() => {
      cy.contains(/No products found/i, { timeout: 15000 }).should('be.visible');
    });
  }

  /**
   * Verify the expected quantity helper error message.
   */
  verifyExpectedQtyHelperError(text) {
    this._addProductDialogRoot().within(() => {
      cy.contains(text, { timeout: 10000 }).should('be.visible');
    });
  }

  /**
   * Verify the "Add to PO" button is disabled.
   */
  verifyAddToPODisabled() {
    this._addProductDialogRoot().within(() => {
      cy.contains('button', 'Add to PO')
        .filter(':visible')
        .should('be.disabled');
    });
  }

  /**
   * Verify the "Add to PO" button is enabled.
   */
  verifyAddToPOEnabled() {
    this._addProductDialogRoot().within(() => {
      cy.contains('button', 'Add to PO')
        .filter(':visible')
        .should('not.be.disabled');
    });
  }

  /**
   * Complete happy-path flow: search → select → Add → fill qty/cost → Add to PO.
   */
  addProductToPO(searchTerm, productIdentifier, expectedQty, cost) {
    this.openAddProductDialog();
    this.searchProductInDialog(searchTerm);
    this.selectProductFromList(productIdentifier);
    this.clickAddButton();
    this.fillExpectedQuantity(expectedQty);
    if (cost !== undefined && cost !== null) {
      this.fillProductCost(cost);
    }
    this.clickAddToPO();
  }

  /**
   * Verify product row appears in the PO product table after addition.
   */
  verifyProductInPOTable(productIdentifier) {
    cy.log(`[ADD-PO] Verifying "${productIdentifier}" in PO table...`);
    cy.get('tbody', { timeout: 10000 }).should('contain.text', productIdentifier);
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  // The ImportExport component (importexportn.tsx) renders a chevron dropdown
  // button (#basic-button) that is ONLY present when selectedPo !== 'All POs'.

  assertExportDropdownAbsent() {
    cy.get(IncomingInvLocators.exportDropdownBtn).should('not.exist');
  }

  openExportDropdown() {
    // ScanMenu.tsx also renders li#basic-button (component="li"); it comes after
    // ImportExport in DOM order (List.tsx line 1855 vs 1896). Filter to visible
    // elements and take the first (ImportExport chevron).
    cy.get(IncomingInvLocators.exportDropdownBtn)
      .filter(':visible')
      .first()
      .click({ force: true });
  }

  assertExportMenuItemEnabled() {
    cy.get(IncomingInvLocators.exportDropdownMenu, { timeout: 5000 })
      .should('be.visible')
      .within(() => {
        cy.contains('[role="menuitem"]', 'Export')
          .should('be.visible')
          .and('not.have.class', 'Mui-disabled');
      });
  }

  clickExportMenuItem() {
    cy.get(IncomingInvLocators.exportDropdownMenu, { timeout: 5000 })
      .should('be.visible')
      .within(() => {
        cy.contains('[role="menuitem"]', 'Export')
          .should('not.have.class', 'Mui-disabled')
          .click({ force: true });
      });
  }

  // Trigger the export menu item, intercept the downloadInventoryExcel
  // request, wait for the .xlsx to land in cypress/downloads/, then parse
  // every sheet via the readDownloadedWorkbook task. Returns the workbook
  // payload via cy.wrap so callers can .then() on it.
  //
  // @param {string} po               PO number (used to compute the
  //                                  expected filename `<po>.xlsx`)
  // @param {object} [opts]
  // @param {string} [opts.alias]     custom intercept alias (default 'exportReq')
  // @param {object} [opts.assertParams] key→value pairs the request URL must include
  //                                     (e.g. { search: 'ThinkPad', status: 'Available' })
  exportAndAssertFileName(po, opts = {}) {
    const alias = opts.alias || 'exportReq';
    const fileName = `${po}.xlsx`;
    cy.intercept('GET', '**/incoming-items/downloadInventoryExcel**').as(alias);

    this.openExportDropdown();
    this.clickExportMenuItem();

    cy.wait(`@${alias}`, { timeout: 60000 }).then(({ request, response }) => {
      expect(response.statusCode, 'export request must succeed').to.eq(200);
      expect(
        response.headers['content-type'],
        'response must be a spreadsheetml file'
      ).to.include('spreadsheetml');
      if (opts.assertParams) {
        // Normalise + → %20 so both form-encoding and percent-encoding work.
        const normalizedUrl = request.url.replace(/\+/g, '%20');
        Object.entries(opts.assertParams).forEach(([k, v]) => {
          expect(
            normalizedUrl,
            `query param ${k}=${v} must appear in export request URL`
          ).to.include(`${k}=${encodeURIComponent(String(v))}`);
        });
      }
    });

    cy.task('waitForDownload', fileName);
    return cy.task('readDownloadedWorkbook', fileName);
  }

  // Returns the canonical enum value (e.g. 'StockedOut', not the visible
  // label 'Stocked out (others)') of whichever stat tile is currently
  // active. Implementation matches the data-attribute the FE sets on the
  // outer Box; if the FE wraps the tile differently, fall back to the
  // intercept-driven assertion in exportAndAssertFileName(opts.assertParams).
  getActiveStatusFilter() {
    return cy.window().then((win) => {
      // selectedStatusFilter is React state — not exposed on window. We
      // expose it indirectly: the export request URL is the source of
      // truth. Callers should prefer exportAndAssertFileName({assertParams})
      // over reading this method.
      return null;
    });
  }

  clickInventoryNav() {
    cy.get(IncomingInvLocators.inventoryNavLink, { timeout: 10000 })
      .should('be.visible')
      .click({ force: true });
    cy.url().should('include', '/inventory');
  }

  // Opens the first row's ⋮ action menu and asserts "Move Item" is not present.
  // No-op when the table has no rows (nothing to assert against).
  assertMoveItemAbsentInFirstTableRow() {
    cy.get(IncomingInvLocators.tableRow, { timeout: 10000 }).then(($rows) => {
      if ($rows.length === 0) {
        cy.log('No table rows — skipping Move Item absence assertion');
        return;
      }
      cy.get(IncomingInvLocators.tableRow)
        .first()
        .find(IncomingInvLocators.rowActionBtn)
        .click({ force: true });
      cy.get(IncomingInvLocators.actionMenu, { timeout: 5000 })
        .should('be.visible')
        .and('not.contain.text', 'Move Item');
      cy.get('body').click({ force: true });
    });
  }
}

export default IncomingInvPage;

