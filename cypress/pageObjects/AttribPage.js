import {
  ItemAttribLocators,
  ListRowInputLoc,
} from "../support/locators/itemAttribLocators";
require("cypress-xpath");
class AttribPage {
  // ─── Navigation ────────────────────────────────────────────────

  clickAttribOption() {
    cy.contains(ItemAttribLocators.configurationNavTxt).click();
    cy.contains(ItemAttribLocators.itemAttribOptionTxt).click();
  }

  clickConfigurationOption() {
    cy.contains(ItemAttribLocators.configurationNavTxt).click();
  }

  clickAddAttribute() {
    ItemAttribLocators.addAttribute().click();
  }

  setPayloadFieldName(rowIndex, fieldName) {
    this.getPayloadRows()
      .eq(rowIndex)
      .within(() => {
        cy.get('input[type="text"]')
          .should("be.visible")
          .click()
          .type("{selectAll}{backspace}", { delay: 50 })
          .should("have.value", "")
          .wait(200) // 👈 let React settle
          .type(fieldName, { delay: 50 })
          .should("have.value", fieldName);
      });
  }
  // ─── Form Inputs ──────────────────────────────────────────────

  typeAttributeName(itemName) {
    cy.contains(ItemAttribLocators.attributeFormLabel)
      .scrollIntoView()
      .should("be.visible")
      .then(() => {
        // Wait for React to fully reset the input before typing
        cy.get(ItemAttribLocators.itemName).should("have.value", "");
        cy.get(ItemAttribLocators.itemName).type(itemName, { delay: 50 });
      });
  }

  editItemName(itemName) {
    cy.contains(ItemAttribLocators.attributeFormLabel)
      .scrollIntoView()
      .should("be.visible")
      .then(() => {
        cy.get(ItemAttribLocators.itemName)
          .invoke("val", "")
          .trigger("input")
          .trigger("change")
          .type(itemName, { delay: 50 });
      });
  }

  getAttributeRow(attributeName) {
    return cy.contains("tbody tr", attributeName);
  }

  assertAttributeType(attributeName, expectedType) {
    this.getAttributeRow(attributeName).within(() => {
      cy.get("td:nth-child(2) p").should("have.text", expectedType);
    });
  }

  assertAttributeRequired(attributeName, expectedRequired) {
    this.getAttributeRow(attributeName).within(() => {
      cy.get("td:nth-child(3) p").should("have.text", expectedRequired);
    });
  }

  clearAttributeName() {
    cy.get(ItemAttribLocators.itemName).clear();
  }

  typeDefaultValue(defaultValue) {
    cy.get(ItemAttribLocators.itemDefaultValue).clear().type(defaultValue);
  }

  clearDefaultValue() {
    cy.get(ItemAttribLocators.itemDefaultValue).clear();
  }

  typeMinLength(minLength) {
    cy.get(ItemAttribLocators.minLengthTxtBox).clear();
    cy.get(ItemAttribLocators.minLengthTxtBox).type(minLength);
  }

  typeMaxLength(maxLength) {
    cy.get(ItemAttribLocators.maxLengthTxtBox).clear();
    cy.get(ItemAttribLocators.maxLengthTxtBox).type(maxLength);
  }

  typeMinValue(minVal) {
    cy.get(ItemAttribLocators.minValueTxtBox).clear().type(minVal);
  }

  typeMaxValue(maxVal) {
    cy.get(ItemAttribLocators.maxValueTxtBox).clear().type(maxVal);
  }

  // ─── Type Selector (react-select) ─────────────────────────────

  clickSelect() {
    cy.get(ItemAttribLocators.select).first().click();
  }

  clickSelectOption(option) {
    cy.get(ItemAttribLocators.selectOpt)
      .contains(option)
      .scrollIntoView()
      .click();
  }

  selectType(typeName) {
    this.clickSelect();
    this.clickSelectOption(typeName);
  }

  assertSelectedType(expectedType) {
    cy.get(ItemAttribLocators.selectSingleValue)
      .first()
      .should("contain.text", expectedType);
  }

  assertTypeDisabled() {
    // In edit mode the react-select is disabled
    cy.get(ItemAttribLocators.selectControl)
      .first()
      .should("have.class", "select__control--is-disabled");
  }

