import workflows from "@/server/modal-comfyui/fixtures/workflows.json";
import { modalInputContract, modalWorkflowSchema } from "@/shared/model-catalog/modal-comfyui-contract";
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";

const workflow = modalWorkflowSchema.parse(workflows.find(item => item.id === "krea2-identity-edit"));
const kreaContract = modalInputContract(workflow);
export const identityEditModel: RuntimeImageModel = {
  type: "image", key: "modal-krea2-identity-edit", label: workflow.name,
  vendor: "Modal", provider: "modal_comfyui",
  providerConfig: { connection_id: "default", workflow_id: workflow.id, timeout_ms: 900000, workflow },
  parameters: Object.fromEntries(kreaContract.inputs.map(field => [field.name, {
    ui: field.hidden ? "hidden" : field.kind === "file" ? "upload" : "input",
    label: field.label, required: field.required,
    ...(field.default !== undefined ? { default: field.default } : {}),
  }])),
  meta: { max_input_images: 1 }, isActive: true, isDefault: true,
};

function mediaContract(output: "video" | "audio", media: "image" | "video" | "audio"): GradioContract {
  return {
    version: 1, apiName: "/generate",
    inputs: [
      { name: "text", label: "Prompt", kind: "string", canonical: "prompt", schema: { type: "string" }, required: true, nullable: false },
      { name: "source", label: media === "image" ? "First frame" : media === "video" ? "Source video" : "Reference audio", kind: "file", media, schema: {}, required: true, nullable: false },
      { name: "strength", label: "Strength", kind: "number", schema: { type: "number" }, default: 0.5, min: 0, max: 1, required: false, nullable: false },
    ],
    output: { media: output, path: [0], multiple: false }, diagnostics: [], reviewed: true,
  };
}
export const videoAttachmentModel: RuntimeVideoModel = {
  type: "video", key: "v2v-preview", label: "Video reference model", vendor: "Fixture", provider: "huggingface-space",
  providerConfig: { gradio_contract: mediaContract("video", "video") }, parameters: {},
  meta: {}, isActive: true, isDefault: true,
};
export const imageToVideoAttachmentModel: RuntimeVideoModel = {
  ...videoAttachmentModel, key: "i2v-preview", label: "Image to video model",
  providerConfig: { gradio_contract: mediaContract("video", "image") }, meta: { supports_init_image: true },
};
export const audioAttachmentModel: RuntimeAudioModel = {
  type: "audio", key: "a2a-preview", label: "Audio reference model", vendor: "Fixture", provider: "huggingface-space",
  providerConfig: { gradio_contract: mediaContract("audio", "audio") }, parameters: {},
  meta: { supports_input_audio: true }, isActive: true, isDefault: true,
};

/** A genuine array field, constrained by its provider schema and app setting. */
export const multiImageAttachmentModel: RuntimeImageModel = {
  type: "image", key: "multi-image-preview", label: "Multi image reference model", vendor: "Fixture", provider: "huggingface-space",
  providerConfig: {space_id:"fixture/references",api_name:"/generate",output:{media:"image",path:[0],multiple:false}},
  parameters:{
    text:{ui:"textarea",label:"Prompt",required:true,binding:{source:"hf_space",parameterName:"text",canonicalKey:"prompt",kind:"string",valueType:"string",schema:{type:"string"},order:0}},
    references:{ui:"upload",label:"Reference images",maxItems:3,required:true,binding:{source:"hf_space",parameterName:"references",kind:"files",valueType:"string",media:"image",schema:{type:"array",items:{type:"string"},minItems:1,maxItems:4},order:1}},
  },meta:{},isActive:true,isDefault:false,
};
