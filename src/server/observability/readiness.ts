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
};

function workerStatus(): ReadinessSnapshot["workers"] {
  const state = getWorkerSupervisorState();
  if (state.stopping) return "stopping";
  const workers = [state.generation, state.mediaOperation, state.cleanup];
  if (
    !state.started ||
    workers.some((worker) => {
      if (!worker.started || worker.stopping) return true;
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
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
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
    await Promise.race([databaseCheck, timeout]);
    return "ok" as const;
  } catch {
    return "failed" as const;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getReadinessSnapshot(): Promise<ReadinessSnapshot> {
  const [database, workers] = await Promise.all([
    databaseStatus(),
    Promise.resolve().then(workerStatus),
  ]);
  return {
    ready: database === "ok" && workers === "ok",
    database,
    workers,
  };
}
