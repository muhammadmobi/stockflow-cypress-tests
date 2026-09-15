// cypress/support/helpers/roleHelpers.js
// Shared helpers for role-privilege specs.
// Token acquisition is not here — use cy.login(email, password), the suite's
// single login command.

/**
 * Returns all 17 sanitized cost-field names (camelCase + snakeCase)
 * as a flat array. Sourced from the rolePrivilegesData fixture at call time.
 *
 * @param {object} roleData - parsed rolePrivilegesData.json fixture
 * @returns {string[]}
 */
export function allCostFields(roleData) {
  const { camelCase, snakeCase } = roleData.costFieldDecisionTable;
  return camelCase.concat(snakeCase);
}
