// @vitest-environment node
import { expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSpacesWorkspace } from "./isolated-workspace.mjs";

test("only compiler data survives while source, runtime and secrets are fresh", async () => {
  const parent = await mkdtemp(join(tmpdir(), "leesfield-compiler-contract-"));
  const root = join(parent, "project"); let active;
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "next"), { recursive: true });
    for (const [name, value] of Object.entries({ "src/app.ts": "first", "package.json": "{}", "next.config.ts": "export default {}", "tsconfig.json": "{}", "node_modules/next/package.json": '{"version":"16.4.1"}', ".env": "secret-value" })) await writeFile(join(root, name), value);
    active = await createSpacesWorkspace(root, { profile: "production", publicEnvironment: {} });
    const stable = active.directory;
    expect(active.cache.buildRestored).toBe(false);
    expect(await readdir(stable)).not.toContain(".env");
    await writeFile(join(stable, ".next", "cache", "compiled"), "compiler-only");
    await mkdir(join(stable, ".next", "server")); await writeFile(join(stable, ".next", "server", "old"), "runtime");
    await expect(createSpacesWorkspace(root, { profile: "production", publicEnvironment: {} })).rejects.toThrow("locked");
    await active.cleanup(); active = null;
    await writeFile(join(root, "src", "app.ts"), "second");
    active = await createSpacesWorkspace(root, { profile: "production", publicEnvironment: {} });
    expect(active.directory).toBe(stable);
    expect(active.cache.buildRestored).toBe(true);
    expect(await readFile(join(stable, "src", "app.ts"), "utf8")).toBe("second");
    expect(await readFile(join(stable, ".next", "cache", "compiled"), "utf8")).toBe("compiler-only");
    expect(await readdir(join(stable, ".next"))).not.toContain("server");
    await active.cleanup(); active = null;
    active = await createSpacesWorkspace(root, { profile: "development", publicEnvironment: {} });
    expect(active.cache).toMatchObject({ enabled: false, buildRestored: false, devRestored: false });
    expect(active.directory).not.toBe(stable);
    await mkdir(join(active.directory, ".next", "dev", "cache"));
    await writeFile(join(active.directory, ".next", "dev", "cache", "stale"), "old dev graph");
    await active.cleanup(); active = null;
    active = await createSpacesWorkspace(root, { profile: "development", publicEnvironment: {} });
    expect(active.cache.devRestored).toBe(false);
    expect(await readdir(join(active.directory, ".next", "dev"))).toEqual([]);
  } finally { await active?.cleanup(); await rm(parent, { recursive: true, force: true }); }
});
