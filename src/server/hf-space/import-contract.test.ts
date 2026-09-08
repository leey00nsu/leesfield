import { getGradioContract } from "@/shared/model-catalog/gradio-contract";

import {describe,it,expect,vi} from "vitest";
import fixtures from "./fixtures/gradio-import-contract.json";
import {buildImportContract} from "./import-contract";
import {gradioInputValues,selectGradioOutput} from "@/shared/model-catalog/gradio-contract";
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
