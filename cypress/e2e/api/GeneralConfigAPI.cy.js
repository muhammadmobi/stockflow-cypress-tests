/**
 * General Configuration API – Smoke Test Suite
 * ---------------------------------------------------------------
 * Mirrors the flows from cypress/e2e/Configuration/10-generalConfigTests.cy.js
 * and cypress/e2e/18-GeneralConfigTests.cy.js — but at the API layer only.
 *
 * Endpoints exercised:
 *   GET    /configs?type=general&name=general   → fetch the "general" row (id=1)
 *   PATCH  /configs/:id                         → update configJson.data fields
 *   POST   /configs                             → (negative / 401 paths)
 *
 * Config shape:
 *   {
 *     id: 1,
 *     name: "general",
 *     type: "general",
 *     configJson: {
 *       data: {
 *         isPoNumberRequired, enableScanAll, allowManualEntries,
 *         enableContainerLocationAssignment, enableImportExportAttributes,
 *         allowEditing, enableInventoryStockOut, enableCreateWorkOrder,
 *         enableSinglePoAssignment, allowProductUploadWithoutItems,
 *         stockOutReason: [{ value }], damageReason: [{ value }],
 *         productName: [{ label, value }], productNameTemplate: "..."
 *       }
 *     },
 *     userID: "..."
 *   }
 *
 * Test data mirrors the fixtures used by the UI suite:
 *   - Configuration/generalConfigScanAllTestData.json
 *   - Configuration/generalConfigStockOutReasonTestData.json
 *   - Configuration/generalConfigProductNameTestData.json
 */