  selectItemType() {
    cy.get(ItemAttribLocators.select).first().click();
  }

  // ─── V-Lookup ─────────────────────────────────────────────────

  enableVLookupToggle() {
    cy.contains(ItemAttribLocators.vLookupToggleLabel)
      .parent()
      .find(ItemAttribLocators.vLookupToggleInput)
      .click();
  }

  assertVLookupType(expectedType) {
    cy.get(ItemAttribLocators.vLookupTypeDropdown)
      .first()
      .should("contain.text", expectedType);
  }

  selectVLookupType(typeName) {
    cy.get(ItemAttribLocators.vLookupTypeDropdown).first().click();
    cy.get(ItemAttribLocators.menuItemRoot).contains(typeName).click();
  }

  typeVLookupKey(key) {
    cy.get(ItemAttribLocators.vLookupKeyInput).first().clear().type(key);
  }

  typeVLookupValue(value) {
    cy.get(ItemAttribLocators.vLookupValueInput).first().clear().type(value);
  }

  assertVLookupKey(expectedKey) {
    cy.get(ItemAttribLocators.vLookupKeyInput)
      .first()
      .should("have.value", expectedKey);
  }

  assertVLookupValue(expectedValue) {
    cy.get(ItemAttribLocators.vLookupValueInput)
      .first()
      .should("have.value", expectedValue);
  }

  clickVLookupAddMore() {
    // The V-Lookup "Add More" is a button inside the V-Lookup section
    cy.contains(ItemAttribLocators.vLookupToggleLabel)
      .parents("form")
      .contains("button", ItemAttribLocators.vLookupAddMoreText)
      .click();
  }

  typeVLookupKeyAt(index, key) {
    cy.get(ItemAttribLocators.vLookupKeyInput).eq(index).clear().type(key);
  }

  typeVLookupValueAt(index, value) {
    cy.get(ItemAttribLocators.vLookupValueInput).eq(index).clear().type(value);
  }

  // ─── Toggles / Checkboxes ─────────────────────────────────────

  clickRequired() {
    // Ensure the Required switch ends up in the ON (checked) state.
    // Uses cypress-real-events realClick() to avoid MUI double-toggle.
    cy.get(ItemAttribLocators.requiredCheckBox).then(($input) => {
      if (!$input[0].checked) {
        cy.wrap($input).realClick();
      }
    });
  }

  disableRequired() {
    // Ensure Required switch ends up OFF.
    cy.get(ItemAttribLocators.requiredCheckBox).then(($input) => {
      if ($input[0].checked) {
        cy.wrap($input).realClick();
      }
    });
  }

  assertRequiredChecked() {
    cy.get(ItemAttribLocators.requiredCheckBox).should("be.checked");
  }

  assertRequiredUnchecked() {
    cy.get(ItemAttribLocators.requiredCheckBox).should("not.be.checked");
  }

  clickPreventDuplicate() {
    cy.contains("label", ItemAttribLocators.preventDupLabel)
      .parent()
      .find(ItemAttribLocators.checkboxInput)
      .then(($input) => {
        if (!$input[0].checked) {
          cy.wrap($input).realClick();
        }
      });
  }

  disablePreventDuplicate() {
    cy.contains("label", ItemAttribLocators.preventDupLabel)
      .parent()
      .find(ItemAttribLocators.checkboxInput)
      .then(($input) => {
        if ($input[0].checked) {
          cy.wrap($input).realClick();
        }
      });
  }

  assertPreventDuplicateChecked() {
    cy.contains("label", ItemAttribLocators.preventDupLabel)
      .parent()
      .find(ItemAttribLocators.checkboxInput)
      .should("be.checked");
  }

  assertPreventDuplicateUnchecked() {
    cy.contains("label", ItemAttribLocators.preventDupLabel)
      .parent()
      .find(ItemAttribLocators.checkboxInput)
      .should("not.be.checked");
  }

  clickCheckedByDefault() {
    cy.contains("label", ItemAttribLocators.checkedByDefaultLabel)
      .parent()
      .find(ItemAttribLocators.checkboxInput)
      .click();
  }

  // ─── Form Buttons ─────────────────────────────────────────────

