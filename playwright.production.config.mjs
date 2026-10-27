import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

const baseURL = process.env.SPACES_BASE_URL;
const url = new URL(baseURL);
if (url.protocol !== "https:" || url.hostname !== "localhost" || url.port === "3000"
  || process.env.SPACES_E2E_ISOLATED !== "1" || !process.env.SPACES_E2E_OUTPUT_DIR) {
  throw new Error("Core smoke requires its owned isolated HTTPS runner");
}
export default defineConfig({
  testDir: "./scripts/spaces/e2e",
  testMatch: "production-smoke.spec.mjs",
  outputDir: join(process.env.SPACES_E2E_OUTPUT_DIR, "test-results"),
  reporter: [["list"], ["json", { outputFile: join(process.env.SPACES_E2E_OUTPUT_DIR, "results.json") }]],
  workers: 1, retries: 0, forbidOnly: true, timeout: 120_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices["Desktop Chrome"], baseURL, channel: "chrome", headless: true,
    extraHTTPHeaders: { Origin: url.origin },
    ignoreHTTPSErrors: true, trace: "retain-on-failure", screenshot: "only-on-failure",
    actionTimeout: 8_000, navigationTimeout: 30_000,
  },
});
