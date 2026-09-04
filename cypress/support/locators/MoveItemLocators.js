// Locators for the Move Item flow:
//   ItemActionMenu.tsx  — row ⋮ button + "Move Item" menu option
//   MoveItemModel.tsx   — dialog, PO selector, confirm step, success/error toast
//   ProductTableSelector.tsx — product search within the dialog

export const MoveItemLocators = {
  // Row action menu (shared id="long-button" across all item-action menus)
  itemLongButton: 'button[id="long-button"]',
  itemRowMenu: '[role="menu"]',

  // "Move Item" menu option — singular label, inside a <li>
  moveItemMenuItem: 'Move Item',

  // Move Items dialog — PO react-select (note intentional typo in id from source)
  poDropdownId: '#Incomming-inventory-P-O-1',
  poDropdownInput: '#Incomming-inventory-P-O-1 input',
  // react-select portal renders OUTSIDE the dialog; query globally
  poDropdownMenu: '[class*="-menu"]',

  // ProductTableSelector inside the Move Items dialog
  productSearchInput: 'input[placeholder="Search Products"]',
  productSearchBtnText: 'Search',
  productListItem: 'li.MuiListItem-root',
  selectedIndicator: 'Selected',

  // Confirm-move secondary dialog
  confirmMoveDialogTitle: 'Confirm Item Move',
  moveBtnText: /^Move$/i,
  cancelBtnText: /^Cancel$/i,

  // Toasts
  successToastText: 'Items moved successfully',
};

export default MoveItemLocators;