  clickSaveBt() {
    // Match only the "Save" button, not "Save & Add New".
    cy.get(ItemAttribLocators.submitBt)
      .not(ItemAttribLocators.submitExcludeAddNew)
      .contains(ItemAttribLocators.saveBtText)
      .click();
  }

  clickSaveandAddNew() {
    cy.get(ItemAttribLocators.submitBt)
      .contains(ItemAttribLocators.saveAndAddNewText)
      .click();
  }

  clickUpdateBt() {
    cy.get(ItemAttribLocators.updateBt)
      .should("contain.text", "Update")
      .click();
  }

  clickCancelBt() {
    cy.contains(
      ItemAttribLocators.cancelBt,
      ItemAttribLocators.cancelBtText,
    ).click();
  }

  confirmYesButton() {
    cy.contains('button', /^Yes$/i)
      .should('be.visible')
      .click();
  }

  confirmDeleteButton() {
    // Some confirmation dialogs use "Confirm" instead of "Yes"
    cy.get(ItemAttribLocators.confirmDialog)
      .should("be.visible")
      .within(() => {
        cy.get("button")
          .contains(ItemAttribLocators.confirmPattern)
          .should("be.visible")
          .and("not.be.disabled")
          .click();
      });
  }

  // ─── Assertions ───────────────────────────────────────────────

  assertToast(message, timeout = 10000) {
    cy.contains(message, { timeout }).should("be.visible");

  }

  assertCannotDeleteToast(attributeName) {
    // Assert that error message appears: Attribute "X" cannot be deleted because it has associated data.
    const expectedMessage = `Attribute "${attributeName}" cannot be deleted because it has associated data.`;
    this.assertToast(expectedMessage);
  }

  assertNoToast(message) {
      cy.contains(message, { timeout: 5000 }).should("not.exist");
  }

  waitForToastToDisappear(message, timeout = 7000) {
    cy.contains(message, { timeout }).should("not.exist");
  }

  assertAttributeInList(itemName) {
    cy.get(ItemAttribLocators.tableRow)
      .filter(`:has(${ItemAttribLocators.rowText}:contains("${itemName}"))`)
      .should("exist");
  }

  assertAttributeNotInList(itemName) {
    cy.get(ItemAttribLocators.tableRow)
      .filter(`:has(${ItemAttribLocators.rowText}:contains("${itemName}"))`)
      .should("not.exist");
  }

  assertAttributeTypeInList(itemName, expectedType) {
    cy.get(ItemAttribLocators.tableRow)
      .filter(`:has(${ItemAttribLocators.rowText}:contains("${itemName}"))`)
      .first()
      .within(() => {
        cy.get(ItemAttribLocators.tableCell)
          .contains(expectedType)
          .should("exist");
      });
  }

  assertRequiredInList(itemName, expectedValue) {
    cy.get(ItemAttribLocators.tableRow)
      .filter(`:has(${ItemAttribLocators.rowText}:contains("${itemName}"))`)
      .first()
      .within(() => {
        cy.get(ItemAttribLocators.tableCell)
          .eq(2)
          .find(ItemAttribLocators.rowText)
          .should("have.text", expectedValue);
      });
  }

  assertUrlandItemName(itemName) {
    this.assertAttributeInList(itemName);
  }

  assertCatUrlAndAttrib(itemName) {
    cy.url()
      .should("match", /\/configurations\/category\/category-attributes\/.+/)
      .then(() => {
        this.assertAttributeInList(itemName);
      });
  }

  assertFieldValue(locator, expectedValue) {
    cy.get(locator).should("have.value", expectedValue);
  }

  assertMinLength(expectedValue) {
    this.assertFieldValue(ItemAttribLocators.minLengthTxtBox, expectedValue);
  }

  assertMaxLength(expectedValue) {
    this.assertFieldValue(ItemAttribLocators.maxLengthTxtBox, expectedValue);
  }

  assertMinValue(expectedValue) {
    this.assertFieldValue(ItemAttribLocators.minValueTxtBox, expectedValue);
  }

  assertMaxValue(expectedValue) {
    this.assertFieldValue(ItemAttribLocators.maxValueTxtBox, expectedValue);
  }

  assertDefaultValue(expectedValue) {
    this.assertFieldValue(ItemAttribLocators.itemDefaultValue, expectedValue);
  }

