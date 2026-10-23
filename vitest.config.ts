import { configDefaults, defineConfig } from "vitest/config";
import path from "path";
import { getTestSuiteSelection } from "./scripts/production/test-suite-groups.mjs";

const suiteSelection = getTestSuiteSelection(process.env, __dirname);

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup-tests.ts"],
    // Unit suites must never fall through a mock into a developer's .env DB.
    env: process.env.PRODUCTION_INTEGRATION_TEST === "1" ? {} : {
      DATABASE_URL: "postgresql://unit:unit@127.0.0.1:1/leesfield_unit_no_database",
    },
    testTimeout: 10000,
    include: suiteSelection.include ?? configDefaults.include,
    maxWorkers: process.env.PRODUCTION_INTEGRATION_TEST === "1" ? 1 : undefined,
    exclude: [
      ...configDefaults.exclude,
      "third_party/**",
      ".next*/**",
      "artifacts/**",
      "scripts/spaces/e2e/**",
      ...suiteSelection.exclude,
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
