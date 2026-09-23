// import IncomingInvPage from "../../pageObjects/IncomingInvPage";
// import InvViewPage from "../../pageObjects/InvViewPage";
// import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
// import "cypress-file-upload";
// import { importAttributesAndCategories } from "../../support/helpers/attributeHelpers";
// import { makeRamRow, makeLaptopRowWithSerial, importExcel, searchProduct, createExcelFile } from "../../support/helpers/incomingInventoryHelpers";

// /**
//  * Update Expected Quantity Tests
//  * Covers: SW_INC_019 – SW_INC_050
//  *
//  * Product Only (RAM) Tests — SW_INC_019 – SW_INC_023, SW_INC_029 – SW_INC_033, SW_INC_045 – SW_INC_050
//  * Product Item (Laptop) Tests — SW_INC_024 – SW_INC_028, SW_INC_034 – SW_INC_037, SW_INC_040 – SW_INC_044
//  * Mixed PO Tests — SW_INC_038 – SW_INC_039
//  *
//  * Formula:  Incoming = Expected − Received
//  * All other quantities (available, reserved, missing, damaged,
//  * disputed, sold, stockOutOther) remain unchanged after an
//  * expected-qty update — only Expected and Incoming change.
//  */
// describe("Update Expected Quantity Tests (SW_INC_019 – SW_INC_050)", () => {
//   let incomingInvPage, invViewPage, purchaseOrderPage;
//   let td;

//   const createdPOs = [];

//   // ---------------------------------------------------------------------------
//   // Shared POs — created once in before(), reused across tests
//   // ramSharedPO    → SW_INC_019, 020, 021  (no stock-in, clean state)
//   // ramStockInPO   → SW_INC_022, 023       (partial stock-in applied in before)
//   // laptopSharedPO → SW_INC_024, 025, 026  (no stock-in, clean state)
//   // laptopStockInPO→ SW_INC_027, 028       (partial stock-in applied in before)
//   // ---------------------------------------------------------------------------
//   let ramSharedPO;
//   let ramStockInPO;
//   let laptopSharedPO;
//   let laptopStockInPO;
//   let mixedPO;
//   let laptopStatusPO;
//   let ramStatusPO;

//   // ---------------------------------------------------------------------------
//   // Timestamp helper
//   // ---------------------------------------------------------------------------
//   function ts() {
//     const d = new Date();
//     return `${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}-${d.getMilliseconds()}`;
//   }

//   // ---------------------------------------------------------------------------
//   // Update Expected Qty helper
//   // ---------------------------------------------------------------------------
//   function updateExpectedQty(newQty) {
//     incomingInvPage.clickRowActionMenu();
//     cy.findByRole("menuitem", { name: /update expected quantity/i }).click();
//     cy.findByRole("dialog").within(() => {
//       cy.get('input[name="expectedQuantity"]')
//         .should("be.visible")
//         .focus()
//         .type("{selectall}")
//         .type(String(newQty), { delay: 50 });
//       cy.findByRole("button", { name: /Update/i }).click();
//     });
//     cy.contains(td.successMessages.expectedQtyUpdated, {
//       timeout: 10000,
//     }).should("exist");
//   }

//   // ---------------------------------------------------------------------------
//   // Cancel Expected Qty helper
//   // ---------------------------------------------------------------------------
//   function cancelExpectedQtyUpdate(newQty) {
//     incomingInvPage.clickRowActionMenu();
//     cy.findByRole("menuitem", { name: /update expected quantity/i }).click();
//     cy.findByRole("dialog").within(() => {
//       cy.get('input[name="expectedQuantity"]')
//         .should("be.visible")
//         .focus()
//         .type("{selectall}")
//         .type(String(newQty), { delay: 50 });
//       cy.findByRole("button", { name: /Cancel/i }).click();
//     });
//     cy.findByRole("dialog").should("not.exist");
//   }

