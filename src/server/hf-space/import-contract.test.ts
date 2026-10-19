import { getGradioContract } from "@/shared/model-catalog/gradio-contract";

import {describe,it,expect,vi} from "vitest";
import fixtures from "./fixtures/gradio-import-contract.json";
import {buildImportContract} from "./import-contract";
import {gradioInputValues,selectGradioOutput,assessGradioSupport} from "@/shared/model-catalog/gradio-contract";
const connect=vi.hoisted(()=>vi.fn());
vi.mock("@gradio/client",()=>({Client:{connect}}));
// Model the SDK transformation instead of returning raw /info from view_api.
function sdkClient(f: typeof fixtures[number]) {
 const config=structuredClone(f.config);
 const named: Record<string,unknown>={};
 for(const [api, endpoint] of Object.entries(f.info.named_endpoints)) {
  if(!endpoint)continue;
  const dependency=config.dependencies.find(d=>d.api_name===api.slice(1))!;
  const convert=(items:Array<{type:Record<string,unknown>}>, ids:number[])=>items.map((p,i)=>{
   const component=config.components.find(c=>c.id===ids[i]);
   if(component)Object.assign(component,{api_info:p.type});
   return {...p,type:typeof p.type.type==="string"?p.type.type:"unknown"};
  });
  named[api]={parameters:convert(endpoint.parameters,dependency.inputs),returns:endpoint.returns};
 }
 return {config,view_api:async()=>({named_endpoints:named})};
}
describe("공개 Gradio 계약 회귀",()=>{
it("imports an explicit reference count without rewriting the source label or wire schema",async()=>{
 const {normalizeGradioModel,fileFieldMaxItems}=await import("@/shared/model-catalog/gradio-contract");
 const label="References (optional, up to 6)";
 const schema={type:"array",items:{title:"FileData",type:"object",properties:{path:{type:"string"}}}};
 const contract=buildImportContract("/generate",{parameters:[{parameter_name:"refs",label,component:"Gallery",type:schema,parameter_has_default:true,parameter_default:[]}],returns:[{component:"Image"}]},{});
 expect(contract.inputs[0]).toMatchObject({label,schema,fileLimit:6});
 expect(contract.inputs[0].schema).not.toHaveProperty("maxItems");
 const model=normalizeGradioModel({parameters:{} as Record<string,unknown>,providerConfig:{gradio_contract:contract}});
 expect(model.parameters.refs).toMatchObject({label,binding:{fileLimit:6,schema}});
 const restored=getGradioContract(model)!;
 expect(fileFieldMaxItems(restored.inputs[0])).toBe(6);
 expect(restored.inputs[0].label).toBe(label);
});
it("keeps public output indices while separating internal State inputs",()=>{
 const c=buildImportContract("/generate",{parameters:[{parameter_name:"session",component:"State",hidden:true,type:{type:"object"},parameter_has_default:true,parameter_default:{}}],returns:[{component:"Textbox"},{component:"Video"},{component:"Image"}]},{});
 expect(c.inputs).toEqual([]);
 expect(c.internalState).toEqual({inputs:[0],outputs:[]});
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 expect(c.output).toEqual({media:"video",path:[1],multiple:false});
 expect(c.diagnostics).toContain("OUTPUT_SELECTION_REVIEW");
 expect(selectGradioOutput(["status",{url:"video.mp4"},{url:"image.png"}],c)).toEqual({url:"video.mp4"});
});
it("aligns raw and SDK metadata around internal input and output State",async()=>{
 const {normalizeGradioModel}=await import("@/shared/model-catalog/gradio-contract");
 const config={components:[{id:1,type:"textbox",api_info:{type:"string"}},{id:2,type:"state"},{id:3,type:"slider",api_info:{type:"number"}},{id:4,type:"audio"}],dependencies:[{api_name:"speak",inputs:[1,2,3],outputs:[2,4]}]};
 const text={parameter_name:"dialogue",component:"Textbox",type:{type:"string"},parameter_has_default:false};
 const number={parameter_name:"temperature",component:"Slider",type:{type:"number"},parameter_has_default:true,parameter_default:0.7};
 const raw=buildImportContract("/speak",{parameters:[text,number],returns:[{component:"Audio"}]},config);
 const sdk=buildImportContract("/speak",{parameters:[text,{parameter_name:null,component:"State",hidden:true,parameter_default:null},number],returns:[{component:"Audio"}]},config);
 expect(sdk).toEqual(raw);
 expect(raw.inputs.map(field=>field.name)).toEqual(["dialogue","temperature"]);
 expect(raw.internalState).toEqual({inputs:[1],outputs:[0]});
 expect(raw.output).toEqual({media:"audio",path:[0],multiple:false});
 const model=normalizeGradioModel({parameters:{},providerConfig:{gradio_contract:sdk}});
 expect(model.providerConfig).toMatchObject({gradio_state:{inputs:[1],outputs:[0]}});
 expect(getGradioContract(model)?.inputs).toHaveLength(2);
 expect(gradioInputValues(getGradioContract(model)!,{dynamicParams:{dialogue:"Original script"}})).toEqual({dialogue:"Original script",temperature:0.7});
});
it("leaves ambiguous text roles unset and does not infer script by name",()=>{
 const field=(parameter_name:string)=>({parameter_name,component:"Textbox",type:{type:"string"}});
 const contract=buildImportContract("/render",{parameters:[field("prompt"),field("text"),field("script")],returns:[{component:"Audio"}]},{});
 expect(contract.inputs.every(input=>input.canonical===undefined)).toBe(true);
 expect(contract.diagnostics).toContain("AMBIGUOUS_PROMPT:prompt");
});
it("File media는 입력 file_types 근거로만 정하고 불명확 Gallery는 관리자 검토로 남긴다",()=>{
 const endpoint={parameters:[{parameter_name:"source",component:"File",type:{type:"array",items:{title:"FileData",type:"object",properties:{path:{type:"string"}}}}}],returns:[{component:"Image"}]};
 const configured=buildImportContract("/generate",endpoint,{components:[{id:1,type:"file",props:{file_types:[".mp4",".webm"]}}],dependencies:[{api_name:"generate",inputs:[1]}]});
 expect(configured.inputs[0]).toMatchObject({kind:"files",media:"video"});
 const ambiguous=buildImportContract("/generate",{...endpoint,parameters:[{...endpoint.parameters[0],component:"Gallery"}]},{});
 expect(ambiguous.inputs[0].media).toBeUndefined();
 expect(ambiguous.diagnostics).toContain("FILE_MEDIA_REVIEW:source");
});
it("false api와 객체형 label의 최소 재현 계약을 가져온다",async()=>{
 const {importModelDraftFromSpace}=await import("@/server/model-catalog/space-importer");
 for(const f of fixtures.slice(0,2)){
 connect.mockResolvedValue(sdkClient(f));
 const r=await importModelDraftFromSpace({spaceUrl:f.id});
 expect(r.draft.isActive).toBe(true);
 expect(r.draft.providerConfig.gradio_contract).toBeUndefined();
 expect(r.draft.providerConfig.output).toBeDefined();
 expect(r.warnings.some(w=>w.startsWith("SCHEMA_MISSING"))).toBe(false);
 }
});
it("Workflow 원본 이름과 nullable를 보존한다",()=>{
 const f=fixtures[2];const c=buildImportContract("/output_video",f.info.named_endpoints["/output_video" as keyof typeof f.info.named_endpoints],f.config);
 expect(c.inputs.map(i=>i.name)).toEqual(Array.from({length:9},(_,i)=>"in_"+i));
 expect(c.inputs[1].nullable).toBe(false);
 expect(c.diagnostics).toContain("OPTIONAL_LABEL_REVIEW:in_1");
 expect(c.output?.media).toBe("video");
});
it("Api의 불명확한 출력은 미확정으로 남긴다",()=>{
 const f=fixtures[3];const c=buildImportContract("/generate",f.info.named_endpoints["/generate" as keyof typeof f.info.named_endpoints],f.config);
 expect(c.output).toBeNull();expect(c.diagnostics).toContain("OUTPUT_MEDIA_UNRESOLVED");
});
it("이미지 생성 대신 depthmap을 선택하지 않는다",async()=>{
 const {importModelDraftFromSpace}=await import("@/server/model-catalog/space-importer");
 const f=fixtures[4];connect.mockResolvedValue({config:f.config,view_api:async()=>f.info});
 const r=await importModelDraftFromSpace({spaceUrl:f.id});
 expect(r.resolvedApiName).toBe("/infer");
});
it("null과 false를 유지하고 출력의 정확한 위치를 읽는다",()=>{
 const c={version:1 as const,apiName:"/generate",inputs:[{name:"frame",label:"Frame",schema:{},kind:"file" as const,required:true,nullable:true},{name:"flag",label:"Flag",schema:{},kind:"boolean" as const,required:false,nullable:false,default:true}],output:{media:"video" as const,path:[1,"video"],multiple:false},diagnostics:[],reviewed:true};
 expect(gradioInputValues(c,{dynamicParams:{frame:null,flag:false}})).toEqual({frame:null,flag:false});
 expect(()=>gradioInputValues(c,{})).toThrow("HF_CONTRACT_REQUIRED");
 expect(selectGradioOutput(["status",{video:"result.mp4"}],c)).toBe("result.mp4");
});
});

