import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app in full mock mode: demo database (in memory),
 * no real emails, simulated AI. No accounts or keys are needed.
 */
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      MOCK_DB: "true",
      MOCK_DB_DIR: "memory",
      MOCK_EMAIL: "true",
      MOCK_AI: "true",
      MOCK_ADMIN_EMAIL: "admin@example.com",
      MOCK_ADMIN_PASSWORD: "e2e-password",
      CRON_SECRET: "e2e-cron-secret",
      INBOUND_WEBHOOK_SECRET: "e2e-inbound-secret",
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      APP_TIMEZONE: "Asia/Kolkata",
    },
  },
});
