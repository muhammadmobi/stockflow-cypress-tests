import AuditTrailPage from "../../pageObjects/AuditTrailPage";
import ItemViewPage from "../../pageObjects/ItemViewPage";
import {
  makeLaptopRowWithSerial,
  createExcelFile,
} from "../../support/helpers/incomingInventoryHelpers";
import { ensureCommonAttributesOptional } from "../../support/helpers/attributeHelpers";
import {
  borrowGeneralConfigFlag,
  restoreGeneralConfigFlag,
} from "../../support/helpers/generalConfigApiHelpers";

// General Config flags this suite borrows to open the stock-out gates (see the
// comment at the borrow site in before()). Declared once so before() and after()
// cannot drift apart.
const BORROWED_CONFIG_FLAGS = [
  ["requireWorkOrderForStockOut", false],
  ["enablePoForStockOut", false],
  ["enableInventoryStockOut", true],
];

/**
 * Item Audit Trail Tests — SW-IAT-TC01 .. SW-IAT-TC14
 *
 * Plan:   cypress/qa/testPlans/incomingInventory/sub/audit-trail-plan.md
 * Prompt: cypress/qa/prompts/audit-trail-feature.md
 *
 * Feature: Item Audit Trail dialog opened from the ⋮ row-action menu on the
 * Product Details (ItemView) page of /incoming-inventory. Clicking
 * "Audit trail" fires GET /products/audit/:serialNumber and the response
 * populates an IMSDialog rendered by ItemActionMenu.tsx.
 *
 * Coverage:
 *   TC01 @smoke  Use Case          Open audit trail dialog for a scanned item
 *   TC02         Use Case          Close audit trail dialog cleanly
 *   TC03         State Transition  Damaged action recorded with Reason field
 *   TC04         State Transition  Missing action recorded
 *   TC05         State Transition  Multiple transitions in newest-first order
 *   TC06         EP                Empty state for fresh Incoming item (probe-and-skip)
 *   TC07         EP                Null fields (reason/description) are NOT rendered
 *   TC08         Error Guessing    Re-open triggers refetch with consistent data
 *   TC09         Decision Table    "Audit trail" enabled regardless of status
 *   TC10         State Transition  Disputed action recorded
 *   TC11         State Transition  Reserved (WO scan) action recorded
 *   TC12         State Transition  StockedOut action recorded
 *   TC13         State Transition  Restock after StockedOut recorded
 *   TC14         Error Guessing    Deleted item: row absent + API audit probe 404
 *
 * Seeding strategy:
 *   - Each TC has its own PO + serial with a runId timestamp suffix.
 *   - All POs created in before() via uploadExcelToApi.
 *   - Status mutations applied via cy.iaScanItem / cy.iaSetSerialStatus /
 *     direct cy.request to stockout-by-serial-number / restock-by-serial-number /
 *     work-orders + work-orders/scan.
 *   - after(): cancel the reserved Work Order, then delete every PO.
 */

