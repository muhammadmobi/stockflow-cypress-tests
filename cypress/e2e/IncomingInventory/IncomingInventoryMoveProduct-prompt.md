# Incoming Inventory Move Product — E2E Automation Prompt

## Objective
Automate the "Incoming Inventory Move Product" feature using Cypress E2E tests. This feature allows users to move a product or its items from one Purchase Order (PO) to another within the Incoming Inventory workflow.

---

## Acceptance Criteria

| Item | Value |
|------|-------|
| **UI Route** | `/incoming-inventory` |
| **API Route** | `POST /products/product-shift` |
| **Business Rule** | Move Product is only available when a specific PO is selected (not "All POs") |
| **Business Rule** | Move Product is only available from `/incoming-inventory` route (not from `/inventory`) |
| **Business Rule** | For product-only categories: requires `newPO`, `productId`, and `oldPO` |
| **Business Rule** | For product-with-items categories: requires `newPO`, `productId`, `newProductId` (target), and `oldPO` |
| **Business Rule** | A confirmation dialog appears before the move operation |
| **Business Rule** | Success toast appears: "Product moved successfully!" |

---

## Test Design (ISTQB Techniques)

### Use Case Testing (Functional)
- **TC01 — Move Product Only**: Move a product-only (RAM/DDR4) from Source PO to Target PO, verify success.
- **TC02 — Move Product with Items**: Move product items (Laptop with serials) from Source PO to Target PO, verify items moved.
- **TC03 — Cancel Move**: Open move dialog, select target PO, click Cancel, verify product remains in source PO.

### Equivalence Partitioning (Negative)
- **TC04 — Empty Target PO**: Attempt move without selecting target PO, verify validation error.
- **TC05 — Same Source and Target PO**: Attempt to move product to the same PO it's already in, verify behavior.

### Boundary Value Analysis
- **TC06 — Minimum Data**: Move product with qty=1, verify successful move.
- **TC07 — Large Quantity**: Move product with large quantity (e.g., 999), verify successful move.

### Decision Table (Edge Cases)
| backPath | selectedPo | allowItems | Move Product Visible? |
|----------|------------|------------|----------------------|
| /incoming-inventory | Specific PO | false | **Yes (TC01)** |
| /incoming-inventory | Specific PO | true | **Yes (TC02 - Items)** |
| /incoming-inventory | "All POs" | any | **No (TC08)** |
| /inventory | any | any | **No (TC09)** |

### State Transition
- **TC10 — Verify State Change**: Product exists in Source PO → Move to Target PO → Verify product removed from Source and added to Target.

---

## Test Scenarios (10 Tests)

### Functional Cases
```
SW-IIM-TC01 — Product Only: Move RAM product from Source PO to Target PO
  Pre: Source PO has DDR4 RAM product, Target PO exists
  Steps:
    1. Navigate to Incoming Inventory, select Source PO
    2. Search for product, open action menu → "Move Product"
    3. Select Target PO from dropdown
    4. Click "Move"
    5. Confirm in confirmation dialog
  Expected: "Product moved successfully!" toast, product removed from Source PO table

SW-IIM-TC02 — Product with Items: Move Laptop items from Source PO to Target PO
  Pre: Source PO has Laptop with serial items, Target PO exists with matching product
  Steps:
    1. Navigate to Incoming Inventory, select Source PO
    2. Search for laptop product, open action menu → "Move Items"
    3. Select Target PO from dropdown
    4. Select target product from product table
    5. Click "Move"
    6. Confirm in confirmation dialog
  Expected: "Product moved successfully!" toast, items moved to target product

SW-IIM-TC03 — Cancel Move Operation
  Pre: Source PO has product
  Steps:
    1. Open "Move Product" dialog
    2. Select Target PO
    3. Click "Cancel"
  Expected: Dialog closes, product remains in Source PO
```

### Negative Cases
```
SW-IIM-TC04 — Empty Target PO Validation
  Pre: Source PO has product
  Steps:
    1. Open "Move Product" dialog
    2. Do NOT select Target PO
    3. Click "Move"
  Expected: Error toast "Please select a purchase order"

SW-IIM-TC05 — Same Source and Target PO
  Pre: Source PO has product
  Steps:
    1. Open "Move Product" dialog
    2. Select the SAME PO as source
    3. Click "Move"
  Expected: Appropriate error or validation (behavior TBD by system)
```

### Boundary Value Cases
```
SW-IIM-TC06 — Minimum Quantity (qty=1)
  Pre: Source PO has product with qty=1
  Steps:
    1. Move product with qty=1 to Target PO
  Expected: Successful move, product removed from Source

SW-IIM-TC07 — Large Quantity (qty=999)
  Pre: Source PO has product with qty=999
  Steps:
    1. Move product with qty=999 to Target PO
  Expected: Successful move, quantity preserved in Target PO
```

### Edge Cases (Decision Table)
```
SW-IIM-TC08 — "All POs" View: Move menu hidden
  Pre: Incoming Inventory page with "All POs" selected
  Steps:
    1. Select "All POs" from PO dropdown
    2. Open row action menu
  Expected: "Move Product" and "Move Items" menu items NOT visible

SW-IIM-TC09 — Inventory Route: Move menu hidden
  Pre: Navigate to /inventory page
  Steps:
    1. Open row action menu on any product
  Expected: "Move Product" and "Move Items" menu items NOT visible

SW-IIM-TC10 — State Transition: Verify product moved between POs
  Pre: Source PO with single product, empty Target PO
  Steps:
    1. Verify product exists in Source PO
    2. Move product to Target PO
    3. Verify product removed from Source PO
    4. Select Target PO, search for product
  Expected: Product now exists in Target PO, not in Source PO
```

---

## Deliverables

