import { findBuiltinPromptPreset } from "@/shared/prompt-presets/builtin-prompt-presets";
import {beforeEach, afterEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(()=>({session:vi.fn(), find:vi.fn(), remove:vi.fn(),files:vi.fn(),remote:vi.fn(),asset:vi.fn(),catalog:vi.fn()}));
vi.mock("@/server/media-assets/media-asset-service",()=>({mediaAssetService:{get:mocks.asset}}));
vi.mock("@/server/model-catalog/catalog-service",()=>({getModelCatalog:mocks.catalog}));
vi.mock("@/server/auth/session",()=>({getSession:mocks.session}));
vi.mock("@/server/db/prisma",()=>({prisma:{imageGeneration:{findFirst:mocks.find,deleteMany:mocks.remove},mediaOperation:{findFirst:mocks.find,deleteMany:mocks.remove},videoGeneration:{findFirst:mocks.find,deleteMany:mocks.remove},audioGeneration:{findFirst:mocks.find,deleteMany:mocks.remove}}}));
vi.mock("@/server/history/delete-history-files",()=>({deleteHistoryFiles:mocks.files}));
vi.mock("@/server/http/safe-remote",()=>({requestRemoteStream:mocks.remote}));
import {GET, DELETE} from "./route";
import { historyRequestSettings } from "@/server/history/history-authoring-references";

it("reads edit inputs and settings from the common owned detail without projecting the operation kind into a prompt", async () => {
  const asset = { id: "source", status: "completed", type: "video", storageUrl: "https://cdn.example/source.mp4", legacyUrl: null };
  mocks.find.mockResolvedValue({ id: "edit", ownerEmail: "owner@example.com", type: "edit.video.trim", status: "completed",
    configVersion: 1, parameters: { startMs: 0, endMs: 5000, stripAudio: false }, createdAt: new Date(0), updatedAt: new Date(2000), finishedAt: new Date(2000),
    inputs: [{ assetId: "source", portId: "video", sortOrder: 0, asset }],
    outputs: [{ ...asset, id: "output", width: 576, height: 768, durationMs: 5184, imageVariants: null }],
  });
  const response = await GET(new Request("http://localhost/api/history/edit?type=video&origin=edit&view=detail"), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ prompt: "", operation: { type: "edit.video.trim", configVersion: 1 },
    requestParameters: { startMs: 0, endMs: 5000, stripAudio: false },
    inputMedia: [{ assetId: "source", type: "video", role: "video", sortOrder: 0 }], inputVideos: [asset.storageUrl],
    assets: [{ durationSec: 5.184 }],
  });
  expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerEmail: "owner@example.com" }) }));
  mocks.find.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/history/edit?type=video&origin=edit&view=detail"), context)).status).toBe(404);
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("filters a legacy primary text alias through the model role instead of a field-name exception", async () => {
  const providerConfig = { gradio_contract: { version: 1, apiName: "/generate", inputs: [{
    name: "narration", label: "Narration", kind: "string", canonical: "prompt", schema: { type: "string" }, required: true, nullable: false,
  }], output: { media: "audio", path: [0], multiple: false }, diagnostics: [], reviewed: true } };
  expect(await historyRequestSettings("audio", "m", { executionModel: { parameters: {}, providerConfig },
    requestSettings: { narration: "spoken script", speed: 1, api_key: "SECRET" } })).toEqual({ speed: 1 });
});
import { composeCinemaPrompt } from "@/shared/cinema/cinema-prompt";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
const context={params:Promise.resolve({historyId:"request-1"})};
it("returns only the owned authoring projection without downloading media or exposing the full snapshot", async () => {
 const cinema = composeCinemaPrompt("source", { ...defaultCinemaSettings(), lighting: "window" }, "image");
 mocks.find.mockResolvedValue({id:"record-1",prompt:cinema.finalPrompt,modelKey:"model",requestParams:{cinema,executionModel:{providerConfig:{token:"PRIVATE"}},inputAssets:[{assetId:"input"}]},images:[]});
 const response = await GET(new Request("http://localhost/api/history/request-1?type=image&view=authoring"),context);
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({cinema,inputPrompt:"source",promptPreset:null,prompt:cinema.finalPrompt,model:"model",references:[],options:[]});
 expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:{requestId:"request-1",ownerEmail:"owner@example.com"}}));
 expect(mocks.remote).not.toHaveBeenCalled();
 mocks.find.mockResolvedValue(null);
 expect((await GET(new Request("http://localhost/api/history/request-1?type=image&view=authoring"),context)).status).toBe(404);
 mocks.session.mockResolvedValue({isLoggedIn:false});
 expect((await GET(new Request("http://localhost/api/history/request-1?type=image&view=authoring"),context)).status).toBe(401);
});
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({isLoggedIn:true,adminEmail:"owner@example.com"});mocks.catalog.mockResolvedValue([]);});
afterEach(()=>vi.unstubAllGlobals());
it("restores saved mapped options including zero/false/advanced inputs without exposing secrets or file values",async()=>{
 const fields=[{name:"prompt",label:"Prompt",kind:"string",canonical:"prompt",schema:{type:"string"},required:true,nullable:false},{name:"width",label:"Width",kind:"number",schema:{type:"integer"},required:false,nullable:false},{name:"seed",label:"Seed",kind:"number",schema:{type:"integer"},required:false,nullable:false},{name:"advanced__enabled",label:"Enabled",kind:"boolean",schema:{type:"boolean"},required:false,nullable:false},{name:"image",label:"Image",kind:"file",media:"image",schema:{},required:false,nullable:true},{name:"api_key",label:"Key",kind:"string",schema:{type:"string"},required:false,nullable:false},{name:"notes",label:"Notes",kind:"json",schema:{type:"object"},required:false,nullable:false}];
 const providerConfig={token:"PRIVATE",gradio_contract:{version:1,apiName:"/generate",inputs:fields,output:{media:"image",path:[0],multiple:false},diagnostics:[],reviewed:true}};
 mocks.find.mockResolvedValue({id:"r",prompt:"saved",modelKey:"m",images:[],requestParams:{executionModel:{parameters:{},providerConfig},seed:0,dynamicParams:{prompt:"saved",width:768,advanced__enabled:false,image:null,api_key:"SECRET",notes:{password:"SECRET"}}}});
 const response=await GET(new Request("http://localhost/api/history/r?type=image&view=authoring"),context);
 expect(response.status).toBe(200);
 const body=await response.json();
 expect(body.options).toEqual([{field:"dynamicParams.width",value:768},{field:"dynamicParams.seed",value:0},{field:"dynamicParams.advanced__enabled",value:false}]);
 expect(body).not.toHaveProperty("executionModel");expect(JSON.stringify(body)).not.toContain("PRIVATE");expect(JSON.stringify(body)).not.toContain("SECRET");
});
it("normalizes legacy v2 option fields and keeps an omitted seed absent",async()=>{
 const model=runtimeImageModelsFixture.find(m=>m.key==="flux2-klein-9b")!;
 mocks.catalog.mockResolvedValue([model]);
 mocks.find.mockResolvedValue({id:"r",prompt:"saved",modelKey:model.key,images:[],requestParams:{requestVersion:2,model:model.key,dynamicParams:{"hf:width":768,"hf:seed":null,"hf:promptUpsampling":false},parameterDefinitions:[{key:"hf:width",inputKey:"width",target:"top"},{key:"hf:seed",inputKey:"seed",target:"top"},{key:"hf:promptUpsampling",inputKey:"promptUpsampling",target:"top"}]}});
 const response=await GET(new Request("http://localhost/api/history/r?type=image&view=authoring"),context);
 expect(response.status).toBe(200);
 expect((await response.json()).options).toEqual(expect.arrayContaining([{field:"width",value:768},{field:"promptUpsampling",value:false}]));
 const second=await GET(new Request("http://localhost/api/history/r?type=image&view=authoring"),context);
 expect((await second.json()).options).not.toEqual(expect.arrayContaining([expect.objectContaining({field:"seed"})]));
});
it("resolves durable references under the record owner in original field order without exposing secrets", async()=>{
 mocks.find.mockResolvedValue({id:"r",prompt:"source",modelKey:"m",videos:[],requestParams:{dynamicParams:{prompt:"source",token:"SECRET"},executionModel:{providerConfig:{token:"SECRET"}},inputAssets:[{field:"dynamicParams.reference_images",assetId:"second",sortOrder:1,multiple:true},{field:"dynamicParams.reference_images",assetId:"first",sortOrder:0,multiple:true}]}});
 mocks.asset.mockImplementation(async(owner,id)=>({type:"image",url:"https://storage.example/"+id+".png"}));
 const response=await GET(new Request("http://localhost/api/history/r?type=video&view=authoring"),context);
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({cinema:null,inputPrompt:"source",promptPreset:null,prompt:"source",model:"m",options:[],references:[{field:"dynamicParams.reference_images",media:"image",multiple:true,urls:["https://storage.example/first.png","https://storage.example/second.png"]}]});
 expect(mocks.asset.mock.calls.map(args=>args.slice(0,2))).toEqual([["owner@example.com","first"],["owner@example.com","second"]]);
 expect(mocks.remote).not.toHaveBeenCalled();
 mocks.asset.mockRejectedValueOnce(new Error("MEDIA_ASSET_NOT_FOUND"));
 expect((await GET(new Request("http://localhost/api/history/r?type=video&view=authoring"),context)).status).toBe(404);
});
it.each([["image","initImages",["https://storage.example/a.png","https://storage.example/b.png"],true],["video","initImage","https://storage.example/a.png",false],["audio","inputAudio","https://storage.example/a.wav",false]])("restores legacy %s file inputs",async(type,field,value,multiple)=>{
 mocks.find.mockResolvedValue({id:"r",prompt:"source",modelKey:"m",images:[],videos:[],audios:[],requestParams:{[field as string]:value}});
 const response=await GET(new Request("http://localhost/api/history/r?type="+type+"&view=authoring"),context);
 expect(response.status).toBe(200);
 expect((await response.json()).references).toEqual([{field,media:type==="audio"?"audio":"image",multiple,urls:Array.isArray(value)?value:[value]}]);
});
it("projects only declared legacy dynamic file inputs",async()=>{
 const contract={version:1,apiName:"/generate",inputs:[{name:"references",label:"References",kind:"files",media:"image",schema:{type:"array"},required:false,nullable:true}],output:{media:"image",path:[0],multiple:false},diagnostics:[],reviewed:true};
 mocks.find.mockResolvedValue({id:"r",prompt:"source",modelKey:"m",images:[],requestParams:{executionModel:{providerConfig:{gradio_contract:contract}},dynamicParams:{references:["https://storage.example/a.png"],secret_url:"https://private.example/token"}}});
 const response=await GET(new Request("http://localhost/api/history/r?type=image&view=authoring"),context);
 expect(response.status).toBe(200);
 expect((await response.json()).references).toEqual([{field:"dynamicParams.references",media:"image",multiple:true,urls:["https://storage.example/a.png"]}]);
});
it("streams the owned original as an attachment and rejects unknown owners",async()=>{
 mocks.find.mockResolvedValue({id:"record-1",images:[{url:"https://storage.example/original.png"}]});
 mocks.remote.mockResolvedValue({status:200,headers:{"content-type":"image/png"},body:new Response("original-bytes").body});
 const response=await GET(new Request("http://localhost/api/history/request-1?type=image"),context);
 expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="leesfield-image.png"');expect(await response.text()).toBe("original-bytes");
 expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:{requestId:"request-1",ownerEmail:"owner@example.com"}}));
 expect(mocks.remote.mock.calls[0][0]).toBe("https://storage.example/original.png");
 mocks.find.mockResolvedValue(null);expect((await GET(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(404);expect(mocks.remote).toHaveBeenCalledTimes(1);
});
it("requires login and filters active jobs from deletion",async()=>{
 mocks.session.mockResolvedValue({isLoggedIn:false});expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(401);expect(mocks.remove).not.toHaveBeenCalled();
 mocks.session.mockResolvedValue({isLoggedIn:true,adminEmail:"owner@example.com"});mocks.find.mockResolvedValue({id:"record-1",images:[]});mocks.remove.mockResolvedValue({count:0});
 expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(409);
 expect(mocks.remove).toHaveBeenCalledWith({where:{id:"record-1",ownerEmail:"owner@example.com",status:{notIn:["pending","processing","uploading"]}}});
 mocks.remove.mockResolvedValue({count:1});expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(204);
});
it("deletes an edit record after deleting its stored files",async()=>{
 mocks.find.mockResolvedValue({id:"operation-1",outputs:[{storageUrl:"https://storage.example/source.webp"}]});mocks.remove.mockResolvedValue({count:1});
 expect((await DELETE(new Request("http://localhost/api/history/operation-1?type=image&origin=edit"),context)).status).toBe(204);
 expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:{id:"request-1",ownerEmail:"owner@example.com",outputs:{some:{type:"image"}}}}));
});

