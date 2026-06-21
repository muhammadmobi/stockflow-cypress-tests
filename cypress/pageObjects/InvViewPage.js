import InvViewLocators from "../support/locators/InvViewLocators";
require("cypress-xpath");
class InvViewPage {
  clickInvPage() {
    InvViewLocators.InvViewLinkTxt().click();
  }
  clickInvDropDown() {
    cy.xpath(InvViewLocators.ViewsDropDown).click();
  }

  clickSelect() {
    cy.xpath(InvViewLocators.ViewsDropDown)
      .scrollIntoView() // Ensure the element is in view
      .should("be.visible") // Verify the dropdown is visible
      .should("not.be.disabled") // Ensure the dropdown is not disabled
      .then(($dropdown) => {
        // Perform the click in a separate step to ensure conditions are met
        cy.wrap($dropdown).click({ force: true });
      });
  }

  clickExport(buttonName) {
    cy.contains("button", "Export Selected")
      .should("not.be.disabled")
      .click({ force: true });
  }

  clickExportAll() {
    cy.contains("p", "Export All")
      .should("not.be.disabled")
      .click({ force: true });
  }
  selectCategory(categoryName) {
    cy.get('[class*="control"]') // targets any element with class containing "control"
      .find("input") // then finds the input inside it
      .type(categoryName);
    cy.get('div[class*="menu"]')
      .should("be.visible")
      .contains(categoryName)
      .eq(0)
      .click({ force: true });
  }
  verifyToastMsgNotExist() {
    cy.get(".go4109123758", { timeout: 10000 }).should("not.exist");
  }
  SelectFirstRecord() {
    cy.get("tbody tr[data-index=0]").find('input[type="checkbox"]').click();
  }
  retrieveSelectedRowData() {
    const UIdata = {};

    // Wait for the table rows to be populated dynamically
    return cy
      .get("tbody tr", { timeout: 10000 }) // Retry for up to 10 seconds
      .should("have.length.greaterThan", 0) // Ensure rows are populated
      .then(() => {
        // Ensure the table headers are visible and retrieve their text
        return cy.get("thead tr").each(($row) => {
          cy.wrap($row)
            .find("th")
            .each(($th) => {
              cy.wrap($th)
                .find("div.Mui-TableHeadCell-Content-Wrapper")
                .should("be.visible") // Ensure the header is visible
                .invoke("text")
                .then((headerText) => {
                  const trimmedHeader = headerText.trim();
                  if (trimmedHeader !== "Actions" && trimmedHeader !== "") {
                    UIdata[trimmedHeader] = []; // Add the header to UIdata
                  }
                });
            });
        });
      })
      .then(() => {
        // Grab all tbody rows
        return cy.get(`tbody tr[data-selected="true"]`).each(($row, rowIndex) => {
          cy.wrap($row).within(() => {
            cy.get("td").each(($td, colIndex) => {
              if (colIndex !== 0) {
                // Exclude the first column (index 0)
                cy.wrap($td)
                  .invoke("text")
                  .then((text) => {
                    const trimmedText = text.trim(); // Trim the text for cleaner output
                    const keys = Object.keys(UIdata); // Get the keys of the UIdata object
                    const key = keys[colIndex - 1]; // Map the column index to the correct key
                    if (key) {
                      // Ensure the key exists
                      if (!UIdata[key][rowIndex]) {
                        UIdata[key][rowIndex] = []; // Initialize the row if it doesn't exist
                      }
                      UIdata[key][rowIndex] = trimmedText; // Assign the data to the corresponding key and row
                    } else {
                      cy.log(`No key found for column index ${colIndex}`); // Log if no key is found
                    }
                    cy.log(
                      `Row ${rowIndex}, Column ${colIndex}: ${trimmedText}`
                    ); // Log the row and column data
                  });
              }

              //  delete UIdata["Quantity"];


            });
          });
        });
      })
      .then(() => {
        if (UIdata["Quantity"] && UIdata["Quantity"].length > 0) {
          UIdata["Available Quantity"] = [];
          UIdata["Incoming Quantity"] = [];

          UIdata["Quantity"].forEach((quantityValue) => {
            const availableMatch = quantityValue.match(/Available:(\d+)/); // Extract Available quantity
            const incomingMatch = quantityValue.match(/Incoming:(\d+)/); // Extract Incoming quantity

            // Add extracted values to the respective arrays
            if (availableMatch) {
              UIdata["Available Quantity"].push(availableMatch[1]); // Add Available Quantity
            }
            if (incomingMatch) {
              UIdata["Incoming Quantity"].push(incomingMatch[1]); // Add Incoming Quantity
            }
          });

          // Remove the original Quantity key
          delete UIdata["Quantity"];
        } else {
          cy.log("Quantity key is missing or invalid in UIdata.");
        }
        cy.log("Final UIdata:", JSON.stringify(UIdata)); // Log the final UIdata object
      })
      .then(() => {
        return cy.wrap(UIdata); // Return the UIdata object
      });
  }
  retrieveAllRowsData() {
    const UIdata = {};

    // Wait for the table rows to be populated dynamically
    return cy
      .get("tbody tr", { timeout: 10000 }) // Retry for up to 10 seconds
      .should("have.length.greaterThan", 0) // Ensure rows are populated
      .then(() => {
        // Ensure the table headers are visible and retrieve their text
        return cy.get("thead tr").each(($row) => {
          cy.wrap($row)
            .find("th")
            .each(($th) => {
              cy.wrap($th)
                .find("div.Mui-TableHeadCell-Content-Wrapper")
                .should("be.visible") // Ensure the header is visible
                .invoke("text")
                .then((headerText) => {
                  const trimmedHeader = headerText.trim();
                  if (trimmedHeader !== "Actions" && trimmedHeader !== "") {
                    UIdata[trimmedHeader] = []; // Add the header to UIdata
                  }
                });
            });
        });
      })
      .then(() => {
        // Grab all tbody rows
        return cy.get("tbody tr").each(($row, rowIndex) => {
          cy.wrap($row).within(() => {
            cy.get("td").each(($td, colIndex) => {
              if (colIndex !== 0) {
                // Exclude the first column (index 0)
                cy.wrap($td)
                  .invoke("text")
                  .then((text) => {
                    const trimmedText = text.trim(); // Trim the text for cleaner output
                    const keys = Object.keys(UIdata); // Get the keys of the UIdata object
                    const key = keys[colIndex - 1]; // Map the column index to the correct key
                    if (key) {
                      // Ensure the key exists
                      if (!UIdata[key][rowIndex]) {
                        UIdata[key][rowIndex] = []; // Initialize the row if it doesn't exist
                      }
                      UIdata[key][rowIndex] = trimmedText; // Assign the data to the corresponding key and row
                    } else {
                      cy.log(`No key found for column index ${colIndex}`); // Log if no key is found
                    }
                    cy.log(
                      `Row ${rowIndex}, Column ${colIndex}: ${trimmedText}`
                    ); // Log the row and column data
                  });
              }

              //  delete UIdata["Quantity"];


            });
          });
        });
      })
      .then(() => {
        if (UIdata["Quantity"] && UIdata["Quantity"].length > 0) {
          UIdata["Available Quantity"] = [];
          UIdata["Incoming Quantity"] = [];

          UIdata["Quantity"].forEach((quantityValue) => {
            const availableMatch = quantityValue.match(/Available:(\d+)/); // Extract Available quantity
            const incomingMatch = quantityValue.match(/Incoming:(\d+)/); // Extract Incoming quantity

            // Add extracted values to the respective arrays
            if (availableMatch) {
              UIdata["Available Quantity"].push(availableMatch[1]); // Add Available Quantity
            }
            if (incomingMatch) {
              UIdata["Incoming Quantity"].push(incomingMatch[1]); // Add Incoming Quantity
            }
          });

          // Remove the original Quantity key
          delete UIdata["Quantity"];
        } else {
          cy.log("Quantity key is missing or invalid in UIdata.");
        }
        cy.log("Final UIdata:", JSON.stringify(UIdata)); // Log the final UIdata object
      })
      .then(() => {
        return cy.wrap(UIdata); // Return the UIdata object
      });
  }
  selectCostCol() {
    cy.contains("button", "Customize Columns")
      .should("not.be.disabled")
      .click();
    cy.contains("label", "Cost") // Locate the label containing "Cost"
      .find('input[type="checkbox"]') // Find the checkbox within the label
      .first()
      .should("not.be.disabled") // Target the first checkbox
      .then(($checkbox) => {
        if ($checkbox.is(":checked")) {
          cy.log("The first 'Cost' checkbox is already checked.");
          cy.get('[data-testid="CloseIcon"]').should("not.be.disabled").click();
        } else {
          cy.wrap($checkbox).should("not.be.disabled").check({ force: true }); // Check the checkbox if it's not selected
          cy.contains("button", "Update").should("not.be.disabled").click(); // Click the Update button
          cy.log(
            "The first 'Cost' checkbox was not checked. Now it is checked."
          );
        }
      });
  }
  selectPriceCol() {
    cy.contains("button", "Customize Columns")
      .should("not.be.disabled")
      .click();
    cy.contains("label", "Price")
      .find('input[type="checkbox"]')
      .first()
      .should("not.be.disabled")
      .then(($checkbox) => {
        if ($checkbox.is(":checked")) {
          cy.log("The first 'Price' checkbox is already checked.");
          cy.get('[data-testid="CloseIcon"]').should("not.be.disabled").click();
        } else {
          cy.wrap($checkbox).should("not.be.disabled").check({ force: true }); // Check the checkbox if it's not selected
          cy.contains("button", "Update").should("not.be.disabled").click(); // Click the Update button
          cy.log(
            "The first 'Cost' checkbox was not checked. Now it is checked."
          );
        }
      });
  }

