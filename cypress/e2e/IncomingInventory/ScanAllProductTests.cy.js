import { createScanAllSuite } from "../../support/helpers/scanAllTestHelpers";

describe("Scan All Product Tests (SW_INC_013 - SW_INC_037)", () => {
  const suite = createScanAllSuite();

  it(
    "SW_INC_013 - Scan All with enableScanAll ON marks all incoming items as scanned",
    { tags: ["@smoke", "@regression"] },
    () => {
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
      suite.generalConfigPage.navigateToGeneralConfig();
      suite.generalConfigPage.disableToggle("enableScanAll");
      suite.generalConfigPage.assertToggleDisabled("enableScanAll");

      cy.window().then((win) => {
        try {
          const raw = win.localStorage.getItem("stock-wise");
          const stored = raw ? JSON.parse(raw) : {};
          if (stored.config?.config) {
            stored.config.config.enableScanAll = false;
          }
          win.localStorage.setItem("stock-wise", JSON.stringify(stored));
        } catch (e) {
          /* ignore */
        }
      });

      cy.intercept("GET", "**/configs**", (req) => {
        req.continue();
      }).as("configAfterDisable");

      suite.incomingInvPage.clickIncomingInventoryNav();
      suite.incomingInvPage.selectPoNumber(suite.scanAllData.po.defaultOpen);

      cy.get(".MuiIconButton-root#basic-button")
        .should("be.visible")
        .click({ force: true });
      cy.get("#basic-menu").should("be.visible");
      cy.get('ul[role="menu"]').should("not.contain", "Scan All");
      cy.get("body").type("{esc}");

      suite.generalConfigPage.navigateToGeneralConfig();
      suite.generalConfigPage.enableToggle("enableScanAll");
      suite.generalConfigPage.assertToggleEnabled("enableScanAll");
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
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 2);

      suite.selectPO(po);
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
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-059-${stamp}`;
      const fileName = `ScanAll-059-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 5);

      suite.selectPO(po);
      suite.clickScanAll(true);
      suite.verifyScanAllError(
        suite.scanAllData.messages.allItemsAlreadyScanned,
      );
    },
  );

  it(
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

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
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
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.damaged,
        quantity: 1,
        damageReason: suite.scanAllData.defaults.damageReason,
      });

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
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
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.ram);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.disputed,
        quantity: 1,
      });

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_034 - Scan All with Stocked Out quantity precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_034");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0087-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 1);
      suite.stockOutProductViaUI(
        po,
        1,
        suite.scanAllData.status.otherStockOutReason,
        `${stamp}-87`,
      );

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
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
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 1);
      suite.stockOutProductViaUI(
        po,
        1,
        suite.scanAllData.status.soldReason,
        `${stamp}-88`,
      );

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
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
      suite.createExcelFile(fileName, [suite.ramRow()]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 1);
      // WO reserve via API — the UI flow throws a minified bundle error
      // ("e is not a function") after typing the serial, so we create the
      // work-order directly through POST /work-orders. Product-only reserve
      // does not need a serial scan; the qty=1 reservation is enough.
      suite.apiReserveViaWorkOrder(
        po,
        suite.scanAllData.searchTerms.ram,
        1,
      );

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_037 - Scan All with mixed quantity statuses",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_037");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0090-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      suite.createExcelFile(fileName, [suite.ramRow({ Quantity: "10" })]);
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 4);

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

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
      suite.validateAllBadges(tc.expected);
    },
  );
});
