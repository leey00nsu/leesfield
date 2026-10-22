import {describe,it,expect,vi} from "vitest";
import {createElement} from "react";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test-utils/intl";
import {GradioContractFields} from "@/shared/ui/gradio-contract-fields";
import {GenerationNodeParameterControls} from "@/features/node-studio/ui/nodes/generation-node-parameter-controls";
vi.mock("@/server/model-catalog/catalog-service",()=>({getModelCatalog:vi.fn()}));
import {getModelCatalog} from "@/server/model-catalog/catalog-service";
import {validateImageGenerationPayload,validateVideoGenerationPayload} from "@/server/model-catalog/generation-validation";
import {buildModalModelDraft} from "./importer";
import workflows from "./fixtures/workflows.json";
import {modelCatalogSchema} from "@/server/model-catalog/catalog-schema";
import {areGenerationNodeParametersValid} from "@/features/node-studio/model/generation-node-parameter-validation";
import {projectGenerationModelSelectionDefaults} from "@/features/node-studio/model/generation-model-selection-defaults";
import type {RuntimeImageModel} from "@/shared/model-catalog/runtime-utils";
import {resolveNodeRunReadiness} from "@/features/node-studio/model/node-run-readiness";
import {getGradioContract} from "@/shared/model-catalog/gradio-contract";
describe("Modal graph input mapping",()=>{
 it("keeps multiple and custom contract values editable in native controls",()=>{
  const draft=buildModalModelDraft(workflows[0]);
  const contract={...getGradioContract(draft)!,inputs:[
    {name:"tags",label:"tags",kind:"json" as const,choiceMode:"multiple" as const,choices:[1,"two"],default:[1],schema:{},required:false,nullable:false},
    {name:"custom",label:"custom",kind:"string" as const,choiceMode:"single" as const,allowCustomValue:true,choices:["listed"],default:"new",schema:{},required:false,nullable:false},
  ]};
  const change=vi.fn();
  renderWithIntl(createElement(GradioContractFields,{contract,values:{tags:[1],custom:"new"},prompt:"",onChange:change}));
  expect(screen.getByRole("checkbox",{name:"1"})).toBeChecked();
  fireEvent.click(screen.getByRole("checkbox",{name:"two"}));
  expect(change).toHaveBeenLastCalledWith({tags:[1,"two"],custom:"new"});
  const custom=screen.getByRole("textbox",{name:"custom 직접 입력"});
  expect(custom).toHaveValue("new");
  fireEvent.change(custom,{target:{value:"unlisted"}});
  expect(change).toHaveBeenLastCalledWith({tags:[1,"two"],custom:"unlisted"});
 });
 it("allows a source-contract model with no prompt and exposes JSON controls",async()=>{
  const source=structuredClone(workflows[0]);
  source.id="new-promptless-workflow";
  source.input_schema={type:"object",properties:{options:{type:"object",properties:{count:{type:"integer"}},default:{count:2}}},required:[],additionalProperties:false} as unknown as typeof source.input_schema;
  const model={...buildModalModelDraft(source),isActive:true,isDefault:false} as RuntimeImageModel;
  const graph={nodes:[{id:"n",kind:"generate.image",position:{x:0,y:0},configVersion:1,selectedOutputAssetId:null,config:{prompt:"",modelKey:model.key,parameters:{}}}],edges:[]};
  expect(resolveNodeRunReadiness(graph,"n",{imageModels:[model]}).reasons).toEqual([]);
  expect(getGradioContract(model)?.inputs.some(field=>field.canonical==="prompt")).toBe(false);
  renderWithIntl(createElement(GenerationNodeParameterControls,{model,values:{},disabled:false,onChange:vi.fn()}));
  expect(screen.getByRole("textbox",{name:"options"})).toHaveValue(JSON.stringify({count:2},null,2));
 });
 for(const id of ["krea2-identity-edit","minimax-h3-lightx2v-i2v"]) it(id+" accepts numeric node seed without weakening seed validation",async()=>{
  const draft=buildModalModelDraft(workflows.find(w=>w.id===id));
  const model=modelCatalogSchema.parse([{...draft,id:"m",createdAt:new Date(),updatedAt:new Date(),isActive:true,isDefault:false}])[0];
  vi.mocked(getModelCatalog).mockResolvedValue([model]);
  const validate=draft.type==="image"?validateImageGenerationPayload:validateVideoGenerationPayload;
  const payload={model:draft.key,prompt:"change tomatoes to apples",seed:2,width:512,height:512,steps:8,...(draft.type==="image"?{initImages:["https://example.com/reference.png"]}:{initImage:"https://example.com/reference.png"})};
  const result=await validate(payload);
  expect(result.success,result.success?undefined:JSON.stringify(result.error.issues)).toBe(true);
  if(result.success) {
   expect(result.data).not.toHaveProperty("seed");
   expect(result.data.dynamicParams).toMatchObject({seed:2,[draft.type==="image"?"image":"first_frame"]:"https://example.com/reference.png"});
  }
  expect((await validate({...payload,seed:1.5})).success).toBe(false);
  expect((await validate({...payload,seed:Number.MAX_SAFE_INTEGER+1})).success).toBe(false);
 });
 it("renders imported advanced bounds and choices in the native parameter controls",()=>{
  const model={...buildModalModelDraft(workflows[0]),isActive:true,isDefault:false} as RuntimeImageModel;
  const contract=getGradioContract(model)!;
  expect(contract.inputs.find(field=>field.name==="advanced__sampler")?.choices).toContain("euler");
  renderWithIntl(createElement(GenerationNodeParameterControls,{model,values:{},disabled:false,onChange:vi.fn()}));
  expect(screen.getByRole("spinbutton",{name:/seed/i})).toHaveAttribute("max",String(Number.MAX_SAFE_INTEGER));
  expect(screen.getByRole("combobox",{name:/sampler/i})).toBeEnabled();
 });
 for(const id of ["krea2-identity-edit","minimax-h3-lightx2v-i2v"]) it(id+" maps resolved asset and advanced controls",async()=>{
  const draft=buildModalModelDraft(workflows.find(w=>w.id===id));
  const model=modelCatalogSchema.parse([{...draft,id:"m",createdAt:new Date(),updatedAt:new Date(),isActive:true,isDefault:false}])[0];
  vi.mocked(getModelCatalog).mockResolvedValue([model]);
  const image="data:image/png;base64,aGVsbG8=";
  const validate=draft.type==="image"?validateImageGenerationPayload:validateVideoGenerationPayload;
  const result=await validate({model:draft.key,prompt:"x",...(draft.type==="image"?{initImages:[image]}:{initImage:image}),dynamicParams:{advanced__sampler:"euler"}});
  expect(result.success).toBe(true);
  if(result.success) expect(result.data.dynamicParams).toMatchObject({[draft.type==="image"?"image":"first_frame"]:image,advanced__sampler:"euler"});
 });
 it("keeps Modal node defaults and validates advanced settings without requiring asset bytes",()=>{
  const model={...buildModalModelDraft(workflows[0]),isActive:true,isDefault:false} as RuntimeImageModel;
  const next=projectGenerationModelSelectionDefaults({}, {modelKey:model.key,parameters:{}}, [model]);
  const params=next.parameters as Record<string,unknown>;
  expect(params).toMatchObject({advanced__cfg:1});
  expect(areGenerationNodeParametersValid(model,params)).toBe(true);
  expect(areGenerationNodeParametersValid(model,{...params,advanced__cfg:-1})).toBe(false);
 });
 it("requires an image edge for identity edit",()=>{
  const model={...buildModalModelDraft(workflows[1]),isActive:true,isDefault:false} as RuntimeImageModel;
  const graph={nodes:[{id:"n",kind:"generate.image",position:{x:0,y:0},configVersion:1,selectedOutputAssetId:null,config:{prompt:"x",modelKey:model.key,parameters:{}}}],edges:[]};
  expect(resolveNodeRunReadiness(graph,"n",{imageModels:[model]}).reasons).toContain("INPUT_REQUIRED");
 });
});