  assertAttributeNameLoaded(expectedName) {
    cy.get(ItemAttribLocators.itemName).should("have.value", expectedName);
  }

  assertDeletion(updatedItemName) {
    cy.xpath(`//tr[td/p[text()='${updatedItemName}']]`).should("not.exist");
  }

  assertFormVisible() {
    cy.get(ItemAttribLocators.formElement).should("be.visible");
  }

  assertNameFieldEmpty() {
    cy.get(ItemAttribLocators.itemName).should("have.value", "");
  }

  assertDefaultValueFieldEmpty() {
    cy.get(ItemAttribLocators.itemDefaultValue).should("have.value", "");
  }

  assertFieldDisabled(locator) {
    cy.get(locator).should("be.disabled");
  }

  assertDefaultValueDisabled() {
    cy.get(ItemAttribLocators.itemDefaultValue).should("be.disabled");
  }

  assertMinLengthDisabled() {
    cy.get(ItemAttribLocators.minLengthTxtBox).should("be.disabled");
  }

  assertMaxLengthDisabled() {
    cy.get(ItemAttribLocators.maxLengthTxtBox).should("be.disabled");
  }

  assertMinValueDisabled() {
    cy.get(ItemAttribLocators.minValueTxtBox).should("be.disabled");
  }

  assertMaxValueDisabled() {
    cy.get(ItemAttribLocators.maxValueTxtBox).should("be.disabled");
  }

  assertValidationError(errorText) {
    cy.contains(errorText, { timeout: 5000 }).should("be.visible");
  }

  assertNoValidationError(errorText) {
    cy.contains(errorText).should("not.exist");
  }

  // ─── Table Row Actions ────────────────────────────────────────

  editAttribute(itemName) {
    cy.contains(ItemAttribLocators.tableRow, itemName)
      .first()
      .within(() => {
        cy.get("button").contains(ItemAttribLocators.editBt).click();
      });
  }

  deleteAttribute(updatedItemName) {
    cy.contains(ItemAttribLocators.tableRow, updatedItemName)
      .first()
      .within(() => {
        cy.get("button").contains(ItemAttribLocators.deleteBt).click();
      });
    this.confirmYesButton();
  }

  deleteAttributeIfExists(name) {
    cy.get(ItemAttribLocators.tableRow)
      .should("exist")
      .then(() => {
        cy.get("body").then(($body) => {
          if ($body.find(`tr:has(p:contains("${name}"))`).length > 0) {
            this.deleteAttribute(name);
          }
        });
      });
  }

  tryDeleteAttribute(attrName) {
    cy.get("body").then(($body) => {
      const $row = $body.find(`tr:contains("${attrName}")`);
      if ($row.length === 0) {
        cy.log(`"${attrName}" not found, skipping.`);
        return;
      }
      const $deleteBtn = $row.find('button:contains("Delete")');
      if ($deleteBtn.length === 0 || $deleteBtn.is(":disabled")) {
        cy.log(`⚠ Delete disabled for "${attrName}", skipping.`);
        return;
      }
      cy.contains(ItemAttribLocators.tableRow, attrName)
        .first()
        .within(() => {
          cy.get("button").contains(ItemAttribLocators.deleteBt).click();
        });
      // Wait for dialog, click Yes
      cy.get(".MuiDialog-root", { timeout: 8000 }).should("be.visible");
      this.confirmYesButton();
      // Wait for dialog to close
      cy.get(".MuiDialog-root", { timeout: 8000 }).should("not.exist");
      // Wait for "Attribute Deleted" toast to appear then disappear
      cy.contains("Attribute Deleted", { timeout: 10000 }).should("be.visible");
      cy.contains("Attribute Deleted", { timeout: 10000 }).should("not.exist");
    });
  }

  // ─── Category ─────────────────────────────────────────────────

  typeCatName(catName) {
    cy.contains(ItemAttribLocators.addCategoryDialogTxt)
      .should("be.visible")
      .then(() => {
        cy.get(ItemAttribLocators.itemName).type(catName);
      });
  }

