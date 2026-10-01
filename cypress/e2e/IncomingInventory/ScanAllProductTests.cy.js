import { createScanAllSuite } from "../../support/helpers/scanAllTestHelpers";

describe("Scan All Product Tests (SW_INC_013 - SW_INC_037)", () => {
  const suite = createScanAllSuite();

  it(
    "SW_INC_013 - Scan All with enableScanAll ON marks all incoming items as scanned",
    { tags: ["@smoke", "@regression"] },
    function () {
      const stamp = suite.ts();
      const po = `${suite.scanAllData.po.defaultOpen}-${stamp}`;
      const sn1 = `SNScanAll05-${stamp}`;
      const sn2 = `SNScanAll06-${stamp}`;
      const fileName = `ScanAll-046-${stamp}.xlsx`;

      suite.createExcelFile(fileName, [
        suite.laptopRow(sn1, {
          "Model Number": suite.scanAllData.products.laptop.modelNumber,
          Cost: suite.scanAllData.products.laptop.cost,
        }),
        suite.laptopRow(sn2, {
          "Model Number": suite.scanAllData.products.laptop.modelNumber,
          Cost: suite.scanAllData.products.laptop.cost,
        }),
      ]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.createdPOs.push(po);
    },
  );

  it(
    "SW_INC_014 - Scan All button NOT visible when enableScanAll config is OFF",
    { tags: ["@regression"] },
    () => {
      // Previously skipped: the test PATCHed the shared QA config to false, but
      // the suite's own beforeEach re-forces enableScanAll=true (intercept +
      // localStorage) for every other test, so React re-hydrated true and the
      // menu entry stayed visible.
      //
      // Drive the OFF state entirely through the response instead: flip the flag
      // the suite's /configs intercept serves, seed localStorage to match, then
      // remount so Redux hydrates false from both sources. ScanMenu.tsx renders
      // the entry behind `stateConfig?.config?.enableScanAll`, so it must vanish.
      // No global config write → no race with concurrently-running suites.
      // beforeEach resets the flag to true, so this cannot leak into other tests.
      suite.setScanAllFlag(false);
      cy.visit("/incoming-inventory", {
        onBeforeLoad: suite.forceDisableScanAllInStorage,
      });
      suite.incomingInvPage.selectPoNumber(suite.scanAllData.po.defaultOpen);

      cy.window().should((win) => {
        const stored = JSON.parse(win.localStorage.getItem("stock-wise") || "{}");
        expect(stored?.config?.config?.enableScanAll).to.eq(false);
      });

      cy.get(".MuiIconButton-root#basic-button")
        .should("be.visible")
        .click({ force: true });
      cy.get("#basic-menu").should("be.visible");
      cy.get('#basic-menu [role="menu"], #basic-menu').should("not.contain", "Scan All");
      cy.get("body").type("{esc}");
    },
  );

  it(
    "SW_INC_015 - Scan All on a Closed PO returns an error",
    { tags: ["@regression"] },
    () => {
      suite
        .apiRequest({
          method: "POST",
          endpoint: suite.scanAllData.api.scanAll,
          body: { poNumber: suite.scanAllData.po.defaultClosed },
          failOnStatusCode: false,
        })
        .then((resp) => {
          expect(resp.status).to.be.oneOf([400, 404, 422, 500]);
        });
    },
  );

  it(
    "SW_INC_016 - Scan All completes remaining qty after partial stock-in (product-only)",
    { tags: ["@regression"] },
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-057-${stamp}`;
      const fileName = `ScanAll-057-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 2, po);

      // API-seeded stock-in: remount so the React-Query incomingReports cache
      // does not serve the pre-check-in badge counts.
      suite.selectPOFresh(po);
      suite.invViewPage.searchProduct(suite.scanAllData.searchTerms.ram);
      suite.invViewPage.clickSubmitSearch();
      suite.incomingInvPage.validateReceivedQty(2);

      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.validateAllBadges(
        suite.scanAllData.expectedBadges.singleProductFullyReceived,
      );
      suite.validateZeroBadges();
    },
  );

  it(
    "SW_INC_018 - Scan All error when all items already stocked in (product-only)",
    { tags: ["@regression"] },
    // scanAllItems() throws BadRequestException("All items in this purchase
    // order have already been scanned.") once expected-received reaches 0
    // (incoming-item.service.ts:7592). ramRow's default Quantity is 5 and the
    // stock-in below receives all 5, so the guard fires. This mirrors
    // SW_INC_019, the product-item equivalent, which has always passed.
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-059-${stamp}`;
      const fileName = `ScanAll-059-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 5, po);

      suite.selectPO(po);
      suite.clickScanAll(true);
      suite.verifyScanAllError(
        suite.scanAllData.messages.allItemsAlreadyScanned,
      );
    },
  );

  // SW_INC_031/032/033 were skipped on the grounds that applyStatusViaDialog
  // 400s from /incoming-items/mark-status for product-only rows. That no longer
  // holds: the dialog only 400d because the FE gated Damaged/Disputed/Missing
  // behind a "Select Purchase Order" dropdown that is empty for an
  // Incoming-only PO (it lists only POs with availableQuantity>0). The shared
  // interceptConfigScanAll() now serves enablePoForDamaging=false, removing the
  // gate. SW_INC_032 (Damaged) and SW_INC_033 (Disputed) now pass.
  //
  // ⚠ APP BUG — SW_INC_031 stays skipped (do NOT "fix" it by editing the fixture).
  //
  // Scan All re-receives quantity that was already reported MISSING, for
  // product-only POs:
  //   • mark-status deliberately does NOT count Missing as received —
  //     `if (status !== InventoryStatus.Missing)` guards the
  //     `receivedQuantity = receivedQuantity + $1` update (incoming-item.service.ts).
  //   • scanAllItems then receives the whole outstanding balance unconditionally:
  //     delta = expectedQuantity - receivedQuantity, and
  //     `SET receivedQuantity = receivedQuantity + delta,
  //          availableQuantity = availableQuantity + delta`.
  // Because the Missing unit was never added to receivedQuantity, it is still part
  // of that outstanding balance, so Scan All silently receives it. The unit then
  // counts as Missing AND Received AND Available at once: with Expected 5 and 1
  // Missing, Received comes back 5 (this test expects 4) and the missing unit is
  // sellable stock.
  //
  // This is the same product-vs-item asymmetry as SW_INC_CS_026: the serialized
  // path tracks Missing per item and is unaffected; only the quantity-based
  // product path double-counts. The expectation below is correct as written and
  // will pass once Scan All excludes reported-missing quantity from its delta.
  it.skip(
    "SW_INC_031 - Scan All with Missing quantity precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_031");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0084-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.missing,
        quantity: 1,
      });

      suite.selectPOFresh(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPOFresh(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_032 - Scan All with Damaged quantity precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_032");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0085-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow({}, stamp)]);
      suite.importExcel(fileName, po);

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.damaged,
        quantity: 1,
        damageReason: suite.scanAllData.defaults.damageReason,
      });

      suite.selectPOFresh(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPOFresh(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_033 - Scan All with Disputed quantity precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_033");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0086-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow({}, stamp)]);
      suite.importExcel(fileName, po);

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.disputed,
        quantity: 1,
      });

      suite.selectPOFresh(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPOFresh(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  // SW_INC_034/035/036 stamp the RAM row (ramRow({}, stamp)) so each test gets its
  // OWN product id. These three are precisely the setups ramRow's docstring warns
  // about: they depend on a stock-out / work-order reserve applying to THIS PO.
  // With the unstamped (shared) product, product.service.ts adjustAcrossPOs picks
  // the OLDEST PO that still has available quantity — ignoring the poNumber passed
  // in — so a previous test's leftover PO gets drained instead and this PO's badges
  // never move (SW_INC_036 read Available 5 instead of 4), or the stock-out screen
  // finds no available quantity to render a qty input at all (SW_INC_034/035/037).
  it(
    "SW_INC_034 - Scan All with Stocked Out quantity precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_034");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0087-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow({}, stamp)]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 1, po);
      // Stock-out seeded via API (same call the UI makes) rather than driving the
      // mobile stock-out screen. That screen fills in correctly — product card,
      // reason, description, reference number, quantity are all populated — but the
      // "Stock Out" MUI button's onClick does not fire under headless Chrome, so no
      // POST is ever sent (the same React-19/MUI click problem ExportTests documents,
      // where it had to invoke the React fiber handler directly). The stock-out here
      // is only a PRECONDITION — every assertion below is about the Scan All badges —
      // and the mobile stock-out UI has its own coverage under InventoryActions.
      // SW_INC_CS_018 in ChangeStatusTests already seeds this step the same way.
      suite.apiGetProductIdByPo(po, suite.scanAllData.searchTerms.ram).then((productId) => {
        suite.apiStockOutProduct(
          po,
          productId,
          1,
          suite.scanAllData.status.otherStockOutReason,
          `Automation-${stamp}-87`,
        );
      });

      suite.selectPOFresh(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPOFresh(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_035 - Scan All with Sold quantity precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_035");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0088-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow({}, stamp)]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 1, po);
      // Stock-out seeded via API (same call the UI makes) rather than driving the
      // mobile stock-out screen. That screen fills in correctly — product card,
      // reason, description, reference number, quantity are all populated — but the
      // "Stock Out" MUI button's onClick does not fire under headless Chrome, so no
      // POST is ever sent (the same React-19/MUI click problem ExportTests documents,
      // where it had to invoke the React fiber handler directly). The stock-out here
      // is only a PRECONDITION — every assertion below is about the Scan All badges —
      // and the mobile stock-out UI has its own coverage under InventoryActions.
      // SW_INC_CS_018 in ChangeStatusTests already seeds this step the same way.
      suite.apiGetProductIdByPo(po, suite.scanAllData.searchTerms.ram).then((productId) => {
        suite.apiStockOutProduct(
          po,
          productId,
          1,
          suite.scanAllData.status.soldReason,
          `Automation-${stamp}-88`,
        );
      });

      suite.selectPOFresh(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPOFresh(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_036 - Scan All with Reserved quantity precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_036");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0089-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow({}, stamp)]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 1, po);
      // WO reserve via API — the UI flow throws a minified bundle error
      // ("e is not a function") after typing the serial, so we create the
      // work-order directly through POST /work-orders. Product-only reserve
      // does not need a serial scan; the qty=1 reservation is enough.
      suite.apiReserveViaWorkOrder(
        po,
        suite.scanAllData.searchTerms.ram,
        1,
      );

      suite.selectPOFresh(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPOFresh(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  // ⚠ APP BUG — blocked by the SAME defect as SW_INC_031 (see the note there):
  // Scan All re-receives quantity already reported Missing on a product-only PO.
  // This scenario marks 1 of 10 units Missing, so Received comes back 10 instead
  // of the 9 asserted here. Everything else in the mixed-status expectation
  // (Damaged / Disputed / Sold / Stocked out / Reserved) is already proven by
  // SW_INC_032/033/034/035/036, which now pass. Un-skip together with SW_INC_031
  // once Scan All excludes reported-missing quantity from its receive delta.
  it.skip(
    "SW_INC_037 - Scan All with mixed quantity statuses",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_037");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0090-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "10" }, stamp)]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 4, po);

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.missing,
        quantity: 1,
      });

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.damaged,
        quantity: 1,
        damageReason: suite.scanAllData.defaults.damageReason,
      });

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.disputed,
        quantity: 1,
      });

      suite.stockOutProductViaUI(
        po,
        1,
        suite.scanAllData.status.soldReason,
        `${stamp}-90-1`,
      );
      suite.stockOutProductViaUI(
        po,
        1,
        suite.scanAllData.status.otherStockOutReason,
        `${stamp}-90-2`,
      );
      // WO reserve via API to dodge the broken WO-scan UI bundle error.
      suite.apiReserveViaWorkOrder(
        po,
        suite.scanAllData.searchTerms.ram,
        1,
      );

      suite.selectPOFresh(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPOFresh(po);
      suite.validateAllBadges(tc.expected);
    },
  );
});
