import categoryLocators from "../support/locators/categoryLocators";

import "cypress-map";

class CategoryPage {
  clickCatLink() {
    cy.get(".MuiListItemText-root.css-1o9gcq0")
      .should("be.visible")
      .contains("Category")
      .click();
  }

  verifyToastMsg(ToastMessage) {
    cy.get(".go4109123758").should("contain", `${ToastMessage}`);
  }

  // Drag item at fromIndex DOWN below item at toIndex
  dragItems(fromIndex, toIndex) {
    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .should("be.visible")
      .then(($el) => {
        const $fromHandle = $el.find('[role="button"]').eq(fromIndex); // index 0 (first item)
        const $toHandle = $el.find('[role="button"]').eq(toIndex); // index 1 (second item)

        const fromRect = $fromHandle[0].getBoundingClientRect();
        const toRect = $toHandle[0].getBoundingClientRect();

        const fromX = fromRect.left + fromRect.width / 2;
        const fromY = fromRect.top + fromRect.height / 2;
        const toX = toRect.left + toRect.width / 2;
        const toY = toRect.top + toRect.height / 2;

        // Press down on FIRST item (index 0)
        cy.wrap($fromHandle).realMouseDown({ position: "center" }).wait(500);

        // Move DOWN toward second item
        cy.get("body")
          .realMouseMove(fromX, fromY)
          .wait(100)
          .realMouseMove(fromX, fromY + 10)
          .wait(100) // move down
          .realMouseMove(toX, toY - 10)
          .wait(100)
          .realMouseMove(toX, toY)
          .wait(300);

        // Drop
        cy.get("body").realMouseUp();
      });
  }

  // Verify items are SWAPPED after drag
  // attr1 = original first item name, attr2 = original second item name
  verifyReordering(attr1, attr2) {
    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .find("p.MuiTypography-body2")
      .eq(0)
      .should("contain", attr2); // attr2 is now first

    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .find("p.MuiTypography-body2")
      .eq(1)
      .should("contain", attr1); // attr1 is now second
  }

  // Verify items are back to ORIGINAL order
  verifyOrdering(attr1, attr2) {
    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .find("p.MuiTypography-body2")
      .eq(0)
      .should("contain", attr1); // attr1 is first again

    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .find("p.MuiTypography-body2")
      .eq(1)
      .should("contain", attr2); // attr2 is second again
  }

  verifyToastMsgNotExist(ToastMessage) {
    cy.get(".go4109123758", { timeout: 10000 }).should("not.exist");
  }

  clickAddnewCat() {
    categoryLocators.addCategory().click();
  }

  typeCatName(catName) {
    categoryLocators.categoryName().type(catName);
  }
  updatedCatName(catName, updatedCatName) {
    const inputSelector = "input#name";

    // Function to check if the input has a value
    const checkInputValue = () => {
      cy.get(inputSelector).then(($input) => {
        const value = $input.val().trim();
        if (value) {
          // If the input has a value, clear it and type the updated category name
          cy.wrap($input).clear().type(updatedCatName);
        } else {
          // If the input is empty, wait and check again
          cy.wait(1000); // Adjust the wait time as necessary
          checkInputValue(); // Call the function recursively
        }
      });
    };

    // Start checking the input value
    checkInputValue();
  }
  verifyModalContainAttribs(attributes) {
    cy.get(categoryLocators.manageHierarchyModal, { timeout: 5000 })
      .should("be.visible")
      .within(() => {
        attributes.forEach((attrName) => {
          cy.contains(categoryLocators.attribNameAvailableList, attrName)
            .scrollIntoView()
            .should("be.visible");
        });
      });
  }

  dragAttributeToDependencyList(attrName) {
    cy.get(categoryLocators.attributeList)
      .should("be.visible")
      .then(($panel) => {
        const $item = Cypress.$($panel)
          .find("p")
          .filter((i, el) => {
            return Cypress.$(el).text().trim() === attrName;
          });

        const itemRect = $item[0].getBoundingClientRect();
        const itemX = itemRect.left + itemRect.width / 2;
        const itemY = itemRect.top + itemRect.height / 2;

        cy.get(categoryLocators.dependencyList).then(($target) => {
          const targetRect = $target[0].getBoundingClientRect();
          const targetX = targetRect.left + targetRect.width / 2;
          const targetY = targetRect.top + targetRect.height / 2;

          // Press down on attribute
          cy.wrap($item)
            .closest("[data-rfd-draggable-id]")
            .realMouseDown({ position: "center" })
            .wait(500);

          // Move gradually toward dependency list
          cy.get("body")
            .realMouseMove(itemX, itemY)
            .wait(100)
            .realMouseMove(itemX + 50, itemY)
            .wait(100)
            .realMouseMove(targetX, targetY)
            .wait(300);

          // Drop
          cy.get("body").realMouseUp();
        });
      });
  }

