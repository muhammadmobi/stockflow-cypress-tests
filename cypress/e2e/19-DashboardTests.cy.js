import DashboardPage from '../pageObjects/dashboardPage';
import data from '../fixtures/dashboardData.json';

describe('Inventory Dashboard Tests', { tags: ['@regression'] }, () => {
  let dashboardPage;

  beforeEach(() => {
    dashboardPage = new DashboardPage();
    cy.authSession('admin');
    dashboardPage.visit();
  });

  // ── KPI card labels ─────────────────────────────────────────────────────────

  it('SW-DASH-TC01: Verify all four KPI card labels are visible on the dashboard', { tags: ['@smoke'] }, () => {
    // EP: valid partition — all KpiTopCard labels must render for an authenticated admin
    data.kpiCardLabels.forEach((label) => {
      dashboardPage.verifyKpiCardLabelVisible(label);
    });
  });

  // ── DashboardCard section titles ────────────────────────────────────────────

  it('SW-DASH-TC02: Verify the Stock Movement card title is visible', () => {
    // EP: valid partition — StockMovementCard header title renders
    dashboardPage.verifyDashboardCardTitle(data.dashboardCardTitles.stockMovement);
  });

  it('SW-DASH-TC03: Verify the Inventory Overview card title is visible', () => {
    // EP: valid partition — InventoryOverviewCard header title renders
    dashboardPage.verifyDashboardCardTitle(data.dashboardCardTitles.inventoryOverview);
  });

  it('SW-DASH-TC04: Verify the Item Status card title is visible', () => {
    // EP: valid partition — ItemStatusCard header title renders
    dashboardPage.verifyDashboardCardTitle(data.dashboardCardTitles.itemStatus);
  });

  it('SW-DASH-TC05: Verify the Purchase Order Health card title is visible', { tags: ['@smoke'] }, () => {
    // EP: valid partition — POHealthCard header title renders
    dashboardPage.verifyDashboardCardTitle(data.dashboardCardTitles.poHealth);
  });

  // ── Time range toggle ───────────────────────────────────────────────────────

  it('SW-DASH-TC06: Verify all time range toggle buttons are visible in the toolbar', { tags: ['@smoke'] }, () => {
    // Use case: time filter toolbar — all 5 options must be present
    data.timeRangeLabels.forEach((label) => {
      dashboardPage.verifyTimeRangeButton(label);
    });
  });

  it('SW-DASH-TC07: Verify that selecting Last 7 Days shows the Filtered badge on KPI cards', () => {
    // Decision table: timeRange=7d → isDateFilterApplied=true → CardScopeBadge "Filtered" chip appears on each KPI card
    dashboardPage.selectTimeRange(data.timeRangeLabels[1]);
    cy.findAllByText(/^Filtered$/i).should('have.length.at.least', 1).first().should('be.visible');
  });

  it('SW-DASH-TC08: Verify that switching back to All hides the Filtered badge', () => {
    // Decision table: timeRange=7d then all → isDateFilterApplied=false → all Filtered chips disappear
    dashboardPage.selectTimeRange(data.timeRangeLabels[1]);
    dashboardPage.selectTimeRange(data.timeRangeLabels[0]);
    cy.findAllByText(/^Filtered$/i).should('not.exist');
  });

  // ── Edit Dashboard ──────────────────────────────────────────────────────────

  it('SW-DASH-TC09: Verify the Edit Dashboard button is visible on load', () => {
    // Use case: edit mode entry point — button must be present on load
    dashboardPage.verifyEditDashboardButton();
  });

  it('SW-DASH-TC10: Verify that clicking Edit Dashboard shows the Save Layout button', () => {
    // State transition: view → edit mode — drag handles and Save Layout must appear
    dashboardPage.enterEditMode();
  });

  it('SW-DASH-TC11: Verify that saving the layout exits edit mode and restores the Edit Dashboard button', () => {
    // State transition: edit → save → view mode — Save Layout disappears, Edit Dashboard reappears
    dashboardPage.enterEditMode();
    dashboardPage.saveLayout();
    cy.findByRole('button', { name: /save layout/i }).should('not.exist');
    dashboardPage.verifyEditDashboardButton();
  });

  // ── Edit Dashboard — Reset ──────────────────────────────────────────────────

  it('SW-DASH-TC12: Verify that the Reset button is visible in edit mode', () => {
    // State transition: view → edit mode — Reset button appears alongside Save Layout
    dashboardPage.enterEditMode();
    dashboardPage.verifyResetButtonVisible();
  });

  it('SW-DASH-TC13: Verify that clicking Reset in edit mode keeps edit mode active', () => {
    // State transition: edit → reset — layout reverts but edit mode stays active (Save Layout remains visible)
    dashboardPage.enterEditMode();
    dashboardPage.resetLayout();
    cy.findByRole('button', { name: /save layout/i }).should('be.visible');
  });

  // ── Custom Date Range ───────────────────────────────────────────────────────

  it('SW-DASH-TC14: Verify that clicking Custom opens the date range popover', { tags: ['@smoke'] }, () => {
    // Use case: custom range entry point — popover must open with From/To fields visible
    dashboardPage.openCustomDateRange();
    dashboardPage.verifyCustomDatePopoverVisible();
    dashboardPage.cancelCustomDateRange();
  });

  it('SW-DASH-TC15: Verify that the Apply button is enabled when the popover opens with default dates pre-filled', () => {
    // EP: valid partition — popover pre-fills From (today − 6 days) and To (today), so Apply is immediately enabled
    dashboardPage.openCustomDateRange();
    dashboardPage.verifyApplyButtonEnabled();
    dashboardPage.cancelCustomDateRange();
  });

  it('SW-DASH-TC16: Verify that cancelling the custom date range popover closes it', () => {
    // Use case: Cancel button closes the popover — "Custom Date Range" heading disappears from DOM
    dashboardPage.openCustomDateRange();
    dashboardPage.verifyCustomDatePopoverVisible();
    dashboardPage.cancelCustomDateRange();
    cy.contains('.MuiTypography-subtitle2', /custom date range/i).should('not.exist');
  });

  it('SW-DASH-TC17: Verify that applying a valid custom date range shows the Filtered badge on KPI cards', () => {
    // Use case: valid From ≤ To → Apply enabled → clicking Apply sets timeRange=custom → Filtered badge appears
    dashboardPage.openCustomDateRange();
    dashboardPage.setCustomDateFrom(data.customDateRange.validFrom);
    dashboardPage.setCustomDateTo(data.customDateRange.validTo);
    dashboardPage.verifyApplyButtonEnabled();
    dashboardPage.applyCustomDateRange();
    cy.findAllByText(/^Filtered$/i).should('have.length.at.least', 1).first().should('be.visible');
  });

  it('SW-DASH-TC18: Verify that cancelling the custom date range popover does not apply the filter or show the Filtered badge', () => {
    // Error guessing: Cancel must not commit the draft dates — isDateFilterApplied stays false, no Filtered chip
    dashboardPage.openCustomDateRange();
    dashboardPage.setCustomDateFrom(data.customDateRange.validFrom);
    dashboardPage.setCustomDateTo(data.customDateRange.validTo);
    dashboardPage.cancelCustomDateRange();
    cy.findAllByText(/^Filtered$/i).should('not.exist');
  });

  // ── Stock Movement card ─────────────────────────────────────────────────────

  it('SW-DASH-TC19: Verify that the Stock Movement card title and activity subtitle are visible', () => {
    // EP: valid partition — DashboardCard renders "Stock Movement" title and "<timeLabel> activity" subtitle
    dashboardPage.verifyDashboardCardTitle('Stock Movement');
    cy.contains(/activity$/i).should('be.visible');
  });

  // ── Inventory Overview card ─────────────────────────────────────────────────

  it('SW-DASH-TC20: Verify that all four Inventory Overview legend rows are visible', { tags: ['@smoke'] }, () => {
    // EP: valid partition — all 4 inventory status rows render in the InventoryOverviewCard legend
    data.inventoryOverviewRows.forEach((label) => {
      dashboardPage.verifyInventoryOverviewRowVisible(label);
    });
  });

  it('SW-DASH-TC21: Verify that clicking an Inventory Overview row navigates to the inventory page', () => {
    // Use case: legend row click → navigate('/inventory', { state: { stateFilter: s } })
    dashboardPage.clickInventoryOverviewRow(data.inventoryOverviewRows[0]);
    cy.url().should('include', '/inventory');
  });

  // ── Item Status card ────────────────────────────────────────────────────────

  it('SW-DASH-TC22: Verify that all three Item Status rows are visible', { tags: ['@smoke'] }, () => {
    // EP: valid partition — Damaged Items, Missing Items, Disputed Items must all render
    data.itemStatusRows.forEach((label) => {
      dashboardPage.verifyItemStatusRowVisible(label);
    });
  });

  it('SW-DASH-TC23: Verify that clicking a Damaged Items row navigates to the inventory page', () => {
    // Use case: row click → navigate('/inventory', { state: { stateFilter: Damaged } })
    dashboardPage.clickItemStatusRow(data.itemStatusRows[0]);
    cy.url().should('include', '/inventory');
  });

  it('SW-DASH-TC24: Verify that clicking a Missing Items row navigates to the inventory page', () => {
    // Use case: row click → navigate('/inventory', { state: { stateFilter: Missing } })
    dashboardPage.clickItemStatusRow(data.itemStatusRows[1]);
    cy.url().should('include', '/inventory');
  });

  // ── Purchase Order Health card ──────────────────────────────────────────────

  it('SW-DASH-TC25: Verify that all three Purchase Order Health rows are rendered', { tags: ['@smoke'] }, () => {
    // EP: valid partition — Total POs, Open POs, Closed POs must all exist in the DOM
    data.poHealthRows.forEach((label) => {
      dashboardPage.verifyPOHealthRowVisible(label);
    });
  });

  // ── Work Orders card ────────────────────────────────────────────────────────

  it('SW-DASH-TC26: Verify that the Open, Closed, and Cancelled work order rows are rendered', () => {
    // EP: valid partition — three status rows exist in the WorkOrdersCard DOM
    data.workOrderRows.forEach((label) => {
      dashboardPage.verifyWorkOrderRowVisible(label);
    });
  });

  it('SW-DASH-TC27: Verify that clicking the Work Orders card navigates to the work orders page', () => {
    // Use case: card onClick → navigate('/work-orders')
    dashboardPage.clickWorkOrdersCard();
    cy.url().should('include', '/work-order');
  });

  // ── Asset Tracking card ─────────────────────────────────────────────────────

  it('SW-DASH-TC28: Verify that all three Asset Tracking rows are rendered', () => {
    // EP: valid partition — Total Assets, Active Components, Reassembled must all exist in the DOM
    data.assetTrackingRows.forEach((label) => {
      dashboardPage.verifyAssetTrackingRowVisible(label);
    });
  });

  it('SW-DASH-TC29: Verify that clicking a Disputed Items row navigates to the inventory page', () => {
    // Use case: row click → navigate('/inventory', { state: { stateFilter: Disputed } })
    dashboardPage.clickItemStatusRow(data.itemStatusRows[2]);
    cy.url().should('include', '/inventory');
  });
});
