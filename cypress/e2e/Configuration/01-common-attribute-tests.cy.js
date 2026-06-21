import AttribPage from "../../pageObjects/AttribPage";


const loginSession = () => {
    cy.session("user-session", () => {
        cy.visit("/");
        cy.login();
    });
    cy.visit("/");
};


describe("Common Product Attribute - Text (SW_ATR_01 – SW_ATR_06)", () => {
    let attribPage;
    let td;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            td = data["common text"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_01 - Add Common Product Attribute (Text) with V-Lookup", { tags: ['@smoke', '@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(td.name);
        attribPage.clickSelect();
        attribPage.clickSelectOption("Text");
        attribPage.typeDefaultValue(td.defaultValue);
        attribPage.typeMinLength(td.minLength);
        attribPage.typeMaxLength(td.maxLength);
        attribPage.enableVLookupToggle();
        attribPage.assertVLookupType("Exact");
        attribPage.typeVLookupKey(td.vlookupKey);
        attribPage.typeVLookupValue(td.vlookupValue);
        attribPage.clickSaveBt();

        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(td.name);

        // Verify saved values
        attribPage.editAttribute(td.name);
        attribPage.assertMinLength(td.minLength);
        attribPage.assertMaxLength(td.maxLength);
        attribPage.assertDefaultValue(td.defaultValue);
        attribPage.assertVLookupKey(td.vlookupKey);
        attribPage.assertVLookupValue(td.vlookupValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_02 - Update Common Product Attribute Name", { tags: ['@smoke', '@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(td.name);
        attribPage.editItemName(td.updatedName);
        attribPage.clickUpdateBt();

        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(td.updatedName);

    });

    it("SW_ATR_03 - Update Common Product Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();

        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(td.updatedName);

    });

    it("SW_ATR_04 - Update Common Product Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();

        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(td.updatedName, "No");

    });

    it("SW_ATR_06 - Verify Edit V-Lookup", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(td.updatedName);
        attribPage.assertAttributeNameLoaded(td.updatedName);
        attribPage.typeVLookupKey(td.vlookupKeyUpdated);
        attribPage.clickUpdateBt();

        attribPage.assertToast("Attribute updated");

        // Verify V-Lookup key updated
        attribPage.editAttribute(td.updatedName);
        attribPage.assertVLookupKey(td.vlookupKeyUpdated);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_05 - Delete Common Product Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(td.updatedName);
        attribPage.deleteAttribute(td.updatedName);

        attribPage.assertToast("Attribute Deleted");
        cy.reload();
        attribPage.clickAttribOption();
        attribPage.assertAttributeNotInList(td.updatedName);

    });
});


describe("Common Product Attribute - Multi Line Text & Number (SW_ATR_07 – SW_ATR_16)", () => {
    let attribPage;
    let mline;
    let number;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            mline = data["common multiLineText"];
            number = data["common number"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Multi Line Text CRUD (ATR_07 – ATR_11) ────────────────────

    it("SW_ATR_07 - Add Common Product Attribute (Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(mline.name);
        attribPage.selectType("MultiLineText");
        attribPage.typeMinLength(mline.minLength);
        attribPage.typeMaxLength(mline.maxLength);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(mline.name);

        // Verify saved values
        attribPage.editAttribute(mline.name);
        attribPage.assertMinLength(mline.minLength);
        attribPage.assertMaxLength(mline.maxLength);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_08 - Update Common Product Attribute Name (Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(mline.name);
        attribPage.editItemName(mline.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(mline.updatedName);

    });

    it("SW_ATR_09 - Update Common Product Attribute (Enable Required - Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(mline.updatedName);
        attribPage.assertAttributeNameLoaded(mline.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(mline.updatedName, "Yes");

    });

    it("SW_ATR_10 - Update Common Product Attribute (Disable Required - Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(mline.updatedName);
        attribPage.assertAttributeNameLoaded(mline.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(mline.updatedName, "No");

    });

    it("SW_ATR_11 - Delete Common Product Attribute (Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(mline.updatedName);
        attribPage.deleteAttribute(mline.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(mline.updatedName);

    });

    // ── Number Negative Test + CRUD (ATR_12 – ATR_16) ─────────────

    it("SW_ATR_12 - Negative Test: Create Number type Attribute with invalid Max Value", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(number.name);
        attribPage.selectType("Number");
        attribPage.typeMaxValue(number.invalidMaxValue);
        attribPage.clickSaveBt();
        attribPage.assertValidationError(number.invalidMaxValueError);
    });

    it("SW_ATR_13 - Add Common Product Attribute (Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(number.name);
        attribPage.selectType("Number");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(number.name);

    });

    it("SW_ATR_14 - Update Common Product Attribute Name (Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(number.name);
        attribPage.editItemName(number.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(number.updatedName);

    });

    it("SW_ATR_15 - Update Common Product Attribute (Enable Required - Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(number.updatedName);
        attribPage.assertAttributeNameLoaded(number.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(number.updatedName, "Yes");

    });

    it("SW_ATR_16 - Update Common Product Attribute (Disable Required - Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(number.updatedName);
        attribPage.assertAttributeNameLoaded(number.updatedName);
        attribPage.assertRequiredChecked();
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(number.updatedName, "No");

    });
});


