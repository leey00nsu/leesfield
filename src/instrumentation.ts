export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { getServerEnv } = await import("@/server/runtime/env");
  getServerEnv();

  const { startWorkerSupervisor } = await import(
    "@/server/runtime/worker-supervisor"
  );
  startWorkerSupervisor();
}
