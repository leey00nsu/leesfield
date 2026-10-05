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

describe("model attachment limits", () => {
  const image = (count: number) => Array.from({length:count}, (_, i) => `https://assets.example.com/${i}.png`);
  it.each(["image", "video"] as const)("%s: saves array limits and shares runtime/server/Space/provider validation", async media => {
    const { contractInputPorts } = await import("@/shared/model-catalog/file-input-ports");
    const base = fixture(media);
    const model = modelCatalogInputSchema.parse({...base, parameters:{...base.parameters,
      references:{ui:"upload",maxItems:2,binding:{source:"hf_space",parameterName:"references",valueType:"string",kind:"files",media:"image",order:5,schema:{type:"array",items:{type:"string"},minItems:1,maxItems:4}}}
    }});
    expect(model.parameters.references.maxItems).toBe(2);
    expect(model.parameters.references.binding?.schema?.maxItems).toBe(4);
    const contract=getGradioContract(model)!;
    expect(contract.inputs.find(f=>f.name==="references")?.schema.maxItems).toBe(2);
    expect(contractInputPorts(model)).toEqual([expect.objectContaining({name:"image-field-references",multiple:true,maxItems:2})]);
    vi.mocked(getModelCatalog).mockResolvedValue([model] as never);
    const payload={model:media,prompt:"edit",dynamicParams:{references:image(2)}};
    const runtime=media==="image"?createRuntimeImageSchema([model as RuntimeImageModel]):createRuntimeVideoSchema([model as RuntimeVideoModel]);
    expect(runtime.safeParse(payload).success).toBe(true);
    expect((await validators[media](payload)).success).toBe(true);
    expect(gradioInputValues(contract,payload).references).toEqual(image(2));
    const overflow={...payload,dynamicParams:{references:image(3)}};
    expect(runtime.safeParse(overflow).success).toBe(false);
    expect((await validators[media](overflow)).success).toBe(false);
    expect(()=>gradioInputValues(contract,overflow)).toThrow("HF_CONTRACT_FILE_COUNT_LIMIT:references");
    expect(modelCatalogInputSchema.safeParse({...model,parameters:{...model.parameters,references:{...model.parameters.references,maxItems:5}}}).success).toBe(false);
    expect(modelCatalogInputSchema.safeParse({...model,parameters:{...model.parameters,references:{...model.parameters.references,maxItems:0}}}).success).toBe(false);
  });

  it("Modal limits preserve source schema and scalar ports", async () => {
    const { contractInputPorts } = await import("@/shared/model-catalog/file-input-ports");
    const raw=structuredClone(workflows.find(w=>w.category==="image")!);
    raw.id="multi-reference-limit";
    Object.assign(raw.input_schema.properties,{refs:{type:"array",items:{type:"string",format:"comfy-input-name","x-media":"image"},minItems:1,maxItems:4},first:{type:"string",format:"comfy-input-name","x-media":"image"}});
    const draft=buildModalModelDraft(raw);
    const model=modelCatalogInputSchema.parse({...draft,parameters:{...draft.parameters,refs:{...draft.parameters.refs,maxItems:2}}});
    expect(getGradioContract(model)!.inputs.find(f=>f.name==="refs")?.schema.maxItems).toBe(2);
    expect(contractInputPorts(model)).toEqual(expect.arrayContaining([expect.objectContaining({name:"image-field-first",multiple:false,maxItems:1})]));
    expect(gradioInputValues(getGradioContract(model)!,{prompt:"edit",dynamicParams:{refs:image(2),first:image(1)[0]}})).toMatchObject({refs:image(2),first:image(1)[0]});
    expect(()=>gradioInputValues(getGradioContract(model)!,{prompt:"edit",dynamicParams:{refs:image(3),first:image(1)[0]}})).toThrow("HF_CONTRACT_FILE_COUNT_LIMIT:refs");
    expect(modelCatalogInputSchema.safeParse({...model,parameters:{...model.parameters,first:{...draft.parameters.first,maxItems:2}}}).success).toBe(false);
    expect((model.providerConfig as {workflow:{input_schema:{properties:Record<string,{maxItems?:number}>}}}).workflow.input_schema.properties.refs.maxItems).toBe(4);
  });
});


