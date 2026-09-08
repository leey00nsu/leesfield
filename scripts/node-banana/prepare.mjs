import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  generatedRoot,
  patchesRoot,
  readJson,
  runCaptured,
  sha256File,
  sha256Tree,
  snapshotRoot,
  vendorRoot,
} from "./lib.mjs";

const force = process.argv.includes("--force");
const json = process.argv.includes("--json");
const stampPath = join(generatedRoot, ".prepared.json");
const metadata = await readJson(join(vendorRoot, "UPSTREAM.json"));
const policyPath = join(vendorRoot, "dependency-policy.json");
const seriesPath = join(patchesRoot, "series");

const snapshotSha256 = await sha256Tree(snapshotRoot);
if (snapshotSha256 !== metadata.snapshotSha256) {
  throw new Error(
    `Refusing to prepare a dirty upstream snapshot: expected ${metadata.snapshotSha256}, received ${snapshotSha256}`,
  );
}

const patchNames = (await readFile(seriesPath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

for (const patchName of patchNames) {
  if (patchName.includes("..") || resolve(patchesRoot, patchName).startsWith(`${patchesRoot}/`) === false) {
    throw new Error(`Invalid patch path in series: ${patchName}`);
  }
}

const inputHash = createHash("sha256");
inputHash.update(snapshotSha256);
inputHash.update(await sha256File(policyPath));
inputHash.update(await sha256File(seriesPath));
for (const patchName of patchNames) {
  inputHash.update(patchName);
  inputHash.update(await sha256File(join(patchesRoot, patchName)));
}
const inputFingerprint = inputHash.digest("hex");

if (!force) {
  try {
    const previousStamp = JSON.parse(await readFile(stampPath, "utf8"));
    if (previousStamp.inputFingerprint === inputFingerprint) {
      const payload = { ...previousStamp, reused: true };
      process.stdout.write(`${json ? JSON.stringify(payload) : `Node Banana runtime is ready (${previousStamp.generatedSha256})`}\n`);
      process.exit(0);
    }
  } catch {
    // Missing or invalid generated state is rebuilt below.
  }
}

await rm(generatedRoot, { recursive: true, force: true });
await mkdir(generatedRoot, { recursive: true });
await cp(snapshotRoot, generatedRoot, { recursive: true, verbatimSymlinks: true });
await mkdir(join(generatedRoot, "src/leesfield"), { recursive: true });

for (const patchName of patchNames) {
  const patchPath = join(patchesRoot, patchName);
  runCaptured("patch", ["--batch", "--forward", "--fuzz=0", "--dry-run", "-p1", "-i", patchPath], {
    cwd: generatedRoot,
  });
  runCaptured("patch", ["--batch", "--forward", "--fuzz=0", "-p1", "-i", patchPath], {
    cwd: generatedRoot,
  });
}

const generatedSha256 = await sha256Tree(generatedRoot, {
  exclude: [".prepared.json"],
});
const stamp = {
  schemaVersion: 1,
  upstreamVersion: metadata.version,
  upstreamCommit: metadata.commit,
  inputFingerprint,
  generatedSha256,
  patches: patchNames,
};
await writeFile(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");

process.stdout.write(
  `${json ? JSON.stringify({ ...stamp, reused: false }) : `Prepared Node Banana runtime (${generatedSha256})`}\n`,
);
