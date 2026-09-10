import { z } from "zod";
import type { GradioContract, GradioField } from "./gradio-contract";
import { gradioSchemaValidator, resolveGradioSchema } from "./gradio-json-schema";

export const modalWorkflowIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const fieldKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).refine(v => !["constructor", "prototype", "__proto__"].includes(v) && !v.startsWith("advanced__"));
const property = z.record(z.string(), z.unknown());
const inputSchema = z.object({ type:z.literal("object"), properties:z.record(fieldKey, property), required:z.array(fieldKey).default([]), additionalProperties:z.literal(false) }).passthrough();
export const modalExecutionLimitsSchema = z.object({
 request_timeout_ms:z.number().int().min(1000).max(3_600_000).default(30_000),
 upload_timeout_ms:z.number().int().min(1000).max(3_600_000).default(120_000),
 result_timeout_ms:z.number().int().min(1000).max(3_600_000).default(60_000),
 max_assets:z.number().int().min(1).max(1000).default(16),
 max_input_files:z.number().int().min(1).max(1000).default(64),
 max_output_bytes:z.number().int().min(1024).max(2_147_483_647).default(268_435_456),
 max_input_bytes:z.number().int().min(1024).max(536_870_912).default(20_971_520),
}).strict();
export const modalWorkflowSchema = z.object({
 id:modalWorkflowIdSchema, name:z.string().min(1), version:z.string().optional(),
 category:z.enum(["image","video"]), output_media:z.array(z.enum(["image","video"])).length(1),
 input_schema:inputSchema, advanced_schema:inputSchema,
 ui_workflow_file:z.string().optional(), job_path:z.string().optional(),
 limits:modalExecutionLimitsSchema.partial().optional(),
}).passthrough().superRefine((w,ctx)=>{
 if(w.category!==w.output_media[0]) ctx.addIssue({code:"custom",message:"MODAL_WORKFLOW_MEDIA"});
 for(const name of Object.keys(w.advanced_schema.properties)) if(name in w.input_schema.properties) ctx.addIssue({code:"custom",message:"MODAL_DUPLICATE_INPUT:"+name});
});
export type ModalWorkflow=z.infer<typeof modalWorkflowSchema>;
export const modalConfigSchema=z.object({
 connection_id:z.literal("default"), workflow_id:modalWorkflowIdSchema,
 timeout_ms:z.number().int().min(1000).max(86_400_000).default(900_000),
 limits:modalExecutionLimitsSchema.partial().optional(), workflow:modalWorkflowSchema,
}).strict().superRefine((c,ctx)=>{
 if(c.workflow_id!==c.workflow.id)ctx.addIssue({code:"custom",message:"MODAL_WORKFLOW_ID"});
 try{modalInputContract(c.workflow);}catch(error){ctx.addIssue({code:"custom",message:error instanceof Error?error.message:"MODAL_WORKFLOW_SCHEMA"});}
});
export type ModalConfig=z.infer<typeof modalConfigSchema>;
export function modalExecutionLimits(config:ModalConfig){return modalExecutionLimitsSchema.parse({...config.workflow.limits,...config.limits});}
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** Extensions describe UI/file semantics; validation keeps the source JSON Schema. */
function validationSchema(value:unknown):unknown {
 if(Array.isArray(value))return value.map(validationSchema);
 if(!value||typeof value!=="object")return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!key.startsWith("x-")).map(([key,v])=>[key,
  ["properties","patternProperties","$defs","definitions"].includes(key)
   ? Object.fromEntries(Object.entries(record(v)).map(([name,schema])=>[name,validationSchema(schema)]))
   : validationSchema(v)]));
}
export function modalInputContract(raw:unknown, parameters?:unknown):GradioContract {
 const workflow=modalWorkflowSchema.parse(raw),inputs:GradioField[]=[];
 const definitions=record(parameters);
 const groups:NonNullable<GradioContract["inputGroups"]>=[];
 for(const section of ["input_schema","advanced_schema"] as const){
  const group=workflow[section],advanced=section==="advanced_schema",prefix=advanced?"advanced__":"";
  if(group.required.some(name=>!Object.hasOwn(group.properties,name)))throw new Error("MODAL_REQUIRED_INPUT_UNDECLARED");
  const root=validationSchema(group) as Record<string,unknown>;
  gradioSchemaValidator(root);
  groups.push({prefix,schema:root});
  for(const [name,source] of Object.entries(group.properties)){
   const resolved=resolveGradioSchema(source,group);
   const branches=Array.isArray(resolved.anyOf)?resolved.anyOf:Array.isArray(resolved.oneOf)?resolved.oneOf:[];
   const nonNull=branches.map(record).filter(s=>s.type!=="null");
   const p=branches.length===2&&nonNull.length===1&&typeof nonNull[0].type==="string"?{...nonNull[0],...resolved,type:[nonNull[0].type,"null"]}:resolved;
   const types=Array.isArray(p.type)?p.type:[p.type];
   const array=types.includes("array"),item=record(p.items);
   const file=p.format==="comfy-input-name"||(array&&item.format==="comfy-input-name");
   const media=p["x-media"]??item["x-media"]??(file?"image":undefined);
   if(file&&(!["image","video","audio"].includes(String(media))||!(types.includes("string")||array)))throw new Error("MODAL_FILE_TYPE");
   const schema=validationSchema(p) as Record<string,unknown>;
   if(root.$schema)schema.$schema=root.$schema;
   if(root.$defs)schema.$defs=root.$defs;
   if(root.definitions)schema.definitions=root.definitions;
   if(types.includes("integer")){
    schema.maximum=Math.min(typeof p.maximum==="number"?p.maximum:Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
    schema.minimum=Math.max(typeof p.minimum==="number"?p.minimum:Number.MIN_SAFE_INTEGER,Number.MIN_SAFE_INTEGER);
   }
   const key=prefix+name,override=record(definitions[key]);
   const defaultValue=Object.hasOwn(override,"default")?override.default:p.default;
   if(defaultValue!==undefined&&!gradioSchemaValidator(schema)(defaultValue))throw new Error("MODAL_DEFAULT_INVALID:"+name);
   const choices=Array.isArray(p.enum)&&p.enum.every(v=>typeof v==="string"||typeof v==="number")?p.enum as (string|number)[]:undefined;
   const kind:GradioField["kind"]=file?(array?"files":"file"):types.filter(t=>t!=="null").length!==1?"json":types.includes("integer")||types.includes("number")?"number":types.includes("boolean")?"boolean":types.includes("string")?"string":"json";
   if(p["x-role"]==="prompt"&&(advanced||kind!=="string"))throw new Error("MODAL_PROMPT_BINDING_TYPE");
   if(kind==="json"&&JSON.stringify(p).includes('"comfy-input-name"'))throw new Error("MODAL_NESTED_FILE_BINDING_REQUIRED:"+name);
   if(file) (root.properties as Record<string,unknown>)[name]=array?{type:types,items:{type:"string"},...(p.minItems!==undefined?{minItems:p.minItems}:{}),...(p.maxItems!==undefined?{maxItems:p.maxItems}:{})}:{type:types};
   inputs.push({name:key,label:typeof override.label==="string"?override.label:typeof p.title==="string"?p.title:(advanced?"Advanced · ":"")+name,
    schema,kind,required:group.required.includes(name),nullable:gradioSchemaValidator(schema)(null),
    ...(defaultValue!==undefined?{default:defaultValue as GradioField["default"]}:{}),
    ...(!advanced&&(p["x-role"]==="prompt"||(p["x-role"]===undefined&&name==="prompt"))?{canonical:"prompt" as const}:{}),
    ...(file?{media:media as "image"|"video"|"audio"}:{}),...(choices?{choices}:{}),
    ...(typeof schema.minimum==="number"?{min:schema.minimum}:{}),...(typeof schema.maximum==="number"?{max:schema.maximum}:{}),
   });
  }
 }
 if(inputs.filter(f=>f.canonical==="prompt").length>1)throw new Error("MODAL_PROMPT_BINDING_AMBIGUOUS");
 return {version:1,apiName:"/workflows/"+workflow.id,inputs,inputGroups:groups,output:{media:workflow.category,path:[],multiple:true},diagnostics:[],reviewed:true};
}
