// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpacesWorkspace } from "./isolated-workspace.mjs";
import { createHmrDiagnostics } from "./hmr-diagnostics.mjs";
import {
  SPACES_E2E_AREAS,
  flattenSpacesTests,
  parseSpacesE2EArguments,
  selectSpacesTests,
  spacesGrepForAreas,
} from "./e2e-groups.mjs";

function listedSpec(title, tags, projects = ["desktop", "mobile-390"]) {
  return { title, tags, tests: projects.map(projectName => ({ projectName, status: "skipped", results: [] })) };
}

function reportFor(...specs) {
  return { errors: [], suites: [{ title: "spaces.spec.mjs", suites: [{ title: "durable media", specs }] }] };
}

function browserCase(title, projectName, ...tags) {
  return { title, projectName, tags };
}

const catalog = [
  browserCase("prompt smoke", "desktop", "@spaces-prompt", "@spaces-smoke"),
  browserCase("prompt smoke", "mobile-390", "@spaces-prompt", "@spaces-smoke"),
  browserCase("palette smoke", "desktop", "@spaces-canvas", "@spaces-smoke"),
  browserCase("palette smoke", "mobile-390", "@spaces-canvas", "@spaces-smoke"),
  browserCase("generation prompt", "desktop", "@desktop", "@spaces-generation", "@spaces-prompt"),
  browserCase("capture asset.png", "desktop", "@spaces-media", "@spaces-capture"),
  browserCase("capture asset.png", "mobile-390", "@spaces-media", "@spaces-capture"),
  browserCase("owner defaults", "desktop", "@spaces-settings"),
];

describe("Spaces compiler isolation", () => {
  it("copies current sources without stale output, secrets or shared generated type files", async () => {
    const parent = await mkdtemp(join(tmpdir(), "leesfield-isolation-test-")), root = join(parent, "app");
    let workspace;
    try {
      await mkdir(join(root, "src"), { recursive: true }); await mkdir(join(root, "node_modules"));
      for (const [name, body] of Object.entries({ "src/page.tsx": "current source", "package.json": "{}", "tsconfig.json": "original types", "next.config.ts": "original config", "next-env.d.ts": "original declarations", ".env.local": "private" })) await writeFile(join(root, name), body);
      await mkdir(join(root, ".next")); await writeFile(join(root, ".next/stale.js"), "stale compiler state");
      workspace = await createSpacesWorkspace(root, { cold: true });
      expect(await readFile(join(workspace.directory, "src/page.tsx"), "utf8")).toBe("current source");
      expect(await readlink(join(workspace.directory, "node_modules"))).toBe(join(root, "node_modules"));
      expect(workspace.moduleRoot).toBe(parent);
      for (const excluded of [".next", ".env.local", "next-env.d.ts"]) expect(await readdir(workspace.directory)).not.toContain(excluded);
      await writeFile(join(workspace.directory, "tsconfig.json"), "generated isolated types");
      await writeFile(join(workspace.directory, "next-env.d.ts"), "generated declarations");
      await writeFile(join(root, "src/page.tsx"), "subsequent edit");
      expect(await readFile(join(workspace.directory, "src/page.tsx"), "utf8")).toBe("current source");
      expect(await readFile(join(root, "tsconfig.json"), "utf8")).toBe("original types");
      expect(await readFile(join(root, "next-env.d.ts"), "utf8")).toBe("original declarations");
      await workspace.cleanup(); await workspace.cleanup();
      expect(await readdir(parent)).toEqual(["app"]);
    } finally { await workspace?.cleanup(); await rm(parent, { recursive: true, force: true }); }
  });
  it.each([true, false])("removes a partial source snapshot when preparation fails (cold: %s)", async cold => {
    const parent = await mkdtemp(join(tmpdir(), "leesfield-isolation-test-")), root = join(parent, "app");
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await expect(createSpacesWorkspace(root, { cold })).rejects.toMatchObject({ code: "ENOENT" });
      if (cold) expect(await readdir(parent)).toEqual(["app"]);
      else {
        expect((await readdir(parent)).sort()).toEqual([".leesfield-verification-cache", "app"]);
        const cacheRoot = join(parent, ".leesfield-verification-cache");
        const entries = await readdir(cacheRoot);
        expect(entries).toHaveLength(1);
        expect(await readdir(join(cacheRoot, entries[0]))).toEqual(["owner.json"]);
      }
    } finally { await rm(parent, { recursive: true, force: true }); }
  });
  it("retains bounded HMR failure evidence without recording RSC payloads", () => {
    const diagnostics = createHmrDiagnostics();
    diagnostics.message("\u0000private RSC text"); diagnostics.message('{"type":"sync","errors":["private error"]}');
    diagnostics.message('{"type":"turbopack-connected"}'); diagnostics.navigation();
    for (let index = 0; index < 40; index++) {
      diagnostics.message('{"type":"reloadPage","data":"HMR hash mismatch"}');
      diagnostics.message('{"type":"turbopack-message","data":[{"type":"restart","resource":{"path":"static/chunks/entry.js"}}]}');
    }
    expect(diagnostics.snapshot()).toMatchObject({ connections: 1, navigations: 1, reloads: 40, restarts: 40 });
    expect(diagnostics.snapshot().events).toHaveLength(32);
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain("private");
  });
});

