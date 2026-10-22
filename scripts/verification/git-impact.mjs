import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const execute = promisify(execFile);
const sourceExtensions = [".ts", ".tsx", ".mjs", ".js", ".jsx", ".mts", ".cts", ".cjs", ".json", ".css", ".scss", ".svg"];
async function git(root, args) {
  return (await execute("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" })).stdout;
}

async function hashDiff(root, base, digest, cached = false) {
  // Large migrations can delete a whole vendored tree. Hash the patch as a
  // stream instead of buffering it or dropping its change range on maxBuffer.
  await new Promise((resolve, reject) => {
    digest.update(cached ? "\0index\0" : "\0worktree\0");
    const child = spawn("git", ["diff", "--no-ext-diff", "--no-textconv", "--binary", ...(cached ? ["--cached"] : []), base, "--"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let errorText = "";
    child.stdout.on("data", chunk => digest.update(chunk));
    child.stderr.on("data", chunk => { if (errorText.length < 4_096) errorText += chunk; });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(`Git diff failed: ${errorText.slice(0, 4_096)}`)));
  });
}

async function hashUntracked(root, files, digest) {
  for (const file of [...files].sort()) {
    const absolute = path.join(root, file), stat = await lstat(absolute);
    if (!stat.isFile()) throw new Error(`Untracked non-regular file requires review: ${file}`);
    digest.update("\0" + file + "\0" + stat.size + "\0");
    for await (const chunk of createReadStream(absolute)) digest.update(chunk);
  }
}

export function parseNameStatus(value) {
  const fields = value.split("\0"), changes = [];
  for (let index = 0; index < fields.length && fields[index]; index += 1) {
    const status = fields[index], first = fields[++index];
    if (!first) throw new Error("Incomplete Git change record");
    if (/^[RC]/.test(status)) {
      const second = fields[++index]; if (!second) throw new Error("Incomplete Git rename record");
      changes.push({ status, oldPath: first, path: second });
    } else changes.push({ status, path: first });
  }
  return changes;
}

export async function readGitImpact(root, baseRef = "main") {
  let head = null;
  try {
    if (await realpath((await git(root, ["rev-parse", "--show-toplevel"])).trim()) !== await realpath(root)) throw new Error("Project root is not the Git root");
    head = (await git(root, ["rev-parse", "HEAD"])).trim();
    const base = (await git(root, ["merge-base", "HEAD", baseRef])).trim();
    if (!base) throw new Error("No merge-base");
    const tracked = await git(root, ["diff", "--name-status", "-z", "--find-renames", base, "--"]);
    const staged = await git(root, ["diff", "--cached", "--name-status", "-z", "--find-renames", base, "--"]);
    const untracked = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
    const changes = [...new Map([...parseNameStatus(tracked), ...parseNameStatus(staged), ...untracked.map(file => ({ status: "?", path: file }))]
      .map(change => [JSON.stringify(change), change])).values()];
    const digest = createHash("sha256").update(head).update(base);
    await hashDiff(root, base, digest);
    await hashDiff(root, base, digest, true);
    await hashUntracked(root, untracked, digest);
    return { head, baseRef, base, changes, fingerprint: digest.digest("hex"), rangeProblem: null };
  } catch (error) {
    let fingerprint = null;
    if (head) {
      try {
        const digest = createHash("sha256").update(head);
        await hashDiff(root, "HEAD", digest);
        await hashDiff(root, "HEAD", digest, true);
        const untracked = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).sort();
        await hashUntracked(root, untracked, digest);
        fingerprint = digest.digest("hex");
      } catch { /* Without a stable tree snapshot, the runner cannot certify success. */ }
    }
    return { head, baseRef, base: null, changes: [], fingerprint, rangeProblem: error.message };
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(file));
    else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|css|scss)$/.test(entry.name) && !/\.(?:test|spec|stories)\./.test(entry.name)) files.push(file);
  }
  return files;
}

export async function readImportGraph(root) {
  const reverseImports = new Map(), unresolvedImports = [];
  const relative = file => path.relative(root, file).replaceAll(path.sep, "/");
  const exists = async file => { try { return (await lstat(file)).isFile(); } catch { return false; } };
  async function connect(importer, specifier) {
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return;
    const base = specifier.startsWith("@/") ? path.resolve(root, "src", specifier.slice(2)) : path.resolve(path.dirname(importer), specifier);
    if (!base.startsWith(path.resolve(root) + path.sep)) { unresolvedImports.push({ importer: relative(importer) }); return; }
    const alternatives = [base, ...sourceExtensions.map(extension => base + extension), ...sourceExtensions.map(extension => path.join(base, "index" + extension))];
    if (/\.[cm]?jsx?$/.test(base)) alternatives.push(base.replace(/\.[cm]?jsx?$/, ".ts"), base.replace(/\.[cm]?jsx?$/, ".tsx"));
    let target;
    for (const file of alternatives) if (await exists(file)) { target = relative(file); break; }
    if (!target) { unresolvedImports.push({ importer: relative(importer), candidates: alternatives.map(relative) }); return; }
    const consumers = reverseImports.get(target) ?? new Set(); consumers.add(relative(importer)); reverseImports.set(target, consumers);
  }
  for (const file of await sourceFiles(path.join(root, "src"))) {
    const source = await readFile(file, "utf8");
    if (/\.(?:css|scss)$/.test(file)) {
      for (const match of source.matchAll(/@(?:import|use|forward)\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
        const specifier = match[1];
        await connect(file, /\.(?:css|scss)$/.test(specifier) && !specifier.startsWith("@/") && !specifier.startsWith(".") ? "./" + specifier : specifier);
      }
      continue;
    }
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const imports = [];
    function visit(node) {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(parsed) === "require") ? node.arguments[0] : undefined;
      if (specifier) {
        if (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier)) imports.push(specifier.text);
        else if (ts.isTemplateExpression(specifier) && /^(?:@\/|\.)/.test(specifier.head.text)) {
          const prefix = specifier.head.text.startsWith("@/") ? path.resolve(root, "src", specifier.head.text.slice(2)) : path.resolve(path.dirname(file), specifier.head.text);
          unresolvedImports.push({ importer: relative(file), prefix: relative(prefix) + (specifier.head.text.endsWith("/") ? "/" : "") });
        } else unresolvedImports.push({ importer: relative(file) });
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    for (const specifier of imports) await connect(file, specifier);
  }
  return { reverseImports, unresolvedImports };
}