//   // ---------------------------------------------------------------------------
//   // before() — fixture → session → attributes → shared PO setup
//   // ---------------------------------------------------------------------------
//   before(() => {
//     cy.fixture("updateExpectedQtyData").then((data) => {
//       td = data;
//       const ramRow = makeRamRow(td);
//       const laptopRowWithSerial = makeLaptopRowWithSerial(td);

//       const runId = ts();

//       cy.authSession('admin');

//       cy.visit("/");

//       // Ensure required categories exist on this environment.
//       // testDataAttributes.json uses hardcoded IDs (105/106) which may
//       // conflict on stage, causing "RAM Automation Cat" creation to silently
//       // fail inside importAttributesFromFile. Pre-create via API so the
//       // Excel import always finds the category by name.
//       cy.getAuthToken().then((token) => {
//         const rawBase = Cypress.config("baseUrl").replace(/\/$/, "");
//         const apiBase = rawBase.replace("://", "://api.");
//         [
//           { name: td.ram.category, allowItems: false },
//           { name: td.laptop.category, allowItems: true },
//         ].forEach(({ name, allowItems }) => {
//           cy.request({
//             method: "POST",
//             url: `${apiBase}/categories`,
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Content-Type": "application/json",
//             },
//             body: {
//               name,
//               description: "...",
//               allowItems,
//               allowVariants: false,
//               allowVariantItems: false,
//             },
//             failOnStatusCode: false,
//           }).then((res) => cy.log(`Ensure category '${name}': ${res.status}`));
//         });
//       });

//       importAttributesAndCategories();

//       incomingInvPage = new IncomingInvPage();
//       invViewPage = new InvViewPage();
//       purchaseOrderPage = new PurchaseOrderPage();

//       // ── RAM shared PO (no stock-in) — used by SW_INC_019, 020, 021 ────────
//       const ramStamp = ts();
//       ramSharedPO = `PO-UpdateExpRam-${ramStamp}`;
//       createdPOs.push(ramSharedPO);
//       const ramFileName = `UpdateExpRam-${ramStamp}.xlsx`;

//       createExcelFile(ramFileName, [
//         ramRow(
//           td.ramKingston.brand,
//           td.ramKingston.memoryGeneration,
//           td.updateExpQty.initialQty,
//         ),
//       ]);
//       importExcel(ramFileName, ramSharedPO);

//       cy.intercept("GET", "**/incoming-items**").as("ramSharedLoad");
//       incomingInvPage.selectPoNumber(ramSharedPO);
//       cy.wait("@ramSharedLoad", { timeout: 10000 });
//       incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty);
//       incomingInvPage.validateIncomingQty(td.updateExpQty.initialQty);

//       // ── RAM stock-in PO — used by SW_INC_022, 023 ─────────────────────────
//       const ramSiStamp = ts();
//       ramStockInPO = `PO-UpdateExpRamSI-${ramSiStamp}`;
//       createdPOs.push(ramStockInPO);
//       const ramSiFileName = `UpdateExpRamSI-${ramSiStamp}.xlsx`;

//       createExcelFile(ramSiFileName, [
//         ramRow(
//           td.ramKingston.brand,
//           td.ramKingston.memoryGeneration,
//           td.updateExpQty.initialQty,
//         ),
//       ]);
//       importExcel(ramSiFileName, ramStockInPO);

//       cy.intercept("GET", "**/incoming-items**").as("ramSiLoad");
//       incomingInvPage.selectPoNumber(ramStockInPO);
//       incomingInvPage.enterStockInQty(td.updateExpQty.partialStockInQty);
//       incomingInvPage.clickStockInSubmit();
//       cy.contains(
//         `Quantity "${td.updateExpQty.partialStockInQty}" stocked in`,
//         { timeout: 10000 },
//       ).should("exist");

