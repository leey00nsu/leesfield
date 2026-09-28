import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generatedRoot,
  readJson,
  sha256File,
  sha256Tree,
  snapshotRoot,
  vendorRoot,
} from "./lib.mjs";

const force = process.argv.includes("--force");
const json = process.argv.includes("--json");
const stampPath = join(generatedRoot, ".prepared.json");
const metadata = await readJson(join(vendorRoot, "SOURCE.json"));
const policyPath = join(vendorRoot, "dependency-policy.json");

const snapshotSha256 = await sha256Tree(snapshotRoot);
if (snapshotSha256 !== metadata.snapshotSha256) {
  throw new Error(
    `Refusing to prepare a dirty fork snapshot: expected ${metadata.snapshotSha256}, received ${snapshotSha256}`,
  );
}

const inputHash = createHash("sha256");
inputHash.update(snapshotSha256);
inputHash.update(await sha256File(policyPath));
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

const generatedSha256 = await sha256Tree(generatedRoot, {
  exclude: [".prepared.json"],
});
const stamp = {
  schemaVersion: 1,
  upstreamVersion: metadata.version,
  upstreamCommit: metadata.upstream.commit,
  forkCommit: metadata.fork.commit,
  inputFingerprint,
  generatedSha256,
};
await writeFile(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");

process.stdout.write(
  `${json ? JSON.stringify({ ...stamp, reused: false }) : `Prepared Node Banana runtime (${generatedSha256})`}\n`,
);
