const { defineConfig } = require("cypress");
const { buildConfig } = require("./cypress.base.config");

// Stage environment.
// Run with: npx cypress open --config-file cypress.stage.config.js
//           npx cypress run  --config-file cypress.stage.config.js
module.exports = defineConfig(
  buildConfig({
    baseUrl: "https://stage.example.com/",
    env: {
      API_BASE_URL: "https://api.stage.example.com", // Base URL for API requests, used in tests that interact with the backend
      IDENTITY_SERVER_BASE_URL: "https://identity.stage.example.com", // Base URL for identity server, used for authentication-related tests
    },
  })
);
