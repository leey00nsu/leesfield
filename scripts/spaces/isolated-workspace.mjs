import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const brand = "leesfield-compiler-cache-v1";
const required = ["src", "package.json", "next.config.ts", "tsconfig.json"];
const optional = ["public", "configs", "prisma", "scripts", "postcss.config.mjs", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".gitignore"];
async function nonempty(path) { try { return (await readdir(path)).length > 0; } catch { return false; } }
async function populate(root, directory) {
  for (const name of required) await cp(join(root, name), join(directory, name), { recursive: true });
  for (const name of optional) {
    try { await cp(join(root, name), join(directory, name), { recursive: true }); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await symlink(join(root, "node_modules"), join(directory, "node_modules"), "dir");
}

// Keep the source path stable for Next's incremental dependency graph. Only
// production compiler caches survive cleanup; the source, generated output, DB and server
// are always new. Never restore .env, static/server output or test results.
export async function createSpacesWorkspace(root, { profile = "development", cold = process.env.SPACES_E2E_COLD === "1", publicEnvironment = process.env } = {}) {
  if (!["development", "core-development", "production", "storage-contract"].includes(profile)) throw new Error("Invalid compiler cache profile");
  if (cold) {
    const directory = await mkdtemp(join(dirname(root), ".leesfield-spaces-e2e-"));
    const cleanup = () => rm(directory, { recursive: true, force: true });
    try { await populate(root, directory); return { directory, moduleRoot: dirname(root), cleanup, cache: { enabled: false, profile, dependencies: "shared-node_modules" } }; }
    catch (error) { await cleanup(); throw error; }
  }
  const digest = createHash("sha256").update(brand).update(await realpath(root)).update(process.version).update(process.platform).update(process.arch).update(profile);
  for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "node_modules/next/package.json"]) {
    try { digest.update(name).update(await readFile(join(root, name))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  digest.update(JSON.stringify(Object.entries(publicEnvironment).filter(([key]) => key.startsWith("NEXT_PUBLIC_")).sort(([a], [b]) => a.localeCompare(b))));
  const key = digest.digest("hex"), base = join(dirname(root), ".leesfield-verification-cache", key);
  const lock = join(base, "lock"), directory = join(base, "workspace");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const ownerFile = join(base, "owner.json");
  try {
    const owner = JSON.parse(await readFile(ownerFile, "utf8"));
    if (owner.brand !== brand || owner.key !== key) throw new Error("Unrecognized compiler cache owner");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(ownerFile, JSON.stringify({ brand, key }), { flag: "wx", mode: 0o600 });
  }
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error("Compiler workspace is locked; use SPACES_E2E_COLD=1 for an independent cold workspace");
  }
  await writeFile(join(lock, "owner.json"), JSON.stringify({ brand, key, pid: process.pid }), { mode: 0o600 });
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return; cleaned = true;
    try { await rm(directory, { recursive: true, force: true }); }
    finally { await rm(lock, { recursive: true, force: true }); }
  };
  try {
    // The owned path can contain an interrupted prior source snapshot.
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const buildCache = join(base, "compiler", "build");
    const cache = { enabled: profile === "production", key: key.slice(0, 16), profile,
      policy: "production-build-only", buildRestored: profile === "production" && await nonempty(buildCache),
      devRestored: false, dependencies: "shared-node_modules" };
    await populate(root, directory);
    await mkdir(join(directory, ".next", "dev"), { recursive: true });
    if (profile === "production") {
      await mkdir(buildCache, { recursive: true, mode: 0o700 });
      await symlink(buildCache, join(directory, ".next", "cache"), "dir");
    }
    return { directory, moduleRoot: dirname(root), cleanup, cache };
  } catch (error) { await cleanup(); throw error; }
}
