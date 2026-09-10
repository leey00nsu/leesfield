import { describe, expect, it, vi } from "vitest";
vi.mock("./catalog-service", () => ({ getModelCatalog: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { imageGeneration: { create: vi.fn(async ({data}) => data) } } }));
import { getModelCatalog } from "./catalog-service";
import { modelCatalogInputSchema } from "./catalog-schema";
import { normalizeGradioModel, contractAuthoringDefaults, getGradioContract, gradioInputValues } from "@/shared/model-catalog/gradio-contract";
import { createRuntimeImageSchema, createRuntimeVideoSchema, createRuntimeAudioSchema } from "@/shared/model-catalog/runtime-schema";
import { validateImageGenerationPayload, validateVideoGenerationPayload, validateAudioGenerationPayload } from "./generation-validation";
import { projectGenerationModelSelectionDefaults } from "@/features/node-studio/model/generation-model-selection-defaults";
import { snapshotRequest, restoreRequest } from "@/server/generation-request/request-snapshot";
import { createImageGenerationRecord } from "@/server/image-generation/image-generation-repository";
import { buildModalModelDraft } from "@/server/modal-comfyui/importer";
import workflows from "@/server/modal-comfyui/fixtures/workflows.json";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
const validators = { image: validateImageGenerationPayload, video: validateVideoGenerationPayload, audio: validateAudioGenerationPayload };
function fixture(type: "image" | "video" | "audio") {
  return modelCatalogInputSchema.parse({
    type, key: type, label: type, vendor: "HF", provider: "hf_space", isActive: true,
    providerConfig: { space_id: "fixture/source", api_name: "/render", output: { media: type, path: [0] } }, meta: {},
    parameters: {
      instruction: { ui: "textarea", required: true, binding: { source: "hf_space", parameterName: "instruction", canonicalKey: "prompt", kind: "string", valueType: "string", schema: { type: "string" }, order: 0 } },
      "hf:duration": { ui: "input", default: 0, binding: { source: "hf_space", parameterName: "duration", kind: "number", valueType: "number", schema: { type: "number" }, order: 1 } },
      enabled: { ui: "toggle", default: false, binding: { source: "hf_space", parameterName: "enabled", kind: "boolean", valueType: "boolean", schema: { type: "boolean" }, order: 2 } },
      text: { ui: "input", default: "", binding: { source: "hf_space", parameterName: "text", kind: "string", valueType: "string", schema: { type: "string" }, order: 3 } },
      options: { ui: "input", default: null, binding: { source: "hf_space", parameterName: "options", kind: "json", valueType: "string", nullable: true, schema: { type: ["object", "null"] }, order: 4 } },
      durationSec: { ui: "hidden", default: 3 }, width: { ui: "hidden", default: 1024 }, steps: { ui: "hidden", default: 1 },
    },
  });
}
describe("source-only model defaults", () => {
  for (const media of ["image", "video", "audio"] as const) {
    it(`${media}: imports/saves and initializes only source inputs, preserving falsy defaults`, async () => {
      const model = fixture(media);
      expect(Object.keys(model.parameters)).toEqual(["instruction", "hf:duration", "enabled", "text", "options"]);
      expect(model.meta).toEqual({});
      expect(contractAuthoringDefaults(model)).toEqual({ "hf:duration": 0, enabled: false, text: "", options: null });
      const projected = projectGenerationModelSelectionDefaults({ modelKey: media, parameters: { durationSec: 3, "hf:duration": 2 } }, { modelKey: media }, [model as RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel]);
      expect(projected.parameters).toEqual({ "hf:duration": 2, enabled: false, text: "", options: null });
      vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
      const parsed = await validators[media]({ model: media, prompt: "edit", steps: 9, durationSec: 3 });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data).toEqual({ model: media, prompt: "edit", dynamicParams: {} });
      const runtime = media === "image" ? createRuntimeImageSchema([model as RuntimeImageModel]) : media === "video" ? createRuntimeVideoSchema([model as RuntimeVideoModel]) : createRuntimeAudioSchema([model as RuntimeAudioModel]);
      expect(runtime.parse({ model: media, prompt: "edit" })).toEqual(parsed.data);
      const snapshot = await snapshotRequest(media, parsed.data);
      expect(snapshot.dynamicParams).toEqual({ instruction: "edit", duration: 0, enabled: false, text: "", options: null });
      expect(snapshot).not.toHaveProperty("steps");
      (model.parameters["hf:duration"] as {default: unknown}).default = 12;
      expect(gradioInputValues(getGradioContract(model)!, restoreRequest(snapshot)).duration).toBe(0);
    });
  }
  it("never inherits a generic default for a required source field without a default", () => {
    const model = normalizeGradioModel({ parameters: { width: { ui: "input", default: 1024 } }, providerConfig: { gradio_contract: {
      version: 1, apiName: "/render", diagnostics: [], inputs: [{ name: "width", label: "Width", kind: "number", schema: { type: "integer" }, required: true, nullable: false }], output: { media: "image", path: [0] },
    } } });
    expect(model.parameters.width).not.toHaveProperty("default");
    expect(() => gradioInputValues(getGradioContract(model)!, {})).toThrow();
  });
  it("keeps required fields for manually configured legacy adapters", () => {
    const mapped = fixture("image");
    expect(modelCatalogInputSchema.safeParse({ ...mapped, providerConfig: { space_id: "legacy/model", api_name: "/render" }, parameters: {}, meta: {} }).success).toBe(false);
  });
  it("stores absent image request settings as null, without fabricating dimensions or steps", async () => {
    const model = fixture("image");
    vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
    const parsed = await validateImageGenerationPayload({ model: "image", prompt: "edit" });
    if (!parsed.success) throw parsed.error;
    const record = await createImageGenerationRecord("request", parsed.data, "owner@example.com");
    expect(record).toMatchObject({ aspectRatio: null, imageCount: null, steps: null });
    expect(record.requestParams).not.toHaveProperty("width");
    expect(record.requestParams).not.toHaveProperty("steps");
  });
  for (const workflow of workflows.filter(w => w.category !== "audio")) it(`${workflow.id}: contains exactly the declared workflow inputs`, () => {
    const draft = buildModalModelDraft(workflow);
    const contract = getGradioContract(draft)!;
    expect(Object.keys(draft.parameters).sort()).toEqual(contract.inputs.map(f => f.name).sort());
    expect(Object.keys(draft.meta).some(key => key.startsWith("default_"))).toBe(false);
    for (const field of contract.inputs) expect(Object.hasOwn(draft.parameters[field.name], "default")).toBe(Object.hasOwn(field, "default"));
  });
});
