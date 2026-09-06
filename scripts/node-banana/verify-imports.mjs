import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collectReachableImports,
  generatedRoot,
  projectRoot,
  readJson,
  vendorRoot,
} from "./lib.mjs";

const policy = await readJson(join(vendorRoot, "dependency-policy.json"));
const rootPackage = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const allowedPackages = new Set([
  ...Object.keys(policy.runtimeDependencies),
  ...policy.allowedHostDependencies,
]);
const forbiddenPackages = new Set(policy.forbiddenDependencies);
const errors = [];

for (const [name, version] of Object.entries(policy.runtimeDependencies)) {
  if (rootPackage.dependencies?.[name] !== version) {
    errors.push(
      `runtime dependency ${name} must be pinned to ${version}; received ${rootPackage.dependencies?.[name] ?? "missing"}`,
    );
  }
}

for (const name of forbiddenPackages) {
  if (rootPackage.dependencies?.[name]) {
    errors.push(`forbidden production dependency is installed: ${name}`);
  }
}

const graph = await collectReachableImports(generatedRoot, policy.runtimeEntrypoints);

for (const packageName of graph.packages) {
  if (packageName.startsWith("node:") || !allowedPackages.has(packageName)) {
    errors.push(`runtime entrypoint reaches non-allowlisted package: ${packageName}`);
  }
  if (forbiddenPackages.has(packageName)) {
    errors.push(`runtime entrypoint reaches forbidden package: ${packageName}`);
  }
}

for (const [filePath, source] of graph.sourceByPath.entries()) {
  for (const prefix of policy.forbiddenPathPrefixes) {
    if (filePath === prefix || filePath.startsWith(prefix)) {
      errors.push(`runtime entrypoint reaches forbidden source path: ${filePath}`);
    }
  }
  for (const pattern of policy.forbiddenSourcePatterns) {
    if (source.includes(pattern)) {
      errors.push(`runtime source ${filePath} contains forbidden pattern: ${pattern}`);
    }
  }
}

if (errors.length > 0) {
  throw new Error([...new Set(errors)].join("\n"));
}

process.stdout.write(
  `Node Banana import graph verified (${graph.files.length} files, ${graph.packages.length} packages)\n`,
);
