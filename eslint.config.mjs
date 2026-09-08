import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-perf-*/**",
    ".next-node-studio-e2e/**",
    "out/**",
    "build/**",
    "storybook-static/**",
    "tmp/**",
    "artifacts/**",
    ".generated/**",
    "third_party/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
