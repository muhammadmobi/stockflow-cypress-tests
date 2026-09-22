// cypress/e2e/IncomingInventory/AddProductTests.cy.js
//
// Test scripts for the Incoming Inventory "Add Product" feature.
// Source spec: cypress/Test scripts Instruction for All POs.txt
//
// Authoring conventions (Test Automation Skill):
//   • Page Object Model — all UI interactions in cypress/pageObjects/AllPOsPage.js
//   • Fixtures — every test data value comes from cypress/fixtures/allPosData.json
//   • Helpers — API calls, Excel-row builders, and cleanup live in
//               cypress/support/helpers/allPosHelpers.js
//   • Comment block — every it() has a @testCaseId / @description / @testData /
//                     @steps / @expectedResult block
//   • No explicit waits — only network-driven cy.wait('@alias') waits
//
// ISTQB techniques applied:
//   Use case        — Add-Product happy path (product-item and product-only)
//   Error guessing  — duplicate product re-add (negative)

import 'cypress-file-upload';
import AllPOsPage from '../../pageObjects/AllPOsPage';
import {
  importAttributesAndCategories,
  deleteCategories,
} from '../../support/helpers/attributeHelpers';
import { importExcel } from '../../support/helpers/incomingInventoryHelpers';
import {
  ts,
  buildRamRow,
  buildLaptopRow,
  createExcelFile,
  apiGetProductId,
  apiAddProductToPO,
  apiAssertProductInPO,
  cleanupCreatedPOs,
} from '../../support/helpers/allPosHelpers';

