import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. They run against a fresh local database:
 *   npm run test:e2e
 * (the webServer below resets + seeds the test DB, then starts the app on port 3100)
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined } } }],
  webServer: {
    command: "DOTENV_PATH=.env.test npx tsx scripts/migrate.ts --reset && DOTENV_PATH=.env.test npx tsx scripts/seed.ts && npx dotenv -e .env.test -- next dev -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
