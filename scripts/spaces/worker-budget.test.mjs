// @vitest-environment node
import { expect, test } from "vitest";
import { spacesWorkerBudget } from "./worker-budget.mjs";

test("memory constraints reduce default concurrency while explicit experiments remain visible", () => {
  for (const memoryPressure of ["warning", "critical"]) {
    const host = { status: "observed", memoryPressure, constrained: true };
    expect(spacesWorkerBudget({}, host)).toMatchObject({ workers: 2, source: "host-memory-pressure", hostPressure: host });
    expect(spacesWorkerBudget({ SPACES_E2E_WORKERS: "4" }, host)).toMatchObject({ workers: 4, source: "environment" });
  }
  for (const host of [{ status: "unavailable" }, { status: "unsupported" }, { status: "observed", constrained: false }]) {
    expect(spacesWorkerBudget({}, host)).toMatchObject({ workers: 4, source: "default" });
  }
  expect(spacesWorkerBudget({}, { status: "observed", memoryStallFullAvg10: 0.25, constrained: true }).workers).toBe(2);
  expect(() => spacesWorkerBudget({ SPACES_E2E_WORKERS: "8" }, {})).toThrow();
  expect(spacesWorkerBudget({ SPACES_E2E_MEMORY_CONSTRAINED: "1" }, { status: "observed", constrained: false }))
    .toMatchObject({ workers: 2, source: "current-run-memory-pressure", priorConstraintObserved: true });
  expect(spacesWorkerBudget({ SPACES_E2E_MEMORY_CONSTRAINED: "1", SPACES_E2E_WORKERS: "4" }, {}))
    .toMatchObject({ workers: 4, source: "environment" });
  expect(() => spacesWorkerBudget({ SPACES_E2E_MEMORY_CONSTRAINED: "0" }, {})).toThrow();
});