describe("Spaces E2E collection validation", () => {
  it("keeps listed, unexecuted project cases and normalizes reporter tags", () => {
    const tests = flattenSpacesTests(reportFor(listedSpec("select asset.png", ["spaces-media", "desktop"])));
    expect(tests).toEqual([
      browserCase("spaces.spec.mjs › durable media › select asset.png", "desktop", "@spaces-media", "@desktop"),
      browserCase("spaces.spec.mjs › durable media › select asset.png", "mobile-390", "@spaces-media", "@desktop"),
    ]);
  });

  it("rejects duplicate cases within a project without collapsing the same asset name across projects", () => {
    const spec = listedSpec("asset.png", ["spaces-media"]);
    expect(flattenSpacesTests(reportFor(spec))).toHaveLength(2);
    expect(() => flattenSpacesTests(reportFor({ ...spec, tests: [...spec.tests, spec.tests[0]] }))).toThrow(/Duplicate/);
  });

  it("distinguishes matching titles in different describe suites", () => {
    const spec = listedSpec("asset.png", ["spaces-media"], ["desktop"]);
    const report = { suites: [{ title: "spaces.spec.mjs", suites: [
      { title: "upload", specs: [spec] }, { title: "download", specs: [spec] },
    ] }] };
    expect(flattenSpacesTests(report).map(test => test.title)).toEqual([
      "spaces.spec.mjs › upload › asset.png", "spaces.spec.mjs › download › asset.png",
    ]);
  });

  it.each([
    [undefined, /needs tags/],
    [[], /Missing.*area tag/],
    [["desktop"], /Missing.*area tag/],
    [["spaces-smoke"], /Missing.*area tag/],
    [["spaces-media", "spaces-captuer"], /Unknown.*spaces-captuer/],
    [["@spaces-prompt", "@spaces-smok"], /Unknown.*spaces-smok/],
    [["spaces-media", null], /needs tags/],
  ])("rejects missing or misspelled area metadata %j", (tags, message) => {
    expect(() => flattenSpacesTests(reportFor(listedSpec("new regression", tags)))).toThrow(message);
  });

  it("rejects collection errors, malformed project cases, and empty reports", () => {
    const valid = reportFor(listedSpec("asset.png", ["spaces-media"]));
    expect(() => flattenSpacesTests({ ...valid, errors: [{ message: "failed to load a spec" }] })).toThrow(/collection reported errors/);
    expect(() => flattenSpacesTests(reportFor(listedSpec("asset.png", ["spaces-media"], [undefined])))).toThrow(/projectName/);
    expect(() => flattenSpacesTests(reportFor({ title: "new case", tags: ["spaces-media"], tests: [] }))).toThrow(/Invalid.*spec/);
    expect(() => flattenSpacesTests({ suites: [] })).toThrow(/empty/);
    expect(() => flattenSpacesTests({ suites: "invalid" })).toThrow(/Invalid.*report/);
  });
});

