import { readHostPressure } from "../verification/resources.mjs";

export function spacesWorkerBudget(environment, hostPressure) {
  const override = environment.SPACES_E2E_WORKERS;
  const priorConstraint = environment.SPACES_E2E_MEMORY_CONSTRAINED;
  if (priorConstraint !== undefined && priorConstraint !== "1") throw new Error("Invalid current-run memory constraint");
  if (override !== undefined && !/^[1-4]$/.test(override)) throw new Error("SPACES_E2E_WORKERS must be between 1 and 4");
  const constrained = hostPressure.constrained || priorConstraint === "1";
  return { workers: override !== undefined ? Number(override) : constrained ? 2 : 4,
    source: override !== undefined ? "environment" : priorConstraint ? "current-run-memory-pressure" : hostPressure.constrained ? "host-memory-pressure" : "default",
    priorConstraintObserved: priorConstraint === "1", hostPressure };
}

export async function resolveSpacesWorkerBudget(environment) {
  return spacesWorkerBudget(environment, await readHostPressure());
}