  retreiveCostPrice() {
    const result = {};

    cy.get("tbody tr[data-index=0]").click();

    return cy
      .contains("p", "Cost:")
      .should("be.visible")
      .parent()
      .find("p")
      .eq(1)
      .invoke("text")
      .then((costValue) => {
        result.Cost = costValue.trim();

        return cy
          .contains("p", "Price:")
          .should("be.visible")
          .parent()
          .find("p")
          .eq(1)
          .invoke("text")
          .then((priceValue) => {
            const trimmedPrice = priceValue.trim();
            if (trimmedPrice !== "--") {
              result.Price = trimmedPrice;
            }

            return result;
          });
      })
      .then((finalResult) => cy.wrap(finalResult)); // return wrapped
  }

  clickSelectOption(option) {
    cy.get(InvViewLocators.selectOpt)
      .filter(`:contains(${option})`)
      .click({ force: true });
  }

  verifyViewDeletion() { }

  clickSearchResultRecord(VariantMake) {
    cy.get("tbody tr").should("have.length.greaterThan", 0);

    // Find the row containing the text (handles cells off-screen to the right)
    cy.get("tbody tr")
      .contains("td", VariantMake)
      .closest("tr")
      .find("td")
      .first()
      .scrollIntoView()
      .click({ force: true });
  }

