import { realpathSync, statSync } from "node:fs";
import path from "node:path";

// These suites reach the real database despite not using the PostgreSQL suffix.
// Keep mixed suites together so their non-DB cases are still collected once.
const databaseTestExceptions = [
  "src/server/generation-graph/generation-graph-migration.test.ts",
  "src/server/media-assets/node-studio-e2e-durable-generation.test.ts",
  "src/server/image-generation/storage/adapters/leemage-storage-adapter.test.ts",
  "src/server/audio-generation/storage/adapters/leemage-storage-adapter.test.ts",
  "src/server/video-generation/storage/adapters/leemage-storage-adapter.test.ts",
];

const databaseTestGlobs = [
  "**/*-postgres.integration.test.ts",
  ...databaseTestExceptions,
];

// The runner supplies exact paths separately from Vitest's substring CLI filters.
export const productionTestTargetsEnv = "PRODUCTION_INTEGRATION_TEST_TARGETS";

/** @param {string[]} files */
export function validateTestFiles(files, rootDirectory = process.cwd()) {
  if (!Array.isArray(files) || files.some(file =>
    typeof file !== "string" ||
    !file.startsWith("src/") || !/\.test\.tsx?$/.test(file) || file.includes("\\") ||
    file.split("/").some(segment => !segment || [".", "..", "node_modules", ".git"].includes(segment))
  )) {
    throw new Error("Only existing, repository-relative src/**/*.test.ts(x) file paths are accepted");
  }

  const sourceRoot = realpathSync(path.resolve(rootDirectory, "src"));
  return [...new Set(files)].map(file => {
    const absolutePath = path.resolve(rootDirectory, file);
    let resolvedPath;
    let isFile;
    try {
      resolvedPath = realpathSync(absolutePath);
      isFile = statSync(resolvedPath).isFile();
    } catch {
      throw new Error(`Test file does not exist: ${file}`);
    }
    const relativePath = path.relative(sourceRoot, resolvedPath);
    if (!isFile || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      throw new Error(`Test path must be a file inside src/: ${file}`);
    }
    return file;
  });
}

export function getTestSuiteSelection(environment = process.env, rootDirectory = process.cwd()) {
  for (const file of databaseTestExceptions) {
    try {
      validateTestFiles([file], rootDirectory);
    } catch (cause) {
      throw new Error(`Stale database test exception: ${file}. Update scripts/production/test-suite-groups.mjs.`, { cause });
    }
  }

  const targets = environment[productionTestTargetsEnv];
  if (environment.PRODUCTION_INTEGRATION_TEST !== "1") {
    if (targets) throw new Error(`${productionTestTargetsEnv} requires PRODUCTION_INTEGRATION_TEST=1`);
    return { exclude: [...databaseTestGlobs] };
  }

  if (!targets) return { include: [...databaseTestGlobs], exclude: [] };

  let files;
  try {
    files = JSON.parse(targets);
  } catch {
    throw new Error(`${productionTestTargetsEnv} must be a JSON array of test file paths`);
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`${productionTestTargetsEnv} must be a non-empty JSON array of test file paths`);
  }

  return {
    // Next.js route names contain brackets/parentheses; use literal path globs.
    include: validateTestFiles(files, rootDirectory).map(file => file.replace(/[*?{}()[\]!+@]/g, "\\$&")),
    exclude: [],
  };
}
