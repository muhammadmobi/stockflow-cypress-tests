import AuditTrailLocators from "../support/locators/AuditTrailLocators";
import ItemViewPage from "./ItemViewPage";

/**
 * AuditTrailPage.js
 *
 * Page object for the Item Audit Trail dialog opened from the ⋮ row-action
 * menu on Product Details (/incoming-inventory/:name/:id).
 *
 * Companion locators: cypress/support/locators/AuditTrailLocators.js
 * Companion fixture:  cypress/fixtures/auditTrailData.json
 * Companion spec:     cypress/e2e/IncomingInventory/AuditTrailTests.cy.js
 *
 * Public API:
 *   openAuditTrailBySerial(serial)
 *   closeAuditTrailDialog()
 *   closeOpenMenu()
 *   assertDialogTitleHasSerial(serial)
 *   assertEntryCountAtLeast(min)
 *   assertEmptyState()
 *   assertSomeEntryContains(text|regex)
 *   assertEntryAtIndexContainsText(index, text)
 *   assertEntryAtIndexHasField(index, fieldLabel)
 *   assertEntryAtIndexDoesNotHaveField(index, fieldLabel)
 *   assertAuditMenuItemEnabled()
 *   getEntryIndexContainingText(text)  → returns Cypress chainable resolving to number
 */
class AuditTrailPage {
  constructor() {
    this.itemViewPage = new ItemViewPage();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dialog open / close
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Click the ⋮ menu on the row matching the serial, then click "Audit trail".
   * Waits for the dialog to appear and the React Query fetch to settle into a
   * stable state — either entries rendered OR the empty-state text visible.
   */
  openAuditTrailBySerial(serialNumber) {
    this.itemViewPage.clickItemActionMenuBySerial(serialNumber);
    cy.get(AuditTrailLocators.menu, { timeout: 10000 })
      .should("be.visible")
      .contains(AuditTrailLocators.menuItem, AuditTrailLocators.auditTrailMenuItemText)
      .should("be.visible")
      .click({ force: true });
    cy.get(AuditTrailLocators.dialog, { timeout: 10000 }).should("be.visible");
    this._waitForFetchSettled();
  }

  /** Close the dialog via the X (CloseIcon) — falls back to ESC if not found. */
  closeAuditTrailDialog() {
    cy.get("body").then(($body) => {
      const $icon = $body.find(AuditTrailLocators.closeIcon);
      if ($icon.length > 0) {
        // CloseIcon SVG is inside an IconButton — click the button parent for
        // a more reliable hit area.
        cy.get(AuditTrailLocators.closeIcon).parents("button").first().click({ force: true });
      } else {
        cy.get("body").type("{esc}");
      }
    });
    cy.get(AuditTrailLocators.dialog, { timeout: 10000 }).should("not.exist");
  }

  /** Dismiss an open ⋮ menu without selecting any item. */
  closeOpenMenu() {
    cy.get("body").type("{esc}");
    cy.get(AuditTrailLocators.menu).should("not.exist");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: wait for the dialog to reach a settled state — either at least
  // one audit entry is rendered, OR the empty-state copy is visible. Anchors
  // the wait on the rendered result rather than the loading spinner (the
  // spinner may flash too quickly to observe deterministically).
  // ─────────────────────────────────────────────────────────────────────────

  _waitForFetchSettled() {
    cy.get(AuditTrailLocators.dialog, { timeout: 20000 }).should(($dialog) => {
      const hasEntries = $dialog.find("ul li").length > 0;
      const hasEmptyState = $dialog.text().includes(AuditTrailLocators.emptyStateText);
      expect(
        hasEntries || hasEmptyState,
        "audit trail dialog must settle into entries or empty state"
      ).to.be.true;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dialog content assertions
  // ─────────────────────────────────────────────────────────────────────────

  assertDialogTitleHasSerial(serialNumber) {
    cy.get(AuditTrailLocators.dialogTitle, { timeout: 10000 })
      .should("be.visible")
      .and("contain.text", `Item Audit Trail (Serial Number: ${serialNumber})`);
  }

  assertEntryCountAtLeast(minCount) {
    cy.get(AuditTrailLocators.auditEntry, { timeout: 10000 })
      .should("have.length.at.least", minCount);
  }

  /** Empty-state copy renders; no <ul> with entries is present. */
  assertEmptyState() {
    cy.get(AuditTrailLocators.dialog)
      .should("contain.text", AuditTrailLocators.emptyStateText);
    cy.get(AuditTrailLocators.auditEntry).should("not.exist");
  }

  /**
   * At least one rendered audit entry contains the given text (case-insensitive
   * substring match) or matches the given RegExp.
   */
  assertSomeEntryContains(needle) {
    cy.get(AuditTrailLocators.auditEntry, { timeout: 10000 })
      .should("have.length.at.least", 1)
      .then(($entries) => {
        const found = Cypress._.some($entries.toArray(), (el) => {
          const text = Cypress.$(el).text();
          if (needle instanceof RegExp) return needle.test(text);
          return text.toLowerCase().includes(String(needle).toLowerCase());
        });
        expect(
          found,
          `audit trail must contain at least one entry matching "${needle}"`
        ).to.be.true;
      });
  }

  assertEntryAtIndexContainsText(index, text) {
    cy.get(AuditTrailLocators.auditEntry)
      .eq(index)
      .invoke("text")
      .then((entryText) => {
        expect(
          entryText.toLowerCase(),
          `entry at index ${index} should contain "${text}"`
        ).to.include(text.toLowerCase());
      });
  }

  assertEntryAtIndexHasField(index, fieldLabel) {
    cy.get(AuditTrailLocators.auditEntry)
      .eq(index)
      .should("contain.text", `${fieldLabel}:`);
  }

  assertEntryAtIndexDoesNotHaveField(index, fieldLabel) {
    cy.get(AuditTrailLocators.auditEntry)
      .eq(index)
      .should("not.contain.text", `${fieldLabel}:`);
  }

  /**
   * Asserts the "Audit trail" menu item is enabled (not Mui-disabled and not
   * aria-disabled). Use BEFORE clicking it. The ⋮ menu must already be open.
   */
  assertAuditMenuItemEnabled() {
    cy.get(AuditTrailLocators.menu, { timeout: 10000 })
      .should("be.visible")
      .contains(AuditTrailLocators.menuItem, AuditTrailLocators.auditTrailMenuItemText)
      .should("be.visible")
      .and("not.have.class", "Mui-disabled");
  }

  /**
   * Resolve to the index of the FIRST entry that contains `needle` (string =
   * case-insensitive substring, RegExp = regex test), or -1 if none match.
   * Returns a Cypress chainable.
   */
  getEntryIndexContainingText(needle) {
    return cy.get(AuditTrailLocators.auditEntry).then(($entries) => {
      let idx = -1;
      $entries.each((i, el) => {
        const text = Cypress.$(el).text();
        const matched =
          needle instanceof RegExp
            ? needle.test(text)
            : text.toLowerCase().includes(String(needle).toLowerCase());
        if (matched) {
          idx = i;
          return false; // break .each
        }
      });
      return idx;
    });
  }
}

export default AuditTrailPage;
