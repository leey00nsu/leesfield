import { join } from "node:path";
import {
  readJson,
  sha256File,
  sha256Tree,
  snapshotRoot,
  vendorRoot,
} from "./lib.mjs";

const metadata = await readJson(join(vendorRoot, "SOURCE.json"));
const snapshotSha256 = await sha256Tree(snapshotRoot);
const licenseSha256 = await sha256File(join(snapshotRoot, "LICENSE"));

if (process.argv.includes("--print")) {
  process.stdout.write(`${snapshotSha256}\n`);
  process.exit(0);
}

const upstreamPackage = await readJson(join(snapshotRoot, "package.json"));
const errors = [];

if (metadata.schemaVersion !== 2 || !metadata.upstream || !metadata.fork) {
  errors.push("source provenance schema is invalid");
}
if (typeof metadata.fork?.repository !== "string" || !metadata.fork.repository.startsWith("https://github.com/")) {
  errors.push("source provenance must identify the published fork repository");
}
for (const [label, value] of [
  ["upstream commit", metadata.upstream?.commit],
  ["upstream tree", metadata.upstream?.tree],
  ["fork commit", metadata.fork?.commit],
  ["fork tree", metadata.fork?.tree],
]) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    errors.push(`${label} must be a full Git SHA-1`);
  }
}

if (metadata.snapshotSha256 !== snapshotSha256) {
  errors.push(
    `snapshot SHA-256 mismatch: expected ${metadata.snapshotSha256}, received ${snapshotSha256}`,
  );
}
if (metadata.licenseSha256 !== licenseSha256) {
  errors.push(
    `license SHA-256 mismatch: expected ${metadata.licenseSha256}, received ${licenseSha256}`,
  );
}
if (upstreamPackage.name !== metadata.name || upstreamPackage.version !== metadata.version) {
  errors.push(
    `package identity mismatch: expected ${metadata.name}@${metadata.version}, received ${upstreamPackage.name}@${upstreamPackage.version}`,
  );
}

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}

process.stdout.write(
  `${metadata.name}@${metadata.version} fork snapshot verified (${snapshotSha256})\n`,
);
