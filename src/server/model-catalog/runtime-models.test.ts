// @vitest-environment node
import Ajv from "ajv";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@/shared/model-catalog/gradio-contract";
import { listModelCatalogRecords } from "./catalog-repository";
import { getModelCatalog, invalidateModelCatalogCache } from "./catalog-service";
import { getRuntimeCatalog } from "./runtime-models";
import { validateImageGenerationPayload, validateVideoGenerationPayload, validateAudioGenerationPayload } from "./generation-validation";

vi.mock("./catalog-repository", () => ({ listModelCatalogRecords: vi.fn() }));

function fixture(index: number, type: "image" | "video" | "audio" = "image") {
  return {
    id: "model-" + index, key: "model-" + index, type, label: "Fixture", vendor: "Fixture", provider: "hf_space",
    providerConfig: { space_id: "fixture/source", api_name: "/render", output: { media: type, path: [0] },
      input_rules: { type: "object", properties: { script: { type: "string", minLength: index + 1 } }, required: ["script"] } },
    parameters: { script: { ui: "textarea", required: true, binding: { source: "hf_space", parameterName: "script", canonicalKey: "prompt", kind: "string", valueType: "string", schema: { type: "string" }, order: 0 } } },
    meta: { concurrent_limit: 2 }, isActive: true, isDefault: true, createdAt: new Date(0), updatedAt: new Date(0),
  };
}

beforeEach(() => { invalidateModelCatalogCache(); vi.clearAllMocks(); });
afterEach(() => vi.restoreAllMocks());

describe("runtime catalog snapshot reuse", () => {
  it("reuses derivation for all media and isolates nested caller mutations", async () => {
    vi.mocked(listModelCatalogRecords).mockResolvedValue([fixture(0), fixture(1, "video"), fixture(2, "audio")] as never);
    await getModelCatalog();
    const contract = vi.spyOn(contracts, "getGradioContract");
    const first = await getRuntimeCatalog();
    expect(contract).toHaveBeenCalledTimes(3);
    contract.mockClear();
    first.imageModels[0].defaults.width = 999;
    first.imageModels.splice(0);
    first.audioModels[0].parameters!.script = { default: "changed" };
    const second = await getRuntimeCatalog();
    expect(contract).not.toHaveBeenCalled();
    expect(second.imageModels[0]).toMatchObject({ key: "model-0", mapped: true, defaults: {}, concurrentLimit: 2 });
    expect(second.audioModels[0].parameters!.script).not.toEqual({ default: "changed" });
    expect((await getModelCatalog())[2].parameters).not.toEqual(first.audioModels[0].parameters);
  });

  it("keeps actual 140-schema compilation at zero across repeated TTL refreshes", async () => {
    let clock = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const records = Array.from({ length: 140 }, (_, index) => fixture(index + 1_000, (["image", "video", "audio"] as const)[index % 3]));
    vi.mocked(listModelCatalogRecords).mockImplementation(async () => structuredClone(records) as never);
    const compile = vi.spyOn(Ajv.prototype, "compile");
    await getRuntimeCatalog({ includeInactive: true });
    expect(compile.mock.calls.length).toBeGreaterThanOrEqual(140);
    compile.mockClear();
    const contract = vi.spyOn(contracts, "getGradioContract");
    for (let pass = 0; pass < 5; pass++) {
      clock += 60_000;
      await Promise.all(Array.from({ length: 3 }, () => getRuntimeCatalog({ includeInactive: true })));
    }
    expect(listModelCatalogRecords).toHaveBeenCalledTimes(6);
    expect(contract).not.toHaveBeenCalled();
    expect(compile).not.toHaveBeenCalled();
  });

  it("reflects same-key config replacement and preserves all three input contracts", async () => {
    const validators = { image: validateImageGenerationPayload, video: validateVideoGenerationPayload, audio: validateAudioGenerationPayload };
    for (const type of ["image", "video", "audio"] as const) {
      const model = fixture(0, type);
      vi.mocked(listModelCatalogRecords).mockResolvedValue([model] as never);
      invalidateModelCatalogCache();
      await getRuntimeCatalog();
      expect((await validators[type]({ model: model.key, prompt: "valid" })).success).toBe(true);
      expect((await validators[type]({ model: model.key, prompt: "" })).success).toBe(false);
      const changed = { ...model, isActive: false, isDefault: false, meta: { concurrent_limit: 3 }, providerConfig: { ...model.providerConfig, input_rules: { ...model.providerConfig.input_rules, properties: { script: { type: "string", minLength: 10 } } } } };
      vi.mocked(listModelCatalogRecords).mockResolvedValue([changed] as never);
      invalidateModelCatalogCache();
      const runtime = await getRuntimeCatalog({ includeInactive: true });
      expect(runtime[type === "image" ? "imageModels" : type === "video" ? "videoModels" : "audioModels"][0]).toMatchObject({ concurrentLimit: 3, isActive: false, isDefault: false });
      expect((await validators[type]({ model: model.key, prompt: "valid" })).success).toBe(false);
      expect((await validators[type]({ model: model.key, prompt: "valid long script" })).success).toBe(true);
    }
  });
});
