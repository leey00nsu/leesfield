import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { runCaptured } from "./lib.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

process.stdout.write(`${runCaptured(node, [join(directory, "verify-snapshot.mjs")])}\n`);
const first = JSON.parse(
  runCaptured(node, [join(directory, "prepare.mjs"), "--force", "--json"]),
);
const second = JSON.parse(
  runCaptured(node, [join(directory, "prepare.mjs"), "--force", "--json"]),
);

if (first.generatedSha256 !== second.generatedSha256) {
  throw new Error(
    `Generated runtime is not reproducible: ${first.generatedSha256} != ${second.generatedSha256}`,
  );
}

process.stdout.write(`Generated runtime reproduced (${second.generatedSha256})\n`);
process.stdout.write(`${runCaptured(node, [join(directory, "verify-imports.mjs")])}\n`);
process.stdout.write(`${runCaptured(node, [join(directory, "verify-licenses.mjs")])}\n`);
process.stdout.write(`${runCaptured(node, [join(directory, "verify-vulnerabilities.mjs")])}\n`);
