// @vitest-environment node
import Ajv2020 from "ajv/dist/2020";
import {getExternalModelInput} from "@/server/external-api/model-input";
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
import {resolveContractGenerationCapabilities} from "@/shared/model-catalog/modality";

const empty={type:"object",properties:{},required:[],additionalProperties:false};
const workflow=(properties:Record<string,unknown>={},required:string[]=[])=>({id:"new-unlisted-workflow",name:"New workflow",category:"image",output_media:["image"],input_schema:{...empty,properties,required},advanced_schema:empty});
const image={type:"string",format:"comfy-input-name","x-media":"image"};
function fixture(){
 let row:ModalJobRecord|null=null;
 const repository:ModalJobRepository={find:async()=>row,acquire:async(requestId,fingerprint)=>{row??={requestId,fingerprint,jobId:null,submission:null,createdAt:new Date(0)};return {...row,lease:"test"};},save:async(_id,_lease,patch)=>{Object.assign(row!,patch);},release:async()=>{}};
 const client={origin:"https://test.modal.run",upload:vi.fn(async(source:string,media?:string)=>`${media}-${source.split('/').pop()}`),download:vi.fn(async(_job:string,asset:number|string)=>({buffer:Buffer.from(String(asset)),contentType:"image/png",bytes:1})),json:vi.fn(async(path:string,init?:RequestInit):Promise<unknown>=>path.endsWith("/assets")?{job_id:"job",assets:[{output_key:"images",asset_id:"final-id",media_type:"image",role:"result"},{output_key:"images",asset_id:"preview-id",media_type:"image",role:"preview"}],pagination:{has_more:false}}:{id:"job",status:init?.method==="POST"?"pending":"completed"})};
 return {repository,client,row:()=>row!};
}
describe("provider extensibility",()=>{
 it("requires an explicit relationship and rejects orphan audio without changing source schemas",()=>{
  const properties={clips:{type:"array",default:[],maxItems:3,items:{type:"string",format:"comfy-input-name","x-media":"video"}},
    tracks:{type:"array",default:[],maxItems:3,items:{anyOf:[{type:"string",format:"comfy-input-name","x-media":"audio"},{type:"null"}]}}};
  const raw=workflow(properties),independent=buildModalModelDraft(raw);
  expect(getGradioContract(independent)!.inputs[1].attachment).toBeUndefined();
  expect(gradioInputValues(getGradioContract(independent)!,{dynamicParams:{tracks:["https://files/a.wav"]}}).tracks).toHaveLength(1);
  const relation={role:"paired_audio",pairedWith:"clips",pairing:"index"};
  const native=buildModalModelDraft(workflow({...properties,tracks:{...properties.tracks,"x-attachment":relation}}));
  expect(getGradioContract(native)!.inputs[1].attachment).toEqual(relation);
  const overridden={...independent,parameters:{...independent.parameters,tracks:{...independent.parameters.tracks,attachment:relation}}};
  const contract=getGradioContract(overridden)!;
  expect(contract.inputs[1].attachment).toEqual(relation);
  expect(resolveContractGenerationCapabilities(contract,"video").modalities).toEqual(["T2V","V2V"]);
  const withIndependent=getGradioContract(buildModalModelDraft(workflow({...properties,tracks:{...properties.tracks,"x-attachment":relation},independent:properties.tracks})))!;
  expect(resolveContractGenerationCapabilities(withIndependent,"video").modalities).toContain("A2V");
  expect(overridden.providerConfig.workflow.input_schema.properties.tracks).not.toHaveProperty("x-attachment");
  const videos=["https://files/a.mp4","https://files/b.mp4"],audio=[null,"https://files/b.wav"];
  expect(gradioInputValues(contract,{dynamicParams:{clips:videos,tracks:audio}})).toEqual({clips:videos,tracks:audio});
  expect(()=>gradioInputValues(contract,{dynamicParams:{tracks:audio}})).toThrow("HF_CONTRACT_ATTACHMENT_ORPHAN:tracks");
  expect(()=>getGradioContract({...overridden,parameters:{...overridden.parameters,tracks:{...overridden.parameters.tracks,attachment:{...relation,pairedWith:"missing"}}}})).toThrow();
  expect(()=>getGradioContract({...overridden,parameters:{...overridden.parameters,clips:{...independent.parameters["clips"],attachment:relation}}})).toThrow();
  expect(getGradioContract({...native,parameters:{...native.parameters,tracks:{...native.parameters.tracks,attachment:null}}})!.inputs[1].attachment).toBeUndefined();
  expect((generationPayload(overridden,{dynamicParams:{tracks:[null,null,null]},fileInputs:{clips:videos,tracks:["https://files/a.wav"]}}) as {dynamicParams:unknown}).dynamicParams).toEqual({clips:videos,tracks:["https://files/a.wav",null,null]});
 });
 it.each(["anyOf","oneOf"])("imports and uploads %s nullable file items without moving slots",async union=>{
  const audio={type:"string",format:"comfy-input-name","x-media":"audio",pattern:"^audio-.*[.]wav$"};
  const raw=workflow({tracks:{type:"array",items:{[union]:[audio,{type:"null"}]},default:[],maxItems:3}});
  const draft=buildModalModelDraft(raw),contract=getGradioContract(draft)!;
  expect(contract.inputs[0]).toMatchObject({kind:"files",media:"audio",nullable:false});
  const sources=["https://files/a.wav",null,"https://files/c.wav"];
  expect(gradioInputValues(contract,{dynamicParams:{tracks:sources}}).tracks).toEqual(sources);
  expect(()=>gradioInputValues(contract,{dynamicParams:{tracks:[false]}})).toThrow();
  expect(()=>gradioInputValues(contract,{dynamicParams:{tracks:[null,null,null,null]}})).toThrow();
  const f=fixture();
  await executeModalWorkflow({...draft.providerConfig,limits:{max_input_files:2}},{dynamicParams:{tracks:sources}},"nullable",f.repository,{client:f.client});
  expect(f.client.upload).toHaveBeenCalledTimes(2);
  expect(f.client.upload.mock.calls.map(call=>call[0])).toEqual([sources[0],sources[2]]);
  const posted=JSON.parse(f.client.json.mock.calls.find(([,init])=>init?.method==="POST")![1]!.body as string);
  expect(posted.inputs.tracks).toEqual(["audio-a.wav",null,"audio-c.wav"]);
  f.client.upload.mockClear();
  await executeModalWorkflow(draft.providerConfig,{dynamicParams:{tracks:sources}},"nullable",f.repository,{client:f.client});
  expect(f.client.upload).not.toHaveBeenCalled();
 });
 it("keeps Graph file sortOrder slots for nullable arrays and compacts ordinary arrays",()=>{
  const nullable=buildModalModelDraft(workflow({tracks:{type:"array",maxItems:3,items:{anyOf:[{type:"string",format:"comfy-input-name","x-media":"audio"},{type:"null"}]}}}));
  const assets=[{portId:"audio-field-tracks",url:"https://files/third.wav",sortOrder:2}];
  expect((generationPayload(nullable,{fileInputs:fileInputsFromAssets(assets)}) as {dynamicParams:unknown}).dynamicParams).toEqual({tracks:[null,null,assets[0].url]});
  const ordinary=buildModalModelDraft(workflow({tracks:{type:"array",maxItems:3,items:{type:"string",format:"comfy-input-name","x-media":"audio"}}}));
  expect((generationPayload(ordinary,{fileInputs:fileInputsFromAssets(assets)}) as {dynamicParams:unknown}).dynamicParams).toEqual({tracks:[assets[0].url]});
 });

 it("publishes input and advanced conditional groups with the same defaults and names as execution",()=>{
  const raw=workflow({mode:{type:"string",enum:["plain","mask"],default:"plain"},mask:{type:["string","null"],default:null}});
  Object.assign(raw.input_schema,{if:{properties:{mode:{const:"mask"}},required:["mode"]},then:{properties:{mask:{type:"string",minLength:1}},required:["mask"]}});
  const advanced={...empty,properties:{enabled:{type:"boolean",default:false},cfg:{type:"number",default:1}},if:{properties:{enabled:{const:true}},required:["enabled"]},then:{properties:{cfg:{minimum:2}}}};
  const draft=buildModalModelDraft({...raw,advanced_schema:advanced});
  const model={...draft,id:"group-model",createdAt:new Date(),updatedAt:new Date(),isActive:true,isDefault:false};
  const external=getExternalModelInput(model),validate=new Ajv2020({strict:false}).compile(external.inputSchema);
  for(const [input,valid] of [[{},true],[{mode:"mask"},false],[{mode:"mask",mask:"foreground"},true],[{advanced__enabled:true},false],[{advanced__enabled:true,advanced__cfg:2},true],[{advanced__cfg:2,mode:"plain"},true]] as const) {
   expect(validate(input),JSON.stringify(input)).toBe(valid);
   if(valid)expect(()=>external.parse(input)).not.toThrow();else expect(()=>external.parse(input)).toThrow();
  }
 });
 it("preserves x-* keys inside object const, enum and default values",()=>{
  const value={"x-mode":"original"};
  const raw=workflow({options:{type:"object",properties:{"x-mode":{type:"string"}},required:["x-mode"],additionalProperties:false,const:value,enum:[value],default:value,"x-ui":"annotation"}});
  const contract=modalInputContract(raw);
  expect(gradioInputValues(contract,{})).toEqual({options:value});
  expect(()=>gradioInputValues(contract,{dynamicParams:{options:{"x-mode":"changed"}}})).toThrow();
  expect(raw.input_schema.properties.options).toMatchObject({const:value,default:value,enum:[value]});
 });
 it("preserves the declared schema dialect and nullable file branches",()=>{
  const raw=workflow({options:{type:"object",properties:{value:{type:"integer"}},unevaluatedProperties:false,default:{value:1}},source:{anyOf:[image,{type:"null"}],default:null}});
  Object.assign(raw.input_schema,{$schema:"https://json-schema.org/draft/2020-12/schema"});
  const contract=modalInputContract(raw);
  expect(contract.inputs.find(f=>f.name==="source")).toMatchObject({kind:"file",nullable:true,media:"image"});
  expect(gradioInputValues(contract,{})).toEqual({options:{value:1},source:null});
  expect(()=>gradioInputValues(contract,{dynamicParams:{options:{value:1,extra:2}}})).toThrow();
 });
 it("validates allocated Volume filename constraints after upload and before POST",async()=>{
  const draft=buildModalModelDraft(workflow({source:{...image,pattern:"^upload-.*\\.png$",enum:["upload-source.png"]}},["source"]));
  const f=fixture();f.client.upload.mockResolvedValue("upload-source.png");
  const payload={dynamicParams:{source:"https://files/source.png"}};
  expect(gradioInputValues(getGradioContract(draft)!,payload)).toEqual(payload.dynamicParams);
  await executeModalWorkflow(draft.providerConfig,payload,"wire-valid",f.repository,{client:f.client});
  const invalid=fixture();invalid.client.upload.mockResolvedValue("wrong.jpg");
  await expect(executeModalWorkflow(draft.providerConfig,payload,"wire-invalid",invalid.repository,{client:invalid.client})).rejects.toThrow("MODAL_WIRE_INPUT_INVALID");
  expect(invalid.client.json.mock.calls.some(([,init])=>init?.method==="POST")).toBe(false);
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
 it("passes a frozen administrator default through the actual image adapter and executor",async()=>{
  const draft=buildModalModelDraft(workflow({seed:{type:"integer",default:2,minimum:0,maximum:100}}));
  draft.parameters={seed:{ui:"input",default:77,label:"Seed"}};
  const model={...draft,id:"frozen-adapter",createdAt:new Date(),updatedAt:new Date(),isActive:true,isDefault:false};
  vi.mocked(getModelCatalog).mockResolvedValue([model]);
  const stored=await snapshotRequest("image",{model:draft.key,prompt:""});
  model.parameters={seed:{ui:"input",default:99}};
  const frozen=frozenExecutionModel(stored,"image",draft.key)!;
  const f=fixture(),original=executeModalWorkflow;
  f.client.download.mockResolvedValue({buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64"),contentType:"image/png",bytes:68});
  const spy=vi.spyOn(await import("./executor"),"executeModalWorkflow").mockImplementation((config,payload,id)=>original(config,payload,id,f.repository,{client:f.client}));
  try {
   const {modalComfyImageAdapter}=await import("@/server/image-generation/adapters/modal-comfyui-adapter");
   const output=await modalComfyImageAdapter.generate({model:draft.key,prompt:"",dynamicParams:stored.dynamicParams as Record<string,unknown>} as Parameters<typeof modalComfyImageAdapter.generate>[0],{requestId:"frozen",executionModel:frozen});
   const posted=JSON.parse(f.client.json.mock.calls.find(([,init])=>init?.method==="POST")![1]!.body as string);
   expect(posted.inputs.seed).toBe(77);
   expect(output.meta).toMatchObject({width:1,height:1});
  } finally {spy.mockRestore();}
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
  expect((await executeModalWorkflow(draft.providerConfig,payload,"request",f.repository,{client:f.client})).outputs.map(output=>output.buffer.toString())).toEqual(["final-id"]);
  expect(f.client.upload.mock.calls.map(c=>c[1])).toEqual(["image","image","video","video"]);
  const submitted=JSON.parse(f.client.json.mock.calls.find(c=>c[1]?.method==="POST")![1]!.body as string);
  expect(submitted.inputs.clips).toEqual(["video-a.mp4","video-b.mp4"]);
  expect(submitted).not.toHaveProperty("execution");
  expect(f.client.download).toHaveBeenCalledExactlyOnceWith("job","final-id","image",expect.any(Number));
  expect(()=>gradioInputValues(getGradioContract(draft)!,generationPayload(draft,{initImages:[assets[0].url]})!)).toThrow();
 });
 it("uses a stable id-only asset reference while excluding previews",async()=>{
  const draft=buildModalModelDraft(workflow());
  const f=fixture();f.client.json.mockImplementation(async(path,init)=>path.endsWith("/assets")?{job_id:"job",assets:[{output_key:"images",id:"preview-id",role:"preview"},{output_key:"images",id:"result-id",role:"result",media_type:"image"}],pagination:{has_more:false}}:{id:"job",status:init?.method==="POST"?"pending":"completed"});
  expect((await executeModalWorkflow(draft.providerConfig,{},"stable-id",f.repository,{client:f.client})).outputs.map(output=>output.buffer.toString())).toEqual(["result-id"]);
  expect(f.client.download).toHaveBeenCalledExactlyOnceWith("job","result-id","image",expect.any(Number));
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
