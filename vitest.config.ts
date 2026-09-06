import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup-tests.ts"],
    testTimeout: 10000,
    exclude: [
      ...configDefaults.exclude,
      "third_party/**",
      ".generated/**",
      ".tmp-node-banana-*/**",
      "artifacts/**",
      "scripts/node-banana/e2e/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@node-banana-runtime": path.resolve(
        __dirname,
        "./.generated/node-banana-runtime/src/leesfield",
      ),
    },
  },
});
