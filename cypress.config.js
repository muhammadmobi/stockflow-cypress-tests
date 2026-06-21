const { defineConfig } = require("cypress");
const { buildConfig } = require("./cypress.base.config");

// QA environment (default).
// Run with: npx cypress open  |  npx cypress run
module.exports = defineConfig(
  buildConfig({
    baseUrl: "https://qa.example.com/",
    env: {
      API_BASE_URL: "https://api.qa.example.com", // Base URL for API requests, used in tests that interact with the backend
      IDENTITY_SERVER_BASE_URL: "https://identity.qa.example.com", // Base URL for identity server, used for authentication-related tests
    },
  })
);
