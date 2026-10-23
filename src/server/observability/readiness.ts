import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { getWorkerSupervisorState } from "@/server/runtime/worker-supervisor";

import { measureDatabase } from "./request-observability";

export const READINESS_TIMEOUT_MS = 2_000;
export const WORKER_HEARTBEAT_TIMEOUT_SECONDS = 10;

export type ReadinessSnapshot = {
  ready: boolean;
  database: "ok" | "failed";
  workers: "ok" | "not_ready" | "stopping";
  queue: "shared" | "paused" | "unavailable";
};

function workerStatus(): ReadinessSnapshot["workers"] {
  const state = getWorkerSupervisorState();
  if (state.stopping) return "stopping";
  const workers = [state.queue];
  if (
    !state.started ||
    workers.some((worker) => {
      if (!worker.started || worker.stopping || !worker.schemaReady) return true;
      const heartbeatAgeSeconds = (worker as { heartbeatAgeSeconds?: number | null })
        .heartbeatAgeSeconds;
      return heartbeatAgeSeconds !== undefined &&
        (heartbeatAgeSeconds === null || heartbeatAgeSeconds > WORKER_HEARTBEAT_TIMEOUT_SECONDS);
    })
  ) {
    return "not_ready";
  }
  return "ok";
}

async function databaseStatus() {
  const databaseCheck = measureDatabase("health.readiness", async () => {
    const [state] = await prisma.$queryRaw<Array<{ mode: string; migrationVerified: boolean }>>(Prisma.sql`SELECT "mode", "migrationVerified" FROM "QueueRuntime" WHERE "id" = 1`);
    if (!state) throw new Error("QUEUE_RUNTIME_MISSING");
    return state.mode === "shared" && state.migrationVerified ? "shared" as const : "paused" as const;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("READINESS_DATABASE_TIMEOUT")),
      READINESS_TIMEOUT_MS,
    );
    timer.unref?.();
  });

  try {
    const queue = await Promise.race([databaseCheck, timeout]);
    return { database: "ok" as const, queue };
  } catch {
    return { database: "failed" as const, queue: "unavailable" as const };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getReadinessSnapshot(): Promise<ReadinessSnapshot> {
  const [{ database, queue }, workers] = await Promise.all([
    databaseStatus(),
    Promise.resolve().then(workerStatus),
  ]);
  return {
    ready: database === "ok" && workers === "ok" && queue === "shared",
    database,
    workers,
    queue,
  };
}
