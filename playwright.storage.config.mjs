import { defineConfig } from "@playwright/test";
import spaces from "./playwright.spaces.config.mjs";

if (process.env.SPACES_E2E_LOCAL_STORAGE) throw new Error("Real storage contracts cannot use the local transport");
export default defineConfig({
  ...spaces,
  testMatch: "storage-contract.spec.mjs",
  globalSetup: undefined,
  workers: 1,
  timeout: 120_000,
  projects: [{ name: "storage-contract", use: spaces.projects[0].use }],
});