describe(
  'Incoming Inventory — Add Product feature',
  { tags: ['@regression', '@addproduct'] },
  () => {
    /** @type {AllPOsPage} */
    let page;

    // PO + product context shared across the spec — assigned in `before`.
    const ctx = {
      stamp: null,
      laptopPO: null,
      ramPO: null,
      ramPOSecondary: null,
      ramProductId: null,
      createdPOs: [],
    };

    before(function () {
      cy.fixture('allPosData').as('data');

      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      importAttributesAndCategories();

      cy.get('@data').then((td) => {
        ctx.stamp = ts();
        ctx.laptopPO = `${td.poPrefixes.laptop}${ctx.stamp}`;
        ctx.ramPO = `${td.poPrefixes.ram}${ctx.stamp}`;
        ctx.ramPOSecondary = `${td.poPrefixes.ramSecondary}${ctx.stamp}`;
        ctx.createdPOs.push(ctx.laptopPO, ctx.ramPO, ctx.ramPOSecondary);

        const lapFile = `AddProd-Lap-${ctx.stamp}.xlsx`;
        const ramFile = `AddProd-Ram-${ctx.stamp}.xlsx`;
        const ram2File = `AddProd-Ram2-${ctx.stamp}.xlsx`;

        // Seed: one product-item PO + two POs sharing the same product-only
        // product. Two RAM POs are needed because the Add-Product dialog
        // skips the destination PO when searching, so a *second* PO carrying
        // the same product is required to exercise that flow.
        const sn = `AddProdLap-${ctx.stamp}`;
        createExcelFile(lapFile, [buildLaptopRow(td, ctx.stamp, sn)]);
        createExcelFile(ramFile, [buildRamRow(td, ctx.stamp, td.ram.defaultQuantity)]);
        createExcelFile(ram2File, [buildRamRow(td, ctx.stamp, td.ram.secondaryQuantity)]);

        importExcel(lapFile, ctx.laptopPO);
        importExcel(ramFile, ctx.ramPO);
        importExcel(ram2File, ctx.ramPOSecondary);

        apiGetProductId(ctx.ramPO, td.searchTerms.ram).then((pid) => {
          ctx.ramProductId = pid;
        });
      });
    });

    beforeEach(function () {
      cy.fixture('allPosData').as('data');
      cy.on('uncaught:exception', (err) => {
        if (err?.message?.includes('Request failed with status code')) return false;
      });
      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      page = new AllPOsPage();
    });

    after(function () {
      cy.fixture('allPosData').as('data');
      cy.session('user-session', () => {
        cy.visit('/');
        cy.login();
      });
      cy.visit('/');
      cleanupCreatedPOs(ctx.createdPOs);
      // RAM/Laptop automation categories are durable shared fixtures (idempotent
      // re-seed). They can't be deleted while POs reference their products, so
      // deleting them here only caused a spurious after-hook failure.
    });

    // ─────────────────────────────────────────────────────────────────────
    // FUNCTIONAL + NEGATIVE — Add Product feature
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @testCaseId    SW_INC_ADDP_001
     * @description   A product-item product imported in another PO can
     *                be added to a fresh destination PO via the
     *                /incoming-items/add-product endpoint (the same
     *                call the Add-Product dialog uses on submit).
     * @testData      fixtures/allPosData.json → searchTerms.laptop,
     *                laptop.cost; ctx.laptopPO source
     * @steps
     *   1. Look up productId of the seeded laptop in laptopPO
     *   2. POST /incoming-items/add-product to a fresh destination PO
     *   3. GET /incoming-items?poNumber=<destPO> and verify the product
     *      is listed
     * @expectedResult  add-product responds 2xx with success=true, and
     *                  the destination PO listing contains the product.
     */
    it(
      'SW_INC_ADDP_001 — add a product-item product to another PO',
      function () {
        const destPO = `${this.data.poPrefixes.addProductLap}${ctx.stamp}`;
        ctx.createdPOs.push(destPO);

        apiGetProductId(ctx.laptopPO, this.data.searchTerms.laptop).then(
          (productId) => {
            apiAddProductToPO({
              productId,
              poNumber: destPO,
              expectedQuantity: 1,
              cost: this.data.laptop.cost,
            }).then((addRes) => {
              expect(addRes.status, 'add-product status').to.be.lessThan(400);
              expect(addRes.body?.success, 'add-product success').to.eq(true);
            });
            apiAssertProductInPO(destPO, productId);
          },
        );
      },
    );

    /**
     * @testCaseId    SW_INC_ADDP_002
     * @description   Same flow as ADDP_001 for a product-only category
     *                (RAM). Source = ctx.ramPOSecondary; destination
     *                = a fresh RAM destination PO.
     * @testData      fixtures/allPosData.json → ram.cost; ctx.ramProductId
     * @steps
     *   1. Use the RAM productId resolved in `before`
     *   2. POST /incoming-items/add-product to a fresh destination PO
     *   3. Verify the destination PO listing now includes the RAM product
     * @expectedResult  add-product responds 2xx with success=true, and
     *                  the destination PO listing contains the product.
     */
    it(
      'SW_INC_ADDP_002 — add a product-only product to another PO',
      function () {
        const destPO = `${this.data.poPrefixes.addProductRam}${ctx.stamp}`;
        ctx.createdPOs.push(destPO);

        apiAddProductToPO({
          productId: ctx.ramProductId,
          poNumber: destPO,
          expectedQuantity: 1,
          cost: this.data.ram.cost,
        }).then((addRes) => {
          expect(addRes.status, 'add-product status').to.be.lessThan(400);
          expect(addRes.body?.success, 'add-product success').to.eq(true);
        });
        apiAssertProductInPO(destPO, ctx.ramProductId);
      },
    );

    /**
     * @testCaseId    SW_INC_ADDP_003
     * @description   [NEGATIVE] Re-adding the same product to the same
     *                PO is rejected with the explicit "This product is
     *                already added to this purchase order" message
     *                enforced by both a unique-constraint guard and a
     *                pre-flight existence check (incoming-item.service.ts).
     * @testData      fixtures/allPosData.json → ram.cost,
     *                messages.duplicateProduct; ctx.ramProductId,
     *                ctx.ramPO
     * @steps
     *   1. POST /incoming-items/add-product with productId already in ramPO
     *   2. Inspect response status / success / error fields
     * @expectedResult  Response is non-success (success=false or HTTP 4xx)
     *                  AND error/message text contains the duplicate message.
     */
    it(
      'SW_INC_ADDP_003 — [NEGATIVE] adding the same product to the same PO is rejected',
      function () {
        apiAddProductToPO({
          productId: ctx.ramProductId,
          poNumber: ctx.ramPO,
          expectedQuantity: 1,
          cost: this.data.ram.cost,
        }).then((res) => {
          expect(res.status, 'duplicate add-product HTTP status').to.be.lessThan(500);
          const errorText = JSON.stringify(
            res.body?.error ?? res.body?.message ?? res.body ?? {},
          );
          expect(
            res.body?.success === false || res.status >= 400,
            `expected success=false or non-2xx, got body=${errorText.slice(0, 400)}`,
          ).to.eq(true);
          expect(
            errorText,
            'duplicate-add error message present',
          ).to.include(this.data.messages.duplicateProduct);
        });
      },
    );
  },
);
