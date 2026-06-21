import { createScanAllSuite } from "../../support/helpers/scanAllTestHelpers";

describe("Scan All Item Tests (SW_INC_017 - SW_INC_030)", () => {
  const suite = createScanAllSuite();

  it(
    "SW_INC_017 - Scan All completes remaining items after partial scan (product-item)",
    { tags: ["@regression"] },
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-058-${stamp}`;
      const fileName = `ScanAll-058-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 5 },
        (_, i) => `SA058-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(
        fileName,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.scanSerialNumbers(po, [sns[0], sns[1]]);

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);

      suite.selectPO(po);
      suite.validateAllBadges(
        suite.scanAllData.expectedBadges.singleProductFullyReceived,
      );
      suite.validateZeroBadges();
    },
  );

  it(
    "SW_INC_019 - Scan All error when all serial numbers already scanned (product-item)",
    { tags: ["@regression"] },
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-060-${stamp}`;
      const fileName = `ScanAll-060-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 5 },
        (_, i) => `SA060-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(
        fileName,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.scanSerialNumbers(po, sns);

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll(true);
      suite.verifyScanAllError(
        suite.scanAllData.messages.allItemsAlreadyScanned,
      );
    },
  );

  it(
    "SW_INC_020 - Scan All on mixed PO: partial product-only stock-in, no items scanned",
    { tags: ["@regression"] },
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-064-${stamp}`;
      const ramFile = `ScanAll-064-ram-${stamp}.xlsx`;
      const laptopFile = `ScanAll-064-laptop-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 3 },
        (_, i) => `SA064-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(ramFile, [suite.ramRow()]);
      suite.importExcel(ramFile, po);
      suite.createExcelFile(
        laptopFile,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(laptopFile, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 2);

      suite.selectPO(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.validateAllBadges(
        suite.scanAllData.expectedBadges.mixedProductFullyReceived,
      );
      suite.validateZeroBadges();
    },
  );

  it(
    "SW_INC_021 - Scan All on mixed PO: no product-only stock-in, partial item scan",
    { tags: ["@regression"] },
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-065-${stamp}`;
      const ramFile = `ScanAll-065-ram-${stamp}.xlsx`;
      const laptopFile = `ScanAll-065-laptop-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 3 },
        (_, i) => `SA065-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(ramFile, [suite.ramRow()]);
      suite.importExcel(ramFile, po);
      suite.createExcelFile(
        laptopFile,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(laptopFile, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.scanSerialNumbers(po, [sns[0]]);

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.validateAllBadges(
        suite.scanAllData.expectedBadges.mixedProductFullyReceived,
      );
      suite.validateZeroBadges();
    },
  );

  it(
    "SW_INC_022 - Scan All on mixed PO: partial stock-in on both product-only and items",
    { tags: ["@regression"] },
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-069-${stamp}`;
      const ramFile = `ScanAll-069-ram-${stamp}.xlsx`;
      const laptopFile = `ScanAll-069-laptop-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 3 },
        (_, i) => `SA069-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(ramFile, [suite.ramRow()]);
      suite.importExcel(ramFile, po);
      suite.createExcelFile(
        laptopFile,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(laptopFile, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 2);

      suite.selectPO(po);
      suite.scanSerialNumbers(po, [sns[0]]);

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);

      suite.selectPO(po);
      suite.validateAllBadges(
        suite.scanAllData.expectedBadges.mixedProductFullyReceived,
      );
      suite.validateZeroBadges();
    },
  );

  it(
    "SW_INC_023 - Scan All error on mixed PO when all items fully stocked/scanned",
    { tags: ["@regression"] },
    () => {
      const stamp = suite.ts();
      const po = `PO-ScanAll-070-${stamp}`;
      const ramFile = `ScanAll-070-ram-${stamp}.xlsx`;
      const laptopFile = `ScanAll-070-laptop-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 3 },
        (_, i) => `SA070-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(ramFile, [suite.ramRow()]);
      suite.importExcel(ramFile, po);
      suite.createExcelFile(
        laptopFile,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(laptopFile, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.stockInProduct(suite.scanAllData.searchTerms.ram, 5);

      suite.selectPO(po);
      suite.scanSerialNumbers(po, sns);

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll(true);
      suite.verifyScanAllError(
        suite.scanAllData.messages.allItemsAlreadyScanned,
      );
    },
  );

  it(
    "SW_INC_028 - Scan All with Sold item precondition",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_028");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0081-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 5 },
        (_, i) => `SA080-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(
        fileName,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.scanSerialNumbers(po, [sns[0]]);
      suite.stockOutItemViaUI(
        sns[0],
        suite.scanAllData.status.soldReason,
        `${stamp}-81`,
      );

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_029 - Scan All with Reserved item precondition",
    { tags: ["@regression"] },
    () => {
      Cypress.once("uncaught:exception", (err) => {
        const isKnownMinifiedFunctionError =
          err?.message === "e is not a function" &&
          typeof err?.stack === "string" &&
          /(?:\/assets\/.*\.js|bundle\.js|chunk[-\w]*\.js)/.test(err.stack);

        // Only suppress the known bundled frontend error
        if (isKnownMinifiedFunctionError) {
          return false;
        }
        return true;
      });

      const tc = suite.getCase("SW_INC_029");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0082-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 5 },
        (_, i) => `SA081-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      const laptopModelNumber = `${suite.scanAllData.products.laptop.modelNumber}-${stamp}`;
      const laptopSearchTerm = `${suite.scanAllData.products.laptop.brand} ${laptopModelNumber}`;

      suite.createExcelFile(
        fileName,
        sns.map((sn) =>
          suite.laptopRow(sn, { "Model Number": laptopModelNumber }),
        ),
      );
      suite.importExcel(fileName, po);

      suite.incomingInvPage.selectPoNumber(po);
      suite.scanSerialNumbers(po, [sns[0]]);
      suite.reserveViaWorkOrderUI(laptopSearchTerm, 1, `${stamp}-82`, sns[0]);

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
      suite.validateAllBadges(tc.expected);
    },
  );

  it(
    "SW_INC_030 - Scan All with mixed item statuses",
    { tags: ["@regression"] },
    () => {
      const tc = suite.getCase("SW_INC_030");
      const stamp = suite.ts();
      const po = `${tc.po}-${stamp}`;
      const fileName = `ScanAll-0083-${stamp}.xlsx`;

      suite.createdPOs.push(po);
      const sns = Array.from(
        { length: 10 },
        (_, i) => `SA082-${String(i + 1).padStart(2, "0")}-${stamp}`,
      );

      suite.createExcelFile(
        fileName,
        sns.map((sn) => suite.laptopRow(sn)),
      );
      suite.importExcel(fileName, po);

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.missing,
        serialNumber: sns[0],
      });

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.damaged,
        serialNumber: sns[1],
        damageReason: suite.scanAllData.defaults.damageReason,
      });

      suite.openChangeStatusDialog(po, suite.scanAllData.searchTerms.laptop);
      suite.applyStatusViaDialog({
        status: suite.scanAllData.status.disputed,
        serialNumber: sns[2],
      });

      suite.incomingInvPage.selectPoNumber(po);
      suite.scanSerialNumbers(po, [sns[3], sns[4], sns[5], sns[6]]);

      suite.stockOutItemViaUI(
        sns[3],
        suite.scanAllData.status.soldReason,
        `${stamp}-83-1`,
      );
      suite.stockOutItemViaUI(
        sns[4],
        suite.scanAllData.status.otherStockOutReason,
        `${stamp}-83-2`,
      );
      suite.reserveViaWorkOrderUI(
        suite.scanAllData.searchTerms.laptop,
        1,
        `${stamp}-83`,
        sns[5],
      );

      suite.incomingInvPage.selectPoNumber(po);
      suite.clickScanAll();
      suite.verifyScanAllSuccess(po);
      suite.selectPO(po);
      suite.validateAllBadges(tc.expected);
    },
  );
});
