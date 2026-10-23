import { appendFile } from "node:fs/promises";
import { prisma } from "@/server/db/prisma";
import { createQueueRunner } from "@/server/job-queue/job-queue-runner";
import { createWorkerSupervisor } from "@/server/runtime/worker-supervisor";

if (process.env.PRODUCTION_INTEGRATION_TEST !== "1" || !process.env.QUEUE_PROCESS_TRACE) throw new Error("ISOLATED_QUEUE_FIXTURE_REQUIRED");
const trace = value => appendFile(process.env.QUEUE_PROCESS_TRACE, JSON.stringify({ ...value, pid: process.pid, time: Date.now() }) + "\n");
const handler = kind => ({
  kind, async prepareTx() {}, async failTx() {}, async settleTx() { return "succeeded"; },
  classifyFailure() { return { code: "FIXTURE_UNKNOWN_REMOTE", phase: "execute", disposition: "reconciliation", executionStopped: false }; },
  async execute(job) {
    await trace({ event: "start", jobId: job.id, kind });
    if (kind === "generate_image") await new Promise(() => {});
    await trace({ event: "end", jobId: job.id, kind });
    return "ok";
  },
});
const runner = createQueueRunner([handler("generate_image"), handler("assistant")]);
const supervisor = createWorkerSupervisor({ queue: runner, async disconnect() {
  await prisma.$disconnect(); await trace({ event: "disconnected" });
} });
await supervisor.start();
await trace({ event: "ready" });
// The real supervisor owns SIGTERM and exits after drain/disconnect.
setInterval(() => {}, 1000);
