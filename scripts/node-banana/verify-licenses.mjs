import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  projectRoot,
  readJson,
  runCaptured,
  sha256File,
  vendorRoot,
} from "./lib.mjs";

const policy = await readJson(join(vendorRoot, "dependency-policy.json"));
const metadata = await readJson(join(vendorRoot, "UPSTREAM.json"));
const rootPackage = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const report = JSON.parse(
  runCaptured("pnpm", ["licenses", "list", "--prod", "--json"]),
);
const allowedLicenses = new Set(policy.allowedLicenseExpressions);
const runtimePackages = new Set(Object.keys(policy.runtimeDependencies));
const foundRuntimePackages = new Set();
const errors = [];

for (const forbidden of policy.forbiddenDependencies) {
  if (rootPackage.dependencies?.[forbidden]) {
    errors.push(`forbidden production dependency is installed: ${forbidden}`);
  }
}

for (const [license, packages] of Object.entries(report)) {
  const upperLicense = license.toUpperCase();
  const copyleftBlocked = upperLicense.includes("AGPL") || /^GPL(?:-|$)/.test(upperLicense);

  for (const item of packages) {
    if (runtimePackages.has(item.name)) foundRuntimePackages.add(item.name);
    const exceptions = new Set(policy.licenseExceptions[item.name] ?? []);
    if (copyleftBlocked) {
      errors.push(`${item.name}@${item.versions.join(",")} has forbidden license ${license}`);
    } else if (!allowedLicenses.has(license) && !exceptions.has(license)) {
      errors.push(`${item.name}@${item.versions.join(",")} has non-allowlisted license ${license}`);
    }
  }
}

for (const runtimePackage of runtimePackages) {
  if (!foundRuntimePackages.has(runtimePackage)) {
    errors.push(`runtime dependency is absent from production license inventory: ${runtimePackage}`);
  }
}

const licenseSha256 = await sha256File(join(vendorRoot, "LICENSE"));
if (licenseSha256 !== metadata.licenseSha256) {
  errors.push(`vendored license hash mismatch: ${licenseSha256}`);
}

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}

const packageCount = Object.values(report).reduce(
  (total, packages) => total + packages.length,
  0,
);
process.stdout.write(
  `Production licenses verified (${packageCount} package records, ${runtimePackages.size} Node Banana runtime dependencies)\n`,
);
