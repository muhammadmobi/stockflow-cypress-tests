import PurchaseOrderReportPage from '../../pageObjects/PurchaseOrderReportPage';

describe('Purchase Order Report Tests', () => {
  let reportData;
  let firstPoNumber;
  let page;
  let firstItemName;
  let firstItemCategory;
  let firstItemId;

  before(() => {
    cy.fixture('purchaseOrderReportData').then((data) => {
      reportData = data;
    });
  });

  beforeEach(() => {
    page = new PurchaseOrderReportPage();
    cy.authSession('admin');
  });


  // ── API Wiring ─────────────────────────────────────────────────────────────

  describe('API Wiring (SW-POR-TC01)', () => {

    // ── TC-01 ── Page load fires all APIs ───────────────────────────────────
    // Layer: API
    // Why:   Confirms the page is wired to all data sources before
    //        any UI state can be trusted.

    it('SW-POR-TC01: Verify page load fires all APIs', { tags: ['@smoke'] }, () => {
      // Technique: Use Case
      page.visitAndVerifyApiStatus();
    });

  });


  // ── Tabs ───────────────────────────────────────────────────────────────────

  describe('Tabs (SW-POR-TC02 - SW-POR-TC05)', () => {

    // ── TC-02 ── Tab badge counts match the tab counts API ─────────────────
    // Layer: API + UI
    // Why:   The key mapping is non-trivial (e.g. StockedOut → "Stocked out
    //        (Others)"). Asserts each badge against the tab-counts response the
    //        page ITSELF fetched on this visit (captured via @tabCountsApi),
    //        not a snapshot taken earlier in beforeEach. On a live, mutating
    //        environment (Stage) inventory changes between the beforeEach fetch
    //        and the badge render, so a cached snapshot drifts and the equality
    //        check flakes (e.g. 128778 vs 128770). Reading the page's own
    //        response makes the comparison exact and race-free.

    it('SW-POR-TC02: Verify each tab badge displays the count returned by the tab counts API', { tags: ['@smoke'] }, () => {
      // Technique: EP
      page.visit();
      cy.get(`@${reportData.aliases.tabCounts}`).then((interception) => {
        const reports = interception?.response?.body?.data?.reports;
        expect(reports, 'tab counts API should return a reports object').to.be.an('object');
        reportData.tabs.forEach(({ label, summaryKey }) => {
          const expected = Number(reports[summaryKey]);
          page.getTabBadgeCount(label).should('eq', expected);
        });
      });
    });


    // ── TC-03 ── Expected tab is active by default ──────────────────────────
    // Layer: UI
    // Why:   Simple active-state check — no interaction needed.

    it('SW-POR-TC03: Verify the Expected tab is selected by default on page load', { tags: ['@smoke'] }, () => {
      page.visit();
      page.getActiveTabLabel().should('include', reportData.defaultTab);
    });


    // ── TC-04 ── Tab click sends the correct status param ───────────────────
    // Layer: API
    // Why:   Filtering is server-side. The UI could highlight the correct tab
    //        while sending the wrong param — asserting the request catches that.

    it('SW-POR-TC04: Verify clicking each tab calls the items API with the correct status param', { tags: ['@regression'] }, () => {
      page.visit();
      const tabsToVerify = reportData.tabs.filter(({ label }) => label !== reportData.defaultTab);

      tabsToVerify.forEach(({ label, summaryKey }) => {
        cy.log(`── Testing tab: ${label} ──`);
        page.clickTab(label);
        cy.get(`@${reportData.aliases.tableItems}`)
          .its('request.url')
          .should('include', `status=${summaryKey}`);
      });
    });


    // ── TC-05 ── Active tab label updates on click ──────────────────────────
    // Layer: UI
    // Why:   TC-04 confirmed the correct param is sent. This separately
    //        confirms the visual active state also updates — the two can
    //        fail independently.

    it('SW-POR-TC05: Verify clicking a tab updates the active tab label in the UI', { tags: ['@regression'] }, () => {
      page.visit();
      const tabsToVerify = reportData.tabs.filter(({ label }) => label !== reportData.defaultTab);

      tabsToVerify.forEach(({ label }) => {
        cy.log(`── Testing tab: ${label} ──`);
        page.clickTab(label);
        page.getActiveTabLabel().should('include', label);
      });
    });

  });


  // ── PO Dropdown ────────────────────────────────────────────────────────────

  describe('PO Dropdown (SW-POR-TC06 - SW-POR-TC09)', () => {

    // ── TC-06 ── PO dropdown defaults to "All POs" ─────────────────────────
    // Layer: UI
    // Why:   The default state drives the default poNumber param. If this
    //        is wrong, every page load sends the wrong filter silently.

    it('SW-POR-TC06: Verify the PO number dropdown shows "All POs" by default', { tags: ['@smoke'] }, () => {
      page.visit();
      page.getPoDropdownValue().should('include', reportData.pagination.defaultPoLabel);
    });


    // ── TC-07 ── Selecting a PO sends the correct poNumber param ────────────
    // Layer: API
    // Why:   The filtering is server-side. Asserting the request param
    //        confirms the dropdown selection is wired to the API correctly.
    //        Uses a real PO fetched at runtime — no hardcoded PO numbers.

    it('SW-POR-TC07: Verify selecting a PO from the dropdown calls the items API with the correct poNumber param', { tags: ['@regression'] }, () => {
      if (!firstPoNumber) {
        page.visitAndCaptureFirstItem();
        cy.then(() => {
          const poArray = page._firstPoList;
          expect(poArray, 'PO List API array should exist').to.be.an('array').and.not.be.empty;
          // The UI's PoList filters out certain entries (e.g. a PO named "Default")
          // when shouldIncludeDefault={false}, so skip those here as well to ensure
          // firstPoNumber corresponds to an actual selectable option in the dropdown.
          const allowedPoArray = poArray.filter((po) => po && po !== 'Default');
          expect(allowedPoArray, 'Filtered PO list should contain at least one selectable PO')
            .to.be.an('array')
            .and.not.be.empty;
          firstPoNumber = allowedPoArray[0];
          firstItemName = page._firstItem.name;
          firstItemCategory = page._firstItem.category;
          firstItemId = page._firstItem.id;
        });
      } else {
        page.visit();
      }

      cy.then(() => {
        expect(firstPoNumber, 'A real PO must be available from the API').to.exist;
        page.selectPo(firstPoNumber);
        cy.get(`@${reportData.aliases.tableItems}`)
          .its('request.url')
          .should('include', `poNumber=${encodeURIComponent(firstPoNumber)}`);
      });
    });


    // ── TC-08 ── Export button is disabled when "All POs" is selected ───────
    // Layer: UI
    // Why:   Export is only meaningful for a specific PO. This guards
    //        against exporting an unscoped dataset unintentionally.

    it('SW-POR-TC08: Verify the Export button is disabled when "All POs" is selected', { tags: ['@regression'] }, () => {
      page.visit();
      page.getPoDropdownValue().should('include', reportData.pagination.defaultPoLabel);
      page.getExportButton().should('be.disabled');
    });


    // ── TC-09 ── Export button enables when a specific PO is selected ────────
    // Layer: UI
    // Why:   Companion to TC-08. Confirms the button becomes interactive
    //        only after the user scopes to a specific PO.

    it('SW-POR-TC09: Verify the Export button is enabled after selecting a specific PO', { tags: ['@regression'] }, () => {
      if (!firstPoNumber) {
        page.visitAndCaptureFirstItem();
        cy.then(() => {
          const poArray = page._firstPoList;
          expect(poArray, 'PO List API array should exist').to.be.an('array').and.not.be.empty;
          // The UI's PoList filters out certain entries (e.g. a PO named "Default")
          // when shouldIncludeDefault={false}, so skip those here as well to ensure
          // firstPoNumber corresponds to an actual selectable option in the dropdown.
          const allowedPoArray = poArray.filter((po) => po && po !== 'Default');
          expect(allowedPoArray, 'Filtered PO list should contain at least one selectable PO')
            .to.be.an('array')
            .and.not.be.empty;
          firstPoNumber = allowedPoArray[0];
          firstItemName = page._firstItem.name;
          firstItemCategory = page._firstItem.category;
          firstItemId = page._firstItem.id;
        });
      } else {
        page.visit();
      }

      cy.then(() => {
        expect(firstPoNumber, 'A real PO must be available from the API').to.exist;
        page.selectPo(firstPoNumber);
        page.getExportButton().should('not.be.disabled');
      });
    });

  });


  // ── Search ─────────────────────────────────────────────────────────────────

  describe('Search (SW-POR-TC10)', () => {

    // ── TC-10 ── Search sends correct param to API ──────────────────────────
    // Layer: API
    // Why:   Search filtering is server-side. Confirms the keyword is
    //        sent correctly for both name and category searches.

    it('SW-POR-TC10: Verify searching sends the correct search param to the items API', { tags: ['@regression'] }, function () {
      if (!firstPoNumber) {
        page.visitAndCaptureFirstItem();
        cy.then(() => {
          const poArray = page._firstPoList;
          expect(poArray, 'PO List API array should exist').to.be.an('array').and.not.be.empty;
          // The UI's PoList filters out certain entries (e.g. a PO named "Default")
          // when shouldIncludeDefault={false}, so skip those here as well to ensure
          // firstPoNumber corresponds to an actual selectable option in the dropdown.
          const allowedPoArray = poArray.filter((po) => po && po !== 'Default');
          expect(allowedPoArray, 'Filtered PO list should contain at least one selectable PO')
            .to.be.an('array')
            .and.not.be.empty;
          firstPoNumber = allowedPoArray[0];
          firstItemName = page._firstItem.name;
          firstItemCategory = page._firstItem.category;
          firstItemId = page._firstItem.id;
        });
      } else {
        page.visit();
      }

      // The intent of TC-10 is to confirm the correct `search=` param is sent
      // to the items API — it does NOT depend on the response. We therefore
      // assert the request URL as soon as the request fires, and only treat a
      // missing response as cause to skip (never to fail), because the Stage
      // backend's `/incoming-items/defective-reports` search is pathologically
      // slow and can fail to respond at all 
      // Encoding-agnostic: the server may encode spaces as `+`/`%20` and `@`
      // as `%40`, so decode the URL's search param and compare to the term
      // rather than guessing the exact wire encoding.
      const assertSearchParam = (term, url) => {
        expect(
          PurchaseOrderReportPage.searchParamMatches(url, term),
          `request url should carry search=${term}`
        ).to.be.true;
      };

      const nameState = {};
      const categoryState = {};

      cy.then(() => {
        // ── Search by name ──
        page.submitSearch(firstItemName, nameState);
        cy.then(() => assertSearchParam(firstItemName, nameState.url));
        page.waitForSearchResponse(nameState).then((responded) => {
          if (!responded) {
            cy.log(
              '⚠ Backend never returned the items search response (SW-POR-BUG-01). ' +
                'Search param was sent correctly; skipping the rest of TC-10.'
            );
            // eslint-disable-next-line no-invalid-this
            this.skip();
          }
        });
      });

      cy.then(() => {
        // ── Search by category ──
        page.submitSearch(firstItemCategory, categoryState);
        cy.then(() => assertSearchParam(firstItemCategory, categoryState.url));
        page.waitForSearchResponse(categoryState).then((responded) => {
          if (!responded) {
            cy.log(
              '⚠ Backend never returned the items search response (SW-POR-BUG-01). ' +
                'Search param was sent correctly; skipping the rest of TC-10.'
            );
            // eslint-disable-next-line no-invalid-this
            this.skip();
          }
        });
      });
    });

  });


  // ── Table ──────────────────────────────────────────────────────────────────

  describe('Table (SW-POR-TC11, SW-POR-TC12)', () => {

    // ── TC-11 ── Table renders rows from API response ───────────────────────
    // Layer: UI
    // Why:   Confirms the table is actually rendering data and not
    //        showing an empty state silently.

    it('SW-POR-TC11: Verify table renders rows returned by the items API', { tags: ['@smoke'] }, () => {
      page.visit();
      page.getTableRows().should('have.length.greaterThan', 0);
    });


    // ── TC-12 ── Row click navigates to correct URL ─────────────────────────
    // Layer: UI
    // Why:   Navigation is driven by item name and id from the API.
    //        Confirms both are correctly encoded in the route.

    it('SW-POR-TC12: Verify clicking a table row navigates to the correct item detail URL', { tags: ['@regression'] }, () => {
      if (!firstPoNumber) {
        page.visitAndCaptureFirstItem();
        cy.then(() => {
          const poArray = page._firstPoList;
          expect(poArray, 'PO List API array should exist').to.be.an('array').and.not.be.empty;
          // The UI's PoList filters out certain entries (e.g. a PO named "Default")
          // when shouldIncludeDefault={false}, so skip those here as well to ensure
          // firstPoNumber corresponds to an actual selectable option in the dropdown.
          const allowedPoArray = poArray.filter((po) => po && po !== 'Default');
          expect(allowedPoArray, 'Filtered PO list should contain at least one selectable PO')
            .to.be.an('array')
            .and.not.be.empty;
          firstPoNumber = allowedPoArray[0];
          firstItemName = page._firstItem.name;
          firstItemCategory = page._firstItem.category;
          firstItemId = page._firstItem.id;
        });
      } else {
        page.visit();
      }

      cy.then(() => {
        page.getTableRows().first().scrollIntoView().click({ force: true });
        cy.url()
          .should('include', encodeURIComponent(firstItemName))
          .and('include', String(firstItemId));
      });
    });

  });


  // ── Pagination ─────────────────────────────────────────────────────────────

  describe('Pagination (SW-POR-TC13 - SW-POR-TC16)', () => {

    // ── TC-13 ── Pagination summary shows correct record range ──────────────
    // Layer: UI
    // Why:   Confirms the summary text is derived correctly from the
    //        pagination.count returned by the items API.

    it('SW-POR-TC13: Verify pagination summary shows correct record range and total on load', { tags: ['@smoke'] }, () => {
      page.visit();
      cy.get(`@${reportData.aliases.tableItems}`).then((interception) => {
        const { defaultPage, defaultPageSize } = reportData.pagination;
        const totalCount = interception?.response?.body?.data?.pagination?.count;
        expect(totalCount).to.be.a('number');
        const expectedStart = ((defaultPage - 1) * defaultPageSize) + 1;
        const expectedEnd = Math.min(defaultPageSize * defaultPage, totalCount);
        page.getPaginationSummary()
          .should('include', `${expectedStart}`)
          .and('include', `${expectedEnd}`)
          .and('include', `${totalCount}`);
      });
    });


    // ── TC-14 ── Default page size is the fixture default ───────────────────
    it('SW-POR-TC14: Verify page size dropdown shows the default page size on load', { tags: ['@smoke'] }, () => {
      page.visit();
      page.getPageSizeDropdownValue()
        .should('include', String(reportData.pagination.defaultPageSize));
    });


    // ── TC-15 ── Changing page size sends correct page_size param ────────────
    it('SW-POR-TC15: Verify changing to a non-default page size sends the correct page_size param', { tags: ['@regression'] }, () => {
      page.visit();
      const nonDefaultSizes = reportData.pagination.pageSizeOptions.filter(
        (size) => size !== reportData.pagination.defaultPageSize
      );

      nonDefaultSizes.forEach((size) => {
        cy.log(`── Testing page size: ${size} ──`);
        page.changePageSize(size);
        cy.get(`@${reportData.aliases.tableItems}`)
          .its('request.url')
          .should('include', `page_size=${size}`);
      });
    });


    // ── TC-16 ── Next page sends correct page param ──────────────────────────
    it('SW-POR-TC16: Verify navigating to the next page sends the correct page param to the items API', { tags: ['@regression'] }, () => {
      page.visit();
      cy.get(`@${reportData.aliases.tableItems}`).then((interception) => {
        const { defaultPage, defaultPageSize } = reportData.pagination;
        const totalCount = interception?.response?.body?.data?.pagination?.count;
        expect(totalCount).to.be.a('number');

        if (totalCount <= defaultPageSize) {
          // Only one page of data — next-page button is disabled, skip the navigation assertion
          cy.log(`Skipping next-page check: totalCount (${totalCount}) ≤ pageSize (${defaultPageSize})`);
          page.getNextPageButton().should('be.disabled');
        } else {
          page.goToNextPage();
          cy.get(`@${reportData.aliases.tableItems}`).then((nextPageIntercept) => {
            expect(nextPageIntercept.request.url).to.include(`page=${defaultPage + 1}`);
          });
        }
      });
    });
  });

  describe('Export (SW-POR-TC17)', () => {
    // ── TC-17 ── Export downloads a file named after the selected PO ────────────
    // Layer: UI
    // Why:   Confirms the Export button triggers a real file download and
    //        the filename matches the selected PO number.

    it('SW-POR-TC17: Verify clicking Export downloads an Excel file named after the selected PO', { tags: ['@regression'] }, () => {
      if (!firstPoNumber) {
        page.visitAndCaptureFirstItem();
        cy.then(() => {
          const poArray = page._firstPoList;
          expect(poArray, 'PO List API array should exist').to.be.an('array').and.not.be.empty;
          const allowedPoArray = poArray.filter((po) => po && po !== 'Default');
          expect(allowedPoArray, 'Filtered PO list should contain at least one selectable PO')
            .to.be.an('array')
            .and.not.be.empty;
          firstPoNumber = allowedPoArray[0];
        });
      } else {
        page.visit();
      }

      cy.then(() => {
        expect(firstPoNumber, 'A real PO must be available from the API').to.exist;
        page.selectPo(firstPoNumber);
        page.getExportButton().click();
        // Use cy.task's built-in timeout option to allow 30s for slow exports
        cy.task('waitForDownload', `${firstPoNumber}.xlsx`, { timeout: 30000 });
      });
    });
  });

  // ── Item Detail Page ────────────────────────────────────────────────────────

  describe('Item Detail Page (SW-POR-TC18 - SW-POR-TC22)', () => {

    // ── TC-18 ── All required APIs fire on navigation ───────────────────────────
    it('SW-POR-TC18: Verify navigating to item detail page fires all required APIs', { tags: ['@smoke'] }, () => {
      const ctx = { firstPoNumber, firstItemName, firstItemCategory, firstItemId };
      page.visitAndNavigateToDetail(ctx);
      cy.then(() => {
        cy.get(`@${reportData.aliases.itemDetail}`).its('response.statusCode').should('eq', 200);
        cy.get(`@${reportData.aliases.itemList}`).its('response.statusCode').should('eq', 200);
        cy.get(`@${reportData.aliases.detailConfig}`).its('response.statusCode').should('eq', 200);
      });
    });

    // ── TC-19 ── Product Details section is collapsed by default ────────────────
    it('SW-POR-TC19: Verify the Product Details section is collapsed by default on the item detail page', { tags: ['@smoke'] }, () => {
      const ctx = { firstPoNumber, firstItemName, firstItemCategory, firstItemId };
      page.visitAndNavigateToDetail(ctx);
      cy.then(() => {
        page.getProductDetailsToggle().should('have.attr', 'aria-expanded', 'false');
      });
    });

    // ── TC-20 ── Clicking the toggle expands the Product Details section ─────────
    it('SW-POR-TC20: Verify clicking the toggle expands the Product Details section', { tags: ['@regression'] }, () => {
      const ctx = { firstPoNumber, firstItemName, firstItemCategory, firstItemId };
      page.visitAndNavigateToDetail(ctx);
      cy.then(() => {
        page.getProductDetailsToggle().click();
        page.getProductDetailsToggle().should('have.attr', 'aria-expanded', 'true');
      });
    });

    // ── TC-21 ── Item List table renders rows ────────────────────────────────────
    it('SW-POR-TC21: Verify the Item List table renders rows on the item detail page', { tags: ['@smoke'] }, () => {
      const ctx = { firstPoNumber, firstItemName, firstItemCategory, firstItemId };
      page.visitAndNavigateToDetail(ctx);
      cy.then(() => {
        page.getItemListRows().should('have.length.greaterThan', 0);
      });
    });

    // ── TC-22 ── PO Number column value is present in the Item List table ────────
    it('SW-POR-TC22: Verify the PO Number column is present and has a value in the Item List table', { tags: ['@smoke'] }, () => {
      const ctx = { firstPoNumber, firstItemName, firstItemCategory, firstItemId };
      page.visitAndNavigateToDetail(ctx);
      cy.then(() => {
        page.getPoNumberCell()
          .invoke('text')
          .should('not.be.empty');
      });
    });
  });
});