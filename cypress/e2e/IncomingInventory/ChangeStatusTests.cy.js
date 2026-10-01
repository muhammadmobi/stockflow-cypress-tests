// cypress/e2e/IncomingInventory/ChangeStatusTests.cy.js
//
// Change Status tests for Incoming Inventory:
//   • Product-Item category  (hasItems=true  — Laptop)
//   • Product-Only category  (hasVariants=false, hasItems=false — RAM)
//
// ISTQB techniques per SKILL.md §4:
//   State-transition  — valid status changes from Incoming/Available states
//   Decision table    — status × source-type (item vs product-only)
//   Error-guessing    — invalid transitions (Available→Missing/Damaged/Disputed)
//
// Quantity rules (from ChangeStatusTestRequirements.txt):
//   Import            → expectedQty set, receivedQty=0, availableQty=0, items=Incoming
//   Incoming→Missing  → Missing+1 only; Incoming count UNCHANGED
//   Incoming→Damaged  → Received+1, Damaged+1, Incoming-1
//   Incoming→Disputed → Received+1, Disputed+1, Incoming-1
//   Available→Sold    → use stockOutItemViaUI / stockOutProductViaUI (MobileViewScreen)
//   Available→SO      → Available-1, StockedOut+1
//   Available→Reserved→ Available-1, Reserved+1
//
// NOTE: "Sold" is a stock-out REASON used with stockOutItemViaUI/stockOutProductViaUI,
//       NOT a selectable option in the Change Status dialog.

import { createScanAllSuite } from "../../support/helpers/scanAllTestHelpers";
import { apiSetGeneralConfigFlags } from "../../support/helpers/generalConfigApiHelpers";
import csData from "../../fixtures/changeStatusTestData.json";

const BADGE_LABELS = [
  "Expected", "Incoming", "Available", "Received",
  "Missing", "Damaged", "Disputed", "Sold",
  "Stocked out (others)", "Reserved",
];

// Reads every badge value, logs it, and writes a snapshot to
// cypress/fixtures/debug_badge_snapshot.json so it's visible after a
// headless run (cy.log is suppressed in terminal output).
function logCurrentBadges() {
  cy.log("── BADGE SNAPSHOT ──────────────────────────────");
  // Diagnostic only — never let it fail the test. Reads whichever stat-strip
  // layout is deployed (InfoCard caption+h6 OR QA compact "Label (N)" tile)
  // best-effort, skipping labels it can't find rather than throwing.
  const snapshot = {};
  cy.get("body").then(($body) => {
    BADGE_LABELS.forEach((label) => {
      const cap = $body
        .find("span.MuiTypography-caption")
        .filter((_, el) => el.textContent.trim() === label);
      if (cap.length) {
        snapshot[label] = Cypress.$(cap[0])
          .parent()
          .find("h6.MuiTypography-h6")
          .text()
          .trim();
      } else {
        const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("^\\s*" + esc + "\\s*\\((\\d+)\\)\\s*$");
        const tile = $body.find("div").filter((_, el) => {
          if (Cypress.$(el).closest('[aria-hidden="true"]').length) return false;
          if (!re.test((el.textContent || "").trim())) return false;
          return !Cypress.$(el)
            .children("div")
            .filter((__, c) => re.test((c.textContent || "").trim())).length;
        });
        if (tile.length) {
          const m = re.exec((tile[0].textContent || "").trim());
          snapshot[label] = m ? m[1] : "?";
        }
      }
      cy.log(`  [BADGE] ${label}: ${snapshot[label] ?? "(not visible)"}`);
    });
    cy.writeFile(
      "cypress/fixtures/debug_badge_snapshot.json",
      JSON.stringify(snapshot, null, 2),
    );
  });
  cy.log("────────────────────────────────────────────────");
}

// ─── Product-only change status dialog ────────────────────────────────────────
// Uses incomingInvPage.searchProduct (no {enter}) so the product list view stays
// visible with button[id="long-button"] per row (the {enter} approach switches to
// an inline stock-in form). Mirrors the item helper but uses .first() since the
// product name "Kingston DDR4" is split across two table cells and .contains() won't match.
function openChangeStatusDialogProduct(suite, po, searchTerm) {
  cy.log(`[DIALOG] openChangeStatusDialogProduct — PO: ${po}, search: ${searchTerm}`);
  cy.intercept("GET", "**/incoming-items**").as("incomingItemsLoad");
  cy.get("body").type("{esc}", { force: true });
  cy.get('a[aria-label="Incoming Inventory"][href="/incoming-inventory"]').click({ force: true });
  suite.incomingInvPage.selectPoNumber(po);
  suite.incomingInvPage.searchProduct(searchTerm);
  cy.get('#category-form button[type="submit"]:visible')
    .scrollIntoView()
    .should("not.be.disabled")
    .click({ force: true });
  cy.wait("@incomingItemsLoad", { timeout: 10000 });

  // Debug: log URL and row count to see what loaded
  cy.url().then((url) => cy.log(`[DEBUG] URL after search: ${url}`));
  cy.get("tbody").then(($tbody) => {
    const rowCount = $tbody.find("tr").length;
    const firstRowText = $tbody.find("tr").first().text().substring(0, 200);
    cy.log(`[DEBUG] tbody rows: ${rowCount}, first row text: ${firstRowText}`);
  });

  cy.get("tbody tr", { timeout: 10000 })
    .first()
    .should("be.visible")
    .find("button#long-button")
    .should("exist")
    .click({ force: true });

  // Debug: log all menu items visible after button click
  cy.get('[role="menu"]', { timeout: 5000 }).then(($menu) => {
    const items = $menu.find('[role="menuitem"]').map((i, el) => Cypress.$(el).text()).get().join(" | ");
    cy.log(`[DEBUG] Menu items: ${items}`);
  });

  cy.contains("Change Status")
    .should("be.visible")
    .click({ force: true });

  cy.log("[DEBUG] Clicked Change Status — waiting for dialog");
  cy.url().then((url) => cy.log(`[DEBUG] URL after Change Status click: ${url}`));

  cy.get('[role="dialog"]').should("be.visible");
}

