import { randomUUID } from "node:crypto";
import { sealData } from "iron-session";
import { test, expect } from "@playwright/test";

test("signed session edits Prompt, confirms discard, and reloads durable settings", async ({ page, context, baseURL }) => {
  const errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  // Fail closed: no provider, storage, font CDN or other third-party request
  // is fulfilled with fake success. Only this run's origin is reachable.
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
    external.push("unexpected external request");
    return route.abort("blockedbyclient");
  });
  const cookie = await sealData({ isLoggedIn: true, adminEmail: "core-" + randomUUID() + "@localhost" }, { password: process.env.SESSION_PASSWORD });
  await context.addCookies([
    { name: "leesfield_session", value: cookie, url: baseURL, secure: true, httpOnly: true, sameSite: "Lax" },
    { name: "locale", value: "en", url: baseURL, secure: true },
  ]);
  const created = await page.request.post("/api/generation-graphs", { data: { title: "Production core " + randomUUID() } });
  expect(created.status()).toBe(201);
  const graph = (await created.json()).graph;
  const path = "/api/generation-graphs/" + graph.id;
  const nodeId = randomUUID();
  try {
    const prepared = await page.request.put(path, { data: {
      schemaVersion: 3, expectedVersion: graph.version, title: graph.title, groups: [], edges: [],
      nodes: [{ id: nodeId, kind: "input.prompt", configVersion: 1, position: { x: 0, y: 0 }, config: { text: "Original" }, selectedOutputAssetId: null }],
    } });
    expect(prepared.ok()).toBeTruthy();
    await page.goto("/spaces/" + graph.id, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-space-canvas]")).toBeVisible();
    if (process.env.SPACES_CORE_MODE === "development") await page.addStyleTag({ content: "nextjs-portal { pointer-events: none !important; }" });
    await page.getByRole("button", { name: "Space settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Space Settings", exact: true });
    const toggle = settings.getByRole("switch", { name: "Show model settings on nodes", exact: true });
    await expect(toggle).toBeEnabled();
    const wasChecked = await toggle.isChecked();
    await toggle.click();
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect(settings).toBeHidden();
    const header = page.locator('[data-space-node-header="' + nodeId + '"]');
    await header.click();
    const expand = header.getByTitle("Expand editor");
    await expand.click();
    const editor = page.getByRole("dialog", { name: "Edit Prompt", exact: true });
    const text = editor.getByRole("textbox", { name: "Prompt", exact: true });
    await text.fill("Saved from real browser");
    await editor.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect.poll(async () => {
      const response = await page.request.get(path); expect(response.ok()).toBeTruthy();
      return (await response.json()).graph.nodes[0].config.text;
    }).toBe("Saved from real browser");
    await expand.click(); await text.fill("Discard this draft");
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("alertdialog", { name: "Unsaved prompt changes", exact: true });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(editor).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-space-node="input.prompt"] textarea')).toHaveValue("Saved from real browser");
    await page.getByRole("button", { name: "Space settings", exact: true }).click();
    await expect(toggle).toBeEnabled();
    if (wasChecked) await expect(toggle).not.toBeChecked(); else await expect(toggle).toBeChecked();
    expect(errors).toEqual([]); expect(external).toEqual([]);
  } finally {
    expect((await page.request.delete(path)).status()).toBe(204);
    await context.unrouteAll({ behavior: "wait" });
  }
});
