// @vitest-environment node
import {describe,it,expect,vi} from "vitest";
vi.mock("@/server/model-catalog/catalog-service",()=>({getModelCatalog:vi.fn()}));
import {modalInputContract,modalConfigSchema} from "@/shared/model-catalog/modal-comfyui-contract";
import {getGradioContract,gradioInputValues} from "@/shared/model-catalog/gradio-contract";
import {generationPayload} from "@/shared/model-catalog/generation-payload";
import {buildModalModelDraft} from "./importer";
import {executeModalWorkflow} from "./executor";
import type {ModalJobRecord,ModalJobRepository,ModalSubmission} from "./job-repository";
import {frozenExecutionModel,snapshotRequest} from "@/server/generation-request/request-snapshot";
import {getModelCatalog} from "@/server/model-catalog/catalog-service";
import {fileInputsFromAssets,contractInputPorts} from "@/shared/model-catalog/file-input-ports";
import {findPortDefinition} from "@/shared/generation-graph/node-registry";

const empty={type:"object",properties:{},required:[],additionalProperties:false};
const workflow=(properties:Record<string,unknown>={},required:string[]=[])=>({id:"new-unlisted-workflow",name:"New workflow",category:"image",output_media:["image"],input_schema:{...empty,properties,required},advanced_schema:empty});
const image={type:"string",format:"comfy-input-name","x-media":"image"};
function fixture(){
 let row:ModalJobRecord|null=null;
 const repository:ModalJobRepository={find:async()=>row,acquire:async(requestId,fingerprint)=>{row??={requestId,fingerprint,jobId:null,submission:null,createdAt:new Date(0)};return {...row,lease:"test"};},save:async(_id,_lease,patch)=>{Object.assign(row!,patch);},release:async()=>{}};
 const client={origin:"https://test.modal.run",upload:vi.fn(async(source:string,media?:string)=>`${media}-${source.split('/').pop()}`),download:vi.fn(async(_job:string,asset:number|string)=>({url:String(asset),bytes:1})),json:vi.fn(async(path:string,init?:RequestInit)=>path.endsWith("/assets")?{job_id:"job",assets:[{output_key:"images",asset_id:"final-id",media_type:"image",role:"result"},{output_key:"images",asset_id:"preview-id",media_type:"image",role:"preview"}],pagination:{has_more:false}}:{id:"job",status:init?.method==="POST"?"pending":"completed"})};
 return {repository,client,row:()=>row!};
}
describe("provider extensibility",()=>{
 it("preserves the declared schema dialect and nullable file branches",()=>{
  const raw=workflow({options:{type:"object",properties:{value:{type:"integer"}},unevaluatedProperties:false,default:{value:1}},source:{anyOf:[image,{type:"null"}],default:null}});
  Object.assign(raw.input_schema,{$schema:"https://json-schema.org/draft/2020-12/schema"});
  const contract=modalInputContract(raw);
  expect(contract.inputs.find(f=>f.name==="source")).toMatchObject({kind:"file",nullable:true,media:"image"});
  expect(gradioInputValues(contract,{})).toEqual({options:{value:1},source:null});
  expect(()=>gradioInputValues(contract,{dynamicParams:{options:{value:1,extra:2}}})).toThrow();
 });
 it("uses a server-declared filename default without downloading it from the client",async()=>{
  const draft=buildModalModelDraft(workflow({source:{...image,default:"builtin.png"}},["source"]));
  const f=fixture();await executeModalWorkflow(draft.providerConfig,{},"default-file",f.repository,{client:f.client});
  expect(f.client.upload).not.toHaveBeenCalled();
  expect(JSON.parse(f.client.json.mock.calls.find(c=>c[1]?.method==="POST")![1]!.body as string).inputs.source).toBe("builtin.png");
 });
 it("imports new IDs and promptless, nullable, nested and conditional schemas",()=>{
  const raw=workflow({mode:{type:"string",enum:["plain","mask"],default:"plain"},mask:{type:["string","null"],default:null},options:{type:"object",properties:{weights:{type:"array",items:{type:"number"},minItems:1}},required:["weights"],additionalProperties:false,default:{weights:[1,2]}}});
  Object.assign(raw.input_schema,{allOf:[{if:{properties:{mode:{const:"mask"}}},then:{properties:{mask:{type:"string",minLength:1}},required:["mask"]}}]});
  const draft=buildModalModelDraft(raw),contract=getGradioContract(draft)!;
  expect(contract.inputs.some(f=>f.canonical==="prompt")).toBe(false);
  expect(gradioInputValues(contract,{})).toEqual({mode:"plain",mask:null,options:{weights:[1,2]}});
  expect(()=>gradioInputValues(contract,{dynamicParams:{mode:"mask"}})).toThrow();
  expect(gradioInputValues(contract,{dynamicParams:{mode:"mask",mask:"foreground"}}).mask).toBe("foreground");
  expect(()=>gradioInputValues(contract,{dynamicParams:{options:{weights:["wrong"]}}})).toThrow();
 });
 it("applies only source-valid administrator overrides to the executed inputs",()=>{
  const draft=buildModalModelDraft(workflow({seed:{type:"integer",default:2,minimum:0,maximum:100}}));
  draft.parameters={seed:{ui:"input",default:77,label:"Seed"}};
  expect(gradioInputValues(getGradioContract(draft)!,{})).toEqual({seed:77});
  draft.parameters={seed:{ui:"input",default:101}};
  expect(()=>getGradioContract(draft)).toThrow("MODAL_DEFAULT_INVALID");
 });
 it("rejects duplicate namespaces and unsupported schemas during import",()=>{
  const raw=workflow({seed:{type:"integer",default:1}});
  expect(()=>modalInputContract({...raw,advanced_schema:raw.input_schema})).toThrow("MODAL_DUPLICATE_INPUT");
  expect(()=>modalInputContract(workflow({value:{$ref:"https://example.com/schema"}}))).toThrow();
  expect(modalConfigSchema.safeParse({...buildModalModelDraft(raw).providerConfig,workflow_id:"../outside"}).success).toBe(false);
 });
 it("binds image/mask and multiple video files by exact field and preserves order",async()=>{
  const draft=buildModalModelDraft(workflow({source:image,mask:image,clips:{type:"array",items:{type:"string",format:"comfy-input-name","x-media":"video"},maxItems:2}},["source","mask","clips"]));
  const assets=[{portId:"image-field-source",url:"https://files/source.png"},{portId:"image-field-mask",url:"https://files/mask.png"},{portId:"video-field-clips",url:"https://files/a.mp4"},{portId:"video-field-clips",url:"https://files/b.mp4"}];
  const payload=generationPayload(draft,{model:draft.key,fileInputs:fileInputsFromAssets(assets)})!;
  const values=gradioInputValues(getGradioContract(draft)!,payload);
  expect(values).toEqual({source:assets[0].url,mask:assets[1].url,clips:[assets[2].url,assets[3].url]});
  expect(contractInputPorts(draft)?.map(p=>p.name)).toEqual(["image-field-source","image-field-mask","video-field-clips"]);
  expect(findPortDefinition("generate.image","video-field-clips","input")?.valueType).toBe("video");
  const f=fixture();
  expect((await executeModalWorkflow(draft.providerConfig,payload,"request",f.repository,{client:f.client})).urls).toEqual(["final-id"]);
  expect(f.client.upload.mock.calls.map(c=>c[1])).toEqual(["image","image","video","video"]);
  const submitted=JSON.parse(f.client.json.mock.calls.find(c=>c[1]?.method==="POST")![1]!.body as string);
  expect(submitted.inputs.clips).toEqual(["video-a.mp4","video-b.mp4"]);
  expect(submitted).not.toHaveProperty("execution");
  expect(f.client.download).toHaveBeenCalledExactlyOnceWith("job","final-id","image",expect.any(Number));
  expect(()=>gradioInputValues(getGradioContract(draft)!,generationPayload(draft,{initImages:[assets[0].url]})!)).toThrow();
 });
 it("collects the same completed job after contract drift without reupload or POST",async()=>{
  const config=buildModalModelDraft(workflow({source:image},["source"])).providerConfig;
  const f=fixture();
  await executeModalWorkflow(config,{dynamicParams:{source:"https://files/original.png"}},"request",f.repository,{client:f.client});
  const frozen=(f.row().submission as ModalSubmission).execution!;
  expect(frozen.values.source).toBe("https://files/original.png");
  f.client.json.mockClear();f.client.upload.mockClear();
  await executeModalWorkflow({invalid:"changed model"},{},"request",f.repository,{client:f.client});
  expect(f.client.upload).not.toHaveBeenCalled();
  expect(f.client.json.mock.calls.every(c=>!c[1]?.method)).toBe(true);
 });
 it("freezes a serializable model and rejects a mismatched recovery target",async()=>{
  const draft=buildModalModelDraft(workflow({seed:{type:"integer",default:2}}));
  const model={...draft,id:"model",createdAt:new Date(),updatedAt:new Date(),isActive:true,isDefault:false};
  vi.mocked(getModelCatalog).mockResolvedValue([model]);
  const stored=await snapshotRequest("image",{model:draft.key,prompt:""});
  expect(frozenExecutionModel(stored,"image",draft.key)?.providerConfig).toEqual(model.providerConfig);
  expect(()=>frozenExecutionModel(stored,"video",draft.key)).toThrow("EXECUTION_MODEL_MISMATCH");
 });
 it("enforces configured input count before upload and output count before download",async()=>{
  const draft=buildModalModelDraft(workflow({sources:{type:"array",items:image}},["sources"]));
  const f=fixture(),config={...draft.providerConfig,limits:{max_input_files:1}};
  await expect(executeModalWorkflow(config,{dynamicParams:{sources:["https://files/a.png","https://files/b.png"]}},"request",f.repository,{client:f.client})).rejects.toThrow("MODAL_INPUT_COUNT_LIMIT");
  expect(f.client.upload).not.toHaveBeenCalled();
  const other=fixture();
  await expect(executeModalWorkflow({...draft.providerConfig,limits:{max_assets:1}},{dynamicParams:{sources:[]}},"other",other.repository,{client:other.client})).rejects.toThrow("MODAL_OUTPUT_COUNT_LIMIT");
  expect(other.client.download).not.toHaveBeenCalled();
 });
});