//       // ── Laptop shared PO (no stock-in) — used by SW_INC_024, 025, 026 ─────
//       const lapStamp = ts();
//       laptopSharedPO = `PO-UpdateExpLap-${lapStamp}`;
//       createdPOs.push(laptopSharedPO);
//       const lapFileName = `UpdateExpLap-${lapStamp}.xlsx`;
//       const sharedSerials = td.laptop.sharedSerials.map((s) => `${s}-${runId}`);
//       const laptopRows = sharedSerials.map(laptopRowWithSerial);
//       createExcelFile(lapFileName, laptopRows);
//       importExcel(lapFileName, laptopSharedPO);

//       cy.intercept("GET", "**/incoming-items**").as("lapSharedLoad");
//       incomingInvPage.selectPoNumber(laptopSharedPO);
//       cy.wait("@lapSharedLoad", { timeout: 10000 });
//       incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty);
//       incomingInvPage.validateIncomingQty(td.updateExpQty.initialQty);

//       // ── Laptop stock-in PO — used by SW_INC_027, 028 ──────────────────────
//       const lapSiStamp = ts();
//       laptopStockInPO = `PO-UpdateExpLapSI-${lapSiStamp}`;
//       createdPOs.push(laptopStockInPO);
//       const lapSiFileName = `UpdateExpLapSI-${lapSiStamp}.xlsx`;
//       const stockInSerials = td.laptop.stockInSerials.map(
//         (s) => `${s}-${runId}`,
//       );
//       const laptopRowsSI = stockInSerials.map(laptopRowWithSerial);
//       createExcelFile(lapSiFileName, laptopRowsSI);
//       importExcel(lapSiFileName, laptopStockInPO);

//       cy.intercept("GET", "**/incoming-items**").as("lapSiLoad");
//       incomingInvPage.selectPoNumber(laptopStockInPO);
//       //  cy.wait("@lapSiLoad", { timeout: 10000 });
//       incomingInvPage.enterStockInQty(td.updateExpQty.partialStockInQty);
//       incomingInvPage.clickStockInSubmit();
//       cy.contains(
//         `Quantity "${td.updateExpQty.partialStockInQty}" stocked in`,
//         { timeout: 10000 },
//       ).should("exist");

//       const {
//         laptopStatusSerials: rawLaptopStatusSerials,
//         ramStatusInitialQty,
//         ramStatusStockInQty,
//       } = td.statusTestData;

//       const laptopStatusSerials = rawLaptopStatusSerials.map(
//         (s) => `${s}-${runId}`,
//       );

//       // ── Mixed PO (RAM + Laptop) — used by SW_INC_038, 039 ──────────────────
//       const mixedStamp = ts();
//       mixedPO = `PO-UpdateExpMixed-${mixedStamp}`;
//       createdPOs.push(mixedPO);
//       const mixedFileName = `UpdateExpMixed-${mixedStamp}.xlsx`;
//       const mixedSerials = td.mixedPOSerials.map((s) => `${s}-${runId}`);
//       const mixedLaptopRows = mixedSerials.map(laptopRowWithSerial);
//       createExcelFile(mixedFileName, [
//         ramRow(
//           td.ramKingston.brand,
//           td.ramKingston.memoryGeneration,
//           td.updateExpQty.initialQty,
//         ),
//         ...mixedLaptopRows,
//       ]);
//       importExcel(mixedFileName, mixedPO);

//       cy.intercept("GET", "**/incoming-items**").as("mixedPOLoad");
//       incomingInvPage.selectPoNumber(mixedPO);
//       incomingInvPage.searchProduct(td.ramKingston.displayName);
//       cy.get("button").contains("Search").click();
//       cy.wait("@mixedPOLoad", { timeout: 10000 });
//       incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty);
//       incomingInvPage.validateIncomingQty(td.updateExpQty.initialQty);
//     });
//   });

//   // ---------------------------------------------------------------------------
//   // beforeEach — re-initialize page objects fresh for every test
//   // ---------------------------------------------------------------------------
//   beforeEach(() => {
//     cy.authSession('admin');
//     cy.visit("/");
//     incomingInvPage = new IncomingInvPage();
//     invViewPage = new InvViewPage();
//     purchaseOrderPage = new PurchaseOrderPage();
//   });