describe("General Configuration API – Smoke Suite", () => {
  let authToken;
  let baseUrl;
  let generalConfigId;
  let originalConfigData;
  let scanAllTd;
  let stockOutTd;
  let productNameTd;

  // ── helpers ─────────────────────────────────────────────────────────────
  const getGeneralConfig = () => {
    return cy.request({
      method: "GET",
      url: `${baseUrl}/configs`,
      qs: { type: "general", name: "general" },
      headers: { Authorization: `Bearer ${authToken}` },
    }).then((res) => {
      // Assert the status BEFORE reaching into the envelope. Without this a
      // non-200 surfaces as an opaque "cannot read 'find' of undefined" from
      // inside this helper, hiding which request actually failed — every caller
      // below routes through here (PR #3842 review, finding 7).
      expect(res.status, 'GET /configs?type=general must succeed').to.equal(200);
      expect(res.body?.data?.list, 'the envelope must carry a config list').to.be.an('array');
      const row = res.body.data.list.find((c) => c.name === "general");
      expect(row, 'general config row must exist').to.exist;
      return row;
    });
  };

  /**
   * Patch the "general" config by merging the provided partial `data` into
   * configJson.data, preserving every other field. Returns the updated row.
   */
  const patchGeneralConfig = (partialData) => {
    return getGeneralConfig().then((row) => {
      const currentData = (row.configJson && row.configJson.data) || {};
      const merged = { ...currentData, ...partialData };
      return cy.request({
        method: "PATCH",
        url: `${baseUrl}/configs/${row.id}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: {
          type: "general",
          configJson: { data: merged },
        },
        failOnStatusCode: false,
      });
    });
  };

  const readFieldFromConfig = (fieldName) => {
    return getGeneralConfig().then((row) => row.configJson.data[fieldName]);
  };

  /** Assert a toggle field equals the expected boolean after an update. */
  const assertToggleEquals = (fieldName, expected) => {
    return readFieldFromConfig(fieldName).then((val) => {
      expect(val, `configJson.data.${fieldName}`).to.equal(expected);
    });
  };

  // ── global setup ────────────────────────────────────────────────────────
  before(() => {
    baseUrl = Cypress.env("API_BASE_URL");

    cy.fixture("Configuration/generalConfigScanAllTestData").then((d) => {
      scanAllTd = d;
    });
    cy.fixture("Configuration/generalConfigStockOutReasonTestData").then((d) => {
      stockOutTd = d;
    });
    cy.fixture("Configuration/generalConfigProductNameTestData").then((d) => {
      productNameTd = d;
    });

    cy.login().then((token) => {
      authToken = token;
      expect(authToken, "auth token").to.exist;

      // Snapshot the general config once so we can restore it in after()
      return getGeneralConfig().then((row) => {
        generalConfigId = row.id;
        originalConfigData = JSON.parse(JSON.stringify(row.configJson.data || {}));
      });
    });
  });

  after(() => {
    if (!generalConfigId || !originalConfigData) return;
    cy.request({
      method: "PATCH",
      url: `${baseUrl}/configs/${generalConfigId}`,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: {
        type: "general",
        configJson: { data: originalConfigData },
      },
      failOnStatusCode: false,
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  TOGGLE FLOWS — boolean feature switches on configJson.data
  // ═════════════════════════════════════════════════════════════════════

  /**
   * SW_GEN_CONF_API_01 – Enable "Require Purchase Order (PO Number)".
   * Flow: Require PO toggle. PATCH isPoNumberRequired=true, then GET to confirm.
   */
  it("SW_GEN_CONF_API_01 – Enable 'Require Purchase Order (PO Number)'", () => {
    patchGeneralConfig({ isPoNumberRequired: true }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    assertToggleEquals("isPoNumberRequired", true);
  });

  /**
   * SW_GEN_CONF_API_02 – Disable "Require Purchase Order (PO Number)".
   * Flow: Require PO toggle. PATCH isPoNumberRequired=false, then GET to confirm.
   */
  it("SW_GEN_CONF_API_02 – Disable 'Require Purchase Order (PO Number)'", () => {
    patchGeneralConfig({ isPoNumberRequired: false }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    assertToggleEquals("isPoNumberRequired", false);
  });

  /**
   * SW_GEN_CONF_API_11 – Enable "Allow Scan Entire Inventory".
   * Flow: Scan-all toggle.
   */
  it("SW_GEN_CONF_API_11 – Enable 'Allow Scan Entire Inventory'", () => {
    patchGeneralConfig({ enableScanAll: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableScanAll", true);
  });

  /**
   * SW_GEN_CONF_API_12 – Disable "Allow Scan Entire Inventory".
   */
  it("SW_GEN_CONF_API_12 – Disable 'Allow Scan Entire Inventory'", () => {
    patchGeneralConfig({ enableScanAll: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableScanAll", false);
  });

  /**
   * SW_GEN_CONF_API_13 – Enable "Allow Manual Entry".
   */
  it("SW_GEN_CONF_API_13 – Enable 'Allow Manual Entry'", () => {
    patchGeneralConfig({ allowManualEntries: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("allowManualEntries", true);
  });

  /**
   * SW_GEN_CONF_API_14 – Disable "Allow Manual Entry".
   */
  it("SW_GEN_CONF_API_14 – Disable 'Allow Manual Entry'", () => {
    patchGeneralConfig({ allowManualEntries: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("allowManualEntries", false);
  });

  /**
   * SW_GEN_CONF_API_15 – Enable "Allow Container Location Assignment".
   */
  it("SW_GEN_CONF_API_15 – Enable 'Allow Container Location Assignment'", () => {
    patchGeneralConfig({ enableContainerLocationAssignment: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableContainerLocationAssignment", true);
  });

  /**
   * SW_GEN_CONF_API_16 – Disable "Allow Container Location Assignment".
   */
  it("SW_GEN_CONF_API_16 – Disable 'Allow Container Location Assignment'", () => {
    patchGeneralConfig({ enableContainerLocationAssignment: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableContainerLocationAssignment", false);
  });

  /**
   * SW_GEN_CONF_API_19 – Enable "Allow Import/Export of Attributes".
   */
  it("SW_GEN_CONF_API_19 – Enable 'Allow Import/Export of Attributes'", () => {
    patchGeneralConfig({ enableImportExportAttributes: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableImportExportAttributes", true);
  });

  /**
   * SW_GEN_CONF_API_20 – Disable "Allow Import/Export of Attributes".
   */
  it("SW_GEN_CONF_API_20 – Disable 'Allow Import/Export of Attributes'", () => {
    patchGeneralConfig({ enableImportExportAttributes: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableImportExportAttributes", false);
  });

  /**
   * SW_GEN_CONF_API_22 – Enable "Allow Inventory Editing".
   */
  it("SW_GEN_CONF_API_22 – Enable 'Allow Inventory Editing'", () => {
    patchGeneralConfig({ allowEditing: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("allowEditing", true);
  });

  /**
   * SW_GEN_CONF_API_23 – Disable "Allow Inventory Editing".
   */
  it("SW_GEN_CONF_API_23 – Disable 'Allow Inventory Editing'", () => {
    patchGeneralConfig({ allowEditing: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("allowEditing", false);
  });

  /**
   * SW_GEN_CONF_API_25 – Enable "Allow Inventory Stock Out".
   */
  it("SW_GEN_CONF_API_25 – Enable 'Allow Inventory Stock Out'", () => {
    patchGeneralConfig({ enableInventoryStockOut: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableInventoryStockOut", true);
  });

  /**
   * SW_GEN_CONF_API_26 – Disable "Allow Inventory Stock Out".
   */
  it("SW_GEN_CONF_API_26 – Disable 'Allow Inventory Stock Out'", () => {
    patchGeneralConfig({ enableInventoryStockOut: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableInventoryStockOut", false);
  });

  /**
   * SW_GEN_CONF_API_28 – Enable "Allow Create Work Order".
   */
  it("SW_GEN_CONF_API_28 – Enable 'Allow Create Work Order'", () => {
    patchGeneralConfig({ enableCreateWorkOrder: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableCreateWorkOrder", true);
  });

  /**
   * SW_GEN_CONF_API_29 – Disable "Allow Create Work Order".
   */
  it("SW_GEN_CONF_API_29 – Disable 'Allow Create Work Order'", () => {
    patchGeneralConfig({ enableCreateWorkOrder: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableCreateWorkOrder", false);
  });

  /**
   * SW_GEN_CONF_API_31 – Enable "Single PO Assignment Per Worker".
   */
  it("SW_GEN_CONF_API_31 – Enable 'Single PO Assignment Per Worker'", () => {
    patchGeneralConfig({ enableSinglePoAssignment: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableSinglePoAssignment", true);
  });

  /**
   * SW_GEN_CONF_API_32 – Disable "Single PO Assignment Per Worker".
   */
  it("SW_GEN_CONF_API_32 – Disable 'Single PO Assignment Per Worker'", () => {
    patchGeneralConfig({ enableSinglePoAssignment: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("enableSinglePoAssignment", false);
  });

  /**
   * SW_GEN_CONF_API_34 – Enable "Allow Product Upload Without Items".
   */
  it("SW_GEN_CONF_API_34 – Enable 'Allow Product Upload Without Items'", () => {
    patchGeneralConfig({ allowProductUploadWithoutItems: true }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("allowProductUploadWithoutItems", true);
  });

  /**
   * SW_GEN_CONF_API_35 – Disable "Allow Product Upload Without Items".
   */
  it("SW_GEN_CONF_API_35 – Disable 'Allow Product Upload Without Items'", () => {
    patchGeneralConfig({ allowProductUploadWithoutItems: false }).then((res) =>
      expect(res.status).to.be.oneOf([200, 201]),
    );
    assertToggleEquals("allowProductUploadWithoutItems", false);
  });

  // ═════════════════════════════════════════════════════════════════════
  //  STOCK OUT REASONS FLOW — stockOutReason array on configJson.data
  // ═════════════════════════════════════════════════════════════════════

  /**
   * SW_GEN_CONF_API_08 – Add a new Stock Out Reason.
   * Flow: appends "AutomationTestReason" (plain string, matching UI write shape)
   *       to configJson.data.stockOutReason, then re-GETs to confirm presence.
   */
  it("SW_GEN_CONF_API_08 – Add a new Stock Out Reason", () => {
    getGeneralConfig().then((row) => {
      const data = row.configJson.data || {};
      const current = Array.isArray(data.stockOutReason) ? data.stockOutReason : [];
      // Normalize any legacy {value} objects to plain strings, dedupe, then append.
      const asStrings = current.map((r) => (typeof r === "string" ? r : r?.value)).filter(Boolean);
      const filtered = asStrings.filter((v) => v !== stockOutTd.addReason);
      const next = [...filtered, stockOutTd.addReason];
      patchGeneralConfig({ stockOutReason: next }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
      });
      getGeneralConfig().then((updated) => {
        const values = (updated.configJson.data.stockOutReason || []).map((r) =>
          typeof r === "string" ? r : r?.value,
        );
        expect(values).to.include(stockOutTd.addReason);
      });
    });
  });

  /**
   * SW_GEN_CONF_API_09 – Remove a Stock Out Reason.
   * Flow: ensures "AutomationTestReason" is present, then removes it and
   *       verifies it is no longer returned by GET /configs.
   */
  it("SW_GEN_CONF_API_09 – Remove a Stock Out Reason", () => {
    // Make sure the target reason exists before attempting removal.
    getGeneralConfig().then((row) => {
      const data = row.configJson.data || {};
      const current = (Array.isArray(data.stockOutReason) ? data.stockOutReason : []).map((r) =>
        typeof r === "string" ? r : r?.value,
      ).filter(Boolean);
      if (!current.includes(stockOutTd.addReason)) {
        patchGeneralConfig({ stockOutReason: [...current, stockOutTd.addReason] });
      }
    });

    // Now perform the removal and assert it's gone.
    getGeneralConfig().then((row) => {
      const current = (row.configJson.data.stockOutReason || []).map((r) =>
        typeof r === "string" ? r : r?.value,
      ).filter(Boolean);
      const next = current.filter((v) => v !== stockOutTd.addReason);
      patchGeneralConfig({ stockOutReason: next }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
      });
      getGeneralConfig().then((updated) => {
        const values = (updated.configJson.data.stockOutReason || []).map((r) =>
          typeof r === "string" ? r : r?.value,
        );
        expect(values).to.not.include(stockOutTd.addReason);
      });
    });
  });

  /**
   * SW_GEN_CONF_API_10 – Protected reason "Sold" remains present.
   * Flow: GET /configs confirms the pre-seeded "Sold" reason still exists and
   *       appears exactly once (UI-layer duplicate-prevention means the stored
   *       array should never contain more than one "Sold").
   */
  it("SW_GEN_CONF_API_10 – Protected reason 'Sold' is present and unique", () => {
    getGeneralConfig().then((row) => {
      const reasons = (row.configJson.data.stockOutReason || []).map((r) =>
        typeof r === "string" ? r : r?.value,
      );
      const soldCount = reasons.filter((v) => v === stockOutTd.protectedReason).length;
      expect(soldCount, `'${stockOutTd.protectedReason}' occurrence count`).to.equal(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  PRODUCT NAME CONFIGURATION FLOW — productName array + productNameTemplate
  // ═════════════════════════════════════════════════════════════════════

  /**
   * SW_GEN_CONF_API_04 – Select multiple attributes and add custom text.
   * Flow: builds productName = [Display Technology, Diagonal Size, -, Storage Solution]
   * and verifies productNameTemplate concatenates them.
   */
  it("SW_GEN_CONF_API_04 – Compose productName with multiple attributes + custom text", () => {
    const productName = [
      { label: productNameTd.selectAttr1, value: productNameTd.selectAttr1 },
      { label: productNameTd.selectAttr2, value: productNameTd.selectAttr2 },
      { label: productNameTd.customText, value: productNameTd.customText },
      { label: productNameTd.selectAttr3, value: productNameTd.selectAttr3 },
    ];
    const template = productName.map((t) => t.value).join(" ");

    patchGeneralConfig({ productName, productNameTemplate: template }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getGeneralConfig().then((row) => {
      const values = (row.configJson.data.productName || []).map((t) => t.value);
      expect(values).to.deep.equal(productName.map((t) => t.value));
      expect(row.configJson.data.productNameTemplate).to.equal(template);
    });
  });

  /**
   * SW_GEN_CONF_API_05 – Remove a specific attribute from the sequence.
   * Flow: starts from the 4-tag state, removes "Diagonal Size" and asserts
   * remaining tags match productNameTd.tagsAfterRemoval.
   */
  it("SW_GEN_CONF_API_05 – Remove a specific attribute from productName sequence", () => {
    const starting = [
      { label: productNameTd.selectAttr1, value: productNameTd.selectAttr1 },
      { label: productNameTd.removeAttr, value: productNameTd.removeAttr },
      { label: productNameTd.customText, value: productNameTd.customText },
      { label: productNameTd.selectAttr3, value: productNameTd.selectAttr3 },
    ];
    patchGeneralConfig({
      productName: starting,
      productNameTemplate: starting.map((t) => t.value).join(" "),
    });

    const afterRemoval = starting.filter((t) => t.value !== productNameTd.removeAttr);
    const template = afterRemoval.map((t) => t.value).join(" ");
    patchGeneralConfig({ productName: afterRemoval, productNameTemplate: template }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getGeneralConfig().then((row) => {
      const values = (row.configJson.data.productName || []).map((t) => t.value);
      expect(values).to.deep.equal(productNameTd.tagsAfterRemoval);
    });
  });

  /**
   * SW_GEN_CONF_API_06 – Custom text applies and persists across GETs.
   * Flow: sets productName with "Condition A" custom tag, re-GETs, verifies tags persist.
   */
  it("SW_GEN_CONF_API_06 – Custom text persists in productName after save", () => {
    const productName = productNameTd.tagsAfterCustomSave.map((v) => ({ label: v, value: v }));
    const template = productName.map((t) => t.value).join(" ");

    patchGeneralConfig({ productName, productNameTemplate: template }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getGeneralConfig().then((row) => {
      const values = (row.configJson.data.productName || []).map((t) => t.value);
      expect(values).to.deep.equal(productNameTd.tagsAfterCustomSave);
    });
  });

  /**
   * SW_GEN_CONF_API_07 – Replace existing productName tags with a new sequence.
   * Flow: clears existing productName, sets [Processing Cores, Cores], verifies persistence.
   */
  it("SW_GEN_CONF_API_07 – Replace existing productName tags with a new sequence", () => {
    const productName = productNameTd.tagsAfterReplace.map((v) => ({ label: v, value: v }));
    const template = productName.map((t) => t.value).join(" ");

    patchGeneralConfig({ productName, productNameTemplate: template }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    getGeneralConfig().then((row) => {
      const values = (row.configJson.data.productName || []).map((t) => t.value);
      expect(values).to.deep.equal(productNameTd.tagsAfterReplace);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  PERSISTENCE FLOWS — value survives an independent re-fetch
  //  (API equivalent of the UI "persists after page refresh" smoke tests)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Shared helper: PATCH a single field, wait for 2xx, then issue a brand-new
   * GET /configs call and assert the value is still there. This mirrors the
   * UI smoke pattern of "save → reload page → assert toggle state".
   */
  const assertPersistsAfterRefetch = (fieldName, value) => {
    patchGeneralConfig({ [fieldName]: value }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
    });
    // Independent GET simulates a page reload / fresh session.
    getGeneralConfig().then((row) => {
      expect(row.configJson.data, `configJson.data after refetch`).to.have.property(
        fieldName,
        value,
      );
    });
  };

  /**
   * SW_GEN_CONF_API_21 – "Allow Import/Export of Attributes" persists across refetch.
   */
  it("SW_GEN_CONF_API_21 – 'Allow Import/Export of Attributes' persists after refetch", () => {
    assertPersistsAfterRefetch("enableImportExportAttributes", false);
  });

  /**
   * SW_GEN_CONF_API_24 – "Allow Inventory Editing" persists across refetch.
   */
  it("SW_GEN_CONF_API_24 – 'Allow Inventory Editing' persists after refetch", () => {
    assertPersistsAfterRefetch("allowEditing", true);
  });

  /**
   * SW_GEN_CONF_API_27 – "Allow Inventory Stock Out" persists across refetch.
   */
  it("SW_GEN_CONF_API_27 – 'Allow Inventory Stock Out' persists after refetch", () => {
    assertPersistsAfterRefetch("enableInventoryStockOut", true);
  });

  /**
   * SW_GEN_CONF_API_30 – "Allow Create Work Order" persists across refetch.
   */
  it("SW_GEN_CONF_API_30 – 'Allow Create Work Order' persists after refetch", () => {
    assertPersistsAfterRefetch("enableCreateWorkOrder", false);
  });

  /**
   * SW_GEN_CONF_API_33 – "Single PO Assignment Per Worker" persists across refetch.
   */
  it("SW_GEN_CONF_API_33 – 'Single PO Assignment Per Worker' persists after refetch", () => {
    assertPersistsAfterRefetch("enableSinglePoAssignment", false);
  });

  /**
   * SW_GEN_CONF_API_36 – "Allow Product Upload Without Items" persists across refetch.
   */
  it("SW_GEN_CONF_API_36 – 'Allow Product Upload Without Items' persists after refetch", () => {
    assertPersistsAfterRefetch("allowProductUploadWithoutItems", false);
  });

  // ═════════════════════════════════════════════════════════════════════
  //  AUTH / NEGATIVE PATHS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * SW_GEN_CONF_API_37 – Unauthenticated PATCH is rejected with 401.
   * Flow: calls PATCH /configs/:id with NO Authorization header.
   */
  it("SW_GEN_CONF_API_37 – PATCH /configs/:id without auth returns 401", () => {
    cy.request({
      method: "PATCH",
      url: `${baseUrl}/configs/${generalConfigId}`,
      headers: { "Content-Type": "application/json" },
      body: { type: "general", configJson: { data: {} } },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });
});