  clickFirstSearchResult() {
    cy.get("tbody tr").should("have.length.greaterThan", 0);
    cy.get("tbody tr")
      .first()
      .find("td")
      .first()
      .scrollIntoView()
      .click({ force: true });
  }

  searchProduct(searchQuery) {
    cy.get("#searchInputRef", { timeout: 10000 }) // Retry for up to 10 seconds
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
      .scrollIntoView()
      .then(($input) => {
        cy.wrap($input)
          .click()
          .clear()
          .type(`${searchQuery}{enter}`, { delay: 50 }); // Type the search query with a slight delay
      });
  }

  clickSubmitSearch() {
    cy.get('button[type="submit"]')
      .contains("Search")
      .scrollIntoView()
      .should("not.be.disabled")
      .click();
  }

  clickEdit() {
    cy.get("#long-button").should("be.visible").click({ force: true });
    cy.get("li span").contains("Edit").should("be.visible").click();
  }
  clickEditTxt() {
    cy.contains("button", "Edit").click();
  }

  clickAddProduct() {
    InvViewLocators.addProductBt.click();
  }

  validateTableHeader(...attributeLabels) {
    cy.get(InvViewLocators.tableHeader).within(() => {
      attributeLabels.forEach((label) => {
        cy.get("th").should("contain.text", label);
      });
    });
  }