//   // ===========================================================================
//   // ██████████████  PRODUCT ONLY (RAM) TESTS  ██████████████████████████████
//   // ===========================================================================
//   describe("Product Only (RAM) Tests", () => {
//     // =========================================================================
//     // SW_INC_019
//     // Scenario : No stock-in yet. Update expected qty to a HIGHER value.
//     // Initial  : Expected = 10, Received = 0, Incoming = 10
//     // Action   : Update Expected → higherQty (e.g. 15)
//     // Formula  : Incoming = 15 − 0 = 15
//     // Verify   : Expected = 15, Incoming = 15, Received = 0
//     // =========================================================================
//     it(
//       "SW_INC_019 – Product Only Update expected qty higher than current (10 → 15), no stock-in, verify Incoming increases",
//       { tags: ["@smoke", "@regression"] },
//       () => {
//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty); // 10
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.initialQty); // 10

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_020
//     // Scenario : No stock-in yet. Update expected qty to a LOWER value.
//     // Initial  : Expected = 15 (set by 019), Received = 0, Incoming = 15
//     // Action   : Update Expected → lowerQty (e.g. 7)
//     // Formula  : Incoming = 7 − 0 = 7
//     // Verify   : Expected = 7, Incoming = 7, Received = 0
//     // =========================================================================
//     it(
//       "SW_INC_020 – Product Only Update expected qty lower than current (15 → 7), no stock-in, verify Incoming decreases",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15

//         updateExpectedQty(td.updateExpQty.lowerQty); // 7

//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_021
//     // Scenario : No stock-in yet. Update expected qty to the SAME value.
//     // Initial  : Expected = 7 (set by 020), Received = 0, Incoming = 7
//     // Action   : Update Expected → same value (7)
//     // Formula  : Incoming = 7 − 0 = 7 (unchanged)
//     // Verify   : Expected = 7, Incoming = 7 (no change)
//     // =========================================================================
//     it(
//       "SW_INC_021 – Product Only Update expected qty equal to current (7 → 7), no stock-in, verify quantities unchanged",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7

//         updateExpectedQty(td.updateExpQty.lowerQty); // 7