### 1. Spec File
**Path**: `cypress/e2e/IncomingInventory/IncomingInventoryMoveProduct.cy.js`
- Follow structure of `UpdateCostPrice.cy.js`
- Use shared PO creation pattern (disposable POs per test)
- Tag TC01 with `@smoke`, all with `@regression`
- Include ISTQB technique citations in comments

### 2. Fixture Data
**Path**: `cypress/fixtures/incomingInventoryMoveData.json`
Structure:
```json
{
  "moveProduct": {
    "sourcePO": "PO-Move-Source-{timestamp}",
    "targetPO": "PO-Move-Target-{timestamp}",
    "messages": {
      "success": "Product moved successfully!",
      "selectPOError": "Please select a purchase order",
      "noProductError": "No product to move"
    }
  },
  "ram": {
    "category": "RAM Automation Cat",
    "brand": "Corsair",
    "memoryGeneration": "DDR4",
    "qty": 5
  },
  "laptop": {
    "category": "Laptop Automation Cat",
    "brand": "Lenovo",
    "modelNumber": "ThinkPad X1",
    "sharedSerials": ["MoveLapSerial0001", "MoveLapSerial0002", "MoveLapSerial0003"]
  }
}
```

### 3. Page Object Methods
**Path**: `cypress/pageObjects/IncomingInvPage.js`
Add methods:
```javascript
// ─── Move Product ─────────────────────────────────────────────────────────
openMoveProductDialog() {
  this.clickRowActionMenu();
  cy.contains("Move Product", { timeout: 5000 })
    .should("be.visible")
    .click({ force: true });
  cy.findByRole("dialog").should("be.visible");
}

openMoveItemsDialog() {
  this.clickRowActionMenu();
  cy.contains("Move Items", { timeout: 5000 })
    .should("be.visible")
    .click({ force: true });
  cy.findByRole("dialog").should("be.visible");
}

selectTargetPO(poNumber) {
  cy.findByRole("dialog").within(() => {
    cy.get('[id*="PoList"]').click({ force: true });
    cy.get('[class*="-menu"]', { timeout: 10000 })
      .should("be.visible")
      .contains(poNumber)
      .click({ force: true });
  });
}

clickMoveButton() {
  cy.findByRole("dialog").within(() => {
    cy.contains("button", /^Move$/i).click();
  });
}

clickMoveConfirm() {
  // For confirmation dialog
  cy.findByRole("dialog").within(() => {
    cy.contains("button", /^Move$/i).click();
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

verifyMoveMenuVisible() {
  cy.get('[role="menu"]', { timeout: 5000 }).should("contain.text", "Move Product");
}

verifyMoveMenuNotVisible() {
  cy.get('[role="menu"]').should("not.contain.text", "Move Product");
}

verifyMoveItemsMenuVisible() {
  cy.get('[role="menu"]', { timeout: 5000 }).should("contain.text", "Move Items");
}

selectTargetProduct(productName) {
  // For Move Items - select target product from table
  cy.findByRole("dialog").within(() => {
    cy.contains(productName).click({ force: true });
    cy.get('[role="radio"]').check();
  });
}
```

### 4. Locators
**Path**: `cypress/support/locators/IncomingInvLocators.js`
Add:
```javascript
// Move Product dialog
moveProductMenuItem: 'Move Product',
moveItemsMenuItem: 'Move Items',
moveDialog: '[role="dialog"]:contains("Move")',
moveDialogTitle: 'Target Purchase Order Number',
poListDropdown: '[id*="PoList"]',
moveButton: 'button:contains("Move")',
moveCancelButton: 'button:contains("Cancel")',
confirmMoveDialog: '[role="dialog"]:contains("Confirm Product Move")',
confirmMoveButton: 'button:contains("Move")',
productTableSelector: '.ProductTableSelector',
```

---

## Review Checklist

### Test Coverage
- [ ] **SW-IIM-TC01** — Product Only move (Use case, @smoke)
- [ ] **SW-IIM-TC02** — Product with Items move (Use case)
- [ ] **SW-IIM-TC03** — Cancel move (EP — cancel partition)
- [ ] **SW-IIM-TC04** — Empty target PO validation (EP — invalid partition)
- [ ] **SW-IIM-TC05** — Same PO validation (Error guessing)
- [ ] **SW-IIM-TC06** — Minimum qty=1 (BVA — lower boundary)
- [ ] **SW-IIM-TC07** — Large qty=999 (BVA — upper boundary)
- [ ] **SW-IIM-TC08** — "All POs" view hides menu (Decision table)
- [ ] **SW-IIM-TC09** — /inventory route hides menu (Decision table)
- [ ] **SW-IIM-TC10** — State transition verification (State transition)

### Implementation Checklist
- [ ] New spec file: `cypress/e2e/IncomingInventory/IncomingInventoryMoveProduct.cy.js`
- [ ] Fixture keys: `cypress/fixtures/incomingInventoryMoveData.json`
- [ ] Page object methods: `cypress/pageObjects/IncomingInvPage.js` (if missing)
- [ ] Locators: `cypress/support/locators/IncomingInvLocators.js` (if missing)
- [ ] `cy.intercept()` for `POST /products/product-shift`
- [ ] `cy.intercept()` for `GET /incoming-items` (table refresh)
- [ ] Disposable PO creation (timestamped, unique per test)
- [ ] Proper tagging: `@smoke` on TC01, `@regression` on all

### Style & Consistency
- [ ] Mimic `UpdateCostPrice.cy.js` structure and logging
- [ ] Use shared `makeRamRow()` / `makeLaptopRowWithSerial()` helpers
- [ ] Use `importExcel()` helper for PO setup
- [ ] Include ISTQB technique citations in test comments
- [ ] Clean test data (created POs tracked in `createdPOs` array)
