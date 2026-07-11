import WorkOrderPage from '../../pageObjects/WorkOrderPage';
import workOrderData from '../../fixtures/workOrderData.json';
import { faker } from '@faker-js/faker';

/**
 * Work Order - List View
 * ----------------------
 * Read-only coverage for the /work-order grid: column layout, breadcrumb,
 * search (match + empty state) and column sorting. Uses the existing
 * WorkOrderPage object and workOrderData fixture; the random no-result search
 * term is faker-generated so the empty-state assertion never depends on real data.
 */
describe('Work Order - List View', () => {
  const workOrderPage = new WorkOrderPage();

  beforeEach(() => {
    cy.login();
    cy.visit(workOrderData.url);
  });

  it('SW-WO-TC01: renders every expected column in the list view @smoke', () => {
    workOrderPage.verifyAllColumnsVisible(workOrderData.listView.columns);
  });

  it('SW-WO-TC02: shows the Dashboard -> Work Order breadcrumb', () => {
    workOrderPage.verifyBreadcrumb(
      workOrderData.breadcrumb.dashboardLabel,
      workOrderData.breadcrumb.currentPageLabel,
    );
  });

  it('SW-WO-TC03: a non-matching search term shows the empty state', () => {
    workOrderPage.typeSearch(`NO-MATCH-${faker.string.alphanumeric(8).toUpperCase()}`);
    workOrderPage.submitSearch();
    workOrderPage.verifyNoRecordsInTable();
  });

  it('SW-WO-TC04: sorts the Status column ascending', () => {
    const { columnName, ascFirstValue } = workOrderData.listView.sortableColumns.status;
    workOrderPage.clickColumnSort(columnName);
    workOrderPage.verifyColumnSortDirection(columnName, 'asc');
    workOrderPage.getFirstStatusValue().should('contain', ascFirstValue);
  });

  it('SW-WO-TC05: sorts the Status column descending', () => {
    const { columnName, descFirstValue } = workOrderData.listView.sortableColumns.status;
    workOrderPage.clickColumnSort(columnName);
    workOrderPage.clickColumnSort(columnName);
    workOrderPage.verifyColumnSortDirection(columnName, 'desc');
    workOrderPage.getFirstStatusValue().should('contain', descFirstValue);
  });

  it('SW-WO-TC06: sorts by Work Order Number column', () => {
    const column = workOrderData.listView.sortableColumns.workOrderNumber;
    workOrderPage.clickColumnSort(column);
    workOrderPage.verifyColumnSortDirection(column, 'asc');
  });

  it('SW-WO-TC07: clearing a no-result search restores the grid', () => {
    workOrderPage.typeSearch(`NO-MATCH-${faker.string.alphanumeric(6).toUpperCase()}`);
    workOrderPage.submitSearch();
    workOrderPage.verifyNoRecordsInTable();
    workOrderPage.typeSearch(' ');
    workOrderPage.submitSearch();
    workOrderPage.verifyAllColumnsVisible(workOrderData.listView.columns);
  });
});
