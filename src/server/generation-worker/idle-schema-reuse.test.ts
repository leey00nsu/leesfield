// @vitest-environment node
import Ajv from "ajv";
import { afterEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { listModelCatalogRecords } from "@/server/model-catalog/catalog-repository";
import { invalidateModelCatalogCache } from "@/server/model-catalog/catalog-service";
import * as runtime from "@/server/model-catalog/runtime-models";
import { pumpGenerationJobs } from "./generation-worker";

vi.mock("@/server/db/prisma", () => ({ prisma: {
  imageGeneration: { findFirst: vi.fn(async () => ({ id: "pending" })) },
  videoGeneration: { findFirst: vi.fn(async () => null) },
  audioGeneration: { findFirst: vi.fn(async () => null) },
} }));
vi.mock("@/server/model-catalog/catalog-repository", () => ({ listModelCatalogRecords: vi.fn() }));
vi.mock("./execution-lease", async (original) => ({ ...await original<typeof import("./execution-lease")>(), claimPendingGenerationJobs: vi.fn(async () => []) }));
afterEach(() => { vi.restoreAllMocks(); invalidateModelCatalogCache(); });

it("keeps real catalog/runtime/Ajv cold after warmup through TTL and empty worker passes", async () => {
  let clock = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  const models = Array.from({ length: 140 }, (_, index) => {
    const type = (["image", "video", "audio"] as const)[index % 3];
    return { id: "idle-model-" + index, key: "idle-model-" + index, type, label: "Fixture", vendor: "Fixture", provider: "hf_space",
      providerConfig: { space_id: "fixture/source", api_name: "/render", output: { media: type, path: [0] }, input_rules: { type: "object", properties: { script: { type: "string", minLength: index + 2_000 } }, required: ["script"] } },
      parameters: { script: { ui: "textarea", required: true, binding: { source: "hf_space", parameterName: "script", canonicalKey: "prompt", kind: "string", valueType: "string", schema: { type: "string" }, order: 0 } } },
      meta: {}, isActive: true, isDefault: index < 3, createdAt: new Date(0), updatedAt: new Date(0) };
  });
  vi.mocked(listModelCatalogRecords).mockImplementation(async () => structuredClone(models) as never);
  const compile = vi.spyOn(Ajv.prototype, "compile");
  await pumpGenerationJobs();
  expect(compile.mock.calls.length).toBeGreaterThanOrEqual(140);
  compile.mockClear();
  for (let pass = 0; pass < 5; pass++) {
    clock += 60_000;
    await pumpGenerationJobs();
  }
  expect(listModelCatalogRecords).toHaveBeenCalledTimes(6);
  expect(compile).not.toHaveBeenCalled();
  const getRuntime = vi.spyOn(runtime, "getRuntimeCatalog");
  vi.mocked(prisma.imageGeneration.findFirst).mockResolvedValue(null);
  for (let pass = 0; pass < 5; pass++) { clock += 60_000; await pumpGenerationJobs(); }
  expect(getRuntime).not.toHaveBeenCalled();
  expect(listModelCatalogRecords).toHaveBeenCalledTimes(6);
  expect(compile).not.toHaveBeenCalled();
});
