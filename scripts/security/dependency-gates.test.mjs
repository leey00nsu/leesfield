// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkSource, verifyDependencies } from "../spaces/verify-dependencies.mjs";
import { validateProductionLicenses, validateRetainedNotices } from "./verify-licenses.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const policy = JSON.parse(await readFile(join(projectRoot, "scripts/security/license-policy.json"), "utf8"));
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "leesfield-dependency-gate-"));
  roots.push(root);
  for (const [file, content] of Object.entries({ "package.json": "{}", ...files })) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  }
  return root;
}

describe("native editor dependency boundary", () => {
  it.each([
    'import type { Store } from "@node-banana-runtime/store";',
    'export { Canvas } from "@node-banana-runtime/canvas";',
    'const module = import(`@node-banana-runtime/canvas`);',
    'const module = require("../../runtime/node-banana/adapter");',
    'const module = require.resolve("@node-banana-runtime");',
    'type Store = import("@node-banana-runtime/store").Store;',
    'vi.mock("@node-banana-runtime/store", () => ({}));',
    'runProcess("pnpm", ["vendor:node-banana:prepare"], environment);',
    'spawn("node", ["scripts/node-banana/prepare.mjs"]);',
  ])("rejects imports, type edges, mocks and process preparation: %s", source => {
    expect(checkSource("src/editor.ts", source)).not.toEqual([]);
  });

  it("checks build aliases without rejecting archival references in source comments or data", () => {
    expect(checkSource("vitest.config.ts", 'const alias = { "@legacy": ".generated/node-banana-runtime/src" };', { config: true })).not.toEqual([]);
    expect(checkSource("src/editor.ts", '// Originally inspired by @node-banana-runtime/canvas\nconst attribution = "Node Banana"; import { createStore } from "zustand/vanilla";')).toEqual([]);
  });

  it("accepts ordinary dependencies and archival READMEs/licenses/notices", async () => {
    const root = await fixture({
      "package.json": JSON.stringify({ dependencies: { "@xyflow/react": "12.11.3", jszip: "3.10.1" } }),
      "src/editor.ts": 'import { ReactFlow } from "@xyflow/react"; import JSZip from "jszip";',
      "third_party/node-banana/README.md": "Old pnpm vendor:node-banana:prepare explanation is archival.",
      "third_party/node-banana/source/README.md": "The preserved upstream README mentions its runtime.",
      "third_party/node-banana/LICENSE": "MIT",
      "third_party/node-banana/source/LICENSE": "MIT",
      "third_party/node-banana/THIRD_PARTY_NOTICES.md": "Node Banana / MIT",
    });
    expect((await verifyDependencies(root)).errors).toEqual([]);
  });

  it("rejects hidden lifecycle preparation, dependency aliases, snapshot scripts and generated trees", async () => {
    const root = await fixture({
      "package.json": JSON.stringify({ scripts: { pretest: "node scripts/node-banana/prepare.mjs" }, dependencies: { hidden: "file:third_party/node-banana/source" } }),
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@legacy/*": ["./.generated/node-banana-runtime/*"] } } }),
      "third_party/node-banana/source/index.ts": "export const oldStore = {};",
      "scripts/node-banana/prepare.mjs": "export {};",
      ".generated/node-banana-runtime/index.ts": "export {};",
      "src/styles.css": '@import "@node-banana-runtime/style.css";',
    });
    const { errors } = await verifyDependencies(root);
    expect(errors.join("\n")).toMatch(/preparation script: pretest/);
    expect(errors.join("\n")).toMatch(/forbidden editor dependency: hidden/);
    expect(errors.join("\n")).toMatch(/source\/index.ts/);
    expect(errors.join("\n")).toMatch(/scripts\/node-banana\/prepare.mjs/);
    expect(errors.join("\n")).toMatch(/Removed editor runtime tree/);
    expect(errors.join("\n")).toMatch(/tsconfig.json/);
    expect(errors.join("\n")).toMatch(/src\/styles.css/);
  });
});

describe("production license inventory", () => {
  it("checks the full production graph and selects only the known JSZip MIT option", () => {
    const report = {
      MIT: [{ name: "host", versions: ["1.0.0"] }],
      MPL: [],
      "MPL-2.0": [{ name: "mediabunny", versions: ["1.31.0"] }],
      "(MIT OR GPL-3.0-or-later)": [{ name: "jszip", versions: ["3.10.1"] }],
      "(MIT AND Zlib)": [{ name: "pako", versions: ["1.0.11"] }],
      Unknown: [{ name: "@paper-design/shaders", versions: ["0.0.76"] }],
    };
    expect(validateProductionLicenses(report, { host: "1.0.0", jszip: "3.10.1", mediabunny: "1.31.0" }, policy)).toEqual({ errors: [], packageCount: 5 });
  });

  it("fails closed for empty/malformed inventories and missing production dependencies", () => {
    expect(validateProductionLicenses({}, { host: "1.0.0" }, policy).errors).toEqual([
      "Production license inventory is empty", "Production dependency is absent from license inventory: host",
    ]);
    expect(validateProductionLicenses([], {}, policy).errors).not.toEqual([]);
    expect(validateProductionLicenses({ MIT: [{}] }, {}, policy).errors).not.toEqual([]);
  });

  it("blocks transitive copyleft or unknown licenses outside the previous vendor subtree", () => {
    const result = validateProductionLicenses({
      MIT: [{ name: "host", versions: ["1"] }],
      "AGPL-3.0-only": [{ name: "unrelated-transitive", versions: ["2"] }],
      "GPL-3.0-only": [{ name: "jszip", versions: ["3.10.1"] }],
      Unknown: [{ name: "@paper-design/shaders", versions: ["0.0.77"] }, { name: "other", versions: ["1"] }],
    }, { host: "1" }, policy);
    expect(result.errors).toHaveLength(4);
    expect(result.errors.join("\n")).toMatch(/unrelated-transitive/);
  });

  it("requires the retained MIT permission, copyright, warranty and attribution text", async () => {
    const license = await readFile(join(projectRoot, policy.retainedMitNotices[0].licensePath), "utf8");
    const root = await fixture(Object.fromEntries(policy.retainedMitNotices.flatMap(notice => [
      [notice.licensePath, license], [notice.noticePath, "Node Banana is MIT licensed. See LICENSE."],
    ])));
    expect(await validateRetainedNotices(root, policy)).toEqual([]);
    await writeFile(join(root, policy.retainedMitNotices[0].licensePath), "MIT License only");
    await writeFile(join(root, policy.retainedMitNotices[0].noticePath), "No attribution");
    expect((await validateRetainedNotices(root, policy)).join("\n")).toMatch(/incomplete retained MIT license/);
    expect((await validateRetainedNotices(root, policy)).join("\n")).toMatch(/missing retained MIT attribution/);
    await rm(join(root, policy.retainedMitNotices[1].licensePath));
    expect((await validateRetainedNotices(root, policy)).join("\n")).toMatch(/Missing retained license/);
  });
});
