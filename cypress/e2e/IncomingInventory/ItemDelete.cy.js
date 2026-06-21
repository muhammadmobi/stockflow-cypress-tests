import ItemViewPage from "../../pageObjects/ItemViewPage";
import PurchaseOrderPage from "../../pageObjects/PurchaseOrderPage";
import { makeLaptopRowWithSerial, createExcelFile } from "../../support/helpers/incomingInventoryHelpers";

/**
 * Item Delete Tests — SW-IVID-TC01 – SW-IVID-TC11
 *
 * ISTQB Techniques: State Transition Testing + EP + Error Guessing + Use Case
 *
 * Each item status is a state; deletion is a transition.
 * Blocked statuses (product.service.ts:4513–4518):
 *   Reserved   → "is reserved. Cannot delete."
 *   StockedOut → "is stocked out. Cannot delete."
 *
 * Status setup paths:
 *   Incoming   — stays after Excel import, no extra call needed
 *   Damaged / Disputed / Missing — cy.iaSetSerialStatus (mark-status accepts only these three)
 *   Available  — cy.iaScanItem (POST /incoming-items/scan; mark-available rejects Incoming)
 *   Reserved   — cy.iaScanItem then cy.iaReserveItem (WO create + WO scan)
 *   StockedOut — cy.iaScanItem then cy.iaStockOutBySerial (POST /products/stockout-by-serial-number)
 *
 * Coverage:
 *   TC01 — Delete Incoming     (State Transition: valid, EP: deletable partition)
 *   TC02 — Delete Available    (State Transition: valid, EP: deletable partition)
 *   TC03 — Delete Damaged      (State Transition: valid, EP: deletable partition)
 *   TC04 — Delete Disputed     (State Transition: valid, EP: deletable partition)
 *   TC05 — Reserved blocked    (State Transition: invalid, Error Guessing)
 *   TC06 — Delete Missing      (State Transition: valid, EP: deletable partition)
 *   TC07 — StockedOut blocked  (State Transition: invalid, second blocked-status partition)
 *   TC08 — Cancel then delete  (Use Case: abort path then success path)
 *   TC09 — Empty state after last item deleted (State Transition: table renders empty)
 *   TC10 — Deletion persists across reload (Error Guessing: DB commit vs optimistic UI)
 *   TC11 — Cancel dialog only  (Use Case: user aborts, item unchanged)
 */

