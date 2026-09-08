
import { describe, expect, it, vi } from "vitest";
import { getGradioContract, normalizeGradioModel } from "@/shared/model-catalog/gradio-contract";
import { modelCatalogInputSchema, modelCatalogSchema } from "@/server/model-catalog/catalog-schema";
import { executeGradioContract } from "./contract-executor";

vi.mock("@gradio/client", () => ({ handle_file: vi.fn(value => value) }));

function oldModel() {
  return {
    id: "test", type: "audio", key: "test", label: "Test", vendor: "HF", provider: "hf_space",
    isActive: true, isDefault: false, createdAt: new Date(), updatedAt: new Date(),
    meta: { model_id: "test/tts", default_speed: 1 },
    parameters: { prompt: { ui: "textarea", required: true, default: undefined } },
    providerConfig: { space_id: "test/tts", api_name: "/speak", gradio_contract: {
      version: 1, apiName: "/speak", reviewed: false, mappingConfirmed: false,
      diagnostics: ["OUTPUT_SELECTION_REVIEW"],
      inputs: [
        { name: "in_0", label: "Prompt", kind: "string", canonical: "prompt", schema: {type: "string"}, nullable: false, required: true },
        { name: "rate", label: "Rate", kind: "number", schema: {type: "number"}, nullable: false, required: false, default: 1 },
        { name: "options", label: "Options", kind: "json", schema: {type: ["object", "null"]}, nullable: true, required: false, default: null },
      ],
      output: { media: "audio", path: [1], multiple: false },
    } },
  };
}

describe("Gradio settings compatibility", () => {
  it("loads existing records without changing active state and saves without a contract or review gate", () => {
    const old = oldModel();
    const records = modelCatalogSchema.parse([old, {...old, isActive: false}]);
    expect(records.map(record => record.isActive)).toEqual([true, false]);
    const saved = modelCatalogInputSchema.parse(records[0]);
    expect(saved.providerConfig).not.toHaveProperty("gradio_contract");
    expect(saved.providerConfig).toMatchObject({api_name: "/speak", output: {media: "audio", path: [1]}});
    expect(getGradioContract(saved)?.inputs.find(field => field.name === "options")?.default).toBeNull();
    expect(old.providerConfig).toHaveProperty("gradio_contract");
    expect(normalizeGradioModel(saved)).toEqual(saved);
  });

  it("uses edited parameters and provider settings for the actual request and result", async () => {
    const model = modelCatalogInputSchema.parse(oldModel());
    const parameters = model.parameters as Record<string, Record<string, unknown>>;
    parameters.rate = {...parameters.rate, label: "Speed", default: 2, min: 1, max: 3};
    (model.providerConfig as Record<string, unknown>).api_name = "/speak_v2";
    (model.providerConfig as Record<string, unknown>).output = {media: "audio", path: [0], multiple: false};
    const saved = modelCatalogInputSchema.parse(model);
    const predict = vi.fn(async () => ({data: [{url: "https://example.hf.space/result.wav"}, "other"]}));
    await executeGradioContract({predict}, saved, {prompt: "hello"}, {timeoutMs: 1000, spaceUrl: "https://example.hf.space"}, "audio");
    expect(predict).toHaveBeenCalledWith("/speak_v2", {in_0: "hello", rate: 2, options: null});
    expect(getGradioContract(saved)?.inputs.find(field => field.name === "rate")).toMatchObject({label: "Speed", default: 2, min: 1, max: 3});
  });

  it("rejects invalid values or missing output instead of requiring review", () => {
    const model = modelCatalogInputSchema.parse(oldModel());
    (model.providerConfig as Record<string, unknown>).output = null;
    expect(modelCatalogInputSchema.safeParse(model).success).toBe(false);
    expect(modelCatalogInputSchema.safeParse({...oldModel(), providerConfig: {...oldModel().providerConfig, gradio_contract: {version: 99}}}).success).toBe(false);
  });
});
