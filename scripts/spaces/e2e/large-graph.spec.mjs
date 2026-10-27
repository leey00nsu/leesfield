import { randomUUID } from "node:crypto";

import { test, expect } from "./spaces-test-fixtures.mjs";

import { NODE_LIMIT, EDGE_LIMIT, GROUP_LIMIT, maximumGraph } from "../maximum-graph-fixture.mjs";

function fixtureId(graph, label) { return `${graph.id}-${label}`; }

function byId(values) {
  return [...values].sort((a, b) => a.id.localeCompare(b.id));
}

function expectDocument(graph, expected) {
  expect(graph).toMatchObject({ schemaVersion: 3, minimumWriterVersion: 3, title: expected.title, writable: true, readOnlyReason: null });
  expect(graph.nodes).toHaveLength(NODE_LIMIT);
  expect(graph.edges).toHaveLength(EDGE_LIMIT);
  expect(graph.groups).toHaveLength(GROUP_LIMIT);
  expect(byId(graph.nodes)).toEqual(byId(expected.nodes));
  expect(byId(graph.edges)).toEqual(byId(expected.edges));
  expect(byId(graph.groups)).toEqual(byId(expected.groups));
}

function expectBoundedBody(body) {
  // A limit failure must come from canonical validation, not ingress size.
  expect(Buffer.byteLength(JSON.stringify(body)), "Boundary fixture must fit under 1 MiB").toBeLessThan(1024 * 1024);
}

async function readGraph(page, endpoint) {
  const response = await page.request.get(endpoint);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).graph;
}

test.describe("Spaces maximum canonical graph", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const target = new URL(testInfo.project.use.baseURL);
    expect(target.port, "Port 3000 is reserved for the user's server").not.toBe("3000");
    await page.context().addCookies([{ name: "locale", value: "en", url: target.origin }]);
    await page.addInitScript(() => {
      localStorage.setItem("leesfield.locale", "en");
      localStorage.setItem("node-studio.canvas-settings", JSON.stringify({ panMode: "space", zoomMode: "altScroll", selectionMode: "shiftDrag" }));
    });
    page.setDefaultTimeout(8_000);
    page.setDefaultNavigationTimeout(30_000);
  });

  test("500 nodes, 2000 edges and 500 groups survive UI autosave and reload @desktop", { tag: ["@spaces-limits", "@spaces-canvas"] }, async ({ page }) => {
    test.setTimeout(180_000);
    const created = await page.request.post("/api/generation-graphs", {
      data: { title: `Spaces maximum graph ${randomUUID()}` },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { graph } = await created.json();
    const endpoint = `/api/generation-graphs/${encodeURIComponent(graph.id)}`;
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    try {
      // Read immediately before PUT so the writer always uses the latest CAS.
      const current = await readGraph(page, endpoint);
      const fixture = maximumGraph(current);
      expectBoundedBody(fixture);
      const replaced = await page.request.put(endpoint, { data: fixture });
      expect(replaced.status(), await replaced.text()).toBe(200);
      const seeded = (await replaced.json()).graph;
      expect(seeded.version).toBe(current.version + 1);
      expectDocument(seeded, fixture);
      expectDocument(await readGraph(page, endpoint), fixture);

      // The editor route can take 37s to compile on a cold isolated server.
      await page.goto(`/spaces/${encodeURIComponent(graph.id)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.addStyleTag({ content: "nextjs-portal { pointer-events: none !important; }" });
      const canvas = page.locator("[data-space-canvas]");
      await expect(canvas).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("[data-space-workspace-header]").getByText(graph.title, { exact: true })).toBeVisible();
      await expect(canvas.locator(".react-flow__node")).toHaveCount(NODE_LIMIT, { timeout: 60_000 });
      await expect(canvas.locator(".react-flow__edge")).toHaveCount(EDGE_LIMIT, { timeout: 60_000 });
      await expect(canvas.locator("[data-space-group]")).toHaveCount(GROUP_LIMIT);

      // Focus the real display surface: TextBody selects the node on focus,
      // then the canvas handles an actual key through its normal command path.
      const movedId = fixtureId(graph, "prompt-137");
      const node = canvas.locator(`.react-flow__node[data-id="${movedId}"]`);
      const display = node.locator("[data-node-text-display]");
      await display.focus();
      await expect(display).toBeFocused();
      await expect(node).toHaveClass(/\bselected\b/);
      const before = await readGraph(page, endpoint);
      expectDocument(before, fixture);
      const original = before.nodes.find(value => value.id === movedId);
      const position = { x: original.position.x + 5, y: original.position.y };
      const savedResponse = page.waitForResponse(response =>
        response.request().method() === "PUT" && new URL(response.url()).pathname === endpoint,
      { timeout: 30_000 });
      await page.keyboard.press("ArrowRight");
      const autosave = await savedResponse;
      expect(autosave.status(), await autosave.text()).toBe(200);
      expect(autosave.request().postDataJSON()).toMatchObject({ schemaVersion: 3, expectedVersion: before.version });
      expect((await autosave.json()).graph.version).toBeGreaterThan(before.version);

      let saved;
      await expect.poll(async () => {
        saved = await readGraph(page, endpoint);
        return { versionAdvanced: saved.version > before.version, position: saved.nodes.find(value => value.id === movedId)?.position };
      }, { timeout: 30_000, intervals: [250, 500, 1_000], message: "Keyboard move must reach durable autosave at the maximum graph size" })
        .toEqual({ versionAdvanced: true, position });
      const expected = { ...fixture, nodes: fixture.nodes.map(value => value.id === movedId ? { ...value, position } : value) };
      expectDocument(saved, expected);
      expect(saved.outputBindings).toEqual(before.outputBindings);

      // Exact HTTP400/body and DB immutability for each overflow are owned
      // by generation-graph-diff-postgres.integration.test.ts.

      // Re-entry must use the durable graph rather than an in-memory draft.
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("[data-space-canvas] .react-flow__node")).toHaveCount(NODE_LIMIT, { timeout: 60_000 });
      await expect(page.locator("[data-space-canvas] [data-space-group]")).toHaveCount(GROUP_LIMIT);
      expectDocument(await readGraph(page, endpoint), expected);
      expect(pageErrors).toEqual([]);
    } finally {
      // Unmount first so a pending editor save cannot race with deletion.
      try {
        await page.goto("about:blank");
      } finally {
        const deleted = await page.request.delete(endpoint);
        expect(deleted.status(), await deleted.text()).toBe(204);
      }
    }
  });
});
