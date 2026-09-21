import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  databaseTargetSummary,
  parseDatabaseUrl,
  runPgTool,
} from "./db-tools.mjs";

const execFileAsync = promisify(execFile);
const backupScript = resolve("scripts/production/backup-db.mjs");
const restoreScript = resolve("scripts/production/restore-db.mjs");

async function runScript(script, args, environment) {
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], {
      env: { ...process.env, ...environment },
      maxBuffer: 128 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

describe("production database tools", () => {
  it("terminates a PostgreSQL client process that exceeds its deadline", async () => {
    await expect(
      runPgTool(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: "POSTGRES_TOOL_TIMEOUT" });
  });

  it("parses a PostgreSQL URL without including the password in its target summary", () => {
    const target = parseDatabaseUrl(
      "postgresql://backup_user:top-secret@db.example.test:5432/leesfield?sslmode=require",
    );

    expect(target.password).toBe("top-secret");
    expect(databaseTargetSummary(target)).toEqual({
      host: "db.example.test",
      port: 5432,
      database: "leesfield",
      user: "backup_user",
      sslmode: "require",
    });
    expect(JSON.stringify(databaseTargetSummary(target))).not.toContain("top-secret");
  });

  it("prints a sanitized backup dry-run plan", async () => {
    const directory = await mkdtemp(join(tmpdir(), "leesfield-db-tools-"));
    try {
      const result = await runScript(backupScript, ["--dry-run"], {
        DATABASE_URL: "postgresql://backup_user:backup-secret@db.example.test:5432/leesfield",
        BACKUP_FILE: join(directory, "backup.dump"),
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('"tool":"pg_dump"');
      expect(result.stdout).not.toContain("backup-secret");
      expect(result.stdout).not.toContain("postgresql://");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires an explicitly isolated restore target and hides database credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "leesfield-db-tools-"));
    const backupFile = join(directory, "backup.dump");
    try {
      await writeFile(backupFile, "synthetic backup");
      const result = await runScript(restoreScript, ["--dry-run", "--backup", backupFile], {
        DATABASE_URL: "postgresql://source_user:source-secret@source.example.test:5432/leesfield",
        RESTORE_DATABASE_URL: "postgresql://restore_user:restore-secret@restore.example.test:5432/leesfield_restore",
        RESTORE_TARGET: "isolated",
        RESTORE_CONFIRM: "YES",
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('"tool":"pg_restore"');
      expect(result.stdout).toContain('"--dbname"');
      expect(result.stdout).toContain("leesfield_restore");
      expect(result.stdout).toContain("--single-transaction");
      expect(result.stdout).not.toContain("source-secret");
      expect(result.stdout).not.toContain("restore-secret");
      expect(result.stdout).not.toContain("postgresql://");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses a restore target that matches the configured source database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "leesfield-db-tools-"));
    const backupFile = join(directory, "backup.dump");
    try {
      await writeFile(backupFile, "synthetic backup");
      const result = await runScript(restoreScript, ["--dry-run", "--backup", backupFile], {
        DATABASE_URL: "postgresql://source_user:source-secret@db.example.test:5432/leesfield",
        RESTORE_DATABASE_URL: "postgresql://restore_user:restore-secret@db.example.test:5432/leesfield",
        RESTORE_TARGET: "isolated",
        RESTORE_CONFIRM: "YES",
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("restore target must be a different database");
      expect(result.stderr).not.toContain("source-secret");
      expect(result.stderr).not.toContain("restore-secret");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