  // dragAttributeToDependencyList(attrName) {
  //   cy.get(categoryLocators.attributeList)
  //     .should("be.visible")
  //     .then(($panel) => {
  //       const $item = Cypress.$($panel)
  //         .find('[data-rfd-draggable-id^="hierarchy-"] > div > p')
  //         .filter((i, el) => {
  //           return Cypress.$(el).text().trim() === attrName;
  //         });

  //       // ✅ Explicit length check — clear error if attribute not found
  //       if ($item.length === 0) {
  //         throw new Error(
  //           `Attribute "${attrName}" not found in available attributes list. ` +
  //             `Check if the attribute exists or if the UI has changed.`,
  //         );
  //       }

  //       const itemRect = $item[0].getBoundingClientRect();
  //       const itemX = itemRect.left + itemRect.width / 2;
  //       const itemY = itemRect.top + itemRect.height / 2;

  //       cy.get(categoryLocators.dependencyList).then(($target) => {
  //         const targetRect = $target[0].getBoundingClientRect();
  //         const targetX = targetRect.left + targetRect.width / 2;
  //         const targetY = targetRect.top + targetRect.height / 2;

  //         // Press down on attribute
  //         cy.wrap($item)
  //           .closest("[data-rfd-draggable-id]")
  //           .find('[role="button"]')
  //           .realMouseDown({ position: "center" })
  //           .wait(500);

  //         // Move gradually toward dependency list
  //         cy.get("body")
  //           .realMouseMove(itemX, itemY)
  //           .wait(100)
  //           .realMouseMove(itemX + 50, itemY)
  //           .wait(100)
  //           .realMouseMove(targetX, targetY)
  //           .wait(300);

  //         // Drop
  //         cy.get("body").realMouseUp();
  //       });
  //     });
  // }

  dragAttributeFromDependencyList(attrName) {
    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .should("be.visible")
      .then(($el) => {
        // Find p only inside hierarchy-* draggable items — exact match
        const $item = Cypress.$($el)
          .find('[data-rfd-draggable-id^="hierarchy-"] > div > p')
          .filter((i, el) => {
            return Cypress.$(el).text().trim() === attrName; // exact match
          })
          .closest("[data-rfd-draggable-id]")
          .find('[role="button"]');

        if ($item.length === 0) {
          throw new Error(
            `Attribute "${attrName}" not found in dependency list`,
          );
        }

        const fromRect = $item[0].getBoundingClientRect();
        const fromX = fromRect.left + fromRect.width / 2;
        const fromY = fromRect.top + fromRect.height / 2;

        // Step 1 — press down on drag handle
        cy.wrap($item).realMouseDown({ position: "center" }).wait(500);

        // Step 2 — move left toward attribute list
        cy.get("body")
          .realMouseMove(fromX, fromY)
          .wait(100)
          .realMouseMove(fromX - 10, fromY)
          .wait(100)
          .realMouseMove(fromX - 50, fromY)
          .wait(100)
          .realMouseMove(fromX - 500, fromY)
          .wait(300);

        // Step 3 — drop
        cy.get("body").realMouseUp();
      });
  }

  verifyAttributeInDependencyList(attrName) {
    cy.get(categoryLocators.dependencyList).within(() => {
      cy.contains(categoryLocators.attribNameDependencyList, attrName).should(
        "be.visible",
      );

      // Ensure empty state message is gone
      cy.contains("No dependency relationships found").should("not.exist");
    });
  }

