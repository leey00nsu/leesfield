import { configDefaults, defineConfig } from "vitest/config";
import path from "path";
import { getTestSuiteSelection } from "./scripts/production/test-suite-groups.mjs";

const suiteSelection = getTestSuiteSelection(process.env, __dirname);

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup-tests.ts"],
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
