
import {describe,it,expect,vi} from "vitest";
import {buildGradioRequest,executeGradioContract} from "./contract-executor";
import type {GradioContract} from "@/shared/model-catalog/gradio-contract";
vi.mock("@gradio/client",()=>({handle_file:vi.fn(async v=>({uploaded:v}))}));
const contract:GradioContract={version:1,apiName:"/output_video",inputs:[
{name:"in_0",label:"Prompt",kind:"string",schema:{type:"string"},canonical:"prompt",nullable:false,required:true},
{name:"in_1",label:"Frame",kind:"file",schema:{},confirmed:true,nullable:true,required:true},
{name:"in_7",label:"Upsample",kind:"boolean",schema:{type:"boolean"},confirmed:true,nullable:false,required:false,default:false}],
output:{media:"video",path:[1],multiple:false},diagnostics:[],reviewed:true};
describe("Gradio contract executor",()=>{
it("명시한 이름과 null/default를 그대로 전송하고 두 번째 출력을 선택한다",async()=>{
const predict=vi.fn(async()=>({data:["done",{url:"https://test.hf.space/gradio_api/file=result.mp4"}]}));
const result=await executeGradioContract({predict},{providerConfig:{gradio_contract:contract}},{prompt:"hello",dynamicParams:{in_1:null}},{timeoutMs:1000,spaceUrl:"https://test.hf.space"},"video");
expect(predict).toHaveBeenCalledWith("/output_video",{in_0:"hello",in_1:null,in_7:false});expect(result).toHaveLength(1);
});
it("검토 플래그 없이 실행하고 알 수 없는 설정은 거절한다",async()=>{
await expect(buildGradioRequest({...contract,reviewed:false},{prompt:"hello",dynamicParams:{in_1:null}})).resolves.toEqual({in_0:"hello",in_1:null,in_7:false});
await expect(buildGradioRequest(contract,{dynamicParams:{unknown:1}})).rejects.toThrow("UNKNOWN_PARAMETER");
});
it("파일 필드별로 gallery 구조를 직렬화한다",async()=>{
const c={...contract,mappingConfirmed:true,inputs:[{name:"images",label:"Images",kind:"gallery" as const,schema:{},confirmed:true,nullable:false,required:true}]};
const result=await buildGradioRequest(c,{dynamicParams:{images:["data:image/png;base64,YQ=="]}});
expect(result.images).toMatchObject([{caption:null,image:{uploaded:expect.any(Blob)}}]);
});
});
