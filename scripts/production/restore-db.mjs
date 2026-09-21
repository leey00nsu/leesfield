import {
  assertRegularFile,
  buildPgEnvironment,
  databaseTargetKey,
  databaseTargetSummary,
  displayPath,
  parseDatabaseUrl,
  ProductionDbToolError,
  runPgTool,
  safePath,
} from "./db-tools.mjs";

function help() {
  console.log(`Usage: pnpm db:restore -- --backup <path>

Required environment:
  RESTORE_DATABASE_URL  target PostgreSQL URL; DATABASE_URL is never used as a fallback
  RESTORE_TARGET        must be exactly isolated
  RESTORE_CONFIRM       must be YES, or pass --confirm

Options:
  --backup <path>       custom-format pg_dump file
  --clean               clean objects first; also requires RESTORE_ALLOW_CLEAN=YES
  --confirm             confirm the isolated target
  --dry-run             print a sanitized plan without connecting
  --help`);
}

function parseArgs(argv) {
  const result = { backup: null, clean: false, confirm: false, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--clean") result.clean = true;
    else if (arg === "--confirm") result.confirm = true;
    else if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--backup") {
      result.backup = argv[index + 1];
      index += 1;
    } else {
      throw new ProductionDbToolError("INVALID_ARGUMENT", `unknown option: ${arg}`);
    }
  }
  return result;
}

function restoreArgs(backupPath, database, clean) {
  return [
    "--dbname",
    database,
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    "--no-privileges",
    "--no-password",
    ...(clean ? ["--clean", "--if-exists"] : []),
    backupPath,
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  const targetMode = process.env.RESTORE_TARGET?.trim();
  if (targetMode !== "isolated") {
    throw new ProductionDbToolError(
      "RESTORE_TARGET_REQUIRED",
      "RESTORE_TARGET=isolated is required; production restore is intentionally unsupported by this command",
    );
  }
  if (!args.confirm && process.env.RESTORE_CONFIRM !== "YES") {
    throw new ProductionDbToolError(
      "RESTORE_CONFIRM_REQUIRED",
      "set RESTORE_CONFIRM=YES or pass --confirm after checking the isolated target",
    );
  }
  if (args.clean && process.env.RESTORE_ALLOW_CLEAN !== "YES") {
    throw new ProductionDbToolError(
      "RESTORE_CLEAN_CONFIRM_REQUIRED",
      "RESTORE_ALLOW_CLEAN=YES is required for --clean",
    );
  }

  const backupPath = safePath(args.backup ?? process.env.BACKUP_FILE, "backup file");
  await assertRegularFile(backupPath, "backup file");
  const target = parseDatabaseUrl(process.env.RESTORE_DATABASE_URL, "RESTORE_DATABASE_URL");
  const sourceUrl = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (sourceUrl) {
    const source = parseDatabaseUrl(sourceUrl, "backup source URL");
    if (databaseTargetKey(source) === databaseTargetKey(target)) {
      throw new ProductionDbToolError(
        "RESTORE_TARGET_MATCHES_SOURCE",
        "restore target must be a different database from the configured source",
      );
    }
  }

  const commandArgs = restoreArgs(displayPath(backupPath), target.database, args.clean);
  if (args.dryRun) {
    console.log(JSON.stringify({
      tool: "pg_restore",
      target: databaseTargetSummary(target),
      backup: displayPath(backupPath),
      clean: args.clean,
      args: commandArgs,
    }));
    return;
  }

  await runPgTool(
    process.env.PG_RESTORE_BIN ?? "pg_restore",
    restoreArgs(backupPath, target.database, args.clean),
    { environment: buildPgEnvironment(target) },
  );
  console.log(`restore completed for isolated target: ${displayPath(target.database)}`);
}

main().catch((error) => {
  const message = error instanceof ProductionDbToolError
    ? error.message
    : "restore failed";
  console.error(`[db-restore] ${message}`);
  process.exitCode = 1;
});
