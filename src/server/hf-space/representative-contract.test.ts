// @vitest-environment node

import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
import {buildImportContract} from "./import-contract";
import {executeGradioContract} from "./contract-executor";
import samples from "./fixtures/provider-contract-compatibility.json";
import {modelCatalogInputSchema} from "@/server/model-catalog/catalog-schema";
import {getGradioContract,gradioInputValues} from "@/shared/model-catalog/gradio-contract";
import {assessGradioSupport} from "@/shared/model-catalog/gradio-contract";
vi.mock("@gradio/client",()=>({handle_file:vi.fn(async value=>({uploaded:value}))}));
const prompt={parameter_name:"prompt",label:"Prompt",component:"Textbox",type:{type:"string"},parameter_has_default:false};
const file=(name:string,component:string)=>({parameter_name:name,label:name,component,type:{title:"FileData"},parameter_has_default:false});
describe("새로운 endpoint 계약 유형의 공통 실행",()=>{
 it.each(samples)("$id: captured source survives catalog roundtrip with original names and typed defaults",sample=>{
  const c=buildImportContract(sample.api,sample.endpoint,sample.config);
  expect(c.output?.media).toBe(sample.expectedMedia);
  expect(c.inputs.map(field=>field.name)).toEqual(sample.endpoint.parameters.map(parameter=>parameter.parameter_name));
  // Mixed Gallery/File components require an explicit input media decision.
  const before=assessGradioSupport(c);
  for(const field of c.inputs)if(["files","gallery"].includes(field.kind)&&!field.media)field.media="image";
  const draft=modelCatalogInputSchema.parse({type:sample.expectedMedia,key:"captured",label:sample.id,vendor:"HF",provider:"hf_space",providerConfig:{space_id:sample.canonical,space_url:sample.origin,api_name:sample.api,gradio_contract:c},parameters:{},meta:{},isActive:false});
  const restored=getGradioContract(modelCatalogInputSchema.parse(JSON.parse(JSON.stringify(draft))))!;
  expect(restored.inputs.map(field=>field.name)).toEqual(c.inputs.map(field=>field.name));
  expect(restored.inputs.map(field=>field.default)).toEqual(c.inputs.map(field=>field.default));
  expect(assessGradioSupport(restored).limitations).toEqual([]);
  expect(assessGradioSupport(restored).status).not.toBe("unsupported");
  if(sample.id==="hugging-apps/turbo8-qwen-image-2-1"){
   expect(before.corrections).toContain("FILE_MEDIA_UNRESOLVED:input_images");
   const resolution=restored.inputs.find(field=>field.name==="resolution")!;
   expect(resolution).toMatchObject({kind:"number",default:1024,choices:[1024,1536,2048]});
   expect(gradioInputValues({...restored,inputRules:undefined,inputs:[resolution]},{}).resolution).toBe(1024);
  }
 });
 it.each(["image","video","audio"] as const)("%s: importer 계약부터 원본 wire와 복수 반환값 선택까지",async media=>{
 const parameters=[prompt,...(media==="image"?[{...file("references","File"),type:{type:"array",items:{title:"FileData"}}}]:media==="video"?[file("first_frame","Image"),{...file("last_frame","Image"),type:{type:"null"}}]:[file("reference_audio","Audio")])];
 const c=buildImportContract("/render",{parameters,returns:[{component:"Textbox"},{component:media[0].toUpperCase()+media.slice(1)}]},{});
 if(media==="image"){expect(assessGradioSupport(c).corrections).toContain("FILE_MEDIA_UNRESOLVED:references");c.inputs.find(field=>field.name==="references")!.media="image";}
 expect(assessGradioSupport(c).status).toBe("auto_mapped");
 c.reviewed=true;
 const data=media==="audio"?"data:audio/wav;base64,"+readFileSync("public/assets/storybook/tone.wav").toString("base64"):"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
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