  validateProductData(...attributeValues) {
    cy.get(InvViewLocators.tableRow)
      .eq(0)
      .within(() => {
        attributeValues.forEach((value) => {
          cy.contains(value).should("contain.text", value);
        });
      });
  }
  updateItemAttrib(details) {
    Object.entries(details).forEach(([key, value]) => {
      if (value) {
        cy.get(`input[name="${key.toLowerCase()}"]`).clear().type(value);
      }
    });
  }

  clickViewAll() {
    cy.contains("button", "View All")
      .should("be.visible")
      .click({ force: true });
  }

  clickAddVariant() {
    cy.contains("button", /^Add Variant$/)
      .should("exist")
      .click({ force: true });
  }

  clickAddItem() {
    cy.contains("button", /^Add Item$/)
      .should("exist")
      .click({ force: true });
  }
  validateAvailableQty(expectedQty) {
    cy.contains("p", "Available Quantity:")
      .next()
      .should("have.text", expectedQty.toString());
  }

  validateAvailable(expectedQty) {
    cy.contains("p", "Available:")
      .next()
      .should("have.text", expectedQty.toString());
  }

  validateIncomingQty(expectedQty) {
    cy.contains("p", "Incoming:")
      .next()
      .should("have.text", expectedQty.toString());
  }

  clickStockOut() {
    // The actual button text is "Stock Out" (space). Hyphenated form was wrong.
    cy.contains("button", /^Stock Out$/).click({ force: true });
  }

  InputStockOutQty(stockoutQty) {
    cy.get("input#stockout-quantity").type(stockoutQty);
  }

  clickStockOutFormBt() {
    cy.get('button[type="submit"][form="stockoutform"]').click();
  }

  verifyToastMsg(expectedMessage) {
    cy.get(".go3958317564")
      .should("exist")
      .and("include.text", expectedMessage);
  }

  // ===========================================================================
  // Navigation for ItemView Tests
  // ===========================================================================

  navigateToInventory() {
    cy.get('a[aria-label="Inventory"][href="/inventory"]')
      .should("be.visible")
      .click({ force: true });
    cy.url().should("include", "/inventory");
    cy.get("table tbody tr", { timeout: 10000 }).should("exist");
  }

  searchAndOpenFirstProduct() {
    cy.get("tbody tr", { timeout: 10000 })
      .should("exist")
      .first()
      .click({ force: true });
    cy.url().should("match", /\/inventory\/view\/\d+/);
  }

  getFirstProductId() {
    return cy
      .get("tbody tr[data-index=0]", { timeout: 10000 })
      .invoke("attr", "data-id");
  }

  // ── Stock-Out Modal helpers ────────────────────────────────────────────────

  // Click the row-level "Stock Out" button on the inventory list (button text
  // is "Stock Out" with a space, NOT "Stock-Out"). Opens StockOutModal which
  // posts to /products/stock-out (product-only) or /products/stockout-by-serial
  // (product-items). After search, only one matching row should be visible.
  clickStockOutRow() {
    cy.contains('button', /^Stock Out$/, { timeout: 10000 })
      .should('be.visible')
      .click({ force: true });
  }

  // Select a reason in the StockOutModal CreatableSelect (react-select/creatable).
  // The menu renders inline (menuPortalTarget=null). The reason Controller is the
  // FIRST react-select on the form. We click its control to open the menu, then
  // either pick a matching option or type+Enter to create one (CreatableSelect).
  fillStockOutReason(reason) {
    // Open the first (reason) react-select control inside the form
    cy.get('form#stockoutform').find('[class*="control"]').first().click({ force: true });
    // Type the reason — if it matches an existing option, the menu filters down to it;
    // otherwise CreatableSelect lets us create it. Enter selects highlighted option.
    cy.focused().type(`${reason}{enter}`, { delay: 30, force: true });
  }