it("keeps history when file deletion fails",async()=>{mocks.find.mockResolvedValue({id:"r",status:"completed",images:[{id:"i",url:"https://storage.example/a"}]});mocks.files.mockRejectedValueOnce(new Error("storage down"));expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(502);expect(mocks.remove).not.toHaveBeenCalled();});

it.each([["typed text", "typed text"], ["", ""], [undefined, null]])("returns separate typed text for preset history (%s)", async (inputPrompt, expected) => {
  mocks.find.mockResolvedValue({ id: "record", prompt: "preset body plus typed text", modelKey: "model", images: [],
    requestParams: { promptPreset: { key: "preset" }, ...(inputPrompt !== undefined ? { inputPrompt } : {}) } });
  const response = await GET(new Request("http://localhost/api/history/request-1?type=image&view=authoring"), context);
  expect((await response.json()).inputPrompt).toBe(expected);
});

it("restores exact versioned builtin preset text and exposes a chip without the expanded body", async () => {
  const preset = findBuiltinPromptPreset("multi-camera-nine-grid")!;
  mocks.find.mockResolvedValue({id:"record",prompt:preset.prompt+"\n\n 개 대신 고양이로",modelKey:"model",images:[],requestParams:{promptPreset:{key:preset.key,revision:preset.revision,builtinRevision:1,requiredInputs:preset.requiredInputs,recommendedParameters:preset.recommendedParameters}}});
  const response = await GET(new Request("http://localhost/api/history/request-1?type=image&view=authoring"),context);
  expect(await response.json()).toMatchObject({ inputPrompt:" 개 대신 고양이로",promptPreset:{key:preset.key,name:preset.name,tokenOffset:0} });
  mocks.find.mockResolvedValue({id:"record",prompt:"changed body\n\ntyped text",modelKey:"model",images:[],requestParams:{promptPreset:{key:preset.key,revision:preset.revision,builtinRevision:1,requiredInputs:preset.requiredInputs,recommendedParameters:preset.recommendedParameters}}});
  const changed = await GET(new Request("http://localhost/api/history/request-1?type=image&view=authoring"),context);
  expect((await changed.json()).inputPrompt).toBeNull();
});
it("keeps custom preset names, token positions, and preset-only empty user text frozen",async()=>{
  const preset={key:"my-preset",revision:7,requiredInputs:{referenceImageCount:0},recommendedParameters:{}};
  for (const text of ["before after", ""]) {
    const tokenOffset = text ? 7 : 0;
    mocks.find.mockResolvedValue({id:"record",prompt:"provider expanded prompt",modelKey:"model",images:[],requestParams:{inputPrompt:text,promptPreset:preset,promptPresetState:{name:"My frozen preset",appliedPrompt:"frozen body",userText:text,tokenOffset}}});
    const response=await GET(new Request("http://localhost/api/history/request-1?type=image&view=authoring"),context);
    expect(await response.json()).toMatchObject({inputPrompt:text,promptPreset:{key:preset.key,name:"My frozen preset",tokenOffset}});
  }
});
