import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { sealData } from "iron-session";

const nativeClipboard = /canvas clipboard,|Assistant shows references,/;
// Three cases share the native clipboard. Allow two earlier cases to use their
// execution and teardown budgets (Assistant: 160s, canvas: 120s) before failing.
const clipboardWaitTimeout = 600_000;
const clipboardCleanupTimeout = 10_000;

export const test = base.extend({
  // Every test gets a normal signed session, so settings, list results and
  // owner-wide admission limits cannot leak between parallel browser contexts.
  context: async ({ context }, run, testInfo) => {
    const password = process.env.SESSION_PASSWORD;
    if (!password || password.length < 32) throw new Error("Spaces E2E needs the isolated server's SESSION_PASSWORD");
    const adminEmail = `spaces-e2e-${testInfo.parallelIndex}-${randomUUID()}@localhost`;
    testInfo.annotations.push({ type: "isolated-owner", description: adminEmail });
    await context.addCookies([{ name: "leesfield_session", value: await sealData({ isLoggedIn: true, adminEmail }, { password }),
      url: testInfo.project.use.baseURL, httpOnly: true, sameSite: "Lax" }]);
    await run(context);
  },
  // An explicit fixture timeout excludes acquisition/cleanup from the existing
  // test execution timeout; time spent in run() does not consume this budget.
  nativeClipboard: [async ({}, run, testInfo) => {
    if (!nativeClipboard.test(testInfo.title)) return run();
    const directory = process.env.SPACES_E2E_LOCK_DIR;
    if (!directory) throw new Error("Spaces E2E global setup did not initialize the clipboard lock directory");
    const lock = path.join(directory, "native-clipboard");
    const deadline = Date.now() + clipboardWaitTimeout;
    while (true) {
      try { await mkdir(lock); break; }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new Error("Native clipboard was not released by the previous test");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    const acquiredAt = Date.now();
    try { await run(); }
    finally {
      testInfo.annotations.push({ type: "native-clipboard-lease", description: JSON.stringify({ acquiredAt, releasedAt: Date.now() }) });
      await rm(lock, { recursive: true, force: true });
    }
  }, { auto: true, timeout: clipboardWaitTimeout + clipboardCleanupTimeout }],
});

export { expect };