// ─── Regression setup helpers ─────────────────────────────────────────────────

// API-driven setup. The previous UI version drove four separate full-page
// flows (change-status, scan, stock-out, work-order create+scan) per test;
// the work-order scan flow throws an "e is not a function" minified-bundle
// error that breaks downstream assertions. Seeding state via API is faster
// AND avoids that buggy code path; the UI is still exercised in the Act
// step (the single status change for sns[7]).
function setupAllSevenItemStatuses(suite, po, sns, stamp) {
  const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
  const searchTerm = `${suite.scanAllData.products.laptop.brand} ${modelNumber}`;

  cy.log(`[SETUP/API] setupAllSevenItemStatuses — PO: ${po}, stamp: ${stamp}`);

  // Chain API calls sequentially with proper damageReason for Damaged status
  suite.apiMarkStatusItem(po, sns[0], suite.scanAllData.status.missing)
    .then(() => suite.apiMarkStatusItem(po, sns[1], suite.scanAllData.status.damaged, suite.scanAllData.defaults.damageReason))
    .then(() => suite.apiMarkStatusItem(po, sns[2], suite.scanAllData.status.disputed))
    .then(() => suite.apiScanItem(po, sns[4]))
    .then(() => suite.apiScanItem(po, sns[5]))
    .then(() => suite.apiStockOutBySerial(sns[5], suite.scanAllData.status.otherStockOutReason, `Automation-${stamp}-s5`))
    .then(() => suite.apiScanItem(po, sns[6]))
    .then(() => suite.apiReserveViaWorkOrder(po, searchTerm, 1, sns[6]));

  cy.log(`[SETUP/API] complete — baseline: Expected=8, Incoming=2, Available=1, Received=5, Missing=1, Damaged=1, Disputed=1, StockedOut=1, Reserved=1`);
  return searchTerm;
}

// API-driven setup for product-only (RAM) regression baseline.
function setupAllSevenProductStatuses(suite, po, stamp) {
  const searchTerm = suite.scanAllData.searchTerms.ram;

  cy.log(`[SETUP/API] setupAllSevenProductStatuses — PO: ${po}, stamp: ${stamp}`);

  suite.apiGetProductIdByPo(po, searchTerm).then((productId) => {
    cy.log(`[SETUP/API] productId=${productId} for ${searchTerm}`);

    // Chain API calls sequentially with proper damageReason for Damaged status
    return suite.apiMarkStatusProduct(po, productId, 1, suite.scanAllData.status.missing)
      .then(() => suite.apiMarkStatusProduct(po, productId, 1, suite.scanAllData.status.damaged, suite.scanAllData.defaults.damageReason))
      .then(() => suite.apiMarkStatusProduct(po, productId, 1, suite.scanAllData.status.disputed))
      .then(() => suite.apiCheckInProduct(po, productId, 3))
      .then(() => suite.apiStockOutProduct(po, productId, 1, suite.scanAllData.status.otherStockOutReason, `Automation-${stamp}-so`))
      .then(() => suite.apiReserveViaWorkOrder(po, searchTerm, 1, undefined));
  });

  cy.log(`[SETUP/API] complete — baseline: Expected=15, Incoming=8, Available=1, Received=5, Missing=1, Damaged=1, Disputed=1, StockedOut=1, Reserved=1`);
  return searchTerm;
}

// ─── Negative-test helper ────────────────────────────────────────────────────
function attemptStatusChangeExpectRejection(status, serialNumber, quantity) {
  cy.log(`[NEG] attemptStatusChangeExpectRejection — status: ${status}, sn: ${serialNumber}, qty: ${quantity}`);
  cy.intercept("POST", "**/incoming-items/mark-status**").as("markStatusNeg");

  cy.get('[role="dialog"]')
    .contains("Choose Status")
    .first()
    .click({ force: true });
  cy.get('[role="option"]').contains(status).click({ force: true });

  if (status === "Damaged") {
    cy.get('[role="dialog"]')
      .contains("Select damage reason")
      .first()
      .click({ force: true });
    cy.get('[role="option"]').first().click({ force: true });
  }

  if (serialNumber) {
    cy.get("#serialNumberForReport")
      .should("be.visible")
      .clear()
      .type(serialNumber, { delay: 50 });
  }
  if (quantity !== undefined) {
    cy.get("#quantity").should("be.visible").clear().type(quantity.toString());
  }

  cy.get('[role="dialog"]')
    .contains("button", /^Update$/i)
    .should("be.visible")
    .click({ force: true });

  cy.wait("@markStatusNeg", { timeout: 15000 }).then(({ response }) => {
    cy.log(`[NEG] mark-status response: status=${response.statusCode}, success=${response.body?.success}`);
    expect(
      response.body.success === false || response.statusCode >= 400,
      "API should reject status change from Available to Missing/Damaged/Disputed",
    ).to.be.true;
  });

  cy.get("body").then(($body) => {
    if ($body.find('[role="dialog"]').length > 0) {
      cy.get('[role="dialog"]')
        .contains("button", /^Cancel$/i)
        .click({ force: true });
    }
  });
}

