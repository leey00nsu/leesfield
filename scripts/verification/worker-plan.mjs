import { cpus, totalmem } from "node:os";
import { readHostPressure } from "./resources.mjs";

export function verificationWorkerPlan(hostPressure, environment = process.env, machine = { cpus: cpus().length, memoryBytes: totalmem() }) {
  const constrained = hostPressure.constrained === true || machine.cpus <= 4 || machine.memoryBytes <= 8 * 1024 ** 3;
  const override = environment.VERIFICATION_TEST_WORKERS;
  if (override !== undefined && !/^[1-4]$/.test(override)) throw new Error("VERIFICATION_TEST_WORKERS must be 1 to 4");
  return { constrained, unitWorkers: override ? Number(override) : constrained ? 2 : 4,
    reason: hostPressure.constrained ? "host-memory-pressure" : constrained ? "machine-budget" : "normal",
    hostPressure, machine };
}

export async function resolveVerificationWorkerPlan(environment) {
  return verificationWorkerPlan(await readHostPressure(), environment);
}