//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_022
//     // Scenario : Partial stock-in already done. Update expected qty to HIGHER.
//     // Initial  : Expected = 10, Received = 3 (partialStockInQty), Incoming = 7
//     // Action   : Update Expected → higherQty (e.g. 15)
//     // Formula  : Incoming = 15 − 3 = 12
//     // Verify   : Expected = 15, Received = 3, Available = 3, Incoming = 12
//     // =========================================================================
//     it(
//       "SW_INC_022 – Product Only Update expected qty higher (10 → 15) after partial stock-in (Received = 3), verify Incoming = 12",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramStockInPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty); // 10
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.initialQty - td.updateExpQty.partialStockInQty, // 7
//         );

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(ramStockInPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.higherQty - td.updateExpQty.partialStockInQty, // 12
//         );
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_023
//     // Scenario : Partial stock-in already done. Update expected qty LOWER than
//     //            received — Incoming should go negative.
//     // Initial  : Expected = 15 (set by 022), Received = 3, Incoming = 12
//     // Action   : Update Expected → belowReceivedQty (e.g. 2, which is < 3)
//     // Formula  : Incoming = 2 − 3 = −1
//     // Verify   : Expected = 2, Received = 3, Available = 3, Incoming = −1
//     // =========================================================================
//     it(
//       "SW_INC_023 – Product Only Update expected qty lower than received (2 < 3), verify Incoming goes negative (−1)",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramStockInPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.higherQty - td.updateExpQty.partialStockInQty, // 12
//         );

//         updateExpectedQty(td.updateExpQty.belowReceivedQty); // 2

//         searchProduct(ramStockInPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.belowReceivedQty); // 2
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.belowReceivedQty - td.updateExpQty.partialStockInQty, // −1
//         );
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_029
//     // Scenario : Update expected qty to 0 (zero boundary, no stock-in).
//     // Initial  : Expected = 7 (set by SW_INC_021), Received = 0, Incoming = 7
//     // Action   : Update Expected → 0
//     // Formula  : Incoming = 0 − 0 = 0
//     // Verify   : Expected = 0, Received = 0, Incoming = 0
//     // =========================================================================
//     it(
//       "SW_INC_029 – Product Only Update expected qty to 0 (zero boundary, no stock-in)",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7

//         updateExpectedQty(td.updateExpQty.zeroQty); // 0

//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.zeroQty); // 0
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.zeroQty); // 0
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_030
//     // Scenario : Recover from 0 expected qty back to positive (no stock-in).
//     // Initial  : Expected = 0 (set by SW_INC_029), Received = 0, Incoming = 0
//     // Action   : Update Expected → higherQty (15)
//     // Formula  : Incoming = 15 − 0 = 15
//     // Verify   : Expected = 15, Received = 0, Incoming = 15
//     // =========================================================================
//     it(
//       "SW_INC_030 – Product Only Recover from 0 expected qty back to positive (15)",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.zeroQty); // 0
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.zeroQty); // 0

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     it(
//       "SW_INC_032 – Product Only Set expected qty equal to received, Incoming becomes 0",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramStockInPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.belowReceivedQty); // 2
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3

//         updateExpectedQty(td.updateExpQty.partialStockInQty); // 3

//         searchProduct(ramStockInPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_033
//     // Scenario : Cancel the update dialog — qty must not change.
//     // Initial  : Expected = 15 (set by SW_INC_030), Received = 0, Incoming = 15
//     // Action   : Open dialog → enter 99 → click Cancel
//     // Verify   : Expected still 15, Incoming still 15
//     // =========================================================================
//     it(
//       "SW_INC_033 – Product Only Cancelling update dialog leaves qty unchanged",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15

//         cancelExpectedQtyUpdate(td.updateExpQty.cancelTestQty); // 99, Cancel

//         searchProduct(ramSharedPO, td.ramKingston.displayName);
//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // still 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // still 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     it(
//       "SW_INC_050 – Product Only Update expected qty to 1 (minimum positive boundary)",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15

//         updateExpectedQty(td.updateExpQty.minPositiveQty); // 1

//         searchProduct(ramSharedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.minPositiveQty); // 1
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.minPositiveQty); // 1
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );
//   });

//   // ===========================================================================
//   // ██████████████  PRODUCT ITEM (LAPTOP) TESTS  ████████████████████████████
//   // ===========================================================================
//   describe("Product Item (Laptop) Tests", () => {
//     // =========================================================================
//     // SW_INC_024
//     // Scenario : No stock-in yet. Update expected qty to a HIGHER value.
//     // Initial  : Expected = 10, Received = 0, Incoming = 10
//     // Action   : Update Expected → higherQty (e.g. 15)
//     // Formula  : Incoming = 15 − 0 = 15
//     // Verify   : Expected = 15, Incoming = 15, Received = 0
//     // =========================================================================
//     it(
//       "SW_INC_024 – Product Item Update expected qty higher than current (10 → 15), no stock-in, verify Incoming increases",
//       { tags: ["@smoke", "@regression"] },
//       () => {
//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty); // 10
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.initialQty); // 10

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_025
//     // Scenario : No stock-in yet. Update expected qty to a LOWER value.
//     // Initial  : Expected = 15 (set by 024), Received = 0, Incoming = 15
//     // Action   : Update Expected → lowerQty (e.g. 7)
//     // Formula  : Incoming = 7 − 0 = 7
//     // Verify   : Expected = 7, Incoming = 7, Received = 0
//     // =========================================================================
//     it(
//       "SW_INC_025 – Product Item Update expected qty lower than current (15 → 7), no stock-in, verify Incoming decreases",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15

//         updateExpectedQty(td.updateExpQty.lowerQty); // 7

