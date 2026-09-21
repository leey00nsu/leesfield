import {
  buildPgEnvironment,
  databaseTargetSummary,
  parseDatabaseUrl,
  ProductionDbToolError,
  runPgTool,
} from "./db-tools.mjs";

const VERIFY_SQL = `
SELECT json_build_object(
  'GenerationGraph', (SELECT COUNT(*)::int FROM "GenerationGraph"),
  'MediaAsset', (SELECT COUNT(*)::int FROM "MediaAsset"),
  'ImageGeneration', (SELECT COUNT(*)::int FROM "ImageGeneration"),
  'VideoGeneration', (SELECT COUNT(*)::int FROM "VideoGeneration"),
  'AudioGeneration', (SELECT COUNT(*)::int FROM "AudioGeneration"),
  'MediaCleanupTask', (SELECT COUNT(*)::int FROM "MediaCleanupTask")
)::text;
`;

function help() {
  console.log(`Usage: pnpm db:verify-restore

Required environment:
  RESTORE_DATABASE_URL  isolated PostgreSQL target
  RESTORE_TARGET        must be exactly isolated
  RESTORE_CONFIRM       must be YES`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    help();
    return;
  }
  if (process.env.RESTORE_TARGET?.trim() !== "isolated" || process.env.RESTORE_CONFIRM !== "YES") {
    throw new ProductionDbToolError(
      "RESTORE_TARGET_REQUIRED",
      "RESTORE_TARGET=isolated and RESTORE_CONFIRM=YES are required",
    );
  }
  const target = parseDatabaseUrl(process.env.RESTORE_DATABASE_URL, "RESTORE_DATABASE_URL");
  const output = await runPgTool(
    process.env.PSQL_BIN ?? "psql",
    ["--no-psqlrc", "--no-password", "--tuples-only", "--no-align", "--command", VERIFY_SQL],
    { environment: buildPgEnvironment(target), capture: true },
  );
  const json = output.trim();
  if (!json.startsWith("{") || !json.endsWith("}")) {
    throw new ProductionDbToolError("RESTORE_VERIFY_INVALID", "restore verification returned an invalid row summary");
  }
  console.log(JSON.stringify({
    target: databaseTargetSummary(target),
    rows: JSON.parse(json),
  }));
}

main().catch((error) => {
  const message = error instanceof ProductionDbToolError
    ? error.message
    : "restore verification failed";
  console.error(`[db-verify-restore] ${message}`);
  process.exitCode = 1;
});