  verifyAttributeInAttributeList(attrName) {
    // Add this before verifyAttributeInAttributeList to log all droppable ids on page
    cy.get("[data-rfd-droppable-id]").each(($el) => {});
    cy.get('[data-rfd-droppable-id="available-attributes"]') // left panel droppable id
      .should("be.visible")
      .find("p")
      .filter((i, el) => {
        return Cypress.$(el).text().trim() === attrName;
      })
      .scrollIntoView()
      .should("exist")
      .and("be.visible");

    // Also verify it's NO longer in dependency list
    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .find("p")
      .filter((i, el) => {
        return Cypress.$(el).text().trim() === attrName;
      })
      .should("not.exist");
  }

  verifyAttributeNotInDependencyList(attrName) {
    // Also verify it's NO longer in dependency list
    cy.get('[data-rfd-droppable-id="dependency-list"]')
      .find("p")
      .filter((i, el) => {
        return Cypress.$(el).text().trim() === attrName;
      })
      .should("not.exist");
  }

  verifyDependencyUpdateMsg(expectedMsg) {
    cy.contains(expectedMsg).should("be.visible");
  }

  clickSaveBt() {
    cy.contains("button", /^Save$/).click();
  }

  clickSaveChanges() {
    cy.contains("button", /Save Changes/)
      .should("be.visible")
      .and("not.be.disabled")
      .click();
  }

  clickCancelButton() {
    cy.contains("button", /^Cancel$/)
      .should("be.visible")
      .click();
  }

  clickSaveAndAddAttrib() {
    cy.contains("Save & Add Attribute").click();
  }

  assertCreatedCatagory(catName) {
    cy.get("table").find("td").contains(catName).should("have.text", catName);
  }

  verifyCategories(catName) {
    return cy
      .get('tbody tr td[data-index="0"]')
      .should("have.length.greaterThan", 0) // Wait until at least one element is present
      .should(($tds) => {
        // Ensure at least one td has non-empty text
        expect($tds.text().trim()).not.to.be.empty;
      })
      .then(($tds) => {
        // Extract visible <td> texts
        const tdTexts = [...$tds].map((td) => td.innerText.trim());
        return Cypress.Promise.resolve(tdTexts.includes(catName)); // Return true/false as a Promise
      });
  }

  clickManageAttributes(catName) {
    categoryLocators.manageAttributeBtn(catName).should("be.visible").click();
  }

  clickManageHierarchy(catName) {
    categoryLocators.manageHierarchyBtn(catName).should("be.visible").click();
  }

  clickUpdateCat() {
    cy.findByRole("button", { name: /^Update$/i }).click();
    // Verify update success toast
    cy.contains("Category updated.", { timeout: 5000 }).should("be.visible");
    // Wait for the modal to close (indicates update completed)
    cy.get(categoryLocators.modalDialog).should("not.exist");
  }

  clickEditButton(catName) {
    cy.contains("tr", catName).within(() => {
      cy.contains("button", "Edit").click();
    });
  }

  clickDelCat(catName) { 
    
      cy.contains("tr", catName)
        .first()
        .within(() => {
          cy.get("button").contains("Delete").click();
        });
    cy.contains("button", /^Yes$/i).should("be.visible").click();
  }

  navigateToCategories() {
    cy.contains("Configuration").click();
    // Use force:true to survive the React re-render animation that detaches the
    // element between "found" and "actionable" checks after the submenu opens.
    cy.contains(/^Categories$/).click({ force: true });
  }

  checkAllowItems() {
    cy.get(categoryLocators.allowItemsToggle).check();
  }

  uncheckAllowItems() {
    cy.get(categoryLocators.allowItemsToggle).uncheck();
  }

  /**
   * Toggle Allow Items - enable or disable based on current state
   * @param {boolean} shouldBeEnabled - true to enable, false to disable
   */
  toggleAllowItems(shouldBeEnabled) {
    cy.get(categoryLocators.allowItemsToggle).then(($toggle) => {
      const isChecked = $toggle.is(":checked");
      const isDisabled = $toggle.is(":disabled");

      if (isDisabled) {
        cy.log(` Allow Items toggle is DISABLED - cannot change state`);
        throw new Error("Cannot toggle: Allow Items toggle is disabled");
      }

      if (shouldBeEnabled && !isChecked) {
        cy.get(categoryLocators.allowItemsToggle).check();
        // Verify the toggle actually changed
        cy.get(categoryLocators.allowItemsToggle).should("be.checked");
      } else if (!shouldBeEnabled && isChecked) {
        cy.get(categoryLocators.allowItemsToggle).uncheck();
        // Verify the toggle actually changed
        cy.get(categoryLocators.allowItemsToggle).should("not.be.checked");
      }
    });
  }