//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_026
//     // Scenario : No stock-in yet. Update expected qty to the SAME value.
//     // Initial  : Expected = 7 (set by 025), Received = 0, Incoming = 7
//     // Action   : Update Expected → same value (7)
//     // Formula  : Incoming = 7 − 0 = 7 (unchanged)
//     // Verify   : Expected = 7, Incoming = 7 (no change)
//     // =========================================================================
//     it(
//       "SW_INC_026 – Product Item Update expected qty equal to current (7 → 7), no stock-in, verify quantities unchanged",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7

//         updateExpectedQty(td.updateExpQty.lowerQty); // 7

//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_027
//     // Scenario : Partial stock-in already done. Update expected qty to HIGHER.
//     // Initial  : Expected = 10, Received = 3, Incoming = 7
//     // Action   : Update Expected → higherQty (e.g. 15)
//     // Formula  : Incoming = 15 − 3 = 12
//     // Verify   : Expected = 15, Received = 3, Available = 3, Incoming = 12
//     // =========================================================================
//     it(
//       "SW_INC_027 – Product Item Update expected qty higher (10 → 15) after partial stock-in (Received = 3), verify Incoming = 12",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopStockInPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty); // 10
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.initialQty - td.updateExpQty.partialStockInQty, // 7
//         );

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(laptopStockInPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.higherQty - td.updateExpQty.partialStockInQty, // 12
//         );
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_028
//     // Scenario : Partial stock-in already done. Update expected qty LOWER than
//     //            received — Incoming should go negative.
//     // Initial  : Expected = 15 (set by 027), Received = 3, Incoming = 12
//     // Action   : Update Expected → belowReceivedQty (e.g. 2, which is < 3)
//     // Formula  : Incoming = 2 − 3 = −1
//     // Verify   : Expected = 2, Received = 3, Available = 3, Incoming = −1
//     // =========================================================================
//     it(
//       "SW_INC_028 – Product Item Update expected qty lower than received (2 < 3), verify Incoming goes negative (−1)",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopStockInPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.higherQty - td.updateExpQty.partialStockInQty, // 12
//         );

//         updateExpectedQty(td.updateExpQty.belowReceivedQty); // 2

//         searchProduct(laptopStockInPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.belowReceivedQty); // 2
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(
//           td.updateExpQty.belowReceivedQty - td.updateExpQty.partialStockInQty, // −1
//         );
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_034
//     // Scenario : Update expected qty to 0 (zero boundary, no stock-in).
//     // Initial  : Expected = 7 (set by SW_INC_026), Received = 0, Incoming = 7
//     // Action   : Update Expected → 0
//     // Formula  : Incoming = 0 − 0 = 0
//     // Verify   : Expected = 0, Received = 0, Incoming = 0
//     // =========================================================================
//     it(
//       "SW_INC_034 – Product Item Update expected qty to 0 (zero boundary, no stock-in)",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.lowerQty); // 7
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.lowerQty); // 7

//         updateExpectedQty(td.updateExpQty.zeroQty); // 0

//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.zeroQty); // 0
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.zeroQty); // 0
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_035
//     // Scenario : Recover from 0 expected qty back to positive (no stock-in).
//     // Initial  : Expected = 0 (set by SW_INC_034), Received = 0, Incoming = 0
//     // Action   : Update Expected → higherQty (15)
//     // Formula  : Incoming = 15 − 0 = 15
//     // Verify   : Expected = 15, Received = 0, Incoming = 15
//     // =========================================================================
//     it(
//       "SW_INC_035 – Product Item Recover from 0 expected qty back to positive (15)",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.zeroQty); // 0
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.zeroQty); // 0

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_036
//     // Scenario : Set expected qty exactly equal to received (Incoming = 0).
//     // Initial  : Expected = 2 (set by SW_INC_028), Received = 3, Incoming = −1
//     // Action   : Update Expected → partialStockInQty (3 = received)
//     // Formula  : Incoming = 3 − 3 = 0
//     // Verify   : Expected = 3, Received = 3, Available = 3, Incoming = 0
//     // =========================================================================
//     it(
//       "SW_INC_036 – Product Item Set expected qty equal to received, Incoming becomes 0",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopStockInPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.belowReceivedQty); // 2
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3

