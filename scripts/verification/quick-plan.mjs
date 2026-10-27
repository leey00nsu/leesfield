import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createVitest } from "vitest/node";
import { createVerificationPlan } from "./policy.mjs";

export function parseQuickArguments(args) {
  const result = { files: [], since: "HEAD", planOnly: false, json: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--plan") result.planOnly = true;
    else if (arg === "--json") result.json = true;
    else if (arg === "--since" || arg.startsWith("--since=")) {
      result.since = arg === "--since" ? args[++index] : arg.slice(8);
      if (!result.since || result.since.startsWith("-") || result.since.includes("\0")) throw new Error("Invalid quick Git reference");
    } else if (arg.startsWith("-")) throw new Error("Unknown quick option: " + arg);
    else result.files.push(arg);
  }
  if (result.json && !result.planOnly) throw new Error("--json requires --plan");
  return result;
}

export async function validateQuickFiles(root, files) {
  const repository = await realpath(root);
  return [...new Set(files)].map(file => {
    if (!file || path.isAbsolute(file) || file.includes("\\") || file.includes("\0") ||
      file.split("/").some(part => !part || part === "." || part === ".." || part.startsWith(".")) ||
      file.split("/").includes("node_modules")) throw new Error("Expected a repository-relative source file: " + file);
    return file;
  }).reduce(async (pending, file) => {
    const checked = await pending;
    const actual = await realpath(path.resolve(root, file));
    const relative = path.relative(repository, actual);
    if (!relative || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || !(await stat(actual)).isFile()) {
      throw new Error("Quick input must be a file inside the repository: " + file);
    }
    return [...checked, file];
  }, Promise.resolve([]));
}

export function quickScope(impact, graph) {
  const formal = createVerificationPlan({ ...impact, ...graph });
  return {
    official: false,
    level: "quick",
    formalLevel: formal.level,
    fullVerificationRequired: formal.level === "full",
    selection: formal.level === "full" ? "all-unit-tests" : "related-unit-tests",
    reasons: formal.reasons,
  };
}

export async function discoverQuickTests(root, files, all) {
  const ctx = await createVitest("test", {
    root, run: true, watch: false, reporters: [], maxWorkers: 4,
    ...(all ? {} : { related: files.map(file => path.resolve(root, file)) }),
  });
  try {
    let specs, fallback = null;
    try { specs = await ctx.getRelevantTestSpecifications(); }
    catch {
      // A dependency-analysis error cannot silently remove coverage.
      specs = await ctx.globTestSpecifications();
      fallback = "dependency-analysis-failed: all unit tests selected";
    }
    // Vitest CLI filters are substrings. Expand with that same resolver so the
    // reported scope also includes a possible .test.ts/.test.tsx prefix match.
    const expanded = specs.length ? await ctx.globTestSpecifications(specs.map(spec => spec.moduleId)) : [];
    return { files: [...new Set(expanded.map(spec => path.relative(root, spec.moduleId).replaceAll(path.sep, "/")))].sort(), fallback };
  } finally { await ctx.close(); }
}
