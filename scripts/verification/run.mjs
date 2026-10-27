import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapVerification } from "./bootstrap.mjs";

await bootstrapVerification({ root: resolve(dirname(fileURLToPath(import.meta.url)), "../.."), args: process.argv.slice(2) });
