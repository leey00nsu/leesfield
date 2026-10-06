import { describe, expect, it } from "vitest";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";

import type { GraphDocumentV2 } from "@/shared/generation-graph/canonical-graph";
import { resolveRuntimeVideoDefaults } from "@/shared/model-catalog/runtime-utils";
import type {
  RuntimeImageModel,
  RuntimeLlmModel,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

import {
  getPrimaryNodeRunReadinessReason,
  resolveNodeRunReadiness,
} from "./node-run-readiness";

const imageModel = {
  type: "image",
  key: "image-model",
  label: "Image model",
  vendor: "Leesfield",
  provider: "hf_space",
  parameters: {},
  meta: { max_input_images: 0 },
  isActive: true,
  isDefault: true,
} satisfies RuntimeImageModel;

const videoModel = {
  type: "video",
  key: "video-model",
  label: "Video model",
  vendor: "Leesfield",
  provider: "hf_space",
  parameters: {
    initImage: { ui: "upload", required: true },
  },
  meta: { supports_init_image: true },
  isActive: true,
  isDefault: true,
} satisfies RuntimeVideoModel;

function node(
  id: string,
  kind: string,
  config: GraphDocumentV2["nodes"][number]["config"],
  selectedOutputAssetId: string | null = null,
): GraphDocumentV2["nodes"][number] {
  return { id, kind, position: { x: 0, y: 0 }, configVersion: 1, config, selectedOutputAssetId };
}

function edge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): GraphDocumentV2["edges"][number] {
  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, sortOrder: 0 };
}

const catalog = { imageModels: [imageModel], videoModels: [videoModel] };
const llmModel: RuntimeLlmModel = {
  type: "llm", key: "llm-model", label: "Assistant", vendor: "OpenAI", provider: "openai_compatible",
  providerConfig: { base_url: "https://api.example.com/v1", model_id: "creative-1", supports_images: false },
  isActive: true, isDefault: false,
};

