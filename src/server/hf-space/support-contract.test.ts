
import {describe,it,expect,vi} from "vitest";
import {assessGradioSupport, type GradioContract} from "@/shared/model-catalog/gradio-contract";
import {buildGradioRequest} from "./contract-executor";
import {buildImportContract} from "./import-contract";
vi.mock("@gradio/client",()=>({handle_file:vi.fn()}));
const base:GradioContract={version:1,apiName:"/generate",inputs:[{name:"prompt",label:"Prompt",kind:"string",schema:{type:"string"},canonical:"prompt",required:true,nullable:false}],output:{media:"image",path:[0],multiple:false},diagnostics:[],reviewed:true};
describe("자동 매핑과 실행 한계",()=>{
 it.each(["imageeditor","custom_widget","colorpicker"])("%s 이름만으로 scalar 계약을 막지 않는다",async component=>{
 const c={...base,inputs:[{...base.inputs[0],component}]};
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 expect(await buildGradioRequest(c,{prompt:"test"})).toEqual({prompt:"test"});
 });
 it("state 입력은 실제 세션 의존성으로 차단한다",async()=>{
 const c={...base,inputs:[{...base.inputs[0],component:"state"}]};
 expect(assessGradioSupport(c).status).toBe("unsupported");
 await expect(buildGradioRequest(c,{prompt:"test"})).rejects.toThrow("UNSUPPORTED");
 });
 it("미해결 참조는 Space 미지원이 아니라 매핑 한계다",async()=>{
 const c={...base,inputs:[{...base.inputs[0],kind:"json" as const,schema:{$ref:"#/missing"}}]};
 expect(assessGradioSupport(c).status).toBe("mapping_limited");
 await expect(buildGradioRequest(c,{prompt:"test"})).rejects.toThrow("MAPPING_LIMITED");
 });
 it("익명 이름과 optional 라벨은 명시적 API 계약을 바꾸지 않는다",async()=>{
 const c={...base,inputs:[{...base.inputs[0],name:"in_0",label:"Optional text",canonical:undefined}]};
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 expect(await buildGradioRequest(c,{dynamicParams:{in_0:"hello"}})).toEqual({in_0:"hello"});
 await expect(buildGradioRequest(c,{})).rejects.toThrow("REQUIRED");
 });
 it("trigger_after와 endpoint 이름으로 세션/학습 여부를 단정하지 않는다",()=>{
 const c=buildImportContract("/train_preview",{parameters:[{parameter_name:"prompt",component:"Textbox",type:{type:"string"},parameter_has_default:false}],returns:[{component:"Image"}]},{dependencies:[{api_name:"train_preview",trigger_after:0,inputs:[],outputs:[]}]});
 expect(c.requiresSession).toBe(false);
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 });
 it("출력이 지정되면 별도 검토 플래그 없이 실행한다",()=>{
 expect(assessGradioSupport({...base,output:null}).status).toBe("needs_configuration");
 expect(assessGradioSupport({...base,diagnostics:["OUTPUT_SELECTION_REVIEW"]}).status).toBe("auto_mapped");
 expect(assessGradioSupport({...base,diagnostics:["OUTPUT_SELECTION_REVIEW"],mappingConfirmed:true}).status).toBe("auto_mapped");
 });
 it("참조 및 조합 schema를 그대로 검증하고 원본 키로 보낸다",async()=>{
 const schema={$defs:{Count:{type:"integer",minimum:1}},type:"object",properties:{count:{$ref:"#/$defs/Count"},value:{anyOf:[{type:"string"},{type:"number"}]}},required:["count","value"],additionalProperties:false};
 const c={...base,inputs:[{name:"options",label:"Options",kind:"json" as const,schema,nullable:false,required:true}]};
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 expect(await buildGradioRequest(c,{dynamicParams:{options:{count:2,value:3}}})).toEqual({options:{count:2,value:3}});
 await expect(buildGradioRequest(c,{dynamicParams:{options:{count:0,value:3}}})).rejects.toThrow("SCHEMA");
 });
 it("nullable 참조와 복합 scalar는 이름 대신 schema에서 매핑한다",async()=>{
 const c=buildImportContract("/render",{parameters:[{parameter_name:"param_1",component:"Custom",type:{$defs:{Value:{anyOf:[{type:"string"},{type:"number"},{type:"null"}]}},$ref:"#/$defs/Value"},parameter_has_default:false}],returns:[{component:"Image"}]},{});
 expect(c.inputs[0]).toMatchObject({kind:"json",nullable:true});
 expect(assessGradioSupport(c).status).toBe("auto_mapped");c.reviewed=true;
 expect(await buildGradioRequest(c,{dynamicParams:{param_1:null}})).toEqual({param_1:null});
 expect(await buildGradioRequest(c,{dynamicParams:{param_1:4}})).toEqual({param_1:4});
 });
});

it("비표준 출력도 명시된 MIME schema에서 매핑한다",()=>{
 const c=buildImportContract("/render",{parameters:[{parameter_name:"prompt",component:"Textbox",type:{type:"string"},parameter_has_default:false}],returns:[{component:"Api",type:{type:"object",properties:{mime_type:{const:"video/mp4"},url:{type:"string"}}}}]},{});
 expect(c.output).toEqual({media:"video",path:[0],multiple:false});
});
it("중첩 파일 변환 미구현은 실행 미지원과 구분한다",()=>{
 const c={...base,inputs:[{...base.inputs[0],kind:"json" as const,schema:{type:"object",properties:{image:{$ref:"#/$defs/FileData"}},$defs:{FileData:{title:"FileData",type:"object",properties:{path:{type:"string"}}}}}}]};
 expect(assessGradioSupport(c)).toMatchObject({status:"mapping_limited",blockers:[],limitations:["NESTED_FILE_CONVERSION:prompt"]});
});

it("oneOf의 배타성과 allOf 제약을 보존한다",async()=>{
 const c={...base,inputs:[{...base.inputs[0],canonical:undefined,kind:"json" as const,schema:{allOf:[{oneOf:[{type:"integer"},{type:"string"}]},{not:{const:0}}]}}]};
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 expect(await buildGradioRequest(c,{dynamicParams:{prompt:2}})).toEqual({prompt:2});
 await expect(buildGradioRequest(c,{dynamicParams:{prompt:0}})).rejects.toThrow("SCHEMA");
 const overlapping={...c,inputs:[{...c.inputs[0],schema:{oneOf:[{type:"number"},{type:"integer"}]}}]};
 await expect(buildGradioRequest(overlapping,{dynamicParams:{prompt:2}})).rejects.toThrow("SCHEMA");
});
