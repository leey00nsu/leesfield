// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { collectSpacesTests } from "./e2e-groups.mjs";
import { selectTier, tierGrep, validateTierCatalog } from "./e2e-tiers.mjs";

test("the actual Playwright collection has exactly 12 core and 26 extended owned executions", async () => {
  const all = await collectSpacesTests(process.cwd(), { ...process.env, SPACES_E2E_TIER: "all" });
  validateTierCatalog(all);
  const core = selectTier(all, "core");
  expect(core).toHaveLength(12); expect(all).toHaveLength(38);
  expect(core.filter(item => item.projectName === "mobile-390")).toHaveLength(2);
  const listedCore = await collectSpacesTests(process.cwd(), { ...process.env, SPACES_E2E_TIER: "core" });
  expect(listedCore).toEqual(core);
  expect(() => validateTierCatalog(all.slice(1))).toThrow("ownership mismatch");
  expect(() => validateTierCatalog([...all, { ...all[0], title: "unclassified" }])).toThrow("ownership mismatch");
  expect(() => selectTier(all, "unknown")).toThrow();
  expect(tierGrep("core", "mobile-390").test("Prompt editor submits, cancels, and isolates Canvas shortcuts")).toBe(true);
  expect(tierGrep("core", "mobile-390").test("owner model defaults use model picker and persist only into new Space nodes")).toBe(false);
  const migration = JSON.parse(await readFile(new URL("./e2e-migrations.json", import.meta.url), "utf8"));
  expect(migration.migrations.reduce((sum, item) => sum + item.projects.length, 0)).toBe(34);
  expect(migration.migrations).toHaveLength(19);
  for (const item of migration.migrations) {
    expect(all.some(test => test.title.endsWith(item.title))).toBe(false);
    expect(await readFile(item.browser, "utf8")).toContain(item.browserCase);
    for (const file of [...item.unit, ...item.integration]) expect((await readFile(file, "utf8")).length).toBeGreaterThan(0);
  }
});