  clearAllProductNameTags() {
    const removeSelector = 'div[role="button"][aria-label^="Remove "]';

    const removeNext = () => {
      cy.get("body").then(($body) => {
        if ($body.find(removeSelector).length > 0) {
          cy.get(removeSelector).first().click({ force: true });
          cy.wait(100);
          removeNext();
        }
      });
    };

    removeNext();
  }

  /**
   * Assert Allow Items toggle state
   * @param {string} state - "enabled", "disabled", "checked", "unchecked"
   */
  assertAllowItemsToggle(state) {
    const toggle = cy.get(categoryLocators.allowItemsToggle);
    switch (state) {
      case "enabled":
        return toggle.should("not.be.disabled");
      case "disabled":
        return toggle.should("be.disabled");
      case "checked":
        return toggle.should("be.checked");
      case "unchecked":
        return toggle.should("not.be.checked");
      default:
        throw new Error(`Unknown state: ${state}`);
    }
  }

  assertCategoryCreatedToast() {
    cy.contains("Category created.", { timeout: 10000 }).should("be.visible");
  }

  /**
   * Assert toast message with custom text
   * @param {string|RegExp} message - Expected toast message
   * @param {number} timeout - Optional timeout (default: 10000)
   */
  assertToast(message, timeout = 10000) {
    cy.contains(message, { timeout }).should("be.visible");
  }

  /**
   * Click sort icon for a column and wait for API response
   * @param {string} columnName - Column name (e.g., "Category Name")
   * @param {string} alias - cy.intercept alias to wait for
   */
  clickSortColumn(columnName, alias = "@catReq") {
    categoryLocators.sortLabelByColumn(columnName).first().click();
    cy.wait(alias);
  }

  /**
   * Sort column to descending order (handles 3-click MaterialReactTable cycle)
   * @param {string} columnName - Column name to sort
   * @param {string} alias - cy.intercept alias
   */
  sortColumnDescending(columnName, alias = "@catReq") {
    // Click once
    this.clickSortColumn(columnName, alias);
    cy.get(categoryLocators.tableRows).should("have.length.at.least", 1);

    // Click twice
    this.clickSortColumn(columnName, alias);
    cy.get(categoryLocators.tableRows).should("have.length.at.least", 1);

    // Check if we need a third click
    categoryLocators
      .sortLabelByColumn(columnName)
      .first()
      .then(($btn) => {
        const ariaLabel = ($btn.attr("aria-label") || "").toLowerCase();

        if (
          !ariaLabel.includes("descending") &&
          !ariaLabel.includes("sorted descending")
        ) {
          // Need third click to get to descending
          cy.wrap($btn).click();
          cy.wait(alias);
          cy.get(categoryLocators.tableRows).should("have.length.at.least", 1);
        } else {
          cy.log("✓ Table sorted in descending order");
        }
      });
  }

  /**
   * Get all category names from the first column
   * @returns {Cypress.Chainable<string[]>} Array of category names
   */
  getCategoryNames() {
    return cy.get(categoryLocators.firstColumnCells).then(($cells) => {
      return [...$cells].map((td) => td.innerText.trim()).filter(Boolean);
    });
  }

  /**
   * Assert categories are sorted with "Default" pinned at top
   * @param {string} order - "asc" or "desc"
   */
  assertCategoriesSorted(order) {
    this.getCategoryNames().then((names) => {
      const rest = names.filter((n) => n !== "Default");
      const sortedRest = [...rest].sort((a, b) => {
        if (order === "asc") {
          return a.localeCompare(b, undefined, { sensitivity: "base" });
        } else {
          return b.localeCompare(a, undefined, { sensitivity: "base" });
        }
      });

      const expected = names.includes("Default")
        ? ["Default", ...sortedRest]
        : sortedRest;
      expect(names).to.deep.equal(expected);
    });
  }

  /**
   * Assert name field has validation error
   */
  assertNameFieldError() {
    cy.get(categoryLocators.nameInput)
      .closest(".MuiOutlinedInput-root")
      .should("have.class", "Mui-error");
  }

  /**
   * Click Cancel button in modal
   */
  clickCancel() {
    categoryLocators.cancelButton().click();
  }