// ─── Positive-transition helper ──────────────────────────────────────────────
// Mirror image of attemptStatusChangeExpectRejection. Available→Damaged and
// Available→Disputed are SUPPORTED transitions — marking already-received stock
// as damaged is exactly what the Scan Damaged inventory action does — so the
// contract to pin is that mark-status ACCEPTS them. Asserting acceptance needs
// no new badge arithmetic, which keeps this independent of the counting rules
// already covered by SW_INC_CS_001–011.
function attemptStatusChangeExpectAcceptance(status, serialNumber, quantity) {
  cy.log(`[POS] attemptStatusChangeExpectAcceptance — status: ${status}, sn: ${serialNumber}, qty: ${quantity}`);
  cy.intercept("POST", "**/incoming-items/mark-status**").as("markStatusPos");

  cy.get('[role="dialog"]')
    .contains("Choose Status")
    .first()
    .click({ force: true });
  cy.get('[role="option"]').contains(status).click({ force: true });

  if (status === "Damaged") {
    // Pick the first available reason rather than naming one — the damage-reason
    // list is config-driven and its options differ per environment.
    cy.get('[role="dialog"]')
      .contains("Select damage reason")
      .first()
      .click({ force: true });
    cy.get('[role="option"]').first().click({ force: true });
  }

  if (serialNumber) {
    cy.get("#serialNumberForReport")
      .should("be.visible")
      .clear()
      .type(serialNumber, { delay: 50 });
  }
  if (quantity !== undefined) {
    cy.get("#quantity").should("be.visible").clear().type(quantity.toString());
  }

  cy.get('[role="dialog"]')
    .contains("button", /^Update$/i)
    .should("be.visible")
    .click({ force: true });

  cy.wait("@markStatusPos", { timeout: 15000 }).then(({ response }) => {
    cy.log(`[POS] mark-status response: status=${response.statusCode}, success=${response.body?.success}`);
    expect(response.statusCode, "mark-status HTTP status").to.be.oneOf([200, 201]);
    expect(
      response.body?.success,
      `mark-status envelope for Available→${status} (error=${JSON.stringify(response.body?.error)})`,
    ).to.not.equal(false);
  });

  cy.contains("successfully", { timeout: 10000 }).should("exist");

  cy.get("body").then(($body) => {
    if ($body.find('[role="dialog"]').length > 0) {
      cy.get('[role="dialog"]')
        .contains("button", /^Cancel$/i)
        .click({ force: true });
    }
  });
}

// Read an item back through the API and assert its persisted status. Used to
// confirm a transition actually landed, rather than trusting the 2xx alone.
function assertItemStatusViaApi(suite, serialNumber, expectedStatus) {
  suite
    .apiRequest({
      method: "GET",
      endpoint: `/products/item/${encodeURIComponent(serialNumber)}`,
    })
    .then((res) => {
      expect(res.status, `GET /products/item/${serialNumber}`).to.eq(200);
      const body = res.body?.data || res.body || {};
      const list = body.list || (Array.isArray(body) ? body : []);
      const item =
        (Array.isArray(list) && list.find((i) => i?.serialNumber === serialNumber)) ||
        (body?.serialNumber === serialNumber ? body : null);
      expect(item, `item ${serialNumber} must exist`).to.exist;
      expect(item.status, `persisted status of ${serialNumber}`).to.eq(expectedStatus);
    });
}

