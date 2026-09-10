import { describe, expect, it, vi } from "vitest";
vi.mock("./catalog-service", () => ({ getModelCatalog: vi.fn() }));
import { getModelCatalog } from "./catalog-service";
import { validateAudioGenerationPayload, validateImageGenerationPayload, validateVideoGenerationPayload } from "./generation-validation";
import { areGenerationNodeParametersValid } from "@/features/node-studio/model/generation-node-parameter-validation";
import { generationPayload } from "@/shared/model-catalog/generation-payload";
import { gradioInputValues, getGradioContract } from "@/shared/model-catalog/gradio-contract";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";

type Model = RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel;
const validators = { image: validateImageGenerationPayload, video: validateVideoGenerationPayload, audio: validateAudioGenerationPayload };
const base = { width: 512, height: 512, imageCount: 1, aspectRatio: "16:9", resolution: 720, durationSec: 3, fps: 16, steps: 6, guidanceScale: 1, voice: "default", speed: 1 };
function mappedModel(type: Model["type"], seedKind: "number" | "string" = "number"): Model {
  return {
    type, key: `contract-${type}`, label: "Contract fixture", provider: "hf_space", vendor: "HUGGINGFACE", isActive: true, isDefault: false,
    providerConfig: { space_id: "fixture/model", api_name: "/generate", output: { media: type, path: [0], multiple: false } },
    parameters: {
      prompt: { ui: "textarea", binding: { source: "hf_space", parameterName: "instruction", canonicalKey: "prompt", order: 0, kind: "string", valueType: "string", schema: { type: "string" } } },
      seed: { ui: "input", required: true, default: seedKind === "number" ? 42 : "default-seed", binding: { source: "hf_space", parameterName: "random_state", order: 1, kind: seedKind, valueType: seedKind, schema: seedKind === "number" ? { type: "integer", minimum: -1, maximum: 100 } : { type: "string" } } },
      "hf:strength": { ui: "range", default: 0.5, min: 0, max: 1, step: 0.1, binding: { source: "hf_space", parameterName: "strength", order: 2, valueType: "number", schema: { type: "number" } } },
    }, meta: {},
  } as Model;
}

describe("generation authoring/request contract parity", () => {
  for (const type of ["image", "video", "audio"] as const) {
    it.each([42, "42"])(`${type}: keeps legacy providers compatible with seed %j`, async seed => {
      const model = { ...mappedModel(type), providerConfig: { space_id: "fixture/legacy", api_name: "/generate" }, parameters: { seed: { ui: "input", default: 42, min: -1, max: 100, step: 1 } } } as Model;
      vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
      const values = { ...base, seed };
      expect(areGenerationNodeParametersValid(model, values)).toBe(true);
      expect((await validators[type]({ ...values, model: model.key, prompt: "dance" })).success).toBe(true);
    });
    it.each([42, "42", 0, "0", -1, "-1"])(`${type}: accepts authored seed %j and sends its declared provider type`, async seed => {
      const model = mappedModel(type);
      vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
      const parameters = { ...base, seed, "hf:strength": "0.7" };
      expect(areGenerationNodeParametersValid(model, parameters)).toBe(true);
      const parsed = await validators[type]({ ...parameters, model: model.key, prompt: "dance" });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data).not.toHaveProperty("seed");
      expect(gradioInputValues(getGradioContract(model)!, parsed.data)).toEqual({ instruction: "dance", random_state: Number(seed), strength: 0.7 });
    });
    it.each([101, "101", 1.5, "1.5", "bad", " ", "9007199254740993", Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(`${type}: rejects invalid seed %j in readiness and submission`, async seed => {
      const model = mappedModel(type);
      vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
      const values = { ...base, seed };
      expect(areGenerationNodeParametersValid(model, values)).toBe(false);
      expect((await validators[type]({ ...values, model: model.key, prompt: "dance" })).success).toBe(false);
    });
    it(`${type}: preserves string seeds and explicit provider values`, async () => {
      const model = mappedModel(type, "string");
      vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
      const values = { ...base, seed: "900719925474099312345", dynamicParams: { random_state: "0007", strength: 0 } };
      expect(areGenerationNodeParametersValid(model, values)).toBe(true);
      const parsed = await validators[type]({ ...values, model: model.key, prompt: "dance" });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.dynamicParams).toEqual({ random_state: "0007", strength: 0 });
    });
    it(`${type}: preserves strict explicit dynamic types and unknown-key validation`, () => {
      const model = mappedModel(type);
      expect(areGenerationNodeParametersValid(model, { ...base, dynamicParams: { random_state: "42" } })).toBe(false);
      expect(areGenerationNodeParametersValid(model, { ...base, dynamicParams: { unknown: 1 } })).toBe(false);
      expect(areGenerationNodeParametersValid(model, { ...base, dynamicParams: [] })).toBe(false);
      expect(areGenerationNodeParametersValid(model, { ...base, seed: "" })).toBe(true);
    });
    it(`${type}: ignores unbound legacy envelope fields in readiness and submission`, async () => {
      const model = mappedModel(type);
      vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
      const values = { ...base, seed: 42, steps: 1.5 };
      expect(areGenerationNodeParametersValid(model, values)).toBe(true);
      const parsed = await validators[type]({ ...values, model: model.key, prompt: "dance" });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data).not.toHaveProperty("steps");
    });
  }
  it("rejects unsafe numeric provider integers even without a declared maximum", () => {
    const contract = getGradioContract(mappedModel("image"))!;
    contract.inputs.find(field => field.name === "random_state")!.schema = { type: "integer" };
    expect(() => gradioInputValues(contract, { prompt: "dance", dynamicParams: { random_state: Number.MAX_SAFE_INTEGER + 1 } })).toThrow("HF_CONTRACT_TYPE:random_state");
  });
  it("migrates stored audio binding aliases without mutating or overriding explicit provider keys", () => {
    const model = mappedModel("audio");
    const input = { dynamicParams: { "hf:strength": "0.7", strength: 0 } };
    expect(generationPayload(model, input)).toEqual({ dynamicParams: { strength: 0 } });
    expect(input.dynamicParams).toEqual({ "hf:strength": "0.7", strength: 0 });
    expect(generationPayload(model, { dynamicParams: { "hf:strength": "0.7" } })).toEqual({ dynamicParams: { strength: 0.7 } });
  });
});