  /**
   * Assert name input field is not visible (modal closed)
   */
  assertModalClosed() {
    cy.get(categoryLocators.nameInput).should("not.exist");
  }

  /**
   * Assert modal/dialog is visible
   */
  assertModalVisible() {
    cy.get(categoryLocators.modalDialog).should("be.visible");
  }

  /**
   * Assert modal/dialog is not visible
   */
  assertModalNotVisible() {
    cy.get(categoryLocators.modalDialog, { timeout: 8000 }).should("not.exist");
  }

  /**
   * Assert name input field properties
   * @param {Object} properties - e.g., { visible: true, type: "text" }
   */
  assertNameFieldProperties(properties = {}) {
    let assertion = cy.get(categoryLocators.nameInput);

    if (properties.visible !== undefined) {
      assertion = properties.visible
        ? assertion.should("be.visible")
        : assertion.should("not.be.visible");
    }
    if (properties.type) {
      assertion = assertion.should("have.attr", "type", properties.type);
    }
    if (properties.exists !== undefined) {
      assertion = properties.exists
        ? assertion.should("exist")
        : assertion.should("not.exist");
    }

    return assertion;
  }

  /**
   * Assert button is visible
   * @param {string} buttonName - "Save", "Cancel", "Save & Add Attribute", etc.
   */
  assertButtonVisible(buttonName) {
    cy.contains("button", new RegExp(buttonName, "i")).should("be.visible");
  }

  /**
   * Assert URL contains text
   * @param {string} text - Text that should be in URL
   * @param {number} timeout - Optional timeout
   */
  assertUrlContains(text, timeout = 10000) {
    cy.url({ timeout }).should("include", text);
  }

  /**
   * Assert breadcrumb or page text is visible
   * @param {string|RegExp} text - Text to find
   */
  assertTextVisible(text) {
    cy.contains(text).should("be.visible");
  }

  /**
   * Cancel category deletion (click Delete then No)
   * @param {string} catName - Category name
   */
  cancelDeletion(catName) {
    cy.contains("tr", catName).within(() => cy.contains(/Delete/i).click());
    cy.get(categoryLocators.dialogActions, { timeout: 8000 })
      .should("be.visible")
      .within(() => {
        categoryLocators.noButton().should("be.visible").click();
      });
    this.assertModalNotVisible();
  }

  /**
   * Try to delete category and expect error (click Delete then Yes)
   * @param {string} catName - Category name
   */
  tryDeleteAndExpectError(catName) {
    cy.contains("tr", catName).within(() => cy.contains(/Delete/i).click());
    cy.get(categoryLocators.dialogActions, { timeout: 8000 })
      .should("be.visible")
      .within(() => {
        categoryLocators.yesButton().should("be.visible").click();
      });
    this.assertToast(/cannot be deleted|has associated data/i);
  }


  /**
   * Assert delete confirmation dialog
   */
  assertDeleteConfirmationDialog() {
    this.assertModalVisible();
    cy.get(categoryLocators.dialogActions).within(() => {
      categoryLocators.yesButton().should("be.visible");
      categoryLocators.noButton().should("be.visible");
    });
  }

  assertCatEdit(updatedCatName) {
    cy.get("table")
      .find("td")
      .contains(updatedCatName)
      .should("have.text", updatedCatName);
  }

  assertCatDelete(catName) {
    cy.get("table").find("td").contains(catName).should("not.exist", catName);
  }

  addTextAttrib(attribName) {}

  // ─── Product Name Modal Methods ─────────────────────────────────────────────

  /**
   * Click "Manage Product Name" button for a specific category
   * @param {string} catName - category name in the row
   */
  clickManageProductName(catName) {
    categoryLocators.manageProductNameBtn(catName).should("be.visible").click();
  }

  /**
   * Assert the Product Name modal is open and has the correct title
   */
  assertProductNameModalOpen() {
    cy.get(categoryLocators.productNameModal, { timeout: 10000 }).should(
      "be.visible",
    );
  }

  /**
   * Click inside the Product Name dropdown field to open the options list
   */
  openProductNameDropdown() {
    cy.get(categoryLocators.productNameDropdownInput)
      .should("exist")
      .click({ force: true });
  }