  // Type a serial number into the scan input. NOTE: StockOutModal does NOT use
  // chips — the input is just a plain controlled <input id="sn">. Just type the
  // value, then click the Stock Out submit button to fire /products/stockout-by-serial.
  fillStockOutSerial(serial) {
    cy.get('form#stockoutform input#sn', { timeout: 10000 })
      .should('be.visible')
      .clear()
      .type(serial, { delay: 20 });
  }

  // Submit the stock-out form (the footer's "Stock Out" button is form-linked
  // by form="stockoutform" attribute)
  submitStockOut() {
    cy.get('button[type="submit"][form="stockoutform"]', { timeout: 10000 })
      .should('be.visible')
      .click({ force: true });
  }

  // Assert a success message (react-hot-toast). Matches any partial visible text.
  verifyStockOutSuccess(partialText) {
    cy.contains(partialText, { timeout: 12000 }).should('be.visible');
  }

  // Assert an error message is visible. BE returns messages like
  // "Item <SN> cannot be stocked out. It's status is <status>" — caller passes
  // the partial text it expects.
  verifyStockOutError(partialText) {
    cy.contains(partialText, { timeout: 10000 }).should('be.visible');
  }

  // Close the Stock-Out modal. The IMSDialog wraps a CloseIcon inside an
  // absolutely-positioned IconButton in the upper-right of the dialog. We
  // click that icon. Falls back to pressing Escape if the icon isn't found.
  closeStockOutModal() {
    cy.get('div[role="dialog"]', { timeout: 10000 }).then(($dialog) => {
      // Click the close IconButton — it lives at top-right of the dialog
      // (Model.tsx wraps a CloseIcon in an absolutely-positioned IconButton).
      const $closeBtn = $dialog.find('button').filter((_, b) => {
        const svgClass = b.querySelector('svg')?.getAttribute('data-testid') || '';
        return /Close/i.test(svgClass) || b.getAttribute('aria-label') === 'close';
      });
      if ($closeBtn.length) {
        cy.wrap($closeBtn.first()).click({ force: true });
      } else {
        cy.wrap($dialog).type('{esc}');
      }
    });
  }

  // ── Inventory list search (shared across AddProduct, EditProduct, StockOut specs) ──