describe("resolveNodeRunReadiness", () => {
  it("checks conditional prompt/file requirements using complete graph values",()=>{
    const mapped:RuntimeImageModel={...imageModel,providerConfig:{space_id:"owner/repo",api_name:"/generate",output:{media:"image",path:[0],multiple:false},input_rules:{type:"object",if:{properties:{mode:{const:"edit"}},required:["mode"]},then:{properties:{source:{type:"string",minLength:1}},required:["source"]},else:{properties:{text:{type:"string",minLength:1}},required:["text"]}}},parameters:{
      prompt:{ui:"textarea",default:"",binding:{source:"hf_space",parameterName:"text",kind:"string",valueType:"string",order:0,schema:{type:"string"},canonicalKey:"prompt",allowEmpty:true}},
      mode:{ui:"select",default:"plain",options:["plain","edit"],binding:{source:"hf_space",parameterName:"mode",kind:"string",valueType:"string",order:1,schema:{type:"string",enum:["plain","edit"]},choiceMode:"single"}},
      source:{ui:"upload",default:null,binding:{source:"hf_space",parameterName:"source",kind:"file",valueType:"file",order:2,schema:{},nullable:true,media:"image"}},
    }};
    const generate=node("generate","generate.image",{modelKey:mapped.key,prompt:"",parameters:{mode:"edit"}});
    const graph={nodes:[generate,node("image","input.image",{assetId:"asset"})],edges:[] as GraphDocumentV2["edges"]};
    expect(resolveNodeRunReadiness(graph,"generate",{imageModels:[mapped]}).reasons).toContain("INPUT_REQUIRED");
    graph.edges=[edge("source","image","image","generate","image-field-source")];
    expect(resolveNodeRunReadiness(graph,"generate",{imageModels:[mapped]})).toEqual({ready:true,reasons:[]});
    graph.edges=[edge("legacy-source","image","image","generate","primary")];
    expect(resolveNodeRunReadiness(graph,"generate",{imageModels:[{...mapped,meta:{max_input_images:1}}]})).toEqual({ready:true,reasons:[]});
    graph.nodes[0]=node("generate","generate.image",{modelKey:mapped.key,prompt:"",parameters:{mode:"plain"}});
    expect(resolveNodeRunReadiness(graph,"generate",{imageModels:[mapped]}).reasons).toContain("PROMPT_REQUIRED");
  });
  it.each(["generate.image", "generate.video"])("blocks retained media connections after switching %s to a text preset", kind => {
    const graph = { nodes: [
      node("generate", kind, { prompt: "draft", modelKey: kind === "generate.image" ? imageModel.key : videoModel.key,
        parameters: {}, promptPreset: { key: "personal", revision: 1, requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {} } }),
      node("image", "input.image", { assetId: "reference" }),
    ], edges: [edge("reference", "image", "image", "generate", kind === "generate.image" ? "primary" : "initImage")] };
    expect(resolveNodeRunReadiness(graph, "generate", catalog).reasons).toContain("INPUT_UNSUPPORTED");
    expect(graph.edges).toHaveLength(1);
  });
  it("checks the connected frame slot independently of the representative selection", () => {
    const graph = { nodes: [
      node("frames", "edit.video.extractFrames", { parameters: {} }, "start"),
      node("video", "generate.video", { prompt: "move", modelKey: videoModel.key, parameters: {} }),
    ], edges: [edge("e", "frames", "endFrame", "video", "initImage")] };
    const outputs = { frames: [{ portId: "startFrame", sortOrder: 0, assetId: "start" },
      { portId: "endFrame", sortOrder: 0, assetId: "end" }] };
    expect(resolveNodeRunReadiness(graph, "video", { ...catalog, mediaOutputs: outputs }).reasons).not.toContain("INPUT_NOT_READY");
    expect(resolveNodeRunReadiness(graph, "video", { ...catalog, mediaOutputs: { frames: outputs.frames.slice(0, 1) } }).reasons)
      .toContain("INPUT_NOT_READY");
  });
  it.each(builtinPromptPresets)("requires an actual supported ready reference for $key", preset => {
    const config = { prompt: preset.prompt, modelKey: imageModel.key, parameters: { width: 1024, height: 1024, imageCount: 1, steps: 10 }, promptPreset: {
      key: preset.key, revision: 1, builtinRevision: 1, requiredInputs: preset.requiredInputs, recommendedParameters: preset.recommendedParameters,
    } };
    const generate = node("generate", "generate.image", config);
    const graph = { nodes: [generate, node("image", "input.image", { assetId: "reference" })], edges: [] as GraphDocumentV2["edges"] };
    expect(resolveNodeRunReadiness(graph, "generate", catalog).reasons).toContain("INPUT_UNSUPPORTED");
    const supported = { ...catalog, imageModels: [{ ...imageModel, meta: { max_input_images: 1 } }] };
    expect(resolveNodeRunReadiness(graph, "generate", supported).reasons).toContain("INPUT_REQUIRED");
    graph.edges = [edge("reference", "image", "image", "generate", "primary")];
    expect(resolveNodeRunReadiness(graph, "generate", supported)).toEqual({ ready: true, reasons: [] });
    graph.edges[0] = { ...graph.edges[0], hasPause: true };
    expect(resolveNodeRunReadiness(graph, "generate", supported).reasons).toContain("INPUT_REQUIRED");
    graph.edges[0] = { ...graph.edges[0], hasPause: false };
    graph.nodes[1] = node("image", "input.image", { assetId: null });
    expect(resolveNodeRunReadiness(graph, "generate", supported).ready).toBe(false);
  });
  it("checks Assistant visual capability and uses its latest text through a Prompt edge", () => {
    const assistant = node("assistant", "generate.assistant", { prompt: "Describe this", modelKey: llmModel.key });
    const image = node("reference", "input.image", { assetId: "asset-image" });
    const prompt = node("prompt", "input.prompt", { text: "fallback" });
    const generate = node("generate", "generate.image", {
      prompt: "", modelKey: imageModel.key, parameters: { width: 1024, height: 1024, imageCount: 1, steps: 10 },
    });
    const graph = { nodes: [assistant, image, prompt, generate], edges: [
      edge("visual", "reference", "image", "assistant", "images"),
      edge("text", "assistant", "text", "prompt", "text"),
      edge("prompt", "prompt", "text", "generate", "prompt"),
    ] };
    expect(resolveNodeRunReadiness(graph, "assistant", { ...catalog, llmModels: [llmModel] }).reasons).toContain("INPUT_UNSUPPORTED");
    expect(resolveNodeRunReadiness(graph, "generate", { ...catalog, assistantResults: { assistant: "A brown coat" } })).toEqual({ ready: true, reasons: [] });
    expect(resolveNodeRunReadiness(graph, "generate", catalog).reasons).toContain("INPUT_NOT_READY");
    graph.edges[1].sourcePortId = "item";
    expect(resolveNodeRunReadiness(graph, "generate", { ...catalog, assistantResults: { assistant: "legacy text" } }).reasons).toContain("INPUT_NOT_READY");
    expect(resolveNodeRunReadiness(graph, "generate", { ...catalog, assistantResults: { assistant: { text: "1. coat\n\n2. scarf", item: "scarf" } } }).ready).toBe(true);
  });

  it("requires every operation input to resolve to a durable asset", () => {
    const edit = node("edit", "edit.image.resize", {
      parameters: {
        mode: "maxEdge",
        width: 1024,
        height: 1024,
        maxEdge: 2048,
        scalePct: 100,
        fit: "contain",
        padColor: "#00000000",
        format: "keep",
        quality: 0.92,
      },
    });
    const input = node("input", "input.image", { assetId: null });
    const graph = {
      nodes: [input, edit],
      edges: [edge("edge", "input", "image", "edit", "image")],
    };

    expect(resolveNodeRunReadiness(graph, "edit", catalog)).toMatchObject({
      ready: false,
      reasons: expect.arrayContaining(["INPUT_NOT_READY", "INPUT_REQUIRED"]),
    });

    graph.nodes[0] = node("input", "input.image", { assetId: "asset-1" });
    expect(resolveNodeRunReadiness(graph, "edit", catalog)).toEqual({ ready: true, reasons: [] });
  });

  it("follows chained Input nodes and does not use a disabled local fallback", () => {
    const resize = node("edit", "edit.image.resize", {
      parameters: {
        mode: "maxEdge", width: 1024, height: 1024, maxEdge: 2048,
        scalePct: 100, fit: "contain", padColor: "#00000000", format: "keep", quality: 0.92,
      },
    });
    const relay = node("relay", "input.image", { assetId: "local-disabled" });
    const root = node("root", "input.image", { assetId: null });
    const graph = {
      nodes: [root, relay, resize],
      edges: [
        edge("pass", "root", "image", "relay", "reference"),
        edge("use", "relay", "image", "edit", "image"),
      ],
    };

    expect(resolveNodeRunReadiness(graph, "edit", catalog)).toMatchObject({
      ready: false,
      reasons: expect.arrayContaining(["INPUT_NOT_READY"]),
    });
    graph.nodes[0] = node("root", "input.image", { assetId: "asset-root" });
    expect(resolveNodeRunReadiness(graph, "edit", catalog)).toEqual({ ready: true, reasons: [] });
  });

  it("accepts an inline or connected prompt only with an active matching model", () => {
    const generate = node("generate", "generate.image", {
      prompt: "",
      modelKey: "image-model",
      parameters: { width: 1024, height: 1024, imageCount: 1, steps: 10 },
    });
    const prompt = node("prompt", "input.prompt", { text: "quiet lake" });
    const graph = {
      nodes: [prompt, generate],
      edges: [edge("edge", "prompt", "text", "generate", "prompt")],
    };

    expect(resolveNodeRunReadiness(graph, "generate", catalog)).toEqual({ ready: true, reasons: [] });
    graph.nodes[0] = node("prompt", "input.prompt", { text: "" });
    expect(resolveNodeRunReadiness(graph, "generate", catalog)).toMatchObject({
      ready: false,
      reasons: expect.arrayContaining(["INPUT_NOT_READY", "PROMPT_REQUIRED"]),
    });
  });

  it("rejects image parameters outside the selected model contract", () => {
    const rangedImageModel: RuntimeImageModel = {
      ...imageModel,
      parameters: {
        width: { ui: "range", required: true, min: 64, max: 1024, default: 512 },
      },
    };
    const generate = node("generate", "generate.image", {
      prompt: "quiet lake",
      modelKey: rangedImageModel.key,
      parameters: { width: 2048 },
    });

    expect(resolveNodeRunReadiness(
      { nodes: [generate], edges: [] },
      "generate",
      { ...catalog, imageModels: [rangedImageModel] },
    )).toMatchObject({ ready: false, reasons: ["PARAMETERS_INVALID"] });
  });

  it("accepts Gradio's numeric seed after image authoring preserves it as a string", () => {
    const gradioModel: RuntimeImageModel = {
      ...imageModel,
      key: "mrfakename-z-image-turbo-v2",
      label: "Gradio",
      parameters: {
        prompt: { required: true, binding: { source: "hf_space", parameterName: "prompt", order: 0, valueType: "string" } },
        width: { required: true, default: 1024, min: 256, max: 2048, binding: { source: "hf_space", parameterName: "width", order: 1, valueType: "number" } },
        height: { required: true, default: 1024, min: 256, max: 2048, binding: { source: "hf_space", parameterName: "height", order: 2, valueType: "number" } },
        steps: { required: true, default: 10, min: 1, max: 50, binding: { source: "hf_space", parameterName: "steps", order: 3, valueType: "number" } },
        seed: { required: false, default: 42, binding: { source: "hf_space", parameterName: "seed", order: 4, valueType: "number" } },
      },
    };
    const generate = node("generate", "generate.image", {
      prompt: "quiet lake",
      modelKey: gradioModel.key,
      parameters: { width: 1024, height: 1024, imageCount: 1, steps: 10, seed: "42" },
    });

    const readiness = resolveNodeRunReadiness(
      { nodes: [generate], edges: [] },
      "generate",
      { ...catalog, imageModels: [gradioModel] },
    );

    expect(readiness).toEqual({ ready: true, reasons: [] });
    expect(getPrimaryNodeRunReadinessReason(readiness)).toBeNull();
  });

  it("prioritizes an actionable blocked reason for the Run explanation", () => {
    const generate = node("generate", "generate.image", {
      prompt: "",
      modelKey: null,
      parameters: {},
    });
    const readiness = resolveNodeRunReadiness(
      { nodes: [generate], edges: [] },
      "generate",
      catalog,
    );

    expect(getPrimaryNodeRunReadinessReason(readiness)).toBe("MODEL_REQUIRED");
  });

  it("requires a ready init image only for image-to-video models", () => {
    const generate = node("generate", "generate.video", {
      prompt: "slow orbit",
      modelKey: "video-model",
      parameters: resolveRuntimeVideoDefaults(videoModel),
    });
    const graph = { nodes: [generate], edges: [] };

    expect(resolveNodeRunReadiness(graph, "generate", catalog)).toMatchObject({
      ready: false,
      reasons: expect.arrayContaining(["INPUT_REQUIRED"]),
    });

    const textOnlyModel = { ...videoModel, meta: { supports_init_image: false } };
    expect(resolveNodeRunReadiness(graph, "generate", { ...catalog, videoModels: [textOnlyModel] }))
      .toEqual({ ready: true, reasons: [] });
  });

  it("marks non-executable nodes invalid for the shared toolbar Run action", () => {
    const graph = { nodes: [node("input", "input.image", { assetId: "asset-1" })], edges: [] };
    expect(resolveNodeRunReadiness(graph, "input", catalog)).toEqual({
      ready: false,
      reasons: ["NODE_NOT_EXECUTABLE"],
    });
  });
});
