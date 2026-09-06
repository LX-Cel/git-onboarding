const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/electron.spec.cjs",
  timeout: 90000,
  workers: 1,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
