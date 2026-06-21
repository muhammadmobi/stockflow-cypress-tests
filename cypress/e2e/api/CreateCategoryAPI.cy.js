/**
 * Create Category API - Product-Only Category
 * ---------------------------------------------
 * Endpoint: POST /categories
 * Auth: Bearer JWT
 * Product-only means: allowItems=false, allowVariants=false, allowVariantItems=false
 *
 * Flow per test:
 *   1. Obtain auth token in before() via identity-server login.
 *   2. Send POST /categories request with product-only payload variants.
 *   3. Assert status code and response shape.
 *   4. Track created IDs and clean them up in after() via DELETE /categories/:id.
 */

describe('Create Category API - Product-Only Category', () => {
  let authToken;
  let baseUrl;
  const createdCategoryIds = [];

  const uniqueName = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const productOnlyPayload = (name, description) => ({
    name,
    ...(description !== undefined ? { description } : {}), 
    allowItems: false, 
    allowVariants: false,
    allowVariantItems: false,
  });

  const createCategory = (body, overrides = {}) => {
    return cy.request({
      method: 'POST',
      url: `${baseUrl}/categories`,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body,
      failOnStatusCode: false,
      ...overrides, 
    });
  };

  before(() => {
    baseUrl = Cypress.env('API_BASE_URL');
    const identityUrl = Cypress.env('IDENTITY_SERVER_BASE_URL');

    cy.request({
      method: 'POST',
      url: `${identityUrl}/auth/login`,
      body: {
        username: Cypress.env('email'),
        password: Cypress.env('pass'),
      },
    }).then((response) => {
      expect(response.status).to.equal(200);
      authToken = response.body.accessToken || response.body.token;
      expect(authToken).to.exist;
    });
  }); 

  after(() => {
    // Cleanup: delete every category created during the run so the suite is re-runnable.
    createdCategoryIds.forEach((id) => {
      cy.request({
        method: 'DELETE',
        url: `${baseUrl}/categories/${id}`,
        headers: { Authorization: `Bearer ${authToken}` },
        failOnStatusCode: false,
      });
    });
  });

  /**
   * SW_CAT_API_001 - Happy path create
   * Sends a fully valid product-only payload (unique name + description + all three flags false)
   * and asserts the API returns 200/201, echoes the name, and persists the flags as false.
   */
  it('SW_CAT_API_001 - creates a product-only category with valid payload', () => {
    const name = uniqueName('ProdOnly-Valid');
    createCategory(productOnlyPayload(name, 'Product-only test category')).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const data = res.body.data || res.body;
      expect(data.name).to.equal(name);
      expect(data.allowItems).to.equal(false);
      expect(data.allowVariants).to.equal(false);
      expect(data.allowVariantItems).to.equal(false);
      expect(data.id).to.exist;
      createdCategoryIds.push(data.id);
    });
  });

  /**
   * SW_CAT_API_002 - Duplicate name rejection
   * Creates one product-only category, then attempts to create a second with the exact same name.
   * Expects the second call to be rejected with 409 Conflict and an error message mentioning "unique".
   */
  it('SW_CAT_API_002 - rejects duplicate category name with 409', () => {
    const name = uniqueName('ProdOnly-Dup');
    createCategory(productOnlyPayload(name)).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const data = res.body.data || res.body;
      createdCategoryIds.push(data.id);

      createCategory(productOnlyPayload(name)).then((dup) => {
        expect(dup.status).to.equal(409);
        expect(JSON.stringify(dup.body).toLowerCase()).to.include('unique');
      });
    });
  });


     /**
   * SW_CAT_API_003 - Missing required "name"
   * Sends a payload without the required `name` field and expects Joi validation to reject it with 400.
   */
  it('SW_CAT_API_003 - rejects missing required "name" with 400', () => {
    createCategory({
      allowItems: false,
      allowVariants: false,
      allowVariantItems: false,
    }).then((res) => {
      expect(res.status).to.equal(400);
    });
  });

  /**
   * SW_CAT_API_004 - Empty string name
   * Sends a payload where `name` is present but empty ("") to confirm the schema rejects blank strings with 400.
   */
  it('SW_CAT_API_004 - rejects empty string name with 400', () => {
    createCategory(productOnlyPayload('')).then((res) => {
      expect(res.status).to.equal(400);
    });
  });

  /**
   * SW_CAT_API_005 - Non-boolean flag type
   * Sends a number (123) for `allowItems` instead of a boolean. Joi cannot coerce
   * a number to boolean, so the API must reject the request with 400.
   * (Joi DOES coerce the strings "true"/"false", so those are not valid negatives.)
   */
  it('SW_CAT_API_005 - rejects non-boolean allowItems with 400', () => {
    createCategory({
      name: uniqueName('ProdOnly-BadBool'),
      allowItems: 123,
      allowVariants: false,
      allowVariantItems: false,
    }).then((res) => {
      expect(res.status).to.equal(400);
    });
  });

  /**
   * SW_CAT_API_006 - Unauthenticated request
   * Calls POST /categories WITHOUT the Authorization header and expects the global AuthGuard to reject it with 401.
   */
  it('SW_CAT_API_006 - rejects unauthenticated request with 401', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/categories`,
      headers: { 'Content-Type': 'application/json' },
      body: productOnlyPayload(uniqueName('ProdOnly-NoAuth')),
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(401);
    });
  });

  /**
   * SW_CAT_API_007 - Create "Mobile" then update name with "updated" postfix
   * Creates a product-only category with fixed name "Mobile", then PATCHes it so the name
   * becomes "Mobile updated". Verifies both the PATCH response and a follow-up GET reflect
   * the new name while keeping the product-only flags intact.
   * Pre-cleanup: deletes any existing "Mobile" / "Mobile updated" categories so the test is re-runnable.
   */
  it('SW_CAT_API_007 - creates "Mobile" category and updates its name with "updated" postfix', () => {
    const originalName = 'Mobile';
    const updatedName = 'Mobile updated';

    const deleteByName = (targetName) => {
      cy.request({
        method: 'GET',
        url: `${baseUrl}/categories`,
        qs: { name: targetName, page: 1, page_size: 50 },
        headers: { Authorization: `Bearer ${authToken}` },
        failOnStatusCode: false,
      }).then((listRes) => {
        // Categories list response can be one of:
        //   { data: { items: [...] } }   (PaginatedList)
        //   { data: { results: [...] } }
        //   { data: [...] }
        //   { items: [...] } / [...]
        const body = listRes.body || {};
        const candidates = [
          body?.data?.items,
          body?.data?.results,
          body?.data?.data,
          body?.data,
          body?.items,
          body?.results,
          body,
        ];
        const list = candidates.find((c) => Array.isArray(c)) || [];

        list
          .filter((c) => c && c.name === targetName)
          .forEach((c) => {
            cy.request({
              method: 'DELETE',
              url: `${baseUrl}/categories/${c.id}`,
              headers: { Authorization: `Bearer ${authToken}` },
              failOnStatusCode: false,
            });
          });
      });
    };

    deleteByName(originalName);
    deleteByName(updatedName);

    createCategory(productOnlyPayload(originalName)).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      const created = res.body.data || res.body;
      expect(created.name).to.equal(originalName);
      expect(created.id).to.exist;
      createdCategoryIds.push(created.id);

      cy.request({
        method: 'PATCH',
        url: `${baseUrl}/categories/${created.id}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: {
          name: updatedName,
          allowItems: false,
          allowVariants: false,
          allowVariantItems: false,
        },
        failOnStatusCode: false,
      }).then((patchRes) => {
        expect(patchRes.status).to.be.oneOf([200, 201]);
        const updated = patchRes.body.data || patchRes.body;
        expect(updated.name).to.equal(updatedName);
        expect(updated.allowItems).to.equal(false);
        expect(updated.allowVariants).to.equal(false);
        expect(updated.allowVariantItems).to.equal(false);

        cy.request({
          method: 'GET',
          url: `${baseUrl}/categories/${created.id}`,
          headers: { Authorization: `Bearer ${authToken}` },
        }).then((getRes) => {
          expect(getRes.status).to.equal(200);
          const fetched = getRes.body.data || getRes.body;
          expect(fetched.name).to.equal(updatedName);
        });
      });
    });
  });

  /**
   * SW_CAT_API_008 - Round-trip GET after create
   * Creates a product-only category, then issues GET /categories/:id with the returned id and
   * verifies the persisted record matches the posted name and has all three flags stored as false.
   */
  it('SW_CAT_API_008 - created product-only category is retrievable via GET /categories/:id', () => {
    const name = uniqueName('ProdOnly-Get');
    createCategory(productOnlyPayload(name)).then((res) => {
      const data = res.body.data || res.body;
      createdCategoryIds.push(data.id);

      cy.request({
        method: 'GET',
        url: `${baseUrl}/categories/${data.id}`,
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((getRes) => {
        expect(getRes.status).to.equal(200);
        const fetched = getRes.body.data || getRes.body;
        expect(fetched.name).to.equal(name);
        expect(fetched.allowItems).to.equal(false);
        expect(fetched.allowVariants).to.equal(false);
        expect(fetched.allowVariantItems).to.equal(false);
      });
    });
  });
});