describe("Item Delete Tests (SW-IVID-TC01 – SW-IVID-TC11)", { tags: ["@regression"] }, () => {
  const created = {};
  let td;
  let authToken;
  const itemViewPage = new ItemViewPage();
  const poPage = new PurchaseOrderPage();
  const runId = `${Date.now()}`;

  const apiBase = () => Cypress.env("API_BASE_URL");

  const makePoName = (suffix) => `PO-ItemDelete-${suffix}-${runId}`;
  const buildSerial = (serialKey) => `${td.serials[serialKey]}-${runId}`;

  const createItemInPo = (serialKey, poName) => {
    const serial = buildSerial(serialKey);
    const fileName = `ItemDelete-${serialKey}-${runId}.xlsx`;
    const laptopRow = makeLaptopRowWithSerial(td);

    createExcelFile(fileName, [laptopRow(serial)]);

    return cy.task("uploadExcelToApi", {
      filePath: `cypress/fixtures/${fileName}`,
      poNumber: poName,
      authToken,
      baseUrl: apiBase(),
    }).then((res) => {
      expect(res.status, `Excel upload status for ${serial} in ${poName}`).to.be.oneOf([200, 201]);
      expect(res.body.success, `Excel upload success for ${serial}`).to.eq(true);
      cy.log(`✓ Created ${poName} with item ${serial}`);
      return cy.wrap(serial);
    });
  };

  before(() => {
    cy.fixture("itemDeleteData").then((data) => {
      td = data;
      cy.adminSession();
      cy.visit("/");
    }).then(() => {
      return cy.iaAuthToken().then((token) => {
        authToken = token;
        expect(authToken, "identity server token").to.exist;
      });
    }).then(() => {
      return cy.getAuthToken().then((token) => {
        cy.request({
          method: "POST",
          url: `${apiBase()}/categories`,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: {
            name: td.laptop.category,
            description: "Item delete automation category",
            allowItems: true,
            allowVariants: false,
            allowVariantItems: false,
          },
          failOnStatusCode: false,
        }).then((res) => {
          if (res.status === 201) {
            cy.log(`✓ Created category ${td.laptop.category}`);
          } else if (res.status === 200 || res.status === 409) {
            cy.log(`✓ Category available: ${td.laptop.category} (status: ${res.status})`);
          } else {
            throw new Error(`Failed to create category: ${res.status}`);
          }
        });
      });
    }).then(() => {
      // TC01 — item stays Incoming after Excel import
      return createItemInPo("incoming", makePoName("Incoming")).then((serial) => {
        created.incoming = { poNumber: makePoName("Incoming"), serial };
      });
    }).then(() => {
      // TC02 — scan in to make Available (mark-available rejects Incoming; iaScanItem is required)
      return createItemInPo("available", makePoName("Available")).then((serial) => {
        created.available = { poNumber: makePoName("Available"), serial };
        return cy.iaScanItem(authToken, makePoName("Available"), serial);
      });
    }).then(() => {
      // TC03 — mark-status accepts Damaged
      return createItemInPo("damaged", makePoName("Damaged")).then((serial) => {
        created.damaged = { poNumber: makePoName("Damaged"), serial };
        return cy.iaSetSerialStatus(authToken, serial, "Damaged", { damageReason: "Broken" });
      });
    }).then(() => {
      // TC04 — mark-status accepts Disputed
      return createItemInPo("disputed", makePoName("Disputed")).then((serial) => {
        created.disputed = { poNumber: makePoName("Disputed"), serial };
        return cy.iaSetSerialStatus(authToken, serial, "Disputed");
      });
    }).then(() => {
      // TC05 — scan in → Available, then reserve via Work Order (iaReserveItem)
      return createItemInPo("reserved", makePoName("Reserved")).then((serial) => {
        created.reserved = { poNumber: makePoName("Reserved"), serial };
        return cy.iaScanItem(authToken, makePoName("Reserved"), serial).then(() =>
          cy.iaReserveItem(authToken, makePoName("Reserved"), td.laptop.modelNumber, serial)
        );
      });
    }).then(() => {
      // TC06 — mark-status accepts Missing
      return createItemInPo("missing", makePoName("Missing")).then((serial) => {
        created.missing = { poNumber: makePoName("Missing"), serial };
        return cy.iaSetSerialStatus(authToken, serial, "Missing");
      });
    }).then(() => {
      // TC07 — scan in → Available, then stock out
      return createItemInPo("stockedOut", makePoName("StockedOut")).then((serial) => {
        created.stockedOut = { poNumber: makePoName("StockedOut"), serial };
        return cy.iaScanItem(authToken, makePoName("StockedOut"), serial).then(() =>
          cy.iaStockOutBySerial(authToken, serial)
        );
      });
    }).then(() => {
      // TC08 — item stays Incoming; cancel-then-delete test is status-agnostic
      return createItemInPo("cancelThenDelete", makePoName("CancelThenDelete")).then((serial) => {
        created.cancelThenDelete = { poNumber: makePoName("CancelThenDelete"), serial };
      });
    }).then(() => {
      // TC09 — item stays Incoming; tests empty-state after last item deleted
      return createItemInPo("lastItem", makePoName("LastItem")).then((serial) => {
        created.lastItem = { poNumber: makePoName("LastItem"), serial };
      });
    }).then(() => {
      // TC10 — item stays Incoming; tests DB-commit persistence via reload
      return createItemInPo("persistCheck", makePoName("PersistCheck")).then((serial) => {
        created.persistCheck = { poNumber: makePoName("PersistCheck"), serial };
      });
    }).then(() => {
      // TC11 — item stays Incoming; cancel test is status-agnostic
      return createItemInPo("cancel", makePoName("Cancel")).then((serial) => {
        created.cancel = { poNumber: makePoName("Cancel"), serial };
      });
    });
  });

  after(() => {
    Object.keys(created).forEach((key) => {
      const po = created[key]?.poNumber;
      if (po) poPage.deletePurchaseOrder(po);
    });
  });

  beforeEach(() => {
    cy.adminSession();
    cy.visit("/");
  });

  function openDetails(poNumber) {
    itemViewPage.navigateToProductDetails(poNumber);
    itemViewPage.verifyTableHasRows(1);
  }

  // State Transition: Incoming → Deleted (valid). EP: Incoming is a deletable status partition.
  it("SW-IVID-TC01 — Delete Incoming item", { tags: ["@smoke"] }, () => {
    openDetails(created.incoming.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.incoming.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyItemNotExists(created.incoming.serial);
  });

  // State Transition: Available → Deleted (valid). EP: Available is a deletable status partition.
  it("SW-IVID-TC02 — Delete Available item", () => {
    openDetails(created.available.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.available.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyItemNotExists(created.available.serial);
  });

  // State Transition: Damaged → Deleted (valid). EP: Damaged is a deletable status partition.
  it("SW-IVID-TC03 — Delete Damaged item", () => {
    openDetails(created.damaged.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.damaged.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyItemNotExists(created.damaged.serial);
  });

  // State Transition: Disputed → Deleted (valid). EP: Disputed is a deletable status partition.
  it("SW-IVID-TC04 — Delete Disputed item", () => {
    openDetails(created.disputed.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.disputed.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyItemNotExists(created.disputed.serial);
  });

  // State Transition: Reserved → Deleted blocked (invalid). Error Guessing: backend rejects reserved items.
  it("SW-IVID-TC05 — Reserved item cannot be deleted", () => {
    openDetails(created.reserved.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.reserved.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifyDeleteBlockedToast("Cannot delete");
    itemViewPage.verifyItemExists(created.reserved.serial);
  });

  // State Transition: Missing → Deleted (valid). EP: Missing is a deletable status partition.
  it("SW-IVID-TC06 — Delete Missing item", () => {
    openDetails(created.missing.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.missing.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyItemNotExists(created.missing.serial);
  });

  // State Transition: StockedOut → Deleted blocked (invalid). Completes non-deletable partition coverage alongside TC05.
  it("SW-IVID-TC07 — StockedOut item cannot be deleted", () => {
    openDetails(created.stockedOut.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.stockedOut.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifyDeleteBlockedToast("Cannot delete");
    itemViewPage.verifyItemExists(created.stockedOut.serial);
  });

  // Use Case: alternate path (cancel) followed by success path (confirm).
  // Verifies cancel does not corrupt dialog state or prevent subsequent deletion.
  it("SW-IVID-TC08 — Cancel then successful delete on same item", () => {
    openDetails(created.cancelThenDelete.poNumber);
    // Abort path
    itemViewPage.openItemDeleteDialogBySerial(created.cancelThenDelete.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.cancelDeleteItem();
    itemViewPage.verifyItemExists(created.cancelThenDelete.serial);
    // Success path — reopen and confirm
    itemViewPage.openItemDeleteDialogBySerial(created.cancelThenDelete.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyItemNotExists(created.cancelThenDelete.serial);
  });

  // State Transition: last item deleted → table shows empty state (no rows remain).
  // Catches regressions where the row is removed from the DOM but the empty-state
  // component does not render.
  it("SW-IVID-TC09 — Deleting last item leaves table empty", () => {
    openDetails(created.lastItem.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.lastItem.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyEmptyState();
  });

  // Error Guessing: deletion persists after page reload, confirming the DB transaction committed
  // rather than relying on an optimistic UI update that may not have been flushed.
  it("SW-IVID-TC10 — Deleted item does not reappear after page reload", () => {
    openDetails(created.persistCheck.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.persistCheck.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.confirmDeleteItem();
    itemViewPage.verifySuccessToast("Item deleted successfully");
    itemViewPage.verifyItemNotExists(created.persistCheck.serial);
    // Re-navigate from scratch to prove the deletion committed to DB (not just optimistic UI).
    // cy.reload() would lose location.state required by ItemView — navigate via the UI instead.
    cy.visit("/");
    openDetails(created.persistCheck.poNumber);
    itemViewPage.verifyEmptyState();
  });

  // Use Case: user cancels the delete confirmation dialog → item remains in table unchanged.
  it("SW-IVID-TC11 — Cancel delete operation keeps the item", () => {
    openDetails(created.cancel.poNumber);
    itemViewPage.openItemDeleteDialogBySerial(created.cancel.serial);
    itemViewPage.verifyDeleteDialogOpen();
    itemViewPage.cancelDeleteItem();
    itemViewPage.verifyItemExists(created.cancel.serial);
  });
});
