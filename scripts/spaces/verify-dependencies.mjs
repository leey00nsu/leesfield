import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const archiveRoots = ["third_party/node-banana", "scripts/node-banana"];
const removedRoots = [".generated/node-banana-runtime", "src/features/node-studio/runtime/node-banana"];
const retainedNotice = /^(?:README.*|LICENSE(?:\..*)?|(?:THIRD_PARTY_)?NOTICES?(?:\..*)?)$/i;

function forbiddenReference(value) {
  const normalized = value.replaceAll("\\", "/");
  return /@node-banana-runtime(?:[/\s"'`:]|$)|vendor:node-banana|(?:^|[/\s"'`])(?:node-banana(?:-runtime)?|\.generated\/node-banana-runtime|third_party\/node-banana|scripts\/node-banana|runtime\/node-banana)(?:[/\s"'`:@]|$)/.test(normalized);
}

async function filesUnder(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

function literalValue(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

function stringsWithin(node) {
  const strings = [];
  function visit(child) {
    const value = literalValue(child);
    if (value !== null) strings.push(value);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return strings;
}

/** Inspect module edges, test mocks, build aliases, and process invocations, not prose. */
export function checkSource(file, source, { config = false } = {}) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const errors = new Set();
  function check(value) {
    if (value !== null && forbiddenReference(value)) errors.add(`${file}: forbidden editor runtime reference: ${value}`);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) check(literalValue(node.moduleSpecifier));
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      check(literalValue(node.moduleReference.expression));
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) check(literalValue(node.argument.literal));
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression) ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || /^(?:require|mock|doMock|unmock|doUnmock)$/.test(name)
        || (name === "resolve" && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(parsed) === "require")) {
        check(literalValue(node.arguments[0]));
      }
      if (/^(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|execFileAsync|runProcess|runCaptured)$/.test(name)) {
        for (const argument of node.arguments) for (const value of stringsWithin(argument)) check(value);
      }
    }
    if (config) check(literalValue(node));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return [...errors];
}

export async function verifyDependencies(root = projectRoot) {
  const errors = [];
  const rootFiles = await readdir(root);
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (forbiddenReference(name) || forbiddenReference(command)) errors.push(`package.json: forbidden editor preparation script: ${name}`);
  }
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
      if (/node-banana/i.test(`${name} ${version}`)) errors.push(`package.json: forbidden editor dependency: ${name}`);
    }
  }

  for (const archiveRoot of archiveRoots) {
    for (const file of await filesUnder(join(root, archiveRoot))) {
      if (!retainedNotice.test(file.split(/[\\/]/).at(-1))) errors.push(`Only archival README/license/notices may remain: ${relative(root, file)}`);
    }
  }
  for (const removedRoot of removedRoots) {
    if ((await filesUnder(join(root, removedRoot))).length) errors.push(`Removed editor runtime tree remains: ${removedRoot}`);
  }

  const files = rootFiles.filter(file => /\.(?:config\.[cm]?[jt]s|config\.json)$/.test(file) || /^(?:tsconfig.*\.json|pnpm-(?:lock|workspace)\.yaml)$/.test(file))
    .map(file => join(root, file));
  for (const directory of ["src", "scripts", ".storybook", ".github", ".husky"]) {
    files.push(...await filesUnder(join(root, directory)));
  }
  let filesChecked = 0;
  for (const file of new Set(files)) {
    if (retainedNotice.test(file.split(/[\\/]/).at(-1))) continue;
    const filePath = relative(root, file).replaceAll("\\", "/");
    const extension = extname(file);
    const config = !filePath.includes("/") || filePath.startsWith(".storybook/");
    const commandFile = filePath.startsWith(".husky/") || [".yml", ".yaml", ".sh"].includes(extension);
    const styleFile = [".css", ".scss"].includes(extension);
    if (!sourceExtensions.has(extension) && !commandFile && !styleFile && !(config && extension === ".json")) continue;
    const source = await readFile(file, "utf8");
    filesChecked++;
    if (commandFile || (config && extension === ".json")) {
      // JSON/YAML/shell are configuration inputs. Archival Markdown is deliberately excluded.
      if (forbiddenReference(source)) errors.push(`${filePath}: forbidden editor runtime configuration`);
    } else if (styleFile) {
      for (const match of source.matchAll(/@(?:import|use|forward)\s+(?:url\(\s*)?["']([^"']+)["']|url\(\s*["']?([^)'"\s]+)/g)) {
        if (forbiddenReference(match[1] ?? match[2])) errors.push(`${filePath}: forbidden editor runtime stylesheet reference`);
      }
    } else {
      errors.push(...checkSource(filePath, source, { config }));
    }
  }
  return { filesChecked, errors: [...new Set(errors)] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyDependencies();
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  process.stdout.write(`Native editor dependencies verified (${result.filesChecked} source/config files; archival notices retained)\n`);
}