it("지원 범위 밖의 JSON schema를 무시하지 않고 거절한다",()=>{
 const base={version:1 as const,apiName:"/generate",inputs:[{name:"options",label:"Options",kind:"json" as const,required:true,nullable:false,schema:{type:"object",properties:{count:{type:"integer",minimum:1}},additionalProperties:false}}],output:{media:"image" as const,path:[0],multiple:false},reviewed:true,diagnostics:[]};
 expect(gradioInputValues(base,{dynamicParams:{options:{count:2}}})).toEqual({options:{count:2}});
 expect(()=>gradioInputValues(base,{dynamicParams:{options:{count:0}}})).toThrow("HF_CONTRACT_SCHEMA");
 expect(()=>gradioInputValues({...base,inputs:[{...base.inputs[0],schema:{$ref:"#/$defs/Options"}}]},{dynamicParams:{options:{}}})).toThrow("HF_CONTRACT_MAPPING_LIMITED");
});

it("SDK 문자열 타입을 component 원본 schema로 복원한다",async()=>{
 const {importModelDraftFromSpace}=await import("@/server/model-catalog/space-importer");
 const f=fixtures[2];connect.mockResolvedValue(sdkClient(f));
 const result=await importModelDraftFromSpace({spaceUrl:f.id});
 const contract=getGradioContract(result.draft)!;
 expect(contract.inputs[0]).toMatchObject({name:"in_0",schema:{type:"string"},canonical:"prompt"});
 expect(result.warnings).not.toContain("PROMPT_BINDING_REVIEW");
 expect(result.warnings.some(w=>w.startsWith("SCHEMA_MISSING")||w.startsWith("ANONYMOUS_PARAMETER"))).toBe(false);
 expect(result.warnings).toContain("OPTIONAL_LABEL_REVIEW:in_1");
});
it("입출력 전용 schema를 공통 component schema보다 우선한다",()=>{
 const c=buildImportContract("/render",{parameters:[{parameter_name:"text",type:"number"}],returns:[{type:"unknown",component:"Api"}]},{dependencies:[{api_name:"render",inputs:[1],outputs:[2]}],components:[{id:1,type:"custom",api_info:{type:"number"},api_info_as_input:{type:"string"}},{id:2,type:"api",api_info_as_output:{contentMediaType:"image/png"}}]});
 expect(c.inputs[0]).toMatchObject({kind:"string",schema:{type:"string"}});
 expect(c.output?.media).toBe("image");
});
