import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function validateProductionLicenses(report, dependencies, policy) {
  const errors = [];
  const found = new Set();
  let packageCount = 0;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { errors: ["Production license inventory is not an object"], packageCount };
  }
  for (const [license, packages] of Object.entries(report)) {
    if (!Array.isArray(packages)) {
      errors.push(`Invalid package inventory for license ${license}`);
      continue;
    }
    for (const item of packages) {
      if (!item?.name || !Array.isArray(item.versions) || !item.versions.length) {
        errors.push(`Invalid package record for license ${license}`);
        continue;
      }
      packageCount++;
      found.add(item.name);
      const exception = policy.packageExceptions[item.name];
      const scopedException = exception?.licenses.includes(license)
        && item.versions.every(version => exception.versions.includes(version));
      const strongCopyleft = /(?:^|[\s(])(?:AGPL|GPL)(?:[-\s)]|$)/i.test(license);
      const selectedMit = scopedException && exception.selectedLicense === "MIT" && /\bMIT OR GPL-/.test(license);
      if (strongCopyleft && !selectedMit) {
        errors.push(`${item.name}@${item.versions.join(",")} has forbidden license ${license}`);
      } else if (!policy.allowedLicenseExpressions.includes(license) && !scopedException) {
        errors.push(`${item.name}@${item.versions.join(",")} has non-allowlisted license ${license}`);
      }
    }
  }
  if (!packageCount) errors.push("Production license inventory is empty");
  for (const name of Object.keys(dependencies)) {
    if (!found.has(name)) errors.push(`Production dependency is absent from license inventory: ${name}`);
  }
  return { errors, packageCount };
}

export async function validateRetainedNotices(root, policy) {
  const errors = [];
  for (const notice of policy.retainedMitNotices) {
    try {
      const license = await readFile(join(root, notice.licensePath), "utf8");
      const attribution = await readFile(join(root, notice.noticePath), "utf8");
      const normalized = license.replace(/\s+/g, " ");
      for (const required of [
        "MIT License",
        notice.copyright,
        "Permission is hereby granted, free of charge",
        "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.",
        'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
        "IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE",
      ]) {
        if (!normalized.includes(required)) errors.push(`${notice.licensePath}: incomplete retained MIT license (${required})`);
      }
      if (!attribution.includes(notice.attribution) || !/\bMIT\b/.test(attribution) || !/\bLICENSE\b/.test(attribution)) {
        errors.push(`${notice.noticePath}: missing retained MIT attribution/license reference`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      errors.push(`Missing retained license/notice: ${notice.licensePath} / ${notice.noticePath}`);
    }
  }
  return errors;
}

export async function verifyLicenses(root = projectRoot) {
  const policy = JSON.parse(await readFile(join(root, "scripts/security/license-policy.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const result = spawnSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Production license inventory failed (exit ${result.status})`);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error("Production license inventory is not valid JSON");
  }
  const validation = validateProductionLicenses(report, packageJson.dependencies ?? {}, policy);
  const errors = [...validation.errors, ...await validateRetainedNotices(root, policy)];
  if (errors.length) throw new Error(errors.join("\n"));
  return { packageCount: validation.packageCount, noticeCount: policy.retainedMitNotices.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyLicenses();
  process.stdout.write(`Production licenses verified (${result.packageCount} package records, ${result.noticeCount} retained MIT licenses)\n`);
}
