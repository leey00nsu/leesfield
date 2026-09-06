import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectReachableImports,
  normalizePackageSpecifier,
  sha256Tree,
} from "./lib.mjs";

describe("Node Banana supply-chain helpers", () => {
  it("normalizes scoped and unscoped package specifiers", () => {
    expect(normalizePackageSpecifier("@xyflow/react/dist/style.css")).toBe(
      "@xyflow/react",
    );
    expect(normalizePackageSpecifier("zustand/shallow")).toBe("zustand");
  });

  it("hashes paths, file contents and symlink targets deterministically", async () => {
    const root = await mkdtemp(join(tmpdir(), "node-banana-tree-"));
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested/a.txt"), "alpha\n");
    await symlink("nested/a.txt", join(root, "link.txt"));

    const first = await sha256Tree(root);
    const second = await sha256Tree(root);
    await writeFile(join(root, "nested/a.txt"), "beta\n");
    const changed = await sha256Tree(root);

    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });

  it("collects the reachable relative and package import graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "node-banana-imports-"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src/entry.ts"),
      'export { value } from "./value"; import "zustand";\n',
    );
    await writeFile(join(root, "src/value.ts"), "export const value = 1;\n");

    const graph = await collectReachableImports(root, ["src/entry.ts"]);

    expect(graph.files).toEqual(["src/entry.ts", "src/value.ts"]);
    expect(graph.packages).toEqual(["zustand"]);
  });
});
