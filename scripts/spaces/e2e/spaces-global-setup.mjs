import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect, request } from "@playwright/test";
import { sealData } from "iron-session";
import { createHmrDiagnostics } from "../hmr-diagnostics.mjs";

async function prepareEditor(config) {
  const base = new URL(config.projects[0].use.baseURL);
  if (!["localhost", "127.0.0.1"].includes(base.hostname) || base.port === "3000") throw new Error("Editor readiness requires the isolated server");
  const cookie = await sealData({ isLoggedIn: true, adminEmail: `spaces-readiness-${randomUUID()}@localhost` }, { password: process.env.SESSION_PASSWORD });
  const api = await request.newContext({ baseURL: base.origin, extraHTTPHeaders: { Origin: base.origin, Cookie: "leesfield_session=" + cookie } });
  const diagnostics = createHmrDiagnostics(), started = Date.now();
  let browser, graphId, ready = false;
  try {
    const created = await api.post("/api/generation-graphs", { data: { title: "Editor readiness" } });
    expect(created.status()).toBe(201);
    graphId = (await created.json()).graph.id;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext();
    context.setDefaultTimeout(8_000);
    await context.addCookies([
      { name: "leesfield_session", value: cookie, url: base.origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: base.origin },
    ]);
    const page = await context.newPage();
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) diagnostics.navigation(); });
    page.on("websocket", socket => socket.on("framereceived", ({ payload }) => diagnostics.message(payload)));
    // API readiness does not compile the lazy editor. Finish that cold startup
    // before parallel interaction/maximum-graph cases begin their own budgets.
    await page.goto(new URL(`/spaces/${graphId}`, base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-space-canvas]")).toBeVisible({ timeout: 60_000 });
    await page.addStyleTag({ content: "nextjs-portal { pointer-events: none !important; }" });
    await page.getByRole("button", { name: "Space settings", exact: true }).click();
    await expect(page.getByRole("switch", { name: "Show model settings on nodes", exact: true })).toBeEnabled({ timeout: 8_000 });
    ready = true;
    process.stdout.write(`Isolated editor ready in ${Date.now() - started}ms\n`);
  } finally {
    try {
      await browser?.close();
      if (graphId) expect((await api.delete(`/api/generation-graphs/${graphId}`)).status()).toBe(204);
    } finally {
      await api.dispose();
      const output = process.env.SPACES_E2E_OUTPUT_DIR;
      if (output) await writeFile(path.join(output, "readiness.json"), JSON.stringify({ ready, durationMs: Date.now() - started, hmr: diagnostics.snapshot() }, null, 2));
    }
  }
}

export default async function setup(config) {
  // FullConfig includes CLI overrides, so direct Playwright runs also obey the
  // same concurrency limit as SPACES_E2E_WORKERS in the config.
  if (!Number.isInteger(config.workers) || config.workers < 1 || config.workers > 4) {
    throw new Error("Spaces E2E workers must be between 1 and 4");
  }

  const suppliedDirectory = process.env.SPACES_E2E_LOCK_DIR;
  if (suppliedDirectory) {
    // The isolated wrapper owns this directory and its cleanup.
    await mkdir(suppliedDirectory, { recursive: true });
    if (process.env.SPACES_E2E_ISOLATED === "1") await prepareEditor(config);
    return;
  }

  const directory = await mkdtemp(path.join(tmpdir(), "leesfield-spaces-e2e-locks-"));
  process.env.SPACES_E2E_LOCK_DIR = directory;
  return async () => {
    await rm(directory, { recursive: true, force: true });
    if (suppliedDirectory === undefined) delete process.env.SPACES_E2E_LOCK_DIR;
    else process.env.SPACES_E2E_LOCK_DIR = suppliedDirectory;
  };
}