  // Register intercept before typing so cy.wait resolves on the triggered request.
  searchInventory(term) {
    cy.intercept('GET', '**/products**').as('inventorySearch');
    cy.get('table tbody, [role="progressbar"]', { timeout: 20000 }).should('exist');
    cy.get('#searchInputRef', { timeout: 15000 })
      .should('be.visible')
      .click({ force: true })
      .clear()
      .type(term, { delay: 30 });
    cy.contains('button', /^Search$/, { timeout: 15000 })
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });
    cy.wait('@inventorySearch', { timeout: 15000 });
  }

  // ── Add Product toolbar button ─────────────────────────────────────────────

  // Two #long-button elements exist outside tbody: [0] ExportMenu, [1] InventoryActionMenu.
  clickAddProductBtn() {
    cy.get('button#long-button').not('tbody *').eq(1).click();
    cy.get('[role="menu"]', { timeout: 8000 }).contains(/^Add Product$/i).click();
    cy.url({ timeout: 10000 }).should('include', '/new-product');
    cy.get('form#item-form', { timeout: 15000 }).should('be.visible');
  }

  // ── Inventory row edit helpers ─────────────────────────────────────────────

  // Open the edit page for a searched product row via its per-row 3-dot menu.
  openEditForSearchedRow(searchTerm) {
    cy.get('tbody tr', { timeout: 15000 }).should('have.length.greaterThan', 0);
    cy.contains('tbody tr', searchTerm, { timeout: 10000 })
      .find('button[id="long-button"]')
      .scrollIntoView()
      .click({ force: true });
    cy.get('[role="menu"] [role="menuitem"]', { timeout: 10000 })
      .contains(/^Edit$/)
      .should('be.visible')
      .click({ force: true });
    cy.url({ timeout: 10000 }).should('include', '/edit-product/');
    cy.get('form#item-form', { timeout: 15000 }).should('be.visible');
  }

  // Open the edit page for a specific serial row in the items table.
  openEditForItemRow(serial) {
    cy.contains('td', serial, { timeout: 10000 })
      .closest('tr')
      .find('button[id="long-button"]')
      .first()
      .click({ force: true });
    cy.get('[role="menu"] [role="menuitem"]', { timeout: 10000 })
      .contains(/^Edit$/)
      .should('be.visible')
      .click({ force: true });
    cy.url({ timeout: 10000 }).should('include', '/edit-item');
    cy.get('form#item-form', { timeout: 15000 }).should('be.visible');
  }

  // ── Stock-Out quantity / form helpers ──────────────────────────────────────

  // Type a quantity into the product-only Stock Out quantity field.
  typeStockOutQty(qty) {
    cy.get('input#stockout-quantity', { timeout: 10000 }).clear().type(qty);
  }

  // Assert the stock-out form is still visible (submission was blocked or rejected).
  assertStockOutFormOpen() {
    cy.get('form#stockoutform', { timeout: 5000 }).should('exist');
  }

  // Type into the description/notes textarea on the stock-out form.
  typeStockOutDescription(text) {
    cy.get('form#stockoutform textarea').first().clear({ force: true }).type(text);
  }

  // ── Change Status helpers (Inventory module, /inventory route) ─────────────

  // Click the first cell of the matching product row to open the item list.
  // Current URL pattern is /inventory/<productName>/<productId>
  // (e.g. /inventory/Lenovo%20ThinkPad%20T14-CS-1779347036395-l/17445695).
  // searchInventory aliases the broad /products endpoint which can match the
  // page-load request rather than the search request — so we add a generous
  // timeout on the row assertion to absorb the race.
  openItemList(searchTerm) {
    cy.contains('tbody tr', searchTerm, { timeout: 20000 })
      .find('td')
      .first()
      .click({ force: true });
    cy.url({ timeout: 10000 }).should('match', /\/inventory\/[^/]+\/\d+/);
  }

  // Click #long-button on the item row matching serialNumber, then select
  // "Change Status" from the menu. Waits for the dialog to become visible.
  openChangeStatusMenuForItem(serialNumber) {
    cy.contains('td', serialNumber, { timeout: 10000 })
      .closest('tr')
      .find('button[id="long-button"]')
      .first()
      .click({ force: true });
    cy.get('[role="menu"]', { timeout: 8000 })
      .contains(/Change Status/)
      .should('be.visible')
      .click({ force: true });
    cy.get('[role="dialog"]', { timeout: 8000 }).should('be.visible');
  }

  // Click #long-button on the product row matching searchTerm (product-only
  // flow where no item list exists), then select "Change Status" from the menu.
  openChangeStatusMenuForProduct(searchTerm) {
    cy.contains('tbody tr', searchTerm, { timeout: 20000 })
      .find('button[id="long-button"]')
      .scrollIntoView()
      .click({ force: true });
    cy.get('[role="menu"]', { timeout: 8000 })
      .contains(/Change Status/)
      .should('be.visible')
      .click({ force: true });
    cy.get('[role="dialog"]', { timeout: 8000 }).should('be.visible');
  }

  // Select a status option in the Change Status dialog.
  // The dialog's status form field defaults to row?.status — so when opened
  // on an item with a pre-existing status (e.g. Available), the react-select
  // shows that value instead of the "Choose Status" placeholder. Targeting
  // the placeholder text only works when no status is preselected.
  // Robust path: click the first react-select control inside the dialog
  // (status select is always rendered first; damage-reason / statusAvailable
  // only appear after a status is chosen).
  selectStatusInDialog(status) {
    cy.get('[role="dialog"]')
      .find('[class*="control"]')
      .first()
      .scrollIntoView()
      .click({ force: true });
    cy.get('[role="option"]', { timeout: 8000 })
      .contains(new RegExp(`^${status}$`, 'i'))
      .click({ force: true });
  }

  // Click the damage-reason react-select and pick the first available option.
  // When the dialog has status=Damaged, the damage-reason select is the
  // SECOND react-select control inside the dialog.
  selectFirstDamageReason() {
    cy.get('[role="dialog"]')
      .find('[class*="control"]')
      .eq(1)
      .scrollIntoView()
      .click({ force: true });
    cy.get('[role="option"]', { timeout: 8000 }).first().click({ force: true });
  }

  // Product-only Available target: after selecting status=Available, a second
  // "Choose Available Status" react-select appears to identify the source
  // pool (Damaged / Missing / Disputed) the qty should be drawn from.
  selectAvailableSourceStatus(source) {
    cy.get('[role="dialog"]')
      .find('[class*="control"]')
      .eq(1)
      .scrollIntoView()
      .click({ force: true });
    cy.get('[role="option"]', { timeout: 8000 })
      .contains(new RegExp(`^${source}$`, 'i'))
      .click({ force: true });
  }

  // Product-only mark-status (Damaged/Missing/Disputed) has a required
  // "Select Source" react-select identifying the container/location the qty
  // is drawn from. Without a selection the form silently blocks submission.
  // Scopes to the Box whose label is "Select Source" so the index of the
  // control among the dialog's selects doesn't matter.
  selectFirstContainerSource() {
    cy.get('[role="dialog"]')
      .contains('Select Source')
      .parent()
      .find('[class*="control"]')
      .first()
      .scrollIntoView()
      .click({ force: true });
    cy.get('[role="option"]', { timeout: 8000 }).first().click({ force: true });
  }

  // Click the dialog's submit button (labelled "Update").
  submitChangeStatusDialog() {
    cy.get('[role="dialog"]')
      .contains('button', /^Update$/i)
      .should('be.visible')
      .click({ force: true });
  }

  // Click the dialog's cancel button (labelled "Cancel").
  cancelChangeStatusDialog() {
    cy.get('[role="dialog"]')
      .contains('button', /^Cancel$/i)
      .should('be.visible')
      .click({ force: true });
  }

  // Assert that the item row matching serialNumber contains the expected status text.
  assertItemStatus(serialNumber, statusText) {
    cy.contains('td', serialNumber, { timeout: 10000 })
      .closest('tr')
      .should('contain.text', statusText);
  }

  // Click #long-button on the item row and assert the "Change Status" menu
  // item carries aria-disabled="true" (FE gate for StockedOut items).
  // Walking up DOM ancestors is fragile across MUI versions — instead,
  // search the menu for any element with aria-disabled="true" containing
  // the "Change Status" label.
  assertChangeStatusMenuDisabled(serialNumber) {
    cy.contains('td', serialNumber, { timeout: 10000 })
      .closest('tr')
      .find('button[id="long-button"]')
      .first()
      .click({ force: true });
    cy.get('[role="menu"]', { timeout: 8000 })
      .find('[aria-disabled="true"]')
      .should('contain.text', 'Change Status');
  }

  // Mirror of assertChangeStatusMenuDisabled for the enabled case.
  // FE only gates StockedOut — all other statuses (including Reserved) show an enabled menu item.
  // Closes the menu with Escape after asserting.
  assertChangeStatusMenuEnabled(serialNumber) {
    cy.contains('td', serialNumber, { timeout: 10000 })
      .closest('tr')
      .find('button[id="long-button"]')
      .first()
      .click({ force: true });
    cy.get('[role="menu"]', { timeout: 8000 })
      .contains(/Change Status/)
      .should('not.have.attr', 'aria-disabled', 'true');
    cy.get('body').type('{esc}');
  }

  // Type a quantity into the #quantity input inside the Change Status dialog.
  typeChangeStatusQuantity(qty) {
    cy.get('[role="dialog"]')
      .find('#quantity')
      .clear()
      .type(String(qty));
  }
}

export default InvViewPage;
