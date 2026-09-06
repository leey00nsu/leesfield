import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(scriptDirectory, "../..");
export const vendorRoot = join(projectRoot, "third_party/node-banana");
export const snapshotRoot = join(vendorRoot, "upstream");
export const patchesRoot = join(vendorRoot, "patches");
export const generatedRoot = join(projectRoot, ".generated/node-banana-runtime");

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

async function collectTreeEntries(root, current, entries) {
  const children = await readdir(current, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name, "en"));

  for (const child of children) {
    const absolutePath = join(current, child.name);
    const relativePath = relative(root, absolutePath).split(sep).join("/");

    if (child.isDirectory()) {
      await collectTreeEntries(root, absolutePath, entries);
      continue;
    }

    if (child.isFile() || child.isSymbolicLink()) {
      entries.push({ absolutePath, relativePath });
    }
  }
}

export async function listTreeEntries(root) {
  const entries = [];
  await collectTreeEntries(root, root, entries);
  return entries;
}

export async function sha256Tree(root, options = {}) {
  const excluded = new Set(options.exclude ?? []);
  const hash = createHash("sha256");
  const entries = await listTreeEntries(root);

  for (const entry of entries) {
    if (excluded.has(entry.relativePath)) continue;

    const stat = await lstat(entry.absolutePath);
    const kind = stat.isSymbolicLink() ? "symlink" : "file";
    const digest = stat.isSymbolicLink()
      ? createHash("sha256")
          .update(await readlink(entry.absolutePath))
          .digest("hex")
      : await sha256File(entry.absolutePath);

    hash.update(kind);
    hash.update("\0");
    hash.update(entry.relativePath);
    hash.update("\0");
    hash.update(digest);
    hash.update("\n");
  }

  return hash.digest("hex");
}

export function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})\n${detail}`);
  }

  return result.stdout.trim();
}

export function normalizePackageSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

function extractImportSpecifiers(source) {
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"';()]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const specifiers = new Set();

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

async function resolveSourceImport(importer, specifier, root) {
  let basePath;
  if (specifier.startsWith("@/")) {
    basePath = join(root, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    basePath = resolve(dirname(importer), specifier);
  } else {
    return null;
  }

  const candidates = [
    basePath,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".json", ".css"].map(
      (extension) => `${basePath}${extension}`,
    ),
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"].map((extension) =>
      join(basePath, `index${extension}`),
    ),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await lstat(candidate);
      if (stat.isFile() || stat.isSymbolicLink()) return candidate;
    } catch {
      // Try the next supported source extension.
    }
  }

  throw new Error(`Cannot resolve ${specifier} imported by ${relative(root, importer)}`);
}

export async function collectReachableImports(root, entrypoints) {
  const rootPrefix = `${resolve(root)}${sep}`;
  const pending = entrypoints.map((entrypoint) => resolve(root, entrypoint));
  const visited = new Set();
  const packages = new Set();
  const sourceByPath = new Map();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (!current.startsWith(rootPrefix)) {
      throw new Error(`Runtime import escapes generated root: ${current}`);
    }

    visited.add(current);
    const extension = extname(current);
    if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"].includes(extension)) {
      continue;
    }

    const source = await readFile(current, "utf8");
    sourceByPath.set(relative(root, current).split(sep).join("/"), source);

    for (const specifier of extractImportSpecifiers(source)) {
      const resolvedImport = await resolveSourceImport(current, specifier, root);
      if (resolvedImport) {
        pending.push(resolvedImport);
      } else {
        packages.add(normalizePackageSpecifier(specifier));
      }
    }
  }

  return {
    files: [...sourceByPath.keys()].sort(),
    packages: [...packages].sort(),
    sourceByPath,
  };
}