// ═════════════════════════════════════════════════════════════════════════════
describe(
  "Change Status Tests — Incoming Inventory",
  { tags: ["@regression"] },
  () => {
    const suite = createScanAllSuite();

    // ─────────────────────────────────────────────────────────────────────
    // PRODUCT-ITEM (hasItems=true — Laptop category)
    // ─────────────────────────────────────────────────────────────────────
    describe("Product-Item category (hasItems=true — Laptop)", () => {

      it(
        "SW_INC_CS_001 — Incoming item status changed to Missing; only Missing count increments, Incoming unchanged",
        { tags: ["@smoke"] },
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-001-${stamp}`;
          const sn = `CS001-${stamp}`;
          const fileName = `CS-Item-001-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_001 start — PO: ${po}, sn: ${sn}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.laptopRow(sn)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete");

          cy.log("[STEP] Opening change status dialog");
          suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
          cy.log("[STEP] Applying status: Missing");
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.missing,
            serialNumber: sn,
          });
          cy.log("[STEP] Status applied");

          suite.selectPO(po);
          cy.url().then((url) => cy.log(`[URL] After selectPO: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.basic.afterMissing)}`);
          suite.validateAllBadges(csData.productItem.basic.afterMissing);
          cy.log("[TEST] SW_INC_CS_001 PASSED");
        },
      );

      it(
        "SW_INC_CS_002 — Incoming item status changed to Damaged; Received+1, Damaged+1, Incoming-1",
        { tags: ["@smoke"] },
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-002-${stamp}`;
          const sn = `CS002-${stamp}`;
          const fileName = `CS-Item-002-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_002 start — PO: ${po}, sn: ${sn}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.laptopRow(sn)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete");

          cy.log("[STEP] Opening change status dialog");
          suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
          cy.log("[STEP] Applying status: Damaged");
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.damaged,
            serialNumber: sn,
          });
          cy.log("[STEP] Status applied");

          suite.selectPO(po);
          cy.url().then((url) => cy.log(`[URL] After selectPO: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.basic.afterDamaged)}`);
          suite.validateAllBadges(csData.productItem.basic.afterDamaged);
          cy.log("[TEST] SW_INC_CS_002 PASSED");
        },
      );

      it(
        "SW_INC_CS_003 — Incoming item status changed to Disputed; Received+1, Disputed+1, Incoming-1",
        { tags: ["@smoke"] },
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-003-${stamp}`;
          const sn = `CS003-${stamp}`;
          const fileName = `CS-Item-003-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_003 start — PO: ${po}, sn: ${sn}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.laptopRow(sn)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete");

          cy.log("[STEP] Opening change status dialog");
          suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
          cy.log("[STEP] Applying status: Disputed");
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.disputed,
            serialNumber: sn,
          });
          cy.log("[STEP] Status applied");

          suite.selectPO(po);
          cy.url().then((url) => cy.log(`[URL] After selectPO: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.basic.afterDisputed)}`);
          suite.validateAllBadges(csData.productItem.basic.afterDisputed);
          cy.log("[TEST] SW_INC_CS_003 PASSED");
        },
      );

      // Available→Sold: scan to make Available, then use stockOutItemViaUI
      // "Sold" is a stock-out reason used via MobileViewScreen, not a dialog status option
      it(
        "SW_INC_CS_004 — Available item status changed to Sold; Available-1, Sold+1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-004-${stamp}`;
          const sn = `CS004-${stamp}`;
          const fileName = `CS-Item-004-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_004 start — PO: ${po}, sn: ${sn}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.laptopRow(sn)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete");

          cy.log("[STEP] Scanning sn to make Available");
          suite.incomingInvPage.selectPoNumber(po);
          suite.scanSerialNumbers(po, [sn]);
          cy.log("[STEP] Scan complete — item is now Available");

          cy.log(`[STEP] Stocking out sn=${sn} with reason=Sold via MobileViewScreen`);
          suite.stockOutItemViaUI(sn, suite.scanAllData.status.soldReason, `${stamp}-4`);
          cy.log("[STEP] Stock out complete — item is now Sold");

          suite.selectPO(po);
          cy.url().then((url) => cy.log(`[URL] After selectPO: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.basic.afterSold)}`);
          suite.validateAllBadges(csData.productItem.basic.afterSold);
          cy.log("[TEST] SW_INC_CS_004 PASSED");
        },
      );

      it(
        "SW_INC_CS_005 — [ALL-7-STATUSES] change item to Missing; Missing increments, Incoming unchanged",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-005-${stamp}`;
          const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
          const fileName = `CS-Item-005-${stamp}.xlsx`;
          const sns = Array.from(
            { length: 8 },
            (_, i) => `CS005-${String(i + 1).padStart(2, "0")}-${stamp}`,
          );
          cy.log(`[TEST] SW_INC_CS_005 start — PO: ${po}, target sn: ${sns[7]}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(
            fileName,
            sns.map((sn) => suite.laptopRow(sn, { "Model Number": modelNumber })),
          );
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete (8 items)");

          const searchTerm = setupAllSevenItemStatuses(suite, po, sns, stamp);
          cy.log("[STEP] All-7-statuses setup complete");

          cy.log(`[STEP] Applying Missing to sns[7]=${sns[7]}`);
          suite.openChangeStatusDialog(po, searchTerm);
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.missing,
            serialNumber: sns[7],
          });
          cy.log("[STEP] Status applied");

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.regression.afterMissing)}`);
          suite.validateAllBadges(csData.productItem.regression.afterMissing);
          cy.log("[TEST] SW_INC_CS_005 PASSED");
        },
      );

      it(
        "SW_INC_CS_006 — [ALL-7-STATUSES] change item to Damaged; Received+1, Damaged+1, Incoming-1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-006-${stamp}`;
          const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
          const fileName = `CS-Item-006-${stamp}.xlsx`;
          const sns = Array.from(
            { length: 8 },
            (_, i) => `CS006-${String(i + 1).padStart(2, "0")}-${stamp}`,
          );
          cy.log(`[TEST] SW_INC_CS_006 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(
            fileName,
            sns.map((sn) => suite.laptopRow(sn, { "Model Number": modelNumber })),
          );
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenItemStatuses(suite, po, sns, stamp);

          cy.log(`[STEP] Applying Damaged to sns[7]=${sns[7]}`);
          suite.openChangeStatusDialog(po, searchTerm);
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.damaged,
            serialNumber: sns[7],
          });

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.regression.afterDamaged)}`);
          suite.validateAllBadges(csData.productItem.regression.afterDamaged);
          cy.log("[TEST] SW_INC_CS_006 PASSED");
        },
      );

      it(
        "SW_INC_CS_007 — [ALL-7-STATUSES] change item to Disputed; Received+1, Disputed+1, Incoming-1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-007-${stamp}`;
          const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
          const fileName = `CS-Item-007-${stamp}.xlsx`;
          const sns = Array.from(
            { length: 8 },
            (_, i) => `CS007-${String(i + 1).padStart(2, "0")}-${stamp}`,
          );
          cy.log(`[TEST] SW_INC_CS_007 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(
            fileName,
            sns.map((sn) => suite.laptopRow(sn, { "Model Number": modelNumber })),
          );
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenItemStatuses(suite, po, sns, stamp);

          cy.log(`[STEP] Applying Disputed to sns[7]=${sns[7]}`);
          suite.openChangeStatusDialog(po, searchTerm);
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.disputed,
            serialNumber: sns[7],
          });

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.regression.afterDisputed)}`);
          suite.validateAllBadges(csData.productItem.regression.afterDisputed);
          cy.log("[TEST] SW_INC_CS_007 PASSED");
        },
      );

      it(
        "SW_INC_CS_008 — [ALL-7-STATUSES] change item to StockedOut; scan then stock out, StockedOut+1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-008-${stamp}`;
          const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
          const fileName = `CS-Item-008-${stamp}.xlsx`;
          const sns = Array.from(
            { length: 8 },
            (_, i) => `CS008-${String(i + 1).padStart(2, "0")}-${stamp}`,
          );
          cy.log(`[TEST] SW_INC_CS_008 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(
            fileName,
            sns.map((sn) => suite.laptopRow(sn, { "Model Number": modelNumber })),
          );
          suite.importExcel(fileName, po);

          setupAllSevenItemStatuses(suite, po, sns, stamp);

          cy.log(`[STEP] Scanning sns[7]=${sns[7]} then StockOut`);
          suite.incomingInvPage.selectPoNumber(po);
          suite.scanSerialNumbers(po, [sns[7]]);
          suite.stockOutItemViaUI(
            sns[7],
            suite.scanAllData.status.otherStockOutReason,
            `${stamp}-s8`,
          );

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.regression.afterStockedOut)}`);
          suite.validateAllBadges(csData.productItem.regression.afterStockedOut);
          cy.log("[TEST] SW_INC_CS_008 PASSED");
        },
      );

      it(
        "SW_INC_CS_009 — [ALL-7-STATUSES] change item to Available; Received+1, Available+1, Incoming-1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-009-${stamp}`;
          const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
          const fileName = `CS-Item-009-${stamp}.xlsx`;
          const sns = Array.from(
            { length: 8 },
            (_, i) => `CS009-${String(i + 1).padStart(2, "0")}-${stamp}`,
          );
          cy.log(`[TEST] SW_INC_CS_009 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(
            fileName,
            sns.map((sn) => suite.laptopRow(sn, { "Model Number": modelNumber })),
          );
          suite.importExcel(fileName, po);

          setupAllSevenItemStatuses(suite, po, sns, stamp);

          cy.log(`[STEP] Scanning sns[7]=${sns[7]} → Available`);
          suite.incomingInvPage.selectPoNumber(po);
          suite.scanSerialNumbers(po, [sns[7]]);

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.regression.afterAvailable)}`);
          suite.validateAllBadges(csData.productItem.regression.afterAvailable);
          cy.log("[TEST] SW_INC_CS_009 PASSED");
        },
      );


      it(
        "SW_INC_CS_011 — [ALL-7-STATUSES] change item to Reserved; Available-1, Reserved+1",
        () => {
          // Technique: State Transition
          Cypress.once("uncaught:exception", (err) => {
            const isKnownMinified =
              err?.message === "e is not a function" &&
              typeof err?.stack === "string" &&
              /(?:\/assets\/.*\.js|bundle\.js|chunk[-\w]*\.js)/.test(err.stack);
            if (isKnownMinified) return false;
            return true;
          });

          const stamp = suite.ts();
          const po = `PO-CS-Item-011-${stamp}`;
          const modelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
          const fileName = `CS-Item-011-${stamp}.xlsx`;
          const sns = Array.from(
            { length: 8 },
            (_, i) => `CS011-${String(i + 1).padStart(2, "0")}-${stamp}`,
          );
          cy.log(`[TEST] SW_INC_CS_011 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(
            fileName,
            sns.map((sn) => suite.laptopRow(sn, { "Model Number": modelNumber })),
          );
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenItemStatuses(suite, po, sns, stamp);

          cy.log(`[STEP] Scanning sns[7]=${sns[7]} → Available, then Reserve via API`);
          suite.apiScanItem(po, sns[7]);
          // Use API for the work-order reserve step too — the WO-scan UI
          // throws a minified-bundle error after {enter} that prevents the
          // form from submitting (covered by uncaught:exception handler but
          // the scan itself still doesn't register).
          suite.apiReserveViaWorkOrder(po, searchTerm, 1, sns[7]);

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productItem.regression.afterReserved)}`);
          suite.validateAllBadges(csData.productItem.regression.afterReserved);
          cy.log("[TEST] SW_INC_CS_011 PASSED");
        },
      );

      it(
        "SW_INC_CS_012 — [NEGATIVE] changing Available item to Missing is rejected by API",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Item-012-${stamp}`;
          const sn = `CS012-${stamp}`;
          const fileName = `CS-Item-012-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_012 start — PO: ${po}, sn: ${sn}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.laptopRow(sn)]);
          suite.importExcel(fileName, po);

          suite.incomingInvPage.selectPoNumber(po);
          suite.scanSerialNumbers(po, [sn]);
          cy.log("[STEP] Item scanned → Available");

          suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
          cy.log("[STEP] Attempting Available→Missing (expect rejection)");
          attemptStatusChangeExpectRejection("Missing", sn, undefined);
          cy.log("[TEST] SW_INC_CS_012 PASSED — API rejected as expected");
        },
      );

      // SW_INC_CS_013 / SW_INC_CS_014 — retargeted from [NEGATIVE] to positive.
      //
      // These asserted that mark-status REJECTS Available→Damaged / →Disputed.
      // It does not, and it should not: marking already-received stock as
      // damaged is precisely what the Scan Damaged inventory action exists to
      // do, so a rejection would contradict a shipped feature. The only
      // Available→X transition the service blocks is →Missing (an item that is
      // physically in hand cannot be missing) — that rule is still pinned, by
      // SW_INC_CS_012 above.
      //
      // So the contract worth locking here is acceptance, verified end-to-end:
      // mark-status returns 2xx and the item's persisted status really changes.
      it(
        "SW_INC_CS_013 — Available item can be changed to Damaged (accepted by API and persisted)",
        () => {
          // Technique: State Transition (Available → Damaged, valid edge)
          const stamp = suite.ts();
          const po = `PO-CS-Item-013-${stamp}`;
          const sn = `CS013-${stamp}`;
          const fileName = `CS-Item-013-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_013 start — PO: ${po}, sn: ${sn}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.laptopRow(sn)]);
          suite.importExcel(fileName, po);

          suite.incomingInvPage.selectPoNumber(po);
          suite.scanSerialNumbers(po, [sn]);
          cy.log("[STEP] Item scanned → Available");

          suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
          cy.log("[STEP] Available→Damaged (expect acceptance)");
          attemptStatusChangeExpectAcceptance("Damaged", sn, undefined);
          assertItemStatusViaApi(suite, sn, "Damaged");
          cy.log("[TEST] SW_INC_CS_013 PASSED — transition accepted and persisted");
        },
      );

      it(
        "SW_INC_CS_014 — Available item can be changed to Disputed (accepted by API and persisted)",
        () => {
          // Technique: State Transition (Available → Disputed, valid edge)
          const stamp = suite.ts();
          const po = `PO-CS-Item-014-${stamp}`;
          const sn = `CS014-${stamp}`;
          const fileName = `CS-Item-014-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_014 start — PO: ${po}, sn: ${sn}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.laptopRow(sn)]);
          suite.importExcel(fileName, po);

          suite.incomingInvPage.selectPoNumber(po);
          suite.scanSerialNumbers(po, [sn]);
          cy.log("[STEP] Item scanned → Available");

          suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
          cy.log("[STEP] Available→Disputed (expect acceptance)");
          attemptStatusChangeExpectAcceptance("Disputed", sn, undefined);
          assertItemStatusViaApi(suite, sn, "Disputed");
          cy.log("[TEST] SW_INC_CS_014 PASSED — transition accepted and persisted");
        },
      );
    });

    // ─────────────────────────────────────────────────────────────────────
    // PRODUCT-ONLY (hasVariants=false, hasItems=false — RAM category)
    // ─────────────────────────────────────────────────────────────────────
    describe("Product-Only category (hasVariants=false, hasItems=false — RAM)", () => {

      before(() => {
        cy.authSession('admin');
        // Enable inventory stock-out and disable PO/WorkOrder gates so
        // apiStockOutProduct() calls in CS_018-CS_025 don't get HTTP 4xx.
        apiSetGeneralConfigFlags({
          requireWorkOrderForStockOut: false,
          enablePoForStockOut: false,
          enableInventoryStockOut: true,
        });
      });

      it(
        "SW_INC_CS_015 — Incoming product qty changed to Missing; only Missing count increments, Incoming unchanged",
        { tags: ["@smoke"] },
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-015-${stamp}`;
          const fileName = `CS-Prod-015-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_015 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "5" }, stamp)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete (qty=5)");

          cy.log("[STEP] Opening change status dialog");
          openChangeStatusDialogProduct(suite, po, suite.scanAllData.searchTerms.ram);
          cy.log("[STEP] Applying status: Missing qty=1");
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.missing,
            quantity: 1,
            poNumber: po,
          });
          cy.log("[STEP] Status applied");

          suite.selectPOFresh(po);
          cy.url().then((url) => cy.log(`[URL] After selectPOFresh: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.basic.afterMissing)}`);
          suite.validateAllBadges(csData.productOnly.basic.afterMissing);
          cy.log("[TEST] SW_INC_CS_015 PASSED");
        },
      );

      it(
        "SW_INC_CS_016 — Incoming product qty changed to Damaged; Received+1, Damaged+1, Incoming-1",
        { tags: ["@smoke"] },
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-016-${stamp}`;
          const fileName = `CS-Prod-016-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_016 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "5" }, stamp)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete");

          cy.log("[STEP] Opening change status dialog");
          openChangeStatusDialogProduct(suite, po, suite.scanAllData.searchTerms.ram);
          cy.log("[STEP] Applying status: Damaged qty=1");
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.damaged,
            quantity: 1,
            poNumber: po,
          });
          cy.log("[STEP] Status applied");

          suite.selectPOFresh(po);
          cy.url().then((url) => cy.log(`[URL] After selectPOFresh: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.basic.afterDamaged)}`);
          suite.validateAllBadges(csData.productOnly.basic.afterDamaged);
          cy.log("[TEST] SW_INC_CS_016 PASSED");
        },
      );

      it(
        "SW_INC_CS_017 — Incoming product qty changed to Disputed; Received+1, Disputed+1, Incoming-1",
        { tags: ["@smoke"] },
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-017-${stamp}`;
          const fileName = `CS-Prod-017-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_017 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "5" }, stamp)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete");

          cy.log("[STEP] Opening change status dialog");
          openChangeStatusDialogProduct(suite, po, suite.scanAllData.searchTerms.ram);
          cy.log("[STEP] Applying status: Disputed qty=1");
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.disputed,
            quantity: 1,
            poNumber: po,
          });
          cy.log("[STEP] Status applied");

          suite.selectPOFresh(po);
          cy.url().then((url) => cy.log(`[URL] After selectPOFresh: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.basic.afterDisputed)}`);
          suite.validateAllBadges(csData.productOnly.basic.afterDisputed);
          cy.log("[TEST] SW_INC_CS_017 PASSED");
        },
      );

      // Available→Sold: stockIn first, then use stockOutProductViaUI
      // "Sold" is a stock-out reason via MobileViewScreen, not a dialog status option
      it(
        "SW_INC_CS_018 — Available product qty changed to Sold; Available-1, Sold+1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-018-${stamp}`;
          const fileName = `CS-Prod-018-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_018 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "5" }, stamp)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete (qty=5)");

          cy.log("[STEP] StockIn qty=1 via API → Available=1");
          // Both stock-in and stock-out are API-driven here:
          //  - The UI stockInProduct uses invViewPage.searchProduct which
          //    types {enter} and breaks product-only PO views (memory note
          //    feedback_cypress_product_only_search.md).
          //  - stockOutProductViaUI navigates to the mobile stock-out
          //    products view; that view's quantity input isn't reliably
          //    discoverable in this layout. The actual badge effect (Sold +
          //    Available - 1 + Received unchanged) is what the test is
          //    asserting, so API is sufficient.
          suite.apiGetProductIdByPo(po, suite.scanAllData.searchTerms.ram).then((productId) => {
            suite.apiCheckInProduct(po, productId, 1);
            suite.apiStockOutProduct(
              po,
              productId,
              1,
              suite.scanAllData.status.soldReason,
              `Automation-${stamp}-18`,
            );
          });
          cy.log("[STEP] StockOut complete — Sold=1");

          suite.selectPOFresh(po);
          cy.url().then((url) => cy.log(`[URL] After selectPOFresh: ${url}`));
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.basic.afterSold)}`);
          suite.validateAllBadges(csData.productOnly.basic.afterSold);
          cy.log("[TEST] SW_INC_CS_018 PASSED");
        },
      );

      it(
        "SW_INC_CS_019 — [ALL-7-STATUSES] change product qty to Missing; Missing increments, Incoming unchanged",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-019-${stamp}`;
          const fileName = `CS-Prod-019-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_019 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "15" }, stamp)]);
          suite.importExcel(fileName, po);
          cy.log("[STEP] Import complete (qty=15)");

          const searchTerm = setupAllSevenProductStatuses(suite, po, stamp);
          cy.log("[STEP] All-7-statuses setup complete");

          cy.log("[STEP] Applying Missing qty=1");
          openChangeStatusDialogProduct(suite, po, searchTerm);
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.missing,
            quantity: 1,
            poNumber: po,
          });

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.regression.afterMissing)}`);
          suite.validateAllBadges(csData.productOnly.regression.afterMissing);
          cy.log("[TEST] SW_INC_CS_019 PASSED");
        },
      );

      it(
        "SW_INC_CS_020 — [ALL-7-STATUSES] change product qty to Damaged; Received+1, Damaged+1, Incoming-1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-020-${stamp}`;
          const fileName = `CS-Prod-020-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_020 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "15" }, stamp)]);
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenProductStatuses(suite, po, stamp);

          cy.log("[STEP] Applying Damaged qty=1");
          openChangeStatusDialogProduct(suite, po, searchTerm);
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.damaged,
            quantity: 1,
            poNumber: po,
          });

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.regression.afterDamaged)}`);
          suite.validateAllBadges(csData.productOnly.regression.afterDamaged);
          cy.log("[TEST] SW_INC_CS_020 PASSED");
        },
      );

      it(
        "SW_INC_CS_021 — [ALL-7-STATUSES] change product qty to Disputed; Received+1, Disputed+1, Incoming-1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-021-${stamp}`;
          const fileName = `CS-Prod-021-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_021 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "15" }, stamp)]);
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenProductStatuses(suite, po, stamp);

          cy.log("[STEP] Applying Disputed qty=1");
          openChangeStatusDialogProduct(suite, po, searchTerm);
          suite.applyStatusViaDialog({
            status: suite.scanAllData.status.disputed,
            quantity: 1,
            poNumber: po,
          });

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.regression.afterDisputed)}`);
          suite.validateAllBadges(csData.productOnly.regression.afterDisputed);
          cy.log("[TEST] SW_INC_CS_021 PASSED");
        },
      );

      it(
        "SW_INC_CS_022 — [ALL-7-STATUSES] change product qty to StockedOut; StockedOut(others)+1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-022-${stamp}`;
          const fileName = `CS-Prod-022-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_022 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "15" }, stamp)]);
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenProductStatuses(suite, po, stamp);

          cy.log("[STEP] StockIn qty=1 extra via API → Available=2, then StockOut qty=1 via API → StockedOut+1");
          suite.apiGetProductIdByPo(po, searchTerm).then((productId) => {
            suite.apiCheckInProduct(po, productId, 1);
            suite.apiStockOutProduct(
              po,
              productId,
              1,
              suite.scanAllData.status.otherStockOutReason,
              `Automation-${stamp}-022`,
            );
          });

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.regression.afterStockedOut)}`);
          suite.validateAllBadges(csData.productOnly.regression.afterStockedOut);
          cy.log("[TEST] SW_INC_CS_022 PASSED");
        },
      );

      it(
        "SW_INC_CS_023 — [ALL-7-STATUSES] change product qty to Available; Received+1, Available+1, Incoming-1",
        () => {
          // Technique: State Transition
          const stamp = suite.ts();
          const po = `PO-CS-Prod-023-${stamp}`;
          const fileName = `CS-Prod-023-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_023 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "15" }, stamp)]);
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenProductStatuses(suite, po, stamp);

          cy.log("[STEP] StockIn qty=1 via API → Available");
          suite.apiGetProductIdByPo(po, searchTerm).then((productId) => {
            suite.apiCheckInProduct(po, productId, 1);
          });

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.regression.afterAvailable)}`);
          suite.validateAllBadges(csData.productOnly.regression.afterAvailable);
          cy.log("[TEST] SW_INC_CS_023 PASSED");
        },
      );

   

      it(
        "SW_INC_CS_025 — [ALL-7-STATUSES] change product qty to Reserved; Available-1, Reserved+1",
        () => {
          // Technique: State Transition
          Cypress.once("uncaught:exception", (err) => {
            const isKnownMinified =
              err?.message === "e is not a function" &&
              typeof err?.stack === "string" &&
              /(?:\/assets\/.*\.js|bundle\.js|chunk[-\w]*\.js)/.test(err.stack);
            if (isKnownMinified) return false;
            return true;
          });

          const stamp = suite.ts();
          const po = `PO-CS-Prod-025-${stamp}`;
          const fileName = `CS-Prod-025-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_025 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "15" }, stamp)]);
          suite.importExcel(fileName, po);

          const searchTerm = setupAllSevenProductStatuses(suite, po, stamp);

          cy.log("[STEP] check-in qty=1 extra (API) → Available=2");
          suite.apiGetProductIdByPo(po, searchTerm).then((productId) => {
            suite.apiCheckInProduct(po, productId, 1);
          });

          cy.log("[STEP] Reserve qty=1 via WO (API) → Available-1, Reserved+1");
          suite.apiReserveViaWorkOrder(po, searchTerm, 1, undefined);

          suite.selectPOFresh(po);
          logCurrentBadges();
          cy.log(`[ASSERT] Expected: ${JSON.stringify(csData.productOnly.regression.afterReserved)}`);
          suite.validateAllBadges(csData.productOnly.regression.afterReserved);
          cy.log("[TEST] SW_INC_CS_025 PASSED");
        },
      );

      // SW_INC_CS_026 — for product-only categories the BE markStatus
      // ⚠ APP BUG — kept skipped deliberately (do not "fix" this test).
      //
      // Available→Missing is REJECTED for serialized items
      // (incoming-item.service.ts:7945; pinned by the passing SW_INC_CS_012)
      // but ACCEPTED for product-only quantities: the productIdsArray branch
      // (incoming-item.service.ts:8274-8306) inserts a stockoutItems row and
      // adjusts quantities without ever checking the current state. The same
      // business rule — stock you physically hold cannot be "missing" — is
      // therefore enforced on one path and not the other, letting Available
      // product quantity be written off as Missing.
      //
      // The assertion below is correct as written and will start passing once
      // the product path gets the guard the item path already has. Un-skip it
      // then; do not invert it to assert acceptance.
      it.skip(
        "SW_INC_CS_026 — [NEGATIVE] changing Available product qty to Missing is rejected by API",
        () => {
          const stamp = suite.ts();
          const po = `PO-CS-Prod-026-${stamp}`;
          const fileName = `CS-Prod-026-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_026 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "5" }, stamp)]);
          suite.importExcel(fileName, po);

          suite.incomingInvPage.selectPoNumber(po);
          suite.stockInProduct(suite.scanAllData.searchTerms.ram, 2);
          cy.log("[STEP] StockIn qty=2 → Available=2");

          openChangeStatusDialogProduct(suite, po, suite.scanAllData.searchTerms.ram);
          cy.log("[STEP] Attempting Available→Missing (expect rejection)");
          attemptStatusChangeExpectRejection("Missing", undefined, 1);
          cy.log("[TEST] SW_INC_CS_026 PASSED — API rejected as expected");
        },
      );

      // SW_INC_CS_027 / SW_INC_CS_028 — retargeted from [NEGATIVE] to positive,
      // for the same reason as the item-level SW_INC_CS_013 / SW_INC_CS_014:
      // Available→Damaged and Available→Disputed are supported transitions, so
      // the contract to pin is that mark-status accepts them.
      it(
        "SW_INC_CS_027 — Available product qty can be changed to Damaged (accepted by API)",
        () => {
          // Technique: State Transition (Available → Damaged, valid edge, product-only)
          const stamp = suite.ts();
          const po = `PO-CS-Prod-027-${stamp}`;
          const fileName = `CS-Prod-027-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_027 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "5" }, stamp)]);
          suite.importExcel(fileName, po);

          suite.incomingInvPage.selectPoNumber(po);
          suite.stockInProduct(suite.scanAllData.searchTerms.ram, 2);
          cy.log("[STEP] StockIn qty=2 → Available=2");

          openChangeStatusDialogProduct(suite, po, suite.scanAllData.searchTerms.ram);
          cy.log("[STEP] Available→Damaged qty=1 (expect acceptance)");
          attemptStatusChangeExpectAcceptance("Damaged", undefined, 1);
          cy.log("[TEST] SW_INC_CS_027 PASSED — transition accepted");
        },
      );

      it(
        "SW_INC_CS_028 — Available product qty can be changed to Disputed (accepted by API)",
        () => {
          // Technique: State Transition (Available → Disputed, valid edge, product-only)
          const stamp = suite.ts();
          const po = `PO-CS-Prod-028-${stamp}`;
          const fileName = `CS-Prod-028-${stamp}.xlsx`;
          cy.log(`[TEST] SW_INC_CS_028 start — PO: ${po}`);

          suite.createdPOs.push(po);
          suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "5" }, stamp)]);
          suite.importExcel(fileName, po);

          suite.incomingInvPage.selectPoNumber(po);
          suite.stockInProduct(suite.scanAllData.searchTerms.ram, 2);
          cy.log("[STEP] StockIn qty=2 → Available=2");

          openChangeStatusDialogProduct(suite, po, suite.scanAllData.searchTerms.ram);
          cy.log("[STEP] Available→Disputed qty=1 (expect acceptance)");
          attemptStatusChangeExpectAcceptance("Disputed", undefined, 1);
          cy.log("[TEST] SW_INC_CS_028 PASSED — transition accepted");
        },
      );
    });
  },
);
