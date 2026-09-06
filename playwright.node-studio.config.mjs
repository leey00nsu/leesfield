import { defineConfig, devices } from "@playwright/test";

const startServer = process.env.E2E_START_SERVER === "1";
const baseURL = process.env.NODE_STUDIO_BASE_URL ?? (startServer ? "http://127.0.0.1:3100" : "http://127.0.0.1:3000");

export default defineConfig({
  testDir: "./scripts/node-banana/e2e",
  outputDir: "./artifacts/node-banana-e2e/test-results",
  snapshotDir: "./artifacts/node-banana-e2e/snapshots",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "./artifacts/node-banana-e2e/results.json" }],
  ],
  use: {
    baseURL,
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false },
    },
  ],
  webServer: startServer
    ? {
        command: `pnpm dev --port ${new URL(baseURL).port || "3100"}`,
        // Wait for the actual list API, not a legacy redirect which can become
        // ready before Turbopack compiles the first lifecycle request.
        url: `${baseURL}/api/generation-graphs`,
        reuseExistingServer: false,
        timeout: 120_000,
        // Generation providers and the background-removal Space are hosted
        // services. Keep Chromium coverage deterministic while still sending
        // the real node-header submission through the app/API/worker stack.
        env: {
          ...process.env,
          NODE_STUDIO_E2E_DIST_DIR: ".next-node-studio-e2e",
          NODE_STUDIO_E2E_MOCK_GENERATION: process.env.NODE_STUDIO_E2E_MOCK_GENERATION ?? "1",
          NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL: process.env.NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL ?? "1",
          NEXT_PUBLIC_NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL: process.env.NEXT_PUBLIC_NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL ?? "1",
        },
      }
    : undefined,
});
