/**
 * AddItemLocators.js
 * Locators for the Add Item form (Frontend/src/components/Item/ItemForm.tsx)
 * and the trigger button on the ItemView page
 * (Frontend/src/components/Item/itemViewItemList.tsx).
 *
 * NOTE — serial input is a plain TextareaAutosize bound to RHF field
 * "scannerInput". There is no chip UI; serials are split by /[\s,]+/
 * at submit time inside ItemForm.tsx.
 */

export const AddItemLocators = {
  // Trigger on ItemView (rendered as <IMSButton>Add Item</IMSButton>)
  addItemButton: 'button:contains("Add Item")',

  // Form (mounted on /incoming-inventory/:productName/:id/add-item(s))
  formContainer: '#item-form',
  serialInput: 'textarea[name="scannerInput"]',
  costInput: 'input[name="cost"]',
  priceInput: 'input[name="price"]',
  clearAllButton: 'button:contains("Clear All")',

  // Item attributes that are marked required in this environment. RHF registers
  // every attribute by its fieldName (ItemForm.tsx), so they follow the same
  // name= convention as cost/price. handleSubmit refuses to run onSubmit while
  // either is empty, which suppresses BOTH the POST and the FE toast.
  assetTagIdInput: 'input[name="assetTagId"]',
  assetSecurityCodeInput: 'input[name="assetSecurityCode"]',

  // FormFooter buttons (Frontend/src/components/common/FormFooter.tsx)
  saveButton: 'button[form="item-form"][type="submit"]',
  cancelButton: 'button:contains("Cancel")',
};

export default AddItemLocators;