describe("Common Product Attribute - Email & URL (SW_ATR_17 – SW_ATR_27)", () => {
    let attribPage;
    let email;
    let url;
    let numberFromS2;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            email = data["common email"];
            url = data["common url"];
            numberFromS2 = data["common number"].updatedName;
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Delete Number from Section 2 (ATR_17) ────────────────────

    it("SW_ATR_17 - Delete Common Product Attribute (Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(numberFromS2);
        attribPage.deleteAttribute(numberFromS2);

        attribPage.assertToast("Attribute Deleted");
        cy.reload();
        attribPage.clickAttribOption();
        attribPage.assertAttributeNotInList(numberFromS2);

    });

    // ── Email CRUD (ATR_18 – ATR_22) ─────────────────────────────

    it("SW_ATR_18 - Add Common Product Attribute (Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(email.name);
        attribPage.selectType("Email");
        attribPage.typeDefaultValue(email.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(email.name);

        // Verify default value
        attribPage.editAttribute(email.name);
        attribPage.assertDefaultValue(email.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_19 - Update Common Product Attribute Name (Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(email.name);
        attribPage.editItemName(email.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(email.updatedName);

    });

    it("SW_ATR_20 - Update Common Product Attribute (Enable Required - Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(email.updatedName);
        attribPage.assertAttributeNameLoaded(email.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(email.updatedName, "Yes");

    });

    it("SW_ATR_21 - Update Common Product Attribute (Disable Required - Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(email.updatedName);
        attribPage.assertAttributeNameLoaded(email.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(email.updatedName, "No");

    });

    it("SW_ATR_22 - Delete Common Product Attribute (Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(email.updatedName);
        attribPage.deleteAttribute(email.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(email.updatedName);

    });

    // ── URL CRUD (ATR_23 – ATR_27) ───────────────────────────────

    it("SW_ATR_23 - Add Common Product Attribute (URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(url.name);
        attribPage.selectType("URL");
        attribPage.typeDefaultValue(url.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(url.name);
        // Verify default value
        attribPage.editAttribute(url.name);
        attribPage.assertDefaultValue(url.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_24 - Update Common Product Attribute Name (URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(url.name);
        attribPage.editItemName(url.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(url.updatedName);

    });

    it("SW_ATR_25 - Update Common Product Attribute (Enable Required - URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(url.updatedName);
        attribPage.assertAttributeNameLoaded(url.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();

        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(url.updatedName, "Yes");

    });

    it("SW_ATR_26 - Update Common Product Attribute (Disable Required - URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(url.updatedName);
        attribPage.assertAttributeNameLoaded(url.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();

        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(url.updatedName, "No");

    });

    it("SW_ATR_27 - Delete Common Product Attribute (URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(url.updatedName);
        attribPage.deleteAttribute(url.updatedName);

        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(url.updatedName);

    });
});


describe("Common Product Attribute - Decimal & Amount (SW_ATR_28 – SW_ATR_37)", () => {
    let attribPage;
    let decimal;
    let amount;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            decimal = data["common decimal"];
            amount = data["common amount"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Decimal CRUD (ATR_28 – ATR_32) ───────────────────────────

    it("SW_ATR_28 - Add Common Product Attribute (Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(decimal.name);
        attribPage.selectType("Decimal");
        attribPage.typeDefaultValue(decimal.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(decimal.name);
        // Verify default value
        attribPage.editAttribute(decimal.name);
        attribPage.assertDefaultValue(decimal.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_29 - Update Common Product Attribute Name (Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(decimal.name);
        attribPage.editItemName(decimal.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(decimal.updatedName);

    });

    it("SW_ATR_30 - Update Common Product Attribute (Enable Required - Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(decimal.updatedName);
        attribPage.assertAttributeNameLoaded(decimal.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(decimal.updatedName, "Yes");

    });

    it("SW_ATR_31 - Update Common Product Attribute (Disable Required - Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(decimal.updatedName);
        attribPage.assertAttributeNameLoaded(decimal.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(decimal.updatedName, "No");

    });

    it("SW_ATR_32 - Delete Common Product Attribute (Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(decimal.updatedName);
        attribPage.deleteAttribute(decimal.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(decimal.updatedName);

    });

    // ── Amount CRUD (ATR_33 – ATR_37) ────────────────────────────

    it("SW_ATR_33 - Add Common Product Attribute (Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(amount.name);
        attribPage.selectType("Amount");
        attribPage.typeDefaultValue(amount.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(amount.name);

        // Verify default value
        attribPage.editAttribute(amount.name);
        attribPage.assertDefaultValue(amount.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_34 - Update Common Product Attribute Name (Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(amount.name);
        attribPage.editItemName(amount.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(amount.updatedName);

    });

    it("SW_ATR_35 - Update Common Product Attribute (Enable Required - Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(amount.updatedName);
        attribPage.assertAttributeNameLoaded(amount.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(amount.updatedName, "Yes");

    });

    it("SW_ATR_36 - Update Common Product Attribute (Disable Required - Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(amount.updatedName);
        attribPage.assertAttributeNameLoaded(amount.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(amount.updatedName, "No");

    });

    it("SW_ATR_37 - Delete Common Product Attribute (Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(amount.updatedName);
        attribPage.deleteAttribute(amount.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(amount.updatedName);

    });
});


describe("Common Product Attribute - Percent & List (SW_ATR_38 – SW_ATR_42)", () => {
    let attribPage;
    let percent;
    let list;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            percent = data["common percent"];
            list = data["common list"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Percent CRUD (ATR_38 – ATR_42) ───────────────────────────

    it("SW_ATR_38 - Add Common Product Attribute (Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(percent.name);
        attribPage.selectType("Percent");
        attribPage.typeDefaultValue(percent.defaultValue);
        attribPage.clickSaveBt();

        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(percent.name);

        // Verify default value
        attribPage.editAttribute(percent.name);
        attribPage.assertDefaultValue(percent.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_39 - Update Common Product Attribute Name (Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(percent.name);
        attribPage.editItemName(percent.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(percent.updatedName);

    });

    it("SW_ATR_40 - Update Common Product Attribute (Enable Required - Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(percent.updatedName);
        attribPage.assertAttributeNameLoaded(percent.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(percent.updatedName, "Yes");

    });

    it("SW_ATR_41 - Update Common Product Attribute (Disable Required - Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(percent.updatedName);
        attribPage.assertAttributeNameLoaded(percent.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(percent.updatedName, "No");

    });

    it("SW_ATR_42 - Delete Common Product Attribute (Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(percent.updatedName);
        attribPage.deleteAttribute(percent.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(percent.updatedName);

    });



});



describe("Common Product Attribute - List Advanced & Boolean (SW_ATR_43 – SW_ATR_55)", () => {
    let attribPage;
    let list;
    let boolean;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            list = data["common list"];
            boolean = data["common boolean"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });


    it("SW_ATR_43 - Add Common Product Attribute (List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(list.name);
        attribPage.selectType("List");
        attribPage.waitForListRowsToRender();
        attribPage.typeInListRows(list.options);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(list.name);
        // Verify list options saved
        attribPage.editAttribute(list.name);
        list.options.forEach((opt, i) => {
            attribPage.assertListOption(i, opt);
        });
        attribPage.clickCancelBt();

    });

    it("SW_ATR_44 - Update Common Product Attribute Name (List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(list.name);
        attribPage.editItemName(list.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(list.updatedName);

    });

    it("SW_ATR_45 - Update Common Product Attribute (Enable Required - List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(list.updatedName);
        attribPage.assertAttributeNameLoaded(list.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(list.updatedName, "Yes");

    });

    it("SW_ATR_46 - Update Common Product Attribute (Disable Required - List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(list.updatedName);
        attribPage.assertAttributeNameLoaded(list.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(list.updatedName, "No");

    });


    it("SW_ATR_48 - Verify Add Row (List) for Common Product Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(list.updatedName);
        attribPage.clickAddRow();
        attribPage.typeListOption(list.options.length, "New Option Value");
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        // Verify new option persisted
        attribPage.editAttribute(list.updatedName);
        attribPage.assertListOption(list.options.length, "New Option Value");
        attribPage.clickCancelBt();

    });

    it("SW_ATR_49 - Verify Bulk Addition (List) for Common Product Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(list.updatedName);
        attribPage.clickAddBulkList();
        attribPage.typeBulkAddition("A, B, C");
        attribPage.confirmBulkAddition();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");

    });

    it("SW_ATR_50 - Verify Remove Option (List) for Common Product Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(list.updatedName);
        attribPage.deleteListOption(0);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");

    });

    it("SW_ATR_47 - Delete Common Product Attribute (List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(list.updatedName);
        attribPage.deleteAttribute(list.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(list.updatedName);

    });



    // ── Boolean CRUD (ATR_51–55) ────────────────────────────────────────────

    it("SW_ATR_51 - Add Common Product Attribute (Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(boolean.name);
        attribPage.selectType("Boolean");
        attribPage.clickCheckedByDefault();
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(boolean.name);

    });

    it("SW_ATR_52 - Update Common Product Attribute Name (Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(boolean.name);
        attribPage.editItemName(boolean.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(boolean.updatedName);

    });

    it("SW_ATR_53 - Update Common Product Attribute (Enable Required - Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(boolean.updatedName);
        attribPage.assertAttributeNameLoaded(boolean.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.assertRequiredInList(boolean.updatedName, "Yes");

    });

    it("SW_ATR_54 - Update Common Product Attribute (Disable Required - Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.editAttribute(boolean.updatedName);
        attribPage.assertAttributeNameLoaded(boolean.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(boolean.updatedName, "No");

    });

    it("SW_ATR_55 - Delete Common Product Attribute (Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.assertAttributeInList(boolean.updatedName);
        attribPage.deleteAttribute(boolean.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(boolean.updatedName);

    });
});



describe("Common Item Attribute - Text & Multi Line Text (SW_ATR_56 – SW_ATR_66)", () => {
    let attribPage;
    let text;
    let mline;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            text = data["item text"];
            mline = data["item multiLineText"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
            attrib.clickItemAttributes();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Text (ATR_56–61) ────────────────────────────────────────────────────

    it("SW_ATR_56 - Add Common Item Attribute (Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(text.name);
        attribPage.selectType("Text");
        attribPage.typeDefaultValue(text.defaultValue);
        attribPage.typeMinLength(text.minLength);
        attribPage.typeMaxLength(text.maxLength);
        attribPage.clickPreventDuplicate();
        attribPage.assertPreventDuplicateChecked();
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(text.name);
        // Verify saved values
        attribPage.editAttribute(text.name);
        attribPage.assertMinLength(text.minLength);
        attribPage.assertMaxLength(text.maxLength);
        attribPage.assertDefaultValue(text.defaultValue);
        attribPage.assertPreventDuplicateChecked();
        attribPage.clickCancelBt();

    });

    it.skip("SW_ATR_57 - Verify Uniqueness (Text) for Common Item Attribute", { tags: ['@regression'] }, () => {
        // Requires navigating to the Add Item screen in Inventory with a pre-existing
        // duplicate value for "Asset Security Code". Out of scope for this config test suite.
    });

    it("SW_ATR_58 - Update Common Item Attribute Name (Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(text.name);
        attribPage.editItemName(text.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(text.updatedName);

    });

    it("SW_ATR_59 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(text.updatedName);
        attribPage.assertAttributeNameLoaded(text.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(text.updatedName, "Yes");

    });

    it("SW_ATR_60 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(text.updatedName);
        attribPage.assertAttributeNameLoaded(text.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(text.updatedName, "No");

    });

    it("SW_ATR_61 - Delete Common Item Attribute (Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(text.updatedName);
        attribPage.deleteAttribute(text.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(text.updatedName);

    });

    // ── Multi Line Text (ATR_62–66) ─────────────────────────────────────────

    it("SW_ATR_62 - Add Common Item Attribute (Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(mline.name);
        attribPage.selectType("MultiLineText");
        attribPage.typeMinLength(mline.minLength);
        attribPage.typeMaxLength(mline.maxLength);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(mline.name);
        // Verify saved values
        attribPage.editAttribute(mline.name);
        attribPage.assertMinLength(mline.minLength);
        attribPage.assertMaxLength(mline.maxLength);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_63 - Update Common Item Attribute Name (Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(mline.name);
        attribPage.editItemName(mline.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(mline.updatedName);

    });

    it("SW_ATR_64 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(mline.updatedName);
        attribPage.assertAttributeNameLoaded(mline.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(mline.updatedName, "Yes");

    });

    it("SW_ATR_65 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(mline.updatedName);
        attribPage.assertAttributeNameLoaded(mline.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(mline.updatedName, "No");

    });

    it("SW_ATR_66 - Delete Common Item Attribute (Multi Line Text)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(mline.updatedName);
        attribPage.deleteAttribute(mline.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(mline.updatedName);

    });
});




describe("Common Item Attribute - Number & Email (SW_ATR_67 – SW_ATR_77)", () => {
    let attribPage;
    let number;
    let email;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            number = data["item number"];
            email = data["item email"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
            attrib.clickItemAttributes();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Number (ATR_67–72) ──────────────────────────────────────────────────

    it("SW_ATR_67 - Negative Test: Max Value Limit (Number) for Item Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(number.name);
        attribPage.selectType("Number");
        attribPage.typeMaxValue(number.invalidMaxValue);
        attribPage.clickSaveBt();
        attribPage.assertValidationError(number.invalidMaxValueError);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_68 - Add Common Item Attribute (Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(number.name);
        attribPage.selectType("Number");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(number.name);

    });

    it("SW_ATR_69 - Update Common Item Attribute Name (Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(number.name);
        attribPage.editItemName(number.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(number.updatedName);

    });

    it("SW_ATR_70 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(number.updatedName);
        attribPage.assertAttributeNameLoaded(number.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(number.updatedName, "Yes");

    });

    it("SW_ATR_71 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(number.updatedName);
        attribPage.assertAttributeNameLoaded(number.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(number.updatedName, "No");

    });

    it("SW_ATR_72 - Delete Common Item Attribute (Number)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(number.updatedName);
        attribPage.deleteAttribute(number.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(number.updatedName);

    });

    // ── Email (ATR_73–77) ───────────────────────────────────────────────────

    it("SW_ATR_73 - Add Common Item Attribute (Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(email.name);
        attribPage.selectType("Email");
        attribPage.typeDefaultValue(email.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(email.name);
        // Verify default value
        attribPage.editAttribute(email.name);
        attribPage.assertDefaultValue(email.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_74 - Update Common Item Attribute Name (Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(email.name);
        attribPage.editItemName(email.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(email.updatedName);

    });

    it("SW_ATR_75 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(email.updatedName);
        attribPage.assertAttributeNameLoaded(email.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(email.updatedName, "Yes");

    });

    it("SW_ATR_76 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(email.updatedName);
        attribPage.assertAttributeNameLoaded(email.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(email.updatedName, "No");

    });

    it("SW_ATR_77 - Delete Common Item Attribute (Email)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(email.updatedName);
        attribPage.deleteAttribute(email.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(email.updatedName);

    });
});




describe("Common Item Attribute - URL & Decimal (SW_ATR_78 – SW_ATR_87)", () => {
    let attribPage;
    let url;
    let decimal;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            url = data["item url"];
            decimal = data["item decimal"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
            attrib.clickItemAttributes();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── URL (ATR_78–82) ─────────────────────────────────────────────────────

    it("SW_ATR_78 - Add Common Item Attribute (URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(url.name);
        attribPage.selectType("URL");
        attribPage.typeDefaultValue(url.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(url.name);
        // Verify default value
        attribPage.editAttribute(url.name);
        attribPage.assertDefaultValue(url.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_79 - Update Common Item Attribute Name (URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(url.name);
        attribPage.editItemName(url.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(url.updatedName);

    });

    it("SW_ATR_80 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(url.updatedName);
        attribPage.assertAttributeNameLoaded(url.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(url.updatedName, "Yes");

    });

    it("SW_ATR_81 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(url.updatedName);
        attribPage.assertAttributeNameLoaded(url.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(url.updatedName, "No");

    });

    it("SW_ATR_82 - Delete Common Item Attribute (URL)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(url.updatedName);
        attribPage.deleteAttribute(url.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(url.updatedName);

    });

    // ── Decimal (ATR_83–87) ─────────────────────────────────────────────────

    it("SW_ATR_83 - Add Common Item Attribute (Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(decimal.name);
        attribPage.selectType("Decimal");
        attribPage.typeDefaultValue(decimal.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(decimal.name);
        // Verify default value
        attribPage.editAttribute(decimal.name);
        attribPage.assertDefaultValue(decimal.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_84 - Update Common Item Attribute Name (Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(decimal.name);
        attribPage.editItemName(decimal.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(decimal.updatedName);

    });

    it("SW_ATR_85 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(decimal.updatedName);
        attribPage.assertAttributeNameLoaded(decimal.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(decimal.updatedName, "Yes");

    });

    it("SW_ATR_86 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(decimal.updatedName);
        attribPage.assertAttributeNameLoaded(decimal.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(decimal.updatedName, "No");

    });

    it("SW_ATR_87 - Delete Common Item Attribute (Decimal)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(decimal.updatedName);
        attribPage.deleteAttribute(decimal.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(decimal.updatedName);

    });
});



describe("Common Item Attribute - Amount & Percent (SW_ATR_88 – SW_ATR_97)", () => {
    let attribPage;
    let amount;
    let percent;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            amount = data["item amount"];
            percent = data["item percent"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
            attrib.clickItemAttributes();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    // ── Amount (ATR_88–92) ──────────────────────────────────────────────────

    it("SW_ATR_88 - Add Common Item Attribute (Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(amount.name);
        attribPage.selectType("Amount");
        attribPage.typeDefaultValue(amount.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(amount.name);
        // Verify default value
        attribPage.editAttribute(amount.name);
        attribPage.assertDefaultValue(amount.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_89 - Update Common Item Attribute Name (Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(amount.name);
        attribPage.editItemName(amount.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(amount.updatedName);

    });

    it("SW_ATR_90 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(amount.updatedName);
        attribPage.assertAttributeNameLoaded(amount.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(amount.updatedName, "Yes");

    });

    it("SW_ATR_91 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(amount.updatedName);
        attribPage.assertAttributeNameLoaded(amount.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(amount.updatedName, "No");

    });

    it("SW_ATR_92 - Delete Common Item Attribute (Amount)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(amount.updatedName);
        attribPage.deleteAttribute(amount.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(amount.updatedName);

    });

    // ── Percent (ATR_93–97) ─────────────────────────────────────────────────

    it("SW_ATR_93 - Add Common Item Attribute (Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(percent.name);
        attribPage.selectType("Percent");
        attribPage.typeDefaultValue(percent.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(percent.name);
        // Verify default value
        attribPage.editAttribute(percent.name);
        attribPage.assertDefaultValue(percent.defaultValue);
        attribPage.clickCancelBt();

    });

    it("SW_ATR_94 - Update Common Item Attribute Name (Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(percent.name);
        attribPage.editItemName(percent.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(percent.updatedName);

    });

    it("SW_ATR_95 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(percent.updatedName);
        attribPage.assertAttributeNameLoaded(percent.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(percent.updatedName, "Yes");

    });

    it("SW_ATR_96 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(percent.updatedName);
        attribPage.assertAttributeNameLoaded(percent.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(percent.updatedName, "No");

    });

    it("SW_ATR_97 - Delete Common Item Attribute (Percent)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(percent.updatedName);
        attribPage.deleteAttribute(percent.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(percent.updatedName);

    });
});




describe("Common Item Attribute - List (SW_ATR_98 – SW_ATR_105)", () => {
    let attribPage;
    let list;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            list = data["item list"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
            attrib.clickItemAttributes();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_98 - Add Common Item Attribute (List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(list.name);
        attribPage.selectType("List");
        attribPage.waitForListRowsToRender();
        attribPage.typeInListRows(list.options);
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(list.name);
        // Verify list options saved
        attribPage.editAttribute(list.name);
        list.options.forEach((opt, i) => {
            attribPage.assertListOption(i, opt);
        });
        attribPage.clickCancelBt();

    });

    it("SW_ATR_99 - Update Common Item Attribute Name (List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(list.name);
        attribPage.editItemName(list.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(list.updatedName);

    });

    it("SW_ATR_100 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(list.updatedName);
        attribPage.assertAttributeNameLoaded(list.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(list.updatedName, "Yes");

    });

    it("SW_ATR_101 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(list.updatedName);
        attribPage.assertAttributeNameLoaded(list.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(list.updatedName, "No");

    });

    // ATR_103-105 run BEFORE ATR_102 (delete) so the renamed attribute still exists

    it("SW_ATR_103 - Verify Add Row (List) for Common Item Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(list.updatedName);
        attribPage.clickAddRow();
        attribPage.typeListOption(list.options.length, "New Option Value");
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        // Verify new option persisted
        attribPage.editAttribute(list.updatedName);
        attribPage.assertListOption(list.options.length, "New Option Value");
        attribPage.clickCancelBt();

    });

    it("SW_ATR_104 - Verify Bulk Addition (List) for Common Item Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(list.updatedName);
        attribPage.clickAddBulkList();
        attribPage.typeBulkAddition("A, B, C");
        attribPage.confirmBulkAddition();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");

    });

    it("SW_ATR_105 - Verify Remove Option (List) for Common Item Attribute", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(list.updatedName);
        attribPage.deleteListOption(0);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");

    });

    it("SW_ATR_102 - Delete Common Item Attribute (List)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(list.updatedName);
        attribPage.deleteAttribute(list.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(list.updatedName);

    });
});



describe("Common Item Attribute - Boolean (SW_ATR_106 – SW_ATR_110)", () => {
    let attribPage;
    let boolean;

    before(() => {
        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            boolean = data["item boolean"];
            loginSession();
            const attrib = new AttribPage();
            attrib.clickAttribOption();
            attrib.clickItemAttributes();

        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });

    it("SW_ATR_106 - Add Common Item Attribute (Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(boolean.name);
        attribPage.selectType("Boolean");
        attribPage.clickCheckedByDefault();
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(boolean.name);

    });

    it("SW_ATR_107 - Update Common Item Attribute Name (Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(boolean.name);
        attribPage.editItemName(boolean.updatedName);
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertAttributeInList(boolean.updatedName);

    });

    it("SW_ATR_108 - Update Common Item Attribute (Enable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(boolean.updatedName);
        attribPage.assertAttributeNameLoaded(boolean.updatedName);
        attribPage.clickRequired();
        attribPage.assertRequiredChecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertRequiredInList(boolean.updatedName, "Yes");

    });

    it("SW_ATR_109 - Update Common Item Attribute (Disable Required)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.editAttribute(boolean.updatedName);
        attribPage.assertAttributeNameLoaded(boolean.updatedName);
        attribPage.disableRequired();
        attribPage.assertRequiredUnchecked();
        attribPage.clickUpdateBt();
        attribPage.assertToast("Attribute updated");
        attribPage.assertRequiredInList(boolean.updatedName, "No");

    });

    it("SW_ATR_110 - Delete Common Item Attribute (Boolean)", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.assertAttributeInList(boolean.updatedName);
        attribPage.deleteAttribute(boolean.updatedName);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(boolean.updatedName);

    });
});


// ─── Block 1: Validation & Negative Tests (SW_ATR_111 – SW_ATR_119) ──────────

describe("Attribute Validation & Negative Tests (SW_ATR_111 – SW_ATR_119)", () => {
    let attribPage;
    let validationData, booleanAttribute, commonNumber;

    before(() => {
        cy.fixture("Configuration/prodItemCatAttributeTestData").then((data) => {
            validationData = data.validation;

        });

        cy.fixture("Configuration/commonAttributeTestData").then((data) => {
            booleanAttribute = data["item boolean"];
            commonNumber = data["common number"];
        });
    });

    beforeEach(() => {
        loginSession();
        attribPage = new AttribPage();
    });


    it("SW_ATR_111 - Create Product Attribute with Empty Name", { tags: ["@regression"] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.selectType("Text");
        attribPage.clickSaveBt();
        attribPage.assertValidationError(validationData.emptyNameError);
    });

    it("SW_ATR_112 - Create Duplicate Common Product Attribute", { tags: ['@regression'] }, () => {

        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(commonNumber.name);
        attribPage.selectType("Number");
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(commonNumber.name);

        // Try to create the same attribute again (duplicate) — should fail
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(commonNumber.name);
        attribPage.selectType("Number");
        attribPage.clickSaveBt();
        attribPage.assertValidationError(validationData.duplicateNameError);
        attribPage.clickCancelBt();


        // Cleanup: Delete the created attribute to maintain test isolation
        attribPage.deleteAttribute(commonNumber.name);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(commonNumber.name);
    });

    it("SW_ATR_113 - Add Attribute of type Email with Invalid Email Format in Default Value.", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(validationData.invalidEmail.name);
        attribPage.selectType(validationData.invalidEmail.type);
        attribPage.typeDefaultValue(validationData.invalidEmail.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertNoToast("Attribute Created");
    });

    it("SW_ATR_114 - Add Attribute of type URL with Invalid URL Format in Default Value.", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(validationData.invalidUrl.name);
        attribPage.selectType(validationData.invalidUrl.type);
        attribPage.typeDefaultValue(validationData.invalidUrl.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertValidationError(validationData.invalidUrl.error);
    });

    it("SW_ATR_115 - Add Attribute of type Multi Line Text with Min Length > Max Length Validation", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(validationData.minMaxLength.name);
        attribPage.selectType(validationData.minMaxLength.type);
        attribPage.typeMinLength(validationData.minMaxLength.minLength);
        attribPage.typeMaxLength(validationData.minMaxLength.maxLength);
        attribPage.clickSaveBt();
        attribPage.assertValidationError(validationData.minMaxLength.error);
    });

    it("SW_ATR_116 - Add Attribute of type Decimal with Non-Numeric Decimal Default Value", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(validationData.invalidDecimal.name);
        attribPage.selectType(validationData.invalidDecimal.type);
        attribPage.typeDefaultValue(validationData.invalidDecimal.defaultValue);
        attribPage.clickSaveBt();
        attribPage.assertValidationError(validationData.invalidDecimal.error);
    });

    it("SW_ATR_117 - Update Attribute name as duplicate(Item)", { tags: ['@regression'] }, () => {

        // Navigate to Common Item Attributes tab
        attribPage.clickAttribOption();
        attribPage.clickItemAttributes();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(booleanAttribute.name);
        attribPage.selectType("Boolean");
        attribPage.clickCheckedByDefault();
        attribPage.clickSaveBt();
        attribPage.assertToast("Attribute Created");
        attribPage.assertAttributeInList(booleanAttribute.name);

        // Step 3: Try to create the same attribute again (duplicate)
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(booleanAttribute.name);
        attribPage.selectType("Boolean");
        attribPage.clickSaveBt();
        attribPage.assertValidationError(validationData.duplicateNameError);
        attribPage.clickCancelBt();

        // Cleanup: Delete the created attribute to maintain test isolation
        attribPage.deleteAttribute(booleanAttribute.name);
        attribPage.assertToast("Attribute Deleted");
        attribPage.assertAttributeNotInList(booleanAttribute.name);
    });

    // it.skip("SW_ATR_118 - Verify Delete Protection for Referenced Attributes", { tags: ['@regression'] }, () => {
    //     // Verify that a common attribute referenced by products cannot be deleted
    //     attribPage.clickAttribOption();
    //     // TODO: Requires a pre-existing referenced attribute in the system
    //     // Try deleting a common attribute that is in use — should be protected
    // });

    it("SW_ATR_119 - Create List Attribute with No Options", { tags: ['@regression'] }, () => {
        attribPage.clickAttribOption();
        attribPage.clickAddAttribute();
        attribPage.typeAttributeName(validationData.emptyList.name);
        attribPage.selectType("List");
        attribPage.waitForListRowsToRender();
        attribPage.deleteListOption(0);
        attribPage.clickSaveBt();
        attribPage.assertValidationError(validationData.emptyList.error);
    });
});


