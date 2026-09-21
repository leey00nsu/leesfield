import { randomUUID } from "node:crypto";

import {
  buildPgEnvironment,
  databaseTargetSummary,
  displayPath,
  parseDatabaseUrl,
  finishOutput,
  prepareOutputPath,
  ProductionDbToolError,
  removeIfPresent,
  runPgTool,
  temporaryOutputPath,
} from "./db-tools.mjs";

function help() {
  console.log(`Usage: pnpm db:backup [options]

Environment:
  BACKUP_DATABASE_URL  source PostgreSQL URL (defaults to DATABASE_URL)
  BACKUP_FILE          output path (defaults to ./backups/leesfield-<timestamp>.dump)
  BACKUP_OVERWRITE     set to YES to replace an existing output

Options:
  --output <path>      output path
  --force              replace an existing output
  --dry-run            print a sanitized plan without connecting
  --help`);
}

function parseArgs(argv) {
  const result = { output: null, force: false, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--force") result.force = true;
    else if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--output") {
      result.output = argv[index + 1];
      index += 1;
    } else {
      throw new ProductionDbToolError("INVALID_ARGUMENT", `unknown option: ${arg}`);
    }
  }
  return result;
}

function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
  return `./backups/leesfield-${stamp}-${randomUUID().slice(0, 8)}.dump`;
}

function dumpArgs(outputPath) {
  return [
    "--format=custom",
    "--compress=6",
    "--no-owner",
    "--no-privileges",
    "--no-password",
    "--file",
    outputPath,
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  const source = parseDatabaseUrl(
    process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL,
    "BACKUP_DATABASE_URL",
  );
  const outputPath = await prepareOutputPath(
    args.output ?? process.env.BACKUP_FILE ?? defaultOutputPath(),
    args.force || process.env.BACKUP_OVERWRITE === "YES",
  );
  const commandArgs = dumpArgs(outputPath);

  if (args.dryRun) {
    console.log(JSON.stringify({
      tool: "pg_dump",
      target: databaseTargetSummary(source),
      output: displayPath(outputPath),
      args: commandArgs,
    }));
    return;
  }

  const temporaryPath = temporaryOutputPath(outputPath);
  try {
    await runPgTool(
      process.env.PG_DUMP_BIN ?? "pg_dump",
      dumpArgs(temporaryPath),
      { environment: buildPgEnvironment(source) },
    );
    await finishOutput(temporaryPath, outputPath);
  } catch (error) {
    await removeIfPresent(temporaryPath);
    throw error;
  }

  console.log(`backup created: ${displayPath(outputPath)}`);
}

main().catch((error) => {
  const message = error instanceof ProductionDbToolError
    ? error.message
    : "backup failed";
  console.error(`[db-backup] ${message}`);
  process.exitCode = 1;
});
