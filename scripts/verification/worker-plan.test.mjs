// @vitest-environment node
import { expect, test } from "vitest";
import { verificationWorkerPlan } from "./worker-plan.mjs";
import { verificationBatches } from "./execution.mjs";

test("constrained machines isolate unit work without omitting any check", () => {
  const machine = { cpus: 10, memoryBytes: 24 * 1024 ** 3 };
  const constrained = verificationWorkerPlan({ constrained: true }, {}, machine);
  expect(constrained.unitWorkers).toBe(2);
  expect(verificationWorkerPlan({}, {}, machine).unitWorkers).toBe(4);
  expect(verificationWorkerPlan({}, {}, { cpus: 2, memoryBytes: 8 * 1024 ** 3 }).constrained).toBe(true);
  expect(verificationWorkerPlan({ constrained: true }, { VERIFICATION_TEST_WORKERS: "3" }, machine).unitWorkers).toBe(3);
  expect(() => verificationWorkerPlan({}, { VERIFICATION_TEST_WORKERS: "8" }, machine)).toThrow();
  const checks = ["test", "typecheck", "lint", "test:production-integration", "build"].map(id => ({ id }));
  expect(verificationBatches(checks, constrained).map(batch => batch.map(check => check.id)))
    .toEqual([["typecheck"], ["test"], ["lint", "test:production-integration"], ["build"]]);
  expect(verificationBatches(checks, constrained).flat().map(check => check.id).sort()).toEqual(checks.map(check => check.id).sort());
});
