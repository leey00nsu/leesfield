import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { sealData } from "iron-session";
import { createHmrDiagnostics } from "../hmr-diagnostics.mjs";
import { routeStorage } from "./storage-route.mjs";

const nativeClipboard = /canvas clipboard,|Assistant shows references,/;
// Three cases share the native clipboard. Allow two earlier cases to use their
// execution and teardown budgets (Assistant: 160s, canvas: 120s) before failing.
const clipboardWaitTimeout = 600_000;
const clipboardCleanupTimeout = 10_000;

export const test = base.extend({
  page: async ({ page }, run, testInfo) => {
    const diagnostics = createHmrDiagnostics();
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) diagnostics.navigation(); });
    page.on("websocket", socket => socket.on("framereceived", ({ payload }) => diagnostics.message(payload)));
    try { await run(page); }
    finally {
      // page's base fixture closes before context's teardown. Drain while the
      // page and its server-side request interception are both still alive.
      await page.context().unrouteAll({ behavior: "wait" });
    }
    const { connections, navigations, reloads, restarts } = diagnostics.snapshot();
    testInfo.annotations.push({ type: "hmr-counters", description: JSON.stringify({ connections, navigations, reloads, restarts }) });
    if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach("hmr-diagnostics", {
      body: JSON.stringify(diagnostics.snapshot(), null, 2), contentType: "application/json",
    });
  },
  // Every test gets a normal signed session, so settings, list results and
  // owner-wide admission limits cannot leak between parallel browser contexts.
  context: async ({ context }, run, testInfo) => {
    await routeStorage(context);
    const password = process.env.SESSION_PASSWORD;
    if (!password || password.length < 32) throw new Error("Spaces E2E needs the isolated server's SESSION_PASSWORD");
    const adminEmail = `spaces-e2e-${testInfo.parallelIndex}-${randomUUID()}@localhost`;
    testInfo.annotations.push({ type: "isolated-owner", description: adminEmail });
    if (!testInfo.title.startsWith("real login redirects")) {
      await context.addCookies([{ name: "leesfield_session", value: await sealData({ isLoggedIn: true, adminEmail }, { password }),
        url: testInfo.project.use.baseURL, httpOnly: true, sameSite: "Lax" }]);
    }
    try { await run(context); }
    finally {
      // A video reload can leave a file route in flight at test completion.
      // Finish those handlers before Playwright disposes the request context.
      await context.unrouteAll({ behavior: "wait" });
    }
  },
  // An explicit fixture timeout excludes acquisition/cleanup from the existing
  // test execution timeout; time spent in run() does not consume this budget.
  nativeClipboard: [async ({}, run, testInfo) => {
    if (!nativeClipboard.test(testInfo.title)) return run();
    const directory = process.env.SPACES_E2E_LOCK_DIR;
    if (!directory) throw new Error("Spaces E2E global setup did not initialize the clipboard lock directory");
    const lock = path.join(directory, "native-clipboard");
    const queuedAt = Date.now();
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
      testInfo.annotations.push({ type: "native-clipboard-lease", description: JSON.stringify({ acquiredAt, releasedAt: Date.now(), waitMs: acquiredAt - queuedAt }) });
      await rm(lock, { recursive: true, force: true });
    }
  }, { auto: true, timeout: clipboardWaitTimeout + clipboardCleanupTimeout }],
});

export { expect };