//         updateExpectedQty(td.updateExpQty.partialStockInQty); // 3

//         searchProduct(laptopStockInPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateReceivedQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateAvailableQty(td.updateExpQty.partialStockInQty); // 3
//         incomingInvPage.validateIncomingQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_037
//     // Scenario : Cancel the update dialog — qty must not change.
//     // Initial  : Expected = 15 (set by SW_INC_035), Received = 0, Incoming = 15
//     // Action   : Open dialog → enter 99 → click Cancel
//     // Verify   : Expected still 15, Incoming still 15
//     // =========================================================================
//     it(
//       "SW_INC_037 – Product Item Cancelling update dialog leaves qty unchanged",
//       { tags: ["@regression"] },
//       () => {
//         searchProduct(laptopSharedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15

//         cancelExpectedQtyUpdate(td.updateExpQty.cancelTestQty); // 99, Cancel

//         searchProduct(laptopSharedPO, td.laptop.displayName);
//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // still 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // still 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );
//   });

//   // ===========================================================================
//   // ██████████████  MIXED PO (RAM + LAPTOP IN ONE PO)  █████████████████████
//   // ===========================================================================
//   describe("Mixed PO Tests", () => {
//     // =========================================================================
//     // SW_INC_038
//     // Scenario : Mixed PO — update expected qty for the RAM (Product Only) row.
//     // Initial  : RAM: Expected = 10, Received = 0, Incoming = 10
//     // Action   : Search RAM product → Update Expected → higherQty (15)
//     // Formula  : Incoming = 15 − 0 = 15
//     // Verify   : RAM Expected = 15, Incoming = 15 (Laptop unchanged)
//     // =========================================================================
//     it(
//       "SW_INC_038 – Mixed PO Update RAM (Product Only) expected qty from 10 to 15",
//       { tags: ["@smoke", "@regression"] },
//       () => {
//         searchProduct(mixedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty); // 10
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.initialQty); // 10

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(mixedPO, td.ramKingston.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );

//     // =========================================================================
//     // SW_INC_039
//     // Scenario : Mixed PO — update expected qty for the Laptop (Product Item) row.
//     // Initial  : Laptop: Expected = 10, Received = 0, Incoming = 10
//     // Action   : Search Laptop product → Update Expected → higherQty (15)
//     // Formula  : Incoming = 15 − 0 = 15
//     // Verify   : Laptop Expected = 15, Incoming = 15
//     // =========================================================================
//     it(
//       "SW_INC_039 – Mixed PO Update Laptop (Product Item) expected qty from 10 to 15",
//       { tags: ["@smoke", "@regression"] },
//       () => {
//         searchProduct(mixedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.initialQty); // 10
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.initialQty); // 10

//         updateExpectedQty(td.updateExpQty.higherQty); // 15

//         searchProduct(mixedPO, td.laptop.displayName);

//         incomingInvPage.validateExpectedQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateReceivedQty(0);
//         incomingInvPage.validateIncomingQty(td.updateExpQty.higherQty); // 15
//         incomingInvPage.validateAvailableQty(0);
//         incomingInvPage.validateReservedQty(0);
//         incomingInvPage.validateMissingQty(0);
//         incomingInvPage.validateDamagedQty(0);
//         incomingInvPage.validateDisputedQty(0);
//         incomingInvPage.validateSoldQty(0);
//         incomingInvPage.validateStockOutOtherQty(0);
//       },
//     );
//   });
  
//   after(() => {
//     if (createdPOs.length === 0) return;

//     cy.authSession('admin');
//     cy.visit("/");
//     incomingInvPage = new IncomingInvPage();
//     purchaseOrderPage = new PurchaseOrderPage();
//     createdPOs.forEach((po) => purchaseOrderPage.deletePurchaseOrder(po));
//   });

// });
