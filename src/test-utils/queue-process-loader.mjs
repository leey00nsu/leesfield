// Compile repository TypeScript only for the isolated OS-process queue fixture.
import ts from "typescript";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";
import { createRequire } from "node:module";

export async function resolve(specifier, context, next) {
  const local = specifier.startsWith("@/") ? pathToFileURL(resolvePath("src", specifier.slice(2))).href
    : specifier.startsWith(".") && context.parentURL ? new URL(specifier, context.parentURL).href : null;
  if (local) for (const suffix of ["", ".ts", ".tsx", ".mjs"]) {
    try { await access(fileURLToPath(local + suffix)); return { url: local + suffix, shortCircuit: true }; }
    catch { /* Try the next repository extension. */ }
  }
  try { return await next(specifier, context); }
  catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND" || !context.parentURL) throw error;
    return { url: pathToFileURL(createRequire(context.parentURL).resolve(specifier)).href, shortCircuit: true };
  }
}
export async function load(url, context, next) {
  if (/\.tsx?$/.test(url) && !url.includes("/node_modules/")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    return { format: "module", shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    }).outputText };
  }
  if (url.endsWith(".json") && !url.includes("/node_modules/"))
    return { format: "module", shortCircuit: true, source: "export default " + await readFile(fileURLToPath(url), "utf8") };
  return next(url, context);
}
