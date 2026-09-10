import { modalWorkflowSchema, modalInputContract, modalExecutionLimitsSchema } from "@/shared/model-catalog/modal-comfyui-contract";
import { assertGradioExecutable } from "@/shared/model-catalog/gradio-contract";
import { modelCatalogInputSchema } from "@/server/model-catalog/catalog-schema";

export function buildModalModelDraft(raw: unknown) {
 const workflow = modalWorkflowSchema.parse(raw);
 const contract = modalInputContract(workflow);
 assertGradioExecutable(contract);
 const parameters: Record<string,unknown> = {};
 for(const f of contract.inputs) parameters[f.name] = {
  ui:["file","files"].includes(f.kind) ? "upload" : f.choices ? "select" : f.kind === "boolean" ? "toggle" : f.kind === "number" ? "input" : "textarea",
  label:f.label, required:f.required, ...(f.default !== undefined ? {default:f.default} : {}),
  ...(f.min!==undefined?{min:f.min}:{}),...(f.max!==undefined?{max:f.max}:{}),
  ...(typeof f.schema.multipleOf==="number"?{step:f.schema.multipleOf}:f.schema.type==="integer"?{step:1}:{}),
  ...(f.choices?{options:f.choices}:{}),
 };
 const imageFields = contract.inputs.filter(f=>["file","files"].includes(f.kind)&&f.media==="image");
 const hasImage = imageFields.length > 0;
 const limits=modalExecutionLimitsSchema.parse(workflow.limits??{});
 return modelCatalogInputSchema.parse({
  type:workflow.category, key:"modal-"+workflow.id, label:workflow.name, vendor:"MODAL",
  provider:"modal_comfyui",
  providerConfig:{connection_id:"default",workflow_id:workflow.id,timeout_ms:900_000,workflow},
  parameters,
  meta:workflow.category === "image" ? {
   model_id:workflow.id,max_input_images:Math.min(limits.max_input_files,imageFields.reduce((n,f)=>n+(f.kind==="files"?(typeof f.schema.maxItems==="number"?f.schema.maxItems:limits.max_input_files):1),0)),concurrent_limit:1,
  } : {
   supports_init_image:hasImage,t2v_model_id:workflow.id,i2v_model_id:hasImage?workflow.id:null,
   concurrent_limit:1,
  },
  isActive:false,isDefault:false,
 });
}