describe("Spaces E2E area selection", () => {
  it("takes the union of requested areas and smoke, retaining projects without duplicate executions", () => {
    const selected = selectSpacesTests(catalog, ["capture", "prompt", "capture"]);
    expect(selected).toEqual(catalog.slice(0, 7));
    expect(new Set(selected.map(test => JSON.stringify([test.title, test.projectName]))).size).toBe(selected.length);
    expect(selected.filter(test => test.projectName === "mobile-390")).toHaveLength(3);
  });

  it("uses an empty area list only for smoke and null for the complete unchanged catalog", () => {
    const before = structuredClone(catalog);
    expect(selectSpacesTests(catalog, [])).toEqual(catalog.slice(0, 4));
    expect(selectSpacesTests(catalog, null)).toEqual(catalog);
    expect(selectSpacesTests(catalog, SPACES_E2E_AREAS)).toEqual(catalog);
    expect(catalog).toEqual(before);
  });

  it("validates the full catalog before excluding an unrelated invalid case", () => {
    const invalid = [...catalog, browserCase("uncategorized new case", "desktop", "@desktop")];
    expect(() => selectSpacesTests(invalid, ["prompt"])).toThrow(/Missing.*area tag/);
    expect(() => selectSpacesTests([...catalog, catalog[0]], [])).toThrow(/Duplicate/);
  });

  it.each([["unknown"], ["smoke"], ["prompt", "media.*"]].map(areas => [areas]))("rejects unknown areas %j", areas => {
    expect(() => selectSpacesTests(catalog, areas)).toThrow(/Unknown.*area/);
    expect(() => spacesGrepForAreas(areas)).toThrow(/Unknown.*area/);
  });

  it("rejects an empty effective selection instead of claiming success", () => {
    const settingsOnly = catalog.slice(-1);
    expect(() => selectSpacesTests(settingsOnly, ["capture"])).toThrow(/selection is empty/);
    expect(() => selectSpacesTests(settingsOnly, [])).toThrow(/selection is empty/);
    expect(() => selectSpacesTests([], null)).toThrow(/catalog is empty/);
    expect(() => selectSpacesTests(catalog, "prompt")).toThrow(/array or null/);
  });

  it("generates grep with the same union and exact tag boundaries", () => {
    const expression = new RegExp(spacesGrepForAreas(["prompt", "capture"]));
    const grepSelected = catalog.filter(test => expression.test([test.projectName, test.title, ...test.tags].join(" ")));
    expect(grepSelected).toEqual(selectSpacesTests(catalog, ["prompt", "capture"]));
    expect(expression.test("desktop new case @spaces-prompt-extra")).toBe(false);
    expect(expression.test("desktop new case @spaces-capture_suffix")).toBe(false);
    expect(expression.test("desktop new case @spaces-media")).toBe(false);
    expect(new RegExp(spacesGrepForAreas([])).test("desktop new case @spaces-smoke")).toBe(true);
    expect(new RegExp(spacesGrepForAreas([])).test("desktop new case @spaces-prompt")).toBe(false);
    expect(spacesGrepForAreas(null)).toBeUndefined();
  });
});

describe("Spaces E2E isolated runner arguments", () => {
  it("removes wrapper areas while preserving supported execution options", () => {
    expect(parseSpacesE2EArguments(["--workers", "4", "--areas", "capture,prompt,prompt", "--reporter=json", "--headed"])).toEqual({
      areas: ["prompt", "capture"], playwrightArgs: ["--workers", "4", "--reporter=json", "--headed"],
    });
    expect(parseSpacesE2EArguments(["--areas=smoke", "-j2"])).toEqual({ areas: [], playwrightArgs: ["-j2"] });
    expect(parseSpacesE2EArguments(["--areas=smoke", "-j=3"])).toEqual({ areas: [], playwrightArgs: ["-j=3"] });
  });

  it("preserves manual grep, project, last-failed and positional filters without --areas", () => {
    const args = ["spaces.spec.mjs", "--grep", "Prompt", "--project=desktop", "--last-failed"];
    expect(parseSpacesE2EArguments(args)).toEqual({ areas: null, playwrightArgs: args });
    expect(parseSpacesE2EArguments([])).toEqual({ areas: null, playwrightArgs: [] });
  });

  it.each([
    ["--areas"], ["--areas="], ["--areas", "--workers", "2"], ["--areas=unknown"],
    ["--areas=prompt,"], ["--areas=prompt,smoke"], ["--areas=smoke", "--areas=capture"],
  ].map(args => [args]))("rejects missing, unknown or ambiguous areas %j", args => {
    expect(() => parseSpacesE2EArguments(args)).toThrow(/areas|area/);
  });

  it.each([
    ["--grep", "Prompt"], ["--grep=Prompt"], ["-gPrompt"], ["--grep-invert=@desktop"],
    ["--project", "desktop"], ["--project=mobile-390"], ["--shard=1/2"], ["--repeat-each=2"],
    ["--last-failed"], ["--only-changed=main"], ["--test-list", "cases.txt"], ["--test-list-invert=cases.txt"],
    ["--config=other.config.mjs"], ["-cother.config.mjs"], ["--list"], ["--pass-with-no-tests"],
    ["spaces.spec.mjs:12"], ["--", "spaces.spec.mjs"], ["--new-selector=anything"],
    ["--workers", "2", "spaces.spec.mjs"], ["--reporter", "--grep=Prompt"],
  ].map(flags => [flags]))("rejects competing or unrecognized selection %j", flags => {
    expect(() => parseSpacesE2EArguments(["--areas=prompt", ...flags])).toThrow(/--areas|requires a value/);
  });
});
