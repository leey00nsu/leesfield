import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot, readJson, runCaptured, vendorRoot } from "./lib.mjs";

const policy = await readJson(join(vendorRoot, "dependency-policy.json"));
const metadata = await readJson(join(vendorRoot, "UPSTREAM.json"));
const rootPackage = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const licenseReport = JSON.parse(
  runCaptured("pnpm", ["licenses", "list", "--prod", "--json"]),
);
const runtimePackages = new Set(Object.keys(policy.runtimeDependencies));
const componentsByRef = new Map();

for (const [license, packages] of Object.entries(licenseReport)) {
  for (const item of packages) {
    for (const version of item.versions) {
      const reference = `pkg:npm/${encodeURIComponent(item.name)}@${version}`;
      componentsByRef.set(reference, {
        type: "library",
        "bom-ref": reference,
        name: item.name,
        version,
        licenses: [{ license: { id: license } }],
        purl: reference,
        properties: runtimePackages.has(item.name)
          ? [{ name: "leesfield:node-banana-runtime", value: "true" }]
          : [],
      });
    }
  }
}

const upstreamReference = `pkg:github/shrimbly/node-banana@${metadata.commit}`;
componentsByRef.set(upstreamReference, {
  type: "application",
  "bom-ref": upstreamReference,
  name: metadata.name,
  version: metadata.version,
  licenses: [{ license: { id: metadata.license } }],
  purl: upstreamReference,
  externalReferences: [{ type: "vcs", url: `${metadata.repository}/tree/${metadata.tag}` }],
  hashes: [{ alg: "SHA-256", content: metadata.snapshotSha256 }],
  properties: [
    { name: "leesfield:upstream-tree", value: metadata.tree },
    { name: "leesfield:archive-sha256", value: metadata.archiveSha256 },
  ],
});

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: metadata.importedAt,
    component: {
      type: "application",
      name: rootPackage.name,
      version: rootPackage.version,
    },
    tools: [{ vendor: "leesfield", name: "scripts/node-banana/generate-sbom.mjs" }],
  },
  components: [...componentsByRef.values()].sort((left, right) =>
    left["bom-ref"].localeCompare(right["bom-ref"], "en"),
  ),
};
const outputPath = join(vendorRoot, "sbom.cdx.json");
const output = `${JSON.stringify(sbom, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== output) {
    throw new Error("third_party/node-banana/sbom.cdx.json is stale; run pnpm sbom:generate");
  }
  process.stdout.write(`SBOM verified (${sbom.components.length} components)\n`);
} else {
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`SBOM generated (${sbom.components.length} components)\n`);
}
