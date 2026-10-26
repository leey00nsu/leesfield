import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

// A different distDir still shares next-env.d.ts and tsconfig.json. Give each
// server its own source snapshot as well as a cold compiler cache.
export async function createSpacesWorkspace(root) {
  const directory = await mkdtemp(join(dirname(root), ".leesfield-spaces-e2e-"));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    for (const name of ["src", "package.json", "next.config.ts", "tsconfig.json"]) {
      await cp(join(root, name), join(directory, name), { recursive: true });
    }
    for (const name of ["public", "configs", "prisma", "postcss.config.mjs", "pnpm-lock.yaml", ".gitignore"]) {
      try { await cp(join(root, name), join(directory, name), { recursive: true }); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    await symlink(join(root, "node_modules"), join(directory, "node_modules"), "dir");
    return { directory, moduleRoot: dirname(root), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
