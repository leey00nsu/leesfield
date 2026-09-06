import { join } from "node:path";
import {
  readJson,
  sha256File,
  sha256Tree,
  snapshotRoot,
  vendorRoot,
} from "./lib.mjs";

const metadata = await readJson(join(vendorRoot, "UPSTREAM.json"));
const snapshotSha256 = await sha256Tree(snapshotRoot);
const licenseSha256 = await sha256File(join(snapshotRoot, "LICENSE"));

if (process.argv.includes("--print")) {
  process.stdout.write(`${snapshotSha256}\n`);
  process.exit(0);
}

const upstreamPackage = await readJson(join(snapshotRoot, "package.json"));
const errors = [];

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
  `${metadata.name}@${metadata.version} snapshot verified (${snapshotSha256})\n`,
);
