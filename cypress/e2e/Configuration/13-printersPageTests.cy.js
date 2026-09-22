import PrintersPage from "../../pageObjects/PrintersPage";

const loginSession = () => {
  cy.session("user-session", () => {
    cy.visit("/");
    cy.login();
  });
  cy.visit("/");
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINTERS PAGE – Page Structure & Navigation (SW-PRINTERS-TC01-04)
// ─────────────────────────────────────────────────────────────────────────────

describe("Printers – Page Structure & Tab Navigation (SW-PRINTERS-TC01-04)", () => {
  let printersPage;
  let td;

  before(() => {
    cy.fixture("printersPageData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    printersPage = new PrintersPage();
    printersPage.visit();
  });

  // Use-case technique: verify page loads with correct heading
  it(
    "SW-PRINTERS-TC01 – Verify Printers page loads with correct heading",
    { tags: ["@smoke"] },
    () => {
      printersPage.assertPageHeadingVisible(td.pageHeading);
    },
  );

  // Use-case technique: verify all three tabs render
  it(
    "SW-PRINTERS-TC02 – Verify all three tabs are visible",
    { tags: ["@smoke"] },
    () => {
      printersPage.assertTabVisible(td.tabs.workstations);
      printersPage.assertTabVisible(td.tabs.jobs);
      printersPage.assertTabVisible(td.tabs.setup);
    },
  );

  // Use-case technique: tab switching — navigate to Setup
  it(
    "SW-PRINTERS-TC03 – Verify navigating to Setup tab renders PrintwiseSetup component",
    { tags: ["@smoke"] },
    () => {
      printersPage.clickTab(td.tabs.setup);
      printersPage.assertSetupSectionVisible();
    },
  );

  // Use-case technique: tab switching — navigate to Print Jobs
  it(
    "SW-PRINTERS-TC04 – Verify navigating to Print Jobs tab renders job statistics",
    { tags: ["@regression"] },
    () => {
      printersPage.clickTab(td.tabs.jobs);
      // Stats cards are always rendered regardless of Printwise connectivity
      td.jobs.statCardLabels.forEach((label) => {
        printersPage.assertStatCardVisible(label);
      });
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRINTERS PAGE – Setup Tab (SW-PRINTERS-TC05-10)
// ─────────────────────────────────────────────────────────────────────────────

describe("Printers – Setup Tab UI (SW-PRINTERS-TC05-10)", () => {
  let printersPage;
  let td;

  before(() => {
    cy.fixture("printersPageData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    printersPage = new PrintersPage();
    printersPage.visit();
    printersPage.clickTab(td.tabs.setup);
  });

  // State note: TC07 mutates the URL input (React useState). No after() needed —
  // beforeEach re-visits the page before each test, fully remounting the component
  // and resetting all local state including the URL input.

  // Use-case technique: URL input renders with correct placeholder
  it(
    "SW-PRINTERS-TC05 – Verify Printwise URL input renders with placeholder",
    { tags: ["@smoke"] },
    () => {
      printersPage.getUrlInput().should("be.visible");
      printersPage.getUrlInput().should(
        "have.attr",
        "placeholder",
        td.setup.urlPlaceholder,
      );
    },
  );

  // EP technique: Apply button disabled when URL unchanged
  it(
    "SW-PRINTERS-TC06 – Verify Apply button is disabled when URL matches the active URL",
    { tags: ["@regression"] },
    () => {
      // The Apply button is disabled when the input value equals the activeUrl state
      printersPage.assertApplyButtonDisabled();
    },
  );

  // EP technique: Apply button enabled when URL is changed
  it(
    "SW-PRINTERS-TC07 – Verify Apply button becomes enabled when URL is changed",
    { tags: ["@regression"] },
    () => {
      printersPage.setUrl(td.setup.testUrl);
      printersPage.assertApplyButtonEnabled();
    },
  );

  // Use-case technique: connection status chip renders
  it(
    "SW-PRINTERS-TC08 – Verify connection status chip renders (Checking / Connected / Not reachable)",
    { tags: ["@smoke"] },
    () => {
      // The health query runs on mount and settles on one of three labels
      // depending on whether the Printwise backend is reachable. Accept any of
      // them — the assertion is that the chip is rendered with a valid state.
      cy.contains(/Connected|Not reachable|Checking…/, { timeout: 10000 }).should(
        "be.visible",
      );
    },
  );

  // Use-case technique: agent download section renders
  it(
    "SW-PRINTERS-TC09 – Verify 'Install the Printwise agent' section renders with download buttons",
    { tags: ["@smoke"] },
    () => {
      printersPage.assertAgentInstallSectionVisible();
      td.setup.downloadButtons.forEach((os) => {
        printersPage.assertDownloadButtonVisible(os);
      });
    },
  );

  // Use-case technique: printer assignment section renders
  it(
    "SW-PRINTERS-TC10 – Verify 'Printer assignment' section heading renders",
    { tags: ["@regression"] },
    () => {
      cy.contains(td.setup.printerAssignmentHeading).should("be.visible");
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRINTERS PAGE – Workstations Tab (SW-PRINTERS-TC11-12)
// ─────────────────────────────────────────────────────────────────────────────

describe("Printers – Workstations & Printers Tab (SW-PRINTERS-TC11-12)", () => {
  let printersPage;
  let td;

  before(() => {
    cy.fixture("printersPageData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    printersPage = new PrintersPage();
    printersPage.visit();
    printersPage.navigateToWorkstationsTab();
  });

  // Use-case technique: connection status chip visible on workstations tab
  it(
    "SW-PRINTERS-TC11 – Verify connection status chip is visible on Workstations tab",
    { tags: ["@smoke"] },
    () => {
      printersPage.assertConnectionStatusChipVisible();
    },
  );

  // Error guessing: no agents scenario — should show empty state message
  it(
    "SW-PRINTERS-TC12 – Verify 'No agents registered' message appears when Printwise is unreachable",
    { tags: ["@regression"] },
    () => {
      // In test environments without a live Printwise backend, the agents query
      // is never enabled (healthQuery.data.ok is false), so the empty-state card renders.
      printersPage.assertNoAgentsMessageVisible();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PRINTERS PAGE – Print Jobs Tab (SW-PRINTERS-TC13-15)
// ─────────────────────────────────────────────────────────────────────────────

describe("Printers – Print Jobs Tab (SW-PRINTERS-TC13-15)", () => {
  let printersPage;
  let td;

  before(() => {
    cy.fixture("printersPageData").then((data) => {
      td = data;
    });
  });

  beforeEach(() => {
    loginSession();
    printersPage = new PrintersPage();
    printersPage.visit();
    printersPage.navigateToJobsTab();
  });

  // Use-case technique: all stat cards render
  it(
    "SW-PRINTERS-TC13 – Verify all job statistics cards are visible",
    { tags: ["@smoke"] },
    () => {
      td.jobs.statCardLabels.forEach((label) => {
        printersPage.assertStatCardVisible(label);
      });
    },
  );

  // Use-case technique: filter controls render
  it(
    "SW-PRINTERS-TC14 – Verify Status filter and Time window filter are visible",
    { tags: ["@regression"] },
    () => {
      printersPage.assertStatusFilterVisible();
      printersPage.assertTimeWindowFilterVisible();
    },
  );

  // Error guessing: no-jobs empty state renders when Printwise not connected
  it(
    "SW-PRINTERS-TC15 – Verify 'No jobs in this window' empty state appears when Printwise unreachable",
    { tags: ["@regression"] },
    () => {
      // Jobs query is enabled even without a base URL (enabled: !!baseUrl defaults
      // to fallback). With no Printwise server the query fails/returns empty.
      cy.contains(td.jobs.noJobsText, { timeout: 10000 }).should("be.visible");
    },
  );
});
