import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { projectRoot, readJson, vendorRoot } from "./lib.mjs";

const policy = await readJson(join(vendorRoot, "dependency-policy.json"));
const runtimeRoots = Object.keys(policy.runtimeDependencies);
const registry = process.env.NPM_CONFIG_REGISTRY ?? "https://registry.npmjs.org/";
const result = spawnSync(
  "pnpm",
  ["audit", "--prod", "--json", `--registry=${registry}`],
  {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  },
);

if (result.error) throw result.error;

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error(
    `Could not parse pnpm audit output${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
  );
}

const blocked = [];
for (const advisory of Object.values(report.advisories ?? {})) {
  if (!new Set(["high", "critical"]).has(advisory.severity)) continue;

  for (const finding of advisory.findings ?? []) {
    for (const dependencyPath of finding.paths ?? []) {
      const runtimeRoot = runtimeRoots.find(
        (name) => dependencyPath === `.>${name}` || dependencyPath.startsWith(`.>${name}>`),
      );
      if (runtimeRoot) {
        blocked.push(
          `${runtimeRoot}: ${advisory.github_advisory_id ?? advisory.id} ${advisory.title}`,
        );
      }
    }
  }
}

if (blocked.length > 0) {
  throw new Error(
    `High/critical advisory in Node Banana runtime dependency subtree:\n${[
      ...new Set(blocked),
    ].join("\n")}`,
  );
}

const vulnerabilities = report.metadata?.vulnerabilities ?? {};
process.stdout.write(
  `Node Banana runtime dependency vulnerability gate passed; project baseline: ${JSON.stringify(vulnerabilities)}\n`,
);
