// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildImportContract } from "@/server/hf-space/import-contract";
import { modelCatalogInputSchema } from "@/server/model-catalog/catalog-schema";
import { getGradioContract, gradioInputValues } from "./gradio-contract";
import { gradioFormError } from "./gradio-form-validation";
import source from "@/server/hf-space/fixtures/krea-wrapper-source.json";

const nonblank={type:"string",minLength:1,pattern:"\\S"};
const input_rules={type:"object",allOf:[
 {if:{properties:{param_0:{const:"text2image"}},required:["param_0"]},then:{properties:{param_1:nonblank},required:["param_1"]}},
 {if:{properties:{param_0:{const:"edit"}},required:["param_0"]},then:{properties:{param_3:nonblank},required:["param_3"],anyOf:[{properties:{param_1:nonblank},required:["param_1"]},{properties:{param_2:nonblank},required:["param_2"]}]}},
 {if:{properties:{param_18:{const:"__custom_huggingface_base_model__"}},required:["param_18"]},then:{properties:{param_19:nonblank,param_20:nonblank},required:["param_19","param_20"]}},
]};
function model() {
 const contract=buildImportContract("/_generate_wrapper",source.endpoint,source);
 for(const f of contract.inputs) {
  if(["param_2","param_19","param_20","param_21"].includes(f.name)) Object.assign(f,{default:"",allowEmpty:true});
  if(["param_3","param_4"].includes(f.name)) Object.assign(f,{default:null,nullable:true});
  if(f.canonical) Object.assign(f,{default:"",allowEmpty:true});
 }
 return modelCatalogInputSchema.parse({type:"image",key:"configured-wrapper",label:"Configured wrapper",vendor:"HF",provider:"hf_space",providerConfig:{space_id:"Jackiesixnine/Krea-2-Turbo_v2",api_name:"/_generate_wrapper",gradio_contract:contract,input_rules},parameters:{},meta:{}});
}
describe("conditional authoring input rules",()=>{
 it("stores Krea's 41 arguments and enforces text2image/edit/custom source conditions",()=>{
  const contract=getGradioContract(modelCatalogInputSchema.parse(JSON.parse(JSON.stringify(model()))))!;
  const t2i={prompt:"portrait"};
  expect(Object.keys(gradioInputValues(contract,t2i))).toHaveLength(41);
  expect(gradioFormError(contract,t2i)).toBeNull();
  expect(gradioFormError(contract,{prompt:" "})).not.toBeNull();
  expect(gradioFormError(contract,{prompt:"portrait",dynamicParams:{param_0:"edit"}})).not.toBeNull();
  const edit={prompt:"",dynamicParams:{param_0:"edit",param_2:"recolor",param_3:"https://files.example/source.png"}};
  expect(gradioFormError(contract,edit)).toBeNull();
  expect(gradioInputValues(contract,edit).param_4).toBeNull();
  expect(gradioFormError(contract,{...edit,dynamicParams:{...edit.dynamicParams,param_2:" "}})).not.toBeNull();
  const custom={...t2i,dynamicParams:{param_18:"__custom_huggingface_base_model__"}};
  expect(gradioFormError(contract,custom)).not.toBeNull();
  expect(gradioFormError(contract,{...custom,dynamicParams:{...custom.dynamicParams,param_19:"owner/checkpoint",param_20:"model.safetensors"}})).toBeNull();
 });
 it("rejects unknown input references, remote schemas, async and unknown validation keywords at save",()=>{
  const base=model();
  for(const rules of [{type:"object",required:["typo"]},{type:"object",if:{properties:{typo:{const:1}}}},{type:"object",madeUpConstraint:true},{$async:true,type:"object"},{$ref:"https://example.com/schema"}]) {
   expect(modelCatalogInputSchema.safeParse({...base,providerConfig:{...base.providerConfig,input_rules:rules}}).success).toBe(false);
  }
 });
});
