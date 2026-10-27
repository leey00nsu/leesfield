// @vitest-environment node
import { expect, test } from "vitest";
import { createResourceMonitor, summarizeProcessTree } from "./resources.mjs";

test("counts only root and descendants, without persisting identifiers or arguments", () => {
  const sample = summarizeProcessTree("9 1 80.0 500\n42 1 2.5 100\n44 42 50.0 200\n45 44 10.0 300\n99 1 70.0 500\nsecret-token --cookie secret-value", 42);
  expect(sample).toEqual({ processes: 3, cpuLifetimePercent: 62.5, rssBytes: 600 * 1024 });
  expect(summarizeProcessTree("9 1 80.0 500", 42)).toBeNull();
});

test("distinguishes missing OS support and failed sampling from measured zero", async () => {
  const unsupported = createResourceMonitor({ platform: "win32", readTable: () => { throw new Error("must not call"); } });
  unsupported.start();
  expect(await unsupported.stop()).toMatchObject({ status: "unsupported", samples: [], peakRssBytes: null });
  const failed = createResourceMonitor({ readTable: () => { throw new Error("secret-env"); } });
  const missing = await failed.stop();
  expect(missing).toMatchObject({ status: "unavailable", failedSamples: 1, peakRssBytes: null });
  expect(JSON.stringify(missing)).not.toContain("secret-env");
  const measured = createResourceMonitor({ rootPid: 42, readTable: async () => "42 1 0.0 0", readLoad: () => [1, 2, 3], readHost: async () => ({ status: "unavailable" }) });
  const result = await measured.stop();
  expect(result).toMatchObject({ status: "observed", peakRssBytes: 0, peakCpuLifetimePercent: 0 });
  expect(result.samples[0].hostPressure).toEqual({ status: "unavailable" });
  expect((await measured.stop()).samples).toHaveLength(1);
  const constrained = createResourceMonitor({ rootPid: 42, readTable: async () => "42 1 0.0 0", readLoad: () => [1, 2, 3],
    readHost: async () => ({ status: "observed", constrained: true }) });
  expect(constrained.memoryConstrained()).toBe(false);
  await constrained.stop();
  expect(constrained.memoryConstrained()).toBe(true);
});
