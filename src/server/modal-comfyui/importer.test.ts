import { describe, it, expect, vi } from "vitest";
vi.mock("@/server/model-catalog/catalog-service",()=>({getModelCatalog:vi.fn()}));
import workflows from "./fixtures/workflows.json";
import { buildModalModelDraft } from "./importer";
import { modalInputContract, modalConfigSchema } from "@/shared/model-catalog/modal-comfyui-contract";
import { gradioInputValues, getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { modelCatalogSchema, modelCatalogInputSchema } from "@/server/model-catalog/catalog-schema";
import { getExternalModelInput } from "@/server/external-api/model-input";

describe("Modal managed workflow contract (external API 1.3.0)",()=>{
 for (const raw of workflows.filter(w=>w.category!=="audio")) it(raw.id,()=>{
  const draft=buildModalModelDraft(raw);
  const model=modelCatalogSchema.parse([{...draft,id:"test",isActive:true,isDefault:false,createdAt:new Date(),updatedAt:new Date()}])[0];
  const contract=getGradioContract(model)!;
  const values:Record<string,unknown>={prompt:"A mountain"};
  for(const field of contract.inputs) if(field.kind==="file" && field.required) values[field.name]="data:image/png;base64,aGVsbG8=";
  const external=getExternalModelInput(model);
  expect(external.parse(values).dynamicParams).toMatchObject({prompt:"A mountain"});
  expect(contract.output?.media).toBe(raw.category);
  expect(Object.keys(external.inputSchema.properties!)).toEqual(contract.inputs.map(f=>f.name));
  expect(contract.inputs.filter(f=>f.name.startsWith("advanced__")).length).toBe(Object.keys(raw.advanced_schema.properties).length);
 });
 it("rejects audio, type mismatch, arbitrary connection and unknown schema",()=>{
  for(const w of workflows.filter(w=>w.category==="audio")) expect(()=>buildModalModelDraft(w)).toThrow();
  const draft=buildModalModelDraft(workflows[0]);
  expect(modelCatalogInputSchema.safeParse({...draft,type:"audio"}).success).toBe(false);
  expect(modalConfigSchema.safeParse({...draft.providerConfig,base_url:"https://evil.test"}).success).toBe(false);
  expect(()=>modalInputContract({...workflows[0],category:"video"})).toThrow();
  const raw=structuredClone(workflows[0]);
  Object.assign(raw.input_schema.properties.prompt!,{pattern:".*"});
  expect(()=>modalInputContract(raw)).not.toThrow();
 });
 it("preserves required file, namespace, integer precision and schema bounds",()=>{
  const raw=workflows.find(w=>w.id==="krea2-identity-edit")!;
  const contract=modalInputContract(raw);
  expect(()=>gradioInputValues(contract,{prompt:"edit"})).toThrow();
  const values={prompt:"edit",image:"data:image/png;base64,aGVsbG8="};
  expect(gradioInputValues(contract,{dynamicParams:{...values,advanced__cfg:1.2}})).toMatchObject({advanced__cfg:1.2});
  for(const invalid of [{width:513},{seed:Number.MAX_SAFE_INTEGER+1},{seed:1.5},{advanced__sampler:"wrong"},{unknown:1}]) {
   expect(()=>gradioInputValues(contract,{dynamicParams:{...values,...invalid}})).toThrow();
  }
 });
});
