import { randomUUID } from "node:crypto";
import { sealData } from "iron-session";
import { test, expect } from "./spaces-test-fixtures.mjs";

test.beforeEach(async ({ context }, testInfo) => {
  await context.addCookies([{ name: "locale", value: "en", url: testInfo.project.use.baseURL }]);
});

async function createGraph(page, title) {
  const response = await page.request.post("/api/generation-graphs", { data: { title } });
  expect(response.status()).toBe(201);
  return (await response.json()).graph;
}

test("real login redirects back to a protected Space and survives reload", { tag: ["@desktop", "@spaces-canvas"] }, async ({ page, context }) => {
  expect(await context.cookies()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "leesfield_session" })]));
  await page.goto("/spaces");
  await expect(page).toHaveURL(/\/login$/);
  // ProtectedLayout currently redirects to /login without preserving origin.
  // Exercise the supported returnTo entry without changing product behavior.
  await page.goto("/login?returnTo=%2Fspaces");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/spaces");
  await page.getByLabel("Username or Email", { exact: true }).fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(process.env.SPACES_E2E_LOGIN_PASSWORD);
  await page.getByRole("button", { name: /^(Sign in|Log in|Login)$/i }).click();
  await expect(page).toHaveURL(/\/spaces$/);
  expect(await context.cookies()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "leesfield_session", httpOnly: true })]));
  const graph = await createGraph(page, "Authenticated Space");
  try {
    await page.goto("/spaces/" + graph.id);
    await expect(page.locator("[data-space-canvas]")).toBeVisible();
    await page.reload();
    await expect(page.locator("[data-space-canvas]")).toBeVisible();
    expect((await page.request.get("/api/generation-graphs/" + graph.id)).status()).toBe(200);
  } finally { expect((await page.request.delete("/api/generation-graphs/" + graph.id)).status()).toBe(204); }
});

test("another owner cannot read or modify a protected Space", { tag: ["@desktop", "@spaces-canvas"] }, async ({ browser, page }, testInfo) => {
  const graph = await createGraph(page, "Owner-private-" + randomUUID());
  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: { Origin: testInfo.project.use.baseURL } });
  try {
    await other.addCookies([{ name: "leesfield_session", value: await sealData({ isLoggedIn: true, adminEmail: "another-" + randomUUID() + "@localhost" },
      { password: process.env.SESSION_PASSWORD }), url: testInfo.project.use.baseURL, httpOnly: true, sameSite: "Lax" }]);
    const endpoint = "/api/generation-graphs/" + graph.id;
    expect((await other.request.get(endpoint)).status()).toBe(404);
    expect((await other.request.put(endpoint, { data: { schemaVersion: 3, expectedVersion: graph.version,
      title: "Unauthorized update", nodes: [], edges: [], groups: [] } })).status()).toBe(404);
    expect((await other.request.delete(endpoint)).status()).toBe(404);
    const stranger = await other.newPage();
    const response = await stranger.goto("/spaces/" + graph.id);
    expect(response.status()).toBe(200);
    await expect(stranger.getByRole("alert")).toBeVisible();
    await expect(stranger.getByText(graph.title, { exact: true })).toHaveCount(0);
    await expect(stranger.locator("[data-space-canvas]")).toHaveCount(0);
    expect((await (await page.request.get(endpoint)).json()).graph).toMatchObject({ title: graph.title, version: graph.version });
  } finally { await other.close(); expect((await page.request.delete("/api/generation-graphs/" + graph.id)).status()).toBe(204); }
});

test("Assistant runs through app admission and shared queue then restores its result", { tag: ["@desktop", "@spaces-assistant", "@spaces-generation"] }, async ({ page }) => {
  const graph = await createGraph(page, "Real Assistant queue"), nodeId = randomUUID();
  const prompt = "Report the queue boundary", output = "Assistant result: " + prompt;
  try {
    const response = await page.request.put("/api/generation-graphs/" + graph.id, { data: { schemaVersion: 3, expectedVersion: graph.version,
      title: graph.title, groups: [], edges: [], nodes: [{ id: nodeId, kind: "generate.assistant", configVersion: 1,
        position: { x: 0, y: 0 }, selectedOutputAssetId: null, config: { prompt, modelKey: "spaces-e2e-llm-a" } }] } });
    expect(response.status()).toBe(200);
    await page.goto("/spaces/" + graph.id);
    const body = page.locator('[data-space-node-id="' + nodeId + '"]');
    await expect(body).toBeVisible();
    const header = body.locator("[data-space-node-header]");
    await header.hover();
    const box = await header.boundingBox();
    await page.mouse.click(box.x + 1, box.y + 1);
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/nodes/" + nodeId + "/executions"));
    await header.locator('[data-canvas-action="run"]').click();
    const receipt = await submitted;
    expect(receipt.status()).toBe(202);
    const executionId = (await receipt.json()).execution.executionId;
    await expect.poll(async () => {
      const history = await page.request.get("/api/generation-graphs/" + graph.id + "/nodes/" + nodeId + "/executions");
      expect(history.status()).toBe(200);
      return (await history.json()).executions.find(item => item.executionId === executionId);
    }).toMatchObject({ executionId, executionKind: "assistant", status: "completed", outputText: output, modelKey: "spaces-e2e-llm-a" });
    await expect(body.getByRole("tabpanel", { name: "Result", exact: true })).toContainText(output);
    await page.reload();
    await expect(body.getByRole("tabpanel", { name: "Result", exact: true })).toContainText(output);
  } finally { await page.goto("about:blank"); expect((await page.request.delete("/api/generation-graphs/" + graph.id)).status()).toBe(204); }
});