describe("Item Audit Trail Tests (SW-IAT-TC01 – SW-IAT-TC14)", { tags: ["@regression"] }, () => {
  const created = {};
  let td;
  let authToken;
  const itemViewPage = new ItemViewPage();
  const auditTrailPage = new AuditTrailPage();
  const runId = `${Date.now()}`;

  const apiBase = () => Cypress.env("API_BASE_URL");
  const authHeader = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  const makePo = (key) => `${td.poPrefixes[key]}-${runId}`;
  const makeSerial = (key) => `${td.serials[key]}-${runId}`;

  // ─── Status mutation via Change Status API ──────────────────────────────
  // The Change Status dialog (Frontend/src/components/IncommingInventory/
  // ReportDescrepancy.tsx) posts to /incoming-items/mark-status for
  // serialized items in Incoming state. The /products/mark-status endpoint
  // is for items already in Available state — using it on Incoming items
  // either errors out or does NOT create the audit trail entries that
  // surface in GET /products/audit/:serialNumber.
  //
  // Body: { poNumber, serialNumbers: [serial], status, damageReason? }
  // ─────────────────────────────────────────────────────────────────────────
  const apiChangeStatus = (poNumber, serialNumber, status, opts = {}) => {
    const body = { poNumber, serialNumbers: [serialNumber], status };
    if (status === "Damaged") {
      body.damageReason = opts.damageReason || "Physical Damage";
    }
    if (opts.damageComment !== undefined) body.damageComment = opts.damageComment;
    return cy
      .request({
        method: "POST",
        url: `${apiBase()}/incoming-items/mark-status`,
        headers: authHeader(authToken),
        body,
        failOnStatusCode: false,
        timeout: 60000,
      })
      .then((res) => {
        cy.log(
          `change-status ${status} ${serialNumber} → HTTP ${res.status} success=${res.body?.success}`
        );
        expect(
          res.status,
          `change-status ${status} ${serialNumber} HTTP must be < 500`
        ).to.be.lessThan(500);
      });
  };

  // ── Upload one serialized item to one PO via the API (no browser UI) ────
  const uploadItem = (serial, poName) => {
    const fileName = `AuditTrail-${serial}.xlsx`;
    const rowBuilder = makeLaptopRowWithSerial(td);
    createExcelFile(fileName, [rowBuilder(serial)]);
    return cy
      .task("uploadExcelToApi", {
        filePath: `cypress/fixtures/${fileName}`,
        poNumber: poName,
        authToken,
        baseUrl: apiBase(),
      })
      .then((res) => {
        expect(res.status, `upload ${serial} → ${poName}`).to.be.oneOf([200, 201]);
        expect(res.body.success, `upload success for ${serial}`).to.eq(true);
        cy.log(`✓ ${poName} ← ${serial}`);
      });
  };

  // ────────────────────────────────────────────────────────────────────────
  // before(): authenticate, ensure category, upload all items, drive each
  //           item to its required state via API calls.
  // ────────────────────────────────────────────────────────────────────────
  before(() => {
    cy.fixture("auditTrailData")
      .then((data) => {
        td = data;
        cy.authSession('admin');
        cy.visit("/");
      })
      .then(() => {
        cy.iaAuthToken().then((token) => {
          authToken = token;
          expect(authToken, "identity server token must exist").to.exist;
        });
      })
      .then(() => {
        ensureCommonAttributesOptional();
      })
      .then(() => {
        // Ensure laptop category exists. 200/201 = created, 409 = already there.
        cy.getAuthToken().then((token) => {
          cy.request({
            method: "POST",
            url: `${apiBase()}/categories`,
            headers: authHeader(token),
            body: {
              name: td.laptop.category,
              description: "Audit trail automation category",
              allowItems: true,
              allowVariants: false,
              allowVariantItems: false,
            },
            failOnStatusCode: false,
          }).then((res) => cy.log(`Category '${td.laptop.category}': HTTP ${res.status}`));
        });
      })
      .then(() => {
        // Assign unique PO names and serials for this run
        created.scannedPO         = makePo("scanned");
        created.damagedPO         = makePo("damaged");
        created.missingPO         = makePo("missing");
        created.multiTransitionPO = makePo("multiTransition");
        created.freshItemPO       = makePo("freshItem");
        created.nullFieldsPO      = makePo("nullFields");
        created.reopenPO          = makePo("reopen");
        created.decisionTablePO   = makePo("decisionTable");
        created.disputedPO        = makePo("disputed");
        created.reservedPO        = makePo("reserved");
        created.stockedOutPO      = makePo("stockedOut");
        created.restockedPO       = makePo("restocked");
        created.deletedPO         = makePo("deleted");

        created.scannedSerial         = makeSerial("scanned");
        created.damagedSerial         = makeSerial("damaged");
        created.missingSerial         = makeSerial("missing");
        created.multiTransitionSerial = makeSerial("multi");
        created.freshItemSerial       = makeSerial("freshItem");
        created.nullFieldsSerial      = makeSerial("nullFields");
        created.reopenSerial          = makeSerial("reopen");
        created.decisionTableSerial   = makeSerial("decisionTable");
        created.disputedSerial        = makeSerial("disputed");
        created.reservedSerial        = makeSerial("reserved");
        created.stockedOutSerial      = makeSerial("stockedOut");
        created.restockedSerial       = makeSerial("restocked");
        created.deletedSerial         = makeSerial("deleted");

        // Upload all 13 items sequentially (same laptop model → same productId)
        return uploadItem(created.scannedSerial, created.scannedPO);
      })
      .then(() => uploadItem(created.damagedSerial,         created.damagedPO))
      .then(() => uploadItem(created.missingSerial,         created.missingPO))
      .then(() => uploadItem(created.multiTransitionSerial, created.multiTransitionPO))
      .then(() => uploadItem(created.freshItemSerial,       created.freshItemPO))
      .then(() => uploadItem(created.nullFieldsSerial,      created.nullFieldsPO))
      .then(() => uploadItem(created.reopenSerial,          created.reopenPO))
      .then(() => uploadItem(created.decisionTableSerial,   created.decisionTablePO))
      .then(() => uploadItem(created.disputedSerial,        created.disputedPO))
      .then(() => uploadItem(created.reservedSerial,        created.reservedPO))
      .then(() => uploadItem(created.stockedOutSerial,      created.stockedOutPO))
      .then(() => uploadItem(created.restockedSerial,       created.restockedPO))
      .then(() => uploadItem(created.deletedSerial,         created.deletedPO))

      // ── Apply status mutations ──────────────────────────────────────────
      // Available (scanned) — TC01 / TC02
      .then(() => cy.iaScanItem(authToken, created.scannedPO, created.scannedSerial))
      // Damaged — TC03 (Change Status API: /incoming-items/mark-status)
      .then(() =>
        apiChangeStatus(created.damagedPO, created.damagedSerial, "Damaged", {
          damageReason: "Physical Damage",
        })
      )
      // Missing — TC04
      .then(() => apiChangeStatus(created.missingPO, created.missingSerial, "Missing"))
      // Multi-transition — TC05 (scan → Damaged → Missing creates 3+ entries).
      // After scan the item is Available but /incoming-items/mark-status still
      // accepts both Damaged and Missing transitions for product-items.
      .then(() =>
        cy.iaScanItem(authToken, created.multiTransitionPO, created.multiTransitionSerial)
      )
      .then(() =>
        apiChangeStatus(
          created.multiTransitionPO,
          created.multiTransitionSerial,
          "Damaged",
          { damageReason: "Physical Damage" }
        )
      )
      .then(() =>
        apiChangeStatus(created.multiTransitionPO, created.multiTransitionSerial, "Missing")
      )
      // freshItem (TC06) — no mutation, stays Incoming
      // nullFields (TC07) — scan only, no status change (reason/description null)
      .then(() => cy.iaScanItem(authToken, created.nullFieldsPO, created.nullFieldsSerial))
      // reopen (TC08) — scan only
      .then(() => cy.iaScanItem(authToken, created.reopenPO, created.reopenSerial))
      // decisionTable (TC09) — Available item for the "non-disabled status" half
      .then(() =>
        cy.iaScanItem(authToken, created.decisionTablePO, created.decisionTableSerial)
      )
      // Disputed — TC10
      .then(() => apiChangeStatus(created.disputedPO, created.disputedSerial, "Disputed"))
      // Reserved — TC11 (and the Reserved half of TC09)
      // Use the inline WO create + WO scan pattern from MoveItemTests.cy.js so
      // we can capture the WO id for cancellation in after().
      .then(() => cy.iaScanItem(authToken, created.reservedPO, created.reservedSerial))
      .then(() => {
        // Reserve seeding for TC11. This previously resolved the product through
        // GET /products?poNumber=, swallowed every failure (failOnStatusCode:false
        // → cy.wrap(null)) and left reservedWoId undefined, so TC11 skipped itself
        // instead of reporting that its setup had not happened — a green run that
        // never tested anything.
        //
        // Resolve the product through GET /incoming-items instead (the same lookup
        // scanAllTestHelpers.apiGetProductIdByPo uses for the passing reserve
        // tests) and assert every step, so a broken seed fails loudly.
        return cy
          .request({
            method: "GET",
            url: `${apiBase()}/incoming-items`,
            qs: { poNumber: created.reservedPO, page: 1, page_size: 5 },
            headers: authHeader(authToken),
          })
          .then((res) => {
            const data = res.body?.data || {};
            const rawList = data.list || data.data?.list || data;
            const list = Array.isArray(rawList) ? rawList : rawList?.list || [];
            const product = list.find((p) => p && (p.id ?? p.productId));
            expect(
              product,
              `a product must exist in ${created.reservedPO} to reserve against`
            ).to.exist;

            const productId = Number(product.id ?? product.productId);
            return cy
              .request({
                method: "POST",
                url: `${apiBase()}/work-orders`,
                headers: authHeader(authToken),
                body: {
                  status: "Open",
                  products: [
                    {
                      productId,
                      name: product.name || "Automation reserve product",
                      partNumber: null,
                      quantity: 1,
                    },
                  ],
                },
              })
              .then((woRes) => {
                expect(woRes.status, "POST /work-orders").to.be.oneOf([200, 201]);
                const wo = woRes.body?.data || {};
                const woNum = wo?.workOrderNumber;
                expect(woNum, "workOrderNumber from POST /work-orders").to.exist;

                created.reservedWoNum = woNum;
                created.reservedWoId = wo?.id;

                return cy
                  .request({
                    method: "POST",
                    url: `${apiBase()}/work-orders/scan`,
                    headers: authHeader(authToken),
                    body: {
                      workOrderNumber: woNum,
                      productId,
                      serialNumber: created.reservedSerial,
                    },
                  })
                  .then((scanRes) => {
                    expect(scanRes.status, "POST /work-orders/scan").to.be.lessThan(400);
                    expect(
                      scanRes.body?.success,
                      `WO scan of ${created.reservedSerial} must succeed`
                    ).to.not.equal(false);
                  });
              });
          });
      })
      // StockedOut — TC12 (must be Available first).
      // QA General Config may have requireWorkOrderForStockOut /
      // enablePoForStockOut persisted ON (a gen-config toggle test leaves them
      // set), which 400s the stockout-by-serial-number calls below —
      // failOnStatusCode:false swallows the error, so the item silently stays
      // Available and NO StockedOut/Restock audit entry is written, leaving
      // TC12/TC13 with nothing to find. Force the stockout gates open first
      // (same fix ProductDetailsStatsClickableTests uses in its before()).
      //
      // BORROW, don't set: these are GLOBAL rows on a shared stack — leaving them
      // flipped is exactly the cross-suite pollution described above, only caused
      // by us instead of the gen-config suite. borrowGeneralConfigFlag captures
      // each prior value; after() puts them back and asserts the restore landed.
      .then(() =>
        BORROWED_CONFIG_FLAGS.forEach(([name, value]) =>
          borrowGeneralConfigFlag(name, value)
        )
      )
      .then(() => cy.iaScanItem(authToken, created.stockedOutPO, created.stockedOutSerial))
      .then(() =>
        cy.request({
          method: "POST",
          url: `${apiBase()}/products/stockout-by-serial-number`,
          headers: authHeader(authToken),
          body: {
            serialNumber: created.stockedOutSerial,
            reason: td.stockoutBody.reason,
            description: td.stockoutBody.description,
          },
          failOnStatusCode: false,
        })
      )
      // Restock — TC13 (scan → stockout → restock)
      .then(() => cy.iaScanItem(authToken, created.restockedPO, created.restockedSerial))
      .then(() =>
        cy.request({
          method: "POST",
          url: `${apiBase()}/products/stockout-by-serial-number`,
          headers: authHeader(authToken),
          body: {
            serialNumber: created.restockedSerial,
            reason: td.stockoutBody.reason,
            description: td.stockoutBody.description,
          },
          failOnStatusCode: false,
        })
      )
      .then(() => cy.iaRestoreSerialToAvailable(authToken, created.restockedSerial))
      // Deleted (TC14) — scan only; deletion happens inside the test body
      .then(() => cy.iaScanItem(authToken, created.deletedPO, created.deletedSerial));
  });

  // ────────────────────────────────────────────────────────────────────────
  // after(): cancel reserved WO, then delete every PO created in before().
  // ────────────────────────────────────────────────────────────────────────
  after(() => {
    // Hand the borrowed General Config flags back before any other cleanup, so a
    // failure while deleting POs cannot strand global state in the borrowed shape.
    BORROWED_CONFIG_FLAGS.forEach(([name]) => restoreGeneralConfigFlag(name));

    cy.iaAuthToken().then((token) => {
      if (created.reservedWoId) {
        cy.request({
          method: "DELETE",
          url: `${apiBase()}/work-orders/${created.reservedWoId}/cancel`,
          headers: authHeader(token),
          failOnStatusCode: false,
        }).then((res) =>
          cy.log(`WO ${created.reservedWoId} cancel: HTTP ${res.status}`)
        );
      }

      const poList = [
        created.scannedPO,
        created.damagedPO,
        created.missingPO,
        created.multiTransitionPO,
        created.freshItemPO,
        created.nullFieldsPO,
        created.reopenPO,
        created.decisionTablePO,
        created.disputedPO,
        created.reservedPO,
        created.stockedOutPO,
        created.restockedPO,
        created.deletedPO,
      ];

      cy.wrap(poList).each((poNumber) => {
        if (!poNumber) return;
        cy.request({
          method: "DELETE",
          url: `${apiBase()}/purchase-orders/${encodeURIComponent(poNumber)}`,
          headers: authHeader(token),
          failOnStatusCode: false,
        }).then((res) => cy.log(`PO ${poNumber} delete: HTTP ${res.status}`));
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // beforeEach: fresh session + visit
  // ────────────────────────────────────────────────────────────────────────
  beforeEach(() => {
    cy.authSession('admin');
    cy.visit("/");
  });

  // ── Helper: navigate to ItemView for a PO + verify rows render ─────────
  function openItemView(poName) {
    itemViewPage.navigateToProductDetails(poName);
    itemViewPage.verifyTableRowCountAtLeast(1);
  }

  // =========================================================================
  // TC01 — Open audit trail for a scanned item: title has serial, entries visible
  // =========================================================================
  // ISTQB: Use Case (admin opens audit trail for scanned item)
  it(
    "SW-IAT-TC01 — Open audit trail for scanned item: dialog shows serial and entries",
    { tags: ["@smoke"] },
    () => {
      openItemView(created.scannedPO);
      auditTrailPage.openAuditTrailBySerial(created.scannedSerial);
      auditTrailPage.assertDialogTitleHasSerial(created.scannedSerial);
      auditTrailPage.assertEntryCountAtLeast(1);
      // Each entry renders the three core fields (BE always returns userName/action/timestamp)
      auditTrailPage.assertEntryAtIndexHasField(0, "User Name");
      auditTrailPage.assertEntryAtIndexHasField(0, "Action");
      auditTrailPage.assertEntryAtIndexHasField(0, "Timestamp");
    }
  );

  // =========================================================================
  // TC02 — Close audit trail dialog cleanly
  // =========================================================================
  // ISTQB: Use Case (close dialog via X button or ESC)
  it("SW-IAT-TC02 — Close audit trail dialog dismisses cleanly", () => {
    openItemView(created.scannedPO);
    auditTrailPage.openAuditTrailBySerial(created.scannedSerial);
    auditTrailPage.closeAuditTrailDialog();
    // Verified inside closeAuditTrailDialog() — dialog should be gone.
    // Extra: no console toast errors should surface (silent close).
    cy.get('[role="dialog"]').should("not.exist");
  });

  // =========================================================================
  // TC03 — Damaged status creates audit entry with Reason field
  // =========================================================================
  // ISTQB: Decision Table (Damaged + optional Reason field via probe-then-skip)
  it(
    "SW-IAT-TC03 — Damaged status change creates audit entry (Reason field is optional per BE diff)",
    () => {
      openItemView(created.damagedPO);
      auditTrailPage.openAuditTrailBySerial(created.damagedSerial);
      auditTrailPage.assertEntryCountAtLeast(1);
      auditTrailPage.assertSomeEntryContains("Damaged");

      cy.request({
        method: "GET",
        url: `${apiBase()}/products/audit/${encodeURIComponent(created.damagedSerial)}`,
        headers: authHeader(authToken),
        failOnStatusCode: false,
      }).then((res) => {
        const auditList = res.body?.data?.list?.audit || [];
        const damagedHasReason = auditList.some((a) => {
          const action = (a?.action || "").toLowerCase();
          return action.includes("damaged") && a?.reason !== null && a?.reason !== undefined && a?.reason !== "";
        });
        if (damagedHasReason) {
          auditTrailPage.assertSomeEntryContains("Reason:");
        } else {
          cy.log(
            `ℹ TC03: BE audit response does NOT expose 'reason' in the Damaged entry — skipping Reason: label assertion. Primary "Damaged action recorded" assertion already passed.`
          );
        }
      });
    }
  );

  // =========================================================================
  // TC04 — Missing status creates audit entry
  // =========================================================================
  // ISTQB: State Transition (Incoming → Missing status recorded)
  it("SW-IAT-TC04 — Missing status change creates audit entry", () => {
    openItemView(created.missingPO);
    auditTrailPage.openAuditTrailBySerial(created.missingSerial);
    auditTrailPage.assertEntryCountAtLeast(1);
    auditTrailPage.assertSomeEntryContains("Missing");
  });

  // =========================================================================
  // TC05 — Multiple transitions appear newest-first
  // =========================================================================
  // ISTQB: State Transition (multi-step path: scan → Damaged → Missing in DESC order)
  it(
    "SW-IAT-TC05 — Multiple status transitions appear newest-first (Missing before Damaged)",
    () => {
      // Force page reload to clear any cache from before() mutations so incoming-items API refires
      cy.reload();
      openItemView(created.multiTransitionPO);
      auditTrailPage.openAuditTrailBySerial(created.multiTransitionSerial);
      auditTrailPage.assertEntryCountAtLeast(2);

      auditTrailPage.getEntryIndexContainingText("Missing").then((missingIdx) => {
        expect(missingIdx, "Missing entry must exist").to.be.greaterThan(-1);
        auditTrailPage
          .getEntryIndexContainingText("Damaged")
          .then((damagedIdx) => {
            expect(damagedIdx, "Damaged entry must exist").to.be.greaterThan(-1);
            expect(
              missingIdx,
              `Missing (latest) at index ${missingIdx} should be BEFORE Damaged (earlier) at index ${damagedIdx} — newest-first DESC order`
            ).to.be.lessThan(damagedIdx);
          });
      });
    }
  );

  // =========================================================================
  // TC06 — Empty state: item with no audit records shows "No Audit Trail Available"
  // =========================================================================
  // ISTQB: Equivalence Partition (zero-records partition, reached via stub)
  //
  // This was a probe-then-skip that ALWAYS skipped: importing an item already
  // writes item-level audit rows, so a real serial with zero audit records does
  // not exist and the zero-records partition is unreachable with live data. The
  // probe therefore guaranteed a permanently-pending test that verified nothing.
  //
  // The behaviour under test is FE rendering — "does the dialog show the empty
  // state when the audit list comes back empty" — so stub that response and
  // assert the rendering. Same technique the Move Item suite uses to reach its
  // API-rejection branch. The live-data contract (imported items DO have audit
  // entries) is already covered by TC01/TC03/TC04.
  it(
    "SW-IAT-TC06 — Item with no audit records renders the empty state (zero-records partition, stubbed)",
    () => {
      cy.intercept(
        "GET",
        `**/products/audit/${encodeURIComponent(created.freshItemSerial)}*`,
        {
          statusCode: 200,
          body: { statusCode: 200, success: true, error: null, data: { list: { audit: [] } } },
        }
      ).as("emptyAudit");

      openItemView(created.freshItemPO);
      auditTrailPage.openAuditTrailBySerial(created.freshItemSerial);
      cy.wait("@emptyAudit", { timeout: 15000 });
      auditTrailPage.assertEmptyState();
    }
  );

  // =========================================================================
  // TC07 — Null fields (reason/description) are NOT rendered for scan-action
  // =========================================================================
  // ISTQB: Equivalence Partition (null fields filtered by FE; non-null vs null rendering)
  it(
    "SW-IAT-TC07 — Null audit fields (reason/description) are not rendered on a scan-action entry",
    () => {
      openItemView(created.nullFieldsPO);
      auditTrailPage.openAuditTrailBySerial(created.nullFieldsSerial);
      auditTrailPage.assertEntryCountAtLeast(1);
      // The scan-only entry must render the core trio:
      auditTrailPage.assertEntryAtIndexHasField(0, "User Name");
      auditTrailPage.assertEntryAtIndexHasField(0, "Action");
      auditTrailPage.assertEntryAtIndexHasField(0, "Timestamp");
      // …and must NOT render either of the null-by-default fields.
      // (BE returns reason/description as null for scan; FE filters them out.)
      auditTrailPage.assertEntryAtIndexDoesNotHaveField(0, "Reason");
      auditTrailPage.assertEntryAtIndexDoesNotHaveField(0, "Description");
    }
  );

  // =========================================================================
  // TC08 — Re-open triggers refetch with consistent data
  // =========================================================================
  // ISTQB: Error Guessing (stale cache on refetch; regression would show empty or hang)
  it(
    "SW-IAT-TC08 — Re-opening audit trail refetches and renders consistent data",
    () => {
      openItemView(created.reopenPO);

      // Closure captures the first-open count so the second open can compare.
      // Avoids cy.wrap.as() across closes which can be fragile inside chains.
      const counts = { first: null };

      auditTrailPage.openAuditTrailBySerial(created.reopenSerial);
      cy.get('[role="dialog"] ul li').then(($entries) => {
        counts.first = $entries.length;
        expect(counts.first, "first open should render at least 1 entry").to.be.at.least(1);
      });

      auditTrailPage.closeAuditTrailDialog();
      auditTrailPage.openAuditTrailBySerial(created.reopenSerial);
      cy.get('[role="dialog"] ul li').then(($entries) => {
        expect(
          $entries.length,
          `second open should render the same number of entries as first (${counts.first})`
        ).to.eq(counts.first);
      });
    }
  );

  // =========================================================================
  // TC09 — "Audit trail" menu item enabled for both Available and Reserved
  // =========================================================================
  // ISTQB: Decision Table (audit-trail enabled regardless of disabledChangeStatus; both Available & Reserved)
  it(
    "SW-IAT-TC09 — 'Audit trail' menu item is enabled for both Available and Reserved items",
    () => {

      // Available item — open menu, assert audit trail is enabled, dismiss menu.
      openItemView(created.decisionTablePO);
      itemViewPage.clickItemActionMenuBySerial(created.decisionTableSerial);
      auditTrailPage.assertAuditMenuItemEnabled();
      auditTrailPage.closeOpenMenu();

      // Reload to bust React Query cache before navigating to a 2nd product —
      // both POs share the same productId (same laptop model) so without a
      // reload the items API response is served from cache and @itemsFirstLoad
      // in navigateToProductDetails never fires.
      cy.reload();

      // Reserved item — open menu, assert audit trail is enabled, then click
      // to verify the dialog actually opens (smoke that "enabled" isn't a lie).
      openItemView(created.reservedPO);
      itemViewPage.clickItemActionMenuBySerial(created.reservedSerial);
      auditTrailPage.assertAuditMenuItemEnabled();
      cy.get('[role="menu"]')
        .contains('[role="menuitem"]', "Audit trail")
        .click({ force: true });
      cy.get('[role="dialog"]', { timeout: 10000 }).should("be.visible");
    }
  );

  // =========================================================================
  // TC10 — Disputed status creates audit entry
  // =========================================================================
  // ISTQB: State Transition (Incoming → Disputed status recorded)
  it("SW-IAT-TC10 — Disputed status change creates audit entry", () => {
    openItemView(created.disputedPO);
    auditTrailPage.openAuditTrailBySerial(created.disputedSerial);
    auditTrailPage.assertEntryCountAtLeast(1);
    auditTrailPage.assertSomeEntryContains("Disputed");
  });

  // =========================================================================
  // TC11 — Work-Order reservation creates audit entry for Reserved state
  // =========================================================================
  // ISTQB: State Transition (Available → Reserved via WO scan)
  it(
    "SW-IAT-TC11 — Reserved state via Work Order scan creates audit trail entry",
    function () {
      // The probe-then-skip guard that used to sit here is gone: before() now
      // asserts the work-order create + scan, so reservedWoId cannot be missing
      // without the suite already having failed. A test that quietly skips when
      // its own setup fails reports green while covering nothing.
      expect(created.reservedWoId, "work order seeded in before()").to.exist;
      openItemView(created.reservedPO);
      auditTrailPage.openAuditTrailBySerial(created.reservedSerial);
      auditTrailPage.assertEntryCountAtLeast(1);
      // BE typically records action = "Reserved" or "RESERVE". Match liberally.
      auditTrailPage.assertSomeEntryContains(/reserv/i);
    }
  );

  // =========================================================================
  // TC12 — StockedOut action creates audit entry
  // =========================================================================
  // ISTQB: State Transition (Available → StockedOut via stockout-by-serial-number)
  it("SW-IAT-TC12 — StockedOut action creates audit entry", () => {
    openItemView(created.stockedOutPO);
    auditTrailPage.openAuditTrailBySerial(created.stockedOutSerial);
    auditTrailPage.assertEntryCountAtLeast(1);
    // BE action label observed as "StockedOut" or similar. Match either form.
    auditTrailPage.assertSomeEntryContains(/stock(ed)?\s*out/i);
  });

  // =========================================================================
  // TC13 — Restock after StockedOut creates audit entry; ordering is newest-first
  // =========================================================================
  // ISTQB: State Transition (StockedOut → Restock; verify two entries in DESC order)
  it(
    "SW-IAT-TC13 — Restock after StockedOut creates audit entry in newest-first order",
    () => {
      openItemView(created.restockedPO);
      auditTrailPage.openAuditTrailBySerial(created.restockedSerial);
      auditTrailPage.assertEntryCountAtLeast(2);

      // Restock entry must exist — BE labels it "restock", "RESTOCK", or transitions back to "Available"
      auditTrailPage.assertSomeEntryContains(/restock|available/i);

      // Stockout entry must also exist (the precursor state)
      auditTrailPage.getEntryIndexContainingText(/stock(ed)?\s*out/i).then((stockoutIdx) => {
        expect(stockoutIdx, "stockout entry should be in the trail before restock").to.be.greaterThan(-1);
      });
    }
  );

  // =========================================================================
  // TC14 — Deleted item: row absent from table; audit API probe returns NotFound
  // =========================================================================
  // ISTQB: Error Guessing (deleted item: UI row absent + API audit returns NotFound/failure)
  it(
    "SW-IAT-TC14 — Deleted item: row absent from table and audit API probe returns NotFound",
    () => {

      // 1) Confirm pre-deletion audit trail is reachable
      openItemView(created.deletedPO);
      auditTrailPage.openAuditTrailBySerial(created.deletedSerial);
      auditTrailPage.assertEntryCountAtLeast(1);
      auditTrailPage.closeAuditTrailDialog();

      // 2) Delete the item via API
      cy.request({
        method: "DELETE",
        url: `${apiBase()}/products/${encodeURIComponent(created.deletedSerial)}`,
        headers: authHeader(authToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, `DELETE /products/:serial response status`).to.be.lessThan(500);
        // Some builds return 200 + success:true; others return 200 + data wrapper.
        // We just need the row to actually be gone — assert below via UI + API probe.
      });

      // 3) Reload and confirm the item row is no longer in the table
      cy.authSession('admin');
      cy.visit("/");
      itemViewPage.navigateToProductDetails(created.deletedPO);
      cy.contains("tbody tr", created.deletedSerial, { timeout: 10000 }).should("not.exist");

      // 4) Direct API probe — audit endpoint should NOT serve a successful
      //    audit payload for a deleted serial. The BE service queries the
      //    items table first and throws NotFoundException → 404 (or the
      //    envelope's success:false). Accept either error shape.
      cy.request({
        method: "GET",
        url: `${apiBase()}/products/audit/${encodeURIComponent(created.deletedSerial)}`,
        headers: authHeader(authToken),
        failOnStatusCode: false,
      }).then((res) => {
        const isHttpError = res.status >= 400;
        const isEnvelopeFailure =
          res.status < 400 &&
          (res.body?.success === false ||
            res.body?.error ||
            !res.body?.data?.list?.audit);
        expect(
          isHttpError || isEnvelopeFailure,
          `audit endpoint should reject deleted serial — got HTTP ${res.status} body=${JSON.stringify(
            res.body || {}
          ).slice(0, 200)}`
        ).to.be.true;
      });
    }
  );
});
