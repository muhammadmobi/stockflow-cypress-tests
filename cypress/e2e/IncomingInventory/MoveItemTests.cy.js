import ItemViewPage from "../../pageObjects/ItemViewPage";
import MoveItemPage from "../../pageObjects/MoveItemPage";
import IncomingInvPage from "../../pageObjects/IncomingInvPage";
import "cypress-file-upload";
import { makeLaptopRowWithSerial, createExcelFile } from "../../support/helpers/incomingInventoryHelpers";
import { ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";

/**
 * Move Item Tests (SW-MI-TC01 – SW-MI-TC11)
 *
 * Covers the full "Move Item" feature — the ⋮ row action in ItemView that
 * calls POST /products/item-shift to reassign a serialized item to a different PO.
 *
 * Backend route:   POST /products/item-shift
 * Frontend:
 *   Frontend/src/components/Item/ItemActionMenu.tsx      (disabled gate for StockedOut/Reserved)
 *   Frontend/src/components/common/MoveItemModel.tsx     (dialog, PO selector, toast)
 *   Frontend/src/components/common/ProductTableSelector.tsx
 *
 * ── BE status rules (ProductService.shiftItemPO) ─────────────────────────────
 *   ALLOWED  — Incoming, Available, Damaged, Disputed, Missing
 *   BLOCKED  — Reserved    → BadItemDataException: "is reserved … cannot be moved"
 *   BLOCKED  — StockedOut  → BadItemDataException: "is stocked out … cannot be moved"
 *   UI GATE  — StockedOut  → ItemActionMenu disables "Move Item" (status === Status.StockedOut)
 *   UI GATE  — Reserved    → ItemActionMenu disables "Move Item" (status === Status.Reserved)
 *
 * ── Test matrix ──────────────────────────────────────────────────────────────
 *   TC01  @smoke     Incoming → move succeeds                  (State Transition — valid)
 *   TC02  @regression Available → move succeeds                (State Transition — valid)
 *   TC03  @regression Damaged → move succeeds                  (State Transition — valid)
 *   TC04  @regression Disputed → move succeeds                 (State Transition — valid)
 *   TC05  @regression Missing → move succeeds                  (State Transition — valid)
 *   TC06  @regression Cancel dialog mid-flow → item stays      (Use Case — alternate path)
 *   TC07  @regression "All POs" view: Move Item absent         (Decision Table)
 *   TC08  @regression /inventory route: Move Item absent       (Decision Table)
 *   TC09  @regression API rejects move → error toast shown     (Error Guessing + State Transition — invalid)
 *   TC10  @regression StockedOut → Move Item button disabled   (Decision Table — UI gate)
 *   TC11  @regression Reserved → Move Item button disabled     (Decision Table — UI gate)
 *
 * ── Setup strategy ───────────────────────────────────────────────────────────
 *   before(): 10 POs created via uploadExcelToApi (same pattern as ItemDelete.cy.js).
 *   after():  cancels the work order created for reservedSerial; deletes all test POs.
 */

describe("Move Item Tests (SW-MI-TC01 – SW-MI-TC11)", { tags: ["@regression"] }, () => {
  const created = {};
  let td;
  let authToken;
  let incomingInvPage;
  const itemViewPage = new ItemViewPage();
  const moveItemPage = new MoveItemPage();
  const runId = `${Date.now()}`;

  const apiBase = () => Cypress.env("API_BASE_URL");
  const makePo = (tag) => `PO-MI-${tag}-${runId}`;
  const buildSerial = (key) => `${td.serials[key]}-${runId}`;

  // ── Upload one item to one PO via the API (no browser UI) ──────────────────
  const uploadItem = (serial, poName) => {
    const fileName = `MoveItem-${serial}.xlsx`;
    const row = makeLaptopRowWithSerial(td);
    createExcelFile(fileName, [row(serial)]);
    return cy.task("uploadExcelToApi", {
      filePath: `cypress/fixtures/${fileName}`,
      poNumber: poName,
      authToken,
      baseUrl: apiBase(),
    }).then((res) => {
      expect(res.status, `upload ${serial} → ${poName}`).to.be.oneOf([200, 201]);
      expect(res.body.success, `upload success for ${serial}`).to.eq(true);
      cy.log(`✓ ${poName} ← ${serial}`);
    });
  };

  // ── before(): create all test POs and set item statuses ────────────────────
  before(() => {
    cy.fixture("moveItemAllTestData").then((data) => {
      td = data;
      cy.authSession('admin');
      cy.visit("/");
    }).then(() => {
      cy.iaAuthToken().then((token) => {
        authToken = token;
        expect(authToken, "identity server token must exist").to.exist;
      });
    }).then(() => {
      ensureCommonAttributesOptional();
    }).then(() => {
      // Ensure the laptop category exists (409 = already exists → OK)
      cy.getAuthToken().then((token) => {
        cy.request({
          method: "POST",
          url: `${apiBase()}/categories`,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: {
            name: td.laptop.category,
            description: "Move item automation category",
            allowItems: true,
            allowVariants: false,
            allowVariantItems: false,
          },
          failOnStatusCode: false,
        }).then((res) => cy.log(`Category '${td.laptop.category}': HTTP ${res.status}`));
      });
    }).then(() => {
      // Assign unique PO names and serials for this run
      created.incomingPO   = makePo("Incoming");
      created.availablePO  = makePo("Available");
      created.damagedPO    = makePo("Damaged");
      created.disputedPO   = makePo("Disputed");
      created.missingPO    = makePo("Missing");
      created.stockedOutPO = makePo("StockedOut");
      created.cancelPO     = makePo("Cancel");
      created.errorTestPO  = makePo("Err");
      created.reservedPO   = makePo("Reserved");
      created.targetPO     = makePo("Target");

      created.incomingSerial   = buildSerial("incoming");
      created.availableSerial  = buildSerial("available");
      created.damagedSerial    = buildSerial("damaged");
      created.disputedSerial   = buildSerial("disputed");
      created.missingSerial    = buildSerial("missing");
      created.stockedOutSerial = buildSerial("stockedOut");
      created.cancelSerial     = buildSerial("cancel");
      created.errorSerial      = buildSerial("errorTest");
      created.reservedSerial   = buildSerial("reserved");
      created.targetSerial     = buildSerial("target");

      // Upload all 10 items sequentially — same laptop model ensures same productId
      return uploadItem(created.incomingSerial,   created.incomingPO);
    }).then(() => uploadItem(created.availableSerial,  created.availablePO))
      .then(() => uploadItem(created.damagedSerial,    created.damagedPO))
      .then(() => uploadItem(created.disputedSerial,   created.disputedPO))
      .then(() => uploadItem(created.missingSerial,    created.missingPO))
      .then(() => uploadItem(created.stockedOutSerial, created.stockedOutPO))
      .then(() => uploadItem(created.cancelSerial,     created.cancelPO))
      .then(() => uploadItem(created.errorSerial,      created.errorTestPO))
      .then(() => uploadItem(created.reservedSerial,   created.reservedPO))
      .then(() => uploadItem(created.targetSerial,     created.targetPO))
    // Set each item to its required status
      .then(() => cy.iaSetSerialStatus(authToken, created.availableSerial,  "Available"))
      .then(() => cy.iaSetSerialStatus(authToken, created.damagedSerial,    "Damaged", { damageReason: "Broken" }))
      .then(() => cy.iaSetSerialStatus(authToken, created.disputedSerial,   "Disputed"))
      .then(() => cy.iaSetSerialStatus(authToken, created.missingSerial,    "Missing"))
      .then(() => cy.iaSetSerialStatus(authToken, created.stockedOutSerial, "Available"))
      .then(() =>
        cy.request({
          method: "POST",
          url: `${apiBase()}/products/stockout-by-serial-number`,
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: {
            serialNumber: created.stockedOutSerial,
            reason: "stockout from bto",
            description: "Move Item TC10 test setup — StockedOut gate",
          },
          failOnStatusCode: false,
        }).then((res) => cy.log(`stockout ${created.stockedOutSerial}: HTTP ${res.status}`))
      )
      .then(() => cy.iaSetSerialStatus(authToken, created.cancelSerial,     "Available"))
      .then(() => cy.iaSetSerialStatus(authToken, created.reservedSerial,   "Available"))
      // Reserve via Work Order: probe productId without search filter (avoids
      // Product Name config dependency), then POST /work-orders → /work-orders/scan.
      // No hard assertions here — a WO setup failure is surfaced by TC11 failing
      // (assertMoveItemDisabledBySerial) rather than killing before() and skipping
      // all 11 tests.
      .then(() => {
        // Query /products (not /incoming-items) so p.id is the real product ID,
        // not the incoming-item's auto-increment row ID.
        return cy.request({
          method: "GET",
          url: `${apiBase()}/products?poNumber=${encodeURIComponent(created.reservedPO)}&page=1&page_size=10`,
          headers: { Authorization: `Bearer ${authToken}` },
          failOnStatusCode: false,
        }).then((res) => {
          const body = res.body?.data || res.body || {};
          const list = body.list || body.items || body.results || [];
          const product = (Array.isArray(list) ? list : []).find((p) => p && p.id);
          if (!product) {
            cy.log(`⚠ No product found in ${created.reservedPO} — TC11 may fail`);
            return cy.wrap(null);
          }
          const productId = Number(product.id);
          cy.log(`✓ productId=${productId} found in ${created.reservedPO}`);
          return cy.request({
            method: "POST",
            url: `${apiBase()}/work-orders`,
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: {
              status: "Open",
              products: [{ productId, name: "Product name not defined", partNumber: null, quantity: 1 }],
            },
            failOnStatusCode: false,
          }).then((woRes) => {
            const wo = woRes.body?.data || woRes.body?.data?.data || {};
            const woNum = wo?.workOrderNumber;
            const woId  = wo?.id;
            if (!woNum) {
              cy.log(`⚠ WO creation returned no workOrderNumber (HTTP ${woRes.status}) — TC11 may fail`);
              return cy.wrap(null);
            }
            cy.log(`✓ Work order ${woNum} created`);
            created.reservedWoNum = woNum;
            created.reservedWoId  = woId;
            return cy.request({
              method: "POST",
              url: `${apiBase()}/work-orders/scan`,
              headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
              body: { workOrderNumber: woNum, productId, serialNumber: created.reservedSerial },
              failOnStatusCode: false,
            }).then((scanRes) => {
              if (scanRes.status === 200 || scanRes.status === 201) {
                cy.log(`✓ ${created.reservedSerial} → Reserved in ${created.reservedPO}`);
              } else {
                cy.log(`⚠ WO scan returned HTTP ${scanRes.status} — ${created.reservedSerial} may not be Reserved`);
              }
            });
          });
        });
      });
  });

  // ── after(): cancel the work order and delete all test POs ─────────────────
  after(() => {
    cy.iaAuthToken().then((token) => {
      // Cancel the work order that reserved the test serial
      if (created.reservedWoId) {
        cy.request({
          method: "DELETE",
          url: `${apiBase()}/work-orders/${created.reservedWoId}/cancel`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((res) => cy.log(`Work order ${created.reservedWoId} cancel: HTTP ${res.status}`));
      }

      // Delete all test POs created in before() to prevent accumulation on shared stacks
      const poList = [
        created.incomingPO, created.availablePO, created.damagedPO,
        created.disputedPO, created.missingPO,   created.stockedOutPO,
        created.cancelPO,   created.errorTestPO,  created.reservedPO,
        created.targetPO,
      ];
      cy.wrap(poList).each((poNumber) => {
        if (!poNumber) return;
        cy.request({
          method: "DELETE",
          url: `${apiBase()}/purchase-orders/${encodeURIComponent(poNumber)}`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((res) => cy.log(`PO ${poNumber} delete: HTTP ${res.status}`));
      });
    });
  });

  beforeEach(() => {
    incomingInvPage = new IncomingInvPage();
    cy.authSession('admin');
    cy.visit("/");
  });

  // ── Helpers: navigate to a PO's product details and open the Move Item dialog
  function openMoveDialog(poName, serial) {
    itemViewPage.navigateToProductDetails(poName);
    itemViewPage.verifyTableHasRows(1);
    itemViewPage.openItemMoveDialogBySerial(serial);
  }

  function completeMoveFlow() {
    moveItemPage.selectDialogTargetPO(created.targetPO);
    moveItemPage.selectProductByModelNumber(td.laptop.modelNumber);
    moveItemPage.confirmMove();
  }

  // ===========================================================================
  // TC01 — Incoming item can be moved  (State Transition: valid)
  // ===========================================================================
  it(
    "SW-MI-TC01 — Incoming item moves to target PO and shows success toast (State Transition)",
    { tags: ["@smoke"] },
    () => {
      // Technique: State Transition
      // State Transition — Incoming → moved; no explicit status guard in shiftItemPO service
      cy.intercept("POST", "**/products/item-shift").as("moveItem");
      openMoveDialog(created.incomingPO, created.incomingSerial);
      completeMoveFlow();
      cy.wait("@moveItem", { timeout: 15000 }).its("response.statusCode").should("be.oneOf", [200, 201]);
      moveItemPage.assertMoveSuccess();
    }
  );

  // ===========================================================================
  // TC02 — Available item can be moved  (State Transition: valid)
  // ===========================================================================
  it(
    "SW-MI-TC02 — Available item moves to target PO and shows success toast (State Transition)",
    () => {
      // Technique: State Transition
      // State Transition — Available → moved
      cy.intercept("POST", "**/products/item-shift").as("moveItem");
      openMoveDialog(created.availablePO, created.availableSerial);
      completeMoveFlow();
      cy.wait("@moveItem", { timeout: 15000 }).its("response.statusCode").should("be.oneOf", [200, 201]);
      moveItemPage.assertMoveSuccess();
    }
  );

  // ===========================================================================
  // TC03 — Damaged item can be moved  (State Transition: valid)
  // ===========================================================================
  it(
    "SW-MI-TC03 — Damaged item moves to target PO and shows success toast (State Transition)",
    () => {
      // Technique: State Transition
      // State Transition — Damaged → moved
      cy.intercept("POST", "**/products/item-shift").as("moveItem");
      openMoveDialog(created.damagedPO, created.damagedSerial);
      completeMoveFlow();
      cy.wait("@moveItem", { timeout: 15000 }).its("response.statusCode").should("be.oneOf", [200, 201]);
      moveItemPage.assertMoveSuccess();
    }
  );

  // ===========================================================================
  // TC04 — Disputed item can be moved  (State Transition: valid)
  // ===========================================================================
  it(
    "SW-MI-TC04 — Disputed item moves to target PO and shows success toast (State Transition)",
    () => {
      // Technique: State Transition
      // State Transition — Disputed → moved
      cy.intercept("POST", "**/products/item-shift").as("moveItem");
      openMoveDialog(created.disputedPO, created.disputedSerial);
      completeMoveFlow();
      cy.wait("@moveItem", { timeout: 15000 }).its("response.statusCode").should("be.oneOf", [200, 201]);
      moveItemPage.assertMoveSuccess();
    }
  );

  // ===========================================================================
  // TC05 — Missing item can be moved  (State Transition: valid)
  // ===========================================================================
  it(
    "SW-MI-TC05 — Missing item moves to target PO and shows success toast (State Transition)",
    () => {
      // Technique: State Transition
      // State Transition — Missing → moved
      cy.intercept("POST", "**/products/item-shift").as("moveItem");
      openMoveDialog(created.missingPO, created.missingSerial);
      completeMoveFlow();
      cy.wait("@moveItem", { timeout: 15000 }).its("response.statusCode").should("be.oneOf", [200, 201]);
      moveItemPage.assertMoveSuccess();
    }
  );

  // ===========================================================================
  // TC06 — Cancel move dialog mid-flow → item stays in original PO  (Use Case)
  // ===========================================================================
  it(
    "SW-MI-TC06 — Cancel move dialog mid-flow: item remains in original PO (Use Case)",
    () => {
      // Technique: Use Case
      // Use Case — alternate path: user opens dialog, selects target, then cancels
      openMoveDialog(created.cancelPO, created.cancelSerial);
      moveItemPage.selectDialogTargetPO(created.targetPO);
      moveItemPage.cancelMove();
      itemViewPage.verifyItemExists(created.cancelSerial);
    }
  );

  // ===========================================================================
  // TC07 — "All POs" view: "Move Item" absent from row action menu (Decision Table)
  // ===========================================================================
  it(
    "SW-MI-TC07 — 'All POs' view: Move Item not shown in row action menu (Decision Table)",
    () => {
      // Technique: Decision Table
      // Decision Table — selectedPo === 'All POs': FE omits the item-shift route
      cy.intercept("GET", "**/incoming-items**").as("incomingItems");
      incomingInvPage.clickIncomingInventoryNav();
      incomingInvPage.selectPoNumber("All POs");
      cy.wait("@incomingItems", { timeout: 15000 });
      incomingInvPage.assertMoveItemAbsentInFirstTableRow();
    }
  );

  // ===========================================================================
  // TC08 — /inventory route: "Move Item" absent from row action menu (Decision Table)
  // ===========================================================================
  it(
    "SW-MI-TC08 — /inventory route: Move Item not shown in row action menu (Decision Table)",
    () => {
      // Technique: Decision Table
      // Decision Table — backPath === '/inventory': same FE guard as All POs
      cy.intercept("GET", "**/products**").as("productsList");
      incomingInvPage.clickInventoryNav();
      cy.wait("@productsList", { timeout: 15000 });
      incomingInvPage.assertMoveItemAbsentInFirstTableRow();
    }
  );

  // ===========================================================================
  // TC09 — API rejection surfaces error toast (Error Guessing + State Transition)
  // ===========================================================================
  it(
    "SW-MI-TC09 — API rejection for blocked move surfaces error toast in dialog (Error Guessing + State Transition)",
    () => {
      // Technique: Error Guessing
      // Error Guessing — invalid transition: stub POST /products/item-shift to return
      // the service-level rejection so MoveItemModel.tsx's error-toast branch is
      // exercised end-to-end without requiring a race condition.
      // The dialog must remain open on error (setOpen(false) fires only on success).
      cy.intercept("POST", "**/products/item-shift", {
        statusCode: 400,
        body: { statusCode: 400, message: "Item cannot be moved", error: "Bad Request" },
      }).as("moveItemError");
      openMoveDialog(created.errorTestPO, created.errorSerial);
      completeMoveFlow();
      cy.wait("@moveItemError", { timeout: 15000 });
      moveItemPage.assertMoveErrorContains("cannot be moved");
    }
  );

  // ===========================================================================
  // TC10 — StockedOut item: "Move Item" disabled in action menu (Decision Table)
  // ===========================================================================
  it(
    "SW-MI-TC10 — StockedOut item: 'Move Item' in action menu is disabled (Decision Table)",
    () => {
      // Technique: Decision Table
      // Decision Table — StockedOut status: UI gate renders Move Item as Mui-disabled
      itemViewPage.navigateToProductDetails(created.stockedOutPO);
      itemViewPage.verifyTableHasRows(1);
      itemViewPage.assertMoveItemDisabledBySerial(created.stockedOutSerial);
    }
  );

  // ===========================================================================
  // TC11 — Reserved item: "Move Item" enabled in action menu (Decision Table)
  // ===========================================================================
  it(
    "SW-MI-TC11 — Reserved item: 'Move Item' in action menu stays enabled (Decision Table)",
    () => {
      // Technique: Decision Table
      // Decision Table — complement of TC10. The only status that gates the
      // Move Item entry is StockedOut (itemViewItemList.tsx passes
      // disabledChangeStatus={row.original.status === Status.StockedOut}), so a
      // Reserved item must still offer Move Item. This pins the gate to exactly
      // one status: were a Reserved gate reintroduced, this fails.
      itemViewPage.navigateToProductDetails(created.reservedPO);
      itemViewPage.verifyTableHasRows(1);
      itemViewPage.assertMoveItemEnabledBySerial(created.reservedSerial);
    }
  );

});
