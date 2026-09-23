import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import InvViewPage from "../../pageObjects/InvViewPage";
import ImportPage from "../../pageObjects/ImportPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import "cypress-file-upload";
import { importAttributesAndCategories, ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import {
  makeRamRow,
  makeLaptopRowWithSerial,
  importExcel,
  createExcelFile,
  searchProduct,
} from "../../support/helpers/incomingInventoryHelpers";

/**
 * View Items and View Details Tests — Incoming Inventory
 * Covers: SW_INC_VIEW_001 – SW_INC_VIEW_004
 *
 * Feature under test:
 *   The long button menu in Incoming Inventory table rows provides
 *   "View Items" and "View Details" options with different behaviors
 *   for Product-Only vs Product-Item categories.
 *
 * Test Data Setup:
 *   - 2 Product of Product Items (Laptops with serial numbers)
 *   - 1 Product of Product Only (RAM without serial numbers)
 */
describe("View Items and View Details Tests (SW_INC_VIEW_001 – SW_INC_VIEW_004)", () => {
  let incomingInvPage, invViewPage, importPage, purchaseOrderPage;
  let td;
  const createdPOs = [];
  let testPO;
  let laptop1Serials, laptop2Serials;
  let runId;

  function ts() {
    const d = new Date();
    return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
  }

  // Generate unique serial numbers for this test run
  function buildSerials(prefix, count) {
    return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}-${runId}`);
  }

  // ─── before() ─────────────────────────────────────────────────────────────
  before(() => {
    cy.fixture("viewItemsTestData").then((data) => {
      td = data;
      runId = ts();
      const ramRow = makeRamRow(td);
      const laptopRow = makeLaptopRowWithSerial(td);

      cy.authSession('admin');
      cy.visit("/");

      // Ensure categories exist
      cy.getAuthToken().then((token) => {
        const rawBase = Cypress.config("baseUrl").replace(/\/$/, "");
        const apiBase = rawBase.replace("://", "://api.");
        [
          { name: td.ram.category, allowItems: false },
          { name: td.laptop.category, allowItems: true },
        ].forEach(({ name, allowItems }) => {
          cy.request({
            method: "POST",
            url: `${apiBase}/categories`,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: {
              name,
              description: "...",
              allowItems,
              allowVariants: false,
              allowVariantItems: false,
            },
            failOnStatusCode: false,
          }).then((res) => cy.log(`Ensure category '${name}': ${res.status}`));
        });
      });

      importAttributesAndCategories();
      ensureCommonAttributesOptional();

      incomingInvPage = new IncomingInvPage();
      invViewPage = new InvViewPage();
      importPage = new ImportPage();
      purchaseOrderPage = new PurchaseOrderPage();

      // ── Create PO with 2 Product-Items and 1 Product-Only ──────────────────
      const stamp = ts();
      testPO = `PO-ViewItems-${stamp}`;
      createdPOs.push(testPO);
      const fileName = `ViewItems-${stamp}.xlsx`;

      // Generate unique serials for 2 laptops
      laptop1Serials = buildSerials(td.laptop1.serialPrefix, td.laptop1.quantity);
      laptop2Serials = buildSerials(td.laptop2.serialPrefix, td.laptop2.quantity);

      createExcelFile(fileName, [
        // Product-Only: RAM
        ramRow(
          td.ramData.brand,
          td.ramData.memoryGeneration,
          td.ramData.quantity,
          td.ramData.cost,
          td.ramData.price,
          td.ramData.supportContact
        ),
        // Product-Item: Laptop 1
        ...laptop1Serials.map((serial) => laptopRow(serial)),
        // Product-Item: Laptop 2
        ...laptop2Serials.map((serial) => ({
          Category: td.laptop.category,
          "Model Number": td.laptop2.modelNumber,
          Brand: td.laptop2.brand,
          Cost: td.laptop2.cost,
          Price: td.laptop2.price,
          "Support Contact": td.laptop2.supportContact,
          "Serial Number": serial,
          Quantity: 1,
        })),
      ]);

      importExcel(fileName, testPO);

      // Stock in some items so View Items has data to display
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(testPO);

      // Stock in partial quantity for laptop 1
      incomingInvPage.searchProduct(td.laptop1.displayName);
      incomingInvPage.clickSubmitSearch();
      incomingInvPage.enterStockInQty(td.laptop1.stockInQty);
      incomingInvPage.clickStockInSubmit();

      // Stock in partial quantity for laptop 2
      incomingInvPage.searchProduct(td.laptop2.displayName);
      incomingInvPage.clickSubmitSearch();
      incomingInvPage.enterStockInQty(td.laptop2.stockInQty);
      incomingInvPage.clickStockInSubmit();

      // Stock in RAM
      incomingInvPage.searchProduct(td.ramData.displayName);
      incomingInvPage.clickSubmitSearch();
      incomingInvPage.enterStockInQty(td.ramData.stockInQty);
      incomingInvPage.clickStockInSubmit();
    });
  });

  // ─── beforeEach() ───────────────────────────────────────────────────────────
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    invViewPage = new InvViewPage();
    importPage = new ImportPage();
    purchaseOrderPage = new PurchaseOrderPage();
  });

  // ===========================================================================
  // ██████████  SW_INC_VIEW_001 – View Items for Product-Item  ███████████████
  // ===========================================================================
  /**
   * @testCaseId    SW_INC_VIEW_001
   * @description   Clicking "View Items" from the row long-button menu of a
   *                Product-Item product navigates to the items list and renders
   *                exactly one row per generated serial number.
   * @testData      fixtures/viewItemsTestData.json → laptop1.displayName,
   *                laptop1.quantity (serial count generated at runtime in before())
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Search for the Laptop 1 product (Product-Item category)
   *   3. Open the row long-button menu and click "View Items"
   *   4. Read the rendered items table
   * @expectedResult  Items table renders exactly laptop1.quantity rows and
   *                  every generated serial number from laptop1Serials is visible.
   */
  it(
    "SW_INC_VIEW_001 – Click View Items for Product-Item shows serial numbers of selected product",
    { tags: ["@smoke", "@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(testPO);

      searchProduct(testPO, td.laptop1.displayName);

      incomingInvPage.openFirstRowLongButtonMenu();
      incomingInvPage.clickViewItemsMenuItem();

      incomingInvPage.verifyItemsTableRowCount(laptop1Serials.length);
      laptop1Serials.forEach((serial) => {
        incomingInvPage.verifyItemsTableContainsSerial(serial);
      });
    }
  );

  // ===========================================================================
  // ██████████  SW_INC_VIEW_002 – View Items disabled for Product-Only  ████████
  // ===========================================================================
  /**
   * @testCaseId    SW_INC_VIEW_002
   * @technique     Decision table — product type (hasItems=false) drives the
   *                "View Items" menu-item enablement (disabled for Product-Only).
   * @description   The "View Items" entry in the row long-button menu is
   *                disabled for a Product-Only product (no serialised items).
   * @testData      fixtures/viewItemsTestData.json → ramData.displayName
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Search for the RAM product (Product-Only category)
   *   3. Open the row long-button menu
   * @expectedResult  The "View Items" menu item carries aria-disabled="true".
   */
  it(
    "SW_INC_VIEW_002 – View Items option is disabled in long button menu for Product-Only",
    { tags: ["@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(testPO);

      searchProduct(testPO, td.ramData.displayName);

      // The grid search does not isolate a single product (the product-item
      // laptop rows remain above the RAM row), so target the RAM product's row
      // specifically by its unique support contact — not the first row.
      incomingInvPage.openRowLongButtonMenuFor(td.ramData.supportContact);
      incomingInvPage.verifyMenuItemDisabled("View Items");
    }
  );

  // ===========================================================================
  // ██████████  SW_INC_VIEW_003 – View Details for Product-Only  ███████████████
  // ===========================================================================
  /**
   * @testCaseId    SW_INC_VIEW_003
   * @technique     Use Case — actor drives View Details → product-detail page →
   *                expand header → attribute (memory generation) is revealed.
   * @description   Clicking "View Details" from the row long-button menu of a
   *                Product-Only product navigates to the product detail page;
   *                expanding the product-details header reveals the product
   *                attributes including the memory generation.
   * @testData      fixtures/viewItemsTestData.json → ramData.displayName,
   *                ramData.memoryGeneration
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Search for the RAM product (Product-Only category)
   *   3. Open the row long-button menu and click "View Details"
   *   4. Click the product-details header to expand attributes
   * @expectedResult  Product detail page loads and the memoryGeneration
   *                  attribute value (e.g. "DDR4") is visible after expansion.
   */
  it(
    "SW_INC_VIEW_003 – Click View Details for Product-Only navigates to product details and shows all attributes",
    { tags: ["@smoke", "@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(testPO);

      searchProduct(testPO, td.ramData.displayName);

      // Target the RAM product's row specifically (search does not isolate it).
      incomingInvPage.openRowLongButtonMenuFor(td.ramData.supportContact);
      incomingInvPage.clickViewDetailsMenuItem();

      incomingInvPage.expandProductDetailsHeader();
      incomingInvPage.verifyAttributeVisible(td.ramData.memoryGeneration);
    }
  );

  // ===========================================================================
  // ██████████  SW_INC_VIEW_004 – View Details disabled for Product-Item  ██████
  // ===========================================================================
  /**
   * @testCaseId    SW_INC_VIEW_004
   * @description   The "View Details" entry in the row long-button menu is
   *                disabled for a Product-Item product (details belong to the
   *                items, not the product container).
   * @testData      fixtures/viewItemsTestData.json → laptop1.displayName
   * @steps
   *   1. Navigate to Incoming Inventory and select the seeded PO
   *   2. Search for the Laptop 1 product (Product-Item category)
   *   3. Open the row long-button menu
   * @expectedResult  The "View Details" menu item carries aria-disabled="true".
   */
  it(
    "SW_INC_VIEW_004 – View Details option is disabled in long button menu for Product-Item",
    { tags: ["@regression"] },
    () => {
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber(testPO);

      searchProduct(testPO, td.laptop1.displayName);

      incomingInvPage.openFirstRowLongButtonMenu();
      incomingInvPage.verifyMenuItemDisabled("View Details");
    }
  );

  // ─── after() ──────────────────────────────────────────────────────────────
  after(() => {
    if (createdPOs.length === 0) return;
    cy.authSession('admin');
    cy.visit("/");
    incomingInvPage = new IncomingInvPage();
    purchaseOrderPage = new PurchaseOrderPage();
    createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
  });
});
