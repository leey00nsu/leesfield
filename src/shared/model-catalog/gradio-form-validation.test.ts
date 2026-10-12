
import { describe, expect, it } from "vitest";
import { gradioFormError, gradioFormMessage, gradioFieldLabel } from "./gradio-form-validation";
import { fileFieldMaxItems } from "./gradio-contract";
import { declaredFileCount } from "./file-input-limits";
import type { GradioContract } from "./gradio-contract";
import { modalInputContract } from "./modal-comfyui-contract";
const contract: GradioContract = {
 version: 1, apiName: "/generate", reviewed: false, diagnostics: [],
 output: {media: "video", path: [0], multiple: false},
 inputs: [
  {name: "in_0", label: "Prompt", schema: {type: "string"}, kind: "string", canonical: "prompt", required: true, nullable: false},
  {name: "in_1", label: "First Frame (optional)", schema: {}, kind: "file", required: true, nullable: false},
  {name: "count", label: "Count", schema: {type: "number"}, kind: "number", required: true, nullable: false, min: 0},
  {name: "flag", label: "Flag", schema: {type: "boolean"}, kind: "boolean", required: true, nullable: false},
 ],
};
describe("generation readiness", () => {
 it("uses media and role metadata for localized labels while preserving unfamiliar roles",()=>{
  const image={...contract.inputs[1],media:"image" as const,label:"References (optional, up to 6)",kind:"files" as const};
  expect(gradioFieldLabel(image,"ko")).toBe("참조 이미지");
  expect(gradioFieldLabel({...image,name:"another_provider_field"},"en")).toBe("Reference images");
  expect(gradioFieldLabel({...image,label:"First frame"},"ko")).toBe("시작 프레임");
  expect(gradioFieldLabel({...image,label:"First frame",schema:{"x-input-role":"end_frame"}},"en")).toBe("End frame");
  expect(gradioFieldLabel({...image,label:"Character identity (optional)"},"ko")).toBe("참조 이미지 · Character identity");
  expect(gradioFieldLabel({...image,name:"reference_video_audios",media:"audio",label:"reference_video_audios"},"ko")).toBe("영상별 오디오");
  expect(image.label).toBe("References (optional, up to 6)");
 });
 it("honors structural limits first and reads only explicit bounded file-count declarations",()=>{
  const field={...contract.inputs[1],kind:"files" as const,label:"References (optional, up to 6)"};
  expect(fileFieldMaxItems(field)).toBe(6);
  expect(fileFieldMaxItems({...field,schema:{maxItems:9}})).toBe(9);
  expect(fileFieldMaxItems({...field,label:"Edited label",fileLimit:6})).toBe(6);
  expect(fileFieldMaxItems({...field,kind:"file"})).toBe(1);
  expect(declaredFileCount("Upload (up to 3 videos)")).toBe(3);
  for(const label of ["720p 6 seconds", "6 MB", "Model 6", "Images (optional, up to 0)", "Images (up to 65)", "Images (up to 9007199254740993)"]){
   expect(declaredFileCount(label)).toBeUndefined();
   expect(fileFieldMaxItems({...field,label})).toBe(8);
  }
 });
 it("accepts promptless Modal while preserving required values and declared empty semantics", () => {
  const empty={type:"object",properties:{},required:[],additionalProperties:false};
  const promptless=modalInputContract({id:"seed-only",name:"Seed only",category:"image",output_media:["image"],input_schema:{...empty,properties:{seed:{type:"integer",default:0}}},advanced_schema:empty});
  expect(gradioFormError(promptless,{})).toBeNull();
  const strings={...promptless,inputGroups:undefined,inputs:[{name:"text",label:"Text",kind:"string" as const,schema:{type:"string"},required:true,nullable:false,allowEmpty:true,default:""}]};
  expect(gradioFormError(strings,{})).toBeNull();
  expect(gradioFormError({...strings,inputs:[{...strings.inputs[0],schema:{type:"string",minLength:1}}]},{})).not.toBeNull();
 });
 it("requires a frame and accepts zero and false without a review gate", () => {
  const values={prompt: "hello", dynamicParams: {count: 0, flag: false}};
  const error=gradioFormError(contract,values)!;
  expect(error).toBe("HF_CONTRACT_REQUIRED:in_1");
  expect(gradioFormMessage(error,contract,"ko")).toBe("참조 파일 · First Frame: 필수 입력입니다.");
  expect(gradioFormMessage(error,contract,"en")).toBe("Reference files · First Frame: This field is required.");
  expect(gradioFormError(contract,{...values,dynamicParams:{...values.dynamicParams,in_1:"https://example.com/frame.png"}})).toBeNull();
 });
 it("rejects blank prompt, wrong values and unsupported mappings", () => {
  const values={prompt:" ",dynamicParams:{in_1:"https://example.com/frame.png",count:0,flag:false}};
  expect(gradioFormError(contract,values)).toBe("HF_CONTRACT_REQUIRED:in_0");
  expect(gradioFormError(contract,{...values,prompt:"hello",dynamicParams:{...values.dynamicParams,count:-1}})).toBe("HF_CONTRACT_RANGE:count");
  const error=gradioFormError({...contract,output:null},values)!;
  expect(gradioFormMessage(error,contract,"ko")).not.toContain("HF_CONTRACT");
 });
});