describe("native output count and modality contracts", () => {
  it("Krea count values keep their provider key through runtime, server and immutable snapshots", async () => {
    const {resolveImageOutputCount} = await import("@/shared/model-catalog/image-output-count");
    const {identityEditModel} = await import("@/test-utils/fixtures/media-attachment-models");
    const {resolveGenerationModalities} = await import("@/shared/model-catalog/modality");
    expect(resolveGenerationModalities(identityEditModel)).toEqual(["I2I"]);
    const count = resolveImageOutputCount(identityEditModel);
    expect(count).toMatchObject({fieldName:"advanced__batch_size",min:1,max:4,defaultValue:1,fixed:false});
    vi.mocked(getModelCatalog).mockResolvedValue([identityEditModel] as never);
    for (const value of [1,2,3,4]) {
      expect(count.accepts(value)).toBe(true);
      const payload={model:identityEditModel.key,prompt:"edit",dynamicParams:{image:"https://assets.example.com/reference.png",advanced__batch_size:value}};
      expect(createRuntimeImageSchema([identityEditModel]).safeParse(payload).success).toBe(true);
      const parsed=await validateImageGenerationPayload(payload);
      expect(parsed.success).toBe(true);
      if(!parsed.success)throw parsed.error;
      expect(parsed.data).toEqual(payload);
      expect(gradioInputValues(getGradioContract(identityEditModel)!,restoreRequest(await snapshotRequest("image",parsed.data))).advanced__batch_size).toBe(value);
    }
    for (const value of [0,5,1.5,NaN,Infinity]) {
      expect(count.accepts(value)).toBe(false);
      expect((await validateImageGenerationPayload({model:identityEditModel.key,prompt:"edit",dynamicParams:{image:"https://assets.example.com/reference.png",advanced__batch_size:value}})).success).toBe(false);
    }
  });
  it("count discovery honors bindings, step, choices, fixed values and absent/ambiguous fields", async () => {
    const {resolveImageOutputCount} = await import("@/shared/model-catalog/image-output-count");
    const base=fixture("image");
    const definition={ui:"input",default:4,min:2,max:6,step:2,options:[2,4,6],binding:{source:"hf_space",parameterName:"samples",canonicalKey:"imageCount",kind:"number",valueType:"number",schema:{type:"integer",minimum:2,maximum:6,multipleOf:2},order:5}};
    const model=modelCatalogInputSchema.parse({...base,parameters:{...base.parameters,count:definition}}) as RuntimeImageModel;
    const count=resolveImageOutputCount(model);
    expect(count).toMatchObject({fieldName:"samples",defaultValue:4,choices:[2,4,6]});
    expect([1,2,3,4,5,6,7].map(count.accepts)).toEqual([false,true,false,true,false,true,false]);
    const hidden=resolveImageOutputCount({...model,parameters:{...model.parameters,count:{...definition,ui:"hidden"}}});
    expect(hidden.fixed).toBe(true);expect(hidden.accepts(4)).toBe(true);expect(hidden.accepts(2)).toBe(false);
    const absent=resolveImageOutputCount(base as RuntimeImageModel);
    expect(absent).toMatchObject({defaultValue:1,fixed:true});expect(absent.accepts(2)).toBe(false);
    const ambiguous=resolveImageOutputCount({...model,parameters:{...model.parameters,other:{...definition,binding:{...definition.binding,parameterName:"num_images",order:6}}}});
    expect(ambiguous.fieldName).toBeUndefined();
    const legacy={...model,providerConfig:{},parameters:{imageCount:{ui:"input",min:1,max:4,step:1,default:4}}};
    const legacyCount=resolveImageOutputCount(legacy);
    expect(legacyCount.defaultValue).toBe(1);expect(legacyCount.accepts(4)).toBe(true);expect(legacyCount.accepts(5)).toBe(false);
  });
  it("actual required media determines tags instead of inferred legacy metadata", async () => {
    const {resolveGenerationModalities}=await import("@/shared/model-catalog/modality");
    const {videoAttachmentModel,imageToVideoAttachmentModel,audioAttachmentModel,multiImageAttachmentModel}=await import("@/test-utils/fixtures/media-attachment-models");
    expect(resolveGenerationModalities(videoAttachmentModel)).toEqual(["V2V"]);
    expect(resolveGenerationModalities(imageToVideoAttachmentModel)).toEqual(["I2V"]);
    expect(resolveGenerationModalities(audioAttachmentModel)).toEqual(["A2A"]);
    expect(resolveGenerationModalities(multiImageAttachmentModel)).toEqual(["I2I"]);
    expect(resolveGenerationModalities(fixture("video") as RuntimeVideoModel)).toEqual(["T2V"]);
  });
});
