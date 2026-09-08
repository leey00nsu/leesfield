
import {describe,it,expect,vi} from "vitest";
import {buildImportContract} from "./import-contract";
import {executeGradioContract} from "./contract-executor";
import {assessGradioSupport} from "@/shared/model-catalog/gradio-contract";
vi.mock("@gradio/client",()=>({handle_file:vi.fn(async value=>({uploaded:value}))}));
const prompt={parameter_name:"prompt",label:"Prompt",component:"Textbox",type:{type:"string"},parameter_has_default:false};
const file=(name:string,component:string)=>({parameter_name:name,label:name,component,type:{title:"FileData"},parameter_has_default:false});
describe("새로운 endpoint 계약 유형의 공통 실행",()=>{
 it.each(["image","video","audio"] as const)("%s: importer 계약부터 원본 wire와 복수 반환값 선택까지",async media=>{
 const parameters=[prompt,...(media==="image"?[{...file("references","File"),type:{type:"array",items:{title:"FileData"}}}]:media==="video"?[file("first_frame","Image"),{...file("last_frame","Image"),type:{type:"null"}}]:[file("reference_audio","Audio")])];
 const c=buildImportContract("/render",{parameters,returns:[{component:"Textbox"},{component:media[0].toUpperCase()+media.slice(1)}]},{});
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 c.reviewed=true;
 const data="data:"+ (media==="audio"?"audio/wav":"image/png")+";base64,YQ==";
 const values=media==="image"?{references:[data,data]}:media==="video"?{first_frame:data,last_frame:null}:{reference_audio:data};
 const predict=vi.fn(async()=>({data:["done",{url:"https://example.hf.space/gradio_api/file=result."+ (media==="image"?"png":media==="video"?"mp4":"wav")}]}));
 const refs=await executeGradioContract({predict},{providerConfig:{gradio_contract:c}},{prompt:"hello",dynamicParams:values},{timeoutMs:1000,spaceUrl:"https://example.hf.space"},media);
 expect(predict.mock.calls[0]).toEqual(["/render",expect.objectContaining({prompt:"hello"})]);
 const sent=(predict.mock.calls as unknown as Array<[string,Record<string,unknown>]>)[0][1];
 if(media==="image") expect(sent.references).toEqual([{uploaded:expect.any(Blob)},{uploaded:expect.any(Blob)}]);
 if(media==="video") {expect(sent.last_frame).toBeNull();expect(sent.first_frame).toEqual({uploaded:expect.any(Blob)});}
 if(media==="audio") expect(sent.reference_audio).toEqual({uploaded:expect.any(Blob)});
 expect(refs[0].normalizedUrl).toContain("result.");
 });
 it("미디어 출력이 없는 계약은 predict 전에 거절한다",async()=>{
 const c=buildImportContract("/render",{parameters:[prompt],returns:[{component:"Api"}]},{});
 c.reviewed=true; const predict=vi.fn();
 await expect(executeGradioContract({predict},{providerConfig:{gradio_contract:c}},{prompt:"test"},{timeoutMs:1000,spaceUrl:"https://example.hf.space"},"video")).rejects.toThrow("HF_CONTRACT_MEDIA");
 expect(predict).not.toHaveBeenCalled();
 });
 it("목록에 없는 필드를 요청하면 predict 전에 거절한다",async()=>{
 const c=buildImportContract("/render",{parameters:[prompt],returns:[{component:"Image"}]},{});
 c.reviewed=true;const predict=vi.fn();
 await expect(executeGradioContract({predict},{providerConfig:{gradio_contract:c}},{prompt:"hello",dynamicParams:{other:1}},{timeoutMs:1000,spaceUrl:"https://example.hf.space"},"image")).rejects.toThrow("UNKNOWN_PARAMETER");
 expect(predict).not.toHaveBeenCalled();
 });
});