  /**
   * Assert that the dropdown options list contains an attribute name
   * @param {string} attrName - attribute name to look for
   */
  assertDropdownContains(attrName) {
    cy.get(categoryLocators.productNameOptionsList, { timeout: 8000 })
      .should("be.visible")
      .contains(new RegExp(`^\\s*${attrName}\\s*$`, "i"))
      .should("exist");
  }

  /**
   * Assert that the dropdown options list does NOT contain an attribute name
   * @param {string} attrName - attribute name that should be absent
   */
  assertDropdownNotContains(attrName) {
    // For not containing, it's safer to check the parent's text doesn't contain it if it's an exact word,
    // or use a custom filter. But standard Cypress handling for exact negative is:
    cy.get(categoryLocators.productNameOptionsList, { timeout: 8000 })
      .should("be.visible")
      .invoke("text")
      .then((text) => {
        expect(text.toLowerCase()).not.to.contain(attrName.toLowerCase());
      });
  }

  /**
   * Select an attribute from the dropdown options list
   * @param {string} attrName - exact attribute option text
   */
  selectProductNameAttribute(attrName) {
    this.openProductNameDropdown();
    cy.get(categoryLocators.productNameOptionsList, { timeout: 8000 })
      .scrollIntoView()
      .should("be.visible")
      .contains(new RegExp(`^${attrName}$`, "i"))
      .click();
  }

  /**
   * Type a custom text value and click the "Create '…'" option to add it as a tag
   * @param {string} customText - text to type and create
   */
  addCustomTextTag(customText) {
    cy.get(categoryLocators.productNameDropdownInput)
      .first()
      .click()
      .type(customText);
    cy.get(categoryLocators.productNameOptionsList, { timeout: 8000 })
      .should("be.visible")
      .contains(new RegExp(`Create.*${customText}`, "i"))
      .click();
  }

  /**
   * Remove a tag/chip that is already selected in the Product Name field
   * by clicking its 'x' (delete icon)
   * @param {string} tagLabel - label text of the chip to remove
   */
  removeProductNameTag(tagLabel) {
    cy.get(`div[role="button"][aria-label="Remove ${tagLabel}"]`).click();
  }



  /**
   * Click the Save button inside the Product Name modal
   */
  saveProductNameConfig() {
    categoryLocators.productNameSaveBtn().click();
  }

  /**
   * Assert a tag/chip is visible inside the Product Name modal
   * @param {string} tagLabel - label text of the chip
   */
  assertProductNameTagVisible(tagLabel) {
    cy.get(categoryLocators.productNameModal)
      .should("be.visible")
      .should("contain.text", tagLabel);
  }

  assertProductNameTagNotVisible(tagLabel) {
    cy.get(categoryLocators.productNameModal)
      .should("be.visible")
      .should("not.contain.text", tagLabel);
  }

  /**
   * Assert the Product Name field inside the modal is empty (no chips)
   */
  assertProductNameFieldEmpty() {
    cy.get("#product-name-form")
      .find('[class*="-multiValue"]')
      .should("not.exist");
  }

  assertProductNameModalClosed() {
    cy.get(categoryLocators.productNameModal, { timeout: 8000 }).should(
      "not.exist",
    );
  }

  clickRowsPerPage() {
    cy.get(categoryLocators.rowsDropDown).click();

    cy.contains("40").click();
  }

  assertItems(catAttribsJson) {
    let count;

    // Intercept the API call and wait for the response
    cy.intercept("GET", "/attributes*").as("catAttribAPIdata");
    cy.wait("@catAttribAPIdata").then((interception) => {
      // Access the response data
      const responseBody = interception.response.body;
      count = responseBody.data.pagination.count;

      for (let index = 0; index < count; index++) {
        cy.get(`tr[data-index="${index}"] td[data-index="0"] p`)
          .invoke("text")
          .then((actualName) => {
            cy.get(`tr[data-index="${index}"] td[data-index="1"] p`)
              .invoke("text")
              .then((actualType) => {
                // Update only if item matches; do not set to false if it does not match
                catAttribsJson.forEach((item) => {
                  if (item.name === actualName && item.type === actualType) {
                    item.created = true;
                  }
                });
              });
          });
      }

      cy.wrap(catAttribsJson).each((item) => {
        if (!item.created) {
          cy.log(`Assertion failed: ${item.name} was not created.`);
        }
        expect(item.created).to.be.true;
      });
    });
  }
}

export default CategoryPage;
