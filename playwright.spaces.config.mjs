import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { resolveSpacesWorkerBudget } from "./scripts/spaces/worker-budget.mjs";

import { tierGrep } from "./scripts/spaces/e2e-tiers.mjs";

const tier = process.env.SPACES_E2E_TIER ?? "all";
const startServer = process.env.E2E_START_SERVER === "1";
const baseURL = process.env.SPACES_BASE_URL ?? "http://127.0.0.1:3100";
const output = process.env.SPACES_E2E_OUTPUT_DIR ?? "./artifacts/spaces-e2e";
if (new URL(baseURL).port === "3000") {
  throw new Error("Spaces E2E requires an isolated server; port 3000 belongs to the user's development session.");
}
if (startServer) process.env.NODE_STUDIO_E2E_MOCK_GENERATION = "1";
const { workers } = await resolveSpacesWorkerBudget(process.env);
if (!Number.isInteger(workers) || workers < 1 || workers > 4) throw new Error("SPACES_E2E_WORKERS must be between 1 and 4");

export default defineConfig({
  testDir: "./scripts/spaces/e2e",
  testMatch: ["spaces.spec.mjs", "large-graph.spec.mjs", "core-boundaries.spec.mjs"],
  globalSetup: "./scripts/spaces/e2e/spaces-global-setup.mjs",
  outputDir: join(output, "test-results"),
  snapshotDir: "./artifacts/spaces-e2e/snapshots",
  fullyParallel: true,
  workers,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: join(output, "results.json") }],
  ],
  use: {
    baseURL,
    // APIRequestContext mutations use the same origin as real browser fetches.
    extraHTTPHeaders: { Origin: new URL(baseURL).origin },
    channel: "chrome",
    headless: process.env.E2E_HEADFUL !== "1",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "desktop",
      grep: tierGrep(tier, "desktop"),
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-390",
      grep: tierGrep(tier, "mobile-390"),
      // Preserve the desktop integration scope without runtime test skips.
      grepInvert: /@desktop/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false },
    },
  ],
  webServer: startServer
    ? {
        command: `pnpm dev --port ${new URL(baseURL).port || "3100"}`,
        // Wait for the actual list API, not a legacy redirect which can become
        // ready before Turbopack compiles the first lifecycle request.
        url: `${baseURL}/api/health/live`,
        reuseExistingServer: false,
        timeout: 120_000,
        // Keep generation deterministic while still sending
        // the real node-header submission through the app/API/worker stack.
        env: {
          ...process.env,
          DEV_AUTH_BYPASS: "false",
          NODE_STUDIO_E2E_DIST_DIR: ".next-spaces-e2e",
          NODE_STUDIO_E2E_MOCK_GENERATION: "1",
        },
      }
    : undefined,
});