  navigateToCategoryAttributes(catName) {
    cy.contains(ItemAttribLocators.configurationNavTxt).click();
    cy.contains(ItemAttribLocators.categoriesNavTxt)
      .should("be.visible")
      .click();
    cy.contains(ItemAttribLocators.tableCell, catName, { timeout: 5000 })
      .closest(ItemAttribLocators.tableRow)
      .within(() => {
        cy.contains("button", ItemAttribLocators.manageAttributeBt).click();
      });
    cy.url().should("include", "/category-attributes/");
  }

  // ─── List Rows / Bulk ─────────────────────────────────────────

  clickAddmoreBt() {
    cy.get(ItemAttribLocators.addMoreBt).click();
  }

  waitForListRowsToRender() {
    cy.get(ListRowInputLoc(0)).should("exist");
  }

  typeInListRows(dataArray) {
    dataArray.forEach((data, index) => {
      cy.get(ListRowInputLoc(index)).clear().type(data);
    });
  }

  typeListOption(index, value) {
    cy.get(ListRowInputLoc(index)).clear().type(value);
  }

  typeFirstEmptyListOption(value) {
    cy.get('input[id^="listOptions."][id$=".label"][value=""]')
      .first()
      .clear()
      .type(value);
  }

  assertListOption(index, expectedValue) {
    cy.get(ListRowInputLoc(index)).should("have.value", expectedValue);
  }

  clickAddRow() {
    this.clickAddmoreBt();
    cy.get(ItemAttribLocators.addMoreMenu).should("be.visible");
    cy.contains(ItemAttribLocators.addRowText).click();
  }

  clickAddBulkList() {
    this.clickAddmoreBt();
    cy.contains(ItemAttribLocators.bulkAdditionText).click();
  }

  typeBulkAddition(text) {
    cy.get(ItemAttribLocators.bulkAdditionTextarea).type(text);
  }

  confirmBulkAddition() {
    cy.contains("button", ItemAttribLocators.bulkAddConfirmPattern).should("be.visible").click();
  }

  assertBulkAdditionModalOpen() {
    cy.get('label[for="bulkAddition"]')
      .should("exist")
      .and("contain", "Bulk Addition");
  }

  closeBulkAdditionModal() {
    cy.get(ItemAttribLocators.bulkAdditionTextarea).should("be.visible");
    cy.get("body").type("{esc}");
    cy.get(ItemAttribLocators.bulkAdditionTextarea).should("not.exist");
  }

  assertDeleteDisabled(attrName) {
    cy.get(ItemAttribLocators.tableRow)
      .filter(`:has(${ItemAttribLocators.rowText}:contains("${attrName}"))`)
      .first()
      .within(() => {
        cy.get("button")
          .contains(ItemAttribLocators.deleteBt)
          .should("be.disabled");
      });
  }

  deleteListOption(index) {
    cy.get(ListRowInputLoc(index))
      .closest(ItemAttribLocators.listOptionStack)
      .siblings("button")
      .click();
  }

  // ─── Import Attributes ────────────────────────────────────────

  clickThreeDotsMenu() {
    // Multiple tabs (Product/Variant/Item) each render ImportExportMenu with
    // id="basic-button". Non-active tab panels have display:none so filter to
    // the visible button before clicking.
    cy.get("button#basic-button", { timeout: 8000 })
      .filter(':visible')
      .first()
      .should("be.visible")
      .click();
  }

  clickImportAttributes() {
    cy.contains("Import Attributes", { timeout: 4000 })
      .should("be.visible")
      .click();
  }

  uploadAttributeFile(filePath) {
    cy.get('input[type="file"]').should("not.be.disabled");

    cy.get('input[type="file"]', { timeout: 4000 }).selectFile(filePath, {
      force: true,
    });
  }

  importAttributesFromFile(filePath) {
    this.clickThreeDotsMenu();
    this.clickImportAttributes();
    this.uploadAttributeFile(filePath);

  }

  // ─── Tab Navigation ───────────────────────────────────────────

  clickProductAttributes() {
    cy.get(ItemAttribLocators.productTab).click();
  }

  clickVariantAttributes() {
    cy.get(ItemAttribLocators.variantTab).scrollIntoView().click();
  }

  clickItemAttributes() {
    cy.get(ItemAttribLocators.itemTab).scrollIntoView().click();
  }
}

export default AttribPage;
